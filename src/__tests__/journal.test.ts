import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { buildRequestDigest, buildResponseDigest, parseRequestBodyPayload } from '../journal/digest.js';
import {
  createJournalEmitter,
  JsonlJournalSink,
  pruneJournal,
  resolveJournalConfig,
} from '../journal/writer.js';
import { JOURNAL_VERSION, type JournalEventV1 } from '../journal/types.js';
import { mockJsonResponse } from '../test/test-utils.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
  retryDelayMs: 1,
  maxRetries: 1,
};

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'payway-journal-'));
}

function readEvents(journalDir: string): JournalEventV1[] {
  const file = path.join(journalDir, 'journal.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JournalEventV1);
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

describe('resolveJournalConfig', () => {
  it('is disabled by default (a library must never write files silently)', () => {
    expect(resolveJournalConfig(undefined, {})).toBeUndefined();
    expect(resolveJournalConfig(undefined, { PAYWAY_JOURNAL: '0' })).toBeUndefined();
  });

  it('enables via config true and fills dir/mode from env', () => {
    const resolved = resolveJournalConfig(true, {
      PAYWAY_JOURNAL_DIR: '/tmp/j',
      PAYWAY_JOURNAL_MODE: 'full',
    });
    expect(resolved).toEqual({ dir: '/tmp/j', mode: 'full' });
  });

  it('explicit false overrides the environment', () => {
    expect(resolveJournalConfig(false, { PAYWAY_JOURNAL: '1' })).toBeUndefined();
  });

  it('env alone enables when config omits the setting', () => {
    const resolved = resolveJournalConfig(undefined, { PAYWAY_JOURNAL: '1' });
    expect(resolved?.mode).toBe('digest');
    expect(resolved?.dir).toContain('payway-data');
  });

  it('config object wins over env but accepts env fallbacks per field', () => {
    const resolved = resolveJournalConfig(
      { dir: '/x' },
      { PAYWAY_JOURNAL_DIR: '/ignored', PAYWAY_JOURNAL_MODE: 'full' },
    );
    expect(resolved).toEqual({ dir: '/x', mode: 'full' });
  });

  it('treats an invalid PAYWAY_JOURNAL_MODE as digest', () => {
    expect(resolveJournalConfig(true, { PAYWAY_JOURNAL_MODE: 'loud'})?.mode).toBe('digest');
  });
});

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

describe('journal writer', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends valid JSONL events with envelope fields filled', () => {
    const emitter = createJournalEmitter({ dir });
    expect(emitter).toBeDefined();
    emitter?.emit({ kind: 'execution.request', correlationId: 'cid1', attempt: 0 });
    const events = readEvents(dir);
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(JOURNAL_VERSION);
    expect(events[0].eventId).toBeTruthy();
    expect(events[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events[0].correlationId).toBe('cid1');
  });

  it('drops events that fail schema validation instead of writing them', () => {
    const emitter = createJournalEmitter({ dir });
    emitter?.emit({ kind: 'bogus' as 'execution.request', correlationId: 'cid1' });
    emitter?.emit({ kind: 'execution.request', correlationId: '' });
    expect(existsSync(path.join(dir, 'journal.jsonl'))).toBe(false);
  });

  it('is fail-open when the file system rejects the write', () => {
    const blocker = path.join(dir, 'not-a-dir');
    writeFileSync(blocker, 'occupied', 'utf8');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sink = new JsonlJournalSink({ dir: blocker, mode: 'digest' });
    expect(() =>
      sink.emit({
        version: JOURNAL_VERSION,
        ts: new Date().toISOString(),
        eventId: 'e1',
        kind: 'execution.request',
        correlationId: 'cid1',
      }),
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Second failure is silent (warn-once).
    sink.emit({
      version: JOURNAL_VERSION,
      ts: new Date().toISOString(),
      eventId: 'e2',
      kind: 'execution.request',
      correlationId: 'cid1',
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Digest builders
// ---------------------------------------------------------------------------

describe('journal digests', () => {
  it('parses JSON and urlencoded request bodies', () => {
    expect(parseRequestBodyPayload('{"tran_id":"T1","amount":5}')).toEqual({ tran_id: 'T1', amount: 5 });
    const urlencoded = parseRequestBodyPayload('tran_id=T2&request_time=20260906120000');
    expect(urlencoded).toEqual({ tran_id: 'T2', request_time: '20260906120000' });
    expect(parseRequestBodyPayload('not a body')).toBeUndefined();
  });

  it('digest mode keeps allow-listed fields and drops secrets/blobs', () => {
    const parsed = parseRequestBodyPayload(
      JSON.stringify({
        merchant_id: 'm1',
        tran_id: 'T1',
        total_amount: 5,
        hash: 'HMAC-BLOB',
        google_pay_token: 'SECRET',
        firstname: 'Alice',
        email: 'alice@example.com',
      }),
    );
    const digest = buildRequestDigest('{"..."}', parsed, 'digest') as Record<string, unknown>;
    expect(digest).toEqual({ merchant_id: 'm1', tran_id: 'T1', total_amount: 5 });
    expect(digest.hash).toBeUndefined();
    expect(digest.firstname).toBeUndefined();
  });

  it('digest mode excludes QR base64 payloads and token fields from responses', () => {
    const digest = buildResponseDigest(
      {
        status: { code: 0, tran_id: 'T1', trace: 'tr-1' },
        qr_string: 'KHQR-VERY-LONG-BASE64',
        qr_image: 'data:image/png;base64,...',
        data: { payment_status: 'PENDING', pwt: 'SECRET-TOKEN', apv: 'apv-1' },
      },
      'digest',
    ) as Record<string, unknown>;
    expect(JSON.stringify(digest)).not.toContain('KHQR-VERY-LONG-BASE64');
    expect(JSON.stringify(digest)).not.toContain('SECRET-TOKEN');
    expect((digest.status as Record<string, unknown>).trace).toBe('tr-1');
    expect((digest.data as Record<string, unknown>).payment_status).toBe('PENDING');
  });

  it('full mode masks secrets via sanitizeForLog and replaces merchant_auth', () => {
    const parsed = parseRequestBodyPayload(
      JSON.stringify({ tran_id: 'T1', hash: 'HMAC', merchant_auth: 'RSA-CIPHERTEXT-BLOB' }),
    );
    const digest = buildRequestDigest('{"..."}', parsed, 'full') as Record<string, unknown>;
    expect(digest.hash).toBe('***HIDDEN***');
    expect(String(digest.merchant_auth)).toContain('ENCRYPTED');
    expect(JSON.stringify(digest)).not.toContain('RSA-CIPHERTEXT-BLOB');
  });

  it('digests FormData by part descriptor without values in digest mode', () => {
    const form = new FormData();
    form.set('merchant_id', 'm1');
    form.set('merchant_auth', 'CIPHERTEXT');
    const digest = buildRequestDigest(form, undefined, 'digest') as { multipart: Array<Record<string, unknown>> };
    expect(digest.multipart).toHaveLength(2);
    expect(digest.multipart[0]).toEqual({ name: 'merchant_id', value: 'm1' });
    expect(digest.multipart[1]).toEqual({ name: 'merchant_auth' });
  });

  it('extracts transaction ids wherever the gateway puts them', () => {
    expect(parseRequestBodyPayload('{"tran_id":"T1"}')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PayWay integration (the _executeFetch emit points)
// ---------------------------------------------------------------------------

describe('PayWay journal integration', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('does not journal when disabled (default)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0, tran_id: 'T1' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay(TEST_CONFIG);
    await payway.checkout.checkTransaction('T1');
    expect(existsSync(path.join(dir, 'journal.jsonl'))).toBe(false);
  });

  it('records request + response with correlation, duration, tran id and trace', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ status: { code: 0, tran_id: 'T1', trace: 'trace-abc' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ ...TEST_CONFIG, journal: { dir } });
    await payway.checkout.checkTransaction('T1');

    const events = readEvents(dir);
    expect(events.map((e) => e.kind)).toEqual(['execution.request', 'execution.response']);

    const [request, response] = events;
    expect(request.attempt).toBe(0);
    expect(request.endpoint).toContain('check-transaction');
    expect(request.transactionId).toBe('T1');
    expect(request.requestDigest).toMatchObject({ tran_id: 'T1' });
    expect(request.requestDigest).not.toHaveProperty('hash');

    expect(response.correlationId).toBe(request.correlationId);
    expect(response.httpStatus).toBe(200);
    expect(typeof response.durationMs).toBe('number');
    expect(response.traceId).toBe('trace-abc');
    expect(response.responseDigest).toMatchObject({ status: { tran_id: 'T1', code: 0 } });
  });

  it('records a per-attempt request and error event on the retry path', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ status: { code: 1, message: 'boom' } }, 500))
      .mockResolvedValueOnce(mockJsonResponse({ status: { code: 0, tran_id: 'T1' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ ...TEST_CONFIG, journal: { dir } });
    await payway.checkout.checkTransaction('T1');

    const events = readEvents(dir);
    expect(events.map((e) => `${e.kind}#${e.attempt}`)).toEqual([
      'execution.request#0',
      'execution.error#0',
      'execution.request#1',
      'execution.response#1',
    ]);
    const error = events[1];
    expect(error.httpStatus).toBe(500);
    // Gateway code 1 classifies to a signature error — the journal carries
    // the SDK's error taxonomy, not just HTTP statuses.
    expect(error.error?.code).toBe('signature_error');
  });

  it('pairs a 200-wrapped business failure with ONE error event carrying the payway code', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ status: { code: 6, message: 'tran_id is invalid', tran_id: 'T1' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ ...TEST_CONFIG, journal: { dir } });
    await expect(payway.checkout.checkTransaction('T1')).rejects.toThrow();

    const events = readEvents(dir);
    expect(events.map((e) => e.kind)).toEqual(['execution.request', 'execution.response', 'execution.error']);
    const error = events[2];
    expect(error.httpStatus).toBe(200);
    expect(error.paywayCode).toBe('6');
    expect(error.correlationId).toBe(events[0].correlationId);
  });

  it('records error events for non-JSON 5xx responses (path where no hook fires)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: () => Promise.resolve('<html>gateway error</html>'),
      headers: new Headers(),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ ...TEST_CONFIG, journal: { dir } });
    await expect(payway.checkout.checkTransaction('T1')).rejects.toThrow();

    // 5xx is retryable: both attempts fail, each journaled separately.
    const events = readEvents(dir);
    expect(events.map((e) => `${e.kind}#${e.attempt}`)).toEqual([
      'execution.request#0',
      'execution.error#0',
      'execution.request#1',
      'execution.error#1',
    ]);
    expect(events[1].httpStatus).toBe(502);
    expect(events[3].httpStatus).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// Prune
// ---------------------------------------------------------------------------

describe('pruneJournal', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes events older than the cutoff and preserves everything else', () => {
    const emitter = createJournalEmitter({ dir });
    emitter?.emit({ kind: 'execution.request', correlationId: 'old' });
    // Backdate the single event, then add a fresh one.
    const file = path.join(dir, 'journal.jsonl');
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
    const old = JSON.parse(lines[0]) as JournalEventV1;
    old.ts = new Date(Date.now() - 86_400_000).toISOString();
    writeFileSync(
      file,
      `${JSON.stringify(old)}\n`,
      'utf8',
    );
    emitter?.emit({ kind: 'execution.request', correlationId: 'new' });

    const result = pruneJournal(new Date(Date.now() - 3_600_000), file);
    expect(result).toEqual({ removed: 1, kept: 1 });
    const remaining = readEvents(dir);
    expect(remaining.map((e) => e.correlationId)).toEqual(['new']);
  });

  it('never destroys malformed lines it cannot parse', () => {
    const file = path.join(dir, 'journal.jsonl');
    writeFileSync(file, '{"ts":"2020-01-01T00:00:00.000Z"}\nnot json at all\n', 'utf8');
    const result = pruneJournal(new Date(), file);
    // The 2020 event is removed by ts; the malformed line survives.
    expect(result.removed).toBe(1);
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('not json at all');
  });

  it('is a no-op for a missing file', () => {
    expect(pruneJournal(new Date(), path.join(dir, 'absent.jsonl'))).toEqual({ removed: 0, kept: 0 });
  });
});
