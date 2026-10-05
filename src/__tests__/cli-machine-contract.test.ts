/**
 * Machine-output failure contract (audit S05): EVERY pre-execution failure —
 * missing/invalid options, unknown commands, profile-hook problems — must
 * emit exactly one parseable `{ error: { kind, exitCode, … } }` envelope on
 * stdout when machine output is active (`--json` / `--output json|ndjson`),
 * with a documented exit code; stderr carries diagnostics only. Human mode
 * keeps its existing channels, and help/version success is preserved.
 *
 * Same harness rules as mcp-cli.test.ts: chdir before import, exitCode
 * save/restore, isolated APPDATA so no real profile store leaks in.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-machine-contract-'));
const originalCwd = process.cwd();
const originalAppData = process.env.APPDATA;

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  // Isolated profile store: no default profile may exist, or the pre-action
  // hook would activate (and, in human mode, announce) the developer's real
  // profile instead of exercising the error paths under test.
  process.env.APPDATA = tempDir;
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Commander writes its usage/help text straight to process.stdout/.stderr
 * (bypassing console.*), so also capture the raw streams for the cases that
 * assert on help/usage output.
 */
function withRawStreams<T>(fn: () => Promise<T>): Promise<{ out: string; err: string; result: T }> {
  const chunks = { out: '', err: '' };
  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    chunks.out += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    chunks.err += String(chunk);
    return true;
  }) as typeof process.stderr.write);
  return fn().then(
    (result) => {
      outSpy.mockRestore();
      errSpy.mockRestore();
      return { out: chunks.out, err: chunks.err, result };
    },
    (error) => {
      outSpy.mockRestore();
      errSpy.mockRestore();
      throw error;
    },
  );
}

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

interface ErrorEnvelope {
  error: { kind: string; exitCode: number; message: string; [key: string]: unknown };
}

function expectOneEnvelope(stdout: string): ErrorEnvelope {
  // Exactly one JSON document: parse the whole stdout, not a line subset.
  let parsed: unknown;
  expect(() => {
    parsed = JSON.parse(stdout);
  }).not.toThrow();
  const envelope = parsed as ErrorEnvelope;
  expect(envelope.error).toBeDefined();
  expect(typeof envelope.error.kind).toBe('string');
  expect(typeof envelope.error.exitCode).toBe('number');
  expect(typeof envelope.error.message).toBe('string');
  return envelope;
}

describe('machine-output failure contract (S05)', () => {
  it('emits the validation envelope when a required option is missing (check-transaction --json)', async () => {
    const { stdout, stderr, exitCode } = await run(['check-transaction', '--json']);
    const envelope = expectOneEnvelope(stdout);
    expect(envelope.error.kind).toBe('validation');
    expect(envelope.error.exitCode).toBe(1);
    expect(exitCode).toBe(1);
    // stderr = diagnostics only; the usage text Commander already printed.
    expect(stderr).not.toContain('"error"');
  });

  it('emits the validation envelope when a required option is missing (payment-link detail --json)', async () => {
    const { stdout, exitCode } = await run(['payment-link', 'detail', '--json']);
    expectOneEnvelope(stdout);
    expect(exitCode).toBe(1);
  });

  it('emits the validation envelope for an unknown command under machine output', async () => {
    const { stdout, exitCode } = await run(['definitely-not-a-command', '--json']);
    expectOneEnvelope(stdout);
    expect(exitCode).toBe(1);
  });

  it('emits the envelope for an unknown option under machine output', async () => {
    const { stdout, exitCode } = await run(['doctor', '--json', '--not-a-real-flag']);
    expectOneEnvelope(stdout);
    expect(exitCode).toBe(1);
  });

  it('emits the envelope for a nonexistent selected profile instead of a stack (S05)', async () => {
    const { stdout, stderr, exitCode } = await run([
      'check-transaction',
      '-t',
      'tx-1',
      '--json',
      '--profile',
      'no-such-profile',
    ]);
    const envelope = expectOneEnvelope(stdout);
    expect(String(envelope.error.message)).toContain('no-such-profile');
    expect(stderr).not.toMatch(/at\s+/); // no stack trace channel for machine consumers
    expect(exitCode).toBe(1);
  });

  it('detects machine output via --output json (global flag spelling)', async () => {
    const { stdout, exitCode } = await run(['check-transaction', '--output', 'json']);
    expectOneEnvelope(stdout);
    expect(exitCode).toBe(1);
  });

  it('detects machine output via --output=json (equals spelling)', async () => {
    const { stdout } = await run(['check-transaction', '--output=json']);
    expectOneEnvelope(stdout);
  });

  it('human mode keeps the legacy channel: empty stdout, human stderr, exit 1', async () => {
    const { out, err, result } = await withRawStreams(() => run(['check-transaction']));
    expect(out).toBe('');
    expect(`${err}\n${result.stderr}`).toContain('required');
    expect(result.exitCode).toBe(1);
  });

  it('preserves help success even with machine flags present', async () => {
    const { out, result } = await withRawStreams(() => run(['--help']));
    expect(result.exitCode).not.toBe(1);
    expect(`${out}\n${result.stdout}`).toContain('Usage');
    expect(`${out}\n${result.stdout}`).not.toContain('"error"');
  });

  it('still honors the refund machine contract through the generalized path', async () => {
    const { stdout } = await run(['refund', '--json']);
    const envelope = expectOneEnvelope(stdout);
    expect(envelope.error.exitCode).toBe(1);
  });
});
