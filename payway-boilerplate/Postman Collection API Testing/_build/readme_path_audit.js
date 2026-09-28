// One-off audit: verify every backticked path-like token in the README exists.
// A token counts as existing if it resolves directly from the project root, or
// if its basename matches any tracked file in the workspace (handles tokens
// written without their folder prefix, e.g. environment file names).
const fs = require('fs');
const path = require('path');
const projectDir = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(projectDir, 'postman', 'documents', 'README.md'), 'utf8');
const SKIP_PREFIXES = ['node ', 'npm ', 'powershell', 'cd '];

function collectFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.kilo', '.postman'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else out.push(path.relative(projectDir, full).split(path.sep).join('/'));
  }
  return out;
}
const files = new Set(collectFiles(projectDir, []));

const tokens = [...new Set([...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))]
  .filter((t) => t.includes('/') || /\.(md|json|yaml|yml|js|txt)$/.test(t))
  .filter((t) => !SKIP_PREFIXES.some((p) => t.startsWith(p)) && !t.includes('\n'));

const plannedSection = md.indexOf('Planned guides');
let missing = 0;
for (const t of tokens) {
  const clean = t.replace(/…[\s\S]*$/, '').trim();
  const exists =
    fs.existsSync(path.join(projectDir, clean)) ||
    files.has(clean) ||
    [...files].some((f) => f.split('/').pop() === clean.split('/').pop());
  if (!exists) {
    const isPlanned = plannedSection !== -1 && md.indexOf('`' + t + '`') > plannedSection;
    if (!isPlanned) {
      console.log('MISSING: ' + t);
      missing++;
    }
  }
}
console.log(`audit done — ${tokens.length} path-like tokens, ${missing} unresolved`);
process.exitCode = missing === 0 ? 0 : 1;
