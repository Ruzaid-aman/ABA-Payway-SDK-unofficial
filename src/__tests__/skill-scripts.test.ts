import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for the dependency-free .cjs tools bundled with the skills
 * (under each skill's scripts folder). These scripts are plain CommonJS on
 * purpose (repo is ESM), so they are imported through createRequire.
 */
const require = createRequire(import.meta.url);

const khqr = require('../../skills/aba-payway-customer-qr/scripts/decode-khqr.cjs');
const manifest = require('../../skills/aba-payway-customer-qr/scripts/qr-manifest.cjs');
const signer = require('../../skills/aba-payway-hash/scripts/sign-request.cjs');
const verifier = require('../../skills/aba-payway-hash/scripts/verify-callback.cjs');
const mockCb = require('../../skills/aba-payway-hash/scripts/mock-callback.cjs');
const status = require('../../skills/aba-payway-check-transaction/scripts/decode-status.cjs');
const checkout = require('../../skills/aba-payway-first-payment/scripts/checkout-payload.cjs');
const reconcile = require('../../skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs');

const SAMPLE_CUSTOMER_QR =
  '00020101021130510016abaakhppxxx@abaa01153250602141550800208ABA Bank5204787653038405802KH5915Donation outlet6010BATTAMBANG624268380010PAYWAY@ABA0104693002071620916050119924001317871247638256803mmp63049955';

describe('decode-khqr.cjs (Customer Module QR validator)', () => {
  it('validates the CRC-16/CCITT-FALSE checksum of a real customer QR', () => {
    expect(khqr.crc16(SAMPLE_CUSTOMER_QR.replace(/63049955$/, '6304'))).toBe('9955');
    expect(khqr.crcValid(SAMPLE_CUSTOMER_QR)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const tampered = SAMPLE_CUSTOMER_QR.replace('Donation outlet', 'Donation outleX').replace(/63049955$/, '63041CDF');
    expect(khqr.crcValid(tampered)).toBe(false);
  });

  it('parses the TLV tree with nested templates', () => {
    const tree = khqr.parseTlv(SAMPLE_CUSTOMER_QR, '', '');
    const joined = tree.join('\n');
    expect(joined).toContain('[01]');
    expect(joined).toContain('"11"');
    expect(joined).toContain('[30.00]');
    expect(joined).toContain('abaakhppxxx@abaa');
    expect(joined).toContain('[62.68.02]');
    expect(joined).toContain('1620916');
    expect(joined).toContain('[99.68]');
    expect(joined).not.toContain('MALFORMED');
  });

  it('summarizes static/open-amount/USD flags', () => {
    const summary = khqr.summarize(SAMPLE_CUSTOMER_QR).join('\n');
    expect(summary).toContain('STATIC');
    expect(summary).toContain('OPEN');
    expect(summary).toContain('USD');
    expect(summary).toContain('Donation outlet');
  });
});

describe('qr-manifest.cjs (batch QR audit)', () => {
  it('extracts a manifest row from a customer QR payload', () => {
    const row = manifest.extractManifest(SAMPLE_CUSTOMER_QR, 'C:/x/dhitraj.jpg');
    expect(row.bakong_id).toBe('abaakhppxxx@abaa');
    expect(row.account_number).toBe('325060214155080');
    expect(row.bank).toBe('ABA Bank');
    expect(row.merchant_name).toBe('Donation outlet');
    expect(row.type).toBe('STATIC');
    expect(row.outlet_code).toBe('6930');
    expect(row.merchant_id).toBe('1620916');
    expect(row.profile_id).toBe('1787124763825');
    expect(row.mmp).toBe('mmp');
    expect(row.crc_valid).toBe(true);
  });
});

describe('sign-request.cjs (HMAC-SHA512 request signing)', () => {
  it('signs the get-mc-ref preset with the documented field order', () => {
    const { payload, concatenated } = signer.buildSignedPayload(
      'get-mc-ref',
      { req_time: '20250213084236', merchant_id: 'ec000002', merchant_ref: '17394277693' },
      'k',
    );
    expect(concatenated).toBe('20250213084236ec00000217394277693');
    expect(payload.hash).toBe(createHmac('sha512', 'k').update(concatenated).digest('base64'));
  });

  it('substitutes empty string for missing checkout fields (24-field order)', () => {
    const { concatenated } = signer.buildSignedPayload(
      'checkout',
      { req_time: 't', merchant_id: 'm', tran_id: 'x', amount: '10.00', currency: 'USD' },
      'k',
    );
    // req_time|merchant_id|tran_id|amount → 12 empty fields → currency → 7 empty fields
    expect(concatenated).toBe('tmx10.00USD');
  });

  it('generates UTC req_time in YYYYMMDDHHmmss format', () => {
    expect(signer.formatRequestTime(new Date(Date.UTC(2025, 1, 13, 8, 42, 36)))).toBe('20250213084236');
  });

  it('formats amounts per currency (USD 2dp, KHR integer)', () => {
    expect(signer.formatAmount(10, 'USD')).toBe('10.00');
    expect(signer.formatAmount(40000.4, 'KHR')).toBe('40000');
  });

  it('base64-encodes URLs but leaves plain strings untouched', () => {
    const b64 = Buffer.from('https://example.com/success', 'utf8').toString('base64');
    expect(signer.encodeBase64IfNeeded('https://example.com/success')).toBe(b64);
    expect(signer.encodeBase64IfNeeded('order-123')).toBe('order-123');
  });
});

describe('verify-callback.cjs (sorted-key callback verification)', () => {
  const body = {
    tran_id: 'order-123',
    amount: '10.00',
    merchant_ref: 'dt-one-8989',
    payment_status: 'APPROVED',
    customer: { customer_id: 'dt-one-8989', customer_name: 'dhitraj' },
  };

  it('concatenates sorted keys with JSON-encoded objects', () => {
    expect(verifier.buildConcatenated(body)).toBe(
      '10.00{"customer_id":"dt-one-8989","customer_name":"dhitraj"}dt-one-8989APPROVEDorder-123',
    );
  });

  it('accepts a correctly-signed callback and rejects a tampered one', () => {
    const sig = createHmac('sha512', 'secret').update(verifier.buildConcatenated(body)).digest('base64');
    expect(verifier.verifyCallback(body, sig, 'secret').valid).toBe(true);
    expect(verifier.verifyCallback(body, sig, 'wrong-key').valid).toBe(false);
    expect(verifier.verifyCallback({ ...body, amount: '99.00' }, sig, 'secret').valid).toBe(false);
  });
});

describe('mock-callback.cjs (signed fake callbacks)', () => {
  it('builds a body whose signature verifies with verify-callback.cjs', () => {
    const body = mockCb.buildCallbackBody({ 'tran-id': 'order-1', amount: 5.55, status: 'PENDING' });
    expect(body.payment_status).toBe('PENDING');
    expect(body.payment_status_code).toBe(2);
    expect(body.payment_amount).toBe('5.55');
    const sig = mockCb.signBody(body, 'secret');
    expect(verifier.verifyCallback(body, sig, 'secret').valid).toBe(true);
  });

  it('maps status names to sandbox-verified codes and rejects unknown statuses', () => {
    expect(mockCb.STATUS_CODES.REFUNDED).toBe(4);
    expect(() => mockCb.buildCallbackBody({ status: 'NOPE' })).toThrow();
  });
});

describe('decode-status.cjs (status/error decoding)', () => {
  it('decodes an APPROVED callback as terminal', () => {
    const out = status.decodeStatus({
      payment_status_code: 0,
      payment_status: 'APPROVED',
      transaction_id: '178702944869996',
      merchant_ref: 'dt-one-8989',
      payment_amount: 0.38,
      payment_currency: 'USD',
    });
    expect(out).toContain('APPROVED');
    expect(out).toContain('[TERMINAL');
    expect(out).toContain('dt-one-8989');
  });

  it('explains gateway and PTL error codes', () => {
    expect(status.GATEWAY_CODE_HINTS['1']).toContain('Wrong Hash');
    expect(status.GATEWAY_CODE_HINTS.PTL37).toContain('exceeds');
    const out = status.decodeStatus({ status: { code: '15', message: 'Invalid Merchant' } });
    expect(out).toContain('merchant_id not recognized');
  });
});

describe('checkout-payload.cjs (signed checkout payload + HTML form)', () => {
  it('builds a payload matching the SDK 24-field signing order', () => {
    const { payload, concatenated } = checkout.buildCheckoutPayload({
      tranId: 'order-123',
      amount: 10,
      currency: 'USD',
      merchantId: 'ec000002',
      apiKey: 'k',
      returnUrl: 'https://example.com/success',
      reqTime: '20250213084236',
    });
    expect(payload.tran_id).toBe('order-123');
    expect(payload.amount).toBe('10.00');
    expect(payload.return_url).toBe(Buffer.from('https://example.com/success').toString('base64'));
    expect(payload.hash).toBe(createHmac('sha512', 'k').update(concatenated).digest('base64'));
  });

  it('emits an HTML auto-post form containing all payload fields', () => {
    const { payload } = checkout.buildCheckoutPayload({
      tranId: 'order-1',
      amount: 40000,
      currency: 'KHR',
      merchantId: 'm',
      apiKey: 'k',
    });
    const html = checkout.buildHtmlForm(payload, checkout.CHECKOUT_URLS.sandbox);
    expect(html).toContain(checkout.CHECKOUT_URLS.sandbox);
    for (const field of Object.keys(payload)) {
      expect(html).toContain(`name="${field}"`);
    }
  });

  it('rejects invalid tran_id and non-2dp USD amounts', () => {
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'bad id!', amount: 1, merchantId: 'm', apiKey: 'k' }),
    ).toThrow();
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 1.999, currency: 'USD', merchantId: 'm', apiKey: 'k' }),
    ).toThrow();
  });
});

describe('reconcile.cjs (watermark/dedupe helpers)', () => {
  it('treats transactions newer than the watermark as fresh (lexicographic dates)', () => {
    expect(reconcile.isNewerThan({ transaction_date: '2026-08-25 10:00:00' }, '2026-08-25 09:59:59')).toBe(true);
    expect(reconcile.isNewerThan({ transaction_date: '2026-08-25 09:59:59' }, '2026-08-25 09:59:59')).toBe(false);
    expect(reconcile.isNewerThan({ transaction_date: '2026-08-25 10:00:00' }, null)).toBe(true);
  });

  it('serializes rows to CSV with quoting', () => {
    // payment_status is the 4th of 15 columns
    expect(reconcile.toCsvRow({ transaction_id: '1', payment_status: 'APPROVED' })).toBe('1,,,APPROVED,,,,,,,,,,,');
    expect(reconcile.toCsvRow({ transaction_id: 'x,y', payment_status: 'OK' }).startsWith('"x,y",')).toBe(true);
    expect(reconcile.CSV_COLUMNS).toContain('payment_status_code');
  });

  it('signs the get-mc-ref request as req_time+merchant_id+merchant_ref', () => {
    const hash = reconcile.signRequest('20250213084236', 'ec000002', '17394277693', 'k');
    expect(hash).toBe(createHmac('sha512', 'k').update('20250213084236ec00000217394277693').digest('base64'));
  });
});
