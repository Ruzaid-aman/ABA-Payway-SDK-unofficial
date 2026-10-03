# Telegram answer capture — ABA PayWay questionnaire

**Run date:** 2026-10-03, 05:14–06:07 chat clock · **Protocol:** ../QUESTIONNAIRE.md §5–§6 · **Raw replies:** raw/batch-NN-*.json (verbatim, one file per batch)

**Summary at end of run:** asked 43/43 · bot replied 43/43 (multi-message bursts; some answers split into 2–3 parts) · all sections below carry extracted facts, confidence, and proposed append-only register updates — every register item now has a documented answer, a doc-derived partial, or an explicit negative with a named human-channel owner

## Status board

| ID | P | Register | Asked | Answered | Notes |
|---|---|---|---|---|---|
| T-00 | P0 | — | ✅ | ✅ | captured |
| T-01 | P0 | Q9.1, Q27; skills-audit Q-F | ✅ | ✅ | captured |
| T-02 | P0 | Q10 | ✅ | ✅ | captured |
| T-03 | P0 | Q9.2–3 | ✅ | ✅ | captured |
| T-04 | P0 | Q4, Q28; skills-audit Q-G | ✅ | ✅ | captured |
| T-05 | P0 | Q26; skills-audit Q-E | ✅ | ✅ | captured |
| T-06 | P0 | Q6.1, Q40 | ✅ | ✅ | captured |
| T-07 | P0 | Q46 | ✅ | ✅ | captured |
| T-08 | P0 | Q18.5 | ✅ | ✅ | captured |
| T-09 | P0 | Q18.6 | ✅ | ✅ | captured |
| T-10 | P0 | Q22.1, Q41, Q43, Q19.1, Q24.1–2 | ✅ | ✅ | captured |
| T-11 | P0 | Q22.2–3, Q12, Q42 | ✅ | ✅ | captured |
| T-12 | P0 | Q16 | ✅ | ✅ | captured |
| T-13 | P1 | Q3 | ✅ | ✅ | captured |
| T-14 | P1 | Q25.1–2, Q7.3 | ✅ | ✅ | captured |
| T-15 | P1 | Q5, Q47 partial; skills-audit Q-D | ✅ | ✅ | captured |
| T-16 | P1 | Q11 | ✅ | ✅ | captured |
| T-17 | P1 | Q34, Q24.3 | ✅ | ✅ | captured |
| T-18 | P1 | Q47 | ✅ | ✅ | captured |
| T-19 | P1 | Q20, Q21 | ✅ | ✅ | captured |
| T-20 | P1 | Q33 | ✅ | ✅ | captured |
| T-21 | P1 | Q37 | ✅ | ✅ | captured |
| T-22 | P1 | Q14 | ✅ | ✅ | captured |
| T-23 | P1 | Q15 | ✅ | ✅ | captured |
| T-24 | P1 | Q29.1–2, Q29.4 | ✅ | ✅ | captured |
| T-25 | P1 | Q48, N2 KHR-floor, N6 remainder | ✅ | ✅ | captured |
| T-26 | P1 | N2 remainder | ✅ | ✅ | captured |
| T-27 | P1 | Q13, Q19.2, Q54 | ✅ | ✅ | captured |
| T-28 | P1 | Q53, N3 remainder | ✅ | ✅ | captured |
| T-29 | P1 | N9, N11 | ✅ | ✅ | captured |
| T-30 | P1 | N12 remainder | ✅ | ✅ | captured |
| T-31 | P1 | Q7.1–2, Q17, Q39, Q49.3 | ✅ | ✅ | captured |
| T-32 | P1 | Q8, Q49.2, N10 remainder | ✅ | ✅ | captured |
| T-33 | P1 | Q31 remainder | ✅ | ✅ | captured |
| T-34 | P1 | Q35, Q36 | ✅ | ✅ | captured |
| T-35 | P1 | Q38, N7 remainder | ✅ | ✅ | captured |
| T-36 | P2 | Q52 | ✅ | ✅ | captured |
| T-37 | P2 | Q51 | ✅ | ✅ | captured |
| T-38 | P2 | Q44 | ✅ | ✅ | captured |
| T-39 | P2 | Q45, N4 remainder | ✅ | ✅ | captured |
| T-40 | P2 | Q50 remainder | ✅ | ✅ | captured |
| T-41 | P2 | Q56 remainder | ✅ | ✅ | captured |
| T-42 | P2 | Q55 | ✅ | ✅ | captured |

## Per-question capture

### T-00 — Context primer (register none)
- Asked at: 2026-10-03 05:14 (chat clock)
- Raw reply: answers/raw/batch-01-primer.json
- Extracted facts:
  1. Bot acknowledged and is ready for the numbered questions.
  2. It will answer based ONLY on documented PayWay behavior, citing public doc URLs (developer.payway.com.kh) where possible.
  3. Items not covered in available docs will be explicitly flagged as needing Integration Team confirmation.
- Confidence: high — direct acknowledgement of the primer
- Proposed register update: none (primer — no register item)

### T-01 — Purchase API: duplicate tran_id (register Q9.1, Q27; skills-audit Q-F)
- Asked at: 2026-10-03 05:16 (chat clock)
- Raw reply: answers/raw/batch-02-T01-T03.json
- Extracted facts:
  1. Docs expect a UNIQUE tran_id per payment initiation; reuse of an existing tran_id is described as rejected with a duplicate-transaction type error ('Duplicate Transaction' / 'Duplicate Transaction ID').
  2. No exact numeric production error code is documented (bot could not confirm code 4).
  3. Docs do not explain why sandbox returns code 00 while producing an unpayable QR — considered invalid usage; treat tran_id as unique and never rely on sandbox permissiveness.
  4. Lost-response recovery (documented pattern): call check-transaction with the SAME tran_id; if completed treat as final; if not found/unpaid start a NEW payment with a NEW tran_id. Do NOT rely on purchase being idempotent on the same tran_id.
  5. ABA Pay mobile may show 'Code already use' or 'Transaction not found' when the same TRANSACTION_ID is submitted twice.
- Confidence: medium-high — doc-derived rules; exact production error code explicitly unconfirmed
- Proposed register update: Q9.1/Q27: production rejects duplicate tran_id (duplicate-transaction error, exact code open); documented retry policy = check-transaction-then-new-tran_id. Numeric code + sandbox-accepts-but-unpayable root cause remain open.

### T-02 — generate-qr: duplicate tran_id + lifetime bounds (register Q10)
- Asked at: 2026-10-03 05:16 (chat clock)
- Raw reply: answers/raw/batch-02-T01-T03.json
- Extracted facts:
  1. Only explicit reuse statement in docs: QR-on-invoice regeneration for the same tran_id 'may update the existing transaction (amount/expiry)' and should be supported by the API — a single logical transaction per tran_id that may be UPDATED, not multiple independent QRs.
  2. Docs do NOT specify production behavior for duplicate tran_id on generate-qr (reject vs overwrite vs concurrent QRs) nor an error code — needs Integration Team confirmation.
  3. lifetime unit: MINUTES; omitting it defaults to a long validity (observed ~30 days) for QR-on-API / QR-on-invoice.
  4. 3-minute default lifetime is documented as enforced as the minimum and cannot be set below that.
  5. No documented maximum lifetime; the '120 days' cap could not be confirmed from docs for either environment.
- Confidence: medium — partial — doc-derived minimum confirmed; duplicate behavior and max bound left open
- Proposed register update: Q10.1/10.2 remain open (Integration Team); Q10.3 partial: 3-min minimum enforced, max unconfirmed. NEW: lifetime unit = minutes per the bot's docs reading (conflicts with our sandbox 180-second QR rejection reading — verify before codifying).

### T-03 — Query APIs: visibility delay (register Q9.2–3)
- Asked at: 2026-10-03 05:16 (chat clock)
- Raw reply: answers/raw/batch-02-T01-T03.json
- Extracted facts:
  1. No documented SLA in seconds for visibility on either endpoint; assume small propagation delay and rely on retries, not fixed timing.
  2. Architectural distinction: check-transaction = short-term cache with an effective 7-day retention window; get-transaction-details = persistent store for older transactions / long-term reconciliation.
  3. No documented guarantee that check-transaction sees a transaction earlier than get-transaction-details; no documented time skew.
  4. Documented poller guidance: wait ~3 seconds after initiating, call check-transaction every 3–5 seconds until Approved or lifetime expiry; use get-transaction-details for older transactions / reconciliation beyond the 7-day window.
  5. Our observed '<1s vs ~5s' should be treated as an implementation detail, not a production contract.
- Confidence: medium — guidance is doc-derived and actionable, but explicitly no hard SLA
- Proposed register update: Q9.2/Q9.3: answered operationally (docs-derived) — no guaranteed delay; documented poll pattern 3s wait + 3–5s interval; NEW fact: check-transaction 7-day retention window (aligns with Q47.4).

### T-04 — Close Transaction: production contract (register Q4, Q28; skills-audit Q-G)
- Asked at: 2026-10-03 05:19 (chat clock)
- Raw reply: answers/raw/batch-03-T04-T06.json
- Extracted facts:
  1. Documented intent: Close Transaction cancels the transaction and prevents further payer-side payment attempts; use only on incomplete/pending transactions; closing may trigger reversal/refund if already settled.
  2. No separate documented rule for hosted-card vs KHQR; production behavior for the exact card-pays-after-close sandbox scenario is NOT documented (our observation 'not described as expected behavior').
  3. DOC CLAIM: after close, Check Transaction is expected to show CANCELLED (or equivalent) plus an intermediate pending-closed state — always re-check via Check Transaction, never rely on the Close response alone.
  4. If a closed transaction is paid anyway: backend reversal/refund; merchant observes standard statuses APPROVED → REFUNDED or CANCELLED; funds-back timing per normal card refund rules (a few business days).
  5. Docs say ONLY successfully created transactions can be closed; a non-existent tran_id should return a 'Transaction not found'-type error — sandbox code 00 for never-existing IDs is NOT documented as intentional idempotency.
  6. Re-closing an already-closed transaction: response unspecified (no idempotent-00 vs dedicated-code rule) — call Close once, then use Check Transaction; escalate to Integration Team if special handling needed.
- Confidence: medium — doc-derived and detailed, but the CANCELLED-status claim CONTRADICTS our sandbox evidence (no CLOSED status in any read API, W4-1) — treat status-visibility claim as doc-claim needing verification
- Proposed register update: Q4: doc-claims captured (CANCELLED + pending-closed intermediate + auto-reversal) — conflicts with SANDBOX-FINDINGS (no CLOSED status anywhere); needs live reconciliation before codifying. Q28: docs agree with our expectation (not-found error, not code 00) — production parity still unconfirmed.

### T-05 — Purchase KHQR: scan validity window (register Q26; skills-audit Q-E)
- Asked at: 2026-10-03 05:20 (chat clock)
- Raw reply: answers/raw/batch-03-T04-T06.json
- Extracted facts:
  1. Two-clocks model with DOCUMENTED numbers: ABA KHQR for website (web QR) timeout = 5 minutes; ABA KHQR deeplink timeout = 10 minutes — enforced gateway-side; after the window the KHQR is treated as expired even if the transaction lifetime is longer.
  2. lifetime is documented in MINUTES and controls how long the transaction remains valid/back-end-open; QR images may expire even earlier (~2 minutes mentioned as an example).
  3. Purchase-API KHQR scan validity is governed by the product KHQR timeout (5 min web / 10 min deeplink), NOT by the lifetime; a 1440-minute lifetime does NOT extend scanability — consistent with our 2h15m refusal observation.
  4. No per-merchant/per-profile overrides documented; timeouts are product-level (KHQR web/deeplink).
  5. Merchants should design short-lived QR checkout UX: countdown timer, scan-immediately instruction, regenerate a NEW transaction/QR after expiry.
  6. For truly long-lived QRs use QR-on-invoice / QR-on-API products (documented long validity, up to ~30 days).
  7. Same values apply in production (no separate sandbox vs production documented); longer sandbox behavior = environment quirk, not contract.
- Confidence: medium-high — specific documented numbers consistent with both our sandbox evidence and the 2026-09-12 relay (abapay_khqr 5 min session); the 10-min deeplink number is new
- Proposed register update: Q26: substantially answered — scan validity = product-level KHQR timeout (web 5 min / deeplink 10 min), independent of lifetime; codify two-clocks guidance + regenerate-after-expiry; live-verify the deeplink 10-min number when possible.

### T-06 — Callbacks: retry contract + citable doc (register Q6.1, Q40)
- Asked at: 2026-10-03 05:20 (chat clock)
- Raw reply: answers/raw/batch-03-T04-T06.json
- Extracted facts:
  1. The single-delivery behavior IS described in the callback/pushback integration rules (callback delivery policy + pushback reliability sections), but is NOT packaged as a named public document with URL/version — bot cannot quote one (Q40 answered NEGATIVE).
  2. Documented contract: pushback is unreliable / at-most-once; on timeout or non-2xx the merchant must recover via Check Transaction.
  3. One rule: Integration Team attempts a single push and does NOT retry if the endpoint times out or is unreachable.
  4. Another rule: some gateways/flows may perform a very limited retry — observed 1 extra attempt after ~10 seconds (total window ~15–20 seconds) — explicitly not guaranteed and must not be relied on.
  5. Check Transaction (or check-transaction-2) is the officially recommended recovery; recommended pattern = short retry window (3–5 attempts with delays); Check Transaction is the authoritative source of truth vs delayed/missing callbacks.
- Confidence: medium-high — matches our 2026-09-12 relay exactly (single best-effort, ~10s observed one-off retry); the no-citable-doc answer is itself the Q40 answer
- Proposed register update: Q6.1 confirmed again operationally; Q40 → answered NEGATIVE (no citable public document exists; the contract lives in unspecified 'callback/pushback integration rules').

### T-07 — Callbacks: signature, ACK and sample vectors per service (register Q46)
- Asked at: 2026-10-03 05:21 (chat clock)
- Raw reply: answers/raw/batch-04-T07-T09.json
- Extracted facts:
  1. Customer Module (Customer Dedicated KHQR) is the ONLY callback whose HMAC is fully specified in docs: header X-PAYWAY-HMAC-SHA512, HMAC-SHA512 Base64, plaintext = the RAW HTTP request body (no re-serialization, no field reordering, no whitespace change).
  2. Customer Module FAQ (strong wording): recompute hash from shared secret + raw body; 'Do not process any callback that fails hash validation; log and discard it immediately' (MITM / fake-notification spoofing risk).
  3. Generic PayWay callbacks (online checkout, online QR, payment-link, CoF, offline KHQR): documented as 'should be verifiable (signed or contain an HMAC/signature)' but NO per-product canonical string is defined in the bot's docs.
  4. ACK pattern 1 (specific-ack callback endpoints, e.g. /v1/paywayservice/callback): return HTTP 2xx AND echo the expected acknowledgement body exactly (example: RECEIVEOK); a 403/error = failed delivery, notification not re-sent.
  5. ACK pattern 2 (generic pushback): respond quickly with HTTP 200 OK; short optional body (e.g. 'SUCCESS'); 202 is NOT documented as accepted — do not rely on it.
  6. Timeout: ~5 seconds; Customer Module FAQ explicit: no HTTP 200 within 5 seconds = callback failed and will NOT be re-sent.
  7. Official sample payloads: (a) Customer Module signed callback incl. nested customer object {type, customer_id, customer_name, vat_tin, email, phone, address, remark} plus payment_status_code, transaction_id, apv, original_amount/currency, payment_amount/currency, payment_type, transaction_date, bank_ref, payer_account, payer_name, bank_name, merchant_ref; (b) generic pushback {tran_id, apv, status}; (c) offline KHQR: dedupe on transaction_id, reconcile merchant_ref.
  8. No official samples with nulls/booleans/Unicode — construct local variants for parser tests; ALWAYS compute/verify the HMAC over the exact raw body.
- Confidence: medium-high — detailed doc-derived answer; the raw-body Customer-Module canonicalization is TESTABLE against our 2026-08-18 capture and partially contradicts our sorted-key assumption (Q35.2)
- Proposed register update: Q46: partially answered — Customer Module = raw-body HMAC-SHA512/Base64 + 200-within-5s + reject-on-fail; generic per-product canonical strings and 202-acceptance still undocumented. Verify raw-body claim against the captured Customer Module callback; feeds Q35.2.

### T-08 — CoF token callback: HMAC canonicalization (register Q18.5)
- Asked at: 2026-10-03 05:21 (chat clock)
- Raw reply: answers/raw/batch-04-T07-T09.json
- Extracted facts:
  1. Docs available to the bot define NO canonicalization or field order for the CoF token notification callback (x-payway-topic: PaymentNotification) — not raw-body, not sorted-keys, nothing.
  2. General rules only: HMAC-SHA512, Base64, shared secret, header X-PAYWAY-HMAC-SHA512; no product-specific spec confirms it reuses the Customer Module raw-body rules.
  3. Bot explicitly defers to Integration Team / gateway configuration for the exact canonicalization.
  4. Our mitigation (treat callback as untrusted hint; authenticate via get-token-details with request_id) is confirmed as consistent with documented guidance.
- Confidence: high (as a negative answer) — clear doc-derived 'not documented' — consistent with our 19 failed offline orderings
- Proposed register update: Q18.5 remains OPEN (Integration Team only). No change to our transitive-auth approach; record bot's negative as corroboration.

### T-09 — CoF: customer-initiated removal notification (register Q18.6)
- Asked at: 2026-10-03 05:21 (chat clock)
- Raw reply: answers/raw/batch-04-T07-T09.json
- Extracted facts:
  1. DOC CLAIM: removal/freeze/unfreeze/renew status changes CAN send real-time callbacks, using the same payment_credential structure as link/renew callbacks.
  2. KEY NUANCE: the callback goes to the callback_url configured under Merchant Portal → Outlet Profile → Services → Credential on File (CoF) — a PROFILE-LEVEL static URL shared by link/renew AND status-change callbacks — NOT necessarily the per-request callback_url.
  3. This may explain our AOF-14 zero-capture: our receiver watched the per-request callback_url, while removal notifications (if implemented) would target the portal-configured profile CoF URL.
  4. DOC CLAIM: get-token-details defines status = 0 removed / 1 active / 2 frozen; after successful removal it should return status 0 — contradicts our live AOF-14 observation (status stayed 1 for removed tokens).
  5. Recommended pattern: CoF callback primary; get-token-details as fallback/periodic reconciliation.
- Confidence: medium — detailed doc-derived claims but they DIRECTLY CONTRADICT live AOF-14 evidence; the profile-level-URL nuance is a testable methodology correction
- Proposed register update: Q18.6: doc-claims captured — re-test with a receiver on the PORTAL-configured CoF callback URL before treating AOF-14 as final for removal callbacks; status-map claim (0/1/2) also needs live re-verification.

### T-10 — Sandbox ec476910: enablement batch (register Q22.1, Q41, Q43, Q19.1, Q24.1–2)
- Asked at: 2026-10-03 05:26 (chat clock)
- Raw reply: answers/raw/batch-05-T10-T12.json
- Extracted facts:
  1. Features (card tokenization, CoF charge flags, payout, payment methods) are gated PER MERCHANT PROFILE in sandbox; errors 104 / 105 / 32 / whitelist mean the service is not enabled on that profile.
  2. Remedy = profile configuration by the Integration/Commercial team; neither the API nor the bot can flip it on for ec476910.
  3. get-transactions-by-mc-ref 404 is NOT explained in the bot's docs (only generic check-transaction error patterns) — Integration Team must classify (profile-gated vs restricted/retired vs environment rule).
  4. Documented enablement process: request via PayWay Integration/Commercial → maintenance/change request → sandbox profile enabled FIRST → test with evidence → production enablement.
  5. The team can also provide separate sandbox credentials / a pre-enabled test profile as part of standard sandbox provisioning.
- Confidence: medium-high — procedure consistent with our 2026-09-12 relay answer to Q22; no profile-specific action possible via bot
- Proposed register update: Q22.1/Q41/Q43/Q19.1: procedure re-confirmed; actual enablement of ec476910 requires the human Integration/Commercial channel. Q24.1–2: 404 unexplained by docs — classification still open.

### T-11 — Subscription hash order, doc fix, hash freeze, expire_in (register Q22.2–3, Q12, Q42)
- Asked at: 2026-10-03 05:26 (chat clock)
- Raw reply: answers/raw/batch-05-T10-T12.json
- Extracted facts:
  1. Bot's docs contain only generic purchase HMAC orders (req_time + merchant_id + tran_id + amount + items + firstname + lastname + email + phone + type + payment_option + currency + return_params) — NO ctid/token_flag/frequency, no 26- vs 27-field CITR_FIX variant.
  2. Cannot confirm the ctid-between-items-and-shipping order; doc + Wrong-Hash-hint fix needs the product/documentation team (bot cannot change them).
  3. Hashing rules: HMAC-SHA512 Base64, endpoint-specific concatenation order, only sent parameters included; SAME order applies to sandbox and production for a given endpoint/version.
  4. NO formal freeze guarantee and NO changelog/spec-versioning policy for future HMAC order changes are documented — the contract is whatever the per-endpoint spec for that version says; gateway-vs-spec divergence = bank-side escalation.
  5. expire_in CONFIRMED as an absolute epoch-seconds expiry instant (doc sample: expire_in: 1627113926), NOT a seconds-from-now TTL.
  6. No explicit '10 minutes' TTL documented for the Link Account QR; the observed ~90 s window vs docs discrepancy needs Integration/Product confirmation.
- Confidence: medium-high — matches our live probing (27-field order) and AOF-5/AOF-12 epoch-instant evidence; the no-freeze-policy fact is new and negative
- Proposed register update: Q22.2–3: doc-mismatch acknowledged as needing bank-side escalation (still open). Q12: NEW NEGATIVE — no freeze/versioning/changelog policy exists. Q42: semantics (epoch instant) CONFIRMED; intended window value still open.

### T-12 — Production base URL + UAT environment (register Q16)
- Asked at: 2026-10-03 05:26 (chat clock)
- Raw reply: answers/raw/batch-05-T10-T12.json
- Extracted facts:
  1. Production base URL CONFIRMED: https://checkout.payway.com.kh (examples: /api/payment-gateway/v1/payments/purchase and /plugins/checkout2-0.js?v=2.0).
  2. Full enumeration of current production paths (-2 suffixed endpoints, v3 token-management) NOT explicitly confirmed in the bot's docs.
  3. Sandbox base URL named in docs: https://checkout-sandbox.payway.com.kh.
  4. UAT: historical host checkout-uat.payway.com.kh appears in old script examples, but current rule: 'UAT environment is no longer supported; use sandbox instead. Old UAT API credentials can be reused to call the sandbox API endpoint.'
  5. Sandbox is therefore the only supported test/certification layer; separate UAT exists only if the Integration Team provides it for a specific project.
- Confidence: medium-high — doc-derived with explicit quotes; production parity of individual paths still needs live verification
- Proposed register update: Q16.1: answered (base URL confirmed in docs; per-path parity remains for PRODUCTION-VERIFICATION-PLAN). Q16.2: answered NEGATIVE — UAT discontinued, sandbox is the certification environment.

### T-13 — CoF: token expiry semantics + expired-charge error (register Q3)
- Asked at: 2026-10-03 05:30 (chat clock)
- Raw reply: answers/raw/batch-06-T13-T15.json
- Extracted facts:
  1. VALIDITY IS ROLLING, not fixed: 'Account tokens linked with the CITI_FLEX or CITO_FLEX flags will expire 90 days after their initial linking, renewal, or the last successful transaction—whichever is most recent.' Every renewal or successful transaction pushes expiry out ~90 more days.
  2. Timezone for the boundary: docs specify UTC for request_time (e.g. renew-expired-account-token) but do NOT state the timezone used for 90-day token-expiry computation — needs Integration Team.
  3. Expired-token charge error code: NOT documented. FAQ says expired tokens cannot be used and the user sees an ABA Mobile notification that the payment method is no longer valid; no spec line on whether expired-but-not-removed shares code 105 or uses a different code.
- Confidence: medium-high — direct quoted rule for the rolling model (resolves Q3.1); boundary timezone + error code explicitly deferred
- Proposed register update: Q3.1 ANSWERED (rolling 90d from latest of link/renew/last-successful-transaction) — update tokenExpiryStatus logic assumption; Q3.2/Q3.4 remain open (Integration Team).

### T-14 — token_flag: production-valid domains (register Q25.1–2, Q7.3)
- Asked at: 2026-10-03 05:30 (chat clock)
- Raw reply: answers/raw/batch-06-T13-T15.json
- Extracted facts:
  1. Linking (Link Account / Link Card): CITI_FLEX (CIT Initial, variable, customer-initiated unscheduled) and CITO_FLEX (CIT Other, variable, merchant-initiated later, unscheduled) — the only documented linking flags.
  2. Charging with a token: CITU_FLEX (CIT Unscheduled), MITU_FLEX (MIT Unscheduled), MITR_FIX (MIT Recurring FIXED amount — the flag for subsequent scheduled/subscription charges). 'You will see CITR_FIX in the token metadata for subscription tokens, but the charge itself is done with MITR_FIX.'
  3. Subscription registration: CITR_FIX only, with frequency 1W/1M/2M; scheduled-payment token callback documents token_flag=CITR_FIX.
  4. CITO_FIX, CITR_FLEX and our probed MITU_FIX/MITR_FLEX appear NOWHERE in the published spec — treat as out-of-contract; clients should reject/ignore them.
  5. Explicit confirmation: CITR_FIX is intentionally invalid on linking endpoints (linking = CITI_FLEX/CITO_FLEX only).
- Confidence: high — complete enumerated domain with per-use-site mapping; directly actionable
- Proposed register update: Q25.1/Q25.2 ANSWERED (domain map above). Q7.3 confirmed. MAJOR correction for Q41: our 105 probes used MITU_FIX/MITR_FLEX which are NOT valid values — only MITU_FLEX and MITR_FIX are documented; re-probe MIT charges with the correct flags before calling 105 an enablement blocker.

### T-15 — Rate limits + 429 shape (register Q5, Q47 partial; skills-audit Q-D)
- Asked at: 2026-10-03 05:30 (chat clock)
- Raw reply: answers/raw/batch-06-T13-T15.json
- Extracted facts:
  1. Only explicit numeric production limit documented: KHQR generation = 10 calls/second per Merchant ID.
  2. Check Transaction: no hard limit, only guidance — avoid tight per-second polling; example 20 req/s initially, 50 req/s possible on negotiation (confirm with operations).
  3. transaction-detail / transaction-list / refund / get-transactions-by-mc-ref: NO published numeric limits — our working numbers (600/min, 10/min, 50/min, 500/s, 10/min) neither confirmed nor corrected.
  4. HTTP 429 Too Many Requests is the documented rate-limit signal (clients should back off); NO Retry-After header today and NO roadmap for adding it.
  5. Penalty model is mixed: KHQR generation limited per MID; Check Transaction/general usage may rate-limit or BLOCK IPs sending too many requests (sandbox portal 'Access denied Error code 1020' on abnormal automated access); thresholds and block durations unspecified.
  6. Production 429 response body: no canonical JSON schema or numeric body code documented.
- Confidence: medium — partial — only KHQR 10/s-per-MID and check-transaction guidance are documented; the rest explicitly deferred to Ops
- Proposed register update: Q5: partially answered — publish KHQR 10/s-per-MID + check-transaction 20–50 rps guidance in docs/12; our other bucket numbers remain unconfirmed; 429+Retry-After roadmap: none exists (new negative).

### T-16 — Transaction list: unpaid QR visibility + window cap (register Q11)
- Asked at: 2026-10-03 05:33 (chat clock)
- Raw reply: answers/raw/batch-07-T16-T18.json
- Extracted facts:
  1. Docs do NOT state that all unpaid/open QR transactions must appear in transaction-list; the sandbox behavior (only paid + checkout-created listed) is not contradicted by the spec and has no published production guarantee either way.
  2. No documented filter or variant (of transaction-list or get-transactions-by-mc-ref) that includes still-open unpaid QR transactions.
  3. Documented pattern: track open QRs merchant-side when created; Check Transaction for live status while active; transaction-list / detail / mc-ref for paid/historical reconciliation only.
  4. 3-day date-window cap: documented general rule for transaction-list / transaction-list-2 (max 3 days per request, inclusive of today), applies across environments (larger ranges error 403/500); no per-merchant override documented.
  5. For larger ranges: pagination across multiple 3-day windows or portal exports.
- Confidence: medium-high — doc-derived negative answers consistent with our sandbox evidence (§14b)
- Proposed register update: Q11: answered (operationally) — unpaid QR invisibility is the expected contract; no unpaid-inclusive variant exists; 3-day cap is general and non-overridable. Codify in docs/19 + reconcile-command guidance.

### T-17 — get-transactions-by-mc-ref: canonical envelope (register Q34, Q24.3)
- Asked at: 2026-10-03 05:33 (chat clock)
- Raw reply: answers/raw/batch-07-T16-T18.json
- Extracted facts:
  1. Canonical envelope CONFIRMED: { data: [transaction objects], status: { code: '00', message: 'Success!', merchant_ref } } — the data array + nested status OBJECT is the documented contract; no top-level transactions array exists in the bot's docs.
  2. Success code is the STRING '00' in both sandbox and production (no environment-specific difference documented).
  3. Endpoint IS supported in production: POST /api/payment-gateway/v1/payments/get-transactions-by-mc-ref; supports online + in-store purchase transactions; returns up to the latest 50 matching transactions per merchant_ref; documented limit 10 requests/minute (no sandbox/prod difference).
- Confidence: high — direct spec answer matching our merchant-captured production evidence
- Proposed register update: Q34: ANSWERED — data+status-object envelope canonical, string '00' both environments (our SDK tolerance/normalization can stay but docs can state the canonical shape). Q24.3: answered — production-supported, 10/min current.

### T-18 — Query proof + lost-response recovery + repeat payments (register Q47)
- Asked at: 2026-10-03 05:33 (chat clock)
- Raw reply: answers/raw/batch-07-T16-T18.json
- Extracted facts:
  1. Proof model: callback (verified) is the primary proof for the ledger; Check Transaction is a recent status check ONLY (7-day window); original_amount/original_currency/payment_amount/payment_currency live on get-transactions-by-mc-ref and transaction-detail — there is NO documented callback+check-transaction-only pattern that yields full financial proof.
  2. Lost-response recovery keys: transaction_id → Check Transaction (recent) or transaction-detail (historical; returns refund_amount, operations/history — canonical lifecycle reconstruction); merchant_ref → get-transactions-by-mc-ref (invoice-centric recovery/investigation). No separate lost-refund-response endpoint exists.
  3. REPEAT PAYMENTS CONFIRMED: the same QR/link can genuinely be paid multiple times — each approval gets its OWN NEW transaction_id and is a new payment, not a duplicate webhook.
  4. Dedup rules: dedupe callbacks on transaction_id; reconcile to invoice on merchant_ref; 'Do not deduplicate merely because another payment already exists for the same merchant_ref' — multiple legitimate transactions may share a reference.
  5. Merchant must store and classify repeat payments by invoice balance (UNPAID / PARTIALLY_PAID / PAID / OVERPAID / EXCEPTION).
  6. Historical windows: check-transaction 7 days; mc-ref latest 50 matches, 10/min, no documented max age; transaction-detail 10/min, no documented max age.
- Confidence: high — comprehensive doc-derived contract; repeat-payment rules match the offline-KHQR relay and extend it to QR/links generally
- Proposed register update: Q47: largely ANSWERED — proof combination = callback + paced mc-ref/detail; recovery = tran_id or merchant_ref queries; repeat-payment identity rules captured (new tran_id per payment; never dedupe on merchant_ref alone). Feed docs/18 reconcile + journal dedupe guidance.

### T-19 — Payment link: pushback parity + invalid-id code (register Q20, Q21)
- Asked at: 2026-10-03 05:36 (chat clock)
- Raw reply: answers/raw/batch-08-T19-T21.json
- Extracted facts:
  1. No hash/HMAC field exists in the documented pushback payload ({tranid, apv?, status, returnparams?}) — do NOT expect one in production pushbacks unless custom-arranged per profile (matches our live capture: no hash).
  2. Pushback status: numeric in the canonical example; 0 = success; NO full status matrix (failed/cancelled) documented — needs Integration/Ops.
  3. MULTIPLE pushbacks per payment ARE possible: the generic pushback rule explicitly says the gateway may send multiple pushback events for the same tranid (e.g. when status changes); integrators must design idempotent handling (update if status changed, ignore no-ops).
  4. PTL132 vs sandbox code 96 for invalid link id: neither is defined in the bot's docs — canonical production mapping needs PayWay team confirmation.
- Confidence: medium-high — pushback no-hash + multi-pushback rules are doc-derived and match our live capture; status matrix + PTL132 still open
- Proposed register update: Q20: mostly ANSWERED — no-HMAC confirmed, multi-pushback possible (NEW: idempotent processing required; update our pushback guidance), status value set still open. Q21: still open (not in bot's KB).

### T-20 — Payment link: lifecycle + datatype parity (register Q33)
- Asked at: 2026-10-03 05:36 (chat clock)
- Raw reply: answers/raw/batch-08-T19-T21.json
- Extracted facts:
  1. Expiry enforcement: docs say when expired_date is set, PayWay enforces it — 'requests after expiry must be rejected' — i.e. server-side enforcement is the documented contract, not purely merchant-side. (TENSION: our sandbox shows expired links still read OPEN + hosted page 200; treat doc claim as intended behavior, sandbox as observed gap.)
  2. No link-level EXPIRED status field described in the bot's docs.
  3. Request-side types: amount and payment_limit must be STRINGS (e.g. '100.00'); expired_date must be a string datetime in the exact expected format representing a future time.
  4. Response/pushback types: tran_id — treat as STRING in the integration model, accept numeric-or-string JSON (docs warn link-level tranid vs transaction-level tranid differ); amount/totalAmount in pushbacks/check-transaction numeric; status numeric-or-enum (0 = success example); datetime/payment_type optional.
  5. total_refund: no explicit type contract documented; expired_date sentinel '0' not part of the documented contract.
  6. pushback_url presence rules in detail responses: not described in the bot's docs.
  7. No documented minimum future expired_date offset; 'Incorrect expired_date causes failures' with no PTL code tied.
  8. PTL04/PTL05/PTL99/PTL132 are NOT defined in the bot's KB (it only documents PTL06, PTL62, PTL175, etc.) — mappings need the Integration/Ops team.
- Confidence: medium — typing guidance actionable; several specifics (EXPIRED status, PTL codes, min offset) explicitly undocumented
- Proposed register update: Q33: partially answered — string-typed request fields + string-modeled tran_id + numeric pushback amounts captured; server-side expiry enforcement claim needs sandbox re-verification against §22 evidence; PTL code map stays open.

### T-21 — Payment link: void endpoint parity (register Q37)
- Asked at: 2026-10-03 05:37 (chat clock)
- Raw reply: answers/raw/batch-08-T19-T21.json
- Extracted facts:
  1. Docs confirm payment-link void exists via Merchant Portal AND API; voiding deactivates the link so it cannot accept further payments and is IRREVERSIBLE (cannot be reactivated; duplicate/create a new link instead).
  2. Exact production endpoint path, signing/encryption scheme, and any dedicated public docs page: NOT specified in the bot's materials — needs Integration Team.
  3. PAID / partially-paid multi-payment link voidability and its rejection code: not stated; no PTL mapping.
  4. In-flight payments at void time (pushback firing, check-transaction approval): not specified.
  5. PTL188 not defined in the bot's KB — no confirmation it is the final double-void code.
  6. Refund vs void: conceptually differentiated (refund returns money per refund rules; void permanently deactivates); no prescriptive rule on combining them for PAID links — left to merchant/business rules.
- Confidence: medium — confirms existence + irreversibility; everything protocol-specific is undocumented in the bot's KB (consistent with void being an unpublished endpoint)
- Proposed register update: Q37: existence + irreversibility confirmed from docs; path/signing/PTL188/paid-link semantics remain open (our §23 live mapping stands as the only contract evidence). Our refund-instead-of-void advice stays prudent.

### T-22 — Payment link: image upload (register Q14)
- Asked at: 2026-10-03 05:41 (chat clock)
- Raw reply: answers/raw/batch-09-T22-T24.json
- Extracted facts:
  1. NEW documented constraints beyond 3MB JPG/PNG: image WIDTH must not exceed 2,000 pixels; filename must NOT contain special characters such as parentheses.
  2. size:0-on-success: not mentioned in the bot's docs — defect status unknown (Integration Team).
  3. Filename renaming (payment_link_image_<epoch-ms>.<ext>): not documented — by-design unknown.
  4. CDN URL stability/publicity for merchant receipts: not documented — needs PayWay confirmation.
  5. Nothing documented about aspect ratio or content sniffing.
- Confidence: medium-high — two new enforceable constraints captured; the rest explicitly undocumented
- Proposed register update: Q14: partially answered — add width≤2000px + filename-no-parens to our --image validation advisory; size:0 defect + CDN stability stay open.

### T-23 — Subscription lifecycle management (register Q15)
- Asked at: 2026-10-03 05:42 (chat clock)
- Raw reply: answers/raw/batch-09-T22-T24.json
- Extracted facts:
  1. No dedicated cancel/pause/resume subscription API documented. Model: merchant provides an 'Unsubscribe' UI (customer cancels so no future charges); merchant stops its own scheduled MITR_FIX charge job for that ctid/token; token lifecycle (freeze/unfreeze/remove/renew from ABA Mobile, status 0/1/2) prevents further charges and can arrive via CoF callbacks.
  2. Renewal charges are MERCHANT-INITIATED via the normal Payment API using the stored token with MITR_FIX — the merchant's batch job drives the schedule.
  3. There IS a callback per recurring charge: the documented scheduled-payment pushback is {tran_id, apv, status:'0', return_params} — the SAME structure as a normal Payment API pushback; no separate recurring-vs-one-off schema (merchant distinguishes via its own ctid/subscription context).
  4. The 90-day rolling expiry rule is documented ONLY for unscheduled account tokens (CITI_FLEX / CITO_FLEX). No 90-day rule and no frequency-driven expiry for CITR_FIX/MITR_FIX — frequency is the billing schedule; expired_at/token status are an independent lifecycle; charging an expired or frozen token is declined.
  5. Exact expiry policy for scheduled (CITR_FIX/MITR_FIX) tokens: not specified — needs Integration Team.
  6. No documented sandbox shortcut to accelerate 1W/1M/2M cycles (sandbox MAY support token-expiry manipulation for CoF generally per sandbox notes).
- Confidence: high — coherent full lifecycle answer consistent with our Q2/Q18 evidence and the T-13/T-14 answers
- Proposed register update: Q15: ANSWERED (operationally) — cancel = merchant-side unsubscribe + token lifecycle; renewal callback = standard pushback per charge; frequency does NOT govern token expiry; no cycle accelerator documented.

### T-24 — Hosted checkout routing (register Q29.1–2, Q29.4)
- Asked at: 2026-10-03 05:42 (chat clock)
- Raw reply: answers/raw/batch-09-T22-T24.json
- Extracted facts:
  1. payment_gate=0 → E-commerce Checkout flow (hosted checkout / webpage HTML-redirect style response); payment_gate omitted (or QR/API value) → QR/API response (qr_string, qr_img).
  2. The routing is PROFILE-SPECIFIC: it matters when BOTH Ecommerce Checkout and QR/API services are enabled on the merchant profile.
  3. payment_gate IS still supported on https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase and should be set explicitly when both services are active.
  4. view_type=hosted_view is documented as the mechanism for mobile browser / H5 / in-app WebView flows (full-screen hosted checkout URL to load in a WebView); desktop popup uses the JS plugin + iframe WITHOUT view_type. Docs don't prohibit hosted_view on desktop but only specify it for mobile/H5/WebView.
- Confidence: high — direct spec answers to all three open Q29 sub-items
- Proposed register update: Q29.1/29.2/29.4: ANSWERED — codify in docs/10 + docs/03 (payment_gate routing + profile-dual-service rule + hosted_view=mobile/H5 mechanism); desktop use of hosted_view stays unspecified.

### T-25 — Money + identifier contract (register Q48, N2 KHR-floor, N6 remainder)
- Asked at: 2026-10-03 05:45 (chat clock)
- Raw reply: answers/raw/batch-10-T25-T27.json
- Extracted facts:
  1. GLOBAL amount format (Purchase / QR / Refund): USD = decimal string with EXACTLY 2 decimal places ('0.01', '1.46', '2500.00'); KHR = integer only, no decimal point ('16000'); no currency symbols/text/commas/spaces inside amount — currency goes in the currency field.
  2. Only explicitly documented numeric limit: USD refunds ≥ 0.01 and ≤ remaining refundable amount; all other min/max = commercial agreement / gateway configuration; on 'Invalid Transaction Amount' validate formatting then check configured limits.
  3. Sub-100-KHR refunds: no explicit statement — allowed-or-rejected unconfirmed.
  4. tran_id: max length 20 characters; alphanumeric; hyphen allowed in some integrations (safe examples 'INV202510021234', 'ORDER-12345'); duplicates rejected (uniqueness scope — global vs per merchant — NOT specified); QR retries may reuse the same tran_id for the SAME payment flow.
  5. return_params: no documented charset/length constraints; must NOT be included in the hash.
  6. req_time: 14-digit format YYYYMMDDhhmmss (e.g. '20260212144826'); timezone NOT specified — treat as opaque server timestamps.
  7. lifetime unit NOT explicitly defined in the bot's material (QR sessions commonly ~15 min; poll check-transaction up to ~5 min after QR creation); expired_date must be valid/future.
- Confidence: medium-high — formatting + tran_id length rules are firmly doc-derived ('firmly confirm' per the bot); limits/timezone explicitly deferred
- Proposed register update: Q48: largely ANSWERED (format rules + tran_id ≤20 alphanumeric + req_time format) — feed docs/12 amount table; sub-100-KHR floor and timezone stay open.

### T-26 — Refund policy (register N2 remainder)
- Asked at: 2026-10-03 05:45 (chat clock)
- Raw reply: answers/raw/batch-10-T25-T27.json
- Extracted facts:
  1. Refund window: configurable online refund window of about 30 days from the original transaction date (portal or Refund API); after the window only manual/offline refund via a cancellation/refund form signed by an authorized person.
  2. Full and partial refunds supported within the window; whether MULTIPLE partials up to the original total are allowed is not specified.
  3. Fees: ABA-to-ABA refunds — no processing fee; some KHQR offline/manual refunds — no fee, several working days; other methods/production — not fully specified, check commercial agreement.
  4. Authorization: portal refunds by users with merchant-portal permissions; API refunds with merchant credentials/keys; offline refunds need a bank form signed by an authorized signatory.
  5. Rounding/minimums for partial refunds: currency-scale rules (0.01 USD vs 1 KHR) NOT restated; no concrete minimum beyond 'a portion of the transaction'.
  6. Refunds after payout/split: the bot's refund docs do not cover payout/split flows at all — manual-only path unconfirmed in this KB (our 2026-09-12 relay already stated no standard refund after payout/split).
- Confidence: medium-high — the 30-day window + ABA-to-ABA no-fee facts are new and specific; partials/rounding still open
- Proposed register update: N2: substantially advanced — ~30-day configurable online window + offline-after form process + ABA-to-ABA no-fee; multiple-partials and rounding rules remain open.

### T-27 — Payout: mechanics + sandbox provisioning (register Q13, Q19.2, Q54)
- Asked at: 2026-10-03 05:46 (chat clock)
- Raw reply: answers/raw/batch-10-T25-T27.json
- Extracted facts:
  1. Source: payout/split distributes from the merchant's settlement/platform sub-account to whitelisted beneficiary accounts/MIDs; no documented support for other source accounts or cross-currency funding (same currency assumed).
  2. Beneficiary currency mismatch → PTL147 'Payment currency is not allowed' (new named code).
  3. Fees, per-transaction/daily limits, rounding, fee allocation across beneficiaries: NOT specified — commercial/ops configuration; merchant defines explicit payout amounts and the sum must match.
  4. Visibility of source debits + beneficiary credits: PayWay Merchant Portal and ABA Merchant app ('manage and track customer & payout transactions'); exact report names/columns not documented.
  5. Beneficiaries: MIDs (card split supports MID only) or whitelisted ABA accounts; production requires ALL destination accounts whitelisted + real ABA accounts; SANDBOX: 'Do not use real bank accounts in sandbox; use the sandbox whitelist accounts provided by Integration Team for testing.'
  6. Exact payee field format (pure account number vs customer ID): not spelled out; generic PTL04 on invalid accounts matches the parameter-validation rule.
  7. complete-with-payout: split/payout is an additional service that must be explicitly enabled by the Integration Team; PTL62 consistent with an un-provisioned profile; whether ec476910 can be provisioned is an Integration/ops decision.
  8. Seeded sandbox beneficiary list: provided separately by the Integration Team; no embedded list in the KB.
  9. Payout placement in payment-link create/detail responses: no schema in the KB (only checkout/purchase + whitelist/payout APIs) — needs the canonical payment-link spec.
- Confidence: medium-high — procedure/eligibility doc-derived; matches our relay (payout service per-MID) and adds PTL147 + sandbox-account rule
- Proposed register update: Q13/Q19.2/Q54: advanced — sandbox-whitelist-accounts-provided-by-team rule captured; PTL147 named; payout placement in payment-link responses still open. Our 500000001 fixture aligns with the 'provided by Integration Team' model.

### T-28 — Pre-auth mechanics (register Q53, N3 remainder)
- Asked at: 2026-10-03 05:49 (chat clock)
- Raw reply: answers/raw/batch-11-T28-T30.json
- Extracted facts:
  1. Completion amounts: partial (lower) and equal supported; for supported card pre-auth, capture up to ~10% ABOVE the original hold is allowed (config- and scheme-dependent); large increases not supported.
  2. Uncaptured remainder: automatically released back to the customer by the gateway after a lower-amount completion; if never completed/cancelled, the whole hold auto-reverses within the validity window (~30 days, configurable) per issuer/network rules.
  3. Capture-vs-cancel race: behaviour NOT defined — integrators must avoid it (decide one action; only that request sent).
  4. Incremental auth / re-auth: NO merchant API exists for either; use the ~10% tolerance for small changes or CoF tokenization + a new authorisation for larger/variable scenarios.
  5. Auto-release detection: NO webhook — poll check-transaction-2 (and/or portal) for pre-auth status.
  6. Issuer/gateway failures on completion/cancel/refund: retry online; if still impossible, offline/manual process via bank forms + settlement team; offline timing depends on issuer/network/ops and is not quantified.
  7. Reconciliation for later refunds: store tran_id + pre-auth reference IDs; locate via Check Transaction / portal by tran_id / APV / order IDs; offline corrections reconciled with APV/order IDs + evidence by the settlement/integration team.
- Confidence: medium-high — specific numbers (~10% tolerance, 30-day window) with the race + re-auth gaps explicitly negative
- Proposed register update: Q53/N3: substantially ANSWERED — ~10% over-capture tolerance is the headline new fact; no incremental/re-auth API (negative); race undefined (avoid by design). Feed docs/12 pre-auth section.

### T-29 — PCI scope + service levels (register N9, N11)
- Asked at: 2026-10-03 05:50 (chat clock)
- Raw reply: answers/raw/batch-11-T28-T30.json
- Extracted facts:
  1. NEGATIVE: no documented PCI-DSS/SAQ mapping per integration pattern, no PayWay PCI attestation level, no SLA/uptime status page, no incident channel, and no escalation path in the bot's integration references.
  2. These are handled on the commercial/operations/compliance side — direct to PayWay Product/Operations or Compliance team.
- Confidence: high (as a negative) — explicit 'not in my references' with routing guidance
- Proposed register update: N9/N11: remain OPEN — bot has nothing; only the human commercial/compliance channel can answer. Keep as portal/support asks.

### T-30 — Checkout callback schema + language param (register N12 remainder)
- Asked at: 2026-10-03 05:50 (chat clock)
- Raw reply: answers/raw/batch-11-T28-T30.json
- Extracted facts:
  1. Callback field-by-field reference schema: NOT documented in the bot's materials (samples only) — Integration Team owns the authoritative schema.
  2. LANGUAGE RESOLVED: the purchase API supports a lang parameter — pass ?lang=<code> on the purchase URL (e.g. .../api/payment-gateway/v1/payments/purchase?lang=km). Documented locales: en (English, default when omitted), km (Khmer), zh (Chinese).
  3. Known product-side issue: some KHQR screens ignore lang and default to English.
  4. Customization: custom CSS/JS NOT supported; checkout2-0.js and hosted pages are PayWay-controlled and must not be modified.
  5. Branding/labels: logos, theme, and payment-method display are configured per profile by the PayWay/Integration team (merchant supplies assets, typically PNG); some labels (e.g. 'Continue Shopping' success button) are merchant-editable in the portal where exposed, otherwise changed by the team.
  6. Change request process: decide exact changes → provide merchant ID + environment + exact label text/assets (portal where editable, else Integration/Support team) → team updates profile/config → retest hosted checkout incl. continue_success_url.
- Confidence: high — language parameter fully answered with locales and URL form; customization matches our 2026-09-12 relay (G19)
- Proposed register update: N12: language sub-item ANSWERED (?lang=en|km|zh); callback schema sub-item stays open. docs/10 can now document the lang parameter and the label/branding request flow.

### T-31 — TLS chain + network rules (register Q7.1–2, Q17, Q39, Q49.3)
- Asked at: 2026-10-03 05:52 (chat clock)
- Raw reply: answers/raw/batch-12-T31-T33.json
- Extracted facts:
  1. Callback SOURCE IPs DOCUMENTED: DC1 = 103.108.218.76, DC2 = 103.108.218.2; optionally allowlist the whole subnet 103.108.218.0/24 (stricter = two IPs only; /24 = resilient to infra changes within the subnet).
  2. Sandbox TLS chain (self-signed): NOT documented in the bot's materials — intended-or-not / trusted-cert plan / published chain for pinning all need the infrastructure/operations team (Q39 contradiction remains unaddressed).
  3. Merchant callback endpoint requirements: HTTPS over TCP port 443, valid SSL/TLS certificate, publicly reachable (no VPN/office-only), correct public DNS, accepts POST with PayWay payload, returns HTTP 200; custom external ports (:8080/:8443) NOT supported — use a reverse proxy on 443.
  4. WAF/CDN/API gateways allowed in front but must not block the PayWay source IPs above; no TLS-version/cipher-suite matrix documented for merchant endpoints.
  5. Hosting merchant backends OUTSIDE Cambodia is allowed (publicly reachable + rules satisfied).
- Confidence: high (for IPs/ports); medium (TLS chain unresolved) — source IPs and port rules are concrete and actionable; the sandbox-chain question stays with infra
- Proposed register update: Q7.2 ANSWERED (callback IP allowlist 103.108.218.76/.2, optional /24) — codify in docs/16. Q49.3 largely answered (443/HTTPS/public, hosting abroad OK). Q7.1/Q17/Q39 remain open with the infra team.

### T-32 — Key rotation + incident procedure (register Q8, Q49.2, N10 remainder)
- Asked at: 2026-10-03 05:53 (chat clock)
- Raw reply: answers/raw/batch-12-T31-T33.json
- Extracted facts:
  1. No self-service key rotation documented — ALL credentials (sandbox + production) are provisioned and renewed by the ABA PayWay Integration Team via secure channels; leaked sandbox key → request rotation via support ticket / direct request, then replace and re-test.
  2. Old/new key overlap during rotation: NOT documented — confirm with the Integration Team when planning.
  3. API key rotation is INDEPENDENT of the RSA key pair and callback registration (separate profile-level config items; RSA/callbacks remain unless explicitly changed — you can ask for RSA regeneration explicitly).
  4. Production credentials may carry TEMPORARY EXPIRATIONS during onboarding — activation links/keys commonly ~72 hours; expired-before-use → request extension/reissue; expiry adjusted/removed after go-live verification.
  5. Exposed-key incident channel: no dedicated compliance address documented — notify the Integration Team immediately via the normal support channel and/or digitalsupport@ababank.com; they involve internal security/compliance as needed.
- Confidence: high — complete lifecycle answer; matches the 2026-09-12 relay (team-issued keys, temp expirations) and adds digitalsupport@ababank.com
- Proposed register update: Q8: ANSWERED operationally (team-mediated rotation; digitalsupport@ababank.com as incident path; no overlap guarantee). N10 key-lifecycle remainder closed except overlap semantics.

### T-33 — Domain whitelisting + sandbox operations (register Q31 remainder)
- Asked at: 2026-10-03 05:53 (chat clock)
- Raw reply: answers/raw/batch-12-T31-T33.json
- Extracted facts:
  1. Whitelisting procedure: merchant sends exact domains/IPs + environment (sandbox vs production) to the Integration Team → team updates the whitelist per merchant profile per environment → confirms back; non-whitelisted origins see 'domain not whitelisted'/403-style errors; HTTP Referer/origin must match.
  2. Wildcard subdomains: NOT documented — confirm case-by-case; no self-service whitelist UI documented.
  3. Sandbox reactivation: expired activation link → team resends; expired/invalid keys → Digital Support (digitalsupport@ababank.com) or integration contact to extend or reissue; no self-service; verify with one test transaction after reactivation.
  4. Sign-off evidence to retain/submit: tran_id / APV / approval codes / order IDs / timestamps; full UI-flow screenshots or video (POS, web checkout, KIOSK/Vending, mobile KHQR/deeplink); callback URLs + browser/network logs (Referer, response codes) + server logs around callback receipt; executed test scenarios (success + failure, pre-auth complete/cancel, callback-vs-polling for offline KHQR).
  5. Evidence is submitted at sandbox/UAT sign-off, pre-auth + POS checkout approvals, production onboarding, and optional phone verification.
  6. Confirming whitelisting was actually configured: team confirmation + technical verification (whitelisted-origin calls succeed without 403; callbacks arrive from the documented IPs with HTTP 200 in your logs).
- Confidence: high — full procedural answer with concrete evidence lists and verification methods
- Proposed register update: Q31: largely ANSWERED (procedure, wildcards undocumented, sandbox reactivation via Digital Support, evidence checklist) — feed docs/16 and the RELEASE-READINESS manual-actions register.

### T-34 — Customer Module (printed QR) callbacks + provisioning (register Q35, Q36)
- Asked at: 2026-10-03 05:56 (chat clock)
- Raw reply: answers/raw/batch-13-T34-T35.json
- Extracted facts:
  1. ONE callback URL per merchant profile for ALL channels ('Callback URL: Only one URL; change requires support ticket'); Customer Module and online-checkout callbacks share it and are distinguished by payload shape — per-channel URLs cannot be provisioned.
  2. Canonicalization claim #1: Customer Module callbacks use the SAME hash model as online checkout — SORTED-KEY concatenation of callback fields, header X-PAYWAY-HMAC-SHA512.
  3. CONTRADICTION with T-07 (same bot, same session): T-07 said Customer Module HMAC plaintext = the RAW HTTP request body with no re-serialization. The two answers disagree — our 2026-08-18 capture is the arbiter (test both canonicalizations offline).
  4. Algorithm: HMAC-SHA512 then Base64; any HMAC-SHA256 mention in older material is legacy.
  5. Callback URL is configured/changed by the PayWay team in BOTH sandbox and production (no portal self-service for Customer Module).
  6. Sandbox provisioning: possible — enable Invoicing Tool or Payment Links on the sandbox profile + KHQR/QR services + domains (all done by the Integration/Support team; no self-service toggle); reconciliation via get-transactions-by-mc-ref with the Customer ID as merchant_ref.
- Confidence: medium — routing/algorithm/provisioning answers coherent, but the canonicalization answer contradicts T-07 and needs our capture-based arbitration
- Proposed register update: Q35.1/Q35.3: ANSWERED (single shared URL; SHA512 confirmed, SHA256 legacy). Q35.2: now has TWO contradictory bot claims (sorted-key vs raw-body) — resolve empirically against the 2026-08-18 capture. Q36.1/Q36.2: answered (provisioning possible, callback URL team-configured).

### T-35 — Google Pay + per-method matrix (register Q38, N7 remainder)
- Asked at: 2026-10-03 05:56 (chat clock)
- Raw reply: answers/raw/batch-13-T34-T35.json
- Extracted facts:
  1. Google Pay: documented method list for online checkout/payment links is ABA Pay, cards (Visa/MasterCard/JCB), UPI, KHQR, WeChat Pay, Alipay — docs explicitly note 'Google Pay for online transactions was not available at the time of the discussion'; no environment matrix or enablement flow. SDK's google_pay advisory must STAY; current status needs Sales confirmation.
  2. Per-method currency matrix + fee schedule: not in the integration docs — commercial/contractual per merchant (paywaysales@ababank.com or account manager).
  3. Verifying enabled methods: (a) ask Integration/Sales (canonical, aligned with contract); (b) merchant portal/admin view where available (backend config remains authoritative over plugin toggles); (c) behavioural test — a disabled method either does not appear on the hosted checkout or errors 'Selected Payment Option is not enabled for this Merchant Profile'.
- Confidence: high — confirms our existing google_pay advisory with the same doc sentence; verification pattern actionable
- Proposed register update: Q38: confirmed as of this KB — Google Pay online still unavailable per docs; keep advisory. N7 remainder: currency/fee matrix is commercial-only (closed as out-of-integration-docs scope).

### T-36 — CoF governance: consent, schedules, revocation (register Q52)
- Asked at: 2026-10-03 06:00 (chat clock)
- Raw reply: answers/raw/batch-14-T36-T38.json
- Extracted facts:
  1. Consent model: scheduled = CITR_FIX subscribe (explicit fixed amount + frequency) → PWT pushed via callback_url; unscheduled = CITI_FLEX / CITO_FLEX link → CITU_FLEX / MITU_FLEX charges. Merchants MUST provide UI for Subscribe/Link, View (merchant name, amount, frequency), and Unsubscribe/Remove.
  2. AUDIT/RETENTION: PayWay stores token + masked source_of_fund + metadata (expired_at, token_flag, status, limits, currency); merchant stores pwt + internal ctid + subscription config; raw PAN/CVV storage FORBIDDEN (card entry only on PayWay-hosted UI).
  3. SCHEDULE OWNERSHIP: the MERCHANT owns it — 'every day, the Merchant Server runs a scheduled job' to find due subscriptions and call the Payment API with the stored token; PayWay never autonomously runs the billing schedule.
  4. Token status map repeated: 1 active / 2 frozen / 0 removed; expired/frozen/removed → charge declined + ABA Mobile user notification; NO grace period documented once revoked; NO PayWay-managed retry framework — retries are merchant-owned and simply decline on revoked tokens (no queuing).
  5. In-flight charge at revocation: no special handling — already-authorised transactions complete/decline per normal issuer/gateway rules; on a token-status callback, mark the subscription inactive and stop scheduling immediately.
  6. CIT/MIT restrictions: CITI_FLEX tokens CANNOT be used for MIT payments; CITO_FLEX is intended for MIT; scheduled tokens CITR_FIX (registration) → MITR_FIX (charges).
  7. 3DS: enrolled cards require OTP/equivalent challenge; manual key-in / CNP without authentication NOT allowed; card entry only via PayWay-hosted UI/iframe unless a separate product with PCI-DSS evidence; integration must surface the challenge and await the result; issuer rules may still decline; non-3DS cards may be rejected if the profile requires 3DS.
- Confidence: high — comprehensive governance answer consistent with T-13/T-14 and docs/09; merchant-owned schedule is now explicitly documented
- Proposed register update: Q52: largely ANSWERED — consent/UI obligations, retention split, merchant-owned schedule + retries, no-grace revocation, CIT/MIT flag restrictions, 3DS expectations. Feed docs/09 + skills.

### T-37 — Profile capability discovery (register Q51)
- Asked at: 2026-10-03 06:00 (chat clock)
- Raw reply: answers/raw/batch-14-T36-T38.json
- Extracted facts:
  1. NEGATIVE: no public/versioned 'describe profile' API or schema exists that returns enabled methods/currencies/capabilities.
  2. Authoritative source = PayWay backend config + Integration/Commercial team confirmation per profile per environment; merchant portal may show some config but is not authoritative.
  3. Bot claims each merchant profile has a SINGLE settlement currency ('does not support multiple currencies per profile') — TENSION with our 2026-09-12 relay which described dual-currency merchants (customer picks currency, settlement to the matching account); treat the relay as more specific until clarified.
  4. Runtime signal for disabled methods: 'Selected Payment Option is not enabled for this Merchant Profile' or the method simply not appearing on the hosted checkout.
  5. Recommended pattern: design-time static configuration from the team + runtime hard-fail handling of configuration errors.
- Confidence: medium-high — clear negative on introspection API with actionable design pattern; settlement-currency claim needs cross-check
- Proposed register update: Q51: ANSWERED (negative) — no capability-discovery API exists; codify design-time + runtime-error pattern; verify the single-settlement-currency claim against the dual-currency relay note.

### T-38 — Go-live acceptance rule (register Q44)
- Asked at: 2026-10-03 06:00 (chat clock)
- Raw reply: answers/raw/batch-14-T36-T38.json
- Extracted facts:
  1. Documented minimum acceptance: at least ONE successful production transaction (a card transaction if cards are in scope), small/low value, with transaction ID + evidence (screenshots/video) shared so Integration can verify settlement mapping + check-transaction/callback behaviour.
  2. Per-method / per-issuer / per-scheme transaction counts: NOT specified (internal policy, not in external docs).
  3. Multi-outlet deployments: Integration may request at least one transaction per outlet to verify settlement mapping.
  4. Mandatory advanced cases (refund, pre-auth capture/void, CoF CIT/MIT, payout): NOT standardized for initial acceptance — scope/contract-dependent, agreed with Integration/Commercial.
  5. Restricted traffic before first settlement verification: not codified — official go-live + removal of temporary restrictions happens only AFTER the first production transaction is verified; soft-launch traffic is case-by-case with Integration/Commercial/Compliance.
  6. Post-verification sequence: profile marked live / credential expiry removed → VIP support window starts.
- Confidence: medium-high — high-level rule with explicit gaps marked as internal policy
- Proposed register update: Q44: partially ANSWERED — ≥1 low-value production transaction + evidence is the documented floor; counts/caps and mandatory-case matrix remain internal (keep as human-channel asks).

### T-39 — Settlement report sources + joins (register Q45, N4 remainder)
- Asked at: 2026-10-03 06:03 (chat clock)
- Raw reply: answers/raw/batch-15-T39-T40.json
- Extracted facts:
  1. Join model: PayWay portal transaction export (order ID / purchase# / tranid, APV, amount, date/time, masked PAN for cards) joined to bank iBanking/settlement reports/statement (purchase/reference number matching the PayWay order ID; for cards also internal ref + masked PAN + auth code + amount + date/time).
  2. Preferred join field: PayWay purchase#/order ID/tranid ↔ bank purchase/reference number; fallback = masked PAN + amount + date/time window; ABA can provide a CUSTOM EXPORT containing orderID + bank settlement/reference fields on request.
  3. APV is an internal/gateway reference — helpful for issuer/card-system reconciliation, NOT guaranteed to appear on bank statements.
  4. Aggregated batch bookings: sum the PayWay export for the settlement period and match the batch total bank-side.
  5. Fees appear as separate small debits (agreement/application-form defined); refunds are separate transactions with a TIMING TRAP (a refund can appear before the original purchase fully settles, e.g. T+5/T+7); FX/reserves/tax lines have no documented canonical report schema.
  6. Cut-offs/holidays: settlement in bank working days (T+3/T+5/T+7, up to 15) — weekends/holidays excluded, processing moves to the next working day.
  7. Later-batch adjustments: portal record wrong → exclude it from the current settlement report; settled-but-missing-in-portal → ABA adds it with the correct date or merchant includes it in a later run; upstream status unretrievable → ABA may ask the merchant to process a refund to avoid settlement delays.
  8. Escalation trigger (time-based, no numeric tolerance documented): mismatch persisting beyond the agreed working-day window, or one-sided/mis-dated records after normal checks — escalate with transaction/order IDs (APVs), local date/time + amounts, and exports/screenshots from BOTH the PayWay portal and bank/iBanking.
- Confidence: high — concrete field-level join guidance matching the 2026-09-12 relay and adding the adjustment/escalation playbook
- Proposed register update: Q45: substantially ANSWERED — report fields/grain/joins + adjustment + escalation rules captured; numeric tolerance explicitly not standardized. Feed docs/20.

### T-40 — Checkout UI spec version + review process (register Q50 remainder)
- Asked at: 2026-10-03 06:04 (chat clock)
- Raw reply: answers/raw/batch-15-T39-T40.json
- Extracted facts:
  1. NO public version number (2.11 unconfirmed), effective date, or public canonical URL — the canonical source is whatever design file/assets the Integration Team supplies per project; versioning managed by the team.
  2. Device/embedded-browser matrix: NONE documented (no Telegram-specific rules) — universal webview rules apply: hide the URL address bar + three-dots menu, include a static merchant header, use registered/whitelisted referer domains, back closes the webview when there is no history.
  3. PRESENTATION RULE: card and QR payments prefer fullscreen; bottom-sheet/swipable UI NOT ALLOWED for card forms (global rule, not a feature flag); use view_type=hosted_view for full-screen hosted checkout; card forms must load in a webview or full page, NOT an iframe; violations may be flagged by ABA with requested changes.
  4. Logos/labels: use original provider logo files unaltered; 'We Accept' area required; canonical labels — 'ABA KHQR' with subtitle EXACTLY 'Scan to pay with any banking app'; no generic labels; recommended order ABA PAY → KHQR → cards; single enabled method = single-action button UI.
  5. Typography/currency: follow the Figma/UI spec for spacing/alignment (subtitle ~14px hints); dot decimal separators, e.g. '1,000.00 USD' with bold amount + smaller currency label, remove unused symbols.
  6. CTA/continuation label agreed with Integration per merchant; no public label list; supported locales NOT enumerated; config mechanism for logo/theme/labels not exposed (profile config + design guideline + UI review).
  7. SCREEN-REVIEW PROCESS: merchant submits full-flow sandbox evidence (screenshots/recordings of checkout page with options+logos, QR/hosted display, ABA Mobile success screen, merchant thank-you/receipt; APK + TestFlight builds + test accounts + logo asset) → Integration Team reviews vs guideline, requests iterations → UI sign-off package includes approved screenshots → production credentials issued after UI review passes AND test flows verify.
  8. RE-REVIEW RULE (explicit): 'The UI that goes live must not be modified from the version that was approved during UI review without re-approval.'
  9. Hosted-QR: use checkout_qr_url as returned (do not replace with custom KHQR for the ABA KHQR option); when both abapay_deeplink and checkout_qr_url arrive, try the deeplink and fall back to checkout_qr_url; show a countdown (example lifetime ~180 seconds) and replace expired QRs; no per-profile entitlement matrix for hosted-QR/templates (qr_image_template values exist; entitlement = profile/commercial config).
- Confidence: medium-high — detailed and consistent with the 2026-10-03 checkout-UI relay; version/device-matrix/entitlement gaps explicitly team-owned
- Proposed register update: Q50 remainder: substantially ANSWERED — no public spec version/canonical source (team-supplied assets are canonical); no device matrix (universal webview rules); no bottom-sheet for cards (global rule); review process + re-review rule documented. Locale list + config mechanism remain open.

### T-41 — Checkout UI asset redistribution (register Q56 remainder)
- Asked at: 2026-10-03 06:06 (chat clock)
- Raw reply: answers/raw/batch-16-T41-T42.json
- Extracted facts:
  1. NEGATIVE: docs only define how official UI/logo assets must be USED in merchant checkouts (correct variants, placement, no modification; assets come from the Integration Team / design guideline).
  2. No documented redistribution right for PayWay or third-party marks (card schemes, wallets) inside a public SDK; no license type/version; no canonical public download source or update terms.
  3. Decision route: ABA PayWay Integration + Legal/Branding must give an explicit go/no-go and terms (branding/IP + card-scheme requirements).
- Confidence: high (as a negative) — explicit 'cannot confirm redistribution rights' with a named decision route
- Proposed register update: Q56 remainder: ANSWERED (negative) — keep assets OUT of any public package pending a written go/no-go from ABA Legal/Branding; matches our existing asset-handling rule.

### T-42 — Adjacent products: plugins, POS, Mini Apps (register Q55)
- Asked at: 2026-10-03 06:06 (chat clock)
- Raw reply: answers/raw/batch-16-T41-T42.json
- Extracted facts:
  1. Officially documented plugins: Shopify (official ABA PayWay app on the Shopify App Store, maintained by ABA Bank), WooCommerce (WordPress), PrestaShop, and Odoo eCommerce (mentioned as supported for PayWay eCommerce Checkout via plugin).
  2. Plugin versioning, feature matrices, upgrade paths: NOT described — use the official plugins from the PayWay developer page / Shopify App Store with their bundled docs.
  3. POS/ECR: ABA POS and ABA QR API exist as products (terminals, QR API for kiosks/POS) but NO published hardware integration contract (transport/protocol/firmware).
  4. ABA Mini Apps rules: NO information in the bot's materials.
  5. Contract ownership + separate UAT acceptance for adjacent products: only high-level (Integration Team does sandbox + UI review → production credentials); no documented per-product ownership breakdown or UAT framework — clarify with the relevant PayWay product owners (Integration, Product, Legal/Commercial).
- Confidence: medium-high — plugin list is concrete; POS/ECR + Mini Apps explicitly out of the KB
- Proposed register update: Q55: partially ANSWERED — plugin list captured (Shopify/WooCommerce/PrestaShop/Odoo); POS/ECR contract, Mini Apps rules, and per-product UAT frameworks remain product-owner asks.

<!-- Append one section per ID using the template in ../QUESTIONNAIRE.md §6.
     Never paraphrase numbers/codes in extracted facts; keep raw replies verbatim in raw/. -->
