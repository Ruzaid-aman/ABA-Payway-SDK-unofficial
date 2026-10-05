import { PayWayConfigError } from './errors.js';

/**
 * Sandbox-only test beneficiary accounts and test MIDs.
 *
 * These are seeded PayWay sandbox fixtures used for payout / split-payout
 * testing. They are NEVER valid in production — enforcement is gated behind
 * `config.environment === 'sandbox'`, and the validator below rejects any
 * beneficiary that is not in this list when running against the sandbox.
 *
 * Account/MID format rules (enforced in both environments):
 *   - digits only
 *   - length must be 9, 11, or 15 digits
 *
 * Currency support is recorded per-entry so the validator can surface a clear
 * currency-mismatch error instead of a generic rejection.
 */

export type BeneficiaryKind = 'account' | 'mid';
export type SandboxCurrency = 'USD' | 'KHR';

export interface SandboxBeneficiary {
  /** ABA account number (9/11 digits) or MID (15 digits). */
  id: string;
  kind: BeneficiaryKind;
  currencies: SandboxCurrency[];
  description?: string;
}

/** USD beneficiary accounts (9-digit). */
export const SANDBOX_BENEFICIARY_ACCOUNTS: SandboxBeneficiary[] = [
  { id: '500000001', kind: 'account', currencies: ['USD'], description: 'USD sandbox beneficiary 1' },
  { id: '500000002', kind: 'account', currencies: ['USD'], description: 'USD sandbox beneficiary 2' },
  { id: '002094060', kind: 'account', currencies: ['USD'], description: 'USD sandbox beneficiary 3' },
  { id: '111111111', kind: 'account', currencies: ['USD'], description: 'USD sandbox beneficiary 4' },
  { id: '002092621', kind: 'account', currencies: ['USD'], description: 'USD sandbox beneficiary 5' },
  { id: '000471132', kind: 'account', currencies: ['USD'], description: 'USD sandbox beneficiary 6' },
];

/** Test MIDs (15-digit), used for KHR payouts. */
export const SANDBOX_TEST_MIDS: SandboxBeneficiary[] = [
  { id: '323080111554956', kind: 'mid', currencies: ['KHR'], description: 'Test MID 1 (KHR)' },
  { id: '325012214045630', kind: 'mid', currencies: ['KHR'], description: 'Test MID 2 (KHR)' },
  { id: '325012214063221', kind: 'mid', currencies: ['KHR'], description: 'Test MID 3 (KHR)' },
];

/** Combined, lookup-friendly registry keyed by id (with leading zeros preserved). */
export const SANDBOX_BENEFICIARIES: Record<string, SandboxBeneficiary> = Object.fromEntries(
  [...SANDBOX_BENEFICIARY_ACCOUNTS, ...SANDBOX_TEST_MIDS].map((b) => [b.id, b]),
);

/** Allowed digit lengths for a beneficiary account or MID. */
export const VALID_BENEFICIARY_LENGTHS = [9, 11, 15] as const;

export function listSandboxBeneficiaries(): SandboxBeneficiary[] {
  return [...SANDBOX_BENEFICIARY_ACCOUNTS, ...SANDBOX_TEST_MIDS];
}

export function isKnownSandboxBeneficiary(id: string): boolean {
  return Object.hasOwn(SANDBOX_BENEFICIARIES, id);
}

export function lookupSandboxBeneficiary(id: string): SandboxBeneficiary | undefined {
  return SANDBOX_BENEFICIARIES[id];
}

export interface ValidateSandboxBeneficiaryOptions {
  /**
   * When true (sandbox environment), the id must be one of the seeded sandbox
   * beneficiaries AND its currency must match. When false (production), only the
   * structural format rules (digits, length) are enforced — production whitelists
   * are managed by PayWay per merchant, not by this SDK.
   */
  sandbox?: boolean;
}

/**
 * Validate a beneficiary account / MID.
 *
 * Always enforces:
 *   - non-empty string
 *   - digits only
 *   - length ∈ {9, 11, 15}
 *
 * When `opts.sandbox` is true, additionally enforces:
 *   - the id is a known seeded sandbox beneficiary
 *   - the requested currency is supported by that beneficiary
 *
 * @throws {PayWayConfigError} on any violation.
 */
export function validateSandboxBeneficiary(
  id: string,
  currency: SandboxCurrency,
  opts: ValidateSandboxBeneficiaryOptions = {},
): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new PayWayConfigError('beneficiary account/MID must be a non-empty string');
  }

  const normalized = id.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new PayWayConfigError(`beneficiary "${id}" must contain digits only`);
  }

  if (!VALID_BENEFICIARY_LENGTHS.includes(normalized.length as (typeof VALID_BENEFICIARY_LENGTHS)[number])) {
    throw new PayWayConfigError(`beneficiary "${id}" must be 9, 11, or 15 digits (received ${normalized.length})`);
  }

  if (!opts.sandbox) {
    return;
  }

  const entry = lookupSandboxBeneficiary(normalized);
  if (!entry) {
    throw new PayWayConfigError(
      `"${id}" is not a known sandbox beneficiary; the sandbox accepts only the seeded test accounts/MIDs`,
    );
  }
  if (!entry.currencies.includes(currency)) {
    throw new PayWayConfigError(
      `currency mismatch: sandbox ${entry.kind} "${id}" supports ${entry.currencies.join('/')}, not ${currency}`,
    );
  }
}
