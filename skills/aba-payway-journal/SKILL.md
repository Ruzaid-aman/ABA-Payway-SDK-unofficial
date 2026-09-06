---
name: aba-payway-journal
description: Query the local ABA PayWay transaction journal — timelines, stats, reconciliation, anomalies, and RCA for AI agents.
version: 1.0.0
---

# Transaction Journal

Opt-in, append-only JSONL record of every PayWay API exchange, command, poll,
observed status, artifact, and webhook capture. This is the AI/agent query
layer over that record — read-only, never a source of payment truth.

## Quick Start

```sh
# Record one invocation (command lifecycle + every API exchange)
payway-sdk --journal generate-qr -a 5.00 -c USD --no-polling -y

# Reconstruct what happened to one transaction
payway-sdk journal timeline -t qrmt8onznj46fdc1 --json

# Provider latency, retry rate, error codes, creation funnel
payway-sdk journal stats

# Which creations never received a callback?
payway-sdk journal reconcile --json
```

```ts
// Library access (all exported from aba-payway-ts)
import {
  computeJournalStats,
  detectJournalAnomalies,
  explainTransaction,
  pruneJournal,
  reconcileTransactions,
} from 'aba-payway-ts';

const rca = explainTransaction('qrmt8onznj46fdc1');   // verdict + steps + hints
const stats = computeJournalStats();                  // latency p50/p90/p99, funnel
const report = reconcileTransactions();               // without-callback bucket
pruneJournal(new Date(Date.now() - 30 * 86_400_000)); // retention
```

## Enabling Recording

- Single invocation: global `--journal` flag (arms the whole command).
- Persistent: `PAYWAY_JOURNAL=1` (+ optional `PAYWAY_JOURNAL_DIR`,
  `PAYWAY_JOURNAL_MODE=digest|full`), or SDK config `journal: true | {dir, mode}`.
- Default OFF — the library never writes files silently. File:
  `<cwd>/payway-data/journal.jsonl`, one JSON event per line.
- `digest` mode (default) stores allow-listed non-secret fields only — no
  hash, no merchant_auth, no pwt, no QR base64, no PII. `full` mode adds
  sanitizeForLog-redacted bodies, size-capped.

## Agent Tool

The agent CLI exposes a read-only `query_journal` tool (planner-listed,
never gated): `query: timeline` (requires `transactionId`; returns the
reconstructed steps + verdict + hints), `stats`, `reconcile`, `anomalies`.
Ask the agent "what happened to transaction X" and it answers from the
journal when recording was on.

## Commands

| Command | Purpose |
| --- | --- |
| `journal show` | Recent events, filter by `--kind` / `--tran`, `--last N` |
| `journal timeline -t <id>` | Chronological history of one transaction |
| `journal stats` | Latency percentiles, retry rate, top errors, funnel |
| `journal reconcile` | Creations vs webhook captures (without-callback bucket) |
| `journal explain -t <id>` | Root-cause narrative + hints |
| `journal anomalies` | Error spikes, retry bursts, latency outliers (heuristics listed in output) |
| `journal prune --before 30` | Retention (days or ISO timestamp) |

## Error Handling

- **A missing callback is NOT proof of non-payment.** PayWay never retries
  missed deliveries; re-check with `check-transaction` before acting.
- **PENDING is not alive.** Expired and closed transactions read PENDING
  forever (no EXPIRED/CLOSED status exists remotely) — keep a local flag.
- **Unpaid QR-only transactions never appear in `transaction-list`** —
  reconcile/poll with check-transaction per transaction instead.
- The journal only knows what was recorded while it was on; empty results
  mean "not journaled", not "never happened".
- Journal write failures never break SDK calls (fail-open); malformed lines
  are skipped by readers and counted in reports.
- `journal prune` never destroys lines it cannot parse.
