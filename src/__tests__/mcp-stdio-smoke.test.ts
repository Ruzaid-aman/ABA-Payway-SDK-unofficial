/**
 * Real-transport stdio smoke: spawns the built CLI (`payway-sdk mcp`), speaks
 * newline-delimited MCP JSON-RPC over its stdin/stdout, and proves the
 * initialize handshake + tools/list work on a real Windows pipe — not just
 * the in-memory pair. Requires `npm run build` first.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

interface JsonRpcMessage {
  id?: number;
  result?: Record<string, unknown>;
}

function exchange(frames: unknown[]): Promise<{ responses: JsonRpcMessage[]; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distCliPath(), 'mcp'], {
      cwd: tempDir,
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        APPDATA: tempDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const responses: JsonRpcMessage[] = [];
    let stderr = '';
    let buffer = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`mcp stdio did not answer in time; got: ${responses.length} responses; stderr: ${stderr.slice(0, 400)}`));
      // 20s: the full suite runs many workers; a cold dist spawn under load
      // can exceed a tighter budget (observed 8s flake).
    }, 20_000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) responses.push(JSON.parse(line) as JsonRpcMessage);
        index = buffer.indexOf('\n');
      }
      if (responses.length >= 2) {
        // initialize + tools/list answer; the initialized notification never gets a response.
        clearTimeout(timeout);
        child.kill();
        resolve({ responses, stderr });
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

describe('mcp stdio smoke (dist, real transport)', () => {
  it('answers initialize and tools/list over a real pipe', async () => {
    const { responses } = await exchange([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ]);

    const init = responses.find((r) => r.id === 1);
    const serverInfo = (init?.result as { serverInfo?: { name?: string; version?: string } } | undefined)?.serverInfo;
    expect(serverInfo?.name).toBe('payway-sdk');

    const tools = responses.find((r) => r.id === 2);
    const list = (tools?.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? [];
    expect(list).toHaveLength(12);
    expect(list.map((t) => t.name)).toContain('list_transactions');
    expect(list.map((t) => t.name)).not.toContain('create_payment_link');
  }, 15_000);
});
