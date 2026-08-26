/**
 * Pillar D evidence probe — local-only latency benchmark.
 *
 * Spins up the SDK's built-in mock PayWay HTTP server (raw node:http Server,
 * see src/test/index.ts) and times N sequential happy-path
 * `checkout.purchase()` round-trips through the REAL client pipeline
 * (HMAC generation -> fetch -> JSON parse -> status-code gate),
 * reporting P50/P95/P99. Loopback-only; no network, no sandbox credentials.
 *
 * Run: npx tsx audit-results/four-pillars/evidence/latency-probe.ts
 */
import type { HttpServer } from 'node:http';
import { startMockPaywayServer } from '../../../src/test/index.js';
import { PayWay } from '../../../src/index.js';

const RUNS = 30;

async function main(): Promise<void> {
  const server = await startMockPaywayServer();
  const port = (server.address() as { port: number }).port;

  const payway = new PayWay({
    merchantId: 'probe-merchant',
    apiKey: 'probe-api-key-not-real',
    environment: 'sandbox',
    baseUrl: `http://127.0.0.1:${port}`,
    timeout: 5_000,
    maxRetries: 0,
  });

  const latenciesMs: number[] = [];
  let lastError = '';
  try {
    for (let i = 0; i < RUNS; i++) {
      // tran_id must satisfy the SDK's own ≤20-char validator (utils.ts validateTransactionId)
      const shortTxId = `e2e-dl-${Date.now().toString(36)}${i}`.slice(0, 20);
      const startedAt = performance.now();
      try {
        await payway.checkout.purchase({
          transactionId: shortTxId,
          amount: 1,
          currency: 'USD',
          paymentOption: 'abapay_khqr',
          returnUrl: 'https://example.com/return',
        });
        latenciesMs.push(performance.now() - startedAt);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        break;
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    latenciesMs.sort((a, b) => a - b);
    const pick = (p: number) =>
      Math.round(latenciesMs[Math.min(latenciesMs.length - 1, Math.floor((p / 100) * latenciesMs.length))]);
    console.log(
      JSON.stringify(
        {
          runs: RUNS,
          scenario: 'checkout.purchase via loopback mock (full client pipeline)',
          firstError: lastError || null,
          p50ms: pick(50),
          p95ms: pick(95),
          p99ms: pick(99),
          minMs: Math.round(latenciesMs[0]),
          maxMs: Math.round(latenciesMs[latenciesMs.length - 1]),
          meanMs: Math.round(latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('PROBE FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

