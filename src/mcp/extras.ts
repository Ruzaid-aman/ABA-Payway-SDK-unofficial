/**
 * MCP-only read-only extras (spec `.scratch/cli-modernization/design.md` §5.2).
 *
 * These three tools exist ONLY in the MCP catalog — never in `AgentToolName`
 * (the agent catalog stays 14). `journal_timeline` projects journal events
 * through a digest allow-list: request/response bodies never leave the
 * machine even when the on-disk journal ran in full mode.
 */

import type { PayWay } from '../client.js';
import { gatewayDayWindow } from '../utils.js';
import { explainTransaction } from '../journal/intelligence.js';
import { computeJournalStats } from '../journal/stats.js';
import { readJournalEvents } from '../journal/writer.js';
import type { JournalEventV1 } from '../journal/types.js';
/** Loose result shape — extras are not agent tools, so `tool` is not the closed AgentToolName union. */
export interface McpExtraResult {
  ok: boolean;
  tool: string;
  data?: Record<string, unknown>;
  error?: { code?: string; message: string };
}

/** Fields safe to expose over MCP — everything else is dropped. */
const TIMELINE_DIGEST_FIELDS = [
  'ts',
  'kind',
  'correlationId',
  'transactionId',
  'merchantRef',
  'status',
  'httpStatus',
  'paywayCode',
  'durationMs',
  'command',
  'endpoint',
  'attempt',
] as const;

const DATE_FMT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function failure(code: string, message: string): McpExtraResult {
  return { ok: false, tool: 'query_journal', error: { code, message } };
}

function digestEvent(event: JournalEventV1): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of TIMELINE_DIGEST_FIELDS) {
    if (event[field] !== undefined) projected[field] = event[field];
  }
  return projected;
}

async function runJournalTimeline(args: Record<string, unknown>): Promise<McpExtraResult> {
  const transactionId = typeof args.transactionId === 'string' ? args.transactionId.trim() : '';
  if (!transactionId) {
    return failure('VALIDATION', 'journal_timeline requires transactionId (string)');
  }

  const kind = typeof args.kind === 'string' && args.kind.trim() ? args.kind.trim() : undefined;
  const last =
    typeof args.last === 'number' && Number.isFinite(args.last) && args.last > 0 ? Math.floor(args.last) : 100;

  // Honor the documented PAYWAY_JOURNAL_DIR override directly (the bare call
  // only consults it when journaling is enabled; MCP reads must work either way).
  const { events } = readJournalEvents(process.env.PAYWAY_JOURNAL_DIR?.trim() || undefined);
  const filtered = events
    .filter((event) => event.transactionId === transactionId && (!kind || event.kind === kind))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  const rca = explainTransaction(transactionId);
  return {
    ok: true,
    tool: 'query_journal',
    data: {
      query: 'timeline',
      transactionId,
      totalEvents: filtered.length,
      // Digest projection: even full-mode journal files never leak bodies here.
      events: filtered.slice(Math.max(0, filtered.length - last)).map(digestEvent),
      verdict: rca.verdict,
      steps: rca.steps,
      hints: rca.hints,
    },
  };
}

async function runListTransactions(args: Record<string, unknown>, client: PayWay | undefined): Promise<McpExtraResult> {
  const asDate = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const fromDate = asDate(args.from);
  const toDate = asDate(args.to);

  // Same gateway-time validations as the `transaction-list` CLI (§18): format,
  // ≤3-day window, ≤1000 page size — the gateway 403s all three without a
  // useful message, so fail fast client-side.
  for (const [label, value] of [
    ['from', fromDate],
    ['to', toDate],
  ] as const) {
    if (value && !DATE_FMT.test(value)) {
      return failure(
        'VALIDATION',
        `${label} must use "YYYY-MM-DD HH:mm:ss" (gateway time UTC+7); e.g. "2026-09-01 00:00:00"`,
      );
    }
  }
  const winFromMs = fromDate ? Date.parse(fromDate.replace(' ', 'T')) : Number.NaN;
  const winToMs = toDate ? Date.parse(toDate.replace(' ', 'T')) : Number.NaN;
  if (!Number.isNaN(winFromMs) && !Number.isNaN(winToMs) && winToMs - winFromMs > 3 * 86_400_000) {
    return failure(
      'VALIDATION',
      'The requested window spans more than 3 days, which PayWay rejects — split into ≤3-day windows.',
    );
  }
  const pagination =
    args.pagination === undefined ? 50 : typeof args.pagination === 'number' ? Math.floor(args.pagination) : Number.NaN;
  if (!Number.isInteger(pagination) || pagination <= 0 || pagination > 1000) {
    return failure('VALIDATION', 'pagination must be a whole number between 1 and 1000');
  }
  const page = args.page === undefined ? 1 : typeof args.page === 'number' ? Math.floor(args.page) : Number.NaN;
  if (!Number.isInteger(page) || page <= 0) {
    return failure('VALIDATION', 'page must be a positive whole number');
  }
  if (!client) {
    return failure(
      'CONFIG_ERROR',
      'list_transactions requires PayWay credentials (PAYWAY_ENV/MERCHANT_ID/API_KEY or a profile)',
    );
  }

  const { fromDate: gwFrom, toDate: gwTo } = gatewayDayWindow();
  const result = await client.checkout.getTransactionList({
    fromDate: fromDate ?? gwFrom,
    toDate: toDate ?? gwTo,
    fromAmount: typeof args.minAmount === 'number' ? args.minAmount : null,
    toAmount: typeof args.maxAmount === 'number' ? args.maxAmount : null,
    status: typeof args.status === 'string' ? args.status : null,
    page: String(page),
    pagination: String(pagination),
  });
  const asRecord = result as Record<string, unknown>;
  const rows = (asRecord.rows as unknown[] | undefined) ?? [];
  return {
    ok: true,
    tool: 'list_transactions',
    data: {
      query: 'list_transactions',
      window: { from: fromDate ?? gwFrom, to: toDate ?? gwTo },
      count: rows.length,
      rows,
      raw: result,
    },
  };
}

/** Dispatches an MCP-extra call. `client` is required only by list_transactions. */
export async function runMcpExtra(
  name: 'list_transactions' | 'journal_stats' | 'journal_timeline',
  args: Record<string, unknown>,
  client: PayWay | undefined,
): Promise<McpExtraResult> {
  try {
    switch (name) {
      case 'journal_timeline':
        return await runJournalTimeline(args);
      case 'journal_stats': {
        const report = computeJournalStats();
        return {
          ok: true,
          tool: 'journal_stats',
          data: {
            query: 'stats',
            window: report.window,
            exchanges: report.exchanges,
            latency: report.latency.slice(0, 10),
            topErrors: report.topErrors,
            funnel: report.funnel,
          },
        };
      }
      case 'list_transactions':
        return await runListTransactions(args, client);
      default: {
        const exhaustive: never = name;
        return failure('VALIDATION', `Unknown extra tool: ${String(exhaustive)}`);
      }
    }
  } catch (error) {
    return failure('INTERNAL', error instanceof Error ? error.message : String(error));
  }
}
