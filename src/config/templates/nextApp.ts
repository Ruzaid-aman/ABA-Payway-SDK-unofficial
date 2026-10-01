import type { TemplateBundle } from './types.js';

/**
 * Next.js App Router scaffolds (audit S02) — same trust model as the Express
 * templates: server-owned order values via the shared store module, real
 * `verifyCallbackDetailed` verification, durable + idempotent delivery
 * acceptance, fail-closed on any mismatch, artifact projection instead of
 * the raw session. The in-memory stores are demo stand-ins for a real
 * database (see examples/first-payment for the durable pattern).
 */

const orderStoreModule = `/**
 * Server-owned order + delivery state shared by the checkout and callback
 * routes (demo: in-memory Maps — use your database in a real app; see
 * examples/first-payment for the full durable pattern).
 *
 * NOTE on Next.js: dev-mode module reloads reset module state. In a real
 * app this state lives in your database, not in module scope.
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
  status: 'created' | 'paid' | 'declined' | 'amount-mismatch' | \`unaccepted (\${string})\`;
}

/** Keyed by PayWay tran_id. Expected amount/currency live ONLY here. */
export const orders = new Map<string, StoredOrder>();

const acceptedDeliveries = new Map<string, string>();

/**
 * Durable delivery inbox, single-process form: JS runs the handler on one
 * thread, so check-then-set is atomic here. Multi-instance deployments must
 * back this with a database unique constraint on deliveryId instead.
 * Returns true when this caller owns the delivery (first acceptance);
 * false for a replay.
 */
export function claimDelivery(deliveryId: string): boolean {
  if (acceptedDeliveries.has(deliveryId)) return false;
  acceptedDeliveries.set(deliveryId, new Date().toISOString());
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
  // TODO(merchant): the ONLY place that fulfills — runs once per order.
  // Keep heavy work in a durable job queue, not inline in the request.
  console.log('Order fulfilled:', order.orderId, order.transactionId);
}

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get('x-payway-hmac-sha512') ?? '';
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  // 1. Authenticate the delivery. An invalid signature fulfills nothing.
  const verification = verifyCallbackDetailed(body, signature, process.env.PAYWAY_API_KEY ?? '');
  if (!verification.valid) {
    console.warn('PayWay callback rejected: invalid signature');
    return NextResponse.json({ ok: false, reason: 'signature verification failed' }, { status: 401 });
  }

  // 2. Bind the delivery to a known order — a verified callback for an
  //    unknown transaction must not create state.
  const transactionId = typeof body.tran_id === 'string' ? body.tran_id : '';
  const order = orders.get(transactionId);
  if (!order) {
    console.warn('PayWay callback for unknown transaction:', transactionId);
    return NextResponse.json({ ok: false, reason: 'unknown transaction' }, { status: 202 });
  }

  // 3. Accept the delivery exactly once BEFORE any fulfillment decision.
  const deliveryId = \`\${transactionId}:\${String(body.status ?? '')}\`;
  if (!claimDelivery(deliveryId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 4. Verify the payment itself: status '0' = APPROVED on the purchase
  //    pushback; anything else updates the order and fulfills nothing.
  const status = String(body.status ?? '');
  if (status !== '0') {
    order.status = status === '3' ? 'declined' : \`unaccepted (\${status})\`;
    return NextResponse.json({ ok: true, fulfilled: false });
  }

  // 5. Cross-check the paid amount against the STORED order — a mismatch
  //    parks the order unfulfilled.
  const paidAmount = Number(body.payway_amount);
  if (Number.isFinite(paidAmount) && Math.abs(paidAmount - order.amount) > 1e-9) {
    order.status = 'amount-mismatch';
    console.error('Amount mismatch for', transactionId, '— order kept unfulfilled');
    return NextResponse.json({ ok: false, reason: 'amount mismatch' }, { status: 202 });
  }

  // 6. Fulfill once, then acknowledge — ACK only AFTER durable acceptance.
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
