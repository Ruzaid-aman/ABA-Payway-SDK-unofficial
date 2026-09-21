/*
 * smoketest.js — Postman-runtime simulator + live sandbox smoke test.
 *
 * Executes the collection's ACTUAL scripts (collection-level + request-level)
 * in node:vm sandboxes that mirror Postman's scoping rules: EVERY script
 * (collection prerequest / request prerequest / collection test / request test)
 * runs in its OWN fresh context, so top-level functions declared in one script
 * are NOT visible in the next — only pm variables are shared. (The pre-1.2.0
 * collection relied on shared scopes; that assumption is what v1.2.0's
 * `__helpers` eval-loader fixes, and this simulator now proves it.)
 *
 * Usage:
 *   node smoketest.js          -> sim-only (scripts run, no HTTP)
 *   node smoketest.js live     -> sim + live sandbox calls (public demo merchant)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const CryptoJS = require('crypto-js');

const COLLECTION_PATH = path.join(__dirname, '..', 'PayWay_API_Postman_Collection.postman_collection.json');
const LIVE = process.argv.includes('live');

const col = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf8'));

// Public sandbox demo credentials (developer.payway.com.kh / example collections)
const CREDS = {
  ecommerce: { merchant_id: 'sonitatest', secret_key: '9dc49bb1-04db-4ac0-a262-e7bef22cff6a' },
  instore:   { merchant_id: 'sonitatestinstore', secret_key: '74633d0e-236f-4271-af8b-17c2b4c6e3f8' },
};

// ---------------- minimal chai-ish expect ----------------
function isDeep(a, b) { return a === b || JSON.stringify(a) === JSON.stringify(b); }
function expectOf(actual) {
  const fail = (m) => { throw new Error(m); };
  const api = {
    to: {
      eql(exp, msg) { if (!isDeep(actual, exp)) fail((msg ? msg + ' :: ' : '') + 'expected ' + JSON.stringify(actual) + ' to eql ' + JSON.stringify(exp)); },
      equal(exp, msg) { api.to.eql(exp, msg); },
      be: {
        empty() { const e = actual == null || actual === '' || (Array.isArray(actual) && !actual.length); if (e) fail('expected non-empty, got ' + JSON.stringify(actual)); },
        a(t) { if (typeof actual !== t) fail('expected typeof ' + t + ', got ' + typeof actual); },
        true() { if (actual !== true) fail('expected true, got ' + JSON.stringify(actual)); },
      },
      not: {
        eql(exp) { if (isDeep(actual, exp)) fail('expected NOT to eql ' + JSON.stringify(exp)); },
        be: {
          empty() { const e = actual == null || actual === '' || (Array.isArray(actual) && !actual.length); if (e) fail('expected non-empty, got ' + JSON.stringify(actual)); },
          undefined() { if (actual === undefined) fail('expected a value but got undefined'); },
        },
      },
      have: {
        status(n) { const r = responseHolder.cur; if (!r || r.code !== n) fail('expected HTTP ' + n + ', got ' + (r && r.code)); },
        jsonSchema(schema) { const r = responseHolder.cur; if (schema && schema.required && r) { const j = r.jsonSafe; for (const k of schema.required) if (!j || !(k in j)) fail('jsonSchema: missing "' + k + '"'); } },
      },
      include(s) { if (!String(actual).includes(s)) fail('expected ' + JSON.stringify(actual) + ' to include ' + JSON.stringify(s)); },
      match(re) { if (!re.test(String(actual))) fail('expected ' + actual + ' to match ' + re); },
    },
  };
  return api;
}
const responseHolder = { cur: null };

// ---------------- pm mock ----------------
function newRun(overrides) {
  const vars = {};
  for (const v of col.variable || []) vars[v.key] = v.value === undefined ? '' : v.value;
  Object.assign(vars, overrides || {});
  return { vars, tests: [], logs: [], next: undefined, missing: new Set() };
}
function makePm(run) {
  return {
    collectionVariables: {
      get: (k) => (k in run.vars ? run.vars[k] : undefined),
      set: (k, v) => { run.vars[k] = v === undefined ? '' : String(v); },
    },
    variables: {
      get: (k) => (k in run.vars ? run.vars[k] : undefined),
      set: (k, v) => { run.vars[k] = v === undefined ? '' : String(v); },
      replaceIn: (s) => String(s).replace(/\{\{([^}]+)\}\}/g, (m, k) => (k in run.vars ? run.vars[k] : m)),
    },
    expect: expectOf,
    test(name, fn) { try { fn(); run.tests.push('PASS ' + name); } catch (e) { run.tests.push('FAIL ' + name + ' :: ' + String(e.message).split('\n')[0]); } },
    response: null,
  };
}
function makeBox(run) {
  const box = {
    pm: makePm(run),
    console: { log: (...a) => run.logs.push(a.map(String).join(' ')), warn: (...a) => run.logs.push('WARN ' + a.map(String).join(' ')), error: (...a) => run.logs.push('ERR ' + a.map(String).join(' ')) },
    require: (name) => { if (name === 'crypto-js') return CryptoJS; throw new Error('require("' + name + '") unavailable in sim'); },
    postman: { setNextRequest(n) { run.next = n; } },
    CryptoJS,
  };
  return vm.createContext(box);
}
function runIn(box, code) { if (code) vm.runInContext(code, box, { timeout: 10000 }); }

// ---------------- request helpers ----------------
function joinExec(evts, listen) {
  return (evts || []).filter((e) => e.listen === listen).map((e) => e.script.exec.join('\n')).join('\n;\n');
}
function findReq(name) {
  for (const folder of col.item) for (const it of folder.item || []) if (it.name === name) return { folder: folder.name, item: it };
  return null;
}
const colPre = joinExec(col.event, 'prerequest');
const colTest = joinExec(col.event, 'test');

// Postman resolves {{var}} to '' when the variable exists but is empty.
function resolveVars(s, run) {
  return String(s).replace(/\{\{([^}]+)\}\}/g, (m, k) => {
    if (k in run.vars) return run.vars[k] === undefined ? '' : String(run.vars[k]);
    run.missing.add(k);
    return m;
  });
}
function buildBody(req, run) {
  const b = req.body;
  if (!b) return { kind: 'none', value: undefined, headers: {} };
  if (b.mode === 'urlencoded') {
    const usp = new URLSearchParams();
    for (const kv of b.urlencoded || []) if (kv.disabled !== true) usp.append(kv.key, resolveVars(kv.value, run));
    return { kind: 'urlencoded', value: usp.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
  }
  if (b.mode === 'formdata') {
    const fd = new FormData();
    for (const kv of b.formdata || []) if (kv.disabled !== true) fd.append(kv.key, resolveVars(kv.value, run));
    return { kind: 'formdata', value: fd, headers: {} };
  }
  if (b.mode === 'raw') {
    const raw = resolveVars(b.raw, run);
    let value = raw;
    try { value = JSON.stringify(JSON.parse(raw)); } catch (e) { /* leave as-is */ }
    return { kind: 'json', value, headers: { 'Content-Type': 'application/json' } };
  }
  return { kind: 'none', value: undefined, headers: {} };
}

async function sendReq(name, run, simOnly) {
  const hit = findReq(name);
  if (!hit) throw new Error('request not found: ' + name);
  const req = hit.item.request;
  const row = { name, folder: hit.folder, http: '', statusLine: '', bodyPreview: '', tests: run.tests, logs: run.logs, next: '', scriptErr: '', missing: [] };

  // Postman exposes pm.request in both prerequest and test scripts
  const reqPm = () => ({
    method: req.method,
    url: { toString: () => req.url.raw },
    body: req.body ? {
      mode: req.body.mode,
      raw: req.body.raw,
      formdata: req.body.formdata ? { each: (fn) => req.body.formdata.forEach((kv) => fn(kv)) } : undefined,
      urlencoded: req.body.urlencoded ? { each: (fn) => req.body.urlencoded.forEach((kv) => fn(kv)) } : undefined,
    } : undefined,
  });

  // Each script gets its OWN vm context, exactly like Postman: declarations do
  // not leak between scripts, only pm variables are shared (via `run`).
  try {
    const colPreBox = makeBox(run);
    colPreBox.pm.request = reqPm();
    runIn(colPreBox, colPre);

    const preBox = makeBox(run);
    preBox.pm.request = reqPm();
    runIn(preBox, joinExec(hit.item.event, 'prerequest'));
  } catch (e) {
    row.statusLine = 'prerequest THREW';
    row.scriptErr = String(e.message).split('\n')[0];
    return row;
  }

  const url = resolveVars(req.url.raw, run);
  const body = buildBody(req, run);
  row.missing = [...run.missing];

  if (simOnly || !LIVE) { row.statusLine = 'sim'; return row; }

  try {
    const res = await fetch(url, { method: req.method, headers: body.headers, body: body.kind === 'none' ? undefined : body.value });
    const txt = await res.text();
    row.http = res.status;
    row.bodyPreview = txt.replace(/\s+/g, ' ').slice(0, 320);
    const respPm = {
      code: res.status,
      status: String(res.status),
      headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? res.headers.get('content-type') : null) },
      text: () => txt,
      json: () => JSON.parse(txt),
      to: {
        have: {
          status(n) { if (res.status !== n) throw new Error('expected HTTP ' + n + ', got ' + res.status); },
          jsonSchema(schema) {
            let j = null; try { j = JSON.parse(txt); } catch (e) { throw new Error('jsonSchema: response is not JSON'); }
            if (schema && schema.required) for (const k of schema.required) if (!(k in j)) throw new Error('jsonSchema: missing "' + k + '"');
          },
        },
      },
    };
    let jsonSafe = null; try { jsonSafe = JSON.parse(txt); } catch (e) {}
    responseHolder.cur = { code: res.status, jsonSafe };

    const colTestBox = makeBox(run);
    colTestBox.pm.request = reqPm();
    colTestBox.pm.response = respPm;
    runIn(colTestBox, colTest);

    const testBox = makeBox(run);
    testBox.pm.request = reqPm();
    testBox.pm.response = respPm;
    runIn(testBox, joinExec(hit.item.event, 'test'));
    responseHolder.cur = null;
    row.next = run.next || '';
  } catch (e) {
    row.scriptErr = String(e.message).split('\n')[0];
  }
  return row;
}

function report(rows) {
  for (const r of rows) {
    console.log('\n=== ' + r.folder + ' :: ' + r.name);
    console.log('    HTTP ' + (r.http || '-') + ' ' + r.statusLine);
    if (r.bodyPreview) console.log('    body: ' + r.bodyPreview);
    if (r.next) console.log('    setNextRequest -> ' + r.next);
    if (r.scriptErr) console.log('    SCRIPT ERROR: ' + r.scriptErr);
    if (r.missing && r.missing.length) console.log('    BODY VARS NEVER SET: ' + r.missing.join(', '));
    for (const t of r.tests || []) if (t.startsWith('FAIL')) console.log('    ' + t);
    const keys = (r.logs || []).filter((l) => /b4hash|status\.code|qr_data|saved|WARN|ERR|payment_link|approv/.test(l));
    for (const l of keys.slice(0, 6)) console.log('    log| ' + l.slice(0, 240));
  }
}

(async () => {
  // ---------- SIM PASS: every prerequest executes, every body var is set ----------
  console.log('############ SIM PASS ############');
  const simRows = [];
  for (const folder of col.item) {
    for (const it of folder.item || []) {
      const run = newRun();
      const row = await sendReq(it.name, run, true);
      row.name = it.name; row.folder = folder.name;
      simRows.push(row);
    }
  }
  report(simRows);

  if (!LIVE) { summarize(simRows); return; }

  // ---------- LIVE PASS ----------
  console.log('\n############ LIVE PASS ############');
  const rows = [];
  const creds = CREDS.ecommerce;

  // Purchase (sandbox demo merchant, USD)
  let run = newRun(creds);
  rows.push(await sendReq('1. Purchase (Hosted Checkout) - multipart', run));
  const paidTran = run.vars.last_tran_id || run.vars.tran_id;
  console.log('\n>>> purchase tran_id = ' + paidTran + ', last_tran_id = ' + run.vars.last_tran_id);

  // Poll the fresh (pending) transaction — see the real pending shape
  run = newRun({ ...creds, last_tran_id: paidTran });
  rows.push(await sendReq('3. Check Transaction (fast, recent)', run));
  console.log('\n>>> check-transaction-2 status.code = ' + JSON.stringify(run.vars.poll_status));

  // Get details
  rows.push(await sendReq('2. Get Transaction Details', run));

  // Exchange rate
  run = newRun(creds);
  rows.push(await sendReq('7. Exchange Rate', run));

  // Transaction list (today)
  run = newRun(creds);
  rows.push(await sendReq('6. Transaction List (filter)', run));

  // Close on a nonexistent tran — expect a business error, not a crash
  run = newRun({ ...creds, last_tran_id: 'TCLOSE' + Date.now() });
  rows.push(await sendReq('4. Close Transaction', run));

  // RSA endpoints without node-forge — expect the friendly SKIP branch
  run = newRun(creds);
  rows.push(await sendReq('5. Refund - RSA merchant_auth', run));
  run = newRun(creds);
  rows.push(await sendReq('Create Payment Link', run));
  run = newRun(creds);
  rows.push(await sendReq('1. Payout (to beneficiaries)', run));

  // Generate QR (folder 04) with the ecommerce profile
  run = newRun(creds);
  rows.push(await sendReq('Generate QR', run));

  // Flow A with the in-store profile: A1 -> poll x3 -> A3
  run = newRun(CREDS.instore);
  rows.push(await sendReq('A1 - Create QR', run));
  const qrTran = run.vars.last_tran_id || run.vars.tran_id;
  console.log('\n>>> flow-A tran_id = ' + qrTran);
  for (let i = 1; i <= 3; i++) {
    run = newRun({ ...CREDS.instore, last_tran_id: qrTran, poll_count: String(i - 1), max_polls: '3' });
    rows.push(await sendReq('A2 - Poll Transaction Status (loops)', run));
  }
  run = newRun({ ...CREDS.instore, last_tran_id: qrTran });
  rows.push(await sendReq('A3 - Get Transaction Details', run));

  // CoF live: Link Account -> Get Token Details (request_id auto-chained) - does sandbox return a pwt?
  run = newRun(creds);
  rows.push(await sendReq('1. Link Account (ABA Account)', run));
  const reqId = run.vars.request_id;
  console.log('\n>>> CoF request_id = ' + reqId);
  if (reqId) {
    run = newRun({ ...creds, request_id: reqId });
    rows.push(await sendReq('3. Get Token Details', run));
    console.log('\n>>> pwt after Get Token Details = ' + JSON.stringify(run.vars.pwt));
  }

  report(rows);
  summarize(rows);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });

function summarize(rows) {
  const bad = rows.filter((r) => r.statusLine === 'prerequest THREW' || r.scriptErr || (r.missing && r.missing.length) || (r.tests || []).some((t) => t.startsWith('FAIL')));
  console.log('\n############ SUMMARY ############');
  console.log('requests: ' + rows.length + ', with issues: ' + bad.length);
  for (const r of bad) console.log('  ! ' + r.folder + ' :: ' + r.name + (r.scriptErr ? ' | ' + r.scriptErr : '') + (r.missing && r.missing.length ? ' | unset: ' + r.missing.join(',') : ''));
}
