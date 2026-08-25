import { generateHmac } from '../auth.js';
import type { CreateTransactionParams, GetTransactionListParams, PayWayConfig } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayAPIError, PollingAbortedError } from '../errors.js';
import type { components, PollTransactionOptions, PollTransactionResult } from '../types.js';
import {
  encodeBase64IfNeeded,
  filterParams,
  formatAmount,
  formatRequestTime,
  validateCurrency,
  validateLifetime,
  validatePositiveAmount,
  validateRefundAmount,
  validateTransactionId,
} from '../utils.js';

export interface CheckoutDomain {
  createTransaction: (params: CreateTransactionParams) => Record<string, unknown> & { hash: string };
  purchase: (
    params: CreateTransactionParams,
  ) => Promise<components['schemas']['PurchaseQrResponse'] | components['schemas']['ErrorStatus']>;
  checkTransaction: (
    transactionId: string,
    requestTime?: string,
  ) => Promise<components['schemas']['CheckTransactionResponse']>;
  closeTransaction: (
    transactionId: string,
    requestTime?: string,
  ) => Promise<components['schemas']['CloseTransactionResponse']>;
  getTransactionDetail: (
    transactionId: string,
    requestTime?: string,
  ) => Promise<components['schemas']['TransactionDetailResponse']>;
  getTransactionList: (params: GetTransactionListParams) => Promise<components['schemas']['TransactionListResponse']>;
  /**
   * Refund a completed transaction.
   * @param transactionId - The original purchase transaction ID.
   * @param amount - The refund amount. Must be ≥ 0.01 for USD, ≥ 1 for KHR.
   * @param currency - The original transaction currency. Defaults to 'USD'.
   *   Providing the correct currency enables client-side minimum-amount
   *   validation (PayWay returns PTL04 if refund_amount < 0.01 USD).
   */
  refund: (
    transactionId: string,
    amount: number,
    currency?: 'USD' | 'KHR',
  ) => Promise<components['schemas']['RefundResponse']>;
  getExchangeRate: (requestTime?: string) => Promise<components['schemas']['ExchangeRateResponse']>;

  /**
   * Poll transaction status at regular intervals using an AsyncIterator.
   *
   * Yields a `PollTransactionResult` on each poll. Stops when:
   * - A terminal status is reached (APPROVED, DECLINED, CANCELLED, REFUNDED), OR
   * - `maxDurationMs` elapses (default 10 minutes), OR
   * - `maxConsecutiveErrors` consecutive poll failures occur (default 3).
   *
   * @param transactionId - The transaction ID to poll.
   * @param options - Polling configuration (interval, timeout, error tolerance).
   * @yields PollTransactionResult on each poll.
   * @throws PollingAbortedError when polling is stopped by timeout or too many errors.
   * @example
   * ```ts
   * for await (const result of payway.checkout.pollTransactionStatus('TX-001')) {
   *   console.log(`Poll #${result.attempt}: ${result.paymentStatus}`);
   *   if (result.isTerminal) break;
   * }
   * ```
   */
  pollTransactionStatus: (
    transactionId: string,
    options?: PollTransactionOptions,
  ) => AsyncGenerator<PollTransactionResult, void, undefined>;
}

function isCheckTransactionResponse(value: unknown): value is components['schemas']['CheckTransactionResponse'] {
  if (!value || typeof value !== 'object') return false;
  const status = (value as { status?: unknown }).status;
  return !!status && typeof status === 'object';
}

export function createCheckoutDomain(
  config: PayWayConfig & { merchantId: string; apiKey: string },
  request: <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName?: 'req_time' | 'request_time',
    contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ) => Promise<TResponse>,
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: 'application/json' | 'application/x-www-form-urlencoded' },
  ) => Promise<TResponse>,
): CheckoutDomain {
  function buildPurchasePayload(params: CreateTransactionParams): Record<string, unknown> & { hash: string } {
    validateTransactionId(params.transactionId);
    validatePositiveAmount(params.amount, params.currency || 'USD');
    validateCurrency(params.currency);
    validateLifetime(params.lifetime);

    const time = formatRequestTime();
    const payload: Record<string, unknown> = filterParams({
      tran_id: params.transactionId,
      amount: formatAmount(params.amount, params.currency || 'USD'),
      firstname: params.firstname,
      lastname: params.lastname,
      email: params.email,
      phone: params.phone,
      type: params.type || 'purchase',
      payment_option: params.paymentOption,
      items: params.items ? encodeBase64IfNeeded(params.items) : undefined,
      shipping: params.shipping !== undefined ? formatAmount(params.shipping, params.currency || 'USD') : undefined,
      currency: params.currency || 'USD',
      return_url: params.returnUrl ? encodeBase64IfNeeded(params.returnUrl) : undefined,
      cancel_url: params.cancelUrl ? encodeBase64IfNeeded(params.cancelUrl) : undefined,
      skip_success_page: params.skipSuccessPage,
      continue_success_url: params.continueSuccessUrl ? encodeBase64IfNeeded(params.continueSuccessUrl) : undefined,
      return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
      custom_fields: params.customFields ? encodeBase64IfNeeded(params.customFields) : undefined,
      return_params: params.returnParams ? encodeBase64IfNeeded(params.returnParams) : undefined,
      view_type: params.viewType,
      payment_gate: params.paymentGate,
      payout: params.payout ? encodeBase64IfNeeded(params.payout) : undefined,
      additional_params: params.additionalParams ? encodeBase64IfNeeded(params.additionalParams) : undefined,
      lifetime: params.lifetime,
      google_pay_token: params.googlePayToken,
      req_time: time,
      merchant_id: config.merchantId,
    });

    const fields = [
      'req_time',
      'merchant_id',
      'tran_id',
      'amount',
      'items',
      'shipping',
      'firstname',
      'lastname',
      'email',
      'phone',
      'type',
      'payment_option',
      'return_url',
      'cancel_url',
      'continue_success_url',
      'return_deeplink',
      'currency',
      'custom_fields',
      'return_params',
      'payout',
      'lifetime',
      'additional_params',
      'google_pay_token',
      'skip_success_page',
    ];

    const hash = generateHmac(payload, fields, config.apiKey);
    return { ...payload, hash };
  }

  return {
    createTransaction: (params: CreateTransactionParams): Record<string, unknown> & { hash: string } => {
      return buildPurchasePayload(params);
    },

    purchase: (params: CreateTransactionParams) => {
      const payload = buildPurchasePayload(params);
      const fields = [
        'req_time',
        'merchant_id',
        'tran_id',
        'amount',
        'items',
        'shipping',
        'firstname',
        'lastname',
        'email',
        'phone',
        'type',
        'payment_option',
        'return_url',
        'cancel_url',
        'continue_success_url',
        'return_deeplink',
        'currency',
        'custom_fields',
        'return_params',
        'payout',
        'lifetime',
        'additional_params',
        'google_pay_token',
        'skip_success_page',
      ];
      return request<components['schemas']['PurchaseQrResponse'] | components['schemas']['ErrorStatus']>(
        ENDPOINTS.purchase,
        payload,
        fields,
        'req_time',
        'application/json',
      );
    },

    /**
     * Check an existing transaction.
     * @rateLimit 600 requests per second.
     */
    checkTransaction: (transactionId: string, requestTime?: string) => {
      return request<components['schemas']['CheckTransactionResponse']>(
        ENDPOINTS.checkTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    closeTransaction: (transactionId: string, requestTime?: string) => {
      return request<components['schemas']['CloseTransactionResponse']>(
        ENDPOINTS.closeTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    /**
     * Get detailed transaction information.
     * @rateLimit 10 requests per minute. This PayWay limit cannot be increased.
     */
    getTransactionDetail: (transactionId: string, requestTime?: string) => {
      return request<components['schemas']['TransactionDetailResponse']>(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
      );
    },

    /**
     * List transactions that match the supplied filters.
     * @rateLimit 50 requests per minute.
     */
    getTransactionList: (params: GetTransactionListParams) => {
      return request<components['schemas']['TransactionListResponse']>(
        ENDPOINTS.getTransactionList,
        filterParams({
          from_date: params.fromDate,
          to_date: params.toDate,
          from_amount: params.fromAmount,
          to_amount: params.toAmount,
          status: params.status,
          page: params.page,
          pagination: params.pagination,
          req_time: params.requestTime,
        }),
        ['req_time', 'merchant_id', 'from_date', 'to_date', 'from_amount', 'to_amount', 'status', 'page', 'pagination'],
        'req_time',
      );
    },

    /**
     * Refund a completed transaction.
     * @rateLimit 500 requests per second.
     *
     * Validates the refund amount client-side before making the API call.
     * PayWay rejects refund_amount < 0.01 USD with HTTP 400 / PTL04
     * ("Parameter validation required — refund_amount must be ≥ 0.01").
     */
    refund: (transactionId: string, amount: number, currency: 'USD' | 'KHR' = 'USD') => {
      validateTransactionId(transactionId);
      validateRefundAmount(amount, currency);

      return requestWithMerchantAuth<components['schemas']['RefundResponse']>(ENDPOINTS.refund, {
        tran_id: transactionId,
        refund_amount: amount,
      });
    },

    getExchangeRate: (requestTime?: string) => {
      return request<components['schemas']['ExchangeRateResponse']>(
        ENDPOINTS.getExchangeRate,
        filterParams({ req_time: requestTime }),
        ['req_time', 'merchant_id'],
      );
    },

    /**
     * Poll transaction status at regular intervals using an AsyncIterator.
     *
     * Yields a `PollTransactionResult` on each poll. Stops when:
      * - A terminal status is reached (APPROVED, DECLINED, CANCELLED, REFUNDED), OR
      * - `maxDurationMs` elapses (default 10 minutes — matching QR lifetime), OR
      * - `maxConsecutiveErrors` consecutive poll failures occur (default 3).
      *
      * Sandbox note: a freshly-created transaction may not be visible to
      * check-transaction for a few seconds (HTTP 200 with `status.code 6`
      * "tran_id not found"). The poller recognizes this grace period and
      * yields `paymentStatus: 'NOT_FOUND'` without counting it as an error,
      * so a legitimate purchase flow is never aborted by propagation delay.
      * If the ID never appears, polling ends via the max-duration abort.
     *
     * @example
     * ```ts
     * for await (const result of payway.checkout.pollTransactionStatus('TX-001')) {
     *   console.log(`Poll #${result.attempt}: ${result.paymentStatus}`);
     *   if (result.isTerminal) break;
     * }
     * ```
     */
    pollTransactionStatus: async function* (
      transactionId: string,
      options?: PollTransactionOptions,
    ): AsyncGenerator<PollTransactionResult, void, undefined> {
      const {
        intervalMs = 5_000,
        maxDurationMs = 600_000, // 10 minutes (QR lifetime)
        maxConsecutiveErrors = 3,
      } = options ?? {};

      const TERMINAL_STATUSES: readonly string[] = ['APPROVED', 'DECLINED', 'CANCELLED', 'REFUNDED'];
      const startTime = Date.now();
      let attempt = 0;
      let consecutiveErrors = 0;
      let lastStatus: string | undefined;

      while (true) {
        // Check wall-clock timeout BEFORE making the next request
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxDurationMs) {
          throw new PollingAbortedError({
            transactionId,
            reason: 'max_duration_exceeded',
            lastStatus,
            totalAttempts: attempt,
            message: `Polling exceeded max duration of ${maxDurationMs}ms after ${attempt} attempts`,
          });
        }

        attempt++;

        try {
          const start = Date.now();
          const result = await request<components['schemas']['CheckTransactionResponse']>(
            ENDPOINTS.checkTransaction,
            filterParams({ tran_id: transactionId }),
            ['req_time', 'merchant_id', 'tran_id'],
          );
          const durationMs = Date.now() - start;

          // Extract payment status — consistent with scripts/qr-payment-test.ts pattern
          const data = (result as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
          const paymentStatus =
            (data?.payment_status as string) ?? ((result as Record<string, unknown>)?.status as string) ?? 'UNKNOWN';
          const statusStr = typeof paymentStatus === 'string' ? paymentStatus : String(paymentStatus);
          const isTerminal = TERMINAL_STATUSES.includes(statusStr.toUpperCase());

          consecutiveErrors = 0; // Reset on success
          lastStatus = statusStr;

          yield {
            transactionId,
            attempt,
            response: result,
            paymentStatus: statusStr,
            isTerminal,
            durationMs,
            timestamp: new Date().toISOString(),
          };

          // Stop if terminal — iterator completes naturally
          if (isTerminal) return;
        } catch (error: unknown) {
          const isTranIdNotFound = error instanceof PayWayAPIError && error.paywayCode === '6';

          if (isTranIdNotFound) {
            lastStatus = 'NOT_FOUND';
            const rawBody = isCheckTransactionResponse(error.rawBody) ? error.rawBody : undefined;
            yield {
              transactionId,
              attempt,
              response:
                rawBody ??
                ({
                  status: {
                    code: '6',
                    message: error instanceof Error ? error.message : 'tran_id not found',
                  },
                } as components['schemas']['CheckTransactionResponse']),
              paymentStatus: 'NOT_FOUND',
              isTerminal: false,
              durationMs: 0,
              timestamp: new Date().toISOString(),
            };

            const remainingNotFoundMs = maxDurationMs - (Date.now() - startTime);
            if (remainingNotFoundMs <= 0) {
              throw new PollingAbortedError({
                transactionId,
                reason: 'max_duration_exceeded',
                lastStatus,
                totalAttempts: attempt,
              });
            }
            await new Promise<void>((resolve) =>
              setTimeout(resolve, Math.min(intervalMs, remainingNotFoundMs)),
            );
            continue;
          }

          consecutiveErrors++;

          // Yield error result FIRST so caller can observe the failing attempt before abort
          yield {
            transactionId,
            attempt,
            response: {
              status: {
                code: String(consecutiveErrors),
                message: error instanceof Error ? error.message : String(error),
              },
            },
            paymentStatus: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
            isTerminal: false,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          };

          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new PollingAbortedError({
              transactionId,
              reason: 'max_consecutive_errors',
              lastStatus,
              totalAttempts: attempt,
              message: `Polling aborted after ${consecutiveErrors} consecutive errors (last: ${error instanceof Error ? error.message : String(error)})`,
            });
          }
        }

        // Wait before next poll — respect remaining time
        const remainingMs = maxDurationMs - (Date.now() - startTime);
        if (remainingMs <= 0) {
          throw new PollingAbortedError({
            transactionId,
            reason: 'max_duration_exceeded',
            lastStatus,
            totalAttempts: attempt,
          });
        }
        const sleepMs = Math.min(intervalMs, remainingMs);
        await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
      }
    },
  };
}
