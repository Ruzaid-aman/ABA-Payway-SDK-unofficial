import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { generateHmac, verifyCallbackDetailed, verifyCallbackSignature } from './auth.js';
import type { CallbackVerificationResult } from './auth.js';
import { BASE_URLS, ENDPOINTS, MUTATION_ENDPOINTS } from './constants.js';
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker.js';
import type { CheckoutDomain } from './domains/checkout.js';
// Audit D3: the hash-order hints derive from the domain constants so the
// drift-guard test (src/__tests__/hash-order-hints.test.ts) can pin hint ↔
// actually-signed order in both directions.
import { PURCHASE_HASH_FIELDS } from './domains/checkout.js';
import type { CredentialsOnFileDomain } from './domains/credentials-on-file.js';
import { LINK_CARD_HMAC_FIELDS } from './domains/credentials-on-file.js';
import {
  createCheckoutDomain,
  createCredentialsOnFileDomain,
  createKhqrDomain,
  createPaymentLinkDomain,
  createPayoutDomain,
  createPreAuthDomain,
  createQrDomain,
  createSelfActivationDomain,
} from './domains/index.js';
import { GENERATE_QR_HASH_FIELDS, REQUEST_QR_HASH_FIELDS } from './domains/qr.js';
import type { KhqrDomain } from './domains/khqr.js';
import type { PaymentLinkDomain } from './domains/payment-link.js';
import type { PayoutDomain } from './domains/payout.js';
import type { PreAuthDomain } from './domains/pre-auth.js';
import type { QrDomain } from './domains/qr.js';
import type { SelfActivationDomain } from './domains/self-activation.js';
import {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PayWaySignatureError,
  type HostedPageOutcome,
} from './errors.js';
import { type KhqrMerchantConfiguration, resolveKhqrConfiguration } from './khqr-config.js';
import {
  buildRequestDigest,
  buildResponseDigest,
  extractMerchantRefFrom,
  extractTransactionIdFrom,
  parseRequestBodyPayload,
  toTraceString,
} from './journal/digest.js';
import { createJournalEmitter } from './journal/writer.js';
import type { JournalContext, JournalOptions } from './journal/types.js';
import { createPayWayLogger, resolveLogLevel, type LogLevel } from './logger.js';
import { formatRequestTime, isValidPublicKeyPem, normalizePem, sanitizeForLog } from './utils.js';

export type Currency = 'USD' | 'KHR';
export type Environment = 'sandbox' | 'production';

export interface ItemEntry {
  name: string;
  quantity: number;
  price: number;
}

export interface RateLimitRule {
  limit: number;
  intervalMs: number;
}

export interface RateLimitInfo {
  /** Raw `x-rate-limit-limit` header value (requests per window). */
  limit?: number;
  /** Raw `x-rate-limit-remaining` header value. */
  remaining?: number;
  /**
   * Raw `x-rate-limit-reset` header value, parsed as a plain number. The
   * unit (epoch-seconds vs milliseconds) is UNCONFIRMED — no sandbox
   * response has carried this header — so treat it as opaque and prefer
   * `retryAfterMs` for retry decisions.
   */
  reset?: number;
  /** Milliseconds to wait: `Retry-After` delta-seconds × 1000, or an HTTP-date converted to a delay. */
  retryAfterMs?: number;
  rawHeaders?: Record<string, string>;
}

/** Correlation metadata attached (Phase 2) to the observability hooks. */
export interface PayWayHookMeta {
  /** Per-exchange correlation id — same value every journal event carries. */
  correlationId: string;
  /** 0-based attempt number (retries included). */
  attempt: number;
  /** Total elapsed ms since the exchange started (response hooks only). */
  durationMs?: number;
  /** Gateway `status.trace` when the response carried one. */
  traceId?: string;
}

/** Payload of the Phase 2 `onError` hook — fires on every failed attempt. */
export interface PayWayOnErrorInfo {
  endpoint: string;
  correlationId: string;
  attempt: number;
  statusCode?: number;
  paywayCode?: string;
  message: string;
  retryable?: boolean;
}

export interface PayWayConfig {
  merchantId?: string;
  apiKey?: string;
  publicKeyPem?: string;
  environment?: 'sandbox' | 'production';
  timeout?: number;
  baseUrl?: string;
  maxRetries?: number; // Default: 3 (QR-REQ-11: retry up to 3 times on transient failures)
  retryDelayMs?: number; // Default: 3000 (3 seconds between retries)
  /**
   * Transport policy for side-effecting (mutation) endpoints — see
   * `MUTATION_ENDPOINTS`. A lost response on a mutation is an UNKNOWN
   * outcome (transaction IDs are not gateway idempotency — duplicate
   * tran_ids are silently accepted, W5-7), so:
   *   - `'single'` (default): mutations are submitted exactly once; network/
   *     5xx/429 failures surface after the first attempt. Recover by QUERYING
   *     the existing attempt, never by re-sending.
   *   - `'transient'`: legacy behavior — mutations retry like reads. Use only
   *     when you have verified the specific endpoint is idempotent on the
   *     gateway side.
   * Reads are unaffected and always use the bounded retry default.
   */
  mutationRetryPolicy?: 'single' | 'transient';
  rateLimitThrottling?: boolean; // Default: true for endpoints with documented limits
  rateLimitRules?: Record<string, RateLimitRule>;
  debug?: boolean;
  /**
   * Phase 2: receives per-exchange correlation metadata (cid, attempt) as a
   * trailing argument — existing two-argument handlers keep working.
   */
  onRequest?: (endpoint: string, bodyPayload: string, meta?: PayWayHookMeta) => void;
  onResponse?: (
    endpoint: string,
    statusCode: number,
    body: unknown,
    rateLimitInfo?: RateLimitInfo,
    meta?: PayWayHookMeta,
  ) => void;
  /**
   * M8: `onRequest`/`onResponse` payloads pass through the same sanitizer as
   * the debug console path (`sanitizeForLog` — merchant_auth, hash, pwt,
   * google_pay_token and token-shaped keys become `***HIDDEN***`). Default
   * `true`. Set `false` to receive raw wire bodies (credentials/pwt/hash
   * included) — the explicit opt-in for wire-level debugging.
   */
  redactHookBodies?: boolean;
  /**
   * Phase 2: fires on every failed attempt (HTTP errors, network, timeout,
   * business failures) — the paths `onResponse` never sees. Fail-open.
   */
  onError?: (info: PayWayOnErrorInfo) => void;
  /** Called when a request is delayed locally by the token-bucket throttle for an endpoint with a documented limit. */
  onThrottle?: (info: { endpoint: string; waitMs: number }) => void;
  /** ABA-issued merchant data used only for official offline KHQR generation. */
  khqr?: KhqrMerchantConfiguration;
  /**
   * Escape hatch for the v3 token-management trio (renewToken/getTokenDetails/
   * removeToken). The live-documented HMAC compositions were sandbox-verified
   * 2026-08-31, so the operations are allowed by
   * DEFAULT now; set `false` to re-block them (legacy TD-03 posture).
   * @deprecated No longer required — kept as an opt-out only.
   */
  allowUnverifiedTokenOperations?: boolean;
  /**
   * Allow callback/return URLs pointing at private or loopback addresses
   * (127.0.0.1, 10.x, 172.16-31.x, 192.168.x, …). PayWay's servers cannot
   * reach those, so callbacks would never arrive — enable only for on-prem
   * gateways or tests. Default `false` (private hosts are rejected
   * client-side by validatePublicHttpsUrl).
   */
  allowPrivateCallbackHosts?: boolean;
  /**
   * TD-07: `'full'` randomizes exponential backoff to `random(0..delay)`
   * (AWS-style full jitter) so concurrent clients do not synchronize retries
   * into a thundering herd. Default `'none'` keeps deterministic delays for
   * reproducible tests.
   */
  backoffJitter?: 'full' | 'none';
  /**
   * TD-07: opt-in transport circuit breaker per endpoint
   * (closed → open after N consecutive network/5xx failures → half-open probe).
   * Pass `false` to disable explicitly; disabled by default.
   */
  circuitBreaker?: CircuitBreakerOptions | false;
  /** Minimum level for SDK diagnostics (TD-08). Falls back to PAYWAY_LOG_LEVEL / DEBUG_PAYWAY. */
  logLevel?: LogLevel;
  /** Emit single-line JSON diagnostics instead of `[payway]` text lines (TD-08). */
  logFormat?: 'text' | 'json';
  /**
   * Escalate advisory-limit warnings (gateway length caps, enum membership,
   * minimum amounts — see warnAdvisory) into PayWayConfigError throws.
   * Gateway-documented REQUIRED fields always validate regardless of this
   * flag. Also settable via PAYWAY_STRICT_VALIDATION=1.
   */
  strictValidation?: boolean;
  /**
   * Transaction Journal (audit-results/transaction-data-audit REPORT §14):
   * opt-in append-only JSONL record of every API exchange — correlation id,
   * attempts, duration, gateway trace id, redacted request/response digests.
   * `true` uses the defaults (`<cwd>/payway-data/journal.jsonl`, digest
   * mode); pass `{ dir, mode, maxAgeDays }` to override. `PAYWAY_JOURNAL=1`
   * + `PAYWAY_JOURNAL_DIR` + `PAYWAY_JOURNAL_MODE` +
   * `PAYWAY_JOURNAL_MAX_AGE_DAYS` fill any omitted part; `maxAgeDays` prunes
   * old events on write (best-effort retention guard).
   * Default: disabled — a library must never write files silently.
   */
  journal?: boolean | JournalOptions;
  /**
   * ABA-issued PARTNER id for the online-self-activation endpoints
   * (`/api/merchant-portal/online-self-activation/*` — archived gateway
   * spec; NOT live-verified). Distinct from `merchantId`: these endpoints
   * authenticate a registration PARTNER, not a merchant. Settable via
   * `PAYWAY_PARTNER_ID`.
   */
  partnerId?: string;
  /**
   * Partner HMAC secret used to sign self-activation requests
   * (`hash` = HMAC over `partner_id . request_data . request_time`, with a
   * per-endpoint SHA256/SHA512 split — see the self-activation domain).
   * Falls back to `apiKey` only when unset. Settable via
   * `PAYWAY_PARTNER_API_KEY`.
   */
  partnerApiKey?: string;
  /**
   * DX-SEC-001 (P0-04): path to a PEM file with the CA certificate bundle
   * used to VERIFY the gateway's TLS certificate — the safe alternative to
   * `NODE_TLS_REJECT_UNAUTHORIZED=0` for self-signed / corporate-intercepted
   * chains. The file must contain at least one `-----BEGIN CERTIFICATE-----`
   * block (the full presented chain, leaf first, is the safest bundle).
   *
   * When set, requests are routed through an `undici` Agent constructed with
   * this CA (loaded lazily — the default path never imports undici). A
   * missing or unparsable file throws `PayWayConfigError` at construction.
   * Settable via `PAYWAY_TLS_CA_FILE`.
   */
  tlsCaFile?: string;
  /**
   * Minimum TLS protocol version accepted on the transport
   * (DX-SEC-001). One of `TLSv1`, `TLSv1.1`, `TLSv1.2`, `TLSv1.3`;
   * the undici agent defaults to `TLSv1.2` (Node's own floor for modern
   * TLS) — anything lower must be set explicitly and is a red flag.
   * Only meaningful together with `tlsCaFile` today (the default global-fetch
   * path uses Node's built-in defaults). Settable via `PAYWAY_TLS_MIN_VERSION`.
   */
  tlsMinVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3';
}

interface ResolvedPayWayConfig extends PayWayConfig {
  merchantId: string;
  apiKey: string;
}

export interface GatewayErrorDetails {
  code?: string | number;
  message?: string;
  rawBody?: unknown;
  statusCode?: number;
}

/**
 * Per-call overrides for a single API request (DX review 2026-08-30).
 * Applied on top of the client-wide config for this call only — pass as the
 * trailing `callOptions` argument of any domain method.
 */
export interface RequestCallOptions {
  /** Override the client-wide request timeout (ms) for this call. */
  timeoutMs?: number;
  /**
   * Abort this call early; aborting the signal cancels the in-flight fetch.
   * A caller-requested abort is never retried.
   */
  signal?: AbortSignal;
}

export interface CreateTransactionParams {
  transactionId: string;
  amount: number;
  /**
   * Hosted-checkout locale for the browser form (`getCheckoutFormHtml` /
   * CLI `checkout-form`): appended to the purchase URL as `?lang=`
   * (ABA-bot relay 2026-10-03). en = default when omitted; some KHQR
   * screens ignore it (known product issue). Query param only — never
   * hashed, never sent in the POST body.
   */
  lang?: 'en' | 'km' | 'zh';
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  type?: 'purchase' | 'pre-auth';
  paymentOption?: 'cards' | 'abapay_khqr' | 'abapay_khqr_deeplink' | 'alipay' | 'wechat' | 'google_pay' | string;
  items?: string | ItemEntry[];
  shipping?: number;
  currency?: 'KHR' | 'USD';
  returnUrl?: string;
  cancelUrl?: string;
  skipSuccessPage?: 0 | 1;
  continueSuccessUrl?: string;
  returnDeeplink?: string | { ios_scheme: string; android_scheme: string };
  customFields?: string | Record<string, unknown>;
  returnParams?: string;
  viewType?: 'hosted_view' | 'popup';
  /**
   * 0 routes the request through the Checkout service. The response shape
   * depends on the request: `abapay_khqr_deeplink` + `viewType: 'hosted_view'`
   * returns JSON including `checkout_qr_url` (the hosted page URL); other
   * options return the hosted checkout page as HTML
   * (the typed `PurchaseHostedHtmlResult` from `checkout.purchaseHosted()`).
   */
  paymentGate?: number;
  payout?: string | { acc: string; amt: number }[];
  additionalParams?: string | Record<string, unknown>;
  /**
   * Lifetime in MINUTES, forwarded raw to the API (unlike the QR domain,
   * which accepts seconds). Spec: min 3 — values below 3 are rejected
   * locally with `PayWayConfigError` (the gateway would answer error 69) —
   * and max 43200 (30 days, not enforced locally).
   */
  lifetime?: number;
  googlePayToken?: string;
  /**
   * Retry policy for this purchase call. Default (omitted): single attempt —
   * purchase is a mutation endpoint and mutations are single-submit by
   * default (F01; duplicate tran_ids are silently accepted by the gateway, so
   * a re-send after a lost response could double-charge). Pass 'transient' to
   * re-send after network errors/5xx/429 when you have verified idempotency
   * for your flow; 'none' is now equivalent to the default but stays
   * accepted for explicitness.
   */
  retryPolicy?: 'transient' | 'none';
  /**
   * Subscription/recurring registration (live `subscription-21402227e0`
   * operation on the purchase path): merchant-side unique customer token
   * identifier. Required when `tokenFlag` is set.
   */
  ctid?: string;
  /**
   * Subscription token flag — currently only 'CITR_FIX' (fixed recurring)
   * is documented on the purchase path. When set, `ctid` becomes required
   * and `frequency` is required iff the flag is CITR_FIX. For other
   * linking flags use `credentialsOnFile.linkAccount`/`linkCard` instead.
   */
  tokenFlag?: 'CITR_FIX';
  /** Billing frequency — REQUIRED when tokenFlag='CITR_FIX' (live docs). */
  frequency?: '1W' | '1M' | '2M';
}

export interface LinkAccountParams {
  requestId: string;
  /** Customer token identifier — REQUIRED per the live docs (5–24 alnum). */
  ctid: string;
  returnDeeplink?: string | { ios_scheme: string; android_scheme: string };
  /** REQUIRED per the live docs. Live-documented values: CITI_FLEX | CITO_FLEX. */
  tokenFlag: string;
  /** REQUIRED per the live docs (profile-enabled currency). */
  currency: 'KHR' | 'USD';
  callbackUrl?: string;
  requestTime?: string;
}

export interface LinkCardParams {
  requestId: string;
  /** Customer token identifier — REQUIRED per the live docs (5–24 alnum). */
  ctid: string;
  /** @deprecated Not part of the live-documented link-card request; no longer sent. Use linkAccount for account deeplinks. */
  returnDeeplink?: string | { ios_scheme: string; android_scheme: string };
  /** REQUIRED per the live docs. Live-documented values: CITI_FLEX | CITO_FLEX. */
  tokenFlag: string;
  frequency?: '1W' | '1M' | '2M';
  /** @deprecated Not part of the live-documented link-card request; no longer sent (the hosted form's done-target is continueSuccessUrl). */
  returnUrl?: string;
  callbackUrl?: string;
  /**
   * Base64-encoded target of the hosted form's "Done" button (live docs).
   * Part of the live-documented hash order (last position).
   */
  continueSuccessUrl?: string;
  /**
   * Payment currency. Required by the sandbox binding layer
   * ("The currency field is required.") — defaults to 'USD'.
   */
  currency?: 'USD' | 'KHR';
  requestTime?: string;
}

export interface CofPaymentParams {
  /** @deprecated Not part of the live-documented request; no longer sent (verified 2026-08-31 — the binding layer no longer requires it). */
  requestId?: string;
  transactionId: string;
  amount: number;
  ctid?: string;
  paymentToken: string;
  tokenFlag?: string;
  currency?: 'KHR' | 'USD';
  callbackUrl?: string;
  requestTime?: string;
  /** Payer name — gateway caps at 20 chars (advisory). Live-documented hash position. */
  firstName?: string;
  /** Payer name — gateway caps at 20 chars (advisory). Live-documented hash position. */
  lastName?: string;
  /** Payer email — gateway caps at 50 chars (advisory). Live-documented hash position. */
  email?: string;
  /** Payer phone — gateway caps at 20 chars (advisory). Live-documented hash position. */
  phone?: string;
  /** 'purchase' (default) | 'pre-auth'. Live-documented hash position. */
  purchaseType?: 'purchase' | 'pre-auth';
  /** Item list — base64-encoded JSON when array. Live-documented hash position. */
  items?: string | ItemEntry[];
  /** Echoed in the pushback. Live-documented hash position. */
  returnParams?: string;
  /** Split-payout [{acc, amt}] — base64-encoded JSON when array. Live-documented hash position. */
  payout?: string | { acc: string; amt: number }[];
  /** Base64-encoded JSON when object. Live-documented hash position. */
  customFields?: string | Record<string, unknown>;
  /** Shipping fee — 'can be any amount' per live docs. Live-documented hash position. */
  shippingFee?: number;
}

/**
 * Renew an expired (or expiring) ACCOUNT token. Live-documented hash:
 * `ctid.request_time.pwt.merchant_id.request_id` (sandbox-verified 2026-08-31,
   * sandbox verification dated 2026-08-31).
 */
export interface RenewTokenParams {
  requestId: string;
  ctid: string;
  paymentToken: string;
  requestTime?: string;
}

/**
 * Retrieve stored-token details. Live-documented request carries ONLY
 * request_time/merchant_id/request_id — no ctid, no pwt (sandbox-verified
   * 2026-08-31).
 */
export interface GetTokenDetailsParams {
  requestId: string;
  requestTime?: string;
}

/**
 * Remove a linked account or card token (irreversible). Live-documented
 * request: request_time/merchant_id/ctid/pwt — no request_id
   * (sandbox-verified 2026-08-31).
 */
export interface RemoveTokenParams {
  ctid: string;
  paymentToken: string;
  requestTime?: string;
}

/**
 * @deprecated Legacy shared shape for the v3 token trio. The endpoints now
 * take per-endpoint params ({@link RenewTokenParams},
 * {@link GetTokenDetailsParams}, {@link RemoveTokenParams}) — the old shared
   * composition was wrong in the 2026-08-31 sandbox verification.
 */
export type TokenParams = RenewTokenParams;

export interface GenerateQrParams {
  transactionId: string;
  amount: number;
  paymentOption: 'abapay_khqr' | string;
  callbackUrl: string;
  purchaseType?: 'purchase' | 'pre-auth';
  currency?: 'KHR' | 'USD';
  qrImageTemplate?: string;
  requestTime?: string;
  /** Lifetime in seconds (SDK converts to whole minutes for the API). Min 3 minutes. */
  lifetime?: number;
  /** Item list — object/array entries are base64-encoded JSON. Max 500 chars / 10 items (advisory). */
  items?: string | ItemEntry[];
  /** Payer first name — gateway caps at 20 chars (err 16/17, advisory). */
  firstName?: string;
  /** Payer last name — gateway caps at 20 chars (err 16/17, advisory). */
  lastName?: string;
  /** Payer email — gateway caps at 50 chars (err 19, advisory). */
  email?: string;
  /** Payer phone — gateway caps at 20 chars (err 18, advisory). */
  phone?: string;
  /** Mobile app schemes — object form is base64-encoded JSON. Max 255 chars. */
  returnDeeplink?: string | { ios_scheme: string; android_scheme: string };
  /** Custom fields echoed in callbacks/details — object form is base64-encoded JSON. Max 255 chars. */
  customFields?: string | Record<string, unknown>;
  /** Extra params echoed in the pushback. */
  returnParams?: string;
  /** Split-payout instructions `[{account, amount}]` — base64-encoded JSON. Max 255 chars. */
  payout?: string | Array<{ account: string; amount: number }>;
}

/**
 * Parameters for the Soundbox QR endpoint (`payments/request-qr` — archived
 * gateway spec `docs/archive/Default module.openapi.json`; no live-docs page
 * as of 2026-09-12, contract is spec-derived and NOT live-verified).
 *
 * Differs from {@link GenerateQrParams}: `amount` is OPTIONAL (null lets the
 * Soundbox customer key in the amount on the device), `paymentOption` is
 * REQUIRED and accepts `abapay` (in addition to the QR set), `callbackUrl`
 * is REQUIRED, there is NO `qrImageTemplate`/`items`/payer-detail surface,
 * and `lifetime` is in MINUTES on the wire (default 30 days, min 3).
 */
export interface RequestQrParams {
  transactionId: string;
  /** Omit (or null) to let the Soundbox customer enter the amount on the device. */
  amount?: number | null;
  currency: 'KHR' | 'USD';
  /** REQUIRED — `abapay` | `abapay_khqr` | `wechat` (USD only) | `alipay` (USD only). */
  paymentOption: 'abapay' | 'abapay_khqr' | 'wechat' | 'alipay' | string;
  /** Public HTTPS pushback URL. Required by PayWay — base64-encoded automatically. */
  callbackUrl: string;
  purchaseType?: 'purchase' | 'pre-auth';
  /** Lifetime in MINUTES (the wire unit). Default 30 days; minimum 3 minutes. */
  lifetime?: number;
  requestTime?: string;
}

/**
 * Response of the Soundbox QR endpoint. Spec-derived (not live-verified):
 * `status.code` uses the gateway's numeric error-code family (0 success,
 * 1 invalid hash, 12 unsupported currency, … — see the archived spec).
 */
export interface RequestQrResponse {
  tran_id: string;
  qr_string: string;
  amount: number | null;
  currency: string;
  status: { code: string | number; message: string; trace_id?: string };
}

/**
 * An optional image attached to a payment link. Sent as a top-level
 * `multipart/form-data` part named `image`; the image bytes are NOT part of
 * the HMAC hash (confirmed against ABA's official sample: the hash covers
 * `request_time + merchant_id + merchant_auth` only).
 */
export interface PaymentLinkImage {
  /** Raw image bytes. */
  data: Uint8Array;
  /** Multipart filename as the gateway should store it. Default `'image.jpg'`. */
  filename?: string;
  /** MIME type of the image. Default `'image/jpeg'`. */
  contentType?: string;
}

export interface CreatePaymentLinkParams {
  title: string;
  amount: number;
  description?: string;
  paymentLimit?: number;
  /** Public HTTPS callback URL. Required by PayWay - base64-encoded automatically. */
  returnUrl: string;
  merchantRefNo: string;
  expiredDate?: number;
  /** Payment currency. Required by PayWay; defaults to 'USD'. */
  currency?: 'USD' | 'KHR';
  /**
   * Optional split-payout beneficiary list — travels INSIDE the RSA-encrypted
   * `merchant_auth` (spec: `payway-openapi/paths/payment-link.yaml`). Shape:
   * `[{acc, amt}]` (same keys as the purchase path; NOT the standalone payout
   * domain's `{account, amount}`). The total `amt` must equal the link amount
   * — advisory warn by default, `PayWayConfigError` under `strictValidation`.
   */
  payout?: string | { acc: string; amt: number }[];
  /** Optional image shown with the link (multipart upload; not hashed). */
  image?: PaymentLinkImage;
}

export interface PayoutParams {
  transactionId: string;
  amount: number;
  beneficiaries: { account: string; amount: number }[];
  currency: Currency;
  customFields?: string | Record<string, unknown>;
}

export interface UpdateBeneficiaryStatusParams {
  payee: string;
  status: 0 | 1;
}

export interface AddBeneficiaryParams {
  payee: string;
}

export interface GetTransactionListParams {
  fromDate?: string | null;
  toDate?: string | null;
  fromAmount?: number | string | null;
  toAmount?: number | string | null;
  status?: string | null;
  page?: string;
  pagination?: string;
  requestTime?: string;
}

/**
 * Effective HMAC hash order when a requestWithMerchantAuth caller passes no
 * `hmacFields` override — the composition actually signed for refund,
 * payment-link create/details (and any other merchant-auth call that omits
 * the override). Hoisted to a named constant (audit D3) so the
 * HASH_ORDER_HINTS drift-guard test can pin the hints against the real
 * default instead of a copy of it.
 */
export const MERCHANT_AUTH_DEFAULT_HASH_FIELDS: readonly string[] = ['request_time', 'merchant_id', 'merchant_auth'];

/**
 * Partner-auth hash order for the online-self-activation endpoints
 * (openapi-suite-coverage W3, spec-derived). Hoisted (audit D3) so the
 * HASH_ORDER_HINTS drift-guard pins the hint against the real order.
 */
export const SELF_ACTIVATION_HASH_FIELDS: readonly string[] = ['partner_id', 'request_data', 'request_time'];

/**
 * Live-documented HMAC field orders per endpoint, sandbox-verified 2026-08-31.
 * Surfaced inside PayWaySignatureError hints
 * so a wrong-hash rejection (`1`/`01`/`PTL02`) points directly at the
 * composition to fix instead of a bare "Wrong Hash".
 *
 * Values are pure dot-joined field lists — no prose, no parentheticals, no
 * spaces (a hint containing a space breaks the dot-joined contract and the
 * drift-guard test rejects it). Endpoint-specific quirks live here in the
 * comments instead:
 * - purchase: the live 27-field order (`ctid` signed after `items` per
 *   the 2026-09-05 sandbox verification — the live docs' subscription page omits it; plus the
 *   subscription `token_flag` + `frequency` positions after
 *   `skip_success_page`). Pinned to the exported
 *   `PURCHASE_HASH_FIELDS` constant by the drift-guard test.
 * - linkCard: `amount` is a hash position with NO corresponding body field —
 *   it hashes as '' (live-doc quirk). `frequency` IS sent as a body field when
 *   provided and hashes its value; omitting it hashes ''. Pinned to
 *   the exported `LINK_CARD_HMAC_FIELDS`.
 * - payment (CoF charge): live 19-field order; `request_id` is NOT part of it
 *   (deprecated field, never sent).
 * - getTransactionList: the live list-2 shape is the 9-field
 *   from/to/status/page/pagination composition (NOT the check/detail trio).
 * - refund / createPaymentLink / getPaymentLinkDetails: these domains pass no
 *   `hmacFields` override to requestWithMerchantAuth, so the EFFECTIVE order
 *   is `MERCHANT_AUTH_DEFAULT_HASH_FIELDS` above.
 * - payout: the only hex-encoded hash in the SDK (every other endpoint is
 *   base64).
 * - generateQr: pinned to the exported `GENERATE_QR_HASH_FIELDS`.
 *
 * Drift guard: `src/__tests__/hash-order-hints.test.ts` pins every hint
 * against the hmacFields the corresponding domain actually passes (exported
 * constants directly, inline lists via request spies) and snapshots the key
 * set — adding an endpoint with a hash list but no hint entry, or letting a
 * hint drift from its domain's real order, fails that test. The object is
 * exported for those tests only; it is NOT re-exported from src/index.ts
 * (public API surface is pinned by public-api.test.ts).
 */
export const HASH_ORDER_HINTS: Record<string, string> = {
  [ENDPOINTS.purchase]: PURCHASE_HASH_FIELDS.join('.'),
  [ENDPOINTS.checkTransaction]: 'req_time.merchant_id.tran_id',
  [ENDPOINTS.closeTransaction]: 'req_time.merchant_id.tran_id',
  [ENDPOINTS.getTransactionDetail]: 'req_time.merchant_id.tran_id',
  [ENDPOINTS.getTransactionList]: 'req_time.merchant_id.from_date.to_date.from_amount.to_amount.status.page.pagination',
  [ENDPOINTS.getTransactionsByMerchantRef]: 'req_time.merchant_id.merchant_ref',
  [ENDPOINTS.getExchangeRate]: 'req_time.merchant_id',
  [ENDPOINTS.refund]: MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'),
  [ENDPOINTS.linkAccount]: 'merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency',
  // linkCard: `amount` has no body field (hashes ''); `frequency` hashes its
  // supplied value, or '' when omitted (the drift-guard test pins this against
  // LINK_CARD_HMAC_FIELDS).
  [ENDPOINTS.linkCard]: LINK_CARD_HMAC_FIELDS.join('.'),
  [ENDPOINTS.payment]:
    'request_time.merchant_id.tran_id.amount.currency.items.ctid.pwt.first_name.last_name.email.phone.purchase_type.callback_url.custom_fields.return_params.payout.token_flag.shipping_fee',
  [ENDPOINTS.renewToken]: 'ctid.request_time.pwt.merchant_id.request_id',
  [ENDPOINTS.getTokenDetails]: 'merchant_id.request_time.request_id',
  [ENDPOINTS.removeToken]: 'merchant_id.ctid.request_time.pwt',
  [ENDPOINTS.generateQr]: GENERATE_QR_HASH_FIELDS.join('.'),
  // Soundbox QR: spec-derived order (openapi-suite-coverage W2) — the spec's
  // own b4hash string is corrupted, so this is the filtered real-field order.
  [ENDPOINTS.requestQr]: REQUEST_QR_HASH_FIELDS.join('.'),
  // Partner-auth endpoints: order is fixed; the ALGORITHM varies per endpoint
  // (SHA256, except get-mc-credential-info's SHA512) — see the domain.
  [ENDPOINTS.registerNewMerchant]: SELF_ACTIVATION_HASH_FIELDS.join('.'),
  [ENDPOINTS.getMerchantCredentialInfo]: SELF_ACTIVATION_HASH_FIELDS.join('.'),
  [ENDPOINTS.getMerchantInfo]: SELF_ACTIVATION_HASH_FIELDS.join('.'),
  // Refund/payment-link paths pass no hmacFields override → the effective
  // order is MERCHANT_AUTH_DEFAULT_HASH_FIELDS (request_time.merchant_id.merchant_auth).
  [ENDPOINTS.createPaymentLink]: MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'),
  [ENDPOINTS.getPaymentLinkDetails]: MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'),
  [ENDPOINTS.voidPaymentLink]: MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'),
  [ENDPOINTS.completePreAuth]: 'merchant_auth.request_time.merchant_id',
  [ENDPOINTS.cancelPreAuth]: 'merchant_id.merchant_auth.request_time',
  // Payout: hex-encoded hash (unique among endpoints); beneficiaries are RSA-encrypted.
  [ENDPOINTS.payout]: 'merchant_id.tran_id.beneficiaries.amount.custom_fields.currency',
  [ENDPOINTS.addBeneficiary]: 'request_time.merchant_auth',
  [ENDPOINTS.updateBeneficiaryStatus]: 'request_time.merchant_auth',
};

/**
 * Codes the gateway uses for hash/signature rejections (sandbox-verified,
 * sandbox verification dated 2026-08-31: `01` on wrong CoF compositions, `PTL02` on refunds,
 * flat `1`/`01` on legacy paths).
 */
const SIGNATURE_ERROR_CODES = new Set(['1', '01']);

/** Advisory hints appended to business errors for codes observed live (§16). */
const CODE_HINTS: Record<string, string> = {
  '98': 'Merchant ID not found — verify the merchant credential (env/profile) for the target environment.',
  '104': 'Token flag/ctid rejected — check that the account token exists and the token_flag matches the operation (linking: CITI_FLEX|CITO_FLEX|CITO_FIX|CITR_FLEX; charging: CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX). For purchase-path subscriptions (CITR_FIX) it means the merchant profile is NOT enabled for subscription/token registration; ask ABA to enable it.',
  '105': 'Account token invalid or expired — re-link via linkAccount/linkCard, or renew via renewToken.',
  '09': 'Token not found — the ctid/request_id does not reference a known account token.',
};

/**
 * B5 (live parity): classify a non-success `status.code` / flat `code` into
 * the typed error hierarchy — signature rejections become PayWaySignatureError
 * (with the endpoint hash-order hint), `04` + `errors{}` becomes a business
 * error carrying `fieldErrors`, and known COF/QR codes get advisory hints.
 * Returns the error to throw, or undefined when the code has no special
 * classification (caller falls back to its generic error).
 */
function classifyBusinessCode(
  code: string,
  message: string,
  rawBody: unknown,
  endpoint?: string,
  statusCode = 200,
  errorsMap?: unknown,
): PayWayAPIError | undefined {
  // FU-10 (2026-10-03): the documented business-level rate-limit surface is
  // `status.code = 429` inside an HTTP-200 JSON body ("Too many request,
  // please try again in 1min."). Classify it exactly like the transport
  // surface so callers matching on PayWayRateLimitError and the retry
  // engine's pacing (paywayCode 429) treat both shapes identically.
  if (code === '429') {
    return new PayWayRateLimitError(message, {
      statusCode,
      paywayCode: code,
      rawBody,
      endpoint,
      retryable: true,
    });
  }

  if (SIGNATURE_ERROR_CODES.has(code) || code === 'PTL02') {
    const hashHint = endpoint ? HASH_ORDER_HINTS[endpoint] : undefined;
    const hint = hashHint
      ? ` HMAC field order for this endpoint: ${hashHint}.`
      : ' Check the HMAC field order against the live docs for this endpoint.';
    return new PayWaySignatureError(`${message}.${hint}`, {
      statusCode,
      paywayCode: code,
      rawBody,
      endpoint,
      retryable: false,
    });
  }

  const fieldErrors =
    errorsMap && typeof errorsMap === 'object' && !Array.isArray(errorsMap)
      ? Object.fromEntries(
          Object.entries(errorsMap as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
      : undefined;

  const advisoryHint = CODE_HINTS[code] ? ` Hint: ${CODE_HINTS[code]}` : '';
  const fieldHint = fieldErrors
    ? ` Field errors: ${Object.entries(fieldErrors)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')}.`
    : '';

  if (fieldErrors || fieldHint || advisoryHint) {
    return new PayWayBusinessError(`${message}${fieldHint}${advisoryHint}`, {
      statusCode,
      paywayCode: code,
      rawBody,
      endpoint,
      retryable: false,
      fieldErrors,
    });
  }

  return undefined;
}

function checkResponseError(body: unknown, endpoint?: string): void {
  if (!body || typeof body !== 'object') {
    return;
  }

  const resp = body as Record<string, unknown>;

  if (resp.status && typeof resp.status === 'object') {
    const statusObj = resp.status as Record<string, unknown>;
    // Codes are trimmed before comparison so padded success codes ("0 ")
    // aren't misreported as failures (EC-09).
    const code = String(statusObj.code ?? '').trim();
    const message = String(statusObj.message ?? 'Unknown PayWay API Error');
    if (code !== '0' && code !== '00' && code !== '') {
      const classified = classifyBusinessCode(code, message, body, endpoint, 200, statusObj.errors);
      throw (
        classified ??
        new PayWayBusinessError(message, {
          statusCode: 200,
          paywayCode: code,
          rawBody: body,
          endpoint,
          retryable: false,
        })
      );
    }
  }

  if (typeof resp.status === 'string') {
    const statusStr = resp.status.toUpperCase();
    if (statusStr === 'FAILED' || statusStr === 'ERROR') {
      const code = resp.code !== undefined ? String(resp.code) : undefined;
      const message = String(resp.message ?? 'Unknown PayWay API Error');
      throw new PayWayBusinessError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
        retryable: false,
      });
    }
  }

  // Legacy (non -2) endpoints answer with a flat numeric status, e.g.
  // {"status": 6, "description": "tran_id not found"}. Non-zero is a
  // business error carrying the code; 0 falls through (no code field in
  // that shape, so it resolves as success).
  if (typeof resp.status === 'number' && resp.status !== 0) {
    const message = String(resp.description ?? resp.message ?? 'Unknown PayWay API Error');
    if (resp.status === 429) {
      // Legacy flat envelope carrying the rate-limit code — same typed
      // classification as the other two 429 surfaces (FU-10).
      throw new PayWayRateLimitError(message, {
        statusCode: 200,
        paywayCode: '429',
        rawBody: body,
        endpoint,
        retryable: true,
      });
    }
    throw new PayWayBusinessError(message, {
      statusCode: 200,
      paywayCode: String(resp.status),
      rawBody: body,
      endpoint,
      retryable: false,
    });
  }

  if (resp.code !== undefined && resp.code !== null && typeof resp.code !== 'object') {
    const code = String(resp.code).trim();
    const message = String(resp.message ?? 'Unknown PayWay API Error');
    if (code !== '0' && code !== '00') {
      if (code === '429') {
        // A 200-wrapped flat code "429" is a rate-limit response in a
        // non-standard envelope. The retry engine already paces these by
        // paywayCode; throw the typed error so callers matching on
        // PayWayRateLimitError catch it too.
        throw new PayWayRateLimitError(message, {
          statusCode: 200,
          paywayCode: code,
          rawBody: body,
          endpoint,
          retryable: true,
        });
      }
      const classified = classifyBusinessCode(code, message, body, endpoint, 200, resp.errors);
      throw (
        classified ??
        new PayWayBusinessError(message, {
          statusCode: 200,
          paywayCode: code,
          rawBody: body,
          endpoint,
          retryable: false,
        })
      );
    }
  }
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: string; code?: string };
  return e.name === 'AbortError' || e.code === 'ABORT_ERR';
}

/**
 * Decode the hosted `/add-card/<base64 JSON>` redirect target (SANDBOX-FINDINGS
 * §24 LC-2, live-verified 2026-09-12): the link-card POST answers 302 whose
 * Location carries the hosted page's real result — error or handoff — as
 * base64 JSON. Node fetch follows the redirect silently and keeps only the
 * static shell, so this is derived from the post-redirect `response.url`.
 * Returns undefined when the URL is not an `/add-card/` target.
 */
function decodeHostedPageOutcome(url: string | undefined): HostedPageOutcome | undefined {
  if (!url) return undefined;
  const marker = '/add-card/';
  const idx = url.indexOf(marker);
  if (idx < 0) return undefined;
  const encoded = url.slice(idx + marker.length).split(/[?#]/)[0] ?? '';
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    // Undecodable payload — still report the URL; the shell carries no marker.
  }
  const status = payload.status as Record<string, unknown> | undefined;
  const code = typeof status?.code === 'string' || typeof status?.code === 'number' ? String(status.code) : undefined;
  const message = typeof status?.message === 'string' ? status.message : undefined;
  return { url, payload, code, message };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    // undefined = "no body at all"; a literal JSON `null` body still parses
    // to null so the two stay distinguishable downstream (EC-07).
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createHttpError(
  response: Response,
  rawBody: unknown,
  endpoint?: string,
  rateLimitInfo?: RateLimitInfo,
): PayWayAPIError {
  const message = `HTTP Error: ${response.status} ${response.statusText}`;

  // Extract PayWay-specific error details from the response body.
  // PayWay often wraps business errors in non-200 HTTP responses (e.g. HTTP 400
  // with PTL04 for refund validation, HTTP 403 with PTL36 for permission errors).
  // Without this extraction, the paywayCode and description are buried in rawBody.
  // Sandbox-verified (2026-08-25): the strict rate-limit response arrives as
  // HTTP 403 with a NUMERIC status.code 429 ("Rate limit exceeded...") and no
  // rate-limit headers — numeric codes must be extracted too, otherwise
  // rate limiting is misreported as a generic api_error.
  let extractedCode: string | undefined;
  let extractedMessage: string | undefined;
  if (rawBody && typeof rawBody === 'object') {
    const body = rawBody as Record<string, unknown>;
    const status = body.status as Record<string, unknown> | undefined;
    const rawCode = status?.code;
    const trimmedCode = rawCode === undefined || rawCode === null ? '' : String(rawCode).trim();
    const isNonZero = trimmedCode !== '0' && trimmedCode !== '00' && trimmedCode !== '';
    if (status && (typeof rawCode === 'string' || typeof rawCode === 'number') && isNonZero) {
      extractedCode = trimmedCode;
      extractedMessage = typeof status.message === 'string' ? status.message : undefined;
    }
    if (extractedCode === undefined) {
      // Legacy/flat error envelopes put the code at the top level instead of
      // nesting it under status, e.g. the legacy transaction-list 403 shape
      // {"code": "49", "message": "Invalid Start Date"}.
      const flatCode = body.code;
      const flatTrimmed = flatCode === undefined || flatCode === null || typeof flatCode === 'object'
        ? ''
        : String(flatCode).trim();
      const flatIsNonZero = flatTrimmed !== '0' && flatTrimmed !== '00' && flatTrimmed !== '';
      if (flatIsNonZero) {
        extractedCode = flatTrimmed;
        extractedMessage = typeof body.message === 'string' ? body.message : undefined;
      }
    }
  }

  // B5 (live parity): apply the COF/QR code classification to non-OK
  // responses too — e.g. a 403 PTL02 refund rejection or a 400 "04" +
  // errors{} binding failure get their typed errors/hints here.
  if (extractedCode !== undefined) {
    const classified = classifyBusinessCode(
      extractedCode,
      extractedMessage ?? message,
      rawBody,
      endpoint,
      response.status,
      typeof rawBody === 'object' && rawBody !== null
        ? ((rawBody as Record<string, unknown>).errors ??
          ((rawBody as Record<string, unknown>).status as Record<string, unknown> | undefined)?.errors)
        : undefined,
    );
    if (classified) {
      if (classified instanceof PayWaySignatureError) {
        return new PayWaySignatureError(classified.message, {
          statusCode: response.status,
          paywayCode: classified.paywayCode,
          rawBody,
          endpoint,
          retryable: false,
        });
      }
      return classified;
    }
  }

  if (response.status === 429 || extractedCode === '429') {
    return new PayWayRateLimitError(extractedMessage ?? message, {
      statusCode: response.status,
      paywayCode: extractedCode,
      rawBody,
      endpoint,
      rateLimitInfo: rateLimitInfo as Record<string, unknown>,
      retryable: true,
    });
  }

  return new PayWayAPIError(extractedMessage ? `${message}: ${extractedMessage}` : message, {
    statusCode: response.status,
    paywayCode: extractedCode,
    rawBody,
    endpoint,
    retryable: response.status >= 500,
  });
}

function createJsonParseError(rawBody: string, endpoint?: string, contentType?: string): PayWayAPIError {
  const snippet = rawBody.trim().slice(0, 120).replace(/\s+/g, ' ');
  let hint = '';
  if (/<!doctype html|<html/i.test(rawBody)) {
    hint =
      ' PayWay returned an HTML page instead of JSON. This usually means a parameter value was rejected ' +
      '(e.g. an unsupported payment_gate) or the session expired. Try removing optional parameters.';
  }
  return new PayWayAPIError(
    `Invalid JSON response from PayWay API${contentType ? ` (content-type: ${contentType})` : ''}${hint ? `.${hint}` : ''} Body starts with: ${snippet}`,
    {
      rawBody,
      endpoint,
      retryable: false,
    },
  );
}

/**
 * TLS certificate-verification error codes raised by Node's TLS layer
 * (surfaced as the `cause` of undici's `fetch failed`). Matching on code
 * first keeps the classification precise; the message pattern is the
 * fallback for cross-version wording.
 */
const TLS_CERT_ERROR_CODE = /^(UNABLE_TO_|SELF_SIGNED_|DEPTH_ZERO_SELF_SIGNED|CERT_|ERR_TLS_|ERR_SSL_)/;
const TLS_CERT_ERROR_MESSAGE =
  /(self-signed|unable to verify the first certificate|unable to get (local )?issuer certificate|certificate (has expired|is not yet valid|verify failed|unknown)|certificate verify failed|altname mismatch|does not match certificate's altnames|ssl routines|sslv3 alert)/i;

/**
 * Walk an error's `cause` chain looking for a TLS certificate-verification
 * failure. `fetch failed` (undici) wraps the real TLS error one or two levels
 * deep, so the raw message alone is useless to integrators.
 *
 * Exported for tests only — NOT part of the package surface (index.ts
 * re-exports a fixed name list from this module).
 */
export function findTlsCertificateFailure(error: unknown): { code?: string; message: string } | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    const code = typeof candidate.code === 'string' ? candidate.code : undefined;
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    if (
      (code !== undefined && TLS_CERT_ERROR_CODE.test(code)) ||
      TLS_CERT_ERROR_MESSAGE.test(message)
    ) {
      return { code, message: message || code || 'TLS certificate verification failed' };
    }
    current = candidate.cause;
  }
  return undefined;
}

function createNetworkError(error: unknown, timeoutMs: number, endpoint?: string): PayWayAPIError {
  if (isAbortError(error)) {
    return new PayWayNetworkError(`Request timed out after ${timeoutMs}ms`, {
      rawBody: error,
      endpoint,
      retryable: true,
    });
  }

  const message =
    error !== null && typeof error === 'object'
      ? String((error as { message?: unknown }).message ?? 'Unknown network failure')
      : 'Unknown network failure';
  // DX-SEC-001 (P0-04): a TLS certificate failure is a CONFIGURATION problem,
  // not a transient network fault — name the safe fix (CA bundle) instead of
  // leaking a bare "fetch failed", and never retry it.
  const tlsFailure = findTlsCertificateFailure(error);
  if (tlsFailure) {
    const tlsError = new PayWayNetworkError(
      `TLS certificate verification failed: ${tlsFailure.message}` +
        `${tlsFailure.code ? ` (code ${tlsFailure.code})` : ''}. ` +
        'Provide the gateway\u2019s CA chain via the `tlsCaFile` config option or the PAYWAY_TLS_CA_FILE environment ' +
        'variable: extract the presented chain with ' +
        '`openssl s_client -showcerts -connect <host>:443 -servername <host>` (save every certificate, leaf first) ' +
        'and point the option at the bundle file. Do NOT disable certificate verification with NODE_TLS_REJECT_UNAUTHORIZED=0.',
      { rawBody: error, endpoint, retryable: false },
    );
    // PayWayNetworkError hard-codes retryable:true (network errors default to
    // retryable); a certificate failure is deterministic — flip it off so the
    // retry engine does not burn 3 attempts + backoff on a config error.
    (tlsError as { retryable?: boolean }).retryable = false;
    return tlsError;
  }
  return new PayWayNetworkError(`Network error: ${message}`, {
    rawBody: error,
    endpoint,
    retryable: true,
  });
}

function parseHeaderNumber(headers: Headers, names: string[]): number | undefined {
  for (const name of names) {
    const value = headers.get(name);
    if (!value) continue;
    const normalized = value.trim();
    const intVal = Number(normalized);
    if (!Number.isNaN(intVal)) {
      return intVal;
    }

    const date = Date.parse(normalized);
    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }
  }
  return undefined;
}

/**
 * Retry-After is defined by RFC 7231 as delta-SECONDS or an HTTP-date.
 * Parsed separately from the generic numeric headers so the seconds → ms
 * conversion is never applied to rate-limit limit/remaining/reset values.
 */
function parseRetryAfterMs(headers: Headers): number | undefined {
  for (const name of ['retry-after', 'x-retry-after']) {
    const value = headers.get(name);
    if (!value) continue;
    const normalized = value.trim();
    const seconds = Number(normalized);
    if (!Number.isNaN(seconds)) {
      return Math.max(0, seconds * 1000);
    }
    const date = Date.parse(normalized);
    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }
  }
  return undefined;
}

function parseRateLimitInfo(headers: Headers): RateLimitInfo | undefined {
  if (!headers) {
    return undefined;
  }

  const limit = parseHeaderNumber(headers, ['x-rate-limit-limit', 'ratelimit-limit', 'rate-limit-limit']);
  const remaining = parseHeaderNumber(headers, [
    'x-rate-limit-remaining',
    'ratelimit-remaining',
    'rate-limit-remaining',
  ]);
  const reset = parseHeaderNumber(headers, ['x-rate-limit-reset', 'ratelimit-reset', 'rate-limit-reset']);
  const retryAfterMs = parseRetryAfterMs(headers);

  if (limit === undefined && remaining === undefined && reset === undefined && retryAfterMs === undefined) {
    return undefined;
  }

  const rawHeaders: Record<string, string> = {};
  for (const key of [
    'x-rate-limit-limit',
    'x-rate-limit-remaining',
    'x-rate-limit-reset',
    'retry-after',
    'x-retry-after',
  ]) {
    const value = headers.get(key);
    if (value !== null) {
      rawHeaders[key] = value;
    }
  }

  return {
    limit,
    remaining,
    reset,
    retryAfterMs,
    rawHeaders,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TD-07: AWS-style full jitter — wait a uniformly random duration between 0
 * and the computed exponential delay, preventing synchronized retry storms
 * across fleet instances. `'none'` (default) keeps deterministic delays.
 */
function applyBackoffJitter(computedDelayMs: number, mode: 'full' | 'none'): number {
  return mode === 'full' ? Math.floor(Math.random() * computedDelayMs) : computedDelayMs;
}

function parseDebugRequestBody(bodyPayload: string): unknown {
  try {
    return JSON.parse(bodyPayload) as unknown;
  } catch {
    if (bodyPayload.includes('=')) {
      return Object.fromEntries(new URLSearchParams(bodyPayload));
    }
    return bodyPayload.slice(0, 200);
  }
}

/**
 * One-line summary of a multipart body for debug logs / the `onRequest` hook
 * (whose string signature stays unchanged): part names only — never bytes.
 */
function describeMultipartBody(form: FormData): string {
  const parts: string[] = [];
  for (const [name, value] of form.entries()) {
    parts.push(typeof value === 'string' ? name : `${name} (file: ${value.name}, ${value.size} bytes)`);
  }
  return `<multipart: ${parts.join(', ')}>`;
}

function describeBodyForHook(bodyPayload: string | FormData): string {
  return typeof bodyPayload === 'string' ? bodyPayload : describeMultipartBody(bodyPayload);
}

/**
 * Redacted view of a string wire body for the `onRequest` hook (M8): parsed
 * and sanitized exactly like the debug console line, then re-serialized in
 * the wire's own format so the `bodyPayload: string` contract keeps its
 * shape (JSON in → JSON out, urlencoded in → urlencoded out). Opaque text
 * degrades to the same 200-char preview the debug path shows.
 */
function redactHookBodyPayload(bodyPayload: string): string {
  const looksLikeJson = bodyPayload.trimStart().startsWith('{') || bodyPayload.trimStart().startsWith('[');
  if (!looksLikeJson && bodyPayload.includes('=')) {
    // Urlencoded wire body (merchant-auth endpoints default to it) —
    // re-encoding preserves the format hook consumers parse.
    const sanitized = sanitizeForLog(parseDebugRequestBody(bodyPayload)) as Record<string, unknown>;
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(sanitized)) {
      form.append(key, String(value));
    }
    return form.toString();
  }
  const sanitized = sanitizeForLog(parseDebugRequestBody(bodyPayload));
  return typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
}

/**
 * Pull the gateway correlation id out of a response envelope
 * (`status.trace` per OpenAPI types.ts, with a bare `trace` fallback).
 */
function extractTraceId(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const resp = body as Record<string, unknown>;
  const status = resp.status;
  if (status && typeof status === 'object' && (status as Record<string, unknown>).trace !== undefined) {
    return (status as Record<string, unknown>).trace;
  }
  return resp.trace;
}

// --- Journal event helpers (error fields are size-capped and never throw) ---

function cappedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…[capped]` : message;
}

/** Return the value as an http(s) base URL, or undefined when it isn't one. */
function parseHttpBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** TLS protocol versions accepted for `tlsMinVersion` (audit P0-04: default floor TLS 1.2). */
const TLS_MIN_VERSIONS = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'] as const;
type TlsMinVersion = (typeof TLS_MIN_VERSIONS)[number];

/**
 * DX-SEC-001 (P0-04): load and sanity-check a PEM CA bundle for `tlsCaFile`.
 * Synchronous by design — it runs in `resolveConfig` so a missing or garbage
 * file fails AT CONSTRUCTION with a `PayWayConfigError` that names the path
 * and the fix, instead of surfacing as an opaque network error mid-request.
 */
export function loadTlsCaBundle(path: string): string {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    const code = (error as { code?: string }).code;
    const reason =
      code === 'ENOENT'
        ? 'file not found'
        : code === 'EACCES' || code === 'EPERM'
          ? 'file is not readable (permission denied)'
          : `could not be read (${error instanceof Error ? error.message : String(error)})`;
    throw new PayWayConfigError(
      `TLS CA file "${path}" ${reason}. Extract the gateway's presented chain with ` +
        '`openssl s_client -showcerts -connect <host>:443 -servername <host>` ' +
        '(save every certificate, leaf first), point tlsCaFile / PAYWAY_TLS_CA_FILE at it, or unset the option.',
    );
  }
  if (!contents.includes('-----BEGIN CERTIFICATE-----')) {
    throw new PayWayConfigError(
      `TLS CA file "${path}" does not contain any PEM certificate block ` +
        '(expected at least one -----BEGIN CERTIFICATE----- section). ' +
        'Regenerate the bundle from the presented chain: ' +
        '`openssl s_client -showcerts -connect <host>:443 -servername <host>` (leaf first).',
    );
  }
  return contents;
}

type UndiciModule = typeof import('undici');

/**
 * Lazy undici import (DX-SEC-001): the module (and its Agent) is only loaded
 * when `tlsCaFile` is configured — the default global-fetch path never pays
 * for it. Cached so a client with many requests imports it exactly once.
 */
let undiciModulePromise: Promise<UndiciModule | undefined> | undefined;
async function loadUndici(): Promise<UndiciModule | undefined> {
  undiciModulePromise ??= import('undici').catch(() => undefined);
  return undiciModulePromise;
}

/**
 * Signature-compatible subset of `fetch` used inside `_executeFetch` so the
 * TLS-dispatcher path can swap the transport without touching the retry loop.
 */
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Build the undici-backed fetch for `tlsCaFile` clients: an Agent whose
 * `connect` carries the CA bundle (and the optional minimum TLS version).
 * Returns a fetch that pins every request to that dispatcher.
 */
async function createTlsCaFetch(caFile: string, minVersion?: TlsMinVersion): Promise<FetchLike> {
  const ca = loadTlsCaBundle(caFile);
  const undici = await loadUndici();
  if (!undici) {
    throw new PayWayConfigError(
      `The "undici" package could not be imported, but tlsCaFile is configured ("${caFile}"). ` +
        'Install undici (npm install undici) or remove tlsCaFile / PAYWAY_TLS_CA_FILE.',
    );
  }
  const agent = new undici.Agent({
    connect: {
      ca,
      ...(minVersion ? { minVersion } : {}),
    },
  });
  const undiciFetch = undici.fetch;
  return (url, init) =>
    undiciFetch(url, {
      method: init.method as 'POST' | undefined,
      headers: init.headers as import('undici').RequestInit['headers'],
      body: init.body as import('undici').RequestInit['body'],
      signal: init.signal as AbortSignal | undefined,
      dispatcher: agent,
    }) as unknown as Promise<Response>;
}

/**
 * PayWay SDK client.
 *
 * @example
 * const payway = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
 */
export class PayWay {
  private config: ResolvedPayWayConfig;
  private baseUrl: string;
  private rateLimitRules: Record<string, RateLimitRule>;
  private rateLimitState = new Map<string, { tokens: number; lastRefill: number }>();
  private recentCallsByEndpoint = new Map<string, number[]>();
  private readonly breaker: CircuitBreaker | undefined;
  private readonly journalContext: JournalContext | undefined;
  private lastCid: string | undefined;
  private lastTrace: string | undefined;
  /**
   * DX-SEC-001: undici-backed fetch created when `tlsCaFile` is configured
   * (undefined → plain global fetch, undici never imported). The promise is
   * created in the constructor but awaited on the first request.
   */
  private tlsFetchPromise: Promise<FetchLike> | undefined;

  // --- Sub-Clients ---
  public readonly checkout: CheckoutDomain;
  public readonly credentialsOnFile: CredentialsOnFileDomain;
  public readonly qr: QrDomain;
  public readonly paymentLink: PaymentLinkDomain;
  public readonly preAuth: PreAuthDomain;
  public readonly payout: PayoutDomain;
  public readonly khqr: KhqrDomain;
  public readonly selfActivation: SelfActivationDomain;

  /**
   * Create a new PayWay SDK client instance.
   *
   * @param config - The SDK configuration options.
   * @param config.merchantId - The merchant ID issued by PayWay.
   * @param config.apiKey - The API key/secret issued by PayWay for signing.
   * @param config.publicKeyPem - The 1024-bit RSA public key PEM string for encrypting request payloads.
   * @param config.environment - The target environment ('sandbox' or 'production'). Defaults to 'sandbox'.
   * @param config.timeout - The request timeout in milliseconds. Defaults to 30,000 (30 seconds).
   * @param config.baseUrl - Optional override for the base API URL.
   * @param config.maxRetries - Number of retries on transient failures (429, 5xx, network). Defaults to 3.
   * @param config.retryDelayMs - Base delay in milliseconds between retries (exponential backoff). Defaults to 3000.
   * @throws {PayWayConfigError} If the configuration is missing or invalid.
   */
  constructor(config: Partial<PayWayConfig> = {}) {
    this.config = PayWay.resolveConfig(config);

    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    } else {
      const env = this.config.environment || 'sandbox';
      this.baseUrl = BASE_URLS[env] || BASE_URLS.sandbox;
    }

    const defaultRateLimitRules: Record<string, RateLimitRule> = {
      [ENDPOINTS.checkTransaction]: { limit: 600, intervalMs: 1000 },
      [ENDPOINTS.getTransactionDetail]: { limit: 10, intervalMs: 60_000 },
      [ENDPOINTS.getTransactionList]: { limit: 50, intervalMs: 60_000 },
      [ENDPOINTS.getTransactionsByMerchantRef]: { limit: 10, intervalMs: 60_000 },
      [ENDPOINTS.refund]: { limit: 500, intervalMs: 1000 },
      // KHQR generation: 10 requests/second per Merchant ID — the only explicitly
      // published numeric limit (ABA-bot relay 2026-10-03).
      [ENDPOINTS.generateQr]: { limit: 10, intervalMs: 1000 },
    };

    this.rateLimitRules = {
      ...defaultRateLimitRules,
      ...(this.config.rateLimitRules ?? {}),
    };

    // TD-07: opt-in transport circuit breaker (per-endpoint state).
    this.breaker = this.config.circuitBreaker ? new CircuitBreaker(this.config.circuitBreaker) : undefined;

    // Transaction Journal (audit-results/transaction-data-audit §14): opt-in
    // JSONL record of every API exchange. Undefined unless configured or
    // PAYWAY_JOURNAL is set — the library never writes files silently.
    this.journalContext = createJournalEmitter(this.config.journal, process.env);

    // DX-SEC-001 (P0-04): safe TLS verification — when a CA bundle is
    // configured, requests are routed through an undici Agent that trusts
    // exactly that CA (replacing the NODE_TLS_REJECT_UNAUTHORIZED=0 hack).
    this.tlsFetchPromise = this.config.tlsCaFile
      ? createTlsCaFetch(this.config.tlsCaFile, this.config.tlsMinVersion)
      : undefined;

    // Initialize domain sub-clients
    this.checkout = createCheckoutDomain(
      this.config,
      this.request.bind(this),
      this.requestWithMerchantAuth.bind(this),
      this.baseUrl,
    );
    this.credentialsOnFile = createCredentialsOnFileDomain(this.config, this.request.bind(this), this.baseUrl);
    this.qr = createQrDomain(this.config, this.request.bind(this));
    this.paymentLink = createPaymentLinkDomain(this.config, this.requestWithMerchantAuth.bind(this));
    this.preAuth = createPreAuthDomain(this.config, this.requestWithMerchantAuth.bind(this));
    this.payout = createPayoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.khqr = createKhqrDomain(this.config, this.request.bind(this));
    this.selfActivation = createSelfActivationDomain(this.config, this.requestWithPartnerAuth.bind(this));
  }

  /**
   * Correlation id (cid) of the most recent API exchange. Callers and the
   * agent layer use it to join their own records with the transaction
   * journal (every journal event carries the same cid).
   */
  get lastCorrelationId(): string | undefined {
    return this.lastCid;
  }

  /**
   * Gateway `status.trace` of the most recent successful exchange, when the
   * envelope carried one (improvement I-2: surfaced for stdout↔journal joins).
   */
  get lastTraceId(): string | undefined {
    return this.lastTrace;
  }

  /**
   * Effective base URL of the resolved environment (config override or
   * BASE_URLS[environment]) — lets local-only callers (e.g. the CLI's
   * `cof token-flag-sweep` card leg) POST to a hosted endpoint directly
   * without duplicating the env-resolution logic.
   */
  get apiBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * The client's journal emitter — undefined unless journaling is enabled
   * (config `journal` / `PAYWAY_JOURNAL`). Lets hosts (CLI, agent) emit
   * command-level events into the same journal file as the transport events.
   */
  get journal(): JournalContext | undefined {
    return this.journalContext;
  }

  private static resolveConfig(config: Partial<PayWayConfig> | null): ResolvedPayWayConfig {
    if (config === null) {
      throw new PayWayConfigError('Config object is required');
    }

    const namedEnvironment = process.env.PAYWAY_ENV?.trim();
    const environmentFromEnv =
      namedEnvironment === 'sandbox' || namedEnvironment === 'production'
        ? namedEnvironment
        : process.env.PAYWAY_SANDBOX === 'true'
          ? 'sandbox'
          : process.env.PAYWAY_SANDBOX === 'false'
            ? 'production'
            : undefined;
    // validatePayWayEnv accepts a URL-valued PAYWAY_ENV ("sandbox",
    // "production", or an https URL") — honor it as the base URL so the
    // validator's promise and the client agree. Explicit PAYWAY_BASE_URL
    // and config.baseUrl still win.
    const baseUrlFromEnv = parseHttpBaseUrl(namedEnvironment);
    const timeoutFromEnv = Number.parseInt(process.env.PAYWAY_TIMEOUT ?? '', 10);
    const debugFromEnv = process.env.DEBUG_PAYWAY === 'true' || process.env.DEBUG_PAYWAY === '1';
    const strictFromEnv = process.env.PAYWAY_STRICT_VALIDATION === '1' || process.env.PAYWAY_STRICT_VALIDATION === 'true';
    // DX-SEC-001: safe TLS verification via a locally-provided CA bundle —
    // replaces the NODE_TLS_REJECT_UNAUTHORIZED=0 workaround (P0-04).
    const tlsCaFileFromEnv = process.env.PAYWAY_TLS_CA_FILE?.trim();
    const tlsMinVersionFromEnv = process.env.PAYWAY_TLS_MIN_VERSION?.trim();
    if (tlsMinVersionFromEnv !== undefined && !TLS_MIN_VERSIONS.includes(tlsMinVersionFromEnv as TlsMinVersion)) {
      throw new PayWayConfigError(
        `PAYWAY_TLS_MIN_VERSION must be one of ${TLS_MIN_VERSIONS.join(', ')}, received: ${tlsMinVersionFromEnv}`,
      );
    }
    const resolvedConfig: ResolvedPayWayConfig = {
      ...config,
      merchantId: (config.merchantId ?? process.env.PAYWAY_MERCHANT_ID ?? '').trim(),
      apiKey: (config.apiKey ?? process.env.PAYWAY_API_KEY ?? '').trim(),
      publicKeyPem: normalizePem(config.publicKeyPem ?? process.env.PAYWAY_RSA_PUBLIC_KEY),
      partnerId: config.partnerId ?? process.env.PAYWAY_PARTNER_ID,
      partnerApiKey: config.partnerApiKey ?? process.env.PAYWAY_PARTNER_API_KEY,
      environment: config.environment ?? environmentFromEnv,
      baseUrl: config.baseUrl ?? process.env.PAYWAY_BASE_URL ?? baseUrlFromEnv,
      timeout: config.timeout ?? (Number.isNaN(timeoutFromEnv) ? undefined : timeoutFromEnv),
      debug: config.debug ?? debugFromEnv,
      strictValidation: config.strictValidation ?? strictFromEnv,
      tlsCaFile: config.tlsCaFile ?? (tlsCaFileFromEnv || undefined),
      tlsMinVersion: config.tlsMinVersion ?? (tlsMinVersionFromEnv as TlsMinVersion | undefined),
      khqr: resolveKhqrConfiguration(config.khqr),
    };

    // S06 (publishing-DX audit): partner credentials (online-self-activation)
    // are a complete credential class for construction — the partner request
    // path authenticates with partnerId/partnerApiKey and injects NO merchant
    // fields. Merchant credentials are enforced where they are consumed
    // ({@link PayWay.request} / {@link PayWay.requestWithMerchantAuth}), so a
    // partner-only configuration can construct and reach partner endpoints
    // while merchant calls still fail clearly before anything is signed.
    const hasMerchantCredentials = Boolean(resolvedConfig.merchantId && resolvedConfig.apiKey);
    if (!hasMerchantCredentials && !resolvedConfig.partnerId) {
      if (!resolvedConfig.merchantId) {
        throw new PayWayConfigError('merchantId is required');
      }
      throw new PayWayConfigError('apiKey is required');
    }
    if (
      resolvedConfig.timeout !== undefined &&
      (!Number.isFinite(resolvedConfig.timeout) || resolvedConfig.timeout <= 0)
    ) {
      throw new PayWayConfigError(
        `timeout must be a positive number of milliseconds, received: ${resolvedConfig.timeout}`,
      );
    }
    // S07 (publishing-DX audit): an invalid retry configuration used to reach
    // the execution loop and surface as a misleading "Retry limit exceeded"
    // transport error with zero fetch attempts. Reject it at the boundary.
    if (
      resolvedConfig.maxRetries !== undefined &&
      (!Number.isInteger(resolvedConfig.maxRetries) || resolvedConfig.maxRetries < 0)
    ) {
      throw new PayWayConfigError(
        `maxRetries must be a non-negative integer, received: ${resolvedConfig.maxRetries}`,
      );
    }
    if (
      resolvedConfig.retryDelayMs !== undefined &&
      (!Number.isFinite(resolvedConfig.retryDelayMs) || resolvedConfig.retryDelayMs < 0)
    ) {
      throw new PayWayConfigError(
        `retryDelayMs must be a non-negative number of milliseconds, received: ${resolvedConfig.retryDelayMs}`,
      );
    }
    // DX-SEC-001: validate the TLS CA bundle at the boundary — a bad path
    // must fail at construction, not as an opaque network error on the first
    // request. (tlsMinVersion is validated above, before config assembly.)
    if (resolvedConfig.tlsCaFile !== undefined) {
      // Discard the contents — loadTlsCaBundle is called here for validation
      // only; the dispatcher re-reads (and re-validates) the file lazily.
      loadTlsCaBundle(resolvedConfig.tlsCaFile);
    }
    if (!resolvedConfig.debug) {
      return resolvedConfig;
    }

    // TD-08: route legacy diagnostics through the structured logger. In text
    // format at debug level this produces byte-identical output to the old
    // console.debug call sites; JSON format upgrades them to single lines.
    const paywayLogger = createPayWayLogger({
      level: resolveLogLevel(resolvedConfig.logLevel, true),
      format: resolvedConfig.logFormat,
    });
    const onRequest = resolvedConfig.onRequest;
    const onResponse = resolvedConfig.onResponse;
    return {
      ...resolvedConfig,
      // Debug logging (correlation id + duration) is emitted by _executeFetch so
      // each request gets a stable cid and an accurate timing measurement.
      onRequest: (endpoint, bodyPayload, meta) => {
        onRequest?.(endpoint, bodyPayload, meta);
      },
      onResponse: (endpoint, statusCode, body, rateLimitInfo, meta) => {
        const traceId = extractTraceId(body);
        if (traceId !== undefined) {
          // TD-08: PayWay envelopes carry `status.trace` / `trace`; surface it
          // so merchants can correlate SDK diagnostics with gateway support.
          paywayLogger.info(`[payway] trace_id=${String(traceId)} endpoint=${endpoint}`);
        }
        onResponse?.(endpoint, statusCode, body, rateLimitInfo, meta);
      },
    };
  }

  private _getRateLimitRule(endpoint: string): RateLimitRule | undefined {
    if (this.config.rateLimitThrottling === false) {
      return undefined;
    }
    return this.rateLimitRules[endpoint];
  }

  private _refillRateLimitState(rule: RateLimitRule, state: { tokens: number; lastRefill: number }): void {
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    if (elapsed <= 0) {
      return;
    }

    const refillRate = rule.limit / rule.intervalMs;
    const tokensToAdd = Math.floor(elapsed * refillRate);
    if (tokensToAdd > 0) {
      state.tokens = Math.min(rule.limit, state.tokens + tokensToAdd);
      state.lastRefill = now;
    }
  }

  /**
   * Track real request timestamps per endpoint so that when the gateway
   * rejects with its undocumented rate-limit response, the retry delay can be
   * derived from our own observed window instead of a blind backoff.
   */
  private _recordRecentCall(endpoint: string): void {
    const rule = this.rateLimitRules[endpoint];
    if (!rule) return;
    const now = Date.now();
    const list = (this.recentCallsByEndpoint.get(endpoint) ?? []).filter(
      (ts) => now - ts < rule.intervalMs,
    );
    list.push(now);
    this.recentCallsByEndpoint.set(endpoint, list);
  }

  /** Milliseconds until the locally-observed window frees a slot, or undefined when under the cap. */
  private _windowRemainingMs(endpoint: string): number | undefined {
    const rule = this.rateLimitRules[endpoint];
    if (!rule) return undefined;
    const now = Date.now();
    const list = (this.recentCallsByEndpoint.get(endpoint) ?? []).filter(
      (ts) => now - ts < rule.intervalMs,
    );
    if (list.length < rule.limit) return undefined;
    return Math.max(0, rule.intervalMs - (now - list[0]));
  }

  private async _acquireRateLimitToken(endpoint: string): Promise<void> {
    const rule = this._getRateLimitRule(endpoint);
    if (!rule) {
      return;
    }

    let state = this.rateLimitState.get(endpoint);
    if (!state) {
      state = { tokens: rule.limit, lastRefill: Date.now() };
      this.rateLimitState.set(endpoint, state);
    }

    this._refillRateLimitState(rule, state);
    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.rateLimitState.set(endpoint, state);
      return;
    }

    const refillRate = rule.limit / rule.intervalMs;
    const waitMs = Math.ceil((1 - state.tokens) / refillRate);
    try {
      this.config.onThrottle?.({ endpoint, waitMs });
    } catch {
      // Logging hooks must never fail SDK execution.
    }
    if (this.config.debug) {
      console.debug(`[payway] local rate-limit: waiting ${waitMs}ms for ${endpoint}`);
    }
    await delay(waitMs);

    this._refillRateLimitState(rule, state);
    state.tokens = Math.max(0, state.tokens - 1);
    this.rateLimitState.set(endpoint, state);
  }

  private async _executeFetch<TResponse>(
    endpoint: string,
    headers: Record<string, string>,
    bodyPayload: string | FormData,
    options?: { retry?: 'transient' | 'none' },
    callOptions?: RequestCallOptions,
  ): Promise<TResponse> {
    const timeoutMs = callOptions?.timeoutMs ?? this.config.timeout ?? 30_000;
    const maxRetries = this.config.maxRetries ?? 3;
    const retryDelayMs = this.config.retryDelayMs ?? 3000;
    const jitter = this.config.backoffJitter ?? 'none';
    // Per-call opt-out for non-idempotent endpoints (purchase): 'none'
    // surfaces network/5xx/429 failures after the first attempt instead of
    // silently re-sending.
    //
    // F01 operation policy: MUTATION endpoints additionally default to
    // single-attempt (a lost response = unknown outcome; duplicate tran_ids
    // are silently accepted by the gateway, so an automatic re-send could
    // double-charge). An explicit per-call 'transient' or the config-level
    // `mutationRetryPolicy: 'transient'` escape hatch restores retries for
    // callers who have verified idempotency themselves. Reads are unaffected.
    const isMutation = MUTATION_ENDPOINTS.has(endpoint);
    const mutationSingleSubmit = isMutation && (this.config.mutationRetryPolicy ?? 'single') === 'single';
    const retriesDisabled = options?.retry === 'none' || (mutationSingleSubmit && options?.retry !== 'transient');
    const url = `${this.baseUrl}${endpoint}`;
    const correlationId = randomBytes(8).toString('hex');
    this.lastCid = correlationId;
    this.lastTrace = undefined;
    const requestStartedAt = Date.now();

    // TD-07: fail fast while the endpoint's circuit is open (half-open probes
    // are admitted one at a time by the breaker itself).
    if (this.breaker) {
      this.breaker.assertAllowed(endpoint);
    }

    await this._acquireRateLimitToken(endpoint);

    // DX-SEC-001: TLS CA-bundle clients go through the undici Agent dispatcher
    // (created once per client); the default path keeps plain global fetch and
    // never imports undici. A malformed bundle surfaces here as a
    // PayWayConfigError BEFORE any request is attempted.
    const doFetch = this.tlsFetchPromise ? await this.tlsFetchPromise : fetch;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      // Per-call abort (DX review 2026-08-30): an external AbortSignal cancels
      // the in-flight fetch; removal prevents leaking listeners across retries.
      const externalSignal = callOptions?.signal;
      const onExternalAbort = () => controller.abort();
      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }
      this._recordRecentCall(endpoint);

      try {
        try {
          if (this.config.debug) {
            const loggedBody =
              typeof bodyPayload === 'string'
                ? sanitizeForLog(parseDebugRequestBody(bodyPayload))
                : sanitizeForLog(describeMultipartBody(bodyPayload));
            console.debug(`[payway] -> POST ${endpoint} (cid=${correlationId})`, loggedBody);
          }
          // M8: this is the single funnel for the user hook (the debug-mode
          // wrapper above delegates straight through), so redaction here
          // covers both the direct and the wrapped path exactly once.
          const hookPayload =
            this.config.redactHookBodies === false
              ? describeBodyForHook(bodyPayload)
              : typeof bodyPayload === 'string'
                ? redactHookBodyPayload(bodyPayload)
                : describeMultipartBody(bodyPayload);
          this.config.onRequest?.(endpoint, hookPayload, { correlationId, attempt });
        } catch {
          // Logging hooks must never fail SDK execution.
        }

        if (this.journalContext) {
          // Journal fires per attempt (retries included) so forensics can
          // distinguish send #1 from send #N — data the hooks don't carry.
          const parsedRequest = parseRequestBodyPayload(bodyPayload);
          this.journalContext.emit({
            kind: 'execution.request',
            correlationId,
            attempt,
            endpoint,
            transactionId: extractTransactionIdFrom(parsedRequest),
            merchantRef: extractMerchantRefFrom(parsedRequest),
            requestDigest: buildRequestDigest(bodyPayload, parsedRequest, this.journalContext.mode),
          });
        }

        const response = await doFetch(url, {
          method: 'POST',
          headers,
          body: bodyPayload,
          signal: controller.signal,
        });

        const rateLimitInfo = parseRateLimitInfo(response.headers);
        const rawParsed = await parseResponseBody(response);
        const isEmptyBody = rawParsed === undefined;
        // `let`: the purchase gate-0 HTML-success branch (W2-2) rewrites the
        // string body into the structured PurchaseHostedHtmlResult object.
        let parsedBody = isEmptyBody ? null : rawParsed;

        if (!response.ok) {
          // HTTP status BEFORE body shape: a 4xx/5xx answered with an
          // HTML/plain-text page (CDN/load-balancer error) must surface as
          // an HTTP error — keeping statusCode and 5xx retryability — not
          // as a client-side JSON-parse failure that bypasses the retry
          // engine.
          throw createHttpError(response, parsedBody, endpoint, rateLimitInfo);
        }

        if (isEmptyBody && response.status !== 204) {
          // 204 No Content is the only status that legitimately carries no
          // body; an empty 2xx body on any other status means a truncated or
          // misbehaving response, which used to resolve as a silent null
          // success (EC-07).
          throw new PayWayAPIError(`Empty response body from PayWay API (HTTP ${response.status})`, {
            statusCode: response.status,
            endpoint,
            retryable: false,
          });
        }

        if (typeof parsedBody === 'string') {
          // B5 (live parity): link-card ALWAYS answers in HTML (success AND
          // error) — surface a structured, actionable error instead of the
          // generic JSON-parse failure. The real link result arrives on the
          // callback_url the merchant supplied with the request.
          if (endpoint === ENDPOINTS.linkCard && /<!doctype html|<html/i.test(parsedBody)) {
            // §24 LC-2 (live 2026-09-12): the hosted result travels in the
            // redirect target `/add-card/<base64 JSON>`; Node fetch followed
            // it silently, so the only surviving trace is response.url —
            // decode it here or the hosted outcome (e.g. profile code 104,
            // wrong-hash 01) is invisible server-side.
            const responseUrl = response.url || undefined;
            const hostedPage = decodeHostedPageOutcome(responseUrl);
            const outcomeSuffix = hostedPage?.code
              ? ` The hosted page reports code ${hostedPage.code}${hostedPage.message ? `: ${hostedPage.message}` : '.'}`
              : '';
            throw new PayWayBusinessError(
              'link-card responded with an HTML page (this endpoint always does — both on success and failure). ' +
                'The link outcome is delivered to the callback_url sent with the request; inspect that webhook ' +
                `payload to confirm the card token.${outcomeSuffix} Raw body starts with: ` +
                parsedBody.trim().slice(0, 120).replace(/\s+/g, ' '),
              {
                statusCode: response.status,
                endpoint,
                rawBody: parsedBody,
                retryable: false,
                responseUrl,
                hostedPage,
              },
            );
          }
          // W2-2 (2026-09-05): a purchase with payment_gate 0 answers HTTP
          // 200 with the hosted "PayWay - Checkout" HTML page as the BODY —
          // the transaction IS created (verified PENDING afterwards). Return
          // a structured hosted-checkout success instead of the misleading
          // "Invalid JSON response" error. (response.ok is guaranteed here:
          // non-2xx already threw as createHttpError above.)
          if (endpoint === ENDPOINTS.purchase && /<!doctype html|<html/i.test(parsedBody)) {
            parsedBody = {
              hosted_checkout: true,
              content_type: response.headers.get('content-type') ?? 'text/html',
              html: parsedBody,
            };
          } else {
            throw createJsonParseError(parsedBody, endpoint, response.headers.get('content-type') ?? undefined);
          }
        }

        // Observability fires before business-error validation so that
        // 200-wrapped failures are visible to onResponse consumers and debug
        // logs too (EC-06: hooks previously skipped business errors).
        const durationMs = Date.now() - requestStartedAt;
        try {
          if (this.config.debug) {
            console.debug(
              `[payway] <- ${response.status} ${endpoint} (${durationMs}ms, cid=${correlationId})`,
              sanitizeForLog(parsedBody),
              rateLimitInfo,
            );
          }
          // M8: sanitizeForLog returns a deep copy, so the error
          // classification and journal digest below still see the raw body.
          this.config.onResponse?.(
            endpoint,
            response.status,
            this.config.redactHookBodies === false ? parsedBody : sanitizeForLog(parsedBody),
            rateLimitInfo,
            {
              correlationId,
              attempt,
              durationMs,
              traceId: toTraceString(extractTraceId(parsedBody)),
            },
          );
        } catch {
          // Logging hooks must never fail SDK execution.
        }

        if (this.journalContext) {
          // Fires for every parsed 2xx — including 200-wrapped business
          // failures (EC-06 semantics), which the integrator hooks also see.
          this.lastTrace = toTraceString(extractTraceId(parsedBody));
          this.journalContext.emit({
            kind: 'execution.response',
            correlationId,
            attempt,
            endpoint,
            httpStatus: response.status,
            durationMs,
            traceId: toTraceString(extractTraceId(parsedBody)),
            transactionId: extractTransactionIdFrom(parsedBody),
            merchantRef: extractMerchantRefFrom(parsedBody),
            responseDigest: buildResponseDigest(parsedBody, this.journalContext.mode),
          });
        }

        // 200-wrapped business failures: the response event above recorded
        // the gateway's answer; the shared catch below emits the paired
        // execution.error (business errors flow through it un-retried).
        checkResponseError(parsedBody, endpoint);

        // TD-07: reaching a parsed response (even a business error) proves the
        // transport and gateway are alive — close/reset the circuit.
        this.breaker?.recordSuccess(endpoint);

        return parsedBody as TResponse;
      } catch (error) {
        clearTimeout(timeoutId);

        const paywayError =
          error instanceof PayWayAPIError
            ? error
            : externalSignal?.aborted
              ? // Caller-requested cancellation is never retried.
                new PayWayNetworkError('Request aborted by caller signal', { endpoint, retryable: false })
              : createNetworkError(error, timeoutMs, endpoint);
        // Stamp the request cid once, here, so every error shape — including
        // classifier-built business errors — carries the journal/hook join key.
        paywayError.correlationId ??= correlationId;

        // Error-path journaling: HTTP errors, empty-body guard, link-card
        // HTML, JSON-parse failures, network/timeout/abort. No integrator
        // hook fires on these paths — the journal is the only witness.
        this.journalContext?.emit({
          kind: 'execution.error',
          correlationId,
          attempt,
          endpoint,
          httpStatus: paywayError.statusCode,
          paywayCode: paywayError.paywayCode,
          durationMs: Date.now() - requestStartedAt,
          error: { code: paywayError.type, message: cappedErrorMessage(paywayError) },
        });
        try {
          // Phase 2 hook enrichment: integrators finally see error attempts
          // (the onResponse hook never fires on thrown paths).
          this.config.onError?.({
            endpoint,
            correlationId,
            attempt,
            statusCode: paywayError.statusCode,
            paywayCode: paywayError.paywayCode,
            message: cappedErrorMessage(paywayError),
            retryable: paywayError.retryable,
          });
        } catch {
          // Logging hooks must never fail SDK execution.
        }

        // TD-07: count network failures and 5xx against the breaker; anything
        // with a sub-500 HTTP status means the gateway responded → success
        // (429 included: the server is demonstrably up).
        if (this.breaker) {
          if (paywayError.statusCode === undefined || paywayError.statusCode >= 500) {
            this.breaker.recordFailure(endpoint);
          } else {
            this.breaker.recordSuccess(endpoint);
          }
        }

        const isRateLimitError = paywayError.statusCode === 429 || paywayError.paywayCode === '429';
        const shouldRetry =
          !retriesDisabled &&
          attempt < maxRetries &&
          (isRateLimitError ||
            (paywayError.statusCode !== undefined && paywayError.statusCode >= 500) ||
            paywayError.retryable);

        if (shouldRetry) {
          const rateLimitInfo = paywayError.rateLimitInfo as Record<string, unknown> | undefined;
          const retryAfterMs = rateLimitInfo?.retryAfterMs;
          let waitMs: number;
          if (isRateLimitError && typeof retryAfterMs === 'number') {
            waitMs = retryAfterMs;
          } else if (isRateLimitError) {
            // Gateway sends no Retry-After (sandbox-verified): pace the retry
            // by our own observed window when the endpoint has a documented
            // rule; fall back to exponential backoff otherwise.
            const remaining = this._windowRemainingMs(endpoint);
            waitMs =
              remaining !== undefined
                ? Math.min(Math.max(remaining + 250, 1_000), 10_000)
                : applyBackoffJitter(retryDelayMs * 2 ** attempt, jitter);
          } else {
            waitMs = applyBackoffJitter(retryDelayMs * 2 ** attempt, jitter);
          }
          await delay(waitMs);
          continue;
        }

        throw paywayError;
      } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      }
    }

    throw new PayWayAPIError('Retry limit exceeded', { endpoint, correlationId });
  }

  private async request<TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName: 'req_time' | 'request_time' = 'req_time',
    contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json',
    hashEncoding: 'base64' | 'hex' = 'base64',
    fetchOptions?: { retry?: 'transient' | 'none' },
    callOptions?: RequestCallOptions,
  ): Promise<TResponse> {
    // S06: with partner-only credentials construction succeeds, so the
    // merchant requirement is enforced here — before any HMAC is computed or
    // request is sent (an empty-key HMAC would otherwise go out silently).
    if (!this.config.merchantId || !this.config.apiKey) {
      throw new PayWayConfigError(this.config.merchantId ? 'apiKey is required' : 'merchantId is required');
    }
    const fullBody: Record<string, unknown> = {
      ...body,
      merchant_id: this.config.merchantId,
    };

    if (!fullBody[timeFieldName]) {
      fullBody[timeFieldName] = formatRequestTime();
    }

    fullBody.hash = generateHmac(fullBody, hmacFields, this.config.apiKey, hashEncoding);

    let bodyPayload: string;
    if (contentType === 'application/x-www-form-urlencoded') {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(fullBody)) {
        if (value !== undefined && value !== null) {
          form.append(key, String(value));
        }
      }
      bodyPayload = form.toString();
    } else {
      bodyPayload = JSON.stringify(fullBody);
    }

    return this._executeFetch<TResponse>(path, { 'Content-Type': contentType }, bodyPayload, fetchOptions, callOptions);
  }

  private async requestWithMerchantAuth<TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
      /**
       * Optional binary part appended to a `multipart/form-data` body
       * (payment-link `image`). When present, the string fields travel as
       * multipart parts and no manual Content-Type header is set — undici
       * must generate the boundary. The hash is unchanged.
       */
      multipartFile?: { name: string; filename: string; contentType: string; data: Uint8Array };
      /** Per-call timeout/abort overrides for this request. */
      callOptions?: RequestCallOptions;
    } = {},
  ): Promise<TResponse> {
    // S06: same merchant-credential enforcement as {@link PayWay.request} —
    // fail before signing when a partner-only configuration calls a
    // merchant-authenticated domain.
    if (!this.config.merchantId || !this.config.apiKey) {
      throw new PayWayConfigError(this.config.merchantId ? 'apiKey is required' : 'merchantId is required');
    }
    if (!this.config.publicKeyPem) {
      throw new PayWayConfigError('publicKeyPem is required for RSA-encrypted endpoints');
    }
    if (!isValidPublicKeyPem(this.config.publicKeyPem)) {
      throw new PayWayConfigError(
        'publicKeyPem does not look like a public key PEM (expected "-----BEGIN PUBLIC KEY-----")',
      );
    }

    const requestTime = formatRequestTime();
    const merchantAuth = (await import('./auth.js')).encryptMerchantAuth(
      {
        mc_id: this.config.merchantId,
        ...authPayload,
      },
      this.config.publicKeyPem,
    );

    const body: Record<string, unknown> = {
      merchant_id: this.config.merchantId,
      merchant_auth: merchantAuth,
      request_time: requestTime,
    };

    const hmacFields = options.hmacFields ?? [...MERCHANT_AUTH_DEFAULT_HASH_FIELDS];
    body.hash = generateHmac(body, hmacFields, this.config.apiKey);
    const contentType = options.contentType ?? 'application/x-www-form-urlencoded';

    if (options.multipartFile) {
      const form = new FormData();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          form.append(key, String(value));
        }
      }
      const part = options.multipartFile;
      // Copy into a fresh ArrayBuffer: newer @types/node type Buffer#buffer
      // as ArrayBuffer | SharedArrayBuffer and restrict BlobPart to views
      // over plain ArrayBuffer — only a copy satisfies every typings
      // generation (CI sqlite-contract job; also byte-identical to the
      // previous buffer.slice behavior).
      const partView = new Uint8Array(part.data);
      form.append(part.name, new Blob([partView], { type: part.contentType }), part.filename);
      // No Content-Type header: undici generates `multipart/form-data; boundary=…`.
      return this._executeFetch<TResponse>(path, {}, form, undefined, options.callOptions);
    }

    let bodyPayload: string;
    if (contentType === 'application/json') {
      bodyPayload = JSON.stringify(body);
    } else {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          form.append(key, String(value));
        }
      }
      bodyPayload = form.toString();
    }

    return this._executeFetch<TResponse>(path, { 'Content-Type': contentType }, bodyPayload, undefined, options.callOptions);
  }

  /**
   * Partner-authenticated request for the online-self-activation endpoints
   * (`/api/merchant-portal/online-self-activation/*`). Spec-derived
   * (openapi-suite-coverage W3, 2026-09-12) and NOT live-verified.
   *
   * Wire shape per the archived gateway spec: JSON body
   * `{ request_time, partner_id, request_data, hash }` where `request_data`
   * is the chunked-RSA-encrypted JSON payload (same 117-byte-chunk PKCS1
   * scheme as `merchant_auth` — {@link encryptMerchantAuth}) and `hash` is
   * HMAC over `partner_id . request_data . request_time` with a per-endpoint
   * algorithm (SHA256 for new-merchant/get-mc-info, SHA512 for
   * get-mc-credential-info per that endpoint's own prose — the spec is
   * internally inconsistent; flagged in the domain).
   *
   * Note: NO `merchant_id` is injected — these endpoints authenticate the
   * registration PARTNER, not a merchant.
   */
  private async requestWithPartnerAuth<TResponse>(
    path: string,
    requestDataPayload: Record<string, unknown>,
    options: {
      /** 'sha256' (spec default for the trio) or 'sha512' (get-mc-credential-info). */
      hashAlgorithm?: 'sha256' | 'sha512';
      /** Extra top-level body fields that are NOT part of `request_data` and NOT hashed (e.g. `reference_id`). */
      bodyExtras?: Record<string, unknown>;
      /** Pin the request_time (get-mc-info needs it before building request_data). Defaults to now. */
      requestTime?: string;
      callOptions?: RequestCallOptions;
    } = {},
  ): Promise<TResponse> {
    const { partnerId, partnerApiKey, publicKeyPem } = this.config;
    if (!partnerId) {
      throw new PayWayConfigError('partnerId is required for online-self-activation endpoints (set partnerId or PAYWAY_PARTNER_ID)');
    }
    if (!partnerApiKey && !this.config.apiKey) {
      throw new PayWayConfigError(
        'partnerApiKey (or apiKey fallback) is required to sign online-self-activation requests (set partnerApiKey or PAYWAY_PARTNER_API_KEY)',
      );
    }
    if (!publicKeyPem) {
      throw new PayWayConfigError('publicKeyPem is required to RSA-encrypt request_data for online-self-activation endpoints');
    }
    if (!isValidPublicKeyPem(publicKeyPem)) {
      throw new PayWayConfigError('publicKeyPem does not look like a public key PEM (expected "-----BEGIN PUBLIC KEY-----")');
    }

    const requestTime = options.requestTime ?? formatRequestTime();
    const requestData = (await import('./auth.js')).encryptMerchantAuth(requestDataPayload, publicKeyPem);

    const body: Record<string, unknown> = {
      request_time: requestTime,
      partner_id: partnerId,
      request_data: requestData,
      ...options.bodyExtras,
    };
    body.hash = generateHmac(
      body,
      [...SELF_ACTIVATION_HASH_FIELDS],
      partnerApiKey ?? this.config.apiKey,
      'base64',
      options.hashAlgorithm ?? 'sha256',
    );

    return this._executeFetch<TResponse>(
      path,
      { 'Content-Type': 'application/json' },
      JSON.stringify(body),
      undefined,
      options.callOptions,
    );
  }

  /**
   * Verify the signature of a webhook/callback notification from PayWay.
   *
   * @param body - The raw request body or parsed payload from the callback without the `hash` field.
   * @param signature - The signature/hash received from the PayWay callback headers/body.
   * @returns True if the signature is valid and authentic, false otherwise.
   */
  public verifyCallback(
    body: Record<string, unknown>,
    signature: string,
    options?: { stripHash?: boolean },
  ): boolean {
    return verifyCallbackSignature(body, signature, this.config.apiKey, options);
  }

  /**
   * Diagnostic variant of {@link verifyCallback}: same canonicalization and
   * timing-safe comparison, but reports WHY a callback failed (wrong key,
   * malformed/missing signature, body still carrying hash: hash table empty, tampered
   * payload) so integrators can self-diagnose without string-guessing.
   */
  public verifyCallbackDetailed(
    body: Record<string, unknown>,
    signature: string,
    options?: { stripHash?: boolean },
  ): CallbackVerificationResult {
    return verifyCallbackDetailed(body, signature, this.config.apiKey, options);
  }

  public getGatewayErrorDetails(error: unknown): GatewayErrorDetails | null {
    if (error instanceof PayWayAPIError) {
      return {
        code: error.paywayCode,
        message: error.message,
        rawBody: error.rawBody,
        statusCode: error.statusCode,
      };
    }

    if (error && typeof error === 'object') {
      const maybeError = error as Record<string, unknown>;
      const rawBody = (maybeError.rawBody ?? maybeError) as Record<string, unknown>;
      const statusObj = rawBody.status as Record<string, unknown> | undefined;
      const code = statusObj?.code ?? rawBody.code ?? maybeError.paywayCode;
      const message = statusObj?.message ?? rawBody.message ?? maybeError.message;
      const statusCode = maybeError.statusCode as number | undefined;

      if (code !== undefined || message !== undefined || rawBody !== undefined) {
        return {
          code: code !== undefined ? String(code) : undefined,
          message: typeof message === 'string' ? message : undefined,
          rawBody,
          statusCode,
        };
      }
    }

    return null;
  }
}
export { verifyCallbackSignature, verifyCallbackDetailed } from './auth.js';
export type { CallbackVerificationFailure, CallbackVerificationResult } from './auth.js';
