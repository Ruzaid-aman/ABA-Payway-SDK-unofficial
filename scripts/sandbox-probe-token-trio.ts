/**
 * sandbox-probe-token-trio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-runnable sandbox probe for the v3 token-management HMAC compositions
 * published on developer.payway.com.kh (2026-08-31) and for the
 * docs-vs-verified conflicts on link-account / CoF payment.
 *
 * Classification logic: the gateway checks the HMAC BEFORE the business
 * layer, so a WRONG-HASH code ("1" / "01" / PTL02) proves a composition is
 * rejected, while ANY other business code (e.g. 105 invalid token, 104 data
 * not found, 04 invalid data) proves the hash layer ACCEPTED it. Synthetic
 * request_id/ctid/pwt values are therefore sufficient.
 *
 * Usage (TLS workaround scoped to this command only — never export it):
 *   NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx scripts/sandbox-probe-token-trio.ts
 *
 * Evidence: test-output/token-trio/probe-<timestamp>.log
 * Findings: append a dated section to docs/SANDBOX-FINDINGS.md (do not
 * rewrite history).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';

loadDotEnvIntoProcess(process.cwd());

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? 'ec476910';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const configuredUrl = process.env.PAYWAY_BASE_URL;
const BASE_URL = (
  configuredUrl && configuredUrl.startsWith('http') ? configuredUrl : 'https://checkout-sandbox.payway.com.kh'
).replace(/\/$/, '');

if (!API_KEY) {
  console.error('\n❌  Missing PAYWAY_API_KEY (repo .env is loaded automatically).\n');
  process.exit(1);
}

// ── Signing helpers ──────────────────────────────────────────────────────────

function reqTime(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

function hmac(body: Record<string, unknown>, fields: string[]): string {
  const plaintext = fields.map((f) => (body[f] === undefined || body[f] === null ? '' : String(body[f]))).join('');
  return crypto.createHmac('sha512', API_KEY).update(plaintext).digest('base64');
}

// Synthetic identifiers — the hash layer runs before the business layer, so
// these only need to satisfy the binding format rules (5–24 alnum).
const STAMP = Date.now().toString(36);
const REQUEST_ID = `probe${STAMP}rq`; // 5–24 alnum
const CTID = `probe${STAMP}ct`;
const PWT = `probe${STAMP}pwt000`;

// ── Probe cases ──────────────────────────────────────────────────────────────

interface Case {
  name: string;
  path: string;
  body: Record<string, unknown>;
  hashFields: string[];
  note: string;
}

const CASES: Case[] = [
  // ── Renew token ──
  {
    name: 'renew / live-docs order (ctid.request_time.pwt.merchant_id.request_id)',
    path: '/api/payment-credential/v3/token-management/renew-expired-account-token',
    body: { request_id: REQUEST_ID, request: REQUEST_ID, ctid: CTID, pwt: PWT },
    hashFields: ['ctid', 'request_time', 'pwt', 'merchant_id', 'request_id'],
    note: 'developer.payway.com.kh/renew-token-19336823e0',
  },
  {
    name: 'renew / SDK legacy order (baseline, known-rejected shape)',
    path: '/api/payment-credential/v3/token-management/renew-expired-account-token',
    body: { request_id: REQUEST_ID, request: REQUEST_ID, ctid: CTID, pwt: PWT },
    hashFields: ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
    note: 'current SDK composition (TD-03) — expected wrong-hash',
  },

  // ── Get token details ──
  {
    name: 'token-details / live-docs order (merchant_id.request_time.request_id), NO ctid/pwt',
    path: '/api/payment-credential/v3/token-management/get-token-details',
    body: { request_id: REQUEST_ID },
    hashFields: ['merchant_id', 'request_time', 'request_id'],
    note: 'developer.payway.com.kh/get-token-details-19336824e0 — request carries only request_time/merchant_id/request_id',
  },
  {
    name: 'token-details / SDK legacy order (baseline: body with ctid+pwt)',
    path: '/api/payment-credential/v3/token-management/get-token-details',
    body: { request_id: REQUEST_ID, request: REQUEST_ID, ctid: CTID, pwt: PWT },
    hashFields: ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
    note: 'current SDK composition (TD-03)',
  },

  // ── Remove token ──
  {
    name: 'remove-token / live-docs order (merchant_id.ctid.request_time.pwt), no request_id',
    path: '/api/payment-credential/v3/token-management/remove-token',
    body: { ctid: CTID, pwt: PWT },
    hashFields: ['merchant_id', 'ctid', 'request_time', 'pwt'],
    note: 'developer.payway.com.kh/remove-token-19336822e0 — request carries request_time/merchant_id/ctid/pwt',
  },
  {
    name: 'remove-token / SDK legacy order (baseline)',
    path: '/api/payment-credential/v3/token-management/remove-token',
    body: { request_id: REQUEST_ID, request: REQUEST_ID, ctid: CTID, pwt: PWT },
    hashFields: ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt'],
    note: 'current SDK composition (TD-03)',
  },

  // ── Link-account order conflict (docs vs sandbox-verified) ──
  {
    name: 'link-account / live-docs order (merchant_id first, ctid after request_id)',
    path: '/api/payment-credential/v3/aof/link-account',
    body: { request_id: REQUEST_ID, ctid: CTID, token_flag: 'CITI_FLEX', currency: 'USD' },
    hashFields: ['merchant_id', 'request_time', 'ctid', 'return_deeplink', 'callback_url', 'request_id', 'token_flag', 'currency'],
    note: 'developer.payway.com.kh/link-account-19336820e0 — CONFLICTS with the sandbox-verified SDK order',
  },
  {
    name: 'link-account / SDK verified order (baseline — creates a link session)',
    path: '/api/payment-credential/v3/aof/link-account',
    body: { request_id: REQUEST_ID, ctid: CTID, token_flag: 'CITI_FLEX', currency: 'USD' },
    hashFields: ['request_time', 'merchant_id', 'request_id', 'ctid', 'return_deeplink', 'token_flag', 'currency', 'callback_url'],
    note: 'SANDBOX-FINDINGS §9a baseline',
  },

  // ── CoF payment order conflict ──
  {
    name: 'cof-payment / live-docs order (no request_id, 19-field composition)',
    path: '/api/payment-gateway/v3/purchase/payment-credential',
    body: {
      tran_id: `probe${STAMP}tx`,
      amount: '1.00',
      currency: 'USD',
      ctid: CTID,
      pwt: PWT,
      token_flag: 'CITU_FLEX',
    },
    hashFields: [
      'request_time',
      'merchant_id',
      'tran_id',
      'amount',
      'currency',
      'items',
      'ctid',
      'pwt',
      'first_name',
      'last_name',
      'email',
      'phone',
      'purchase_type',
      'callback_url',
      'custom_fields',
      'return_params',
      'payout',
      'token_flag',
      'shipping_fee',
    ],
    note: 'developer.payway.com.kh/payment-19336821e0 — request_id is ABSENT from the live doc',
  },
  {
    name: 'cof-payment / SDK verified order (baseline, with request_id)',
    path: '/api/payment-gateway/v3/purchase/payment-credential',
    body: {
      request_id: REQUEST_ID,
      tran_id: `probe${STAMP}tx`,
      amount: '1.00',
      currency: 'USD',
      ctid: CTID,
      pwt: PWT,
      token_flag: 'CITU_FLEX',
    },
    hashFields: ['request_time', 'merchant_id', 'request_id', 'tran_id', 'amount', 'ctid', 'pwt', 'token_flag', 'currency', 'callback_url'],
    note: 'SANDBOX-FINDINGS §9a baseline',
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────

const WRONG_HASH_CODES = new Set(['1', '01', 'PTL02']);

interface Result extends Case {
  httpStatus: number;
  code?: string;
  message?: string;
  verdict: 'HASH_ACCEPTED' | 'HASH_REJECTED' | 'HTTP_ERROR' | 'NETWORK_ERR';
  raw: string;
}

async function runCase(c: Case): Promise<Result> {
  const body: Record<string, unknown> = {
    ...c.body,
    merchant_id: MERCHANT_ID,
    request_time: reqTime(),
  };
  body.hash = hmac(body, c.hashFields);
  try {
    const res = await fetch(`${BASE_URL}${c.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let code: string | undefined;
    let message: string | undefined;
    try {
      const parsed = JSON.parse(text) as { status?: { code?: string; message?: string }; code?: string; message?: string };
      code = parsed.status?.code ?? parsed.code;
      message = parsed.status?.message ?? parsed.message;
    } catch {
      /* non-JSON body */
    }
    const wrongHash = code !== undefined && WRONG_HASH_CODES.has(code);
    return {
      ...c,
      httpStatus: res.status,
      code,
      message,
      verdict: wrongHash ? 'HASH_REJECTED' : res.ok || code !== undefined ? 'HASH_ACCEPTED' : 'HTTP_ERROR',
      raw: text.slice(0, 400),
    };
  } catch (error) {
    return { ...c, httpStatus: 0, verdict: 'NETWORK_ERR', raw: String(error) };
  }
}

async function main(): Promise<void> {
  console.log(`Probing ${CASES.length} compositions against ${BASE_URL} as ${MERCHANT_ID}\n`);
  const results: Result[] = [];
  for (const c of CASES) {
    const r = await runCase(c);
    results.push(r);
    const icon = r.verdict === 'HASH_ACCEPTED' ? '✅' : r.verdict === 'HASH_REJECTED' ? '❌' : '⚠️ ';
    console.log(`${icon} [${r.httpStatus}] code=${r.code ?? '-'} ${r.name}`);
    console.log(`     ${r.verdict} :: ${(r.message ?? r.raw).slice(0, 160)}`);
  }

  const outDir = path.join('test-output', 'token-trio');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const lines = [
    `# token-trio composition probe — ${new Date().toISOString()}`,
    `# base URL: ${BASE_URL} · merchant: ${MERCHANT_ID} · synthetic ids: request_id=${REQUEST_ID} ctid=${CTID}`,
    ...results.map(
      (r) =>
        `\n## ${r.name}\nverdict=${r.verdict} http=${r.httpStatus} code=${r.code ?? '-'}\nnote=${r.note}\nbody=${JSON.stringify(r.raw)}`,
    ),
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(`\nEvidence written to ${file}`);
  console.log('Next: append a dated section to docs/SANDBOX-FINDINGS.md with the verdict table.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
