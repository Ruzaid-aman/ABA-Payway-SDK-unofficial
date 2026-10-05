/**
 * Error-code registry drift guard (competitive portal-parity wave, 2026-09-12;
 * official-harvest wave 2026-10-05, audit N-01/DX-ERR-004 + DX-ERR-001).
 *
 * `docs/error-codes.json` is a GENERATED artifact (npm run gen:error-registry)
 * produced from the typed maps in `src/error-registry.ts` + `src/constants.ts`
 * — the same source of truth that backs `payway-sdk explain` and the public
 * SDK `explain()` API. These tests pin
 * the artifact to the code: any change to the maps without regenerating the
 * registry fails here, and the registry can never silently diverge from what
 * the CLI actually reports.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explainAll, explainPayWayCode, explainPayWayCodeScoped } from '../error-registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = join(here, '..', '..', 'docs', 'error-codes.json');
const registryModulePath = join(here, '..', 'error-registry.ts');
const barrelPath = join(here, '..', 'index.ts');

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
    expect(registry.source).toBe('src/error-registry.ts');
    expect(registry.codes).toEqual(sortedExpected());
  });

  it('marks live-verified codes with SANDBOX-FINDINGS evidence', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      codes: {
        code: string;
        family: string;
        title: string;
        hint: string;
        sandboxVerified?: boolean;
        evidence?: string;
      }[];
    };
    const verified = registry.codes.filter((c) => c.sandboxVerified);
    expect(verified.length).toBeGreaterThanOrEqual(20);
    for (const entry of verified) {
      expect(entry.evidence).toMatch(/^SANDBOX-FINDINGS §/);
    }
  });
});

describe('official generate-qr table harvest (N-01 / DX-ERR-004, 2026-10-05)', () => {
  // The OFFICIAL generate-qr response `status.code` table, quoted verbatim
  // from developer.payway.com.kh/qr-api-14530840e0 (retrieved 2026-10-05,
  // live re-fetched the same day — knowledge/rules/evidence/ERR-001.md Quote 1).
  const OFFICIAL_QR_TITLES: Record<string, string> = {
    '1': 'Wrong Hash',
    '6': 'Requested Domain is not in whitelist',
    '12': 'Payment currency is not allowed',
    '16': 'Invalid First Name',
    '17': 'Invalid Last Name',
    '18': 'Invalid Phone Number',
    '19': 'Invalid Email',
    '21': 'End of API lifetime',
    '23': 'Selected Payment Option is not enabled for this Merchant Profile',
    '32': 'Service is not enabled', // official literal "Service is not enable" quoted in the hint
    '35': 'Payout Info is invalid',
    '44': 'Purchase amount has reached transaction limit',
    '47': 'KHR Amount must be greater than 100 KHR',
    '48': 'Something went wrong with requested parameters',
    '96': 'Invalid merchant data',
    '102': 'The URL is not in the whitelist',
    '403': 'Duplicated Transaction ID',
    '429': 'Maximum attempt limit',
  };

  it('resolves every official table code in the qr family with the OFFICIAL title', () => {
    for (const [code, officialTitle] of Object.entries(OFFICIAL_QR_TITLES)) {
      // Scoped to the qr family: bare lookups for 1/12 are claimed by the
      // cof/payout families first (pre-existing precedence, unchanged) — the
      // official generate-qr meaning lives on the qr-family entry.
      const e = explainPayWayCodeScoped(code, { family: 'qr' });
      expect(e, `code ${code} must resolve in the qr family`).toBeDefined();
      expect(e?.family, `family for ${code}`).toBe('qr');
      expect(e?.title, `title for ${code}`).toBe(officialTitle);
    }
  });

  it('carries the two remaining official codes (0, 8) in the gateway family', () => {
    // Official codes 0 ("Success") and 8 ("Something went wrong") stay in the
    // gateway family — bare lookups for them are pinned there, and the
    // QR-family size stays 18 (error-parity-b5). Their official meanings are
    // already carried by the gateway entries.
    expect(explainPayWayCode('0')?.family).toBe('gateway');
    expect(explainPayWayCode('0')?.title).toBe('Success');
    expect(explainPayWayCode('8')?.family).toBe('gateway');
  });

  it('never claims an official meaning is unpublished', () => {
    const PLACEHOLDER = 'not individually published';
    for (const e of explainAll()) {
      expect(e.hint, `hint for ${e.family}:${e.code}`).not.toContain(PLACEHOLDER);
      if (e.family === 'qr') {
        expect(e.hint, `qr ${e.code} must not use the registry-gap fallback`).not.toContain('Registry gap');
        expect(e.title, `qr ${e.code} must not use the generic fallback title`).not.toBe(
          `QR gateway error code ${e.code}`,
        );
      }
    }
  });

  it('titles qr:403 "Duplicated Transaction ID" and records the N-03 conflict without changing policy', () => {
    const e = explainPayWayCode('403');
    expect(e?.family).toBe('qr');
    expect(e?.title).toBe('Duplicated Transaction ID');
    // The hint records all three duplicate-tran_id sources (official /
    // telemetry / sandbox) and states the mutation-retry policy is unchanged.
    expect(e?.hint).toContain('Duplicated Transaction ID');
    expect(e?.hint).toContain('N-03');
    expect(e?.hint).toContain('UNCHANGED');
    // The N-03 conflict comment lives on the 403 entry in the source map.
    const source = readFileSync(registryModulePath, 'utf8');
    expect(source).toMatch(/N-03 CONFLICT/);
    // The old wrong title is gone from the registry data.
    expect(explainAll().some((x) => x.family === 'qr' && x.title === 'Forbidden')).toBe(false);
  });

  it('gives the four formerly-"not published" codes their official meanings', () => {
    expect(explainPayWayCode('18')?.hint).toContain('Invalid Phone Number');
    expect(explainPayWayCode('23')?.hint).toContain('not enabled on this merchant profile');
    expect(explainPayWayCode('47')?.hint).toContain('100 KHR');
    expect(explainPayWayCode('48')?.hint).toContain('requested parameters');
  });
});

describe('error-registry module hygiene (DX-ERR-001)', () => {
  it('the registry module has ZERO CLI dependencies (static source check)', () => {
    const source = readFileSync(registryModulePath, 'utf8');
    // No commander (CLI framework), no child-process spawning, no imports
    // from the CLI layer at all — SDK consumers must be able to import the
    // registry without pulling the CLI dependency graph.
    expect(source).not.toMatch(/from\s+'[^']*commander/);
    expect(source).not.toMatch(/node:child_process/);
    expect(source).not.toMatch(/from\s+'[^']*\/cli\//);
    // Every import specifier must be relative (the only allowed dependency is
    // the pure-data constants module — which itself has zero imports).
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const spec of specifiers) {
      expect(spec.startsWith('.'), `import '${spec}' must be relative (CLI-free registry)`).toBe(true);
    }
  });

  it('the package barrel exports the explain API from the CLI-free module', async () => {
    // Runtime proof of the DX-ERR-001 contract:
    // import { explainPayWayCode } from 'aba-payway-ts'
    const barrel = (await import('../index.js')) as Record<string, unknown>;
    expect(typeof barrel.explainPayWayCode).toBe('function');
    expect(typeof barrel.explainPayWayCodeScoped).toBe('function');
    expect(typeof barrel.explain).toBe('function');
    expect(typeof barrel.explainAll).toBe('function');
    // and the barrel wires them to the CLI-free module, not the CLI shim.
    const barrelSource = readFileSync(barrelPath, 'utf8');
    expect(barrelSource).toMatch(/from '\.\/error-registry\.js'/);
  });
});

describe('purchase payment-credential endpoint error table (ABA, 2026-10-01)', () => {
  // Every code the endpoint table lists must resolve through the explain maps
  // (raw file: docs/internal/PAYMENT-CREDENTIAL-ERROR-TABLE-2026-10.md).
  const TABLE_CODES = [
    '00',
    '01',
    '04',
    '3',
    '6',
    '08',
    '11',
    '12',
    '22',
    '25',
    '26',
    '32',
    '35',
    '36',
    '37',
    '38',
    '39',
    '40',
    '41',
    '44',
    '46',
    '71',
    '77',
    '80',
    '83',
    '102',
    '105',
    'CDA45',
    '503',
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
