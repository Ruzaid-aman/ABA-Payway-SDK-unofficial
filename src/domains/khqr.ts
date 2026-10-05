import type { PayWayConfig, RequestCallOptions } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import {
  type KhqrCallbackReadiness,
  type KhqrCallbackValidationOptions,
  type KhqrConfigurationReadiness,
  type KhqrMerchantConfiguration,
  validateKhqrCallbackSetup,
  validateKhqrConfiguration,
} from '../khqr-config.js';
import { type GenerateOfflineQrParams, generateOfflineQR } from '../khqr-offline.js';
import type { components } from '../types.js';
import { PayWayConfigError } from '../errors.js';
import { filterParams, warnAdvisory } from '../utils.js';

/** One row of a `get-transactions-by-mc-ref` result, normalized. */
export interface MerchantRefTransaction {
  readonly transactionId?: string;
  readonly transactionDate?: string;
  readonly bankRef?: string;
  readonly apv?: string;
  readonly discountAmount?: number;
  readonly paymentStatus?: string;
  readonly paymentAmount?: number;
  readonly paymentCurrency?: string;
  readonly paymentType?: string;
  readonly payerAccount?: string;
  readonly totalAmount?: number;
  readonly originalAmount?: number;
  readonly originalCurrency?: string;
  readonly paymentStatusCode?: number;
  readonly bankName?: string;
  readonly refundAmount?: number;
  readonly merchantRef?: string;
}

/**
 * Stable result of `khqr.getTransactionsByMerchantRef()`.
 *
 * The gateway's raw envelope is NOT normalized here beyond extracting rows:
 * production captures answer `{data: [...], status: {code: "00", …}}` while
 * the doc-page models `{status: number, transactions: []}` — both are
 * tolerated (`rows` comes from whichever slot carries them) and the full raw
 * body stays on `raw` for audit. The `status.code` is stringified ("00"/0 are
 * equivalent successes).
 */
export interface TransactionsByMerchantRefResult {
  readonly merchantRef: string;
  /** Status code stringified — "00" (or 0) = success. */
  readonly statusCode?: string;
  readonly statusMessage?: string;
  readonly success: boolean;
  /** Matched transactions (≤50 — the endpoint has no pagination). */
  readonly rows: readonly MerchantRefTransaction[];
  /** The raw gateway response, unchanged. */
  readonly raw: components['schemas']['GetTransactionsByMcRefResponse'] & Record<string, unknown>;
}

type RawMcRefRow = components['schemas']['KhqrTransaction'];

function normalizeMcRefRow(row: RawMcRefRow): MerchantRefTransaction {
  return {
    transactionId: row.transaction_id,
    transactionDate: row.transaction_date,
    bankRef: row.bank_ref,
    apv: row.apv,
    discountAmount: row.discount_amount,
    paymentStatus: row.payment_status,
    paymentAmount: row.payment_amount,
    paymentCurrency: row.payment_currency,
    paymentType: row.payment_type,
    payerAccount: row.payer_account,
    totalAmount: row.total_amount,
    originalAmount: row.original_amount,
    originalCurrency: row.original_currency,
    paymentStatusCode: row.payment_status_code,
    bankName: row.bank_name,
    refundAmount: row.refund_amount,
    merchantRef: row.merchant_ref,
  };
}

/**
 * Normalize the two documented envelope variants of get-transactions-by-mc-ref.
 * Exported for tests; the domain applies it transparently.
 */
export function normalizeTransactionsByMerchantRefResponse(
  merchantRef: string,
  raw: components['schemas']['GetTransactionsByMcRefResponse'] & Record<string, unknown>,
): TransactionsByMerchantRefResult {
  const rawRows = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.transactions) ? raw.transactions : [];
  const rawStatus = raw.status;
  // Envelope variants: production {status: {code: "00", message, merchant_ref}}
  // vs doc-page {status: 0}. `data`-rows are the captured production shape.
  const statusCode =
    rawStatus && typeof rawStatus === 'object'
      ? String((rawStatus as { code?: string | number }).code ?? '')
      : rawStatus !== undefined
        ? String(rawStatus)
        : undefined;
  const statusMessage =
    rawStatus && typeof rawStatus === 'object' ? (rawStatus as { message?: string }).message : undefined;
  // Success = explicit gateway success code, OR rows present with no error
  // status at all (an envelope variant carrying data but no status object is
  // a populated lookup, not a failure — discarding real rows on a branch
  // would break reconciliation).
  const success = statusCode === '00' || statusCode === '0' || (statusCode === undefined && rawRows.length > 0);

  return {
    merchantRef,
    statusCode: statusCode || undefined,
    statusMessage,
    success,
    rows: rawRows.map(normalizeMcRefRow),
    raw,
  };
}

export interface KhqrDomain {
  generateOfflineQR: (params: GenerateOfflineQrParams) => string;
  validateConfiguration: () => KhqrConfigurationReadiness;
  validateCallbackSetup: (options?: KhqrCallbackValidationOptions) => KhqrCallbackReadiness;
  getTransactionsByMerchantRef: (
    merchantRef: string,
    requestTime?: string,
    callOptions?: RequestCallOptions,
  ) => Promise<TransactionsByMerchantRefResult>;
}

export function createKhqrDomain(
  config: PayWayConfig,
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
    fetchOptions?: { retry?: 'transient' | 'none' },
    callOptions?: RequestCallOptions,
  ) => Promise<TResponse>,
): KhqrDomain {
  const configuration: KhqrMerchantConfiguration | undefined = config.khqr;

  return {
    generateOfflineQR: (params: GenerateOfflineQrParams) => {
      return generateOfflineQR(params, configuration);
    },

    validateConfiguration: () => validateKhqrConfiguration(configuration),

    validateCallbackSetup: (options: KhqrCallbackValidationOptions = {}) =>
      validateKhqrCallbackSetup(configuration?.callback, options),

    getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string, callOptions?: RequestCallOptions) => {
      if (typeof merchantRef !== 'string' || merchantRef.trim().length === 0) {
        throw new PayWayConfigError('merchantRef is required and must be a non-empty string');
      }
      if (merchantRef.length > 20) {
        warnAdvisory(config, `merchantRef exceeds the gateway's 20-character cap; gateway may reject with error 5`);
      }

      return request<components['schemas']['GetTransactionsByMcRefResponse'] & Record<string, unknown>>(
        ENDPOINTS.getTransactionsByMerchantRef,
        filterParams({ merchant_ref: merchantRef, req_time: requestTime }),
        ['req_time', 'merchant_id', 'merchant_ref'],
        'req_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      ).then((raw) => normalizeTransactionsByMerchantRefResponse(merchantRef, raw));
    },
  };
}
