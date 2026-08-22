import { ENDPOINTS } from '../constants.js';
import { filterParams } from '../utils.js';
import type { components } from '../types.js';
import type { PayWayConfig } from '../client.js';
import { generateOfflineQR, type GenerateOfflineQrParams } from '../khqr-offline.js';
import {
  validateKhqrCallbackSetup,
  validateKhqrConfiguration,
  type KhqrCallbackReadiness,
  type KhqrCallbackValidationOptions,
  type KhqrConfigurationReadiness,
  type KhqrMerchantConfiguration,
} from '../khqr-config.js';

export interface KhqrDomain {
  generateOfflineQR: (params: GenerateOfflineQrParams) => string;
  validateConfiguration: () => KhqrConfigurationReadiness;
  validateCallbackSetup: (options?: KhqrCallbackValidationOptions) => KhqrCallbackReadiness;
  getTransactionsByMerchantRef: (
    merchantRef: string,
    requestTime?: string,
  ) => Promise<components['schemas']['GetTransactionsByMcRefResponse']>;
}

export function createKhqrDomain(
  config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ) => Promise<TResponse>,
): KhqrDomain {
  const configuration: KhqrMerchantConfiguration | undefined = config.khqr;

  return {
    generateOfflineQR: (params: GenerateOfflineQrParams) => {
      return generateOfflineQR(params, configuration);
    },

    validateConfiguration: () => validateKhqrConfiguration(configuration),

    validateCallbackSetup: (options: KhqrCallbackValidationOptions = {}) =>
      validateKhqrCallbackSetup(configuration?.callback, options),

    getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => {
      if (typeof merchantRef !== 'string' || merchantRef.trim().length === 0) {
        throw new Error('merchantRef is required and must be a non-empty string');
      }

      return request<components['schemas']['GetTransactionsByMcRefResponse']>(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ['req_time', 'merchant_id', 'merchant_ref'],
      );
    },
  };
}
