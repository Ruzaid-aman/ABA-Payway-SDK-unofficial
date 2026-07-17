import { ENDPOINTS } from '../constants.js';
import type { components } from '../types.js';

export interface PreAuthDomain {
  complete: (transactionId: string, amount: number) => Promise<components['schemas']['CompletePreAuthResponse']>;
  completeWithPayout: (
    transactionId: string,
    amount: number,
    payout: { acc: string; amt: number }[],
  ) => Promise<components['schemas']['CompletePreAuthResponse']>;
  cancel: (transactionId: string) => Promise<components['schemas']['CancelPreAuthResponse']>;
}

export function createPreAuthDomain(
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: 'application/json' | 'application/x-www-form-urlencoded' },
  ) => Promise<TResponse>,
): PreAuthDomain {
  return {
    complete: (transactionId: string, amount: number) => {
      return requestWithMerchantAuth<components['schemas']['CompletePreAuthResponse']>(
        ENDPOINTS.completePreAuth,
        {
          tran_id: transactionId,
          complete_amount: amount,
        },
        {
          hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
          contentType: 'application/json',
        },
      );
    },

    completeWithPayout: (transactionId: string, amount: number, payout: { acc: string; amt: number }[]) => {
      return requestWithMerchantAuth<components['schemas']['CompletePreAuthResponse']>(
        ENDPOINTS.completePreAuth,
        {
          tran_id: transactionId,
          complete_amount: amount,
          payout,
        },
        {
          hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
          contentType: 'application/json',
        },
      );
    },

    cancel: (transactionId: string) => {
      return requestWithMerchantAuth<components['schemas']['CancelPreAuthResponse']>(
        ENDPOINTS.cancelPreAuth,
        { tran_id: transactionId },
        {
          hmacFields: ['merchant_id', 'merchant_auth', 'request_time'],
          contentType: 'application/json',
        },
      );
    },
  };
}
