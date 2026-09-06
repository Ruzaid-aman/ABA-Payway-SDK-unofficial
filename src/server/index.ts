/**
 * Module 1 — Server-Side Core (The "Initiator")
 *
 * Agent Focus: Backend / Infrastructure
 *
 * This module is independently deployable. It handles authentication,
 * payload validation, and submission to PayWay's internal APIs, then
 * normalizes the raw PayWay response into the standardized
 * `TransactionSession` contract defined in `src/schema.ts`.
 *
 * It does NOT import Module 2 (client) or Module 3 (test). It only imports
 * the shared contract (`../schema.js`) and the existing PayWay transport
 * (`../client.js`), which is infrastructure — not another module.
 */

import type { PayWayConfig } from '../client.js';
import { PayWay } from '../client.js';
import { PayWayConfigError } from '../errors.js';
import type { InitiateTransactionPayload, ResponseType, TransactionSession } from '../schema.js';

/**
 * Normalizes a raw PayWay purchase response into a `TransactionSession`.
 *
 * PayWay responses vary by the merchant configuration, payment option, and
 * request flags. This function uses fields present in the response instead of
 * assuming a specific response shape for an option.
 *
 * This function inspects the raw response and assigns the correct
 * `responseType` discriminator so the client module knows how to render it.
 */
export function normalizePaywayResponse(raw: unknown, sessionId: string, lifetimeMinutes?: number): TransactionSession {
  // A local deadline derived from the requested lifetime. It is not proof of
  // PayWay acceptance, QR scan validity, or terminal payment status.
  const expiresAt = new Date(Date.now() + (lifetimeMinutes ?? 60) * 60 * 1000).toISOString();

  // HTML hosted checkout page.
  if (typeof raw === 'string') {
    return {
      sessionId,
      status: 'pending',
      responseType: 'html',
      responsePayload: raw,
      expiresAt,
      raw,
    };
  }

  // JSON object — inspect known fields to pick the best representation.
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;

    // ErrorStatus shape — surface as a failed session.
    if (obj.status && typeof obj.status === 'object') {
      const status = obj.status as Record<string, unknown>;
      const code = String(status.code ?? '');
      if (code !== '0' && code !== '00' && code !== '') {
        return {
          sessionId,
          status: 'failed',
          responseType: 'html',
          responsePayload: '',
          expiresAt,
          raw,
        };
      }
    }

    // Prefer deeplink, then raw qr_string, then checkout_qr_url, then qr_image, then hosted qr image url.
    let responseType: ResponseType = 'html';
    let responsePayload = '';

    if (typeof obj.abapay_deeplink === 'string' && obj.abapay_deeplink) {
      responseType = 'deeplink';
      responsePayload = obj.abapay_deeplink;
    } else if (typeof obj.qr_string === 'string' && obj.qr_string) {
      responseType = 'qr_string';
      responsePayload = obj.qr_string;
    } else if (typeof obj.checkout_qr_url === 'string' && obj.checkout_qr_url) {
      responseType = 'checkout_qr_url';
      responsePayload = obj.checkout_qr_url;
    } else if (typeof obj.qr_image === 'string' && obj.qr_image) {
      responseType = 'qr_image';
      responsePayload = obj.qr_image;
    } else if (typeof obj.qrString === 'string' && obj.qrString) {
      // generate-qr endpoint uses camelCase `qrString`.
      responseType = 'qr_string';
      responsePayload = obj.qrString;
    } else if (typeof obj.url === 'string' && obj.url) {
      responseType = 'url';
      responsePayload = obj.url;
    }

    return {
      sessionId,
      status: 'pending',
      responseType,
      responsePayload,
      expiresAt,
      raw,
    };
  }

  // Unknown shape — fail safely.
  return {
    sessionId,
    status: 'failed',
    responseType: 'html',
    responsePayload: '',
    expiresAt,
    raw,
  };
}

/**
 * Generates a unique session identifier from a transaction id + timestamp.
 */
function generateSessionId(transactionId: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `tx_${stamp}_${transactionId}_${rand}`;
}

/**
 * Server-side SDK namespace.
 *
 * @example
 * import { server } from 'aba-payway-ts';
 *
 * const session = await server.initiateTransaction(
 *   { transactionId: 'order-123', amount: 10, paymentOption: 'abapay_khqr_deeplink' },
 *   { merchantId: process.env.PAYWAY_MERCHANT_ID!, apiKey: process.env.PAYWAY_API_KEY!, environment: 'sandbox' },
 * );
 */
export const server = {
  /**
   * Initiate a PayWay purchase transaction.
   *
   * This function is importable and callable by any server function
   * (REST endpoints, GraphQL resolvers, webhook handlers). It handles
   * authentication, payload validation, and submission to PayWay's API,
   * returning a standardized `TransactionSession` for the client to process.
   *
   * @param payload - Merchant-friendly purchase parameters.
   * @param config  - PayWay credentials and environment.
   * @returns A standardized `TransactionSession` object.
   */
  async initiateTransaction(payload: InitiateTransactionPayload, config: PayWayConfig): Promise<TransactionSession> {
    if (!payload || typeof payload !== 'object') {
      throw new PayWayConfigError('payload is required');
    }
    if (!payload.transactionId) {
      throw new PayWayConfigError('payload.transactionId is required');
    }
    if (payload.amount === undefined || payload.amount === null) {
      throw new PayWayConfigError('payload.amount is required');
    }

    const payway = new PayWay(config);
    const sessionId = generateSessionId(payload.transactionId);

    const raw = await payway.checkout.purchase({
      transactionId: payload.transactionId,
      amount: payload.amount,
      currency: payload.currency,
      firstname: payload.firstname,
      lastname: payload.lastname,
      email: payload.email,
      phone: payload.phone,
      paymentOption: payload.paymentOption,
      shipping: payload.shipping,
      items: payload.items,
      returnUrl: payload.returnUrl,
      cancelUrl: payload.cancelUrl,
      viewType: payload.viewType,
      lifetime: payload.lifetime,
      retryPolicy: payload.retryPolicy ?? 'none',
    });

    return normalizePaywayResponse(raw, sessionId, payload.lifetime);
  },

  /**
   * Simulate a purchase without requiring the merchant to write fetch/axios
   * boilerplate. This generates a mock `TransactionSession` for each of the
   * 5 response types so the merchant can verify their server wiring and the
   * client rendering without hitting the real PayWay API.
   *
   * @param responseType - Which mock response type to generate. Defaults to 'qr_string'.
   * @param payload     - Optional transaction details to embed in the mock.
   * @returns A mock `TransactionSession` object.
   */
  test(
    responseType: ResponseType = 'qr_string',
    payload: Partial<InitiateTransactionPayload> = {},
  ): TransactionSession {
    const transactionId = payload.transactionId ?? `mock-${Date.now()}`;
    const sessionId = generateSessionId(transactionId);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const payloads: Record<ResponseType, string> = {
      deeplink: `ababank://pay?tran_id=${transactionId}&amount=${payload.amount ?? 10}`,
      qr_string: '00020101021226360016ABA PAYWAY5204599953038405802KH5910Test Merchant6009Phnom Penh6304ABCD',
      qr_image: `https://checkout-sandbox.payway.com.kh/qr/${transactionId}.png`,
      checkout_qr_url: `https://checkout-sandbox.payway.com.kh/qr/${transactionId}`,
      url: `https://checkout-sandbox.payway.com.kh/pay/${transactionId}`,
      html: `<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1><p>Tran: ${transactionId}</p></body></html>`,
    };

    return {
      sessionId,
      status: 'pending',
      responseType,
      responsePayload: payloads[responseType],
      expiresAt,
      raw: { mock: true, transactionId, responseType, ...payload },
    };
  },
};

export type ServerModule = typeof server;
