import { describe, it, expect } from 'vitest';
import { generateOfflineQR } from '../khqr-offline.js';

describe('generateOfflineQR', () => {
  it('produces a valid TLV string ending with a CRC-16 checksum', () => {
    const qr = generateOfflineQR({
      merchantId: 'MERCHANT123',
      transactionId: 'TXN-001',
      amount: 25.5,
      currency: 'USD',
      merchantRef: 'REF-123',
    });

    expect(qr).toMatch(/^[0-9A-Z.-]{2,}[0-9A-F]{4}$/);
    expect(qr.slice(-4)).toHaveLength(4);
  });

  it('creates deterministic output for the same inputs', () => {
    const input = {
      merchantId: 'M001',
      transactionId: 'T001',
      amount: 100,
      currency: 'KHR' as const,
      merchantRef: 'REF001',
    };

    const first = generateOfflineQR(input);
    const second = generateOfflineQR(input);

    expect(first).toBe(second);
  });

  it('includes optional tip and fee fields when provided', () => {
    const qr = generateOfflineQR({
      merchantId: 'M001',
      transactionId: 'T002',
      amount: 20,
      currency: 'USD',
      merchantRef: 'REF002',
      tipAmount: 2.5,
      feeAmount: 1.0,
      transactionType: 'purchase',
    });

    expect(qr).toContain('06042.50');
    expect(qr).toContain('07041.00');
    expect(qr).toContain('0808purchase');
  });
});
