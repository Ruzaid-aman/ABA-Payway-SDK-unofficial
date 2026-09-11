/**
 * Agentic PayWay CLI — typed tool registry.
 *
 * Maps every {@link AgentToolName} to a single async executor that performs the
 * SDK call (or local operation) and returns a safe {@link ToolExecutionResult}.
 * The registry is closed and typed: every tool name must be present.
 *
 * Create actions (generate_online_qr, generate_offline_khqr,
 * create_checkout_payload, create_checkout_purchase, create_payment_link) are
 * invoked exactly once by the executor, which owns the ledger transitions. A
 * tool signals an *ambiguous* outcome (timeout / abort / network failure) by
 * returning `{ ok: false, error: { code: 'OUTCOME_UNKNOWN', ... } }` so the
 * executor can record `outcome_unknown` instead of a deterministic `failed`.
 *
 * Raw provider errors are sanitized here: only non-secret detail
 * (error.message / paywayCode / status) is preserved; never credentials.
 */

import type { PayWay } from '../client.js';
import {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PollingAbortedError,
} from '../errors.js';
import { saveQrArtifact } from './artifacts.js';
import type {
  AgentToolName,
  CheckTransactionByMerchantRefParams,
  CheckTransactionParams,
  CopyToClipboardParams,
  CreateCheckoutPayloadParams,
  CreateCheckoutPurchaseParams,
  CreatePaymentLinkParams,
  GenerateOfflineKhqrParams,
  GenerateOnlineQrParams,
  GetPaymentLinkDetailsParams,
  MaterializedAgentAction,
  OpenArtifactParams,
  PollTransactionParams,
  QueryJournalParams,
  SaveArtifactParams,
} from './contracts.js';
import type { ExecutionContext, ToolExecutionResult } from './executor.js';
import { detectJournalAnomalies, explainTransaction } from '../journal/intelligence.js';
import { reconcileTransactions } from '../journal/reconcile.js';
import { computeJournalStats } from '../journal/stats.js';
import { readJournalEvents } from '../journal/writer.js';
import { copyToClipboard, openArtifact } from './local-tools.js';

/**
 * Classifies a caught provider/local error.
 *
 * Ambiguous outcomes (timeout, abort, network, rate-limit, polling abort) are
 * reported with `OUTCOME_UNKNOWN` so the executor records `outcome_unknown`.
 * Deterministic failures (business rule, config, API payload) are reported with
 * their own code so the executor records `failed`.
 */
function classifyError(tool: AgentToolName, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : undefined;

  const isAbort = name === 'AbortError' || (error as { code?: string })?.code === 'ABORT_ERR';
  const isAmbiguous =
    error instanceof PayWayNetworkError ||
    error instanceof PayWayRateLimitError ||
    error instanceof PollingAbortedError ||
    isAbort;

  if (isAmbiguous) {
    return { ok: false, tool, error: { code: 'OUTCOME_UNKNOWN', message } };
  }

  let code: string | undefined;
  if (error instanceof PayWayAPIError) {
    code = error.paywayCode ?? error.name;
  } else if (error instanceof PayWayConfigError) {
    code = 'CONFIG_ERROR';
  } else if (error instanceof PayWayBusinessError) {
    code = error.paywayCode ?? 'BUSINESS_ERROR';
  } else if (name) {
    code = name;
  }

  return { ok: false, tool, error: { code, message } };
}

// ─── Create tools ───────────────────────────────────────────────────────────

async function runGenerateOnlineQr(action: MaterializedAgentAction, client: PayWay): Promise<ToolExecutionResult> {
  try {
    const params = action as unknown as GenerateOnlineQrParams;
    const response = await client.qr.generateQr({
      transactionId: params.transactionId as string,
      amount: params.amount,
      currency: params.currency,
      callbackUrl: params.callbackUrl,
      paymentOption: params.paymentOption as string,
      ...(params.template ? { qrImageTemplate: params.template } : {}),
      ...(params.lifetime !== undefined ? { lifetime: params.lifetime } : {}),
    });
    return {
      ok: true,
      tool: 'generate_online_qr',
      data: {
        qrString: response.qrString,
        qrImage: response.qrImage,
        transactionId: params.transactionId,
        raw: response,
      },
    };
  } catch (error) {
    return classifyError('generate_online_qr', error);
  }
}

async function runGenerateOfflineKhqr(action: MaterializedAgentAction, client: PayWay): Promise<ToolExecutionResult> {
  try {
    const params = action as unknown as GenerateOfflineKhqrParams;
    const qrString = client.khqr.generateOfflineQR({
      amount: params.amount,
      currency: params.currency,
      merchantRef: params.merchantRef,
    });
    return {
      ok: true,
      tool: 'generate_offline_khqr',
      data: { qrString, merchantRef: params.merchantRef, raw: { qrString } },
    };
  } catch (error) {
    return classifyError('generate_offline_khqr', error);
  }
}

async function runCreateCheckoutPayload(action: MaterializedAgentAction, client: PayWay): Promise<ToolExecutionResult> {
  try {
    const params = action as unknown as CreateCheckoutPayloadParams;
    const payload = client.checkout.createTransaction({
      transactionId: params.transactionId as string,
      amount: params.amount,
      currency: params.currency,
      ...(params.paymentOption ? { paymentOption: params.paymentOption } : {}),
      ...(params.returnUrl ? { returnUrl: params.returnUrl } : {}),
      ...(params.cancelUrl ? { cancelUrl: params.cancelUrl } : {}),
    });
    return {
      ok: true,
      tool: 'create_checkout_payload',
      data: { transactionId: params.transactionId, payload, raw: payload },
    };
  } catch (error) {
    return classifyError('create_checkout_payload', error);
  }
}

async function runCreateCheckoutPurchase(
  action: MaterializedAgentAction,
  client: PayWay,
): Promise<ToolExecutionResult> {
  try {
    const params = action as unknown as CreateCheckoutPurchaseParams;
    const response = await client.checkout.purchase({
      transactionId: params.transactionId as string,
      amount: params.amount,
      currency: params.currency,
      ...(params.paymentOption ? { paymentOption: params.paymentOption } : {}),
      ...(params.returnUrl ? { returnUrl: params.returnUrl } : {}),
      ...(params.cancelUrl ? { cancelUrl: params.cancelUrl } : {}),
    });

    const asRecord = response as Record<string, unknown>;
    const status = asRecord.status as { code?: string; message?: string } | undefined;
    if (status && status.code !== undefined && status.code !== '0' && status.code !== '00') {
      return {
        ok: false,
        tool: 'create_checkout_purchase',
        error: { code: String(status.code), message: String(status.message ?? 'Purchase failed') },
      };
    }

    return {
      ok: true,
      tool: 'create_checkout_purchase',
      data: {
        qrString: asRecord.qr_string,
        deeplink: asRecord.abapay_deeplink,
        hostedQrUrl: asRecord.checkout_qr_url,
        transactionId: params.transactionId,
        raw: response,
      },
    };
  } catch (error) {
    return classifyError('create_checkout_purchase', error);
  }
}

async function runCreatePaymentLink(action: MaterializedAgentAction, client: PayWay): Promise<ToolExecutionResult> {
  try {
    const params = action as unknown as CreatePaymentLinkParams;
    const response = await client.paymentLink.create({
      title: params.title,
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      paymentLimit: params.paymentLimit,
      returnUrl: params.returnUrl,
      merchantRefNo: params.merchantRefNo,
      expiredDate: params.expiredDate,
      payout: params.payout,
    });

    const asRecord = response as Record<string, unknown>;
    const status = asRecord.status as { code?: string; message?: string } | undefined;
    if (status && status.code !== undefined && status.code !== '0' && status.code !== '00') {
      return {
        ok: false,
        tool: 'create_payment_link',
        error: { code: String(status.code), message: String(status.message ?? 'Payment link creation failed') },
      };
    }

    return {
      ok: true,
      tool: 'create_payment_link',
      data: {
        paymentLinkId: (asRecord.data as Record<string, unknown> | undefined)?.id,
        // Codification C8: the share URL is the field providers consume most —
        // surface it so plans don't have to dig through `raw`.
        shareUrl: (asRecord.data as Record<string, unknown> | undefined)?.payment_link,
        transactionId: asRecord.tran_id,
        status,
        raw: response,
      },
    };
  } catch (error) {
    return classifyError('create_payment_link', error);
  }
}

// ─── Read (non-create) tools ────────────────────────────────────────────────

async function runCheckTransaction(action: MaterializedAgentAction, client: PayWay): Promise<ToolExecutionResult> {
  const params = action as unknown as CheckTransactionParams;
  const response = await client.checkout.checkTransaction(params.transactionId);
  return {
    ok: true,
    tool: 'check_transaction',
    data: { transactionId: params.transactionId, raw: response },
  };
}

async function runCheckTransactionByMerchantRef(
  action: MaterializedAgentAction,
  client: PayWay,
): Promise<ToolExecutionResult> {
  const params = action as unknown as CheckTransactionByMerchantRefParams;
  const response = await client.khqr.getTransactionsByMerchantRef(params.merchantRef, params.requestTime);
  return {
    ok: true,
    tool: 'check_transaction_by_merchant_ref',
    data: {
      merchantRef: params.merchantRef,
      success: response.success,
      count: response.rows.length,
      // The ≤50-row / no-pagination caveat belongs in every consumer's view.
      possiblyTruncated: response.rows.length >= 50,
      statuses: response.rows.map((row) => row.paymentStatus).filter(Boolean),
      raw: response,
    },
  };
}

async function runGetPaymentLinkDetails(
  action: MaterializedAgentAction,
  client: PayWay,
): Promise<ToolExecutionResult> {
  const params = action as unknown as GetPaymentLinkDetailsParams;
  const response = await client.paymentLink.getDetails(params.paymentLinkId);
  const asRecord = response as Record<string, unknown>;
  const data = asRecord.data as Record<string, unknown> | undefined;
  return {
    ok: true,
    tool: 'get_payment_link_details',
    data: {
      paymentLinkId: params.paymentLinkId,
      status: data?.status,
      totalTrxn: data?.total_trxn,
      totalAmount: data?.total_amount,
      paymentLink: data?.payment_link,
      raw: response,
    },
  };
}

async function runPollTransaction(action: MaterializedAgentAction, client: PayWay): Promise<ToolExecutionResult> {
  const params = action as unknown as PollTransactionParams;
  const iterator = client.checkout.pollTransactionStatus(params.transactionId, {
    intervalMs: params.interval,
    maxDurationMs: params.timeout,
  });

  const results: unknown[] = [];
  try {
    for await (const result of iterator) {
      results.push(result);
      if ((result as { isTerminal?: boolean }).isTerminal) break;
    }
  } catch (error) {
    if (error instanceof PollingAbortedError) {
      return {
        ok: true,
        tool: 'poll_transaction',
        data: {
          transactionId: params.transactionId,
          aborted: true,
          reason: error.reason,
          attempts: results.length,
          results,
        },
      };
    }
    return {
      ok: false,
      tool: 'poll_transaction',
      error: { code: 'POLL_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }

  const last = results[results.length - 1] as { paymentStatus?: string } | undefined;
  return {
    ok: true,
    tool: 'poll_transaction',
    data: {
      transactionId: params.transactionId,
      attempts: results.length,
      lastStatus: last?.paymentStatus,
      results,
    },
  };
}

async function runSaveArtifact(
  action: MaterializedAgentAction,
  _client: PayWay,
  ctx: ExecutionContext,
): Promise<ToolExecutionResult> {
  const params = action as unknown as SaveArtifactParams;
  const bundle = await saveQrArtifact({
    qrString: params.qrString,
    content: params.content,
    name: params.name,
    sessionId: ctx.sessionId,
    transactionId: ctx.execution?.transactionId ?? undefined,
    executionId: ctx.execution?.executionId,
  });
  return {
    ok: true,
    tool: 'save_artifact',
    data: {
      artifactId: bundle.metadata.artifactId,
      path: bundle.metadata.path,
      kind: bundle.metadata.kind,
    },
  };
}

async function runOpenArtifact(
  action: MaterializedAgentAction,
  _client: PayWay,
  ctx: ExecutionContext,
): Promise<ToolExecutionResult> {
  const params = action as unknown as OpenArtifactParams;
  if (!ctx.session) throw new Error('open_artifact requires the active session');
  await openArtifact(params.reference, ctx.session);
  return { ok: true, tool: 'open_artifact', data: { reference: params.reference } };
}

async function runCopyToClipboard(action: MaterializedAgentAction, _client: PayWay): Promise<ToolExecutionResult> {
  const params = action as unknown as CopyToClipboardParams;
  await copyToClipboard(params.text);
  return { ok: true, tool: 'copy_to_clipboard', data: { length: params.text.length } };
}

/**
 * Phase 5: read-only journal queries — the AI layer over the transaction
 * journal. Never touches the network; it only sees what was recorded while
 * journaling was enabled (PAYWAY_JOURNAL / --journal).
 */
async function runQueryJournal(action: MaterializedAgentAction, _client: PayWay): Promise<ToolExecutionResult> {
  const params = action as unknown as QueryJournalParams;

  if (params.query === 'timeline') {
    if (!params.transactionId) {
      return {
        ok: false,
        tool: 'query_journal',
        error: { code: 'VALIDATION', message: 'query "timeline" requires transactionId' },
      };
    }
    // Local RCA narrative (Phase 6): verdict + step-by-step reconstruction.
    const rca = explainTransaction(params.transactionId);
    const { events } = readJournalEvents();
    const filtered = events
      .filter((e) => e.transactionId === params.transactionId && (!params.kind || e.kind === params.kind))
      .sort((a, b) => a.ts.localeCompare(b.ts));
    const capped = params.last ?? 100;
    return {
      ok: true,
      tool: 'query_journal',
      data: {
        query: 'timeline',
        transactionId: params.transactionId,
        totalEvents: filtered.length,
        events: filtered.slice(Math.max(0, filtered.length - capped)),
        verdict: rca.verdict,
        steps: rca.steps,
        hints: rca.hints,
      },
    };
  }

  if (params.query === 'stats') {
    const report = computeJournalStats();
    return {
      ok: true,
      tool: 'query_journal',
      data: {
        query: 'stats',
        window: report.window,
        exchanges: report.exchanges,
        latency: report.latency.slice(0, 10),
        topErrors: report.topErrors,
        funnel: report.funnel,
      },
    };
  }

  if (params.query === 'reconcile') {
    const report = reconcileTransactions();
    return {
      ok: true,
      tool: 'query_journal',
      data: {
        query: 'reconcile',
        summary: report.summary,
        withoutCallback: report.transactions.filter((t) => !t.callbackReceived).map((t) => t.transactionId),
        transactions: report.transactions,
      },
    };
  }

  // anomalies
  const report = detectJournalAnomalies();
  return {
    ok: true,
    tool: 'query_journal',
    data: { query: 'anomalies', anomalies: report.anomalies, heuristics: report.heuristics },
  };
}

// ─── Closed typed registry ──────────────────────────────────────────────────

export const toolRegistry: Record<
  AgentToolName,
  (action: MaterializedAgentAction, client: PayWay, ctx: ExecutionContext) => Promise<ToolExecutionResult>
> = {
  generate_online_qr: runGenerateOnlineQr,
  generate_offline_khqr: runGenerateOfflineKhqr,
  create_checkout_payload: runCreateCheckoutPayload,
  create_checkout_purchase: runCreateCheckoutPurchase,
  create_payment_link: runCreatePaymentLink,
  get_payment_link_details: runGetPaymentLinkDetails,
  query_journal: runQueryJournal,
  check_transaction: runCheckTransaction,
  check_transaction_by_merchant_ref: runCheckTransactionByMerchantRef,
  poll_transaction: runPollTransaction,
  save_artifact: runSaveArtifact,
  open_artifact: runOpenArtifact,
  copy_to_clipboard: runCopyToClipboard,
};
