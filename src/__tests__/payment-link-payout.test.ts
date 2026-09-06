/**
 * Behavior pins for the payment-link `payout` param (audit D2, sync-audit S1).
 *
 * Spec (payway-openapi/paths/payment-link.yaml plaintext_shape): `payout` is an
 * optional JSON `[{acc, amt}]` list inside the RSA-encrypted merchant_auth, and
 * the total payout must equal the link amount. Key split per endpoint: the
 * standalone payout domain + generate-qr use {account, amount}; the purchase
 * path, cof charge, and payment-link use {acc, amt}.
 *
 * Wire contract: `payout` travels INSIDE merchant_auth as a JSON string (the
 * whole auth payload is JSON.stringify'd by encryptMerchantAuth — an array
 * value would double-encode), and the top-level hash still covers only
 * request_time + merchant_id + merchant_auth.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { CreatePaymentLinkParams, PayWayConfig } from '../client.js';
import { createPaymentLinkDomain } from '../domains/payment-link.js';
import { PayWayConfigError } from '../errors.js';

const DUMMY_CONFIG = {} as unknown as PayWayConfig;

const VALID_PARAMS: CreatePaymentLinkParams = {
  title: 'T',
  amount: 5,
  merchantRefNo: 'ref-1',
  returnUrl: 'https://example.com/return',
};

type AuthCall = { path: string; authPayload: Record<string, unknown> };

function makeDomain(config: PayWayConfig = DUMMY_CONFIG): { domain: ReturnType<typeof createPaymentLinkDomain>; calls: AuthCall[] } {
  const calls: AuthCall[] = [];
  const requestWithMerchantAuth = async <T>(
    path: string,
    authPayload: Record<string, unknown>,
  ): Promise<T> => {
    calls.push({ path, authPayload });
    return { status: { code: '00' } } as T;
  };
  return { domain: createPaymentLinkDomain(config, requestWithMerchantAuth), calls };
}

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('paymentLink.create payout (audit D2)', () => {
  it('forwards payout entries into the merchant_auth payload as a JSON string', async () => {
    const { domain, calls } = makeDomain();
    await domain.create({
      ...VALID_PARAMS,
      payout: [
        { acc: '000999888', amt: 3.5 },
        { acc: '000999999', amt: 1.5 },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].authPayload.payout).toBe('[{"acc":"000999888","amt":3.5},{"acc":"000999999","amt":1.5}]');
  });

  it('passes a raw pre-encoded payout string through as-is', async () => {
    const { domain, calls } = makeDomain();
    await domain.create({ ...VALID_PARAMS, payout: '[{"acc":"000","amt":5}]' });

    expect(calls[0].authPayload.payout).toBe('[{"acc":"000","amt":5}]');
  });

  it('omits payout from the auth payload when not supplied', async () => {
    const { domain, calls } = makeDomain();
    await domain.create({ ...VALID_PARAMS });

    expect(calls[0].authPayload.payout).toBeUndefined();
  });

  it('throws for entries missing acc, empty acc, non-numeric amt, or negative amt', () => {
    const { domain } = makeDomain();
    // missing acc
    expect(() => domain.create({ ...VALID_PARAMS, payout: [{ amt: 5 } as { acc: string; amt: number }] })).toThrow(
      PayWayConfigError,
    );
    // empty acc — the shared validator (validatePayoutEntryShape) rejects it;
    // the pre-refactor CLI copy used to let it through.
    expect(() => domain.create({ ...VALID_PARAMS, payout: [{ acc: '', amt: 5 }] })).toThrow(/non-empty string "acc"/);
    // non-numeric amt
    expect(() => domain.create({ ...VALID_PARAMS, payout: [{ acc: '000', amt: '5' } as unknown as { acc: string; amt: number }] })).toThrow(
      PayWayConfigError,
    );
    // negative amt — same shared-validator gap the old CLI copy missed.
    expect(() => domain.create({ ...VALID_PARAMS, payout: [{ acc: '000', amt: -5 }] })).toThrow(/non-negative numeric "amt"/);
  });

  it('throws for an empty payout string', () => {
    const { domain } = makeDomain();
    expect(() => domain.create({ ...VALID_PARAMS, payout: '' })).toThrow(PayWayConfigError);
  });

  it('warns when the payout total does not equal the link amount (advisory)', async () => {
    const { domain, calls } = makeDomain();
    await domain.create({ ...VALID_PARAMS, amount: 5, payout: [{ acc: '000', amt: 4 }] });

    expect(calls).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('payout total 4 does not equal the link amount 5'),
    );
  });

  it('throws under strictValidation when the payout total mismatches', () => {
    const { domain } = makeDomain({ strictValidation: true } as unknown as PayWayConfig);
    expect(() => domain.create({ ...VALID_PARAMS, amount: 5, payout: [{ acc: '000', amt: 4 }] })).toThrow(
      PayWayConfigError,
    );
  });

  it('does not warn when the payout total equals the link amount', async () => {
    const { domain } = makeDomain();
    await domain.create({ ...VALID_PARAMS, amount: 5, payout: [{ acc: '000', amt: 2 }, { acc: '111', amt: 3 }] });

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('does not warn for a payout-string total it cannot compute', async () => {
    const { domain } = makeDomain();
    await domain.create({ ...VALID_PARAMS, amount: 5, payout: 'pre-encoded' });

    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('payment-link merchantRefNo 50-char cap (advisory, strict escalates)', () => {
  // Spec (payway-openapi/paths/payment-link.yaml plaintext_shape): the
  // merchant-side link reference is optional with a documented max length of
  // 50. The SDK requires it non-empty (stricter than the official "optional")
  // but the LENGTH cap stays advisory — the gateway is the final arbiter —
  // with strictValidation escalating the warn to a throw.
  it('warns when merchantRefNo exceeds 50 characters (advisory)', async () => {
    const { domain, calls } = makeDomain();
    await domain.create({ ...VALID_PARAMS, merchantRefNo: 'r'.repeat(51) });

    expect(calls).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("merchantRefNo exceeds the gateway's 50-character cap"));
  });

  it('does not warn at exactly 50 characters', async () => {
    const { domain } = makeDomain();
    await domain.create({ ...VALID_PARAMS, merchantRefNo: 'r'.repeat(50) });

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('throws under strictValidation when merchantRefNo exceeds 50 characters', () => {
    const { domain } = makeDomain({ strictValidation: true } as unknown as PayWayConfig);
    expect(() => domain.create({ ...VALID_PARAMS, merchantRefNo: 'r'.repeat(51) })).toThrow(PayWayConfigError);
  });
});

describe('payment-link expired_date advisory (codification C3, SANDBOX-FINDINGS §22 #3)', () => {
  // Sandbox-verified (2026-09-06): past values and offsets under ~5 minutes
  // are rejected with PTL04; +300s is accepted. The boundary is only
  // bracketed — (150s, 300s] — so the check is advisory (strict escalates)
  // with PAYMENT_LINK_EXPIRY_MIN_SECONDS = 300 as the conservative threshold.
  it('warns when expired_date is in the past', async () => {
    const { domain } = makeDomain();
    await domain.create({ ...VALID_PARAMS, expiredDate: Math.floor(Date.now() / 1000) - 3600 });

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('expired_date is in the past'));
  });

  it('warns when expired_date is under ~5 minutes out (+150s was rejected live)', async () => {
    const { domain } = makeDomain();
    await domain.create({ ...VALID_PARAMS, expiredDate: Math.floor(Date.now() / 1000) + 150 });

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('under ~5 minutes out'));
  });

  it('does not warn at exactly 300s ahead (accepted live)', async () => {
    // Fake timers pin `now` so the exactly-at-boundary case cannot flake on
    // second-granularity drift between the test's clock and the domain's.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T00:00:00Z'));
    try {
      const { domain } = makeDomain();
      await domain.create({ ...VALID_PARAMS, expiredDate: Math.floor(Date.now() / 1000) + 300 });

      expect(console.warn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not warn when expired_date is omitted or far out', async () => {
    const { domain } = makeDomain();
    await domain.create({ ...VALID_PARAMS });
    await domain.create({ ...VALID_PARAMS, expiredDate: Math.floor(Date.now() / 1000) + 86400 });

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('throws under strictValidation for a past expired_date', () => {
    const { domain } = makeDomain({ strictValidation: true } as unknown as PayWayConfig);
    expect(() => domain.create({ ...VALID_PARAMS, expiredDate: Math.floor(Date.now() / 1000) - 60 })).toThrow(
      PayWayConfigError,
    );
  });
});
