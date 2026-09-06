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
import path from 'node:path';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { createWebhookServer, type WebhookServerResult } from '../../webhook/server.js';
import { createStorage, type StorageType } from '../../webhook/storage-factory.js';
import { createTunnelManager, findCloudflared, type TunnelManager } from '../../webhook/tunnel.js';
import { appendEnvVar } from './onboard-helpers.js';
import {
  cloudflaredMissingLines,
  computeWebhookUrl,
  restoreEnvCallbackUrl,
  upsertEnvCallbackUrl,
  validatePort,
} from './setup-webhook-helpers.js';

// ---------------------------------------------------------------------------
// ANSI helpers (matching cli.ts conventions)
// ---------------------------------------------------------------------------
const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

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

  // ── Step 3: Start tunnel if needed ───────────────────────────────────
  if (tunnel) {
    log(`\n  ${c.bold('Starting Cloudflare Tunnel...')}`);
    try {
      publicUrl = await tunnel.start(port);
      log(`  ${c.green('✓')} Tunnel established: ${c.cyan(publicUrl)}`);
    } catch (err) {
      log(`\n  ${c.red('✗')} Tunnel failed: ${err instanceof Error ? err.message : String(err)}\n`);
      exit(1);
      return;
    }
  }

  // ── Step 4: Compute webhook URL ──────────────────────────────────────
  const webhookUrl = computeWebhookUrl(publicUrl, port);

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

  // ── Step 6: Display webhook URL and instructions ─────────────────────
  log('');
  log(`  ${c.bold('Webhook endpoint:')}`);
  log(`    ${c.cyan(webhookUrl)}`);
  log(`  ${c.dim('The same listener also serves:')}`);
  log(`    ${c.dim(`${webhookUrl.replace(/\/$/, '')}/aba-payway-khqr-webhook — offline KHQR notifications`)}`);
  log(`    ${c.dim(`${webhookUrl.replace(/\/$/, '')}/aba-payway-pushback — payment-link pushbacks (use as the link's return_url; no hash — verify via check-transaction)`)}`);
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

  // ── Step 7: Start webhook server ─────────────────────────────────────
  const storageType = opts.storage ?? 'auto';
  const storageFactory = deps.storageFactory ?? createStorage;
  const storage = await storageFactory(storageType);
  const serverFactory = deps.serverFactory ?? createWebhookServer;
  const webhookServer: WebhookServerResult = serverFactory(storage, {
    port,
    apiKey,
  });

  // ── Step 8: Set up graceful shutdown (WH-REQ-08, WH-TC-06) ──────────
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
    exit(0);
  };

  const register = deps.registerSignal ?? ((signal, handler) => process.on(signal, handler));
  register('SIGINT', () => {
    shutdown().catch(() => process.exit(1));
  });
  register('SIGTERM', () => {
    shutdown().catch(() => process.exit(1));
  });

  try {
    await webhookServer.start();
  } catch (err) {
    log(`  ${c.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`);
    storage.close();
    exit(1);
    return;
  }
}
