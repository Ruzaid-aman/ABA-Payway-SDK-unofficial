# Purchase API Test Plan — KHQR & Card Payments (SDK · CLI · Webpage Checkout)

**Version:** 1.0 · **Date:** 2026-09-05 · **Status:** PLAN (not yet executed)
**Scope gate:** Purchase API only (`POST /api/payment-gateway/v1/payments/purchase`, SDK `checkout.purchase()` / `createTransaction()` / `getCheckoutFormHtml()`, CLI `generate-checkout` / `checkout-form`). **Deeplink payment execution is explicitly out of scope** (separate later phase).
**Executor model:** agent runs all programmatic steps; **[USER] steps** (QR scan in ABA Simulator, sandbox card entry) are marked and must be timed within QR/checkout lifetimes.

---

## 0. What we already know (do NOT re-probe — build on this)

These are pinned sandbox facts (SANDBOX-FINDINGS §17–§20, CLOSE-TRANSACTION-FINDINGS §2/§9, live 2026-08-25 → 2026-09-05). The plan is designed to extend them into the Purchase/Card/CLI corners we have NOT yet touched:

| # | Established fact | Source |
|---|---|---|
| F1 | Purchase hash signs `ctid` after `items` (27-field order); plain purchases byte-identical | §17 |
| F2 | Subscription trio passes hash but answers `104` — profile not subscription-enabled (blocked) | §17 |
| F3 | Full paid QR lifecycle: create → scan (~60–90 s) → APPROVED <1 s → list-visible → partial refund → status REFUNDED (coarse), `refund_amount` authoritative | §18/§20 |
| F4 | `transaction-list`/detail timestamps are **UTC+7**; UTC-derived windows silently return 0 rows | §18 |
| F5 | Unpaid **QR-only** transactions are list-invisible; paid ones visible; unpaid **checkout-path** transactions visible | §14/§20 |
| F6 | Close: no CLOSED status in any read API; KHQR channel enforced at scan ("transaction expired" ×3); **hosted-card sessions accepted payment after close (×2, 2026-08-25)** | dossier §2/§9 |
| F7 | Unpaid detail: `original_currency` = credential currency (KHR), `payment_amount` 0, empty ops; paid: real values | §19/§20 |
| F8 | **Cards matrix (2026-08-25):** `cards` without `payment_gate` (or gate 1) → KHQR-style JSON regardless; `cards` + `paymentGate: 0` + `viewType: 'hosted_view'` → hosted page HTML/URL | dossier §8 |
| F9 | `payment_gate` is deliberately **SDK-only** — no CLI flag; CLI has `--view-type` and the local `checkout-form` command (`--popup` = AbaPayway plugin) | code |
| F10 | Duplicate `tran_id` silently accepted on purchase (QR path verified 2026-08-30); lifetime is MINUTES here (min 3, max 43200; error 69 below 3 — locally enforced) | §8/§13 |
| F11 | CLI `generate-checkout` **polls by default** (600 s timeout); SDK `purchase()` returns immediately | code |
| F12 | Exit codes (CLI): 0 success/pending · 1 local validation · 2 API failure · 3 network/timeout; `--json` error envelopes exist only on `check-transaction`/`transaction-detail` so far | T6/T3.5 |

**Universe of Purchase flows under test** — four routes, two payment methods:

| Route | Mechanism | Card capable? | KHQR capable? |
|---|---|---|---|
| **R1. SDK JSON POST** | `payway.checkout.purchase()` (application/json) | only for JSON responses (see F8: returns QR JSON!) | ✅ (`abapay_khqr`) |
| **R2. SDK webpage checkout** | `purchase({ paymentGate: 0, viewType: 'hosted_view' })` → `checkout_qr_url` page, **or** `getCheckoutFormHtml()` local form → browser POST | ✅ hosted card page | ✅ QR displayed on hosted page |
| **R3. CLI command** | `payway-sdk generate-checkout` | JSON only (no gate flag — F9) | ✅ |
| **R4. CLI webpage checkout** | `payway-sdk checkout-form` → local signed HTML → browser POST (plain or `--popup` plugin) | ✅ | ✅ |

> **Terminology guard:** `generate-qr` (CLI/SDK) is the **QR API** (`/generate-qr` endpoint) — NOT the Purchase API. It is out of scope except as a behavioral contrast reference already covered by §18/§20.

---

## 1. Objectives & divergence hypotheses

Primary question: **do transactions created through the same Purchase API behave/represent differently depending on creation route (SDK JSON vs SDK webpage vs CLI command vs CLI webpage) and payment method (KHQR vs card)?** Explicit hypotheses to confirm or refute:

| ID | Hypothesis | How the plan tests it |
|---|---|---|
| H1 | CLI `generate-checkout` blocks and polls by default (F11) while SDK `purchase()` returns immediately — different "completion" semantics for the same API call | A-CLI-1 vs A-SDK-1 timing + output shape |
| H2 | The hosted **card** page is unreachable via CLI commands (F9) — card webpage checkout exists only via SDK gate-0 flow or CLI `checkout-form` local form | C- routes: attempt card flow from every route, record what each returns |
| H3 | `generate-checkout --payment-option cards` (no gate) returns a **KHQR-style** payload (F8) — scanning that QR with the simulator pays from the **bank account**, not a card: the QR may not "know" its option. ⚠️ Could confuse "card payment" tests | C-CLI-1 + [USER] scan of a cards-option QR |
| H4 | Same endpoint, different media negotiation: SDK JSON POST → JSON body; browser form POST → HTML page. Errors therefore surface differently (typed exception vs HTML/redirect) | A/C-SDK-1 vs A/C-R2/R4 first-response capture |
| H5 | **List visibility may be channel-dependent while unpaid** (F5 verified unpaid-invisible for QR-channel only; card-channel unpaid transactions were never checked in the list) | Every scenario snapshots the list pre-payment |
| H6 | Error surfaces differ: SDK typed `PayWay*Error` classes vs CLI exit codes + human block (no `--json` envelope on `generate-checkout` yet — T5.4 gap) | D- scenarios run on both routes, compare |
| H7 | Close-then-pay behavior differs by channel as established (F6); a **card-page close→pay retest** (dossier §7 checklist item) distinguishes "per-channel by design" from "gateway changed" | C-EDGE-3 [USER] |
| H8 | Transaction ID auto-generation (CLI `ck…`) vs caller-supplied IDs (SDK) changes nothing downstream — verify with identical lifecycle snapshots | A-SDK-2 vs A-CLI-2 |

---

## 2. Scenario catalog

Conventions: `payment_option` for KHQR scenarios is **`abapay_khqr`** (pure KHQR — keeps deeplink out of scope; note `abapay_khqr_deeplink` responses also carry deeplink fields which we record but never execute). Card scenarios use **`cards`**. Default currency USD; every scenario has a KHR mirror variant marked (M-KHR) run once per route-family, not per scenario.

### A. KHQR positive lifecycle (per route: R1, R3, R4; R2 as one webpage variant)

| ID | Scenario | Steps |
|---|---|---|
| A-SDK-1 | SDK JSON purchase → scan | `purchase({transactionId, amount 2.22, currency USD, paymentOption 'abapay_khqr', returnUrl, lifetime 10})` → capture response fields (`qrString`, `qrImage`, `abapay_deeplink` presence — record only) → **[USER] scan** → verify |
| A-SDK-2 | Same but **caller-supplied memorable ID** (`e2ekhqr-sdk-001`) vs CLI's auto ID → H8 | as A-SDK-1 with fixed ID |
| A-R2-1 | **Webpage KHQR**: `purchase({paymentGate: 0, viewType: 'hosted_view', paymentOption 'abapay_khqr'})` → open `checkout_qr_url` in browser → **[USER] scans the QR displayed on the hosted page** | verify page renders QR; payment lands; return_url redirect observed |
| A-R3-1 | CLI command purchase: `generate-checkout -a 3.33 -c USD --payment-option abapay_khqr --return-url … --lifetime 10 --no-polling` → capture stdout (QR string render, PNG path, JSON mode) → **[USER] scan** | record exit code, output sections, `--json` shape |
| A-R3-2 | CLI **with default polling**: same as A-R3-1 without `--no-polling`, user scans during the poll → verify it exits 0 on APPROVED and what it prints (H1) | timing evidence |
| A-R4-1 | CLI webpage checkout: `checkout-form -a 4.44 -c USD --payment-option abapay_khqr --return-url … -o form.html` → open in browser (auto-submit) → what does the gateway render for a form-POST KHQR purchase? → **[USER] scans whatever QR the page shows** | capture page behavior — H4 |
| A-KHR | (M-KHR) One KHR mirror: `generate-checkout -a 4000 -c KHR --payment-option abapay_khqr` → **[USER] scan** | KHR integer formatting; list/detail currency |

### B. Card positive lifecycle (routes R2, R4; R1/R3 as negative-coverage per H3)

| ID | Scenario | Steps |
|---|---|---|
| C-R2-1 | **SDK hosted card page**: `purchase({paymentOption 'cards', paymentGate: 0, viewType: 'hosted_view', returnUrl})` → open returned page → **[USER] enters sandbox card details** → success page → verify return redirect | the canonical card flow |
| C-R2-2 | SDK **popup plugin** card flow: `getCheckoutFormHtml({popupMode: true, paymentOption 'cards'})` → open page → **[USER] pays in the plugin modal** | the 2026-08-25 verified pattern |
| C-R4-1 | CLI webpage card checkout: `checkout-form --payment-option cards -o card-form.html` (plain submit, no popup) → open → **[USER] pays** → what page appears? | H4/H2 |
| C-R4-2 | Same via `--popup` (plugin) from the CLI form | parity with C-R2-2 |
| C-CLI-1 | CLI command `generate-checkout --payment-option cards` (no gate possible) → capture payload → **[USER] scans the returned QR with the simulator** → does it pay from bank (KHQR behavior) or fail? | H3 — the cards-matrix follow-up |
| C-R1-1 | SDK JSON `purchase({paymentOption 'cards'})` (no gate) → confirm F8 (QR JSON, not card page) — record only, no payment | F8 re-pin on today's gateway |

### C. Transaction-state verification matrix (run for EVERY A/B scenario at each phase)

| Phase | Checks (capture all) |
|---|---|
| **P0 pre-creation** | `check-transaction` → expect code 6 exit 2 |
| **P1 created (unpaid)** | `check-transaction` → PENDING (grace code 6 possible); `transaction-detail` (~5 s) → `payment_amount` 0, `original_currency` **KHR quirk** (F7), empty ops; `transaction-list` (gateway day, no dates) → **visible or not? per channel — H5** |
| **P2 during payment** | (KHQR) check while awaiting scan → PENDING; (card) check while user is on the page → PENDING |
| **P3 paid** | check → APPROVED <1 s; detail → `payment_amount`, `apv`, `bank_ref`, `payment_type` (ABA Pay vs card scheme name — **compare KHQR vs card values**), `original_currency` USD now, ops `Create Order → Completed`; list → visible with APPROVED; `transaction_date` UTC+7 |
| **P4 refunded (optional tail)** | partial refund (e.g. 40% of amount) → code 00; detail → status REFUNDED (coarse), `refund_amount`, ops gain refund entries |
| **P5 closed (separate txns)** | close unpaid → code 00; check/detail unchanged (PENDING); **[USER] scan/pay attempt** → KHQR: refused (F6); card: dossier §7 retest |

### D. Negative & validation scenarios (both routes SDK JSON + CLI; no payment needed unless noted)

| ID | Input | Expected |
|---|---|---|
| D-1 | amount 0 / -5 | local validation exit 1 (SDK `PayWayConfigError`) |
| D-2 | USD 3 decimals (1.999) / KHR non-integer | local rejection |
| D-3 | currency EUR | local rejection (USD/KHR only) |
| D-4 | lifetime 2 (minutes) | local exit 1 (min 3; gateway error 69 parity) |
| D-5 | lifetime 43201 | local exit 1 (max 43200) |
| D-6 | tran_id 21+ chars / spaces / symbols | local validation |
| D-7 | duplicate tran_id: create QR-1, create again same ID different amount → **[USER] scans one** → which wins? (F10 verified for QR API — is purchase the same?) | investigate |
| D-8 | missing return_url | accepted? advisory? (purchase doesn't require it — confirm) |
| D-9 | names >100 chars / items >10 entries / items >500 chars encoded | advisory warn (strict → throw); capture CLI warning text vs SDK warning |
| D-10 | subscription trio (`ctid`/`token_flag`/`frequency`) — hash now correct | expect **104** (F2) — confirm once post-fix, then drop |
| D-11 | `--payout` with wrong keys `{account, amount}` on purchase path | local advisory/shape error (purchase uses `{acc, amt}`) |
| D-12 | google_pay option without token | local throw (documented) |

### E. Boundary & edge scenarios

| ID | Scenario | Notes |
|---|---|---|
| E-1 | amount $0.01 and $100 000 (per currency caps) | one route each, no payment required beyond PENDING |
| E-2 | QR expired by lifetime: create, wait past lifetime, **[USER] scans** → app message; check/detail state after expiry (does status ever change from PENDING?) | compare with close-refusal message ambiguity (F6) |
| E-3 | double scan: **[USER] pays QR, then scans the SAME QR again** → second attempt behavior | funds-safety edge |
| E-4 | close AFTER payment: create → pay → close → what does the gateway answer? (never tested — dossier only closed PENDING txns) | new fact expected |
| E-5 | unpaid card-channel transaction lifecycle: created via C-R2-1 but never paid → list visibility (H5), detail quirk fields, eventual expiry behavior | card-channel F5/F7 check |
| E-6 | `skip_success_page` 1 vs 0 and `continue_success_url` on the card flow | **[USER]** observes redirect behavior |
| E-7 | `return_params` echo on callback/return for both channels | capture pushback shape |
| E-8 | very long `return_url` (base64 encoding path) — purchase succeeds? | local + gateway |

---

## 3. Expected state machine (reference for verdicts)

```
P0 (absent, code 6) → P1 PENDING/unpaid → [USER pays] → P3 APPROVED
                        ├→ [expires]     → still PENDING remotely (TBD E-2)
                        ├→ [close]       → code 00, still PENDING remotely;
                        │                  KHQR scan refused / card session may pay (H7)
                        └→ P3 → [refund] → status REFUNDED (coarse), refund_amount authoritative
```
There is **no CLOSED status anywhere**; verdicts must always come from check/detail/list + the local test ledger, never from a status field alone.

---

## 4. Capture template (per test — comparability contract)

Every executed scenario records one block (suggested file: `test-output/purchase-test-campaign/<TEST-ID>.md`, plus raw JSON where applicable):

```yaml
TEST-ID: A-R3-1            # from the catalog
date_utc: 2026-09-06T04:12:33Z
route: R3                  # R1 SDK-JSON | R2 SDK-webpage | R3 CLI-command | R4 CLI-webpage
method: KHQR | CARD
payment_option: abapay_khqr
params: {amount, currency, lifetime, returnUrl, tranId, extras…}
request_media: json | form-post
create_response_shape:     # field NAMES present (values redacted), per media type
  - qrString / qrImage / abapay_deeplink / checkout_qr_url / (HTML?)
exit_code: 0
cli_output_sections: [banner, params, qr-render, png-path, next-hint]  # R3/R4 only
sdk_error_class: - | PayWayBusinessError …                          # R1/R2 only
tran_id: qrm…
timestamps: {created_utc7: "YYYY-MM-DD HH:mm:ss", approved_utc7: …, scan_latency_s: …}
P1: {check: PENDING, detail_fields: [payment_amount=0, original_currency=KHR-quirk], list_visible: no}
P3: {check: APPROVED, detail_fields: [apv, bank_ref, payment_type=…, original_currency=USD], list_visible: yes, ops: [Create Order, Completed]}
payment_interaction: {actor: USER, channel: simulator-scan | card-entry, app_message: "…"}
verdict: PASS | FAIL | NEW-FACT
evidence: [file paths]
```

Rule: **the same fields for every route** — the comparison IS the field-by-field diff across blocks (e.g., `create_response_shape` between R1/R3 JSON and R2/R4 HTML; `cli_output_sections` vs `sdk_error_class`).

---

## 5. User manual steps (consolidated)

| Step | Scenario | Action | Timing constraint |
|---|---|---|---|
| U1 | A-SDK-1/A-SDK-2 | Scan SDK-created KHQR in simulator, approve | within lifetime (10 min) |
| U2 | A-R2-1 | Open hosted page, scan the QR shown **on the page** | within lifetime |
| U3 | A-R3-1/A-R3-2 | Scan CLI-created KHQR (A-R3-2: scan while the CLI is polling) | within lifetime / poll window |
| U4 | A-R4-1 | Open browser form, scan the QR the gateway renders | within lifetime |
| U5 | C-R2-1 | Open hosted card page, **enter sandbox card details**, complete payment | within lifetime |
| U6 | C-R2-2 / C-R4-2 | Pay inside the AbaPayway popup plugin modal | within lifetime |
| U7 | C-R4-1 | Pay via plain-submitted card form page | within lifetime |
| U8 | C-CLI-1 | Scan the "cards"-option QR and report what the app offers (bank payment? card? error?) | within lifetime |
| U9 | E-2 | Scan an expired QR; report exact app message | after expiry |
| U10 | E-3 | Re-scan an already-paid QR; report app behavior | after P3 |
| U11 | C-EDGE-3 (=H7) | Pay a **closed** transaction's still-open card page (dossier §7 retest) | per dossier |
| U12 | D-7 | Scan one of the duplicate-tran_id QRs | within lifetime |

For each: record the **exact app message / page behavior** (screenshot or transcription) — those strings are evidence.

---

## 6. Investigation questions (answer explicitly in the campaign report)

1. Does the scanned "cards"-option QR pay from bank or card (H3)? If bank — the cards-matrix JSON is effectively a mislabeled KHQR; document the merchant trap.
2. Is an **unpaid card-channel** transaction list-visible (H5)? — determines whether F5's "QR-only" scope is exact.
3. What does `payment_type` read for card payments vs `ABA Pay` for KHQR (scheme name? `card_source` field?) — P3 detail diff.
4. Close-after-APPROVED: accepted? error code? (E-4 — new fact either way.)
5. Do SDK JSON POST and form POST to the same endpoint return different shapes for identical params (H4)? Capture both verbatim (redacted).
6. Does CLI `generate-checkout` default polling exit 0 on APPROVED with a distinct final block (H1)? And what does it print on poll timeout (expect exit 3 + `aborted` JSON event)?
7. `return_url` redirect: does the hosted card page actually redirect the browser (observable by user) while KHQR has no browser session at all?
8. Duplicate tran_id on purchase (D-7): two live payloads, "first scan wins"? — extends F10 from QR API to Purchase API.
9. Do the unpaid-quirk fields (F7) hold on the card channel (E-5)?
10. Post-campaign: should `generate-checkout` get a `--json` error envelope (T5.4) based on observed error shapes (H6)?

---

## 7. Execution order & budget

1. **Wave 1 (KHQR, no payment):** D-1…D-12 on R1+R3 (all local/negative — ~30 calls, fast). Pins already cover some — record only deltas.
2. **Wave 2 (KHQR paid):** A-SDK-1 → A-SDK-2 → A-R3-1 → A-R3-2 → A-R4-1 → A-R2-1 → A-KHR, each with the full P0–P3(+P4) matrix. One [USER] scan each.
3. **Wave 3 (card):** C-R1-1 (record-only) → C-R2-1 → C-R2-2 → C-R4-1 → C-R4-2 → C-CLI-1 [U8] → E-5 unpaid card lifecycle.
4. **Wave 4 (edges):** E-1 → E-2 [U9] → E-3 [U10] → E-4 → E-6 → E-7 → E-8 → D-7 [U12] → C-EDGE-3/H7 [U11].
5. **Report:** fill every capture block; produce a route×method comparison table + hypothesis verdict table (H1–H8); append new facts to SANDBOX-FINDINGS (append-only); sync skills/docs if any contract changes.

Estimated sandbox calls: ~120–150 read/write (well within rate limits; purchases are PENDING-safe). Real payments: ~8 simulator scans + ~4 card entries, ≤ $15 total simulated.

**Entry criteria:** clean `main`, gates green, `.env`/profile present, simulator app ready, sandbox card credentials available, `test-output/purchase-test-campaign/` created.
**Exit criteria:** every catalog ID has a capture block with a verdict; all H1–H8 answered confirm/refute; new facts appended to SANDBOX-FINDINGS; follow-up work items (e.g., T5.4 envelope for `generate-checkout`) filed in `.scratch/`.
