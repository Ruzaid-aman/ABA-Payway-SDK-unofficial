/**
 * In-process coverage for `payway-sdk mcp --list-tools`.
 * Same harness rules as cli-inprocess.test.ts (chdir before import,
 * exitCode save/restore). Stdio serving is covered by mcp-stdio-smoke.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-mcp-cli-'));
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

describe('payway-sdk mcp --list-tools', () => {
  it('emits the default read-only catalog as one JSON document', async () => {
    const { stdout, exitCode } = await run(['mcp', '--list-tools', '--json']);
    const parsed = JSON.parse(stdout) as Array<{ name: string; readOnly: boolean; source: string }>;
    expect(exitCode).not.toBe(1);
    expect(parsed).toHaveLength(12);
    expect(parsed.every((tool) => tool.readOnly === true)).toBe(true);
    expect(parsed.filter((tool) => tool.source === 'mcp-extra').map((tool) => tool.name)).toEqual([
      'list_transactions',
      'journal_stats',
      'journal_timeline',
    ]);
  });

  it('includes mutation tools under --allow-mutations, flagged not-readonly', async () => {
    const { stdout } = await run(['mcp', '--list-tools', '--json', '--allow-mutations']);
    const parsed = JSON.parse(stdout) as Array<{ name: string; readOnly: boolean }>;
    expect(parsed).toHaveLength(17);
    const create = parsed.find((tool) => tool.name === 'create_payment_link');
    expect(create?.readOnly).toBe(false);
  });

  it('human mode lists tool rows without JSON', async () => {
    const { stdout, stderr } = await run(['mcp', '--list-tools']);
    expect(stdout).toContain('check_transaction');
    expect(stdout).toContain('journal_timeline');
    expect(stdout).not.toContain('create_payment_link');
    expect(stderr).not.toContain('listening');
  });
});
