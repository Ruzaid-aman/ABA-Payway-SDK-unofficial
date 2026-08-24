/**
 * Onboarding command.
 *
 * `payway-sdk onboard` runs the guided stage machine implemented in
 * `src/agent/onboarding/stages.ts`. In a TTY it uses @clack/prompts; in a
 * non-TTY it emits a structured JSON plan (consistent with `ask`'s blocked
 * result) so scripts can detect what to configure.
 */

import type { Command } from 'commander';
import {
  cancel,
  confirm as clackConfirm,
  intro,
  isCancel,
  multiselect,
  note as clackNote,
  outro,
  password,
  select as clackSelect,
  spinner as clackSpinner,
  text,
} from '@clack/prompts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateReadinessDetailed } from '../../agent/readiness.js';
import { REMEDIES } from '../../agent/onboarding/remedies.js';
import type { RemedyId } from '../../agent/onboarding/remedies.js';
import { isInteractiveTerminal } from '../../agent/terminal.js';
import { scanOnboardingState, type ScanSnapshot } from '../../agent/onboarding/scan.js';
import {
  pendingStages,
  runStage,
  type OnboardingIO,
  type ProviderPreset,
  type StageContext,
  type StageName,
} from '../../agent/onboarding/stages.js';
import { serializeCommandResult } from '../../agent/output.js';
import type { AgentCommandResultV1, ProviderPreset as Preset } from '../../agent/contracts.js';

const ALL_STAGES: StageName[] = ['provider', 'profile', 'callback', 'privacy', 'verify'];

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description('Guided setup: scan config, configure an inference provider + PayWay profile, verify readiness')
    .option('--stage <name>', `Run a single stage only: ${ALL_STAGES.join(' | ')}`)
    .action(async (opts: { stage?: string }) => {
      if (!isInteractiveTerminal()) return runNonInteractive(opts.stage);
      await runOnboardInteractive(opts.stage);
    });
}

// ---------------------------------------------------------------------------
// Interactive (TTY)
// ---------------------------------------------------------------------------

class OnboardCancel extends Error {}

function assert<T>(value: T | symbol, message = 'Cancelled'): T {
  if (isCancel(value)) throw new OnboardCancel(message);
  return value as T;
}

function buildClackIO(env: NodeJS.ProcessEnv): OnboardingIO {
  return {
    async selectProvider() {
      const choice = assert(
        await clackSelect({
          message: 'Choose an inference provider (the CLI uses it to guide you agentically)',
          options: [
            { value: 'openrouter', label: 'OpenRouter', hint: 'one key, 400+ models' },
            { value: 'nvidia', label: 'NVIDIA NIM', hint: 'self-hosted / NIM catalog' },
            { value: 'openai', label: 'OpenAI', hint: 'gpt-4o etc.' },
            { value: 'custom', label: 'Custom', hint: 'OpenAI-compatible base URL' },
          ],
        }),
      );
      return choice as ProviderPreset;
    },
    async inputModel(provider) {
      const def = provider === 'openai' ? 'gpt-4o' : provider === 'nvidia' ? 'meta/llama-3.3-70b-instruct' : '';
      return assert(await text({ message: 'Model name', placeholder: def, initialValue: def }));
    },
    async chooseKeyPlacement() {
      const choice = assert(
        await clackSelect({
          message: 'Where should PAYWAY_AGENT_API_KEY live?',
          options: [
            { value: 'dotenv', label: '.env (this project)', hint: 'persisted, never committed' },
            { value: 'session', label: 'Current shell session only' },
            { value: 'user', label: 'User environment (persistent)' },
          ],
        }),
      );
      return choice as 'session' | 'dotenv' | 'user';
    },
    async secret(prompt) {
      return assert(await password({ message: prompt }));
    },
    async input(prompt, fallback = '') {
      const val = assert(await text({ message: prompt, initialValue: fallback }));
      return val.trim();
    },
    async confirm(prompt, def = true) {
      return assert(await clackConfirm({ message: prompt, initialValue: def }));
    },
    async multiselectKhqr() {
      const choice = assert(
        await multiselect({
          message: 'Configure offline KHQR? (optional)',
          options: [{ value: 'yes', label: 'Yes, configure ABA KHQR' }],
        }),
      );
      return Array.isArray(choice) && choice.includes('yes');
    },
    async writeEnvVar(key, value) {
      appendEnvVar(env, key, value);
    },
    async spinner(label, fn) {
      const s = clackSpinner();
      s.start(label);
      try {
        const result = await fn();
        s.stop(label);
        return result;
      } catch (error) {
        s.stop(`Failed: ${(error as Error).message}`);
        throw error;
      }
    },
    note(message) {
      clackNote(message);
    },
  };
}

export async function runOnboardInteractive(stageArg?: string): Promise<void> {
  try {
    const stage = stageArg && (ALL_STAGES.includes(stageArg as StageName) ? (stageArg as StageName) : undefined);
    if (stageArg && !stage) {
      throw new Error(`Unknown stage "${stageArg}". Use one of: ${ALL_STAGES.join(', ')}`);
    }

    intro('PayWay Agent Onboarding');

    const snapshot = scanOnboardingState(process.env);
    renderScan(snapshot);

    const stagesToRun = stage && stage !== 'verify' ? ([stage, 'verify'] as StageName[]) : pendingStages(snapshot);

    const ctx: StageContext = { env: process.env, io: buildClackIO(process.env) };
    for (const name of stagesToRun) {
      const result = await runStage(name, ctx);
      if (result.notes?.length) clackNote(result.notes.join('\n'), `stage: ${name}`);
    }

    renderFinal();
    outro('Onboarding complete. Try: payway-sdk ask "Generate an online QR for 3 USD" --yolo');
  } catch (error) {
    if (error instanceof OnboardCancel) {
      cancel('Onboarding cancelled.');
      process.exitCode = 130;
      return;
    }
    cancel((error as Error).message);
    process.exitCode = 1;
  }
}

function renderScan(snapshot: ScanSnapshot): void {
  const rows = evaluateReadinessDetailed(snapshot.context, snapshot.agentConfig ?? defaultConfig(), {
    privacyAcknowledged: snapshot.privacyAcknowledged,
  });
  const lines = rows
    .map((r) => `  ${r.state === 'ready' ? '✓' : '•'} ${r.label}`)
    .concat(snapshot.hasAgentApiKey ? [] : ['  • Provider API key (PAYWAY_AGENT_API_KEY) missing']);
  clackNote(lines.join('\n'), 'Current configuration');
}

function renderFinal(): void {
  const snapshot = scanOnboardingState(process.env);
  const rows = evaluateReadinessDetailed(snapshot.context, snapshot.agentConfig ?? defaultConfig(), {
    privacyAcknowledged: snapshot.privacyAcknowledged,
  });
  const remaining = rows.filter((r) => r.state !== 'ready' && r.remedyId).map((r) => r.remedyId as RemedyId);
  if (remaining.length === 0) {
    clackNote('All capability rows ready.', 'Readiness');
  } else {
    clackNote(
      remaining.map((id) => `  → ${REMEDIES[id].fix}`).join('\n'),
      'Still missing (run manually or re-run onboard)',
    );
  }
}

// ---------------------------------------------------------------------------
// Non-interactive (structured JSON)
// ---------------------------------------------------------------------------

function runNonInteractive(stageArg?: string): void {
  const snapshot = scanOnboardingState(process.env);
  const rows = evaluateReadinessDetailed(snapshot.context, snapshot.agentConfig ?? defaultConfig(), {
    privacyAcknowledged: snapshot.privacyAcknowledged,
  });
  const missing = rows.filter((r) => r.state !== 'ready' && r.remedyId).map((r) => r.remedyId as RemedyId);
  if (stageArg) {
    console.log(JSON.stringify({ command: 'onboard', stage: stageArg, allowed: ALL_STAGES }, null, 2));
    return;
  }
  const result: AgentCommandResultV1 = {
    version: 'agent-command/v1',
    status: 'blocked',
    request: 'onboard',
    message: 'Onboarding requires an interactive terminal.',
    error: {
      code: 'AGENT_NOT_CONFIGURED',
      message: missing.length ? `Missing: ${missing.join(', ')}` : 'No missing items.',
    },
  };
  console.log(serializeCommandResult(result));
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// .env writing helper
// ---------------------------------------------------------------------------

function appendEnvVar(env: NodeJS.ProcessEnv, key: string, value: string): void {
  const envPath = path.resolve(process.cwd(), '.env');
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) {
    const current = lines[idx].slice(key.length + 1);
    if (current && current !== value) {
      throw new Error(`Refusing to overwrite existing ${key} in .env. Edit it manually to change the value.`);
    }
    return; // already set to the same value
  }
  lines.push(`${key}=${value}`);
  writeFileSync(envPath, `${lines.filter((l) => l.length > 0 || content.endsWith('\n')).join('\n')}\n`, {
    encoding: 'utf8',
  });
  // Make it visible to the running process too.
  env[key] = value;
}

/** Plain-text hint for non-wizard contexts (ask/repl unconfigured, TTY). */
export function onboardingHintText(snapshot: ScanSnapshot): string {
  const rows = evaluateReadinessDetailed(snapshot.context, snapshot.agentConfig ?? defaultConfig(), {
    privacyAcknowledged: snapshot.privacyAcknowledged,
  });
  const missing = rows.filter((r) => r.state !== 'ready' && r.remedyId).map((r) => r.remedyId as RemedyId);
  if (missing.length === 0) return '';
  const bullets = missing.map((id) => `  • ${REMEDIES[id].fix}`).join('\n');
  return `Run ${'payway-sdk onboard'} to configure. Missing:\n${bullets}`;
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

function defaultConfig() {
  return {
    version: 'agent-config/v1' as const,
    provider: 'openai' as Preset,
    model: '',
    capabilityMode: 'strict-json-plan' as const,
  };
}
