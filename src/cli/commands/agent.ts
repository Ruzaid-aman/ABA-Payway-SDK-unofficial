/**
 * Agentic PayWay CLI — public command surface.
 *
 * Registers the `ask` top-level command and the `agent` command tree
 * (`setup`, `doctor`, `sessions list|export|clear`). The bare `agent` command
 * drops into a REPL (see `src/agent/repl.ts`).
 *
 * Safety: `ask` makes ZERO network calls before authorization is established.
 * Without a config it reports `blocked`; in a non-TTY without an approval flag
 * it reports `needs_confirmation` and never contacts the provider. API keys are
 * never accepted or persisted — they live only in `PAYWAY_AGENT_API_KEY`.
 */

import { writeFileSync } from 'node:fs';
import readline from 'node:readline';
import type { Command } from 'commander';
import { readAgentConfig, updateAgentConfig } from '../../agent/config.js';
import { resolvePayWayContext } from '../../agent/context.js';
import type { AgentCommandResultV1, CapabilityMode, ProviderConfigV1, ProviderPreset } from '../../agent/contracts.js';
import {
  AgentOrchestrator,
  renderCreatePlanConfirmation,
  renderHumanResult,
  serializeCommandResult,
  type CreatePlanConfirmation,
} from '../../agent/orchestrator.js';
import { createProviderAdapter, type ProviderConnectivity } from '../../agent/provider.js';
import { evaluateReadinessDetailed } from '../../agent/readiness.js';
import { REMEDIES } from '../../agent/onboarding/remedies.js';
import type { RemedyId } from '../../agent/onboarding/remedies.js';
import { setAgentProgram, startRepl } from '../../agent/repl.js';
import { clearSessions, exportSession, listSessions } from '../../agent/sessions.js';
import { scanOnboardingState } from '../../agent/onboarding/scan.js';
import { maybeAutoOnboard, onboardingHintText } from './onboard.js';
import { isInteractiveTerminal, PRODUCTION_CONFIRMATION_PHRASE } from '../../agent/terminal.js';

export { isInteractiveTerminal } from '../../agent/terminal.js';

// Local ANSI helpers (cli.ts keeps its own copy; no shared dependency needed).
const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function readProfile(program: Command): string | undefined {
  return program.opts<{ profile?: string }>().profile ?? process.env.PAYWAY_PROFILE ?? undefined;
}

function defaultConfig(): ProviderConfigV1 {
  return {
    version: 'agent-config/v1',
    provider: 'openai',
    model: '',
    capabilityMode: 'strict-json-plan',
  };
}

type CapabilityState = 'ready' | 'missing' | 'invalid' | 'unverified';

function marker(state: CapabilityState | 'blocked'): string {
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

/** Register the agentic command tree on the given Commander program. */
export function registerAgentCommands(program: Command): void {
  setAgentProgram(program);

  // ─── ask ───────────────────────────────────────────────────────────────────
  program
    .command('ask')
    .description('Ask the PayWay agent to perform a request (single shot)')
    .argument('<request>', 'Natural-language request, e.g. "generate a QR for $3"')
    .option('--approve', 'Authorize create actions (both sandbox and production)')
    .option('--yolo', 'Skip confirmation for sandbox create actions only')
    .option('--session <id>', 'Resume an existing agent session')
    .option('--provider-timeout <ms>', 'Override the inference provider request timeout (ms)')
    .action(
      async (
        request: string,
        opts: { approve?: boolean; yolo?: boolean; session?: string; providerTimeout?: string },
      ) => {
        const context = resolvePayWayContext({ profile: readProfile(program) });
      const config = readAgentConfig();

      if (!config) {
        if (!isInteractiveTerminal()) {
          const blocked: AgentCommandResultV1 = {
            version: 'agent-command/v1',
            status: 'blocked',
            request,
            message: 'Agent is not configured. Run `payway-sdk onboard` to configure a provider, then retry.',
            error: { code: 'AGENT_NOT_CONFIGURED', message: 'No agent provider configuration found.' },
          };
          console.log(serializeCommandResult(blocked));
          process.exitCode = 1;
        } else {
          if (await maybeAutoOnboard()) return;
          const hint = onboardingHintText(scanOnboardingState());
          console.log(`\n  ${c.yellow('!')} ${c.bold('Agent is not configured')}\n`);
          if (hint) console.log(`${hint}\n`);
          else console.log(`  Run ${c.cyan('payway-sdk onboard')} to configure before using ${c.cyan('ask')}.\n`);
        }
        return;
      }

      const tty = isInteractiveTerminal();
      const flag: 'approve' | 'yolo' | undefined = opts.approve ? 'approve' : opts.yolo ? 'yolo' : undefined;

      const runConfig =
        opts.providerTimeout && !Number.isNaN(Number(opts.providerTimeout))
          ? { ...config, timeoutMs: Number(opts.providerTimeout) }
          : config;

      if (tty) {
        console.log(
          `  ${c.dim('·')} Contacting ${c.cyan(runConfig.provider)} ${c.dim(`(${runConfig.model || 'no model'})`)} to propose a plan…`,
        );
      }

      const onProgress = (info: { phase: string; detail?: string }) => {
        if (!tty) return;
        if (info.phase === 'propose') return; // already printed as "Contacting…"
        const label =
          info.phase === 'validate'
            ? 'Validating plan…'
            : info.phase === 'authorize'
              ? 'Authorizing plan…'
              : info.phase === 'execute'
                ? `Executing ${info.detail ?? 'action'}…`
                : 'Finalizing…';
        console.log(`  ${c.dim('·')} ${label}`);
      };

      const provider = createProviderAdapter(runConfig);
      const orchestrator = new AgentOrchestrator({
        context,
        provider,
        sessionId: opts.session,
        providerConfig: config,
      });
      const result = await orchestrator.runOneShot(request, {
        tty,
        flag,
        environment: context.environment,
        onProgress,
        ...(tty && !flag
          ? {
              confirmCreatePlan: createInteractivePlanConfirmation(),
            }
          : {}),
      });

      if (!tty) {
        console.log(serializeCommandResult(result));
        if (result.status === 'failed' || result.status === 'blocked') process.exitCode = 1;
      } else {
        console.log(renderHumanResult(result));
        if (result.status === 'failed' && result.error?.code === 'PROVIDER_PROPOSAL_FAILED') {
          console.log(
            `  ${c.yellow('!')} The inference provider could not propose a plan. Verify ${c.cyan('PAYWAY_AGENT_API_KEY')} is set and valid, then re-run ${c.cyan('agent doctor')}.`,
          );
        }
      }
    });

  // ─── agent ───────────────────────────────────────────────────────────────────
  const agentCmd = program
    .command('agent')
    .description('Agentic PayWay CLI (REPL when run without a subcommand)')
    .option('--session <id>', 'Resume an existing agent session in the REPL')
    .action(async (opts: { session?: string }) => {
      await startRepl({ profile: readProfile(program), sessionId: opts.session });
    });

  // agent setup
  agentCmd
    .command('setup')
    .description('Configure the agent provider (API key stays in PAYWAY_AGENT_API_KEY env only)')
    .option('--provider <provider>', 'Provider preset: openai | openrouter | nvidia | opencode | custom')
    .option('--model <model>', 'Model name, e.g. gpt-4o')
    .option('--base-url <url>', 'Custom provider base URL (for provider=custom)')
    .option('--capability-mode <mode>', 'native-tools | strict-json-plan')
    .option('--timeout <ms>', 'Provider request timeout in milliseconds')
    .option('--max-tokens <n>', 'Sampling passthrough: max_tokens for chat completions (e.g. 8192)')
    .option('--temperature <n>', 'Sampling passthrough: temperature (0-2)')
    .option('--top-p <n>', 'Sampling passthrough: top_p (0-1)')
    .option(
      '--extra-body <json>',
      'Extra request-body fields merged verbatim, e.g. \'{"chat_template_kwargs":{"enable_thinking":true}}\'',
    )
    .option('--acknowledge-privacy', 'Acknowledge the provider privacy notice (required before plans are proposed)')
    .action(
      async (opts: {
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
      }) => {
        const patch: Partial<ProviderConfigV1> = {};
        if (opts.provider) {
          const preset = opts.provider as ProviderPreset;
          if (!['openai', 'openrouter', 'nvidia', 'opencode', 'custom'].includes(preset)) {
            console.log(`\n  ${c.red('✗')} Invalid --provider '${opts.provider}'.\n`);
            process.exitCode = 1;
            return;
          }
          patch.provider = preset;
        }
        if (opts.model !== undefined) patch.model = opts.model;
        if (opts.baseUrl !== undefined) patch.baseUrl = opts.baseUrl;
        if (opts.capabilityMode) {
          const mode = opts.capabilityMode as CapabilityMode;
          if (!['native-tools', 'strict-json-plan'].includes(mode)) {
            console.log(`\n  ${c.red('✗')} Invalid --capability-mode '${opts.capabilityMode}'.\n`);
            process.exitCode = 1;
            return;
          }
          patch.capabilityMode = mode;
        }
        if (opts.timeout !== undefined) {
          const ms = Number(opts.timeout);
          if (!Number.isFinite(ms) || ms <= 0) {
            console.log(`\n  ${c.red('✗')} --timeout must be a positive number of milliseconds.\n`);
            process.exitCode = 1;
            return;
          }
          patch.timeoutMs = Math.floor(ms);
        }
        if (opts.maxTokens !== undefined) {
          const n = Number(opts.maxTokens);
          if (!Number.isInteger(n) || n <= 0) {
            console.log(`\n  ${c.red('✗')} --max-tokens must be a positive integer.\n`);
            process.exitCode = 1;
            return;
          }
          patch.maxTokens = n;
        }
        if (opts.temperature !== undefined) {
          const t = Number(opts.temperature);
          if (!Number.isFinite(t) || t < 0 || t > 2) {
            console.log(`\n  ${c.red('✗')} --temperature must be a number between 0 and 2.\n`);
            process.exitCode = 1;
            return;
          }
          patch.temperature = t;
        }
        if (opts.topP !== undefined) {
          const p = Number(opts.topP);
          if (!Number.isFinite(p) || p < 0 || p > 1) {
            console.log(`\n  ${c.red('✗')} --top-p must be a number between 0 and 1.\n`);
            process.exitCode = 1;
            return;
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
            console.log(
              `\n  ${c.red('✗')} --extra-body must be a valid JSON object (${(error as Error).message}).\n`,
            );
            process.exitCode = 1;
            return;
          }
        }
        if (opts.acknowledgePrivacy) {
          if (opts.provider === 'custom' && (!opts.baseUrl || opts.baseUrl.trim() === '')) {
            console.log(`\n  ${c.red('✗')} Custom provider requires --base-url.\n`);
            process.exitCode = 1;
            return;
          }
          patch.privacyAcknowledgedAt = new Date().toISOString();
        }

        const config = updateAgentConfig(patch);
        console.log(`\n  ${c.green('✓')} ${c.bold('Agent provider configured')}\n`);
        console.log(`    Provider:        ${c.cyan(config.provider)}`);
        console.log(`    Model:           ${c.cyan(config.model || '(empty)')}`);
        console.log(`    Capability mode: ${c.cyan(config.capabilityMode)}`);
        if (config.baseUrl) console.log(`    Base URL:        ${c.cyan(config.baseUrl)}`);
        console.log(`    Timeout:         ${c.cyan(`${config.timeoutMs ?? 30000}ms`)}`);
        if (config.maxTokens !== undefined || config.temperature !== undefined || config.topP !== undefined || config.extraBody) {
          const parts: string[] = [];
          if (config.temperature !== undefined) parts.push(`temperature=${config.temperature}`);
          if (config.topP !== undefined) parts.push(`top_p=${config.topP}`);
          if (config.maxTokens !== undefined) parts.push(`max_tokens=${config.maxTokens}`);
          if (config.extraBody) parts.push(`extra_body=${JSON.stringify(config.extraBody)}`);
          console.log(`    Sampling:        ${c.cyan(parts.join(', '))}`);
        }
        console.log();
        console.log(
          `  ${c.dim('API key is read from the PAYWAY_AGENT_API_KEY environment variable; it is never stored.')}\n`,
        );
      },
    );

  // agent doctor
  agentCmd
    .command('doctor')
    .description('Print the agent capability matrix (provider, context, payment capabilities)')
    .action(async () => {
      const context = resolvePayWayContext({ profile: readProfile(program) });
      const config = readAgentConfig();
      const matrix = evaluateReadinessDetailed(context, config ?? defaultConfig(), {
        privacyAcknowledged: !!config?.privacyAcknowledgedAt,
      });

      let connectivity: ProviderConnectivity = { status: 'unverified', detail: 'agent not configured' };
      if (config) {
        const provider = createProviderAdapter(config);
        connectivity = await provider.checkConnectivity();
      }
      const providerRow = matrix.find((r) => r.id === 'provider') as (typeof matrix)[number];
      providerRow.state =
        connectivity.status === 'ready' ? 'ready' : connectivity.status === 'blocked' ? 'blocked' : 'unverified';
      providerRow.detail = connectivity.detail;
      providerRow.remedyId = providerRow.state === 'ready' ? undefined : providerRow.remedyId;

      console.log(`\n${c.bold('Agent Capability Matrix')}\n`);
      for (const row of matrix) {
        const stateLabel =
          row.id === 'privacy' && config?.privacyAcknowledgedAt
            ? ` ${c.dim(`(${config.privacyAcknowledgedAt})`)}`
            : row.detail
              ? ` ${c.dim(`(${row.detail})`)}`
              : '';
        console.log(`  ${marker(row.state)}  ${row.label}${stateLabel}`);
        if (row.remedyId) {
          console.log(`    ${c.dim(`→ ${REMEDIES[row.remedyId].fix}`)}`);
        }
      }
      console.log();
      if (connectivity.detail) {
        console.log(`  ${c.dim(`Provider: ${connectivity.detail}`)}`);
        console.log();
      }
      const missing = matrix.filter((r) => r.state !== 'ready' && r.remedyId).map((r) => r.remedyId as RemedyId);
      if (missing.length > 0 && config && !connectivity.detail) {
        console.log(`  ${c.dim('Run "payway-sdk onboard" to configure missing items interactively.')}\n`);
      }
    });

  // agent ack
  agentCmd
    .command('ack')
    .description('Acknowledge the provider privacy notice (required before plans are proposed)')
    .action(() => {
      const existing = readAgentConfig();
      if (!existing?.model) {
        console.log(`\n  ${c.red('✗')} Privacy acknowledgment requires a configured provider.\n`);
        console.log(
          `  Run ${c.cyan('payway-sdk agent setup --provider <p> --model <m> --acknowledge-privacy')} first,\n  or run ${c.cyan('agent ack')} after ${c.cyan('agent setup')}.\n`,
        );
        process.exitCode = 1;
        return;
      }
      if (existing.provider === 'custom' && (!existing.baseUrl || existing.baseUrl.trim() === '')) {
        console.log(`\n  ${c.red('✗')} Custom provider requires a baseUrl in the config.\n`);
        process.exitCode = 1;
        return;
      }
      const config = updateAgentConfig({ privacyAcknowledgedAt: new Date().toISOString() });
      if (existing.privacyAcknowledgedAt) {
        console.log(`\n  ${c.cyan('·')} Privacy acknowledgment updated.`);
        console.log(`  ${c.dim(`Previous: ${existing.privacyAcknowledgedAt}`)}`);
        console.log(`  ${c.dim(`Now:      ${config.privacyAcknowledgedAt ?? ''}`)}\n`);
        return;
      }
      console.log(`\n  ${c.green('✓')} ${c.bold('Privacy acknowledged')}\n`);
      console.log(`    Recorded at: ${c.cyan(config.privacyAcknowledgedAt ?? '')}`);
      console.log(`    Provider:    ${c.cyan(config.provider)}`);
      console.log(`    Model:       ${c.cyan(config.model)}`);
      console.log();
    });

  // agent sessions
  const sessionsCmd = agentCmd.command('sessions').description('Manage agent sessions');

  sessionsCmd
    .command('list')
    .description('List saved agent sessions')
    .action(() => {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log('No agent sessions found.');
        return;
      }
      for (const s of sessions) {
        console.log(
          `${c.cyan(s.sessionId)}  ${c.dim(s.contextLabel)}  events:${s.events.length}  updated:${c.dim(s.updatedAt)}`,
        );
      }
    });

  sessionsCmd
    .command('export')
    .description('Export a session to a JSON file (scrubbed of secrets)')
    .argument('<id>', 'Session id to export')
    .requiredOption('--output <path>', 'Destination file path')
    .action(async (id: string, opts: { output: string }) => {
      try {
        const json = exportSession(id);
        writeFileSync(opts.output, `${json}\n`, { encoding: 'utf8' });
        console.log(`\n  ${c.green('✓')} Session ${c.cyan(id)} exported to ${c.cyan(opts.output)}\n`);
      } catch (error) {
        console.log(`\n  ${c.red('✗')} ${(error as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  sessionsCmd
    .command('clear')
    .description('Clear a session, or all sessions (requires --approve in non-TTY)')
    .argument('<id|all>', "Session id to clear, or 'all'")
    .option('--approve', 'Confirm the destructive clear (required in non-TTY)')
    .action(async (idOrAll: string, opts: { approve?: boolean }) => {
      if (process.stdout.isTTY) {
        const confirmed = await promptConfirm(
          `  Clear session(s) '${idOrAll}'? Session files may contain sensitive data. (y/n): `,
        );
        if (!confirmed) {
          console.log(`\n  ${c.yellow('Cancelled.')}\n`);
          return;
        }
      } else if (!opts.approve) {
        console.log(`\n  ${c.red('✗')} Refusing to clear sessions without --approve in non-interactive mode.\n`);
        process.exitCode = 1;
        return;
      }
      clearSessions(idOrAll);
      console.log(`\n  ${c.green('✓')} Cleared session(s): ${c.cyan(idOrAll)}\n`);
    });
}
