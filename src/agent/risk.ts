import type { ResolvedPayWayContext } from './context.js';
import type { AgentActionDraft, Environment, ProviderConfigV1 } from './contracts.js';
import { isReadOnlyTool } from './planning.js';
import { evaluateReadiness } from './readiness.js';

export type RiskLevel = 'safe' | 'sandbox' | 'production' | 'blocked';

export interface RiskDecision {
  level: RiskLevel;
  reason: string;
}

const READONLY_TOOLS = new Set([
  'check_transaction',
  'check_transaction_by_merchant_ref',
  'get_payment_link_details',
  'query_journal',
  'query_knowledge',
  'poll_transaction',
  'save_artifact',
  'open_artifact',
  'copy_to_clipboard',
]);

const CREATE_TOOLS = new Set([
  'generate_online_qr',
  'generate_offline_khqr',
  'create_checkout_payload',
  'create_checkout_purchase',
  'create_payment_link',
]);

function dummyProvider(): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: 'gpt-4o',
    capabilityMode: 'strict-json-plan',
  };
}

function capabilityForTool(tool: string): keyof ReturnType<typeof evaluateReadiness> | null {
  switch (tool) {
    case 'generate_online_qr':
      return 'onlineQr';
    case 'generate_offline_khqr':
      return 'offlineKhqr';
    case 'create_checkout_payload':
    case 'create_checkout_purchase':
      return 'checkout';
    case 'create_payment_link':
      return 'paymentLinkRsa';
    default:
      return null;
  }
}

/**
 * Classify the risk of executing a single agent action.
 *
 * - Read-only tools are always `safe`.
 * - Create tools in a sandbox context are `sandbox`; in production `production`.
 * - Unavailable (readiness is not `ready`), invalid, ambiguous, or out-of-scope
 *   actions are `blocked`.
 */
export function classifyRisk(action: AgentActionDraft, context: ResolvedPayWayContext): RiskDecision {
  if (!action || typeof (action as { tool?: unknown }).tool !== 'string') {
    return { level: 'blocked', reason: 'action is invalid or missing a tool name' };
  }

  const tool = (action as { tool: string }).tool;

  if (READONLY_TOOLS.has(tool)) {
    return { level: 'safe', reason: `${tool} is a read-only operation` };
  }

  if (!CREATE_TOOLS.has(tool)) {
    return { level: 'blocked', reason: `${tool} is out of scope` };
  }

  const readiness = evaluateReadiness(context, dummyProvider());
  const capability = capabilityForTool(tool);
  if (capability && readiness[capability] !== 'ready') {
    return {
      level: 'blocked',
      reason: `${tool} is unavailable: capability '${capability}' is '${readiness[capability]}'`,
    };
  }

  if (context.environment === 'sandbox') {
    return { level: 'sandbox', reason: 'create action in sandbox environment' };
  }
  if (context.environment === 'production') {
    return { level: 'production', reason: 'create action in production environment' };
  }

  return { level: 'blocked', reason: `unknown environment '${context.environment}'` };
}

export interface AuthorizationInput {
  tty: boolean;
  flag?: 'approve' | 'yolo';
  environment: Environment;
}

export interface AuthorizationResult {
  authorized: boolean;
  requireApproval: boolean;
  scope: 'sandbox' | 'production' | 'none';
  reason: string;
}

function hasCreateAction(plan: { actions: AgentActionDraft[] }): boolean {
  return plan.actions.some((action) => CREATE_TOOLS.has((action as { tool: string }).tool));
}

/**
 * Decide whether a normalized plan is authorized to perform create actions.
 *
 * - `--approve` authorizes both sandbox and production.
 * - `--yolo` authorizes only sandbox (skips ordinary confirmation) and is NOT
 *   sufficient for production (scope stays 'production', authorized=false).
 * - Without a flag, approval is required (requireApproval=true, authorized=false),
 *   regardless of TTY; a non-TTY caller then returns `needs_confirmation`.
 * - Plans with only read-only actions need no approval (scope 'none').
 *
 * Ambiguous/invalid/unavailable/out-of-scope actions are blocked earlier at the
 * risk gate and are never authorized by this function.
 */
export function authorizePlan(
  plan: { actions: AgentActionDraft[] },
  approvalInput: AuthorizationInput,
): AuthorizationResult {
  if (!hasCreateAction(plan)) {
    return {
      authorized: true,
      requireApproval: false,
      scope: 'none',
      reason: 'plan contains only read-only actions; no approval required',
    };
  }

  const scope = approvalInput.environment;

  if (approvalInput.flag === 'approve') {
    return {
      authorized: true,
      requireApproval: false,
      scope,
      reason: '--approve explicitly authorizes both sandbox and production create actions',
    };
  }

  if (approvalInput.flag === 'yolo') {
    if (scope === 'sandbox') {
      return {
        authorized: true,
        requireApproval: false,
        scope: 'sandbox',
        reason: '--yolo skips ordinary sandbox confirmation',
      };
    }
    return {
      authorized: false,
      requireApproval: true,
      scope: 'production',
      reason: '--yolo is not sufficient for production; --approve is required',
    };
  }

  return {
    authorized: false,
    requireApproval: true,
    scope,
    reason: 'approval required: provide --approve (or --yolo for sandbox) or run interactively',
  };
}

export { isReadOnlyTool };
