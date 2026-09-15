# Integration Gaps & Consolidated Questions for ABA PayWay (2026-09-12)

**Purpose.** A documentation-only scan of every meaningful `.md` surface in this
repository (numbered guides `docs/01–19`, `docs/SANDBOX-FINDINGS.md`,
`docs/CLOSE-TRANSACTION-FINDINGS.md`, root guides `README`/`QUICKSTART`/`HANDOFF`,
the canonical question register `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md`,
`.scratch/` campaign notes, and the skills mirrors). It answers three things:

1. **Part 1** — points where this project *cannot* answer a developer's question
   (the documentation's own gap register, with evidence).
2. **Part 2** — the questions a developer integrating a service with ABA PayWay
   actually asks, and whether the docs answer them (✅ / 🟡 / ❌).
3. **Part 3** — a consolidated, prioritized question list to send to the ABA
   PayWay team, merging the canonical register **Q1–Q37** with newly found
   **unfiled** items (N1–N12).
4. **Part 4** — impact assessment of the **2026-09-12 integration-team
   responses** (which of the above they resolve, what they newly reveal, and
   what remains open).

**Rule used throughout:** this repo is *sandbox-evidence only*. Every "unanswered"
below is unanswered **in writing** — many have live sandbox evidence but no ABA
confirmation, and none has production verification (see
`docs/PRODUCTION-VERIFICATION-PLAN.md`).

---

## Part 1 — Where the documentation cannot answer developers

### Strengths (so gaps are read in context)

The docs are a strong *SDK-operations manual*: flows, signing (HMAC-SHA512 per-endpoint
orders), callback verification, per-family error tables, retry matrix, sandbox-verified
quirks (`docs/07`, `docs/11`, `docs/12`, `docs/09` are the deepest chapters). What is
missing is almost entirely **bank-side commercial/policy facts** and **production parity**
— things only ABA can answer.

### Gap register

Severity: 🔴 blocking an integration decision, 🟠 important, 🟡 useful.

| # | Gap | Sev | Evidence |
|---|---|---|---|
| G1 | **Production is completely unverified.** Base URL `checkout.payway.com.kh` never hit live; every fact is sandbox-only; no UAT/certification environment known. | 🔴 | `docs/PRODUCTION-VERIFICATION-PLAN.md:4-14`, `docs/SANDBOX-FINDINGS.md:61`, register Q16 |
| G2 | **No test cards, test accounts, or simulator acquisition path.** Placeholders `[TBD: Obtain from ABA developer portal]` for approved/declined/insufficient-balance cards; ABA-Pay/QR testing needs a rep-provided simulator. | 🔴 | `docs/01-overview-and-concepts.md:126-128`, `docs/12-error-handling-and-debugging.md:730-732`, `docs/02` (simulator note) |
| G3 | **Close-transaction contract contradicts official docs.** Hosted-card sessions paid *after* a code-00 close; no CLOSED status in any read API; channel-dependent enforcement. | 🔴 | `docs/CLOSE-TRANSACTION-FINDINGS.md:29-79,107-120`, `docs/07-qr-code-handling.md:385`, register Q4/Q28 |
| G4 | **Callback retry policy is self-contradictory in our own docs.** `docs/03` says "PayWay retries the callback"; `docs/18`/`docs/19` say PayWay/ABA does not retry. A developer cannot determine the redelivery guarantee per channel. | 🔴 | `docs/03-web-implementation.md:804` vs `docs/18-transaction-journal.md:64`, `docs/19-customer-module-qr.md:49`; register Q6.1 |
| G5 | **Settlement, reconciliation reports, chargebacks/disputes: absent.** No settlement cycle (T+n), cut-offs, statement/report downloads, payout timing, or dispute process anywhere. | 🔴 | nothing in `docs/01–19`; only override-settlement mention in `docs/19` |
| G6 | **Refund policy absent.** Window after capture, multiple partials, fees, who may refund — all missing; partial refund flips whole `payment_status` to REFUNDED (verified trap); partial-refund rounding scale never answered. | 🟠 | `docs/12:263-265`, `docs/SANDBOX-FINDINGS.md:247-248,747-750` |
| G7 | **Offline-KHQR notification authentication contract unknown.** No verification method documented anywhere; ABA must provision/whitelist the callback; repeat-payment and long-validity policy claims unconfirmed. | 🟠 | `docs/07:328-354`, `docs/11:365-371`, `docs/16:94,258`, `docs/13:163-168`, HANDOFF 2026-09-10 note; register Q31.6 |
| G8 | **Duplicate `tran_id` semantics unknown for production.** Sandbox silently accepts duplicates on purchase and generate-qr; duplicate purchase KHQRs are unpayable ("Transaction not found"). Decides whether `retryPolicy:'transient'` is safe. | 🟠 | `docs/SANDBOX-FINDINGS.md:226-227,497-503,823`, register Q9/Q10/Q27 |
| G9 | **Deep-link URI scheme is speculative.** Exact `abapay://` format marked `[TBD: confirm with ABA]`. | 🟠 | `docs/08-deep-linking.md:8,42,375`, `docs/glossary.md:65`, register Q29.3 |
| G10 | **KHQR scan-time validity is independent of `lifetime`** — root cause unresolved (1440-min QR scan-refused at 2h15m; apps cannot branch on generic refusal messages). | 🟠 | `docs/SANDBOX-FINDINGS.md:817,825`, `docs/07:388`, register Q26 |
| G11 | **Profile-gated features untestable in sandbox.** Subscription/token-flag (code 104), payout whitelist (code 32), KHQR by-mc-ref (404), complete-with-payout (PTL62) — all blocked on ABA provisioning. | 🟠 | `docs/SANDBOX-FINDINGS.md:316-327,711-716,847`, `docs/15:85-87`, register Q19/Q22/Q24/Q36 |
| G12 | **Payment-link family: official docs wrong or missing.** `tran_id` numeric vs docs' string; no EXPIRED status (expiry advisory, page stays HTTP 200); `PTL132` never reproduced (bogus id → 96); void endpoint entirely undocumented. | 🟠 | `docs/17-payment-link.md:43,96,105-108,204-207`, `docs/SANDBOX-FINDINGS.md:841-874`, register Q20/Q21/Q33/Q37 |
| G13 | **Error registry self-declaredly incomplete.** Pre-auth PTL59/62/170, refund PTL*, CoF `errors{}`, 403+numeric-429 shape — all reverse-engineered; no authoritative registry; rate-limit shape has no headers. | 🟠 | `docs/12:205-214,636`, `docs/SANDBOX-FINDINGS.md:44-57,264-265,394-405`, register Q5/Q21/Q25 |
| G14 | **Transaction-list blind spots undocumented by ABA.** Unpaid QR-only txns invisible; 3-day window cap; strict date format; production visibility delay open. | 🟠 | `docs/SANDBOX-FINDINGS.md:534-562,807-810,833`, `docs/19:151-155`, register Q11/Q24/Q34 |
| G15 | **CoF/token lifecycle boundaries unconfirmed.** Token validity ~90 days but exact window (89/90/91) and expired-but-not-removed error code unknown; no per-token `expiresAt` push model beyond `expired_at` field. | 🟠 | `docs/09:295-320`, register Q3/Q15/Q18 |
| G16 | **PCI-DSS scope, key rotation, privacy obligations undocumented.** One-line "rotate if exposed"; no SAQ guidance per integration mode; no key-rotation procedure; payer PII in callbacks with no retention guidance. | 🟠 | `docs/10` (PCI mention), `docs/16` (one-line rotation), `docs/19` (PII fields) |
| G17 | **SLA / status page / incident support / support hours: zero coverage.** `docs/13` leaves "ABA Support: [email/phone]" as a placeholder. | 🟠 | `docs/13-deployment-checklist.md`, `docs/12` (support template only) |
| G18 | **Onboarding timelines & portal self-service unknown.** Sandbox approval time disclaimed; callback-URL changes "require a formal support ticket" while `docs/16` hints at a dashboard — never reconciled. | 🟡 | `docs/02` (no delivery-time guarantee), `docs/19`, `docs/16` |
| G19 | **Checkout UI unknowns.** Language/locale `[TBD]`, background color, custom CSS support; hosted-session default expiry undocumented; Google Pay listed with zero setup guidance. | 🟡 | `docs/10:8,31,104-105`, `docs/15` TC-021 |
| G20 | **FX rules undocumented.** `original_amount/currency` vs `payment_amount/currency` divergence noted once; no USD↔KHR conversion/rounding/spread rules; KHR integer floor documented only for payment links; sub-100 KHR refund floor unconfirmed. | 🟡 | `docs/19` (field split), `docs/17` (KHR ≥100), `.scratch/openapi-coverage-audit/fidelity-audit.md:163,318` |

---

## Part 2 — Questions developers ask when integrating with ABA PayWay

Status: ✅ answered by the docs · 🟡 partial (answer exists but incomplete/unconfirmed) · ❌ not answerable from the docs.

### Onboarding & environment
| Developer question | Status | Where |
|---|---|---|
| How do I get sandbox credentials, and what does production onboarding require? | 🟡 (registration URL + "business verification" only; no document list, no timeline) | `docs/02` |
| What are the sandbox test card numbers / how do I get the ABA Simulator? | ❌ `[TBD]` placeholders; "contact a representative" | `docs/01:126`, `docs/02`, `docs/12:730` |
| What is the production base URL, and is there a UAT environment? | ❌ taken from docs, never verified; no UAT known | `docs/01`, register Q16 |
| Which IP ranges do PayWay callbacks originate from (for ingress allowlisting)? | ❌ glossary promises whitelisting but supplies only an RFC-5737 example | `docs/glossary.md`, register Q7.2 |
| Does sandbox/production use trusted TLS? mTLS? Which ciphers? | ❌ sandbox is self-signed (workaround required); nothing on prod TLS | `AGENTS.md` TLS caveat, register Q7/Q17 |
| Can I self-serve callback URLs / keys in a merchant portal? | ❌ "formal support ticket" vs dashboard hints, unreconciled | `docs/19`, `docs/16`, register Q31/Q36 |

### Payment acceptance
| Developer question | Status | Where |
|---|---|---|
| How do I take a web payment (hosted page, popup, signed form POST)? | ✅ | `docs/03`, `docs/10` |
| How do I generate online KHQR / offline static-dynamic KHQR? | ✅ (offline notification verification 🟡 → G7) | `docs/07`, `docs/13` |
| Native apps / WebView / Telegram Mini App? | ✅ | `docs/04`, `docs/05`, `docs/06` |
| What is the exact ABA Pay deep-link URI scheme? | ❌ `[TBD: confirm with ABA]` | `docs/08`, register Q29.3 |
| Which payment methods/currencies are supported, and how do I enable Alipay/WeChat/Google Pay on my profile? | 🟡 (method list + USD/KHR yes; enablement procedure & fees no) | `docs/03`, `docs/15` TC-021, register Q31.4 |
| How does USD↔KHR FX work (rounding, spread, who bears it)? | ❌ | G20 |
| Can I customize the hosted page (language, colors, CSS)? | 🟡 | `docs/10` (`[TBD]` items) |
| What are payment links and how do I use create/detail/void? | ✅ (void is undocumented-by-ABA but live-verified; production parity 🟡) | `docs/17`, register Q37 |

### Async lifecycle (callbacks, statuses, expiry)
| Developer question | Status | Where |
|---|---|---|
| How do I verify a callback (algorithm, header, canonicalization)? | ✅ | `docs/11`, `docs/16` |
| Do callbacks get retried if my server fails? On what schedule? | ❌ **our docs contradict each other** (G4); ABA never answered | `docs/03:804` vs `docs/18:64`/`docs/19:49`, register Q6.1 |
| What is the canonical online-checkout callback payload schema (field-by-field)? | 🟡 (examples only; KHQR offline = "be tolerant" per ABA) | `docs/11`, register Q6.3 (answered), Q18 (CoF) |
| What statuses exist and what do they mean (incl. expiry)? | 🟡 (local vocabulary excellent; gateway enum has quirks — `DECLINDED` typo, no EXPIRED/CLOSED) | `docs/README.md`, `docs/07`, register Q25/Q33 |
| Is a callback mandatory if I reconcile via Check Transaction? | ❌ conflicting acceptance material | `docs/15` TC-005/TC-013, register Q30 |
| Can I retrieve missed callbacks / delivery history from ABA? | ❌ | register Q32 |
| How long is a QR/checkout session scannable vs its `lifetime`? | 🟡 (scan window ≠ lifetime, root cause open) | `docs/07:388`, register Q26 |

### Post-payment (refunds, voids, pre-auth, settlement)
| Developer question | Status | Where |
|---|---|---|
| How do I refund (API, codes, balance preflight)? | ✅ mechanics; ❌ policy (window/partials/fees/authorization) | `docs/12`, register N2 |
| Can I void a payment link / close a QR transaction? | ✅ mechanics (incl. PTL188, no-CLOSED quirk); production parity 🟡 | `docs/17` §17.4, `docs/07`, register Q4/Q37 |
| Pre-auth: how long is the capture window? Auto-release? | ❌ | `docs/12` (codes only), register N3 |
| How do I reconcile against settlement (reports, T+n, cut-offs)? | ❌ (local journal `reconcile` only) | `docs/18`, G5 |
| How do chargebacks/disputes work? | ❌ | G5 |
| When do payouts/split beneficiaries actually receive funds? | ❌ | `docs/17` §17.5, G5 |

### Recurring / credentials-on-file
| Developer question | Status | Where |
|---|---|---|
| How do I link an account/card, charge with a token, renew/remove? | ✅ (hash orders sandbox-verified) | `docs/09`, register Q1 (resolved by evidence) |
| How do subscriptions work (initiation, frequency)? | ✅ initiation; ❌ cancel/pause/resume surface & renewal callbacks | `docs/01`, register Q2 (resolved)/Q15 |
| When exactly do tokens expire, and what error fires on expired charges? | 🟡 (`expired_at` exists; boundary + error code open) | `docs/09:295-320`, register Q3 |
| How do I get CoF/subscription enabled for my merchant profile? | ❌ (sandbox code 104; no procedure) | register Q22 |

### Errors, ops, security, go-live
| Developer question | Status | Where |
|---|---|---|
| What does error code X mean? | 🟡 (best-in-class local tables; registry self-declaredly incomplete; no official registry) | `docs/12`, register Q5/Q21/Q25 |
| Are there rate limits? What happens when I hit them? | 🟡 (working numbers; official limits, 429/Retry-After, prod penalty model open) | `docs/12`, `docs/15` TC-016, register Q5 |
| Is there idempotency support? | ❌ (no Idempotency-Key; duplicate `tran_id` semantics open) | `docs/12`, register Q9/Q10/Q27 |
| What is my PCI-DSS scope for hosted page vs popup vs WebView? | ❌ | G16 |
| How do I rotate the API key / RSA keys? Can keys be scoped/revoked? | ❌ (one-line advice; incident-specific procedure open) | `docs/16`, register Q8 |
| What is the SLA / status page / incident channel? | ❌ | G17 |
| What is the go-live checklist? | ✅ self-side (`docs/13`, `docs/15`); ❌ ABA-side certification/UAT procedure & timeline | `docs/13`, `docs/15`, register N8 |

---

## Part 3 — Consolidated questions to send to the ABA PayWay team

The canonical register is `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md`
(Q1–Q37, append-only). Everything below with a **Q** number already has a full
body + evidence there — send from that file. Items marked **N** are newly found
by this 2026-09-12 scan and are **not yet filed**; file them into the register
as Q38+ if adopted.

Resolved / no longer blocking: Q1, Q2 (resolved by live-doc evidence 2026-08-31),
Q6.3 (answered by ABA 2026-08-27). Q23 is an internal tooling question, not a
gateway question — drop it from the send list.

### Priority order (from HANDOFF §5.4, extended by this scan)

**Tier 1 — send first (unblocks integration decisions):**
1. **Q9 + Q10 + Q27** — production `tran_id` uniqueness, duplicate semantics on
   purchase/generate-qr, visibility delays → decides whether
   `retryPolicy: 'transient'` is safe as default.
2. **Q4 + Q28** — close-transaction production enforcement per channel; why no
   CLOSED status; end state when a closed transaction is paid.
3. **Q6.1 + Q6.2** — callback retry policy (attempts/backoff/dead-letter) and
   HMAC header on every redelivery. *(Also reconcile our own docs/03 vs docs/18/19
   wording once answered — G4.)*
4. **N1** — test card numbers (approved/declined/insufficient-balance), test
   ABA-Pay accounts, and how to obtain the ABA Simulator for KHQR testing.
5. **Q16** — confirm production base URL + all 22 paths; is there a UAT/
   certification environment between sandbox and live?

**Tier 2 — production contract confirmations:**
6. **Q12** — are the §16 per-endpoint hash orders frozen; change
   announcement/versioning; production parity. *(2026-09-12: the "sandbox
   `link-card` hash skipping" half is RESOLVED by evidence — controlled replays
   show the hash IS required and enforced (§24 LC-3); only the freeze/production-parity
   question remains.)*
7. **Q5** — official per-endpoint rate limits; roadmap for HTTP 429 +
   `Retry-After`; production penalty model.
8. **Q26** — what governs KHQR scan-time validity (fixed window vs `lifetime`,
   which unit); production parity.
9. **Q3** — token 90-day boundary semantics (calendar vs rolling, timezone),
   error code for expired-but-not-removed charges.
10. **Q25** — publish production-valid token-flag domains and the canonical
    transaction status enum (incl. the `DECLINDED` spelling).

**Tier 3 — sandbox enablement & provisioning (profile `ec476910`):**
11. **Q22** — enable subscription/token-flag on the sandbox profile (403 code
    104); confirm the subscription HMAC order incl. `ctid`; fix the doc + Wrong
    Hash hint.
12. **Q19 + Q13** — enable the payout-whitelist service (403 code 32) or provide
    a pre-enabled test MID; payee format for `add-whitelist-payout`;
    `complete-with-payout` provisioning; canonical `payout` placement in responses.
13. **Q24 + Q36** — restore/provision `get-transactions-by-mc-ref` (KHQR query
    domain) on sandbox; Customer Module provisioning; sandbox callback-URL
    self-service vs ticket.
14. **Q31** — whitelisting procedures: API root domains, callback root domains,
    wildcard subdomains, sandbox reactivation, evidence for
    pre-auth/POS/onboarding sign-offs, offline-KHQR callback whitelisting proof.
15. **Q8** — sandbox API-key rotation procedure (completes the committed-key
    remediation); does rotation invalidate RSA keys/webhook registration.
16. **Q7 + Q17** — publicly-trusted sandbox TLS cert (or publish the chain for
    pinning); webhook source-IP allowlist ranges; confirm `CITR_FIX` invalid for
    linking.

**Tier 4 — per-flow contract gaps:**
17. **Q18** — CoF callback payload schema; meaning of status 0; HMAC on
    redeliveries; callback on user-initiated removal without configured URL.
18. **Q35** — Customer Module callback routing (shared vs per-channel URL),
    canonicalization parity, HMAC-SHA512 confirmation.
19. **Q30** — are QR callbacks mandatory when reconciling via Check
    Transaction API; per-flow differences; where to configure/prove.
20. **Q32** — ABA-side retrieval/replay for missed callbacks; delivery history
    (attempts, codes, payloads); per-`tran_id` or window replay.
21. **Q11 + Q34** — transaction-list visibility of unpaid QR-only transactions;
    3-day window cap in production; `get-transactions-by-mc-ref` canonical
    envelope (`data` + status object vs `transactions` + numeric status).
22. **Q20 + Q21 + Q33 + Q37** — payment-link family: pushback no-hash/numeric
    status production parity + status value set; invalid-id code (PTL132 vs 96);
    lifecycle/datatype parity (`tran_id` type, EXPIRED status, `expired_date`
    minimum offset, active PTL code map); `void` endpoint production availability,
    paid-link voidability, in-flight payment behavior, PTL188 finality.
23. **Q14** — payment-link image `size: 0` defect; real server-side upload
    constraints; CDN URL stability for merchant receipts.
24. **Q29** — `payment_gate=0` routing semantics; `hosted_view` desktop support;
    exact deep-link URI scheme(s); `payment_gate` still supported on purchase.
25. **Q15** — subscription lifecycle: cancel/pause/resume (is remove-token the
    only mechanism?), renewal callbacks, `frequency` vs the 90-day token renewal,
    simulating a cycle in sandbox.

**Tier 5 — commercial/policy questions (NEW — not yet in the register):**

> These are the questions a *new* merchant asks before signing; the repo has no
> answer because ABA never published one. Propose filing as Q38+.

- **N1 — Test assets.** Publish sandbox test card numbers (approved / declined /
  insufficient-balance), test ABA-Pay accounts, and the acquisition path for the
  ABA Simulator / test app. *(Evidence: `docs/01:126-128`, `docs/12:730-732`.)*
- **N2 — Refund policy.** Time window after capture; multiple partial refunds up
  to the total; refund fees; who is authorized to trigger refunds; do partial
  refunds round to the original currency's scale (0.01 USD / 1 KHR) or KHR
  integers regardless of original currency (SANDBOX-FINDINGS §8c-4); is the
  100-KHR minimum a global floor (sub-100 KHR refund question,
  `.scratch/openapi-coverage-audit/fidelity-audit.md:163,318`)?
- **N3 — Pre-auth windows.** Capture/void window, auto-release timing,
  incremental-auth support.
- **N4 — Settlement & reconciliation.** Settlement cycle (T+n) and cut-off times;
  daily settlement reports / report-download API; statement reconciliation
  against the merchant ledger; when payout beneficiaries actually receive funds.
- **N5 — Chargebacks & disputes.** Process, evidence requirements, timelines,
  notification channel.
- **N6 — FX rules.** Automatic USD↔KHR conversion rules, rounding, who bears the
  spread; `original_*` vs `payment_*` field semantics per flow.
- **N7 — Method & feature enablement.** Procedure to activate
  Alipay/WeChat/Google Pay/UnionPay per profile; fee schedule; production
  enablement procedure for CoF/subscription token flags.
- **N8 — Go-live process.** The formal certification/UAT procedure, required
  forms/evidence, review steps (checkout UI compliance, pre-auth journey, POS
  sign-off — `docs/15` TC-022/023/026-028), and production-credential lead time.
- **N9 — PCI-DSS scope.** Which SAQ applies per integration mode (hosted page vs
  `checkout2-0.js` popup on merchant page vs card entry in merchant WebView);
  PayWay's own PCI certification level/attestation.
- **N10 — Key lifecycle.** Production API-key rotation procedure (self-service?),
  RSA key rotation, key revocation/scoping; offline-KHQR notification
  authentication contract (HMAC variant? IP allowlist? mTLS?).
- **N11 — Service levels.** SLA, uptime status page, incident communication
  channel, support hours/escalation path; merchant-portal self-service scope.
- **N12 — Checkout surface details.** Canonical online-checkout callback schema
  (field-by-field reference); hosted-session default expiry when `lifetime` is
  omitted; hosted-page language/locale parameter, background color, custom CSS
  (`docs/10` `[TBD]` items); offline-KHQR repeat-payment and long-validity policy
  (HANDOFF 2026-09-10 note).

### Maintenance notes

- **Do not** renumber or edit Q1–Q37 here — the canonical register is append-only
  (`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md`). Adopt new items as Q38+
  there, then delete the N-numbers from this file.
- Internal doc bug to fix (Q6.1 was answered **operationally** by the
  integration-team relay 2026-09-12 — see Part 4 — so the correction is now
  unblocked): the callback-retry contradiction
  (`docs/03-web-implementation.md:804` vs `docs/18-transaction-journal.md:64` and
  `docs/19-customer-module-qr.md:49`) should be reconciled to
  "no guaranteed retry + Check Transaction recovery".
- Production verification of every "sandbox-verified" claim remains gated on
  production credentials per `docs/PRODUCTION-VERIFICATION-PLAN.md`.

---

## Part 4 — 2026-09-12 integration-team responses: impact assessment

**Source:** a batch of answers relayed via the ABA PayWay integration-team
channel on 2026-09-12, covering 19 topics from Parts 1–3.

**Evidence-quality caveat (apply everywhere below):** the answers read as
doc-derived summaries from the integration team — no document IDs or reference
links are attached (except the simulator app links), and several are phrased as
"safe assumption" guidance rather than contract. Treat them as **actionable
design guidance, not written confirmation**: mark register items resolved
*operationally*, but keep production-parity items open in the canonical register
until confirmed in writing.

### 4.1 Question-by-question mapping

| Response received | Resolves / affects | Verdict |
|---|---|---|
| **Callback retry policy** (two replies): treat callbacks as single best-effort delivery; no guaranteed retry on down/non-200/timeout (~5 s window); recovery = Check Transaction; one reply notes an *observed* single retry ~10 s apart in some flows, explicitly not to be relied on | Q6.1, Q6.2, G4 | **Q6.1 answered operationally** (design guidance; no citable doc reference provided — the original ask). **Q6.2 mooted** (no guaranteed redeliveries → HMAC-on-redelivery is a non-issue). G4 resolved → unblocks the docs/03-vs-18/19 wording fix. |
| **Offline-KHQR notification contract**: no signature/HMAC scheme for the offline-KHQR callback — integrity = HTTPS + dedupe on `transaction_id` + `merchant_ref` reconciliation + transaction inquiry as source of truth; ABA provisions/whitelists the callback URL on the profile; repeat payments explicitly supported during the QR's validity, but "payable multiple times ≠ payable forever"; creation/expiry follows the KHQR (Bakong) spec incl. creation/expiry timestamps | G7, Q31.6, HANDOFF offline-KHQR note, adjacent Q6.3/Q26 | **G7 answered** on all three sub-points. Q31.6 partially (whitelisting confirmed ABA-side; *evidence that it was done* still undefined). Consistent with Q6.3's "be tolerant" answer. Gives Q26 context (offline QR *embeds* expiry via Bakong timestamps — unlike the purchase-API KHQR payload, which embeds none). |
| **Onboarding lifecycle (sandbox + production)**: request → credential email + portal activation → domain whitelisting by team → integration/testing → UI/flow review by Integration Team → production merchant application (legal docs, settlement account, agreements) → production credentials → config switch to `https://checkout.payway.com.kh` → low-value live verification transactions per enabled method with evidence → final go-live confirmation | N8, G18, Q16.1 (implicit), Q16.2 | **N8 answered** (full process; **no lead times given**). G18 largely answered. Q16.1 implicitly confirmed (production base URL named in prose — keep formally open). Q16.2 still open (only a passing "sandbox/UAT" phrase; no separate environment described). |
| **Test cards + ABA Simulator**: sandbox-only cards — SUCCESS: MC `5156 8399 3770 6777` (01/30, 993, no 3DS), Visa `4286 0900 0000 0206` (04/30, 777, 3DS yes); DECLINED: MC `5156 8302 7256 1029` (04/30, 777, 3DS yes), Visa `4156 8399 3770 6777` (01/30, 993, no 3DS); cards may rotate — request updates from the team; Simulator via Integration Team (tester name/mobile/email → provisioned accounts, PIN `1234`, secret word `TEST1`); iOS TestFlight `testflight.apple.com/join/HNyq7UCm`, Android APK via Google Drive; simulator works only against sandbox | N1, G2 | **N1/G2 fully answered** — the `[TBD: Obtain from ABA]` placeholders in `docs/01:126-128` and `docs/12:730-732` can now be filled (with the rotation caveat). |
| **TLS**: merchant-side callback URLs must be HTTPS with a CA-trusted cert (self-signed explicitly unacceptable on merchant side); the responders' docs nowhere mention PayWay environments using self-signed certs or needing client workarounds; mTLS / TLS versions / cipher suites unspecified — "check with Integration Team / infra owners" | Q7.1, Q17 (partial G16) | **NOT resolved — and contradicts observed reality**: our sandbox *does* present a self-signed chain (the `NODE_TLS_REJECT_UNAUTHORIZED` workaround in AGENTS.md). Re-raise Q7.1/Q17 with the observed chain. mTLS/ciphers remain open. |
| **Portal self-service**: integration portal `payway.ababank.com` Settings → Push Back Notification URL is self-editable on (test/integration) profiles, then inform the team to verify logs; sandbox profiles without portal access → team configures; production self-registered merchants → team does NOT update production callback URLs, use per-transaction `return_url`; Customer Module static callback always via team; keys are team-issued, **no self-service key generation/rotation described** | G18, Q31.3, Q36.2, Q8 | **G18 answered**; Q31.3/Q36.2 largely answered. **Q8 NOT answered** (no rotation procedure — still needed for the committed-key incident). |
| **Deep-link URI scheme**: `abamobilebank://ababank.com?type=payway&qrcode=<QR_STRING>` — use the `abapay_deeplink` response string as-is, no `intent://` wrapping | Q29.3, G9 | **Q29.3/G9 answered** — `docs/08` `[TBD]` can be filled. Q29.1/29.2/29.4 (`payment_gate=0` routing, `hosted_view` desktop, `payment_gate` on purchase) untouched. |
| **Payment methods & enablement**: ABA PAY, KHQR, cards (Visa, Mastercard, UnionPay, JCB, UPI — channel-dependent), Alipay, WeChat Pay; Alipay/WeChat need separate approval via **paywaysales@ababank.com** (fully registered business); merchant then enables methods in plugin/admin config; **Google Pay online "not available at the time of the guidance"** — no activation flow documented; per-method currency matrix and fees still to confirm with Sales | N7, Q31.4 (partial) | **N7 mostly answered** (procedure + contact + method list). Two follow-ups: per-method currency/fee matrix open; **Google Pay answer conflicts with our docs/SDK** (`google_pay` option, `--google-pay-token`) — verify before advertising. |
| **FX**: request amounts must be in the merchant settlement currency; merchant-side conversion is the merchant's responsibility (rounding/spread/margin unspecified by design); `/exchange-rate` returns ABA board rates; single-currency merchant → any FX cost borne by the *customer* at their bank; dual-currency merchant → customer picks currency, settlement to the matching account, no FX on merchant side | N6, G20 | **N6/G20 substantively answered** (who bears FX + where conversion happens). Remaining: refund rounding scale + the sub-100-KHR refund floor (N2 sub-items) — untouched. |
| **Hosted-page customization**: possible — certain labels (e.g. "Continue Shopping") via portal/team, logo/branding/theme set server-side on the profile by the team, displayed methods per profile; NOT possible — custom CSS/JS injection, editing `checkout2-0.js`/hosted HTML; full custom UI requires the API-based approach | G19, docs/10 TBDs | **G19 answered** (docs/10's `[TBD]` items on background color/CSS are now "not supported"; labels/branding via team). The API `language` parameter itself remains unconfirmed. |
| **Checkout session timeouts**: per-method session windows — abapay_khqr 5 min, abapay_khqr_deeplink 3 min, cards 3 min, alipay 3 min, wechat 3 min; QR image itself may expire ~2 min while the transaction is open; `lifetime` defaults long (~30 days) if omitted in some QR APIs; default KHQR checkout QR expiry 5 min (global, not per-merchant); KHQR described as one-time-use 24 h in another context | N12 (session-expiry sub-item), Q26/G10 (partial) | **Session-expiry question answered with concrete numbers.** Q26 partially: the two-clocks model (scan/session window vs transaction TTL) is confirmed and consistent with our 2h15m-refusal evidence, but the exact governing rule for *purchase-API* KHQR scan validity (fixed window vs `lifetime`, unit) is still not stated. |
| **Status enum**: `payment_status_code` mapping — 0 APPROVED, 2 PENDING (may persist **up to ~24 h**), 3 DECLINED, 4 REFUNDED, 7 CANCELLED (pre-auth); `DECLINDED` typo acknowledged; EXPIRED/CLOSED confirmed as business-side interpretations only (gateway leaves long-PENDING; merchants implement own expiry) | Q25.3, G13 (partial) | **Q25.3 answered** and consistent with our sandbox findings (no EXPIRED/CLOSED anywhere; PENDING-for-~24 h matches W5-1). Q25.1/25.2 (token-flag enum domains) untouched. |
| **Callback mandatory?**: Check Transaction API is **mandatory**; callback URL recommended but **not strictly mandatory if polling is robust and reviewed**; polling-only pattern explicitly allowed (poll only pending txns, ~3–5 s interval within a 5–15 min lifetime, stop at final status/lifetime, keep logs; Integration Team reviews the polling implementation pre-go-live) | Q30, TC-005/TC-013 conflict | **Q30 answered** — resolves the conflicting acceptance material in `docs/15`. |
| **Missed callback retrieval**: no merchant-facing API or portal feature for callback delivery history/replay; recover via Check Transaction / `get-transactions-by-mc-ref`; the Integration Team can inspect pushback logs on request (provide `tran_id` + timestamps) | Q32 | **Q32 answered (negative)** — no API; manual log inspection is the channel. |
| **Pre-auth window**: default hold up to **30 days** from pre-auth (per-merchant configurable — confirm for the profile); complete (full/partial ≤ original) or cancel within the window; after the window the hold auto-cancels/auto-reverses; **no webhook for auto-release** — rely on Check Transaction | N3 | **N3 answered.** |
| **Settlement & reconciliation**: T+N is **merchant-specific** (observed T+3/5/7 up to 15 working days) — the signed agreement/bank config is the source of truth, not a universal SLA; reconcile by exporting portal transactions for day T (orderID, APV, amount, time) and joining to bank settlement reports (weekends/holidays shift S; observed afternoon run 13:00–17:00, not universal); fees appear as separate debits; mismatch flow = tran_id + bank evidence to the Integration/Settlement team | N4, G5 (settlement half) | **N4 substantively answered** (cycle, process, mismatch flow). No report-*download API* was mentioned — portal export + bank statements is the documented path. |
| **Chargebacks/disputes**: card-only (Visa/Mastercard/UnionPay/JCB); ABA PAY, KHQR, WeChat Pay are final/irrevocable — no chargebacks; flow = email notice with reason code/deadline → merchant accepts or disputes → evidence submission → representment via the scheme → outcome; monitor the registered email (silence = acceptance); ABA may hold/deduct during investigation | N5, G5 (disputes half) | **N5 answered.** |
| **Payout timing**: split/payout settles to beneficiaries **immediately at completion** (checkout approval or pre-auth complete-with-payout); Direct Payout API v2 debits source and credits all beneficiaries in the same operation (subject to liquidity/daily limits); production requires beneficiary whitelisting + payout service enabled on the MID; **once processed via payout/split, the standard refund API is NOT available** — refunds are manual or pre-auth refund before split | N4 (payout-timing sub-item), adjacent Q19 | **Payout timing answered** + one **new adjacent constraint** (no standard refund after split) that affects `docs/17` §17.5 and the refund docs. Confirms Q19's premise (payout service must be enabled per MID) but does not unblock the sandbox profile. |
| **CoF/subscription enablement**: request via PayWay Sales/Integration per environment → maintenance/change form (signatures/stamp) → sales/risk/integration review → enable on **sandbox first** → test with evidence → production enablement | Q22 (production-procedure half), N7 | **Enablement *procedure* answered.** Q22's sandbox-specific asks remain: actually enabling profile `ec476910` (code 104), confirming the subscription HMAC order incl. `ctid`, and fixing the doc + Wrong Hash hint. |

### 4.2 Newly learned adjacent facts (not asked — record anyway)

1. Production credentials may be issued with **temporary expirations**, removed
   once go-live verification completes.
2. Post-go-live there is a short **VIP support window**; afterwards, issues go
   through standard **Digital Support** channels (partial N11 — no SLA/status
   page named).
3. PENDING can persist **up to ~24 h** before the gateway settles the final
   state (matches our 1440-min KHQR observation).
4. A **single callback retry ~10 s apart** has been observed in some flows —
   explicitly not guaranteed and not to be designed for.
5. Card brands include **UnionPay, JCB, UPI** (channel-dependent) — broader than
   our docs' current list.
6. **ABA Merchant App** for live merchants: App Store
   `apps.apple.com/kh/app/aba-merchant/id1559488956`, Play
   `play.google.com/store/apps/details?id=com.ababank.payway`.
7. Offline-KHQR QRs encode creation/expiry via **Bakong additional-data
   timestamps** — offline QRs embed expiry, purchase-API KHQR payloads do not
   (sharpens Q26's contrast).
8. **No standard refund after payout/split** — refunds must be manual or done
   via pre-auth refund before the split (new constraint for refund guidance).

### 4.3 Discrepancies to raise back with ABA

1. **Sandbox TLS**: the response claims no PayWay environment uses self-signed
   certs; our sandbox demonstrably presents a self-signed chain. Re-ask
   Q7.1/Q17 with the observed chain attached.
2. **Google Pay**: our docs/SDK expose `google_pay` / `--google-pay-token`; the
   response says online Google Pay was "not available at the time of the
   guidance". Verify current availability before advertising it to merchants.
3. **No-retry guarantee**: the guidance came without a citable document. Request
   the specific guideline/reference that states the single-delivery contract
   (this was the explicit ask in the original question).
4. **Pushback vs callback schema**: the returned minimal schema
   (`{tran_id, apv, status, return_params}`, HTML-wrapped variants) describes
   the *return/pushback* contract; our HMAC-signed server-to-server callback
   (`docs/11`, `X-PAYWAY-HMAC-SHA512` + payer fields) is a separate contract.
   Confirm both remain as-is (feeds Q18/Q35, still open).

### 4.4 Register status after these answers

- **Resolved operationally** (mark in the canonical register's answer log as
  "resolved by integration-team relay 2026-09-12 — written confirmation
  pending"): **Q6.1** (no-retry guidance), **Q6.2** (mooted), **Q25.3**,
  **Q29.3**, **Q30**, **Q32**, **N1**, **N3**, **N4**, **N5**, **N6**, **N7**,
  **N8**; gap-register **G2, G4, G5, G7, G9, G18, G19, G20**.
- **Partially**: **Q26** (two-clocks model + session numbers; governing rule
  open), **Q16.1** (URL named in prose), **Q16.2**, **Q31**, **N2** (only the
  no-refund-after-split constraint; window/partials/fees/rounding still open),
  **N10** (no self-service keys; temp-expiry fact), **N11** (channels named, no
  SLA), **N12** (pushback schema + session timeouts; `language` param open).
- **Untouched — still to send** (Tier 1 of Part 3 stands): Q3, Q4, Q5, Q7, Q8,
  Q9, Q10, Q11, Q12, Q13, Q14, Q15, Q18, Q19, Q20, Q21, Q24, Q27, Q28, Q33,
  Q34, Q35, Q36, Q37; Q29.1/29.2/29.4; Q25.1/25.2; N9 (PCI scope); N2
  remainder.

### 4.5 Repo propagation — DONE 2026-09-12 (same day, user-directed)

All items below were implemented: docs/01+12 test cards, docs/03+11 retry
wording, docs/08 deep-link scheme, docs/10 customization, docs/07 confirmed
timing/offline-KHQR facts, docs/02 test cards + simulator + onboarding
lifecycle, docs/15 TC-013/021 + new TC-035/036/037, docs/17 §17.5 payout
bullets, new `docs/20-settlement-and-disputes.md`, docs/README index; SDK/CLI:
`sandbox-test-cards` module + CLI command + package exports, `buildAbaPayDeeplink()`,
`PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`, `PAYMENT_STATUS_CODES` confirmation note,
`google_pay` advisory on `PAYMENT_OPTIONS`; canonical register relay-batch
addendum; AGENTS.md/HANDOFF.md; affected skills mirrored to `.zcode/skills/`.
Original checklist kept below for reference.

### 4.5 Recommended repo-doc updates (follow-up wave, user-gated)

1. `docs/01:126-128` + `docs/12:730-732` — fill the test-card tables from §4.1
   (sandbox-only + rotation caveat).
2. `docs/03:804` — replace "PayWay retries the callback" with the no-guaranteed-
   retry contract + Check Transaction recovery (aligns with docs/18 and docs/19).
3. `docs/08` — replace the deep-link `[TBD]` with the verified scheme.
4. `docs/10` — resolve the customization TBDs (labels/branding via team; no
   custom CSS/JS).
5. `docs/02` — add the onboarding lifecycle (§4.1) and the simulator acquisition
   path (accounts, PIN/secret word, TestFlight/APK links).
6. New settlement/reconciliation + chargebacks content (extend `docs/15` or a
   new chapter), including the no-refund-after-payout-split constraint.
7. Canonical register (`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md`) —
   fold §4.4 statuses into the answer log and file the genuinely new items
   (session-timeout table, production-key temp expiry, no-refund-after-split,
   Google Pay availability) as Q38+; also file N1–N12 adoptees there.

## Part 5 — 2026-09-15 AOF live-cycle addendum: new gaps + relay items

**Source:** the full Account-on-File live test cycle executed on sandbox `ec476910`
(account leg enabled by ABA the same day). Evidence: `docs/SANDBOX-FINDINGS.md`
§26 AOF-1..AOF-14; canonical register:
`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` (Q18 status update + Q41–Q43).

**Answered by this cycle (no ABA reply needed):**

- **CoF link-callback payload contract (Q18.1)** — captured live: `application/json`
  with `x-payway-topic: PaymentNotification`, body
  `{request_id, payment_credential:{ctid, pwt, source_of_fund, type, status(=1),
  expired_at, token_flag, frequency, subscribed_amount, amount_limit_per_tran,
  currency}}`. Only `request_id` is top-level; `status` is the credential status,
  not a transaction status.
- **Customer-initiated unlink behavior (Q18.2/18.4)** — removing the account in ABA
  Mobile kills charging (`105`) but delivers **no callback** to the request-level
  `callback_url`, and `get-token-details` keeps reporting `status: 1` (active).
  Merchant detection is charge-time only. Q18.6 now asks whether ANY removal
  notification channel exists and whether details should reflect removal.
- **Charge flag semantics** — charge-time `token_flag` is a request classification,
  not a copy of the link-time flag (`CITU_FLEX` charges fine on a CITI_FLEX-linked
  token); MIT flags reject with `105` (→ Q41 enablement ask).
- **Link QR window** — `expire_in` is an absolute epoch expiry instant = creation +
  ~90 s, not the documented 10 minutes (→ Q42 confirmation ask).
- **pwt stability** — re-linking the same ctid+account+flag after any removal
  returns the IDENTICAL pwt; treat (ctid, pwt) as idempotent.

**Still open for the team (newly filed):**

- **Q18.5** — the CoF callback's `x-payway-hmac-sha512` plaintext/canonicalization
  (our sorted-key scheme does not verify it; 19 offline candidates failed). Until
  answered, verify link deliveries via `get-token-details(request_id)` transitive
  auth rather than the callback signature.
- **Q41** — enable merchant-initiated tokenization (MIT flags) on the sandbox
  profile, or document the dependency.
- **Q42** — confirm `expire_in` = epoch-of-expiry and the intended QR window.
- **Q43** — card-leg enablement: hosted `link-card` still answers `104` on this
  profile; card tokenization cycles remain un-testable end-to-end.

**Merchant-facing codification already shipped:** docs/09 (link/unlink/renew
lifecycle) now carries the live callback shape, the transitive-auth recovery path,
the charge-time-only unlink detection rule, and the status-only charge response
with tran_id-based reconciliation. Skills (`aba-payway-cof`, `aba-payway-link-account`)
and the packaged knowledge corpus are synced to the same content.
