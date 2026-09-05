import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function runScript(script: string, args: string[] = []): string {
  return execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('public distribution boundary', () => {
  it('accepts the exact npm pack manifest and embedded text', () => {
    expect(runScript('check-package-contents.mjs')).toContain('Package boundary passed');
  }, 30_000);

  it('rejects generated research copies and local-machine references', () => {
    expect(runScript('check-public-docs.mjs')).toContain('Public docs boundary passed');
  });
});
