/** Probe the HTTP status used for deliberately invalid hashes on checkout lookup endpoints. */

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';

if (!MERCHANT_ID || !API_KEY) {
  console.error('Missing credentials. Set PAYWAY_MERCHANT_ID and PAYWAY_API_KEY before running this probe.');
  process.exit(1);
}

function requestTime(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

async function probe(label: string, path: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_time: requestTime(), merchant_id: MERCHANT_ID, tran_id: 'SDK-CHECKOUT-PROBE-NOT-FOUND', hash: 'invalid-probe-hash' }),
  });
  console.log(`\n[${label}]`);
  console.log(`  HTTP: ${response.status} ${response.statusText}`);
  console.log(`  Body: ${(await response.text()).slice(0, 500)}`);
}

async function main(): Promise<void> {
  console.log('ABA PayWay checkout invalid-hash status probe');
  await probe('check-transaction-2', '/api/payment-gateway/v1/payments/check-transaction-2');
  await probe('close-transaction', '/api/payment-gateway/v1/payments/close-transaction');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});