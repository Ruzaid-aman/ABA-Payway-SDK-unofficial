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

# --- docs/15 ---

# TC-013: the callback-mandatory conflict is now resolved
patch('docs/15-merchant-scenario-requirements.md', """## TC-013 — Callback requirement

**Confirm with ABA.** The supplied acceptance material conflicts on whether QR callbacks remain mandatory when Check Transaction API is used. The SDK can query status and verify callbacks; it cannot decide the profile rule.""", """## TC-013 — Callback requirement

**Resolved (ABA integration team, 2026-09-12).** Check Transaction is mandatory; the callback URL is recommended but **not strictly mandatory if robust Check Transaction polling is implemented and reviewed by the Integration Team before go-live** (poll only pending transactions, ~3–5 s interval within a 5–15 min lifetime, stop at final status/lifetime, keep logs). Callback + Check Transaction remains the recommended default pattern. The SDK can query status and verify callbacks; profile-level requirements are still confirmed during review.""")

# TC-021: enablement procedure for additional methods
patch('docs/15-merchant-scenario-requirements.md', """## TC-021 — Product payment methods

**Merchant-profile dependent.** Koksin’s reviewed selection was KHQR only; Velon’s was KHQR plus Visa/Mastercard. Render only methods activated for the actual profile. A sandbox QR-POS run can evidence only the supplied profile’s live sandbox response.""", """## TC-021 — Product payment methods

**Merchant-profile dependent.** Koksin’s reviewed selection was KHQR only; Velon’s was KHQR plus Visa/Mastercard. Render only methods activated for the actual profile. A sandbox QR-POS run can evidence only the supplied profile’s live sandbox response.

Enablement (ABA integration team, 2026-09-12): Alipay/WeChat Pay require separate approval for a fully registered business — request via **paywaysales@ababank.com**; after profile activation the merchant enables them in plugin/checkout config. Card brands cover Visa, Mastercard, UnionPay, JCB, and UPI (channel-dependent). **Google Pay online was reported "not available at the time of the guidance"** — confirm availability per profile with Sales before advertising it. Never show methods that are not enabled on the profile.""")

# Append new TCs after TC-034 block
patch('docs/15-merchant-scenario-requirements.md', """## TC-034 — Offline notification recovery capacity

Test the ABA-provisioned notification path and the inquiry fallback. The
merchant-reference endpoint returns at most 50 matches, exposes no pagination,
and is limited to 10 requests per minute. A 50-row result cannot prove complete
reconciliation during a high-volume interval or extended callback outage.""", """## TC-034 — Offline notification recovery capacity

Test the ABA-provisioned notification path and the inquiry fallback. The
merchant-reference endpoint returns at most 50 matches, exposes no pagination,
and is limited to 10 requests per minute. A 50-row result cannot prove complete
reconciliation during a high-volume interval or extended callback outage.

## TC-035 — Settlement reconciliation

**ABA-side configuration (integration team, 2026-09-12).** Settlement delay T+N is
merchant-specific (observed T+3/5/7 up to 15 working days) — the signed merchant
agreement / bank config is the source of truth, not a universal SLA. Reconcile by
exporting portal transactions for processing day T (orderID, APV, amount, time) and
joining them to the bank settlement report for the expected settlement date S
(weekends/holidays shift S to the next working day; an afternoon processing window
has been observed but is not universal). Fees appear as separate debits — reconcile
net vs gross per the agreement. Mismatches: send `tran_id` + date/time + amount +
bank evidence to the Integration/Settlement team. Full pattern:
[Chapter 20](./20-settlement-and-disputes.md).

## TC-036 — Chargebacks and disputes

**Card-only (integration team, 2026-09-12).** Visa/Mastercard/UnionPay/JCB
transactions can be charged back; ABA PAY, KHQR, and WeChat Pay are
final/irrevocable once successful. ABA notifies the merchant's registered email
with reason code, amount, PAN partial, approval code, purchase ID, and a response
deadline; silence past the deadline is treated as acceptance. Merchants accept
(refund) or dispute with evidence; ABA represents the case to the scheme. Monitor
the registered email. Full flow: [Chapter 20](./20-settlement-and-disputes.md).

## TC-037 — Payout and split timing

**Immediate at completion (integration team, 2026-09-12).** Split/payout
instructions settle to beneficiary MIDs/whitelisted accounts at the moment the
payment is approved (or the pre-auth is completed) — not on a T+N cycle. The
Direct Payout API debits the source account and credits all beneficiaries in the
same operation, subject to liquidity and daily payout limits. Production requires
beneficiary whitelisting and the payout service enabled on the MID. **Once a
transaction is processed via payout/split, the standard refund API is not
available** — refunds are manual, or a pre-auth refund before the split. See
[Chapter 20](./20-settlement-and-disputes.md).""")

# --- docs/17 §17.5 payout timing bullets ---
patch('docs/17-payment-link.md', """- The response resolves each entry with `acc_name` (sandbox evidence pending on the exact placement of `payout` in the response — top-level per apidog schema, inside `data` per ABA's own sample; verification item V-2).""", """- The response resolves each entry with `acc_name` (sandbox evidence pending on the exact placement of `payout` in the response — top-level per apidog schema, inside `data` per ABA's own sample; verification item V-2).
- **Beneficiaries are paid at completion, not T+N** — split instructions settle to the whitelisted accounts the moment the link is paid (integration team, 2026-09-12). Production requires beneficiary whitelisting AND the payout service enabled on the MID (sandbox: code 32 "Service is not enable" until provisioned — Q19).
- **No standard refund after payout/split** — once a transaction is processed via payout/split, the refund API is not available; refunds are handled manually, or via pre-auth refund before the split (integration team, 2026-09-12). See [Chapter 20](./20-settlement-and-disputes.md).""")
