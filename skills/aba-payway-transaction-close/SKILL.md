---
name: aba-payway-transaction-close
description: Close an ABA PayWay transaction after processing it.
version: 1.3.0
---

# Close Transaction

## Quick Start
```ts
const result = await payway.checkout.closeTransaction('order-123');
```

Only close a transaction after your order system has reconciled its PayWay status.

## Sandbox Facts (verified 2026-08-25)
- Success returns `{"status":{"code":"00","message":"Success!"}}`.
- **Closing is idempotent in sandbox** — re-closing an already-closed transaction returns code 00 again.
- Nonexistent `tran_id` → HTTP 403, numeric code `5` "Transaction not found".
- The CLI prompts before voiding; pass `-y/--force` for scripts/agents:
  `payway-sdk close-transaction -t <id> -y`.

## ⚠️ Closure is NOT queryable and NOT enforced in sandbox
Official contract (developer.payway.com.kh/close-transaction): *"Once a transaction is closed, it will no longer accept payment: any incoming payment will be rejected or reversed, and no callback will be sent."*

Sandbox violates this — verified with two live card payments:
1. `PAY8skk3vbbi`: closed (code 00) while PENDING → customer paid on the still-open hosted page → **APPROVED** (MC \*6777).
2. `PAY8t4x1ozl9`: same sequence → **APPROVED** (VISA \*0206).

Additionally, **neither check-transaction nor transaction-detail exposes a CLOSED status**:
- closed-unpaid keeps reporting `PENDING`;
- closed-then-paid reports `APPROVED` with a normal `Create Order → Completed` operation history — no cancellation marker anywhere.

**Always follow a successful close with `checkTransaction`** and interpret via:

| Close result | Check afterwards | Meaning |
|---|---|---|
| code 00 | `PENDING` | closed-unpaid OR still open — indistinguishable remotely; keep a local `closed` flag |
| code 00 | `APPROVED` | payment landed AFTER close (sandbox permits) — go to refund path |
| code `5` / 403 | — | unknown tran_id |

Production enforcement of rejection/reversal is an open question for ABA (#13) — until confirmed, never assume close prevents payment.

## Tools

No bundled script needed — the CLI covers close + verify:

```sh
payway-sdk close-transaction -t <txId> -y     # close (skip prompt)
payway-sdk check-transaction -t <txId>        # verify the settled view
```

> Repo-clone note: `scripts/close-transaction-verify.ts` (exports `closeOrReport()` / `statusOf()` / `closeAndVerify()`) is a development probe in the SDK repository, not shipped in the npm package — the two commands above are the supported equivalent.

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.checkout.closeTransaction('order-123'); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.message); }
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
