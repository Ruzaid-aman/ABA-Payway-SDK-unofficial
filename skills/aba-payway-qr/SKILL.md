---
name: aba-payway-qr
description: Generate an online ABA PayWay KHQR payment QR code.
version: 1.3.0
---

# ABA PayWay QR

## Quick Start
```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
const qr = await payway.qr.generateQr({ transactionId: 'order-123', amount: 10, paymentOption: 'abapay_khqr', callbackUrl: 'https://merchant.example/payway/callback' });
```

Use an HTTPS callback URL and save the transaction ID before displaying the returned QR data.

## CLI: QR Image Auto-Open
`payway-sdk generate-qr` saves the PNG to `payway-output/<txId>.png` and can pop it straight into the OS default image viewer:

- **Default (auto):** opens the saved PNG only when stdout is an interactive TTY — agents/CI runs stay quiet.
- `--open-image` — force-open regardless of TTY (e.g. `npx tsx src/cli.ts generate-qr -a 5 -c USD --lifetime 600 --open-image -y`).
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

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.qr.generateQr(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```

## Tools (scripts/)

- **`online-qr-poll.ts`** — one-command live flow: generates ONE online KHQR for an amount (default $31.11), saves + auto-opens the PNG, then polls status every 5s for 10 minutes using `checkout.pollTransactionStatus`.
  ```sh
  npx tsx scripts/online-qr-poll.ts            # 31.11 USD, 600s lifetime, 10-min poll
  npx tsx scripts/online-qr-poll.ts 5 KHR      # custom amount/currency
  ```
  Artifacts land in `test-logs/qr-payment/<txId>-*` (PNG, KHQR payload, deeplink). Requires `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_CALLBACK_URL` in `.env`.

## Related Skills
- [Offline QR](../aba-payway-offline-qr/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
- [Customer Module QR](../aba-payway-customer-qr/SKILL.md) — static portal-generated customer QRs (Printed QR channel); not API-generated, but callback and get-transactions-by-mc-ref behave the same
