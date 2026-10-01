// Distribution policy for the shareable Postman export (audit WP10).
//
// The dist/*.postman_collection.json is the artifact merchant developers
// import. It must carry only the documented demo identity and synthetic
// values — never the maintainer's personal Postman workspace/cloud linkage,
// runtime tokens captured during testing, or live receiver URLs. This module
// is applied by export_json.js on EVERY build and --check, so the committed
// distribution is sanitized by construction and the gate is re-proven on CI.
//
// Credential disposition (owner-recorded): the pre-filled sandbox merchant
// (ec476910) and its secret_key are this project's OWN sandbox credentials,
// committed to this repository by maintainer direction for zero-setup demo
// use. They are the ONLY credential-shaped values the export may carry; the
// allowlist below is that disposition, mechanically enforced. Redistribution
// authorization beyond this repo (public npm/GitHub publication) is a
// separate release-time owner check (REPORT.md R05/WP10).
'use strict';

// Personal identifiers observed in .postman/resources.yaml (workspace id +
// cloud collection UID). If these ever reach the export, the build fails —
// a recipient must never inherit the maintainer's Postman cloud workspace.
const FORBIDDEN_PERSONAL_IDENTIFIERS = [
  '98cc8641-0aae-40d8-9ca2-22882fc7b6d6', // maintainer workspace id
  'a1451da9-e13b-4c71-a829-0899c8ecbbba', // cloud collection resource id
];

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

// The documented demo identity (see module header): the only credential-
// shaped or personal-shaped values the distribution may carry.
const AUTHORIZED_VALUES = new Set([
  'ec476910', // project sandbox merchant id (owner-directed disposition)
  '05082504b76df71e468f8c0ff36f863e19e4cd29', // its secret_key (Postman Secret-typed)
  'customer123', // demo CoF customer id
  '500000001', // seeded sandbox beneficiary (docs sample 318… is NOT whitelisted)
  'Test', // buyer_first_name
  'User', // buyer_last_name
  'test@example.com', // synthetic buyer email
  '0123456789', // synthetic buyer phone
  'MREF-0001', // demo merchant reference
  // Official KHQR guideline sample merchant (developer.payway.com.kh):
  'abaakhppxxx@abaa',
  '323080411495479',
  'ABA Bank',
  'LUCKY SUPER MARKET 102',
  '5544',
]);

const PLACEHOLDER_RECEIVER_URL = 'https://example.com/payway-callback-placeholder';

function isBase64(str) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(str) && str.length % 4 === 0 && str.length >= 8;
}

function looksLikeWebhookSiteReceiver(value) {
  if (typeof value !== 'string') return false;
  if (/webhook\.site\/[0-9a-f-]{8,}/i.test(value)) return true;
  if (isBase64(value)) {
    try {
      return /webhook\.site\/[0-9a-f-]{8,}/i.test(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
      return false;
    }
  }
  return false;
}

/** Distribution placeholders applied at export time (WP10 receiver linkage). */
function distributeValue(key, value) {
  if (looksLikeWebhookSiteReceiver(value) && (key === 'callback_url' || key === 'return_url' || key === 'cancel_url' || key === 'continue_success_url')) {
    return { value: PLACEHOLDER_RECEIVER_URL, reason: 'personal webhook.site receiver URL replaced with placeholder' };
  }
  return { value, reason: null };
}

function walkKeys(node, visit) {
  if (Array.isArray(node)) {
    for (const entry of node) walkKeys(entry, visit);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      visit(key, value);
      walkKeys(value, visit);
    }
  }
}

/**
 * Applies the distribution policy to a built export (mutates `out` in place
 * where placeholders are required) and returns the applied decisions.
 * Throws on any violation that cannot be sanitized — a distribution that
 * carries personal linkage, runtime tokens, or unauthorized credentials must
 * fail the build, not ship.
 */
function applyDistributionPolicy(out) {
  const applied = [];
  const violations = [];

  // 1. Structural: no personal workspace/cloud linkage keys anywhere.
  walkKeys(out, (key) => {
    if (/^(workspace|cloudResources|workspaceId|cloudId)$/i.test(key)) {
      violations.push(`forbidden personal-linkage key in export: ${key}`);
    }
  });

  // 2. Variable policy: sanitize receiver URLs, enforce empty runtime tokens,
  //    allowlist credential-shaped values.
  for (const variable of out.variable || []) {
    const { key } = variable;
    let { value } = variable;

    const decision = distributeValue(key, value);
    if (decision.reason) {
      value = decision.value;
      variable.value = value;
      applied.push(`${key}: ${decision.reason}`);
    }

    if (MUST_BE_EMPTY_VARIABLES.includes(key) && value !== '') {
      violations.push(`runtime-capture variable "${key}" must ship empty, found ${String(value).slice(0, 12)}…`);
    }
    if (typeof value === 'string' && value) {
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) {
        violations.push(`variable "${key}" carries a private key`);
      }
      if (/^[0-9a-f]{32,}$/i.test(value) && !AUTHORIZED_VALUES.has(value)) {
        violations.push(`variable "${key}" carries an unauthorized hex secret (${value.length} chars)`);
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

  // 3. Serialized scan: the maintainer's workspace/cloud ids must not appear
  //    anywhere (descriptions, examples, scripts included).
  const serialized = JSON.stringify(out);
  for (const identifier of FORBIDDEN_PERSONAL_IDENTIFIERS) {
    if (serialized.includes(identifier)) {
      violations.push(`export contains the maintainer's personal Postman identifier ${identifier}`);
    }
  }

  if (violations.length) {
    throw new Error(
      `distribution policy violations (audit WP10) — fix the source or the policy before exporting:\n  - ${violations.join('\n  - ')}`,
    );
  }
  return applied;
}

module.exports = { applyDistributionPolicy, FORBIDDEN_PERSONAL_IDENTIFIERS, MUST_BE_EMPTY_VARIABLES, AUTHORIZED_VALUES };
