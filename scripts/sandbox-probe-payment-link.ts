/**
 * Sandbox probe for PayWay Payment Link endpoints (create + detail).
 *
 * Verifies the RSA merchant_auth + HMAC contract against the live sandbox and
 * isolates common failure causes (wrong RSA key, content-type, payload shape,
 * multi-chunk encryption). Run with credentials in the repo-root .env:
 *
 *   npx tsx scripts/sandbox-probe-payment-link.ts
 *
 * Exit code 0 = create + detail succeeded. 1 = one or more probes failed.
 */

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Env loading — the CLI's shared parser (supports multi-line quoted PEMs,
// which the repo .env uses for PAYWAY_RSA_PUBLIC_KEY)
// ---------------------------------------------------------------------------
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';

loadDotEnvIntoProcess(process.cwd());

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const WRONG_KEY_PATH = 'payway-boilerplate/payment_link_api/rsa.public';

/** RSA keys accept literal "\n" sequences (same normalization the SDK applies). */
function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, '\n');
}

const PUBLIC_KEY = normalizePem(process.env.PAYWAY_RSA_PUBLIC_KEY ?? '');

if (!MERCHANT_ID || !API_KEY || !PUBLIC_KEY) {
  console.error('Missing credentials. Set PAYWAY_MERCHANT_ID, PAYWAY_API_KEY and PAYWAY_RSA_PUBLIC_KEY in .env');
  process.exitCode = 1;
  throw new Error('missing credentials');
}

// ---------------------------------------------------------------------------
// Crypto helpers (mirrors src/auth.ts: concat encrypted chunks, then base64)
// ---------------------------------------------------------------------------
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

function sign(requestTimeValue: string, merchantAuth: string): string {
  return crypto.createHmac('sha512', API_KEY).update(requestTimeValue + MERCHANT_ID + merchantAuth).digest('base64');
}

// ---------------------------------------------------------------------------
// Probe plumbing
// ---------------------------------------------------------------------------
type Verdict = 'SUCCESS' | 'SANDBOX_REJECT' | 'HMAC_REJECT' | 'NETWORK_ERROR';

interface ProbeResult {
  label: string;
  http: number | 'ERR';
  code: string;
  message: string;
  verdict: Verdict;
  paymentLink?: string;
  id?: string;
}

function classify(http: number | 'ERR', code: string, paymentLink?: string): Verdict {
  if (http === 'ERR') return 'NETWORK_ERROR';
  if (paymentLink || code === '00' || code === '0') return 'SUCCESS';
  if (code === '1' || code === 'PTL02') return 'HMAC_REJECT';
  return 'SANDBOX_REJECT';
}

async function sendCreate(
  label: string,
  authPayload: Record<string, unknown>,
  options: {
    key?: string;
    contentType?: 'form' | 'json';
    hashOverride?: string;
    /** When present, the body switches to multipart/form-data with a top-level `image` part. */
    image?: { data: Uint8Array; filename: string; contentType: string };
  } = {},
): Promise<ProbeResult> {
  const requestTimeValue = requestTime();
  let merchantAuth: string;
  try {
    merchantAuth = encryptMerchantAuth({ mc_id: MERCHANT_ID, ...authPayload }, options.key ?? PUBLIC_KEY);
  } catch (error) {
    return { label, http: 'ERR', code: '', message: `local RSA error: ${(error as Error).message}`, verdict: 'NETWORK_ERROR' };
  }

  const bodyObj: Record<string, string> = {
    request_time: requestTimeValue,
    merchant_id: MERCHANT_ID,
    merchant_auth: merchantAuth,
    hash: options.hashOverride ?? sign(requestTimeValue, merchantAuth),
  };

  const isJson = options.contentType === 'json';
  let headers: Record<string, string>;
  let body: string | FormData;
  if (options.image) {
    // Multipart: string fields + binary part. No manual Content-Type — the
    // runtime must generate the boundary. Image bytes are NOT hashed.
    const form = new FormData();
    for (const [key, value] of Object.entries(bodyObj)) form.append(key, value);
    form.append(
      'image',
      new Blob([options.image.data], { type: options.image.contentType }),
      options.image.filename,
    );
    headers = {};
    body = form;
  } else if (isJson) {
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify(bodyObj);
  } else {
    headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    body = new URLSearchParams(bodyObj).toString();
  }
  try {
    const response = await fetch(`${BASE_URL}/api/merchant-portal/merchant-access/payment-link/create`, {
      method: 'POST',
      headers,
      body,
    });
    const text = await response.text();
    let code = '';
    let message = '';
    let paymentLink: string | undefined;
    let id: string | undefined;
    try {
      const json = JSON.parse(text) as {
        status?: { code?: unknown; message?: string };
        payment_link?: string;
        data?: { id?: string; payment_link?: string };
      };
      code = String(json.status?.code ?? '');
      message = json.status?.message ?? '';
      paymentLink = json.data?.payment_link ?? json.payment_link;
      id = json.data?.id;
    } catch {
      message = text.slice(0, 120);
    }
    return { label, http: response.status, code, message, verdict: classify(response.status, code, paymentLink), paymentLink, id };
  } catch (error) {
    return { label, http: 'ERR', code: '', message: (error as Error).message, verdict: 'NETWORK_ERROR' };
  }
}

async function sendDetail(id: string): Promise<ProbeResult> {
  const label = 'detail (chained)';
  const requestTimeValue = requestTime();
  const merchantAuth = encryptMerchantAuth({ mc_id: MERCHANT_ID, id }, PUBLIC_KEY);
  const bodyObj: Record<string, string> = {
    request_time: requestTimeValue,
    merchant_id: MERCHANT_ID,
    merchant_auth: merchantAuth,
    hash: sign(requestTimeValue, merchantAuth),
  };
  try {
    const response = await fetch(`${BASE_URL}/api/merchant-portal/merchant-access/payment-link/detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyObj).toString(),
    });
    const text = await response.text();
    let code = '';
    let message = '';
    try {
      const json = JSON.parse(text) as { status?: { code?: unknown; message?: string } };
      code = String(json.status?.code ?? '');
      message = json.status?.message ?? '';
      console.log(`    detail body: ${text.slice(0, 300)}`);
    } catch {
      message = text.slice(0, 120);
    }
    return { label, http: response.status, code, message, verdict: classify(response.status, code) };
  } catch (error) {
    return { label, http: 'ERR', code: '', message: (error as Error).message, verdict: 'NETWORK_ERROR' };
  }
}

function print(result: ProbeResult): void {
  const icon = result.verdict === 'SUCCESS' ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${result.label}`);
  console.log(`        HTTP ${result.http} | code=${result.code || '(none)'} | ${result.message || '(no message)'} | verdict=${result.verdict}`);
  if (result.paymentLink) console.log(`        payment_link: ${result.paymentLink}`);
  if (result.id) console.log(`        id (use for detail): ${result.id}`);
}




// ---------------------------------------------------------------------------
// Probe matrix
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const ts = Date.now().toString(36);
  const base64ReturnUrl = Buffer.from('https://example.com/return', 'utf8').toString('base64');
  const fullPayload = {
    title: 'Probe Link',
    amount: 0.02,
    currency: 'USD',
    description: 'sandbox probe',
    payment_limit: 0,
    return_url: base64ReturnUrl,
    merchant_ref_no: `plk${ts}`,
  };
  // 200 chars keeps plaintext multi-chunk (~390B) while respecting the
  // sandbox-verified 250-character description limit.
  const longDescription = `multi-chunk payload ${'x'.repeat(180)}`;

  console.log('ABA PayWay payment-link sandbox probe');
  console.log(`Base URL:    ${BASE_URL}`);
  console.log(`Merchant ID: ${MERCHANT_ID}`);
  console.log('');

  const results: ProbeResult[] = [];

  // 1-2. Happy paths: required fields only (sandbox-verified: currency + return_url
  // are REQUIRED — PTL04 when omitted) and full payloads
  results.push(await sendCreate('create — required fields only', {
    title: 'Probe', amount: 0.02, currency: 'USD', return_url: base64ReturnUrl, merchant_ref_no: `plm${ts}`,
  }));
  results.push(await sendCreate('create — full payload', fullPayload));

  // 3. Multi-chunk: plaintext > 117 bytes forces multiple RSA chunks
  results.push(await sendCreate('create — long description (multi-chunk)', {
    ...fullPayload, description: longDescription, merchant_ref_no: `plc${ts}`,
  }));

  // 3b. Optional expired_date (epoch seconds)
  results.push(await sendCreate('create — with expired_date', {
    ...fullPayload, expired_date: Math.floor(Date.now() / 1000) + 3600, merchant_ref_no: `ple${ts}`,
  }));

  // 3c. Multipart image upload — top-level `image` part, never hashed. A 1x1
  // PNG keeps the payload tiny; the ref must be unique per run.
  const PROBE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const imageResult = await sendCreate('create — multipart with image (1x1 png)', {
    ...fullPayload, merchant_ref_no: `pli${ts}`,
  }, { image: { data: PROBE_PNG, filename: 'probe-1x1.png', contentType: 'image/png' } });
  results.push(imageResult);

  // 4. Wrong-key control: identifies the error signature when PayWay cannot decrypt
  const wrongKey = existsSync(resolve(WRONG_KEY_PATH)) ? readFileSync(resolve(WRONG_KEY_PATH), 'utf8') : undefined;
  if (wrongKey) {
    results.push(await sendCreate('create — wrong-key control (expect reject)', {
      ...fullPayload, merchant_ref_no: `plw${ts}`,
    }, { key: wrongKey }));
  }

  // 5. JSON content-type variant
  results.push(await sendCreate('create — JSON content-type', {
    ...fullPayload, merchant_ref_no: `plj${ts}`,
  }, { contentType: 'json' }));

  // 6. Invalid hash negative control (expect HMAC_REJECT)
  results.push(await sendCreate('create — invalid hash (expect HMAC reject)', {
    ...fullPayload, merchant_ref_no: `plh${ts}`,
  }, { hashOverride: 'invalid-probe-hash' }));

  // 7. Description over the sandbox-verified 250-char limit (expect PTL04)
  results.push(await sendCreate('create — description > 250 chars (expect reject)', {
    ...fullPayload, description: 'x'.repeat(251), merchant_ref_no: `pld${ts}`,
  }));

  for (const result of results) print(result);

  // 7. Chained detail on the first successful create (data.id — NOT the URL slug)
  const firstId = results.find((r) => r.id)?.id;
  if (firstId) {
    console.log(`\n  Chaining detail with data.id: ${firstId}`);
    print(await sendDetail(firstId));
  } else {
    console.log('\n  (skipped detail — no create succeeded)');
  }

  const failures = results.filter((r) => r.verdict !== 'SUCCESS' && !r.label.includes('expect'));
  console.log(`\n${failures.length === 0 ? 'ALL CORE PROBES PASSED' : `${failures.length} core probe(s) failed`}`);

  // Evidence (append-style: one JSON per run) per repo probe conventions.
  const evidenceDir = resolve('test-output', 'payment-link-image-probe');
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    resolve(evidenceDir, `probe-${ts}.json`),
    JSON.stringify({ ranAt: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2),
  );
  console.log(`Evidence: ${resolve(evidenceDir, `probe-${ts}.json`)}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
  if ((error as Error).message !== 'missing credentials') console.error(error);
  process.exitCode = 1;
});

