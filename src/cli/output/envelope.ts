/**
 * Envelope builders (audit pass 2 §16.1, DX-CLI-001): one factory for the
 * v2 machine document + the shared context block. Consumed by runCommand;
 * `coherence`/`credentialSource` stay `unknown`/`missing` until the
 * env-guard wave (WP-07) supplies real derivation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  Envelope,
  EnvelopeContext,
  EnvelopeErrorRecord,
  EnvelopeKind,
  EnvelopeNextAction,
  EnvelopeWarning,
} from './contract.js';
import { ENVELOPE_SCHEMA_VERSION } from './contract.js';

function readPackageVersion(): string {
  try {
    const moduleUrl: string | undefined = import.meta.url;
    if (moduleUrl) {
      const pkgPath = fileURLToPath(new URL('../../../package.json', moduleUrl));
      return (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }).version ?? 'unknown';
    }
  } catch {
    // fall through
  }
  return 'unknown';
}

let cachedSdkVersion: string | undefined;

/** SDK/CLI version (single package today) — read once. */
export function packageVersion(): string {
  cachedSdkVersion ??= readPackageVersion();
  return cachedSdkVersion;
}

/** Neutral context until WP-07 (env-guard) supplies real derivation. */
export function buildContext(overrides: Partial<EnvelopeContext> = {}): EnvelopeContext {
  return {
    environment: 'unknown',
    coherence: 'unknown',
    credentialSource: 'missing',
    sdkVersion: packageVersion(),
    cliVersion: packageVersion(),
    nodeVersion: process.version,
    guard: { production: false, required: false, supplied: false, bypassActive: false },
    ...overrides,
  };
}

export interface BuildEnvelopeInput {
  kind: EnvelopeKind;
  command: string;
  ok: boolean;
  data?: unknown;
  warnings?: EnvelopeWarning[];
  errors?: EnvelopeErrorRecord[];
  nextActions?: EnvelopeNextAction[];
  context?: Partial<EnvelopeContext>;
}

/** Assemble the envelope; timestamped at build time (UTC ISO-8601). */
export function buildEnvelope(input: BuildEnvelopeInput): Envelope {
  const env: Envelope = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    kind: input.kind,
    command: input.command,
    ok: input.ok,
    timestamp: new Date().toISOString(),
    context: buildContext(input.context),
  };
  if (input.data !== undefined) env.data = input.data;
  if (input.warnings?.length) env.warnings = input.warnings;
  if (input.errors?.length) env.errors = input.errors;
  if (input.nextActions?.length) env.nextActions = input.nextActions;
  return env;
}

/** Map any thrown error to a §16.3 exit code (mirror of the CLI's
 * classifyError — kept local so the output layer has no cli.ts import). */
export function exitCodeForError(e: unknown): number {
  // Imported lazily-by-shape, not by class: the output layer must not depend
  // on error-class hierarchies owned by other modules. Duck-type the fields
  // the SDK error classes carry (name + retryable/statusCode).
  const name = e instanceof Error ? e.constructor.name : '';
  if (name === 'PollingAbortedError' || name === 'CircuitOpenError') {
    return 3;
  }
  if (name === 'PayWayNetworkError' || name === 'PayWayRateLimitError') return 3;
  if (name === 'PayWayGuardError') return 6;
  if (name === 'PayWayAPIError') {
    const anyErr = e as { statusCode?: number; retryable?: boolean };
    if (anyErr.statusCode === undefined && anyErr.retryable === true) return 3;
    return 2;
  }
  return 1;
}

/** Reduce any thrown error to the envelope error record. */
export function errorRecord(e: unknown, exitCode: number): EnvelopeErrorRecord {
  const rec: EnvelopeErrorRecord = {
    type: e instanceof Error ? e.constructor.name : typeof e,
    message: e instanceof Error ? e.message : String(e),
    exitCode,
  };
  const maybe = e as { code?: string; paywayCode?: string; correlationId?: string };
  const code = maybe.paywayCode ?? maybe.code;
  if (typeof code === 'string' || typeof code === 'number') rec.code = String(code);
  if (typeof maybe.correlationId === 'string') rec.correlationId = maybe.correlationId;
  return rec;
}
