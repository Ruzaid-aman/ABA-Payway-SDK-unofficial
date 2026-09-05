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
 * Phase-1 event kinds emitted by the shared HTTP executor. `execution.response`
 * fires for every parsed 2xx body — including 200-wrapped business failures
 * (EC-06 semantics) — and is followed by `execution.error` when
 * `checkResponseError` then rejects the envelope. Error-path throws (HTTP
 * errors, empty-body guard, link-card HTML, JSON-parse failures, network)
 * produce `execution.error` alone, because no integrator hook fires there.
 */
export type JournalEventKind = 'execution.request' | 'execution.response' | 'execution.error';

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
