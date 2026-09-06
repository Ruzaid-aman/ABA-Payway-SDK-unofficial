/**
 * V-4 final leg: post-expiry behavior of the +5min sweep link.
 *
 * The sweep created a link with expired_date = now+300s; by the time this
 * runs, it has expired. Capture (a) what detail reports (status? still OPEN?
 * expired_date echo?) and (b) what the hosted payment_link URL answers on a
 * plain GET — refused / expired-page / still open?
 *
 *   npx tsx scripts/sandbox-probe-payment-link-after-expiry.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';

loadDotEnvIntoProcess(process.cwd());

const OUT_DIR = resolve(process.cwd(), 'test-output/payment-link-docs-review');

async function main(): Promise<void> {
  const payway = new PayWay();

  // Create a fresh +300s link so the timing is under our control, wait it out,
  // then observe. 300s is the shortest ACCEPTED offset per the sweep.
  const created = await payway.paymentLink.create({
    title: 'PLVR V-4 post-expiry observation',
    amount: 2,
    currency: 'USD',
    merchantRefNo: `plvr-v4-final-${Date.now().toString(36)}`,
    returnUrl: 'https://merchant.example/payway/pushback',
    expiredDate: Math.floor(Date.now() / 1000) + 300,
  });
  const data = created.data as Record<string, unknown> | undefined;
  const id = data?.id as string | undefined;
  const hostedUrl = data?.payment_link as string | undefined;
  const expiredAt = data?.expired_date as number | undefined;
  console.log(`created id=${id} hosted=${hostedUrl} expired_date=${JSON.stringify(expiredAt)} (type ${typeof expiredAt})`);

  // Pre-expiry baseline of the hosted page.
  const pre = await fetch(hostedUrl, { redirect: 'manual' });
  const preBody = (await pre.text()).slice(0, 200).replace(/\s+/g, ' ');
  console.log(`[pre-expiry hosted GET] HTTP ${pre.status} ct=${pre.headers.get('content-type')} body[:200]=${preBody}`);

  const waitMs = (expiredAt as number) * 1000 - Date.now() + 20000;
  console.log(`waiting ${Math.round(waitMs / 1000)}s for expiry…`);
  await new Promise((r) => setTimeout(r, waitMs));

  const details = await payway.paymentLink.getDetails(id);
  const d = details.data as Record<string, unknown> | undefined;
  console.log(
    `[post-expiry detail] status=${JSON.stringify(d?.status)} expired_date=${JSON.stringify(d?.expired_date)} total_trxn=${JSON.stringify(d?.total_trxn)}`,
  );

  const post = await fetch(hostedUrl, { redirect: 'manual' });
  const postBody = (await post.text()).slice(0, 400).replace(/\s+/g, ' ');
  console.log(`[post-expiry hosted GET] HTTP ${post.status} ct=${post.headers.get('content-type')} body[:400]=${postBody}`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, `after-expiry-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        linkId: id,
        hostedUrl,
        expiredDate: expiredAt,
        preExpiry: { http: pre.status, bodyFirst200: preBody },
        postExpiryDetail: { status: d?.status, expiredDate: d?.expired_date, totalTrxn: d?.total_trxn, raw: d },
        postExpiryHosted: { http: post.status, bodyFirst400: postBody },
      },
      null,
      2,
    ),
  );
  console.log('evidence written');
}

main().catch((e) => {
  console.error('probe crashed:', e);
  process.exitCode = 1;
});
