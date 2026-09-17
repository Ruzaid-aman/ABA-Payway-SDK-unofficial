import { generateHmac } from '../auth.js';
import type { CreateTransactionParams, GetTransactionListParams, PayWayConfig, RequestCallOptions } from '../client.js';
import { ENDPOINTS, PURCHASE_PAYMENT_OPTIONS } from '../constants.js';
import { PayWayAPIError, PayWayConfigError, PollingAbortedError } from '../errors.js';
import type { components } from '../types.js';
import type { PollTransactionOptions, PollTransactionResult, PurchaseHostedHtmlResult } from '../domain-types.js';
import {
  encodeBase64IfNeeded,
  escapeHtmlAttribute,
  filterParams,
  formatAmount,
  formatRequestTime,
  validateCurrency,
  validatePurchaseLifetimeMinutes,
  validatePositiveAmount,
  validatePayoutEntryShape,
  validateRefundAmount,
  validateTransactionId,
  warnAdvisory,
} from '../utils.js';

/**
 * Rendering options for {@link CheckoutDomain.getCheckoutFormHtml}.
 */
export interface CheckoutFormOptions {
  /** `id` attribute of the `<form>` element. Default `'aba_merchant_request'`. */
  formId?: string;
  /**
   * Submit the form as soon as the page loads, navigating the same tab to the
   * hosted checkout page. Default `false`.
   */
  autoSubmit?: boolean;
  /**
   * Use the official AbaPayway popup plugin (as in ABA's sample checkout): the
   * form targets the `aba_webservice` frame opened by
   * `https://checkout.payway.com.kh/plugins/checkout2-0.js` and the submit
   * button invokes `AbaPayway.checkout()`. Default `false`.
   */
  popupMode?: boolean;
  /** Label of the submit button. Default `'Pay with ABA PayWay'`. */
  submitLabel?: string;
  /** Render the form without a submit button (for pages that provide their own controls). */
  omitSubmitButton?: boolean;
}

const CHECKOUT_FORM_PLUGIN_SRC = 'https://checkout.payway.com.kh/plugins/checkout2-0.js';
const DEFAULT_FORM_ID = 'aba_merchant_request';
const POPUP_TARGET = 'aba_webservice';

/**
 * Live hash order for the purchase endpoint. `token_flag` + `frequency` are
 * the live subscription additions appended after `skip_success_page`; `ctid`
 * sits between `items` and `shipping` — the gateway signs `ctid` on the
 * subscription path even though the live docs' subscription operation omits it
 * (sandbox-verified 2026-09-05: the documented 26-field order is rejected
 * with Wrong Hash; inserting ctid after items is accepted by the hash layer,
 * pinned by probes C1/C2 with a non-empty items position). Omitted optional
 * fields hash as '' (they vanish under concatenation), so this list produces
 * the exact same HMAC as the 26-field list for plain purchases without ctid
 * (pinned by test). Shared by the local payload builder AND the network path
 * so the locally-built and sent hashes can never diverge.
 */
export const PURCHASE_HASH_FIELDS = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'items',
  'ctid',
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
  'token_flag',
  'frequency',
] as const;

export interface CheckoutDomain {
  createTransaction: (params: CreateTransactionParams) => Record<string, unknown> & { hash: string };
  /**
   * Create a purchase transaction (KHQR JSON by default).
   *
   * With `paymentGate: 0` the gateway answers HTTP 200 with the hosted
   * "PayWay - Checkout" HTML page as the response BODY — there is no
   * `checkout_qr_url` JSON field (campaign W2-1/W2-2, 2026-09-05). That
   * success used to be misclassified as `PayWayAPIError: Invalid JSON
   * response`; it now resolves to a {@link PurchaseHostedHtmlResult}
   * (the transaction IS created and PENDING). For a dedicated, typed
   * hosted-checkout call use {@link CheckoutDomain.purchaseHosted}.
   *
   * @returns The QR-style JSON (`qrString`/`qrImage`/`abapay_deeplink`),
   *   an `ErrorStatus` envelope, or — with `paymentGate: 0` — the
   *   structured hosted-page success.
   */
  purchase: (
    params: CreateTransactionParams,
    callOptions?: RequestCallOptions,
  ) => Promise<
    | components['schemas']['PurchaseQrResponse']
    | components['schemas']['ErrorStatus']
    | PurchaseHostedHtmlResult
  >;
  /**
   * Create a purchase transaction and get the HOSTED checkout page
   * (`paymentGate: 0` is set for you).
   *
   * The gateway answers with the full hosted "PayWay - Checkout" HTML page
   * as the response body (sandbox-verified 2026-09-05 for both `cards` and
   * `abapay_khqr`, with or without `viewType`). The transaction is created
   * and PENDING the moment this resolves — confirm via
   * `checkTransaction()`/`pollTransactionStatus()`; the browser outcome
   * arrives through the merchant's `returnUrl`/`returnParams` flow. This
   * mirrors the link-card HTML guard from v1.3.6, but as a SUCCESS surface
   * (the page is the deliverable, not an error).
   *
   * @throws `PayWayAPIError` if the gateway unexpectedly answers JSON
   *   instead of the hosted page (the JSON body rides on `rawBody`).
   * @example
   * ```ts
   * const page = await payway.checkout.purchaseHosted({
   *   transactionId: 'order-123',
   *   amount: 15,
   *   paymentOption: 'cards',
   *   returnUrl: 'https://mywebsite.com/payment-result',
   * });
   * res.type(page.content_type).send(page.html); // Express
   * ```
   */
  purchaseHosted: (
    params: CreateTransactionParams,
    callOptions?: RequestCallOptions,
  ) => Promise<PurchaseHostedHtmlResult>;
  /**
   * Build a complete hosted-checkout HTML document (local-only, no network call).
   *
   * The hidden fields and HMAC hash are byte-identical to `createTransaction()`;
   * the form POSTs to the gateway's purchase endpoint, which renders the hosted
   * checkout page (or returns the deeplink JSON for `abapay_khqr_deeplink`).
   *
   * @param params  - Same parameters as `createTransaction()`.
   * @param options - Form rendering options.
   * @returns A standalone HTML document containing the signed form.
   * @throws `PayWayConfigError` when `autoSubmit` and `popupMode` are combined or
   *   `formId` is not a safe HTML id.
   * @example
   * ```ts
   * const html = payway.checkout.getCheckoutFormHtml({
   *   transactionId: 'order-123',
   *   amount: 15,
   *   returnUrl: 'https://mywebsite.com/payment-result',
   * });
   * res.type('html').send(html); // Express: browser lands on the hosted page
   * ```
   */
  getCheckoutFormHtml: (params: CreateTransactionParams, options?: CheckoutFormOptions) => string;
  checkTransaction: (
    transactionId: string,
    requestTime?: string,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CheckTransactionResponse']>;
  /**
   * Close an open transaction before payment. Sandbox-verified (2026-09-05,
   * docs/internal/CLOSE-TRANSACTION-FINDINGS.md §2b/§9): enforcement is CHANNEL-dependent —
   * the KHQR/QR channel refuses closed transactions at scan time ("transaction
   * expired"), while two hosted-card sessions accepted payment AFTER a code-00
   * close. No read API ever exposes a CLOSED status (closed-unpaid keeps
   * reporting PENDING), so keep an authoritative local `closed` flag and watch
   * for late APPROVED-after-close on the checkout path.
   */
  closeTransaction: (
    transactionId: string,
    requestTime?: string,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CloseTransactionResponse']>;
  /**
   * Get full detail for one transaction (~5 s indexing lag after creation; the
   * list endpoints use the UTC+7 gateway clock). On UNPAID transactions
   * `original_currency` reports the merchant credential currency (not the
   * transaction currency), `payment_amount` is 0 and `transaction_operations`
   * is empty — parse currency/amounts only on PAID transactions. After a
   * PARTIAL refund `payment_status` reads REFUNDED (coarse flag);
   * `refund_amount` is the authoritative returned total.
   */
  getTransactionDetail: (
    transactionId: string,
    requestTime?: string,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['TransactionDetailResponse']>;
  getTransactionList: (
    params: GetTransactionListParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['TransactionListResponse']>;
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
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RefundResponse']>;
  getExchangeRate: (requestTime?: string, callOptions?: RequestCallOptions) => Promise<components['schemas']['ExchangeRateResponse']>;

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
    fetchOptions?: { retry?: 'transient' | 'none' },
    callOptions?: RequestCallOptions,
  ) => Promise<TResponse>,
  requestWithMerchantAuth: <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: {
      hmacFields?: string[];
      contentType?: 'application/json' | 'application/x-www-form-urlencoded';
      callOptions?: RequestCallOptions;
    },
  ) => Promise<TResponse>,
  resolvedBaseUrl: string,
): CheckoutDomain {
  function buildPurchasePayload(params: CreateTransactionParams): Record<string, unknown> & { hash: string } {
    validateTransactionId(params.transactionId);
    validatePositiveAmount(params.amount, params.currency || 'USD');
    validateCurrency(params.currency);
    validatePurchaseLifetimeMinutes(params.lifetime);

    // ── Advisory gateway limits (live docs; audit §5) — warn unless
    // strictValidation escalates. Required-field rules below throw. ──
    // The 43200 max is DOCUMENTED but not gateway-enforced (W1-1, 2026-09-05:
    // the sandbox accepted 43201 with code 00) — advisory only; the
    // PURCHASE_LIFETIME_MIN_MINUTES minimum above is the hard local gate.
    if (params.lifetime !== undefined && params.lifetime > 43200) {
      warnAdvisory(
        config,
        `lifetime ${params.lifetime} minutes exceeds the documented maximum of 43200 (30 days) — advisory only: the sandbox gateway accepted values above it (2026-09-05), so this is not enforced locally`,
      );
    }
    if (params.firstname !== undefined) {
      if (params.firstname.length > 100 || /\d|[^\p{L}\p{M}\s'.-]/u.test(params.firstname)) {
        warnAdvisory(config, `firstname violates the gateway rules (≤100 chars, no digits/specials) — gateway may reject with error 16`);
      }
    }
    if (params.lastname !== undefined && params.lastname.length > 100) {
      warnAdvisory(config, `lastname exceeds the gateway's 100-character cap — gateway may reject with error 17`);
    }
    if (params.email !== undefined && params.email.length > 50) {
      warnAdvisory(config, `email exceeds the gateway's 50-character cap — gateway may reject with error 19`);
    }
    if (params.phone !== undefined && params.phone.length > 20) {
      warnAdvisory(config, `phone exceeds the gateway's 20-character cap — gateway may reject with error 18`);
    }
    if (params.items !== undefined) {
      if (Array.isArray(params.items) && params.items.length > 10) {
        warnAdvisory(config, `items carries ${params.items.length} entries; the gateway accepts at most 10`);
      }
      const encoded = encodeBase64IfNeeded(params.items);
      if (encoded.length > 500) {
        warnAdvisory(config, `items exceeds the gateway's 500-character wire cap (encoded) — gateway may reject with error 13`);
      }
    }
    if (params.paymentOption !== undefined && !(PURCHASE_PAYMENT_OPTIONS as readonly string[]).includes(params.paymentOption)) {
      warnAdvisory(
        config,
        `payment_option "${params.paymentOption}" is outside the documented purchase enum (${PURCHASE_PAYMENT_OPTIONS.join(', ')})`,
      );
    }
    // Split-payout entries use the purchase-path keys {acc, amt} (NOT the
    // QR/payout-domain {account, amount}). Before W1-5 (2026-09-05) wrong-key
    // objects sailed through local validation and only failed at the gateway
    // with HTTP 403 code 35 "Payout Info is invalid." — the shape check now
    // throws locally (same validator payment-link uses). Pre-encoded strings
    // pass through unvalidated, mirroring payment-link.
    if (Array.isArray(params.payout)) {
      for (const entry of params.payout) {
        validatePayoutEntryShape(entry);
      }
    }
    // Documented conditional requirement (live purchase spec): a Google Pay
    // token is REQUIRED when the merchant manages selection for google_pay.
    if (params.paymentOption === 'google_pay' && !params.googlePayToken) {
      throw new PayWayConfigError('googlePayToken is required when paymentOption is "google_pay" (live docs)');
    }

    // Subscription/recurring registration on the purchase path (live
    // subscription-21402227e0): tokenFlag implies ctid; frequency is
    // required iff the flag is CITR_FIX. Other linking flags belong on the
    // CoF link endpoints, not here.
    if (params.tokenFlag !== undefined) {
      if (params.ctid === undefined) {
        throw new PayWayConfigError('ctid is required when tokenFlag is set (subscription registration)');
      }
      if (params.tokenFlag !== 'CITR_FIX') {
        throw new PayWayConfigError(
          `tokenFlag "${params.tokenFlag}" is not supported on the purchase path — only 'CITR_FIX' (subscription); use credentialsOnFile.linkAccount/linkCard for other flags`,
        );
      }
      if (params.frequency === undefined) {
        throw new PayWayConfigError("frequency is required when tokenFlag='CITR_FIX' (1W | 1M | 2M)");
      }
      if (params.paymentOption !== undefined && !['cards', 'abapay', 'abapay_deeplink'].includes(params.paymentOption)) {
        warnAdvisory(
          config,
          `subscription payment_option "${params.paymentOption}" is outside the documented set (cards, abapay, abapay_deeplink)`,
        );
      }
    } else if (params.frequency !== undefined) {
      throw new PayWayConfigError('frequency requires tokenFlag (subscription registration)');
    }

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
      ctid: params.ctid,
      token_flag: params.tokenFlag,
      frequency: params.frequency,
      req_time: time,
      merchant_id: config.merchantId,
    });

    const fields = [...PURCHASE_HASH_FIELDS];

    const hash = generateHmac(payload, fields, config.apiKey);
    return { ...payload, hash };
  }

  function purchaseRequest(
    params: CreateTransactionParams,
    callOptions?: RequestCallOptions,
  ): Promise<
    components['schemas']['PurchaseQrResponse'] | components['schemas']['ErrorStatus'] | PurchaseHostedHtmlResult
  > {
    const payload = buildPurchasePayload(params);
    // The injected request() re-hashes fullBody with these fields
    // (client.ts request()), so they MUST be the live 27-field order
    // (ctid after items, §17) — passing a divergent list here overwrites
    // the locally-built hash with one that omits ctid/token_flag/frequency
    // (audit D1 + §17: gateway "Wrong Hash").
    return request<
      components['schemas']['PurchaseQrResponse'] | components['schemas']['ErrorStatus'] | PurchaseHostedHtmlResult
    >(
      ENDPOINTS.purchase,
      payload,
      [...PURCHASE_HASH_FIELDS],
      'req_time',
      'application/json',
      undefined,
      // retryPolicy per-call override: 'none' forces single-attempt; an
      // explicit 'transient' re-enables retries for this mutation (the
      // transport default for purchase is single-submit — see
      // MUTATION_ENDPOINTS / F01). Omitted → the transport default.
      { retry: params.retryPolicy === 'none' ? 'none' : params.retryPolicy === 'transient' ? 'transient' : undefined },
      callOptions,
    );
  }

  return {
    createTransaction: (params: CreateTransactionParams): Record<string, unknown> & { hash: string } => {
      return buildPurchasePayload(params);
    },

    getCheckoutFormHtml: (params: CreateTransactionParams, options: CheckoutFormOptions = {}): string => {
      const {
        formId = DEFAULT_FORM_ID,
        autoSubmit = false,
        popupMode = false,
        submitLabel = 'Pay with ABA PayWay',
        omitSubmitButton = false,
      } = options;

      if (autoSubmit && popupMode) {
        throw new PayWayConfigError(
          'getCheckoutFormHtml: autoSubmit and popupMode are mutually exclusive — autoSubmit navigates the same tab, popupMode opens the AbaPayway plugin frame',
        );
      }
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(formId)) {
        throw new PayWayConfigError(
          `formId must match /^[A-Za-z][A-Za-z0-9_-]*$/, received: ${JSON.stringify(formId)}`,
        );
      }

      const payload = buildPurchasePayload(params);
      const actionUrl = `${resolvedBaseUrl}${ENDPOINTS.purchase}`;
      const hiddenInputs = Object.entries(payload)
        .map(
          ([key, value]) =>
            `<input type="hidden" name="${escapeHtmlAttribute(key)}" value="${escapeHtmlAttribute(String(value))}"/>`,
        )
        .join('\n      ');

      const targetAttr = popupMode ? ` target="${POPUP_TARGET}"` : '';
      const button = omitSubmitButton
        ? ''
        : `\n      <button type="submit" id="${formId}-submit">${escapeHtmlAttribute(submitLabel)}</button>`;

      let scripts = '';
      if (autoSubmit) {
        scripts = `\n    <script>document.getElementById('${formId}').submit();</script>`;
      } else if (popupMode) {
        scripts = [
          `\n    <script src="${CHECKOUT_FORM_PLUGIN_SRC}"></script>`,
          `<script>document.getElementById('${formId}-submit').addEventListener('click', function () { AbaPayway.checkout(); });</script>`,
        ].join('\n    ');
        if (omitSubmitButton) {
          // No default button: drop the click wiring so merchant controls can call AbaPayway.checkout() themselves.
          scripts = `\n    <script src="${CHECKOUT_FORM_PLUGIN_SRC}"></script>`;
        }
      }

      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Pay with ABA PayWay</title>
  </head>
  <body>
    <form method="POST" action="${escapeHtmlAttribute(actionUrl)}"${targetAttr} id="${formId}">
      ${hiddenInputs}${button}
    </form>${scripts}
  </body>
</html>
`;
    },

    purchase: purchaseRequest,

    purchaseHosted: async (
      params: CreateTransactionParams,
      callOptions?: RequestCallOptions,
    ): Promise<PurchaseHostedHtmlResult> => {
      const result = await purchaseRequest({ ...params, paymentGate: 0 }, callOptions);
      if (
        result &&
        typeof result === 'object' &&
        'hosted_checkout' in result &&
        (result as PurchaseHostedHtmlResult).hosted_checkout === true
      ) {
        return result as PurchaseHostedHtmlResult;
      }
      // Gate 0 normally always yields the hosted page (W2-1: verified for
      // cards AND abapay_khqr, with/without viewType) — a JSON answer here
      // means the gateway deviated; hand the body back for inspection.
      throw new PayWayAPIError(
        'purchaseHosted expected the hosted checkout HTML page (payment_gate 0) but the gateway answered JSON — inspect rawBody; the transaction may still have been created',
        { endpoint: ENDPOINTS.purchase, rawBody: result, retryable: false },
      );
    },

    /**
     * Check an existing transaction.
     * @rateLimit 600 requests per second.
     */
    checkTransaction: (transactionId: string, requestTime?: string, callOptions?: RequestCallOptions) => {
      return request<components['schemas']['CheckTransactionResponse']>(
        ENDPOINTS.checkTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
        'req_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    closeTransaction: (transactionId: string, requestTime?: string, callOptions?: RequestCallOptions) => {
      return request<components['schemas']['CloseTransactionResponse']>(
        ENDPOINTS.closeTransaction,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
        'req_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    /**
     * Get detailed transaction information.
     * @rateLimit 10 requests per minute. This PayWay limit cannot be increased.
     */
    getTransactionDetail: (transactionId: string, requestTime?: string, callOptions?: RequestCallOptions) => {
      return request<components['schemas']['TransactionDetailResponse']>(
        ENDPOINTS.getTransactionDetail,
        filterParams({ tran_id: transactionId, req_time: requestTime }),
        ['req_time', 'merchant_id', 'tran_id'],
        'req_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    /**
     * List transactions that match the supplied filters.
     *
     * Window semantics (sandbox re-verified 2026-09-05): omitting BOTH dates
     * returns the current gateway day (UTC+7 clock) — campaign W2-12's "SDK
     * no-dates → 0 rows" did not reproduce (it was list-indexing lag: the
     * same call returned 32 rows minutes later). A local/UTC-derived window
     * can still silently miss rows when the clocks disagree (§18) — build
     * windows from the gateway clock, and keep them ≤ 3 days (err 52).
     *
     * @rateLimit 50 requests per minute.
     */
    getTransactionList: (params: GetTransactionListParams, callOptions?: RequestCallOptions) => {
      // ── Advisory gateway limits (live docs, err 49-53): dates
      // "YYYY-MM-DD HH:mm:ss", range ≤ 3 days, pagination ≤ 1000, status
      // case-insensitive enum. ──
      const DATE_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      if (params.fromDate != null) {
        if (typeof params.fromDate === 'string' && !DATE_FORMAT.test(params.fromDate)) {
          warnAdvisory(config, `fromDate "${params.fromDate}" must use the format "YYYY-MM-DD HH:mm:ss" (gateway err 49)`);
        }
        if (params.toDate != null && typeof params.fromDate === 'string' && typeof params.toDate === 'string' && DATE_FORMAT.test(params.fromDate) && DATE_FORMAT.test(params.toDate)) {
          const spanDays = (Date.parse(`${params.toDate.replace(' ', 'T')}Z`) - Date.parse(`${params.fromDate.replace(' ', 'T')}Z`)) / 86_400_000;
          if (spanDays > 3) {
            warnAdvisory(config, `date range spans ${spanDays.toFixed(1)} days; the gateway allows at most 3 days (err 52)`);
          }
        }
      }
      if (params.toDate != null && typeof params.toDate === 'string' && !DATE_FORMAT.test(params.toDate)) {
        warnAdvisory(config, `toDate "${params.toDate}" must use the format "YYYY-MM-DD HH:mm:ss" (gateway err 50)`);
      }
      if (params.pagination !== undefined) {
        const n = Number.parseInt(params.pagination, 10);
        if (!Number.isNaN(n) && n > 1000) {
          warnAdvisory(config, `pagination ${n} exceeds the gateway maximum of 1000`);
        }
      }
      if (params.status != null) {
        const allowed = ['APPROVED', 'PRE-AUTH', 'REFUNDED', 'PENDING', 'DECLINED', 'DECLINDED', 'CANCELLED'];
        for (const part of String(params.status).split(',')) {
          if (!allowed.includes(part.trim().toUpperCase())) {
            warnAdvisory(config, `status "${part.trim()}" is outside the documented set (${allowed.join(', ')})`);
          }
        }
      }

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
        undefined,
        undefined,
        undefined,
        callOptions,
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
    refund: (transactionId: string, amount: number, currency: 'USD' | 'KHR' = 'USD', callOptions?: RequestCallOptions) => {
      validateTransactionId(transactionId);
      validateRefundAmount(amount, currency);

      return requestWithMerchantAuth<components['schemas']['RefundResponse']>(
        ENDPOINTS.refund,
        {
          tran_id: transactionId,
          refund_amount: amount,
        },
        { callOptions },
      );
    },

    getExchangeRate: (requestTime?: string, callOptions?: RequestCallOptions) => {
      return request<components['schemas']['ExchangeRateResponse']>(
        ENDPOINTS.getExchangeRate,
        filterParams({ req_time: requestTime }),
        ['req_time', 'merchant_id'],
        'req_time',
        undefined,
        undefined,
        undefined,
        callOptions,
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
