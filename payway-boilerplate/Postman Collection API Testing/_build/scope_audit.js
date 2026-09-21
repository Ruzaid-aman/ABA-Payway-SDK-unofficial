// Audit: where helpers are defined vs where they are referenced (scope analysis)
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || 'D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json';
const c = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const HELPERS = ['_pad', 'utcNow', 'hmac512', 'b64', 'b64json', 'ensureB64', 'fmtAmt', 'genTranId',
  'genRequestId', 'okStatus', 'respCode', 'rsaMissing', 'openSslEncrypt', 'rsaFallback', 'escHtml',
  'visualizeFormPost', 'visualizeQr', 'assertJsonSchema'];

const scriptSrc = (ev) => Array.isArray(ev.script?.exec) ? ev.script.exec.join('\n') : String(ev.script?.exec || '');

// 1) collection-level scripts
console.log('=== COLLECTION-LEVEL EVENTS ===');
for (const ev of c.event || []) {
  const src = scriptSrc(ev);
  console.log(`\n--- collection ${ev.listen} (${src.split('\n').length} lines) ---`);
  console.log(src);
}

// 2) per-script helper reference matrix
console.log('\n=== HELPER USAGE PER SCRIPT (r=reference) ===');
const rows = [];
const walk = (items, folder) => {
  for (const it of items) {
    if (it.item) { walk(it.item, folder.concat(it.name)); continue; }
    const q = folder.concat(it.name).join(' > ');
    for (const ev of it.event || []) {
      const src = scriptSrc(ev);
      const used = HELPERS.filter(h => new RegExp('\\b' + h + '\\s*\\(', 'm').test(src) ||
        new RegExp('\\b' + h + '\\b', 'm').test(src));
      const defines = HELPERS.filter(h => new RegExp('function\\s+' + h + '\\b').test(src));
      if (used.length) rows.push({ q, listen: ev.listen, used, defines });
    }
  }
};
walk(c.item || [], []);
for (const r of rows) {
  console.log(`[${r.listen}] ${r.q}`);
  console.log('   uses: ' + r.used.join(', '));
  if (r.defines.length) console.log('   DEFINES: ' + r.defines.join(', '));
}
const nPre = rows.filter(r => r.listen === 'prerequest').length;
const nTest = rows.filter(r => r.listen === 'test').length;
console.log(`\nTotal scripts referencing helpers: ${rows.length} (prerequest ${nPre}, test ${nTest})`);

// 3) do any scripts use require( / const crypto etc. at top level outside helpers?
console.log('\n=== SCRIPTS USING require() OUTSIDE COLLECTION PREREQUEST ===');
for (const r of rows) { /* placeholder */ }
const walk2 = (items, folder) => {
  for (const it of items) {
    if (it.item) { walk2(it.item, folder.concat(it.name)); continue; }
    const q = folder.concat(it.name).join(' > ');
    for (const ev of it.event || []) {
      const src = scriptSrc(ev);
      const reqs = src.match(/require\([^)]*\)/g);
      if (reqs) console.log(`[${ev.listen}] ${q}: ${[...new Set(reqs)].join(' ')}`);
    }
  }
};
walk2(c.item || [], []);
