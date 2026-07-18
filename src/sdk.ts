/**
 * Top-level SDK facade — wires the three decoupled modules together.
 *
 * This is the ONLY place that imports Module 1 (`src/server/`), Module 2
 * (`src/client-handler/`), and Module 3 (`src/test/`). The modules themselves
 * remain independently deployable and never import each other.
 *
 * Merchant usage (the "under 5 lines" promise):
 *
 *   import { sdk } from 'aba-payway-ts';
 *
 *   // 1. Server: initiate
 *   const session = await sdk.initiate(
 *     { transactionId: 'order-123', amount: 10, paymentOption: 'abapay_khqr_deeplink' },
 *     { merchantId, apiKey, environment: 'sandbox' },
 *   );
 *
 *   // 2. Client: render (SDK auto-detects deeplink/qr/url/html)
 *   await sdk.handle(session, { target: '#payway-container' });
 *
 *   // 3. Test: zero-code suite
 *   const report = await sdk.runTestSuite();
 *   console.log(report.success ? 'All passed' : 'Failures detected');
 */

import { server, normalizePaywayResponse } from './server/index.js';
import { client } from './client-handler/index.js';
import {
  runTestSuite,
  formatTestReport,
  startMockPaywayServer,
  stopMockPaywayServer,
  getMockPaywayUrl,
} from './test/index.js';
import type { PayWayConfig } from './client.js';
import type {
  TransactionSession,
  InitiateTransactionPayload,
  HandleResponseOptions,
  HandleResponseResult,
  ResponseType,
  TestSuiteReport,
} from './schema.js';

/**
 * The top-level SDK namespace. This is the primary entry point for merchants.
 *
 * It exposes `initiate`, `handle`, `test`, and `runTestSuite` — the four
 * functions required for a complete purchase flow with zero boilerplate.
 */
export const sdk = {
  /**
   * Server-side module namespace (Module 1).
   * Exposed for merchants who want direct access to the initiator.
   */
  server: {
    /**
     * Initiate a PayWay purchase transaction.
     * @param payload - Merchant-friendly purchase parameters.
     * @param config  - PayWay credentials and environment.
     * @returns A standardized `TransactionSession` object.
     */
    initiateTransaction(
      payload: InitiateTransactionPayload,
      config: PayWayConfig,
    ): Promise<TransactionSession> {
      return server.initiateTransaction(payload, config);
    },

    /**
     * Simulate a purchase without hitting the real PayWay API.
     * @param responseType - Which mock response type to generate.
     * @param payload      - Optional transaction details.
     * @returns A mock `TransactionSession` object.
     */
    test(
      responseType: ResponseType = 'qr_string',
      payload?: Partial<InitiateTransactionPayload>,
    ): TransactionSession {
      return server.test(responseType, payload);
    },
  },

  /**
   * Client-side module namespace (Module 2).
   * Exposed for merchants who want direct access to the response handler.
   */
  client: {
    /**
     * Handle a PayWay response. Auto-detects the response type and performs
     * the correct UX action — no merchant logic required.
     * @param session  - The `TransactionSession` from the server module.
     * @param options  - Optional rendering/redirect options.
     * @returns A `HandleResponseResult` describing the action taken.
     */
    handleResponse(
      session: TransactionSession,
      options?: HandleResponseOptions,
    ): Promise<HandleResponseResult> {
      return client.handleResponse(session, options);
    },
  },

  /**
   * Initiate a PayWay purchase transaction (Server module).
   *
   * Convenience alias for `sdk.server.initiateTransaction()`.
   *
   * @param payload - Merchant-friendly purchase parameters.
   * @param config  - PayWay credentials and environment.
   * @returns A standardized `TransactionSession` object.
   */
  initiate(
    payload: InitiateTransactionPayload,
    config: PayWayConfig,
  ): Promise<TransactionSession> {
    return server.initiateTransaction(payload, config);
  },

  /**
   * Handle a PayWay response (Client module). Auto-detects the response
   * type and performs the correct UX action — no merchant logic required.
   *
   * @param session  - The `TransactionSession` from `sdk.initiate()`.
   * @param options  - Optional rendering/redirect options.
   * @returns A `HandleResponseResult` describing the action taken.
   */
  handle(
    session: TransactionSession,
    options?: HandleResponseOptions,
  ): Promise<HandleResponseResult> {
    return client.handleResponse(session, options);
  },

  /**
   * Simulate a purchase without hitting the real PayWay API (Server module).
   * Generates a mock `TransactionSession` for any of the 5 response types.
   *
   * @param responseType - Which mock response type to generate.
   * @param payload      - Optional transaction details.
   * @returns A mock `TransactionSession` object.
   */
  test(
    responseType: ResponseType = 'qr_string',
    payload?: Partial<InitiateTransactionPayload>,
  ): TransactionSession {
    return server.test(responseType, payload);
  },

  /**
   * Run the zero-code test suite (Test module). Wires Module 1 and Module 2
   * into Module 3's harness and runs all 5 response-type scenarios.
   *
   * The suite spins up a real HTTP mock PayWay server, points the real
   * `server.initiateTransaction()` at it via `baseUrl`, and drives four of
   * the five response types through the full Module 1 pipeline (HTTP →
   * PayWay client → normalise → contract). The `html` case bypasses the
   * PayWay HTTP client (which only decodes JSON) and feeds a raw HTML body
   * directly to `normalizePaywayResponse` — still exercising Module 1's
   * normalisation code.
   *
   * @returns A `TestSuiteReport` with per-case pass/fail results.
   */
  async runTestSuite(): Promise<TestSuiteReport> {
    const mockServer = await startMockPaywayServer(0);
    const mockUrl = getMockPaywayUrl(mockServer);

    const mockConfig: PayWayConfig = {
      merchantId: 'mock-merchant',
      apiKey: 'mock-api-key',
      environment: 'sandbox',
      baseUrl: mockUrl,
    };

    try {
      return await runTestSuite({
        // Module 1: use the real initiator for all types except `html`,
        // which the underlying PayWay client can't decode.
        initiate: async (payload, config) => {
          const cfg = config as { responseType?: ResponseType } | undefined;
          const type = cfg?.responseType;

          if (type === 'html') {
            const res = await fetch(`${mockUrl}/mock/html`);
            if (!res.ok) {
              throw new Error(`Mock /mock/html returned ${res.status}`);
            }
            const html = await res.text();
            const sessionId = `tx_${Date.now().toString(36)}_${payload.transactionId}`;
            return normalizePaywayResponse(html, sessionId, payload.lifetime);
          }

          // Map the requested responseType to a `payment_option` value the
          // mock server understands. The mock uses `tran_id` as the router,
          // so `payment_option` mostly just needs to be non-empty for the
          // deeplink case (the SDK forwards it verbatim).
          const paymentOption =
            type === 'deeplink' ? 'abapay_khqr_deeplink' : (payload.paymentOption ?? 'abapay_khqr');

          return server.initiateTransaction(
            { ...payload, paymentOption },
            mockConfig,
          );
        },
        // Module 2: the real client handler.
        handle: (session, options) =>
          client.handleResponse(session, options as HandleResponseOptions),
      });
    } finally {
      await stopMockPaywayServer(mockServer);
    }
  },

  /**
   * Convenience: run the test suite and print a formatted report to the
   * console. Returns the report for programmatic inspection.
   */
  async runTestSuiteAndPrint(): Promise<TestSuiteReport> {
    const report = await this.runTestSuite();
    console.log(formatTestReport(report));
    return report;
  },
};

export type Sdk = typeof sdk;