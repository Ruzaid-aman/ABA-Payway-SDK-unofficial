import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizePackReport } from './lib/pack-report.mjs';
import { navigationFailures } from './lib/public-navigation.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmArgs = ['pack', '--dry-run', '--json', '--ignore-scripts'];
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = npmExecPath ? [npmExecPath, ...npmArgs] : npmArgs;
const packed = spawnSync(command, args, {
  cwd: repositoryRoot,
  encoding: 'utf8',
  shell: !npmExecPath && process.platform === 'win32',
});

if (packed.status !== 0) {
  throw new Error(`npm pack failed:\n${packed.stderr || packed.stdout}`);
}

// npm ≤11 emits an ARRAY of pack reports; npm 12 emits an OBJECT keyed by
// package name — the shared helper normalizes both before reading `files`.
const parsedReport = JSON.parse(packed.stdout);
const report = normalizePackReport(parsedReport);
const files = report.files.map((entry) => entry.path.replaceAll('\\', '/'));
const fileSet = new Set(files);
const required = [
  'package.json',
  'README.md',
  'QUICKSTART.md',
  'CHANGELOG.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/cli.js',
  'skills/README.md',
  'knowledge/MANIFEST.json',
  'llms.txt',
];
const missing = required.filter((entry) => !fileSet.has(entry));

const forbiddenPathPatterns = [
  /(?:^|\/)src\//,
  /^scripts\//,
  /^docs\/internal\//,
  /(?:^|\/)examples\//,
  /(?:^|\/)payway-boilerplate\//,
  /(?:^|\/)(?:test-output|test-logs|audit-results|\.scratch|\.agents)\//,
  /(?:^|\/)HANDOFF\.md$/,
  /\.map$/,
  /(?:WAVE5-captures|ABA-QUESTIONS|SANDBOX-FINDINGS)\.md$/i,
  // Generated corpus filename of the retired internal dossier (audit D01/R03):
  // the topic must never return under its old name.
  /close-transaction-findings\.md$/i,
];
const forbiddenPaths = files.filter((entry) => forbiddenPathPatterns.some((pattern) => pattern.test(entry)));

const skillCount = files.filter((entry) => /^skills\/aba-payway-[^/]+\/SKILL\.md$/.test(entry)).length;
// Authoritative inventory (audit R02): compare against the repo's skills
// directory instead of a hardcoded count that goes stale on every skill wave.
const expectedSkillCount = readdirSync(path.join(repositoryRoot, 'skills'), { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && entry.name.startsWith('aba-payway-'),
).length;
const textExtensions = new Set(['.js', '.cjs', '.json', '.md', '.ts', '.cts', '.txt', '.html']);
const forbiddenContentPatterns = [
  /[A-Z]:[\\/]Users[\\/]/i,
  /[A-Z]:[\\/]Antigravity_google[\\/]/i,
  /WAVE5-captures\.md/i,
  /ABA-QUESTIONS-\d{4}-\d{2}-\d{2}\.md/i,
  /SANDBOX-FINDINGS\.md/i,
  /CLOSE-TRANSACTION-FINDINGS\.md/i,
  /HANDOFF\.md/i,
  /(?:^|[\\/])test-output[\\/]/i,
  /(?:^|[\\/])\.scratch[\\/]/i,
  /purchase-test-campaign/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const contentViolations = [];
const brokenLocalLinks = [];
for (const entry of files) {
  if (!textExtensions.has(path.extname(entry)) && path.basename(entry) !== 'LICENSE') continue;
  const absolute = path.join(repositoryRoot, ...entry.split('/'));
  if (!existsSync(absolute)) continue;
  const content = readFileSync(absolute, 'utf8');
  // Catch copyable bare npx invocations while allowing explanatory warnings
  // about the package/bin-name mismatch in README and the first-payment Skill.
  if (['.md', '.txt'].includes(path.extname(entry))) {
    for (const line of content.split('\n')) {
      if (/^\s*(?:\$\s*)?npx payway-sdk\b/.test(line)) contentViolations.push(`${entry}: bare npx payway-sdk invocation`);
      if (/payway-sdk docs[^`\n]*--search/.test(line)) contentViolations.push(`${entry}: unsupported docs --search flag`);
    }
  }
  for (const pattern of forbiddenContentPatterns) {
    if (pattern.test(content)) contentViolations.push(`${entry}: ${pattern}`);
  }
  if (['.md', '.txt'].includes(path.extname(entry))) {
    brokenLocalLinks.push(...navigationFailures(entry, content, fileSet,
      (target) => readFileSync(path.join(repositoryRoot, target), 'utf8')));
  }
}

const failures = [
  ...(missing.length ? [`Missing required files: ${missing.join(', ')}`] : []),
  ...(forbiddenPaths.length ? [`Forbidden package paths: ${forbiddenPaths.join(', ')}`] : []),
  ...(skillCount !== expectedSkillCount ? [`Expected ${expectedSkillCount} skill guides (repo inventory), found ${skillCount}`] : []),
  ...(contentViolations.length ? [`Forbidden embedded content: ${contentViolations.join(', ')}`] : []),
  ...(brokenLocalLinks.length ? [`Broken packaged Markdown links: ${brokenLocalLinks.join(', ')}`] : []),
];
if (failures.length) throw new Error(failures.join('\n'));

console.log(`Package boundary passed: ${files.length} files, ${skillCount} skill guides, ${report.size} packed bytes.`);
