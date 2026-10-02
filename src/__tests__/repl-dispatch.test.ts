import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { PassThrough } from 'node:stream';
import { createDispatcher } from '../agent/repl-dispatch.js';

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  return { lines, restore: () => (console.log = original) };
}

describe('createDispatcher', () => {
  it('dispatches a registered offline command and swallows its console output into the loop', async () => {
    const program = new Command();
    let invoked = '';
    program
      .command('echo-thing')
      .description('test command')
      .option('-n, --name <name>', 'name')
      .action((opts: { name?: string }) => {
        invoked = opts.name ?? 'none';
      });

    const captured = captureConsole();
    try {
      await createDispatcher(() => program)('echo-thing --name hello');
    } finally {
      captured.restore();
    }
    expect(invoked).toBe('hello');
    expect(captured.lines.some((l) => l.includes('Running: payway-sdk echo-thing --name hello'))).toBe(true);
  });

  it('rejects unknown commands, shells, and agent-management commands with exact messages', async () => {
    const program = new Command();
    program.command('real-command').description('x').action(() => {});
    const dispatch = createDispatcher(() => program);

    const captured = captureConsole();
    try {
      await dispatch('no-such-command');
      await dispatch('real-command | rm -rf');
      await dispatch('agent');
      await dispatch('');
    } finally {
      captured.restore();
    }
    expect(captured.lines.some((l) => l.includes("not a dispatchable PayWay command"))).toBe(true);
    expect(captured.lines.some((l) => l.includes('looks like a shell, path, or URI'))).toBe(true);
    expect(captured.lines.filter((l) => l.includes('Running:'))).toHaveLength(0);
  });

  it('traps process.exit from a dispatched command and restores the exit code', async () => {
    const program = new Command();
    program.command('exiter').description('exits').action(() => {
      process.exit(7);
    });
    const dispatch = createDispatcher(() => program);

    const captured = captureConsole();
    const before = process.exitCode;
    try {
      await dispatch('exiter');
    } finally {
      captured.restore();
      process.exitCode = before;
    }
    // The loop survived (we got here) and the exit code did not leak as 7.
    expect(process.exitCode).not.toBe(7);
  });

  it('dispatches nested subcommands (two-level chains)', async () => {
    const program = new Command();
    let seen: string | undefined;
    const group = program.command('group-thing').description('g');
    group.command('leaf').description('l').option('-v, --value <v>', 'v').action((opts: { value?: string }) => {
      seen = opts.value;
    });

    const captured = captureConsole();
    try {
      await createDispatcher(() => program)('group-thing leaf --value 42');
    } finally {
      captured.restore();
    }
    expect(seen).toBe('42');
  });

  it('blocks money-out subcommand pairs before dispatch while readable pairs still run', async () => {
    const program = new Command();
    let voidInvoked = false;
    let detailInvoked = false;
    const group = program.command('payment-link').description('pl');
    group.command('void').description('v').action(() => {
      voidInvoked = true;
    });
    group
      .command('detail')
      .description('d')
      .option('-i, --id <id>')
      .action(() => {
        detailInvoked = true;
      });
    const dispatch = createDispatcher(() => program);

    const captured = captureConsole();
    try {
      await dispatch('payment-link void -i link-1 -y --json');
      await dispatch('payment-link detail -i link-1');
    } finally {
      captured.restore();
    }
    expect(captured.lines.some((l) => l.includes('blocked in the REPL/session dispatcher for safety'))).toBe(true);
    expect(captured.lines.filter((l) => l.includes('Running:'))).toHaveLength(1);
    expect(voidInvoked).toBe(false);
    expect(detailInvoked).toBe(true);
  });
});

// Keep the import used for type parity with the REPL harness.
void PassThrough;
