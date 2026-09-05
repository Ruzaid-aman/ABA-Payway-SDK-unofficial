import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSessionV1 } from '../agent/contracts.js';
import { openArtifact } from '../agent/local-tools.js';

const spawnSpy = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawn: spawnSpy };
});

const temporaryDirectories: string[] = [];
const temporaryLinks: Array<{ link: string; root: string }> = [];
let originalCwd = '';
const spawned: Array<{ command: string; args: string[] }> = [];

function fakeSpawn(command: string, args: string[]) {
  spawned.push({ command, args });
  const events = new EventEmitter();
  queueMicrotask(() => events.emit('close', 0));
  return {
    on: (event: string, handler: (value: unknown) => void) => events.on(event, handler),
    stderr: { on: () => undefined },
    stdin: { write: () => undefined, end: () => undefined },
  } as unknown as ReturnType<typeof spawn>;
}

function session(artifacts: Array<{ artifactId: string; path: string }> = []): AgentSessionV1 {
  const now = '2026-08-22T00:00:00.000Z';
  return {
    version: 'agent-session/v1',
    sessionId: 'r3-session',
    createdAt: now,
    updatedAt: now,
    contextLabel: 'r3',
    events: artifacts.map((artifact) => ({ type: 'artifact', at: now, data: artifact })),
  };
}

beforeEach(() => {
  originalCwd = process.cwd();
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-r3-open-'));
  temporaryDirectories.push(directory);
  process.chdir(directory);
  spawned.length = 0;
  spawnSpy.mockImplementation(fakeSpawn as never);
});

afterEach(() => {
  process.chdir(originalCwd);
  for (const { link, root } of temporaryLinks.splice(0)) {
    const relativeLink = path.relative(root, link);
    if (relativeLink === '' || relativeLink.startsWith('..') || path.isAbsolute(relativeLink)) {
      throw new Error(`Refusing to remove test link outside its fixture root: ${link}`);
    }
    rmSync(link, { force: true });
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('R3 artifact opener command policy', () => {
  it('passes URL metacharacters as one non-shell argument on Windows', async () => {
    const target = 'https://example.com/receipt?next=a&value=b|literal';
    await openArtifact(target, session());

    expect(spawned).toHaveLength(1);
    expect(spawned[0].args[spawned[0].args.length - 1]).toBe(target);
    if (process.platform === 'win32') {
      expect(spawned[0].command.toLowerCase()).toBe('rundll32.exe');
      expect(spawned[0].args).toEqual(['url.dll,FileProtocolHandler', target]);
    } else {
      expect(spawned[0].command.toLowerCase()).not.toBe('cmd');
    }
  });

  it.each([
    'https://service.test/receipt',
    'https://router.home.arpa/receipt',
    'https://service.invalid/receipt',
    'https://hidden.onion/receipt',
  ])('rejects special-use HTTPS URL %s before spawning an opener', async (reference) => {
    await expect(openArtifact(reference, session())).rejects.toThrow(/public https/i);
    expect(spawned).toHaveLength(0);
  });
});

describe('R3 active-session artifact policy', () => {
  it('opens a tracked current-session artifact but rejects an untracked sibling', async () => {
    const root = path.join(process.cwd(), 'payway-output');
    mkdirSync(root, { recursive: true });
    const tracked = path.join(root, 'tracked.json');
    const untracked = path.join(root, 'untracked.json');
    writeFileSync(tracked, '{}');
    writeFileSync(untracked, '{}');
    const active = session([{ artifactId: 'artifact-r3', path: tracked }]);

    await openArtifact(tracked, active);
    await expect(openArtifact(untracked, active)).rejects.toThrow(/active session/i);
    expect(spawned).toHaveLength(1);
  });

  it('rejects a tracked lexical path whose symlink or junction target escapes the artifact root', async () => {
    const root = path.join(process.cwd(), 'payway-output');
    const outside = path.join(process.cwd(), 'outside');
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'secret.json'), '{}');
    const link = path.join(root, 'escape-link');
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    temporaryLinks.push({ link, root: process.cwd() });
    const escaped = path.join(link, 'secret.json');

    await expect(
      openArtifact(escaped, session([{ artifactId: 'artifact-escape', path: escaped }])),
    ).rejects.toThrow(/artifact root/i);
    expect(spawned).toHaveLength(0);
  });

  it('rejects an artifact root that is itself a symlink or junction', async () => {
    const root = path.join(process.cwd(), 'payway-output');
    const outside = path.join(process.cwd(), 'outside-root');
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'secret.json'), '{}');
    symlinkSync(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
    temporaryLinks.push({ link: root, root: process.cwd() });
    const escaped = path.join(root, 'secret.json');

    await expect(
      openArtifact(escaped, session([{ artifactId: 'artifact-root-escape', path: escaped }])),
    ).rejects.toThrow(/artifact root/i);
    expect(spawned).toHaveLength(0);
  });
});
