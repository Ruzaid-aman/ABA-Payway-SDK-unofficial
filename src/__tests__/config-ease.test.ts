/**
 * Config-ease wave (2026-09-12): machine-readable configuration surfaces —
 * `doctor --json`, `status --json`, and `agent config` — so agents and CI can
 * branch on structured state instead of scraping ANSI text.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';

let runCli: (argv: string[]) => Promise<void>;
let tempDir: string;
let originalAppData: string | undefined;

beforeAll(async () => {
  ({ runCli } = await import('../cli.js'));
  tempDir = mkdtempSync(path.join(tmpdir(), 'payway-config-ease-'));
  originalAppData = process.env.APPDATA;
  process.env.APPDATA = tempDir;
});

afterAll(() => {
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
  rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

async function run(argv: string[]): Promise<{ stdout: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { stdout: captured.stdout(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('doctor --json', () => {
  it('emits one JSON document with the check matrix (no --live, hermetic)', async () => {
    const { stdout, exitCode } = await run(['doctor', '--json']);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      route: string;
      checks: Array<{ id: string; label: string; ok: boolean; detail: string; fix?: string }>;
      envIssues: unknown[];
    };
    expect(typeof parsed.ok).toBe('boolean');
    expect(parsed.route).toBe('online-qr');
    expect(parsed.checks.length).toBeGreaterThan(2);
    expect(Array.isArray(parsed.envIssues)).toBe(true);
    // Every check carries the fields an agent needs to act.
    for (const check of parsed.checks) {
      expect(typeof check.id).toBe('string');
      expect(typeof check.ok).toBe('boolean');
    }
    expect([0, 1]).toContain(exitCode as number);
  });

  it('keeps the human banner out of the JSON path', async () => {
    const { stdout } = await run(['doctor', '--json']);
    expect(stdout).not.toContain('ABA PayWay SDK Doctor');
    expect(stdout.trimStart().startsWith('{')).toBe(true);
  });
});

describe('status --json', () => {
  it('emits both code tables as JSON', async () => {
    const { stdout } = await run(['status', '--json']);
    const parsed = JSON.parse(stdout) as {
      paymentStatusCodes: Record<string, string>;
      refundErrorCodes: Record<string, string>;
    };
    expect(Object.keys(parsed.paymentStatusCodes).length).toBeGreaterThan(3);
    expect(Object.keys(parsed.refundErrorCodes).length).toBeGreaterThan(3);
  });
});

describe('agent config show', () => {
  it('exits 1 with onboarding guidance when unconfigured', async () => {
    const { stdout, exitCode } = await run(['agent', 'config']);
    expect(stdout).toContain('No agent configuration found');
    expect(stdout).toContain('payway-sdk onboard');
    expect(exitCode).toBe(1);
  });

  it('prints the stored configuration under --json (secrets never stored)', async () => {
    const { updateAgentConfig } = await import('../agent/config.js');
    updateAgentConfig({
      provider: 'openai',
      model: 'gpt-4o',
      capabilityMode: 'strict-json-plan',
      privacyAcknowledgedAt: new Date().toISOString(),
    });
    const { stdout } = await run(['agent', 'config', '--json']);
    const parsed = JSON.parse(stdout) as { provider: string; model: string; capabilityMode: string };
    expect(parsed.provider).toBe('openai');
    expect(parsed.capabilityMode).toBe('strict-json-plan');
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain('apikey');
  });
});
