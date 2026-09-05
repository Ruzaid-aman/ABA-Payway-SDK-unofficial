---
name: aba-payway-bulk-operations
description: Run one transaction operation (close, check, detail) across many ABA PayWay transaction IDs with per-item results, rate-limit pacing, and evidence reports.
version: 1.0.0
---

# Bulk Transaction Operations (tx-batch)

## Quick Start
```sh
# Status sweep over a set of transactions (partial failure → exit 1)
payway-sdk tx-batch check -t id1 -t id2 -t id3 --json

# Close a whole campaign batch (DESTRUCTIVE customer-side — needs -y)
payway-sdk tx-batch close --ids-file campaign-ids.txt -y --report closed-batch.md

# Full detail for many transactions, paced under the gateway's 10/min cap
payway-sdk tx-batch detail --ids-file ids.txt --pace 0 --json
```

## SDK equivalent (no batch API — loop with pacing yourself)
```ts
// tx-batch detail is this loop with 6100 ms spacing (10/min gateway cap):
for (const id of ids) {
  try {
    const d = await payway.checkout.getTransactionDetail(id);
    console.log(id, (d.data as { payment_status?: string })?.payment_status);
  } catch (e) {
    console.log(id, 'FAILED', (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, 6100));
}
```

## When to use this vs single commands
- **1–3 IDs:** use the single commands (`check-transaction`, `close-transaction`, `transaction-detail`) — normal output, per-call confirmation.
- **Many IDs (campaign cleanup, reconciliation sweeps, QA batches):** `tx-batch` — one command, per-item envelopes, no fail-fast, built-in rate-limit pacing, machine-readable summary.

## Command shape
```sh
payway-sdk tx-batch <close|check|detail> [-t <id>]... [--ids-file <path>] [--dry-run] [-y] [--json] [--pace <ms>] [--report <path>]
```

| Option | Meaning |
|---|---|
| `-t, --transaction-id <id>` | Repeatable target ID |
| `--ids-file <path>` | One ID per line; `#` comments and blank lines ignored; deduped in order |
| `--dry-run` | List resolved targets, make NO network calls, exit 0 |
| `-y, --force` | **Required for `close`** when non-interactive (`--json`/no TTY) |
| `--json` | `{operation, total, ok, failed, results:[{id, ok, code, status, error}]}` |
| `--pace <ms>` | Override inter-call delay (default: endpoint-appropriate) |
| `--report <path>` | Write a markdown evidence table (campaign capture format) |

## Rate-limit pacing (built in — do not hand-loop)
| Operation | Default pace | Why |
|---|---|---|
| check | 0 ms | check-transaction allows 600 req/s |
| close | 250 ms | no documented cap; politeness delay |
| detail | 6100 ms | transaction-detail is 10/min — a naive loop gets HTTP 403 body code 429 |

## Exit codes (F12 convention)
- `0` — every item ok
- `1` — partial failure (some items failed)
- `2` — every item failed (or the only item failed)

Locally invalid IDs (bad tran_id shape) are recorded as failed items WITHOUT a network call — they don't consume rate-limit budget.

## ⚠️ Batch close is a destructive sweep
`close` kills QRs customer-side (KHQR scans refused with "transaction expired"), while closed-unpaid keeps reporting PENDING and closed hosted-card sessions may still pay (channel-dependent enforcement — see `aba-payway-transaction-close`). Before closing in bulk:
1. Run `--dry-run` first and eyeball the target list.
2. Remember there is NO un-close: verify each ID belongs to the batch you intend.
3. Follow up with `tx-batch check` — code 00 close + PENDING check is the expected closed-unpaid state, indistinguishable remotely.

## Item semantics
| Operation | ok = true when | Failed item examples |
|---|---|---|
| close | gateway answers code `00` | unknown error envelope, network failure |
| check | a `payment_status` came back | not-found (code 6), rate-limited (429) |
| detail | detail `data` present | not indexed yet (~5 s lag after creation), not-found |

`status` on a `check` item is the payment status (APPROVED/PENDING/…); `code` carries the PayWay business code where present.

## Typical campaign flow
```sh
# 1. Preview targets
payway-sdk tx-batch close --ids-file ids.txt --dry-run
# 2. Sweep statuses before cleanup
payway-sdk tx-batch check --ids-file ids.txt --json
# 3. Close with evidence
payway-sdk tx-batch close --ids-file ids.txt -y --report test-output/<campaign>/close-report.md
# 4. Confirm the post-close state (expect PENDING everywhere unpaid)
payway-sdk tx-batch check --ids-file ids.txt --json
```

## Error Handling
- **Command-level errors (exit 1 before any call):** unknown operation, no IDs resolved, unreadable `--ids-file`, `--report` path unwritable, batch `close` without `-y` when non-interactive (`--json`).
- **Item-level failures never abort the sweep** — each item carries `{ id, ok: false, code?, error? }` with the PayWay business code where present (`6` not-found, `429` rate-limited, `PTL*` signature/param families).
- **Exit 1 (partial) vs exit 2 (all failed)** lets scripts branch: a reconciliation cron can alert on exit 2 and just log exit 1.
- A `close` item returning `ok: true` only means the gateway ACCEPTED the close request (code 00) — it does NOT prove the transaction can no longer be paid on the hosted-card channel (see aba-payway-transaction-close).
