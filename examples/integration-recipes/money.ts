export type Currency = 'USD' | 'KHR';
// This recipe's units: USD cents and whole KHR. Never round an obligation.
export function scale(currency: Currency): number {
  if (currency === 'USD') return 100;
  if (currency === 'KHR') return 1;
  throw new Error('Unsupported currency');
}
export function validateMinor(amount: number, currency: Currency): void {
  scale(currency);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid server price');
}
export function toGatewayAmount(amount: number, currency: Currency): number {
  validateMinor(amount, currency);
  return amount / scale(currency);
}
export function fromGatewayAmount(value: unknown, currency: Currency): number | undefined {
  const text =
    typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined;
  const [whole, fraction = ''] = text.split('.');
  const digits = currency === 'USD' ? 2 : currency === 'KHR' ? 0 : -1;
  if (digits < 0 || /[1-9]/.test(fraction.slice(digits))) return undefined;
  const amount = BigInt(whole) * BigInt(scale(currency)) + BigInt(fraction.slice(0, digits).padEnd(digits, '0') || '0');
  return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : undefined;
}
