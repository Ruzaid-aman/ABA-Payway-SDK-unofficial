import { generateHmac, encryptMerchantAuth, verifyCallbackSignature } from './auth.js';
import { BASE_URLS, ENDPOINTS } from './constants.js';
import { PayWayConfigError, PayWayAPIError } from './errors.js';
import { formatRequestTime, formatAmount, encodeBase64IfNeeded, filterParams } from './utils.js';

export type Currency = 'USD' | 'KHR';
export type Environment = 'sandbox' | 'production';

export interface ItemEntry {
  name: string;
  quantity: number;
  price: number;
}

export interface PayWayConfig {
  merchantId: string;
  apiKey: string;
  publicKeyPem?: string;
  environment?: 'sandbox' | 'production';
  timeout?: number;
  baseUrl?: string;
}

export interface GatewayErrorDetails {
  code?: string;
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

function checkResponseError(body: any): void {
  if (!body || typeof body !== 'object') {
    return;
  }

  if (body.status && typeof body.status === 'object') {
    const code = String(body.status.code ?? '');
    const message = body.status.message || 'Unknown PayWay API Error';
    if (code !== '0' && code !== '00' && code !== '') {
      throw new PayWayAPIError(message, {
        paywayCode: code,
        rawBody: body,
      });
    }
  }

  if (body.status && typeof body.status === 'string') {
    const statusStr = body.status.toUpperCase();
    if (statusStr === 'FAILED' || statusStr === 'ERROR') {
      const code = body.code !== undefined ? String(body.code) : undefined;
      const message = body.message || 'Unknown PayWay API Error';
      throw new PayWayAPIError(message, {
        paywayCode: code,
        rawBody: body,
      });
    }
  }

  if (body.code !== undefined && body.code !== null && typeof body.code !== 'object') {
    const code = String(body.code);
    const message = body.message || 'Unknown PayWay API Error';
    if (code !== '0' && code !== '00') {
      throw new PayWayAPIError(message, {
        paywayCode: code,
        rawBody: body,
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

function createHttpError(response: Response, rawBody: any): PayWayAPIError {
  return new PayWayAPIError(`HTTP Error: ${response.status} ${response.statusText}`, {
    statusCode: response.status,
    rawBody,
  });
}

function createJsonParseError(rawBody: string): PayWayAPIError {
  return new PayWayAPIError('Invalid JSON response from PayWay API', {
    rawBody,
  });
}

function createNetworkError(error: any, timeoutMs: number): PayWayAPIError {
  if (isAbortError(error)) {
    return new PayWayAPIError(`Request timed out after ${timeoutMs}ms`, {
      rawBody: error,
    });
  }

  return new PayWayAPIError(`Network error: ${error?.message ?? 'Unknown network failure'}`, {
    rawBody: error,
  });
}

export class PayWay {
  private config: PayWayConfig;
  private baseUrl: string;

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

    const controller = new AbortController();
    const timeoutMs = this.config.timeout ?? 30_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
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

      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
        },
        body: bodyPayload,
        signal: controller.signal,
      });

      const parsedBody = await parseResponseBody(response);
      if (!response.ok) {
        throw createHttpError(response, parsedBody);
      }

      if (typeof parsedBody === 'string') {
        throw createJsonParseError(parsedBody);
      }

      checkResponseError(parsedBody);
      return parsedBody as TResponse;
    } catch (error: any) {
      if (error instanceof PayWayAPIError) {
        throw error;
      }
      throw createNetworkError(error, timeoutMs);
    } finally {
      clearTimeout(timeoutId);
    }
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

    const controller = new AbortController();
    const timeoutMs = this.config.timeout ?? 30_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
        },
        body: contentType === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString(),
        signal: controller.signal,
      });

      const parsedBody = await parseResponseBody(response);
      if (!response.ok) {
        throw createHttpError(response, parsedBody);
      }

      if (typeof parsedBody === 'string') {
        throw createJsonParseError(parsedBody);
      }

      checkResponseError(parsedBody);
      return parsedBody as TResponse;
    } catch (error: any) {
      if (error instanceof PayWayAPIError) {
        throw error;
      }
      throw createNetworkError(error, timeoutMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

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

  public readonly checkout = {
    createTransaction: (params: CreateTransactionParams): Record<string, any> & { hash: string } => {
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
        cancel_url: params.cancelUrl,
        skip_success_page: params.skipSuccessPage,
        continue_success_url: params.continueSuccessUrl,
        return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
        custom_fields: params.customFields ? encodeBase64IfNeeded(params.customFields) : undefined,
        return_params: params.returnParams,
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

    checkTransaction: (transactionId: string, requestTime?: string) => {
      return this.request(ENDPOINTS.checkTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        'req_time',
        'merchant_id',
        'tran_id',
      ]);
    },

    closeTransaction: (transactionId: string, requestTime?: string) => {
      return this.request(ENDPOINTS.closeTransaction, filterParams({ tran_id: transactionId, req_time: requestTime }), [
        'req_time',
        'merchant_id',
        'tran_id',
      ]);
    },

    getTransactionDetail: (transactionId: string, requestTime?: string) => {
      return this.request(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    getTransactionList: (params: GetTransactionListParams) => {
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
          req_time: params.requestTime,
        }),
        ['req_time', 'merchant_id', 'from_date', 'to_date', 'from_amount', 'to_amount', 'status', 'page', 'pagination'],
        'req_time',
      );
    },

    refund: (transactionId: string, amount: number) => {
      return this.requestWithMerchantAuth(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount,
      });
    },

    getExchangeRate: (requestTime?: string) => {
      return this.request(ENDPOINTS.getExchangeRate, filterParams({ req_time: requestTime }), [
        'req_time',
        'merchant_id',
      ]);
    },
  };

  public readonly credentialsOnFile = {
    linkAccount: (params: LinkAccountParams) => {
      return this.request(
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

    linkCard: (params: LinkCardParams) => {
      return this.request(
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

    payment: (params: CofPaymentParams) => {
      return this.request(
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

    renewToken: (params: TokenParams) => {
      return this.request(
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

    getTokenDetails: (params: TokenParams) => {
      return this.request(
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

    removeToken: (params: TokenParams) => {
      return this.request(
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

  public readonly qr = {
    generateQr: (params: GenerateQrParams) => {
      return this.request(
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

  public readonly paymentLink = {
    create: (params: CreatePaymentLinkParams) => {
      return this.requestWithMerchantAuth(
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

    getDetails: (paymentLinkId: string) => {
      return this.requestWithMerchantAuth(ENDPOINTS.getPaymentLinkDetails, { id: paymentLinkId });
    },
  };

  public readonly preAuth = {
    complete: (transactionId: string, amount: number) => {
      return this.requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount,
      }, {
        hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
        contentType: 'application/json',
      });
    },

    completeWithPayout: (transactionId: string, amount: number, payout: { acc: string; amt: number }[]) => {
      return this.requestWithMerchantAuth(ENDPOINTS.completePreAuth, {
        tran_id: transactionId,
        complete_amount: amount,
        payout,
      }, {
        hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
        contentType: 'application/json',
      });
    },

    cancel: (transactionId: string) => {
      return this.requestWithMerchantAuth(ENDPOINTS.cancelPreAuth, { tran_id: transactionId }, {
        hmacFields: ['merchant_id', 'merchant_auth', 'request_time'],
        contentType: 'application/json',
      });
    },
  };

  public readonly payout = {
    payout: (params: PayoutParams) => {
      if (!this.config.publicKeyPem) {
        throw new PayWayConfigError('publicKeyPem is required for RSA-encrypted endpoints');
      }

      return this.request(
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

    updateBeneficiaryStatus: (params: UpdateBeneficiaryStatusParams) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.updateBeneficiaryStatus,
        { payee: params.payee, status: params.status },
        { hmacFields: ['request_time', 'merchant_auth'], contentType: 'application/json' },
      );
    },

    addBeneficiary: (params: AddBeneficiaryParams) => {
      return this.requestWithMerchantAuth(
        ENDPOINTS.addBeneficiary,
        { payee: params.payee },
        { hmacFields: ['request_time', 'merchant_auth'], contentType: 'application/json' },
      );
    },
  };

  public readonly khqr = {
    getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => {
      return this.request(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ['req_time', 'merchant_id', 'merchant_ref'],
      );
    },
  };
}
export { verifyCallbackSignature } from './auth.js';
