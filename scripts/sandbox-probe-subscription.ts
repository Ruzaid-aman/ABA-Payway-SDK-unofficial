/**
 * sandbox-probe-subscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-runnable sandbox probe for the subscription-trio "Wrong Hash" blocker
 * (skills-audit T1, 2026-09-03 + 2026-09-05).
 *
 * Context: `purchase` with ctid/token_flag=CITR_FIX/frequency is rejected by
 * the gateway with Wrong Hash (code 1) while the SAME body without the trio
 * succeeds. The gateway's own hint prints the documented 26-field order —
 * which matches PURCHASE_HASH_FIELDS byte-for-byte — so the mismatch must be
 * either (a) a composition the hint does not reflect (e.g. the gateway also
 * signs `ctid`), or (b) a gateway/profile-side condition that surfaces as a
 * wrong-hash code (would contradict the §16 classification rule).
 *
 * Method: build the EXACT body the SDK sends via checkout.createTransaction(),
 * then re-sign it with candidate hash orders and POST. Classification per
 * SANDBOX-FINDINGS §16: wrong-hash codes (1/01/PTL02) prove rejection; ANY
 * other business code (00, 04, 69, …) proves the hash layer ACCEPTED the
 * composition. No money movement — at most a PENDING checkout session.
 *
 * Usage (TLS workaround scoped to this command only — never export it):
 *   NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx scripts/sandbox-probe-subscription.ts
 *
 * Evidence: test-output/subscription-hash/probe-<timestamp>.log
 * Findings: append a dated section to docs/SANDBOX-FINDINGS.md (never rewrite).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadDotEnvIntoProcess } from '../src/cli/dotenv.js';
import { PayWay } from '../src/index.js';
import { generateHmac } from '../src/auth.js';
import { PURCHASE_HASH_FIELDS } from '../src/domains/checkout.js';
import { ENDPOINTS } from '../src/constants.js';
import { encodeBase64IfNeeded } from '../src/utils.js';

loadDotEnvIntoProcess(process.cwd());

const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const configuredUrl = process.env.PAYWAY_BASE_URL;
const BASE_URL = (
  configuredUrl?.startsWith('http') ? configuredUrl : 'https://checkout-sandbox.payway.com.kh'
).replace(/\/$/, '');

if (!API_KEY) {
  console.error('\n❌  Missing PAYWAY_API_KEY (repo .env is loaded automatically).\n');
  process.exit(1);
}

// ── Base body: exactly what the CLI/SDK sends for a subscription trio purchase ──

const STAMP = Date.now().toString(36);
const TRAN_ID = `probe${STAMP}sub`; // [a-zA-Z0-9-]{1,20}
const CTID = `probe${STAMP}ct`; // [a-zA-Z0-9]{5,24}

const payway = new PayWay();
const built = payway.checkout.createTransaction({
  transactionId: TRAN_ID,
  amount: 1,
  currency: 'USD',
  paymentOption: 'cards',
  returnUrl: 'https://merchant.example/done',
  ctid: CTID,
  tokenFlag: 'CITR_FIX',
  frequency: '1M',
});
const BODY: Record<string, unknown> = { ...built };
delete BODY.hash;

// ── Candidate hash orders ────────────────────────────────────────────────────

function insertAfter(fields: string[], anchor: string, extra: string): string[] {
  const i = fields.indexOf(anchor);
  if (i < 0) throw new Error(`anchor ${anchor} not in PURCHASE_HASH_FIELDS`);
  return [...fields.slice(0, i + 1), extra, ...fields.slice(i + 1)];
}

interface Case {
  name: string;
  hashFields: string[];
  note: string;
  /** Override body fields for this case only (merged over BODY). */
  bodyOverride?: Record<string, unknown>;
}

const DOC_ORDER = [...PURCHASE_HASH_FIELDS];

const CASES: Case[] = [
  {
    name: 'A / documented 26-field order (SDK current, hint-verified)',
    hashFields: DOC_ORDER,
    note: 'baseline — CLI live-reproduced Wrong Hash 2026-09-03 and 2026-09-05',
  },
  {
    name: 'B1 / ctid inserted before token_flag',
    hashFields: insertAfter(DOC_ORDER, 'skip_success_page', 'ctid'),
    note: 'link-account/link-card both place ctid before token_flag',
  },
  {
    name: 'B2 / ctid appended after frequency',
    hashFields: [...DOC_ORDER, 'ctid'],
    note: 'trio grouped at the end, ctid last',
  },
  {
    name: 'B3 / ctid inserted after items (CoF-payment position)',
    hashFields: insertAfter(DOC_ORDER, 'items', 'ctid'),
    note: '§16 payment-credential composition signs ctid right after items',
  },
  {
    name: 'B4 / legacy 24-field order (trio body-only, pre-D1 shape)',
    hashFields: DOC_ORDER.filter((f) => f !== 'token_flag' && f !== 'frequency'),
    note: 'what request() sent before audit D1 — never live-probed',
  },
  {
    name: 'B5 / ctid inserted after merchant_id (link-card position style)',
    hashFields: insertAfter(DOC_ORDER, 'merchant_id', 'ctid'),
    note: 'link-card signs ctid right after merchant_id',
  },
  {
    name: 'B6 / frequency body-only (25 fields, token_flag hashed)',
    hashFields: DOC_ORDER.filter((f) => f !== 'frequency'),
    note: 'in case only token_flag joined the hash',
  },
  {
    name: 'C1 / ITEMS PRESENT, ctid after items (B3 order with a non-empty items hash position)',
    hashFields: insertAfter(DOC_ORDER, 'items', 'ctid'),
    bodyOverride: { items: encodeBase64IfNeeded([{ name: 'probe item', quantity: 1, price: 1 }]) },
    note: 'disambiguates ctid-after-items from ctid-after-amount (identical when items is empty)',
  },
  {
    name: 'C2 / ITEMS PRESENT, ctid before items (right after amount)',
    hashFields: insertAfter(DOC_ORDER, 'amount', 'ctid'),
    bodyOverride: { items: encodeBase64IfNeeded([{ name: 'probe item', quantity: 1, price: 1 }]) },
    note: 'mirror of C1 — only one of the two can be the gateway composition',
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────

// Optional case filter: `npx tsx scripts/sandbox-probe-subscription.ts C1 C2`
// matches the case-id prefix before " /" in the case name.
const ONLY = process.argv.slice(2);
const CASES_TO_RUN = ONLY.length > 0 ? CASES.filter((c) => ONLY.some((id) => c.name.startsWith(`${id} /`))) : CASES;

const WRONG_HASH_CODES = new Set(['1', '01', 'PTL02']);

function isWrongHash(code: string | number | undefined): boolean {
  return code !== undefined && WRONG_HASH_CODES.has(String(code));
}

interface Result extends Case {
  httpStatus: number;
  code?: string;
  message?: string;
  verdict: 'HASH_ACCEPTED' | 'HASH_REJECTED' | 'HTTP_ERROR_NO_JSON' | 'NETWORK_ERR';
  raw: string;
}

async function runCase(c: Case): Promise<Result> {
  const caseBody: Record<string, unknown> = { ...BODY, ...(c.bodyOverride ?? {}) };
  const body = { ...caseBody, hash: generateHmac(caseBody, c.hashFields, API_KEY) };
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINTS.purchase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let code: string | undefined;
    let message: string | undefined;
    try {
      const parsed = JSON.parse(text) as {
        status?: { code?: string | number; message?: string };
        code?: string | number;
        message?: string;
      };
      code = parsed.status?.code !== undefined ? String(parsed.status.code) : parsed.code !== undefined ? String(parsed.code) : undefined;
      message = parsed.status?.message ?? parsed.message;
    } catch {
      /* non-JSON body */
    }
    const verdict: Result['verdict'] =
      code === undefined ? 'HTTP_ERROR_NO_JSON' : isWrongHash(code) ? 'HASH_REJECTED' : 'HASH_ACCEPTED';
    return { ...c, httpStatus: res.status, code, message, verdict, raw: text.slice(0, 600) };
  } catch (error) {
    return {
      ...c,
      httpStatus: 0,
      verdict: 'NETWORK_ERR',
      raw: String(error),
    };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const lines: string[] = [];
const log = (s: string) => {
  console.log(s);
  lines.push(s);
};

log(`# subscription-trio hash probe — ${new Date().toISOString()}`);
log(`base_url: ${BASE_URL}`);
log(`merchant_id: ${process.env.PAYWAY_MERCHANT_ID ?? '(unset)'}`);
log(`tran_id: ${TRAN_ID}  ctid: ${CTID}`);
log(`body fields: ${Object.keys(BODY).sort().join(', ')}`);
log(`body values: ${JSON.stringify(BODY)}`);
log('');

const results: Result[] = [];
for (const c of CASES_TO_RUN) {
  const r = await runCase(c);
  results.push(r);
  log(`── ${r.name}`);
  log(`   order: ${r.hashFields.join('.')}`);
  log(`   note: ${r.note}`);
  log(`   HTTP ${r.httpStatus}  code=${r.code ?? '-'}  verdict=${r.verdict}`);
  log(`   message: ${r.message ?? '-'}`);
  log(`   raw: ${r.raw.replace(/\s+/g, ' ').slice(0, 400)}`);
  log('');
}

const accepted = results.length > 0;
log('── SUMMARY ──────────────────────────────────────────────');
for (const r of results) log(`${r.verdict === 'HASH_ACCEPTED' ? '✅' : '❌'} ${r.name} → code=${r.code ?? '-'} (${r.verdict})`);
if (results.some((r) => r.verdict === 'HASH_ACCEPTED')) {
  log('');
  log('AT LEAST ONE alternative composition was ACCEPTED by the hash layer.');
  log('→ The documented 26-field order is NOT what the gateway enforces for the trio.');
  log('  Next: confirm the accepted order is stable, then realign PURCHASE_HASH_FIELDS (or add a subscription-specific order) + pins + CHANGELOG.');
} else if (accepted) {
  log('');
  log('ALL candidate compositions REJECTED (Wrong Hash).');
  log('→ Either the real order is outside this matrix, or the gateway rejects the trio');
  log('  at the hash layer for a gateway/profile-side reason (contradicting §16 rule).');
  log('  Draft the ABA question: is merchant profile subscription-enabled, and what is the');
  log('  AUTHORITATIVE purchase hash order when token_flag/frequency are present?');
}

const outDir = path.join('test-output', 'subscription-hash');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`\n📝 evidence: ${outFile}`);
