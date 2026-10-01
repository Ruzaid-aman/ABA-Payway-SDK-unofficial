import type { TemplateBundle } from './types.js';

/**
 * Framework scaffolds (audit S02): the generated routes teach the reference
 * application's trust model, not a TODO skeleton —
 *   - expected amount/currency live ONLY in a server-side order store; the
 *     browser never sets pricing and the raw gateway session never reaches
 *     the client (only an intentional artifact projection does);
 *   - callbacks are verified with the REAL exported API
 *     (`verifyCallbackDetailed` — there is no `sdk.auth` namespace);
 *   - delivery acceptance is durable and idempotent, and fulfillment happens
 *     once, from the stored order, only after a verified APPROVED signal
 *     whose amount matches;
 *   - anything else fails CLOSED: nothing is fulfilled, nothing is trusted.
 * The shared `order-store.ts` module keeps checkout and callback coherent;
 * its in-memory maps are demo stand-ins for a real database (the reference
 * app shows the full durable pattern).
 */

const orderStoreModule = `/**
 * Server-owned order + delivery state shared by the checkout and callback
 * routes (demo: in-memory Maps — use your database in a real app; see
 * examples/first-payment for the full durable pattern).
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

const checkoutRoute = `import { Router } from 'express';
import { sdk } from 'aba-payway-ts';
import { CATALOG, orders } from './order-store.js';

const router = Router();

router.post('/api/payment/checkout', async (req, res) => {
  const sku = typeof req.body?.sku === 'string' ? req.body.sku : 'demo-item';
  const product = CATALOG[sku];
  if (!product) {
    return res.status(400).json({ error: 'unknown item' });
  }

  // A unique attempt per create: never reuse a tran_id (PayWay accepts
  // duplicates silently in sandbox — uniqueness is the merchant's job).
  // The gateway caps tran_id at 20 characters — keep the generated id short.
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

    // Artifact projection only: the gateway session (and its raw response)
    // stays on the server. Creation is NOT payment — the callback route or
    // a server-side status check decides that.
    return res.status(201).json({
      orderId,
      transactionId,
      paymentArtifact: session.responsePayload,
      responseType: session.responseType,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({
      error: 'payment creation failed',
      // The create outcome may be UNKNOWN on a network error — check the
      // transaction by id before ever creating a replacement attempt.
      transactionId,
      detail: message,
    });
  }
});

export default router;
`;

const callbackRoute = `import { Router } from 'express';
import { verifyCallbackDetailed } from 'aba-payway-ts';
import { claimDelivery, orders } from './order-store.js';

const router = Router();

function fulfillOrder(order) {
  // TODO(merchant): this is the ONLY place that fulfills. It runs once per
  // order (guarded by the paid flag below). Keep heavy work (email, stock,
  // invoicing) in a durable job queue — do not do it inline in the request.
  console.log('Order fulfilled:', order.orderId, order.transactionId);
}

router.post('/api/payment/callback', (req, res) => {
  const signature = String(req.headers['x-payway-hmac-sha512'] ?? '');
  const body = (req.body ?? {}) as Record<string, unknown>;

  // 1. Authenticate the delivery. An invalid signature fulfills nothing.
  const verification = verifyCallbackDetailed(body, signature, process.env.PAYWAY_API_KEY ?? '');
  if (!verification.valid) {
    console.warn('PayWay callback rejected: invalid signature');
    return res.status(401).json({ ok: false, reason: 'signature verification failed' });
  }

  // 2. Bind the delivery to a known order. A verified callback for an
  //    unknown transaction must not create state.
  const transactionId = typeof body.tran_id === 'string' ? body.tran_id : '';
  const order = orders.get(transactionId);
  if (!order) {
    console.warn('PayWay callback for unknown transaction:', transactionId);
    return res.status(202).json({ ok: false, reason: 'unknown transaction' });
  }

  // 3. Accept the delivery exactly once (durable inbox), BEFORE any
  //    fulfillment decision — a crash after this point loses nothing,
  //    a replay sees "duplicate" instead of double-fulfilling.
  const deliveryId = \`\${transactionId}:\${String(body.status ?? '')}\`;
  if (!claimDelivery(deliveryId)) {
    return res.json({ ok: true, duplicate: true });
  }

  // 4. Verify the payment itself. status '0' = APPROVED on the purchase
  //    pushback; declines/cancels update the order but fulfill nothing.
  const status = String(body.status ?? '');
  if (status !== '0') {
    order.status = status === '3' ? 'declined' : \`unaccepted (\${status})\`;
    return res.json({ ok: true, fulfilled: false });
  }

  // 5. Cross-check the paid amount against the STORED order — never the
  //    caller's claim. A mismatch is a tampering/error signal: park it.
  const paidAmount = Number(body.payway_amount);
  if (Number.isFinite(paidAmount) && Math.abs(paidAmount - order.amount) > 1e-9) {
    order.status = 'amount-mismatch';
    console.error('Amount mismatch for', transactionId, '— order kept unfulfilled');
    return res.status(202).json({ ok: false, reason: 'amount mismatch' });
  }

  // 6. Fulfill once, then acknowledge. ACK only AFTER durable acceptance —
  //    never before the work is committed somewhere that survives a crash.
  if (order.status === 'paid') {
    return res.json({ ok: true, duplicate: true });
  }
  order.status = 'paid';
  setImmediate(() => fulfillOrder(order));
  return res.json({ ok: true, fulfilled: true });
});

export default router;
`;

export const EXPRESS_TEMPLATE: TemplateBundle = {
  framework: 'express',
  files: [
    { path: 'routes/payment/order-store.ts', content: orderStoreModule },
    { path: 'routes/payment/checkout.ts', content: checkoutRoute },
    { path: 'routes/payment/callback.ts', content: callbackRoute },
  ],
};
