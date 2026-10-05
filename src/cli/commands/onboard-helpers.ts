/**
 * Pure helpers for the `onboard` command (extracted 2026-08-30 for
 * testability). All decision logic — stage validation, stage sequencing,
 * the non-interactive JSON plan, readiness rendering rows, and .env
 * writing — lives here; the command body only wires IO adapters.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { evaluateReadinessDetailed } from '../../agent/readiness.js';
import { REMEDIES } from '../../agent/onboarding/remedies.js';
import type { RemedyId } from '../../agent/onboarding/remedies.js';
import type { ScanSnapshot } from '../../agent/onboarding/scan.js';
import { pendingStages, type StageName } from '../../agent/onboarding/stages.js';
import type { AgentCommandResultV1, ProviderPreset as Preset } from '../../agent/contracts.js';

export const ALL_STAGES: StageName[] = ['provider', 'profile', 'callback', 'privacy', 'verify'];

export interface ReadyConfig {
  version: 'agent-config/v1';
  provider: Preset;
  model: string;
  capabilityMode: 'strict-json-plan';
}

export function defaultConfig(): ReadyConfig {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: '',
    capabilityMode: 'strict-json-plan',
  };
}

/** `null` when the `--stage` value is acceptable, else the error message. */
export function validateStageArg(stageArg?: string): string | null {
  if (!stageArg) return null;
  if (ALL_STAGES.includes(stageArg as StageName)) return null;
  return `Unknown stage "${stageArg}". Use one of: ${ALL_STAGES.join(', ')}`;
}

/** Stages to execute for this invocation: explicit stage (+verify) or all pending. */
export function stageListFor(stageArg: string | undefined, snapshot: ScanSnapshot): StageName[] {
  const stage = stageArg && (ALL_STAGES.includes(stageArg as StageName) ? (stageArg as StageName) : undefined);
  // Original semantics (pinned by onboard-helpers tests): an explicit
  // non-verify stage appends a verify pass; 'verify' or no stage falls back
  // to the stage machine's own pending computation.
  return stage && stage !== 'verify' ? ([stage, 'verify'] as StageName[]) : pendingStages(snapshot);
}

/** Shared readiness computation for scan/final/non-interactive rendering. */
export function readinessRows(snapshot: ScanSnapshot): ReturnType<typeof evaluateReadinessDetailed> {
  return evaluateReadinessDetailed(snapshot.context, snapshot.agentConfig ?? defaultConfig(), {
    privacyAcknowledged: snapshot.privacyAcknowledged,
  });
}

/** Missing-remedy ids derived from a snapshot (used by final + non-interactive). */
export function missingRemedies(snapshot: ScanSnapshot): RemedyId[] {
  return readinessRows(snapshot)
    .filter((r) => r.state !== 'ready' && r.remedyId)
    .map((r) => r.remedyId as RemedyId);
}

/** The structured JSON result emitted by `onboard` in non-TTY mode. */
export function nonInteractiveResult(snapshot: ScanSnapshot): AgentCommandResultV1 {
  const missing = missingRemedies(snapshot);
  return {
    version: 'agent-command/v1',
    status: 'blocked',
    request: 'onboard',
    message: 'Onboarding requires an interactive terminal.',
    error: {
      code: 'AGENT_NOT_CONFIGURED',
      message: missing.length ? `Missing: ${missing.join(', ')}` : 'No missing items.',
    },
  };
}

export interface AppendEnvVarResult {
  action: 'created' | 'kept' | 'replaced' | 'refused';
}

/**
 * Writes `KEY=value` into the given .env file, refusing to clobber a
 * different existing value (the historical appendEnvVar behavior), making
 * the value visible in the passed env object too.
 */
export function appendEnvVar(envFile: string, env: NodeJS.ProcessEnv, key: string, value: string): AppendEnvVarResult {
  const content = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) {
    const current = lines[idx].slice(key.length + 1);
    if (current && current !== value) {
      throw new Error(`Refusing to overwrite existing ${key} in .env. Edit it manually to change the value.`);
    }
    return { action: 'kept' };
  }
  lines.push(`${key}=${value}`);
  writeFileSync(envFile, `${lines.filter((l) => l.length > 0 || content.endsWith('\n')).join('\n')}\n`, {
    encoding: 'utf8',
  });
  env[key] = value;
  return { action: 'created' };
}

/** Plain-text hint for non-wizard contexts (ask/repl unconfigured, TTY). */
export function onboardingHintText(snapshot: ScanSnapshot): string {
  const missing = missingRemedies(snapshot);
  if (missing.length === 0) return '';
  const bullets = missing.map((id) => `  • ${REMEDIES[id].fix}`).join('\n');
  return `Run ${'payway-sdk onboard'} to configure. Missing:\n${bullets}`;
}
