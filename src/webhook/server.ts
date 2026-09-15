/**
 * Webhook HTTP server for receiving PayWay callback payloads.
 *
 * Exposes three POST routes, each with a dedicated contract:
 *  - `/aba-payway-webhook` — online checkout callback. Raw-stored; optional
 *    HMAC verification is logged and never causes rejection (WH-TC-05).
 *  - `/aba-payway-khqr-webhook` — offline KHQR notification AND Customer
 *    Module ("Printed QR") callback. The former carries no HMAC contract;
 *    the latter IS signed with `X-PAYWAY-HMAC-SHA512` — the route verifies
 *    whenever a signature header is present and an apiKey is configured
 *    (verdict recorded; offline deliveries stay `'unsigned'`). Raw-stored
 *    first; classification (`classifyCallback`) decides which parser's
 *    metadata is attached.
 *  - `/aba-payway-pushback` — payment-link pushback. No hash on the wire
 *    (live-verified); raw-stored first, parsed via `parsePaymentLinkPushback`.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { verifyCallbackDetailed } from '../auth.js';
import { classifyCallback, parseCustomerQrCallback } from './customer-callback.js';
import { extractTransactionIdFrom } from '../journal/digest.js';
import { createJournalEmitter } from '../journal/writer.js';
import type { JournalContext } from '../journal/types.js';
import { parsePaymentLinkPushback } from '../domains/payment-link.js';
import { isCofLinkCallback, parseCofLinkCallback } from './cof-callback.js';
import { maskPwt, resolveTokenStoreDir, saveLinkedToken } from './token-store.js';
import { WebhookForwarder, parseForwardHeaders } from './forwarder.js';
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
  /**
   * W-1 (Stripe `listen --forward-to` analog): re-POST every accepted
   * callback (all three routes) to this local app URL after capture, so the
   * developer's receiver runs its full handling path without the ABA
   * Simulator. Forward failures never reject the original callback — capture
   * always wins.
   */
  forwardTo?: string;
  /** Extra headers attached to every forwarded delivery (`"Key:Value, K2:V2"`). */
  forwardHeaders?: string;
  /** Fetch seam for the forwarder (tests). */
  forwardFetch?: typeof fetch;
  /**
   * Directory for the linked-token store (`linked-tokens.json`). When a
   * signature-VERIFIED CoF link callback (a delivery carrying `pwt`) is
   * captured on any route, the token is persisted here for future
   * `cof charge` use (see `token-store.ts`). Default: `<cwd>/payway-data`
   * (or PAYWAY_TOKEN_STORE_DIR). Unverified/invalid deliveries are captured
   * raw but their token is NOT persisted.
   */
  tokenStoreDir?: string;
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

/**
 * Non-throwing `extractJsonPayload`: raw JSON, HTML-wrapped JSON, or nothing —
 * an unparseable delivery still gets classified and stored.
 */
function extractJsonPayloadSilent(body: string): Record<string, unknown> | undefined {
  try {
    const extracted: unknown = extractJsonPayload(body);
    return extracted && typeof extracted === 'object' && !Array.isArray(extracted)
      ? (extracted as Record<string, unknown>)
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
  const pushbackPath = options.pushback?.path ?? PUSHBACK_PATH;
  if (khqrPath === WEBHOOK_PATH) {
    throw new Error(`KHQR webhook path must differ from the legacy ${WEBHOOK_PATH} route`);
  }
  // Phase 3: callback.received journal events (env-gated when not injected).
  const journal: JournalContext | undefined = options.journal ?? createJournalEmitter(undefined, process.env);
  if (pushbackPath === WEBHOOK_PATH || pushbackPath === khqrPath) {
    throw new Error(`Payment-link pushback path must differ from the ${WEBHOOK_PATH} and ${khqrPath} routes`);
  }

  let server: Server | null = null;
  let running = false;

  // W-1: optional forwarder. Constructed once; invalid URL fails fast.
  const forwarder = options.forwardTo
    ? new WebhookForwarder({
        url: options.forwardTo,
        headers: parseForwardHeaders(options.forwardHeaders),
        quiet,
        log: (line) => log(line),
        fetchImpl: options.forwardFetch,
      })
    : null;

  /**
   * Forward a captured delivery without ever breaking the response path:
   * the outcome is logged (forwarder counts stats) but errors are swallowed
   * by design — capture survives receiver downtime.
   */
  function forwardCaptured(
    body: string,
    headers: Record<string, string | string[] | undefined>,
    label: string,
  ): Promise<void> {
    if (!forwarder) return Promise.resolve();
    return forwarder
      .forward(body, { headers, label })
      .then(() => undefined)
      .catch(() => undefined);
  }

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

  /**
   * Compute the signature verdict for a signed delivery, mirroring the online
   * route's Phase-3 contract (verdict becomes part of the durable record).
   * Used by BOTH the online route and the khqr route.
   *
   * Two signature channels are recognized (Q18): the
   * `x-payway-hmac-sha512` HEADER (online checkout, Customer Module) and the
   * classic body `hash` FIELD (docs/09 §5 CoF webhook guidance). The header
   * wins when present; a body `hash` is only consulted when no header
   * signature traveled. `unsigned` means neither channel carried a signature.
   */
  function computeSignatureVerdict(
    body: string,
    receivedSignature: unknown,
  ): { verdict: WebhookSignatureVerdict; reason?: WebhookRecord['verificationReason']; source?: 'header' | 'body' } {
    // No key configured → nothing to verify against: stay 'unsigned'
    // (parity with the pre-Q18 behavior for header deliveries).
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      return { verdict: 'unsigned' };
    }
    const key = apiKey;

    const verify = (
      payload: Record<string, unknown> | undefined,
      signature: unknown,
    ): { verdict: WebhookSignatureVerdict; reason?: WebhookRecord['verificationReason'] } => {
      if (!payload) {
        return { verdict: 'invalid', reason: 'signature_mismatch' };
      }
      try {
        const detailed = verifyCallbackDetailed(
          payload,
          signature as string,
          key,
          { stripHash: true },
        );
        return detailed.valid
          ? { verdict: 'verified' }
          : { verdict: 'invalid', reason: detailed.reason };
      } catch {
        return { verdict: 'invalid', reason: 'signature_mismatch' };
      }
    };

    if (typeof receivedSignature === 'string' && receivedSignature.length > 0) {
      // HTML-tolerant extraction (same tolerance as the khqr route's parser):
      // a valid signature wrapped in an intermediate HTML page must not read
      // as invalid. Only a body with NO recoverable JSON can never verify.
      const payload = extractJsonPayloadSilent(body);
      const result = verify(payload, receivedSignature);
      return result.verdict === 'verified' ? { ...result, source: 'header' } : result;
    }

    // No header signature: fall back to the classic body `hash` field (the
    // shape docs/09 §5 prescribes for CoF callbacks). `stripHash: true`
    // removes it from the concatenated payload before HMAC comparison.
    {
      const payload = extractJsonPayloadSilent(body);
      const bodyHash = payload && typeof payload.hash === 'string' ? payload.hash : undefined;
      if (bodyHash !== undefined && bodyHash.length > 0) {
        const result = verify(payload, bodyHash);
        return result.verdict === 'verified' ? { ...result, source: 'body' } : result;
      }
    }

    return { verdict: 'unsigned' };
  }

  /**
   * Persist a CoF link token (`pwt`) from a verified delivery into the
   * linked-token store for future `cof charge` use. The raw record stays the
   * audit source either way; the token is only persisted when the delivery's
   * signature VERIFIED (a pwt is a live payment credential — never persist
   * one that arrived unsigned or with a bad signature).
   */
  function captureCofToken(
    parsedBody: Record<string, unknown> | undefined,
    signatureVerdict: WebhookSignatureVerdict,
    recordId: string,
    signatureSource?: 'header' | 'body',
  ): void {
    if (!parsedBody || !isCofLinkCallback(parsedBody)) return;
    const parsed = parseCofLinkCallback(parsedBody);
    if (signatureVerdict !== 'verified') {
      log(
        `  \x1b[33m⚠ CoF link callback [${recordId}] carries pwt but signature is ${signatureVerdict} — token NOT persisted\x1b[0m`,
      );
      return;
    }
    try {
      const dir = resolveTokenStoreDir(options.tokenStoreDir);
      const saved = saveLinkedToken(
        {
          ctid: parsed.ctid ?? 'unknown-ctid',
          pwt: parsed.pwt,
          tokenFlag: parsed.tokenFlag,
          requestId: parsed.requestId,
          extraFields: Object.keys(parsed.extraFields).length > 0 ? parsed.extraFields : undefined,
          sourceRecordId: recordId,
        },
        dir,
      );
      log(
        `  \x1b[32m✓ CoF token captured [${recordId}]: ctid=${saved.ctid} token=${maskPwt(saved.pwt)} (${signatureSource ?? '?'}-hash) → ${dir}\\linked-tokens.json\x1b[0m`,
      );
    } catch (error) {
      log(`  Unable to persist CoF token: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      .then(async (body) => {
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
          // Correlation (P3-A): the pushback carries tran_id + numeric status.
          const pushbackBody = tryParseJsonObject(body);
          const matchedStatus =
            pushbackBody?.status === undefined || pushbackBody?.status === null
              ? undefined
              : String(pushbackBody.status);
          const record = storage.save({
            headers,
            body,
            sourceIp,
            matchedTransactionId: extractTransactionIdFrom(pushbackBody),
            matchedStatus,
          });
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
          await forwardCaptured(body, headers, `payment-link pushback [${record.id}]`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true, id: record.id }));
          return;
        }

        if (isKhqrWebhook) {
          // Persist the delivery before parsing it: malformed JSON and future ABA
          // schema changes must never discard the raw audit record.
          //
          // This route serves two contracts with the same field layout:
          //  - offline KHQR notifications — no published auth contract
          //  - Customer Module ("Printed QR") callbacks — HMAC-signed with
          //    X-PAYWAY-HMAC-SHA512 (merchant-captured 2026-08-18)
          // The signature HEADER (not the body shape) distinguishes them on
          // the wire; classification decides which parser's metadata attaches.
          const khqrBody = extractJsonPayloadSilent(body);
          const classification = classifyCallback(khqrBody);
          const isCustomerQr = classification === 'customer-module-qr';

          // Signature verdict whenever the delivery is signed and an apiKey is
          // configured; unsigned deliveries (offline KHQR) stay 'unsigned'.
          const { verdict: signatureVerdict, reason: verificationReason, source: signatureSource } = computeSignatureVerdict(
            body,
            req.headers['x-payway-hmac-sha512'],
          );
          if (signatureVerdict !== 'unsigned') {
            log(`  Signature: ${signatureVerdict === 'verified' ? '\x1b[32m✓ valid\x1b[0m' : '\x1b[31m✗ invalid\x1b[0m'}${signatureSource ? ` (${signatureSource}-hash)` : ''}`);
          }

          const matchedTransactionId = extractTransactionIdFrom(khqrBody);
          // matchedStatus spelling is per-contract (payment_status here,
          // numeric-string status on pushback, status on online) — replay
          // dedupe is therefore per-contract too, which is intentional: the
          // same id arriving under two contracts is two audit records.
          const matchedStatus = firstStringOf(khqrBody, 'payment_status');
          // Replay marker parity with the online route: a redelivered
          // (transaction_id, payment_status) pair is flagged for idempotent
          // processing — critical for Customer Module repeat payments.
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
            ...(signatureSource ? { signatureSource } : {}),
            verificationReason,
            matchedTransactionId,
            matchedStatus,
            replay,
          });

          captureCofToken(khqrBody, signatureVerdict, record.id, signatureSource);

          // Journal the capture before any rejection path: a 401-rejected
          // delivery must still appear in journal reconcile's callback side.
          emitCallbackJournal(record, matchedTransactionId, matchedStatus, khqrPath);

          // TD-09 on this route too: Customer Module callbacks are signed, so
          // verdict mode rejects an explicitly-invalid signature the same way
          // the online route does. Unsigned offline deliveries are unaffected.
          if (options.rejectInvalidSignature && apiKey && signatureVerdict === 'invalid') {
            log(`  \x1b[31m✗ Rejecting [${record.id}]: invalid signature (rejectInvalidSignature enabled)\x1b[0m`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid signature', id: record.id }));
            return;
          }

          if (isCustomerQr) {
            // Customer Module callback: parse into the customer-qr metadata slot.
            // A parse failure keeps the raw record and the reason — same
            // never-discard rule as every other route.
            let customerQr: import('./storage.js').CustomerQrWebhookMetadata;
            try {
              const parsedCallback = parseCustomerQrCallback(khqrBody);
              customerQr = { parsed: parsedCallback };
              const parsed = parsedCallback.notification;
              log(
                `  Customer Module callback [${record.id}]: customer_id=${parsed.merchantRef} status=${parsed.paymentStatus} amount=${parsed.originalAmount} ${parsed.originalCurrency}`,
              );
            } catch (error) {
              customerQr = { parseError: error instanceof Error ? error.message : String(error) };
              log(`  Customer Module callback [${record.id}] failed to parse: ${customerQr.parseError}`);
            }
            if (storage.updateCustomerQrMetadata) {
              try {
                storage.updateCustomerQrMetadata(record.id, customerQr);
              } catch (error) {
                log(`  Unable to store customer-qr parse metadata: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            await forwardCaptured(body, headers, `customer-module callback [${record.id}]`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ acknowledged: true, id: record.id }));
            return;
          }

          // Offline KHQR notification: capture metadata only; it must never
          // decide that an order is paid.
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
          await forwardCaptured(body, headers, `KHQR notification [${record.id}]`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true, id: record.id }));
          return;
        }

        // Online checkout callback — but the merchant profile's ONE configured
        // URL receives every channel (online, customer module, offline KHQR).
        // Classify before saving so a customer-module delivery landing here is
        // still tagged with its contract metadata; verification stays keyed on
        // the signature header either way.
        // One tolerant parse for everything downstream: classification,
        // correlation, and (when the body is a Customer Module delivery) the
        // customer-qr metadata. HTML-wrapped payloads classify too.
        const parsedBody = extractJsonPayloadSilent(body);
        const onlineClassification = classifyCallback(parsedBody);

        // Verify BEFORE saving so the verdict is part of the durable record
        // (Phase 3 — previously computed, logged, then dropped: audit gap G7).
        const { verdict: signatureVerdict, reason: verificationReason, source: signatureSource } = computeSignatureVerdict(
          body,
          req.headers['x-payway-hmac-sha512'],
        );
        if (signatureVerdict !== 'unsigned') {
          log(`  Signature: ${signatureVerdict === 'verified' ? '\x1b[32m✓ valid\x1b[0m' : '\x1b[31m✗ invalid\x1b[0m'}${signatureSource ? ` (${signatureSource}-hash)` : ''}`);
        }

        // Correlate the delivery with its transaction (gap G8) and flag
        // replays of an already-captured (tran_id, status) pair for
        // idempotent processing.
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
          ...(signatureSource ? { signatureSource } : {}),
          verificationReason,
          matchedTransactionId,
          matchedStatus,
          replay,
        });

        captureCofToken(parsedBody, signatureVerdict, record.id, signatureSource);

        // A Customer Module delivery on the online route: attach the
        // customer-qr metadata too (same parser as the khqr route).
        if (onlineClassification === 'customer-module-qr' && storage.updateCustomerQrMetadata) {
          try {
            storage.updateCustomerQrMetadata(record.id, { parsed: parseCustomerQrCallback(parsedBody) });
            log(`  Classified as Customer Module callback [${record.id}] (merchant_ref = Customer ID)`);
          } catch (error) {
            storage.updateCustomerQrMetadata(record.id, {
              parseError: error instanceof Error ? error.message : String(error),
            });
          }
        }
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

        await forwardCaptured(body, headers, `callback [${record.id}]`);

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
