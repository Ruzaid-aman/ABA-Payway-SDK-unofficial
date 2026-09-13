import io

path = 'audit-results/four-pillars/ABA-OPEN-QUESTIONS.md'
with io.open(path, encoding='utf-8') as f:
    content = f.read()

addendum = """
---

## Relay batch — 2026-09-12: integration-team answers received (append-only)

**Method:** a batch of answers relayed via the ABA PayWay integration-team
channel on 2026-09-12. They read as doc-derived summaries — no document IDs or
reference links attached (except simulator app links) — so they are recorded as
**resolved operationally / confirmed by relay**, NOT as written contract
confirmations. Production-parity questions stay formally open until confirmed
in writing. Full per-answer mapping with evidence:
`docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` Part 4.

### Status updates to existing questions

| # | New status | What came back |
|---|---|---|
| Q6.1 | resolved operationally | Callbacks are single best-effort delivery; no guaranteed retry on down/non-200/timeout (~5 s window); recovery = Check Transaction. A one-off retry ~10 s apart has been observed but must not be designed for. NO citable doc reference provided — the explicit ask for a reference remains open. |
| Q6.2 | mooted | With no guaranteed redeliveries, HMAC-on-redelivery is a non-issue. |
| Q25.3 | resolved operationally | Canonical `payment_status_code` mapping confirmed: 0 APPROVED, 2 PENDING (up to ~24 h), 3 DECLINED, 4 REFUNDED, 7 CANCELLED (pre-auth); `DECLINDED` typo acknowledged; EXPIRED/CLOSED confirmed absent (merchant-side expiry). Q25.1/25.2 (token-flag domains) still open. |
| Q29.3 | resolved operationally | Deep-link scheme confirmed: `abamobilebank://ababank.com?type=payway&qrcode=<QR_STRING>`; use the response `abapay_deeplink` as-is, no intent:// wrapping. Q29.1/29.2/29.4 still open. |
| Q30 | resolved operationally | Check Transaction is mandatory; callbacks recommended but not strictly mandatory if robust polling is reviewed by the Integration Team pre-go-live (3–5 s interval, 5–15 min lifetime, logs). |
| Q32 | resolved (negative) | No merchant-facing API/portal for callback delivery history or replay; recovery via Check Transaction / get-transactions-by-mc-ref; the Integration Team can inspect pushback logs on request (tran_id + timestamps). |
| Q26 | partially | Two-clocks model confirmed: per-method hosted-checkout session timeouts (abapay_khqr 5 min; deeplink/cards/alipay/wechat 3 min; QR image may expire ~2 min) vs transaction `lifetime`; default KHQR checkout expiry 5 min (global). The exact governing rule for purchase-API KHQR scan validity is still unstated. |
| Q16.1 | partially (prose) | `https://checkout.payway.com.kh` named as the production endpoint in the onboarding description — keep formally open for written confirmation. Q16.2 (UAT env) still open ("sandbox/UAT" phrase only). |
| Q31 | partially | Portal self-service mapped: payway.ababank.com Settings → Push Back Notification URL self-editable on integration profiles (inform the team afterwards); sandbox profiles without portal access → team configures; production self-registered → per-transaction `return_url`, team does not edit production callback URLs; Customer Module static callback always via team. Domain-whitelisting request procedure/wildcards still open. |
| Q22 | procedure answered | CoF/subscription enablement procedure confirmed (Sales/Integration request → maintenance/change form → review → sandbox enable → test evidence → production enable). The sandbox-specific asks (enable `ec476910`, confirm the subscription HMAC order incl. `ctid`, fix docs + Wrong Hash hint) remain to be executed. |

### Unfiled items answered by the relay (were tracked as N1–N12 in docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md)

- **N1 test cards + simulator — ANSWERED.** Sandbox-only cards: approved MC `5156 8399 3770 6777` (01/30, 993, no 3DS) and Visa `4286 0900 0000 0206` (04/30, 777, 3DS); declined MC `5156 8302 7256 1029` (04/30, 777, 3DS) and Visa `4156 8399 3770 6777` (01/30, 993, no 3DS). Lists may rotate — request updates from the team. ABA Mobile Simulator: request accounts from the Integration Team (tester name/mobile/email), PIN `1234`, secret word `TEST1`; iOS TestFlight `https://testflight.apple.com/join/HNyq7UCm`, Android APK via shared drive; simulator works only against sandbox. Shipped in SDK/CLI as `sandbox-test-cards` / `listSandboxTestCards()`.
- **N3 pre-auth window — ANSWERED.** Default capture window up to 30 days (per-merchant configurable); complete (full/partial ≤ original) or cancel within the window; after the window the hold auto-cancels/auto-reverses with NO webhook — observe via Check Transaction. Shipped as `PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`.
- **N4 settlement + payout timing — ANSWERED.** T+N merchant-specific (T+3/5/7 up to 15 working days; agreement = source of truth; weekend/holiday shift; observed 13:00–17:00 window, not universal); reconciliation = portal export (orderID, APV, amount, time) joined to bank settlement reports; mismatch flow via the team with tran_id + bank evidence; fees as separate debits. Payouts settle IMMEDIATELY at completion (no T+N); Direct Payout API v2 debits source and credits beneficiaries in the same operation (liquidity/daily limits). No report-download API was mentioned. Codified in `docs/20-settlement-and-disputes.md`.
- **N5 chargebacks — ANSWERED.** Card-only (Visa/Mastercard/UnionPay/JCB); ABA PAY/KHQR/WeChat are final/irrevocable. Email notice with deadline; silence = acceptance; accept-or-dispute with evidence; ABA represents to the scheme; ABA may hold/deduct during investigation.
- **N6 FX — ANSWERED.** Amounts are in the merchant settlement currency; merchant-side conversion (rounding/spread/margin) is the merchant's responsibility; `/exchange-rate` returns ABA board rates; single-currency merchant → FX cost borne by the customer; dual-currency → settlement to the matching account, no merchant-side FX. Refund-rounding + sub-100-KHR refund floor remain open (N2 remainder).
- **N7 method enablement — ANSWERED (mostly).** Alipay/WeChat: separate approval for a fully registered business via paywaysales@ababank.com; merchant enables in plugin/checkout config afterwards. Card brands incl. UnionPay, JCB, UPI (channel-dependent). **Google Pay online reported "not available at the time of the guidance"** — discrepancy with our docs/SDK (`google_pay` option, `--google-pay-token`); advisory added to `PAYMENT_OPTIONS`; verify per profile. Per-method currency matrix + fees still open.
- **N8 go-live process — ANSWERED.** Full lifecycle documented (sandbox access → activation email → domain whitelisting → build/test → Integration-Team review → commercial production application → production credentials (may carry TEMPORARY EXPIRATIONS until verified) → low-value live verification transactions per method with evidence → go-live confirmation + VIP support window → standard Digital Support). No lead times given. Codified in docs/02.
- **N2 refund policy — PARTIAL.** Only new fact: no standard refund after payout/split (manual, or pre-auth refund before split). Refund window, multiple partials, fees, authorization model, rounding scale, KHR floor — still open.
- **N10 key lifecycle — PARTIAL; offline-KHQR auth ANSWERED.** No self-service key generation/rotation described (team-issued); production keys may carry temporary expirations until verification. Q8's incident-rotation procedure remains open. Offline-KHQR notification authentication: no signature scheme by design; integrity = HTTPS + `transaction_id` dedupe + `merchant_ref` reconciliation + inquiry as source of truth; ABA configures/whitelists the callback URL on the profile; repeat payments within validity confirmed, "not payable forever" confirmed (closes the G7 / HANDOFF offline-KHQR policy question).
- **N11 SLA — PARTIAL.** VIP support window post-go-live, then standard Digital Support channels; no SLA/status page named.
- **N12 checkout details — PARTIAL.** Pushback schema described as `{tran_id, apv, status, return_params}` with HTML-wrapped variants (describes the return/pushback contract; the HMAC-signed server callback contract untouched — Q18/Q35 remain). Session timeouts delivered (see Q26). Hosted-page customization: labels via portal/team, branding server-side on the profile, NO custom CSS/JS (docs/10 updated). `language` parameter still unconfirmed. N9 (PCI scope) untouched.

### New items to file as Q38+ (if adopted)

1. **Q38 — Google Pay online availability.** Relay says unavailable at guidance time; our docs/SDK expose it. Which is current, per environment?
2. **Q39 — Sandbox TLS contradiction.** Relay claims no PayWay environment uses self-signed certs; sandbox demonstrably presents a self-signed chain (Q7.1/Q17 evidence). Re-raise with the chain attached.
3. **Q40 — No-retry guarantee reference.** Request the citable guideline document for the single-delivery callback contract (the explicit ask in the Q6.1 reply went unanswered).

### Repo propagation done from this batch (2026-09-12)

docs/01, docs/02 (test cards + simulator + onboarding lifecycle), docs/03, docs/07, docs/08, docs/10, docs/11, docs/12, docs/15 (TC-013 resolved, TC-021/035/036/037), docs/17 §17.5, new docs/20, docs/README; SDK/CLI: `sandbox-test-cards` module + CLI command + exports, `buildAbaPayDeeplink()`, `PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`, `PAYMENT_STATUS_CODES` confirmation note, `google_pay` advisory; AGENTS.md / HANDOFF.md; affected skills mirrored to `.zcode/skills/`.
"""

with io.open(path, 'a', encoding='utf-8', newline='') as f:
    f.write(addendum)
print("appended relay batch to " + path)
