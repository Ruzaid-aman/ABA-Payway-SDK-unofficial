/**
 * Sandbox-only test cards for hosted card-checkout testing.
 *
 * Source: ABA PayWay integration-team relay (2026-09-12) — the developer-portal
 * test-card list. Sandbox ONLY: real card data must never be used in sandbox,
 * and these cards are NEVER valid in production. ABA may rotate the list;
 * request updated cards from the Integration Team if a card starts failing.
 *
 * The "approved" cards drive the success path; the "declined" cards exercise
 * decline/error handling. Cards flagged `threeDS: true` trigger the 3DS
 * challenge (the test 3DS OTP is delivered by email per docs/02).
 */

export type SandboxTestCardOutcome = 'approved' | 'declined';
export type SandboxTestCardBrand = 'visa' | 'mastercard';

export interface SandboxTestCard {
  /** Full PAN, digits only (16 digits). */
  number: string;
  brand: SandboxTestCardBrand;
  /** Expiry in MM/YY. */
  expiry: string;
  cvv: string;
  /** Whether the card triggers the 3DS challenge flow. */
  threeDS: boolean;
  outcome: SandboxTestCardOutcome;
  description?: string;
}

/** Approved sandbox cards (success path). */
export const SANDBOX_APPROVED_TEST_CARDS: SandboxTestCard[] = [
  {
    number: '5156839937706777',
    brand: 'mastercard',
    expiry: '01/30',
    cvv: '993',
    threeDS: false,
    outcome: 'approved',
    description: 'Successful MasterCard (no 3DS)',
  },
  {
    number: '4286090000000206',
    brand: 'visa',
    expiry: '04/30',
    cvv: '777',
    threeDS: true,
    outcome: 'approved',
    description: 'Successful Visa (3DS challenge; test OTP via email)',
  },
];

/** Declined sandbox cards (failure path). */
export const SANDBOX_DECLINED_TEST_CARDS: SandboxTestCard[] = [
  {
    number: '5156830272561029',
    brand: 'mastercard',
    expiry: '04/30',
    cvv: '777',
    threeDS: true,
    outcome: 'declined',
    description: 'Declined MasterCard (3DS challenge)',
  },
  {
    number: '4156839937706777',
    brand: 'visa',
    expiry: '01/30',
    cvv: '993',
    threeDS: false,
    outcome: 'declined',
    description: 'Declined Visa (no 3DS)',
  },
];

/** Combined registry of every seeded sandbox test card. */
export const SANDBOX_TEST_CARDS: SandboxTestCard[] = [...SANDBOX_APPROVED_TEST_CARDS, ...SANDBOX_DECLINED_TEST_CARDS];

export function listSandboxTestCards(outcome?: SandboxTestCardOutcome): SandboxTestCard[] {
  return outcome ? SANDBOX_TEST_CARDS.filter((card) => card.outcome === outcome) : [...SANDBOX_TEST_CARDS];
}

function normalizePan(pan: string): string {
  return pan.replace(/[\s-]/g, '');
}

export function isKnownSandboxTestCard(number: string): boolean {
  const normalized = normalizePan(number);
  return SANDBOX_TEST_CARDS.some((card) => card.number === normalized);
}
