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
import {
  AgentOrchestrator,
  renderCreatePlanConfirmation,
  renderHumanResult,
  serializeCommandResult,
  type CreatePlanConfirmation,
} from './orchestrator.js';
import { createProviderAdapter } from './provider.js';
import { scanOnboardingState } from './onboarding/scan.js';
import { maybeAutoOnboard, onboardingHintText } from '../cli/commands/onboard.js';
import { isInteractiveTerminal, PRODUCTION_CONFIRMATION_PHRASE } from './terminal.js';
import { ansi as c } from './ansi.js';
import { contactingProviderLine, createProgressPrinter, providerProposalFailedHint } from './progress.js';
import { classifyReplLine, REPL_HELP, REPL_PROMPT, validateDispatch } from './repl-helpers.js';

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

  async function dispatch(rest: string): Promise<void> {
    const program = dispatchProgram;
    const decision = validateDispatch(rest, program?.commands.map((cmd) => cmd.name()) ?? []);
    if (!decision.ok) {
      console.log(`  ${c.red('✗')} ${decision.message}`);
      return;
    }
    if (!program) return; // unreachable: decision.ok implies a registered command matched
    const tokens = decision.tokens;

    console.log(`  ${c.cyan('→')} Running: payway-sdk ${tokens.join(' ')}`);
    // Prevent an unexpected process.exit (e.g. missing required option) from
    // terminating the REPL; capture it and continue the loop.
    const originalExit = process.exit;
    const priorExitCode = process.exitCode;
    let exited = false;
    (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
      exited = true;
      throw new Error(`__repl_exit__${code ?? 0}`);
    }) as (code?: number) => never;
    try {
      await program.parseAsync(tokens, { from: 'user' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith('__repl_exit__')) {
        console.log(`  ${c.dim(`dispatch error: ${message}`)}`);
      }
    } finally {
      (process as { exit: (code?: number) => never }).exit = originalExit as (code?: number) => never;
      // A dispatched subcommand may set process.exitCode; do not let it leak
      // into the REPL session exit code.
      process.exitCode = priorExitCode;
    }
    void exited;
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
      case 'run':
        await dispatch(directive.rest);
        return;
      case 'unknown-directive':
        console.log(`  ${c.red('✗')} Unknown directive: ${directive.line} (try :help)`);
        return;
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
