# Skills Audit — Group B (CoF, Tokens, Hash, SDK Config, Test Harness)

Audited: 2026-09-03 · Repo: `D:\Antigravity_google\SDK-prepration` · Platform: win32 / Git Bash / Node v22.14.0
Skills audited (10): aba-payway-cof, aba-payway-link-account, aba-payway-link-card, aba-payway-token-lifecycle, aba-payway-token-purchase, aba-payway-remove-account, aba-payway-remove-card, aba-payway-hash, aba-payway-sdk-configuration, aba-payway-test-harness.

Copies check: `.zcode/skills/aba-payway-*/SKILL.md` and `skills/aba-payway-*/SKILL.md` are byte-IDENTICAL for all 10 skills, including the 3 hash scripts (`diff -r` clean).

Overall verdict: **10/10 PASS with minor gaps** — no wrong flags, no wrong hash orders, no broken scripts. Gaps are documentation omissions, not errors.

---

## 1. aba-payway-cof (v1.0.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| `linkAccount({requestId, ctid, tokenFlag, currency, callbackUrl, returnDeeplink})` params | PASS | `src/domains/credentials-on-file.ts` linkAccount(): ctid/tokenFlag/currency required (PayWayConfigError thrown), `return_deeplink` optional, base64-encoded |
| `getLinkCardFormHtml()` + frequency-omitted warning | PASS | CLI output: `⚠ link-card frequency is live-documented as required for Link Card (1W\|1M\|2M); card linking may fail without it` |
| `linkCard()` API path always answers hosted HTML; CLI saves to `payway-output/link-card-<request-id>.html`, exits 0 | PASS | HANDOFF.md line 66; help text confirms `--open-page`/`--no-open-page` |
| `returnUrl`/`returnDeeplink` NOT sent on link-card | PASS | `credentials-on-file.ts:195-199` — advisory warn "no longer sent" |
| Charging flags `CITU_FLEX\|MITU_FLEX\|MITU_FIX\|MITR_FLEX\|MITR_FIX` | PASS | `cof charge --help`: exactly these 5; `constants.ts` |
| Linking flags not valid on charges | PASS | `validateTokenFlag(params.tokenFlag, 'charging')` path; form rejects BOGUS with linking enum |
| §16 link-account hash `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency` | PASS | `HASH_ORDER_HINTS[ENDPOINTS.linkAccount]` identical, `client.ts:478` |
| §16 link-card hash + amount/frequency hash as `''` | PASS | `LINK_CARD_HMAC_FIELDS` (10 fields, merchant_id first) — **and reproduced byte-for-byte locally** from the generated form (see §12 below) |
| §16 charge hash (19 fields, **no request_id**) | PASS | `HASH_ORDER_HINTS[ENDPOINTS.payment]` identical; `payment()` body does not send request_id ("§16-verified: request_id is NOT sent") |
| `payment()` params: items/returnParams/payout `{acc,amt}`/customFields/shippingFee | PASS | All in the request body construction at `credentials-on-file.ts:391-410` (payout/customFields/items base64-encoded) |
| Error families: `04`+errors → PayWayBusinessError.fieldErrors; `1`/`01`/PTL02 → PayWaySignatureError; 98/104/105/09 hints | PASS | `client.ts` B5 classifier + `CODE_HINTS` map exactly lists 98/104/105/09 with matching text |
| CLI examples (`payway-sdk cof link-account/link-card-form/link-card/charge`) | PASS | All flags exist in `cof --help` outputs; program name IS `payway-sdk` (Usage line) |
| `PayWayBusinessError`/`PayWaySignatureError` importable from `aba-payway-ts` | PASS | `src/index.ts:56`, `src/errors.ts:143,77` |

---

## 2. aba-payway-link-account (v1.3.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| `[a-zA-Z0-9]{5,24}` rule for requestId/ctid, "no hyphens" | PASS | CLI: `✗ ctid must be 5–24 characters containing only letters and digits ([a-zA-Z0-9]{5,24}, gateway-enforced), received: "abc"` exit 1 |
| ctid/tokenFlag/currency REQUIRED (v1.3.6) | PASS | SDK throws PayWayConfigError on missing ctid/currency/tokenFlag; CLI commander requires `-r`, `-c`, `-f` |
| CITI_FLEX \| CITO_FLEX "live-documented" | PASS (with nuance) | Help says "Live-documented values"; sandbox additionally accepts `CITO_FIX`/`CITR_FLEX` — CLI accepts them with advisory warn (`credentials-on-file.ts:256-260`). See Gaps. |
| Hash order (8 fields, merchant_id first) | PASS | matches `HASH_ORDER_HINTS.linkAccount` |
| `--return-deeplink` JSON-or-string, optional but IS a hash position, base64 before hashing | PASS | CLI flag exists; `encodeBase64IfNeeded(params.returnDeeplink)` |
| QR/deeplink expires in 10 minutes | PASS (doc-only) | `src/types.ts:158,869` ("expires in 10 minutes", live docs) — not locally testable |
| `PayWayConfigError` importable; 400 code "04" + `errors{}` map in `error.rawBody.status.errors` | PASS | class exported; `04` classifier in client.ts B5 |
| CLI command/flags | PASS | `cof link-account --help` has `-r -c -f --currency --callback-url --return-deeplink --json` |

Missing-required-flag errors (exact):
- `npx tsx src/cli.ts cof link-account` → `error: required option '-r, --request-id <id>' not specified`, **exit 1**
- missing `-f` → `error: required option '-f, --token-flag <flag>' not specified`, **exit 1**

---

## 3. aba-payway-link-card (v1.2.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| urlencoded only, always answers HTML (success AND error) | PASS | consistent with domain code + HANDOFF; not re-live-tested (API path forbidden this audit) |
| `getLinkCardFormHtml({requestId, ctid, tokenFlag, frequency, callbackUrl, continueSuccessUrl})` | PASS | executed offline via CLI; HTML hidden fields match |
| Form options `{formId, autoSubmit, submitLabel, omitSubmitButton}`; no `popupMode` | PASS | `LinkCardFormOptions` at `credentials-on-file.ts:40-56`; `popupMode` exists only in `CheckoutFormOptions` (`checkout.ts:38`) — and cli.ts:1509 passes it only for the checkout form. `link-card-form --help` has no `--popup`. |
| `currency` defaults USD, `frequency` optional 1W\|1M\|2M | PASS | help + `--currency` default `"USD"`; but see GAP on 3M (not rejected) |
| API call throws PayWayBusinessError with hosted page in `rawBody` | PASS | matches HANDOFF capture flow (`PayWayBusinessError.rawBody` → saved file, exit 0) |
| CLI link-card-form: stdout or `-o`, auto request id, opens on TTY | PASS | executed: auto ID `lcmtkdm8xmac21b4` (16 alnum), `-o` wrote file, exit 0, non-TTY so no viewer opened |
| §16 hash order incl. `amount` hash position with NO body field | PASS **(byte-verified)** | Recomputed HMAC over `merchant_id.request_time.ctid.callback_url(request_id/token_flag)…` from the generated form's hidden inputs with frequency/amount/continue_success_url = `''` → `local hash matches form hash: true`. `callback_url` is base64 in both body and hash. |
| Sandbox does not verify hash on this endpoint (open question) | UNVERIFIABLE here | marked as sandbox finding in skill; consistent with repo docs |
| pwt arrives ONLY via callback_url; verify with `verifyCallback(body, sig, {stripHash: true})` | PASS | `PayWayClient.verifyCallback(body, sig, options?: {stripHash?: boolean})` exists at `client.ts:1522-1527` |
| Sandbox Facts block (42 KB hosted page, evidence file) | PASS (file exists) | `test-output/link-card-form-live-probe-2026-09-01.json` referenced; API path not re-run (forbidden) |

Generated form hidden fields (offline run):
```
request_id=lcmtkdm8xmac21b4  ctid=customer123  token_flag=CITI_FLEX
callback_url=<base64 of https://merchant.example/cof-callback>
currency=USD  request_time=20260902173454  merchant_id=ec476910  hash=<b64>
<form method="POST" action="https://checkout-sandbox.payway.com.kh/api/payment-credential/v3/cof/link-card" id="aba_link_card_request">
```
No `amount`/`frequency` body fields (hash-only positions) — exactly as the skill documents.

Validation edge cases (all exit 1, clean messages):
- `cof link-card-form` (no flags) → `error: required option '-c, --ctid <ctid>' not specified`
- `-f BOGUS_FLAG` → `✗ tokenFlag "BOGUS_FLAG" is not valid for linking; accepted values: CITI_FLEX, CITO_FLEX, CITO_FIX, CITR_FLEX`
- `-c abc` → `✗ ctid must be 5–24 characters containing only letters and digits ([a-zA-Z0-9]{5,24}…)`
- `--callback-url http://localhost:3000/cb` → `✗ callbackUrl must be a public HTTPS URL without surrounding whitespace`
- **GAP:** `--frequency 3M` is NOT rejected — form generates with exit 0 (frequency only type-cast `'1W'|'1M'|'2M'` in TS; no runtime enum check; advisory warn only when *absent*).

---

## 4. aba-payway-token-lifecycle (v1.0.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| 90-day expiry (account tokens), renewal extends 90 days; "linking, renewal, or last successful transaction (whichever most recent)" | PASS | `constants.ts:192 TOKEN_VALIDITY_DAYS = 90`; `types.ts` renewToken path description matches word-for-word |
| Card tokens cannot be renewed | PASS | same types.ts comment |
| renew: `requestId + ctid + paymentToken`; hash `ctid.request_time.pwt.merchant_id.request_id` | PASS | `RenewTokenParams` + `HASH_ORDER_HINTS.renewToken` identical |
| details: `requestId` ONLY; hash `merchant_id.request_time.request_id` | PASS | `GetTokenDetailsParams`; CLI: `cof token details` has `-r` only — `-c` → `error: unknown option '-c'`, exit 1 |
| remove: `ctid + paymentToken`, NO requestId; hash `merchant_id.ctid.request_time.pwt` | PASS | `RemoveTokenParams`; CLI `cof token remove -r …` → `error: unknown option '-r'`, exit 1 |
| `computeTokenExpiry` / `daysUntilTokenExpiry` / `TOKEN_VALIDITY_DAYS` exported | PASS | `src/index.ts:69,77`; `utils.ts:302-324` (accepts Date, epoch ms, ISO string; throws PayWayConfigError on invalid) |
| `allowUnverifiedTokenOperations` deprecated escape hatch, default ALLOWED, explicit `false` re-blocks | PASS | `client.ts:91` comment + types |
| Future charges decline with purchase error 87; ABA Mobile user notified | PASS (doc-only) | `types.ts:258` (live-doc quote); no local code path (correct — it is a gateway behavior) |
| Error hints 105/104/09/1-01 | PASS | `CODE_HINTS` in client.ts has all four with matching semantics |
| CLI trio flags | PASS | `cof token renew --help` = `-r -c --token --json`; `details` = `-r --json`; `remove` = `-c --token --json` |

Missing-flag errors: `cof token details` → `error: required option '-r, --request-id <id>' not specified` (exit 1); `cof token remove` → `error: required option '-c, --ctid <ctid>' not specified` (exit 1); `cof token renew -r x -c y` → `error: required option '--token <pwt>' not specified` (exit 1). renew/remove NOT executed against the sandbox (forbidden — irreversible/mutating).

---

## 5. aba-payway-token-purchase (v1.2.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| v1.3.6: requestId NOT sent on CoF payment path; binding layer no longer requires it | PASS | `payment()` body omits request_id; comment "§16-verified: request_id is NOT sent" |
| `transactionId` rule `[a-zA-Z0-9-]{1,20}` | PASS | `utils.ts:128-141 validateTransactionId`: ≤20 chars, `/^[a-zA-Z0-9-]+$/` |
| `currency` defaults USD; KHR floor 100 | PASS | `validateAmountFloor`: KHR≥100, USD≥0.01 — advisory warn (not hard error) unless strictValidation |
| `ctid` optional on repeat charges | PASS | `if (params.ctid !== undefined) validate…` |
| Charge flag enum (CITU_FLEX…) | PASS | CLI `--token-flag` help lists exactly the 5 charging flags |
| Hash order (19 fields) | PASS | matches `HASH_ORDER_HINTS.payment` |
| CLI: `cof charge -t order-123 -a 10.00 --token <pwt>` | PASS | flags exist; missing-flag errors: `-t` required, `--token` required (both exit 1). Charge NOT executed (forbidden). |
| "Never log or expose the payment token" | PASS (n/a) | guidance only |

---

## 6. aba-payway-remove-account (v1.2.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| `removeToken({ctid, paymentToken})` ONLY — no requestId | PASS | `RemoveTokenParams`; CLI rejects `-r` with `error: unknown option '-r'` |
| ctid rule `[a-zA-Z0-9]{5,24}` | PASS | same validator as link-account |
| Hash order `merchant_id.ctid.request_time.pwt` | PASS | `HASH_ORDER_HINTS.removeToken` |
| Unified endpoint for account AND card | PASS | `types.ts:258` "Removes a linked account OR card token" |
| Un-gated trio; TD-03 resolved 2026-08-31 | PASS | client.ts comments + sdk-configuration skill agree |
| Codes 104/105/09 token-state hints | PASS | `CODE_HINTS` |
| `PayWayAPIError` importable, has `statusCode` | PASS | `errors.ts:39` PayWayAPIError |
| CLI example | PASS | `cof token remove --ctid credential01 --token <pwt>` flags exist; NOT executed (irreversible) |

## 7. aba-payway-remove-card (v1.2.0) — PASS
Essentially identical to remove-account (differs only in one phrasing line + Related link). All the same checks PASS. No inaccuracies found. Note: it is the only skill of the 10 whose "Related Skills" section omits a link back to remove-account — cosmetic only.

---

## 8. aba-payway-hash (v1.2.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| `payway.verifyCallback(req.body, req.headers['x-payway-hmac-sha512'])` | PASS | `client.ts:1522` `public verifyCallback(body, signature, options?)` |
| Header is `X-PAYWAY-HMAC-SHA512`; "do not read from req.body.hash" | PASS | `types.ts:2104`, template files use `x-payway-hmac-sha512`; `stripHash` option exists precisely for body-embedded hash |
| verify-callback.cjs: exit 0 valid / 1 INVALID / 2 usage | PASS | Tested: valid round-trip exit 0; tampered sig exit 1; wrong key exit 1; missing body/sig/key and invalid JSON → exit 2 with clear messages |
| Algorithm: sorted-key concat → HMAC-SHA512 → Base64 → timing-safe | PASS | Matches `src/auth.ts verifyCallbackDetailed`; nested objects JSON-encoded, null → `''`, length-mismatch sig keeps constant-time shape |
| sign-request.cjs presets checkout/check-transaction/get-mc-ref/exchange-rate + `--fields` | PASS | All 4 presets ran; 26-field checkout preset order is byte-identical to `PURCHASE_HASH_FIELDS` (`checkout.ts:58-85`) — drift-guard also pins this |
| Subscription signing (`--ctid --token-flag CITR_FIX --frequency 1M`) signs correctly; ctid has NO hash position | PASS | Ran: hash computed over 26 fields; `payload.ctid` added to body only (script comment matches live 26-field order) |
| Omitted fields hash as `''` (plain purchases unchanged) | PASS | `--show-string` concat shows `…10.00<base64 return_url>USD` with empty gaps |
| mock-callback.cjs: `--url --tran-id --amount` (+ status/currency flags) | PASS | Full loop executed (below) |
| All scripts dependency-free, read PAYWAY_MERCHANT_ID/PAYWAY_API_KEY env or flags, export functions | PASS | `require()`-able exports confirmed (used to build test signatures); sign-request needs merchant-id+api-key, verify/mock need api-key only (skill says "PAYWAY_MERCHANT_ID/PAYWAY_API_KEY" generically — fine) |

**Script test matrix (all executed):**
- sign-request: get-mc-ref valid (exit 0); exchange-rate (2-field) valid; checkout plain (return_url auto-base64'd — `https://…` URLs ARE base64-encoded by `encodeBase64IfNeeded`, a non-obvious behavior); checkout subscription; unknown preset → stack-trace throw exit 1 (ugly but functional); preset+fields together → exit 2; bad `--data` JSON → exit 2; missing credentials → exit 2.
- verify-callback: valid sig → 0; tampered → 1 "INVALID — DO NOT PROCESS. Log and discard (possible spoof/MITM)"; wrong key → 1; empty payload `{}` signed with same algo → 0 (correct: no special case); unicode payload (Khmer `អ`, `José Müller`) round-trip → 0; nested array/object field → 0 (JSON.stringify in concat); length-mismatch sig → 1 (no crash); stdin pipe → 0; invalid JSON/missing body/missing sig/missing key → 2.
- mock-callback: `--example` prints a full 17-field payload (exit 0, no key needed); missing url → usage + exit 2; missing key → exit 2; invalid `--status BOGUS` → thrown Error exit 1 (stack trace); dead port → `Request failed: connect ECONNREFUSED` exit 1; **full end-to-end**: local handler using the script's own `verifyCallback` accepted mock callbacks for APPROVED/USD and DECLINED/KHR → `handler: valid=true`, HTTP 200. Status code map confirmed: APPROVED=0, PENDING=2, DECLINED=3, REFUNDED=4, CANCELLED=7.
- Mock payload data types observed: `apv` string(6 digits), `payment_status_code` NUMBER, `transaction_id` string of ~16 digits (`BigInt(Date.now())*1000n + rand`), `original_amount`/`payment_amount` strings ("10.00"), KHR rounds to integer string.

Windows caveat (environment, not skill): Git Bash `/tmp` does not map for Node (`D:\tmp`); use repo-relative paths with `--body-file`.

---

## 9. aba-payway-sdk-configuration (v1.2.0) — PASS

| CHECK | Verdict | Evidence |
|---|---|---|
| `new PayWay()` from env | PASS | `resolveConfig` reads env in `client.ts:1038-1075` |
| PAYWAY_MERCHANT_ID / PAYWAY_API_KEY required | PASS | missing merchantId → `PayWayConfigError('merchantId is required')`; API key <16 chars → warning |
| Optional: RSA_PUBLIC_KEY, BASE_URL, ENV, SANDBOX, TIMEOUT, LOG_LEVEL, STRICT_VALIDATION, DEBUG_PAYWAY | PASS | all referenced in `resolveConfig` / `envValidator.ts` (full list also includes PAYWAY_CALLBACK_URL, PAYWAY_CANCEL_URL, PAYWAY_RETURN_URL, PAYWAY_PROFILE, PAYWAY_AGENT_API_KEY, PAYWAY_AGENT_BASE_URL, PAYWAY_ONBOARD_AUTO, PAYWAY_APIKEY legacy, PAYWAY_KHQR_*) |
| PAYWAY_ENV: `sandbox`\|`production`; URL value honored as base URL; takes precedence over PAYWAY_SANDBOX | PASS | `envValidator.ts:83-99` accepts named or https-URL; `resolveConfig` checks `PAYWAY_ENV` first, `PAYWAY_SANDBOX==='true'/'false'` only as fallback; `baseUrlFromEnv = parseHttpBaseUrl(namedEnvironment)` but explicit `config.baseUrl ?? PAYWAY_BASE_URL ?? that` |
| PAYWAY_TIMEOUT is a NUMBER (ms) | PASS | `Number.parseInt(PAYWAY_TIMEOUT, 10)`; must be finite > 0; default 30 000 ms when unset (docs at client.ts:992) |
| PAYWAY_LOG_LEVEL (`debug\|info\|warn\|error`) | PASS | `logger.ts` level ladder: explicit logLevel > PAYWAY_LOG_LEVEL > DEBUG_PAYWAY legacy (true/1) |
| PAYWAY_STRICT_VALIDATION (`1`/`true`) | PASS | `client.ts:1060` accepts exactly `'1'` or `'true'` |
| DEBUG_PAYWAY legacy flag | PASS | `'true'` or `'1'` |
| Explicit constructor options take precedence over ALL env vars | PASS | `config.X ?? env.X` pattern throughout resolveConfig |
| `debug: true` controlled environments only; logs redact secrets | PASS (observed) | `config` command redacts: `API Key 05082504••••••••…`, RSA key `-----BEG••••` |
| strictValidation escalates advisory warnings (length caps, enum membership, payout-total, image limits) to PayWayConfigError; default advisory warn-once | PASS | `warnAdvisory(config, …)` pattern + `validateAmountFloor` strict path |
| `allowPrivateCallbackHosts: true` permits private/loopback callback hosts | PASS | `validatePublicHttpsUrl(…, {allowPrivateHosts})` threading in linkAccount/linkCard/payment; CLI rejects localhost by default (tested above) |
| Resilience: `logLevel`, `logFormat: 'json'`, `backoffJitter: 'full'`, `circuitBreaker: {failureThreshold, resetTimeoutMs}` | PASS | `client.ts:111,117,121` — types exist; note `backoffJitter` default is `'none'` (client.ts:1216) and `circuitBreaker` also accepts `false` |
| `allowUnverifiedTokenOperations` DEPRECATED, default ALLOWED, `false` re-blocks, never need `true` | PASS | client.ts:91 comment |
| KHQR env vars (6 listed) or `khqr` config object / CLI profile | PASS | `khqr-config.ts:42-48` maps all 6 (+ a 7th: `PAYWAY_KHQR_PAYWAY_DATA` — see Gaps) |
| `PayWayConfigError` thrown by `new PayWay()` on bad config | PASS | errors.ts:20 |

Sandbox cross-check (`npx tsx src/cli.ts config`, NODE_TLS_REJECT_UNAUTHORIZED='0', exit 0):
```
✓ Environment sandbox · ✓ Merchant ID ec476910 · ✓ API Key 05082504•••• (redacted)
⚠ Base URL (not set) · ✓ Sandbox mode true · ⚠ Timeout (ms) (not set)
✓ RSA Public Key -----BEG•••• · ✓ Callback URL https://clever-flame-09.webhook.cool/…
✗ 1 error(s): PAYWAY_RETURN_URL is missing (required when launching checkout)
```
`doctor` exit 0 ("All credential & connectivity checks passed"; API key length 40 chars; suggests `doctor --live`). `exchange-rate` exit 0: `status.code "00"`, `exchange_rates.usd.sell "4012"` — note `date` field is empty string `""` and all rate values are STRINGS.

---

## 10. aba-payway-test-harness (v1.1.0) — PASS (with gaps)

| CHECK | Verdict | Evidence |
|---|---|---|
| `import { sdk } from 'aba-payway-ts'; await sdk.runTestSuite()` | PASS | `src/index.ts:111` exports `sdk`; `sdk.ts:146 runTestSuite()` |
| `report.success` boolean; `report.results` array with `.passed` per case | PASS | `TestSuiteReport` schema (`schema.ts:172-182`); `sdk.runTestSuiteAndPrint()` also exists (undocumented in skill) |
| "verifies the SDK response contract without merchant-specific production credentials" | PASS | spins an in-process mock PayWay server (`startMockPaywayServer(0)`), mock-merchant creds — fully offline, no real credentials touched |
| Suite executes and passes | PASS | CLI `test`: **Total 5, Passed 5, Failed 0**, ~2.5–2.8 s wall (tsx cold start dominates); exit 0. Cases: Deeplink redirect, QR string render, QR image render, Checkout URL redirect, HTML snippet embed (DOM-dependent actions report `*_skipped_no_dom` in non-DOM runs but still PASS). |

Gaps (doc omissions, not errors):
1. The skill does NOT mention the CLI wrappers `npx tsx src/cli.ts test` and `npx tsx src/cli.ts demo` (both run the same `sdk.runTestSuite()`; `test` prints a boxed per-case report, `demo` prints one-line-per-case; both exit 0/1 on report.success).
2. The skill's error-handling snippet filters `!result.passed` but does not show the `name`/`message` fields available on each result (minor).

---

## Errors encountered (all reproduced, none blocking)

1. `sign-request.cjs --preset nope` → uncaught `Error: Unknown preset …` with full stack trace, exit 1 (works, but inconsistent with the clean exit-2 handling of `--data`/preset+fields errors).
2. `mock-callback.cjs --status BOGUS` → uncaught `Error: Invalid --status "BOGUS". Valid: APPROVED, PENDING, DECLINED, REFUNDED, CANCELLED`, exit 1 (same style inconsistency).
3. Node on Git Bash/Windows cannot open `/tmp/...` paths (resolves to `D:\tmp`) — affects skill users who copy-paste `--body-file /tmp/cb.json` examples on Windows. (The skill's own examples use relative paths — OK.)
4. `npx tsx -e "import { sdk } …"` ran silently without stdout in this environment (exit 0); running the identical code from a file works — likely a tsx `-e`/Git-Bash quirk, not an SDK issue. CLI `test` command (same code path) printed correctly.
5. `cof link-card-form` prints diagnostics to stderr and the HTML to stdout/file — when piping stdout through `head`, the warning banner and HTML interleave confusingly (cosmetic).

## Data types & validation observed

- **pwt**: opaque token string delivered via `callback_url` only (link-account/link-card/renew); never in the HTTP response body. Format not enumerated by the SDK (correct — treat as opaque).
- **request-id / ctid**: `[a-zA-Z0-9]{5,24}`, gateway-enforced; auto-generated link-card-form request IDs are 16 lowercase alnum (e.g. `lcmtkdm8xmac21b4`).
- **transactionId (CoF charge & purchase)**: ≤20 chars, `[a-zA-Z0-9-]+` (hyphens allowed — hence tran_ids like `order-audit-1`).
- **token flags**: linking = `CITI_FLEX|CITO_FLEX` (live-documented; sandbox also accepts `CITO_FIX|CITR_FLEX` with advisory warn); charging = `CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX`; subscription purchase = `CITR_FIX`.
- **frequency**: `1W|1M|2M` — TS type only, NOT runtime-validated (3M passes through silently).
- **amount**: number in SDK; wire format `toFixed(2)` for USD, integer string for KHR; floors USD 0.01 / KHR 100 (advisory unless strict).
- **status codes**: mock `payment_status_code` is a JSON number (0/2/3/4/7); gateway `status.code` values are strings (`"00"`, `"04"`, `"1"`, `"01"`, `"98"`, `"104"`, `"105"`, `"09"`, `PTL02`).
- **hash**: Base64 everywhere in this group (payout is the hex outlier — outside this group). `callback_url`, `return_url`, `items`, `payout`, `custom_fields`, `return_deeplink`, `continue_success_url` are base64-encoded on the wire AND in the hash string; http(s)-looking strings get encoded, non-URL strings pass through (`encodeBase64IfNeeded`).
- **Exit codes observed**: CLI — 0 success, 1 commander/validation/business failure; scripts — 0 valid, 1 invalid/failed, 2 usage. (`exchange-rate`, `config`, `doctor`, `test`, `demo`, `link-card-form` all exit 0 on success; `config` exits 0 even with a missing-PAYWAY_RETURN_URL error noted as "1 error(s)" — that error only matters for checkout launches.)
- **`--json` flag** exists on every `cof*` subcommand (prints raw JSON response envelope).
- **90-day expiry**: `TOKEN_VALIDITY_DAYS = 90` (constants.ts:192); `computeTokenExpiry` accepts Date | epoch-ms | ISO-string and returns Date; renewal window "callback expected within 3 minutes, else fall back to getTokenDetails" matches types.ts.

## Gaps & doc drift

1. **link-card-form does not validate frequency values** — `--frequency 3M` silently generates a signed form (exit 0). The skills say "1W|1M|2M" without noting it is unenforced at runtime. (Minor: gateway would arbitrate.)
2. **Linking token-flag domain is wider than documented**: skills say `CITI_FLEX | CITO_FLEX` (live-documented — technically accurate), but CLI accepts `CITO_FIX | CITR_FLEX` too (advisory warn). A user pasting a sandbox-accepted flag gets a warning, not an error; the skill could mention the 4-value sandbox set.
3. **test-harness skill omits the CLI entry points** `payway-sdk test` / `payway-sdk demo`.
4. **sdk-configuration skill omits** `PAYWAY_KHQR_PAYWAY_DATA` (7th KHQR var), `PAYWAY_CALLBACK_URL`/`PAYWAY_RETURN_URL`/`PAYWAY_CANCEL_URL` (URL vars; RETURN_URL is flagged as a missing-var *error* by `config` when unset), `PAYWAY_PROFILE`, and `PAYWAY_AGENT_*`. Not wrong — just incomplete.
5. **`backoffJitter` default** is `'none'` (client.ts:1216); the skill lists `'full'` as an option without stating the default (the quick-start phrasing could imply it is default-on).
6. `cof` skill's error-family line "PTL02 → PayWaySignatureError" — PTL02 is indeed in the signature-rejection family per client.ts comments (sandbox-verified on refunds); flat `1`/`01` mapping confirmed in code. No drift, noted for completeness since PTL02 handling lives in the refund path.
7. remove-card skill lacks a "Related Skills" cross-link to remove-account (cosmetic asymmetry).

## Interesting facts / discoveries

1. **Link-card hash byte-verified offline**: the locally generated `cof link-card-form` HTML's hidden fields reproduce the §16 hash exactly when you hash `merchant_id + request_time + ctid + callback_url(b64) + request_id + token_flag + '' + '' + currency + ''` — including the quirk that `amount` and `frequency` are hash positions with no body field. The doc claim is reproducible without any network call.
2. The purchase 26-field hash order in sign-request.cjs is pinned to `PURCHASE_HASH_FIELDS` by a drift-guard test (`hash-order-hints.test.ts`), so the script cannot silently drift from the SDK.
3. `encodeBase64IfNeeded` only base64-encodes values that *look like URLs* (`^(https?://|//|www\.)`) when given a string — so `--return-url https://…` is encoded in the hash but a plain string field is not; JSON values (items/payout) are always `base64(JSON.stringify(...))`.
4. The mock callback's `transaction_id` is built as `BigInt(Date.now()) * 1000n + rand(999)` — a millisecond-timestamp-based ~16-digit numeric string, mimicking real gateway IDs.
5. `timingSafeEqual` in verify-callback keeps a constant-time shape even on length mismatch (calls `timingSafeEqual(bufA, bufA)` before returning false) — a deliberate anti-timing-leak detail.
6. `exchange-rate` returns rates as strings (`"4012"`, `"4667.55"`) and an empty `date` field on the sandbox — anyone parsing should expect strings.
7. The `config` command exits 0 even while reporting a missing-var error (`PAYWAY_RETURN_URL`) — the exit-code contract only treats validation *of provided values* as fatal; use `doctor` for a stricter gate.
8. `debug` redaction works as documented: API key shown as first-8-chars + dots; RSA key truncated at `-----BEG`.
9. The whole test suite runs in ~2.5 s fully offline (in-process mock server on port 0) — safe for CI with zero credentials present.
10. All 10 skill copies in `.zcode/skills/` and `skills/` are identical, so fixing a doc gap requires editing both (or re-syncing).

---

### Verdict summary

| Skill | Verdict |
|---|---|
| aba-payway-cof | PASS |
| aba-payway-link-account | PASS |
| aba-payway-link-card | PASS (freq-enum gap) |
| aba-payway-token-lifecycle | PASS |
| aba-payway-token-purchase | PASS |
| aba-payway-remove-account | PASS |
| aba-payway-remove-card | PASS |
| aba-payway-hash | PASS (2 scripts throw stack traces on 2 bad-input paths) |
| aba-payway-sdk-configuration | PASS (some env vars undocumented) |
| aba-payway-test-harness | PASS (CLI `test`/`demo` undocumented) |
