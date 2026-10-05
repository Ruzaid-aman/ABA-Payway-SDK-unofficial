import { describe, expect, it } from 'vitest';
import {
  type KhqrPaymentNotification,
  extractJsonPayload,
  parseKhqrPaymentNotification,
} from '../webhook/khqr-notification.js';

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

// ─── ABA delivery-contract tolerance: raw JSON vs HTML-wrapped bodies ─────
describe('extractJsonPayload (HTML-wrapped / payload variations)', () => {
  const wrappedHtml = [
    '<html><head><title>Notification</title></head>',
    '<body>',
    '<!-- proxy injection page -->',
    `<div id="payload">${JSON.stringify(notification)}</div>`,
    '</body></html>',
  ].join('\n');

  it('passes clean JSON through unchanged', () => {
    const direct = extractJsonPayload(JSON.stringify(notification));
    expect(parseKhqrPaymentNotification(direct).notification.transactionId).toBe('KHQR-20260821-001');
  });

  it('recovers the notification object from an HTML-wrapped body', () => {
    const extracted = extractJsonPayload(wrappedHtml);
    const parsed = parseKhqrPaymentNotification(extracted);
    expect(parsed.notification.transactionId).toBe('KHQR-20260821-001');
    expect(parsed.notification.paymentStatusCode).toBe(0);
  });

  it('handles braces inside string values without losing balance', () => {
    const tricky = JSON.stringify({ ...notification, payer_account: '{not "a" bracket}' });
    const inside = `<script>var x = ${tricky};</script>`;
    expect(() => parseKhqrPaymentNotification(extractJsonPayload(inside))).not.toThrow();
  });

  it('skips unparsable candidate blocks and still finds valid later JSON', () => {
    const withGarbageThenPayload = `${wrappedHtml}\n<script>window.LAST_ERROR = {broken: {</script>`;
    const extracted = extractJsonPayload(withGarbageThenPayload);
    // First balanced candidate is the real notification; garbage remains tail text.
    expect(parseKhqrPaymentNotification(extracted).notification.merchantRef).toBe('ORDER-100');
  });

  it('throws when no parseable object exists in the body', () => {
    expect(() => extractJsonPayload('<html><body>502 Bad Gateway</body></html>')).toThrow(/No parseable JSON object/);
  });
});
