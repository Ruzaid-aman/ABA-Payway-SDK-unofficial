/**
 * Webhook HTTP server for receiving PayWay callback payloads.
 *
 * Exposes a single POST endpoint at `/aba-payway-webhook` that accepts
 * raw payloads, stores them unvalidated, and returns 200 OK.
 * Signature verification is logged but never causes rejection (WH-TC-05).
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { WebhookStorage } from './storage.js';
import { verifyCallbackSignature } from '../auth.js';

export interface WebhookServerOptions {
  /** Port to listen on (default: 8443). */
  port?: number;
  /** Callback signature verification key. If provided, signatures are logged. */
  apiKey?: string;
  /** Suppress console output. */
  quiet?: boolean;
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

export function createWebhookServer(
  storage: WebhookStorage,
  options: WebhookServerOptions = {},
): WebhookServerResult {
  const port = options.port ?? 8443;
  const apiKey = options.apiKey;
  const quiet = options.quiet ?? false;

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
    // Only accept POST on the webhook path
    if (req.method !== 'POST' || req.url !== WEBHOOK_PATH) {
      res.writeHead(req.url === WEBHOOK_PATH ? 405 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: req.url === WEBHOOK_PATH ? 'Method not allowed' : 'Not found' }));
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

        // Attempt signature verification (log only, never reject)
        let signatureValid: boolean | null = null;
        const receivedSignature = req.headers['x-payway-hmac-sha512'];
        if (apiKey && typeof receivedSignature === 'string') {
          try {
            const bodyObj = JSON.parse(body) as Record<string, unknown>;
            // Strip hash field before verification (PayWay convention)
            const signedBody = { ...bodyObj };
            delete signedBody.hash;
            signatureValid = verifyCallbackSignature(signedBody, receivedSignature, apiKey);
          } catch {
            signatureValid = false;
          }
          log(
            `  Signature: ${signatureValid ? '\x1b[32m✓ valid\x1b[0m' : '\x1b[31m✗ invalid\x1b[0m'}`,
          );
        }

        // Store raw payload
        const record = storage.save({ headers, body, sourceIp });

        log(`  Received callback [${record.id}] at ${record.receivedAt}`);
        if (sourceIp) {
          log(`  Source IP: ${sourceIp}`);
        }

        // Always respond 200 — never reject based on content
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
