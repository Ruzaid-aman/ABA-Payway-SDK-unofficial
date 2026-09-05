import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.resolve(repositoryRoot, process.argv[2] ?? 'docs/api');
const relative = path.relative(repositoryRoot, docsRoot);
if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Docs path escapes repository: ${docsRoot}`);
if (!existsSync(docsRoot)) throw new Error(`Docs path does not exist: ${docsRoot}`);

const files = [];
const visit = (directory) => {
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    if (statSync(absolute).isDirectory()) visit(absolute);
    else files.push(absolute);
  }
};
visit(docsRoot);

const forbiddenNames = /(?:SANDBOX-FINDINGS|WAVE5-captures|ABA-QUESTIONS|HANDOFF|AGENT-SETUP-PLAYBOOK)\.md$/i;
const forbiddenContent = [/[A-Z]:[\\/]Users[\\/]/i, /[A-Z]:[\\/]Antigravity_google[\\/]/i, /media\/SANDBOX-FINDINGS\.md/i];
const violations = [];
for (const absolute of files) {
  const display = path.relative(repositoryRoot, absolute).replaceAll('\\', '/');
  if (forbiddenNames.test(absolute)) violations.push(display);
  if (!/\.(?:html|js|json|md|txt)$/i.test(absolute)) continue;
  const content = readFileSync(absolute, 'utf8');
  for (const pattern of forbiddenContent) {
    if (pattern.test(content)) violations.push(`${display}: ${pattern}`);
  }
}
if (violations.length) throw new Error(`Public docs boundary violations:\n${violations.join('\n')}`);

console.log(`Public docs boundary passed: ${files.length} generated files checked.`);
