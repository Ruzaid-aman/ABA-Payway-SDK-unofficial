/**
 * Transaction Journal — intelligence layer (Phase 6).
 *
 * Composition over Phases 1-3: a root-cause narrative per transaction
 * (`explainTransaction`) and documented-heuristic anomaly detection
 * (`detectJournalAnomalies`). Neither decides payment truth — the audit's
 * provider-side gap register (§8) still applies: no CLOSED/EXPIRED status
 * exists remotely, and a missing callback is not proof of non-payment.
 */

import path from 'node:path';
import { GATEWAY_CODE_HINTS } from '../constants.js';
import type { JournalEventV1 } from './types.js';
import { computeJournalStats } from './stats.js';
import { readJournalEvents, resolveJournalConfig } from './writer.js';

export interface RcaStep {
  at: string;
  title: string;
  detail: string;
}

export interface RcaReport {
  transactionId: string;
  found: boolean;
  /** One-line outcome assessment based on the LOCAL record. */
  verdict: string;
  steps: RcaStep[];
  hints: string[];
}

export interface RcaOptions {
  journalDir?: string;
}

function hintForCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const hint = GATEWAY_CODE_HINTS[code];
  return typeof hint === 'string' ? hint : undefined;
}

export function explainTransaction(
  transactionId: string,
  options: RcaOptions = {},
): RcaReport {
  const dir =
    options.journalDir ?? resolveJournalConfig(undefined, process.env)?.dir ?? path.join(process.cwd(), 'payway-data');
  const { events } = readJournalEvents(dir);

  const relevant = events
    .filter((e) => e.transactionId === transactionId)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  if (relevant.length === 0) {
    return {
      transactionId,
      found: false,
      verdict: 'No journal events found for this transaction id.',
      steps: [],
      hints: [
        'The journal only knows what was recorded while it was enabled — the exchange may predate journaling.',
        `Check the gateway directly: payway-sdk check-transaction -t ${transactionId}`,
      ],
    };
  }

  const steps: RcaStep[] = [];
  const hints: string[] = [];
  let sawError = false;
  let callbackEvent: JournalEventV1 | undefined;
  let lastStatus: string | undefined;
  let attempts = 0;

  for (const event of relevant) {
    if (event.kind === 'execution.request') {
      attempts += 1;
      if (attempts === 1) {
        steps.push({
          at: event.ts,
          title: 'Creation request sent',
          detail: `${event.endpoint}${event.requestDigest !== undefined ? ` — ${summarizeDigest(event.requestDigest)}` : ''}`,
        });
      } else if (event.attempt !== undefined) {
        steps.push({ at: event.ts, title: `Retry attempt #${event.attempt}`, detail: event.endpoint ?? '' });
      }
    } else if (event.kind === 'execution.response') {
      steps.push({
        at: event.ts,
        title: `Gateway answered HTTP ${event.httpStatus ?? '?'}`,
        detail:
          `${event.durationMs !== undefined ? `${event.durationMs}ms` : 'duration unknown'}` +
          `${event.traceId ? `, trace ${event.traceId}` : ''}` +
          `${event.responseDigest !== undefined ? ` — ${summarizeDigest(event.responseDigest)}` : ''}`,
      });
    } else if (event.kind === 'execution.error') {
      sawError = true;
      const code = event.paywayCode ?? (event.httpStatus !== undefined ? `HTTP ${event.httpStatus}` : event.error?.code);
      steps.push({
        at: event.ts,
        title: `Failed attempt${event.attempt !== undefined ? ` #${event.attempt}` : ''}`,
        detail: `${code ?? ''} ${event.error?.message ?? ''}`.trim(),
      });
      const hint = hintForCode(event.paywayCode);
      if (hint) hints.push(`Gateway hint for code ${event.paywayCode}: ${hint}`);
    } else if (event.kind === 'poll.attempt') {
      if (event.status && !event.status.startsWith('ERROR:')) {
        steps.push({ at: event.ts, title: `Poll #${event.attempt ?? '?'}: ${event.status}`, detail: `${event.durationMs ?? '?'}ms` });
      }
    } else if (event.kind === 'status.observed') {
      if (event.status) {
        lastStatus = event.status;
        steps.push({ at: event.ts, title: `Status observed: ${event.status}`, detail: event.endpoint ?? '' });
      }
    } else if (event.kind === 'callback.received') {
      callbackEvent = event;
      steps.push({
        at: event.ts,
        title: 'Callback received',
        detail: `${event.endpoint ?? 'webhook route'} (webhook record ${event.correlationId})`,
      });
    } else if (event.kind === 'artifact.written') {
      steps.push({ at: event.ts, title: 'Artifact saved', detail: event.artifact?.path ?? event.artifact?.artifactId ?? '' });
    }
  }

  // Verdict + hints from the local record only — never gateway truth.
  let verdict: string;
  if (callbackEvent && lastStatus === 'APPROVED') {
    verdict = 'APPROVED — callback captured. Check the webhook record signature verdict before fulfilling.';
  } else if (callbackEvent) {
    verdict = `Callback captured (status ${callbackEvent.status ?? 'unknown'}); last observed status ${lastStatus ?? 'none'}.`;
  } else if (sawError && !lastStatus) {
    verdict = 'The exchange failed before a status was ever observed.';
  } else if (lastStatus === 'APPROVED') {
    verdict = 'APPROVED per status reads, but NO callback was captured — deliver on the status read or re-check; PayWay never retries missed callbacks.';
    hints.push('A missing callback is NOT proof of non-payment — the delivery may have been missed while no listener ran.');
  } else if (lastStatus === 'DECLINED' || lastStatus === 'CANCELLED') {
    verdict = `Terminal non-success status: ${lastStatus}.`;
  } else {
    verdict = `Still non-terminal (${lastStatus ?? 'no status observed'}). Note: expired and closed transactions read PENDING forever — the gateway has no EXPIRED/CLOSED status.`;
    hints.push('Keep an authoritative local closed/expired flag; the gateway cannot tell you remotely.');
    hints.push('Unpaid QR-only transactions never appear in transaction-list — poll with check-transaction instead.');
  }
  if (attempts > 1) hints.push(`This exchange was attempted ${attempts} times (retries) — check the transport errors above.`);

  return { transactionId, found: true, verdict, steps, hints };
}

function summarizeDigest(digest: unknown): string {
  if (digest === null || digest === undefined) return '';
  if (typeof digest === 'string') return digest.slice(0, 120);
  const json = JSON.stringify(digest);
  return json.length > 160 ? `${json.slice(0, 160)}…` : json;
}

// ─── Anomaly detection ───────────────────────────────────────────────────────

export interface JournalAnomaly {
  kind: 'error-spike' | 'retry-burst' | 'latency-outlier';
  subject: string;
  detail: string;
  metric: string;
  baseline: string;
}

export interface AnomaliesReport {
  anomalies: JournalAnomaly[];
  heuristics: string[];
}

export function detectJournalAnomalies(options: RcaOptions = {}): AnomaliesReport {
  const dir =
    options.journalDir ?? resolveJournalConfig(undefined, process.env)?.dir ?? path.join(process.cwd(), 'payway-data');
  const { events } = readJournalEvents(dir);
  const anomalies: JournalAnomaly[] = [];

  // Error spikes: a day with >= 5 errors and >= 3x the mean of active days.
  const errorsByDay = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'execution.error') continue;
    const day = event.ts.slice(0, 10);
    errorsByDay.set(day, (errorsByDay.get(day) ?? 0) + 1);
  }
  if (errorsByDay.size > 0) {
    const counts = [...errorsByDay.entries()];
    for (const [day, count] of counts.sort((a, b) => a[0].localeCompare(b[0]))) {
      // Leave-one-out baseline: a spike must not dilute itself.
      const others = counts.filter(([d]) => d !== day).map(([, c]) => c);
      if (others.length === 0) continue;
      const baseline = others.reduce((a, b) => a + b, 0) / others.length;
      if (count >= 5 && count >= 3 * baseline) {
        anomalies.push({
          kind: 'error-spike',
          subject: day,
          metric: `${count} failed attempts`,
          baseline: `mean ${baseline.toFixed(1)}/other active day`,
          detail: 'Group the day by paywayCode with `journal stats --json` (topErrors) before escalating to the gateway.',
        });
      }
    }
  }

  // Retry bursts: a day with >= 3 retried exchanges and >= 3x the mean.
  const retriedByDay = new Map<string, number>();
  const attemptsPerCid = new Map<string, { count: number; day: string }>();
  for (const event of events) {
    if (event.kind !== 'execution.request' || !event.correlationId) continue;
    const current = attemptsPerCid.get(event.correlationId);
    attemptsPerCid.set(event.correlationId, {
      count: (current?.count ?? 0) + 1,
      day: current?.day ?? event.ts.slice(0, 10),
    });
  }
  for (const { count, day } of attemptsPerCid.values()) {
    if (count > 1) retriedByDay.set(day, (retriedByDay.get(day) ?? 0) + 1);
  }
  if (retriedByDay.size > 0) {
    const counts = [...retriedByDay.entries()];
    for (const [day, count] of counts.sort((a, b) => a[0].localeCompare(b[0]))) {
      const others = counts.filter(([d]) => d !== day).map(([, c]) => c);
      if (others.length === 0) continue;
      const baseline = others.reduce((a, b) => a + b, 0) / others.length;
      if (count >= 3 && count >= 3 * baseline) {
        anomalies.push({
          kind: 'retry-burst',
          subject: day,
          metric: `${count} retried exchanges`,
          baseline: `mean ${baseline.toFixed(1)}/other active day`,
          detail: 'Retries cluster around 429/5xx windows — check the gateway responses for those cids.',
        });
      }
    }
  }

  // Latency outliers: endpoint p99 >= 3x p50 with at least 5 samples.
  const stats = computeJournalStats({ journalDir: dir });
  for (const row of stats.latency) {
    if (row.count >= 5 && row.p99 >= 3 * row.p50 && row.p50 > 0) {
      anomalies.push({
        kind: 'latency-outlier',
        subject: row.endpoint,
        metric: `p99 ${row.p99}ms vs p50 ${row.p50}ms`,
        baseline: `${row.count} samples`,
        detail: 'A heavy tail on one endpoint suggests gateway-side slowness — correlate with provider errors on the same day.',
      });
    }
  }

  return {
    anomalies,
    heuristics: [
      'error-spike: a day with >= 5 failed attempts and >= 3x the mean of the OTHER active days',
      'retry-burst: a day with >= 3 retried exchanges and >= 3x the mean of the OTHER active days',
      'latency-outlier: an endpoint with >= 5 samples whose p99 is >= 3x its p50',
    ],
  };
}
