import type {
  CofPaymentParams,
  GetTokenDetailsParams,
  LinkAccountParams,
  LinkCardParams,
  PayWayConfig,
  RemoveTokenParams,
  RenewTokenParams,
  RequestCallOptions,
} from '../client.js';
import { generateHmac } from '../auth.js';
import { BASE_URLS, ENDPOINTS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';
import type { components } from '../types.js';
import type { LinkCardResponse } from '../domain-types.js';
import {
  encodeBase64IfNeeded,
  escapeHtmlAttribute,
  filterParams,
  formatAmount,
  formatRequestTime,
  validateCurrency,
  validatePositiveAmount,
  validatePublicHttpsUrl,
  validateRequestIdOrCtid,
  validateTokenFlag,
  validateAmountFloor,
  validateTransactionId,
  warnAdvisory,
} from '../utils.js';

/**
 * Rendering options for {@link CredentialsOnFileDomain.getLinkCardFormHtml}.
 *
 * Deliberately narrower than `CheckoutFormOptions`: there is no `popupMode`
 * because the AbaPayway popup plugin (`checkout2-0.js`, target
 * `aba_webservice`) is documented for the purchase endpoint only — the
 * link-card flow is a full-page hosted form the customer completes in the
 * same tab (or an iframe the merchant hosts).
 */
export interface LinkCardFormOptions {
  /** `id` attribute of the `<form>` element. Default `'aba_link_card_request'`. */
  formId?: string;
  /**
   * Submit the form as soon as the page loads, navigating the same tab to
   * the gateway's hosted card-entry form. Default `false`.
   */
  autoSubmit?: boolean;
  /** Label of the submit button. Default `'Link your card'`. */
  submitLabel?: string;
  /** Render the form without a submit button (for pages that provide their own controls). */
  omitSubmitButton?: boolean;
}

/**
 * §16-verified live hash order — shared by linkCard() and getLinkCardFormHtml().
 * Exported (audit D3) so the hash-order-hint drift-guard test can pin the
 * client.ts hint against the order actually signed.
 */
export const LINK_CARD_HMAC_FIELDS = [
  'merchant_id',
  'request_time',
  'ctid',
  'callback_url',
  'request_id',
  'token_flag',
  'frequency',
  'amount',
  'currency',
  'continue_success_url',
];

const DEFAULT_LINK_CARD_FORM_ID = 'aba_link_card_request';

export interface CredentialsOnFileDomain {
  linkAccount: (
    params: LinkAccountParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['LinkAccountResponse']>;
  linkCard: (
    params: LinkCardParams,
    callOptions?: RequestCallOptions,
  ) => Promise<LinkCardResponse>;
  /**
   * Build a complete link-card HTML document (local-only, no network call).
   *
   * `link-card` rejects JSON bodies outright (SANDBOX-FINDINGS §9a) and always
   * answers with the gateway's hosted card-entry page — a plain browser form
   * POST is exactly the `application/x-www-form-urlencoded` wire format this
   * endpoint requires. The hidden fields and HMAC hash are byte-identical to
   * `linkCard()`; submitting the form navigates the customer to the hosted
   * Visa/Mastercard/JCB/UPI form, and the resulting token (`pwt`) is
   * delivered to the `callbackUrl` supplied with the request.
   *
   * @param params  - Same parameters as `linkCard()` (a public-HTTPS
   *   `callbackUrl` is strongly recommended — it is the only way the token
   *   reaches the merchant).
   * @param options - Form rendering options.
   * @returns A standalone HTML document containing the signed form.
   * @throws `PayWayConfigError` on the same validation rules as `linkCard()`,
   *   an unsafe `formId`, or when the domain was constructed without a
   *   merchant id / API key to sign with.
   * @example
   * ```ts
   * const html = payway.credentialsOnFile.getLinkCardFormHtml({
   *   requestId: 'link67890',
   *   ctid: 'customerabc123',
   *   tokenFlag: 'CITI_FLEX',
   *   callbackUrl: 'https://mywebsite.com/payway/link-callback',
   * });
   * res.type('html').send(html); // browser lands on the hosted card form
   * ```
   */
  getLinkCardFormHtml: (params: LinkCardParams, options?: LinkCardFormOptions) => string;
  payment: (
    params: CofPaymentParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['CofPaymentResponse']>;
  renewToken: (
    params: RenewTokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RenewTokenResponse']>;
  getTokenDetails: (
    params: GetTokenDetailsParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['GetTokenDetailsResponse']>;
  removeToken: (
    params: RemoveTokenParams,
    callOptions?: RequestCallOptions,
  ) => Promise<components['schemas']['RemoveTokenResponse']>;
}

/**
 * Live-documented hash orders, sandbox-verified 2026-08-31 via
 * scripts/sandbox-probe-token-trio.ts (SANDBOX-FINDINGS §16). The gateway
 * tightened CoF hash validation: the §9a-era SDK orders now return
 * "01 Wrong Hash" while these orders pass the hash layer.
 */

export function createCredentialsOnFileDomain(
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
  resolvedBaseUrl?: string,
): CredentialsOnFileDomain {
  /**
   * Legacy TD-03 escape hatch: the trio is allowed by default since the
   * live-docs compositions were verified (§16); setting the flag explicitly
   * to `false` re-blocks.
   */
  const requireVerifiedTokenOps = (): void => {
    if (config.allowUnverifiedTokenOperations === false) {
      throw new PayWayConfigError(
        'renewToken/getTokenDetails/removeToken are blocked because allowUnverifiedTokenOperations is explicitly false. ' +
          'The live-documented HMAC compositions were sandbox-verified 2026-08-31 (SANDBOX-FINDINGS §16) — remove the flag to allow them.',
      );
    }
  };

  /**
   * Shared link-card validation + wire payload. Used by `linkCard()` (the
   * HTTP path) and `getLinkCardFormHtml()` (the browser-form path) so the
   * two stay byte-identical — same rule enforcement, same hash. Mirrors
   * checkout's `buildPurchasePayload`.
   */
  function buildLinkCardPayload(params: LinkCardParams): Record<string, unknown> {
    if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
      throw new PayWayConfigError('requestId is required and must be a non-empty string');
    }
    validateRequestIdOrCtid(params.requestId, 'requestId');
    // Live docs (link-card-19336819e0) mark ctid and token_flag REQUIRED.
    if (typeof params.ctid !== 'string' || params.ctid.trim().length === 0) {
      throw new PayWayConfigError('ctid is required for linkCard (live docs; 5–24 alphanumeric chars)');
    }
    validateRequestIdOrCtid(params.ctid, 'ctid');
    if (typeof params.tokenFlag !== 'string' || params.tokenFlag.trim().length === 0) {
      throw new PayWayConfigError('tokenFlag is required for linkCard (live docs; CITI_FLEX | CITO_FLEX)');
    }
    validateTokenFlag(params.tokenFlag, 'linking');
    if (!['CITI_FLEX', 'CITO_FLEX'].includes(params.tokenFlag)) {
      warnAdvisory(
        config,
        `tokenFlag "${params.tokenFlag}" is outside the live-documented link-card set (CITI_FLEX, CITO_FLEX) — verify the merchant profile enables it`,
      );
    }
    if (params.returnUrl !== undefined || params.returnDeeplink !== undefined) {
      warnAdvisory(
        config,
        'linkCard returnUrl/returnDeeplink are no longer sent: they are not part of the live-documented link-card request and would break the hash (use continueSuccessUrl for the hosted form Done target)',
      );
    }

    if (params.callbackUrl) {
      validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
        allowPrivateHosts: config.allowPrivateCallbackHosts === true,
      });
    }

    if (params.frequency === undefined) {
      warnAdvisory(
        config,
        'link-card frequency is live-documented as required for Link Card (1W|1M|2M); card linking may fail without it',
      );
    }

    const body: Record<string, unknown> = {
      ...filterParams({
        request_id: params.requestId,
        ctid: params.ctid,
        token_flag: params.tokenFlag,
        frequency: params.frequency,
        continue_success_url: params.continueSuccessUrl ? encodeBase64IfNeeded(params.continueSuccessUrl) : undefined,
        callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
        currency: params.currency ?? 'USD',
        // request() injects its own request_time when absent; the form builder
        // has no such pass, so always stamp it here for both paths.
        request_time: params.requestTime ?? formatRequestTime(),
      }),
    };
    // Sign locally when credentials are on the config (form builder always,
    // client path redundantly — request() recomputes the identical hash);
    // bare-config domain-unit tests reach request() unsigned, as before.
    if (config.merchantId) body.merchant_id = config.merchantId;
    if (typeof config.apiKey === 'string' && config.apiKey.length > 0) {
      body.hash = generateHmac(body, LINK_CARD_HMAC_FIELDS, config.apiKey);
    }
    return body;
  }

  return {
    linkAccount: (params: LinkAccountParams, callOptions?: RequestCallOptions) => {
      if (typeof params.requestId !== 'string' || params.requestId.trim().length === 0) {
        throw new PayWayConfigError('requestId is required and must be a non-empty string');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      // Live docs (link-account-19336820e0) mark ctid, token_flag, and
      // currency as REQUIRED — enforced here for JS callers too.
      if (typeof params.ctid !== 'string' || params.ctid.trim().length === 0) {
        throw new PayWayConfigError('ctid is required for linkAccount (live docs; 5–24 alphanumeric chars)');
      }
      validateRequestIdOrCtid(params.ctid, 'ctid');
      if (typeof params.tokenFlag !== 'string' || params.tokenFlag.trim().length === 0) {
        throw new PayWayConfigError('tokenFlag is required for linkAccount (live docs; CITI_FLEX | CITO_FLEX)');
      }
      validateTokenFlag(params.tokenFlag, 'linking');
      if (!['CITI_FLEX', 'CITO_FLEX'].includes(params.tokenFlag)) {
        warnAdvisory(
          config,
          `tokenFlag "${params.tokenFlag}" is outside the live-documented link-account set (CITI_FLEX, CITO_FLEX); sandbox additionally accepted CITO_FIX/CITR_FLEX — verify the merchant profile enables it`,
        );
      }

      if (params.currency === undefined) {
        throw new PayWayConfigError('currency is required for linkAccount (live docs)');
      }
      validateCurrency(params.currency);

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
      }

      return request<components['schemas']['LinkAccountResponse']>(
        ENDPOINTS.linkAccount,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          return_deeplink: params.returnDeeplink ? encodeBase64IfNeeded(params.returnDeeplink) : undefined,
          token_flag: params.tokenFlag,
          currency: params.currency,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          request_time: params.requestTime,
        }),
        // §16-verified live order (merchant_id first).
        [
          'merchant_id',
          'request_time',
          'ctid',
          'return_deeplink',
          'callback_url',
          'request_id',
          'token_flag',
          'currency',
        ],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    linkCard: (params: LinkCardParams, callOptions?: RequestCallOptions) => {
      const payload = buildLinkCardPayload(params);
      return request<LinkCardResponse>(
        ENDPOINTS.linkCard,
        payload,
        LINK_CARD_HMAC_FIELDS,
        'request_time',
        'application/x-www-form-urlencoded',
        undefined,
        undefined,
        callOptions,
      );
    },

    getLinkCardFormHtml: (params: LinkCardParams, options: LinkCardFormOptions = {}): string => {
      const {
        formId = DEFAULT_LINK_CARD_FORM_ID,
        autoSubmit = false,
        submitLabel = 'Link your card',
        omitSubmitButton = false,
      } = options;

      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(formId)) {
        throw new PayWayConfigError(
          `formId must match /^[A-Za-z][A-Za-z0-9_-]*$/, received: ${JSON.stringify(formId)}`,
        );
      }
      if (!config.merchantId || !config.apiKey) {
        throw new PayWayConfigError(
          'getLinkCardFormHtml requires merchantId and apiKey — the form embeds merchant_id and a signed hash',
        );
      }

      const payload = buildLinkCardPayload(params);
      const env = config.environment || 'sandbox';
      const baseUrl = resolvedBaseUrl ?? BASE_URLS[env] ?? BASE_URLS.sandbox;
      const actionUrl = `${baseUrl}${ENDPOINTS.linkCard}`;
      const hiddenInputs = Object.entries(payload)
        .map(
          ([key, value]) =>
            `<input type="hidden" name="${escapeHtmlAttribute(key)}" value="${escapeHtmlAttribute(String(value))}"/>`,
        )
        .join('\n      ');

      const button = omitSubmitButton
        ? ''
        : `\n      <button type="submit" id="${formId}-submit">${escapeHtmlAttribute(submitLabel)}</button>`;
      const scripts = autoSubmit ? `\n    <script>document.getElementById('${formId}').submit();</script>` : '';

      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Link your card — ABA PayWay</title>
  </head>
  <body>
    <form method="POST" action="${escapeHtmlAttribute(actionUrl)}" id="${formId}">
      ${hiddenInputs}${button}
    </form>${scripts}
  </body>
</html>
`;
    },

    payment: (params: CofPaymentParams, callOptions?: RequestCallOptions) => {
      if (params.requestId !== undefined && typeof params.requestId === 'string' && params.requestId.trim().length > 0) {
        validateRequestIdOrCtid(params.requestId, 'requestId');
      }
      if (params.ctid !== undefined) {
        validateRequestIdOrCtid(params.ctid, 'ctid');
      }
      if (params.tokenFlag !== undefined) {
        validateTokenFlag(params.tokenFlag, 'charging');
      }

      validateTransactionId(params.transactionId);
      validatePositiveAmount(params.amount, params.currency || 'USD');
      validateCurrency(params.currency);
      validateAmountFloor(config, params.amount, params.currency || 'USD', 'payment-credential');

      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required for Cof payments');
      }

      if (params.callbackUrl) {
        validatePublicHttpsUrl(params.callbackUrl, 'callbackUrl', {
          allowPrivateHosts: config.allowPrivateCallbackHosts === true,
        });
      }

      return request<components['schemas']['CofPaymentResponse']>(
        ENDPOINTS.payment,
        // §16-verified: request_id is NOT sent (absent from the live doc; the
        // binding layer accepted bodies without it).
        filterParams({
          tran_id: params.transactionId,
          amount: formatAmount(params.amount, params.currency || 'USD'),
          currency: params.currency || 'USD',
          ctid: params.ctid,
          pwt: params.paymentToken,
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          phone: params.phone,
          purchase_type: params.purchaseType,
          callback_url: params.callbackUrl ? encodeBase64IfNeeded(params.callbackUrl) : undefined,
          custom_fields: params.customFields !== undefined ? encodeBase64IfNeeded(params.customFields) : undefined,
          return_params: params.returnParams,
          payout: params.payout !== undefined ? encodeBase64IfNeeded(params.payout) : undefined,
          token_flag: params.tokenFlag,
          shipping_fee: params.shippingFee,
          items: params.items !== undefined ? encodeBase64IfNeeded(params.items) : undefined,
          request_time: params.requestTime,
        }),
        // §16-verified live order.
        [
          'request_time',
          'merchant_id',
          'tran_id',
          'amount',
          'currency',
          'items',
          'ctid',
          'pwt',
          'first_name',
          'last_name',
          'email',
          'phone',
          'purchase_type',
          'callback_url',
          'custom_fields',
          'return_params',
          'payout',
          'token_flag',
          'shipping_fee',
        ],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    renewToken: (params: RenewTokenParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required');
      }
      validateRequestIdOrCtid(params.requestId, 'requestId');
      validateRequestIdOrCtid(params.ctid, 'ctid');

      return request<components['schemas']['RenewTokenResponse']>(
        ENDPOINTS.renewToken,
        filterParams({
          request_id: params.requestId,
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        // §16-verified live order (ctid leads).
        ['ctid', 'request_time', 'pwt', 'merchant_id', 'request_id'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    getTokenDetails: (params: GetTokenDetailsParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      validateRequestIdOrCtid(params.requestId, 'requestId');

      return request<components['schemas']['GetTokenDetailsResponse']>(
        ENDPOINTS.getTokenDetails,
        // §16-verified: ONLY request_id (+ auto merchant_id/request_time) —
        // no ctid, no pwt.
        filterParams({
          request_id: params.requestId,
          request_time: params.requestTime,
        }),
        ['merchant_id', 'request_time', 'request_id'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },

    removeToken: (params: RemoveTokenParams, callOptions?: RequestCallOptions) => {
      requireVerifiedTokenOps();
      if (typeof params.paymentToken !== 'string' || params.paymentToken.trim().length === 0) {
        throw new PayWayConfigError('paymentToken is required');
      }
      validateRequestIdOrCtid(params.ctid, 'ctid');

      return request<components['schemas']['RemoveTokenResponse']>(
        ENDPOINTS.removeToken,
        // §16-verified: ctid + pwt only (+ auto merchant_id/request_time) —
        // no request_id.
        filterParams({
          ctid: params.ctid,
          pwt: params.paymentToken,
          request_time: params.requestTime,
        }),
        ['merchant_id', 'ctid', 'request_time', 'pwt'],
        'request_time',
        undefined,
        undefined,
        undefined,
        callOptions,
      );
    },
  };
}
