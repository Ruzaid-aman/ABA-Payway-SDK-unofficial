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
