import { generateHmac, verifyCallbackSignature } from './auth.js';
import { BASE_URLS, ENDPOINTS } from './constants.js';
import { PayWayConfigError, PayWayAPIError } from './errors.js';
import { formatRequestTime } from './utils.js';
import {
  createCheckoutDomain,
  createCredentialsOnFileDomain,
  createQrDomain,
  createPaymentLinkDomain,
  createPreAuthDomain,
  createPayoutDomain,
  createKhqrDomain,
} from './domains/index.js';
import type { CheckoutDomain } from './domains/checkout.js';
import type { CredentialsOnFileDomain } from './domains/credentials-on-file.js';
import type { QrDomain } from './domains/qr.js';
import type { PaymentLinkDomain } from './domains/payment-link.js';
import type { PreAuthDomain } from './domains/pre-auth.js';
import type { PayoutDomain } from './domains/payout.js';
import type { KhqrDomain } from './domains/khqr.js';

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
  merchantId: string;
  apiKey: string;
  publicKeyPem?: string;
  environment?: 'sandbox' | 'production';
  timeout?: number;
  baseUrl?: string;
  maxRetries?: number; // Default: 0
  retryDelayMs?: number; // Default: 1000
  rateLimitThrottling?: boolean; // Default: true for endpoints with documented limits
  rateLimitRules?: Record<string, RateLimitRule>;
  onRequest?: (endpoint: string, bodyPayload: string) => void;
  onResponse?: (endpoint: string, statusCode: number, body: unknown, rateLimitInfo?: RateLimitInfo) => void;
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
  paymentGate?: number;
  payout?: string | { acc: string; amt: number }[];
  additionalParams?: string | Record<string, unknown>;
  lifetime?: number;
  googlePayToken?: string;
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
}

export interface CreatePaymentLinkParams {
  title: string;
  amount: number;
  description?: string;
  paymentLimit?: number;
  returnUrl?: string;
  merchantRefNo: string;
  expiredDate?: number;
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
    const code = String(statusObj.code ?? '');
    const message = String(statusObj.message ?? 'Unknown PayWay API Error');
    if (code !== '0' && code !== '00' && code !== '') {
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
      });
    }
  }

  if (typeof resp.status === 'string') {
    const statusStr = resp.status.toUpperCase();
    if (statusStr === 'FAILED' || statusStr === 'ERROR') {
      const code = resp.code !== undefined ? String(resp.code) : undefined;
      const message = String(resp.message ?? 'Unknown PayWay API Error');
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
      });
    }
  }

  if (resp.code !== undefined && resp.code !== null && typeof resp.code !== 'object') {
    const code = String(resp.code);
    const message = String(resp.message ?? 'Unknown PayWay API Error');
    if (code !== '0' && code !== '00') {
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
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
    return null;
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
  return new PayWayAPIError(`HTTP Error: ${response.status} ${response.statusText}`, {
    statusCode: response.status,
    rawBody,
    endpoint,
    rateLimitInfo: rateLimitInfo as Record<string, unknown>,
    retryable: response.status === 429,
  });
}

function createJsonParseError(rawBody: string, endpoint?: string): PayWayAPIError {
  return new PayWayAPIError('Invalid JSON response from PayWay API', {
    rawBody,
    endpoint,
  });
}

function createNetworkError(error: unknown, timeoutMs: number, endpoint?: string): PayWayAPIError {
  if (isAbortError(error)) {
    return new PayWayAPIError(`Request timed out after ${timeoutMs}ms`, {
      rawBody: error,
      endpoint,
      retryable: true,
    });
  }

  const message =
    error !== null && typeof error === 'object'
      ? String((error as { message?: unknown }).message ?? 'Unknown network failure')
      : 'Unknown network failure';
  return new PayWayAPIError(`Network error: ${message}`, {
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
  const retryAfter = parseHeaderNumber(headers, ['retry-after', 'x-retry-after']);

  if (limit === undefined && remaining === undefined && reset === undefined && retryAfter === undefined) {
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
    retryAfterMs: retryAfter,
    rawHeaders,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * PayWay SDK client.
 *
 * @example
 * const payway = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
 */
export class PayWay {
  private config: PayWayConfig;
  private baseUrl: string;
  private rateLimitRules: Record<string, RateLimitRule>;
  private rateLimitState = new Map<string, { tokens: number; lastRefill: number }>();

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
   * @throws {PayWayConfigError} If the configuration is missing or invalid.
   */
  constructor(config: PayWayConfig) {
    if (!config) {
      throw new PayWayConfigError('Config object is required');
    }
    if (!config.merchantId) {
      throw new PayWayConfigError('merchantId is required');
    }
    if (!config.apiKey) {
      throw new PayWayConfigError('apiKey is required');
    }
    this.config = config;

    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    } else {
      const env = config.environment || 'sandbox';
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
      ...(config.rateLimitRules ?? {}),
    };

    // Initialize domain sub-clients
    this.checkout = createCheckoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.credentialsOnFile = createCredentialsOnFileDomain(this.config, this.request.bind(this));
    this.qr = createQrDomain(this.config, this.request.bind(this));
    this.paymentLink = createPaymentLinkDomain(this.config, this.requestWithMerchantAuth.bind(this));
    this.preAuth = createPreAuthDomain(this.requestWithMerchantAuth.bind(this));
    this.payout = createPayoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.khqr = createKhqrDomain(this.config, this.request.bind(this));
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
    await delay(waitMs);

    this._refillRateLimitState(rule, state);
    state.tokens = Math.max(0, state.tokens - 1);
    this.rateLimitState.set(endpoint, state);
  }

  private async _executeFetch<TResponse>(
    endpoint: string,
    headers: Record<string, string>,
    bodyPayload: string,
  ): Promise<TResponse> {
    const timeoutMs = this.config.timeout ?? 30_000;
    const maxRetries = this.config.maxRetries ?? 0;
    const retryDelayMs = this.config.retryDelayMs ?? 1000;
    const url = `${this.baseUrl}${endpoint}`;

    await this._acquireRateLimitToken(endpoint);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        try {
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
        const parsedBody = await parseResponseBody(response);

        if (typeof parsedBody === 'string') {
          throw createJsonParseError(parsedBody, endpoint);
        }

        if (!response.ok) {
          throw createHttpError(response, parsedBody, endpoint, rateLimitInfo);
        }

        checkResponseError(parsedBody, endpoint);

        try {
          this.config.onResponse?.(endpoint, response.status, parsedBody, rateLimitInfo);
        } catch {
          // Logging hooks must never fail SDK execution.
        }

        return parsedBody as TResponse;
      } catch (error) {
        clearTimeout(timeoutId);

        const paywayError = error instanceof PayWayAPIError ? error : createNetworkError(error, timeoutMs, endpoint);
        const isRateLimitError = paywayError.statusCode === 429 || paywayError.paywayCode === '429';
        const shouldRetry =
          attempt < maxRetries &&
          (isRateLimitError ||
            (paywayError.statusCode !== undefined && paywayError.statusCode >= 500) ||
            paywayError.retryable);

        if (shouldRetry) {
          const rateLimitInfo = paywayError.rateLimitInfo as Record<string, unknown> | undefined;
          const retryAfterMs = rateLimitInfo?.retryAfterMs;
          const waitMs =
            isRateLimitError && typeof retryAfterMs === 'number' ? retryAfterMs : retryDelayMs * 2 ** attempt;
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

    return this._executeFetch<TResponse>(path, { 'Content-Type': contentType }, bodyPayload);
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
  public verifyCallback(body: Record<string, unknown>, signature: string): boolean {
    return verifyCallbackSignature(body, signature, this.config.apiKey);
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
