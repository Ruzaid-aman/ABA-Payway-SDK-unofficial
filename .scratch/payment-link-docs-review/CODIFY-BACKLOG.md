# Payment-Link Codification Backlog — SDK/CLI improvements (2026-09-06)

> **Status (2026-09-06, later same session): C1–C3 SHIPPED** (`parsePaymentLinkPushback`,
> webhook `/aba-payway-pushback` route + storage metadata, `expired_date` advisory +
> `PAYMENT_LINK_EXPIRY_MIN_SECONDS`) **and C4–C9 SHIPPED** (mock-harness routes, detail
> expiry display, explain PTL family + PTL132 hint, pushback receiver examples, agent
> `shareUrl`, this-recipe doc → `docs/agents/callback-capture-recipe.md`). Nothing
> remains open here except the explicitly-NOT-proposed items.

Source: the payment-link docs-review campaign (PLAN.md in this folder, Batch-A
probes + V-1 live capture; SANDBOX-FINDINGS §22). Each item names the learning
it codifies, so the SDK/CLI *encodes* gateway reality instead of leaving it in
docs for merchants to rediscover. Ordered by value/effort. Nothing here is
committed as code yet — propose before building (HANDOFF §5.8 convention).

## P1 — high value, small

### C1. `parsePaymentLinkPushback()` exported helper + `PaymentLinkPushback` type
**Learning codified:** the live pushback contract (§22 #9): `{tran_id: string,
status: numeric 0, merchant_ref_no}`, NO hash, `status` may also arrive as
`"00"`-style strings per the official sample.
**Do:** export from the barrel a small pure parser that accepts a raw body
(string | object), coerces `status` (`0 | '0' | '00'` → `'APPROVED'`-style
union, unknown values preserved), coerces `tran_id` to string, and rejects
bodies with unexpected extra required fields (warn, don't throw — the gateway
may extend). JSDoc states "no hash — notification only; verify via
check-transaction".
**Why:** today every merchant hand-parses the pushback and risks assuming
`verifyCallback()` applies (the #1 mistake this contract invites).
**Tests:** pure unit suite + a docs-example wiring.

### C2. Webhook server: third route `/aba-payway-pushback`
**Learning codified:** payment-link pushbacks go to the link's `return_url`,
not the webhook routes; the server currently 404s them.
**Do:** add the route to `src/webhook/server.ts` that parses via C1, stores the
delivery (same storage backends), and answers 200 `{acknowledged: true}`.
`payway-sdk setup-webhook` prints it as the recommended `return_url` for
payment links. No HMAC verification attempt (there is no hash).
**Tests:** server round-trip with the captured body shape (numeric + string
status variants).

### C3. `paymentLink.create` expired_date local advisory
**Learning codified:** create rejects past and under-~5-min `expired_date`
values with PTL04 (boundary in (150s, 300s], sandbox-verified; §22 #3).
**Do:** advisory `warnAdvisory` when `expiredDate <= now` (hard evidence) and
when `expiredDate < now + 300` (boundary evidence; name the constant
`PAYMENT_LINK_EXPIRY_MIN_SECONDS = 300` with the measured-bounds comment);
`strictValidation` escalates. Mirrors the `validateQrLifetimeSeconds` /
`validatePurchaseLifetimeMinutes` pattern — but stays advisory because the
exact gateway minimum is only bracketed, not pinned.
**Tests:** three pins (past warns, +150s warns, +300s silent) + strict throws.

## P2 — medium

### C4. Mock harness: payment-link create/detail routes (leftover plan P7)
**Learning codified:** the response shapes we now know precisely — numeric
`tran_id`, `expired_date` `"0"` string echo when unset, `status: "OPEN"`,
empty-image `{"image":"","filename":"","size":0}`.
**Do:** add the two routes to `src/test/index.ts` (the `payway-sdk demo`
harness) mirroring the shapes above, so demos and example-driven tests can run
the full payment-link lifecycle offline. The test-suite-local mock in
`cli-mock-commands.test.ts` already has routes — lift the payloads.
**Tests:** harness-level create/detail round trip.

### C5. `payment-link detail` human output: expiry state line
**Learning codified:** no EXPIRED status (§22 #2) — merchants will otherwise
trust `status: "OPEN"` on an expired link.
**Do:** in the CLI detail human output, when `expired_date` parses as a past
epoch, print `Expires: <date> (PAST — gateway still reports OPEN; enforce
expiry locally)`. `--json` stays raw.
**Tests:** cli-inprocess with a fabricated past-expiry payload.

### C6. `payway-sdk explain` / GATEWAY_CODE_HINTS: PTL132 + pushback codes
**Learning codified:** docs say PTL132, sandbox answers 96 for a bogus link id
(§22 #5); `apiErrorHint` in `src/cli.ts` has no PTL132 entry.
**Do:** add PTL132 → "invalid payment link — pass data.id from create (sandbox
answers 96 for a bogus id)". Audit whether `GATEWAY_CODE_HINTS` (client.ts)
needs the same row so `explain` and API-error hints stay in sync.
**Tests:** explain-snapshot / hint unit test rows.

## P3 — polish

### C7. docs/examples/backend payment-link pushback receivers (js + php)
Mirror `webhook-receiver.js/.php` for the payment-link contract using C1's
parser semantics (no-hash verification flow). Wired into `docs-examples.test.ts`
like the checkout examples.

### C8. Agent `create_payment_link` result: include `payment_link` share URL
The executor currently returns `{paymentLinkId, transactionId, status, raw}` —
adding `shareUrl: data.payment_link` saves the provider a raw-dig (the most
commonly consumed field).

### C9. Docs: extract a reusable "capture receiver" recipe
The trycloudflare + raw-JSONL receiver rig (`sandbox-probe-payment-link-pushback.ts`)
is a repeatable campaign pattern for ANY callback contract — document it as a
recipe in `docs/agents/` or the ops guides so future campaigns skip the
from-scratch build (this session's V-1 took one script + one user payment).

## Explicitly NOT proposed
- Making expired_date rejection a hard local throw (gateway minimum only
  bracketed — advisory is honest).
- `verifyCallback` support for pushbacks (there is no hash — nothing to verify).
- Image forwarding on the agent tool (scoped out deliberately — see HANDOFF §9).
- Payout placement pinning (V-2) — blocked on ABA enabling the whitelist
  service (Q19); revisit after their answer.

## Effort estimate
C1+C2: ~0.5 day (incl. tests). C3: ~1h. C4: ~2h. C5+C6: ~1h. C7–C9: ~0.5 day.
Total ≈ 1.5–2 focused days for P1+P2, the rest opportunistic.
