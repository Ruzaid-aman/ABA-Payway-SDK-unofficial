// Second-pass audit: Postman script-requirements compliance for the exp collection.
// Checks every script (collection, folder, request; pre-request and test) for:
//   1. schema basics: listen values, type field, packages field, exec string array
//   2. helper usage without the __helpers eval loader (v1.2.0 scope rule)
//   3. deprecated/blocked APIs: tests[...], pm.environment/globals, postman.set*,
//      setTimeout/setInterval, require of non-approved modules, fetch/XHR
//   4. pm.response usage inside pre-request scripts (invalid)
//   5. literal {{var}} inside scripts (not auto-resolved by Postman at runtime)
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.resolve(__dirname, '../..', 'payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json');
const c = JSON.parse(fs.readFileSync(file, 'utf8'));

const helperNames = ['_pad','utcNow','hmac512','b64','b64json','ensureB64','fmtAmt','genTranId','genRequestId','okStatus','respCode','rsaMissing','openSslEncrypt','rsaFallback','escHtml','visualizeFormPost','visualizeQr','assertJsonSchema'];
const APPROVED_REQUIRE = new Set(['crypto-js','node-forge','lodash','moment','uuid','chai']);
const findings = [];
const stats = { scripts: 0, prerequest: 0, test: 0, withLoader: 0, helperUsers: 0 };

function audit(where, listen, script) {
  stats.scripts++;
  if (listen === 'prerequest') stats.prerequest++; else if (listen === 'test') stats.test++;
  const code = (script.exec || []).join('\n');
  if (script.type !== 'text/javascript') findings.push(`[${where}/${listen}] missing type "text/javascript"`);
  if (!('packages' in script)) findings.push(`[${where}/${listen}] missing "packages" field (current exports carry it)`);
  if (!Array.isArray(script.exec) || script.exec.some((l) => typeof l !== 'string')) findings.push(`[${where}/${listen}] exec is not a string array`);
  if (!['prerequest', 'test'].includes(listen)) findings.push(`[${where}/${listen}] unexpected listen value`);

  const hasLoader = /__h\s*=\s*pm\.collectionVariables\.get\('__helpers'\)|eval\(\s*pm\.collectionVariables\.get\('__helpers'\)\s*\)/.test(code);
  const usesHelpers = helperNames.some((h) => new RegExp(`\\b${h}\\s*\\(`).test(code));
  if (usesHelpers) { stats.helperUsers++; if (hasLoader) stats.withLoader++; }
  if (usesHelpers && !hasLoader) findings.push(`[${where}/${listen}] uses helpers WITHOUT the eval loader`);

  const deprecations = [
    [/\btests\s*\[/, 'old tests[...] style'],
    [/pm\.environment\./, 'pm.environment (collection should be self-contained)'],
    [/pm\.globals\./, 'pm.globals'],
    [/postman\.setEnvironmentVariable|postman\.getEnvironmentVariable|postman\.setGlobalVariable|postman\.getGlobalVariable/, 'legacy postman.* variable APIs'],
    [/\bsetInterval\b/, 'setInterval (blocked in sandbox)'],
    [/\bsetTimeout\b/, 'setTimeout (blocked in sandbox)'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest (unavailable)'],
    [/\bfetch\s*\(/, 'fetch() (use pm.sendRequest)'],
  ];
  for (const [re, label] of deprecations) if (re.test(code)) findings.push(`[${where}/${listen}] ${label}`);
  for (const m of code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!APPROVED_REQUIRE.has(m[1])) findings.push(`[${where}/${listen}] require('${m[1]}') not an approved sandbox library`);
  }
  if (listen === 'prerequest' && /pm\.response\./.test(code)) findings.push(`[${where}/prerequest] uses pm.response (no response exists yet)`);
  const braces = [...code.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  if (braces.length) findings.push(`[${where}/${listen}] literal {{${[...new Set(braces)].join(',')}}} in script — Postman does not auto-substitute collection vars inside scripts`);
}

function walk(items, where) {
  for (const it of items) {
    const name = `${where}/${it.name}`;
    for (const ev of it.event || []) audit(name, ev.listen, ev.script);
    if (it.item) walk(it.item, name);
  }
}
walk(c.item, '');
for (const ev of c.event || []) audit('<collection>', ev.listen, ev.script);

console.log(`scripts: ${stats.scripts} (pre-request ${stats.prerequest}, test ${stats.test})`);
console.log(`helper-consuming scripts: ${stats.helperUsers}, with loader: ${stats.withLoader}`);
console.log(`\nFINDINGS (${findings.length}):`);
for (const f of findings) console.log('  -', f);
