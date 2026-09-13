import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { collectCompletionTree } from '../cli/completions/introspect.js';

function fixtureProgram(): Command {
  const program = new Command();
  program.name('payway-sdk').description('CLI').version('1.0.0');
  program.option('--profile <name>', 'Use a saved credential profile');
  const qr = program.command('generate-qr').description('Online QR');
  qr.option('-a, --amount <n>', 'Amount to charge');
  const hidden = program.command('secret', { hidden: true }).description('Hidden command');
  hidden.option('--token <t>', 'Do not suggest me');
  return program;
}

describe('collectCompletionTree', () => {
  it('walks commands, subcommands, and options with long/short/description', () => {
    const tree = collectCompletionTree(fixtureProgram());
    expect(tree.name).toBe('payway-sdk');
    const qr = tree.subcommands.find((c) => c.name === 'generate-qr');
    expect(qr).toBeDefined();
    expect(qr?.description).toBe('Online QR');
    expect(qr?.options).toEqual([{ long: '--amount', short: '-a', description: 'Amount to charge' }]);
    // `.version()` registers a real --version/-V option on the root (commander 15).
    expect(tree.options).toEqual([
      { long: '--version', short: '-V', description: 'output the version number' },
      { long: '--profile', short: undefined, description: 'Use a saved credential profile' },
    ]);
  });

  it('excludes hidden commands and hidden options', () => {
    const tree = collectCompletionTree(fixtureProgram());
    expect(tree.subcommands.map((c) => c.name)).not.toContain('secret');
  });

  it('keeps a nested subcommand two levels deep', () => {
    const program = new Command();
    const cof = program.command('cof').description('Credentials on file');
    cof.command('token').description('Token lifecycle').option('--request-id <id>', 'Request id');
    const tree = collectCompletionTree(program);
    const token = tree.subcommands[0]?.subcommands[0];
    expect(token?.name).toBe('token');
    expect(token?.options[0]?.long).toBe('--request-id');
  });
});
