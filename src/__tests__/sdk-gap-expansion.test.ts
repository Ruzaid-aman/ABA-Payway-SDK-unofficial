/**
 * Coverage-driven SDK expansion (2026-09-29 wave).
 *
 * Unit-level pins for SDK modules the existing suites leave partially
 * uncovered:
 *  - `domains/payout.ts` — the RSA/PEM construction guards, the wire body
 *    (hash fields, custom_fields string-vs-object, hex encoding), and the
 *    sandbox beneficiary-currency coupling
 *  - `webhook/lifecycle.ts` — receiver state file round-trip and corruption
 *    tolerance
 *  - `payment-lifecycle.ts` — the status → lifecycle/next-step mapping and
 *    the paymentArtifact projection
 *  - `journal/intelligence.ts` — the explain verdict matrix, step
 *    enrichment, digest summarization, and the retry-burst / latency-outlier
 *    anomaly heuristics
 *  - `mcp/extras.ts` — the read-only extras' validation branches, the
 *    journal_timeline digest allow-list, and the success paths
 *  - `cli/qr-artifact.ts` + `cli/terminal-qr.ts` — the PNG/terminal render
 *    helpers' input branches
 *
 * Everything here is hermetic: no gateway, no prompts, localhost only.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayWayConfig } from '../client.js';
import { generateTestRsaKeyPair } from '../test/test-utils.js';
import { createPayoutDomain } from '../domains/payout.js';
import { clearLifecycleState, lifecyclePath, readLifecycleState, writeLifecycleState } from '../webhook/lifecycle.js';
import { paymentArtifact, paymentLifecycle, paymentNextStep } from '../payment-lifecycle.js';
import { detectJournalAnomalies, explainTransaction } from '../journal/intelligence.js';
import { runMcpExtra } from '../mcp/extras.js';
import { saveQrPng } from '../cli/qr-artifact.js';
import { renderQrToPngBuffer, renderQrToTerminal } from '../cli/terminal-qr.js';

// ---------------------------------------------------------------------------
// domains/payout
// ---------------------------------------------------------------------------

const TEST_RSA = generateTestRsaKeyPair();

type RequestCall = {
  path: string;
  body: Record<string, unknown>;
  hmacFields: string[];
  contentType?: string;
  hashEncoding?: string;
  callOptions?: unknown;
};

function makePayoutDomain(config: Partial<PayWayConfig> = {}) {
  const calls: RequestCall[] = [];
  const request = async <T>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    _timeFieldName?: string,
    contentType?: string,
    hashEncoding?: string,
    _fetchOptions?: unknown,
    callOptions?: unknown,
  ): Promise<T> => {
    calls.push({ path, body, hmacFields, contentType, hashEncoding, callOptions });
    return { status: { code: '0' } } as T;
  };
  const requestWithMerchantAuth = async <T>(path: string, authPayload: Record<string, unknown>): Promise<T> => {
    calls.push({ path, body: authPayload, hmacFields: ['request_time', 'merchant_auth'] });
    return { status: { code: '0' } } as T;
  };
  const baseConfig = {
    environment: 'production',
    publicKeyPem: TEST_RSA.publicKey,
    ...config,
  } as unknown as PayWayConfig;
  return { domain: createPayoutDomain(baseConfig, request, requestWithMerchantAuth), calls };
}

const VALID_PAYOUT = {
  transactionId: 'PO-1',
  amount: 5,
  currency: 'USD' as const,
  beneficiaries: [{ account: '500000001', amount: 5 }],
};

describe('payout domain guards and wire shape', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('refuses to build without a public key PEM (RSA-encrypted endpoint)', async () => {
    const { domain } = makePayoutDomain({ publicKeyPem: undefined });
    await expect(domain.payout(VALID_PAYOUT)).rejects.toThrow(/publicKeyPem is required/);
  });

  it('refuses a value that is not a public-key PEM', async () => {
    const { domain } = makePayoutDomain({ publicKeyPem: 'not a pem at all' });
    await expect(domain.payout(VALID_PAYOUT)).rejects.toThrow(/does not look like a public key PEM/);
  });

  it('sends the RSA-encrypted beneficiaries with the payout hash order and hex encoding', async () => {
    const { domain, calls } = makePayoutDomain();
    await domain.payout(VALID_PAYOUT);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.path).toContain('payout');
    expect(call.hmacFields).toEqual(['merchant_id', 'tran_id', 'beneficiaries', 'amount', 'custom_fields', 'currency']);
    expect(call.hashEncoding).toBe('hex');
    expect(call.contentType).toBe('application/json');
    expect(call.body.tran_id).toBe('PO-1');
    expect(call.body.amount).toBe(5);
    expect(call.body.currency).toBe('USD');
    // Beneficiaries travel as ONE RSA-encrypted blob, not a JSON array.
    expect(typeof call.body.beneficiaries).toBe('string');
    expect(call.body.beneficiaries).not.toContain('500000001');
  });

  it('passes custom_fields through as a string or JSON-encodes objects', async () => {
    const asString = makePayoutDomain();
    await asString.domain.payout({ ...VALID_PAYOUT, customFields: '{"k":"v"}' });
    expect(asString.calls[0].body.custom_fields).toBe('{"k":"v"}');

    const asObject = makePayoutDomain();
    await asObject.domain.payout({ ...VALID_PAYOUT, customFields: { k: 'v' } });
    expect(asObject.calls[0].body.custom_fields).toBe('{"k":"v"}');

    const omitted = makePayoutDomain();
    await omitted.domain.payout(VALID_PAYOUT);
    expect(omitted.calls[0].body.custom_fields).toBeUndefined();
  });

  it('forwards per-call RequestCallOptions to the transport', async () => {
    const { domain, calls } = makePayoutDomain();
    const callOptions = { timeoutMs: 1234 };
    await domain.payout(VALID_PAYOUT, callOptions);
    expect(calls[0].callOptions).toBe(callOptions);
  });
});

// ---------------------------------------------------------------------------
// webhook/lifecycle
// ---------------------------------------------------------------------------

describe('webhook receiver lifecycle state', () => {
  let appdata: string;
  const env = () => ({ APPDATA: appdata }) as NodeJS.ProcessEnv;

  beforeEach(() => {
    appdata = mkdtempSync(path.join(tmpdir(), 'payway-lifecycle-'));
  });
  afterEach(() => rmSync(appdata, { recursive: true, force: true }));

  it('absent state reads as null and lives under <data root>/webhook_data/receiver.json', () => {
    expect(readLifecycleState(env())).toBeNull();
    expect(lifecyclePath(env())).toContain(path.join('webhook_data', 'receiver.json'));
  });

  it('round-trips a written state and validates it', () => {
    writeLifecycleState(
      {
        version: 2,
        instanceId: 'instance-a',
        controlToken: 'token-a',
        pid: 4242,
        port: 8080,
        host: '127.0.0.1',
        publicBaseUrl: 'https://tunnel.example',
        callbackUrl: 'https://tunnel.example/webhooks/aba',
        previousCallbackUrl: null,
        startedAt: '2026-09-29T00:00:00.000Z',
      },
      env(),
    );
    const state = readLifecycleState(env());
    expect(state?.pid).toBe(4242);
    expect(state?.port).toBe(8080);
    expect(state?.callbackUrl).toBe('https://tunnel.example/webhooks/aba');
  });

  it('treats corrupt JSON or a wrong schema as absent instead of throwing', () => {
    const file = lifecyclePath(env());
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{definitely not json', 'utf8');
    expect(readLifecycleState(env())).toBeNull();

    writeFileSync(file, JSON.stringify({ version: 2, pid: 'x' }), 'utf8');
    expect(readLifecycleState(env())).toBeNull();

    writeFileSync(file, JSON.stringify({ version: 1, pid: 'not-a-number', port: 8080 }), 'utf8');
    expect(readLifecycleState(env())).toBeNull();
  });

  it('clear is idempotent', () => {
    writeLifecycleState(
      {
        version: 2,
        instanceId: 'i',
        controlToken: 't',
        pid: 1,
        port: 1,
        host: '127.0.0.1',
        publicBaseUrl: null,
        callbackUrl: null,
        previousCallbackUrl: null,
        startedAt: 'x',
      },
      env(),
    );
    clearLifecycleState(env());
    expect(readLifecycleState(env())).toBeNull();
    expect(() => clearLifecycleState(env())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// payment-lifecycle
// ---------------------------------------------------------------------------

describe('paymentLifecycle mapping and next steps', () => {
  it('maps gateway payment_status values, case-insensitively, and rejects non-strings', () => {
    expect(paymentLifecycle('APPROVED')).toBe('approved');
    expect(paymentLifecycle('approved')).toBe('approved');
    expect(paymentLifecycle('PENDING')).toBe('pending');
    expect(paymentLifecycle('DECLINED')).toBe('failed');
    expect(paymentLifecycle('CANCELLED')).toBe('failed');
    expect(paymentLifecycle('REFUNDED')).toBe('unknown');
    expect(paymentLifecycle(0)).toBe('unknown');
    expect(paymentLifecycle(undefined)).toBe('unknown');
    expect(paymentLifecycle(null)).toBe('unknown');
  });

  it('gives a distinct next step per lifecycle', () => {
    for (const status of ['created', 'pending', 'approved', 'failed', 'unknown'] as const) {
      expect(paymentNextStep(status)).toContain('transaction');
    }
    expect(paymentNextStep('approved')).toContain('fulfill once atomically');
    expect(paymentNextStep('pending')).toContain('PENDING does not prove it is still payable');
    expect(paymentNextStep('unknown')).toContain('Do not fulfill from an unknown outcome');
  });

  it('paymentArtifact projects only the customer-safe checkout fields', () => {
    const session = {
      sessionId: 's1',
      responseType: 'Type0Response',
      responsePayload: { qrString: '000201' },
      expiresAt: '2026-09-29T10:00:00.000Z',
      raw: { secret: 'never-forward' },
    } as unknown as Parameters<typeof paymentArtifact>[0];
    const artifact = paymentArtifact(session);
    expect(artifact).toEqual({
      sessionId: 's1',
      responseType: 'Type0Response',
      responsePayload: { qrString: '000201' },
      expiresAt: '2026-09-29T10:00:00.000Z',
    });
    expect(artifact).not.toHaveProperty('raw');
  });
});

// ---------------------------------------------------------------------------
// journal/intelligence — verdict matrix + step rendering
// ---------------------------------------------------------------------------

describe('explainTransaction verdict matrix', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'payway-rca-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  let seq = 0;
  const ev = (partial: Record<string, unknown>): Record<string, unknown> => {
    seq += 1;
    return {
      version: 2,
      ts: `2026-09-29T03:0${seq % 10}:00.000Z`,
      eventId: `rca-${seq}`,
      kind: 'execution.request',
      correlationId: 'rca-cid',
      ...partial,
    };
  };
  const write = (events: Record<string, unknown>[]) =>
    writeFileSync(path.join(dir, 'journal.jsonl'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');

  it('APPROVED + verified callback → fulfill-after-verdict verdict', () => {
    write([
      ev({ transactionId: 'V1', kind: 'execution.request', endpoint: '/generate-qr', attempt: 0 }),
      ev({ transactionId: 'V1', kind: 'status.observed', status: 'APPROVED' }),
      ev({ transactionId: 'V1', kind: 'callback.received', correlationId: 'wh_x', endpoint: '/webhooks/aba' }),
    ]);
    const report = explainTransaction('V1', { journalDir: dir });
    expect(report.verdict).toContain('APPROVED — callback captured');
    expect(report.verdict).toContain('signature verdict');
  });

  it('callback on a non-approved status reports both signals', () => {
    write([
      ev({ transactionId: 'V2', kind: 'status.observed', status: 'PENDING' }),
      ev({ transactionId: 'V2', kind: 'callback.received', correlationId: 'wh_y', status: '0' }),
    ]);
    const report = explainTransaction('V2', { journalDir: dir });
    expect(report.verdict).toContain('Callback captured (status 0)');
    expect(report.verdict).toContain('last observed status PENDING');
  });

  it('DECLINED is terminal and PENDING gets the no-EXPIRED-remotely caveats', () => {
    write([ev({ transactionId: 'V3', kind: 'status.observed', status: 'DECLINED' })]);
    expect(explainTransaction('V3', { journalDir: dir }).verdict).toContain('Terminal non-success status: DECLINED');

    write([ev({ transactionId: 'V4', kind: 'status.observed', status: 'PENDING' })]);
    const pending = explainTransaction('V4', { journalDir: dir });
    expect(pending.verdict).toContain('no EXPIRED/CLOSED status');
    expect(pending.hints.join(' ')).toContain('local closed/expired flag');
    expect(pending.hints.join(' ')).toContain('never appear in transaction-list');
  });

  it('renders error, poll, artifact, and digest steps with trace ids and truncation', () => {
    write([
      ev({
        transactionId: 'V5',
        kind: 'execution.request',
        endpoint: '/generate-qr',
        attempt: 0,
        requestDigest: { amount: 5, note: 'x'.repeat(300) },
      }),
      ev({
        transactionId: 'V5',
        kind: 'execution.error',
        attempt: 0,
        paywayCode: '69',
        error: { code: 'api_error', message: 'rejected' },
      }),
      ev({ transactionId: 'V5', kind: 'execution.response', httpStatus: 200, traceId: 'tr-123' }),
      ev({ transactionId: 'V5', kind: 'poll.attempt', attempt: 1, status: 'ERROR:timeout', durationMs: 5 }),
      ev({ transactionId: 'V5', kind: 'poll.attempt', attempt: 2, status: 'PENDING', durationMs: 50 }),
      ev({ transactionId: 'V5', kind: 'artifact.written', artifact: { path: 'payway-output/x.png' } }),
    ]);
    const report = explainTransaction('V5', { journalDir: dir });
    const titles = report.steps.map((s) => s.title);
    expect(titles.some((t) => t.includes('Gateway answered HTTP 200') && t.length > 0)).toBe(true);
    const responseStep = report.steps.find((s) => s.title.includes('Gateway answered'));
    expect(responseStep?.detail).toContain('trace tr-123');
    expect(responseStep?.detail).toContain('duration unknown');
    // ERROR polls are filtered; the PENDING poll is shown.
    expect(titles.some((t) => t.startsWith('Poll #2'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Poll #1'))).toBe(false);
    expect(titles).toContain('Artifact saved');
    expect(report.steps.find((s) => s.title === 'Artifact saved')?.detail).toBe('payway-output/x.png');
    // Long request digests are truncated.
    const creation = report.steps.find((s) => s.title === 'Creation request sent');
    expect((creation?.detail ?? '').length).toBeLessThan(300);
    // The gateway hint for the provider code now renders (object-shaped registry).
    expect(report.hints.join(' ')).toContain('Gateway hint for code 69');
  });

  it('lists retry attempts as numbered steps and hints the retry count', () => {
    write([
      ev({ transactionId: 'V6', kind: 'execution.request', endpoint: '/generate-qr', attempt: 0 }),
      ev({
        transactionId: 'V6',
        kind: 'execution.error',
        attempt: 0,
        httpStatus: 500,
        error: { code: 'transport', message: 'boom' },
      }),
      ev({ transactionId: 'V6', kind: 'execution.request', endpoint: '/generate-qr', attempt: 1 }),
    ]);
    const report = explainTransaction('V6', { journalDir: dir });
    expect(report.steps.some((s) => s.title.includes('Retry attempt #1'))).toBe(true);
    expect(report.steps.some((s) => s.title.includes('Failed attempt #0'))).toBe(true);
    expect(report.hints.join(' ')).toContain('attempted 2 times');
  });
});

describe('detectJournalAnomalies heuristics', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'payway-anom-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (events: Record<string, unknown>[]) =>
    writeFileSync(path.join(dir, 'journal.jsonl'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  const ev = (partial: Record<string, unknown>): Record<string, unknown> => ({
    version: 2,
    ts: '2026-09-29T03:00:00.000Z',
    eventId: `an-${Math.random().toString(36).slice(2)}`,
    kind: 'execution.request',
    correlationId: 'an-cid',
    ...partial,
  });

  it('flags a retry burst when one day has >= 3 retried exchanges at >= 3x the other days', () => {
    const events: Record<string, unknown>[] = [];
    // Baseline day: one retried exchange (2 requests, same cid).
    events.push(
      ev({ ts: '2026-09-27T01:00:00.000Z', correlationId: 'base-a' }),
      ev({ ts: '2026-09-27T01:01:00.000Z', correlationId: 'base-a' }),
    );
    // Burst day: three retried exchanges.
    for (const [cid, minute] of [
      ['b1', 1],
      ['b2', 2],
      ['b3', 3],
    ] as const) {
      events.push(
        ev({ ts: `2026-09-28T0${minute}:00:00.000Z`, correlationId: cid }),
        ev({ ts: `2026-09-28T0${minute}:01:00.000Z`, correlationId: cid }),
      );
    }
    write(events);
    const report = detectJournalAnomalies({ journalDir: dir });
    const burst = report.anomalies.find((a) => a.kind === 'retry-burst');
    expect(burst?.subject).toBe('2026-09-28');
    expect(burst?.metric).toBe('3 retried exchanges');
    expect(burst?.baseline).toContain('mean 1.0');
  });

  it('flags a latency outlier when an endpoint p99 is >= 3x its p50 over >= 5 samples', () => {
    const events: Record<string, unknown>[] = [];
    // 6 samples: five fast, one very slow → p50 small, p99 large.
    const durations = [10, 11, 12, 13, 14, 900];
    durations.forEach((durationMs, i) => {
      events.push(ev({ kind: 'execution.response', endpoint: '/slow-endpoint', durationMs }));
      // Keep the response event's ts distinct.
      events[events.length - 1] = { ...events[events.length - 1], eventId: `lat-${i}` };
    });
    write(events);
    const report = detectJournalAnomalies({ journalDir: dir });
    const outlier = report.anomalies.find((a) => a.kind === 'latency-outlier');
    expect(outlier?.subject).toBe('/slow-endpoint');
    expect(outlier?.baseline).toBe('6 samples');
  });

  it('stays quiet when the only error day has no baseline to compare against', () => {
    write([ev({ kind: 'execution.error', ts: '2026-09-29T03:00:00.000Z' })]);
    const report = detectJournalAnomalies({ journalDir: dir });
    expect(report.anomalies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// mcp/extras — read-only extras
// ---------------------------------------------------------------------------

describe('mcp extras validation and projection', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'payway-mcpx-'));
    process.env.PAYWAY_JOURNAL_DIR = dir;
  });
  afterEach(() => {
    delete process.env.PAYWAY_JOURNAL_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (events: Record<string, unknown>[]) =>
    writeFileSync(path.join(dir, 'journal.jsonl'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  const ev = (partial: Record<string, unknown>): Record<string, unknown> => ({
    version: 2,
    ts: '2026-09-29T03:00:00.000Z',
    eventId: `mx-${Math.random().toString(36).slice(2)}`,
    kind: 'execution.request',
    correlationId: 'mx-cid',
    ...partial,
  });

  it('journal_timeline requires a transactionId and honors the kind filter', async () => {
    const missing = await runMcpExtra('journal_timeline', {}, undefined);
    expect(missing.ok).toBe(false);
    expect(missing.error?.code).toBe('VALIDATION');

    write([
      ev({ transactionId: 'MX-1' }),
      ev({ transactionId: 'MX-1', kind: 'status.observed', status: 'APPROVED' }),
      ev({ transactionId: 'MX-OTHER' }),
    ]);
    const filtered = await runMcpExtra(
      'journal_timeline',
      { transactionId: 'MX-1', kind: 'status.observed' },
      undefined,
    );
    expect(filtered.ok).toBe(true);
    expect(filtered.data?.events).toHaveLength(1);

    const all = await runMcpExtra('journal_timeline', { transactionId: 'MX-1' }, undefined);
    expect(all.data?.events).toHaveLength(2);
  });

  it('journal_timeline projects events through the digest allow-list (no request/response bodies)', async () => {
    write([
      ev({
        transactionId: 'MX-2',
        requestDigest: { hash: 'secret-hash-value' },
        responseDigest: { body: 'gateway payload' },
        endpoint: '/generate-qr',
      }),
    ]);
    const result = await runMcpExtra('journal_timeline', { transactionId: 'MX-2' }, undefined);
    expect(result.ok).toBe(true);
    const [projected] = result.data?.events as Record<string, unknown>[];
    expect(projected.endpoint).toBe('/generate-qr');
    expect(projected).not.toHaveProperty('requestDigest');
    expect(projected).not.toHaveProperty('responseDigest');
    expect(JSON.stringify(projected)).not.toContain('secret-hash-value');
  });

  it('list_transactions validates the window, pagination, and page before touching the client', async () => {
    const wide = await runMcpExtra(
      'list_transactions',
      { from: '2026-09-01 00:00:00', to: '2026-09-29 00:00:00' },
      undefined,
    );
    expect(wide.ok).toBe(false);
    expect(wide.error?.message).toContain('more than 3 days');

    const badFormat = await runMcpExtra('list_transactions', { from: '2026/09/01' }, undefined);
    expect(badFormat.error?.message).toContain('YYYY-MM-DD HH:mm:ss');

    const badPagination = await runMcpExtra('list_transactions', { pagination: 1001 }, undefined);
    expect(badPagination.error?.message).toContain('between 1 and 1000');

    const badPage = await runMcpExtra('list_transactions', { page: 0 }, undefined);
    expect(badPage.error?.message).toContain('positive whole number');

    const noClient = await runMcpExtra('list_transactions', {}, undefined);
    expect(noClient.ok).toBe(false);
    expect(noClient.error?.code).toBe('CONFIG_ERROR');
  });

  it('list_transactions projects rows through the success path with a gateway-day window', async () => {
    const fakeClient = {
      checkout: {
        getTransactionList: vi.fn(async () => ({
          rows: [{ transaction_id: 'L1', payment_status: 'APPROVED' }],
        })),
      },
    };
    const result = await runMcpExtra('list_transactions', { page: 2, pagination: 10 }, fakeClient as never);
    expect(result.ok).toBe(true);
    expect(result.data?.count).toBe(1);
    expect(result.data?.window).toBeDefined();
    expect(fakeClient.checkout.getTransactionList).toHaveBeenCalledWith(
      expect.objectContaining({ page: '2', pagination: '10' }),
    );
  });

  it('journal_stats serves the aggregate without a client', async () => {
    write([
      ev({ transactionId: 'MX-S' }),
      ev({ transactionId: 'MX-S', kind: 'execution.response', endpoint: '/check', durationMs: 25, httpStatus: 200 }),
    ]);
    const result = await runMcpExtra('journal_stats', {}, undefined);
    expect(result.ok).toBe(true);
    expect(result.data?.exchanges).toBeDefined();
    expect(result.data?.funnel).toBeDefined();
  });

  it('wraps transport-level throws as INTERNAL failures', async () => {
    const exploding = {
      checkout: {
        getTransactionList: vi.fn(async () => {
          throw new Error('socket hang up');
        }),
      },
    };
    const result = await runMcpExtra('list_transactions', {}, exploding as never);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INTERNAL');
    expect(result.error?.message).toContain('socket hang up');
  });
});

// ---------------------------------------------------------------------------
// cli/qr-artifact + cli/terminal-qr render helpers
// ---------------------------------------------------------------------------

describe('QR render helpers', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'payway-qrh-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('saveQrPng prefers the API image, strips the data-url prefix, and decodes base64', async () => {
    const raw = path.join(dir, 'raw.png');
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const savedRaw = await saveQrPng({ outputPath: raw, qrImage: pngBytes.toString('base64') });
    expect(savedRaw).toBe(path.resolve(raw));
    expect(readFileSync(raw).subarray(0, 4)).toEqual(pngBytes.subarray(0, 4));

    const prefixed = path.join(dir, 'prefixed.png');
    await saveQrPng({ outputPath: prefixed, qrImage: `data:image/png;base64,${pngBytes.toString('base64')}` });
    expect(readFileSync(prefixed).subarray(0, 4)).toEqual(pngBytes.subarray(0, 4));
  });

  it('saveQrPng falls back to rendering the QR string and returns nothing without input', async () => {
    const fromString = await saveQrPng({ outputPath: path.join(dir, 'nested', 'str.png'), qrString: '000201010212' });
    expect(fromString).toBeDefined();
    expect(readFileSync(fromString as string).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    expect(await saveQrPng({ outputPath: path.join(dir, 'none.png') })).toBeUndefined();
  });

  it('terminal and PNG renderers produce scannable payloads without files', async () => {
    const terminal = await renderQrToTerminal('000201010212');
    expect(terminal).toContain('█');

    const png = await renderQrToPngBuffer('000201010212');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.length).toBeGreaterThan(1000);
  });
});
