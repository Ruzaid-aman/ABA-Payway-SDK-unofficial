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
import { AgentOrchestrator, renderHumanResult, serializeCommandResult } from '../../agent/orchestrator.js';
import { createProviderAdapter, type ProviderConnectivity } from '../../agent/provider.js';
import { evaluateReadiness } from '../../agent/readiness.js';
import { setAgentProgram, startRepl } from '../../agent/repl.js';
import { clearSessions, exportSession, listSessions } from '../../agent/sessions.js';

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

function promptConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin as unknown as NodeJS.ReadableStream, output: process.stdout as unknown as NodeJS.WritableStream, terminal: false });
  return new Promise<boolean>((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
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
    .action(async (request: string, opts: { approve?: boolean; yolo?: boolean; session?: string }) => {
      const context = resolvePayWayContext({ profile: readProfile(program) });
      const config = readAgentConfig();

      if (!config) {
        if (!process.stdout.isTTY) {
          const blocked: AgentCommandResultV1 = {
            version: 'agent-command/v1',
            status: 'blocked',
            request,
            message: 'Agent is not configured. Run `payway-sdk agent setup` to configure a provider, then retry.',
            error: { code: 'AGENT_NOT_CONFIGURED', message: 'No agent provider configuration found.' },
          };
          console.log(serializeCommandResult(blocked));
          process.exitCode = 1;
        } else {
          console.log(`\n  ${c.yellow('!')} ${c.bold('Agent is not configured')}\n`);
          console.log(
            `  Run ${c.cyan('payway-sdk agent setup')} to configure a provider before using ${c.cyan('ask')}.\n`,
          );
        }
        return;
      }

      const tty = Boolean(process.stdout.isTTY);
      const flag: 'approve' | 'yolo' | undefined = opts.approve ? 'approve' : opts.yolo ? 'yolo' : undefined;

      // Non-TTY without explicit approval: never contact the provider; report
      // that confirmation is required. This guarantees no network call.
      if (!tty && !flag) {
        const needs: AgentCommandResultV1 = {
          version: 'agent-command/v1',
          status: 'needs_confirmation',
          request,
          message:
            'Approval required: provide --approve (or --yolo for sandbox) or run interactively (TTY) before a plan is proposed.',
        };
        console.log(serializeCommandResult(needs));
        process.exitCode = 1;
        return;
      }

      const provider = createProviderAdapter(config);
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
      });

      if (!tty) {
        console.log(serializeCommandResult(result));
        if (result.status === 'failed' || result.status === 'blocked') process.exitCode = 1;
      } else {
        console.log(renderHumanResult(result));
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
    .option('--provider <provider>', 'Provider preset: openai | openrouter | nvidia | custom')
    .option('--model <model>', 'Model name, e.g. gpt-4o')
    .option('--base-url <url>', 'Custom provider base URL (for provider=custom)')
    .option('--capability-mode <mode>', 'native-tools | strict-json-plan')
    .option('--timeout <ms>', 'Provider request timeout in milliseconds')
    .option('--acknowledge-privacy', 'Acknowledge the provider privacy notice (required before plans are proposed)')
    .action(
      async (opts: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        capabilityMode?: string;
        timeout?: string;
        acknowledgePrivacy?: boolean;
      }) => {
        const patch: Partial<ProviderConfigV1> = {};
        if (opts.provider) {
          const preset = opts.provider as ProviderPreset;
          if (!['openai', 'openrouter', 'nvidia', 'custom'].includes(preset)) {
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
        if (opts.acknowledgePrivacy) {
          patch.privacyAcknowledgedAt = new Date().toISOString();
        }

        const config = updateAgentConfig(patch);
        console.log(`\n  ${c.green('✓')} ${c.bold('Agent provider configured')}\n`);
        console.log(`    Provider:        ${c.cyan(config.provider)}`);
        console.log(`    Model:           ${c.cyan(config.model || '(empty)')}`);
        console.log(`    Capability mode: ${c.cyan(config.capabilityMode)}`);
        if (config.baseUrl) console.log(`    Base URL:        ${c.cyan(config.baseUrl)}`);
        console.log(`    Timeout:         ${c.cyan(`${config.timeoutMs ?? 30000}ms`)}`);
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
      const matrix = evaluateReadiness(context, config ?? defaultConfig());

      let connectivity: ProviderConnectivity = { status: 'unverified', detail: 'agent not configured' };
      if (config) {
        const provider = createProviderAdapter(config);
        connectivity = await provider.checkConnectivity();
      }

      console.log(`\n${c.bold('Agent Capability Matrix')}\n`);
      console.log(
        `  ${marker(connectivity.status === 'ready' ? 'ready' : connectivity.status === 'blocked' ? 'blocked' : 'unverified')}  Provider connectivity`,
      );
      console.log(
        `  ${marker(config?.privacyAcknowledgedAt ? 'ready' : 'missing')}  Privacy acknowledgment${
          config?.privacyAcknowledgedAt ? ` (${config.privacyAcknowledgedAt})` : ''
        }`,
      );
      console.log(`  ${marker(matrix.context)}  PayWay context (${context.displayLabel})`);
      console.log(`  ${marker(matrix.onlineQr)}  Online QR callback`);
      console.log(`  ${marker(matrix.offlineKhqr)}  Offline KHQR`);
      console.log(`  ${marker(matrix.checkout)}  Checkout`);
      console.log(`  ${marker(matrix.paymentLinkRsa)}  Payment-link RSA`);
      console.log(`  ${marker(matrix.artifactStorage)}  Artifact storage`);
      console.log(`  ${marker(matrix.sessionStorage)}  Session storage`);
      console.log();
      if (connectivity.detail) {
        console.log(`  ${c.dim(`Provider: ${connectivity.detail}`)}`);
        console.log();
      }
    });

  // agent ack
  agentCmd
    .command('ack')
    .description('Acknowledge the provider privacy notice (required before plans are proposed)')
    .action(() => {
      const existing = readAgentConfig();
      if (!existing || !existing.model) {
        console.log(`\n  ${c.red('✗')} Privacy acknowledgment requires a configured provider.\n`);
        console.log(
          `  Run ${c.cyan('payway-sdk agent setup --provider <p> --model <m> --acknowledge-privacy')} first,\n  or run ${c.cyan('agent ack')} after ${c.cyan('agent setup')}.\n`,
        );
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
