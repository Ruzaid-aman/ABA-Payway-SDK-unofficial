/**
 * Behavior pins for the payment-link multipart image upload.
 *
 * The hash contract is the load-bearing part: the HMAC covers
 * `request_time + merchant_id + merchant_auth` ONLY — image bytes never
 * enter the hash (per ABA's official PHP sample and the spec's
 * x-hmac-fields). The multipart part name is `image`, top-level, next to
 * the four string fields.
 *
 * Spec limits (payway-openapi/paths/payment-link.yaml:33–37): JPG/JPEG/PNG
 * only, max 3MB — enforced as an advisory in the domain (warns, escalates
 * to PayWayConfigError under strictValidation) and as a hard loader error
 * for unsupported extensions in the CLI helper.
 */
import * as crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentTypeForImageFile, loadPaymentLinkImage } from '../cli/payment-link-image.js';
import type { PayWayConfig } from '../client.js';
import { PayWay } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { createPaymentLinkDomain } from '../domains/payment-link.js';
import { PayWayConfigError } from '../errors.js';
import { mockJsonResponse } from '../test/test-utils.js';

// ---------------------------------------------------------------------------
// CLI helper: content-type inference + file loading
// ---------------------------------------------------------------------------

describe('loadPaymentLinkImage (CLI helper)', () => {
  it('infers content types from file extensions (spec set: JPG/JPEG/PNG only)', () => {
    expect(contentTypeForImageFile('a.jpg')).toBe('image/jpeg');
    expect(contentTypeForImageFile('a.JPEG')).toBe('image/jpeg');
    expect(contentTypeForImageFile('a.png')).toBe('image/png');
  });

  it('rejects extensions outside the spec JPG/JPEG/PNG set', () => {
    // Spec (payway-openapi/paths/payment-link.yaml:33–37): payment-link
    // images are JPG/JPEG/PNG only — webp/gif/svg now throw instead of
    // mapping to their MIME types / falling back to octet-stream.
    expect(() => contentTypeForImageFile('a.webp')).toThrow(
      "--image: unsupported image type '.webp' — the spec allows JPG/JPEG/PNG only",
    );
    expect(() => contentTypeForImageFile('a.gif')).toThrow(
      "--image: unsupported image type '.gif' — the spec allows JPG/JPEG/PNG only",
    );
    expect(() => contentTypeForImageFile('a.svg')).toThrow(
      "--image: unsupported image type '.svg' — the spec allows JPG/JPEG/PNG only",
    );
  });

  it('rejects missing and empty files with clear messages', () => {
    expect(() => loadPaymentLinkImage('definitely-missing-image.png')).toThrow('--image file not found');

    const dir = mkdtempSync(path.join(tmpdir(), 'payway-link-image-'));
    try {
      const emptyPath = path.join(dir, 'empty.png');
      writeFileSync(emptyPath, new Uint8Array(0));
      expect(() => loadPaymentLinkImage(emptyPath)).toThrow('--image file is empty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws the spec message for unsupported extensions when loading', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-link-image-'));
    try {
      for (const ext of ['webp', 'gif', 'svg', 'bmp']) {
        const filePath = path.join(dir, `banner.${ext}`);
        writeFileSync(filePath, new Uint8Array([1, 2, 3, 4]));
        expect(() => loadPaymentLinkImage(filePath)).toThrow(
          `--image: unsupported image type '.${ext}' — the spec allows JPG/JPEG/PNG only`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads png/jpg files with basename filename and inferred content type', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-link-image-'));
    try {
      const pngPath = path.join(dir, 'banner.png');
      writeFileSync(pngPath, new Uint8Array([1, 2, 3, 4]));
      const png = loadPaymentLinkImage(pngPath);
      expect(png.filename).toBe('banner.png');
      expect(png.contentType).toBe('image/png');
      expect(Array.from(png.data)).toEqual([1, 2, 3, 4]);

      const jpgPath = path.join(dir, 'banner.jpg');
      writeFileSync(jpgPath, new Uint8Array([5, 6]));
      const jpg = loadPaymentLinkImage(jpgPath);
      expect(jpg.filename).toBe('banner.jpg');
      expect(jpg.contentType).toBe('image/jpeg');
      expect(Array.from(jpg.data)).toEqual([5, 6]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Domain-level: image validation + multipart option passthrough
// ---------------------------------------------------------------------------

const DUMMY_CONFIG = {} as unknown as PayWayConfig;

const VALID_PARAMS = {
  title: 'T',
  amount: 1.5,
  merchantRefNo: 'ref-1',
  returnUrl: 'https://example.com/return',
};

describe('paymentLink.create image validation (domain)', () => {
  it('rejects empty and non-byte image data before any request', () => {
    const domain = createPaymentLinkDomain(DUMMY_CONFIG, () => {
      throw new Error('requestWithMerchantAuth must not be called for invalid images');
    });
    expect(() => domain.create({ ...VALID_PARAMS, image: { data: new Uint8Array(0) } })).toThrow(PayWayConfigError);
    expect(() => domain.create({ ...VALID_PARAMS, image: { data: 'not-bytes' as unknown as Uint8Array } })).toThrow(
      PayWayConfigError,
    );
  });

  it('applies filename/content-type defaults and names the part "image"', async () => {
    const captured: Array<{ name: string; filename: string; contentType: string; data: Uint8Array } | undefined> = [];
    const domain = createPaymentLinkDomain(DUMMY_CONFIG, (_path, _auth, options) => {
      captured.push(options?.multipartFile);
      return Promise.resolve({} as never);
    });

    await domain.create({ ...VALID_PARAMS, image: { data: new Uint8Array([9]) } });
    await domain.create({
      ...VALID_PARAMS,
      image: { data: new Uint8Array([9]), filename: 'p.png', contentType: 'image/png' },
    });

    expect(captured[0]).toEqual({
      name: 'image',
      filename: 'image.jpg',
      contentType: 'image/jpeg',
      data: new Uint8Array([9]),
    });
    expect(captured[1]).toEqual({
      name: 'image',
      filename: 'p.png',
      contentType: 'image/png',
      data: new Uint8Array([9]),
    });
  });

  it('sends no multipartFile when no image is given', async () => {
    const authSpy = vi.fn(() => Promise.resolve({} as never));
    const domain = createPaymentLinkDomain(DUMMY_CONFIG, authSpy);
    await domain.create({ ...VALID_PARAMS });
    // The options object always carries callOptions now (per-call options
    // threading, 2026-08-30) — no multipartFile means it is undefined here.
    expect(authSpy).toHaveBeenCalledWith(expect.any(String), expect.anything(), { callOptions: undefined });
  });
});

describe('paymentLink.create image limits (domain, advisory)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns (once per message) when the image exceeds the documented 3MB limit', async () => {
    const domain = createPaymentLinkDomain(DUMMY_CONFIG, () => Promise.resolve({} as never));
    const oversized = new Uint8Array(3 * 1024 * 1024 + 1);

    await domain.create({ ...VALID_PARAMS, image: { data: oversized } });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[payway\] image\.data is \d+ bytes, exceeding the documented 3MB/),
    );
  });

  it('throws PayWayConfigError for an oversized image under strictValidation', () => {
    const strictDomain = createPaymentLinkDomain({ strictValidation: true } as unknown as PayWayConfig, () => {
      throw new Error('requestWithMerchantAuth must not be called');
    });
    expect(() =>
      strictDomain.create({ ...VALID_PARAMS, image: { data: new Uint8Array(3 * 1024 * 1024 + 1) } }),
    ).toThrow(PayWayConfigError);
    expect(() =>
      strictDomain.create({ ...VALID_PARAMS, image: { data: new Uint8Array(3 * 1024 * 1024 + 1) } }),
    ).toThrow(/exceeding the documented 3MB/);
  });

  it('warns for an explicitly-passed contentType outside the JPG/JPEG/PNG set', async () => {
    const domain = createPaymentLinkDomain(DUMMY_CONFIG, () => Promise.resolve({} as never));

    await domain.create({ ...VALID_PARAMS, image: { data: new Uint8Array([9]), contentType: 'image/gif' } });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[payway] image contentType "image/gif" is outside the documented JPG/JPEG/PNG set (image/jpeg, image/jpg, image/png) — the gateway may reject the upload',
    );
  });

  it('throws PayWayConfigError for an unsupported contentType under strictValidation', () => {
    const strictDomain = createPaymentLinkDomain({ strictValidation: true } as unknown as PayWayConfig, () => {
      throw new Error('requestWithMerchantAuth must not be called');
    });
    expect(() =>
      strictDomain.create({ ...VALID_PARAMS, image: { data: new Uint8Array([9]), contentType: 'image/gif' } }),
    ).toThrow(PayWayConfigError);
    expect(() =>
      strictDomain.create({ ...VALID_PARAMS, image: { data: new Uint8Array([9]), contentType: 'image/gif' } }),
    ).toThrow(/image contentType "image\/gif"/);
  });

  it('does not warn at exactly 3MB or with the image/jpg misspelling', async () => {
    const domain = createPaymentLinkDomain(DUMMY_CONFIG, () => Promise.resolve({} as never));

    await domain.create({ ...VALID_PARAMS, image: { data: new Uint8Array(3 * 1024 * 1024) } });
    await domain.create({ ...VALID_PARAMS, image: { data: new Uint8Array([9]), contentType: 'image/jpg' } });
    await domain.create({ ...VALID_PARAMS, image: { data: new Uint8Array([9]), contentType: 'image/png' } });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Client-level: multipart wire format via stubbed fetch
// ---------------------------------------------------------------------------

const TEST_KEY_PAIR = crypto.generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const CONFIG_WITH_RSA: PayWayConfig = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox',
  publicKeyPem: TEST_KEY_PAIR.publicKey,
};

describe('paymentLink.create multipart wire format (client)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(CONFIG_WITH_RSA);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends FormData with the four signed string parts plus the image file part', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ status: { code: '00', message: 'Created' }, data: { id: 'PL-IMG-1' } }),
    );

    await payway.paymentLink.create({
      ...VALID_PARAMS,
      image: { data: new Uint8Array([1, 2, 3, 4]), filename: 'pic.png', contentType: 'image/png' },
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.createPaymentLink);
    expect(init.body).toBeInstanceOf(FormData);
    // No manual Content-Type: undici must generate the multipart boundary.
    expect(init.headers['Content-Type']).toBeUndefined();

    const form = init.body as FormData;
    expect(form.get('merchant_id')).toBe('test-merchant-001');
    expect(typeof form.get('request_time')).toBe('string');
    expect(typeof form.get('merchant_auth')).toBe('string');
    const file = form.get('image');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('pic.png');
    expect((file as File).type).toBe('image/png');
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('FINDING: image bytes are excluded from the HMAC hash', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ status: { code: '00', message: 'Created' }, data: { id: 'PL-IMG-2' } }),
    );

    await payway.paymentLink.create({
      ...VALID_PARAMS,
      image: { data: new Uint8Array(64).fill(7), filename: 'bytes.bin', contentType: 'application/octet-stream' },
    });

    const form = fetchSpy.mock.calls[0][1].body as FormData;
    const requestTime = form.get('request_time') as string;
    const merchantAuth = form.get('merchant_auth') as string;
    const expectedHash = crypto
      .createHmac('sha512', 'test-api-key-secret')
      .update(`${requestTime}${CONFIG_WITH_RSA.merchantId}${merchantAuth}`)
      .digest('base64');
    expect(form.get('hash')).toBe(expectedHash);
  });

  it('re-sends the same FormData on transient network failures (retry)', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        mockJsonResponse({ status: { code: '00', message: 'Created' }, data: { id: 'PL-IMG-3' } }),
      );
    const retrying = new PayWay({ ...CONFIG_WITH_RSA, maxRetries: 1, retryDelayMs: 1 });

    await retrying.paymentLink.create({
      ...VALID_PARAMS,
      image: { data: new Uint8Array([5]), filename: 'r.jpg' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(call[1].body).toBeInstanceOf(FormData);
      expect((call[1].body as FormData).get('image')).toBeInstanceOf(File);
    }
  });

  it('keeps the urlencoded body and Content-Type when no image is given', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ status: { code: '00', message: 'Created' }, data: { id: 'PL-PLAIN' } }),
    );

    await payway.paymentLink.create({ ...VALID_PARAMS });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(typeof init.body).toBe('string');
    expect(init.body).toContain('merchant_auth=');
  });
});
