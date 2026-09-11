/**
 * get-transactions-by-mc-ref envelope normalization tests.
 *
 * The gateway answers TWO documented envelope variants and the SDK tolerates
 * both (gap G3, 2026-09-11):
 *  - production-captured: `{data: [...], status: {code: "00", message, merchant_ref}}`
 *  - doc-page: `{status: 0, transactions: []}`
 *
 * Both real sample bodies come from the Customer Module knowledge base
 * (`docs/archive/customermoudle-guide.md` §10.4) — merchant-captured production
 * data, pinned so the normalizer tracks the live contract.
 */

import { describe, expect, it, vi } from 'vitest';
import { createKhqrDomain, normalizeTransactionsByMerchantRefResponse } from '../domains/khqr.js';

const PRODUCTION_ENVELOPE = {
  data: [
    {
      transaction_id: '9495966779',
      transaction_date: '2025-10-08 09:55:15',
      bank_ref: '100FT153432232',
      apv: '123456',
      discount_amount: 0,
      payment_status: 'APPROVED',
      payment_amount: 0.01,
      payment_currency: 'USD',
      payment_type: 'ABA Pay',
      payer_account: '*123',
      total_amount: 0.01,
      original_amount: 0.01,
      original_currency: 'USD',
      payment_status_code: 0,
      bank_name: 'ABA Bank',
      refund_amount: 0,
      merchant_ref: 'INV-12345678',
    },
    {
      transaction_id: '2352051686',
      transaction_date: '2025-10-08 09:43:54',
      bank_ref: '100FT93434333',
      apv: '111111',
      discount_amount: 0,
      payment_status: 'APPROVED',
      payment_amount: 40000,
      payment_currency: 'KHR',
      payment_type: 'ABA Pay',
      payer_account: '*124',
      total_amount: 10,
      original_amount: 10,
      original_currency: 'USD',
      payment_status_code: 0,
      bank_name: 'ABA Bank',
      refund_amount: 0,
      merchant_ref: 'INV-12345678',
    },
  ],
  status: { code: '00', merchant_ref: 'INV-12345678', message: 'Success!' },
} as unknown as Record<string, unknown>;

const DOC_PAGE_ENVELOPE = {
  status: 0,
  transactions: [
    {
      transaction_id: '1571517653',
      payment_status: 'APPROVED',
      payment_amount: 10,
      payment_currency: 'USD',
      merchant_ref: 'INV-12345678',
    },
  ],
} as unknown as Record<string, unknown>;

describe('normalizeTransactionsByMerchantRefResponse', () => {
  it('normalizes the production-captured envelope: {data, status: {code: "00"}}', () => {
    const result = normalizeTransactionsByMerchantRefResponse('INV-12345678', PRODUCTION_ENVELOPE as never);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe('00');
    expect(result.statusMessage).toBe('Success!');
    expect(result.merchantRef).toBe('INV-12345678');
    expect(result.rows).toHaveLength(2);

    const [first, second] = result.rows;
    expect(first.transactionId).toBe('9495966779');
    expect(first.paymentStatus).toBe('APPROVED');
    expect(first.originalAmount).toBe(0.01);
    expect(first.merchantRef).toBe('INV-12345678');
    // The KHR row keeps payer-side money distinct from merchant-side money.
    expect(second.paymentAmount).toBe(40000);
    expect(second.paymentCurrency).toBe('KHR');
    expect(second.originalAmount).toBe(10);
    expect(second.originalCurrency).toBe('USD');

    // Raw body preserved unchanged for audit.
    expect(result.raw).toBe(PRODUCTION_ENVELOPE);
  });

  it('normalizes the doc-page envelope: {status: 0, transactions: []}', () => {
    const result = normalizeTransactionsByMerchantRefResponse('INV-12345678', DOC_PAGE_ENVELOPE as never);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe('0');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].transactionId).toBe('1571517653');
  });

  it('treats numeric code 0 inside a status object as success too', () => {
    const result = normalizeTransactionsByMerchantRefResponse('r', {
      data: [],
      status: { code: 0, message: 'OK' },
    } as never);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe('0');
    expect(result.statusMessage).toBe('OK');
  });

  it('an error status code (1 = wrong hash) is not success and rows stay empty', () => {
    const result = normalizeTransactionsByMerchantRefResponse('r', {
      status: { code: '1', message: 'Wrong hash' },
    } as never);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe('1');
    expect(result.rows).toEqual([]);
  });

  it('an empty body yields empty rows without throwing (raw passthrough)', () => {
    const result = normalizeTransactionsByMerchantRefResponse('r', {} as never);
    expect(result.rows).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBeUndefined();
  });
});

describe('khqr domain getTransactionsByMerchantRef (normalized through the request path)', () => {
  function makeDomain(response: unknown) {
    const request = vi.fn().mockResolvedValue(response);
    const domain = createKhqrDomain(
      { merchantId: 'ec000002', apiKey: 'key' } as never,
      request as never,
    );
    return { domain, request };
  }

  it('returns the normalized result while the wire body keeps the documented hash fields', async () => {
    const { domain, request } = makeDomain(PRODUCTION_ENVELOPE);
    const result = await domain.getTransactionsByMerchantRef('INV-12345678');

    expect(request).toHaveBeenCalledTimes(1);
    const [, body, hmacFields, timeField] = request.mock.calls[0];
    expect(body).toEqual({ merchant_ref: 'INV-12345678' });
    expect(hmacFields).toEqual(['req_time', 'merchant_id', 'merchant_ref']);
    expect(timeField).toBe('req_time');

    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it('forwards requestTime as req_time on the wire', async () => {
    const { domain, request } = makeDomain(DOC_PAGE_ENVELOPE);
    await domain.getTransactionsByMerchantRef('INV-1', '20250213084236');
    expect(request.mock.calls[0][1]).toEqual({
      merchant_ref: 'INV-1',
      req_time: '20250213084236',
    });
  });
});
