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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, getAgentDataPaths } from './storage.js';
import { validateLedger } from './schemas.js';
import type { AgentToolName, ExecutionRecordV1, ExecutionStatus } from './contracts.js';

const LEDGER_VERSION = 'agent-ledger/v1' as const;

const UNFINISHED_STATUSES: readonly ExecutionStatus[] = [
  'planned',
  'confirmed',
  'submitted',
  'outcome_unknown',
];

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

function generateTransactionId(): string {
  return `tx${randomBytes(8).toString('hex')}`;
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
 * submitted -> succeeded. Rejects if the record is not 'submitted'.
 */
export function markSucceeded(id: string, result?: Record<string, unknown>): ExecutionRecordV1 {
  void result;
  return advance(id, 'submitted', 'succeeded');
}

/**
 * submitted -> failed. Rejects if the record is not 'submitted'.
 */
export function markFailed(id: string, error: { code?: string; message: string }): ExecutionRecordV1 {
  return advance(id, 'submitted', 'failed', (record) => {
    record.error = { code: error.code, message: error.message };
  });
}

/**
 * submitted -> outcome_unknown (timeout/abort/network/ambiguous). Rejects if
 * the record is not 'submitted'.
 */
export function markOutcomeUnknown(
  id: string,
  error: { code?: string; message: string },
): ExecutionRecordV1 {
  return advance(id, 'submitted', 'outcome_unknown', (record) => {
    record.error = { code: error.code, message: error.message };
  });
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
