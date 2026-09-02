---
name: aba-payway-cof
description: Credentials-on-file with ABA PayWay — link an account or card, then charge the stored token (both hosted-page routes plus the cof CLI group).
version: 1.0.0
---

# Credentials on File (CoF)

Store an ABA account or card token once, then charge it on demand (MIT) or via
recurring schedules. Three commands matter: link-account, link-card, charge.

## Quick Start — link an account
```ts
// QR/deeplink arrives in the response; the token (pwt) is pushed to callbackUrl.
const link = await payway.credentialsOnFile.linkAccount({
  requestId: 'req0001',            // 5–24 alphanumeric, unique
  ctid: 'customer123',             // your customer id, 5–24 alphanumeric (REQUIRED)
  tokenFlag: 'CITI_FLEX',           // CITI_FLEX | CITO_FLEX (REQUIRED)
  currency: 'USD',                  // REQUIRED (profile-enabled)
  callbackUrl: 'https://merchant.example/payway/callback',
  returnDeeplink: { ios_scheme: 'myapp://linked', android_scheme: 'myapp://linked' },
});
```

## Quick Start — link a card (browser form, recommended)
```ts
const html = payway.credentialsOnFile.getLinkCardFormHtml({
  requestId: 'req0002', ctid: 'customer123', tokenFlag: 'CITI_FLEX',
  currency: 'USD', frequency: '1M',                    // live docs: "Required for Link Card" — SDK warns when omitted
  continueSuccessUrl: 'https://merchant.example/done', // hosted form's Done button target
  callbackUrl: 'https://merchant.example/payway/callback',
});
res.type('html').send(html); // browser POSTs urlencoded → gateway's hosted card page
```
The API route (`credentialsOnFile.linkCard()`) exists too, but this endpoint
ALWAYS answers with the hosted HTML page — the CLI saves it to
`payway-output/link-card-<request-id>.html` and exits 0 (the saved page IS the
success signal). `returnUrl`/`returnDeeplink` are NOT sent on link-card
(deprecated params; not in the live-documented request).

## Quick Start — charge the stored token
```ts
const charge = await payway.credentialsOnFile.payment({
  transactionId: 'order-0001', amount: 4.5, currency: 'USD',
  ctid: 'customer123', paymentToken: pwt,   // the pwt from the link callback
  tokenFlag: 'MITU_FLEX',                   // charging flags (see below)
  firstName: 'John', lastName: 'Doe', email: 'j@example.com', phone: '+855…', // hash positions
  items: [{ name: 'Item', price: 4.5, quantity: 1 }],
  returnParams: 'order=0001',
  payout: [{ acc: '000999888', amt: 4.5 }], // ⚠️ {acc, amt} keys (purchase-path shape)
  customFields: { plan: 'pro' },
  shippingFee: 0.5,
});
```

**Charging flags (live docs):** `CITU_FLEX | MITU_FLEX | MITU_FIX | MITR_FLEX | MITR_FIX`
(customer-initiated vs merchant-initiated, fixed vs variable). Linking flags
(`CITI_FLEX | CITO_FLEX`) belong to the link endpoints, NOT to charges.

## §16 hash orders (sandbox-verified 2026-08-31)
- link-account: `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency`
- link-card: `merchant_id.request_time.ctid.callback_url.request_id.token_flag.frequency.amount.currency.continue_success_url`
  (`amount`/`frequency` hash as `''` — no body fields for `amount`)
- charge (payment-credential): `request_time.merchant_id.tran_id.amount.currency.items.ctid.pwt.first_name.last_name.email.phone.purchase_type.callback_url.custom_fields.return_params.payout.token_flag.shipping_fee` — **no request_id** (deprecated, not sent)

## Error families
- `status.code "04"` + `errors{}` map → `PayWayBusinessError.fieldErrors` (per-field binding errors).
- `1`/`01`/`PTL02` → `PayWaySignatureError` (carries the endpoint hash-order hint).
- `98` merchant not found · `104` token flag not enabled for the merchant · `105` token invalid/expired · `09` token not found.

## CLI
```sh
payway-sdk cof link-account -r req0001 -c customer123 -f CITI_FLEX --currency USD --callback-url <url> \
  --return-deeplink '{"ios_scheme":"myapp://linked","android_scheme":"myapp://linked"}'
payway-sdk cof link-card-form -c customer123 -f CITI_FLEX --callback-url <url> -o link-card.html   # local, no API call
payway-sdk cof link-card -r req0002 -c customer123 -f CITI_FLEX --frequency 1M --callback-url <url>
payway-sdk cof charge -t order-0001 -a 4.50 --token <pwt> --ctid customer123 --token-flag MITU_FLEX
```

## Error Handling
```ts
import { PayWayBusinessError, PayWaySignatureError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.payment(params); }
catch (error) {
  if (error instanceof PayWayBusinessError) console.error(error.fieldErrors);
  else if (error instanceof PayWaySignatureError) console.error(error.message); // includes the hash-order hint
}
```

## Related Skills
- [Link Account](../aba-payway-link-account/SKILL.md)
- [Link Card](../aba-payway-link-card/SKILL.md)
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)
- [Token Lifecycle](../aba-payway-token-lifecycle/SKILL.md)
- [Subscription](../aba-payway-subscription/SKILL.md)
