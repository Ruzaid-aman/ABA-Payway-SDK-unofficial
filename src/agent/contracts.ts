/**
 * Agentic PayWay CLI — strict contracts.
 *
 * All provider-proposed plans are validated against these versioned,
 * discriminated types before any executor runs. Schemas live in `schemas.ts`.
 */

export type AgentPlanVersion = 'agent-plan/v1';
export type AgentConfigVersion = 'agent-config/v1';
export type AgentSessionVersion = 'agent-session/v1';
export type ExecutionRecordVersion = 'agent-ledger/v1';
export type ArtifactMetadataVersion = 'agent-artifact/v1';
export type AgentCommandResultVersion = 'agent-command/v1';

export type Currency = 'USD' | 'KHR';
export type Environment = 'sandbox' | 'production';

export type AgentToolName =
  | 'generate_online_qr'
  | 'generate_offline_khqr'
  | 'create_checkout_payload'
  | 'create_checkout_purchase'
  | 'create_payment_link'
  | 'check_transaction'
  | 'check_transaction_by_merchant_ref'
  | 'poll_transaction'
  | 'save_artifact'
  | 'open_artifact'
  | 'copy_to_clipboard';

export type CreateActionTool =
  | 'generate_online_qr'
  | 'generate_offline_khqr'
  | 'create_checkout_payload'
  | 'create_checkout_purchase'
  | 'create_payment_link';

// ---------------------------------------------------------------------------
// Per-tool parameter shapes (discriminated on `tool`)
// ---------------------------------------------------------------------------

export interface GenerateOnlineQrParams {
  tool: 'generate_online_qr';
  amount: number;
  currency: Currency;
  /** Null in a draft; required string after materialization. */
  transactionId: string | null;
  callbackUrl: string;
  lifetime?: number;
  paymentOption?: string;
  template?: string;
  rationale?: string;
}

export interface GenerateOfflineKhqrParams {
  tool: 'generate_offline_khqr';
  amount?: number;
  currency: Currency;
  merchantRef: string;
  rationale?: string;
}

export interface CreateCheckoutPayloadParams {
  tool: 'create_checkout_payload';
  amount: number;
  currency: Currency;
  transactionId: string | null;
  paymentOption?: string;
  returnUrl?: string;
  cancelUrl?: string;
  rationale?: string;
}

export interface CreateCheckoutPurchaseParams {
  tool: 'create_checkout_purchase';
  amount: number;
  currency: Currency;
  transactionId: string | null;
  paymentOption?: string;
  returnUrl?: string;
  cancelUrl?: string;
  rationale?: string;
}

export interface CreatePaymentLinkParams {
  tool: 'create_payment_link';
  title: string;
  amount: number;
  currency: Currency;
  merchantRefNo: string;
  returnUrl: string;
  description?: string;
  paymentLimit?: number;
  expiredDate?: number;
  rationale?: string;
}

export interface CheckTransactionParams {
  tool: 'check_transaction';
  transactionId: string;
  rationale?: string;
}

export interface CheckTransactionByMerchantRefParams {
  tool: 'check_transaction_by_merchant_ref';
  merchantRef: string;
  requestTime?: string;
  rationale?: string;
}

export interface PollTransactionParams {
  tool: 'poll_transaction';
  transactionId: string;
  interval?: number;
  timeout?: number;
  rationale?: string;
}

export interface SaveArtifactParams {
  tool: 'save_artifact';
  qrString?: string;
  content?: string;
  name?: string;
  kind?: 'qr' | 'receipt' | 'text';
  rationale?: string;
}

export interface OpenArtifactParams {
  tool: 'open_artifact';
  /** Path to a current-session artifact, or an explicitly selected HTTPS URL. */
  reference: string;
  rationale?: string;
}

export interface CopyToClipboardParams {
  tool: 'copy_to_clipboard';
  text: string;
  rationale?: string;
}

export type AgentActionParams =
  | GenerateOnlineQrParams
  | GenerateOfflineKhqrParams
  | CreateCheckoutPayloadParams
  | CreateCheckoutPurchaseParams
  | CreatePaymentLinkParams
  | CheckTransactionParams
  | CheckTransactionByMerchantRefParams
  | PollTransactionParams
  | SaveArtifactParams
  | OpenArtifactParams
  | CopyToClipboardParams;

/** A proposed (pre-approval) action. Create actions may carry a null transactionId. */
export type AgentActionDraft = AgentActionParams;

/** A materialized action. Create actions must carry a valid (non-null) transactionId. */
type MaterializeAction<T extends AgentActionParams> = T extends { transactionId: string | null }
  ? Omit<T, 'transactionId'> & { transactionId: string }
  : T;

export type MaterializedAgentAction = MaterializeAction<AgentActionParams>;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface AgentPlanV1 {
  version: AgentPlanVersion;
  request: string;
  actions: AgentActionDraft[];
  assumptions?: string[];
  context?: Record<string, unknown>;
}

export interface MaterializedAgentPlanV1 {
  version: AgentPlanVersion;
  request: string;
  actions: MaterializedAgentAction[];
  assumptions?: string[];
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider configuration (non-secret settings only)
// ---------------------------------------------------------------------------

export type ProviderPreset = 'openai' | 'openrouter' | 'nvidia' | 'custom';
export type CapabilityMode = 'native-tools' | 'strict-json-plan';

export interface ProviderConfigV1 {
  version: AgentConfigVersion;
  provider: ProviderPreset;
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
  /** Non-secret headers only (e.g. organization). Never authorization/api-key. */
  headers?: Record<string, string>;
  capabilityMode: CapabilityMode;
  privacyAcknowledgedAt?: string;
}

// ---------------------------------------------------------------------------
// Command result (non-TTY structured output)
// ---------------------------------------------------------------------------

export type AgentCommandStatus = 'succeeded' | 'needs_confirmation' | 'needs_clarification' | 'blocked' | 'failed';

export interface AgentCommandResultV1 {
  version: AgentCommandResultVersion;
  status: AgentCommandStatus;
  request?: string;
  message?: string;
  plan?: AgentPlanV1 | MaterializedAgentPlanV1;
  actions?: Array<Record<string, unknown>>;
  sessionId?: string;
  executionIds?: string[];
  error?: { code?: string; message: string; detail?: string };
}

// ---------------------------------------------------------------------------
// Durable session
// ---------------------------------------------------------------------------

export type AgentSessionEventType =
  | 'prompt'
  | 'summary'
  | 'plan'
  | 'confirmation'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'artifact'
  | 'ledger'
  | 'cancellation';

export interface AgentSessionEvent {
  type: AgentSessionEventType;
  at: string;
  data: Record<string, unknown>;
}

export interface AgentSessionV1 {
  version: AgentSessionVersion;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  contextLabel: string;
  events: AgentSessionEvent[];
}

// ---------------------------------------------------------------------------
// Execution ledger
// ---------------------------------------------------------------------------

export type ExecutionStatus = 'planned' | 'confirmed' | 'submitted' | 'succeeded' | 'failed' | 'outcome_unknown';

export interface ExecutionRecordV1 {
  version: ExecutionRecordVersion;
  executionId: string;
  sessionId: string;
  tool: AgentToolName;
  transactionId: string | null;
  merchantRef?: string;
  status: ExecutionStatus;
  correlation?: string;
  createdAt: string;
  updatedAt: string;
  error?: { code?: string; message: string };
}

// ---------------------------------------------------------------------------
// Artifact metadata
// ---------------------------------------------------------------------------

export type ArtifactKind = 'qr' | 'receipt' | 'text';

export interface ArtifactMetadataV1 {
  version: ArtifactMetadataVersion;
  artifactId: string;
  sessionId: string;
  kind: ArtifactKind;
  path: string;
  url?: string;
  generatedAt: string;
  route?: string;
  amount?: number;
  currency?: Currency;
  transactionId?: string;
  executionId?: string;
}
