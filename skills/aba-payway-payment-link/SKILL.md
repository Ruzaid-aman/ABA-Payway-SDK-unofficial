---
name: aba-payway-payment-link
description: Create, inspect, and void hosted ABA PayWay payment links.
metadata:
  version: 1.5.0
---

# ABA PayWay Payment Link

## Quick Start

For onboarding, start with [first payment](../aba-payway-first-payment/SKILL.md).
Use the shared lifecycle: `created`, `pending`, `approved`, `failed`, `unknown`.
Creation is not approval. Verify order ID, amount, and currency before fulfilling once.
A timeout means unknown; query the existing attempt before replacing it.
Expiry and closure remain local policy, even when the gateway reads PENDING.
See [webhook production](../aba-payway-webhook-production/SKILL.md) for callback trust and recovery.
Run the installed CLI as `npm exec -- payway-sdk`.

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
  payout: [{ acc: '500000001', amt: 100 }, { acc: '500000002', amt: 50 }], // seeded sandbox accounts
});
```

```sh
# CLI (JSON-or-string flag):
payway-sdk payment-link create -t "Invoice 123" -a 150 -r invoice-123 \
  --return-url https://merchant.example/paid \
  --payout '[{"acc":"500000001","amt":100},{"acc":"500000002","amt":50}]'
```

## Image (optional)
`image: { data, filename?, contentType? }` attaches a JPG/JPEG/PNG (≤3MB) as a top-level multipart part — never hashed, never inside merchant_auth. SDK: over-limit/bad-type warns (strict throws); CLI `--image <path>` rejects wrong extensions AND >3MB files locally with exit 1. Gateway quirks: uploads are re-hosted on the CDN and renamed (`payment_link_image_<epoch-ms>`), and the echoed `image.size` reads 0 — don't build logic on it.

```ts
const link = await payway.paymentLink.create({ ..., image: { data: readFileSync('./brand.jpg') } });
```

## Pushback (payment notification)
On payment, the gateway POSTs to the decoded `return_url` (live-captured 2026-09-06: `User-Agent: PayWayApp/3.0`, `Content-Type: application/json`): body `{ "tran_id": "…", "status": 0, "merchant_ref_no": "…" }` — **NO hash field (live-confirmed)**, `status` numeric 0 (not "00"). Treat as notification; verify via `check-transaction` on the pushed `tran_id` before fulfilling — `verifyCallback()` does not apply. One pushback per payment; multi-payment links fire repeatedly. SDK: `parsePaymentLinkPushback(body)` coerces the body (`status` → `'APPROVED'`/`'UNKNOWN'`); the webhook server's `/aba-payway-pushback` route can host the receiver (`setup-webhook` prints it). `create` also warns locally when `expiredDate` is past or under ~5 minutes out (gateway PTL04 — sandbox-verified).

## Status lifecycle
`OPEN` while `payment_limit > total_trxn`; `PAID` once equal (hosted page stops accepting); **`VOIDED`** after a successful void (below). **No EXPIRED status exists** (sandbox-verified 2026-09-06): after `expired_date` passes, detail still reads OPEN and the hosted page still answers 200 — enforce expiry merchant-side. Create rejects past/under-5-min `expired_date` with PTL04. Totals: `total_amount_org` (gross), `total_refund`, `total_amount` (net), `total_trxn` (count).

## Voiding a link (undocumented endpoint, live-verified §23)
`payway.paymentLink.void(linkId)` permanently cancels an UNPAID link — irreversible; it can no longer receive payments and the hosted page renders an invalid-data shell (code 07), unlike expiry which leaves the form up. Signs exactly like detail (`merchant_auth = {mc_id, id}`); success answers `{status:{code:"00"}, tran_id}` (numeric). **NOT idempotent**: a second void answers HTTP 403 `PTL188` "The payment link is already voided" — treat as already-terminal, not an error. Bogus id answers 403 `96` (same as detail). Don't void paid links — refund instead; void-on-paid is untested (open in §23).

```sh
payway-sdk payment-link void -i <link-id> [-y] [--json]   # prompts on a TTY; -y/--json skip
```

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.paymentLink.getDetails('link-id'); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

Codes: `PTL02` wrong hash, `PTL04` param validation (currency/return_url missing, description >250, non-numeric amount, OR expired_date in the past/under ~5 min out — sandbox-discovered catch-all), `PTL188` already voided (terminal state, not a failure — void is not idempotent), `96` invalid link id on detail/void (PTL132 documented but not reproduced on sandbox), 37/PTL146/PTL46 payout whitelist. Sandbox detail: `expired_date` unset echoes "0"; NO EXPIRED status — expired links still read OPEN and the hosted page still answers 200, enforce expiry yourself.

## Inspecting a link (CLI)

`payment-link detail` takes the link id via **`-i` only** (a positional id is rejected):

```sh
payway-sdk payment-link detail -i <link-id>   # the opaque base64 Link ID from create — NOT the merchant ref
```

Under `--json`, both commands print the machine-parseable error envelope `{ "error": { kind, exitCode, type, message, paywayCode, … } }` on ANY failure (local validation included) — branch on the envelope, not on stdout text. On a TTY, `create` renders a terminal QR of the share URL; `--no-show-qr` suppresses.

## Agent CLI
`payway-sdk ask "create a $49.50 payment link for invoice INV-041 …"` uses the `create_payment_link` tool (title/amount/currency/merchantRefNo/returnUrl/description/paymentLimit/expiredDate/payout — requires RSA readiness); `get_payment_link_details` (read-only) inspects a link by Link ID.

## Full guide

The complete parameter tables, datatype reality notes, permutations/recipes,
pushback receiver, and troubleshooting live in the SDK repository's
`docs/17-payment-link.md` (development checkout). The URL form is only valid
after that document is published with a real release tag — until then rely on
this skill plus `payway-sdk payment-link create --help`.

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Payout](../aba-payway-payout/SKILL.md) (standalone payout domain — note its `{account, amount}` keys)
- [First Payment](../aba-payway-first-payment/SKILL.md) (route selection)
- [Agent CLI](../aba-payway-agent/SKILL.md) (the 13-tool catalog)
