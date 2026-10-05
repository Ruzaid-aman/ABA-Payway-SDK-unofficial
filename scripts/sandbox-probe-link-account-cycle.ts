/**
 * Link-account full-cycle probe (2026-09-12 COF audit, `.scratch/cof-full-cycle-audit/`).
 *
 * What this rig does:
 *   1. Starts the SDK's OWN webhook server (createWebhookServer — the same
 *      code path `setup-webhook` uses) + a cloudflared quick tunnel. This is
 *      the `callback_url` the gateway POSTs the `pwt` token to. The server
 *      now persists signature-verified tokens to
 *      payway-data/linked-tokens.json (token-store.ts) — this rig is the
 *      live proof of that capture path.
 *   2. Calls `credentialsOnFile.linkAccount()` and prints the full JSON
 *      response (Q18: the link-account RESPONSE field set is also under-
 *      documented — keep everything on disk).
 *   3. Extracts `data.qr_string`, renders it to PNG, and serves a small HTML
 *      page (http://127.0.0.1:<qrPort>) presenting the QR + deeplink so a
 *      human can scan/approve with the ABA Mobile sandbox app. The QR
 *      expires in ~10 minutes.
 *   4. Watches for the link callback; when the token lands it prints the
 *      follow-on `cof charge` command (token resolvable via --ctid).
 *
 * All captures append to test-output/cof-account-review/captures.jsonl.
 *
 *   PAYWAY_TLS_CA_FILE="$PWD/payway-sandbox-ca.pem" npx tsx scripts/sandbox-probe-link-account-cycle.ts \
 *     [--ctid cust0001] [--token-flag CITI_FLEX] [--request-id reqXXXX]
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';
import { createWebhookServer, type WebhookServerResult } from '../src/webhook/server.js';
import { JsonWebhookStorage } from '../src/webhook/storage-json.js';
import { latestTokenForCtid, loadLinkedTokens } from '../src/webhook/token-store.js';
import { createTunnelManager, findCloudflared } from '../src/webhook/tunnel.js';

loadDotEnvIntoProcess(process.cwd());

const OUT_DIR = resolve(process.cwd(), 'test-output/cof-account-review');
const CAPTURES = resolve(OUT_DIR, 'captures.jsonl');
const RECEIVER_PORT = 8794;
const QR_PORT = 8795;

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CTID = opt('--ctid', `custacct${Date.now().toString(36).slice(-4)}`);
const TOKEN_FLAG = opt('--token-flag', 'CITI_FLEX');
const REQUEST_ID = opt('--request-id', `la${Date.now().toString(36)}`);

function recordCapture(rec: Record<string, unknown>): void {
  appendFileSync(CAPTURES, `${JSON.stringify(rec)}\n`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1) The SDK's own webhook server + tunnel = callback_url
  const storage = new JsonWebhookStorage(resolve(OUT_DIR, 'callbacks.jsonl'));
  const receiver: WebhookServerResult = createWebhookServer(storage, {
    port: RECEIVER_PORT,
    quiet: false,
    tokenStoreDir: resolve(process.cwd(), 'payway-data'),
  });
  await receiver.start();
  console.log(`SDK webhook receiver listening on http://127.0.0.1:${RECEIVER_PORT}`);

  const cloudflared = await findCloudflared();
  if (!cloudflared) throw new Error('cloudflared not found in PATH');
  const tunnel = createTunnelManager(cloudflared);
  const publicUrl = await tunnel.start(RECEIVER_PORT);
  const callbackUrl = `${publicUrl}/aba-payway-webhook`;
  console.log(`tunnel up: ${publicUrl}`);
  console.log(`callback_url: ${callbackUrl}`);

  // 2) Call linkAccount
  const payway = new PayWay();
  const result = await payway.credentialsOnFile.linkAccount({
    requestId: REQUEST_ID,
    ctid: CTID,
    tokenFlag: TOKEN_FLAG as 'CITI_FLEX' | 'CITO_FLEX',
    currency: 'USD',
    callbackUrl,
  });
  const full = JSON.stringify(result, null, 2);
  writeFileSync(resolve(OUT_DIR, `link-account-response-${REQUEST_ID}.json`), full, 'utf8');
  console.log('\n=== linkAccount response ===');
  console.log(full);
  recordCapture({ at: new Date().toISOString(), kind: 'link-account-response', requestId: REQUEST_ID, ctid: CTID, result });

  const data = (result as { data?: { qr_string?: string; deeplink?: string } }).data ?? {};
  if (!data.qr_string) {
    console.log('\nNo qr_string in the response — inspect the saved JSON. Status above may report an error (e.g. 104).');
  } else {
    // 3) QR PNG + presentation page
    const pngPath = resolve(OUT_DIR, `link-account-qr-${REQUEST_ID}.png`);
    await QRCode.toFile(pngPath, data.qr_string, { width: 512, margin: 2 });
    const deeplink = data.deeplink ?? `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(data.qr_string)}`;
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>ABA PayWay — Link Account ${CTID}</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;flex-direction:column;align-items:center;gap:1rem;padding:2rem}
img{background:#fff;border-radius:12px;padding:16px}code{background:#1e293b;padding:.5rem;border-radius:6px;max-width:90vw;overflow-wrap:anywhere}</style></head>
<body><h1>Scan with ABA Mobile (sandbox)</h1>
<img src="link-account-qr-${REQUEST_ID}.png" width="420" alt="link-account QR">
<p>Request: <code>${REQUEST_ID}</code> · CTID: <code>${CTID}</code> · flag <code>${TOKEN_FLAG}</code></p>
<p>Deeplink: <code>${deeplink}</code></p>
<p style="color:#94a3b8">QR expires in ~10 minutes. Approve the link; the pwt token arrives at the webhook receiver.</p>
</body></html>`;
    writeFileSync(resolve(OUT_DIR, `link-account-qr-${REQUEST_ID}.html`), page, 'utf8');
    const qrServer = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }
      try {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(readFileSync(resolve(OUT_DIR, url.pathname.replace(/^\/+/, ''))));
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    await new Promise<void>((r) => qrServer.listen(QR_PORT, '127.0.0.1', r));
    console.log(`\nQR page: http://127.0.0.1:${QR_PORT}/  (PNG: ${pngPath})`);
    console.log(`deeplink: ${deeplink}`);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  Request ID: ${REQUEST_ID}`);
  console.log(`  CTID:       ${CTID}`);
  console.log('  NEXT: scan/approve the QR with ABA Mobile sandbox.');
  console.log('  The webhook receiver persists the pwt to');
  console.log('  payway-data/linked-tokens.json — inspect with:');
  console.log('    payway-sdk cof token list');
  console.log('  Then charge with:');
  console.log(`    payway-sdk cof charge -t <tran-id> -a 4.50 --ctid ${CTID} --token-flag MITU_FLEX`);
  console.log('════════════════════════════════════════════════════════');
  console.log('waiting for the COF link callback… (Ctrl-C stops the tunnel)');

  // The callback's ctid echo is unverified (Q18) — watch for ANY new token
  // in the store, not just one keyed to this ctid.
  const knownAtStart = new Set(loadLinkedTokens(resolve(process.cwd(), 'payway-data')).map((t) => `${t.ctid}:${t.pwt}`));
  const poll = setInterval(() => {
    const fresh = loadLinkedTokens(resolve(process.cwd(), 'payway-data')).filter((t) => !knownAtStart.has(`${t.ctid}:${t.pwt}`));
    if (fresh.length > 0) {
      console.log('\n★★★ TOKEN CAPTURED — the linked-token store now holds:');
      console.log(JSON.stringify(fresh, null, 2));
      console.log(`\nCheck it: payway-sdk cof token list${fresh[0].ctid !== 'unknown-ctid' ? ` -c ${fresh[0].ctid}` : ''}`);
      recordCapture({ at: new Date().toISOString(), kind: 'token-captured', ctid: CTID, tokens: fresh });
      clearInterval(poll);
    }
  }, 2000);

  process.on('SIGINT', () => {
    console.log('\nstopping…');
    void tunnel.stop().then(() => {
      receiver.stop();
      storage.close();
      process.exit(0);
    });
  });
}

main().catch((e) => {
  console.error('rig crashed:', e);
  process.exitCode = 1;
});
