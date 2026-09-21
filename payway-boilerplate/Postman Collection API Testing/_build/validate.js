const fs = require('fs');
const c = JSON.parse(fs.readFileSync('D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json', 'utf8'));

const issues = [];

console.log('== Folders ==');
c.item.forEach((f) => {
  const reqs = f.item.filter((i) => i.request);
  console.log(`  ${f.name} -> ${reqs.length} requests`);
});

// every item with setNextRequest target
const names = new Set();
const walk = (items) => items.forEach((it) => {
  if (it.name) names.add(it.name);
  if (it.item) walk(it.item);
});
walk(c.item);
console.log('\n== setNextRequest targets ==');
c.item.forEach((f) => f.item.forEach((i) => {
  (i.event || []).forEach((e) => {
    (e.script.exec || []).forEach((ln) => {
      const m = ln.match(/setNextRequest\('(.+?)'\)/);
      if (m) console.log(`  ${i.name} -> ${m[1]} ${names.has(m[1]) ? 'OK' : '*** MISSING ***'}`);
    });
  });
}));

// variable usage -> defined?
const vars = new Set(c.variable.map((v) => v.key));
const used = new Set();
const reVar = /\{\{([^}]+)\}\}/g;
walk(c.item);
c.item.forEach((f) => f.item.forEach((i) => {
  const s = JSON.stringify(i);
  let m;
  while ((m = reVar.exec(s)) !== null) used.add(m[1]);
}));
console.log('\n== Undefined collection variables referenced ==');
const undef = [...used].filter((u) => !vars.has(u)).sort();
if (undef.length === 0) console.log('  none');
else undef.forEach((u) => console.log('  ' + u));

// helpers used in prerequest scripts
const helpers = ['_pad','utcNow','hmac512','b64','b64json','ensureB64','fmtAmt','genTranId','genRequestId','openSslEncrypt','rsaFallback','CryptoJS'];
const usedFns = new Set();
c.item.forEach((f) => f.item.forEach((i) => {
  (i.event || []).forEach((e) => {
    if (e.listen === 'prerequest') {
      (e.script.exec || []).join('\n').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\b/).forEach((t) => { if (helpers.includes(t)) usedFns.add(t); });
    }
  });
}));
console.log('\n== Helper functions used in prerequest scripts ==');
console.log('  used:', [...usedFns].sort().join(', '));
console.log('  undefined:', [...usedFns].filter((h) => !helpers.includes(h)).join(', ') || 'none');

const execs = [];
c.item.forEach((f) => f.item.forEach((i) => (i.event || []).forEach((e) => {
  (e.script.exec || []).forEach((ln) => {
    const m = ln.match(/\b(pm\.collectionVariables\.get\('([^']+)'\))/);
    if (m) {
      if (!vars.has(m[2])) execs.push(`  ${i.name}: uses {{${m[2]}}} (not defined)`);
    }
  });
})));
if (execs.length) { console.log('\n== undefined vars used via pm.collectionVariables.get =='); execs.forEach((x) => console.log(x)); }
else console.log('\n== pm.collectionVariables.get refs all valid ==');

// check every request has method
const bad = [];
c.item.forEach((f) => f.item.forEach((i) => {
  if (!i.request || !i.request.method) bad.push(i.name);
}));
console.log('\n== Requests missing method ==', bad.length ? bad.join(', ') : 'none');