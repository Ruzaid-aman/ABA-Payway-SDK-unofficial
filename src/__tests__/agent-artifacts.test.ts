/**
 * TDD tests for TASK-008 — safe artifact store and local utilities.
 *
 * Covers path traversal rejection, absolute-override gating, atomic writes
 * under simulated disk failure, QR-string-only rendering, and the
 * open/clipboard allowlist guards.
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveArtifactPath, saveQrArtifact } from '../agent/artifacts.js';
import type { AgentSessionV1 } from '../agent/contracts.js';
import { copyToClipboard, openArtifact } from '../agent/local-tools.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const fsWriteSpy = vi.hoisted(() => vi.fn());
const spawnSpy = vi.hoisted(() => vi.fn());
const realWrite = vi.hoisted(() => ({
  writeFileSync: ((..._args: unknown[]) => undefined) as (...args: unknown[]) => unknown,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  realWrite.writeFileSync = actual.writeFileSync as (...args: unknown[]) => unknown;
  fsWriteSpy.mockImplementation((...args: unknown[]) => realWrite.writeFileSync(...args));
  return { ...actual, writeFileSync: fsWriteSpy };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawn: spawnSpy };
});

function makeSession(): AgentSessionV1 {
  return {
    version: 'agent-session/v1',
    sessionId: 'sess_test_008',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contextLabel: 'test',
    events: [],
  };
}

function fakeSpawn(command: string, args: string[]) {
  spawned.push({ command, args });
  const ee = new EventEmitter();
  queueMicrotask(() => ee.emit('close', 0));
  return {
    on: (event: string, handler: (code: number) => void) => ee.on(event, handler),
    stderr: { on: () => undefined },
    stdin: { write: () => undefined, end: () => undefined },
  } as never;
}

const spawned: Array<{ command: string; args: string[] }> = [];

describe('resolveArtifactPath', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'payway-art-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts a plain name inside the root', () => {
    const resolved = resolveArtifactPath(root, 'receipt.json', false);
    expect(resolved.startsWith(root)).toBe(true);
    expect(resolved.endsWith('receipt.json')).toBe(true);
  });

  it('rejects path traversal without override approval', () => {
    expect(() => resolveArtifactPath(root, '../escape.json', false)).toThrow(/escapes/);
  });

  it('rejects an absolute override that leaves the root', () => {
    const outside = path.resolve(tmpdir(), 'far-away.json');
    expect(() => resolveArtifactPath(root, outside, false)).toThrow(/escapes/);
  });

  it('allows an absolute override only with explicit approval', () => {
    const outside = path.resolve(tmpdir(), 'far-away.json');
    const resolved = resolveArtifactPath(root, outside, true);
    expect(resolved).toBe(outside);
  });
});

describe('saveQrArtifact', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'payway-save-'));
  });
  afterEach(() => {
    fsWriteSpy.mockImplementation((...args: unknown[]) => realWrite.writeFileSync(...args));
    rmSync(root, { recursive: true, force: true });
  });

  it('produces a PNG + metadata from a QR-string-only input', async () => {
    const bundle = await saveQrArtifact({
      qrString: '00020101021226aba01kh',
      root,
      overrideApproval: true,
      name: 'pay-123',
      sessionId: 'sess_test_008',
      amount: 1.5,
      currency: 'USD',
      transactionId: 'tx_abc',
    });

    expect(bundle.imagePath).toBeDefined();
    const image = readFileSync(bundle.imagePath!);
    expect(image.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true);
    expect(bundle.dataUrl).toMatch(/^data:image\/png;base64,/);

    const metadataRaw = readFileSync(path.join(root, 'pay-123.json'), 'utf8');
    const metadata = JSON.parse(metadataRaw);
    expect(metadata.version).toBe('agent-artifact/v1');
    expect(metadata.kind).toBe('qr');
    expect(metadata.sessionId).toBe('sess_test_008');
    expect(metadata.amount).toBe(1.5);
    expect(metadata.currency).toBe('USD');
    expect(metadata.transactionId).toBe('tx_abc');
    // No credentials leak into metadata.
    expect(JSON.stringify(metadata)).not.toMatch(/apiKey|secret|authorization|password/i);
  });

  it('renders a local PNG when the QR image is missing from an API response', async () => {
    const bundle = await saveQrArtifact({
      qrString: 'khqr-content',
      root,
      overrideApproval: true,
      sessionId: 'sess_test_008',
    });
    expect(existsSync(bundle.imagePath!)).toBe(true);
  });

  it('leaves no partial file when the disk fails (atomicity)', async () => {
    const target = path.join(root, 'fail.json');
    fsWriteSpy.mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(
      saveQrArtifact({
        qrString: 'will-fail',
        root,
        overrideApproval: true,
        name: 'fail',
        sessionId: 'sess_test_008',
      }),
    ).rejects.toThrow(/artifact save failed/);

    expect(existsSync(target)).toBe(false);
    expect(existsSync(path.join(root, 'fail.png'))).toBe(false);
  });

  it('throws a clear error and never retries a payment on failure', async () => {
    await expect(saveQrArtifact({ root, sessionId: '' } as never)).rejects.toThrow(/requires a sessionId/);
  });
});

describe('openArtifact', () => {
  let root: string;
  let originalCwd: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'payway-open-'));
    originalCwd = process.cwd();
    process.chdir(root);
    spawned.length = 0;
    spawnSpy.mockImplementation(fakeSpawn as never);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  it('opens an explicitly selected https URL', async () => {
    await openArtifact('https://example.com/receipt', makeSession());
    expect(spawned.length).toBe(1);
    expect(spawned[0].args).toContain('https://example.com/receipt');
  });

  it('rejects non-https / unknown URI schemes', async () => {
    await expect(openArtifact('http://evil.com', makeSession())).rejects.toThrow();
    await expect(openArtifact('ftp://evil.com', makeSession())).rejects.toThrow();
    await expect(openArtifact('file:///etc/passwd', makeSession())).rejects.toThrow();
    expect(spawned.length).toBe(0);
  });

  it('rejects arbitrary model-provided absolute paths', async () => {
    await expect(openArtifact('/etc/passwd', makeSession())).rejects.toThrow();
    expect(spawned.length).toBe(0);
  });

  it('opens a current-session artifact path inside the root', async () => {
    const safeName = 'ok.json';
    mkdirSync(path.join(root, 'payway-output'), { recursive: true });
    writeFileSync(path.join(root, 'payway-output', safeName), '{}');
    await openArtifact(safeName, makeSession());
    expect(spawned.length).toBe(1);
  });
});

describe('copyToClipboard', () => {
  beforeEach(() => {
    spawned.length = 0;
    spawnSpy.mockImplementation(fakeSpawn as never);
  });

  it('invokes the platform clipboard utility via the allowlist', async () => {
    await copyToClipboard('pay-abc-123');
    expect(spawned.length).toBe(1);
    // No shell; the text is piped, never concatenated into a command line.
    const joined = `${spawned[0].command} ${spawned[0].args.join(' ')}`;
    expect(joined).not.toContain('pay-abc-123');
  });
});
