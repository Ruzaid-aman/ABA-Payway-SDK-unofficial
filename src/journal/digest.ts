/**
 * Transaction Journal — digest builders (audit-results/transaction-data-audit/
 * REPORT.md §14).
 *
 * Bodies are reduced BEFORE they reach the journal file:
 * - `digest` mode (default): allow-listed transactional fields only — no PII,
 *   no secrets, no blobs, no base64 payloads.
 * - `full` mode: the whole body through `sanitizeForLog` (hash/pwt/api keys/
 *   tokens masked) with known ciphertext placeholders and a hard size cap.
 *
 * Redaction at write is mandatory in both modes: request bodies carry the
 * HMAC `hash`, and the debug-log sanitizer is the only redaction layer the
 * SDK otherwise has (the audit confirmed hooks and `--json` output are
 * unsanitized).
 */

import { sanitizeForLog } from '../utils.js';
import type { JournalMode } from './types.js';

const STRING_CAP = 200;
const FULL_BODY_CAP = 16_000;
const FULL_PART_VALUE_CAP = 400;

/**
 * Non-secret, non-PII request fields worth journaling. Deliberately excludes
 * credentials/blobs (`hash`, `merchant_auth`, `google_pay_token` — the last
 * two additionally masked by sanitizeForLog in full mode) and personal data
 * (firstname/lastname/email/phone).
 */
const REQUEST_DIGEST_FIELDS: ReadonlySet<string> = new Set([
  'merchant_id',
  'req_time',
  'request_time',
  'tran_id',
  'amount',
  'total_amount',
  'original_amount',
  'refund_amount',
  'discount_amount',
  'payment_amount',
  'currency',
  'payment_currency',
  'lifetime',
  'payment_option',
  'payment_gate',
  'request_id',
  'ctid',
  'token_flag',
  'frequency',
  'merchant_ref',
  'merchant_refno',
  'order_ref',
  'return_url',
  'callback_url',
  'template',
]);

const RESPONSE_TOP_FIELDS: ReadonlySet<string> = new Set([
  'code',
  'message',
  'description',
  'tran_id',
  'checkout_qr_url',
  'abapay_deeplink',
  'url',
  'pushback_url',
  'hosted_checkout',
  'content_type',
  'trace_id',
  'page',
  'pagination',
  'merchant_ref',
]);

const STATUS_SCALARS: ReadonlySet<string> = new Set(['code', 'message', 'tran_id', 'trace']);

const RESPONSE_DATA_SCALARS: ReadonlySet<string> = new Set([
  'payment_status',
  'payment_status_code',
  'total_amount',
  'original_amount',
  'refund_amount',
  'discount_amount',
  'payment_amount',
  'payment_currency',
  'currency',
  'apv',
  'transaction_date',
  'transaction_id',
  'tran_id',
  'bank_ref',
  'bank_name',
  'payment_type',
  'card_source',
  'payer_account',
  'merchant_ref',
  'original_currency',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarize(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > STRING_CAP ? `${value.slice(0, STRING_CAP)}…[capped]` : value;
  }
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }
  if (isObject(value)) {
    return { type: 'object', keys: Object.keys(value).slice(0, 12) };
  }
  return value;
}

function pickScalars(source: Record<string, unknown>, fields: ReadonlySet<string>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (fields.has(key)) picked[key] = scalarize(source[key]);
  }
  return picked;
}

function cappedJson(value: unknown, cap: number): unknown {
  const json = JSON.stringify(value);
  if (json === undefined) return undefined;
  if (json.length <= cap) return value;
  return { truncated: true, originalLength: json.length, preview: json.slice(0, cap) };
}

/**
 * Best-effort parse of a serialized request body: JSON first, then
 * urlencoded (link-card family). Returns undefined for FormData (the caller
 * digests part descriptors instead) and for unparseable strings.
 */
export function parseRequestBodyPayload(bodyPayload: string | FormData): Record<string, unknown> | undefined {
  if (typeof bodyPayload !== 'string') return undefined;
  const trimmed = bodyPayload.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return isObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (trimmed.includes('=')) {
    try {
      const params = new URLSearchParams(trimmed);
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of params.entries()) parsed[key] = value;
      return Object.keys(parsed).length > 0 ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function describeMultipart(form: FormData, mode: JournalMode): unknown {
  const parts: Array<Record<string, unknown>> = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') {
      parts.push(
        mode === 'full'
          ? { name, value: String(sanitizeForLog(value)).slice(0, FULL_PART_VALUE_CAP) }
          : REQUEST_DIGEST_FIELDS.has(name)
            ? { name, value: scalarize(value) }
            : { name },
      );
      continue;
    }
    parts.push({ name, file: value.name, size: value.size, contentType: value.type });
  }
  return { multipart: parts };
}

export function buildRequestDigest(
  bodyPayload: string | FormData,
  parsedRequest: Record<string, unknown> | undefined,
  mode: JournalMode,
): unknown {
  if (bodyPayload instanceof FormData) {
    return describeMultipart(bodyPayload, mode);
  }
  if (parsedRequest === undefined) {
    return { raw_length: bodyPayload.length };
  }
  if (mode === 'full') {
    const sanitized = sanitizeForLog(parsedRequest);
    if (isObject(sanitized) && typeof sanitized.merchant_auth === 'string') {
      sanitized.merchant_auth = `[ENCRYPTED ${sanitized.merchant_auth.length} chars]`;
    }
    return cappedJson(sanitized, FULL_BODY_CAP);
  }
  const digest: Record<string, unknown> = {};
  for (const key of Object.keys(parsedRequest)) {
    if (REQUEST_DIGEST_FIELDS.has(key)) digest[key] = scalarize(parsedRequest[key]);
  }
  return digest;
}

export function buildResponseDigest(body: unknown, mode: JournalMode): unknown {
  if (body === null || body === undefined) return undefined;
  if (!isObject(body)) {
    return typeof body === 'string' ? scalarize(body) : body;
  }
  if (mode === 'full') {
    return cappedJson(sanitizeForLog(body), FULL_BODY_CAP);
  }
  const digest: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (key === 'status' && isObject(body.status)) {
      digest.status = pickScalars(body.status, STATUS_SCALARS);
      continue;
    }
    if (key === 'data' && isObject(body.data)) {
      digest.data = pickScalars(body.data, RESPONSE_DATA_SCALARS);
      continue;
    }
    if (RESPONSE_TOP_FIELDS.has(key)) {
      digest[key] = scalarize(body[key]);
    }
  }
  return digest;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * `tran_id`/`transaction_id` wherever the gateway puts it: top level, the
 * status block, or inside `data`. Tolerates the numeric tran_id typing the
 * payment-link detail response uses.
 */
export function extractTransactionIdFrom(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const status = isObject(value.status) ? value.status : undefined;
  const data = isObject(value.data) ? value.data : undefined;
  return (
    firstString(value.tran_id) ??
    firstString(value.transaction_id) ??
    firstString(status?.tran_id) ??
    firstString(value.tranId) ??
    (data ? (firstString(data.transaction_id) ?? firstString(data.tran_id)) : undefined)
  );
}

export function extractMerchantRefFrom(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const data = isObject(value.data) ? value.data : undefined;
  return (
    firstString(value.merchant_ref) ??
    firstString(value.merchant_refno) ??
    (data ? firstString(data.merchant_ref) : undefined)
  );
}

/** Gateway `status.trace` normalized to a string (schema requires string). */
export function toTraceString(traceId: unknown): string | undefined {
  if (typeof traceId === 'string' && traceId.length > 0) return traceId;
  if (typeof traceId === 'number') return String(traceId);
  return undefined;
}
