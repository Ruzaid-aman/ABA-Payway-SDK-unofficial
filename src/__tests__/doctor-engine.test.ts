/**
 * Doctor diagnostics engine - stage 1 (audit WP-11 / §17).
 *
 * Three layers of proof here:
 * 1. the runner contract (ordering, counts, exit mapping, throw-to-FAIL);
 * 2. a POSITIVE gate on the real repository - if doctor stops agreeing with
 *    the repository (an unregistered env var, a reintroduced TLS bypass, aged
 *    evidence, an untagged advisory, an unguarded money path) THIS suite goes
 *    red, which is the whole point of a self-audit engine;
 * 3. a NEGATIVE per check, fed SYNTHETIC input only - no test here edits a
 *    real tracked file, and each negative must prove its check bites.
 *
 * Offline by construction: no network, no credentials, no mutation. The only
 * child process is the `git ls-files -z` spawn inside the TLS check.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findBypassOccurrences, TLS_BYPASS_FORBIDDEN } from '../cli/tls-bypass-scan.js';
import {
  agedOfficialRuleIds,
  OFFLINE_CHECKS,
  resolveRepoRoot,
  scanUnregisteredEnvVars,
  type SourceFile,
  uncoveredMoneyPaths,
  untaggedAdvisoryCallSites,
} from '../diagnostics/doctor/checks/offline.js';
import { runOfflineDoctor } from '../diagnostics/doctor/run.js';
import type { CheckDefinition } from '../diagnostics/doctor/types.js';
import { EVIDENCE_RETENTION_DAYS, type RuleDefinition } from '../generated/rules.js';

const DOCTOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'diagnostics', 'doctor');

const DAY_MS = 86_400_000;

/** A synthetic check, so runner behaviour is provable without touching the registry. */
function syntheticCheck(overrides: Partial<CheckDefinition> & Pick<CheckDefinition, 'id'>): CheckDefinition {
  return {
    category: 'offline',
    severity: 'blocker',
    description: `synthetic ${overrides.id}`,
    run: () => ({ status: 'pass', detail: 'synthetic pass' }),
    ...overrides,
  };
}

describe('doctor engine - runner contract (WP-11 stage 1)', () => {
  it('registers exactly the five documented offline checks', () => {
    expect(OFFLINE_CHECKS.map((check) => check.id).sort()).toEqual([
      'ADVISORY-FALLBACK-FREE',
      'ENV-REGISTRY-COVERAGE',
      'GUARD-COVERAGE',
      'RULES-EVIDENCE-FRESH',
      'TLS-BYPASS-PURGE',
    ]);
    // Every check declares the offline tier and a synchronous runner: a check
    // that could reach the network has no place in this module.
    for (const check of OFFLINE_CHECKS) {
      expect(check.category).toBe('offline');
      expect(check.run.constructor.name).toBe('Function');
    }
  });

  it('sorts fails first, then warns, then passes, by id inside a group', () => {
    const report = runOfflineDoctor([
      syntheticCheck({ id: 'Z-PASS' }),
      syntheticCheck({ id: 'A-PASS' }),
      syntheticCheck({ id: 'M-WARN', run: () => ({ status: 'warn', detail: 'aged', offenders: ['X'] }) }),
      syntheticCheck({ id: 'B-FAIL', run: () => ({ status: 'fail', detail: 'broken', offenders: ['Y'] }) }),
      syntheticCheck({ id: 'A-FAIL', run: () => ({ status: 'fail', detail: 'broken too', offenders: ['Z'] }) }),
    ]);

    expect(report.results.map((r) => r.id)).toEqual(['A-FAIL', 'B-FAIL', 'M-WARN', 'A-PASS', 'Z-PASS']);
    expect(report.checksRun).toBe(5);
    expect(report.passed).toBe(2);
    expect(report.warned).toBe(1);
    expect(report.failed).toBe(2);
  });

  it('includes passing checks in the report (an absent check must not look like an unrun one)', () => {
    const report = runOfflineDoctor([syntheticCheck({ id: 'ONLY-PASS' })]);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].outcome.status).toBe('pass');
    expect(report.results[0].id).toBe('ONLY-PASS');
    // The definition travels with its outcome so a renderer needs no registry.
    expect(report.results[0].description).toBe('synthetic ONLY-PASS');
  });

  it('maps one FAIL to GATE_BLOCKER (5) and an all-pass report to OK (0)', () => {
    const withFail = runOfflineDoctor([
      syntheticCheck({ id: 'P-1' }),
      syntheticCheck({ id: 'F-1', run: () => ({ status: 'fail', detail: 'blocker', offenders: [] }) }),
    ]);
    expect(withFail.exitCode).toBe(5);
    expect(withFail.failed).toBe(1);

    const allPass = runOfflineDoctor([syntheticCheck({ id: 'P-1' }), syntheticCheck({ id: 'P-2' })]);
    expect(allPass.exitCode).toBe(0);
    expect(allPass.failed).toBe(0);

    // A WARN is not a blocker: doctor must stay actionable rather than gating.
    const warned = runOfflineDoctor([
      syntheticCheck({ id: 'W-1', severity: 'warning', run: () => ({ status: 'warn', detail: 'aged' }) }),
    ]);
    expect(warned.exitCode).toBe(0);
    expect(warned.warned).toBe(1);
  });

  it('turns a THROWING check into a FAIL carrying the error message (never swallowed)', () => {
    const report = runOfflineDoctor([
      syntheticCheck({
        id: 'THROWS',
        run: () => {
          throw new Error('probe exploded: ENOENT no such file');
        },
      }),
    ]);
    expect(report.results[0].outcome.status).toBe('fail');
    expect(report.results[0].outcome.detail).toContain('check threw instead of reporting');
    expect(report.results[0].outcome.detail).toContain('probe exploded: ENOENT no such file');
    expect(report.exitCode).toBe(5);
  });
});

describe('doctor engine - the current repository is green (the gate)', () => {
  it('every offline check passes on this checkout', { timeout: 60_000 }, () => {
    const report = runOfflineDoctor();
    const rendered = report.results
      .map(
        (r) =>
          `${r.outcome.status.toUpperCase()} ${r.id}: ${r.outcome.detail} ${JSON.stringify(r.outcome.offenders ?? [])}`,
      )
      .join('\n');
    expect(rendered).not.toMatch(/\bFAIL\b/);
    expect(report.checksRun).toBe(5);
    expect(report.failed).toBe(0);
    expect(report.warned).toBe(0);
    expect(report.passed).toBe(5);
    expect(report.exitCode).toBe(0);
  });

  it('resolves the repo root by its marker file, not by a guess', () => {
    const root = resolveRepoRoot();
    expect(existsSync(path.join(root, 'package.json'))).toBe(true);
    expect(existsSync(path.join(root, 'src', 'generated', 'env-registry.ts'))).toBe(true);
  });
});

describe('doctor engine - each check BITES (synthetic input only)', () => {
  it('ENV-REGISTRY-COVERAGE: an unregistered PAYWAY_ read is reported', () => {
    const synthetic: SourceFile[] = [
      {
        path: 'src/domains/synthetic.ts',
        content: ['const a = process.env.PAYWAY_ZZZ_UNREGISTERED;', 'const b = process.env.PAYWAY_MERCHANT_ID;'].join(
          '\n',
        ),
      },
    ];
    // Registered reads stay silent; the unknown one is the only offender.
    expect(scanUnregisteredEnvVars(synthetic)).toEqual(['src/domains/synthetic.ts:PAYWAY_ZZZ_UNREGISTERED']);

    const gate = runOfflineDoctor([
      syntheticCheck({
        id: 'ENV-REGISTRY-COVERAGE',
        run: () => {
          const offenders = scanUnregisteredEnvVars(synthetic);
          return offenders.length > 0
            ? { status: 'fail', detail: 'unregistered', offenders }
            : { status: 'pass', detail: 'clean' };
        },
      }),
    ]);
    expect(gate.exitCode).toBe(5);
    expect(gate.results[0].outcome.offenders).toContain('src/domains/synthetic.ts:PAYWAY_ZZZ_UNREGISTERED');
  });

  it('TLS-BYPASS-PURGE: a tracked file carrying the bypass string is reported', () => {
    // Built from the scanner's constant so this file never carries the literal
    // (which its own allow-list gate would reject).
    const occurrences = findBypassOccurrences([
      { path: 'src/not-allow-listed.ts', content: `process.env.${TLS_BYPASS_FORBIDDEN} = "0";` },
    ]);
    expect(occurrences).toEqual(['src/not-allow-listed.ts']);
    // And the reused scanner stays silent on a clean file.
    expect(findBypassOccurrences([{ path: 'src/clean.ts', content: 'tlsCaFile' }])).toEqual([]);
  });

  it('RULES-EVIDENCE-FRESH: an official rule whose evidence aged past the window is reported', () => {
    const now = Date.now();
    const aged: RuleDefinition = {
      id: 'SYNTH-OLD',
      statement: 'synthetic',
      endpoints: ['checkout.purchase'],
      severity: 'advisory',
      source: 'official',
      status: 'active',
      evidence: 'knowledge/rules/evidence/SYNTH-OLD.md',
      evidenceUrl: 'https://developer.payway.com.kh/synthetic',
      retrievedAt: new Date(now - 200 * DAY_MS).toISOString().slice(0, 10),
      expiresAt: new Date(now + 100 * DAY_MS).toISOString().slice(0, 10),
      enforcement: [],
    };
    expect(agedOfficialRuleIds([aged], now)).toEqual([`SYNTH-OLD retrievedAt=${aged.retrievedAt}`]);

    // Same age but sandbox-sourced: the window applies to official evidence only.
    expect(agedOfficialRuleIds([{ ...aged, source: 'sandbox' }], now)).toEqual([]);
    // Inside the window: silent.
    expect(
      agedOfficialRuleIds(
        [{ ...aged, retrievedAt: new Date(now - (EVIDENCE_RETENTION_DAYS - 1) * DAY_MS).toISOString().slice(0, 10) }],
        now,
      ),
    ).toEqual([]);
    // An unparseable retrievedAt is itself unusable evidence.
    expect(agedOfficialRuleIds([{ ...aged, retrievedAt: 'not-a-date' }], now)).toHaveLength(1);
  });

  it('ADVISORY-FALLBACK-FREE: a call site without a rule id is reported as file:line', () => {
    const untagged = untaggedAdvisoryCallSites([
      {
        path: 'src/domains/synthetic.ts',
        content: ['// warnAdvisory(config, "commented out");', 'warnAdvisory(config, "msg");'].join('\n'),
      },
    ]);
    // The commented-out mention is not a call site; the real one is line 2.
    expect(untagged).toEqual(['src/domains/synthetic.ts:2']);

    // Explicitly handing over the framework fallback id is the same defect.
    expect(
      untaggedAdvisoryCallSites([
        { path: 'src/domains/synthetic.ts', content: 'warnAdvisory(config, "m", { ruleId: "UNSUPPORTED-TMP" });' },
      ]),
    ).toEqual(['src/domains/synthetic.ts:1']);

    // A tagged call site, and an import of the helper, are both silent.
    expect(
      untaggedAdvisoryCallSites([
        {
          path: 'src/domains/ok.ts',
          content: 'import { warnAdvisory } from "../utils.js";\nwarnAdvisory(config, "m", { ruleId: "GW-CAP-X" });',
        },
      ]),
    ).toEqual([]);
  });

  it('GUARD-COVERAGE: a money path with no guardCliCommand call is reported', () => {
    const syntheticCli = [
      "guardCliCommand('refund',",
      '  resolveEnvironment({}),',
      '  {});',
      "guardCliCommand( 'close-transaction', resolveEnvironment({}), {} );",
    ].join('\n');

    expect(uncoveredMoneyPaths(syntheticCli, ['refund', 'close-transaction', 'payout'])).toEqual(['payout']);
    // Fully guarded: nothing reported.
    expect(uncoveredMoneyPaths(syntheticCli, ['refund', 'close-transaction'])).toEqual([]);
    // A bare mention of the path elsewhere in the file is NOT a guard.
    expect(uncoveredMoneyPaths("const path = 'payout';\n", ['payout'])).toEqual(['payout']);
  });
});

describe('doctor engine - module hygiene', () => {
  const moduleFiles = ['types.ts', 'run.ts', path.join('checks', 'offline.ts')].map((rel) =>
    path.join(DOCTOR_DIR, rel),
  );

  it('is pure: no fetch, one ls-files spawn, no network imports', () => {
    for (const file of moduleFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must not fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not import http/https/net/tls/dns`).not.toMatch(
        /from\s+'node:(https?|net|tls|dns|dgram)'/,
      );
      expect(source, `${file} must not import axios/undici/node-fetch`).not.toMatch(
        /from\s+'[^']*(axios|undici|node-fetch)/,
      );
      // The single sanctioned child process is the tracked-file list.
      const spawns = [...source.matchAll(/\bexecFileSync\s*\(/g)].length;
      const childProcessImports = [...source.matchAll(/node:child_process/g)].length;
      if (file.endsWith('offline.ts')) {
        expect(spawns, 'exactly one spawn (git ls-files -z)').toBe(1);
        expect(childProcessImports, 'child_process imported exactly once').toBe(1);
        expect(source).toContain("['ls-files', '-z']");
      } else {
        expect(spawns, `${file} may not spawn processes`).toBe(0);
        expect(childProcessImports).toBe(0);
      }
      expect(source, `${file} must not exit the process`).not.toMatch(/process\.exit/);
    }
  });

  it('leaves no trace in the temp directory', () => {
    const real = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
    // Hermetic tmpdir: a parallel suite writing its own fixtures can no longer
    // race the snapshot.
    const hermetic = path.join(tmpdir(), `payway-doctor-hermetic-${process.pid}`);
    mkdirSync(hermetic, { recursive: true });
    process.env.TMPDIR = hermetic;
    process.env.TEMP = hermetic;
    process.env.TMP = hermetic;
    try {
      expect(tmpdir()).toBe(hermetic);
      const before = readdirSync(hermetic);
      const report = runOfflineDoctor();
      expect(report.exitCode).toBe(0);
      expect(readdirSync(hermetic).sort()).toEqual([...before].sort());
    } finally {
      if (real.TMPDIR === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = real.TMPDIR;
      if (real.TEMP === undefined) delete process.env.TEMP;
      else process.env.TEMP = real.TEMP;
      if (real.TMP === undefined) delete process.env.TMP;
      else process.env.TMP = real.TMP;
      rmSync(hermetic, { recursive: true, force: true });
    }
  });
});
