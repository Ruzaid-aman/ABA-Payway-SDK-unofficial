import { describe, expect, it } from 'vitest';

import { PayWayGuardError } from '../errors.js';
import { exitCodeForError } from '../cli/output/envelope.js';
import { MONEY_MOVING_COMMANDS } from '../cli/commands/capabilities.js';
import {
  MONEY_MOVING_PATHS,
  assertOperationAllowed,
  classifyOperation,
  guardCliCommand,
  resolveEnvironment,
} from '../core/env-guard.js';

describe('env-guard matrix', () => {
  it('money-moving allowed in sandbox and unknown without flags', () => {
    for (const p of MONEY_MOVING_PATHS) {
      expect(classifyOperation(p)).toBe('money-moving');
      expect(assertOperationAllowed('money-moving', 'sandbox', {}).allowed).toBe(true);
      expect(assertOperationAllowed('money-moving', 'unknown', {}).allowed).toBe(true);
    }
  });

  it('money-moving refused in production without --confirm-production', () => {
    for (const _p of MONEY_MOVING_PATHS) {
      const d = assertOperationAllowed('money-moving', 'production', {});
      expect(d.allowed).toBe(false);
      expect(d.ruleId).toBe('PW-GUARD-001');
    }
  });

  it('money-moving allowed in production with confirmProduction', () => {
    expect(assertOperationAllowed('money-moving', 'production', { confirmProduction: true }).allowed).toBe(true);
  });

  it('sandbox-only always refused in production, no flags help', () => {
    const d = assertOperationAllowed('sandbox-only', 'production', {});
    expect(d.allowed).toBe(false);
    expect(d.ruleId).toBe('PW-GUARD-002');
    expect(
      assertOperationAllowed('sandbox-only', 'production', { confirmProduction: true, allowUnverified: true }).allowed,
    ).toBe(false);
  });

  it('unverified refused in production unless both flags', () => {
    expect(assertOperationAllowed('unverified', 'production', {}).allowed).toBe(false);
    expect(assertOperationAllowed('unverified', 'production', {}).ruleId).toBe('PW-GUARD-003');
    expect(assertOperationAllowed('unverified', 'production', { confirmProduction: true }).allowed).toBe(false);
    expect(assertOperationAllowed('unverified', 'production', { allowUnverified: true }).allowed).toBe(false);
    expect(
      assertOperationAllowed('unverified', 'production', { confirmProduction: true, allowUnverified: true }).allowed,
    ).toBe(true);
  });
});

describe('resolveEnvironment precedence', () => {
  it('explicit environment beats env vars', () => {
    expect(resolveEnvironment({ environment: 'production', env: { PAYWAY_ENV: 'sandbox', PAYWAY_SANDBOX: '1' } })).toBe(
      'production',
    );
  });

  it('URL is AUTHORITATIVE over labels (audit DX-GUARD-001, fail-safe)', () => {
    // A sandbox label with a production endpoint MUST resolve production —
    // the guard demands --confirm-production rather than waving a
    // production-bound money-move through.
    expect(
      resolveEnvironment({
        env: { PAYWAY_ENV: 'sandbox', PAYWAY_SANDBOX: '1' },
        apiBaseUrl: 'https://checkout.payway.com.kh/',
      }),
    ).toBe('production');
    // The reverse mismatch also resolves production (safe, may over-block).
    expect(
      resolveEnvironment({ environment: 'production', apiBaseUrl: 'https://checkout-sandbox.payway.com.kh/' }),
    ).toBe('sandbox');
  });

  it('URL shape resolves sandbox/production', () => {
    expect(resolveEnvironment({ apiBaseUrl: 'https://checkout-sandbox.payway.com.kh/api/...' })).toBe('sandbox');
    expect(resolveEnvironment({ apiBaseUrl: 'https://checkout.payway.com.kh/api/...' })).toBe('production');
  });

  it('empty input is unknown', () => {
    expect(resolveEnvironment({})).toBe('unknown');
  });

  it('PAYWAY_SANDBOX=1 implies sandbox', () => {
    expect(resolveEnvironment({ env: { PAYWAY_SANDBOX: '1' } })).toBe('sandbox');
  });
});

describe('exit mapping', () => {
  it('PayWayGuardError maps to exit code 6', () => {
    expect(exitCodeForError(new PayWayGuardError('x'))).toBe(6);
  });
});

describe('guardCliCommand', () => {
  it('throws for money-moving + production without flags', () => {
    expect(() => guardCliCommand('refund', 'production', {})).toThrow(PayWayGuardError);
    expect(() => guardCliCommand('refund', 'production', {})).toThrow(/--confirm-production/);
  });

  it('allows money-moving + production with the flag', () => {
    expect(() => guardCliCommand('refund', 'production', { confirmProduction: true })).not.toThrow();
  });
});

describe('classification parity', () => {
  it('MONEY_MOVING_PATHS equals capabilities MONEY_MOVING_COMMANDS classification', () => {
    for (const p of MONEY_MOVING_COMMANDS) {
      expect(classifyOperation(p)).toBe('money-moving');
      expect(MONEY_MOVING_PATHS).toContain(p);
    }
    expect(classifyOperation('status')).not.toBe('money-moving');
  });
});
