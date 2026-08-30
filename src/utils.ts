import { PayWayConfigError } from './errors.js';
import {
  QR_LIFETIME_MIN_SECONDS,
  REQUEST_ID_PATTERN,
  TOKEN_FLAG_CHARGING,
  TOKEN_FLAG_LINKING,
  TOKEN_VALIDITY_DAYS,
} from './constants.js';

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

/** Warned once per process for the first sub-5-char transactionId (EC-20). */
let warnedShortTranId = false;

export function validateTransactionId(transactionId: string): void {
  if (typeof transactionId !== 'string' || transactionId.length === 0) {
    throw new PayWayConfigError('transactionId is required and must be a non-empty string');
  }
  if (transactionId.length > 20) {
    throw new PayWayConfigError(
      `transactionId must be ≤ 20 characters, received ${transactionId.length}: "${transactionId}"`,
    );
  }
  if (!/^[a-zA-Z0-9-]+$/.test(transactionId)) {
    throw new PayWayConfigError(
      `transactionId may only contain letters, digits, and hyphens, received: "${transactionId}"`,
    );
  }
  // The gateway enforces [a-zA-Z0-9]{5,24} on request_id/ctid; the equivalent
  // minimum for tran_id is unconfirmed, so warn once instead of rejecting
  // short IDs outright (EC-20).
  if (!warnedShortTranId && transactionId.length < 5) {
    warnedShortTranId = true;
    console.warn(
      '[payway] transactionId is shorter than 5 characters; the gateway enforces [a-zA-Z0-9]{5,24} on some identifiers — if the API rejects it, use a longer ID',
    );
  }
}

export function validateLifetime(lifetime: number | undefined): void {
  if (lifetime !== undefined && (!Number.isInteger(lifetime) || lifetime <= 0)) {
    throw new PayWayConfigError('lifetime must be a positive whole number of seconds');
  }
}

/**
 * Validate a QR-code lifetime supplied in seconds.
 *
 * PayWay's generate-qr API takes whole minutes and rejects anything below 3
 * with an opaque HTTP 400 code "04" (sandbox-pinned boundary 2026-08-30:
 * 179s → 400 "04", 180s → OK). The generic {@link validateLifetime} cannot
 * enforce this because checkout.purchase sends its lifetime in minutes.
 */
export function validateQrLifetimeSeconds(lifetime: number | undefined): void {
  validateLifetime(lifetime);
  if (lifetime !== undefined && lifetime < QR_LIFETIME_MIN_SECONDS) {
    throw new PayWayConfigError(
      `QR lifetime must be at least ${QR_LIFETIME_MIN_SECONDS} seconds (3 minutes — PayWay gateway minimum), received: ${lifetime}`,
    );
  }
}

/**
 * Hostnames (or IP literals) that PayWay's servers cannot reach: loopback,
 * RFC1918/link-local/CGNAT ranges, multicast/reserved, and mDNS/internal
 * suffixes. Used to fail fast on callback URLs that can never receive a
 * callback (EC-19).
 */
function isPrivateOrReservedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'localhost.localdomain') return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

export function validatePublicHttpsUrl(
  url: string,
  fieldName: string,
  options?: { allowPrivateHosts?: boolean },
): void {
  if (typeof url !== 'string' || url.trim() !== url) {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new PayWayConfigError(`${fieldName} must be a public HTTPS URL without surrounding whitespace`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost') {
    throw new PayWayConfigError(
      `${fieldName} must be a public HTTPS URL — localhost is unreachable from PayWay's servers`,
    );
  }
  if (!options?.allowPrivateHosts && isPrivateOrReservedHostname(host)) {
    throw new PayWayConfigError(
      `${fieldName} points at a private/loopback address (${parsed.hostname}) that PayWay's servers cannot reach — ` +
        'expose a public HTTPS endpoint, or set allowPrivateCallbackHosts: true if this is an on-prem gateway',
    );
  }
}

/**
 * Fail-fast parity for the gateway's `[a-zA-Z0-9]{5,24}` identifier rule
 * (sandbox-verified; see Pillar A A.1.1/A.2.5 of the four-pillars audit).
 * Prevents late server-side rejections with opaque error bodies.
 */
export function validateRequestIdOrCtid(value: string, fieldName: 'requestId' | 'ctid'): void {
  if (typeof value !== 'string' || !REQUEST_ID_PATTERN.test(value)) {
    throw new PayWayConfigError(
      `${fieldName} must be 5–24 characters containing only letters and digits ([a-zA-Z0-9]{5,24}, gateway-enforced), received: "${value}"`,
    );
  }
}

/**
 * Client-side enum validation for `token_flag`.
 *
 * The SDK previously accepted arbitrary strings and relied on a server
 * roundtrip (Pillar A A.2.4). The enums are stricter than the OpenAPI doc:
 * `CITR_FIX` is only valid for charging, not linking.
 */
export function validateTokenFlag(value: string, scope: 'linking' | 'charging'): void {
  const allowed: ReadonlySet<string> = new Set(scope === 'linking' ? TOKEN_FLAG_LINKING : TOKEN_FLAG_CHARGING);
  if (!allowed.has(value)) {
    const accepted = [...(scope === 'linking' ? TOKEN_FLAG_LINKING : TOKEN_FLAG_CHARGING)].join(', ');
    throw new PayWayConfigError(`tokenFlag "${value}" is not valid for ${scope}; accepted values: ${accepted}`);
  }
}

// ─── Token lifecycle helpers (TD-10) ──────────────────────────────────────

/**
 * Compute the calendar instant at which a token granted/renewed at `from`
 * expires under the standard 90-day cycle (TD-10 helper).
 *
 * @param from - Grant/renewal timestamp (Date, epoch ms, or ISO string). Defaults to now.
 * @param days - Validity window in days; defaults to {@link TOKEN_VALIDITY_DAYS}.
 * @returns A new Date `days` after `from`.
 *
 * @example Schedule renewal checks:
 * ```ts
 * import { computeTokenExpiry, daysUntilTokenExpiry } from 'aba-payway-ts';
 * const expiresAt = computeTokenExpiry(new Date());
 * if (daysUntilTokenExpiry(expiresAt) < 7) await scheduleRenewal();
 * ```
 */
export function computeTokenExpiry(
  from: Date | number | string = Date.now(),
  days: number = TOKEN_VALIDITY_DAYS,
): Date {
  const base = from instanceof Date ? new Date(from.getTime()) : new Date(from);
  if (Number.isNaN(base.getTime())) {
    throw new PayWayConfigError('computeTokenExpiry: "from" must be a valid date, epoch ms, or ISO string');
  }
  if (!Number.isFinite(days) || days <= 0) {
    throw new PayWayConfigError('computeTokenExpiry: days must be a positive finite number');
  }
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Whole days remaining until `expiresAt` (floors toward zero; negative = expired). */
export function daysUntilTokenExpiry(
  expiresAt: Date | number | string,
  now: Date | number | string = Date.now(),
): number {
  const exp = new Date(expiresAt).getTime();
  const ref = new Date(now).getTime();
  if (Number.isNaN(exp) || Number.isNaN(ref)) {
    throw new PayWayConfigError('daysUntilTokenExpiry: dates must be valid');
  }
  return Math.floor((exp - ref) / (24 * 60 * 60 * 1000));
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

  // Compare in integer minor units (cents for USD): accumulated float error
  // on legitimate sums drifts by ~1e-15, which exceeds Number.EPSILON and
  // used to false-reject valid splits like [1.1, 2.2] vs 3.3.
  const minorUnitScale = currency === 'USD' ? 100 : 1;
  if (Math.round(sum * minorUnitScale) !== Math.round(totalAmount * minorUnitScale)) {
    throw new PayWayConfigError(`beneficiary amounts (${sum}) must sum to total amount (${totalAmount})`);
  }
}

/**
 * Validate a refund amount before sending to the PayWay refund endpoint.
 *
 * Discovered via sandbox testing: PayWay rejects refund_amount < 0.01 with
 * HTTP 400 / PTL04 ("refund_amount must be greater than or equal to 0.01").
 * This validation catches the error client-side, saving a network round-trip.
 *
 * @param amount - The refund amount to validate.
 * @param currency - The original transaction currency ('USD' or 'KHR').
 * @throws {PayWayConfigError} If the amount is invalid or below the minimum.
 */
export function validateRefundAmount(amount: number, currency: 'USD' | 'KHR' = 'USD'): void {
  if (!Number.isFinite(amount)) {
    throw new PayWayConfigError(`refund amount must be a finite number, received: ${amount}`);
  }

  if (currency === 'USD') {
    // PayWay minimum refund for USD is $0.01 (PTL04 confirmed via sandbox)
    if (amount < 0.01) {
      throw new PayWayConfigError(`refund amount must be at least $0.01 USD, received: ${amount}`);
    }
    // USD supports exactly 2 decimal places
    const rounded = Math.round(amount * 100) / 100;
    if (Math.abs(amount - rounded) > 1e-10) {
      throw new PayWayConfigError(`refund USD amount must have at most 2 decimal places, received: ${amount}`);
    }
  } else if (currency === 'KHR') {
    // KHR amounts must be integers (KHR 1 ≈ $0.0025)
    if (!Number.isInteger(amount)) {
      throw new PayWayConfigError(`refund KHR amount must be an integer, received: ${amount}`);
    }
    if (amount < 1) {
      throw new PayWayConfigError(`refund KHR amount must be at least 1, received: ${amount}`);
    }
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

/**
 * Normalize a PEM string supplied via config or environment variables.
 * `.env` files commonly store multi-line PEMs on one line with literal "\n"
 * sequences, which Node's crypto rejects (ERR_OSSL_UNSUPPORTED) — convert
 * them to real newlines. Returns undefined when no key is provided.
 */
export function normalizePem(pem: string | undefined): string | undefined {
  return pem?.replace(/\\n/g, '\n');
}

const PUBLIC_KEY_PEM_HEADER = /-----BEGIN (RSA )?PUBLIC KEY-----/;
const PUBLIC_KEY_PEM_FOOTER = /-----END (RSA )?PUBLIC KEY-----\s*$/;

/**
 * Structural check that a string looks like an RSA public key PEM.
 * Used to fail fast with a clear message before RSA-encrypted endpoints
 * instead of surfacing a raw OpenSSL error.
 */
export function isValidPublicKeyPem(pem: string | undefined): pem is string {
  if (!pem) return false;
  const trimmed = pem.trim();
  return PUBLIC_KEY_PEM_HEADER.test(trimmed) && PUBLIC_KEY_PEM_FOOTER.test(trimmed);
}

const URL_PREFIXES = ['http://', 'https://', '//', 'www.'];

function looksLikeUrl(val: string): boolean {
  return URL_PREFIXES.some((prefix) => val.startsWith(prefix));
}

export function encodeBase64IfNeeded(val: unknown): string {
  if (typeof val === 'string') {
    if (looksLikeUrl(val)) {
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

const SENSITIVE_LOG_KEYS = new Set([
  'api_key',
  'apikey',
  'hash',
  'merchant_auth',
  'password',
  'pwt',
  'payment_token',
  'authorization',
  'x-payway-hmac-sha512',
  'publickeypem',
  'card_number',
  'cvv',
  'google_pay_token',
]);

/** Return a JSON-safe copy of a value with secrets removed for diagnostic logging. */
export function sanitizeForLog(value: unknown): unknown {
  return sanitizeValue(value);
}

/**
 * Key names whose lowercase form contains one of these fragments are treated
 * as sensitive even when they are not exact matches (e.g. novel keys like
 * `secretField` or `apiKey2` that the blocklist would miss).
 * `token_flag` is deliberately excluded: it carries public enum values
 * (`MITU_FLEX`, …), not secrets.
 */
const SENSITIVE_KEY_FRAGMENTS = ['secret', 'apikey', 'password', 'passwd', 'credential', 'hash'] as const;

function isSensitiveKeyFuzzy(keyLower: string): boolean {
  if (keyLower === 'token_flag') return false;
  if (SENSITIVE_KEY_FRAGMENTS.some((frag) => keyLower.includes(frag))) return true;
  // Exact-match aliases plus token-shaped keys ('payment_token', 'x-payway-token', …).
  return keyLower.includes('token') || keyLower.endsWith('key');
}

function sanitizeValue(value: unknown, keyHint?: string): unknown {
  if (value === null || typeof value !== 'object') {
      if (
        typeof value === 'string' &&
        keyHint !== undefined &&
        /^[a-f0-9]{40,}$/i.test(value)
      ) {
        // SHA-1-length-or-longer hex strings under unrecognized keys are
        // almost certainly credentials/hashes — mask them defensively (TD-12).
        // 32-char hex (MD5-length order refs etc.) stays visible to avoid
        // masking benign identifiers (EC-23).
        return '***HIDDEN***';
      }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const keyLower = key.toLowerCase();
    if (SENSITIVE_LOG_KEYS.has(keyLower) || isSensitiveKeyFuzzy(keyLower)) {
      sanitized[key] = '***HIDDEN***';
    } else {
      sanitized[key] = sanitizeValue(nestedValue, keyLower);
    }
  }
  return sanitized;
}
