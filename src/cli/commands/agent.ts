/**
 * Agentic PayWay CLI — public command surface.
 *
 * Registers the `ask` top-level command and the `agent` command tree
 * (`setup`, `doctor`, `ack`, `sessions list|export|clear`). The bare `agent`
 * command drops into a REPL (see `src/agent/repl.ts`).
 *
 * Safety: `ask` makes ZERO network calls before authorization is established.
 * Without a config it reports `blocked`; in a non-TTY without an approval flag
 * it reports `needs_confirmation` and never contacts the provider. API keys are
 * never accepted or persisted — they live only in `PAYWAY_AGENT_API_KEY`.
 *
 * Validation, patch building, and output rendering live in `agent-helpers.ts`
 * (pure, unit-tested); the handlers below only glue Commander to those helpers.
 */

import { writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { readAgentConfig, updateAgentConfig } from '../../agent/config.js';
import { resolvePayWayContext } from '../../agent/context.js';
import type { ProviderConfigV1 } from '../../agent/contracts.js';
import { AgentOrchestrator, renderHumanResult, serializeCommandResult } from '../../agent/orchestrator.js';
import { createProviderAdapter, type ProviderConnectivity } from '../../agent/provider.js';
import { evaluateReadinessDetailed } from '../../agent/readiness.js';
import { setAgentProgram, startRepl } from '../../agent/repl.js';
import { clearSessions, exportSession, listSessions } from '../../agent/sessions.js';
import { scanOnboardingState } from '../../agent/onboarding/scan.js';
import { maybeAutoOnboard, onboardingHintText } from './onboard.js';
import { isInteractiveTerminal } from '../../agent/terminal.js';
import { ansi as c } from '../../agent/ansi.js';
import {
  applyProviderConnectivity,
  blockedAgentResult,
  buildSetupPatch,
  createInteractivePlanConfirmation,
  defaultConfig,
  promptConfirm,
  renderAckOutput,
  renderDoctorOutput,
  renderSessionList,
  renderSetupSummary,
  validateAckPrerequisites,
  withProviderTimeout,
} from './agent-helpers.js';

export { isInteractiveTerminal } from '../../agent/terminal.js';
export {
  createInteractivePlanConfirmation,
  promptConfirm,
  promptInput,
} from './agent-helpers.js';

function readProfile(program: Command): string | undefined {
  return program.opts<{ profile?: string }>().profile ?? process.env.PAYWAY_PROFILE ?? undefined;
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
            console.log(serializeCommandResult(blockedAgentResult(request)));
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
        const runConfig = withProviderTimeout(config, opts.providerTimeout);

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
      },
    );

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
        const { patch, error } = buildSetupPatch(opts);
        if (error) {
          console.log(`\n  ${c.red('✗')} ${error}\n`);
          process.exitCode = 1;
          return;
        }
        const config = updateAgentConfig(patch);
        for (const line of renderSetupSummary(config)) {
          console.log(line);
        }
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
      applyProviderConnectivity(matrix, connectivity);

      for (const line of renderDoctorOutput(matrix, {
        privacyAcknowledgedAt: config?.privacyAcknowledgedAt,
        hasConfig: !!config,
        connectivityDetail: connectivity.detail,
      })) {
        console.log(line);
      }
    });

  // agent ack
  agentCmd
    .command('ack')
    .description('Acknowledge the provider privacy notice (required before plans are proposed)')
    .action(() => {
      const existing = readAgentConfig();
      const error = validateAckPrerequisites(existing);
      if (error) {
        console.log(`\n  ${c.red('✗')} ${error}\n`);
        console.log(
          `  Run ${c.cyan('payway-sdk agent setup --provider <p> --model <m> --acknowledge-privacy')} first,\n  or run ${c.cyan('agent ack')} after ${c.cyan('agent setup')}.\n`,
        );
        process.exitCode = 1;
        return;
      }
      const config = updateAgentConfig({ privacyAcknowledgedAt: new Date().toISOString() });
      for (const line of renderAckOutput(existing as ProviderConfigV1, config)) {
        console.log(line);
      }
    });

  // agent sessions
  const sessionsCmd = agentCmd.command('sessions').description('Manage agent sessions');

  sessionsCmd
    .command('list')
    .description('List saved agent sessions')
    .action(() => {
      for (const line of renderSessionList(listSessions())) {
        console.log(line);
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
