---
name: aba-payway-test-harness
description: Run the built-in aba-payway-ts contract test harness and mock PayWay flow.
version: 1.1.0
---

# Test Harness

## Quick Start
```ts
import { sdk } from 'aba-payway-ts';
const report = await sdk.runTestSuite();
if (!report.success) throw new Error('PayWay test suite failed');
```

The harness verifies the SDK response contract without merchant-specific production credentials.

## Error Handling
```ts
const report = await sdk.runTestSuite();
console.log(report.results.filter((result) => !result.passed));
```

## Related Skills
- [Purchase](../aba-payway-purchase/SKILL.md)
