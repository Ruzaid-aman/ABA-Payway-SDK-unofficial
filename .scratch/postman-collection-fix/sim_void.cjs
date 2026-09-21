// Postman-faithful simulation of the new "Void Payment Link" request scripts.
// Each script runs in its OWN vm scope (Postman rule); only the pm variable
// store is shared. crypto-js and node-forge are shims over node:crypto with
// REAL HMAC and REAL RSA-PKCS1-v1_5 public encryption.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

const colPath = path.resolve(__dirname, '../..', 'payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json');
const c = JSON.parse(fs.readFileSync(colPath, 'utf8'));
const f05 = c.item.find((f) => f.name.startsWith('05'));
const voidReq = f05.item.find((it) => it.name === 'Void Payment Link');
const helpers = c.variable.find((v) => v.key === '__helpers').value;
const getVar = Object.fromEntries(c.variable.map((v) => [v.key, v.value]));

const cryptoJs = {
  HmacSHA512: (msg, key) => crypto.createHmac('sha512', key).update(msg, 'utf8').digest(),
  enc: {
    Base64: { stringify: (wa) => wa.toString('base64') },
    Utf8: { parse: (s) => Buffer.from(s, 'utf8') },
  },
};
const forge = {
  pki: {
    publicKeyFromPem: (pem) => {
      const der = crypto.createPublicKey({ key: pem, format: 'pem' }).export({ format: 'der', type: 'spki' });
      // 1024-bit key -> 128-byte modulus; derive bitLength from DER size (spki overhead ~22 bytes)
      const modLen = der.length - 22;
      return { n: { bitLength: () => modLen * 8 }, encrypt: (chunk) => crypto.publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(chunk, 'binary')) };
    },
  },
  util: {
    createBuffer: (str, enc) => ({ getBytes: () => Buffer.from(str, 'utf8').toString('binary') }),
    encode64: (bin) => Buffer.from(bin, 'binary').toString('base64'),
  },
};

function makePm(store, responseFixture) {
  const tests = [];
  const logs = [];
  const pm = {
    collectionVariables: { get: (k) => store[k], set: (k, v) => { store[k] = String(v); } },
    expect: (a) => ({ to: { eql: (b) => { if (String(a) !== String(b)) throw new Error(`expect ${a} eql ${b}`); }, be: { a: (t) => { if (typeof a !== t) throw new Error('type'); }, oneOf: (arr) => { if (!arr.map(String).includes(String(a))) throw new Error(`not oneOf`); } } } }),
    test: (name, fn) => { try { fn(); tests.push(['PASS', name]); } catch (e) { tests.push(['FAIL', name + ' — ' + e.message]); } },
    response: {
      code: responseFixture.code,
      json: () => JSON.parse(responseFixture.body),
    },
  };
  return { pm, tests, logs };
}

function runScript(code, store, responseFixture, label) {
  const { pm, tests } = makePm(store, responseFixture);
  const sandbox = { pm, console: { log: (...a) => store.__logs.push(label + ': ' + a.join(' ')) }, require: (m) => (m === 'crypto-js' ? cryptoJs : m === 'node-forge' ? forge : {}) };
  vm.createContext(sandbox);
  vm.runInContext(helpers + '\n' + code, sandbox); // helpers + script share one eval scope chain in this harness phase
  return tests;
}

// ---- pre-request ----
const store = { ...getVar, payment_link_id: 'TESTLINK123', __logs: [] };
const pre = voidReq.event.find((e) => e.listen === 'prerequest').script.exec.join('\n');
runScript(pre, store, { code: 0, body: '{}' }, 'PRE');

const reqTime = store.request_time;
const merchant = store.merchant_id;
const auth = store.computed_merchant_auth;
const expectedHash = crypto.createHmac('sha512', store.secret_key).update(reqTime + merchant + auth, 'utf8').digest('base64');
console.log('merchant_auth computed:', typeof auth === 'string' && auth.length > 100 ? `YES (${auth.length} b64 chars)` : 'NO');
console.log('hash == HMAC(req_time+merchant_id+merchant_auth):', store.computed_hash === expectedHash);
console.log('payload logged contains {mc_id,id}:', store.__logs.some((l) => l.includes('mc_id') && l.includes('TESTLINK123')));

// guard: no link id -> clear throw
const store2 = { ...getVar, payment_link_id: '', __logs: [] };
let threw = '';
try { runScript(pre, store2, { code: 0, body: '{}' }, 'PRE2'); } catch (e) { threw = e.message; }
console.log('guard fires without payment_link_id:', threw.includes('No {{payment_link_id}}'));

// ---- test script branches ----
const test = voidReq.event.find((e) => e.listen === 'test').script.exec.join('\n');
const cases = {
  'success 200/00': { code: 200, body: JSON.stringify({ status: { code: '00', message: 'Success.' }, tran_id: 12345 }) },
  'already voided 403 PTL188': { code: 403, body: JSON.stringify({ status: { code: 'PTL188', message: 'The payment link is already voided.' } }) },
  'bogus id 403/96': { code: 403, body: JSON.stringify({ status: { code: '96', message: 'Invalid merchant data' } }) },
  'unexpected 500': { code: 500, body: JSON.stringify({ status: { code: '9', message: 'boom' } }) },
};
for (const [label, fixture] of Object.entries(cases)) {
  const s = { ...store, __logs: [] };
  const tests = runScript(test, s, fixture, label);
  console.log(`[${label}]`, tests.map(([r, n]) => `${r}:${n.slice(0, 48)}`).join(' | '));
}
