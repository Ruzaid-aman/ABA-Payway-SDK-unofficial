import type { CofPaymentParams, LinkAccountParams, LinkCardParams, PayWayConfig, RequestCallOptions, TokenParams } from '../client.js';
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
    params: TokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RenewTokenResponse']>;
  getTokenDetails: (
    params: TokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['GetTokenDetailsResponse']>;
  removeToken: (
    params: TokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RemoveTokenResponse']>;
}

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
   * TD-03 capability guard: the v3 token-management trio has no ABA-confirmed
   * HMAC composition (~60 derivable field orderings rejected in sandbox
   * campaigns — SANDBOX-FINDINGS §9a). Blocked by default so merchants cannot
   * ship blind; explicit opt-in is required to call through anyway.
   */
  const requireVerifiedTokenOps = (): void => {
    if (!config.allowUnverifiedTokenOperations) {
      throw new PayWayConfigError(
        'renewToken/getTokenDetails/removeToken are BLOCKED: ABA has not confirmed the HMAC composition for the v3 token-management endpoints ' +
          '(see audit-results/four-pillars RTM R-04/05/06 and technical-debt-register TD-03). ' +
          'Set allowUnverifiedTokenOperations: true in the PayWay config to force-enable while awaiting the ABA spec.',
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
        [
          'request_time',
          'merchant_id',
          'request_id',
          'ctid',
          'return_deeplink',
          'token_flag',
          'currency',
          'callback_url',
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

      if (params.returnUrl) {
        validatePublicHttpsUrl(params.returnUrl, 'returnUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
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
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          token_flag: params.tokenFlag,
          frequency: params.frequency,
          return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : undefined,
          continue_success_url: params.continueSuccessUrl ? encodeBase64IfNeeded(params.continueSuccessUrl) : undefined,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          currency: params.currency ?? 'USD',
          request_time: params.requestTime,
        }),
        [
          // Sandbox-verified order (SANDBOX-FINDINGS §9a). continue_success_url
          // is appended at the end: unset → '' → hash byte-identical to the
          // pre-parity list; set → included per "hash covers all posted
          // parameters". Live-doc order differs (audit §7) — pending probe.
          'request_time',
          'merchant_id',
          'request_id',
          'ctid',
          'return_deeplink',
          'token_flag',
          'frequency',
          'return_url',
          'callback_url',
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
      if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
        throw new PayWayConfigError('requestId is required and must be a non-empty string');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
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
        filterParams({
          request_id: params.requestId,
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          ctid: params.ctid,
          pwt: params.paymentToken,
          token_flag: params.tokenFlag,
          currency: params.currency || 'USD',
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          phone: params.phone,
          purchase_type: params.purchaseType,
          items: params.items !== undefined ? encodeBase64IfNeeded(params.items) : undefined,
          return_params: params.returnParams,
          payout: params.payout !== undefined ? encodeBase64IfNeeded(params.payout) : undefined,
          custom_fields: params.customFields !== undefined ? encodeBase64IfNeeded(params.customFields) : undefined,
          shipping_fee: params.shippingFee,
          request_time: params.requestTime,
        }),
        [
          // Sandbox-verified base order (SANDBOX-FINDINGS §9a). The 2026-08-31
          // live-docs optional params (first_name … shipping_fee) are appended
          // at the end: unset → '' → hash byte-identical to the pre-parity
          // list. The live-doc order differs (audit §7) — pending B3 probe.
          'request_time',
          'merchant_id',
          'request_id',
          'tran_id',
          'amount',
          'ctid',
          'pwt',
          'token_flag',
          'currency',
          'callback_url',
          'first_name',
          'last_name',
          'email',
          'phone',
          'purchase_type',
          'items',
          'return_params',
          'payout',
          'custom_fields',
          'shipping_fee',
        ],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    renewToken: (params: TokenParams, callOptions?: RequestCallOptions) => {
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
          request: params.request ?? params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    getTokenDetails: (params: TokenParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      validateRequestIdOrCtid(params.ctid, 'ctid');

      return request<components['schemas']['GetTokenDetailsResponse']>(
        ENDPOINTS.getTokenDetails,
        filterParams({
          request_id: params.requestId,
          request: params.request ?? params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    removeToken: (params: TokenParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      validateRequestIdOrCtid(params.ctid, 'ctid');

      return request<components['schemas']['RemoveTokenResponse']>(
        ENDPOINTS.removeToken,
        filterParams({
          request_id: params.requestId,
          request: params.request ?? params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },
  };
}
