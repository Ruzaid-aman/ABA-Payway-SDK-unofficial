/**
 * Online self-activation domain — merchant onboarding without ABA portal
 * visits, driven by a registration PARTNER (openapi-suite-coverage W3,
 * 2026-09-12).
 *
 * Source: the ABA-shared archived gateway spec
 * (`docs/archive/Default module.openapi.json`, paths under
 * `/api/merchant-portal/online-self-activation/`). The contract is
 * **spec-derived and NOT live-verified** — these endpoints authenticate a
 * partner (partner_id + partner HMAC secret + chunked-RSA request_data),
 * a credential class the merchant sandbox cannot exercise.
 *
 * Known spec inconsistencies, preserved deliberately and flagged:
 * - HMAC algorithm: `new-merchant` and `get-mc-info` prose says SHA256,
 *   `get-mc-credential-info` prose says SHA512 for the same b4hash
 *   (`partner_id . request_data . request_time`). Each method follows its
 *   own endpoint's prose.
 * - `new-merchant` response schema marks `code`+`message` REQUIRED but
 *   `url`/`token` optional — a non-`00` status answers without them (the
 *   client raises PayWayBusinessError for non-00 codes anyway).
 */
import type { PayWayConfig, RequestCallOptions } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import { encryptMerchantAuth, generateHmac } from '../auth.js';
import { validatePublicHttpsUrl } from '../utils.js';

/** ABA-issued PTL-family status codes observed in the self-activation spec's status.code descriptions. */
export type SelfActivationStatus = { code: string; message: string; trace_id?: string };

/** Registration request — `new-merchant`. All URLs must be public https. */
export interface SelfActivationRegisterParams {
  /** Pushback URL that receives the merchant details after registration. Required by the spec. */
  pushbackUrl: string;
  /**
   * Where to send the merchant after onboarding: an `https://` URL for web,
   * or `{ ios_scheme, android_scheme }` for native apps (`type: 1`).
   */
  redirectUrl: string | { ios_scheme: string; android_scheme: string };
  /** Unique request reference. REQUIRED — duplicated refs answer PTL164. */
  registerRef: string;
  /** Onboarding currency. REQUIRED by the spec. */
  currency: 'KHR' | 'USD';
  /** `0` instore, `1` online (spec default). */
  merchantType?: 0 | 1;
  /** `1` native app, `0` web (spec default). Native apps should pass app schemes in `redirectUrl`. */
  type?: 0 | 1;
  /**
   * Optional top-level body field (NOT part of `request_data`, NOT hashed).
   * When present it must match `registerRef` (spec: "must match
   * register_ref inside request_data").
   */
  referenceId?: string;
  requestTime?: string;
}

export interface SelfActivationRegisterResponse {
  /** Onboarding form URL to redirect the merchant to (success only). */
  url?: string;
  /** Unique session token (success only). */
  token?: string;
  status: SelfActivationStatus;
}

/** Credential inquiry — `get-mc-credential-info`. */
export interface SelfActivationCredentialInfoParams {
  registerRef: string;
  requestTime?: string;
}

export interface SelfActivationCredentialInfoResponse {
  /** Encrypted merchant detail — an opaque blob the partner decrypts with the merchant key. */
  data?: string;
  status: SelfActivationStatus;
}

/** Merchant API info — `get-mc-info`. */
export interface SelfActivationMerchantInfoParams {
  /** The merchant key whose API info to fetch. REQUIRED. */
  merchantKey: string;
  /**
   * Merchant RSA public key PEM — when provided, the optional
   * `rsa_public_key_hash_encrypt` field is added to `request_data`
   * (chunked-RSA encryption of the hash string).
   */
  merchantRsaPublicKeyPem?: string;
  requestTime?: string;
}

export interface SelfActivationMerchantInfoResponse {
  data?: {
    outlet_name?: string;
    aba_account_khr?: string;
    aba_account_usd?: string;
    available_payment_methods?: Record<string, unknown>;
    enabled_payment_methods?: Record<string, unknown>;
    pending_payment_methods?: Record<string, unknown>;
  };
  status: SelfActivationStatus;
}

export interface SelfActivationDomain {
  /** `POST /api/merchant-portal/online-self-activation/new-merchant` — signs with SHA256. */
  registerMerchant: (params: SelfActivationRegisterParams, callOptions?: RequestCallOptions) => Promise<SelfActivationRegisterResponse>;
  /** `POST /api/merchant-portal/online-self-activation/get-mc-credential-info` — signs with SHA512 (per that endpoint's own prose). */
  getCredentialInfo: (params: SelfActivationCredentialInfoParams, callOptions?: RequestCallOptions) => Promise<SelfActivationCredentialInfoResponse>;
  /** `POST /api/merchant-portal/online-self-activation/get-mc-info` — signs with SHA256. */
  getMerchantInfo: (params: SelfActivationMerchantInfoParams, callOptions?: RequestCallOptions) => Promise<SelfActivationMerchantInfoResponse>;
}

export function createSelfActivationDomain(
  config: PayWayConfig,
  partnerRequest: <TResponse>(
    path: string,
    requestDataPayload: Record<string, unknown>,
    options?: {
      hashAlgorithm?: 'sha256' | 'sha512';
      bodyExtras?: Record<string, unknown>;
      requestTime?: string;
      callOptions?: RequestCallOptions;
    },
  ) => Promise<TResponse>,
): SelfActivationDomain {
  const assertNonEmpty = (value: string | undefined, label: string): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new PayWayConfigError(`${label} is required`);
    }
    return value;
  };

  return {
    registerMerchant: (params, callOptions) => {
      assertNonEmpty(params.registerRef, 'registerRef');
      assertNonEmpty(params.currency, 'currency');
      if (params.currency !== 'KHR' && params.currency !== 'USD') {
        throw new PayWayConfigError(`currency must be 'KHR' or 'USD', received: ${params.currency}`);
      }
      validatePublicHttpsUrl(params.pushbackUrl, 'pushbackUrl', {
        allowPrivateHosts: config.allowPrivateCallbackHosts === true,
      });
      if (typeof params.redirectUrl === 'string') {
        validatePublicHttpsUrl(params.redirectUrl, 'redirectUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
      } else if (params.redirectUrl && typeof params.redirectUrl === 'object') {
        assertNonEmpty(params.redirectUrl.ios_scheme, 'redirectUrl.ios_scheme');
        assertNonEmpty(params.redirectUrl.android_scheme, 'redirectUrl.android_scheme');
      } else {
        throw new PayWayConfigError('redirectUrl is required (https URL or { ios_scheme, android_scheme })');
      }
      if (params.type === 1 && typeof params.redirectUrl === 'string') {
        throw new PayWayConfigError(
          'redirectUrl must be { ios_scheme, android_scheme } when type is 1 (native app); web registrations use type 0',
        );
      }
      if (params.referenceId !== undefined && params.referenceId !== params.registerRef) {
        throw new PayWayConfigError(`referenceId must match registerRef ("${params.registerRef}") when provided`);
      }

      const requestData: Record<string, unknown> = {
        pushback_url: params.pushbackUrl,
        redirect_url: params.redirectUrl,
        register_ref: params.registerRef,
        currency: params.currency,
        merchant_type: params.merchantType,
        type: params.type,
      };
      if (params.type === undefined) {
        // Spec default is 0 (web) — omit rather than send, mirroring filterParams elsewhere.
        delete requestData.type;
      }
      if (params.merchantType === undefined) {
        delete requestData.merchant_type;
      }

      return partnerRequest<SelfActivationRegisterResponse>(
        ENDPOINTS.registerNewMerchant,
        requestData,
        {
          hashAlgorithm: 'sha256',
          bodyExtras: params.referenceId !== undefined ? { reference_id: params.referenceId } : undefined,
          requestTime: params.requestTime,
          callOptions,
        },
      );
    },

    getCredentialInfo: (params, callOptions) => {
      assertNonEmpty(params.registerRef, 'registerRef');

      return partnerRequest<SelfActivationCredentialInfoResponse>(
        ENDPOINTS.getMerchantCredentialInfo,
        { register_ref: params.registerRef },
        {
          // The spec is internally inconsistent: this endpoint's prose says
          // SHA512 while its siblings say SHA256 for the same b4hash. Follow
          // the per-endpoint prose; revisit against live docs (unverified).
          hashAlgorithm: 'sha512',
          requestTime: params.requestTime,
          callOptions,
        },
      );
    },

    getMerchantInfo: (params, callOptions) => {
      assertNonEmpty(params.merchantKey, 'merchantKey');
      const requestTime = params.requestTime;

      // Spec (get-mc-info request_data): public_key_hash_encrypt =
      // hash_hmac('sha512', partner_id . merchant_key . request_time,
      // Merchant public_key). PHP hash_hmac defaults to lowercase HEX —
      // reproduced here (the key being a public key PEM is odd but as-spec'd).
      const requestTimeForHmac = requestTime;
      if (!requestTimeForHmac) {
        // requestWithPartnerAuth generates request_time internally; the HMAC
        // needs it BEFORE the payload is built, so the caller must pin it.
        throw new PayWayConfigError(
          'requestTime is required for getMerchantInfo — the public_key_hash_encrypt HMAC covers partner_id + merchant_key + request_time',
        );
      }
      if (!config.publicKeyPem) {
        throw new PayWayConfigError('publicKeyPem is required to compute public_key_hash_encrypt for getMerchantInfo');
      }
      const publicKeyHashEncrypt = generateHmac(
        { partner_id: config.partnerId, merchant_key: params.merchantKey, request_time: requestTimeForHmac },
        ['partner_id', 'merchant_key', 'request_time'],
        config.publicKeyPem,
        'hex',
        'sha512',
      );

      const requestData: Record<string, unknown> = {
        merchant_key: params.merchantKey,
        public_key_hash_encrypt: publicKeyHashEncrypt,
      };
      if (params.merchantRsaPublicKeyPem) {
        // Optional field: chunked-RSA encryption of the hash string with the
        // merchant's RSA public key (spec: opensslEncrypt($hash_encrypt_string,
        // Merchant rsa_public_key) — same 117-byte-chunk PKCS1 scheme as
        // merchant_auth, base64-encoded).
        requestData.rsa_public_key_hash_encrypt = encryptMerchantAuth(publicKeyHashEncrypt, params.merchantRsaPublicKeyPem);
      }

      return partnerRequest<SelfActivationMerchantInfoResponse>(
        ENDPOINTS.getMerchantInfo,
        requestData,
        {
          hashAlgorithm: 'sha256',
          requestTime: requestTimeForHmac,
          callOptions,
        },
      );
    },
  };
}
