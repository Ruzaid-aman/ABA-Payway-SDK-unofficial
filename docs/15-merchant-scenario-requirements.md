# Chapter 15 — Merchant Scenario Requirements

This chapter maps the reviewed merchant scenarios to SDK and integrator responsibilities. “Guidance observed during integration” is not a universal PayWay guarantee; profile and commercial settings must be confirmed with ABA.

## TC-001 — Checkout routing

`paymentGate: 0` is serialized as `payment_gate=0` by `createTransaction()`. Post the resulting signed fields from the browser. **Confirm with ABA** that the merchant profile routes this value to Ecommerce Checkout HTML rather than QR JSON.

## TC-002 — Server-side signing

Keep the API key and `PayWay` instance server-side. Return only signed checkout fields; the SDK never includes the API key in a request-hook payload.

## TC-003 — Browser checkout submission

Use a backend to create signed fields and a browser form to post them to PayWay. This avoids exposing credentials and follows the hosted-checkout domain flow.

## TC-004 — Popup checkout

**Guidance observed during integration.** Use ABA’s `checkout2-0.js`, a form target of `aba_webservice`, and the approved popup flow. The SDK signs form fields; it does not bundle ABA-hosted JavaScript.

## TC-005 — Desktop hosted view

**Confirm with ABA.** The supplied guidance says `hosted_view` is mobile-only while repository API notes describe browser behavior differently. Use the supported popup flow for desktop until the current partner-profile rule is confirmed.

## TC-006 — Popup close refresh

**Guidance observed during integration.** Load `checkout2-0.js?hide-close=2` when ABA confirms this option for the profile. Its value semantics are not an SDK guarantee.

## TC-007 — Mobile dismissal

No reliable PayWay dismissal event is exposed to the SDK. Continue bounded status checks until expiry and verify final status; any DOM observer is a merchant-side best-effort workaround.

## TC-008 — Website QR lifetime

Set `lifetime` to the maximum polling window. Fifteen minutes was accepted in the reviewed implementation, while shorter windows were also discussed; treat the value as **Merchant-profile dependent**. The SDK rejects non-positive/non-integer lifetimes.

## TC-009 — POS QR lifetime

Use a short QR lifetime; five minutes was accepted for the reviewed POS flow. This is **Guidance observed during integration**, not an SDK maximum.

## TC-010 — Polling

The QR-POS reference polls every three seconds, stops at terminal status or expiry, and keeps the server-side status check separate. A fifteen-second server poll is an optional merchant operational policy; align all polling with the transaction lifetime.

## TC-011 — Status source

Use Check Transaction API to reconcile current state and treat pushback as a signed notification path. Persist reconciliation idempotently because connectivity can delay or duplicate notifications.

## TC-012 — Pushback payload

Use the merchant’s `return_url`/configured callback route. Verify the signature before trusting successful `tran_id`, `apv`, and `status: 0` payload fields.

## TC-013 — Callback requirement

**Confirm with ABA.** The supplied acceptance material conflicts on whether QR callbacks remain mandatory when Check Transaction API is used. The SDK can query status and verify callbacks; it cannot decide the profile rule.

## TC-014 — Post-pushback recheck

**Guidance observed during integration.** When both paths are used, a five-second delayed Check Transaction recheck was recommended. Keep idempotency regardless of delay.

## TC-015 — Polling/webhook race

Use a unique transaction key and a database transaction. The QR-POS sample’s SQLite `payment_events.transaction_id` prevents duplicate paid processing from webhook and status-check races.

## TC-016 — Rate limit

The SDK defaults Check Transaction throttling to 600 requests per second. **Confirm with ABA** for current merchant-IP limits and production sizing.

## TC-017 — Root-domain whitelisting

**Commercial configuration required.** Provide API-request and callback root domains to ABA. Confirm whether wildcard subdomains apply to the specific profile.

## TC-018 — Custom domain

**Commercial configuration required.** A tenant moving to a custom root domain must request ABA maintenance/whitelisting against its existing credentials before payment traffic moves.

## TC-019 — Simulator and sandbox

Simulator registration and PayWay sandbox access are separate. Start sandbox onboarding at the developer portal; UI approval/commercial readiness can be profile gates.

## TC-020 — Sandbox expiry

Ask ABA technical support to extend or reactivate the merchant profile. Do not post credentials in a ticket or public channel.

## TC-021 — Product payment methods

**Merchant-profile dependent.** Koksin’s reviewed selection was KHQR only; Velon’s was KHQR plus Visa/Mastercard. Render only methods activated for the actual profile. A sandbox QR-POS run can evidence only the supplied profile’s live sandbox response.

## TC-022 — Checkout UI compliance

Show only accepted methods, approved labels/logos, the required We Accept branding, and a Payment Method value matching the selected method. This is an ABA review responsibility, not an SDK-rendered UI.

## TC-023 — Pre-auth review

**Commercial configuration required.** Submit the pre-auth journey for ABA review even when it shares a purchase endpoint or merchant UI.

## TC-024 — Orphan payment

Dismissal does not cancel a saved QR. Recheck status, reconcile captured/no-order records, and apply the merchant’s refund policy. Refund decisions are **Merchant-profile dependent**.

## TC-025 — Malformed callback URL

Remove surrounding whitespace, use a public stable HTTPS endpoint, and retry with a new transaction. The SDK rejects whitespace, non-HTTPS, malformed, and localhost QR callback URLs before an API call.

## TC-026 — POS sign-off evidence

**Commercial configuration required.** Submit Android and iOS payment-journey evidence plus the ABA Simulator screen, with matching amounts.

## TC-027 — Onboarding gate

**Commercial configuration required.** Complete profile sign-off and check its current validity before client onboarding.

## TC-028 — OTP

OTP is **Merchant-profile dependent**. If enabled, submit its UI and error states for review; payment-state reconciliation is unchanged.

## TC-029 — Recurring subscription (first charge + registration)

**Merchant-profile dependent.** The subscription route runs on the purchase
path: `checkout.purchase()` with the trio `ctid` (customer token id) +
`tokenFlag: 'CITR_FIX'` + `frequency` (`1W`|`1M`|`2M`). CLI:
`payway-sdk generate-checkout -a 9.99 --ctid customer123 --token-flag CITR_FIX --frequency 1M --return-url <url>`.

Scenario evidence: first charge completes, the subscription token registers,
and recurring charges reconcile through the standard webhook. **Sandbox
caveats (2026-09-05):** the gateway signs `ctid` in the 27-field purchase hash
(the live docs' subscription page omits it — see docs/09/SANDBOX-FINDINGS
§17), and the current sandbox profile answers `104` "Merchant not enabled
token flag" — subscription enablement is an ABA-side prerequisite for this
scenario. See the `aba-payway-subscription` skill.
