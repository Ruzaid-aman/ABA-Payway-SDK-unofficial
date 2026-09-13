/**
 * In-process coverage for `payway-sdk session` — non-TTY gate behavior only
 * (the loop itself is covered by session-loop.test.ts via the injected-streams
 * seam). Same harness rules as cli-inprocess.test.ts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-session-cmd-'));
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
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { stdout: captured.stdout(), stderr: captured.stderr(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('payway-sdk session (non-TTY)', () => {
  it('refuses with a hint on stderr and exit 2 in non-interactive runs', async () => {
    const { stdout, stderr, exitCode } = await run(['session']);
    expect(stdout).toBe('');
    expect(stderr).toContain('needs an interactive terminal');
    expect(exitCode).toBe(2);
  });
  // Registration is pinned by cli-help.test.ts (REGISTERED_COMMANDS +
  // COMMAND_GROUPS). --help is never exercised in-process (commander exits).
});
