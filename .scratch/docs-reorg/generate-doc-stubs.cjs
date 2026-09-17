#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const guidesDir = path.join(repoRoot, 'docs', 'guides');
const topDocsDir = path.join(repoRoot, 'docs');

// Copy all numbered chapter guides from docs/guides to top-level docs for compatibility
const all = fs.readdirSync(guidesDir).filter((n) => /^\d{2}-.*\.md$/.test(n));
for (const f of all) {
  const src = path.join(guidesDir, f);
  const dest = path.join(topDocsDir, f);
  const content = fs.readFileSync(src, 'utf8');
  const header = `<!-- GENERATED STUB: copy of docs/guides/${f} for compatibility. Do not edit here. -->\n\n`;
  fs.writeFileSync(dest, header + content, 'utf8');
  console.log('Wrote', dest);
}
console.log('Done.');
