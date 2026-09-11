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
  HandleResponseResult,
  InitiateTransactionPayload,
  ResponseType,
  TestCase,
  TestResult,
  TestSuiteReport,
  TransactionSession,
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
  initiate: (payload: InitiateTransactionPayload, config?: unknown) => Promise<TransactionSession> | TransactionSession;

  /**
   * Module 2's `handleResponse` function (or a mock that processes
   * `TransactionSession` objects).
   */
  handle: (session: TransactionSession, options?: unknown) => Promise<HandleResponseResult> | HandleResponseResult;
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
    const createdPaymentLinks = new Set<string>();
    const voidedPaymentLinks = new Set<string>();
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
          '<!DOCTYPE html><html><body><h1>PayWay Hosted Checkout</h1>' + '<p>Mock html response.</p></body></html>';
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

          // Support both long-form (e2e-deeplink-*, e2e-qr_string-*, e2e-qr_image-*)
          // and short-form (e2e-dl-*, e2e-qs-*, e2e-qi-*) transaction ID prefixes.
          const knownTypes: ResponseType[] = ['deeplink', 'qr_string', 'qr_image', 'checkout_qr_url', 'url'];
          const shortForm: Record<string, ResponseType> = {
            dl: 'deeplink',
            qs: 'qr_string',
            qi: 'qr_image',
            cqr: 'checkout_qr_url',
            url: 'url',
          };
          // Use a non-greedy match so we capture only the short code (e.g. "qi")
          // and not a suffix like "qi-1f4s3i" from the timestamp-embedded tran_id.
          const matched =
            knownTypes.find((t) => tranId.startsWith(`e2e-${t}-`)) ??
            (() => {
              const suffix = tranId.match(/^e2e-([a-z]+?)-/)?.[1] ?? '';
              return shortForm[suffix] ?? null;
            })();
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
              envelope.qr_image = `http://127.0.0.1:${port}/mock/qr.png`;
              break;
            case 'checkout_qr_url':
              envelope.checkout_qr_url = `http://127.0.0.1:${port}/mock/qr/${tranId}`;
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

      // Payment-link endpoints — mirrors of the live shapes learned in the
      // 2026-09-06 docs-review campaign (SANDBOX-FINDINGS §22): numeric
      // tran_id, `expired_date: "0"` string echo when unset, `status: OPEN`,
      // empty-image `{"image":"","filename":"","size":0}`. Detail is
      // stateful within one server lifetime: it echoes the first link
      // created on this server (the encrypted merchant_auth hides which id
      // was requested) and answers code 96 for a bogus id when none exist —
      // the sandbox's observed bogus-id behavior.
      if (req.url === '/api/merchant-portal/merchant-access/payment-link/create') {
        // Drain the request (merchant_auth is opaque to the mock) and answer
        // on end.
        req.on('data', () => {});
        req.on('end', () => {
          const id = Buffer.from(`plmock-${Date.now()}`).toString('base64');
          createdPaymentLinks.add(id);
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: { code: '00', message: 'Success!' },
              tran_id: Date.now(),
              data: {
                id,
                title: 'Mock payment link',
                image: { image: '', filename: '', size: 0 },
                amount: '1.50',
                currency: 'USD',
                status: 'OPEN',
                description: 'Mock payment link from the test harness',
                payment_limit: 0,
                total_amount_org: 0,
                total_refund: 0,
                total_amount: 0,
                total_trxn: 0,
                created_at: now,
                updated_at: now,
                expired_date: '0',
                return_url: 'https://merchant.example/return',
                merchant_ref_no: `PLMOCK-${Date.now().toString(36)}`,
                outlet_id: 'MOCKOUTLETID==',
                outlet_name: 'Mock Outlet',
                payout: null,
                payment_link: `https://link-sandbox.payway.com.kh/ABAPAY${Date.now().toString(36).toUpperCase().slice(-8)}`,
              },
            }),
          );
        });
        return;
      }

      if (req.url === '/api/merchant-portal/merchant-access/payment-link/detail') {
        req.on('data', () => {});
        req.on('end', () => {
          const firstId = createdPaymentLinks.values().next().value as string | undefined;
          if (!firstId) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: { code: '96', message: 'Invalid merchant data' } }));
            return;
          }
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          // Void state is observable through detail (SANDBOX-FINDINGS §23):
          // a voided link reads status "VOIDED" — mirrors the live gateway.
          const isVoided = voidedPaymentLinks.has(firstId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: { code: '00', message: 'Success' },
              tran_id: Date.now(),
              data: {
                id: firstId,
                title: 'Mock payment link',
                image: { image: '', filename: '', size: 0 },
                amount: '1.50',
                currency: 'USD',
                status: isVoided ? 'VOIDED' : 'OPEN',
                description: 'Mock payment link from the test harness',
                payment_limit: 0,
                total_amount_org: 0,
                total_refund: 0,
                total_amount: 0,
                total_trxn: 0,
                created_at: now,
                updated_at: now,
                expired_date: '0',
                return_url: 'https://merchant.example/return',
                merchant_ref_no: 'PLMOCK-REF',
                outlet_id: 'MOCKOUTLETID==',
                outlet_name: 'Mock Outlet',
                payout: null,
                payment_link: 'https://link-sandbox.payway.com.kh/ABAPAYMOCK01',
              },
            }),
          );
        });
        return;
      }

      // Void — the undocumented endpoint's live-verified behavior
      // (SANDBOX-FINDINGS §23): void the first created link (merchant_auth
      // is opaque to the mock); a second void answers 403 PTL188; with no
      // created link at all, answer the observed bogus-id rejection (96).
      if (req.url === '/api/merchant-portal/merchant-access/payment-link/void') {
        req.on('data', () => {});
        req.on('end', () => {
          const firstId = createdPaymentLinks.values().next().value as string | undefined;
          if (!firstId) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: { code: '96', message: 'Invalid merchant data' } }));
            return;
          }
          if (voidedPaymentLinks.has(firstId)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: { code: 'PTL188', message: 'The payment link is already voided.' } }));
            return;
          }
          voidedPaymentLinks.add(firstId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: { code: '00', message: 'Success.', tran_id: `${Date.now()}`, lang: 'en', trace_id: 'mocktrace' }, tran_id: Date.now() }));
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

      // Status/reference endpoints — same shapes as the live sandbox
      // (sandbox verification dated 2026-08-25). Tran-ID conventions:
      //   • `e2e-approved-*` → APPROVED (payment_status_code 0, paid amount 5.00)
      //   • ids containing "missing" → 200-wrapped business error, status.code 6
      //   • anything else → PENDING (payment_status_code 2)
      const statusEndpoints: { match: string; respond: (tranId: string) => unknown }[] = [
        {
          match: '/payments/check-transaction-2',
          respond: (tranId) => ({
            status: { code: '00', message: 'Success', tran_id: tranId },
            data: {
              payment_status: tranId.startsWith('e2e-approved') ? 'APPROVED' : 'PENDING',
              payment_status_code: tranId.startsWith('e2e-approved') ? 0 : 2,
              original_amount: '1.00',
              payment_amount: tranId.startsWith('e2e-approved') ? '5.00' : '0',
            },
          }),
        },
        {
          match: '/payments/transaction-detail',
          respond: (tranId) => ({
            status: { code: '00', message: 'Success', tran_id: tranId },
            data: {
              payment_status: tranId.startsWith('e2e-approved') ? 'APPROVED' : 'PENDING',
              payment_status_code: tranId.startsWith('e2e-approved') ? 0 : 2,
              original_amount: '1.00',
              // Refund preflight (computeRefundableBalance, R1) needs the
              // order currency to confirm the units of original_amount.
              original_currency: 'USD',
              apv: '876776',
              transaction_operations: [],
            },
          }),
        },
        {
          match: '/payments/transaction-list-2',
          respond: () => ({
            status: { code: '00', message: 'Success!', tran_id: '1788110078' },
            page: 1,
            pagination: 40,
            data: [
              {
                transaction_id: 'e2e-list-row-1',
                payment_status: 'APPROVED',
                payment_status_code: 0,
                original_amount: '5.00',
                original_currency: 'USD',
                transaction_date: '2026-08-30 12:00:00',
              },
            ],
          }),
        },
        {
          match: '/payments/close-transaction',
          respond: (tranId) => ({ status: { code: '00', message: 'Success!', tran_id: tranId } }),
        },
        {
          match: '/exchange-rate',
          respond: () => ({
            status: { code: '00', message: 'Success!' },
            date: '',
            exchange_rates: {
              usd: { sell: '4012', buy: '3990' },
              eur: { sell: '4667.55', buy: '4466.96' },
            },
          }),
        },
      ];

      const statusEndpoint = statusEndpoints.find((e) => (req.url ?? '').includes(e.match));
      if (statusEndpoint) {
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
          if (tranId.includes('missing')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: { code: 6, message: 'tran_id not found', tran_id: tranId } }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(statusEndpoint.respond(tranId)));
        });
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
      // Use short-form transaction ID prefixes (≤ 12 chars) so they
      // pass the SDK's 20-char validateTransactionId constraint.
      const shortForm: Record<ResponseType, string> = {
        deeplink: 'dl',
        qr_string: 'qs',
        qr_image: 'qi',
        checkout_qr_url: 'cqr',
        url: 'url',
        html: 'html',
      };
      const initiated = await deps.initiate(
        {
          transactionId: `e2e-${shortForm[tc.responseType]}-${Date.now().toString(36)}`,
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
        deeplink: [
          'deeplink_redirect',
          'deeplink_opened_new_tab',
          'deeplink_redirect_same_tab',
          'deeplink_skipped_no_dom',
        ],
        qr_string: ['qr_rendered', 'qr_download_prompted'],
        qr_image: ['qr_image_rendered', 'qr_image_download_prompted', 'qr_image_skipped_no_dom'],
        checkout_qr_url: ['checkout_qr_url_rendered', 'checkout_qr_url_skipped_no_dom'],
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
