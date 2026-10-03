/**
 * Pins for the 2026-10-03 ABA-bot-relay audit wave: behaviors the SDK changed
 * (or confirmed) to match the captured knowledge — DECLINDED tolerance, new
 * refund/credential codes, production token_flag subsets, the ROLLING 90-day
 * token window, the raw-body callback verifier, the checkout-form `lang`
 * option, and the payment-link image width/filename constraints.
 */
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  signCallbackBody,
  verifyCallbackDetailed,
  verifyCallbackSignatureRaw,
} from '../auth.js';
import type { PayWayConfig } from '../client.js';
import {
  CREDENTIAL_ERROR_CODES,
  REFUND_ERROR_CODES,
  TOKEN_FLAG_CHARGING,
  TOKEN_FLAG_CHARGING_PRODUCTION,
  TOKEN_FLAG_LINKING_PRODUCTION,
} from '../constants.js';
import { createCheckoutDomain } from '../domains/checkout.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import {
  createPaymentLinkDomain,
  imageWidthFromBytes,
  PAYMENT_LINK_IMAGE_MAX_WIDTH_PX,
} from '../domains/payment-link.js';
import { explainPayWayCode } from '../cli/explain-code.js';
import { loadPaymentLinkImage } from '../cli/payment-link-image.js';
import { markTokenCharged, saveLinkedToken, tokenExpiryStatus } from '../webhook/token-store.js';
import { PayWayConfigError } from '../errors.js';
import * as utilsModule from '../utils.js';

// ---------------------------------------------------------------------------
// Error codes: PTL187 + credential rotation family
// ---------------------------------------------------------------------------

describe('relay-wave error codes', () => {
  it('maps PTL187 to the refund family with the undocumented-floor hint', () => {
    const explained = explainPayWayCode('PTL187');
    expect(explained?.family).toBe('refund');
    expect(explained?.title).toBe('Refund amount below the minimum allowed');
    expect(explained?.hint).toMatch(/undocumented/i);
  });

  it('exposes the credential rotation codes with zero-overlap guidance', () => {
    expect(CREDENTIAL_ERROR_CODES.STALE_CREDENTIALS).toBe('PTL171');
    expect(CREDENTIAL_ERROR_CODES.WRONG_ENCRYPTION).toBe('PTL175');
    const stale = explainPayWayCode('PTL171');
    expect(stale?.family).toBe('credential');
    expect(stale?.hint).toMatch(/no dual-key overlap/i);
    const wrongEncryption = explainPayWayCode('PTL175');
    expect(wrongEncryption?.family).toBe('credential');
    expect(wrongEncryption?.hint).toMatch(/RSA/i);
  });
});

// ---------------------------------------------------------------------------
// Production token_flag subsets
// ---------------------------------------------------------------------------

describe('production token_flag subsets', () => {
  it('carry exactly the spec-documented values', () => {
    expect(TOKEN_FLAG_LINKING_PRODUCTION).toEqual(['CITI_FLEX', 'CITO_FLEX']);
    expect(TOKEN_FLAG_CHARGING_PRODUCTION).toEqual(['CITU_FLEX', 'MITU_FLEX', 'MITR_FIX']);
    // The full enums stay supersets (sandbox accepts the extra variants).
    expect(TOKEN_FLAG_CHARGING).toEqual(expect.arrayContaining(TOKEN_FLAG_CHARGING_PRODUCTION));
  });

  it('advises (does not throw) when charging with out-of-spec flags', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { merchantId: 'm', apiKey: 'k', environment: 'sandbox' } as unknown as PayWayConfig;
    const domain = createCredentialsOnFileDomain(config, async () => ({ status: { code: '00' } }) as never);
    await domain.payment({
      requestId: 'REQ123',
      transactionId: 'TX-1',
      amount: 5,
      paymentToken: 'pwt-1',
      tokenFlag: 'MITU_FIX',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/outside the production-documented charging set/),
    );
    warnSpy.mockRestore();
  });

  it('stays silent for production-valid charging flags', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { merchantId: 'm', apiKey: 'k', environment: 'sandbox' } as unknown as PayWayConfig;
    const domain = createCredentialsOnFileDomain(config, async () => ({ status: { code: '00' } }) as never);
    await domain.payment({
      requestId: 'REQ124',
      transactionId: 'TX-2',
      amount: 5,
      paymentToken: 'pwt-1',
      tokenFlag: 'MITR_FIX',
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Rolling 90-day token window
// ---------------------------------------------------------------------------

describe('rolling token expiry anchor', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  const capturedAt = '2026-06-01T00:00:00.000Z'; // grant 124 days before `now`
  const lastChargedAt = '2026-09-20T00:00:00.000Z'; // charged 13 days before `now`

  it('counts validity from the last successful charge, not the capture', () => {
    const status = tokenExpiryStatus({ capturedAt, lastChargedAt }, now);
    expect(status.status).toBe('valid');
    expect(status.daysLeft).toBe(77); // 90 − 13
  });

  it('renewal still restarts the window when no charge is recorded', () => {
    const status = tokenExpiryStatus({ capturedAt, renewedAt: '2026-09-01T00:00:00.000Z' }, now);
    expect(status.status).toBe('valid');
    expect(status.daysLeft).toBe(58); // 90 − 32 (Sep 1 → Oct 3)
  });

  it('a NEWER charge beats an older renewal (latest of the three anchors)', () => {
    const status = tokenExpiryStatus(
      { capturedAt, renewedAt: '2026-08-01T00:00:00.000Z', lastChargedAt },
      now,
    );
    expect(status.daysLeft).toBe(77);
  });

  it('expires when no anchor event happened within 90 days (old behavior preserved)', () => {
    const status = tokenExpiryStatus({ capturedAt }, now);
    expect(status.status).toBe('expired');
  });

  it('markTokenCharged persists the charge anchor (json store)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-tok-'));
    try {
      const env = { PAYWAY_TOKEN_STORE_DIR: dir } as NodeJS.ProcessEnv;
      saveLinkedToken({ ctid: 'ctid-roll', pwt: 'pwt-roll', capturedAt }, dir, env);
      const charged = markTokenCharged('ctid-roll', 'pwt-roll', lastChargedAt, dir, env);
      expect(charged?.lastChargedAt).toBe(lastChargedAt);
      const status = tokenExpiryStatus({ capturedAt, lastChargedAt: charged?.lastChargedAt }, now);
      expect(status.status).toBe('valid');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Raw-body callback verifier (Customer Module contract)
// ---------------------------------------------------------------------------

function rawBodyHmac(raw: string, key: string): string {
  return createHmac('sha512', key).update(raw).digest('base64');
}

describe('verifyCallbackSignatureRaw', () => {
  const apiKey = 'relay-wave-key';

  it('verifies an HMAC computed over the exact raw bytes', () => {
    const raw = '{"apv":"APV1","status":0,"tran_id":"178865526240157"}';
    const sig = rawBodyHmac(raw, apiKey);
    expect(verifyCallbackSignatureRaw(raw, sig, apiKey)).toBe(true);
    expect(verifyCallbackSignatureRaw(Buffer.from(raw), sig, apiKey)).toBe(true);
  });

  it('rejects a re-serialized body whose bytes differ from the signed payload', () => {
    // Signed over key order (status, tran_id, apv); a re-serialized body with
    // reordered keys must NOT verify raw — the point of raw-body mode.
    const raw = '{"status":0,"tran_id":"178865526240157","apv":"APV1"}';
    const sig = rawBodyHmac(raw, apiKey);
    const reordered = '{"apv":"APV1","status":0,"tran_id":"178865526240157"}';
    expect(verifyCallbackSignatureRaw(reordered, sig, apiKey)).toBe(false);
  });

  it('rejects malformed signatures and wrong keys', () => {
    const raw = '{"a":1}';
    expect(verifyCallbackSignatureRaw(raw, '', apiKey)).toBe(false);
    expect(verifyCallbackSignatureRaw(raw, 'not-a-signature', apiKey)).toBe(false);
    expect(verifyCallbackSignatureRaw(raw, rawBodyHmac(raw, 'other-key'), apiKey)).toBe(false);
  });

  it('agrees with the sorted-key verifier on a canonically-keyed body', () => {
    const canonical = '{"apv":"APV1","status":0,"tran_id":"178865526240157"}';
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    const sortedSig = signCallbackBody(parsed, apiKey);
    expect(verifyCallbackDetailed(parsed, sortedSig, apiKey).valid).toBe(true);
    // For this byte-identical body the raw-body HMAC matches the sorted-key result.
    expect(verifyCallbackSignatureRaw(canonical, rawBodyHmac(canonical, apiKey), apiKey)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Checkout form ?lang= option
// ---------------------------------------------------------------------------

describe('checkout form lang option', () => {
  const base = { transactionId: 'order-lang', amount: 9, currency: 'USD' as const };
  const makeDomain = () =>
    createCheckoutDomain({ merchantId: 'mid', apiKey: 'key' }, vi.fn(), vi.fn(), 'https://override.example');

  it('appends ?lang=km to the action URL', () => {
    const html = makeDomain().getCheckoutFormHtml({ ...base, lang: 'km' });
    expect(html).toMatch(/action="https:\/\/override\.example\/api\/payment-gateway\/v1\/payments\/purchase\?lang=km"/);
  });

  it('leaves the action URL untouched without lang', () => {
    const html = makeDomain().getCheckoutFormHtml(base);
    expect(html).not.toContain('?lang=');
  });

  it('rejects unsupported locales before any signing', () => {
    expect(() => makeDomain().getCheckoutFormHtml({ ...base, lang: 'fr' as 'en' })).toThrow(PayWayConfigError);
  });

  it('never leaks lang into the signed payload (hash identical with/without)', () => {
    vi.spyOn(utilsModule, 'formatRequestTime').mockReturnValue('20261003000000');
    try {
      const domain = makeDomain();
      const without = domain.createTransaction(base);
      const withLang = domain.createTransaction({ ...base, lang: 'zh' });
      expect(withLang.hash).toBe(without.hash);
      expect(Object.keys(withLang)).not.toContain('lang');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ---------------------------------------------------------------------------
// Payment-link image width + filename constraints
// ---------------------------------------------------------------------------

function pngWithWidth(width: number): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(17);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 13); // IHDR data length
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4); // "IHDR"
  view.setUint32(8, width);
  view.setUint32(12, 8); // height 8px
  // (bytes 16: bit depth/color type/compression/filter/interlace = zeros)
  const out = new Uint8Array(signature.length + ihdr.length);
  out.set(signature, 0);
  out.set(ihdr, signature.length);
  return out;
}

function jpegWithWidth(width: number): Uint8Array {
  // SOI + SOF0: FFD8, FFC0, len=000B, precision=08, height, width, then a few
  // component-spec bytes (a real SOF0 always carries more after the header).
  const out = new Uint8Array(16);
  out.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08]);
  const view = new DataView(out.buffer);
  view.setUint16(7, 100); // height
  view.setUint16(9, width); // width
  out.set([0x03, 0x01, 0x22, 0x00, 0x00], 11);
  return out;
}

describe('imageWidthFromBytes', () => {
  it('reads PNG width from the IHDR header', () => {
    expect(imageWidthFromBytes(pngWithWidth(2000))).toBe(2000);
    expect(imageWidthFromBytes(pngWithWidth(1999))).toBe(1999);
  });

  it('reads JPEG width from the SOF0 marker', () => {
    expect(imageWidthFromBytes(jpegWithWidth(3000))).toBe(3000);
  });

  it('returns null for unrecognized or truncated data', () => {
    expect(imageWidthFromBytes(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
    expect(imageWidthFromBytes(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe('relay-wave image constraints', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let dir: string;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    dir = mkdtempSync(path.join(tmpdir(), 'payway-relay-img-'));
  });

  afterEach(() => {
    warnSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  const makeDomain = () =>
    createPaymentLinkDomain(
      { merchantId: 'm', apiKey: 'k', environment: 'sandbox' } as unknown as PayWayConfig,
      async () => ({}) as never,
    );

  it('warns when a PNG exceeds the 2,000px documented width (domain advisory)', async () => {
    await makeDomain().create({
      title: 'relay',
      amount: 5,
      merchantRefNo: 'ref-relay-w',
      returnUrl: 'https://example.com/return',
      image: { data: pngWithWidth(2400), filename: 'brand.png', contentType: 'image/png' },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/2400px exceeds the documented 2000px/));
  });

  it('warns on special characters in the image filename (domain advisory)', async () => {
    await makeDomain().create({
      title: 'relay',
      amount: 5,
      merchantRefNo: 'ref-relay-f',
      returnUrl: 'https://example.com/return',
      image: { data: pngWithWidth(100), filename: 'brand (final).png', contentType: 'image/png' },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/special characters/));
  });

  it('hard-rejects an over-wide image in the CLI loader', () => {
    const file = path.join(dir, 'wide.png');
    writeFileSync(file, pngWithWidth(2400));
    expect(() => loadPaymentLinkImage(file)).toThrow(/2400px, exceeding the documented 2000px/);
  });

  it('hard-rejects a special-character filename in the CLI loader', () => {
    const file = path.join(dir, 'brand (1).png');
    writeFileSync(file, pngWithWidth(100));
    expect(() => loadPaymentLinkImage(file)).toThrow(/special characters/);
  });

  it('accepts compliant images through both layers', () => {
    const file = path.join(dir, 'brand_final.png');
    writeFileSync(file, pngWithWidth(PAYMENT_LINK_IMAGE_MAX_WIDTH_PX));
    const loaded = loadPaymentLinkImage(file);
    expect(loaded.filename).toBe('brand_final.png');
    expect(loaded.contentType).toBe('image/png');
  });
});
