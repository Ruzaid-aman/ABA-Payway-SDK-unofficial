# 23 · Close transaction — what it actually does

`close-transaction` cancels a pending transaction. The documented contract says a
closed transaction "will no longer accept payment: any incoming payment will be
rejected or reversed, and no payment notification (callback) will be sent to the
merchant." Sandbox verification (2026-08 → 2026-09) found the remote reality is
more nuanced — this guide is the public, evidence-free statement of what we
learned and the merchant policy the SDK encodes. Behavior divergences were
escalated to the ABA integration team; re-verify against production before
relying on any single line here.

## Observed behavior, by channel

| Channel | Does close take effect? | What the customer sees |
|---|---|---|
| KHQR / QR (online or offline) | **Yes** | Scan refused with the generic **"transaction expired"** message — indistinguishable from natural lifetime expiry at scan time |
| Hosted card page rendered **before** the close | **Not reliably** | A checkout session the customer already holds may still complete payment after the close returned code `00` (sandbox-observed; escalated) |

Additional facts that matter for policy:

- **No CLOSED status exists in any read API.** A closed-unpaid transaction keeps
  reporting `PENDING` via `check-transaction` / `transaction-detail` forever.
  Closure is invisible remotely — you cannot verify a close by reading PayWay.
- Re-closing an already-closed transaction returned code `00` again in sandbox
  (the docs define no "already closed" code; production semantics unconfirmed).
- Unknown `tran_id` on close answers HTTP 403 with numeric code `5`
  ("Transaction not found") — a different shape from check/detail, which answer
  HTTP 200 + `status.code 6` for unknown IDs.
- Unpaid `transaction-detail` rows carry unreliable fields (`payment_amount: 0`,
  empty `payment_currency`, `original_currency` may disagree with the created
  currency, empty operations history). Do not parse unpaid detail rows for state.

## Merchant policy (what the SDK/CLI encodes)

1. **Treat `closeTransaction` as advisory only.** Keep an authoritative local
   `closed` flag on your order/attempt record; never infer closure state from
   PayWay read APIs.
2. **Never fulfill an order off close semantics.** Fulfill only on a verified
   APPROVED callback or server-side status verification (see
   [callbacks & webhooks](callbacks-webhooks.md)).
3. **After closing, keep watching.** Poll `check-transaction` and process
   callbacks for a **late APPROVED after close** — if one arrives, route the
   payment to your refund path immediately.
4. **Kill stale hosted/card sessions yourself.** Because a pre-rendered hosted
   page may survive a close, discard or refresh such pages server-side after
   closing instead of relying on the close call.
5. **Customer communication:** a closed QR and an expired QR look identical to
   the payer ("transaction expired"). Don't promise the customer a distinct
   "cancelled" message.

## Verifying money, not closure

Since closure is unreadable remotely, verify the *money* instead:

```bash
npx tsx src/cli.ts check-transaction -t <tran-id> --json   # online channel
npx tsx src/cli.ts transaction-detail -t <tran-id> --json  # full detail
```

A closed-unpaid transaction reads plain `PENDING` forever — that is expected and
is exactly why the local `closed` flag is the source of truth for your own
cancellation UX.

## Related

- CLI: `payway-sdk close-transaction -t <id>` · SDK: `payway.closeTransaction()` — both in the [SDK & CLI reference](sdk-cli-reference.md).
- [Settlement & disputes](settlement-disputes.md) — where a late approval after close lands (refund boundaries per method).
- [QR code handling](qr-handling.md) — scan-time validity windows and expiry semantics.
