/**
 * Behavior pins for `parsePaymentLinkPushback` (codification C1).
 *
 * The wire contract is LIVE-CAPTURED (SANDBOX-FINDINGS §22 addendum #9,
 * 2026-09-06, real simulator payment): the pushback POSTs
 * `{"tran_id":"…","status":0,"merchant_ref_no":"…"}` with NO hash field —
 * verification is check-transaction, never verifyCallback. `status` arrives
 * as numeric `0` while the official overview sample shows `"00"`; both mean
 * APPROVED. Unknown statuses stay on 'UNKNOWN' (raw value preserved) until
 * ABA documents the full value set (Q20).
 */
import { describe, expect, it } from 'vitest';
import { PayWayConfigError } from '../errors.js';
import { parsePaymentLinkPushback } from '../domains/payment-link.js';

const LIVE_BODY = '{"tran_id":"178865526240157","status":0,"merchant_ref_no":"plvr-v1-mtp34wx4"}';

describe('parsePaymentLinkPushback (codification C1)', () => {
  it('parses the live-captured body (JSON string)', () => {
    const pushback = parsePaymentLinkPushback(LIVE_BODY);
    expect(pushback).toEqual({
      tranId: '178865526240157',
      status: 'APPROVED',
      merchantRefNo: 'plvr-v1-mtp34wx4',
      raw: { tran_id: '178865526240157', status: 0, merchant_ref_no: 'plvr-v1-mtp34wx4' },
    });
  });

  it('accepts an already-parsed object', () => {
    const pushback = parsePaymentLinkPushback({ tran_id: '123', status: 0 });
    expect(pushback.tranId).toBe('123');
    expect(pushback.status).toBe('APPROVED');
    expect(pushback.merchantRefNo).toBeUndefined();
  });

  it('normalizes the official sample "00" and bare "0" strings to APPROVED', () => {
    expect(parsePaymentLinkPushback({ tran_id: '1', status: '00' }).status).toBe('APPROVED');
    expect(parsePaymentLinkPushback({ tran_id: '1', status: '0' }).status).toBe('APPROVED');
  });

  it('maps unknown statuses to UNKNOWN and preserves the raw value', () => {
    const pushback = parsePaymentLinkPushback({ tran_id: '1', status: '07' });
    expect(pushback.status).toBe('UNKNOWN');
    expect(pushback.raw.status).toBe('07');
  });

  it('coerces a numeric tran_id to string (pushbacks carry strings; responses carry numbers)', () => {
    expect(parsePaymentLinkPushback({ tran_id: 123, status: 0 }).tranId).toBe('123');
  });

  it('keeps unknown extra fields on raw (the gateway may extend the contract)', () => {
    const pushback = parsePaymentLinkPushback({ tran_id: '1', status: 0, merchant_ref_no: 'r', new_field: { a: 1 } });
    expect(pushback.raw.new_field).toEqual({ a: 1 });
  });

  it('preserves a hash field on raw if one ever appears (none observed live)', () => {
    const pushback = parsePaymentLinkPushback({ tran_id: '1', status: 0, hash: 'abc' });
    expect(pushback.raw.hash).toBe('abc');
  });

  it('throws for unparseable JSON strings', () => {
    expect(() => parsePaymentLinkPushback('not json {')).toThrow(PayWayConfigError);
    expect(() => parsePaymentLinkPushback('not json {')).toThrow(/not valid JSON/);
  });

  it('throws for non-object bodies', () => {
    expect(() => parsePaymentLinkPushback('[1,2,3]')).toThrow(/must be a JSON object/);
    expect(() => parsePaymentLinkPushback('42')).toThrow(/must be a JSON object/);
    expect(() => parsePaymentLinkPushback(null as unknown as string)).toThrow(/must be a JSON object/);
  });

  it('throws when tran_id is missing or blank (a misrouted request is not a payment)', () => {
    expect(() => parsePaymentLinkPushback({ status: 0 })).toThrow(/missing tran_id/);
    expect(() => parsePaymentLinkPushback({ tran_id: '  ', status: 0 })).toThrow(/missing tran_id/);
    expect(() => parsePaymentLinkPushback({ tran_id: null, status: 0 })).toThrow(/missing tran_id/);
  });

  it('treats a missing merchant_ref_no as absent, not an error', () => {
    const pushback = parsePaymentLinkPushback({ tran_id: '1', status: 0 });
    expect(pushback.merchantRefNo).toBeUndefined();
  });
});
