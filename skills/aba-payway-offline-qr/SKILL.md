---
name: aba-payway-offline-qr
description: Generate an offline EMVCo KHQR payload without calling ABA PayWay APIs.
metadata:
  version: 1.5.0
---

# Offline KHQR

## Quick Start
```ts
const payload = payway.khqr.generateOfflineQR({ amount: 10, currency: 'USD', merchantRef: 'invoice-123' });
```

Offline QR uses EMVCo TLV plus CRC-16 CCITT. It does not use online HMAC signing, and generating it never calls PayWay. **Generation itself does not enroll any callback** — downstream payment notifications depend on ABA's routing/enrollment for your Bakong account, which local QR creation neither configures nor proves.

## Invoice mode and validity

- Fixed invoice amount: provide `amount`; the SDK emits dynamic KHQR (`01=12`) with tag `54`.
- Flexible, installment, or partial amount: omit `amount`; the SDK emits static KHQR (`01=11`) and omits tag `54`.

Both modes contain creation and expiry timestamps in nested tag `99`. If omitted, `createdAt` is the generation time and `expiresAt` defaults to **15 minutes** later. A static QR is therefore not automatically permanent. For invoice batches, choose an ABA-approved validity window explicitly so QRs do not expire while queued for printing or delivery:

```ts
const createdAt = Date.now();
const expiresAt = createdAt + 30 * 24 * 60 * 60 * 1000; // example policy; confirm with ABA

const fixedInvoiceQr = payway.khqr.generateOfflineQR({
  amount: 125,
  currency: 'USD',
  merchantRef: 'INV2026000158',
  createdAt,
  expiresAt,
});

const openAmountQr = payway.khqr.generateOfflineQR({
  currency: 'USD',
  merchantRef: 'INV2026000159',
  createdAt,
  expiresAt,
});
```

The CLI does not currently expose `createdAt` or `expiresAt`: `--lifetime` does not configure offline KHQR expiry. Use the typed SDK for pre-generated billing batches that require an explicit validity window.

`merchantRef` is encoded in `62.01`. The payload accepts at most **25 UTF-8 bytes**, while `get-transactions-by-mc-ref` has a narrower 20-character gateway cap. Use unique references of at most **20 ASCII characters** when inquiry-based recovery is required.

## Payload self-check (offline decode + CRC verification)

Before printing or distributing a QR, decode and verify it locally — exported from the package barrel:

```ts
import { inspectKhqrPayload, validateKhqrCrc } from 'aba-payway-ts';

if (!validateKhqrCrc(payload)) throw new Error('CRC mismatch — never distribute');
const inspection = inspectKhqrPayload(payload);
// { valid, crcValid, isStatic, currency, amount?, merchantName?, merchantCity?, merchantRef?, bakongId? }
// undefined ⇒ structurally malformed (broken TLV/nested template, bad length digits);
// valid:false ⇒ checksum mismatch on an otherwise decodable structure.
// Parsing is byte-based: multibyte merchant names (é, Khmer script) round-trip.
```

`generate-qr --offline` runs this self-check automatically and prints the decoded summary (static/dynamic, amount, currency, merchant identity, Bakong ID, reference) plus a locally rendered PNG — the same `--save-image/--no-save-image/--open-image` contract as online mode, saved as `payway-output/<ref>.png`.

## Notifications and reconciliation (separate from generation)

The SDK models the downstream contract explicitly:

- `payway.khqr.validateConfiguration()` → local readiness of the 7 merchant-identity fields (does NOT prove ABA-side configuration).
- `payway.khqr.validateCallbackSetup()` → checks your **operator-declared** callback URL/enrollment/verification (`khqr.callback` config). `ready` means your declaration is complete, **not** that ABA has whitelisted it — enrollment must be `confirmed-by-merchant` after ABA configures it.
- `parseKhqrPaymentNotification()` (from `aba-payway-ts`) → the dedicated receiver for ABA KHQR notifications. The published shape has **no documented authentication contract**, so parsed events carry `verification: 'unverified'`; rely on your own field validation plus `check-transaction`/`getTransactionsByMerchantRef` reconciliation before fulfilling.
- Reconciliation lookup: `payway.khqr.getTransactionsByMerchantRef(merchantRef)` — see [Customer Module QR](../aba-payway-customer-qr/SKILL.md) for limits (max 50 matches, no pagination parameter).

Do NOT apply the online transaction-ID/HMAC callback assumptions to these notifications, and never treat the QR's CRC-16 as authenticity — it is a payload integrity check only.

A locally generated QR is not a pre-created PayWay transaction, but a routed payment can produce a PayWay transaction that is recoverable after payment. The supplied high-volume guidance says the same KHQR can be paid multiple times during its applicable validity; confirm that provider rule against the current merchant-issued ABA guideline and never treat uniqueness of the printed QR as a single-use payment control. Store every successful transfer as a separate Payment, deduplicate delivery/replay by `transaction_id`, and use `merchant_ref` only to find the invoice or account. A new `transaction_id` for an already settled invoice is a real additional payment—preserve it and route it through the merchant's overpayment, credit, or refund policy.

Do not rely on callbacks alone. The merchant-reference endpoint returns at most 50 matches, exposes no pagination parameter, and is limited to 10 requests per minute. Treat a 50-row response as a possible reconciliation gap rather than complete history.

## High-volume batch controls

Before distributing a billing batch:

1. Reject duplicate invoice references and enforce the 20-ASCII-character recovery-safe reference policy.
2. Record reference, expected amount/currency, `createdAt`, `expiresAt`, output filename, generator version, and a payload digest in a batch manifest.
3. Run `validateKhqrCrc()` and `inspectKhqrPayload()` on every payload; reject malformed, mismatched, or expired rows.
4. Keep Invoice, Payment, and Payment Allocation records separate so partial payments, multiple payments, currency mismatches, and overpayments remain auditable.
5. Exercise both the ABA-provisioned notification path and inquiry recovery before production rollout.

## Configuration (required)

Offline KHQR needs the merchant identity from env or config — **all 7 `PAYWAY_KHQR_*` vars** (a bare `generate-qr --offline` without them fails locally with 7 `KHQR_*_REQUIRED` codes, exit 1; the repo `.env` does NOT ship them):

```sh
PAYWAY_KHQR_BAKONG_ID             # Bakong-registered account id (e.g. user@ababank)
PAYWAY_KHQR_ABA_MERCHANT_ID       # ABA merchant id
PAYWAY_KHQR_ACQUIRER_NAME         # Acquirer name
PAYWAY_KHQR_MERCHANT_CATEGORY_CODE
PAYWAY_KHQR_MERCHANT_NAME
PAYWAY_KHQR_MERCHANT_CITY
PAYWAY_KHQR_PAYWAY_DATA           # PayWay routing data (62·68/99 tags)
```

The callback declaration lives in the SDK config object (not env vars): `new PayWay({ ..., khqr: { ...identity, callback: { url, enrollment, verification } } })`. Env vars cover the 7 identity fields only.

Note: the Merchant Portal's Customer Module QR is also static but carries PayWay routing tags (62·68, 99) from the portal's own enrollment, so its payments are reconcilable via `get-transactions-by-mc-ref` — see [Customer Module QR](../aba-payway-customer-qr/SKILL.md). Whether ANY offline-format QR's payments reach you depends on ABA's routing/enrollment for your Bakong account, not on which tool produced the QR string (see Notifications above).

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.khqr.generateOfflineQR(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Online QR](../aba-payway-qr/SKILL.md)
- [Webhook Production](../aba-payway-webhook-production/SKILL.md)
