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
  requestQr: '/api/payment-gateway/v1/payments/request-qr',
  createPaymentLink: '/api/merchant-portal/merchant-access/payment-link/create',
  getPaymentLinkDetails: '/api/merchant-portal/merchant-access/payment-link/detail',
  voidPaymentLink: '/api/merchant-portal/merchant-access/payment-link/void',
  completePreAuth: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion',
  cancelPreAuth: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation',
  payout: '/api/payment-gateway/v2/direct-payment/merchant/payout',
  updateBeneficiaryStatus: '/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status',
  addBeneficiary: '/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout',
  getTransactionsByMerchantRef: '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref',
  registerNewMerchant: '/api/merchant-portal/online-self-activation/new-merchant',
  getMerchantCredentialInfo: '/api/merchant-portal/online-self-activation/get-mc-credential-info',
  getMerchantInfo: '/api/merchant-portal/online-self-activation/get-mc-info',
} as const;

/**
 * Side-effecting (mutation) endpoints — operations that create or move money,
 * or make irreversible state changes. These default to SINGLE-ATTEMPT transport
 * (no automatic retry) because a lost response means an UNKNOWN outcome:
 * transaction IDs are not a gateway idempotency key (sandbox accepts duplicate
 * tran_ids silently, W5-7), so an automatic re-send could double-charge or
 * double-refund. Reads keep the bounded retry default. A caller can still opt a
 * specific call back into retries via `retry: 'transient'`, or globally via
 * `mutationRetryPolicy: 'transient'` on the client config (audit F01).
 */
export const MUTATION_ENDPOINTS = new Set<string>([
  ENDPOINTS.generateQr,
  ENDPOINTS.requestQr,
  ENDPOINTS.purchase,
  ENDPOINTS.refund,
  ENDPOINTS.closeTransaction,
  ENDPOINTS.linkAccount,
  ENDPOINTS.linkCard,
  ENDPOINTS.payment,
  ENDPOINTS.renewToken,
  ENDPOINTS.removeToken,
  ENDPOINTS.createPaymentLink,
  ENDPOINTS.voidPaymentLink,
  ENDPOINTS.completePreAuth,
  ENDPOINTS.cancelPreAuth,
  ENDPOINTS.payout,
  ENDPOINTS.updateBeneficiaryStatus,
  ENDPOINTS.addBeneficiary,
  ENDPOINTS.registerNewMerchant,
  ENDPOINTS.getMerchantCredentialInfo,
  ENDPOINTS.getMerchantInfo,
]);

/**
 * Payment status codes returned by checkTransaction, getTransactionDetail,
 * and getTransactionList.
 *
 * Discovered via sandbox testing — these numeric codes are undocumented in
 * the OpenAPI spec but confirmed against live sandbox responses, and the
 * canonical mapping was confirmed by the ABA integration team (2026-09-12):
 *   - `payment_status_code: 0` → `payment_status: "APPROVED"`
 *   - `payment_status_code: 2` → `payment_status: "PENDING"` (may persist up
 *     to ~24h before the gateway settles the final state)
 *   - `payment_status_code: 3` → `payment_status: "DECLINED"`
 *   - `payment_status_code: 4` → `payment_status: "REFUNDED"`
 *   - `payment_status_code: 7` → `payment_status: "CANCELLED"` (pre-auth)
 *
 * There is NO EXPIRED or CLOSED code — long-PENDING is the gateway's terminal
 * representation of expired/closed transactions; merchants enforce expiry
 * client-side (SANDBOX-FINDINGS §21, confirmed by ABA 2026-09-12).
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
  /** Completion failed — the payment service provider returned an unexpected response (production telemetry 2026-09) */
  COMPLETION_FAILED: 'PTL172',
} as const;

/**
 * Default pre-auth capture/hold window (ABA integration team, 2026-09-12):
 * up to 30 days from the initial pre-authorization. Within the window the
 * pre-auth can be completed (full or partial) or cancelled; after it, the
 * hold auto-cancels/auto-reverses and funds are released — with NO webhook
 * for the auto-release, so poll Check Transaction to observe the terminal
 * state. The window is per-merchant configurable; confirm the profile value
 * with ABA when integrating.
 */
export const PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS = 30;

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
  '0': { title: 'Success', hint: 'Business success. purchase/exchange-rate/close-transaction/transaction-list and the merchant-portal APIs report "00"; generate-qr and payout report "0".' },
  '1': { title: 'Wrong Hash', hint: 'HMAC signature mismatch — check API key, field ordering, base64 vs hex encoding.' },
  '2': { title: 'Transaction Not Closable', hint: 'Transaction status does not allow close — sandbox-verified: closing an already PAID transaction answers 403 code 2 (SANDBOX-FINDINGS §21). Only OPEN/PENDING transactions can be closed.' },
  '3': { title: 'Invalid Transaction Amount', hint: 'Amount rejected (non-positive, wrong decimal scale, or mismatched) — seen on purchase, pre-auth-completion and refund (production telemetry 2026-09).' },
  '4': { title: 'Duplicated Transaction ID', hint: 'tran_id already exists for this merchant — send a fresh unique tran_id (production telemetry 2026-09: purchase, generate-qr, payout). The STRING code "04" is the separate validation/binding failure.' },
  '5': { title: 'Transaction Not Found', hint: 'Close/cancel target does not exist — verify tran_id.' },
  '6': { title: 'tran_id not found', hint: 'check-transaction found no transaction with this ID. On purchase the same numeric code means "Requested Domain is not in whitelist" (production telemetry 2026-09) — ask PayWay to whitelist the domain.' },
  '7': { title: 'Invalid Request Data', hint: 'Missing or malformed field - check parameter types.' },
  '8': { title: 'merchant_id not found', hint: 'Merchant identity rejected on this endpoint (sandbox-verified HTTP 403 on check-transaction) - check PAYWAY_MERCHANT_ID or the active profile. Production telemetry 2026-09: on refund/payout/transaction-list/generate-qr an 8 is instead a GENERIC 500-class "Something went wrong" — retry once, then contact PayWay support with the trace id.' },
  '12': { title: 'Payment currency not allowed', hint: 'Payout currency must match the beneficiary account currency and your merchant credential currency (e.g. send USD to a USD account).' },
  '15': { title: 'Invalid Merchant', hint: 'merchant_id not recognized in this environment.' },
  '16': { title: 'Invalid Amount', hint: 'Amount format wrong — use formatAmount()/decimal rules for the currency.' },
  '17': { title: 'Invalid Currency', hint: "Currency must be 'USD' or 'KHR'." },
  '22': { title: 'Expired Transaction', hint: 'Transaction/token expired — create a new one or renew the token.' },
  '23': { title: 'Transaction Not Found', hint: 'No transaction with this tran_id (may have been closed).' },
  '24': { title: 'Invalid Beneficiary Data', hint: 'RSA-encrypted beneficiaries malformed — verify public key + account format.' },
  '26': { title: 'Invalid Merchant Profile', hint: 'Merchant identity rejected (sandbox-verified HTTP 400 on exchange-rate with unknown merchant_id) — check PAYWAY_MERCHANT_ID or the active profile.' },
  '29': { title: 'Card Inactive', hint: 'Issuer reports the card inactive — customer uses another card (purchase telemetry 2026-09: "your card is inactive").' },
  '30': { title: 'Card Declined By Issuer', hint: 'Issuer declined — customer verifies the card is active or uses another card.' },
  '37': { title: 'Payout Whitelist', hint: 'Payout account not whitelisted — call addBeneficiary() first (production message: "Payout accounts are not in whitelist.").' },
  '49': { title: 'Invalid Request', hint: "Validation failed. For transaction-list dates use \"YYYY-MM-DD HH:mm:ss\"." },
  '52': { title: 'Incorrect Card Details', hint: 'Card number/expiry/CVV failed — customer re-enters the card details.' },
  '58': { title: 'Card Declined By Issuer', hint: 'Issuer declined without detail — customer contacts the issuer bank or uses another card.' },
  '59': { title: 'Card Insufficient Funds', hint: 'Card funds/limit exhausted — customer uses another card or frees funds first.' },
  '60': { title: 'Card Usage Limit Reached', hint: 'Card hit its issuer usage limit — another card, or issuer-bank support.' },
  '68': { title: 'Card Declined By Issuer', hint: 'Issuer declined without detail — customer contacts the issuer bank or uses another card.' },
  '69': { title: 'Lifetime Below Minimum', hint: 'Checkout purchase lifetime must be >= 3 minutes (API takes minutes; max 43200 = 30 days; spec-documented).' },
  '75': { title: 'Card Declined By Issuer', hint: 'Issuer declined; message advises another card or issuer-bank support.' },
  '96': { title: 'Payee / Merchant Data', hint: 'Beneficiary payee unknown, or payment-link id invalid (detail).' },
  '500': { title: 'Gateway Error', hint: 'Generic 500-class failure ("Something went wrong... digital support team") — retry once, then contact PayWay support with the trace id (telemetry: transaction-list, generate-qr, payment-link detail).' },
  '503': { title: 'System Under Maintenance', hint: 'PayWay is under maintenance — pause and retry later (telemetry: purchase).' },
  '999': { title: 'Something Went Wrong', hint: 'Generic gateway failure, "please try again later" — retry with backoff; not a merchant config issue (telemetry: purchase).' },
};

/**
 * Payment-link PTL error codes not claimed by other families (PTL02/PTL04
 * resolve via the refund family; `96` via the QR family). Sources: official
 * create/detail pages + sandbox probes (SANDBOX-FINDINGS §22, 2026-09-06;
 * PTL188 from the void probe, §23, 2026-09-11).
 */
export const PAYMENT_LINK_ERROR_CODES = {
  /** Parameter invalid format */
  PARAMETER_INVALID_FORMAT: 'PTL05',
  /** Merchant invalid currency */
  MERCHANT_INVALID_CURRENCY: 'PTL99',
  /** Invalid payment link (detail) */
  INVALID_PAYMENT_LINK: 'PTL132',
  /** Payment link already voided (void) */
  ALREADY_VOIDED: 'PTL188',
} as const;

export const PAYMENT_LINK_TITLES: Record<string, string> = {
  PTL05: 'Parameter Invalid Format',
  PTL99: 'Merchant Invalid Currency',
  PTL132: 'Invalid Payment Link',
  PTL188: 'Payment Link Already Voided',
};

export const PAYMENT_LINK_HINTS: Record<string, string> = {
  PTL05: 'Check datatypes — amounts are numbers in the SDK (the official docs declare strings; the gateway accepts numbers). Sandbox probes: malformed values answered PTL04 instead.',
  PTL99: 'Currency not enabled for the merchant profile. Sandbox probe: EUR answered PTL04 — PTL99 not yet reproduced on this profile.',
  PTL132: 'Invalid payment link — pass the opaque data.id returned by create, NOT merchant_ref_no, NOT the URL slug. Sandbox note (2026-09-06): a bogus id answered 96 instead.',
  PTL188: 'The payment link is already voided — already in the desired terminal state, not a failure. Void is not idempotent (HTTP 403, SANDBOX-FINDINGS §23); a second void on the same link id always answers PTL188.',
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
 * sandbox verification dated 2026-08-30).
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
 * (sandbox template verification dated 2026-08-30). `template2` is the API
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
 *
 * Note on `google_pay`: the ABA integration team reported (2026-09-12) that
 * online Google Pay was "not available at the time of the guidance" with no
 * activation flow documented. The value stays accepted here (the gateway may
 * support it per profile), but merchants should verify availability for their
 * merchant profile with ABA before advertising it on checkout.
 */
export const PAYMENT_OPTIONS = ['cards', 'abapay_khqr', 'abapay_khqr_deeplink', 'alipay', 'wechat', 'google_pay'] as const;

export type PaymentOptionName = (typeof PAYMENT_OPTIONS)[number];

/**
 * payment_option values documented for the PURCHASE path (generate-checkout /
 * hosted checkout). The archived gateway spec
 * (docs/archive/Default module.openapi.json) documents `cards`, `abapay`,
 * `abapay_deeplink`; `abapay_khqr_deeplink` (the checkout default) and
 * `google_pay` (requires googlePayToken — see checkout domain validation) are
 * live-verified additions. QR-only values (`abapay_khqr`, `wechat`, `alipay`)
 * are intentionally absent — use PAYMENT_OPTIONS for the QR endpoints.
 */
export const PURCHASE_PAYMENT_OPTIONS = [
  'cards',
  'abapay',
  'abapay_deeplink',
  'abapay_khqr_deeplink',
  'google_pay',
] as const;

export type PurchasePaymentOptionName = (typeof PURCHASE_PAYMENT_OPTIONS)[number];

