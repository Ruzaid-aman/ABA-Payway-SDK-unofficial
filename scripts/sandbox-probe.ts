/**
 * sandbox-probe.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration probe for two unverified PayWay sandbox paths:
 *
 *   1. check-transaction  vs  check-transaction-2
 *   2. transaction-list   vs  transaction-list-2
 *   3. getTransactionList HMAC: string concat  vs  arithmetic (+) for
 *      to_date + from_amount (as in PayWay's reference PHP docs)
 *
 * Usage:
 *   PAYWAY_MERCHANT_ID=xxx PAYWAY_API_KEY=yyy npx tsx scripts/sandbox-probe.ts
 *
 *   Optional env vars:
 *     PAYWAY_BASE_URL   — defaults to https://checkout-sandbox.payway.com.kh
 *     PAYWAY_TRAN_ID    — sandbox transaction ID (any value is fine for path detection)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'node:crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY     = process.env.PAYWAY_API_KEY     ?? '';
const BASE_URL    = process.env.PAYWAY_BASE_URL    ?? 'https://checkout-sandbox.payway.com.kh';
const TRAN_ID     = process.env.PAYWAY_TRAN_ID     ?? 'PROBE_TEST_001';

if (!MERCHANT_ID || !API_KEY) {
  console.error(
    '\n❌  Missing credentials.\n' +
    '    Set PAYWAY_MERCHANT_ID and PAYWAY_API_KEY environment variables.\n' +
    '    Example:\n' +
    '      PAYWAY_MERCHANT_ID=mc_xxx PAYWAY_API_KEY=key_yyy npx tsx scripts/sandbox-probe.ts\n'
  );
  process.exit(1);
}

// ── Signing helpers ───────────────────────────────────────────────────────────

function getReqTime(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    now.getUTCFullYear() +
    p(now.getUTCMonth() + 1) +
    p(now.getUTCDate()) +
    p(now.getUTCHours()) +
    p(now.getUTCMinutes()) +
    p(now.getUTCSeconds())
  );
}

/**
 * Standard HMAC — concatenate field values in order (empty string for
 * missing/undefined), HMAC-SHA512, base64 encode.
 */
function hmacSign(body: Record<string, any>, fields: string[], key: string): string {
  const plaintext = fields.map(f => body[f] ?? '').join('');
  return crypto.createHmac('sha512', key).update(plaintext).digest('base64');
}

/**
 * Arithmetic variant — PayWay's reference PHP uses `$to_date + $from_amount`
 * (numeric addition) instead of `.` (string concat) for these two fields.
 * PHP coerces non-numeric strings to 0 first, so "20241231" → 20241231.
 */
function hmacSignArithmetic(body: Record<string, any>, fields: string[], key: string): string {
  const parts: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f    = fields[i];
    const next = fields[i + 1];
    if (f === 'to_date' && next === 'from_amount') {
      const toDate     = parseFloat(String(body[f]    ?? 0)) || 0;
      const fromAmount = parseFloat(String(body[next] ?? 0)) || 0;
      parts.push(String(toDate + fromAmount));
      i++; // skip from_amount — already consumed above
    } else {
      parts.push(String(body[f] ?? ''));
    }
  }
  const plaintext = parts.join('');
  return crypto.createHmac('sha512', key).update(plaintext).digest('base64');
}

// ── HTTP probe ────────────────────────────────────────────────────────────────

type Verdict = 'PATH_OK' | 'PATH_MISSING' | 'NETWORK_ERR' | 'HMAC_REJECTED';

interface ProbeResult {
  path: string;
  status: number | 'ERR';
  statusText: string;
  bodySnippet: string;
  verdict: Verdict;
}

async function probe(
  path: string,
  body: Record<string, any>,
  hmacFields: string[]
): Promise<ProbeResult> {
  const payload = { ...body, merchant_id: MERCHANT_ID };
  payload.hash  = hmacSign(payload, hmacFields, API_KEY);

  let status: number | 'ERR' = 'ERR';
  let statusText = '';
  let rawBody    = '';

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    status     = res.status;
    statusText = res.statusText;
    rawBody    = await res.text();
  } catch (err: any) {
    return {
      path,
      status:      'ERR',
      statusText:  err?.message ?? 'Network error',
      bodySnippet: '',
      verdict:     'NETWORK_ERR',
    };
  }

  const bodySnippet = rawBody.length > 350 ? rawBody.slice(0, 350) + '…' : rawBody;

  let verdict: Verdict;
  if (status === 200) {
    let json: any = null;
    try { json = JSON.parse(rawBody); } catch { /* HTML or plain text */ }

    if (json) {
      // code:"1" == "Wrong hash" → path reached, signing was off
      verdict = (json.status === 'FAILED' && String(json.code) === '1')
        ? 'HMAC_REJECTED'
        : 'PATH_OK';
    } else if (rawBody.trimStart().startsWith('<')) {
      // HTML error page → path probably doesn't exist
      verdict = 'PATH_MISSING';
    } else {
      verdict = 'PATH_OK';
    }
  } else if (status === 404) {
    verdict = 'PATH_MISSING';
  } else if (typeof status === 'number' && status >= 400) {
    // Other 4xx/5xx — server responded, so path exists
    verdict = 'PATH_OK';
  } else {
    verdict = 'PATH_MISSING';
  }

  return { path, status, statusText, bodySnippet, verdict };
}

// ── Display ───────────────────────────────────────────────────────────────────

const VERDICT_ICON: Record<Verdict, string> = {
  PATH_OK:      '✅',
  PATH_MISSING: '❌',
  NETWORK_ERR:  '🔌',
  HMAC_REJECTED:'🔑',
};

const VERDICT_NOTE: Record<Verdict, string> = {
  PATH_OK:       'Path exists and server responded (or hash accepted).',
  PATH_MISSING:  'Path returned 404 or HTML — endpoint does not exist at this URL.',
  NETWORK_ERR:   'Could not reach server — check BASE_URL and firewall.',
  HMAC_REJECTED: 'Path exists but server rejected the hash (code:1). Path is correct; signing may need a tweak.',
};

function printResult(label: string, r: ProbeResult) {
  const icon = VERDICT_ICON[r.verdict];
  console.log(`\n  ${icon}  [${label}]`);
  console.log(`      Path    : ${r.path}`);
  console.log(`      HTTP    : ${r.status} ${r.statusText}`);
  console.log(`      Verdict : ${r.verdict} — ${VERDICT_NOTE[r.verdict]}`);
  if (r.bodySnippet) {
    console.log(`      Body    : ${r.bodySnippet}`);
  }
}

function separator(title: string) {
  console.log('\n' + '─'.repeat(74));
  console.log(`  ${title}`);
  console.log('─'.repeat(74));
}

function recommendation(a: ProbeResult, b: ProbeResult, suffixLabel: string, noSuffixLabel: string) {
  console.log('\n  📌 Recommendation:');
  const aOk = a.verdict === 'PATH_OK' || a.verdict === 'HMAC_REJECTED';
  const bOk = b.verdict === 'PATH_OK' || b.verdict === 'HMAC_REJECTED';

  if (aOk && !bOk) {
    console.log(`     ✔ Use  ${suffixLabel}  (with -2 suffix). No changes needed.`);
  } else if (!aOk && bOk) {
    console.log(`     ✔ Use  ${noSuffixLabel}  (no suffix). Drop -2 from spec + client.`);
  } else if (aOk && bOk) {
    console.log(`     ⚠ Both paths responded — server likely aliases them.`);
    console.log(`       Keep the -2 suffix as-is; it works.`);
  } else {
    console.log(`     ✘ Neither path responded. Verify BASE_URL and credentials.`);
  }
}

// ── Test 1: check-transaction ─────────────────────────────────────────────────

async function testCheckTransaction() {
  separator('TEST 1 — check-transaction: is the -2 suffix real?');
  console.log(`  Using transaction ID: "${TRAN_ID}"`);
  console.log('  (A "not found" JSON response still counts as PATH_OK — the path was reached.)\n');

  const fields   = ['req_time', 'merchant_id', 'tran_id'];
  const req_time = getReqTime();
  const body     = { req_time, tran_id: TRAN_ID };

  const [withSuffix, withoutSuffix] = await Promise.all([
    probe('/api/payment-gateway/v1/payments/check-transaction-2', body, fields),
    probe('/api/payment-gateway/v1/payments/check-transaction',   body, fields),
  ]);

  printResult('check-transaction-2  (our spec)', withSuffix);
  printResult('check-transaction    (no suffix)', withoutSuffix);
  recommendation(withSuffix, withoutSuffix, 'check-transaction-2', 'check-transaction');
}

// ── Test 2: transaction-list ──────────────────────────────────────────────────

async function testTransactionList() {
  separator('TEST 2 — transaction-list: is the -2 suffix real?');
  console.log('  (Using a full-year date range — any response counts.)\n');

  const fields = [
    'req_time', 'merchant_id',
    'from_date', 'to_date', 'from_amount', 'to_amount',
    'status', 'page', 'pagination',
  ];
  const req_time = getReqTime();
  const body = {
    req_time,
    from_date:   '20240101',
    to_date:     '20241231',
    from_amount: '0',
    to_amount:   '999999',
  };

  const [withSuffix, withoutSuffix] = await Promise.all([
    probe('/api/payment-gateway/v1/payments/transaction-list-2', body, fields),
    probe('/api/payment-gateway/v1/payments/transaction-list',   body, fields),
  ]);

  printResult('transaction-list-2  (our spec)', withSuffix);
  printResult('transaction-list    (no suffix)', withoutSuffix);
  recommendation(withSuffix, withoutSuffix, 'transaction-list-2', 'transaction-list');
}

// ── Test 3: HMAC variant for transaction-list ─────────────────────────────────

async function testHmacVariant() {
  separator('TEST 3 — getTransactionList HMAC: string-concat vs PHP arithmetic +');
  console.log('  PayWay\'s PHP reference uses `$to_date + $from_amount` (arithmetic)');
  console.log('  instead of `.` string concat. We probe which variant the server accepts.\n');

  // Use a non-zero from_amount so the two hashes diverge
  const from_amount_raw = process.env.PAYWAY_FROM_AMOUNT ?? '100';
  const fields = [
    'req_time', 'merchant_id',
    'from_date', 'to_date', 'from_amount', 'to_amount',
    'status', 'page', 'pagination',
  ];
  const req_time = getReqTime();
  const body: Record<string, any> = {
    req_time,
    merchant_id:  MERCHANT_ID,
    from_date:    '20240101',
    to_date:      '20241231',
    from_amount:  from_amount_raw,
    to_amount:    '999999',
  };

  const hashConcat    = hmacSign(body, fields, API_KEY);
  const hashArithm    = hmacSignArithmetic(body, fields, API_KEY);
  const hashesMatch   = hashConcat === hashArithm;

  // Show the differing plaintexts
  const phpNum = (parseFloat(body.to_date) || 0) + (parseFloat(body.from_amount) || 0);
  console.log(`  from_amount used     : ${from_amount_raw}`);
  console.log(`  String-concat frag   : …${body.to_date}${body.from_amount}…`);
  console.log(`  Arithmetic frag      : …${phpNum}…`);
  console.log(`  Hashes match?        : ${hashesMatch ? 'YES (no difference to probe)' : 'NO (can probe both)'}`);

  if (hashesMatch) {
    console.log('\n  ℹ️  Hashes are identical. Set PAYWAY_FROM_AMOUNT to a non-zero value,');
    console.log('     e.g.: PAYWAY_FROM_AMOUNT=100 npx tsx scripts/sandbox-probe.ts');
    return;
  }

  // Probe concat variant
  async function rawProbe(label: string, hash: string): Promise<void> {
    const payload = { ...body, hash };
    try {
      const res  = await fetch(
        `${BASE_URL}/api/payment-gateway/v1/payments/transaction-list-2`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* */ }

      const accepted  = json && !(json.status === 'FAILED' && String(json.code) === '1');
      const pathFound = json !== null || !text.trimStart().startsWith('<');
      const icon      = accepted ? '✅' : (pathFound ? '🔑' : '❌');
      console.log(`\n  ${icon}  [${label}]`);
      console.log(`      HTTP     : ${res.status}`);
      console.log(`      Body     : ${text.slice(0, 250)}`);
      if (accepted) {
        console.log('      ✔ Server ACCEPTED this HMAC variant.');
      } else if (pathFound) {
        console.log('      ✘ Server REJECTED hash (code:1). This variant is wrong.');
      } else {
        console.log('      ✘ Path not found or HTML response.');
      }
    } catch (err: any) {
      console.log(`\n  🔌  [${label}]  Network error: ${err?.message}`);
    }
  }

  await rawProbe('String-concat  (our SDK current behaviour)', hashConcat);
  await rawProbe('Arithmetic +   (PHP reference behaviour)',   hashArithm);

  console.log('\n  📌 The variant that returns a non-FAILED JSON is the correct one.');
  console.log('     If arithmetic wins, update generateHmac() in src/auth.ts or');
  console.log('     add a special-case in the getTransactionList call in src/client.ts.');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║           ABA PayWay — Sandbox Path & HMAC Probe                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\n  Base URL    : ${BASE_URL}`);
  console.log(`  Merchant ID : ${MERCHANT_ID}`);
  console.log(`  API Key     : ${'*'.repeat(Math.max(0, API_KEY.length - 4))}${API_KEY.slice(-4)}`);

  await testCheckTransaction();
  await testTransactionList();
  await testHmacVariant();

  separator('DONE — next steps');
  console.log('  Based on the results above, update these files if needed:\n');
  console.log('    payway-openapi/paths/ecommerce-checkout.yaml   (path keys)');
  console.log('    payway-openapi/openapi.yaml                    ($ref keys)');
  console.log('    src/client.ts                                  (URL strings)');
  console.log('\n  Then run:');
  console.log('    npm run bundle && npm run generate-types && npx tsc --noEmit\n');
}

main().catch(err => {
  console.error('\n💥  Unhandled error:', err);
  process.exit(1);
});
