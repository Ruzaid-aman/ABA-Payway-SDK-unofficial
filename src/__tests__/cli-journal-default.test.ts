/**
 * Integration pin for the storage-wave CLI journal default (task 5):
 *  - an API command journals into the PAYWAY_DATA_DIR data root WITHOUT any
 *    explicit --journal flag or PAYWAY_JOURNAL env (CLI-default-on);
 *  - `--no-journal` suppresses the file even though the CLI would journal;
 *  - an explicitly falsy PAYWAY_JOURNAL is respected.
 *
 * In-process runCli against a stubbed global fetch (no network), with the
 * app-data root isolated to a temp dir (mirrors cli-cof-token-store.test.ts
 * conventions).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureConsole, mockJsonResponse } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-journal-default-'));
const appData = path.join(tempDir, 'appdata-isolated');
const journalPath = path.join(appData, 'aba-payway-sdk', 'data', 'journal.jsonl');
const originalCwd = process.cwd();
const originals = {
  APPDATA: process.env.APPDATA,
  PAYWAY_API_KEY: process.env.PAYWAY_API_KEY,
  PAYWAY_MERCHANT_ID: process.env.PAYWAY_MERCHANT_ID,
  PAYWAY_JOURNAL: process.env.PAYWAY_JOURNAL,
};

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  process.env.APPDATA = appData;
  process.env.PAYWAY_API_KEY = 'test-key';
  process.env.PAYWAY_MERCHANT_ID = 'test-merchant';
  delete process.env.PAYWAY_JOURNAL;
  ({ runCli } = await import('../cli.js'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (existsSync(journalPath)) rmSync(journalPath);
});

afterAll(() => {
  process.chdir(originalCwd);
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore('APPDATA', originals.APPDATA);
  restore('PAYWAY_API_KEY', originals.PAYWAY_API_KEY);
  restore('PAYWAY_MERCHANT_ID', originals.PAYWAY_MERCHANT_ID);
  restore('PAYWAY_JOURNAL', originals.PAYWAY_JOURNAL);
  rmSync(tempDir, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<{ exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

function journalKinds(): string[] {
  return readFileSync(journalPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => (JSON.parse(line) as { kind: string }).kind);
}

describe('CLI journal default (storage wave 1)', () => {
  it('journals an API command into the data root with no flags or env', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0, tran_id: 'T1' } })));
    const { exitCode } = await run(['check-transaction', '-t', 'T1', '--json']);
    expect(exitCode).toBeUndefined();
    expect(existsSync(journalPath)).toBe(true);
    expect(journalKinds()).toContain('execution.response');
  });

  it('--no-journal leaves no journal file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0, tran_id: 'T2' } })));
    await run(['--no-journal', 'check-transaction', '-t', 'T2', '--json']);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('respects an explicitly falsy PAYWAY_JOURNAL', async () => {
    process.env.PAYWAY_JOURNAL = '0';
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0, tran_id: 'T3' } })));
      await run(['check-transaction', '-t', 'T3', '--json']);
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      delete process.env.PAYWAY_JOURNAL;
    }
  });
});
