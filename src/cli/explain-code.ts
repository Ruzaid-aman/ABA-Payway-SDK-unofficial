/**
 * Decode PayWay error/status codes into human guidance.
 * Backs the `payway-sdk explain <code>` command; pure data + lookup so it is
 * trivially testable and usable by agents without spawning the CLI.
 */
import {
  CREDENTIAL_ERROR_CODES,
  GATEWAY_CODE_HINTS,
  PAYMENT_LINK_HINTS,
  PAYMENT_LINK_TITLES,
  PAYOUT_ERROR_CODES,
  PRE_AUTH_ERROR_CODES,
  REFUND_ERROR_CODES,
} from '../constants.js';

export interface CodeExplanation {
  readonly code: string;
  readonly family: 'gateway' | 'refund' | 'pre-auth' | 'payout' | 'payment-status' | 'cof' | 'qr' | 'cda' | 'payment-link' | 'credential';
  readonly title: string;
  readonly hint: string;
  /** True when the code's meaning was reproduced against the live sandbox. */
  readonly sandboxVerified?: boolean;
  /** Evidence pointer into docs/internal/SANDBOX-FINDINGS.md for live-verified codes. */
  readonly evidence?: string;
  /** Gateway APIs (short labels, see docs/12 telemetry section) where ABA production telemetry observed this code, 2026-09-15 CSV. */
  readonly observedOn?: string[];
  /** Exact gateway message for this code in the same telemetry. */
  readonly observedMessage?: string;
}

/**
 * Codes whose meaning was live-verified against the sandbox (see
 * docs/internal/SANDBOX-FINDINGS.md). Everything else in the explain maps is
 * spec-derived or inferred. Drives `sandboxVerified`/`evidence` on
 * CodeExplanation and the generated docs/error-codes.json registry.
 */
export const SANDBOX_VERIFIED_EVIDENCE: Record<string, string> = {
  '1': 'SANDBOX-FINDINGS §6',
  '2': 'SANDBOX-FINDINGS §21',
  '5': 'SANDBOX-FINDINGS §8',
  '8': 'SANDBOX-FINDINGS §6',
  '12': 'SANDBOX-FINDINGS §9',
  '26': 'SANDBOX-FINDINGS §6',
  '32': 'SANDBOX-FINDINGS §22',
  '37': 'SANDBOX-FINDINGS §9',
  '49': 'SANDBOX-FINDINGS §8',
  '96': 'SANDBOX-FINDINGS §22/§23',
  '429': 'SANDBOX-FINDINGS §11',
  '04': 'SANDBOX-FINDINGS §13',
  '01': 'SANDBOX-FINDINGS §16',
  '09': 'SANDBOX-FINDINGS §16',
  '104': 'SANDBOX-FINDINGS §16',
  '105': 'SANDBOX-FINDINGS §16',
  PTL02: 'SANDBOX-FINDINGS §6/§9',
  PTL04: 'SANDBOX-FINDINGS §9/§22',
  PTL36: 'SANDBOX-FINDINGS §8/§9',
  PTL59: 'SANDBOX-FINDINGS §9',
  PTL62: 'SANDBOX-FINDINGS §6/§9',
  PTL170: 'SANDBOX-FINDINGS §9',
  PTL188: 'SANDBOX-FINDINGS §23',
};

/**
 * ABA production telemetry (dev-team CSV export, 2026-09-15): the gateway APIs
 * where each code was observed, with the exact message the gateway sends.
 * Keyed `family:code` (a numeric code can legitimately mean different things
 * per family — e.g. gateway `6` vs qr `6`). API labels map 1:1 to gateway
 * paths in the docs/12 telemetry table. This is production provenance — it
 * deliberately does NOT set `sandboxVerified`, which stays reserved for codes
 * reproduced against the live sandbox.
 */
export const ABA_TELEMETRY: Record<string, { apis: string[]; message?: string }> = {
  'gateway:0': {
    apis: [
      'purchase', 'generate-qr', 'close-transaction', 'exchange-rate', 'transaction-list', 'payout',
      'cof-charge', 'cof-link-account', 'refund', 'pre-auth-complete', 'pre-auth-cancel',
      'whitelist-add', 'whitelist-status', 'payment-link-create', 'payment-link-detail',
    ],
  },
  'gateway:1': { apis: ['purchase', 'generate-qr'], message: 'Wrong Hash.' },
  'gateway:3': { apis: ['purchase', 'pre-auth-complete', 'refund'], message: 'Invalid Transaction Amount.' },
  'gateway:4': { apis: ['purchase', 'generate-qr', 'payout'], message: 'Duplicated Transaction ID.' },
  'gateway:5': { apis: ['close-transaction'], message: 'Transaction not found' },
  'gateway:8': {
    apis: ['purchase', 'generate-qr', 'payout', 'refund', 'transaction-list'],
    message: 'Something went wrong. Please reach out to our digital support team for assistance',
  },
  'gateway:12': { apis: ['purchase', 'generate-qr'], message: 'Payment currency is not allowed.' },
  'gateway:26': { apis: ['exchange-rate'], message: 'Invalid Merchant Profile' },
  'gateway:29': { apis: ['purchase'], message: 'Sorry, your payment cannot be processed as your card is inactive. Please use another card.' },
  'gateway:30': { apis: ['purchase'], message: 'Your payment is declined by the card issuer bank. Please make sure your card is active, or contact your issuer bank for support.' },
  'gateway:37': { apis: ['payout'], message: 'Payout accounts are not in whitelist.' },
  'gateway:44': { apis: ['purchase'], message: 'Purchase has reached transaction limit.' },
  'gateway:52': { apis: ['purchase'], message: 'Incorrect card details. Please check and try again.' },
  'gateway:58': { apis: ['purchase'], message: 'Your payment is declined by the card issuer bank. Please contact issuer bank for support.' },
  'gateway:59': { apis: ['purchase'], message: 'Your payment card has insufficient funds. Please check and try again.' },
  'gateway:60': { apis: ['purchase'], message: 'Your payment card has reached its usage limit. Please use another card, or contact issuer bank for support.' },
  'gateway:68': { apis: ['purchase'], message: 'Your payment is declined by the card issuer bank. Please contact issuer bank for support.' },
  'gateway:75': { apis: ['purchase'], message: 'Your payment is declined by the card issuer bank. Please use another card, or contact issuer bank for support.' },
  'gateway:96': { apis: ['generate-qr', 'whitelist-add'], message: 'Invalid merchant data' },
  'gateway:500': {
    apis: ['transaction-list', 'generate-qr', 'payment-link-detail'],
    message: 'Something went wrong. Please reach out to our digital support team for assistance',
  },
  'gateway:503': { apis: ['purchase'], message: "System under maintenance. We'll update you when available. Thanks for your patience." },
  'gateway:999': { apis: ['purchase'], message: 'Something went wrong. Please try again later.' },
  'cof:04': { apis: ['purchase', 'generate-qr'], message: 'The given data was invalid.' },
  'cof:105': { apis: ['purchase'], message: 'Invalid pwt or ctid.' },
  'qr:6': { apis: ['purchase'], message: 'Requested Domain is not in whitelist.' },
  'qr:12': { apis: ['generate-qr', 'purchase'], message: 'Payment currency is not allowed.' },
  'qr:16': { apis: ['purchase'], message: 'Invalid First Name. It must not contain numbers or special characters or not more than 100 characters.' },
  'qr:17': { apis: ['purchase'], message: 'Invalid Last Name. It must not contain numbers or special characters or not more than 100 characters.' },
  'qr:19': { apis: ['purchase'], message: 'Invalid Email.' },
  'qr:21': { apis: ['generate-qr'], message: 'End of API lifetime.' },
  'qr:32': { apis: ['generate-qr', 'purchase'], message: 'Service is not enable.' },
  'refund:PTL04': { apis: ['payment-link-create', 'pre-auth-complete', 'whitelist-add'], message: 'Parameter validation required' },
  'refund:PTL36': { apis: ['refund', 'pre-auth-cancel'], message: 'Transaction not found or is invalid' },
  'refund:PTL57': { apis: ['refund'], message: 'Unable to process refund due to an invalid transaction status or an incorrect refund amount' },
  'refund:PTL58': { apis: ['refund'], message: 'Refund failed: The payment service provider returned an unexpected response' },
  'refund:PTL168': { apis: ['refund', 'pre-auth-complete', 'pre-auth-cancel'], message: 'Another request is already in progress. Please wait a few seconds and try again.' },
  'pre-auth:PTL59': { apis: ['pre-auth-complete'], message: 'Unable to complete pre-authorization: The transaction status is invalid or the completion amount is incorrect' },
  'pre-auth:PTL170': { apis: ['pre-auth-cancel'], message: 'Unable to cancel pre-authorization: The transaction status is invalid' },
  'pre-auth:PTL172': { apis: ['pre-auth-complete'], message: 'Pre-authorization completion failed: The payment service provider returned an unexpected response' },
  'payout:12': { apis: ['purchase', 'generate-qr'], message: 'Payment currency is not allowed.' },
  'payout:PTL148': { apis: ['whitelist-add'], message: 'Payee already exists.' },
  'cda:CDA00': { apis: ['purchase'], message: 'OK' },
  'cda:CDA09': { apis: ['purchase'], message: "Sorry, we couldn't process the payment. Please try again in few minutes or contact to the merchant directly." },
  'cda:CDA45': { apis: ['purchase'], message: 'Payer account has insufficient funds.' },
};

/** Attach live-verification provenance (sandbox evidence + ABA production telemetry), if any exists. */
function withProvenance(e: CodeExplanation): CodeExplanation {
  const evidence = SANDBOX_VERIFIED_EVIDENCE[e.code];
  const telemetry = ABA_TELEMETRY[`${e.family}:${e.code}`];
  const base = evidence ? { ...e, sandboxVerified: true, evidence } : e;
  return telemetry ? { ...base, observedOn: telemetry.apis, observedMessage: telemetry.message } : base;
}

const REFUND_LABELS: Record<string, string> = {
  [REFUND_ERROR_CODES.SUCCESS]: 'Success',
  [REFUND_ERROR_CODES.INVALID_HASH]: 'Invalid hash',
  [REFUND_ERROR_CODES.REFUND_TARGET_NOT_FOUND]: 'Transaction not found',
  [REFUND_ERROR_CODES.PARAMETER_VALIDATION]: 'Parameter validation required',
  [REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL]: 'Refund exceeds original amount',
  [REFUND_ERROR_CODES.UNABLE_TO_REFUND]: 'Unable to refund',
  [REFUND_ERROR_CODES.REFUND_FAILED]: 'Refund failed',
  [REFUND_ERROR_CODES.CONCURRENT_REJECTED]: 'Concurrent request rejected',
  [REFUND_ERROR_CODES.INSUFFICIENT_BALANCE]: 'Insufficient merchant balance',
  [REFUND_ERROR_CODES.BELOW_MINIMUM]: 'Refund amount below the minimum allowed',
};

const REFUND_HINTS: Record<string, string> = {
  [REFUND_ERROR_CODES.SUCCESS]: 'Business success — on the refund endpoint this means the refund was accepted.',
  [REFUND_ERROR_CODES.INVALID_HASH]: 'Check API key and HMAC field ordering.',
  [REFUND_ERROR_CODES.REFUND_TARGET_NOT_FOUND]: 'Verify the original tran_id — refunds need a captured transaction.',
  [REFUND_ERROR_CODES.PARAMETER_VALIDATION]: 'Amount must be ≥ $0.01 USD / ≥ 1 KHR; check other required fields.',
  [REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL]: 'Reduce the refund amount to fit the remaining refundable balance.',
  [REFUND_ERROR_CODES.UNABLE_TO_REFUND]:
    'Production message: "invalid transaction status or an incorrect refund amount" — check BOTH the transaction status (transaction-detail) and that the amount fits paid − already-refunded.',
  [REFUND_ERROR_CODES.REFUND_FAILED]:
    'PayWay could not process the refund (PSP returned an unexpected response) — retry once, then contact PayWay support with the trace id.',
  [REFUND_ERROR_CODES.CONCURRENT_REJECTED]:
    'Another request for this transaction is in flight — retry after it settles. Shared by refund AND pre-auth completion/cancellation ("Another request is already in progress. Please wait a few seconds and try again.").',
  [REFUND_ERROR_CODES.INSUFFICIENT_BALANCE]: 'Top up the merchant account before retrying.',
  [REFUND_ERROR_CODES.BELOW_MINIMUM]:
    'The refund amount is below the gateway minimum — the numeric per-currency floor is undocumented (ABA-bot relay 2026-10-03); raise the amount above the local advisory (≥ $0.01 USD / ≥ 1 KHR) or refund via the offline/manual process.',
};

// Credential/rotation rejections (ABA-bot relay 2026-10-03, doc-derived):
// no dual-key overlap window exists — old-credential traffic dies with these
// codes once replacements are enforced.
const CREDENTIAL_TITLES: Record<string, string> = {
  [CREDENTIAL_ERROR_CODES.STALE_CREDENTIALS]: 'Credentials rejected (stale after rotation)',
  [CREDENTIAL_ERROR_CODES.WRONG_ENCRYPTION]: 'Wrong encryption (credential/RSA mismatch)',
};

const CREDENTIAL_HINTS: Record<string, string> = {
  [CREDENTIAL_ERROR_CODES.STALE_CREDENTIALS]:
    'Requests are still signed with credentials the Integration Team already replaced. There is NO dual-key overlap window — cut over every service to the new key promptly, then re-verify with a test transaction.',
  [CREDENTIAL_ERROR_CODES.WRONG_ENCRYPTION]:
    'The credential/RSA pairing no longer matches (e.g. a rotated key paired with the old RSA public key, or vice versa). Re-issue/align both through the Integration Team; no self-service rotation exists.',
};

const PRE_AUTH_TITLES: Record<string, string> = {
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE]: 'Unable to complete pre-auth',
  [PRE_AUTH_ERROR_CODES.MERCHANT_INVALID]: 'Merchant information invalid',
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_CANCEL]: 'Unable to cancel pre-auth',
  [PRE_AUTH_ERROR_CODES.COMPLETION_FAILED]: 'Pre-auth completion failed (PSP error)',
};

const PRE_AUTH_HINTS: Record<string, string> = {
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE]:
    'Transaction status does not allow capture, OR the completion amount is incorrect (never authorized, already completed/cancelled) — production message checks both.',
  [PRE_AUTH_ERROR_CODES.MERCHANT_INVALID]:
    'Sandbox profile lacks permission for this operation (e.g. complete-with-payout) — contact PayWay to provision.',
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_CANCEL]: 'Only OPEN/PENDING pre-auths can be cancelled — check current status first.',
  [PRE_AUTH_ERROR_CODES.COMPLETION_FAILED]:
    'The payment service provider returned an unexpected response during completion — retry once, then contact PayWay support with the trace id (production telemetry 2026-09).',
};

// Payout / split-payout error codes (direct payout API). The currency must
// match the beneficiary account currency; non-whitelisted accounts and amount
// mismatches are also common.
const PAYOUT_TITLES: Record<string, string> = {
  [PAYOUT_ERROR_CODES.CURRENCY_NOT_ALLOWED]: 'Payment currency not allowed',
  '12': 'Payment currency not allowed',
  [PAYOUT_ERROR_CODES.ACCOUNT_NOT_WHITELISTED]: 'Payout account not whitelisted',
  'PTL-PAYOUT-37': 'Payout account not whitelisted',
  PTL46: 'Payout account not whitelisted',
  [PAYOUT_ERROR_CODES.AMOUNT_MISMATCH]: 'Payout amount mismatch',
  PTL148: 'Payee already exists',
};

const PAYOUT_HINTS: Record<string, string> = {
  [PAYOUT_ERROR_CODES.CURRENCY_NOT_ALLOWED]:
    'Payout currency must match the beneficiary account currency and your merchant credential currency. Send USD to a USD account; KHR to a KHR account.',
  '12': 'Payout currency must match the beneficiary account currency and your merchant credential currency. Send USD to a USD account; KHR to a KHR account.',
  [PAYOUT_ERROR_CODES.ACCOUNT_NOT_WHITELISTED]: 'Whitelist the beneficiary first via addBeneficiary().',
  'PTL-PAYOUT-37': 'Whitelist the beneficiary first via addBeneficiary().',
  PTL46: 'Whitelist the beneficiary first via addBeneficiary().',
  [PAYOUT_ERROR_CODES.AMOUNT_MISMATCH]: 'Sum of beneficiary amounts must equal the payout (transaction complete) amount.',
  PTL148:
    'The payee is already on the payout whitelist — benign, no action needed (production telemetry 2026-09: the most common add-whitelist response). Re-enable via update-whitelist-status if it was disabled.',
};

// Credentials-on-file family (live-documented codes, 2026-08-31 audit §6).
const COF_TITLES: Record<string, string> = {
  '1': 'Invalid hash',
  '01': 'Invalid hash',
  '04': 'Validation / binding failure',
  '09': 'Token not found',
  '98': 'Merchant ID not found',
  '104': 'Merchant not enabled for token flag',
  '105': 'Invalid payment credential token',
};

const COF_HINTS: Record<string, string> = {
  '1': 'Wrong HMAC composition — check the field order for the CoF endpoint being called.',
  '01': 'Wrong HMAC composition — check the field order for the CoF endpoint being called.',
  '04': 'Laravel-style binding/validation layer rejected the request — inspect the errors{} field map on the thrown error.',
  '09': 'The ctid/request_id does not reference a known account token — verify or re-link.',
  '98': 'Merchant ID not found — verify the merchant credential (env/profile) for the target environment.',
  '104': 'The merchant account is not enabled for this token_flag — contact PayWay to provision, or use a linking enum (CITI_FLEX|CITO_FLEX|CITO_FIX|CITR_FLEX).',
  '105': 'The payment credential token is invalid or expired — re-link via linkAccount/linkCard or renew via renewToken. On purchase/charge the gateway also words it "Invalid pwt or ctid." — for ctid-keyed charges check the ctid→pwt resolution first (production telemetry 2026-09). The payment-credential endpoint table (2026-10) enumerates the causes: token not found / removed / frozen / expired, token_flag not allowed, or amount above the token per-transaction limit.',
};

// ABA-account (CDA) response codes echoed on purchase when the payer pays
// from an ABA Mobile account (ABA production telemetry, 2026-09-15). The
// gateway wraps the payer-account result and repeats the code as a [CDAxx]
// suffix in the message.
const CDA_TITLES: Record<string, string> = {
  CDA00: 'ABA account payment OK',
  CDA09: 'ABA account payment declined — transient',
  CDA45: 'ABA account insufficient funds',
};

const CDA_HINTS: Record<string, string> = {
  CDA00: 'Payer-account success — treat like 00 (purchase telemetry: tens of thousands of occurrences).',
  CDA09: 'Payer-account decline, usually transient — the customer-facing message advises retrying in a few minutes; safe to surface as-is.',
  CDA45: 'The payer ABA account lacks funds — customer tops up or pays from another account.',
};

/**
 * QR string-code family (generate-qr responses carry string codes; live docs,
 * 2026-08-31 audit §6). Meanings for 6/12/16/17/19/21/32/44/96 come from ABA
 * production telemetry (2026-09-15 CSV) — the shared numeric code space is
 * also used by the purchase validators, and several spec-page glosses
 * ("invalid amount" for 16, "invalid transaction ID" for 21, "invalid
 * template" for 44) do NOT match what the gateway actually sends. Meanings
 * for 35/102 come from the purchase payment-credential endpoint error table
 * (ABA, 2026-10-01 — docs/internal/PAYMENT-CREDENTIAL-ERROR-TABLE-2026-10.md)
 * and supersede those two codes' old spec-page glosses.
 */
const QR_CODES = ['1', '6', '12', '16', '17', '18', '19', '21', '23', '32', '35', '44', '47', '48', '96', '102', '403', '429'] as const;

const QR_TITLES: Record<string, string> = {
  '1': 'QR request rejected (wrong hash or malformed request)',
  '6': 'Requested Domain is not in whitelist',
  '12': 'Payment currency not allowed',
  '16': 'Invalid First Name',
  '17': 'Invalid Last Name',
  '19': 'Invalid Email',
  '21': 'End of API lifetime',
  '32': 'Service is not enabled',
  '35': 'Payout Info is invalid',
  '44': 'Purchase has reached transaction limit',
  '96': 'Invalid merchant data',
  '403': 'Forbidden',
  '429': 'Rate limit exceeded',
  '102': 'URL is not in the whitelist',
};

const QR_HINTS: Record<string, string> = {
  '1': 'Check the 19-field HMAC order (req_time..payout) and the API key.',
  '6': 'The request origin/return domain is not whitelisted for this merchant profile — ask PayWay to whitelist it (purchase telemetry 2026-09). Legacy gateway gloss: tran_id not found on check-transaction.',
  '12': 'Currency not enabled for the merchant profile — use USD/KHR or ask PayWay to enable it (generate-qr + purchase telemetry).',
  '16': 'first_name must not contain numbers/special characters and is capped at 100 chars (purchase field validation — the spec-page gloss "invalid amount" does not match production).',
  '17': 'last_name must not contain numbers/special characters and is capped at 100 chars (purchase field validation).',
  '19': 'The email field is malformed (purchase field validation).',
  '21': 'The transaction/QR lifetime elapsed before payment completed — create a fresh transaction (generate-qr telemetry; the spec-page gloss "invalid transaction ID" does not match production).',
  '32': 'The service/feature this call needs is not enabled on the merchant profile (e.g. pushback) — ask PayWay to provision it; sandbox-verified on payment-link create (§22). Gateway message literally reads "Service is not enable."',
  '35': 'Payout info invalid — a payout entry cannot be parsed or has invalid structure (payment-credential endpoint error table 2026-10; supersedes the old generate-qr spec-page gloss "Invalid hash").',
  '44': 'The merchant/profile transaction limit was reached (purchase telemetry; the spec-page gloss "invalid template" does not match production). payment-credential endpoint table (2026-10): daily/monthly transaction or amount limit.',
  '96': 'Merchant data rejected — verify merchant_id/credential for the target environment (generate-qr + add-whitelist-payout telemetry).',
  '403': 'Merchant credential not authorized for generate-qr in this environment.',
  '429': 'Pace requests — the SDK throttles locally, but concurrent callers share the window.',
  '102': 'URL not in whitelist — callback_url host is not whitelisted or is not a valid URL (payment-credential endpoint error table 2026-10; supersedes the old "QR request limit exceeded" gloss).',
};

export function explainPayWayCode(rawCode: string): CodeExplanation | undefined {
  const code = rawCode.trim().toUpperCase().replace(/^PTL0+/, 'PTL0').replace(/^CODE[=: ]*/, '');

  // PTL* families
  if (code in REFUND_LABELS) {
    return withProvenance({
      code,
      family: code === REFUND_ERROR_CODES.SUCCESS ? 'gateway' : 'refund',
      title: REFUND_LABELS[code],
      hint: REFUND_HINTS[code] ?? '',
    });
  }
  if (code in PRE_AUTH_TITLES) {
    return withProvenance({ code, family: 'pre-auth', title: PRE_AUTH_TITLES[code], hint: PRE_AUTH_HINTS[code] ?? '' });
  }
  if (code in PAYOUT_TITLES) {
    return withProvenance({ code, family: 'payout', title: PAYOUT_TITLES[code], hint: PAYOUT_HINTS[code] ?? '' });
  }
  if (code in CREDENTIAL_TITLES) {
    return withProvenance({ code, family: 'credential', title: CREDENTIAL_TITLES[code], hint: CREDENTIAL_HINTS[code] ?? '' });
  }

  // Payment-link family (2026-09-06): PTL05/PTL99/PTL132 — PTL02/PTL04 are
  // claimed by the refund family and 96 by the QR family, so this branch only
  // claims the unclaimed payment-link codes.
  if (code in PAYMENT_LINK_TITLES) {
    return withProvenance({ code, family: 'payment-link', title: PAYMENT_LINK_TITLES[code], hint: PAYMENT_LINK_HINTS[code] ?? '' });
  }

  // COF / QR families (B5, live parity) — checked before the generic numeric
  // gateway table so codes like 04/98/104/105/PTL02 resolve to their family.
  const numeric = code.replace(/^0+(?=\d)/, '');
  if (code in COF_TITLES) {
    return withProvenance({ code, family: 'cof', title: COF_TITLES[code], hint: COF_HINTS[code] ?? '' });
  }
  if (code in CDA_TITLES) {
    return withProvenance({ code, family: 'cda', title: CDA_TITLES[code], hint: CDA_HINTS[code] ?? '' });
  }
  if ((QR_CODES as readonly string[]).includes(numeric)) {
    return withProvenance({
      code: numeric,
      family: 'qr',
      title: QR_TITLES[numeric] ?? `QR gateway error code ${numeric}`,
      hint: QR_HINTS[numeric] ?? 'Meaning not individually published — consult the generate-qr page on developer.payway.com.kh.',
    });
  }

  // Numeric gateway codes
  const gateway = GATEWAY_CODE_HINTS[numeric];
  if (gateway) return withProvenance({ code: numeric, family: 'gateway', title: gateway.title, hint: gateway.hint });

  return undefined;
}

/** All known explanations sorted by family then code — used by bare `explain`. */
export function explainAll(): CodeExplanation[] {
  const all: CodeExplanation[] = [];
  for (const [num, v] of Object.entries(GATEWAY_CODE_HINTS)) {
    all.push(withProvenance({ code: num, family: 'gateway', title: v.title, hint: v.hint }));
  }
  for (const [name, code] of Object.entries(REFUND_ERROR_CODES)) {
    if (code === REFUND_ERROR_CODES.SUCCESS || name === 'SUCCESS') continue;
    all.push(
      withProvenance({
        code,
        family: 'refund',
        title: REFUND_LABELS[code] ?? name,
        hint: REFUND_HINTS[code] ?? '',
      }),
    );
  }
  for (const [name, code] of Object.entries(PRE_AUTH_ERROR_CODES)) {
    all.push(withProvenance({ code, family: 'pre-auth', title: PRE_AUTH_TITLES[code] ?? name, hint: PRE_AUTH_HINTS[code] ?? '' }));
  }
  for (const code of Object.keys(PAYOUT_TITLES)) {
    all.push(withProvenance({ code, family: 'payout', title: PAYOUT_TITLES[code] ?? code, hint: PAYOUT_HINTS[code] ?? '' }));
  }
  for (const code of Object.keys(PAYMENT_LINK_TITLES)) {
    all.push(withProvenance({ code, family: 'payment-link', title: PAYMENT_LINK_TITLES[code] ?? code, hint: PAYMENT_LINK_HINTS[code] ?? '' }));
  }
  for (const [code, title] of Object.entries(COF_TITLES)) {
    all.push(withProvenance({ code, family: 'cof', title, hint: COF_HINTS[code] ?? '' }));
  }
  for (const [code, title] of Object.entries(CDA_TITLES)) {
    all.push(withProvenance({ code, family: 'cda', title, hint: CDA_HINTS[code] ?? '' }));
  }
  for (const code of QR_CODES) {
    all.push(
      withProvenance({
        code,
        family: 'qr',
        title: QR_TITLES[code] ?? `QR gateway error code ${code}`,
        hint: QR_HINTS[code] ?? 'Meaning not individually published — consult the generate-qr page on developer.payway.com.kh.',
      }),
    );
  }
  return all;
}

// --- Endpoint-scoped resolution (audit DX-ERR-003a / N-02, additive only) ---
//
// A bare numeric lookup in explainPayWayCode answers the FIRST family that
// claims the code (qr before gateway for numerics), which reproduces a wrong
// answer on the qr∩gateway colliding codes (e.g. bare `explain 16` answers the
// QR "Invalid First Name" when a purchase failed with gateway "Invalid
// Amount"). The registry's family:code data model is correct — the lookup
// surface just could not express the scope. Everything below is additive:
// explainPayWayCode's default answer and return shape are untouched; scoped
// resolution is opt-in via --operation/--family, and bare lookups only GAIN
// the `ambiguous`/`alternatives` fields when the code exists in several
// families (risk R-C mitigation).

/** Valid `--family` values, in explainPayWayCode precedence order (also the deterministic alternatives order). */
export const EXPLAIN_FAMILIES = [
  'refund',
  'pre-auth',
  'payout',
  'credential',
  'payment-link',
  'cof',
  'cda',
  'qr',
  'gateway',
] as const;

export type ExplainFamily = (typeof EXPLAIN_FAMILIES)[number];

/**
 * Endpoint-style operation keys → the family whose codes that operation can
 * return (audit DX-ERR-003a). Canonical keys are dot-namespaced domain +
 * endpoint names; the ABA_TELEMETRY `apis` labels above are the flat forms of
 * the same endpoints. Backs `explain <code> --operation <op>`.
 */
export const OPERATION_FAMILY: Record<string, ExplainFamily> = {
  // Checkout / purchase endpoints (gateway-family codes)
  'checkout.purchase': 'gateway',
  'checkout.generate-checkout': 'gateway', // CLI command name for the same purchase endpoint
  'checkout.check-transaction': 'gateway',
  'checkout.transaction-detail': 'gateway',
  'checkout.transaction-list': 'gateway',
  'checkout.close-transaction': 'gateway',
  'exchange-rate.get': 'gateway',
  // QR endpoints (generate-qr / request-qr share the qr-family code space)
  'qr.create': 'qr',
  'qr.request': 'qr',
  // Refund / pre-auth / payout
  'refund.create': 'refund',
  'pre-auth.complete': 'pre-auth',
  'pre-auth.complete-payout': 'pre-auth',
  'pre-auth.cancel': 'pre-auth',
  'payout.create': 'payout',
  // Credentials-on-file
  'cof.charge': 'cof',
  'cof.link-account': 'cof',
  'cof.link-card': 'cof',
  // Payment links
  'payment-link.create': 'payment-link',
  'payment-link.detail': 'payment-link',
  'payment-link.void': 'payment-link',
};

/** One family's entry inside an ambiguous bare lookup's `alternatives` list. */
export interface CodeAlternative {
  readonly code: string;
  readonly family: CodeExplanation['family'];
  readonly title: string;
  readonly hint: string;
}

/** Scope selector for {@link explainPayWayCodeScoped}. `operation` wins over `family`. */
export interface ScopedExplainOptions {
  /** Endpoint-style operation key (see {@link OPERATION_FAMILY}). Unknown keys throw. */
  readonly operation?: string;
  /** Direct family scope (see {@link EXPLAIN_FAMILIES}). Unknown families throw. */
  readonly family?: string;
}

/**
 * A {@link CodeExplanation}, plus — on ambiguous BARE lookups only — the
 * additive ambiguity fields. Scoped lookups and single-family bare lookups
 * return exactly the explainPayWayCode entry (no extra fields).
 */
export interface ScopedCodeExplanation extends CodeExplanation {
  /** True when the code exists in more than one family and no scope was given. */
  readonly ambiguous?: boolean;
  /** Every family containing the code, in EXPLAIN_FAMILIES order (includes the default-resolved family). */
  readonly alternatives?: readonly CodeAlternative[];
}

/**
 * Resolve a code within ONE family only, using the same tables and code
 * normalization as explainPayWayCode (the string `04`/`01` cof codes claim the
 * raw string; the qr/gateway tables match the leading-zero-stripped numeric).
 * Returns undefined when that family does not claim the code. The refund
 * family's SUCCESS ('00') resolves under 'gateway', matching
 * explainPayWayCode's family assignment for it.
 */
function explainInFamily(rawCode: string, family: ExplainFamily): CodeExplanation | undefined {
  const code = rawCode.trim().toUpperCase().replace(/^PTL0+/, 'PTL0').replace(/^CODE[=: ]*/, '');
  const numeric = code.replace(/^0+(?=\d)/, '');
  switch (family) {
    case 'refund':
      if (code in REFUND_LABELS && code !== REFUND_ERROR_CODES.SUCCESS) {
        return withProvenance({ code, family: 'refund', title: REFUND_LABELS[code], hint: REFUND_HINTS[code] ?? '' });
      }
      return undefined;
    case 'gateway':
      // explainPayWayCode answers refund-table SUCCESS ('00') with family 'gateway'.
      if (code in REFUND_LABELS && code === REFUND_ERROR_CODES.SUCCESS) {
        return withProvenance({ code, family: 'gateway', title: REFUND_LABELS[code], hint: REFUND_HINTS[code] ?? '' });
      }
      if (numeric in GATEWAY_CODE_HINTS) {
        return withProvenance({
          code: numeric,
          family: 'gateway',
          title: GATEWAY_CODE_HINTS[numeric].title,
          hint: GATEWAY_CODE_HINTS[numeric].hint,
        });
      }
      return undefined;
    case 'pre-auth':
      if (code in PRE_AUTH_TITLES) {
        return withProvenance({ code, family: 'pre-auth', title: PRE_AUTH_TITLES[code], hint: PRE_AUTH_HINTS[code] ?? '' });
      }
      return undefined;
    case 'payout':
      if (code in PAYOUT_TITLES) {
        return withProvenance({ code, family: 'payout', title: PAYOUT_TITLES[code], hint: PAYOUT_HINTS[code] ?? '' });
      }
      return undefined;
    case 'credential':
      if (code in CREDENTIAL_TITLES) {
        return withProvenance({ code, family: 'credential', title: CREDENTIAL_TITLES[code], hint: CREDENTIAL_HINTS[code] ?? '' });
      }
      return undefined;
    case 'payment-link':
      if (code in PAYMENT_LINK_TITLES) {
        return withProvenance({ code, family: 'payment-link', title: PAYMENT_LINK_TITLES[code], hint: PAYMENT_LINK_HINTS[code] ?? '' });
      }
      return undefined;
    case 'cof':
      if (code in COF_TITLES) {
        return withProvenance({ code, family: 'cof', title: COF_TITLES[code], hint: COF_HINTS[code] ?? '' });
      }
      return undefined;
    case 'cda':
      if (code in CDA_TITLES) {
        return withProvenance({ code, family: 'cda', title: CDA_TITLES[code], hint: CDA_HINTS[code] ?? '' });
      }
      return undefined;
    case 'qr':
      if ((QR_CODES as readonly string[]).includes(numeric)) {
        return withProvenance({
          code: numeric,
          family: 'qr',
          title: QR_TITLES[numeric] ?? `QR gateway error code ${numeric}`,
          hint: QR_HINTS[numeric] ?? 'Meaning not individually published — consult the generate-qr page on developer.payway.com.kh.',
        });
      }
      return undefined;
    default:
      return undefined;
  }
}

/** All families that claim the code, in EXPLAIN_FAMILIES (precedence) order. */
export function explainCodeFamilies(rawCode: string): ExplainFamily[] {
  return EXPLAIN_FAMILIES.filter((family) => explainInFamily(rawCode, family) !== undefined);
}

/**
 * Family/operation-scoped resolver (audit DX-ERR-003a). With a scope, resolves
 * within that family only and returns the plain entry (unknown scope values
 * throw — callers validate against OPERATION_FAMILY / EXPLAIN_FAMILIES and
 * surface their own error). Without a scope, returns exactly
 * explainPayWayCode's result when the code lives in a single family; when it
 * lives in several, the default (qr-first) entry gains `ambiguous: true` plus
 * one `alternatives` entry per family — additive fields only, the default
 * answer never changes.
 */
export function explainPayWayCodeScoped(rawCode: string, opts: ScopedExplainOptions = {}): ScopedCodeExplanation | undefined {
  if (opts.operation) {
    const family = OPERATION_FAMILY[opts.operation];
    if (!family) {
      throw new Error(`Unknown explain operation '${opts.operation}'. Valid operations: ${Object.keys(OPERATION_FAMILY).join(', ')}`);
    }
    return explainInFamily(rawCode, family);
  }
  if (opts.family) {
    if (!(EXPLAIN_FAMILIES as readonly string[]).includes(opts.family)) {
      throw new Error(`Unknown explain family '${opts.family}'. Valid families: ${EXPLAIN_FAMILIES.join(', ')}`);
    }
    return explainInFamily(rawCode, opts.family as ExplainFamily);
  }
  const bare = explainPayWayCode(rawCode);
  if (!bare) return undefined;
  const families = explainCodeFamilies(rawCode);
  if (families.length <= 1) return bare;
  const alternatives = families
    .map((family) => explainInFamily(rawCode, family))
    .filter((entry): entry is CodeExplanation => entry !== undefined)
    .map(({ code, family, title, hint }) => ({ code, family, title, hint }) satisfies CodeAlternative);
  return { ...bare, ambiguous: true, alternatives };
}
