import { describe, expect, it } from 'vitest';
import {
  SANDBOX_BENEFICIARY_ACCOUNTS,
  SANDBOX_TEST_MIDS,
  SANDBOX_BENEFICIARIES,
  VALID_BENEFICIARY_LENGTHS,
  isKnownSandboxBeneficiary,
  listSandboxBeneficiaries,
  lookupSandboxBeneficiary,
  validateSandboxBeneficiary,
} from '../sandbox-beneficiaries.js';

describe('sandbox beneficiary seed data', () => {
  it('loads all 6 USD accounts and 3 MIDs', () => {
    expect(SANDBOX_BENEFICIARY_ACCOUNTS).toHaveLength(6);
    expect(SANDBOX_TEST_MIDS).toHaveLength(3);
    expect(listSandboxBeneficiaries()).toHaveLength(9);
    expect(Object.keys(SANDBOX_BENEFICIARIES)).toHaveLength(9);
  });

  it('preserves leading zeros in ids', () => {
    expect(SANDBOX_BENEFICIARIES['002094060']).toBeDefined();
    expect(SANDBOX_BENEFICIARIES['000471132']).toBeDefined();
  });

  it('tags accounts as USD and MIDs as KHR', () => {
    expect(SANDBOX_BENEFICIARY_ACCOUNTS.every((a) => a.kind === 'account' && a.currencies.includes('USD'))).toBe(true);
    expect(SANDBOX_TEST_MIDS.every((m) => m.kind === 'mid' && m.currencies.includes('KHR'))).toBe(true);
  });

  it('exposes lookup + isKnown helpers', () => {
    expect(isKnownSandboxBeneficiary('500000001')).toBe(true);
    expect(isKnownSandboxBeneficiary('999999999')).toBe(false);
    expect(lookupSandboxBeneficiary('323080111554956')?.kind).toBe('mid');
  });

  it('allows valid beneficiary lengths', () => {
    expect(VALID_BENEFICIARY_LENGTHS).toEqual([9, 11, 15]);
  });
});

describe('validateSandboxBeneficiary — structural (both environments)', () => {
  it('rejects empty / non-string ids', () => {
    expect(() => validateSandboxBeneficiary('', 'USD')).toThrow(/non-empty/);
    expect(() => validateSandboxBeneficiary('   ', 'USD')).toThrow(/non-empty/);
  });

  it('rejects non-digit ids', () => {
    expect(() => validateSandboxBeneficiary('ABC123', 'USD')).toThrow(/digits only/);
  });

  it('rejects wrong digit lengths (must be 9/11/15)', () => {
    expect(() => validateSandboxBeneficiary('12345678', 'USD')).toThrow(/9, 11, or 15 digits/);
    expect(() => validateSandboxBeneficiary('1234567890', 'USD')).toThrow(/9, 11, or 15 digits/);
    expect(() => validateSandboxBeneficiary('1234567890123456', 'USD')).toThrow(/9, 11, or 15 digits/);
    expect(() => validateSandboxBeneficiary('500000001', 'USD')).not.toThrow(); // 9 digits
    expect(() => validateSandboxBeneficiary('323080111554956', 'KHR')).not.toThrow(); // 15 digits
  });
});

describe('validateSandboxBeneficiary — sandbox enforcement', () => {
  it('accepts a seeded USD account with USD', () => {
    expect(() => validateSandboxBeneficiary('500000001', 'USD', { sandbox: true })).not.toThrow();
  });

  it('accepts a seeded KHR MID with KHR', () => {
    expect(() => validateSandboxBeneficiary('323080111554956', 'KHR', { sandbox: true })).not.toThrow();
  });

  it('rejects an unknown account in sandbox', () => {
    expect(() => validateSandboxBeneficiary('999999999', 'USD', { sandbox: true })).toThrow(
      /not a known sandbox beneficiary/,
    );
  });

  it('rejects currency mismatch (USD account used for KHR)', () => {
    expect(() => validateSandboxBeneficiary('500000001', 'KHR', { sandbox: true })).toThrow(/currency mismatch/);
  });

  it('rejects currency mismatch (KHR MID used for USD)', () => {
    expect(() => validateSandboxBeneficiary('323080111554956', 'USD', { sandbox: true })).toThrow(/currency mismatch/);
  });
});

describe('validateSandboxBeneficiary — production (no allowlist)', () => {
  it('allows an arbitrary valid-format account without a sandbox allowlist', () => {
    expect(() => validateSandboxBeneficiary('999999999', 'USD', { sandbox: false })).not.toThrow();
  });

  it('still enforces the digit-length rule in production', () => {
    expect(() => validateSandboxBeneficiary('12345', 'USD', { sandbox: false })).toThrow(/9, 11, or 15 digits/);
  });
});
