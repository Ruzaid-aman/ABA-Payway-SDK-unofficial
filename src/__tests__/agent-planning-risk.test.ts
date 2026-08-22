import { describe, expect, it } from 'vitest';
import type { AgentActionDraft, AgentPlanV1 } from '../agent/contracts.js';
import type { ResolvedPayWayContext } from '../agent/context.js';
import {
  defaultGenericOnlineQr,
  normalizePlan,
  GENERIC_QR_EXPLANATION,
  isReadOnlyTool,
} from '../agent/planning.js';
import { authorizePlan, classifyRisk } from '../agent/risk.js';
import type { RiskLevel } from '../agent/risk.js';

function makeContext(overrides: Partial<ResolvedPayWayContext> = {}): ResolvedPayWayContext {
  return {
    source: 'option',
    profileName: 'test',
    environment: 'sandbox',
    merchantId: 'merchant-test',
    apiKey: 'key-test',
    callbackUrl: 'https://cb.example.test/hook',
    khqr: {
      bakongId: 'bakong',
      abaMerchantId: '123456789012345',
      acquirerName: 'Acquirer',
      merchantCategoryCode: '1234',
      merchantName: 'Merchant',
      merchantCity: 'Phnom Penh',
      paywayData: 'data',
    },
    displayLabel: 'profile: test (sandbox)',
    ...overrides,
  };
}

function planWith(actions: AgentActionDraft[], request = 'test request'): AgentPlanV1 {
  return { version: 'agent-plan/v1', request, actions };
}

describe('normalizePlan — explicit routes accepted', () => {
  it('accepts an explicit offline KHQR plan without forcing clarification', () => {
    const ctx = makeContext();
    const plan = planWith([
      {
        tool: 'generate_offline_khqr',
        currency: 'KHR',
        merchantRef: 'ref-1',
        rationale: 'explicit offline',
      },
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.needsClarification).toBe(false);
    expect(res.plan.actions[0].tool).toBe('generate_offline_khqr');
  });

  it('keeps an explicit online QR lifetime and does not default it', () => {
    const ctx = makeContext();
    const plan = planWith([
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
        lifetime: 600,
      },
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.defaultsApplied).not.toContain(
      expect.stringContaining('lifetime defaulted'),
    );
    expect((res.plan.actions[0] as { lifetime?: number }).lifetime).toBe(600);
    expect(res.needsClarification).toBe(false);
  });

  it('defaults online QR lifetime to 900 when omitted', () => {
    const ctx = makeContext();
    const plan = planWith([
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
      },
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.defaultsApplied).toContain('online QR lifetime defaulted to 900 seconds');
    expect((res.plan.actions[0] as { lifetime?: number }).lifetime).toBe(900);
  });
});

describe('defaultGenericOnlineQr', () => {
  it('defaults a generic payment to online QR with 900s and the explanation', () => {
    const ctx = makeContext();
    const draft = defaultGenericOnlineQr('pay $3 please', ctx) as Extract<
      AgentActionDraft,
      { tool: 'generate_online_qr' }
    >;
    expect(draft.tool).toBe('generate_online_qr');
    expect(draft.amount).toBe(3);
    expect(draft.currency).toBe('USD');
    expect(draft.lifetime).toBe(900);
    expect(draft.rationale).toBe(GENERIC_QR_EXPLANATION);
  });

  it('parses KHR amounts from the request', () => {
    const ctx = makeContext();
    const draft = defaultGenericOnlineQr('please take 3000 KHR', ctx) as Extract<
      AgentActionDraft,
      { tool: 'generate_online_qr' }
    >;
    expect(draft.amount).toBe(3000);
    expect(draft.currency).toBe('KHR');
  });
});

describe('normalizePlan — clarification rules', () => {
  it('requires clarification for a bare online QR amount', () => {
    const ctx = makeContext();
    const plan = planWith([
      {
        tool: 'generate_online_qr',
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
      } as AgentActionDraft,
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.needsClarification).toBe(true);
    expect(res.clarification).toBeDefined();
  });

  it('does NOT substitute offline KHQR when the callback is missing', () => {
    const ctx = makeContext({ callbackUrl: undefined });
    const plan = planWith([
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: '',
      },
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.needsClarification).toBe(true);
    expect(res.plan.actions[0].tool).toBe('generate_online_qr');
    expect(res.plan.actions[0].tool).not.toBe('generate_offline_khqr');
  });
});

describe('normalizePlan — currency validation', () => {
  it('warns for USD with more than two decimals', () => {
    const ctx = makeContext();
    const plan = planWith([
      {
        tool: 'generate_online_qr',
        amount: 3.005,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
      },
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.warnings.some((w) => w.includes('USD') && w.includes('two decimals'))).toBe(true);
  });

  it('warns for KHR that is not an integer', () => {
    const ctx = makeContext();
    const plan = planWith([
      {
        tool: 'generate_online_qr',
        amount: 3000.5,
        currency: 'KHR',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
      },
    ]);
    const res = normalizePlan(plan, ctx);
    expect(res.warnings.some((w) => w.includes('KHR') && w.includes('integer'))).toBe(true);
  });
});

describe('classifyRisk', () => {
  it('marks read-only tools as safe', () => {
    const ctx = makeContext();
    const decision = classifyRisk(
      { tool: 'check_transaction', transactionId: 'abc-1' } as AgentActionDraft,
      ctx,
    );
    expect(decision.level).toBe('safe');
  });

  it('marks a sandbox create as sandbox', () => {
    const ctx = makeContext({ environment: 'sandbox' });
    const decision = classifyRisk(
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
      } as AgentActionDraft,
      ctx,
    );
    expect(decision.level).toBe('sandbox');
  });

  it('marks a production create as production', () => {
    const ctx = makeContext({ environment: 'production' });
    const decision = classifyRisk(
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: 'https://cb.example.test/hook',
      } as AgentActionDraft,
      ctx,
    );
    expect(decision.level).toBe('production');
  });

  it('blocks an unavailable create (online QR without callback)', () => {
    const ctx = makeContext({ callbackUrl: undefined });
    const decision = classifyRisk(
      {
        tool: 'generate_online_qr',
        amount: 3,
        currency: 'USD',
        transactionId: null,
        callbackUrl: '',
      } as AgentActionDraft,
      ctx,
    );
    expect(decision.level).toBe('blocked');
  });

  it('blocks an out-of-scope tool', () => {
    const ctx = makeContext();
    const decision = classifyRisk({ tool: 'unknown_tool' } as unknown as AgentActionDraft, ctx);
    expect(decision.level).toBe('blocked');
  });
});

describe('authorizePlan', () => {
  const createPlan = planWith([
    {
      tool: 'generate_online_qr',
      amount: 3,
      currency: 'USD',
      transactionId: null,
      callbackUrl: 'https://cb.example.test/hook',
      lifetime: 900,
    },
  ]);

  it('authorizes read-only plans without approval', () => {
    const readonlyPlan = planWith([{ tool: 'check_transaction', transactionId: 'abc-1' } as AgentActionDraft]);
    const res = authorizePlan(readonlyPlan, { tty: true, environment: 'production' });
    expect(res.authorized).toBe(true);
    expect(res.requireApproval).toBe(false);
    expect(res.scope).toBe('none');
  });

  it('requires confirmation for a sandbox create without a flag', () => {
    const res = authorizePlan(createPlan, { tty: true, environment: 'sandbox' });
    expect(res.authorized).toBe(false);
    expect(res.requireApproval).toBe(true);
    expect(res.scope).toBe('sandbox');
  });

  it('authorizes sandbox create with --yolo', () => {
    const res = authorizePlan(createPlan, { tty: false, flag: 'yolo', environment: 'sandbox' });
    expect(res.authorized).toBe(true);
    expect(res.requireApproval).toBe(false);
  });

  it('requires --approve for production and rejects --yolo', () => {
    const noFlag = authorizePlan(createPlan, { tty: true, environment: 'production' });
    expect(noFlag.authorized).toBe(false);

    const yolo = authorizePlan(createPlan, { tty: false, flag: 'yolo', environment: 'production' });
    expect(yolo.authorized).toBe(false);
    expect(yolo.scope).toBe('production');
    expect(yolo.requireApproval).toBe(true);

    const approve = authorizePlan(createPlan, { tty: false, flag: 'approve', environment: 'production' });
    expect(approve.authorized).toBe(true);
    expect(approve.requireApproval).toBe(false);
  });

  it('authorizes both environments with --approve', () => {
    const sandbox = authorizePlan(createPlan, { tty: false, flag: 'approve', environment: 'sandbox' });
    const production = authorizePlan(createPlan, { tty: false, flag: 'approve', environment: 'production' });
    expect(sandbox.authorized).toBe(true);
    expect(production.authorized).toBe(true);
  });

  it('requires approval in non-TTY without --approve', () => {
    const res = authorizePlan(createPlan, { tty: false, environment: 'sandbox' });
    expect(res.requireApproval).toBe(true);
    expect(res.authorized).toBe(false);
  });
});

describe('isReadOnlyTool', () => {
  it('identifies read-only and create tools', () => {
    expect(isReadOnlyTool('check_transaction')).toBe(true);
    expect(isReadOnlyTool('generate_online_qr')).toBe(false);
  });
});
