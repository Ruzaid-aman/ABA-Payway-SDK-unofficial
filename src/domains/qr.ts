import { ENDPOINTS } from '../constants.js';
import {
  formatAmount,
  encodeBase64IfNeeded,
  filterParams,
  validateTransactionId,
  validatePositiveAmount,
  validateCurrency,
  validatePublicHttpsUrl,
  validateLifetime,
} from '../utils.js';
import type { components } from '../types.js';
import type { PayWayConfig, GenerateQrParams } from '../client.js';
import { generateOfflineQR, type GenerateOfflineQrParams } from '../khqr-offline.js';

export interface QrDomain {
  generateQr: (params: GenerateQrParams) => Promise<components['schemas']['GenerateQrResponse']>;
  generateOfflineQR: (params: GenerateOfflineQrParams) => string;
}

export function createQrDomain(
  _config: PayWayConfig,
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
      validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl');
      validateLifetime(params.lifetime);

      return request<components['schemas']['GenerateQrResponse']>(
        ENDPOINTS.generateQr,
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          purchase_type: params.purchaseType || 'purchase',
          payment_option: params.paymentOption,
          callback_url: encodeBase64IfNeeded(params.callbackUrl),
          currency: params.currency || 'USD',
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
      return generateOfflineQR(params);
    },
  };
}
