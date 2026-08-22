/**
 * TDD tests for TASK-010 — headless conversation orchestrator.
 *
 * Uses a MOCKED provider adapter (canned AgentPlanV1) and a MOCKED PayWay
 * (passed via OrchestratorOptions.payway). Deterministic, no real network.
 * Coverage: one-shot success (online QR, sandbox, --approve), clarification,
 * cancellation, privacy refusal, provider failure, invalid plan, consent
 * (non-TTY without --approve => needs_confirmation, zero PayWay calls),
 * unknown outcome, resume (no write approval restored), polling offer.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteractivePlanConfirmation, promptConfirm } from '../cli/commands/agent.js';
import type { ResolvedPayWayContext } from '../agent/context.js';
import type { AgentPlanV1, ProviderConfigV1 } from '../agent/contracts.js';
import { AgentOrchestrator, type OrchestratorDeps, type OrchestratorOptions } from '../agent/orchestrator.js';
import { type ProviderAdapter, ProviderProposalError } from '../agent/provider.js';
import { validateCommandResult } from '../agent/schemas.js';
import type { PayWay } from '../client.js';
import { PayWayNetworkError } from '../errors.js';

const tempDirs: string[] = [];
const originalAppData = process.env.APPDATA;
let artifactRoot = '';

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-orch-'));
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

// ─── Builders ────────────────────────────────────────────────────────────────

class FakeProvider implements ProviderAdapter {
  constructor(private readonly impl: (request: string) => Promise<AgentPlanV1>) {}
  propose(request: string): Promise<AgentPlanV1> {
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

interface FakePayWay {
  payway: PayWay;
  calls: { generateQr: number; createTransaction: number; purchase: number; paymentLink: number };
}

function makePayWay(opts: { generateQrError?: Error } = {}): FakePayWay {
  const calls = { generateQr: 0, createTransaction: 0, purchase: 0, paymentLink: 0 };
  const payway = {
    qr: {
      generateQr: async (..._args: unknown[]) => {
        calls.generateQr++;
        if (opts.generateQrError) throw opts.generateQrError;
        return { qrString: 'QRDATA-123', qrImage: 'IMG' };
      },
    },
    khqr: {
      generateOfflineQR: async () => 'khqr',
      getTransactionsByMerchantRef: async () => ({}),
    },
    checkout: {
      createTransaction: async (..._a: unknown[]) => {
        calls.createTransaction++;
        return {};
      },
      purchase: async (..._a: unknown[]) => {
        calls.purchase++;
        return {};
      },
      checkTransaction: async () => ({}),
      pollTransactionStatus: async function* () {},
    },
    paymentLink: {
      create: async (..._a: unknown[]) => {
        calls.paymentLink++;
        return {};
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

function createOrchestrator(deps: OrchestratorDeps): AgentOrchestrator {
  return new AgentOrchestrator({ ...deps, artifactRoot, artifactRootOverrideConfirmed: true });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator — one-shot success', () => {
  it('generates an online QR in sandbox with --approve, saves artifact, offers polling', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.generateQr).toBe(1);
    expect(result.actions?.[0].ok).toBe(true);
    expect(result.actions?.[0].artifact).toBeTruthy();
    expect((result.actions?.[0].artifact as { path?: string }).path).toMatch(/payway-output/);
    expect(result.message).toMatch(/poll/i);
    expect(result.executionIds?.length).toBe(1);
    expect(validateCommandResult(result)).toBe(true);
  });
});

describe('AgentOrchestrator — clarification', () => {
  it('returns needs_clarification and makes zero PayWay calls when route is unavailable', async () => {
    // No public callback => online QR readiness fails => clarification.
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({
      context: makeContext({ callbackUrl: undefined }),
      provider,
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('needs_clarification');
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });
});

describe('AgentOrchestrator — cancellation', () => {
  it('records a cancellation event, leaves session usable, zero PayWay calls', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });
    const sessionId = 'cancel-session-id';

    const result = await orch.runTurn(sessionId, 'cancel', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    expect(result.message).toMatch(/cancel/i);
    // Session remains usable (cancellation event persisted, loadable).
    const { loadSession } = await import('../agent/sessions.js');
    const session = loadSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.events.some((e) => e.type === 'cancellation')).toBe(true);
    expect(validateCommandResult(result)).toBe(true);
  });
});

describe('AgentOrchestrator — privacy refusal', () => {
  it('blocks without acknowledgement and never calls the provider/PayWay', async () => {
    const propose = vi.fn(async () => onlineQrPlan());
    const provider = new FakeProvider(propose);
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(false),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('blocked');
    expect(result.error?.code).toBe('PRIVACY_ACK_REQUIRED');
    expect(propose).not.toHaveBeenCalled();
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('proceeds when privacyAcknowledgedAt is present', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({
      context: makeContext(),
      provider,
      providerConfig: privacyConfig(true),
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(calls.generateQr).toBe(1);
  });
});

describe('AgentOrchestrator — provider failure / invalid plan', () => {
  it('returns failed on ProviderProposalError with zero PayWay calls', async () => {
    const provider = new FakeProvider(async () => {
      throw new ProviderProposalError('model refused');
    });
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('failed');
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('returns failed when propose returns an invalid (garbage) plan', async () => {
    const provider = new FakeProvider(async () => {
      return { version: 'agent-plan/v1', request: 'x', actions: [{ tool: 'not_a_tool' }] } as unknown as AgentPlanV1;
    });
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_PLAN');
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });
});

describe('AgentOrchestrator — consent', () => {
  it('executes a TTY create only after its fresh confirmation callback accepts the complete proposal', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });
    let proposal: unknown;

    const result = await orch.runOneShot(
      'pay $3',
      {
        ...baseOptions({ tty: true, payway }),
        confirmCreatePlan: async (candidate: unknown) => {
          proposal = candidate;
          return true;
        },
      } as OrchestratorOptions,
    );

    expect(result.status).toBe('succeeded');
    expect(calls.generateQr).toBe(1);
    expect(proposal).toMatchObject({
      context: 'profile: test (sandbox)',
      environment: 'sandbox',
      actions: [
        {
          route: 'generate_online_qr',
          money: '3 USD',
          transactionIdStrategy: expect.stringMatching(/^generated: tx[0-9a-f]+$/),
          lifetime: 900,
          urls: ['callback: https://pay.example.com/cb'],
        },
      ],
    });
  });

  it('records a declined TTY create confirmation and leaves the session usable without a PayWay call', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });
    const sessionId = 'declined-confirmation-session';

    const result = await orch.runTurn(
      sessionId,
      'pay $3',
      {
        ...baseOptions({ tty: true, payway }),
        confirmCreatePlan: async () => false,
      } as OrchestratorOptions,
    );

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    const { loadSession } = await import('../agent/sessions.js');
    expect(loadSession(sessionId)?.events.some((event) => event.type === 'cancellation')).toBe(true);

    const retry = await orch.runTurn(sessionId, 'pay $3', baseOptions({ flag: 'approve', payway }));
    expect(retry.status).toBe('succeeded');
    expect(calls.generateQr).toBe(1);
  });

  it('does not execute a PayWay create when the real confirmation prompt reaches EOF', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });
    const confirmation = createInteractivePlanConfirmation((message) =>
      promptConfirm(message, () => ({
        question: (_prompt, callback) => (callback as (answer: string) => void)(undefined as never),
        close: () => undefined,
      })),
    );

    const result = await orch.runOneShot('pay $3', baseOptions({ tty: true, payway, confirmCreatePlan: confirmation }));

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
  });

  it('records cancellation and makes no PayWay call when the real confirmation prompt answers n', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });
    const confirmation = createInteractivePlanConfirmation((message) =>
      promptConfirm(message, () => ({
        question: (_prompt, callback) => (callback as (answer: string) => void)('n'),
        close: () => undefined,
      })),
    );

    const result = await orch.runOneShot('pay $3', baseOptions({ tty: true, payway, confirmCreatePlan: confirmation }));

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    const { loadSession } = await import('../agent/sessions.js');
    expect(loadSession(result.sessionId ?? '')?.events.some((event) => event.type === 'cancellation')).toBe(true);
  });

  it('uses a generic warning when an interactive confirmation callback fails', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await orch.runOneShot(
      'pay $3',
      baseOptions({
        tty: true,
        payway,
        confirmCreatePlan: async () => {
          throw new Error('raw-confirmation-secret');
        },
      }),
    );

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    expect(warning).toHaveBeenCalledWith('Confirmation prompt failed; treating the create plan as declined.');
    expect(warning.mock.calls.flat().join(' ')).not.toContain('raw-confirmation-secret');
  });

  it('non-TTY without --approve => needs_confirmation and zero PayWay calls', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });

    const result = await orch.runOneShot('pay $3', baseOptions({ tty: false, payway }));

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    // A planned ledger record is local only; no SDK call occurred.
    expect(validateCommandResult(result)).toBe(true);
  });

  it('non-TTY with --yolo in production => needs_confirmation, zero PayWay calls', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({
      context: makeContext({ environment: 'production' }),
      provider,
    });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'yolo', environment: 'production', payway }));

    expect(result.status).toBe('needs_confirmation');
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });

  it('never treats production --yolo as interactive confirmation authority', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay();
    const orch = createOrchestrator({
      context: makeContext({ environment: 'production' }),
      provider,
    });
    let confirmations = 0;

    const result = await orch.runOneShot(
      'pay $3',
      baseOptions({
        tty: true,
        flag: 'yolo',
        environment: 'production',
        payway,
        confirmCreatePlan: async () => {
          confirmations++;
          return true;
        },
      }),
    );

    expect(result.status).toBe('blocked');
    expect(confirmations).toBe(0);
    expect(calls.generateQr).toBe(0);
  });
});

describe('AgentOrchestrator — unknown outcome', () => {
  it('records outcome_unknown and reports failure after a network error', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway, calls } = makePayWay({
      generateQrError: new PayWayNetworkError('connection reset'),
    });
    const orch = createOrchestrator({ context: makeContext(), provider });
    const sessionId = 'unknown-session-id';

    const result = await orch.runTurn(sessionId, 'pay $3', baseOptions({ flag: 'approve', payway }));

    expect(calls.generateQr).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.actions?.[0].error).toMatchObject({ code: 'OUTCOME_UNKNOWN' });
    expect(result.message).toMatch(/unknown outcome/i);
    expect(validateCommandResult(result)).toBe(true);

    const { findUnfinishedExecutions } = await import('../agent/ledger.js');
    const unfinished = findUnfinishedExecutions(sessionId);
    expect(unfinished.length).toBe(1);
    expect(unfinished[0].status).toBe('outcome_unknown');
  });
});

describe('AgentOrchestrator — resume', () => {
  it('resumes with needs_confirmation and never auto-approves a create', async () => {
    const propose = vi.fn(async () => onlineQrPlan());
    const provider = new FakeProvider(propose);
    const { payway, calls } = makePayWay();
    const sessionId = 'resume-session-id';
    // Seed a prior session.
    await createOrchestrator({ context: makeContext(), provider }).runTurn(
      sessionId,
      'pay $3',
      baseOptions({ flag: 'approve', payway }),
    );
    propose.mockClear();
    calls.generateQr = 0;

    const orch = createOrchestrator({ context: makeContext(), provider });
    const result = await orch.resume(sessionId);

    expect(result.status).toBe('needs_confirmation');
    expect(propose).not.toHaveBeenCalled();
    expect(calls.generateQr).toBe(0);
    expect(validateCommandResult(result)).toBe(true);
  });
});

describe('AgentOrchestrator — polling offer', () => {
  it('mentions polling in the success message for an online QR', async () => {
    const provider = new FakeProvider(async () => onlineQrPlan());
    const { payway } = makePayWay();
    const orch = createOrchestrator({ context: makeContext(), provider });

    const result = await orch.runOneShot('pay $3', baseOptions({ flag: 'approve', payway }));

    expect(result.status).toBe('succeeded');
    expect(result.message).toContain('poll_transaction action');
    expect(result.message).not.toContain('agent poll');
  });
});
