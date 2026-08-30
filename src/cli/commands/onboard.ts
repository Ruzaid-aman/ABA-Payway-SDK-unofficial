/**
 * Onboarding command.
 *
 * `payway-sdk onboard` runs the guided stage machine implemented in
 * `src/agent/onboarding/stages.ts`. In a TTY it uses @clack/prompts (adapter
 * in `onboard-clack-io.ts`); in a non-TTY it emits a structured JSON plan
 * (consistent with `ask`'s blocked result) so scripts can detect what to
 * configure.
 *
 * `runOnboardCommand(opts, deps)` is the injectable entry (2026-08-30
 * testability refactor): tests drive the full flow — interactive included —
 * with a scripted {@link OnboardingIO} instead of @clack. The command
 * registration delegates to it with the real terminal adapters.
 */

import type { Command } from 'commander';
import { cancel, intro, note as clackNote, outro } from '@clack/prompts';
import path from 'node:path';
import { REMEDIES } from '../../agent/onboarding/remedies.js';
import { isInteractiveTerminal } from '../../agent/terminal.js';
import { scanOnboardingState } from '../../agent/onboarding/scan.js';
import {
  runStage,
  type OnboardingIO,
  type StageContext,
} from '../../agent/onboarding/stages.js';
import { serializeCommandResult } from '../../agent/output.js';
import { OnboardCancel, buildClackIO } from './onboard-clack-io.js';
import {
  ALL_STAGES,
  missingRemedies,
  nonInteractiveResult,
  readinessRows,
  stageListFor,
  validateStageArg,
} from './onboard-helpers.js';

export { onboardingHintText } from './onboard-helpers.js';

export interface OnboardCommandDeps {
  /** Force the interactive/non-interactive branch (default: TTY detection). */
  interactive?: boolean;
  /** Injected stage IO — skips @clack entirely when provided. */
  io?: OnboardingIO;
  /** Environment snapshot (default process.env). */
  env?: NodeJS.ProcessEnv;
  /** Output for the non-interactive JSON plan (default console.log). */
  log?: (line: string) => void;
  /** Panel renderer (default clackNote). */
  note?: (message: string, title?: string) => void;
  /** Banner renderers (default @clack intro/outro/cancel). */
  banners?: {
    intro?: (title: string) => void;
    outro?: (message: string) => void;
    cancel?: (message: string) => void;
  };
  /** Exit-code hook (default process.exitCode assignment). */
  setExitCode?: (code: number) => void;
}

export async function runOnboardCommand(opts: { stage?: string }, deps: OnboardCommandDeps = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.log(line));
  const note = deps.note ?? ((message: string, title?: string) => clackNote(message, title));
  const banners = {
    intro: deps.banners?.intro ?? ((title: string) => intro(title)),
    outro: deps.banners?.outro ?? ((message: string) => outro(message)),
    cancel: deps.banners?.cancel ?? ((message: string) => cancel(message)),
  };
  const setExitCode = deps.setExitCode ?? ((code: number) => (process.exitCode = code));

  const interactive = deps.interactive ?? isInteractiveTerminal();

  // Non-interactive with an explicit --stage: print the stage plan only
  // (historical behavior — no blocked result, no exit-code change).
  if (!interactive && opts.stage) {
    log(JSON.stringify({ command: 'onboard', stage: opts.stage, allowed: ALL_STAGES }, null, 2));
    return;
  }

  if (!interactive) {
    log(serializeCommandResult(nonInteractiveResult(scanOnboardingState(env))));
    setExitCode(1);
    return;
  }

  // Interactive: structured scan → stage machine → final readiness.
  banners.intro('PayWay Agent Onboarding');
  try {
    const stageError = validateStageArg(opts.stage);
    if (stageError) throw new Error(stageError);

    const snapshot = scanOnboardingState(env);
    const rows = readinessRows(snapshot);
    const lines = rows
      .map((r) => `  ${r.state === 'ready' ? '✓' : '•'} ${r.label}`)
      .concat(snapshot.hasAgentApiKey ? [] : ['  • Provider API key (PAYWAY_AGENT_API_KEY) missing']);
    note(lines.join('\n'), 'Current configuration');

    const io = deps.io ?? buildClackIO(env);
    const stagesToRun = stageListFor(opts.stage, snapshot);
    const ctx: StageContext = { env, io };
    for (const name of stagesToRun) {
      const result = await runStage(name, ctx);
      if (result.notes?.length) note(result.notes.join('\n'), `stage: ${name}`);
    }

    const finalSnapshot = scanOnboardingState(env);
    const remaining = missingRemedies(finalSnapshot);
    if (remaining.length === 0) {
      note('All capability rows ready.', 'Readiness');
    } else {
      note(
        remaining.map((id) => `  → ${REMEDIES[id].fix}`).join('\n'),
        'Still missing (run manually or re-run onboard)',
      );
    }
    banners.outro('Onboarding complete. Try: payway-sdk ask "Generate an online QR for 3 USD" --yolo');
  } catch (error) {
    if (error instanceof OnboardCancel) {
      banners.cancel('Onboarding cancelled.');
      setExitCode(130);
      return;
    }
    banners.cancel((error as Error).message);
    setExitCode(1);
  }
}

export async function runOnboardInteractive(stageArg?: string): Promise<void> {
  await runOnboardCommand({ stage: stageArg }, { interactive: true });
}

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Guided setup: scan config, configure an inference provider + PayWay profile, verify readiness')
    .option('--stage <name>', `Run a single stage only: ${ALL_STAGES.join(' | ')}`)
    .action(async (opts: { stage?: string }) => {
      await runOnboardCommand(opts);
    });
}

/**
 * If the opt-in env var is set and we are interactive, launch the wizard inline.
 * Returns true when the wizard ran (caller should proceed after). Throws are
 * swallowed to a non-zero exit; the caller's normal unconfigured message only
 * prints when the wizard did NOT run.
 */
export async function maybeAutoOnboard(): Promise<boolean> {
  if (!isInteractiveTerminal()) return false;
  if (process.env.PAYWAY_ONBOARD_AUTO !== '1') return false;
  await runOnboardInteractive();
  return true;
}
