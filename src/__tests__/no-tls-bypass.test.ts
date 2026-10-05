import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TLS_BYPASS_ALLOW_LIST,
  TLS_BYPASS_FORBIDDEN,
  findBypassOccurrences,
} from '../cli/tls-bypass-scan.js';

/**
 * DX-SEC-002 (audit P0-04): blocking gate — every TRACKED file (`git
 * ls-files`) carrying the forbidden bypass string must sit on an explicit
 * allow-list entry with a recorded reason. The scanner, allow-list and
 * discipline comments live in `src/cli/tls-bypass-scan.ts` (shared with the
 * future doctor checks, DX-SEC-003).
 */

const FORBIDDEN = TLS_BYPASS_FORBIDDEN;

describe('no TLS-verification bypass in tracked files (DX-SEC-002)', () => {
  it(
    'every tracked occurrence of the bypass string is allow-listed with a recorded reason',
    () => {
      // -z: NUL-separated and NEVER quoted — with the default
      // core.quotePath=true, git wraps non-ASCII paths (em dashes in
      // docs/test-cases/*) in literal quotes and octal escapes, which then
      // cannot be opened (CI linux runners; local checkouts set quotePath
      // false, which masked this).
      const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
        .split('\0')
        .filter(Boolean);
      const offenders = findBypassOccurrences(
        tracked.map((filePath) => ({ path: filePath, content: readFileSync(filePath, 'utf8') })),
      );
      expect(offenders).toEqual([]);
    },
    60_000,
  );

  it('negative control: a synthetic unlisted path containing the string FAILS the scan', () => {
    const synthetic = [
      { path: 'docs/some-new-guide.md', content: `Run: ${FORBIDDEN}=0 npx tsx src/cli.ts …` },
      { path: 'docs/internal/clean.md', content: 'no bypass text here' },
    ];
    expect(findBypassOccurrences(synthetic)).toEqual(['docs/some-new-guide.md']);
  });

  it('negative control: allow-list entries do not over-match similar paths', () => {
    const synthetic = [
      // NOT an exact match for 'src/client.ts':
      { path: 'src/client.ts.bak', content: FORBIDDEN },
      // Inside the repo root but under no allowed prefix:
      { path: 'src/generated/new-rule.ts', content: FORBIDDEN },
      // Exact allow-listed path passes:
      { path: 'src/client.ts', content: FORBIDDEN },
    ];
    expect(findBypassOccurrences(synthetic)).toEqual(['src/client.ts.bak', 'src/generated/new-rule.ts']);
  });

  it('allow-list entries all carry a reason and the scanner module is covered', () => {
    for (const entry of TLS_BYPASS_ALLOW_LIST) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
    expect(TLS_BYPASS_ALLOW_LIST.some((entry) => entry.pattern === 'src/cli/tls-bypass-scan.ts')).toBe(true);
  });
});
