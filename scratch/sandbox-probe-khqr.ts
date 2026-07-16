/** Read-only sandbox probe for the KHQR merchant-reference lookup endpoint. */

import crypto from 'node:crypto';

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const PATH = '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref';

if (!MERCHANT_ID || !API_KEY) {
  console.error('Missing credentials. Set PAYWAY_MERCHANT_ID and PAYWAY_API_KEY before running this probe.');
  process.exit(1);
}

function requestTime(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

async function send(reqTime: string, merchantRef: string, hash: string, label: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_time: reqTime, merchant_id: MERCHANT_ID, merchant_ref: merchantRef, hash }),
  });
  const body = await response.text();
  console.log(`\n[${label}]`);
  console.log(`  HTTP: ${response.status} ${response.statusText}`);
  console.log(`  Body: ${body.slice(0, 500)}`);
}

async function main(): Promise<void> {
  const reqTime = requestTime();
  const merchantRef = 'SDK-KHQR-PROBE-NOT-FOUND';
  const hash = crypto.createHmac('sha512', API_KEY).update(`${reqTime}${MERCHANT_ID}${merchantRef}`).digest('base64');
  console.log('ABA PayWay KHQR sandbox probe');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Path: ${PATH}`);
  await send(reqTime, merchantRef, hash, 'Correct HMAC-SHA512 signature');
  await send(reqTime, merchantRef, 'invalid-probe-hash', 'Deliberately invalid signature');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});