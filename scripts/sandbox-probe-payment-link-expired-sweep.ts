/**
 * V-4c follow-up: expired_date acceptance sweep.
 *
 * Round 2 showed ±short offsets rejected with PTL04 while unset works.
 * Sweep future offsets to find the acceptance boundary: +300s, +1800s,
 * +3600s, +86400s (1 day), +604800s (1 week). Also tests string-typed
 * epoch at +86400 (the official docs declare expired_date a string).
 *
 *   npx tsx scripts/sandbox-probe-payment-link-expired-sweep.ts
 */
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { ENDPOINTS } from '../src/constants.js';

loadDotEnvIntoProcess(process.cwd());

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const PUBLIC_KEY = (process.env.PAYWAY_RSA_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');

if (!MERCHANT_ID || !API_KEY || !PUBLIC_KEY) {
  console.error('Missing credentials in .env');
  process.exitCode = 1;
  throw new Error('missing credentials');
}

function requestTime(): string {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

async function rawCreateWithExpiry(expiredDate: number | string, label: string): Promise<void> {
  const payload: Record<string, unknown> = {
    title: `PLVR V-4c sweep ${label}`,
    amount: 1,
    currency: 'USD',
    return_url: Buffer.from('https://merchant.example/payway/pushback').toString('base64'),
    merchant_ref_no: `plvr-v4c-${Date.now().toString(36)}`,
    expired_date: expiredDate,
  };
  const plaintext = Buffer.from(JSON.stringify({ mc_id: MERCHANT_ID, ...payload }), 'utf8');
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < plaintext.length; offset += 117) {
    chunks.push(crypto.publicEncrypt({ key: PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING }, plaintext.subarray(offset, offset + 117)));
  }
  const merchantAuth = Buffer.concat(chunks).toString('base64');
  const rt = requestTime();
  const hash = crypto.createHmac('sha512', API_KEY).update(rt + MERCHANT_ID + merchantAuth).digest('base64');
  const res = await fetch(`${BASE_URL}${ENDPOINTS.createPaymentLink}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request_time: rt, merchant_id: MERCHANT_ID, merchant_auth: merchantAuth, hash }),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body?.status as Record<string, unknown> | undefined;
  const data = body?.data as Record<string, unknown> | undefined;
  const expiredEcho = data ? JSON.stringify(data.expired_date) : undefined;
  const paymentLink = data ? typeof data.payment_link === 'string' ? 'yes' : 'no' : undefined;
  console.log(
    `[${label}] http=${res.status} code=${JSON.stringify(status?.code)} id=${data ? 'created' : '—'} expired_date echo=${expiredEcho} payment_link=${paymentLink}`,
  );
}

async function main(): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const cases: Array<[number | string, string]> = [
    [nowSec + 300, 'num +5min'],
    [nowSec + 1800, 'num +30min'],
    [nowSec + 3600, 'num +1h'],
    [nowSec + 86400, 'num +1d'],
    [nowSec + 604800, 'num +7d'],
    [String(nowSec + 86400), 'str +1d'],
  ];
  for (const [value, label] of cases) {
    try {
      await rawCreateWithExpiry(value, label);
    } catch (error) {
      console.log(`[${label}] FETCH THREW: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const outDir = resolve(process.cwd(), 'test-output/payment-link-docs-review');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, `expired-sweep-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`),
    `ranAt=${new Date().toISOString()}\nSee console output; cases: ${cases.map((c) => c[1]).join(', ')}`,
  );
}

main().catch((e) => {
  console.error('sweep crashed:', e);
  process.exitCode = 1;
});
