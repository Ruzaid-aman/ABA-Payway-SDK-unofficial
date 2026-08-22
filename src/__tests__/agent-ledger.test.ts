import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentToolName, ExecutionRecordV1 } from '../agent/contracts.js';
import {
  confirmExecution,
  createExecutionRecord,
  findUnfinishedExecutions,
  LedgerNotFoundError,
  LedgerTransitionError,
  markFailed,
  markOutcomeUnknown,
  markSubmitted,
  markSucceeded,
} from '../agent/ledger.js';
import { getAgentDataPaths } from '../agent/storage.js';

const temporaryDirectories: string[] = [];
const originalAppData = process.env.APPDATA;

const CREATE_TOOLS: AgentToolName[] = [
  'generate_online_qr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
];

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-agent-ledger-'));
  temporaryDirectories.push(directory);
  process.env.APPDATA = directory;
});

afterEach(() => {
  process.env.APPDATA = originalAppData;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function planned(overrides: Partial<Parameters<typeof createExecutionRecord>[0]> = {}) {
  return createExecutionRecord({
    sessionId: 'session-1',
    tool: 'create_payment_link',
    transactionId: 'tx-existing-1',
    ...overrides,
  });
}

describe('createExecutionRecord', () => {
  it('persists a planned record and loads it back', () => {
    const record = planned({ correlation: 'c-1' });
    expect(record.status).toBe('planned');
    expect(record.executionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.correlation).toBe('c-1');

    const onDisk = JSON.parse(
      readFileSync(path.join(getAgentDataPaths().ledgerDir, `${record.executionId}.json`), 'utf8'),
    ) as ExecutionRecordV1;
    expect(onDisk.executionId).toBe(record.executionId);
    expect(onDisk.status).toBe('planned');
  });

  it('accepts a null transactionId in the draft', () => {
    const record = planned({ transactionId: null });
    expect(record.transactionId).toBeNull();
  });

  it('supports every create-action tool', () => {
    for (const tool of CREATE_TOOLS) {
      const record = planned({ tool });
      expect(record.tool).toBe(tool);
    }
  });
});

describe('legal transitions', () => {
  it('planned -> confirmed -> submitted -> succeeded', () => {
    const record = planned();
    const confirmed = confirmExecution(record.executionId, 'corr');
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.correlation).toBe('corr');

    const submitted = markSubmitted(confirmed.executionId);
    expect(submitted.status).toBe('submitted');

    const succeeded = markSucceeded(submitted.executionId, { ok: true });
    expect(succeeded.status).toBe('succeeded');
  });

  it('submitted -> failed', () => {
    const submitted = markSubmitted(confirmExecution(planned().executionId).executionId);
    const failed = markFailed(submitted.executionId, { code: 'E_FAIL', message: 'boom' });
    expect(failed.status).toBe('failed');
    expect(failed.error).toEqual({ code: 'E_FAIL', message: 'boom' });
  });

  it('submitted -> outcome_unknown', () => {
    const submitted = markSubmitted(confirmExecution(planned().executionId).executionId);
    const unknown = markOutcomeUnknown(submitted.executionId, {
      code: 'E_TIMEOUT',
      message: 'no response',
    });
    expect(unknown.status).toBe('outcome_unknown');
    expect(unknown.error).toEqual({ code: 'E_TIMEOUT', message: 'no response' });
  });
});

describe('illegal transitions', () => {
  it('confirm from submitted is rejected', () => {
    const submitted = markSubmitted(confirmExecution(planned().executionId).executionId);
    expect(() => confirmExecution(submitted.executionId)).toThrow(LedgerTransitionError);
  });

  it('submit from planned is rejected', () => {
    const record = planned();
    expect(() => markSubmitted(record.executionId)).toThrow(LedgerTransitionError);
  });

  it('succeed from planned is rejected', () => {
    const record = planned();
    expect(() => markSucceeded(record.executionId)).toThrow(LedgerTransitionError);
  });

  it('double submit is rejected', () => {
    const submitted = markSubmitted(confirmExecution(planned().executionId).executionId);
    expect(() => markSubmitted(submitted.executionId)).toThrow(LedgerTransitionError);
  });

  it('succeed from confirmed is rejected', () => {
    const confirmed = confirmExecution(planned().executionId);
    expect(() => markSucceeded(confirmed.executionId)).toThrow(LedgerTransitionError);
  });

  it('operating on a missing record throws LedgerNotFoundError', () => {
    expect(() => confirmExecution('does-not-exist')).toThrow(LedgerNotFoundError);
  });
});

describe('transactionId materialization', () => {
  it('generates a transactionId on confirm when the draft was null', () => {
    const record = planned({ transactionId: null });
    const confirmed = confirmExecution(record.executionId);
    expect(confirmed.transactionId).not.toBeNull();
    expect(confirmed.transactionId).toMatch(/^tx[0-9a-f]+$/);
  });

  it('keeps an existing transactionId on confirm', () => {
    const record = planned({ transactionId: 'tx-keep-1' });
    const confirmed = confirmExecution(record.executionId);
    expect(confirmed.transactionId).toBe('tx-keep-1');
  });
});

describe('correlation survival', () => {
  it('correlation set on confirm survives later transitions', () => {
    const record = planned();
    const confirmed = confirmExecution(record.executionId, 'corr-xyz');
    const submitted = markSubmitted(confirmed.executionId);
    const succeeded = markSucceeded(submitted.executionId);
    expect(succeeded.correlation).toBe('corr-xyz');
  });
});

describe('findUnfinishedExecutions', () => {
  it('returns only non-terminal records for the session', () => {
    const a = planned({ sessionId: 's1', transactionId: 'tx-a' });
    const b = planned({ sessionId: 's1', transactionId: 'tx-b' });
    const c = planned({ sessionId: 's2', transactionId: 'tx-c' });

    markSubmitted(confirmExecution(a.executionId).executionId);
    markSucceeded(markSubmitted(confirmExecution(b.executionId).executionId).executionId);

    const unfinished = findUnfinishedExecutions('s1');
    const ids = unfinished.map((r) => r.executionId);
    expect(ids).toContain(a.executionId);
    expect(ids).not.toContain(b.executionId);
    expect(ids).not.toContain(c.executionId);
  });

  it('exposes transactionId/merchantRef for idempotent lookup', () => {
    planned({ sessionId: 's1', transactionId: 'tx-lookup' });
    planned({ sessionId: 's1', transactionId: null, merchantRef: 'mref-1' });

    const unfinished = findUnfinishedExecutions('s1');
    expect(unfinished).toHaveLength(2);
    expect(unfinished.some((r) => r.transactionId === 'tx-lookup')).toBe(true);
    expect(unfinished.some((r) => r.merchantRef === 'mref-1')).toBe(true);
  });

  it('includes outcome_unknown as unfinished', () => {
    const submitted = markSubmitted(confirmExecution(planned({ sessionId: 's1' }).executionId).executionId);
    markOutcomeUnknown(submitted.executionId, { message: 'ambiguous' });
    const unfinished = findUnfinishedExecutions('s1');
    expect(unfinished).toHaveLength(1);
    expect(unfinished[0].status).toBe('outcome_unknown');
  });
});
