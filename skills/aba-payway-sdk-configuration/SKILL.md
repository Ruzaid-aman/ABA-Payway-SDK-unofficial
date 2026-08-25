---
name: aba-payway-sdk-configuration
description: Configure aba-payway-ts with explicit options or PAYWAY environment variables.
version: 1.1.0
---

# SDK Configuration

## Quick Start
```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
```

Set `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY`. Optional values are `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_SANDBOX`, `PAYWAY_TIMEOUT`, and `DEBUG_PAYWAY`. Explicit constructor options take precedence. Use `debug: true` only in controlled environments; logs redact secrets.

## Error Handling
```ts
import { PayWay, PayWayConfigError } from 'aba-payway-ts';
try { new PayWay(); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Purchase](../aba-payway-purchase/SKILL.md)
