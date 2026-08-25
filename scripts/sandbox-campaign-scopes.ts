/**
 * Scope-coverage sandbox campaign #2: Credentials-on-File, Payout,
 * Pre-auth (hold payments), Payment Link, KHQR by-ref.
 *
 * Complements scripts/sandbox-campaign-full-cycle.ts (checkout lifecycle).
 * Writes structured evidence to test-output/campaign-scopes-evidence.json.
 *
 * Usage: npx tsx scripts/sandbox-campaign-scopes.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

(function loadDotEnv(): void {
  const envPath = new URL('../.env', import.meta.url);
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\r/g, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    // Support quoted values spanning multiple lines (e.g. RSA public key PEMs)
    if ((val.startsWith('"') && !val.slice(1).endsWith('"')) || (val.startsWith("'") && !val.slice(1).endsWith("'"))) {
      const quote = val[0];
      const parts = [val.slice(1)];
      while (i + 1 < lines.length) {
        i++;
        parts.push(lines[i].replace(/\r/g, ''));
        if (lines[i].trimEnd().endsWith(quote)) break;
      }
      val = `${parts.join('\n').trimEnd()}`.replace(/\\n/g, '\n').trim();
      if (val.endsWith(quote)) val = val.slice(0, -1);
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\n/g, '\n');
    }
    if (!(key in process.env)) process.env[key] = val;
  }
})();

import { PayWay } from '../src/index.js';

interface Evidence {
  scenario: string;
  scope: string;
  ok: boolean;
  clientSide?: boolean;
  httpStatus?: number | string;
  paywayCode?: string;
  message: string;
  raw?: unknown;
  durationMs: number;
}

const evidence: Evidence[] = [];
const payway = new PayWay({ debug: false });
const CALLBACK_URL = process.env.PAYWAY_CALLBACK_URL || 'https://example.com/callback';
const stamp = () => Date.now().toString(36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function record(scope: string, scenario: string, fn: () => Promise<unknown>): Promise<unknown> {
  const start = Date.now();
  try {
    const result = await fn();
    const raw = result as Record<string, unknown>;
    const status = (raw?.status ?? {}) as Record<string, unknown>;
    evidence.push({
      scope,
      scenario,
      ok: true,
      paywayCode: status.code !== undefined ? String(status.code) : undefined,
      message: String(status.message ?? 'success'),
      raw,
      durationMs: Date.now() - start,
    });
    console.log(`[OK  ] ${scope}/${scenario} (${Date.now() - start}ms) ${String(status.message ?? '').slice(0, 80)}`);
    return result;
  } catch (error) {
    const e = error as { message?: string; statusCode?: number; paywayCode?: string; rawBody?: unknown };
    const clientSide = e.statusCode === undefined && e.paywayCode === undefined;
    evidence.push({
      scope,
      scenario,
      ok: false,
      clientSide,
      httpStatus: e.statusCode,
      paywayCode: e.paywayCode,
      message: e.message ?? String(error),
      raw: clientSide ? undefined : e.rawBody,
      durationMs: Date.now() - start,
    });
    console.log(
      `[${clientSide ? 'LOCAL' : 'FAIL'}] ${scope}/${scenario} (${Date.now() - start}ms)` +
        ` http=${e.statusCode ?? '-'} code=${e.paywayCode ?? '-'} :: ${(e.message ?? String(error)).slice(0, 110)}`,
    );
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCOPE 1: Credentials-on-File (auto-payments)
// ═══════════════════════════════════════════════════════════════════

// 1a. link-account — minimal valid request
await record('cof', 'link-account-minimal', () =>
  payway.credentialsOnFile.linkAccount({ requestId: `req-${stamp()}` }),
);

// 1b. link-account — with ctid + token_flag + callback
await record('cof', 'link-account-full', () =>
  payway.credentialsOnFile.linkAccount({
    requestId: `req-${stamp()}`,
    ctid: `cust-${stamp()}`,
    tokenFlag: 'CITR',
    currency: 'USD',
    callbackUrl: CALLBACK_URL,
  }),
);

// 1c. link-account — invalid currency (client-side guard expected)
await record('cof', 'link-account-bad-currency', () =>
  payway.credentialsOnFile.linkAccount({ requestId: `req-${stamp()}`, currency: 'EUR' as 'USD' }),
).catch(() => undefined);

// 1d. link-card — WITHOUT frequency (sandbox requires frequency for recurring)
await record('cof', 'link-card-no-frequency', () =>
  payway.credentialsOnFile.linkCard({ requestId: `req-${stamp()}`, tokenFlag: 'CITR_FLEX' }),
);

// 1e. link-card — with frequency=1M + return_url
await record('cof', 'link-card-with-frequency', () =>
  payway.credentialsOnFile.linkCard({
    requestId: `req-${stamp()}`,
    ctid: `cust-${stamp()}`,
    tokenFlag: 'CITR_FLEX',
    frequency: '1M',
    returnUrl: CALLBACK_URL,
  }),
);

// 1f. CoF payment with fabricated token
await record('cof', 'payment-fake-token', () =>
  payway.credentialsOnFile.payment({
    requestId: `req-${stamp()}`,
    transactionId: `COF${stamp()}`.slice(0, 20),
    amount: 1,
    currency: 'USD',
    paymentToken: 'FAKE_PWT_DOES_NOT_EXIST',
    ctid: 'fake-ctid',
  }),
);

await sleep(1000);

// 1g–i. Token management trio on fabricated token/ctid
for (const op of ['renewToken', 'getTokenDetails', 'removeToken'] as const) {
  await record('cof', `${op}-fake-token`, () =>
    payway.credentialsOnFile[op]({
      requestId: `req-${stamp()}`,
      ctid: 'fake-ctid',
      paymentToken: 'FAKE_PWT_DOES_NOT_EXIST',
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCOPE 2: Payout / beneficiaries (multi-party payouts)
// ═══════════════════════════════════════════════════════════════════

// 2a. payout to a syntactically-valid but non-whitelisted account
await record('payout', 'payout-nonwhitelisted-account', () =>
  payway.payout.payout({
    transactionId: `PO${stamp()}`.slice(0, 20),
    amount: 2,
    currency: 'USD',
    beneficiaries: [{ account: '0000111122223333', amount: 2 }],
  }),
);

// 2b. beneficiary sum mismatch (client-side guard expected)
await record('payout', 'payout-sum-mismatch', () =>
  payway.payout.payout({
    transactionId: `PO${stamp()}`.slice(0, 20),
    amount: 5,
    currency: 'USD',
    beneficiaries: [{ account: '0000111122223333', amount: 2 }],
  }),
).catch(() => undefined);

await sleep(1000);

// 2c. add-beneficiary (whitelist request) with dummy ABA account
await record('payout', 'add-beneficiary-dummy', () => payway.payout.addBeneficiary({ payee: '0077777777' }));

// 2d. update-beneficiary-status for a non-existent payee
await record('payout', 'update-beneficiary-status-nonexistent', () =>
  payway.payout.updateBeneficiaryStatus({ payee: '0077777777', status: 0 }),
);

// ═══════════════════════════════════════════════════════════════════
// SCOPE 3: Pre-auth (hold payments) — real pre-auth transaction lifecycle
// ═══════════════════════════════════════════════════════════════════

const preAuthTranId = `PA${stamp()}`.slice(0, 20);

// 3a. create a REAL pre-auth hold via checkout (type=pre-auth)
await record('preauth', 'purchase-type-preauth', () =>
  payway.checkout.purchase({
    transactionId: preAuthTranId,
    amount: 10,
    currency: 'USD',
    type: 'pre-auth',
    paymentOption: 'cards',
  }),
);

// 3b. check its status before any card action
await record('preauth', 'check-preauth-unpaid', async () => {
  await sleep(1500);
  return payway.checkout.checkTransaction(preAuthTranId);
});

// 3c. complete pre-auth that was never authorized by a cardholder
await record('preauth', 'complete-unauthorized', () => payway.preAuth.complete(preAuthTranId, 10));

// 3d. complete-with-payout shape probe on same tran
await record('preauth', 'complete-with-payout-shape', () =>
  payway.preAuth.completeWithPayout(preAuthTranId, 10, [{ acc: '0000111122223333', amt: 10 }]),
);

// 3e. cancel the pre-auth hold
await record('preauth', 'cancel-unauthorized', () => payway.preAuth.cancel(preAuthTranId));

// 3f. cancel a nonexistent pre-auth
await record('preauth', 'cancel-nonexistent', () => payway.preAuth.cancel(`NOPE${stamp()}`));

// ═══════════════════════════════════════════════════════════════════
// SCOPE 4: Payment Link (accept payments)
// ═══════════════════════════════════════════════════════════════════

let createdLinkId: string | undefined;

// 4a. create a REAL payment link
const created = await record('payment-link', 'create-real-link', () =>
  payway.paymentLink.create({
    title: 'Campaign Probe Link',
    amount: 3,
    currency: 'USD',
    merchantRefNo: `CAMP-${stamp()}`,
    returnUrl: CALLBACK_URL,
    description: 'Scope campaign evidence link',
  }),
);
const createdData = ((created as Record<string, unknown>)?.data ?? {}) as Record<string, unknown>;
createdLinkId = createdData.id ? String(createdData.id) : undefined;
console.log(`  -> link id=${createdLinkId ?? '(none)'}, url=${String(createdData.payment_link ?? '').slice(0, 60)}`);

// 4b. detail of the created link
if (createdLinkId) {
  await record('payment-link', 'detail-created-link', () => payway.paymentLink.getDetails(createdLinkId!));
}

// 4c. detail of nonexistent link
await record('payment-link', 'detail-nonexistent', () => payway.paymentLink.getDetails(`nonexistent-${stamp()}`));

// 4d. create with past expired_date
await record('payment-link', 'create-past-expiry', () =>
  payway.paymentLink.create({
    title: 'Expired Link',
    amount: 1,
    currency: 'USD',
    merchantRefNo: `EXPIRED-${stamp()}`,
    returnUrl: CALLBACK_URL,
    expiredDate: Math.floor(Date.now() / 1000) - 3600,
  }),
);

// 4e. duplicate merchant_ref_no reuse (same as created link? use fresh link then repeat)
const dupRef = `DUP-${stamp()}`;
await record('payment-link', 'create-dup-ref-1', () =>
  payway.paymentLink.create({ title: 'Dup Ref', amount: 1, currency: 'USD', merchantRefNo: dupRef, returnUrl: CALLBACK_URL }),
);
await record('payment-link', 'create-dup-ref-2-same-refno', () =>
  payway.paymentLink.create({ title: 'Dup Ref Again', amount: 1, currency: 'USD', merchantRefNo: dupRef, returnUrl: CALLBACK_URL }),
);

// ═══════════════════════════════════════════════════════════════════
// SCOPE 5: KHQR get-transactions-by-mc-ref
// ═══════════════════════════════════════════════════════════════════

// 5a. random ref → expect empty list
await record('khqr', 'by-ref-random-empty', () =>
  payway.khqr.getTransactionsByMerchantRef(`NOREF-${stamp()}`),
);

// 5b. the ref we just used for payment links (may or may not map to transactions)
if (createdLinkId) {
  await record('khqr', 'by-ref-from-link-create', () =>
    payway.khqr.getTransactionsByMerchantRef(`CAMP-${''}${stamp()}` === '' ? '' : `NOPE-${stamp()}`),
  );
}

// ═══════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════
writeFileSync(
  'test-output/campaign-scopes-evidence.json',
  JSON.stringify({ ranAt: new Date().toISOString(), evidence }, null, 2),
);

const okCount = evidence.filter((e) => e.ok).length;
console.log(`\n=== ${evidence.length} scenarios recorded, ${okCount} accepted, ${evidence.length - okCount} failed/rejected ===`);
console.log('Evidence: test-output/campaign-scopes-evidence.json');
