import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reconcileTransactions } from '../journal/reconcile.js';
import { JOURNAL_VERSION } from '../journal/types.js';

let journalDir: string;
let webhookDir: string;

beforeEach(() => {
  journalDir = mkdtempSync(join(tmpdir(), 'reconcile-journal-'));
  webhookDir = mkdtempSync(join(tmpdir(), 'reconcile-webhook-'));
});

afterEach(() => {
  rmSync(journalDir, { recursive: true, force: true });
  rmSync(webhookDir, { recursive: true, force: true });
});

let seq = 0;
function journalEvent(partial: Record<string, unknown>): string {
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
  writeFileSync(join(journalDir, 'journal.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

function writeWebhookDeliveries(deliveries: Array<Record<string, unknown>>): void {
  writeFileSync(
    join(webhookDir, 'callbacks.jsonl'),
    `${deliveries.map((d) => JSON.stringify(d)).join('\n')}\n`,
    'utf8',
  );
}

describe('reconcileTransactions (Phase 3)', () => {
  it('flags a journal creation with no webhook capture as "without callback"', () => {
    writeJournal([
      journalEvent({ kind: 'execution.request', transactionId: 'T-NO-CB' }),
      journalEvent({ kind: 'execution.response', transactionId: 'T-NO-CB', status: 'PENDING' }),
    ]);

    const report = reconcileTransactions({ journalDir, webhookDir });
    expect(report.summary).toEqual({ total: 1, withCallback: 0, withoutCallback: 1, webhookOnly: 0 });
    const entry = report.transactions[0];
    expect(entry.transactionId).toBe('T-NO-CB');
    expect(entry.callbackReceived).toBe(false);
    expect(entry.lastStatus).toBe('PENDING');
    expect(entry.sources).toEqual(['journal']);
  });

  it('joins a callback captured in the webhook store with its journal creation', () => {
    writeJournal([
      journalEvent({ kind: 'execution.request', transactionId: 'T-PAID' }),
      journalEvent({ kind: 'status.observed', transactionId: 'T-PAID', status: 'APPROVED' }),
    ]);
    writeWebhookDeliveries([
      { body: JSON.stringify({ tran_id: 'T-PAID', status: 'APPROVED' }), receivedAt: new Date().toISOString() },
    ]);

    const report = reconcileTransactions({ journalDir, webhookDir });
    expect(report.summary).toEqual({ total: 1, withCallback: 1, withoutCallback: 0, webhookOnly: 0 });
    const entry = report.transactions[0];
    expect(entry.callbackReceived).toBe(true);
    expect(entry.callbackRoute).toBe('/aba-payway-webhook');
    expect(entry.sources).toEqual(['journal', 'webhook-store']);
  });

  it('counts webhook-only transactions (journal was off when the creation happened)', () => {
    writeWebhookDeliveries([
      { body: JSON.stringify({ tran_id: 'T-ORPHAN', status: 'APPROVED' }), receivedAt: new Date().toISOString() },
    ]);

    const report = reconcileTransactions({ journalDir, webhookDir });
    expect(report.summary).toEqual({ total: 1, withCallback: 1, withoutCallback: 0, webhookOnly: 1 });
    expect(report.transactions[0].sources).toEqual(['webhook-store']);
  });

  it('matches KHQR notifications via their parsed metadata and flags duplicate deliveries', () => {
    writeJournal([
      journalEvent({ kind: 'callback.received', transactionId: 'T-KHQR', status: 'SUCCESS' }),
      journalEvent({ kind: 'callback.received', transactionId: 'T-KHQR', status: 'SUCCESS' }),
    ]);

    const report = reconcileTransactions({ journalDir, webhookDir });
    expect(report.summary.withCallback).toBe(1);
    expect(report.transactions[0].callbackReplaySeen).toBe(true);
  });

  it('prefers the Phase 3 extracted fields on webhook records and flags replay markers', () => {
    writeJournal([journalEvent({ kind: 'execution.request', transactionId: 'T-EXTRACTED' })]);
    writeWebhookDeliveries([
      {
        body: 'raw',
        receivedAt: new Date().toISOString(),
        matchedTransactionId: 'T-EXTRACTED',
        matchedStatus: 'APPROVED',
        replay: true,
      },
    ]);

    const report = reconcileTransactions({ journalDir, webhookDir });
    expect(report.summary.withCallback).toBe(1);
    expect(report.transactions[0].callbackReplaySeen).toBe(true);
  });

  it('tolerates malformed lines on both sides and reports a missing webhook file', () => {
    writeJournal([journalEvent({ transactionId: 'T-1' }), '{broken json']);
    // No callbacks.jsonl written at all.

    const report = reconcileTransactions({ journalDir, webhookDir });
    expect(report.summary.total).toBe(1);
    expect(report.malformedJournalLines).toBe(1);
    expect(report.webhookFile).toBeUndefined();
  });
});
