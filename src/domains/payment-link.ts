import type { CreatePaymentLinkParams, PayWayConfig, RequestCallOptions } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import type { components } from '../types.js';
import {
  encodeBase64IfNeeded,
  filterParams,
  payoutEntriesTotal,
  validateCurrency,
  validateAmountFloor,
  validatePositiveAmount,
  validatePayoutEntryShape,
  validatePublicHttpsUrl,
  warnAdvisory,
} from '../utils.js';

const DEFAULT_IMAGE_FILENAME = 'image.jpg';
const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

/**
 * Spec (payway-openapi/paths/payment-link.yaml:33–37): the optional top-level
 * `image` part is capped at 3MB and must be JPG/JPEG/PNG. Both are advisory
 * here — the gateway may still accept edge cases, and `strictValidation`
 * escalates the warning to a `PayWayConfigError`.
 */
const PAYMENT_LINK_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
/** `image/jpg` is the common misspelling of `image/jpeg` — allowed. */
const PAYMENT_LINK_IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/jpg', 'image/png']);

export interface PaymentLinkDomain {
  create: (
    params: CreatePaymentLinkParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CreatePaymentLinkResponse']>;
  getDetails: (
    paymentLinkId: string,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['GetPaymentLinkDetailsResponse']>;
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
      callOptions?: RequestCallOptions;
    },
  ) => Promise<TResponse>,
): PaymentLinkDomain {
  return {
    create: (params: CreatePaymentLinkParams, callOptions?: RequestCallOptions) => {
      // Basic parameter validation
      if (typeof params.title !== 'string' || params.title.trim().length === 0) {
        throw new PayWayConfigError('title is required and must be a non-empty string');
      }

      // Sandbox-verified: PayWay rejects requests without currency (PTL04).
      const currency = params.currency ?? 'USD';
      validateCurrency(currency);
      validatePositiveAmount(params.amount, currency);
      validateAmountFloor(config, params.amount, currency, 'payment-link create');
      if (params.title.length > 250) {
        warnAdvisory(config, `title exceeds the gateway's 250-character cap`);
      }

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

      // Spec: `payout` travels inside the RSA-encrypted merchant_auth with
      // [{acc, amt}] keys and the documented total-payout-equals-link-amount
      // rule (payway-openapi/paths/payment-link.yaml). Entry SHAPE throws
      // (shared validatePayoutEntryShape — same validator the CLI uses); the
      // total rule is advisory — the gateway is the final arbiter — with
      // strictValidation escalating. Pre-encoded strings pass through
      // unvalidated (the equality rule can't be checked for them).
      if (params.payout !== undefined) {
        if (Array.isArray(params.payout)) {
          for (const entry of params.payout) {
            validatePayoutEntryShape(entry);
          }
          const total = payoutEntriesTotal(params.payout);
          if (Math.abs(total - params.amount) > 1e-9) {
            warnAdvisory(
              config,
              `payout total ${total} does not equal the link amount ${params.amount} — the documented rule requires them to match`,
            );
          }
        } else if (typeof params.payout !== 'string' || params.payout.trim().length === 0) {
          throw new PayWayConfigError('payout must be a [{acc, amt}] array or a non-empty pre-encoded string');
        }
      }

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
        const contentType = image.contentType ?? DEFAULT_IMAGE_CONTENT_TYPE;
        if (image.data.byteLength > PAYMENT_LINK_IMAGE_MAX_BYTES) {
          warnAdvisory(
            config,
            `image.data is ${image.data.byteLength} bytes, exceeding the documented 3MB (${PAYMENT_LINK_IMAGE_MAX_BYTES} bytes) payment-link image limit — the gateway may reject the upload`,
          );
        }
        if (!PAYMENT_LINK_IMAGE_CONTENT_TYPES.has(contentType)) {
          warnAdvisory(
            config,
            `image contentType "${contentType}" is outside the documented JPG/JPEG/PNG set (image/jpeg, image/jpg, image/png) — the gateway may reject the upload`,
          );
        }
        multipartFile = {
          name: 'image',
          filename,
          contentType,
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
          // Payout travels as JSON text (string) inside the merchant_auth
          // plaintext — encryptMerchantAuth JSON-encodes the whole payload, so
          // an array value would double-encode. Pre-encoded strings pass
          // through unchanged; arrays are JSON.stringify'd once, here.
          payout: params.payout === undefined ? undefined : typeof params.payout === 'string' ? params.payout : JSON.stringify(params.payout),
        }),
        multipartFile ? { multipartFile, callOptions } : { callOptions },
      );
    },

    getDetails: (paymentLinkId: string, callOptions?: RequestCallOptions) => {
      if (typeof paymentLinkId !== 'string' || paymentLinkId.trim().length === 0) {
        throw new PayWayConfigError('paymentLinkId is required and must be a non-empty string');
      }

      return requestWithMerchantAuth<components['schemas']['GetPaymentLinkDetailsResponse']>(
        ENDPOINTS.getPaymentLinkDetails,
        { id: paymentLinkId },
        { callOptions },
      );
    },
  };
}
