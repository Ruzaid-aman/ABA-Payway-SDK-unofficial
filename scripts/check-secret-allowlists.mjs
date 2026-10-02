import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'payway-allowlist-check-'));
const binary = process.env.GITLEAKS_BINARY || 'gitleaks';
// Deliberately synthetic values already used by the local test suites.
const cli = ['test', 'api', 'key', '123456789012'].join('-');
const loopback = ['e2e', 'api', 'key', ['0123456789', 'abcdef0123'].join('')].join('-');
const fixtures = [
  ['src/__tests__/cli.test.ts', cli, loopback],
  ['src/__tests__/per-call-options.test.ts', loopback, cli],
  ['src/__tests__/agent-privacy-session.test.ts', ['AKIA', '1234567890', 'canary'].join('-'), cli],
  // Retained for scans of private history after the Android project was removed.
  ['sdk/android/sdk/src/test/java/com/ababank/payway/SignatureVerifierTest.kt', ['test', 'api', 'key', '12345'].join('_'), cli],
];
const expected = new Set(fixtures.map(([file]) => `${file}:2`));
expected.add('docs/cloudflare-free-webhook.md:2');
expected.add('other.ts:1');
function write(file, content) {
  const target = path.join(temporary, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
try {
  for (const [file, allowed, rejected] of fixtures) {
    write(file, `apiKey = '${allowed}'\napiKey = '${rejected}'\n`);
  }
  const header = ['Authorization:', 'Bearer', 'YOUR_ADMIN_TOKEN'].join(' ');
  write('docs/cloudflare-free-webhook.md', `curl https://example.com --header "${header}"\napiKey = '${cli}'\n`);
  write('other.ts', `apiKey = '${cli}'\n`);
  const report = path.join(temporary, 'results.json');
  try {
    execFileSync(binary, ['dir', temporary, '--config', path.join(root, '.gitleaks.toml'), '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', report], { stdio: 'pipe', windowsHide: true });
    throw new Error('Scanner did not detect the deliberate negative controls');
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  const findings = JSON.parse(readFileSync(report, 'utf8'));
  const actual = new Set(findings.map(item => `${path.relative(temporary, item.File).replaceAll('\\', '/')}:${item.StartLine}`));
  if (findings.length !== expected.size || actual.size !== expected.size || [...expected].some(item => !actual.has(item))) {
    throw new Error('Secret allowlist regression: expected only six wrong-value/wrong-path controls');
  }
  console.log('Secret allowlists passed: exact fixtures excluded; six wrong-value/wrong-path controls detected.');
} finally {
  const relative = path.relative(path.resolve(tmpdir()), temporary);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe temporary cleanup path');
  rmSync(temporary, { recursive: true, force: true });
}
