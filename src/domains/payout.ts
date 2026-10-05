import { encryptMerchantAuth } from '../auth.js';
import type {
  AddBeneficiaryParams,
  PayoutParams,
  PayWayConfig,
  RequestCallOptions,
  UpdateBeneficiaryStatusParams,
} from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import { validateSandboxBeneficiary } from '../sandbox-beneficiaries.js';
import type { components } from '../types.js';
import {
  filterParams,
  isValidPublicKeyPem,
  validateBeneficiaries,
  validateCurrency,
  validatePositiveAmount,
  validateAmountFloor,
  validateTransactionId,
} from '../utils.js';

export interface PayoutDomain {
  payout: (params: PayoutParams, callOptions?: RequestCallOptions) => Promise<components['schemas']['PayoutResponse']>;
  updateBeneficiaryStatus: (
    params: UpdateBeneficiaryStatusParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['BeneficiaryResponse']>;
  addBeneficiary: (
    params: AddBeneficiaryParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['BeneficiaryResponse']>;
}

export function createPayoutDomain(
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
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
      callOptions?: RequestCallOptions;
    },
  ) => Promise<TResponse>,
): PayoutDomain {
  return {
    payout: async (params: PayoutParams, callOptions?: RequestCallOptions) => {
      if (!config.publicKeyPem) {
        throw new PayWayConfigError('publicKeyPem is required for RSA-encrypted endpoints');
      }
      if (!isValidPublicKeyPem(config.publicKeyPem)) {
        throw new PayWayConfigError(
          'publicKeyPem does not look like a public key PEM (expected "-----BEGIN PUBLIC KEY-----")',
        );
      }

      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency);
      validateAmountFloor(config, params.amount, params.currency, 'payout');
      validateCurrency(params.currency);
      validateBeneficiaries(params.beneficiaries, params.amount, params.currency);

      // Sandbox: the payout currency MUST match each beneficiary's account
      // currency (e.g. a USD account rejects a KHR payout). In production we
      // only validate the account format — the real whitelist/currency check
      // is enforced by PayWay per merchant.
      const sandbox = config.environment === 'sandbox';
      for (const b of params.beneficiaries) {
        validateSandboxBeneficiary(b.account, params.currency, { sandbox });
      }

      return request<components['schemas']['PayoutResponse']>(
        ENDPOINTS.payout,
        filterParams({
          tran_id: params.transactionId,
          amount: params.amount,
          beneficiaries: encryptMerchantAuth(params.beneficiaries, config.publicKeyPem),
          currency: params.currency,
          custom_fields: params.customFields
            ? typeof params.customFields === 'string'
              ? params.customFields
              : JSON.stringify(params.customFields)
            : undefined,
        }),
        ['merchant_id', 'tran_id', 'beneficiaries', 'amount', 'custom_fields', 'currency'],
        'req_time',
        'application/json',
        'hex',
        undefined,
        callOptions,
      );
    },

    updateBeneficiaryStatus: (params: UpdateBeneficiaryStatusParams, callOptions?: RequestCallOptions) => {
      return requestWithMerchantAuth<components['schemas']['BeneficiaryResponse']>(
        ENDPOINTS.updateBeneficiaryStatus,
        { payee: params.payee, status: params.status },
        { hmacFields: ['request_time', 'merchant_auth'], contentType: 'application/json', callOptions },
      );
    },

    addBeneficiary: (params: AddBeneficiaryParams, callOptions?: RequestCallOptions) => {
      return requestWithMerchantAuth<components['schemas']['BeneficiaryResponse']>(
        ENDPOINTS.addBeneficiary,
        { payee: params.payee },
        { hmacFields: ['request_time', 'merchant_auth'], contentType: 'application/json', callOptions },
      );
    },
  };
}
