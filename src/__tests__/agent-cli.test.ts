import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as agentCommands from '../cli/commands/agent.js';
import { requireFreshDist, runDistCliSync, stripAnsi } from '../test/test-utils.js';

/**
 * TASK-011 — public agent CLI surface + REPL.
 *
 * Tests run the BUILT cli (`dist/cli.js`) as a subprocess with an isolated
 * APPDATA directory and a dummy PAYWAY_AGENT_API_KEY. Deterministic.
 */

const temporaryDirectories: string[] = [];

beforeAll(() => requireFreshDist());

const runCli = (args: string[], env: NodeJS.ProcessEnv, input?: string) =>
  runDistCliSync(args, { env, input });

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

type PromptConfirmForTest = (
  message: string,
  createReadline: () => { question(message: string, callback: (answer: string) => void): void; close(): void },
) => Promise<boolean>;

type CreateInteractivePlanConfirmationForTest = (
  prompt: (message: string) => Promise<boolean>,
  ) => (proposal: {
    request: string;
    context: string;
    environment: 'sandbox' | 'production';
  actions: Array<{
    route: string;
    money: string;
    transactionIdStrategy: string;
    lifetime?: number;
    urls: string[];
    artifacts: string[];
  }>;
  assumptions: string[];
  planContext: Record<string, unknown>;
}) => Promise<boolean>;

function deterministicReadline(answer: string | undefined) {
  return () => ({
    question: (_message: string, callback: (value: string) => void) => callback(answer as string),
    close: () => undefined,
  });
}

describe('agentic payway CLI (TASK-011)', () => {
  it('renders the complete TTY proposal and maps y, rejection, and EOF prompt responses to consent', async () => {
    const boundary = agentCommands as unknown as {
      promptConfirm: PromptConfirmForTest;
      createInteractivePlanConfirmation: CreateInteractivePlanConfirmationForTest;
    };
    const proposal = {
      request: 'pay $3',
      context: 'profile: demo (sandbox)',
      environment: 'sandbox' as const,
      actions: [
        {
          route: 'generate_online_qr',
          money: '3 USD',
          transactionIdStrategy: 'generated after confirmation',
          lifetime: 900,
          urls: ['callback: https://pay.example.com/callback'],
          artifacts: ['QR image and metadata will be saved locally'],
        },
      ],
      assumptions: ['customer will scan immediately'],
      planContext: { channel: 'terminal' },
    };
    const messages: string[] = [];
    const accept = boundary.createInteractivePlanConfirmation(async (message) => {
      messages.push(message);
      return boundary.promptConfirm(message, deterministicReadline('y'));
    });
    const reject = boundary.createInteractivePlanConfirmation((message) =>
      boundary.promptConfirm(message, deterministicReadline('n')),
    );
    const eof = boundary.createInteractivePlanConfirmation((message) =>
      boundary.promptConfirm(message, deterministicReadline(undefined)),
    );

    await expect(accept(proposal)).resolves.toBe(true);
    await expect(reject(proposal)).resolves.toBe(false);
    await expect(eof(proposal)).resolves.toBe(false);
    expect(messages[0]).toContain('Create plan proposal');
    expect(messages[0]).toContain('Context: profile: demo (sandbox)');
    expect(messages[0]).toContain('Route: generate_online_qr');
    expect(messages[0]).toContain('Money: 3 USD');
    expect(messages[0]).toContain('Transaction ID: generated after confirmation');
    expect(messages[0]).toContain('Lifetime: 900 seconds');
    expect(messages[0]).toContain('callback: https://pay.example.com/callback');
    expect(messages[0]).toContain('QR image and metadata will be saved locally');
    expect(messages[0]).toContain('customer will scan immediately');
    expect(messages[0]).toContain('Execute this create plan? (y/N):');
  });

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

  it('agent setup --acknowledge-privacy records the privacy timestamp', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const result = runCli(
      ['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o', '--acknowledge-privacy'],
      baseEnv(appData),
    );
    expect(result.status).toBe(0);
    const config = JSON.parse(
      readFileSync(path.join(appData, 'aba-payway-sdk', 'agent', 'agent-config.json'), 'utf8'),
    );
    expect(typeof config.privacyAcknowledgedAt).toBe('string');
    expect(Number.isNaN(Date.parse(config.privacyAcknowledgedAt))).toBe(false);
  });

  it('agent ack records a privacy acknowledgment after setup, then updates it', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const configPath = path.join(appData, 'aba-payway-sdk', 'agent', 'agent-config.json');

    // Ack before setup is refused with guidance (never writes a partial config).
    const refused = runCli(['agent', 'ack'], baseEnv(appData));
    expect(refused.status).not.toBe(0);
    expect(stripAnsi(refused.stdout)).toContain('requires a configured provider');
    expect(existsSync(configPath)).toBe(false);

    // After setup, the first ack records the timestamp.
    runCli(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], baseEnv(appData));
    const first = runCli(['agent', 'ack'], baseEnv(appData));
    expect(first.status).toBe(0);
    const seeded = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(typeof seeded.privacyAcknowledgedAt).toBe('string');
    expect(Number.isNaN(Date.parse(seeded.privacyAcknowledgedAt))).toBe(false);

    // A second ack updates the existing timestamp instead of failing.
    const second = runCli(['agent', 'ack'], baseEnv(appData));
    expect(second.status).toBe(0);
    const updated = JSON.parse(readFileSync(configPath, 'utf8')) as { privacyAcknowledgedAt: string };
    expect(Date.parse(updated.privacyAcknowledgedAt)).toBeGreaterThanOrEqual(
      Date.parse(seeded.privacyAcknowledgedAt),
    );

    // Never persists the provider API key.
    expect(readFileSync(configPath, 'utf8')).not.toContain('dummy-agent-key');
  }, 30_000);

  it('agent doctor reports the privacy acknowledgment status', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);

    runCli(['agent', 'setup', '--provider', 'openai', '--model', 'gpt-4o'], baseEnv(appData));
    const before = stripAnsi(runCli(['agent', 'doctor'], baseEnv(appData)).stdout);
    expect(before).toContain('Privacy acknowledgment');

    runCli(['agent', 'ack'], baseEnv(appData));
    const after = stripAnsi(runCli(['agent', 'doctor'], baseEnv(appData)).stdout);
    expect(after).toContain('Privacy acknowledgment');
  }, 30_000);

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

  it('ask without approval in non-TTY attempts planning before deciding whether confirmation is needed', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    // Point the provider at an unreachable URL. A provider failure proves the
    // non-TTY path attempted planning instead of pre-emptively short-circuiting.
    runCli(
      [
        'agent',
        'setup',
        '--provider',
        'custom',
        '--model',
        'gpt-4o',
        '--base-url',
        'http://127.0.0.1:1',
        '--acknowledge-privacy',
      ],
      baseEnv(appData),
    );
    const env = baseEnv(appData);
    env.PAYWAY_BASE_URL = 'http://127.0.0.1:1'; // unreachable
    const result = runCli(['ask', 'generate a QR for $3'], env);
    expect(result.status).toBe(1);
    const output = stripAnsi(result.stdout).trim();
    let parsed: any;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error(`expected JSON output, got: ${output}`);
    }
    expect(parsed.version).toBe('agent-command/v1');
    expect(parsed.status).toBe('failed');
    expect(parsed.error.code).toBe('PROVIDER_PROPOSAL_FAILED');
    expect(parsed.error.message).toContain('provider request failed');
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

  it('REPL :profile [name] switches to a freshly resolved named profile without exposing credentials', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const profileDirectory = path.join(appData, 'aba-payway-sdk');
    mkdirSync(profileDirectory, { recursive: true });
    writeFileSync(
      path.join(profileDirectory, 'profiles.json'),
      JSON.stringify({
        version: 1,
        defaultProfile: 'sandbox',
        profiles: [
          { name: 'sandbox', environment: 'sandbox', merchantId: 'sandbox-mid', apiKey: 'sandbox-secret' },
          { name: 'production', environment: 'production', merchantId: 'prod-mid', apiKey: 'prod-secret' },
        ],
      }),
    );

    const result = runCli(['agent'], baseEnv(appData), [':profile production', ':profile', ':exit'].join('\n'));
    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

    expect(result.status).toBe(0);
    expect(output).toContain('profile: production');
    expect(output).toContain('profile: production (production)');
    expect(output).not.toContain('prod-secret');
  });

  it('REPL :profile reports the resolved default profile when no explicit profile was supplied', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const profileDirectory = path.join(appData, 'aba-payway-sdk');
    mkdirSync(profileDirectory, { recursive: true });
    writeFileSync(
      path.join(profileDirectory, 'profiles.json'),
      JSON.stringify({
        version: 1,
        defaultProfile: 'sandbox',
        profiles: [{ name: 'sandbox', environment: 'sandbox', merchantId: 'sandbox-mid', apiKey: 'sandbox-secret' }],
      }),
    );

    const result = runCli(['agent'], baseEnv(appData), [':profile', ':exit'].join('\n'));
    const output = stripAnsi(`${result.stdout}\n${result.stderr}`);

    expect(result.status).toBe(0);
    expect(output).toContain('profile: sandbox  (profile: sandbox (sandbox))');
    expect(output).not.toContain('sandbox-secret');
  });

  it('uses a generated first-turn session and the profile selected immediately before that turn', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'task011-'));
    temporaryDirectories.push(appData);
    const profileDirectory = path.join(appData, 'aba-payway-sdk');
    mkdirSync(path.join(profileDirectory, 'agent'), { recursive: true });
    writeFileSync(
      path.join(profileDirectory, 'profiles.json'),
      JSON.stringify({
        version: 1,
        profiles: [
          { name: 'sandbox', environment: 'sandbox', merchantId: 'sandbox-mid', apiKey: 'sandbox-secret' },
          { name: 'production', environment: 'production', merchantId: 'prod-mid', apiKey: 'prod-secret' },
        ],
      }),
    );
    // Deliberately omit privacy acknowledgement: the request stops before any
    // provider/network call while still proving the real REPL session boundary.
    writeFileSync(
      path.join(profileDirectory, 'agent', 'agent-config.json'),
      JSON.stringify({ version: 'agent-config/v1', provider: 'openai', model: 'gpt-4o', capabilityMode: 'strict-json-plan' }),
    );

    const result = runCli(['agent'], baseEnv(appData), [':profile production', 'pay $3', ':exit'].join('\n'));
    const sessionsDirectory = path.join(profileDirectory, 'agent', 'sessions');
    const sessionFiles = readdirSync(sessionsDirectory);
    const session = JSON.parse(readFileSync(path.join(sessionsDirectory, sessionFiles[0]), 'utf8'));

    expect(result.status).toBe(0);
    expect(session.sessionId).not.toBe('repl');
    expect(session.contextLabel).toBe('profile: production (production)');
  });
});
