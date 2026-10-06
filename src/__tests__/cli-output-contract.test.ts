/**
 * CLI machine-output contract tests (audit pass 2 §16, DX-CLI-001/002/007):
 * the v2 envelope invariants, the §16.3 exit-code enum, runCommand's
 * machine/human behavior, and the capabilities catalog derived from a
 * registry tree — pure, in-process (the live-registry parity is smoke-proven
 * by `node dist/cli.js capabilities --json` in CI's CJS/ESM smokes).
 */
import { describe, expect, it } from 'vitest';

import type { Command as CommanderCommand } from 'commander';
import { Command } from 'commander';

import {
  ENVELOPE_SCHEMA_VERSION,
  EXIT_CODES,
  EXIT_CODE_VALUES,
  assertEnvelopeInvariants,
} from '../cli/output/contract.js';
import { buildEnvelope, errorRecord, exitCodeForError } from '../cli/output/envelope.js';
import { runCommand } from '../cli/output/run-command.js';
import {
  MONEY_MOVING_COMMANDS,
  buildCapabilities,
  capabilitiesEnvelope,
  collectRegistryTree,
  type CommandCapability,
} from '../cli/commands/capabilities.js';
import { PayWayAPIError, PayWayConfigError, PayWayNetworkError } from '../errors.js';

function makeSyntheticProgram(): CommanderCommand {
  const program = new Command();
  program.name('payway-sdk');
  const refund = program.command('refund').description('Refund a paid transaction');
  refund.command('create').description('Create a refund');
  const cof = program.command('cof').description('Credentials on file');
  cof
    .command('token')
    .description('Token lifecycle')
    .command('remove')
    .description('Remove a linked token');
  program.command('status').description('Code reference tables');
  return program;
}

describe('v2 envelope contract (§16.1)', () => {
  it('schemaVersion is the pinned 2.0 and invariants hold on a valid document', () => {
    expect(ENVELOPE_SCHEMA_VERSION).toBe('2.0');
    const env = buildEnvelope({ kind: 'result', command: 'capabilities', ok: true, data: { count: 1 } });
    expect(() => assertEnvelopeInvariants(env)).not.toThrow();
    expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(env.context.nodeVersion).toBe(process.version);
  });

  it('invariants: ok:true requires data; ok:false requires errors and omits data', () => {
    expect(() =>
      assertEnvelopeInvariants(buildEnvelope({ kind: 'result', command: 'x', ok: true })),
    ).toThrow(/requires data/);
    expect(() =>
      assertEnvelopeInvariants(buildEnvelope({ kind: 'error', command: 'x', ok: false })),
    ).toThrow(/requires errors/);
    expect(() =>
      assertEnvelopeInvariants(buildEnvelope({ kind: 'error', command: 'x', ok: false, data: {}, errors: [{ type: 'E', message: 'm', exitCode: 1 }] })),
    ).toThrow(/must omit data/);
  });
});

describe('§16.3 exit codes', () => {
  it('defines exactly the 8 operational values', () => {
    expect([...EXIT_CODE_VALUES].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 130]);
    expect(EXIT_CODES.GATE_BLOCKER).toBe(5);
    expect(EXIT_CODES.GUARD_REFUSED).toBe(6);
    expect(EXIT_CODES.CALLBACK).toBe(4);
  });

  it('maps error classes to codes: config -> 1, api -> 2, network/rate-limit -> 3', () => {
    expect(exitCodeForError(new PayWayConfigError('bad input'))).toBe(1);
    expect(exitCodeForError(new PayWayAPIError('gateway said no', { statusCode: 400 }))).toBe(2);
    expect(exitCodeForError(new PayWayNetworkError('timeout'))).toBe(3);
    expect(exitCodeForError(new Error('mystery'))).toBe(1);
  });
});

describe('runCommand (DX-CLI-002)', () => {
  it('machine mode returns exactly one envelope with the data payload', async () => {
    const { exitCode, envelope } = await runCommand({
      command: 'status',
      machine: true,
      run: async () => ({ data: { table: 'codes' } }),
    });
    expect(exitCode).toBe(0);
    expect(envelope?.ok).toBe(true);
    expect(envelope?.command).toBe('status');
    expect((envelope?.data as { table: string }).table).toBe('codes');
  });

  it('human mode renders and returns no envelope', async () => {
    let rendered = '';
    const { exitCode, envelope } = await runCommand({
      command: 'status',
      machine: false,
      run: async () => ({ data: { hello: 'world' } }),
      render: (d: unknown) => {
        rendered = JSON.stringify(d);
      },
    });
    expect(exitCode).toBe(0);
    expect(envelope).toBeUndefined();
    expect(rendered).toContain('hello');
  });

  it('a thrown validation failure maps to exit 1 with an error envelope carrying the record', async () => {
    const { exitCode, envelope } = await runCommand({
      command: 'status',
      machine: true,
      run: async () => {
        throw new PayWayConfigError('amount must be positive');
      },
    });
    expect(exitCode).toBe(1);
    expect(envelope?.ok).toBe(false);
    expect(envelope?.errors?.[0].exitCode).toBe(1);
    expect(envelope?.errors?.[0].message).toContain('amount must be positive');
    expect(() => assertEnvelopeInvariants(envelope!)).not.toThrow();
  });

  it('a gateway rejection (PayWayAPIError) maps to exit 2', async () => {
    const { exitCode } = await runCommand({
      command: 'status',
      machine: true,
      run: async () => {
        throw new PayWayAPIError('wrong hash', { statusCode: 400 });
      },
    });
    expect(exitCode).toBe(2);
  });
});

describe('capabilities catalog (DX-CLI-007)', () => {
  const caps: CommandCapability[] = buildCapabilities(collectRegistryTree(makeSyntheticProgram()));

  it('derives dotted names, groups and descriptions from the registry tree', () => {
    const names = caps.map((c) => c.name);
    expect(names).toContain('refund.create');
    expect(names).toContain('cof.token.remove');
    expect(names).toContain('status');
    const status = caps.find((c) => c.name === 'status')!;
    expect(status.group).toBe('status');
    expect(status.description).toContain('reference');
  });

  it('moneyMoving is true exactly for the §12.2 class-3 set', () => {
    const money = caps.filter((c) => c.moneyMoving).map((c) => c.path);
    expect(money).toEqual(['refund', 'cof token remove']);
    expect(MONEY_MOVING_COMMANDS).toContain('pre-auth complete-payout');
    expect(MONEY_MOVING_COMMANDS).toContain('payment-link void');
    expect(MONEY_MOVING_COMMANDS).toContain('beneficiary update-status');
  });

  it('read-only classification: money-moving and unverified commands are never readOnly', () => {
    for (const cap of caps) {
      if (cap.moneyMoving) expect(cap.readOnly).toBe(false);
    }
  });

  it('capabilitiesEnvelope is a valid v2 collection with counts', () => {
    const env = capabilitiesEnvelope(caps);
    expect(() => assertEnvelopeInvariants(env)).not.toThrow();
    expect(env.kind).toBe('collection');
    expect(env.command).toBe('capabilities');
    const data = env.data as { count: number; moneyMovingCount: number; commands: CommandCapability[] };
    expect(data.count).toBe(caps.length);
    expect(data.commands).toHaveLength(caps.length);
  });

  it('errorRecord carries type/message/exitCode and optional correlation', () => {
    const rec = errorRecord(new PayWayAPIError('boom', { statusCode: 500 }), 2);
    expect(rec).toMatchObject({ type: 'PayWayAPIError', message: 'boom', exitCode: 2 });
  });
});
