export const BASE_URLS = {
  sandbox: 'https://checkout-sandbox.payway.com.kh',
  production: 'https://checkout.payway.com.kh',
} as const;

export const ENDPOINTS = {
  checkTransaction: '/api/payment-gateway/v1/payments/check-transaction-2',
  closeTransaction: '/api/payment-gateway/v1/payments/close-transaction',
  getTransactionDetail: '/api/payment-gateway/v1/payments/transaction-detail',
  getTransactionList: '/api/payment-gateway/v1/payments/transaction-list-2',
  refund: '/api/merchant-portal/merchant-access/online-transaction/refund',
  getExchangeRate: '/api/payment-gateway/v1/exchange-rate',
  linkAccount: '/api/payment-credential/v3/aof/link-account',
  linkCard: '/api/payment-credential/v3/cof/link-card',
  payment: '/api/payment-gateway/v3/purchase/payment-credential',
  purchase: '/api/payment-gateway/v1/payments/purchase',
  renewToken: '/api/payment-credential/v3/token-management/renew-expired-account-token',
  getTokenDetails: '/api/payment-credential/v3/token-management/get-token-details',
  removeToken: '/api/payment-credential/v3/token-management/remove-token',
  generateQr: '/api/payment-gateway/v1/payments/generate-qr',
  createPaymentLink: '/api/merchant-portal/merchant-access/payment-link/create',
  getPaymentLinkDetails: '/api/merchant-portal/merchant-access/payment-link/detail',
  completePreAuth: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion',
  cancelPreAuth: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation',
  payout: '/api/payment-gateway/v2/direct-payment/merchant/payout',
  updateBeneficiaryStatus: '/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status',
  addBeneficiary: '/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout',
  getTransactionsByMerchantRef: '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref',
} as const;

/**
 * Payment status codes returned by checkTransaction, getTransactionDetail,
 * and getTransactionList.
 *
 * Discovered via sandbox testing — these numeric codes are undocumented in
 * the OpenAPI spec but confirmed against live sandbox responses:
 *   - `payment_status_code: 0` → `payment_status: "APPROVED"`
 *   - `payment_status_code: 2` → `payment_status: "PENDING"`
 *   - `payment_status_code: 4` → `payment_status: "REFUNDED"`
 *
 * Use these constants instead of magic numbers:
 * @example
 * if (response.data?.payment_status_code === PAYMENT_STATUS_CODES.APPROVED) { ... }
 */
export const PAYMENT_STATUS_CODES = {
  APPROVED: 0,
  PRE_AUTH: 0, // same code as APPROVED; distinguish via payment_status string
  PENDING: 2,
  DECLINED: 3,
  REFUNDED: 4,
  CANCELLED: 7,
} as const;

/**
 * Human-readable payment status strings returned alongside the numeric codes.
 * Use this to build a reverse lookup or for display purposes.
 *
 * @example
 * const status = PAYMENT_STATUS_LABELS[0]; // "APPROVED"
 */
export const PAYMENT_STATUS_LABELS: Record<number, string> = {
  0: 'APPROVED',
  2: 'PENDING',
  3: 'DECLINED',
  4: 'REFUNDED',
  7: 'CANCELLED',
};

/**
 * PayWay refund-specific error codes discovered via sandbox testing.
 * These codes are returned in `status.code` on the refund endpoint.
 * Not an exhaustive list — PayWay may add new codes without notice.
 *
 * @see RefundResponse type in types.ts for the full status block shape.
 */
export const REFUND_ERROR_CODES = {
  /** Success */
  SUCCESS: '00',
  /** Invalid hash */
  INVALID_HASH: 'PTL02',
  /** Refund amount exceeds original transaction amount */
  REFUND_EXCEEDS_ORIGINAL: 'PTL37',
  /** Parameter validation required (e.g. refund_amount < 0.01) */
  PARAMETER_VALIDATION: 'PTL04',
  /** Unable to refund */
  UNABLE_TO_REFUND: 'PTL57',
  /** Refund failed */
  REFUND_FAILED: 'PTL58',
  /** Concurrent request rejected */
  CONCURRENT_REJECTED: 'PTL168',
  /** Insufficient available balance */
  INSUFFICIENT_BALANCE: 'PTL181',
  /** Transaction not found or is invalid (refund target does not exist) */
  REFUND_TARGET_NOT_FOUND: 'PTL36',
} as const;

/**
 * Pre-auth (hold payments) error codes discovered via sandbox testing
 * (2026-08-25 scope campaign). Returned on the pre-auth completion and
 * cancellation endpoints.
 */
export const PRE_AUTH_ERROR_CODES = {
  /** Unable to complete pre-authorization — transaction status invalid for capture */
  UNABLE_TO_COMPLETE: 'PTL59',
  /** Merchant information invalid (e.g. profile lacks payout permission) */
  MERCHANT_INVALID: 'PTL62',
  /** Unable to cancel pre-authorization — transaction status invalid */
  UNABLE_TO_CANCEL: 'PTL170',
} as const;

/**
 * Payout / split-payout error codes (direct payout API).
 *
 * Source: PayWay integration guidance + sandbox probing. The payout currency
 * must match the beneficiary account currency AND the merchant credential
 * currency, otherwise the gateway rejects with HTTP 403 / `PTL147` (or the
 * numeric `12`, "Payment currency is not allowed").
 *
 * Note: numeric gateway code `37`, `PTL146`, `PTL-PAYOUT-37`, and `PTL46` all
 * indicate a non-whitelisted payout account; `PTL-PAYOUT-36` indicates a
 * beneficiary-amount vs payout-amount mismatch.
 */
export const PAYOUT_ERROR_CODES = {
  /** Payout currency does not match beneficiary/merchant credential currency */
  CURRENCY_NOT_ALLOWED: 'PTL147',
  /** Beneficiary account not whitelisted for payout */
  ACCOUNT_NOT_WHITELISTED: 'PTL146',
  /** Sum of beneficiary amounts != payout (transaction complete) amount */
  AMOUNT_MISMATCH: 'PTL-PAYOUT-36',
} as const;

/**
 * Sandbox-verified gateway error code hints (numeric `status.code` values).
 * Used by the CLI `explain` command; not exhaustive.
 *
 * Sources: docs/12 error table + 2026-08-25 sandbox campaigns.
 */
export const GATEWAY_CODE_HINTS: Record<string, { title: string; hint: string }> = {
  '1': { title: 'Wrong Hash', hint: 'HMAC signature mismatch — check API key, field ordering, base64 vs hex encoding.' },
  '4': { title: 'Invalid Data', hint: 'Server-side binding/validation failed — see errors map in rawBody for per-field messages.' },
  '5': { title: 'Transaction Not Found', hint: 'Close/cancel target does not exist — verify tran_id.' },
  '6': { title: 'tran_id not found', hint: 'check-transaction found no transaction with this ID.' },
  '7': { title: 'Invalid Request Data', hint: 'Missing or malformed field - check parameter types.' },
  '8': { title: 'merchant_id not found', hint: 'Merchant identity rejected on this endpoint (sandbox-verified HTTP 403 on check-transaction) - check PAYWAY_MERCHANT_ID or the active profile.' },
  '12': { title: 'Payment currency not allowed', hint: 'Payout currency must match the beneficiary account currency and your merchant credential currency (e.g. send USD to a USD account).' },
  '15': { title: 'Invalid Merchant', hint: 'merchant_id not recognized in this environment.' },
  '16': { title: 'Invalid Amount', hint: 'Amount format wrong — use formatAmount()/decimal rules for the currency.' },
  '17': { title: 'Invalid Currency', hint: "Currency must be 'USD' or 'KHR'." },
  '22': { title: 'Expired Transaction', hint: 'Transaction/token expired — create a new one or renew the token.' },
  '23': { title: 'Transaction Not Found', hint: 'No transaction with this tran_id (may have been closed).' },
  '24': { title: 'Invalid Beneficiary Data', hint: 'RSA-encrypted beneficiaries malformed — verify public key + account format.' },
  '26': { title: 'Invalid Merchant Profile', hint: 'Merchant identity rejected (sandbox-verified HTTP 400 on exchange-rate with unknown merchant_id) — check PAYWAY_MERCHANT_ID or the active profile.' },
  '37': { title: 'Payout Whitelist', hint: 'Payout account not whitelisted — call addBeneficiary() first.' },
  '49': { title: 'Invalid Request', hint: "Validation failed. For transaction-list dates use \"YYYY-MM-DD HH:mm:ss\"." },
  '69': { title: 'Lifetime Below Minimum', hint: 'Checkout purchase lifetime must be >= 3 minutes (API takes minutes; max 43200 = 30 days; spec-documented).' },
  '96': { title: 'Payee / Merchant Data', hint: 'Beneficiary payee unknown, or payment-link id invalid (detail).' },
};

/**
 * Sandbox-verified `token_flag` enums for credentials-on-file endpoints.
 *
 * Sources (RTM R-08/R-09, `docs/09:185-188`, sandbox campaign section 9):
 * - linking (link-account / link-card): `CITI_FLEX | CITO_FLEX | CITO_FIX | CITR_FLEX`
 *   (`CITR_FIX` is NOT an accepted linking value).
 * - charging (purchase with payment credential): `CITU_FLEX | MITU_FLEX | MITU_FIX | MITR_FLEX | MITR_FIX`.
 */
export const TOKEN_FLAG_LINKING = ['CITI_FLEX', 'CITO_FLEX', 'CITO_FIX', 'CITR_FLEX'] as const;
export const TOKEN_FLAG_CHARGING = ['CITU_FLEX', 'MITU_FLEX', 'MITU_FIX', 'MITR_FLEX', 'MITR_FIX'] as const;

/** Server-enforced identifier rule observed in sandbox campaigns (`[a-zA-Z0-9]{5,24}`). */
export const REQUEST_ID_PATTERN = /^[a-zA-Z0-9]{5,24}$/;

/**
 * PayWay generate-qr lifetime minimum, in seconds. The API takes whole
 * minutes and rejects anything below 3 with an opaque HTTP 400 code "04"
 * (sandbox-pinned boundary 2026-08-30: 179s → 400 "04", 180s → OK; see
 * docs/SANDBOX-FINDINGS.md §13a).
 */
export const QR_LIFETIME_MIN_SECONDS = 180;

/** QR lifetime documented maximum: 120 days (OpenAPI spec). Not enforced locally. */
export const QR_LIFETIME_MAX_SECONDS = 120 * 24 * 60 * 60;

/**
 * Checkout-purchase lifetime minimum, in MINUTES. The purchase API takes
 * minutes (unlike the QR domain, which accepts seconds) and rejects values
 * below 3 with error 69 (OpenAPI spec).
 */
export const PURCHASE_LIFETIME_MIN_MINUTES = 3;

/** ABA grants linked account/card tokens a documented ~90-day validity window; renewal resets it. */
export const TOKEN_VALIDITY_DAYS = 90;

/**
 * QR image templates accepted by the generate-qr API, all verified in sandbox
 * (docs/SANDBOX-FINDINGS.md "QR template" section). `template2` is the API
 * default. Powers the `--template` validator and the interactive template
 * picker; hints describe the rendered card style.
 */
export const QR_TEMPLATES = [
  { value: 'template1', label: 'template1', hint: 'Classic black & white card, no branding' },
  { value: 'template1_color', label: 'template1_color', hint: 'Classic layout with ABA brand color' },
  { value: 'template2', label: 'template2 (default)', hint: 'White card with ABA logo header' },
  { value: 'template2_color', label: 'template2_color', hint: 'Default layout with brand color' },
  { value: 'template3_color', label: 'template3_color', hint: 'Compact color design' },
  { value: 'template4', label: 'template4', hint: 'Tall receipt style, black & white' },
  { value: 'template4_color', label: 'template4_color', hint: 'Tall receipt style with brand color' },
] as const;

export type QrTemplateName = (typeof QR_TEMPLATES)[number]['value'];

/** Raw template names (without display labels) for validation and suggestions. */
export const QR_TEMPLATE_NAMES: readonly string[] = QR_TEMPLATES.map((template) => template.value);

/**
 * Payment options accepted by purchase/generate-qr endpoints (src/client.ts).
 * `abapay_khqr` is the generate-qr default; `abapay_khqr_deeplink` the
 * generate-checkout default.
 */
export const PAYMENT_OPTIONS = ['cards', 'abapay_khqr', 'abapay_khqr_deeplink', 'alipay', 'wechat', 'google_pay'] as const;

export type PaymentOptionName = (typeof PAYMENT_OPTIONS)[number];


