import { PayWayConfigError } from './errors.js';

export function formatRequestTime(date?: Date): string {
  const now = date || new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
}

const VALID_CURRENCIES: Array<'USD' | 'KHR'> = ['USD', 'KHR'];

export function validateCurrency(currency: 'USD' | 'KHR' | string | undefined): void {
  if (currency !== undefined && !VALID_CURRENCIES.includes(currency as 'USD' | 'KHR')) {
    throw new PayWayConfigError(`currency must be one of ${VALID_CURRENCIES.join(', ')}, received: ${currency}`);
  }
}

export function validatePositiveAmount(amount: number, currency: 'USD' | 'KHR'): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PayWayConfigError(`amount must be a positive number, received: ${amount}`);
  }

  if (currency === 'USD') {
    const rounded = Math.round(amount * 100) / 100;
    if (Math.abs(amount - rounded) > 1e-10) {
      throw new PayWayConfigError(`USD amount must have at most 2 decimal places, received: ${amount}`);
    }
  } else if (currency === 'KHR' && !Number.isInteger(amount)) {
    throw new PayWayConfigError(`KHR amount must be an integer, received: ${amount}`);
  }
}

export function validateTransactionId(transactionId: string): void {
  if (typeof transactionId !== 'string' || transactionId.length === 0) {
    throw new PayWayConfigError('transactionId is required and must be a non-empty string');
  }
}

export function validateLifetime(lifetime: number | undefined): void {
  if (lifetime !== undefined && (!Number.isInteger(lifetime) || lifetime <= 0)) {
    throw new PayWayConfigError('lifetime must be a positive whole number of seconds');
  }
}

export function validatePublicHttpsUrl(url: string, fieldName: string): void {
  if (typeof url !== 'string' || url.trim() !== url) {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.hostname === 'localhost') {
      throw new Error('invalid public HTTPS URL');
    }
  } catch {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
}

export function validateBeneficiaries(
  beneficiaries: { account: string; amount: number }[],
  totalAmount: number,
  currency: 'USD' | 'KHR',
): void {
  if (!Array.isArray(beneficiaries) || beneficiaries.length === 0) {
    throw new PayWayConfigError('beneficiaries must be a non-empty array');
  }

  let sum = 0;
  for (const b of beneficiaries) {
    if (typeof b.account !== 'string' || b.account.length === 0) {
      throw new PayWayConfigError('each beneficiary must have a non-empty account string');
    }
    validatePositiveAmount(b.amount, currency);
    sum += b.amount;
  }

  if (Math.abs(sum - totalAmount) > Number.EPSILON) {
    throw new PayWayConfigError(`beneficiary amounts (${sum}) must sum to total amount (${totalAmount})`);
  }
}

export function formatAmount(amount: number, currency: 'USD' | 'KHR'): string {
  if (currency === 'USD') {
    return amount.toFixed(2);
  }
  return Math.round(amount).toString();
}

export function toBase64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

export function encodeBase64IfNeeded(val: unknown): string {
  if (typeof val === 'string') {
    if (val.startsWith('http://') || val.startsWith('https://')) {
      return toBase64(val);
    }
    return val;
  }
  return toBase64(JSON.stringify(val));
}

export function filterParams<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined && obj[key] !== null) {
      filtered[key] = obj[key];
    }
  }
  return filtered as Partial<T>;
}
