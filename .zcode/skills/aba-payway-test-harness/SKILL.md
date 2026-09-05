---
name: aba-payway-test-harness
description: Run the built-in aba-payway-ts contract test harness and mock PayWay flow.
version: 1.2.0
---

# Test Harness

## Quick Start
```ts
import { sdk } from 'aba-payway-ts';
const report = await sdk.runTestSuite();
if (!report.success) throw new Error('PayWay test suite failed');
```

The harness verifies the SDK response contract without merchant-specific production credentials.

## CLI wrappers

The same harness is reachable without writing code (true offline mock server — CI-usable, no credentials):

```sh
npx tsx src/cli.ts test    # run the PayWay sandbox test suite
npx tsx src/cli.ts demo    # run the suite with pass/fail output
```

## Error Handling
```ts
const report = await sdk.runTestSuite();
console.log(report.results.filter((result) => !result.passed));
```

## Related Skills
- [Purchase](../aba-payway-purchase/SKILL.md)
