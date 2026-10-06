/**
 * The doctor runner (audit WP-11 / §17.2, §17.4 stage 1).
 *
 * Contract this wave pins down:
 * - a check that THROWS becomes a FAIL carrying the error message (a diagnostic
 *   tool that swallows its own errors is worse than no tool);
 * - results are ordered fails first, then warns, then passes, by id within a
 *   group, so a human reads the actionable rows first;
 * - EVERY check appears in the report, passing ones included (a silently absent
 *   check is indistinguishable from an unrun one);
 * - the exit code is the GATE_BLOCKER value iff at least one check FAILED.
 *
 * Pure module: no CLI imports, no network, no mutation, never terminates the process.
 */
import { EXIT_CODES } from '../../cli/output/contract.js';
import { OFFLINE_CHECKS } from './checks/offline.js';
import type { CheckDefinition, CheckOutcome, CheckStatus } from './types.js';

export interface DoctorReport {
  checksRun: number;
  passed: number;
  warned: number;
  failed: number;
  results: Array<CheckDefinition & { outcome: CheckOutcome }>;
  exitCode: 0 | 5; // 5 (GATE_BLOCKER) iff any FAIL; else 0
}

const STATUS_RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

/** Run one check, converting a throw into a FAIL. Never rethrows. */
function runOne(check: CheckDefinition): CheckDefinition & { outcome: CheckOutcome } {
  try {
    const outcome = check.run();
    return { ...check, outcome };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...check,
      outcome: { status: 'fail', detail: `check threw instead of reporting: ${detail}`, offenders: [] },
    };
  }
}

/**
 * Run the offline tier. `checks` is injectable so a later wave (network/live)
 * and the tests can drive the same runner without touching the CLI.
 */
export function runOfflineDoctor(checks: readonly CheckDefinition[] = OFFLINE_CHECKS): DoctorReport {
  const results = checks
    .map(runOne)
    .sort((a, b) => STATUS_RANK[a.outcome.status] - STATUS_RANK[b.outcome.status] || a.id.localeCompare(b.id));

  return {
    checksRun: results.length,
    passed: results.filter((r) => r.outcome.status === 'pass').length,
    warned: results.filter((r) => r.outcome.status === 'warn').length,
    failed: results.filter((r) => r.outcome.status === 'fail').length,
    results,
    exitCode: results.some((r) => r.outcome.status === 'fail') ? EXIT_CODES.GATE_BLOCKER : EXIT_CODES.OK,
  };
}
