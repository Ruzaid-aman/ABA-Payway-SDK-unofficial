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
import { saveQrArtifact } from './artifacts.js';
import type { ResolvedPayWayContext } from './context.js';
import { resolvedSensitiveValues } from './context.js';
import type {
  AgentActionDraft,
  AgentCommandResultV1,
  AgentPlanV1,
  AgentToolName,
  ExecutionRecordV1,
  MaterializedAgentAction,
  MaterializedAgentPlanV1,
  ProviderConfigV1,
} from './contracts.js';
import { type ExecutionContext, executeAction, type ToolExecutionResult } from './executor.js';
import { confirmExecution, createExecutionRecord, generateTransactionId } from './ledger.js';
import { prevalidateLocalAction } from './local-tools.js';
import { renderCreatePlanConfirmation, renderHumanResult, serializeCommandResult } from './output.js';
import { normalizePlan } from './planning.js';
import { scrubSensitive } from './privacy.js';
import type { ProviderAdapter } from './provider.js';
import { ProviderProposalError } from './provider.js';
import { authorizePlan, classifyRisk } from './risk.js';
import { validateAgentPlan, validateCommandResult, validateMaterializedPlan } from './schemas.js';
import { appendSessionEvent, buildDeterministicSummary, createSession, loadSession } from './sessions.js';

export interface OrchestratorProgress {
  phase: 'propose' | 'validate' | 'authorize' | 'execute' | 'finalize';
  detail?: string;
}

export interface OrchestratorOptions {
  tty: boolean;
  flag?: 'approve' | 'yolo';
  environment?: 'sandbox' | 'production';
  payway?: PayWay;
  /**
   * CLI-owned confirmation boundary for unflagged interactive create plans.
   * Core orchestration supplies only a complete, scrubbed proposal and never
   * performs terminal I/O itself.
   */
  confirmCreatePlan?: (proposal: CreatePlanConfirmation) => Promise<boolean>;
  /** Optional progress sink for runtime UX; core never performs terminal I/O. */
  onProgress?: (info: OrchestratorProgress) => void;
}

export interface CreatePlanConfirmationAction {
  route: AgentToolName;
  money: string;
  transactionIdStrategy: string;
  lifetime?: number;
  urls: string[];
  artifacts: string[];
}

export interface CreatePlanConfirmation {
  request: string;
  context: string;
  environment: 'sandbox' | 'production';
  actions: CreatePlanConfirmationAction[];
  assumptions: string[];
  planContext: Record<string, unknown>;
}

export interface OrchestratorDeps {
  context: ResolvedPayWayContext;
  provider: ProviderAdapter;
  sessionId?: string;
  /** Local caller-controlled artifact root; provider plans cannot set this. */
  artifactRoot?: string;
  /** Explicit confirmation for a non-default local artifact root. */
  artifactRootOverrideConfirmed?: boolean;
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

const LOCAL_TOOLS: ReadonlySet<AgentToolName> = new Set<AgentToolName>([
  'save_artifact',
  'open_artifact',
  'copy_to_clipboard',
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
  private readonly artifactRoot?: string;
  private readonly artifactRootOverrideConfirmed: boolean;
  private readonly providerConfig?: ProviderConfigV1;

  constructor(deps: OrchestratorDeps) {
    this.context = deps.context;
    this.provider = deps.provider;
    this.baseSessionId = deps.sessionId;
    this.artifactRoot = deps.artifactRoot;
    this.artifactRootOverrideConfirmed = deps.artifactRootOverrideConfirmed === true;
    this.providerConfig = deps.providerConfig;
  }

  // ─── Public entry points ──────────────────────────────────────────────────

  async runOneShot(request: string, options: OrchestratorOptions): Promise<AgentCommandResultV1> {
    const sessionId = this.baseSessionId ?? createSession(this.context.displayLabel).sessionId;
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
    const session = loadSession(sessionId);
    if (!session) {
      return this.failure(
        'blocked',
        {
          code: 'SESSION_NOT_FOUND',
          message: `No session found for id '${sessionId}'.`,
        },
        { sessionId },
      );
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
    const progress = (info: OrchestratorProgress) => options.onProgress?.(info);

    // 1. Cancellation: record and leave the session usable; never call PayWay.
    if (this.looksLikeCancellation(request)) {
      const sanitized = this.scrub(request) as string;
      this.appendEvent(sessionId, 'cancellation', { request: sanitized });
      return this.result({
        status: 'needs_confirmation',
        sessionId,
        message: 'Cancellation recorded. The session remains usable and no payment was created.',
        request: sanitized,
      });
    }

    // 1b. Scrub free-text secrets from the request before it is transmitted to
    //     the provider or persisted into session/result output. A selected
    //     profile never contributes credential material here; only user-supplied
    //     free text that may contain an accidental secret is redacted.
    request = this.scrub(request) as string;

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
    progress({ phase: 'propose' });
    let plan: AgentPlanV1;
    try {
      // Keep the validated proposal intact for execution decisions. A scrubbed
      // copy is used at every persistence/output boundary below; mutating the
      // execution copy could transform a rejected path/URL into a safe-looking
      // value and change its security semantics.
      plan = await this.provider.propose(request, scrubbedContext);
    } catch (error) {
      if (error instanceof ProviderProposalError) {
        return this.failure(
          'failed',
          {
            code: 'PROVIDER_PROPOSAL_FAILED',
            message: error.message,
          },
          { sessionId, request },
        );
      }
      return this.failure(
        'failed',
        {
          code: 'PROVIDER_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        { sessionId, request },
      );
    }

    if (!validateAgentPlan(plan)) {
      return this.failure(
        'failed',
        {
          code: 'INVALID_PLAN',
          message: 'Provider returned a plan that failed validation; no action taken.',
        },
        { sessionId, request },
      );
    }
    progress({ phase: 'validate' });

    const storedPlan = this.scrub(plan) as AgentPlanV1;
    this.appendEvent(sessionId, 'plan', { plan: storedPlan, scrubbedContext });

    // 5. Clarification (normalize). If clarification needed, STOP — no writes.
    const normalized = normalizePlan(plan, this.context);
    if (normalized.needsClarification) {
      this.appendEvent(sessionId, 'summary', { clarification: normalized.clarification });
      return this.result({
        status: 'needs_clarification',
        sessionId,
        message: normalized.clarification ?? 'Clarification required before proceeding.',
        plan: normalized.plan,
        request,
      });
    }

    const taintedActions = normalized.plan.actions.filter((action) => this.actionContainsSecret(action));
    if (taintedActions.length > 0) {
      return this.failure(
        'blocked',
        {
          code: 'UNTRUSTED_ACTION_VALUE',
          message: 'Provider plan contained a resolved sensitive value in an executable action field; no action was executed.',
        },
        { sessionId, plan: normalized.plan, request },
      );
    }

    const riskDecisions = normalized.plan.actions.map((action) => classifyRisk(action, this.context));
    const riskBlockers = [
      ...normalized.warnings,
      ...riskDecisions.filter((decision) => decision.level === 'blocked').map((decision) => decision.reason),
    ];
    if (riskBlockers.length > 0) {
      return this.failure(
        'blocked',
        {
          code: 'PLAN_RISK_BLOCKED',
          message: `Plan blocked before authorization: ${riskBlockers.join('; ')}`,
        },
        { sessionId, plan: normalized.plan, request },
      );
    }

    // 6. Materialize and validate every action before authorization or ledger
    // persistence. Generated IDs are safe to display in the confirmation; they
    // do not become durable until authorization succeeds.
    const transactionIdSources: Array<'explicit' | 'generated' | 'not-used'> = [];
    const materializedActions = normalized.plan.actions.map((action) => {
      const target = { ...action } as unknown as Record<string, unknown>;
      if ('transactionId' in target && isCreateTool(toolOf(action))) {
        if (target.transactionId === null) {
          target.transactionId = generateTransactionId();
          transactionIdSources.push('generated');
        } else {
          transactionIdSources.push('explicit');
        }
      } else {
        transactionIdSources.push('not-used');
      }
      return target as unknown as MaterializedAgentAction;
    });
    let materializedPlan: MaterializedAgentPlanV1 = {
      version: 'agent-plan/v1',
      request: normalized.plan.request,
      actions: materializedActions,
      ...(normalized.plan.assumptions ? { assumptions: normalized.plan.assumptions } : {}),
      ...(normalized.plan.context ? { context: normalized.plan.context } : {}),
    };

    if (!validateMaterializedPlan(materializedPlan)) {
      return this.failure(
        'failed',
        {
          code: 'INVALID_MATERIALIZED_PLAN',
          message: 'Materialized plan failed validation; no action was executed.',
        },
        { sessionId, plan: materializedPlan, request },
      );
    }

    let activeSession: ReturnType<typeof loadSession> = null;
    if (materializedPlan.actions.some((action) => LOCAL_TOOLS.has(toolOf(action)))) {
      try {
        const sessionForValidation = loadSession(sessionId);
        if (!sessionForValidation) throw new Error('active session is unavailable');
        activeSession = sessionForValidation;
        materializedPlan = {
          ...materializedPlan,
          actions: materializedPlan.actions.map((action) => prevalidateLocalAction(action, sessionForValidation)),
        };
      } catch (error) {
        return this.failure(
          'blocked',
          {
            code: 'INVALID_LOCAL_ACTION',
            message: `Local action validation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
          { sessionId, plan: materializedPlan, request },
        );
      }
    }

    // A legacy caller environment claim is never authority. Reject a mismatch
    // explicitly, then authorize only against the resolved context below.
    if (options.environment !== undefined && options.environment !== this.context.environment) {
      return this.failure(
        'blocked',
        {
          code: 'AUTH_ENVIRONMENT_MISMATCH',
          message:
            `Authorization environment '${options.environment}' does not match resolved ` +
            `context '${this.context.environment}'.`,
        },
        { sessionId, plan: materializedPlan, request },
      );
    }

    // 7. Authorize. An unflagged TTY can receive a fresh, CLI-owned
    // confirmation callback. No PayWay call is made if it is rejected or
    // absent. Production --yolo is never eligible for this path.
    progress({ phase: 'authorize' });
    const authorization = authorizePlan(materializedPlan, {
      tty: options.tty,
      flag: options.flag,
      environment: this.context.environment,
    });
    let authorized = authorization.authorized;
    if (!authorized && options.tty && !options.flag && options.confirmCreatePlan) {
      let confirmed = false;
      try {
        confirmed = await options.confirmCreatePlan(
          this.createPlanConfirmation(materializedPlan, request, transactionIdSources),
        );
      } catch (_error) {
        console.warn('Confirmation prompt failed; treating the create plan as declined.');
      }
      this.appendEvent(sessionId, 'confirmation', { accepted: confirmed, plan: materializedPlan });
      if (confirmed) {
        authorized = true;
      } else {
        this.appendEvent(sessionId, 'cancellation', { request, reason: 'interactive confirmation declined' });
        return this.result({
          status: 'needs_confirmation',
          sessionId,
          message: 'Create plan cancelled. The session remains usable and no payment was created.',
          plan: materializedPlan,
          request,
        });
      }
    }
    if (!authorized) {
      const status = options.tty ? 'blocked' : 'needs_confirmation';
      return this.result({
        status,
        sessionId,
        message: `Approval required: ${authorization.reason}`,
        plan: materializedPlan,
        request,
      });
    }

    // 8. Only an authorized, fully validated plan may enter the ledger. Every
    // planned record already carries its validated transaction ID.
    const created: Array<{ index: number; record: ExecutionRecordV1 }> = [];
    materializedPlan.actions.forEach((action, index) => {
      const tool = toolOf(action);
      if (!isCreateTool(tool)) return;
      let record = createExecutionRecord({
        sessionId,
        tool,
        transactionId: ((action as { transactionId?: string }).transactionId ?? null) as string | null,
        merchantRef: (action as { merchantRef?: string }).merchantRef,
      });
      record = confirmExecution(record.executionId);
      created.push({ index, record });
    });

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
        session: activeSession ?? undefined,
        execution: (record ?? undefined) as ExecutionRecordV1,
        payway: options.payway,
      };

      let result: ToolExecutionResult;
      try {
        progress({ phase: 'execute', detail: tool });
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
      this.appendEvent(sessionId, 'tool_call', { tool, index: i });
      this.appendEvent(sessionId, 'tool_result', { tool, ok: result.ok, error: result.error ?? null });

      if (!result.ok) {
        anyFailure = true;
        if (result.error?.code === 'OUTCOME_UNKNOWN') outcomeUnknown = true;
      }

      const entry: Record<string, unknown> = { tool, ok: result.ok };
      if (result.data) entry.data = result.data;
      if (result.error) entry.error = result.error;

      if (
        result.ok &&
        tool === 'save_artifact' &&
        typeof result.data?.artifactId === 'string' &&
        typeof result.data.path === 'string'
      ) {
        this.appendEvent(sessionId, 'artifact', {
          artifactId: result.data.artifactId,
          path: result.data.path,
        });
      }

      // Successful online QR: save artifact, then OFFER polling (never auto-poll).
      if (result.ok && tool === 'generate_online_qr' && record) {
        const qrString = (result.data?.qrString as string | undefined) ?? undefined;
        if (qrString) {
          try {
            const bundle = await saveQrArtifact({
              qrString,
              root: this.artifactRoot,
              overrideApproval: this.artifactRootOverrideConfirmed,
              sessionId,
              route: 'generate_online_qr',
              amount: (action as { amount?: number }).amount,
              currency: (action as { currency?: 'USD' | 'KHR' }).currency,
              transactionId: record.transactionId ?? undefined,
              executionId: record.executionId,
              correlationId: execCtx.correlationId,
            });
            this.appendEvent(sessionId, 'artifact', { artifactId: bundle.metadata.artifactId, path: bundle.metadata.path });
            entry.artifact = this.scrub(bundle.metadata);
            pollOffered = true;
          } catch (error) {
            console.warn(
              `Audit: failed to save QR artifact for execution ${record.executionId}; ` +
                `the payment was still created. Cause: ${error instanceof Error ? error.message : String(error)}`,
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
          '(run the poll_transaction action); I will not auto-poll.'
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
    const summary = buildDeterministicSummary(session, this.secretValues());
    const scrubbed = this.scrub(JSON.parse(summary)) as Record<string, unknown>;
    return JSON.stringify(scrubbed);
  }

  private createPlanConfirmation(
    plan: MaterializedAgentPlanV1,
    request: string,
    transactionIdSources: Array<'explicit' | 'generated' | 'not-used'>,
  ): CreatePlanConfirmation {
    const actions = plan.actions
      .filter((action) => isCreateTool(toolOf(action)))
      .map((action) => {
        const actionIndex = plan.actions.indexOf(action);
        const fields = action as AgentActionDraft & Record<string, unknown>;
        const urls = [
          ['callback', fields.callbackUrl],
          ['return', fields.returnUrl],
          ['cancel', fields.cancelUrl],
        ]
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
          .map(([label, value]) => `${label}: ${value}`);
        const amount = typeof fields.amount === 'number' && typeof fields.currency === 'string'
          ? `${fields.amount} ${fields.currency}`
          : 'not applicable';
        const transactionIdStrategy = 'transactionId' in fields && typeof fields.transactionId === 'string'
          ? `${transactionIdSources[actionIndex] === 'explicit' ? 'explicit' : 'generated'}: ${fields.transactionId}`
          : 'not used for this route';
        const artifacts = this.artifactsForCreateTool(toolOf(action));
        return {
          route: toolOf(action),
          money: amount,
          transactionIdStrategy,
          ...(typeof fields.lifetime === 'number' ? { lifetime: fields.lifetime } : {}),
          urls,
          artifacts,
        };
      });

    return {
      request,
      context: this.context.displayLabel,
      environment: this.context.environment,
      actions,
      assumptions: plan.assumptions ?? [],
      planContext: plan.context ?? {},
    };
  }

  private artifactsForCreateTool(tool: AgentToolName): string[] {
    switch (tool) {
      case 'generate_online_qr':
        return ['QR image and metadata will be saved locally'];
      case 'generate_offline_khqr':
        return ['KHQR payload will be returned'];
      case 'create_checkout_payload':
        return ['checkout payload will be returned'];
      case 'create_checkout_purchase':
        return ['checkout purchase response will be returned'];
      case 'create_payment_link':
        return ['payment link response will be returned'];
      default:
        return [];
    }
  }

  private secretValues(): string[] {
    const values: string[] = [
      ...resolvedSensitiveValues(this.context),
      process.env.PAYWAY_AGENT_API_KEY ?? '',
    ];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') values.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(collect);
    };
    collect(this.providerConfig?.headers);
    return values.filter((value) => value.trim() !== '');
  }

  private scrub(value: unknown): unknown {
    return scrubSensitive(value, this.secretValues());
  }

  private actionContainsSecret(action: AgentActionDraft): boolean {
    const { rationale: _rationale, ...executableFields } = action as AgentActionDraft & Record<string, unknown>;
    return JSON.stringify(this.scrub(executableFields)) !== JSON.stringify(executableFields);
  }

  private appendEvent(
    sessionId: string,
    type: Parameters<typeof appendSessionEvent>[1]['type'],
    data: Record<string, unknown>,
  ): void {
    appendSessionEvent(sessionId, { type, data: this.scrub(data) as Record<string, unknown> });
  }

  private looksLikeCancellation(request: string): boolean {
    return /^(please\s+)?cancel(\b|\s|$)/i.test(request.trim());
  }

  private result(partial: Omit<AgentCommandResultV1, 'version'>): AgentCommandResultV1 {
    const result = this.scrub({ version: 'agent-command/v1', ...partial }) as AgentCommandResultV1;
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

export { ProviderProposalError, renderCreatePlanConfirmation, renderHumanResult, serializeCommandResult };
