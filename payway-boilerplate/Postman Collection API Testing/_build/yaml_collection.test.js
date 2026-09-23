const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { generateKeyPairSync, privateDecrypt, constants, webcrypto } = require('node:crypto');
const { loadYamlCollection } = require('./yaml_collection');

const projectDir = path.join(__dirname, '..');
const collectionDir = path.join(projectDir, 'postman', 'collections', 'PayWay API — Complete Collection');
const collection = loadYamlCollection(collectionDir);

assert.equal(collection.variables.size, 122, 'latest YAML collection variable count changed');
assert.equal(collection.requests.length, 45, 'latest YAML collection request count changed');
assert.ok(collection.requests.every((request) => request.url), 'every request must have a URL');
assert.ok(collection.requests.some((request) => request.relativePath.includes('Build Offline KHQR')),
  'offline KHQR request must be discoverable');
assert.ok(collection.requests.some((request) => request.relativePath.includes('Exchange Rate')),
  'exchange-rate smoke request must be discoverable');

const resources = fs.readFileSync(path.join(projectDir, '.postman', 'resources.yaml'), 'utf8');
assert.match(resources, /localResources:[\s\S]*\.\.\/postman\/collections\/PayWay API — Complete Collection/,
  'Postman local resources must point at the canonical postman/collections tree');
assert.doesNotMatch(resources, /PayWay API — Complete Collection-1/,
  'Postman resource mappings must not retain the divergent duplicate collection');

const helpers = collection.variables.get('__helpers_v20260923_portable_v2');
assert.ok(helpers, 'versioned helper source must exist so stale Postman local values cannot override updates');
const staleVariables = new Map([['__helpers_v20260923_portable', "var CryptoJS = require('crypto-js'); function openSslEncrypt() { throw new Error('stale helper'); }"]]);
const bootstrapBox = vm.createContext({
  globalThis: undefined, // Postman's sandbox may not expose this global.
  pm: { collectionVariables: {
    get: (key) => staleVariables.get(key),
    set: (key, value) => staleVariables.set(key, String(value)),
  } },
  require(name) { if (name === 'crypto-js') return require('crypto-js'); throw new Error(name); },
  crypto: webcrypto,
  console: { log() {} },
});
vm.runInContext(collection.definition.scripts.find((script) => script.type === 'http:beforeRequest').code, bootstrapBox);
assert.ok(staleVariables.get('__helpers_v20260923_portable_v2'),
  'collection pre-request must bootstrap the portable helper when Postman retains only the prior variable');
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const payload = JSON.stringify({ mc_id: 'merchant', title: 'Payment link with café and Khmer សាកល្បង', notes: 'x'.repeat(180) });
bootstrapBox.__payload = payload;
bootstrapBox.__pem = publicKey;
vm.runInContext('this.__bootstrapCiphertext = openSslEncrypt(__payload, __pem);', bootstrapBox);
const bootCipher = Buffer.from(bootstrapBox.__bootstrapCiphertext, 'base64');
const bootPlain = [];
for (let offset = 0; offset < bootCipher.length; offset += 128) {
  bootPlain.push(privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, bootCipher.subarray(offset, offset + 128)));
}
assert.equal(Buffer.concat(bootPlain).toString('utf8'), payload,
  'existing Postman imports must use portable RSA after bootstrap');
const legacyVars = new Map(collection.variables);
legacyVars.delete('__helpers_v20260923_portable_v2');
legacyVars.set('__helpers_v20260923_portable', require('./part_00_info.json').variable.find((item) => item.key === '__helpers').value);
legacyVars.set('__helpers_v20260923', require('./part_00_info.json').variable.find((item) => item.key === '__helpers').value);
const createLink = collection.requests.find((request) => request.relativePath.endsWith('Create Payment Link.request.yaml'));
const linkLogs = [];
const legacyBox = vm.createContext({
  globalThis: undefined,
  pm: { collectionVariables: {
    get: (key) => legacyVars.get(key),
    set: (key, value) => legacyVars.set(key, String(value)),
  }, execution: { skipRequest() { throw new Error('Payment link was unexpectedly skipped'); } } },
  require(name) { if (name === 'crypto-js') return require('crypto-js'); throw new Error(name); },
  crypto: webcrypto,
  console: { log(...args) { linkLogs.push(args); } },
});
vm.runInContext(createLink.scripts.find((script) => script.type === 'beforeRequest').code, legacyBox);
const linkPayload = JSON.parse(linkLogs.find((entry) => entry[0] === 'RSA payload:')[1]);
assert.equal(typeof linkPayload.expired_date, 'number',
  'payment-link expiry must be Unix epoch seconds inside merchant_auth');
assert.ok(linkPayload.expired_date > Math.floor(Date.now() / 1000) + 6 * 86400,
  'payment-link expiry must be in the future');
assert.equal(linkPayload.return_url, legacyVars.get('return_url'),
  'an already-base64 return_url must not be encoded a second time');
assert.ok(legacyVars.get('__helpers_v20260923_portable_v2'),
  'payment-link request must migrate a stale import even if Postman does not refresh the collection-level script');
const linkCipher = Buffer.from(legacyVars.get('computed_merchant_auth'), 'base64');
assert.ok(linkCipher.length >= 128, 'the migrated payment-link request must compute RSA merchant_auth');
const responseChecks = [];
const responseVars = new Map();
const visualizations = [];
const createdLink = {
  data: {
    id: 'T0LxC5ScY16CB1vjSpRH7Q==',
    title: 'Test Payment Link',
    amount: '0.10',
    currency: 'USD',
    status: 'OPEN',
    expired_date: 1790763875,
    payment_link: 'https://link-sandbox.payway.com.kh/ABAPAYPe91300Q',
  },
  status: { code: '00', message: 'Success.' },
  tran_id: 179015907417582,
};
vm.runInNewContext(createLink.scripts.find((script) => script.type === 'afterResponse').code, {
  pm: {
    test(name, check) { check(); responseChecks.push(name); },
    collectionVariables: { set(key, value) { responseVars.set(key, String(value)); } },
    visualizer: { set(template, data) { visualizations.push({ template, data }); } },
    response: {
      to: { have: { status(expected) { assert.equal(expected, 200, 'successful create responses must be accepted'); } } },
      headers: { get() { return 'application/json'; } },
      json() { return createdLink; },
    },
    expect: require('chai').expect,
  },
});
assert.equal(responseChecks.length, 3, 'all create-link success checks must run');
assert.equal(responseVars.get('payment_link_id'), createdLink.data.id,
  'successful create must save the exact link ID for detail and void requests');
assert.equal(visualizations.length, 1, 'successful create must render a payment-link Visualizer card');
assert.equal(visualizations[0].data.url, createdLink.data.payment_link,
  'Visualizer must show the gateway-provided hosted payment URL');
assert.match(visualizations[0].template, /Copy link/, 'Visualizer must offer a copy action');
assert.match(visualizations[0].template, /target="_blank"/, 'Visualizer link must open a new browser tab');
const renderedLink = require('handlebars').compile(visualizations[0].template)(visualizations[0].data);
assert.ok(renderedLink.includes(`href="${createdLink.data.payment_link}"`),
  'rendered card must link to the exact hosted payment page');
assert.ok(renderedLink.includes(`value="${createdLink.data.payment_link}"`),
  'rendered card must expose the URL as selectable text');
let copyClicked;
let selected = false;
const copyInput = { value: createdLink.data.payment_link, focus() {}, select() { selected = true; } };
const copyStatus = { textContent: '' };
const copyScript = visualizations[0].template.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(copyScript, 'Visualizer must include the copy-button interaction');
vm.runInNewContext(copyScript[1], {
  document: {
    getElementById(id) {
      return id === 'payway-link' ? copyInput : id === 'copy-status' ? copyStatus :
        { addEventListener(event, callback) { if (event === 'click') copyClicked = callback; } };
    },
    execCommand(command) { assert.equal(command, 'copy'); return true; },
  },
});
copyClicked();
assert.equal(selected, true, 'copy fallback must select the payment URL');
assert.equal(copyStatus.textContent, 'Link copied.', 'copy fallback must confirm success');
const failedVisuals = [];
const failedVars = new Map();
vm.runInNewContext(createLink.scripts.find((script) => script.type === 'afterResponse').code, {
  pm: {
    test(_name, check) { try { check(); } catch (_error) {} },
    collectionVariables: { set(key, value) { failedVars.set(key, value); } },
    visualizer: { set(template, data) { failedVisuals.push({ template, data }); } },
    response: {
      to: { have: { status(expected) { assert.equal(expected, 400); } } },
      headers: { get() { return 'application/json'; } },
      json() { return { status: { code: 'PTL04', message: 'Parameter validation required' }, data: null }; },
    },
    expect: require('chai').expect,
  },
});
assert.equal(failedVisuals.length, 0, 'failed create must not display a shareable payment link');
assert.equal(failedVars.has('payment_link_id'), false, 'failed create must not replace the saved link ID');
const helperBox = vm.createContext({
  globalThis: undefined,
  pm: {
    collectionVariables: { get: () => '' },
  },
  crypto: webcrypto,
  require(name) {
    if (name === 'crypto-js') return require('crypto-js');
    throw new Error(`unsupported built-in ${name}`);
  },
});
helperBox.__payload = payload;
helperBox.__pem = publicKey;
vm.runInContext(`${helpers}\nthis.__encrypted = openSslEncrypt(__payload, __pem);`, helperBox);
const ciphertext = Buffer.from(helperBox.__encrypted, 'base64');
assert.equal(ciphertext.length % 128, 0, 'RSA output must consist of full modulus-sized blocks');
const cleartext = [];
for (let offset = 0; offset < ciphertext.length; offset += 128) {
  cleartext.push(privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, ciphertext.subarray(offset, offset + 128)));
}
assert.equal(Buffer.concat(cleartext).toString('utf8'), payload, 'portable RSA ciphertext must decrypt to the original UTF-8 payload');
helperBox.__pem = collection.variables.get('rsa_public_key');
vm.runInContext('this.__collectionKeyCiphertext = openSslEncrypt(__payload, __pem);', helperBox);
assert.equal(Buffer.from(helperBox.__collectionKeyCiphertext, 'base64').length % 128, 0,
  'the collection public key must be accepted by the portable RSA helper');

const rsaRequests = collection.requests.filter((request) =>
  (request.scripts || []).some((script) => script.type === 'beforeRequest' && String(script.code).includes('rsaFallback(')));
assert.equal(rsaRequests.length, 11, 'all RSA-dependent requests must be audited');
for (const request of rsaRequests) {
  let skipped = false;
  const vars = new Map(collection.variables);
  vars.set('last_tran_id', 'T123');
  vars.set('tran_id', 'T123');
  vars.set('payment_link_id', '123');
  vars.set('refund_merchant_auth', '');
  vars.set('pl_merchant_auth', '');
  vars.set('preauth_merchant_auth', '');
  vars.set('preauth_payout_merchant_auth', '');
  vars.set('cancel_preauth_merchant_auth', '');
  vars.set('payout_beneficiaries', '');
  vars.set('add_whitelist_merchant_auth', '');
  vars.set('update_whitelist_merchant_auth', '');
  const box = vm.createContext({
    pm: {
      collectionVariables: {
        get: (key) => vars.get(key),
        set: (key, value) => vars.set(key, value == null ? '' : String(value)),
      },
      execution: { skipRequest: () => { skipped = true; } },
      require: () => { throw new Error('package unavailable'); },
    },
    require(name) {
      if (name === 'crypto-js') return require('crypto-js');
      throw new Error(`unsupported built-in ${name}`);
    },
    console: { log() {}, error() {} },
  });
  const before = request.scripts.filter((script) => script.type === 'beforeRequest').map((script) => script.code).join('\n');
  vm.runInContext(before, box);
  assert.equal(skipped, true, `${request.relativePath} must skip before sending an empty RSA payload`);
}

for (const request of collection.requests) {
  for (const script of request.scripts || []) {
    assert.doesNotMatch(String(script.code || ''), /\bpostman\.setNextRequest\b/,
      `${request.relativePath} must use pm.execution.setNextRequest`);
  }
}

console.log(`YAML collection loaded: ${collection.requests.length} requests, ${collection.variables.size} variables`);
