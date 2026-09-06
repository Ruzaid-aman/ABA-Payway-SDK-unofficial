import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../cli.js';
import { JOURNAL_VERSION, type JournalEventV1 } from '../journal/types.js';
import { captureConsole } from '../test/test-utils.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let dir: string;

beforeEach(() => {
  // Isolate the credential-profile store: preAction consults APPDATA.
  vi.stubEnv('APPDATA', mkdtempSync(path.join(tmpdir(), 'payway-journal-cli-appdata-')));
  dir = mkdtempSync(path.join(tmpdir(), 'payway-journal-cli-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(path.join(tmpdir(), 'payway-journal-cli-appdata-'), { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

function writeJournal(events: JournalEventV1[]): void {
  writeFileSync(
    path.join(dir, 'journal.jsonl'),
    `${events.map((e) => JSON.stringify(e)).join('\n')}\n`,
    'utf8',
  );
}

let seq = 0;
function ev(partial: Partial<JournalEventV1>): JournalEventV1 {
  seq += 1;
  return {
    version: JOURNAL_VERSION,
    ts: new Date().toISOString(),
    eventId: `e-${seq}`,
    kind: 'execution.request',
    correlationId: 'c-default',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// journal show / timeline / prune
// ---------------------------------------------------------------------------

describe('journal CLI', () => {
  it('show filters by transaction and prints JSON', async () => {
    writeJournal([
      ev({ kind: 'execution.started', correlationId: 'c1', command: 'payway-sdk check-transaction' }),
      ev({ kind: 'execution.request', correlationId: 'c1', transactionId: 'T1', attempt: 0 }),
      ev({ kind: 'status.observed', correlationId: 'c1', transactionId: 'T1', status: 'APPROVED' }),
      ev({ kind: 'status.observed', correlationId: 'c9', transactionId: 'OTHER', status: 'PENDING' }),
    ]);
    const captured = captureConsole();
    await runCli(['journal', 'show', '--dir', dir, '--json', '--tran', 'T1']);
    captured.restore();

    const parsed = JSON.parse(captured.text()) as { shown: number; events: JournalEventV1[] };
    expect(parsed.shown).toBe(2);
    expect(parsed.events.every((e) => e.transactionId === 'T1')).toBe(true);
  });

  it('timeline returns the chronological event history of one transaction', async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const earlier = new Date().toISOString();
    // Written out of order on purpose — timeline must sort by ts.
    writeJournal([
      ev({ kind: 'status.observed', correlationId: 'c2', transactionId: 'T1', status: 'APPROVED', ts: later }),
      ev({ kind: 'execution.request', correlationId: 'c1', transactionId: 'T1', attempt: 0, ts: earlier }),
      ev({ kind: 'execution.request', correlationId: 'cX', transactionId: 'OTHER', attempt: 0, ts: earlier }),
    ]);
    const captured = captureConsole();
    await runCli(['journal', 'timeline', '-t', 'T1', '--dir', dir, '--json']);
    captured.restore();

    const parsed = JSON.parse(captured.text()) as { events: JournalEventV1[] };
    expect(parsed.events.map((e) => e.kind)).toEqual(['execution.request', 'status.observed']);
  });

  it('prune removes events older than the cutoff', async () => {
    const old = ev({ kind: 'execution.request', correlationId: 'old', ts: new Date(Date.now() - 86_400_000 * 5).toISOString() });
    const fresh = ev({ kind: 'execution.request', correlationId: 'fresh' });
    writeJournal([old, fresh]);

    const captured = captureConsole();
    await runCli(['journal', 'prune', '--before', '1', '--dir', dir, '--json']);
    captured.restore();

    const parsed = JSON.parse(captured.text()) as { removed: number; kept: number };
    expect(parsed).toMatchObject({ removed: 1, kept: 1 });
    const remaining = readFileSync(path.join(dir, 'journal.jsonl'), 'utf8');
    expect(remaining).toContain('fresh');
    expect(remaining).not.toContain('old');
  });

  it('records execution.started when PAYWAY_JOURNAL is enabled for the invocation', async () => {
    vi.stubEnv('PAYWAY_JOURNAL', '1');
    vi.stubEnv('PAYWAY_JOURNAL_DIR', dir);

    await runCli(['journal', 'show', '--dir', dir, '--json']);

    const onDisk = readFileSync(path.join(dir, 'journal.jsonl'), 'utf8');
    expect(onDisk).toContain('"execution.started"');
    expect(onDisk).toContain('payway-sdk journal show');
  });

  it('does not journal when neither --journal nor PAYWAY_JOURNAL is set', async () => {
    await runCli(['journal', 'show', '--dir', dir, '--json']);
    expect(existsSyncSafe()).toBe(false);
  });

  function existsSyncSafe(): boolean {
    try {
      return readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').length > 0;
    } catch {
      return false;
    }
  }
});
