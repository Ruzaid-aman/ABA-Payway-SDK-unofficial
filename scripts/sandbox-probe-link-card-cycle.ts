/**
 * Link-card full-cycle probe (2026-09-12 review, `.scratch/link-card-review/REVIEW-CARD.md`).
 *
 * What this rig does:
 *   1. Starts a raw-capture HTTP receiver + cloudflared quick tunnel — this is
 *      the `callback_url` the gateway POSTs the `pwt` token to (the ONLY way
 *      the token is delivered; the link-card response itself never carries it).
 *   2. Renders the SDK's signed link-card browser form (`getLinkCardFormHtml`,
 *      autoSubmit) into the output dir and serves the dir over
 *      http://127.0.0.1:<formPort> so a browser (or the in-app browser) can
 *      complete the card entry with the sandbox test cards
 *      (`payway-sdk sandbox-test-cards`).
 *   3. Reproduces the browser POST server-side with redirect:'manual' fetch and
 *      DECODES the `302 Location: /add-card/<base64>` payload — the hosted
 *      page's real result (error or card-entry handoff) travels in that
 *      redirect target, which Node fetch silently follows and discards.
 *   4. Watches captures; when the COF callback lands it prints the full raw
 *      record, verifies the X-PAYWAY-HMAC-SHA512 signature via
 *      verifyCallbackDetailed, and extracts `pwt` if present, printing the
 *      follow-on `cof charge` / token-lifecycle commands.
 *
 * All captures append to
 * test-output/link-card-review/cycle-captures.jsonl (one JSON record per
 * request). Ctrl-C stops the tunnel; the file persists.
 *
 *   npx tsx scripts/sandbox-probe-link-card-cycle.ts [--ctid revcard01] [--frequency 1M]
 *
 * Requires PAYWAY_TLS_CA_FILE="$PWD/payway-sandbox-ca.pem" scoped to the command (sandbox TLS; regenerate the gitignored bundle with node scripts/extract-sandbox-ca.mjs).
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { verifyCallbackDetailed } from '../src/auth.js';
import { BASE_URLS, ENDPOINTS } from '../src/constants.js';
import { PayWay } from '../src/client.js';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { createTunnelManager, findCloudflared } from '../src/webhook/tunnel.js';

loadDotEnvIntoProcess(process.cwd());

const OUT_DIR = resolve(process.cwd(), 'test-output/link-card-review');
const CAPTURES = resolve(OUT_DIR, 'cycle-captures.jsonl');
const PORT = 8792;
const FORM_PORT = 8793;

const args = process.argv.slice(2);
const opt = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CTID = opt('--ctid', `revcard${Date.now().toString(36).slice(-4)}`);
const FREQUENCY = opt('--frequency', '1M');
const TOKEN_FLAG = opt('--token-flag', 'CITI_FLEX');
const REQUEST_ID = opt('--request-id', `lc${Date.now().toString(36)}`);
const CONTINUE_SUCCESS_URL = opt('--continue-url', 'https://example.com/link-card-done');

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
  console.log('body:', rec.body);
  if (rec.body) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rec.body) as Record<string, unknown>;
    } catch {
      /* not JSON — also a finding */
    }
    if (parsed) {
      console.log(`>>> keys: ${Object.keys(parsed).join(', ')}`);
      console.log(`>>> pwt present: ${typeof parsed.pwt === 'string' && parsed.pwt.length > 0}`);
      const sig = rec.headers['x-payway-hmac-sha512'];
      if (typeof sig === 'string') {
        const verdict = verifyCallbackDetailed(rec.body, sig, { stripHash: true });
        console.log(`>>> signature verdict: ${JSON.stringify(verdict)}`);
      } else {
        console.log('>>> X-PAYWAY-HMAC-SHA512 header ABSENT (note which auth field the body carries)');
      }
    }
  }
}

/** Decode a `/add-card/<base64>` Location target into its JSON payload. */
function decodeAddCardLocation(location: string | null): unknown {
  if (!location) return null;
  const marker = '/add-card/';
  const idx = location.indexOf(marker);
  if (idx < 0) return { notAddCard: location };
  try {
    return JSON.parse(Buffer.from(location.slice(idx + marker.length), 'base64').toString('utf8'));
  } catch {
    return { undecodable: location };
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1) Raw-capture receiver (callback_url target)
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      recordRequest({
        at: new Date().toISOString(),
        method: req.method ?? '?',
        url: req.url ?? '?',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8') || null,
      });
      // Always ACK — the gateway must see a 200 or it may drop the delivery.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ acknowledged: true }));
    });
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
  console.log(`receiver listening on http://127.0.0.1:${PORT} (captures → ${CAPTURES})`);

  // 2) Public tunnel for the callback
  const cloudflared = await findCloudflared();
  if (!cloudflared) throw new Error('cloudflared not found in PATH');
  const tunnel = createTunnelManager(cloudflared);
  const publicUrl = await tunnel.start(PORT);
  const callbackUrl = `${publicUrl}/link-card-callback`;
  console.log(`tunnel up: ${publicUrl}`);
  console.log(`callback_url: ${callbackUrl}`);

  // 3) Signed form (browser path) + local static server so a browser can open it
  const payway = new PayWay();
  const formHtml = payway.credentialsOnFile.getLinkCardFormHtml(
    {
      requestId: REQUEST_ID,
      ctid: CTID,
      tokenFlag: TOKEN_FLAG as 'CITI_FLEX' | 'CITO_FLEX',
      currency: 'USD',
      frequency: FREQUENCY as '1W' | '1M' | '2M',
      callbackUrl,
      continueSuccessUrl: CONTINUE_SUCCESS_URL,
    },
    { autoSubmit: true },
  );
  const formPath = resolve(OUT_DIR, `form-${REQUEST_ID}.html`);
  writeFileSync(formPath, formHtml, 'utf8');
  const staticServer = createServer(async (req, res) => {
    try {
      const body = readFileSync(resolve(OUT_DIR, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).replace(/^\/+/, '') || `form-${REQUEST_ID}.html`));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((r) => staticServer.listen(FORM_PORT, '127.0.0.1', r));
  console.log(`form served: http://127.0.0.1:${FORM_PORT}/form-${REQUEST_ID}.html  (${formPath})`);

  // 4) Server-side replay of the browser POST with redirect:'manual' — decodes
  //    the hosted result from the 302 Location (invisible to the SDK today).
  const hiddenFields = [...formHtml.matchAll(/name="([a-z_]+)" value="([^"]*)"/g)].map(
    (m) => [m[1], m[2]] as const,
  );
  const endpoint = `${BASE_URLS.sandbox}${ENDPOINTS.linkCard}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(hiddenFields.map(([k, v]) => [k, v])).toString(),
    redirect: 'manual',
  });
  console.log(`\nAPI-path POST ${endpoint}`);
  console.log(`  HTTP ${res.status}`);
  const payload = decodeAddCardLocation(res.headers.get('location'));
  console.log(`  /add-card payload: ${JSON.stringify(payload, null, 2)}`);
  console.log('  (the SDK follows this redirect silently and keeps only the 42 KB shell)');

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  Request ID: ${REQUEST_ID}`);
  console.log(`  CTID:       ${CTID}`);
  console.log('  NEXT: open the form URL above in a browser and complete the');
  console.log('  card entry with a sandbox test card (payway-sdk sandbox-test-cards).');
  console.log('  When the callback lands here, charge with:');
  console.log(`    payway-sdk cof charge -t <tran-id> -a 4.50 --token <pwt> --ctid ${CTID} --token-flag MITU_FLEX`);
  console.log('════════════════════════════════════════════════════════\n');
  console.log('waiting for the COF callback… (Ctrl-C stops the tunnel; captures persist)');

  process.on('SIGINT', () => {
    console.log('\nstopping tunnel…');
    void tunnel.stop().then(() => {
      server.close();
      staticServer.close();
      process.exit(0);
    });
  });
}

main().catch((e) => {
  console.error('rig crashed:', e);
  process.exitCode = 1;
});
