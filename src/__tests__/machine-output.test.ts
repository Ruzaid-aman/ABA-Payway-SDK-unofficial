import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

/**
 * F11 machine-output contract: under `--json` (or `--output json|ndjson`),
 * diagnostics — specifically the `Using profile:` notice — go to STDERR, and
 * stdout is exactly one clean JSON document (or one record per NDJSON line).
 * Driven in-process via runCli; a temp APPDATA carries one profile so the
 * notice actually fires; the command fails LOCAL validation so zero network
 * occurs.
 */
const tempAppData = mkdtempSync(path.join(tmpdir(), 'payway-f11-'));
const originalCwd = process.cwd();
const originalAppData = process.env.APPDATA;

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempAppData);
  // Seed a profile store with a default profile so `Using profile:` fires.
  mkdirSync(path.join(tempAppData, 'aba-payway-sdk'), { recursive: true });
  writeFileSync(
    path.join(tempAppData, 'aba-payway-sdk', 'profiles.json'),
    JSON.stringify({
      version: 1,
      defaultProfile: 'sandbox-main',
      profiles: [
        {
          name: 'sandbox-main',
          environment: 'sandbox',
          merchantId: 'f11merchantid1',
          apiKey: 'f11-api-key-000000000000',
        },
      ],
    }),
  );
  process.env.APPDATA = tempAppData;
  delete process.env.PAYWAY_MERCHANT_ID;
  delete process.env.PAYWAY_API_KEY;
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  process.chdir(originalCwd);
  rmSync(tempAppData, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<{ stdout: string; stderr: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { stdout: captured.stdout(), stderr: captured.stderr(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('F11 machine output: diagnostics on stderr under machine output', () => {
  it('routes the profile notice to stderr and keeps stdout pure JSON on a local-validation failure (--output json)', async () => {
    // Lifetime below the QR minimum (180s) fails LOCAL validation: no network,
    // and the --output json path emits the machine envelope on stdout.
    const { stdout, stderr, exitCode } = await run([
      'generate-qr',
      '-a',
      '5',
      '-c',
      'USD',
      '--lifetime',
      '10',
      '--output',
      'json',
      '-y',
      '--no-polling',
      '--no-open-image',
      '--no-save-image',
    ]);

    expect(exitCode).toBe(1); // local validation failure, zero network
    expect(stderr).toContain('Using profile:');
    // stdout is exactly one JSON document — the error envelope.
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(stdout).not.toContain('Using profile:');
  });

  it('keeps the human notice on stdout when machine output is NOT active', async () => {
    const { stdout } = await run([
      'generate-qr',
      '-a',
      '5',
      '-c',
      'USD',
      '--lifetime',
      '10',
      '-y',
      '--no-polling',
      '--no-open-image',
      '--no-save-image',
    ]);
    expect(stdout).toContain('Using profile:');
  });
});
