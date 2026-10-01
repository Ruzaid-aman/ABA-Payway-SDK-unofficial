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
import { explainAll, explainPayWayCode } from '../cli/explain-code.js';

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

describe('purchase payment-credential endpoint error table (ABA, 2026-10-01)', () => {
  // Every code the endpoint table lists must resolve through the explain maps
  // (raw file: docs/internal/PAYMENT-CREDENTIAL-ERROR-TABLE-2026-10.md).
  const TABLE_CODES = [
    '00', '01', '04', '3', '6', '08', '11', '12', '22', '25', '26', '32', '35', '36',
    '37', '38', '39', '40', '41', '44', '46', '71', '77', '80', '83', '102', '105',
    'CDA45', '503',
  ];

  it('resolves every code from the endpoint table', () => {
    for (const code of TABLE_CODES) {
      expect(explainPayWayCode(code), `code ${code} must resolve`).toBeDefined();
    }
  });

  it('adds the 12 previously-unknown codes to the gateway family', () => {
    const newCodes = ['11', '25', '36', '38', '39', '40', '41', '46', '71', '77', '80', '83'];
    for (const code of newCodes) {
      const e = explainPayWayCode(code);
      expect(e?.family, `code ${code}`).toBe('gateway');
      expect(e?.hint, `code ${code}`).toContain('error table 2026-10');
    }
  });

  it('zero-padded 08 resolves to the same generic-8 explanation', () => {
    expect(explainPayWayCode('08')?.code).toBe('8');
  });

  it('supersedes the old 35/102 QR glosses with the endpoint-table meanings', () => {
    expect(explainPayWayCode('35')?.hint).toContain('Payout info invalid');
    expect(explainPayWayCode('102')?.hint).toContain('URL not in whitelist');
  });

  it('keeps the duplicated-tran_id cross-reference between 4 and 83', () => {
    expect(explainPayWayCode('83')?.hint).toContain('duplicate code is 83, not 4');
    expect(explainPayWayCode('4')?.hint).toContain('instead 83');
  });
});
