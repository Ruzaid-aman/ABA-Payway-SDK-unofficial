import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KhqrMerchantConfiguration } from '../khqr-config.js';
import { generateOfflineQR } from '../khqr-offline.js';

const configuration: KhqrMerchantConfiguration = {
  bakongId: 'merchant@bakong',
  abaMerchantId: '123456789012345',
  acquirerName: 'ABA Bank',
  merchantCategoryCode: '5999',
  merchantName: 'Example Merchant',
  merchantCity: 'Phnom Penh',
  paywayData: 'aba-provided-template',
};

function parseTlv(payload: string): Map<string, string> {
  const tags = new Map<string, string>();
  let index = 0;
  while (index < payload.length) {
    const tag = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    const valueStart = index + 4;
    let valueEnd = valueStart;
    while (Buffer.byteLength(payload.slice(valueStart, valueEnd), 'utf8') < length) valueEnd += 1;
    if (Buffer.byteLength(payload.slice(valueStart, valueEnd), 'utf8') !== length)
      throw new Error(`invalid TLV byte length for tag ${tag}`);
    tags.set(tag, payload.slice(valueStart, valueEnd));
    index = valueEnd;
  }
  return tags;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

describe('generateOfflineQR', () => {
  afterEach(() => vi.restoreAllMocks());

  it('generates an official dynamic ABA KHQR payload with nested templates and CRC', () => {
    const qr = generateOfflineQR(
      {
        amount: 25.5,
        currency: 'USD',
        merchantRef: 'ORDER-123',
        createdAt: 1_700_000_000_000,
        expiresAt: 1_700_000_900_000,
      },
      configuration,
    );
    const tags = parseTlv(qr.slice(0, -8));

    expect(tags.get('00')).toBe('01');
    expect(tags.get('01')).toBe('12');
    expect(tags.get('52')).toBe('5999');
    expect(tags.get('53')).toBe('840');
    expect(tags.get('54')).toBe('25.50');
    expect(tags.get('58')).toBe('KH');
    expect(tags.get('59')).toBe('Example Merchant');
    expect(tags.get('60')).toBe('Phnom Penh');
    expect(parseTlv(tags.get('30') ?? '')).toEqual(
      new Map([
        ['00', 'merchant@bakong'],
        ['01', '123456789012345'],
        ['02', 'ABA Bank'],
      ]),
    );
    expect(parseTlv(tags.get('62') ?? '')).toEqual(
      new Map([
        ['01', 'ORDER-123'],
        ['68', 'aba-provided-template'],
      ]),
    );
    expect(parseTlv(tags.get('99') ?? '')).toEqual(
      new Map([
        ['00', '1700000000000'],
        ['01', '1700000900000'],
      ]),
    );
    expect(qr.slice(-8, -4)).toBe('6304');
    expect(qr.slice(-4)).toBe(crc16Ccitt(qr.slice(0, -4)));
  });

  it('makes static KHR payloads amount-free and formats dynamic KHR amounts as integers', () => {
    const staticQr = generateOfflineQR(
      { currency: 'KHR', merchantRef: 'STATIC', createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 },
      configuration,
    );
    const dynamicQr = generateOfflineQR(
      {
        amount: 1000,
        currency: 'KHR',
        merchantRef: 'DYNAMIC',
        createdAt: 1_700_000_000_000,
        expiresAt: 1_700_000_900_000,
      },
      configuration,
    );

    expect(parseTlv(staticQr.slice(0, -8)).get('01')).toBe('11');
    expect(parseTlv(staticQr.slice(0, -8)).has('54')).toBe(false);
    expect(parseTlv(dynamicQr.slice(0, -8)).get('01')).toBe('12');
    expect(parseTlv(dynamicQr.slice(0, -8)).get('54')).toBe('1000');
  });

  it.each([
    [0.29, '0.29'],
    [10.12, '10.12'],
  ])('formats valid USD amount %s without binary floating-point rejection', (amount, expected) => {
    const qr = generateOfflineQR(
      { amount, currency: 'USD', merchantRef: 'USD', createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 },
      configuration,
    );

    expect(parseTlv(qr.slice(0, -8)).get('54')).toBe(expected);
  });

  it('enforces the 13-character ABA amount limit and rejects exponent notation', () => {
    expect(() =>
      generateOfflineQR(
        {
          amount: 10_000_000_000,
          currency: 'USD',
          merchantRef: 'USD',
          createdAt: 1_700_000_000_000,
          expiresAt: 1_700_000_900_000,
        },
        configuration,
      ),
    ).toThrow(/13/);
    expect(() =>
      generateOfflineQR(
        {
          amount: 1e21,
          currency: 'USD',
          merchantRef: 'USD',
          createdAt: 1_700_000_000_000,
          expiresAt: 1_700_000_900_000,
        },
        configuration,
      ),
    ).toThrow(/exponent/i);

    const maximumKhqr = generateOfflineQR(
      {
        amount: 9_999_999_999_999,
        currency: 'KHR',
        merchantRef: 'KHR',
        createdAt: 1_700_000_000_000,
        expiresAt: 1_700_000_900_000,
      },
      configuration,
    );
    expect(parseTlv(maximumKhqr.slice(0, -8)).get('54')).toBe('9999999999999');
    expect(() =>
      generateOfflineQR(
        {
          amount: 10_000_000_000_000,
          currency: 'KHR',
          merchantRef: 'KHR',
          createdAt: 1_700_000_000_000,
          expiresAt: 1_700_000_900_000,
        },
        configuration,
      ),
    ).toThrow(/13/);
  });

  it('measures non-ASCII values in UTF-8 bytes', () => {
    const qr = generateOfflineQR(
      { currency: 'USD', merchantRef: 'អក្សរ', createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 },
      configuration,
    );
    expect(parseTlv(parseTlv(qr.slice(0, -8)).get('62') ?? '').get('01')).toBe('អក្សរ');
    expect(Buffer.byteLength('អក្សរ', 'utf8')).toBeGreaterThan('អក្សរ'.length);
  });

  it('rejects invalid configuration, references longer than 25, and expired timestamps', () => {
    expect(() => generateOfflineQR({ currency: 'USD', merchantRef: 'ORDER' }, {})).toThrow(/KHQR_.*_REQUIRED/);
    expect(() =>
      generateOfflineQR(
        { currency: 'USD', merchantRef: 'x'.repeat(26), createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 },
        configuration,
      ),
    ).toThrow(/merchantRef/);
    expect(() =>
      generateOfflineQR(
        { currency: 'USD', merchantRef: 'ORDER', createdAt: 1_700_000_900_000, expiresAt: 1_700_000_000_000 },
        configuration,
      ),
    ).toThrow(/expiresAt/);
  });

  it('rejects an unsupported runtime currency instead of serializing it as USD', () => {
    expect(() =>
      generateOfflineQR(
        { currency: 'EUR', merchantRef: 'ORDER', createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 } as never,
        configuration,
      ),
    ).toThrow(/currency/);
  });

  it('does not call fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    generateOfflineQR(
      { currency: 'USD', merchantRef: 'ORDER', createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 },
      configuration,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
