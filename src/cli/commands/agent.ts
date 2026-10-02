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
import { findUnfinishedExecutions, pruneLedgerRecords } from '../../agent/ledger.js';
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
            // Machine output always states the environment, even in the
            // unconfigured-blocked case — the resolved context is in scope here.
            console.log(serializeCommandResult({ ...blockedAgentResult(request), environment: context.environment }));
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
    .option('--json', 'Emit the capability matrix as one JSON document')
    .action(async (opts: { json?: boolean }) => {
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

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              environment: context.environment,
              configured: !!config,
              provider: config?.provider ?? null,
              model: config?.model ?? null,
              capabilityMode: config?.capabilityMode ?? null,
              privacyAcknowledged: !!config?.privacyAcknowledgedAt,
              connectivity: connectivity.status,
              connectivityDetail: connectivity.detail,
              rows: matrix,
            },
            null,
            2,
          ),
        );
        return;
      }

      for (const line of renderDoctorOutput(matrix, {
        privacyAcknowledgedAt: config?.privacyAcknowledgedAt,
        hasConfig: !!config,
        connectivityDetail: connectivity.detail,
      })) {
        console.log(line);
      }
    });

  // agent config
  agentCmd
    .command('config')
    .description('Show the stored agent provider configuration (secrets are never stored)')
    .option('--json', 'Print the raw agent-config JSON')
    .action((opts: { json?: boolean }) => {
      const config = readAgentConfig();
      if (!config) {
        const message = 'No agent configuration found. Run `payway-sdk onboard` or `payway-sdk agent setup --provider <p> --model <m> --acknowledge-privacy`.';
        console.log(`  ${c.red('✗')} ${message}`);
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      console.log(`\n${c.bold('Agent configuration')}`);
      console.log(`  Provider:        ${c.cyan(config.provider)}`);
      console.log(`  Model:           ${c.cyan(config.model || '(none)')}`);
      if (config.baseUrl) console.log(`  Base URL:        ${c.cyan(config.baseUrl)}`);
      console.log(`  Capability mode: ${c.cyan(config.capabilityMode)}`);
      if (config.timeoutMs) console.log(`  Timeout:         ${c.cyan(`${config.timeoutMs}ms`)}`);
      if (config.maxTokens) console.log(`  Max tokens:      ${c.cyan(String(config.maxTokens))}`);
      if (config.temperature !== undefined) console.log(`  Temperature:     ${c.cyan(String(config.temperature))}`);
      if (config.topP !== undefined) console.log(`  Top-p:           ${c.cyan(String(config.topP))}`);
      if (config.extraBody) console.log(`  Extra body:      ${c.cyan(JSON.stringify(config.extraBody))}`);
      console.log(
        `  Privacy ack:     ${
          config.privacyAcknowledgedAt ? c.green(config.privacyAcknowledgedAt) : c.yellow('not acknowledged (run payway-sdk agent ack)')
        }`,
      );
      console.log(`\n  ${c.dim('API key location: PAYWAY_AGENT_API_KEY environment variable (or .env) — never stored on disk.')}`);
      console.log();
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

  // ─── agent ledger recover ─────────────────────────────────────────────────
  // Phase 2: findUnfinishedExecutions existed and was tested, but no CLI
  // surface reached it (audit gap G10). Recovery is LOOKUP ONLY — creates are
  // never replayed; the operator checks the recorded transaction id instead.
  const ledgerCmd = agentCmd
    .command('ledger')
    .description('Inspect the execution ledger (create-action lifecycle)');

  ledgerCmd
    .command('recover')
    .description(
      'List unfinished executions for a session (planned/confirmed/submitted/outcome_unknown). Never auto-replays — verify each transaction id with check-transaction.',
    )
    // NOTE: deliberately --session-id, NOT --session — the `agent` group
    // itself defines --session (REPL resume) and would swallow the value.
    .option('--session-id <id>', 'Session id to inspect (defaults to the most recent session)')
    .option('--json', 'Machine-readable output')
    .action((opts: { sessionId?: string; json?: boolean }) => {
      const sessionId =
        opts.sessionId ?? listSessions().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.sessionId;
      if (!sessionId) {
        if (opts.json) {
          console.log(JSON.stringify({ sessionId: null, unfinished: [] }, null, 2));
          return;
        }
        console.log(`\n  ${c.yellow('No agent sessions found.')}\n`);
        return;
      }
      const unfinished = findUnfinishedExecutions(sessionId);
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              sessionId,
              unfinished: unfinished.map((r) => ({
                executionId: r.executionId,
                tool: r.tool,
                transactionId: r.transactionId,
                merchantRef: r.merchantRef,
                status: r.status,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                correlation: r.correlation,
              })),
            },
            null,
            2,
          ),
        );
        return;
      }
      if (unfinished.length === 0) {
        console.log(`\n  ${c.green('✓')} Session ${c.cyan(sessionId)} has no unfinished executions.\n`);
        return;
      }
      console.log(`\n  ${c.bold('Unfinished executions')} in session ${c.cyan(sessionId)}:\n`);
      for (const r of unfinished) {
        const tx = r.transactionId ? `tx=${r.transactionId}` : 'tx=(not yet assigned)';
        console.log(`  ${c.yellow('•')} ${c.cyan(r.executionId)}  ${r.tool}  ${tx}  status=${r.status}`);
        if (r.transactionId) {
          console.log(`    ${c.dim(`recover: payway-sdk check-transaction -t ${r.transactionId}`)}`);
        }
      }
      console.log(`\n  ${c.dim('Create actions are NEVER replayed automatically — verify the outcome manually.')}\n`);
    });

  // ─── agent ledger prune (I-13 — retention parity with `journal prune`) ────
  ledgerCmd
    .command('prune')
    .description('Delete FINISHED (succeeded/failed) execution records older than a cutoff. Unfinished records are never removed.')
    .option('--before <cutoff>', 'Days back (e.g. 30) or ISO-8601 timestamp', '30')
    .option('--json', 'Machine-readable output')
    .action((opts: { before?: string; json?: boolean }) => {
      const raw = opts.before ?? '30';
      const days = Number.parseFloat(raw);
      const before = Number.isFinite(days) && !raw.includes('T')
        ? new Date(Date.now() - days * 86_400_000)
        : new Date(raw);
      if (Number.isNaN(before.getTime())) {
        console.log(`  Invalid --before value: ${raw}`);
        process.exitCode = 1;
        return;
      }
      const result = pruneLedgerRecords(before);
      if (opts.json) {
        console.log(JSON.stringify({ before: before.toISOString(), ...result }, null, 2));
        return;
      }
      console.log(`\n  ${c.green('✓')} Pruned ${result.removed} finished record(s); ${result.kept} kept (incl. all unfinished).\n`);
    });
}
