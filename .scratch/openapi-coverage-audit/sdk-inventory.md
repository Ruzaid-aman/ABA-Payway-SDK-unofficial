# SDK Inventory — aba-payway-ts (Pass 1: API surface, no coverage judgment)

Generated 2026-09-11 by the SDK-EXTRACTOR agent. Inventory only — no comparison
against the OpenAPI spec. All paths verbatim from source.

Source of truth for endpoints: `src/constants.ts` `ENDPOINTS` (lines 6–29).
All gateway HTTP calls flow through `PayWay.request()` /
`PayWay.requestWithMerchantAuth()` in `src/client.ts` (`_executeFetch` builds
`${this.baseUrl}${endpoint}` at `src/client.ts:1355` and calls `fetch` at
`src/client.ts:1414`). Base URLs: `BASE_URLS` (`src/constants.ts:1-4`) —
sandbox `https://checkout-sandbox.payway.com.kh`, production
`https://checkout.payway.com.kh` (overridable via `PayWayConfig.baseUrl` /
`PAYWAY_BASE_URL` / `PAYWAY_ENV` URL).

## 1. Gateway endpoints the SDK calls

22 distinct endpoints. All are defined in `src/constants.ts:6-29` (`ENDPOINTS`)
and mirrored 1:1 by the auto-generated OpenAPI path types in `src/types.ts`
(lines 7–428). No other file in `src/` defines a PayWay gateway endpoint path
(verified by grepping `/api/`, `ENDPOINTS.`, `payway.com.kh` across `src/`).

| # | Endpoint path (verbatim) | SDK method(s) — `payway.<domain>.<method>` | CLI command(s) | Defined at (constants.ts) / called from |
|---|---|---|---|---|
| 1 | `/api/payment-gateway/v1/payments/purchase` | `checkout.purchase`, `checkout.purchaseHosted` (sets payment_gate=0), `checkout.createTransaction` + `checkout.getCheckoutFormHtml` (local payload/form builders — the form POSTs to this URL), plus facade `server.initiateTransaction` / `sdk.initiate` | `generate-checkout`, `checkout-form` (form path) | constants.ts:16; domains/checkout.ts:422 (purchase), :463 (form action), :512 (purchaseHosted); server/index.ts (via request()) |
| 2 | `/api/payment-gateway/v1/payments/check-transaction-2` | `checkout.checkTransaction`, `checkout.pollTransactionStatus` (repeated check calls) | `check-transaction`, `poll-transaction`, `tx-batch check`, `status` (doctor), `demo`/first-payment flows | constants.ts:7; domains/checkout.ts:536, :736 |
| 3 | `/api/payment-gateway/v1/payments/close-transaction` | `checkout.closeTransaction` | `close-transaction`, `tx-batch close` | constants.ts:8; domains/checkout.ts:549 |
| 4 | `/api/payment-gateway/v1/payments/transaction-detail` | `checkout.getTransactionDetail` | `transaction-detail`, `tx-batch detail` | constants.ts:9; domains/checkout.ts:566 |
| 5 | `/api/payment-gateway/v1/payments/transaction-list-2` | `checkout.getTransactionList` | `transaction-list` | constants.ts:10; domains/checkout.ts:624 |
| 6 | `/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | `khqr.getTransactionsByMerchantRef` | `get-transactions-by-ref` | constants.ts:28; domains/khqr.ts:61 |
| 7 | `/api/payment-gateway/v1/exchange-rate` | `checkout.getExchangeRate` | `exchange-rate` | constants.ts:12; domains/checkout.ts:668 |
| 8 | `/api/payment-gateway/v1/payments/generate-qr` | `qr.generateQr` | `generate-qr` (online mode; `--offline` stays local) | constants.ts:20; domains/qr.ts:110 |
| 9 | `/api/merchant-portal/merchant-access/online-transaction/refund` | `checkout.refund` | `refund` | constants.ts:11; domains/checkout.ts:657 |
| 10 | `/api/payment-credential/v3/aof/link-account` | `credentialsOnFile.linkAccount` | `cof link-account` | constants.ts:13; domains/credentials-on-file.ts:274 |
| 11 | `/api/payment-credential/v3/cof/link-card` | `credentialsOnFile.linkCard` (HTTP path), `credentialsOnFile.getLinkCardFormHtml` (local form POSTs to this URL) | `cof link-card` (API path), `cof link-card-form` (local form) | constants.ts:14; domains/credentials-on-file.ts:306 (HTTP), :339 (form action) |
| 12 | `/api/payment-gateway/v3/purchase/payment-credential` | `credentialsOnFile.payment` (charge a stored token) | `cof charge` | constants.ts:15; domains/credentials-on-file.ts:404 |
| 13 | `/api/payment-credential/v3/token-management/renew-expired-account-token` | `credentialsOnFile.renewToken` | `cof token renew` | constants.ts:17; domains/credentials-on-file.ts:466 |
| 14 | `/api/payment-credential/v3/token-management/get-token-details` | `credentialsOnFile.getTokenDetails` | `cof token details` | constants.ts:18; domains/credentials-on-file.ts:488 |
| 15 | `/api/payment-credential/v3/token-management/remove-token` | `credentialsOnFile.removeToken` | `cof token remove` | constants.ts:19; domains/credentials-on-file.ts:512 |
| 16 | `/api/merchant-portal/merchant-access/payment-link/create` | `paymentLink.create` | `payment-link create` | constants.ts:21; domains/payment-link.ts:183 |
| 17 | `/api/merchant-portal/merchant-access/payment-link/detail` | `paymentLink.getDetails` | `payment-link detail` | constants.ts:22; domains/payment-link.ts:209 |
| 18 | `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` | `preAuth.complete`, `preAuth.completeWithPayout` (both POST this same endpoint) | `pre-auth complete`, `pre-auth complete-payout` | constants.ts:23; domains/pre-auth.ts:92, :133 |
| 19 | `/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` | `preAuth.cancel` | `pre-auth cancel` | constants.ts:24; domains/pre-auth.ts:148 |
| 20 | `/api/payment-gateway/v2/direct-payment/merchant/payout` | `payout.payout` | `payout` | constants.ts:25; domains/payout.ts:81 |
| 21 | `/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout` | `payout.addBeneficiary` | `beneficiary add` | constants.ts:27; domains/payout.ts:111 |
| 22 | `/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status` | `payout.updateBeneficiaryStatus` | `beneficiary update-status` | constants.ts:26; domains/payout.ts:104 |

Transport notes:

- `MUTATION_ENDPOINTS` (`src/constants.ts:41-57`) marks 15 of the 22 as
  side-effecting → single-attempt transport by default
  (`mutationRetryPolicy: 'single' | 'transient'`, `RequestCallOptions` per-call
  `retry` overrides).
- `requestWithMerchantAuth` (RSA `merchant_auth` + HMAC, default fields
  `MERCHANT_AUTH_DEFAULT_HASH_FIELDS = ['request_time','merchant_id','merchant_auth']`
  at `src/client.ts:514`) serves endpoints 9, 16, 17, 18, 19, 21, 22; supports
  a `multipartFile` part (payment-link `image`).
- Per-endpoint HMAC field orders are pinned in `HASH_ORDER_HINTS`
  (`src/client.ts:553-581`) and per-domain constants
  (`PURCHASE_HASH_FIELDS` domains/checkout.ts:63-91, 27 fields;
  `GENERATE_QR_HASH_FIELDS` domains/qr.ts:36-56, 19 fields;
  `LINK_CARD_HMAC_FIELDS` domains/credentials-on-file.ts:61-72, 10 fields).
- Rate-limit rules (client-side token bucket, `src/client.ts:1102-1108`):
  check-transaction 600/s, transaction-detail 10/min, transaction-list 50/min,
  get-transactions-by-mc-ref 10/min, refund 500/s.
- Non-gateway URLs (not PayWay API surface): hosted form plugin
  `https://checkout.payway.com.kh/plugins/checkout2-0.js` (checkout form
  popup mode, domains/checkout.ts:46); mock-server paths `/mock/html`,
  `/api/payment-gateway/v1/payments/purchase`,
  `/api/merchant-portal/merchant-access/payment-link/create|detail` used only
  by the local test harness mock (`src/test/index.ts:170-296`); demo app's own
  local `/api/health`, `/api/payments` endpoints (`src/cli/commands/demo.ts`);
  webhook forwarder/tunnel POST to caller-supplied URLs (no PayWay endpoints).

### Local-only operations (no gateway call)

`qr.generateOfflineQR` / `khqr.generateOfflineQR` (EMVCo KHQR build,
`src/khqr-offline.ts`), `khqr.validateConfiguration` /
`khqr.validateCallbackSetup` (`src/khqr-config.ts`),
`checkout.createTransaction` (payload builder), `checkout.getCheckoutFormHtml`,
`credentialsOnFile.getLinkCardFormHtml` (form builders),
`payway.verifyCallback` / `verifyCallbackDetailed` / module-level
`verifyCallbackSignature` / `signCallbackBody` (webhook HMAC verification,
`src/auth.ts`), `parsePaymentLinkPushback` (pushback parser,
domains/payment-link.ts:264), `parseKhqrPaymentNotification`
(`src/webhook/khqr-notification.ts`), journal/webhook-server/skills/profiles
tooling, sandbox-beneficiary helpers, `sdk.test` / `sdk.runTestSuite` /
mock-server test harness.

## 2. Request fields per endpoint (SDK option names → wire fields)

Wire field names in backticks; option interfaces in `src/client.ts`
(lines given), mapping done in the domain files.

| Endpoint | Params interface (file:line) | SDK options → wire fields sent |
|---|---|---|
| purchase (#1) | `CreateTransactionParams` client.ts:232-295 | transactionId→`tran_id`, amount→`amount`, firstname, lastname, email, phone, type→`type` ('purchase'\|'pre-auth'), paymentOption→`payment_option`, items→`items` (base64), shipping→`shipping`, currency, returnUrl→`return_url` (base64), cancelUrl→`cancel_url` (base64), skipSuccessPage→`skip_success_page`, continueSuccessUrl→`continue_success_url` (base64), returnDeeplink→`return_deeplink` (base64), customFields→`custom_fields` (base64), returnParams→`return_params`, viewType→`view_type`, paymentGate→`payment_gate`, payout→`payout` (base64, keys {acc, amt}), additionalParams→`additional_params` (base64), lifetime (minutes, raw), googlePayToken→`google_pay_token`, ctid→`ctid`, tokenFlag→`token_flag` ('CITR_FIX' only), frequency→`frequency` ('1W'\|'1M'\|'2M'), retryPolicy (transport only) + auto `req_time`, `merchant_id`, `hash` |
| check-transaction-2 (#2) | positional `transactionId, requestTime` | `tran_id`, `req_time` (+ auto `merchant_id`, `hash`) |
| close-transaction (#3) | positional | `tran_id`, `req_time` |
| transaction-detail (#4) | positional | `tran_id`, `req_time` |
| transaction-list-2 (#5) | `GetTransactionListParams` client.ts:495-504 | fromDate→`from_date`, toDate→`to_date`, fromAmount→`from_amount`, toAmount→`to_amount`, status→`status`, page→`page`, pagination→`pagination`, requestTime→`req_time` |
| get-transactions-by-mc-ref (#6) | positional `merchantRef, requestTime` | `merchant_ref`, `req_time` |
| exchange-rate (#7) | positional `requestTime` | `req_time` |
| generate-qr (#8) | `GenerateQrParams` client.ts:409-438 | transactionId→`tran_id`, amount→`amount`, paymentOption→`payment_option` (default 'abapay_khqr'), callbackUrl→`callback_url` (base64), purchaseType→`purchase_type` ('purchase'\|'pre-auth', default 'purchase'), currency, qrImageTemplate→`qr_image_template` (default 'template2'), requestTime→`req_time`, lifetime (seconds→floored to whole minutes on the wire), items→`items` (base64), firstName→`first_name`, lastName→`last_name`, email→`email`, phone→`phone`, returnDeeplink→`return_deeplink` (base64), customFields→`custom_fields` (base64), returnParams→`return_params`, payout→`payout` (base64, keys {account, amount}) |
| refund (#9) | positional `transactionId, amount, currency` | `tran_id`, `refund_amount` (inside RSA `merchant_auth`) |
| aof/link-account (#10) | `LinkAccountParams` client.ts:297-308 | requestId→`request_id`, ctid→`ctid`, returnDeeplink→`return_deeplink` (base64), tokenFlag→`token_flag`, currency, callbackUrl→`callback_url` (base64), requestTime→`request_time` |
| cof/link-card (#11) | `LinkCardParams` client.ts:310-333 | requestId→`request_id`, ctid→`ctid`, tokenFlag→`token_flag`, frequency→`frequency`, continueSuccessUrl→`continue_success_url`, callbackUrl→`callback_url` (base64), currency (default 'USD'), requestTime→`request_time`; returnUrl/returnDeeplink are `@deprecated` and NOT sent |
| purchase/payment-credential (#12) | `CofPaymentParams` client.ts:335-366 | transactionId→`tran_id`, amount→`amount`, ctid→`ctid`, paymentToken→`pwt`, tokenFlag→`token_flag`, currency (default 'USD'), callbackUrl→`callback_url` (base64), requestTime→`request_time`, firstName→`first_name`, lastName→`last_name`, email→`email`, phone→`phone`, purchaseType→`purchase_type` ('purchase'\|'pre-auth'), items→`items` (base64), returnParams→`return_params`, payout→`payout` (base64, keys {acc, amt}), customFields→`custom_fields` (base64), shippingFee→`shipping_fee`; requestId `@deprecated` and NOT sent |
| renew-expired-account-token (#13) | `RenewTokenParams` client.ts:373-378 | requestId→`request_id`, ctid→`ctid`, paymentToken→`pwt`, requestTime→`request_time` |
| get-token-details (#14) | `GetTokenDetailsParams` client.ts:385-388 | requestId→`request_id` ONLY (+ auto `request_time`, `merchant_id`) |
| remove-token (#15) | `RemoveTokenParams` client.ts:395-399 | ctid→`ctid`, paymentToken→`pwt`, requestTime→`request_time` (NO request_id) |
| payment-link/create (#16) | `CreatePaymentLinkParams` client.ts:455-476 | title, amount, description, paymentLimit→`payment_limit`, returnUrl→`return_url` (base64), merchantRefNo→`merchant_ref_no`, expiredDate→`expired_date`, currency (default 'USD'), payout→`payout` (JSON string inside merchant_auth, keys {acc, amt}), image→multipart part `image` (NOT hashed); all inside RSA `merchant_auth` except image |
| payment-link/detail (#17) | positional `paymentLinkId` | `id` (inside merchant_auth) |
| pre-auth-completion (#18) | positional `transactionId, amount, opts` (`PreAuthCompleteOptions` pre-auth.ts:8-19; `PreAuthCancelOptions` :21-25) | `tran_id`, `complete_amount`, idempotencyKey→`idempotency_key`, (completeWithPayout) `payout` [{acc, amt}] (inside merchant_auth) |
| pre-auth-cancellation (#19) | positional `transactionId, opts` | `tran_id`, idempotencyKey→`idempotency_key`, reason→`reason` (inside merchant_auth) |
| payout (#20) | `PayoutParams` client.ts:478-484 | transactionId→`tran_id`, amount, beneficiaries→`beneficiaries` (RSA-encrypted, keys {account, amount}), currency, customFields→`custom_fields` |
| add-whitelist-payout (#21) | `AddBeneficiaryParams` client.ts:491-493 | `payee` (inside merchant_auth) |
| update-whitelist-status (#22) | `UpdateBeneficiaryStatusParams` client.ts:486-489 | `payee`, `status` (0\|1) (inside merchant_auth) |

Every method also accepts a trailing `callOptions?: RequestCallOptions`
(client.ts:222-230: `timeoutMs`, `signal`).

## 3. Full public export list (`src/index.ts` — the published surface)

### Values (functions / classes / constants)

- `paymentArtifact`, `paymentLifecycle`, `paymentNextStep` (payment-lifecycle)
- `PayWay` (the client class), `verifyCallbackDetailed`, `verifyCallbackSignature` (client.ts / auth.ts re-exports)
- `client` (client-handler Module 2 facade)
- `defaultViewerCommandForPlatform`, `openImageInDefaultViewer` (open-image)
- `PAYMENT_STATUS_CODES`, `PAYMENT_STATUS_LABELS`, `REFUND_ERROR_CODES`, `PRE_AUTH_ERROR_CODES`, `PAYOUT_ERROR_CODES`, `GATEWAY_CODE_HINTS` (constants)
- `PAYMENT_LINK_EXPIRY_MIN_SECONDS`, `parsePaymentLinkPushback` (payment-link domain)
- Error classes: `PayWayAPIError`, `PayWayBusinessError`, `PayWayConfigError`, `PayWayError`, `PayWayNetworkError`, `PayWayRateLimitError`, `PayWaySignatureError`, `PayWayWebhookError`, `PollingAbortedError`
- Resilience/observability: `CircuitBreaker`, `CircuitOpenError`, `DEFAULT_CIRCUIT_BREAKER_OPTIONS`, `createPayWayLogger`, `resolveLogLevel`
- Journal: `DEFAULT_JOURNAL_DIR_NAME`, `DEFAULT_JOURNAL_FILE_NAME`, `JOURNAL_VERSION`, `createJournalEmitter`, `JsonlJournalSink`, `pruneJournal`, `readJournalEvents`, `resolveJournalConfig`, `reconcileTransactions`, `computeJournalStats`, `detectJournalAnomalies`, `explainTransaction`
- Token lifecycle helpers: `computeTokenExpiry`, `daysUntilTokenExpiry`
- Validation constants: `PURCHASE_LIFETIME_MIN_MINUTES`, `QR_LIFETIME_MAX_SECONDS`, `QR_LIFETIME_MIN_SECONDS`, `REQUEST_ID_PATTERN`, `TOKEN_FLAG_CHARGING`, `TOKEN_FLAG_LINKING`, `TOKEN_VALIDITY_DAYS`
- Webhook: `createWebhookServer`, `WebhookForwarder`, `parseForwardHeaders`, `buildWebhookFixture`, `WEBHOOK_FIXTURE_EVENTS`, `signCallbackBody`
- KHQR config: `resolveKhqrConfiguration`, `validateKhqrCallbackSetup`, `validateKhqrConfiguration`
- Offline KHQR: `inspectKhqrPayload`, `khqrCrc16`, `validateKhqrCrc`
- Facade/Modules: `sdk`, `normalizePaywayResponse`, `server`
- Test harness: `DEFAULT_TEST_CASES`, `formatTestReport`, `generateMockSession`, `getMockPaywayUrl`, `runTestSuite`, `startMockPaywayServer`, `stopMockPaywayServer`, `validateSessionContract`
- Refund utils: `computeRefundableBalance`, `isValidPublicKeyPem`, `validateRefundAmount`
- Sandbox registry: `listSandboxBeneficiaries`, `validateSandboxBeneficiary`
- KHQR notification: `extractJsonPayload`, `parseKhqrPaymentNotification`
- Webhook storage: `createStorage`

### Types (type-only exports)

- payment-lifecycle: `PaymentArtifact`, `PaymentLifecycle`
- client.ts params/config: `AddBeneficiaryParams`, `CofPaymentParams`, `CreatePaymentLinkParams`, `CreateTransactionParams`, `Currency`, `Environment`, `GenerateQrParams`, `GetTransactionListParams`, `ItemEntry`, `LinkAccountParams`, `LinkCardParams`, `PayoutParams`, `PayWayConfig`, `PaymentLinkImage`, `RateLimitInfo`, `RateLimitRule`, `RequestCallOptions`, `TokenParams` (deprecated alias), `UpdateBeneficiaryStatusParams`
- auth: `CallbackVerificationFailure`, `CallbackVerificationResult`
- client-handler: `ClientModule`
- open-image: `OpenImageResult`
- domains: `CheckoutDomain`, `CheckoutFormOptions`, `CredentialsOnFileDomain`, `LinkCardFormOptions`, `KhqrDomain`, `PaymentLinkDomain`, `PaymentLinkPushback`, `PaymentLinkPushbackStatus`, `PayoutDomain`, `PreAuthDomain`, `QrDomain`
- errors: `PollAbortReason`
- circuit-breaker: `CircuitBreakerOptions`, `CircuitState`
- logger: `LogLevel`, `LogSink`, `PayWayLogger`, `PayWayLoggerOptions`
- journal: `JournalContext`, `JournalEmitterInput`, `JournalErrorInfo`, `JournalEventKind`, `JournalEventV1`, `JournalMode`, `JournalOptions`, `JournalSink`, `JournalFileRead`, `JournalPruneResult`, `ReconcileEntry`, `ReconcileOptions`, `ReconcileReport`, `JournalErrorRow`, `JournalFunnel`, `JournalLatencyRow`, `JournalRetryRow`, `JournalStatsOptions`, `JournalStatsReport`, `AnomaliesReport`, `JournalAnomaly`, `RcaOptions`, `RcaReport`, `RcaStep`
- webhook server/forwarder/fixtures: `WebhookServerOptions`, `WebhookServerResult`, `ForwardOutcome`, `ForwardStats`, `WebhookForwarderOptions`, `WebhookFixture`, `WebhookFixtureEvent`, `WebhookFixtureOverrides`
- khqr-config: `KhqrCallbackConfiguration`, `KhqrCallbackEnrollment`, `KhqrCallbackReadiness`, `KhqrCallbackValidationOptions`, `KhqrCallbackVerification`, `KhqrConfigurationIssue`, `KhqrConfigurationReadiness`, `KhqrMerchantConfiguration`
- khqr-offline: `GenerateOfflineQrParams`, `KhqrPayloadInspection`
- schema.ts: `HandleResponseOptions`, `HandleResponseResult`, `InitiateTransactionPayload`, `ResponseType`, `SessionStatus`, `TestCase`, `TestResult`, `TestSuiteReport`, `TransactionSession`
- sdk/server/test: `Sdk`, `ServerModule`, `TestHarnessDeps`
- domain-types: `PendingPaymentStatus`, `PollTransactionOptions`, `PollTransactionResult`, `PurchaseHostedHtmlResult`, `TerminalPaymentStatus`, `LinkCardResponse`
- utils: `RefundMoneySide`, `RefundableBalanceResult`
- sandbox-beneficiaries: `BeneficiaryKind`, `SandboxBeneficiary`, `SandboxCurrency`, `ValidateSandboxBeneficiaryOptions`
- khqr-notification: `KhqrPaymentNotification`, `ParsedKhqrPaymentNotification`
- webhook storage: `KhqrWebhookMetadata`, `WebhookRecord`, `WebhookStorage`, `StorageType`

The `PayWay` class public surface (src/client.ts:1058-1795):
constructor(config), getters `lastCorrelationId`, `lastTraceId`, `journal`,
readonly domains `checkout`, `credentialsOnFile`, `qr`, `paymentLink`,
`preAuth`, `payout`, `khqr`, methods `verifyCallback`, `verifyCallbackDetailed`,
`getGatewayErrorDetails`.

## 4. Special-attention findings (a–f)

### a. online-self-activation / get-mc-credential-info / get-mc-info — DOES NOT EXIST

Grep for `self-activation|selfActivation|self_activation|new-merchant|mc-credential|get-mc-info|activation|merchant-registration|self-register|merchant-credential|get-mc|mc-info` across all of `src/` (excluding tests): the ONLY hit is
`src/cli.ts:3948` — a help-text line `Activation is usually manual/async — confirm status via beneficiary update-status.`
(about beneficiary whitelist activation, not merchant self-registration).
There is no endpoint, SDK method, or CLI command for online self-activation,
new-merchant registration, `get-mc-credential-info`, or `get-mc-info`.

### b. Legacy `/api/aof/*` v1 endpoints (request-qr, remove-account, renew-expired-account, pushback-status) — DO NOT EXIST

Grep for `/api/aof`, `aof/`: only hits are the V3 endpoint
`/api/payment-credential/v3/aof/link-account` (constants.ts:13, types.ts:147).
Grep for `request-qr`, `remove-account`, `pushback-status` (any case): zero
hits in `src/`. The only "renew-expired-account" hit is the v3 path
`/api/payment-credential/v3/token-management/renew-expired-account-token`
(constants.ts:17, types.ts:207) — the v3 token-management form, not the
legacy `/api/aof/renew-expired-account` operation. No legacy v1 aof endpoints
are called anywhere.

### c. `/api/payment-gateway/v1/cof/initial` and `/api/payment-gateway/v1/cof/remove` — DO NOT EXIST

Grep for `cof/initial`, `cof/remove`, `v1/cof`, `payment-credential/v1`,
`/v1/aof` across `src/`: zero hits. The only COF endpoints in the code are the
v3 pair `/api/payment-credential/v3/cof/link-card` (constants.ts:14) and the
v3 purchase charge `/api/payment-gateway/v3/purchase/payment-credential`
(constants.ts:15), plus v3 token-management trio. No v1 COF initial/remove
code path exists in SDK or CLI.

### d. payment-link void — DOES NOT EXIST

Grep for `payment-link/void`, `link/void`, `voidLink`, `void-link`, and "void"
near the payment-link domain: zero hits in `src/domains/payment-link.ts` and
no `payment-link void` CLI command (payment-link group has only `create` and
`detail`, cli.ts:3153, :3361). The only "void"-adjacent wording is the
pre-auth `cancel` command description "Cancel (void) an open PayWay
pre-authorization" (cli.ts:4330) — the pre-auth cancellation endpoint, not
payment-link void. The `PaymentLinkDomain` interface (payment-link.ts:39-48)
exposes only `create` and `getDetails`.

### e. WeChat / Alipay `payment_option` in generate-qr — EXISTS (accepted values, with a USD-only advisory)

- `PAYMENT_OPTIONS = ['cards', 'abapay_khqr', 'abapay_khqr_deeplink', 'alipay', 'wechat', 'google_pay']`
  (`src/constants.ts:274`, type `PaymentOptionName` :276).
- `GenerateQrParams.paymentOption: 'abapay_khqr' | string` (client.ts:412) —
  the SDK accepts any string; union members don't list wechat/alipay but
  `string` allows them.
- `qr.generateQr` has an explicit wechat/alipay branch (domains/qr.ts:83-91):
  if `paymentOption === 'wechat' || 'alipay'` and currency is not USD it
  warns "payment_option ... is USD-only per the QR API docs".
- CLI: `generate-qr --payment-option <option>` (cli.ts:2219); non-TTY runs
  validate the value against `PAYMENT_OPTIONS` (cli.ts:2372-2374) and the
  interactive picker lists all `PAYMENT_OPTIONS` (src/cli/flows/qr-flow.ts:61-65,
  with display labels `alipay: 'Alipay'`, `wechat: 'WeChat Pay'` at
  qr-flow.ts:72-73). Default `abapay_khqr` (qr.ts:120).

### f. pre-auth (`purchase_type: 'pre-auth'`) on the QR path — EXISTS

- `GenerateQrParams.purchaseType?: 'purchase' | 'pre-auth'` (client.ts:414),
  sent as `purchase_type: params.purchaseType || 'purchase'`
  (domains/qr.ts:119), and part of the generate-qr hash order
  (`GENERATE_QR_HASH_FIELDS` includes `'purchase_type'`, qr.ts:46).
- Also exposed on the checkout purchase path: `CreateTransactionParams.type?: 'purchase' | 'pre-auth'`
  (client.ts:239 → `type` wire field, checkout.ts:376; CLI `generate-checkout --type`,
  cli.ts:2812) and the CoF charge path: `CofPaymentParams.purchaseType?: 'purchase' | 'pre-auth'`
  (client.ts:355 → `purchase_type`, credentials-on-file.ts:417; CLI `cof charge --purchase-type`,
  cli.ts:3786/3819). Note the QR CLI (`generate-qr`) does NOT surface a
  `--purchase-type` flag (no flag at cli.ts:2211-2210 block) — the option is
  SDK-only on the QR path.

## 5. Local validation rules summary (src/utils.ts, src/schema.ts, constants.ts)

Hard throws (`PayWayConfigError`), enforced client-side:

- `validateCurrency` (utils.ts:48): currency must be `USD` or `KHR`.
- `validatePositiveAmount` (utils.ts:54): amount > 0; USD max 2 decimals; KHR integer.
- `validateTransactionId` (utils.ts:128): tran_id ≤ 20 chars, `/^[a-zA-Z0-9-]+$/`; < 5 chars warns once.
- `validateQrLifetimeSeconds` (utils.ts:170): QR lifetime ≥ 180s (3 min, `QR_LIFETIME_MIN_SECONDS`); > 120 days (`QR_LIFETIME_MAX_SECONDS`) warns once.
- `validatePurchaseLifetimeMinutes` (utils.ts:191): purchase lifetime ≥ 3 minutes (`PURCHASE_LIFETIME_MIN_MINUTES`); > 43200 advisory only.
- `validateRequestIdOrCtid` (utils.ts:280): requestId/ctid `[a-zA-Z0-9]{5,24}` (`REQUEST_ID_PATTERN` constants.ts:225).
- `validateTokenFlag` (utils.ts:295): linking = `CITI_FLEX|CITO_FLEX|CITO_FIX|CITR_FLEX`; charging = `CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX` (constants.ts:221-222).
- `validatePublicHttpsUrl` (utils.ts:243): callback/return URLs must be public HTTPS (private/loopback hosts rejected unless `allowPrivateCallbackHosts`).
- `validatePayoutEntryShape` (utils.ts:96): purchase-path payout entries must be `{acc: string, amt: number>=0}` (wrong keys throw — W1-5).
- `validateBeneficiaries` (utils.ts:347): payout beneficiary list non-empty; amounts sum to total (minor-unit compare).
- `validateRefundAmount` (utils.ts:385): USD ≥ 0.01, KHR ≥ 100 (PTL04 parity).
- Payment-link create (payment-link.ts:64-99): `title` required (≤250 advisory); `merchantRefNo` required (≤50 advisory); `description` ≤ 250 (hard throw); `returnUrl` required + public HTTPS; `amount` positive.
- Link-account/link-card (credentials-on-file.ts): requestId/ctid/tokenFlag required; link-card token_flag further warned to `CITI_FLEX|CITO_FLEX`; link-account requires `currency`.
- CoF payment: `paymentToken` required.
- Pre-auth `validateOverCapture` (pre-auth.ts:53): complete amount ≤ `originalAmount * maxOverCapturePct%` (default 110) when originalAmount given.
- Subscription on purchase (checkout.ts:346-366): `tokenFlag` ⇒ `ctid` required; only `'CITR_FIX'` allowed on purchase path; `frequency` required iff CITR_FIX; frequency without tokenFlag throws.
- `google_pay` purchase requires `googlePayToken` (checkout.ts:338-340).

Advisory warnings (`warnAdvisory`, escalate under `config.strictValidation` /
`PAYWAY_STRICT_VALIDATION=1`, utils.ts:36):

- Amount floors (utils.ts:75): KHR ≥ 100, USD ≥ 0.01 on payout/CoF/QR/payment-link (`validateAmountFloor`).
- Purchase: firstname ≤ 100 (no digits/specials), lastname ≤ 100, email ≤ 50, phone ≤ 20, items ≤ 10 entries / ≤ 500 chars encoded, lifetime ≤ 43200, payment_option membership in `PAYMENT_OPTIONS`.
- QR: firstName/lastName/phone ≤ 20, email ≤ 50, items ≤ 10, wechat/alipay USD-only, QR lifetime > 120 days.
- Transaction-list: dates "YYYY-MM-DD HH:mm:ss" (err 49/50), range ≤ 3 days (err 52), pagination ≤ 1000, status in `APPROVED|PRE-AUTH|REFUNDED|PENDING|DECLINED|DECLINED|CANCELLED` (case-insensitive; note the "DECLINDED" spelling is in the allowed list as-is, checkout.ts:615).
- Payment-link: title ≤ 250, merchantRefNo ≤ 50, payout-total == link amount, image ≤ 3MB and JPG/JPEG/PNG, expired_date in the past or < 300s ahead (`PAYMENT_LINK_EXPIRY_MIN_SECONDS`).
- get-transactions-by-mc-ref: merchantRef ≤ 20 chars (err 5).
- KHQR callback config validation (`src/khqr-config.ts`): enrollment enum `not-requested|requested|confirmed-by-merchant`.

## 6. Incomplete / marked-as-such domains

- No TODO/FIXME markers exist in SDK domain code. The only TODOs are merchant
  guidance in generated app templates (`src/config/templates/express.ts:47-48`,
  `src/config/templates/nextApp.ts:41-42` — "TODO(merchant): verify the
  callback signature / persist the payment outcome").
- `PaymentLinkDomain` (payment-link.ts:39-48) exposes only `create` and
  `getDetails` — no update/void/delete; not marked TODO, just narrow.
- `CofPaymentParams.requestId` and `LinkCardParams.returnUrl`/`returnDeeplink`
  are `@deprecated` and intentionally NOT sent (client.ts:314-320, :336-337).
- `types.ts` line 33 note (auto-generated OpenAPI skeleton): check-transaction-2
  doc says "For transactions older than 7 days, use Get Transaction Details
  instead (not in this skeleton — add before shipping if needed)" — the SDK
  DOES implement transaction-detail (endpoint #4), so this skeleton note is
  satisfied.
- PAYMENT_LINK_HINTS (constants.ts:207-211) records that PTL99 (merchant
  invalid currency) and PTL132 (invalid payment link) are documented but not
  sandbox-reproduced; PTL04 is the observed catch-all.
- Backlog/known-behavior notes (not missing endpoints): no remote EXPIRED or
  CLOSED status exists in any read API (close-transaction kills QRs but hosted
  card sessions may still pay — docs/CLOSE-TRANSACTION-FINDINGS.md);
  `allowUnverifiedTokenOperations` is a deprecated opt-out only
  (client.ts:152-158).
