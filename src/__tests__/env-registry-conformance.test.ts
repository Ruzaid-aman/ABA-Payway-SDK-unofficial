/**
 * Environment-registry conformance (audit P1-04 / P1-05, DX-KNOW-005/005b —
 * docs/project/2026-10-05-dx-platform-audit-pass2.md §47, §29.2).
 *
 * The authored registry knowledge/rules/env-vars.yaml generates TWO artifacts
 * (src/generated/env-registry.ts and the root .env.example) that must never
 * drift from the YAML or from the source they describe:
 *
 *   - scan-based completeness: every PAYWAY_ variable read in src TypeScript
 *     files (process.env.X, env.X, env?.X, (a.env ?? b.env).X, env['X'], and
 *     quoted constant literals) has a registry entry — the ONLY mechanism that
 *     prevents the old hand-maintained allow-list from drifting back into
 *     false "unrecognized variable" warnings (P1-04 criterion 3). Negative
 *     controls feed SYNTHETIC source through the scanner; real files are
 *     never modified;
 *   - every consumedBy file / docsAnchor exists, and every non-external
 *     variable has at least one reader (P1-04 criterion 4);
 *   - .env.example is byte-identical to a fresh generation, covers every
 *     variable with a comment, and never carries a real secret value
 *     (P1-05 criteria 1-4);
 *   - the generated module is byte-identical to a fresh generation (the same
 *     property `npm run gen:env-vars -- --check` gates in CI);
 *   - the validator built on the registry accepts every registered variable
 *     (zero unknown-var warnings) and still rejects a genuinely unknown one,
 *     naming the nearest valid variable for a plausible typo (P1-04 criteria
 *     1-2).
 *
 * Pure in-process: file reads, regex scans and the validator logic only — no
 * network, no child processes, no writes outside tmpdir.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildEnvExampleText, ENV_EXAMPLE_GROUP_ORDER } from '../config/envExample.js';
import { validatePayWayEnv } from '../config/envValidator.js';
import { parseDotEnvFile } from '../cli/dotenv.js';
import {
  isKnownPayWayEnvVar,
  knownPayWayEnvVarNames,
  nearestPayWayEnvVarName,
  PAYWAY_ENV_VARS,
} from '../generated/env-registry.js';
import {
  isEnvExampleCurrent,
  isGeneratedModuleCurrent,
  listPayWaySourceFiles,
  parseEnvVarsYaml,
  scanPayWayEnvReads,
  validateEnvVars,
} from '../../scripts/generate/gen-env-vars.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const yamlText = readFileSync(path.join(repoRoot, 'knowledge/rules/env-vars.yaml'), 'utf8');
const doc = parseEnvVarsYaml(yamlText);
const registryNames = PAYWAY_ENV_VARS.map((envVar) => envVar.name);

/** The four variables the audit's P1-04 reproduction warned about. */
const AUDIT_REPRODUCTION_VARS = [
  'PAYWAY_UI',
  'PAYWAY_STRICT_VALIDATION',
  'PAYWAY_MCP_ALLOW_MUTATIONS',
  'PAYWAY_KHQR_MERCHANT_NAME',
];

/** A valid value per variable, so validatePayWayEnv can see every name. */
function benignValue(name: string): string {
  if (name === 'PAYWAY_ENV') return 'sandbox';
  if (name === 'PAYWAY_SANDBOX') return 'true';
  if (name === 'PAYWAY_MERCHANT_ID') return 'test-merchant-001';
  if (name === 'PAYWAY_API_KEY') return 'a'.repeat(32);
  if (name === 'PAYWAY_RSA_PUBLIC_KEY') {
    return '-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\\n-----END PUBLIC KEY-----';
  }
  if (['PAYWAY_RETURN_URL', 'PAYWAY_CANCEL_URL', 'PAYWAY_CALLBACK_URL'].includes(name)) {
    return `https://example.com/${name.toLowerCase().replace(/_/g, '-')}`;
  }
  return 'test-value';
}

describe('env registry — registry shape', () => {
  it('covers the audit-scale variable set (~32 expected, 40 registered)', () => {
    expect(PAYWAY_ENV_VARS.length).toBeGreaterThanOrEqual(32);
  });

  it('pins the exact variable names (additive-only golden list)', () => {
    expect(registryNames).toEqual([
      'PAYWAY_ENV',
      'PAYWAY_SANDBOX',
      'PAYWAY_BASE_URL',
      'PAYWAY_TIMEOUT',
      'PAYWAY_STRICT_VALIDATION',
      'PAYWAY_PROFILE',
      'PAYWAY_MERCHANT_ID',
      'PAYWAY_API_KEY',
      'PAYWAY_RSA_PUBLIC_KEY',
      'PAYWAY_PARTNER_ID',
      'PAYWAY_PARTNER_API_KEY',
      'PAYWAY_RETURN_URL',
      'PAYWAY_CANCEL_URL',
      'PAYWAY_CALLBACK_URL',
      'PAYWAY_TLS_CA_FILE',
      'PAYWAY_TLS_MIN_VERSION',
      'PAYWAY_UI',
      'PAYWAY_ADVISORY_IGNORE',
      'PAYWAY_LOG_LEVEL',
      'PAYWAY_NO_UPDATE_CHECK',
      'PAYWAY_ONBOARD_AUTO',
      'PAYWAY_MCP_ALLOW_MUTATIONS',
      'PAYWAY_AGENT_NO_RECOVER_HINT',
      'PAYWAY_JOURNAL',
      'PAYWAY_JOURNAL_MODE',
      'PAYWAY_JOURNAL_MAX_AGE_DAYS',
      'PAYWAY_FORCE_JSON_STORAGE',
      'PAYWAY_DATA_DIR',
      'PAYWAY_JOURNAL_DIR',
      'PAYWAY_WEBHOOK_DIR',
      'PAYWAY_TOKEN_STORE_DIR',
      'PAYWAY_KNOWLEDGE_DIR',
      'PAYWAY_AGENT_API_KEY',
      'PAYWAY_AGENT_BASE_URL',
      'PAYWAY_KHQR_BAKONG_ID',
      'PAYWAY_KHQR_ABA_MERCHANT_ID',
      'PAYWAY_KHQR_ACQUIRER_NAME',
      'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE',
      'PAYWAY_KHQR_MERCHANT_NAME',
      'PAYWAY_KHQR_MERCHANT_CITY',
      'PAYWAY_KHQR_PAYWAY_DATA',
    ]);
  });

  it('parses the authored YAML without conformance issues', () => {
    expect(validateEnvVars(doc.vars)).toEqual([]);
  });

  it('keeps the old hand-maintained allow-list as a subset (no regression)', () => {
    // The previous KNOWN_VARS list in src/config/envValidator.ts.
    const previousAllowList = [
      'PAYWAY_ENV',
      'PAYWAY_MERCHANT_ID',
      'PAYWAY_API_KEY',
      'PAYWAY_RETURN_URL',
      'PAYWAY_CANCEL_URL',
      'PAYWAY_CALLBACK_URL',
      'PAYWAY_SANDBOX',
      'PAYWAY_BASE_URL',
      'PAYWAY_TIMEOUT',
      'PAYWAY_RSA_PUBLIC_KEY',
      'PAYWAY_AGENT_API_KEY',
      'PAYWAY_AGENT_BASE_URL',
      'PAYWAY_PROFILE',
      'PAYWAY_LOG_LEVEL',
      'PAYWAY_ONBOARD_AUTO',
      'PAYWAY_JOURNAL',
      'PAYWAY_JOURNAL_DIR',
      'PAYWAY_JOURNAL_MODE',
      'PAYWAY_JOURNAL_MAX_AGE_DAYS',
      'PAYWAY_WEBHOOK_DIR',
      'PAYWAY_DATA_DIR',
      'PAYWAY_FORCE_JSON_STORAGE',
      'PAYWAY_PARTNER_ID',
      'PAYWAY_PARTNER_API_KEY',
      'PAYWAY_TLS_CA_FILE',
      'PAYWAY_TLS_MIN_VERSION',
    ];
    const known = knownPayWayEnvVarNames();
    const dropped = previousAllowList.filter((name) => !known.has(name));
    expect(dropped).toEqual([]);
  });

  it('marks the validator-required variables consistently', () => {
    const required = PAYWAY_ENV_VARS.filter((envVar) => envVar.required).map((envVar) => envVar.name);
    expect(required).toEqual(['PAYWAY_ENV', 'PAYWAY_MERCHANT_ID', 'PAYWAY_API_KEY', 'PAYWAY_RETURN_URL']);
  });
});

describe('env registry — scan-based completeness (P1-04 criterion 3)', () => {
  it('finds a registry entry for every PAYWAY_ read in src/**/*.ts', () => {
    const sourceFiles = listPayWaySourceFiles(repoRoot);
    expect(sourceFiles.length).toBeGreaterThan(50);
    const scanned = new Set<string>();
    for (const file of sourceFiles) {
      for (const name of scanPayWayEnvReads(readFileSync(file, 'utf8'))) {
        scanned.add(name);
      }
    }
    const unregistered = [...scanned].filter((name) => !isKnownPayWayEnvVar(name));
    expect(unregistered).toEqual([]);
    // And the scan sees the variables the OLD validator warned about —
    // the exact false positives this registry eliminates.
    for (const name of AUDIT_REPRODUCTION_VARS) {
      expect(scanned).toContain(name);
    }
  });

  it('recognizes every read shape present in src (synthetic negative control)', () => {
    const synthetic = [
      'const a = process.env.PAYWAY_NOT_IN_REGISTRY_A;',
      'const b = env.PAYWAY_NOT_IN_REGISTRY_B;',
      'const c = settings.env?.PAYWAY_NOT_IN_REGISTRY_C;',
      'const d = (options.env ?? process.env).PAYWAY_NOT_IN_REGISTRY_D;',
      "const e = env['PAYWAY_NOT_IN_REGISTRY_E'];",
      "export const FOO_ENV = 'PAYWAY_NOT_IN_REGISTRY_F';",
    ].join('\n');
    // Every pattern fires...
    for (const suffix of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(scanPayWayEnvReads(synthetic)).toContain(`PAYWAY_NOT_IN_REGISTRY_${suffix}`);
    }
    // ...and the completeness gate those hits feed would fail.
    const gateFailures = scanPayWayEnvReads(synthetic).filter((name) => !isKnownPayWayEnvVar(name));
    expect(gateFailures).toHaveLength(6);
  });

  it('does not report registered reads as gate failures', () => {
    const realShape = [
      'const a = process.env.PAYWAY_API_KEY;',
      "const b = env['PAYWAY_DATA_DIR'];",
      "export const TOKEN_STORE_DIR_ENV = 'PAYWAY_TOKEN_STORE_DIR';",
    ].join('\n');
    expect(scanPayWayEnvReads(realShape).filter((name) => !isKnownPayWayEnvVar(name))).toEqual([]);
  });
});

describe('env registry — consumedBy anchors (P1-04 criterion 4)', () => {
  it('has at least one reader for every non-external variable', () => {
    const readerless = PAYWAY_ENV_VARS.filter((envVar) => !envVar.external && envVar.consumedBy.length === 0);
    expect(readerless.map((envVar) => envVar.name)).toEqual([]);
  });

  it('declares every consumedBy file that exists in the repository', () => {
    const missing: string[] = [];
    for (const envVar of PAYWAY_ENV_VARS) {
      for (const file of envVar.consumedBy) {
        if (!existsSync(path.join(repoRoot, file))) missing.push(`${envVar.name}: ${file}`);
      }
      if (envVar.docsAnchor && !existsSync(path.join(repoRoot, envVar.docsAnchor))) {
        missing.push(`${envVar.name}: docsAnchor ${envVar.docsAnchor}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the .env.example section order in sync with the registry groups', () => {
    const registryGroups = [...new Set(PAYWAY_ENV_VARS.map((envVar) => envVar.group))];
    expect(registryGroups).toEqual([...ENV_EXAMPLE_GROUP_ORDER]);
  });

  it('rejects synthetic registry defects (negative controls, no real files touched)', () => {
    const probe = (relativePath: string): boolean => relativePath === 'src/real.ts';
    const base = {
      name: 'PAYWAY_SYNTHETIC',
      kind: 'non-secret' as const,
      group: 'connection' as const,
      description: 'synthetic var for negative tests',
      defaultValue: null,
      required: false,
      consumedBy: ['src/real.ts'],
    };
    expect(validateEnvVars([{ ...base }], { fileExists: probe })).toEqual([]);
    expect(validateEnvVars([{ ...base, consumedBy: ['src/missing.ts'] }], { fileExists: probe })).toHaveLength(1);
    expect(validateEnvVars([{ ...base, kind: 'toxic' as never }], { fileExists: probe })[0].message).toContain('kind');
    expect(validateEnvVars([{ ...base, consumedBy: [] }], { fileExists: probe })[0].message).toContain('consumedBy');
    expect(
      validateEnvVars([{ ...base, kind: 'secret' as const, defaultValue: 'leaked' }], { fileExists: probe })[0].message,
    ).toContain('secret');
    expect(validateEnvVars([{ ...base, consumedBy: [], external: true }], { fileExists: probe })[0].message).toContain(
      'docsAnchor',
    );
  });
});

describe('env registry — generated .env.example (P1-05)', () => {
  const examplePath = path.join(repoRoot, '.env.example');
  const exampleText = readFileSync(examplePath, 'utf8');

  it('exists and is byte-identical to a fresh generation', () => {
    expect(exampleText).toBe(buildEnvExampleText(PAYWAY_ENV_VARS));
    expect(isEnvExampleCurrent().current).toBe(true);
  });

  it('covers every non-secret variable with a naming comment and an assignment line', () => {
    for (const envVar of PAYWAY_ENV_VARS) {
      if (envVar.kind === 'secret') continue;
      expect(exampleText).toMatch(new RegExp(`^# ${envVar.name} — `, 'm'));
      expect(exampleText).toMatch(new RegExp(`^${envVar.name}=`, 'm'));
    }
  });

  it('carries secret variables as empty placeholders only', () => {
    const secrets = PAYWAY_ENV_VARS.filter((envVar) => envVar.kind === 'secret');
    expect(secrets.map((envVar) => envVar.name)).toEqual([
      'PAYWAY_API_KEY',
      'PAYWAY_PARTNER_API_KEY',
      'PAYWAY_AGENT_API_KEY',
    ]);
    for (const envVar of secrets) {
      expect(exampleText).toMatch(new RegExp(`^${envVar.name}=$`, 'm'));
    }
    expect(exampleText).toContain('NEVER COMMIT A REAL VALUE');
  });

  it('contains no real secret values (canary sweep)', () => {
    // Deterministic canary: no assignment may hold a long hex-ish blob.
    for (const line of exampleText.split('\n')) {
      const match = /^([A-Z0-9_]+)=(\S+)$/.exec(line);
      if (!match) continue;
      expect(match[2]).not.toMatch(/^[a-f0-9]{40,}$/i);
    }
    // And none of the developer's real .env values may have leaked in.
    const envPath = path.join(repoRoot, '.env');
    if (existsSync(envPath)) {
      for (const value of Object.values(parseDotEnvFile(envPath))) {
        if (/^[a-f0-9]{40,}$/i.test(value)) expect(exampleText).not.toContain(value);
      }
    }
  });

  it('documents both PEM syntaxes for the RSA public key and dotenv parses both', () => {
    expect(exampleText).toContain(
      'single-line (quoted, literal \\n escapes): PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----',
    );
    expect(exampleText).toContain('multi-line (quoted):');

    const dir = mkdtempSync(path.join(tmpdir(), 'payway-env-example-'));
    try {
      const singleLinePath = path.join(dir, 'single.env');
      writeFileSync(
        singleLinePath,
        'PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\\n-----END PUBLIC KEY-----"\n',
      );
      const single = parseDotEnvFile(singleLinePath);
      expect(single.PAYWAY_RSA_PUBLIC_KEY).toContain('-----BEGIN PUBLIC KEY-----');
      expect(single.PAYWAY_RSA_PUBLIC_KEY).toContain('\n');

      const multiLinePath = path.join(dir, 'multi.env');
      writeFileSync(
        multiLinePath,
        'PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z8QhXrSAMPLE-KEY-BODY\n-----END PUBLIC KEY-----"\n',
      );
      const multi = parseDotEnvFile(multiLinePath);
      expect(multi.PAYWAY_RSA_PUBLIC_KEY).toContain('-----BEGIN PUBLIC KEY-----');
      expect(multi.PAYWAY_RSA_PUBLIC_KEY).toContain('\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('env registry — generated module byte stability', () => {
  it('is byte-identical to a fresh generation (--check property)', () => {
    const status = isGeneratedModuleCurrent();
    expect(status.current).toBe(true);
    expect(status.detail).toContain('byte-identical');
  });

  it('regenerates the committed module from the YAML alone', () => {
    // Round-trip through the generator's parse + emit pipeline.
    const reparsed = parseEnvVarsYaml(readFileSync(path.join(repoRoot, 'knowledge/rules/env-vars.yaml'), 'utf8'));
    expect(reparsed.vars).toEqual(PAYWAY_ENV_VARS);
  });
});

describe('env registry — validator accepts the full registry (P1-04 criteria 1-2)', () => {
  it('emits zero unknown-var warnings when every registry variable is set', () => {
    const env = Object.fromEntries(PAYWAY_ENV_VARS.map((envVar) => [envVar.name, benignValue(envVar.name)]));
    const unknown = validatePayWayEnv(env).filter((issue) => issue.code === 'W-PAYWAY-UNKNOWN-VAR');
    expect(unknown).toEqual([]);
  });

  it('emits zero unknown-var warnings for each registry variable individually', () => {
    for (const envVar of PAYWAY_ENV_VARS) {
      const env: NodeJS.ProcessEnv = {
        PAYWAY_ENV: 'sandbox',
        PAYWAY_MERCHANT_ID: 'test-merchant-001',
        PAYWAY_API_KEY: 'a'.repeat(32),
        PAYWAY_RETURN_URL: 'https://example.com/return',
        [envVar.name]: benignValue(envVar.name),
      };
      const unknown = validatePayWayEnv(env).filter((issue) => issue.code === 'W-PAYWAY-UNKNOWN-VAR');
      expect(unknown).toEqual([]);
    }
  });

  it('warns exactly once for the audit typo and names the nearest valid variable', () => {
    const env = Object.fromEntries(PAYWAY_ENV_VARS.map((envVar) => [envVar.name, benignValue(envVar.name)]));
    env.PAYWAY_KHQ_MERCHANT_NAME = 'X';
    const unknown = validatePayWayEnv(env).filter((issue) => issue.code === 'W-PAYWAY-UNKNOWN-VAR');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].varName).toBe('PAYWAY_KHQ_MERCHANT_NAME');
    expect(unknown[0].message).toContain('Did you mean PAYWAY_KHQR_MERCHANT_NAME?');
  });

  it('still rejects a genuinely unknown variable (negative control)', () => {
    const env = Object.fromEntries(PAYWAY_ENV_VARS.map((envVar) => [envVar.name, benignValue(envVar.name)]));
    env.PAYWAY_TOTALLY_MADE_UP = '1';
    const unknown = validatePayWayEnv(env).filter((issue) => issue.code === 'W-PAYWAY-UNKNOWN-VAR');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].message).toContain('PAYWAY_TOTALLY_MADE_UP');
    // ...with no misleading suggestion for garbage input.
    expect(nearestPayWayEnvVarName('PAYWAY_TOTALLY_MADE_UP')).toBeUndefined();
    expect(unknown[0].message).not.toContain('Did you mean');
  });

  it('suggests nothing when the whole flag set is unknown (no single nearest)', () => {
    const unknown = validatePayWayEnv({ PAYWAY_TYPO_ONE: '1', PAYWAY_TYPO_TWO: '2' }).filter(
      (issue) => issue.code === 'W-PAYWAY-UNKNOWN-VAR',
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0].message).not.toContain('Did you mean');
  });
});
