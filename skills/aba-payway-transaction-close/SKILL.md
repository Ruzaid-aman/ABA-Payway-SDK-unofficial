---
name: aba-payway-transaction-close
description: Close an ABA PayWay transaction after processing it.
version: 1.4.0
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

## ⚠️ Closure is NOT queryable — and enforcement is path-dependent
Official contract (developer.payway.com.kh/close-transaction): *"Once a transaction is closed, it will no longer accept payment: any incoming payment will be rejected or reversed, and no callback will be sent."*

**API-side, sandbox never exposes a CLOSED status** (unchanged): closed-unpaid keeps reporting `PENDING` — keep a local `closed` flag.

**Customer-side enforcement is channel-dependent** (dossier §2a/§2b/§9):
- **QR/KHQR channel — ENFORCED (3 live observations: 2026-08-25, 2026-09-05 ×2):** QRs closed while PENDING were then scanned in the ABA app — refused with **"transaction expired"**, even minutes before natural lifetime expiry, while the API kept saying PENDING.
- **Hosted card/checkout channel — not enforced in the 2026-08-25 sandbox observation:** two closed-unpaid transactions were paid on an already-open hosted page and became APPROVED. Treat this as an observed limitation; the provider has not confirmed the cause.

**Always follow a successful close with `checkTransaction`** and interpret via:

| Close result | Check afterwards | Meaning |
|---|---|---|
| code 00 | `PENDING` | closed-unpaid OR still open — indistinguishable remotely; keep a local `closed` flag. QR channel: customers can no longer pay it; checkout channel: payment could still land (Aug evidence) |
| code 00 | `APPROVED` | payment landed AFTER close (checkout path, 2026-08-25 evidence) — go to refund path |
| code `5` / 403 | — | unknown tran_id |

Production enforcement of rejection/reversing remains an open question for ABA (#13) — never assume close prevents payment on the checkout path.

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
