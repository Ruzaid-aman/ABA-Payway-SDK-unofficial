import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { readMaskedInput } from '../cli/masked-input.js';

class FakeInput extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  resume = vi.fn();
  pause = vi.fn();
}

class FakeOutput {
  isTTY = true;
  readonly writes: string[] = [];
  write(value: string): boolean {
    this.writes.push(value);
    return true;
  }
}

describe('readMaskedInput', () => {
  it('returns the secret while rendering only mask characters on an interactive terminal', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const value = readMaskedInput('API key: ', {
      input: input as never,
      output: output as never,
      fallback: async () => 'unmasked-fallback',
    });

    input.emit('data', Buffer.from('secret\r'));

    await expect(value).resolves.toBe('secret');
    expect(output.writes.join('')).toBe('API key: ******\n');
    expect(output.writes.join('')).not.toContain('secret');
    expect(input.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it('uses the non-terminal fallback for piped input', async () => {
    const input = new FakeInput();
    input.isTTY = false;
    const output = new FakeOutput();
    const fallback = vi.fn(async () => 'from-pipe');

    await expect(
      readMaskedInput('PayWay data: ', { input: input as never, output: output as never, fallback }),
    ).resolves.toBe('from-pipe');
    expect(fallback).toHaveBeenCalledWith('PayWay data: ');
    expect(output.writes).toEqual([]);
  });

  it('keeps terminal input masked when stdout is redirected', async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    output.isTTY = false;
    const fallback = vi.fn(async () => 'unmasked-fallback');
    const value = readMaskedInput('API key: ', { input: input as never, output: output as never, fallback });

    input.emit('data', Buffer.from('secret\r'));

    await expect(value).resolves.toBe('secret');
    expect(fallback).not.toHaveBeenCalled();
    expect(output.writes).toEqual([]);
    expect(input.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  });
});
