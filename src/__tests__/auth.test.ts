import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  generateHmac,
  encryptMerchantAuth,
  verifyCallbackSignature,
} from '../auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the expected HMAC-SHA512 for a given plaintext + key. */
function expectedHmac(plaintext: string, key: string): string {
  return crypto.createHmac('sha512', key).update(plaintext).digest('base64');
}

/** Generate a 1024-bit RSA key pair for testing. */
function generateTestKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

// ---------------------------------------------------------------------------
// generateHmac
// ---------------------------------------------------------------------------

describe('generateHmac', () => {
  const API_KEY = 'test-api-key-secret';

  it('concatenates field values in fieldList order and returns base64 HMAC-SHA512', () => {
    const payload = { merchant_id: 'M001', req_time: '20260716120000', tran_id: 'T123' };
    const fields = ['req_time', 'merchant_id', 'tran_id'];

    const result = generateHmac(payload, fields, API_KEY);
    const expected = expectedHmac('20260716120000M001T123', API_KEY);

    expect(result).toBe(expected);
  });

  it('treats missing/null/undefined fields as empty string', () => {
    const payload = { merchant_id: 'M001', req_time: '20260716120000' };
    const fields = ['req_time', 'merchant_id', 'tran_id']; // tran_id absent

    const result = generateHmac(payload, fields, API_KEY);
    const expected = expectedHmac('20260716120000M001', API_KEY);

    expect(result).toBe(expected);
  });

  it('coerces numeric values to string', () => {
    const payload = { merchant_id: 'M001', amount: 10.5 };
    const fields = ['merchant_id', 'amount'];

    const result = generateHmac(payload, fields, API_KEY);
    const expected = expectedHmac('M00110.5', API_KEY);

    expect(result).toBe(expected);
  });

  it('returns a valid base64 string', () => {
    const payload = { a: 'hello' };
    const result = generateHmac(payload, ['a'], API_KEY);

    // Base64 regex check
    expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // SHA-512 digest is 64 bytes → 88 chars in base64
    expect(Buffer.from(result, 'base64')).toHaveLength(64);
  });

  it('supports hexadecimal HMAC-SHA512 for the payout endpoint', () => {
    const result = generateHmac({ merchant_id: 'M001' }, ['merchant_id'], API_KEY, 'hex');
    const expected = crypto.createHmac('sha512', API_KEY).update('M001').digest('hex');

    expect(result).toBe(expected);
  });

  it('produces different hashes for different keys', () => {
    const payload = { a: 'same' };
    const fields = ['a'];

    const hash1 = generateHmac(payload, fields, 'key-1');
    const hash2 = generateHmac(payload, fields, 'key-2');

    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different field orders', () => {
    const payload = { a: 'X', b: 'Y' };

    const hash1 = generateHmac(payload, ['a', 'b'], API_KEY);
    const hash2 = generateHmac(payload, ['b', 'a'], API_KEY);

    expect(hash1).not.toBe(hash2);
  });

  it('handles empty fieldList', () => {
    const payload = { a: 'hello' };
    const result = generateHmac(payload, [], API_KEY);
    const expected = expectedHmac('', API_KEY);

    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// encryptMerchantAuth
// ---------------------------------------------------------------------------

describe('encryptMerchantAuth', () => {
  it('returns valid base64 with correct cipher block size for a small payload', () => {
    const { publicKey } = generateTestKeyPair();
    const data = { mc_id: 'M001', tran_id: 'T123', refund_amount: 5.0 };

    const encrypted = encryptMerchantAuth(data, publicKey);

    // Should be valid base64
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // 1024-bit RSA → 128-byte cipher blocks
    // Small payload < 117 bytes → exactly 1 block → 128 bytes
    const encBuf = Buffer.from(encrypted, 'base64');
    expect(encBuf.length).toBe(128);
  });

  it('handles data larger than 117 bytes (multi-chunk)', () => {
    const { publicKey } = generateTestKeyPair();
    // Create a payload that exceeds 117 bytes when JSON-stringified
    const data = {
      mc_id: 'M001',
      long_field: 'A'.repeat(200),
    };
    const jsonStr = JSON.stringify(data);
    const plaintextLen = Buffer.byteLength(jsonStr);
    expect(plaintextLen).toBeGreaterThan(117);

    const encrypted = encryptMerchantAuth(data, publicKey);

    // Should be valid base64
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // Verify multi-chunk: ceil(plaintextLen / 117) * 128 bytes
    const expectedChunks = Math.ceil(plaintextLen / 117);
    const encBuf = Buffer.from(encrypted, 'base64');
    expect(encBuf.length).toBe(expectedChunks * 128);
  });

  it('produces different ciphertext each call (PKCS1 random padding)', () => {
    const { publicKey } = generateTestKeyPair();
    const data = { mc_id: 'M001' };

    const enc1 = encryptMerchantAuth(data, publicKey);
    const enc2 = encryptMerchantAuth(data, publicKey);

    // PKCS1_PADDING is randomized, so outputs differ
    expect(enc1).not.toBe(enc2);
  });
});

// ---------------------------------------------------------------------------
// verifyCallbackSignature
// ---------------------------------------------------------------------------

describe('verifyCallbackSignature', () => {
  const API_KEY = 'webhook-secret-key';

  it('returns true for a valid signature', () => {
    const body = { tran_id: 'T123', amount: '10.00', status: '0' };

    // Compute expected: sort keys → amount, status, tran_id → concat values
    const sortedConcat = '10.000T123';
    const validSig = expectedHmac(sortedConcat, API_KEY);

    expect(verifyCallbackSignature(body, validSig, API_KEY)).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    const body = { tran_id: 'T123', amount: '10.00' };
    expect(verifyCallbackSignature(body, 'invalid-signature-here', API_KEY)).toBe(false);
  });

  it('returns false when signature length differs (timing-safe guard)', () => {
    const body = { a: '1' };
    const correctSig = expectedHmac('1', API_KEY);
    // Truncate to create a length mismatch
    expect(verifyCallbackSignature(body, correctSig.slice(0, 10), API_KEY)).toBe(false);
  });

  it('handles null/undefined values as empty string', () => {
    const body: Record<string, any> = { b: null, a: 'hello' };

    // sorted keys: a, b → values: 'hello', '' → concat: 'hello'
    const expected = expectedHmac('hello', API_KEY);

    expect(verifyCallbackSignature(body, expected, API_KEY)).toBe(true);
  });

  it('JSON-stringifies object/array values before concatenation', () => {
    const body = { items: [{ name: 'Widget' }], status: 'ok' };

    // sorted keys: items, status
    const itemsStr = JSON.stringify([{ name: 'Widget' }]);
    const expected = expectedHmac(itemsStr + 'ok', API_KEY);

    expect(verifyCallbackSignature(body, expected, API_KEY)).toBe(true);
  });
});
