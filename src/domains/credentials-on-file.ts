import { ENDPOINTS } from '../constants.js';
import { formatAmount, encodeBase64IfNeeded, filterParams } from '../utils.js';
import type { components } from '../types.js';
import type { PayWayConfig, LinkAccountParams, LinkCardParams, CofPaymentParams, TokenParams } from '../client.js';

export interface CredentialsOnFileDomain {
  linkAccount: (params: LinkAccountParams) => Promise<components['schemas']['LinkAccountResponse']>;
  linkCard: (params: LinkCardParams) => Promise<components['schemas']['LinkCardResponse']>;
  payment: (params: CofPaymentParams) => Promise<components['schemas']['CofPaymentResponse']>;
  renewToken: (params: TokenParams) => Promise<components['schemas']['RenewTokenResponse']>;
  getTokenDetails: (params: TokenParams) => Promise<components['schemas']['GetTokenDetailsResponse']>;
  removeToken: (params: TokenParams) => Promise<components['schemas']['RemoveTokenResponse']>;
}

export function createCredentialsOnFileDomain(
  _config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ) => Promise<TResponse>,
): CredentialsOnFileDomain {
  return {
    linkAccount: (params: LinkAccountParams) => {
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
        ],
        'request_time',
        'application/x-www-form-urlencoded',
      );
    },

    payment: (params: CofPaymentParams) => {
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
      return request<components['schemas']['RenewTokenResponse']>(
        ENDPOINTS.renewToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
      );
    },

    getTokenDetails: (params: TokenParams) => {
      return request<components['schemas']['GetTokenDetailsResponse']>(
        ENDPOINTS.getTokenDetails,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
        'request_time',
      );
    },

    removeToken: (params: TokenParams) => {
      return request<components['schemas']['RemoveTokenResponse']>(
        ENDPOINTS.removeToken,
        filterParams({
          request_id: params.requestId,
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
