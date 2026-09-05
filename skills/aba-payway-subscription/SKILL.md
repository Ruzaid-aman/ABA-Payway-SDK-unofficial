---
name: aba-payway-subscription
description: Register and charge ABA PayWay recurring subscriptions on the purchase path (ctid + CITR_FIX + frequency).
version: 1.1.0
---

# Subscription / Recurring Checkout

Subscriptions are a parameter set on the **purchase path** (live
`subscription-21402227e0` operation): pass the subscription trio with a normal
`purchase()` and the gateway registers a recurring token alongside the first
charge. There is NO separate subscription endpoint.

## Quick Start
```ts
const res = await payway.checkout.purchase({
  transactionId: 'order-sub-1', amount: 9.99, currency: 'USD',
  returnUrl: 'https://merchant.example/done',
  ctid: 'customer123',        // REQUIRED with tokenFlag — your customer token id (5–24 alnum)
  tokenFlag: 'CITR_FIX',       // the ONLY subscription flag on this path
  frequency: '1M',             // REQUIRED when CITR_FIX: '1W' | '1M' | '2M'
  paymentOption: 'cards',     // documented set for subscriptions: cards | abapay | abapay_deeplink
});
```

## Validation rules (enforced by the SDK)
- `tokenFlag` set → `ctid` REQUIRED (throws without it).
- `tokenFlag` must be `'CITR_FIX'` on this path — other flags belong to
  `credentialsOnFile.linkAccount`/`linkCard` (throws otherwise).
- `frequency` REQUIRED iff `tokenFlag === 'CITR_FIX'`; `frequency` without
  `tokenFlag` throws.
- `lifetime` is **MINUTES** here (min 3, max 43200) — the purchase path's unit;
  the QR domain's `lifetime` is seconds. Don't mix them up.

## Hash order (live 27-field, SANDBOX-FINDINGS §17)
The purchase hash signs
`req_time.merchant_id.tran_id.amount.items.ctid.shipping.firstname.lastname.email.phone.type.payment_option.return_url.cancel_url.continue_success_url.return_deeplink.currency.custom_fields.return_params.payout.lifetime.additional_params.google_pay_token.skip_success_page.token_flag.frequency`
— **`ctid` IS signed, between `items` and `shipping`**, even though the live
docs' subscription page omits it (sandbox-verified 2026-09-05: the documented
26-field order is rejected with "Wrong Hash"; probes A–C2 in §17). `token_flag`
+ `frequency` are appended at the end. Plain purchases hash byte-identically —
unset positions (including `ctid` when absent) hash as `''`.

## Profile gate (business code 104)
Even with a correct hash, subscription registration needs a **subscription-enabled
merchant profile**: the gateway answers `104` "Merchant not enabled token flag"
otherwise. The sandbox profile `ec476910` is NOT subscription-enabled (live
2026-09-05) — a green end-to-end subscription checkout is impossible there until
ABA enables it. `104` is a profile problem, not an integration bug.

## CLI
```sh
payway-sdk generate-checkout -a 9.99 -c USD --return-url https://merchant.example/done \
  --payment-option cards \
  --ctid customer123 --token-flag CITR_FIX --frequency 1M
```
Always pass `--payment-option cards|abapay|abapay_deeplink` — the CLI default
`abapay_khqr_deeplink` is outside the documented subscription set and fires an
advisory.

## Subsequent (recurring) charges
Use the merchant-initiated charging flags on the CoF payment path once the
customer's token exists: `credentialsOnFile.payment({ ..., tokenFlag: 'MITR_FIX' })`
(fixed recurring) — see [Token Purchase](../aba-payway-token-purchase/SKILL.md).

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.checkout.purchase(subscriptionParams); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); } // trio violations throw locally
```

## Related Skills
- [Purchase](../aba-payway-purchase/SKILL.md)
- [Credentials on File](../aba-payway-cof/SKILL.md)
- [Token Lifecycle](../aba-payway-token-lifecycle/SKILL.md)
- [First Payment](../aba-payway-first-payment/SKILL.md)
