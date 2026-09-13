/**
 * Shared `:run`-style command re-dispatch through a live Commander program.
 *
 * Extracted from the agent REPL (src/agent/repl.ts) so both the agent REPL
 * and `payway-sdk session` re-dispatch commands through the single source of
 * truth (the manual CLI's program). Validation lives in `repl-helpers.ts`
 * (`validateDispatch` — only registered top-level command names, never
 * shells/paths/URIs/agent-management commands).
 *
 * The process.exit trap is the load-bearing part: a dispatched subcommand
 * that calls `process.exit` (e.g. missing required option) must terminate
 * the dispatch, not the host loop; the prior exit code is restored so a
 * dispatched command cannot leak an exit code into the session.
 */

import type { Command } from 'commander';
import { ansi as c } from './ansi.js';
import { validateDispatch } from './repl-helpers.js';

export type SessionDispatcher = (rest: string) => Promise<void>;

export function createDispatcher(getProgram: () => Command | null): SessionDispatcher {
  return async function dispatch(rest: string): Promise<void> {
    const program = getProgram();
    const decision = validateDispatch(rest, program?.commands.map((cmd) => cmd.name()) ?? []);
    if (!decision.ok) {
      console.log(`  ${c.red('✗')} ${decision.message}`);
      return;
    }
    if (!program) return; // unreachable: decision.ok implies a registered command matched
    const tokens = decision.tokens;

    console.log(`  ${c.cyan('→')} Running: payway-sdk ${tokens.join(' ')}`);
    const originalExit = process.exit;
    const priorExitCode = process.exitCode;
    (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
      throw new Error(`__repl_exit__${code ?? 0}`);
    }) as (code?: number) => never;
    try {
      await program.parseAsync(tokens, { from: 'user' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith('__repl_exit__')) {
        console.log(`  ${c.dim(`dispatch error: ${message}`)}`);
      }
    } finally {
      (process as { exit: (code?: number) => never }).exit = originalExit as (code?: number) => never;
      // A dispatched subcommand may set process.exitCode; do not let it leak
      // into the REPL/session exit code.
      process.exitCode = priorExitCode;
    }
  };
}
