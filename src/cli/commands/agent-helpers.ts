/**
 * Pure helpers behind the `ask` / `agent` command tree (see `agent.ts`).
 *
 * Everything here is side-effect free — validation, patch building, and output
 * rendering return plain values so the agent CLI surface can be unit-tested
 * without a terminal, a live provider, or the Commander action glue. The
 * action handlers stay thin: parse → helper → print.
 */
import readline from 'node:readline';
import type {
  AgentCommandResultV1,
  AgentSessionV1,
  CapabilityMode,
  ProviderConfigV1,
  ProviderPreset,
} from '../../agent/contracts.js';
import { renderCreatePlanConfirmation, type CreatePlanConfirmation } from '../../agent/orchestrator.js';
import { REMEDIES } from '../../agent/onboarding/remedies.js';
import type { RemedyId } from '../../agent/onboarding/remedies.js';
import type { ProviderConnectivity } from '../../agent/provider.js';
import { ansi as c } from '../../agent/ansi.js';
import type { CapabilityRow, CapabilityState } from '../../agent/readiness.js';
import { PRODUCTION_CONFIRMATION_PHRASE } from '../../agent/terminal.js';

const PROVIDER_PRESETS: readonly ProviderPreset[] = ['openai', 'openrouter', 'nvidia', 'opencode', 'custom'];
const CAPABILITY_MODES: readonly CapabilityMode[] = ['native-tools', 'strict-json-plan'];

export function defaultConfig(): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: '',
    capabilityMode: 'strict-json-plan',
  };
}

export function marker(state: CapabilityState): string {
  switch (state) {
    case 'ready':
      return `${c.green('✓ ok')}`;
    case 'missing':
      return `${c.yellow('• missing')}`;
    case 'invalid':
    case 'blocked':
      return `${c.red('✗ invalid')}`;
    case 'unverified':
      return `${c.cyan('· unverified')}`;
    default:
      return String(state);
  }
}

/** The structured `blocked` result printed by `ask` when no agent config exists. */
export function blockedAgentResult(request: string): AgentCommandResultV1 {
  return {
    version: 'agent-command/v1',
    status: 'blocked',
    request,
    message:
      'Agent is not configured. Run `payway-sdk onboard` (guided wizard), or `payway-sdk agent setup --provider <p> --model <m> --acknowledge-privacy`, then verify with `payway-sdk agent doctor`.',
    error: { code: 'AGENT_NOT_CONFIGURED', message: 'No agent provider configuration found.' },
  };
}

/** Apply `--provider-timeout <ms>` when it parses as a number; otherwise ignore it. */
export function withProviderTimeout<T extends ProviderConfigV1>(config: T, raw: string | undefined): T {
  return raw && !Number.isNaN(Number(raw)) ? { ...config, timeoutMs: Number(raw) } : config;
}

// ─── agent setup ─────────────────────────────────────────────────────────────

export interface SetupPatchOptions {
  provider?: string;
  model?: string;
  baseUrl?: string;
  capabilityMode?: string;
  timeout?: string;
  maxTokens?: string;
  temperature?: string;
  topP?: string;
  extraBody?: string;
  acknowledgePrivacy?: boolean;
}

export type SetupPatchResult =
  | { patch: Partial<ProviderConfigV1>; error?: undefined }
  | { patch: Partial<ProviderConfigV1>; error: string };

/**
 * Validate `agent setup` options and build the config patch. Mirrors the
 * original action logic exactly (same checks, same order, same messages) so
 * invalid flags fail before anything is written.
 */
export function buildSetupPatch(opts: SetupPatchOptions): SetupPatchResult {
  const patch: Partial<ProviderConfigV1> = {};
  if (opts.provider) {
    const preset = opts.provider as ProviderPreset;
    if (!PROVIDER_PRESETS.includes(preset)) {
      return { patch, error: `Invalid --provider '${opts.provider}'.` };
    }
    patch.provider = preset;
  }
  if (opts.model !== undefined) patch.model = opts.model;
  if (opts.baseUrl !== undefined) patch.baseUrl = opts.baseUrl;
  if (opts.capabilityMode) {
    const mode = opts.capabilityMode as CapabilityMode;
    if (!CAPABILITY_MODES.includes(mode)) {
      return { patch, error: `Invalid --capability-mode '${opts.capabilityMode}'.` };
    }
    patch.capabilityMode = mode;
  }
  if (opts.timeout !== undefined) {
    const ms = Number(opts.timeout);
    if (!Number.isFinite(ms) || ms <= 0) {
      return { patch, error: '--timeout must be a positive number of milliseconds.' };
    }
    patch.timeoutMs = Math.floor(ms);
  }
  if (opts.maxTokens !== undefined) {
    const n = Number(opts.maxTokens);
    if (!Number.isInteger(n) || n <= 0) {
      return { patch, error: '--max-tokens must be a positive integer.' };
    }
    patch.maxTokens = n;
  }
  if (opts.temperature !== undefined) {
    const t = Number(opts.temperature);
    if (!Number.isFinite(t) || t < 0 || t > 2) {
      return { patch, error: '--temperature must be a number between 0 and 2.' };
    }
    patch.temperature = t;
  }
  if (opts.topP !== undefined) {
    const p = Number(opts.topP);
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      return { patch, error: '--top-p must be a number between 0 and 1.' };
    }
    patch.topP = p;
  }
  if (opts.extraBody !== undefined) {
    try {
      const parsed: unknown = JSON.parse(opts.extraBody);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('must be a JSON object');
      }
      patch.extraBody = parsed as Record<string, unknown>;
    } catch (error) {
      return { patch, error: `--extra-body must be a valid JSON object (${(error as Error).message}).` };
    }
  }
  if (opts.acknowledgePrivacy) {
    if (opts.provider === 'custom' && (!opts.baseUrl || opts.baseUrl.trim() === '')) {
      return { patch, error: 'Custom provider requires --base-url.' };
    }
    patch.privacyAcknowledgedAt = new Date().toISOString();
  }
  return { patch };
}

/** Render the full `agent setup` success output (header, config, sampling, key note). */
export function renderSetupSummary(config: ProviderConfigV1): string[] {
  const lines: string[] = [
    `\n  ${c.green('✓')} ${c.bold('Agent provider configured')}\n`,
    `    Provider:        ${c.cyan(config.provider)}`,
    `    Model:           ${c.cyan(config.model || '(empty)')}`,
    `    Capability mode: ${c.cyan(config.capabilityMode)}`,
  ];
  if (config.baseUrl) lines.push(`    Base URL:        ${c.cyan(config.baseUrl)}`);
  lines.push(`    Timeout:         ${c.cyan(`${config.timeoutMs ?? 30000}ms`)}`);
  if (config.maxTokens !== undefined || config.temperature !== undefined || config.topP !== undefined || config.extraBody) {
    const parts: string[] = [];
    if (config.temperature !== undefined) parts.push(`temperature=${config.temperature}`);
    if (config.topP !== undefined) parts.push(`top_p=${config.topP}`);
    if (config.maxTokens !== undefined) parts.push(`max_tokens=${config.maxTokens}`);
    if (config.extraBody) parts.push(`extra_body=${JSON.stringify(config.extraBody)}`);
    lines.push(`    Sampling:        ${c.cyan(parts.join(', '))}`);
  }
  lines.push('');
  lines.push(
    `  ${c.dim('API key is read from the PAYWAY_AGENT_API_KEY environment variable; it is never stored.')}\n`,
  );
  return lines;
}

// ─── agent doctor ────────────────────────────────────────────────────────────

/**
 * Merge the live provider connectivity probe into the readiness matrix's
 * `provider` row (mutating the row in place, as `agent doctor` always did).
 */
export function applyProviderConnectivity(matrix: CapabilityRow[], connectivity: ProviderConnectivity): void {
  const providerRow = matrix.find((r) => r.id === 'provider') as CapabilityRow;
  providerRow.state =
    connectivity.status === 'ready' ? 'ready' : connectivity.status === 'blocked' ? 'blocked' : 'unverified';
  providerRow.detail = connectivity.detail;
  providerRow.remedyId = providerRow.state === 'ready' ? undefined : providerRow.remedyId;
}

/**
 * Render the complete `agent doctor` output: capability rows with markers,
 * per-row remedy hints, the connectivity detail, and the onboarding hint
 * (only when a config exists and connectivity produced no detail).
 */
export function renderDoctorOutput(
  matrix: CapabilityRow[],
  options: { privacyAcknowledgedAt?: string; hasConfig: boolean; connectivityDetail?: string },
): string[] {
  const lines: string[] = [];
  lines.push(`\n${c.bold('Agent Capability Matrix')}\n`);
  for (const row of matrix) {
    const stateLabel =
      row.id === 'privacy' && options.privacyAcknowledgedAt
        ? ` ${c.dim(`(${options.privacyAcknowledgedAt})`)}`
        : row.detail
          ? ` ${c.dim(`(${row.detail})`)}`
          : '';
    lines.push(`  ${marker(row.state)}  ${row.label}${stateLabel}`);
    if (row.remedyId) {
      lines.push(`    ${c.dim(`→ ${REMEDIES[row.remedyId].fix}`)}`);
    }
  }
  lines.push('');
  if (options.connectivityDetail) {
    lines.push(`  ${c.dim(`Provider: ${options.connectivityDetail}`)}`);
    lines.push('');
  }
  const missing = matrix.filter((r) => r.state !== 'ready' && r.remedyId).map((r) => r.remedyId as RemedyId);
  if (missing.length > 0 && options.hasConfig && !options.connectivityDetail) {
    lines.push(`  ${c.dim('Run "payway-sdk onboard" to configure missing items interactively.')}\n`);
  }
  return lines;
}

// ─── agent ack ───────────────────────────────────────────────────────────────

/** Prerequisite checks for `agent ack`; returns the error message or null. */
export function validateAckPrerequisites(existing: ProviderConfigV1 | null): string | null {
  if (!existing?.model) {
    return 'Privacy acknowledgment requires a configured provider.';
  }
  if (existing.provider === 'custom' && (!existing.baseUrl || existing.baseUrl.trim() === '')) {
    return 'Custom provider requires a baseUrl in the config.';
  }
  return null;
}

/** Render the `agent ack` outcome: first acknowledgment vs. update. */
export function renderAckOutput(existing: ProviderConfigV1, config: ProviderConfigV1): string[] {
  if (existing.privacyAcknowledgedAt) {
    return [
      `\n  ${c.cyan('·')} Privacy acknowledgment updated.`,
      `  ${c.dim(`Previous: ${existing.privacyAcknowledgedAt}`)}`,
      `  ${c.dim(`Now:      ${config.privacyAcknowledgedAt ?? ''}`)}\n`,
    ];
  }
  return [
    `\n  ${c.green('✓')} ${c.bold('Privacy acknowledged')}\n`,
    `    Recorded at: ${c.cyan(config.privacyAcknowledgedAt ?? '')}`,
    `    Provider:    ${c.cyan(config.provider)}`,
    `    Model:       ${c.cyan(config.model)}`,
    '',
  ];
}

// ─── agent sessions ──────────────────────────────────────────────────────────

/** Render `agent sessions list` output, including the empty-state line. */
export function renderSessionList(sessions: AgentSessionV1[]): string[] {
  if (sessions.length === 0) {
    return ['No agent sessions found.'];
  }
  return sessions.map(
    (s) =>
      `${c.cyan(s.sessionId)}  ${c.dim(s.contextLabel)}  events:${s.events.length}  updated:${c.dim(s.updatedAt)}`,
  );
}

// ─── interactive prompting ───────────────────────────────────────────────────

type ConfirmationReadline = Pick<readline.Interface, 'question' | 'close'>;
type CreateConfirmationReadline = () => ConfirmationReadline;

export function promptInput(
  message: string,
  createReadline: CreateConfirmationReadline = () =>
    readline.createInterface({
      input: process.stdin as unknown as NodeJS.ReadableStream,
      output: process.stdout as unknown as NodeJS.WritableStream,
      terminal: false,
    }),
): Promise<string | undefined> {
  const rl = createReadline();
  return new Promise<string | undefined>((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(typeof answer === 'string' ? answer : undefined);
    });
  });
}

export function promptConfirm(
  message: string,
  createReadline: CreateConfirmationReadline = () =>
    readline.createInterface({
      input: process.stdin as unknown as NodeJS.ReadableStream,
      output: process.stdout as unknown as NodeJS.WritableStream,
      terminal: false,
    }),
): Promise<boolean> {
  return promptInput(message, createReadline).then((answer) => answer?.trim().toLowerCase() === 'y');
}

export function createInteractivePlanConfirmation(
  prompt: (message: string) => Promise<string | boolean | undefined> = promptInput,
): (proposal: CreatePlanConfirmation) => Promise<boolean> {
  return async (proposal) => {
    if (proposal.environment === 'production') {
      const answer = await prompt(
        `${renderCreatePlanConfirmation(proposal)}\n\nType ${PRODUCTION_CONFIRMATION_PHRASE} to execute this production create plan: `,
      );
      return typeof answer === 'string' && answer.trim() === PRODUCTION_CONFIRMATION_PHRASE;
    }
    const answer = await prompt(`${renderCreatePlanConfirmation(proposal)}\n\nExecute this create plan? (y/N): `);
    return answer === true || (typeof answer === 'string' && answer.trim().toLowerCase() === 'y');
  };
}
