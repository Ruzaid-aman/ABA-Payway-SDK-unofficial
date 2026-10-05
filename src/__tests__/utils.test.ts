import { describe, expect, it } from 'vitest';
import {
  encodeBase64IfNeeded,
  isValidPublicKeyPem,
  filterParams,
  formatAmount,
  formatRequestTime,
  sanitizeForLog,
  toBase64,
  validateBeneficiaries,
  validateCurrency,
  validatePositiveAmount,
  validateRefundAmount,
  validateTransactionId,
} from '../utils.js';

// ---------------------------------------------------------------------------
// formatRequestTime
// ---------------------------------------------------------------------------

describe('formatRequestTime', () => {
  it('formats a specific UTC date as YYYYMMDDHHmmss', () => {
    // 2026-07-16 09:05:03 UTC
    const date = new Date(Date.UTC(2026, 6, 16, 9, 5, 3));
    expect(formatRequestTime(date)).toBe('20260716090503');
  });

  it('pads single-digit months, days, hours, minutes, seconds with leading zeros', () => {
    const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 5)); // Jan 2, 03:04:05
    expect(formatRequestTime(date)).toBe('20260102030405');
  });

  it('handles midnight correctly', () => {
    const date = new Date(Date.UTC(2026, 11, 31, 0, 0, 0)); // Dec 31 00:00:00
    expect(formatRequestTime(date)).toBe('20261231000000');
  });

  it('handles end-of-day correctly', () => {
    const date = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    expect(formatRequestTime(date)).toBe('20261231235959');
  });

  it('returns a 14-character string when no date is passed (uses current time)', () => {
    const result = formatRequestTime();
    expect(result).toHaveLength(14);
    expect(result).toMatch(/^\d{14}$/);
  });
});

// ---------------------------------------------------------------------------
// formatAmount
// ---------------------------------------------------------------------------

describe('formatAmount', () => {
  it('formats USD with exactly 2 decimal places', () => {
    expect(formatAmount(10, 'USD')).toBe('10.00');
    expect(formatAmount(10.5, 'USD')).toBe('10.50');
    expect(formatAmount(10.123, 'USD')).toBe('10.12');
    expect(formatAmount(0.1, 'USD')).toBe('0.10');
  });

  it('rounds USD amounts to 2 decimal places', () => {
    expect(formatAmount(10.999, 'USD')).toBe('11.00');
    expect(formatAmount(10.005, 'USD')).toBe('10.01');
  });

  it('formats KHR as rounded integer (no decimals)', () => {
    expect(formatAmount(1000, 'KHR')).toBe('1000');
    expect(formatAmount(1000.7, 'KHR')).toBe('1001');
    expect(formatAmount(1000.3, 'KHR')).toBe('1000');
  });

  it('handles zero correctly for both currencies', () => {
    expect(formatAmount(0, 'USD')).toBe('0.00');
    expect(formatAmount(0, 'KHR')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// toBase64
// ---------------------------------------------------------------------------

describe('toBase64', () => {
  it('encodes a simple ASCII string', () => {
    expect(toBase64('hello')).toBe(Buffer.from('hello', 'utf8').toString('base64'));
  });

  it('encodes a URL', () => {
    const url = 'https://example.com/callback?foo=bar';
    expect(toBase64(url)).toBe(Buffer.from(url, 'utf8').toString('base64'));
  });

  it('encodes UTF-8 characters', () => {
    const text = 'ថ្ងៃនេះ'; // Khmer script
    expect(toBase64(text)).toBe(Buffer.from(text, 'utf8').toString('base64'));
  });

  it('encodes empty string', () => {
    expect(toBase64('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// encodeBase64IfNeeded
// ---------------------------------------------------------------------------

describe('encodeBase64IfNeeded', () => {
  it('base64-encodes strings starting with http://', () => {
    const url = 'http://example.com/callback';
    const expected = Buffer.from(url, 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(url)).toBe(expected);
  });

  it('base64-encodes strings starting with https://', () => {
    const url = 'https://example.com/callback';
    const expected = Buffer.from(url, 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(url)).toBe(expected);
  });

  it('base64-encodes protocol-relative URLs', () => {
    const url = '//example.com/callback';
    const expected = Buffer.from(url, 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(url)).toBe(expected);
  });

  it('base64-encodes www-prefixed host-only URLs', () => {
    const url = 'www.example.com/callback';
    const expected = Buffer.from(url, 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(url)).toBe(expected);
  });

  it('passes through non-URL strings unchanged', () => {
    expect(encodeBase64IfNeeded('some-token-value')).toBe('some-token-value');
    expect(encodeBase64IfNeeded('ftp://files.com')).toBe('ftp://files.com');
    expect(encodeBase64IfNeeded('')).toBe('');
  });

  it('JSON-stringifies and base64-encodes objects', () => {
    const obj = { ios_scheme: 'myapp://', android_scheme: 'myapp://' };
    const expected = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(obj)).toBe(expected);
  });

  it('JSON-stringifies and base64-encodes arrays', () => {
    const arr = [{ name: 'Widget', quantity: 1, price: 10 }];
    const expected = Buffer.from(JSON.stringify(arr), 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(arr)).toBe(expected);
  });

  it('JSON-stringifies and base64-encodes numbers', () => {
    // typeof 42 is not 'string', so goes to the JSON.stringify path
    const expected = Buffer.from(JSON.stringify(42), 'utf8').toString('base64');
    expect(encodeBase64IfNeeded(42)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// filterParams
// ---------------------------------------------------------------------------

describe('filterParams', () => {
  it('removes undefined values', () => {
    expect(filterParams({ a: 'hello', b: undefined, c: 'world' })).toEqual({
      a: 'hello',
      c: 'world',
    });
  });

  it('removes null values', () => {
    expect(filterParams({ a: 'hello', b: null })).toEqual({ a: 'hello' });
  });

  it('keeps falsy but defined values (0, false, empty string)', () => {
    expect(filterParams({ a: 0, b: false, c: '', d: null })).toEqual({
      a: 0,
      b: false,
      c: '',
    });
  });

  it('returns empty object when all values are undefined/null', () => {
    expect(filterParams({ a: undefined, b: null })).toEqual({});
  });

  it('returns all fields when none are undefined/null', () => {
    const input = { x: 1, y: 'two', z: true };
    expect(filterParams(input)).toEqual(input);
  });

  it('preserves nested objects', () => {
    const nested = { inner: 'value' };
    expect(filterParams({ a: nested, b: undefined })).toEqual({ a: nested });
  });
});

// ---------------------------------------------------------------------------
// sanitizeForLog
// ---------------------------------------------------------------------------

describe('sanitizeForLog', () => {
  it('redacts known credentials without mutating the source object', () => {
    const payload = {
      api_key: 'api-secret',
      nested: { merchant_auth: 'encrypted-credentials', normal: 'visible' },
      items: [{ cvv: '123', amount: 10 }],
    };

    expect(sanitizeForLog(payload)).toEqual({
      api_key: '***HIDDEN***',
      nested: { merchant_auth: '***HIDDEN***', normal: 'visible' },
      items: [{ cvv: '***HIDDEN***', amount: 10 }],
    });
    expect(payload.api_key).toBe('api-secret');
    expect(payload.nested.merchant_auth).toBe('encrypted-credentials');
  });

  it('matches sensitive keys case-insensitively', () => {
    expect(sanitizeForLog({ apiKey: 'secret', Authorization: 'Bearer token' })).toEqual({
      apiKey: '***HIDDEN***',
      Authorization: '***HIDDEN***',
    });
  });

  it('propagates the key hint into arrays so hex secrets inside them are masked', () => {
    expect(sanitizeForLog({ payload: ['c'.repeat(40), 'order-123'] })).toEqual({
      payload: ['***HIDDEN***', 'order-123'],
    });
  });
});

// ---------------------------------------------------------------------------
// validation helpers
// ---------------------------------------------------------------------------

describe('validateCurrency', () => {
  it('accepts USD and KHR', () => {
    expect(() => validateCurrency('USD')).not.toThrow();
    expect(() => validateCurrency('KHR')).not.toThrow();
    expect(() => validateCurrency(undefined)).not.toThrow();
  });

  it('throws for unsupported currencies', () => {
    expect(() => validateCurrency('EUR')).toThrow('currency must be one of USD, KHR');
  });
});

describe('validatePositiveAmount', () => {
  it('accepts positive USD amounts with up to 2 decimals', () => {
    expect(() => validatePositiveAmount(10.99, 'USD')).not.toThrow();
  });

  it('accepts positive integer KHR amounts', () => {
    expect(() => validatePositiveAmount(1000, 'KHR')).not.toThrow();
  });

  it('throws for non-positive amounts', () => {
    expect(() => validatePositiveAmount(0, 'USD')).toThrow('amount must be a positive number');
    expect(() => validatePositiveAmount(-1, 'USD')).toThrow('amount must be a positive number');
  });

  it('throws for KHR amounts with decimals', () => {
    expect(() => validatePositiveAmount(100.5, 'KHR')).toThrow('KHR amount must be an integer');
  });

  it('throws for USD amounts with more than 2 decimals', () => {
    expect(() => validatePositiveAmount(10.999, 'USD')).toThrow('USD amount must have at most 2 decimal places');
  });

  it('accepts USD amounts that are subject to floating point rounding', () => {
    // 0.1 + 0.2 === 0.30000000000000004, but it should still validate as 0.30
    expect(() => validatePositiveAmount(0.1 + 0.2, 'USD')).not.toThrow();
  });
});

describe('validateTransactionId', () => {
  it('accepts non-empty strings within 20 chars and valid charset', () => {
    expect(() => validateTransactionId('TX-123')).not.toThrow();
    expect(() => validateTransactionId('QR-template1-mrpuke0')).not.toThrow();
    expect(() => validateTransactionId('A'.repeat(20))).not.toThrow();
  });

  it('throws for empty or non-string values', () => {
    expect(() => validateTransactionId('')).toThrow('transactionId is required');
    // @ts-expect-error — testing runtime guard
    expect(() => validateTransactionId(undefined)).toThrow('transactionId is required');
  });

  it('throws for transaction IDs exceeding 20 characters (PayWay API limit)', () => {
    expect(() => validateTransactionId('A'.repeat(21))).toThrow('≤ 20 characters');
    expect(() => validateTransactionId('tpl-test-template1_color-1784347522507')).toThrow('≤ 20 characters');
  });

  it('throws for invalid characters (only letters, digits, hyphens allowed)', () => {
    expect(() => validateTransactionId('TX 123')).toThrow('letters, digits, and hyphens');
    expect(() => validateTransactionId('TX_123')).toThrow('letters, digits, and hyphens');
    expect(() => validateTransactionId('TX.123')).toThrow('letters, digits, and hyphens');
    expect(() => validateTransactionId('TX@123')).toThrow('letters, digits, and hyphens');
  });
});

describe('validateBeneficiaries', () => {
  it('accepts beneficiaries whose amounts sum to total', () => {
    expect(() =>
      validateBeneficiaries(
        [
          { account: 'A', amount: 30 },
          { account: 'B', amount: 70 },
        ],
        100,
        'USD',
      ),
    ).not.toThrow();
  });

  it('accepts sums whose floating-point drift exceeds Number.EPSILON (minor-unit comparison)', () => {
    // 1.1 + 2.2 === 3.3000000000000003 — drift of 4.4e-16 > Number.EPSILON
    // used to false-reject this legitimate split (edge-case audit EC-16).
    expect(() =>
      validateBeneficiaries(
        [
          { account: 'A', amount: 1.1 },
          { account: 'B', amount: 2.2 },
        ],
        3.3,
        'USD',
      ),
    ).not.toThrow();
  });

  it('throws when beneficiary amounts do not sum to total', () => {
    expect(() => validateBeneficiaries([{ account: 'A', amount: 50 }], 100, 'USD')).toThrow(
      'beneficiary amounts (50) must sum to total amount (100)',
    );
  });

  it('throws for empty beneficiaries array', () => {
    expect(() => validateBeneficiaries([], 100, 'USD')).toThrow('beneficiaries must be a non-empty array');
  });

  it('throws for beneficiaries with missing account', () => {
    // @ts-expect-error — testing runtime guard
    expect(() => validateBeneficiaries([{ amount: 100 }], 100, 'USD')).toThrow(
      'each beneficiary must have a non-empty account string',
    );
  });
});

describe('validateRefundAmount', () => {
  describe('USD refunds', () => {
    it('accepts the minimum refund amount ($0.01)', () => {
      expect(() => validateRefundAmount(0.01, 'USD')).not.toThrow();
    });

    it('accepts typical refund amounts', () => {
      expect(() => validateRefundAmount(5.0, 'USD')).not.toThrow();
      expect(() => validateRefundAmount(100.99, 'USD')).not.toThrow();
      expect(() => validateRefundAmount(0.5, 'USD')).not.toThrow();
    });

    it('throws for amounts below $0.01 (PTL04 sandbox discovery)', () => {
      expect(() => validateRefundAmount(0.005, 'USD')).toThrow('at least $0.01 USD');
      expect(() => validateRefundAmount(0.001, 'USD')).toThrow('at least $0.01 USD');
      expect(() => validateRefundAmount(0, 'USD')).toThrow('at least $0.01 USD');
      expect(() => validateRefundAmount(-0.01, 'USD')).toThrow('at least $0.01 USD');
    });

    it('throws for NaN and Infinity', () => {
      expect(() => validateRefundAmount(Number.NaN, 'USD')).toThrow('finite number');
      expect(() => validateRefundAmount(Number.POSITIVE_INFINITY, 'USD')).toThrow('finite number');
    });

    it('throws for USD amounts with more than 2 decimal places', () => {
      expect(() => validateRefundAmount(1.999, 'USD')).toThrow('at most 2 decimal places');
      expect(() => validateRefundAmount(0.001, 'USD')).toThrow('at least $0.01 USD'); // also < 0.01
    });
  });

  describe('KHR refunds', () => {
    it('accepts the minimum KHR refund amount (1)', () => {
      expect(() => validateRefundAmount(1, 'KHR')).not.toThrow();
    });

    it('accepts typical KHR refund amounts', () => {
      expect(() => validateRefundAmount(1000, 'KHR')).not.toThrow();
      expect(() => validateRefundAmount(50000, 'KHR')).not.toThrow();
    });

    it('throws for KHR amounts below 1', () => {
      expect(() => validateRefundAmount(0, 'KHR')).toThrow('at least 1');
      expect(() => validateRefundAmount(-1, 'KHR')).toThrow('at least 1');
    });

    it('throws for KHR amounts with decimals', () => {
      expect(() => validateRefundAmount(100.5, 'KHR')).toThrow('must be an integer');
      expect(() => validateRefundAmount(0.5, 'KHR')).toThrow('must be an integer');
    });
  });

  describe('default currency', () => {
    it('defaults to USD when currency is not provided', () => {
      expect(() => validateRefundAmount(0.01)).not.toThrow();
      expect(() => validateRefundAmount(0.005)).toThrow('at least $0.01 USD');
    });
  });
});

// ---------------------------------------------------------------------------
// isValidPublicKeyPem
// ---------------------------------------------------------------------------

describe('isValidPublicKeyPem', () => {
  const VALID_SPKI = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3\n-----END PUBLIC KEY-----';
  const VALID_RSA = '-----BEGIN RSA PUBLIC KEY-----\nMIGJAoGBAKG\n-----END RSA PUBLIC KEY-----';

  it('accepts SPKI and RSA public key PEMs', () => {
    expect(isValidPublicKeyPem(VALID_SPKI)).toBe(true);
    expect(isValidPublicKeyPem(VALID_RSA)).toBe(true);
  });

  it('accepts keys with surrounding whitespace or literal \\n sequences', () => {
    expect(isValidPublicKeyPem(`  ${VALID_SPKI}  `)).toBe(true);
    expect(isValidPublicKeyPem(VALID_SPKI.replace(/\n/g, '\\n'))).toBe(true);
  });

  it('rejects missing, empty, or non-PEM strings', () => {
    expect(isValidPublicKeyPem(undefined)).toBe(false);
    expect(isValidPublicKeyPem('')).toBe(false);
    expect(isValidPublicKeyPem('not-a-pem')).toBe(false);
    expect(isValidPublicKeyPem('pem')).toBe(false);
  });

  it('rejects PEMs with a header but no footer (and vice versa)', () => {
    expect(isValidPublicKeyPem(VALID_SPKI.split('\n')[0])).toBe(false);
    expect(isValidPublicKeyPem(VALID_SPKI.split('\n')[2])).toBe(false);
  });

  it('rejects private-key PEMs', () => {
    expect(isValidPublicKeyPem('-----BEGIN PRIVATE KEY-----\nMIIEvQ\n-----END PRIVATE KEY-----')).toBe(false);
  });
});
