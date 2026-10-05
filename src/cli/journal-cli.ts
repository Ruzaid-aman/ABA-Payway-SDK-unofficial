/**
 * CLI-side Transaction Journal emission (Phase 2).
 *
 * Command-level events (execution.started, poll.attempt, status.observed)
 * flow into the same journal file as the transport events. The CLI emitter is
 * env-driven (PAYWAY_JOURNAL / --journal flag flips it in preAction) — the
 * CLI is a thin wrapper over the SDK and owns its process env.
 */

import { randomBytes } from 'node:crypto';
import type { Command } from 'commander';
import type { PayWay } from '../client.js';
import { isReadEndpoint } from '../journal/stats.js';
import { createJournalEmitter, readJournalEvents } from '../journal/writer.js';
import type { JournalContext, JournalEmitterInput } from '../journal/types.js';

let standalone: JournalContext | undefined;

/**
 * Env-resolved CLI emitter. Recomputed lazily so a preAction --journal flag
 * (which sets PAYWAY_JOURNAL=1) takes effect even after this module loaded.
 */
export function cliJournal(): JournalContext | undefined {
  standalone ??= createJournalEmitter(undefined, process.env);
  return standalone;
}

/**
 * Drop the memoized CLI emitter so the next `cliJournal()` re-resolves from
 * the current env. preAction calls this before applying the journal policy —
 * `--no-journal` (or a falsy env) must suppress command-level emission even
 * when an earlier in-process command already armed it (the CLI runs one
 * command per process; in-process runCli reuse is the case that exposed it).
 */
export function resetCliJournalEmitter(): void {
  standalone = undefined;
}

export function emitCliJournal(event: JournalEmitterInput): void {
  cliJournal()?.emit(event);
}

/** Prefer the client's emitter (same instance/mode); fall back to the CLI one. */
export function emitCliJournalVia(payway: PayWay | undefined, event: JournalEmitterInput): void {
  (payway?.journal ?? cliJournal())?.emit(event);
}

function commandPath(command: Command): string {
  const parts: string[] = [];
  let current: Command | undefined = command;
  while (current) {
    parts.unshift(current.name());
    current = current.parent ?? undefined;
  }
  return parts.join(' ') || 'payway-sdk';
}

/** `execution.started` for every executed CLI command (preAction hook). */
export function emitCliCommandStarted(actionCommand: Command): void {
  emitCliJournal({
    kind: 'execution.started',
    correlationId: randomBytes(8).toString('hex'),
    command: commandPath(actionCommand),
  });
}

/**
 * `status.observed` — a normalized payment-status reading from
 * check-transaction / transaction-detail / a terminal poll. Correlates with
 * the transport exchange via `payway.lastCorrelationId` when available.
 */
export function emitStatusObserved(
  payway: PayWay | undefined,
  info: { transactionId: string; status?: string; endpoint?: string; responseDigest?: unknown },
): void {
  emitCliJournalVia(payway, {
    kind: 'status.observed',
    correlationId: payway?.lastCorrelationId ?? randomBytes(8).toString('hex'),
    transactionId: info.transactionId,
    endpoint: info.endpoint,
    status: info.status,
    responseDigest: info.responseDigest,
  });
}

/**
 * Improvement I-3 (codifies W5-7): true when the journal already holds a
 * CREATE request for this transaction id — the gateway accepts duplicate
 * tran_ids silently but the resulting QR can be unpayable. Always false when
 * journaling is off (nothing to consult, no warning).
 */
export function journalSawCreateFor(transactionId: string): boolean {
  if (!cliJournal()) return false;
  const { events } = readJournalEvents();
  return events.some(
    (event) =>
      event.kind === 'execution.request' &&
      event.transactionId === transactionId &&
      event.endpoint !== undefined &&
      !isReadEndpoint(event.endpoint),
  );
}
