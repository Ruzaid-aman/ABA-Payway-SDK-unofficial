/**
 * ABA offline-KHQR payment notification parsing.
 *
 * The published notification shape has no documented authentication contract,
 * so parsed events are deliberately unverified. Keep the original payload for
 * audit/reconciliation and retain future ABA fields without rejecting them.
 */

export interface KhqrPaymentNotification {
  transaction_id: string;
  transaction_date: string;
  original_currency: string;
  original_amount: number;
  bank_ref: string;
  apv: string;
  payment_status_code: number;
  payment_status: string;
  payment_currency: string;
  payment_amount: number;
  payment_type: string;
  payer_account: string;
  bank_name: string;
  merchant_ref: string;
}

export interface ParsedKhqrPaymentNotification {
  readonly kind: 'khqr-offline';
  readonly schema: 'aba-khqr-payment-notification-v1';
  readonly verification: 'unverified';
  readonly notification: {
    readonly transactionId: string;
    readonly transactionDate: string;
    readonly originalCurrency: string;
    readonly originalAmount: number;
    readonly bankRef: string;
    readonly apv: string;
    readonly paymentStatusCode: number;
    readonly paymentStatus: string;
    readonly paymentCurrency: string;
    readonly paymentAmount: number;
    readonly paymentType: string;
    readonly payerAccount: string;
    readonly bankName: string;
    readonly merchantRef: string;
  };
  readonly raw: Record<string, unknown>;
  readonly unknownFields: Record<string, unknown>;
}

const STRING_FIELDS = [
  'transaction_id',
  'transaction_date',
  'original_currency',
  'bank_ref',
  'apv',
  'payment_status',
  'payment_currency',
  'payment_type',
  'payer_account',
  'bank_name',
  'merchant_ref',
] as const;

const NUMBER_FIELDS = ['original_amount', 'payment_status_code', 'payment_amount'] as const;
const PUBLISHED_FIELDS = new Set<string>([...STRING_FIELDS, ...NUMBER_FIELDS]);

function requireRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('KHQR notification payload must be an object');
  }
  return payload as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string') {
    throw new TypeError(`KHQR notification field ${field} must be a string`);
  }
  return value;
}

function requireNumber(payload: Record<string, unknown>, field: string): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`KHQR notification field ${field} must be a finite number`);
  }
  return value;
}

export function parseKhqrPaymentNotification(payload: unknown): ParsedKhqrPaymentNotification {
  const raw = requireRecord(payload);
  for (const field of STRING_FIELDS) requireString(raw, field);
  for (const field of NUMBER_FIELDS) requireNumber(raw, field);

  const unknownFields = Object.fromEntries(Object.entries(raw).filter(([field]) => !PUBLISHED_FIELDS.has(field)));

  return {
    kind: 'khqr-offline',
    schema: 'aba-khqr-payment-notification-v1',
    verification: 'unverified',
    notification: {
      transactionId: requireString(raw, 'transaction_id'),
      transactionDate: requireString(raw, 'transaction_date'),
      originalCurrency: requireString(raw, 'original_currency'),
      originalAmount: requireNumber(raw, 'original_amount'),
      bankRef: requireString(raw, 'bank_ref'),
      apv: requireString(raw, 'apv'),
      paymentStatusCode: requireNumber(raw, 'payment_status_code'),
      paymentStatus: requireString(raw, 'payment_status'),
      paymentCurrency: requireString(raw, 'payment_currency'),
      paymentAmount: requireNumber(raw, 'payment_amount'),
      paymentType: requireString(raw, 'payment_type'),
      payerAccount: requireString(raw, 'payer_account'),
      bankName: requireString(raw, 'bank_name'),
      merchantRef: requireString(raw, 'merchant_ref'),
    },
    raw,
    unknownFields,
  };
}
