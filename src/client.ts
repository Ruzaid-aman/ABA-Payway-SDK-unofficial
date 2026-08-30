import { randomBytes } from 'node:crypto';
import { generateHmac, verifyCallbackSignature } from './auth.js';
import { BASE_URLS, ENDPOINTS } from './constants.js';
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker.js';
import type { CheckoutDomain } from './domains/checkout.js';
import type { CredentialsOnFileDomain } from './domains/credentials-on-file.js';
import {
  createCheckoutDomain,
  createCredentialsOnFileDomain,
  createKhqrDomain,
  createPaymentLinkDomain,
  createPayoutDomain,
  createPreAuthDomain,
  createQrDomain,
} from './domains/index.js';
import type { KhqrDomain } from './domains/khqr.js';
import type { PaymentLinkDomain } from './domains/payment-link.js';
import type { PayoutDomain } from './domains/payout.js';
import type { PreAuthDomain } from './domains/pre-auth.js';
import type { QrDomain } from './domains/qr.js';
import {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayNetworkError,
  PayWayRateLimitError,
} from './errors.js';
import { type KhqrMerchantConfiguration, resolveKhqrConfiguration } from './khqr-config.js';
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
  limit?: number;
  remaining?: number;
  reset?: number;
  retryAfterMs?: number;
  rawHeaders?: Record<string, string>;
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
  rateLimitThrottling?: boolean; // Default: true for endpoints with documented limits
  rateLimitRules?: Record<string, RateLimitRule>;
  debug?: boolean;
  onRequest?: (endpoint: string, bodyPayload: string) => void;
  onResponse?: (endpoint: string, statusCode: number, body: unknown, rateLimitInfo?: RateLimitInfo) => void;
  /** Called when a request is delayed locally by the token-bucket throttle for an endpoint with a documented limit. */
  onThrottle?: (info: { endpoint: string; waitMs: number }) => void;
  /** ABA-issued merchant data used only for official offline KHQR generation. */
  khqr?: KhqrMerchantConfiguration;
  /**
   * TD-03 guard: the v3 token-management trio (renewToken/getTokenDetails/
   * removeToken) has NO ABA-confirmed HMAC composition (every derivable field
   * ordering was rejected in sandbox campaigns) and is therefore blocked by
   * default. Set `true` only when you accept shipping blind against the
   * gateway's current behaviour.
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

export interface CreateTransactionParams {
  transactionId: string;
  amount: number;
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
  /** Send 0 (with a JSON request via purchase()) to receive checkout_qr_url — the hosted page rendering the QR. */
  paymentGate?: number;
  payout?: string | { acc: string; amt: number }[];
  additionalParams?: string | Record<string, unknown>;
  /**
   * Lifetime in MINUTES, forwarded raw to the API (unlike the QR domain,
   * which accepts seconds). Spec: min 3, max 43200 (30 days); below 3 the
   * gateway rejects with error 69. Not converted or minimum-enforced here.
   */
  lifetime?: number;
  googlePayToken?: string;
  /**
   * Retry policy for this purchase call. 'transient' (default) re-sends the
   * request after network errors/5xx/429; 'none' surfaces those failures
   * after the first attempt — use for strict once-only submission, since
   * production duplicate-tran_id semantics are unconfirmed (sandbox
   * overwrites duplicates).
   */
  retryPolicy?: 'transient' | 'none';
}

export interface LinkAccountParams {
  requestId: string;
  ctid?: string;
  returnDeeplink?: string | { ios_scheme: string; android_scheme: string };
  tokenFlag?: string;
  currency?: 'KHR' | 'USD';
  callbackUrl?: string;
  requestTime?: string;
}

export interface LinkCardParams {
  requestId: string;
  ctid?: string;
  returnDeeplink?: string | { ios_scheme: string; android_scheme: string };
  tokenFlag?: string;
  frequency?: '1W' | '1M' | '2M';
  returnUrl?: string;
  callbackUrl?: string;
  /**
   * Payment currency. Required by the sandbox binding layer
   * ("The currency field is required.") — defaults to 'USD'.
   */
  currency?: 'USD' | 'KHR';
  requestTime?: string;
}

export interface CofPaymentParams {
  requestId: string;
  transactionId: string;
  amount: number;
  ctid?: string;
  paymentToken: string;
  tokenFlag?: string;
  currency?: 'KHR' | 'USD';
  callbackUrl?: string;
  requestTime?: string;
}

export interface TokenParams {
  requestId: string;
  ctid: string;
  paymentToken: string;
  /**
   * Value for the server-required `request` field on v3 token-management
   * endpoints (defaults to `requestId`). Sandbox binding layer rejects
   * requests without it ("The request field is required.").
   */
  request?: string;
  requestTime?: string;
}

export interface GenerateQrParams {
  transactionId: string;
  amount: number;
  paymentOption: 'abapay_khqr' | string;
  callbackUrl: string;
  purchaseType?: 'purchase';
  currency?: 'KHR' | 'USD';
  qrImageTemplate?: string;
  requestTime?: string;
  /** Lifetime in seconds (SDK converts to whole minutes for the API). Min 3 minutes. */
  lifetime?: number;
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
      throw new PayWayBusinessError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
        retryable: false,
      });
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
      throw new PayWayBusinessError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
        retryable: false,
      });
    }
  }
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: string; code?: string };
  return e.name === 'AbortError' || e.code === 'ABORT_ERR';
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

  // --- Sub-Clients ---
  public readonly checkout: CheckoutDomain;
  public readonly credentialsOnFile: CredentialsOnFileDomain;
  public readonly qr: QrDomain;
  public readonly paymentLink: PaymentLinkDomain;
  public readonly preAuth: PreAuthDomain;
  public readonly payout: PayoutDomain;
  public readonly khqr: KhqrDomain;

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
      [ENDPOINTS.refund]: { limit: 500, intervalMs: 1000 },
    };

    this.rateLimitRules = {
      ...defaultRateLimitRules,
      ...(this.config.rateLimitRules ?? {}),
    };

    // TD-07: opt-in transport circuit breaker (per-endpoint state).
    this.breaker = this.config.circuitBreaker ? new CircuitBreaker(this.config.circuitBreaker) : undefined;

    // Initialize domain sub-clients
    this.checkout = createCheckoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.credentialsOnFile = createCredentialsOnFileDomain(this.config, this.request.bind(this));
    this.qr = createQrDomain(this.config, this.request.bind(this));
    this.paymentLink = createPaymentLinkDomain(this.config, this.requestWithMerchantAuth.bind(this));
    this.preAuth = createPreAuthDomain(this.config, this.requestWithMerchantAuth.bind(this));
    this.payout = createPayoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.khqr = createKhqrDomain(this.config, this.request.bind(this));
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
    const resolvedConfig: ResolvedPayWayConfig = {
      ...config,
      merchantId: (config.merchantId ?? process.env.PAYWAY_MERCHANT_ID ?? '').trim(),
      apiKey: (config.apiKey ?? process.env.PAYWAY_API_KEY ?? '').trim(),
      publicKeyPem: normalizePem(config.publicKeyPem ?? process.env.PAYWAY_RSA_PUBLIC_KEY),
      environment: config.environment ?? environmentFromEnv,
      baseUrl: config.baseUrl ?? process.env.PAYWAY_BASE_URL ?? baseUrlFromEnv,
      timeout: config.timeout ?? (Number.isNaN(timeoutFromEnv) ? undefined : timeoutFromEnv),
      debug: config.debug ?? debugFromEnv,
      khqr: resolveKhqrConfiguration(config.khqr),
    };

    if (!resolvedConfig.merchantId) {
      throw new PayWayConfigError('merchantId is required');
    }
    if (!resolvedConfig.apiKey) {
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
      onRequest: (endpoint, bodyPayload) => {
        onRequest?.(endpoint, bodyPayload);
      },
      onResponse: (endpoint, statusCode, body, rateLimitInfo) => {
        const traceId = extractTraceId(body);
        if (traceId !== undefined) {
          // TD-08: PayWay envelopes carry `status.trace` / `trace`; surface it
          // so merchants can correlate SDK diagnostics with gateway support.
          paywayLogger.info(`[payway] trace_id=${String(traceId)} endpoint=${endpoint}`);
        }
        onResponse?.(endpoint, statusCode, body, rateLimitInfo);
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
    bodyPayload: string,
    options?: { retry?: 'transient' | 'none' },
  ): Promise<TResponse> {
    const timeoutMs = this.config.timeout ?? 30_000;
    const maxRetries = this.config.maxRetries ?? 3;
    const retryDelayMs = this.config.retryDelayMs ?? 3000;
    const jitter = this.config.backoffJitter ?? 'none';
    // Per-call opt-out for non-idempotent endpoints (purchase): 'none'
    // surfaces network/5xx/429 failures after the first attempt instead of
    // silently re-sending.
    const retriesDisabled = options?.retry === 'none';
    const url = `${this.baseUrl}${endpoint}`;
    const correlationId = randomBytes(8).toString('hex');
    const requestStartedAt = Date.now();

    // TD-07: fail fast while the endpoint's circuit is open (half-open probes
    // are admitted one at a time by the breaker itself).
    if (this.breaker) {
      this.breaker.assertAllowed(endpoint);
    }

    await this._acquireRateLimitToken(endpoint);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      this._recordRecentCall(endpoint);

      try {
        try {
          if (this.config.debug) {
            console.debug(
              `[payway] -> POST ${endpoint} (cid=${correlationId})`,
              sanitizeForLog(parseDebugRequestBody(bodyPayload)),
            );
          }
          this.config.onRequest?.(endpoint, bodyPayload);
        } catch {
          // Logging hooks must never fail SDK execution.
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: bodyPayload,
          signal: controller.signal,
        });

        const rateLimitInfo = parseRateLimitInfo(response.headers);
        const rawParsed = await parseResponseBody(response);
        const isEmptyBody = rawParsed === undefined;
        const parsedBody = isEmptyBody ? null : rawParsed;

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
          throw createJsonParseError(parsedBody, endpoint, response.headers.get('content-type') ?? undefined);
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
          this.config.onResponse?.(endpoint, response.status, parsedBody, rateLimitInfo);
        } catch {
          // Logging hooks must never fail SDK execution.
        }

        checkResponseError(parsedBody, endpoint);

        // TD-07: reaching a parsed response (even a business error) proves the
        // transport and gateway are alive — close/reset the circuit.
        this.breaker?.recordSuccess(endpoint);

        return parsedBody as TResponse;
      } catch (error) {
        clearTimeout(timeoutId);

        const paywayError = error instanceof PayWayAPIError ? error : createNetworkError(error, timeoutMs, endpoint);

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
      }
    }

    throw new PayWayAPIError('Retry limit exceeded', { endpoint });
  }

  private async request<TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName: 'req_time' | 'request_time' = 'req_time',
    contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json',
    hashEncoding: 'base64' | 'hex' = 'base64',
    fetchOptions?: { retry?: 'transient' | 'none' },
  ): Promise<TResponse> {
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

    return this._executeFetch<TResponse>(path, { 'Content-Type': contentType }, bodyPayload, fetchOptions);
  }

  private async requestWithMerchantAuth<TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
    } = {},
  ): Promise<TResponse> {
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

    const hmacFields = options.hmacFields ?? ['request_time', 'merchant_id', 'merchant_auth'];
    body.hash = generateHmac(body, hmacFields, this.config.apiKey);
    const contentType = options.contentType ?? 'application/x-www-form-urlencoded';

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

    return this._executeFetch<TResponse>(path, { 'Content-Type': contentType }, bodyPayload);
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
export { verifyCallbackSignature } from './auth.js';
