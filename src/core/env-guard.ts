/**
 * Production env-guard (audit WP-07 / §12): one module deciding whether an
 * operation may run in the resolved environment. Pure — no imports from the
 * CLI layer, no network, no process.exit.
 *
 * Exit discipline: refusals throw PayWayGuardError; the CLI maps that to
 * exit code 6 and never retries.
 */
import { PayWayGuardError } from '../errors.js';

export type EnvironmentIdentity = 'sandbox' | 'production' | 'unknown';
export type OperationClass = 'read-only' | 'attempt-creation' | 'money-moving' | 'sandbox-only' | 'unverified';

/** §12.2 class-3 ("moves money or terminates") CLI command paths.
 * Keep in sync with src/cli/commands/capabilities.ts MONEY_MOVING_COMMANDS. */
export const MONEY_MOVING_PATHS: readonly string[] = [
  'refund',
  'payout',
  'pre-auth complete',
  'pre-auth complete-payout',
  'pre-auth cancel',
  'close-transaction',
  'payment-link void',
  'cof token remove',
  'beneficiary add',
  'beneficiary update-status',
];

export const SANDBOX_ONLY_PATHS: readonly string[] = ['demo', 'sandbox-test-cards', 'sandbox-beneficiaries'];

export const UNVERIFIED_PATHS: readonly string[] = ['request-qr', 'self-activation'];

/** Resolve the environment from explicit config first, then env vars, then
 * the base-URL shape. Never throws; 'unknown' when nothing is determinable. */
export function resolveEnvironment(input: {
  environment?: string;
  apiBaseUrl?: string;
  env?: Record<string, string | undefined>;
}): EnvironmentIdentity {
  // 1. THE ENDPOINT IS AUTHORITATIVE (audit DX-GUARD-001): a recognized
  // production URL wins over any sandbox label — the fail-safe direction is
  // to demand --confirm-production, never to wave a production-bound
  // money-move through because a label said "sandbox".
  const url = input.apiBaseUrl?.toLowerCase() ?? '';
  if (url.includes('payway.com.kh')) {
    return url.includes('sandbox') ? 'sandbox' : 'production';
  }

  // 2. Explicit label beats env vars.
  const explicit = input.environment?.trim().toLowerCase();
  if (explicit === 'sandbox' || explicit === 'production') return explicit;

  const env = input.env ?? {};
  // 3. PAYWAY_ENV 'production'|'sandbox' wins over PAYWAY_SANDBOX.
  const paywayEnv = env.PAYWAY_ENV?.trim().toLowerCase();
  if (paywayEnv === 'production' || paywayEnv === 'sandbox') return paywayEnv;
  if (env.PAYWAY_SANDBOX === '1') return 'sandbox';

  // 4. otherwise 'unknown'.
  return 'unknown';
}

export function classifyOperation(commandPath: string): OperationClass {
  // commandPath is the CLI path, e.g. 'pre-auth complete'.
  // Exact match on the full path for money-moving; prefix match on the
  // first token for sandbox-only and unverified. Everything else is
  // 'read-only'.
  if (MONEY_MOVING_PATHS.includes(commandPath)) return 'money-moving';
  const firstToken = commandPath.split(' ')[0];
  if (SANDBOX_ONLY_PATHS.includes(firstToken)) return 'sandbox-only';
  if (UNVERIFIED_PATHS.includes(firstToken)) return 'unverified';
  return 'read-only';
}

export interface GuardDecision {
  allowed: boolean;
  reason?: string; // required when not allowed
  ruleId: string; // e.g. 'PW-GUARD-001'
}

/** The §12.2 matrix. `flags` are the guard flags the user supplied. */
export function assertOperationAllowed(
  operation: OperationClass,
  environment: EnvironmentIdentity,
  flags: { confirmProduction?: boolean; allowUnverified?: boolean },
): GuardDecision {
  // Rules, in order:
  // - 'unknown' environment: ALWAYS allow (never block on doubt), decision
  //   allowed: true.
  if (environment === 'unknown') return { allowed: true, ruleId: 'PW-GUARD-000' };

  // - sandbox-only + production: refuse unless... NO exceptions.
  if (operation === 'sandbox-only' && environment === 'production') {
    return {
      allowed: false,
      ruleId: 'PW-GUARD-002',
      reason: `${'This command is sandbox-only'}: refusing to run in production.`,
    };
  }

  // - unverified + production: refuse unless flags.allowUnverified AND
  //   flags.confirmProduction.
  if (operation === 'unverified' && environment === 'production') {
    if (flags.allowUnverified === true && flags.confirmProduction === true) {
      return { allowed: true, ruleId: 'PW-GUARD-000' };
    }
    return {
      allowed: false,
      ruleId: 'PW-GUARD-003',
      reason:
        'This command is unverified against production; pass --allow-unverified AND --confirm-production to proceed.',
    };
  }

  // - money-moving + production: refuse unless flags.confirmProduction.
  if (operation === 'money-moving' && environment === 'production') {
    if (flags.confirmProduction === true) return { allowed: true, ruleId: 'PW-GUARD-000' };
    return {
      allowed: false,
      ruleId: 'PW-GUARD-001',
      reason: 'Refusing money-moving command against production without --confirm-production.',
    };
  }

  // - everything else: allowed.
  return { allowed: true, ruleId: 'PW-GUARD-000' };
}

export function guardCliCommand(
  commandPath: string,
  environment: EnvironmentIdentity,
  flags: { confirmProduction?: boolean; allowUnverified?: boolean },
): void {
  const decision = assertOperationAllowed(classifyOperation(commandPath), environment, flags);
  if (!decision.allowed) throw new PayWayGuardError(`${decision.reason} (${decision.ruleId})`);
}
