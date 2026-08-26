/**
 * Tests for the OS default-viewer opener used by generate-qr.
 *
 * child_process.spawn is mocked so no real viewer launches during tests;
 * platform mapping and graceful degradation are covered deterministically.
 */

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { defaultViewerCommandForPlatform, openImageInDefaultViewer } from '../open-image.js';

const temporaryDirectories: string[] = [];
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

afterEach(() => {
  spawnMock.mockReset();
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

interface FakeChildOptions {
  emitError?: Error;
}

function makeFakeChild(options: FakeChildOptions = {}): EventEmitter & { unref: () => void } {
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = () => {};
  queueMicrotask(() => {
    if (options.emitError) {
      child.emit('error', options.emitError);
    } else {
      child.emit('close', 0);
    }
  });
  return child;
}

function makeTempPng(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-open-image-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'qr.png');
  writeFileSync(filePath, Buffer.from('89504e47', 'hex'));
  return filePath;
}

describe('defaultViewerCommandForPlatform', () => {
  it('maps each supported platform to its allowlisted opener', () => {
    expect(defaultViewerCommandForPlatform('win32')).toEqual({
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler'],
    });
    expect(defaultViewerCommandForPlatform('darwin')).toEqual({ command: 'open', args: [] });
    expect(defaultViewerCommandForPlatform('linux')).toEqual({ command: 'xdg-open', args: [] });
  });

  it('returns undefined for unsupported platforms', () => {
    expect(defaultViewerCommandForPlatform('sunos')).toBeUndefined();
  });
});

describe('openImageInDefaultViewer', () => {
  it('reports missing files without spawning anything', async () => {
    const result = await openImageInDefaultViewer(path.join(tmpdir(), 'definitely-missing-qr.png'));

    expect(result.opened).toBe(false);
    expect(result.reason).toBe('missing_file');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects directories without spawning anything', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'payway-open-image-'));
    temporaryDirectories.push(directory);

    const result = await openImageInDefaultViewer(directory);

    expect(result.opened).toBe(false);
    expect(result.reason).toBe('missing_file');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('launches the allowlisted Windows viewer with shell disabled', async () => {
    stubPlatform('win32');
    const filePath = makeTempPng();
    spawnMock.mockImplementation(() => makeFakeChild());

    const result = await openImageInDefaultViewer(filePath);

    expect(result).toEqual({ opened: true, viewer: 'rundll32.exe' });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(command).toBe('rundll32.exe');
    expect(args[0]).toBe('url.dll,FileProtocolHandler');
    expect(args[1]).toBe(path.resolve(filePath));
    expect(options.shell).toBe(false);
    expect(options.detached).toBe(true);
  });

  it('launches xdg-open on Linux', async () => {
    stubPlatform('linux');
    const filePath = makeTempPng();
    spawnMock.mockImplementation(() => makeFakeChild());

    const result = await openImageInDefaultViewer(filePath);

    expect(result.opened).toBe(true);
    expect(result.viewer).toBe('xdg-open');
    const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(command).toBe('xdg-open');
    expect(args[0]).toBe(path.resolve(filePath));
  });

  it('degrades gracefully when the viewer cannot be launched', async () => {
    stubPlatform('darwin');
    const filePath = makeTempPng();
    spawnMock.mockImplementation(() => makeFakeChild({ emitError: new Error('spawn open ENOENT') }));

    const result = await openImageInDefaultViewer(filePath);

    expect(result.opened).toBe(false);
    expect(result.reason).toBe('spawn_error');
    expect(result.error).toContain('ENOENT');
  });

  it('treats a long-lived launcher as success after the handoff window', async () => {
    stubPlatform('linux');
    const filePath = makeTempPng();
    // A viewer that never exits must not hang the caller.
    const neverExitingChild = new EventEmitter() as EventEmitter & { unref: () => void };
    neverExitingChild.unref = () => {};
    spawnMock.mockImplementation(() => neverExitingChild);

    const result = await openImageInDefaultViewer(filePath, { launchTimeoutMs: 20 });

    expect(result.opened).toBe(true);
    expect(result.viewer).toBe('xdg-open');
  });

  it('reports unsupported platforms without spawning anything', async () => {
    stubPlatform('sunos' as NodeJS.Platform);
    const filePath = makeTempPng();

    const result = await openImageInDefaultViewer(filePath);

    expect(result.opened).toBe(false);
    expect(result.reason).toBe('unsupported_platform');
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
