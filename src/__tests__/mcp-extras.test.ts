import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMcpExtra } from '../mcp/extras.js';
import { JOURNAL_VERSION } from '../journal/types.js';

let tempDir: string;
let journalDir: string;
const prevJournalDir = process.env.PAYWAY_JOURNAL_DIR;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'payway-mcp-extras-'));
  journalDir = path.join(tempDir, 'journal');
  mkdirSync(journalDir, { recursive: true });
  process.env.PAYWAY_JOURNAL_DIR = journalDir;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (prevJournalDir === undefined) delete process.env.PAYWAY_JOURNAL_DIR;
  else process.env.PAYWAY_JOURNAL_DIR = prevJournalDir;
});

/** Writes one full-mode-shaped event (body fields present) into the temp journal. */
function seedFullModeJournal(): void {
  const event = {
    version: JOURNAL_VERSION,
    ts: '2026-09-13T10:00:00.000Z',
    eventId: 'evt-1',
    kind: 'status.observed',
    correlationId: 'cid-1',
    transactionId: 'TRX-1',
    merchantRef: 'ref-1',
    status: 'APPROVED',
    httpStatus: 200,
    paywayCode: '00',
    durationMs: 120,
    command: 'check-transaction',
    endpoint: '/check',
    // Full-mode extras — must NEVER appear in the MCP digest projection:
    requestDigest: { hash: 'hmac-secret-ish' },
    responseDigest: { body: { hash: 'resp-hmac' } },
  };
  writeFileSync(path.join(journalDir, 'journal.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

describe('runMcpExtra — journal_timeline', () => {
  it('projects events to the digest allow-list (bodies never leave the machine)', async () => {
    seedFullModeJournal();
    const result = await runMcpExtra('journal_timeline', { transactionId: 'TRX-1' }, undefined as never);
    expect(result.ok).toBe(true);
    const data = result.data as { events: Array<Record<string, unknown>>; verdict: string };
    expect(data.events).toHaveLength(1);
    const projected = data.events[0];
    expect(projected.transactionId).toBe('TRX-1');
    expect(projected.status).toBe('APPROVED');
    expect(projected).not.toHaveProperty('requestDigest');
    expect(projected).not.toHaveProperty('responseDigest');
    expect(JSON.stringify(data)).not.toContain('hmac-secret-ish');
    expect(typeof data.verdict).toBe('string');
  });

  it('rejects a missing transactionId with VALIDATION', async () => {
    const result = await runMcpExtra('journal_timeline', {}, undefined as never);
    expect(result.ok).toBe(false);
    expect((result.error as { code?: string }).code).toBe('VALIDATION');
  });

  it('honors the kind filter and last-N cap', async () => {
    const lines = ['a', 'b', 'c'].map(
      (suffix, i) =>
        `${JSON.stringify({
          version: JOURNAL_VERSION,
          ts: `2026-09-13T10:00:0${i}.000Z`,
          eventId: `evt-${suffix}`,
          kind: i === 1 ? 'execution.error' : 'status.observed',
          correlationId: `cid-${suffix}`,
          transactionId: 'TRX-2',
        })}\n`,
    );
    writeFileSync(path.join(journalDir, 'journal.jsonl'), lines.join(''), 'utf8');
    const filtered = await runMcpExtra('journal_timeline', { transactionId: 'TRX-2', kind: 'execution.error' }, undefined as never);
    expect((filtered.data as { events: unknown[] }).events).toHaveLength(1);
    const capped = await runMcpExtra('journal_timeline', { transactionId: 'TRX-2', last: 2 }, undefined as never);
    expect((capped.data as { events: unknown[] }).events).toHaveLength(2);
  });
});

describe('runMcpExtra — journal_stats', () => {
  it('returns an ok zeroed report on an empty journal', async () => {
    const result = await runMcpExtra('journal_stats', {}, undefined as never);
    expect(result.ok).toBe(true);
    const data = result.data as { query: string; exchanges: unknown };
    expect(data.query).toBe('stats');
    expect(data.exchanges).toBeDefined();
  });
});

describe('runMcpExtra — list_transactions (local validations only)', () => {
  it('rejects a malformed date with the format hint', async () => {
    const result = await runMcpExtra('list_transactions', { from: '20260813' }, undefined as never);
    expect(result.ok).toBe(false);
    const error = result.error as { code?: string; message: string };
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toContain('YYYY-MM-DD HH:mm:ss');
  });

  it('rejects a window wider than 3 gateway days', async () => {
    const result = await runMcpExtra(
      'list_transactions',
      { from: '2026-09-01 00:00:00', to: '2026-09-10 23:59:59' },
      undefined as never,
    );
    expect(result.ok).toBe(false);
    expect((result.error as { message: string }).message).toContain('3 days');
  });

  it('rejects an out-of-range pagination', async () => {
    const result = await runMcpExtra('list_transactions', { pagination: 2000 }, undefined as never);
    expect(result.ok).toBe(false);
    expect((result.error as { message: string }).message).toContain('1000');
  });
});
