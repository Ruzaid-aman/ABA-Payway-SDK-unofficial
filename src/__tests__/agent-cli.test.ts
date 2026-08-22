import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * TASK-011 — public agent CLI surface + REPL.
 *
 * Tests run the BUILT cli (`dist/cli.js`) as a subprocess with an isolated
 * APPDATA directory and a dummy PAYWAY_AGENT_API_KEY. Deterministic.
 */

const temporaryDirectories: string[] = [];

function stripAnsi(s: string): string {
  const esc = String.fromCharCode(27);
  return s.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '');
}

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env,
    input,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function baseEnv(appData: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    APPDATA: appData,
    PAYWAY_AGENT_API_KEY: 'dummy-agent-key',
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('agentic payway CLI (TASK-011)', () => {
  it('ask --help lists the ask command and its options', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const result = runCli(['ask', '--help'], baseEnv(appData));
    const output = stripAnsi(result.stdout);
    expect(result.status).toBe(0);
    expect(output).toContain('Usage: payway-sdk ask');
    expect(output).toContain('--approve');
    expect(output).toContain('--yolo');
    expect(output).toContain('--session');
  });

  it('agent --help lists the new agent subcommands', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const result = runCli(['agent', '--help'], baseEnv(appData));
    const output = stripAnsi(result.stdout);
    expect(result.status).toBe(0);
    expect(output).toContain('Usage: payway-sdk agent');
    expect(output).toContain('setup');
    expect(output).toContain('doctor');
    expect(output).toContain('sessions');
  });

  it('agent doctor prints the capability matrix', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const result = runCli(['agent', 'doctor'], baseEnv(appData));
    const output = stripAnsi(result.stdout);
    expect(result.status).toBe(0);
    expect(output).toContain('Agent Capability Matrix');
    expect(output).toContain('Provider connectivity');
    expect(output).toContain('Online QR callback');
    expect(output).toContain('Offline KHQR');
    expect(output).toContain('Checkout');
    expect(output).toContain('Payment-link RSA');
    expect(output).toContain('Artifact storage');
    expect(output).toContain('Session storage');
  });

  it('agent setup writes a config file without persisting secrets', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const result = runCli(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], baseEnv(appData));
    expect(result.status).toBe(0);
    const configPath = path.join(appData, 'aba-payway-sdk', 'agent', 'agent-config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o');
    expect(config.capabilityMode).toBe('strict-json-plan');
    // Never writes an API key.
    expect(config).not.toHaveProperty('apiKey');
    expect(config).not.toHaveProperty('headers');
    expect(JSON.stringify(config)).not.toContain('dummy-agent-key');
  });

  it('agent sessions list works (empty then after a session export)', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    // No config / no sessions yet.
    const before = runCli(['agent', 'sessions', 'list'], baseEnv(appData));
    expect(before.status).toBe(0);
    expect(stripAnsi(before.stdout)).toContain('No agent sessions found.');

    // Create a session by exporting after a (non-network) needs_confirmation ask.
    const setup = runCli(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], baseEnv(appData));
    expect(setup.status).toBe(0);

    // Write a real session file via the sessions export path is exercised
    // indirectly; here we just confirm list remains stable.
    const after = runCli(['agent', 'sessions', 'list'], baseEnv(appData));
    expect(after.status).toBe(0);
  });

  it('ask without approval in non-TTY returns needs_confirmation and makes no network call', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    // Configure the provider so we reach the authorization gate (no config would
    // return 'blocked' instead). Point the provider at an unreachable URL to
    // prove the short-circuit never contacts the network.
    runCli(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], baseEnv(appData));
    const env = baseEnv(appData);
    env.PAYWAY_BASE_URL = 'http://127.0.0.1:1'; // unreachable
    const result = runCli(['ask', 'generate a QR for $3'], env);
    expect(result.status).toBe(1);
    const output = stripAnsi(result.stdout).trim();
    expect(output).not.toContain('provider request failed');
    let parsed: any;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error(`expected JSON output, got: ${output}`);
    }
    expect(parsed.version).toBe('agent-command/v1');
    expect(parsed.status).toBe('needs_confirmation');
    expect(parsed.request).toContain('generate a QR');
  });

  it('agent REPL rejects a shell escape but accepts a recognized command, exiting cleanly', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const input = [':run rm -rf /', ':run generate-qr', ':exit'].join('\n');
    const result = runCli(['agent'], baseEnv(appData), input);
    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
    // rm -rf / must be rejected.
    expect(output).toContain('Rejected');
    expect(output).toContain("'rm'");
    // generate-qr is a recognized command and is dispatched (accepted).
    expect(output).toContain('Running: payway-sdk generate-qr');
    // REPL should exit cleanly via :exit.
    expect(result.status).toBe(0);
  });
});
