/**
 * Real-transport stdio smoke: spawns the built CLI (`payway-sdk mcp`), speaks
 * newline-delimited MCP JSON-RPC over its stdin/stdout, and proves the
 * initialize handshake + tools/list work on a real Windows pipe — not just
 * the in-memory pair. Requires `npm run build` first.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { distCliPath } from '../test/test-utils.js';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'payway-mcp-stdio-'));
});

afterAll(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Windows can hold the dir briefly after child.kill() — a leftover temp
    // dir is harmless; never fail the suite over cleanup.
  }
});

/** Writes a profile store into the isolated APPDATA the child will read. */
function writeProfileStore(appData: string, store: unknown): void {
  mkdirSync(path.join(appData, 'aba-payway-sdk'), { recursive: true });
  writeFileSync(path.join(appData, 'aba-payway-sdk', 'profiles.json'), JSON.stringify(store), 'utf8');
}

const SAVED_PROFILE_STORE = {
  version: 1,
  defaultProfile: 'audit-profile',
  profiles: [{ name: 'audit-profile', environment: 'sandbox', merchantId: 'stub-merchant', apiKey: 'stub-key' }],
};

interface JsonRpcMessage {
  id?: number;
  result?: Record<string, unknown>;
}

function exchange(
  frames: unknown[],
  options: { appData?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; responses: JsonRpcMessage[]; stderr: string }> {
  return new Promise((resolve, reject) => {
    const appData = options.appData ?? tempDir;
    const child = spawn(process.execPath, [distCliPath(), 'mcp'], {
      cwd: tempDir,
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        APPDATA: appData,
        ...options.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const responses: JsonRpcMessage[] = [];
    let stdout = '';
    let stderr = '';
    let buffer = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `mcp stdio did not answer in time; got: ${responses.length} responses; stderr: ${stderr.slice(0, 400)}`,
        ),
      );
      // 20s: the full suite runs many workers; a cold dist spawn under load
      // can exceed a tighter budget (observed 8s flake).
    }, 20_000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          try {
            responses.push(JSON.parse(line) as JsonRpcMessage);
          } catch {
            // Audit S03 acceptance: EVERY stdout line must be protocol
            // content. A human notice here (e.g. "Using profile: …") is a
            // regression, so fail with the offending line visible.
            clearTimeout(timeout);
            child.kill();
            reject(new Error(`MCP stdout carried non-protocol content: ${JSON.stringify(line).slice(0, 200)}`));
            return;
          }
        }
        index = buffer.indexOf('\n');
      }
      if (responses.length >= 2) {
        // initialize + tools/list answer; the initialized notification never gets a response.
        clearTimeout(timeout);
        child.kill();
        resolve({ stdout, responses, stderr });
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.stdin.write(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(''));
    child.stdin.end();
  });
}

const HANDSHAKE = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.1' } },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
];

describe('mcp stdio smoke (dist, real transport)', () => {
  it('answers initialize and tools/list over a real pipe', async () => {
    const { responses } = await exchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.1' } },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]);

    const init = responses.find((r) => r.id === 1);
    const serverInfo = (init?.result as { serverInfo?: { name?: string; version?: string } } | undefined)?.serverInfo;
    expect(serverInfo?.name).toBe('payway-sdk');
    // Audit S09: the server version must be the built package's version —
    // never a hardcoded number that drifts from package.json.
    const packageVersion = (
      JSON.parse(readFileSync(path.join(distCliPath(), '..', '..', 'package.json'), 'utf8')) as { version: string }
    ).version;
    expect(serverInfo?.version).toBe(packageVersion);

    const tools = responses.find((r) => r.id === 2);
    const list = (tools?.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? [];
    expect(list).toHaveLength(12);
    expect(list.map((t) => t.name)).toContain('list_transactions');
    expect(list.map((t) => t.name)).not.toContain('create_payment_link');
  }, 15_000);

  it('keeps stdout protocol-pure with a saved default profile (S03)', async () => {
    // Regression for audit S03: with a saved default profile, the pre-action
    // hook printed "Using profile: …" on stdout BEFORE the JSON-RPC response,
    // corrupting the stream. The mcp command no longer goes through that
    // hook — it resolves credentials per tool call instead.
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-mcp-stdio-profile-'));
    try {
      writeProfileStore(appData, SAVED_PROFILE_STORE);
      const { responses, stderr } = await exchange(HANDSHAKE, { appData });
      expect(stderr).not.toContain('Using profile');
      const init = responses.find((r) => r.id === 1);
      expect((init?.result as { serverInfo?: { name?: string } } | undefined)?.serverInfo?.name).toBe('payway-sdk');
    } finally {
      rmSync(appData, { recursive: true, force: true });
    }
  }, 15_000);

  it('starts cleanly when the selected profile does not exist (S03)', async () => {
    // Previously the pre-action hook threw "Credential profile … does not
    // exist" and killed the server before the protocol started. The MCP
    // path must still come up; gateway tool calls resolve (and report)
    // their credential state per call.
    const { responses } = await exchange(HANDSHAKE, { env: { PAYWAY_PROFILE: 'ghost-profile' } });
    const init = responses.find((r) => r.id === 1);
    expect((init?.result as { serverInfo?: { name?: string } } | undefined)?.serverInfo?.name).toBe('payway-sdk');
  }, 15_000);

  it('starts cleanly with a malformed profile store (S03)', async () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'payway-mcp-stdio-badstore-'));
    try {
      writeProfileStore(appData, 'not-json-at-all');
      const { responses } = await exchange(HANDSHAKE, { appData });
      const init = responses.find((r) => r.id === 1);
      expect((init?.result as { serverInfo?: { name?: string } } | undefined)?.serverInfo?.name).toBe('payway-sdk');
    } finally {
      rmSync(appData, { recursive: true, force: true });
    }
  }, 15_000);
});
