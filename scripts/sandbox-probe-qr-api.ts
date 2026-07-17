/**
 * Sandbox probe for the PayWay QR API generate-qr endpoint.
 *
 * Usage:
 *   PAYWAY_MERCHANT_ID=xxx PAYWAY_API_KEY=yyy npx tsx scratch/sandbox-probe-qr-api.ts
 */

import crypto from 'node:crypto';

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const QR_PATH = '/api/payment-gateway/v1/payments/generate-qr';

const HMAC_FIELDS = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'purchase_type',
  'payment_option',
  'callback_url',
  'currency',
  'qr_image_template',
] as const;

type Payload = Record<(typeof HMAC_FIELDS)[number] | 'hash', string | number>;
type Verdict = 'SIGNATURE_ACCEPTED' | 'HMAC_REJECTED' | 'PATH_MISSING' | 'NETWORK_ERROR' | 'INCONCLUSIVE';

interface ProbeResult {
  label: string;
  status: number | 'ERR';
  statusText: string;
  body: string;
  verdict: Verdict;
}

if (!MERCHANT_ID || !API_KEY) {
  console.error('Missing credentials. Set PAYWAY_MERCHANT_ID and PAYWAY_API_KEY before running this probe.');
  process.exit(1);
}

function requestTime(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function sign(payload: Omit<Payload, 'hash'>): string {
  const plaintext = HMAC_FIELDS.map((field) => String(payload[field] ?? '')).join('');
  return crypto.createHmac('sha512', API_KEY).update(plaintext).digest('base64');
}

function buildPayload(): Omit<Payload, 'hash'> {
  const transactionId = `QRPROBE${Date.now().toString().slice(-12)}`;
  return {
    req_time: requestTime(),
    merchant_id: MERCHANT_ID,
    tran_id: transactionId,
    amount: '0.01',
    purchase_type: 'purchase',
    payment_option: 'abapay_khqr',
    callback_url: Buffer.from('https://example.invalid/payway-qr-probe').toString('base64'),
    currency: 'USD',
    qr_image_template: 'template2',
  };
}

function classify(status: number, body: string, expectValidSignature: boolean): Verdict {
  if (status === 404 || body.trimStart().startsWith('<')) {
    return 'PATH_MISSING';
  }

  let response: { status?: { code?: string | number; message?: string } } | undefined;
  try {
    response = JSON.parse(body) as typeof response;
  } catch {
    return status >= 200 && status < 500 ? 'INCONCLUSIVE' : 'NETWORK_ERROR';
  }

  const wrongHash = String(response?.status?.code) === '1';
  if (wrongHash) {
    return expectValidSignature ? 'HMAC_REJECTED' : 'HMAC_REJECTED';
  }

  return expectValidSignature ? 'SIGNATURE_ACCEPTED' : 'INCONCLUSIVE';
}

async function send(label: string, payload: Payload, expectValidSignature: boolean): Promise<ProbeResult> {
  try {
    const response = await fetch(`${BASE_URL}${QR_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.text();
    return {
      label,
      status: response.status,
      statusText: response.statusText,
      body: body.length > 500 ? `${body.slice(0, 500)}...` : body,
      verdict: classify(response.status, body, expectValidSignature),
    };
  } catch (error) {
    return {
      label,
      status: 'ERR',
      statusText: error instanceof Error ? error.message : 'Network error',
      body: '',
      verdict: 'NETWORK_ERROR',
    };
  }
}

function printResult(result: ProbeResult): void {
  console.log(`\n[${result.label}]`);
  console.log(`  HTTP:    ${result.status} ${result.statusText}`);
  console.log(`  Verdict: ${result.verdict}`);
  if (result.body) {
    console.log(`  Body:    ${result.body}`);
  }
}

async function main(): Promise<void> {
  const unsignedPayload = buildPayload();
  const validPayload: Payload = { ...unsignedPayload, hash: sign(unsignedPayload) };
  const invalidPayload: Payload = { ...unsignedPayload, hash: 'invalid-probe-hash' };

  console.log('ABA PayWay QR API sandbox probe');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Path: ${QR_PATH}`);
  console.log(`Merchant ID: ${MERCHANT_ID}`);
  console.log(`Transaction ID: ${unsignedPayload.tran_id}`);

  const validResult = await send('Correct HMAC-SHA512 signature', validPayload, true);
  const invalidResult = await send('Deliberately invalid signature', invalidPayload, false);

  printResult(validResult);
  printResult(invalidResult);

  console.log('\nInterpretation:');
  console.log('- A valid request that reaches business validation or returns QR data confirms the endpoint and HMAC field order.');
  console.log('- A code:1 response only for the invalid request confirms the signature check is active.');
  console.log('- Record any unexpected response contract or content-type requirement in SANDBOX-FINDINGS.md before changing the SDK.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});