import { afterEach, describe, expect, it } from 'vitest';
import {
  type KhqrMerchantConfiguration,
  resolveKhqrConfiguration,
  validateKhqrCallbackSetup,
  validateKhqrConfiguration,
} from '../khqr-config.js';

const environmentKeys = [
  'PAYWAY_KHQR_BAKONG_ID',
  'PAYWAY_KHQR_ABA_MERCHANT_ID',
  'PAYWAY_KHQR_ACQUIRER_NAME',
  'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE',
  'PAYWAY_KHQR_MERCHANT_NAME',
  'PAYWAY_KHQR_MERCHANT_CITY',
  'PAYWAY_KHQR_PAYWAY_DATA',
] as const;

const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

const completeConfiguration: KhqrMerchantConfiguration = {
  bakongId: 'merchant@bakong',
  abaMerchantId: '123456789012345',
  acquirerName: 'ABA Bank',
  merchantCategoryCode: '5999',
  merchantName: 'Example Merchant',
  merchantCity: 'Phnom Penh',
  paywayData: 'aba-provided-template',
};

afterEach(() => {
  for (const key of environmentKeys) {
    const original = originalEnvironment.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe('KHQR merchant configuration', () => {
  it('reports a complete constructor configuration as ready', () => {
    const resolved = resolveKhqrConfiguration(completeConfiguration);

    expect(resolved).toEqual(completeConfiguration);
    expect(validateKhqrConfiguration(resolved)).toEqual({ ready: true, issues: [] });
  });

  it('uses explicit values before field-specific environment values', () => {
    process.env.PAYWAY_KHQR_BAKONG_ID = 'environment@bakong';
    process.env.PAYWAY_KHQR_ABA_MERCHANT_ID = '999999999999999';
    process.env.PAYWAY_KHQR_ACQUIRER_NAME = 'Environment Acquirer';
    process.env.PAYWAY_KHQR_MERCHANT_CATEGORY_CODE = '1234';
    process.env.PAYWAY_KHQR_MERCHANT_NAME = 'Environment Merchant';
    process.env.PAYWAY_KHQR_MERCHANT_CITY = 'Battambang';
    process.env.PAYWAY_KHQR_PAYWAY_DATA = 'environment-template';

    const resolved = resolveKhqrConfiguration({
      ...completeConfiguration,
      abaMerchantId: '123456789012345',
      merchantName: 'Explicit Merchant',
    });

    expect(resolved.abaMerchantId).toBe('123456789012345');
    expect(resolved.merchantName).toBe('Explicit Merchant');
    expect(resolved.bakongId).toBe('merchant@bakong');
  });

  it.each([
    ['bakongId', 'KHQR_BAKONG_ID_REQUIRED'],
    ['abaMerchantId', 'KHQR_ABA_MERCHANT_ID_REQUIRED'],
    ['acquirerName', 'KHQR_ACQUIRER_NAME_REQUIRED'],
    ['merchantCategoryCode', 'KHQR_MERCHANT_CATEGORY_CODE_REQUIRED'],
    ['merchantName', 'KHQR_MERCHANT_NAME_REQUIRED'],
    ['merchantCity', 'KHQR_MERCHANT_CITY_REQUIRED'],
    ['paywayData', 'KHQR_PAYWAY_DATA_REQUIRED'],
  ] as const)('reports %s as missing without exposing the configuration value', (field, code) => {
    const configuration = { ...completeConfiguration, [field]: undefined };
    const readiness = validateKhqrConfiguration(configuration);

    expect(readiness).toMatchObject({
      ready: false,
      issues: [{ code, path: `khqr.${field}` }],
    });
    expect(JSON.stringify(readiness)).not.toContain('aba-provided-template');
  });

  it('reports ABA MID, MCC, merchant name, city, and template validation errors', () => {
    const readiness = validateKhqrConfiguration({
      ...completeConfiguration,
      abaMerchantId: '1234ABC',
      merchantCategoryCode: '123',
      merchantName: 'm'.repeat(26),
      merchantCity: 'c'.repeat(16),
      paywayData: '😀'.repeat(25),
    });

    expect(readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'KHQR_ABA_MERCHANT_ID_INVALID', path: 'khqr.abaMerchantId' }),
        expect.objectContaining({ code: 'KHQR_MERCHANT_CATEGORY_CODE_INVALID', path: 'khqr.merchantCategoryCode' }),
        expect.objectContaining({ code: 'KHQR_MERCHANT_NAME_TOO_LONG', path: 'khqr.merchantName' }),
        expect.objectContaining({ code: 'KHQR_MERCHANT_CITY_TOO_LONG', path: 'khqr.merchantCity' }),
        expect.objectContaining({ code: 'KHQR_PAYWAY_DATA_TOO_LONG', path: 'khqr.paywayData' }),
      ]),
    );
  });

  it('validates Bakong and acquirer limits plus the complete nested tag 30 size', () => {
    const readiness = validateKhqrConfiguration({
      ...completeConfiguration,
      bakongId: 'b'.repeat(33),
      acquirerName: 'a'.repeat(40),
    });

    expect(readiness.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'KHQR_BAKONG_ID_TOO_LONG', path: 'khqr.bakongId' }),
        expect.objectContaining({ code: 'KHQR_ACQUIRER_NAME_TOO_LONG', path: 'khqr.acquirerName' }),
        expect.objectContaining({ code: 'KHQR_TAG_30_TOO_LONG', path: 'khqr' }),
      ]),
    );
  });

  it('reserves enough tag 62 space for every valid 25-byte merchant reference', () => {
    const maximumReadyConfiguration = { ...completeConfiguration, paywayData: 'p'.repeat(66) };
    expect(validateKhqrConfiguration(maximumReadyConfiguration)).toEqual({ ready: true, issues: [] });

    const tooLarge = validateKhqrConfiguration({ ...completeConfiguration, paywayData: 'p'.repeat(67) });
    expect(tooLarge).toMatchObject({
      ready: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'KHQR_TAG_62_TOO_LONG', path: 'khqr.paywayData' }),
      ]),
    });
  });
});

describe('KHQR callback setup', () => {
  it('requires HTTPS, merchant-confirmed enrollment, and a known verification strategy', () => {
    const readiness = validateKhqrCallbackSetup({
      url: 'http://localhost:3000/khqr',
      enrollment: 'requested',
      verification: 'unknown',
    });

    expect(readiness).toMatchObject({
      ready: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'KHQR_CALLBACK_URL_HTTPS_REQUIRED', path: 'khqr.callback.url' }),
        expect.objectContaining({ code: 'KHQR_CALLBACK_ENROLLMENT_UNCONFIRMED', path: 'khqr.callback.enrollment' }),
        expect.objectContaining({ code: 'KHQR_CALLBACK_VERIFICATION_UNKNOWN', path: 'khqr.callback.verification' }),
      ]),
    });
  });

  it('reports an explicitly configured HTTPS callback as ready', () => {
    expect(
      validateKhqrCallbackSetup({
        url: 'https://merchant.example/aba-payway-khqr-webhook',
        enrollment: 'confirmed-by-merchant',
        verification: 'mTLS',
      }),
    ).toEqual({ ready: true, issues: [] });
  });

  it('rejects arbitrary runtime enrollment and verification strings', () => {
    const readiness = validateKhqrCallbackSetup({
      url: 'https://merchant.example/aba-payway-khqr-webhook',
      enrollment: 'approved-by-aba' as never,
      verification: 'signed-somehow' as never,
    });

    expect(readiness).toMatchObject({
      ready: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'KHQR_CALLBACK_ENROLLMENT_INVALID', path: 'khqr.callback.enrollment' }),
        expect.objectContaining({ code: 'KHQR_CALLBACK_VERIFICATION_INVALID', path: 'khqr.callback.verification' }),
      ]),
    });
  });
});
