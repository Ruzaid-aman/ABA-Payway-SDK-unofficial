/**
 * Receiver instance control (audit WP02).
 *
 * The old `webhook stop` read a PID from the shared state file and sent it
 * SIGTERM directly — a reused PID (or another workspace's receiver sharing
 * the data root) could be signalled as if it were ours, and every error was
 * swallowed into a misleading `stopped: true`.
 *
 * The protocol now is identity-first, graceful-first:
 *   1. GET the receiver's control route and compare its reported instanceId
 *      with the one in OUR data root's state file. A reused PID cannot
 *      answer with our random instance id.
 *   2. On identity match, POST an authenticated shutdown (control token from
 *      the same state file) — the receiver then runs its OWN graceful path
 *      (listener close, tunnel stop, .env restore) instead of being signalled.
 *   3. Wait for the process to actually exit; report honest outcomes
 *      (stopped / stale / pid-reused / unreachable / shutdown-not-confirmed)
 *      and only clear the state file when our receiver is confirmed gone.
 * No signal is EVER sent to a PID — the process.exit path inside the
 * receiver's own shutdown handler is the only termination mechanism.
 */
import { timingSafeEqual } from 'node:crypto';
import type { WebhookLifecycleState } from './lifecycle.js';

export const CONTROL_PATH = '/aba-payway-control';

export type StopOutcomeReason =
  | 'absent'
  | 'stale'
  | 'stopped'
  | 'pid-reused'
  | 'unreachable'
  | 'shutdown-not-confirmed'
  | 'unauthorized';

export interface StopOutcome {
  stopped: boolean;
  reason: StopOutcomeReason;
  detail: string;
  pid?: number;
  port?: number;
  /** The receiver answered the shutdown request but did not exit in time. */
  stateCleared: boolean;
}

export interface ReceiverControlOptions {
  state: WebhookLifecycleState;
  /** Fetch seam (tests). Default global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Liveness probe seam: return true when the PID is alive (signal 0).
   * Default `process.kill(pid, 0)`. Never sends a real signal.
   */
  isProcessAlive?: (pid: number) => boolean;
  /** ms budget for each control request (default 2000). */
  requestTimeoutMs?: number;
  /** ms budget to wait for process exit after an accepted shutdown (default 5000). */
  exitWaitMs?: number;
  /** Control base URL override (tests); default http://127.0.0.1:<port>. */
  baseUrl?: string;
  /** Log sink (default console.log). */
  log?: (line: string) => void;
  quiet?: boolean;
}

function defaultAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function controlFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response | 'refused' | 'error'> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    // A refused connection means nothing is listening on that port.
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ECONNREFUSED' || (error instanceof Error && error.message.includes('fetch failed'))) {
      return 'refused';
    }
    return 'error';
  }
}

/**
 * Stop the receiver described by `state`, with ownership verification and
 * honest outcomes. Never sends an OS signal to any PID.
 */
export async function stopReceiver(options: ReceiverControlOptions): Promise<StopOutcome> {
  const {
    state,
    fetchImpl = fetch,
    isProcessAlive = defaultAlive,
    requestTimeoutMs = 2_000,
    exitWaitMs = 5_000,
    baseUrl = `http://127.0.0.1:${state.port}`,
    log = (line: string) => console.log(line),
    quiet = false,
  } = options;

  const say = (line: string): void => {
    if (!quiet) log(line);
  };

  // Step 1: identity check. Only OUR receiver can answer with our random
  // instanceId — a reused PID or a foreign receiver on the same port cannot.
  const identify = await controlFetch(
    `${baseUrl}${CONTROL_PATH}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'identify' }) },
    requestTimeoutMs,
    fetchImpl,
  );
  if (identify !== 'refused' && identify !== 'error') {
    let identity: { instanceId?: string } | null = null;
    try {
      identity = (await identify.json()) as { instanceId?: string };
    } catch {
      identity = null;
    }
    if (!identity || typeof identity.instanceId !== 'string' || !safeEqual(identity.instanceId, state.instanceId)) {
      return {
        stopped: false,
        reason: 'pid-reused',
        detail: `Port ${state.port} is served by a DIFFERENT process (instance id mismatch) — the recorded receiver is gone. Nothing was signalled; remove this process manually if it is yours (pid ${state.pid}).`,
        pid: state.pid,
        port: state.port,
        stateCleared: false,
      };
    }

    // Step 2: authenticated graceful shutdown — the receiver runs its own
    // cleanup path (listener close, tunnel stop, .env restore).
    const shutdown = await controlFetch(
      `${baseUrl}${CONTROL_PATH}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shutdown', token: state.controlToken }),
      },
      requestTimeoutMs,
      fetchImpl,
    );
    if (shutdown === 'refused' || shutdown === 'error') {
      // The receiver answered identify moments ago — transient. Report honestly.
      return {
        stopped: false,
        reason: 'unreachable',
        detail: `The receiver acknowledged identify but the shutdown request failed — it may be wedged. Nothing was signalled; retry, or stop pid ${state.pid} manually.`,
        pid: state.pid,
        port: state.port,
        stateCleared: false,
      };
    }
    if (shutdown.status === 403) {
      return {
        stopped: false,
        reason: 'unauthorized',
        detail:
          'The running receiver rejected the control token — the state file does not belong to it. Nothing was signalled.',
        pid: state.pid,
        port: state.port,
        stateCleared: false,
      };
    }

    // Step 3: wait for ACTUAL exit — an accepted request is not a stopped process.
    const deadline = Date.now() + exitWaitMs;
    while (Date.now() < deadline) {
      if (!isProcessAlive(state.pid)) {
        say(`  Receiver (pid ${state.pid}) shut down and exited.`);
        return {
          stopped: true,
          reason: 'stopped',
          detail: 'receiver exited after authenticated shutdown',
          pid: state.pid,
          port: state.port,
          stateCleared: true,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      stopped: false,
      reason: 'shutdown-not-confirmed',
      detail: `The receiver accepted the shutdown request but pid ${state.pid} is still alive after ${exitWaitMs}ms — not reporting success. Check the receiver terminal; stop it manually if wedged.`,
      pid: state.pid,
      port: state.port,
      stateCleared: false,
    };
  }

  // No control endpoint answered. Distinguish dead (stale state) from alive.
  if (!isProcessAlive(state.pid)) {
    return {
      stopped: false,
      reason: 'stale',
      detail: `The recorded receiver (pid ${state.pid}) is no longer running.`,
      pid: state.pid,
      port: state.port,
      stateCleared: true,
    };
  }
  return {
    stopped: false,
    reason: 'unreachable',
    detail: `A live process holds pid ${state.pid} but nothing answered on port ${state.port} — it may be a reused PID, not the recorded receiver. Nothing was signalled; verify pid ${state.pid} manually.`,
    pid: state.pid,
    port: state.port,
    stateCleared: false,
  };
}
