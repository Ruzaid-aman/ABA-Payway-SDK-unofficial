import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excluded = new Set(['.git', '.release-audit', 'knowledge', '.zcode', 'node_modules', 'payway-boilerplate', '.scratch', '.kilo', '.superpowers', 'examples', 'sdk', 'scripts', 'src']);
const out = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.md')) {
      const text = readFileSync(full, 'utf8');
      const rel = path.relative(root, full).replaceAll('\\', '/');
      for (const match of text.matchAll(/\]\(([^)\r\n]+)\)/g)) {
        const destination = match[1].trim().replace(/^<|>$/g, '');
        if (!destination || destination.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith('payway-sdk ')) continue;
        const local = decodeURIComponent(destination.split('#')[0].split('?')[0]);
        if (!local) continue;
        out.push(`${rel} -> ${local}`);
      }
    }
  }
}
walk(root);
console.log(out.join('\n'));