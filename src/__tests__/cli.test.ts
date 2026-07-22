import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

/** Strip ANSI escape sequences so string matching works reliably. */
function stripAnsi(s: string): string {
  const esc = String.fromCharCode(27);
  return s.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '');
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

  it('does NOT require credentials for offline QR generation', () => {
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
        '--offline',
        '--merchant-id',
        'merchant-001',
        '--ref',
        'REF001',
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
    expect(result.status).toBe(0);
    expect(output).toContain('Offline QR generated');
    expect(output).not.toContain('Missing merchant credentials');
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
});
