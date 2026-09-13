/**
 * `payway-sdk journal` — query surface for the Transaction Journal (Phase 2,
 * audit-results/transaction-data-audit/REPORT.md §17; closes gap G17).
 *
 * Read-only over the append-only JSONL file. Malformed lines are skipped
 * (never fatal) so a partially-written or evolving journal stays queryable.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import {
  DEFAULT_JOURNAL_FILE_NAME,
  type JournalEventV1,
} from '../../journal/types.js';
import type { WebhookRecord } from '../../webhook/storage.js';
import { explainTransaction, detectJournalAnomalies } from '../../journal/intelligence.js';
import { reconcileTransactions } from '../../journal/reconcile.js';
import { computeJournalStats } from '../../journal/stats.js';
import { pruneJournal, readJournalEvents, resolveJournalDir } from '../../journal/writer.js';
import { currentPalette } from '../ui/theme.js';

function readJournalFile(dir: string) {
  return readJournalEvents(dir);
}

function eventLine(event: JournalEventV1): string {
  const id = event.transactionId ?? event.executionId ?? event.correlationId;
  const parts = [
    event.ts,
    event.kind.padEnd(19),
    id.slice(0, 24).padEnd(24),
    event.status ?? (event.httpStatus !== undefined ? String(event.httpStatus) : ''),
  ];
  return parts.join('  ');
}

/**
 * I-6: load the raw webhook capture store keyed by record id — a
 * `callback.received` journal event's correlationId IS the record id, so the
 * timeline can show the persisted signature verdict / matched status /
 * replay marker behind each callback step.
 */
function loadWebhookRecordsById(): Map<string, WebhookRecord> {
  const file = path.join(
    process.env.PAYWAY_WEBHOOK_DIR?.trim() || path.join(process.cwd(), 'webhook_data'),
    'callbacks.jsonl',
  );
  const byId = new Map<string, WebhookRecord>();
  if (!existsSync(file)) return byId;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const record = JSON.parse(line) as WebhookRecord;
      if (record?.id) byId.set(record.id, record);
    } catch {
      // Malformed captures are skipped — the timeline still renders.
    }
  }
  return byId;
}

export function registerJournalCommands(program: Command): void {
  const journalCmd = program
    .command('journal')
    .description('Query the local transaction journal (enable recording with --journal or PAYWAY_JOURNAL=1)');

  journalCmd
    .command('show')
    .description('Show recent journal events (newest last)')
    .option('--kind <kind>', 'Filter by event kind (e.g. execution.request, poll.attempt)')
    .option('--tran <id>', 'Filter by transaction id')
    .option('--last <n>', 'Limit to the most recent N events', '50')
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--json', 'Machine-readable output')
    .action((opts: { kind?: string; tran?: string; last?: string; dir?: string; json?: boolean }) => {
      const c = currentPalette();
      const { file, events, malformed } = readJournalFile(resolveJournalDir(opts.dir));
      let filtered = events;
      if (opts.kind) filtered = filtered.filter((e) => e.kind === opts.kind);
      if (opts.tran) filtered = filtered.filter((e) => e.transactionId === opts.tran);
      const last = Math.max(0, Number.parseInt(opts.last ?? '50', 10) || 50);
      const shown = filtered.slice(Math.max(0, filtered.length - last));

      if (opts.json) {
        console.log(JSON.stringify({ file, total: events.length, shown: shown.length, malformed, events: shown }, null, 2));
        return;
      }
      if (events.length === 0) {
        console.log(`  ${'No journal events found.'} ${c.dim(file)}`);
        console.log(`  ${c.dim('Enable recording with --journal or PAYWAY_JOURNAL=1.')}`);
        return;
      }
      console.log(`  ${c.dim(file)} — ${shown.length} of ${events.length} events${malformed > 0 ? `, ${malformed} malformed skipped` : ''}`);
      for (const event of shown) console.log(`  ${eventLine(event)}`);
    });

  journalCmd
    .command('timeline')
    .description('Reconstruct the chronological history of one transaction')
    .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--with-webhooks', 'Enrich callback steps with the persisted signature verdict/matched status from the webhook capture store')
    .option('--json', 'Machine-readable output')
    .action((opts: { transactionId: string; dir?: string; withWebhooks?: boolean; json?: boolean }) => {
      const c = currentPalette();
      const { file, events } = readJournalFile(resolveJournalDir(opts.dir));
      let timeline = events
        .filter((e) => e.transactionId === opts.transactionId)
        .sort((a, b) => a.ts.localeCompare(b.ts));

      // I-6: join callback.received events to the raw captures via record id.
      let webhookRecords: Map<string, WebhookRecord> | undefined;
      if (opts.withWebhooks) {
        webhookRecords = loadWebhookRecordsById();
        timeline = timeline.map((event) => {
          if (event.kind !== 'callback.received') return event;
          const record = webhookRecords?.get(event.correlationId);
          if (!record) return event;
          const detail = `${record.signatureVerdict ?? 'no-verdict'}`;
          const extras: string[] = [`verdict=${detail}`];
          if (record.matchedStatus) extras.push(`status=${record.matchedStatus}`);
          if (record.replay) extras.push('replay');
          return { ...event, status: [event.status, extras.join(' ')].filter(Boolean).join(' · ') };
        });
      }

      if (opts.json) {
        console.log(JSON.stringify({ file, transactionId: opts.transactionId, events: timeline }, null, 2));
        return;
      }
      if (timeline.length === 0) {
        console.log(`  No journal events for ${c.bold(opts.transactionId)}.`);
        return;
      }
      console.log(`  ${c.bold('Timeline:')} ${opts.transactionId} (${timeline.length} events)`);
      for (const event of timeline) console.log(`  ${eventLine(event)}`);
    });

  journalCmd
    .command('prune')
    .description('Delete journal events older than a cutoff')
    .option('--before <cutoff>', 'Days back (e.g. 30) or ISO-8601 timestamp', '30')
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--json', 'Machine-readable output')
    .action((opts: { before?: string; dir?: string; json?: boolean }) => {
      const raw = opts.before ?? '30';
      const days = Number.parseFloat(raw);
      const before = Number.isFinite(days) && !raw.includes('T')
        ? new Date(Date.now() - days * 86_400_000)
        : new Date(raw);
      if (Number.isNaN(before.getTime())) {
        console.log(`  Invalid --before value: ${raw}`);
        process.exitCode = 1;
        return;
      }
      const file = path.join(resolveJournalDir(opts.dir), DEFAULT_JOURNAL_FILE_NAME);
      const result = pruneJournal(before, file);
      if (opts.json) {
        console.log(JSON.stringify({ file, before: before.toISOString(), ...result }, null, 2));
        return;
      }
      console.log(`  Pruned ${result.removed} event(s) before ${before.toISOString()}; ${result.kept} kept.`);
    });

  journalCmd
    .command('reconcile')
    .description(
      'Join journal creations with webhook captures: which transactions never received a callback, which callbacks have no tracked creation.',
    )
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--webhook-dir <path>', 'Webhook capture directory (default: PAYWAY_WEBHOOK_DIR or <data root>/webhook_data)')
    .option('--json', 'Machine-readable output')
    .action((opts: { dir?: string; webhookDir?: string; json?: boolean }) => {
      const c = currentPalette();
      const report = reconcileTransactions({ journalDir: opts.dir, webhookDir: opts.webhookDir });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      const { summary } = report;
      console.log(
        `  ${c.bold('Reconcile:')} ${summary.total} transaction(s) — ${summary.withCallback} with callback, ` +
          `${c.red(String(summary.withoutCallback))} without, ${summary.webhookOnly} webhook-only`,
      );
      console.log(`  ${c.dim(`journal: ${report.journalFile ?? '(not found)'} · webhook store: ${report.webhookFile ?? '(not found)'}`)}`);
      if (summary.total === 0) {
        console.log(`  ${c.dim('Nothing to reconcile — enable recording with --journal or PAYWAY_JOURNAL=1.')}`);
        return;
      }
      console.log();
      for (const entry of report.transactions) {
        const flag = entry.callbackReceived
          ? entry.callbackReplaySeen
            ? c.yellow('↺')
            : c.green('✓')
          : c.red('✗ no callback');
        const status = entry.lastStatus ?? '?';
        console.log(`  ${flag} ${c.cyan(entry.transactionId)}  status=${status}  sources=${entry.sources.join('+')}`);
      }
      console.log(
        `\n  ${c.dim('A missing callback is NOT proof of non-payment — PayWay never retries missed deliveries. Re-check with check-transaction.')}`,
      );
    });

  journalCmd
    .command('stats')
    .description('Aggregate analytics: latency percentiles, retry rates, provider errors, creation funnel')
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--json', 'Machine-readable output')
    .action((opts: { dir?: string; json?: boolean }) => {
      const c = currentPalette();
      const report = computeJournalStats({ journalDir: opts.dir });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log(
        `  ${c.bold('Exchanges:')} ${report.exchanges.total} total, ${(report.exchanges.retryRate * 100).toFixed(1)}% retried, ` +
          `${(report.exchanges.failureRate * 100).toFixed(1)}% of attempts failed`,
      );
      console.log(`  ${c.bold('Window:')} ${report.window.from ?? '—'} → ${report.window.to ?? '—'} (${report.window.events} events)`);
      if (report.latency.length > 0) {
        console.log(`\n  ${c.bold('Latency (successful responses):')}`);
        for (const row of report.latency.slice(0, 8)) {
          console.log(`  ${c.dim(row.endpoint)}  n=${row.count}  p50=${row.p50}ms  p90=${row.p90}ms  p99=${row.p99}ms  max=${row.max}ms`);
        }
      }
      if (report.topErrors.length > 0) {
        console.log(`\n  ${c.bold('Top errors:')}`);
        for (const row of report.topErrors.slice(0, 8)) {
          console.log(`  ${c.red(row.code)}  ${row.kind}  x${row.count}  last ${row.lastSeen}`);
        }
      }
      const funnel = report.funnel;
      console.log(
        `\n  ${c.bold('Funnel:')} ${funnel.transactionsTracked} tracked · ${funnel.creationsObserved} creations · ` +
          `${funnel.withObservedStatus} with status · ${c.green(String(funnel.approved))} approved · ` +
          `${c.red(String(funnel.declined))} declined · ${funnel.stillPending} pending · ${funnel.withCallback} with callback`,
      );
      console.log(`  ${c.dim('Funnel reports the local record only — see docs/18 for the gateway blind spots.')}`);
    });

  journalCmd
    .command('explain')
    .description('Root-cause narrative for one transaction from its journal timeline')
    .requiredOption('-t, --transaction-id <id>', 'Transaction ID')
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--json', 'Machine-readable output')
    .action((opts: { transactionId: string; dir?: string; json?: boolean }) => {
      const c = currentPalette();
      const report = explainTransaction(opts.transactionId, { journalDir: opts.dir });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      if (!report.found) {
        console.log(`  ${c.yellow(report.verdict)}`);
        for (const hint of report.hints) console.log(`  ${c.dim(`• ${hint}`)}`);
        return;
      }
      console.log(`  ${c.bold('Investigation:')} ${opts.transactionId}`);
      console.log(`  ${c.bold('Verdict:')} ${report.verdict}`);
      console.log();
      for (const step of report.steps) {
        console.log(`  ${c.dim(step.at)}  ${step.title}${step.detail ? ` — ${c.dim(step.detail)}` : ''}`);
      }
      if (report.hints.length > 0) {
        console.log();
        for (const hint of report.hints) console.log(`  ${c.yellow(`• ${hint}`)}`);
      }
    });

  journalCmd
    .command('anomalies')
    .description('Detect error spikes, retry bursts and latency outliers (documented heuristics)')
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or the PAYWAY_DATA_DIR data root)')
    .option('--json', 'Machine-readable output')
    .action((opts: { dir?: string; json?: boolean }) => {
      const c = currentPalette();
      const report = detectJournalAnomalies({ journalDir: opts.dir });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      if (report.anomalies.length === 0) {
        console.log(`  ${c.green('✓')} No anomalies detected.`);
        return;
      }
      for (const anomaly of report.anomalies) {
        console.log(`  ${c.yellow('▲')} [${anomaly.kind}] ${c.bold(anomaly.subject)} — ${anomaly.metric} (${anomaly.baseline})`);
        console.log(`     ${c.dim(anomaly.detail)}`);
      }
      console.log(`\n  ${c.dim('Heuristics:')}`);
      for (const heuristic of report.heuristics) console.log(`  ${c.dim(`• ${heuristic}`)}`);
    });
}
