/**
 * Pure-helper coverage for `setup-webhook-helpers.ts`: port validation,
 * webhook URL computation, PAYWAY_CALLBACK_URL upsert/restore semantics,
 * and the cloudflared install hint.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  cloudflaredMissingLines,
  computeWebhookUrl,
  formatPortBusyMessage,
  computeWebhookRouteUrls,
  restoreEnvCallbackUrl,
  upsertEnvCallbackUrl,
  validatePort,
} from '../cli/commands/setup-webhook-helpers.js';

describe('formatPortBusyMessage', () => {
  it('includes a scoped cleanup command for non-interactive runs', () => {
    expect(formatPortBusyMessage(8443, true)).toContain('Port 8443 is already in use');
    expect(formatPortBusyMessage(8443, true)).toContain('webhook stop');
  });
});

describe('computeWebhookRouteUrls', () => {
  it('normalizes a supplied callback URL before adding the three receiver routes', () => {
    expect(computeWebhookRouteUrls('https://tunnel.example/aba-payway-webhook')).toEqual({
      baseUrl: 'https://tunnel.example',
      online: 'https://tunnel.example/aba-payway-webhook',
      customerQr: 'https://tunnel.example/aba-payway-khqr-webhook',
      pushback: 'https://tunnel.example/aba-payway-pushback',
    });
  });
});

describe('probeWebhookUrl', () => {
  it('accepts only an acknowledged capture response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ acknowledged: true, id: 'wh_probe' }), { status: 200 })),
    );
    await expect(
      (await import('../cli/commands/setup-webhook-helpers.js')).probeWebhookUrl(
        'https://tunnel.example/aba-payway-khqr-webhook',
      ),
    ).resolves.toEqual({
      acknowledged: true,
      id: 'wh_probe',
    });
    vi.unstubAllGlobals();
  });
});

describe('validatePort', () => {
  it('defaults to 8443 when the flag is omitted or empty', () => {
    expect(validatePort()).toEqual({ ok: true, port: 8443 });
    expect(validatePort('')).toEqual({ ok: true, port: 8443 });
  });

  it('accepts finite integers within 1-65535', () => {
    expect(validatePort('8443')).toEqual({ ok: true, port: 8443 });
    expect(validatePort('1')).toEqual({ ok: true, port: 1 });
    expect(validatePort('65535')).toEqual({ ok: true, port: 65535 });
  });

  it('rejects out-of-range, non-integer and non-numeric values', () => {
    expect(validatePort('0').ok).toBe(false);
    expect(validatePort('-1').ok).toBe(false);
    expect(validatePort('70000').ok).toBe(false);
    expect(validatePort('8443.5').ok).toBe(false);
    expect(validatePort('abc').ok).toBe(false);
    expect(validatePort('NaN').ok).toBe(false);
  });

  it('includes the offending input in the failure message', () => {
    expect(validatePort('99999')).toMatchObject({ ok: false, message: expect.stringContaining('99999') });
  });
});

describe('computeWebhookUrl', () => {
  it('joins the public URL with the webhook path', () => {
    expect(computeWebhookUrl('https://tun.example.com', 9000)).toBe('https://tun.example.com/aba-payway-webhook');
  });

  it('falls back to localhost when no public URL exists', () => {
    expect(computeWebhookUrl(null, 8443)).toBe('http://localhost:8443/aba-payway-webhook');
  });
});

describe('upsertEnvCallbackUrl', () => {
  const readFile = (content: string | null) => () => content;
  const writeFile = () => {};

  it('creates the line when the file has no callback entry', () => {
    const result = upsertEnvCallbackUrl(readFile('A=1\nB=2\n'), writeFile, '/tmp/.env', 'https://x.test/cb');
    expect(result).toEqual({ previous: null });
  });

  it('creates the line when the file does not exist', () => {
    const result = upsertEnvCallbackUrl(readFile(null), writeFile, '/tmp/.env', 'https://x.test/cb');
    expect(result).toEqual({ previous: null });
  });

  it('replaces an existing different value and reports it as previous', () => {
    const writes: string[] = [];
    const result = upsertEnvCallbackUrl(
      readFile('PAYWAY_CALLBACK_URL=https://old.test\n'),
      (_p, content) => writes.push(content),
      '/tmp/.env',
      'https://new.test/cb',
    );
    expect(result.previous).toBe('https://old.test');
    expect(writes[0]).toBe('PAYWAY_CALLBACK_URL=https://new.test/cb\n');
  });

  it('keeps the value when it already matches (idempotent, no previous)', () => {
    const result = upsertEnvCallbackUrl(
      readFile('PAYWAY_CALLBACK_URL=https://same.test/cb\n'),
      writeFile,
      '/tmp/.env',
      'https://same.test/cb',
    );
    expect(result.previous).toBeNull();
  });

  it('replaces the callback line and normalizes CRLF joins to LF (historical behavior)', () => {
    const writes: string[] = [];
    upsertEnvCallbackUrl(
      readFile('A=B=C\r\nPAYWAY_CALLBACK_URL=https://old.test\r\nD=4\r\n'),
      (_p, content) => writes.push(content),
      '/tmp/.env',
      'https://new.test',
    );
    expect(writes[0]).toBe('A=B=C\nPAYWAY_CALLBACK_URL=https://new.test\nD=4\n');
  });
});

describe('restoreEnvCallbackUrl', () => {
  function makeIo(initial: string | null) {
    let content = initial;
    return {
      readFile: () => content,
      writeFile: (_p: string, next: string) => {
        content = next;
      },
      content: () => content,
    };
  }

  it('restores the previous value in place', () => {
    const io = makeIo('A=1\nPAYWAY_CALLBACK_URL=https://tun.test\nB=2\n');
    expect(restoreEnvCallbackUrl(io.readFile, io.writeFile, '/tmp/.env', 'https://old.test')).toBe('restored');
    expect(io.content()).toBe('A=1\nPAYWAY_CALLBACK_URL=https://old.test\nB=2\n');
  });

  it('appends the previous value when our line vanished', () => {
    const io = makeIo('A=1\n');
    expect(restoreEnvCallbackUrl(io.readFile, io.writeFile, '/tmp/.env', 'https://old.test')).toBe('restored');
    // The empty trailing element from the split is preserved (historical behavior).
    expect(io.content()).toBe('A=1\n\nPAYWAY_CALLBACK_URL=https://old.test');
  });

  it('removes our line when there was no previous value', () => {
    const io = makeIo('A=1\nPAYWAY_CALLBACK_URL=https://tun.test\n');
    expect(restoreEnvCallbackUrl(io.readFile, io.writeFile, '/tmp/.env', null)).toBe('removed');
    expect(io.content()).toBe('A=1\n');
  });

  it('is a no-op when the file is gone or the line is absent', () => {
    const missing = makeIo(null);
    expect(restoreEnvCallbackUrl(missing.readFile, missing.writeFile, '/tmp/.env', 'x')).toBe('no-op');
    const noLine = makeIo('A=1\n');
    expect(restoreEnvCallbackUrl(noLine.readFile, noLine.writeFile, '/tmp/.env', null)).toBe('no-op');
  });
});

describe('cloudflaredMissingLines', () => {
  it('documents the install path and the --url alternative', () => {
    const lines = cloudflaredMissingLines();
    expect(lines.some((l) => l.includes('cloudflared not found'))).toBe(true);
    expect(lines.some((l) => l.includes('developers.cloudflare.com'))).toBe(true);
    expect(lines.some((l) => l.includes('--url'))).toBe(true);
  });
});
