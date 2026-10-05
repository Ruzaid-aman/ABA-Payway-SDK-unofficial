/**
 * Unit tests for the polling display adapter (src/cli/ui/poll-display.ts) and
 * the one-shot spinner wrapper (src/cli/ui/one-shot.ts). Fakes record spinner
 * traffic headlessly — no terminal I/O.
 */
import { describe, expect, it } from 'vitest';
import { createPollDisplay, type PollDisplayMeta } from '../cli/ui/poll-display.js';
import { withOneShotSpinner } from '../cli/ui/one-shot.js';
import { CliCancelled, type PaymentIO, type SpinnerCode } from '../cli/ui/prompts.js';

interface RecordedStop {
  finalMessage?: string;
  code?: SpinnerCode;
}

interface SpinnerLog {
  messages: string[];
  stops: RecordedStop[];
}

/** PaymentIO fake whose only real behavior is recording spinner traffic. */
function createFakeIO(): { io: PaymentIO; spinners: SpinnerLog[] } {
  const spinners: SpinnerLog[] = [];
  const io: PaymentIO = {
    mode: 'clack',
    async text() {
      throw new Error('text() is not used by this test');
    },
    async select() {
      throw new Error('select() is not used by this test');
    },
    async confirm() {
      throw new Error('confirm() is not used by this test');
    },
    note() {
      throw new Error('note() is not used by this test');
    },
    intro() {
      throw new Error('intro() is not used by this test');
    },
    outro() {
      throw new Error('outro() is not used by this test');
    },
    spinner() {
      const log: SpinnerLog = { messages: [], stops: [] };
      spinners.push(log);
      return {
        message(text) {
          log.messages.push(text);
        },
        stop(finalMessage, code) {
          log.stops.push({ finalMessage, code });
        },
      };
    },
  };
  return { io, spinners };
}

const META: PollDisplayMeta = { transactionId: '68f2c1a1-poll-display', intervalMs: 5_000, maxDurationMs: 600_000 };

describe('createPollDisplay (legacy, io = null)', () => {
  it('treats every event and dispose as safe no-ops', () => {
    const display = createPollDisplay(null, META);
    expect(() => {
      display.onEvent({ kind: 'attempt', attempt: 1, paymentStatus: 'PENDING', elapsedMs: 0 });
      display.onEvent({ kind: 'error-attempt', attempt: 2, paymentStatus: 'ERROR: timeout', elapsedMs: 500 });
      display.onEvent({ kind: 'terminal', paymentStatus: 'APPROVED', attempt: 3, elapsedMs: 1_000 });
      display.onEvent({ kind: 'aborted', reason: 'caller_aborted', totalAttempts: 4 });
      display.dispose();
      display.dispose();
    }).not.toThrow();
  });
});

describe('createPollDisplay (clack mode)', () => {
  it('starts exactly one spinner across multiple attempt events and renders the progress line', () => {
    const { io, spinners } = createFakeIO();
    const display = createPollDisplay(io, META);

    display.onEvent({ kind: 'attempt', attempt: 1, paymentStatus: 'PENDING', elapsedMs: 5_000 });
    display.onEvent({ kind: 'attempt', attempt: 3, paymentStatus: 'PENDING', elapsedMs: 15_000 });

    expect(spinners).toHaveLength(1);
    expect(spinners[0].stops).toHaveLength(0);
    expect(spinners[0].messages).toHaveLength(2);
    expect(spinners[0].messages[1]).toBe('Poll #3 · PENDING · 0:15 elapsed / 9:45 left');
  });

  it('renders error attempts in the same shape', () => {
    const { io, spinners } = createFakeIO();
    const display = createPollDisplay(io, META);

    display.onEvent({
      kind: 'error-attempt',
      attempt: 4,
      paymentStatus: 'ERROR: Connection timeout',
      elapsedMs: 20_000,
    });

    expect(spinners).toHaveLength(1);
    expect(spinners[0].messages[0]).toBe('Poll #4 · ERROR: Connection timeout · 0:20 elapsed / 9:40 left');
  });

  it('stops with success on an APPROVED terminal event and ignores later events', () => {
    const { io, spinners } = createFakeIO();
    const display = createPollDisplay(io, META);

    display.onEvent({ kind: 'attempt', attempt: 8, paymentStatus: 'PENDING', elapsedMs: 40_000 });
    display.onEvent({ kind: 'terminal', paymentStatus: 'APPROVED', attempt: 9, elapsedMs: 42_000 });
    // Late arrivals after the terminal event must not touch the spinner again.
    display.onEvent({ kind: 'attempt', attempt: 10, paymentStatus: 'PENDING', elapsedMs: 45_000 });
    display.onEvent({ kind: 'terminal', paymentStatus: 'DECLINED', attempt: 11, elapsedMs: 46_000 });
    display.dispose();

    expect(spinners).toHaveLength(1);
    expect(spinners[0].messages).toHaveLength(1);
    expect(spinners[0].stops).toEqual([{ finalMessage: 'APPROVED — 0:42s · attempt #9', code: 'success' }]);
  });

  it('stops with fail on a non-APPROVED terminal status', () => {
    const { io, spinners } = createFakeIO();
    const display = createPollDisplay(io, META);

    display.onEvent({ kind: 'terminal', paymentStatus: 'DECLINED', attempt: 5, elapsedMs: 30_000 });

    expect(spinners[0].stops).toEqual([{ finalMessage: 'DECLINED — 0:30s · attempt #5', code: 'fail' }]);
  });

  it('stops with warn on an aborted event, naming the reason and attempt count', () => {
    const { io, spinners } = createFakeIO();
    const display = createPollDisplay(io, META);

    display.onEvent({ kind: 'attempt', attempt: 1, paymentStatus: 'PENDING', elapsedMs: 5_000 });
    display.onEvent({ kind: 'aborted', reason: 'max_duration_exceeded', totalAttempts: 12, elapsedMs: 600_000 });

    expect(spinners[0].stops).toEqual([
      { finalMessage: 'Polling stopped: max_duration_exceeded after 12 attempts', code: 'warn' },
    ]);
  });

  it('dispose stops an active spinner quietly and later events stay ignored', () => {
    const { io, spinners } = createFakeIO();
    const display = createPollDisplay(io, META);

    display.onEvent({ kind: 'attempt', attempt: 1, paymentStatus: 'PENDING', elapsedMs: 5_000 });
    display.dispose();

    expect(spinners[0].stops).toEqual([{ finalMessage: undefined, code: undefined }]);

    // Post-dispose events and a second dispose must not restart or re-stop anything.
    display.onEvent({ kind: 'attempt', attempt: 2, paymentStatus: 'PENDING', elapsedMs: 10_000 });
    display.dispose();
    expect(spinners).toHaveLength(1);
    expect(spinners[0].messages).toHaveLength(1);
    expect(spinners[0].stops).toHaveLength(1);
  });
});

describe('withOneShotSpinner', () => {
  it('runs fn unchanged with a null IO and never touches a spinner', async () => {
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls += 1;
      return 'value';
    };

    await expect(withOneShotSpinner(null, 'Label', fn)).resolves.toBe('value');
    expect(calls).toBe(1);
  });

  it('stops with success and resolves the fn value in clack mode', async () => {
    const { io, spinners } = createFakeIO();

    const value = await withOneShotSpinner(io, 'Checking transaction', async () => 'ok');

    expect(value).toBe('ok');
    expect(spinners).toHaveLength(1);
    expect(spinners[0].stops).toEqual([{ finalMessage: 'done', code: 'success' }]);
  });

  it('stops with fail and rethrows the error', async () => {
    const { io, spinners } = createFakeIO();
    const boom = new Error('network down');

    await expect(
      withOneShotSpinner(io, 'Refunding', async () => {
        throw boom;
      }),
    ).rejects.toThrow('network down');

    expect(spinners[0].stops).toEqual([{ finalMessage: 'failed: network down', code: 'fail' }]);
  });

  it('treats CliCancelled like any other failure: stop(fail) then rethrow', async () => {
    const { io, spinners } = createFakeIO();
    const cancelled = new CliCancelled();

    await expect(
      withOneShotSpinner(io, 'Checking', async () => {
        throw cancelled;
      }),
    ).rejects.toBe(cancelled);

    expect(spinners[0].stops).toEqual([{ finalMessage: 'failed: Cancelled by user', code: 'fail' }]);
  });
});
