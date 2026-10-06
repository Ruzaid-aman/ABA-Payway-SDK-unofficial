/**
 * The CLI machine-output contract (audit pass 2 §16, DX-CLI-001) — one
 * versioned envelope for every machine-mode command invocation, plus the
 * single source of truth for exit codes (§16.3).
 *
 * Stage 1 (this wave): the contract module, the `runCommand` harness and the
 * `capabilities` command emit the v2 envelope; pre-existing `--json` shapes
 * stay byte-compatible until their owning work package (doctor rebuild
 * WP-11, env-guard WP-07) migrates them. Exit codes 4/5/6 are RESERVED —
 * exported here so gates can adopt them without renumbering.
 */

/** Envelope contract version — semver-major bumps only on breaking change. */
export const ENVELOPE_SCHEMA_VERSION = '2.0' as const;

export type EnvelopeKind = 'result' | 'collection' | 'diagnostic' | 'stream-event' | 'error' | 'text';

/**
 * §16.3 — 8 exit codes, each with operational value. An agent branches on
 * these reliably. 4/5/6 are defined now and wired by their owning gates
 * (webhook listen --fail-on, go-live/verify/doctor blockers, env-guard).
 */
export const EXIT_CODES = {
  /** Success; for verify/check/go-live: no BLOCKER and no mismatch. */
  OK: 0,
  /** Input, validation or configuration failure — never reached the network. */
  VALIDATION: 1,
  /** PayWay rejected the request — a real gateway answer. */
  API_FAILURE: 2,
  /** Network / timeout / rate-limit / circuit-open — outcome unknown for mutations. */
  NETWORK: 3,
  /** RESERVED: callback/webhook failure (PW-CB-*). */
  CALLBACK: 4,
  /** RESERVED: a gate evaluated to BLOCKER/mismatch — the system worked, the answer is no. */
  GATE_BLOCKER: 5,
  /** RESERVED: a safety guard refused the operation (PW-ENV, PW-SEC, PW-GUARD error families). */
  GUARD_REFUSED: 6,
  /** Interrupted (SIGINT). */
  INTERRUPTED: 130,
} as const;

export type ExitCodeName = keyof typeof EXIT_CODES;

/** Every defined exit-code value, for contract tests. */
export const EXIT_CODE_VALUES: readonly number[] = Object.values(EXIT_CODES);

/** §16.1 context block — required on every document. */
export interface EnvelopeContext {
  environment: 'sandbox' | 'production' | 'custom' | 'unknown';
  endpoint?: string;
  coherence: 'ok' | 'mismatch' | 'unknown';
  credentialSource: 'flag' | 'env' | 'dotenv' | 'profile' | 'missing';
  profile?: string;
  sdkVersion: string;
  cliVersion: string;
  nodeVersion: string;
  guard: { production: boolean; required: boolean; supplied: boolean; bypassActive: boolean };
}

export interface EnvelopeErrorRecord {
  code?: string;
  type: string;
  message: string;
  exitCode: number;
  correlationId?: string;
}

export interface EnvelopeWarning {
  ruleId?: string;
  message: string;
  severity?: 'info' | 'warning' | 'blocker';
  source?: 'official' | 'sandbox' | 'repository' | 'docs';
}

export interface EnvelopeNextAction {
  command: string;
  reason: string;
}

/** §16.1 — the one versioned envelope. Required: schemaVersion, kind,
 * command, ok, timestamp, context, and exactly one of data/errors. */
export interface Envelope {
  schemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  kind: EnvelopeKind;
  command: string;
  ok: boolean;
  timestamp: string;
  context: EnvelopeContext;
  data?: unknown;
  warnings?: EnvelopeWarning[];
  errors?: EnvelopeErrorRecord[];
  nextActions?: EnvelopeNextAction[];
}

/** Structural guard used by the contract test — the §16.1 invariants. */
export function assertEnvelopeInvariants(env: Envelope): void {
  if (env.schemaVersion !== ENVELOPE_SCHEMA_VERSION) {
    throw new Error(`envelope schemaVersion must be ${ENVELOPE_SCHEMA_VERSION}`);
  }
  for (const key of ['kind', 'command', 'ok', 'timestamp', 'context'] as const) {
    if (env[key] === undefined) throw new Error(`envelope.${key} is required`);
  }
  const hasData = env.data !== undefined;
  const hasErrors = Array.isArray(env.errors) && env.errors.length > 0;
  if (env.ok && !hasData) throw new Error('ok:true requires data');
  if (!env.ok && !hasErrors) throw new Error('ok:false requires errors[]');
  if (!env.ok && hasData) throw new Error('ok:false must omit data');
}
