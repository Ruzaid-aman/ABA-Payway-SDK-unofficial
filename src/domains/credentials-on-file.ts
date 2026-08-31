import type {
  CofPaymentParams,
  GetTokenDetailsParams,
  LinkAccountParams,
  LinkCardParams,
  PayWayConfig,
  RemoveTokenParams,
  RenewTokenParams,
  RequestCallOptions,
} from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import type { components } from '../types.js';
import type { LinkCardResponse } from '../domain-types.js';
import {
  encodeBase64IfNeeded,
  filterParams,
  formatAmount,
  validateCurrency,
  validatePositiveAmount,
  validatePublicHttpsUrl,
  validateRequestIdOrCtid,
  validateTokenFlag,
  validateTransactionId,
  warnAdvisory,
} from '../utils.js';

export interface CredentialsOnFileDomain {
  linkAccount: (
    params: LinkAccountParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['LinkAccountResponse']>;
  linkCard: (
    params: LinkCardParams,
    callOptions?: RequestCallOptions,
  ) => Promise<LinkCardResponse>;
  payment: (
    params: CofPaymentParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CofPaymentResponse']>;
  renewToken: (
    params: RenewTokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RenewTokenResponse']>;
  getTokenDetails: (
    params: GetTokenDetailsParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['GetTokenDetailsResponse']>;
  removeToken: (
    params: RemoveTokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RemoveTokenResponse']>;
}

/**
 * Live-documented hash orders, sandbox-verified 2026-08-31 via
 * scripts/sandbox-probe-token-trio.ts (SANDBOX-FINDINGS §16). The gateway
 * tightened CoF hash validation: the §9a-era SDK orders now return
 * "01 Wrong Hash" while these orders pass the hash layer.
 */

export function createCredentialsOnFileDomain(
  config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
    fetchOptions?: { retry?: 'transient' | 'none' },
    callOptions?: RequestCallOptions,
  ) => Promise<TResponse>,
): CredentialsOnFileDomain {
  /**
   * Legacy TD-03 escape hatch: the trio is allowed by default since the
   * live-docs compositions were verified (§16); setting the flag explicitly
   * to `false` re-blocks.
   */
  const requireVerifiedTokenOps = (): void => {
    if (config.allowUnverifiedTokenOperations === false) {
      throw new PayWayConfigError(
        'renewToken/getTokenDetails/removeToken are blocked because allowUnverifiedTokenOperations is explicitly false. ' +
          'The live-documented HMAC compositions were sandbox-verified 2026-08-31 (SANDBOX-FINDINGS §16) — remove the flag to allow them.',
      );
    }
  };

  return {
    linkAccount: (params: LinkAccountParams, callOptions?: RequestCallOptions) => {
      if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
        throw new PayWayConfigError('requestId is required and must be a non-empty string');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      // Live docs (link-account-19336820e0) mark ctid, token_flag, and
      // currency as REQUIRED — enforced here for JS callers too.
      if (typeof params.ctid !== 'string' || params.ctid.trim().length === 0) {
        throw new PayWayConfigError('ctid is required for linkAccount (live docs; 5–24 alphanumeric chars)');
      }
      validateRequestIdOrCtid(params.ctid, 'ctid');
      if (typeof params.tokenFlag !== 'string' || params.tokenFlag.trim().length === 0) {
        throw new PayWayConfigError('tokenFlag is required for linkAccount (live docs; CITI_FLEX | CITO_FLEX)');
      }
      validateTokenFlag(params.tokenFlag, 'linking');
      if (!['CITI_FLEX', 'CITO_FLEX'].includes(params.tokenFlag)) {
        warnAdvisory(
          config,
          `tokenFlag "${params.tokenFlag}" is outside the live-documented link-account set (CITI_FLEX, CITO_FLEX); sandbox additionally accepted CITO_FIX/CITR_FLEX — verify the merchant profile enables it`,
        );
      }

      if (params.currency === undefined) {
        throw new PayWayConfigError('currency is required for linkAccount (live docs)');
      }
      validateCurrency(params.currency);

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
      }

      return request<components['schemas']['LinkAccountResponse']>(
        ENDPOINTS.linkAccount,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          token_flag: params.tokenFlag,
          currency: params.currency,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          request_time: params.requestTime,
        }),
        // §16-verified live order (merchant_id first).
        [
          'merchant_id',
          'request_time',
          'ctid',
          'return_deeplink',
          'callback_url',
          'request_id',
          'token_flag',
          'currency',
        ],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    linkCard: (params: LinkCardParams, callOptions?: RequestCallOptions) => {
      if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
        throw new PayWayConfigError('requestId is required and must be a non-empty string');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      // Live docs (link-card-19336819e0) mark ctid and token_flag REQUIRED.
      if (typeof params.ctid !== 'string' || params.ctid.trim().length === 0) {
        throw new PayWayConfigError('ctid is required for linkCard (live docs; 5–24 alphanumeric chars)');
      }
      validateRequestIdOrCtid(params.ctid, 'ctid');
      if (typeof params.tokenFlag !== 'string' || params.tokenFlag.trim().length === 0) {
        throw new PayWayConfigError('tokenFlag is required for linkCard (live docs; CITI_FLEX | CITO_FLEX)');
      }
      validateTokenFlag(params.tokenFlag, 'linking');
      if (!['CITI_FLEX', 'CITO_FLEX'].includes(params.tokenFlag)) {
        warnAdvisory(
          config,
          `tokenFlag "${params.tokenFlag}" is outside the live-documented link-card set (CITI_FLEX, CITO_FLEX) — verify the merchant profile enables it`,
        );
      }
      if (params.returnUrl !== undefined || params.returnDeeplink !== undefined) {
        warnAdvisory(
          config,
          'linkCard returnUrl/returnDeeplink are no longer sent: they are not part of the live-documented link-card request and would break the hash (use continueSuccessUrl for the hosted form Done target)',
        );
      }

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
      }

      return request<LinkCardResponse>(
        ENDPOINTS.linkCard,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          token_flag: params.tokenFlag,
          frequency: params.frequency,
          continue_success_url: params.continueSuccessUrl ? encodeBase64IfNeeded(params.continueSuccessUrl) : undefined,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          currency: params.currency ?? 'USD',
          request_time: params.requestTime,
        }),
        // §16-aligned live order. `amount` and `frequency` are hash positions
        // with no body field for amount (pass '' — the live doc's PHP sample
        // references $frequency/$amount that are not request properties);
        // `frequency` hashes the param when set.
        [
          'merchant_id',
          'request_time',
          'ctid',
          'callback_url',
          'request_id',
          'token_flag',
          'frequency',
          'amount',
          'currency',
          'continue_success_url',
        ],
        'request_time',
        'application/x-www-form-urlencoded',
        undefined,
        undefined,
        callOptions,
      );
    },

    payment: (params: CofPaymentParams, callOptions?: RequestCallOptions) => {
      if (params.requestId !== undefined && typeof params.requestId === 'string' && params.requestId.trim().length > 0) {
        validateRequestIdOrCtid(params.requestId, 'requestId');
      }
      if (params.ctid !== undefined) {
        validateRequestIdOrCtid(params.ctid, 'ctid');
      }
      if (params.tokenFlag !== undefined) {
        validateTokenFlag(params.tokenFlag, 'charging');
      }

      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || 'USD');
      validateCurrency(params.currency);

      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required for Cof payments');
      }

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
      }

      return request<components['schemas']['CofPaymentResponse']>(
        ENDPOINTS.payment,
        // §16-verified: request_id is NOT sent (absent from the live doc; the
        // binding layer accepted bodies without it).
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          currency: params.currency || 'USD',
          ctid: params.ctid,
          pwt: params.paymentToken,
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          phone: params.phone,
          purchase_type: params.purchaseType,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          custom_fields: params.customFields !== undefined ? encodeBase64IfNeeded(params.customFields) : undefined,
          return_params: params.returnParams,
          payout: params.payout !== undefined ? encodeBase64IfNeeded(params.payout) : undefined,
          token_flag: params.tokenFlag,
          shipping_fee: params.shippingFee,
          items: params.items !== undefined ? encodeBase64IfNeeded(params.items) : undefined,
          request_time: params.requestTime,
        }),
        // §16-verified live order.
        [
          'request_time',
          'merchant_id',
          'tran_id',
          'amount',
          'currency',
          'items',
          'ctid',
          'pwt',
          'first_name',
          'last_name',
          'email',
          'phone',
          'purchase_type',
          'callback_url',
          'custom_fields',
          'return_params',
          'payout',
          'token_flag',
          'shipping_fee',
        ],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    renewToken: (params: RenewTokenParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      validateRequestIdOrCtid(params.ctid, 'ctid');

      return request<components['schemas']['RenewTokenResponse']>(
        ENDPOINTS.renewToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        // §16-verified live order (ctid leads).
        ['ctid', 'request_time', 'pwt', 'merchant_id', 'request_id'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    getTokenDetails: (params: GetTokenDetailsParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      validateRequestIdOrCtid(params.requestId, 'requestId');

      return request<components['schemas']['GetTokenDetailsResponse']>(
        ENDPOINTS.getTokenDetails,
        // §16-verified: ONLY request_id (+ auto merchant_id/request_time) —
        // no ctid, no pwt.
        filterParams({
          request_id: params.requestId,
          request_time: params.requestTime,
        }),
        ['merchant_id', 'request_time', 'request_id'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    removeToken: (params: RemoveTokenParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required');
      }
      validateRequestIdOrCtid(params.ctid, 'ctid');

      return request<components['schemas']['RemoveTokenResponse']>(
        ENDPOINTS.removeToken,
        // §16-verified: ctid + pwt only (+ auto merchant_id/request_time) —
        // no request_id.
        filterParams({
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['merchant_id', 'ctid', 'request_time', 'pwt'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },
  };
}
