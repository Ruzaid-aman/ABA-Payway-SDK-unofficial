import type { TemplateBundle } from './types.js';

/**
 * Framework scaffolds (audit S02 + review 2026-10-01): the generated routes
 * teach the reference application's trust model in executable form —
 *   - expected amount/currency live ONLY in a server-side order store; the
 *     browser never sets pricing and the raw gateway session never reaches
 *     the client (only an intentional artifact projection does);
 *   - callbacks are verified with the REAL exported API
 *     (`verifyCallbackDetailed` — there is no `sdk.auth` namespace), using
 *     the same field contract as the public guide
 *     (docs/guides/11-callbacks-and-webhooks.md → "Production Version"):
 *     payment_status_code / payment_status / payment_amount / payment_currency;
 *   - a finite amount and an EXACT currency match are required before
 *     fulfillment — a missing amount parks the order (fail closed);
 *   - anything else fails CLOSED: nothing is fulfilled, nothing is trusted.
 *
 * NON-PRODUCTION STATE, clearly labeled: the shared order-store module keeps
 * its maps in memory, which loses every order and delivery record on process
 * restart and is NOT shared across instances. It exists so the two generated
 * routes demonstrate the DECISION LOGIC coherently. Before deploying, replace
 * it with the database-backed inbox + orders + outbox pattern from the
 * guide (schema included there) or examples/first-payment.
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
  // TODO(merchant): this is the ONLY place that fulfills. It runs at most
  // once per order (guarded by the paid flag). Keep heavy work (email,
  // stock, invoicing) in a durable job/outbox — see the guide's Production
  // Version; do not do it inline in the request.
  console.log('Order fulfilled:', order.orderId, order.transactionId);
}

// Field contract matches docs/guides/11-callbacks-and-webhooks.md
// ("Production Version"): payment_status_code (number; 0 = APPROVED),
// payment_status (string; PRE-AUTH shares code 0 with APPROVED),
// payment_amount, payment_currency. Amounts in the body are CLAIMS —
// truth lives in the stored order.
router.post('/api/payment/callback', (req, res) => {
  const signature = String(req.headers['x-payway-hmac-sha512'] ?? '');
  const body = (req.body ?? {}) as Record<string, unknown>;

  // 1. Authenticate the delivery. An invalid signature fulfills nothing.
  const verification = verifyCallbackDetailed(body, signature, process.env.PAYWAY_API_KEY ?? '');
  if (!verification.valid) {
    console.warn('PayWay callback rejected: invalid signature');
    return res.status(401).json({ ok: false, reason: 'signature verification failed' });
  }

  // 2. Accept the delivery exactly once, BEFORE any fulfillment decision —
  //    a replay sees "duplicate" instead of double-fulfilling. (Process-
  //    local; see the durability warning in order-store.)
  const transactionId = typeof body.tran_id === 'string' ? body.tran_id : '';
  const statusCode = Number(body.payment_status_code);
  // Fallback delivery id uses the STATUS STRING: PRE-AUTH shares code 0
  // with APPROVED, so the bare code would collide and let one suppress
  // the other.
  const statusText = String(body.payment_status ?? '');
  const deliveryId = \`\${transactionId}:\${statusText || statusCode}\`;
  if (!claimDelivery(deliveryId)) {
    return res.json({ ok: true, duplicate: true });
  }

  // 3. Require APPROVED (code 0); the string separates PRE-AUTH, which
  //    shares code 0. Non-approved deliveries are recorded, never fulfilled.
  if (statusCode !== 0 || statusText === 'PRE-AUTH') {
    const order = orders.get(transactionId);
    if (order) order.status = statusCode === 3 ? 'declined' : \`unaccepted (\${statusCode})\`;
    return res.json({ ok: true, fulfilled: false });
  }

  // 4. Bind the approval to a known order — a verified callback for an
  //    unknown transaction must not create state.
  const order = orders.get(transactionId);
  if (!order) {
    console.warn('APPROVED callback for unknown transaction:', transactionId);
    return res.status(202).json({ ok: false, reason: 'unknown transaction' });
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
    return res.status(202).json({ ok: false, reason: 'amount/currency mismatch' });
  }

  // 6. Fulfill once, then acknowledge. ACK only AFTER the state change is
  //    recorded — never before the work is committed somewhere that
  //    survives a crash (durable form: guide's Production Version).
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
