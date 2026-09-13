/**
 * In-process coverage for `payway-sdk completions <shell>`.
 * Same harness rules as cli-inprocess.test.ts: chdir to an empty temp dir
 * BEFORE importing ../cli.js; save/restore process.exitCode.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-completions-'));
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

async function run(argv: string[]): Promise<{ stdout: string; stderr: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  // The completions command writes the script via process.stdout.write
  // (not console.log), so spy the stream directly alongside the console.
  const stdoutChunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write);
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { stdout: stdoutChunks.join(''), stderr: captured.stderr(), exitCode: process.exitCode };
  } finally {
    stdoutSpy.mockRestore();
    originalWrite; // keep the bound original referenced for clarity
    captured.restore();
    process.exitCode = before;
  }
}

describe('payway-sdk completions', () => {
  it('emits a zsh script on stdout and the install hint on stderr', async () => {
    const { stdout, stderr, exitCode } = await run(['completions', 'zsh']);
    expect(stdout).toContain('#compdef payway-sdk');
    expect(stdout).toContain('transaction-list');
    expect(stderr).toContain('Install');
    expect(exitCode).not.toBe(1);
  });

  it('emits a powershell script on demand', async () => {
    const { stdout } = await run(['completions', 'powershell']);
    expect(stdout).toContain("Register-ArgumentCompleter -CommandName 'payway-sdk' -Native");
  });

  it('derives commands from the live registry (a module-registered command appears)', async () => {
    const { stdout } = await run(['completions', 'bash']);
    // `webhook` is registered by registerWebhookCommands, not inline in cli.ts.
    expect(stdout).toContain('webhook');
    // `journal` is registered by registerJournalCommands.
    expect(stdout).toContain('journal');
  });

  it('rejects unknown shells on stderr with exit 1 (no stdout)', async () => {
    const { stdout, stderr, exitCode } = await run(['completions', 'tcsh']);
    expect(stdout).toBe('');
    expect(stderr).toContain('tcsh');
    expect(stderr).toContain('bash, zsh, fish, powershell');
    expect(exitCode).toBe(1);
  });
});
