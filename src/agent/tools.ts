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
  AgentSessionV1,
  AgentToolName,
  CheckTransactionByMerchantRefParams,
  CheckTransactionParams,
  CopyToClipboardParams,
  CreateCheckoutPayloadParams,
  CreateCheckoutPurchaseParams,
  CreatePaymentLinkParams,
  GenerateOfflineKhqrParams,
  GenerateOnlineQrParams,
  MaterializedAgentAction,
  OpenArtifactParams,
  PollTransactionParams,
  SaveArtifactParams,
} from './contracts.js';
import type { ExecutionContext, ToolExecutionResult } from './executor.js';
import { copyToClipboard, openArtifact } from './local-tools.js';

/** Builds a minimal session object sufficient for the local open utility. */
function minimalSession(sessionId: string): AgentSessionV1 {
  return {
    version: 'agent-session/v1',
    sessionId,
    createdAt: '',
    updatedAt: '',
    contextLabel: '',
    events: [],
  };
}

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
    data: { merchantRef: params.merchantRef, raw: response },
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
  await openArtifact(params.reference, minimalSession(ctx.sessionId));
  return { ok: true, tool: 'open_artifact', data: { reference: params.reference } };
}

async function runCopyToClipboard(action: MaterializedAgentAction, _client: PayWay): Promise<ToolExecutionResult> {
  const params = action as unknown as CopyToClipboardParams;
  await copyToClipboard(params.text);
  return { ok: true, tool: 'copy_to_clipboard', data: { length: params.text.length } };
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
  check_transaction: runCheckTransaction,
  check_transaction_by_merchant_ref: runCheckTransactionByMerchantRef,
  poll_transaction: runPollTransaction,
  save_artifact: runSaveArtifact,
  open_artifact: runOpenArtifact,
  copy_to_clipboard: runCopyToClipboard,
};
