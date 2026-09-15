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
import { loadLinkedTokens, saveLinkedToken } from '../webhook/token-store.js';

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

async function run(argv: string[]): Promise<{ text: string; stdout: string; exitCode: typeof process.exitCode }> {
  const captured = captureConsole();
  const before = process.exitCode;
  try {
    await runCli(argv);
    return { text: captured.text(), stdout: captured.stdout(), exitCode: process.exitCode };
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
    saveLinkedToken({ ctid: 'custlist1', pwt: 'pwt-abcd1234wxyz' });
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

  it('cof token renew restarts the local expiry window on gateway success', async () => {
    saveLinkedToken({ ctid: 'custren1', pwt: 'pwt-renew-token', tokenFlag: 'CITI_FLEX' });
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '00', message: 'Success' } }));
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'token', 'renew', '-r', 'reqren1', '-c', 'custren1', '--token', 'pwt-renew-token',
      ]);
      expect(text).toContain('Token renew requested');
      expect(text).toContain('expiry window restarted');
      const record = loadLinkedTokens().find((t) => t.pwt === 'pwt-renew-token');
      expect(record?.renewedAt).toBeTruthy();
      expect(record?.tokenFlag).toBe('CITI_FLEX');
      expect([0, undefined]).toContain(exitCode);
    } finally {
      srv.close();
    }
  });

  it('cof charge --ctid refuses a locally-expired token without a gateway call', async () => {
    const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    saveLinkedToken({ ctid: 'custdead', pwt: 'pwt-dead', capturedAt: iso(95) });

    // NO receiver started: any gateway attempt would fail with a network error,
    // so a validation exit + message proves the local guard fired first.
    const { text, exitCode } = await run([
      'cof', 'charge', '-t', 'ord-dead', '-a', '1.00', '--ctid', 'custdead',
    ]);
    expect(text).toContain('expired');
    expect(text).toContain('docs/09: ~90-day validity');
    expect(text).toContain('charge with an explicit --token');
    expect(exitCode).toBe(1);
  });

  it('cof charge --ctid warns on an expiring-soon token and still charges', async () => {
    const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    saveLinkedToken({ ctid: 'custsoon', pwt: 'pwt-soon-charge', capturedAt: iso(85) });

    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '00', message: 'Success' }, data: { tran_id: 'ord-soon' } }));
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'charge', '-t', 'ord-soon', '-a', '1.00', '--ctid', 'custsoon',
      ]);
      expect(text).toContain('expiring in');
      expect(text).toContain('renew soon');
      expect([0, undefined]).toContain(exitCode);
    } finally {
      srv.close();
    }
  });

  it('cof token remove prunes the local store on gateway success', async () => {
    saveLinkedToken({ ctid: 'custrm1', pwt: 'pwt-remove-me' });
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '00', message: 'Success' } }));
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'token', 'remove', '-c', 'custrm1', '--token', 'pwt-remove-me',
      ]);
      expect(text).toContain('Token removed');
      expect(text).toContain('removed 1 captured token');
      expect(loadLinkedTokens().find((t) => t.pwt === 'pwt-remove-me')).toBeUndefined();
      expect([0, undefined]).toContain(exitCode);
    } finally {
      srv.close();
    }
  });

  it('cof token remove keeps the local copy when the gateway rejects', async () => {
    saveLinkedToken({ ctid: 'custrm2', pwt: 'pwt-keep-me' });
    const srv = http.createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '99', message: 'Rejected' } }));
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { exitCode } = await run([
        'cof', 'token', 'remove', '-c', 'custrm2', '--token', 'pwt-keep-me',
      ]);
      expect(exitCode).not.toBe(0);
      expect(loadLinkedTokens().find((t) => t.pwt === 'pwt-keep-me')).toBeDefined();
    } finally {
      srv.close();
    }
  });

  it('cof token list shows expiry state (human + json)', async () => {
    const now = Date.now();
    const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
    saveLinkedToken({ ctid: 'exp1', pwt: 'pwt-fresh-token', capturedAt: iso(1) });
    saveLinkedToken({ ctid: 'exp2', pwt: 'pwt-soon-token', capturedAt: iso(85) });
    saveLinkedToken({ ctid: 'exp3', pwt: 'pwt-dead-token', capturedAt: iso(91) });

    const { text } = await run(['cof', 'token', 'list']);
    expect(text).toContain('✓ valid (');
    expect(text).toContain('⚠ expiring soon (');
    expect(text).toContain('✗ EXPIRED (');
    expect(text).toContain('renew with: cof token renew');

    const { stdout } = await run(['cof', 'token', 'list', '--json']);
    const doc = JSON.parse(stdout) as { tokens: Array<{ ctid: string; expiry: { status: string; daysLeft: number | null } }> };
    const byCtid = Object.fromEntries(doc.tokens.map((t) => [t.ctid, t]));
    expect(byCtid.exp1?.expiry.status).toBe('valid');
    expect(byCtid.exp2?.expiry.status).toBe('expiring-soon');
    expect(byCtid.exp3?.expiry.status).toBe('expired');
  });

  it('resolves the latest captured pwt for --ctid and sends it as the pwt field', async () => {
    saveLinkedToken({ ctid: 'custcharge1', pwt: 'pwt-old-token' });
    saveLinkedToken({ ctid: 'custcharge1', pwt: 'pwt-new-token' });

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

describe('cof link-account QR presentation', () => {
  it('saves the linking QR PNG and prints deeplink + expiry guidance (human mode)', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: { code: '00', message: 'Success' },
          data: { qr_string: '00020101-link-qr-payload', deeplink: 'abamobilebank://ababank.com?type=payway&qrcode=00020101-link-qr-payload' },
        }),
      );
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'link-account', '-r', 'qrtest001', '-c', 'qrcycle01', '-f', 'CITI_FLEX', '--currency', 'USD', '-y',
      ]);
      expect(text).toContain('Account link requested');
      expect(text).toContain('QR PNG:');
      expect(text).toContain('cof-link-account-qrtest001.png');
      expect(text).toContain('Deeplink:');
      expect(text).toContain('abamobilebank://');
      expect(text).toContain('10 min');
      expect([0, undefined]).toContain(exitCode);
      // The PNG actually landed on disk.
      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(tempDir, 'payway-output', 'cof-link-account-qrtest001.png'))).toBe(true);
    } finally {
      srv.close();
    }
  });

  it('--json envelope gains qrPngPath (and still one JSON document)', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: { code: '00', message: 'Success' },
          data: { qr_string: '00020101-json-qr-payload', deeplink: 'abamobilebank://ababank.com?type=payway&qrcode=x' },
        }),
      );
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { stdout, exitCode } = await run([
        'cof', 'link-account', '-r', 'qrtest002', '-c', 'qrcycle01', '-f', 'CITI_FLEX', '--currency', 'USD', '-y', '--json',
      ]);
      const doc = JSON.parse(stdout) as { status?: { code?: string }; data?: { qr_string?: string }; qrPngPath?: string };
      expect(doc.status?.code).toBe('00');
      expect(doc.qrPngPath).toContain('cof-link-account-qrtest002.png');
      expect([0, undefined]).toContain(exitCode);
    } finally {
      srv.close();
    }
  });

  it('handles a response without qr_string without crashing (blocked-profile shape)', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '00', message: 'Success' }, data: {} }));
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'link-account', '-r', 'qrtest003', '-c', 'qrcycle01', '-f', 'CITI_FLEX', '--currency', 'USD', '-y',
      ]);
      expect(text).toContain('Account link requested');
      expect(text).not.toContain('QR PNG:');
      expect([0, undefined]).toContain(exitCode);
    } finally {
      srv.close();
    }
  });

  it('renders the expire_in epoch as a wall-clock deadline (§26 AOF-5)', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: { code: '00', message: 'Success' },
          data: { qr_string: '00020101-expiry-qr', expire_in: Math.floor(Date.now() / 1000) + 600 },
        }),
      );
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text } = await run([
        'cof', 'link-account', '-r', 'qrtest004', '-c', 'qrcycle01', '-f', 'CITI_FLEX', '--currency', 'USD', '-y',
      ]);
      expect(text).toContain('expires 20');
      expect(text).toContain('~10 min left');
    } finally {
      srv.close();
    }
  });
});

describe('cof charge approval-QR presentation (defensive, §26)', () => {
  it('renders + saves a QR when the live charge response carries qr_string', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: { code: '00', message: 'Success', tran_id: 'ord-qr1' },
          data: { qr_string: '00020101-charge-approval-qr' },
        }),
      );
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { text, exitCode } = await run([
        'cof', 'charge', '-t', 'ord-qr1', '-a', '1.00', '--token', 'pwt-qr-charge', '--no-open-image',
      ]);
      expect(text).toContain('COF charge submitted');
      expect(text).toContain('Approval QR:');
      expect(text).toContain('cof-charge-ord-qr1.png');
      expect([0, undefined]).toContain(exitCode);
      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(tempDir, 'payway-output', 'cof-charge-ord-qr1.png'))).toBe(true);
    } finally {
      srv.close();
    }
  });

  it('--json gains qrPngPath only when the response carries a QR', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '00', message: 'Success', tran_id: 'ord-qr2' } }));
    });
    const port = await new Promise<number>((resolve) => {
      srv.listen(0, '127.0.0.1', () => resolve((srv.address() as { port: number }).port));
    });
    process.env.PAYWAY_BASE_URL = `http://127.0.0.1:${port}`;

    try {
      const { stdout } = await run([
        'cof', 'charge', '-t', 'ord-qr2', '-a', '1.00', '--token', 'pwt-qr-charge', '--json',
      ]);
      const doc = JSON.parse(stdout) as { qrPngPath?: string };
      expect(doc.qrPngPath).toBeUndefined();
    } finally {
      srv.close();
    }
  });
});
