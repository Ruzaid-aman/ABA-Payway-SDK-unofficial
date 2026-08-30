/**
 * Seam coverage for the `onboard` command via `runOnboardCommand(opts, deps)`.
 * The interactive path runs with a scripted {@link OnboardingIO} — no @clack,
 * no TTY; the non-interactive path asserts the exact JSON contracts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOnboardCommand } from '../cli/commands/onboard.js';
import type { OnboardingIO } from '../agent/onboarding/stages.js';

const temporaryDirectories: string[] = [];
let appData: string;
let priorAppData: string | undefined;
let priorExitCode: typeof process.exitCode;

beforeEach(() => {
  appData = mkdtempSync(path.join(tmpdir(), 'onboard-cmd-'));
  temporaryDirectories.push(appData);
  priorAppData = process.env.APPDATA;
  process.env.APPDATA = appData;
  priorExitCode = process.exitCode;
});

afterEach(() => {
  if (priorAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = priorAppData;
  process.exitCode = priorExitCode;
  vi.restoreAllMocks();
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function ioScript(overrides: Partial<OnboardingIO> = {}): OnboardingIO & { calls: string[] } {
  const calls: string[] = [];
  const record = <K extends keyof OnboardingIO>(name: K) => {
    return name;
  };
  void record;
  return {
    calls,
    async selectProvider() {
      calls.push('selectProvider');
      throw new Error('boom');
    },
    async inputModel() {
      calls.push('inputModel');
      return 'model-x';
    },
    async chooseKeyPlacement() {
      calls.push('chooseKeyPlacement');
      return 'session' as const;
    },
    async secret() {
      calls.push('secret');
      return 'key-x';
    },
    async input(_prompt: string, fallback = '') {
      calls.push('input');
      return fallback;
    },
    async confirm(_prompt: string, def = true) {
      calls.push(`confirm:${String(def)}`);
      return def;
    },
    async multiselectKhqr() {
      calls.push('multiselectKhqr');
      return false;
    },
    async writeEnvVar(key: string, value: string) {
      calls.push(`writeEnvVar:${key}`);
      process.env[key] = value;
    },
    async spinner<T>(_label: string, fn: () => Promise<T>): Promise<T> {
      calls.push('spinner');
      return fn();
    },
    note() {
      calls.push('note');
    },
    ...overrides,
  } as OnboardingIO & { calls: string[] };
}

describe('runOnboardCommand — non-interactive', () => {
  it('with --stage prints the stage plan JSON and does not change the exit code', async () => {
    const log = vi.fn();
    const setExitCode = vi.fn();
    await runOnboardCommand({ stage: 'privacy' }, { interactive: false, log, setExitCode });

    expect(log).toHaveBeenCalledTimes(1);
    const plan = JSON.parse(log.mock.calls[0][0] as string);
    expect(plan).toEqual({
      command: 'onboard',
      stage: 'privacy',
      allowed: ['provider', 'profile', 'callback', 'privacy', 'verify'],
    });
    expect(setExitCode).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(priorExitCode);
  });

  it('without --stage prints the blocked agent-command/v1 result and exits 1', async () => {
    const log = vi.fn();
    const setExitCode = vi.fn();
    await runOnboardCommand({}, { interactive: false, log, setExitCode });

    expect(log).toHaveBeenCalledTimes(1);
    const raw = log.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw) as { version: string; status: string; request: string; error: { code: string } };
    expect(parsed.version).toBe('agent-command/v1');
    expect(parsed.status).toBe('blocked');
    expect(parsed.request).toBe('onboard');
    expect(parsed.error.code).toBe('AGENT_NOT_CONFIGURED');
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});

describe('runOnboardCommand — interactive (scripted IO)', () => {
  it('rejects an unknown --stage with the allowed list and exit code 1', async () => {
    const cancel = vi.fn();
    const setExitCode = vi.fn();
    await runOnboardCommand(
      { stage: 'bogus' },
      { interactive: true, io: ioScript(), note: () => {}, banners: { cancel, intro: () => {}, outro: () => {} }, setExitCode },
    );
    expect(cancel).toHaveBeenCalledWith(expect.stringContaining('bogus'));
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it('runs the requested stage through the injected IO and reports stage notes', async () => {
    const io = ioScript();
    const notes: string[] = [];
    const note = vi.fn((message: string) => notes.push(message));
    await runOnboardCommand(
      { stage: 'privacy' },
      { interactive: true, io, note, banners: { intro: () => {}, outro: vi.fn(), cancel: vi.fn() } },
    );

    // privacy stage → confirm(true) → acknowledged.
    expect(io.calls).toContain('confirm:true');
    expect(notes.join('\n')).toContain('Privacy acknowledged');
    // Verify stage ran right after and re-scanned.
    expect(notes.join('\n')).toContain('Re-scanned onboarding state.');
  });

  it('declining the privacy stage reports the skip note and still finishes with the readiness panel', async () => {
    const io = ioScript({ async confirm() { return false; } });
    const notes: string[] = [];
    const outro = vi.fn();
    await runOnboardCommand(
      { stage: 'privacy' },
      { interactive: true, io, note: (m: string) => notes.push(m), banners: { intro: () => {}, outro, cancel: vi.fn() } },
    );

    expect(notes.join('\n')).toContain('Privacy not acknowledged');
    expect(outro).toHaveBeenCalledTimes(1);
    expect(outro.mock.calls[0][0]).toContain('Onboarding complete');
  });

  it('an IO failure surfaces the message through the cancel banner with exit code 1', async () => {
    const cancel = vi.fn();
    const setExitCode = vi.fn();
    await runOnboardCommand(
      { stage: 'provider' },
      {
        interactive: true,
        io: ioScript(), // selectProvider rejects with Error('boom')
        note: () => {},
        banners: { intro: () => {}, outro: () => {}, cancel },
        setExitCode,
      },
    );
    expect(cancel).toHaveBeenCalledWith('boom');
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
