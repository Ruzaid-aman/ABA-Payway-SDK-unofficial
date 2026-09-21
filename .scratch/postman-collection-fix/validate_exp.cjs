// Validates the exp PayWay collection: scripts parse, setNextRequest targets
// exist, every {{var}} used in scripts/bodies/URLs is a defined collection
// variable. Mirrors the checks of the original _build validators without
// their hardcoded D:\PayWay_Postman paths.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = process.argv[2];
const collection = JSON.parse(fs.readFileSync(file, 'utf8'));

const varKeys = new Set((collection.variable || []).map((v) => v.key));
const reqNames = [];
let scripts = 0;
let scriptErrors = 0;
const usedVars = new Set();
const setNextTargets = [];

function checkScript(where, code) {
  scripts++;
  try {
    new vm.Script(code, { filename: where });
  } catch (e) {
    scriptErrors++;
    console.log(`SCRIPT ERROR [${where}]: ${e.message}`);
  }
  for (const m of String(code).matchAll(/\{\{(\w+)\}\}/g)) usedVars.add(m[1]);
  for (const m of String(code).matchAll(/(?:pm\.collectionVariables|\bC)\.set\(\s*['"](\w+)['"]/g)) varKeys.add(m[1]);
  for (const m of String(code).matchAll(/setNextRequest\(\s*['"]([^'"]+)['"]/g)) setNextTargets.push([where, m[1]]);
}

function walk(items, where) {
  for (const it of items) {
    const name = `${where} / ${it.name}`;
    if (it.event) for (const ev of it.event) checkScript(name, (ev.script && ev.script.exec || []).join('\n'));
    const req = it.request;
    if (req) {
      reqNames.push(name);
      const urlRaw = typeof req.url === 'string' ? req.url : (req.url && req.url.raw) || '';
      for (const m of urlRaw.matchAll(/\{\{(\w+)\}\}/g)) usedVars.add(m[1]);
      const body = req.body || {};
      const arr = body.urlencoded || body.formdata || [];
      for (const p of arr) for (const m of String(p.value).matchAll(/\{\{(\w+)\}\}/g)) usedVars.add(m[1]);
      if (body.raw) for (const m of String(body.raw).matchAll(/\{\{(\w+)\}\}/g)) usedVars.add(m[1]);
    }
    if (it.item) walk(it.item, name);
  }
}

walk(collection.item, '');
if (collection.event) for (const ev of collection.event) checkScript('<collection>', (ev.script && ev.script.exec || []).join('\n'));

const missing = [...usedVars].filter((v) => !varKeys.has(v));
const badTargets = setNextTargets.filter(([, t]) => !reqNames.some((n) => n.endsWith(`/ ${t}`)));

console.log(`folders: ${collection.item.length}`);
console.log(`requests: ${reqNames.length}`);
console.log(`scripts parsed: ${scripts}, errors: ${scriptErrors}`);
console.log(`variables defined: ${varKeys.size}, referenced: ${usedVars.size}`);
console.log(`undefined vars: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`setNextRequest targets: ${setNextTargets.length}, dangling: ${badTargets.length ? JSON.stringify(badTargets) : 'none'}`);

const creds = Object.fromEntries((collection.variable || [])
  .filter((v) => ['merchant_id', 'secret_key', 'rsa_public_key', 'whitelist_payee', 'ctid'].includes(v.key))
  .map((v) => [v.key, String(v.value).slice(0, 12)]));
console.log('credential vars:', JSON.stringify(creds));

const ok = scriptErrors === 0 && missing.length === 0 && badTargets.length === 0;
console.log(ok ? 'VERDICT: OK' : 'VERDICT: FAIL');
process.exit(ok ? 0 : 1);
