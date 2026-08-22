import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as agentCommands from '../cli/commands/agent.js';

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'dist', 'cli.js'), ...args], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function providerServer(plan: Record<string, unknown>): Promise<{ baseUrl: string; paths: string[] }> {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? '');
    request.resume();
    response.setHeader('content-type', 'application/json');
    if (request.url === '/chat/completions') {
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(plan) } }] }));
      return;
    }
    response.end(JSON.stringify({ status: { code: '00' }, payment_status: 'APPROVED' }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('provider server did not bind a TCP port');
  return { baseUrl: `http://127.0.0.1:${address.port}`, paths };
}

function configuredEnv(appData: string, baseUrl: string): NodeJS.ProcessEnv {
  const agentDirectory = path.join(appData, 'aba-payway-sdk', 'agent');
  mkdirSync(agentDirectory, { recursive: true });
  writeFileSync(
    path.join(agentDirectory, 'agent-config.json'),
    JSON.stringify({
      version: 'agent-config/v1',
      provider: 'custom',
      baseUrl,
      model: 'r3-local',
      capabilityMode: 'strict-json-plan',
      privacyAcknowledgedAt: '2026-08-22T00:00:00.000Z',
    }),
  );
  return {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    APPDATA: appData,
    PAYWAY_AGENT_API_KEY: 'r3-provider-key',
    PAYWAY_MERCHANT_ID: 'r3-merchant',
    PAYWAY_API_KEY: 'r3-payway-key',
    PAYWAY_ENV: 'sandbox',
    PAYWAY_BASE_URL: baseUrl,
    PAYWAY_CALLBACK_URL: 'https://callbacks.payway.com/qr',
  };
}

describe('R3 interactive terminal policy', () => {
  it('treats console stdout with piped stdin as non-interactive', () => {
    const boundary = agentCommands as unknown as {
      isInteractiveTerminal?: (stdin: { isTTY?: boolean }, stdout: { isTTY?: boolean }) => boolean;
    };
    expect(boundary.isInteractiveTerminal?.({ isTTY: false }, { isTTY: true })).toBe(false);
    expect(boundary.isInteractiveTerminal?.({ isTTY: true }, { isTTY: true })).toBe(true);
  });

  it('requires the exact production phrase and does not accept y for production', async () => {
    const boundary = agentCommands as unknown as {
      createInteractivePlanConfirmation: (
        prompt: (message: string) => Promise<string | undefined>,
      ) => (proposal: Record<string, unknown>) => Promise<boolean>;
    };
    const proposal = {
      request: 'pay $3',
      context: 'profile: r3 (production)',
      environment: 'production',
      actions: [],
      assumptions: [],
      planContext: {},
    };
    const messages: string[] = [];
    const y = boundary.createInteractivePlanConfirmation(async (message) => {
      messages.push(message);
      return 'y';
    });
    const phrase = boundary.createInteractivePlanConfirmation(async () => 'CONFIRM PRODUCTION');

    await expect(y(proposal)).resolves.toBe(false);
    await expect(phrase(proposal)).resolves.toBe(true);
    expect(messages[0]).toContain('Type CONFIRM PRODUCTION');
  });
});

describe('R3 non-TTY ask policy', () => {
  it('plans and executes a read-only ask without an approval flag', async () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-r3-cli-'));
    temporaryDirectories.push(appData);
    const plan = {
      version: 'agent-plan/v1',
      request: 'check TX-READ-1',
      actions: [{ tool: 'check_transaction', transactionId: 'TX-READ-1' }],
    };
    const { baseUrl, paths } = await providerServer(plan);

    const result = await runCli(['ask', 'check TX-READ-1'], configuredEnv(appData, baseUrl));
    const parsed = JSON.parse(result.stdout.trim());

    expect(result.status).toBe(0);
    expect(parsed.status).toBe('succeeded');
    expect(parsed.actions).toMatchObject([{ tool: 'check_transaction', ok: true }]);
    expect(paths.filter((entry) => entry === '/chat/completions')).toHaveLength(1);
    expect(paths.length).toBe(2);
  }, 15_000);

  it('plans a create ask but returns needs_confirmation without calling PayWay', async () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-r3-cli-'));
    temporaryDirectories.push(appData);
    const plan = {
      version: 'agent-plan/v1',
      request: 'pay $3',
      actions: [
        {
          tool: 'generate_online_qr',
          amount: 3,
          currency: 'USD',
          transactionId: null,
          callbackUrl: 'https://callbacks.payway.com/qr',
        },
      ],
    };
    const { baseUrl, paths } = await providerServer(plan);

    const result = await runCli(['ask', 'pay $3'], configuredEnv(appData, baseUrl));
    const parsed = JSON.parse(result.stdout.trim());

    expect(parsed.status).toBe('needs_confirmation');
    expect(paths).toEqual(['/chat/completions']);
  }, 15_000);
});
