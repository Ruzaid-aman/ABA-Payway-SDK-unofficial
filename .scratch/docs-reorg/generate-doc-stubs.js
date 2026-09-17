#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const guidesDir = path.join(repoRoot, 'docs', 'guides');
const topDocsDir = path.join(repoRoot, 'docs');

const chapters = [
  '03-web-implementation.md',
  '04-native-app-implementation.md',
  '05-webview-implementation.md',
  '06-telegram-mini-app.md',
  '07-qr-code-handling.md',
  '08-deep-linking.md',
  '11-callbacks-and-webhooks.md',
  '17-payment-link.md'
];

for (const f of chapters) {
  const src = path.join(guidesDir, f);
  const dest = path.join(topDocsDir, f);
  if (!fs.existsSync(src)) {
    console.error('Source missing:', src);
    continue;
  }
  const content = fs.readFileSync(src, 'utf8');
  // Add a warning header indicating this is a compatibility copy
  const header = `<!-- GENERATED STUB: copy of docs/guides/${f} for compatibility. Do not edit here. -->\n\n`;
  fs.writeFileSync(dest, header + content, 'utf8');
  console.log('Wrote', dest);
}
console.log('Done.');
