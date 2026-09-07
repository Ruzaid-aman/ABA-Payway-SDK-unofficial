import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KhqrMerchantConfiguration } from '../khqr-config.js';
import { generateOfflineQR, inspectKhqrPayload, khqrCrc16, validateKhqrCrc } from '../khqr-offline.js';

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

// ─── Salvaged from the 2026-08-26 stash (merged 2026-09-07): payload self-check ──
describe('inspectKhqrPayload / validateKhqrCrc / khqrCrc16 (offline self-check)', () => {
  // Real Merchant-Portal customer QR (skills fixture): static, USD, no amount tag.
  const SAMPLE_CUSTOMER_QR =
    '00020101021130510016abaakhppxxx@abaa01153250602141550800208ABA Bank5204787653038405802KH5915Donation outlet6010BATTAMBANG624268380010PAYWAY@ABA0104693002071620916050119924001317871247638256803mmp63049955';

  it('validates the CRC of a real portal QR', () => {
    expect(validateKhqrCrc(SAMPLE_CUSTOMER_QR)).toBe(true);
    expect(khqrCrc16(SAMPLE_CUSTOMER_QR.slice(0, -4))).toBe(SAMPLE_CUSTOMER_QR.slice(-4));
  });

  it('rejects a tampered checksum and malformed tails', () => {
    expect(validateKhqrCrc(`${SAMPLE_CUSTOMER_QR.slice(0, -1)}0`)).toBe(false);
    expect(validateKhqrCrc('6304')).toBe(false); // too short
    expect(validateKhqrCrc('6304ZZZZ')).toBe(false); // non-hex
  });

  it('inspects a real static portal QR: static, USD, merchant identity, no amount', () => {
    const inspection = inspectKhqrPayload(SAMPLE_CUSTOMER_QR);
    expect(inspection).toBeDefined();
    expect(inspection?.valid).toBe(true);
    expect(inspection?.crcValid).toBe(true);
    expect(inspection?.isStatic).toBe(true);
    expect(inspection?.currency).toBe('USD');
    expect(inspection?.amount).toBeUndefined(); // static QR — payer enters amount
    expect(inspection?.merchantName).toBe('Donation outlet');
    expect(inspection?.merchantCity).toBe('BATTAMBANG');
    expect(inspection?.bakongId).toBe('abaakhppxxx@abaa');
  });

  it('inspects a locally generated dynamic QR and round-trips the amount', () => {
    const payload = generateOfflineQR(
      { amount: 12.5, currency: 'USD', merchantRef: 'ORDER', createdAt: 1_700_000_000_000, expiresAt: 1_700_000_900_000 },
      configuration,
    );
    const inspection = inspectKhqrPayload(payload);
    expect(inspection).toBeDefined();
    expect(inspection?.crcValid).toBe(true);
    expect(inspection?.isStatic).toBe(false); // dynamic: carries tag 54 amount
    expect(inspection?.amount).toBe('12.50');
    expect(inspection?.currency).toBe('USD');
    expect(inspection?.merchantRef).toBe('ORDER');
    expect(inspection?.merchantName).toBe('Example Merchant');
  });

  it('reports a bad checksum as valid:false (structure still decodable)', () => {
    const tampered = `${SAMPLE_CUSTOMER_QR.slice(0, -1)}0`;
    const inspection = inspectKhqrPayload(tampered);
    expect(inspection).toBeDefined();
    expect(inspection?.valid).toBe(false);
    expect(inspection?.crcValid).toBe(false);
  });

  it('returns undefined for structurally malformed payloads', () => {
    expect(inspectKhqrPayload('junk')).toBeUndefined();
    expect(inspectKhqrPayload('')).toBeUndefined();
    // Point-of-initiation must be 11/12.
    expect(inspectKhqrPayload(`${'00'}02` + '0112' + '6304ABCD')).toBeUndefined();
  });

  // S2 (second-pass audit): the generator encodes TLV lengths as UTF-8 BYTE
  // counts; the inspector previously walked JavaScript string indices, so any
  // multibyte value (Café, Khmer script) mis-sliced and returned undefined
  // for payloads the generator itself produced.
  it('round-trips multibyte UTF-8 merchant names generated by this SDK (S2)', () => {
    for (const merchantName of ['Café', 'ស្ថានីយបុណ្យ', 'Кофе — 東京']) {
      const payload = generateOfflineQR({ amount: 1, currency: 'USD', merchantRef: 'UTF8' }, { ...configuration, merchantName });
      const inspection = inspectKhqrPayload(payload);
      expect(inspection, merchantName).toBeDefined();
      expect(inspection?.crcValid, merchantName).toBe(true);
      expect(inspection?.valid, merchantName).toBe(true);
      expect(inspection?.merchantName, merchantName).toBe(merchantName);
      expect(inspection?.amount, merchantName).toBe('1.00');
    }
  });

  it('returns undefined for an incomplete nested template even with a correct CRC (S2)', () => {
    // Root tag-30 whose value is the incomplete TLV string '0' — a broken
    // template inside a well-formed root is structurally malformed, not valid.
    const malformedBody = '000201300106304';
    expect(inspectKhqrPayload(`${malformedBody}${khqrCrc16(malformedBody)}`)).toBeUndefined();
  });

  it('returns undefined for non-decimal length digits (S2)', () => {
    // '6+04' — the length field must be exactly two decimal digits; the old
    // Number() coercion accepted forms TLV never allows.
    const plusLength = '0002016+04ABCD';
    expect(inspectKhqrPayload(plusLength)).toBeUndefined();
    const spaceLength = '00 20112345678';
    expect(inspectKhqrPayload(spaceLength)).toBeUndefined();
  });

  it('returns undefined for a truncated multibyte value (S2)', () => {
    // A merchant name with a multibyte char cut mid-sequence: the declared
    // byte length exceeds the remaining bytes → structural malformation.
    const payload = generateOfflineQR({ amount: 1, currency: 'USD', merchantRef: 'TRUNC' }, { ...configuration, merchantName: 'Café' });
    // Remove 2 bytes from the middle of the body (inside the merchant-name
    // value) and re-checksum so only the truncation is wrong.
    const body = payload.slice(0, -8);
    const cut = body.slice(0, body.length - 4);
    expect(inspectKhqrPayload(`${cut}${khqrCrc16(cut)}6304`)).toBeUndefined();
    // Sanity: the same cut WITHOUT the fake tag-63 tail also fails.
    expect(inspectKhqrPayload(cut)).toBeUndefined();
  });

  it('keeps valid structure distinct from CRC integrity: bad checksum is not malformation (S2)', () => {
    const payload = generateOfflineQR({ amount: 5, currency: 'KHR', merchantRef: 'CRC' }, configuration);
    // Flip the last checksum digit only — the structure stays byte-complete,
    // so this must remain a decodable-but-invalid inspection, never undefined.
    const flipped = `${payload.slice(0, -1)}${payload.slice(-1) === 'A' ? 'B' : 'A'}`;
    const inspection = inspectKhqrPayload(flipped);
    expect(inspection).toBeDefined();
    expect(inspection?.crcValid).toBe(false);
    expect(inspection?.valid).toBe(false);
    expect(inspection?.amount).toBe('5');
  });
});
