/**
 * Payment-link docs-review verification probes (plan Batch A, 2026-09-06).
 *
 * Runs the items that need no interactive payer:
 *   V-2  response `payout` placement — top-level vs inside `data` (with a
 *        payout-bearing create against a seeded sandbox beneficiary)
 *   V-3  `tran_id` runtime type in create + detail responses (number|string)
 *   V-4  expired_date semantics — expired link: what does detail report, and
 *        what does the hosted payment_link URL answer (plain GET)?
 *   V-5  error-code reproduction — PTL132 (bogus link id on detail), PTL99
 *        (unsupported currency), PTL04 (currency omitted), PTL05 (non-numeric
 *        amount) via raw hand-rolled requests (the SDK's local validation
 *        would intercept them before the gateway)
 *
 * V-1 (pushback body incl. hash presence) needs a REAL payment — out of
 * scope here; stays open until an interactive session pays a link.
 *
 * SDK-driven probes verify GATEWAY behavior (the SDK wire contract is already
 * pinned by tests); error-code probes are hand-rolled the same way as
 * scripts/sandbox-probe-payment-link.ts because the SDK throws locally.
 * Evidence JSON → test-output/payment-link-docs-review/.
 *
 *   npx tsx scripts/sandbox-probe-payment-link-verify.ts
 */

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';
import { ENDPOINTS } from '../src/constants.js';

loadDotEnvIntoProcess(process.cwd());

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const PUBLIC_KEY = (process.env.PAYWAY_RSA_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');

if (!MERCHANT_ID || !API_KEY || !PUBLIC_KEY) {
  console.error('Missing credentials. Set PAYWAY_MERCHANT_ID, PAYWAY_API_KEY and PAYWAY_RSA_PUBLIC_KEY in .env');
  process.exitCode = 1;
  throw new Error('missing credentials');
}

const OUT_DIR = resolve(process.cwd(), 'test-output/payment-link-docs-review');

interface Finding {
  probe: string;
  question: string;
  verdict: string;
  evidence: unknown;
}

const findings: Finding[] = [];
function record(probe: string, question: string, verdict: string, evidence: unknown): void {
  findings.push({ probe, question, verdict, evidence });
  console.log(`\n[${probe}] ${question}`);
  console.log(`  → ${verdict}`);
}

// --- hand-rolled raw create (mirrors sandbox-probe-payment-link.ts) --------
function requestTime(): string {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function encryptMerchantAuth(payload: Record<string, unknown>): string {
  const plaintext = Buffer.from(JSON.stringify({ mc_id: MERCHANT_ID, ...payload }), 'utf8');
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < plaintext.length; offset += 117) {
    chunks.push(
      crypto.publicEncrypt({ key: PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING }, plaintext.subarray(offset, offset + 117)),
    );
  }
  return Buffer.concat(chunks).toString('base64');
}

function sign(rt: string, merchantAuth: string): string {
  return crypto.createHmac('sha512', API_KEY).update(rt + MERCHANT_ID + merchantAuth).digest('base64');
}

async function rawCreate(overrides: Record<string, unknown>, drop: string[] = []): Promise<{ http: number; body: unknown }> {
  const payload: Record<string, unknown> = {
    title: 'PLVR raw probe',
    amount: 1.5,
    currency: 'USD',
    return_url: Buffer.from('https://merchant.example/payway/pushback').toString('base64'),
    merchant_ref_no: `plvr-raw-${Date.now().toString(36)}`,
    ...overrides,
  };
  for (const key of drop) delete payload[key];
  const merchantAuth = encryptMerchantAuth(payload);
  const rt = requestTime();
  const res = await fetch(`${BASE_URL}${ENDPOINTS.createPaymentLink}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      request_time: rt,
      merchant_id: MERCHANT_ID,
      merchant_auth: merchantAuth,
      hash: sign(rt, merchantAuth),
    }),
  });
  return { http: res.status, body: await res.json().catch(() => null) };
}

function statusCodeOf(body: unknown): { code: unknown; message: unknown } {
  const b = body as Record<string, unknown> | null;
  const status = b?.status as Record<string, unknown> | undefined;
  return { code: status?.code, message: status?.message };
}

async function main(): Promise<void> {
  const payway = new PayWay();
  const stamp = Date.now().toString(36);
  mkdirSync(OUT_DIR, { recursive: true });

  // ── V-2: payout placement — attempted, externally blocked if it throws ──
  console.log('\n=== V-2 (create): payout-bearing link ===');
  let created: Awaited<ReturnType<typeof payway.paymentLink.create>> | undefined;
  try {
    created = await payway.paymentLink.create({
      title: 'PLVR V-2 payout placement probe',
      amount: 1.5,
      currency: 'USD',
      merchantRefNo: `plvr-v2-${stamp}`,
      returnUrl: 'https://merchant.example/payway/pushback',
      description: 'docs-review probe V-2/V-3',
      payout: [{ acc: '500000001', amt: 1.5 }],
    });
    const data = created.data as Record<string, unknown> | undefined;
    const top = created as Record<string, unknown>;
    const placement = top.payout !== undefined ? 'TOP-LEVEL' : data?.payout !== undefined ? 'INSIDE data' : 'ABSENT (neither)';
    record(
      'V-2',
      'Where does the payout array land in the create response?',
      `placement = ${placement}; top.payout=${JSON.stringify(top.payout)} data.payout=${JSON.stringify(data?.payout)}`,
      { createResponse: created },
    );
  } catch (error) {
    record('V-2', 'payout-bearing create', `THREW: ${error instanceof Error ? error.message : String(error)}`, {
      error: String(error),
    });
  }

  // ── V-3: plain create (no payout) — tran_id runtime type both endpoints ─
  console.log('\n=== V-3: plain link — tran_id runtime type ===');
  let plainId: string | undefined;
  try {
    const plain = await payway.paymentLink.create({
      title: 'PLVR V-3 plain link',
      amount: 1,
      currency: 'USD',
      merchantRefNo: `plvr-v3-${stamp}`,
      returnUrl: 'https://merchant.example/payway/pushback',
    });
    record(
      'V-3',
      'Runtime type of tran_id in the create response?',
      `typeof tran_id = ${typeof plain.tran_id} (value: ${JSON.stringify(plain.tran_id)})`,
      { tran_id: plain.tran_id, type: typeof plain.tran_id },
    );
    plainId = (plain.data as Record<string, unknown> | undefined)?.id as string | undefined;
    const details = await payway.paymentLink.getDetails(plainId);
    record(
      'V-3',
      'Runtime type of tran_id in the detail response?',
      `typeof tran_id = ${typeof details.tran_id} (value: ${JSON.stringify(details.tran_id)})`,
      { tran_id: details.tran_id, type: typeof details.tran_id },
    );
    const d = details.data as Record<string, unknown> | undefined;
    record(
      'V-4 (baseline)',
      'Detail fields on a fresh unexpired link (comparison baseline)',
      `status=${JSON.stringify(d?.status)} expired_date=${JSON.stringify(d?.expired_date)} pushback_url=${JSON.stringify(d?.pushback_url)}`,
      { data: d },
    );
  } catch (error) {
    record('V-3', 'plain create/detail', `THREW: ${error instanceof Error ? error.message : String(error)}`, {
      error: String(error),
    });
  }

  // ── V-4: short-future expiry → wait → detail + hosted GET ────────────────
  console.log('\n=== V-4: expired-date semantics (short-future expiry) ===');
  const TTL_SECONDS = 150;
  try {
    const expiring = await payway.paymentLink.create({
      title: 'PLVR V-4 short-expiry link',
      amount: 2,
      currency: 'USD',
      merchantRefNo: `plvr-v4-${stamp}`,
      returnUrl: 'https://merchant.example/payway/pushback',
      expiredDate: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    });
    const expData = expiring.data as Record<string, unknown> | undefined;
    const expId = expData?.id as string | undefined;
    record(
      'V-4',
      `Create accepted with expired_date = now+${TTL_SECONDS}s?`,
      expId ? 'ACCEPTED' : `no id: ${JSON.stringify(expiring)}`,
      { createResponse: expiring },
    );
    if (expId) {
      console.log(`  waiting ${TTL_SECONDS + 15}s for the link to expire…`);
      await new Promise((r) => setTimeout(r, (TTL_SECONDS + 15) * 1000));
      const expDetails = await payway.paymentLink.getDetails(expId);
      const ed = expDetails.data as Record<string, unknown> | undefined;
      record(
        'V-4',
        'What status does detail report AFTER expiry?',
        `status=${JSON.stringify(ed?.status)} expired_date=${JSON.stringify(ed?.expired_date)} — EXPIRED value present? ${String(ed?.status).toUpperCase().includes('EXPIRED')}`,
        { detailResponse: expDetails },
      );
      const hostedUrl = ed?.payment_link as string | undefined;
      if (hostedUrl) {
        try {
          const res = await fetch(hostedUrl, { redirect: 'manual' });
          const bodyText = (await res.text()).slice(0, 400).replace(/\s+/g, ' ');
          record(
            'V-4',
            'What does the hosted payment page answer AFTER expiry (plain GET)?',
            `HTTP ${res.status}; content-type=${res.headers.get('content-type')}; body[:400]=${bodyText}`,
            { status: res.status, contentType: res.headers.get('content-type'), bodyFirst400: bodyText },
          );
        } catch (error) {
          record('V-4', 'hosted URL GET', `FETCH THREW: ${error instanceof Error ? error.message : String(error)}`, {
            error: String(error),
          });
        }
      }
    }
  } catch (error) {
    record('V-4', 'short-expiry create', `THREW: ${error instanceof Error ? error.message : String(error)}`, {
      error: String(error),
    });
  }

  // ── V-4b: past expired_date at create time ───────────────────────────────
  console.log('\n=== V-4b: past expired_date at create ===');
  try {
    await payway.paymentLink.create({
      title: 'PLVR V-4b already-past link',
      amount: 2,
      currency: 'USD',
      merchantRefNo: `plvr-v4b-${stamp}`,
      returnUrl: 'https://merchant.example/payway/pushback',
      expiredDate: Math.floor(Date.now() / 1000) - 3600,
    });
    record('V-4b', 'Create with an already-PAST expired_date', 'UNEXPECTED: accepted', {});
  } catch (error) {
    record(
      'V-4b',
      'Create with an already-PAST expired_date — rejected?',
      `THREW: ${error instanceof Error ? error.message : String(error)}`,
      { error: String(error) },
    );
  }

  // ── V-5: error codes ──────────────────────────────────────────────────────
  console.log('\n=== V-5: error codes ===');

  try {
    await payway.paymentLink.getDetails('not-a-real-link-id==');
    record('V-5a', 'detail with a bogus id', 'UNEXPECTED: no throw', {});
  } catch (error) {
    const e = error as { paywayCode?: unknown; statusCode?: unknown; message?: string };
    record(
      'V-5a',
      'What does detail answer for a bogus link id? (expect PTL132/96 family)',
      `paywayCode=${JSON.stringify(e.paywayCode)} http=${String(e.statusCode)} message=${e.message}`,
      { error: String(error), paywayCode: e.paywayCode, httpStatus: e.statusCode },
    );
  }

  try {
    const eur = await rawCreate({ currency: 'EUR' });
    const s = statusCodeOf(eur.body);
    record(
      'V-5b',
      'Create with unsupported currency EUR — expect PTL99',
      `HTTP ${eur.http}; status.code=${JSON.stringify(s.code)} message=${JSON.stringify(s.message)}`,
      eur,
    );

    const noCurrency = await rawCreate({}, ['currency']);
    const s2 = statusCodeOf(noCurrency.body);
    record(
      'V-5c',
      'Create with currency omitted — expect PTL04',
      `HTTP ${noCurrency.http}; status.code=${JSON.stringify(s2.code)} message=${JSON.stringify(s2.message)}`,
      noCurrency,
    );

    const badAmount = await rawCreate({ amount: 'not-a-number' });
    const s3 = statusCodeOf(badAmount.body);
    record(
      'V-5d',
      'Create with a non-numeric amount — expect PTL05 family',
      `HTTP ${badAmount.http}; status.code=${JSON.stringify(s3.code)} message=${JSON.stringify(s3.message)}`,
      badAmount,
    );
  } catch (error) {
    record('V-5 raw', 'raw create plumbing', `THREW: ${error instanceof Error ? error.message : String(error)}`, {
      error: String(error),
    });
  }

  const out = resolve(OUT_DIR, `verify-probes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), findings }, null, 2));
  console.log(`\nEvidence written: ${out}`);
}

main().catch((error) => {
  console.error('probe crashed:', error);
  process.exitCode = 1;
});
