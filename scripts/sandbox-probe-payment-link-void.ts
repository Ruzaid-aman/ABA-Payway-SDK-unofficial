/**
 * Payment-link VOID probe — undocumented endpoint (2026-09-11).
 *
 * User surfaced an unpublished ABA endpoint:
 *   POST api/merchant-portal/merchant-access/payment-link/void
 * with the same body family as create/detail ({request_time, merchant_id,
 * merchant_auth, hash} → RSA-encrypted auth, HMAC over the default trio).
 * Docs example response: {status:{code:"00"}, tran_id:"20220817063142"}.
 *
 * Questions this probe answers against the sandbox:
 *   W-V1  Is the endpoint live at all (404 vs business response)?
 *   W-V2  Which identifier does the merchant_auth plaintext carry?
 *         (detail uses {mc_id, id}; candidates: id, link_id, payment_link_id,
 *          tran_id, merchant_ref_no)
 *   W-V3  Post-void state: what does detail report, what does the hosted
 *         payment_link URL answer on plain GET?
 *   W-V4  Double-void — idempotent or error?
 *   W-V5  Bogus id — which error code (compare detail's 96)?
 *   W-V6  Content-Type leniency — application/json vs form-urlencoded
 *
 * Evidence JSON → test-output/payment-link-void-probe/.
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/sandbox-probe-payment-link-void.ts
 */
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/client.js';

loadDotEnvIntoProcess(process.cwd());

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const BASE_URL = process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh';
const PUBLIC_KEY = (process.env.PAYWAY_RSA_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');
const VOID_PATH = '/api/merchant-portal/merchant-access/payment-link/void';

if (!MERCHANT_ID || !API_KEY || !PUBLIC_KEY) {
  console.error('Missing credentials. Set PAYWAY_MERCHANT_ID, PAYWAY_API_KEY and PAYWAY_RSA_PUBLIC_KEY in .env');
  process.exitCode = 1;
  throw new Error('missing credentials');
}

const OUT_DIR = resolve(process.cwd(), 'test-output/payment-link-void-probe');

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

async function rawVoid(
  authPayload: Record<string, unknown>,
  contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json',
): Promise<{ http: number; body: unknown }> {
  const merchantAuth = encryptMerchantAuth(authPayload);
  const rt = requestTime();
  const fields = { request_time: rt, merchant_id: MERCHANT_ID, merchant_auth: merchantAuth, hash: sign(rt, merchantAuth) };
  const res = await fetch(`${BASE_URL}${VOID_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(fields) : new URLSearchParams(fields).toString(),
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

  // Fresh OPEN link to void. +1h expiry so nothing interferes; amount 1.50.
  console.log('=== setup: create a fresh OPEN payment link ===');
  const created = await payway.paymentLink.create({
    title: 'PLV void probe link',
    amount: 1.5,
    currency: 'USD',
    merchantRefNo: `plv-void-${stamp}`,
    returnUrl: 'https://merchant.example/payway/pushback',
    expiredDate: Math.floor(Date.now() / 1000) + 3600,
  });
  const data = created.data as Record<string, unknown> | undefined;
  const linkId = data?.id as string;
  const hostedUrl = data?.payment_link as string;
  const createTranId = created.tran_id;
  console.log(`created id=${linkId} hosted=${hostedUrl} tran_id=${JSON.stringify(createTranId)}`);

  // Baseline: detail + hosted page pre-void.
  const detailBefore = await payway.paymentLink.getDetails(linkId);
  const db = detailBefore.data as Record<string, unknown> | undefined;
  console.log(`[pre-void detail] status=${JSON.stringify(db?.status)} total_trxn=${JSON.stringify(db?.total_trxn)}`);
  const pageBefore = await fetch(hostedUrl, { redirect: 'manual' });
  const pageBeforeFull = await pageBefore.text();
  const pageBeforeBody = pageBeforeFull.slice(0, 200).replace(/\s+/g, ' ');
  const titleOf = (html: string): string => (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const markersOf = (html: string): Record<string, boolean> => ({
    voided: /voided/i.test(html),
    expired: /expired/i.test(html),
    payNow: /pay now|aba pay|pay with/i.test(html),
    error: /error|invalid|not available/i.test(html),
  });
  console.log(`[pre-void hosted GET] HTTP ${pageBefore.status} title="${titleOf(pageBeforeFull)}" markers=${JSON.stringify(markersOf(pageBeforeFull))}`);
  writeFileSync(resolve(OUT_DIR, 'hosted-pre-void.html'), pageBeforeFull);

  // ── W-V1/W-V2: is it live, and which identifier does it want? ─────────────
  console.log('\n=== W-V1/W-V2: liveness + identifier discovery ===');
  const candidates: Array<{ label: string; payload: Record<string, unknown>; value: string }> = [
    { label: 'id (detail-style)', payload: { id: linkId }, value: linkId },
    { label: 'link_id', payload: { link_id: linkId }, value: linkId },
    { label: 'payment_link_id', payload: { payment_link_id: linkId }, value: linkId },
    { label: 'tran_id (create response)', payload: { tran_id: createTranId }, value: String(createTranId) },
    { label: 'merchant_ref_no', payload: { merchant_ref_no: `plv-void-${stamp}` }, value: `plv-void-${stamp}` },
  ];

  let voidedWith: string | undefined;
  for (const cand of candidates) {
    const res = await rawVoid(cand.payload);
    const { code, message } = statusCodeOf(res.body);
    console.log(`  [auth={${'mc_id'}, ${Object.keys(cand.payload)[1]}:…}] HTTP ${res.http} code=${JSON.stringify(code)} message=${JSON.stringify(message)} body=${JSON.stringify(res.body).slice(0, 300)}`);
    if (code === '00') {
      voidedWith = cand.label;
      record('W-V2', `Which identifier does void want?`, `merchant_auth plaintext key "${Object.keys(cand.payload)[1]}" (${cand.label}) → success`, { request: cand.payload, response: res.body });
      break;
    }
  }
  if (!voidedWith) {
    record('W-V1', 'Is the void endpoint live?', 'No candidate identifier produced success — see per-candidate evidence', {
      candidates: candidates.map((c) => c.label),
    });
  } else {
    record('W-V1', 'Is the void endpoint live?', `YES — void succeeded via merchant_auth key of the ${voidedWith} candidate`, { path: VOID_PATH });
  }

  // ── W-V3: post-void state ─────────────────────────────────────────────────
  console.log('\n=== W-V3: post-void state ===');
  const detailAfter = await payway.paymentLink.getDetails(linkId);
  const da = detailAfter.data as Record<string, unknown> | undefined;
  console.log(`[post-void detail] status=${JSON.stringify(da?.status)} updated_at=${JSON.stringify(da?.updated_at)} total_trxn=${JSON.stringify(da?.total_trxn)} raw=${JSON.stringify(da).slice(0, 400)}`);
  const pageAfter = await fetch(hostedUrl, { redirect: 'manual' });
  const pageAfterFull = await pageAfter.text();
  const pageAfterBody = pageAfterFull.slice(0, 400).replace(/\s+/g, ' ');
  console.log(`[post-void hosted GET] HTTP ${pageAfter.status} ct=${pageAfter.headers.get('content-type')} title="${titleOf(pageAfterFull)}" markers=${JSON.stringify(markersOf(pageAfterFull))} body[:400]=${pageAfterBody}`);
  writeFileSync(resolve(OUT_DIR, 'hosted-post-void.html'), pageAfterFull);
  record(
    'W-V3',
    'Post-void: detail status + hosted page',
    `detail status=${JSON.stringify(da?.status)}; hosted page HTTP ${pageAfter.status} title="${titleOf(pageAfterFull)}" markers=${JSON.stringify(markersOf(pageAfterFull))}`,
    { detail: da, hosted: { http: pageAfter.status, title: titleOf(pageAfterFull), markers: markersOf(pageAfterFull), bodyFirst400: pageAfterBody } },
  );

  // ── W-V4: double-void ─────────────────────────────────────────────────────
  console.log('\n=== W-V4: double-void ===');
  const key = voidedWith === 'tran_id (create response)' ? { tran_id: createTranId } : voidedWith === 'merchant_ref_no' ? { merchant_ref_no: `plv-void-${stamp}` } : { id: linkId };
  const twice = await rawVoid(key);
  const tw = statusCodeOf(twice.body);
  console.log(`  HTTP ${twice.http} code=${JSON.stringify(tw.code)} message=${JSON.stringify(tw.message)} body=${JSON.stringify(twice.body).slice(0, 300)}`);
  record('W-V4', 'Voiding an already-voided link', `HTTP ${twice.http} code=${JSON.stringify(tw.code)} message=${JSON.stringify(tw.message)}`, twice.body);

  // ── W-V5: bogus id ───────────────────────────────────────────────────────
  console.log('\n=== W-V5: bogus id ===');
  const bogus = await rawVoid({ id: 'bogus-' + stamp + '==' });
  const bg = statusCodeOf(bogus.body);
  console.log(`  HTTP ${bogus.http} code=${JSON.stringify(bg.code)} message=${JSON.stringify(bg.message)} body=${JSON.stringify(bogus.body).slice(0, 300)}`);
  record('W-V5', 'Voiding a nonexistent link id', `HTTP ${bogus.http} code=${JSON.stringify(bg.code)} message=${JSON.stringify(bg.message)}`, bogus.body);

  // ── W-V6: content-type leniency (form-urlencoded with the working key) ────
  console.log('\n=== W-V6: content-type leniency ===');
  // Use a second fresh link so this void is meaningful (first link is already voided).
  const created2 = await payway.paymentLink.create({
    title: 'PLV void probe link 2 (form-urlencoded leg)',
    amount: 1.5,
    currency: 'USD',
    merchantRefNo: `plv-void2-${stamp}`,
    returnUrl: 'https://merchant.example/payway/pushback',
    expiredDate: Math.floor(Date.now() / 1000) + 3600,
  });
  const linkId2 = (created2.data as Record<string, unknown> | undefined)?.id as string;
  const key2 = voidedWith === 'tran_id (create response)' ? { tran_id: created2.tran_id } : voidedWith === 'merchant_ref_no' ? { merchant_ref_no: `plv-void2-${stamp}` } : { id: linkId2 };
  const formLeg = await rawVoid(key2, 'application/x-www-form-urlencoded');
  const fl = statusCodeOf(formLeg.body);
  console.log(`  link2=${linkId2} HTTP ${formLeg.http} code=${JSON.stringify(fl.code)} message=${JSON.stringify(fl.message)}`);
  record('W-V6', 'form-urlencoded content-type', `HTTP ${formLeg.http} code=${JSON.stringify(fl.code)} message=${JSON.stringify(fl.message)}`, formLeg.body);

  writeFileSync(
    resolve(OUT_DIR, `void-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        linkId,
        hostedUrl,
        createTranId,
        preVoid: { detailStatus: db?.status, hostedHttp: pageBefore.status },
        findings,
      },
      null,
      2,
    ),
  );
  console.log('\nevidence written');
}

main().catch((e) => {
  console.error('probe crashed:', e);
  process.exitCode = 1;
});
