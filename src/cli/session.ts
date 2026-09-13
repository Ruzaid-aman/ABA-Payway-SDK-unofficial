/**
 * `payway-sdk session` — a command-first interactive shell over the manual
 * CLI (spec `.scratch/cli-modernization/design.md` §6.3).
 *
 * Unlike the agent REPL, there is NO LLM, no privacy gate, no plan
 * confirmation: every bare line is a PayWay command dispatched through the
 * shared dispatcher (src/agent/repl-dispatch.ts) against the live program.
 * Directives are `:`-prefixed. The payments-specific touch is `:use
 * <tran-id>`: subsequent commands whose resolved Command declares the
 * standard `-t, --transaction-id` option inherit that id when the user
 * omits it — no more re-typing transaction ids across check → detail →
 * poll → close.
 *
 * History persists at `<appdata>/aba-payway-sdk/sessions/cli/<id>.json`
 * (same atomic-write convention as the agent store). The loop is exposed as
 * `runSessionLoop(io)` so tests drive it with injected streams, mirroring
 * the `runRepl` seam; the command gates real TTYs only.
 */

import readline from 'node:readline';
import type { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ansi as c } from '../agent/ansi.js';
import { createDispatcher } from '../agent/repl-dispatch.js';
import { safeParseArgs } from '../agent/repl-helpers.js';
import { atomicWriteJson } from '../agent/storage.js';
import { suggestMessage } from './ui/suggest.js';

export const SESSION_DIRECTIVES = [':help', ':exit', ':history', ':clear', ':profile', ':use'] as const;

export const SESSION_PROMPT_PREFIX = `${c.cyan('payway-session>')}`;

const SESSIONS_HELP = `
${c.bold('Session directives')}
  :help              Show this help
  :use [tran-id]     Show the sticky transaction id, or set/clear it (clear with :use off)
  :profile [name]    Show the active credential profile, or switch to a named profile
  :history           Show this session's dispatched commands
  :clear             Clear the screen
  :exit              Leave the session

Any other line runs as a payway-sdk command — no :run prefix needed. Commands
with a -t/--transaction-id option inherit the sticky :use id when you omit it.
`;

export interface CliSessionFile {
  version: 'cli-session/v1';
  id: string;
  startedAt: string;
  entries: Array<{ ts: string; argv: string[]; exitCode: number | null }>;
}

export function getSessionDir(appDataDirectory: string = process.env.APPDATA ?? path.join(homedir(), '.config')): string {
  return path.join(appDataDirectory, 'aba-payway-sdk', 'sessions', 'cli');
}

function newSessionId(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `cli-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}-${randomUUID().slice(0, 6)}`;
}

function loadMostRecentSession(dir: string): CliSessionFile | null {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    const latest = files[files.length - 1];
    if (!latest) return null;
    return JSON.parse(readFileSync(path.join(dir, latest), 'utf8')) as CliSessionFile;
  } catch {
    return null;
  }
}

/**
 * Resolves the deepest Command along the token chain and returns it plus the
 * number of name tokens consumed (so sticky flags inject after command names).
 */
function resolveCommandChain(program: Command, tokens: string[]): { command: Command; nameTokenCount: number } | null {
  let current: Command | undefined = program.commands.find((cmd) => cmd.name() === tokens[0]);
  if (!current) return null;
  let consumed = 1;
  while (consumed < tokens.length) {
    const next: Command | undefined = current.commands.find((cmd) => cmd.name() === tokens[consumed]);
    if (!next) break;
    current = next;
    consumed += 1;
  }
  return { command: current, nameTokenCount: consumed };
}

/** True when the resolved command declares the standard `-t, --transaction-id` option. */
export function declaresTransactionIdOption(command: Command): boolean {
  return command.options.some((option) => option.short === '-t' && option.long === '--transaction-id');
}

export interface SessionIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  interactive: boolean;
  /** Resume the most recent persisted session instead of starting fresh. */
  resume?: boolean;
  /** Profile name for the prompt and credential resolution (informational; env drives auth). */
  profile?: string;
  /** Test seam: override the persisted-session directory. */
  sessionDir?: string;
  /** Test seam: override the program used for dispatch. */
  program?: Command;
}

export async function runSessionLoop(io: SessionIo): Promise<void> {
  const dir = io.sessionDir ?? getSessionDir();
  const started: CliSessionFile = io.resume ? loadMostRecentSession(dir) ?? emptySession() : emptySession();
  const history: string[] = started.entries.map((entry) => entry.argv.join(' '));

  const program = io.program ?? null;
  const dispatch = createDispatcher(() => program);

  let profile = io.profile ?? process.env.PAYWAY_PROFILE ?? undefined;
  let stickyTranId: string | null = null;
  const rl = readline.createInterface({
    input: io.input as NodeJS.ReadableStream,
    output: io.output as NodeJS.WritableStream,
    terminal: io.interactive,
  });

  console.log(`\n${c.bold('PayWay session')} ${c.dim('(command-first shell — type :help for directives, :exit to quit)')}`);
  if (io.resume) console.log(`  ${c.dim(`resumed session ${c.cyan(started.id)} (${history.length} prior command(s))`)}`);
  if (!io.interactive) console.log(`${c.dim('(non-interactive: reading commands from stdin)')}`);
  console.log();

  function prompt(): void {
    if (!io.interactive) return;
    const suffix = `${profile ? ` ${c.dim(`[${profile}]`)}` : ''}${stickyTranId ? ` ${c.cyan(`· ${stickyTranId}`)}` : ''} `;
    io.output.write(`${SESSION_PROMPT_PREFIX}${suffix}`);
  }

  function emptySession(): CliSessionFile {
    return { version: 'cli-session/v1', id: newSessionId(), startedAt: new Date().toISOString(), entries: [] };
  }

  function persist(argv: string[], exitCode: number | null): void {
    started.entries.push({ ts: new Date().toISOString(), argv, exitCode });
    try {
      atomicWriteJson(path.join(dir, `${started.id}.json`), started);
    } catch {
      // History persistence is best-effort; never break the session over it.
    }
  }

  function stickyInjected(tokens: string[]): string[] {
    if (!stickyTranId || !program) return tokens;
    const resolved = resolveCommandChain(program, tokens);
    if (!resolved || !declaresTransactionIdOption(resolved.command)) return tokens;
    const rest = tokens.slice(resolved.nameTokenCount);
    if (rest.some((token) => token === '-t' || token === '--transaction-id' || token.startsWith('--transaction-id='))) {
      return tokens;
    }
    return [...tokens.slice(0, resolved.nameTokenCount), '-t', stickyTranId, ...rest];
  }

  async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === ':exit' || trimmed === ':quit') {
      exitRequested = true;
      rl.close();
      return;
    }
    if (trimmed === ':help') {
      console.log(SESSIONS_HELP);
      return;
    }
    if (trimmed === ':history') {
      if (history.length === 0) {
        console.log(`  ${c.dim('(no commands yet)')}`);
      } else {
        history.forEach((entry, i) => console.log(`  ${c.dim(`${i + 1}.`)} ${entry}`));
      }
      return;
    }
    if (trimmed === ':clear') {
      if (io.interactive) io.output.write('\x1b[2J\x1b[3J\x1b[H');
      return;
    }
    if (trimmed === ':profile' || trimmed.startsWith(':profile ')) {
      const name = trimmed.slice(':profile'.length).trim();
      if (!name) {
        console.log(`  profile: ${c.cyan(profile ?? '(default)')}`);
        return;
      }
      profile = name;
      console.log(`  profile: ${c.cyan(profile)} ${c.dim('(applies to subsequent gateway commands)')}`);
      return;
    }
    if (trimmed === ':use' || trimmed.startsWith(':use ')) {
      const value = trimmed.slice(':use'.length).trim();
      if (!value) {
        console.log(`  sticky transaction: ${stickyTranId ? c.cyan(stickyTranId) : c.dim('(none — :use <tran-id> to set)')}`);
        return;
      }
      if (value === 'off' || value === 'clear') {
        stickyTranId = null;
        console.log(`  sticky transaction: ${c.dim('cleared')}`);
        return;
      }
      stickyTranId = value;
      console.log(`  sticky transaction: ${c.cyan(stickyTranId)} ${c.dim('— -t commands inherit it unless you pass -t')}`);
      return;
    }
    if (trimmed.startsWith(':')) {
      console.log(`  ${c.red('✗')} Unknown directive: ${trimmed.split(/\s+/)[0]} (try :help)`);
      const suggestion = suggestMessage(trimmed.split(/\s+/)[0], SESSION_DIRECTIVES, 'directive');
      if (suggestion) console.log(`  ${c.dim(suggestion)}`);
      return;
    }

    // Bare line → CLI dispatch with sticky -t injection. Re-quote tokens with
    // spaces so the dispatcher's safeParseArgs restores them exactly.
    const tokens = stickyInjected(safeParseArgs(trimmed));
    await dispatch(tokens.map((token) => (token.includes(' ') ? `"${token}"` : token)).join(' '));
    history.push(tokens.join(' '));
    persist(tokens, typeof process.exitCode === 'number' ? process.exitCode : null);
  }

  const lineQueue: string[] = [];
  let resolveLine: ((value: string | null) => void) | null = null;
  let eof = false;
  let running = true;
  let exitRequested = false;
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

  while (running) {
    prompt();
    const line = await nextLine();
    if (line === null) break;
    await handleLine(line);
    if (exitRequested) running = false;
  }

  console.log(`\n${c.dim(`Session ${started.id} — ${started.entries.length} command(s) recorded.`)}\n`);
}
