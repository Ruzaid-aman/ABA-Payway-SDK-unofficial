// Trust-gate acceptance for the callback-import requests (audit WP05/WP06).
//
// WP05: unsigned/invalid/unrelated callbacks must NEVER overwrite operative
// token/customer values ({{pwt}}/{{ctid}}/{{token_flag}}); token values must
// never reach the console in plaintext; signed evidence is verified with the
// gateway's own HMAC rule (header channel first, classic body `hash` second).
// WP06: the sync selects the NEWEST complete record per category (explicit
// timestamp sort, API order only as fallback), keeps every association atomic
// (one record -> one association, no field mixing), and reports what it skipped.
//
// Runs the real request scripts in Postman-like vm sandboxes against synthetic
// webhook.site responses. No network, no gateway, no real credentials.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const CryptoJS = require('crypto-js');

const { loadYamlCollection } = require('./yaml_collection');
const collectionDir = path.join(__dirname, '..', 'postman', 'collections', 'PayWay API — Complete Collection');
const collection = loadYamlCollection(collectionDir);

const SECRET = 'synthetic-callback-import-secret';
const PWT = 'PW-SYNTHETIC-TOKEN-99887766';
const CTID = 'cust-fix-001';
const REQ_ID = 'REQ170000000001';
const REF = 'inv-fix-001';

function paywayConcat(obj) {
  return Object.keys(obj).filter((k) => k !== 'hash').sort().map((k) => {
    const v = obj[k];
    return (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
  }).join('');
}
function sign(bodyObj) {
  return CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA512(paywayConcat(bodyObj), SECRET));
}
// webhook.site-shaped capture record
function rec(body, opts = {}) {
  const out = { content: JSON.stringify(body) };
  if (opts.createdAt) out.created_at = opts.createdAt;
  if (opts.headers) out.headers = opts.headers;
  if (opts.reqHeaders) out.req_headers = opts.reqHeaders;
  return out;
}
const tokenBody = (over = {}) => Object.assign({
  request_id: REQ_ID,
  payment_credential: { ctid: CTID, pwt: PWT, type: 'CARD', status: 'ACTIVE', token_flag: 'CITI_FLEX', currency: 'USD' },
}, over);
const pushbackBody = (tranId, over = {}) => Object.assign({ tran_id: tranId, apv: 1, status: '0', return_params: '' }, over);

const pull = collection.requests.find((r) => r.relativePath.includes('Sync webhook.site - Postman'));
const khqrPull = collection.requests.find((r) => r.relativePath.includes('Pull webhook.site Callbacks (KHQR)'));
assert.ok(pull && khqrPull, 'both callback-import requests must exist');
const pullPre = pull.scripts.find((s) => s.type === 'beforeRequest').code;
const pullPost = pull.scripts.find((s) => s.type === 'afterResponse').code;
const khqrPre = khqrPull.scripts.find((s) => s.type === 'beforeRequest').code;
const khqrPost = khqrPull.scripts.find((s) => s.type === 'afterResponse').code;

const allLogs = [];

function freshVars() {
  const vars = new Map(collection.variables);
  vars.set('secret_key', SECRET);
  return vars;
}
function run(script, vars, listShape) {
  const logs = [];
  const tests = [];
  const response = { code: 200, json: () => listShape.json };
  response.to = { have: { status: (code) => { if (response.code !== code) throw new Error(`status ${response.code} !== ${code}`); } } };
  const pm = {
    collectionVariables: {
      get: (k) => (vars.has(k) ? vars.get(k) : undefined),
      set: (k, v) => vars.set(k, String(v)),
    },
    response,
    test: (name, fn) => {
      try { fn(); tests.push(['PASS', name]); } catch (e) { tests.push(['FAIL', name + ' :: ' + e.message]); }
    },
    expect: (val, msg) => ({
      to: {
        eql: (exp) => { if (val !== exp) throw new Error(msg || `expected ${JSON.stringify(val)} to eql ${JSON.stringify(exp)}`); },
        above: (n) => { if (!(val > n)) throw new Error(msg || `expected ${val} to be above ${n}`); },
        be: {
          a: (t) => { if (typeof val !== t) throw new Error(msg || `typeof ${typeof val} !== ${t}`); },
          an: (t) => { if (typeof val !== t) throw new Error(msg || `typeof ${typeof val} !== ${t}`); },
        },
      },
    }),
  };
  const sandbox = {
    pm,
    console: { log: (...a) => { const line = a.map(String).join(' '); logs.push(line); allLogs.push(line); } },
    require: (m) => { if (m === 'crypto-js') return CryptoJS; throw new Error('require ' + m); },
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseFloat, parseInt,
  };
  sandbox.eval = (code) => vm.runInContext(code, sandbox); // Postman: eval stays in the script's own scope
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'callback-import.vm.js' });
  return { vars, logs, tests };
}
function withWebhookToken(vars) { vars.set('webhook_token', '11111111-2222-3333-4444-555555555555'); return vars; }
function sync(vars, data, shape = 'paginated') {
  withWebhookToken(vars);
  const r = run(pullPre, vars, { json: null });
  const body = shape === 'paginated' ? { data } : data;
  return run(pullPost, vars, { json: body });
}
function trustReport(vars) { return JSON.parse(vars.get('callback_sync_trust')); }

let n = 0;
function ok(cond, label) { n++; assert.ok(cond, label); }

// --- WP06: newest-first selection ------------------------------------------
// Ordering fixtures use SIGNED pushbacks (the shape the collection's sample
// senders produce) so promotion is observable; unsigned-unanchored pushbacks
// deliberately never promote (covered in the WP05 section below).
const signedPushback = (tranId, opts = {}) => {
  const body = pushbackBody(tranId);
  return rec(body, Object.assign({}, opts, { headers: { 'X-PayWay-Hmac-Sha512': sign(body) } }));
};
{
  const { vars } = sync(freshVars(), [
    signedPushback('T-old', { createdAt: '2026-10-01T09:00:00Z' }),
    signedPushback('T-new', { createdAt: '2026-10-01T10:00:00Z' }),
  ]);
  ok(vars.get('tran_id') === 'T-new', 'WP06: newest wins regardless of list order (timestamp sort)');
  ok(vars.get('last_tran_id') === 'T-new', 'WP06: last_tran_id mirrors the selected record');
}
{
  // No timestamps available: the API's documented newest-first order is trusted.
  const { vars } = sync(freshVars(), [signedPushback('T-first'), signedPushback('T-second')]);
  ok(vars.get('tran_id') === 'T-first', 'WP06: without timestamps the first record (API newest-first) wins');
}
{
  const { vars } = sync(freshVars(), [
    signedPushback('T-a', { createdAt: '2026-10-01T10:00:00Z' }),
    signedPushback('T-b', { createdAt: '2026-10-01T09:30:00Z' }),
    signedPushback('T-c', { createdAt: '2026-10-01T09:00:00Z' }),
  ]);
  ok(vars.get('tran_id') === 'T-a', 'WP06: multi-payment fixtures pick the newest');
}
{
  // Duplicates: same tran_id twice -> newest instance selected, both recognized.
  const { vars } = sync(freshVars(), [
    signedPushback('T-dup', { createdAt: '2026-10-01T10:00:00Z' }),
    signedPushback('T-dup', { createdAt: '2026-10-01T09:00:00Z' }),
  ]);
  const rep = trustReport(vars);
  ok(vars.get('tran_id') === 'T-dup' && rep.pushback.found === 2, 'WP06: duplicates recognized and newest selected');
}
{
  // Partial payload: incomplete token callback never wins over a complete older one.
  const { vars, logs } = sync(freshVars().set('request_id', REQ_ID), [
    rec({ payment_credential: { pwt: PWT } }, { createdAt: '2026-10-01T10:00:00Z' }),
    rec(tokenBody(), { createdAt: '2026-10-01T09:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': sign(tokenBody()) } }),
  ]);
  ok(vars.get('pwt') === PWT && vars.get('ctid') === CTID, 'WP06: complete older record wins over incomplete newest');
  ok(logs.join('\n').includes('incomplete'), 'WP06: skipped-partial is reported');
}

// --- WP05: trust gates on the credential class ------------------------------
{
  // Unrelated token callback (request_id mismatch): operative values keep sentinels.
  const vars = freshVars();
  vars.set('request_id', REQ_ID);
  vars.set('pwt', 'sentinel-pwt');
  vars.set('ctid', 'sentinel-ctid');
  const { vars: v2, tests } = sync(vars, [
    rec(tokenBody({ request_id: 'REQ-OTHER-REQUEST' }), { createdAt: '2026-10-01T10:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': sign(tokenBody({ request_id: 'REQ-OTHER-REQUEST' })) } }),
  ]);
  ok(v2.get('pwt') === 'sentinel-pwt' && v2.get('ctid') === 'sentinel-ctid', 'WP05: unrelated-but-valid token callback never overwrites operative values');
  ok(trustReport(v2).skipped.join(' ').includes('MISMATCH'), 'WP05: mismatch is reported');
  ok(tests.every(([st]) => st === 'PASS'), 'WP05: invariant tests pass on the unrelated path');
}
{
  // Unsigned token callback: never promoted (correct signature channels exist).
  const vars = freshVars().set('request_id', REQ_ID);
  vars.set('pwt', 'sentinel-pwt');
  const { vars: v2 } = sync(vars, [rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z' })]);
  ok(v2.get('pwt') === 'sentinel-pwt', 'WP05: unsigned token callback is never promoted');
}
{
  // Invalid signature: never promoted, reported as invalid/tampered.
  const vars = freshVars().set('request_id', REQ_ID);
  vars.set('pwt', 'sentinel-pwt');
  const { vars: v2 } = sync(vars, [rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': 'Zm9yZ2VkLXNpZw==' } })]);
  ok(v2.get('pwt') === 'sentinel-pwt', 'WP05: invalid signature is never promoted');
  ok(trustReport(v2).skipped.join(' ').includes('invalid'), 'WP05: invalid verdict is reported');
}
{
  // Tampered body: signature computed over a DIFFERENT body must not verify.
  const vars = freshVars().set('request_id', REQ_ID);
  vars.set('pwt', 'sentinel-pwt');
  const signed = sign(tokenBody({ request_id: 'REQ-DIFFERENT-BODY' }));
  const { vars: v2 } = sync(vars, [rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': signed } })]);
  ok(v2.get('pwt') === 'sentinel-pwt', 'WP05: tampered body fails verification');
}
{
  // Happy path: verified + correlated -> atomic promotion of the whole association.
  const { vars, tests } = sync(freshVars().set('request_id', REQ_ID), [
    rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': sign(tokenBody()) } }),
  ]);
  ok(vars.get('pwt') === PWT && vars.get('ctid') === CTID && vars.get('token_flag') === 'CITI_FLEX', 'WP05: verified+correlated callback promotes the association');
  ok(trustReport(vars).token.trust === 'verified+correlated', 'WP05: trust label recorded');
  ok(tests.every(([st]) => st === 'PASS'), 'WP05: invariant tests pass on the happy path');
}
{
  // Classic CoF body-hash channel (docs/09 §5): no header, `hash` inside the body.
  const body = tokenBody();
  body.hash = sign(body);
  const { vars } = sync(freshVars().set('request_id', REQ_ID), [rec(body, { createdAt: '2026-10-01T10:00:00Z' })]);
  ok(vars.get('pwt') === PWT, 'WP05: body-hash channel verifies (stripHash contract)');
}
{
  // Header-shape tolerance: object map (single value / array value), raw string.
  for (const headers of [
    { 'x-payway-hmac-sha512': sign(tokenBody()) },
    { 'X-PayWay-Hmac-Sha512': [sign(tokenBody())] },
  ]) {
    const { vars } = sync(freshVars().set('request_id', REQ_ID), [rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z', headers })]);
    ok(vars.get('pwt') === PWT, 'WP05: header shape tolerated (' + Object.keys(headers)[0] + ')');
  }
  const raw = 'Host: webhook.site\r\nX-PayWay-Hmac-Sha512: ' + sign(tokenBody()) + '\r\nContent-Type: application/json';
  const { vars } = sync(freshVars().set('request_id', REQ_ID), [rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z', reqHeaders: raw })]);
  ok(vars.get('pwt') === PWT, 'WP05: raw req_headers shape tolerated');
}
{
  // No secret_key configured -> nothing can verify -> nothing is promoted (server parity).
  const vars = freshVars();
  vars.set('secret_key', '');
  vars.set('request_id', REQ_ID);
  vars.set('pwt', 'sentinel-pwt');
  const { vars: v2 } = sync(vars, [rec(tokenBody(), { createdAt: '2026-10-01T10:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': sign(tokenBody()) } })]);
  ok(v2.get('pwt') === 'sentinel-pwt', 'WP05: without a configured key, signed callbacks stay unverified and unpromoted');
}

// --- WP05: unsigned pushback tiers ------------------------------------------
{
  // Payment-link-shaped pushback, ref matches the session reference -> lookup hint.
  const vars = freshVars().set('merchant_ref_no', REF);
  vars.set('tran_id', 'sentinel-tran');
  const body = { tran_id: 'T-link', status: 0, merchant_ref_no: REF };
  const { vars: v2 } = sync(vars, [rec(body, { createdAt: '2026-10-01T10:00:00Z' })]);
  ok(v2.get('tran_id') === 'T-link', 'WP05: ref-correlated unsigned pushback promotes as lookup hint');
  ok(trustReport(v2).pushback.trust.includes('unsigned-hint'), 'WP05: unsigned-hint trust label recorded');
}
{
  // Unsigned pushback WITHOUT a correlation anchor: operative tran_id untouched.
  const vars = freshVars();
  vars.set('tran_id', 'sentinel-tran');
  const body = { tran_id: 'T-stray', status: 0 };
  const { vars: v2 } = sync(vars, [rec(body, { createdAt: '2026-10-01T10:00:00Z' })]);
  ok(v2.get('tran_id') === 'sentinel-tran', 'WP05: unanchored unsigned pushback never overwrites tran_id');
  ok(v2.get('unverified_tran_id') === 'T-stray', 'WP05: candidate parked in {{unverified_tran_id}}');
}
{
  // Verified pushback: promoted with the verified trust label.
  const body = pushbackBody('T-signed');
  const { vars } = sync(freshVars(), [rec(body, { createdAt: '2026-10-01T10:00:00Z', headers: { 'X-PayWay-Hmac-Sha512': sign(body) } })]);
  ok(vars.get('tran_id') === 'T-signed' && trustReport(vars).pushback.trust === 'verified', 'WP05: signed pushback promoted as verified');
}

// --- designed failure signal -------------------------------------------------
{
  const { tests } = sync(freshVars(), [rec({ hello: 1 }, { createdAt: '2026-10-01T10:00:00Z' })]);
  ok(tests.some(([st, nm]) => st === 'FAIL' && /recognizable callback/.test(nm)), 'no recognizable payload raises the designed failing test');
}

// --- folder 09 KHQR pull: correlation gate (WP06 sibling fix) ----------------
{
  const pushback = { transaction_id: 'PWH-777', merchant_ref: REF, payment_status_code: 0, payment_status: 'APPROVED', payment_amount: 0.1, payment_currency: 'USD' };
  const khqr = (vars, json) => {
    withWebhookToken(vars);
    run(khqrPre, vars, { json: null });
    return run(khqrPost, vars, { json });
  };
  const unset = khqr(freshVars(), { data: [rec(pushback, { createdAt: '2026-10-01T10:00:00Z' })] });
  ok(!unset.vars.get('khqr_transaction_id'), 'WP06: KHQR pull without a session reference imports nothing');
  const set = khqr(freshVars().set('khqr_merchant_ref', REF).set('merchant_ref', REF), { data: [rec(pushback, { createdAt: '2026-10-01T10:00:00Z' })] });
  ok(set.vars.get('khqr_transaction_id') === 'PWH-777', 'WP06: KHQR pull with matching reference imports the pushback');
  const stray = khqr(freshVars().set('khqr_merchant_ref', 'inv-other'), { data: [rec(pushback, { createdAt: '2026-10-01T10:00:00Z' })] });
  ok(!stray.vars.get('khqr_transaction_id'), 'WP06: KHQR pull refuses mismatched references');
}

// --- WP05: no secret material in any log line --------------------------------
{
  const blob = allLogs.join('\n');
  ok(!blob.includes(SECRET), 'no log line ever contains the signing key');
  ok(!blob.includes(PWT), 'no log line ever contains the token value');
  ok(/\d+ chars, ends \.\.\./.test(blob), 'token mentions are masked (length + suffix)');
}

console.log(`callback-import trust gates: ${n} checks passed`);
