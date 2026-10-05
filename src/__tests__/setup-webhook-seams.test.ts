/**
 * Seam coverage for the `setup-webhook` command (2026-08-30 testability
 * refactor). The command accepts {@link SetupWebhookDeps} so tests drive
 * prompts (PassThrough input), tunnel, storage, server, .env writes, signal
 * handlers and exit in-process — no real TTY, network or cloudflared.
 *
 * Complements the pure-helper suite (`setup-webhook-helpers.test.ts`).
 */
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSetupWebhook, type SetupWebhookDeps } from '../cli/commands/setup-webhook.js';
import type { WebhookStorage } from '../webhook/storage.js';

const temporaryDirectories: string[] = [];

function tempEnvFile(initial?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'setup-webhook-'));
  temporaryDirectories.push(dir);
  const file = path.join(dir, '.env');
  if (initial !== undefined) writeFileSync(file, initial, 'utf-8');
  return file;
}

function makeFakeStorage(): WebhookStorage {
  return {
    save: vi.fn(),
    getAll: vi.fn(() => []),
    count: vi.fn(() => 0),
    close: vi.fn(),
  } as unknown as WebhookStorage;
}

function makeFakeServer() {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    port: 8443,
    host: '127.0.0.1',
    forwardStats: null,
    isRunning: false,
  };
}

interface Harness {
  exitSpy: ReturnType<typeof vi.fn>;
  storage: WebhookStorage;
  server: ReturnType<typeof makeFakeServer>;
  state: { serverOptions: import('../webhook/server.js').WebhookServerOptions | null };
  signalHandlers: Map<string, () => void>;
  deps: SetupWebhookDeps;
  run: (opts: Parameters<typeof runSetupWebhook>[0], extra?: Partial<SetupWebhookDeps>) => Promise<void>;
}

function makeHarness(envFile: string, input?: PassThrough): Harness {
  const exitSpy = vi.fn();
  const storage = makeFakeStorage();
  const server = makeFakeServer();
  const state = { serverOptions: null as import('../webhook/server.js').WebhookServerOptions | null };
  const signalHandlers = new Map<string, () => void>();
  const passThrough = input ?? new PassThrough();
  passThrough.resume();

  const deps: SetupWebhookDeps = {
    input: passThrough,
    output: new PassThrough(),
    log: () => {},
    storageFactory: async () => storage,
    serverFactory: (_storage, opts) => {
      state.serverOptions = opts ?? null;
      return server;
    },
    probeWebhook: async () => ({ acknowledged: true, id: 'wh_test_probe' }),
    envFile,
    exit: exitSpy,
    registerSignal: (signal, handler) => signalHandlers.set(signal, handler),
  };

  const run = async (opts: Parameters<typeof runSetupWebhook>[0], extra?: Partial<SetupWebhookDeps>) =>
    runSetupWebhook(opts, { ...deps, ...extra });

  return { exitSpy, storage, server, state, signalHandlers, deps, run };
}

async function feed(input: PassThrough, lines: string[]): Promise<void> {
  for (const line of lines) {
    input.write(`${line}\n`);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

describe('setup-webhook command seams', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of temporaryDirectories.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an invalid port before any IO or service wiring', async () => {
    const h = makeHarness(tempEnvFile(''));
    await h.run({ port: '70000' });
    expect(h.exitSpy).toHaveBeenCalledWith(1);
    expect(h.server.start).not.toHaveBeenCalled();
  });

  it('defaults to port 8443 and the local-only interactive path when nothing is passed', async () => {
    const input = new PassThrough();
    input.resume();
    const h = makeHarness(tempEnvFile(''), input);
    const runPromise = h.run({});
    await feed(input, ['n', 'n']); // no URL, no tunnel → local-only
    await runPromise;

    expect(h.state.serverOptions?.port).toBe(8443);
    expect(h.server.start).toHaveBeenCalledTimes(1);
    expect(h.exitSpy).not.toHaveBeenCalled();
  });

  it('--url mode: skips prompts, persists the callback URL, starts the server', async () => {
    const envFile = tempEnvFile('EXISTING=1\n');
    const h = makeHarness(envFile);
    vi.stubEnv('PAYWAY_API_KEY', 'test-key');

    await h.run({ url: 'https://example.ngrok.app', storage: 'json' });

    const content = readFileSync(envFile, 'utf-8');
    expect(content).toContain('EXISTING=1');
    expect(content).toContain('PAYWAY_CALLBACK_URL=https://example.ngrok.app/aba-payway-webhook');
    // WP02/WP07: the receiver now carries control identity + explicit loopback bind.
    const options = h.state.serverOptions as Record<string, unknown>;
    expect(options.port).toBe(8443);
    expect(options.apiKey).toBe('test-key');
    expect(options.host).toBe('127.0.0.1');
    const control = options.control as { instanceId: string; controlToken: string; onShutdown: () => unknown };
    expect(control.instanceId).toBeTruthy();
    expect(control.controlToken).toBeTruthy();
    expect(typeof control.onShutdown).toBe('function');
    expect(h.server.start).toHaveBeenCalledTimes(1);
    expect(h.exitSpy).not.toHaveBeenCalled();
  });

  it('wire-up includes the API key so TD-09 verdict mode is available to the server', async () => {
    const h = makeHarness(tempEnvFile(''));
    vi.stubEnv('PAYWAY_API_KEY', 'verdict-key');
    await h.run({ url: 'https://example.com' });
    expect(h.state.serverOptions?.apiKey).toBe('verdict-key');
  });

  it('--forward-to mode: passes the forwarder URL (and headers) to the server factory', async () => {
    const h = makeHarness(tempEnvFile(''));
    await h.run({
      url: 'https://example.com',
      forwardTo: 'http://localhost:3000/webhooks/aba',
      forwardHeaders: 'X-Custom: yes',
    });

    expect(h.state.serverOptions?.forwardTo).toBe('http://localhost:3000/webhooks/aba');
    expect(h.state.serverOptions?.forwardHeaders).toBe('X-Custom: yes');
    expect(h.server.start).toHaveBeenCalledTimes(1);
    expect(h.exitSpy).not.toHaveBeenCalled();
  });

  it('without --forward-to the server options carry no forwarder keys (unchanged default contract)', async () => {
    const h = makeHarness(tempEnvFile(''));
    await h.run({ url: 'https://example.com' });
    expect(h.state.serverOptions?.forwardTo).toBeUndefined();
    expect(h.state.serverOptions?.forwardHeaders).toBeUndefined();
  });

  it('interactive local-only mode: declining URL and tunnel starts a localhost server', async () => {
    const input = new PassThrough();
    input.resume();
    const h = makeHarness(tempEnvFile(''), input);
    const runPromise = h.run({});
    await feed(input, ['n', 'n']);
    await runPromise;

    expect(h.exitSpy).not.toHaveBeenCalled();
    expect(h.state.serverOptions?.port).toBe(8443);
    expect(h.server.start).toHaveBeenCalledTimes(1);
  });

  it('interactive tunnel mode with missing cloudflared exits 1 with the install hint', async () => {
    const input = new PassThrough();
    input.resume();
    const h = makeHarness(tempEnvFile(''), input);
    const runPromise = h.run({}, { findCloudflared: async () => null });
    await feed(input, ['n', 'y']);
    await runPromise;

    expect(h.exitSpy).toHaveBeenCalledWith(1);
    expect(h.server.start).not.toHaveBeenCalled();
  });

  it('interactive tunnel mode: starts tunnel, upserts URL, and SIGINT restores the previous value', async () => {
    const envFile = tempEnvFile('PAYWAY_CALLBACK_URL=https://old.example.com/cb\n');
    const input = new PassThrough();
    input.resume();
    const h = makeHarness(envFile, input);
    const tunnelStop = vi.fn(async () => {});
    const fakeTunnel = {
      start: vi.fn(async () => 'https://random-tunnel.trycloudflare.com'),
      stop: tunnelStop,
      isRunning: true,
    };

    const runPromise = h.run(
      {},
      {
        findCloudflared: async () => '/usr/bin/cloudflared',
        createTunnel: () => fakeTunnel,
      },
    );
    await feed(input, ['n', 'y']);
    await runPromise;

    // Tunnel URL was persisted.
    let content = readFileSync(envFile, 'utf-8');
    expect(content).toContain('PAYWAY_CALLBACK_URL=https://random-tunnel.trycloudflare.com/aba-payway-webhook');
    expect(h.server.start).toHaveBeenCalledTimes(1);

    // Graceful shutdown restores the original callback URL.
    const handler = h.signalHandlers.get('SIGINT');
    expect(handler).toBeDefined();
    handler?.();
    await vi.waitFor(() => expect(h.exitSpy).toHaveBeenCalledWith(0));

    content = readFileSync(envFile, 'utf-8');
    expect(content).toContain('PAYWAY_CALLBACK_URL=https://old.example.com/cb');
    expect(fakeTunnel.stop).toHaveBeenCalledTimes(1);
    expect(h.server.stop).toHaveBeenCalledTimes(1);
    expect(h.storage.close).toHaveBeenCalledTimes(1);
  });

  it('--url mode SIGINT removes the callback line when there was no previous value', async () => {
    const envFile = tempEnvFile('A=1\n');
    const h = makeHarness(envFile);
    await h.run({ url: 'https://example.com' });

    const handler = h.signalHandlers.get('SIGTERM');
    expect(handler).toBeDefined();
    handler?.();
    await vi.waitFor(() => expect(h.exitSpy).toHaveBeenCalledWith(0));

    const content = readFileSync(envFile, 'utf-8');
    expect(content).not.toContain('PAYWAY_CALLBACK_URL');
    expect(content).toContain('A=1');
  });

  it('server start failure closes storage and exits 1', async () => {
    const h = makeHarness(tempEnvFile(''));
    h.server.start.mockRejectedValueOnce(new Error('EADDRINUSE'));
    await h.run({ url: 'https://example.com' });
    expect(h.exitSpy).toHaveBeenCalledWith(1);
    expect(h.storage.close).toHaveBeenCalledTimes(1);
  });
});
