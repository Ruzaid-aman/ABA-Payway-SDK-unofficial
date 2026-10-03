# Open Questions for ABA (PayWay Gateway) — Consolidated 2026-08-27

> **SUPERSEDED (in part) — 2026-09-02:** This consolidated register has been partially superseded by the
> canonical internal question register at `docs/internal/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` (use that
> file for the latest Q-status table and answers). The original Q1–Q10 bodies are retained here as an
> append-only audit transcript; for current actionable status consult the internal register.

**Purpose:** a ready-to-send clarification list for ABA PayWay integration
support / developer relations, consolidating every blocker discovered during the
four-pillars audit and subsequent remediation passes. Each question states what
we observed, why it blocks production use, and what an answer must contain to be
actionable. Items are ordered by production impact.

**Merchant:** `ec476910` (sandbox) · **SDK:** `aba-payway-ts` v1.1.1+ ·
**Evidence links** point into this repository's audit trail.

---

## Q1 — Credentials-on-File token-management trio: HMAC composition (R-04/05/06) 🔴 PRODUCTION BLOCKER

**Endpoints:** `renew-expired-account-token`, `get-token-details`, `remove-token`
(`/api/payment-credential/v3/token-management/*`)

**Observed:** every derivable HMAC field composition was rejected by sandbox —
~60 orderings attempted across campaigns (`CHANGELOG.md`, `docs/SANDBOX-FINDINGS.md`
§9a), including:

| Attempted fieldList variants |
|---|
| `request_time, merchant_id, request_id, ctid, pwt` |
| `request_time, merchant_id, request_id, request, ctid, pwt` |
| `request_id, request_time, merchant_id, ctid, pwt` |
| plan-doc's `m + ctid + time + pwt` ordering |
| ± base64 vs hex encoding, ± `hash` inclusion, ± flat `request` |

All answered with signature rejection. The linking/charging endpoints' documented
orderings work unchanged.

**Questions:**
1. What is the **exact `fieldList` (order matters)** for HMAC computation on each of the three token-management endpoints?
2. Should the extra server-mandated `request` field participate in the hash? If yes, at which position?
3. Is the encoding base64 or hex for these endpoints?
4. Is there a published integration doc we missed? Please share it if so.

**Impact if unresolved:** renew/details/remove are blocked behind an explicit
capability flag in the SDK (`allowUnverifiedTokenOperations`) — merchants cannot
complete the CoF lifecycle (90-day expiry handling is therefore also stuck, see Q3).

---

## Q2 — Subscription initiation via `/api/payment-gateway/v1/payments/purchase` (R-07) 🔴 FEATURE GAP

**Observed:** the SDK can charge linked tokens (`payment-credential` purchase)
but cannot mint the *initial* subscription transaction: sandbox accepts
additional parameters beyond our current payload set, while the plan requires
subscription initiation natively.

**Questions:**
1. To start a subscription on the raw `/v1/payments/purchase` endpoint, which fields does ABA require (`ctid`, `token_flag`, `frequency`, others?) and in which hash position?
2. Is subscription initiation instead expected exclusively through `link-account`/`link-card` deep-link flows?
3. Are there dedicated subscription management endpoints (upgrade/downgrade/cancel) not yet in the public OpenAPI bundle?

---

## Q3 — Token lifecycle semantics (90-day window) 🟠

**Observed:** docs state tokens expire after ~90 days; no per-token expiry
timestamp is returned anywhere.

**Questions:**
1. Is validity exactly 90 calendar days from grant/renewal, or rolling usage-based?
2. Does time-zone of the merchant portal matter for the boundary day?
3. Will `get-token-details` return an authoritative `expiresAt` (would let us drop client-side tracking)?
4. Does charging with an expired-but-not-yet-cleaned token produce a distinct error code we can map?

---

## Q4 — Close-transaction contract (from `docs/CLOSE-TRANSACTION-FINDINGS.md` §5) 🟠

1. Is post-close **rejection or reversal** enforced in PRODUCTION per channel? (Sandbox: KHQR rejects; hosted card sessions approved two payments after close.)
2. Why is there **no CLOSED status** in check-transaction/transaction-detail? Merchants need it for reconciliation.
3. Should re-closing an already-closed transaction return `00` again, or a dedicated code?
4. When a closed transaction is paid anyway, what is the intended end state (auto-reverse? who refunds)?
5. Do pre-rendered checkout sessions survive close by design, or should the gateway re-validate state at submit time?

---

## Q5 — Rate limiting: official limits & machine-readable signals 🟡

**Observed (sandbox-verified):** undocumented HTTP 403 + numeric body code `429`
("Rate limit exceeded…") with **no** rate-limit headers; we reverse-engineered
pacing from our own windows.

**Questions:**
1. Can ABA publish official per-endpoint rate limits (our working numbers: check-transaction 600/min, transaction-detail 10/min, transaction-list 50/min, refund 500/s — confirm/correct)?
2. Is there a roadmap for standard `429 Too Many Requests` + `Retry-After` headers?
3. What is the production penalty model (per-key vs per-IP throttling, ban durations)?

---

## Q6 — Callback/webhook delivery contract 🟡

1. On callback delivery failure (non-2xx / timeout), what is ABA's **retry policy** (attempts, backoff, eventual dead-letter)? Our capture sink intentionally always answers 200.
2. Can ABA guarantee presence of the `X-PAYWAY-HMAC-SHA512` header on **every** redelivery, including retries of legacy-format callbacks?
3. Offline KHQR notification schema: where is the canonical definition, and will ABA version-schema changes (currently we detect drift heuristically)?

---

## Q7 — Sandbox environment & security hygiene 🟢

1. The sandbox TLS chain requires workarounds (self-signed intermediates). Will sandbox ship a publicly-trusted certificate? This removes temptation for `rejectUnauthorized:false` patterns in example code.
2. Are webhook source IPs available as an allowlist range for ingress filtering?
3. Please confirm `CITR_FIX` is intentionally **not** valid for linking (only charging); we now enforce the R-08/R-09 enums client-side.

---

## Q8 — Exposed sandbox key: rotation & history-purge procedure 🟠 (completes our TD-01)

A sandbox API key for merchant `ec476910` was accidentally committed to this repository's git
history (since removed from HEAD; secret-scan CI added). We must complete remediation on ABA's side.

**Questions:**
1. What is the procedure to **rotate/reissue the API key** for sandbox merchant `ec476910` — self-service in the merchant portal, or via a support ticket? Can multiple active keys overlap during rotation?
2. Does rotating the sandbox key invalidate RSA key pairs / webhook registration, or are those independent?
3. Should we notify ABA of the exposure incident through any specific channel for compliance?

---

## Q9 — Production transaction semantics: `tran_id` uniqueness & visibility delay 🟡

Observed in sandbox (`docs/SANDBOX-FINDINGS.md` §10d): duplicate `tran_id`s are silently accepted,
and fresh transactions have asymmetric visibility delays across query endpoints
(check-transaction <1 s, transaction-detail ~5 s).

**Questions:**
1. Does PRODUCTION enforce unique `tran_id` per merchant? What happens on reuse (rejection code? implicit merge with the original transaction?)?
2. What is the authoritative visibility delay for check-transaction / transaction-detail after creation in production, so we can tune poller grace periods instead of guessing?
3. Is the asymmetry between check-transaction (<1 s) and transaction-detail (~5 s) an architectural guarantee we can rely on, or incidental?

## Q10 — QR lifecycle bounds & QR duplicate semantics (from edge-case audit 2026-08-30, `docs/SANDBOX-FINDINGS.md` §13) 🟢

Sandbox-pinned 2026-08-30: `generate-qr` rejects `lifetime` below exactly 180 seconds with
HTTP 400 code `"04"`, and values up to ~27 h are accepted (spec: min 3 minutes, max 120 days).
Duplicate `tran_id` on `generate-qr` is silently accepted — the same ID at $5.00 and $7.77
produced two live QR payloads, both code 00.

**Questions:**
1. Is the 3-minute QR lifetime minimum (and the 120-day maximum) identical in PRODUCTION?
2. Is duplicate `tran_id` on `generate-qr` intentional in sandbox? What does PRODUCTION do on
   reuse (reject, overwrite, or serve two concurrent QRs)? Note this extends Q9.1 from purchase
   to the QR endpoint; the SDK now rejects sub-minimum lifetimes locally and warns above the
   documented maximum pending this answer.

---

### Partial answers already applied in-code

| # | Date | Source | Resolution |
|---|---|---|---|
| Q6.3 | 2026-08-27 | ABA clarification (relay via integration support) | KHQR offline notification has **no versioned schema doc or schema-version field**; canonical shape = documented KHQR webhook JSON + "be tolerant" rules; payloads may arrive raw or HTML-wrapped; rely on `payment_status_code === 0`, own field validation, and Check Transaction reconciliation. Encoded in `src/webhook/khqr-notification.ts` (`extractJsonPayload` tolerance + `unknownFields` forward-compat) and docs/16. |

### Answer log

| # | Date | ABA response | Resolution |
|---|---|---|---|
| Q1 | 2026-08-31 | **Resolved by evidence, not by ABA reply** — see the 2026-08-31 addendum below | Live docs now publish the exact per-endpoint fieldLists; sandbox-verified; trio shipped in v1.3.6 |
| Q2 | 2026-08-31 | **Resolved by evidence** — see the addendum below | `ctid`+`token_flag CITR_FIX`+`frequency` shipped on the purchase path (live `subscription-21402227e0`); dedicated management endpoints remain undocumented |
| Q3 | — | awaiting | `get-token-details` returns `expired_at`; charging a removed token declines with purchase err 87 — exact expiry boundary still unconfirmed |
| Q4–Q5, Q7–Q10 | — | awaiting | — |
| Q6.3 | 2026-08-27 | ABA clarification (relay) | See "Partial answers" above |
| Q8–Q9 | — | awaiting | — |

---

## Addendum — 2026-08-31: Q1 and Q2 resolved by live-doc evidence (v1.3.6)

**Q1 (token-trio HMAC composition — R-04/05/06): RESOLVED, no longer a production blocker.**
The live Apidog specs at developer.payway.com.kh now publish explicit per-endpoint hash
orders. `scripts/sandbox-probe-token-trio.ts` verified each against the sandbox: the live
compositions pass the hash layer (business codes 105/09/00 on synthetic tokens prove
acceptance) while every §9a-era SDK order now returns `01 Wrong Hash` — the gateway
tightened CoF hash validation after the August campaign. Shipped orders:
- renew: `ctid.request_time.pwt.merchant_id.request_id` (request: requestId+ctid+pwt)
- get-token-details: `merchant_id.request_time.request_id` (request: requestId ONLY)
- remove-token: `merchant_id.ctid.request_time.pwt` (request: ctid+pwt, no request_id)

The `request` binding quirk from §9a is gone; `request_id` is no longer forced into
every body. The SDK capability gate is deprecated to an opt-out. Evidence:
SANDBOX-FINDINGS §16, `test-output/token-trio/probe-2026-08-31T00-28-10-661Z.log`.
The original questions above can still be sent to ABA for written confirmation, but
they no longer block anything.

**Q2 (subscription initiation — R-07): RESOLVED.** The live docs document a
`subscription-21402227e0` operation on the purchase path: `ctid` (required),
`token_flag: CITR_FIX`, `frequency (1W|1M|2M, required iff CITR_FIX)`, with
`token_flag`+`frequency` hashed after `skip_success_page`. Shipped in
`CreateTransactionParams` and the CLI (`generate-checkout --ctid/--token-flag/--frequency`).
Sub-question 3 (dedicated management endpoints) remains unanswered — cancel is
remove-token, per the live token-management docs.


---

## Re-audit — 2026-09-02: status refresh + new questions (Q11–Q18)

**Method:** full re-audit of the repo at `main` (v1.3.6 + link-card form feature,
`a25789b`/`225e15a`): every SANDBOX-FINDINGS section (§1–§16), the 24-op live
coverage matrix, the close-transaction dossier, the beneficiary/payout campaign,
the sync audit (`audit-results/sync-audit-2026-09-01.md`), and CHANGELOG
v1.3.6/Unreleased. Existing Q bodies untouched; statuses updated here.

### Status of Q1–Q10 as of 2026-09-02

| # | Status | What changed since 2026-08-27 |
|---|---|---|
| Q1 | ✅ **Resolved by evidence** (2026-08-31) | Live Apidog docs now publish per-endpoint hash orders; all verified against sandbox (§16). Ask ABA only for written confirmation. SDK ships them. |
| Q2 | ✅ **Resolved by evidence** (2026-08-31) | Subscription trio shipped on the purchase path (R-07). Sub-q 3 (dedicated management endpoints) folded into Q15. |
| Q3 | 🟠 awaiting, narrowed | `get-token-details` now returns `expired_at` (live docs + SDK type); removal declines future charges with purchase error 87 and notifies the ABA Mobile user. Still unknown: exact boundary semantics (Q3.1/Q3.2) and the distinct error code for expired-but-not-removed (Q3.4). |
| Q4 | 🟠 awaiting, evidence strengthened | Sandbox violation dossier complete: close enforced on KHQR channel, NOT enforced on hosted-card sessions (2 approvals after code-00 close, `PAY8skk3vbbi`/`PAY8t4x1ozl9`); close invisible in every read API; no CLOSED status. Production answer still needed. |
| Q5 | 🟡 awaiting | New evidence: rate-limit caps observed as HTTP 403 + numeric `status.code 429`, no headers, `Retry-After` never seen (§11c). Bucket numbers to confirm/correct: check-transaction 600/min, detail 10/min, list 50/min, refund 500/min (SDK bucket `500/1s`), mc-ref 10/min (documented). |
| Q6 | 🟡 awaiting | 6.3 answered (2026-08-27). 6.1 (retry policy) and 6.2 (HMAC header on every redelivery) still open. |
| Q7 | 🟢 awaiting | Unchanged. Sandbox TLS still self-signed; webhook allowlist and `CITR_FIX`-linking confirmation still wanted. |
| Q8 | 🟠 awaiting | Unchanged — sandbox-key rotation procedure for merchant `ec476910` still not requested from ABA. |
| Q9 | 🟡 awaiting, evidence strengthened | Sandbox reconfirmed duplicates on purchase AND generate-qr; visibility asymmetry pinned (<1s check vs ~5s detail; first-check grace code 6). Production uniqueness + authoritative delays still unknown — this gates `retryPolicy` default choice. |
| Q10 | 🟢 awaiting | 180s minimum sandbox-pinned; production parity of lifetime bounds and QR-duplicate behavior still unconfirmed. |

### New questions from the 2026-08-31 → 09-02 evidence

**Q11 — transaction-list visibility: are unpaid QR-only transactions invisible by design?** 🟠
Sandbox-pinned 2026-08-31 (§14b): within a valid ≤3-day window, `transaction-list-2` returned
only checkout-created transactions; 16+ unpaid `generate-qr` transactions created in the same
period never appeared, though check-transaction sees them in <1s and detail in ~5s.
1. Is this filter (list = paid + checkout-created only) the intended production contract?
2. If yes, is there a list variant/filter that includes unpaid open QR transactions (needed
   for reconciliation of abandoned-but-scannable QRs)?
3. Is the 3-day date-window cap (HTTP 403, "Maximum date rang is allowed only 3 days") the
   same in production? Is per-merchant increase possible?

**Q12 — Hash-validation tightening: is §16 the stable contract?** 🔴 (was the Q1 blocker — now a stability question)
The gateway tightened CoF hash validation between the 2026-08-2x campaign and 2026-08-31:
every §9a-era composition that previously passed now returns `01 Wrong Hash`, while the
live-documented orders pass. No announcement or versioning reached integrators.
1. Was the tightening intentional, and are the currently published per-endpoint hash orders
   now frozen (a breaking change would break every CoF integration)?
2. Will future hash-order changes be announced/versioned (spec page revision history, changelog)?
3. Do the published orders also hold in PRODUCTION (they were verified on sandbox only)?
4. Confirm sandbox skips hash verification on `link-card` (corrupted hash still returned the
   hosted page, §9a security note) — and that production enforces it.

**Q13 — Payout/beneficiary provisioning on the sandbox profile** 🟡
Live probes 2026-08-25 (§9b): payout to a structurally valid, non-whitelisted account → 403
code 37 "Payout accounts are not in whitelist"; `add-beneficiary` with a dummy 9-digit account
→ 400 PTL04 "Parameter validation required"; update-status on a nonexistent payee → PTL04.
The SDK now ships `beneficiary add` / `update-status` (CLI, RSA-required).
1. What payee account format does `add-whitelist-payout` actually expect in sandbox
   (ABA account number? MID? the PTL04 masks the real reason — is a real, existing account
   required even in sandbox)?
2. Can the sandbox profile be provisioned for `complete-with-payout` (PTL62 "Merchant
   information is invalid" on every attempt)?
3. Is there a sandbox source of seeded beneficiary accounts (like the SDK's fixture list in
   `docs/SANDBOX-BENEFICIARIES.md`) we can whitelist against?

**Q14 — Payment-link image handling** 🟢
Sandbox-verified 2026-08-31 (§15): multipart upload accepted; image stored + hosted on the
ABA CDN; original filename NOT preserved (renamed `payment_link_image_<epoch-ms>.<ext>`);
`size` reported as 0 even after successful upload; no-image links return the empty shape
`{"image":"","filename":"","size":0}`.
1. Is `size: 0` on success a known defect (we'd like to surface upload size to merchants)?
2. What are the real upload constraints (spec says ≤3MB JPG/JPEG/PNG — is anything else
   enforced server-side: dimensions, aspect ratio, content sniffing)?
3. Is the CDN URL stable and public (safe to embed in merchant-facing receipts)?

**Q15 — Subscription management surface** 🟠
Initiation resolved (Q2): `ctid` + `token_flag: CITR_FIX` + `frequency (1W|1M|2M)` on the
purchase path. The rest of the recurring-billing lifecycle is still only implied:
1. How does a merchant cancel/pause/resume a subscription — is `remove-token` the only
   documented mechanism (our current reading), or do dedicated endpoints exist?
2. How does the merchant learn subscription renewals happened (callback per charge?
   `subscribed_amount`/`frequency` fields in token details only)? What's in the CoF callback
   for a recurring charge vs a one-off?
3. Does `frequency` bound the charge schedule only, or also the token's 90-day renewal
   deadline (i.e., can a CITR_FIX token go stale mid-cycle)?
4. Sandbox: how do we simulate a recurring charge cycle without waiting 7/30/60 days?

**Q16 — Production base URL & environment matrix** 🟢
`https://checkout.payway.com.kh` is taken from the docs but never verified live (§1 "Still
open"; production is never probed without explicit user instruction + production credentials).
1. Confirm the production base URL and that all 22 paths (incl. `-2` suffixed versions and
   the v3 CoF/token-management paths) exist identically in production.
2. Is there a second production environment (e.g., for certification/UAT between sandbox and
   live) with its own base URL?

**Q17 — Sandbox TLS chain** 🟢 (extends Q7.1)
The sandbox still presents a self-signed chain, forcing `NODE_TLS_REJECT_UNAUTHORIZED='0'`
workarounds in every example (and teaching integrators a dangerous habit).
1. Will sandbox ship a publicly-trusted certificate (Let's Encrypt or commercial)? Timeline?
2. If self-signed is deliberate, will ABA publish the chain so integrators can pin it via
   `ca:` options instead of disabling verification entirely?

**Q18 — CoF callback contract (token delivery + user-initiated removal)** 🟡 (payload CAPTURED 2026-09-15 §26 AOF-7; removal = NO callback, details lies — AOF-14; only the signature canonicalization sub-question 5 + new 6 remain OPEN)
The `pwt` token arrives only via `callback_url` on link-account/link-card; ABA Mobile users
can remove a token themselves, and the merchant then receives a CoF callback with status 0
(per live docs, encoded in SDK types).
1. Please publish the exact CoF callback payload schema (all fields, types, status values)
   — we currently validate heuristically.
2. What does status 0 in the CoF callback mean precisely (user-removed vs other reasons)?
3. Are CoF callback redeliveries also signed with `X-PAYWAY-HMAC-SHA512` (Q6.2 extension)?
4. Does a user-initiated removal in ABA Mobile emit a callback even if the merchant never
   configured a `callback_url` for the original link request?

**Status 2026-09-15 (SANDBOX-FINDINGS §26):** the 104 capture blocker is GONE for the
account leg — `link-account` answers `00 Success` with a real `qr_string`/`deeplink`
(CITI_FLEX and CITO_FLEX; card leg still 104 — account-on-file-only enablement). The
receiver now verifies both signature channels (header + classic body `hash`) and records
`signatureSource` so the first live capture will pin sub-questions 1/3 mechanically.
Capture itself is still pending (the go/no-go sweep deliberately carried a dead callback
URL); the full-cycle plan resumes at the link leg. Sub-questions 2/4 (app-side removal
callbacks) are the later legs of the same cycle.

**Status update 2026-09-15, later (first REAL capture — §26 AOF-7/AOF-8):** sub-question 1
is CLOSED BY EVIDENCE: the live delivery is `{request_id, payment_credential:{ctid, pwt,
source_of_fund, type, status(=1 credential-active), expired_at, token_flag, frequency,
subscribed_amount, amount_limit_per_tran, currency}}` with `x-payway-topic:
PaymentNotification`. NEW sub-question 5 (the signature half): the `x-payway-hmac-sha512`
header on this delivery does NOT verify under our documented sorted-key canonicalization,
and 19 offline candidate orderings failed — please publish the exact CoF-callback HMAC
plaintext (field order/canonicalization), or confirm the callback signature scheme
differs from the request scheme. Until then the receiver treats real CoF deliveries as
unverifiable and recovers the token via `get-token-details` (request_id as proof of
linkage). Sub-questions 2/4 (app-side removal callbacks) remain open — the last
un-executed leg of the cycle (needs the human at the phone).

**Status update 2026-09-15, final (app-side unlink executed — §26 AOF-14):**
sub-questions 2 and 4 CLOSED AS NEGATIVE EVIDENCE: the customer removed BOTH linked
accounts in ABA Mobile while a live receiver watched the per-request `callback_url` —
ZERO callbacks were delivered (neither the documented status-0 removal notification nor
anything else; 3 link-approval callbacks arrived fine on the same URL, so delivery
works). Removal is only detectable reactively: `payment-credential` (charge) on the
removed pwts answers `105`; and `get-token-details` KEEPS REPORTING `status: 1`
(active) with full credential data for the removed tokens — an inconsistency that
makes proactive detection impossible. NEW sub-question 6: (a) does a user-initiated
removal callback or profile-level merchant webhook exist at all (and where is it
configured in the portal)? (b) should `get-token-details` report removed tokens
differently (status 0 / code 09) instead of `status: 1`?

### Updated answer log

| # | Date | ABA response | Resolution |
|---|---|---|---|
| Q1 | 2026-08-31 | **Resolved by evidence, not ABA reply** (see 2026-08-31 addendum) | Live-doc hash orders sandbox-verified (§16); trio shipped un-gated in v1.3.6. Written confirmation still welcome (→ Q12). |
| Q2 | 2026-08-31 | **Resolved by evidence** (see addendum) | Subscription trio shipped; management endpoints → Q15. |
| Q6.3 | 2026-08-27 | ABA clarification (relay) | See "Partial answers" above. |
| Q3–Q5, Q6.1–6.2, Q7–Q10 | — | awaiting | See the status table above for current evidence levels. |
| Q11–Q18 | — | awaiting | New 2026-09-02; never sent yet. |

---

## Re-audit 2026-09-06 — payment-link campaign (Q19–Q21)

Discovered by the payment-link docs-review campaign (`docs/17-payment-link.md`,
SANDBOX-FINDINGS §22, evidence `test-output/payment-link-docs-review/`).
Merchant `ec476910` (sandbox).

## Q19 — Sandbox payout-whitelist service disabled (payment-link payout blocker) 🔴

**Observed:** `beneficiary add 500000001` (a seeded sandbox beneficiary) answers
HTTP 403 body code **32 "Service is not enable"**; a payment-link create with
`payout [{acc, amt}]` answers 403 "Payout accounts are not in whitelist". The
profile cannot whitelist beneficiaries OR exercise split-payout on payment
links, so the documented response `payout` shape (apidog: top-level
`[{acc, amt, acc_name}]` vs the overview sample: inside `data`) is unverifiable.

**Blocks:** split-payout documentation accuracy (V-2), any merchant testing
payment-link split payout in sandbox.

**Answer must contain:** how to enable the payout-whitelist service for a
sandbox merchant (or a pre-enabled test MID), and the canonical placement +
shape of `payout` in the create/detail responses.

## Q20 — Payment-link pushback: no hash in production? `status` value set? 🟡

**Observed (sandbox, live capture through a real payment):** the pushback to
`return_url` is `POST application/json` with body exactly
`{"tran_id":"…","status":0,"merchant_ref_no":"…"}` — **no `hash` field**, and
`status` is the **numeric `0`**, while the official overview sample shows
`"status": "00"`. We treat the pushback as a notification and verify via
check-transaction.

**Answer must contain:** confirmation that production pushbacks likewise carry
no hash (i.e. no HMAC verification is possible/intended), whether `status` can
take other values (and their meanings — e.g. failed/cancelled), and whether
more than one pushback per payment can occur (retries on non-200).

## Q21 — Invalid payment-link id: `PTL132` (docs) vs `96` (sandbox)? 🟢

**Observed:** the official detail page documents `PTL132 "Invalid payment
link"`; the sandbox answers **HTTP 403 code `96` "Invalid merchant data"** for
a bogus link id. `PTL132` was not reproducible on this profile.

**Answer must contain:** which code production returns for an invalid/unknown
link id (or both, and when), so the SDK hint table can map it deterministically.

---

## Consolidation pass — 2026-09-07: questions found outside this register

**Method:** scanned all repository Markdown, including `docs/`, `audit-results/`,
`skills/`, `.agents/`, `.scratch/`, `.zcode/`, `HANDOFF.md`, and root guides, for
ABA-facing question markers (`Questions for ABA`, `Clarifying questions for ABA`,
`Confirm with ABA`, `ask ABA`, `TBD: confirm with ABA`, `awaiting ABA`,
`external blocker`). This section makes this file the canonical register for the
open items that were previously only present in supporting notes.

### Q22 — Subscription sandbox enablement + documentation correction 🔴

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-A,
`docs/SANDBOX-FINDINGS.md` §17, `HANDOFF.md` purchase-campaign notes.

**Observed:** subscription purchase requests carrying `ctid`,
`token_flag=CITR_FIX`, and `frequency` now pass the hash layer when `ctid` is
included between `items` and `shipping`, but the sandbox merchant profile
`ec476910` answers HTTP 403 code `104` "Merchant not enabled token flag". The
live subscription docs' hash list omits `ctid`, and the gateway's Wrong Hash
hint also prints the omitted-`ctid` order.

**Questions:**
1. Please enable subscription / token registration for sandbox merchant
   `ec476910`, or provide a pre-enabled sandbox MID, so recurring-payment
   testing can be completed end to end.
2. Confirm the authoritative subscription purchase HMAC field order, including
   the position of `ctid`.
3. Please update the subscription documentation and Wrong Hash hint if the
   enforced order is the 27-field order observed in sandbox.

**Why this is separate from Q2/Q15:** Q2 resolved initiation parameters by
evidence, and Q15 asks about lifecycle management. Q22 is the remaining sandbox
provisioning and provider-doc correctness blocker for proving the shipped path.

### Q23 — Agent provider model support 🟢

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-B.

**Observed:** the agentic CLI preset once referenced OpenCode Zen model
`x-preview-f-free`, which later answered HTTP 401 "Model x-preview-f-free is not
supported" (`PROVIDER_PROPOSAL_FAILED`). Current docs point to
`deepseek-v4-flash-free` from the public `/models` list, but the durable
integration-support model set is not confirmed.

**Question:** Which Zen/OpenCode provider models are supported for merchant
integration use, and which should SDK documentation recommend?

**Note:** This is not a PayWay gateway protocol question, but it is an ABA
integration-support question found in the same ABA draft.

### Q24 — `get-transactions-by-mc-ref` sandbox 404/regression 🟡

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-C and
`NEXT-SESSION.md`.

**Observed:** `/api/payment-gateway/v1/payments/get-transactions-by-mc-ref`
answered HTTP 404 with an empty body in sandbox during the 2026-09-05 skills
audit, while sibling endpoints worked. Earlier campaigns had verified the
merchant-reference lookup path.

**Questions:**
1. Is the sandbox 404 a regression, a profile-gating change, or an endpoint
   retirement?
2. If profile-gated, what provisioning is required for merchant `ec476910`?
3. Is the endpoint still supported in production, and is the documented
   10/minute throttle still current?

### Q25 — Sandbox/production enum and status-domain divergence 🟡

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-D,
`docs/SANDBOX-FINDINGS.md` §9a and transaction-list observations.

**Observed:** sandbox token-flag validation accepted values outside the
currently enforced client-side linking domain in some probes (`CITO_FIX`,
`CITR_FLEX`), and transaction-list status values include `PRE-AUTH` plus the
gateway typo `DECLINDED`.

**Questions:**
1. Please publish the production-valid enum domains for each token-flag use
   site: linking, charging, and subscription registration.
2. Should sandbox-only accepted values be considered unsupported and rejected
   by clients?
3. Please publish the canonical transaction status enum, including whether
   `DECLINDED` is the stable spelling merchants should handle.

### Q26 — Purchase-KHQR scan-time validity window 🟠

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-E,
`docs/SANDBOX-FINDINGS.md` §21 W5-1.

**Observed:** a Purchase-API KHQR with a transaction record still `PENDING` and
with 1440-minute lifetime was scan-refused as "Transaction expired" at age
2h15m, while a seconds-old lifetime-10 QR paid successfully. The KHQR payload
does not embed expiry, so scan validity appears to be enforced by server-side
lookup rather than payload data.

**Questions:**
1. What governs the scan-time validity window for Purchase-API KHQRs: a fixed
   provider window, the submitted `lifetime`, a profile rule, or another value?
2. Which unit applies to that scan-validity window?
3. If merchants request long lifetimes, should they still instruct customers to
   scan immediately?
4. Is the same behavior guaranteed in production?

### Q27 — Duplicate purchase `tran_id` acceptance creates unpayable KHQRs 🟠

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-F,
`docs/SANDBOX-FINDINGS.md` §21 W5-7. Related to Q9/Q10, but this records the
newer, more specific purchase-KHQR failure mode.

**Observed:** the purchase endpoint silently accepted duplicate `tran_id`
creations with code `00`, but the resulting KHQRs scanned as "Transaction not
found" and could not be paid. A hosted-page re-POST for a duplicate closed id
first answered code `4` "Duplicated Transaction ID", then rendered the page on
retry.

**Questions:**
1. Is duplicate `tran_id` reuse supported at all on purchase, or should clients
   treat it as always forbidden?
2. Why does the JSON purchase path answer success for duplicate IDs if the
   resulting KHQR is unpayable?
3. What deterministic production error code should merchants expect on
   duplicate purchase IDs?

### Q28 — `close-transaction` succeeds for never-created IDs 🟡

**Source:** `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` Q-G,
`docs/SANDBOX-FINDINGS.md` §21 W5-2. Related to Q4, but this is a narrower
gateway-validation question not listed in the original close dossier.

**Observed:** `close-transaction` for a `tran_id` that never existed answered
code `00` "Success!", while close-after-payment correctly rejected with HTTP 403
code `2`.

**Questions:**
1. Is success for a never-created transaction intentional idempotent-delete
   behavior?
2. If not, what not-found or invalid-state error should the endpoint return?
3. Does production match this sandbox behavior?

### Q29 — Hosted checkout/deep-link route and browser-view rules 🟢

**Source:** `docs/15-merchant-scenario-requirements.md` TC-001, TC-005,
`docs/08-deep-linking.md`, `docs/glossary.md`, `docs/SANDBOX-FINDINGS.md` §8c.

**Observed:** scenario docs still mark several route/UI behaviors as
profile-dependent or ABA-defined: `payment_gate=0` routing, whether
`hosted_view` is mobile-only, exact ABA Pay deep-link URI schemes, and whether
`payment_gate` is still supported on `/v1/payments/purchase`.

**Questions:**
1. Confirm that `payment_gate=0` routes the merchant profile to Ecommerce
   Checkout HTML rather than QR JSON, and whether this is profile-specific.
2. Confirm whether `hosted_view` is mobile-only or also supported for desktop
   browser checkout.
3. Publish the exact supported ABA Pay deep-link URI scheme(s) and parameters.
4. Confirm whether `payment_gate` remains supported on
   `/api/payment-gateway/v1/payments/purchase`.

### Q30 — QR callback requirement when Check Transaction API is used 🟢

**Source:** `docs/15-merchant-scenario-requirements.md` TC-013 and TC-012,
related to Q6.

**Observed:** supplied acceptance material conflicted on whether QR callbacks
remain mandatory when merchants also use Check Transaction API. The SDK can poll
status and verify callbacks but cannot determine merchant-profile callback
requirements.

**Questions:**
1. Are QR callbacks mandatory for merchant approval even when the merchant
   reconciles via Check Transaction API?
2. Is the requirement different for QR/KHQR, hosted checkout, payment links, and
   CoF flows?
3. Where should merchants configure or prove callback-route approval?

### Q31 — Merchant-profile whitelisting and commercial configuration 🟢

**Source:** `docs/15-merchant-scenario-requirements.md` TC-017, TC-018, TC-020,
TC-021, TC-022, TC-023, TC-026, TC-027, TC-028;
`docs/11-callbacks-and-webhooks.md`; `docs/16-webhook-setup-guide.md`;
`docs/aba-payway-test-case-coverage.md`.

**Observed:** root-domain whitelisting, custom-domain moves, profile method
activation, checkout UI compliance, pre-auth review, POS sign-off,
production/client onboarding gates, optional phone verification, sandbox-profile
reactivation, and KHQR callback whitelisting are external ABA operations. Local
SDK readiness checks can validate URL shape and operator declarations, but
cannot prove ABA completed profile provisioning.

**Questions:**
1. What exact request should merchants send to add or change API-request root
   domains and callback root domains?
2. Do wildcard subdomains apply, and are they profile-specific?
3. What is the procedure to extend or reactivate an expired sandbox profile?
4. How should merchants confirm activated payment methods and approved labels /
   logos for a specific profile?
5. What evidence should merchants retain for pre-auth approval, POS checkout
   sign-off, production/client onboarding, and optional phone-verification
   enablement?
6. For offline KHQR callbacks, what evidence confirms that ABA configured and
   whitelisted the merchant's HTTPS route?

### Q32 — Missed callback retrieval and callback history 🟡

**Source:** `audit-results/transaction-data-audit/REPORT.md` §18.

**Observed:** the SDK can locally journal callbacks it receives, but if a
checkout callback is missed before it reaches merchant infrastructure, it is
unclear whether ABA exposes a retrieval path comparable to
`get-transactions-by-mc-ref` for KHQR/reference lookup.

**Questions:**
1. Is there an ABA-side API or portal export for missed checkout callbacks or
   callback delivery history?
2. Does it include delivery attempts, HTTP response codes, timestamps, and body
   payloads?
3. Can merchants request replay for a specific `tran_id` or time window?

### Q33 — Payment-link expiry, lifecycle status, and datatype parity 🟡

**Source:** `.scratch/payment-link-docs-review/PLAN.md` §§1.1-1.4,
`docs/SANDBOX-FINDINGS.md` §22, `docs/17-payment-link.md` §17.5/§17.7,
`docs/12-error-handling-and-debugging.md`.

**Observed:** sandbox payment-link responses differ from the official docs in
several lifecycle and datatype details: `tran_id` is numeric in create/detail
responses but string in docs and pushbacks; create/detail schemas disagree on
`total_refund`; `pushback_url` is present in the official detail schema but was
absent from sandbox detail responses; `expired_date` unset echoes `"0"`; links
past `expired_date` still read `OPEN` and the hosted page still answers HTTP
200; create rejects past or under-roughly-five-minute expiry with `PTL04`; and
`PTL04` appears to be the sandbox catch-all for several documented error cases.

**Questions:**
1. What is the canonical production type for `tran_id`, `amount`,
   `total_refund`, and `expired_date` in payment-link create/detail responses
   and pushbacks?
2. Should `pushback_url` always appear in detail responses, and if not, when is
   it omitted?
3. Is there a terminal `EXPIRED` status for payment links in production, or
   should merchants always enforce expiry locally?
4. What is the exact minimum future `expired_date` offset and the intended error
   code for too-soon or past expiry values?
5. Are `PTL04`, `PTL05`, `PTL99`, and `PTL132` all still active production
   codes, and what condition maps to each?

### Q34 — get-transactions-by-mc-ref response envelope 🟡

**Source:** `docs/archive/customermoudle-guide.md` §10.4 (merchant-captured),
`.scratch/customer-module-qr/spec.md` gap G3.

**Observed:** every captured production response wraps rows under `data` with a
nested `status` OBJECT (`{"code": "00", "message": "Success!", "merchant_ref":
…}`), while the official doc page / OpenAPI modeling describes a numeric
`status` (0=Success, 1=Wrong hash, 8=Invalid merchant profile, 11=Internal
server error) and a `transactions` array. The SDK now tolerates both and
normalizes; the sandbox cannot arbitrate (the KHQR domain 404s on our sandbox
profile — Q24).

**Questions:**
1. Which envelope is canonical in production — `data` + status object, or
   `transactions` + numeric status — and will it stay stable?
2. Is the string "00" success code identical across sandbox and production?

### Q35 — Customer Module callback routing and signature 🟡

**Source:** `docs/archive/customer module.md` §1.4, `docs/archive/customermoudle-guide.md`
§7.2-7.4/§11.1, `.scratch/customer-module-qr/spec.md` gaps G1/G2.

**Observed:** the Customer Module ("Printed QR") callback is HMAC-signed with
the `X-PAYWAY-HMAC-SHA512` header (captured 2026-08-18) and carries a nested
`customer` profile object. The guide states the Customer Module has exactly ONE
callback URL per merchant profile, configured server-side by the integration
team. The older integration guide mentions "HMAC-SHA256" in one place — the
knowledge base corrects this to HMAC-SHA512.

**Questions:**
1. Do Customer Module callbacks arrive at the SAME single profile callback URL
   as online-checkout callbacks (mixed channels, discriminated only by body
   shape), or can a distinct URL/path be provisioned per channel?
2. Is the callback signature canonicalization identical to the online-checkout
   contract (sorted-key concat, nested objects JSON-encoded), and does it hold
   in production?
3. Confirm HMAC-SHA512 (not the legacy guide's HMAC-SHA256 mention).

### Q36 — Sandbox provisioning for the Customer Module / KHQR query domain 🟡

**Source:** `audit-results/live-api-coverage-2026-08-31.md` row #24 (KHQR by-ref
404), `.scratch/customer-module-qr/spec.md` user-gated live-verify plan.

**Observed:** our sandbox profile answers HTTP 404 for
`get-transactions-by-mc-ref` (the KHQR query domain is not provisioned), so the
reconciliation leg of the Customer Module flow cannot be end-to-end tested in
sandbox; all envelope evidence is merchant-captured production data.

**Questions:**
1. Can a sandbox profile be provisioned with the Customer Module (Invoicing
   Tool/Payment Links enabled, Customer-ID mandatory field) AND the KHQR query
   domain so merchants can rehearse the full flow?
2. Can the sandbox merchant profile's callback URL be self-configured for the
   Customer Module, or does it always require an integration-team ticket as in
   production?
### Q37 — Payment-link `void` endpoint: production availability and contract parity 🟡

**Source:** user-surfaced unpublished endpoint (2026-09-11),
`docs/SANDBOX-FINDINGS.md` §23 (+ addendum #17),
`scripts/sandbox-probe-payment-link-void.ts` (contract mapping) and
`scripts/e2e-payment-link-void.ts` (implementation e2e),
`docs/17-payment-link.md` §17.4.

**Observed (sandbox only — the endpoint has no published docs page):**
`POST /api/merchant-portal/merchant-access/payment-link/void` is live and
fully mapped on the sandbox: same request family as payment-link detail
(RSA-encrypted `merchant_auth = {mc_id, id}`, HMAC over
`request_time + merchant_id + merchant_auth`); success answers
`{status:{code:"00"}, tran_id}` with a numeric `tran_id`; the link then reads
the new `VOIDED` status in detail and the hosted page renders an
invalid-data shell (code `07`); the endpoint is NOT idempotent — a second
void answers HTTP 403 `PTL188` "The payment link is already voided."; a
bogus id answers 403 `96`. Implemented in the SDK/CLI on that contract.

**Questions:**
1. Is `payment-link/void` available on production (`checkout.payway.com.kh`)
   with the same path, signing family, and response shapes as the sandbox?
2. Does production `detail` report the `VOIDED` status exactly, and does the
   production hosted page render the same invalid-data state (code `07`)?
3. Can a PAID or partially-paid multi-payment link be voided, or is it
   rejected — and with which code? (Untested in sandbox; we advise merchants
   to refund paid links rather than void them until answered.)
4. Do in-flight payments on a link survive a void (pushback still fires /
   check-transaction still approves), or are they refused client-side?
5. Is `PTL188` the final production code for double-void, and is there an
   official docs page forthcoming for this endpoint?

---

## Source map for ABA-facing questions

Use this file as the canonical register. Supporting files below either feed this
register directly or carry scenario-specific wording that has now been folded
into Q1-Q37.

| Source file | Section(s) | Register coverage |
|---|---|---|
| `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` | Q1-Q37, answer logs, re-audits | Canonical register. |
| `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` | Q-A-Q-G | Folded into Q22-Q28. |
| `docs/CLOSE-TRANSACTION-FINDINGS.md` | §5 Questions for ABA | Q4, plus Q28 for never-created close semantics. |
| `docs/SANDBOX-FINDINGS.md` | §8c, §9f, §10d, §21, §22, §23 | Q5-Q13, Q19-Q21, Q26-Q28, Q34-Q37. |
| `docs/15-merchant-scenario-requirements.md` | TC-001, TC-005, TC-013, TC-016, TC-017-TC-023, TC-026-TC-028 | Q29-Q31, plus Q5/Q30. |
| `docs/aba-payway-test-case-coverage.md` | TC-004-TC-006, TC-009, TC-014, TC-017-TC-023, TC-026-TC-028, remaining gaps | Q29-Q31. |
| `docs/08-deep-linking.md` and `docs/glossary.md` | Deep link `[TBD: confirm with ABA]` notes | Q29. |
| `docs/11-callbacks-and-webhooks.md` and `docs/16-webhook-setup-guide.md` | KHQR callback provisioning / whitelisting | Q31. |
| `.scratch/payment-link-docs-review/PLAN.md` | §§1.1-1.4, V-2/V-3/V-4/V-5, G-3/G-10 | Q19-Q21, Q33. |
| `audit-results/transaction-data-audit/REPORT.md` | §18 Open questions register | Q32; other journal-policy items are internal SDK decisions, not ABA questions. |
| `docs/19-customer-module-qr.md`, `.scratch/customer-module-qr/spec.md` | Customer Module callback contract, mc-ref envelope, sandbox provisioning | Q34-Q36. |
| `docs/PRODUCTION-VERIFICATION-PLAN.md`, `docs/PROJECT_STATUS.md`, `audit-results/sync-audit-2026-09-01.md`, `audit-results/four-pillars/technical-debt-register.md`, `audit-results/four-pillars/RTM.md`, `audit-results/four-pillars/README.md`, `HANDOFF.md` | References to open ABA items | Secondary/stale pointers; consult this register first. |

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

### Link-card review addendum (2026-09-12, agent review session — evidence SANDBOX-FINDINGS §24)

- **Q7 (link-card hash skipping) — RESOLVED BY EVIDENCE, question mooted.** Controlled same-request replays: intact hash → hash layer passes (business code 104 returned); corrupted base64 → 302 `01 Wrong Hash`; missing hash → HTTP 400 `04` with `errors.hash = ["The hash field is required."]`. The sandbox DOES require and verify the link-card HMAC. The 2026-08-27 "skips hash" observation is superseded; no ABA reply needed unless production differs.
- **Q18 (CoF callback contract) — evidence capture BLOCKED on the profile**: link-card answers code 104 "Merchant not enabled token flag" for both CITI_FLEX and CITO_FLEX on sandbox merchant `ec476910` (same enablement family as the §17 subscription 104). No card link can complete, so the `pwt` callback never fires. Ask ABA to enable the token-flag service on the sandbox profile; the capture rig is ready (`scripts/sandbox-probe-link-card-cycle.ts`).
- **New observed contract detail (Q18-adjacent):** the hosted link-card result travels as `302 → Location: …/add-card/<base64 JSON>` (error or success handoff); the POST body itself is a static 42 KB shell with no result marker.

### AOF cycle addendum (2026-09-15, live test cycle — evidence SANDBOX-FINDINGS §26 AOF-1..AOF-14)

Supersedes the "capture BLOCKED" framing above: the account leg is ENABLED and the
full cycle executed. Q18 payload half CLOSED by evidence (AOF-7); Q18 sub-question 5
(callback HMAC canonicalization, 19 candidates failed) and sub-question 6 (removal
callback / profile webhook existence + `get-token-details` reporting removed tokens
as `status: 1`) are filed in the Q18 status update above. Three further items from
the cycle were NOT yet in this register and are now formally filed:

1. **Q41 — MIT charge enablement on the account leg.** `payment-credential` charges
   with `MITU_FLEX` / `MITU_FIX` / `MITR_FLEX` answer `403 code 105` against a valid,
   active account token on `ec476910` (§26 AOF-9); `CITU_FLEX` succeeds. Is
   merchant-initiated-tokenization a separate enablement (like the 104 flag service),
   and can it be switched on for the sandbox profile?
2. **Q42 — `expire_in` semantics + typing.** Live links consistently deliver
   `data.expire_in` as an ABSOLUTE epoch-seconds expiry instant = creation + ~90 s
   (§26 AOF-5/AOF-12) — not the documented "10 minutes", and not a TTL. Please
   confirm the semantic (epoch-of-expiry) and the intended QR window; the OpenAPI
   schema leaves `expire_in` untyped.
3. **Q43 — Card-leg AOF enablement (re-filed as a current question).** The hosted
   `link-card` leg still answers `104 "Merchant not enabled token flag"` on
   `ec476910` (§26 AOF-3), so card tokenization cycles remain un-testable
   end-to-end. Request the same enablement the account leg received (procedure per
   the Q22 answer), or confirm the plan/timeline.

## Integration-skill enhancement questions — 2026-10-02 (append-only)

Source: additional requirements review and approved enhancement of aba-payway-integration.
Status for every item below: **OPEN — owner confirmation required**. No request has been sent externally. Existing answered facts and dated evidence remain intact; linked older questions are narrowed/extended rather than reopened wholesale.

For each answer capture owner, source/rule/version, effective and verified dates, environment/profile/operation scope, approved public wording, examples/vectors, and whether it supersedes older evidence. Update the affected public guidance, vectors, tests and merchant gates after confirmation. Do not publish this internal register or restricted evidence.

### Q44 — Existing production acceptance rule and launch boundary (P0)
Owner: ABA Integration / Product / Settlement. Gates: G4–G6.
Supply the current rule ID/version, exact transaction counts and amount caps, methods/schemes/issuers/currencies/outlets/accounts, required refund/capture/COF/payout cases, approved payers and signoff evidence. Can restricted customer traffic begin before first settlement verification, under what documented conditions? No replacement count or amount policy will be invented.

### Q45 — Settlement sources, joins and finance signoff (P0)
Owner: ABA Settlement + merchant Finance. Related: prior N4/N6.
Provide actual portal/report/bank evidence names, schemas, grain, download/API/permissions, cutoffs/holiday handling and completeness. How do receipt/operation/MID IDs join reports, batches and aggregated bank bookings? Confirm agreement-specific fee/refund/FX/reserve/tax treatment, later-batch adjustments, approved tolerance and reviewer. Existing amount/time/APV similarity will be investigation-only.

### Q46 — Callback service/profile versions, ACK and vectors (P0)
Owner: PayWay API / Integration. Related: Q6, Q18.5, Q35, Q40.
Confirm signature presence/key/canonical bytes for checkout, online QR, signed Customer Printed QR, unsigned offline KHQR, links, token linking and partner/payout variants. Provide approved scalar/boolean/null/nested/Unicode/extra-field vectors and merchant-cohort adapter rules. Confirm accepted status/body (including 200 RECEIVEOK and whether 202 is accepted), response timeout, actual retry/manual replay and policy source per service. Missing signature must not trigger silent downgrade.

### Q47 — Current inquiry proof and recovery semantics (P0)
Owner: PayWay API. Related: Q9/Q10/Q27/Q33/Q34.
Current Check Transaction samples omit original currency. Is there an approved signed-callback/current-query proof combination that avoids detail enrichment, or must approval use paced historical detail? Confirm seven-day boundaries, rate-limit scope across MID/profile/host, 429 shape and scheduling guidance. Identify reliable original-operation recovery for lost link-create, refund, capture and payout responses; without it outcomes remain unknown/escalated. Confirm duplicate/multiple genuine receipt identity rules by QR/link type.

### Q48 — Exact money/FX/ID contract by operation (P1)
Owner: PayWay API / Settlement. Related: Q14/Q20/N2/N6.
Confirm USD/KHR scale/serialization/minimum/maximum, zero/optional amounts, discounts/payable/original basis, FX time/rounding and refund amount rules for every endpoint. Supply ID character/length/uniqueness scope and timestamps/timezone/skew/lifetime/expiry units with vectors. Recipe-local cents/whole KHR is not an assertion that the API accepts internal minor units.

### Q49 — Current onboarding, credentials and network transitions (P1)
Owner: Sandbox onboarding / Integration / Security. Related: Q7/Q8/Q16/Q17/Q31.
Confirm active registration/email/OTP/approval/credential delivery, credential kinds/expiry/rotation/overlap and default entitlements for merchant/partner/outlet profiles. Confirm callback-domain versus egress-IP whitelisting, ingress source controls, ports/WAF/TLS, hosting-outside-Cambodia policy and migration/rollback procedure. Validate historical activation expiry and timelines; do not universalize them.

### Q50 — Simulator fixtures and approved UI/device coverage (P1)
Owner: Simulator / Product Design / Integration. Related: prior N1/Q29/Q38.
Provide current Android/iOS installation links/build/OS/account acquisition/reset/expiry/limits and approved scenarios. Which scan/deeplink/missing-app/embedded/cancel/return cases are supported? Supply public redistribution approval, current test-card outcome fixtures, UI/brand assets, and modal/bottom-sheet/hosted-QR rollout/entitlement rules. Never publish reusable simulator access secrets.

### Q51 — Complete endpoint/method/entitlement contracts and vectors (P1)
Owner: PayWay API / Product. Related: Q5/Q11/Q21/Q24/Q25/Q31.
Provide approved versioned operation schemas, transport/encoding/signing/encryption/status/error/limits, golden vectors and conflicts with observed SDK contracts. Confirm per-flow scheme/method/currency/refund/pre-auth/COF support, sandbox availability and merchant enablement; a logo/enum/sample alone will not certify availability. Which derived specifications may be distributed publicly?

### Q52 — COF consent, scheduling and revocation (P1)
Owner: COF Product / API / Compliance. Related: Q18/Q22/Q41/Q42/Q43.
Confirm approved consent/audit/retention and customer/MID/token ownership rules, CIT/MIT and 3DS use, exact token renewal/removal/expiry behavior and callback verification. Which schedules are provider-owned versus merchant-owned, and how are cancellation, in-flight charges, retries/grace/notifications and revoked consent handled? Existing account-cycle evidence remains valid in its dated scope; card/MIT enablement remains separately limited.

### Q53 — Hold/capture/release and refund eligibility conflicts (P1)
Owner: Card / Pre-auth / Refund Product / Settlement. Related: Q12/Q13/Q15/N2/N3.
Confirm hold window, allowed lower/equal/higher card completion (public guide versus earlier relay), partial capture/remainder release timing, capture/cancel races, automatic expiry evidence and actual incremental/re-auth support. Confirm current refund windows/method enablement, partial/concurrent/issuer/NBC behavior, original-operation inquiry, portal fallback and finance impact. Do not invent extra endpoints or release-time guarantees.

### Q54 — Payout sources, partial outcomes and financial proof (P1)
Owner: Payout Product / API / Settlement. Related: Q19/Q20/Q36/N4.
Confirm source account/CIF/currency versus settlement account rules, permissions/commercial limits, beneficiary status/currency/lookup, fees/allocation/rounding, request IDs, batch/per-beneficiary execution and recovery. Provide actual source debit/all-beneficiary credit evidence/report joins; incoming settlement exports do not automatically prove funds-out.

### Q55 — Plugins and adjacent product contracts (P2; affected claims blocked)
Owner: Commerce plugins / POS-ECR / ABA Mini Apps / Partner / BillZone.
Provide official platform/plugin/source/version/feature/upgrade/rollback support, hardware/firmware/ECR transport/protocol, Mini App app/profile/environment/domain/method/return rules, partner legal/provisioning/entitlement/tenant isolation, and BillZone bill validation/posting/suspense/correction/reconciliation. Name each owner and separate UAT/production acceptance; ordinary PayWay sandbox checks cannot certify these products.

### Q56 — Public/internal distribution and maintenance approvals (P2)
Owner: Product / Developer Relations / Security / Support.
Confirm approved brand/license/source redistribution, API/fact reviewers, public contact, maintainers, review cadence, compatibility/retirement and internal-companion access. Confirm current portal/go-live/support/VIP policies before restricted publication; internal staffing/Jira/SLA details stay outside the public skill. Repository destination/version/history decisions remain the existing release-owner decisions.

## Default checkout UI update — received 2026-10-03 (Q50/Q56 partial answer)

Source: project-owner relay of PayWay Integration Team guidance and supplied Figma exports. Receipt date is not a confirmed authoring/effective date. Evidence and SHA-256 file identities: [checkout UI source record](../../.scratch/payway-integration-skills/CHECKOUT-UI-SOURCES-2026-10-03.md). No request was sent externally, and the linked live Figma designs could not be inspected.

**Q50 partially answered — preserve these supplied requirements:** all profile-enabled methods visible/selectable under Select payment method; exact ABA KHQR / Scan to pay with any banking app wording; current official assets; expected web popup via checkout2-0.js/AbaPayway.checkout(); full-screen mobile WebView with hidden app-owned browser chrome and static merchant header; readable full-screen/WebView hosted QR where returned; linked policies and mandatory frontend checkbox above Pay, with refund/cancellation policy at final order step; web continue_success_url/app return_deeplink; merchant confirmation/cart cleanup after verified backend success. Integration Team reviews checkout/KHQR logos, wording, labels, currency formatting and behavior before production credentials. Backend verification, payload response shape and merchant enablement remain separate contracts.

The supplied logo export adds: merchant checkout upload 300 × 300 px JPG/PNG ≤3 MB; displayed logo minimum height 40 px, width auto and 10 px protection space; separate vendor circle PNG 315 × 315 px ≤3 MB with primary-color background; primary-color checkout theme and configurable continuation label. Illustrated method order and 40 × 40 exported SVG size are not established universal layout/touch-target requirements.

**Remaining Q50 inputs (do not re-ask the confirmed presentation rules):**

1. Confirm the current approved guideline/version/effective date (the design link is titled 2.11), canonical public source and full supported device/embedded-browser matrix. Do Telegram, external browsers and native wrappers have different header/navigation requirements?
2. Confirm vendor-logo applicability, profile configuration procedure for logo/theme/continuation label, supported label/locales, and any required method order/spacing/currency typography absent from the exports. Resolve any registered-versus-enabled method discrepancy before defining footer logos.
3. Supply the screen-review channel, required screenshot/recording/device cases, approver and durable sign-off artifact before production credentials. Is a merchant/profile change subject to re-review?
4. Confirm bottom-sheet availability and per-environment/profile hosted-QR response/expiry/entitlement rules. Presentation intent does not make checkout_qr_url universal. Simulator/test fixture questions in Q50 remain open.

**Remaining Q56 inputs:** confirm public redistribution/license/version/update permission for the SVGs, composite logo strip and design exports (including third-party payment network marks), approved public wording for the relayed requirements and canonical asset download/source. Supplying files for this implementation review is not explicit permission to bundle them in a public package. Original assets remain outside skills/knowledge/docs-packaged; only scoped textual guidance was propagated. Other Q56 maintenance/publication decisions remain open.

## Telegram AI-bot relay batch — 2026-10-03: 43-question questionnaire answered (append-only)

**Method:** the open items of this register (plus the skills-audit draft Q-A–Q-G and the
INTEGRATION-GAPS unfiled items) were distilled into 43 self-contained Telegram messages
(T-00 context primer + T-01..T-42, ordered P0→P1→P2) and posted to the PayWay integration
AI bot (`@payway_Integration_AI_bot`, AGENT_test_Sohail group) in 16 batches on 2026-10-03,
05:14–06:07 chat clock, via the telegram-desktop-control rig. All 43 groups were answered.
Questionnaire: `.scratch/telegram-aba-questionnaire/QUESTIONNAIRE.md`; extracted facts and
per-item register proposals: `answers/ANSWERS.md` in the same folder; verbatim transcripts:
`answers/raw/batch-01..16-*.json` (committed `c7df043`). The T-id → Q-number crosswalk is
the ANSWERS.md status board. No new Q-numbers were filed — every finding folds into an
existing item.

**Evidence-quality caveat (stricter than the 2026-09-12 relay):** the responder is an AI
assistant answering from its indexed PayWay documentation — NOT the Integration Team.
Answers are doc-derived summaries, usually without document IDs/URLs. Everything below is
"doc-derived per bot relay": actionable design guidance, not written contract confirmation.
Answers that contradict our sandbox evidence are flagged as **conflict** and listed in the
re-test subsection; production-parity asks stay formally open. Statuses used below:
**answered (bot)** = doc-derived answer captured · **partial (bot)** = some sub-items
answered · **negative (bot)** = explicit "not documented" + named human-channel owner ·
**conflict** = doc-claim vs our live evidence.

### Status updates to existing questions

| # | New status | What came back |
|---|---|---|
| Q3 | partial (bot) | 3.1 ANSWERED: validity is ROLLING — "90 days after their initial linking, renewal, or the last successful transaction—whichever is most recent" (CITI_FLEX/CITO_FLEX account tokens). 3.2 (boundary timezone) open; 3.4 (expired-but-not-removed error code) open — declined + ABA Mobile notification, no code documented. |
| Q4 | conflict | Doc-claims: close prevents further payment; Check Transaction expected to show CANCELLED plus an intermediate pending-closed state; paid-after-close → backend reversal observable as REFUNDED/CANCELLED; re-close response unspecified. CONTRADICTS sandbox (no CLOSED status in any read API, close dossier) — needs live reconciliation before codifying. |
| Q5 | partial (bot) | Only documented numeric limit: KHQR generation 10 req/s per MID. Check Transaction guidance 20 rps (50 rps negotiable with ops). No published limits for transaction-detail/list/refund/mc-ref — our working numbers unconfirmed. HTTP 429 documented as the rate-limit signal but NO Retry-After today and no roadmap; penalty model mixed (KHQR per-MID; IP blocking, portal "Access denied Error code 1020"); no canonical 429 body documented. |
| Q6.1 | re-confirmed (bot) | Single best-effort delivery; one push attempted, no retry on timeout/unreachable; observed 1 extra attempt ~10 s (15–20 s total window) explicitly not to be relied on; recovery = Check Transaction (3–5 attempts with delays recommended). |
| Q7 | partial (bot) | 7.2 ANSWERED: callback source IPs DC1 103.108.218.76, DC2 103.108.218.2 (optionally the whole 103.108.218.0/24). 7.3 confirmed (CITR_FIX invalid on linking). 7.1 sandbox TLS chain: absent from bot docs → infra/ops (Q39). Merchant callback endpoint rules: HTTPS over 443, valid cert, public DNS, POST→HTTP 200; custom external ports unsupported (reverse proxy); WAF/CDN allowed if PayWay IPs unblocked; hosting outside Cambodia allowed. |
| Q8 | answered (bot) | No self-service key rotation — the Integration Team issues/renews all credentials; old/new-key overlap undocumented (confirm when planning); API-key rotation is INDEPENDENT of the RSA key pair and callback registration; production keys carry temporary expirations during onboarding (~72 h activation windows, removed after go-live verification); exposed-key incident path = Integration Team channel and/or digitalsupport@ababank.com (no dedicated compliance address). |
| Q9 | answered (bot) | 9.1: production rejects duplicate tran_id with a duplicate-transaction error (exact numeric code undocumented); purchase is NOT idempotent — lost-response recovery = Check Transaction on the SAME tran_id, else a NEW payment with a NEW tran_id. 9.2/9.3: no documented SLA; Check Transaction is a 7-day cache window vs transaction-detail's persistent store; documented poll pattern: wait ~3 s, poll every 3–5 s until Approved or lifetime expiry. |
| Q10 | partial (bot) | 10.1/10.2 open (Integration Team). 10.3: the 3-minute minimum is documented as enforced; no documented maximum ("120 days" unconfirmed). TENSION: the bot reads lifetime's unit as MINUTES; our sandbox pinned a 180-SECOND generate-qr rejection floor — arbitrate against the sandbox before codifying. |
| Q11 | answered (bot) | Unpaid QR-only invisibility is the expected contract (docs never promise open QRs in the list); no unpaid-inclusive filter/variant exists; the 3-day per-request cap is a general rule across environments and not overridable — use pagination across windows or portal exports. |
| Q12 | negative (bot) | No freeze guarantee and no changelog/spec-versioning policy for HMAC field orders; the same order applies to sandbox and production per endpoint/version; gateway-vs-spec divergence = bank-side escalation. |
| Q13 | partial (bot) | Beneficiaries = MIDs (card split supports MID only) or whitelisted ABA accounts; SANDBOX must not use real bank accounts — team-provided sandbox whitelist accounts (validates our 500000001 fixture); exact payee field format still not spelled out (generic PTL04); PTL147 "Payment currency is not allowed" named for beneficiary-currency mismatch. |
| Q14 | partial (bot) | NEW documented image constraints: width ≤ 2000 px; filename without special characters such as parentheses. size:0 defect, filename renaming, CDN-URL stability remain open. |
| Q15 | answered (bot) | No dedicated cancel/pause/resume subscription API: the merchant provides an unsubscribe UI and stops its own scheduled job; token freeze/remove blocks charges (status 0/1/2). Renewal charges are MERCHANT-initiated (Payment API with MITR_FIX) and each fires the STANDARD pushback ({tran_id, apv, status:"0", return_params}) — no recurring-specific schema. frequency governs the billing schedule only, NOT token expiry; scheduled-token expiry policy unspecified. No documented sandbox cycle accelerator (sandbox MAY support token-expiry manipulation). |
| Q16 | answered (bot) | 16.1: production base URL CONFIRMED as https://checkout.payway.com.kh (per-path parity still belongs to PRODUCTION-VERIFICATION-PLAN). 16.2 ANSWERED NEGATIVE: "UAT environment is no longer supported; use sandbox instead. Old UAT API credentials can be reused to call the sandbox API endpoint." Sandbox base named: https://checkout-sandbox.payway.com.kh. |
| Q18.5 | negative (bot) | CoF token-notification canonicalization NOT documented (general rules only: HMAC-SHA512, Base64, shared secret, X-PAYWAY-HMAC-SHA512); bot defers to the Integration Team — corroborates our 19 failed offline orderings; transitive-auth via get-token-details(request_id) stands. |
| Q18.6 | conflict | Doc-claims: removal/freeze/unfreeze/renew status-change callbacks CAN fire — to the PROFILE-level CoF callback_url (Merchant Portal → Outlet Profile → Services → Credential on File), same payment_credential structure; get-token-details documented status map 0 removed / 1 active / 2 frozen. CONTRADICTS live AOF-14 (zero callbacks on the per-request URL; status stayed 1 for removed tokens). RE-TEST with a receiver on the portal-configured URL before treating AOF-14 as final. |
| Q19 | partial (bot) | Team-enablement procedure re-confirmed; canonical payout placement in payment-link create/detail responses still open (no schema in the bot KB). |
| Q20 | answered (bot) | No hash/HMAC in pushbacks confirmed (payload {tranid, apv?, status, returnparams?}); NEW: MULTIPLE pushbacks per payment are possible (status changes) → idempotent processing required; the full status-value matrix is still open. |
| Q21 | open | PTL132 vs 96 not resolvable from the bot KB (neither code defined there). |
| Q22 | unchanged (corroborated) | The bot's docs contain only generic purchase HMAC orders (no ctid/token_flag/frequency; no 26- vs 27-field CITR_FIX variant) — cannot confirm the ctid position; doc + Wrong-Hash-hint fix = bank-side escalation. Profile enablement (22.1) needs the human channel. |
| Q24 | partial (bot) | 24.3 ANSWERED: production-supported; returns the latest 50 matches per merchant_ref; 10 req/min documented (no sandbox/prod difference). 24.1–2 (sandbox 404 classification) unexplained in the bot docs → Integration Team. |
| Q25.1–2 | answered (bot) | Full production domain map: linking = CITI_FLEX, CITO_FLEX; charging = CITU_FLEX, MITU_FLEX, MITR_FIX; subscription registration = CITR_FIX (frequency 1W/1M/2M). CITO_FIX / CITR_FLEX / MITU_FIX / MITR_FLEX appear nowhere in the spec → out-of-contract; clients should reject them. CITR_FIX intentionally invalid on linking (closes Q7.3). |
| Q26 | answered (bot) | Two-clocks model with DOCUMENTED numbers: ABA KHQR web-QR timeout 5 minutes; KHQR deeplink timeout 10 minutes — gateway-enforced, independent of transaction lifetime; QR images may expire even earlier (~2 min example); no per-merchant overrides; production identical; long-lived QRs belong to the QR-on-invoice / QR-on-API products (~30 days). Matches W5-1 and the 2026-09-12 session-timeout numbers. |
| Q27 | answered (bot) | See Q9.1: production rejects duplicates; sandbox acceptance = invalid usage (root cause unexplained); documented exception: QR retries may reuse the same tran_id for the SAME payment flow. |
| Q28 | doc-claim (bot) | Only successfully created transactions can be closed; a non-existent tran_id should return a not-found error — the sandbox's code-00-for-never-existing is NOT documented as intentional; production parity unconfirmed. |
| Q29.1–2, 29.4 | answered (bot) | payment_gate=0 → E-commerce Checkout (hosted HTML/redirect) vs QR-API response (qr_string/qr_img) — decisive when BOTH services are enabled on the profile; payment_gate still supported on /v1/payments/purchase (set explicitly on dual-service profiles); view_type=hosted_view is the mobile/H5/WebView full-screen mechanism; desktop popup = JS plugin + iframe without view_type. |
| Q31 | largely answered (bot) | Whitelisting: merchant sends exact domains/IPs + environment → Integration Team updates per profile per environment; wildcards undocumented (case-by-case); no self-service whitelist UI. Sandbox reactivation: expired activation → team resends; expired keys → Digital Support (digitalsupport@ababank.com); verify with one test transaction. Sign-off evidence checklist captured (tran_id/APV/order IDs, full-flow screenshots/recordings incl. POS/web/KIOSK/mobile, callback + network logs, executed scenarios incl. pre-auth and offline-KHQR callback-vs-polling); whitelisting verified by absence of 403 + callbacks from the documented IPs. |
| Q33 | partial (bot) | Request-side amount/payment_limit/expired_date = STRINGS; tran_id — model as string, accept numeric-or-string; pushback amount/totalAmount numeric; status numeric-or-enum (0 = success). Doc-claim: server-side expiry enforcement ("requests after expiry must be rejected") — TENSION with sandbox §22 (expired links read OPEN + hosted page 200) — re-verify. EXPIRED status field, pushback_url presence rules, minimum expiry offset, PTL04/05/99/132 mappings: undocumented in the bot KB. |
| Q34 | answered (bot) | Canonical envelope = { data: [...], status: { code: "00", message, merchant_ref } } — the data array + nested status OBJECT; string "00" in both environments; no top-level transactions array. |
| Q35 | partial + conflict | 35.1 ANSWERED: ONE callback URL per profile for ALL channels (change = support ticket; team-configured in both environments). 35.3 ANSWERED: HMAC-SHA512 + Base64; SHA256 mentions are legacy. 35.2 CONFLICT: one bot answer says raw-body HMAC (no re-serialization), another says sorted-key concatenation — arbitrate against our 2026-08-18 Customer-Module capture before codifying. |
| Q36 | answered (bot) | Sandbox CAN be provisioned with the Customer Module (enable Invoicing Tool / Payment Links + KHQR services + domains — team-done, no self-service toggle); reconciliation via get-transactions-by-mc-ref with the Customer ID as merchant_ref. |
| Q37 | partial (bot) | Void exists via portal AND API and is irreversible (docs); exact production path/signing, docs page, PAID-link voidability, in-flight behavior, PTL188 finality: undocumented — our §23 live mapping remains the only contract evidence; the refund-instead-of-void advice stands. |
| Q38 | confirmed (bot) | Docs repeat "Google Pay for online transactions was not available at the time of the discussion"; no env matrix or enablement flow → keep the SDK advisory; Sales confirms current status. |
| Q39 | unchanged (bot negative) | Sandbox TLS chain absent from the bot docs → infrastructure/operations team (the contradiction with the 2026-09-12 "no self-signed certs" claim still stands). |
| Q41 | CORRECTION | The 105-error probes used MITU_FIX / MITR_FLEX — NEITHER is a documented value. Documented MIT flags: MITU_FLEX (unscheduled) and MITR_FIX (scheduled). RE-PROBE with valid flags before treating code 105 as a profile-enablement blocker. |
| Q42 | partial (bot) | expire_in semantics CONFIRMED = absolute epoch-seconds expiry instant (doc sample 1627113926), not a TTL; the intended Link-Account QR window (~90 s observed vs the "10 minutes" doc phrase) still needs the Integration/Product team. |
| Q43 | unchanged | Card-leg enablement needs the human channel (T-10 procedure). |
| Q44 | partial (bot) | Documented floor: ≥1 low-value production transaction (card if in scope) + transaction ID + evidence for settlement/callback verification; per-method/issuer counts and mandatory-case matrices are internal policy; multi-outlet deployments may need ≥1 transaction per outlet; soft-launch before first-settlement verification not codified (case-by-case with Integration/Commercial/Compliance). |
| Q45 | largely answered (bot) | Join model: PayWay portal export (order ID/purchase#/tranid, APV, amount, date/time, masked PAN) ↔ bank iBanking/settlement reports (purchase/reference = PayWay order ID; fallback masked-PAN + amount + time window; a custom ABA export with orderID + bank reference is available on request). APV not guaranteed on bank statements; fees = separate debits per agreement; refund-before-settlement timing trap; T+N bank working days, weekends/holidays shift to the next working day; adjustment playbook (exclude wrong portal records / ABA back-fills with correct date / refund-to-avoid-delay); escalation = time-based (beyond the agreed window), no numeric tolerance. |
| Q46 | partial (bot) | Customer Module is the ONLY fully specified callback: X-PAYWAY-HMAC-SHA512, HMAC-SHA512 Base64, plaintext = raw request body (BUT see the Q35.2 conflict); reject-and-discard on failed validation; ACK: specific-ack endpoints = HTTP 2xx + exact expected body (RECEIVEOK example); generic pushback = quick HTTP 200 with a short optional body; 202 NOT documented as accepted; ~5 s response timeout and failed callbacks are NOT re-sent; per-product canonical strings for generic callbacks undocumented; sample payloads captured (incl. the nested customer object). |
| Q47 | largely answered (bot) | Proof = verified callback (ledger) + Check Transaction (recent status only, 7-day window); original amount/currency fields live on mc-ref and transaction-detail — no callback+check-transaction-only full-proof pattern exists. Recovery keys: tran_id → Check Transaction/detail (detail carries refund_amount + operations history), merchant_ref → mc-ref. REPEAT PAYMENTS: the same QR/link can be paid multiple times — each approval gets a NEW transaction_id; dedupe on transaction_id, reconcile on merchant_ref, never dedupe on merchant_ref alone; classify UNPAID/PARTIALLY_PAID/PAID/OVERPAID/EXCEPTION. Windows: check 7 days; mc-ref latest-50 at 10/min (no max age); detail 10/min (no max age). |
| Q48 | largely answered (bot) | GLOBAL amount format (purchase/QR/refund): USD decimal string with exactly 2 dp ("0.01"…"2500.00"); KHR integer-only ("16000"); no symbols/commas/spaces in amount. Only documented numeric limit: USD refunds ≥ 0.01 and ≤ remaining refundable. tran_id ≤ 20 chars alphanumeric (hyphen allowed in some integrations); uniqueness scope unspecified. return_params excluded from the hash, no charset/length limits; req_time = 14-digit YYYYMMDDhhmmss, timezone unspecified (treat as opaque). Sub-100-KHR refunds: unconfirmed. TENSION: one bot answer read lifetime as minutes, another left the unit unspecified — the sandbox 180-second floor arbitrates. |
| Q49 | partial (bot) | Credentials team-issued (API key + RSA per profile per environment) with temporary expirations on production onboarding; callback egress = HTTPS 443/public; hosting outside Cambodia allowed; no WAF/TLS-version/cipher matrix documented. Claim "a single settlement currency per profile" TENSION with the 2026-09-12 dual-currency relay — verify. |
| Q50 remainder | largely answered (bot) | No public spec version/effective date/canonical URL — team-supplied design assets ARE the canonical source; no device/browser matrix (universal webview rules: hide URL bar + menu, static merchant header, whitelisted referer, back closes when there is no history); bottom-sheet NOT allowed for card forms (global rule; view_type=hosted_view for fullscreen; card forms load in a webview/full page, never an iframe); canonical labels ("ABA KHQR", subtitle exactly "Scan to pay with any banking app"), method order ABA PAY → KHQR → cards, single enabled method = single-action UI; dot-decimal currency typography ("1,000.00 USD"); screen review = full-flow sandbox evidence (screenshots/recordings + APK/TestFlight builds + test accounts) → UI sign-off package → production credentials; EXPLICIT re-review rule ("must not be modified from the version approved during UI review without re-approval"); hosted-QR via checkout_qr_url (never replace with custom KHQR) with deeplink-first fallback; countdown + replace-on-expiry (~180 s example); template entitlements = profile config. Locale list + config mechanism still open. |
| Q51 | negative (bot) | No capability-discovery API/schema exists; authoritative source = Integration/Commercial confirmation per profile per environment; runtime signal = "Selected Payment Option is not enabled for this Merchant Profile" or the method missing from the hosted page; pattern = design-time configuration + runtime hard-fail handling. |
| Q52 | largely answered (bot) | Consent: scheduled = CITR_FIX subscribe (fixed amount + frequency) → PWT via callback_url; unscheduled = CITI_FLEX/CITO_FLEX link → CITU_FLEX/MITU_FLEX charges. Merchants MUST provide subscribe/view/unsubscribe UI; customers control tokens in ABA Mobile. Retention split: PayWay stores token + masked source_of_fund + metadata; merchant stores pwt + internal ctid + plan config; raw PAN/CVV storage forbidden (hosted UI only). SCHEDULE OWNERSHIP: the merchant's daily job drives charges — PayWay never auto-bills; retries are merchant-owned (revoked/expired tokens simply decline; no grace period, no queuing); in-flight charges at revocation resolve per normal rules. CITI_FLEX tokens cannot be used for MIT. 3DS: enrolled cards require OTP challenges surfaced by the integration; manual key-in / CNP without authentication forbidden; hosted UI mandatory absent a separate product with PCI-DSS evidence. |
| Q53 | largely answered (bot) | Completion: partial and equal supported; up to ~10% ABOVE the hold for supported card pre-auth (config/scheme-dependent); remainder auto-released after partial completion; uncompleted holds auto-reverse within the window (~30 days). Capture/cancel race: undefined — avoid by design. NO incremental-auth or re-auth API (use the ~10% tolerance, or CoF + a new authorisation). Auto-release detection: poll check-transaction-2 / portal — no webhook. Refund recovery: stored tran_id/pre-auth references + Check Transaction/detail; offline fallback via bank forms + the settlement team. |
| Q54 | partial (bot) | Source = the merchant's settlement/platform sub-account, same currency (no cross-currency funding documented); PTL147 on beneficiary-currency mismatch; fees/limits/rounding = commercial configuration (the {acc,amt} sum must match); visibility via Merchant Portal + ABA Merchant app; sandbox whitelist accounts team-provided. |
| Q55 | partial (bot) | Officially documented plugins: Shopify (ABA-maintained app), WooCommerce, PrestaShop, Odoo; plugin versioning/feature matrices/upgrade paths undocumented. POS/ECR hardware contract, ABA Mini Apps rules, and per-product ownership/UAT frameworks: not in the KB → product owners (Integration/Product/Legal-Commercial). |
| Q56 remainder | negative (bot) | No documented redistribution license/version/terms for PayWay or third-party marks in a public SDK; no canonical public download source — needs an explicit go/no-go from ABA Integration + Legal/Branding. The keep-assets-out-of-the-package rule stands. |

### Contradictions and re-tests filed by this batch

1. **Q18.6 re-test (removal callbacks):** the bot says status-change callbacks target the
   PROFILE-level CoF callback_url (Merchant Portal → Outlet Profile → Services → Credential
   on File) — our AOF-14 receiver watched the per-request callback_url only. Re-run the
   unlink cycle with a receiver on the portal-configured URL, and re-check the
   get-token-details status map (doc: 0 removed / 1 active / 2 frozen; observed: stayed 1).
2. **Q35.2 arbitration (Customer Module canonicalization):** raw-body HMAC (T-07) vs
   sorted-key concatenation (T-34) — verify both offline against the captured 2026-08-18
   Customer-Module callback before changing any verification code.
3. **Q41 re-probe (MIT flags):** re-run the MIT charge leg with MITU_FLEX / MITR_FIX only;
   MITU_FIX / MITR_FLEX are out-of-contract values and their 105 answers prove nothing
   about enablement.
4. **Lifetime unit tension (Q10 vs Q48):** one bot answer reads lifetime as minutes, another
   leaves the unit unspecified; our sandbox pinned a 180-SECOND generate-qr floor. Keep
   validateLifetime's seconds-for-QR / minutes-for-checkout split (anti-checklist: do NOT
   "fix" it to 180 s everywhere) until re-confirmed.
5. **Settlement-currency tension (Q49/Q51 vs the 2026-09-12 relay):** the bot claims one
   settlement currency per profile; the relay described dual-currency merchants (settlement
   to the matching account). Treat the relay as more specific until clarified.
6. **Server-side link expiry (Q33 vs §22):** doc-claim "requests after expiry must be
   rejected" vs sandbox OPEN + HTTP 200 — re-verify before softening the local
   expiry-enforcement guidance.
7. **Callback-URL model tension (T-34 vs live evidence):** the bot says ONE callback URL
   exists per merchant profile for ALL channels (support-ticket to change), yet daily
   evidence shows per-request callback_url / return_url working (link-account callbacks
   §26, payment-link pushbacks §22). Probable resolution: the profile-level CoF URL serves
   CoF status changes while per-request URLs serve their own requests — confirm before
   relying on either reading.

### Updated answer log (this batch)

| # | Date | Response | Resolution |
|---|---|---|---|
| Q3.1, Q7.2, Q7.3, Q8, Q9, Q11, Q15, Q16, Q25.1–2, Q26, Q29.1–2/29.4, Q34, Q36, Q38, Q40, Q45, Q47, Q48, Q50 remainder, Q51, Q52, Q53, Q54, Q55, Q56 remainder | 2026-10-03 | PayWay integration AI bot (doc-derived relay — see caveat above) | See the status table above; per-item extracted facts + proposals in `.scratch/telegram-aba-questionnaire/answers/ANSWERS.md` |
| Q4, Q18.6, Q35.2, Q41, Q33 (expiry enforcement), Q49/Q51 (settlement currency) | 2026-10-03 | same | CONFLICTS/tensions filed under "Contradictions and re-tests" above |
| Q21, Q22, Q24.1–2, Q39, Q18.5, Q14 remainder, Q19 (payout placement), Q20 (status matrix), Q33 (PTL codes), Q37 (protocol details), Q42 (window value), Q3.2/3.4 | 2026-10-03 | same | Confirmed OPEN — human-channel owners named (Integration Team / Product / Infra / Legal-Branding / Sales) |

## Telegram AI-bot follow-up + third rounds — 2026-10-03 (append-only addendum)

**Method:** the post-run review of the 43-question batch distilled 15 pointed follow-ups
(FU-01…FU-15 — the bot's own contradictions, evidence conflicts, and rephrased open items) and a
second pass over this whole register surfaced 10 more (TR-01…TR-10 — never-asked sub-items plus
doc-shaped new contradictions). Both rounds went to the same bot the same day; verbatim captures:
`.scratch/telegram-aba-questionnaire/FOLLOW-UPS.md` + `THIRD-ROUND.md`; curated addenda:
`answers/ANSWERS.md` (FU-01…15 + TR-01…10 sections); contradiction scorecard:
`SECOND-PASS.md`. Evidence caveat identical to the main batch above.

### FU round — status changes

| Item | Status | What came back |
|---|---|---|
| Q35.2 | RESOLVED (doc level) | The bot reconciled its own T-07/T-34 contradiction: the RAW HTTP request body is the integrator contract; sorted-key concatenation describes how ABA internally constructs that body — both statements live in the same Customer Module hash section. Final arbiter = offline replay vs the 2026-08-18 capture (still runnable). |
| Q35.1 | CORRECTED | The ONE-callback-URL-per-profile rule is Customer Module-only. Purchase = profile-level static webhook OR per-request `return_url`; Link Account = per-request documented; payment-link/CoF routing and the both-configured precedence rule remain undocumented. |
| Q46 (ACK) | partial→largely answered | Generic pushback: any HTTP 2xx is success (202 technically OK), 200 recommended, empty body accepted. RECEIVEOK-style exact-body ACKs apply only where a per-profile contract explicitly requires them. |
| Q20 (status matrix) | answered + NEW conflict | Pushback fires ONLY for successful transactions — silence is the expected failure contract (confirm via check-transaction; ~15 s webview wait-then-treat-as-failed pattern). No non-success status list exists. NEW: one doc says success = string "Completed" (plugin/order-status mapping) vs numeric 0 in examples — TR-02 resolved this (see below). |
| Q49/Q51 (settlement currency) | RESOLVED | Single settlement currency per profile is the documented default; dual-currency = separate MIDs/profiles or a specially enabled setup. Reconciles the 2026-09-12 relay. |
| Q33 (expiry enforcement) | RESOLVED directionally | Docs = production intent ("requests after expiry must be rejected"; no code/UI/status documented); sandbox OPEN+working-form = sandbox-defective. Keep merchant-side enforcement. |
| Q15/Q3 (scheduled tokens) | answered | CITR_FIX/MITR_FIX tokens carry an explicit `expired_at`; NO inactivity auto-expiry documented; expired → unusable until user re-authorizes; no sandbox cycle accelerator. |
| Q8 (rotation overlap) | answered (negative) | No dual-key overlap window documented — old-key traffic dies with PTL171/PTL175 (HTTP 403); plan zero-overlap cut-overs. |
| Q9/Q48 (refund + ID details) | advanced | Multiple partial refunds EXPLICIT ("until the total amount paid is refunded"); over-refund = PTL37; below-minimum = PTL187 (numeric floor still undocumented); tran_id ≤ 20 chars enforced, hyphen tolerated not guaranteed, uniqueness scope still open. |
| Q5 (429 shape) | advanced | TWO rate-limit surfaces: business-level `status.code=429` inside HTTP 200 ("Too many request, please try again in 1min.") vs transport HTTP 429 (body undocumented, no Retry-After). |
| Q31 (wildcards) | answered (negative) | No wildcard subdomains — every hostname explicit; non-whitelisted → HTTP 403 `{"status":{"code":6,"message":"Requested Domain is not in whitelist."}}`. |
| Q10/Q48 (lifetime unit) | CONFLICT DOUBLED DOWN | Bot re-asserts MINUTES for generate-qr (calls our 180-second sandbox floor an "environment-specific validation/defect"), says NO 120-day figure exists in its docs, and its own docs mention both a ~30-day default and a gateway-short (~3 min) expiry for API-generated QRs. Our coded two-domain split (generate-qr seconds / checkout minutes) matches observed behavior — unchanged; escalate unit + max per product. QR-on-invoice = non-expiring until paid; Soundbox request-qr not in the bot KB. |
| Q4 (CANCELLED) | SHARPER | TR-03 documents `payment_status_code = 7 → payment_status = 'CANCELLED'` as an observable check-transaction state — while our sandbox has never shown it (W4-1). Live reconciliation only; local `closed` flag stands. |

### TR round — status changes (never-asked items + new contradictions)

| Item | Status | What came back |
|---|---|---|
| Q20 wording | RESOLVED | Canonical webhook JSON success = numeric `status: 0`; "Completed" is plugin/order-status-mapping vocabulary; no per-product pushback status values documented. |
| Q49 remainder (migration/rollback) | answered (negative) | Replacement pattern; one key set per profile per environment; NO parallel old/new, NO documented rollback; cut-over notification = share a production transaction ID for verification. |
| Q48 remainder (amount basis) | advanced | `amount` = Total_Amount (final payable after discount; quoted rule); hash over the amount as sent; original price in `Original_Amount`; no separate discount field. Zero/omitted amounts: no documented exception anywhere. FX timing/rounding: still open (Integration Team). |
| Q53 remainder | mostly open | Refund concurrency/dedup undocumented (serialize merchant-side); no per-scheme refund matrix (issuer blocks → offline fallback documented); NBC rules not in KB (Compliance channel). |
| Q54 remainder | partial | Pre-debit validation is all-or-nothing (non-whitelisted blocked; amt sum must equal); post-debit partial failure, per-leg reference IDs, and the source-debit report are undocumented → Integration/ops. |
| Q50 (simulator ops) | answered | Links are project/time-specific from the team; simulator accounts max 2/merchant, 90-day HARD expiry, not extendable; simulator does success flows + Completed/Pending/Expired only — NO declines/timeouts (use sandbox test cards); cancel-mid-flow = abandonment → pending → expired. |
| Production webhook | RESOLVED | For self-registered production merchants the team cannot update callback URLs — per-transaction `return_url` is the production contract; static webhooks are a sandbox/test concept (resolves the FU-02-vs-relay tension). |
| Status vocabulary | PARTIAL | check-transaction returns BOTH `payment_status_code` (numeric) AND `payment_status` (word); success = 0 AND 'APPROVED'; bare `status` fields documented as codes (0,1,2,3,4,5,6,11) — a third numeric vocabulary; a canonical per-endpoint map is a new formal ask. DECLINED is the bot-spec spelling; our sandbox observes DECLINDED — accept both. |
| `return_url` base64 | **RESOLVED (2026-10-03 conflicts session)** | The bot's doc quote AGREES with our wire behavior — the "conflict" was a register-wording error. The SDK base64-encodes EVERY URL field on the wire (`encodeBase64IfNeeded`: purchase `return_url`/`continue_success_url`, QR `callback_url`, payment-link `return_url`, CoF `callback_url`); journal-proven (2026-09-15 link-account `requestDigest` carries `callback_url: aHR0cHM6Ly…` = base64 of the plain URL). What was live-observed "plain" is the URL the gateway POSTs AFTER decoding — delivery-side, not wire-side. SDK unchanged; no escalation needed. Untested and moot: whether the gateway also accepts literally-plain URL fields. |
| N2 remainder | advanced | ~30-day configurable online refund window; offline signed-form process after; ABA-to-ABA refunds fee-free; multiple partials explicit (above). Refund rounding scale still open. |

### Still open after three rounds (68 questions asked)

Q4 + Q28 (live reconciliation), Q18.5/Q18.6 (CoF callback canonicalization; unlink re-test on the
portal-configured CoF URL), Q41 (re-probe MIT with MITU_FLEX/MITR_FIX — old probes used invalid
flags), Q10/Q48 lifetime QR-domain unit + 120d-vs-30d max, Q21 PTL132-vs-96, Q22/Q43 profile
enablement, Q24.1–2 mc-ref 404 classification, Q42 expire_in window, Q37 void production parity,
Q19 payout placement, Q14 size:0/CDN, Q39 sandbox TLS chain (infra), PCI/SLA (compliance), Google
Pay status (Sales), asset redistribution (Legal), FX timing, refund concurrency, payout post-debit
recovery, per-endpoint canonical status maps.

## Conflicts-session probes — 2026-10-03 (post-conformance-wave)

Empirical session against the four deliberately-uncoded conflicts; local evidence only, no team input:

- **Q35.2 (Customer Module canonicalization) — empirical arbitration IMPOSSIBLE, data lost.** The
  2026-08-18 capture's `X-PAYWAY-HMAC-SHA512` header value was never recorded anywhere (repo, git
  history, webhook stores checked); only the body survives (archive doc + docs/19 + the fixture).
  The customer-module e2e "verified" sample is our OWN `webhook trigger` fixture
  (`user-agent: aba-payway-sdk-trigger/1`, signed by our sorted-key `signCallbackBody`) —
  self-verifying, zero evidence about the gateway. The ABA-doc raw-body statement (FU-01) stands as
  the sole authority; `verifyCallbackSignatureRaw` (wave 1) implements it. docs/19's "our single
  captured sample happened to verify under the SDK's sorted-key verifier" wording corrected — it
  described the trigger fixture, not a gateway capture.
- **Q18.5 (CoF PaymentNotification canonicalization) — NEW hard negative.** Raw-body
  HMAC-SHA512(secret, raw-body)→Base64 does NOT verify any of the four REAL 2026-09-15 gateway CoF
  captures (webhook_data/callbacks.db ids 3/9/10/11; stored verdicts "invalid"). Combined with the
  19 failed sorted-key orderings (§26 AOF-8): the CoF callback signature is neither canonicalization
  constructible from the merchant API key — different key material or a different construction.
  FU-01's raw-body doc resolution is Customer-Module-scoped and does NOT generalize to CoF. Stays
  Integration-Team-only, now with a decisive candidate eliminated.
- **Q4 (close-transaction CANCELLED visibility) — fresh sandbox reinforcement (2026-10-03).** Live
  unpaid QR `qrmus3eilnfc449a`: close accepted (code 00); check-transaction-2 AND transaction-detail
  read `payment_status_code: 2 / "PENDING"` immediately AND 45s after close. No CANCELLED (7)
  observable. Same capture live-confirms the TR-03 dual vocabulary (numeric + word fields in one
  response). Local `closed` flag contract stands; production reconciliation still the only arbiter.
- **Q10/Q48 (generate-qr lifetime unit) — floor re-confirmed live; minutes-min-3 FALSIFIED.**
  `--lifetime 3` → rejected (gateway code 04; local preflight cites the 180s floor);
  `--lifetime 180` → accepted, QR created. Under a minutes reading with the documented 3-minute
  minimum, lifetime=3 would be ACCEPTED — it is not. Remaining ambiguity (seconds-floor-180 vs
  minutes-floor-180) is empirically unresolvable: no read API returns an expiry field (detail/check
  carry none; W4-1: no EXPIRED status anywhere). Coded two-domain split stands; the escalation ask
  sharpens to "confirm the QR-domain unit and whether the 180 numeric floor is seconds or minutes".
- **Q41 (MIT valid-flag re-probe) — token-existence precedes flag validation.** Synthetic-pwt
  charges return IDENTICAL code 105 for valid `MITU_FLEX` and out-of-spec `MITU_FIX` (HTTP 403
  "Invalid payment credential token"): flag validation never reaches the router while the token is
  unknown. The true re-probe needs a REAL linked token, which requires a simulator approval (link
  QR scan in ABA Mobile) — a user-gated manual step. Runbook: receiver up (`setup-webhook --tunnel`)
  → `cof link-account -r <req> -c <ctid> -f CITI_FLEX --callback-url <tunnel>/webhooks/aba` →
  approve in simulator → read pwt from the capture (store skips unverified signatures) → charge
  with `MITU_FLEX` vs `MITU_FIX` vs `MITR_FIX` and compare codes.
