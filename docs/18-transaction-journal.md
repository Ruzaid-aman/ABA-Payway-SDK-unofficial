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
(schema-validated before write; readers must tolerate unknown `kind` values — Phase 2
adds `execution.started`, `poll.attempt`, `callback.received`, `status.observed`,
`artifact.written`).

| kind | Fires when |
| --- | --- |
| `execution.request` | Each attempt of each API call (retries included — the attempt number distinguishes send #1 from send #N) |
| `execution.response` | Every parsed 2xx body, **including 200-wrapped business failures** (same EC-06 semantics as the `onResponse` hook) |
| `execution.error` | Every thrown path: HTTP errors, empty-body guard, link-card HTML, JSON-parse failures, network/timeout/abort — the paths where no hook fires |

Join keys on every event: `correlationId` (the SDK per-exchange cid), `attempt`,
`endpoint`, `transactionId`/`merchantRef` when the request or response carries them,
`traceId` (the gateway's `status.trace`), `httpStatus`, `paywayCode`, `durationMs`.

Reconstruct a transaction timeline: filter the file on `transactionId` (or
`correlationId` for a single exchange) and sort by `ts`.

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
