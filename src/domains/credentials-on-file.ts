import type { CofPaymentParams, LinkAccountParams, LinkCardParams, PayWayConfig, TokenParams } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import type { components } from '../types.js';
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
} from '../utils.js';

export interface CredentialsOnFileDomain {
  linkAccount: (params: LinkAccountParams) => Promise<components['schemas']['LinkAccountResponse']>;
  linkCard: (params: LinkCardParams) => Promise<components['schemas']['LinkCardResponse']>;
  payment: (params: CofPaymentParams) => Promise<components['schemas']['CofPaymentResponse']>;
  renewToken: (params: TokenParams) => Promise<components['schemas']['RenewTokenResponse']>;
  getTokenDetails: (params: TokenParams) => Promise<components['schemas']['GetTokenDetailsResponse']>;
  removeToken: (params: TokenParams) => Promise<components['schemas']['RemoveTokenResponse']>;
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
    linkAccount: (params: LinkAccountParams) => {
      if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
        throw new PayWayConfigError('requestId is required and must be a non-empty string');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      if (params.ctid !== undefined) {
        validateRequestIdOrCtid(params.ctid, 'ctid');
      }
      if (params.tokenFlag !== undefined) {
        validateTokenFlag(params.tokenFlag, 'linking');
      }

      if (params.currency) {
        validateCurrency(params.currency);
      }

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl');
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
      );
    },

    linkCard: (params: LinkCardParams) => {
      if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
        throw new PayWayConfigError('requestId is required and must be a non-empty string');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      if (params.ctid !== undefined) {
        validateRequestIdOrCtid(params.ctid, 'ctid');
      }
      if (params.tokenFlag !== undefined) {
        validateTokenFlag(params.tokenFlag, 'linking');
      }

      if (params.returnUrl) {
        validatePublicHttpsUrl(params.returnUrl, 'returnUrl');
      }

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl');
      }

      return request<components['schemas']['LinkCardResponse']>(
        ENDPOINTS.linkCard,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          token_flag: params.tokenFlag,
          frequency: params.frequency,
          return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : undefined,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          currency: params.currency ?? 'USD',
          request_time: params.requestTime,
        }),
        [
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
        ],
        'request_time',
        'application/x-www-form-urlencoded',
      );
    },

    payment: (params: CofPaymentParams) => {
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
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl');
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
          request_time: params.requestTime,
        }),
        [
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
        ],
        'request_time',
      );
    },

    renewToken: (params: TokenParams) => {
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
      );
    },

    getTokenDetails: (params: TokenParams) => {
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
      );
    },

    removeToken: (params: TokenParams) => {
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
      );
    },
  };
}
