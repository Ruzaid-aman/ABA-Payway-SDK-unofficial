/**
 * Behavior pins for the generate-qr live-docs parity work (2026-08-31).
 *
 * Load-bearing contract: the hash list was extended from the SDK's original
 * 10-field subset to the live-documented 19-field order. Because
 * generateHmac pads omitted fields with '' and empty strings vanish under
 * concatenation, the HMAC for a caller that passes none of the new optional
 * params MUST be byte-identical to the pre-parity hash — otherwise every
 * existing integration would break on deploy.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateHmac } from '../auth.js';
import type { GenerateQrParams, PayWayConfig } from '../client.js';
import { createQrDomain } from '../domains/qr.js';
import { PayWayConfigError } from '../errors.js';

const CONFIG = {} as unknown as PayWayConfig;
const STRICT_CONFIG = { strictValidation: true } as unknown as PayWayConfig;

const BASE_PARAMS: GenerateQrParams = {
  transactionId: 'qr-test-1',
  amount: 6.12,
  paymentOption: 'abapay_khqr',
  callbackUrl: 'https://example.com/callback',
  currency: 'USD',
  lifetime: 360,
};

type RequestCall = { path: string; body: Record<string, unknown>; hmacFields: string[] };

function makeRequestSpy(): {
  spy: <TResponse>(path: string, body: Record<string, unknown>, hmacFields: string[]) => Promise<TResponse>;
  calls: RequestCall[];
} {
  const calls: RequestCall[] = [];
  const spy = async <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
  ): Promise<TResponse> => {
    calls.push({ path, body, hmacFields });
    return { status: { code: '0' }, qrString: 'x' } as TResponse;
  };
  return { spy, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateQr hash-order backward compatibility', () => {
  it('19-field order with omitted optionals hashes identically to the original 10-field order', () => {
    const legacyFields = [
      'req_time',
      'merchant_id',
      'tran_id',
      'amount',
      'purchase_type',
      'payment_option',
      'callback_url',
      'currency',
      'lifetime',
      'qr_image_template',
    ];
    const liveFields = [
      'req_time',
      'merchant_id',
      'tran_id',
      'amount',
      'items',
      'first_name',
      'last_name',
      'email',
      'phone',
      'purchase_type',
      'payment_option',
      'callback_url',
      'return_deeplink',
      'currency',
      'custom_fields',
      'return_params',
      'payout',
      'lifetime',
      'qr_image_template',
    ];
    const payload: Record<string, string> = {
      req_time: '20260831070000',
      merchant_id: 'merc1',
      tran_id: 'qr-test-1',
      amount: '6.12',
      purchase_type: 'purchase',
      payment_option: 'abapay_khqr',
      callback_url: 'aHR0cHM6Ly9leGFtcGxlLmNvbQ==',
      currency: 'USD',
      lifetime: '6',
      qr_image_template: 'template2',
    };
    const legacyHash = generateHmac(payload, legacyFields, 'k');
    const liveHash = generateHmac(payload, liveFields, 'k');
    expect(liveHash).toBe(legacyHash);
  });
});

describe('generateQr payload parity (live docs 2026-08-31)', () => {
  it('sends the 19-field hash list in the live-documented order', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.generateQr(BASE_PARAMS);
    expect(calls[0].hmacFields).toEqual([
      'req_time',
      'merchant_id',
      'tran_id',
      'amount',
      'items',
      'first_name',
      'last_name',
      'email',
      'phone',
      'purchase_type',
      'payment_option',
      'callback_url',
      'return_deeplink',
      'currency',
      'custom_fields',
      'return_params',
      'payout',
      'lifetime',
      'qr_image_template',
    ]);
  });

  it('keeps omitted optional params out of the body (subset contract unchanged)', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.generateQr(BASE_PARAMS);
    const body = calls[0].body;
    expect(body).toMatchObject({
      tran_id: 'qr-test-1',
      amount: '6.12',
      purchase_type: 'purchase',
      payment_option: 'abapay_khqr',
      currency: 'USD',
      lifetime: 6,
      qr_image_template: 'template2',
    });
    expect(body.items).toBeUndefined();
    expect(body.first_name).toBeUndefined();
    expect(body.return_deeplink).toBeUndefined();
    expect(body.payout).toBeUndefined();
  });

  it('encodes new optional params (objects base64, scalars verbatim) into the body', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.generateQr({
      ...BASE_PARAMS,
      items: [{ name: 'Coffee', quantity: 2, price: 3.06 }],
      firstName: 'Dara',
      lastName: 'Sok',
      email: 'dara@example.com',
      phone: '+85512345678',
      returnDeeplink: { ios_scheme: 'shop://', android_scheme: 'shop://' },
      customFields: { orderId: 'A-1' },
      returnParams: 'cart=9',
      payout: [{ account: '000111222', amount: 1 }],
      purchaseType: 'pre-auth',
    });
    const body = calls[0].body;
    expect(typeof body.items).toBe('string');
    expect(JSON.parse(Buffer.from(body.items as string, 'base64').toString('utf8'))).toEqual([
      { name: 'Coffee', quantity: 2, price: 3.06 },
    ]);
    expect(body.first_name).toBe('Dara');
    expect(body.last_name).toBe('Sok');
    expect(body.email).toBe('dara@example.com');
    expect(body.phone).toBe('+85512345678');
    expect(typeof body.return_deeplink).toBe('string');
    expect(JSON.parse(Buffer.from(body.return_deeplink as string, 'base64').toString('utf8'))).toEqual({
      ios_scheme: 'shop://',
      android_scheme: 'shop://',
    });
    expect(body.return_params).toBe('cart=9');
    expect(typeof body.payout).toBe('string');
    expect(body.purchase_type).toBe('pre-auth');
  });
});

describe('generateQr advisory validations', () => {
  it('warns once per distinct message for gateway length caps', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await domain.generateQr({ ...BASE_PARAMS, firstName: 'x'.repeat(21), email: `${'x'.repeat(51)}@e.com` });
    expect(warn).toHaveBeenCalledTimes(2);
    await domain.generateQr({ ...BASE_PARAMS, firstName: 'x'.repeat(21) });
    expect(warn).toHaveBeenCalledTimes(2); // deduped by message
  });

  it('warns when wechat/alipay is combined with KHR', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await domain.generateQr({ ...BASE_PARAMS, paymentOption: 'alipay', currency: 'KHR', amount: 4000 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('USD-only'));
  });

  it('escalates advisory violations to PayWayConfigError under strictValidation', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(STRICT_CONFIG, spy);
    // Validations run synchronously before the request promise is created.
    expect(() => domain.generateQr({ ...BASE_PARAMS, firstName: 'x'.repeat(21) })).toThrow(PayWayConfigError);
    expect(() => domain.generateQr({ ...BASE_PARAMS, email: `${'x'.repeat(51)}@e.com` })).toThrow(PayWayConfigError);
  });

  it('does not warn for values within the caps', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await domain.generateQr({
      ...BASE_PARAMS,
      firstName: 'Dara',
      items: Array.from({ length: 10 }, (_, i) => ({ name: `i${i}`, quantity: 1, price: 0.01 })),
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when items exceeds the former 10-entry cap (official cap is 50, rule QR-016)', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await domain.generateQr({
      ...BASE_PARAMS,
      items: Array.from({ length: 11 }, (_, i) => ({ name: `i${i}`, quantity: 1, price: 0.01 })),
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when items exceeds 50 entries, citing rule QR-016', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await domain.generateQr({
      ...BASE_PARAMS,
      items: Array.from({ length: 51 }, (_, i) => ({ name: `i${i}`, quantity: 1, price: 0.01 })),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('QR-016'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('50 line items'));
  });
});
