import type { GenerateQrParams, PayWayConfig } from '../client.js';
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
  validateTransactionId,
} from '../utils.js';

export interface QrDomain {
  generateQr: (params: GenerateQrParams) => Promise<components['schemas']['GenerateQrResponse']>;
  generateOfflineQR: (params: GenerateOfflineQrParams) => string;
}

export function createQrDomain(
  config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ) => Promise<TResponse>,
): QrDomain {
  return {
    generateQr: (params: GenerateQrParams) => {
      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || 'USD');
      validateCurrency(params.currency);
      validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
        allowPrivateHosts: config.allowPrivateCallbackHosts === true,
      });
      validateQrLifetimeSeconds(params.lifetime);

      return request<components['schemas']['GenerateQrResponse']>(
        ENDPOINTS.generateQr,
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          purchase_type: params.purchaseType || 'purchase',
          payment_option: params.paymentOption || 'abapay_khqr',
          callback_url: encodeBase64IfNeeded(params.callbackUrl),
          currency: params.currency || 'USD',
          // The API takes whole minutes; floor keeps the actual expiry at or
          // below the merchant's requested countdown (a live QR must never
          // outlast the displayed timer). validateQrLifetimeSeconds already
          // guaranteed >= 180s, so this can never send 0 — the gateway
          // rejects sub-3-minute lifetimes with opaque code "04".
          lifetime: params.lifetime ? Math.floor(params.lifetime / 60) : undefined,
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
          'lifetime',
          'qr_image_template',
        ],
      );
    },

    generateOfflineQR: (params: GenerateOfflineQrParams) => {
      return generateOfflineQR(params, config.khqr);
    },
  };
}
