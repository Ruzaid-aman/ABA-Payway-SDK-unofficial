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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureConsole } from '../test/test-utils.js';
import { addProfile, loadProfileStore, saveProfileStore } from '../config/profiles.js';

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
async function run(argv: string[]): Promise<{ text: string; stdout: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { text: captured.text(), stdout: captured.stdout(), exitCode: process.exitCode };
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

  // Codification C6 (2026-09-06): the payment-link PTL family has its own
  // explain entries, with the sandbox-vs-official caveats baked into the hint.
  it('explain decodes the payment-link PTL132/PTL05/PTL99 family', async () => {
    const ptl132 = await run(['explain', 'PTL132']);
    expect(ptl132.text).toContain('Invalid Payment Link');
    expect(ptl132.text).toContain('data.id');
    expect(ptl132.text).toContain('96');

    const ptl05 = await run(['explain', 'PTL05']);
    expect(ptl05.text).toContain('Parameter Invalid Format');
    expect(ptl05.text).toContain('PTL04');

    const ptl99 = await run(['explain', 'PTL99']);
    expect(ptl99.text).toContain('Merchant Invalid Currency');
  });

  // PTL188 (SANDBOX-FINDINGS §23, void endpoint): terminal state, not a failure.
  it('explain decodes the payment-link PTL188 already-voided code', async () => {
    const ptl188 = await run(['explain', 'PTL188']);
    expect(ptl188.text).toContain('Payment Link Already Voided');
    expect(ptl188.text).toContain('terminal state');
  });

  // Error-code registry (competitive portal-parity wave, 2026-09-12): --json
  // emits one machine-readable document per the F11 stdout contract, and
  // live-verified codes carry sandbox provenance.
  it('explain --json prints one JSON doc; unknown code prints the error envelope', async () => {
    const known = await run(['explain', 'PTL36', '--json']);
    const doc = JSON.parse(known.stdout);
    expect(doc).toMatchObject({ code: 'PTL36', family: 'refund', title: 'Transaction not found', sandboxVerified: true });
    expect(doc.evidence).toMatch(/SANDBOX-FINDINGS §/);

    const all = await run(['explain', '--json']);
    const docs = JSON.parse(all.stdout);
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThanOrEqual(40);
    const verified = docs.filter((e: { sandboxVerified?: boolean }) => e.sandboxVerified);
    expect(verified.length).toBeGreaterThanOrEqual(20);

    const unknown = await run(['explain', 'NOPE-1', '--json']);
    const envelope = JSON.parse(unknown.stdout);
    expect(envelope.error.kind).toBe('validation');
    expect(unknown.exitCode).toBe(1);
  });

  it('explain text mode marks sandbox-verified codes with their evidence', async () => {
    const { text } = await run(['explain', 'PTL36']);
    expect(text).toContain('sandbox-verified');
    expect(text).toContain('SANDBOX-FINDINGS §8/§9');
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
    // Seeded profile store in an isolated app-data dir: this test used to
    // depend (accidentally) on the developer's real %APPDATA% profile store.
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-config-appdata-'));
    const previousAppData = process.env.APPDATA;
    process.env.APPDATA = appData;
    try {
      const store = loadProfileStore();
      addProfile(store, {
        name: 'ci-profile',
        environment: 'sandbox',
        merchantId: 'ci-merchant-id',
        apiKey: 'ci-api-key-secret-000',
      });
      store.defaultProfile = 'ci-profile';
      saveProfileStore(store);

      const { text, exitCode } = await run(['config']);
      expect(text).toContain('configuration');
      expect(text).toContain('.env'); // present or absent — either way it reports
      // Labels are printed, not raw variable names; the credential source
      // banner (profile store > .env > env) is always shown.
      expect(text).toContain('API Key');
      expect(text).toContain('Using profile');
      expect(text).toContain('ci-profile');
      expect(text).not.toContain('ci-api-key-secret-000'); // masked
      expect(text).not.toMatch(/sk[test_-][A-Za-z0-9]{8,}/); // never a raw secret
      // Exit 0 when the environment validates; exit 1 with missing credentials
      // (no .env in the temp cwd) — both are valid completions.
      expect([0, 1]).toContain(exitCode as number);
    } finally {
      if (previousAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = previousAppData;
      rmSync(appData, { recursive: true, force: true });
    }
  });

  it('doctor completes without credentials and flags the gaps', async () => {
    const { text, exitCode } = await run(['doctor']);
    expect(text.length).toBeGreaterThan(0);
    expect([0, 1]).toContain(exitCode as number);
  });

  it('doctor reports the credential-free demo route as ready', async () => {
    const { text, exitCode } = await run(['doctor', '--route', 'demo']);
    expect(text).toContain('Route: demo');
    expect(text).toContain('Credential source:');
    expect(text).not.toContain('API Key is set');
    expect(exitCode).toBe(0);
  });

  it('rejects unsupported init modes before writing files', async () => {
    const { text, exitCode } = await run(['init', '--mode', 'production']);
    expect(text).toContain('--mode must be demo or sandbox');
    expect(exitCode).toBe(1);
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

  it('demo checks the local simulated payment app to completion', async () => {
    const { text, exitCode } = await run(['demo', '--check']);
    expect(text).toContain('Credential-free demo check passed');
    expect(text).toContain('http://127.0.0.1:');
    expect(exitCode).toBe(0);
  });

  it('rejects invalid demo ports before starting a server', async () => {
    const { text, exitCode } = await run(['demo', '--port', '70000']);
    expect(text).toContain('--port must be an integer from 0 to 65535');
    expect(exitCode).toBe(1);
  });

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

  it('forwards hosted-page and continuation fields into the signed form', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    const outDir = mkdtempSync(path.join(tmpdir(), 'payway-checkout-hosted-form-'));
    const outPath = path.join(outDir, 'hosted.html');
    try {
      const { exitCode } = await run([
        'checkout-form',
        '-a',
        '15.00',
        '--payment-gate',
        '0',
        '--skip-success-page',
        '0',
        '--continue-success-url',
        'https://merchant.example/continue',
        '--out',
        outPath,
      ]);
      expect(exitCode).toBe(0);

      const html = readFileSync(outPath, 'utf8');
      expect(html).toContain('name="payment_gate" value="0"');
      expect(html).toContain('name="skip_success_page" value="0"');
      expect(html).toContain('name="continue_success_url"');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it('rejects checkout-form hosted-page flags outside 0 or 1', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    try {
      const gate = await run(['checkout-form', '-a', '15.00', '--payment-gate', '2']);
      expect(gate.exitCode).toBe(1);
      expect(gate.text).toContain('--payment-gate must be 0 or 1');

      const successPage = await run(['checkout-form', '-a', '15.00', '--skip-success-page', 'yes']);
      expect(successPage.exitCode).toBe(1);
      expect(successPage.text).toContain('--skip-success-page must be 0 or 1');
    } finally {
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

  it('payment-link create --payout exits 1 when the total does not equal the amount', async () => {
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
        '-r', 'ref-payout-1',
        '--return-url', 'https://example.com/return',
        '--payout', '[{"acc":"000111222","amt":4}]',
      ]);
      expect(text).toContain('must equal the payment-link amount');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('payment-link create --payout exits 1 for a wrong entry shape', async () => {
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
        '-r', 'ref-payout-2',
        '--return-url', 'https://example.com/return',
        '--payout', '[{"account":"000111222","amount":5}]',
      ]);
      expect(text).toContain('--payout must be a JSON array of {acc, amt} objects');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // The pre-refactor CLI copy only checked acc:string + amt:number, letting
  // empty acc / negative amt through local validation (the SDK throw rescued
  // it). The shared validatePayoutEntryShape closes that gap — pinned here.
  it('payment-link create --payout exits 1 for an empty acc (shared validator, full shape)', async () => {
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
        '-r', 'ref-payout-3',
        '--return-url', 'https://example.com/return',
        '--payout', '[{"acc":"","amt":5}]',
      ]);
      expect(text).toContain('--payout must be a JSON array of {acc, amt} objects');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('payment-link create --payout exits 1 for a negative amt (shared validator, full shape)', async () => {
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
        '-r', 'ref-payout-4',
        '--return-url', 'https://example.com/return',
        '--payout', '[{"acc":"000111222","amt":-5}]',
      ]);
      expect(text).toContain('--payout must be a JSON array of {acc, amt} objects');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // T5.4 envelope contract (payment-link parity with check-transaction /
  // transaction-detail / generate-checkout): under --json a local validation
  // failure prints the machine-parseable `{ error: { kind, exitCode, … } }`
  // envelope — never the human ✗ block — and no banner noise before it.
  it('payment-link create --json prints a validation error envelope for a bad payout total', async () => {
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
        '-r', 'ref-json-envelope-1',
        '--return-url', 'https://example.com/return',
        '--payout', '[{"acc":"000111222","amt":4}]',
        '--json',
      ]);
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
        error: { kind: string; exitCode: number; type: string; message: string };
      };
      expect(parsed.error.kind).toBe('validation');
      expect(parsed.error.exitCode).toBe(1);
      expect(parsed.error.type).toBe('PayWayConfigError');
      expect(parsed.error.message).toContain('must equal the payment-link amount');
      expect(text).not.toContain('✗');
      expect(text).not.toContain('ABA PayWay SDK');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('payment-link create --json prints a validation error envelope for a bad amount', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    vi.stubEnv('PAYWAY_RSA_PUBLIC_KEY', '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQ\n-----END PUBLIC KEY-----\n');
    try {
      const { text, exitCode } = await run([
        'payment-link',
        'create',
        '-t', 'T',
        '-a', 'not-a-number',
        '-r', 'ref-json-envelope-2',
        '--return-url', 'https://example.com/return',
        '--json',
      ]);
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
        error: { kind: string; exitCode: number; message: string };
      };
      expect(parsed.error.kind).toBe('validation');
      expect(parsed.error.exitCode).toBe(1);
      expect(parsed.error.message).toContain('Amount must be a positive number');
      expect(text).not.toContain('✗');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // The CLI is deliberately stricter than the domain on the 3MB image cap
  // (parity with the --payout total rule): the loader hard-exits before the
  // network instead of surfacing the domain's advisory warn.
  it('payment-link create --image exits 1 for a file exceeding the 3MB cap', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    vi.stubEnv('PAYWAY_RSA_PUBLIC_KEY', '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQ\n-----END PUBLIC KEY-----\n');
    const oversized = path.join(tempDir, 'oversized.png');
    try {
      writeFileSync(oversized, Buffer.alloc(3 * 1024 * 1024 + 1, 1));
      const { text, exitCode } = await run([
        'payment-link',
        'create',
        '-t', 'T',
        '-a', '5',
        '-r', 'ref-img-cap-1',
        '--return-url', 'https://example.com/return',
        '--image', oversized,
      ]);
      expect(text).toContain('exceeding the documented 3MB payment-link image limit');
      expect(exitCode).toBe(1);
    } finally {
      rmSync(oversized, { force: true });
      vi.unstubAllEnvs();
    }
  });

  // Edge of the cap: exactly 3MB passes the loader (advisory semantics keep
  // the boundary inclusive — the domain warns only ABOVE the cap).
  it('payment-link create --image accepts a file at exactly 3MB', async () => {
    vi.stubEnv('APPDATA', emptyAppData);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    vi.stubEnv('PAYWAY_RSA_PUBLIC_KEY', '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQ\n-----END PUBLIC KEY-----\n');
    const exact = path.join(tempDir, 'exact-3mb.png');
    try {
      writeFileSync(exact, Buffer.alloc(3 * 1024 * 1024, 1));
      const { text } = await run([
        'payment-link',
        'create',
        '-t', 'T',
        '-a', '5',
        '-r', 'ref-img-cap-2',
        '--return-url', 'https://example.com/return',
        '--image', exact,
      ]);
      // No local rejection: the failure (if any) comes from the gateway call,
      // never from the size check.
      expect(text).not.toContain('3MB payment-link image limit');
    } finally {
      rmSync(exact, { force: true });
      vi.unstubAllEnvs();
    }
  });
});

describe('cof link-card-form (in-process runCli)', () => {
  // Same empty-APPDATA isolation as checkout-form: keep the persisted
  // profile store out of the picture so credentials are deterministic.
  const emptyAppData2 = mkdtempSync(path.join(tmpdir(), 'payway-empty-appdata-'));

  afterAll(() => {
    rmSync(emptyAppData2, { recursive: true, force: true });
  });

  it('requires credentials (the signed form embeds merchant_id + hash)', async () => {
    vi.stubEnv('APPDATA', emptyAppData2);
    const savedMid = process.env.PAYWAY_MERCHANT_ID;
    const savedKey = process.env.PAYWAY_API_KEY;
    delete process.env.PAYWAY_MERCHANT_ID;
    delete process.env.PAYWAY_API_KEY;
    try {
      const { text, exitCode } = await run(['cof', 'link-card-form', '-c', 'customerabc123', '-f', 'CITI_FLEX']);
      expect(text).toContain('Missing merchant credentials');
      expect(exitCode).toBe(1);
    } finally {
      if (savedMid !== undefined) process.env.PAYWAY_MERCHANT_ID = savedMid;
      if (savedKey !== undefined) process.env.PAYWAY_API_KEY = savedKey;
      vi.unstubAllEnvs();
    }
  });

  it('writes a signed link-card form to --out with stubbed credentials', async () => {
    vi.stubEnv('APPDATA', emptyAppData2);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    const outDir = mkdtempSync(path.join(tmpdir(), 'payway-link-card-form-'));
    const outPath = path.join(outDir, 'link-card.html');
    try {
      const { text, exitCode } = await run([
        'cof',
        'link-card-form',
        '-c', 'customerabc123',
        '-f', 'CITI_FLEX',
        '-r', 'link67890',
        '--out', outPath,
        '--no-open-page',
      ]);
      expect(exitCode).toBe(0);
      expect(text).toContain('written to');
      expect(text).toMatch(/Request ID:/);

      const html = readFileSync(outPath, 'utf8');
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('https://checkout-sandbox.payway.com.kh/api/payment-credential/v3/cof/link-card');
      expect(html).toContain('name="merchant_id" value="inprocess-mid"');
      expect(html).toContain('name="hash"');
      expect(html).toContain('name="request_id" value="link67890"');
      expect(html).toContain('name="ctid" value="customerabc123"');
      expect(html).toContain('name="token_flag" value="CITI_FLEX"');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it('emits clean HTML on stdout and diagnostics on stderr (redirect-safe)', async () => {
    vi.stubEnv('APPDATA', emptyAppData2);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    try {
      const { text, exitCode } = await run([
        'cof',
        'link-card-form',
        '-c', 'customerabc123',
        '-f', 'CITO_FLEX',
        '-r', 'stdoutreq01',
      ]);
      expect(exitCode).toBe(0);
      const html = stdoutChunks.join('');
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('name="request_id" value="stdoutreq01"');
      expect(html).not.toContain('Request ID:'); // diagnostics never ride stdout
      expect(text).toContain('Request ID:');
    } finally {
      stdoutSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('warns when no --callback-url is given (the pwt only arrives via callback)', async () => {
    vi.stubEnv('APPDATA', emptyAppData2);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    try {
      const { text, exitCode } = await run(['cof', 'link-card-form', '-c', 'customerabc123', '-f', 'CITI_FLEX']);
      expect(text).toContain('--callback-url');
      expect(exitCode).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('surfaces domain validation errors (bad ctid) as exit 1', async () => {
    vi.stubEnv('APPDATA', emptyAppData2);
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'inprocess-mid');
    vi.stubEnv('PAYWAY_API_KEY', 'inprocess-key');
    try {
      const { text, exitCode } = await run(['cof', 'link-card-form', '-c', 'CUST-005', '-f', 'CITI_FLEX']);
      expect(text).toContain('ctid');
      expect(exitCode).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
