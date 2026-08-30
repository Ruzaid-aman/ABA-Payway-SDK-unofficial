import { describe, expect, it } from 'vitest';
import {
  classifyReplLine,
  isUnsafeDispatch,
  REPL_HELP,
  REPL_PROMPT,
  safeParseArgs,
  validateDispatch,
} from '../agent/repl-helpers.js';
import {
  contactingProviderLine,
  createProgressPrinter,
  progressLabel,
  providerProposalFailedHint,
} from '../agent/progress.js';

/**
 * Pure helper coverage for the agent REPL: directive classification, :run
 * dispatch validation (the security boundary), and the shared ask/REPL
 * presentation strings. These pin the exact rejection messages the REPL prints.
 */

const esc = String.fromCharCode(27);
const stripAnsi = (s: string): string => s.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '');

describe('isUnsafeDispatch', () => {
  it('flags shell metacharacters, path separators, and URI schemes', () => {
    expect(isUnsafeDispatch('generate-qr; rm -rf')).toBe(true);
    expect(isUnsafeDispatch('a | b')).toBe(true);
    expect(isUnsafeDispatch('a & b')).toBe(true);
    expect(isUnsafeDispatch('back`tick')).toBe(true);
    expect(isUnsafeDispatch('sub$(whoami)')).toBe(true);
    expect(isUnsafeDispatch('a < b > c')).toBe(true);
    expect(isUnsafeDispatch('brace{x}')).toBe(true);
    expect(isUnsafeDispatch('line\nbreak')).toBe(true);
    expect(isUnsafeDispatch('carriage\rreturn')).toBe(true);
    expect(isUnsafeDispatch('path/to/file')).toBe(true);
    expect(isUnsafeDispatch('windows\\path')).toBe(true);
    expect(isUnsafeDispatch('https://evil.example')).toBe(true);
    expect(isUnsafeDispatch('file:/etc/passwd')).toBe(true);
  });

  it('accepts plain command tokens', () => {
    expect(isUnsafeDispatch('generate-qr --amount 3')).toBe(false);
    expect(isUnsafeDispatch('check-transaction -t abc123')).toBe(false);
  });
});

describe('safeParseArgs', () => {
  it('splits on whitespace and strips surrounding quotes', () => {
    expect(safeParseArgs('generate-qr --amount 3')).toEqual(['generate-qr', '--amount', '3']);
    expect(safeParseArgs('ask "two words"')).toEqual(['ask', 'two words']);
    expect(safeParseArgs("say 'x y'")).toEqual(['say', 'x y']);
    expect(safeParseArgs('')).toEqual([]);
  });
});

describe('validateDispatch', () => {
  const registered = ['generate-qr', 'check-transaction', 'agent', 'ask'];

  it('accepts a recognized command and returns its tokens', () => {
    const decision = validateDispatch('generate-qr --amount 3', registered);
    expect(decision).toEqual({ ok: true, tokens: ['generate-qr', '--amount', '3'] });
  });

  it('rejects an empty payload', () => {
    expect(validateDispatch('', registered)).toEqual({
      ok: false,
      message: 'Rejected: no command supplied to :run',
    });
    expect(validateDispatch('   ', registered)).toMatchObject({ ok: false });
  });

  it('rejects agent-management commands even though they are registered', () => {
    expect(validateDispatch('agent doctor', registered)).toEqual({
      ok: false,
      message: "Rejected: 'agent' is not a dispatchable PayWay command (agent-management commands are blocked)",
    });
    expect(validateDispatch('ask pay $3', registered)).toMatchObject({ ok: false });
  });

  it('rejects unknown commands', () => {
    expect(validateDispatch('bogus --x', registered)).toEqual({
      ok: false,
      message: "Rejected: 'bogus' is not a dispatchable PayWay command (agent-management commands are blocked)",
    });
  });

  it('rejects everything when no program is registered (empty name set)', () => {
    expect(validateDispatch('generate-qr', [])).toMatchObject({ ok: false });
  });

  it('rejects shell escapes, paths, and URIs with a distinct message', () => {
    expect(validateDispatch('generate-qr --amount 3; rm -rf /', registered)).toEqual({
      ok: false,
      message:
        "Rejected: 'generate-qr --amount 3; rm -rf /' looks like a shell, path, or URI — not a PayWay command",
    });
    expect(validateDispatch('check-transaction ./local', registered)).toMatchObject({ ok: false });
  });

  it('checks the registry before unsafety, matching historical precedence', () => {
    // An unknown command that is also unsafe reports the registry rejection.
    expect(validateDispatch('nope/x', registered)).toMatchObject({
      ok: false,
      message: "Rejected: 'nope/x' is not a dispatchable PayWay command (agent-management commands are blocked)",
    });
  });
});

describe('classifyReplLine', () => {
  it('classifies every directive', () => {
    expect(classifyReplLine(':exit')).toEqual({ kind: 'exit' });
    expect(classifyReplLine(':quit')).toEqual({ kind: 'exit' });
    expect(classifyReplLine(':help')).toEqual({ kind: 'help' });
    expect(classifyReplLine(':history')).toEqual({ kind: 'history' });
    expect(classifyReplLine(':clear')).toEqual({ kind: 'clear' });
    expect(classifyReplLine(':profile')).toEqual({ kind: 'profile-show' });
    expect(classifyReplLine(':profile production')).toEqual({ kind: 'profile-switch', profile: 'production' });
    expect(classifyReplLine(':profile   sandbox  ')).toEqual({ kind: 'profile-switch', profile: 'sandbox' });
    expect(classifyReplLine(':session')).toEqual({ kind: 'session' });
    expect(classifyReplLine(':run generate-qr --amount 3')).toEqual({
      kind: 'run',
      rest: 'generate-qr --amount 3',
    });
  });

  it('treats a bare :run and other unknown directives as unknown', () => {
    expect(classifyReplLine(':run')).toEqual({ kind: 'unknown-directive', line: ':run' });
    expect(classifyReplLine(':bogus arg')).toEqual({ kind: 'unknown-directive', line: ':bogus arg' });
  });

  it('passes free-form text through as a request', () => {
    expect(classifyReplLine('generate a QR for $3')).toEqual({ kind: 'request', text: 'generate a QR for $3' });
  });
});

describe('REPL static texts', () => {
  it('lists all directives in the help text and renders the prompt', () => {
    const help = stripAnsi(REPL_HELP);
    for (const directive of [':help', ':profile', ':history', ':clear', ':session', ':run', ':exit']) {
      expect(help).toContain(directive);
    }
    expect(stripAnsi(REPL_PROMPT)).toBe('payway-agent> ');
  });
});

describe('progress presentation helpers', () => {
  it('maps orchestrator phases to labels', () => {
    expect(progressLabel({ phase: 'validate' })).toBe('Validating plan…');
    expect(progressLabel({ phase: 'authorize' })).toBe('Authorizing plan…');
    expect(progressLabel({ phase: 'execute', detail: 'generate_online_qr' })).toBe(
      'Executing generate_online_qr…',
    );
    expect(progressLabel({ phase: 'execute' })).toBe('Executing action…');
    expect(progressLabel({ phase: 'anything-else' })).toBe('Finalizing…');
  });

  it('renders the contacting banner with a no-model fallback', () => {
    expect(stripAnsi(contactingProviderLine('openai', 'gpt-4o'))).toBe(
      '  · Contacting openai (gpt-4o) to propose a plan…',
    );
    expect(stripAnsi(contactingProviderLine('openai', ''))).toBe(
      '  · Contacting openai (no model) to propose a plan…',
    );
  });

  it('renders the provider proposal failure hint', () => {
    expect(stripAnsi(providerProposalFailedHint())).toContain('PAYWAY_AGENT_API_KEY');
    expect(stripAnsi(providerProposalFailedHint())).toContain('agent doctor');
  });

  it('builds a no-op printer for non-TTY and skips the propose phase for TTY', () => {
    const lines: string[] = [];
    const printer = createProgressPrinter({ tty: false, write: (l) => lines.push(l) });
    printer({ phase: 'validate' });
    expect(lines).toEqual([]);

    const ttyPrinter = createProgressPrinter({ tty: true, write: (l) => lines.push(l) });
    ttyPrinter({ phase: 'propose' });
    expect(lines).toEqual([]);
    ttyPrinter({ phase: 'validate' });
    expect(lines).toHaveLength(1);
    expect(stripAnsi(lines[0])).toBe('  · Validating plan…');
  });
});
