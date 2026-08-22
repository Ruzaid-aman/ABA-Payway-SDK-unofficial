import type { ReadStream, WriteStream } from 'node:tty';

interface MaskedInputOptions {
  input?: Pick<ReadStream, 'isTTY' | 'setRawMode' | 'on' | 'removeListener' | 'resume' | 'pause'>;
  output?: Pick<WriteStream, 'isTTY' | 'write'>;
  fallback: (prompt: string) => Promise<string>;
}

/**
 * Reads a secret without writing its characters to an interactive terminal.
 * Piped/non-TTY input falls back to the caller's normal line reader because
 * it is not terminal-echoed by the operating system.
 */
export function readMaskedInput(prompt: string, options: MaskedInputOptions): Promise<string> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return options.fallback(prompt);
  }
  const renderFeedback = output.isTTY === true;

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error): void => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      if (renderFeedback) output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer | string): void => {
      for (const character of String(chunk)) {
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0003') {
          finish(new Error('Secret input cancelled'));
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (renderFeedback) output.write('\b \b');
          }
          continue;
        }
        value += character;
        if (renderFeedback) output.write('*');
      }
    };

    if (renderFeedback) output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
