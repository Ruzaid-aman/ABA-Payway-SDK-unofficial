/**
 * sandbox-probe-cof.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration probe for Credentials on File endpoints on PayWay sandbox.
 *
 * Usage:
 *   PAYWAY_MERCHANT_ID=xxx PAYWAY_API_KEY=yyy npx tsx scripts/sandbox-probe-cof.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'node:crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? 'ec476910';
const API_KEY     = process.env.PAYWAY_API_KEY     ?? 'test_key';
const BASE_URL    = process.env.PAYWAY_BASE_URL    ?? 'https://checkout-sandbox.payway.com.kh';

if (!MERCHANT_ID || !API_KEY) {
  console.error(
    '\n❌  Missing credentials.\n' +
    '    Set PAYWAY_MERCHANT_ID and PAYWAY_API_KEY environment variables.\n'
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

function hmacSign(body: Record<string, any>, fields: string[], key: string): string {
  const plaintext = fields.map(f => body[f] ?? '').join('');
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
      verdict = 'PATH_MISSING';
    } else {
      verdict = 'PATH_OK';
    }
  } else if (status === 404) {
    verdict = 'PATH_MISSING';
  } else if (typeof status === 'number' && status >= 400) {
    verdict = 'PATH_OK';
  } else {
    verdict = 'PATH_MISSING';
  }

  return { path, status, statusText, bodySnippet, verdict };
}

async function probeUrlEncoded(
  path: string,
  body: Record<string, any>,
  hmacFields: string[]
): Promise<ProbeResult> {
  const payload = { ...body, merchant_id: MERCHANT_ID };
  payload.hash  = hmacSign(payload, hmacFields, API_KEY);

  let status: number | 'ERR' = 'ERR';
  let statusText = '';
  let rawBody    = '';
  
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    form.append(key, String(value));
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form,
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
  let verdict: Verdict = 'PATH_OK';
  let json: any = null;
  try { json = JSON.parse(rawBody); } catch {}
  if (json && json.status === 'FAILED' && String(json.code) === '1') {
    verdict = 'HMAC_REJECTED';
  } else if (rawBody.trimStart().startsWith('<') || status === 404) {
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
  HMAC_REJECTED: 'Path exists but server rejected the hash (code:1).',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  const req_time = getReqTime();
  const request_id = 'req123456';
  
  separator('Testing Link Account');
  const linkAccountRes = await probe('/api/payment-credential/v3/aof/link-account', {
    request_time: req_time,
    request_id,
    ctid: 'customer123',
    token_flag: 'CITR_FLEX',
    currency: 'USD',
  }, ['request_time', 'merchant_id', 'request_id', 'ctid', 'return_deeplink', 'token_flag', 'currency', 'callback_url']);
  printResult('Link Account', linkAccountRes);

  separator('Testing Link Card (urlencoded)');
  const linkCardRes = await probeUrlEncoded('/api/payment-credential/v3/cof/link-card', {
    request_time: req_time,
    request_id,
    ctid: 'customer123',
    token_flag: 'CITR_FLEX',
    currency: 'USD',
    frequency: 'ONCE',
  }, ['request_time', 'merchant_id', 'request_id', 'ctid', 'return_deeplink', 'token_flag', 'return_url', 'callback_url']);
  printResult('Link Card (urlencoded)', linkCardRes);

  separator('Testing Cof Payment');
  const cofPaymentRes = await probe('/api/payment-gateway/v3/purchase/payment-credential', {
    request_time: req_time,
    request_id,
    tran_id: 'coftesttran',
    amount: '1.00',
    pwt: 'dummy_token',
    ctid: 'customer123',
    token_flag: 'CITU_FLEX',
    currency: 'USD',
  }, ['request_time', 'merchant_id', 'request_id', 'tran_id', 'amount', 'pwt', 'token_flag', 'currency', 'callback_url']);
  printResult('Cof Payment', cofPaymentRes);

  separator('Testing Renew Token');
  const renewTokenRes = await probe('/api/payment-credential/v3/token-management/renew-expired-account-token', {
    request_time: req_time,
    request_id,
    pwt: 'dummy_token',
    ctid: 'customer123',
  }, ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt']);
  printResult('Renew Token', renewTokenRes);

  separator('Testing Get Token Details');
  const getTokenDetailsRes = await probe('/api/payment-credential/v3/token-management/get-token-details', {
    request_time: req_time,
    request_id,
    pwt: 'dummy_token',
    ctid: 'customer123',
  }, ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt']);
  printResult('Get Token Details', getTokenDetailsRes);

  separator('Testing Remove Token');
  const removeTokenRes = await probe('/api/payment-credential/v3/token-management/remove-token', {
    request_time: req_time,
    request_id,
    pwt: 'dummy_token',
    ctid: 'customer123',
  }, ['request_time', 'merchant_id', 'request_id', 'ctid', 'pwt']);
  printResult('Remove Token', removeTokenRes);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║           ABA PayWay — Sandbox CoF Probe                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\n  Base URL    : ${BASE_URL}`);
  console.log(`  Merchant ID : ${MERCHANT_ID}`);
  console.log(`  API Key     : ${'*'.repeat(Math.max(0, API_KEY.length - 4))}${API_KEY.slice(-4)}`);

  await runTests();
  console.log('\nDONE.');
}

main().catch(err => {
  console.error('\n💥  Unhandled error:', err);
  process.exit(1);
});
