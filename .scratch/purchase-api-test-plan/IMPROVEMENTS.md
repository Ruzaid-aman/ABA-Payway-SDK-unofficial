# Campaign follow-up notes — SDK / CLI / docs / skills improvements + script reuse

> Source: the 2026-09-05 Purchase API test campaign (all waves + U1–U12).
> Evidence: `test-output/purchase-test-campaign/REPORT.md` (H1–H8, W5-1…W5-13), SANDBOX-FINDINGS §21.
> Convention (HANDOFF §5.8): everything here is a PROPOSAL — build only after user go-ahead.

---

## 1. SDK improvements

| # | Proposal | Evidence | Size / risk |
|---|---|---|---|
| S1 | **Re-scope `purchaseHosted()`**: document that its HTML renders ONLY as a browser form-POST response (Nuxt app, relative `/_nuxt/*` assets, client-side QR hydration — saved standalone it is blank). Point integrators to `getCheckoutFormHtml({ paymentGate: 0 })` as the browser route. | W5-3/W5-4 (blank file:// page; form POST renders fine) | Docs-only; alternatively an experiment: inject `<base href="{gatewayOrigin}/">` + strip `integrity` attrs so the fetched page could render standalone (needs a live test — module scripts require CORS from the asset origin; CSP nonces in the HTML are inert without the response's CSP headers). |
| S2 | **`checkout.purchase()` JSDoc: scan-validity warning** — "the requested lifetime does not extend scan validity; QRs must be scanned promptly (observed scan-refusal at 2h15m with a 24 h record lifetime)". Also surface on `PurchaseResult` as a doc comment on `qrString`. | W5-1, Q-E pending with ABA | Docs-only. |
| S3 | **Payer-currency reconciliation helper / docs** — `payment_amount`/`payment_currency` on PAID details are the payer's actual debit (can be a different currency than the request: 4000 KHR → 1 USD; 1.20 USD → 4800 KHR). Expose a typed note on the detail type + a small `describePaidAmount(detail)` style helper if wanted. | W5-6 | Small. |
| S4 | **Close-transaction guidance**: document the three-way validation (never-created → code 00 idempotent-style; PENDING → 00 no-op; paid → 403 code 2) and that closed CARD sessions may still pay. Optionally an advisory warn when `closeTransaction` is called on a tran_id that `checkTransaction` reports not-found. | W5-2, W5-8 | Advisory = small; touches validation path → pin check. |
| S5 | **Duplicate-`transactionId` advisory** — warn (strict → throw) when a purchase is created with a tran_id already used in the same process/session. Cross-process reuse is undetectable locally, so this is best-effort; the real fix is docs + Q-F. | W5-7 (accepted-but-unpayable QRs) | Small; advisory pattern exists (`strictValidation`). |
| S6 | **Detail/list type docs**: `payment_type` channel values (`ABA Pay` vs `MC`/`VISA` + `card_source ONUS`), ops split (card `[Create Order, Completed]` vs KHQR `[Completed]`), and that `detail.transaction_date` = creation while the LIST date = completion (W5-13). | W5-5, W5-13 | Docs/types comments. |

## 2. CLI improvements

| # | Proposal | Evidence | Size / risk |
|---|---|---|---|
| C1 | **`generate-checkout` should save the QR PNG in non-TTY mode** (parity with `generate-qr`: `payway-output/<tranId>.png`, `--no-open-image` default for agents). This session needed a deeplink-parse + re-render dance to get a scannable PNG. | W5-11 evidence + session nuance (deeplink `&qrcode=` extraction) | Small, high DX value. |
| C2 | **Machine-visible poll outcome**: `generate-checkout --json` should append `{poll: {attempts, elapsed_s, final_status, timed_out}}` (or exit 3 with the generate-qr-style `{event: "aborted", reason: "max_duration_exceeded"}` envelope) so agents can detect "created but not paid before timeout". Today: exit 0, create response only. | W5-11 (h1-timeout-run.log / h1-timeout-json.log) | Medium; behavior pin flip + CHANGELOG. |
| C3 | **`checkout-form --payment-gate <0\|1>`**: the form path forwards `payment_gate` (proven live — SDK-signed gate-0 forms render the real hosted page). A CLI flag would let CLI-only integrators produce the true hosted-page/card-page experience; today H2 says it's SDK-only. Keep `generate-checkout` gate-less (browser-form POST there answers HTML, no JSON to parse). | W5-4; F9 revisit | Small; documents the deliberate omission differently for the FORM command vs the API command. |
| C4 | **`transaction-detail` list-date hint**: when printing detail for a PAID txn, note that the list date column is the completion time (avoid reconciliation confusion). | W5-13 | Cosmetic; optional. |

## 3. Documentation improvements (append-only where audit rules apply)

| # | Where | What |
|---|---|---|
| D1 | `docs/03` (checkout) + `docs/07` (QR handling) | The **scan-validity window** (W5-1): requested lifetime ≠ scan validity; scan promptly; PENDING ≠ scannable; the refusal message is generic (W5-9). |
| D2 | `docs/03` | The **rendering matrix** (W5-3/W5-4/W5-12): JSON POST → JSON; gate-less form POST → raw JSON in browser; gate-0 form POST → hosted Nuxt interface (browser-POST context REQUIRED); `purchaseHosted()` HTML can't render standalone; popup plugin needs an http(s) origin; hosted-page continuation requires `continue_success_url` (W5-10), plain `return_url` doesn't redirect. |
| D3 | `docs/12` (errors/debugging) | `payment_type`/`card_source`/ops split by method (W5-5); payer-currency on `payment_amount` (W5-6); duplicate-tran_id trap (W5-7); close three-way validation (W5-2). |
| D4 | `docs/CLOSE-TRANSACTION-FINDINGS.md` (append-only addendum) | Purchase-channel three-way close validation + H7 purchase-channel confirmation (W5-8). |
| D5 | `docs/07` / transaction-list docs | W5-13 timestamp semantics (detail = creation, list = completion) — refines §18's "both UTC+7". |
| D6 | Root `AGENTS.md` canonical commands | Note `generate-checkout` non-TTY PNG gap (or fix via C1 and skip). |

## 4. Skills improvements (edit SKILL.md → bump version → re-run audit greps → re-copy to `.zcode/skills/`)

| Skill | Additions |
|---|---|
| `aba-payway-purchase` | W5-1 scan window; W5-3/W5-4 rendering matrix + `paymentGate: 0` form usage; W5-5/W5-6 field semantics; W5-7 duplicate trap; W5-10 continuation; W5-12 popup origin. Biggest single update. |
| `aba-payway-first-payment` | "Scan promptly" callout (W5-1) — first-payment guides are where the trap bites hardest. |
| `aba-payway-check-transaction` / `aba-payway-transaction-detail` | PENDING-forever semantics (W4-1) + PENDING ≠ scannable (W5-1); detail date = creation (W5-13). |
| `aba-payway-transaction-list` | List date = completion time (W5-13); unpaid purchase-channel visibility (W2-5) if not already there. |
| `aba-payway-transaction-close` | Three-way validation (W5-2) + closed-card-session caveat (W5-8). |
| `aba-payway-hash` | No change (composition untouched). |

New-skill candidate: NONE — extend `aba-payway-purchase` instead of adding a "hosted checkout" skill (avoid proliferation; the material is one coherent flow).

## 5. Script reuse review (everything produced this session)

### Reusable as-is or after light parameterization — promote to tracked `scripts/`

| Candidate | From | Reuse |
|---|---|---|
| `scripts/create-scan-target.ts` (proposed merge of `wave5-u1b-create.ts` + the probe half of `wave5-scan-window-probe.ts`) | per-step fresh creation + QR PNG render + `created_utc` log | ANY future interactive campaign: create-then-scan is now the required pattern (W5-1). Parameterize: `--tran-id --amount --currency --option --lifetime --return-url`. |
| `scripts/checkout-form-builder.ts` (proposed merge of `wave5-u2-form-create.ts` + `wave5-u2-gate0-form.ts` + `wave5-dupprobe-form.ts`) | SDK `getCheckoutFormHtml` wrapper: plain / gate-0 / popup, auto-submit, return_params, arbitrary existing tran_id | Generating ANY local signed checkout form for browser testing (hosted view, popup, error-path, state probes). Local, no network. (Or supersede entirely by CLI C3.) |
| `scripts/txn-state-sweep.ts` (from `wave4-e2-liveness.ts`, drop the E-2 section) | paced check+detail sweep over an ID list → JSON summary | Pre-session liveness, post-session reconciliation, watching async approvals. |
| `scripts/qr-from-deeplink.ts` (from the inline `node -e` extraction used on `h1-poll-run.log`) | extract `&qrcode=` → decode → render PNG | Any CLI-created checkout needs a scannable PNG before C1 ships. |
| `wave234-prep-sdk.ts` `saveQr()` + `create()` helpers | the pattern inside | The two utilities above absorb it; keep as reference. |

### Campaign one-offs — keep in `.scratch/purchase-api-test-plan/` as reference, do NOT promote

- `wave5-scan-window-probe.ts` (the aged/fresh A|B design is campaign-specific), `wave5-card-legs.ts` (multi-artifact batch incl. the H7 close-then-form sequence — the PATTERN is documented in WAVE5-captures), `wave5-u12-fresh.ts` (dup pair), `wave1-r1-sdk.ts`, `wave2-gate-probe.ts`, `wave3-h7-closed-card.ts`, `w212-list-window-probe.ts`, `close-all.ts`.
- **Superseded:** `wave5-u2-create.ts` (server-side `purchaseHosted()` page save) — W5-3 makes standalone-saved hosted pages a dead end; kept only as evidence generator. `purchaseHosted()` itself remains useful for server-side page fetch/proxy scenarios, but the form route is the browser answer (S1).

### Technique snippets worth remembering (captured in WAVE5-captures "Session nuances")

- Deeplink → QR payload extraction (`qrcode=` param, `+ → space`, `decodeURIComponent`).
- `decode-khqr.cjs` string mode for TLV forensics on gateway qrStrings (no image deps needed).
- CLI JSON evidence parsing from the first `{` (Using-profile line).
- Detail-field extraction one-liners (throwaway; superseded by `--json` + jq-style node snippets).

## 6. Proposed build order (when user green-lights)

1. C1 (CLI PNG) + C2 (poll outcome) — highest DX value, small.
2. Docs D1–D5 (append-only) — cheap, prevents the W5-1 merchant trap.
3. Skills updates (table above) — one `docs(skills)` batch + audit greps + `.zcode/skills` re-copy.
4. Promote the four reusable scripts to `scripts/` (with tests where they wrap SDK calls).
5. S1 experiment (base-href injection) behind a live probe; S3–S6 as doc/type polish.
6. E-7 retest with a real receiver; E-6 `skip_success_page 1` variant; W5-12 retest from http origin (queued in REPORT.md §6).
