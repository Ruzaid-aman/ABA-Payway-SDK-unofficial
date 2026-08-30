/**
 * Pure helpers for the agent REPL: directive classification, `:run` dispatch
 * validation, and the static REPL texts. Everything here is side-effect free so
 * the safety-critical rules (what may and may not be re-dispatched) can be
 * unit-tested without a terminal.
 */
import { ansi as c } from './ansi.js';

export const REPL_PROMPT = `${c.cyan('payway-agent>')} `;

export const REPL_HELP = `
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
export function isUnsafeDispatch(rest: string): boolean {
  if (/[;&|`$<>(){}\n\r]/.test(rest)) return true;
  if (rest.includes('/') || rest.includes('\\')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rest.trim())) return true;
  return false;
}

/** Whitespace splitter that respects single/double quotes; strips the quotes. */
export function safeParseArgs(rest: string): string[] {
  return rest.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((t) => t.replace(/^["']|["']$/g, '')) ?? [];
}

export type DispatchDecision =
  | { ok: true; tokens: string[] }
  | { ok: false; message: string };

/**
 * Validate a `:run` payload against the set of registered top-level command
 * names. Returns the tokens to dispatch or the exact rejection message the
 * REPL prints. A missing/empty registry rejects everything, matching the
 * "not a dispatchable PayWay command" behavior of an unregistered program.
 */
export function validateDispatch(rest: string, registeredNames: Iterable<string>): DispatchDecision {
  const tokens = safeParseArgs(rest);
  if (tokens.length === 0) {
    return { ok: false, message: 'Rejected: no command supplied to :run' };
  }
  const name = tokens[0];
  const known = new Set(registeredNames);
  if (FORBIDDEN_DISPATCH.has(name) || !known.has(name)) {
    return {
      ok: false,
      message: `Rejected: '${name}' is not a dispatchable PayWay command (agent-management commands are blocked)`,
    };
  }
  if (isUnsafeDispatch(rest)) {
    return { ok: false, message: `Rejected: '${rest}' looks like a shell, path, or URI — not a PayWay command` };
  }
  return { ok: true, tokens };
}

export type ReplLine =
  | { kind: 'exit' }
  | { kind: 'help' }
  | { kind: 'history' }
  | { kind: 'clear' }
  | { kind: 'profile-show' }
  | { kind: 'profile-switch'; profile: string }
  | { kind: 'session' }
  | { kind: 'run'; rest: string }
  | { kind: 'unknown-directive'; line: string }
  | { kind: 'request'; text: string };

/**
 * Classify an already-trimmed REPL line. `:run` (with trailing space) carries
 * the remainder; a bare `:run` is an unknown directive, as before. Anything
 * not starting with `:` is a free-form agent request.
 */
export function classifyReplLine(trimmed: string): ReplLine {
  if (trimmed === ':exit' || trimmed === ':quit') return { kind: 'exit' };
  if (trimmed === ':help') return { kind: 'help' };
  if (trimmed === ':history') return { kind: 'history' };
  if (trimmed === ':clear') return { kind: 'clear' };
  if (trimmed === ':profile') return { kind: 'profile-show' };
  if (trimmed.startsWith(':profile ')) {
    return { kind: 'profile-switch', profile: trimmed.slice(':profile '.length).trim() };
  }
  if (trimmed === ':session') return { kind: 'session' };
  if (trimmed.startsWith(':run ')) return { kind: 'run', rest: trimmed.slice(':run '.length).trim() };
  if (trimmed.startsWith(':')) return { kind: 'unknown-directive', line: trimmed };
  return { kind: 'request', text: trimmed };
}
