# Coverage Matrix — Pass 2 (COVERAGE-CROSSCHECK)

**Spec:** `docs/archive/Default module.openapi.json` — 33 POST paths (Pass 1 spec-inventory).
**SDK:** `aba-payway-ts` v1.5.0 — 22 gateway endpoints (`src/constants.ts:6-29`, verified).
**CLI:** `src/cli.ts` — 68 leaf commands, 23 unconditional remote + 3 dual-mode (Pass 1 cli-inventory).
**Method:** Pass 1 inventories cross-checked against code; every ambiguous or contradicted claim re-verified in `src/constants.ts`, `src/domains/`, `src/cli.ts`, `src/client.ts`. Disagreements are resolved and noted in §6.

## Summary counts

| Verdict | Count | Endpoints |
|---|---|---|
| **COVERED** | 20 | 20 spec endpoints with full SDK-method + CLI-command mapping (#2-7, #14-19, #23-29, #33) |
| **PARTIAL** | 2 | #1 v1 purchase (payment_option validation gap), #21 v1 generate-qr (pre-auth has no CLI flag) |
| **SUPERSEDED-LEGACY** | 6 | legacy `/api/aof/*` v1 quartet (#8, #10, #12, #13) + v1 COF pair (#9 `cof/initial`, #11 `cof/remove`) — all superseded by implemented v3 endpoints |
| **MISSING** | 5 | #20 `request-qr` (QR for Soundbox), #22 `payment-link/void`, #30-32 online-self-activation trio (new-merchant, get-mc-credential-info, get-mc-info) |
| **Total** | **33** | 20 + 2 + 6 + 5 |

Arithmetic cross-check: 22 SDK-called endpoints + 11 not called (6 SUPERSEDED-LEGACY + 5 MISSING) = 33 spec paths, no orphans on either side (§5). The two PARTIAL endpoints named by the audit brief (QR pre-auth CLI flag; checkout payment_option validation) are exactly rows #21 and #1.

---

## 1. Matrix — all 33 spec endpoints

Verdicts: COVERED = SDK method + CLI command map the full operation. PARTIAL = exists with a notable limitation. SUPERSEDED-LEGACY = v1 predecessor of an implemented v3 endpoint. MISSING = no surface at all.

| # | Spec path | In SDK? (constant → domain method) | In CLI? (command) | Verdict | Notes |
|---|---|---|---|---|---|
| 1 | `/api/payment-gateway/v1/payments/purchase` | `ENDPOINTS.purchase` → `checkout.purchase` / `purchaseHosted`; `createTransaction`+`getCheckoutFormHtml` build the form locally | `generate-checkout`, `checkout-form` (local) | **PARTIAL** | `--payment-option` not validated against the documented enum on checkout (see §3.2); SDK advisory fires on spec-documented values `abapay`/`abapay_deeplink` (PAYMENT_OPTIONS omits them) |
| 2 | `/api/payment-gateway/v1/payments/transaction-detail` | `ENDPOINTS.getTransactionDetail` → `checkout.getTransactionDetail` | `transaction-detail`, `tx-batch detail`, refund pre-flight | **COVERED** | Full detail schema consumed; `--wait` handles the ~5s index lag |
| 3 | `/api/payment-gateway/v1/payments/close-transaction` | `ENDPOINTS.closeTransaction` → `checkout.closeTransaction` | `close-transaction`, `tx-batch close` | **COVERED** | No CLOSED read status exists anywhere — SDK keeps a local flag (documented behavior, not a gap) |
| 4 | `/api/payment-gateway/v1/payments/check-transaction-2` | `ENDPOINTS.checkTransaction` → `checkout.checkTransaction` / `pollTransactionStatus` | `check-transaction`, `poll-transaction`, `tx-batch check`, `doctor --live`, demo/first-payment | **COVERED** | The `-2` suffix is the gateway's own path name (ap-tools duplicate); SDK/CLI name map 1:1 — see §5 |
| 5 | `/api/merchant-portal/merchant-access/online-transaction/refund` | `ENDPOINTS.refund` → `checkout.refund` | `refund` | **COVERED** | RSA merchant_auth + HMAC; pre-flight balance check via transaction-detail is extra; hash `request_time.merchant_id.merchant_auth` (verified) |
| 6 | `/api/payment-gateway/v1/payments/transaction-list-2` | `ENDPOINTS.getTransactionList` → `checkout.getTransactionList` | `transaction-list` | **COVERED** | All 7 optional filters mapped; UTC+7 gateway-clock window handling documented; `-2` suffix same as #4 |
| 7 | `/api/payment-gateway/v1/exchange-rate` | `ENDPOINTS.getExchangeRate` → `checkout.getExchangeRate` | `exchange-rate`, `doctor --live` | **COVERED** | Merchant-only hash (`req_time.merchant_id`), verified at checkout.ts:668-682 |
| 8 | `/api/aof/request-qr` | — | — | **SUPERSEDED-LEGACY** | v1 account-linking QR; superseded by v3 `aof/link-account` (#14). v1-only capability: none of substance — see gap card §4.1 |
| 9 | `/api/payment-gateway/v1/cof/initial` | — | — | **SUPERSEDED-LEGACY** | v1 hosted card-link form; superseded by v3 `cof/link-card` (#15) + local `cof link-card-form`. v1-only: `return_param` echo field — see §4.2 |
| 10 | `/api/aof/remove-account` | — | — | **SUPERSEDED-LEGACY** | Superseded by v3 `token-management/remove-token` (#19) which removes account OR card tokens in one call. v3 covers fully — see §4.3 |
| 11 | `/api/payment-gateway/v1/cof/remove` | — | — | **SUPERSEDED-LEGACY** | Card-token remove; also superseded by v3 `remove-token` (#19, "Remove a linked account or card token"). v3 covers fully |
| 12 | `/api/aof/renew-expired-account` | — | — | **SUPERSEDED-LEGACY** | Superseded by v3 `token-management/renew-expired-account-token` (#17). v1-only: response `expired_in` top-level; v3 returns trace_id only — see §4.4 |
| 13 | `/api/aof/pushback-status` | — | — | **SUPERSEDED-LEGACY** | Manual token retrieval; superseded by v3 `token-management/get-token-details` (#18). v1-only: `mask_account` masked number; v3 `source_of_fund` gives the same last-4 — see §4.5 |
| 14 | `/api/payment-credential/v3/aof/link-account` | `ENDPOINTS.linkAccount` → `credentialsOnFile.linkAccount` | `cof link-account` | **COVERED** | Full v3 shape: request_id/ctid/token_flag/currency/callback_url/return_deeplink; hash order §16-verified |
| 15 | `/api/payment-credential/v3/cof/link-card` | `ENDPOINTS.linkCard` → `credentialsOnFile.linkCard` + `getLinkCardFormHtml` (local form) | `cof link-card`, `cof link-card-form` (local) | **COVERED** | SDK sends `frequency` + `continue_success_url` which the archived spec schema lacks (live-docs parity, not a gap) — see §6.2 |
| 16 | `/api/payment-gateway/v3/purchase/payment-credential` | `ENDPOINTS.payment` → `credentialsOnFile.payment` | `cof charge` | **COVERED** | All 19 non-auto fields mapped incl. purchase_type pre-auth (CLI flag exists here, cli.ts:3786) |
| 17 | `/api/payment-credential/v3/token-management/renew-expired-account-token` | `ENDPOINTS.renewToken` → `credentialsOnFile.renewToken` | `cof token renew` | **COVERED** | Account tokens only (documented); hash `ctid.request_time.pwt.merchant_id.request_id` |
| 18 | `/api/payment-credential/v3/token-management/get-token-details` | `ENDPOINTS.getTokenDetails` → `credentialsOnFile.getTokenDetails` | `cof token details` | **COVERED** | request_id-only shape enforced both SDK and CLI (gateway-verified §16) |
| 19 | `/api/payment-credential/v3/token-management/remove-token` | `ENDPOINTS.removeToken` → `credentialsOnFile.removeToken` | `cof token remove` | **COVERED** | ctid+pwt only (no request_id) — per-endpoint shape gateway-verified; removes account AND card tokens |
| 20 | `/api/payment-gateway/v1/payments/request-qr` | — | — | **MISSING** | QR for Soundbox — distinct from generate-qr (nullable amount, no template requirement, soundbox options incl. `abapay`); no v3 successor, so MISSING rather than legacy — gap card §4.6 |
| 21 | `/api/payment-gateway/v1/payments/generate-qr` | `ENDPOINTS.generateQr` → `qr.generateQr` | `generate-qr` (online) | **PARTIAL** | SDK supports `purchaseType: 'pre-auth'` (client.ts:414, in hash at qr.ts:46) but `generate-qr` has NO `--purchase-type` flag (cli.ts block 2211-2790, verified) — see §3.1 |
| 22 | `/api/merchant-portal/merchant-access/payment-link/void` | — | — | **MISSING** | No void/cancel/close on the payment-link domain or CLI (only `create`/`getDetails`, payment-link.ts; constants.ts:21-22) — gap card §4.7 |
| 23 | `/api/merchant-portal/merchant-access/payment-link/create` | `ENDPOINTS.createPaymentLink` → `paymentLink.create` | `payment-link create` | **COVERED** | Multipart image support, payout {acc,amt} total-equals-amount enforced, expiry guard ≥5min |
| 24 | `/api/merchant-portal/merchant-access/payment-link/detail` | `ENDPOINTS.getPaymentLinkDetails` → `paymentLink.getDetails` | `payment-link detail` | **COVERED** | `-i` link-id only (data.id, not merchant ref) — matches spec's `merchant_auth.id` shape |
| 25 | `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` | `ENDPOINTS.completePreAuth` → `preAuth.complete` + `preAuth.completeWithPayout` | `pre-auth complete`, `pre-auth complete-payout` | **COVERED** | Spec says payout mandatory; SDK/CLI expose both no-payout and payout variants against the same endpoint; hash `merchant_auth.request_time.merchant_id` (verified pre-auth.ts:99) |
| 26 | `/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` | `ENDPOINTS.cancelPreAuth` → `preAuth.cancel` | `pre-auth cancel` | **COVERED** | + `reason` field (SDK-only, absent from spec) — §6.2; hash `merchant_id.merchant_auth.request_time` (verified) |
| 27 | `/api/payment-gateway/v2/direct-payment/merchant/payout` | `ENDPOINTS.payout` → `payout.payout` | `payout` | **COVERED** | RSA-chunk beneficiaries {account, amount}, sum-to-total enforced; 40-error-code map + whitelist guidance |
| 28 | `/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status` | `ENDPOINTS.updateBeneficiaryStatus` → `payout.updateBeneficiaryStatus` | `beneficiary update-status` | **COVERED** | Two-value hash `request_time.merchant_auth` mirrored (spec oddity honored) |
| 29 | `/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout` | `ENDPOINTS.addBeneficiary` → `payout.addBeneficiary` | `beneficiary add` | **COVERED** | Same two-value hash; seeded sandbox beneficiaries documented |
| 30 | `/api/merchant-portal/online-self-activation/new-merchant` | — | — | **MISSING** | No endpoint constant, SDK method, or CLI command (grep-verified zero hits) — gap card §4.8 |
| 31 | `/api/merchant-portal/online-self-activation/get-mc-credential-info` | — | — | **MISSING** | Gap card §4.9 |
| 32 | `/api/merchant-portal/online-self-activation/get-mc-info` | — | — | **MISSING** | Gap card §4.10 |
| 33 | `/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | `ENDPOINTS.getTransactionsByMerchantRef` → `khqr.getTransactionsByMerchantRef` | `get-transactions-by-ref` | **COVERED** | merchant_ref ≤20, 50-tx response, 10/min rate bucket — all wired |

Matrix rows map to the spec inventory's numbering (#1-33); rows 30-32 are the self-activation trio.

### Verdict tally from the matrix

- COVERED: #2, #3, #4, #5, #6, #7, #14, #15, #16, #17, #18, #19, #23, #24, #25, #26, #27, #28, #29, #33 = **20**
- PARTIAL: #1 (purchase payment_option), #21 (generate-qr pre-auth CLI) = **2**
- SUPERSEDED-LEGACY: #8, #9, #10, #11, #12, #13 = **6**
- MISSING: #20 (request-qr soundbox), #22 (payment-link void), #30, #31, #32 (self-activation trio) = **5**

**20 + 2 + 6 + 5 = 33** — matches the header tally and the §5 arithmetic (22 called + 11 not = 33).

---

## 2. Verdict rules applied

- **COVERED** — the operation exists as an SDK domain method with a CLI command, and maps the spec's full request/response contract (fields + hash order + error codes). Local extras (pre-flight checks, journal, forms) strengthen, never weaken, the verdict.
- **PARTIAL** — the operation exists but with a notable limitation a user can hit without warning (here: an undocumented enum silently accepted on checkout; a documented SDK capability invisible to CLI users).
- **SUPERSEDED-LEGACY** — v1 path whose function is implemented by a v3 endpoint we cover. We do NOT implement the v1 path itself (grep-verified: zero `aof/`-v1, `cof/initial`, `cof/remove` hits in `src/`). Each legacy card in §4 checks field-by-field for v1-only capability the v3 replacement lacks.
- **MISSING** — no SDK method, no CLI command, no endpoint constant; nothing superseding it either (soundbox QR, payment-link void, self-activation trio).

---

## 3. PARTIAL verdicts — exact deltas

### 3.1 v1 generate-qr: pre-auth (`purchase_type: 'pre-auth'`) has no CLI flag

Verified state (all three paths re-checked in code):

- **SDK — supported.** `GenerateQrParams.purchaseType?: 'purchase' | 'pre-auth'` (`src/client.ts:414`); sent as `purchase_type: params.purchaseType || 'purchase'` (`src/domains/qr.ts:119`); IS part of the signed hash (`GENERATE_QR_HASH_FIELDS` includes `'purchase_type'` at `src/domains/qr.ts:46`) — this corrects the CLI inventory's finding-f, which claimed the QR hash omits `purchase_type`; it does not.
- **CLI — missing.** `generate-qr`'s option block (`src/cli.ts:2211+`) has no `--purchase-type`/`--type` flag, and the action's `payway.qr.generateQr({...})` call site never passes `purchaseType`, so the domain default `purchase` always goes out. `grep purchase-type src/cli.ts` → only `cof charge` (cli.ts:3786) and `--type` only on `generate-checkout` (cli.ts:2812).
- **What's actually missing:** one flag + one pass-through line. The QR-domain plumbing (validation, hash position, wire field) is already complete — a `--purchase-type <type>` option on `generate-qr` would be a ~4-line change with zero domain edits.
- **User impact:** a CLI-only user cannot create a QR pre-authorization; they must drop to `generate-checkout --type pre-auth` (hosted path) or `cof charge --purchase-type pre-auth` (token path). SDK users are unaffected.
- **One nuance:** the spec says Alipay/WeChat QR options do not support pre-auth; `qr.generateQr` does not warn on that combination today (it warns for wechat/alipay USD-only, not pre-auth×wechat/alipay) — worth bundling into the same fix.

### 3.2 v1 purchase (checkout): `payment_option` validation gap

Verified state:

- **The spec documents an enum in prose** (`cards`, `abapay`, `abapay_deeplink`) for `payment_option` — no `enum` keyword, values in the description only.
- **`PAYMENT_OPTIONS`** (`src/constants.ts:274`) = `['cards', 'abapay_khqr', 'abapay_khqr_deeplink', 'alipay', 'wechat', 'google_pay']` — it contains none of the three spec-documented purchase values (`abapay`, `abapay_deeplink`), and its members are QR-flavored. It is the right list for generate-qr but the wrong list for purchase.
- **SDK checkout domain** (`src/domains/checkout.ts:319-323`): checks membership in `PAYMENT_OPTIONS` and fires `warnAdvisory` when outside. Consequences: (a) advisory-only, so under default config a typo like `cardz` sails to the gateway; (b) the advisory fires on the spec's own documented values — a user passing the officially documented `abapay_deeplink` gets a spurious "outside the documented purchase enum" warning naming a list that doesn't match the purchase spec.
- **Subscription branch** (`checkout.ts:358-362`): separately validates against the real documented set `['cards', 'abapay', 'abapay_deeplink']` when `tokenFlag` is set — proving the correct purchase enum exists in the codebase but is only applied on the subscription sub-path.
- **CLI `generate-checkout --payment-option`** (`src/cli.ts:2801`): free string, default `abapay_khqr_deeplink` (which is in PAYMENT_OPTIONS but NOT in the spec's purchase enum). No validation on the non-interactive path. The hard validation at `cli.ts:2372-2374` belongs to `generate-qr` (the enclosing `.command('generate-qr')` starts at cli.ts:2211; `generate-checkout` starts at 2797), not to generate-checkout.
- **What's actually missing:** a purchase-specific enum (e.g. `PURCHASE_PAYMENT_OPTIONS = ['cards', 'abapay', 'abapay_deeplink', 'google_pay', ...live-docs set]`), applied as the advisory list on the checkout domain and as a hard CLI validation on `generate-checkout` (mirroring generate-qr's cli.ts:2372 pattern, with the QR list replaced by the purchase list). The two lists diverge today because they were unified under one constant that fits QR.
- **User impact:** typos surface as opaque gateway errors instead of local suggestions; spec-documented values warn spuriously; the default `abapay_khqr_deeplink` may itself be outside the live purchase enum (live-docs check recommended before tightening, since the SDK also passes `google_pay` with a required token — checkout.ts:338-340 — which the archived spec does not document either).

---

## 4. Gap cards — MISSING and SUPERSEDED-LEGACY endpoints (11)

### 4.1 `/api/aof/request-qr` — SUPERSEDED-LEGACY (v1 account-link QR)

- **What it does (spec):** returns a QR string + ABA Mobile deeplink + hosted QR image URL for the customer to link their ABA account; the resulting token is pushed to `return_url` (or profile pushback). Fields: `req_time`, `merchant_id`, `return_param` (required — echo field), `return_url`, `return_deeplink`; hash `merchant_id.req_time.return_deeplink` (return_param excluded).
- **v3 replacement:** `aof/link-account` (#14) — implemented (COVERED). Field mapping: `req_time`→`request_time`, `return_param`→ dropped in favor of `request_id` (a better correlation key: link-account's token is later fetched by `request_id` via get-token-details), `return_deeplink` kept, adds `ctid`, `token_flag`, `currency`, `callback_url`.
- **v1-only capability the v3 lacks:** none of substance. The only v1 fields without a v3 equivalent are `return_param` (arbitrary echo data in the pushback) and the response's `qr_image` (a hosted image URL). v3 returns `qr_string` and the SDK renders PNGs locally (`saveQrPng`), which is strictly better; `return_param`'s correlation job is done by `request_id` + `trace_id`. Hash-order and 10-minute expiry semantics carry over.
- **Suspected value for SDK users:** none — v3 is a strict improvement; calling v1 would also require maintaining the v1 hash order (`merchant_id.req_time.return_deeplink`).
- **Complexity if ever needed:** trivial (6 fields, JSON, 2-code error set) — but unjustified.
- **Priority: P3 (do not implement).**

### 4.2 `/api/payment-gateway/v1/cof/initial` — SUPERSEDED-LEGACY (v1 card-link form)

- **What it does (spec):** returns hosted HTML for card entry (Visa/MC/JCB/UPI); token pushed to `return_url`. Multipart; 10 fields; notably NO `req_time`; hash `merchant_id.ctid.return_param`.
- **v3 replacement:** `cof/link-card` (#15) — implemented both as API call and as a local signed form (`getLinkCardFormHtml` → CLI `cof link-card-form`), which reproduces the v1 initial's "render a form, browser POSTs" UX on the v3 wire format.
- **v1-only capability the v3 lacks:** `return_param` (echo field) and per-field `firstname/lastname/email/phone` consumer pre-fill (v3 link-card takes none of these — the hosted page collects card data only). The consumer pre-fill is cosmetic; `return_param` correlation is replaced by `request_id`. Also v1 `continue_add_card_success_url` ≈ v3 `continue_success_url` (SDK sends it — verified at credentials-on-file.ts:215-224 — despite the archived spec schema omitting it; live-docs parity).
- **Suspected value:** none for new integrations; possibly relevant only for merchants pinned to v1 by ABA onboarding.
- **Complexity:** low (multipart HTML response, 3-value hash) but duplicates an implemented flow.
- **Priority: P3.**

### 4.3 `/api/aof/remove-account` — SUPERSEDED-LEGACY, v3 covers fully

- **What it does:** irreversible removal of an account token. 5 fields, all required; hash `merchant_id.req_time.ctid.pwt`.
- **v3 replacement:** `token-management/remove-token` (#19, COVERED) — identical purpose, removes account OR card tokens, and (per live §16 verification) uses a different per-endpoint shape (ctid+pwt, no req-id) and hash `merchant_id.ctid.request_time.pwt`. The SDK enforces exactly that.
- **v1-only capability:** none. Response is just a status envelope; v3 adds `trace_id`.
- **Priority: P3 (never implement; v3 strictly better).**

### 4.4 `/api/aof/renew-expired-account` — SUPERSEDED-LEGACY

- **What it does:** renew an expired account token (user must re-authorize in ABA Mobile). Hash `merchant_id.ctid.pwt.req_time` (note: different order from remove-account).
- **v3 replacement:** `token-management/renew-expired-account-token` (#17, COVERED) — adds `request_id` (the original link request's id) to the tuple; hash `ctid.request_time.pwt.merchant_id.request_id`; SDK implements + CLI `cof token renew`.
- **v1-only capability the v3 lacks:** **one field — `expired_in` (new expiry timestamp) in the response.** v1 renew answers with the refreshed expiry (top-level `expired_in`); the v3 response carries only `status {code, message, trace_id}`. In practice the SDK's token-lifecycle helpers (`computeTokenExpiry` / `daysUntilTokenExpiry`, TOKEN_VALIDITY_DAYS = 90) reconstruct the expiry client-side, and `get-token-details` returns `expired_at` authoritatively — so the capability is recoverable with one extra call, but v3 renew itself does not report the new expiry. This is the only field-level delta anywhere in the legacy COF/AOF family.
- **Suspected value:** low — one extra read call (or the local 90-day arithmetic) covers it.
- **Priority: P3; note the delta in token-lifecycle docs.**

### 4.5 `/api/aof/pushback-status` — SUPERSEDED-LEGACY

- **What it does:** manual retrieval of a linked **account** token's details if the pushback was missed, keyed by `return_param` (the original request's echo value). 4 fields; hash `merchant_id.req_time.return_param`. Response `data {ctid, pwt, mask_account, expired_in}`.
- **v3 replacement:** `token-management/get-token-details` (#18, COVERED) — keyed by `request_id` (stronger: unique per link request, 5-24 alnum), works for account **and** card tokens, and returns a superset: `ctid, pwt, source_of_fund` (masked number — same last-4 function as `mask_account`), `type` (Visa/MC/CUP/JCB/ABA ACCOUNT), `status` (active/frozen/removed), `expired_at`, `token_flag`, `frequency`, `subscribed_amount`, `amount_limit_per_tran`, `currency`.
- **v1-only capability the v3 lacks:** **none on capability; one on keying.** v1 lets you look up by `return_param` — an arbitrary merchant-chosen string — whereas v3 requires the `request_id`. If a merchant never recorded the `request_id` (v1-era flow), the v3 endpoint cannot recover the token by echo-value alone. For our SDK (which generates and journals request_ids), this is moot.
- **Priority: P3.**

### 4.6 `/api/payment-gateway/v1/payments/request-qr` — MISSING (QR for Soundbox)

- **What it does (spec):** creates a QR for the **Soundbox** (ABA's audio-payment device). Materially different from generate-qr: `amount` is nullable (soundbox keypad enters it later), `qr_image_template` NOT required (no template), `payment_option` enum includes `abapay` (generate-qr does NOT), `callback_url` REQUIRED, and it echoes `tran_id`+`amount` in the response. Same typo'd hash string as generate-qr in the spec (but only the fields it defines are real).
- **Why MISSING not legacy:** no v3 successor exists — it's a sibling of generate-qr serving a different device class; nothing in the SDK implements it (grep `request-qr|soundbox` in `src/` → zero hits, verified).
- **Suspected value:** **real but niche.** Merchants running ABA soundboxes (retail counters) currently cannot use this SDK to provision soundbox QRs; they'd use the raw HTTP API. Amount-at-scan (nullable amount) is also a genuinely different capability from generate-qr (which requires amount ≥ floor). If our user base includes physical retail, this is the highest-value gap after payment-link void.
- **Implementation complexity guess:** LOW-MEDIUM — 10 request fields (7 required), simple 3-key status envelope (mirrors generate-qr's status codes), one hash order to pin (likely the generate-qr 19-field order trimmed to the real fields: req_time, merchant_id, tran_id, amount, purchase_type, payment_option, callback_url, lifetime, currency — must be sandbox-verified since the spec's b4hash line is copy-paste garbage for this path). A `qr.generateSoundboxQr` domain method + `generate-qr --soundbox` mode or a `soundbox-qr` command; nullable amount means the local `validatePositiveAmount` gate needs a bypass flag.
- **Recommended priority: P2.**

### 4.7 `/api/merchant-portal/merchant-access/payment-link/void` — MISSING

- **What it does (spec):** voids (cancels) an unpaid payment link. RSA `merchant_auth {mc_id, id}`; hash `request_time.merchant_id.merchant_auth`; response is the full link detail envelope (same shape as detail) with `status` reflecting the void.
- **Why it matters:** this is the missing half of the payment-link lifecycle. Today the SDK/CLI can create and read links but the only way to stop one is expiry — and per repo-documented live findings (AGENTS.md, docs/17) **expired links still read OPEN with a 200 hosted page and there is no remote EXPIRED status**, so merchants are told to "enforce expiry merchant-side." A void command would be the actual remote kill-switch, and its response (`payment_limit`, `total_trxn`, `status`) is the natural reconciliation payload. The endpoint is also trivially similar to detail (same auth block, same hash, `id` instead of detail's `id`) — the SDK already has every building block.
- **Suspected value:** HIGH for anyone using payment links in production (refunds/price-changes/customer cancellation), and it closes a documented "no remote way to close a link" caveat.
- **Implementation complexity guess:** LOW — 4 fields, hash identical to detail (`request_time.merchant_id.merchant_auth`), response = detail's schema. Reuse `requestWithMerchantAuth` + the detail response type; add `ENDPOINTS.voidPaymentLink`, `paymentLink.void`, `payment-link void -i <id>`, and the PTL02/PTL132 error mapping already exists in `PAYMENT_LINK_HINTS`.
- **Recommended priority: P1** (highest of all gaps: small, safe, closes a lifecycle hole with documented operational pain).

### 4.8 `/api/merchant-portal/online-self-activation/new-merchant` — MISSING

- **What it does (spec):** partner-mediated merchant self-registration. The partner (an ABA-integrated platform) POSTs `partner_id` + RSA-chunk-encrypted `request_data {pushback_url, redirect_url, type, register_ref, merchant_type, currency}` and gets back `{url, token}` — a hosted onboarding form URL to redirect the prospective merchant to. Hash is HMAC-**SHA256** (`partner_id.request_data.request_time`) — the only SHA256 endpoint in the whole spec (get-mc-credential-info says SHA512, contradicting; would need sandbox confirmation).
- **Suspected value:** **high for platform/partner use cases, zero for ordinary merchants.** It enables onboarding new PayWay merchants end-to-end without ABA portal visits — the classic "marketplace/platform wants sub-merchants to accept payments" flow. But it requires a `partner_id` issued by ABA, which our current user (a merchant with merchant_id/api_key/RSA key) does not have. The SDK's auth model (merchant_id + api_key HMAC) does not fit partner-auth either — this is a different credential class entirely.
- **Implementation complexity guess:** MEDIUM — fields are simple (5, one encrypted blob), but: new auth surface (partner_id + SHA256/SHA512 discrepancy to resolve), a `PartnerAuth` config branch, response handling is a redirect flow not a status, and it cannot be tested in sandbox without a partner agreement. Also `pushback_url`/`redirect_url` must be domain-whitelisted (PTL175).
- **Recommended priority: P3** unless a partner onboarding use case materializes (then P1 for that user class). Document as "out of scope: partner-only" in the README.

### 4.9 `/api/merchant-portal/online-self-activation/get-mc-credential-info` — MISSING

- **What it does (spec):** inquiry for the credential bundle of a merchant registered via `new-merchant` — POST `partner_id` + encrypted `{register_ref}`, get back `data` = an encrypted merchant-credential blob (decryptable only by the partner). Depends entirely on §4.8 having been used first.
- **Suspected value:** none standalone — it's step 2 of the partner flow; same partner-only credential class.
- **Implementation complexity guess:** LOW-MEDIUM (simple body; the response is an opaque encrypted blob the SDK would hand back raw or decrypt with the partner RSA private key — key management is the hard part).
- **Recommended priority: P3** (same as §4.8; implement together or not at all).

### 4.10 `/api/merchant-portal/online-self-activation/get-mc-info` — MISSING

- **What it does (spec):** given `merchant_key` + an HMAC-of-partner-data + optional RSA-encrypted hash, returns the merchant's outlet profile: `outlet_name`, `aba_account_khr`, `aba_account_usd`, and `available/enabled/pending_payment_methods` (schemas are empty objects in the archived spec — real shapes unknown). Hash HMAC-SHA256 `partner_id.request_data.request_time`.
- **Suspected value:** LOW — profile/outlet introspection after activation; the payment-methods breakdown could be useful for checkout UX (render only enabled methods), but the empty schemas mean we'd be guessing the response shape until sandbox-verified.
- **Implementation complexity guess:** MEDIUM (unverified response schema; nested merchant-key auth dance: `public_key_hash_encrypt` = HMAC-SHA512 of `partner_id.merchant_key.request_time` with the merchant public key — an unusual three-key construction).
- **Recommended priority: P3.**

### 4.11 v1 COF/AOF legacy family — SUPERSEDED-LEGACY summary card

All six legacy verdicts (#8, #9, #10, #11, #12, #13) share one conclusion: **v3 fully covers the family except for two single-field deltas** —
1. v1 renew answers `expired_in` (new expiry) inline; v3 renew does not (§4.4) — workaround: `get-token-details.expired_at` or local 90-day arithmetic.
2. v1 pushback-status can key by `return_param` (arbitrary echo); v3 get-token-details requires `request_id` (§4.5) — moot for SDK users who record request_ids.

No v1-only endpoint, field-level capability, or error code is otherwise lost. Implementing any v1 path would mean maintaining divergent hash orders (e.g. v1 remove `merchant_id.req_time.ctid.pwt` vs v1 renew `merchant_id.ctid.pwt.req_time` vs v3's three other orders) for zero functional gain. All six: **P3, do not implement**; keep the deltas noted in token-lifecycle docs.

---

## 5. Sanity check: 22 + 11 = 33 — reconciled

- The SDK calls exactly **22** gateway endpoints (verified: `ENDPOINTS` in `src/constants.ts:6-29` has 22 entries; the reverse grep of every `/api/...` literal in `src/` returns exactly those 22 PayWay paths plus only non-PayWay locals — demo app `/api/health|payments|orders`, mock-server routes in `src/test/index.ts`, and app templates — so no SDK path is absent from the spec).
- The spec has **33** paths; 33 − 22 = **11** non-implemented, which are precisely the 11 rows without SDK/CLI entries above: 6 SUPERSEDED-LEGACY (the v1 AOF quartet #8/#10/#12/#13 + v1 COF pair #9/#11) + 5 MISSING (soundbox request-qr #20, payment-link void #22, self-activation trio #30/#31/#32).
- **6 + 5 = 11. 22 + 11 = 33. No orphans on either side.**

On the `-2` suffixes: `check-transaction-2` and `transaction-list-2` are the **gateway's literal path names** (ap-tools export artifact, likely deduplicating an earlier unsuffixed version inside ABA's own module registry — the spec file has only one operation per name). The SDK constants use the exact suffixed paths (`src/constants.ts:7,10`), so our `check-transaction` / `transaction-list` operations map 1:1 onto them. **Confirmed: not gaps, not duplicates in the spec** — each `-2` path is a single distinct operation.

Final verdict tally: **COVERED 20 / PARTIAL 2 / SUPERSEDED-LEGACY 6 / MISSING 5. Total 33.** Consistent with the matrix-derived tally in §1 and the header block.

---

## 6. Verification notes — where the Pass 1 inventories disagreed, and what the code says

### 6.1 CLI-inventory finding-f error (corrected)

The CLI inventory's finding f claimed "the generate-qr hash fields do not include `purchase_type`". **Wrong** — `GENERATE_QR_HASH_FIELDS` at `src/domains/qr.ts:36-56` includes `'purchase_type'` (line 46), matching the SDK inventory. The real (and only) QR pre-auth gap is the absent CLI flag, as §3.1 details.

### 6.2 Reverse direction — SDK sends fields the archived spec lacks (spec-coverage notes, not gaps)

The archived spec is a snapshot behind live docs; where the SDK sends more, that's live-docs parity:
- `cof/link-card`: SDK sends `frequency` + `continue_success_url` (`src/domains/credentials-on-file.ts:215-224`; hash `LINK_CARD_HMAC_FIELDS` lines 61-72) — the spec schema has neither, but its own b4hash line mentions `$frequency` (a spec self-inconsistency confirming the field is real).
- `v1 purchase`: SDK sends `additional_params` + `google_pay_token` — spec schema has no `google_pay_token`, and its b4hash mentions `$additional_params` while the schema doesn't (mirror image of the link-card case).
- `pre-auth-completion/cancellation`: SDK sends `idempotency_key` (both) and `reason` (cancel) inside merchant_auth — none in the spec's documented merchant_auth contents (pre-auth.ts:84-160, verified).
- No SDK-called **path** is absent from the spec (§5 reverse grep) — the only reverse-direction deltas are field-level.

### 6.3 Why purchase and generate-qr are not both worse

`purchase` and `generate-qr` each have second caveats (generate-checkout's `--callback-url` is accepted but NOT sent — cli.ts:2939-2944 warns; purchase path likewise ignores it) that are documented in-tool rather than silent failures, so they stay at PARTIAL (purchase) and PARTIAL (generate-qr) respectively on the strength of the §3 items alone.

### 6.4 Other spot-checks confirmed

- `PAYMENT_OPTIONS` at `src/constants.ts:272-274` (values verified) — the source of the §3.2 mismatch.
- Refund body = `{tran_id, refund_amount}` inside merchant_auth, hash `request_time.merchant_id.merchant_auth` (checkout.ts:657-663, verified).
- Exchange-rate hash = `req_time.merchant_id` (checkout.ts:668-682, verified).
- Pre-auth hash orders verified in code: completion `merchant_auth.request_time.merchant_id`, cancellation `merchant_id.merchant_auth.request_time` — matching the spec's three-way divergence exactly.
- Link-account hash (credentials-on-file.ts:283-294): `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency` — matches spec b4hash.
- `transaction-list` allowed statuses include the spec's own `DECLINDED` typo (checkout.ts:615) — faithful to the gateway, worth knowing it's intentional.
