import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

/** Strip ANSI escape sequences so string matching works reliably. */
function stripAnsi(s: string): string {
  const esc = String.fromCharCode(27);
  return s.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '');
}

function runBuiltCli(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('built CLI did not exit within 4 seconds'));
    }, 4_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('built CLI', () => {
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

  // -----------------------------------------------------------------------
  // QR-REQ-02: Early credential validation tests
  // -----------------------------------------------------------------------

  it('exits with clear error when PAYWAY_MERCHANT_ID is missing (online mode)', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'payway-cli-'));
    temporaryDirectories.push(cwd);

    // Create a .env with only API key, missing merchant ID
    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_API_KEY=test-api-key-123456789012\n',
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
    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_MERCHANT_ID=test-merchant-001\n',
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
        profiles: [{
          name: 'offline',
          khqr: {
            bakongId: 'merchant@bakong', abaMerchantId: '123456789012345', acquirerName: 'ABA Bank',
            merchantCategoryCode: '5999', merchantName: 'Example Merchant', merchantCity: 'Phnom Penh', paywayData: 'aba-template',
          },
        }],
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
        profiles: [{
          name: 'private', merchantId: 'merchant-secret', apiKey: 'api-key-secret',
          khqr: {
            bakongId: 'bakong-secret', abaMerchantId: '123456789012345', acquirerName: 'ABA Bank',
            merchantCategoryCode: '5999', merchantName: 'Example Merchant', merchantCity: 'Phnom Penh', paywayData: 'payway-data-secret',
          },
        }],
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

  it('cancels online QR generation when user answers no to confirmation prompt', () => {
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
      expect(output).not.toContain('Submit to PayWay? (y/n)');
      expect(output).not.toContain('Modify lifetime?');
      expect(output).not.toContain('Cancelled by user');
    } finally {
      await new Promise<void>((resolve, reject) =>
        mockServer.close((error) => (error ? reject(error) : resolve())),
      );
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

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'dist', 'cli.js'), 'config'],
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

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'dist', 'cli.js'), 'config'],
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

    writeFileSync(
      path.join(cwd, '.env'),
      'PAYWAY_ENV=sandbox\n',
    );

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'dist', 'cli.js'), 'config'],
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

    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'dist', 'cli.js'), 'config'],
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
        'payment-link', 'create',
        '--title', 'Test',
        '--amount', 'abc',
        '--merchant-ref-no', 'ref-001',
        '--return-url', 'https://example.com/ret',
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

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'dist', 'cli.js'),
        'payment-link', 'detail',
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
        'payment-link', 'create',
        '--title', 'Test',
        '--amount', '1',
        '--merchant-ref-no', 'ref-001',
        '--return-url', 'https://example.com/ret',
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
