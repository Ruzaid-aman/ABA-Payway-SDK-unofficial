/**
 * Rules-registry conformance (audit DX-KNOW-007, WP-02 — acceptance items
 * 12-14 of docs/project/2026-10-05-dx-platform-audit-pass2.md §48.6).
 *
 * The authored registry knowledge/rules/rules.yaml is external truth with
 * provenance and a 180-day expiry; this test is the drift gate that keeps it
 * honest:
 *   - every rule parses with all required fields;
 *   - every source:official rule carries an evidence file whose URL host is
 *     developer.payway.com.kh and whose retrievedAt is <= 180 days old
 *     (computed against the real clock);
 *   - the negative cases (missing evidence file, non-official evidence host,
 *     181-day-old evidence) genuinely fail the validator — fed synthetic rule
 *     objects with injectable probes, never by mutating the real files;
 *   - every enforcement anchor (file + exported symbol) exists at runtime;
 *   - src/generated/rules.ts is byte-identical to a fresh generation
 *     (the same property `npm run gen:rules -- --check` gates in CI).
 *
 * Pure in-process: file reads and the validator logic only — no network, no
 * child processes.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explainCodeFamilies, explainPayWayCodeScoped } from '../cli/explain-code.js';
import { RULES, conflictedRules, getRuleById, officialRules } from '../generated/rules.js';
import {
  EVIDENCE_RETENTION_DAYS,
  GENERATED_MODULE_RELATIVE_PATH,
  OFFICIAL_EVIDENCE_HOST,
  RULES_YAML_RELATIVE_PATH,
  RULES_SCHEMA,
  addDaysUtc,
  generateModuleSource,
  isGeneratedModuleCurrent,
  parseIsoDateUtc,
  parseRulesYaml,
  validateRules,
  type RuleDefinition,
  type ValidateOptions,
} from '../../scripts/generate/gen-rules.js';
import * as constants from '../constants.js';
import * as explainCode from '../cli/explain-code.js';
import * as checkout from '../domains/checkout.js';
import * as qr from '../domains/qr.js';
import * as utils from '../utils.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const yamlText = readFileSync(path.join(repoRoot, RULES_YAML_RELATIVE_PATH), 'utf8');
const doc = parseRulesYaml(yamlText);

const EXPECTED_RULE_IDS = ['PUR-003', 'QR-012', 'QR-016', 'QR-009', 'ERR-001', 'QR-001'];

/** A valid synthetic rule the negative tests mutate one defect at a time. */
function syntheticRule(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    id: 'TST-001',
    statement: 'synthetic rule for validator negative tests',
    endpoints: ['qr.generateQr'],
    severity: 'hard',
    source: 'official',
    status: 'active',
    evidence: 'knowledge/rules/evidence/QR-009.md',
    evidenceUrl: `https://${OFFICIAL_EVIDENCE_HOST}/qr-api-14530840e0`,
    retrievedAt: '2026-10-05',
    expiresAt: '2027-04-03',
    enforcement: [{ file: 'src/utils.ts', symbol: 'validateAmountFloor' }],
    ...overrides,
  };
}

/** Probes that satisfy everything except the defect under test. */
const PERMISSIVE_PROBES: ValidateOptions = {
  evidenceFileExists: () => true,
  enforcementAnchorExists: () => true,
};

describe('rules registry conformance (DX-KNOW-007)', () => {
  it('parses the authored registry with all six slice rules and required fields', () => {
    expect(doc.schema).toBe(RULES_SCHEMA);
    expect(doc.rules.length).toBeGreaterThanOrEqual(6);
    expect(doc.rules.map((rule) => rule.id)).toEqual(EXPECTED_RULE_IDS);
    for (const rule of doc.rules) {
      for (const field of [
        'id',
        'statement',
        'endpoints',
        'severity',
        'source',
        'status',
        'evidence',
        'evidenceUrl',
        'retrievedAt',
        'expiresAt',
        'enforcement',
      ] as const) {
        const value = rule[field];
        expect(value !== undefined && value !== '', `${rule.id}.${field} is required`).toBe(true);
      }
      expect(rule.endpoints.length, `${rule.id} scopes at least one endpoint`).toBeGreaterThan(0);
      expect(rule.enforcement.length, `${rule.id} anchors at least one enforcement point`).toBeGreaterThan(0);
      expect(['advisory', 'hard']).toContain(rule.severity);
      expect(['official', 'sandbox']).toContain(rule.source);
      expect(['active', 'conflict']).toContain(rule.status);
    }
  });

  it('passes full conformance against the real files (evidence, expiry, anchors)', () => {
    const issues = validateRules(doc.rules);
    expect(issues).toEqual([]);
  });

  it('gives every rule an evidence/<id>.md file that exists and carries the citation', () => {
    for (const rule of doc.rules) {
      expect(rule.evidence).toBe(`knowledge/rules/evidence/${rule.id}.md`);
      const evidencePath = path.join(repoRoot, ...rule.evidence.split('/'));
      expect(existsSync(evidencePath), `${rule.evidence} must exist`).toBe(true);
      const evidence = readFileSync(evidencePath, 'utf8');
      expect(evidence, `${rule.evidence} must cite the rule's evidence URL`).toContain(rule.evidenceUrl);
      expect(evidence, `${rule.evidence} must record its retrieval date`).toContain(rule.retrievedAt);
    }
  });

  it('keeps every source:official rule on the official evidence host, within 180 days', () => {
    const officials = officialRules();
    expect(officials.map((rule) => rule.id)).toEqual(['PUR-003', 'QR-012', 'QR-016', 'QR-009', 'ERR-001']);
    for (const rule of officials) {
      const host = new URL(rule.evidenceUrl).host;
      expect(host, `${rule.id} evidence URL host`).toBe(OFFICIAL_EVIDENCE_HOST);
      const retrievedAt = parseIsoDateUtc(rule.retrievedAt);
      expect(retrievedAt, `${rule.id} retrievedAt parses as an ISO date`).toBeDefined();
      const ageDays = (Date.now() - (retrievedAt as Date).getTime()) / 86_400_000;
      expect(
        ageDays,
        `${rule.id} evidence must be at most ${EVIDENCE_RETENTION_DAYS} days old (re-verify the official page and refresh the evidence file)`,
      ).toBeLessThanOrEqual(EVIDENCE_RETENTION_DAYS);
    }
  });

  it('expires evidence exactly 180 days after retrieval (expiresAt derivation)', () => {
    for (const rule of doc.rules) {
      const retrievedAt = parseIsoDateUtc(rule.retrievedAt) as Date;
      const expectedExpiry = addDaysUtc(retrievedAt, EVIDENCE_RETENTION_DAYS).toISOString().slice(0, 10);
      expect(rule.expiresAt, `${rule.id} expiresAt = retrievedAt + ${EVIDENCE_RETENTION_DAYS} days`).toBe(
        expectedExpiry,
      );
    }
  });

  // ------------------------------------------------------------------
  // Negative tests: synthetic rules through the validator's real logic.
  // The real files are never mutated — probes and clocks are injected.
  // ------------------------------------------------------------------

  it('FAILS a rule whose evidence file is missing', () => {
    const issues = validateRules([syntheticRule({ evidence: 'knowledge/rules/evidence/NO-SUCH-EVIDENCE.md' })], {
      ...PERMISSIVE_PROBES,
      evidenceFileExists: () => false,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('TST-001');
    expect(issues[0].message).toContain('does not exist');
  });

  it('FAILS a rule whose evidence URL is not on the official host', () => {
    const issues = validateRules(
      [syntheticRule({ evidenceUrl: 'https://example-payway-mirror.example.com/purchase' })],
      PERMISSIVE_PROBES,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain(OFFICIAL_EVIDENCE_HOST);
  });

  it('FAILS a rule whose evidence is 181 days old (expiry mechanism)', () => {
    const retrievedAt = addDaysUtc(new Date(), -(EVIDENCE_RETENTION_DAYS + 1));
    const rule = syntheticRule({
      retrievedAt: retrievedAt.toISOString().slice(0, 10),
      expiresAt: addDaysUtc(retrievedAt, EVIDENCE_RETENTION_DAYS).toISOString().slice(0, 10),
    });
    const issues = validateRules([rule], PERMISSIVE_PROBES); // real clock
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain(`more than ${EVIDENCE_RETENTION_DAYS} days old`);
  });

  it('FAILS an expiresAt that is not retrievedAt + 180 days, and duplicate ids', () => {
    const drifted = validateRules([syntheticRule({ expiresAt: '2027-04-01' })], PERMISSIVE_PROBES);
    expect(drifted.map((issue) => issue.message).some((message) => message.includes('must equal retrievedAt'))).toBe(
      true,
    );

    const duplicated = validateRules([syntheticRule(), syntheticRule()], PERMISSIVE_PROBES);
    expect(duplicated.map((issue) => issue.message).some((message) => message.includes('duplicate rule id'))).toBe(
      true,
    );
  });

  it('passes a fully valid synthetic rule, so the negatives fail on their defect alone', () => {
    expect(validateRules([syntheticRule()], PERMISSIVE_PROBES)).toEqual([]);
  });

  // ------------------------------------------------------------------
  // Enforcement presence: every anchor's file is imported and really
  // exports the symbol the rule claims enforces it.
  // ------------------------------------------------------------------

  it('finds every enforcement anchor as a live runtime export', () => {
    const modulesByFile: Record<string, Record<string, unknown>> = {
      'src/constants.ts': constants as unknown as Record<string, unknown>,
      'src/domains/checkout.ts': checkout as unknown as Record<string, unknown>,
      'src/domains/qr.ts': qr as unknown as Record<string, unknown>,
      'src/utils.ts': utils as unknown as Record<string, unknown>,
      'src/cli/explain-code.ts': explainCode as unknown as Record<string, unknown>,
    };
    for (const rule of doc.rules) {
      for (const anchor of rule.enforcement) {
        const mod = modulesByFile[anchor.file];
        expect(mod, `${anchor.file} must be importable for rule ${rule.id}`).toBeDefined();
        expect(mod[anchor.symbol], `${rule.id}: ${anchor.file} must export "${anchor.symbol}"`).toBeDefined();
      }
    }
  });

  it('resolves the ERR-001 collision by operation (endpoint-scoped diagnostics)', () => {
    const scoped = explainPayWayCodeScoped('16');
    expect(scoped?.ambiguous).toBe(true);
    expect(scoped?.alternatives?.map((alternative) => alternative.title).sort()).toEqual([
      'Invalid Amount',
      'Invalid First Name',
    ]);
    expect(explainCodeFamilies('16').sort()).toEqual(['gateway', 'qr']);
  });

  // ------------------------------------------------------------------
  // Generated-module stability (the CI `gen:rules -- --check` property).
  // ------------------------------------------------------------------

  it('has a generated module byte-identical to a fresh generation', () => {
    const { current, detail } = isGeneratedModuleCurrent();
    expect(current, detail).toBe(true);
  });

  it('generated module mirrors the authored registry', () => {
    expect(RULES.map((rule) => rule.id)).toEqual(doc.rules.map((rule) => rule.id));
    expect(getRuleById('QR-009')?.statement).toContain('100 KHR');
    expect(officialRules()).toHaveLength(5);
    expect(conflictedRules().map((rule) => rule.id)).toEqual(['QR-001']);
    const conflicted = conflictedRules()[0];
    expect(conflicted.conflicts?.map((variant) => variant.source)).toEqual(['official', 'sandbox', 'repository']);
    // Determinism: generating twice yields the same bytes (same input, same output).
    expect(generateModuleSource(doc)).toBe(
      readFileSync(path.join(repoRoot, ...GENERATED_MODULE_RELATIVE_PATH.split('/')), 'utf8'),
    );
  });
});
