/**
 * Generate the typed environment-variable registry (src/generated/env-registry.ts)
 * AND the root .env.example from the AUTHORED registry
 * knowledge/rules/env-vars.yaml (audit P1-04 / P1-05, DX-KNOW-005/005b —
 * docs/project/2026-10-05-dx-platform-audit-pass2.md §47, §29.2: env-vars.yaml
 * is authored because descriptions/defaults/kinds are knowledge spread across
 * SDK, CLI and docs — not derivable from process.env reads alone; the TS
 * module and .env.example are generated because their consumers are
 * TypeScript and new projects respectively).
 *
 * The generator is deterministic: the same env-vars.yaml always produces the
 * same bytes for BOTH artifacts, so `--check` can gate drift in CI:
 *
 *     npm run gen:env-vars              # regenerate both artifacts
 *     npm run gen:env-vars -- --check   # exit 0 iff both committed artifacts
 *                                       # are byte-identical to a fresh
 *                                       # generation
 *
 * Consumers of the generated module:
 *   - src/config/envValidator.ts — the known-variable allow-list behind
 *     W-PAYWAY-UNKNOWN-VAR (P1-04: zero false positives, typo suggestions).
 *   - src/config/envExample.ts — renders the .env.example text from the
 *     registry (P1-05); the generator writes that text to the repo root and
 *     src/cli/commands/init.ts writes the identical text into new projects.
 *   - src/__tests__/env-registry-conformance.test.ts — the drift gate that
 *     scans src/** for PAYWAY_ reads and keeps this registry complete.
 *
 * This module also exports the source scanner used by that conformance test:
 * scanPayWayEnvReads() recognizes the read shapes that exist in src/ today —
 * `process.env.X`, `env.X`, `env?.X`, `(options.env ?? process.env).X`,
 * `env['X']`, `env[CONST]` (via the quoted constant literal), and the quoted
 * string constants themselves (khqr-config.ts's environmentFields map).
 *
 * Direction of truth (one way only): env-vars.yaml -> generated artifacts.
 * Never edit src/generated/env-registry.ts or .env.example by hand.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildEnvExampleText } from '../../src/config/envExample.js';

export const ENV_VARS_SCHEMA = 'payway-env-vars/v1';
export const ENV_VARS_YAML_RELATIVE_PATH = 'knowledge/rules/env-vars.yaml';
export const GENERATED_MODULE_RELATIVE_PATH = 'src/generated/env-registry.ts';
export const ENV_EXAMPLE_RELATIVE_PATH = '.env.example';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ENV_VARS_YAML_PATH = fileURLToPath(new URL(`../../${ENV_VARS_YAML_RELATIVE_PATH}`, import.meta.url));
const GENERATED_MODULE_PATH = fileURLToPath(new URL(`../../${GENERATED_MODULE_RELATIVE_PATH}`, import.meta.url));
const ENV_EXAMPLE_PATH = fileURLToPath(new URL(`../../${ENV_EXAMPLE_RELATIVE_PATH}`, import.meta.url));

export type PayWayEnvVarKind = 'secret' | 'credential' | 'non-secret';

export type PayWayEnvVarGroup = 'connection' | 'credentials' | 'urls' | 'tls' | 'behavior' | 'data' | 'integrations';

export const PAYWAY_ENV_VAR_KINDS: readonly PayWayEnvVarKind[] = ['secret', 'credential', 'non-secret'];

export const PAYWAY_ENV_VAR_GROUPS: readonly PayWayEnvVarGroup[] = [
  'connection',
  'credentials',
  'urls',
  'tls',
  'behavior',
  'data',
  'integrations',
];

export interface PayWayEnvVarDefinition {
  name: string;
  kind: PayWayEnvVarKind;
  group: PayWayEnvVarGroup;
  description: string;
  defaultValue: string | null;
  required: boolean;
  consumedBy: string[];
  docsAnchor?: string;
  example?: string;
  /** Documented contract with no in-repo reader yet (never a false warning). */
  external?: boolean;
  /** Render the single-line vs multi-line quoted PEM syntax block (.env.example). */
  pemSyntax?: boolean;
}

export interface EnvVarsDocument {
  schema: string;
  owner: string;
  vars: PayWayEnvVarDefinition[];
}

export interface EnvVarValidationIssue {
  varName: string;
  message: string;
}

export interface ValidateEnvVarsOptions {
  /** Override the repo-relative file-existence probe (negative tests inject a fake). */
  fileExists?: (relativePath: string) => boolean;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const NAME_PATTERN = /^PAYWAY_[A-Z0-9_]+$/;

/** Parse the authored YAML into a typed document, throwing on shape drift. */
export function parseEnvVarsYaml(yamlText: string): EnvVarsDocument {
  const raw: unknown = parse(yamlText);
  if (typeof raw !== 'object' || raw === null) throw new Error('env-vars.yaml: top level must be a mapping');
  const doc = raw as Record<string, unknown>;
  if (doc.schema !== ENV_VARS_SCHEMA) {
    throw new Error(`env-vars.yaml: expected schema "${ENV_VARS_SCHEMA}", received "${String(doc.schema)}"`);
  }
  if (typeof doc.owner !== 'string' || !Array.isArray(doc.vars)) {
    throw new Error('env-vars.yaml: "owner" (string) and "vars" (array) are required');
  }
  const vars = doc.vars.map(parseVar);
  return { schema: ENV_VARS_SCHEMA, owner: doc.owner, vars };
}

function parseVar(raw: unknown): PayWayEnvVarDefinition {
  if (typeof raw !== 'object' || raw === null) throw new Error('env-vars.yaml: each var must be a mapping');
  const v = raw as Record<string, unknown>;
  const str = (key: string): string => {
    const value = v[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`env-vars.yaml: var "${String(v.name ?? '?')}" is missing required string field "${key}"`);
    }
    return value;
  };
  const consumedByRaw = v.consumedBy ?? [];
  if (!Array.isArray(consumedByRaw) || !consumedByRaw.every((f) => typeof f === 'string' && f.trim() !== '')) {
    throw new Error(`env-vars.yaml: var "${String(v.name ?? '?')}" "consumedBy" must be an array of file paths`);
  }
  if (v.default !== null && v.default !== undefined && (typeof v.default !== 'string' || v.default.trim() === '')) {
    throw new Error(`env-vars.yaml: var "${String(v.name ?? '?')}" "default" must be null or a non-empty string`);
  }
  const envVar: PayWayEnvVarDefinition = {
    name: str('name'),
    kind: str('kind') as PayWayEnvVarKind,
    group: str('group') as PayWayEnvVarGroup,
    description: str('description'),
    defaultValue: v.default === undefined ? null : (v.default as string),
    required: v.required === true,
    consumedBy: consumedByRaw as string[],
  };
  if (typeof v.docsAnchor === 'string' && v.docsAnchor.trim() !== '') envVar.docsAnchor = v.docsAnchor;
  if (typeof v.example === 'string' && v.example.trim() !== '') envVar.example = v.example;
  if (v.external === true) envVar.external = true;
  if (v.pemSyntax === true) envVar.pemSyntax = true;
  return envVar;
}

// ---------------------------------------------------------------------------
// Validation (exported for the conformance test's negative cases)
// ---------------------------------------------------------------------------

export function validateEnvVars(
  vars: PayWayEnvVarDefinition[],
  options: ValidateEnvVarsOptions = {},
): EnvVarValidationIssue[] {
  const issues: EnvVarValidationIssue[] = [];
  const fileExists =
    options.fileExists ?? ((relativePath: string): boolean => existsSync(path.join(REPO_ROOT, relativePath)));
  const seen = new Set<string>();

  for (const envVar of vars) {
    const fail = (message: string): void => {
      issues.push({ varName: envVar.name ?? '?', message });
    };

    if (!NAME_PATTERN.test(envVar.name)) fail(`name "${envVar.name}" must match ${NAME_PATTERN.source}`);
    if (seen.has(envVar.name)) fail(`duplicate var name "${envVar.name}"`);
    seen.add(envVar.name);

    if (!PAYWAY_ENV_VAR_KINDS.includes(envVar.kind)) {
      fail(`kind "${envVar.kind}" must be one of: ${PAYWAY_ENV_VAR_KINDS.join(', ')}`);
    }
    if (!PAYWAY_ENV_VAR_GROUPS.includes(envVar.group)) {
      fail(`group "${envVar.group}" must be one of: ${PAYWAY_ENV_VAR_GROUPS.join(', ')}`);
    }

    if (envVar.kind === 'secret' && envVar.defaultValue !== null) {
      fail('secret vars must have default: null (secrets are never a committed default)');
    }
    if (envVar.kind === 'secret' && envVar.example !== undefined) {
      fail('secret vars must not carry an example value — placeholder only');
    }

    if (envVar.external) {
      if (envVar.consumedBy.length > 0) {
        fail('external vars must have an empty consumedBy list (external = no in-repo reader)');
      }
      if (!envVar.docsAnchor) fail('external vars must declare docsAnchor (the documented contract)');
    } else if (envVar.consumedBy.length === 0) {
      fail('every non-external var needs at least one consumedBy file (audit P1-04 criterion 4)');
    }

    for (const file of envVar.consumedBy) {
      if (!fileExists(file)) fail(`consumedBy file "${file}" does not exist`);
    }
    if (envVar.docsAnchor && !fileExists(envVar.docsAnchor)) {
      fail(`docsAnchor "${envVar.docsAnchor}" does not exist`);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Source scanner (consumed by env-registry-conformance.test.ts)
// ---------------------------------------------------------------------------

// Read shapes present in src/ today:
//   pattern 1: process.env.X / env.X / env?.X
//   pattern 2: (options.env ?? process.env).X          (mcp/server.ts)
//   pattern 3: env['X'] / process.env['X']
//   pattern 4: quoted 'PAYWAY_X' constant literals     (khqr-config.ts's
//              environmentFields map, TOKEN_STORE_DIR_ENV,
//              PAYWAY_DATA_DIR_ENV, doctor's env-var name lists)
const PATTERN_ENV_DOT = /\b(?:process\s*\.\s*)?env\s*\??\.\s*(PAYWAY_[A-Z0-9_]+)/g;
const PATTERN_ENV_PAREN_DOT = /\benv\s*\)\s*\.\s*(PAYWAY_[A-Z0-9_]+)/g;
const PATTERN_ENV_BRACKET = /\b(?:process\s*\.\s*)?env\s*\??\[\s*['"](PAYWAY_[A-Z0-9_]+)['"]\s*\]/g;
const PATTERN_QUOTED_LITERAL = /['"](PAYWAY_[A-Z0-9_]+)['"]/g;

const SCAN_PATTERNS: readonly RegExp[] = [
  PATTERN_ENV_DOT,
  PATTERN_ENV_PAREN_DOT,
  PATTERN_ENV_BRACKET,
  PATTERN_QUOTED_LITERAL,
];

/**
 * Collect every PAYWAY_ variable name read by the given TypeScript source.
 * Pure function of the source text — negative tests feed synthetic snippets
 * without touching real files.
 */
export function scanPayWayEnvReads(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of SCAN_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

/** Every .ts file under <repoRoot>/src, excluding __tests__ (sorted, deterministic). */
export function listPayWaySourceFiles(repoRoot: string = REPO_ROOT): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__') continue;
        walk(full);
      } else if (entry.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  walk(path.join(repoRoot, 'src'));
  return files.sort();
}

// ---------------------------------------------------------------------------
// Deterministic emission (module)
// ---------------------------------------------------------------------------

/**
 * The emitter reproduces biome's canonical formatting (single quotes, trailing
 * commas, long strings broken onto their own line at +2 indent, scalar arrays
 * inlined when the line fits 120 columns) so the generated module is a fixed
 * point of `biome format src`. Emission is a pure function of env-vars.yaml —
 * same input, same bytes.
 */
const LINE_WIDTH = 120;

function quoteString(value: string): string {
  const escaped = value.replaceAll(String.fromCharCode(92), String.fromCharCode(92, 92));
  if (escaped.includes("'") && !escaped.includes('"')) return `"${escaped}"`;
  return `'${escaped.replaceAll("'", String.fromCharCode(92, 39))}'`;
}

type EmitValue = string | string[] | boolean | null;

function emitProperty(out: string[], key: string, value: EmitValue, indent: number): void {
  const pad = ' '.repeat(indent);
  if (typeof value === 'boolean') {
    out.push(`${pad}${key}: ${value},`);
    return;
  }
  if (value === null) {
    out.push(`${pad}${key}: null,`);
    return;
  }
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
  const inline = `${pad}${key}: [${value.map(quoteString).join(', ')}],`;
  if (inline.length <= LINE_WIDTH) {
    out.push(inline);
    return;
  }
  out.push(`${pad}${key}: [`);
  for (const item of value) out.push(`${pad}  ${quoteString(item)},`);
  out.push(`${pad}],`);
}

function emitVar(out: string[], envVar: PayWayEnvVarDefinition): void {
  out.push('  {');
  emitProperty(out, 'name', envVar.name, 4);
  emitProperty(out, 'kind', envVar.kind, 4);
  emitProperty(out, 'group', envVar.group, 4);
  emitProperty(out, 'description', envVar.description, 4);
  emitProperty(out, 'defaultValue', envVar.defaultValue, 4);
  emitProperty(out, 'required', envVar.required, 4);
  emitProperty(out, 'consumedBy', envVar.consumedBy, 4);
  if (envVar.docsAnchor !== undefined) emitProperty(out, 'docsAnchor', envVar.docsAnchor, 4);
  if (envVar.example !== undefined) emitProperty(out, 'example', envVar.example, 4);
  if (envVar.external === true) emitProperty(out, 'external', true, 4);
  if (envVar.pemSyntax === true) emitProperty(out, 'pemSyntax', true, 4);
  out.push('  },');
}

function emitUnionType(out: string[], typeName: string, members: readonly string[]): void {
  const inline = `export type ${typeName} = ${members.map(quoteString).join(' | ')};`;
  if (inline.length <= LINE_WIDTH) {
    out.push(inline);
    return;
  }
  out.push(`export type ${typeName} =`);
  members.forEach((member, index) => {
    const terminator = index === members.length - 1 ? ';' : '';
    out.push(`  | ${quoteString(member)}${terminator}`);
  });
}

export function generateModuleSource(doc: EnvVarsDocument): string {
  const lines: string[] = [
    '/**',
    ' * GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Emitted deterministically by scripts/generate/gen-env-vars.ts from the',
    ` * authored registry ${ENV_VARS_YAML_RELATIVE_PATH} (audit P1-04 / P1-05,`,
    ' * docs/project/2026-10-05-dx-platform-audit-pass2.md §29.2, §47). Regenerate',
    ' * with `npm run gen:env-vars`; CI gates drift with',
    ' * `npm run gen:env-vars -- --check`. The same generator emits the root',
    ' * .env.example; src/config/envValidator.ts consumes the allow-list below.',
    ' */',
    '',
  ];

  emitUnionType(lines, 'PayWayEnvVarKind', PAYWAY_ENV_VAR_KINDS);
  lines.push('');
  emitUnionType(lines, 'PayWayEnvVarGroup', PAYWAY_ENV_VAR_GROUPS);
  lines.push(
    '',
    'export interface PayWayEnvVarDefinition {',
    '  name: string;',
    '  kind: PayWayEnvVarKind;',
    '  group: PayWayEnvVarGroup;',
    '  description: string;',
    '  defaultValue: string | null;',
    '  required: boolean;',
    '  consumedBy: string[];',
    '  docsAnchor?: string;',
    '  example?: string;',
    '  external?: boolean;',
    '  pemSyntax?: boolean;',
    '}',
    '',
    `export const PAYWAY_ENV_VARS_SCHEMA = ${quoteString(ENV_VARS_SCHEMA)};`,
    '',
    'export const PAYWAY_ENV_VARS: readonly PayWayEnvVarDefinition[] = [',
  );

  for (const envVar of doc.vars) emitVar(lines, envVar);

  lines.push(
    '];',
    '',
    'const KNOWN_PAYWAY_ENV_VAR_NAMES: ReadonlySet<string> = new Set(PAYWAY_ENV_VARS.map((envVar) => envVar.name));',
    '',
    'export function getPayWayEnvVar(name: string): PayWayEnvVarDefinition | undefined {',
    '  return PAYWAY_ENV_VARS.find((envVar) => envVar.name === name);',
    '}',
    '',
    'export function knownPayWayEnvVarNames(): ReadonlySet<string> {',
    '  return KNOWN_PAYWAY_ENV_VAR_NAMES;',
    '}',
    '',
    'export function isKnownPayWayEnvVar(name: string): boolean {',
    '  return KNOWN_PAYWAY_ENV_VAR_NAMES.has(name);',
    '}',
    '',
    '/**',
    ' * PAYWAY_-prefixed keys present in the env map that the registry does not',
    ' * know (the W-PAYWAY-UNKNOWN-VAR input). Sorted for deterministic output.',
    ' */',
    'export function collectUnknownPayWayVarNames(env: Record<string, string | undefined>): string[] {',
    '  return Object.keys(env)',
    '    .filter((key) => /^PAYWAY_/i.test(key))',
    '    .filter((key) => !KNOWN_PAYWAY_ENV_VAR_NAMES.has(key))',
    '    .sort();',
    '}',
    '',
    '/**',
    " * Registry name nearest to a typo'd variable (smallest edit distance, ties",
    ' * broken by registry order). Undefined when nothing is close enough to be',
    ' * a plausible typo.',
    ' */',
    'export function nearestPayWayEnvVarName(input: string): string | undefined {',
    '  const maxDistance = Math.max(2, Math.floor(input.length / 4));',
    '  let best: string | undefined;',
    '  let bestDistance = Number.POSITIVE_INFINITY;',
    '  for (const envVar of PAYWAY_ENV_VARS) {',
    '    const distance = editDistance(input, envVar.name);',
    '    if (distance < bestDistance) {',
    '      best = envVar.name;',
    '      bestDistance = distance;',
    '    }',
    '  }',
    '  return bestDistance <= maxDistance ? best : undefined;',
    '}',
    '',
    'function editDistance(a: string, b: string): number {',
    '  const previous = new Array<number>(b.length + 1);',
    '  const current = new Array<number>(b.length + 1);',
    '  for (let j = 0; j <= b.length; j++) previous[j] = j;',
    '  for (let i = 1; i <= a.length; i++) {',
    '    current[0] = i;',
    '    for (let j = 1; j <= b.length; j++) {',
    '      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);',
    '      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);',
    '    }',
    '    for (let j = 0; j <= b.length; j++) previous[j] = current[j];',
    '  }',
    '  return previous[b.length];',
    '}',
    '',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Artifact currency checks + CLI
// ---------------------------------------------------------------------------

function readEnvVarsDocument(): EnvVarsDocument {
  const yamlText = readFileSync(ENV_VARS_YAML_PATH, 'utf8');
  const doc = parseEnvVarsYaml(yamlText);
  const issues = validateEnvVars(doc.vars);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`env-vars.yaml: ${issue.varName}: ${issue.message}`);
    throw new Error(`env-vars.yaml failed conformance validation with ${issues.length} issue(s)`);
  }
  return doc;
}

function artifactCurrency(
  relativePath: string,
  fresh: string,
  regenerateCommand: string,
): { current: boolean; detail: string } {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return { current: false, detail: `${relativePath} does not exist — run \`${regenerateCommand}\`` };
  }
  const committed = readFileSync(absolutePath, 'utf8');
  if (committed === fresh) return { current: true, detail: `${relativePath} is byte-identical to a fresh generation` };
  return {
    current: false,
    detail: `${relativePath} is stale — run \`${regenerateCommand}\` and commit the result`,
  };
}

export function isGeneratedModuleCurrent(): { current: boolean; detail: string } {
  let fresh: string;
  try {
    fresh = generateModuleSource(readEnvVarsDocument());
  } catch (error) {
    return { current: false, detail: `fresh generation failed: ${(error as Error).message}` };
  }
  return artifactCurrency(GENERATED_MODULE_RELATIVE_PATH, fresh, 'npm run gen:env-vars');
}

export function isEnvExampleCurrent(): { current: boolean; detail: string } {
  let fresh: string;
  try {
    fresh = buildEnvExampleText(readEnvVarsDocument().vars);
  } catch (error) {
    return { current: false, detail: `fresh generation failed: ${(error as Error).message}` };
  }
  return artifactCurrency(ENV_EXAMPLE_RELATIVE_PATH, fresh, 'npm run gen:env-vars');
}

function main(): void {
  const check = process.argv.includes('--check');
  if (check) {
    const moduleStatus = isGeneratedModuleCurrent();
    const exampleStatus = isEnvExampleCurrent();
    console.log(moduleStatus.detail);
    console.log(exampleStatus.detail);
    if (!moduleStatus.current || !exampleStatus.current) process.exit(1);
    return;
  }
  const doc = readEnvVarsDocument();
  mkdirSync(fileURLToPath(new URL('../../src/generated', import.meta.url)), { recursive: true });
  writeFileSync(GENERATED_MODULE_PATH, generateModuleSource(doc));
  writeFileSync(ENV_EXAMPLE_PATH, buildEnvExampleText(doc.vars));
  const secrets = doc.vars.filter((envVar) => envVar.kind === 'secret').length;
  const external = doc.vars.filter((envVar) => envVar.external === true).length;
  console.log(
    `Wrote ${GENERATED_MODULE_RELATIVE_PATH} and ${ENV_EXAMPLE_RELATIVE_PATH} — ` +
      `${doc.vars.length} variables (${secrets} secret, ${external} external)`,
  );
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
