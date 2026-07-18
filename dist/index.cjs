"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/auth.ts
var auth_exports = {};
__export(auth_exports, {
  encryptMerchantAuth: () => encryptMerchantAuth,
  generateHmac: () => generateHmac,
  verifyCallbackSignature: () => verifyCallbackSignature
});
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
var crypto;
var init_auth = __esm({
  "src/auth.ts"() {
    "use strict";
    crypto = __toESM(require("crypto"), 1);
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_TEST_CASES: () => DEFAULT_TEST_CASES,
  PayWay: () => PayWay,
  PayWayAPIError: () => PayWayAPIError,
  PayWayBusinessError: () => PayWayBusinessError,
  PayWayConfigError: () => PayWayConfigError,
  PayWayError: () => PayWayError,
  PayWayNetworkError: () => PayWayNetworkError,
  PayWayRateLimitError: () => PayWayRateLimitError,
  PayWaySignatureError: () => PayWaySignatureError,
  client: () => client,
  formatTestReport: () => formatTestReport,
  generateMockSession: () => generateMockSession,
  getMockPaywayUrl: () => getMockPaywayUrl,
  normalizePaywayResponse: () => normalizePaywayResponse,
  runTestSuite: () => runTestSuite,
  sdk: () => sdk,
  server: () => server,
  startMockPaywayServer: () => startMockPaywayServer,
  stopMockPaywayServer: () => stopMockPaywayServer,
  validateSessionContract: () => validateSessionContract,
  verifyCallbackSignature: () => verifyCallbackSignature
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
init_auth();

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
  purchase: "/api/payment-gateway/v1/payments/purchase",
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
  type;
  constructor(message, type) {
    super(message);
    Object.setPrototypeOf(this, _PayWayError.prototype);
    this.name = "PayWayError";
    this.type = type;
  }
};
var PayWayConfigError = class _PayWayConfigError extends PayWayError {
  constructor(message) {
    super(message, "config_error");
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
  constructor(message, options = {}) {
    super(message, "api_error");
    Object.setPrototypeOf(this, _PayWayAPIError.prototype);
    this.name = "PayWayAPIError";
    this.statusCode = options.statusCode;
    this.paywayCode = options.paywayCode;
    this.rawBody = options.rawBody;
    this.endpoint = options.endpoint;
    this.retryable = options.retryable;
    this.rateLimitInfo = options.rateLimitInfo;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      statusCode: this.statusCode,
      paywayCode: this.paywayCode,
      endpoint: this.endpoint,
      retryable: this.retryable,
      rateLimitInfo: this.rateLimitInfo,
      rawBody: this.rawBody
    };
  }
};
var PayWayBusinessError = class _PayWayBusinessError extends PayWayAPIError {
  constructor(message, options = {}) {
    super(message, options);
    Object.setPrototypeOf(this, _PayWayBusinessError.prototype);
    this.name = "PayWayBusinessError";
    this.type = "business_error";
  }
};
var PayWayNetworkError = class _PayWayNetworkError extends PayWayAPIError {
  constructor(message, options = {}) {
    super(message, { ...options, retryable: true });
    Object.setPrototypeOf(this, _PayWayNetworkError.prototype);
    this.name = "PayWayNetworkError";
    this.type = "network_error";
  }
};
var PayWayRateLimitError = class _PayWayRateLimitError extends PayWayAPIError {
  constructor(message, options = {}) {
    super(message, { ...options, retryable: true });
    Object.setPrototypeOf(this, _PayWayRateLimitError.prototype);
    this.name = "PayWayRateLimitError";
    this.type = "rate_limit_error";
  }
};
var PayWaySignatureError = class _PayWaySignatureError extends PayWayAPIError {
  constructor(message, options = {}) {
    super(message, options);
    Object.setPrototypeOf(this, _PayWaySignatureError.prototype);
    this.name = "PayWaySignatureError";
    this.type = "signature_error";
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
var SENSITIVE_LOG_KEYS = /* @__PURE__ */ new Set([
  "api_key",
  "apikey",
  "hash",
  "merchant_auth",
  "password",
  "pwt",
  "payment_token",
  "authorization",
  "x-payway-hmac-sha512",
  "publickeypem",
  "card_number",
  "cvv",
  "google_pay_token"
]);
function sanitizeForLog(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }
  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_LOG_KEYS.has(key.toLowerCase()) ? "***HIDDEN***" : sanitizeForLog(nestedValue);
  }
  return sanitized;
}

// src/domains/checkout.ts
init_auth();
function createCheckoutDomain(config, request, requestWithMerchantAuth) {
  function buildPurchasePayload(params) {
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
      merchant_id: config.merchantId
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
    const hash = generateHmac(payload, fields, config.apiKey);
    return { ...payload, hash };
  }
  return {
    createTransaction: (params) => {
      return buildPurchasePayload(params);
    },
    purchase: (params) => {
      const payload = buildPurchasePayload(params);
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
      return request(
        ENDPOINTS.purchase,
        payload,
        fields,
        "req_time",
        "application/json"
      );
    },
    /**
     * Check an existing transaction.
     * @rateLimit 600 requests per second.
     */
    checkTransaction: (transactionId, requestTime) => {
      return request(
        ENDPOINTS.checkTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ["req_time", "merchant_id", "tran_id"]
      );
    },
    closeTransaction: (transactionId, requestTime) => {
      return request(
        ENDPOINTS.closeTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ["req_time", "merchant_id", "tran_id"]
      );
    },
    /**
     * Get detailed transaction information.
     * @rateLimit 10 requests per minute. This PayWay limit cannot be increased.
     */
    getTransactionDetail: (transactionId, requestTime) => {
      return request(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ["req_time", "merchant_id", "tran_id"]
      );
    },
    /**
     * List transactions that match the supplied filters.
     * @rateLimit 50 requests per minute.
     */
    getTransactionList: (params) => {
      return request(
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
     * Refund a completed transaction.
     * @rateLimit 500 requests per second.
     */
    refund: (transactionId, amount) => {
      return requestWithMerchantAuth(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount
      });
    },
    getExchangeRate: (requestTime) => {
      return request(
        ENDPOINTS.getExchangeRate,
        filterParams({ req_time: requestTime }),
        ["req_time", "merchant_id"]
      );
    }
  };
}

// src/domains/credentials-on-file.ts
function createCredentialsOnFileDomain(_config, request) {
  return {
    linkAccount: (params) => {
      if (typeof params.requestId !== "string" || params.requestId.trim().length === 0) {
        throw new PayWayConfigError("requestId is required and must be a non-empty string");
      }
      if (params.currency) {
        validateCurrency(params.currency);
      }
      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, "callbackUrl");
      }
      return request(
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
    linkCard: (params) => {
      if (typeof params.requestId !== "string" || params.requestId.trim().length === 0) {
        throw new PayWayConfigError("requestId is required and must be a non-empty string");
      }
      if (params.returnUrl) {
        validatePublicHttpsUrl(params.returnUrl, "returnUrl");
      }
      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, "callbackUrl");
      }
      return request(
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
    payment: (params) => {
      if (typeof params.requestId !== "string" || params.requestId.trim().length === 0) {
        throw new PayWayConfigError("requestId is required and must be a non-empty string");
      }
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || "USD");
      validateCurrency(params.currency);
      if (typeof params.paymentToken !== "string" || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError("paymentToken is required for Cof payments");
      }
      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, "callbackUrl");
      }
      return request(
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
    renewToken: (params) => {
      if (typeof params.requestId !== "string" || params.requestId.trim().length === 0) {
        throw new PayWayConfigError("requestId is required and must be a non-empty string");
      }
      if (typeof params.ctid !== "string" || params.ctid.trim().length === 0) {
        throw new PayWayConfigError("ctid is required and must be a non-empty string");
      }
      if (typeof params.paymentToken !== "string" || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError("paymentToken is required");
      }
      return request(
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
    getTokenDetails: (params) => {
      if (typeof params.requestId !== "string" || params.requestId.trim().length === 0) {
        throw new PayWayConfigError("requestId is required and must be a non-empty string");
      }
      if (typeof params.ctid !== "string" || params.ctid.trim().length === 0) {
        throw new PayWayConfigError("ctid is required and must be a non-empty string");
      }
      if (typeof params.paymentToken !== "string" || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError("paymentToken is required");
      }
      return request(
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
    removeToken: (params) => {
      if (typeof params.requestId !== "string" || params.requestId.trim().length === 0) {
        throw new PayWayConfigError("requestId is required and must be a non-empty string");
      }
      if (typeof params.ctid !== "string" || params.ctid.trim().length === 0) {
        throw new PayWayConfigError("ctid is required and must be a non-empty string");
      }
      if (typeof params.paymentToken !== "string" || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError("paymentToken is required");
      }
      return request(
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

// src/domains/qr.ts
function createQrDomain(_config, request) {
  return {
    generateQr: (params) => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || "USD");
      validateCurrency(params.currency);
      validatePublicHttpsUrl(params.callbackUrl, "callbackUrl");
      return request(
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
    },
    generateOfflineQR: (params) => {
      return generateOfflineQR(params);
    }
  };
}

// src/domains/payment-link.ts
function createPaymentLinkDomain(_config, requestWithMerchantAuth) {
  return {
    create: (params) => {
      if (typeof params.title !== "string" || params.title.trim().length === 0) {
        throw new PayWayConfigError("title is required and must be a non-empty string");
      }
      if (!Number.isFinite(params.amount) || params.amount <= 0) {
        throw new PayWayConfigError("amount must be a positive number");
      }
      if (typeof params.merchantRefNo !== "string" || params.merchantRefNo.trim().length === 0) {
        throw new PayWayConfigError("merchantRefNo is required and must be a non-empty string");
      }
      if (params.returnUrl) {
        validatePublicHttpsUrl(params.returnUrl, "returnUrl");
      }
      return requestWithMerchantAuth(
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
    getDetails: (paymentLinkId) => {
      return requestWithMerchantAuth(
        ENDPOINTS.getPaymentLinkDetails,
        { id: paymentLinkId }
      );
    }
  };
}

// src/domains/pre-auth.ts
function createPreAuthDomain(requestWithMerchantAuth) {
  return {
    complete: (transactionId, amount) => {
      validateTransactionId(transactionId);
      validatePositiveAmount(amount, "USD");
      return requestWithMerchantAuth(
        ENDPOINTS.completePreAuth,
        {
          tran_id: transactionId,
          complete_amount: amount
        },
        {
          hmacFields: ["merchant_auth", "request_time", "merchant_id"],
          contentType: "application/json"
        }
      );
    },
    completeWithPayout: (transactionId, amount, payout) => {
      validateTransactionId(transactionId);
      validatePositiveAmount(amount, "USD");
      if (!Array.isArray(payout) || payout.length === 0) {
        throw new PayWayConfigError("payout must be a non-empty array");
      }
      return requestWithMerchantAuth(
        ENDPOINTS.completePreAuth,
        {
          tran_id: transactionId,
          complete_amount: amount,
          payout
        },
        {
          hmacFields: ["merchant_auth", "request_time", "merchant_id"],
          contentType: "application/json"
        }
      );
    },
    cancel: (transactionId) => {
      return requestWithMerchantAuth(
        ENDPOINTS.cancelPreAuth,
        { tran_id: transactionId },
        {
          hmacFields: ["merchant_id", "merchant_auth", "request_time"],
          contentType: "application/json"
        }
      );
    }
  };
}

// src/domains/payout.ts
init_auth();
function createPayoutDomain(config, request, requestWithMerchantAuth) {
  return {
    payout: async (params) => {
      if (!config.publicKeyPem) {
        throw new PayWayConfigError("publicKeyPem is required for RSA-encrypted endpoints");
      }
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency);
      validateCurrency(params.currency);
      validateBeneficiaries(params.beneficiaries, params.amount, params.currency);
      return request(
        ENDPOINTS.payout,
        filterParams({
          tran_id: params.transactionId,
          amount: params.amount,
          beneficiaries: encryptMerchantAuth(params.beneficiaries, config.publicKeyPem),
          currency: params.currency,
          custom_fields: params.customFields ? typeof params.customFields === "string" ? params.customFields : JSON.stringify(params.customFields) : void 0
        }),
        ["merchant_id", "tran_id", "beneficiaries", "amount", "custom_fields", "currency"],
        "req_time",
        "application/json",
        "hex"
      );
    },
    updateBeneficiaryStatus: (params) => {
      return requestWithMerchantAuth(
        ENDPOINTS.updateBeneficiaryStatus,
        { payee: params.payee, status: params.status },
        { hmacFields: ["request_time", "merchant_auth"], contentType: "application/json" }
      );
    },
    addBeneficiary: (params) => {
      return requestWithMerchantAuth(
        ENDPOINTS.addBeneficiary,
        { payee: params.payee },
        { hmacFields: ["request_time", "merchant_auth"], contentType: "application/json" }
      );
    }
  };
}

// src/domains/khqr.ts
function createKhqrDomain(_config, request) {
  return {
    generateOfflineQR: (params) => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency);
      validateCurrency(params.currency);
      if (typeof params.merchantId !== "string" || params.merchantId.length === 0) {
        throw new Error("merchantId is required for offline QR generation");
      }
      return generateOfflineQR(params);
    },
    getTransactionsByMerchantRef: (merchantRef, requestTime) => {
      if (typeof merchantRef !== "string" || merchantRef.trim().length === 0) {
        throw new Error("merchantRef is required and must be a non-empty string");
      }
      return request(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ["req_time", "merchant_id", "merchant_ref"]
      );
    }
  };
}

// src/client.ts
init_auth();
function checkResponseError(body, endpoint) {
  if (!body || typeof body !== "object") {
    return;
  }
  const resp = body;
  if (resp.status && typeof resp.status === "object") {
    const statusObj = resp.status;
    const code = String(statusObj.code ?? "");
    const message = String(statusObj.message ?? "Unknown PayWay API Error");
    if (code !== "0" && code !== "00" && code !== "") {
      throw new PayWayBusinessError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
        retryable: false
      });
    }
  }
  if (typeof resp.status === "string") {
    const statusStr = resp.status.toUpperCase();
    if (statusStr === "FAILED" || statusStr === "ERROR") {
      const code = resp.code !== void 0 ? String(resp.code) : void 0;
      const message = String(resp.message ?? "Unknown PayWay API Error");
      throw new PayWayBusinessError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
        retryable: false
      });
    }
  }
  if (resp.code !== void 0 && resp.code !== null && typeof resp.code !== "object") {
    const code = String(resp.code);
    const message = String(resp.message ?? "Unknown PayWay API Error");
    if (code !== "0" && code !== "00") {
      throw new PayWayBusinessError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint,
        retryable: false
      });
    }
  }
}
function isAbortError(error) {
  if (typeof error !== "object" || error === null) return false;
  const e = error;
  return e.name === "AbortError" || e.code === "ABORT_ERR";
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
  const message = `HTTP Error: ${response.status} ${response.statusText}`;
  if (response.status === 429) {
    return new PayWayRateLimitError(message, {
      statusCode: response.status,
      rawBody,
      endpoint,
      rateLimitInfo,
      retryable: true
    });
  }
  return new PayWayAPIError(message, {
    statusCode: response.status,
    rawBody,
    endpoint,
    rateLimitInfo,
    retryable: response.status >= 500
  });
}
function createJsonParseError(rawBody, endpoint) {
  return new PayWayAPIError("Invalid JSON response from PayWay API", {
    rawBody,
    endpoint,
    retryable: false
  });
}
function createNetworkError(error, timeoutMs, endpoint) {
  if (isAbortError(error)) {
    return new PayWayNetworkError(`Request timed out after ${timeoutMs}ms`, {
      rawBody: error,
      endpoint,
      retryable: true
    });
  }
  const message = error !== null && typeof error === "object" ? String(error.message ?? "Unknown network failure") : "Unknown network failure";
  return new PayWayNetworkError(`Network error: ${message}`, {
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
  const remaining = parseHeaderNumber(headers, [
    "x-rate-limit-remaining",
    "ratelimit-remaining",
    "rate-limit-remaining"
  ]);
  const reset = parseHeaderNumber(headers, ["x-rate-limit-reset", "ratelimit-reset", "rate-limit-reset"]);
  const retryAfter = parseHeaderNumber(headers, ["retry-after", "x-retry-after"]);
  if (limit === void 0 && remaining === void 0 && reset === void 0 && retryAfter === void 0) {
    return void 0;
  }
  const rawHeaders = {};
  for (const key of [
    "x-rate-limit-limit",
    "x-rate-limit-remaining",
    "x-rate-limit-reset",
    "retry-after",
    "x-retry-after"
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
    rawHeaders
  };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseDebugRequestBody(bodyPayload) {
  try {
    return JSON.parse(bodyPayload);
  } catch {
    if (bodyPayload.includes("=")) {
      return Object.fromEntries(new URLSearchParams(bodyPayload));
    }
    return bodyPayload.slice(0, 200);
  }
}
var PayWay = class _PayWay {
  config;
  baseUrl;
  rateLimitRules;
  rateLimitState = /* @__PURE__ */ new Map();
  // --- Sub-Clients ---
  checkout;
  credentialsOnFile;
  qr;
  paymentLink;
  preAuth;
  payout;
  khqr;
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
  constructor(config = {}) {
    this.config = _PayWay.resolveConfig(config);
    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    } else {
      const env = this.config.environment || "sandbox";
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
      ...this.config.rateLimitRules ?? {}
    };
    this.checkout = createCheckoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.credentialsOnFile = createCredentialsOnFileDomain(this.config, this.request.bind(this));
    this.qr = createQrDomain(this.config, this.request.bind(this));
    this.paymentLink = createPaymentLinkDomain(this.config, this.requestWithMerchantAuth.bind(this));
    this.preAuth = createPreAuthDomain(this.requestWithMerchantAuth.bind(this));
    this.payout = createPayoutDomain(this.config, this.request.bind(this), this.requestWithMerchantAuth.bind(this));
    this.khqr = createKhqrDomain(this.config, this.request.bind(this));
  }
  static resolveConfig(config) {
    if (config === null) {
      throw new PayWayConfigError("Config object is required");
    }
    const environmentFromEnv = process.env.PAYWAY_SANDBOX === "true" ? "sandbox" : process.env.PAYWAY_SANDBOX === "false" ? "production" : void 0;
    const timeoutFromEnv = Number.parseInt(process.env.PAYWAY_TIMEOUT ?? "", 10);
    const debugFromEnv = process.env.DEBUG_PAYWAY === "true" || process.env.DEBUG_PAYWAY === "1";
    const resolvedConfig = {
      ...config,
      merchantId: config.merchantId ?? process.env.PAYWAY_MERCHANT_ID ?? "",
      apiKey: config.apiKey ?? process.env.PAYWAY_API_KEY ?? "",
      publicKeyPem: config.publicKeyPem ?? process.env.PAYWAY_RSA_PUBLIC_KEY,
      environment: config.environment ?? environmentFromEnv,
      baseUrl: config.baseUrl ?? process.env.PAYWAY_BASE_URL,
      timeout: config.timeout ?? (Number.isNaN(timeoutFromEnv) ? void 0 : timeoutFromEnv),
      debug: config.debug ?? debugFromEnv
    };
    if (!resolvedConfig.merchantId) {
      throw new PayWayConfigError("merchantId is required");
    }
    if (!resolvedConfig.apiKey) {
      throw new PayWayConfigError("apiKey is required");
    }
    if (!resolvedConfig.debug) {
      return resolvedConfig;
    }
    const onRequest = resolvedConfig.onRequest;
    const onResponse = resolvedConfig.onResponse;
    return {
      ...resolvedConfig,
      onRequest: (endpoint, bodyPayload) => {
        console.debug(`[payway] -> POST ${endpoint}`, sanitizeForLog(parseDebugRequestBody(bodyPayload)));
        onRequest?.(endpoint, bodyPayload);
      },
      onResponse: (endpoint, statusCode, body, rateLimitInfo) => {
        console.debug(`[payway] <- ${statusCode} ${endpoint}`, sanitizeForLog(body), rateLimitInfo);
        onResponse?.(endpoint, statusCode, body, rateLimitInfo);
      }
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
          const rateLimitInfo = paywayError.rateLimitInfo;
          const retryAfterMs = rateLimitInfo?.retryAfterMs;
          const waitMs = isRateLimitError && typeof retryAfterMs === "number" ? retryAfterMs : retryDelayMs * 2 ** attempt;
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
    const merchantAuth = (await Promise.resolve().then(() => (init_auth(), auth_exports))).encryptMerchantAuth(
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
    let bodyPayload;
    if (contentType === "application/json") {
      bodyPayload = JSON.stringify(body);
    } else {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== void 0 && value !== null) {
          form.append(key, String(value));
        }
      }
      bodyPayload = form.toString();
    }
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
      const statusObj = rawBody.status;
      const code = statusObj?.code ?? rawBody.code ?? maybeError.paywayCode;
      const message = statusObj?.message ?? rawBody.message ?? maybeError.message;
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
};

// src/server/index.ts
function normalizePaywayResponse(raw, sessionId, lifetimeMinutes) {
  const expiresAt = new Date(
    Date.now() + (lifetimeMinutes ?? 60) * 60 * 1e3
  ).toISOString();
  if (typeof raw === "string") {
    return {
      sessionId,
      status: "pending",
      responseType: "html",
      responsePayload: raw,
      expiresAt,
      raw
    };
  }
  if (raw !== null && typeof raw === "object") {
    const obj = raw;
    if (obj.status && typeof obj.status === "object") {
      const status = obj.status;
      const code = String(status.code ?? "");
      if (code !== "0" && code !== "00" && code !== "") {
        return {
          sessionId,
          status: "failed",
          responseType: "html",
          responsePayload: "",
          expiresAt,
          raw
        };
      }
    }
    let responseType = "html";
    let responsePayload = "";
    if (typeof obj.abapay_deeplink === "string" && obj.abapay_deeplink) {
      responseType = "deeplink";
      responsePayload = obj.abapay_deeplink;
    } else if (typeof obj.qr_string === "string" && obj.qr_string) {
      responseType = "qr_string";
      responsePayload = obj.qr_string;
    } else if (typeof obj.checkout_qr_url === "string" && obj.checkout_qr_url) {
      responseType = "qr_image";
      responsePayload = obj.checkout_qr_url;
    } else if (typeof obj.qrString === "string" && obj.qrString) {
      responseType = "qr_string";
      responsePayload = obj.qrString;
    } else if (typeof obj.url === "string" && obj.url) {
      responseType = "url";
      responsePayload = obj.url;
    }
    return {
      sessionId,
      status: "pending",
      responseType,
      responsePayload,
      expiresAt,
      raw
    };
  }
  return {
    sessionId,
    status: "failed",
    responseType: "html",
    responsePayload: "",
    expiresAt,
    raw
  };
}
function generateSessionId(transactionId) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `tx_${stamp}_${transactionId}_${rand}`;
}
var server = {
  /**
   * Initiate a PayWay purchase transaction.
   *
   * This function is importable and callable by any server function
   * (REST endpoints, GraphQL resolvers, webhook handlers). It handles
   * authentication, payload validation, and submission to PayWay's API,
   * returning a standardized `TransactionSession` for the client to process.
   *
   * @param payload - Merchant-friendly purchase parameters.
   * @param config  - PayWay credentials and environment.
   * @returns A standardized `TransactionSession` object.
   */
  async initiateTransaction(payload, config) {
    if (!payload || typeof payload !== "object") {
      throw new PayWayConfigError("payload is required");
    }
    if (!payload.transactionId) {
      throw new PayWayConfigError("payload.transactionId is required");
    }
    if (payload.amount === void 0 || payload.amount === null) {
      throw new PayWayConfigError("payload.amount is required");
    }
    const payway = new PayWay(config);
    const sessionId = generateSessionId(payload.transactionId);
    const raw = await payway.checkout.purchase({
      transactionId: payload.transactionId,
      amount: payload.amount,
      currency: payload.currency,
      firstname: payload.firstname,
      lastname: payload.lastname,
      email: payload.email,
      phone: payload.phone,
      paymentOption: payload.paymentOption,
      shipping: payload.shipping,
      items: payload.items,
      returnUrl: payload.returnUrl,
      cancelUrl: payload.cancelUrl,
      viewType: payload.viewType,
      lifetime: payload.lifetime
    });
    return normalizePaywayResponse(raw, sessionId, payload.lifetime);
  },
  /**
   * Simulate a purchase without requiring the merchant to write fetch/axios
   * boilerplate. This generates a mock `TransactionSession` for each of the
   * 5 response types so the merchant can verify their server wiring and the
   * client rendering without hitting the real PayWay API.
   *
   * @param responseType - Which mock response type to generate. Defaults to 'qr_string'.
   * @param payload     - Optional transaction details to embed in the mock.
   * @returns A mock `TransactionSession` object.
   */
  test(responseType = "qr_string", payload = {}) {
    const transactionId = payload.transactionId ?? `mock-${Date.now()}`;
    const sessionId = generateSessionId(transactionId);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1e3).toISOString();
    const payloads = {
      deeplink: `ababank://pay?tran_id=${transactionId}&amount=${payload.amount ?? 10}`,
      qr_string: "00020101021226360016ABA PAYWAY5204599953038405802KH5910Test Merchant6009Phnom Penh6304ABCD",
      qr_image: `https://checkout-sandbox.payway.com.kh/qr/${transactionId}.png`,
      url: `https://checkout-sandbox.payway.com.kh/pay/${transactionId}`,
      html: `<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1><p>Tran: ${transactionId}</p></body></html>`
    };
    return {
      sessionId,
      status: "pending",
      responseType,
      responsePayload: payloads[responseType],
      expiresAt,
      raw: { mock: true, transactionId, responseType, ...payload }
    };
  }
};

// src/client-handler/index.ts
function resolveTarget(target) {
  if (!target) return null;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
    return target;
  }
  if (typeof target === "string" && typeof document !== "undefined") {
    return document.querySelector(target);
  }
  return null;
}
function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
async function renderQrString(payload, target) {
  const QRCode = (await import("qrcode")).default;
  if (target) {
    target.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "PayWay QR code");
    canvas.style.maxWidth = "100%";
    canvas.style.height = "auto";
    target.appendChild(canvas);
    await QRCode.toCanvas(canvas, payload, { width: 256, margin: 2 });
    return "qr_rendered";
  }
  const dataUrl = await QRCode.toDataURL(payload, { width: 256, margin: 2 });
  if (isBrowser()) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `payway-qr-${Date.now()}.png`;
    link.click();
  }
  return "qr_download_prompted";
}
function renderQrImage(payload, target) {
  if (!isBrowser()) {
    return "qr_image_skipped_no_dom";
  }
  if (target) {
    target.innerHTML = "";
    const img = document.createElement("img");
    img.src = payload;
    img.alt = "PayWay QR code";
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    target.appendChild(img);
    return "qr_image_rendered";
  }
  const link = document.createElement("a");
  link.href = payload;
  link.download = `payway-qr-${Date.now()}.png`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
  return "qr_image_download_prompted";
}
function triggerDeeplink(payload, openInNewTab) {
  if (!isBrowser()) {
    return "deeplink_skipped_no_dom";
  }
  if (openInNewTab) {
    const win = window.open(payload, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = payload;
      return "deeplink_redirect_same_tab";
    }
    return "deeplink_opened_new_tab";
  }
  window.location.href = payload;
  return "deeplink_redirect";
}
function redirectUrl(payload, openInNewTab) {
  if (!isBrowser()) {
    return "url_redirect_skipped_no_dom";
  }
  if (openInNewTab) {
    const win = window.open(payload, "_blank", "noopener,noreferrer");
    if (!win) {
      window.location.href = payload;
      return "url_redirect_same_tab";
    }
    return "url_opened_new_tab";
  }
  window.location.href = payload;
  return "url_redirect";
}
function embedHtml(payload, target) {
  if (!isBrowser()) {
    return "html_embed_skipped_no_dom";
  }
  if (!target) {
    throw new Error(
      "PayWay SDK: an HTML response requires an explicit `target` element. Refusing to overwrite document.body."
    );
  }
  target.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  iframe.setAttribute("title", "PayWay hosted checkout");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.minHeight = "600px";
  iframe.srcdoc = payload;
  target.appendChild(iframe);
  return "html_embedded";
}
var client = {
  /**
   * Consume a `TransactionSession` and dynamically handle its response type
   * without manual intervention by the merchant.
   *
   * @param session  - The `TransactionSession` from the server module.
   * @param options  - Optional rendering/redirect options.
   * @returns A `HandleResponseResult` describing the action taken.
   */
  async handleResponse(session, options = {}) {
    const target = resolveTarget(options.target);
    try {
      let action = "";
      switch (session.responseType) {
        case "deeplink":
          action = triggerDeeplink(session.responsePayload, options.openInNewTab);
          break;
        case "qr_string":
          action = await renderQrString(session.responsePayload, target);
          break;
        case "qr_image":
          action = renderQrImage(session.responsePayload, target);
          break;
        case "url":
          action = redirectUrl(session.responsePayload, options.openInNewTab);
          break;
        case "html":
          action = embedHtml(session.responsePayload, target);
          break;
        default:
          throw new Error(`Unsupported responseType: ${session.responseType}`);
      }
      const result = {
        action,
        success: true,
        session
      };
      try {
        options.onHandled?.(session, action);
      } catch {
      }
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      try {
        options.onError?.(err, session);
      } catch {
      }
      return {
        action: "error",
        success: false,
        session
      };
    }
  }
};

// src/test/index.ts
var import_node_http = require("http");
var DEFAULT_TEST_CASES = [
  {
    name: "Deeplink redirect",
    responseType: "deeplink",
    description: "Verifies that a deeplink response triggers a native app redirect."
  },
  {
    name: "QR string render",
    responseType: "qr_string",
    description: "Verifies that a raw KHQR string is rendered into a QR code."
  },
  {
    name: "QR image render",
    responseType: "qr_image",
    description: "Verifies that a QR image URL is rendered into a target element."
  },
  {
    name: "Checkout URL redirect",
    responseType: "url",
    description: "Verifies that a checkout URL triggers a browser redirect."
  },
  {
    name: "HTML snippet embed",
    responseType: "html",
    description: "Verifies that an HTML hosted checkout page is safely embedded."
  }
];
function generateMockSession(responseType, transactionId = `test-${Date.now()}`) {
  const sessionId = `tx_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1e3).toISOString();
  const payloads = {
    deeplink: `ababank://pay?tran_id=${transactionId}&amount=10`,
    qr_string: "00020101021226360016ABA PAYWAY5204599953038405802KH5910Test Merchant6009Phnom Penh6304ABCD",
    qr_image: `https://checkout-sandbox.payway.com.kh/qr/${transactionId}.png`,
    url: `https://checkout-sandbox.payway.com.kh/pay/${transactionId}`,
    html: `<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1><p>Tran: ${transactionId}</p></body></html>`
  };
  return {
    sessionId,
    status: "pending",
    responseType,
    responsePayload: payloads[responseType],
    expiresAt,
    raw: { mock: true, transactionId, responseType }
  };
}
function validateSessionContract(session) {
  if (!session || typeof session !== "object") {
    return "session must be an object";
  }
  const s = session;
  if (typeof s.sessionId !== "string" || !s.sessionId) {
    return "sessionId must be a non-empty string";
  }
  if (s.status !== "pending" && s.status !== "completed" && s.status !== "failed") {
    return `status must be 'pending' | 'completed' | 'failed', got: ${String(s.status)}`;
  }
  const validTypes = ["deeplink", "qr_string", "qr_image", "url", "html"];
  if (typeof s.responseType !== "string" || !validTypes.includes(s.responseType)) {
    return `responseType must be one of ${validTypes.join(", ")}, got: ${String(s.responseType)}`;
  }
  if (typeof s.responsePayload !== "string") {
    return "responsePayload must be a string";
  }
  if (typeof s.expiresAt !== "string" || Number.isNaN(Date.parse(s.expiresAt))) {
    return "expiresAt must be a valid ISO-8601 timestamp";
  }
  return null;
}
function startMockPaywayServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server2 = (0, import_node_http.createServer)((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.url === "/mock/html") {
        const html = "<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1><p>Mock html response.</p></body></html>";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (req.url === "/api/payment-gateway/v1/payments/purchase") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          let tranId = "";
          try {
            const parsed = JSON.parse(body);
            tranId = typeof parsed.tran_id === "string" ? parsed.tran_id : "";
          } catch {
          }
          const knownTypes = ["deeplink", "qr_string", "qr_image", "url"];
          const matched = knownTypes.find((t) => tranId.startsWith(`e2e-${t}-`));
          const responseType = matched ?? "qr_string";
          const addr = server2.address();
          const port2 = addr?.port ?? 0;
          const envelope = {
            status: { code: "00", message: "Approved" },
            tran_id: tranId || "mock"
          };
          switch (responseType) {
            case "deeplink":
              envelope.abapay_deeplink = `ababank://pay?tran_id=${tranId}`;
              envelope.qr_string = "00020101021226360016ABA PAYWAYMOCK0208DEEPLINK6304ABCD";
              break;
            case "qr_string":
              envelope.qr_string = "00020101021226360016ABA PAYWAYMOCK0208QRSTRING6304ABCD";
              break;
            case "qr_image":
              envelope.checkout_qr_url = `http://127.0.0.1:${port2}/mock/qr.png`;
              break;
            case "url":
              envelope.url = `http://127.0.0.1:${port2}/mock/checkout/${tranId}`;
              break;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(envelope));
        });
        return;
      }
      if (req.url === "/mock/qr.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
            "base64"
          )
        );
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });
    server2.on("error", reject);
    server2.listen(port, "127.0.0.1", () => resolve(server2));
  });
}
function getMockPaywayUrl(server2) {
  const addr = server2.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Mock PayWay server has no bound address");
  }
  return `http://127.0.0.1:${addr.port}`;
}
function stopMockPaywayServer(server2) {
  return new Promise((resolve) => {
    server2.close(() => resolve());
  });
}
async function runTestSuite(deps, cases = DEFAULT_TEST_CASES) {
  const results = [];
  for (const tc of cases) {
    const start = Date.now();
    try {
      const initiated = await deps.initiate(
        {
          transactionId: `e2e-${tc.responseType}-${Date.now()}`,
          amount: 10,
          paymentOption: tc.responseType === "deeplink" ? "abapay_khqr_deeplink" : void 0
        },
        { responseType: tc.responseType }
      );
      const initiatedError = validateSessionContract(initiated);
      if (initiatedError) {
        throw new Error(`Module 1 contract violation: ${initiatedError}`);
      }
      if (initiated.responseType !== tc.responseType) {
        throw new Error(
          `Module 1 produced responseType="${initiated.responseType}" but the test case expected "${tc.responseType}"`
        );
      }
      const handled = await deps.handle(initiated, { target: void 0 });
      if (!handled.success) {
        throw new Error(`Handler returned failure: action=${handled.action}`);
      }
      const action = handled.action;
      const expectedActions = {
        deeplink: ["deeplink_redirect", "deeplink_opened_new_tab", "deeplink_redirect_same_tab", "deeplink_skipped_no_dom"],
        qr_string: ["qr_rendered", "qr_download_prompted"],
        qr_image: ["qr_image_rendered", "qr_image_download_prompted", "qr_image_skipped_no_dom"],
        url: ["url_redirect", "url_opened_new_tab", "url_redirect_same_tab", "url_redirect_skipped_no_dom"],
        html: ["html_embedded", "html_embed_skipped_no_dom"]
      };
      if (!expectedActions[tc.responseType].includes(action)) {
        throw new Error(
          `Unexpected action for ${tc.responseType}: got "${action}", expected one of ${expectedActions[tc.responseType].join(", ")}`
        );
      }
      const durationMs = Date.now() - start;
      results.push({
        name: tc.name,
        passed: true,
        message: `${tc.description} -> action="${action}"`,
        durationMs
      });
    } catch (error) {
      const durationMs = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name: tc.name,
        passed: false,
        message: `${tc.description} -> FAILED: ${message}`,
        durationMs
      });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return {
    total: results.length,
    passed,
    failed,
    results,
    success: failed === 0
  };
}
function formatTestReport(report) {
  const lines = [
    "",
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
    "  PayWay SDK \u2014 Test Suite Report",
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
    ""
  ];
  for (const r of report.results) {
    const icon = r.passed ? "\u2705" : "\u274C";
    lines.push(`  ${icon} ${r.name} (${r.durationMs}ms)`);
    lines.push(`     ${r.message}`);
    lines.push("");
  }
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  lines.push(`  Total: ${report.total}  |  Passed: ${report.passed}  |  Failed: ${report.failed}`);
  lines.push(`  Result: ${report.success ? "\u2705 ALL PASSED" : "\u274C FAILURES DETECTED"}`);
  lines.push("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  lines.push("");
  return lines.join("\n");
}

// src/sdk.ts
var sdk = {
  /**
   * Server-side module namespace (Module 1).
   * Exposed for merchants who want direct access to the initiator.
   */
  server: {
    /**
     * Initiate a PayWay purchase transaction.
     * @param payload - Merchant-friendly purchase parameters.
     * @param config  - PayWay credentials and environment.
     * @returns A standardized `TransactionSession` object.
     */
    initiateTransaction(payload, config) {
      return server.initiateTransaction(payload, config);
    },
    /**
     * Simulate a purchase without hitting the real PayWay API.
     * @param responseType - Which mock response type to generate.
     * @param payload      - Optional transaction details.
     * @returns A mock `TransactionSession` object.
     */
    test(responseType = "qr_string", payload) {
      return server.test(responseType, payload);
    }
  },
  /**
   * Client-side module namespace (Module 2).
   * Exposed for merchants who want direct access to the response handler.
   */
  client: {
    /**
     * Handle a PayWay response. Auto-detects the response type and performs
     * the correct UX action — no merchant logic required.
     * @param session  - The `TransactionSession` from the server module.
     * @param options  - Optional rendering/redirect options.
     * @returns A `HandleResponseResult` describing the action taken.
     */
    handleResponse(session, options) {
      return client.handleResponse(session, options);
    }
  },
  /**
   * Initiate a PayWay purchase transaction (Server module).
   *
   * Convenience alias for `sdk.server.initiateTransaction()`.
   *
   * @param payload - Merchant-friendly purchase parameters.
   * @param config  - PayWay credentials and environment.
   * @returns A standardized `TransactionSession` object.
   */
  initiate(payload, config) {
    return server.initiateTransaction(payload, config);
  },
  /**
   * Handle a PayWay response (Client module). Auto-detects the response
   * type and performs the correct UX action — no merchant logic required.
   *
   * @param session  - The `TransactionSession` from `sdk.initiate()`.
   * @param options  - Optional rendering/redirect options.
   * @returns A `HandleResponseResult` describing the action taken.
   */
  handle(session, options) {
    return client.handleResponse(session, options);
  },
  /**
   * Simulate a purchase without hitting the real PayWay API (Server module).
   * Generates a mock `TransactionSession` for any of the 5 response types.
   *
   * @param responseType - Which mock response type to generate.
   * @param payload      - Optional transaction details.
   * @returns A mock `TransactionSession` object.
   */
  test(responseType = "qr_string", payload) {
    return server.test(responseType, payload);
  },
  /**
   * Run the zero-code test suite (Test module). Wires Module 1 and Module 2
   * into Module 3's harness and runs all 5 response-type scenarios.
   *
   * The suite spins up a real HTTP mock PayWay server, points the real
   * `server.initiateTransaction()` at it via `baseUrl`, and drives four of
   * the five response types through the full Module 1 pipeline (HTTP →
   * PayWay client → normalise → contract). The `html` case bypasses the
   * PayWay HTTP client (which only decodes JSON) and feeds a raw HTML body
   * directly to `normalizePaywayResponse` — still exercising Module 1's
   * normalisation code.
   *
   * @returns A `TestSuiteReport` with per-case pass/fail results.
   */
  async runTestSuite() {
    const mockServer = await startMockPaywayServer(0);
    const mockUrl = getMockPaywayUrl(mockServer);
    const mockConfig = {
      merchantId: "mock-merchant",
      apiKey: "mock-api-key",
      environment: "sandbox",
      baseUrl: mockUrl
    };
    try {
      return await runTestSuite({
        // Module 1: use the real initiator for all types except `html`,
        // which the underlying PayWay client can't decode.
        initiate: async (payload, config) => {
          const cfg = config;
          const type = cfg?.responseType;
          if (type === "html") {
            const res = await fetch(`${mockUrl}/mock/html`);
            if (!res.ok) {
              throw new Error(`Mock /mock/html returned ${res.status}`);
            }
            const html = await res.text();
            const sessionId = `tx_${Date.now().toString(36)}_${payload.transactionId}`;
            return normalizePaywayResponse(html, sessionId, payload.lifetime);
          }
          const paymentOption = type === "deeplink" ? "abapay_khqr_deeplink" : payload.paymentOption ?? "abapay_khqr";
          return server.initiateTransaction(
            { ...payload, paymentOption },
            mockConfig
          );
        },
        // Module 2: the real client handler.
        handle: (session, options) => client.handleResponse(session, options)
      });
    } finally {
      await stopMockPaywayServer(mockServer);
    }
  },
  /**
   * Convenience: run the test suite and print a formatted report to the
   * console. Returns the report for programmatic inspection.
   */
  async runTestSuiteAndPrint() {
    const report = await this.runTestSuite();
    console.log(formatTestReport(report));
    return report;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_TEST_CASES,
  PayWay,
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PayWaySignatureError,
  client,
  formatTestReport,
  generateMockSession,
  getMockPaywayUrl,
  normalizePaywayResponse,
  runTestSuite,
  sdk,
  server,
  startMockPaywayServer,
  stopMockPaywayServer,
  validateSessionContract,
  verifyCallbackSignature
});
//# sourceMappingURL=index.cjs.map