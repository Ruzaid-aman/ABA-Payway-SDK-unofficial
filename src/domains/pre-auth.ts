import { ENDPOINTS } from '../constants.js';
import type { PayWayConfig, RequestCallOptions } from '../client.js';
import { PayWayConfigError } from '../errors.js';
import { validateSandboxBeneficiary } from '../sandbox-beneficiaries.js';
import type { components } from '../types.js';
import { validatePositiveAmount, validateTransactionId } from '../utils.js';

export interface PreAuthCompleteOptions {
  /** Client-generated idempotency key forwarded to PayWay (recommended for retries). */
  idempotencyKey?: string;
  /**
   * Original pre-authorization amount. When provided, the SDK enforces the
   * documented over-capture ceiling (card payments may capture up to +10%).
   * Server-side enforcement remains authoritative; this is client-side guidance.
   */
  originalAmount?: number;
  /** Over-capture ceiling as a percentage of `originalAmount`. Defaults to 110. */
  maxOverCapturePct?: number;
}

export interface PreAuthCancelOptions {
  idempotencyKey?: string;
  /** Optional cancellation reason forwarded to PayWay. */
  reason?: string;
}

export interface PreAuthDomain {
  complete: (
    transactionId: string,
    amount: number,
    opts?: PreAuthCompleteOptions,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CompletePreAuthResponse']>;
  completeWithPayout: (
    transactionId: string,
    amount: number,
    payout: { acc: string; amt: number }[],
    opts?: PreAuthCompleteOptions,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CompletePreAuthResponse']>;
  cancel: (
    transactionId: string,
    opts?: PreAuthCancelOptions,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CancelPreAuthResponse']>;
}

/**
 * Enforce the documented over-capture ceiling client-side. For card payments
 * PayWay permits completing up to 110% of the original pre-auth amount; passing
 * `originalAmount` lets the SDK reject clearly-excessive captures early.
 */
function validateOverCapture(amount: number, originalAmount?: number, maxOverCapturePct?: number): void {
  if (originalAmount === undefined) return;
  const ceilingPct = maxOverCapturePct ?? 110;
  const upperBound = originalAmount * (ceilingPct / 100);
  if (amount > upperBound + 1e-9) {
    throw new PayWayConfigError(
      `Completion amount ${amount} exceeds the allowed ${ceilingPct}% over-capture of the original ` +
        `pre-auth amount ${originalAmount} (maximum ${Number(upperBound.toFixed(2))}). ` +
        `For card payments PayWay permits capturing up to +10% of the authorized amount.`,
    );
  }
}

export function createPreAuthDomain(
  config: PayWayConfig,
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
      callOptions?: RequestCallOptions;
    },
  ) => Promise<TResponse>,
): PreAuthDomain {
  return {
    complete: (transactionId: string, amount: number, opts: PreAuthCompleteOptions = {}, callOptions?: RequestCallOptions) => {
      // Validate inputs
      validateTransactionId(transactionId);
      validatePositiveAmount(amount, 'USD');
      validateOverCapture(amount, opts.originalAmount, opts.maxOverCapturePct);

      const body: Record<string, unknown> = {
        tran_id: transactionId,
        complete_amount: amount,
      };
      if (opts.idempotencyKey) body.idempotency_key = opts.idempotencyKey;

      return requestWithMerchantAuth<components['schemas']['CompletePreAuthResponse']>(
        ENDPOINTS.completePreAuth,
        body,
        {
          hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
          contentType: 'application/json',
          callOptions,
        },
      );
    },

    completeWithPayout: (
      transactionId: string,
      amount: number,
      payout: { acc: string; amt: number }[],
      opts: PreAuthCompleteOptions = {},
      callOptions?: RequestCallOptions,
    ) => {
      // Validate inputs
      validateTransactionId(transactionId);
      validatePositiveAmount(amount, 'USD');
      if (!Array.isArray(payout) || payout.length === 0) {
        throw new PayWayConfigError('payout must be a non-empty array');
      }
      validateOverCapture(amount, opts.originalAmount, opts.maxOverCapturePct);

      const body: Record<string, unknown> = {
        tran_id: transactionId,
        complete_amount: amount,
        payout,
      };
      if (opts.idempotencyKey) body.idempotency_key = opts.idempotencyKey;

      // Pre-auth payouts are always USD; sandbox enforces the beneficiary
      // allowlist + currency match (a non-whitelisted/non-USD account is rejected).
      const sandbox = config.environment === 'sandbox';
      for (const entry of payout) {
        validatePositiveAmount(entry.amt, 'USD');
        validateSandboxBeneficiary(entry.acc, 'USD', { sandbox });
      }

      return requestWithMerchantAuth<components['schemas']['CompletePreAuthResponse']>(
        ENDPOINTS.completePreAuth,
        body,
        {
          hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
          contentType: 'application/json',
          callOptions,
        },
      );
    },

    cancel: (transactionId: string, opts: PreAuthCancelOptions = {}, callOptions?: RequestCallOptions) => {
      const body: Record<string, unknown> = { tran_id: transactionId };
      if (opts.idempotencyKey) body.idempotency_key = opts.idempotencyKey;
      if (opts.reason) body.reason = opts.reason;

      return requestWithMerchantAuth<components['schemas']['CancelPreAuthResponse']>(
        ENDPOINTS.cancelPreAuth,
        body,
        {
          hmacFields: ['merchant_id', 'merchant_auth', 'request_time'],
          contentType: 'application/json',
          callOptions,
        },
      );
    },
  };
}
