// src/auth.ts
import * as crypto from "crypto";
function generateHmac(payload, fieldList, apiKey, encoding = "base64") {
  const concatenated = fieldList.map((field) => {
    const val = payload[field];
    if (val === void 0 || val === null) {
      return "";
    }
    return String(val);
  }).join("");
  return crypto.createHmac("sha512", apiKey).update(concatenated).digest(encoding);
}
function encryptMerchantAuth(data, publicKeyPem) {
  const jsonStr = JSON.stringify(data);
  const buffer = Buffer.from(jsonStr, "utf8");
  const chunkSize = 117;
  const encryptedChunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      chunk
    );
    encryptedChunks.push(encrypted);
  }
  return Buffer.concat(encryptedChunks).toString("base64");
}
function verifyCallbackSignature(body, receivedSignature, apiKey) {
  const sortedKeys = Object.keys(body).sort();
  const concatenated = sortedKeys.map((key) => {
    const val = body[key];
    if (val === void 0 || val === null) {
      return "";
    }
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  }).join("");
  const computedSignature = crypto.createHmac("sha512", apiKey).update(concatenated).digest("base64");
  const computedBuf = Buffer.from(computedSignature);
  const receivedBuf = Buffer.from(receivedSignature);
  if (computedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}

// src/constants.ts
var BASE_URLS = {
  sandbox: "https://checkout-sandbox.payway.com.kh",
  production: "https://checkout.payway.com.kh"
};
var ENDPOINTS = {
  checkTransaction: "/api/payment-gateway/v1/payments/check-transaction-2",
  closeTransaction: "/api/payment-gateway/v1/payments/close-transaction",
  getTransactionDetail: "/api/payment-gateway/v1/payments/transaction-detail",
  getTransactionList: "/api/payment-gateway/v1/payments/transaction-list-2",
  refund: "/api/merchant-portal/merchant-access/online-transaction/refund",
  getExchangeRate: "/api/payment-gateway/v1/exchange-rate",
  linkAccount: "/api/payment-credential/v3/aof/link-account",
  linkCard: "/api/payment-credential/v3/cof/link-card",
  payment: "/api/payment-gateway/v3/purchase/payment-credential",
  renewToken: "/api/payment-credential/v3/token-management/renew-expired-account-token",
  getTokenDetails: "/api/payment-credential/v3/token-management/get-token-details",
  removeToken: "/api/payment-credential/v3/token-management/remove-token",
  generateQr: "/api/payment-gateway/v1/payments/generate-qr",
  createPaymentLink: "/api/merchant-portal/merchant-access/payment-link/create",
  getPaymentLinkDetails: "/api/merchant-portal/merchant-access/payment-link/detail",
  completePreAuth: "/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion",
  cancelPreAuth: "/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation",
  payout: "/api/payment-gateway/v2/direct-payment/merchant/payout",
  updateBeneficiaryStatus: "/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status",
  addBeneficiary: "/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout",
  getTransactionsByMerchantRef: "/api/payment-gateway/v1/payments/get-transactions-by-mc-ref"
};

// src/errors.ts
var PayWayError = class _PayWayError extends Error {
  constructor(message) {
    super(message);
    Object.setPrototypeOf(this, _PayWayError.prototype);
    this.name = "PayWayError";
  }
};
var PayWayConfigError = class _PayWayConfigError extends PayWayError {
  constructor(message) {
    super(message);
    Object.setPrototypeOf(this, _PayWayConfigError.prototype);
    this.name = "PayWayConfigError";
  }
};
var PayWayAPIError = class _PayWayAPIError extends PayWayError {
  statusCode;
  paywayCode;
  rawBody;
  endpoint;
  retryable;
  rateLimitInfo;
  constructor(message, options) {
    super(message);
    Object.setPrototypeOf(this, _PayWayAPIError.prototype);
    this.name = "PayWayAPIError";
    this.statusCode = options?.statusCode;
    this.paywayCode = options?.paywayCode;
    this.rawBody = options?.rawBody;
    this.endpoint = options?.endpoint;
    this.retryable = options?.retryable;
    this.rateLimitInfo = options?.rateLimitInfo;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      paywayCode: this.paywayCode,
      endpoint: this.endpoint,
      retryable: this.retryable,
      rateLimitInfo: this.rateLimitInfo,
      rawBody: this.rawBody
    };
  }
};

// src/utils.ts
function formatRequestTime(date) {
  const now = date || /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds());
}
var VALID_CURRENCIES = ["USD", "KHR"];
function validateCurrency(currency) {
  if (currency !== void 0 && !VALID_CURRENCIES.includes(currency)) {
    throw new PayWayConfigError(`currency must be one of ${VALID_CURRENCIES.join(", ")}, received: ${currency}`);
  }
}
function validatePositiveAmount(amount, currency) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PayWayConfigError(`amount must be a positive number, received: ${amount}`);
  }
  if (currency === "USD") {
    const rounded = Math.round(amount * 100) / 100;
    if (Math.abs(amount - rounded) > 1e-10) {
      throw new PayWayConfigError(`USD amount must have at most 2 decimal places, received: ${amount}`);
    }
  } else if (currency === "KHR" && !Number.isInteger(amount)) {
    throw new PayWayConfigError(`KHR amount must be an integer, received: ${amount}`);
  }
}
function validateTransactionId(transactionId) {
  if (typeof transactionId !== "string" || transactionId.length === 0) {
    throw new PayWayConfigError("transactionId is required and must be a non-empty string");
  }
}
function validateLifetime(lifetime) {
  if (lifetime !== void 0 && (!Number.isInteger(lifetime) || lifetime <= 0)) {
    throw new PayWayConfigError("lifetime must be a positive whole number of seconds");
  }
}
function validatePublicHttpsUrl(url, fieldName) {
  if (typeof url !== "string" || url.trim() !== url) {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.hostname === "localhost") {
      throw new Error("invalid public HTTPS URL");
    }
  } catch {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
}
function validateBeneficiaries(beneficiaries, totalAmount, currency) {
  if (!Array.isArray(beneficiaries) || beneficiaries.length === 0) {
    throw new PayWayConfigError("beneficiaries must be a non-empty array");
  }
  let sum = 0;
  for (const b of beneficiaries) {
    if (typeof b.account !== "string" || b.account.length === 0) {
      throw new PayWayConfigError("each beneficiary must have a non-empty account string");
    }
    validatePositiveAmount(b.amount, currency);
    sum += b.amount;
  }
  if (Math.abs(sum - totalAmount) > Number.EPSILON) {
    throw new PayWayConfigError(`beneficiary amounts (${sum}) must sum to total amount (${totalAmount})`);
  }
}
function formatAmount(amount, currency) {
  if (currency === "USD") {
    return amount.toFixed(2);
  }
  return Math.round(amount).toString();
}
function toBase64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}
function encodeBase64IfNeeded(val) {
  if (typeof val === "string") {
    if (val.startsWith("http://") || val.startsWith("https://")) {
      return toBase64(val);
    }
    return val;
  }
  return toBase64(JSON.stringify(val));
}
function filterParams(obj) {
  const filtered = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== void 0 && obj[key] !== null) {
      filtered[key] = obj[key];
    }
  }
  return filtered;
}

// src/khqr-offline.ts
function formatAmount2(amount, currency) {
  if (currency === "KHR") {
    return Math.round(amount).toString();
  }
  return amount.toFixed(2);
}
function encodeTlv(tag, value) {
  const length = value.length;
  const lengthStr = length.toString().padStart(2, "0");
  return `${tag}${lengthStr}${value}`;
}
function crc16Ccitt(input) {
  let crc = 65535;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 32768) !== 0) {
        crc = (crc << 1 ^ 4129) & 65535;
      } else {
        crc = crc << 1 & 65535;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function generateOfflineQR(params) {
  const tlvSegments = [];
  tlvSegments.push(encodeTlv("00", "01"));
  tlvSegments.push(encodeTlv("01", params.merchantId));
  tlvSegments.push(encodeTlv("02", params.transactionId));
  tlvSegments.push(encodeTlv("03", formatAmount2(params.amount, params.currency)));
  tlvSegments.push(encodeTlv("04", params.currency));
  tlvSegments.push(encodeTlv("05", params.merchantRef));
  if (params.tipAmount !== void 0) {
    tlvSegments.push(encodeTlv("06", formatAmount2(params.tipAmount, params.currency)));
  }
  if (params.feeAmount !== void 0) {
    tlvSegments.push(encodeTlv("07", formatAmount2(params.feeAmount, params.currency)));
  }
  if (params.transactionType !== void 0) {
    tlvSegments.push(encodeTlv("08", params.transactionType));
  }
  const payload = tlvSegments.join("");
  const checksum = crc16Ccitt(payload);
  return `${payload}${encodeTlv("63", checksum)}`;
}

// src/client.ts
function checkResponseError(body, endpoint) {
  if (!body || typeof body !== "object") {
    return;
  }
  if (body.status && typeof body.status === "object") {
    const code = String(body.status.code ?? "");
    const message = body.status.message || "Unknown PayWay API Error";
    if (code !== "0" && code !== "00" && code !== "") {
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint
      });
    }
  }
  if (body.status && typeof body.status === "string") {
    const statusStr = body.status.toUpperCase();
    if (statusStr === "FAILED" || statusStr === "ERROR") {
      const code = body.code !== void 0 ? String(body.code) : void 0;
      const message = body.message || "Unknown PayWay API Error";
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint
      });
    }
  }
  if (body.code !== void 0 && body.code !== null && typeof body.code !== "object") {
    const code = String(body.code);
    const message = body.message || "Unknown PayWay API Error";
    if (code !== "0" && code !== "00") {
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint
      });
    }
  }
}
function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}
async function parseResponseBody(response) {
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
function createHttpError(response, rawBody, endpoint, rateLimitInfo) {
  return new PayWayAPIError(`HTTP Error: ${response.status} ${response.statusText}`, {
    statusCode: response.status,
    rawBody,
    endpoint,
    rateLimitInfo,
    retryable: response.status === 429
  });
}
function createJsonParseError(rawBody, endpoint) {
  return new PayWayAPIError("Invalid JSON response from PayWay API", {
    rawBody,
    endpoint
  });
}
function createNetworkError(error, timeoutMs, endpoint) {
  if (isAbortError(error)) {
    return new PayWayAPIError(`Request timed out after ${timeoutMs}ms`, {
      rawBody: error,
      endpoint,
      retryable: true
    });
  }
  return new PayWayAPIError(`Network error: ${error?.message ?? "Unknown network failure"}`, {
    rawBody: error,
    endpoint,
    retryable: true
  });
}
function parseHeaderNumber(headers, names) {
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
  return void 0;
}
function parseRateLimitInfo(headers) {
  if (!headers) {
    return void 0;
  }
  const limit = parseHeaderNumber(headers, ["x-rate-limit-limit", "ratelimit-limit", "rate-limit-limit"]);
  const remaining = parseHeaderNumber(headers, ["x-rate-limit-remaining", "ratelimit-remaining", "rate-limit-remaining"]);
  const reset = parseHeaderNumber(headers, ["x-rate-limit-reset", "ratelimit-reset", "rate-limit-reset"]);
  const retryAfter = parseHeaderNumber(headers, ["retry-after", "x-retry-after"]);
  if (limit === void 0 && remaining === void 0 && reset === void 0 && retryAfter === void 0) {
    return void 0;
  }
  const rawHeaders = {};
  for (const key of ["x-rate-limit-limit", "x-rate-limit-remaining", "x-rate-limit-reset", "retry-after", "x-retry-after"]) {
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
    rawHeaders
  };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var PayWay = class {
  config;
  baseUrl;
  rateLimitRules;
  rateLimitState = /* @__PURE__ */ new Map();
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
  constructor(config) {
    if (!config) {
      throw new PayWayConfigError("Config object is required");
    }
    if (!config.merchantId) {
      throw new PayWayConfigError("merchantId is required");
    }
    if (!config.apiKey) {
      throw new PayWayConfigError("apiKey is required");
    }
    this.config = config;
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    } else {
      const env = config.environment || "sandbox";
      this.baseUrl = BASE_URLS[env] || BASE_URLS.sandbox;
    }
    const defaultRateLimitRules = {
      [ENDPOINTS.checkTransaction]: { limit: 600, intervalMs: 1e3 },
      [ENDPOINTS.getTransactionDetail]: { limit: 10, intervalMs: 6e4 },
      [ENDPOINTS.getTransactionList]: { limit: 50, intervalMs: 6e4 },
      [ENDPOINTS.refund]: { limit: 500, intervalMs: 1e3 }
    };
    this.rateLimitRules = {
      ...defaultRateLimitRules,
      ...config.rateLimitRules ?? {}
    };
  }
  _getRateLimitRule(endpoint) {
    if (this.config.rateLimitThrottling === false) {
      return void 0;
    }
    return this.rateLimitRules[endpoint];
  }
  _refillRateLimitState(rule, state) {
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
  async _acquireRateLimitToken(endpoint) {
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
  async _executeFetch(endpoint, headers, bodyPayload) {
    const timeoutMs = this.config.timeout ?? 3e4;
    const maxRetries = this.config.maxRetries ?? 0;
    const retryDelayMs = this.config.retryDelayMs ?? 1e3;
    const url = `${this.baseUrl}${endpoint}`;
    await this._acquireRateLimitToken(endpoint);
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        try {
          this.config.onRequest?.(endpoint, bodyPayload);
        } catch {
        }
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: bodyPayload,
          signal: controller.signal
        });
        const rateLimitInfo = parseRateLimitInfo(response.headers);
        const parsedBody = await parseResponseBody(response);
        if (typeof parsedBody === "string") {
          throw createJsonParseError(parsedBody, endpoint);
        }
        if (!response.ok) {
          throw createHttpError(response, parsedBody, endpoint, rateLimitInfo);
        }
        checkResponseError(parsedBody, endpoint);
        try {
          this.config.onResponse?.(endpoint, response.status, parsedBody, rateLimitInfo);
        } catch {
        }
        return parsedBody;
      } catch (error) {
        clearTimeout(timeoutId);
        const paywayError = error instanceof PayWayAPIError ? error : createNetworkError(error, timeoutMs, endpoint);
        const isRateLimitError = paywayError.statusCode === 429 || paywayError.paywayCode === "429";
        const shouldRetry = attempt < maxRetries && (isRateLimitError || paywayError.statusCode !== void 0 && paywayError.statusCode >= 500 || paywayError.retryable);
        if (shouldRetry) {
          const waitMs = isRateLimitError && paywayError.rateLimitInfo?.retryAfterMs !== void 0 ? paywayError.rateLimitInfo.retryAfterMs : retryDelayMs * 2 ** attempt;
          await delay(waitMs);
          continue;
        }
        throw paywayError;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new PayWayAPIError("Retry limit exceeded", { endpoint });
  }
  async request(path, body, hmacFields, timeFieldName = "req_time", contentType = "application/json", hashEncoding = "base64") {
    const fullBody = {
      ...body,
      merchant_id: this.config.merchantId
    };
    if (!fullBody[timeFieldName]) {
      fullBody[timeFieldName] = formatRequestTime();
    }
    fullBody.hash = generateHmac(fullBody, hmacFields, this.config.apiKey, hashEncoding);
    let bodyPayload;
    if (contentType === "application/x-www-form-urlencoded") {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(fullBody)) {
        if (value !== void 0 && value !== null) {
          form.append(key, String(value));
        }
      }
      bodyPayload = form.toString();
    } else {
      bodyPayload = JSON.stringify(fullBody);
    }
    return this._executeFetch(path, { "Content-Type": contentType }, bodyPayload);
  }
  async requestWithMerchantAuth(path, authPayload, options = {}) {
    if (!this.config.publicKeyPem) {
      throw new PayWayConfigError("publicKeyPem is required for RSA-encrypted endpoints");
    }
    const requestTime = formatRequestTime();
    const merchantAuth = encryptMerchantAuth(
      {
        mc_id: this.config.merchantId,
        ...authPayload
      },
      this.config.publicKeyPem
    );
    const body = {
      merchant_id: this.config.merchantId,
      merchant_auth: merchantAuth,
      request_time: requestTime
    };
    const hmacFields = options.hmacFields ?? ["request_time", "merchant_id", "merchant_auth"];
    body.hash = generateHmac(body, hmacFields, this.config.apiKey);
    const contentType = options.contentType ?? "application/x-www-form-urlencoded";
    const bodyPayload = contentType === "application/json" ? JSON.stringify(body) : new URLSearchParams(body).toString();
    return this._executeFetch(path, { "Content-Type": contentType }, bodyPayload);
  }
  /**
   * Verify the signature of a webhook/callback notification from PayWay.
   *
   * @param body - The raw request body or parsed payload from the callback without the `hash` field.
   * @param signature - The signature/hash received from the PayWay callback headers/body.
   * @returns True if the signature is valid and authentic, false otherwise.
   */
  verifyCallback(body, signature) {
    return verifyCallbackSignature(body, signature, this.config.apiKey);
  }
  getGatewayErrorDetails(error) {
    if (error instanceof PayWayAPIError) {
      return {
        code: error.paywayCode,
        message: error.message,
        rawBody: error.rawBody,
        statusCode: error.statusCode
      };
    }
    if (error && typeof error === "object") {
      const maybeError = error;
      const rawBody = maybeError.rawBody ?? maybeError;
      const code = rawBody?.status?.code ?? rawBody?.code ?? maybeError.paywayCode;
      const message = rawBody?.status?.message ?? rawBody?.message ?? maybeError.message;
      const statusCode = maybeError.statusCode;
      if (code !== void 0 || message !== void 0 || rawBody !== void 0) {
        return {
          code: code !== void 0 ? String(code) : void 0,
          message: typeof message === "string" ? message : void 0,
          rawBody,
          statusCode
        };
      }
    }
    return null;
  }
  // --- Sub-Clients ---
  /**
   * Checkout-related API helpers.
   */
  checkout = {
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
    createTransaction: (params) => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || "USD");
      validateCurrency(params.currency);
      validateLifetime(params.lifetime);
      const time = formatRequestTime();
      const payload = filterParams({
        tran_id: params.transactionId,
        amount: formatAmount(params.amount, params.currency || "USD"),
        firstname: params.firstname,
        lastname: params.lastname,
        email: params.email,
        phone: params.phone,
        type: params.type || "purchase",
        payment_option: params.paymentOption,
        items: params.items ? encodeBase64IfNeeded(params.items) : void 0,
        shipping: params.shipping !== void 0 ? formatAmount(params.shipping, params.currency || "USD") : void 0,
        currency: params.currency || "USD",
        return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : void 0,
        cancel_url: params.cancelUrl ? encodeBase64IfNeeded(params.cancelUrl) : void 0,
        skip_success_page: params.skipSuccessPage,
        continue_success_url: params.continueSuccessUrl ? encodeBase64IfNeeded(params.continueSuccessUrl) : void 0,
        return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : void 0,
        custom_fields: params.customFields ? encodeBase64IfNeeded(params.customFields) : void 0,
        return_params: params.returnParams ? encodeBase64IfNeeded(params.returnParams) : void 0,
        view_type: params.viewType,
        payment_gate: params.paymentGate,
        payout: params.payout ? encodeBase64IfNeeded(params.payout) : void 0,
        additional_params: params.additionalParams ? encodeBase64IfNeeded(params.additionalParams) : void 0,
        lifetime: params.lifetime,
        google_pay_token: params.googlePayToken,
        req_time: time,
        merchant_id: this.config.merchantId
      });
      const fields = [
        "req_time",
        "merchant_id",
        "tran_id",
        "amount",
        "items",
        "shipping",
        "firstname",
        "lastname",
        "email",
        "phone",
        "type",
        "payment_option",
        "return_url",
        "cancel_url",
        "continue_success_url",
        "return_deeplink",
        "currency",
        "custom_fields",
        "return_params",
        "payout",
        "lifetime",
        "additional_params",
        "google_pay_token",
        "skip_success_page"
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
    checkTransaction: (transactionId, requestTime) => {
      return this.request(ENDPOINTS.checkTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        "req_time",
        "merchant_id",
        "tran_id"
      ]);
    },
    /**
     * Close an active checkout transaction.
     *
     * @param transactionId - The transaction identifier to close.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction closure response.
     */
    closeTransaction: (transactionId, requestTime) => {
      return this.request(ENDPOINTS.closeTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        "req_time",
        "merchant_id",
        "tran_id"
      ]);
    },
    /**
     * Retrieve details for a specific transaction.
     *
     * @param transactionId - The transaction identifier to query.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction details response.
     */
    getTransactionDetail: (transactionId, requestTime) => {
      return this.request(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ["req_time", "merchant_id", "tran_id"]
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
    getTransactionList: (params) => {
      return this.request(
        ENDPOINTS.getTransactionList,
        filterParams({
          from_date: params.fromDate,
          to_date: params.toDate,
          from_amount: params.fromAmount,
          to_amount: params.toAmount,
          status: params.status,
          page: params.page,
          pagination: params.pagination,
          req_time: params.requestTime
        }),
        ["req_time", "merchant_id", "from_date", "to_date", "from_amount", "to_amount", "status", "page", "pagination"],
        "req_time"
      );
    },
    /**
     * Refund a captured checkout transaction.
     *
     * @param transactionId - The transaction identifier to refund.
     * @param amount - The amount to refund.
     * @returns A promise resolving to the refund response details.
     */
    refund: (transactionId, amount) => {
      return this.requestWithMerchantAuth(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount
      });
    },
    /**
     * Retrieve the current exchange rate configured for the merchant.
     *
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the exchange rate response details.
     */
    getExchangeRate: (requestTime) => {
      return this.request(ENDPOINTS.getExchangeRate, filterParams({ req_time: requestTime }), [
        "req_time",
        "merchant_id"
      ]);
    }
  };
  /**
   * Credentials-on-File API helpers.
   */
  credentialsOnFile = {
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
    linkAccount: (params) => {
      return this.request(
        ENDPOINTS.linkAccount,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : void 0,
          token_flag: params.tokenFlag,
          currency: params.currency,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : void 0,
          request_time: params.requestTime
        }),
        [
          "request_time",
          "merchant_id",
          "request_id",
          "ctid",
          "return_deeplink",
          "token_flag",
          "currency",
          "callback_url"
        ],
        "request_time"
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
    linkCard: (params) => {
      return this.request(
        ENDPOINTS.linkCard,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : void 0,
          token_flag: params.tokenFlag,
          frequency: params.frequency,
          return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : void 0,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : void 0,
          request_time: params.requestTime
        }),
        [
          "request_time",
          "merchant_id",
          "request_id",
          "ctid",
          "return_deeplink",
          "token_flag",
          "frequency",
          "return_url",
          "callback_url"
        ],
        "request_time",
        "application/x-www-form-urlencoded"
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
    payment: (params) => {
      return this.request(
        ENDPOINTS.payment,
        filterParams({
          request_id: params.requestId,
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || "USD"),
          ctid: params.ctid,
          pwt: params.paymentToken,
          token_flag: params.tokenFlag,
          currency: params.currency || "USD",
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : void 0,
          request_time: params.requestTime
        }),
        [
          "request_time",
          "merchant_id",
          "request_id",
          "tran_id",
          "amount",
          "ctid",
          "pwt",
          "token_flag",
          "currency",
          "callback_url"
        ],
        "request_time"
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
    renewToken: (params) => {
      return this.request(
        ENDPOINTS.renewToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime
        }),
        ["request_time", "merchant_id", "request_id", "ctid", "pwt"],
        "request_time"
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
    getTokenDetails: (params) => {
      return this.request(
        ENDPOINTS.getTokenDetails,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime
        }),
        ["request_time", "merchant_id", "request_id", "ctid", "pwt"],
        "request_time"
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
    removeToken: (params) => {
      return this.request(
        ENDPOINTS.removeToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime
        }),
        ["request_time", "merchant_id", "request_id", "ctid", "pwt"],
        "request_time"
      );
    }
  };
  /**
   * QR API helpers.
   */
  qr = {
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
    generateQr: (params) => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || "USD");
      validateCurrency(params.currency);
      validatePublicHttpsUrl(params.callbackUrl, "callbackUrl");
      return this.request(
        ENDPOINTS.generateQr,
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || "USD"),
          purchase_type: params.purchaseType || "purchase",
          payment_option: params.paymentOption,
          callback_url: encodeBase64IfNeeded(params.callbackUrl),
          currency: params.currency || "USD",
          qr_image_template: params.qrImageTemplate || "template2",
          req_time: params.requestTime
        }),
        [
          "req_time",
          "merchant_id",
          "tran_id",
          "amount",
          "purchase_type",
          "payment_option",
          "callback_url",
          "currency",
          "qr_image_template"
        ]
      );
    }
  };
  /**
   * Payment Link API helpers.
   */
  paymentLink = {
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
    create: (params) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.createPaymentLink,
        filterParams({
          title: params.title,
          amount: params.amount,
          description: params.description,
          payment_limit: params.paymentLimit,
          return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : void 0,
          merchant_ref_no: params.merchantRefNo,
          expired_date: params.expiredDate
        })
      );
    },
    /**
     * Retrieve status, configuration, and details of a payment link.
     *
     * @param paymentLinkId - The identifier of the payment link.
     * @returns A promise resolving to the payment link configuration and transaction logs.
     */
    getDetails: (paymentLinkId) => {
      return this.requestWithMerchantAuth(ENDPOINTS.getPaymentLinkDetails, { id: paymentLinkId });
    }
  };
  /**
   * Pre-authorization API helpers.
   */
  preAuth = {
    /**
     * Capture funds for an existing pre-authorized transaction.
     *
     * @param transactionId - The transaction ID of the pre-authorized transaction.
     * @param amount - The final amount to capture and capture/settle.
     * @returns A promise resolving to the capture response.
     */
    complete: (transactionId, amount) => {
      return this.requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount
      }, {
        hmacFields: ["merchant_auth", "request_time", "merchant_id"],
        contentType: "application/json"
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
    completeWithPayout: (transactionId, amount, payout) => {
      return this.requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount,
        payout
      }, {
        hmacFields: ["merchant_auth", "request_time", "merchant_id"],
        contentType: "application/json"
      });
    },
    /**
     * Release/void a pre-authorized transaction to unlock customer funds.
     *
     * @param transactionId - The transaction ID of the pre-authorized transaction.
     * @returns A promise resolving to the cancellation/void status response.
     */
    cancel: (transactionId) => {
      return this.requestWithMerchantAuth(ENDPOINTS.cancelPreAuth, { tran_id: transactionId }, {
        hmacFields: ["merchant_id", "merchant_auth", "request_time"],
        contentType: "application/json"
      });
    }
  };
  /**
   * Payout API helpers.
   */
  payout = {
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
    payout: async (params) => {
      if (!this.config.publicKeyPem) {
        throw new PayWayConfigError("publicKeyPem is required for RSA-encrypted endpoints");
      }
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency);
      validateCurrency(params.currency);
      validateBeneficiaries(params.beneficiaries, params.amount, params.currency);
      return this.request(
        ENDPOINTS.payout,
        filterParams({
          tran_id: params.transactionId,
          amount: params.amount,
          beneficiaries: encryptMerchantAuth(params.beneficiaries, this.config.publicKeyPem),
          currency: params.currency,
          custom_fields: params.customFields ? typeof params.customFields === "string" ? params.customFields : JSON.stringify(params.customFields) : void 0
        }),
        ["merchant_id", "tran_id", "beneficiaries", "amount", "custom_fields", "currency"],
        "req_time",
        "application/json",
        "hex"
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
    updateBeneficiaryStatus: (params) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.updateBeneficiaryStatus,
        { payee: params.payee, status: params.status },
        { hmacFields: ["request_time", "merchant_auth"], contentType: "application/json" }
      );
    },
    /**
     * Add and whitelist a new payee account for future payout transactions.
     *
     * @param params - Beneficiary parameters.
     * @param params.payee - The payee account number/identifier.
     * @returns A promise resolving to the whitelisting action response.
     */
    addBeneficiary: (params) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.addBeneficiary,
        { payee: params.payee },
        { hmacFields: ["request_time", "merchant_auth"], contentType: "application/json" }
      );
    }
  };
  /**
   * KHQR-specific API helpers.
   */
  khqr = {
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
    generateOfflineQR: (params) => {
      return generateOfflineQR(params);
    },
    /**
     * Lookup and retrieve KHQR transaction history matching a specific merchant reference.
     *
     * @param merchantRef - The merchant reference number.
     * @param requestTime - Optional custom ISO/request timestamp.
     * @returns A promise resolving to the transaction retrieval response.
     */
    getTransactionsByMerchantRef: (merchantRef, requestTime) => {
      return this.request(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ["req_time", "merchant_id", "merchant_ref"]
      );
    }
  };
};
export {
  PayWay,
  PayWayAPIError,
  PayWayConfigError,
  PayWayError,
  verifyCallbackSignature
};
//# sourceMappingURL=index.js.map