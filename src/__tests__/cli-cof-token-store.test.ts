/**
 * In-process coverage for the local CoF token-store CLI surface:
 *  - `cof token list` (offline read; masking; --json; ctid filter)
 *  - `cof charge` without --token resolves the latest captured pwt for
 *    --ctid from the store (and fails validation when neither is given).
 *
 * Follows cli-webhook-commands.test.ts conventions (temp cwd + runCli).
 * Charge runs against a local loopback receiver standing in for the gateway
 * (runCli has no fetch seam), asserting the resolved pwt reached the wire.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';
import { saveLinkedToken } from '../webhook/token-store.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-cof-tokens-'));
const originalCwd = process.cwd();
const originalAppData = process.env.APPDATA;
const originalApiKey = process.env.PAYWAY_API_KEY;
const originalMerchantId = process.env.PAYWAY_MERCHANT_ID;
const originalBaseUrl = process.env.PAYWAY_BASE_URL;

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  process.env.APPDATA = path.join(tempDir, 'appdata-isolated');
  process.env.PAYWAY_API_KEY = 'test-key';
  process.env.PAYWAY_MERCHANT_ID = 'test-merchant';
  // Point the client at the local receiver started per-test below.
  process.env.PAYWAY_BASE_URL = 'http://127.0.0.1:9/placeholder';
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore('APPDATA', originalAppData);
  restore('PAYWAY_API_KEY', originalApiKey);
  restore('PAYWAY_MERCHANT_ID', originalMerchantId);
  restore('PAYWAY_BASE_URL', originalBaseUrl);
  rmSync(tempDir, { recursive: true, force: true });
});

async function run(argv: string[]): Promise<{ text: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { text: captured.text(), exitCode: process.exitCode };
  } finally {
    captured.restore();
    process.exitCode = before;
  }
}

describe('cof token list (local store)', () => {
  it('reports an empty store with a hint', async () => {
    const { text } = await run(['cof', 'token', 'list']);
    expect(text).toContain('No captured tokens');
  });

  it('lists captured tokens masked by default and in full with --show-token', async () => {
    saveLinkedToken({ ctid: 'custlist1', pwt: 'pwt-abcd1234wxyz' }, path.join(tempDir, 'payway-data'));
    const masked = await run(['cof', 'token', 'list']);
    expect(masked.text).toContain('custlist1');
    expect(masked.text).toContain('pwt-…wxyz');
    expect(masked.text).not.toContain('pwt-abcd1234wxyz');

    const revealed = await run(['cof', 'token', 'list', '--show-token']);
    expect(revealed.text).toContain('pwt-abcd1234wxyz');
  });

  it('--json prints one JSON document with the token array', async () => {
    const { text } = await run(['cof', 'token', 'list', '--json']);
    const parsed = JSON.parse(text) as { tokens: Array<{ ctid: string; pwt: string }> };
    expect(Array.isArray(parsed.tokens)).toBe(true);
    expect(parsed.tokens.some((t) => t.ctid === 'custlist1')).toBe(true);
  });
});

describe('cof charge token resolution', () => {
  it('fails validation when neither --token nor --ctid is given', async () => {
    const { text, exitCode } = await run(['cof', 'charge', '-t', 'ord-1', '-a', '1.00']);
    expect(text).toContain('Provide --token');
    expect(exitCode).not.toBe(0);
  });

  it('fails with a helpful message when the store has no token for the ctid', async () => {
    const { text, exitCode } = await run(['cof', 'charge', '-t', 'ord-1', '-a', '1.00', '--ctid', 'nosuchcust']);
    expect(text).toContain('No captured token');
    expect(exitCode).not.toBe(0);
  });

  it('resolves the latest captured pwt for --ctid and sends it as the pwt field', async () => {
    saveLinkedToken({ ctid: 'custcharge1', pwt: 'pwt-old-token' }, path.join(tempDir, 'payway-data'));
    saveLinkedToken({ ctid: 'custcharge1', pwt: 'pwt-new-token' }, path.join(tempDir, 'payway-data'));

    let capturedBody = '';
    const srv = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        capturedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: { code: '00', message: 'Success' }, data: { tran_id: 'ord-1' } }));
      });
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'charge', '-t', 'ord-resolve', '-a', '2.50', '--ctid', 'custcharge1',
      ]);
      expect(text).toContain('Using captured token');
      expect(text).toContain('pwt-…oken');
      expect(text).not.toContain('pwt-new-token');
      expect([0, undefined]).toContain(exitCode);
      expect(capturedBody).toContain('pwt-new-token');
    } finally {
      srv.close();
    }
  });
});
