---
name: aba-payway-subscription
description: Register and charge ABA PayWay recurring subscriptions on the purchase path (ctid + CITR_FIX + frequency).
version: 1.0.0
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

## Hash order (live 26-field, audit D1 fix)
The purchase hash signs
`req_time.merchant_id.tran_id.amount.items.shipping.firstname.lastname.email.phone.type.payment_option.return_url.cancel_url.continue_success_url.return_deeplink.currency.custom_fields.return_params.payout.lifetime.additional_params.google_pay_token.skip_success_page.token_flag.frequency`
— `token_flag` + `frequency` are the appended subscription positions (since
v1.4.0 the network path signs the same order; before that fix, subscriptions
were gateway-rejected with "Wrong Hash"). `ctid` travels in the body but has NO
hash position.

## CLI
```sh
payway-sdk generate-checkout -a 9.99 -c USD --return-url https://merchant.example/done \
  --ctid customer123 --token-flag CITR_FIX --frequency 1M
```

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
