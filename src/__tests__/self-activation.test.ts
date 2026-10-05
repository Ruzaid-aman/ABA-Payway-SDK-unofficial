/**
 * Behavior pins for the online-self-activation trio — openapi-suite-coverage
 * W3 (2026-09-12).
 *
 * The contract is SPEC-DERIVED (docs/archive/Default module.openapi.json)
 * and NOT live-verified: these endpoints authenticate a registration
 * PARTNER. Pins cover the wire shape ({request_time, partner_id,
 * request_data, hash} — NO merchant_id), the per-endpoint HMAC algorithm
 * split (SHA256 / SHA512 anomaly preserved from the spec prose), the
 * chunked-RSA request_data encryption, and the local validation surface.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { generateHmac } from '../auth.js';
import { PayWay } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { createSelfActivationDomain } from '../domains/self-activation.js';
import { PayWayConfigError } from '../errors.js';
import { mockJsonResponse } from '../test/test-utils.js';
import type { PayWayConfig } from '../client.js';

/** 1024-bit key pair — chunked RSA needs a modulus that can take 117-byte chunks. */
const TEST_RSA = crypto.generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const TEST_RSA_PEM = TEST_RSA.publicKey;

const PARTNER_CONFIG: PayWayConfig = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  publicKeyPem: TEST_RSA_PEM,
  partnerId: 'partner-abc-123',
  partnerApiKey: 'partner-hmac-secret',
  environment: 'sandbox',
};

const BASE_PARAMS = {
  pushbackUrl: 'https://partner.example.com/pushback',
  redirectUrl: 'https://partner.example.com/done',
  registerRef: 'REG-0012',
  currency: 'USD' as const,
};

type PartnerCall = {
  path: string;
  requestData: Record<string, unknown>;
  options?: { hashAlgorithm?: 'sha256' | 'sha512'; bodyExtras?: Record<string, unknown>; requestTime?: string };
};

function makePartnerSpy() {
  const calls: PartnerCall[] = [];
  const spy = async <TResponse>(
    path: string,
    requestData: Record<string, unknown>,
    options?: PartnerCall['options'],
  ): Promise<TResponse> => {
    calls.push({ path, requestData, options });
    return { status: { code: '00', message: 'Success.' } } as TResponse;
  };
  return { spy, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selfActivation.registerMerchant (new-merchant)', () => {
  it('sends the spec request_data payload and signs with SHA256', async () => {
    const { spy, calls } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    await domain.registerMerchant({ ...BASE_PARAMS, merchantType: 1, type: 0 });

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(ENDPOINTS.registerNewMerchant);
    expect(calls[0].requestData).toEqual({
      pushback_url: 'https://partner.example.com/pushback',
      redirect_url: 'https://partner.example.com/done',
      register_ref: 'REG-0012',
      currency: 'USD',
      merchant_type: 1,
      type: 0,
    });
    expect(calls[0].options?.hashAlgorithm).toBe('sha256');
    expect(calls[0].options?.bodyExtras).toBeUndefined();
  });

  it('sends reference_id as a top-level body extra only when provided', async () => {
    const { spy, calls } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    await domain.registerMerchant({ ...BASE_PARAMS, referenceId: 'REG-0012' });
    expect(calls[0].options?.bodyExtras).toEqual({ reference_id: 'REG-0012' });
  });

  it('rejects a referenceId that does not match registerRef', async () => {
    const { spy } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    expect(() => domain.registerMerchant({ ...BASE_PARAMS, referenceId: 'OTHER' })).toThrow(PayWayConfigError);
  });

  it('rejects native-app type with a web redirectUrl', () => {
    const { spy } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    expect(() => domain.registerMerchant({ ...BASE_PARAMS, type: 1 })).toThrow(PayWayConfigError);
    expect(() =>
      domain.registerMerchant({ ...BASE_PARAMS, type: 1, redirectUrl: { ios_scheme: 'app://', android_scheme: 'app://' } }),
    ).not.toThrow();
  });

  it('rejects non-KHR/USD currencies and private/insecure URLs', () => {
    const { spy } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    expect(() => domain.registerMerchant({ ...BASE_PARAMS, currency: 'EUR' as 'USD' })).toThrow(PayWayConfigError);
    expect(() => domain.registerMerchant({ ...BASE_PARAMS, pushbackUrl: 'http://partner.example.com/pb' })).toThrow(
      PayWayConfigError,
    );
  });
});

describe('selfActivation.getCredentialInfo (get-mc-credential-info)', () => {
  it('signs with SHA512 per that endpoint prose (the spec inconsistency, preserved)', async () => {
    const { spy, calls } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    await domain.getCredentialInfo({ registerRef: 'REG-0012' });

    expect(calls[0].path).toBe(ENDPOINTS.getMerchantCredentialInfo);
    expect(calls[0].requestData).toEqual({ register_ref: 'REG-0012' });
    expect(calls[0].options?.hashAlgorithm).toBe('sha512');
  });
});

describe('selfActivation.getMerchantInfo (get-mc-info)', () => {
  it('requires requestTime (public_key_hash_encrypt covers it) and computes the hex HMAC', async () => {
    const { spy, calls } = makePartnerSpy();
    const domain = createSelfActivationDomain(PARTNER_CONFIG, spy);
    expect(() => domain.getMerchantInfo({ merchantKey: 'mk-1' })).toThrow(/requestTime is required/);

    await domain.getMerchantInfo({ merchantKey: 'mk-1', requestTime: '20260912000000' });
    expect(calls[0].path).toBe(ENDPOINTS.getMerchantInfo);
    expect(calls[0].options?.hashAlgorithm).toBe('sha256');
    expect(calls[0].options?.requestTime).toBe('20260912000000');
    expect(calls[0].requestData.merchant_key).toBe('mk-1');
    expect(calls[0].requestData.public_key_hash_encrypt).toBe(
      generateHmac(
        { partner_id: 'partner-abc-123', merchant_key: 'mk-1', request_time: '20260912000000' },
        ['partner_id', 'merchant_key', 'request_time'],
        TEST_RSA_PEM,
        'hex',
        'sha512',
      ),
    );
  });
});

describe('partner-auth wire shape (client level)', () => {
  it('sends JSON with partner_id + RSA request_data, no merchant_id, hash over the trio', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJsonResponse({ status: { code: '00', message: 'Success.' }, url: 'https://onboard', token: 'tok' }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay(PARTNER_CONFIG);
    const result = await payway.selfActivation.registerMerchant(BASE_PARAMS);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.registerNewMerchant);
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.partner_id).toBe('partner-abc-123');
    expect(body.request_time).toMatch(/^\d{14}$/);
    expect(body.merchant_id).toBeUndefined();
    // request_data is the chunked-RSA encryption of the JSON payload —
    // PKCS1 is randomized, so decrypt block-by-block and compare plaintext.
    // RSA_NO_PADDING + manual unpad (mirrors auth.test.ts): newer Node
    // hardening rejects RSA_PKCS1_PADDING for PRIVATE decryption, which
    // broke this test on some CI runners while passing on Node 24 locally.
    const encrypted = Buffer.from(body.request_data, 'base64');
    const blockCount = Math.ceil(encrypted.length / 128);
    expect(encrypted.length % 128).toBe(0);
    const decrypted = Buffer.concat(
      Array.from({ length: blockCount }, (_, i) => {
        const raw = crypto.privateDecrypt(
          { key: TEST_RSA.privateKey, padding: crypto.constants.RSA_NO_PADDING },
          encrypted.subarray(i * 128, (i + 1) * 128),
        );
        if (raw.length < 11 || raw[0] !== 0x00 || raw[1] !== 0x02) {
          throw new Error('Invalid PKCS#1 padding');
        }
        let index = 2;
        while (index < raw.length && raw[index] !== 0x00) {
          index += 1;
        }
        if (index >= raw.length - 1) {
          throw new Error('Invalid PKCS#1 padding');
        }
        return raw.subarray(index + 1);
      }),
    ).toString('utf8');
    expect(decrypted).toBe(
      JSON.stringify({
        pushback_url: 'https://partner.example.com/pushback',
        redirect_url: 'https://partner.example.com/done',
        register_ref: 'REG-0012',
        currency: 'USD',
      }),
    );
    // hash is HMAC-SHA256(base64) over partner_id . request_data . request_time
    expect(body.hash).toBe(
      generateHmac(body, ['partner_id', 'request_data', 'request_time'], 'partner-hmac-secret', 'base64', 'sha256'),
    );
    expect(result.status.code).toBe('00');
  });

  it('falls back to apiKey when partnerApiKey is unset and throws without partnerId', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJsonResponse({ status: { code: '00', message: 'Success.' } }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ ...PARTNER_CONFIG, partnerApiKey: undefined });
    await payway.selfActivation.getCredentialInfo({ registerRef: 'REG-0012' });
    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.hash).toBe(
      generateHmac(body, ['partner_id', 'request_data', 'request_time'], 'test-api-key-secret', 'base64', 'sha512'),
    );

    const noPartner = new PayWay({ ...PARTNER_CONFIG, partnerId: undefined });
    await expect(noPartner.selfActivation.getCredentialInfo({ registerRef: 'R' })).rejects.toThrow(PayWayConfigError);
  });
});

describe('generateHmac algorithm extension', () => {
  it('sha256 differs from sha512 for the same input', () => {
    const payload = { a: '1', b: '2' };
    const sha256 = generateHmac(payload, ['a', 'b'], 'k', 'base64', 'sha256');
    const sha512 = generateHmac(payload, ['a', 'b'], 'k');
    expect(sha256).not.toBe(sha512);
    expect(sha256).toHaveLength(44); // base64 sha256
    expect(sha512).toHaveLength(88); // base64 sha512
  });
});
