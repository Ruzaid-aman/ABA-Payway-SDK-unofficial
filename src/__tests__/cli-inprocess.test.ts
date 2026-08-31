/**
 * In-process CLI coverage.
 *
 * `src/cli.ts` self-parses only when invoked directly (main-module guard);
 * tests drive the exported `runCli(argv)` instead of spawning a child, which
 * makes the command bodies visible to v8 coverage. Only side-effect-free
 * commands are exercised here (no network, no prompts, no file writes):
 * the interactive/destructive commands remain covered end-to-end by
 * `cli.test.ts` (child process) where they apply.
 *
 * The module loads `<cwd>/.env` at import time, so the working directory is
 * switched to an empty temp dir BEFORE the dynamic import — keeping the
 * hermetic test environment free of ambient credentials.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-inprocess-'));
const originalCwd = process.cwd();

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

/** Save/restore process.exitCode around an invocation. */
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

describe('CLI in-process (runCli)', () => {
  it('status prints the payment-status and refund code tables', async () => {
    const { text, exitCode } = await run(['status']);
    expect(text).toContain('payment status reference');
    expect(text).toContain('APPROVED');
    expect(text).toContain('PTL04');
    expect(exitCode).not.toBe(1);
  });

  it('explain with no argument lists every known code', async () => {
    const { text } = await run(['explain']);
    expect(text).toContain('Wrong Hash');
    expect(text).toContain('Lifetime Below Minimum');
  });

  it('explain decodes a known gateway code', async () => {
    const { text } = await run(['explain', '49']);
    expect(text).toContain('Invalid Request');
    expect(text).toContain('YYYY-MM-DD HH:mm:ss');
  });

  it('explain normalizes padded codes and reports unknown ones', async () => {
    const { text } = await run(['explain', '04']);
    // B5: code 04 moved from the generic gateway family to the cof family.
    expect(text).toContain('Validation / binding failure');
    const { text: unknownText } = await run(['explain', '9999']);
    expect(unknownText).toContain('Unknown or undocumented code');
  });

  it('validate accepts a valid amount and transaction id', async () => {
    const { text, exitCode } = await run(['validate', '-a', '5', '-c', 'USD', '-t', 'probe-ok-1']);
    expect(text).toContain('valid');
    expect(exitCode).not.toBe(1);
  });

  it('validate rejects malformed input with exit code 1', async () => {
    const { text, exitCode } = await run(['validate', '-a', 'abc']);
    expect(text).toContain('finite number');
    expect(exitCode).toBe(1);
  });

  it('config reports the environment state with secrets masked', async () => {
    const { text, exitCode } = await run(['config']);
    expect(text).toContain('configuration');
    expect(text).toContain('.env'); // present or absent — either way it reports
    // Labels are printed, not raw variable names; the credential source
    // banner (profile store > .env > env) is always shown.
    expect(text).toContain('API Key');
    expect(text).toContain('Using profile');
    expect(text).not.toMatch(/sk[test_-][A-Za-z0-9]{8,}/); // never a raw secret
    // Exit 0 when the environment validates; exit 1 with missing credentials
    // (the hermetic test env has none) — both are valid completions.
    expect([0, 1]).toContain(exitCode as number);
  });

  it('doctor completes without credentials and flags the gaps', async () => {
    const { text, exitCode } = await run(['doctor']);
    expect(text.length).toBeGreaterThan(0);
    expect([0, 1]).toContain(exitCode as number);
  });

  it('profiles list runs read-only against the local profile store', async () => {
    const { text, exitCode } = await run(['profiles', 'list']);
    expect(text.length).toBeGreaterThan(0);
    expect(exitCode).not.toBe(1);
  });

  it('skills list runs read-only and lists packaged skills', async () => {
    const { text, exitCode } = await run(['skills', 'list']);
    expect(text.length).toBeGreaterThan(0);
    expect(exitCode).not.toBe(1);
  });

  it('demo runs the built-in mock-server test suite to completion', async () => {
    const { text, exitCode } = await run(['demo']);
    expect(text).toContain('demo run');
    expect(text).toMatch(/Total:/);
    expect(text).toMatch(/Passed:/);
    expect(exitCode).toBe(0);
  }, 60_000);

  it('setup-webhook rejects an invalid port before starting anything', async () => {
    const { text, exitCode } = await run(['setup-webhook', '--port', '99999']);
    expect(text).toContain('Invalid port');
    expect(exitCode).toBe(1);
  });

  it('agent doctor prints the capability matrix without a provider connection', async () => {
    const { text, exitCode } = await run(['agent', 'doctor']);
    expect(text.length).toBeGreaterThan(0);
    expect([undefined, 0, 1]).toContain(exitCode);
  });

  it('agent sessions list runs read-only', async () => {
    const { text, exitCode } = await run(['agent', 'sessions', 'list']);
    expect(text.length).toBeGreaterThan(0);
    expect([undefined, 0, 1]).toContain(exitCode);
  });

  it('skills doctor tolerates a missing packaged-skills directory and reports diagnostics', async () => {
    const { text, exitCode } = await run(['skills', 'doctor']);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('ENOENT'); // missing dir is reported, not crashed on
    expect([undefined, 0, 1]).toContain(exitCode);
  });
});

describe('checkout-form (in-process runCli)', () => {
  // The CLI's persisted global profile store (%APPDATA%/aba-payway-sdk) would
  // otherwise supply machine-local credentials; point APPDATA at an empty dir
  // so every case below is deterministic on any machine.
  const emptyAppData = mkdtempSync(path.join(tmpdir(), 'payway-empty-appdata-'));

  afterAll(() => {
    rmSync(emptyAppData, { recursive: true, force: true });
  });

  it('requires credentials (the signed form embeds merchant_id + hash)', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    // Earlier tests in this file trigger profile activation, which persists
    // resolved credentials into process.env for the whole file — remove them
    // so the missing-credentials path is actually exercised.
    const savedMid = process.env.PAYWAY_MERCHANT_ID;
    const savedKey = process.env.PAYWAY_API_KEY;
    delete process.env.PAYWAY_MERCHANT_ID;
    delete process.env.PAYWAY_API_KEY;
    try {
      const { text, exitCode } = await run(['checkout-form', '-a', '15']);
      expect(text).toContain('Missing merchant credentials');
      expect(exitCode).toBe(1);
    } finally {
      if (savedMid !== undefined) process.env.PAYWAY_MERCHANT_ID = savedMid;
      if (savedKey !== undefined) process.env.PAYWAY_API_KEY = savedKey;
      vi.unstubAllEnvs();
    }
  });

  it('writes a signed form document to --out with stubbed credentials', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    const outDir = mkdtempSync(path.join(tmpdir(), 'payway-checkout-form-'));
    const outPath = path.join(outDir, 'form.html');
    try {
      const { text, exitCode } = await run(['checkout-form', '-a', '15.00', '--out', outPath]);
      expect(exitCode).toBe(0);
      expect(text).toContain('written to');
      expect(text).toMatch(/Transaction ID:/);

      const html = readFileSync(outPath, 'utf8');
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase');
      expect(html).toContain('name="merchant_id" value="inprocess-mid"');
      expect(html).toContain('name="hash"');
      expect(html).toContain('name="amount" value="15.00"');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it('emits clean HTML on stdout and diagnostics on stderr (redirect-safe)', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    try {
      const { text, exitCode } = await run(['checkout-form', '-a', '3', '-t', 'stdout-tx-1']);
      expect(exitCode).toBe(0);
      const html = stdoutChunks.join('');
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('name="tran_id" value="stdout-tx-1"');
      // Diagnostics ride console.error (captured by run()), never stdout.
      expect(html).not.toContain('Transaction ID:');
      expect(text).toContain('Transaction ID:');
    } finally {
      stdoutSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('rejects an invalid amount with exit code 1', async () => {
    const { text, exitCode } = await run(['checkout-form', '-a', '0']);
    expect(text).toContain('Amount must be a positive number');
    expect(exitCode).toBe(1);
  });

  it('surfaces domain validation conflicts (autoSubmit + popupMode) as exit 1', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    try {
      const { text, exitCode } = await run(['checkout-form', '-a', '3', '--auto-submit', '--popup']);
      expect(text).toContain('mutually exclusive');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('payment-link create --image exits 1 with a clear message for a missing file', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    vi.stubEnv('PAYWAY_RSA_PUBLIC_KEY', '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQ\n-----END PUBLIC KEY-----\n');
    try {
      const { text, exitCode } = await run([
        'payment-link',
        'create',
        '-t', 'T',
        '-a', '5',
        '-r', 'ref-img-1',
        '--return-url', 'https://example.com/return',
        '--image', 'definitely-missing-image.png',
      ]);
      expect(text).toContain('--image file not found');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
