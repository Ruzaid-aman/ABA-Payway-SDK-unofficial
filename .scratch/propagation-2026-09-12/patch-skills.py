import io

def patch(path, old, new, count=1):
    with io.open(path, encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        raise SystemExit("ANCHOR NOT FOUND in %s:\n%s" % (path, old[:160]))
    content = content.replace(old, new, count)
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print("patched " + path)

def bump_version(path, old_v, new_v):
    with io.open(path, encoding='utf-8') as f:
        content = f.read()
    if old_v not in content:
        raise SystemExit("VERSION %s NOT FOUND in %s" % (old_v, path))
    content = content.replace(old_v, new_v, 1)
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print("version %s -> %s in %s" % (old_v, new_v, path))

# 1. first-payment — test cards + simulator + no-retry note
p = 'skills/aba-payway-first-payment/SKILL.md'
patch(p, """Signed online callbacks require route-correct HMAC verification. Payment-link pushbacks have no hash and require server-side lookup; offline KHQR uses a separate notification contract. Browser redirects and missing callbacks prove nothing. Follow [webhook production](../aba-payway-webhook-production/SKILL.md) before fulfillment.""", """Signed online callbacks require route-correct HMAC verification. Payment-link pushbacks have no hash and require server-side lookup; offline KHQR uses a separate notification contract (confirmed: no signature on it — inquiry is the source of truth). Callbacks are single best-effort delivery with NO guaranteed retry (ABA-confirmed 2026-09-12). Browser redirects and missing callbacks prove nothing. Follow [webhook production](../aba-payway-webhook-production/SKILL.md) before fulfillment.

For sandbox card testing use the seeded test cards: CLI `payway-sdk sandbox-test-cards` or `listSandboxTestCards()` — approved MC `5156 8399 3770 6777` and Visa `4286 0900 0000 0206` (3DS), declined cards for error paths; sandbox-only, may rotate. ABA PAY / KHQR testing needs ABA Mobile Simulator accounts from the Integration Team (PIN `1234`, secret word `TEST1`; docs/02).""")
bump_version(p, 'version: 1.4.1', 'version: 1.4.2')

# 2. qr — session windows + scan window + offline validity
p = 'skills/aba-payway-qr/SKILL.md'
patch(p, """## Lifetime
`lifetime` is in **seconds** (SDK converts to whole minutes for the API; min 3 minutes). For a 10-minute QR pass `lifetime: 600`. Sandbox-verified end-to-end (2026-08-25): $31.11 USD QR at 600s lifetime → APPROVED on poll #8 (~37s).""", """## Lifetime
`lifetime` is in **seconds** (SDK converts to whole minutes for the API; min 3 minutes). For a 10-minute QR pass `lifetime: 600`. Sandbox-verified end-to-end (2026-08-25): $31.11 USD QR at 600s lifetime → APPROVED on poll #8 (~37s).

Two clocks (ABA-confirmed 2026-09-12): the scan/session window (hosted checkout: abapay_khqr 5 min, deeplink/cards/alipay/wechat 3 min; the QR image itself may stop scanning in ~2 min) is independent of the transaction `lifetime`. A long `lifetime` does NOT keep a QR scannable — for long-lived invoices use offline KHQR, which supports repeat payments within its validity but is never payable forever (Bakong creation/expiry timestamps).""")
bump_version(p, 'version: 1.5.0', 'version: 1.5.1')

# 3. webhook-production — no-retry confirmed + no-history
p = 'skills/aba-payway-webhook-production/SKILL.md'
patch(p, """Do not rely on callback retries. Reconcile missing notifications through server-side status checks. A timeout means `unknown`: check the existing attempt before replacing it. Expiry and closure remain local policy; gateway PENDING can persist and late approved payments require reconciliation.""", """Do not rely on callback retries — **ABA confirmed (2026-09-12) callbacks are single best-effort delivery**: one POST, answer 200 within ~5 s, no guaranteed redelivery on failure (a one-off ~10 s retry has been observed but must not be designed for). There is no merchant-facing callback delivery history or replay API; the Integration Team can inspect pushback logs on request (tran_id + timestamps). Reconcile missing notifications through server-side status checks. A timeout means `unknown`: check the existing attempt before replacing it. Expiry and closure remain local policy; gateway PENDING can persist up to ~24 h, and late approved payments require reconciliation.""")
bump_version(p, 'version: 1.1.0', 'version: 1.1.1')

# 4. pre-auth — 30-day window
p = 'skills/aba-payway-pre-auth/SKILL.md'
patch(p, """## Error Handling
```ts
import { PayWayConfigError, PayWayAPIError } from 'aba-payway-ts';
import { PRE_AUTH_ERROR_CODES } from 'aba-payway-ts';""", """## Capture window
Default hold window is **up to 30 days** from the initial pre-authorization (per-merchant configurable — confirm the profile value with ABA; constant `PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`). Complete (full or partial) or cancel within the window; after it the hold **auto-cancels/auto-reverses with NO webhook** — poll Check Transaction to observe the terminal state (ABA-confirmed 2026-09-12).

## Error Handling
```ts
import { PayWayConfigError, PayWayAPIError } from 'aba-payway-ts';
import { PRE_AUTH_ERROR_CODES } from 'aba-payway-ts';""")
bump_version(p, 'version: 1.2.0', 'version: 1.2.1')

# 5. refund — no refund after payout/split
p = 'skills/aba-payway-refund/SKILL.md'
patch(p, """## Related Skills""", """## No refund after payout/split
Once a transaction has been processed via payout/split, the **standard refund API is not available** (ABA-confirmed 2026-09-12) — refunds are manual, or a pre-auth refund before the split. Design split flows to make refund decisions before completing the payout. See [settlement chapter](../../../docs/20-settlement-and-disputes.md).

## Related Skills""")
bump_version(p, 'version: 1.4.0', 'version: 1.4.1')

# 6. payment-link — payout timing
p = 'skills/aba-payway-payment-link/SKILL.md'
patch(p, """`payout` travels INSIDE the RSA-encrypted `merchant_auth` with keys `{acc, amt}` (the purchase-path shape — NOT the standalone payout domain's `{account, amount}`). The documented rule: the payout total must equal the link amount. The SDK warns when it doesn't (throws under `strictValidation`); the CLI rejects the mismatch locally with exit 1. Beneficiaries must be whitelisted first (`beneficiary add`); payout currency follows the link currency.""", """`payout` travels INSIDE the RSA-encrypted `merchant_auth` with keys `{acc, amt}` (the purchase-path shape — NOT the standalone payout domain's `{account, amount}`). The documented rule: the payout total must equal the link amount. The SDK warns when it doesn't (throws under `strictValidation`); the CLI rejects the mismatch locally with exit 1. Beneficiaries must be whitelisted first (`beneficiary add`); payout currency follows the link currency. Beneficiaries are paid **at completion, not T+N** (ABA-confirmed 2026-09-12), and after a payout/split the standard refund API is NOT available — refunds are manual or pre-auth refund before the split.""")
bump_version(p, 'version: 1.5.0', 'version: 1.5.1')

# 7. sandbox-beneficiaries — sibling pointer
p = 'skills/aba-payway-sandbox-beneficiaries/SKILL.md'
patch(p, """## CLI
```bash
payway-sdk sandbox-beneficiaries            # list all
payway-sdk sandbox-beneficiaries --currency USD
payway-sdk sandbox-beneficiaries --json
```""", """## CLI
```bash
payway-sdk sandbox-beneficiaries            # list all
payway-sdk sandbox-beneficiaries --currency USD
payway-sdk sandbox-beneficiaries --json
```

Sibling fixture for hosted-card testing: `payway-sdk sandbox-test-cards` (approved/declined sandbox PANs — [aba-payway-first-payment](../aba-payway-first-payment/SKILL.md)).""")
bump_version(p, 'version: 1.2.0', 'version: 1.2.1')
