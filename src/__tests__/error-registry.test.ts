/**
 * Error-code registry drift guard (competitive portal-parity wave, 2026-09-12).
 *
 * `docs/error-codes.json` is a GENERATED artifact (npm run gen:error-registry)
 * produced from the typed maps in `src/cli/explain-code.ts` + `src/constants.ts`
 * — the same source of truth that backs `payway-sdk explain`. These tests pin
 * the artifact to the code: any change to the maps without regenerating the
 * registry fails here, and the registry can never silently diverge from what
 * the CLI actually reports.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explainAll } from '../cli/explain-code.js';

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = join(here, '..', '..', 'docs', 'error-codes.json');

const sortedExpected = () =>
  [...explainAll()].sort(
    (a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

describe('error-code registry (docs/error-codes.json)', () => {
  it('stays in sync with explainAll()', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      registryVersion: number;
      source: string;
      codes: unknown[];
    };
    expect(registry.registryVersion).toBe(1);
    expect(registry.source).toBe('src/cli/explain-code.ts');
    expect(registry.codes).toEqual(sortedExpected());
  });

  it('marks live-verified codes with SANDBOX-FINDINGS evidence', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      codes: { code: string; family: string; title: string; hint: string; sandboxVerified?: boolean; evidence?: string }[];
    };
    const verified = registry.codes.filter((c) => c.sandboxVerified);
    expect(verified.length).toBeGreaterThanOrEqual(20);
    for (const entry of verified) {
      expect(entry.evidence).toMatch(/^SANDBOX-FINDINGS §/);
    }
  });
});
