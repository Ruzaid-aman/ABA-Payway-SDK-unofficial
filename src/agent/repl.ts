/**
 * Agentic PayWay CLI — interactive REPL.
 *
 * The REPL reads directives and free-form requests from stdin. The `:run`
 * directive re-dispatches a *recognized PayWay command* through the existing
 * Commander `program` (single source of truth for the manual CLI). For safety it
 * REJECTS shells, executables, file paths, URI schemes, agent-management
 * subcommands and arbitrary tokens — only the manual top-level command names are
 * accepted.
 *
 * Directive classification and dispatch validation live in `repl-helpers.ts`
 * (pure, unit-tested). The loop itself is exposed as `runRepl(io, …)` so tests
 * can drive it with injected streams; `startRepl` wires the real stdin/stdout.
 */

import readline from 'node:readline';
import type { Command } from 'commander';
import { readAgentConfig } from './config.js';
import { resolvePayWayContext } from './context.js';
import { findUnfinishedExecutions } from './ledger.js';
import {
  AgentOrchestrator,
  renderCreatePlanConfirmation,
  renderHumanResult,
  serializeCommandResult,
  type CreatePlanConfirmation,
} from './orchestrator.js';
import { createProviderAdapter } from './provider.js';
import { listSessions } from './sessions.js';
import { scanOnboardingState } from './onboarding/scan.js';
import { maybeAutoOnboard, onboardingHintText } from '../cli/commands/onboard.js';
import { isInteractiveTerminal, PRODUCTION_CONFIRMATION_PHRASE } from './terminal.js';
import { ansi as c } from './ansi.js';
import { contactingProviderLine, createProgressPrinter, providerProposalFailedHint } from './progress.js';
import { classifyReplLine, REPL_DIRECTIVES, REPL_HELP, REPL_PROMPT } from './repl-helpers.js';
import { createDispatcher } from './repl-dispatch.js';
import { buildToolSchemas } from './provider-prompts.js';
import { isReadOnlyTool } from './planning.js';
import { suggestMessage } from '../cli/ui/suggest.js';

// The REPL re-dispatches recognized commands through the shared Commander
// program. It is injected at registration time (see registerAgentCommands) so
// that cli.ts does not need to export the program instance.
let dispatchProgram: Command | null = null;

/** @internal Called by registerAgentCommands to wire the live program. */
export function setAgentProgram(program: Command): void {
  dispatchProgram = program;
}

/** Injectable terminal endpoints for the REPL loop. */
export interface ReplIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  interactive: boolean;
}

/** Enter the REPL on the real terminal. */
export async function startRepl(options: { profile?: string; sessionId?: string }): Promise<void> {
  return runRepl({
    profile: options.profile,
    sessionId: options.sessionId,
    input: process.stdin as unknown as NodeJS.ReadableStream,
    output: process.stdout as unknown as NodeJS.WritableStream,
    interactive: isInteractiveTerminal(),
  });
}

/**
 * Run the REPL loop against injected streams. Output lines go through
 * `console.log` (the real stdout in production; captured in tests); prompt and
 * clear-screen writes go to `io.output` so a TTY-less harness can still verify
 * them.
 */
export async function runRepl(
  io: ReplIo & { profile?: string; sessionId?: string },
): Promise<void> {
  let profile = io.profile ?? process.env.PAYWAY_PROFILE ?? undefined;
  let context = resolvePayWayContext({ profile });
  profile = context.profileName ?? profile;
  const interactive = io.interactive;

  const rl = readline.createInterface({
    input: io.input as NodeJS.ReadableStream,
    output: io.output as NodeJS.WritableStream,
    terminal: interactive,
  });

  const history: string[] = [];
  let sessionId = io.sessionId;
  let running = true;

  console.log(`\n${c.bold('Agentic PayWay REPL')} ${c.dim('(type :help for directives, :exit to quit)')}\n`);
  if (!interactive) {
    console.log(`${c.dim('(non-interactive: reading directives from stdin)')}\n`);
  }

  // I-12: unfinished creates from the most recent prior session — a
  // lookup-only banner (the agent NEVER replays create actions). Suppress
  // with PAYWAY_AGENT_NO_RECOVER_HINT=1.
  if (!process.env.PAYWAY_AGENT_NO_RECOVER_HINT) {
    try {
      const sessions = listSessions().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const previous = sessionId ? sessions.find((s) => s.sessionId !== sessionId) : sessions[0];
      if (previous) {
        const unfinished = findUnfinishedExecutions(previous.sessionId);
        if (unfinished.length > 0) {
          console.log(
            `  ${c.yellow('⚠')} Session ${c.cyan(previous.sessionId)} has ${unfinished.length} unfinished create execution(s).`,
          );
          console.log(
            `    ${c.dim(`Run: payway-sdk agent ledger recover --session-id ${previous.sessionId} (creates are never replayed — verify each transaction id)`)}`,
          );
          console.log();
        }
      }
    } catch {
      // The banner is advisory — ledger/session read failures must never block the REPL.
    }
  }

  async function dispatch(rest: string): Promise<void> {
    // Shared dispatcher (also used by `payway-sdk session`): validates against
    // the live program, traps process.exit, restores the exit code.
    await createDispatcher(() => dispatchProgram)(rest);
  }

  /** `:tools` — the agent tool catalog with risk classes (offline, no LLM turn). */
  function handleToolsDirective(): void {
    const schemas = buildToolSchemas() as Array<{
      function: { name: string; description: string };
    }>;
    const width = schemas.reduce((max, def) => Math.max(max, def.function.name.length), 0);
    console.log(`\n${c.bold('Agent tool catalog')} ${c.dim('(14 tools; MCP exposure mirrors this)')}`);
    for (const def of schemas) {
      const risk = isReadOnlyTool(def.function.name) ? c.dim('read-only') : c.yellow('mutation ');
      console.log(`  ${def.function.name.padEnd(width)}  [${risk}]  ${def.function.description}`);
    }
    console.log();
  }

  /** `:docs` — direct query_knowledge executor (offline; no provider call). */
  async function handleDocsDirective(query: string): Promise<void> {
    if (!query) {
      console.log(`  ${c.dim('Usage: :docs <keywords…> to search, :docs read <topic> to read one')}`);
      return;
    }
    const { readTopic, searchKnowledge } = await import('../knowledge/store.js');
    if (query.startsWith('read ')) {
      const topic = query.slice('read '.length).trim();
      const read = topic ? readTopic(topic) : null;
      if (read?.status !== 'ok') {
        console.log(`  ${c.red('✗')} Unknown topic "${topic}" — use :docs <keywords> to search first.`);
        return;
      }
      console.log(`\n${c.bold(read.topic.title)} ${c.dim(`(${read.topic.topic})`)}\n`);
      console.log(read.content);
      return;
    }
    const result = searchKnowledge(query);
    if (!result) {
      console.log(`  ${c.red('✗')} Knowledge corpus not found (packaged knowledge/ missing or not synced).`);
      return;
    }
    if (result.hits.length === 0) {
      console.log(`  ${c.dim(`No hits for "${query}" — try different keywords.`)}`);
      return;
    }
    console.log(`\n${c.bold(`Knowledge search: "${query}"`)} ${c.dim(`— ${result.totalHits} hit(s)${result.truncated ? ' (truncated)' : ''}`)}`);
    for (const hit of result.hits.slice(0, 10)) {
      console.log(`  ${c.cyan(hit.topic)}  ${c.dim(hit.text.slice(0, 70))}`);
    }
    console.log(`  ${c.dim('Read one with: :docs read <topic>')}\n`);
  }

  /** `:status` — active profile + agent provider connectivity (silent on failure). */
  async function handleStatusDirective(): Promise<void> {
    console.log(`  profile: ${c.cyan(profile ?? '(none)')}  ${c.dim(`(${context.displayLabel})`)}`);
    try {
      const config = readAgentConfig();
      if (!config) {
        console.log(`  agent: ${c.dim('not configured (payway-sdk onboard)')} — :run and :docs work without it`);
        return;
      }
      const provider = createProviderAdapter(config);
      const connectivity = await provider.checkConnectivity();
      const line =
        connectivity.status === 'ready'
          ? c.green('✓ reachable')
          : connectivity.status === 'blocked'
            ? c.red(`✗ ${connectivity.detail ?? 'blocked'}`)
            : c.dim(`? ${connectivity.detail ?? 'unverified'}`);
      console.log(`  agent: ${c.cyan(`${config.provider}/${config.model}`)} ${line}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  agent: ${c.red(`✗ connectivity check failed: ${message}`)}`);
    }
  }

  async function handleRequest(text: string): Promise<void> {
    // Free-form request → agent (only when configured).
    let config = readAgentConfig();
    if (!config) {
      if (interactive && (await maybeAutoOnboard())) config = readAgentConfig();
      if (!config) {
        const hint = onboardingHintText(scanOnboardingState());
        console.log(`  ${c.yellow('!')} Agent is not configured.`);
        if (hint) console.log(hint);
        else console.log(`  Run ${c.cyan('payway-sdk onboard')} or use :run for manual CLI commands.`);
        return;
      }
    }
    // Provider and orchestrator are reconstructed for every turn so a prior
    // :profile switch cannot retain stale credentials or display labels.
    const onProgress = createProgressPrinter({ tty: interactive, write: (line) => console.log(line) });
    const provider = createProviderAdapter(config);
    const orchestrator = new AgentOrchestrator({ context, provider, sessionId, providerConfig: config });
    const runOptions = {
      tty: interactive,
      environment: context.environment,
      onProgress,
      ...(interactive ? { confirmCreatePlan } : {}),
    };
    if (interactive) {
      console.log(contactingProviderLine(config.provider, config.model));
    }
    const result = sessionId
      ? await orchestrator.runTurn(sessionId, text, runOptions)
      : await orchestrator.runOneShot(text, runOptions);
    if (!interactive) {
      console.log(serializeCommandResult(result));
    } else {
      console.log(renderHumanResult(result));
      if (result.status === 'failed' && result.error?.code === 'PROVIDER_PROPOSAL_FAILED') {
        console.log(providerProposalFailedHint());
      }
    }
    sessionId = result.sessionId;
  }

  async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    history.push(trimmed);

    const directive = classifyReplLine(trimmed);
    switch (directive.kind) {
      case 'exit':
        running = false;
        return;
      case 'help':
        console.log(REPL_HELP);
        return;
      case 'history':
        if (history.length === 0) {
          console.log(`  ${c.dim('(no history yet)')}`);
        } else {
          history.forEach((h, i) => {
            console.log(`  ${c.dim(`${i + 1}.`)} ${h}`);
          });
        }
        return;
      case 'clear':
        if (interactive) io.output.write('\x1b[2J\x1b[3J\x1b[H');
        return;
      case 'profile-show':
        console.log(`  profile: ${c.cyan(profile ?? '(none)')}  ${c.dim(`(${context.displayLabel})`)}`);
        return;
      case 'profile-switch': {
        const resolved = resolvePayWayContext({ profile: directive.profile });
        if (resolved.profileName !== directive.profile) {
          console.log(`  ${c.red('✗')} Profile '${directive.profile}' does not exist.`);
          return;
        }
        profile = directive.profile;
        context = resolved;
        console.log(`  profile: ${c.cyan(profile)}  ${c.dim(`(${context.displayLabel})`)}`);
        return;
      }
      case 'session':
        if (!sessionId) {
          const { createSession } = await import('./sessions.js');
          sessionId = createSession(context.displayLabel).sessionId;
        }
        console.log(`  session: ${c.cyan(sessionId)}`);
        return;
      case 'tools':
        handleToolsDirective();
        return;
      case 'docs':
        await handleDocsDirective(directive.query);
        return;
      case 'journal':
        // Journal subcommands are manual-CLI reads — re-dispatch through the
        // shared dispatcher (same safety rules as :run).
        await dispatch(`journal ${directive.args}`.trim());
        return;
      case 'status':
        await handleStatusDirective();
        return;
      case 'run':
        await dispatch(directive.rest);
        return;
      case 'unknown-directive': {
        console.log(`  ${c.red('✗')} Unknown directive: ${directive.line} (try :help)`);
        const suggestion = suggestMessage(directive.line.split(/\s+/)[0], REPL_DIRECTIVES, 'directive');
        if (suggestion) console.log(`  ${c.dim(suggestion)}`);
        return;
      }
      case 'request':
        await handleRequest(directive.text);
        return;
    }
  }

  // Async line loop (works for both TTY and piped stdin). Using 'line' events
  // (rather than repeated rl.question) avoids losing buffered input when stdin
  // is a pipe.
  const lineQueue: string[] = [];
  let resolveLine: ((value: string | null) => void) | null = null;
  let eof = false;
  rl.on('line', (l: string) => {
    if (resolveLine) {
      const r = resolveLine;
      resolveLine = null;
      r(l);
    } else {
      lineQueue.push(l);
    }
  });
  rl.on('close', () => {
    eof = true;
    if (resolveLine) {
      const r = resolveLine;
      resolveLine = null;
      r(null);
    }
  });

  function nextLine(): Promise<string | null> {
    if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift() as string);
    if (eof) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      resolveLine = resolve;
    });
  }

  async function confirmCreatePlan(proposal: CreatePlanConfirmation): Promise<boolean> {
    console.log(`\n${renderCreatePlanConfirmation(proposal)}`);
    io.output.write(
      proposal.environment === 'production'
        ? `Type ${PRODUCTION_CONFIRMATION_PHRASE} to execute this production create plan: `
        : 'Execute this create plan? (y/N): ',
    );
    const answer = await nextLine();
    return proposal.environment === 'production'
      ? answer?.trim() === PRODUCTION_CONFIRMATION_PHRASE
      : answer?.trim().toLowerCase() === 'y';
  }

  while (running) {
    if (interactive) io.output.write(REPL_PROMPT);
    const line = await nextLine();
    if (line === null) break;
    await handleLine(line);
  }

  rl.close();
  console.log(`\n${c.dim('Goodbye.')}\n`);
}
