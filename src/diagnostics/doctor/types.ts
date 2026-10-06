/**
 * Doctor check model (audit WP-11 / §17).
 *
 * Stage 1 ships the pure check contract plus the OFFLINE tier. The model is
 * deliberately registry-shaped: `CheckDefinition` carries its own severity and
 * the runner maps a FAIL onto the GATE_BLOCKER exit code, so a later wave can
 * add the network/live tiers without changing any check's signature.
 *
 * Pure module: no CLI imports, no network, never terminates the process, no mutation.
 */

export type CheckSeverity = 'info' | 'warning' | 'blocker';
export type CheckCategory = 'offline' | 'network' | 'live'; // stage 1 implements 'offline' only
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckDefinition {
  id: string; // stable, e.g. 'ENV-REGISTRY-COVERAGE'
  category: CheckCategory;
  severity: CheckSeverity; // the severity a FAIL carries
  description: string;
  run: () => CheckOutcome; // must be pure/synchronous for offline checks
}

export interface CheckOutcome {
  status: CheckStatus;
  detail: string; // one human-readable sentence
  /** offending item list; empty on pass */
  offenders?: string[];
}
