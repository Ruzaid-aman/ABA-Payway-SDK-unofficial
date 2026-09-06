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
 * Sandbox-measured minimum future offset for `expired_date` (2026-09-06,
 * SANDBOX-FINDINGS §22 #3): the gateway rejects past values and short offsets
 * with PTL04; +300s is accepted. The true boundary is only bracketed —
 * (150s, 300s] — so this is the conservative advisory threshold, not a hard
 * gate. Used by `create`'s advisory check.
 */
export const PAYMENT_LINK_EXPIRY_MIN_SECONDS = 300;

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
      // Spec: merchant_ref_no max length 50 (payway-openapi/paths/payment-link.yaml).
      // Advisory — the gateway is the final arbiter; strictValidation escalates.
      if (params.merchantRefNo.length > 50) {
        warnAdvisory(config, `merchantRefNo exceeds the gateway's 50-character cap`);
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

      // Sandbox-verified (2026-09-06, SANDBOX-FINDINGS §22 #3): the gateway
      // rejects past expired_date values and offsets under ~5 minutes with
      // PTL04; +300s and beyond are accepted. The exact minimum is only
      // bracketed — (150s, 300s] — so this stays advisory with a conservative
      // threshold; strictValidation escalates.
      if (params.expiredDate !== undefined) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (params.expiredDate <= nowSec) {
          warnAdvisory(
            config,
            'expired_date is in the past — the gateway rejects past values with PTL04 (sandbox-verified); omit it for no expiry or use a future epoch',
          );
        } else if (params.expiredDate - nowSec < PAYMENT_LINK_EXPIRY_MIN_SECONDS) {
          warnAdvisory(
            config,
            `expired_date is under ~5 minutes out — sandbox rejects offsets below ~5 minutes with PTL04 (boundary measured in (150s, 300s]); use at least ${PAYMENT_LINK_EXPIRY_MIN_SECONDS}s ahead. No EXPIRED status exists: after expiry the link still reads OPEN, so enforce expiry merchant-side`,
          );
        }
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

// ─── Pushback contract (V-1, live-captured 2026-09-06) ─────────────────────

/**
 * Normalized pushback status. Live-captured contract (SANDBOX-FINDINGS
 * §22 addendum #9): the gateway sends the numeric `0` for an approved
 * payment, while the official overview sample shows the string `"00"` —
 * both normalize to `'APPROVED'`. Any other value lands on `'UNKNOWN'`
 * (the raw value stays available on `raw.status` until ABA documents the
 * full value set — open question Q20).
 */
export type PaymentLinkPushbackStatus = 'APPROVED' | 'UNKNOWN';

/**
 * A parsed payment-link pushback — the payment notification PayWay POSTs to
 * the link's decoded `return_url`.
 *
 * **There is NO `hash` field** (live-verified through a real payment):
 * the pushback is a notification only, and `verifyCallback()` does NOT apply.
 * Verify the payment with `checkout.checkTransaction(pushback.tranId)` before
 * fulfilling. One pushback fires per completed payment (multi-payment links
 * fire repeatedly).
 */
export interface PaymentLinkPushback {
  /** Coerced to string — pushbacks carry it as a string, create/detail responses as a number. */
  tranId: string;
  /** `'APPROVED'` for `0`/`'0'`/`'00'`; anything else is `'UNKNOWN'` (check `raw.status`). */
  status: PaymentLinkPushbackStatus;
  /** The merchant_ref_no echoed from create, when present. */
  merchantRefNo?: string;
  /** The parsed body as-is — the audit record, including any fields the contract may grow. */
  raw: Record<string, unknown>;
}

/**
 * Parse a payment-link pushback body (raw JSON string or an already-parsed
 * object) into a normalized {@link PaymentLinkPushback}.
 *
 * Throws `PayWayConfigError` for structurally-invalid bodies (unparseable
 * JSON, non-object, missing `tran_id`) so a misrouted request can't be
 * mistaken for a payment. Unknown extra fields are tolerated and preserved
 * on `raw` — the gateway may extend the contract.
 *
 * Live-captured wire contract (2026-09-06, SANDBOX-FINDINGS §22 addendum #9):
 * `POST <return_url>` with `Content-Type: application/json`,
 * `User-Agent: PayWayApp/3.0`, body
 * `{"tran_id":"…","status":0,"merchant_ref_no":"…"}` — no hash.
 */
export function parsePaymentLinkPushback(body: string | Record<string, unknown>): PaymentLinkPushback {
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new PayWayConfigError('payment-link pushback body is not valid JSON');
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PayWayConfigError('payment-link pushback body must be a JSON object');
  }
  const raw = parsed as Record<string, unknown>;
  if (raw.tran_id === undefined || raw.tran_id === null || String(raw.tran_id).trim() === '') {
    throw new PayWayConfigError('payment-link pushback body is missing tran_id — not a payment notification');
  }
  const statusValue = raw.status;
  const approved = statusValue === 0 || statusValue === '0' || statusValue === '00';
  return {
    tranId: String(raw.tran_id),
    status: approved ? 'APPROVED' : 'UNKNOWN',
    merchantRefNo: raw.merchant_ref_no === undefined || raw.merchant_ref_no === null ? undefined : String(raw.merchant_ref_no),
    raw,
  };
}
