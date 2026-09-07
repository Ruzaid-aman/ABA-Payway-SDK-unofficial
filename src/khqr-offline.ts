import { PayWayConfigError } from './errors.js';
import type { KhqrMerchantConfiguration } from './khqr-config.js';
import { validateKhqrConfiguration } from './khqr-config.js';

/** Parameters used to construct an official ABA KHQR offline payload. */
export interface GenerateOfflineQrParams {
  amount?: number;
  currency: 'KHR' | 'USD';
  merchantRef: string;
  createdAt?: Date | number;
  expiresAt?: Date | number;
}

export type KhqrClock = () => Date;

const DEFAULT_EXPIRY_MILLISECONDS = 15 * 60 * 1000;
const MAX_AMOUNT_LENGTH = 13;

function encodeTlv(tag: string, value: string): string {
  const length = Buffer.byteLength(value, 'utf8');
  if (length > 99) throw new PayWayConfigError(`KHQR_TLV_VALUE_TOO_LONG: tag ${tag} exceeds 99 UTF-8 bytes`);
  return `${tag}${String(length).padStart(2, '0')}${value}`;
}

function encodeTemplate(tag: string, values: ReadonlyArray<readonly [string, string]>): string {
  return encodeTlv(tag, values.map(([nestedTag, value]) => encodeTlv(nestedTag, value)).join(''));
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatAmount(amount: number, currency: 'KHR' | 'USD'): string {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new PayWayConfigError('amount must be a positive finite number for a dynamic ABA KHQR payload');
  const source = String(amount);
  if (/e/i.test(source)) throw new PayWayConfigError('amount must not use exponent notation');

  let formatted: string;
  if (currency === 'KHR') {
    if (!Number.isInteger(amount)) throw new PayWayConfigError('KHR amount must be an integer');
    formatted = source;
  } else {
    const scaled = amount * 100;
    const nearestInteger = Math.round(scaled);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
    if (Math.abs(scaled - nearestInteger) > tolerance) {
      throw new PayWayConfigError('USD amount must have at most two decimal places');
    }
    formatted = amount.toFixed(2);
  }

  if (formatted.length > MAX_AMOUNT_LENGTH) {
    throw new PayWayConfigError(`amount must be at most ${MAX_AMOUNT_LENGTH} characters for ABA KHQR tag 54`);
  }
  return formatted;
}

function timestamp(value: Date | number, field: 'createdAt' | 'expiresAt'): number {
  const milliseconds = value instanceof Date ? value.getTime() : value;
  if (!Number.isInteger(milliseconds) || milliseconds < 1_000_000_000_000 || milliseconds > 9_999_999_999_999) {
    throw new PayWayConfigError(`${field} must be a 13-digit epoch-millisecond timestamp`);
  }
  return milliseconds;
}

function assertMerchantRef(merchantRef: string): void {
  if (
    typeof merchantRef !== 'string' ||
    merchantRef.trim().length === 0 ||
    Buffer.byteLength(merchantRef, 'utf8') > 25
  ) {
    throw new PayWayConfigError('merchantRef must be a non-empty value of at most 25 UTF-8 bytes');
  }
}

/** Generates an official ABA KHQR TLV payload locally without a PayWay API call. */
export function generateOfflineQR(
  params: GenerateOfflineQrParams,
  configuration: KhqrMerchantConfiguration | undefined = undefined,
  clock: KhqrClock = () => new Date(),
): string {
  const readiness = validateKhqrConfiguration(configuration);
  if (!readiness.ready) throw new PayWayConfigError(readiness.issues.map(({ code }) => code).join(', '));
  const resolvedConfiguration = configuration as Required<KhqrMerchantConfiguration>;

  if (params.currency !== 'KHR' && params.currency !== 'USD') {
    throw new PayWayConfigError('currency must be KHR or USD for an ABA KHQR payload');
  }
  assertMerchantRef(params.merchantRef);
  const createdAt = timestamp(params.createdAt ?? clock(), 'createdAt');
  const expiresAt = timestamp(params.expiresAt ?? createdAt + DEFAULT_EXPIRY_MILLISECONDS, 'expiresAt');
  if (expiresAt <= createdAt) throw new PayWayConfigError('expiresAt must be later than createdAt');

  const payload = [
    encodeTlv('00', '01'),
    encodeTlv('01', params.amount === undefined ? '11' : '12'),
    encodeTemplate('30', [
      ['00', resolvedConfiguration.bakongId],
      ['01', resolvedConfiguration.abaMerchantId],
      ['02', resolvedConfiguration.acquirerName],
    ]),
    encodeTlv('52', resolvedConfiguration.merchantCategoryCode),
    encodeTlv('53', params.currency === 'KHR' ? '116' : '840'),
    ...(params.amount === undefined ? [] : [encodeTlv('54', formatAmount(params.amount, params.currency))]),
    encodeTlv('58', 'KH'),
    encodeTlv('59', resolvedConfiguration.merchantName),
    encodeTlv('60', resolvedConfiguration.merchantCity),
    encodeTemplate('62', [
      ['01', params.merchantRef],
      ['68', resolvedConfiguration.paywayData],
    ]),
    encodeTemplate('99', [
      ['00', String(createdAt)],
      ['01', String(expiresAt)],
    ]),
  ].join('');
  const crcBoundary = `${payload}6304`;
  return `${crcBoundary}${crc16Ccitt(crcBoundary)}`;
}

/**
 * CRC-16 CCITT (poly 0x1021, init 0xFFFF) checksum as 4 uppercase hex chars.
 */
export function khqrCrc16(input: string): string {
  return crc16Ccitt(input);
}

/**
 * Validate the trailing CRC-16 CCITT checksum of a KHQR payload.
 * Expects the EMVCo form `...6304<4 hex>`; comparison is case-insensitive.
 */
export function validateKhqrCrc(qrString: string): boolean {
  if (typeof qrString !== 'string' || qrString.length < 8 || !/6304[0-9A-Fa-f]{4}$/.test(qrString)) {
    return false;
  }
  return crc16Ccitt(qrString.slice(0, -4)) === qrString.slice(-4).toUpperCase();
}

/** Decoded, human-oriented summary of a KHQR payload (see `inspectKhqrPayload`). */
export interface KhqrPayloadInspection {
  /** Structure parsed cleanly AND the CRC checksum matches. */
  valid: boolean;
  crcValid: boolean;
  /** `true` for point-of-initiation `11` (static), `false` for `12` (dynamic). */
  isStatic: boolean;
  currency: 'USD' | 'KHR' | undefined;
  /** Raw tag-54 amount string — present only on dynamic payloads. */
  amount?: string;
  merchantName?: string;
  merchantCity?: string;
  merchantRef?: string;
  bakongId?: string;
}

function decodeTlvTemplate(payload: string): Map<string, string> | undefined {
  const tags = new Map<string, string>();
  let index = 0;
  while (index < payload.length) {
    if (index + 4 > payload.length) return undefined;
    const tag = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    if (!Number.isInteger(length) || length < 0) return undefined;
    const valueStart = index + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) return undefined;
    tags.set(tag, payload.slice(valueStart, valueEnd));
    index = valueEnd;
  }
  return tags;
}

const CURRENCY_CODES: Record<string, 'USD' | 'KHR'> = { '840': 'USD', '116': 'KHR' };

/**
 * Decode and self-check a KHQR payload entirely offline: TLV structure,
 * CRC-16 checksum, and the fields merchants typically eyeball before printing
 * (static/dynamic, amount, currency, merchant name/city, reference).
 *
 * Returns `undefined` when the payload is structurally malformed. A payload
 * with a bad checksum still returns an inspection with `valid: false`.
 */
export function inspectKhqrPayload(qrString: string): KhqrPayloadInspection | undefined {
  if (typeof qrString !== 'string' || qrString.length < 12) return undefined;

  // The checksum travels as tag "63" (length 04); exclude it from field parsing.
  const body = /6304[0-9A-Fa-f]{4}$/.test(qrString) ? qrString.slice(0, -8) : qrString;
  const crcValid = validateKhqrCrc(qrString);

  const rootTags = decodeTlvTemplate(body);
  if (!rootTags) return undefined;

  const poi = rootTags.get('01');
  if (poi !== undefined && poi !== '11' && poi !== '12') return undefined;

  const accountTemplate = rootTags.get('30') ? decodeTlvTemplate(rootTags.get('30') as string) : undefined;
  const additionalData = rootTags.get('62') ? decodeTlvTemplate(rootTags.get('62') as string) : undefined;

  return {
    valid: crcValid,
    crcValid,
    isStatic: poi !== '12',
    currency: CURRENCY_CODES[rootTags.get('53') ?? ''],
    ...(rootTags.has('54') ? { amount: rootTags.get('54') } : {}),
    merchantName: rootTags.get('59'),
    merchantCity: rootTags.get('60'),
    merchantRef: additionalData?.get('01'),
    bakongId: accountTemplate?.get('00'),
  };
}
