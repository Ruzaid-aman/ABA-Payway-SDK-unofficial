/**
 * TDD tests for TASK-009 — typed PayWay tool registry and executor.
 *
 * Uses a fully mocked PayWay client (supplied via ExecutionContext.payway) and
 * mocks the ledger + local artifact/clipboard/open modules so tests are
 * deterministic and touch no network or host shell.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentToolName, ExecutionRecordV1, MaterializedAgentAction } from '../agent/contracts.js';
import { type ExecutionContext, executeAction } from '../agent/executor.js';
import type { PayWay } from '../client.js';
import { PayWayNetworkError } from '../errors.js';

vi.mock('../agent/ledger.js', () => ({
  markSubmitted: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
  markOutcomeUnknown: vi.fn(),
}));

vi.mock('../agent/artifacts.js', async () => {
  const actual = await vi.importActual<typeof import('../agent/artifacts.js')>('../agent/artifacts.js');
  return {
    ...actual,
    saveQrArtifact: vi.fn(async () => ({
      metadata: { artifactId: 'art-1', path: '/tmp/art.png', kind: 'qr' },
    })),
  };
});

vi.mock('../agent/local-tools.js', async () => {
  const actual = await vi.importActual<typeof import('../agent/local-tools.js')>('../agent/local-tools.js');
  return {
    ...actual,
    openArtifact: vi.fn(async () => undefined),
    copyToClipboard: vi.fn(async () => undefined),
  };
});

import { saveQrArtifact } from '../agent/artifacts.js';
import { markFailed, markOutcomeUnknown, markSubmitted, markSucceeded } from '../agent/ledger.js';
import { copyToClipboard, openArtifact } from '../agent/local-tools.js';

function makePayWay(): PayWay {
  const fn = (impl: (...args: unknown[]) => unknown) => vi.fn(impl);
  return {
    qr: {
      generateQr: fn(async () => ({ qrString: 'QR', qrImage: 'IMG' })),
      generateOfflineQR: fn(() => 'OFFLINE_QR'),
    },
    khqr: {
      generateOfflineQR: fn(() => 'OFFLINE_QR'),
      getTransactionsByMerchantRef: fn(async () => ({ status: 0, transactions: [] })),
    },
    checkout: {
      createTransaction: fn(() => ({ tran_id: 'tx', hash: 'H' })),
      purchase: fn(async () => ({ qr_string: 'Q', abapay_deeplink: 'D', checkout_qr_url: 'U' })),
      checkTransaction: fn(async () => ({ status: { code: '0' } })),
      pollTransactionStatus: fn(() => {
        async function* gen() {
          yield {
            transactionId: 'tx1',
            attempt: 1,
            response: {},
            paymentStatus: 'APPROVED',
            isTerminal: true,
            durationMs: 1,
            timestamp: '',
          };
        }
        return gen();
      }),
    },
    paymentLink: {
      create: fn(async () => ({ status: { code: '0' }, data: { id: 'pl1', payment_link: 'https://link-sandbox/ABAPAY1' }, tran_id: 123 })),
      getDetails: fn(async () => ({
        status: { code: '00', message: 'Success' },
        data: { id: 'pl1', status: 'OPEN', total_trxn: 0, total_amount: 0, payment_link: 'https://link/pl1' },
      })),
    },
  } as unknown as PayWay;
}

function makeRecord(
  status: ExecutionRecordV1['status'],
  overrides: Partial<ExecutionRecordV1> = {},
): ExecutionRecordV1 {
  return {
    version: 'agent-ledger/v1',
    executionId: 'exec-1',
    sessionId: 'sess-1',
    tool: 'generate_online_qr',
    transactionId: 'tx1',
    status,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeExecContext(payway: PayWay, record: ExecutionRecordV1): ExecutionContext {
  return {
    context: {
      source: 'option',
      environment: 'sandbox',
      merchantId: 'm',
      apiKey: 'k',
      displayLabel: 'l',
    },
    sessionId: 'sess-1',
    session: {
      version: 'agent-session/v1',
      sessionId: 'sess-1',
      createdAt: '',
      updatedAt: '',
      contextLabel: 'test',
      events: [],
    },
    execution: record,
    payway,
  };
}

function createAction(tool: AgentToolName): MaterializedAgentAction {
  switch (tool) {
    case 'generate_online_qr':
      return {
        tool,
        amount: 10,
        currency: 'USD',
        transactionId: 'tx1',
        callbackUrl: 'https://cb',
        lifetime: 300,
        paymentOption: 'abapay_khqr',
        template: 'template2',
      } as unknown as MaterializedAgentAction;
    case 'generate_offline_khqr':
      return { tool, amount: 5, currency: 'KHR', merchantRef: 'ref1' } as unknown as MaterializedAgentAction;
    case 'create_checkout_payload':
      return {
        tool,
        amount: 10,
        currency: 'USD',
        transactionId: 'tx2',
        paymentOption: 'cards',
        returnUrl: 'https://r',
        cancelUrl: 'https://c',
      } as unknown as MaterializedAgentAction;
    case 'create_checkout_purchase':
      return {
        tool,
        amount: 10,
        currency: 'USD',
        transactionId: 'tx3',
        paymentOption: 'cards',
        returnUrl: 'https://r',
        cancelUrl: 'https://c',
      } as unknown as MaterializedAgentAction;
    case 'create_payment_link':
      return {
        tool,
        title: 'T',
        amount: 20,
        currency: 'USD',
        merchantRefNo: 'mref',
        returnUrl: 'https://ret',
        payout: [{ acc: '000111222', amt: 20 }],
      } as unknown as MaterializedAgentAction;
    default:
      throw new Error('not a create tool');
  }
}

const READ_ACTIONS: Array<[AgentToolName, () => MaterializedAgentAction]> = [
  [
    'check_transaction',
    () => ({ tool: 'check_transaction', transactionId: 'tx9' }) as unknown as MaterializedAgentAction,
  ],
  [
    'check_transaction_by_merchant_ref',
    () =>
      ({
        tool: 'check_transaction_by_merchant_ref',
        merchantRef: 'mref',
        requestTime: '20240101',
      }) as unknown as MaterializedAgentAction,
  ],
  [
    'get_payment_link_details',
    () => ({ tool: 'get_payment_link_details', paymentLinkId: 'pl1' }) as unknown as MaterializedAgentAction,
  ],
  [
    'poll_transaction',
    () =>
      ({
        tool: 'poll_transaction',
        transactionId: 'tx1',
        interval: 1000,
        timeout: 5000,
      }) as unknown as MaterializedAgentAction,
  ],
  ['save_artifact', () => ({ tool: 'save_artifact', qrString: 'QR', name: 'n' }) as unknown as MaterializedAgentAction],
  ['open_artifact', () => ({ tool: 'open_artifact', reference: 'https://x' }) as unknown as MaterializedAgentAction],
  ['copy_to_clipboard', () => ({ tool: 'copy_to_clipboard', text: 'T' }) as unknown as MaterializedAgentAction],
];

const CREATE_TOOLS: AgentToolName[] = [
  'generate_online_qr',
  'generate_offline_khqr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
];

function domainCalls(tool: AgentToolName, pw: PayWay): number {
  switch (tool) {
    case 'generate_online_qr':
      return (pw.qr.generateQr as ReturnType<typeof vi.fn>).mock.calls.length;
    case 'generate_offline_khqr':
      return (pw.khqr.generateOfflineQR as ReturnType<typeof vi.fn>).mock.calls.length;
    case 'create_checkout_payload':
      return (pw.checkout.createTransaction as ReturnType<typeof vi.fn>).mock.calls.length;
    case 'create_checkout_purchase':
      return (pw.checkout.purchase as ReturnType<typeof vi.fn>).mock.calls.length;
    case 'create_payment_link':
      return (pw.paymentLink.create as ReturnType<typeof vi.fn>).mock.calls.length;
    case 'get_payment_link_details':
      return (pw.paymentLink.getDetails as ReturnType<typeof vi.fn>).mock.calls.length;
    default:
      return 0;
  }
}

describe('TASK-009 tool registry + executor', () => {
  let payway: PayWay;

  beforeEach(() => {
    vi.clearAllMocks();
    payway = makePayWay();
  });

  for (const tool of CREATE_TOOLS) {
    it(`create ${tool}: invoked exactly once, ledger submitted+succeeded`, async () => {
      const record = makeRecord('confirmed', { tool });
      const ctx = makeExecContext(payway, record);
      const result = await executeAction(createAction(tool), ctx);

      expect(result.ok).toBe(true);
      expect(vi.mocked(markSubmitted)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(markSubmitted)).toHaveBeenCalledWith('exec-1');
      expect(vi.mocked(markSucceeded)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(markFailed)).not.toHaveBeenCalled();
      expect(vi.mocked(markOutcomeUnknown)).not.toHaveBeenCalled();
      expect(domainCalls(tool, payway)).toBe(1);
    });
  }

  it('create action with status submitted requires recovery and never runs again', async () => {
    const record = makeRecord('submitted', { tool: 'generate_online_qr' });
    const ctx = makeExecContext(payway, record);
    const result = await executeAction(createAction('generate_online_qr'), ctx);
    expect(result).toMatchObject({ ok: false, error: { code: 'RECOVERY_REQUIRED' } });
    expect(vi.mocked(markSubmitted)).not.toHaveBeenCalled();
    expect(vi.mocked(markSucceeded)).not.toHaveBeenCalled();
    expect(domainCalls('generate_online_qr', payway)).toBe(0);
  });

  it('create action requires recovery when ledger is not confirmed', async () => {
    const record = makeRecord('planned', { tool: 'generate_online_qr' });
    const ctx = makeExecContext(payway, record);
    const result = await executeAction(createAction('generate_online_qr'), ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('RECOVERY_REQUIRED');
    expect(domainCalls('generate_online_qr', payway)).toBe(0);
    expect(vi.mocked(markSubmitted)).not.toHaveBeenCalled();
  });

  it('generate_online_qr passes exact SDK params', async () => {
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'generate_online_qr' }));
    await executeAction(createAction('generate_online_qr'), ctx);
    const call = (payway.qr.generateQr as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      transactionId: 'tx1',
      amount: 10,
      currency: 'USD',
      callbackUrl: 'https://cb',
      lifetime: 300,
      paymentOption: 'abapay_khqr',
      qrImageTemplate: 'template2',
    });
  });

  it('generate_offline_khqr passes amount/currency/merchantRef', async () => {
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'generate_offline_khqr' }));
    const result = await executeAction(createAction('generate_offline_khqr'), ctx);
    expect(result.data?.qrString).toBe('OFFLINE_QR');
    const call = (payway.khqr.generateOfflineQR as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({ amount: 5, currency: 'KHR', merchantRef: 'ref1' });
  });

  it('create_checkout_purchase normalizes qr_string/deeplink/hosted url', async () => {
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'create_checkout_purchase' }));
    const result = await executeAction(createAction('create_checkout_purchase'), ctx);
    expect(result.data).toMatchObject({ qrString: 'Q', deeplink: 'D', hostedQrUrl: 'U' });
  });

  it('create_payment_link passes mapped params incl. payout', async () => {
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'create_payment_link' }));
    await executeAction(createAction('create_payment_link'), ctx);
    const call = (payway.paymentLink.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      title: 'T',
      amount: 20,
      currency: 'USD',
      merchantRefNo: 'mref',
      returnUrl: 'https://ret',
      payout: [{ acc: '000111222', amt: 20 }],
    });
  });

  it('create_payment_link surfaces the shareUrl (C8)', async () => {
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'create_payment_link' }));
    const result = await executeAction(createAction('create_payment_link'), ctx);
    expect(result.data?.shareUrl).toBe('https://link-sandbox/ABAPAY1');
  });

  it('get_payment_link_details resolves the read tool with normalized fields', async () => {
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'get_payment_link_details' }));
    const result = await executeAction(
      { tool: 'get_payment_link_details', paymentLinkId: 'pl1' } as unknown as MaterializedAgentAction,
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('get_payment_link_details');
    expect(result.data).toMatchObject({
      paymentLinkId: 'pl1',
      status: 'OPEN',
      totalTrxn: 0,
      paymentLink: 'https://link/pl1',
    });
    expect((payway.paymentLink.getDetails as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('pl1');
  });

  it('outcome_unknown on simulated network timeout', async () => {
    (payway.qr.generateQr as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new PayWayNetworkError('timed out'));
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'generate_online_qr' }));
    const result = await executeAction(createAction('generate_online_qr'), ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('OUTCOME_UNKNOWN');
    expect(vi.mocked(markOutcomeUnknown)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markSucceeded)).not.toHaveBeenCalled();
  });

  it('deterministic business error marks failed (not outcome_unknown)', async () => {
    (payway.checkout.purchase as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: { code: 'PTL04', message: 'bad amount' },
    });
    const ctx = makeExecContext(payway, makeRecord('confirmed', { tool: 'create_checkout_purchase' }));
    const result = await executeAction(createAction('create_checkout_purchase'), ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PTL04');
    expect(vi.mocked(markFailed)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markOutcomeUnknown)).not.toHaveBeenCalled();
  });

  for (const [tool, make] of READ_ACTIONS) {
    it(`read ${tool}: routed to SDK/local tool, no ledger gating`, async () => {
      const record = makeRecord('confirmed', { tool });
      const ctx = makeExecContext(payway, record);
      const result = await executeAction(make(), ctx);
      expect(result.ok).toBe(true);
      expect(vi.mocked(markSubmitted)).not.toHaveBeenCalled();
      expect(vi.mocked(markSucceeded)).not.toHaveBeenCalled();
    });
  }

  it('check_transaction passes transactionId', async () => {
    await executeAction(
      { tool: 'check_transaction', transactionId: 'tx9' } as unknown as MaterializedAgentAction,
      makeExecContext(payway, makeRecord('confirmed', { tool: 'check_transaction' })),
    );
    expect((payway.checkout.checkTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('tx9');
  });

  it('check_transaction_by_merchant_ref passes ref + requestTime', async () => {
    await executeAction(
      {
        tool: 'check_transaction_by_merchant_ref',
        merchantRef: 'mref',
        requestTime: '20240101',
      } as unknown as MaterializedAgentAction,
      makeExecContext(payway, makeRecord('confirmed', { tool: 'check_transaction_by_merchant_ref' })),
    );
    const call = (payway.khqr.getTransactionsByMerchantRef as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('mref');
    expect(call[1]).toBe('20240101');
  });

  it('poll_transaction bounds via intervalMs/maxDurationMs', async () => {
    await executeAction(
      {
        tool: 'poll_transaction',
        transactionId: 'tx1',
        interval: 1000,
        timeout: 5000,
      } as unknown as MaterializedAgentAction,
      makeExecContext(payway, makeRecord('confirmed', { tool: 'poll_transaction' })),
    );
    const opts = (payway.checkout.pollTransactionStatus as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts).toMatchObject({ intervalMs: 1000, maxDurationMs: 5000 });
  });

  it('save_artifact wired to saveQrArtifact with sessionId', async () => {
    await executeAction(
      { tool: 'save_artifact', qrString: 'QR', name: 'n' } as unknown as MaterializedAgentAction,
      makeExecContext(payway, makeRecord('confirmed', { tool: 'save_artifact' })),
    );
    expect(saveQrArtifact).toHaveBeenCalledTimes(1);
    const input = (saveQrArtifact as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.sessionId).toBe('sess-1');
    expect(input.qrString).toBe('QR');
  });

  it('open_artifact wired to openArtifact', async () => {
    const activeSession = {
      version: 'agent-session/v1' as const,
      sessionId: 'sess-1',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
      contextLabel: 'r3',
      events: [
        {
          type: 'artifact' as const,
          at: '2026-08-22T00:00:00.000Z',
          data: { artifactId: 'artifact-r3', path: 'payway-output/receipt.json' },
        },
      ],
    };
    const executionContext = {
      ...makeExecContext(payway, makeRecord('confirmed', { tool: 'open_artifact' })),
      session: activeSession,
    } as ExecutionContext & { session: typeof activeSession };
    await executeAction(
      { tool: 'open_artifact', reference: 'https://x' } as unknown as MaterializedAgentAction,
      executionContext,
    );
    expect(openArtifact).toHaveBeenCalledTimes(1);
    expect((openArtifact as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('https://x');
    expect((openArtifact as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(activeSession);
  });

  it('copy_to_clipboard wired to copyToClipboard', async () => {
    await executeAction(
      { tool: 'copy_to_clipboard', text: 'T' } as unknown as MaterializedAgentAction,
      makeExecContext(payway, makeRecord('confirmed', { tool: 'copy_to_clipboard' })),
    );
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect((copyToClipboard as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('T');
  });
});
