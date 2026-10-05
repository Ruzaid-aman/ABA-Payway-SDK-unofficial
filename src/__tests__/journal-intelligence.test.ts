import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectJournalAnomalies, explainTransaction } from '../journal/intelligence.js';
import { reconcileTransactions } from '../journal/reconcile.js';
import { computeJournalStats } from '../journal/stats.js';
import { JOURNAL_VERSION, type JournalEventV1 } from '../journal/types.js';
import type { MaterializedAgentAction } from '../agent/contracts.js';
import { toolRegistry } from '../agent/tools.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'payway-journal-stats-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
function ev(partial: Partial<JournalEventV1>): string {
  seq += 1;
  return JSON.stringify({
    version: JOURNAL_VERSION,
    ts: new Date().toISOString(),
    eventId: `e-${seq}`,
    kind: 'execution.request',
    correlationId: 'c1',
    ...partial,
  });
}

function writeJournal(lines: string[]): void {
  writeFileSync(path.join(dir, 'journal.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

const CREATE_QR = '/api/payment-gateway/v1/payments/generate-qr';
const CHECK = '/api/payment-gateway/v1/payments/check-transaction-2';

describe('computeJournalStats (Phase 4)', () => {
  it('computes latency percentiles per endpoint', () => {
    writeJournal([
      ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: 100 }),
      ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: 200 }),
      ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: 300 }),
      ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: 400 }),
      ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: 900 }),
    ]);

    const report = computeJournalStats({ journalDir: dir });
    const row = report.latency[0];
    expect(row.endpoint).toBe(CREATE_QR);
    expect(row.count).toBe(5);
    expect(row.p50).toBe(300);
    expect(row.p99).toBe(900);
    expect(row.max).toBe(900);
  });

  it('detects retried exchanges by correlation id and computes rates', () => {
    writeJournal([
      ev({ kind: 'execution.request', correlationId: 'x1', endpoint: CREATE_QR }),
      ev({ kind: 'execution.error', correlationId: 'x1', endpoint: CREATE_QR, attempt: 0, httpStatus: 500 }),
      ev({ kind: 'execution.request', correlationId: 'x1', endpoint: CREATE_QR, attempt: 1 }),
      ev({ kind: 'execution.response', correlationId: 'x1', endpoint: CREATE_QR, attempt: 1, durationMs: 120 }),
      ev({ kind: 'execution.request', correlationId: 'x2', endpoint: CHECK }),
      ev({ kind: 'execution.response', correlationId: 'x2', endpoint: CHECK, durationMs: 50 }),
    ]);

    const report = computeJournalStats({ journalDir: dir });
    expect(report.exchanges.total).toBe(2);
    expect(report.exchanges.retried).toBe(1);
    expect(report.exchanges.retryRate).toBe(0.5);
    expect(report.exchanges.failedAttempts).toBe(1);
    const qrRetries = report.retries.find((r) => r.endpoint === CREATE_QR);
    expect(qrRetries).toMatchObject({ exchanges: 1, retried: 1 });
  });

  it('classifies provider vs http vs transport errors and buckets by day', () => {
    const day = new Date().toISOString().slice(0, 10);
    writeJournal([
      ev({ kind: 'execution.error', paywayCode: '35', ts: `${day}T10:00:00.000Z` }),
      ev({ kind: 'execution.error', paywayCode: '35', ts: `${day}T11:00:00.000Z` }),
      ev({ kind: 'execution.error', httpStatus: 502 }),
      ev({ kind: 'execution.error', error: { code: 'network_error', message: 'socket hang up' } }),
    ]);

    const report = computeJournalStats({ journalDir: dir });
    expect(report.topErrors[0]).toMatchObject({ code: '35', kind: 'provider', count: 2 });
    expect(report.topErrors.find((e) => e.code === '502')?.kind).toBe('http');
    expect(report.topErrors.find((e) => e.code === 'network_error')?.kind).toBe('transport');
    expect(report.errorsByDay).toEqual([{ day, errors: 4 }]);
  });

  it('builds the creation → status → callback funnel from the local record', () => {
    writeJournal([
      // T-PAID: created, observed approved, callback received.
      ev({ kind: 'execution.request', correlationId: 'p1', endpoint: CREATE_QR, transactionId: 'T-PAID' }),
      ev({ kind: 'status.observed', transactionId: 'T-PAID', status: 'APPROVED' }),
      ev({ kind: 'callback.received', correlationId: 'wh_1', transactionId: 'T-PAID', status: 'APPROVED' }),
      // T-PENDING: created, only polls seen (poll error attempts must not count as status).
      ev({ kind: 'execution.request', correlationId: 'p2', endpoint: CREATE_QR, transactionId: 'T-PENDING' }),
      ev({ kind: 'poll.attempt', transactionId: 'T-PENDING', attempt: 1, status: 'PENDING', durationMs: 30 }),
      ev({ kind: 'poll.attempt', transactionId: 'T-PENDING', attempt: 2, status: 'ERROR: timeout', durationMs: 30 }),
      // T-DECLINED.
      ev({ kind: 'execution.request', correlationId: 'p3', endpoint: CREATE_QR, transactionId: 'T-DECLINED' }),
      ev({ kind: 'status.observed', transactionId: 'T-DECLINED', status: 'DECLINED' }),
      // T-READONLY: only ever checked (no creation endpoint) — tracked but not a creation.
      ev({ kind: 'execution.request', correlationId: 'p4', endpoint: CHECK, transactionId: 'T-READONLY' }),
    ]);

    const report = computeJournalStats({ journalDir: dir });
    expect(report.funnel).toMatchObject({
      transactionsTracked: 4,
      creationsObserved: 3,
      withObservedStatus: 3,
      approved: 1,
      declined: 1,
      stillPending: 1,
      withCallback: 1,
    });
  });

  it('counts execution.started commands', () => {
    writeJournal([
      ev({ kind: 'execution.started', command: 'payway-sdk journal show' }),
      ev({ kind: 'execution.started', command: 'payway-sdk journal show' }),
      ev({ kind: 'execution.started', command: 'payway-sdk check-transaction' }),
    ]);
    const report = computeJournalStats({ journalDir: dir });
    expect(report.commands[0]).toEqual({ command: 'payway-sdk journal show', count: 2 });
  });
});

describe('explainTransaction (Phase 6)', () => {
  it('narrates an approved transaction with a verified callback', () => {
    writeJournal([
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-1' }),
      ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: 210, traceId: 'tr-9', transactionId: 'T-1' }),
      ev({ kind: 'status.observed', transactionId: 'T-1', status: 'APPROVED' }),
      ev({ kind: 'callback.received', correlationId: 'wh_x', transactionId: 'T-1', status: 'APPROVED' }),
    ]);

    const report = explainTransaction('T-1', { journalDir: dir });
    expect(report.found).toBe(true);
    expect(report.verdict).toContain('APPROVED');
    expect(report.verdict).toContain('webhook record signature verdict');
    expect(report.steps.map((s) => s.title)).toEqual([
      'Creation request sent',
      'Gateway answered HTTP ?',
      'Status observed: APPROVED',
      'Callback received',
    ]);
  });

  it('flags the no-callback case with the never-retried caveat in the verdict', () => {
    writeJournal([
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-2' }),
      ev({ kind: 'status.observed', transactionId: 'T-2', status: 'APPROVED' }),
    ]);

    const report = explainTransaction('T-2', { journalDir: dir });
    expect(report.verdict).toContain('NO callback was captured');
    expect(report.verdict).toContain('never retries missed callbacks');
  });

  it('surfaces gateway hints for provider codes and retry counts', () => {
    writeJournal([
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-3' }),
      ev({
        kind: 'execution.error',
        endpoint: CREATE_QR,
        paywayCode: '35',
        attempt: 0,
        transactionId: 'T-3',
        error: { code: 'api_error', message: 'rejected' },
      }),
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-3', attempt: 1 }),
    ]);

    const report = explainTransaction('T-3', { journalDir: dir });
    expect(report.verdict).toContain('failed before a status was ever observed');
    expect(report.hints.some((h) => h.includes('attempted 2 times'))).toBe(true);
  });

  it('reports not-found for unknown transactions with a gateway-check hint', () => {
    const report = explainTransaction('T-ABSENT', { journalDir: dir });
    expect(report.found).toBe(false);
    expect(report.hints.join(' ')).toContain('check-transaction -t T-ABSENT');
  });
});

describe('detectJournalAnomalies (Phase 6)', () => {
  it('detects an error spike, a retry burst, and a latency outlier', () => {
    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    // Three quiet baseline days: 1 error + 1 retried exchange each.
    for (let d = 0; d < 3; d += 1) {
      const day = new Date(Date.now() - (4 - d) * 86_400_000).toISOString().slice(0, 10);
      lines.push(ev({ kind: 'execution.error', httpStatus: 502, ts: `${day}T10:00:00.000Z` }));
      const cid = `quiet-${d}`;
      lines.push(ev({ kind: 'execution.request', correlationId: cid, endpoint: CHECK, ts: `${day}T09:00:00.000Z` }));
      lines.push(
        ev({ kind: 'execution.request', correlationId: cid, endpoint: CHECK, attempt: 1, ts: `${day}T09:01:00.000Z` }),
      );
    }
    // Today: an error spike (6) and a retry burst (6) against the 1/day baseline.
    for (let i = 0; i < 6; i += 1)
      lines.push(ev({ kind: 'execution.error', httpStatus: 502, ts: `${today}T1${i}:00:00.000Z` }));
    for (let i = 0; i < 6; i += 1) {
      const cid = `burst-${i}`;
      lines.push(
        ev({ kind: 'execution.request', correlationId: cid, endpoint: CHECK, ts: `${today}T09:0${i}:00.000Z` }),
      );
      lines.push(
        ev({
          kind: 'execution.request',
          correlationId: cid,
          endpoint: CHECK,
          attempt: 1,
          ts: `${today}T09:1${i}:00.000Z`,
        }),
      );
    }
    // Latency outlier: 5 samples with p99 >= 3x p50.
    for (const ms of [100, 100, 100, 100, 900]) {
      lines.push(ev({ kind: 'execution.response', endpoint: CREATE_QR, durationMs: ms }));
    }
    writeJournal(lines);

    const report = detectJournalAnomalies({ journalDir: dir });
    const kinds = report.anomalies.map((a) => a.kind);
    expect(kinds).toContain('error-spike');
    expect(kinds).toContain('retry-burst');
    expect(kinds).toContain('latency-outlier');
  });

  it('stays quiet on a healthy journal', () => {
    writeJournal([
      ev({ kind: 'execution.response', endpoint: CHECK, durationMs: 50 }),
      ev({ kind: 'execution.response', endpoint: CHECK, durationMs: 60 }),
    ]);
    expect(detectJournalAnomalies({ journalDir: dir }).anomalies).toEqual([]);
  });
});

describe('query_journal agent tool (Phase 5)', () => {
  beforeEach(() => {
    // The tool resolves the journal dir from the environment (agent runs from
    // the merchant project cwd — here we point it at the fixture) and the
    // webhook store away from the repo's real capture file.
    vi.stubEnv('PAYWAY_JOURNAL', '1');
    vi.stubEnv('PAYWAY_JOURNAL_DIR', dir);
    vi.stubEnv('PAYWAY_WEBHOOK_DIR', path.join(dir, 'webhook_data'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the timeline + RCA verdict for a transaction', async () => {
    writeJournal([
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-TOOL' }),
      ev({ kind: 'status.observed', transactionId: 'T-TOOL', status: 'PENDING' }),
    ]);
    const action = {
      tool: 'query_journal',
      query: 'timeline',
      transactionId: 'T-TOOL',
    } as unknown as MaterializedAgentAction;

    const result = await toolRegistry.query_journal(action, {} as never, {} as never);
    expect(result.ok).toBe(true);
    expect(result.data?.totalEvents).toBe(2);
    expect(result.data?.verdict).toContain('non-terminal');
  });

  it('rejects a timeline query without a transaction id', async () => {
    const action = { tool: 'query_journal', query: 'timeline' } as unknown as MaterializedAgentAction;
    const result = await toolRegistry.query_journal(action, {} as never, {} as never);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('VALIDATION');
  });

  it('serves stats and reconcile queries without a client', async () => {
    writeJournal([
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-S' }),
      ev({ kind: 'callback.received', correlationId: 'wh_9', transactionId: 'T-S', status: 'APPROVED' }),
    ]);

    const stats = await toolRegistry.query_journal(
      { tool: 'query_journal', query: 'stats' } as unknown as MaterializedAgentAction,
      {} as never,
      {} as never,
    );
    expect(stats.ok).toBe(true);
    expect((stats.data as { funnel: { transactionsTracked: number } }).funnel.transactionsTracked).toBe(1);

    const reconcile = await toolRegistry.query_journal(
      { tool: 'query_journal', query: 'reconcile' } as unknown as MaterializedAgentAction,
      {} as never,
      {} as never,
    );
    expect((reconcile.data as { summary: { withCallback: number } }).summary.withCallback).toBe(1);
  });
});

describe('reconcile + stats shared reading layer', () => {
  it('reconcile sees the journal-only callback events (no webhook store needed)', () => {
    writeJournal([
      ev({ kind: 'execution.request', endpoint: CREATE_QR, transactionId: 'T-J' }),
      ev({ kind: 'callback.received', correlationId: 'wh_j', transactionId: 'T-J', status: 'APPROVED' }),
    ]);
    const report = reconcileTransactions({ journalDir: dir, webhookDir: path.join(dir, 'absent') });
    expect(report.summary).toMatchObject({ total: 1, withCallback: 1, withoutCallback: 0 });
  });
});
