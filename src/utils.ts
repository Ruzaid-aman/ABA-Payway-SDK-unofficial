import { PayWayConfigError } from './errors.js';
import {
  PURCHASE_LIFETIME_MIN_MINUTES,
  QR_LIFETIME_MAX_SECONDS,
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

/**
 * Advisory-limit escalation (live-docs audit 2026-08-31): gateway limits that
 * are NOT hard requirements — length caps, enum membership, minimum amounts —
 * warn once per distinct message by default and throw `PayWayConfigError`
 * when `config.strictValidation` is set. Gateway-documented REQUIRED fields
 * must NOT go through here; they validate directly.
 */
const advisoryWarned = new Set<string>();

export function warnAdvisory(
  config: { strictValidation?: boolean } | undefined,
  message: string,
): void {
  if (config?.strictValidation) {
    throw new PayWayConfigError(message);
  }
  if (advisoryWarned.has(message)) return;
  advisoryWarned.add(message);
  console.warn(`[payway] ${message}`);
}

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

/**
 * Build the ABA Pay deep-link URI that opens a KHQR string in the ABA Mobile
 * app. Scheme confirmed by the ABA PayWay integration team (2026-09-12,
 * docs/08): `abamobilebank://ababank.com?type=payway&qrcode=<QR_STRING>`.
 *
 * Prefer the `abapay_deeplink` field returned by purchase/checkout responses —
 * it arrives pre-built and should be used as-is (no intent:// wrapping). This
 * helper is for the rare case where a raw `qrString` must be wrapped manually.
 */
export function buildAbaPayDeeplink(qrString: string): string {
  if (typeof qrString !== 'string' || qrString.trim().length === 0) {
    throw new PayWayConfigError('qrString must be a non-empty string');
  }
  return `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qrString.trim())}`;
}

/**
 * Gateway-documented amount floors (audit §5.9): KHR >= 100, USD >= 0.01 on
 * payout / CoF payment / QR / payment-link. Advisory — warns (escalates to
 * PayWayConfigError under strictValidation) because the exact enforcement
 * surface per endpoint is not uniformly documented.
 */
export function validateAmountFloor(
  config: { strictValidation?: boolean } | undefined,
  amount: number,
  currency: 'USD' | 'KHR',
  context: string,
): void {
  const floor = currency === 'KHR' ? 100 : 0.01;
  if (amount < floor) {
    warnAdvisory(config, `${context}: amount ${amount} ${currency} is below the gateway minimum ${floor} ${currency}`);
  }
}

/**
 * Split-payout entry shape: `{acc, amt}` (purchase-path keys — purchase /
 * `cof charge` / pre-auth complete-payout / payment-link). One validator for
 * the domain and the CLI so the two checks can never drift apart (the
 * code-review follow-up to the S1 duplication finding).
 *
 * @throws PayWayConfigError on a malformed entry — empty/whitespace `acc`,
 *   non-finite or negative `amt`, or an entry that is not an object.
 */
export function validatePayoutEntryShape(entry: unknown): asserts entry is { acc: string; amt: number } {
  if (entry === null || typeof entry !== 'object') {
    throw new PayWayConfigError('payout entries must be objects with a non-empty string "acc" key and a numeric "amt" key');
  }
  const { acc, amt } = entry as { acc?: unknown; amt?: unknown };
  if (typeof acc !== 'string' || acc.trim().length === 0) {
    throw new PayWayConfigError('payout entries must be objects with a non-empty string "acc" key');
  }
  if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) {
    throw new PayWayConfigError('payout entries must carry a non-negative numeric "amt" key');
  }
}

/**
 * Sum of `amt` across payout entries. Precondition: every entry already
 * passed {@link validatePayoutEntryShape} — malformed entries throw there,
 * so this function only walks well-formed lists.
 */
export function payoutEntriesTotal(payout: ReadonlyArray<{ acc: string; amt: number }>): number {
  let total = 0;
  for (const entry of payout) {
    total += entry.amt;
  }
  return total;
}

/** Warned once per process for the first sub-5-char transactionId (EC-20). */
let warnedShortTranId = false;

/** Warned once per process for the first QR lifetime above the spec maximum. */
let warnedOversizedQrLifetime = false;

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
 *
 * The documented 120-day maximum is NOT enforced (production parity
 * unconfirmed); values above it emit a one-time console.warn instead.
 */
export function validateQrLifetimeSeconds(lifetime: number | undefined): void {
  validateLifetime(lifetime);
  if (lifetime !== undefined && lifetime < QR_LIFETIME_MIN_SECONDS) {
    throw new PayWayConfigError(
      `QR lifetime must be at least ${QR_LIFETIME_MIN_SECONDS} seconds (3 minutes — PayWay gateway minimum), received: ${lifetime}`,
    );
  }
  if (!warnedOversizedQrLifetime && lifetime !== undefined && lifetime > QR_LIFETIME_MAX_SECONDS) {
    warnedOversizedQrLifetime = true;
    console.warn(
      `[payway] QR lifetime ${lifetime}s exceeds the documented maximum of ${QR_LIFETIME_MAX_SECONDS}s (120 days) — the gateway may reject or clamp it`,
    );
  }
}

/**
 * Validate a checkout-purchase lifetime supplied in MINUTES (forwarded raw
 * to the API, unlike the QR domain which accepts seconds). Spec: min 3
 * (below that the gateway rejects with error 69), max 43200 (30 days, not
 * enforced locally).
 */
export function validatePurchaseLifetimeMinutes(lifetime: number | undefined): void {
  validateLifetime(lifetime);
  if (lifetime !== undefined && lifetime < PURCHASE_LIFETIME_MIN_MINUTES) {
    throw new PayWayConfigError(
      `purchase lifetime must be at least ${PURCHASE_LIFETIME_MIN_MINUTES} minutes (PayWay gateway minimum — below that the gateway rejects with error 69), received: ${lifetime}`,
    );
  }
}

/**
 * The current gateway-day window in the gateway's clock (UTC+7): the
 * transaction-list endpoints interpret `from_date`/`to_date` as gateway
 * time (sandbox-verified 2026-09-05), so a local/UTC-derived "today" silently
 * misses rows whenever the two clocks disagree. Returns `"YYYY-MM-DD
 * 00:00:00" → "YYYY-MM-DD 23:59:59"` for the day it currently is in
 * Phnom Penh. Used as the CLI `transaction-list` default; the gateway
 * itself answers a date-less list with the same gateway day (re-verified
 * 2026-09-05 — the campaign W2-12 "SDK no-dates → 0 rows" observation did
 * not reproduce: it was list-indexing lag, not gateway semantics).
 */
export function gatewayDayWindow(now: Date = new Date()): { fromDate: string; toDate: string } {
  const gateway = new Date(now.getTime() + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${gateway.getUTCFullYear()}-${pad(gateway.getUTCMonth() + 1)}-${pad(gateway.getUTCDate())}`;
  return { fromDate: `${day} 00:00:00`, toDate: `${day} 23:59:59` };
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

/**
 * Money sides in a PayWay transaction. `original_*` is the merchant's order
 * (what was charged); `payment_*` is the payer's actual debit, which CAN be in
 * a different currency (sandbox W5-6: a 4000 KHR order paid as 1 USD, and a
 * 1.20 USD order paid as 4800 KHR).
 */
export type RefundMoneySide = 'original' | 'payment';

/**
 * Currency-aware reconciliation of what remains refundable on a transaction.
 *
 * Refunds are requested against the ORIGINAL (merchant) money of the order —
 * the refund request carries the order currency and the gateway applies it to
 * the merchant ledger. Deriving the balance from `payment_amount` (payer
 * debit) mixes currencies when the payer paid in a different one, silently
 * approving/rejecting wrong refunds. This helper:
 *   - reconciles `original_amount − refund_amount` when both report the same
 *     currency (the common case),
 *   - returns `status: 'ambiguous'` with `reason` when the money sides carry
 *     different currencies (no authoritative conversion contract exists —
 *     converting via the current exchange rate would be a guess),
 *   - returns `status: 'unavailable'` when the needed fields are missing or
 *     the transaction is not in a refundable state.
 *
 * It never throws for data problems; a non-'ok' status is the caller's signal
 * to stop and decide.
 */
export interface RefundableBalanceResult {
  /** 'ok' — balance computed; otherwise see `reason`. */
  status: 'ok' | 'unavailable' | 'ambiguous';
  /** Refund request currency this balance was computed against. */
  requestCurrency: 'USD' | 'KHR';
  /** Remaining refundable amount in `requestCurrency`; only meaningful when status is 'ok'. */
  remaining?: number;
  /** Merchant order amount in `orderCurrency` (informational, from original_*). */
  orderAmount?: number;
  orderCurrency?: string;
  /** Payer debit (informational, from payment_*). */
  payerAmount?: number;
  payerCurrency?: string;
  /** Total refunded to date, in `requestCurrency` per the gateway ledger. */
  alreadyRefunded?: number;
  /**
   * Present when the refund request currency cannot be reconciled with the
   * order currency (R1): mismatched known currencies, or the order currency
   * is missing so the units of `original_amount` are unconfirmed.
   */
  currencyMismatch?: { requestCurrency: 'USD' | 'KHR'; orderCurrency?: string };
  /** Human-readable explanation for a non-'ok' status. */
  reason?: string;
}

interface RefundDetailLike {
  payment_status?: string;
  payment_status_code?: number;
  original_amount?: number;
  original_currency?: string;
  payment_amount?: number;
  payment_currency?: string;
  refund_amount?: number;
}

const REFUNDABLE_STATUSES = new Set(['APPROVED', 'REFUNDED', 'PRE-AUTH']);

/**
 * Compute the remaining refundable balance from a transaction-detail `data`
 * object, reconciling money in ONE currency. `requestCurrency` is the currency
 * the refund will be submitted in (the order's currency).
 */
export function computeRefundableBalance(
  detail: RefundDetailLike | undefined | null,
  requestCurrency: 'USD' | 'KHR',
): RefundableBalanceResult {
  const base: RefundableBalanceResult = { status: 'unavailable', requestCurrency };

  if (!detail || typeof detail !== 'object') {
    return { ...base, reason: 'transaction detail data is missing — cannot validate the refundable balance' };
  }

  const status = String(detail.payment_status ?? '').toUpperCase();
  if (status && !REFUNDABLE_STATUSES.has(status)) {
    return {
      ...base,
      reason: `transaction status is "${status}" — refunds usually require APPROVED (or REFUNDED/PRE-AUTH); PENDING/DECLINED/CANCELLED transactions are not refundable`,
    };
  }

  const orderAmount = Number(detail.original_amount);
  const refunded = Number(detail.refund_amount ?? 0);
  const payerAmount = Number(detail.payment_amount);
  const orderCurrency = typeof detail.original_currency === 'string' ? detail.original_currency : undefined;
  const payerCurrency = typeof detail.payment_currency === 'string' ? detail.payment_currency : undefined;

  if (!Number.isFinite(orderAmount)) {
    return {
      ...base,
      payerAmount: Number.isFinite(payerAmount) ? payerAmount : undefined,
      payerCurrency,
      reason: 'original_amount is missing from the detail response — the refundable balance cannot be derived from the merchant order money',
    };
  }
  if (!Number.isFinite(refunded)) {
    return { ...base, orderAmount, orderCurrency, reason: 'refund_amount is not a finite number in the detail response' };
  }

  // R1: the balance is ORDER money (original_amount − refund_amount). A
  // number labeled with a different currency is not a usable balance — the
  // request must be re-issued in the order's currency before comparing. This
  // applies both mismatch directions, and to a missing original_currency
  // (the units of original_amount are then unconfirmed).
  const normalizedOrderCurrency = orderCurrency?.trim().toUpperCase();
  if (normalizedOrderCurrency !== requestCurrency) {
    const currencyMismatch = { requestCurrency, orderCurrency: normalizedOrderCurrency };
    if (!normalizedOrderCurrency) {
      return {
        ...base,
        status: 'ambiguous',
        orderAmount,
        currencyMismatch,
        reason:
          `original_currency is missing from the detail response — the units of original_amount ${orderAmount} are unconfirmed, ` +
          `so a ${requestCurrency} refund request cannot be reconciled. Fetch the order currency and re-run.`,
      };
    }
    return {
      ...base,
      status: 'ambiguous',
      orderAmount,
      orderCurrency: normalizedOrderCurrency,
      currencyMismatch,
      reason:
        `currency mismatch — the order is denominated in ${normalizedOrderCurrency} but the refund was requested in ${requestCurrency}. ` +
        `Refunds are requested against the ORIGINAL money of the order; re-issue with -c ${normalizedOrderCurrency} ` +
        `(or refund via the SDK checkout.refund with '${normalizedOrderCurrency.toLowerCase()}'). Do not convert manually — no authoritative conversion contract exists.`,
    };
  }

  // The payer-side money is informational; when its currency differs from the
  // order money, any balance derived from it would mix currencies — flag it.
  const moneySidesDiffer =
    Number.isFinite(payerAmount) &&
    payerCurrency !== undefined &&
    orderCurrency !== undefined &&
    payerCurrency !== orderCurrency;

  const balance = orderAmount - refunded;
  if (balance <= 0) {
    return {
      status: 'ok',
      requestCurrency,
      remaining: 0,
      orderAmount,
      orderCurrency,
      alreadyRefunded: refunded,
      reason: `nothing left to refund (order ${orderAmount} ${orderCurrency ?? ''}, already refunded ${refunded})`,
    };
  }

  return {
    status: 'ok',
    requestCurrency,
    remaining: balance,
    orderAmount,
    orderCurrency,
    payerAmount: Number.isFinite(payerAmount) ? payerAmount : undefined,
    payerCurrency,
    alreadyRefunded: refunded,
    reason: moneySidesDiffer
      ? `payer paid ${payerAmount} ${payerCurrency} but the order is ${orderAmount} ${orderCurrency} — the balance is in ORDER money (${orderCurrency}); never reconcile refunds against payment_amount here`
      : undefined,
  };
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

/**
 * Escape a value for interpolation into a double-quoted HTML attribute.
 * Shared by every form-builder (checkout + link-card): one implementation
 * for a security-sensitive transform, tested in one place.
 */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(
    /'/g,
    '&#39;',
  );
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
    // Arrays inherit the parent key hint — a hash/token stored as a list
    // (e.g. `hash: ["<40-hex>"]`) must still hit the credential mask.
    return value.map((item) => sanitizeValue(item, keyHint));
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
