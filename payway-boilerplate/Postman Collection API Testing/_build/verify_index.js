// One-off: verify collection-index.md against the actual collection + _build dir
const fs = require('fs');
const path = require('path');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
const idx = fs.readFileSync('D:/PayWay_Postman/collection-index.md', 'utf8');
// normalise dashes so "—" vs "-" can't hide a mismatch
const norm = s => String(s).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
const idxN = norm(idx);

let fail = 0;
const miss = (kind, name) => { fail++; console.log('MISSING ' + kind + ': ' + JSON.stringify(name)); };

for (const f of c.item) {
  if (!idxN.includes(norm(f.name))) miss('folder', f.name);
  for (const it of f.item) {
    if (!idxN.includes(norm(it.name))) miss('request', f.name + ' > ' + it.name);
    const url = it.request && it.request.url && (typeof it.request.url === 'string' ? it.request.url : it.request.url.raw);
    if (url && !idxN.includes(norm(url))) miss('url', f.name + ' > ' + it.name + ' -> ' + url);
  }
}
for (const v of c.variable || []) {
  if (!idxN.includes(v.key)) miss('variable', v.key);
}
const buildDir = 'D:/PayWay_Postman/_build';
for (const fn of fs.readdirSync(buildDir)) {
  if (!/\.(js|json|ps1)$/.test(fn)) continue;
  if (!idx.includes(fn)) miss('build file', fn);
}
for (const fn of fs.readdirSync('D:/PayWay_Postman')) {
  if (fn === 'collection-index.md') continue;
  if (!idx.includes(fn)) miss('workspace file', fn);
}
console.log(fail === 0 ? 'ALL CHECKS PASSED' : fail + ' missing item(s)');
