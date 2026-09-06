/**
 * HTTP server for the first-payment reference app. Zero runtime dependencies
 * beyond `aba-payway-ts`: node:http + the payment engine + the order store.
 *
 * Data boundary (plan Task 7): the browser only ever receives
 * `sanitizeOrderForClient` output, QR strings/data-URLs, and signed hosted
 * forms. Credentials, raw gateway responses, and store internals never
 * cross to the client.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrderStore, sanitizeOrderForClient } from './store.ts';
import { createPaymentEngine, type PaymentEngine } from './payments.ts';

export interface ServerOptions {
  port?: number;
  host?: string;
  store: OrderStore;
  engine: PaymentEngine;
}

/**
 * The product catalog. Prices are SERVER-side truth: the browser sends a
 * product ID, never an amount. (A client-supplied amount is the classic
 * fulfillment bug — price tampering must be impossible by construction.)
 */
const CATALOG: Record<string, { name: string; price: number; currency: 'USD' | 'KHR' }> = {
  coffee: { name: 'Coffee', price: 3.5, currency: 'USD' },
  tshirt: { name: 'T-Shirt', price: 12, currency: 'USD' },
  book: { name: 'Book', price: 8.25, currency: 'USD' },
  // Teaching products (demo mode drives outcomes from the product name —
  // the control word must survive into the display name the simulator sees):
  approve: { name: 'Approve Demo (approves)', price: 1, currency: 'USD' },
  decline: { name: 'Decline Demo (declines)', price: 1, currency: 'USD' },
  late: { name: 'Late Payment Demo (pays after close)', price: 1, currency: 'USD' },
  'no-callback': { name: 'Missed Callback Demo (no-callback)', price: 1, currency: 'USD' },
};

export function startExampleServer(options: ServerOptions): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  const { store, engine } = options;
  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';

  const indexHtml = readAsset('index.html');

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'internal error';
      // Route guards (unknown order/transaction, validation refusals) carry a
      // statusCode; genuine bugs are 500. The message is our own validation
      // text — stack traces and credentials never reach the client.
      const statusCode =
        typeof (error as { statusCode?: number }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 500;
      respondJson(res, statusCode, { error: message });
      console.error('[first-payment] request failed:', message);
    });
  });

  function readAsset(name: string): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return readFileSync(path.join(here, '..', 'public', name), 'utf-8');
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const route = `${req.method ?? 'GET'} ${url.pathname}`;

    // ── UI + health ─────────────────────────────────────────────
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      respondHtml(res, 200, indexHtml);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/health') {
      respondJson(res, 200, { ok: true, mode: engine.mode });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/catalog') {
      respondJson(res, 200, {
        mode: engine.mode,
        products: Object.entries(CATALOG).map(([id, p]) => ({ id, name: p.name, price: p.price, currency: p.currency })),
      });
      return;
    }

    // ── order lifecycle ────────────────────────────────────────
    if (route === 'POST /api/orders') {
      const body = (await readJson(req)) as { productId?: string };
      const product = CATALOG[String(body.productId)];
      if (!product) {
        respondJson(res, 400, { error: 'unknown_product' });
        return;
      }
      const order = store.createOrder({ product: product.name, amount: product.price, currency: product.currency });
      respondJson(res, 201, { order: sanitizeOrderForClient(order) });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/orders/')) {
      const orderId = decodeURIComponent(url.pathname.slice('/api/orders/'.length));
      const order = store.get(orderId);
      if (!order) {
        respondJson(res, 404, { error: 'unknown_order' });
        return;
      }
      const attempts = store.listAttempts(orderId);
      respondJson(res, 200, {
        order: sanitizeOrderForClient(order),
        events: store.listEvents(orderId),
        attempts: attempts.map((a) => ({
          transactionId: a.transactionId,
          createdAt: a.createdAt,
          expiresAtMs: a.expiresAtMs,
          closedLocallyAt: a.closedLocallyAt,
        })),
      });
      return;
    }

    // ── payment creation: QR tab / hosted-card tab ─────────────
    if (route === 'POST /api/orders/create-qr') {
      const body = (await readJson(req)) as { orderId?: string };
      const order = requireOrder(body.orderId);
      // Refuse BEFORE any gateway interaction when the order state makes a
      // new attempt meaningless (already paid/refunded, or a late payment
      // awaiting merchant resolution). This is the "never silently create
      // another payment" guard at the HTTP boundary.
      if (order.status === 'paid' || order.status === 'refunded' || order.status === 'needs_resolution') {
        respondJson(res, 409, { error: `order is ${order.status} — no new payment attempts` });
        return;
      }
      const result = await engine.createQrPayment({
        orderId: order.orderId,
        product: order.product,
        amount: order.amount,
        currency: order.currency,
      });
      respondJson(res, 201, {
        simulated: result.simulated,
        transactionId: result.transactionId,
        qrString: result.qrString,
        qrImage: result.qrImage,
        expiresAtMs: result.expiresAtMs,
      });
      return;
    }

    if (route === 'POST /api/orders/create-hosted') {
      const body = (await readJson(req)) as { orderId?: string };
      const order = requireOrder(body.orderId);
      if (order.status === 'paid' || order.status === 'refunded' || order.status === 'needs_resolution') {
        respondJson(res, 409, { error: `order is ${order.status} — no new payment attempts` });
        return;
      }
      const result = await engine.createHostedCardForm({
        orderId: order.orderId,
        product: order.product,
        amount: order.amount,
        currency: order.currency,
      });
      // The form is returned as a payload so tests can inspect it; the UI
      // renders it in an iframe srcdoc — a sandboxed boundary that keeps
      // gateway-origin pages from touching merchant-page state.
      respondJson(res, 201, {
        simulated: result.simulated,
        transactionId: result.transactionId,
        html: result.html,
        expiresAtMs: result.expiresAtMs,
      });
      return;
    }

    // ── the callback: verify, then reconcile via status read ────
    if (route === 'POST /api/payway/callback') {
      const body = (await readJson(req)) as Record<string, unknown>;
      const signature = header(req, 'x-payway-hmac-sha512');
      if (!signature) {
        store.recordUnverifiedNotification({
          transactionId: typeof body.tran_id === 'string' ? body.tran_id : undefined,
          reason: 'missing x-payway-hmac-sha512 header',
        });
        // 401 — an unsigned pushback is never applied, but the attempt is
        // always logged for audit.
        respondJson(res, 401, { error: 'invalid_signature' });
        return;
      }
      const application = await engine.applyCallback(body, signature);
      if (application.verdict.kind === 'rejected') {
        respondJson(res, 401, { error: 'invalid_signature', reason: application.verdict.reason });
        return;
      }
      // 200 even when the verified pushback did not fulfill the order
      // (amount mismatch, late payment, …): the pushback itself was valid;
      // the operator investigates the store event log.
      respondJson(res, 200, { received: true, applied: application.applied });
      return;
    }

    // ── status polling (UX signal; the store is the order truth) ─
    if (req.method === 'POST' && url.pathname.startsWith('/api/orders/status/')) {
      const transactionId = decodeURIComponent(url.pathname.slice('/api/orders/status/'.length));
      const attempt = store.getAttempt(transactionId);
      if (!attempt) {
        respondJson(res, 404, { error: 'unknown_transaction' });
        return;
      }
      const status = await engine.checkStatus(transactionId);
      if (status.gatewayStatus === 'APPROVED') {
        // The authoritative reconciliation path — this is how a missed
        // callback gets discovered (the poll sees APPROVED).
        store.applyVerifiedPayment({
          transactionId,
          source: 'status-check',
          amount: status.paidAmount ?? 0,
          currency: status.currency ?? 'USD',
        });
      } else if (status.gatewayStatus === 'DECLINED' || status.gatewayStatus === 'CANCELLED') {
        store.applyDeclined({ transactionId, gatewayStatus: status.gatewayStatus, source: 'status-check' });
      }
      const order = store.get(attempt.orderId)!;
      respondJson(res, 200, {
        order: sanitizeOrderForClient(order),
        gatewayStatus: status.gatewayStatus,
        terminal: status.terminal,
        simulated: status.simulated,
      });
      return;
    }

    // ── merchant operations: close / refund / resolve ───────────
    if (req.method === 'POST' && url.pathname.startsWith('/api/orders/close/')) {
      const transactionId = decodeURIComponent(url.pathname.slice('/api/orders/close/'.length));
      const attempt = store.getAttempt(transactionId);
      if (!attempt) {
        respondJson(res, 404, { error: 'unknown_transaction' });
        return;
      }
      await engine.closeTransaction(transactionId);
      const order = store.get(attempt.orderId)!;
      respondJson(res, 200, { order: sanitizeOrderForClient(order) });
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/orders/refund/')) {
      const transactionId = decodeURIComponent(url.pathname.slice('/api/orders/refund/'.length));
      const body = (await readJson(req)) as { amount?: number };
      const attempt = store.getAttempt(transactionId);
      if (!attempt) {
        respondJson(res, 404, { error: 'unknown_transaction' });
        return;
      }
      const order = store.get(attempt.orderId)!;
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > order.paidTotal - order.refundedTotal + 1e-9) {
        respondJson(res, 400, { error: 'invalid_refund_amount' });
        return;
      }
      await engine.refund(transactionId, amount, order.currency);
      respondJson(res, 200, { order: sanitizeOrderForClient(store.get(order.orderId)!) });
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/orders/resolve/')) {
      const orderId = decodeURIComponent(url.pathname.slice('/api/orders/resolve/'.length));
      const body = (await readJson(req)) as { decision?: 'fulfill' | 'refund' };
      if (body.decision !== 'fulfill' && body.decision !== 'refund') {
        respondJson(res, 400, { error: 'invalid_decision' });
        return;
      }
      const order = store.get(orderId);
      if (!order) {
        respondJson(res, 404, { error: 'unknown_order' });
        return;
      }
      const updated = store.resolveLatePayment(orderId, body.decision);
      respondJson(res, 200, { order: sanitizeOrderForClient(updated) });
      return;
    }

    respondJson(res, 404, { error: 'not_found' });
  }

  function requireOrder(orderId: unknown): import('./store.ts').OrderRecord {
    if (typeof orderId !== 'string') throw new Error('orderId must be a string');
    const order = store.get(orderId);
    if (!order) {
      const error = new Error(`unknown order ${orderId}`) as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return order;
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolve({ server, port: (server.address() as { port: number }).port }));
  });
}

export function stopExampleServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Force-close keep-alive sockets so tests shut down promptly.
    setTimeout(() => server.closeAllConnections?.(), 250);
  });
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function respondHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
