/**
 * Sandbox probe for payout and beneficiary endpoints.
 * Uses an intentionally invalid account number so no beneficiary can be changed or paid.
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const INVALID_ACCOUNT = 'SDK_PROBE_INVALID_ACCOUNT';
const PUBLIC_KEY_PATH = process.env.PAYWAY_PUBLIC_KEY_PATH ?? 'payway-boilerplate/payment_link_api/rsa.public';

interface BeneficiaryProbeCase {
  label: string;
  path: string;
  authPayload: Record<string, string | number>;
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

function encrypt(payload: unknown, publicKeyPem: string): string {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < plaintext.length; offset += 117) {
    chunks.push(crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING }, plaintext.subarray(offset, offset + 117)));
  }
  return Buffer.concat(chunks).toString('base64');
}

function hmac(plaintext: string, encoding: 'base64' | 'hex'): string {
  return crypto.createHmac('sha512', API_KEY).update(plaintext).digest(encoding);
}

async function send(label: string, path: string, payload: Record<string, string | number>): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  console.log(`\n[${label}]`);
  console.log(`  HTTP: ${response.status} ${response.statusText}`);
  console.log(`  Body: ${body.slice(0, 500)}`);
}

async function main(): Promise<void> {
  const publicKeyPem = readFileSync(resolve(PUBLIC_KEY_PATH), 'utf8');
  const transactionId = `PAYOUT${Date.now().toString().slice(-12)}`;
  const beneficiaries = encrypt([{ account: INVALID_ACCOUNT, amount: 0.01 }], publicKeyPem);
  const customFields = JSON.stringify({ probe: 'invalid account' });
  const payoutPayload = {
    merchant_id: MERCHANT_ID,
    tran_id: transactionId,
    beneficiaries,
    amount: '0.01',
    currency: 'USD',
    custom_fields: customFields,
  };
  const payoutPlaintext = `${payoutPayload.merchant_id}${payoutPayload.tran_id}${payoutPayload.beneficiaries}${payoutPayload.amount}${payoutPayload.custom_fields}${payoutPayload.currency}`;
  const beneficiaryCases: BeneficiaryProbeCase[] = [
    {
      label: 'Update beneficiary status',
      path: '/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status',
      authPayload: { payee: INVALID_ACCOUNT, status: 0 },
    },
    {
      label: 'Add beneficiary',
      path: '/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout',
      authPayload: { payee: INVALID_ACCOUNT },
    },
  ];

  console.log('ABA PayWay payout sandbox probe');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Merchant ID: ${MERCHANT_ID}`);
  console.log(`Invalid account: ${INVALID_ACCOUNT}`);
  await send('Payout (Base64 HMAC)', '/api/payment-gateway/v2/direct-payment/merchant/payout', {
    ...payoutPayload,
    hash: hmac(payoutPlaintext, 'base64'),
  });
  await send('Payout (documented hexadecimal HMAC)', '/api/payment-gateway/v2/direct-payment/merchant/payout', {
    ...payoutPayload,
    hash: hmac(payoutPlaintext, 'hex'),
  });
  await send('Payout (invalid hash)', '/api/payment-gateway/v2/direct-payment/merchant/payout', {
    ...payoutPayload,
    hash: 'invalid-probe-hash',
  });

  for (const probeCase of beneficiaryCases) {
    const merchantAuth = encrypt({ mc_id: MERCHANT_ID, ...probeCase.authPayload }, publicKeyPem);
    const payload = {
      request_time: requestTime(),
      merchant_id: MERCHANT_ID,
      merchant_auth: merchantAuth,
    };
    await send(probeCase.label, probeCase.path, { ...payload, hash: hmac(`${payload.request_time}${payload.merchant_auth}`, 'base64') });
    await send(`${probeCase.label} (invalid hash)`, probeCase.path, { ...payload, hash: 'invalid-probe-hash' });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});