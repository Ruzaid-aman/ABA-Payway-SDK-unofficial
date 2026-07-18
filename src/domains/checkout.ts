import { generateHmac } from '../auth.js';
import { ENDPOINTS } from '../constants.js';
import {
  formatRequestTime,
  formatAmount,
  encodeBase64IfNeeded,
  filterParams,
  validateCurrency,
  validatePositiveAmount,
  validateTransactionId,
  validateLifetime,
} from '../utils.js';
import type { components } from '../types.js';
import type { PayWayConfig, CreateTransactionParams, GetTransactionListParams } from '../client.js';

export interface CheckoutDomain {
  createTransaction: (params: CreateTransactionParams) => Record<string, unknown> & { hash: string };
  purchase: (params: CreateTransactionParams) => Promise<components['schemas']['PurchaseQrResponse'] | components['schemas']['ErrorStatus']>;
  checkTransaction: (
    transactionId: string,
    requestTime?: string,
  ) => Promise<components['schemas']['CheckTransactionResponse']>;
  closeTransaction: (
    transactionId: string,
    requestTime?: string,
  ) => Promise<components['schemas']['CloseTransactionResponse']>;
  getTransactionDetail: (
    transactionId: string,
    requestTime?: string,
  ) => Promise<components['schemas']['TransactionDetailResponse']>;
  getTransactionList: (params: GetTransactionListParams) => Promise<components['schemas']['TransactionListResponse']>;
  refund: (transactionId: string, amount: number) => Promise<components['schemas']['RefundResponse']>;
  getExchangeRate: (requestTime?: string) => Promise<components['schemas']['ExchangeRateResponse']>;
}

export function createCheckoutDomain(
  config: PayWayConfig & { merchantId: string; apiKey: string },
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ) => Promise<TResponse>,
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: 'application/json' | 'application/x-www-form-urlencoded' },
  ) => Promise<TResponse>,
): CheckoutDomain {
  function buildPurchasePayload(params: CreateTransactionParams): Record<string, unknown> & { hash: string } {
    validateTransactionId(params.transactionId);
    validatePositiveAmount(params.amount, params.currency || 'USD');
    validateCurrency(params.currency);
    validateLifetime(params.lifetime);

    const time = formatRequestTime();
    const payload: Record<string, unknown> = filterParams({
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
      merchant_id: config.merchantId,
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

    const hash = generateHmac(payload, fields, config.apiKey);
    return { ...payload, hash };
  }

  return {
    createTransaction: (params: CreateTransactionParams): Record<string, unknown> & { hash: string } => {
      return buildPurchasePayload(params);
    },

    purchase: (params: CreateTransactionParams) => {
      const payload = buildPurchasePayload(params);
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
      return request<components['schemas']['PurchaseQrResponse'] | components['schemas']['ErrorStatus']>(
        ENDPOINTS.purchase,
        payload,
        fields,
        'req_time',
        'application/json',
      );
    },

    /**
     * Check an existing transaction.
     * @rateLimit 600 requests per second.
     */
    checkTransaction: (transactionId: string, requestTime?: string) => {
      return request<components['schemas']['CheckTransactionResponse']>(
        ENDPOINTS.checkTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    closeTransaction: (transactionId: string, requestTime?: string) => {
      return request<components['schemas']['CloseTransactionResponse']>(
        ENDPOINTS.closeTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    /**
     * Get detailed transaction information.
     * @rateLimit 10 requests per minute. This PayWay limit cannot be increased.
     */
    getTransactionDetail: (transactionId: string, requestTime?: string) => {
      return request<components['schemas']['TransactionDetailResponse']>(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    /**
     * List transactions that match the supplied filters.
     * @rateLimit 50 requests per minute.
     */
    getTransactionList: (params: GetTransactionListParams) => {
      return request<components['schemas']['TransactionListResponse']>(
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
     * Refund a completed transaction.
     * @rateLimit 500 requests per second.
     */
    refund: (transactionId: string, amount: number) => {
      return requestWithMerchantAuth<components['schemas']['RefundResponse']>(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount,
      });
    },

    getExchangeRate: (requestTime?: string) => {
      return request<components['schemas']['ExchangeRateResponse']>(
        ENDPOINTS.getExchangeRate,
        filterParams({ req_time: requestTime }),
        ['req_time', 'merchant_id'],
      );
    },
  };
}
