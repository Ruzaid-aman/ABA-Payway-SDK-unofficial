/**
 * Agentic PayWay CLI — tool executor.
 *
 * `executeAction` is the single entry point that runs a
 * {@link MaterializedAgentAction} (already schema-validated upstream) through
 * the typed tool registry. For create actions it enforces the ledger
 * state machine: the record must be `confirmed` or `submitted`, is advanced to
 * `submitted`, the SDK call runs exactly once, and the result advances to
 * `succeeded`, `failed`, or `outcome_unknown` (on timeout / abort / network
 * failure / ambiguous response).
 *
 * The PayWay client is taken from {@link ExecutionContext.payway} when present,
 * otherwise a fresh agent client is built (create-kind for writes, read-kind for
 * reads) via `createAgentPayWay`.
 */

import type { PayWay } from '../client.js';
import type { ResolvedPayWayContext } from './context.js';
import { createAgentPayWay } from './context.js';
import type { AgentToolName, ExecutionRecordV1, MaterializedAgentAction } from './contracts.js';
import { markFailed, markOutcomeUnknown, markSubmitted, markSucceeded } from './ledger.js';
import { toolRegistry } from './tools.js';

export interface ExecutionContext {
  context: ResolvedPayWayContext;
  sessionId: string;
  execution: ExecutionRecordV1;
  payway?: PayWay;
}

export interface ToolExecutionResult {
  ok: boolean;
  tool: AgentToolName;
  data?: Record<string, unknown>;
  error?: { code?: string; message: string };
}

const CREATE_ACTIONS: ReadonlySet<AgentToolName> = new Set<AgentToolName>([
  'generate_online_qr',
  'generate_offline_khqr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
]);

function isCreateAction(tool: AgentToolName): boolean {
  return CREATE_ACTIONS.has(tool);
}

function resolveClient(context: ResolvedPayWayContext, payway: PayWay | undefined, create: boolean): PayWay {
  if (payway) return payway;
  return createAgentPayWay(context, create ? 'create' : 'read');
}

/**
 * Runs a single materialized agent action.
 *
 * @returns A safe `ToolExecutionResult`. Provider failures are returned as
 *   `ok:false` with sanitized detail — never raw credentials.
 */
export async function executeAction(
  action: MaterializedAgentAction,
  executionContext: ExecutionContext,
): Promise<ToolExecutionResult> {
  // NOTE: The merged `MaterializedAgentAction` contract collapses to the
  // `AgentToolName` string union (a non-distributive `keyof`), so at the type
  // level `action` is the tool name. At runtime it is the discriminated object
  // produced upstream; we recover the discriminant here and re-cast when
  // delegating to the typed tool functions.
  const tool = (action as unknown as { tool: AgentToolName }).tool;
  const create = isCreateAction(tool);
  const client = resolveClient(executionContext.context, executionContext.payway, create);

  const toolFn = toolRegistry[tool];
  if (!toolFn) {
    return {
      ok: false,
      tool,
      error: { code: 'UNKNOWN_TOOL', message: `No tool registered for '${tool}'` },
    };
  }

  if (!create) {
    return toolFn(action, client, executionContext);
  }

  const execution = executionContext.execution;
  const status = execution?.status;
  if (status !== 'confirmed' && status !== 'submitted') {
    return {
      ok: false,
      tool,
      error: {
        code: 'LEDGER_NOT_READY',
        message: `Execution '${execution?.executionId}' is in status '${status}', expected 'confirmed' or 'submitted'`,
      },
    };
  }

  const executionId = execution.executionId;

  // Advance confirmed -> submitted exactly once (idempotent if already submitted).
  if (status === 'confirmed') {
    markSubmitted(executionId);
  }

  let result: ToolExecutionResult;
  try {
    result = await toolFn(action, client, executionContext);
  } catch (error) {
    markOutcomeUnknown(executionId, {
      code: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      tool,
      error: { code: 'OUTCOME_UNKNOWN', message: error instanceof Error ? error.message : String(error) },
    };
  }

  if (result.ok) {
    markSucceeded(executionId);
  } else if (result.error?.code === 'OUTCOME_UNKNOWN') {
    markOutcomeUnknown(executionId, {
      code: result.error.code,
      message: result.error.message,
    });
  } else {
    markFailed(executionId, {
      code: result.error?.code,
      message: result.error?.message ?? 'Tool reported failure',
    });
  }

  return result;
}
