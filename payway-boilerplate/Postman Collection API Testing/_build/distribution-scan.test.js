// Negative controls for the distribution policy (audit WP10 + the 2026-10-01
// independent review of remediation items 1-2). The review demonstrated two
// gaps in the first guard: an unapproved NON-HEX secret_key passed (the
// allowlist was shape-gated), and saved response examples were never scanned
// (a synthetic pwt in a body passed). These tests pin the closed behavior:
// enforcement is by credential FIELD regardless of string shape, captured
// tokens in example bodies are redacted to clearly synthetic placeholders,
// and the demo secret may appear exactly once (its variable slot).
'use strict';

const assert = require('node:assert');
const { applyDistributionPolicy, DEMO_IDENTITY } = require('./distribution-scan');

function minimalExport(overrides = {}) {
  return {
    info: { name: 'PayWay API — Complete Collection', _postman_id: 'f2a1c9e0-8d7b-4c3a-9e5f-1a2b3c4d5e6f', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [],
    item: [],
    ...overrides,
  };
}

function variable(key, value) {
  return { key, value, type: key === 'secret_key' ? 'secret' : 'text' };
}

function savedExample(body) {
  return {
    name: 'sample',
    originalRequest: { method: 'POST', url: '{{baseUrl}}/api' },
    code: 200,
    status: 'OK',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body,
  };
}

const RUNS = [];
function run(name, fn) {
  try {
    fn();
    RUNS.push(`PASS  ${name}`);
  } catch (error) {
    RUNS.push(`FAIL  ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

run('authorized demo identity passes', () => {
  const out = minimalExport({
    variable: [
      variable('merchant_id', DEMO_IDENTITY.merchant_id),
      variable('secret_key', DEMO_IDENTITY.secret_key),
      variable('ctid', DEMO_IDENTITY.ctid),
      variable('whitelist_payee', DEMO_IDENTITY.whitelist_payee),
      variable('buyer_email', DEMO_IDENTITY.buyer_email),
      variable('buyer_phone', DEMO_IDENTITY.buyer_phone),
      variable('pwt', ''),
    ],
  });
  const applied = applyDistributionPolicy(out);
  assert.ok(Array.isArray(applied));
});

run('empty credential fields pass', () => {
  const out = minimalExport({
    variable: [variable('merchant_id', ''), variable('secret_key', ''), variable('ctid', '')],
  });
  applyDistributionPolicy(out);
});

run('unapproved NON-HEX secret_key is rejected (review repro)', () => {
  const out = minimalExport({ variable: [variable('secret_key', 'synthetic-not-authorized-key')] });
  assert.throws(() => applyDistributionPolicy(out), /secret_key/);
});

run('unapproved hex secret_key is rejected', () => {
  const out = minimalExport({ variable: [variable('secret_key', 'a'.repeat(40))] });
  assert.throws(() => applyDistributionPolicy(out), /secret_key/);
});

run('violation diagnostics never echo the offending value', () => {
  const offender = 'super-secret-live-key-value';
  const out = minimalExport({ variable: [variable('secret_key', offender)] });
  try {
    applyDistributionPolicy(out);
  } catch (error) {
    assert.ok(!String(error.message).includes(offender), 'diagnostic leaked the offending value');
    assert.match(String(error.message), /chars \(sha256:/);
    return;
  }
  assert.fail('expected the policy to reject an unapproved secret_key');
});

run('unapproved non-demo merchant_id is rejected regardless of shape', () => {
  const out = minimalExport({ variable: [variable('merchant_id', 'sonitatest')] });
  assert.throws(() => applyDistributionPolicy(out), /merchant_id/);
});

run('captured pwt inside a saved example body is redacted to a synthetic placeholder', () => {
  const out = minimalExport({
    variable: [variable('secret_key', DEMO_IDENTITY.secret_key)],
    item: [
      {
        name: 'CoF sample',
        item: [
          {
            name: 'token callback',
            request: { method: 'POST', url: '{{callback_listener}}' },
            response: [
              savedExample('{"request_id":"TESTREQ0001","payment_credential":{"ctid":"customer123","pwt":"8f14e45fceea167a5a36dedd4bea2543","status":"ACTIVE"}}'),
            ],
          },
        ],
      },
    ],
  });
  const applied = applyDistributionPolicy(out);
  const body = out.item[0].item[0].response[0].body;
  assert.ok(!body.includes('8f14e45fceea167a5a36dedd4bea2543'), 'captured token survived in the example body');
  assert.ok(body.includes('REDACTED-pwt'), 'body must carry the synthetic REDACTED-pwt placeholder');
  assert.ok(applied.some((entry) => entry.includes('redacted')), 'redaction must be reported in the applied list');
});

run('runtime-capture variable that is nonempty is rejected with redacted value', () => {
  const out = minimalExport({ variable: [variable('pwt', 'live-token-value-abc123')] });
  assert.throws(() => applyDistributionPolicy(out), /pwt/);
});

run('demo secret pasted into a description (2nd occurrence) is rejected', () => {
  const out = minimalExport({
    variable: [variable('secret_key', DEMO_IDENTITY.secret_key)],
    item: [{ name: 'leaky folder', description: `use ${DEMO_IDENTITY.secret_key} for signing`, item: [] }],
  });
  assert.throws(() => applyDistributionPolicy(out), /exactly once/);
});

run('personal workspace identifier anywhere is rejected', () => {
  const out = minimalExport({
    item: [{ name: 'folder', description: 'workspace 98cc8641-0aae-40d8-9ca2-22882fc7b6d6 linkage', item: [] }],
  });
  assert.throws(() => applyDistributionPolicy(out), /personal Postman identifier/);
});

run('personal webhook.site receiver reference in an example body is rejected', () => {
  const out = minimalExport({
    item: [{ name: 'folder', item: [{ name: 'req', request: {}, response: [savedExample('{"note":"pushback landed at https://webhook.site/6adc6e49-52f3-4842-98b0-528a1e37cda2"}')] }] }],
  });
  assert.throws(() => applyDistributionPolicy(out), /receiver reference/);
});

run('non-demo email anywhere is rejected', () => {
  const out = minimalExport({
    item: [{ name: 'folder', item: [{ name: 'req', request: {}, response: [savedExample('{"email":"someone.real@bank.com.kh"}')] }] }],
  });
  assert.throws(() => applyDistributionPolicy(out), /non-demo email/);
});

run('private key material anywhere is rejected', () => {
  const out = minimalExport({
    item: [{ name: 'folder', item: [{ name: 'req', request: {}, response: [savedExample('{"pem":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"}')] }] }],
  });
  assert.throws(() => applyDistributionPolicy(out), /private key/);
});

run('personal receiver URL in callback_url is replaced by the placeholder', () => {
  const b64 = Buffer.from('https://webhook.site/6adc6e49-52f3-4842-98b0-528a1e37cda2').toString('base64');
  const out = minimalExport({ variable: [variable('callback_url', b64)] });
  const applied = applyDistributionPolicy(out);
  assert.strictEqual(out.variable[0].value, 'https://example.com/payway-callback-placeholder');
  assert.ok(applied.some((entry) => entry.includes('callback_url')));
});

run('captured pwt inside an ESCAPED JSON-in-JSON example body is redacted (webhook.site capture shape)', () => {
  const captured = '{"data":[{"id":"9f2c1b4a","method":"POST","content":"{\\"request_id\\":\\"TESTREQ0001\\",\\"payment_credential\\":{\\"ctid\\":\\"customer123\\",\\"pwt\\":\\"8f14e45fceea167a5a36dedd4bea2543…\\",\\"token_flag\\":\\"CITI_FLEX\\"}}"}]}';
  const out = minimalExport({
    item: [{ name: 'folder', item: [{ name: 'pull', request: {}, response: [savedExample(captured)] }] }],
  });
  const applied = applyDistributionPolicy(out);
  const body = out.item[0].item[0].response[0].body;
  assert.ok(!body.includes('8f14e45fceea167a5a36dedd4bea2543'), 'escaped captured token survived');
  assert.ok(body.includes('REDACTED-pwt'), 'escaped body must carry REDACTED-pwt');
  assert.ok(body.includes('\\"token_flag\\":\\"CITI_FLEX\\"'), 'surrounding escaped structure must survive');
  assert.ok(applied.some((entry) => entry.includes('REDACTED-pwt')));
});

run('{{variable}} request-body templates are never rewritten', () => {
  // Guard for the regression the review's redaction scope could cause: the
  // CoF sample sender's request body legitimately carries "pwt": "{{pwt}}".
  const out = minimalExport({
    item: [
      {
        name: 'req',
        request: { method: 'POST', url: '{{callback_listener}}', body: { mode: 'raw', raw: '{\n  "payment_credential": {\n    "pwt": "{{pwt}}"\n  }\n}' } },
        response: [],
      },
    ],
  });
  const applied = applyDistributionPolicy(out);
  assert.ok(String(out.item[0].request.body.raw).includes('"pwt": "{{pwt}}"'), 'template placeholder was rewritten');
  assert.strictEqual(applied.filter((entry) => entry.includes('redacted')).length, 0);
});

console.log(RUNS.join('\n'));
if (process.exitCode) {
  console.error('\ndistribution-scan negative controls FAILED');
  process.exit(1);
}
console.log(`\ndistribution-scan negative controls: ${RUNS.length} checks passed`);
