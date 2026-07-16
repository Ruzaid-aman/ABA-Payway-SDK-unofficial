/**
 * Sandbox probe for PayWay pre-auth completion and cancellation endpoints.
 * Dummy transaction IDs ensure these requests cannot complete or cancel a live hold.
 *
 * Usage:
 *   PAYWAY_MERCHANT_ID=xxx PAYWAY_API_KEY=yyy npx tsx scratch/sandbox-probe-pre-auth.ts
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const PUBLIC_KEY_PATH = process.env.PAYWAY_PUBLIC_KEY_PATH ?? 'payway-boilerplate/payment_link_api/rsa.public';

type Verdict = 'REQUEST_ACCEPTED' | 'HMAC_REJECTED' | 'PATH_MISSING' | 'NETWORK_ERROR' | 'INCONCLUSIVE';

interface ProbeCase {
  label: string;
  path: string;
  authPayload: Record<string, unknown>;
  hmacFields: Array<'merchant_auth' | 'request_time' | 'merchant_id'>;
}

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

function encryptMerchantAuth(payload: Record<string, unknown>, publicKeyPem: string): string {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encryptedChunks: Buffer[] = [];

  for (let offset = 0; offset < plaintext.length; offset += 117) {
    encryptedChunks.push(
      crypto.publicEncrypt(
        { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
        plaintext.subarray(offset, offset + 117),
      ),
    );
  }

  return Buffer.concat(encryptedChunks).toString('base64');
}

function sign(payload: Record<string, string>, fields: ProbeCase['hmacFields']): string {
  return crypto
    .createHmac('sha512', API_KEY)
    .update(fields.map((field) => payload[field]).join(''))
    .digest('base64');
}

function classify(status: number, body: string): Verdict {
  if (status === 404 || body.trimStart().startsWith('<')) {
    return 'PATH_MISSING';
  }

  try {
    const response = JSON.parse(body) as { status?: { code?: string | number } | string; code?: string | number };
    const code = typeof response.status === 'object' ? response.status?.code : response.code;
    return String(code) === '1' ? 'HMAC_REJECTED' : 'REQUEST_ACCEPTED';
  } catch {
    return status >= 200 && status < 500 ? 'INCONCLUSIVE' : 'NETWORK_ERROR';
  }
}

async function send(probeCase: ProbeCase, hashOverride?: string): Promise<ProbeResult> {
  const publicKeyPem = readFileSync(resolve(PUBLIC_KEY_PATH), 'utf8');
  const merchantAuth = encryptMerchantAuth({ mc_id: MERCHANT_ID, ...probeCase.authPayload }, publicKeyPem);
  const payload = {
    request_time: requestTime(),
    merchant_id: MERCHANT_ID,
    merchant_auth: merchantAuth,
  };
  const requestBody = { ...payload, hash: hashOverride ?? sign(payload, probeCase.hmacFields) };

  try {
    const response = await fetch(`${BASE_URL}${probeCase.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const body = await response.text();
    return {
      label: probeCase.label,
      status: response.status,
      statusText: response.statusText,
      body: body.length > 500 ? `${body.slice(0, 500)}...` : body,
      verdict: classify(response.status, body),
    };
  } catch (error) {
    return {
      label: probeCase.label,
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
  const transactionId = `PREAUTH${Date.now().toString().slice(-12)}`;
  const payout = [{ acc: '000000000000', amt: 0.01 }];
  const probeCases: ProbeCase[] = [
    {
      label: 'Complete pre-auth',
      path: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion',
      authPayload: { tran_id: transactionId, complete_amount: 0.01 },
      hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
    },
    {
      label: 'Complete pre-auth with payout',
      path: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion',
      authPayload: { tran_id: transactionId, complete_amount: 0.01, payout },
      hmacFields: ['merchant_auth', 'request_time', 'merchant_id'],
    },
    {
      label: 'Cancel pre-auth',
      path: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation',
      authPayload: { tran_id: transactionId },
      hmacFields: ['merchant_id', 'merchant_auth', 'request_time'],
    },
  ];

  console.log('ABA PayWay pre-auth sandbox probe');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Merchant ID: ${MERCHANT_ID}`);
  console.log(`Public key path: ${PUBLIC_KEY_PATH}`);
  console.log(`Dummy transaction ID: ${transactionId}`);

  for (const probeCase of probeCases) {
    printResult(await send(probeCase));
    printResult(await send({ ...probeCase, label: `${probeCase.label} (invalid hash)` }, 'invalid-probe-hash'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});