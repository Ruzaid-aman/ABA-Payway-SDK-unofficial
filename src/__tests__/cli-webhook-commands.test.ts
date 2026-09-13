/**
 * In-process coverage for the `payway-sdk webhook` command group (P0 Wave 1:
 * W-4 verify-callback, W-3 resend, W-2 trigger, plus list).
 *
 * Drives the exported runCli(argv) in a temp cwd (matching
 * cli-inprocess.test.ts conventions). Storage is exercised against the
 * real JSON store; network seams come from the fetchImpl dep — but runCli
 * has no dep injection, so resend/trigger HTTP is asserted via a local
 * receiver server (real loopback HTTP, no external network).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureConsole } from '../test/test-utils.js';
import { signCallbackBody } from '../auth.js';
import { resolveWebhookDir } from '../config/data-root.js';

const tempDir = mkdtempSync(path.join(tmpdir(), 'payway-cli-webhook-'));
const originalCwd = process.cwd();
const originalAppData = process.env.APPDATA;

let runCli: (argv: string[]) => Promise<void>;

beforeAll(async () => {
  process.chdir(tempDir);
  // Isolate the global profile store (EC-14: ambient profiles activate per
  // command and would otherwise inject a real PAYWAY_API_KEY into this suite).
  process.env.APPDATA = path.join(tempDir, 'appdata-isolated');
  ({ runCli } = await import('../cli.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  if (originalAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = originalAppData;
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

function startReceiver(captured: { body: string; headers: Record<string, string | string[] | undefined> }[]): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        captured.push({ body: Buffer.concat(chunks).toString('utf-8'), headers: req.headers });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"received":true}');
      });
    });
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        resolve({ port: addr.port, close: () => new Promise<void>((done) => srv.close(() => done())) });
      }
    });
  });
}

/** Write two captured records into the CLI's JSONL store and return their ids. */
function seedCaptures(): string[] {
  const dir = resolveWebhookDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'callbacks.jsonl');
  const records = [
    {
      id: 'wh_seed1',
      receivedAt: '2026-09-08T00:00:00.000Z',
      headers: { 'x-payway-hmac-sha512': 'seed-sig-1' },
      body: JSON.stringify({ tran_id: 'seed-1', status: 'APPROVED' }),
      sourceIp: '127.0.0.1',
      matchedTransactionId: 'seed-1',
      matchedStatus: 'APPROVED',
      signatureVerdict: 'verified',
    },
    {
      id: 'wh_seed2',
      receivedAt: '2026-09-08T00:00:01.000Z',
      headers: {},
      body: JSON.stringify({ tran_id: 'seed-2', status: 0, merchant_ref_no: 'mref-2' }),
      matchedTransactionId: 'seed-2',
      matchedStatus: '0',
      paymentLinkPushback: { parsed: { tranId: 'seed-2', status: 'APPROVED', merchantRefNo: 'mref-2' } },
    },
  ];
  writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf-8');
  return ['wh_seed1', 'wh_seed2'];
}

describe('webhook verify-callback (W-4)', () => {
  it('confirms a valid signature (exit 0) and prints the verdict', async () => {
    process.env.PAYWAY_API_KEY = 'cli-key-1';
    const body = { tran_id: 'vc-1', status: 'APPROVED', amount: '10.00' };
    const sig = signCallbackBody(body, 'cli-key-1');
    const { text, exitCode } = await run(['webhook', 'verify-callback', '--body', JSON.stringify(body), '--sig', sig]);
    expect(exitCode).toBeUndefined();
    expect(text).toContain('VALID');
    expect(text).toContain('vc-1');
    delete process.env.PAYWAY_API_KEY;
  });

  it('rejects an invalid signature with exit 1 and the failure reason', async () => {
    process.env.PAYWAY_API_KEY = 'cli-key-1';
    const body = { tran_id: 'vc-2', status: 'APPROVED' };
    const { text, exitCode } = await run(['webhook', 'verify-callback', '--body', JSON.stringify(body), '--sig', 'bogus-signature']);
    expect(exitCode).toBe(1);
    expect(text).toContain('INVALID');
    expect(text).toContain('signature_mismatch');
    delete process.env.PAYWAY_API_KEY;
  });

  it('emits the machine envelope under --json (branchable, no ANSI coupling)', async () => {
    process.env.PAYWAY_API_KEY = 'cli-key-1';
    const body = { tran_id: 'vc-3', status: 'DECLINED' };
    const sig = signCallbackBody(body, 'cli-key-1');
    const { text, exitCode } = await run(['webhook', 'verify-callback', '--body', JSON.stringify(body), '--sig', sig, '--json']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stripJson(text)) as { valid: boolean; reason: string | null; tranId: string };
    expect(parsed).toEqual({ valid: true, reason: null, tranId: 'vc-3' });
    delete process.env.PAYWAY_API_KEY;
  });

  it('requires --sig and reports validation errors under --json', async () => {
    process.env.PAYWAY_API_KEY = 'cli-key-1';
    const { text, exitCode } = await run(['webhook', 'verify-callback', '--body', '{}', '--json']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stripJson(text)) as { error: { kind: string; exitCode: number } };
    expect(parsed.error.kind).toBe('validation');
    expect(parsed.error.exitCode).toBe(1);
    delete process.env.PAYWAY_API_KEY;
  });

  it('reports the persisted verdict of a captured record by id', async () => {
    const [id] = seedCaptures();
    const { text, exitCode } = await run(['webhook', 'verify-callback', '--record', id]);
    expect(exitCode).toBeUndefined();
    expect(text).toContain('verified');
    expect(text).toContain('seed-1');
  });

  it('reports an invalid stored verdict with exit 1', async () => {
    const dir = resolveWebhookDir();
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'callbacks.jsonl');
    writeFileSync(
      file,
      `${JSON.stringify({ id: 'wh_bad', receivedAt: '2026-09-08T00:00:02.000Z', headers: {}, body: '{}', signatureVerdict: 'invalid', verificationReason: 'signature_mismatch' })}\n`,
      'utf-8',
    );
    const { text, exitCode } = await run(['webhook', 'verify-callback', '--record', 'wh_bad']);
    expect(exitCode).toBe(1);
    expect(text).toContain('signature_mismatch');
  });

  it('fails cleanly for an unknown record id', async () => {
    seedCaptures();
    const { exitCode } = await run(['webhook', 'verify-callback', '--record', 'wh_nope']);
    expect(exitCode).toBe(1);
  });
});

describe('webhook list', () => {
  it('prints captured records with their ids', async () => {
    seedCaptures();
    const { text, exitCode } = await run(['webhook', 'list']);
    expect(exitCode).toBeUndefined();
    expect(text).toContain('wh_seed1');
    expect(text).toContain('wh_seed2');
  });

  it('emits a machine envelope under --json', async () => {
    seedCaptures();
    const { text, exitCode } = await run(['webhook', 'list', '--json']);
    expect(exitCode).toBeUndefined();
    const parsed = JSON.parse(stripJson(text)) as { count: number; records: Array<{ id: string }> };
    expect(parsed.count).toBe(2);
    expect(parsed.records.map((record) => record.id).sort()).toEqual(['wh_seed1', 'wh_seed2']);
  });
});

describe('webhook resend (W-3)', () => {
  it('re-POSTs a captured record (body + signature header) to the target', async () => {
    const [id] = seedCaptures();
    const captured: Array<{ body: string; headers: Record<string, string | string[] | undefined> }> = [];
    const receiver = await startReceiver(captured);
    try {
      const { text, exitCode } = await run(['webhook', 'resend', '--record', id, '--to', `http://127.0.0.1:${receiver.port}/cb`]);
      expect(exitCode).toBeUndefined();
      expect(text).toContain('delivered');
      expect(captured.length).toBe(1);
      expect(JSON.parse(captured[0].body)).toEqual({ tran_id: 'seed-1', status: 'APPROVED' });
      expect(captured[0].headers['x-payway-hmac-sha512']).toBe('seed-sig-1');
    } finally {
      await receiver.close();
    }
  });

  it('emits the machine envelope under --json', async () => {
    const [id] = seedCaptures();
    const captured: Array<{ body: string; headers: Record<string, string | string[] | undefined> }> = [];
    const receiver = await startReceiver(captured);
    try {
      const { text, exitCode } = await run(['webhook', 'resend', '--record', id, '--to', `http://127.0.0.1:${receiver.port}/cb`, '--json']);
      expect(exitCode).toBeUndefined();
      const parsed = JSON.parse(stripJson(text)) as { record: string; httpStatus: number; ok: boolean };
      expect(parsed.record).toBe(id);
      expect(parsed.ok).toBe(true);
      expect(parsed.httpStatus).toBe(200);
    } finally {
      await receiver.close();
    }
  });

  it('exits 1 for an unknown record id', async () => {
    const { exitCode } = await run(['webhook', 'resend', '--record', 'wh_missing', '--to', 'http://127.0.0.1:1/x']);
    expect(exitCode).toBe(1);
  });

  it('exits 3 when the target is unreachable (network kind)', async () => {
    seedCaptures();
    // Nothing listens on this port.
    const { text, exitCode } = await run(['webhook', 'resend', '--record', 'wh_seed1', '--to', 'http://127.0.0.1:9/x', '--json']);
    expect(exitCode).toBe(3);
    const parsed = JSON.parse(stripJson(text)) as { error: { kind: string; exitCode: number } };
    expect(parsed.error.kind).toBe('network');
  });
});

describe('webhook trigger (W-2)', () => {
  it('sends a signed payment.approved fixture the SDK verifier accepts', async () => {
    process.env.PAYWAY_API_KEY = 'cli-key-1';
    const captured: Array<{ body: string; headers: Record<string, string | string[] | undefined> }> = [];
    const receiver = await startReceiver(captured);
    try {
      const { text, exitCode } = await run(['webhook', 'trigger', '--url', `http://127.0.0.1:${receiver.port}/cb`, '--event', 'payment.approved', '-t', 'trg-1']);
      expect(exitCode).toBeUndefined();
      expect(text).toContain('signed');
      expect(captured.length).toBe(1);
      const body = JSON.parse(captured[0].body) as Record<string, unknown>;
      expect(body.tran_id).toBe('trg-1');
      const sig = captured[0].headers['x-payway-hmac-sha512'];
      expect(typeof sig).toBe('string');
      // The receiver-accepted signature must verify against the same key.
      const { verifyCallbackDetailed } = await import('../auth.js');
      expect(verifyCallbackDetailed(body, String(sig), 'cli-key-1', { stripHash: true })).toEqual({ valid: true });
    } finally {
      await receiver.close();
      delete process.env.PAYWAY_API_KEY;
    }
  });

  it('sends the no-hash payment-link.pushback fixture (status numeric 0)', async () => {
    const captured: Array<{ body: string; headers: Record<string, string | string[] | undefined> }> = [];
    const receiver = await startReceiver(captured);
    try {
      const { text, exitCode } = await run([
        'webhook',
        'trigger',
        '--url',
        `http://127.0.0.1:${receiver.port}/pl`,
        '--event',
        'payment-link.pushback',
        '-t',
        'trg-pl-1',
      ]);
      expect(exitCode).toBeUndefined();
      expect(text).toContain('no hash');
      expect(JSON.parse(captured[0].body)).toEqual({ tran_id: 'trg-pl-1', status: 0, merchant_ref_no: 'trg-pl-1' });
      expect(captured[0].headers['x-payway-hmac-sha512']).toBeUndefined();
    } finally {
      await receiver.close();
    }
  });

  it('rejects an unknown event with exit 1', async () => {
    const { text, exitCode } = await run(['webhook', 'trigger', '--url', 'http://127.0.0.1:1/x', '--event', 'payment.exploded']);
    expect(exitCode).toBe(1);
    expect(text).toContain('Unknown fixture event');
  });

  it('requires the API key for signed online fixtures (validation error, exit 1)', async () => {
    const { text, exitCode } = await run(['webhook', 'trigger', '--url', 'http://127.0.0.1:1/x', '--event', 'payment.approved', '--json']);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stripJson(text)) as { error: { kind: string } };
    expect(parsed.error.kind).toBe('validation');
  });
});

/** The CLI prints profile/diagnostic lines around the JSON under some envs; find the JSON document. */
function stripJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return text.slice(start, end + 1);
}
