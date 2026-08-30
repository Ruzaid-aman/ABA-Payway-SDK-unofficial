import { Command } from 'commander';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentDataPaths } from '../agent/storage.js';
import { runRepl, setAgentProgram } from '../agent/repl.js';
import { registerAgentCommands } from '../cli/commands/agent.js';
import { REPL_PROMPT } from '../agent/repl-helpers.js';

/**
 * In-process coverage for the agent command surface and the REPL loop.
 *
 * Unlike `agent-cli.test.ts` (which spawns the built `dist/cli.js`), these
 * tests register a fresh Commander program and invoke `parseAsync` directly,
 * with `APPDATA` pointed at a temp directory and console output captured.
 *
 * Network safety: every provider-touching path is exercised at the privacy
 * gate — `runOneShot` returns `blocked`/`PRIVACY_ACK_REQUIRED` before any
 * provider or PayWay call when the config lacks `privacyAcknowledgedAt`.
 */

const esc = String.fromCharCode(27);
const stripAnsi = (s: string): string => s.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '');

/** Current captured output with ANSI stripped — assertions run against this. */
const logsText = (): string => stripAnsi(logs.join('\n'));

const temporaryDirectories: string[] = [];
let appData: string;
let priorAppData: string | undefined;
let priorExitCode: typeof process.exitCode;
let logs: string[] = [];

function newAppData(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-inproc-'));
  temporaryDirectories.push(dir);
  process.env.APPDATA = dir;
  return dir;
}

function writeAgentConfig(config: Record<string, unknown>): void {
  const { configFile } = getAgentDataPaths(process.env.APPDATA);
  mkdirSync(path.dirname(configFile), { recursive: true });
  writeFileSync(configFile, JSON.stringify(config), 'utf8');
}

function writeProfiles(profiles: Array<Record<string, string>>, defaultProfile?: string): void {
  const dir = path.join(process.env.APPDATA as string, 'aba-payway-sdk');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'profiles.json'),
    JSON.stringify({ version: 1, ...(defaultProfile ? { defaultProfile } : {}), profiles }),
    'utf8',
  );
}

function jsonLog(): Record<string, unknown> | undefined {
  const line = logs.map((l) => l.trim()).find((l) => l.startsWith('{'));
  if (!line) return undefined;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function buildProgram(): Command {
  const program = new Command();
  registerAgentCommands(program);
  // Stand-ins for manual CLI commands so :run dispatch can be exercised
  // without the full command tree.
  program
    .command('echo-test')
    .option('--tag <t>')
    .action((opts: { tag?: string }) => {
      console.log(`echo-ran:${opts.tag ?? 'none'}`);
    });
  program.command('needs-opt').requiredOption('--req <v>').action(() => {});
  setAgentProgram(program);
  return program;
}

async function runReplCaptured(
  lines: string[],
  options: { interactive?: boolean; sessionId?: string } = {},
): Promise<{ output: string }> {
  const chunks: string[] = [];
  const output = new PassThrough();
  output.on('data', (d: Buffer) => chunks.push(d.toString('utf8')));
  const input = new PassThrough();
  input.end(`${lines.join('\n')}\n`);
  await runRepl({
    input: input as unknown as NodeJS.ReadableStream,
    output: output as unknown as NodeJS.WritableStream,
    interactive: options.interactive ?? false,
    sessionId: options.sessionId,
  });
  return { output: chunks.join('') };
}

beforeEach(() => {
  priorAppData = process.env.APPDATA;
  priorExitCode = process.exitCode;
  process.exitCode = undefined;
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  });
  // Commander reports CLI usage errors on stderr; keep test output clean.
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  appData = newAppData();
  void appData;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (priorAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = priorAppData;
  process.exitCode = priorExitCode;
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ask command (in-process)', () => {
  it('reports blocked with AGENT_NOT_CONFIGURED when unconfigured in non-TTY', async () => {
    const program = buildProgram();
    await program.parseAsync(['ask', 'generate a QR for $3'], { from: 'user' });

    const parsed = jsonLog();
    expect(parsed).toBeDefined();
    expect(parsed?.version).toBe('agent-command/v1');
    expect(parsed?.status).toBe('blocked');
    expect(parsed?.request).toBe('generate a QR for $3');
    expect((parsed?.error as { code?: string }).code).toBe('AGENT_NOT_CONFIGURED');
    expect(process.exitCode).toBe(1);
  });

  it('blocks at the privacy gate before any provider call when the config lacks acknowledgment', async () => {
    writeAgentConfig({
      version: 'agent-config/v1',
      provider: 'openai',
      model: 'gpt-4o',
      capabilityMode: 'strict-json-plan',
    });
    const program = buildProgram();
    await program.parseAsync(['ask', 'pay $3', '--provider-timeout', '1234'], { from: 'user' });

    const parsed = jsonLog();
    expect(parsed?.status).toBe('blocked');
    expect((parsed?.error as { code?: string }).code).toBe('PRIVACY_ACK_REQUIRED');
    expect(process.exitCode).toBe(1);
  });
});

describe('agent setup / ack / doctor (in-process)', () => {
  it('setup writes the config; invalid options fail without writing', async () => {
    const program = buildProgram();
    await program.parseAsync(['agent', 'setup', '--provider', 'nope'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(logsText()).toContain("Invalid --provider 'nope'.");
    expect(existsSync(getAgentDataPaths(process.env.APPDATA).configFile)).toBe(false);

    process.exitCode = undefined;
    logs = [];
    await program.parseAsync(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();
    expect(logsText()).toContain('Agent provider configured');
    const config = JSON.parse(readFileSync(getAgentDataPaths(process.env.APPDATA).configFile, 'utf8'));
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o');
    expect(JSON.stringify(config)).not.toContain('apiKey');
  });

  it('ack is refused before setup, records after setup, then updates', async () => {
    const program = buildProgram();
    await program.parseAsync(['agent', 'ack'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(logsText()).toContain('requires a configured provider');
    expect(existsSync(getAgentDataPaths(process.env.APPDATA).configFile)).toBe(false);

    process.exitCode = undefined;
    logs = [];
    await program.parseAsync(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], { from: 'user' });
    await program.parseAsync(['agent', 'ack'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();
    expect(logsText()).toContain('Privacy acknowledged');

    const first = JSON.parse(readFileSync(getAgentDataPaths(process.env.APPDATA).configFile, 'utf8'));
    logs = [];
    await program.parseAsync(['agent', 'ack'], { from: 'user' });
    expect(logsText()).toContain('Privacy acknowledgment updated.');
    const second = JSON.parse(readFileSync(getAgentDataPaths(process.env.APPDATA).configFile, 'utf8'));
    expect(Date.parse(second.privacyAcknowledgedAt)).toBeGreaterThanOrEqual(Date.parse(first.privacyAcknowledgedAt));
  });

  it('doctor renders the capability matrix with an unverified provider when unconfigured', async () => {
    const program = buildProgram();
    await program.parseAsync(['agent', 'doctor'], { from: 'user' });
    const text = stripAnsi(logsText());
    expect(text).toContain('Agent Capability Matrix');
    expect(text).toContain('· unverified  Provider connectivity (agent not configured)');
    expect(text).toContain('Privacy acknowledgment');
    expect(text).not.toContain('payway-sdk onboard'); // no config → no hint
    expect(process.exitCode).toBeUndefined();
  });
});

describe('agent sessions commands (in-process)', () => {
  it('list shows the empty state, export fails for a missing id, clear requires approval', async () => {
    const program = buildProgram();
    await program.parseAsync(['agent', 'sessions', 'list'], { from: 'user' });
    expect(logsText()).toContain('No agent sessions found.');

    process.exitCode = undefined;
    logs = [];
    const outFile = path.join(appData, 'export-attempt.json');
    await program.parseAsync(['agent', 'sessions', 'export', 'does-not-exist', '--output', outFile], {
      from: 'user',
    });
    expect(process.exitCode).toBe(1);
    expect(logsText()).toContain('Session not found: does-not-exist');
    expect(existsSync(outFile)).toBe(false);

    process.exitCode = undefined;
    logs = [];
    await program.parseAsync(['agent', 'sessions', 'clear', 'all'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(logsText()).toContain('Refusing to clear sessions without --approve');

    process.exitCode = undefined;
    logs = [];
    await program.parseAsync(['agent', 'sessions', 'clear', 'all', '--approve'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();
    expect(logsText()).toContain('Cleared session(s): all');
  });
});

describe('REPL (in-process via runRepl with injected streams)', () => {
  it('handles help, history, unknown directives, and bare :run', async () => {
    buildProgram();
    await runReplCaptured([':help', ':history', ':bogus', ':run', ':exit']);
    const text = logsText();
    expect(text).toContain('REPL directives');
    expect(text).toContain('1. :help');
    expect(text).toContain('Unknown directive: :bogus (try :help)');
    expect(text).toContain("Unknown directive: :run (try :help)");
    expect(text).toContain('Goodbye.');
  });

  it('dispatches recognized commands and contains an unexpected process.exit', async () => {
    buildProgram();
    await runReplCaptured([':run echo-test --tag x', ':run needs-opt', ':run rm -rf /', ':exit']);
    const text = logsText();
    expect(text).toContain('Running: payway-sdk echo-test --tag x');
    expect(text).toContain('echo-ran:x');
    expect(text).toContain('Running: payway-sdk needs-opt');
    // The needs-opt commander failure must not have terminated the REPL:
    // the next lines were still processed and the REPL said goodbye.
    expect(text).toContain("Rejected: 'rm'");
    expect(text).toContain('Goodbye.');
  });

  it('rejects agent-management commands and unrecognized commands', async () => {
    buildProgram();
    await runReplCaptured([':run agent doctor', ':run no-such-cmd', ':exit']);
    const text = logsText();
    expect(text).toContain(
      "Rejected: 'agent' is not a dispatchable PayWay command (agent-management commands are blocked)",
    );
    expect(text).toContain(
      "Rejected: 'no-such-cmd' is not a dispatchable PayWay command (agent-management commands are blocked)",
    );
  });

  it('reports an unconfigured agent for free-form requests', async () => {
    buildProgram();
    await runReplCaptured(['pay $3', ':exit']);
    expect(logsText()).toContain('Agent is not configured.');
  });

  it('runs a free-form turn that blocks at the privacy gate and keeps the session', async () => {
    writeAgentConfig({
      version: 'agent-config/v1',
      provider: 'openai',
      model: 'gpt-4o',
      capabilityMode: 'strict-json-plan',
    });
    buildProgram();
    await runReplCaptured(['pay $3', ':session', ':exit']);

    const parsed = jsonLog();
    expect(parsed?.status).toBe('blocked');
    expect((parsed?.error as { code?: string }).code).toBe('PRIVACY_ACK_REQUIRED');
    const sessionId = parsed?.sessionId as string;
    expect(sessionId).toBeTruthy();

    const sessionLine = logs.find((l) => l.includes('session:'));
    expect(sessionLine).toContain(sessionId);
    const { sessionsDir } = getAgentDataPaths(process.env.APPDATA);
    expect(existsSync(path.join(sessionsDir, `${sessionId}.json`))).toBe(true);
  });

  it('switches to a named profile without exposing credentials', async () => {
    writeProfiles(
      [
        { name: 'sandbox', environment: 'sandbox', merchantId: 'sandbox-mid', apiKey: 'sandbox-secret' },
        { name: 'production', environment: 'production', merchantId: 'prod-mid', apiKey: 'prod-secret' },
      ],
      'sandbox',
    );
    buildProgram();
    await runReplCaptured([':profile production', ':profile', ':exit']);
    const text = logsText();
    expect(text).toContain('profile: production');
    expect(text).toContain('(production)');
    expect(text).not.toContain('prod-secret');
  });

  it('refuses a :profile switch to an unknown profile name', async () => {
    buildProgram();
    await runReplCaptured([':profile missing', ':exit']);
    expect(logsText()).toContain("Profile 'missing' does not exist.");
  });

  it('creates a session on demand with :session', async () => {
    buildProgram();
    await runReplCaptured([':session', ':exit']);
    const line = logs.find((l) => l.includes('session:')) ?? '';
    const sessionId = stripAnsi(line).replace(/.*session:\s*/, '').trim();
    expect(sessionId).toMatch(/^[0-9a-f-]{10,}$/i);
    const { sessionsDir } = getAgentDataPaths(process.env.APPDATA);
    expect(existsSync(path.join(sessionsDir, `${sessionId}.json`))).toBe(true);
  });

  it('writes prompts to the output stream and honors :clear in interactive mode', async () => {
    writeAgentConfig({
      version: 'agent-config/v1',
      provider: 'openai',
      model: 'gpt-4o',
      capabilityMode: 'strict-json-plan',
    });
    buildProgram();
    const { output } = await runReplCaptured([':clear', ':help', ':exit'], { interactive: true });
    expect(output).toContain(REPL_PROMPT);
    expect(output).toContain('\x1b[2J\x1b[3J\x1b[H');
    expect(logsText()).toContain('REPL directives');
    expect(logsText()).not.toContain('non-interactive: reading directives from stdin');
  });

  it('leaves no stray process.exitCode after a dispatched command failed', async () => {
    const program = buildProgram();
    process.exitCode = 0;
    await runReplCaptured([':run needs-opt', ':exit']);
    // dispatch() restores the pre-dispatch exitCode (0 here).
    expect(process.exitCode).toBe(0);
    void program;
  });
});
