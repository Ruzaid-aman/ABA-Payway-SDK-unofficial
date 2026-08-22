import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedPayWayContext } from '../agent/context.js';
import type { AgentPlanV1, ProviderConfigV1 } from '../agent/contracts.js';
import { AgentOrchestrator, type OrchestratorOptions } from '../agent/orchestrator.js';
import { normalizePlan } from '../agent/planning.js';
import type { ProviderAdapter } from '../agent/provider.js';
import { evaluateReadiness } from '../agent/readiness.js';
import { getAgentDataPaths } from '../agent/storage.js';
import type { PayWay } from '../client.js';

const temporaryDirectories: string[] = [];
const originalAppData = process.env.APPDATA;

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-r3-'));
  temporaryDirectories.push(directory);
  process.env.APPDATA = directory;
});

afterEach(() => {
  process.env.APPDATA = originalAppData;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function context(overrides: Partial<ResolvedPayWayContext> = {}): ResolvedPayWayContext {
  return {
    source: 'option',
    profileName: 'r3',
    environment: 'sandbox',
    merchantId: 'R3-MERCHANT-CANARY',
    apiKey: 'R3-API-KEY-CANARY',
    callbackUrl: 'https://callbacks.payway.com/qr',
    displayLabel: 'profile: r3 (sandbox)',
    ...overrides,
  };
}

function config(): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'gpt-4o',
    capabilityMode: 'strict-json-plan',
    privacyAcknowledgedAt: '2026-08-22T00:00:00.000Z',
  };
}

class FakeProvider implements ProviderAdapter {
  public calls = 0;

  constructor(private readonly plan: AgentPlanV1) {}

  async propose(): Promise<AgentPlanV1> {
    this.calls++;
    return this.plan;
  }

  async checkConnectivity() {
    return { status: 'ready' as const };
  }
}

function onlineQrPlan(overrides: Record<string, unknown> = {}): AgentPlanV1 {
  return {
    version: 'agent-plan/v1',
    request: 'pay $3',
    actions: [
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://callbacks.payway.com/qr',
        ...overrides,
      },
    ],
  } as AgentPlanV1;
}

function fakePayWay(error?: Error): { payway: PayWay; creates: { value: number }; reads: { value: number } } {
  const creates = { value: 0 };
  const reads = { value: 0 };
  return {
    creates,
    reads,
    payway: {
      qr: {
        generateQr: async () => {
          creates.value++;
          if (error) throw error;
          return { qrString: 'R3-QR' };
        },
      },
      khqr: {
        generateOfflineQR: () => 'R3-OFFLINE',
        getTransactionsByMerchantRef: async () => ({}),
      },
      checkout: {
        createTransaction: async () => ({}),
        purchase: async () => ({}),
        checkTransaction: async () => {
          reads.value++;
          return { status: { code: '00' } };
        },
        pollTransactionStatus: async function* () {},
      },
      paymentLink: { create: async () => ({}) },
    } as unknown as PayWay,
  };
}

function runOptions(payway: PayWay, overrides: Record<string, unknown> = {}): OrchestratorOptions {
  return { tty: false, payway, ...overrides } as OrchestratorOptions;
}

function ledgerFiles(): string[] {
  const directory = getAgentDataPaths().ledgerDir;
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.json')) : [];
}

describe('R3 authoritative authorization and validation order', () => {
  it('rejects a claimed sandbox authorization environment when the resolved context is production', async () => {
    const provider = new FakeProvider(onlineQrPlan());
    const { payway, creates } = fakePayWay();
    const resolved = context({ environment: 'production', displayLabel: 'profile: r3 (production)' });
    const orchestrator = new AgentOrchestrator({ context: resolved, provider, providerConfig: config() });

    const result = await orchestrator.runOneShot(
      'pay $3',
      runOptions(payway, { flag: 'yolo', environment: 'sandbox' }),
    );

    expect(result.status).toBe('blocked');
    expect(result.error?.code).toBe('AUTH_ENVIRONMENT_MISMATCH');
    expect(creates.value).toBe(0);
    expect(ledgerFiles()).toHaveLength(0);
  });

  it('rejects an invalid explicit transaction ID before creating or confirming any ledger record', async () => {
    const provider = new FakeProvider(onlineQrPlan({ transactionId: 'INVALID_TRANSACTION_ID_TOO_LONG' }));
    const { payway, creates } = fakePayWay();
    const orchestrator = new AgentOrchestrator({ context: context(), provider, providerConfig: config() });

    const result = await orchestrator.runOneShot('pay $3', runOptions(payway, { flag: 'approve' }));

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_MATERIALIZED_PLAN');
    expect(creates.value).toBe(0);
    expect(ledgerFiles()).toHaveLength(0);
  });

  it('confirms normalized safe details, including the default lifetime and explicit transaction ID, before ledger creation', async () => {
    const provider = new FakeProvider(onlineQrPlan({ transactionId: 'TX-EXPLICIT-9' }));
    const { payway, creates } = fakePayWay();
    const orchestrator = new AgentOrchestrator({ context: context(), provider, providerConfig: config() });
    let proposal: unknown;

    const result = await orchestrator.runOneShot(
      'pay $3',
      runOptions(payway, {
        tty: true,
        confirmCreatePlan: async (candidate: unknown) => {
          proposal = candidate;
          return false;
        },
      }),
    );

    expect(result.status).toBe('needs_confirmation');
    expect(proposal).toMatchObject({
      environment: 'sandbox',
      actions: [{ lifetime: 900, transactionIdStrategy: 'explicit: TX-EXPLICIT-9' }],
    });
    expect(creates.value).toBe(0);
    expect(ledgerFiles()).toHaveLength(0);
  });

  it('prevalidates every local action so a later invalid open cannot follow an earlier create', async () => {
    const mixedPlan: AgentPlanV1 = {
      ...onlineQrPlan(),
      actions: [
        onlineQrPlan().actions[0],
        { tool: 'open_artifact', reference: 'file:///C:/Windows/System32/drivers/etc/hosts' },
      ],
    };
    const provider = new FakeProvider(mixedPlan);
    const { payway, creates } = fakePayWay();
    const orchestrator = new AgentOrchestrator({ context: context(), provider, providerConfig: config() });

    const result = await orchestrator.runOneShot('create then open', runOptions(payway, { flag: 'approve' }));

    expect(result.status).toBe('blocked');
    expect(result.error?.code).toBe('INVALID_LOCAL_ACTION');
    expect(creates.value).toBe(0);
    expect(ledgerFiles()).toHaveLength(0);
  });
});

describe('R3 callback URL policy', () => {
  it.each([
    'https://localhost/callback',
    'https://localhost./callback',
    'https://api.localhost/callback',
    'https://printer.local/callback',
    'https://merchant.test/callback',
    'https://merchant.example/callback',
    'https://singlelabel/callback',
  ])('rejects special-use or non-public DNS callback %s', (callbackUrl) => {
    const resolved = context({ callbackUrl });
    expect(evaluateReadiness(resolved, config()).onlineQr).toBe('invalid');
    const normalized = normalizePlan(onlineQrPlan({ callbackUrl }), resolved);
    expect(normalized.warnings).toContain('online QR callbackUrl must be a public https URL');
  });

  it.each(['https://callbacks.payway.com/callback', 'https://8.8.8.8/callback'])(
    'accepts public DNS and public IPv4 callback %s',
    (callbackUrl) => {
      const resolved = context({ callbackUrl });
      expect(evaluateReadiness(resolved, config()).onlineQr).toBe('ready');
      expect(normalizePlan(onlineQrPlan({ callbackUrl }), resolved).warnings).not.toContain(
        'online QR callbackUrl must be a public https URL',
      );
    },
  );
});

describe('R3 durable ledger privacy and non-TTY reads', () => {
  it('scrubs resolved SDK credential canaries from a durable SDK-error ledger record', async () => {
    const resolved = context();
    const sdkError = new Error(`upstream echoed ${resolved.apiKey} for merchant ${resolved.merchantId}`);
    const provider = new FakeProvider(onlineQrPlan());
    const { payway } = fakePayWay(sdkError);
    const orchestrator = new AgentOrchestrator({ context: resolved, provider, providerConfig: config() });

    const result = await orchestrator.runOneShot('pay $3', runOptions(payway, { flag: 'approve' }));

    expect(result.status).toBe('failed');
    const durable = ledgerFiles()
      .map((name) => readFileSync(path.join(getAgentDataPaths().ledgerDir, name), 'utf8'))
      .join('\n');
    expect(durable).toContain('[REDACTED]');
    expect(durable).not.toContain(resolved.apiKey);
    expect(durable).not.toContain(resolved.merchantId);
  });

  it('plans and executes a read-only action in non-TTY mode without an approval flag', async () => {
    const readPlan: AgentPlanV1 = {
      version: 'agent-plan/v1',
      request: 'check TX-READ-1',
      actions: [{ tool: 'check_transaction', transactionId: 'TX-READ-1' }],
    };
    const provider = new FakeProvider(readPlan);
    const { payway, reads, creates } = fakePayWay();
    const orchestrator = new AgentOrchestrator({ context: context(), provider, providerConfig: config() });

    const result = await orchestrator.runOneShot('check TX-READ-1', runOptions(payway));

    expect(result.status).toBe('succeeded');
    expect(provider.calls).toBe(1);
    expect(reads.value).toBe(1);
    expect(creates.value).toBe(0);
  });
});
