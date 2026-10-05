import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { PassThrough } from 'node:stream';
import { stripAnsi } from '../test/test-utils.js';
import { runSessionLoop, declaresTransactionIdOption } from '../cli/session.js';

function capture(): { stdout: string[]; restore: () => void } {
  const stdout: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    stdout.push(stripAnsi(args.map((a) => String(a)).join(' ')));
  };
  return { stdout, restore: () => (console.log = original) };
}

function makeProgram(): { program: Command; received: Array<string[]> } {
  const program = new Command();
  const received: Array<string[]> = [];
  program
    .command('check-transaction')
    .description('check')
    .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
    .action((opts: Record<string, unknown>): void => {
      received.push(['check-transaction', String(opts.transactionId)]);
    });
  const group = program.command('pre-auth').description('pre-auth group');
  group
    .command('complete')
    .description('complete')
    .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
    .option('-a, --amount <n>', 'amount')
    .action((opts: Record<string, unknown>): void => {
      received.push(['pre-auth complete', String(opts.transactionId), String(opts.amount ?? '-')]);
    });
  // :run cannot dispatch `pre-auth complete` (money-out blocklist, audit M12);
  // `cancel` is the group's allowed -t-declaring subcommand.
  group
    .command('cancel')
    .description('cancel')
    .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
    .action((opts: Record<string, unknown>): void => {
      received.push(['pre-auth cancel', String(opts.transactionId)]);
    });
  program
    .command('exchange-rate')
    .description('no -t here')
    .action((): void => {
      received.push(['exchange-rate']);
    });
  return { program, received };
}

async function runSession(
  lines: string[],
  opts: { resume?: boolean; sessionDir: string },
): Promise<{ stdout: string[] }> {
  const { program } = makeProgram();
  const input = new PassThrough();
  const output = new PassThrough();
  const captured = capture();
  try {
    const loop = runSessionLoop({
      input: input as unknown as NodeJS.ReadableStream,
      output: output as unknown as NodeJS.WritableStream,
      interactive: false,
      resume: opts.resume,
      sessionDir: opts.sessionDir,
      program,
    });
    for (const line of lines) input.write(`${line}\n`);
    input.write(':exit\n');
    input.end();
    await loop;
  } finally {
    captured.restore();
  }
  return { stdout: captured.stdout };
}

describe('runSessionLoop', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'payway-session-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('dispatches bare commands through the program', async () => {
    const { stdout } = await runSession(['exchange-rate'], { sessionDir: tempDir });
    expect(stdout.join('\n')).toContain('Running: payway-sdk exchange-rate');
    expect(stdout.join('\n')).not.toContain('not a dispatchable');
  });

  it(':use injects -t for -t-declaring commands (top-level and nested) and can be cleared', async () => {
    const { program, received } = makeProgram();
    const input = new PassThrough();
    const output = new PassThrough();
    const captured = capture();
    try {
      const loop = runSessionLoop({
        input: input as unknown as NodeJS.ReadableStream,
        output: output as unknown as NodeJS.WritableStream,
        interactive: false,
        sessionDir: tempDir,
        program,
      });
      input.write(':use TRX-777\n');
      input.write('check-transaction\n');
      input.write('pre-auth cancel\n');
      input.write(':use off\n');
      input.write('exchange-rate\n');
      input.write(':exit\n');
      input.end();
      await loop;
    } finally {
      captured.restore();
    }
    expect(received[0]).toEqual(['check-transaction', 'TRX-777']);
    expect(received[1]).toEqual(['pre-auth cancel', 'TRX-777']);
    expect(received[2]).toEqual(['exchange-rate']);
    expect(captured.stdout.join('\n')).toContain('sticky transaction: TRX-777');
  });

  it('does not inject when the user already passed -t', async () => {
    const { program, received } = makeProgram();
    const input = new PassThrough();
    const output = new PassThrough();
    try {
      const loop = runSessionLoop({
        input: input as unknown as NodeJS.ReadableStream,
        output: output as unknown as NodeJS.WritableStream,
        interactive: false,
        sessionDir: tempDir,
        program,
      });
      input.write(':use TRX-A\n');
      input.write('check-transaction -t TRX-B\n');
      input.write(':exit\n');
      input.end();
      await loop;
    } finally {
      // eslint-disable-next-line no-useless-catch
    }
    expect(received[0]).toEqual(['check-transaction', 'TRX-B']);
  });

  it('unknown directives get did-you-mean; :help lists :use', async () => {
    const { stdout } = await runSession([':uze TRX-1', ':help'], { sessionDir: tempDir });
    const text = stdout.join('\n');
    expect(text).toContain("Did you mean ':use'?");
    expect(text).toContain(':use [tran-id]');
  });

  it('persists history entries and resumes the most recent session', async () => {
    await runSession(['exchange-rate'], { sessionDir: tempDir });
    const files = readdirSync(tempDir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(readFileSync(path.join(tempDir, files[0]), 'utf8')) as {
      version: string;
      entries: Array<{ argv: string[] }>;
    };
    expect(saved.version).toBe('cli-session/v1');
    expect(saved.entries[0].argv).toEqual(['exchange-rate']);

    const { stdout } = await runSession([], { resume: true, sessionDir: tempDir });
    expect(stdout.join('\n')).toContain('resumed session');
    expect(stdout.join('\n')).toContain('1 prior command(s)');
  });

  it('declaresTransactionIdOption distinguishes -t commands', () => {
    const { program } = makeProgram();
    const check = program.commands.find((cmd) => cmd.name() === 'check-transaction');
    const rate = program.commands.find((cmd) => cmd.name() === 'exchange-rate');
    expect(declaresTransactionIdOption(check!)).toBe(true);
    expect(declaresTransactionIdOption(rate!)).toBe(false);
  });
});
