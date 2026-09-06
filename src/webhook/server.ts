/**
 * Webhook HTTP server for receiving PayWay callback payloads.
 *
 * Exposes three POST routes, each with a dedicated contract:
 *  - `/aba-payway-webhook` — online checkout callback. Raw-stored; optional
 *    HMAC verification is logged and never causes rejection (WH-TC-05).
 *  - `/aba-payway-khqr-webhook` — offline KHQR notification. No HMAC
 *    (no published contract); raw-stored first, parsed as metadata only.
 *  - `/aba-payway-pushback` — payment-link pushback. No hash on the wire
 *    (live-verified); raw-stored first, parsed via `parsePaymentLinkPushback`.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { verifyCallbackSignature } from '../auth.js';
import { parsePaymentLinkPushback } from '../domains/payment-link.js';
import { extractJsonPayload, parseKhqrPaymentNotification } from './khqr-notification.js';
import type { WebhookStorage } from './storage.js';

export interface WebhookServerOptions {
  /** Port to listen on (default: 8443). */
  port?: number;
  /** Callback signature verification key. If provided, signatures are logged. */
  apiKey?: string;
  /**
   * TD-09 hardening mode: when `apiKey` is configured and a callback carries a
   * signature that FAILS verification, respond 401 instead of the capture
   * server's default always-200. Requests without any signature header are
   * still accepted with 200 (nothing to verify against). Default: false —
   * keep capture-sink semantics unless you need verdict-style endpoints.
   */
  rejectInvalidSignature?: boolean;
  /** Suppress console output. */
  quiet?: boolean;
  /** Offline ABA KHQR notification listener settings. */
  khqr?: {
    /** Dedicated path to prevent conflating KHQR notifications with checkout callbacks. */
    path?: string;
  };
  /**
   * Payment-link pushback listener settings. PayWay POSTs the payment
   * notification for a payment link directly to the link's `return_url`
   * (no hash — see `parsePaymentLinkPushback`); this route gives that
   * contract a home on the webhook server.
   */
  pushback?: {
    /** Dedicated path (default `/aba-payway-pushback`). */
    path?: string;
  };
}

export interface WebhookServerResult {
  /** Start the HTTP server. Resolves when listening. */
  start(): Promise<void>;
  /** Stop the HTTP server and release resources. */
  stop(): Promise<void>;
  /** The port the server is listening on. */
  readonly port: number;
  /** Whether the server is currently accepting connections. */
  readonly isRunning: boolean;
}

const WEBHOOK_PATH = '/aba-payway-webhook';
const KHQR_WEBHOOK_PATH = '/aba-payway-khqr-webhook';
const PUSHBACK_PATH = '/aba-payway-pushback';

export function createWebhookServer(storage: WebhookStorage, options: WebhookServerOptions = {}): WebhookServerResult {
  const port = options.port ?? 8443;
  const apiKey = options.apiKey;
  const quiet = options.quiet ?? false;
  const khqrPath = options.khqr?.path ?? KHQR_WEBHOOK_PATH;
  const pushbackPath = options.pushback?.path ?? PUSHBACK_PATH;
  if (khqrPath === WEBHOOK_PATH) {
    throw new Error(`KHQR webhook path must differ from the legacy ${WEBHOOK_PATH} route`);
  }
  if (pushbackPath === WEBHOOK_PATH || pushbackPath === khqrPath) {
    throw new Error(`Payment-link pushback path must differ from the ${WEBHOOK_PATH} and ${khqrPath} routes`);
  }

  let server: Server | null = null;
  let running = false;

  function log(msg: string): void {
    if (!quiet) console.log(msg);
  }

  function collectBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const isOnlineWebhook = req.url === WEBHOOK_PATH;
    const isKhqrWebhook = req.url === khqrPath;
    const isPushback = req.url === pushbackPath;
    if (req.method !== 'POST' || (!isOnlineWebhook && !isKhqrWebhook && !isPushback)) {
      const knownPath = isOnlineWebhook || isKhqrWebhook || isPushback;
      res.writeHead(knownPath ? 405 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: knownPath ? 'Method not allowed' : 'Not found' }));
      return;
    }

    collectBody(req)
      .then((body) => {
        // Parse headers
        const headers: Record<string, string | string[] | undefined> = {};
        if (req.headers) {
          for (const [key, value] of Object.entries(req.headers)) {
            headers[key] = value;
          }
        }

        const sourceIp = req.socket?.remoteAddress;

        if (isPushback) {
          // Payment-link pushback (live contract, SANDBOX-FINDINGS §22): raw
          // store first — the same never-discard rule as the KHQR route.
          // There is NO hash on this delivery (notification only), so no
          // HMAC verification is attempted; the payment itself is verified
          // via check-transaction using the parsed tran_id.
          const record = storage.save({ headers, body, sourceIp });
          let pushback: import('./storage.js').PaymentLinkPushbackMetadata;
          try {
            const parsed = parsePaymentLinkPushback(body);
            pushback = { parsed };
            log(
              `  Payment-link pushback [${record.id}]: tran_id=${parsed.tranId} status=${parsed.status}${parsed.merchantRefNo ? ` merchant_ref_no=${parsed.merchantRefNo}` : ''}`,
            );
          } catch (error) {
            pushback = { parseError: error instanceof Error ? error.message : String(error) };
            log(`  Payment-link pushback [${record.id}] failed to parse: ${pushback.parseError}`);
          }

          if (storage.updatePaymentLinkPushbackMetadata) {
            try {
              storage.updatePaymentLinkPushbackMetadata(record.id, pushback);
            } catch (error) {
              log(`  Unable to store pushback parse metadata: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true, id: record.id }));
          return;
        }

        if (isKhqrWebhook) {
          // Persist the delivery before parsing it: malformed JSON and future ABA
          // schema changes must never discard the raw audit record.
          const record = storage.save({ headers, body, sourceIp });
          // This notification has no published ABA authentication contract. Parsing
          // is capture metadata only; it must never decide that an order is paid.
          let khqr: import('./storage.js').KhqrWebhookMetadata;
          try {
            // Tolerate payload variations per ABA guidance: raw JSON or
            // HTML-wrapped deliveries are both accepted here.
            const parsed = parseKhqrPaymentNotification(extractJsonPayload(body));
            const duplicateTransactionId = storage
              .getAll()
              .some((record) => record.khqr?.parsed?.notification.transactionId === parsed.notification.transactionId);
            khqr = { parsed, duplicateTransactionId };
          } catch (error) {
            khqr = { parseError: error instanceof Error ? error.message : String(error) };
          }

          if (storage.updateKhqrMetadata) {
            try {
              storage.updateKhqrMetadata(record.id, khqr);
            } catch (error) {
              log(`  Unable to store KHQR parse metadata: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          log(`  Received offline KHQR notification [${record.id}] at ${record.receivedAt}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true, id: record.id }));
          return;
        }

        // Online checkout callback behavior remains unchanged.
        let signatureValid: boolean | null = null;
        const receivedSignature = req.headers['x-payway-hmac-sha512'];
        if (apiKey && typeof receivedSignature === 'string') {
          try {
            const bodyObj = JSON.parse(body) as Record<string, unknown>;
            const signedBody = { ...bodyObj };
            delete signedBody.hash;
            signatureValid = verifyCallbackSignature(signedBody, receivedSignature, apiKey);
          } catch {
            signatureValid = false;
          }
          log(`  Signature: ${signatureValid ? '\x1b[32m✓ valid\x1b[0m' : '\x1b[31m✗ invalid\x1b[0m'}`);
        }

        const record = storage.save({ headers, body, sourceIp });

        log(`  Received callback [${record.id}] at ${record.receivedAt}`);
        if (sourceIp) {
          log(`  Source IP: ${sourceIp}`);
        }

        // TD-09: optional verdict mode. The capture sink still stores every
        // delivery, but an explicitly-invalid signed callback is refused.
        if (options.rejectInvalidSignature && apiKey && signatureValid === false) {
          log(`  \x1b[31m✗ Rejecting [${record.id}]: invalid signature (rejectInvalidSignature enabled)\x1b[0m`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid signature', id: record.id }));
          return;
        }

        // Always respond 200 otherwise — never reject based on content
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ acknowledged: true, id: record.id }));
      })
      .catch((err: unknown) => {
        log(`  \x1b[31m✗ Error processing request: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
  }

  return {
    port,
    get isRunning() {
      return running;
    },

    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server = createServer(handleRequest);

        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            log(`\n  \x1b[31m✗\x1b[0m \x1b[1mPort ${port} is busy.\x1b[0m Please free the port.`);
            process.exitCode = 1;
            reject(new Error(`Port ${port} is already in use`));
          } else {
            reject(err);
          }
        });

        server.listen(port, () => {
          running = true;
          log(`\n  \x1b[1mWebhook listener running on\x1b[0m \x1b[36mhttp://localhost:${port}${WEBHOOK_PATH}\x1b[0m`);
          log(`  \x1b[2mPress Ctrl+C to stop.\x1b[0m\n`);
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!server || !running) {
          resolve();
          return;
        }

        server.close(() => {
          running = false;
          server = null;
          log('  \x1b[32m✓\x1b[0m Webhook listener shut down successfully.');
          resolve();
        });

        // Force close after 3 seconds if graceful shutdown stalls
        setTimeout(() => {
          if (running) {
            server?.closeAllConnections?.();
            running = false;
            server = null;
            resolve();
          }
        }, 3_000);
      });
    },
  };
}
