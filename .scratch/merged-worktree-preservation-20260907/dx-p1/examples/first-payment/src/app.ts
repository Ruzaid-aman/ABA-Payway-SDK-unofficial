import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { DemoGateway, type PaymentGateway } from './gateway.js';
import { type PaymentRoute, type ProductId, PRODUCTS } from './order-store.js';
import { PaymentService } from './payment-service.js';

function cents(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Payment amount is missing or invalid');
  return Math.round(parsed * 100);
}

function publicOrder(order: ReturnType<PaymentService['store']['get']>) {
  if (!order) return undefined;
  return {
    id: order.id,
    productId: order.productId,
    productName: order.productName,
    amount: (order.amountCents / 100).toFixed(2),
    currency: order.currency,
    state: order.state,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    fulfillmentCount: order.fulfillmentCount,
    refundedAmount: (order.refundedCents / 100).toFixed(2),
    resolutionReason: order.resolutionReason,
    attempts: order.attempts.map((attempt) => ({
      transactionId: attempt.transactionId,
      route: attempt.route,
      state: attempt.state,
      createdAt: attempt.createdAt,
    })),
  };
}

export function createApp(service: PaymentService): Express {
  const app = express();
  const hostedPages = new Map<string, string>();
  const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(publicDirectory));

  app.get('/api/catalog', (_req, res) => {
    res.json({
      mode: service.gateway.mode,
      products: Object.values(PRODUCTS).map((product) => ({
        ...product,
        amount: (product.amountCents / 100).toFixed(2),
      })),
    });
  });

  app.get('/api/orders', (_req, res) => {
    res.json({ orders: service.store.list().map(publicOrder) });
  });

  app.post('/api/orders', (req, res, next) => {
    try {
      const productId = req.body?.productId as ProductId;
      if (!(productId in PRODUCTS)) return res.status(400).json({ error: 'Choose a product from the server catalog' });
      return res.status(201).json({ order: publicOrder(service.createOrder(productId)) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/orders/:orderId', (req, res) => {
    const order = publicOrder(service.store.get(req.params.orderId));
    return order ? res.json({ order }) : res.status(404).json({ error: 'Order not found' });
  });

  app.post('/api/orders/:orderId/payments', async (req, res, next) => {
    try {
      const route = req.body?.route as PaymentRoute;
      if (!['qr', 'hosted'].includes(route)) return res.status(400).json({ error: 'Route must be qr or hosted' });
      const artifact = await service.createPayment(req.params.orderId, route);
      if (artifact.hostedHtml) hostedPages.set(artifact.transactionId, artifact.hostedHtml);
      return res.status(201).json({
        payment: {
          transactionId: artifact.transactionId,
          route: artifact.route,
          qrImageDataUrl: artifact.qrImageDataUrl,
          checkoutPath: artifact.hostedHtml ? `/checkout/${encodeURIComponent(artifact.transactionId)}` : undefined,
          nextAction: 'Wait for a verified callback or reconcile this transaction before fulfillment.',
        },
        order: publicOrder(service.store.get(req.params.orderId)),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/checkout/:transactionId', (req, res) => {
    const html = hostedPages.get(req.params.transactionId);
    if (!html) return res.status(404).send('Hosted checkout artifact is no longer available. Reconcile the existing transaction.');
    res.setHeader('cache-control', 'no-store');
    return res.type('html').send(html);
  });

  app.post('/api/orders/:orderId/reconcile', async (req, res, next) => {
    try {
      const order = service.store.get(req.params.orderId);
      const attempt = order?.attempts.at(-1);
      if (!attempt) return res.status(400).json({ error: 'Order has no payment attempt' });
      const result = await service.reconcile(attempt.transactionId);
      return res.json({ result: { applied: result.applied, fulfilled: result.fulfilled, reason: result.reason }, order: publicOrder(result.order) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/orders/:orderId/close', async (req, res, next) => {
    try {
      const order = await service.close(req.params.orderId);
      return res.json({
        order: publicOrder(order),
        warning: 'Local closure is not proof that customer payment is impossible. Continue reconciliation for late funds.',
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/orders/:orderId/refunds', async (req, res, next) => {
    try {
      const amountCents = cents(req.body?.amount);
      const result = await service.refund(req.params.orderId, amountCents);
      return res.json({ applied: result.applied, order: publicOrder(result.order) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/payway/callback', (req, res, next) => {
    try {
      const signature = req.header('x-payway-hmac-sha512');
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!signature || !service.gateway.verifyOnlineCallback(body, signature)) {
        return res.status(401).json({ error: 'Invalid online callback signature' });
      }
      const transactionId = String(body.tran_id ?? '');
      const status = String(body.status ?? '') === '0' ? 'APPROVED' : String(body.payment_status ?? body.status ?? 'UNKNOWN');
      const verificationId = createHash('sha256').update(`${signature}:${JSON.stringify(body)}`).digest('hex');
      const result = service.store.applyVerification({
        verificationId: `callback:${verificationId}`,
        transactionId,
        source: 'signed-online-callback',
        authenticity: 'verified',
        paymentStatus: status,
        amountCents: cents(body.amount),
        currency: String(body.currency ?? ''),
      });
      return res.json({ acknowledged: true, applied: result.applied });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/payway/khqr-notification', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const transactionId = String(body.transaction_id ?? body.tran_id ?? '');
      if (transactionId) {
        service.store.applyVerification({
          verificationId: `khqr-unverified:${String(body.transaction_id ?? Date.now())}`,
          transactionId,
          source: 'unverified-notification',
          authenticity: 'unverified',
          paymentStatus: 'APPROVED',
          amountCents: Number.isFinite(Number(body.amount)) ? cents(body.amount) : 0,
          currency: String(body.currency ?? ''),
        });
      }
      return res.status(202).json({
        acknowledged: true,
        verified: false,
        nextAction: 'Reconcile merchant_ref and transaction details through a verified ABA process.',
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/demo/payments/:transactionId/approve', async (req, res, next) => {
    try {
      if (!(service.gateway instanceof DemoGateway)) return res.status(404).json({ error: 'Demo action unavailable' });
      service.gateway.approve(req.params.transactionId);
      const result = await service.reconcile(req.params.transactionId);
      return res.json({ result: { fulfilled: result.fulfilled, reason: result.reason }, order: publicOrder(result.order) });
    } catch (error) {
      return next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Payment operation failed';
    const status = /not found/i.test(message) ? 404 : /active|already|must|cannot|exceeds/i.test(message) ? 409 : 500;
    res.status(status).json({
      error: message,
      nextAction: /reconcile/i.test(message) ? 'Reconcile the existing transaction before creating another payment.' : undefined,
    });
  });

  return app;
}
