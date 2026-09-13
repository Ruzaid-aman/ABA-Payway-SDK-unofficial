/**
 * Transaction Journal — analytics engine (Phase 4).
 *
 * Aggregations over the journal that were impossible before it existed:
 * provider latency percentiles, retry rates, provider-error series, and the
 * creation → status → callback funnel. Pure and side-effect-free; the CLI
 * (`journal stats`) and the agent `query_journal` tool are thin wrappers.
 *
 * Funnel honesty rules (audit §8): a transaction still reads PENDING forever
 * after expiry or closure, and unpaid QR-only transactions never appear in
 * gateway lists — the funnel therefore reports what the LOCAL record saw,
 * not gateway truth.
 */

import path from 'node:path';
import { readJournalEvents, resolveJournalDir } from './writer.js';

export interface JournalLatencyRow {
  endpoint: string;
  count: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

export interface JournalRetryRow {
  endpoint: string;
  exchanges: number;
  retried: number;
}

export interface JournalErrorRow {
  /** `paywayCode` for provider errors, HTTP status for HTTP errors, error type for transport failures. */
  code: string;
  kind: 'provider' | 'http' | 'transport';
  count: number;
  lastSeen: string;
}

export interface JournalFunnel {
  /** Distinct transaction ids present in the journal. */
  transactionsTracked: number;
  /** Transactions whose first request hit a creation endpoint (documented heuristic). */
  creationsObserved: number;
  /** Transactions with at least one normalized status reading. */
  withObservedStatus: number;
  approved: number;
  declined: number;
  /** Last reading still non-terminal (or ERROR-only polls — includes the no-CLOSED/EXPIRED blind spot). */
  stillPending: number;
  withCallback: number;
}

export interface JournalStatsReport {
  window: { from?: string; to?: string; events: number };
  exchanges: { total: number; retried: number; retryRate: number; failedAttempts: number; failureRate: number };
  latency: JournalLatencyRow[];
  retries: JournalRetryRow[];
  topErrors: JournalErrorRow[];
  errorsByDay: Array<{ day: string; errors: number }>;
  funnel: JournalFunnel;
  commands: Array<{ command: string; count: number }>;
}

export interface JournalStatsOptions {
  journalDir?: string;
}

/** Endpoints that only READ state — everything else counts as a creation/mutation. */
const READ_ENDPOINT_MARKERS = [
  'check-transaction',
  'transaction-detail',
  'transaction-list',
  'get-transactions-by-mc-ref',
  'exchange-rate',
  'payment-link/detail',
] as const;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/** True for endpoints that only READ state (check/detail/list/by-ref/exchange-rate). */
export function isReadEndpoint(endpoint: string): boolean {
  return READ_ENDPOINT_MARKERS.some((marker) => endpoint.includes(marker));
}

export function computeJournalStats(options: JournalStatsOptions = {}): JournalStatsReport {
  const dir = options.journalDir ?? resolveJournalDir();
  const { events } = readJournalEvents(dir);

  // --- latency per endpoint (successful parsed 2xx only — error durations
  // include retry waits and would inflate the picture) ---
  const byEndpoint = new Map<string, number[]>();
  for (const event of events) {
    if (event.kind !== 'execution.response' || typeof event.durationMs !== 'number' || !event.endpoint) continue;
    const durations = byEndpoint.get(event.endpoint) ?? [];
    durations.push(event.durationMs);
    byEndpoint.set(event.endpoint, durations);
  }
  const latency: JournalLatencyRow[] = [...byEndpoint.entries()]
    .map(([endpoint, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        endpoint,
        count: sorted.length,
        p50: percentile(sorted, 50),
        p90: percentile(sorted, 90),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1],
      };
    })
    .sort((a, b) => b.count - a.count);

  // --- exchanges (a correlationId = one logical exchange incl. retries) ---
  const requestsPerExchange = new Map<string, { count: number; endpoint: string }>();
  let failedAttempts = 0;
  for (const event of events) {
    if (event.kind === 'execution.request' && event.correlationId) {
      const current = requestsPerExchange.get(event.correlationId);
      requestsPerExchange.set(event.correlationId, {
        count: (current?.count ?? 0) + 1,
        endpoint: current?.endpoint ?? event.endpoint ?? 'unknown',
      });
    }
    if (event.kind === 'execution.error') failedAttempts += 1;
  }
  const retriedRows = new Map<string, { exchanges: number; retried: number }>();
  let retriedExchanges = 0;
  for (const { count, endpoint } of requestsPerExchange.values()) {
    const row = retriedRows.get(endpoint) ?? { exchanges: 0, retried: 0 };
    row.exchanges += 1;
    if (count > 1) {
      retriedExchanges += 1;
      row.retried += 1;
    }
    retriedRows.set(endpoint, row);
  }
  const retries: JournalRetryRow[] = [...retriedRows.entries()]
    .map(([endpoint, row]) => ({ endpoint, ...row }))
    .sort((a, b) => b.retried - a.retried || b.exchanges - a.exchanges);

  const totalExchanges = requestsPerExchange.size;
  const requestAttempts = [...requestsPerExchange.values()].reduce((sum, r) => sum + r.count, 0);

  // --- provider errors ---
  const errorKey = new Map<string, JournalErrorRow>();
  const errorsByDayMap = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'execution.error') continue;
    const kind: JournalErrorRow['kind'] = event.paywayCode
      ? 'provider'
      : event.httpStatus !== undefined
        ? 'http'
        : 'transport';
    const code = event.paywayCode ?? (event.httpStatus !== undefined ? String(event.httpStatus) : event.error?.code ?? 'unknown');
    const row = errorKey.get(code) ?? { code, kind, count: 0, lastSeen: event.ts };
    row.count += 1;
    if (event.ts > row.lastSeen) row.lastSeen = event.ts;
    errorKey.set(code, row);
    const day = event.ts.slice(0, 10);
    errorsByDayMap.set(day, (errorsByDayMap.get(day) ?? 0) + 1);
  }
  const topErrors: JournalErrorRow[] = [...errorKey.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const errorsByDay = [...errorsByDayMap.entries()]
    .map(([day, errors]) => ({ day, errors }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // --- funnel ---
  interface TrackedTransaction {
    created: boolean;
    lastStatus?: string;
    statusAt?: string;
    callback: boolean;
  }
  const transactions = new Map<string, TrackedTransaction>();
  for (const event of events) {
    if (!event.transactionId) continue;
    const tracked =
      transactions.get(event.transactionId) ??
      ({ created: false, callback: false } as TrackedTransaction);
    if (event.kind === 'execution.request' && event.endpoint && !isReadEndpoint(event.endpoint)) {
      tracked.created = true;
    }
    if ((event.kind === 'status.observed' || event.kind === 'poll.attempt') && event.status) {
      // Normalize poll error attempts out of the status picture.
      if (!event.status.startsWith('ERROR:') && (!tracked.statusAt || event.ts >= tracked.statusAt)) {
        tracked.lastStatus = event.status;
        tracked.statusAt = event.ts;
      }
    }
    if (event.kind === 'callback.received') tracked.callback = true;
    transactions.set(event.transactionId, tracked);
  }
  let approved = 0;
  let declined = 0;
  let stillPending = 0;
  let creationsObserved = 0;
  let withCallback = 0;
  for (const tracked of transactions.values()) {
    if (tracked.created) creationsObserved += 1;
    if (tracked.lastStatus === 'APPROVED') approved += 1;
    else if (tracked.lastStatus === 'DECLINED' || tracked.lastStatus === 'CANCELLED') declined += 1;
    else if (tracked.lastStatus) stillPending += 1;
    if (tracked.callback) withCallback += 1;
  }

  // --- command usage ---
  const commandMap = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'execution.started' || !event.command) continue;
    commandMap.set(event.command, (commandMap.get(event.command) ?? 0) + 1);
  }
  const commands = [...commandMap.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const timestamps = events.map((e) => e.ts).sort();

  return {
    window: {
      from: timestamps[0],
      to: timestamps[timestamps.length - 1],
      events: events.length,
    },
    exchanges: {
      total: totalExchanges,
      retried: retriedExchanges,
      retryRate: totalExchanges === 0 ? 0 : retriedExchanges / totalExchanges,
      failedAttempts,
      failureRate: requestAttempts === 0 ? 0 : failedAttempts / requestAttempts,
    },
    latency,
    retries,
    topErrors,
    errorsByDay,
    funnel: {
      transactionsTracked: transactions.size,
      creationsObserved,
      withObservedStatus: [...transactions.values()].filter((t) => t.lastStatus).length,
      approved,
      declined,
      stillPending,
      withCallback,
    },
    commands,
  };
}
