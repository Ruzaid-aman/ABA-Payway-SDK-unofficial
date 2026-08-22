import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedPayWayContext } from '../agent/context.js';
import type { AgentPlanV1, ProviderConfigV1 } from '../agent/contracts.js';
import { saveQrArtifact } from '../agent/artifacts.js';
import { executeAction } from '../agent/executor.js';
import { confirmExecution, createExecutionRecord, markSubmitted } from '../agent/ledger.js';
import { AgentOrchestrator, type OrchestratorDeps, type OrchestratorOptions } from '../agent/orchestrator.js';
import type { ProviderAdapter } from '../agent/provider.js';
import { appendSessionEvent, createSession, loadSession } from '../agent/sessions.js';
import { getAgentDataPaths } from '../agent/storage.js';
import type { PayWay } from '../client.js';

const tempDirs: string[] = [];
const originalAppData = process.env.APPDATA;
let artifactRoot = '';

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-r1-'));
  tempDirs.push(directory);
  process.env.APPDATA = directory;
  artifactRoot = path.join(directory, 'payway-output');
});

afterEach(() => {
  process.env.APPDATA = originalAppData;
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeContext(overrides: Partial<ResolvedPayWayContext> = {}): ResolvedPayWayContext {
  return {
    source: 'option',
    profileName: 'test',
    environment: 'sandbox',
    merchantId: 'MID-R1',
    apiKey: 'PAYWAY-API-CANARY',
    publicKeyPem: 'PAYWAY-SIGNING-CANARY',
    callbackUrl: 'https://pay.example.test/callback',
    displayLabel: 'profile: test (sandbox)',
    ...overrides,
  };
}

function privacyConfig(): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'test-model',
    capabilityMode: 'strict-json-plan',
    privacyAcknowledgedAt: '2026-08-22T00:00:00.000Z',
  };
}

function onlineQrPlan(overrides: Record<string, unknown> = {}): AgentPlanV1 {
  return {
    version: 'agent-plan/v1',
    request: 'make a payment',
    actions: [
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://pay.example.test/callback',
        ...overrides,
      },
    ],
  } as AgentPlanV1;
}

class FakeProvider implements ProviderAdapter {
  public lastRequest: string | undefined;
  public lastContext: string | undefined;

  constructor(private readonly plan: AgentPlanV1) {}

  async propose(request: string, context?: string): Promise<AgentPlanV1> {
    this.lastRequest = request;
    this.lastContext = context;
    return this.plan;
  }

  async checkConnectivity() {
    return { status: 'ready' as const };
  }
}

function makePayWay(): { payway: PayWay; calls: { generateQr: number; generateOfflineQr: number; checkout: number } } {
  const calls = { generateQr: 0, generateOfflineQr: 0, checkout: 0 };
  return {
    payway: {
      qr: {
        generateQr: async () => {
          calls.generateQr++;
          return { qrString: 'R1-QR' };
        },
      },
      khqr: {
        generateOfflineQR: async () => {
          calls.generateOfflineQr++;
          return 'R1-KHQR';
        },
      },
      checkout: {
        createTransaction: async () => {
          calls.checkout++;
          return {};
        },
      },
    } as unknown as PayWay,
    calls,
  };
}

function approvedOptions(payway: PayWay): OrchestratorOptions {
  return { tty: false, environment: 'sandbox', flag: 'approve', payway };
}

function createOrchestrator(deps: OrchestratorDeps): AgentOrchestrator {
  return new AgentOrchestrator({ ...deps, artifactRoot, artifactRootOverrideConfirmed: true });
}

describe('R1 ledger replay guard', () => {
  it('rejects a submitted create record without another SDK create call', async () => {
    const record = createExecutionRecord({
      sessionId: 'submitted-session',
      tool: 'generate_online_qr',
      transactionId: null,
    });
    const confirmed = confirmExecution(record.executionId);
    const submitted = markSubmitted(confirmed.executionId);
    const { payway, calls } = makePayWay();

    const result = await executeAction(
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: confirmed.transactionId!,
        callbackUrl: 'https://pay.example.test/callback',
      },
      { context: makeContext(), sessionId: submitted.sessionId, execution: submitted, payway },
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'RECOVERY_REQUIRED' } });
    expect(calls.generateQr).toBe(0);
  });
});

describe('R1 model path confinement', () => {
  it('requires an explicit confirmed override before a caller can use a non-default artifact root', async () => {
    await expect(
      saveQrArtifact({ content: 'receipt', root: artifactRoot, sessionId: 'human-confirmation-required' }),
    ).rejects.toThrow(/confirmed root override/);
  });

  it('does not allow a provider save_artifact action to write to an external root', async () => {
    const externalRoot = path.join(path.dirname(artifactRoot), 'external-artifacts');
    const provider = new FakeProvider({
      version: 'agent-plan/v1',
      request: 'save the receipt',
      actions: [{ tool: 'save_artifact', content: 'receipt', root: externalRoot }],
    } as unknown as AgentPlanV1);
    const { payway } = makePayWay();
    const result = await createOrchestrator({ context: makeContext(), provider, providerConfig: privacyConfig() }).runOneShot(
      'save the receipt',
      approvedOptions(payway),
    );

    expect(result.status).toBe('failed');
    expect(existsSync(externalRoot)).toBe(false);
    expect(existsSync(artifactRoot)).toBe(false);
  });
});

describe('R1 pre-authorization risk gate', () => {
  it.each([
    ['fractional KHR amount', onlineQrPlan({ amount: 1.5, currency: 'KHR' })],
    ['over-precise USD amount', onlineQrPlan({ amount: 1.234, currency: 'USD' })],
    ['private callback URL', onlineQrPlan({ callbackUrl: 'https://127.0.0.1/callback' })],
  ])('blocks %s before creating a ledger record or calling the SDK', async (_name, plan) => {
    const provider = new FakeProvider(plan);
    const { payway, calls } = makePayWay();
    const result = await createOrchestrator({ context: makeContext(), provider, providerConfig: privacyConfig() }).runOneShot(
      'make payment',
      approvedOptions(payway),
    );

    expect(result.status).toBe('blocked');
    expect(calls.generateQr).toBe(0);
    expect(existsSync(getAgentDataPaths().ledgerDir)).toBe(false);
  });

  it.each([
    'https://127.0.0.2/callback',
    'https://10.0.0.1/callback',
    'https://172.16.0.1/callback',
    'https://192.168.0.1/callback',
    'https://169.254.1.1/callback',
    'https://[::1]/callback',
    'https://[fc00::1]/callback',
  ])('blocks non-public literal callback URL %s before ledger or SDK activity', async (callbackUrl) => {
    const provider = new FakeProvider(onlineQrPlan({ callbackUrl }));
    const { payway, calls } = makePayWay();
    const result = await createOrchestrator({ context: makeContext(), provider, providerConfig: privacyConfig() }).runOneShot(
      'make payment',
      approvedOptions(payway),
    );

    expect(result.status).toBe('blocked');
    expect(calls.generateQr).toBe(0);
    expect(existsSync(getAgentDataPaths().ledgerDir)).toBe(false);
  });

  it('blocks private checkout return and cancel URLs before ledger or SDK activity', async () => {
    const provider = new FakeProvider({
      version: 'agent-plan/v1',
      request: 'checkout',
      actions: [
        {
          tool: 'create_checkout_payload',
          amount: 3,
          currency: 'USD',
          transactionId: null,
          returnUrl: 'https://10.1.2.3/return',
          cancelUrl: 'https://192.168.2.3/cancel',
        },
      ],
    });
    const { payway, calls } = makePayWay();
    const result = await createOrchestrator({ context: makeContext(), provider, providerConfig: privacyConfig() }).runOneShot(
      'checkout',
      approvedOptions(payway),
    );

    expect(result.status).toBe('blocked');
    expect(calls.checkout).toBe(0);
    expect(existsSync(getAgentDataPaths().ledgerDir)).toBe(false);
  });
});

describe('R1 materialized plan validation', () => {
  it('rejects an invalid materialized plan before invoking the executor', async () => {
    const provider = new FakeProvider(onlineQrPlan({ transactionId: 'tx-id-too-long-for-materialized-plan' }));
    const { payway, calls } = makePayWay();
    const result = await createOrchestrator({ context: makeContext(), provider, providerConfig: privacyConfig() }).runOneShot(
      'make payment',
      approvedOptions(payway),
    );

    expect(result).toMatchObject({ status: 'failed', error: { code: 'INVALID_MATERIALIZED_PLAN' } });
    expect(calls.generateQr).toBe(0);
  });
});

describe('R1 privacy and provider context boundaries', () => {
  it('blocks echoed profile secrets in transactionId or merchantRef before ledger or SDK execution', async () => {
    const apiKey = 'api-key-canary-17';
    const merchantId = 'merchant-id-canary-17';
    const onlineProvider = new FakeProvider(onlineQrPlan({ transactionId: apiKey, rationale: merchantId }));
    const onlinePayWay = makePayWay();
    const onlineResult = await createOrchestrator({
      context: makeContext({ apiKey, merchantId }),
      provider: onlineProvider,
      providerConfig: privacyConfig(),
    }).runOneShot('make payment', approvedOptions(onlinePayWay.payway));

    const offlineProvider = new FakeProvider({
      version: 'agent-plan/v1',
      request: 'make khqr',
      actions: [{ tool: 'generate_offline_khqr', currency: 'KHR', merchantRef: apiKey }],
    });
    const offlinePayWay = makePayWay();
    const offlineResult = await createOrchestrator({
      context: makeContext({
        apiKey,
        merchantId,
        khqr: {
          bakongId: 'merchant@aba',
          abaMerchantId: '123456789012345',
          acquirerName: 'ABA',
          merchantCategoryCode: '1234',
          merchantName: 'Merchant',
          merchantCity: 'Phnom Penh',
          paywayData: 'x'.repeat(20),
        },
      }),
      provider: offlineProvider,
      providerConfig: privacyConfig(),
    }).runOneShot('make khqr', approvedOptions(offlinePayWay.payway));

    for (const result of [onlineResult, offlineResult]) {
      expect(result).toMatchObject({ status: 'blocked', error: { code: 'UNTRUSTED_ACTION_VALUE' } });
      expect(JSON.stringify(result)).not.toContain(apiKey);
      expect(JSON.stringify(result)).not.toContain(merchantId);
      expect(JSON.stringify(loadSession(result.sessionId!))).not.toContain(apiKey);
      expect(JSON.stringify(loadSession(result.sessionId!))).not.toContain(merchantId);
      expect(existsSync(artifactRoot)).toBe(false);
    }
    expect(onlinePayWay.calls.generateQr).toBe(0);
    expect(offlinePayWay.calls.generateOfflineQr).toBe(0);
    expect(onlineProvider.lastRequest).not.toContain(apiKey);
    expect(onlineProvider.lastContext).not.toContain(apiKey);
    expect(existsSync(getAgentDataPaths().ledgerDir)).toBe(false);
  });

  it('scrubs action and nested-plan canaries from provider input, session, command result, and artifact metadata', async () => {
    process.env.PAYWAY_AGENT_API_KEY = 'PROVIDER-API-CANARY';
    const provider = new FakeProvider({
      ...onlineQrPlan({ rationale: 'PAYWAY-API-CANARY' }),
      context: { optional: { signingMaterial: 'PAYWAY-SIGNING-CANARY', providerKey: 'PROVIDER-API-CANARY' } },
    });
    const { payway } = makePayWay();
    const result = await createOrchestrator({ context: makeContext(), provider, providerConfig: privacyConfig() }).runOneShot(
      'make payment',
      approvedOptions(payway),
    );
    delete process.env.PAYWAY_AGENT_API_KEY;

    const session = loadSession(result.sessionId!);
    const serialized = JSON.stringify(result);
    const sessionSerialized = JSON.stringify(session);
    const artifact = result.actions?.[0].artifact as { path: string };
    const metadata = readFileSync(artifact.path.replace(/\.png$/, '.json'), 'utf8');
    for (const channel of [provider.lastRequest, provider.lastContext, serialized, sessionSerialized, metadata]) {
      expect(channel).not.toContain('PAYWAY-API-CANARY');
      expect(channel).not.toContain('PAYWAY-SIGNING-CANARY');
      expect(channel).not.toContain('PROVIDER-API-CANARY');
    }
  });

  it('passes a deterministic bounded summary to the provider instead of raw session history', async () => {
    const session = createSession('history-context');
    for (let index = 0; index < 20; index++) {
      appendSessionEvent(session.sessionId, { type: 'prompt', data: { text: `history-${index}` } });
    }
    const provider = new FakeProvider(onlineQrPlan());
    const { payway } = makePayWay();
    await createOrchestrator({
      context: makeContext(),
      provider,
      sessionId: session.sessionId,
      providerConfig: privacyConfig(),
    }).runOneShot('make payment', approvedOptions(payway));

    const summary = JSON.parse(provider.lastContext!) as { events: unknown[] };
    expect(summary.events).toHaveLength(12);
    expect(provider.lastContext).not.toContain('history-0');
    expect(provider.lastContext).toContain('history-19');
  });
});
