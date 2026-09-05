import { PayWayConfigError } from '../errors.js';

export const CLI_OUTPUT_SCHEMA_VERSION = '1.0' as const;

export type StructuredOutputMode = 'json' | 'ndjson';
export type PaymentCommandName = 'generate-checkout' | 'generate-qr';

export interface StructuredError {
  kind: 'validation' | 'api' | 'network';
  exitCode: number;
  type: string;
  message: string;
  paywayCode?: string;
  httpStatus?: number;
  retryable?: boolean;
  hint?: string;
}

export interface PaymentCommandResult {
  schemaVersion: typeof CLI_OUTPUT_SCHEMA_VERSION;
  command: PaymentCommandName;
  transactionId: string;
  context: {
    environment: string;
    profile?: string;
  };
  request: {
    amount?: number;
    currency: 'USD' | 'KHR';
    mode: 'online' | 'offline';
  };
  creation: {
    outcome: 'accepted' | 'rejected' | 'unknown';
    gatewayResponse?: unknown;
    error?: StructuredError;
  };
  payment: {
    status: string;
    terminal: boolean;
  };
  poll: {
    outcome: 'not_requested' | 'terminal' | 'timed_out' | 'failed' | 'cancelled' | 'ended';
    attempts: number;
    elapsedMs: number;
    lastStatus?: string;
    reason?: string;
  };
  artifacts: {
    qrPngPath?: string;
  };
  nextAction: {
    kind: 'none' | 'check_existing_transaction' | 'fix_input';
    command?: string;
    reason: string;
  };
}

export interface PollProgressRecord {
  schemaVersion: typeof CLI_OUTPUT_SCHEMA_VERSION;
  event: 'poll';
  transactionId: string;
  attempt: number;
  paymentStatus: string;
  terminal: boolean;
  elapsedMs: number;
  error?: string;
}

export function parseStructuredOutputMode(value: unknown): StructuredOutputMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'json' || value === 'ndjson') return value;
  throw new PayWayConfigError(`--output must be json or ndjson, received: ${String(value)}`);
}

export function writeStructuredEvent(record: Record<string, unknown>): void {
  console.log(JSON.stringify({ schemaVersion: CLI_OUTPUT_SCHEMA_VERSION, ...record }));
}

export function writeStructuredFinal(mode: StructuredOutputMode, result: PaymentCommandResult): void {
  if (mode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  writeStructuredEvent({ event: 'final', result });
}

export function resolveOutputContext(input: {
  environment?: string;
  profile?: string;
}): PaymentCommandResult['context'] {
  return {
    environment: input.environment?.trim() || 'sandbox',
    ...(input.profile ? { profile: input.profile } : {}),
  };
}
