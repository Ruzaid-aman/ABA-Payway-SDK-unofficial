import { ENDPOINTS } from '../constants.js';
import { encodeBase64IfNeeded, filterParams } from '../utils.js';
import type { components } from '../types.js';
import type { PayWayConfig, CreatePaymentLinkParams } from '../client.js';

export interface PaymentLinkDomain {
  create: (params: CreatePaymentLinkParams) => Promise<components['schemas']['CreatePaymentLinkResponse']>;
  getDetails: (paymentLinkId: string) => Promise<components['schemas']['GetPaymentLinkDetailsResponse']>;
}

export function createPaymentLinkDomain(
  _config: PayWayConfig,
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: 'application/json' | 'application/x-www-form-urlencoded' },
  ) => Promise<TResponse>,
): PaymentLinkDomain {
  return {
    create: (params: CreatePaymentLinkParams) => {
      return requestWithMerchantAuth<components['schemas']['CreatePaymentLinkResponse']>(
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
      return requestWithMerchantAuth<components['schemas']['GetPaymentLinkDetailsResponse']>(
        ENDPOINTS.getPaymentLinkDetails,
        { id: paymentLinkId },
      );
    },
  };
}
