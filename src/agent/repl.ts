/**
 * Agentic PayWay CLI — interactive REPL.
 *
 * The REPL reads directives and free-form requests from stdin. The `:run`
 * directive re-dispatches a *recognized PayWay command* through the existing
 * Commander `program` (single source of truth for the manual CLI). For safety it
 * REJECTS shells, executables, file paths, URI schemes, agent-management
 * subcommands and arbitrary tokens — only the manual top-level command names are
 * accepted.
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

// The REPL re-dispatches recognized commands through the shared Commander
// program. It is injected at registration time (see registerAgentCommands) so
// that cli.ts does not need to export the program instance.
let dispatchProgram: Command | null = null;

/** @internal Called by registerAgentCommands to wire the live program. */
export function setAgentProgram(program: Command): void {
  dispatchProgram = program;
}

// Local ANSI helpers.
const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const PROMPT = `${c.cyan('payway-agent>')} `;

const HELP = `
${c.bold('REPL directives')}
  :help              Show this help
  :profile [name]    Show the active credential profile, or switch to a named profile
  :history           Show command history
  :clear             Clear the screen
  :session           Show / create the active session id
  :run <cmd>         Re-dispatch a recognized PayWay command (e.g. :run generate-qr --amount 3)
  :exit              Leave the REPL

Any other line is sent to the agent as a free-form request.
`;

/** Agent-management and meta commands must never be re-dispatched from the REPL. */
const FORBIDDEN_DISPATCH = new Set(['agent', 'ask']);

/** Tokens that indicate a shell escape / executable / path / URI. */
function isUnsafeDispatch(rest: string): boolean {
  if (/[;&|`$<>(){}\n\r]/.test(rest)) return true;
  if (rest.includes('/') || rest.includes('\\')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rest.trim())) return true;
  return false;
}

function safeParseArgs(rest: string): string[] {
  return rest.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((t) => t.replace(/^["']|["']$/g, '')) ?? [];
}

export async function startRepl(options: { profile?: string; sessionId?: string }): Promise<void> {
  let profile = options.profile ?? process.env.PAYWAY_PROFILE ?? undefined;
  let context = resolvePayWayContext({ profile });
  profile = context.profileName ?? profile;

  const rl = readline.createInterface({
    input: process.stdin as unknown as NodeJS.ReadableStream,
    output: process.stdout as unknown as NodeJS.WritableStream,
    terminal: Boolean(process.stdin.isTTY),
  });

  const history: string[] = [];
  let sessionId = options.sessionId;
  let running = true;

  console.log(`\n${c.bold('Agentic PayWay REPL')} ${c.dim('(type :help for directives, :exit to quit)')}\n`);
  if (!process.stdout.isTTY) {
    console.log(`${c.dim('(non-interactive: reading directives from stdin)')}\n`);
  }

  async function dispatch(rest: string): Promise<void> {
    const tokens = safeParseArgs(rest);
    if (tokens.length === 0) {
      console.log(`  ${c.red('✗')} Rejected: no command supplied to :run`);
      return;
    }
    const name = tokens[0];

    if (
      FORBIDDEN_DISPATCH.has(name) ||
      !dispatchProgram ||
      !dispatchProgram.commands.some((cmd) => cmd.name() === name)
    ) {
      console.log(
        `  ${c.red('✗')} Rejected: '${name}' is not a dispatchable PayWay command (agent-management commands are blocked)`,
      );
      return;
    }
    if (isUnsafeDispatch(rest)) {
      console.log(`  ${c.red('✗')} Rejected: '${rest}' looks like a shell, path, or URI — not a PayWay command`);
      return;
    }

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
      await dispatchProgram.parseAsync(tokens, { from: 'user' });
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

  async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;
    history.push(trimmed);

    if (trimmed === ':exit' || trimmed === ':quit') {
      running = false;
      return;
    }
    if (trimmed === ':help') {
      console.log(HELP);
      return;
    }
    if (trimmed === ':history') {
      if (history.length === 0) {
        console.log(`  ${c.dim('(no history yet)')}`);
      } else {
        history.forEach((h, i) => {
          console.log(`  ${c.dim(`${i + 1}.`)} ${h}`);
        });
      }
      return;
    }
    if (trimmed === ':clear') {
      if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      return;
    }
    if (trimmed === ':profile') {
      console.log(`  profile: ${c.cyan(profile ?? '(none)')}  ${c.dim(`(${context.displayLabel})`)}`);
      return;
    }
    if (trimmed.startsWith(':profile ')) {
      const requestedProfile = trimmed.slice(':profile '.length).trim();
      const resolved = resolvePayWayContext({ profile: requestedProfile });
      if (resolved.profileName !== requestedProfile) {
        console.log(`  ${c.red('✗')} Profile '${requestedProfile}' does not exist.`);
        return;
      }
      profile = requestedProfile;
      context = resolved;
      console.log(`  profile: ${c.cyan(profile)}  ${c.dim(`(${context.displayLabel})`)}`);
      return;
    }
    if (trimmed === ':session') {
      if (!sessionId) {
        const { createSession } = await import('./sessions.js');
        sessionId = createSession(context.displayLabel).sessionId;
      }
      console.log(`  session: ${c.cyan(sessionId)}`);
      return;
    }
    if (trimmed.startsWith(':run ')) {
      await dispatch(trimmed.slice(5).trim());
      return;
    }
    if (trimmed.startsWith(':')) {
      console.log(`  ${c.red('✗')} Unknown directive: ${trimmed} (try :help)`);
      return;
    }

    // Free-form request → agent (only when configured).
    const config = readAgentConfig();
    if (!config) {
      console.log(
        `  ${c.yellow('!')} Agent is not configured. Run ${c.cyan('agent setup')} or use :run for manual CLI commands.`,
      );
      return;
    }
    // Provider and orchestrator are reconstructed for every turn so a prior
    // :profile switch cannot retain stale credentials or display labels.
    const provider = createProviderAdapter(config);
    const orchestrator = new AgentOrchestrator({ context, provider, sessionId, providerConfig: config });
    const runOptions = {
      tty: Boolean(process.stdout.isTTY),
      environment: context.environment,
      ...(process.stdout.isTTY ? { confirmCreatePlan } : {}),
    };
    const result = sessionId
      ? await orchestrator.runTurn(sessionId, trimmed, runOptions)
      : await orchestrator.runOneShot(trimmed, runOptions);
    if (!process.stdout.isTTY) {
      console.log(serializeCommandResult(result));
    } else {
      console.log(renderHumanResult(result));
    }
    sessionId = result.sessionId;
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
    process.stdout.write('Execute this create plan? (y/N): ');
    const answer = await nextLine();
    return answer?.trim().toLowerCase() === 'y';
  }

  while (running) {
    if (process.stdout.isTTY) process.stdout.write(PROMPT);
    const line = await nextLine();
    if (line === null) break;
    await handleLine(line);
  }

  rl.close();
  console.log(`\n${c.dim('Goodbye.')}\n`);
}
