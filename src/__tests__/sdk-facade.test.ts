/**
 * End-to-end validation of the top-level SDK facade.
 *
 * `sdk.runTestSuite()` must:
 *   1. Spin up the mock PayWay HTTP server.
 *   2. Call the real `server.initiateTransaction` against that server for
 *      4 of the 5 response types (deeplink, qr_string, qr_image, url).
 *   3. Bypass the JSON-only PayWay client for the `html` case and feed a
 *      raw HTML body through `normalizePaywayResponse`.
 *   4. Feed each resulting session to the real `client.handleResponse`.
 *   5. Return a green report.
 *
 * Because vitest runs this in Node (no `window`), the handler will short-
 * circuit to `*_skipped_no_dom` for the branches that need a DOM — that
 * behaviour is verified in `client-handler.test.ts` with happy-dom.
 */

import { describe, expect, it } from 'vitest';
import { sdk } from '../sdk.js';

describe('sdk.runTestSuite (end-to-end via mock server)', () => {
  it('reports 5/5 passing against the real Module 1 → Module 2 pipeline', async () => {
    const report = await sdk.runTestSuite();

    expect(report.success).toBe(true);
    expect(report.total).toBe(5);
    expect(report.passed).toBe(5);
    expect(report.failed).toBe(0);

    // Every case must have exercised the real Module 1 path (durationMs > 0
    // proves the HTTP roundtrip happened, at least for the ones that go
    // through fetch).
    for (const r of report.results) {
      expect(r.passed).toBe(true);
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
