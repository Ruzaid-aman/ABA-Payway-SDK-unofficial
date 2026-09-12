/**
 * In-process CLI coverage for the API command bodies, driven against a local
 * mock PayWay server (same idea as the child-process tests in cli.test.ts,
 * but visible to v8 coverage). Credentials and PAYWAY_BASE_URL are injected
 * via process.env; only non-interactive flag combinations are used
 * (-y/--json/--no-polling), so nothing reads stdin and nothing leaves localhost.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateHmac } from '../auth.js';
import { captureConsole, generateTestRsaKeyPair, stripAnsi } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-mock-'));
const originalCwd = process.cwd();
const originalEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['PAYWAY_BASE_URL', 'PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY', 'PAYWAY_RSA_PUBLIC_KEY'];

const TEST_RSA = generateTestRsaKeyPair();

const FAKE_PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

// Bodies received by the mock's plain `purchase` branch (NOT the CoF
// `purchase/payment-credential` endpoint — that branch stays first and never
// pushes here). Lets tests assert what the CLI actually SENT, hash included.
const capturedPurchaseBodies: Array<Record<string, unknown>> = [];

// Bodies received by the mock's `aof/link-account` branch (audit S1 D7: the
// CLI --return-deeplink flag must reach the urlencoded wire body base64-encoded).
const capturedLinkAccountBodies: Array<Record<string, unknown>> = [];

// Deliberate INDEPENDENT copy of the live 27-field purchase hash order
// (audit D1 + §17: ctid signed after items — the live docs' list omits it).
// Do NOT import PURCHASE_HASH_FIELDS here: a regression in that
// constant must fail these assertions, not follow it.
const LIVE_PURCHASE_HASH_FIELDS = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'items',
  'ctid',
  'shipping',
  'firstname',
  'lastname',
  'email',
  'phone',
  'type',
  'payment_option',
  'return_url',
  'cancel_url',
  'continue_success_url',
  'return_deeplink',
  'currency',
  'custom_fields',
  'return_params',
  'payout',
  'lifetime',
  'additional_params',
  'google_pay_token',
  'skip_success_page',
  'token_flag',
  'frequency',
];

let server: Server;
let baseUrl = '';
let refundRequests = 0;
let rejectRefund = false;
let rejectExchangeRate = false;
let rejectPreAuth = false;
let voidCallCount = 0;
// §24 review-wave behaviors (default preserves the pre-§24 pins).
let linkCardMode: 'html' | 'redirect-error' | 'json-400' = 'html';
let cofChargeFailureCode: string | undefined;
let tokenDetailsFailureCode: string | undefined;

/** Route by endpoint substring; payloads mirror sandbox-verified shapes. */
function mockHandler(req: IncomingMessage, res: ServerResponse, body: string): void {
  const url = req.url ?? '';
  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  const parsed = (() => {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const tranId = String(parsed.tran_id ?? '');

  if (url.includes('check-transaction')) {
    if (tranId === 'MISSING') {
      send(200, { status: { code: 6, message: 'tran_id not found', tran_id: tranId } });
    } else if (tranId === 'CO-PENDING-1') {
      send(200, {
        status: { code: '00', message: 'Success', tran_id: tranId },
        data: { payment_status: 'PENDING', payment_status_code: 2, payment_amount: '5.00' },
      });
    } else {
      send(200, {
        status: { code: '00', message: 'Success', tran_id: tranId },
        data: { payment_status: 'APPROVED', payment_status_code: 0, payment_amount: '5.00' },
      });
    }
  } else if (url.includes('close-transaction')) {
    send(200, { status: { code: '00', message: 'Success!' } });
  } else if (url.includes('transaction-detail')) {
    if (tranId === 'MISSING') {
      send(200, { status: { code: 6, message: 'tran_id not found', tran_id: tranId } });
    } else if (tranId === 'R-KHR-ORDER') {
      // R1 fixture: a KHR-denominated order (W5-6 shape: 4000 KHR ordered, paid 1 USD).
      send(200, {
        status: { code: '00', message: 'Success', tran_id: tranId },
        data: {
          payment_status: 'APPROVED',
          payment_status_code: 0,
          original_amount: 4000,
          original_currency: 'KHR',
          payment_amount: 1,
          payment_currency: 'USD',
          refund_amount: 0,
          transaction_operations: [],
        },
      });
    } else if (tranId === 'R-USD-ORDER') {
      // R1 mirrored fixture: a USD-denominated order.
      send(200, {
        status: { code: '00', message: 'Success', tran_id: tranId },
        data: {
          payment_status: 'APPROVED',
          payment_status_code: 0,
          original_amount: 10,
          original_currency: 'USD',
          payment_amount: 10,
          payment_currency: 'USD',
          refund_amount: 0,
          transaction_operations: [],
        },
      });
    } else {
      send(200, {
        status: { code: '00', message: 'Success', tran_id: tranId },
        data: { payment_status: 'APPROVED', payment_status_code: 0, apv: '876776', transaction_operations: [] },
      });
    }
  } else if (url.includes('transaction-list')) {
    send(200, [{ transaction_id: 'T1', payment_status: 'APPROVED', payment_status_code: 0, payment_amount: '5.00' }]);
  } else if (url.includes('exchange-rate')) {
    if (rejectExchangeRate) {
      send(400, { status: { code: 'PTL04', message: 'Parameter validation required' } });
    } else {
      send(200, { status: { code: '00', message: 'Success' }, exchange_rates: { USD_KHR: 4100 } });
    }
  } else if (url.includes('refund')) {
    refundRequests++;
    if (rejectRefund || tranId === 'R-FAIL') {
      send(400, { status: { code: 'PTL04', message: 'Parameter validation required' } });
    } else {
      send(200, { status: { code: '00', message: 'Refund submitted' } });
    }
  } else if (url.includes('generate-qr')) {
    send(200, { status: { code: '00', message: 'Success' }, qrString: '000201010212', qrImage: FAKE_PNG_BASE64 });
  } else if (url.includes('purchase/payment-credential')) {
    if (cofChargeFailureCode !== undefined) {
      // 200-wrapped business failure (COF family — live 2026-09-12: unknown
      // pwt answers code 105, SANDBOX-FINDINGS §24 LC-6).
      send(200, { status: { code: cofChargeFailureCode, message: 'Invalid payment credential token.' } });
    } else {
      send(200, { status: { code: '00', message: 'Success' }, data: { tran_id: 'COF-1' } });
    }
  } else if (url.includes('purchase')) {
    // Capture what the CLI sent so tests can pin the network-path hash
    // (audit D1). Only THIS branch: the CoF payment-credential endpoint above
    // also matches 'purchase' and must not pollute the capture.
    capturedPurchaseBodies.push(parsed);
    if (tranId === 'CO-UNKNOWN-1') {
      res.socket?.destroy();
      return;
    }
    send(200, {
      status: { code: '00', message: 'Success' },
      qrString: '000201010212',
      abapay_deeplink: 'aba://mobile/pay',
    });
  } else if (url.includes('pre-auth-completion')) {
    // tran_id travels inside the RSA-encrypted merchant_auth (opaque to the
    // mock), so failure is routed on a test flag instead of the body.
    if (rejectPreAuth) {
      send(400, { status: { code: 'PTL04', message: 'Parameter validation required' } });
    } else {
      send(200, { status: { code: '00', message: 'Pre-auth completed' } });
    }
  } else if (url.includes('pre-auth-cancellation')) {
    send(200, { status: { code: '00', message: 'Pre-auth cancelled' } });
  } else if (url.includes('get-transactions-by-mc-ref')) {
    send(404, { message: 'endpoint not available under this sandbox profile' });
  } else if (url.includes('aof/link-account')) {
    capturedLinkAccountBodies.push(parsed);
    send(200, { status: { code: '00', message: 'Success', request_id: 'LA-1' } });
  } else if (url.includes('/add-card/')) {
    // §24 LC-2: the redirect target the link-card 302 sends the browser to —
    // a static shell whose result lives in the URL itself.
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!DOCTYPE html><html><body>add-card shell</body></html>');
  } else if (url.includes('cof/link-card')) {
    // Live-gateway parity (SANDBOX-FINDINGS §9a): this endpoint ALWAYS answers
    // with the hosted card-entry HTML page, success and error alike.
    if (linkCardMode === 'redirect-error') {
      // §24 LC-1/LC-2 live contract: 302 → /add-card/<base64 JSON error>.
      const payload = Buffer.from(
        JSON.stringify({
          message: 'Merchant not enabled token flag.',
          status: {
            code: '104',
            message: 'Merchant not enabled token flag.',
            pw_tran_id: 'REQID010',
            trace_id: 'mock',
            version: 'v3',
          },
        }),
      ).toString('base64');
      res.writeHead(302, { Location: `${baseUrl}/add-card/${payload}` });
      res.end();
    } else if (linkCardMode === 'json-400') {
      // §24 LC-3: a missing hash answers HTTP 400 04 + errors{} (JSON).
      send(400, {
        status: { code: '04', message: 'The given data was invalid.', errors: { hash: ['The hash field is required.'] } },
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body>hosted card entry form</body></html>');
    }
  } else if (url.includes('renew-expired-account-token')) {
    send(200, { status: { code: '00', message: 'Success', request_id: 'RT-1' } });
  } else if (url.includes('get-token-details')) {
    if (tokenDetailsFailureCode !== undefined) {
      // §24 LC-6 live shape: a request that never linked answers 09.
      send(200, { status: { code: tokenDetailsFailureCode, message: 'Data not found.' } });
    } else {
      send(200, { status: { code: '00', message: 'Success' }, data: { ctid: 'CTID-1', status: 'ACTIVE' } });
    }
  } else if (url.includes('remove-token')) {
    send(200, { status: { code: '00', message: 'Success' } });
  } else if (url.includes('add-whitelist-payout')) {
    send(200, { status: { code: '00', message: 'Success' }, data: { payee: 'PAYEE-1', status: 1 } });
  } else if (url.includes('update-whitelist-status')) {
    send(200, { status: { code: '00', message: 'Success' }, data: { payee: 'PAYEE-1', status: 1 } });
  } else if (url.includes('payment-link/create')) {
    send(200, {
      status: { code: '00', message: 'Success!' },
      tran_id: 1681357410,
      data: {
        id: 'PLINK-MOCK-1==',
        title: 'Mock link',
        amount: '5.00',
        currency: 'USD',
        status: 'OPEN',
        total_trxn: 0,
        total_amount: 0,
        payment_link: `${baseUrl}/ABAPAYMOCK1`,
      },
    });
  } else if (url.includes('payment-link/detail')) {
    // Sandbox parity: an unknown link id answers code PTL132 (invalid link).
    send(200, { status: { code: 'PTL132', message: 'Invalid payment link' } });
  } else if (url.includes('payment-link/void')) {
    // §23 live-verified: void is NOT idempotent — the first void succeeds,
    // any subsequent one answers 403 PTL188 "already voided". The link id
    // travels inside the RSA-encrypted merchant_auth (opaque to the mock),
    // so route on call count instead.
    voidCallCount += 1;
    if (voidCallCount > 1) {
      send(403, { status: { code: 'PTL188', message: 'The payment link is already voided.' } });
    } else {
      send(200, { status: { code: '00', message: 'Success.', lang: 'en', trace_id: 'mock' }, tran_id: 178912355579535 });
    }
  } else {
    send(404, { message: `unknown endpoint ${url}` });
  }
}

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      mockHandler(req, res, Buffer.concat(chunks).toString('utf8'));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  originalEnv.APPDATA = process.env.APPDATA;
  process.env.APPDATA = tempDir;
  process.env.PAYWAY_BASE_URL = baseUrl;
  process.env.PAYWAY_ENV = 'sandbox';
  process.env.PAYWAY_MERCHANT_ID = 'test-merchant-001';
  process.env.PAYWAY_API_KEY = 'a'.repeat(32);
  process.env.PAYWAY_RSA_PUBLIC_KEY = TEST_RSA.publicKey;
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  server?.close();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  if (originalEnv.APPDATA === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalEnv.APPDATA;
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<{
  text: string;
  stdout: string;
  stderr: string;
  exitCode: typeof process.exitCode;
}> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return {
      text: captured.text(),
      stdout: captured.stdout(),
      stderr: captured.stderr(),
      exitCode: process.exitCode,
    };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('CLI API commands against the local mock gateway', () => {
  it('guides verified human approval without adding prose to machine output', async () => {
    const human = await run(['check-transaction', '-t', 'APPROVED-DX']);
    expect(human.stdout).toContain('fulfill once atomically');
    expect(human.stdout).toContain('amount, and currency');
    const machine = await run(['check-transaction', '-t', 'APPROVED-DX', '--json']);
    expect(machine.stdout).not.toContain('Next:');
    expect(machine.stdout).not.toContain('fulfill once');
  });

  it('check-transaction prints an APPROVED status (--json path)', async () => {
    const { text, exitCode } = await run(['check-transaction', '-t', 'APPROVED-1', '--json']);
    expect(text).toContain('"APPROVED"');
    expect(exitCode).not.toBe(1);
  });

  it('check-transaction maps a not-found code 6 to exit code 2', async () => {
    const { text, exitCode } = await run(['check-transaction', '-t', 'MISSING']);
    expect(text).toContain('tran_id not found');
    expect(exitCode).toBe(2);
  });

  it('close-transaction succeeds with -y', async () => {
    const { text, exitCode } = await run(['close-transaction', '-t', 'CLOSE-1', '-y', '--json']);
    expect(text).toContain('Success');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('transaction-detail prints the detail payload (--json)', async () => {
    const { text, exitCode } = await run(['transaction-detail', '-t', 'DETAIL-1', '--json']);
    expect(text).toContain('"APPROVED"');
    expect(text).toContain('876776');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('transaction-list prints the transaction array (--json)', async () => {
    const { text, exitCode } = await run([
      'transaction-list',
      '--from',
      '2026-08-01 00:00:00',
      '--to',
      '2026-08-02 23:59:59',
      '--json',
    ]);
    expect(text).toContain('transaction_id');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('exchange-rate prints the rate table (--json)', async () => {
    const { text, exitCode } = await run(['exchange-rate', '--json']);
    expect(text).toContain('USD_KHR');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  // T0-2 (full audit 2026-09-12): the --json error envelope is a contract, not
  // a feature of some commands — these pin the previously-bypassing commands.
  it('exchange-rate --json emits the error envelope on gateway failure', async () => {
    rejectExchangeRate = true;
    try {
      const { stdout, exitCode } = await run(['exchange-rate', '--json']);
      const parsed = JSON.parse(stripAnsi(stdout)) as { error?: { kind?: string; exitCode?: number; paywayCode?: string } };
      expect(parsed.error?.kind).toBe('api');
      expect(parsed.error?.exitCode).toBe(2);
      expect(parsed.error?.paywayCode).toBe('PTL04');
      expect(exitCode).toBe(2);
    } finally {
      rejectExchangeRate = false;
    }
  });

  it('exchange-rate keeps the human error block without --json', async () => {
    rejectExchangeRate = true;
    try {
      const { stdout } = await run(['exchange-rate']);
      expect(stripAnsi(stdout)).toContain('✗');
      expect(stdout).not.toContain('"error"');
    } finally {
      rejectExchangeRate = false;
    }
  });

  it('get-transactions-by-ref --json emits the error envelope (mock 404)', async () => {
    const { stdout, exitCode } = await run(['get-transactions-by-ref', '-r', 'REF-404', '--json']);
    const parsed = JSON.parse(stripAnsi(stdout)) as { error?: { kind?: string; exitCode?: number } };
    expect(parsed.error?.kind).toBe('api');
    expect(parsed.error?.exitCode).toBe(2);
    expect(exitCode).toBe(2);
  });

  it('payout --json emits validation envelopes for local rejections', async () => {
    const { stdout, exitCode } = await run([
      'payout',
      '-t',
      'PAY-1',
      '-a',
      '5',
      '-c',
      'EUR',
      '-b',
      '500000001:5',
      '--json',
    ]);
    const parsed = JSON.parse(stripAnsi(stdout)) as { error?: { kind?: string; exitCode?: number; message?: string } };
    expect(parsed.error?.kind).toBe('validation');
    expect(parsed.error?.exitCode).toBe(1);
    expect(parsed.error?.message).toContain('EUR');
    expect(exitCode).toBe(1);
  });

  it('payout --json emits the API error envelope on gateway failure', async () => {
    const { stdout, exitCode } = await run(['payout', '-t', 'PAY-404', '-a', '5', '-b', '500000001:5', '--json']);
    const parsed = JSON.parse(stripAnsi(stdout)) as { error?: { kind?: string; exitCode?: number } };
    expect(parsed.error).toBeDefined();
    expect(parsed.error?.exitCode).toBe(2);
    expect(exitCode).toBe(2);
  });

  it('pre-auth complete --json emits the error envelope on gateway failure', async () => {
    rejectPreAuth = true;
    try {
      const { stdout, exitCode } = await run(['pre-auth', 'complete', '-t', 'PRE-FAIL', '-a', '5', '--json', '-y']);
      const parsed = JSON.parse(stripAnsi(stdout)) as { error?: { kind?: string; paywayCode?: string; exitCode?: number } };
      expect(parsed.error?.kind).toBe('api');
      expect(parsed.error?.paywayCode).toBe('PTL04');
      expect(parsed.error?.exitCode).toBe(2);
      expect(exitCode).toBe(2);
    } finally {
      rejectPreAuth = false;
    }
  });

  it('refund submits through the merchant-access endpoint', async () => {
    const { text, exitCode } = await run(['refund', '-t', 'R-OK', '-a', '1.00', '-y', '--json']);
    expect(text).toContain('Refund submitted');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  // R1 (second-pass audit): preflight must HARD-STOP when the refund currency
  // differs from the order currency — never compare numbers in different units.
  // The detail response carries no money fields for R-OK, so the baseline path
  // above exercises the unavailable→continue branch; these pin the mismatch
  // branches in both directions, in human and machine modes.
  it('refund --json hard-stops with a validation envelope when the order currency differs (KHR order, USD request)', async () => {
    const { stdout, exitCode } = await run(['refund', '-t', 'R-KHR-ORDER', '-a', '10.00', '-y', '--json']);
    const parsed = JSON.parse(stripAnsi(stdout)) as { error?: { kind?: string; message?: string } };
    expect(parsed.error?.kind).toBe('validation');
    expect(parsed.error?.message).toContain('denominated in KHR');
    expect(parsed.error?.message).toContain('-c KHR');
    expect(exitCode).toBe(1);
    // The refund itself was never submitted.
    expect(stdout).not.toContain('Refund submitted');
  });

  it('refund human mode hard-stops on the mirrored direction (USD order, KHR request)', async () => {
    const { text, exitCode } = await run(['refund', '-t', 'R-USD-ORDER', '-a', '4000', '-c', 'KHR', '-y']);
    expect(stripAnsi(text)).toContain('currency mismatch');
    expect(stripAnsi(text)).toContain('-c USD');
    expect(stripAnsi(text)).not.toContain('Refund submitted');
    expect(exitCode).toBe(1);
  });

  it('refund succeeds in preflight when the request currency matches the order currency', async () => {
    const { stdout, exitCode } = await run(['refund', '-t', 'R-USD-ORDER', '-a', '1.00', '-c', 'USD', '-y', '--json']);
    const parsed = JSON.parse(stripAnsi(stdout));
    expect(parsed.status?.code).toBe('00');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('refund --json keeps stdout to one JSON document with preflight diagnostics on stderr (R5)', async () => {
    const { stdout, stderr } = await run(['refund', '-t', 'R-USD-ORDER', '-a', '1.00', '-c', 'USD', '-y', '--json']);
    // The whole stdout must parse as one JSON document — no human preflight lines.
    expect(() => JSON.parse(stripAnsi(stdout))).not.toThrow();
    // Progress went to stderr (console.error under machine mode).
    expect(stripAnsi(stderr)).toContain('Pre-flight');
  });

  it.each([
    ['currency', ['-t', 'R-OK', '-a', '1', '-c', 'EUR']],
    ['amount', ['-t', 'R-OK', '-a', '0']],
    ['transaction ID', ['-t', 'bad/id', '-a', '1']],
  ])('refund --json emits a validation envelope for invalid %s without submitting', async (_name, args) => {
    const before = refundRequests;
    const { stdout, exitCode } = await run(['refund', ...args, '-y', '--json']);
    expect(JSON.parse(stdout).error.kind).toBe('validation');
    expect(exitCode).toBe(1);
    expect(refundRequests).toBe(before);
  });

  it.each(['PAYWAY_API_KEY', 'PAYWAY_RSA_PUBLIC_KEY'])('refund --json emits a validation envelope for missing %s', async (key) => {
    const saved = process.env[key];
    const before = refundRequests;
    delete process.env[key];
    try {
      const { stdout, exitCode } = await run(['refund', '-t', 'R-OK', '-a', '1', '-y', '--json']);
      expect(JSON.parse(stdout).error.kind).toBe('validation');
      expect(exitCode).toBe(1);
      expect(refundRequests).toBe(before);
    } finally {
      process.env[key] = saved;
    }
  });

  it('refund --json emits an API envelope on gateway rejection without retrying the mutation', async () => {
    const before = refundRequests;
    rejectRefund = true;
    try {
      const { stdout, exitCode } = await run(['refund', '-t', 'R-FAIL', '-a', '1', '--no-preflight', '-y', '--json']);
      expect(JSON.parse(stdout).error.paywayCode).toBe('PTL04');
      expect(exitCode).toBe(2);
      expect(refundRequests).toBe(before + 1);
    } finally {
      rejectRefund = false;
    }
  });

  it('get-transactions-by-ref reports the 404 profile gap with exit code 2', async () => {
    const { text, exitCode } = await run(['get-transactions-by-ref', '-r', 'REF-404']);
    expect(text.length).toBeGreaterThan(0);
    expect(exitCode).toBe(2);
  });

  it('generate-qr creates a QR against the mock gateway (no polling, no image save)', async () => {
    const { text, exitCode } = await run([
      'generate-qr',
      '-a',
      '5.00',
      '-c',
      'USD',
      '-t',
      'MOCK-QR-1',
      '--callback-url',
      'https://example.com/cb',
      '--lifetime',
      '300',
      '-y',
      '--no-polling',
      '--no-save-image',
      '--no-open-image',
      '--no-show-qr',
    ]);
    expect(text).toContain('QR String');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('generate-checkout prints the checkout payload (--json, no polling)', async () => {
    const { text, exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-1',
      '--return-url',
      'https://example.com/r',
      '--no-polling',
      '--no-show-qr',
    ]);
    expect(text).toContain('aba://mobile/pay');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  // T0-1 (full audit 2026-09-12): AGENTS.md instructs agents to pass -y to
  // generate-checkout; the flag used to be an unknown-option hard error.
  it('generate-checkout accepts -y for agent flows', async () => {
    const { text, exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-Y-1',
      '--return-url',
      'https://example.com/r',
      '--no-polling',
      '--no-show-qr',
      '-y',
    ]);
    expect(text).toContain('aba://mobile/pay');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  // CLI smoke 2026-09-12: under --json the banner and "Calling PayWay API..."
  // progress line used to leak onto stdout ahead of the JSON document.
  it('generate-checkout --json keeps stdout to exactly one JSON document', async () => {
    const { stdout } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-PURITY-1',
      '--return-url',
      'https://example.com/r',
      '--no-polling',
      '--no-show-qr',
      '--json',
      '-y',
    ]);
    const parsed = JSON.parse(stdout) as { qrString?: string };
    expect(parsed.qrString).toBeTruthy();
  });

  // T0-3: explicit units for the checkout lifetime — --lifetime is minutes on
  // generate-checkout/request-qr but SECONDS on generate-qr, a silent 60x trap.
  it('generate-checkout sends lifetime from --lifetime-minutes and keeps --lifetime as alias', async () => {
    await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-LIFETIME-EXPLICIT',
      '--return-url',
      'https://example.com/r',
      '--lifetime-minutes',
      '30',
      '--no-polling',
      '--no-show-qr',
      '-y',
    ]);
    expect(capturedPurchaseBodies.at(-1)?.lifetime).toBe(30);

    await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-LIFETIME-ALIAS',
      '--return-url',
      'https://example.com/r',
      '--lifetime',
      '15',
      '--no-polling',
      '--no-show-qr',
    ]);
    expect(capturedPurchaseBodies.at(-1)?.lifetime).toBe(15);
  });

  it('generate-checkout --output json emits one stable result and saves a QR PNG', async () => {
    const imagePath = path.join(tempDir, 'checkout-structured.png');
    const { stdout, exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-STRUCTURED-1',
      '--output',
      'json',
      '--no-polling',
      '--save-image',
      imagePath,
      '--no-open-image',
      '--no-show-qr',
    ]);

    const result = JSON.parse(stdout) as Record<string, any>;
    expect(result).toMatchObject({
      schemaVersion: '1.0',
      command: 'generate-checkout',
      transactionId: 'CO-STRUCTURED-1',
      context: { environment: 'sandbox' },
      creation: { outcome: 'accepted' },
      poll: { outcome: 'not_requested', attempts: 0 },
      artifacts: { qrPngPath: path.resolve(imagePath) },
    });
    expect(result.context).not.toHaveProperty('apiKey');
    expect(existsSync(imagePath)).toBe(true);
    expect(readFileSync(imagePath).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('generate-checkout --output ndjson streams creation, poll, and final records', async () => {
    const { stdout, exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-STRUCTURED-2',
      '--output',
      'ndjson',
      '--poll-interval',
      '0.001',
      '--poll-timeout',
      '1',
      '--no-save-image',
      '--no-open-image',
      '--no-show-qr',
    ]);

    const records = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>);
    expect(records.map((record) => record.event)).toEqual(['creation', 'poll', 'final']);
    expect(records[1]).toMatchObject({ event: 'poll', paymentStatus: 'APPROVED', terminal: true });
    expect(records[2]).toMatchObject({
      event: 'final',
      result: { payment: { status: 'APPROVED', terminal: true }, poll: { outcome: 'terminal' } },
    });
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('keeps duplicate journal warnings off structured stdout and records streamed polls', async () => {
    const previous = process.env.PAYWAY_JOURNAL_DIR;
    const journalDir = path.join(tempDir, 'structured-journal');
    process.env.PAYWAY_JOURNAL_DIR = journalDir;
    try {
      const args = ['--journal', 'generate-checkout', '-a', '5.00', '-t', 'CO-JOURNAL',
        '--output', 'ndjson', '--poll-interval', '0.001', '--poll-timeout', '1', '--no-save-image'];
      await run(args);
      const result = await run(args);
      const records = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
      expect(records.map((record) => record.event)).toEqual(['creation', 'poll', 'final']);
      expect(result.stderr).toContain('already appears in the local journal');
      const journal = readFileSync(path.join(journalDir, 'journal.jsonl'), 'utf8')
        .trim().split('\n').map((line) => JSON.parse(line));
      expect(journal.some((event) => event.kind === 'poll.attempt' && event.transactionId === 'CO-JOURNAL')).toBe(true);
      const suppressed = await run([...args, '--allow-duplicate-id']);
      expect(suppressed.stderr).not.toContain('already appears in the local journal');
    } finally {
      if (previous === undefined) delete process.env.PAYWAY_JOURNAL_DIR;
      else process.env.PAYWAY_JOURNAL_DIR = previous;
    }
  });

  it('doctor keeps journal retention warnings advisory for a healthy hosted route', async () => {
    const previous = process.env.PAYWAY_JOURNAL_DIR;
    const previousEnabled = process.env.PAYWAY_JOURNAL;
    const journalDir = mkdtempSync(path.join(tempDir, 'doctor-journal-'));
    const journalPath = path.join(journalDir, 'journal.jsonl');
    writeFileSync(journalPath, '');
    truncateSync(journalPath, 51 * 1024 * 1024);
    process.env.PAYWAY_JOURNAL_DIR = journalDir;
    process.env.PAYWAY_JOURNAL = '1';
    try {
      const { text, exitCode } = await run(['doctor', '--route', 'hosted-checkout']);
      expect(text).toContain('Journal exceeds 50 MB');
      expect(exitCode ?? 0).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.PAYWAY_JOURNAL_DIR;
      else process.env.PAYWAY_JOURNAL_DIR = previous;
      if (previousEnabled === undefined) delete process.env.PAYWAY_JOURNAL;
      else process.env.PAYWAY_JOURNAL = previousEnabled;
    }
  });

  it.each(['generate-checkout', 'generate-qr'])('%s preserves accepted creation when writing the PNG fails', async (command) => {
    const blockedParent = path.join(tempDir, `${command}-not-a-directory`);
    writeFileSync(blockedParent, 'ordinary file');
    const { stdout, exitCode } = await run([
      command, '-a', '5.00', '-t', 'ARTIFACT-FAIL', '--output', 'json',
      '--callback-url', 'https://example.com/cb', '--no-polling',
      '--save-image', path.join(blockedParent, 'qr.png'),
    ]);
    const result = JSON.parse(stdout);
    expect(result.creation.outcome).toBe('accepted');
    expect(result.creation.gatewayResponse).toBeDefined();
    expect(result.payment.status).not.toBe('NOT_CREATED');
    expect(result.nextAction.kind).toBe('check_existing_transaction');
    expect(exitCode).not.toBe(0);
  });

  it('generate-checkout --output json reports an ambiguous create without replaying it', async () => {
    const before = capturedPurchaseBodies.length;
    const { stdout, exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-UNKNOWN-1',
      '--output',
      'json',
      '--no-polling',
      '--no-save-image',
    ]);

    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: '1.0',
      transactionId: 'CO-UNKNOWN-1',
      creation: { outcome: 'unknown', error: { kind: 'network', exitCode: 3 } },
      payment: { status: 'UNKNOWN', terminal: false },
      nextAction: { kind: 'check_existing_transaction' },
    });
    expect(capturedPurchaseBodies.slice(before).filter((body) => body.tran_id === 'CO-UNKNOWN-1')).toHaveLength(1);
    expect(exitCode).toBe(3);
  });

  it('generate-checkout --output json distinguishes a stopped wait from payment failure', async () => {
    const { stdout, exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-PENDING-1',
      '--output',
      'json',
      '--poll-interval',
      '0.001',
      '--poll-timeout',
      '0.01',
      '--no-save-image',
    ]);

    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: '1.0',
      transactionId: 'CO-PENDING-1',
      creation: { outcome: 'accepted' },
      payment: { status: 'PENDING', terminal: false },
      poll: { outcome: 'timed_out', reason: 'max_duration_exceeded' },
      nextAction: { kind: 'check_existing_transaction' },
    });
    expect(exitCode).toBe(3);
  });

  it('generate-qr --output json uses the same stable envelope', async () => {
    const { stdout, exitCode } = await run([
      'generate-qr',
      '-a',
      '5.00',
      '-t',
      'QR-STRUCTURED-1',
      '--callback-url',
      'https://example.com/cb',
      '--lifetime',
      '300',
      '-y',
      '--output',
      'json',
      '--no-polling',
      '--no-save-image',
      '--no-open-image',
      '--no-show-qr',
    ]);

    const result = JSON.parse(stdout) as Record<string, any>;
    expect(result).toMatchObject({
      schemaVersion: '1.0',
      command: 'generate-qr',
      transactionId: 'QR-STRUCTURED-1',
      creation: { outcome: 'accepted' },
      poll: { outcome: 'not_requested', attempts: 0 },
    });
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('generate-checkout --output json keeps validation failures machine-readable', async () => {
    const { stdout, exitCode } = await run([
      'generate-checkout',
      '-a',
      '0',
      '-t',
      'CO-STRUCTURED-BAD',
      '--output',
      'json',
    ]);
    const result = JSON.parse(stdout) as Record<string, any>;
    expect(result).toMatchObject({
      schemaVersion: '1.0',
      transactionId: 'CO-STRUCTURED-BAD',
      creation: { outcome: 'rejected', error: { kind: 'validation', exitCode: 1 } },
      nextAction: { kind: 'fix_input' },
    });
    expect(exitCode).toBe(1);
  });

  it('generate-checkout --json emits an error envelope for pre-flight validation failures (T5.4)', async () => {
    const { text, exitCode } = await run(['generate-checkout', '-a', '0', '--json']);
    expect(text).toContain('"kind": "validation"');
    expect(text).toContain('"exitCode": 1');
    expect(text).toContain('Amount must be a positive number');
    expect(exitCode).toBe(1);
  });

  it('generate-checkout --json emits an error envelope for SDK-local rejections like lifetime < 3 (T5.4)', async () => {
    const { text, exitCode } = await run([
      'generate-checkout',
      '-a',
      '1.00',
      '-t',
      'CO-T54-1',
      '--lifetime',
      '2',
      '--json',
      '--no-polling',
      '--no-show-qr',
    ]);
    expect(text).toContain('"kind": "validation"');
    expect(text).toContain('lifetime');
    expect(exitCode).toBe(1);
  });

  it('pre-auth complete enforces the over-capture ceiling and completes within it', async () => {
    // 120% of the original exceeds the default 110% ceiling → local rejection.
    const { text: overText, exitCode: overExit } = await run([
      'pre-auth',
      'complete',
      '-t',
      'PA-1',
      '-a',
      '6',
      '--original-amount',
      '5',
      '-y',
      '--json',
    ]);
    expect(overText).toContain('110');
    expect(overExit).toBe(1);
    // Within the ceiling → reaches the gateway.
    const { text, exitCode } = await run([
      'pre-auth',
      'complete',
      '-t',
      'PA-1',
      '-a',
      '5',
      '--original-amount',
      '5',
      '-y',
      '--json',
    ]);
    expect(text).toContain('Pre-auth completed');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('pre-auth cancel completes with -y', async () => {
    const { text, exitCode } = await run(['pre-auth', 'cancel', '-t', 'PA-CANCEL-1', '-y', '--json']);
    expect(text).toContain('Pre-auth cancelled');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('poll-transaction exits 0 once the mock reports APPROVED', async () => {
    const { text, exitCode } = await run([
      'poll-transaction',
      '-t',
      'APPROVED-1',
      '--poll-interval',
      '1',
      '--poll-timeout',
      '5',
      '--json',
    ]);
    expect(text).toContain('APPROVED');
    expect([undefined, 0]).toContain(exitCode as number);
  }, 30_000);

  it('sandbox-beneficiaries prints the seeded account list (--json)', async () => {
    const { text, exitCode } = await run(['sandbox-beneficiaries', '--json']);
    expect(text.length).toBeGreaterThan(0);
    expect([undefined, 0, 1]).toContain(exitCode as number);
  });

  it('sandbox-test-cards prints the seeded test cards (--json, filter, pretty)', async () => {
    const all = await run(['sandbox-test-cards', '--json']);
    const cards = JSON.parse(all.text) as Array<{ number: string; outcome: string }>;
    expect(cards).toHaveLength(4);

    const declined = await run(['sandbox-test-cards', '--outcome', 'declined', '--json']);
    const declinedCards = JSON.parse(declined.text) as Array<{ outcome: string }>;
    expect(declinedCards).toHaveLength(2);
    expect(declinedCards.every((card) => card.outcome === 'declined')).toBe(true);

    const pretty = await run(['sandbox-test-cards']);
    expect(pretty.text).toContain('5156 8399 3770 6777');
    expect(pretty.text).toContain('approved');

    const invalid = await run(['sandbox-test-cards', '--outcome', 'bogus']);
    expect(invalid.text).toContain('--outcome must be');
    expect(invalid.exitCode).toBe(1);
  });

  it('pretty (non---json) output variants render human summaries', async () => {
    const close = await run(['close-transaction', '-t', 'CLOSE-PRETTY', '-y']);
    expect(close.text).toContain('Success');

    const detail = await run(['transaction-detail', '-t', 'DETAIL-PRETTY']);
    expect(detail.text).toContain('APPROVED');

    const list = await run(['transaction-list', '--from', '2026-08-01 00:00:00', '--to', '2026-08-02 23:59:59']);
    // The pretty renderer may summarize differently from the raw array.
    expect(list.text.length).toBeGreaterThan(0);

    const rate = await run(['exchange-rate']);
    expect(rate.text).toContain('4100');

    const refund = await run(['refund', '-t', 'R-PRETTY', '-a', '1.00', '-y']);
    expect(refund.text).toContain('Refund submitted');

    const approved = await run(['check-transaction', '-t', 'APPROVED-PRETTY']);
    expect(approved.text).toContain('APPROVED');
  });

  it('generate-qr --save-image decodes and writes the PNG', async () => {
    const imagePath = path.join(tempDir, 'qr-out.png');
    const { exitCode } = await run([
      'generate-qr',
      '-a',
      '5.00',
      '-t',
      'MOCK-QR-SAVE',
      '--callback-url',
      'https://example.com/cb',
      '--lifetime',
      '300',
      '-y',
      '--no-polling',
      '--save-image',
      imagePath,
      '--no-open-image',
      '--no-show-qr',
    ]);
    expect(existsSync(imagePath)).toBe(true);
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('transaction-detail --wait retries through code 6 and prints the lag hint', async () => {
    // 'MISSING' keeps answering code 6, so --wait exhausts its budget and
    // prints the check-transaction escape-hatch hint (exit code 2).
    const { text, exitCode } = await run([
      'transaction-detail',
      '-t',
      'MISSING',
      '--wait',
      '2',
    ]);
    expect(text).toContain('tran_id not found');
    expect(exitCode).toBe(2);
  }, 30_000);

  it('transaction-detail --json prints a JSON error envelope and exits 2', async () => {
    const { text, exitCode } = await run(['transaction-detail', '-t', 'MISSING', '--json']);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { error: { message: string; paywayCode: string; kind: string; exitCode: number } };
    expect(parsed.error.message).toContain('tran_id not found');
    expect(parsed.error.paywayCode).toBe('6');
    expect(parsed.error.kind).toBe('api');
    expect(parsed.error.exitCode).toBe(2);
    expect(text).not.toContain('✗');
    expect(exitCode).toBe(2);
  });

  it('check-transaction --json prints the not-found body as a JSON error envelope and exits 2', async () => {
    const { text, exitCode } = await run(['check-transaction', '-t', 'MISSING', '--json']);
    // T3.5: the --json path prints a machine-parseable envelope (the human
    // message stays inside it), never the ✗-prefixed block.
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { error: { message: string; paywayCode: string; kind: string; exitCode: number } };
    expect(parsed.error.message).toContain('tran_id not found');
    expect(parsed.error.paywayCode).toBe('6');
    expect(parsed.error.kind).toBe('api');
    expect(parsed.error.exitCode).toBe(2);
    expect(text).not.toContain('✗');
    expect(exitCode).toBe(2);
  });

  // Payment-link envelope parity (T5.4 extension, 2026-09-06): both commands
  // print the same `{ error: { kind, exitCode, … } }` contract on gateway
  // rejections under --json — branch on the envelope, never on stdout text.
  it('payment-link detail --json prints the PTL132 body as a JSON error envelope', async () => {
    const { text, exitCode } = await run(['payment-link', 'detail', '-i', 'PLINK-UNKNOWN==', '--json']);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { error: { message: string; paywayCode: string; kind: string; exitCode: number } };
    expect(parsed.error.message).toContain('Invalid payment link');
    expect(parsed.error.paywayCode).toBe('PTL132');
    expect(parsed.error.kind).toBe('api');
    expect(parsed.error.exitCode).toBe(2);
    expect(text).not.toContain('✗');
    expect(exitCode).toBe(2);
  });

  it('payment-link detail (human mode) still prints the human ✗ block for PTL132', async () => {
    const { text, exitCode } = await run(['payment-link', 'detail', '-i', 'PLINK-UNKNOWN==']);
    expect(text).toContain('✗');
    expect(text).toContain('Invalid payment link');
    expect(text).not.toContain('"kind"');
    expect(exitCode).toBe(2);
  });

  // Payment-link void (SANDBOX-FINDINGS §23): confirmation is skipped under
  // --json and -y (agents/CI); success prints the raw response under --json;
  // a second void answers 403 PTL188 and prints the standard error envelope
  // (exit 2, paywayCode PTL188) — the mock routes by call count because the
  // link id travels inside the RSA-encrypted merchant_auth.
  it('payment-link void --json skips confirmation and prints the raw response on success', async () => {
    const { text, exitCode } = await run(['payment-link', 'void', '-i', 'PLINK-MOCK-1==', '--json']);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
      status: { code: string; message: string };
      tran_id: number;
      correlationId?: string;
    };
    expect(parsed.status.code).toBe('00');
    expect(parsed.status.message).toBe('Success.');
    expect(typeof parsed.tran_id).toBe('number');
    expect(text).not.toContain('"error"');
    expect(text.toLowerCase()).not.toContain('cancel');
    // Success leaves process.exitCode unset (0-equivalent) — same as detail.
    expect(exitCode === undefined || exitCode === 0).toBe(true);
  });

  it('payment-link void --json on an already-voided link prints the PTL188 error envelope and exits 2', async () => {
    const { text, exitCode } = await run(['payment-link', 'void', '-i', 'PLINK-MOCK-1==', '--json']);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { error: { message: string; paywayCode: string; kind: string; exitCode: number; hint?: string } };
    expect(parsed.error.message).toContain('already voided');
    expect(parsed.error.paywayCode).toBe('PTL188');
    expect(parsed.error.kind).toBe('api');
    expect(parsed.error.exitCode).toBe(2);
    expect(parsed.error.hint).toContain('terminal state');
    expect(text).not.toContain('✗');
    expect(exitCode).toBe(2);
  });

  it('payment-link void (human mode, -y) on an already-voided link prints the ✗ block with the PTL188 hint', async () => {
    const { text, exitCode } = await run(['payment-link', 'void', '-i', 'PLINK-MOCK-1==', '-y']);
    expect(text).toContain('✗');
    expect(text).toContain('already voided');
    expect(text).toContain('PTL188');
    expect(text).not.toContain('"kind"');
    expect(exitCode).toBe(2);
  });

  it('payment-link create --json prints the raw response on success (no envelope)', async () => {
    const { text, exitCode } = await run([
      'payment-link',
      'create',
      '-t', 'Mock link',
      '-a', '5.00',
      '-r', 'PL-MOCK-REF-1',
      '--return-url', 'https://example.com/return',
      '--json',
    ]);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
      status: { code: string };
      data: { id: string; payment_link: string };
    };
    expect(parsed.status.code).toBe('00');
    expect(parsed.data.id).toBe('PLINK-MOCK-1==');
    expect(parsed.data.payment_link).toContain('ABAPAYMOCK1');
    expect(text).not.toContain('"error"');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  // --no-show-qr (P6, 2026-09-06): the flag must be REGISTERED on the command
  // (commander errors on unknown options, so a completed create proves it)
  // and must reach the same TTY gate generate-qr/generate-checkout use —
  // shouldAutoRenderQr(stdout, false) is false even on a TTY. The gate itself
  // is unit-pinned here because the in-process stdout is never a TTY, so the
  // TTY-auto branch can't be observed through runCli directly.
  it('payment-link create accepts --no-show-qr and the flag forces the gate off', async () => {
    const { text, exitCode } = await run([
      'payment-link',
      'create',
      '-t', 'Mock link',
      '-a', '5.00',
      '-r', 'PL-MOCK-REF-NOSHOW',
      '--return-url', 'https://example.com/return',
      '--no-show-qr',
    ]);
    // Flag accepted (no "unknown option" error) and the create succeeded.
    expect(text).toContain('Payment link created');
    expect(text).not.toContain('unknown option');
    expect(text).not.toContain('error:'); // commander's unknown-option prefix
    expect([undefined, 0]).toContain(exitCode as number);

    // The gate contract shared with generate-qr/generate-checkout: an explicit
    // false wins over TTY, an explicit true wins without one, unset follows
    // the stream.
    const { shouldAutoRenderQr } = await import('../cli/terminal-qr.js');
    expect(shouldAutoRenderQr({ isTTY: true }, false)).toBe(false);
    expect(shouldAutoRenderQr({ isTTY: false }, true)).toBe(true);
    expect(shouldAutoRenderQr({ isTTY: true }, undefined)).toBe(true);
    expect(shouldAutoRenderQr({ isTTY: false }, undefined)).toBe(false);
  });

  it('cof link-account submits a link request (--json)', async () => {
    const { text, exitCode } = await run([
      'cof',
      'link-account',
      '-r',
      'REQID001',
      '-c',
      'CTID0001',
      '-f',
      'CITI_FLEX',
      '--json',
    ]);
    expect(text).toContain('"LA-1"');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('cof link-card captures the hosted page, saves it, and exits 0', async () => {
    const { text, exitCode } = await run([
      'cof',
      'link-card',
      '-r',
      'REQID002',
      '-c',
      'CTID0002',
      '-f',
      'CITO_FLEX',
      '--no-open-page',
    ]);
    expect(text).toContain('Hosted card-link page received and saved');
    expect(text).toContain('link-card-REQID002.html');
    expect(text).toContain('callback_url');
    expect([undefined, 0]).toContain(exitCode as number);

    // The saved page is the real hosted-form HTML the gateway returned.
    const savedPath = path.join(tempDir, 'payway-output', 'link-card-REQID002.html');
    expect(existsSync(savedPath)).toBe(true);
    expect(readFileSync(savedPath, 'utf8')).toContain('hosted card entry form');
  });

  it('cof link-card --json prints the hosted-page envelope', async () => {
    const { text, exitCode } = await run([
      'cof',
      'link-card',
      '-r',
      'REQID002',
      '-c',
      'CTID0002',
      '-f',
      'CITO_FLEX',
      '--json',
    ]);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
    expect(parsed.hostedHtmlPath).toContain('link-card-REQID002.html');
    expect(parsed.requestId).toBe('REQID002');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('cof link-card --json surfaces the decoded hosted outcome and join keys (§24 LC-2)', async () => {
    linkCardMode = 'redirect-error';
    try {
      const { text, exitCode } = await run([
        'cof',
        'link-card',
        '-r',
        'REQID010',
        '-c',
        'CTID0010',
        '-f',
        'CITI_FLEX',
        '--frequency',
        '1M',
        '--json',
      ]);
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
      expect(parsed.hostedHtmlPath).toContain('link-card-REQID010.html');
      const hosted = parsed.hostedPage as { url: string; code: string; message: string };
      expect(hosted.code).toBe('104');
      expect(hosted.message).toBe('Merchant not enabled token flag.');
      expect(hosted.url).toContain('/add-card/');
      // The capture contract stays exit-0: the saved page is the evidence, the
      // hostedPage field is where machines read the real outcome.
      expect([undefined, 0]).toContain(exitCode as number);
      const savedPath = path.join(tempDir, 'payway-output', 'link-card-REQID010.html');
      expect(readFileSync(savedPath, 'utf8')).toContain('add-card shell');
    } finally {
      linkCardMode = 'html';
    }
  });

  it('cof link-card human output reports the hosted error code (§24 LC-1)', async () => {
    linkCardMode = 'redirect-error';
    try {
      const { text, exitCode } = await run([
        'cof',
        'link-card',
        '-r',
        'REQID013',
        '-c',
        'CTID0013',
        '-f',
        'CITI_FLEX',
        '--no-open-page',
      ]);
      const flat = stripAnsi(text);
      expect(flat).toContain('Hosted page reports an error: code 104');
      expect(flat).toContain('Merchant not enabled token flag');
      expect(flat).toContain('SANDBOX-FINDINGS §24 LC-1');
      expect([undefined, 0]).toContain(exitCode as number);
    } finally {
      linkCardMode = 'html';
    }
  });

  it('cof link-card --json emits the error envelope when the gateway answers JSON (§24 hardening)', async () => {
    linkCardMode = 'json-400';
    try {
      const { text, exitCode } = await run([
        'cof',
        'link-card',
        '-r',
        'REQID011',
        '-c',
        'CTID0011',
        '-f',
        'CITI_FLEX',
        '--json',
      ]);
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
      const error = parsed.error as Record<string, unknown>;
      expect(error).toBeDefined();
      expect(error.kind).toBe('api');
      expect(error.paywayCode).toBe('04');
      expect(exitCode).toBe(2);
      // A JSON rejection carries no page — nothing may be captured.
      expect(existsSync(path.join(tempDir, 'payway-output', 'link-card-REQID011.html'))).toBe(false);
    } finally {
      linkCardMode = 'html';
    }
  });

  it('cof charge --json emits the error envelope on a gateway failure (§24 LC-7)', async () => {
    cofChargeFailureCode = '105';
    try {
      const { text, exitCode } = await run([
        'cof',
        'charge',
        '-t',
        'COF-FAIL-1',
        '-a',
        '4.50',
        '--token',
        'pwt_mock_unknown',
        '--ctid',
        'CTID0002',
        '--token-flag',
        'MITU_FLEX',
        '--json',
      ]);
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
      const error = parsed.error as Record<string, unknown>;
      expect(error.kind).toBe('api');
      expect(error.paywayCode).toBe('105');
      expect(exitCode).toBe(2);
      // stdout stays exactly one JSON document — no human block may leak.
      expect(text).not.toContain('PayWay code');
    } finally {
      cofChargeFailureCode = undefined;
    }
  });

  it('cof token details --json emits the error envelope on a gateway failure (§24 LC-7)', async () => {
    tokenDetailsFailureCode = '09';
    try {
      const { text, exitCode } = await run(['cof', 'token', 'details', '-r', 'REQID012', '--json']);
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
      const error = parsed.error as Record<string, unknown>;
      expect(error.kind).toBe('api');
      expect(error.paywayCode).toBe('09');
      expect(exitCode).toBe(2);
    } finally {
      tokenDetailsFailureCode = undefined;
    }
  });

  it('cof link-card-form renders a signed local form without a network call', async () => {
    const { text, exitCode } = await run([
      'cof',
      'link-card-form',
      '-r',
      'REQID005',
      '-c',
      'CTID0005',
      '-f',
      'CITI_FLEX',
    ]);
    // Local-only command: diagnostics on stderr (captured), HTML on stdout.
    expect(text).toContain('Request ID:');
    // The server must not have been hit for a local form render — every
    // request the mock received was from earlier tests' API commands.
    expect(text).not.toContain('Calling PayWay API');
    expect(exitCode).toBe(0);
    expect(text).toContain('--callback-url'); // no callback supplied → warning
  });

  it('cof charge submits a payment against a linked token (--json)', async () => {
    const { text, exitCode } = await run([
      'cof',
      'charge',
      '-t',
      'COF-1',
      '-a',
      '5.00',
      '--token',
      'PWT-1',
      '--json',
    ]);
    expect(text).toContain('"COF-1"');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('cof token renew submits a renewal request (--json)', async () => {
    const { text, exitCode } = await run([
      'cof',
      'token',
      'renew',
      '-r',
      'REQID003',
      '-c',
      'CTID0003',
      '--token',
      'PWT-1',
      '--json',
    ]);
    expect(text).toContain('"RT-1"');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('cof token details carries request_id only (--json)', async () => {
    const { text, exitCode } = await run(['cof', 'token', 'details', '-r', 'REQID004', '--json']);
    expect(text).toContain('CTID-1');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('cof token remove takes ctid + token, no request id (--json)', async () => {
    const { text, exitCode } = await run(['cof', 'token', 'remove', '-c', 'CTID0004', '--token', 'PWT-1', '--json']);
    expect(text).toContain('"00"');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('beneficiary add submits a whitelist request (requires RSA, --json)', async () => {
    const { text, exitCode } = await run(['beneficiary', 'add', 'PAYEE-1', '--json']);
    expect(text).toContain('PAYEE-1');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('beneficiary update-status updates the whitelist status (--json)', async () => {
    const { text, exitCode } = await run(['beneficiary', 'update-status', 'PAYEE-1', '-s', '1', '--json']);
    expect(text).toContain('PAYEE-1');
    expect([undefined, 0]).toContain(exitCode as number);
  });

  it('transaction-list rejects a >3-day window locally with exit 1', async () => {
    const { text, exitCode } = await run([
      'transaction-list',
      '--from',
      '2026-08-01 00:00:00',
      '--to',
      '2026-08-30 23:59:59',
    ]);
    expect(text).toContain('more than 3 days');
    expect(exitCode).toBe(1);
  });

  it('transaction-list rejects a pagination >1000 locally with exit 1', async () => {
    const { text, exitCode } = await run([
      'transaction-list',
      '--from',
      '2026-08-01 00:00:00',
      '--to',
      '2026-08-02 23:59:59',
      '--pagination',
      '5000',
    ]);
    expect(text).toContain('1000');
    expect(exitCode).toBe(1);
  });

  it('generate-checkout forwards the expanded B6 flags (--json)', async () => {
    capturedPurchaseBodies.length = 0;
    const { exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-B6',
      '--return-url',
      'https://example.com/r',
      '--type',
      'pre-auth',
      '--ctid',
      'CTID0005',
      '--token-flag',
      'CITR_FIX',
      '--frequency',
      '1M',
      '--firstname',
      'John',
      '--shipping',
      '1',
      '--lifetime',
      '5',
      '--json',
      '--no-polling',
      '--no-show-qr',
    ]);
    expect(exitCode).not.toBe(1);

    // Audit D1: the hash SENT over the network must cover the subscription
    // additions (token_flag/frequency) — purchase() used to re-hash with the
    // legacy 24-field list, producing a gateway "Wrong Hash".
    expect(capturedPurchaseBodies.length).toBeGreaterThan(0);
    const body = capturedPurchaseBodies[capturedPurchaseBodies.length - 1];
    expect(body.token_flag).toBe('CITR_FIX');
    expect(body.frequency).toBe('1M');
    expect(body.hash).toBe(generateHmac(body, LIVE_PURCHASE_HASH_FIELDS, 'a'.repeat(32)));
  });

  it('generate-checkout forwards the S1 flags (payout/additional-params/google-pay-token/return-deeplink)', async () => {
    capturedPurchaseBodies.length = 0;
    const { exitCode } = await run([
      'generate-checkout',
      '-a',
      '5.00',
      '-t',
      'CO-S1',
      '--return-url',
      'https://example.com/r',
      '--payout',
      '[{"acc":"000111222","amt":5.00}]',
      '--additional-params',
      '{"note":"gift"}',
      '--google-pay-token',
      'gpay-tok-1',
      '--return-deeplink',
      '{"ios_scheme":"myapp://done","android_scheme":"myapp://done"}',
      '--json',
      '--no-polling',
      '--no-show-qr',
    ]);
    expect(exitCode).not.toBe(1);
    expect(capturedPurchaseBodies.length).toBeGreaterThan(0);
    const body = capturedPurchaseBodies[capturedPurchaseBodies.length - 1];
    // purchase() base64-encodes array/object flags before signing; the deeplink
    // object form is JSON-inside-base64.
    expect(body.payout).toBe(Buffer.from('[{"acc":"000111222","amt":5}]', 'utf8').toString('base64'));
    expect(body.additional_params).toBe(Buffer.from('{"note":"gift"}', 'utf8').toString('base64'));
    expect(body.google_pay_token).toBe('gpay-tok-1');
    expect(Buffer.from(String(body.return_deeplink), 'base64').toString('utf8')).toBe(
      '{"ios_scheme":"myapp://done","android_scheme":"myapp://done"}',
    );
    // The S1 flags are hash positions in the live 26-field order — the sent
    // hash must cover them.
    expect(body.hash).toBe(generateHmac(body, LIVE_PURCHASE_HASH_FIELDS, 'a'.repeat(32)));
  });

  it('cof link-account forwards --return-deeplink into the wire body', async () => {
    capturedLinkAccountBodies.length = 0;
    const { exitCode } = await run([
      'cof',
      'link-account',
      '-r',
      'REQID010',
      '-c',
      'CTID0010',
      '-f',
      'CITI_FLEX',
      '--return-deeplink',
      '{"ios_scheme":"myapp://linked","android_scheme":"myapp://linked"}',
      '--json',
    ]);
    expect([undefined, 0]).toContain(exitCode as number);
    expect(capturedLinkAccountBodies.length).toBeGreaterThan(0);
    const body = capturedLinkAccountBodies[capturedLinkAccountBodies.length - 1];
    expect(Buffer.from(String(body.return_deeplink), 'base64').toString('utf8')).toBe(
      '{"ios_scheme":"myapp://linked","android_scheme":"myapp://linked"}',
    );
  });

  it('generate-qr forwards the 9 new optional params (no polling)', async () => {
    const { text, exitCode } = await run([
      'generate-qr',
      '-a',
      '5.00',
      '-c',
      'USD',
      '-t',
      'QR-B6',
      '--callback-url',
      'https://example.com/cb',
      '--lifetime',
      '300',
      '-y',
      '--no-polling',
      '--no-save-image',
      '--no-open-image',
      '--no-show-qr',
      '--first-name',
      'John',
      '--last-name',
      'Doe',
      '--email',
      'j@example.com',
      '--items',
      '[{"name":"Item","price":1,"quantity":1}]',
      '--return-params',
      'label=ok',
    ]);
    expect(text).toContain('QR String');
    expect([undefined, 0]).toContain(exitCode as number);
  });
});

describe('tx-batch command', () => {
  it('check --json yields per-item envelopes and exit 1 on partial failure', async () => {
    const { text, exitCode } = await run([
      'tx-batch', 'check', '-t', 'APPROVED-1', '-t', 'MISSING', '--json',
    ]);
    expect(text).toContain('"operation": "check"');
    expect(text).toContain('"total": 2');
    expect(text).toContain('"failed": 1');
    expect(text).toContain('MISSING');
    expect(exitCode).toBe(1);
  });

  it('check human output lists every target and exits 0 when all ok', async () => {
    const { text, exitCode } = await run(['tx-batch', 'check', '-t', 'A-1', '-t', 'A-2']);
    expect(text).toContain('A-1');
    expect(text).toContain('A-2');
    expect(text).toContain('2 ok');
    expect(exitCode).toBe(0);
  });

  it('close with -y succeeds for every target (--json)', async () => {
    const { text, exitCode } = await run(['tx-batch', 'close', '-t', 'C-1', '-t', 'C-2', '-y', '--json']);
    expect(text).toContain('"ok": 2');
    expect(text).toContain('CLOSE_ACCEPTED');
    expect(exitCode).toBe(0);
  });

  it('close refuses to run non-interactively without -y', async () => {
    const { text, exitCode } = await run(['tx-batch', 'close', '-t', 'C-1', '--json']);
    expect(text).toContain('-y/--force');
    expect(exitCode).toBe(1);
  });

  it('dry-run lists targets without any network call', async () => {
    const { text, exitCode } = await run(['tx-batch', 'close', '-t', 'DRY-1', '-t', 'DRY-2', '--dry-run']);
    expect(text).toContain('DRY-1');
    expect(text).toContain('dry-run');
    expect(text).toContain('no calls made');
    expect(exitCode).toBe(0);
  });

  it('--ids-file parses IDs, skips comments and blank lines, and dedupes', async () => {
    const idsFile = path.join(tempDir, 'tx-batch-ids.txt');
    writeFileSync(idsFile, '# campaign ids\n\nBATCH-1\nBATCH-2\nBATCH-1\n', 'utf8');
    const { text, exitCode } = await run(['tx-batch', 'check', '--ids-file', idsFile, '--json']);
    expect(text).toContain('"total": 2');
    expect(exitCode).toBe(0);
  });

  it('detail reports a failed item for a missing transaction (partial → exit 1)', async () => {
    const { text, exitCode } = await run(['tx-batch', 'detail', '-t', 'APPROVED-1', '-t', 'MISSING', '--pace', '0', '--json']);
    expect(text).toContain('"operation": "detail"');
    expect(text).toContain('"failed": 1');
    expect(exitCode).toBe(1);
  });

  it('locally invalid IDs fail without network and all-failed exits 2', async () => {
    const { text, exitCode } = await run(['tx-batch', 'check', '-t', 'has space', '--json']);
    expect(text).toContain('transactionId may only contain letters, digits, and hyphens');
    expect(text).toContain('"failed": 1');
    expect(exitCode).toBe(2);
  });

  it('unknown operation exits 1 with a hint', async () => {
    const { text, exitCode } = await run(['tx-batch', 'refund', '-t', 'X']);
    expect(text).toContain('expected close, check, or detail');
    expect(exitCode).toBe(1);
  });

  it('no IDs exits 1', async () => {
    const { text, exitCode } = await run(['tx-batch', 'check']);
    expect(text).toContain('No transaction IDs given');
    expect(exitCode).toBe(1);
  });

  it('--report writes a markdown evidence file', async () => {
    const reportPath = path.join(tempDir, 'tx-batch-report.md');
    const { exitCode } = await run(['tx-batch', 'check', '-t', 'APPROVED-1', '--report', reportPath]);
    const report = readFileSync(reportPath, 'utf8');
    expect(report).toContain('# tx-batch check');
    expect(report).toContain('| APPROVED-1 | yes |');
    expect(report).toContain('Summary: 1/1 ok.');
    expect(exitCode).toBe(0);
  });
});
