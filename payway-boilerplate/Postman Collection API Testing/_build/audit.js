const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));

const rows = [];
const walk = (items, path) => items.forEach((it) => {
  const p = path + ' / ' + (it.name || '(folder)');
  if (it.item) { walk(it.item, p); return; }
  const pre = it.event ? it.event.find((e) => e.listen === 'prerequest') : null;
  const test = it.event ? it.event.find((e) => e.listen === 'test') : null;
  const preLines = pre ? pre.script.exec.length : 0;
  const testLines = test ? test.script.exec.length : 0;
  const hasB4Hash = pre ? pre.script.exec.some((l) => l.includes('b4hash')) : false;
  const hasHashSet = pre ? pre.script.exec.some((l) => l.includes("set('computed_hash'")) : false;
  const hasRsa = pre ? pre.script.exec.some((l) => l.includes('rsaFallback') || l.includes('openSslEncrypt')) : false;
  const autosave = test ? test.script.exec.some((l) => l.includes("collectionVariables.set") || l.includes("postman.setNextRequest")) : false;
  const isDoc = it.name && !it.request;
  const shouldCompute = (it.request && it.request.method === 'POST') || p.includes('Callback') || p.includes('Listener');
  rows.push({
    req: p.slice(2),
    method: it.request ? it.request.method : '-',
    pre: pre ? preLines : 0,
    test: test ? testLines : 0,
    b4hash: pre ? (hasB4Hash ? 'y' : '-') : '-',
    hashSet: pre ? (hasHashSet ? 'y' : '-') : '-',
    rsa: hasRsa ? 'y' : '-',
    autosave: autosave ? 'y' : '-'
  });
});
walk(c.item, '');

console.log('req'.padEnd(58), 'M'.padEnd(5), 'pre'.padEnd(4), 'tst', 'hsh', 'set', 'rsa', 'save');
console.log('-'.repeat(100));
rows.forEach((r) => {
  console.log(r.req.padEnd(58), r.method.padEnd(5), String(r.pre).padEnd(4), String(r.test).padEnd(4), r.b4hash.padEnd(4), r.hashSet.padEnd(4), r.rsa.padEnd(4), r.autosave);
});