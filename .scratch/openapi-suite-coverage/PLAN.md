# PLAN — OpenAPI Suite Coverage Campaign (openapi-suite-coverage)

**Branches:** work on `openapi-suite-coverage` (worktree `.worktrees/openapi-suite-coverage`, off `openapi-gap-implementation` @ cf4eae8). Main checkout stays untouched (concurrent agents' dirty files).
**Audit inputs:** `D:\Antigravity_google\SDK-prepration\.scratch\openapi-coverage-audit\` (FINAL-REPORT.md + 5 artifacts).
**Scope decision (user directive):** implement the 5 MISSING + 2 PARTIAL; skip the 6 SUPERSEDED-LEGACY.

## Already done by concurrent agent (verified in code, do NOT redo)
- payment-link/void: ENDPOINTS.voidPaymentLink (constants.ts:23), domain void() (payment-link.ts:229), CLI `payment-link void` (cli.ts:3426), PTL188 knowledge.
- generate-qr `--purchase-type` flag (cli.ts:3845, 3878).

## W1 — PARTIAL fix: purchase payment_option documented set
- `constants.ts`: add `PURCHASE_PAYMENT_OPTIONS = ['cards','abapay','abapay_deeplink']` (spec-documented purchase enum; audit spec-inventory line 70). Refactor the subscription-branch advisory (checkout.ts:358) to use it.
- `checkout.ts` purchase(): find the spurious advisory that checks PAYMENT_OPTIONS (QR set) on the purchase path → switch to PURCHASE_PAYMENT_OPTIONS, advisory-level (pass-through preserved; live docs may list more).
- CLI generate-checkout `--payment-option`: add the same advisory, no hard validation.
- Tests: advisory fires on bogus value; silent on `abapay`/`abapay_deeplink`/`cards`.

## W2 — MISSING: request-qr (Soundbox QR)
- `constants.ts`: `requestQr: '/api/payment-gateway/v1/payments/request-qr'` + MUTATION_ENDPOINTS.
- `qr.ts`: export `REQUEST_QR_HASH_FIELDS = ['req_time','merchant_id','tran_id','amount','purchase_type','payment_option','callback_url','currency','lifetime']` (spec b4hash filtered to its 9 real fields — spec string is corrupted copy-paste from generate-qr, audit line 304; comment evidence). `RequestQrParams` (client.ts): transactionId, currency (required), paymentOption (required; abapay|abapay_khqr|wechat|alipay), callbackUrl (required), amount? (nullable — keypad entry), lifetimeMinutes? (3..43200), purchaseType? ('purchase'|'pre-auth').
- Domain `requestQr()` in QrDomain: validations (tran_id, currency, paymentOption enum + wechat/alipay USD-only advisory, callbackUrl public https, amount floor when present); payload filterParams({tran_id, amount?, purchase_type||'purchase', payment_option, callback_url: base64-if-needed, currency, lifetime?}); response via `request()` (JSON).
- Response type: local `RequestQrResponse` interface (tran_id, qr_string, amount, currency, status{code,message,trace_id}) — avoid regenerating generated types.ts; comment spec provenance.
- PayWay class wiring: extend QrDomain (`this.qr.requestQr`); index.ts exports.
- CLI: top-level `request-qr` command near generate-qr: `-a/--amount` optional, `-c` required, `--payment-option` required, `--callback-url` required, `--lifetime <minutes>`, `--purchase-type`, `--tran-id`, `-y`, `--json`, `--save-image`, `--no-open-image`; print qr_string; PNG save mirrors generate-qr helper.
- Tests: hash-order pin, payload shape, null-amount allowed, USD-only advisory, enum validation; CLI help/parse.

## W3 — MISSING: online-self-activation trio (partner auth)
- `auth.ts`: `generateHmac(..., encoding?, algorithm: 'sha512'|'sha256' = 'sha512')` (backwards compatible).
- `client.ts`: config `partnerId?`, `partnerApiKey?`; private `requestWithPartnerAuth(path, requestDataPayload, { hashAlgorithm, bodyExtras, callOptions })` — guards partnerId/partnerApiKey/publicKeyPem; body `{request_time, partner_id, request_data: encryptMerchantAuth(payload, publicKeyPem), ...bodyExtras}`; hash over `['partner_id','request_data','request_time']` with the per-endpoint algorithm; JSON content type.
- `constants.ts`: 3 endpoint paths + MUTATION_ENDPOINTS.
- New domain `src/domains/self-activation.ts` — `createSelfActivationDomain(config, partnerRequest)`:
  - `registerMerchant({pushbackUrl, redirectUrl, registerRef, currency, merchantType?, type?, referenceId?})` — request_data JSON per spec; reference_id as bodyExtras top-level (must equal registerRef when both present); SHA256. Response {url?, token?, status{code,message}}.
  - `getCredentialInfo({registerRef})` — SHA512 per spec (anomaly vs siblings — comment; audit "HMAC algorithm conflict").
  - `getMerchantInfo({merchantKey})` — request_data {merchant_key, public_key_hash_encrypt = HMAC-SHA512(partner_id+merchant_key+request_time, key=config.publicKeyPem per spec — comment oddity), rsa_public_key_hash_encrypt?}; SHA256. Response {data?:{outlet_name, aba_account_khr, aba_account_usd, ...}, status}.
  - Status handling mirrors existing domains (client maps non-00 200-bodies to PayWayBusinessError — verify in _executeFetch and mirror).
- Wiring: `this.selfActivation` in PayWay constructor; domains/index.ts; index.ts exports.
- `envValidator.ts`: KNOWN_VARS += PAYWAY_PARTNER_ID, PAYWAY_PARTNER_API_KEY.
- CLI: `self-activation` group (`new-merchant`, `credential-info`, `mc-info`) with --json; partner-credentials assert helper with actionable error.
- Tests: sha256 hmac; partner-auth request shape; reference_id mismatch; currency enum; CLI help.

## W4 — Codification (worktree copies are clean — commit freely)
CHANGELOG.md, HANDOFF.md (state + contract notes: request-qr hash is spec-derived/unverified; self-activation partner auth unverified-live), AGENTS.md canonical commands, docs/SDK-AND-CLI-REFERENCE.md. Skills pack: follow-up, not this campaign.

## Commit gates (each phase: build + typecheck + vitest green)
1. `feat: purchase payment_option documented-set advisory (spec-drift fix)`
2. `feat: request-qr — Soundbox QR endpoint (SDK + CLI)`
3. `feat: online-self-activation trio — partner-auth domain (SDK + CLI)`
4. `docs: openapi-suite-coverage codification`

## Deliverable
Report branch `openapi-suite-coverage` ready; merging into `openapi-gap-implementation` is left to the user (main checkout has foreign dirty files that block a clean ff-merge).
