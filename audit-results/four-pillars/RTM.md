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
