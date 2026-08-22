/**
 * TASK-013 — End-to-end verification of the agentic PayWay CLI milestone.
 *
 * Uses a MOCKED provider adapter (canned AgentPlanV1) and a MOCKED PayWay
 * client (injected via OrchestratorOptions.payway). No real network and a temp
 * APPDATA are used. Covers the eight e2e scenarios from the plan's TASK-013.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedPayWayContext } from '../agent/context.js';
import type { AgentPlanV1, ExecutionRecordV1, ProviderConfigV1 } from '../agent/contracts.js';
import { findUnfinishedExecutions } from '../agent/ledger.js';
import {
  AgentOrchestrator as AgentOrchestratorBase,
  type OrchestratorDeps,
  type OrchestratorOptions,
} from '../agent/orchestrator.js';
import { serializeCommandResult } from '../agent/output.js';
import { scrubSensitive } from '../agent/privacy.js';
import type { ProviderAdapter, } from '../agent/provider.js';
import { validateCommandResult } from '../agent/schemas.js';
import { getAgentDataPaths } from '../agent/storage.js';
import type { PayWay } from '../client.js';
import { PayWayNetworkError } from '../errors.js';

/** Reads a persisted ledger record from disk by its execution id. */
function loadExecutionRecordForTest(executionId: string): ExecutionRecordV1 {
  const file = path.join(getAgentDataPaths().ledgerDir, `${executionId}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as ExecutionRecordV1;
}

/** Returns every persisted session file contents as parsed objects. */
function allSessions(): Array<{ events: Array<{ data: Record<string, unknown> }> }> {
  const dir = getAgentDataPaths().sessionsDir;
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(path.join(dir, n), 'utf8')));
}

/** Returns every persisted ledger record as parsed objects. */
function allLedgerRecords(): ExecutionRecordV1[] {
  const dir = getAgentDataPaths().ledgerDir;
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir);
  if (names.length === 0) return [];
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(path.join(dir, n), 'utf8')) as ExecutionRecordV1);
}

const tempDirs: string[] = [];
const originalAppData = process.env.APPDATA;
let artifactRoot = '';

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-e2e-'));
  tempDirs.push(directory);
  process.env.APPDATA = directory;
  artifactRoot = path.join(directory, 'payway-output');
});

afterEach(() => {
  process.env.APPDATA = originalAppData;
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

class AgentOrchestrator extends AgentOrchestratorBase {
  constructor(deps: OrchestratorDeps) {
    super({ ...deps, artifactRoot, artifactRootOverrideConfirmed: true });
  }
}

class FakeProvider implements ProviderAdapter {
  public lastRequest: string | null = null;
  constructor(private readonly impl: (request: string) => Promise<AgentPlanV1>) {}
  propose(request: string): Promise<AgentPlanV1> {
    this.lastRequest = request;
    return this.impl(request);
  }
  async checkConnectivity() {
    return { status: 'ready' as const };
  }
}

function makeContext(overrides: Partial<ResolvedPayWayContext> = {}) {
  return {
    source: 'option' as const,
    profileName: 'test',
    environment: 'sandbox' as const,
    merchantId: 'MID',
    apiKey: 'KEY',
    callbackUrl: 'https://pay.example.com/cb',
    displayLabel: 'profile: test (sandbox)',
    ...overrides,
  };
}

function makeKhqrContext(overrides: Partial<ResolvedPayWayContext> = {}) {
  return makeContext({
    khqr: {
      bakongId: 'bakong@aba',
      abaMerchantId: '123456789012345',
      acquirerName: 'Acme',
      merchantCategoryCode: '1234',
      merchantName: 'Acme Pay',
      merchantCity: 'Phnom Penh',
      paywayData: 'x'.repeat(20),
    },
    ...overrides,
  });
}

interface FakePayWay {
  payway: PayWay;
  calls: {
    generateQr: number;
    createTransaction: number;
    purchase: number;
    paymentLink: number;
    checkTransaction: number;
    merchantRef: number;
    generateOfflineQR: number;
  };
}

function makePayWay(opts: { generateQrError?: Error } = {}): FakePayWay {
  const calls = {
    generateQr: 0,
    createTransaction: 0,
    purchase: 0,
    paymentLink: 0,
    checkTransaction: 0,
    merchantRef: 0,
    generateOfflineQR: 0,
  };
  const payway = {
    qr: {
      generateQr: async (..._args: unknown[]) => {
        calls.generateQr++;
        if (opts.generateQrError) throw opts.generateQrError;
        return { qrString: 'QRDATA-123', qrImage: 'IMG' };
      },
    },
    khqr: {
      generateOfflineQR: async () => {
        calls.generateOfflineQR++;
        return 'khqr-string';
      },
      getTransactionsByMerchantRef: async (..._a: unknown[]) => {
        calls.merchantRef++;
        return { ref: 'r' };
      },
    },
    checkout: {
      createTransaction: async (..._a: unknown[]) => {
        calls.createTransaction++;
        return { signed: 'payload' };
      },
      purchase: async (..._a: unknown[]) => {
        calls.purchase++;
        return {};
      },
      checkTransaction: async (..._a: unknown[]) => {
        calls.checkTransaction++;
        return { status: { code: '0' } };
      },
      pollTransactionStatus: async function* () {},
    },
    paymentLink: {
      create: async (..._a: unknown[]) => {
        calls.paymentLink++;
        return { tran_id: 't1', data: { id: 'pl-1' }, status: { code: '00' } };
      },
    },
  };
  return { payway: payway as unknown as PayWay, calls };
}

function onlineQrPlan(amount = 3): AgentPlanV1 {
  return {
    version: 'agent-plan/v1',
    request: `pay $${amount}`,
    actions: [
      {
        tool: 'generate_online_qr',
        amount,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://pay.example.com/cb',
        lifetime: 900,
        rationale: 'generic online QR',
      },
    ],
  };
}

function baseOptions(overrides: Partial<OrchestratorOptions> = {}): OrchestratorOptions {
  return { tty: false, environment: 'sandbox', ...overrides };
}

function privacyConfig(ack: boolean): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'gpt-4o',
    capabilityMode: 'strict-json-plan',
    ...(ack ? { privacyAcknowledgedAt: new Date().toISOString() } : {}),
  };
}

// ─── Scenario 1: generic $3 online QR end-to-end ──────────────────────────────

describe('TASK-013 (1) generic $3 online QR e2e', () => {
  it('proposal -> sandbox approval -> ledger -> mocked API -> QR artifact -> polling offer', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(validateCommandResult(result)).toBe(true);
    // Exactly one create API call per approved execution record.
    expect(calls.generateQr).toBe(1);
    // Ledger reached a terminal state (no unfinished records remain).
    const sessionId = result.sessionId!;
    expect(findUnfinishedExecutions(sessionId)).toEqual([]);
    // The persisted execution record exists and is terminal (succeeded).
    const record = loadExecutionRecordForTest(result.executionIds![0]);
    expect(record.status).toBe('succeeded');
    expect(record.transactionId).toMatch(/^tx[0-9a-f]+$/);
    // QR artifact was produced and saved.
    const artifact = result.actions![0].artifact as { path?: string };
    expect(artifact.path).toMatch(/payway-output/);
    expect(result.message).toMatch(/poll/i);
  });
});

// ─── Scenario 2: non-TTY without approval ─────────────────────────────────────

describe('TASK-013 (2) non-TTY without approval', () => {
  it('returns structured needs_confirmation JSON and performs zero API requests', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ tty: false, payway }));

    expect(result.status).toBe('needs_confirmation');
    expect(validateCommandResult(result)).toBe(true);
    expect(calls.generateQr).toBe(0);
    expect(result.executionIds).toBeUndefined();
  });
});

// ─── Scenario 3: production yolo rejected / approve succeeds ──────────────────

describe('TASK-013 (3) production authorization matrix', () => {
  it('rejects --yolo in production (needs_confirmation, zero API)', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext({ environment: 'production' }),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'yolo', environment: 'production', payway }));

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('succeeds with --approve in production (mocked create)', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext({ environment: 'production' }),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', environment: 'production', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.generateQr).toBe(1);
    expect(validateCommandResult(result)).toBe(true);
  });
});

// ─── Scenario 4: missing callback / explicit offline KHQR ─────────────────────

describe('TASK-013 (4) missing callback and explicit offline KHQR', () => {
  it('blocks generic payment when callback missing and NEVER falls back to offline KHQR', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext({ callbackUrl: undefined }),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('needs_clarification');
    expect(calls.generateQr).toBe(0);
    expect(calls.generateOfflineQR).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('explicit offline KHQR succeeds without offering polling', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'generate offline KHQR for 5 USD ref MERCH-1',
      actions: [
        {
          tool: 'generate_offline_khqr',
          amount: 5,
          currency: 'USD',
          merchantRef: 'MERCH-1',
          rationale: 'explicit offline KHQR',
        },
      ],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeKhqrContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('offline KHQR', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.generateOfflineQR).toBe(1);
    expect(calls.generateQr).toBe(0);
    // Offline KHQR has no PayWay polling; the message must not offer it.
    expect(result.message).not.toMatch(/poll/i);
    expect(validateCommandResult(result)).toBe(true);
  });
});

// ─── Scenario 5: checkout payload vs purchase, payment link, lookups ──────────

describe('TASK-013 (5) checkout, payment link, and distinct lookups', () => {
  it('create_checkout_payload is local (createTransaction) and distinct from remote purchase', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'create a checkout payload for 10 USD',
      actions: [
        {
          tool: 'create_checkout_payload',
          amount: 10,
          currency: 'USD',
          transactionId: null,
          rationale: 'local payload',
        },
      ],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('checkout payload', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.createTransaction).toBe(1);
    expect(calls.purchase).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('create_checkout_purchase performs a remote purchase', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'purchase via checkout for 10 USD',
      actions: [
        {
          tool: 'create_checkout_purchase',
          amount: 10,
          currency: 'USD',
          transactionId: null,
          rationale: 'remote purchase',
        },
      ],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('checkout purchase', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.purchase).toBe(1);
    expect(calls.createTransaction).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('create_payment_link requires RSA readiness and calls paymentLink.create', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'make a payment link',
      actions: [
        {
          tool: 'create_payment_link',
          title: 'Invoice',
          amount: 20,
          currency: 'USD',
          merchantRefNo: 'INV-1',
          returnUrl: 'https://pay.example.com/return',
          rationale: 'payment link',
        },
      ],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext({ publicKeyPem: 'RSA-PUB' }),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('payment link', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.paymentLink).toBe(1);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('check_transaction and check_transaction_by_merchant_ref hit distinct client methods', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'look up by id and by merchant ref',
      actions: [
        { tool: 'check_transaction', transactionId: 'tx-abc' },
        { tool: 'check_transaction_by_merchant_ref', merchantRef: 'MERCH-9' },
      ],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('lookups', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.checkTransaction).toBe(1);
    expect(calls.merchantRef).toBe(1);
    expect(validateCommandResult(result)).toBe(true);
  });
});

// ─── Scenario 6: submitted timeout -> outcome_unknown; no replay ──────────────

describe('TASK-013 (6) outcome_unknown and correlation recovery without replay', () => {
  it('records outcome_unknown on timeout and recovers via findUnfinishedExecutions with no replay', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const sessionId = 'timeout-session';
    const { payway, calls } = makePayWay({
      generateQrError: new PayWayNetworkError('connection reset (simulated timeout)'),
    });
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runTurn(sessionId, 'pay $3', baseOptions({ flag: 'approve', payway }));

    expect(calls.generateQr).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.actions![0].error as { code?: string }).toMatchObject({ code: 'OUTCOME_UNKNOWN' });
    expect(result.message).toMatch(/unknown outcome/i);
    expect(validateCommandResult(result)).toBe(true);

    // Correlation recovery: the unfinished execution is findable by session.
    const unfinished = findUnfinishedExecutions(sessionId);
    expect(unfinished.length).toBe(1);
    expect(unfinished[0].status).toBe('outcome_unknown');

    // NO replay: the original record is never automatically re-submitted. Its
    // status remains outcome_unknown (not a fresh confirmed/submitted transition),
    // so the executor would reject any attempt to re-run it.
    const original = loadExecutionRecordForTest(unfinished[0].executionId);
    expect(original.status).toBe('outcome_unknown');
    // findUnfinishedExecutions is a read-only recovery helper, not a replay.
    expect(findUnfinishedExecutions(sessionId).length).toBe(1);
  });
});

// ─── Scenario 7: resume without approval + malicious provider attempts ────────

describe('TASK-013 (7) resume without approval and malicious provider attempts', () => {
  it('resumes with needs_confirmation and never restores write approval (zero API)', async () => {
    const propose = vi.fn(async () => onlineQrPlan());
    const provider = new FakeProvider(propose);
    const { payway, calls } = makePayWay();
    const sessionId = 'resume-session';
    await new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    }).runTurn(sessionId, 'pay $3', baseOptions({ flag: 'approve', payway }));
    propose.mockClear();
    calls.generateQr = 0;

    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });
    const result = await orch.resume(sessionId);

    expect(result.status).toBe('needs_confirmation');
    expect(propose).not.toHaveBeenCalled();
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('rejects a malicious open_artifact path traversal attempt', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'open the report',
      actions: [{ tool: 'open_artifact', reference: '../../../etc/passwd' }],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('open', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('blocked');
    expect(result.error?.code).toBe('UNTRUSTED_ACTION_VALUE');
    expect(result.actions).toBeUndefined();
    expect(result.executionIds).toBeUndefined();
    expect(calls.generateQr).toBe(0);
    expect(calls.createTransaction).toBe(0);
    expect(calls.purchase).toBe(0);
    expect(calls.paymentLink).toBe(0);
    expect(allLedgerRecords()).toEqual([]);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('rejects a malicious file:// URI scheme in open_artifact', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'open file',
      actions: [{ tool: 'open_artifact', reference: 'file:///etc/secrets' }],
    }));
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('open', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('blocked');
    expect(result.error?.code).toBe('UNTRUSTED_ACTION_VALUE');
    expect(result.actions).toBeUndefined();
    expect(result.executionIds).toBeUndefined();
    expect(calls.generateQr).toBe(0);
    expect(calls.createTransaction).toBe(0);
    expect(calls.purchase).toBe(0);
    expect(calls.paymentLink).toBe(0);
    expect(allLedgerRecords()).toEqual([]);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('rejects a non-https (http) URI scheme in open_artifact', async () => {
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: 'open url',
      actions: [{ tool: 'open_artifact', reference: 'http://evil.example.com/x' }],
    }));
    const { payway } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('open', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('blocked');
    expect(result.error?.code).toBe('INVALID_LOCAL_ACTION');
    expect(result.actions).toBeUndefined();
    expect(validateCommandResult(result)).toBe(true);
  });

  it('rejects an out-of-scope shell tool proposed by the provider (unknown tool)', async () => {
    const provider = new FakeProvider(
      async () =>
        ({
          version: 'agent-plan/v1',
          request: 'run something',
          actions: [{ tool: 'exec_shell', command: 'rm -rf /' }],
        }) as unknown as AgentPlanV1,
    );
    const { payway, calls } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('run', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_PLAN');
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });
});

// ─── Scenario 8: canary secrets absent from all output channels ───────────────

describe('TASK-013 (8) canary secrets never leak to provider/session/ledger/artifact/console', () => {
  const CANARY_API = 'AKIA-CANARY-98765';
  const CANARY_TOKEN = 'TOKEN-CANARY-55443';

  it('scrubSensitive redacts canaries in every structured channel', () => {
    const planLike = {
      request: `pay $3 apiKey=${CANARY_API}`,
      context: { apiKey: CANARY_API, authorization: `Bearer ${CANARY_TOKEN}`, privateKey: 'PEM-CANARY' },
    };
    const scrubbed = scrubSensitive(planLike, []) as Record<string, unknown>;
    expect(JSON.stringify(scrubbed)).not.toContain(CANARY_API);
    expect(JSON.stringify(scrubbed)).not.toContain(CANARY_TOKEN);
    expect(JSON.stringify(scrubbed)).toContain('[REDACTED]');
  });

  it('canaries in request + plan context never reach provider payloads, sessions, ledger, artifacts, or console', async () => {
    const canaryRequest = `pay $3 with apiKey=${CANARY_API} and Authorization: Bearer ${CANARY_TOKEN}`;
    const provider = new FakeProvider(async () => ({
      version: 'agent-plan/v1',
      request: canaryRequest,
      context: {
        apiKey: CANARY_API,
        authorization: `Bearer ${CANARY_TOKEN}`,
        privateKey: 'PEM-CANARY',
      },
      actions: [
        {
          tool: 'generate_online_qr',
          amount: 3,
          currency: 'USD',
          transactionId: null,
          callbackUrl: 'https://pay.example.com/cb',
          lifetime: 900,
        },
      ],
    }));
    const { payway } = makePayWay();
    const orch = new AgentOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    // Capture any console output produced during the run.
    const consoleOutput: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      consoleOutput.push(String(m));
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((m?: unknown) => {
      consoleOutput.push(String(m));
    });

    const result = await orch.runOneShot(canaryRequest, baseOptions({ flag: 'approve', payway }));

    logSpy.mockRestore();
    warnSpy.mockRestore();

    expect(result.status).toBe('succeeded');

    // Provider payload: the request transmitted is scrubbed.
    expect(provider.lastRequest).not.toContain(CANARY_API);
    expect(provider.lastRequest).not.toContain(CANARY_TOKEN);

    // Serialized command result (the console/JSON output) contains no canary.
    const serialized = serializeCommandResult(result);
    expect(serialized).not.toContain(CANARY_API);
    expect(serialized).not.toContain(CANARY_TOKEN);
    expect(consoleOutput.join('\n')).not.toContain(CANARY_API);
    expect(consoleOutput.join('\n')).not.toContain(CANARY_TOKEN);

    // Persisted session files contain no canary.
    const sessionBlob = JSON.stringify(allSessions());
    expect(sessionBlob).not.toContain(CANARY_API);
    expect(sessionBlob).not.toContain(CANARY_TOKEN);

    // Persisted ledger records contain no canary.
    const ledgerBlob = JSON.stringify(allLedgerRecords());
    expect(ledgerBlob).not.toContain(CANARY_API);
    expect(ledgerBlob).not.toContain(CANARY_TOKEN);

    // Persisted QR artifact metadata contains no canary.
    const artifact = result.actions![0].artifact as { path?: string };
    const metaRaw = readFileSync(`${artifact.path!.replace(/\.png$/, '.json')}`, 'utf8');
    expect(metaRaw).not.toContain(CANARY_API);
    expect(metaRaw).not.toContain(CANARY_TOKEN);
  });
});
