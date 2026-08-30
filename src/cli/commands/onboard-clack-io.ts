/**
 * TTY-only @clack/prompts adapter for the onboarding stage machine.
 *
 * Split out of `onboard.ts` (2026-08-30 testability refactor) following the
 * same layering as the agent REPL (`runRepl` seam vs `startRepl` terminal
 * wiring): the command logic is fully in-process testable via an injected
 * {@link OnboardingIO}; this module is the thin, real-terminal glue and is
 * deliberately exercised only on an interactive TTY.
 */

import {
  confirm as clackConfirm,
  isCancel,
  multiselect,
  note as clackNote,
  password,
  select as clackSelect,
  spinner as clackSpinner,
  text,
} from '@clack/prompts';
import path from 'node:path';
import type { OnboardingIO, ProviderPreset } from '../../agent/onboarding/stages.js';
import { appendEnvVar } from './onboard-helpers.js';

export class OnboardCancel extends Error {}

function assert<T>(value: T | symbol, message = 'Cancelled'): T {
  if (isCancel(value)) throw new OnboardCancel(message);
  return value as T;
}

export function buildClackIO(env: NodeJS.ProcessEnv): OnboardingIO {
  return {
    async selectProvider() {
      const choice = assert(
        await clackSelect({
          message: 'Choose an inference provider (the CLI uses it to guide you agentically)',
          options: [
            { value: 'opencode', label: 'OpenCode Zen', hint: 'free models, e.g. x-preview-f-free' },
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
      appendEnvVar(path.resolve(process.cwd(), '.env'), env, key, value);
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
