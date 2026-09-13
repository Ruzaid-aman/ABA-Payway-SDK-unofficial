/**
 * Commander-introspection for shell completion generators.
 *
 * Walks a live `Command` tree into plain data so generators never depend on
 * commander types and never duplicate a hand-maintained command list — new
 * commands and flags appear in completions automatically (spec §4.1).
 *
 * Commander facts this module relies on: a hidden command is stored as the
 * internal `_hidden` property (set via `.command(name, { hidden: true })`),
 * `command.options` excludes the auto `--help` option, and
 * `summary() || description()` matches how bare-invocation help labels
 * commands (src/cli.ts:923).
 */

import type { Command } from 'commander';

export interface CompletionOption {
  long?: string;
  short?: string;
  description: string;
}

export interface CompletionCommand {
  name: string;
  description: string;
  options: CompletionOption[];
  subcommands: CompletionCommand[];
}

/** Walks the program (root) and all nested commands into a completion tree. */
export function collectCompletionTree(root: Command): CompletionCommand {
  return collect(root);
}

function collect(command: Command): CompletionCommand {
  return {
    name: command.name(),
    description: (command.summary() || command.description()).trim(),
    options: command.options
      .filter((option) => !option.hidden)
      .map((option) => ({
        long: option.long,
        short: option.short,
        description: option.description,
      })),
    subcommands: command.commands.filter((sub) => !(sub as unknown as { _hidden?: boolean })._hidden).map(collect),
  };
}
