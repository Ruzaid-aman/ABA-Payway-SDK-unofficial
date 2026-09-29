/**
 * Coverage-driven CLI expansion (2026-09-29 wave).
 *
 * Drives `runCli(argv)` in-process against a localhost mock gateway (same
 * harness contract as cli-mock-commands.test.ts) over command bodies that the
 * existing suites leave uncovered:
 *  - the `journal` group's analytics subcommands (stats/reconcile/explain/
 *    anomalies) and the human/output branches of show/timeline/prune
 *  - the `docs` human-mode branches (list header, unknown/ambiguous topic,
 *    no-hit search)
 *  - `mcp --list-tools` (human + --json, read-only vs --allow-mutations)
 *  - the `webhook` workbench command bodies (status/stop, verify-callback
 *    modes, list/show/resend/trigger) over a seeded capture store
 *  - --json-only validation/preflight branches on refund, payout,
 *    get-transactions-by-ref, generate-checkout, request-qr,
 *    sandbox-beneficiaries, and the self-activation human output
 *
 * Credentials and PAYWAY_BASE_URL are injected via process.env; only
 * non-interactive flag combinations are used, so nothing reads stdin and
 * nothing leaves localhost.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import { signCallbackBody } from '../auth.js';
import { captureConsole, generateTestRsaKeyPair, stripAnsi } from '../test/test-utils.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-gap-'));
const originalCwd = process.cwd();
const originalEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'PAYWAY_BASE_URL',
  'PAYWAY_ENV',
  'PAYWAY_MERCHANT_ID',
  'PAYWAY_API_KEY',
  'PAYWAY_RSA_PUBLIC_KEY',
  'PAYWAY_WEBHOOK_DIR',
  'PAYWAY_PARTNER_ID',
  'PAYWAY_PARTNER_API_KEY',
];

const TEST_RSA = generateTestRsaKeyPair();
const API_KEY = 'b'.repeat(32);

const webhookDir = path.join(tempDir, 'webhook_data');

/** Routes the mock answers; keyed by a url substring. */
const mockRoutes: Record<string, (body: Record<string, unknown>) => { status: number; payload: unknown }> = {};

function seedWebhookStore(records: unknown[]): void {
  mkdirSync(webhookDir, { recursive: true });
  writeFileSync(path.join(webhookDir, 'callbacks.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
}

let seq = 0;
function baseRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  seq += 1;
  return {
    id: `wh_gap_${String(seq).padStart(3, '0')}`,
    receivedAt: new Date().toISOString(),
    headers: { 'content-type': 'application/json', 'user-agent': 'PayWayApp/3.0' },
    body: JSON.stringify({ tran_id: `GAP${seq}`, status: 0, merchant_ref_no: 'ref-gap' }),
    sourceIp: '127.0.0.1',
    signatureVerdict: 'unsigned',
    matchedTransactionId: `GAP${seq}`,
    matchedStatus: '0',
    ...overrides,
  };
}

function mockHandler(req: IncomingMessage, res: ServerResponse, body: string): void {
  const url = req.url ?? '';
  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  if (url.includes('resend-ok')) {
    send(200, { received: true });
    return;
  }
  if (url.includes('resend-bad')) {
    send(500, { error: 'receiver exploded' });
    return;
  }
  if (url.includes('trigger-ok')) {
    send(200, { ok: true });
    return;
  }
  for (const [needle, route] of Object.entries(mockRoutes)) {
    if (url.includes(needle)) {
      const parsed = (() => {
        try {
          return JSON.parse(body) as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })();
      const answer = route(parsed);
      send(answer.status, answer.payload);
      return;
    }
  }
  send(404, { status: { code: 6, message: `no mock route for ${url}` } });
}

let runCli: (argv: string[]) => Promise<void>;
let server: Server;
let baseUrl = '';

beforeAll(async () => {
  process.chdir(tempDir);
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => mockHandler(req, res, Buffer.concat(chunks).toString('utf8')));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  originalEnv.APPDATA = process.env.APPDATA;
  process.env.APPDATA = tempDir;
  process.env.PAYWAY_BASE_URL = baseUrl;
  process.env.PAYWAY_ENV = 'sandbox';
  process.env.PAYWAY_MERCHANT_ID = 'gap-merchant-001';
  process.env.PAYWAY_API_KEY = API_KEY;
  process.env.PAYWAY_RSA_PUBLIC_KEY = TEST_RSA.publicKey;
  process.env.PAYWAY_WEBHOOK_DIR = webhookDir;
  // The docs command resolves the corpus relative to cwd when the packaged
  // lookup misses; this suite chdirs to a temp dir, so pin the override.
  process.env.PAYWAY_KNOWLEDGE_DIR = path.join(originalCwd, 'knowledge');
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  server?.close();
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  if (originalEnv.APPDATA === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalEnv.APPDATA;
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

/** Run one in-process invocation with captured console and restored exitCode. */
async function run(argv: string[]): Promise<{ text: string; stdout: string; stderr: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return {
      text: stripAnsi(captured.text()),
      stdout: stripAnsi(captured.stdout()),
      stderr: stripAnsi(captured.stderr()),
      exitCode: process.exitCode,
    };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

function parseJsonDocument(stdout: string): any {
  return JSON.parse(stdout);
}

// ---------------------------------------------------------------------------
// journal group — analytics subcommands + output branches
// ---------------------------------------------------------------------------

const journalDir = path.join(tempDir, 'journal-gap');

function seedJournal(events: unknown[]): void {
  mkdirSync(journalDir, { recursive: true });
  writeFileSync(path.join(journalDir, 'journal.jsonl'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
}

function journalEvent(partial: Record<string, unknown>): Record<string, unknown> {
  seq += 1;
  return {
    version: 1,
    ts: new Date('2026-09-29T03:00:00.000Z').toISOString(),
    eventId: `gap-${seq}`,
    kind: 'execution.request',
    correlationId: 'gap-cid-1',
    ...partial,
  };
}

describe('journal group expansion (stats/reconcile/explain/anomalies + output branches)', () => {
  it('stats renders the human report over a seeded journal and emits one JSON document under --json', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.started', command: 'payway-sdk check-transaction' }),
      journalEvent({ kind: 'execution.request', transactionId: 'GAP-T1', endpoint: '/check-transaction', attempt: 0 }),
      journalEvent({ kind: 'execution.response', transactionId: 'GAP-T1', endpoint: '/check-transaction', httpStatus: 200, durationMs: 120, correlationId: 'gap-cid-1' }),
      journalEvent({ kind: 'status.observed', transactionId: 'GAP-T1', status: 'APPROVED', endpoint: '/check-transaction' }),
      journalEvent({ kind: 'execution.error', transactionId: 'GAP-T2', httpStatus: 403, paywayCode: '429' }),
    ]);
    const human = await run(['journal', 'stats', '--dir', journalDir]);
    expect(human.stdout).toContain('Exchanges:');
    expect(human.stdout).toContain('Latency (successful responses):');
    expect(human.stdout).toContain('Top errors:');
    expect(human.stdout).toContain('Funnel:');
    expect(human.stdout).toContain('local record only');

    const json = await run(['journal', 'stats', '--dir', journalDir, '--json']);
    const doc = parseJsonDocument(json.stdout);
    expect(doc.exchanges.total).toBeGreaterThan(0);
    expect(doc.funnel.approved).toBe(1);
    expect(doc.topErrors.length).toBeGreaterThan(0);
  });

  it('stats renders zeroed aggregates on an empty journal without crashing', async () => {
    const emptyDir = path.join(tempDir, 'journal-gap-empty');
    mkdirSync(emptyDir, { recursive: true });
    const out = await run(['journal', 'stats', '--dir', emptyDir]);
    expect(out.stdout).toContain('Exchanges: 0 total');
    expect(out.stdout).toContain('0 tracked');
  });

  it('reconcile prints the join report in human form and as JSON', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.started', transactionId: 'GAP-R1', command: 'payway-sdk generate-qr' }),
      journalEvent({ kind: 'execution.started', transactionId: 'GAP-R2', command: 'payway-sdk generate-qr' }),
      journalEvent({ kind: 'callback.received', transactionId: 'GAP-R1', correlationId: 'wh_gap_rec' }),
    ]);
    seedWebhookStore([
      baseRecord({
        id: 'wh_gap_rec',
        signatureVerdict: 'verified',
        signatureSource: 'header',
        matchedTransactionId: 'GAP-R1',
        matchedStatus: '0',
        body: JSON.stringify({ tran_id: 'GAP-R1', status: 0, merchant_ref_no: 'ref-gap' }),
      }),
    ]);
    const human = await run(['journal', 'reconcile', '--dir', journalDir]);
    expect(human.stdout).toContain('Reconcile: 2 transaction(s)');
    expect(human.stdout).toContain('1 with callback');
    expect(human.stdout).toContain('without');
    expect(human.stdout).toContain('A missing callback is NOT proof of non-payment');

    const json = parseJsonDocument((await run(['journal', 'reconcile', '--dir', journalDir, '--json'])).stdout);
    expect(json.summary.total).toBe(2);
    expect(json.summary.withCallback).toBe(1);
    expect(json.summary.webhookOnly).toBe(0);
  });

  it('reconcile flags a replayed callback with the ↺ marker', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.started', transactionId: 'GAP-RE', command: 'payway-sdk generate-qr' }),
      journalEvent({ kind: 'callback.received', transactionId: 'GAP-RE', correlationId: 'wh_gap_replay' }),
    ]);
    seedWebhookStore([baseRecord({ id: 'wh_gap_replay', replay: true, signatureVerdict: 'verified' })]);
    const out = await run(['journal', 'reconcile', '--dir', journalDir]);
    expect(out.stdout).toContain('↺');
  });

  it('explain narrates a found transaction in human form and answers not-found with hints', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.request', transactionId: 'GAP-E1', endpoint: '/generate-qr', attempt: 0 }),
      journalEvent({ kind: 'execution.response', transactionId: 'GAP-E1', httpStatus: 200, durationMs: 80 }),
      journalEvent({ kind: 'status.observed', transactionId: 'GAP-E1', status: 'APPROVED', endpoint: '/check-transaction' }),
    ]);
    const found = await run(['journal', 'explain', '-t', 'GAP-E1', '--dir', journalDir]);
    expect(found.stdout).toContain('Investigation: GAP-E1');
    expect(found.stdout).toContain('Verdict: APPROVED per status reads, but NO callback was captured');
    expect(found.stdout).toContain('PayWay never retries missed callbacks');

    const missing = await run(['journal', 'explain', '-t', 'GAP-NOPE', '--dir', journalDir]);
    expect(missing.stdout).toContain('No journal events found');
    expect(missing.stdout).toContain('check-transaction -t GAP-NOPE');

    const json = parseJsonDocument((await run(['journal', 'explain', '-t', 'GAP-E1', '--dir', journalDir, '--json'])).stdout);
    expect(json.found).toBe(true);
    expect(json.transactionId).toBe('GAP-E1');
    expect(json.steps.length).toBeGreaterThan(0);
  });

  it('explain surfaces the gateway hint for a payway code and the failed-before-status verdict', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.request', transactionId: 'GAP-ERR', endpoint: '/generate-qr', attempt: 0 }),
      journalEvent({ kind: 'execution.error', transactionId: 'GAP-ERR', paywayCode: '49', error: { code: '49', message: 'Invalid Request' } }),
    ]);
    const out = await run(['journal', 'explain', '-t', 'GAP-ERR', '--dir', journalDir]);
    expect(out.stdout).toContain('failed before a status was ever observed');
    expect(out.stdout).toContain('Gateway hint for code 49');
    expect(out.stdout).toContain('Invalid Request');
  });

  it('anomalies stays quiet on a healthy journal and reports the heuristic list', async () => {
    seedJournal([journalEvent({ kind: 'execution.request', transactionId: 'GAP-Q', attempt: 0 })]);
    const quiet = await run(['journal', 'anomalies', '--dir', journalDir]);
    expect(quiet.stdout).toContain('No anomalies detected');

    const json = parseJsonDocument((await run(['journal', 'anomalies', '--dir', journalDir, '--json'])).stdout);
    expect(json.anomalies).toHaveLength(0);
    expect(json.heuristics.length).toBe(3);
  });

  it('anomalies reports an error spike in human form and JSON', async () => {
    const spikeDay = '2026-09-28';
    const events = [
      // Quiet baseline day: one error.
      journalEvent({ kind: 'execution.error', ts: '2026-09-27T10:00:00.000Z', transactionId: 'GAP-B1', httpStatus: 500 }),
      // Spike day: 6 errors.
      ...Array.from({ length: 6 }, (_, i) =>
        journalEvent({ kind: 'execution.error', ts: `${spikeDay}T1${i}:00:00.000Z`, transactionId: `GAP-S${i}`, httpStatus: 500 }),
      ),
    ];
    seedJournal(events);
    const human = await run(['journal', 'anomalies', '--dir', journalDir]);
    expect(human.stdout).toContain('[error-spike]');
    expect(human.stdout).toContain(spikeDay);
    expect(human.stdout).toContain('6 failed attempts');
    expect(human.stdout).toContain('Heuristics:');

    const json = parseJsonDocument((await run(['journal', 'anomalies', '--dir', journalDir, '--json'])).stdout);
    expect(json.anomalies[0].kind).toBe('error-spike');
    expect(json.anomalies[0].baseline).toContain('mean 1.0');
  });

  it('show prints the empty-journal hint in human mode and counts malformed lines without dying on them', async () => {
    const emptyDir = path.join(tempDir, 'journal-gap-show-empty');
    mkdirSync(emptyDir, { recursive: true });
    const empty = await run(['journal', 'show', '--dir', emptyDir]);
    expect(empty.stdout).toContain('No journal events found');
    expect(empty.stdout).toContain('Enable recording with --journal');

    const messy = path.join(tempDir, 'journal-gap-show-messy');
    mkdirSync(messy, { recursive: true });
    writeFileSync(
      path.join(messy, 'journal.jsonl'),
      `${JSON.stringify(journalEvent({ transactionId: 'GAP-M1', status: 'APPROVED' }))}\n{not json at all}\n\n`,
      'utf8',
    );
    const human = await run(['journal', 'show', '--dir', messy]);
    expect(human.stdout).toContain('1 malformed skipped');
    expect(human.stdout).toContain('GAP-M1');

    const json = parseJsonDocument((await run(['journal', 'show', '--dir', messy, '--json'])).stdout);
    expect(json.malformed).toBe(1);
    expect(json.total).toBe(1);
  });

  it('show honors --kind and --last filters', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.request', transactionId: 'GAP-K1' }),
      journalEvent({ kind: 'status.observed', transactionId: 'GAP-K1', status: 'PENDING' }),
      journalEvent({ kind: 'status.observed', transactionId: 'GAP-K1', status: 'APPROVED' }),
    ]);
    const byKind = parseJsonDocument((await run(['journal', 'show', '--kind', 'status.observed', '--dir', journalDir, '--json'])).stdout);
    expect(byKind.shown).toBe(2);

    const lastOne = parseJsonDocument((await run(['journal', 'show', '--last', '1', '--dir', journalDir, '--json'])).stdout);
    expect(lastOne.shown).toBe(1);
    expect(lastOne.events[0].status).toBe('APPROVED');
  });

  it('timeline --with-webhooks enriches callback steps with the persisted verdict', async () => {
    seedJournal([
      journalEvent({ kind: 'execution.request', transactionId: 'GAP-W1', attempt: 0 }),
      journalEvent({ kind: 'callback.received', transactionId: 'GAP-W1', correlationId: 'wh_gap_w1' }),
    ]);
    seedWebhookStore([
      baseRecord({
        id: 'wh_gap_w1',
        signatureVerdict: 'verified',
        signatureSource: 'body',
        matchedStatus: 'APPROVED',
        replay: true,
      }),
    ]);
    const human = await run(['journal', 'timeline', '-t', 'GAP-W1', '--with-webhooks', '--dir', journalDir]);
    expect(human.stdout).toContain('callback.received');
    expect(human.stdout).toContain('verdict=verified');
    expect(human.stdout).toContain('status=APPROVED');
    expect(human.stdout).toContain('replay');

    const withoutJoin = await run(['journal', 'timeline', '-t', 'GAP-W1', '--dir', journalDir]);
    expect(withoutJoin.stdout).not.toContain('verdict=');
  });

  it('timeline answers an empty timeline in human mode', async () => {
    const out = await run(['journal', 'timeline', '-t', 'GAP-UNSEEN', '--dir', journalDir]);
    expect(out.stdout).toContain('No journal events for GAP-UNSEEN');
  });

  it('prune rejects an invalid --before value in human mode with exit 1', async () => {
    const out = await run(['journal', 'prune', '--before', 'not-a-date-or-days', '--dir', journalDir]);
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toContain('Invalid --before value');
  });

  it('prune accepts an ISO-8601 cutoff and reports the JSON shape', async () => {
    const pruneDir = path.join(tempDir, 'journal-gap-prune');
    mkdirSync(pruneDir, { recursive: true });
    writeFileSync(
      path.join(pruneDir, 'journal.jsonl'),
      `${[journalEvent({ transactionId: 'GAP-P1' }), journalEvent({ transactionId: 'GAP-P2' })].map((e) => JSON.stringify(e)).join('\n')}\n`,
      'utf8',
    );
    const result = parseJsonDocument((await run(['journal', 'prune', '--before', '2099-01-01T00:00:00.000Z', '--dir', pruneDir, '--json'])).stdout);
    expect(result.before).toBe('2099-01-01T00:00:00.000Z');
    expect(result.removed).toBe(2);
    expect(result.kept).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// docs group — human-mode branches
// ---------------------------------------------------------------------------

describe('docs command expansion (human branches)', () => {
  it('lists topics with the human header and read/search hints', async () => {
    const out = await run(['docs']);
    expect(out.stdout).toContain('ABA PayWay knowledge base');
    expect(out.stdout).toContain('topics');
    expect(out.stdout).toContain('payway-sdk docs <topic>');
    expect(out.stdout).toContain('payway-sdk docs search <terms>');
  });

  it('rejects an unknown topic in human mode with exit 1', async () => {
    const out = await run(['docs', 'definitely-not-a-topic-gap']);
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toContain('Unknown knowledge topic');
    expect(out.stdout).toContain('docs list');
  });

  it('reports ambiguous prefixes in human mode and via the --json envelope', async () => {
    const human = await run(['docs', 'c']);
    expect(human.stdout).toContain('matches several topics');
    expect(human.stdout).toContain('be more specific');
    expect(human.exitCode).toBe(1);

    const json = parseJsonDocument((await run(['docs', 'c', '--json'])).stdout);
    expect(json.error.kind).toBe('validation');
    expect(json.error.message).toContain('matches several topics');
  });

  it('answers a no-hit search in human mode with a shorter-terms hint', async () => {
    const out = await run(['docs', 'search', 'zzzqqqxxx']);
    expect(out.stdout).toContain('No hits');
    expect(out.stdout).toContain('docs search lifetime');
  });

  it('errors when search has no terms in human mode', async () => {
    const out = await run(['docs', 'search']);
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toContain('docs search requires at least one search term');
  });
});

// ---------------------------------------------------------------------------
// mcp --list-tools
// ---------------------------------------------------------------------------

describe('mcp --list-tools expansion', () => {
  it('prints the read-only catalog as an aligned table with the mode footer', async () => {
    const out = await run(['mcp', '--list-tools']);
    expect(out.stdout).toContain('query_knowledge');
    expect(out.stdout).toContain('[read-only]');
    expect(out.stdout).toContain('12 tools');
    expect(out.stdout).toContain('use --allow-mutations');
  });

  it('lists the mutation tools under --allow-mutations (17 total)', async () => {
    const out = await run(['mcp', '--list-tools', '--allow-mutations']);
    expect(out.stdout).toContain('MUTATION');
    expect(out.stdout).toContain('17 tools');
    expect(out.stdout).toContain('mutations ON');
  });

  it('emits one JSON array with name/readOnly/source under --json', async () => {
    const doc = parseJsonDocument((await run(['mcp', '--list-tools', '--json'])).stdout);
    expect(Array.isArray(doc)).toBe(true);
    expect(doc).toHaveLength(12);
    for (const tool of doc) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.readOnly).toBe('boolean');
      expect(tool.source).toBeDefined();
    }
    expect(doc.some((t: { name: string }) => t.name === 'create_qr')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// webhook workbench command bodies
// ---------------------------------------------------------------------------

function receiverStateFile(): string {
  const dir = path.join(tempDir, 'aba-payway-sdk', 'data', 'webhook_data');
  mkdirSync(dir, { recursive: true });
  return path.join(dir, 'receiver.json');
}

describe('webhook workbench expansion (status/stop/verify/list/show/resend/trigger)', () => {
  afterEach(() => {
    rmSync(receiverStateFile(), { force: true });
  });

  it('status reports an absent receiver in human mode and as JSON', async () => {
    const human = await run(['webhook', 'status']);
    expect(human.stdout).toContain('Webhook receiver: absent');

    const json = parseJsonDocument((await run(['webhook', 'status', '--json'])).stdout);
    expect(json.state).toBe('absent');
    expect(json.receiver).toBeNull();
  });

  it('status distinguishes a live receiver (running) from a dead pid (stale)', async () => {
    writeFileSync(
      receiverStateFile(),
      `${JSON.stringify({
        version: 1,
        pid: process.pid,
        port: 45677,
        publicBaseUrl: null,
        callbackUrl: null,
        previousCallbackUrl: null,
        startedAt: new Date().toISOString(),
      })}\n`,
      'utf8',
    );
    const running = parseJsonDocument((await run(['webhook', 'status', '--json'])).stdout);
    expect(running.state).toBe('running');
    expect(running.receiver.port).toBe(45677);

    writeFileSync(
      receiverStateFile(),
      `${JSON.stringify({ version: 1, pid: 999999999, port: 45678, startedAt: new Date().toISOString() })}\n`,
      'utf8',
    );
    const stale = parseJsonDocument((await run(['webhook', 'status', '--json'])).stdout);
    expect(stale.state).toBe('stale');
  });

  it('treats a corrupt receiver state file as absent instead of crashing', async () => {
    writeFileSync(receiverStateFile(), '{broken json', 'utf8');
    const json = parseJsonDocument((await run(['webhook', 'status', '--json'])).stdout);
    expect(json.state).toBe('absent');
  });

  it('stop is a no-op when no receiver runs, and kills+clears a recorded one', async () => {
    const absent = parseJsonDocument((await run(['webhook', 'stop', '--json'])).stdout);
    expect(absent).toEqual({ stopped: false, state: 'absent' });

    writeFileSync(
      receiverStateFile(),
      `${JSON.stringify({ version: 1, pid: 999999999, port: 45679, startedAt: new Date().toISOString() })}\n`,
      'utf8',
    );
    const stopped = parseJsonDocument((await run(['webhook', 'stop', '--json'])).stdout);
    expect(stopped.stopped).toBe(true);
    expect(stopped.pid).toBe(999999999);
    expect(existsSync(receiverStateFile())).toBe(false);
    const human = await run(['webhook', 'stop']);
    expect(human.stdout).toContain('not running');
  });

  it('verify-callback rejects missing inputs with validation envelopes under --json', async () => {
    const noSig = parseJsonDocument((await run(['webhook', 'verify-callback', '--body', '{}', '--json'])).stdout);
    expect(noSig.error.kind).toBe('validation');
    expect(noSig.error.message).toContain('--sig');

    // The env key would otherwise satisfy the API-key check (set in beforeAll).
    const savedKey = process.env.PAYWAY_API_KEY;
    delete process.env.PAYWAY_API_KEY;
    try {
      const noKey = parseJsonDocument((await run(['webhook', 'verify-callback', '--body', '{}', '--sig', 'abc', '--json'])).stdout);
      expect(noKey.error.message).toContain('API key');
    } finally {
      process.env.PAYWAY_API_KEY = savedKey;
    }

    // (The bare no-body branch reads stdin, which never closes under the
    // vitest runner — covered by the CLI child-process suites instead.)

    const badJson = parseJsonDocument((await run(['webhook', 'verify-callback', '--body', '{nope', '--sig', 'abc', '--api-key', 'k', '--json'])).stdout);
    expect(badJson.error.message).toContain('not valid JSON');
  });

  it('verify-callback validates a signed body round-trip and rejects a wrong signature with exit 1', async () => {
    // The gateway contract: the `hash` field carries the signature of the body
    // WITHOUT the hash key; the verifier strips it before recomputing.
    const unsigned = { tran_id: 'GAP-SIG', status: '0' };
    const signature = signCallbackBody(unsigned, API_KEY);
    const body = { ...unsigned, hash: signature };
    const ok = parseJsonDocument(
      (await run(['webhook', 'verify-callback', '--body', JSON.stringify(body), '--sig', signature, '--api-key', API_KEY, '--json'])).stdout,
    );
    expect(ok.valid).toBe(true);
    expect(ok.tranId).toBe('GAP-SIG');

    const bad = parseJsonDocument(
      (await run(['webhook', 'verify-callback', '--body', JSON.stringify(body), '--sig', 'wrong-signature', '--api-key', API_KEY, '--json'])).stdout,
    );
    expect(bad.valid).toBe(false);
    expect(bad.reason).toBe('signature_mismatch');
  });

  it('verify-callback --record reports the persisted verdict without re-checking', async () => {
    seedWebhookStore([
      baseRecord({ id: 'wh_gap_ver', signatureVerdict: 'verified', signatureSource: 'header', matchedTransactionId: 'GAP-V', matchedStatus: 'APPROVED' }),
      baseRecord({ id: 'wh_gap_inv', signatureVerdict: 'invalid', verificationReason: 'signature_mismatch' }),
      baseRecord({ id: 'wh_gap_uns' }),
    ]);
    const ok = parseJsonDocument((await run(['webhook', 'verify-callback', '--record', 'wh_gap_ver', '--json'])).stdout);
    expect(ok.verdict).toBe('verified');
    expect(ok.signatureSource).toBe('header');
    expect(ok.matchedStatus).toBe('APPROVED');

    const invalid = await run(['webhook', 'verify-callback', '--record', 'wh_gap_inv', '--json']);
    expect(parseJsonDocument(invalid.stdout).verdict).toBe('invalid');
    expect(invalid.exitCode).toBe(1);

    const unsigned = parseJsonDocument((await run(['webhook', 'verify-callback', '--record', 'wh_gap_uns', '--json'])).stdout);
    expect(unsigned.verdict).toBe('unsigned');

    const human = await run(['webhook', 'verify-callback', '--record', 'wh_gap_ver']);
    expect(human.stdout).toContain('Captured webhook record');
    expect(human.stdout).toContain('verified (header-hash)');
  });

  it('verify-callback --record validates the id shape and existence', async () => {
    const badShape = await run(['webhook', 'verify-callback', '--record', 'nothwh_x', '--json']);
    expect(badShape.exitCode).toBe(1);
    expect(parseJsonDocument(badShape.stdout).error.message).toContain('invalid webhook record id');

    const missing = await run(['webhook', 'verify-callback', '--record', 'wh_gap_missing', '--json']);
    expect(parseJsonDocument(missing.stdout).error.message).toContain('not found');

    const humanMissing = await run(['webhook', 'verify-callback', '--record', 'wh_gap_missing']);
    expect(humanMissing.stdout).toContain('webhook list');
  });

  it('list prints records newest-first in human mode and the trimmed envelope under --json', async () => {
    seedWebhookStore([baseRecord(), baseRecord({ id: 'wh_gap_newest', matchedTransactionId: 'GAP-NEW' })]);
    const human = await run(['webhook', 'list', '--limit', '1']);
    expect(human.stdout).toContain('Captured webhook records');
    expect(human.stdout).toContain('wh_gap_newest');
    expect(human.stdout).not.toContain('wh_gap_00');

    const json = parseJsonDocument((await run(['webhook', 'list', '--json'])).stdout);
    expect(json.count).toBe(2);
    expect(json.records[0]).toHaveProperty('signatureVerdict');
  });

  it('show prints the full record including headers and pretty body; bad ids fail validation', async () => {
    seedWebhookStore([baseRecord({ id: 'wh_gap_show' })]);
    const human = await run(['webhook', 'show', '--record', 'wh_gap_show']);
    expect(human.stdout).toContain('Headers');
    expect(human.stdout).toContain('user-agent: PayWayApp/3.0');
    expect(human.stdout).toContain('tran_id');
    expect(human.stdout).toContain('unsigned');

    const badShape = await run(['webhook', 'show', '--record', 'junk', '--json']);
    expect(parseJsonDocument(badShape.stdout).error.message).toContain('invalid webhook record id');

    const missing = await run(['webhook', 'show', '--record', 'wh_gap_none', '--json']);
    expect(parseJsonDocument(missing.stdout).error.message).toContain('not found');
  });

  it('resend re-POSTs the stored body with the original signature header (200 → ok, 500 → exit 3)', async () => {
    seedWebhookStore([
      baseRecord({
        id: 'wh_gap_send',
        headers: { 'x-payway-hmac-sha512': 'sig-value', 'content-type': 'application/json' },
        signatureVerdict: 'verified',
      }),
    ]);
    const ok = parseJsonDocument((await run(['webhook', 'resend', '--record', 'wh_gap_send', '--to', `${baseUrl}/resend-ok`, '--json'])).stdout);
    expect(ok.httpStatus).toBe(200);
    expect(ok.ok).toBe(true);

    const failing = await run(['webhook', 'resend', '--record', 'wh_gap_send', '--to', `${baseUrl}/resend-bad`, '--json']);
    expect(failing.exitCode).toBe(3);
    expect(parseJsonDocument(failing.stdout).httpStatus).toBe(500);

    const human = await run(['webhook', 'resend', '--record', 'wh_gap_send', '--to', `${baseUrl}/resend-ok`, '--forward-headers', 'X-Extra: 1']);
    expect(human.stdout).toContain('Resending captured webhook');
    expect(human.stdout).toContain('delivered [HTTP 200]');
  });

  it('resend surfaces transport failures as network errors with exit 3', async () => {
    seedWebhookStore([baseRecord({ id: 'wh_gap_dead' })]);
    const out = await run(['webhook', 'resend', '--record', 'wh_gap_dead', '--to', 'http://127.0.0.1:9/nope', '--json']);
    expect(out.exitCode).toBe(3);
    const doc = parseJsonDocument(out.stdout);
    expect(doc.error.kind).toBe('network');
  });

  it('resend validates the record id and existence before any network call', async () => {
    const badShape = await run(['webhook', 'resend', '--record', 'garbage', '--to', `${baseUrl}/resend-ok`, '--json']);
    expect(badShape.exitCode).toBe(1);
    expect(parseJsonDocument(badShape.stdout).error.message).toContain('invalid webhook record id');

    seedWebhookStore([]);
    const missing = await run(['webhook', 'resend', '--record', 'wh_gap_gone', '--to', `${baseUrl}/resend-ok`, '--json']);
    expect(missing.exitCode).toBe(1);
    expect(parseJsonDocument(missing.stdout).error.message).toContain('not found');
  });

  it('trigger delivers a signed fixture and reports the json envelope; the network failure path exits 3', async () => {
    const ok = parseJsonDocument(
      (await run(['webhook', 'trigger', '--url', `${baseUrl}/trigger-ok`, '-t', 'GAP-TRG', '--json'])).stdout,
    );
    expect(ok.event).toBe('payment.approved');
    expect(ok.signed).toBe(true);
    expect(ok.signatureChannel).toBe('header');
    expect(ok.tranId).toBe('GAP-TRG');
    expect(ok.ok).toBe(true);

    const human = await run(['webhook', 'trigger', '--url', `${baseUrl}/trigger-ok`, '-t', 'GAP-TRG2', '--api-key', API_KEY]);
    expect(human.stdout).toContain('Triggering fixture webhook');
    expect(human.stdout).toContain('yes (X-PAYWAY-HMAC-SHA512)');
    expect(human.stdout).toContain('the gateway never saw this tran_id');

    const dead = await run(['webhook', 'trigger', '--url', 'http://127.0.0.1:9/nope', '--json']);
    expect(dead.exitCode).toBe(3);
    expect(parseJsonDocument(dead.stdout).error.kind).toBe('network');
  });

  it('trigger validates unknown events and non-positive amounts locally', async () => {
    const badEvent = await run(['webhook', 'trigger', '--url', `${baseUrl}/trigger-ok`, '--event', 'nope.nope', '--json']);
    expect(badEvent.exitCode).toBe(1);
    expect(parseJsonDocument(badEvent.stdout).error.message).toContain('unknown fixture event');

    const badAmount = await run(['webhook', 'trigger', '--url', `${baseUrl}/trigger-ok`, '-a', '-5', '--json']);
    expect(badAmount.exitCode).toBe(1);
    expect(parseJsonDocument(badAmount.stdout).error.message).toContain('positive number');
  });
});

// ---------------------------------------------------------------------------
// Machine-output and validation branches on the API commands
// ---------------------------------------------------------------------------

describe('API command validation/preflight expansion', () => {
  it('get-transactions-by-ref prints rows under --json and warns at the 50-row cap', async () => {
    mockRoutes['get-transactions-by-mc-ref'] = () => ({
      status: 200,
      payload: {
        status: { code: '00', message: 'Success' },
        data: Array.from({ length: 50 }, (_, i) => ({ transaction_id: `BYREF-${i}`, payment_status: 'APPROVED' })),
      },
    });
    const json = parseJsonDocument((await run(['get-transactions-by-ref', '-r', 'byref-gap', '--json'])).stdout);
    expect(json.rows.length).toBe(50);
    expect(json.merchantRef).toBe('byref-gap');

    const human = await run(['get-transactions-by-ref', '-r', 'byref-gap']);
    expect(human.stderr).toContain('50 rows returned (endpoint cap)');
  });

  it('get-transactions-by-ref emits the error envelope when the gateway rejects', async () => {
    mockRoutes['get-transactions-by-mc-ref'] = () => ({
      status: 403,
      payload: { status: { code: 'PTL04', message: 'Parameter validation required' } },
    });
    const out = await run(['get-transactions-by-ref', '-r', 'byref-gap', '--json']);
    const doc = parseJsonDocument(out.stdout);
    expect(doc.error.kind).toBeDefined();
    expect(out.exitCode).toBe(doc.error.exitCode);
  });

  it('refund --json preflight refuses when nothing remains refundable', async () => {
    mockRoutes['transaction-detail'] = (body) => ({
      status: 200,
      payload: {
        status: { code: '00', message: 'Success', tran_id: body.tran_id },
        data: {
          payment_status: 'REFUNDED',
          payment_status_code: 3,
          original_amount: 10,
          original_currency: 'USD',
          payment_amount: 10,
          payment_currency: 'USD',
          refund_amount: 10,
          transaction_operations: [],
        },
      },
    });
    const out = await run(['refund', '-t', 'GAP-ZERO', '-a', '1', '-y', '--json']);
    expect(out.exitCode).toBe(1);
    const doc = parseJsonDocument(out.stdout);
    expect(doc.error.message).toContain('Nothing left to refund');
    expect(doc.error.message).toContain('--no-preflight');
  });

  it('refund --json preflight refuses an over-refund and names the remaining balance', async () => {
    mockRoutes['transaction-detail'] = (body) => ({
      status: 200,
      payload: {
        status: { code: '00', message: 'Success', tran_id: body.tran_id },
        data: {
          payment_status: 'APPROVED',
          payment_status_code: 0,
          original_amount: 10,
          original_currency: 'USD',
          payment_amount: 10,
          payment_currency: 'USD',
          refund_amount: 2,
          transaction_operations: [],
        },
      },
    });
    const out = await run(['refund', '-t', 'GAP-OVER', '-a', '9', '-y', '--json']);
    expect(out.exitCode).toBe(1);
    const doc = parseJsonDocument(out.stdout);
    expect(doc.error.message).toContain('exceeds remaining refundable balance 8');
  });

  it('generate-checkout rejects a bad currency locally in human and --json modes', async () => {
    const human = await run(['generate-checkout', '-a', '5', '-c', 'EUR', '--return-url', 'https://example.com/ok', '--cancel-url', 'https://example.com/no', '-y']);
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toContain('Currency must be USD or KHR');

    const json = parseJsonDocument(
      (await run(['generate-checkout', '-a', '5', '-c', 'EUR', '--return-url', 'https://example.com/ok', '--cancel-url', 'https://example.com/no', '-y', '--json'])).stdout,
    );
    expect(json.error.kind).toBe('validation');
    expect(json.error.message).toContain('Currency must be USD or KHR');
  });

  it('generate-checkout rejects invalid --payment-gate and --skip-success-page values before any network call', async () => {
    const gate = await run(['generate-checkout', '-a', '5', '-c', 'USD', '--return-url', 'https://example.com/ok', '--cancel-url', 'https://example.com/no', '--payment-gate', '2', '-y', '--json']);
    expect(gate.exitCode).toBe(1);
    expect(parseJsonDocument(gate.stdout).error.message).toContain('--payment-gate must be 0 or 1');

    const skip = await run(['generate-checkout', '-a', '5', '-c', 'USD', '--return-url', 'https://example.com/ok', '--cancel-url', 'https://example.com/no', '--skip-success-page', '9', '-y', '--json']);
    expect(skip.exitCode).toBe(1);
    expect(parseJsonDocument(skip.stdout).error.message).toContain('--skip-success-page must be 0 or 1');
  });

  it('payout local validation failures emit the --json envelope and exit 1', async () => {
    const badCurrency = await run(['payout', '-t', 'GAP-PO', '-a', '5', '-c', 'EUR', '-b', '500000001:5', '--json']);
    expect(badCurrency.exitCode).toBe(1);
    expect(parseJsonDocument(badCurrency.stdout).error.message).toContain('Currency must be USD or KHR');

    const badAmount = await run(['payout', '-t', 'GAP-PO', '-a', '0', '-c', 'USD', '-b', '500000001:5', '--json']);
    expect(badAmount.exitCode).toBe(1);
    expect(parseJsonDocument(badAmount.stdout).error.message).toContain('Amount must be a positive number');

    const badEntry = await run(['payout', '-t', 'GAP-PO', '-a', '5', '-c', 'USD', '-b', 'no-colon-here', '--json']);
    expect(badEntry.exitCode).toBe(1);
    expect(parseJsonDocument(badEntry.stdout).error.message).toContain('invalid beneficiary');

    const badCustomFields = await run(['payout', '-t', 'GAP-PO', '-a', '5', '-c', 'USD', '-b', '500000001:5', '--custom-fields', '{oops', '--json']);
    expect(badCustomFields.exitCode).toBe(1);
    expect(parseJsonDocument(badCustomFields.stdout).error.message).toContain('--custom-fields is not valid JSON');

    const humanBadAmount = await run(['payout', '-t', 'GAP-PO', '-a', 'x', '-c', 'USD', '-b', '500000001:5']);
    expect(humanBadAmount.stdout).toContain('Amount must be a positive number');
  });

  it('sandbox-beneficiaries filters by currency and rejects anything else', async () => {
    const bad = await run(['sandbox-beneficiaries', '--currency', 'EUR']);
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout).toContain('--currency must be USD or KHR');

    const human = await run(['sandbox-beneficiaries']);
    expect(human.stdout).toContain('Sandbox beneficiaries');
    expect(human.stdout).toContain('USD accounts (9-digit)');

    const filtered = parseJsonDocument((await run(['sandbox-beneficiaries', '--currency', 'KHR', '--json'])).stdout);
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.every((b: { currencies: string[] }) => b.currencies.includes('KHR'))).toBe(true);
  });

  it('request-qr answers --json with the soundbox envelope and renders the human summary', async () => {
    mockRoutes['request-qr'] = () => ({
      status: 200,
      payload: { status: { code: '00', message: 'Success' }, qr_string: '00020101021229zz-gap-soundbox' },
    });
    const json = parseJsonDocument((await run(['request-qr', '-c', 'USD', '--payment-option', 'abapay', '--callback-url', 'https://example.com/cb', '-a', '3.5', '-y', '--json'])).stdout);
    expect(json.status.code).toBe('00');

    const human = await run(['request-qr', '-c', 'USD', '--payment-option', 'abapay', '--callback-url', 'https://example.com/cb', '-a', '3.5', '--no-save-image', '-y']);
    expect(human.stdout).toContain('Soundbox QR created');
    expect(human.stdout).toContain('QR String:');

    const keypad = await run(['request-qr', '-c', 'USD', '--payment-option', 'abapay', '--callback-url', 'https://example.com/cb', '--no-save-image', '-y']);
    expect(keypad.stdout).toContain('(keyed on device)');
  });

  it('request-qr forwards a gateway rejection as the --json error envelope', async () => {
    mockRoutes['request-qr'] = () => ({
      status: 400,
      payload: { status: { code: '04', message: 'Parameter validation required' } },
    });
    const out = await run(['request-qr', '-c', 'USD', '--payment-option', 'abapay', '--callback-url', 'https://example.com/cb', '--json']);
    const doc = parseJsonDocument(out.stdout);
    expect(doc.error.kind).toBeDefined();
    expect(out.exitCode).toBe(doc.error.exitCode);
  });

  it('self-activation requires partner credentials and prints the red banner in human mode', async () => {
    delete process.env.PAYWAY_PARTNER_ID;
    delete process.env.PAYWAY_PARTNER_API_KEY;
    try {
      const human = await run(['self-activation', 'new-merchant', '--pushback-url', 'https://example.com/pb', '--redirect-url', 'https://example.com/rd', '--register-ref', 'gap-reg-1', '--currency', 'USD']);
      expect(human.exitCode).toBe(1);
      expect(human.stdout).toContain('Missing partner credentials');

      const json = parseJsonDocument(
        (await run(['self-activation', 'new-merchant', '--pushback-url', 'https://example.com/pb', '--redirect-url', 'https://example.com/rd', '--register-ref', 'gap-reg-1', '--currency', 'USD', '--json'])).stdout,
      );
      expect(json.error.kind).toBe('validation');
      expect(json.error.message).toContain('partner');
    } finally {
      delete process.env.PAYWAY_PARTNER_ID;
      delete process.env.PAYWAY_PARTNER_API_KEY;
    }
  });

  it('self-activation new-merchant renders the human success card with URL and token', async () => {
    mockRoutes['new-merchant'] = () => ({
      status: 200,
      payload: { status: { code: '00', message: 'Success' }, url: 'https://onboard.example.com/start', token: 'sess-gap-1' },
    });
    process.env.PAYWAY_PARTNER_ID = 'partner-gap';
    process.env.PAYWAY_PARTNER_API_KEY = 'p'.repeat(32);
    try {
      const out = await run([
        'self-activation', 'new-merchant',
        '--pushback-url', 'https://example.com/pb',
        '--redirect-url', 'https://example.com/rd',
        '--register-ref', 'gap-reg-2',
        '--currency', 'USD',
        '--merchant-type', '1',
        '--type', '0',
      ]);
      expect(out.exitCode).not.toBe(1);
      expect(out.stdout).toContain('Merchant registration request accepted');
      expect(out.stdout).toContain('gap-reg-2');
      expect(out.stdout).toContain('Onboarding URL:');
      expect(out.stdout).toContain('Session token:');
    } finally {
      delete process.env.PAYWAY_PARTNER_ID;
      delete process.env.PAYWAY_PARTNER_API_KEY;
    }
  });
});
