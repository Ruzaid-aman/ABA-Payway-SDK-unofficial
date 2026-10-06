/**
 * Offline doctor checks (audit WP-11 / §17.4 "Offline" tier).
 *
 * Every check in this file is repository self-audit: no network, no
 * credentials, no mutation, and every check is a pure function of files that
 * already exist on disk. They deliberately re-use the machinery the blocking
 * CI gates already use (`findBypassOccurrences`, the generated env-var
 * registry, `MONEY_MOVING_PATHS`) instead of re-implementing it, so doctor can
 * never disagree with the gate that already blocks a regression.
 *
 * Each check's scan core is exported as a PURE function over a file list
 * (synthetic input, no real files) so the negatives in doctor-engine.test.ts
 * prove the check bites without editing a single tracked file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBypassOccurrences, TLS_BYPASS_FORBIDDEN } from '../../../cli/tls-bypass-scan.js';
import { MONEY_MOVING_PATHS } from '../../../core/env-guard.js';
import { knownPayWayEnvVarNames } from '../../../generated/env-registry.js';
import { EVIDENCE_RETENTION_DAYS, RULES, type RuleDefinition } from '../../../generated/rules.js';
import type { CheckDefinition, CheckOutcome } from '../types.js';

/** One file's text, relative to the repo root (POSIX-ish separators as git reports them). */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

// The prescribed two-level anchor is src/diagnostics; the repo root is found by
// walking up until the marker pair (package.json + src/) is present, so the
// resolution stays correct if the module moves deeper in the tree.
const REPO_ROOT_ANCHOR = fileURLToPath(new URL('../..', import.meta.url));

/** Repo root, verified by its marker file. Throws rather than guessing. */
export function resolveRepoRoot(): string {
  let dir = REPO_ROOT_ANCHOR;
  for (let hop = 0; hop < 8; hop += 1) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'src'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`doctor: cannot locate the repo root above ${REPO_ROOT_ANCHOR} (no package.json + src)`);
}

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Scan cores (pure)
// ---------------------------------------------------------------------------

// Same read shapes as the env-registry generator's source scanner, so doctor
// and the registry-conformance gate agree on what a "PAYWAY_ read" is.
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

/** Every `PAYWAY_*` name read (or name-shaped literal) in one source text. */
export function scanEnvVarReads(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of SCAN_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      found.add(match[1]);
      match = pattern.exec(source);
    }
  }
  return [...found].sort();
}

/** `file:PAYWAY_NAME` for every read that the generated registry does not know. */
export function scanUnregisteredEnvVars(
  files: readonly SourceFile[],
  known: ReadonlySet<string> = knownPayWayEnvVarNames(),
): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    for (const name of scanEnvVarReads(file.content)) {
      if (!known.has(name)) offenders.push(`${file.path}:${name}`);
    }
  }
  return offenders.sort();
}

/**
 * Official-sourced rules whose evidence is older than the retention window.
 * Returns `'RULE-ID retrievedAt'` so the offender says why it aged out.
 */
export function agedOfficialRuleIds(
  rules: readonly RuleDefinition[],
  now: number,
  maxAgeDays: number = EVIDENCE_RETENTION_DAYS,
): string[] {
  return rules
    .filter((rule) => rule.source === 'official')
    .filter((rule) => {
      const retrieved = Date.parse(rule.retrievedAt);
      // An unparseable date is itself stale evidence - treat it as aged.
      if (Number.isNaN(retrieved)) return true;
      return now - retrieved > maxAgeDays * DAY_MS;
    })
    .map((rule) => `${rule.id} retrievedAt=${rule.retrievedAt}`)
    .sort();
}

/** Replace comment and string bodies with spaces, preserving offsets and newlines. */
function maskCommentsAndStrings(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      blank(i, end === -1 ? source.length : end + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      const end = skipQuoted(source, i);
      blank(i + 1, Math.max(i + 1, end - 1));
      i = end;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (quote === '`' && c === '$' && source[i + 1] === '{') {
      i = skipTemplateExpression(source, i + 2);
      continue;
    }
    if (c === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipTemplateExpression(source: string, start: number): number {
  let i = start;
  let braces = 1;
  while (i < source.length && braces > 0) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(source, i);
      continue;
    }
    if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    i += 1;
  }
  return i;
}

/** Text of a call starting at the `(` of `name(`, or the tail when unbalanced. */
function extractCallText(source: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(source, i) - 1;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return source.slice(openIndex);
}

/** The id the framework falls back to when a call site passes no rule id. */
export const ADVISORY_FALLBACK_RULE_ID = 'UNSUPPORTED-TMP';

/**
 * `file:line` for every `warnAdvisory(` call that either omits `ruleId:` or
 * hands the framework the fallback id explicitly. Both forms reach the same
 * defect: an advisory with no machine-readable provenance.
 */
export function untaggedAdvisoryCallSites(files: readonly SourceFile[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const masked = maskCommentsAndStrings(file.content);
    for (const match of masked.matchAll(/\bwarnAdvisory\s*\(/g)) {
      const openIndex = (match.index ?? 0) + match[0].length - 1;
      const call = extractCallText(file.content, openIndex);
      const tagged = /ruleId\s*:/.test(call);
      const explicitFallback = call.includes(ADVISORY_FALLBACK_RULE_ID);
      if (tagged && !explicitFallback) continue;
      const line = file.content.slice(0, match.index ?? 0).split('\n').length;
      offenders.push(`${file.path}:${line}`);
    }
  }
  return offenders.sort();
}

/**
 * Money-moving command paths with no `guardCliCommand('<path>', ...)` call in
 * the CLI. Line breaks are stripped first so an argument wrapped onto its own
 * line still matches.
 */
export function uncoveredMoneyPaths(cliSource: string, paths: readonly string[] = MONEY_MOVING_PATHS): string[] {
  const flattened = cliSource.replace(/\r?\n/g, '');
  return paths
    .filter((commandPath) => !new RegExp(`guardCliCommand\\(\\s*'${escapeRegExp(commandPath)}'`).test(flattened))
    .sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Read helpers (filesystem / git, still no network and no mutation)
// ---------------------------------------------------------------------------

/** Every `.ts` under `<root>/src`, excluding `__tests__` (tests are not product source). */
function readRepoSourceFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      files.push({ path: path.relative(root, full).split(path.sep).join('/'), content: readFileSync(full, 'utf8') });
    }
  };
  walk(path.join(root, 'src'));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every TRACKED file. `-z` matters: plain `ls-files` quotes non-ASCII paths. */
function readTrackedFiles(root: string): SourceFile[] {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return raw
    .split('\0')
    .filter(Boolean)
    .sort()
    .map((relative) => ({ path: relative, content: readFileSync(path.join(root, relative), 'utf8') }));
}

function readRelativeFile(root: string, relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const ENV_COVERAGE: CheckDefinition = {
  id: 'ENV-REGISTRY-COVERAGE',
  category: 'offline',
  severity: 'blocker',
  description: 'every PAYWAY_ env-var read in src/ is present in the generated env-var registry',
  run: () => {
    const root = resolveRepoRoot();
    const offenders = scanUnregisteredEnvVars(readRepoSourceFiles(root));
    return offenders.length > 0
      ? {
          status: 'fail',
          detail: `${offenders.length} PAYWAY_ variable read(s) in src/ are missing from the generated env-var registry.`,
          offenders,
        }
      : { status: 'pass', detail: 'every PAYWAY_ read in src/ is registered in the generated env-var registry.' };
  },
};

const TLS_PURGE: CheckDefinition = {
  id: 'TLS-BYPASS-PURGE',
  category: 'offline',
  severity: 'blocker',
  // The forbidden string is interpolated from the scanner's own constant: this
  // file must never carry the literal itself, or this very check would flag it.
  description: `no tracked file carries the forbidden ${TLS_BYPASS_FORBIDDEN} verification bypass`,
  run: () => {
    const root = resolveRepoRoot();
    const offenders = findBypassOccurrences(readTrackedFiles(root));
    return offenders.length > 0
      ? {
          status: 'fail',
          detail: `${offenders.length} tracked file(s) carry the forbidden TLS-verification bypass string.`,
          offenders,
        }
      : { status: 'pass', detail: 'no tracked file carries the TLS-verification bypass outside the allow-list.' };
  },
};

const RULES_FRESH: CheckDefinition = {
  id: 'RULES-EVIDENCE-FRESH',
  category: 'offline',
  severity: 'warning',
  description: `every source:official rule has evidence retrieved within ${EVIDENCE_RETENTION_DAYS} days`,
  run: () => {
    const offenders = agedOfficialRuleIds(RULES, Date.now());
    return offenders.length > 0
      ? {
          status: 'warn',
          detail: `${offenders.length} official rule(s) have evidence older than ${EVIDENCE_RETENTION_DAYS} days.`,
          offenders,
        }
      : {
          status: 'pass',
          detail: `all ${RULES.filter((r) => r.source === 'official').length} official rule(s) carry fresh evidence.`,
        };
  },
};

const ADVISORY_FREE: CheckDefinition = {
  id: 'ADVISORY-FALLBACK-FREE',
  category: 'offline',
  severity: 'blocker',
  description: `no src/domains warnAdvisory() call site falls back to the ${ADVISORY_FALLBACK_RULE_ID} rule id`,
  run: () => {
    const root = resolveRepoRoot();
    const offenders = untaggedAdvisoryCallSites(
      readRepoSourceFiles(root).filter((f) => f.path.startsWith('src/domains/')),
    );
    return offenders.length > 0
      ? {
          status: 'fail',
          detail: `${offenders.length} warnAdvisory() call site(s) in src/domains carry no machine-readable rule id.`,
          offenders,
        }
      : { status: 'pass', detail: 'every warnAdvisory() call site in src/domains passes an explicit rule id.' };
  },
};

const GUARD_COVERAGE: CheckDefinition = {
  id: 'GUARD-COVERAGE',
  category: 'offline',
  severity: 'blocker',
  description: 'every MONEY_MOVING_PATHS entry is guarded by a guardCliCommand() call in the CLI',
  run: () => {
    const root = resolveRepoRoot();
    const offenders = uncoveredMoneyPaths(readRelativeFile(root, 'src/cli.ts'));
    return offenders.length > 0
      ? {
          status: 'fail',
          detail: `${offenders.length} money-moving command path(s) have no guardCliCommand() call in src/cli.ts.`,
          offenders,
        }
      : {
          status: 'pass',
          detail: `all ${MONEY_MOVING_PATHS.length} money-moving command path(s) are guarded in src/cli.ts.`,
        };
  },
};

/** The stage-1 registry: offline tier only, in declaration order. */
export const OFFLINE_CHECKS: readonly CheckDefinition[] = [
  ENV_COVERAGE,
  TLS_PURGE,
  RULES_FRESH,
  ADVISORY_FREE,
  GUARD_COVERAGE,
];

/** statusFor(outcome severity, offenders): 'warning' degrades to warn, everything else to fail. */
export function statusForOffenders(severity: CheckDefinition['severity'], offenders: number): CheckOutcome['status'] {
  if (offenders === 0) return 'pass';
  return severity === 'warning' ? 'warn' : 'fail';
}
