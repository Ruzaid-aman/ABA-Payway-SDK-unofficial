import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { collectCompletionTree } from '../cli/completions/introspect.js';
import {
  COMPLETION_SHELLS,
  flattenTree,
  generateBashScript,
  generateCompletionScript,
  generateFishScript,
  generatePowerShellScript,
  generateZshScript,
} from '../cli/completions/generators.js';

function fixtureProgram(): Command {
  const program = new Command();
  program.name('payway-sdk').description('CLI').version('1.0.0');
  program.option('--profile <name>', 'Use a saved credential profile');
  const qr = program.command('generate-qr').description('Online QR');
  qr.option('-a, --amount <n>', 'Amount to charge — it\'s "quoted"');
  const link = program.command('payment-link').description('Payment links');
  link.command('create').description('Create a link').option('--title <t>', 'Link title');
  link.command('detail').description('Link detail by id');
  const cof = program.command('cof').description('Credentials on file');
  cof.command('token').description('Token lifecycle');
  return program;
}

describe('flattenTree', () => {
  it('keys entries by command chain with root at empty path', () => {
    const entries = flattenTree(collectCompletionTree(fixtureProgram()));
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual([
      '',
      'generate-qr',
      'payment-link',
      'payment-link create',
      'payment-link detail',
      'cof',
      'cof token',
    ]);
  });
});

describe('generateBashScript', () => {
  const script = generateBashScript(collectCompletionTree(fixtureProgram()));

  it('wires the completer to the binary', () => {
    expect(script).toContain('complete -F _payway_sdk payway-sdk');
  });

  it('completes top-level commands and child commands per path', () => {
    expect(script).toContain('generate-qr|payment-link|cof');
    expect(script).toContain('create|detail');
  });

  it('completes per-path flags including inherited globals and --help', () => {
    const qrArm = script.split('\n').find((line) => line.includes('"generate-qr") COMPREPLY'));
    expect(qrArm).toBeDefined();
    expect(qrArm).toContain('-a');
    expect(qrArm).toContain('--amount');
    expect(qrArm).toContain('--profile');
    expect(qrArm).toContain('--help');
  });

  it('keeps the root --version flag only at the root', () => {
    const arms = script.split('\n').filter((line) => line.includes('COMPREPLY') && line.includes('--version'));
    expect(arms).toHaveLength(1);
    expect(arms[0]).toContain('") COMPREPLY');
  });
});

describe('generateZshScript', () => {
  const script = generateZshScript(collectCompletionTree(fixtureProgram()));

  it('declares compdef for the binary', () => {
    expect(script).toContain('#compdef payway-sdk');
    expect(script).toContain('compdef _payway_sdk payway-sdk');
  });

  it('carries descriptions with single-quote escaping', () => {
    expect(script).toContain(`generate-qr:'Online QR'`);
    expect(script).toContain(String.raw`it'\''s "quoted"`);
  });
});

describe('generateFishScript', () => {
  const script = generateFishScript(collectCompletionTree(fixtureProgram()));

  it('disables file completion and emits root children', () => {
    expect(script).toContain('complete -c payway-sdk -f');
    expect(script).toContain("-n '__fish_use_subcommand' -a 'generate-qr'");
  });

  it('scopes subcommand flags with seen_subcommand_from and long+short', () => {
    expect(script).toContain("-n '__fish_seen_subcommand_from generate-qr' -l amount -s a");
  });

  it('guards two-level children against sibling leakage', () => {
    expect(script).toContain(
      "-n '__fish_seen_subcommand_from payment-link; and not __fish_seen_subcommand_from create; and not __fish_seen_subcommand_from detail' -a 'create'",
    );
  });
});

describe('generatePowerShellScript', () => {
  const script = generatePowerShellScript(collectCompletionTree(fixtureProgram()));

  it('registers a native argument completer', () => {
    expect(script).toContain("Register-ArgumentCompleter -CommandName 'payway-sdk' -Native");
  });

  it('completes top-level commands and flags', () => {
    expect(script).toContain(`'generate-qr'`);
    expect(script).toContain(`'--amount'`);
  });
});

describe('generateCompletionScript', () => {
  const tree = collectCompletionTree(fixtureProgram());

  it('dispatches every declared shell', () => {
    for (const shell of COMPLETION_SHELLS) {
      expect(generateCompletionScript(shell, tree)).toContain('payway-sdk');
    }
  });

  it('rejects unknown shells with the known list', () => {
    expect(() => generateCompletionScript('tcsh' as never, tree)).toThrow(/bash, zsh, fish, powershell/);
  });
});
