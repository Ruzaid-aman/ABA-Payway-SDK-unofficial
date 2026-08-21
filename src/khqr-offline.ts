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
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatAmount(amount: number, currency: 'KHR' | 'USD'): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new PayWayConfigError('amount must be a positive finite number for a dynamic ABA KHQR payload');
  if (currency === 'KHR') {
    if (!Number.isInteger(amount)) throw new PayWayConfigError('KHR amount must be an integer');
    return String(amount);
  }
  if (Math.round(amount * 100) !== amount * 100) throw new PayWayConfigError('USD amount must have at most two decimal places');
  return amount.toFixed(2);
}

function timestamp(value: Date | number, field: 'createdAt' | 'expiresAt'): number {
  const milliseconds = value instanceof Date ? value.getTime() : value;
  if (!Number.isInteger(milliseconds) || milliseconds < 1_000_000_000_000 || milliseconds > 9_999_999_999_999) {
    throw new PayWayConfigError(`${field} must be a 13-digit epoch-millisecond timestamp`);
  }
  return milliseconds;
}

function assertMerchantRef(merchantRef: string): void {
  if (typeof merchantRef !== 'string' || merchantRef.trim().length === 0 || Buffer.byteLength(merchantRef, 'utf8') > 25) {
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

  assertMerchantRef(params.merchantRef);
  const createdAt = timestamp(params.createdAt ?? clock(), 'createdAt');
  const expiresAt = timestamp(params.expiresAt ?? createdAt + DEFAULT_EXPIRY_MILLISECONDS, 'expiresAt');
  if (expiresAt <= createdAt) throw new PayWayConfigError('expiresAt must be later than createdAt');

  const payload = [
    encodeTlv('00', '01'),
    encodeTlv('01', params.amount === undefined ? '11' : '12'),
    encodeTemplate('30', [['00', resolvedConfiguration.bakongId], ['01', resolvedConfiguration.abaMerchantId], ['02', resolvedConfiguration.acquirerName]]),
    encodeTlv('52', resolvedConfiguration.merchantCategoryCode),
    encodeTlv('53', params.currency === 'KHR' ? '116' : '840'),
    ...(params.amount === undefined ? [] : [encodeTlv('54', formatAmount(params.amount, params.currency))]),
    encodeTlv('58', 'KH'),
    encodeTlv('59', resolvedConfiguration.merchantName),
    encodeTlv('60', resolvedConfiguration.merchantCity),
    encodeTemplate('62', [['01', params.merchantRef], ['68', resolvedConfiguration.paywayData]]),
    encodeTemplate('99', [['00', String(createdAt)], ['01', String(expiresAt)]]),
  ].join('');
  const crcBoundary = `${payload}6304`;
  return `${crcBoundary}${crc16Ccitt(crcBoundary)}`;
}
