/**
 * Prompt-mode resolution — the single gate for every interactive surface.
 *
 * Three modes:
 * - 'clack'    real interactive terminal (stdin AND stdout are TTYs): full
 *              @clack/prompts wizards, probing, pickers, spinners.
 * - 'readline' piped stdin (scripts, tests): legacy readline prompts with the
 *              exact historical strings; no probing, no wizard.
 * - 'none'     machine/CI contexts: `--json`, `-y`/`--force`/`--non-interactive`,
 *              CI env, or the `PAYWAY_UI=classic` kill-switch.
 *
 * The contract: switching mode must never change exit codes, NDJSON shapes,
 * or the piped-mode output byte-for-byte.
 */

export type PromptMode = 'clack' | 'readline' | 'none';

export interface PromptGateOptions {
  json?: boolean;
  nonInteractive?: boolean;
  force?: boolean;
}

interface TtyStreams {
  stdin: { isTTY?: boolean; readable?: boolean };
  stdout: { isTTY?: boolean };
}

function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Resolve how the current command may interact with the user.
 * `none` wins over everything; `clack` requires both directions to be TTYs.
 */
export function resolvePromptMode(
  opts: PromptGateOptions = {},
  env: NodeJS.ProcessEnv = process.env,
  streams: TtyStreams = { stdin: process.stdin, stdout: process.stdout },
): PromptMode {
  const uiEnv = (env.PAYWAY_UI ?? '').toLowerCase();
  if (uiEnv === 'classic' || uiEnv === 'none') return 'none';
  if (opts.json || opts.nonInteractive || opts.force) return 'none';
  if (isTruthyEnv(env.CI)) return 'none';
  if (streams.stdin.isTTY === true && streams.stdout.isTTY === true) return 'clack';
  return 'readline';
}
