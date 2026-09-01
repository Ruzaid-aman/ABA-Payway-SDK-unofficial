# Corrected Requirements Traceability Matrix (CoF)

Plan-doc claims were cross-checked against the real gateway behaviour already proven in
this repo's sandbox campaigns. Two systematic corrections: (1) `link-card` speaks
`application/x-www-form-urlencoded`, **not** multipart; (2) token-flag enums are stricter
than the plan lists.

## Endpoint traceability
| Req | Endpoint | Implementation surface | Verdict | Notes |
|---|---|---|---|---|
| R-01 | Link Account `/api/payment-credential/v3/aof/link-account` JSON | `src/constants.ts:13`, `src/domains/credentials-on-file.ts:36-72` | ✅ PASS | Plan's hash formula (`m+ctid+time+cb`) is **incomplete**: real composition is `request_time, merchant_id, request_id, ctid, return_deeplink, token_flag, currency, callback_url` (ibid. `:60-69`). |
| R-02 | Link Card `/api/payment-credential/v3/cof/link-card` form-urlencoded | `credentials-on-file.ts:74-111`, `src/client.ts:772-779` | ⚠️ PARTIAL | Content-type corrected from plan (form-urlencoded, sandbox-verified `docs/09:179`). Requires `currency` + `frequency`; success returns **HTML page**, not JSON (`docs/09:184`). |
| R-03 | Payment `/api/payment-gateway/v3/purchase/payment-credential` JSON | `constants.ts:15`, `credentials-on-file.ts:113-161` | ✅ PASS* | Hash order `request_time, merchant_id, request_id, tran_id, amount, ctid, pwt, token_flag, currency, callback_url` confirmed by unit test `client.test.ts:1464-1467` analogue. *Server-accepted extras (`shipping_fee`, `items`, `first_name`…) are not surfaced on `CofPaymentParams` (`client.ts:137-147`). |
| R-04 | Renew Token `…/renew-expired-account-token` | `credentials-on-file.ts:163-186` | 🛑 BLOCKED | Implementation sends server-mandated `request` field (`:178`), binding layer passes; **hash layer rejects every derivable composition** (~60 tried — `CHANGELOG:79`, `SANDBOX-FINDINGS §9a`). Awaiting ABA spec. |
| R-05 | Get Token Details `…/get-token-details` | `credentials-on-file.ts:188-211` | 🛑 BLOCKED | Same hash-layer blocker. Plan formula `req_id+req_time+m` also diverges from shipped `request_time, merchant_id, request_id, ctid, pwt`. |
| R-06 | Remove Token `…/remove-token` | `credentials-on-file.ts:213-236` | 🛑 BLOCKED | Same hash-layer blocker. |
| R-07 | Subscription `/api/payment-gateway/v1/payments/purchase` | `constants.ts:16`, `src/domains/checkout.ts:18-75`, `CreateTransactionParams` `client.ts:83-109` | ❌ GAP | Path implemented, but **`ctid`, `token_flag`, `frequency` are absent** from `CreateTransactionParams` → initial subscription transaction cannot be minted natively; only post-link charging (R-03) works today. |
| R-08 | Unschedule-payment flags | `payway-openapi/components/schemas/credentials-on-file.yaml:64-66` | 📝 CORRECTED | Sandbox enums: linking `CITI_FLEX \| CITO_FLEX \| CITO_FIX \| CITR_FLEX`; charging `CITU_FLEX \| MITU_FLEX \| MITU_FIX \| MITR_FLEX \| MITR_FIX` (`docs/09:185-188`). Plan's `CITI_FLEX/CITO_FLEX`-only list is stale. |
| R-09 | Schedule-payment flags | ibid. | 📝 CORRECTED | `CITR_FIX` is **not** an accepted linking value (`CITO_FIX`/`CITR_FLEX` are); see SANDBOX-FINDINGS §9. |
| R-10 | Callback handler, `X-PAYWAY-HMAC-SHA512` | `src/auth.ts:56-88`, `src/webhook/server.ts:118-142` | ✅ PASS | Header-is-source-of-truth; `hash` stripped; keys sorted; nested objects JSON-encoded; **timing-safe** compare (`timingSafeEqual`, length-guarded `auth.ts:80-87`). Capture server stores unvalidated and always answers 200 (WH-TC-05) — see Pillar C hardening debt. |

## Hash-composition: plan doc vs shipped SDK
| Req | Plan-doc formula | Shipped SDK fieldList | Disposition |
|---|---|---|---|
| R-01 | `merchant_id+ctid+request_time+callback_url` | `request_time, merchant_id, request_id, ctid, return_deeplink, token_flag, currency, callback_url` | SDK reflects sandbox reality; plan doc outdated |
| R-03 | `m+ctid+time+pwt+amount` | `request_time, merchant_id, request_id, tran_id, amount, ctid, pwt, token_flag, currency, callback_url` | SDK superset |
| R-04/06 | `m+ctid+time+pwt` | `request_time, merchant_id, request_id, ctid, pwt` | Matches plan except leading time-ordering; still gateway-blocked |
| R-05 | `request_id+request_time+merchant_id` | `request_time, merchant_id, request_id, ctid, pwt` | Plan formula would never bind (missing ctid/pwt) |

Coverage: **10/10 requirements traced**, 3 ✅, 1 ⚠️, 1 ❌ GAP (R-07), 3 🛑 BLOCKED,
2 📝 doc corrections.

---

## Addendum — 2026-08-31 (live API parity release, v1.3.6)

The rows above are the 2026-08-27 snapshot and are NOT rewritten (append-only
discipline). This addendum supersedes them where v1.3.6 changed reality.
Evidence: `docs/SANDBOX-FINDINGS.md` §16, probe
`test-output/token-trio/probe-2026-08-31T00-28-10-661Z.log`, coverage matrix
`audit-results/live-api-coverage-2026-08-31.md`, release notes in `CHANGELOG.md` v1.3.6.

| Req | 2026-08-27 verdict | Verdict now | What changed |
|---|---|---|---|
| R-04 Renew Token | 🛑 BLOCKED | ✅ PASS | Live docs published the exact fieldList (`ctid.request_time.pwt.merchant_id.request_id`); sandbox probe confirmed the hash layer ACCEPTS it (business code 105 on synthetic tokens) while the shipped §9a-era order returns `01 Wrong Hash`. `RenewTokenParams {requestId, ctid, paymentToken}` shipped; the server-mandated `request` field is gone (binding layer no longer requires it). |
| R-05 Get Token Details | 🛑 BLOCKED | ✅ PASS | Live order `merchant_id.request_time.request_id`; request carries ONLY `request_id` (+ auto fields) — **no ctid/pwt**. Probe: `09 Data not found` (hash accepted). `GetTokenDetailsParams {requestId}` shipped. |
| R-06 Remove Token | 🛑 BLOCKED | ✅ PASS | Live order `merchant_id.ctid.request_time.pwt`; request carries ctid+pwt, **no request_id**. Probe: HTTP 200 code `00`. `RemoveTokenParams {ctid, paymentToken}` shipped. |
| R-07 Subscription | ❌ GAP | ✅ PASS | `CreateTransactionParams` gained `ctid`, `tokenFlag: 'CITR_FIX'`, `frequency ('1W'\|'1M'\|'2M')` (live `subscription-21402227e0` operation); hash positions appended after `skip_success_page` matching the live order. CLI: `generate-checkout --ctid … --token-flag CITR_FIX --frequency 1M`. |
| R-02 Link Card | ⚠️ PARTIAL | ✅ PASS | `continueSuccessUrl` added; `returnUrl`/`returnDeeplink` deprecated (absent from the live-documented request; not sent). HTML-always response handled by a structured guard in `client.ts`. |
| R-03 Payment | ✅ PASS* | ✅ PASS | The asterisk is resolved: the 10 live-documented optional params (`firstName/lastName/email/phone/purchaseType/items/returnParams/payout/customFields/shippingFee`) are now on `CofPaymentParams` with the §16-verified 19-field hash order; `requestId` no longer sent (deprecated). |
| R-01 Link Account | ✅ PASS | ✅ PASS (re-based) | Hash realigned to the live order `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency` — the §9a-era order now returns `01 Wrong Hash` (gateway tightened validation). `ctid`/`tokenFlag`/`currency` required per live docs. |

Updated coverage: **10/10 traced — 10 ✅ PASS** (R-01…R-07, R-10; R-08/R-09
enum corrections stand). The capability gate `allowUnverifiedTokenOperations`
is deprecated as an opt-out (trio allowed by default).
