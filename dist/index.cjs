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
  PayWay: () => PayWay,
  PayWayAPIError: () => PayWayAPIError,
  PayWayConfigError: () => PayWayConfigError,
  PayWayError: () => PayWayError,
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

// src/domains/checkout.ts
init_auth();
function createCheckoutDomain(config, request, requestWithMerchantAuth) {
  return {
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
    },
    checkTransaction: (transactionId, requestTime) => {
      return request(ENDPOINTS.checkTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        "req_time",
        "merchant_id",
        "tran_id"
      ]);
    },
    closeTransaction: (transactionId, requestTime) => {
      return request(ENDPOINTS.closeTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        "req_time",
        "merchant_id",
        "tran_id"
      ]);
    },
    getTransactionDetail: (transactionId, requestTime) => {
      return request(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ["req_time", "merchant_id", "tran_id"]
      );
    },
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
    refund: (transactionId, amount) => {
      return requestWithMerchantAuth(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount
      });
    },
    getExchangeRate: (requestTime) => {
      return request(ENDPOINTS.getExchangeRate, filterParams({ req_time: requestTime }), [
        "req_time",
        "merchant_id"
      ]);
    }
  };
}

// src/domains/credentials-on-file.ts
function createCredentialsOnFileDomain(_config, request) {
  return {
    linkAccount: (params) => {
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
      return requestWithMerchantAuth(ENDPOINTS.getPaymentLinkDetails, { id: paymentLinkId });
    }
  };
}

// src/domains/pre-auth.ts
function createPreAuthDomain(requestWithMerchantAuth) {
  return {
    complete: (transactionId, amount) => {
      return requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount
      }, {
        hmacFields: ["merchant_auth", "request_time", "merchant_id"],
        contentType: "application/json"
      });
    },
    completeWithPayout: (transactionId, amount, payout) => {
      return requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount,
        payout
      }, {
        hmacFields: ["merchant_auth", "request_time", "merchant_id"],
        contentType: "application/json"
      });
    },
    cancel: (transactionId) => {
      return requestWithMerchantAuth(ENDPOINTS.cancelPreAuth, { tran_id: transactionId }, {
        hmacFields: ["merchant_id", "merchant_auth", "request_time"],
        contentType: "application/json"
      });
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
      return generateOfflineQR(params);
    },
    getTransactionsByMerchantRef: (merchantRef, requestTime) => {
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
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint
      });
    }
  }
  if (typeof resp.status === "string") {
    const statusStr = resp.status.toUpperCase();
    if (statusStr === "FAILED" || statusStr === "ERROR") {
      const code = resp.code !== void 0 ? String(resp.code) : void 0;
      const message = String(resp.message ?? "Unknown PayWay API Error");
      throw new PayWayAPIError(message, {
        statusCode: 200,
        paywayCode: code,
        rawBody: body,
        endpoint
      });
    }
  }
  if (resp.code !== void 0 && resp.code !== null && typeof resp.code !== "object") {
    const code = String(resp.code);
    const message = String(resp.message ?? "Unknown PayWay API Error");
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
  const message = error !== null && typeof error === "object" ? String(error.message ?? "Unknown network failure") : "Unknown network failure";
  return new PayWayAPIError(`Network error: ${message}`, {
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
    this.checkout = createCheckoutDomain(
      this.config,
      this.request.bind(this),
      this.requestWithMerchantAuth.bind(this)
    );
    this.credentialsOnFile = createCredentialsOnFileDomain(
      this.config,
      this.request.bind(this)
    );
    this.qr = createQrDomain(
      this.config,
      this.request.bind(this)
    );
    this.paymentLink = createPaymentLinkDomain(
      this.config,
      this.requestWithMerchantAuth.bind(this)
    );
    this.preAuth = createPreAuthDomain(
      this.requestWithMerchantAuth.bind(this)
    );
    this.payout = createPayoutDomain(
      this.config,
      this.request.bind(this),
      this.requestWithMerchantAuth.bind(this)
    );
    this.khqr = createKhqrDomain(
      this.config,
      this.request.bind(this)
    );
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PayWay,
  PayWayAPIError,
  PayWayConfigError,
  PayWayError,
  verifyCallbackSignature
});
//# sourceMappingURL=index.cjs.map