---
name: aba-payway-payment-link
description: Create and inspect hosted ABA PayWay payment links.
version: 1.4.0
---

# ABA PayWay Payment Link

## Quick Start
```ts
const link = await payway.paymentLink.create({ title: 'Invoice 123', amount: 10, merchantRefNo: 'invoice-123', returnUrl: 'https://merchant.example/paid', currency: 'USD' });
```

Payment Link APIs require `publicKeyPem` for RSA-encrypted merchant authorization. The SDK validates the PEM structure before any call — a malformed key throws a clear `PayWayConfigError` (use the exported `isValidPublicKeyPem()` to pre-flight).

`currency` is gateway-REQUIRED (defaults to `'USD'` in the SDK): omitting it in a raw API call answers `PTL04` (sandbox-verified, undocumented). `merchantRefNo` is required by the SDK (stricter than the official "optional"); ≤50 chars advisory (strict throws). `description` ≤250 chars is a hard local throw.

## Split Payout (optional)
`payout` travels INSIDE the RSA-encrypted `merchant_auth` with keys `{acc, amt}` (the purchase-path shape — NOT the standalone payout domain's `{account, amount}`). The documented rule: the payout total must equal the link amount. The SDK warns when it doesn't (throws under `strictValidation`); the CLI rejects the mismatch locally with exit 1. Beneficiaries must be whitelisted first (`beneficiary add`); payout currency follows the link currency.

```ts
const link = await payway.paymentLink.create({
  title: 'Invoice 123', amount: 150, merchantRefNo: 'invoice-123',
  returnUrl: 'https://merchant.example/paid', currency: 'USD',
  payout: [{ acc: '000111222', amt: 100 }, { acc: '000999888', amt: 50 }],
});
```

```sh
# CLI (JSON-or-string flag):
npx tsx src/cli.ts payment-link create -t "Invoice 123" -a 150 -r invoice-123 \
  --return-url https://merchant.example/paid \
  --payout '[{"acc":"000111222","amt":100},{"acc":"000999888","amt":50}]'
```

## Image (optional)
`image: { data, filename?, contentType? }` attaches a JPG/JPEG/PNG (≤3MB) as a top-level multipart part — never hashed, never inside merchant_auth. SDK: over-limit/bad-type warns (strict throws); CLI `--image <path>` rejects wrong extensions AND >3MB files locally with exit 1. Gateway quirks: uploads are re-hosted on the CDN and renamed (`payment_link_image_<epoch-ms>`), and the echoed `image.size` reads 0 — don't build logic on it.

```ts
const link = await payway.paymentLink.create({ ..., image: { data: readFileSync('./brand.jpg') } });
```

## Pushback (payment notification)
On payment, the gateway POSTs JSON to the decoded `return_url`: `{ tran_id, status, merchant_ref_no }` (documented sample carries NO hash — verify via `check-transaction` on the pushed `tran_id` before fulfilling). One pushback per payment; multi-payment links fire repeatedly.

## Status lifecycle
`OPEN` while `payment_limit > total_trxn`; `PAID` once equal (hosted page stops accepting). **No EXPIRED status exists** (sandbox-verified 2026-09-06): after `expired_date` passes, detail still reads OPEN and the hosted page still answers 200 — enforce expiry merchant-side. Create rejects past/under-5-min `expired_date` with PTL04. Totals: `total_amount_org` (gross), `total_refund`, `total_amount` (net), `total_trxn` (count).

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.paymentLink.getDetails('link-id'); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

Codes: `PTL02` wrong hash, `PTL04` param validation (currency/return_url missing, description >250, non-numeric amount, OR expired_date in the past/under ~5 min out — sandbox-discovered catch-all), `96` invalid link id on detail (PTL132 documented but not reproduced on sandbox), 37/PTL146/PTL46 payout whitelist. Sandbox detail: `expired_date` unset echoes "0"; NO EXPIRED status — expired links still read OPEN and the hosted page still answers 200, enforce expiry yourself.

## Inspecting a link (CLI)

`payment-link detail` takes the link id via **`-i` only** (a positional id is rejected):

```sh
npx tsx src/cli.ts payment-link detail -i <link-id>   # the opaque base64 Link ID from create — NOT the merchant ref
```

Under `--json`, both commands print the machine-parseable error envelope `{ "error": { kind, exitCode, type, message, paywayCode, … } }` on ANY failure (local validation included) — branch on the envelope, not on stdout text. On a TTY, `create` renders a terminal QR of the share URL; `--no-show-qr` suppresses.

## Agent CLI
`payway-sdk ask "create a $49.50 payment link for invoice INV-041 …"` uses the `create_payment_link` tool (title/amount/currency/merchantRefNo/returnUrl/description/paymentLimit/expiredDate/payout — requires RSA readiness); `get_payment_link_details` (read-only) inspects a link by Link ID.

## Full guide
[docs/17-payment-link.md](../../docs/17-payment-link.md) — parameter tables, datatype reality notes, permutations/recipes, pushback receiver, troubleshooting.

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Payout](../aba-payway-payout/SKILL.md) (standalone payout domain — note its `{account, amount}` keys)
- [First Payment](../aba-payway-first-payment/SKILL.md) (route selection)
- [Agent CLI](../aba-payway-agent/SKILL.md) (the 12-tool catalog)
