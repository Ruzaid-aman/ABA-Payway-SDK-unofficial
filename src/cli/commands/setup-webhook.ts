/**
 * `setup-webhook` CLI command — interactive webhook listener setup.
 *
 * Orchestrates the full flow:
 * 1. Ask user about public URL / Cloudflare Tunnel
 * 2. Start tunnel if needed
 * 3. Start HTTP server on configured port
 * 4. Handle graceful shutdown on Ctrl+C
 */

import readline from 'node:readline';
import { createStorage, type StorageType } from '../../webhook/storage-factory.js';
import { createWebhookServer, type WebhookServerResult } from '../../webhook/server.js';
import { createTunnelManager, findCloudflared, type TunnelManager } from '../../webhook/tunnel.js';

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
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------
function createRl(): readline.Interface {
  return readline.createInterface({
    input: process.stdin as never,
    output: process.stdout as never,
  });
}

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
export async function runSetupWebhook(opts: SetupWebhookOptions): Promise<void> {
  const port = opts.port ? Number(opts.port) : 8443;

  if (!Number.isFinite(port) || port <= 0 || port > 65535 || !Number.isInteger(port)) {
    console.log(`\n  ${c.red('✗')} Invalid port: ${c.red(opts.port ?? '')}. Must be 1-65535.\n`);
    process.exitCode = 1;
    return;
  }

  // ── Step 1: Resolve API key for signature verification ────────────────
  const apiKey = process.env.PAYWAY_API_KEY?.trim() || undefined;

  // ── Step 2: Determine public URL mode ────────────────────────────────
  let publicUrl: string | null = opts.url ?? null;
  let tunnel: TunnelManager | null = null;

  if (!publicUrl && !opts.tunnel) {
    // Interactive mode: ask the user
    const rl = createRl();
    try {
      const hasUrl = await promptConfirmation(rl, `  Do you have a public URL to receive callbacks? (y/n): `);
      if (hasUrl) {
        publicUrl = await promptQuestion(rl, `  Enter your public URL: `);
        if (!publicUrl) {
          console.log(`\n  ${c.red('✗')} No URL provided. Exiting.\n`);
          process.exitCode = 1;
          return;
        }
      } else {
        const useTunnel = await promptConfirmation(rl, `  Spin up Cloudflare Tunnel? (y/n): `);
        if (!useTunnel) {
          console.log(`\n  ${c.yellow('⚠')} No public URL configured. Webhook will only be accessible locally.\n`);
        }
        // If useTunnel, we start it below
        if (!useTunnel) {
          // Continue without tunnel — local-only mode
        } else {
          // Check cloudflared is installed
          const cloudflaredPath = await findCloudflared();
          if (!cloudflaredPath) {
            console.log(`\n  ${c.red('✗')} ${c.bold('cloudflared not found.')}`);
            console.log(`  Please install it or provide a public URL.`);
            console.log(`  Install: ${c.cyan('https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/')}`);
            console.log(`  Or use:  ${c.cyan('payway-sdk setup-webhook --url <your-public-url>')}\n`);
            process.exitCode = 1;
            return;
          }
          tunnel = createTunnelManager(cloudflaredPath);
        }
      }
    } finally {
      rl.close();
    }
  } else if (opts.tunnel && !publicUrl) {
    // Explicit --tunnel flag: skip prompt
    const cloudflaredPath = await findCloudflared();
    if (!cloudflaredPath) {
      console.log(`\n  ${c.red('✗')} ${c.bold('cloudflared not found.')}`);
      console.log(`  Please install it or provide a public URL.`);
      console.log(`  Install: ${c.cyan('https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/')}`);
      console.log(`  Or use:  ${c.cyan('payway-sdk setup-webhook --url <your-public-url>')}\n`);
      process.exitCode = 1;
      return;
    }
    tunnel = createTunnelManager(cloudflaredPath);
  }
  // If publicUrl is set via --url, no tunnel needed

  // ── Step 3: Start tunnel if needed ───────────────────────────────────
  if (tunnel) {
    console.log(`\n  ${c.bold('Starting Cloudflare Tunnel...')}`);
    try {
      publicUrl = await tunnel.start(port);
      console.log(`  ${c.green('✓')} Tunnel established: ${c.cyan(publicUrl)}`);
    } catch (err) {
      console.log(`\n  ${c.red('✗')} Tunnel failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
      return;
    }
  }

  // ── Step 4: Display webhook URL and instructions ─────────────────────
  const webhookUrl = publicUrl
    ? `${publicUrl}/aba-payway-webhook`
    : `http://localhost:${port}/aba-payway-webhook`;

  console.log();
  console.log(`  ${c.bold('Webhook endpoint:')}`);
  console.log(`    ${c.cyan(webhookUrl)}`);
  console.log();

  if (publicUrl) {
    console.log(`  ${c.bold('Configure this URL in the PayWay Merchant Dashboard:')}`);
    console.log(`    ${c.dim(publicUrl)}`);
    console.log();
  } else {
    console.log(`  ${c.yellow('⚠')} No public URL configured.`);
    console.log(`  ${c.dim('The webhook is only accessible on localhost. Use --url or --tunnel for public access.')}`);
    console.log();
  }

  // ── Step 5: Start webhook server ─────────────────────────────────────
  const storageType = opts.storage ?? 'auto';
  const storage = await createStorage(storageType);
  const webhookServer: WebhookServerResult = createWebhookServer(storage, {
    port,
    apiKey,
  });

  // ── Step 6: Set up graceful shutdown (WH-REQ-08, WH-TC-06) ──────────
  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n  ${c.bold('Shutting down...')}`);

    if (tunnel?.isRunning) {
      await tunnel.stop();
    }

    await webhookServer.stop();
    storage.close();
    process.exit(0);
  }

  process.on('SIGINT', () => {
    shutdown().catch(() => process.exit(1));
  });
  process.on('SIGTERM', () => {
    shutdown().catch(() => process.exit(1));
  });

  try {
    await webhookServer.start();
  } catch (err) {
    console.log(`  ${c.red('✗')} ${err instanceof Error ? err.message : String(err)}\n`);
    storage.close();
    process.exitCode = 1;
    return;
  }
}
