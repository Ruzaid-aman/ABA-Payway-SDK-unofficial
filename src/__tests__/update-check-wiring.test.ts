/**
 * Child-process proof of the wiring contract: a real dist invocation in a
 * non-TTY environment must NEVER print the update notice (spec §4.2) and
 * must keep the historical bare-invocation behavior (commander help on
 * stderr, exit 1). Requires `npm run build` first (runDistCli spawns dist).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDistCli } from '../test/test-utils.js';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'payway-update-wiring-'));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('update-notice wiring (dist, non-TTY)', () => {
  it('bare invocation prints no update notice and keeps the legacy exit', async () => {
    const result = await runDistCli([], {
      cwd: tempDir,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: tempDir },
    });
    expect(result.stderr).not.toContain('Update available');
    expect(result.stdout).not.toContain('Update available');
    expect(result.status).toBe(1);
  }, 10_000);

  it('top-level --help prints no update notice in non-TTY', async () => {
    const result = await runDistCli(['--help'], {
      cwd: tempDir,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', APPDATA: tempDir },
    });
    expect(result.stderr).not.toContain('Update available');
  }, 10_000);
});
