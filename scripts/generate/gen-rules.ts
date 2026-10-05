/**
 * Generate the typed rules module (src/generated/rules.ts) from the AUTHORED
 * registry knowledge/rules/rules.yaml (audit WP-02, DX-KNOW-001 subset —
 * docs/project/2026-10-05-dx-platform-audit-pass2.md §29.2: rules.yaml is
 * authored because its truth is external to this repository; the TS module is
 * generated because its consumers are TypeScript).
 *
 * The generator is deterministic: the same rules.yaml always produces the
 * same bytes, so `--check` can gate drift in CI:
 *
 *     npm run gen:rules              # regenerate src/generated/rules.ts
 *     npm run gen:rules -- --check   # exit 0 iff the committed module is
 *                                    # byte-identical to a fresh generation
 *
 * The same module exports the validator used by
 * src/__tests__/rules-conformance.test.ts so the negative tests can feed
 * synthetic rule objects through the exact logic that gates the real files.
 *
 * Direction of truth (one way only): rules.yaml -> src/generated/rules.ts.
 * Never edit the generated module by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const RULES_SCHEMA = 'payway-rules/v1';
export const OFFICIAL_EVIDENCE_HOST = 'developer.payway.com.kh';
export const EVIDENCE_RETENTION_DAYS = 180;
export const RULES_YAML_RELATIVE_PATH = 'knowledge/rules/rules.yaml';
export const GENERATED_MODULE_RELATIVE_PATH = 'src/generated/rules.ts';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RULES_YAML_PATH = fileURLToPath(new URL(`../../${RULES_YAML_RELATIVE_PATH}`, import.meta.url));
const GENERATED_MODULE_PATH = fileURLToPath(new URL(`../../${GENERATED_MODULE_RELATIVE_PATH}`, import.meta.url));

export type RuleSeverity = 'advisory' | 'hard';
export type RuleSource = 'official' | 'sandbox';
export type RuleStatus = 'active' | 'conflict';

export interface RuleEnforcementAnchor {
  file: string;
  symbol: string;
}

export interface RuleConflictVariant {
  source: string;
  statement: string;
  evidence: string;
}

export interface RuleDefinition {
  id: string;
  statement: string;
  endpoints: string[];
  severity: RuleSeverity;
  source: RuleSource;
  status: RuleStatus;
  evidence: string;
  evidenceUrl: string;
  retrievedAt: string;
  expiresAt: string;
  enforcement: RuleEnforcementAnchor[];
  conflicts?: RuleConflictVariant[];
  resolution?: string;
}

export interface RulesDocument {
  schema: string;
  owner: string;
  rules: RuleDefinition[];
}

export interface ValidationIssue {
  ruleId: string;
  message: string;
}

export interface ValidateOptions {
  /** Override the evidence-file existence probe (negative tests inject a fake). */
  evidenceFileExists?: (evidencePath: string) => boolean;
  /** Override the enforcement-anchor probe (negative tests inject a fake). */
  enforcementAnchorExists?: (file: string, symbol: string) => boolean;
  /** Override the clock used for the 180-day expiry (negative tests time-travel). */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parse the authored YAML into a typed document, throwing on shape drift. */
export function parseRulesYaml(yamlText: string): RulesDocument {
  const raw: unknown = parse(yamlText);
  if (typeof raw !== 'object' || raw === null) throw new Error('rules.yaml: top level must be a mapping');
  const doc = raw as Record<string, unknown>;
  if (doc.schema !== RULES_SCHEMA) {
    throw new Error(`rules.yaml: expected schema "${RULES_SCHEMA}", received "${String(doc.schema)}"`);
  }
  if (typeof doc.owner !== 'string' || !Array.isArray(doc.rules)) {
    throw new Error('rules.yaml: "owner" (string) and "rules" (array) are required');
  }
  const rules = doc.rules.map(parseRule);
  return { schema: RULES_SCHEMA, owner: doc.owner, rules };
}

function parseRule(raw: unknown): RuleDefinition {
  if (typeof raw !== 'object' || raw === null) throw new Error('rules.yaml: each rule must be a mapping');
  const r = raw as Record<string, unknown>;
  const str = (key: string): string => {
    const value = r[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`rules.yaml: rule "${String(r.id ?? '?')}" is missing required string field "${key}"`);
    }
    return value;
  };
  const endpoints = r.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0 || !endpoints.every((e) => typeof e === 'string' && e.trim() !== '')) {
    throw new Error(`rules.yaml: rule "${String(r.id ?? '?')}" needs a non-empty "endpoints" string array`);
  }
  const enforcementRaw = r.enforcement;
  if (!Array.isArray(enforcementRaw) || enforcementRaw.length === 0) {
    throw new Error(`rules.yaml: rule "${String(r.id ?? '?')}" needs a non-empty "enforcement" array`);
  }
  const enforcement = enforcementRaw.map((anchor) => {
    if (typeof anchor !== 'object' || anchor === null) {
      throw new Error(`rules.yaml: rule "${String(r.id ?? '?')}" has a non-mapping enforcement anchor`);
    }
    const a = anchor as Record<string, unknown>;
    if (typeof a.file !== 'string' || typeof a.symbol !== 'string' || a.file.trim() === '' || a.symbol.trim() === '') {
      throw new Error(`rules.yaml: rule "${String(r.id ?? '?')}" has an enforcement anchor without "file" and "symbol"`);
    }
    return { file: a.file, symbol: a.symbol };
  });
  const conflicts = r.conflicts;
  if (conflicts !== undefined && !Array.isArray(conflicts)) {
    throw new Error(`rules.yaml: rule "${String(r.id)}": "conflicts" must be an array`);
  }
  const rule: RuleDefinition = {
    id: str('id'),
    statement: str('statement'),
    endpoints: endpoints as string[],
    severity: str('severity') as RuleSeverity,
    source: str('source') as RuleSource,
    status: str('status') as RuleStatus,
    evidence: str('evidence'),
    evidenceUrl: str('evidenceUrl'),
    retrievedAt: str('retrievedAt'),
    expiresAt: str('expiresAt'),
    enforcement,
  };
  if (Array.isArray(conflicts) && conflicts.length > 0) {
    rule.conflicts = (conflicts as unknown[]).map((variant) => {
      if (typeof variant !== 'object' || variant === null) {
        throw new Error(`rules.yaml: rule "${rule.id}" has a non-mapping conflict variant`);
      }
      const v = variant as Record<string, unknown>;
      for (const key of ['source', 'statement', 'evidence'] as const) {
        if (typeof v[key] !== 'string' || (v[key] as string).trim() === '') {
          throw new Error(`rules.yaml: rule "${rule.id}" conflict variant is missing "${key}"`);
        }
      }
      return { source: v.source as string, statement: v.statement as string, evidence: v.evidence as string };
    });
  }
  if (r.resolution !== undefined) {
    if (typeof r.resolution !== 'string' || r.resolution.trim() === '') {
      throw new Error(`rules.yaml: rule "${rule.id}": "resolution" must be a non-empty string when present`);
    }
    rule.resolution = r.resolution;
  }
  return rule;
}

// ---------------------------------------------------------------------------
// Validation (exported for the conformance test's negative cases)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateUtc(value: string): Date | undefined {
  if (!ISO_DATE.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function defaultEvidenceFileExists(evidencePath: string): boolean {
  return existsSync(fileURLToPath(new URL(`../../${evidencePath}`, import.meta.url)));
}

const EXPORT_PATTERNS = (symbol: string): RegExp[] => [
  new RegExp(`export\\s+(?:const|function|class|interface|type|enum)\\s+${symbol}\\b`),
  new RegExp(`export\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}`),
];

function defaultEnforcementAnchorExists(file: string, symbol: string): boolean {
  try {
    const source = readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
    return EXPORT_PATTERNS(symbol).some((pattern) => pattern.test(source));
  } catch {
    return false;
  }
}

/**
 * Full conformance validation of a rules array. Returns every issue found
 * (empty array = conformant). Pure logic + injectable probes, so negative
 * tests can feed synthetic rules without touching the real files.
 */
export function validateRules(rules: RuleDefinition[], options: ValidateOptions = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const evidenceFileExists = options.evidenceFileExists ?? defaultEvidenceFileExists;
  const anchorExists = options.enforcementAnchorExists ?? defaultEnforcementAnchorExists;
  const now = options.now ?? new Date();

  const seen = new Set<string>();
  for (const rule of rules) {
    const fail = (message: string): void => {
      issues.push({ ruleId: rule.id ?? '?', message });
    };

    if (seen.has(rule.id)) fail(`duplicate rule id "${rule.id}"`);
    seen.add(rule.id);

    for (const [field, allowed] of [
      ['severity', ['advisory', 'hard']],
      ['source', ['official', 'sandbox']],
      ['status', ['active', 'conflict']],
    ] as const) {
      if (!allowed.includes(rule[field] as never)) fail(`${field} "${String(rule[field])}" must be one of: ${allowed.join(', ')}`);
    }

    const retrievedAt = parseIsoDateUtc(rule.retrievedAt);
    const expiresAt = parseIsoDateUtc(rule.expiresAt);
    if (!retrievedAt) fail(`retrievedAt "${rule.retrievedAt}" must be an ISO date (YYYY-MM-DD)`);
    if (!expiresAt) fail(`expiresAt "${rule.expiresAt}" must be an ISO date (YYYY-MM-DD)`);
    if (retrievedAt && expiresAt) {
      const expectedExpiry = addDaysUtc(retrievedAt, EVIDENCE_RETENTION_DAYS);
      if (expiresAt.getTime() !== expectedExpiry.getTime()) {
        fail(`expiresAt ${rule.expiresAt} must equal retrievedAt ${rule.retrievedAt} + ${EVIDENCE_RETENTION_DAYS} days (${expectedExpiry.toISOString().slice(0, 10)})`);
      }
      // Evidence-expiry mechanism (audit §29.3): past expiry the rule
      // degrades to unverified and conformance fails until re-verification.
      if (now.getTime() > expectedExpiry.getTime()) {
        fail(`evidence expired: retrievedAt ${rule.retrievedAt} is more than ${EVIDENCE_RETENTION_DAYS} days old (expired ${expectedExpiry.toISOString().slice(0, 10)}; now ${now.toISOString().slice(0, 10)})`);
      }
    }

    let evidenceUrl: URL | undefined;
    try {
      evidenceUrl = new URL(rule.evidenceUrl);
    } catch {
      fail(`evidenceUrl "${rule.evidenceUrl}" is not a valid URL`);
    }
    if (evidenceUrl && rule.source === 'official' && evidenceUrl.host !== OFFICIAL_EVIDENCE_HOST) {
      fail(`source "official" requires an evidence URL on ${OFFICIAL_EVIDENCE_HOST}, received "${evidenceUrl.host}"`);
    }

    if (!evidenceFileExists(rule.evidence)) {
      fail(`evidence file "${rule.evidence}" does not exist`);
    }

    if (rule.status === 'conflict' && (!rule.conflicts || rule.conflicts.length === 0)) {
      fail('status "conflict" requires a non-empty "conflicts" array');
    }

    for (const anchor of rule.enforcement) {
      if (!anchorExists(anchor.file, anchor.symbol)) {
        fail(`enforcement anchor not found: ${anchor.file} does not export "${anchor.symbol}"`);
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Deterministic emission
// ---------------------------------------------------------------------------

/**
 * The emitter reproduces biome's canonical formatting (single quotes where
 * they need no extra escaping, long string values broken onto their own line
 * at +2 indent, scalar arrays inlined when the line fits 120 columns) so the
 * generated module is a fixed point of `biome format src`. Emission is a pure
 * function of rules.yaml — same input, same bytes.
 */
const LINE_WIDTH = 120;

/** Single-quote a string, switching to double quotes when that avoids escapes. */
function quoteString(value: string): string {
  const escaped = value.replaceAll(String.fromCharCode(92), String.fromCharCode(92, 92));
  if (escaped.includes("'") && !escaped.includes('"')) return `"${escaped}"`;
  return `'${escaped.replaceAll("'", String.fromCharCode(92, 39))}'`;
}

type EmitValue = string | string[] | Record<string, string>[];

function emitProperty(out: string[], key: string, value: EmitValue, indent: number): void {
  const pad = ' '.repeat(indent);
  if (typeof value === 'string') {
    const literal = quoteString(value);
    const line = `${pad}${key}: ${literal},`;
    if (line.length <= LINE_WIDTH) {
      out.push(line);
      return;
    }
    out.push(`${pad}${key}:`);
    out.push(`${pad}  ${literal},`);
    return;
  }
  if (value.length === 0) {
    out.push(`${pad}${key}: [],`);
    return;
  }
  if (typeof value[0] === 'string') {
    const items = value as string[];
    const inline = `${pad}${key}: [${items.map(quoteString).join(', ')}],`;
    if (inline.length <= LINE_WIDTH) {
      out.push(inline);
      return;
    }
    out.push(`${pad}${key}: [`);
    for (const item of items) out.push(`${pad}  ${quoteString(item)},`);
    out.push(`${pad}],`);
    return;
  }
  const objects = value as Record<string, string>[];
  const inlineObject = (object: Record<string, string>): string =>
    `{ ${Object.entries(object)
      .map(([entryKey, entryValue]) => `${entryKey}: ${quoteString(entryValue)}`)
      .join(', ')} }`;
  const inline = `${pad}${key}: [${objects.map(inlineObject).join(', ')}],`;
  if (inline.length <= LINE_WIDTH) {
    out.push(inline);
    return;
  }
  out.push(`${pad}${key}: [`);
  for (const object of objects) {
    const elementInline = `${pad}  ${inlineObject(object)},`;
    if (elementInline.length <= LINE_WIDTH) {
      out.push(elementInline);
      continue;
    }
    out.push(`${pad}  {`);
    for (const [entryKey, entryValue] of Object.entries(object)) emitProperty(out, entryKey, entryValue, indent + 4);
    out.push(`${pad}  },`);
  }
  out.push(`${pad}],`);
}

function emitRule(out: string[], rule: RuleDefinition): void {
  out.push('  {');
  emitProperty(out, 'id', rule.id, 4);
  emitProperty(out, 'statement', rule.statement, 4);
  emitProperty(out, 'endpoints', rule.endpoints, 4);
  emitProperty(out, 'severity', rule.severity, 4);
  emitProperty(out, 'source', rule.source, 4);
  emitProperty(out, 'status', rule.status, 4);
  emitProperty(out, 'evidence', rule.evidence, 4);
  emitProperty(out, 'evidenceUrl', rule.evidenceUrl, 4);
  emitProperty(out, 'retrievedAt', rule.retrievedAt, 4);
  emitProperty(out, 'expiresAt', rule.expiresAt, 4);
  emitProperty(
    out,
    'enforcement',
    rule.enforcement.map((anchor) => ({ file: anchor.file, symbol: anchor.symbol })),
    4,
  );
  if (rule.conflicts && rule.conflicts.length > 0) {
    emitProperty(
      out,
      'conflicts',
      rule.conflicts.map((variant) => ({ source: variant.source, statement: variant.statement, evidence: variant.evidence })),
      4,
    );
  }
  if (rule.resolution !== undefined) emitProperty(out, 'resolution', rule.resolution, 4);
  out.push('  },');
}

export function generateModuleSource(doc: RulesDocument): string {
  const lines: string[] = [
    '/**',
    ' * GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Emitted deterministically by scripts/generate/gen-rules.ts from the',
    ` * authored registry ${RULES_YAML_RELATIVE_PATH} (external truth: ABA`,
    ' * documentation + dated observations, provenance-tagged and',
    ' * expiry-checked — audit WP-02, docs/project/2026-10-05-dx-platform-audit-pass2.md',
    ' * §29.2). Regenerate with `npm run gen:rules`; CI gates drift with',
    ' * `npm run gen:rules -- --check`.',
    ' */',
    '',
    'export type RuleSeverity = \'advisory\' | \'hard\';',
    '',
    'export type RuleSource = \'official\' | \'sandbox\';',
    '',
    'export type RuleStatus = \'active\' | \'conflict\';',
    '',
    'export interface RuleEnforcementAnchor {',
    '  file: string;',
    '  symbol: string;',
    '}',
    '',
    'export interface RuleConflictVariant {',
    '  source: string;',
    '  statement: string;',
    '  evidence: string;',
    '}',
    '',
    'export interface RuleDefinition {',
    '  id: string;',
    '  statement: string;',
    '  endpoints: string[];',
    '  severity: RuleSeverity;',
    '  source: RuleSource;',
    '  status: RuleStatus;',
    '  evidence: string;',
    '  evidenceUrl: string;',
    '  retrievedAt: string;',
    '  expiresAt: string;',
    '  enforcement: RuleEnforcementAnchor[];',
    '  conflicts?: RuleConflictVariant[];',
    '  resolution?: string;',
    '}',
    '',
    `export const RULES_SCHEMA = ${quoteString(RULES_SCHEMA)};`,
    '',
    `export const EVIDENCE_RETENTION_DAYS = ${EVIDENCE_RETENTION_DAYS};`,
    '',
    `export const OFFICIAL_EVIDENCE_HOST = ${quoteString(OFFICIAL_EVIDENCE_HOST)};`,
    '',
    'export const RULES: readonly RuleDefinition[] = [',
  ];

  for (const rule of doc.rules) emitRule(lines, rule);

  lines.push(
    '];',
    '',
    'export function getRuleById(id: string): RuleDefinition | undefined {',
    '  return RULES.find((rule) => rule.id === id);',
    '}',
    '',
    'export function officialRules(): RuleDefinition[] {',
    '  return RULES.filter((rule) => rule.source === \'official\');',
    '}',
    '',
    'export function conflictedRules(): RuleDefinition[] {',
    '  return RULES.filter((rule) => rule.status === \'conflict\');',
    '}',
    '',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readRulesDocument(): RulesDocument {
  const yamlText = readFileSync(RULES_YAML_PATH, 'utf8');
  const doc = parseRulesYaml(yamlText);
  const issues = validateRules(doc.rules);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`rules.yaml: ${issue.ruleId}: ${issue.message}`);
    throw new Error(`rules.yaml failed conformance validation with ${issues.length} issue(s)`);
  }
  return doc;
}

export function isGeneratedModuleCurrent(): { current: boolean; detail: string } {
  let fresh: string;
  try {
    fresh = generateModuleSource(readRulesDocument());
  } catch (error) {
    return { current: false, detail: `fresh generation failed: ${(error as Error).message}` };
  }
  if (!existsSync(GENERATED_MODULE_PATH)) {
    return { current: false, detail: `${GENERATED_MODULE_RELATIVE_PATH} does not exist — run \`npm run gen:rules\`` };
  }
  const committed = readFileSync(GENERATED_MODULE_PATH, 'utf8');
  if (committed === fresh) return { current: true, detail: `${GENERATED_MODULE_RELATIVE_PATH} is byte-identical to a fresh generation` };
  return {
    current: false,
    detail: `${GENERATED_MODULE_RELATIVE_PATH} is stale — run \`npm run gen:rules\` and commit the result`,
  };
}

function main(): void {
  const check = process.argv.includes('--check');
  if (check) {
    const { current, detail } = isGeneratedModuleCurrent();
    console.log(detail);
    if (!current) process.exit(1);
    return;
  }
  const doc = readRulesDocument();
  const source = generateModuleSource(doc);
  mkdirSync(fileURLToPath(new URL('../../src/generated', import.meta.url)), { recursive: true });
  writeFileSync(GENERATED_MODULE_PATH, source);
  console.log(
    `Wrote ${GENERATED_MODULE_RELATIVE_PATH} — ${doc.rules.length} rules ` +
      `(${doc.rules.filter((rule) => rule.source === 'official').length} official, ` +
      `${doc.rules.filter((rule) => rule.status === 'conflict').length} conflict)`,
  );
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
