/**
 * Decode PayWay error/status codes into human guidance.
 * Backs the `payway-sdk explain <code>` command; pure data + lookup so it is
 * trivially testable and usable by agents without spawning the CLI.
 */
import { GATEWAY_CODE_HINTS, PAYOUT_ERROR_CODES, PRE_AUTH_ERROR_CODES, REFUND_ERROR_CODES } from '../constants.js';

export interface CodeExplanation {
  readonly code: string;
  readonly family: 'gateway' | 'refund' | 'pre-auth' | 'payout' | 'payment-status' | 'cof' | 'qr';
  readonly title: string;
  readonly hint: string;
}

const REFUND_LABELS: Record<string, string> = {
  [REFUND_ERROR_CODES.SUCCESS]: 'Refund accepted',
  [REFUND_ERROR_CODES.INVALID_HASH]: 'Invalid hash',
  [REFUND_ERROR_CODES.REFUND_TARGET_NOT_FOUND]: 'Transaction not found',
  [REFUND_ERROR_CODES.PARAMETER_VALIDATION]: 'Parameter validation required',
  [REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL]: 'Refund exceeds original amount',
  [REFUND_ERROR_CODES.UNABLE_TO_REFUND]: 'Unable to refund',
  [REFUND_ERROR_CODES.REFUND_FAILED]: 'Refund failed',
  [REFUND_ERROR_CODES.CONCURRENT_REJECTED]: 'Concurrent request rejected',
  [REFUND_ERROR_CODES.INSUFFICIENT_BALANCE]: 'Insufficient merchant balance',
};

const REFUND_HINTS: Record<string, string> = {
  [REFUND_ERROR_CODES.INVALID_HASH]: 'Check API key and HMAC field ordering.',
  [REFUND_ERROR_CODES.REFUND_TARGET_NOT_FOUND]: 'Verify the original tran_id — refunds need a captured transaction.',
  [REFUND_ERROR_CODES.PARAMETER_VALIDATION]: 'Amount must be ≥ $0.01 USD / ≥ 1 KHR; check other required fields.',
  [REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL]: 'Reduce the refund amount to fit the remaining refundable balance.',
  [REFUND_ERROR_CODES.UNABLE_TO_REFUND]: 'Transaction may not be refundable — check its status via transaction-detail.',
  [REFUND_ERROR_CODES.REFUND_FAILED]: 'PayWay could not process the refund — contact PayWay support with the trace id.',
  [REFUND_ERROR_CODES.CONCURRENT_REJECTED]: 'Another refund for this transaction is in flight — retry after it settles.',
  [REFUND_ERROR_CODES.INSUFFICIENT_BALANCE]: 'Top up the merchant account before retrying.',
};

const PRE_AUTH_TITLES: Record<string, string> = {
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE]: 'Unable to complete pre-auth',
  [PRE_AUTH_ERROR_CODES.MERCHANT_INVALID]: 'Merchant information invalid',
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_CANCEL]: 'Unable to cancel pre-auth',
};

const PRE_AUTH_HINTS: Record<string, string> = {
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE]: 'Transaction status does not allow capture (never authorized, already completed/cancelled).',
  [PRE_AUTH_ERROR_CODES.MERCHANT_INVALID]:
    'Sandbox profile lacks permission for this operation (e.g. complete-with-payout) — contact PayWay to provision.',
  [PRE_AUTH_ERROR_CODES.UNABLE_TO_CANCEL]: 'Only OPEN/PENDING pre-auths can be cancelled — check current status first.',
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
};

const PAYOUT_HINTS: Record<string, string> = {
  [PAYOUT_ERROR_CODES.CURRENCY_NOT_ALLOWED]:
    'Payout currency must match the beneficiary account currency and your merchant credential currency. Send USD to a USD account; KHR to a KHR account.',
  '12': 'Payout currency must match the beneficiary account currency and your merchant credential currency. Send USD to a USD account; KHR to a KHR account.',
  [PAYOUT_ERROR_CODES.ACCOUNT_NOT_WHITELISTED]: 'Whitelist the beneficiary first via addBeneficiary().',
  'PTL-PAYOUT-37': 'Whitelist the beneficiary first via addBeneficiary().',
  PTL46: 'Whitelist the beneficiary first via addBeneficiary().',
  [PAYOUT_ERROR_CODES.AMOUNT_MISMATCH]: 'Sum of beneficiary amounts must equal the payout (transaction complete) amount.',
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
  '105': 'The payment credential token is invalid or expired — re-link via linkAccount/linkCard or renew via renewToken.',
};

/**
 * QR string-code family (generate-qr responses carry string codes; live docs,
 * 2026-08-31 audit §6). Individual meanings beyond the well-known ones are not
 * published — consult the generate-qr spec page.
 */
const QR_CODES = ['1', '6', '12', '16', '17', '18', '19', '21', '23', '32', '35', '44', '47', '48', '96', '102', '403', '429'] as const;

const QR_TITLES: Record<string, string> = {
  '1': 'QR request rejected (wrong hash or malformed request)',
  '403': 'Forbidden',
  '429': 'Rate limit exceeded',
};

const QR_HINTS: Record<string, string> = {
  '1': 'Check the 19-field HMAC order (req_time..payout) and the API key.',
  '403': 'Merchant credential not authorized for generate-qr in this environment.',
  '429': 'Pace requests — the SDK throttles locally, but concurrent callers share the window.',
};

export function explainPayWayCode(rawCode: string): CodeExplanation | undefined {
  const code = rawCode.trim().toUpperCase().replace(/^PTL0+/, 'PTL0').replace(/^CODE[=: ]*/, '');

  // PTL* families
  if (code in REFUND_LABELS) {
    return {
      code,
      family: code === REFUND_ERROR_CODES.SUCCESS ? 'gateway' : 'refund',
      title: REFUND_LABELS[code],
      hint: REFUND_HINTS[code] ?? '',
    };
  }
  if (code in PRE_AUTH_TITLES) {
    return { code, family: 'pre-auth', title: PRE_AUTH_TITLES[code], hint: PRE_AUTH_HINTS[code] ?? '' };
  }
  if (code in PAYOUT_TITLES) {
    return { code, family: 'payout', title: PAYOUT_TITLES[code], hint: PAYOUT_HINTS[code] ?? '' };
  }

  // COF / QR families (B5, live parity) — checked before the generic numeric
  // gateway table so codes like 04/98/104/105/PTL02 resolve to their family.
  const numeric = code.replace(/^0+(?=\d)/, '');
  if (code in COF_TITLES) {
    return { code, family: 'cof', title: COF_TITLES[code], hint: COF_HINTS[code] ?? '' };
  }
  if ((QR_CODES as readonly string[]).includes(numeric)) {
    return {
      code: numeric,
      family: 'qr',
      title: QR_TITLES[numeric] ?? `QR gateway error code ${numeric}`,
      hint: QR_HINTS[numeric] ?? 'Meaning not individually published — consult the generate-qr page on developer.payway.com.kh.',
    };
  }

  // Numeric gateway codes
  const gateway = GATEWAY_CODE_HINTS[numeric];
  if (gateway) return { code: numeric, family: 'gateway', title: gateway.title, hint: gateway.hint };

  return undefined;
}

/** All known explanations sorted by family then code — used by bare `explain`. */
export function explainAll(): CodeExplanation[] {
  const all: CodeExplanation[] = [];
  for (const [num, v] of Object.entries(GATEWAY_CODE_HINTS)) {
    all.push({ code: num, family: 'gateway', title: v.title, hint: v.hint });
  }
  for (const [name, code] of Object.entries(REFUND_ERROR_CODES)) {
    if (code === REFUND_ERROR_CODES.SUCCESS || name === 'SUCCESS') continue;
    all.push({
      code,
      family: 'refund',
      title: REFUND_LABELS[code] ?? name,
      hint: REFUND_HINTS[code] ?? '',
    });
  }
  for (const [name, code] of Object.entries(PRE_AUTH_ERROR_CODES)) {
    all.push({ code, family: 'pre-auth', title: PRE_AUTH_TITLES[code] ?? name, hint: PRE_AUTH_HINTS[code] ?? '' });
  }
  for (const code of Object.keys(PAYOUT_TITLES)) {
    all.push({ code, family: 'payout', title: PAYOUT_TITLES[code] ?? code, hint: PAYOUT_HINTS[code] ?? '' });
  }
  for (const [code, title] of Object.entries(COF_TITLES)) {
    all.push({ code, family: 'cof', title, hint: COF_HINTS[code] ?? '' });
  }
  for (const code of QR_CODES) {
    all.push({
      code,
      family: 'qr',
      title: QR_TITLES[code] ?? `QR gateway error code ${code}`,
      hint: QR_HINTS[code] ?? 'Meaning not individually published — consult the generate-qr page on developer.payway.com.kh.',
    });
  }
  return all;
}
