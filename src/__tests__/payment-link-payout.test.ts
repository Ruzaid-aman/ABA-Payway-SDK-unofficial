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

  it('throws for entries missing acc or with a non-numeric amt', () => {
    const { domain } = makeDomain();
    expect(() => domain.create({ ...VALID_PARAMS, payout: [{ amt: 5 } as { acc: string; amt: number }] })).toThrow(
      PayWayConfigError,
    );
    expect(() => domain.create({ ...VALID_PARAMS, payout: [{ acc: '000', amt: '5' } as unknown as { acc: string; amt: number }] })).toThrow(
      PayWayConfigError,
    );
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
