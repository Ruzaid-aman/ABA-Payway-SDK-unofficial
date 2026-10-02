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
  :tools             List the agent tool catalog with risk classes
  :docs <query>      Search the offline knowledge base (:docs read <topic> reads one)
  :journal <args>    Query the transaction journal (e.g. :journal timeline -t <id>)
  :status            Show profile + agent provider connectivity
  :run <cmd>         Re-dispatch a recognized PayWay command (e.g. :run generate-qr --amount 3)
  :exit              Leave the REPL

Any other line is sent to the agent as a free-form request.
`;

/** Directive names known to the REPL — used for did-you-mean on typos. */
export const REPL_DIRECTIVES = [
  ':help',
  ':profile',
  ':history',
  ':clear',
  ':session',
  ':tools',
  ':docs',
  ':journal',
  ':status',
  ':run',
  ':exit',
] as const;

/** Agent-management and meta commands must never be re-dispatched from the REPL. */
const FORBIDDEN_DISPATCH = new Set(['agent', 'ask']);

/**
 * Registered commands `:run` may never re-dispatch. The agent surface carries
 * no money-out tool (no refund, payout, void, beneficiary, or token-remove),
 * so the shared REPL/session dispatcher must not become a side door to one.
 * Top-level entries block the whole command group (`cof` contains charge and
 * token removal; `tx-batch` can carry close); pair entries block only the
 * destructive subcommand of an otherwise readable group. `pre-auth cancel`
 * stays allowed — it releases a hold, it does not capture money.
 */
const BLOCKED_DISPATCH_TOP_LEVEL: Record<string, string> = {
  refund: 'moves money out',
  payout: 'moves money out',
  beneficiary: 'mutates the payout whitelist (money-out path)',
  'close-transaction': 'irreversibly kills customer-facing payments',
  cof: 'contains card-on-file charge and token removal',
  'tx-batch': 'can batch irreversible operations',
};

const BLOCKED_DISPATCH_PAIRS: Record<string, string> = {
  'payment-link void': 'permanently voids a payment link',
  'pre-auth complete': 'captures the held funds',
  'pre-auth complete-payout': 'captures the held funds into a payout',
  'profiles remove': 'deletes a credential profile without confirmation',
  'skills remove': 'deletes installed skill files without confirmation',
};

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
 * REPL prints. Precedence: registry first (an unregistered command is rejected
 * generically), then the money-out/irreversible blocklist, then the shell/
 * path/URI check. A missing/empty registry rejects everything, matching the
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
  // Top-level rules see tokens[0] alone; pair rules need the first two tokens.
  const blockedMessage = (subject: string, reason: string) =>
    `Rejected: '${subject}' is blocked in the REPL/session dispatcher for safety (${reason}) — run it from the normal CLI shell instead`;
  const topLevelReason = BLOCKED_DISPATCH_TOP_LEVEL[name];
  if (topLevelReason) {
    return { ok: false, message: blockedMessage(name, topLevelReason) };
  }
  if (tokens.length > 1) {
    const pair = `${name} ${tokens[1]}`;
    const pairReason = BLOCKED_DISPATCH_PAIRS[pair];
    if (pairReason) {
      return { ok: false, message: blockedMessage(pair, pairReason) };
    }
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
  | { kind: 'tools' }
  | { kind: 'docs'; query: string }
  | { kind: 'journal'; args: string }
  | { kind: 'status' }
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
  if (trimmed === ':tools') return { kind: 'tools' };
  if (trimmed === ':docs' || trimmed.startsWith(':docs ')) {
    return { kind: 'docs', query: trimmed.slice(':docs'.length).trim() };
  }
  if (trimmed.startsWith(':journal ') || trimmed === ':journal') {
    return { kind: 'journal', args: trimmed.slice(':journal'.length).trim() };
  }
  if (trimmed === ':status') return { kind: 'status' };
  if (trimmed.startsWith(':run ')) return { kind: 'run', rest: trimmed.slice(':run '.length).trim() };
  if (trimmed.startsWith(':')) return { kind: 'unknown-directive', line: trimmed };
  return { kind: 'request', text: trimmed };
}
