---
name: aba-payway-payment-link
description: Create and inspect hosted ABA PayWay payment links.
version: 1.2.0
---

# ABA PayWay Payment Link

## Quick Start
```ts
const link = await payway.paymentLink.create({ title: 'Invoice 123', amount: 10, merchantRefNo: 'invoice-123', returnUrl: 'https://merchant.example/paid', currency: 'USD' });
```

Payment Link APIs require `publicKeyPem` for RSA-encrypted merchant authorization. The SDK validates the PEM structure before any call — a malformed key throws a clear `PayWayConfigError` (use the exported `isValidPublicKeyPem()` to pre-flight).

## Split Payout (optional)
`payout` travels INSIDE the RSA-encrypted `merchant_auth` with keys `{acc, amt}` (the purchase-path shape — NOT the standalone payout domain's `{account, amount}`). The documented rule: the payout total must equal the link amount. The SDK warns when it doesn't (throws under `strictValidation`); the CLI rejects the mismatch locally with exit 1.

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

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.paymentLink.getDetails('link-id'); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Payout](../aba-payway-payout/SKILL.md) (standalone payout domain — note its `{account, amount}` keys)
