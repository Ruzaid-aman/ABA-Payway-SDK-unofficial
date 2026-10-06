import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectAdvisories, emitAdvisory, resetAdvisoryDedupeForTests } from '../core/advisories.js';
import type { AdvisoryRecord } from '../core/advisories.js';
import { PayWayConfigError } from '../errors.js';
import { warnAdvisory } from '../utils.js';
import { createCheckoutDomain } from '../domains/checkout.js';
import type { EnvelopeWarning } from '../cli/output/contract.js';

describe('advisories (WP-19)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetAdvisoryDedupeForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PAYWAY_ADVISORY_IGNORE;
  });

  it('strictValidation escalates an advisory and the message carries (rule ID)', () => {
    expect(() => emitAdvisory({ strictValidation: true }, 'items overflow', { ruleId: 'QR-016' })).toThrow(
      PayWayConfigError,
    );
    expect(() => emitAdvisory({ strictValidation: true }, 'items overflow', { ruleId: 'QR-016' })).toThrow(
      /\(rule QR-016\)/,
    );
  });

  it('strictEscalable:false + strictValidation does NOT throw, warns once', () => {
    emitAdvisory({ strictValidation: true }, 'legacy notice', {
      ruleId: 'PUR-003',
      strictEscalable: false,
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('[payway] legacy notice');
  });

  it('PAYWAY_ADVISORY_IGNORE suppresses warn+throw+collect even under strictValidation', () => {
    process.env.PAYWAY_ADVISORY_IGNORE = 'QR-016';
    emitAdvisory({ strictValidation: true }, 'items overflow', { ruleId: 'QR-016' });
    expect(console.warn).not.toHaveBeenCalled();
    expect(collectAdvisories()).toHaveLength(0);
  });

  it('ignore list is comma-separated, trimmed, case-insensitive', () => {
    process.env.PAYWAY_ADVISORY_IGNORE = ' qr-016 , GW-CAP-Email ';
    emitAdvisory(undefined, 'a', { ruleId: 'QR-016' });
    emitAdvisory(undefined, 'b', { ruleId: 'GW-CAP-EMAIL' });
    emitAdvisory(undefined, 'c', { ruleId: 'QR-013' });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(collectAdvisories().map((r) => r.ruleId)).toEqual(['QR-013']);
  });

  it('dedupes by ruleId: two messages, one rule id, one warn', () => {
    emitAdvisory(undefined, 'first', { ruleId: 'QR-016' });
    emitAdvisory(undefined, 'second', { ruleId: 'QR-016' });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('two different rule ids warn twice', () => {
    emitAdvisory(undefined, 'a', { ruleId: 'QR-016' });
    emitAdvisory(undefined, 'b', { ruleId: 'GW-CAP-EMAIL' });
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('collectAdvisories returns records with exact fields', () => {
    emitAdvisory(undefined, 'm', { ruleId: 'QR-016', source: 'official' });
    const recs = collectAdvisories();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toEqual({ ruleId: 'QR-016', message: 'm', severity: 'warning', source: 'official' });
  });

  it('strictValidation + plain warnAdvisory with default options still throws (default strictEscalable true)', () => {
    expect(() => warnAdvisory({ strictValidation: true }, 'plain')).toThrow(PayWayConfigError);
  });

  it('legacy purchase-option advisory does not throw under strictValidation', async () => {
    const request = async <T>(p: string): Promise<T> => ({ path: p, status: { code: '00' } }) as T;
    const config = {
      merchantId: 'm',
      apiKey: 'k',
      environment: 'sandbox',
      strictValidation: true,
    } as unknown as Parameters<typeof createCheckoutDomain>[0];
    const checkout = createCheckoutDomain(config, request, request, 'https://sandbox.example');
    await expect(
      checkout.purchase({
        transactionId: 't1',
        amount: 5,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        paymentOption: 'abapay',
      } as Parameters<typeof checkout.purchase>[0]),
    ).resolves.toBeDefined();
  });

  it('AdvisoryRecord is shape-compatible with EnvelopeWarning', () => {
    const record: AdvisoryRecord = { ruleId: 'QR-016', message: 'm', severity: 'warning', source: 'official' };
    const w: EnvelopeWarning = record;
    expect(w.ruleId).toBe('QR-016');
  });
});
