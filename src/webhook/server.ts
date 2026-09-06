/**
 * Webhook HTTP server for receiving PayWay callback payloads.
 *
 * Exposes a single POST endpoint at `/aba-payway-webhook` that accepts
 * raw payloads, stores them unvalidated, and returns 200 OK.
 * Signature verification is logged but never causes rejection (WH-TC-05).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { verifyCallbackDetailed } from '../auth.js';
import { extractTransactionIdFrom } from '../journal/digest.js';
import { createJournalEmitter } from '../journal/writer.js';
import type { JournalContext } from '../journal/types.js';
import { extractJsonPayload, parseKhqrPaymentNotification } from './khqr-notification.js';
import type { WebhookRecord, WebhookSignatureVerdict, WebhookStorage } from './storage.js';

export interface WebhookServerOptions {
  /** Port to listen on (default: 8443). */
  port?: number;
  /** Callback signature verification key. If provided, signatures are logged. */
  apiKey?: string;
  /**
   * Phase 3: journal emitter for `callback.received` events. Defaults to an
   * env-resolved emitter (PAYWAY_JOURNAL / PAYWAY_JOURNAL_DIR) — undefined
   * (no emission) when journaling is disabled.
   */
  journal?: JournalContext;
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

function tryParseJsonObject(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function firstStringOf(source: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export function createWebhookServer(storage: WebhookStorage, options: WebhookServerOptions = {}): WebhookServerResult {
  const port = options.port ?? 8443;
  const apiKey = options.apiKey;
  const quiet = options.quiet ?? false;
  const khqrPath = options.khqr?.path ?? KHQR_WEBHOOK_PATH;
  if (khqrPath === WEBHOOK_PATH) {
    throw new Error(`KHQR webhook path must differ from the legacy ${WEBHOOK_PATH} route`);
  }
  // Phase 3: callback.received journal events (env-gated when not injected).
  const journal: JournalContext | undefined = options.journal ?? createJournalEmitter(undefined, process.env);

  let server: Server | null = null;
  let running = false;

  function log(msg: string): void {
    if (!quiet) console.log(msg);
  }

  function emitCallbackJournal(
    record: WebhookRecord,
    transactionId: string | undefined,
    status: string | undefined,
    route: string,
  ): void {
    if (!journal) return;
    try {
      journal.emit({
        kind: 'callback.received',
        // The webhook record id joins the journal event with the raw capture.
        correlationId: record.id,
        transactionId,
        status,
        endpoint: route,
      });
    } catch {
      // Journaling must never break callback capture.
    }
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
    if (req.method !== 'POST' || (!isOnlineWebhook && !isKhqrWebhook)) {
      res.writeHead(isOnlineWebhook || isKhqrWebhook ? 405 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: isOnlineWebhook || isKhqrWebhook ? 'Method not allowed' : 'Not found' }));
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
          emitCallbackJournal(
            record,
            khqr.parsed?.notification.transactionId,
            khqr.parsed?.notification.paymentStatus,
            khqrPath,
          );
          log(`  Received offline KHQR notification [${record.id}] at ${record.receivedAt}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true, id: record.id }));
          return;
        }

        // Online checkout callback: verify BEFORE saving so the verdict is
        // part of the durable record (Phase 3 — previously computed, logged,
        // then dropped: audit gap G7).
        let signatureVerdict: WebhookSignatureVerdict = 'unsigned';
        let verificationReason: WebhookRecord['verificationReason'];
        const receivedSignature = req.headers['x-payway-hmac-sha512'];
        if (apiKey && typeof receivedSignature === 'string') {
          try {
            const detailed = verifyCallbackDetailed(
              JSON.parse(body) as Record<string, unknown>,
              receivedSignature,
              apiKey,
              { stripHash: true },
            );
            signatureVerdict = detailed.valid ? 'verified' : 'invalid';
            verificationReason = detailed.valid ? undefined : detailed.reason;
          } catch {
            // Unparseable body carrying a signature header can never verify.
            signatureVerdict = 'invalid';
            verificationReason = 'signature_mismatch';
          }
          log(`  Signature: ${signatureVerdict === 'verified' ? '\x1b[32m✓ valid\x1b[0m' : '\x1b[31m✗ invalid\x1b[0m'}`);
        }

        // Correlate the delivery with its transaction (gap G8) and flag
        // replays of an already-captured (tran_id, status) pair for
        // idempotent processing.
        const parsedBody = tryParseJsonObject(body);
        const matchedTransactionId = extractTransactionIdFrom(parsedBody);
        const matchedStatus = firstStringOf(parsedBody, 'status', 'payment_status');
        let replay = false;
        if (matchedTransactionId && matchedStatus !== undefined) {
          replay = storage
            .getAll()
            .some((prior) => prior.matchedTransactionId === matchedTransactionId && prior.matchedStatus === matchedStatus);
        }

        const record = storage.save({
          headers,
          body,
          sourceIp,
          signatureVerdict,
          verificationReason,
          matchedTransactionId,
          matchedStatus,
          replay,
        });
        emitCallbackJournal(record, matchedTransactionId, matchedStatus, WEBHOOK_PATH);

        log(`  Received callback [${record.id}] at ${record.receivedAt}`);
        if (sourceIp) {
          log(`  Source IP: ${sourceIp}`);
        }

        // TD-09: optional verdict mode. The capture sink still stores every
        // delivery, but an explicitly-invalid signed callback is refused.
        if (options.rejectInvalidSignature && apiKey && signatureVerdict === 'invalid') {
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
