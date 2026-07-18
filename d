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

import { server } from './server/index.js';
import { client } from './client-handler/index.js';
import { runTestSuite, formatTestReport } from './test/index.js';
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
   * Initiate a PayWay purchase transaction (Server module).
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
   * @returns A `TestSuiteReport` with per-case pass/fail results.
   */
  async runTestSuite(): Promise<TestSuiteReport> {
    // Wire the modules together via dependency injection. The test module
    // never imports server/client directly — it receives them here.
    return runTestSuite({
      // Module 1: in test mode, use `server.test()` to generate mock sessions.
      initiate: (payload) => server.test(
        payload.paymentOption === 'abapay_khqr_deeplink' ? 'deeplink' : 'qr_string',
        payload,
      ),
      // Module 2: delegate to the real client handler.
      handle: (session, options) => client.handleResponse(session, options as HandleResponseOptions),
    });
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