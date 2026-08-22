import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrubSensitive } from '../agent/privacy.js';
import {
  appendSessionEvent,
  buildDeterministicSummary,
  clearSessions,
  createSession,
  exportSession,
  listSessions,
  loadSession,
} from '../agent/sessions.js';
import { getAgentDataPaths } from '../agent/storage.js';

const { fsState } = vi.hoisted(() => ({ fsState: { failRename: false } }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: vi.fn((...args: Parameters<typeof actual.renameSync>) => {
      if (fsState.failRename) throw new Error('simulated rename failure');
      return actual.renameSync(...args);
    }),
  };
});

const temporaryDirectories: string[] = [];
const originalAppData = process.env.APPDATA;

beforeEach(() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-agent-session-'));
  temporaryDirectories.push(directory);
  process.env.APPDATA = directory;
});

afterEach(() => {
  process.env.APPDATA = originalAppData;
  fsState.failRename = false;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('scrubSensitive', () => {
  it('redacts canary API keys matched by secret key name', () => {
    const input = { apiKey: 'AKIA-1234567890-canary', name: 'ok' };
    const result = scrubSensitive(input, []) as Record<string, unknown>;
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.name).toBe('ok');
  });

  it('redacts PEM private keys stored under a privateKey field', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqhki\n-----END PRIVATE KEY-----';
    const input = { privateKey: pem, note: 'keep' };
    const result = scrubSensitive(input, []) as Record<string, unknown>;
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.note).toBe('keep');
  });

  it('redacts authorization header values', () => {
    const input = { authorization: 'Bearer sk_live_canary_token_123', other: 1 };
    const result = scrubSensitive(input, []) as Record<string, unknown>;
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.other).toBe(1);
  });

  it('redacts secret values nested under unknown property names by exact value', () => {
    const secret = 'super-secret-value-xyz';
    const input = { someRandomField: { deeply: { nestedKey: secret } } };
    const result = scrubSensitive(input, [secret]) as Record<string, unknown>;
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).toContain('[REDACTED]');
  });

  it('redacts merchantId and token key names case-insensitively', () => {
    const input = { MerchantID: 'MID-987', TOKEN: 'tkn-abc', public: 'x' };
    const result = scrubSensitive(input, []) as Record<string, unknown>;
    expect(result.MerchantID).toBe('[REDACTED]');
    expect(result.TOKEN).toBe('[REDACTED]');
    expect(result.public).toBe('x');
  });

  it('does not mutate the input structure', () => {
    const input = { apiKey: 'secret', list: [{ password: 'p' }] };
    const snapshot = JSON.parse(JSON.stringify(input));
    scrubSensitive(input, []);
    expect(input).toEqual(snapshot);
  });

  it('redacts arrays and redacts matching values inside them', () => {
    const secret = 'needle-token';
    const input = { items: ['safe', secret], rsa: ['k1'] };
    const result = scrubSensitive(input, [secret]) as Record<string, unknown>;
    expect((result.items as unknown[])[0]).toBe('safe');
    expect((result.items as unknown[])[1]).toBe('[REDACTED]');
    expect(result.rsa).toBe('[REDACTED]');
  });
});

describe('session lifecycle', () => {
  it('creates a valid session with generated id and timestamps', () => {
    const session = createSession('test-context');
    expect(session.version).toBe('agent-session/v1');
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.events).toEqual([]);
    expect(session.createdAt).toBe(session.updatedAt);
    expect(loadSession(session.sessionId)).not.toBeNull();
  });

  it('appends events and round-trips through load', () => {
    const session = createSession('ctx');
    const updated = appendSessionEvent(session.sessionId, {
      type: 'prompt',
      data: { text: 'hello' },
    });
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0].type).toBe('prompt');
    expect(typeof updated.events[0].at).toBe('string');

    const loaded = loadSession(session.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded!.events).toHaveLength(1);
    expect(loaded!.updatedAt >= loaded!.createdAt).toBe(true);
  });

  it('returns null from loadSession for a missing session', () => {
    expect(loadSession('does-not-exist')).toBeNull();
  });

  it('lists sessions sorted by updatedAt desc', () => {
    const a = createSession('a');
    createSession('b');
    appendSessionEvent(a.sessionId, { type: 'summary', data: { x: 1 } });
    const list = listSessions();
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].updatedAt >= list[i].updatedAt).toBe(true);
    }
  });

  it('exports only scrubbed data and reproduces the session', () => {
    const session = createSession('ctx');
    const updated = appendSessionEvent(session.sessionId, {
      type: 'prompt',
      data: { apiKey: 'AKIA-canary', text: 'keep' },
    });
    const exported = exportSession(updated.sessionId);
    const parsed = JSON.parse(exported) as { events: Array<{ data: Record<string, unknown> }> };
    expect(JSON.stringify(parsed)).not.toContain('AKIA-canary');
    expect(JSON.stringify(parsed)).toContain('[REDACTED]');
    expect(JSON.stringify(parsed)).toContain('keep');
  });

  it('clears a single session and clears all', () => {
    const a = createSession('a');
    const b = createSession('b');
    clearSessions(a.sessionId);
    expect(loadSession(a.sessionId)).toBeNull();
    expect(loadSession(b.sessionId)).not.toBeNull();
    clearSessions('all');
    expect(listSessions()).toEqual([]);
  });
});

describe('buildDeterministicSummary', () => {
  it('is deterministic for the same input', () => {
    const session = createSession('ctx');
    appendSessionEvent(session.sessionId, { type: 'prompt', data: { text: 't' } });
    appendSessionEvent(session.sessionId, { type: 'tool_result', data: { ok: true } });
    const first = buildDeterministicSummary(session, []);
    const second = buildDeterministicSummary(session, []);
    expect(first).toBe(second);
  });

  it('redacts secrets within the summary', () => {
    const session = createSession('ctx');
    const updated = appendSessionEvent(session.sessionId, {
      type: 'prompt',
      data: { apiKey: 'AKIA-canary' },
    });
    const summary = buildDeterministicSummary(updated, []);
    expect(summary).not.toContain('AKIA-canary');
    expect(summary).toContain('[REDACTED]');
  });

  it('caps at 32 KiB after scrubbing', () => {
    const session = createSession('ctx');
    const big = 'x'.repeat(5000);
    for (let i = 0; i < 20; i++) {
      appendSessionEvent(session.sessionId, {
        type: 'tool_result',
        data: { payload: big, index: i },
      });
    }
    const summary = buildDeterministicSummary(session, []);
    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThanOrEqual(32 * 1024 + 1);
  });

  it('only includes the newest 12 relevant events', () => {
    const session = createSession('ctx');
    for (let i = 0; i < 20; i++) {
      appendSessionEvent(session.sessionId, { type: 'prompt', data: { i } });
    }
    const summary = JSON.parse(buildDeterministicSummary(session, [])) as {
      events: unknown[];
    };
    expect(summary.events.length).toBeLessThanOrEqual(12);
  });
});

describe('atomic write resilience', () => {
  it('leaves an existing session file intact when the write fails', () => {
    const session = createSession('ctx');
    appendSessionEvent(session.sessionId, { type: 'prompt', data: { text: 'v1' } });

    const { sessionsDir } = getAgentDataPaths();
    const file = path.join(sessionsDir, `${session.sessionId}.json`);
    const before = readFileSync(file, 'utf8');

    fsState.failRename = true;
    let warned = false;
    const spy = vi.spyOn(console, 'warn').mockImplementation((msg?: unknown) => {
      if (typeof msg === 'string' && msg.includes('failed to persist')) warned = true;
    });

    let returned: { events: unknown[] } = { events: [] };
    expect(() => {
      returned = appendSessionEvent(session.sessionId, { type: 'prompt', data: { text: 'v2' } });
    }).not.toThrow();
    fsState.failRename = false;
    spy.mockRestore();

    const after = readFileSync(file, 'utf8');
    expect(after).toBe(before);
    expect(warned).toBe(true);
    expect(returned.events).toHaveLength(2);
  });
});
