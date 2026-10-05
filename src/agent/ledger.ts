/**
 * Agentic PayWay CLI — execution ledger.
 *
 * Durable, recoverable ledger for non-replayable create operations. Each
 * create action that the agent wants to perform is recorded as an
 * ExecutionRecordV1 and advanced through a strict state machine before the
 * underlying PayWay call is allowed to run. Records are persisted atomically
 * under `getAgentDataPaths().ledgerDir`.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AgentToolName, ExecutionRecordV1, ExecutionStatus } from './contracts.js';
import { scrubSensitive } from './privacy.js';
import { validateLedger } from './schemas.js';
import { atomicWriteJson, getAgentDataPaths } from './storage.js';

const LEDGER_VERSION = 'agent-ledger/v1' as const;

const UNFINISHED_STATUSES: readonly ExecutionStatus[] = ['planned', 'confirmed', 'submitted', 'outcome_unknown'];

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export class LedgerTransitionError extends LedgerError {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerTransitionError';
  }
}

export class LedgerNotFoundError extends LedgerError {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerNotFoundError';
  }
}

interface CreateDraft {
  sessionId: string;
  tool: AgentToolName;
  transactionId: string | null;
  merchantRef?: string;
  correlation?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ledgerDirectory(): string {
  return getAgentDataPaths().ledgerDir;
}

function recordPath(executionId: string): string {
  return path.join(ledgerDirectory(), `${executionId}.json`);
}

/** Loads a record strictly via `validateLedger`; missing/invalid => not-found. */
function loadRecord(executionId: string): ExecutionRecordV1 {
  const file = recordPath(executionId);
  if (!existsSync(file)) {
    throw new LedgerNotFoundError(`No execution record found for id '${executionId}'.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new LedgerNotFoundError(`Execution record '${executionId}' is unreadable.`);
  }
  if (!validateLedger(raw)) {
    throw new LedgerNotFoundError(`Execution record '${executionId}' failed validation.`);
  }
  return raw;
}

function persist(record: ExecutionRecordV1): ExecutionRecordV1 {
  atomicWriteJson(recordPath(record.executionId), record);
  return record;
}

export function generateTransactionId(): string {
  return `tx${randomBytes(8).toString('hex')}`;
}

function scrubLedgerError(
  error: { code?: string; message: string },
  sensitiveValues: string[],
): { code?: string; message: string } {
  return scrubSensitive(error, sensitiveValues) as { code?: string; message: string };
}

function requireStatus(record: ExecutionRecordV1, expected: ExecutionStatus): void {
  if (record.status !== expected) {
    throw new LedgerTransitionError(
      `Cannot transition from '${record.status}' to a state requiring '${expected}' ` +
        `(executionId='${record.executionId}').`,
    );
  }
}

function advance(
  executionId: string,
  expected: ExecutionStatus,
  next: ExecutionStatus,
  mutate?: (record: ExecutionRecordV1) => void,
): ExecutionRecordV1 {
  const record = loadRecord(executionId);
  requireStatus(record, expected);
  if (mutate) mutate(record);
  record.status = next;
  record.updatedAt = nowIso();
  return persist(record);
}

/**
 * Records a new planned execution and persists it before any approval.
 */
export function createExecutionRecord(draft: CreateDraft): ExecutionRecordV1 {
  const at = nowIso();
  const record: ExecutionRecordV1 = {
    version: LEDGER_VERSION,
    executionId: randomUUID(),
    sessionId: draft.sessionId,
    tool: draft.tool,
    transactionId: draft.transactionId,
    merchantRef: draft.merchantRef,
    status: 'planned',
    correlation: draft.correlation,
    createdAt: at,
    updatedAt: at,
  };
  return persist(record);
}

/**
 * planned -> confirmed. Sets correlation and materializes a missing
 * transactionId. Rejects if the record is not 'planned'.
 */
export function confirmExecution(id: string, correlation?: string): ExecutionRecordV1 {
  const record = loadRecord(id);
  requireStatus(record, 'planned');
  if (correlation !== undefined) record.correlation = correlation;
  if (record.transactionId === null) record.transactionId = generateTransactionId();
  record.status = 'confirmed';
  record.updatedAt = nowIso();
  return persist(record);
}

/**
 * confirmed -> submitted. Rejects if the record is not 'confirmed'.
 */
export function markSubmitted(id: string): ExecutionRecordV1 {
  return advance(id, 'confirmed', 'submitted');
}

/**
 * submitted -> succeeded. Stores a scrubbed, allow-listed digest of the tool
 * result (Phase 2 resultSummary) so the ledger answers "what came back",
 * not just "it worked". Rejects if the record is not 'submitted'.
 */
export function markSucceeded(id: string, resultSummary?: Record<string, unknown>): ExecutionRecordV1 {
  return advance(id, 'submitted', 'succeeded', (record) => {
    if (resultSummary) record.resultSummary = resultSummary;
  });
}

/**
 * submitted -> failed. Rejects if the record is not 'submitted'.
 */
export function markFailed(
  id: string,
  error: { code?: string; message: string },
  sensitiveValues: string[] = [],
): ExecutionRecordV1 {
  const safeError = scrubLedgerError(error, sensitiveValues);
  return advance(id, 'submitted', 'failed', (record) => {
    record.error = safeError;
  });
}

/**
 * submitted -> outcome_unknown (timeout/abort/network/ambiguous). Rejects if
 * the record is not 'submitted'.
 */
export function markOutcomeUnknown(
  id: string,
  error: { code?: string; message: string },
  sensitiveValues: string[] = [],
): ExecutionRecordV1 {
  const safeError = scrubLedgerError(error, sensitiveValues);
  return advance(id, 'submitted', 'outcome_unknown', (record) => {
    record.error = safeError;
  });
}

/**
 * Attaches the SDK correlation id (cid) of the exchange that executed this
 * record — the join key into the transaction journal. Idempotent and
 * first-write-wins: an existing correlation is never overwritten, and the
 * record's lifecycle status is untouched. Works from any status because the
 * cid only becomes known after the SDK call has run.
 */
export function attachCorrelation(id: string, correlation: string): ExecutionRecordV1 {
  const record = loadRecord(id);
  if (correlation.length === 0 || record.correlation !== undefined) return record;
  record.correlation = correlation;
  record.updatedAt = nowIso();
  return persist(record);
}

/** Loads one record by id (throws LedgerNotFoundError when missing/invalid). */
export function loadExecutionRecord(executionId: string): ExecutionRecordV1 {
  return loadRecord(executionId);
}

/**
 * I-13: delete FINISHED records (succeeded/failed) for all sessions whose
 * `updatedAt` predates the cutoff — the ledger counterpart of
 * `journal prune`. Unfinished records are NEVER removed (they may still be
 * recoverable), and unparseable files are left untouched. Atomic per file.
 */
export function pruneLedgerRecords(
  before: Date,
  appDataDirectory: string = process.env.APPDATA ?? path.join(homedir(), '.config'),
): { removed: number; kept: number } {
  const dir = path.join(getAgentDataPaths(appDataDirectory).ledgerDir);
  if (!existsSync(dir)) return { removed: 0, kept: 0 };
  const cutoff = before.toISOString();
  let removed = 0;
  let kept = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      kept += 1; // unparseable — never destroy what we cannot read
      continue;
    }
    if (!validateLedger(raw) || !('updatedAt' in (raw as ExecutionRecordV1))) {
      kept += 1;
      continue;
    }
    const record = raw as ExecutionRecordV1;
    if (record.status === 'succeeded' || record.status === 'failed') {
      if (record.updatedAt < cutoff) {
        unlinkSync(file);
        removed += 1;
        continue;
      }
    }
    kept += 1;
  }
  return { removed, kept };
}

/**
 * Returns executions for a session that have not reached a terminal state
 * (succeeded/failed). Exposes transactionId/merchantRef for idempotent lookup
 * without replaying. Never auto-replays.
 */
export function findUnfinishedExecutions(sessionId: string): ExecutionRecordV1[] {
  const dir = ledgerDirectory();
  if (!existsSync(dir)) return [];
  const matches: ExecutionRecordV1[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!validateLedger(raw)) continue;
    if (raw.sessionId !== sessionId) continue;
    if (UNFINISHED_STATUSES.includes(raw.status)) matches.push(raw);
  }
  return matches;
}
