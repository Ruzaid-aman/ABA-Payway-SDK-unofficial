---
name: aba-payway-customer-qr
description: Handle Merchant Portal Customer Module static QRs (Printed QR channel) — decoded payload anatomy, callback handling, and reconciliation via get-transactions-by-mc-ref.
metadata:
  version: 1.4.0
---

# Customer Module QR (Merchant Portal)

## Quick Start

A **static, customer-specific KHQR** generated in the PayWay Merchant Portal (Customers module), not via API. Neither the [Online QR](../aba-payway-qr/SKILL.md) nor the [Offline QR](../aba-payway-offline-qr/SKILL.md) flow applies here: there is no QR-generation API request to integrate. Integration effort is the callback handler plus the reconciliation fallback job — both identical to the online QR flow.

```ts
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({ merchantId: process.env.PAYWAY_MERCHANT_ID!, apiKey: process.env.PAYWAY_API_KEY! });

// Callback handler — verify, then normalize the route's REAL fields, then
// check STATE + MONEY + DEDUPE before fulfilling. A valid signature proves the
// callback came from PayWay; it does NOT prove the payment was approved, that
// the amount matches, or that you haven't seen it.
app.post('/payway/callback', async (req, res) => {
  if (!payway.verifyCallback(req.body, req.headers['x-payway-hmac-sha512'] as string)) {
    return res.status(400).send('Invalid signature');
  }
  // This route's callback shape (sandbox-verified; same as the offline-KHQR
  // notification and skills/aba-payway-hash/scripts/mock-callback.cjs):
  //   payment_status   — the approval state ('APPROVED' | 'PENDING' | …)
  //   original_amount / original_currency — the MERCHANT-side order money
  //     (the obligation; amounts arrive as strings — coerce with Number())
  //   payment_amount / payment_currency — the PAYER's debit; can be in a
  //     DIFFERENT currency (W5-6: 4000 KHR ordered → 1 USD paid) — match
  //     against original_*, never payment_amount.
  const merchant_ref = String(req.body.merchant_ref ?? ''); // Customer ID
  const tran_id = String(req.body.tran_id ?? '');
  const status = String(req.body.payment_status ?? '').toUpperCase();
  const amount = Number(req.body.original_amount);
  const currency = String(req.body.original_currency ?? '').toUpperCase();
  if (status !== 'APPROVED') return res.sendStatus(200); // ignore non-approved
  if (!tran_id || !merchant_ref || !Number.isFinite(amount)) return res.sendStatus(400);
  const order = await orders.findByCustomerRef(merchant_ref);
  if (!order || !order.expectsExactly(amount, currency)) return res.sendStatus(200); // log + investigate
  try {
    // Application database: claim AND pending job commit in ONE transaction.
    // claim uses a unique tran_id constraint and returns false on a duplicate.
    await db.transaction(async (tx) => {
      if (!await tx.fulfillments.claim(tran_id, { merchant_ref, amount, currency })) return;
      await tx.outbox.insert({ tranId: tran_id, merchantRef: merchant_ref, amount, currency });
    });
  } catch {
    // Both writes roll back. Reconciliation can safely submit this event again;
    // PayWay does not retry the callback merely because we return 503.
    return res.sendStatus(503);
  }
  res.sendStatus(200);
});

// Fallback job: catch missed callbacks (PayWay does NOT retry webhooks).
// Returns a normalized result: { merchantRef, statusCode, success, rows, raw }.
// Production answers {data, status:{code:"00"}}; the doc page models
// {status: number, transactions: []} — the SDK tolerates both. rows.length === 50
// means SATURATION (no pagination) — cross-check before declaring completeness.
const result = await payway.khqr.getTransactionsByMerchantRef('dt-one-8989');
```

Classify + parse are first-class SDK exports (2026-09-11):

```ts
import { classifyCallback, parseCustomerQrCallback } from 'aba-payway-ts';
classifyCallback(body);        // 'customer-module-qr' (nested customer object)
parseCustomerQrCallback(body); // .notification.merchantRef = Customer ID join key
```

`db`, `orders`, and the worker below are application-owned adapters, not SDK
exports. Implement the [outbox storage contract](references/fulfillment-outbox.md)
before deploying this handler. The pending job survives a restart; a worker
leases pending jobs and retries delivery. Fulfillment must honor the transaction
ID as an idempotency key, including a retry after delivery succeeded but its
acknowledgement failed:

```ts
async function deliverFulfillment(job) {
  await fulfillOrder(job, { idempotencyKey: job.tranId });
  await outbox.markDelivered(job.tranId); // only after fulfillment succeeds
}
```

The guard set is verified signature → approved state → matching obligation →
atomic acceptance plus durable job → idempotent delivery. Test it with the hash skill's signed fixture tool:
`node skills/aba-payway-hash/scripts/mock-callback.cjs --url http://localhost:3000/payway/callback --tran-id <id> --merchant-ref <customer-id> --amount <expected> --status APPROVED`
(then re-send the same `--tran-id` and confirm nothing fulfills twice). The
handler's behavior is pinned by `src/__tests__/skill-handler-behavior.test.ts`;
SQLite-backed rollback/restart/worker recovery tests execute the guide examples
in `src/__tests__/skill-outbox.test.ts`.
For the full durability workflow (storage, retries, recovery) see
[webhook production](../aba-payway-webhook-production/SKILL.md).

## Decoded payload anatomy (verified from a real portal QR)

203-char KHQR/EMVCo TLV, e.g.:

```
00020101021130510016abaakhppxxx@abaa01153250602141550800208ABA Bank5204787653038405802KH5915Donation outlet6010BATTAMBANG624268380010PAYWAY@ABA0104693002071620916050119924001317871247638256803mmp63049955
```

| Tag | Value | Meaning |
|------|--------------------------|---------|
| `01` | `11` | **Static QR** — reusable, no expiry (`12` = dynamic) |
| `30` | bakong ID + account no. + bank | KHQR Bakong merchant account template |
| `52` | MCC | Merchant category code |
| `53` | `840` | Default currency USD (no `116` KHR tag) |
| `54` | *(absent)* | **No fixed amount** — payer enters amount in-app |
| `59`/`60` | merchant name / city | Printed on the QR poster |
| `62`·`68` | `PAYWAY@ABA`, outlet code, merchant ID, flag | PayWay routing template (proprietary) |
| `99` | merchant profile ID, `mmp` marker | PayWay root extension (proprietary) |
| `63` | CRC-16 | Integrity checksum — never hand-edit payloads |

## Critical behavior

- **Customer ID is NOT in the QR payload.** PayWay attributes the payment server-side via its routing tags and returns the Customer ID as `merchant_ref` in the callback and API. Make Customer ID a mandatory unique field in the portal; match on `merchant_ref`.
- **One callback URL per merchant profile** serves every channel (online checkout + Customer Module + offline notifications), configured by the ABA integration team; production changes need a support ticket. Never provision an ephemeral trycloudflare tunnel URL — tunnels are for sandbox verification only.
- SDK webhook server (`setup-webhook`): the khqr route verifies the signature when the header is present (offline notifications stay 'unsigned'), attaches `customerQr` metadata, and sets `matchedTransactionId`/`matchedStatus` + replay markers; the online route classifies too. `webhook list` shows `route=customer-qr customer_id=…`.
- Test the receiver without the Simulator: `payway-sdk webhook trigger --url <receiver> --event customer-qr.payment --merchant-ref <customer-id> --customer-name <name>` — a SIGNED fixture with the nested customer object (round-trips through `verifyCallbackDetailed` and `parseCustomerQrCallback`).
- Callback: HTTP POST with `X-PAYWAY-HMAC-SHA512` header, no retries (5s timeout). Same validation as the online QR flow — but the signature is only authenticity; the approved-state/money/dedup guards above are what prevent incorrect fulfillment.
- Fallback: `get-transactions-by-mc-ref` using the Customer ID as `merchant_ref`. The endpoint returns AT MOST 50 matches and exposes NO pagination parameter — a single request is not a complete-history guarantee during a long outage or high-volume interval; treat a 50-row (saturated) result as a possible gap and reconcile against your own records before declaring completeness.

## Tools (scripts/)

- **`decode-khqr.cjs`** — decode a QR string or image, print the TLV tree, verify the CRC-16 checksum:
  ```sh
  node skills/aba-payway-customer-qr/scripts/decode-khqr.cjs "<khqr-string>"

  # From a QR image (JPG/PNG) — deps install once in a SCRATCH folder, never inside the skill:
  #   mkdir ~/.payway-qr-deps && cd ~/.payway-qr-deps && npm init -y && npm i jimp@0.22.12 jsqr
  NODE_PATH=~/.payway-qr-deps/node_modules node skills/aba-payway-customer-qr/scripts/decode-khqr.cjs path/to/customer-qr.jpg
  ```
  Sample output: `stored=9955 computed=9955 → VALID ✓`, plus flags for static/dynamic, fixed/open amount, currency, and presence of PayWay routing tags. The script is `.cjs` on purpose — the repo `package.json` sets `"type": "module"`.
  **Image-mode caveat:** jsQR cannot read the styled/template PayWay PNGs (logo overlay, `template3_color`-style output) — you get `No QR detected in image.`. Plain/terminal-style QR images decode fine; for template QRs decode the KHQR **string** instead.
  **Windows note:** `npm i` in `~/.payway-qr-deps` can silently install into `~/` if a stray `~/package.json` exists (npm walks up) — verify the install landed in the scratch folder.
- **`qr-manifest.cjs`** — batch audit a folder of downloaded customer QR JPGs into a CSV/table manifest (bakong ID, account, outlet code, merchant ID, profile ID, CRC status) for print/audit workflows:
  ```sh
  NODE_PATH=~/.payway-qr-deps/node_modules node scripts/qr-manifest.cjs ./qr-downloads --csv manifest.csv
  ```

## Error Handling

- A QR whose CRC-16 check fails (`INVALID ✗`) was corrupted or hand-edited — never distribute it; re-download from the Merchant Portal.
- A callback whose `merchant_ref` matches no known customer must be logged and investigated, not silently dropped — it may precede a settlement you need to reconcile.
- Missed callbacks (endpoint down > 5s) are never retried by PayWay: rely on the `get-transactions-by-mc-ref` fallback job and dedupe by `transaction_id`.
- Regenerated QRs change the `99.00` merchant profile ID while keeping the same bakong account — re-print posters after regeneration and retire old prints.

## Related Skills
- [Online QR](../aba-payway-qr/SKILL.md)
- [Offline QR](../aba-payway-offline-qr/SKILL.md)
- [Transaction by Merchant Ref](../aba-payway-transaction-by-merchant-ref/SKILL.md)
