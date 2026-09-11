/**
 * Customer Module callback parser + classifier tests.
 *
 * Both sample bodies are the REAL merchant-captured payloads from the
 * Customer Module knowledge base (`docs/archive/customermoudle-guide.md` §7.4
 * and `docs/archive/customer module.md` §1.4) — pinned so the parser tracks
 * the live contract, not a synthetic ideal.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyCallback,
  parseCustomerQrCallback,
  type CallbackKind,
} from '../webhook/customer-callback.js';

const REAL_CUSTOMER_QR_CALLBACK = {
  payment_status_code: 0,
  transaction_id: '178702944869996',
  payment_status: 'APPROVED',
  apv: '118954',
  original_amount: 0.38,
  original_currency: 'USD',
  payment_amount: 0.38,
  payment_currency: 'USD',
  payment_type: 'ABA Pay',
  transaction_date: '2026-08-18 12:04:08',
  bank_ref: '100SB1787029448',
  payer_account: '*001',
  payer_name: 'Payer Name',
  bank_name: 'ABA Bank',
  merchant_ref: 'dt-one-8989',
  customer: {
    type: 'individual',
    customer_id: 'dt-one-8989',
    customer_name: 'dhitraj',
    vat_tin: 'Test organization',
    email: 'ruzaid0101+alavps@gmail.com',
    phone: '+85596 407 4052',
    address: '2740 Barnes Avenue Bronx,',
    remark: '',
  },
} as const;

const REAL_MC_REF_ROW = {
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
} as const;

describe('parseCustomerQrCallback', () => {
  it('parses the real captured Customer Module callback exactly', () => {
    const parsed = parseCustomerQrCallback(REAL_CUSTOMER_QR_CALLBACK);
    expect(parsed.kind).toBe('customer-module-qr');
    expect(parsed.schema).toBe('aba-customer-qr-callback-v1');
    expect(parsed.verification).toBe('unverified');
    expect(parsed.notification.transactionId).toBe('178702944869996');
    expect(parsed.notification.merchantRef).toBe('dt-one-8989');
    expect(parsed.notification.payerName).toBe('Payer Name');
    expect(parsed.notification.paymentStatusCode).toBe(0);
    expect(parsed.notification.paymentStatus).toBe('APPROVED');
    expect(parsed.notification.originalAmount).toBe(0.38);
    expect(parsed.notification.originalCurrency).toBe('USD');
    expect(parsed.notification.customer).toEqual({
      type: 'individual',
      customer_id: 'dt-one-8989',
      customer_name: 'dhitraj',
      vat_tin: 'Test organization',
      email: 'ruzaid0101+alavps@gmail.com',
      phone: '+85596 407 4052',
      address: '2740 Barnes Avenue Bronx,',
      remark: '',
    });
    // Nothing outside the published shape in the real sample.
    expect(parsed.unknownFields).toEqual({});
    expect(parsed.raw).toBe(REAL_CUSTOMER_QR_CALLBACK as unknown as Record<string, unknown>);
  });

  it('customer is optional — a KHQR-shaped body without it still parses as customer-qr when the caller knows the route', () => {
    const { customer, ...withoutCustomer } = REAL_CUSTOMER_QR_CALLBACK;
    void customer;
    const parsed = parseCustomerQrCallback(withoutCustomer);
    expect(parsed.notification.customer).toBeUndefined();
    expect(parsed.notification.merchantRef).toBe('dt-one-8989');
  });

  it('keeps unknown fields forward-compatible (never rejected)', () => {
    const withExtra = { ...REAL_CUSTOMER_QR_CALLBACK, new_future_aba_field: 'x' } as Record<string, unknown>;
    const parsed = parseCustomerQrCallback(withExtra);
    expect(parsed.unknownFields).toEqual({ new_future_aba_field: 'x' });
  });

  it('throws a TypeError naming the first missing/ill-typed required field', () => {
    expect(() => parseCustomerQrCallback({})).toThrow(/transaction_id must be a string/);
    expect(() => parseCustomerQrCallback({ ...REAL_CUSTOMER_QR_CALLBACK, original_amount: '0.38' })).toThrow(
      /original_amount must be a finite number/,
    );
    expect(() => parseCustomerQrCallback({ ...REAL_CUSTOMER_QR_CALLBACK, customer: 'oops' })).toThrow(
      /customer must be an object/,
    );
    expect(() => parseCustomerQrCallback(null)).toThrow(/must be an object/);
    expect(() => parseCustomerQrCallback([REAL_CUSTOMER_QR_CALLBACK])).toThrow(/must be an object/);
  });

  it('optional customer sub-fields tolerate non-string values by omission (forward compatibility)', () => {
    const withTyped = {
      ...REAL_CUSTOMER_QR_CALLBACK,
      customer: { type: 'individual', customer_id: 'dt-one-8989', email: 42 },
    };
    const parsed = parseCustomerQrCallback(withTyped);
    expect(parsed.notification.customer?.email).toBeUndefined();
    expect(parsed.notification.customer?.customer_id).toBe('dt-one-8989');
  });
});

describe('classifyCallback', () => {
  const cases: Array<[string, unknown, CallbackKind]> = [
    ['real customer-module callback', REAL_CUSTOMER_QR_CALLBACK, 'customer-module-qr'],
    ['real mc-ref row (has transaction_id + merchant_ref, no customer)', REAL_MC_REF_ROW, 'khqr-offline'],
    ['online checkout callback', { tran_id: 't1', status: 'APPROVED', apv: '123' }, 'online-checkout'],
    ['payment-link pushback trio', { tran_id: '178865526240157', status: 0, merchant_ref_no: 'plvr-v1' }, 'payment-link-pushback'],
    ['empty object', {}, 'unknown'],
    ['non-object', 'nope', 'unknown'],
    ['null', null, 'unknown'],
    ['array', [REAL_CUSTOMER_QR_CALLBACK], 'unknown'],
  ];

  for (const [name, payload, expected] of cases) {
    it(`classifies ${name} → ${expected}`, () => {
      expect(classifyCallback(payload)).toBe(expected);
    });
  }

  it('an online checkout body with a merchant_ref but no status stays online (tran_id wins over transaction_id)', () => {
    // tran_id + status is the online contract; transaction_id+merchant_ref is
    // the KHQR contract. A body carrying tran_id+status is online regardless
    // of other fields.
    expect(classifyCallback({ tran_id: 't1', status: 'PENDING', merchant_ref: 'r1' })).toBe('online-checkout');
  });

  it('a body with transaction_id + merchant_ref + payer_name but NO customer is khqr-offline', () => {
    const { customer, ...withoutCustomer } = REAL_CUSTOMER_QR_CALLBACK;
    void customer;
    expect(classifyCallback(withoutCustomer)).toBe('khqr-offline');
  });

  it('a KHQR notification with a customer object is a customer-module callback (nested customer wins)', () => {
    expect(
      classifyCallback({
        ...REAL_MC_REF_ROW,
        customer: { customer_id: 'dt-one-8989', customer_name: 'dhitraj' },
      }),
    ).toBe('customer-module-qr');
  });

  it('a pushback body with EXTRA fields (>5 keys) still classifies as pushback (merchant_ref_no is contract-unique)', () => {
    expect(
      classifyCallback({
        tran_id: '178865526240157',
        status: 0,
        merchant_ref_no: 'plvr-v1',
        extra_future_field: 'x',
        another: 1,
        and_another: true,
      }),
    ).toBe('payment-link-pushback');
  });

  it('an online-checkout body that also carries a customer KEY (not object shape + transaction_id) stays online', () => {
    expect(
      classifyCallback({ tran_id: 't1', status: 'APPROVED', customer: 'not-an-object' }),
    ).toBe('online-checkout');
  });

  it('a body with customer object but NO transaction_id is not customer-module (falls through, conservative)', () => {
    expect(classifyCallback({ customer: { customer_id: 'c1' }, merchant_ref: 'r1' })).toBe('unknown');
  });

  it('a body carrying BOTH tran_id and transaction_id + status + customer resolves customer-module (transaction_id + customer wins)', () => {
    expect(
      classifyCallback({
        tran_id: 't1',
        transaction_id: 'tx2',
        status: 'APPROVED',
        customer: { customer_id: 'c1' },
      }),
    ).toBe('customer-module-qr');
  });
});
