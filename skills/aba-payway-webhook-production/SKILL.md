---
name: aba-payway-webhook-production
description: Verify PayWay callbacks and status lookups, fulfill once, and recover missing or repeated notifications.
metadata:
  version: 1.0.0
---

# PayWay Webhook Production

## Quick Start

Start after the [first-payment journey](../aba-payway-first-payment/SKILL.md). Keep credentials, verification, and fulfillment on the server. A public HTTPS endpoint receives callbacks; local tunnel setup is for development:

```sh
npm exec -- payway-sdk setup-webhook --help
npm exec -- payway-sdk setup-webhook --tunnel
npm exec -- payway-sdk check-transaction -t order-001
```

```ts
import { PayWay, paymentLifecycle } from 'aba-payway-ts';

const payway = new PayWay(); // Server credentials from environment.
const result = await payway.checkout.checkTransaction('order-001');
const state = paymentLifecycle(result.data?.payment_status);
```

## Trust and Fulfillment

For signed online callbacks, verify using `payway.verifyCallback` and the signing contract for that route. Preserve the required signed input and reject invalid signatures. Payment-link pushbacks are unsigned: treat their transaction ID as an untrusted lookup hint, verify via PayWay, and bind the result to your stored order. Offline KHQR has its own notification contract; do not use online HMAC or transaction-ID assumptions.

The lifecycle is `created`, `pending`, `approved`, `failed`, `unknown`. Only verified `approved` is eligible for fulfillment after matching the stored transaction ID, amount, and currency. PRE-AUTH and REFUNDED need separate domain handling. Creation, redirects, and request status codes are not approval.

Persist the verified event and atomically transition the order once, using a database uniqueness constraint and durable fulfillment job. Repeated callbacks and concurrent status checks must not produce duplicate goods. Acknowledge only after durable acceptance; avoid lengthy work in the receiver.

## Error Handling

Do not rely on callback retries. Reconcile missing notifications through server-side status checks. A timeout means `unknown`: check the existing attempt before replacing it. Expiry and closure remain local policy; gateway PENDING can persist and late approved payments require reconciliation.

Do not log raw callbacks, keys, or customer data. Saved CLI profiles contain plaintext credentials; use a secret manager and explicit SDK configuration in deployed services. The development capture server is not an application fulfillment handler.

For recorded investigations use the opt-in [journal](../aba-payway-journal/SKILL.md); it is not a prerequisite for receiving and verifying a first payment.
