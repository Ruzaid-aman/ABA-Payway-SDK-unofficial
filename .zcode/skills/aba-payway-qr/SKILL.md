---
name: aba-payway-qr
description: Generate an online ABA PayWay KHQR payment QR code.
metadata:
  version: 1.5.1
---

# ABA PayWay QR

## Quick Start

For onboarding, start with [first payment](../aba-payway-first-payment/SKILL.md).
Use the shared lifecycle: `created`, `pending`, `approved`, `failed`, `unknown`.
Creation is not approval. Verify order ID, amount, and currency before fulfilling once.
A timeout means unknown; query the existing attempt before replacing it.
Expiry and closure remain local policy, even when the gateway reads PENDING.
See [webhook production](../aba-payway-webhook-production/SKILL.md) for callback trust and recovery.
Run the installed CLI as `npm exec -- payway-sdk`.

```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
const qr = await payway.qr.generateQr({ transactionId: 'order-123', amount: 10, paymentOption: 'abapay_khqr', callbackUrl: 'https://merchant.example/payway/callback' });
```

Use an HTTPS callback URL and save the transaction ID before displaying the returned QR data.

> **Mutation retry policy (F01):** `generateQr` is a side-effecting create —
> the SDK submits it exactly ONCE by default. A network failure after the send
> means the outcome is UNKNOWN (the QR may exist at the gateway; duplicate
> tran_ids are silently accepted and yield unpayable QRs, W5-7). On failure,
> reconcile the transaction ID with `check-transaction` before creating a new
> one — never blind-retry. The CLI/agent paths already behave this way; the
> direct SDK now matches them (`mutationRetryPolicy: 'transient'` config or
> `maxRetries` restores retries if you have verified idempotency).

## Optional params (v1.3.6 parity, all live-documented)

`generateQr` accepts nine optional params beyond the basics — all are hash positions (omitted fields hash as `''`):

```ts
const qr = await payway.qr.generateQr({
  transactionId: 'order-123', amount: 10, currency: 'USD',
  paymentOption: 'abapay_khqr', callbackUrl: 'https://merchant.example/payway/callback',
  firstName: 'John', lastName: 'Doe', email: 'j@example.com', phone: '+855…',
  items: [{ name: 'Item', price: 10, quantity: 1 }],        // ≤10 items, base64-encoded when an array
  returnDeeplink: { ios_scheme: 'myapp://done', android_scheme: 'myapp://done' },
  customFields: { orderId: 'A-123' },
  returnParams: 'label=ok',
  payout: [{ account: '500000001', amount: 10 }],           // ⚠️ {account, amount} keys HERE —
});                                                         // the purchase path uses {acc, amt} instead
                                                            // (sandbox: use a seeded account — see sandbox-beneficiaries)
```

CLI flags (all JSON-or-string flags accept inline JSON or raw strings): `--first-name --last-name --email --phone --items --return-deeplink --custom-fields --return-params --payout`. Advisory caps (warn; throw under `strictValidation`): names ≤20 chars, email ≤50, phone ≤20, `items` ≤10 entries / ≤500 chars encoded, wechat/alipay USD-only.

## CLI: QR Image Auto-Open
`payway-sdk generate-qr` saves the PNG to `payway-output/<txId>.png` and can pop it straight into the OS default image viewer:

- **Default (auto):** opens the saved PNG only when stdout is an interactive TTY — agents/CI runs stay quiet.
- `--open-image` — force-open regardless of TTY (e.g. `payway-sdk generate-qr -a 5 -c USD --lifetime 600 --open-image -y`).
- `--no-open-image` — never open; the terminal QR render and PNG path are still printed.
- Viewer is allowlisted per platform (Windows `rundll32 url.dll,FileProtocolHandler`, macOS `open`, Linux `xdg-open`) and spawned without a shell. Failure degrades gracefully with a manual-open hint.

## SDK: Open the Saved PNG
```ts
import { openImageInDefaultViewer } from 'aba-payway-ts';
const result = await openImageInDefaultViewer('payway-output/order-123.png');
if (!result.opened) console.warn(result.reason); // missing_file | unsupported_platform | spawn_error
```
Best-effort, never throws; safe to call right after `payway.qr.generateQr()` before polling.

## Lifetime
`lifetime` is in **seconds** (SDK converts to whole minutes for the API; min 3 minutes). For a 10-minute QR pass `lifetime: 600`. Sandbox-verified end-to-end (2026-08-25): $31.11 USD QR at 600s lifetime → APPROVED on poll #8 (~37s).

Two clocks (ABA-confirmed 2026-09-12): the scan/session window (hosted checkout: abapay_khqr 5 min, deeplink/cards/alipay/wechat 3 min; the QR image itself may stop scanning in ~2 min) is independent of the transaction `lifetime`. A long `lifetime` does NOT keep a QR scannable — for long-lived invoices use offline KHQR, which supports repeat payments within its validity but is never payable forever (Bakong creation/expiry timestamps).

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.qr.generateQr(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```

## Tools

The QR flow needs no bundled scripts — the CLI covers the whole lifecycle:

```sh
# Generate + auto-poll (lifetime in SECONDS here, min 180):
payway-sdk generate-qr -a 31.11 -c USD --callback-url https://merchant.example/cb -y
# Watch a payment until terminal:
payway-sdk poll-transaction -t <txId>
```

**Agent flags that matter (live lesson 2026-09-05):** always pass `-y` — an
agent harness can present an interactive-looking stdin, and without `-y`
`generate-qr` stops at the `Modify lifetime?` prompt and never calls the API
(silent hang, no transaction created). For one-shot scripted runs add
`--no-polling --no-open-image` so the command returns immediately with the
QR string + PNG path, then poll explicitly. Simulator scans take ~60–90 s
from creation to approval; `check-transaction` sees the APPROVED status
instantly after approval.

> Repo-clone note: `scripts/online-qr-poll.ts` is a development probe in the SDK
> repository's `scripts/` directory (not shipped in the npm package) — the
> `generate-qr` + polling flow above is the supported equivalent.

## Related Skills
- [Offline QR](../aba-payway-offline-qr/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
- [Customer Module QR](../aba-payway-customer-qr/SKILL.md) — static portal-generated customer QRs (Printed QR channel); not API-generated, but callback and get-transactions-by-mc-ref behave the same
