// Runtime simulation of folder 09's scripts in a Postman-like sandbox: each script
// runs in its own vm context (the Postman scope rule), with a pm stub, real crypto-js,
// and scripted responses. Proves the KHQR builder, callback sync, and by-ref
// validation blocks behave as designed before shipping.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const { loadYamlCollection } = require('./yaml_collection');
const collectionDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'postman', 'collections', 'PayWay API — Complete Collection');
const yamlCollection = loadYamlCollection(collectionDir);
const c = {
  variable: [...yamlCollection.variables].map(([key, value]) => ({ key, value })),
  item: [{
    name: '09 - KHQR Guideline',
    item: yamlCollection.requests
      .filter((request) => request.relativePath.startsWith('09 - KHQR Guideline'))
      .map((request) => ({
        name: path.basename(request.relativePath, '.request.yaml'),
        event: (request.scripts || []).map((script) => ({
          listen: script.type === 'beforeRequest' ? 'prerequest' : 'test',
          script: { exec: String(script.code || '').split('\n') },
        })),
      })),
  }],
};
const f09 = c.item[0];

function freshVars() { return new Map(c.variable.map((v) => [v.key, v.value])); }

// Minimal chai subset covering the assertion forms the folder-09 scripts use.
function chaiExpect(v) {
  function wrap(val, neg) {
    const chk = (cond, m) => { if (neg ? !!cond : !cond) throw new Error(m || 'assertion failed'); };
    return {
      get not() { return wrap(val, !neg); },
      eql(exp, m) { chk(JSON.stringify(val) === JSON.stringify(exp), m || `eql: ${JSON.stringify(val)} vs ${JSON.stringify(exp)}`); return this; },
      match(re, m) { chk(re.test(String(val)), m || `match failed: ${val}`); return this; },
      oneOf(arr, m) { chk(arr.indexOf(val) >= 0, m || `oneOf failed: ${val}`); return this; },
      be: {
        a(t) { chk(typeof val === t, `typeof ${typeof val} !== ${t}`); return this; },
        an(t) { chk(typeof val === t, `typeof ${typeof val} !== ${t}`); return this; },
        above(n, m) { chk(Number(val) > n, m || `not above ${n}`); return this; },
        get empty() { chk(val === '' || val == null || (Array.isArray(val) && !val.length), 'not empty'); return undefined; },
      },
    };
  }
  return { to: wrap(v, false) };
}

function makePM(vars, response) {
  const tests = [];
  response.to = { have: { status: (code) => { if (response.code !== code) throw new Error(`status ${response.code} !== ${code}`); } } };
  return {
    collectionVariables: {
      get: (k) => (vars.has(k) ? vars.get(k) : undefined),
      set: (k, v) => vars.set(k, String(v)),
    },
    response,
    expect: chaiExpect,
    test: (name, fn) => {
      try { fn(); tests.push(['PASS', name]); } catch (e) { tests.push(['FAIL', name + ' :: ' + e.message]); }
    },
    visualizer: { set: (...a) => { makePM.vizArgs = a; makePM.vizCalled = true; } },
    _tests: tests,
  };
}
makePM.vizCalled = false;

function runScript(exec, pm) {
  const sandbox = {
    pm,
    console: { log: () => {} },
    require: (m) => { if (m === 'crypto-js') return require('crypto-js'); throw new Error('require ' + m); },
    JSON, Math, Date, Object, Array, String, Number, parseFloat, parseInt, RegExp, Error,
  };
  sandbox.eval = (code) => vm.runInContext(code, sandbox); // Postman: eval stays in the script's own scope
  vm.createContext(sandbox);
  vm.runInContext(exec.join('\n'), sandbox);
}

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log('  ok:', label); } else { fail++; console.log('  FAIL:', label); }
}
function allPassed(pm, label) {
  for (const [st, name] of pm._tests) check(st === 'PASS', `${label} :: ${name}`);
}

// --- R1: receiver creation -------------------------------------------------
const r1 = f09.item.find((i) => i.name.startsWith('1.'));
let pm = makePM(freshVars(), { code: 201, json: () => ({ uuid: '11111111-2222-3333-4444-555555555555' }) });
runScript(r1.event[0].script.exec, pm);
runScript(r1.event[1].script.exec, pm);
check(pm.collectionVariables.get('webhook_token') === '11111111-2222-3333-4444-555555555555', 'R1 webhook_token set');
check(pm.collectionVariables.get('callback_listener') === 'https://webhook.site/11111111-2222-3333-4444-555555555555', 'R1 callback_listener set');
allPassed(pm, 'R1');

// --- R2: dynamic build -----------------------------------------------------
const r2 = f09.item.find((i) => i.name.startsWith('2.'));
const vars2 = freshVars();
pm = makePM(vars2, { code: 200, json: () => ({}) });
runScript(r2.event[0].script.exec, pm);
runScript(r2.event[1].script.exec, pm);
const payload = pm.collectionVariables.get('khqr_payload');
check(/^000201010212/.test(payload), 'R2 dynamic header (01=12)');
check(/6304[0-9A-F]{4}$/.test(payload), 'R2 CRC trailer');
check(pm.collectionVariables.get('khqr_selftest') === 'pass', 'R2 self-test pass');
check(/^KHQR-/.test(pm.collectionVariables.get('merchant_ref')), 'R2 merchant_ref chained');
const flowRef = pm.collectionVariables.get('khqr_merchant_ref'); // valid ref from the dynamic run
check(makePM.vizCalled, 'R2 visualizer called');
check(payload.length > 150 && payload.length < 400, 'R2 payload length sane (' + payload.length + ')');
allPassed(pm, 'R2');
console.log('  payload:', payload);

// --- R2 static mode: tag 54 omitted, PIM 11 -------------------------------
pm = makePM(freshVars(), { code: 200, json: () => ({}) });
pm.collectionVariables.set('khqr_mode', 'static');
runScript(r2.event[0].script.exec, pm);
runScript(r2.event[1].script.exec, pm);
const sp = pm.collectionVariables.get('khqr_payload');
check(/^000201010211/.test(sp), 'R2 static header (01=11)');
check(!/540\d/.test(sp.slice(0, 60)), 'R2 static omits tag 54');
check(pm.collectionVariables.get('khqr_amount_used') === '', 'R2 static amount_used empty');
allPassed(pm, 'R2 static');

// --- R2 KHR: integer amount, currency 116 ---------------------------------
pm = makePM(freshVars(), { code: 200, json: () => ({}) });
pm.collectionVariables.set('currency', 'KHR');
pm.collectionVariables.set('amount', '48500.7');
runScript(r2.event[0].script.exec, pm);
runScript(r2.event[1].script.exec, pm);
check(/5303116540548501/.test(pm.collectionVariables.get('khqr_payload')), 'R2 KHR 116 + integer amount (48500.7 -> 48501)');
allPassed(pm, 'R2 KHR');

// --- R2 failure guard: missing amount in dynamic mode ----------------------
pm = makePM(freshVars(), { code: 200, json: () => ({}) });
pm.collectionVariables.set('amount', '');
let threw = '';
try { runScript(r2.event[0].script.exec, pm); } catch (e) { threw = e.message; }
check(/Set the amount collection variable/.test(threw), 'R2 guard: dynamic without amount throws');

// --- R3: pushback match ----------------------------------------------------
const r3 = f09.item.find((i) => i.name.startsWith('3.'));
const ref = flowRef;
const pushback = { transaction_id: 'PWH-777', merchant_ref: ref, payment_status_code: 0, payment_status: 'APPROVED', payment_amount: 0.1, payment_currency: 'USD', apv: '123456' };
pm = makePM(freshVars(), { code: 200, json: () => ({ data: [{ created_at: '2026-09-22T10:00:00Z', content: JSON.stringify(pushback) }] }) });
pm.collectionVariables.set('khqr_merchant_ref', ref);
pm.collectionVariables.set('merchant_ref', ref);
pm.collectionVariables.set('webhook_token', '11111111-2222-3333-4444-555555555555');
runScript(r3.event[0].script.exec, pm);
runScript(r3.event[1].script.exec, pm);
check(pm.collectionVariables.get('khqr_transaction_id') === 'PWH-777', 'R3 transaction_id imported');
check(pm.collectionVariables.get('khqr_payment_status_code') === '0', 'R3 status code imported');
check(pm.collectionVariables.get('khqr_callback_count') === '1', 'R3 match count');
allPassed(pm, 'R3');

// --- R3: legacy array response shape + no match -> designed failing test ---
pm = makePM(freshVars(), { code: 200, json: () => [{ created_at: '2026-09-22T10:00:00Z', content: '{"hello":1}' }] });
pm.collectionVariables.set('khqr_merchant_ref', ref);
pm.collectionVariables.set('webhook_token', '11111111-2222-3333-4444-555555555555');
runScript(r3.event[0].script.exec, pm);
runScript(r3.event[1].script.exec, pm);
check(pm._tests.some(([st, n]) => st === 'FAIL' && /callback captured/i.test(n)), 'R3 no-match raises the designed signal');
check(pm.collectionVariables.get('khqr_callback_count') === '0', 'R3 no-match count 0');

// --- R3 prereq guard: no receiver configured -------------------------------
pm = makePM(freshVars(), { code: 200, json: () => [] });
threw = '';
try { runScript(r3.event[0].script.exec, pm); } catch (e) { threw = e.message; }
check(/No webhook\.site receiver/.test(threw), 'R3 guard: no receiver throws');

// --- R4: by-ref with matching transactions ---------------------------------
const r4 = f09.item.find((i) => i.name.startsWith('4.'));
const txResp = { status: { code: 0, message: 'success' }, data: { transactions: [{ transaction_id: 'PWH-777', merchant_ref: ref, payment_status_code: 0, payment_amount: '0.10', currency: 'USD' }] } };
pm = makePM(freshVars(), { code: 200, json: () => txResp });
pm.collectionVariables.set('khqr_payload', '000201010212');
pm.collectionVariables.set('khqr_merchant_ref', ref);
pm.collectionVariables.set('khqr_amount_used', '0.1');
runScript(r4.event[0].script.exec, pm);
runScript(r4.event[1].script.exec, pm);
check(pm.collectionVariables.get('khqr_final_status') === 'APPROVED', 'R4 final status APPROVED');
check(/hash/i.test(JSON.stringify(pm.collectionVariables.get('computed_hash') || '')) || !!pm.collectionVariables.get('computed_hash'), 'R4 prereq signed');
allPassed(pm, 'R4');

// --- R4: 404 branch still green with flow context --------------------------
pm = makePM(freshVars(), { code: 404, json: () => { throw new Error('empty body'); } });
pm.collectionVariables.set('khqr_payload', '000201010212');
pm.collectionVariables.set('khqr_merchant_ref', ref);
runScript(r4.event[0].script.exec, pm);
runScript(r4.event[1].script.exec, pm);
allPassed(pm, 'R4 404-branch');

console.log(`\nSIMULATION: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
