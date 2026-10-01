// Distribution policy for the shareable Postman export (audit WP10 + the
// 2026-10-01 independent review ITEMS-1-2-REVIEW).
//
// The dist/*.postman_collection.json is the artifact merchant developers
// import. It must carry only the documented demo identity and synthetic
// values — never the maintainer's personal Postman workspace/cloud linkage,
// runtime tokens captured during testing, live receiver URLs, or credentials
// inside saved response examples. This module is applied by export_json.js on
// EVERY build and --check, so the committed distribution is sanitized by
// construction and the gate is re-proven on CI.
//
// Enforcement is BY FIELD, not by string shape (the review showed a shape-only
// secret allowlist accepts an unapproved non-hex key): the credential fields
// below must carry exactly the authorized demo value or be empty, regardless
// of what the value looks like. Diagnostics are REDACTED — a violation report
// never echoes the offending value.
//
// Credential disposition (owner-recorded): the pre-filled sandbox merchant
// (ec476910) and its secret_key are this project's OWN sandbox credentials,
// committed to this repository by maintainer direction for zero-setup demo
// use. They are the ONLY credential values the export may carry; the field
// policy below is that disposition, mechanically enforced. Redistribution
// authorization beyond this repo (public npm/GitHub publication) is a
// separate release-time owner check (REPORT.md R05/WP10).
'use strict';

const { createHash } = require('node:crypto');

// Personal identifiers observed in .postman/resources.yaml (workspace id +
// cloud collection UID). If these ever reach the export, the build fails —
// a recipient must never inherit the maintainer's Postman cloud workspace.
const FORBIDDEN_PERSONAL_IDENTIFIERS = [
  '98cc8641-0aae-40d8-9ca2-22882fc7b6d6', // maintainer workspace id
  'a1451da9-e13b-4c71-a829-0899c8ecbbba', // cloud collection resource id
];

// The documented demo identity (see module header): the ONLY credential/
// identity values the distribution may carry. Credential-shaped variables
// outside these exact values fail regardless of string shape.
const DEMO_IDENTITY = {
  merchant_id: 'ec476910', // project sandbox merchant id (owner-directed disposition)
  secret_key: '05082504b76df71e468f8c0ff36f863e19e4cd29', // its secret_key (Postman Secret-typed)
  ctid: 'customer123', // demo CoF customer id
  whitelist_payee: '500000001', // seeded sandbox beneficiary (docs sample 318… is NOT whitelisted)
  buyer_email: 'test@example.com', // synthetic buyer email
  buyer_phone: '0123456789', // synthetic buyer phone
};

const AUTHORIZED_VALUES = new Set([
  ...Object.values(DEMO_IDENTITY),
  'Test', // buyer_first_name
  'User', // buyer_last_name
  'MREF-0001', // demo merchant reference
  // Official KHQR guideline sample merchant (developer.payway.com.kh):
  'abaakhppxxx@abaa',
  '323080411495479',
  'ABA Bank',
  'LUCKY SUPER MARKET 102',
  '5544',
]);

// Runtime-capture variables: populated only by request flows at test time.
// The distribution must ship them EMPTY (audit WP05/WP10).
const MUST_BE_EMPTY_VARIABLES = [
  'pwt',
  'webhook_token',
  'callback_listener',
  'tran_id',
  'last_tran_id',
  'payment_link_id',
  'refund_merchant_auth',
  'pl_merchant_auth',
  'preauth_merchant_auth',
  'preauth_payout_merchant_auth',
  'cancel_preauth_merchant_auth',
  'add_whitelist_merchant_auth',
  'update_whitelist_merchant_auth',
];

// Saved examples and scripts must never carry a credential value under these
// JSON keys. Captured values are redacted to a clearly synthetic placeholder
// at export time (review: "replacing captured tokens … with clearly synthetic
// fixtures or placeholders").
// Matches the credential key in BOTH plain JSON ("pwt":"v") and escaped
// JSON-in-JSON (\"pwt\":\"v\" — webhook.site captures embed the callback
// payload as an escaped string). Value capture is non-greedy up to the first
// closing quote (optionally backslash-escaped), so the surrounding structure
// survives the rewrite.
const CREDENTIAL_BODY_KEYS =
  /([\\]+)?"(pwt|payment_token|access_token|token|secret_key|secret|api_key|apikey|password|passwd)([\\]+)?":\s*([\\]+)?"((?:\\.|[^"\\])*?)([\\]+)?"/g;

const PLACEHOLDER_RECEIVER_URL = 'https://example.com/payway-callback-placeholder';
const REDECTION_PREFIX = 'REDACTED-';

function isInstructional(value) {
  return /^(?:your|placeholder|replace|example|sample|<|\.\.\.)/i.test(value);
}

function redactValue(value) {
  // Never echo a rejected secret: report length + hash prefix only.
  const digest = createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
  return `${String(value).length} chars (sha256:${digest})`;
}

function isBase64(str) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(str) && str.length % 4 === 0 && str.length >= 8;
}

function looksLikeWebhookSiteReceiver(value) {
  if (typeof value !== 'string') return false;
  if (/webhook\.site\/[0-9a-f][0-9a-f-]{7,}/i.test(value)) return true;
  if (isBase64(value)) {
    try {
      return /webhook\.site\/[0-9a-f][0-9a-f-]{7,}/i.test(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
      return false;
    }
  }
  return false;
}

/** Distribution placeholders applied at export time (WP10 receiver linkage). */
function distributeValue(key, value) {
  if (
    looksLikeWebhookSiteReceiver(value) &&
    (key === 'callback_url' || key === 'return_url' || key === 'cancel_url' || key === 'continue_success_url')
  ) {
    return { value: PLACEHOLDER_RECEIVER_URL, reason: 'personal webhook.site receiver URL replaced with placeholder' };
  }
  return { value, reason: null };
}

function walkNodes(node, visit) {
  if (Array.isArray(node)) {
    for (const entry of node) walkNodes(entry, visit);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      visit(key, value);
      walkNodes(value, visit);
    }
  }
}

/** Visit every string leaf (bodies, descriptions, script lines, urls, …). */
function walkStrings(node, visit) {
  walkNodes(node, (key, value) => {
    if (typeof value === 'string') visit(key, value);
  });
}

/**
 * Redacts captured credential values under credential JSON keys in any
 * string leaf. Returns the redacted string unchanged when there is nothing
 * to redact. Pure — the caller owns mutation and the applied-decision log.
 */
function redactLeaf(key, value, applied) {
  if (typeof value !== 'string') return value;
  return value.replace(
    CREDENTIAL_BODY_KEYS,
    (full, preKey, keyName, postKey, preVal, captured, postVal) => {
      if (!captured || isInstructional(captured) || captured.startsWith(REDECTION_PREFIX)) return full;
      applied.push(
        `${key}: captured credential value under "${keyName}" redacted to ${REDECTION_PREFIX}${keyName}`,
      );
      return `${preKey || ''}"${keyName}${postKey || ''}":${preVal || ''}"${REDECTION_PREFIX}${keyName}${postVal || ''}"`;
    },
  );
}

/**
 * Applies the distribution policy to a built export (mutates `out` in place
 * where placeholders/redactions are required) and returns the applied
 * decisions. Throws on any violation that cannot be sanitized — a
 * distribution carrying personal linkage, runtime tokens, or unauthorized
 * credentials must fail the build, not ship. Diagnostics are redacted.
 */
function applyDistributionPolicy(out) {
  const applied = [];
  const violations = [];

  // 1. Structural: no personal workspace/cloud linkage keys anywhere.
  walkNodes(out, (key) => {
    if (/^(workspace|cloudResources|workspaceId|cloudId)$/i.test(key)) {
      violations.push(`forbidden personal-linkage key in export: ${key}`);
    }
  });

  // 2. Variable policy — BY FIELD first, then by shape for everything else.
  for (const variable of out.variable || []) {
    const { key } = variable;
    let { value } = variable;
    value = value == null ? '' : String(value);

    const decision = distributeValue(key, value);
    if (decision.reason) {
      value = decision.value;
      variable.value = value;
      applied.push(`${key}: ${decision.reason}`);
    }

    // Field policy: credential/identity fields must carry EXACTLY the
    // authorized demo value (or be empty) — string shape is irrelevant.
    if (key in DEMO_IDENTITY && value !== '' && value !== DEMO_IDENTITY[key]) {
      violations.push(`variable "${key}" does not carry the authorized demo identity (${redactValue(value)})`);
    }
    if (key === 'rsa_public_key' && value !== '' && !value.includes('-----BEGIN PUBLIC KEY-----')) {
      violations.push(`variable "rsa_public_key" must be a public-key PEM or empty (${redactValue(value)})`);
    }

    if (MUST_BE_EMPTY_VARIABLES.includes(key) && value !== '') {
      violations.push(`runtime-capture variable "${key}" must ship empty (${redactValue(value)})`);
    }
    if (value && !(key in DEMO_IDENTITY)) {
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) {
        violations.push(`variable "${key}" carries a private key`);
      }
      if (/^[0-9a-f]{32,}$/i.test(value) && !AUTHORIZED_VALUES.has(value)) {
        violations.push(`variable "${key}" carries an unauthorized hex secret (${redactValue(value)})`);
      }
      if (/^[A-Za-z0-9]{24,}$/.test(value) && !/^[0-9a-f]{32,}$/i.test(value) && !AUTHORIZED_VALUES.has(value)) {
        violations.push(`variable "${key}" carries an unauthorized high-entropy token (${redactValue(value)})`);
      }
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && !AUTHORIZED_VALUES.has(value)) {
        violations.push(`variable "${key}" carries a non-demo email (PII scan)`);
      }
      if (/^0\d{8,9}$/.test(value) && !AUTHORIZED_VALUES.has(value)) {
        violations.push(`variable "${key}" carries a non-demo phone number (PII scan)`);
      }
      if (looksLikeWebhookSiteReceiver(value) && value !== PLACEHOLDER_RECEIVER_URL) {
        violations.push(`variable "${key}" carries a personal webhook.site receiver reference`);
      }
    }
  }

  // 3. Export-time redaction: captured credential values under credential
  //    JSON keys inside SAVED RESPONSE BODIES become clearly synthetic
  //    placeholders. Scoped to example bodies only — request-body templates
  //    legitimately carry {{variable}} placeholders and scripts build bodies
  //    by concatenation, so a whole-export rewrite would mangle them.
  const rewriteExamples = (node) => {
    if (Array.isArray(node)) {
      node.forEach(rewriteExamples);
      return;
    }
    if (node && typeof node === 'object') {
      if (typeof node.body === 'string' && node.originalRequest) {
        node.body = redactLeaf('response body', node.body, applied);
      }
      for (const value of Object.values(node)) rewriteExamples(value);
    }
  };
  rewriteExamples(out);

  // 4. Whole-export scans (bodies, descriptions, scripts included).
  const serialized = JSON.stringify(out);
  for (const identifier of FORBIDDEN_PERSONAL_IDENTIFIERS) {
    if (serialized.includes(identifier)) {
      violations.push(`export contains the maintainer's personal Postman identifier ${identifier}`);
    }
  }
  const demoSecret = DEMO_IDENTITY.secret_key;
  if (serialized.includes(demoSecret)) {
    const occurrences = serialized.split(demoSecret).length - 1;
    if (occurrences !== 1) {
      violations.push(
        `authorized demo secret_key must appear exactly once (the variable block); found ${occurrences} occurrences — a captured copy leaked into examples/scripts`,
      );
    }
  }
  walkStrings(out, (key, value) => {
    if (/webhook\.site\/[0-9a-f][0-9a-f-]{7,}/i.test(value)) {
      violations.push(`personal webhook.site receiver reference in "${key}"`);
    }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) {
      violations.push(`private key material in "${key}"`);
    }
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && !AUTHORIZED_VALUES.has(value)) {
      violations.push(`non-demo email in "${key}" (PII scan)`);
    }
  });

  if (violations.length) {
    throw new Error(
      `distribution policy violations (audit WP10 + review 2026-10-01) — fix the source or the policy before exporting:\n  - ${violations.join('\n  - ')}`,
    );
  }
  return applied;
}

module.exports = {
  applyDistributionPolicy,
  FORBIDDEN_PERSONAL_IDENTIFIERS,
  MUST_BE_EMPTY_VARIABLES,
  DEMO_IDENTITY,
  AUTHORIZED_VALUES,
};
