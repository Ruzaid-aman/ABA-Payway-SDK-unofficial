/**
 * Transaction Journal — strict Ajv schema (mirrors the agent-contracts
 * pattern in src/agent/schemas.ts: `additionalProperties: false`, compiled
 * once per process). The writer drops — never throws on — events that fail
 * validation, so journaling can never fail SDK execution.
 */

import { Ajv, type ValidateFunction } from 'ajv';
import { JOURNAL_VERSION } from './types.js';

const journalEventSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'ts', 'eventId', 'kind', 'correlationId'],
  properties: {
    version: { const: JOURNAL_VERSION },
    ts: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}' },
    eventId: { type: 'string', minLength: 1 },
    kind: {
      enum: [
        'execution.started',
        'execution.request',
        'execution.response',
        'execution.error',
        'poll.attempt',
        'status.observed',
        'artifact.written',
      ],
    },
    correlationId: { type: 'string', minLength: 1 },
    attempt: { type: 'integer', minimum: 0 },
    executionId: { type: 'string', minLength: 1 },
    sessionId: { type: 'string', minLength: 1 },
    transactionId: { type: 'string', minLength: 1 },
    merchantRef: { type: 'string', minLength: 1 },
    command: { type: 'string', minLength: 1 },
    endpoint: { type: 'string', minLength: 1 },
    httpStatus: { type: 'integer', minimum: 100, maximum: 599 },
    paywayCode: { type: 'string', minLength: 1 },
    durationMs: { type: 'integer', minimum: 0 },
    traceId: { type: 'string', minLength: 1 },
    status: { type: 'string', minLength: 1 },
    artifact: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactId: { type: 'string', minLength: 1 },
        path: { type: 'string', minLength: 1 },
      },
    },
    requestDigest: {},
    responseDigest: {},
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

let compiled: ValidateFunction | undefined;

export function validateJournalEvent(value: unknown): boolean {
  compiled ??= new Ajv({ allErrors: true }).compile(journalEventSchema);
  return compiled(value) as boolean;
}
