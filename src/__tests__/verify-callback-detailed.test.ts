/**
 * `verifyCallbackDetailed` — DX review 2026-08-30: the boolean-only verifier
 * cannot tell an integrator WHY a webhook failed. This suite pins the
 * reason taxonomy and the parity with `verifyCallbackSignature`.
 */
import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateHmac, verifyCallbackDetailed, verifyCallbackSignature } from '../auth.js';

const API_KEY = 'detailed-verify-api-key-0123456789';
const BODY = { tran_id: 'CB-001', apv: 'ABA0001', status: 0, amount: '12.50' };

function sign(payload: Record<string, unknown>, key = API_KEY): string {
  return crypto.createHmac('sha512', key).update(sha512Payload(payload)).digest('base64');
}

function sha512Payload(payload: Record<string, unknown>): string {
  return Object.keys(payload)
    .sort()
    .map((key) => {
      const val = payload[key];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    })
    .join('');
}

describe('verifyCallbackDetailed', () => {
  it('accepts a valid signature without a reason', () => {
    const result = verifyCallbackDetailed(BODY, sign(BODY), API_KEY);
    expect(result).toEqual({ valid: true });
  });

  it('reports signature_mismatch for a tampered body', () => {
    const sig = sign(BODY);
    const tampered = { ...BODY, amount: '99.99' };
    const result = verifyCallbackDetailed(tampered, sig, API_KEY);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('reports signature_mismatch for a wrong API key', () => {
    const result = verifyCallbackDetailed(BODY, sign(BODY, 'another-key-entirely'), API_KEY);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('reports malformed_signature for an empty or non-string signature', () => {
    expect(verifyCallbackDetailed(BODY, '', API_KEY)).toEqual({ valid: false, reason: 'malformed_signature' });
    expect(verifyCallbackDetailed(BODY, undefined as unknown as string, API_KEY)).toEqual({
      valid: false,
      reason: 'malformed_signature',
    });
  });

  it('reports empty_body for a null/missing body', () => {
    const sig = sign(BODY);
    expect(verifyCallbackDetailed(null as unknown as Record<string, unknown>, sig, API_KEY)).toEqual({
      valid: false,
      reason: 'empty_body',
    });
  });

  it('stripHash option: the hash field is invisible to canonicalization (even a wrong one)', () => {
    const sig = sign(BODY);
    const bodyWithHash = { ...BODY, hash: sig };
    expect(verifyCallbackDetailed(bodyWithHash, sig, API_KEY, { stripHash: true })).toEqual({ valid: true });

    // stripHash removes the field before canonicalization, so whatever value
    // it carries cannot break verification — matching the webhook server's
    // behavior (it strips hash itself).
    const bodyWithWrongHash = { ...BODY, hash: 'wrong' };
    expect(verifyCallbackDetailed(bodyWithWrongHash, sig, API_KEY, { stripHash: true })).toEqual({ valid: true });
  });

  it('stays byte-compatible with verifyCallbackSignature on all outcomes', () => {
    const sig = sign(BODY);
    const cases: [Record<string, unknown>, string, string][] = [
      [BODY, sig, 'valid'],
      [{ ...BODY, amount: '0.01' }, sig, 'tampered'],
      [{}, sig, 'empty-object'],
      [BODY, sig.slice(0, 20), 'truncated'],
    ];
    for (const [body, signature, label] of cases) {
      expect(verifyCallbackSignature(body, signature, API_KEY), label).toBe(
        verifyCallbackDetailed(body, signature, API_KEY).valid,
      );
    }
  });

  it('generateHmac and the verifier agree on flat scalar payloads', () => {
    // Request HMAC fields are flat scalars; the callback verifier JSON-encodes
    // nested values while generateHmac stringifies them — flat payloads are
    // the compatibility contract (PayWay callbacks carry no arrays).
    const body = { tran_id: 'CB-002', apv: 'ABA0001', note: null };
    const sig = generateHmac(body, Object.keys(body).sort(), API_KEY);
    expect(verifyCallbackDetailed(body, sig, API_KEY)).toEqual({ valid: true });
  });
});
