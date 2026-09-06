/**
 * Transaction Journal — reconciliation engine (Phase 3).
 *
 * Answers the audit's money questions — "which creations never received a
 * callback?", "which callbacks arrived without a tracked creation?" — by
 * joining the journal (creations, poll attempts, observed statuses) with the
 * webhook capture store (callback deliveries). Pure and side-effect-free.
 *
 * Honesty rule (audit §8): a missing callback is NOT proof of non-payment —
 * PayWay never retries missed deliveries, so this report flags discrepancies
 * for investigation; it never decides fulfillment.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { extractTransactionIdFrom } from './digest.js';
import { readJournalEvents, resolveJournalConfig } from './writer.js';

export interface ReconcileEntry {
  transactionId: string;
  firstSeen?: string;
  lastEventAt?: string;
  lastStatus?: string;
  journalEvents: number;
  callbackReceived: boolean;
  callbackAt?: string;
  callbackRoute?: string;
  /** A (transactionId, status) callback pair was captured more than once. */
  callbackReplaySeen: boolean;
  sources: Array<'journal' | 'webhook-store'>;
}

export interface ReconcileReport {
  /** Sorted by firstSeen (journal entries) then callbackAt (webhook-only). */
  transactions: ReconcileEntry[];
  summary: {
    total: number;
    withCallback: number;
    withoutCallback: number;
    webhookOnly: number;
  };
  journalFile?: string;
  webhookFile?: string;
  malformedJournalLines: number;
  malformedWebhookLines: number;
}

export interface ReconcileOptions {
  /** Journal directory. Default: PAYWAY_JOURNAL_DIR or <cwd>/payway-data. */
  journalDir?: string;
  /** Webhook capture directory holding callbacks.jsonl. Default: <cwd>/webhook_data. */
  webhookDir?: string;
}

const DEFAULT_WEBHOOK_DIR_NAME = 'webhook_data';

interface WebhookDelivery {
  transactionId?: string;
  status?: string;
  receivedAt: string;
  route?: string;
  replay?: boolean;
}

function extractDelivery(record: {
  body: string;
  receivedAt: string;
  khqr?: { parsed?: { notification?: { transactionId?: string; paymentStatus?: string } } };
  matchedTransactionId?: string;
  matchedStatus?: string;
  replay?: boolean;
}): WebhookDelivery {
  // Prefer the Phase 3 extracted fields; fall back to parsing the raw body;
  // KHQR notifications carry their parsed notification metadata.
  if (record.matchedTransactionId || record.matchedStatus) {
    return {
      transactionId: record.matchedTransactionId,
      status: record.matchedStatus,
      receivedAt: record.receivedAt,
      replay: record.replay,
    };
  }
  if (record.khqr?.parsed?.notification) {
    const notification = record.khqr.parsed.notification;
    return {
      transactionId: notification.transactionId,
      status: notification.paymentStatus,
      receivedAt: record.receivedAt,
      replay: record.replay,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.body);
  } catch {
    parsed = undefined;
  }
  const body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  const status =
    body && typeof body.status === 'string'
      ? body.status
      : body && typeof body.payment_status === 'string'
        ? body.payment_status
        : undefined;
  return { transactionId: extractTransactionIdFrom(body), status, receivedAt: record.receivedAt };
}

export function reconcileTransactions(options: ReconcileOptions = {}): ReconcileReport {
  const journalDir = options.journalDir ?? resolveJournalConfig(undefined, process.env)?.dir ?? path.join(process.cwd(), 'payway-data');
  const webhookDir = options.webhookDir ?? path.join(process.cwd(), DEFAULT_WEBHOOK_DIR_NAME);

  const journal = readJournalEvents(journalDir);
  const webhookFile = path.join(webhookDir, 'callbacks.jsonl');
  const deliveries: WebhookDelivery[] = [];
  let malformedWebhookLines = 0;
  if (existsSync(webhookFile)) {
    for (const line of readFileSync(webhookFile, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        deliveries.push(extractDelivery(JSON.parse(line) as Parameters<typeof extractDelivery>[0]));
      } catch {
        malformedWebhookLines += 1;
      }
    }
  }

  const byTransaction = new Map<string, ReconcileEntry>();
  const callbackSeenPerTransaction = new Map<string, number>();
  const entryFor = (transactionId: string): ReconcileEntry => {
    let entry = byTransaction.get(transactionId);
    if (!entry) {
      entry = {
        transactionId,
        journalEvents: 0,
        callbackReceived: false,
        callbackReplaySeen: false,
        sources: [],
      };
      byTransaction.set(transactionId, entry);
    }
    return entry;
  };

  for (const event of journal.events) {
    if (!event.transactionId) continue;
    const entry = entryFor(event.transactionId);
    entry.sources = entry.sources.includes('journal') ? entry.sources : [...entry.sources, 'journal'];
    entry.journalEvents += 1;
    entry.firstSeen ??= event.ts;
    entry.lastEventAt = entry.lastEventAt && entry.lastEventAt > event.ts ? entry.lastEventAt : event.ts;
    if (event.kind === 'callback.received') {
      // A SECOND callback.received for one transaction is itself a replay
      // signal (ABA is not supposed to re-deliver).
      const seen = (callbackSeenPerTransaction.get(event.transactionId) ?? 0) + 1;
      callbackSeenPerTransaction.set(event.transactionId, seen);
      if (seen > 1) entry.callbackReplaySeen = true;
      entry.callbackReceived = true;
      entry.callbackAt ??= event.ts;
      entry.callbackRoute ??= event.endpoint;
    } else if (event.status) {
      entry.lastStatus = event.status;
    }
  }

  for (const delivery of deliveries) {
    if (!delivery.transactionId) continue;
    const entry = entryFor(delivery.transactionId);
    entry.sources = entry.sources.includes('webhook-store')
      ? entry.sources
      : [...entry.sources, 'webhook-store'];
    const seen = (callbackSeenPerTransaction.get(delivery.transactionId) ?? 0) + 1;
    callbackSeenPerTransaction.set(delivery.transactionId, seen);
    if (seen > 1) entry.callbackReplaySeen = true;
    if (delivery.replay) entry.callbackReplaySeen = true;
    if (!entry.callbackReceived) {
      entry.callbackReceived = true;
      entry.callbackAt = delivery.receivedAt;
      entry.callbackRoute = '/aba-payway-webhook';
    }
    if (delivery.status && !entry.lastStatus) entry.lastStatus = delivery.status;
  }

  const transactions = [...byTransaction.values()].sort((a, b) => {
    const aKey = a.firstSeen ?? a.callbackAt ?? '';
    const bKey = b.firstSeen ?? b.callbackAt ?? '';
    return aKey.localeCompare(bKey);
  });

  const webhookOnly = transactions.filter((t) => !t.sources.includes('journal')).length;
  const withCallback = transactions.filter((t) => t.callbackReceived).length;

  return {
    transactions,
    summary: {
      total: transactions.length,
      withCallback,
      withoutCallback: transactions.length - withCallback,
      webhookOnly,
    },
    journalFile: journal.file,
    webhookFile: existsSync(webhookFile) ? webhookFile : undefined,
    malformedJournalLines: journal.malformed,
    malformedWebhookLines,
  };
}
