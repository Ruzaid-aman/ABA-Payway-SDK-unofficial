---
name: aba-payway-customer-qr
description: Handle Merchant Portal Customer Module static QRs (Printed QR channel) — decoded payload anatomy, callback handling, and reconciliation via get-transactions-by-mc-ref.
version: 1.2.0
---

# Customer Module QR (Merchant Portal)

## Quick Start

A **static, customer-specific KHQR** generated in the PayWay Merchant Portal (Customers module), not via API. Neither the [Online QR](../aba-payway-qr/SKILL.md) nor the [Offline QR](../aba-payway-offline-qr/SKILL.md) flow applies here: there is no QR-generation API request to integrate. Integration effort is the callback handler plus the reconciliation fallback job — both identical to the online QR flow.

```ts
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({ merchantId: process.env.PAYWAY_MERCHANT_ID!, apiKey: process.env.PAYWAY_API_KEY! });

// Callback handler: match the Customer ID returned as merchant_ref (never parse the QR payload).
app.post('/payway/callback', (req, res) => {
  if (!payway.verifyCallback(req.body, req.headers['x-payway-hmac-sha512'] as string)) {
    return res.status(400).send('Invalid signature');
  }
  markCustomerPaid(req.body.merchant_ref, req.body); // merchant_ref === your Customer ID (e.g. dt-one-8989)
  res.sendStatus(200);
});

// Fallback job: catch missed callbacks (PayWay does NOT retry webhooks).
const result = await payway.khqr.getTransactionsByMerchantRef('dt-one-8989');
```

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
- Callback: HTTP POST with `X-PAYWAY-HMAC-SHA512` header, no retries (5s timeout). Same validation as the online QR flow.
- Fallback: `get-transactions-by-mc-ref` using the Customer ID as `merchant_ref` (latest 50 per request; paginate).

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
