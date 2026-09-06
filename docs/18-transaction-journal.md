# 18 — Transaction Journal

> Shipped as Phase 1 (Observability) of the transaction-data modernization roadmap —
> see `audit-results/transaction-data-audit/REPORT.md` for the full audit (gap register
> G1–G18) and the phase plan.

The Transaction Journal is an **opt-in, append-only JSONL record of every PayWay API
exchange** the SDK makes: correlation id, retry attempts, duration, gateway trace id,
and a redacted digest of each request/response body.

It exists because today that metadata is computed inside the SDK's shared HTTP executor
(`_executeFetch`) and then discarded — the debug console (only when `debug: true`) and
the `onRequest`/`onResponse` hooks are the only witnesses, and neither carries the
correlation id, the attempt number, the duration, or the error paths.

## Enabling

| Channel | Value |
| --- | --- |
| Config | `new PayWay({ journal: true })` — defaults below |
| Config | `new PayWay({ journal: { dir: 'C:/data/payway', mode: 'full' } })` |
| Env | `PAYWAY_JOURNAL=1` (+ optional `PAYWAY_JOURNAL_DIR`, `PAYWAY_JOURNAL_MODE`) |

Precedence: config wins; env fills anything the config omits; `journal: false` always
disables. **Default is OFF** — a library must never write files silently.

| Setting | Default | Meaning |
| --- | --- | --- |
| dir | `<cwd>/payway-data` | journal file lives at `<dir>/journal.jsonl` |
| mode | `digest` | how much of each body is recorded (below) |

The journal never throws and never blocks execution: a failed write degrades to a
single `console.warn` and the SDK call proceeds exactly as before.

## Events

One JSON object per line, envelope `{version, ts, eventId, kind, correlationId, …}`
(schema-validated before write; readers must tolerate unknown `kind` values).

| kind | Fires when | Source |
| --- | --- | --- |
| `execution.started` | Every executed CLI command (preAction) | CLI |
| `execution.request` | Each attempt of each API call (retries included — the attempt number distinguishes send #1 from send #N) | SDK transport |
| `execution.response` | Every parsed 2xx body, **including 200-wrapped business failures** (same EC-06 semantics as the `onResponse` hook) | SDK transport |
| `execution.error` | Every thrown path: HTTP errors, empty-body guard, link-card HTML, JSON-parse failures, network/timeout/abort — the paths where no hook fires | SDK transport |
| `poll.attempt` | Every poll of a transaction (previously stdout-only — gap G16), grouped under one poll correlation id | CLI polling |
| `status.observed` | Normalized payment-status reading: check-transaction, transaction-detail, terminal poll event | CLI |
| `artifact.written` | Agent artifact saved (links sidecar ↔ journal via executionId/correlationId) | agent |
| `callback.received` | Webhook delivery captured by the dev listener — both routes; joins the journal to the raw webhook record via `correlationId` (the record id) | webhook sink |

## Callback capture (Phase 3)

The webhook sink (`setup-webhook`) now persists what it used to compute-and-drop
(audit gap G7) and extracts the correlation join key (G8):

- **`signatureVerdict`** on every online-route record: `verified` / `invalid` /
  `unsigned`, with `verificationReason` (`signature_mismatch` / `malformed_signature`
  / `empty_body`) on failures. The KHQR route never sets it — ABA publishes no auth
  contract for those notifications.
- **`matchedTransactionId` / `matchedStatus`** extracted best-effort from the raw
  body (online route) or the parsed notification (KHQR route).
- **`replay: true`** when a prior stored record already carries the same
  `(matchedTransactionId, matchedStatus)` — the marker for idempotent processing.
  PayWay does not retry missed deliveries, but integrators DO receive duplicate
  notifications in some flows; treat replays as already-processed, not as new events.
- Every delivery emits a `callback.received` journal event when journaling is on.
- SQLite databases migrate in place (`ensureCallbackMetadataColumns` — five additive
  columns, duplicate-tolerant); JSONL needs no migration.

**Reconciliation** — `payway-sdk journal reconcile [--dir] [--webhook-dir] [--json]`
joins the two stores per transaction id and reports: with callback, **without
callback** (the "created but never called back" query), and webhook-only (callback
arrived while journaling was off), plus duplicate-delivery flags. A missing callback
is **not** proof of non-payment — PayWay never retries missed deliveries; re-check
with `check-transaction` before acting.

Join keys on every event: `correlationId` (the SDK per-exchange cid), `attempt`,
`endpoint`, `transactionId`/`merchantRef` when the request or response carries them,
`traceId` (the gateway's `status.trace`), `httpStatus`, `paywayCode`, `durationMs`,
`status` (normalized payment status on poll/observed events), `artifact` on
artifact events.

Reconstruct a transaction timeline: `payway-sdk journal timeline -t <transactionId>`
(or filter the file on `transactionId` and sort by `ts`).

## Querying (CLI)

```
payway-sdk journal show [--kind <kind>] [--tran <id>] [--last <n>] [--dir <path>] [--json]
payway-sdk journal timeline -t <transactionId> [--dir <path>] [--json]
payway-sdk journal prune [--before <days|ISO>] [--dir <path>] [--json]
```

`--journal` (or `PAYWAY_JOURNAL=1`) turns on recording for a single invocation —
command lifecycle *and* every API exchange. Malformed lines are skipped by the
readers, never fatal.

## Agent-mode records (Phase 2 additions)

- **`agent ledger recover [--session-id <id>] [--json]`** lists unfinished executions
  (planned/confirmed/submitted/outcome_unknown) and prints the `check-transaction`
  recovery hint for each. **Lookup only — creates are never replayed.** With no
  `--session-id`, the most recent session is inspected. (Closes gap G10.)
- Ledger records now carry a **`resultSummary`** — a scrubbed, allow-listed digest of
  what a successful create returned (transaction ids, checkout URLs; never payloads or
  secrets). (Closes gap G5.)
- Session `tool_result` events carry the same digest in `data` (previously
  `{tool, ok, error}` only — gap G6), and each executed create emits the previously
  dormant `'ledger'` session event with the record's final status + correlation id
  (gap G12).
- Agent artifacts saved during a session emit `artifact.written` journal events when
  `PAYWAY_JOURNAL` is set.

## Hook enrichment (Phase 2, backward compatible)

`onRequest`/`onResponse` receive a trailing `meta` argument
(`{correlationId, attempt, durationMs?, traceId?}`) — existing two-argument handlers
keep working. New `onError` hook fires on every failed attempt (HTTP errors, network,
timeout, business failures) — the paths `onResponse` never sees:

```ts
new PayWay({
  // …
  onError: (info) => console.error(`${info.endpoint} failed: ${info.message} (cid=${info.correlationId})`),
});
```

## Digest vs full mode

Redaction at write is mandatory in both modes — request bodies carry the HMAC `hash`,
and the journal is the only place bodies are persisted at all.

- **`digest` (default)** — allow-listed transactional fields only: ids
  (`tran_id`, `merchant_id`, `request_id`, `ctid`), amounts/currencies, lifetime,
  payment option/gate, `token_flag`/`frequency`, `return_url`/`callback_url`,
  `merchant_ref`. Response side keeps the `status` block and the scalar payment
  fields inside `data` (`payment_status`, amounts, `apv`, `bank_ref`, …). Excluded by
  design: `hash`, `merchant_auth` (shown as `[ENCRYPTED n chars]` in full mode),
  `pwt`/tokens, `qr_string`/`qr_image` base64 blobs, and personal data
  (firstname/lastname/email/phone). Long strings cap at 200 chars; arrays/objects
  reduce to `{type, length/keys}`.
- **`full`** — the whole body through `sanitizeForLog` (hash/secret/token keys and
  40+-hex values masked), size-capped at ~16 KB per body. Use for deep debugging
  sessions, not for always-on operation.

## Pruning

The journal grows unbounded by design (like the webhook capture store). Trim it with
the exported helper (CLI command planned for Phase 2):

```ts
import { pruneJournal } from 'aba-payway-ts';

const { removed, kept } = pruneJournal(new Date(Date.now() - 30 * 86_400_000));
```

`pruneJournal` never destroys lines it cannot parse, and rewrites the file atomically
(temp + rename).

## What the journal is not

- Not a fulfillment source of truth — merchant order state remains yours (same rule as
  webhook captures).
- Not a replacement for the agent execution ledger (lifecycle + never-replay) or the
  webhook raw-capture store — it is the third leg: transport-level truth.
- Not synchronized with the gateway's clock: `ts` is local UTC ISO; gateway-side
  timestamps (`transaction_date`) use their own semantics — see SANDBOX-FINDINGS §21
  (W5-13).
