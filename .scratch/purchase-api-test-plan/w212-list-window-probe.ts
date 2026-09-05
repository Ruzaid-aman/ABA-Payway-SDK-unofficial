/**
 * W2-12 probe — transaction-list window semantics (read-only).
 *
 * Question: SDK getTransactionList({}) returned 0 rows while CLI
 * transaction-list (defaulting to the LOCAL today window) returned 32.
 * What does the gateway actually answer for:
 *   (a) no dates at all,
 *   (b) current UTC+7 gateway-day window,
 *   (c) current LOCAL-day window?
 *
 * Run from repo root:
 *   NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/w212-list-window-probe.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { PayWay } from '../../src/index.js';

const envPath = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayLabel = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const now = new Date();
const gatewayDay = dayLabel(new Date(now.getTime() + 7 * 3_600_000)); // UTC+7
const localDay = dayLabel(new Date(now.getTime() - now.getTimezoneOffset() * 60_000));

async function count(label: string, params: Record<string, unknown>): Promise<void> {
  const payway = new PayWay({
    merchantId: process.env.PAYWAY_MERCHANT_ID,
    apiKey: process.env.PAYWAY_API_KEY,
    publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
    environment: 'sandbox',
  });
  try {
    const result = (await payway.checkout.getTransactionList(
      params as never,
    )) as unknown as Record<string, unknown>;
    const rows = Array.isArray(result.data) ? result.data.length : 0;
    console.log(`${label}: ${rows} rows`);
    if (rows > 0) {
      const first = (result.data as Record<string, unknown>[])[0];
      console.log(`   first: ${first.transaction_id} ${first.payment_status} ${first.transaction_date}`);
    }
  } catch (err) {
    console.log(`${label}: ERROR ${(err as Error).message.slice(0, 160)}`);
  }
}

console.log(`local tz offset: ${-now.getTimezoneOffset() / 60}h · gateway (UTC+7) day: ${gatewayDay} · local day: ${localDay}`);
await count('(a) no dates            ', {});
await count(`(b) gateway day ${gatewayDay}  `, { fromDate: `${gatewayDay} 00:00:00`, toDate: `${gatewayDay} 23:59:59` });
await count(`(c) local day ${localDay}      `, { fromDate: `${localDay} 00:00:00`, toDate: `${localDay} 23:59:59` });
