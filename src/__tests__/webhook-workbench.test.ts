/**
 * W-1 forwarder + W-2 fixture library coverage (P0 webhook workbench,
 * docs/competitive-analysis-cli-stripe-razorpay.md Wave 1).
 *
 * Pins the load-bearing contracts:
 * - fixture signatures round-trip through the SDK's own verifyCallbackDetailed
 *   (a correct receiver accepts them; the anti-checklist hash-duplication
 *   rule means both sides MUST be the same canonicalization);
 * - payment-link pushback fixtures carry NO hash field and status 0
 *   (SANDBOX-FINDINGS §22 V-1 live contract);
 * - forward failures never throw and never block capture (stats only);
 * - forwarded deliveries re-attach the original X-PAYWAY-HMAC-SHA512 header.
 */

import { describe, expect, it, vi } from 'vitest';
import { verifyCallbackDetailed } from '../auth.js';
import { WebhookForwarder, parseForwardHeaders } from '../webhook/forwarder.js';
import { buildWebhookFixture, WEBHOOK_FIXTURE_EVENTS } from '../webhook/fixtures.js';

const API_KEY = 'test-api-key-123';

describe('parseForwardHeaders', () => {
  it('parses the "Key1:Value1, Key2:Value2" CLI shape', () => {
    expect(parseForwardHeaders('X-Custom: yes, X-Other: no')).toEqual({
      'X-Custom': 'yes',
      'X-Other': 'no',
    });
  });

  it('returns an empty record for blank/absent specs and skips junk pairs', () => {
    expect(parseForwardHeaders(undefined)).toEqual({});
    expect(parseForwardHeaders('   ')).toEqual({});
    expect(parseForwardHeaders(':novalue, :alsoblank')).toEqual({});
  });
});

describe('WebhookForwarder', () => {
  it('rejects a non-http(s) URL at construction', () => {
    expect(() => new WebhookForwarder({ url: 'not-a-url' })).toThrow(/valid http\(s\) URL/);
    expect(() => new WebhookForwarder({ url: 'ftp://example.com' })).toThrow(/valid http\(s\) URL/);
  });

  it('POSTs the body with the original signature header and counts a 2xx as delivered', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const forwarder = new WebhookForwarder({
      url: 'http://localhost:3000/webhooks/aba',
      headers: { 'X-Custom': 'yes' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      quiet: true,
    });

    const outcome = await forwarder.forward('{"tran_id":"t1"}', {
      headers: { 'x-payway-hmac-sha512': 'sig-abc' },
      label: 'callback [wh_1]',
    });

    expect(outcome).toEqual({ ok: true, status: 200 });
    expect(forwarder.statistics).toEqual({ delivered: 1, failed: 0 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/webhooks/aba');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-PAYWAY-HMAC-SHA512']).toBe('sig-abc');
    expect(headers['X-Custom']).toBe('yes');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"tran_id":"t1"}');
  });

  it('never throws on transport failure — returns the error and counts it failed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED: receiver down');
    });
    const forwarder = new WebhookForwarder({ url: 'http://localhost:9/x', fetchImpl: fetchImpl as unknown as typeof fetch, quiet: true });

    const outcome = await forwarder.forward('{}', {});

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('ECONNREFUSED');
    expect(forwarder.statistics).toEqual({ delivered: 0, failed: 1 });
  });

  it('counts non-2xx receiver answers as failures without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 500 }));
    const forwarder = new WebhookForwarder({ url: 'http://localhost:9/x', fetchImpl: fetchImpl as unknown as typeof fetch, quiet: true });

    const outcome = await forwarder.forward('{}', {});

    expect(outcome).toEqual({ ok: false, status: 500 });
    expect(forwarder.statistics).toEqual({ delivered: 0, failed: 1 });
  });

  it('joins array-valued signature headers with commas', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const forwarder = new WebhookForwarder({ url: 'http://localhost:1/x', fetchImpl: fetchImpl as unknown as typeof fetch, quiet: true });
    await forwarder.forward('{}', { headers: { 'x-payway-hmac-sha512': ['a', 'b'] } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-PAYWAY-HMAC-SHA512']).toBe('a, b');
  });
});

describe('buildWebhookFixture', () => {
  it('exposes exactly the seven documented fixture events', () => {
    expect(WEBHOOK_FIXTURE_EVENTS).toEqual([
      'payment.approved',
      'payment.declined',
      'payment.pending',
      'payment.refunded',
      'payment.cancelled',
      'khqr.notification',
      'payment-link.pushback',
    ]);
  });

  it('signs online checkout fixtures so the SDK verifier accepts them (round-trip pin)', () => {
    for (const event of ['payment.approved', 'payment.declined', 'payment.pending', 'payment.refunded', 'payment.cancelled'] as const) {
      const fixture = buildWebhookFixture(event, API_KEY, { tranId: 't-fixed', amount: 12.5, currency: 'USD' });
      expect(fixture.route).toBe('/aba-payway-webhook');
      expect(fixture.verification).toBe('hmac');
      expect(fixture.signature).toBeTruthy();
      const verdict = verifyCallbackDetailed(
        fixture.parsed as Record<string, unknown>,
        fixture.signature as string,
        API_KEY,
        { stripHash: true },
      );
      expect(verdict).toEqual({ valid: true });
      expect(fixture.parsed.tran_id).toBe('t-fixed');
      expect(fixture.parsed.payment_status).toBe(event.split('.')[1].toUpperCase());
    }
  });

  it('produces a signature the verifier REJECTS when the receiver uses a different key', () => {
    const fixture = buildWebhookFixture('payment.approved', API_KEY);
    const verdict = verifyCallbackDetailed(
      fixture.parsed as Record<string, unknown>,
      fixture.signature as string,
      'wrong-key',
      { stripHash: true },
    );
    expect(verdict).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('refuses to build signed online fixtures without an API key (clear validation error)', () => {
    expect(() => buildWebhookFixture('payment.approved', undefined)).toThrow(/PAYWAY_API_KEY/);
    expect(() => buildWebhookFixture('payment.approved', '')).toThrow(/PAYWAY_API_KEY/);
  });

  it('builds the no-hash payment-link pushback contract: {tran_id, status: 0, merchant_ref_no}', () => {
    const fixture = buildWebhookFixture('payment-link.pushback', API_KEY, { tranId: '178865526240157', merchantRef: 'plvr-1' });
    expect(fixture.route).toBe('/aba-payway-pushback');
    expect(fixture.signature).toBeUndefined();
    expect(fixture.verification).toBe('check-transaction');
    expect(JSON.parse(fixture.body)).toEqual({ tran_id: '178865526240157', status: 0, merchant_ref_no: 'plvr-1' });
  });

  it('builds the offline KHQR notification shape (unsigned, check-transaction verification)', () => {
    const fixture = buildWebhookFixture('khqr.notification', API_KEY, { merchantRef: 'ORDER-100' });
    expect(fixture.route).toBe('/aba-payway-khqr-webhook');
    expect(fixture.signature).toBeUndefined();
    expect(fixture.verification).toBe('check-transaction');
    const parsed = JSON.parse(fixture.body) as Record<string, unknown>;
    for (const field of [
      'transaction_id',
      'transaction_date',
      'original_currency',
      'original_amount',
      'bank_ref',
      'apv',
      'payment_status_code',
      'payment_status',
      'payment_currency',
      'payment_amount',
      'payment_type',
      'payer_account',
      'bank_name',
      'merchant_ref',
    ]) {
      expect(parsed[field]).toBeDefined();
    }
  });

  it('formats KHR amounts as integers and USD with two decimals', () => {
    const khr = buildWebhookFixture('payment.approved', API_KEY, { amount: 40000, currency: 'KHR' });
    expect(khr.parsed.original_amount).toBe('40000');
    const usd = buildWebhookFixture('payment.approved', API_KEY, { amount: 10 });
    expect(usd.parsed.original_amount).toBe('10.00');
  });

  it('auto-generates transaction ids that respect the 20-char gateway limit', () => {
    const fixture = buildWebhookFixture('payment.approved', API_KEY);
    expect(fixture.tranId.length).toBeLessThanOrEqual(20);
  });
});
