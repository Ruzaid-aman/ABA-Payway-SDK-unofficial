/**
 * Module 3 — Automated Testing Harness (The "Simulator")
 *
 * Agent Focus: QA / DevEx
 *
 * This module is independently deployable. It provides a zero-code testing
 * utility that:
 *
 *  1. Spins up a local mock server that mimics PayWay's behaviors.
 *  2. Calls the Server-Side Initiator (Module 1) — injected as a dependency.
 *  3. Feeds the mock responses to the Client Handler (Module 2) — injected as
 *     a dependency.
 *  4. Logs a pass/fail report on the UX flow.
 *
 * ISOLATION: This module does NOT import Module 1 (`src/server/`) or Module 2
 * (`src/client-handler/`) directly. It accepts them as injected dependencies
 * (configuration objects) and communicates only via the `TransactionSession`
 * contract defined in `src/schema.ts`. The top-level `sdk.runTestSuite()`
 * wires the modules together; the modules themselves remain decoupled.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import type {
  TransactionSession,
  ResponseType,
  TestCase,
  TestResult,
  TestSuiteReport,
  HandleResponseResult,
  InitiateTransactionPayload,
} from '../schema.js';

/**
 * The injected dependencies for the test harness. These are the only
 * connection to Module 1 and Module 2 — passed in, never imported.
 */
export interface TestHarnessDeps {
  /**
   * Module 1's `initiateTransaction` function (or a mock that produces
   * `TransactionSession` objects).
   */
  initiate: (
    payload: InitiateTransactionPayload,
    config?: unknown,
  ) => Promise<TransactionSession> | TransactionSession;

  /**
   * Module 2's `handleResponse` function (or a mock that processes
   * `TransactionSession` objects).
   */
  handle: (
    session: TransactionSession,
    options?: unknown,
  ) => Promise<HandleResponseResult> | HandleResponseResult;
}

/**
 * The default test cases covering all 5 response types.
 */
export const DEFAULT_TEST_CASES: TestCase[] = [
  {
    name: 'Deeplink redirect',
    responseType: 'deeplink',
    description: 'Verifies that a deeplink response triggers a native app redirect.',
  },
  {
    name: 'QR string render',
    responseType: 'qr_string',
    description: 'Verifies that a raw KHQR string is rendered into a QR code.',
  },
  {
    name: 'QR image render',
    responseType: 'qr_image',
    description: 'Verifies that a QR image URL is rendered into a target element.',
  },
  {
    name: 'Checkout URL redirect',
    responseType: 'url',
    description: 'Verifies that a checkout URL triggers a browser redirect.',
  },
  {
    name: 'HTML snippet embed',
    responseType: 'html',
    description: 'Verifies that an HTML hosted checkout page is safely embedded.',
  },
];

/**
 * Generates a mock `TransactionSession` for a given response type. This is
 * the contract variation generator that all agents agreed upon.
 */
export function generateMockSession(
  responseType: ResponseType,
  transactionId = `test-${Date.now()}`,
): TransactionSession {
  const sessionId = `tx_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const payloads: Record<ResponseType, string> = {
    deeplink: `ababank://pay?tran_id=${transactionId}&amount=10`,
    qr_string: '00020101021226360016ABA PAYWAY5204599953038405802KH5910Test Merchant6009Phnom Penh6304ABCD',
    qr_image: `https://checkout-sandbox.payway.com.kh/qr/${transactionId}.png`,
    url: `https://checkout-sandbox.payway.com.kh/pay/${transactionId}`,
    html: `<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1><p>Tran: ${transactionId}</p></body></html>`,
  };

  return {
    sessionId,
    status: 'pending',
    responseType,
    responsePayload: payloads[responseType],
    expiresAt,
    raw: { mock: true, transactionId, responseType },
  };
}

/**
 * Validates that a `TransactionSession` conforms to the contract schema.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateSessionContract(session: unknown): string | null {
  if (!session || typeof session !== 'object') {
    return 'session must be an object';
  }
  const s = session as Record<string, unknown>;

  if (typeof s.sessionId !== 'string' || !s.sessionId) {
    return 'sessionId must be a non-empty string';
  }
  if (s.status !== 'pending' && s.status !== 'completed' && s.status !== 'failed') {
    return `status must be 'pending' | 'completed' | 'failed', got: ${String(s.status)}`;
  }
  const validTypes = ['deeplink', 'qr_string', 'qr_image', 'url', 'html'];
  if (typeof s.responseType !== 'string' || !validTypes.includes(s.responseType)) {
    return `responseType must be one of ${validTypes.join(', ')}, got: ${String(s.responseType)}`;
  }
  if (typeof s.responsePayload !== 'string') {
    return 'responsePayload must be a string';
  }
  if (typeof s.expiresAt !== 'string' || Number.isNaN(Date.parse(s.expiresAt))) {
    return 'expiresAt must be a valid ISO-8601 timestamp';
  }
  return null;
}

/**
 * Starts a local mock HTTP server that mimics PayWay's purchase endpoint.
 *
 * The server inspects the incoming `tran_id` field (which the test harness
 * encodes as `e2e-<responseType>-<...>`) to decide which response envelope
 * to return, so the same endpoint can drive all four JSON-based response
 * types (deeplink, qr_string, qr_image, url) through the real Module 1 path.
 *
 * For the `html` case (which the PayWay HTTP client cannot currently decode
 * because `_executeFetch` rejects non-JSON responses), a separate
 * `/mock/html` endpoint returns raw HTML text that the test harness feeds
 * directly to `normalizePaywayResponse`.
 *
 * @param port - The port to listen on. Defaults to 0 (ephemeral).
 * @returns The running `HttpServer` instance.
 */
export function startMockPaywayServer(port = 0): Promise<HttpServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // Health check.
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // Raw-HTML endpoint used for the `html` end-to-end case.
      if (req.url === '/mock/html') {
        const html =
          '<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1>' +
          '<p>Mock html response.</p></body></html>';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // Mock purchase endpoint — mirrors PayWay's real path.
      if (req.url === '/api/payment-gateway/v1/payments/purchase') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          let tranId = '';
          try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            tranId = typeof parsed.tran_id === 'string' ? parsed.tran_id : '';
          } catch {
            // Fall through — tranId stays ''.
          }

          const knownTypes: ResponseType[] = ['deeplink', 'qr_string', 'qr_image', 'url'];
          const matched = knownTypes.find((t) => tranId.startsWith(`e2e-${t}-`));
          const responseType: ResponseType = matched ?? 'qr_string';

          const addr = server.address() as { port: number } | null;
          const port = addr?.port ?? 0;

          const envelope: Record<string, unknown> = {
            status: { code: '00', message: 'Approved' },
            tran_id: tranId || 'mock',
          };

          switch (responseType) {
            case 'deeplink':
              envelope.abapay_deeplink = `ababank://pay?tran_id=${tranId}`;
              envelope.qr_string = '00020101021226360016ABA PAYWAYMOCK0208DEEPLINK6304ABCD';
              break;
            case 'qr_string':
              envelope.qr_string = '00020101021226360016ABA PAYWAYMOCK0208QRSTRING6304ABCD';
              break;
            case 'qr_image':
              envelope.checkout_qr_url = `http://127.0.0.1:${port}/mock/qr.png`;
              break;
            case 'url':
              envelope.url = `http://127.0.0.1:${port}/mock/checkout/${tranId}`;
              break;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(envelope));
        });
        return;
      }

      // Mock static assets referenced by the JSON envelopes above.
      if (req.url === '/mock/qr.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        // 1x1 transparent PNG.
        res.end(
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
            'base64',
          ),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Returns `http://127.0.0.1:<port>` for a running mock server. Throws if
 * the server has not bound to a port yet.
 */
export function getMockPaywayUrl(server: HttpServer): string {
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Mock PayWay server has no bound address');
  }
  return `http://127.0.0.1:${addr.port}`;
}

/**
 * Stops a mock HTTP server.
 */
export function stopMockPaywayServer(server: HttpServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * Runs the full test suite against the injected Module 1 and Module 2.
 *
 * @param deps   - The injected `initiate` and `handle` functions.
 * @param cases  - Optional custom test cases. Defaults to all 5 response types.
 * @returns A `TestSuiteReport` with per-case pass/fail results.
 */
export async function runTestSuite(
  deps: TestHarnessDeps,
  cases: TestCase[] = DEFAULT_TEST_CASES,
): Promise<TestSuiteReport> {
  const results: TestResult[] = [];

  for (const tc of cases) {
    const start = Date.now();
    try {
      // 1. Call the injected Module 1 initiator. In end-to-end mode this
      //    performs a real HTTP request to the mock PayWay server; in unit
      //    mode it may return a stubbed `TransactionSession`. The harness
      //    doesn't care — it only sees the contract.
      const initiated = await deps.initiate(
        {
          transactionId: `e2e-${tc.responseType}-${Date.now()}`,
          amount: 10,
          paymentOption: tc.responseType === 'deeplink' ? 'abapay_khqr_deeplink' : undefined,
        },
        { responseType: tc.responseType },
      );

      // 2. Validate the initiated session against the contract.
      const initiatedError = validateSessionContract(initiated);
      if (initiatedError) {
        throw new Error(`Module 1 contract violation: ${initiatedError}`);
      }

      // 3. Verify the initiator picked the response type the test case asked
      //    for. This catches mis-wired mock servers or broken normalisation.
      if (initiated.responseType !== tc.responseType) {
        throw new Error(
          `Module 1 produced responseType="${initiated.responseType}" but the test case expected "${tc.responseType}"`,
        );
      }

      // 4. Feed the real session to the injected Module 2 handler.
      const handled = await deps.handle(initiated, { target: undefined });

      // 5. Verify the handler succeeded.
      if (!handled.success) {
        throw new Error(`Handler returned failure: action=${handled.action}`);
      }

      // 6. Verify the handler action matches the expected response type.
      const action = handled.action;
      const expectedActions: Record<ResponseType, string[]> = {
        deeplink: ['deeplink_redirect', 'deeplink_opened_new_tab', 'deeplink_redirect_same_tab', 'deeplink_skipped_no_dom'],
        qr_string: ['qr_rendered', 'qr_download_prompted'],
        qr_image: ['qr_image_rendered', 'qr_image_download_prompted', 'qr_image_skipped_no_dom'],
        url: ['url_redirect', 'url_opened_new_tab', 'url_redirect_same_tab', 'url_redirect_skipped_no_dom'],
        html: ['html_embedded', 'html_embed_skipped_no_dom'],
      };
      if (!expectedActions[tc.responseType].includes(action)) {
        throw new Error(
          `Unexpected action for ${tc.responseType}: got "${action}", expected one of ${expectedActions[tc.responseType].join(', ')}`,
        );
      }

      const durationMs = Date.now() - start;
      results.push({
        name: tc.name,
        passed: true,
        message: `${tc.description} -> action="${action}"`,
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name: tc.name,
        passed: false,
        message: `${tc.description} -> FAILED: ${message}`,
        durationMs,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  return {
    total: results.length,
    passed,
    failed,
    results,
    success: failed === 0,
  };
}

/**
 * Formats a `TestSuiteReport` as a human-readable string for console output.
 */
export function formatTestReport(report: TestSuiteReport): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════',
    '  PayWay SDK — Test Suite Report',
    '═══════════════════════════════════════════════════════════',
    '',
  ];

  for (const r of report.results) {
    const icon = r.passed ? '✅' : '❌';
    lines.push(`  ${icon} ${r.name} (${r.durationMs}ms)`);
    lines.push(`     ${r.message}`);
    lines.push('');
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`  Total: ${report.total}  |  Passed: ${report.passed}  |  Failed: ${report.failed}`);
  lines.push(`  Result: ${report.success ? '✅ ALL PASSED' : '❌ FAILURES DETECTED'}`);
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}
