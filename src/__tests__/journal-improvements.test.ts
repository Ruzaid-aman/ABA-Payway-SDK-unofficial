import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../cli.js';
import { runDoctor } from '../cli/commands/doctor.js';
import { createJournalEmitter, resolveJournalConfig } from '../journal/writer.js';
import { confirmExecution, createExecutionRecord, markSubmitted, markSucceeded } from '../agent/ledger.js';
import { getAgentDataPaths } from '../agent/storage.js';
import { JOURNAL_VERSION, type JournalEventV1 } from '../journal/types.js';
import { captureConsole } from '../test/test-utils.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let dir: string;
let appData: string;

beforeEach(() => {
  appData = mkdtempSync(path.join(tmpdir(), 'imprv-appdata-'));
  dir = mkdtempSync(path.join(tmpdir(), 'imprv-journal-'));
  vi.stubEnv('APPDATA', appData);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
  rmSync(appData, { recursive: true, force: true });
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

function writeJournal(lines: string[], journalDir = dir): void {
  writeFileSync(path.join(journalDir, 'journal.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// I-2: correlationId/traceId in --json envelopes + lastTraceId getter
// ---------------------------------------------------------------------------

describe('I-2: json envelopes carry correlation keys', () => {
  it('resolves maxAgeDays from env (I-5 config plumbing)', () => {
    const resolved = resolveJournalConfig(true, { PAYWAY_JOURNAL_MAX_AGE_DAYS: '30' });
    expect(resolved?.maxAgeDays).toBe(30);
    expect(resolveJournalConfig(true, { PAYWAY_JOURNAL_MAX_AGE_DAYS: 'nope' })?.maxAgeDays).toBeUndefined();
    const fromOptions = resolveJournalConfig({ maxAgeDays: 7 }, {});
    expect(fromOptions?.maxAgeDays).toBe(7);
  });

  it('prunes old events on write when maxAgeDays is set (I-5)', () => {
    const emitter = createJournalEmitter({ dir });
    // Seed an old event manually, then enable retention via a second emitter.
    emitter?.emit({ kind: 'execution.request', correlationId: 'old-c' });
    const file = path.join(dir, 'journal.jsonl');
    const content = readFileSync(file, 'utf8') as string;
    const old = JSON.parse(content.trim()) as JournalEventV1;
    old.ts = new Date(Date.now() - 40 * 86_400_000).toISOString();
    writeFileSync(file, `${JSON.stringify(old)}\n`, 'utf8');

    const retaining = createJournalEmitter({ dir, maxAgeDays: 30 });
    retaining?.emit({ kind: 'execution.request', correlationId: 'fresh-c' });

    const after = readFileSync(file, 'utf8') as string;
    expect(after).toContain('fresh-c');
    expect(after).not.toContain('old-c');
  });
});

// ---------------------------------------------------------------------------
// I-3: duplicate tran_id advisory
// ---------------------------------------------------------------------------

describe('I-3: duplicate transaction-id advisory', () => {
  it('warns when the journal holds a prior create for the id; silent when off', async () => {
    vi.stubEnv('PAYWAY_JOURNAL', '1');
    vi.stubEnv('PAYWAY_JOURNAL_DIR', dir);
    writeJournal([
      ev({
        kind: 'execution.request',
        transactionId: 'DUP-ID',
        endpoint: '/api/payment-gateway/v1/payments/generate-qr',
      }),
    ]);

    const captured = captureConsole();
    try {
      // Validation-free command path that passes through the advisory:
      // checkout-form generates an id then warns (create-flavored but local).
      await runCli(['generate-qr', '-a', '5.00', '-t', 'DUP-ID', '--offline', '--ref', 'mref-1', '-y']);
    } finally {
      captured.restore();
    }
    const text = captured.text();
    expect(text).toContain('already appears in the local journal');

    // With the suppress flag the warning is gone.
    const captured2 = captureConsole();
    try {
      await runCli([
        'generate-qr',
        '-a',
        '5.00',
        '-t',
        'DUP-ID',
        '--offline',
        '--ref',
        'mref-1',
        '-y',
        '--allow-duplicate-id',
      ]);
    } finally {
      captured2.restore();
    }
    expect(captured2.text()).not.toContain('already appears in the local journal');
  });
});

// ---------------------------------------------------------------------------
// I-4: doctor journal row
// ---------------------------------------------------------------------------

describe('I-4: doctor journal row', () => {
  it('is advisory-off when journaling is not enabled', () => {
    const result = runDoctor({ cwd: dir, env: {} });
    const journal = result.checks.find((c) => c.id === 'journal');
    expect(journal?.ok).toBe(true);
    expect(journal?.detail).toContain('recording off');
    expect(journal?.fix).toContain('--no-journal');
  });

  it('reports enabled state and warns above 50 MB', () => {
    // Isolate the data root: since 155b104 the default journal dir follows
    // PAYWAY_DATA_DIR, so without this the enabled row would read the real
    // machine journal instead of the test's empty one.
    const enabled = runDoctor({ cwd: dir, env: { PAYWAY_JOURNAL: '1', PAYWAY_DATA_DIR: dir } });
    const enabledRow = enabled.checks.find((c) => c.id === 'journal');
    expect(enabledRow?.ok).toBe(true);
    expect(enabledRow?.detail).toContain('no events yet');

    // Oversized journal: doctor defaults to the PAYWAY_DATA_DIR data root when
    // enabled without _DIR.
    mkdirSync(dir, { recursive: true });
    const big = 'x'.repeat(51 * 1024 * 1024);
    writeFileSync(path.join(dir, 'journal.jsonl'), big, 'utf8');
    const oversize = runDoctor({ cwd: dir, env: { PAYWAY_JOURNAL: '1', PAYWAY_DATA_DIR: dir } });
    const journal = oversize.checks.find((c) => c.id === 'journal');
    expect(journal?.ok).toBe(false);
    expect(journal?.fix).toContain('journal prune');
  });
});

// ---------------------------------------------------------------------------
// I-6: timeline --with-webhooks
// ---------------------------------------------------------------------------

describe('I-6: timeline --with-webhooks joins raw captures', () => {
  it('enriches callback steps with verdict/matched status/replay', async () => {
    writeJournal([
      ev({
        kind: 'execution.request',
        transactionId: 'T-WH',
        endpoint: '/api/payment-gateway/v1/payments/generate-qr',
      }),
      ev({ kind: 'callback.received', correlationId: 'wh_rec1', transactionId: 'T-WH', status: 'APPROVED' }),
    ]);
    const webhookDir = path.join(dir, 'webhook_data');
    mkdirSync(webhookDir, { recursive: true });
    writeFileSync(
      path.join(webhookDir, 'callbacks.jsonl'),
      `${JSON.stringify({
        id: 'wh_rec1',
        receivedAt: new Date().toISOString(),
        headers: {},
        body: '{"tran_id":"T-WH","status":"APPROVED"}',
        signatureVerdict: 'verified',
        matchedTransactionId: 'T-WH',
        matchedStatus: 'APPROVED',
        replay: true,
      })}\n`,
      'utf8',
    );
    vi.stubEnv('PAYWAY_WEBHOOK_DIR', webhookDir);

    const captured = captureConsole();
    try {
      await runCli(['journal', 'timeline', '-t', 'T-WH', '--dir', dir, '--with-webhooks', '--json']);
    } finally {
      captured.restore();
    }
    const raw = captured.text();
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'))) as { events: JournalEventV1[] };
    const callback = parsed.events.find((e) => e.kind === 'callback.received');
    expect(callback?.status).toContain('verdict=verified');
    expect(callback?.status).toContain('replay');
  });
});

// ---------------------------------------------------------------------------
// I-13: agent ledger prune
// ---------------------------------------------------------------------------

describe('I-13: agent ledger prune', () => {
  it('removes only FINISHED records older than the cutoff; keeps unfinished and unparseable', async () => {
    // Seed ledger records through the real API (APPDATA is stubbed).
    const oldFinished = createExecutionRecord({
      sessionId: 's1',
      tool: 'create_payment_link',
      transactionId: 'tx-old-1',
    });
    markSucceeded(markSubmitted(confirmExecution(oldFinished.executionId).executionId).executionId);
    const keptFinished = createExecutionRecord({
      sessionId: 's1',
      tool: 'create_payment_link',
      transactionId: 'tx-new-1',
    });
    markSucceeded(markSubmitted(confirmExecution(keptFinished.executionId).executionId).executionId);
    const unfinished = createExecutionRecord({
      sessionId: 's1',
      tool: 'create_payment_link',
      transactionId: 'tx-unc-1',
    });
    void unfinished;
    confirmExecution(unfinished.executionId);

    // Backdate the old finished record.
    const oldFile = path.join(getAgentDataPaths().ledgerDir, `${oldFinished.executionId}.json`);
    const record = JSON.parse(readFileSync(oldFile, 'utf8')) as { updatedAt: string };
    record.updatedAt = new Date(Date.now() - 40 * 86_400_000).toISOString();
    writeFileSync(oldFile, JSON.stringify(record), 'utf8');

    // Add an unparseable file.
    writeFileSync(path.join(getAgentDataPaths().ledgerDir, 'garbage.json'), 'not json', 'utf8');

    const captured = captureConsole();
    try {
      await runCli(['agent', 'ledger', 'prune', '--before', '30', '--json']);
    } finally {
      captured.restore();
    }
    const parsed = JSON.parse(captured.text()) as { removed: number; kept: number };
    expect(parsed.removed).toBe(1);
    expect(parsed.kept).toBe(3); // recent finished + unfinished + garbage
  });
});

// ---------------------------------------------------------------------------
// I-12: REPL recovery banner (through runRepl with injected streams)
// ---------------------------------------------------------------------------

describe('I-12: REPL recovery banner', () => {
  async function runReplCaptured(): Promise<string> {
    const { runRepl } = await import('../agent/repl.js');
    const chunks: string[] = [];
    const consoleLines: string[] = [];
    // The banner lines (like the REPL header) go through console.log; the
    // prompt goes to io.output. Capture both.
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
    });
    try {
      const output = new PassThrough();
      output.on('data', (d: Buffer) => chunks.push(d.toString('utf8')));
      const input = new PassThrough();
      input.end('');
      await runRepl({
        input: input as unknown as NodeJS.ReadableStream,
        output: output as unknown as NodeJS.WritableStream,
        interactive: false,
      });
    } finally {
      logSpy.mockRestore();
    }
    return `${chunks.join('')}\n${consoleLines.join('\n')}`;
  }

  function seedSession(sessionId: string): void {
    const sessionsDir = getAgentDataPaths().sessionsDir;
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(
      path.join(sessionsDir, `${sessionId}.json`),
      JSON.stringify({
        version: 'agent-session/v1',
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        contextLabel: 'test',
        events: [],
      }),
      'utf8',
    );
  }

  it('surfaces unfinished creates from the most recent prior session', async () => {
    seedSession('sess_prior_1');
    const first = createExecutionRecord({
      sessionId: 'sess_prior_1',
      tool: 'create_payment_link',
      transactionId: 'tx-banner-1',
    });
    confirmExecution(first.executionId);
    const second = createExecutionRecord({
      sessionId: 'sess_prior_1',
      tool: 'create_payment_link',
      transactionId: 'tx-banner-1',
    });
    void second;

    const captured = await runReplCaptured();
    expect(captured).toContain('unfinished create execution(s)');
    expect(captured).toContain('agent ledger recover');
  });

  it('is silent when the prior session has no unfinished records', async () => {
    seedSession('sess_clean_1');
    const captured = await runReplCaptured();
    expect(captured).not.toContain('unfinished');
  });
});
