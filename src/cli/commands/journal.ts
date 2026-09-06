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
  DEFAULT_JOURNAL_DIR_NAME,
  DEFAULT_JOURNAL_FILE_NAME,
  type JournalEventV1,
} from '../../journal/types.js';
import { pruneJournal, resolveJournalConfig } from '../../journal/writer.js';
import { currentPalette } from '../ui/theme.js';

function resolveJournalDir(explicit: string | undefined): string {
  return (
    explicit ??
    resolveJournalConfig(undefined, process.env)?.dir ??
    path.join(process.cwd(), DEFAULT_JOURNAL_DIR_NAME)
  );
}

interface JournalFileRead {
  file: string;
  events: JournalEventV1[];
  malformed: number;
}

function readJournalFile(dir: string): JournalFileRead {
  const file = path.join(dir, DEFAULT_JOURNAL_FILE_NAME);
  const events: JournalEventV1[] = [];
  let malformed = 0;
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const parsed = JSON.parse(line) as JournalEventV1;
        if (parsed && typeof parsed === 'object' && typeof parsed.kind === 'string') {
          events.push(parsed);
        } else {
          malformed += 1;
        }
      } catch {
        malformed += 1;
      }
    }
  }
  return { file, events, malformed };
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
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or <cwd>/payway-data)')
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
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or <cwd>/payway-data)')
    .option('--json', 'Machine-readable output')
    .action((opts: { transactionId: string; dir?: string; json?: boolean }) => {
      const c = currentPalette();
      const { file, events } = readJournalFile(resolveJournalDir(opts.dir));
      const timeline = events
        .filter((e) => e.transactionId === opts.transactionId)
        .sort((a, b) => a.ts.localeCompare(b.ts));

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
    .option('--dir <path>', 'Journal directory (default: PAYWAY_JOURNAL_DIR or <cwd>/payway-data)')
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
}
