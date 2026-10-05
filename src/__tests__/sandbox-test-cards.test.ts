import { describe, expect, it } from 'vitest';
import {
  SANDBOX_APPROVED_TEST_CARDS,
  SANDBOX_DECLINED_TEST_CARDS,
  SANDBOX_TEST_CARDS,
  isKnownSandboxTestCard,
  listSandboxTestCards,
} from '../sandbox-test-cards.js';
import { buildAbaPayDeeplink } from '../utils.js';

describe('sandbox test-card seed data (ABA relay 2026-09-12)', () => {
  it('loads 2 approved and 2 declined cards', () => {
    expect(SANDBOX_APPROVED_TEST_CARDS).toHaveLength(2);
    expect(SANDBOX_DECLINED_TEST_CARDS).toHaveLength(2);
    expect(listSandboxTestCards()).toHaveLength(4);
  });

  it('uses 16-digit numeric PANs with unique numbers', () => {
    const numbers = SANDBOX_TEST_CARDS.map((card) => card.number);
    expect(new Set(numbers).size).toBe(4);
    for (const number of numbers) {
      expect(number).toMatch(/^\d{16}$/);
    }
  });

  it('tags the documented approved/declined outcomes and brands', () => {
    expect(SANDBOX_APPROVED_TEST_CARDS.every((card) => card.outcome === 'approved')).toBe(true);
    expect(SANDBOX_DECLINED_TEST_CARDS.every((card) => card.outcome === 'declined')).toBe(true);
    expect(SANDBOX_TEST_CARDS.map((card) => card.brand).sort()).toEqual(['mastercard', 'mastercard', 'visa', 'visa']);
  });

  it('filters by outcome', () => {
    expect(listSandboxTestCards('declined')).toHaveLength(2);
    expect(listSandboxTestCards('declined').every((card) => card.outcome === 'declined')).toBe(true);
    expect(listSandboxTestCards('approved').every((card) => card.outcome === 'approved')).toBe(true);
  });

  it('recognizes PANs with separators via isKnownSandboxTestCard', () => {
    expect(isKnownSandboxTestCard('5156 8399 3770 6777')).toBe(true);
    expect(isKnownSandboxTestCard('4286-0900-0000-0206')).toBe(true);
    expect(isKnownSandboxTestCard('4111111111111111')).toBe(false);
  });
});

describe('buildAbaPayDeeplink (scheme confirmed by ABA 2026-09-12)', () => {
  it('wraps a KHQR string in the confirmed abamobilebank scheme', () => {
    const qr = '00020101021229370016A000000677010111013006668401160610ABC1235303840';
    expect(buildAbaPayDeeplink(qr)).toBe(`abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qr)}`);
  });

  it('trims surrounding whitespace and tolerates separators', () => {
    expect(buildAbaPayDeeplink('  ABC123  ')).toBe(
      `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent('ABC123')}`,
    );
  });

  it('rejects empty input', () => {
    expect(() => buildAbaPayDeeplink('')).toThrow(/non-empty/);
    expect(() => buildAbaPayDeeplink('   ')).toThrow(/non-empty/);
  });
});
