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
function generateHmacArithmetic(payload, fieldList, apiKey, arithmeticPairs) {
  const sumByFirstField = new Map(
    arithmeticPairs.map(([a, b]) => {
      const numA = parseFloat(String(payload[a] ?? 0)) || 0;
      const numB = parseFloat(String(payload[b] ?? 0)) || 0;
      return [a, String(numA + numB)];
    })
  );
  const suppressedFields = new Set(arithmeticPairs.map(([, b]) => b));
  const parts = [];
  for (const field of fieldList) {
    if (suppressedFields.has(field)) {
      continue;
    }
    if (sumByFirstField.has(field)) {
      parts.push(sumByFirstField.get(field));
    } else {
      const val = payload[field];
      parts.push(val === void 0 || val === null ? "" : String(val));
    }
  }
  return crypto.createHmac("sha512", apiKey).update(parts.join("")).digest("base64");
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
var PayWayError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PayWayError";
  }
};
var PayWayConfigError = class extends PayWayError {
  constructor(message) {
    super(message);
    this.name = "PayWayConfigError";
  }
};
var PayWayAPIError = class extends PayWayError {
  statusCode;
  paywayCode;
  rawBody;
  constructor(message, options) {
    super(message);
    this.name = "PayWayAPIError";
    this.statusCode = options?.statusCode;
    this.paywayCode = options?.paywayCode;
    this.rawBody = options?.rawBody;
  }
};

// src/utils.ts
function formatRequestTime(date) {
  const now = date || /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds());
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

// src/client.ts
function checkResponseError(body) {
  if (!body || typeof body !== "object") {
    return;
  }
  if (body.status && typeof body.status === "object") {
    const code = String(body.status.code ?? "");
    const message = body.status.message || "Unknown PayWay API Error";
    if (code !== "0" && code !== "00" && code !== "") {
      throw new PayWayAPIError(message, {
        paywayCode: code,
        rawBody: body
      });
    }
  }
  if (body.status && typeof body.status === "string") {
    const statusStr = body.status.toUpperCase();
    if (statusStr === "FAILED" || statusStr === "ERROR") {
      const code = body.code !== void 0 ? String(body.code) : void 0;
      const message = body.message || "Unknown PayWay API Error";
      throw new PayWayAPIError(message, {
        paywayCode: code,
        rawBody: body
      });
    }
  }
  if (body.code !== void 0 && body.code !== null && typeof body.code !== "object") {
    const code = String(body.code);
    const message = body.message || "Unknown PayWay API Error";
    if (code !== "0" && code !== "00") {
      throw new PayWayAPIError(message, {
        paywayCode: code,
        rawBody: body
      });
    }
  }
}
var PayWay = class {
  config;
  baseUrl;
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
  }
  async request(path, body, hmacFields, timeFieldName = "req_time", arithmeticPairs, contentType = "application/json", hashEncoding = "base64") {
    const fullBody = {
      ...body,
      merchant_id: this.config.merchantId
    };
    if (!fullBody[timeFieldName]) {
      fullBody[timeFieldName] = formatRequestTime();
    }
    fullBody.hash = arithmeticPairs && arithmeticPairs.length > 0 ? generateHmacArithmetic(fullBody, hmacFields, this.config.apiKey, arithmeticPairs) : generateHmac(fullBody, hmacFields, this.config.apiKey, hashEncoding);
    const controller = new AbortController();
    const timeoutMs = this.config.timeout ?? 3e4;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
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
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": contentType
        },
        body: bodyPayload,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new PayWayAPIError(`HTTP Error: ${response.status} ${response.statusText}`, {
          statusCode: response.status
        });
      }
      const result = await response.json();
      checkResponseError(result);
      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new PayWayAPIError(`Request timed out after ${timeoutMs}ms`, {
          rawBody: error
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
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
    const controller = new AbortController();
    const timeoutMs = this.config.timeout ?? 3e4;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": contentType
        },
        body: contentType === "application/json" ? JSON.stringify(body) : new URLSearchParams(body).toString(),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new PayWayAPIError(`HTTP Error: ${response.status} ${response.statusText}`, {
          statusCode: response.status
        });
      }
      const result = await response.json();
      checkResponseError(result);
      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new PayWayAPIError(`Request timed out after ${timeoutMs}ms`, {
          rawBody: error
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  verifyCallback(body, signature) {
    return verifyCallbackSignature(body, signature, this.config.apiKey);
  }
  // --- Sub-Clients ---
  checkout = {
    createTransaction: (params) => {
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
        cancel_url: params.cancelUrl,
        skip_success_page: params.skipSuccessPage,
        continue_success_url: params.continueSuccessUrl,
        return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : void 0,
        custom_fields: params.customFields ? encodeBase64IfNeeded(params.customFields) : void 0,
        return_params: params.returnParams,
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
    checkTransaction: (transactionId, requestTime) => {
      return this.request(ENDPOINTS.checkTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        "req_time",
        "merchant_id",
        "tran_id"
      ]);
    },
    closeTransaction: (transactionId, requestTime) => {
      return this.request(ENDPOINTS.closeTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        "req_time",
        "merchant_id",
        "tran_id"
      ]);
    },
    getTransactionDetail: (transactionId, requestTime) => {
      return this.request(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ["req_time", "merchant_id", "tran_id"]
      );
    },
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
        "req_time",
        [["to_date", "from_amount"]]
      );
    },
    refund: (transactionId, amount) => {
      return this.requestWithMerchantAuth(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount
      });
    },
    getExchangeRate: (requestTime) => {
      return this.request(ENDPOINTS.getExchangeRate, filterParams({ req_time: requestTime }), [
        "req_time",
        "merchant_id"
      ]);
    }
  };
  credentialsOnFile = {
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
        void 0,
        "application/x-www-form-urlencoded"
      );
    },
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
  qr = {
    generateQr: (params) => {
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
  paymentLink = {
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
    getDetails: (paymentLinkId) => {
      return this.requestWithMerchantAuth(ENDPOINTS.getPaymentLinkDetails, { id: paymentLinkId });
    }
  };
  preAuth = {
    complete: (transactionId, amount) => {
      return this.requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount
      }, {
        hmacFields: ["merchant_auth", "request_time", "merchant_id"],
        contentType: "application/json"
      });
    },
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
    cancel: (transactionId) => {
      return this.requestWithMerchantAuth(ENDPOINTS.cancelPreAuth, { tran_id: transactionId }, {
        hmacFields: ["merchant_id", "merchant_auth", "request_time"],
        contentType: "application/json"
      });
    }
  };
  payout = {
    payout: (params) => {
      if (!this.config.publicKeyPem) {
        throw new PayWayConfigError("publicKeyPem is required for RSA-encrypted endpoints");
      }
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
        void 0,
        "application/json",
        "hex"
      );
    },
    updateBeneficiaryStatus: (params) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.updateBeneficiaryStatus,
        { payee: params.payee, status: params.status },
        { hmacFields: ["request_time", "merchant_auth"], contentType: "application/json" }
      );
    },
    addBeneficiary: (params) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.addBeneficiary,
        { payee: params.payee },
        { hmacFields: ["request_time", "merchant_auth"], contentType: "application/json" }
      );
    }
  };
  khqr = {
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