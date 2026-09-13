import type { Command } from 'commander';
import { COMPLETION_SHELLS, generateCompletionScript } from '../completions/generators.js';
import { collectCompletionTree } from '../completions/introspect.js';

const INSTALL_HINTS: Record<(typeof COMPLETION_SHELLS)[number], string> = {
  bash: 'Install: source this file from ~/.bashrc',
  zsh: 'Install: source this file from ~/.zshrc (after compinit)',
  fish: 'Install: save as ~/.config/fish/completions/payway-sdk.fish',
  powershell: 'Install: dot-source this file from your $PROFILE',
};

/**
 * `payway-sdk completions <shell>` — emits a completion script derived from
 * the live program at request time (no hand-maintained list). Script goes to
 * stdout; the install hint goes to stderr so `| source` flows stay clean.
 */
export function registerCompletionsCommand(program: Command): void {
  program
    .command('completions')
    .description('Emit a shell completion script for payway-sdk (derived from the live command registry)')
    .argument('<shell>', `Target shell: ${COMPLETION_SHELLS.join(' | ')}`)
    .action((shell: string) => {
      if (!(COMPLETION_SHELLS as readonly string[]).includes(shell)) {
        console.error(`  Unknown shell "${shell}". Known shells: ${COMPLETION_SHELLS.join(', ')}.`);
        process.exitCode = 1;
        return;
      }
      const script = generateCompletionScript(shell as (typeof COMPLETION_SHELLS)[number], collectCompletionTree(program));
      process.stdout.write(`${script}\n`);
      console.error(`  ${INSTALL_HINTS[shell as (typeof COMPLETION_SHELLS)[number]]}.`);
    });
}
