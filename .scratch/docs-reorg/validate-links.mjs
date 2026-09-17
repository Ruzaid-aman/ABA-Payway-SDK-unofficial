import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excluded = new Set(['.git', '.release-audit', 'knowledge', '.zcode', 'node_modules', 'payway-boilerplate']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\]\(([^)\r\n]+)\)/g)) {
    const destination = match[1].trim().replace(/^<|>$/g, '');
    if (!destination || destination.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith('payway-sdk ')) continue;
    const local = decodeURIComponent(destination.split('#')[0].split('?')[0]);
    if (!local) continue;
    const resolved = path.resolve(path.dirname(file), local);
    if (!existsSync(resolved)) failures.push(`${path.relative(root, file).replaceAll('\\', '/')} -> ${destination}`);
  }
}

if (failures.length) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All local markdown links resolve.');
}
