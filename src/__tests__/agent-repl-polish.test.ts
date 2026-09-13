import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { PassThrough } from 'node:stream';
import { stripAnsi } from '../test/test-utils.js';
import { classifyReplLine } from '../agent/repl-helpers.js';
import { setAgentProgram, runRepl } from '../agent/repl.js';

function classifyLines(): { stdout: string[]; restore: () => void } {
  const stdout: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    stdout.push(stripAnsi(args.map((a) => String(a)).join(' ')));
  };
  return { stdout, restore: () => (console.log = original) };
}

describe('classifyReplLine — new directives', () => {
  it('classifies :tools, :docs, :journal, :status variants', () => {
    expect(classifyReplLine(':tools')).toEqual({ kind: 'tools' });
    expect(classifyReplLine(':docs')).toEqual({ kind: 'docs', query: '' });
    expect(classifyReplLine(':docs callback hmac')).toEqual({ kind: 'docs', query: 'callback hmac' });
    expect(classifyReplLine(':docs read payment-links')).toEqual({ kind: 'docs', query: 'read payment-links' });
    expect(classifyReplLine(':journal')).toEqual({ kind: 'journal', args: '' });
    expect(classifyReplLine(':journal timeline -t X1')).toEqual({ kind: 'journal', args: 'timeline -t X1' });
    expect(classifyReplLine(':status')).toEqual({ kind: 'status' });
  });
});

describe('agent REPL polish (runRepl seam)', () => {
  function makeProgram(): Command {
    const program = new Command();
    program.command('journal').description('journal reads').action(() => {});
    return program;
  }

  async function runLines(lines: string[]): Promise<string[]> {
    const program = makeProgram();
    setAgentProgram(program);
    const input = new PassThrough();
    const output = new PassThrough();
    const captured = classifyLines();
    try {
      const replDone = runRepl({ input, output, interactive: false });
      for (const line of lines) input.write(`${line}\n`);
      input.write(':exit\n');
      input.end();
      await replDone;
    } finally {
      captured.restore();
    }
    return captured.stdout;
  }

  it(':tools lists the 14-tool catalog with risk classes', async () => {
    const stdout = await runLines([':tools']);
    const text = stdout.join('\n');
    expect(text).toContain('Agent tool catalog');
    expect(text).toContain('check_transaction');
    expect(text).toContain('create_payment_link');
    expect(text).toContain('mutation');
    expect(text).toContain('read-only');
  }, 10_000);

  it(':docs searches the offline knowledge base', async () => {
    const stdout = await runLines([':docs callback hmac']);
    const text = stdout.join('\n');
    expect(text).toContain('Knowledge search: "callback hmac"');
    expect(text).toContain('Read one with: :docs read <topic>');
  }, 10_000);

  it(':docs read with an unknown topic suggests searching first', async () => {
    const stdout = await runLines([':docs read definitely-not-a-topic']);
    expect(stdout.join('\n')).toContain('Unknown topic');
  }, 10_000);

  it(':journal re-dispatches through the shared dispatcher', async () => {
    const stdout = await runLines([':journal']);
    expect(stdout.join('\n')).toContain('Running: payway-sdk journal');
  }, 10_000);

  it('unknown directive prints did-you-mean', async () => {
    const stdout = await runLines([':stathx']);
    expect(stdout.join('\n')).toContain("Did you mean ':status'?");
  }, 10_000);
});
