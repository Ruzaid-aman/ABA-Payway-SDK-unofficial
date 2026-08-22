import { describe, expect, it } from 'vitest';
import { type KhqrPaymentNotification, parseKhqrPaymentNotification } from '../webhook/khqr-notification.js';

const notification: KhqrPaymentNotification & Record<string, unknown> = {
  transaction_id: 'KHQR-20260821-001',
  transaction_date: '2026-08-21 10:15:30',
  original_currency: 'USD',
  original_amount: 12.5,
  bank_ref: 'BANK-REF-1',
  apv: '123456',
  payment_status_code: 0,
  payment_status: 'APPROVED',
  payment_currency: 'USD',
  payment_amount: 12.5,
  payment_type: 'KHQR',
  payer_account: 'payer@example.com',
  bank_name: 'Example Bank',
  merchant_ref: 'ORDER-100',
  future_field: { retained: true },
};

describe('parseKhqrPaymentNotification', () => {
  it('maps the published ABA notification fields and retains unknown payload data', () => {
    const parsed = parseKhqrPaymentNotification(notification);

    expect(parsed.kind).toBe('khqr-offline');
    expect(parsed.verification).toBe('unverified');
    expect(parsed.notification.transactionId).toBe('KHQR-20260821-001');
    expect(parsed.notification.merchantRef).toBe('ORDER-100');
    expect(parsed.notification.paymentStatusCode).toBe(0);
    expect(parsed.raw).toEqual(notification);
    expect(parsed.unknownFields).toEqual({ future_field: { retained: true } });
  });

  it.each([
    [{ ...notification, transaction_id: undefined }, 'transaction_id'],
    [{ ...notification, transaction_id: 123 }, 'transaction_id'],
  ])('rejects a notification with an invalid required %s field', (payload, field) => {
    expect(() => parseKhqrPaymentNotification(payload)).toThrow(field);
  });
});
