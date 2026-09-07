import { describe, expect, it } from 'vitest';
import { computeRefundableBalance } from '../utils.js';
import type { RefundableBalanceResult } from '../utils.js';

/**
 * F02 acceptance fixtures: same-currency, cross-currency (payer money in a
 * different unit — W5-6 evidence), partial refund, missing fields, and
 * non-refundable status. The helper must never mix payer money with order
 * money and never throw for data problems.
 */

function detail(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    payment_status: 'APPROVED',
    payment_status_code: 0,
    original_amount: 10,
    original_currency: 'USD',
    payment_amount: 10,
    payment_currency: 'USD',
    refund_amount: 0,
    ...partial,
  };
}

describe('computeRefundableBalance', () => {
  it('computes the balance from order money on a plain same-currency transaction', () => {
    const result = computeRefundableBalance(detail({}), 'USD');
    expect(result.status).toBe('ok');
    expect(result.remaining).toBe(10);
    expect(result.orderCurrency).toBe('USD');
    expect(result.alreadyRefunded).toBe(0);
    expect(result.reason).toBeUndefined();
  });

  it('accounts for an existing partial refund', () => {
    const result = computeRefundableBalance(detail({ refund_amount: 2.5 }), 'USD');
    expect(result.status).toBe('ok');
    expect(result.remaining).toBe(7.5);
    expect(result.alreadyRefunded).toBe(2.5);
  });

  it('reports zero (ok) when fully refunded', () => {
    const result = computeRefundableBalance(detail({ refund_amount: 10 }), 'USD');
    expect(result.status).toBe('ok');
    expect(result.remaining).toBe(0);
    expect(result.reason).toContain('nothing left to refund');
  });

  it('keeps payer money informational and never derives the balance from it on a cross-currency order', () => {
    // W5-6 evidence: 1.20 USD order paid as 4800 KHR.
    const result = computeRefundableBalance(
      detail({
        original_amount: 1.2,
        original_currency: 'USD',
        payment_amount: 4800,
        payment_currency: 'KHR',
      }),
      'USD',
    );
    expect(result.status).toBe('ok');
    expect(result.remaining).toBeCloseTo(1.2, 10); // order money, NOT 4800
    expect(result.payerAmount).toBe(4800);
    expect(result.payerCurrency).toBe('KHR');
    expect(result.reason).toContain('never reconcile refunds against payment_amount');
  });

  it('and the mirrored KHR-paid-as-USD case reconciles KHR order money', () => {
    // W5-6 evidence: 4000 KHR order paid as 1 USD.
    const result = computeRefundableBalance(
      detail({
        original_amount: 4000,
        original_currency: 'KHR',
        payment_amount: 1,
        payment_currency: 'USD',
      }),
      'KHR',
    );
    expect(result.status).toBe('ok');
    expect(result.remaining).toBe(4000); // order money, NOT 1
    expect(result.reason).toContain('ORDER money');
  });

  it('returns unavailable when original_amount is missing', () => {
    const result = computeRefundableBalance(
      detail({ original_amount: undefined, payment_amount: 5, payment_currency: 'USD' }),
      'USD',
    );
    expect(result.status).toBe('unavailable');
    expect(result.remaining).toBeUndefined();
    expect(result.reason).toContain('original_amount is missing');
    expect(result.payerAmount).toBe(5);
  });

  it('returns unavailable when refund_amount is not finite', () => {
    const result = computeRefundableBalance(detail({ refund_amount: Number.NaN }), 'USD');
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('refund_amount');
  });

  it('returns unavailable for a null/undefined detail object', () => {
    expect(computeRefundableBalance(undefined, 'USD').status).toBe('unavailable');
    expect(computeRefundableBalance(null, 'USD').status).toBe('unavailable');
  });

  it('returns unavailable for non-refundable statuses', () => {
    for (const status of ['PENDING', 'DECLINED', 'CANCELLED']) {
      const result = computeRefundableBalance(detail({ payment_status: status }), 'USD');
      expect(result.status).toBe('unavailable');
      expect(result.reason).toContain(status);
    }
  });

  it('accepts REFUNDED and PRE-AUTH as refundable states', () => {
    for (const status of ['REFUNDED', 'PRE-AUTH']) {
      const result = computeRefundableBalance(detail({ payment_status: status, refund_amount: 1 }), 'USD');
      expect(result.status).toBe('ok');
      expect(result.remaining).toBe(9);
    }
  });

  it('is exported from the package barrel with the result type', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.computeRefundableBalance).toBe('function');
    const result: RefundableBalanceResult = mod.computeRefundableBalance(detail({}), 'USD');
    expect(result.status).toBe('ok');
  });
});
