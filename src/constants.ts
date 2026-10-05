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
  /** Refund amount below the minimum allowed (ABA-bot relay 2026-10-03; the numeric per-currency floor is undocumented — ≥ $0.01 USD / ≥ 1 KHR stays the advisory) */
  BELOW_MINIMUM: 'PTL187',
  /** Transaction not found or is invalid (refund target does not exist) */
  REFUND_TARGET_NOT_FOUND: 'PTL36',
} as const;

/**
 * Credential/rotation rejection codes (ABA-bot relay 2026-10-03, doc-derived).
 * Key rotation has NO dual-key overlap window: once the Integration Team enforces
 * replacements, traffic signed with the old credentials is rejected with these
 * codes (HTTP 403). Plan a zero-overlap cut-over and re-verify with a test
 * transaction afterwards.
 */
export const CREDENTIAL_ERROR_CODES = {
  /** Requests signed with stale/old credentials after a rotation */
  STALE_CREDENTIALS: 'PTL171',
  /** Wrong encryption — credential/RSA mismatch after a rotation */
  WRONG_ENCRYPTION: 'PTL175',
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
  '3': { title: 'Invalid Transaction Amount', hint: 'Amount rejected (non-positive, wrong decimal scale, or mismatched) — seen on purchase, pre-auth-completion and refund (production telemetry 2026-09). Below-minimum floor: USD < 0.01 / KHR < 100 (payment-credential endpoint error table 2026-10).' },
  '4': { title: 'Duplicated Transaction ID', hint: 'tran_id already exists for this merchant — send a fresh unique tran_id (production telemetry 2026-09: purchase, generate-qr, payout). The STRING code "04" is the separate validation/binding failure. On the payment-credential purchase leg the duplicate code is instead 83.' },
  '5': { title: 'Transaction Not Found', hint: 'Close/cancel target does not exist — verify tran_id.' },
  '6': { title: 'tran_id not found', hint: 'check-transaction found no transaction with this ID. On purchase the same numeric code means "Requested Domain is not in whitelist" (production telemetry 2026-09, confirmed by the payment-credential endpoint error table 2026-10) — ask PayWay to whitelist the domain.' },
  '7': { title: 'Invalid Request Data', hint: 'Missing or malformed field - check parameter types.' },
  '8': { title: 'merchant_id not found', hint: 'Merchant identity rejected on this endpoint (sandbox-verified HTTP 403 on check-transaction) - check PAYWAY_MERCHANT_ID or the active profile. Production telemetry 2026-09: on refund/payout/transaction-list/generate-qr an 8 is instead a GENERIC 500-class "Something went wrong" — retry once, then contact PayWay support with the trace id (the payment-credential endpoint error table 2026-10 confirms the generic reading on purchase too).' },
  '11': { title: 'Payment Processor Unresponsive', hint: 'No valid response returned from the payment processor — transient upstream failure; surface the gateway advice ("Something went wrong. Try again or contact the merchant for help."), retry once, then contact PayWay support (payment-credential endpoint error table 2026-10).' },
  '12': { title: 'Payment currency not allowed', hint: 'Payout currency must match the beneficiary account currency and your merchant credential currency (e.g. send USD to a USD account). Root cause per the payment-credential endpoint table (2026-10): the merchant profile has no settlement account for the requested currency.' },
  '15': { title: 'Invalid Merchant', hint: 'merchant_id not recognized in this environment.' },
  '16': { title: 'Invalid Amount', hint: 'Amount format wrong — use formatAmount()/decimal rules for the currency.' },
  '17': { title: 'Invalid Currency', hint: "Currency must be 'USD' or 'KHR'." },
  '22': { title: 'Expired Transaction', hint: 'Transaction/token expired — create a new one or renew the token. On purchase/payment-credential the code instead means "This service is not enabled" — the requested transaction type is not supported for this merchant profile (endpoint error table 2026-10).' },
  '23': { title: 'Transaction Not Found', hint: 'No transaction with this tran_id (may have been closed).' },
  '24': { title: 'Invalid Beneficiary Data', hint: 'RSA-encrypted beneficiaries malformed — verify public key + account format.' },
  '25': { title: 'Too Many Beneficiaries', hint: 'Payout/split list exceeds the 10-beneficiary maximum per request — split across multiple requests (payment-credential endpoint error table 2026-10).' },
  '26': { title: 'Invalid Merchant Profile', hint: 'Merchant identity rejected (sandbox-verified HTTP 400 on exchange-rate with unknown merchant_id) — check PAYWAY_MERCHANT_ID or the active profile.' },
  '29': { title: 'Card Inactive', hint: 'Issuer reports the card inactive — customer uses another card (purchase telemetry 2026-09: "your card is inactive").' },
  '30': { title: 'Card Declined By Issuer', hint: 'Issuer declined — customer verifies the card is active or uses another card.' },
  '36': { title: 'Payout Account or Amount Invalid', hint: 'A payout entry is invalid or the beneficiary amounts do not total the transaction amount — the SDK and payment-link create enforce the total-matches rule locally; sibling PTL-PAYOUT-36 covers pre-auth complete-payout (payment-credential endpoint error table 2026-10).' },
  '37': { title: 'Payout Whitelist', hint: 'Payout account not whitelisted — call addBeneficiary() first (production message: "Payout accounts are not in whitelist.").' },
  '38': { title: 'Payout Invalid Transaction ID', hint: 'A payout entry carries an invalid tran_id — check format and uniqueness (payment-credential endpoint error table 2026-10).' },
  '39': { title: 'Payout Duplicated Account', hint: 'The same beneficiary account appears more than once in the payout list — dedupe before retry (payment-credential endpoint error table 2026-10).' },
  '40': { title: 'Payout Duplicated Transaction ID', hint: 'A payout tran_id already exists — payout tran_ids must be unique per merchant (payment-credential endpoint error table 2026-10).' },
  '41': { title: 'Payout MID Not Linked', hint: 'The payout mid is not linked to any merchant profile — verify the split-payout MID with PayWay (payment-credential endpoint error table 2026-10).' },
  '46': { title: 'KHR Amount Has Decimals', hint: 'KHR amounts must be whole numbers — the SDK already rejects decimal KHR amounts locally with PayWayConfigError (payment-credential endpoint error table 2026-10).' },
  '49': { title: 'Invalid Request', hint: "Validation failed. For transaction-list dates use \"YYYY-MM-DD HH:mm:ss\"." },
  '52': { title: 'Incorrect Card Details', hint: 'Card number/expiry/CVV failed — customer re-enters the card details.' },
  '58': { title: 'Card Declined By Issuer', hint: 'Issuer declined without detail — customer contacts the issuer bank or uses another card.' },
  '59': { title: 'Card Insufficient Funds', hint: 'Card funds/limit exhausted — customer uses another card or frees funds first.' },
  '60': { title: 'Card Usage Limit Reached', hint: 'Card hit its issuer usage limit — another card, or issuer-bank support.' },
  '68': { title: 'Card Declined By Issuer', hint: 'Issuer declined without detail — customer contacts the issuer bank or uses another card.' },
  '69': { title: 'Lifetime Below Minimum', hint: 'Checkout purchase lifetime must be >= 3 minutes (API takes minutes; max 43200 = 30 days; spec-documented).' },
  '71': { title: 'Card Payout To ABA Account Not Allowed', hint: 'Card-token payouts cannot target an ABA account — use a whitelisted bank/beneficiary account (payment-credential endpoint error table 2026-10).' },
  '75': { title: 'Card Declined By Issuer', hint: 'Issuer declined; message advises another card or issuer-bank support.' },
  '77': { title: 'Transaction Fees Not Supported', hint: 'Consumer/merchant transaction-fee configuration is not supported for this card-on-file purchase — drop the fee fields (payment-credential endpoint error table 2026-10).' },
  '80': { title: 'Custom Fields Invalid', hint: 'custom_fields or items cannot be decoded, or too many items per request — send valid JSON and trim the list (payment-credential endpoint error table 2026-10).' },
  '83': { title: 'Transaction Duplicated', hint: 'tran_id already used for this merchant profile — on the payment-credential purchase leg the duplicate code is 83, not 4 (endpoint error table 2026-10); same remediation as 4: send a fresh unique tran_id.' },
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

/**
 * Production-valid token_flag subsets (ABA-bot relay 2026-10-03, doc-derived —
 * the FULL enums above keep the extra values this sandbox accepts). The
 * published spec lists ONLY these; `CITO_FIX`/`CITR_FLEX` (linking) and
 * `MITU_FIX`/`MITR_FLEX` (charging) appear nowhere in it — treat them as
 * out-of-contract for production. Subscription registration uses `CITR_FIX`
 * (with frequency 1W|1M|2M); subsequent scheduled charges use `MITR_FIX`.
 */
export const TOKEN_FLAG_LINKING_PRODUCTION = ['CITI_FLEX', 'CITO_FLEX'] as const;
export const TOKEN_FLAG_CHARGING_PRODUCTION = ['CITU_FLEX', 'MITU_FLEX', 'MITR_FIX'] as const;

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

/**
 * ABA grants linked account/card tokens a documented ~90-day validity window
 * (ROLLING, ABA-bot relay 2026-10-03: "90 days after their initial linking,
 * renewal, or the last successful transaction — whichever is most recent");
 * renewal or any successful charge restarts it. Applies to unscheduled
 * account tokens (CITI_FLEX/CITO_FLEX); scheduled tokens carry an explicit
 * `expired_at` instead.
 */
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
 * Superset of payment_option string values across the online endpoints
 * (`abapay_khqr` is the generate-qr default; `abapay_khqr_deeplink` the
 * generate-checkout default). This is the shared TYPE surface only —
 * enforcement is per endpoint via the official sets below
 * (PURCHASE_PAYMENT_OPTIONS for purchase, QR_PAYMENT_OPTIONS for generate-qr).
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
 * Official purchase-path `payment_option` enum (rule PUR-003,
 * OFFICIAL_DOCUMENTATION — developer.payway.com.kh purchase page, retrieved
 * 2026-10-05): `cards`, `abapay_khqr`, `abapay_khqr_deeplink`, `alipay`,
 * `wechat`, `google_pay`. `google_pay` additionally requires `googlePayToken`
 * (see checkout domain validation). Omitting payment_option entirely lets the
 * merchant profile decide.
 *
 * Never hard-reject a value this set lists (audit risk R-A): profile
 * enablement is the gateway's decision (official response code 23).
 */
export const PURCHASE_PAYMENT_OPTIONS = [
  'cards',
  'abapay_khqr',
  'abapay_khqr_deeplink',
  'alipay',
  'wechat',
  'google_pay',
] as const;

export type PurchasePaymentOptionName = (typeof PURCHASE_PAYMENT_OPTIONS)[number];

/**
 * Legacy purchase-path `payment_option` values (`abapay`, `abapay_deeplink`)
 * from the archived gateway spec (docs/archive/Default module.openapi.json).
 * Real profiles may still accept them, so they produce an advisory noting
 * their legacy status and are NEVER hard-rejected — not even under
 * `strictValidation` (audit risk R-A). Values in NEITHER this set nor
 * {@link PURCHASE_PAYMENT_OPTIONS} throw (rule PUR-003).
 */
export const PURCHASE_PAYMENT_OPTIONS_LEGACY = ['abapay', 'abapay_deeplink'] as const;

/**
 * Official generate-qr `payment_option` values (rule QR-012,
 * OFFICIAL_DOCUMENTATION — developer.payway.com.kh qr-api page, retrieved
 * 2026-10-05): exactly `abapay_khqr` (default), `wechat` (USD only) and
 * `alipay` (USD only). Values outside this set throw on the generate-qr path;
 * purchase-path values such as `cards`/`abapay_khqr_deeplink` are NOT valid
 * here. Profile enablement remains the gateway's decision (official code 23).
 * The Soundbox endpoint keeps its own spec-derived superset
 * (REQUEST_QR_PAYMENT_OPTIONS in src/domains/qr.ts — adds `abapay`).
 */
export const QR_PAYMENT_OPTIONS = ['abapay_khqr', 'wechat', 'alipay'] as const;

export type QrPaymentOptionName = (typeof QR_PAYMENT_OPTIONS)[number];

