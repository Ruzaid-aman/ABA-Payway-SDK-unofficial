import type { Command } from 'commander';
import { resolvePromptMode } from '../ui/mode.js';
import { getSessionDir, runSessionLoop } from '../session.js';

/**
 * `payway-sdk session` — the command-first interactive shell (spec §6.3).
 * TTY-only: agents/CI/piped stdin keep byte-identical legacy behavior (a
 * hint on stderr and exit 2), exactly like the other interactive surfaces.
 */
export function registerSessionCommand(program: Command): void {
  program
    .command('session')
    .description(
      'Interactive command-first shell over the CLI (:use <tran-id> sticks a transaction id; :help for directives)',
    )
    .option('--profile <name>', 'Credential profile shown in the prompt and used for gateway commands')
    .option('--resume', 'Resume the most recent persisted session history', false)
    .action((opts: { profile?: string; resume?: boolean }) => {
      if (resolvePromptMode() !== 'clack') {
        console.error(
          '  payway-sdk session needs an interactive terminal (TTY). Pipe commands directly instead, e.g. `payway-sdk check-transaction -t <id>`.',
        );
        process.exitCode = 2;
        return;
      }
      void runSessionLoop({
        input: process.stdin as unknown as NodeJS.ReadableStream,
        output: process.stdout as unknown as NodeJS.WritableStream,
        interactive: true,
        resume: opts.resume,
        profile: opts.profile,
        program,
        sessionDir: getSessionDir(),
      });
    });
}
