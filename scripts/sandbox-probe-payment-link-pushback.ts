/**
 * V-1 probe: capture a REAL payment-link pushback (plan Batch-A item).
 *
 * What this rig does:
 *   1. Starts a raw-capture HTTP receiver on 127.0.0.1:<port> — it records
 *      EVERY request (method, path, all headers, raw body string, timestamp)
 *      and answers 200. No assumptions: hash presence is exactly what we're
 *      trying to observe.
 *   2. Starts a cloudflared quick tunnel (trycloudflare.com) via the SDK's
 *      TunnelManager and prints the public URL.
 *   3. Creates a payment link whose returnUrl is the tunneled receiver URL
 *      and prints the shareable payment_link URL for the user to PAY.
 *   4. Watches the capture file; when a pushback lands, it prints the FULL
 *      raw request, checks `hash` presence, and verifies the payment via
 *      check-transaction.
 *
 * All captures append to test-output/payment-link-docs-review/pushback-captures.jsonl
 * (one JSON record per request). Ctrl-C stops the tunnel; the file persists.
 *
 *   npx tsx scripts/sandbox-probe-payment-link-pushback.ts
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';
import { createTunnelManager, findCloudflared } from '../src/webhook/tunnel.js';

loadDotEnvIntoProcess(process.cwd());

const OUT_DIR = resolve(process.cwd(), 'test-output/payment-link-docs-review');
const CAPTURES = resolve(OUT_DIR, 'pushback-captures.jsonl');
const PORT = 8788;

interface CaptureRecord {
  at: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string | null;
}

function recordRequest(rec: CaptureRecord): void {
  appendFileSync(CAPTURES, JSON.stringify(rec) + '\n');
  console.log(`\n=== CAPTURED ${rec.method} ${rec.url} at ${rec.at} ===`);
  console.log('headers:', JSON.stringify(rec.headers, null, 2));
  if (rec.body !== null) console.log('body:', rec.body);
  if (rec.body) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rec.body) as Record<string, unknown>;
    } catch {
      /* not JSON — also a finding */
    }
    if (parsed) {
      const hasHash = Object.prototype.hasOwnProperty.call(parsed, 'hash');
      console.log(`\n>>> hash field present: ${hasHash}`);
      console.log(`>>> parsed keys: ${Object.keys(parsed).join(', ')}`);
    } else {
      console.log('\n>>> body is NOT JSON');
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1) Raw-capture receiver
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rec: CaptureRecord = {
        at: new Date().toISOString(),
        method: req.method ?? '?',
        url: req.url ?? '?',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8') || null,
      };
      recordRequest(rec);
      // Always ACK — the gateway must see a 200 or it may retry/drop.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ acknowledged: true }));
    });
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
  console.log(`receiver listening on http://127.0.0.1:${PORT} (captures → ${CAPTURES})`);

  // 2) Public tunnel
  const cloudflared = await findCloudflared();
  if (!cloudflared) throw new Error('cloudflared not found in PATH');
  const tunnel = createTunnelManager(cloudflared);
  const publicUrl = await tunnel.start(PORT);
  console.log(`tunnel up: ${publicUrl}`);

  // 3) Create the link pointing at the tunneled receiver
  const payway = new PayWay();
  const receiverUrl = `${publicUrl}/pushback`;
  const stamp = Date.now().toString(36);
  const link = await payway.paymentLink.create({
    title: 'V-1 pushback capture — pay this link',
    amount: 1.5,
    currency: 'USD',
    merchantRefNo: `plvr-v1-${stamp}`,
    returnUrl: receiverUrl,
    description: 'docs-review probe V-1: capture the pushback body',
  });
  const data = link.data as Record<string, unknown> | undefined;
  const shareUrl = data?.payment_link as string | undefined;
  const linkId = data?.id as string | undefined;
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  Link ID:   ${linkId}`);
  console.log(`  Amount:    1.50 USD`);
  console.log(`  Receiver:  ${receiverUrl}`);
  console.log(`\n  PAY THIS LINK (browser or ABA Mobile Simulator):`);
  console.log(`  ${shareUrl}`);
  console.log('════════════════════════════════════════════════════════\n');
  console.log('waiting for the pushback… (Ctrl-C stops the tunnel; captures persist)');

  // 4) Watch loop: when a capture lands, verify the payment and summarize.
  let lastSize = 0;
  const watcher = setInterval(async () => {
    let content = '';
    try {
      content = readFileSync(CAPTURES, 'utf8');
    } catch {
      return; // no captures yet
    }
    if (content.length > lastSize) {
      lastSize = content.length;
      const lines = content.trim().split('\n');
      const last = JSON.parse(lines[lines.length - 1] ?? '{}') as CaptureRecord;
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(last.body ?? '');
      } catch {
        parsed = null;
      }
      const tranId = parsed?.tran_id;
      if (tranId) {
        try {
          const check = await payway.checkout.checkTransaction(String(tranId));
          const cd = check.data as Record<string, unknown> | undefined;
          console.log(
            `\n[verification] check-transaction(${String(tranId)}): payment_status=${JSON.stringify(cd?.payment_status)} amount=${JSON.stringify(cd?.payment_amount)}`,
          );
          console.log('\n[V-1 CAPTURED] pushback observed + payment verified. Evidence saved. You can Ctrl-C.');
        } catch (error) {
          console.log(`[verification] check-transaction threw: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }, 3000);
  watcher.unref?.();

  // Keep the process alive until Ctrl-C.
  process.on('SIGINT', () => {
    console.log('\nstopping tunnel…');
    void tunnel.stop().then(() => {
      server.close();
      process.exit(0);
    });
  });
}

main().catch((e) => {
  console.error('rig crashed:', e);
  process.exitCode = 1;
});
