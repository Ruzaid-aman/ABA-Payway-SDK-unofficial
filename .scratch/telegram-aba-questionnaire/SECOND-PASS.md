# Second pass — question-register sweep after the follow-up round (2026-10-03)

**Method:** every register item (canonical Q1–Q56 + N1–N12 + skills-audit Q-A…Q-G, including the
2026-10-03 relay-batch statuses) re-checked against ALL captured answers — the main 43-question run
(`answers/ANSWERS.md`) plus the 15-question follow-up round (`../FOLLOW-UPS.md`, addendum FU-01…FU-15
in ANSWERS.md). Goals: (a) items still unanswered, (b) contradictions standing after the FU round,
(c) contradictions/questions the FU round itself created, (d) sub-items never asked of anyone.

**Evidence-quality rule unchanged:** bot answers are doc-derived relays, not written contract
confirmations; production-parity asks stay formally open.

---

## 1. Contradiction scorecard (7 filed re-tests, re-graded after FU-01…15)

| # | Item | Grade after FU round |
|---|---|---|
| 1 | Q35.2 Customer-Module HMAC canonicalization | **RESOLVED at doc level** (FU-01): raw HTTP body = the integrator contract; sorted-key = how ABA internally builds that body — same doc section, no newer contradicting spec. Final arbiter remains the OFFLINE test vs the 2026-08-18 capture (runnable now, no rig). |
| 2 | Q4 close-transaction CANCELLED visibility vs W4-1 | **UNRESOLVED — worse.** FU-15 re-asserted the doc claim ("expect CANCELLED, possibly via pending-closed"); FU-04's state vocabulary and the transaction-list-2 filter enum also list Cancelled. Sandbox has never shown CLOSED/CANCELLED in any read API. Live-reconciliation only; keep the local `closed` flag contract. |
| 3 | Q18.6 removal callbacks + get-token-details status map vs AOF-14 | **UNRESOLVED — testable.** Bot claims status-change callbacks target the PROFILE-level CoF URL (portal-configured). Re-test = unlink cycle with a receiver on that URL; also re-check the doc status map (0/1/2) vs observed stuck-at-1. |
| 4 | Q10/Q48 lifetime unit (bot minutes vs sandbox seconds) | **RE-SCOPED — mostly dissolves.** Our own constants already model TWO domains: generate-qr = SECONDS (min 180 s, sandbox-pinned), checkout/purchase = MINUTES (min 3, error 69, max 43,200 min = 30 days). The bot's minutes quotes match the checkout/purchase domain; our probes hit generate-qr. Residual asks: (a) official confirmation that generate-qr takes seconds, (b) 120-day max (QR OpenAPI spec) vs 30-day max (checkout error-69 hint + bot's 43,200-minute example) discrepancy, (c) the bot conflating QR-on-invoice/QR-on-API/Soundbox products into one answer. Do NOT "fix" the coded split. |
| 5 | Q49/Q51 settlement currency vs 2026-09-12 relay | **RESOLVED** (FU-06): single settlement currency per profile is the documented default; dual = separate MIDs/profiles or a specially enabled dual-currency setup. Reconciles the relay. |
| 6 | Q33 server-side link-expiry enforcement vs §22 | **RESOLVED directionally** (FU-14): docs = production intent ("requests after expiry must be rejected"; no code/UI/status documented); sandbox OPEN+working-form = sandbox-defective per the bot. Keep merchant-side enforcement coded. |
| 7 | T-34 "ONE callback URL per profile" vs live per-request evidence | **RESOLVED** (FU-02): the single-URL rule is Customer Module-only (bot corrected itself); Purchase = profile-level static webhook OR per-request return_url; Link Account = per-request documented. See new contradiction #9 below for the production-webhook half. |

## 2. NEW contradictions/questions created by the FU round

> **Third-round grades (TR-01…TR-10, see answers/ANSWERS.md addendum):** #1 RESOLVED (numeric 0 is
> the canonical webhook JSON; "Completed" = plugin/order-status-mapping vocabulary). #2 RESOLVED
> (production self-registered merchants: team cannot update callback URLs — per-transaction
> return_url is the contract; static webhook is a sandbox/test concept). #3 PARTIAL (check-transaction
> returns BOTH `payment_status_code` numeric AND `payment_status` word; success = 0 AND 'APPROVED';
> 7→'CANCELLED' now documented as observable → Q4 conflict sharpened, live-reconciliation only;
> DECLINED is the bot-spec spelling but our sandbox shows DECLINDED — keep accepting both). #4 the
> bot RE-ASSERTS the base64 sentence with a quote — contradicted by our live plain-URL callbacks;
> keep plain, escalate the doc sentence. #5 (lifetime) the bot re-asserts minutes and calls our
> sandbox floor an environment defect; also says NO 120-day figure exists in its docs; QR-on-invoice
> = non-expiring until paid; Soundbox not in KB; new nuance: a gateway-configured short (~3 min)
> expiry for API-generated QRs coexists with the ~30-day default — never rely on the default.

1. **Pushback success status: "Completed" (string) vs numeric `0`.** FU-04 quotes a doc saying the
   success status is `Completed` and "cannot be changed from gateway side", while the canonical
   examples (and our §22/T-19 live captures) show numeric `0`. Three-way mismatch. Action: keep
   numeric 0 as the live contract; file the wording with ABA (probably different docs describing
   different products — same disease as #4 above).
2. **Production profile-level webhook for Purchase.** FU-02 says docs describe a "PayWay-managed
   static webhook" as a Purchase callback OPTION, but the 2026-09-12 relay said the team does NOT
   update production callback URLs and production should use per-request `return_url`. Is a
   production profile webhook actually provisionable, or sandbox/integration-only? Human channel.
3. **Status-vocabulary split.** The bot freely uses word statuses (Created / Pending / Approved /
   Declined / Refunded / Cancelled) plus `payment_status_code` numerics (0/2/3/4/7) plus filter
   enums listing CANCELLED — while the gateway has never shown us a Cancelled/Closed transaction
   status. Feeds the Q4 family; ask ABA for ONE canonical enum with exact casing per endpoint.
4. **`return_url` base64 claim (FU-02).** Bot: Link Account docs say `return_url` must be
   Base64-encoded before submission. Our live AOF cycle delivered callbacks to a PLAIN callback_url,
   and our SDK base64-encodes only `items`/`payout`/`custom_fields`/`return_deeplink`. Likely the
   bot conflated `return_url` with `return_deeplink` (which we DO encode). Verify against the live
   Apidog page before changing anything; do not encode callback_url on the bot's word.

## 3. Register items still open (by owner)

**Runnable offline by us (no ABA needed):**
- Q35.2 final arbiter: replay both canonicalizations against the 2026-08-18 Customer-Module capture.
- Q41 re-probe: MIT charges with `MITU_FLEX` / `MITR_FIX` only (old 105 probes used non-existent
  flags). If 105 persists on valid flags → genuine enablement blocker for ec476910.
- Q18.6 re-test: unlink cycle with receiver on the portal-configured CoF URL + status-map re-check
  (needs the human at the phone for the ABA Mobile unlink, as AOF-14 did).
- `tokenExpiryStatus` code check: implement/verify the ROLLING 90-day rule (latest of
  link/renew/last-successful-transaction) for CITI_FLEX/CITO_FLEX (Q3.1, FU context).
- Optional lifetime probe (`--lifetime 4` on generate-qr) to pin the seconds reading empirically —
  nice-to-have now that the two-domain reading explains the conflict.

**Integration Team (human channel):**
- Q9.1/Q27: exact production duplicate-tran_id code + why sandbox accepts-but-unpayables.
- Q10.1/10.2: generate-qr duplicate behavior; lifetime max (120 d vs 30 d vs none); QR-domain unit.
- Q3.2/Q3.4: 90-day boundary timezone; expired-but-not-removed charge error code (FU-07 re-confirmed
  undocumented).
- Q18.5: CoF token-callback HMAC canonicalization (19 failed orderings + bot negative stand).
- Q21 (PTL132 vs 96), Q33 (PTL04/05/99/132 map; pushback_url presence; min expiry offset; EXPIRED
  status field), Q37 (void production path/signing; paid-link voidability; PTL188; in-flight
  payments), Q19 (payout placement in payment-link responses), Q13 (payee format;
  complete-with-payout provisioning on ec476910), Q22 (subscription HMAC order doc fix + profile
  enablement), Q24.1–2 (mc-ref sandbox 404 classification), Q42 (expire_in intended window),
  Q4/Q28 production parity (live reconciliation), Q20/Q46 (pushback "Completed" wording; per-product
  canonical callback strings), Q12 (hash-order freeze/production parity).
- NEW: pushback success-status wording (#2.1); production profile-webhook availability (#2.2);
  canonical status enum casing (#2.3); `return_url` base64 claim (#2.4); status filter enum listing
  CANCELLED while no read API ever reports it.

**Infra/Ops:** Q7.1/Q17/Q39 (sandbox TLS chain intent + published chain; cipher matrix); rate-limit
numbers beyond KHQR 10/s-per-MID (our working numbers still unconfirmed); 429 transport-body schema
(FU-10: business-level 429-in-200 documented; transport 429 body undocumented).

**Compliance/Sales/Legal/Product owners (unchanged):** N9 PCI/SAQ; N11 SLA/status page; Google Pay
current status (docs say unavailable); per-method currency/fee matrix; go-live per-method counts;
asset redistribution go/no-go; Q50 locale list + label config mechanism; Q55 POS/ECR contract, Mini
Apps, per-product UAT; Q44 mandatory-case matrix.

## 4. Sub-items NEVER asked (candidates for a third mini-round)

> **DONE 2026-10-03 — asked as third-round TR-01…TR-10 (`../THIRD-ROUND.md`, answers inline; addendum
> in answers/ANSWERS.md).** Outcomes: #1 (amount basis) — `amount` = Total_Amount after discount,
> hash over it, original in Original_Amount (quoted); zero/omitted amounts undocumented; FX
> timing/rounding still open. #2 (migration/rollback) — negative: replacement pattern, no parallel
> keys, no rollback; notification = share a production transaction ID. #3 (concurrent refunds) —
> undocumented, serialize merchant-side; no per-scheme matrix; NBC not in KB (Compliance). #4
> (payout recovery) — pre-debit validation all-or-nothing documented; post-debit partial failure,
> per-leg IDs, source-debit report all undocumented. #5 (simulator) — links project-specific;
> accounts max 2/merchant, 90-day hard expiry, not extendable; no declines/timeouts via simulator
> (use sandbox test cards); cancel-mid-flow = abandonment → pending → expired. #6 (lifetime table) —
> partial: bot re-asserts minutes for generate-qr (calls our sandbox floor an environment defect),
> QR-on-invoice non-expiring until paid, Soundbox not in KB, no 120-day figure in its docs, and a
> gateway-short-expiry (~3 min) note contradicting the ~30-day default — never rely on defaults.

1. Q48 remainder: zero/optional amounts; discount-vs-payable-vs-original amount basis; FX rounding
   per endpoint (T-25 covered format/scale only).
2. Q49 remainder: credential migration/rollback procedure.
3. Q53 remainder: concurrent refunds, issuer-specific and NBC-rule behavior on refunds/pre-auth.
4. Q54 remainder: partial payout-failure recovery (some beneficiaries credited, some not) +
   source-debit evidence/report names.
5. Q50 fixture freshness: simulator links/builds/accounts rotate — current URLs + reset/expiry rules.
6. NEW: per-product lifetime/unit/disambiguation table (purchase generate-qr vs QR-on-API vs
   QR-on-invoice vs Soundbox request-qr) — the single root cause of contradictions #4 and the
   ~15-min vs ~30-day default muddle.

## 5. Codification candidates captured by the FU round (user-gated, docs + registry + skills)

- Error registry adds: PTL37 (refund > original), PTL147 (payout currency mismatch), PTL171/PTL175
  (stale credentials after rotation), PTL187 (refund below minimum), `status.code 6` (domain not
  whitelisted, HTTP 403), code 11 (sandbox >30-day window), portal 1020.
- Contracts: multiple partial refunds EXPLICIT (until total refunded); pushback fires ONLY on
  success (silence on failure; ~15 s webview wait-then-treat-as-failed pattern); dual 429 surfaces
  + 1-minute cooldown hint; key rotation = zero-overlap cut-over (old key dies with PTL171/175);
  no wildcard domains; scheduled CoF tokens = explicit `expired_at`, no inactivity rule, no sandbox
  cycle accelerator; check-transaction = 7-day window; multi-pushback idempotency.
- Docs/09: rolling 90-day token expiry; merchant-owned billing schedule; consent/retention rules.
- docs/16: callback source IPs 103.108.218.76/.2 (or /24); whitelisting procedure + verification.
- docs/12: KHQR 10 req/s per MID; amount formats (USD 2-dp string / KHR integer); tran_id ≤ 20
  (`^[A-Za-z0-9-]{1,20}$` recommended); req_time YYYYMMDDhhmmss.
- RELEASE-READINESS: ~72 h onboarding credential TTLs; digitalsupport@ababank.com incident path;
  UI re-review rule; sign-off evidence checklist.

## 6. Recommended order of execution

1. Offline Q35.2 canonicalization test vs the 2026-08-18 capture (closes the only self-closable
   contradiction).
2. Q41 MIT re-probe with valid flags (invalidates or confirms the 105-enablement blocker).
3. tokenExpiryStatus rolling-expiry code check (+ tests).
4. Q18.6 unlink re-test on the portal-configured CoF URL (needs the phone).
5. Third mini Telegram round: the 6 never-asked items in §4 (bot-answerable, doc-shaped).
6. Register propagation + docs/registry/skills codification (single user-gated commit).
