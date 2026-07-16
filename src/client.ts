import { generateHmac, encryptMerchantAuth, verifyCallbackSignature } from './auth.js';
import { BASE_URLS, ENDPOINTS } from './constants.js';
import { PayWayConfigError, PayWayAPIError } from './errors.js';
import {
  formatRequestTime,
  formatAmount,
  encodeBase64IfNeeded,
  filterParams,
  validateCurrency,
  validatePositiveAmount,
  validateTransactionId,
  validateBeneficiaries,
} from './utils.js';
import { generateOfflineQR, type GenerateOfflineQrParams } from './khqr-offline.js';
import type { components } from './types.js';

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
  maxRetries?: number;      // Default: 0
  retryDelayMs?: number;    // Default: 1000
  rateLimitThrottling?: boolean; // Default: true for endpoints with documented limits
  rateLimitRules?: Record<string, RateLimitRule>;
  onRequest?: (endpoint: string, bodyPayload: string) => void;
  onResponse?: (endpoint: string, statusCode: number, body: any, rateLimitInfo?: RateLimitInfo) => void;
}

export interface GatewayErrorDetails {
  code?: string | number;
  message?: string;
  rawBody?: any;
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
  customFields?: string | Record<string, any>;
  returnParams?: string;
  viewType?: 'hosted_view' | 'popup';
  paymentGate?: number;
  payout?: string | { acc: string; amt: number }[];
  additionalParams?: string | Record<string, any>;
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
  customFields?: string | Record<string, any>;
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

function checkResponseError(body: any, endpoint?: string): void {
  if (!body || typeof body !== 'object') {
    return;
  }

  if (body.status && typeof body.status === 'object') {
    const code = String(body.status.code ?? '');
    const message = body.status.message || 'Unknown PayWay API Error';
    if (code !== '0' && code !== '00' && code !== '') {
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
      });
    }
  }

  if (body.status && typeof body.status === 'string') {
    const statusStr = body.status.toUpperCase();
    if (statusStr === 'FAILED' || statusStr === 'ERROR') {
      const code = body.code !== undefined ? String(body.code) : undefined;
      const message = body.message || 'Unknown PayWay API Error';
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
      });
    }
  }

  if (body.code !== undefined && body.code !== null && typeof body.code !== 'object') {
    const code = String(body.code);
    const message = body.message || 'Unknown PayWay API Error';
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

function isAbortError(error: any): boolean {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

async function parseResponseBody(response: Response): Promise<any> {
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

function createHttpError(response: Response, rawBody: any, endpoint?: string, rateLimitInfo?: RateLimitInfo): PayWayAPIError {
  return new PayWayAPIError(`HTTP Error: ${response.status} ${response.statusText}`, {
    statusCode: response.status,
    rawBody,
    endpoint,
    rateLimitInfo,
    retryable: response.status === 429,
  });
}

function createJsonParseError(rawBody: string, endpoint?: string): PayWayAPIError {
  return new PayWayAPIError('Invalid JSON response from PayWay API', {
    rawBody,
    endpoint,
  });
}

function createNetworkError(error: any, timeoutMs: number, endpoint?: string): PayWayAPIError {
  if (isAbortError(error)) {
    return new PayWayAPIError(`Request timed out after ${timeoutMs}ms`, {
      rawBody: error,
      endpoint,
      retryable: true,
    });
  }

  return new PayWayAPIError(`Network error: ${error?.message ?? 'Unknown network failure'}`, {
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
  const remaining = parseHeaderNumber(headers, ['x-rate-limit-remaining', 'ratelimit-remaining', 'rate-limit-remaining']);
  const reset = parseHeaderNumber(headers, ['x-rate-limit-reset', 'ratelimit-reset', 'rate-limit-reset']);
  const retryAfter = parseHeaderNumber(headers, ['retry-after', 'x-retry-after']);

  if (limit === undefined && remaining === undefined && reset === undefined && retryAfter === undefined) {
    return undefined;
  }

  const rawHeaders: Record<string, string> = {};
  for (const key of ['x-rate-limit-limit', 'x-rate-limit-remaining', 'x-rate-limit-reset', 'retry-after', 'x-retry-after']) {
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
      } catch (error: any) {
        clearTimeout(timeoutId);

        const paywayError = error instanceof PayWayAPIError ? error : createNetworkError(error, timeoutMs, endpoint);
        const isRateLimitError = paywayError.statusCode === 429 || paywayError.paywayCode === '429';
        const shouldRetry =
          attempt < maxRetries &&
          (isRateLimitError || (paywayError.statusCode !== undefined && paywayError.statusCode >= 500) || paywayError.retryable);

        if (shouldRetry) {
          const waitMs =
            (isRateLimitError && paywayError.rateLimitInfo?.retryAfterMs !== undefined)
              ? paywayError.rateLimitInfo.retryAfterMs
              : retryDelayMs * 2 ** attempt;
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
    body: Record<string, any>,
    hmacFields: string[],
    timeFieldName: 'req_time' | 'request_time' = 'req_time',
    contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json',
    hashEncoding: 'base64' | 'hex' = 'base64',
  ): Promise<TResponse> {
    const fullBody: Record<string, any> = {
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
    authPayload: Record<string, any>,
    options: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
    } = {},
  ): Promise<TResponse> {
    if (!this.config.publicKeyPem) {
      throw new PayWayConfigError('publicKeyPem is required for RSA-encrypted endpoints');
    }

    const requestTime = formatRequestTime();
    const merchantAuth = encryptMerchantAuth(
      {
        mc_id: this.config.merchantId,
        ...authPayload,
      },
      this.config.publicKeyPem,
    );

    const body: Record<string, any> = {
      merchant_id: this.config.merchantId,
      merchant_auth: merchantAuth,
      request_time: requestTime,
    };

    const hmacFields = options.hmacFields ?? ['request_time', 'merchant_id', 'merchant_auth'];
    body.hash = generateHmac(body, hmacFields, this.config.apiKey);
    const contentType = options.contentType ?? 'application/x-www-form-urlencoded';

    const bodyPayload =
      contentType === 'application/json'
        ? JSON.stringify(body)
        : new URLSearchParams(body).toString();

    return this._executeFetch<TResponse>(path, { 'Content-Type': contentType }, bodyPayload);
  }

  /**
   * Verify the signature of a webhook/callback notification from PayWay.
   *
   * @param body - The raw request body or parsed payload from the callback without the `hash` field.
   * @param signature - The signature/hash received from the PayWay callback headers/body.
   * @returns True if the signature is valid and authentic, false otherwise.
   */
  public verifyCallback(body: Record<string, any>, signature: string): boolean {
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
      const maybeError = error as Record<string, any>;
      const rawBody = maybeError.rawBody ?? maybeError;
      const code = rawBody?.status?.code ?? rawBody?.code ?? maybeError.paywayCode;
      const message = rawBody?.status?.message ?? rawBody?.message ?? maybeError.message;
      const statusCode = maybeError.statusCode;

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

  // --- Sub-Clients ---

  /**
   * Checkout-related API helpers.
   */
  public readonly checkout = {
    /**
     * Create a signed transaction payload for a client-side checkout form.
     * This prepares parameters, formats quantities/currencies/amounts, base64 encodes payloads as needed,
     * and signs the payload with the merchant HMAC signature.
     *
     * @param params - The checkout transaction parameters.
     * @param params.transactionId - The unique identifier for the transaction.
     * @param params.amount - The purchase amount.
     * @param params.firstname - First name of the customer.
     * @param params.lastname - Last name of the customer.
     * @param params.email - Email address of the customer.
     * @param params.phone - Phone number of the customer.
     * @param params.type - The transaction type ('purchase' or 'pre-auth'). Defaults to 'purchase'.
     * @param params.paymentOption - The active payment option (e.g. 'cards', 'abapay_khqr').
     * @param params.items - Shopping cart items list or raw encoded string.
     * @param params.shipping - The shipping fee amount.
     * @param params.currency - The currency of the transaction ('KHR' or 'USD'). Defaults to 'USD'.
     * @param params.returnUrl - The merchant URL where the user is redirected after successful payment.
     * @param params.cancelUrl - The merchant URL where the user is redirected if payment is cancelled.
     * @param params.skipSuccessPage - Whether to skip the ABA/PayWay success page (0 or 1).
     * @param params.continueSuccessUrl - The redirect URL to continue after payment success.
     * @param params.returnDeeplink - Custom redirect deeplink for mobile applications.
     * @param params.customFields - Metadata fields to attach to the transaction.
     * @param params.returnParams - String of custom query parameters to pass back to the redirect URL.
     * @param params.viewType - The display view style ('hosted_view' or 'popup').
     * @param params.paymentGate - The gateway type routing.
     * @param params.payout - Optional array of payout instructions.
     * @param params.additionalParams - Additional key-value options.
     * @param params.lifetime - Lifespan of checkout page/session in seconds.
     * @param params.googlePayToken - Raw Google Pay authorization token.
     * @returns A signed object containing checkout transaction fields and a `hash` field.
     */
    createTransaction: (params: CreateTransactionParams): Record<string, any> & { hash: string } => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || 'USD');
      validateCurrency(params.currency);

      const time = formatRequestTime();
      const payload: Record<string, any> = filterParams({
        tran_id: params.transactionId,
        amount: formatAmount(params.amount, params.currency || 'USD'),
        firstname: params.firstname,
        lastname: params.lastname,
        email: params.email,
        phone: params.phone,
        type: params.type || 'purchase',
        payment_option: params.paymentOption,
        items: params.items ? encodeBase64IfNeeded(params.items) : undefined,
        shipping: params.shipping !== undefined ? formatAmount(params.shipping, params.currency || 'USD') : undefined,
        currency: params.currency || 'USD',
        return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : undefined,
        cancel_url: params.cancelUrl ? encodeBase64IfNeeded(params.cancelUrl) : undefined,
        skip_success_page: params.skipSuccessPage,
        continue_success_url: params.continueSuccessUrl ? encodeBase64IfNeeded(params.continueSuccessUrl) : undefined,
        return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
        custom_fields: params.customFields ? encodeBase64IfNeeded(params.customFields) : undefined,
        return_params: params.returnParams ? encodeBase64IfNeeded(params.returnParams) : undefined,
        view_type: params.viewType,
        payment_gate: params.paymentGate,
        payout: params.payout ? encodeBase64IfNeeded(params.payout) : undefined,
        additional_params: params.additionalParams ? encodeBase64IfNeeded(params.additionalParams) : undefined,
        lifetime: params.lifetime,
        google_pay_token: params.googlePayToken,
        req_time: time,
        merchant_id: this.config.merchantId,
      });

      const fields = [
        'req_time',
        'merchant_id',
        'tran_id',
        'amount',
        'items',
        'shipping',
        'firstname',
        'lastname',
        'email',
        'phone',
        'type',
        'payment_option',
        'return_url',
        'cancel_url',
        'continue_success_url',
        'return_deeplink',
        'currency',
        'custom_fields',
        'return_params',
        'payout',
        'lifetime',
        'additional_params',
        'google_pay_token',
        'skip_success_page',
      ];

      const hash = generateHmac(payload, fields, this.config.apiKey);
      return { ...payload, hash };
    },

    /**
     * Check the status of a checkout transaction.
     *
     * @param transactionId - The transaction identifier to query.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction status response.
     */
    checkTransaction: (transactionId: string, requestTime?: string) => {
      return this.request<components['schemas']['CheckTransactionResponse']>(ENDPOINTS.checkTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        'req_time',
        'merchant_id',
        'tran_id',
      ]);
    },

    /**
     * Close an active checkout transaction.
     *
     * @param transactionId - The transaction identifier to close.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction closure response.
     */
    closeTransaction: (transactionId: string, requestTime?: string) => {
      return this.request<components['schemas']['CloseTransactionResponse']>(ENDPOINTS.closeTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        'req_time',
        'merchant_id',
        'tran_id',
      ]);
    },

    /**
     * Retrieve details for a specific transaction.
     *
     * @param transactionId - The transaction identifier to query.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction details response.
     */
    getTransactionDetail: (transactionId: string, requestTime?: string) => {
      return this.request<components['schemas']['TransactionDetailResponse']>(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    /**
     * Query transaction history filtering by date range, amount, status, and pagination options.
     *
     * @param params - The transaction list query parameters.
     * @param params.fromDate - The start date filter (format: YYYY-MM-DD).
     * @param params.toDate - The end date filter (format: YYYY-MM-DD).
     * @param params.fromAmount - The minimum transaction amount.
     * @param params.toAmount - The maximum transaction amount.
     * @param params.status - The transaction status to filter by.
     * @param params.page - The page index for pagination.
     * @param params.pagination - The maximum items per page.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the list of transactions.
     */
    getTransactionList: (params: GetTransactionListParams) => {
      return this.request<components['schemas']['TransactionListResponse']>(
        ENDPOINTS.getTransactionList,
        filterParams({
          from_date: params.fromDate,
          to_date: params.toDate,
          from_amount: params.fromAmount,
          to_amount: params.toAmount,
          status: params.status,
          page: params.page,
          pagination: params.pagination,
          req_time: params.requestTime,
        }),
        ['req_time', 'merchant_id', 'from_date', 'to_date', 'from_amount', 'to_amount', 'status', 'page', 'pagination'],
        'req_time',
      );
    },

    /**
     * Refund a captured checkout transaction.
     *
     * @param transactionId - The transaction identifier to refund.
     * @param amount - The amount to refund.
     * @returns A promise resolving to the refund response details.
     */
    refund: (transactionId: string, amount: number) => {
      return this.requestWithMerchantAuth<components['schemas']['RefundResponse']>(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount,
      });
    },

    /**
     * Retrieve the current exchange rate configured for the merchant.
     *
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the exchange rate response details.
     */
    getExchangeRate: (requestTime?: string) => {
      return this.request<components['schemas']['ExchangeRateResponse']>(ENDPOINTS.getExchangeRate, filterParams({ req_time: requestTime }), [
        'req_time',
        'merchant_id',
      ]);
    },
  };

  /**
   * Credentials-on-File API helpers.
   */
  public readonly credentialsOnFile = {
    /**
     * Link an ABA Bank account for stored-credential payments.
     *
     * @param params - Account linking parameters.
     * @param params.requestId - Unique client request ID.
     * @param params.ctid - Stored credential tracking identifier (token).
     * @param params.returnDeeplink - Deeplink redirect URL for mobile apps.
     * @param params.tokenFlag - Action flag indicating tokenization details.
     * @param params.currency - The currency of the account ('KHR' or 'USD').
     * @param params.callbackUrl - Optional endpoint where PayWay sends status callbacks.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the link account response.
     */
    linkAccount: (params: LinkAccountParams) => {
      return this.request<components['schemas']['LinkAccountResponse']>(
        ENDPOINTS.linkAccount,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          token_flag: params.tokenFlag,
          currency: params.currency,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          request_time: params.requestTime,
        }),
        [
          'request_time',
          'merchant_id',
          'request_id',
          'ctid',
          'return_deeplink',
          'token_flag',
          'currency',
          'callback_url',
        ],
        'request_time',
      );
    },

    /**
     * Link a debit or credit card to create stored payment credentials.
     *
     * @param params - Card linking parameters.
     * @param params.requestId - Unique client request ID.
     * @param params.ctid - Stored credential tracking identifier (token).
     * @param params.returnDeeplink - Deeplink redirect URL for mobile apps.
     * @param params.tokenFlag - Action flag indicating tokenization details.
     * @param params.frequency - Card usage authorization frequency ('1W', '1M', or '2M').
     * @param params.returnUrl - Merchant landing page redirect URL.
     * @param params.callbackUrl - Optional callback URL for status notifications.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the link card response details.
     */
    linkCard: (params: LinkCardParams) => {
      return this.request<components['schemas']['LinkCardResponse']>(
        ENDPOINTS.linkCard,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          token_flag: params.tokenFlag,
          frequency: params.frequency,
          return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : undefined,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          request_time: params.requestTime,
        }),
        [
          'request_time',
          'merchant_id',
          'request_id',
          'ctid',
          'return_deeplink',
          'token_flag',
          'frequency',
          'return_url',
          'callback_url',
        ],
        'request_time',
        'application/x-www-form-urlencoded',
      );
    },

    /**
     * Execute a payment using a saved stored-credential token.
     *
     * @param params - Stored-credential payment parameters.
     * @param params.requestId - Unique client request ID.
     * @param params.transactionId - Merchant reference transaction ID.
     * @param params.amount - The amount to charge.
     * @param params.ctid - Stored credential tracking identifier.
     * @param params.paymentToken - The stored payment token.
     * @param params.tokenFlag - Action flag.
     * @param params.currency - The payment currency ('KHR' or 'USD'). Defaults to 'USD'.
     * @param params.callbackUrl - Optional webhook callback URL.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the payment execution response.
     */
    payment: (params: CofPaymentParams) => {
      return this.request<components['schemas']['CofPaymentResponse']>(
        ENDPOINTS.payment,
        filterParams({
          request_id: params.requestId,
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          ctid: params.ctid,
          pwt: params.paymentToken,
          token_flag: params.tokenFlag,
          currency: params.currency || 'USD',
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          request_time: params.requestTime,
        }),
        [
          'request_time',
          'merchant_id',
          'request_id',
          'tran_id',
          'amount',
          'ctid',
          'pwt',
          'token_flag',
          'currency',
          'callback_url',
        ],
        'request_time',
      );
    },

    /**
     * Renew an existing stored-credential payment token.
     *
     * @param params - Token parameters.
     * @param params.requestId - Unique client request ID.
     * @param params.ctid - Stored credential tracking identifier.
     * @param params.paymentToken - The stored payment token.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the token renewal status response.
     */
    renewToken: (params: TokenParams) => {
      return this.request<components['schemas']['RenewTokenResponse']>(
        ENDPOINTS.renewToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
      );
    },

    /**
     * Query detailed status information for a stored payment token.
     *
     * @param params - Token parameters.
     * @param params.requestId - Unique client request ID.
     * @param params.ctid - Stored credential tracking identifier.
     * @param params.paymentToken - The stored payment token.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the stored token information details.
     */
    getTokenDetails: (params: TokenParams) => {
      return this.request<components['schemas']['GetTokenDetailsResponse']>(
        ENDPOINTS.getTokenDetails,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
      );
    },

    /**
     * Deactivate and remove a stored payment token from the credentials-on-file registry.
     *
     * @param params - Token parameters.
     * @param params.requestId - Unique client request ID.
     * @param params.ctid - Stored credential tracking identifier.
     * @param params.paymentToken - The stored payment token.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the token removal confirmation.
     */
    removeToken: (params: TokenParams) => {
      return this.request<components['schemas']['RemoveTokenResponse']>(
        ENDPOINTS.removeToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
      );
    },
  };

  /**
   * QR API helpers.
   */
  public readonly qr = {
    /**
     * Generate a dynamic merchant KHQR code for customer payment.
     *
     * @param params - The dynamic QR generation parameters.
     * @param params.transactionId - Merchant reference transaction ID.
     * @param params.amount - The payment amount.
     * @param params.paymentOption - The payment option target (e.g. 'abapay_khqr').
     * @param params.callbackUrl - The webhook notification callback endpoint.
     * @param params.purchaseType - The type of purchase. Defaults to 'purchase'.
     * @param params.currency - The currency of the payment ('KHR' or 'USD'). Defaults to 'USD'.
     * @param params.qrImageTemplate - Theme or layout template for the QR image. Defaults to 'template2'.
     * @param params.requestTime - Optional request timestamp.
     * @returns A promise resolving to the generated QR payload containing the QR code and image options.
     */
    generateQr: (params: GenerateQrParams) => {
      return this.request<components['schemas']['GenerateQrResponse']>(
        ENDPOINTS.generateQr,
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          purchase_type: params.purchaseType || 'purchase',
          payment_option: params.paymentOption,
          callback_url: encodeBase64IfNeeded(params.callbackUrl),
          currency: params.currency || 'USD',
          qr_image_template: params.qrImageTemplate || 'template2',
          req_time: params.requestTime,
        }),
        [
          'req_time',
          'merchant_id',
          'tran_id',
          'amount',
          'purchase_type',
          'payment_option',
          'callback_url',
          'currency',
          'qr_image_template',
        ],
      );
    },
  };

  /**
   * Payment Link API helpers.
   */
  public readonly paymentLink = {
    /**
     * Generate a new reusable or single-use PayWay payment link.
     *
     * @param params - Payment link configuration.
     * @param params.title - Title of the payment link shown to customer.
     * @param params.amount - The billing amount.
     * @param params.description - Details or description of the product/service.
     * @param params.paymentLimit - Optional number of allowed payments for this link.
     * @param params.returnUrl - Merchant redirect landing URL.
     * @param params.merchantRefNo - Unique merchant reference number.
     * @param params.expiredDate - Unix epoch timestamp (seconds) after which the link expires.
     * @returns A promise resolving to the payment link creation response.
     */
    create: (params: CreatePaymentLinkParams) => {
      return this.requestWithMerchantAuth<components['schemas']['CreatePaymentLinkResponse']>(
        ENDPOINTS.createPaymentLink,
        filterParams({
          title: params.title,
          amount: params.amount,
          description: params.description,
          payment_limit: params.paymentLimit,
          return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : undefined,
          merchant_ref_no: params.merchantRefNo,
          expired_date: params.expiredDate,
        }),
      );
    },

    /**
     * Retrieve status, configuration, and details of a payment link.
     *
     * @param paymentLinkId - The identifier of the payment link.
     * @returns A promise resolving to the payment link configuration and transaction logs.
     */
    getDetails: (paymentLinkId: string) => {
      return this.requestWithMerchantAuth<components['schemas']['GetPaymentLinkDetailsResponse']>(ENDPOINTS.getPaymentLinkDetails, { id: paymentLinkId });
    },
  };

  /**
   * Pre-authorization API helpers.
   */
  public readonly preAuth = {
    /**
     * Capture funds for an existing pre-authorized transaction.
     *
     * @param transactionId - The transaction ID of the pre-authorized transaction.
     * @param amount - The final amount to capture and capture/settle.
     * @returns A promise resolving to the capture response.
     */
    complete: (transactionId: string, amount: number) => {
      return this.requestWithMerchantAuth<components['schemas']['CompletePreAuthResponse']>(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount,
      }, {
        hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
        contentType: 'application/json',
      });
    },

    /**
     * Capture funds for a pre-authorized transaction and attach multi-account payout instructions.
     *
     * @param transactionId - The transaction ID of the pre-authorized transaction.
     * @param amount - The capture amount.
     * @param payout - Multi-destination payout instructions.
     * @returns A promise resolving to the capture and payout execution response.
     */
    completeWithPayout: (transactionId: string, amount: number, payout: { acc: string; amt: number }[]) => {
      return this.requestWithMerchantAuth<components['schemas']['CompletePreAuthResponse']>(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount,
        payout,
      }, {
        hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
        contentType: 'application/json',
      });
    },

    /**
     * Release/void a pre-authorized transaction to unlock customer funds.
     *
     * @param transactionId - The transaction ID of the pre-authorized transaction.
     * @returns A promise resolving to the cancellation/void status response.
     */
    cancel: (transactionId: string) => {
      return this.requestWithMerchantAuth<components['schemas']['CancelPreAuthResponse']>(ENDPOINTS.cancelPreAuth, { tran_id: transactionId }, {
        hmacFields: ['merchant_id', 'merchant_auth', 'request_time'],
        contentType: 'application/json',
      });
    },
  };

  /**
   * Payout API helpers.
   */
  public readonly payout = {
    /**
     * Initiate a bulk/single payout instruction to whitelisted beneficiary accounts.
     *
     * @param params - Payout request parameters.
     * @param params.transactionId - Unique merchant reference identifier.
     * @param params.amount - Total payout amount.
     * @param params.beneficiaries - Array of whitelisted recipient account numbers and amounts.
     * @param params.currency - The currency of the payout ('KHR' or 'USD').
     * @param params.customFields - Optional metadata object or JSON string.
     * @returns A promise resolving to the payout transaction status.
     */
    payout: async (params: PayoutParams) => {
      if (!this.config.publicKeyPem) {
        throw new PayWayConfigError('publicKeyPem is required for RSA-encrypted endpoints');
      }

      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency);
      validateCurrency(params.currency);
      validateBeneficiaries(params.beneficiaries, params.amount, params.currency);

      return this.request<components['schemas']['PayoutResponse']>(
        ENDPOINTS.payout,
        filterParams({
          tran_id: params.transactionId,
          amount: params.amount,
          beneficiaries: encryptMerchantAuth(params.beneficiaries, this.config.publicKeyPem),
          currency: params.currency,
          custom_fields: params.customFields
            ? typeof params.customFields === 'string'
              ? params.customFields
              : JSON.stringify(params.customFields)
            : undefined,
        }),
        ['merchant_id', 'tran_id', 'beneficiaries', 'amount', 'custom_fields', 'currency'],
        'req_time',
        'application/json',
        'hex',
      );
    },

    /**
     * Update the active status of a payout beneficiary.
     *
     * @param params - Beneficiary status parameters.
     * @param params.payee - The beneficiary account number/identifier.
     * @param params.status - Active state (1 for active, 0 for inactive).
     * @returns A promise resolving to the status update confirmation.
     */
    updateBeneficiaryStatus: (params: UpdateBeneficiaryStatusParams) => {
      return this.requestWithMerchantAuth<components['schemas']['BeneficiaryResponse']>(
        ENDPOINTS.updateBeneficiaryStatus,
        { payee: params.payee, status: params.status },
        { hmacFields: ['request_time', 'merchant_auth'], contentType: 'application/json' },
      );
    },

    /**
     * Add and whitelist a new payee account for future payout transactions.
     *
     * @param params - Beneficiary parameters.
     * @param params.payee - The payee account number/identifier.
     * @returns A promise resolving to the whitelisting action response.
     */
    addBeneficiary: (params: AddBeneficiaryParams) => {
      return this.requestWithMerchantAuth<components['schemas']['BeneficiaryResponse']>(
        ENDPOINTS.addBeneficiary,
        { payee: params.payee },
        { hmacFields: ['request_time', 'merchant_auth'], contentType: 'application/json' },
      );
    },
  };

  /**
   * KHQR-specific API helpers.
   */
  public readonly khqr = {
    /**
     * Generate a custom offline QR string without calling the PayWay API.
     *
     * This helper produces a merchant-scannable TLV payload with a CRC-16
     * checksum. It is **not** an official Bakong KHQR / EMVCo QR-MPM code;
     * use `qr.generateQr()` for PayWay-issued dynamic KHQR codes.
     *
     * @param params - Offline QR generation parameters.
     * @returns A TLV-encoded QR string with a CRC-16 checksum.
     */
    generateOfflineQR: (params: GenerateOfflineQrParams) => {
      return generateOfflineQR(params);
    },

    /**
     * Lookup and retrieve KHQR transaction history matching a specific merchant reference.
     *
     * @param merchantRef - The merchant reference number.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction retrieval response.
     */
    getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => {
      return this.request<components['schemas']['GetTransactionsByMcRefResponse']>(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ['req_time', 'merchant_id', 'merchant_ref'],
      );
    },
  };
}
export { verifyCallbackSignature } from './auth.js';
