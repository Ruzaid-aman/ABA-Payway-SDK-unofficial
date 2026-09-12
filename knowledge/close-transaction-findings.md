# Close Transaction API — Sandbox Violation Dossier

**Date:** 2026-08-25 · **Environment:** `checkout-sandbox.payway.com.kh` · **Merchant:** `ec476910`
**Status:** Open — escalation to ABA prepared · **Re-validation checklist included (§7)**

> Purpose: complete, reproducible evidence that the sandbox Close Transaction API does
> not enforce the documented contract, plus everything a future agent needs to (a) brief
> ABA, (b) re-validate after a fix, and (c) keep merchant integrations safe meanwhile.
> Companion knowledge: SANDBOX-FINDINGS §10–§12.

---

## 1. The documented contract

From <https://developer.payway.com.kh/close-transaction-14530822e0>
(emphasis ours):

> "If your business handles transactions that may require cancellation … you can use
> the Close Transaction API to cancel a transaction before payment completes.
> **Once a transaction is closed, it will no longer accept payment: any incoming
> payment will be rejected or reversed, and no payment notification (callback) will
> be sent to the merchant."

Documented response codes: `00` Success · `1` Wrong Hash · `5` Transaction not found ·
`26` Invalid merchant profile. (No "already closed" code is defined.)

## 2. Observed reality (channel-dependent!)

### 2a. Hosted CARD page — close NOT enforced (two live violations)

Both cases: card checkout created via the official web integration
(`createTransaction` local payload → form POST → `checkout2-0.js` page),
transaction closed via `POST /api/payment-gateway/v1/payments/close-transaction`
receiving **code 00 "Success!"**, then the customer completed payment on the
still-open checkout page.

| # | Transaction | Amount | Closed while | Payment | Final status |
|---|---|---|---|---|---|
| 1 | `PAY8skk3vbbi` | USD 7.77 | PENDING (code 00 accepted) | Mastercard \*6777 (ONUS) @ 22:00:50 | **APPROVED** (`apv 639707`, bank_ref `639707`) |
| 2 | `PAY8t4x1ozl9` | USD 7.77 | PENDING (code 00 accepted ~30s after create) | VISA \*0206 (ONUS) @ 22:18:16 | **APPROVED** (`apv 259671`, bank_ref `259671`) |

Case 2 detail (`transaction-detail`, verbatim operations history):

```json
"transaction_operations": [
  { "status": "Create Order", "amount": 7.77, "transaction_date": "2026-08-25 22:16:39" },
  { "status": "Completed",    "amount": 7.77, "transaction_date": "2026-08-25 22:18:16" }
]
```

No cancellation/reversal operation appears between them, no callback-related
flag differs, and funds state is a normal approval. Case 1's history is identical
in shape (`Create Order` 22:00:17 → `Completed` 22:00:50).

### 2b. KHQR scan channel — close IS enforced (one live observation)

`PAY8vgeeljbs` (USD 55.89 online QR, 600s lifetime) was closed with code 00
while PENDING; the customer then attempted payment by scanning the QR in ABA
Mobile → **payment rejected**. Afterwards check/detail still show plain PENDING:
no `apv`, no `bank_ref`, `payment_amount: 0`, `transaction_operations: []`.

### 2c. Working hypothesis

Enforcement is **per-channel**: KHQR apps re-validate transaction state
server-side at pay time (correctly refusing closed txns), while the hosted card
page carries a **checkout session issued before the close** that the gateway
accepts without re-validation. If confirmed, the merchant risk is specifically
**stale pre-rendered card/hosted sessions**, not the QR channel. Single sample
on the QR side — re-verify alongside ABA (see §7).

## 3. Secondary findings around closure

1. **Closure is invisible in every read API.**
   - `check-transaction`: closed-unpaid → `payment_status: "PENDING"` forever; never CANCELLED.
   - `transaction-detail`: no CLOSED/CANCELLED status exists anywhere; unpaid txns report
     `"PENDING"` with **empty** `transaction_operations`.
   - Therefore "verify closure with check-transaction" (a natural expectation) is impossible.
2. **Close is idempotent in sandbox**: re-closing an already-closed txn returns code 00
   again (`PAY8s4d0w4bt`). Docs define no already-closed code — production behavior unknown.
3. **Close response shape** (verbatim): `{"status":{"code":"00","message":"Success!","tran_id":"…"}}`.
4. **Unknown tran_id on close** → HTTP 403 with numeric internal code `5`
   ("Transaction not found") — distinct from check/detail, which answer HTTP 200 +
   `status.code 6` for unknown IDs.
5. Unpaid `transaction-detail` rows have unreliable fields: `original_currency` reported
   `"KHR"` for a USD-created txn, `payment_amount: 0`, `payment_currency: ""`,
   `payment_type: "N/A"`, empty ops array (`PAY8tqwgxbnj`, USD 49.34).

## 4. Reproduction (5 minutes, all tooling in-repo)

```bash
# Terminal 1: creates a cards checkout, opens dual-mode page (modal/hosted),
# waits for server-side creation, CLOSES it, prints interpretation table.
npx tsx scripts/checkout-cards-close.ts            # default $7.77
#   -> use --no-close to keep it open instead

# Terminal 2 (after paying on the still-open page from Terminal 1):
npx tsx scripts/close-transaction-verify.ts <txId> --status-only
#   -> expect APPROVED despite the earlier code-00 close
```

Reusable helpers exported by `scripts/close-transaction-verify.ts`:
`closeOrReport(payway, txId)` · `statusOf(payway, txId)` · `closeAndVerify(...)`.

Evidence artifacts: `test-output/<txId>-create-response.json`, `<txId>-lifecycle.json`,
and probe dossier `test-output/txn-detail-probe.json`.

## 5. Questions for ABA

1. Is post-close **rejection or reversal** enforced in PRODUCTION, per channel?
   Sandbox data: KHQR channel rejects closed txns; hosted card sessions do not
   (two approvals). Which behavior is production-intended for each channel?
2. Why is there **no CLOSED status** in check-transaction / transaction-detail?
   Merchants cannot reconcile closures remotely; a `CLOSED` value (or operation entry)
   is needed.
3. Should closing an already-closed transaction return `00` again (current sandbox
   behavior), or a dedicated code?
4. When a closed transaction is paid anyway (as observed), what is the intended end
   state — auto-reverse? Who initiates the refund if reversal never happens?
5. Does the pre-rendered checkout session/token survive close by design (stale-page
   acceptance), or should the gateway re-validate transaction state at submit time?

## 6. Merchant mitigation until clarified (encoded in SDK docs/skills)

- Treat `closeTransaction` as **advisory only**: keep an authoritative local
  `closed` flag; never infer state from PayWay reads.
- Watch webhooks + poll check-transaction for **late APPROVED after close** →
  route to refund path immediately.
- KHQR/QR channel appears safe post-close (sandbox rejects); the risk
  concentrates in **pre-rendered hosted/card sessions** — discard/refresh such
  pages server-side after close instead of relying on the close call.
- Never fulfill orders off close semantics; fulfill only on verified APPROVED
  webhook/callback signature.

## 7. Post-fix validation checklist (run when ABA ships a change)

- [ ] Create cards checkout → close (code 00) → pay on same open page →
      **expect rejection at submit or auto-reversal**; status must NOT become APPROVED.
- [ ] Same but page opened AFTER close (fresh session) → submit must fail.
- [ ] Closed-unpaid txn must surface closure somewhere: new `CLOSED` payment_status,
      operation-history entry, or dedicated lookup.
- [ ] Re-close already-closed: confirm intended semantics (idempotent 00 vs error code).
- [ ] Confirm whether callback is truly suppressed for late payments (docs promise).
- [ ] Re-run `scripts/checkout-cards-close.ts` + `scripts/close-transaction-verify.ts`
      end-to-end and record outcomes here.

---

## 8. Other session learnings (context, 2026-08-25)

These are fully documented in SANDBOX-FINDINGS §10–§11
and the skills; summarized so a future agent has one place to start:

- **Online QR** (`qr.generateQr`): lifetime is seconds (SDK converts to minutes, min 3);
  `$31.11 → APPROVED` on poll #8 (~37s). Poller now yields `NOT_FOUND` during the
  post-create grace period without burning the consecutive-error budget.
- **Hosted checkout link**: JSON Create Transaction needs `paymentGate: 0` +
  `viewType: 'hosted_view'` (+ `abapay_khqr_deeplink`) to return `checkout_qr_url`;
  `$12.12 → APPROVED` ~32s (one code-6 grace poll first).
- **Cards matrix**: `cards` without gate (or gate 1) returns KHQR JSON regardless;
  `cards`+gate 0 returns the hosted page HTML itself. Saved copies are unrenderable
  offline (relative `/_nuxt/*` assets) — always use the plugin/modal flow.
- **Modal race**: wait for deferred `checkout2-0.js` before `AbaPayway.checkout()`;
  the generated page offers modal + hosted buttons explicitly.
- **Rate limits**: strict caps return HTTP **403** with NUMERIC body `status.code 429`
  ("Rate limit exceeded…"), no headers. SDK maps to typed retryable
  `PayWayRateLimitError` with window-aware pacing; `onThrottle` hook added;
  `transaction-detail --wait <s>` handles the ~5s detail-indexing lag (check sees txns <1s).
- **Latency**: check ≈ detail ≈ 130–750ms warm; unknown IDs → HTTP 200 `status.code 6`
  on both endpoints.

---

## 9. Re-confirmation pass — KHQR-channel enforcement repeatable (2026-09-05, user-driven ABA Simulator)

Two more KHQR-channel observations upgrading §2b from "single sample" to
**three consistent observations** (§2c per-channel hypothesis now
well-supported):

| # | Transaction | Amount | Sequence | Outcome |
|---|---|---|---|---|
| 1 | `qrmtoaywyqb13a72` | USD 33.12 (900 s) | PENDING → close code 00 → user scanned ~1 min later (~8 min before natural expiry) | **App refused: "transaction expired"** — API stayed PENDING, no CLOSED status, `transaction_operations: []` |
| 2 | `qrmretest02usd` | USD 0.75 (900 s) | PENDING → close code 00 → user scanned ~1 min later (controlled retest) | **App refused: "transaction expired"** again — repeatable |

Companion retest (§20, `test-output/qr-lifecycle-retest-2026-09-05.md`): the
paid sibling QR in the same window WAS list-visible while the closed-unpaid
one never appeared — §14's visibility gap is unpaid-QR-only.

Notes:
- The scan-time refusal message is the generic **"transaction expired"** —
  indistinguishable from natural lifetime expiry at scan time. Customers
  cannot tell a closed QR from an expired one.
- §2c hypothesis stands: KHQR apps re-validate transaction state server-side
  at pay time; the risk remains **stale pre-rendered hosted/card sessions**
  (§2a's two APPROVED-after-close violations, 2026-08-25).
- §7 validation checklist items remain unchecked — the card-path
  close→pay re-verification still needs a live attempt to distinguish
  "per-channel by design" from "gateway changed since August" on the hosted
  page.
