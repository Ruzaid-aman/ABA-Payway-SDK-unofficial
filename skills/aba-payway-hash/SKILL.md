---
name: aba-payway-hash
description: Verify ABA PayWay webhook signatures with timing-safe HMAC verification.
version: 1.1.0
---

# Hash and Webhooks

## Quick Start
```ts
const isValid = payway.verifyCallback(req.body, req.headers['x-payway-hmac-sha512'] as string);
```

The signature arrives in the `X-PAYWAY-HMAC-SHA512` header. Do not read it from `req.body.hash`.

## Error Handling
```ts
if (!isValid) return res.status(400).send('Invalid PayWay signature');
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)