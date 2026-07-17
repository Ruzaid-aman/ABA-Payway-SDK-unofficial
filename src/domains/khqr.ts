import { ENDPOINTS } from '../constants.js';
import { filterParams } from '../utils.js';
import type { components } from '../types.js';
import type { PayWayConfig } from '../client.js';
import { generateOfflineQR, type GenerateOfflineQrParams } from '../khqr-offline.js';

export interface KhqrDomain {
  generateOfflineQR: (params: GenerateOfflineQrParams) => string;
  getTransactionsByMerchantRef: (
    merchantRef: string,
    requestTime?: string,
  ) => Promise<components['schemas']['GetTransactionsByMcRefResponse']>;
}

export function createKhqrDomain(
  _config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ) => Promise<TResponse>,
): KhqrDomain {
  return {
    generateOfflineQR: (params: GenerateOfflineQrParams) => {
      return generateOfflineQR(params);
    },

    getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => {
      return request<components['schemas']['GetTransactionsByMcRefResponse']>(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ['req_time', 'merchant_id', 'merchant_ref'],
      );
    },
  };
}
