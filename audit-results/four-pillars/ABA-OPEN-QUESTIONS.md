# Open Questions for ABA (PayWay Gateway) — Consolidated 2026-08-27

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
| Q1–Q7 | — | awaiting | — |
| Q8–Q9 | — | awaiting | — |
