// Which collection variables are missing from collection-index.md?
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:/PayWay_Postman/PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));
const idx = fs.readFileSync('D:/PayWay_Postman/collection-index.md', 'utf8');
const missing = (c.variable || []).filter(v => !idx.includes(v.key)).map(v => v.key);
console.log('total vars:', (c.variable || []).length);
console.log('missing from index:', JSON.stringify(missing));
// also list request names/URLs missing
const norm = s => String(s).replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
const idxN = norm(idx);
for (const f of c.item) {
  for (const it of f.item) {
    if (!idxN.includes(norm(it.name))) console.log('MISSING request:', f.name, '>', it.name);
    const url = it.request && it.request.url && (typeof it.request.url === 'string' ? it.request.url : it.request.url.raw);
    if (url && !idxN.includes(norm(url))) console.log('MISSING url:', f.name, '>', it.name, '->', url);
  }
}
