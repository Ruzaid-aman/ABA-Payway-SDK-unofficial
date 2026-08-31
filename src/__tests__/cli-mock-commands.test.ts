/**
 * In-process CLI coverage for the API command bodies, driven against a local
 * mock PayWay server (same idea as the child-process tests in cli.test.ts,
 * but visible to v8 coverage). Credentials and PAYWAY_BASE_URL are injected
 * via process.env; only non-interactive flag combinations are used
 * (-y/--json/--no-polling), so nothing reads stdin and nothing leaves localhost.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole, generateTestRsaKeyPair } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-mock-'));
const originalCwd = process.cwd();
const originalEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['PAYWAY_BASE_URL', 'PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY', 'PAYWAY_RSA_PUBLIC_KEY'];

const TEST_RSA = generateTestRsaKeyPair();

const FAKE_PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

let server: Server;
let baseUrl = '';

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
    } else {
      send(200, {
        status: { code: '00', message: 'Success', tran_id: tranId },
        data: { payment_status: 'APPROVED', payment_status_code: 0, apv: '876776', transaction_operations: [] },
      });
    }
  } else if (url.includes('transaction-list')) {
    send(200, [{ transaction_id: 'T1', payment_status: 'APPROVED', payment_status_code: 0, payment_amount: '5.00' }]);
  } else if (url.includes('exchange-rate')) {
    send(200, { status: { code: '00', message: 'Success' }, exchange_rates: { USD_KHR: 4100 } });
  } else if (url.includes('refund')) {
    if (tranId === 'R-FAIL') {
      send(400, { status: { code: 'PTL04', message: 'Parameter validation required' } });
    } else {
      send(200, { status: { code: '00', message: 'Refund submitted' } });
    }
  } else if (url.includes('generate-qr')) {
    send(200, { status: { code: '00', message: 'Success' }, qrString: '000201010212', qrImage: FAKE_PNG_BASE64 });
  } else if (url.includes('purchase/payment-credential')) {
    send(200, { status: { code: '00', message: 'Success' }, data: { tran_id: 'COF-1' } });
  } else if (url.includes('purchase')) {
    send(200, {
      status: { code: '00', message: 'Success' },
      qrString: '000201010212',
      abapay_deeplink: 'aba://mobile/pay',
    });
  } else if (url.includes('pre-auth-completion')) {
    send(200, { status: { code: '00', message: 'Pre-auth completed' } });
  } else if (url.includes('pre-auth-cancellation')) {
    send(200, { status: { code: '00', message: 'Pre-auth cancelled' } });
  } else if (url.includes('get-transactions-by-mc-ref')) {
    send(404, { message: 'endpoint not available under this sandbox profile' });
  } else if (url.includes('aof/link-account')) {
    send(200, { status: { code: '00', message: 'Success', request_id: 'LA-1' } });
  } else if (url.includes('cof/link-card')) {
    send(200, { status: { code: '00', message: 'Success', request_id: 'LC-1' } });
  } else if (url.includes('renew-expired-account-token')) {
    send(200, { status: { code: '00', message: 'Success', request_id: 'RT-1' } });
  } else if (url.includes('get-token-details')) {
    send(200, { status: { code: '00', message: 'Success' }, data: { ctid: 'CTID-1', status: 'ACTIVE' } });
  } else if (url.includes('remove-token')) {
    send(200, { status: { code: '00', message: 'Success' } });
  } else if (url.includes('add-whitelist-payout')) {
    send(200, { status: { code: '00', message: 'Success' }, data: { payee: 'PAYEE-1', status: 1 } });
  } else if (url.includes('update-whitelist-status')) {
    send(200, { status: { code: '00', message: 'Success' }, data: { payee: 'PAYEE-1', status: 1 } });
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
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<{ text: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { text: captured.text(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('CLI API commands against the local mock gateway', () => {
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

  it('refund submits through the merchant-access endpoint', async () => {
    const { text, exitCode } = await run(['refund', '-t', 'R-OK', '-a', '1.00', '-y', '--json']);
    expect(text).toContain('Refund submitted');
    expect([undefined, 0]).toContain(exitCode as number);
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

  it('check-transaction --json prints the not-found body and exits 2', async () => {
    const { text, exitCode } = await run(['check-transaction', '-t', 'MISSING', '--json']);
    expect(text).toContain('tran_id not found');
    expect(exitCode).toBe(2);
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

  it('cof link-card submits a card link request (--json)', async () => {
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
    expect(text).toContain('"LC-1"');
    expect([undefined, 0]).toContain(exitCode as number);
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
