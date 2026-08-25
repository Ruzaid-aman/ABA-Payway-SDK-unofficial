/**
 * Journey helpers shared by polling commands and agent integrations.
 * Pure functions only — trivially testable.
 */

export const POLL_EXIT = {
  /** Command reached a terminal status (see payment_status for the outcome) */
  TERMINAL_REACHED: 0,
  /** Invalid input (bad tran_id format etc.) */
  VALIDATION: 1,
  /** Network / timeout / rate-limit — outcome unknown */
  TIMEOUT_OR_NETWORK: 3,
} as const;

/**
 * Map a terminal poll status to a CLI exit code.
 *
 * Exit-code contract (documented in help + docs/12): the command's job is to
 * observe; reaching ANY terminal status is exit 0. The caller branches on
 * `payment_status` (human) or JSON output (agent). Timeouts/network keep 3.
 */
export function mapPollOutcomeToExitCode(input: {
  terminalReached: boolean;
  abortedReason?: 'max_duration_exceeded' | 'max_consecutive_errors' | 'caller_aborted';
}): number {
  if (input.terminalReached) return POLL_EXIT.TERMINAL_REACHED;
  if (input.abortedReason === 'max_consecutive_errors') return 2; // API-side failures
  return POLL_EXIT.TIMEOUT_OR_NETWORK;
}

/** Format milliseconds as compact m:ss clock text. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
