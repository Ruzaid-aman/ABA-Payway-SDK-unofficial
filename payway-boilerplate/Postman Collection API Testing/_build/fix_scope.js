/*
 * fix_scope.js — Postman script-scope fix (v1.2.0).
 *
 * BUG: Postman executes every script (collection / folder / request-level,
 * pre-request and test) in its OWN scope. The 18 helper functions defined in the
 * collection pre-request (_pad, utcNow, hmac512, b64, b64json, ensureB64, fmtAmt,
 * genTranId, genRequestId, okStatus, respCode, rsaMissing, openSslEncrypt,
 * rsaFallback, escHtml, visualizeFormPost, visualizeQr, assertJsonSchema) were
 * therefore NOT visible to the 60 request scripts that call them — every request
 * failed with "utcNow is not defined" / "okStatus is not defined" etc.
 *
 * FIX (single source of truth, no logic moved):
 *   1. The helper library source ships as the `__helpers` collection variable.
 *   2. The collection pre-request evals it (for its own scope).
 *   3. Every request pre-request/test script that references a helper is prepended
 *      with the same 4-line loader that evals `__helpers` into its own scope.
 *
 * Idempotent: scripts already containing the loader are skipped.
 * Edits the part_*.json sources; run merge.js afterwards.
 */
const fs = require('fs');
const path = require('path');

const build = __dirname;
const HELPERS = ['_pad', 'utcNow', 'hmac512', 'b64', 'b64json', 'ensureB64', 'fmtAmt', 'genTranId',
  'genRequestId', 'okStatus', 'respCode', 'rsaMissing', 'openSslEncrypt', 'rsaFallback', 'escHtml',
  'visualizeFormPost', 'visualizeQr', 'assertJsonSchema'];
const usesHelper = (src) => HELPERS.some((h) => new RegExp('\\b' + h + '\\b').test(src));

const LOADER = [
  '// Restore the shared PayWay helper library (Postman runs every script in its own scope):',
  "var __h = pm.collectionVariables.get('__helpers');",
  "if (!__h) throw new Error('The `__helpers` collection variable is missing - re-import the full collection JSON (it holds the shared helper library source).');",
  'eval(__h);',
];

const colPreLoader = [
  '// ---- PayWay helper library (restored into this script\'s own scope) ----',
  '// Postman executes every script (collection / folder / request-level, pre-request',
  '// and test) in its OWN scope: functions declared in one script are NOT visible in',
  "// another. The library therefore ships as the `__helpers` collection variable and",
  '// every script that needs the helpers starts by evaluating it.',
  "var __h = pm.collectionVariables.get('__helpers');",
  "if (!__h) throw new Error('The `__helpers` collection variable is missing - re-import the full collection JSON (it holds the shared helper library source).');",
  'eval(__h);',
];

// ---------- 1. part_00: library -> variable, collection prerequest -> loader ----------
const infoPath = path.join(build, 'part_00_info.json');
const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));

const colPre = (info.event || []).find((e) => e.listen === 'prerequest');
if (!colPre) throw new Error('collection prerequest event not found in part_00_info.json');
const colSrc = Array.isArray(colPre.script.exec) ? colPre.script.exec.join('\n') : String(colPre.script.exec);

if (info.variable.some((v) => v.key === '__helpers')) {
  console.log('part_00: __helpers variable already present — leaving library variable as-is');
} else {
  if (!/function\s+utcNow/.test(colSrc) || !/function\s+visualizeQr/.test(colSrc)) {
    throw new Error('collection prerequest does not look like the helper library — refusing to touch it');
  }
  const lines = colSrc.split('\n');
  if (!lines[0].includes('PayWay helper library')) throw new Error('unexpected first line: ' + lines[0]);
  const libSrc = lines.slice(1).join('\n').trim(); // drop the old header comment

  info.variable.push({
    key: '__helpers',
    value: libSrc,
    type: 'string',
    description: 'Shared helper library (JavaScript source, single source of truth). Postman runs every script in its own scope, so request/test scripts eval() this variable to restore the helpers (_pad, utcNow, hmac512, b64, b64json, ensureB64, fmtAmt, genTranId, genRequestId, okStatus, respCode, rsaMissing, openSslEncrypt, rsaFallback, escHtml, visualizeFormPost, visualizeQr, assertJsonSchema). Edit with care — then keep the loader lines in the scripts untouched.',
  });
  colPre.script.exec = colPreLoader;
  console.log('part_00: library (' + (libSrc.length / 1024).toFixed(1) + ' KB) moved to __helpers variable; collection prerequest is now the ' + colPreLoader.length + '-line loader');
}

// bump version (1.1.1 -> 1.2.0)
if (info.info.version === '1.1.1') { info.info.version = '1.2.0'; console.log('part_00: version -> 1.2.0'); }

fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n', 'utf8');

// ---------- 2. part_01..11: prepend loader to helper-using scripts ----------
let patched = 0;
const patchedLog = [];
const patchEvents = (it, where) => {
  for (const ev of it.event || []) {
    const src = Array.isArray(ev.script.exec) ? ev.script.exec.join('\n') : String(ev.script.exec);
    if (src.includes('__helpers')) continue; // already loader'd (idempotent)
    if (!usesHelper(src)) continue;
    ev.script.exec = LOADER.concat(ev.script.exec);
    patched++;
    patchedLog.push(where + ' [' + ev.listen + ']');
  }
};
const walk = (items, folder) => {
  for (const it of items) {
    if (it.item) { walk(it.item, folder.concat(it.name)); continue; } // sub-folder (none expected)
    if (it.event && it.event.length) patchEvents(it, it.name); // folder-level events
    if (it.request && it.event) patchEvents(it, folder.concat(it.name).join(' > '));
  }
};

const files = fs.readdirSync(build).filter((f) => /^part_\d+.*\.json$/.test(f) && f !== 'part_00_info.json').sort();
for (const f of files) {
  const p = path.join(build, f);
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = patched;
  walk(obj.item || [], [obj.folder]);
  if (patched !== before) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    console.log(f + ': ' + (patched - before) + ' script(s) patched');
  }
}

console.log('\nTotal scripts patched: ' + patched);
for (const l of patchedLog) console.log('  + ' + l);
