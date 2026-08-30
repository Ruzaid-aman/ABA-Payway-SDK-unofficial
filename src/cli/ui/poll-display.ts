/**
 * Polling display adapter for runPolling (src/cli.ts): turns poll events into
 * a single in-place clack spinner line. With a null IO every method is a
 * no-op so the caller's legacy plain-line output stays untouched — this is
 * the compatibility contract (pure orchestration over injected handles).
 */

import { formatClock } from '../journey.js';
import type { PaymentIO, SpinnerHandle } from './prompts.js';

export interface PollDisplayMeta {
  transactionId: string;
  intervalMs: number;
  maxDurationMs: number;
}

export interface PollDisplayEvent {
  kind: 'attempt' | 'error-attempt' | 'terminal' | 'aborted';
  attempt?: number;
  /** 'PENDING' | 'APPROVED' | 'ERROR: ...' etc. */
  paymentStatus?: string;
  /** Per-attempt API latency (informational). */
  durationMs?: number;
  /** Milliseconds since the poll loop started. */
  elapsedMs?: number;
  /** 'max_duration_exceeded' | 'max_consecutive_errors' | 'caller_aborted'. */
  reason?: string;
  totalAttempts?: number;
}

export interface PollDisplay {
  onEvent(event: PollDisplayEvent): void;
  dispose(): void;
}

/** In-place spinner display for the polling loop; a safe no-op when `io` is null. */
export function createPollDisplay(io: PaymentIO | null, meta: PollDisplayMeta): PollDisplay {
  if (io === null) {
    const noop = (): void => undefined;
    return { onEvent: noop, dispose: noop };
  }

  let spinner: SpinnerHandle | null = null;
  let finished = false;

  const startSpinner = (): SpinnerHandle => {
    if (spinner === null) spinner = io.spinner();
    return spinner;
  };

  const stopSpinner = (finalMessage?: string, code?: 'success' | 'fail' | 'warn'): void => {
    if (spinner === null) return;
    const handle = spinner;
    spinner = null;
    handle.stop(finalMessage, code);
  };

  const progressMessage = (event: PollDisplayEvent): string => {
    const elapsedMs = event.elapsedMs ?? 0;
    const remainingMs = Math.max(0, meta.maxDurationMs - elapsedMs);
    return `Poll #${event.attempt} · ${event.paymentStatus} · ${formatClock(elapsedMs)} elapsed / ${formatClock(remainingMs)} left`;
  };

  return {
    onEvent(event) {
      if (finished) return;
      switch (event.kind) {
        case 'attempt':
        case 'error-attempt':
          startSpinner().message(progressMessage(event));
          return;
        case 'terminal': {
          const code = event.paymentStatus === 'APPROVED' ? 'success' : 'fail';
          const finalMessage = `${event.paymentStatus} — ${formatClock(event.elapsedMs ?? 0)}s · attempt #${event.attempt}`;
          finished = true;
          startSpinner(); // terminal may be the first event; the final line must still be shown
          stopSpinner(finalMessage, code);
          return;
        }
        case 'aborted': {
          const finalMessage = `Polling stopped: ${event.reason} after ${event.totalAttempts} attempts`;
          finished = true;
          startSpinner(); // aborted may be the first event; the final line must still be shown
          stopSpinner(finalMessage, 'warn');
          return;
        }
      }
    },
    dispose() {
      finished = true;
      stopSpinner();
    },
  };
}
