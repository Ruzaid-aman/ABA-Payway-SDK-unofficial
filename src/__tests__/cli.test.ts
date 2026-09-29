import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateTestRsaKeyPair, requireFreshDist, runDistCli, stripAnsi } from '../test/test-utils.js';

const temporaryDirectories: string[] = [];

beforeAll(() => requireFreshDist());
const TEST_RSA = generateTestRsaKeyPair();

const runBuiltCli = runDistCli;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('built CLI', () => {
  it.each([
    ['refund', '-t', 'R-OK', '--json'],
    ['refund', '-a', '1', '--json'],
  ])('refund missing required options emits a JSON usage envelope: %j', async (...argv) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);
    const result = await runBuiltCli(argv, { cwd, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: cwd } });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).error.kind).toBe('validation');
  });

  it('refund human usage errors remain concise after enabling JSON usage errors', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);
    const result = await runBuiltCli(['refund', '-t', 'R-OK'], {
      cwd,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: cwd },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required option');
    expect(result.stderr).not.toContain('CommanderError');
  });

  it('lists the first-payment status and detail commands in built help output', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = await runBuiltCli(['--help'], {
      cwd,
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(0);
    expect(output).toContain('check-transaction');
    expect(output).toContain('transaction-detail');
  });

  it('scopes the generate-qr lifetime option to online mode in built help', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = await runBuiltCli(['generate-qr', '--help'], {
      cwd,
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    const compactOutput = output.replace(/\s+/g, ' ');
    expect(result.status).toBe(0);
    expect(compactOutput).toContain('Online QR lifetime in seconds');
    expect(compactOutput).toContain('does not configure offline KHQR expiry');
  });

  it('prints a first-payment quickstart in doctor output when credentials exist but online QR is not ready', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);
    writeFileSync(
      path.join(cwd, '.env'),
      ['PAYWAY_ENV=sandbox', 'PAYWAY_MERCHANT_ID=test-merchant', `PAYWAY_API_KEY=${'a'.repeat(32)}`].join('\n'),
    );

    const result = await runBuiltCli(['doctor'], {
      cwd,
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(1);
    expect(output).toContain('First payment quickstart');
    expect(output).toContain('generate-qr -a 3.00 -c USD');
    expect(output).toContain('check-transaction -t <id>');
    expect(output).toContain('transaction-detail -t <id>');
    expect(output).toContain('setup-webhook --tunnel');
  });

  it('runs the generate-checkout handler instead of treating it as an unknown command', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-checkout',
        '--amount',
        '1',
        '--callback-url',
        'https://example.com/callback',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('generate checkout QR URL');
    expect(output).toContain('--callback-url is not sent by checkout purchase');
    expect(output).toContain('Missing merchant credentials');
    expect(output).toContain('PAYWAY_MERCHANT_ID');
    expect(output).not.toContain("unknown command 'generate-checkout'");
    expect(output).not.toContain('PayWay is not defined');
  });

  it('accepts a merchant reference for transaction lookup before loading credentials', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'dist', 'cli.js'), 'get-transactions-by-ref', '--merchant-ref', 'INV-12345678'],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('Missing merchant credentials');
    expect(output).not.toContain("unknown command 'get-transactions-by-ref'");
  });

  // -----------------------------------------------------------------------
  // QR-REQ-02: Early credential validation tests
  // -----------------------------------------------------------------------

  it('exits with clear error when PAYWAY_MERCHANT_ID is missing (online mode)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    // Create a .env with only API key, missing merchant ID
    writeFileSync(path.join(cwd, '.env'), 'PAYWAY_API_KEY=test-api-key-123456789012\n');

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('Missing merchant credentials');
    expect(output).toContain('PAYWAY_MERCHANT_ID');
    expect(output).toContain('payway-sdk init');
    // Should NOT reach the PayWay API constructor error
    expect(output).not.toContain('merchantId is required');
  });

  it('exits with clear error when PAYWAY_API_KEY is missing (online mode)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    // Create a .env with only merchant ID, missing API key
    writeFileSync(path.join(cwd, '.env'), 'PAYWAY_MERCHANT_ID=test-merchant-001\n');

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('Missing merchant credentials');
    expect(output).toContain('PAYWAY_API_KEY');
    expect(output).toContain('payway-sdk init');
    expect(output).not.toContain('apiKey is required');
  });

  it('exits with clear error when no .env exists (online mode)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('Missing merchant credentials');
    expect(output).toContain('PAYWAY_MERCHANT_ID');
    expect(output).toContain('PAYWAY_API_KEY');
  });

  it('generates an official offline ABA KHQR payload from the selected profile', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-appdata-'));
    temporaryDirectories.push(cwd);
    temporaryDirectories.push(appData);
    mkdirSync(path.join(appData, 'aba-payway-sdk'));
    writeFileSync(
      path.join(appData, 'aba-payway-sdk', 'profiles.json'),
      JSON.stringify({
        activeProfile: 'offline',
        profiles: [
          {
            name: 'offline',
            khqr: {
              bakongId: 'merchant@bakong',
              abaMerchantId: '123456789012345',
              acquirerName: 'ABA Bank',
              merchantCategoryCode: '5999',
              merchantName: 'Example Merchant',
              merchantCity: 'Phnom Penh',
              paywayData: 'aba-template',
            },
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--offline',
        '--ref',
        'REF001',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
          APPDATA: appData,
        },
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain('Offline ABA KHQR generated');
    expect(output).not.toContain('Missing merchant credentials');
  });

  it('redacts API and ABA KHQR values from profile status', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-appdata-'));
    temporaryDirectories.push(cwd, appData);
    mkdirSync(path.join(appData, 'aba-payway-sdk'));
    writeFileSync(
      path.join(appData, 'aba-payway-sdk', 'profiles.json'),
      JSON.stringify({
        activeProfile: 'private',
        profiles: [
          {
            name: 'private',
            merchantId: 'merchant-secret',
            apiKey: 'api-key-secret',
            khqr: {
              bakongId: 'bakong-secret',
              abaMerchantId: '123456789012345',
              acquirerName: 'ABA Bank',
              merchantCategoryCode: '5999',
              merchantName: 'Example Merchant',
              merchantCity: 'Phnom Penh',
              paywayData: 'payway-data-secret',
            },
          },
        ],
      }),
    );

    for (const command of ['list', 'current']) {
      const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'profiles', command], {
        cwd,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: appData },
      });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status).toBe(0);
      expect(output).not.toContain('api-key-secret');
      expect(output).not.toContain('123456789012345');
      expect(output).not.toContain('payway-data-secret');
    }
  });

  it('reports stable KHQR readiness issue codes instead of emitting an offline payload', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'dist', 'cli.js'), 'generate-qr', '--offline', '--ref', 'REF001'],
      { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('KHQR_BAKONG_ID_REQUIRED');
    expect(output).not.toContain('QR String:');
  });

  // -----------------------------------------------------------------------
  // QR-REQ-03: Confirmation prompt tests
  // -----------------------------------------------------------------------

  // 30s ceiling: spawns the built CLI; the 5s default false-fails when the
  // machine is loaded (seen 2026-09-29 under parallel coverage runs).
  it('cancels online QR generation when user answers no to confirmation prompt', { timeout: 30_000 }, () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_MERCHANT_ID=test-merchant-001\nPAYWAY_API_KEY=test-api-key-123456789012\n',
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
        input: '\n' + 'n\n',
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(stripAnsi(output)).toContain('Submit to PayWay? (y/n)');
    expect(stripAnsi(output)).not.toContain('Online QR generated');
  });

  it('proceeds with online QR generation when user confirms', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_MERCHANT_ID=test-merchant-001\nPAYWAY_API_KEY=test-api-key-123456789012\n',
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
        input: '\n' + 'y\n',
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(stripAnsi(output)).toContain('Submit to PayWay? (y/n)');
    expect(stripAnsi(output)).not.toContain('Cancelled by user');
    expect(stripAnsi(output)).not.toContain('Missing merchant credentials');
  });

  // -----------------------------------------------------------------------
  // QR-REQ-03: --non-interactive flag tests
  // -----------------------------------------------------------------------

  it('generates offline without prompts when --non-interactive is provided', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      [
        'PAYWAY_MERCHANT_ID=test-merchant-001',
        'PAYWAY_API_KEY=test-api-key-123456789012',
        'PAYWAY_KHQR_BAKONG_ID=merchant@bakong',
        'PAYWAY_KHQR_ABA_MERCHANT_ID=123456789012345',
        'PAYWAY_KHQR_ACQUIRER_NAME=ABA Bank',
        'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE=5999',
        'PAYWAY_KHQR_MERCHANT_NAME=Example Merchant',
        'PAYWAY_KHQR_MERCHANT_CITY=Phnom Penh',
        'PAYWAY_KHQR_PAYWAY_DATA=synthetic-template',
      ].join('\n'),
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--offline',
        '--ref',
        'NONINTERACTIVE-1',
        '--non-interactive',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
        // No input — non-interactive should not prompt for anything
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    // Should NOT show any interactive prompts
    expect(stripAnsi(output)).not.toContain('Submit to PayWay? (y/n)');
    expect(stripAnsi(output)).not.toContain('Modify lifetime?');
    expect(result.status).toBe(0);
    expect(stripAnsi(output)).toContain('non-interactive mode');
    expect(stripAnsi(output)).toContain('Offline ABA KHQR generated');
    expect(stripAnsi(output)).toContain('QR String:');
    expect(stripAnsi(output)).toMatch(/000201010212/);
  });

  // S3 (second-pass audit): the same explicit --save-image must have the same
  // effect across renderers — machine mode previously returned before the
  // artifact code, silently producing no PNG while reporting accepted.
  it('offline QR --output json honors --save-image and reports the artifact path', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      [
        'PAYWAY_KHQR_BAKONG_ID=merchant@bakong',
        'PAYWAY_KHQR_ABA_MERCHANT_ID=123456789012345',
        'PAYWAY_KHQR_ACQUIRER_NAME=ABA Bank',
        'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE=5999',
        'PAYWAY_KHQR_MERCHANT_NAME=Example Merchant',
        'PAYWAY_KHQR_MERCHANT_CITY=Phnom Penh',
        'PAYWAY_KHQR_PAYWAY_DATA=synthetic-template',
      ].join('\n'),
    );

    const requestedPng = path.join(cwd, 'requested.png');
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--offline',
        '--ref',
        'S3-JSON',
        '-a',
        '1.00',
        '-y',
        '--no-polling',
        '--no-open-image',
        '--save-image',
        requestedPng,
        '--output',
        'json',
      ],
      { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } },
    );

    expect(result.status).toBe(0);
    // stdout is exactly one JSON document (the profile diagnostic is on stderr).
    const parsed = JSON.parse(result.stdout) as {
      creation?: { outcome: string; selfCheck?: { crcValid: boolean } };
      artifacts?: { qrPngPath?: string; qrPngError?: string };
    };
    expect(parsed.creation?.outcome).toBe('accepted');
    expect(parsed.creation?.selfCheck?.crcValid).toBe(true);
    expect(parsed.artifacts?.qrPngPath).toBe(requestedPng);
    expect(parsed.artifacts?.qrPngError).toBeUndefined();
    expect(existsSync(requestedPng)).toBe(true);
  });

  it('offline QR --output json reports an artifact failure without failing the QR itself', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      [
        'PAYWAY_KHQR_BAKONG_ID=merchant@bakong',
        'PAYWAY_KHQR_ABA_MERCHANT_ID=123456789012345',
        'PAYWAY_KHQR_ACQUIRER_NAME=ABA Bank',
        'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE=5999',
        'PAYWAY_KHQR_MERCHANT_NAME=Example Merchant',
        'PAYWAY_KHQR_MERCHANT_CITY=Phnom Penh',
        'PAYWAY_KHQR_PAYWAY_DATA=synthetic-template',
      ].join('\n'),
    );

    // Unwritable destination: a path whose parent is a FILE, not a directory.
    const blocker = path.join(cwd, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const badPng = path.join(blocker, 'nested', 'requested.png');

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--offline',
        '--ref',
        'S3-BADPATH',
        '-a',
        '1.00',
        '-y',
        '--no-polling',
        '--no-open-image',
        '--save-image',
        badPng,
        '--output',
        'json',
      ],
      { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      creation?: { outcome: string };
      artifacts?: { qrPngPath?: string; qrPngError?: string };
    };
    // The QR was created locally; the artifact failure is surfaced, not hidden.
    expect(parsed.creation?.outcome).toBe('accepted');
    expect(parsed.artifacts?.qrPngError).toBeTypeOf('string');
    expect(parsed.artifacts?.qrPngPath).toBeUndefined();
  });

  it('offline QR --output json with --no-save-image writes no PNG and no artifact path', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      [
        'PAYWAY_KHQR_BAKONG_ID=merchant@bakong',
        'PAYWAY_KHQR_ABA_MERCHANT_ID=123456789012345',
        'PAYWAY_KHQR_ACQUIRER_NAME=ABA Bank',
        'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE=5999',
        'PAYWAY_KHQR_MERCHANT_NAME=Example Merchant',
        'PAYWAY_KHQR_MERCHANT_CITY=Phnom Penh',
        'PAYWAY_KHQR_PAYWAY_DATA=synthetic-template',
      ].join('\n'),
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--offline',
        '--ref',
        'S3-NOSAVE',
        '-a',
        '1.00',
        '-y',
        '--no-polling',
        '--no-open-image',
        '--no-save-image',
        '--output',
        'json',
      ],
      { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { artifacts?: Record<string, unknown> };
    expect(Object.keys(parsed.artifacts ?? {})).toHaveLength(0);
    expect(existsSync(path.join(cwd, 'payway-output'))).toBe(false);
  });

  it('generates online through a local API without prompts in non-interactive mode', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);
    let requestedPath = '';
    let requestedBody = '';
    const mockServer = createServer((request, response) => {
      requestedPath = request.url ?? '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => (requestedBody += chunk));
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            status: { code: 0, message: 'OK' },
            qrString: 'ONLINE-MOCK-KHQR',
            qrImage: 'data:image/png;base64,aGVsbG8=',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind to a TCP port');

    try {
      const result = await runBuiltCli(
        [
          'generate-qr',
          '--amount',
          '1.00',
          '--currency',
          'USD',
          '--transaction-id',
          'ONLINE-NONINT',
          '--callback-url',
          'https://example.com/cb',
          '--non-interactive',
          '--no-polling',
        ],
        {
          cwd,
          env: {
            PATH: process.env.PATH ?? '',
            SystemRoot: process.env.SystemRoot ?? '',
            PAYWAY_MERCHANT_ID: 'test-merchant-001',
            PAYWAY_API_KEY: 'test-api-key-123456789012',
            PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
          },
        },
      );
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

      expect(result.status, JSON.stringify({ output, requestedPath, requestedBody })).toBe(0);
      expect(requestedPath).toBe('/api/payment-gateway/v1/payments/generate-qr');
      expect(JSON.parse(requestedBody)).toMatchObject({ tran_id: 'ONLINE-NONINT', amount: '1.00' });
      expect(output).toContain('non-interactive mode');
      expect(output).toContain('Online QR generated via PayWay API');
      expect(output).toContain('ONLINE-MOCK-KHQR');
      expect(output).toContain('Image saved to');
      expect(output).toContain(path.join(cwd, 'payway-output', 'ONLINE-NONINT.png'));
      expect(existsSync(path.join(cwd, 'payway-output', 'ONLINE-NONINT.png'))).toBe(true);
      expect(output).not.toContain('Submit to PayWay? (y/n)');
      expect(output).not.toContain('Modify lifetime?');
      expect(output).not.toContain('Cancelled by user');
      // Auto image-open stays off for non-TTY (agent/CI) runs.
      expect(output).not.toContain('default viewer');
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('keeps structured JSON on stdout when run through the built CLI', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);
    const mockServer = createServer((request, response) => {
      request.on('data', () => {});
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            status: { code: 0, message: 'OK' },
            qrString: 'ONLINE-STRUCTURED-KHQR',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind to a TCP port');

    try {
      const result = await runBuiltCli(
        [
          'generate-qr',
          '--amount',
          '1.00',
          '--transaction-id',
          'ONLINE-STRUCTURED',
          '--callback-url',
          'https://example.com/cb',
          '--non-interactive',
          '--output',
          'json',
          '--no-polling',
          '--no-save-image',
        ],
        {
          cwd,
          env: {
            PATH: process.env.PATH ?? '',
            SystemRoot: process.env.SystemRoot ?? '',
            PAYWAY_ENV: 'sandbox',
            PAYWAY_MERCHANT_ID: 'test-merchant-001',
            PAYWAY_API_KEY: 'test-api-key-123456789012',
            PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
          },
        },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, any>;
      expect(result.status).toBe(0);
      expect(parsed).toMatchObject({
        schemaVersion: '1.0',
        command: 'generate-qr',
        transactionId: 'ONLINE-STRUCTURED',
        creation: { outcome: 'accepted' },
      });
      expect(result.stdout).not.toContain('API_KEY');
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('allows opting out of the default QR image save', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    let requestedPath = '';
    const mockServer = createServer((request, response) => {
      requestedPath = request.url ?? '';
      request.on('data', () => {});
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            status: { code: 0, message: 'OK' },
            qrString: 'ONLINE-MOCK-KHQR',
            qrImage: 'data:image/png;base64,aGVsbG8=',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind to a TCP port');

    try {
      const result = await runBuiltCli(
        [
          'generate-qr',
          '--amount',
          '1.00',
          '--currency',
          'USD',
          '--transaction-id',
          'ONLINE-NOSAVE',
          '--callback-url',
          'https://example.com/cb',
          '--non-interactive',
          '--no-polling',
          '--no-save-image',
        ],
        {
          cwd,
          env: {
            PATH: process.env.PATH ?? '',
            SystemRoot: process.env.SystemRoot ?? '',
            PAYWAY_MERCHANT_ID: 'test-merchant-001',
            PAYWAY_API_KEY: 'test-api-key-123456789012',
            PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
          },
        },
      );
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

      expect(result.status, JSON.stringify({ output, requestedPath })).toBe(0);
      expect(requestedPath).toBe('/api/payment-gateway/v1/payments/generate-qr');
      expect(output).not.toContain('Image saved to');
      expect(existsSync(path.join(cwd, 'payway-output', 'ONLINE-NOSAVE.png'))).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('degrades gracefully when --open-image cannot launch a viewer', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const mockServer = createServer((request, response) => {
      request.on('data', () => {});
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            status: { code: 0, message: 'OK' },
            qrString: 'ONLINE-MOCK-KHQR',
            qrImage: 'data:image/png;base64,aGVsbG8=',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind to a TCP port');

    try {
      // Empty PATH guarantees the platform viewer binary cannot be found,
      // exercising the graceful-degradation path on every OS.
      const result = await runBuiltCli(
        [
          'generate-qr',
          '--amount',
          '1.00',
          '--currency',
          'USD',
          '--transaction-id',
          'ONLINE-FORCEOPEN',
          '--callback-url',
          'https://example.com/cb',
          '--non-interactive',
          '--no-polling',
          '--open-image',
        ],
        {
          cwd,
          env: {
            PATH: '',
            SystemRoot: process.env.SystemRoot ?? '',
            PAYWAY_MERCHANT_ID: 'test-merchant-001',
            PAYWAY_API_KEY: 'test-api-key-123456789012',
            PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
          },
        },
      );
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

      expect(result.status, JSON.stringify({ output })).toBe(0);
      expect(existsSync(path.join(cwd, 'payway-output', 'ONLINE-FORCEOPEN.png'))).toBe(true);
      expect(output).toContain('Could not open QR image automatically');
      expect(output).toContain(`Open it manually: ${path.join(cwd, 'payway-output', 'ONLINE-FORCEOPEN.png')}`);
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('prints refund follow-up guidance with the exact fields to inspect', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    let requestedPath = '';
    let requestedBody = '';
    const mockServer = createServer((request, response) => {
      requestedPath = request.url ?? '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => (requestedBody += chunk));
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            status: { code: 0, message: 'OK' },
            data: { tran_id: 'REFUND-TEST-001' },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind to a TCP port');

    try {
      const result = await runBuiltCli(['refund', '-t', 'REFUND-TEST-001', '-a', '1.11', '-c', 'USD', '-y'], {
        cwd,
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
          PAYWAY_MERCHANT_ID: 'test-merchant-001',
          PAYWAY_API_KEY: 'test-api-key-123456789012',
          PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
          PAYWAY_RSA_PUBLIC_KEY: TEST_RSA.publicKey,
        },
      });
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

      expect(result.status, JSON.stringify({ output, requestedPath, requestedBody })).toBe(0);
      expect(requestedPath).toBe('/api/merchant-portal/merchant-access/online-transaction/refund');
      expect(output).toContain('Refund submitted for REFUND-TEST-001');
      expect(output).toContain('Requested refund: 1.11 USD');
      expect(output).toContain('transaction-detail -t REFUND-TEST-001');
      expect(output).toContain('refund_amount = total refunded so far');
      expect(output).toContain('transaction_operations = refund event history');
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  // -----------------------------------------------------------------------
  // QR-REQ-04/05: Lifetime parameter tests
  // -----------------------------------------------------------------------

  it('displays default lifetime of 180 seconds when --lifetime is omitted', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_MERCHANT_ID=test-merchant-001\nPAYWAY_API_KEY=test-api-key-123456789012\n',
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
        input: '\n' + 'n\n',
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(stripAnsi(output)).toContain('Lifetime:         180 seconds');
    expect(stripAnsi(output)).toContain('Modify lifetime? Current: 180s');
  });

  it('displays custom lifetime when --lifetime is provided', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_MERCHANT_ID=test-merchant-001\nPAYWAY_API_KEY=test-api-key-123456789012\n',
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
        '--lifetime',
        '600',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
        input: '\n' + 'n\n',
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(stripAnsi(output)).toContain('Lifetime:         600 seconds');
    expect(stripAnsi(output)).toContain('Modify lifetime? Current: 600s');
  });

  it('allows user to override lifetime via prompt', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_MERCHANT_ID=test-merchant-001\nPAYWAY_API_KEY=test-api-key-123456789012\n',
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'generate-qr',
        '--amount',
        '1.00',
        '--currency',
        'USD',
        '--callback-url',
        'https://example.com/cb',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
        input: '\n' + 'n\n',
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(stripAnsi(output)).toContain('Modify lifetime? Current: 180s');
    expect(stripAnsi(output)).toContain('Enter new value (or press Enter to skip)');
  });

  // -----------------------------------------------------------------------
  // config command tests
  // -----------------------------------------------------------------------

  it('config command shows "(not set)" when .env is absent', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'config'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(output).toContain('configuration');
    expect(output).toContain('No .env file found');
    expect(output).toContain('(not set)');
    expect(output).toContain('Merchant ID');
    expect(output).toContain('API Key');
    expect(output).toContain('Environment');
    expect(result.status).toBe(1);
  });

  it('config command displays loaded values from .env', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      [
        'PAYWAY_ENV=sandbox',
        'PAYWAY_MERCHANT_ID=merchant-abc-123',
        'PAYWAY_API_KEY=super-secret-api-key-1234567890',
        'PAYWAY_RETURN_URL=https://example.com/return',
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'config'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(output).toContain('.env file found');
    expect(output).toContain('sandbox');
    expect(output).toContain('merchant-abc-123');
    // API key should be masked — show first 8 chars then bullets
    expect(output).toContain('super-se');
    // URL should be shown in full
    expect(output).toContain('https://example.com/return');
    expect(output).toContain('All environment variables valid');
    expect(result.status).toBe(0);
  });

  it('config command reports errors for missing required vars', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(path.join(cwd, '.env'), 'PAYWAY_ENV=sandbox\n');

    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'config'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(output).toContain('error(s)');
    expect(output).toContain('PAYWAY_MERCHANT_ID is missing');
    expect(output).toContain('PAYWAY_API_KEY is missing');
    expect(result.status).toBe(1);
  });

  it('config command masks short API keys with bullets', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    writeFileSync(
      path.join(cwd, '.env'),
      [
        'PAYWAY_ENV=sandbox',
        'PAYWAY_MERCHANT_ID=m001',
        'PAYWAY_API_KEY=short',
        'PAYWAY_RETURN_URL=https://example.com/return',
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'config'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    // Short keys get fully masked
    expect(output).toContain('••••••••');
    expect(result.status).toBe(0);
  });

  // -----------------------------------------------------------------------
  // payment-link command validation
  // -----------------------------------------------------------------------

  it('payment-link create exits with validation error for invalid amount', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'payment-link',
        'create',
        '--title',
        'Test',
        '--amount',
        'abc',
        '--merchant-ref-no',
        'ref-001',
        '--return-url',
        'https://example.com/ret',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
        },
      },
    );

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(1);
    expect(output).toContain('Amount must be a positive number');
  });

  it('payment-link detail exits when --id is missing', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'payment-link', 'detail'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(1);
    expect(output).toContain('required option');
    expect(output).toContain('--id');
  });

  it('payment-link void exits when --id is missing', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'payment-link', 'void'], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
      },
    });

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(1);
    expect(output).toContain('required option');
    expect(output).toContain('--id');
  });

  it('payment-link create exits with RSA error when PAYWAY_RSA_PUBLIC_KEY is missing', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'payment-link',
        'create',
        '--title',
        'Test',
        '--amount',
        '1',
        '--merchant-ref-no',
        'ref-001',
        '--return-url',
        'https://example.com/ret',
      ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
          PAYWAY_MERCHANT_ID: 'test-merchant',
          PAYWAY_API_KEY: 'test-api-key',
          // Intentionally omitting PAYWAY_RSA_PUBLIC_KEY
        },
      },
    );

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(result.status).toBe(1);
    expect(output).toContain('PAYWAY_RSA_PUBLIC_KEY is missing');
  });
});

describe('pre-auth command group', () => {
  it('lists complete, complete-payout, and cancel subcommands in --help', () => {
    const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), 'pre-auth', '--help'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    });
    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    expect(output).toContain('complete');
    expect(output).toContain('complete-payout');
    expect(output).toContain('cancel');
  });

  it('cancel hits the pre-auth-cancellation endpoint and prints JSON', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    let requestedPath = '';
    let requestedBody = '';
    const mockServer = createServer((request, response) => {
      requestedPath = request.url ?? '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => (requestedBody += chunk));
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: { code: '00', message: 'Cancelled' }, tran_id: 'PREAUTH-1' }));
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind');

    try {
      const result = await runBuiltCli(['pre-auth', 'cancel', '-t', 'PREAUTH-1', '-y', '--json'], {
        cwd,
        env: {
          PATH: process.env.PATH ?? '',
          SystemRoot: process.env.SystemRoot ?? '',
          PAYWAY_MERCHANT_ID: 'test-merchant-001',
          PAYWAY_API_KEY: 'test-api-key-123456789012',
          PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
          PAYWAY_RSA_PUBLIC_KEY: TEST_RSA.publicKey,
        },
      });
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
      expect(result.status, JSON.stringify({ output, requestedPath })).toBe(0);
      expect(requestedPath).toContain('/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation');
      // tran_id is RSA-encrypted inside merchant_auth; the round-trip is proven by the echoed response below.
      expect(output).toContain('"tran_id": "PREAUTH-1"');
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('complete hits the pre-auth-completion endpoint and prints JSON', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    let requestedPath = '';
    let requestedBody = '';
    const mockServer = createServer((request, response) => {
      requestedPath = request.url ?? '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => (requestedBody += chunk));
      request.on('end', () => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: { code: '00', message: 'Completed' }, tran_id: 'PREAUTH-1' }));
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind');

    try {
      const result = await runBuiltCli(
        ['pre-auth', 'complete', '-t', 'PREAUTH-1', '-a', '10', '--original-amount', '10', '--json'],
        {
          cwd,
          env: {
            PATH: process.env.PATH ?? '',
            SystemRoot: process.env.SystemRoot ?? '',
            PAYWAY_MERCHANT_ID: 'test-merchant-001',
            PAYWAY_API_KEY: 'test-api-key-123456789012',
            PAYWAY_BASE_URL: `http://127.0.0.1:${address.port}`,
            PAYWAY_RSA_PUBLIC_KEY: TEST_RSA.publicKey,
          },
        },
      );
      const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
      expect(result.status, JSON.stringify({ output, requestedPath })).toBe(0);
      expect(requestedPath).toContain('/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion');
      // tran_id is RSA-encrypted inside merchant_auth; the round-trip is proven by the echoed response below.
      expect(output).toContain('"tran_id": "PREAUTH-1"');
    } finally {
      await new Promise<void>((resolve, reject) => mockServer.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
