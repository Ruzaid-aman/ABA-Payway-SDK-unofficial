/**
 * Agentic PayWay CLI — tool executor.
 *
 * `executeAction` is the single entry point that runs a
 * {@link MaterializedAgentAction} (already schema-validated upstream) through
 * the typed tool registry. For create actions it enforces the ledger
 * state machine: the record must be `confirmed`, is advanced to
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
import { createAgentPayWay, resolvedSensitiveValues } from './context.js';
import type { AgentSessionV1, AgentToolName, ExecutionRecordV1, MaterializedAgentAction } from './contracts.js';
import { markFailed, markOutcomeUnknown, markSubmitted, markSucceeded } from './ledger.js';
import { toolRegistry } from './tools.js';
import { scrubSensitive } from './privacy.js';

export interface ExecutionContext {
  context: ResolvedPayWayContext;
  sessionId: string;
  session?: AgentSessionV1;
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
  // Runtime registry lookup uses the discriminant shared by every materialized
  // action; each registry handler receives the original discriminated object.
  const tool = (action as unknown as { tool: AgentToolName }).tool;
  const create = isCreateAction(tool);

  const toolFn = toolRegistry[tool];
  if (!toolFn) {
    return {
      ok: false,
      tool,
      error: { code: 'UNKNOWN_TOOL', message: `No tool registered for '${tool}'` },
    };
  }

  if (!create) {
    const client = resolveClient(executionContext.context, executionContext.payway, false);
    return toolFn(action, client, executionContext);
  }

  const execution = executionContext.execution;
  const status = execution?.status;
  if (status !== 'confirmed') {
    return {
      ok: false,
      tool,
      error: {
        code: 'RECOVERY_REQUIRED',
        message:
          `Execution '${execution?.executionId}' is in status '${status}'. ` +
          'Create actions are never replayed automatically; recover by checking the recorded transaction.',
      },
    };
  }

  const executionId = execution.executionId;
  const sensitiveValues = resolvedSensitiveValues(executionContext.context);

  // Advance confirmed -> submitted exactly once. Submitted/outcome-unknown
  // records are recovery-only and were rejected above before any SDK client use.
  markSubmitted(executionId);
  const client = resolveClient(executionContext.context, executionContext.payway, true);

  let result: ToolExecutionResult;
  try {
    result = await toolFn(action, client, executionContext);
  } catch (error) {
    const safeError = scrubSensitive(
      {
        code: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
      },
      sensitiveValues,
    ) as { code?: string; message: string };
    markOutcomeUnknown(executionId, {
      code: safeError.code,
      message: safeError.message,
    }, sensitiveValues);
    return {
      ok: false,
      tool,
      error: { code: 'OUTCOME_UNKNOWN', message: safeError.message },
    };
  }

  if (result.error) {
    result = {
      ...result,
      error: scrubSensitive(result.error, sensitiveValues) as { code?: string; message: string },
    };
  }

  if (result.ok) {
    markSucceeded(executionId);
  } else if (result.error?.code === 'OUTCOME_UNKNOWN') {
    markOutcomeUnknown(executionId, {
      code: result.error.code,
      message: result.error.message,
    }, sensitiveValues);
  } else {
    markFailed(executionId, {
      code: result.error?.code,
      message: result.error?.message ?? 'Tool reported failure',
    }, sensitiveValues);
  }

  return result;
}
