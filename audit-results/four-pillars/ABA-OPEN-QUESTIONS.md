# Open Questions for ABA (PayWay Gateway) — Consolidated 2026-08-27

> **Superseded-in-part 2026-09-02:** see the **"Re-audit 2026-09-02"** section at the bottom
> for current statuses — Q1/Q2 are resolved-by-evidence, Q3/Q4/Q9/Q10 gained new evidence,
> and **Q11–Q18 are new questions** discovered by the v1.3.6 live-parity campaign,
> the §14–§16 sandbox findings, and the payout/beneficiary probes. The Q1–Q10 bodies
> below are kept verbatim (append-only audit discipline).

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

**Q18 — CoF callback contract (token delivery + user-initiated removal)** 🟡
The `pwt` token arrives only via `callback_url` on link-account/link-card; ABA Mobile users
can remove a token themselves, and the merchant then receives a CoF callback with status 0
(per live docs, encoded in SDK types).
1. Please publish the exact CoF callback payload schema (all fields, types, status values)
   — we currently validate heuristically.
2. What does status 0 in the CoF callback mean precisely (user-removed vs other reasons)?
3. Are CoF callback redeliveries also signed with `X-PAYWAY-HMAC-SHA512` (Q6.2 extension)?
4. Does a user-initiated removal in ABA Mobile emit a callback even if the merchant never
   configured a `callback_url` for the original link request?

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

---

## Source map for ABA-facing questions

Use this file as the canonical register. Supporting files below either feed this
register directly or carry scenario-specific wording that has now been folded
into Q1-Q32.

| Source file | Section(s) | Register coverage |
|---|---|---|
| `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` | Q1-Q21, answer logs, re-audits | Canonical register. |
| `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md` | Q-A-Q-G | Folded into Q22-Q28. |
| `docs/CLOSE-TRANSACTION-FINDINGS.md` | §5 Questions for ABA | Q4, plus Q28 for never-created close semantics. |
| `docs/SANDBOX-FINDINGS.md` | §8c, §9f, §10d, §21, §22 | Q5-Q13, Q19-Q21, Q26-Q28. |
| `docs/15-merchant-scenario-requirements.md` | TC-001, TC-005, TC-013, TC-016, TC-017-TC-023, TC-026-TC-028 | Q29-Q31, plus Q5/Q30. |
| `docs/aba-payway-test-case-coverage.md` | TC-004-TC-006, TC-009, TC-014, TC-017-TC-023, TC-026-TC-028, remaining gaps | Q29-Q31. |
| `docs/08-deep-linking.md` and `docs/glossary.md` | Deep link `[TBD: confirm with ABA]` notes | Q29. |
| `docs/11-callbacks-and-webhooks.md` and `docs/16-webhook-setup-guide.md` | KHQR callback provisioning / whitelisting | Q31. |
| `.scratch/payment-link-docs-review/PLAN.md` | §§1.1-1.4, V-2/V-3/V-4/V-5, G-3/G-10 | Q19-Q21, Q33. |
| `audit-results/transaction-data-audit/REPORT.md` | §18 Open questions register | Q32; other journal-policy items are internal SDK decisions, not ABA questions. |
| `docs/19-customer-module-qr.md`, `.scratch/customer-module-qr/spec.md` | Customer Module callback contract, mc-ref envelope, sandbox provisioning | Q34-Q36. |
| `docs/PRODUCTION-VERIFICATION-PLAN.md`, `docs/PROJECT_STATUS.md`, `audit-results/sync-audit-2026-09-01.md`, `audit-results/four-pillars/technical-debt-register.md`, `audit-results/four-pillars/RTM.md`, `audit-results/four-pillars/README.md`, `HANDOFF.md` | References to open ABA items | Secondary/stale pointers; consult this register first. |
