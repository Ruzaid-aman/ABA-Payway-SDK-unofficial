import type { TemplateBundle } from './types.js';

/**
 * Next.js App Router scaffolds (audit S02 + review 2026-10-01) — same trust
 * model and field contract as the Express templates: server-owned order
 * values, real `verifyCallbackDetailed` verification, guide-parity callback
 * fields (payment_status_code / payment_status / payment_amount /
 * payment_currency), finite-amount + exact-currency gating, fail-closed on
 * every mismatch, artifact projection instead of the raw session.
 *
 * NON-PRODUCTION STATE, clearly labeled: the shared order-store module keeps
 * its maps in memory (lost on restart, not shared across instances). Replace
 * it with the database-backed pattern from docs/guides/11-callbacks-and-
 * webhooks.md ("Production Version") or examples/first-payment before
 * deploying — the routes need no other change.
 */

const orderStoreModule = `/**
 * Server-owned order + delivery state shared by the checkout and callback
 * routes.
 *
 * ⚠️ NON-PRODUCTION DEMO STATE — NOT DURABLE. In-memory Maps lose every
 * order and delivery record on process restart, and two instances do NOT
 * share them (a duplicate callback can hit the other instance and be
 * re-accepted). Before deploying, replace this module with the database
 * pattern from docs/guides/11-callbacks-and-webhooks.md ("Production
 * Version: Durable Acceptance Before Acknowledgement" — schema included)
 * or examples/first-payment. The routes below need no other change: swap
 * this module for a database adapter with the same three exports.
 *
 * NOTE on Next.js: dev-mode module reloads reset module state — another
 * reason this module must become a database before real use.
 */

/** Demo catalog — replace with your real pricing source. Clients pick an
 * item; they NEVER set a price. */
export const CATALOG = {
  'demo-item': { amount: 3.0, currency: 'USD' },
} as const;

export interface StoredOrder {
  orderId: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: 'created' | 'paid' | 'declined' | 'needs_review' | \`unaccepted (\${string})\`;
}

/** Keyed by PayWay tran_id. Expected amount/currency live ONLY here. */
export const orders = new Map<string, StoredOrder>();

const seenDeliveries = new Map<string, string>();

/**
 * Delivery deduplication — PROCESS-LOCAL ONLY (see the durability warning
 * above). Returns true when this caller is the first to record deliveryId;
 * false for a replay within the same process. A database UNIQUE constraint
 * on delivery_id provides the real, restart- and instance-safe guarantee.
 */
export function claimDelivery(deliveryId: string): boolean {
  if (seenDeliveries.has(deliveryId)) return false;
  seenDeliveries.set(deliveryId, new Date().toISOString());
  return true;
}
`;

const checkoutRoute = `import { NextResponse } from 'next/server';
import { sdk } from 'aba-payway-ts';
import { CATALOG, orders } from '../order-store';

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { sku?: string };
  const sku = typeof body.sku === 'string' ? body.sku : 'demo-item';
  const product = CATALOG[sku];
  if (!product) {
    return NextResponse.json({ error: 'unknown item' }, { status: 400 });
  }

  // A unique attempt per create: never reuse a tran_id. The gateway caps
  // tran_id at 20 characters — keep the generated id short.
  const orderId = \`o\${Date.now().toString(36)}\${Math.random().toString(36).slice(2, 6)}\`;
  const transactionId = \`pay\${orderId}\`;

  try {
    const session = await sdk.initiate(
      {
        transactionId,
        amount: product.amount,
        currency: product.currency,
        paymentOption: 'abapay_khqr_deeplink',
      },
      {
        merchantId: process.env.PAYWAY_MERCHANT_ID ?? '',
        apiKey: process.env.PAYWAY_API_KEY ?? '',
        environment: process.env.PAYWAY_ENV === 'production' ? 'production' : 'sandbox',
      },
    );

    // Record what we EXPECT before showing anything to the customer.
    orders.set(transactionId, {
      orderId,
      transactionId,
      amount: product.amount,
      currency: product.currency,
      status: 'created',
    });

    // Artifact projection only — the session (and its raw response) stays
    // on the server. Creation is NOT payment.
    return NextResponse.json(
      {
        orderId,
        transactionId,
        paymentArtifact: session.responsePayload,
        responseType: session.responseType,
        expiresAt: session.expiresAt,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // The create outcome may be UNKNOWN on a network error — check the
    // transaction by id before creating a replacement attempt.
    return NextResponse.json(
      { error: 'payment creation failed', transactionId, detail: message },
      { status: 502 },
    );
  }
}
`;

const callbackRoute = `import { NextResponse } from 'next/server';
import { verifyCallbackDetailed } from 'aba-payway-ts';
import { claimDelivery, orders } from '../order-store';

function fulfillOrder(order: { orderId: string; transactionId: string }): void {
  // TODO(merchant): the ONLY place that fulfills — runs at most once per
  // order. Keep heavy work in a durable job/outbox (guide's Production
  // Version), not inline in the request.
  console.log('Order fulfilled:', order.orderId, order.transactionId);
}

// Field contract matches docs/guides/11-callbacks-and-webhooks.md
// ("Production Version"): payment_status_code (number; 0 = APPROVED),
// payment_status (string; PRE-AUTH shares code 0 with APPROVED),
// payment_amount, payment_currency. Amounts in the body are CLAIMS —
// truth lives in the stored order.
export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get('x-payway-hmac-sha512') ?? '';
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  // 1. Authenticate the delivery. An invalid signature fulfills nothing.
  const verification = verifyCallbackDetailed(body, signature, process.env.PAYWAY_API_KEY ?? '');
  if (!verification.valid) {
    console.warn('PayWay callback rejected: invalid signature');
    return NextResponse.json({ ok: false, reason: 'signature verification failed' }, { status: 401 });
  }

  // 2. Accept the delivery exactly once BEFORE any fulfillment decision
  //    (process-local; see the durability warning in order-store).
  const transactionId = typeof body.tran_id === 'string' ? body.tran_id : '';
  const statusCode = Number(body.payment_status_code);
  // Fallback delivery id uses the STATUS STRING: PRE-AUTH shares code 0
  // with APPROVED, so the bare code would collide and let one suppress
  // the other.
  const statusText = String(body.payment_status ?? '');
  const deliveryId = \`\${transactionId}:\${statusText || statusCode}\`;
  if (!claimDelivery(deliveryId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 3. Require APPROVED (code 0); the string separates PRE-AUTH, which
  //    shares code 0. Non-approved deliveries are recorded, never fulfilled.
  if (statusCode !== 0 || statusText === 'PRE-AUTH') {
    const order = orders.get(transactionId);
    if (order) order.status = statusCode === 3 ? 'declined' : \`unaccepted (\${statusCode})\`;
    return NextResponse.json({ ok: true, fulfilled: false });
  }

  // 4. Bind the approval to a known order — a verified callback for an
  //    unknown transaction must not create state.
  const order = orders.get(transactionId);
  if (!order) {
    console.warn('APPROVED callback for unknown transaction:', transactionId);
    return NextResponse.json({ ok: false, reason: 'unknown transaction' }, { status: 202 });
  }

  // 5. Require a finite amount and an EXACT currency match against the
  //    STORED order — a missing amount is a schema violation, not a match
  //    (fail closed), and any mismatch parks the order for a human.
  const paidAmount = Number(body.payment_amount);
  const paidCurrency = String(body.payment_currency ?? '');
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - order.amount) > 1e-9 || paidCurrency !== order.currency) {
    order.status = 'needs_review';
    console.error('Amount/currency invalid or mismatched — order parked', {
      transactionId,
      expected: order.amount,
      claimed: body.payment_amount,
    });
    return NextResponse.json({ ok: false, reason: 'amount/currency mismatch' }, { status: 202 });
  }

  // 6. Fulfill once, then acknowledge — ACK only AFTER the state change is
  //    recorded (durable form: guide's Production Version).
  if (order.status === 'paid') {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  order.status = 'paid';
  setImmediate(() => fulfillOrder(order));
  return NextResponse.json({ ok: true, fulfilled: true });
}
`;

export const NEXT_APP_TEMPLATE: TemplateBundle = {
  framework: 'next-app',
  files: [
    { path: 'app/api/payment/order-store.ts', content: orderStoreModule },
    { path: 'app/api/payment/checkout/route.ts', content: checkoutRoute },
    { path: 'app/api/payment/callback/route.ts', content: callbackRoute },
  ],
};
