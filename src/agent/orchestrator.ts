/**
 * Agentic PayWay CLI — headless conversation orchestrator.
 *
 * Wires together context, provider, planning, risk, ledger, executor, sessions
 * and artifacts into a single safe pipeline. The orchestrator is the only place
 * that decides *when* a side-effecting PayWay call may run.
 *
 * Hard safety rule (enforced below): a PayWay `create` call happens ONLY after
 *   (a) the provider plan validates,
 *   (b) normalization does not require clarification,
 *   (c) the plan is authorized (flag / TTY matrix),
 *   (d) each create action is materialized through the ledger (planned ->
 *       confirmed, transactionId generated), and
 *   (e) the executor runs the single SDK call (marking submitted -> outcome).
 * Any failure before (e) executes ZERO PayWay creates.
 */

import type { PayWay } from '../client.js';
import type { ResolvedPayWayContext } from './context.js';
import type { ProviderAdapter } from './provider.js';
import { ProviderProposalError } from './provider.js';
import type {
  AgentActionDraft,
  AgentCommandResultV1,
  AgentPlanV1,
  AgentToolName,
  MaterializedAgentAction,
  MaterializedAgentPlanV1,
  ProviderConfigV1,
} from './contracts.js';
import { validateAgentPlan, validateCommandResult } from './schemas.js';
import { normalizePlan } from './planning.js';
import { authorizePlan } from './risk.js';
import { createExecutionRecord, confirmExecution } from './ledger.js';
import type { ExecutionRecordV1 } from './contracts.js';
import { executeAction, type ExecutionContext, type ToolExecutionResult } from './executor.js';
import {
  appendSessionEvent,
  buildDeterministicSummary,
  createSession,
  loadSession,
} from './sessions.js';
import { saveQrArtifact } from './artifacts.js';
import { scrubSensitive } from './privacy.js';
import { renderHumanResult, serializeCommandResult } from './output.js';

export interface OrchestratorOptions {
  tty: boolean;
  flag?: 'approve' | 'yolo';
  environment?: 'sandbox' | 'production';
  payway?: PayWay;
}

export interface OrchestratorDeps {
  context: ResolvedPayWayContext;
  provider: ProviderAdapter;
  sessionId?: string;
  /** Provider config used only for the privacy-acknowledgement gate. */
  providerConfig?: ProviderConfigV1;
}

const CREATE_TOOLS: ReadonlySet<AgentToolName> = new Set<AgentToolName>([
  'generate_online_qr',
  'generate_offline_khqr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
]);

function toolOf(action: AgentActionDraft | MaterializedAgentAction): AgentToolName {
  return (action as { tool: AgentToolName }).tool;
}

function isCreateTool(tool: AgentToolName): boolean {
  return CREATE_TOOLS.has(tool);
}

export class AgentOrchestrator {
  private readonly context: ResolvedPayWayContext;
  private readonly provider: ProviderAdapter;
  private readonly baseSessionId?: string;
  private readonly providerConfig?: ProviderConfigV1;

  /** In-memory write approval. NEVER restored from a stored session. */
  private writeApproved = false;

  constructor(deps: OrchestratorDeps) {
    this.context = deps.context;
    this.provider = deps.provider;
    this.baseSessionId = deps.sessionId;
    this.providerConfig = deps.providerConfig;
  }

  // ─── Public entry points ──────────────────────────────────────────────────

  async runOneShot(request: string, options: OrchestratorOptions): Promise<AgentCommandResultV1> {
    const sessionId =
      this.baseSessionId ?? createSession(this.context.displayLabel).sessionId;
    return this.runPipeline(sessionId, request, options);
  }

  async runTurn(sessionId: string, request: string, options: OrchestratorOptions): Promise<AgentCommandResultV1> {
    return this.runPipeline(sessionId, request, options);
  }

  /**
   * Resume a prior session. Resets any in-memory write approval so a resumed
   * session can NEVER auto-approve a create. Returns a `needs_confirmation`
   * result carrying a deterministic summary; the caller must re-confirm.
   */
  async resume(sessionId: string): Promise<AgentCommandResultV1> {
    this.writeApproved = false;

    const session = loadSession(sessionId);
    if (!session) {
      return this.failure('blocked', {
        code: 'SESSION_NOT_FOUND',
        message: `No session found for id '${sessionId}'.`,
      }, { sessionId });
    }

    const summary = buildDeterministicSummary(session, []);
    return this.result({
      status: 'needs_confirmation',
      sessionId,
      message:
        `Session ${sessionId} resumed. No stored approval was restored — re-confirm any ` +
        `create action before proceeding.\n${summary}`,
    });
  }

  // ─── Pipeline ─────────────────────────────────────────────────────────────

  private async runPipeline(
    sessionId: string,
    request: string,
    options: OrchestratorOptions,
  ): Promise<AgentCommandResultV1> {
    // 1. Cancellation: record and leave the session usable; never call PayWay.
    if (this.looksLikeCancellation(request)) {
      appendSessionEvent(sessionId, { type: 'cancellation', data: { request } });
      return this.result({
        status: 'needs_confirmation',
        sessionId,
        message: 'Cancellation recorded. The session remains usable and no payment was created.',
        request,
      });
    }

    // 2. Privacy acknowledgement gate (provider config only; no PayWay/propose).
    if (this.providerConfig && !this.providerConfig.privacyAcknowledgedAt) {
      return this.result({
        status: 'blocked',
        sessionId,
        message:
          'Privacy acknowledgement required: set providerConfig.privacyAcknowledgedAt before ' +
          'proposing plans. No action was taken.',
        request,
        error: { code: 'PRIVACY_ACK_REQUIRED', message: 'Provider privacy acknowledgement is missing.' },
      });
    }

    // 3. Scrubbed context summary (provider context / audit; secrets redacted).
    const scrubbedContext = this.buildScrubbedContext(sessionId);

    // 4. Plan (provider proposal).
    let plan: AgentPlanV1;
    try {
      plan = await this.provider.propose(request);
    } catch (error) {
      if (error instanceof ProviderProposalError) {
        return this.failure('failed', {
          code: 'PROVIDER_PROPOSAL_FAILED',
          message: error.message,
        }, { sessionId, request });
      }
      return this.failure('failed', {
        code: 'PROVIDER_ERROR',
        message: error instanceof Error ? error.message : String(error),
      }, { sessionId, request });
    }

    if (!validateAgentPlan(plan)) {
      return this.failure('failed', {
        code: 'INVALID_PLAN',
        message: 'Provider returned a plan that failed validation; no action taken.',
      }, { sessionId, request });
    }

    appendSessionEvent(sessionId, { type: 'plan', data: { plan, scrubbedContext } });

    // 5. Clarification (normalize). If clarification needed, STOP — no writes.
    const normalized = normalizePlan(plan, this.context);
    if (normalized.needsClarification) {
      appendSessionEvent(sessionId, {
        type: 'summary',
        data: { clarification: normalized.clarification },
      });
      return this.result({
        status: 'needs_clarification',
        sessionId,
        message: normalized.clarification ?? 'Clarification required before proceeding.',
        plan: normalized.plan,
        request,
      });
    }

    // 6. Persist planned writes (ledger 'planned' records) for create actions.
    const created: Array<{ index: number; record: ExecutionRecordV1 }> = [];
    plan.actions.forEach((action, index) => {
      const tool = toolOf(action);
      if (!isCreateTool(tool)) return;
      const record = createExecutionRecord({
        sessionId,
        tool,
        transactionId: ((action as { transactionId?: string | null }).transactionId ?? null) as string | null,
        merchantRef: (action as { merchantRef?: string }).merchantRef,
      });
      created.push({ index, record });
    });

    // 7. Authorize. Non-TTY -> needs_confirmation; TTY -> blocked. No PayWay call.
    const authorization = authorizePlan(normalized.plan, {
      tty: options.tty,
      flag: options.flag,
      environment: options.environment ?? this.context.environment,
    });
    if (!authorization.authorized) {
      const status = options.tty ? 'blocked' : 'needs_confirmation';
      return this.result({
        status,
        sessionId,
        message: `Approval required: ${authorization.reason}`,
        plan: normalized.plan,
        executionIds: created.map((c) => c.record.executionId),
        request,
      });
    }
    // Authorization was granted by an explicit flag this turn; do not persist it.
    this.writeApproved = true;

    // 8. Materialize IDs: confirm each create record (planned -> confirmed) and
    //    bind the generated transactionId into a materialized plan.
    const materializedActions = plan.actions.map(
      (action) => ({ ...action }) as unknown as MaterializedAgentAction,
    );
    for (const entry of created) {
      const confirmed = confirmExecution(entry.record.executionId);
      entry.record = confirmed;
      const target = materializedActions[entry.index] as unknown as Record<string, unknown>;
      if ('transactionId' in target) {
        target.transactionId = confirmed.transactionId as string;
      }
    }
    const materializedPlan: MaterializedAgentPlanV1 = {
      version: 'agent-plan/v1',
      request: plan.request,
      actions: materializedActions,
      ...(plan.assumptions ? { assumptions: plan.assumptions } : {}),
    };

    // 9. Execute each action (executor owns the submitted -> outcome transition
    //    and runs the single SDK call for create actions).
    const recordByIndex = new Map(created.map((c) => [c.index, c.record]));
    const actionResults: Array<Record<string, unknown>> = [];
    let anyFailure = false;
    let outcomeUnknown = false;
    let pollOffered = false;

    for (let i = 0; i < materializedPlan.actions.length; i++) {
      const action = materializedPlan.actions[i];
      const tool = toolOf(action);
      const record = recordByIndex.get(i);
      const execCtx: ExecutionContext = {
        context: this.context,
        sessionId,
        execution: (record ?? undefined) as ExecutionRecordV1,
        payway: options.payway,
      };

      let result: ToolExecutionResult;
      try {
        result = await executeAction(action, execCtx);
      } catch (error) {
        result = {
          ok: false,
          tool,
          error: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }

      // Session write failures must warn (handled inside appendSessionEvent)
      // and must NOT crash the pipeline — the action still happened.
      appendSessionEvent(sessionId, { type: 'tool_call', data: { tool, index: i } });
      appendSessionEvent(sessionId, {
        type: 'tool_result',
        data: { tool, ok: result.ok, error: result.error ?? null },
      });

      if (!result.ok) {
        anyFailure = true;
        if (result.error?.code === 'OUTCOME_UNKNOWN') outcomeUnknown = true;
      }

      const entry: Record<string, unknown> = { tool, ok: result.ok };
      if (result.data) entry.data = result.data;
      if (result.error) entry.error = result.error;

      // Successful online QR: save artifact, then OFFER polling (never auto-poll).
      if (result.ok && tool === 'generate_online_qr' && record) {
        const qrString = (result.data?.qrString as string | undefined) ?? undefined;
        if (qrString) {
          try {
            const bundle = await saveQrArtifact({
              qrString,
              sessionId,
              route: 'generate_online_qr',
              amount: (action as { amount?: number }).amount,
              currency: (action as { currency?: 'USD' | 'KHR' }).currency,
              transactionId: record.transactionId ?? undefined,
              executionId: record.executionId,
            });
            appendSessionEvent(sessionId, {
              type: 'artifact',
              data: { artifactId: bundle.metadata.artifactId, path: bundle.metadata.path },
            });
            entry.artifact = bundle.metadata;
            pollOffered = true;
          } catch (error) {
            console.warn(
              `Audit: failed to save QR artifact for execution ${record.executionId}; ` +
                `the payment was still created. Cause: ${
                  error instanceof Error ? error.message : String(error)
                }`,
            );
          }
        }
      }

      actionResults.push(entry);
    }

    // 10. Compose the final result.
    let status: AgentCommandResultV1['status'];
    let message: string;
    if (anyFailure) {
      status = 'failed';
      message = outcomeUnknown
        ? 'One or more actions had an unknown outcome (network/timeout). The operation may ' +
          'or may not have completed; verify status before retrying.'
        : 'One or more actions failed.';
    } else {
      status = 'succeeded';
      message = pollOffered
        ? 'Online QR generated and saved. You can poll the transaction to detect payment ' +
          '(run the poll_transaction action or `agent poll`); I will not auto-poll.'
        : 'Command completed.';
    }

    return this.result({
      status,
      sessionId,
      message,
      plan: materializedPlan,
      actions: actionResults,
      executionIds: created.map((c) => c.record.executionId),
      request,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildScrubbedContext(sessionId: string): string {
    const session = loadSession(sessionId);
    if (!session) return '';
    const summary = buildDeterministicSummary(session, []);
    const scrubbed = scrubSensitive(JSON.parse(summary), []) as Record<string, unknown>;
    return JSON.stringify(scrubbed);
  }

  private looksLikeCancellation(request: string): boolean {
    return /^(please\s+)?cancel(\b|\s|$)/i.test(request.trim());
  }

  private result(partial: Omit<AgentCommandResultV1, 'version'>): AgentCommandResultV1 {
    const result: AgentCommandResultV1 = { version: 'agent-command/v1', ...partial };
    if (!validateCommandResult(result)) {
      throw new Error('Internal: produced an AgentCommandResultV1 that failed validation');
    }
    return result;
  }

  private failure(
    status: 'failed' | 'blocked',
    error: { code?: string; message: string; detail?: string },
    extra: Partial<Omit<AgentCommandResultV1, 'version' | 'status' | 'error'>> = {},
  ): AgentCommandResultV1 {
    return this.result({ status, error, ...extra });
  }
}

export { ProviderProposalError };
export { renderHumanResult, serializeCommandResult };
