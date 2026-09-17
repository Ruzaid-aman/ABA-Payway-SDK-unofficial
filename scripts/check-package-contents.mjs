import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
// package name. Normalize both before reading `files`.
const parsedReport = JSON.parse(packed.stdout);
const report = Array.isArray(parsedReport) ? parsedReport[0] : Object.values(parsedReport)[0];
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
];
const forbiddenPaths = files.filter((entry) => forbiddenPathPatterns.some((pattern) => pattern.test(entry)));

const skillCount = files.filter((entry) => /^skills\/aba-payway-[^/]+\/SKILL\.md$/.test(entry)).length;
const textExtensions = new Set(['.js', '.cjs', '.json', '.md', '.ts', '.cts']);
const forbiddenContentPatterns = [
  /[A-Z]:[\\/]Users[\\/]/i,
  /[A-Z]:[\\/]Antigravity_google[\\/]/i,
  /WAVE5-captures\.md/i,
  /ABA-QUESTIONS-\d{4}-\d{2}-\d{2}\.md/i,
  /SANDBOX-FINDINGS\.md/i,
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
  for (const pattern of forbiddenContentPatterns) {
    if (pattern.test(content)) contentViolations.push(`${entry}: ${pattern}`);
  }
  if (path.extname(entry) === '.md') {
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const destination = match[1].trim().replace(/^<|>$/g, '');
      if (!destination || destination.startsWith('#') || /^[a-z]+:/i.test(destination)) continue;
      // CLI-served knowledge links ("payway-sdk docs <topic>") are resolved at
      // runtime by the docs command, not by package-relative paths.
      if (destination.startsWith('payway-sdk ')) continue;
      const localPath = destination.split('#')[0].split('?')[0];
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry), localPath.replace(/^\.\//, '')));
      if (!fileSet.has(resolved)) brokenLocalLinks.push(`${entry} -> ${destination}`);
    }
  }
}

const failures = [
  ...(missing.length ? [`Missing required files: ${missing.join(', ')}`] : []),
  ...(forbiddenPaths.length ? [`Forbidden package paths: ${forbiddenPaths.join(', ')}`] : []),
  ...(skillCount !== 34 ? [`Expected 34 skill guides, found ${skillCount}`] : []),
  ...(contentViolations.length ? [`Forbidden embedded content: ${contentViolations.join(', ')}`] : []),
  ...(brokenLocalLinks.length ? [`Broken packaged Markdown links: ${brokenLocalLinks.join(', ')}`] : []),
];
if (failures.length) throw new Error(failures.join('\n'));

console.log(`Package boundary passed: ${files.length} files, ${skillCount} skill guides, ${report.size} packed bytes.`);
