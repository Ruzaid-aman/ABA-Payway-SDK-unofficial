/**
 * Transaction Journal — types (audit-results/transaction-data-audit/REPORT.md §14).
 *
 * Append-only JSONL record of every PayWay API exchange, opt-in via config
 * `journal` or `PAYWAY_JOURNAL=1`. Closes gaps G1/G3/G4/G11: today the
 * correlation id, duration, attempts, gateway trace id and (sanitized)
 * request/response shapes live only in `_executeFetch` for a few milliseconds
 * before being discarded.
 *
 * Reader contract: unknown `kind` values and unknown optional fields MUST be
 * tolerated — Phase 2+ adds kinds (`execution.started`, `poll.attempt`,
 * `callback.received`, `status.observed`, `artifact.written`) without a
 * version bump; structural changes bump `version`.
 */

export const JOURNAL_VERSION = 'payway-journal/v1' as const;

export type JournalMode = 'digest' | 'full';

/**
 * Event kinds. Phase 1 shipped the transport kinds (request/response/error,
 * emitted by the shared HTTP executor). Phase 2 adds the command/semantic
 * layer: `execution.started` (CLI command / agent turn begins),
 * `poll.attempt` (each poll of a transaction), `status.observed` (normalized
 * payment status reading), and `artifact.written` (agent artifact saved).
 * Phase 3 adds `callback.received` (webhook capture, correlated via the
 * webhook record id). Readers MUST tolerate unknown kinds.
 */
export type JournalEventKind =
  | 'execution.started'
  | 'execution.request'
  | 'execution.response'
  | 'execution.error'
  | 'poll.attempt'
  | 'status.observed'
  | 'artifact.written'
  | 'callback.received';

export interface JournalErrorInfo {
  code?: string;
  message: string;
}

export interface JournalEventV1 {
  version: typeof JOURNAL_VERSION;
  /** ISO-8601 UTC — same clock as every other durable store in this repo. */
  ts: string;
  eventId: string;
  kind: JournalEventKind;
  /** SDK per-exchange correlation id (`_executeFetch` cid) — the join key. */
  correlationId: string;
  /** 0-based retry attempt; present on request/response/error events. */
  attempt?: number;
  /** Agent-mode linkage (populated from Phase 2's agent event emission). */
  executionId?: string;
  sessionId?: string;
  /** `tran_id`/`transaction_id` from the request or response status block. */
  transactionId?: string;
  merchantRef?: string;
  command?: string;
  endpoint?: string;
  httpStatus?: number;
  paywayCode?: string;
  durationMs?: number;
  /** Gateway `status.trace` correlation id. */
  traceId?: string;
  /** Normalized payment status (`poll.attempt` / `status.observed`). */
  status?: string;
  /** Agent artifact linkage (`artifact.written`). */
  artifact?: { artifactId?: string; path?: string };
  /**
   * `'digest'` mode: allow-listed non-secret fields only. `'full'` mode:
   * `sanitizeForLog`-redacted body (hash/pwt/keys masked), size-capped.
   */
  requestDigest?: unknown;
  responseDigest?: unknown;
  error?: JournalErrorInfo;
}

export interface JournalOptions {
  /** Directory holding `journal.jsonl`. Default: `<cwd>/payway-data`. */
  dir?: string;
  /** `'digest'` (default) or `'full'`. Also `PAYWAY_JOURNAL_MODE`. */
  mode?: JournalMode;
  /**
   * Retention guard (improvement I-5): events older than this many days are
   * pruned on write via `pruneJournal`. Also `PAYWAY_JOURNAL_MAX_AGE_DAYS`.
   * Pruning is best-effort and never blocks or fails the emitting call.
   */
  maxAgeDays?: number;
}

export interface ResolvedJournalConfig extends JournalOptions {
  dir: string;
  mode: JournalMode;
}

export interface JournalSink {
  readonly filePath: string;
  emit(event: JournalEventV1): void;
}

/** Event passed by callers; the emitter fills version/ts/eventId. */
export type JournalEmitterInput = Omit<JournalEventV1, 'version' | 'ts' | 'eventId'>;

/**
 * Emitter handed to `PayWay` when journaling is enabled. `mode` drives how
 * much of each body the digest builders keep. Every emit is fail-open:
 * journaling must never fail SDK execution.
 */
export interface JournalContext {
  readonly mode: JournalMode;
  emit(event: JournalEmitterInput): void;
}

export const DEFAULT_JOURNAL_DIR_NAME = 'payway-data';
export const DEFAULT_JOURNAL_FILE_NAME = 'journal.jsonl';
