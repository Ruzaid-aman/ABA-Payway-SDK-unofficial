/**
 * `setup-webhook` CLI command — interactive webhook listener setup.
 *
 * Orchestrates the full flow:
 * 1. Ask user about public URL / Cloudflare Tunnel
 * 2. Start tunnel if needed
 * 3. Start HTTP server on configured port
 * 4. Handle graceful shutdown on Ctrl+C
 *
 * Every side-effectful service (IO streams, tunnel, storage, server, env
 * file, signal handlers, exit) is injectable via {@link SetupWebhookDeps}
 * so tests drive the full flow in-process (2026-08-30 testability refactor).
 * The default deps reproduce the historical behavior exactly.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { createWebhookServer, type WebhookServerResult } from '../../webhook/server.js';
import { createStorage, type StorageType } from '../../webhook/storage-factory.js';
import { createTunnelManager, findCloudflared, startTunnelWithRetry, type TunnelManager } from '../../webhook/tunnel.js';
import { appendEnvVar } from './onboard-helpers.js';
import { lazyPalette } from '../ui/theme.js';
import {
  cloudflaredMissingLines,
  computeWebhookUrl,
  computeWebhookRouteUrls,
  probeWebhookUrl,
  restoreEnvCallbackUrl,
  upsertEnvCallbackUrl,
  validatePort,
} from './setup-webhook-helpers.js';
import { clearLifecycleState, writeLifecycleState } from '../../webhook/lifecycle.js';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
// Lazy palette: resolves per call, so the global `--no-color` flag (parsed
// after this module is imported) and pipe/TTY detection both apply.
const c = lazyPalette();

export interface SetupWebhookOptions {
  port?: string;
  storage?: StorageType;
  tunnel?: boolean;
  url?: string;
  /**
   * Improvement I-7: append PAYWAY_JOURNAL=1 to the target .env (appendEnvVar
   * semantics — refuses to clobber an existing value) so `journal reconcile`
   * works out of the box. Sets process.env too for this process.
   */
  journal?: boolean;
  /**
   * W-1: re-POST every captured callback to this local app URL (Stripe
   * `listen --forward-to` analog). The receiver gets the original body and
   * signature header; capture/storage/journal behavior is unchanged.
   */
  forwardTo?: string;
  /** Extra headers attached to forwarded deliveries (`"Key:Value, K2:V2"`). */
  forwardHeaders?: string;
  /**
   * Bind interface (audit WP07). Default '127.0.0.1' — the listener captures
   * raw callback bodies (customer PII, signatures) and must not expose them
   * to the network by default. Wider binding is an explicit opt-in.
   */
  host?: string;
  /** Refuse implicit prompts when running from a background/non-TTY process. */
  nonInteractive?: boolean;
}

export interface SetupWebhookDeps {
  /** Input stream for interactive prompts (default process.stdin). */
  input?: Readable;
  /** Output stream for interactive prompts (default process.stdout). */
  output?: Writable;
  /** Output for all user-facing lines (default console.log). */
  log?: (line: string) => void;
  findCloudflared?: () => Promise<string | null>;
  createTunnel?: (cloudflaredPath: string) => TunnelManager;
  storageFactory?: typeof createStorage;
  serverFactory?: typeof createWebhookServer;
  probeWebhook?: typeof probeWebhookUrl;
  /** Target .env file for the PAYWAY_CALLBACK_URL upsert (default <cwd>/.env). */
  envFile?: string;
  /**
   * Exit hook: non-zero codes map to `process.exitCode` (caller returns),
   * zero maps to `process.exit(0)` on the shutdown path — matching the
   * historical behavior. Inject a spy in tests.
   */
  exit?: (code: number) => void;
  /** Signal registration for graceful shutdown (default process.on). */
  registerSignal?: (signal: 'SIGINT' | 'SIGTERM', handler: () => void) => void;
}

function defaultExit(code: number): void {
  if (code === 0) {
    process.exit(0);
  } else {
    process.exitCode = code;
  }
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------
function promptQuestion(rl: readline.Interface, message: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(message, (ans) => resolve(ans.trim()));
  });
}

async function promptConfirmation(rl: readline.Interface, message: string): Promise<boolean> {
  const answer = await promptQuestion(rl, message);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------
export async function runSetupWebhook(opts: SetupWebhookOptions, deps: SetupWebhookDeps = {}): Promise<void> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const exit = deps.exit ?? defaultExit;
  const envFile = deps.envFile ?? path.resolve(process.cwd(), '.env');
  const readFile = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf-8') : null);
  const writeFile = (p: string, content: string) => writeFileSync(p, content, 'utf-8');

  const portCheck = validatePort(opts.port);
  if (!portCheck.ok) {
    log(`\n  ${c.red('✗')} ${portCheck.message}\n`);
    exit(1);
    return;
  }
  const port = portCheck.port;
  const nonInteractive =
    opts.nonInteractive === true ||
    (deps.input === undefined && deps.output === undefined && (!process.stdin.isTTY || !process.stdout.isTTY));

  // ── Step 1: Resolve API key for signature verification ────────────────
  const apiKey = process.env.PAYWAY_API_KEY?.trim() || undefined;

  // ── Step 2: Determine public URL mode ────────────────────────────────
  let publicUrl: string | null = opts.url ?? null;
  let tunnel: TunnelManager | null = null;

  const cloudflaredMissing = (): void => {
    const lines = cloudflaredMissingLines();
    log(`\n  ${c.red('✗')} ${c.bold(lines[0])}`);
    log(`  ${lines[1]}`);
    log(`  Install: ${c.cyan(lines[2].replace('Install: ', ''))}`);
    log(`  Or use:  ${c.cyan(lines[3].replace('Or use:  ', ''))}\n`);
    exit(1);
  };

  if (!publicUrl && !opts.tunnel) {
    if (nonInteractive) {
      log(`\n  ${c.red('✗')} setup-webhook needs --url, --tunnel, or an interactive terminal.\n`);
      exit(2);
      return;
    }
    // Interactive mode: ask the user
    const rl = readline.createInterface({
      input: (deps.input ?? process.stdin) as never,
      output: (deps.output ?? process.stdout) as never,
    });    try {
      const hasUrl = await promptConfirmation(rl, `  Do you have a public URL to receive callbacks? (y/n): `);
      if (hasUrl) {
        publicUrl = await promptQuestion(rl, `  Enter your public URL: `);
        if (!publicUrl) {
          log(`\n  ${c.red('✗')} No URL provided. Exiting.\n`);
          exit(1);
          return;
        }
      } else {
        const useTunnel = await promptConfirmation(rl, `  Spin up Cloudflare Tunnel? (y/n): `);
        if (!useTunnel) {
          log(`\n  ${c.yellow('⚠')} No public URL configured. Webhook will only be accessible locally.\n`);
        } else {
          const find = deps.findCloudflared ?? findCloudflared;
          const cloudflaredPath = await find();
          if (!cloudflaredPath) {
            cloudflaredMissing();
            return;
          }
          tunnel = deps.createTunnel ? deps.createTunnel(cloudflaredPath) : createTunnelManager(cloudflaredPath);
        }
      }
    } finally {
      rl.close();
    }
  } else if (opts.tunnel && !publicUrl) {
    // Explicit --tunnel flag: skip prompt
    const find = deps.findCloudflared ?? findCloudflared;
    const cloudflaredPath = await find();
    if (!cloudflaredPath) {
      cloudflaredMissing();
      return;
    }
    tunnel = deps.createTunnel ? deps.createTunnel(cloudflaredPath) : createTunnelManager(cloudflaredPath);
  }
  // If publicUrl is set via --url, no tunnel needed

  // Bind the receiver before starting any tunnel. This makes port conflicts
  // fail before tunnel creation and guarantees the tunnel has a live origin.
  const storageType = opts.storage ?? 'auto';
  const storageFactory = deps.storageFactory ?? createStorage;
  const storage = await storageFactory(storageType);
  const serverFactory = deps.serverFactory ?? createWebhookServer;
  // Audit WP07: explicit bind interface — loopback by default; a wide bind
  // is a conscious choice the user typed.
  const bindHost = opts.host?.trim() || '127.0.0.1';
  // Audit WP02: instance identity + control token — `webhook stop` verifies
  // these against the receiver's control route and triggers THIS process's
  // graceful shutdown instead of signalling a possibly-reused PID.
  const instanceId = randomUUID();
  const controlToken = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  // Assigned to the real shutdown routine once it exists (declared later);
  // the control route may fire before Step 7 in principle.
  let gracefulShutdown: (() => void | Promise<void>) | null = null;
  const webhookServer: WebhookServerResult = serverFactory(storage, {
    port,
    apiKey,
    host: bindHost,
    forwardTo: opts.forwardTo,
    forwardHeaders: opts.forwardHeaders,
    control: {
      instanceId,
      controlToken,
      onShutdown: () => gracefulShutdown?.(),
    },
  });
  try {
    await webhookServer.start();
  } catch (err) {
    log(`  ${c.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`);
    storage.close();
    exit(1);
    return;
  }

  // ── Step 3: Start tunnel if needed ───────────────────────────────────
  if (tunnel) {
    const manager = tunnel;
    log(`\n  ${c.bold('Starting Cloudflare Tunnel...')}`);
    try {
      publicUrl = await startTunnelWithRetry((localPort) => manager.start(localPort), port);
      log(`  ${c.green('✓')} Tunnel established: ${c.cyan(publicUrl)}`);
    } catch (err) {
      log(`\n  ${c.red('✗')} Tunnel failed: ${err instanceof Error ? err.message : String(err)}\n`);
      await webhookServer.stop().catch(() => undefined);
      storage.close();
      exit(1);
      return;
    }
  }

  if (publicUrl) {
    try {
      const probe = await (deps.probeWebhook ?? probeWebhookUrl)(computeWebhookRouteUrls(publicUrl).customerQr);
      log(`  ${c.green('✓')} Public customer-KHQR route verified (capture ${probe.id})`);
    } catch (err) {
      log(`\n  ${c.red('✗')} Public webhook readiness probe failed: ${err instanceof Error ? err.message : String(err)}\n`);
      if (tunnel?.isRunning) await tunnel.stop().catch(() => undefined);
      await webhookServer.stop().catch(() => undefined);
      storage.close();
      exit(1);
      return;
    }
  }

  // ── Step 4: Compute webhook URL ──────────────────────────────────────
  const webhookUrl = computeWebhookUrl(publicUrl, port);
  const routeUrls = publicUrl ? computeWebhookRouteUrls(publicUrl) : {
    baseUrl: `http://localhost:${port}`,
    online: webhookUrl,
    customerQr: `http://localhost:${port}/aba-payway-khqr-webhook`,
    pushback: `http://localhost:${port}/aba-payway-pushback`,
  };

  // ── Step 5: Persist tunnel URL to .env as PAYWAY_CALLBACK_URL ──────
  let previousCallbackUrl: string | null = null; // Save original value to restore on shutdown
  if (publicUrl) {
    const result = upsertEnvCallbackUrl(readFile, writeFile, envFile, webhookUrl);
    previousCallbackUrl = result.previous;
    // Also set in process.env so subsequent commands in the same session pick it up
    process.env.PAYWAY_CALLBACK_URL = webhookUrl;
    log(`  ${c.green('✓')} Saved callback URL to .env as ${c.cyan(`PAYWAY_CALLBACK_URL=${webhookUrl}`)}`);
    log('');
  }

  // ── Step 5b: journaling onboarding (I-7) ─────────────────────────────────
  if (opts.journal) {
    const appended = appendEnvVar(envFile, process.env, 'PAYWAY_JOURNAL', '1');
    log(
      `  ${appended.action === 'kept' ? c.dim('PAYWAY_JOURNAL already set in .env') : `${c.green('✓')} Appended PAYWAY_JOURNAL=1 to .env`}`,
    );
    log(`  ${c.dim('Callbacks will now emit callback.received journal events — journal reconcile works out of the box.')}`);
    log('');
  }

  writeLifecycleState({
    version: 2,
    instanceId,
    controlToken,
    pid: process.pid,
    port,
    host: bindHost,
    publicBaseUrl: publicUrl,
    callbackUrl: publicUrl ? webhookUrl : null,
    previousCallbackUrl,
    startedAt: new Date().toISOString(),
  });

  // ── Step 6: Display webhook URL and instructions ─────────────────────
  log('');
  log(`  ${c.bold('Webhook endpoint:')}`);
  log(`    ${c.cyan(webhookUrl)}`);
  log(`  ${c.dim('The same listener also serves:')}`);
  log(`    ${c.dim(`${routeUrls.customerQr} — offline KHQR and customer QR notifications`)}`);
  log(`    ${c.dim(`${routeUrls.pushback} — payment-link pushbacks (use as the link's return_url; no hash — verify via check-transaction)`)}`);
  if (opts.forwardTo) {
    log('');
    log(`  ${c.bold('Forwarding captured callbacks to:')}`);
    log(`    ${c.cyan(opts.forwardTo)}`);
    if (opts.forwardHeaders) {
      log(`    ${c.dim(`with headers: ${opts.forwardHeaders}`)}`);
    }
    log(`  ${c.dim('Every captured delivery (all three routes) is re-POSTed there after capture.')}`);
    log(`  ${c.dim('Combine with: payway-sdk webhook trigger payment.approved')}`);
  }
  log('');

  if (publicUrl) {
    log(`  ${c.bold('Configure this URL in the PayWay Merchant Dashboard:')}`);
    log(`    ${c.dim(publicUrl)}`);
    log('');
  } else {
    log(`  ${c.yellow('⚠')} No public URL configured.`);
    log(`  ${c.dim('The webhook is only accessible on localhost. Use --url or --tunnel for public access.')}`);
    log('');
  }

  // ── Step 7: Set up graceful shutdown (WH-REQ-08, WH-TC-06) ──────────
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`\n  ${c.bold('Shutting down...')}`);

    if (tunnel?.isRunning) {
      await tunnel.stop();
    }

    // Restore the original callback URL (or remove if there was none)
    if (previousCallbackUrl !== null) {
      if (restoreEnvCallbackUrl(readFile, writeFile, envFile, previousCallbackUrl) !== 'no-op') {
        process.env.PAYWAY_CALLBACK_URL = previousCallbackUrl;
        log(`  ${c.dim('○')} Restored original PAYWAY_CALLBACK_URL in .env`);
      }
    } else if (publicUrl) {
      // We wrote the URL ourselves — remove it since the tunnel is dead
      if (restoreEnvCallbackUrl(readFile, writeFile, envFile, null) !== 'no-op') {
        delete process.env.PAYWAY_CALLBACK_URL;
        log(`  ${c.dim('○')} Removed PAYWAY_CALLBACK_URL from .env (tunnel stopped)`);
      }
    }

    await webhookServer.stop();
    storage.close();
    clearLifecycleState();
    exit(0);
  };

  // Audit WP02: the control route's authenticated shutdown triggers THIS
  // graceful path (tunnel stop, .env restore, listener close) — never a signal.
  gracefulShutdown = shutdown;

  const register = deps.registerSignal ?? ((signal, handler) => process.on(signal, handler));
  register('SIGINT', () => {
    shutdown().catch(() => process.exit(1));
  });
  register('SIGTERM', () => {
    shutdown().catch(() => process.exit(1));
  });

}
