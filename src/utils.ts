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

export function formatAmount(amount: number, currency: 'USD' | 'KHR'): string {
  if (currency === 'USD') {
    return amount.toFixed(2);
  }
  return Math.round(amount).toString();
}

export function toBase64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

export function encodeBase64IfNeeded(val: any): string {
  if (typeof val === 'string') {
    if (val.startsWith('http://') || val.startsWith('https://')) {
      return toBase64(val);
    }
    return val;
  }
  return toBase64(JSON.stringify(val));
}

export function filterParams<T extends Record<string, any>>(obj: T): Partial<T> {
  const filtered: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined && obj[key] !== null) {
      filtered[key] = obj[key];
    }
  }
  return filtered as Partial<T>;
}
