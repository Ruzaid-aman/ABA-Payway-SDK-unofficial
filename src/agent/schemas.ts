/**
 * Agentic PayWay CLI — strict Ajv schemas.
 *
 * Every object level uses `additionalProperties: false`. Validators are
 * compiled once per process. The agentic executor only ever receives values
 * that pass `validateAgentPlan` / `validateMaterializedPlan` (or the other
 * validators in this module).
 */

import { Ajv, type ValidateFunction } from 'ajv';
import type {
  AgentCommandResultV1,
  AgentPlanV1,
  AgentSessionV1,
  ArtifactMetadataV1,
  ExecutionRecordV1,
  MaterializedAgentPlanV1,
  ProviderConfigV1,
} from './contracts.js';

const CURRENCY = { enum: ['USD', 'KHR'] };
const HTTPS = { type: 'string', pattern: '^https://' };
const TXID = { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9-]+$' };

function txIdProp(materialized: boolean): Record<string, unknown> {
  return materialized ? { transactionId: { ...TXID } } : { transactionId: { type: ['string', 'null'] } };
}

function buildActionSchemas(materialized: boolean): Array<Record<string, unknown>> {
  const base = { additionalProperties: false as const };
  return [
    {
      ...base,
      required: ['tool', 'amount', 'currency', 'transactionId', 'callbackUrl'],
      properties: {
        tool: { const: 'generate_online_qr' },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: CURRENCY,
        ...txIdProp(materialized),
        callbackUrl: HTTPS,
        lifetime: { type: 'integer', minimum: 1 },
        paymentOption: { type: 'string' },
        template: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'currency', 'merchantRef'],
      properties: {
        tool: { const: 'generate_offline_khqr' },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: CURRENCY,
        merchantRef: { type: 'string', minLength: 1 },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'amount', 'currency', 'transactionId'],
      properties: {
        tool: { const: 'create_checkout_payload' },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: CURRENCY,
        ...txIdProp(materialized),
        paymentOption: { type: 'string' },
        returnUrl: HTTPS,
        cancelUrl: HTTPS,
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'amount', 'currency', 'transactionId'],
      properties: {
        tool: { const: 'create_checkout_purchase' },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: CURRENCY,
        ...txIdProp(materialized),
        paymentOption: { type: 'string' },
        returnUrl: HTTPS,
        cancelUrl: HTTPS,
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'title', 'amount', 'currency', 'merchantRefNo', 'returnUrl'],
      properties: {
        tool: { const: 'create_payment_link' },
        title: { type: 'string', minLength: 1 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        currency: CURRENCY,
        merchantRefNo: { type: 'string', minLength: 1 },
        returnUrl: HTTPS,
        description: { type: 'string', maxLength: 250 },
        paymentLimit: { type: 'integer', minimum: 0 },
        expiredDate: { type: 'integer', exclusiveMinimum: 0 },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'transactionId'],
      properties: {
        tool: { const: 'check_transaction' },
        transactionId: { ...TXID },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'merchantRef'],
      properties: {
        tool: { const: 'check_transaction_by_merchant_ref' },
        merchantRef: { type: 'string', minLength: 1 },
        requestTime: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'transactionId'],
      properties: {
        tool: { const: 'poll_transaction' },
        transactionId: { ...TXID },
        interval: { type: 'number', exclusiveMinimum: 0 },
        timeout: { type: 'number', exclusiveMinimum: 0 },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool'],
      properties: {
        tool: { const: 'save_artifact' },
        qrString: { type: 'string' },
        content: { type: 'string' },
        root: { type: 'string' },
        name: { type: 'string' },
        kind: { enum: ['qr', 'receipt', 'text'] },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'reference'],
      properties: {
        tool: { const: 'open_artifact' },
        reference: { type: 'string', minLength: 1 },
        rationale: { type: 'string' },
      },
    },
    {
      ...base,
      required: ['tool', 'text'],
      properties: {
        tool: { const: 'copy_to_clipboard' },
        text: { type: 'string' },
        rationale: { type: 'string' },
      },
    },
  ];
}

const ajv = new Ajv({ allErrors: true, strict: false });

const actionDraftSchema = { oneOf: buildActionSchemas(false) };
const actionMaterializedSchema = { oneOf: buildActionSchemas(true) };

ajv.addSchema(actionDraftSchema, 'agent-action-draft');
ajv.addSchema(actionMaterializedSchema, 'agent-action-materialized');

const agentPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'request', 'actions'],
  properties: {
    version: { const: 'agent-plan/v1' },
    request: { type: 'string', minLength: 1 },
    actions: { type: 'array', items: { $ref: 'agent-action-draft' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    context: { type: 'object' },
  },
};

const materializedPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'request', 'actions'],
  properties: {
    version: { const: 'agent-plan/v1' },
    request: { type: 'string', minLength: 1 },
    actions: { type: 'array', items: { $ref: 'agent-action-materialized' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    context: { type: 'object' },
  },
};

const providerConfigSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'provider', 'model', 'capabilityMode'],
  properties: {
    version: { const: 'agent-config/v1' },
    provider: { enum: ['openai', 'openrouter', 'nvidia', 'custom'] },
    baseUrl: { type: 'string' },
    model: { type: 'string', minLength: 1 },
    timeoutMs: { type: 'integer', minimum: 1 },
    headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
      propertyNames: { not: { pattern: '^(authorization|proxy-authorization|cookie|api-key|x-api-key)$', flags: 'i' } },
    },
    capabilityMode: { enum: ['native-tools', 'strict-json-plan'] },
    privacyAcknowledgedAt: { type: 'string' },
  },
};

const commandResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'status'],
  properties: {
    version: { const: 'agent-command/v1' },
    status: { enum: ['succeeded', 'needs_confirmation', 'needs_clarification', 'blocked', 'failed'] },
    request: { type: 'string' },
    message: { type: 'string' },
    plan: { type: 'object' },
    actions: { type: 'array', items: { type: 'object' } },
    sessionId: { type: 'string' },
    executionIds: { type: 'array', items: { type: 'string' } },
    error: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        detail: { type: 'string' },
      },
      required: ['message'],
    },
  },
};

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'sessionId', 'createdAt', 'updatedAt', 'contextLabel', 'events'],
  properties: {
    version: { const: 'agent-session/v1' },
    sessionId: { type: 'string', minLength: 1 },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    contextLabel: { type: 'string' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'at', 'data'],
        properties: {
          type: {
            enum: [
              'prompt',
              'summary',
              'plan',
              'confirmation',
              'tool_call',
              'tool_result',
              'error',
              'artifact',
              'ledger',
              'cancellation',
            ],
          },
          at: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  },
};

const ledgerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'executionId', 'sessionId', 'tool', 'transactionId', 'status', 'createdAt', 'updatedAt'],
  properties: {
    version: { const: 'agent-ledger/v1' },
    executionId: { type: 'string', minLength: 1 },
    sessionId: { type: 'string', minLength: 1 },
    tool: {
      enum: [
        'generate_online_qr',
        'generate_offline_khqr',
        'create_checkout_payload',
        'create_checkout_purchase',
        'create_payment_link',
        'check_transaction',
        'check_transaction_by_merchant_ref',
        'poll_transaction',
        'save_artifact',
        'open_artifact',
        'copy_to_clipboard',
      ],
    },
    transactionId: { type: ['string', 'null'] },
    merchantRef: { type: 'string' },
    status: {
      enum: ['planned', 'confirmed', 'submitted', 'succeeded', 'failed', 'outcome_unknown'],
    },
    correlation: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    error: {
      type: 'object',
      additionalProperties: false,
      properties: { code: { type: 'string' }, message: { type: 'string' } },
      required: ['message'],
    },
  },
};

const artifactSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'artifactId', 'sessionId', 'kind', 'path', 'generatedAt'],
  properties: {
    version: { const: 'agent-artifact/v1' },
    artifactId: { type: 'string', minLength: 1 },
    sessionId: { type: 'string', minLength: 1 },
    kind: { enum: ['qr', 'receipt', 'text'] },
    path: { type: 'string' },
    url: { type: 'string' },
    generatedAt: { type: 'string' },
    route: { type: 'string' },
    amount: { type: 'number' },
    currency: CURRENCY,
    transactionId: { type: 'string' },
    executionId: { type: 'string' },
  },
};

const validatePlan = ajv.compile(agentPlanSchema) as ValidateFunction<AgentPlanV1>;
const validateMaterialized = ajv.compile(materializedPlanSchema) as ValidateFunction<MaterializedAgentPlanV1>;
const validateProviderConfig = ajv.compile(providerConfigSchema) as ValidateFunction<ProviderConfigV1>;
const validateCommandResult = ajv.compile(commandResultSchema) as ValidateFunction<AgentCommandResultV1>;
const validateSession = ajv.compile(sessionSchema) as ValidateFunction<AgentSessionV1>;
const validateLedger = ajv.compile(ledgerSchema) as ValidateFunction<ExecutionRecordV1>;
const validateArtifact = ajv.compile(artifactSchema) as ValidateFunction<ArtifactMetadataV1>;

export {
  validateArtifact,
  validateCommandResult,
  validateLedger,
  validateMaterialized as validateMaterializedPlan,
  validatePlan as validateAgentPlan,
  validateProviderConfig,
  validateSession,
};

export function isValidAgentPlan(value: unknown): value is AgentPlanV1 {
  return validatePlan(value);
}

export function isValidMaterializedPlan(value: unknown): value is MaterializedAgentPlanV1 {
  return validateMaterialized(value);
}
