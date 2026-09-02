import type { GenerateQrParams, PayWayConfig, RequestCallOptions } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { type GenerateOfflineQrParams, generateOfflineQR } from '../khqr-offline.js';
import type { components } from '../types.js';
import {
  encodeBase64IfNeeded,
  filterParams,
  formatAmount,
  validateCurrency,
  validateQrLifetimeSeconds,
  validatePositiveAmount,
  validatePublicHttpsUrl,
  validateAmountFloor,
  validateTransactionId,
  warnAdvisory,
} from '../utils.js';

export interface QrDomain {
  generateQr: (
    params: GenerateQrParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['GenerateQrResponse']>;
  generateOfflineQR: (params: GenerateOfflineQrParams) => string;
}

/**
 * Live-documented hash order for generate-qr (developer.payway.com.kh
 * qr-api-14530840e0). Omitted optional fields hash as '' — and since empty
 * strings vanish under concatenation, this list produces the exact same
 * HMAC as the previous 10-field list for callers that don't pass the new
 * optional params (pinned by test).
 *
 * Exported (audit D3) so the hash-order-hint drift-guard test can pin the
 * client.ts hint against the order actually signed.
 */
export const GENERATE_QR_HASH_FIELDS = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'items',
  'first_name',
  'last_name',
  'email',
  'phone',
  'purchase_type',
  'payment_option',
  'callback_url',
  'return_deeplink',
  'currency',
  'custom_fields',
  'return_params',
  'payout',
  'lifetime',
  'qr_image_template',
] as const;

export function createQrDomain(
  config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
    fetchOptions?: { retry?: 'transient' | 'none' },
    callOptions?: RequestCallOptions,
  ) => Promise<TResponse>,
): QrDomain {
  return {
    generateQr: (params: GenerateQrParams, callOptions?: RequestCallOptions) => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || 'USD');
      validateCurrency(params.currency);
      validateAmountFloor(config, params.amount, params.currency || 'USD', 'generate-qr');
      validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
        allowPrivateHosts: config.allowPrivateCallbackHosts === true,
      });
      validateQrLifetimeSeconds(params.lifetime);

      const currency = params.currency || 'USD';
      if (
        (params.paymentOption === 'wechat' || params.paymentOption === 'alipay') &&
        currency !== 'USD'
      ) {
        warnAdvisory(
          config,
          `payment_option "${params.paymentOption}" is USD-only per the QR API docs; currency is ${currency}`,
        );
      }
      if (params.firstName !== undefined && params.firstName.length > 20) {
        warnAdvisory(config, `firstName exceeds the gateway's 20-character cap (err 16); gateway may reject with error 16`);
      }
      if (params.lastName !== undefined && params.lastName.length > 20) {
        warnAdvisory(config, `lastName exceeds the gateway's 20-character cap; gateway may reject with error 17`);
      }
      if (params.email !== undefined && params.email.length > 50) {
        warnAdvisory(config, `email exceeds the gateway's 50-character cap; gateway may reject with error 19`);
      }
      if (params.phone !== undefined && params.phone.length > 20) {
        warnAdvisory(config, `phone exceeds the gateway's 20-character cap; gateway may reject with error 18`);
      }
      const itemCount = Array.isArray(params.items) ? params.items.length : undefined;
      if (itemCount !== undefined && itemCount > 10) {
        warnAdvisory(config, `items carries ${itemCount} entries; the gateway accepts at most 10`);
      }

      return request<components['schemas']['GenerateQrResponse']>(
        ENDPOINTS.generateQr,
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, currency),
          items: params.items !== undefined ? encodeBase64IfNeeded(params.items) : undefined,
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          phone: params.phone,
          purchase_type: params.purchaseType || 'purchase',
          payment_option: params.paymentOption || 'abapay_khqr',
          callback_url: encodeBase64IfNeeded(params.callbackUrl),
          return_deeplink: params.returnDeeplink !== undefined ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          currency,
          custom_fields: params.customFields !== undefined ? encodeBase64IfNeeded(params.customFields) : undefined,
          return_params: params.returnParams,
          payout: params.payout !== undefined ? encodeBase64IfNeeded(params.payout) : undefined,
          // The API takes whole minutes; floor keeps the actual expiry at or
          // below the merchant's requested countdown (a live QR must never
          // outlast the displayed timer). validateQrLifetimeSeconds already
          // guaranteed >= 180s, so this can never send 0 — the gateway
          // rejects sub-3-minute lifetimes with opaque code "04".
          lifetime: params.lifetime ? Math.floor(params.lifetime / 60) : undefined,
          qr_image_template: params.qrImageTemplate || 'template2',
          req_time: params.requestTime,
        }),
        [...GENERATE_QR_HASH_FIELDS],
        undefined,
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    generateOfflineQR: (params: GenerateOfflineQrParams) => {
      return generateOfflineQR(params, config.khqr);
    },
  };
}
