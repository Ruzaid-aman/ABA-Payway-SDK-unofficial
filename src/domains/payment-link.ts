import type { CreatePaymentLinkParams, PayWayConfig } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import type { components } from '../types.js';
import {
  encodeBase64IfNeeded,
  filterParams,
  validateCurrency,
  validatePositiveAmount,
  validatePublicHttpsUrl,
} from '../utils.js';

const DEFAULT_IMAGE_FILENAME = 'image.jpg';
const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

export interface PaymentLinkDomain {
  create: (params: CreatePaymentLinkParams) => Promise<components['schemas']['CreatePaymentLinkResponse']>;
  getDetails: (paymentLinkId: string) => Promise<components['schemas']['GetPaymentLinkDetailsResponse']>;
}

export function createPaymentLinkDomain(
  config: PayWayConfig,
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
      multipartFile?: { name: string; filename: string; contentType: string; data: Uint8Array };
    },
  ) => Promise<TResponse>,
): PaymentLinkDomain {
  return {
    create: (params: CreatePaymentLinkParams) => {
      // Basic parameter validation
      if (typeof params.title !== 'string' || params.title.trim().length === 0) {
        throw new PayWayConfigError('title is required and must be a non-empty string');
      }

      // Sandbox-verified: PayWay rejects requests without currency (PTL04).
      const currency = params.currency ?? 'USD';
      validateCurrency(currency);
      validatePositiveAmount(params.amount, currency);

      if (typeof params.merchantRefNo !== 'string' || params.merchantRefNo.trim().length === 0) {
        throw new PayWayConfigError('merchantRefNo is required and must be a non-empty string');
      }

      // Sandbox-verified: PayWay rejects descriptions over 250 characters (PTL04).
      if (params.description !== undefined && params.description.length > 250) {
        throw new PayWayConfigError(
          `description must be at most 250 characters, received: ${params.description.length}`,
        );
      }

      // Sandbox-verified: PayWay rejects requests without return_url
      // ("The return_url field is required." — PTL04).
      if (typeof params.returnUrl !== 'string' || params.returnUrl.trim().length === 0) {
        throw new PayWayConfigError('returnUrl is required by PayWay for payment links');
      }
      validatePublicHttpsUrl(params.returnUrl, 'returnUrl', {
        allowPrivateHosts: config.allowPrivateCallbackHosts === true,
      });

      // Optional image travels as a top-level multipart part (never inside
      // merchant_auth, never hashed) — sandbox probe evidence in
      // docs/SANDBOX-FINDINGS.md §14.
      let multipartFile: { name: string; filename: string; contentType: string; data: Uint8Array } | undefined;
      if (params.image !== undefined) {
        const { image } = params;
        if (!(image.data instanceof Uint8Array) || image.data.byteLength === 0) {
          throw new PayWayConfigError('image.data is required and must be non-empty bytes (Uint8Array/Buffer)');
        }
        const filename = image.filename ?? DEFAULT_IMAGE_FILENAME;
        if (typeof filename !== 'string' || filename.trim().length === 0) {
          throw new PayWayConfigError('image.filename must be a non-empty string when provided');
        }
        multipartFile = {
          name: 'image',
          filename,
          contentType: image.contentType ?? DEFAULT_IMAGE_CONTENT_TYPE,
          data: image.data,
        };
      }

      return requestWithMerchantAuth<components['schemas']['CreatePaymentLinkResponse']>(
        ENDPOINTS.createPaymentLink,
        filterParams({
          title: params.title,
          amount: params.amount,
          currency,
          description: params.description,
          payment_limit: params.paymentLimit,
          return_url: encodeBase64IfNeeded(params.returnUrl),
          merchant_ref_no: params.merchantRefNo,
          expired_date: params.expiredDate,
        }),
        multipartFile ? { multipartFile } : undefined,
      );
    },

    getDetails: (paymentLinkId: string) => {
      if (typeof paymentLinkId !== 'string' || paymentLinkId.trim().length === 0) {
        throw new PayWayConfigError('paymentLinkId is required and must be a non-empty string');
      }

      return requestWithMerchantAuth<components['schemas']['GetPaymentLinkDetailsResponse']>(
        ENDPOINTS.getPaymentLinkDetails,
        { id: paymentLinkId },
      );
    },
  };
}
