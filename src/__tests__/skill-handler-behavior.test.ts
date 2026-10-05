/**
 * Skill-handler behavior harness (audit R2 + F12).
 *
 * Phrase tests cannot prove that a guide's example code actually WORKS: the
 * first-pass F04 test matched guard vocabulary while the handler read fields
 * (`status`/`amount`/`currency`) the customer-qr callback route never sends,
 * so a signed APPROVED fixture acknowledged at HTTP 200 and queued ZERO jobs.
 *
 * This harness executes the REAL code block from the skill markdown:
 *   - extract the fenced block containing the app.post callback handler,
 *   - transpile it with the repo's TypeScript (no drift-prone copy),
 *   - run it in a vm context whose collaborators are the harness stubs,
 *   - drive the handler with fixtures built by the project's OWN supported
 *     generator: skills/aba-payway-hash/scripts/mock-callback.cjs
 *     (buildCallbackBody) — the same payloads `mock-callback.cjs --url …`
 *     sends in the guide's documented self-test.
 *
 * Acceptance (second-pass audit R2): a signed supported approved fixture
 * queues exactly one job; pending, duplicate, unknown-customer and
 * wrong-money callbacks never queue.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { HandlerFn } from '../test/skill-harness-utils.js';
import { buildHandlerHarness, fixtureRequest, type OrdersCollaborator } from '../test/skill-harness-utils.js';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(currentDir, '..', '..');
// Harness fixtures come from the project's own supported generator, not a
// hand-rolled duplicate that could drift from the real payload shape.
const require = createRequire(import.meta.url);
const mockCallback = require('../../skills/aba-payway-hash/scripts/mock-callback.cjs') as {
  buildCallbackBody: (opts: Record<string, string | number>) => Record<string, unknown>;
};

function extractCustomerQrHandler(): string {
  const md = readFileSync(join(repoRoot, 'skills', 'aba-payway-customer-qr', 'SKILL.md'), 'utf8');
  // Slice the handler itself: from `app.post` up to the fallback-job marker.
  // The fenced block also contains the module-only `import`/`const payway`
  // lines and a top-level `await` fallback line — the harness supplies those
  // collaborators (payway/orders/…) instead, so only the route handler runs.
  const start = md.indexOf('app.post');
  const end = md.indexOf('// Fallback job:');
  if (start < 0 || end < 0 || end <= start) throw new Error('customer-qr SKILL.md: callback handler block not found');
  return md.slice(start, end);
}

/** Transpile the guide's handler against one harness's collaborators. */
function compileHandler(orders: OrdersCollaborator, seen?: Set<string>) {
  const harness = buildHandlerHarness({ orders, seen });
  const js = ts.transpileModule(extractCustomerQrHandler(), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  let registered: HandlerFn | undefined;
  const context = {
    ...harness.context,
    app: { post: (_route: string, fn: HandlerFn) => (registered = fn) },
  };
  vm.runInNewContext(js, context);
  if (!registered) throw new Error('customer-qr SKILL.md handler never registered a route');
  return { harness, handler: registered as HandlerFn };
}

const ordersFor = (amount: number, currency: string): OrdersCollaborator => ({
  findByCustomerRef: (ref) =>
    ref === 'cust-001' ? { expectsExactly: (a: number, c: string) => a === amount && c === currency } : null,
});

/** Build the supported-fixture body with defaults (approved, 10 USD, cust-001). */
const body = (overrides: Record<string, string | number> = {}) =>
  mockCallback.buildCallbackBody({
    'tran-id': 'tran-approved-1',
    'merchant-ref': 'cust-001',
    amount: 10,
    currency: 'USD',
    status: 'APPROVED',
    ...overrides,
  });

describe('aba-payway-customer-qr guide handler (R2: real guide code + supported fixture)', () => {
  it('queues exactly one job for a signed supported APPROVED fixture', async () => {
    const { harness, handler } = compileHandler(ordersFor(10, 'USD'));
    const res = harness.newResponse();
    await handler(fixtureRequest(body()), res);
    expect(res.sentStatus).toBe(200);
    expect(harness.jobsQueued).toBe(1);
    expect(harness.claims).toEqual([
      { tranId: 'tran-approved-1', merchantRef: 'cust-001', amount: 10, currency: 'USD' },
    ]);
  });

  it('acknowledges but never queues a PENDING callback', async () => {
    const { harness, handler } = compileHandler(ordersFor(10, 'USD'));
    const res = harness.newResponse();
    await handler(fixtureRequest(body({ 'tran-id': 'tran-pending-1', status: 'PENDING' })), res);
    expect(res.sentStatus).toBe(200);
    expect(harness.jobsQueued).toBe(0);
    expect(harness.claims).toHaveLength(0);
  });

  it('ignores a duplicate APPROVED callback (dedupe by tran_id)', async () => {
    const seen = new Set<string>();
    const first = compileHandler(ordersFor(10, 'USD'), seen);
    const res1 = first.harness.newResponse();
    await first.handler(fixtureRequest(body({ 'tran-id': 'tran-dup-1' })), res1);
    expect(first.harness.jobsQueued).toBe(1);
    // Second delivery through a fresh compile whose fulfillments set already
    // knows the tran_id — exactly what a process restart with a durable store
    // (the guide's recommendation) sees on a redelivery.
    const second = compileHandler(ordersFor(10, 'USD'), seen);
    const res2 = second.harness.newResponse();
    await second.handler(fixtureRequest(body({ 'tran-id': 'tran-dup-1' })), res2);
    expect(res2.sentStatus).toBe(200);
    expect(second.harness.jobsQueued).toBe(0);
  });

  it('never queues for an unknown customer', async () => {
    const { harness, handler } = compileHandler(ordersFor(10, 'USD'));
    const res = harness.newResponse();
    await handler(fixtureRequest(body({ 'tran-id': 'tran-ghost-1', 'merchant-ref': 'no-such-customer' })), res);
    expect(res.sentStatus).toBe(200);
    expect(harness.jobsQueued).toBe(0);
    expect(harness.claims).toHaveLength(0);
  });

  it('never queues when the original money does not match the obligation', async () => {
    const { harness, handler } = compileHandler(ordersFor(10, 'USD'));
    const res = harness.newResponse();
    await handler(fixtureRequest(body({ 'tran-id': 'tran-wrongmoney-1', amount: 99 })), res);
    expect(res.sentStatus).toBe(200);
    expect(harness.jobsQueued).toBe(0);
    expect(harness.claims).toHaveLength(0);
  });

  it('coerces string amounts from the callback (the route sends strings)', async () => {
    // buildCallbackBody formats USD amounts via toFixed(2) → string '10.00';
    // the handler must coerce before matching the numeric obligation.
    const { harness, handler } = compileHandler(ordersFor(10, 'USD'));
    await handler(fixtureRequest(body()), harness.newResponse());
    expect(harness.claims[0]?.amount).toBe(10);
  });

  it('fulfills from ORDER money, not the payer debit, when currencies differ (W5-6)', async () => {
    // 4000 KHR obligation paid as 1 USD: buildCallbackBody keys both sides to
    // one currency, so simulate the sandbox-verified cross-currency shape by
    // overriding the payer side of the supported base payload.
    const { harness, handler } = compileHandler(ordersFor(4000, 'KHR'));
    const res = harness.newResponse();
    await handler(
      fixtureRequest({
        ...body({ 'tran-id': 'tran-xrate-1', amount: 4000, currency: 'KHR' }),
        payment_amount: 1,
        payment_currency: 'USD',
      }),
      res,
    );
    expect(harness.jobsQueued).toBe(1);
    expect(harness.claims[0]).toEqual({
      tranId: 'tran-xrate-1',
      merchantRef: 'cust-001',
      amount: 4000,
      currency: 'KHR',
    });
  });

  it('rejects an invalid signature with 400 before any fulfillment (authenticity first)', async () => {
    // Compile a variant with a REJECTING verifier: the harness above stubs
    // verifyCallback true to isolate post-verification behavior; this case
    // pins that nothing downstream runs when authenticity fails.
    const rejecting = buildHandlerHarness({ orders: ordersFor(10, 'USD') });
    const js = ts.transpileModule(extractCustomerQrHandler(), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    let registered: HandlerFn | undefined;
    const context = {
      ...rejecting.context,
      payway: { verifyCallback: () => false },
      app: { post: (_r: string, fn: HandlerFn) => (registered = fn) },
    };
    vm.runInNewContext(js, context);
    const res = rejecting.newResponse();
    await (registered as HandlerFn)(fixtureRequest(body()), res);
    expect(res.sentStatus).toBe(400);
    expect(rejecting.jobsQueued).toBe(0);
    expect(rejecting.claims).toHaveLength(0);
  });
});
