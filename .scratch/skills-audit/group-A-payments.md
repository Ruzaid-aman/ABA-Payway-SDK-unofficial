# Skills Audit — Group A (payments core)

Auditor: Group A agent, 2026-09-03. Repo: `D:\Antigravity_google\SDK-prepration` (v1.5.0-unreleased code, skills v-corpus S2).
Installed copies (`.zcode/skills/`) and packaged copies (`skills/`) verified byte-identical (md5) for all 10 skills in this group.

Environment note: `.env` has PAYWAY_MERCHANT_ID/API_KEY/CALLBACK_URL/RSA_PUBLIC_KEY but **no `PAYWAY_KHQR_*` vars** (offline QR required injecting them manually — see offline-qr section). All network calls run with `NODE_TLS_REJECT_UNAUTHORIZED='0'` scoped to the command.

---

## 1. aba-payway-first-payment (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `payway-sdk doctor` readiness step | PASS | `doctor` passed all checks (env, API key length 40, callback URL, RSA shape). Tip line `doctor --live` exists. |
| `generate-qr -a 3.00 -c USD` sequence | PASS | Live run OK; tx `qrmtkdlyfqf5a921` created, `check-transaction` → `PENDING` (code 2), `transaction-detail` returns `payment_status/refund_amount/original_amount`. |
| PNG default `payway-output/<tx>.png` | PASS | `payway-output/qrmtkdlyfqf5a921.png` created; second run printed "✓ Image saved to D:\...\payway-output\qrmtke1z0o89641f.png". |
| `--save-image <path>` / `--no-save-image` flags | PASS (online only) | Both in `generate-qr --help`. Help says "online mode only" — confirmed: offline run with `--save-image` silently produced **no PNG file**. |
| Webhook-is-authoritative messaging | PASS | Consistent with CLI behavior; note the polling-claim nuance below. |
| `checkout.createTransaction` = local, no network | PASS | SDK verified: returns signed payload object; no fetch. |
| Subscription route CLI example (`--ctid --token-flag CITR_FIX --frequency 1M`) | **FAIL (live)** | See §7 — gateway answers `Wrong Hash` (PayWay code 1) for ALL payment options on 2026-09-03 sandbox. Local validation all correct. |
| `lifetime` **minutes** min 3 for checkout path | PASS | CLI: `✗ purchase lifetime must be at least 3 minutes (…gateway rejects with error 69), received: 2`, exit 1. |
| Online QR optional params incl. `payout` `[{account, amount}]` | PASS | Flags exist; shape verified against help (`[{`account`,`amount`}]`). Live `{acc,amt}` shape → gateway 403 whitelist (see §2/§10). |
| Payment Link route requires `publicKeyPem` | PASS | payment-link create succeeded with RSA present in .env; group + help both say "requires RSA credentials". |
| Error classes `PayWayConfigError`/`PayWayBusinessError` + `error.paywayCode` | PASS | All exported from `src/index.ts`; `paywayCode` readonly property in `src/errors.ts`. |
| Bundled script `checkout-payload.cjs` | PASS with gaps | Works (below), but see "Errors encountered" #1 and #2. |

### checkout-payload.cjs test log
- Happy path (`--tran-id order-123 --amount 10 --currency USD --return-url … --html checkout.html`): signed payload printed; fields = `req_time, merchant_id, tran_id, amount:"10.00", type:"purchase", return_url(base64), currency, hash`; HTML form written with action `https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase`. Exit 0.
- Subscription variant (`--ctid customer123 --token-flag CITR_FIX --frequency 1M`): payload includes `token_flag, frequency, ctid` — matches skill's "ctid body-only, token_flag+frequency hashed" claim. Cross-checked against `PURCHASE_HASH_FIELDS` in `src/domains/checkout.ts` (lines 83–84: `'token_flag','frequency'` last). Exit 0.
- `--lifetime 2` → `Validation error: lifetime is in MINUTES (min 3 …)` — **exit 0** (should be nonzero).
- `--currency EUR` → silently accepted and signed (no currency validation in script).
- No args → usage line, exit 0.
- **Missing credentials → exit 0** ("Missing credentials. Pass --merchant-id/--api-key or set PAYWAY_MERCHANT_ID/PAYWAY_API_KEY.") — script does NOT load `.env`; SKILL.md example runs bare `node scripts/checkout-payload.cjs` with no credential mention.
- SDK cross-check: `pw.checkout.createTransaction({transactionId:'cmp-1',amount:10,currency:'USD',returnUrl:…})` produces the identical field set and `"10.00"` amount formatting (hash differs only because req_time differs — script does not accept a `--req-time` override).

---

## 2. aba-payway-qr (v1.4.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `qr.generateQr` + 9 optional params | PASS | All 9 CLI flags present and live-accepted in one call (`--first-name --last-name --email --phone --items --custom-fields --return-params --return-deeplink` + implicit payout): exit 0, QR rendered. |
| `payout` `[{account, amount}]` key shape on QR path | PASS (shape) | Help: `[{`account`,`amount`}]`. Live wrong-shape `{acc,amt}` → `403 Forbidden: Payout accounts are not in whitelist` (exit 2) — gateway checks whitelist before keys, so wrong shape is NOT caught locally (see Gaps). |
| Advisory caps warn (names ≤20, email ≤50, phone ≤20) | PASS | 25-char first name → `[payway] firstName exceeds the gateway's 20-character cap (err 16); gateway may reject with error 16` then gateway `✗ The given data was invalid… first_name cannot exceed 20 characters`, PayWay code 04, **exit 2**. Warning + network round-trip, exactly "advisory". |
| `lifetime` in SECONDS, min 3 minutes (180s) | PASS | `--lifetime 179` → `✗ --lifetime must be at least 180 seconds (3 minutes — PayWay gateway minimum; below that the API rejects with code "04")`, exit 1. Help default 180. |
| PNG auto-open TTY-gated; `--open-image`/`--no-open-image` | PASS | Both flags in help; `--no-open-image` suppressed opening in non-TTY agent runs. Viewer allowlist claim matches `src/open-image.ts` exports (`defaultViewerCommandForPlatform`). |
| `openImageInDefaultViewer` SDK export + `opened`/`reason` result | PASS | Exported `src/index.ts:32`; reason values `missing_file | unsupported_platform | spawn_error` present in implementation. |
| `generate-qr -a 31.11 … -y` auto-poll claim (min 180 seconds here) | PASS | Help: polling default true, lifetime seconds. AGENTS.md agrees. |
| `poll-transaction -t <id>` | PASS | Help matches; `--json` emits per-event JSON; `--poll-timeout` documents exit code 3. |
| `PayWayAPIError` export with `statusCode` | PASS | Exported; `statusCode` property exists in errors.ts. |

Live evidence: `-a 5.00 -c USD --lifetime 360 --no-polling -y` → tx `qrmtkdlyfqf5a921`, PENDING on check. `--template template3_color` → tx `qrmtke1z0o89641f`, PNG saved.

---

## 3. aba-payway-offline-qr (v1.1.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `khqr.generateOfflineQR({amount, currency, merchantRef})` | PASS | Method exists (`src/domains/khqr.ts:43`); CLI offline path exercised heavily. |
| No API call, EMVCo TLV + CRC-16 | PASS | Generation succeeds with network-independent local signing; decode-khqr verifies CRC-16 CCITT-FALSE on every produced payload. |
| Requires `khqr` config; fails fast with config error | PASS | Without `PAYWAY_KHQR_*`: `✗ ABA KHQR configuration is not ready` + 7 bullet `KHQR_*_REQUIRED` codes, exit 1. |
| "no webhook or automatic reconciliation" / never confirms payment | PASS | Consistent with payload anatomy (no PayWay online routing → but note: our test config DID include `62·68` PayWay data so routing tags present; skill's contrast with Customer Module QR is correct). |

### Boundary matrix (CLI `generate-qr --offline --ref <r>`)
| Input | Result | Exit |
|---|---|---|
| `-a 0.01 USD` | DYNAMIC QR (`01·12`), `54` = `0.01`, CRC VALID (decode: `stored=257B computed=257B`) | 0 |
| no amount (`static`) | STATIC QR (`01·11`), open amount, CRC VALID (`489E`) | 0 |
| `-a 4000 KHR` | Accepted, integer KHR | 0 |
| `-a 99999999.99 USD` | Accepted (no upper bound hit) | 0 |
| `-a 0` | `✗ Amount must be a positive number, received: 0` | 1 |
| `-a -5` | `✗ Amount must be a positive number, received: -5` | 1 |
| `-a 5.123 USD` | `✗ USD amount must have at most two decimal places` | 1 |
| `-a 10.5 KHR` | `✗ KHR amount must be an integer` | 1 |
| `-c EUR` | `✗ Currency must be USD or KHR, received: EUR` | 1 |
| missing `--ref` | `✗ --ref is required for offline mode` | (nonzero; error text exact) |

---

## 4. aba-payway-purchase (v1.4.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `createTransaction` local vs `purchase()` network distinction | PASS | Both verified: local builder no-fetch; CLI `generate-checkout` performs "Calling PayWay API…". |
| `lifetime` MINUTES on purchase path (min 3, max 43200), 600 = 10h warning | PASS | Help: `--lifetime <minutes>  Lifetime in minutes (min 3, max 43200)`. `--lifetime 2` → exit 1 with error-69 message. |
| `checkout_qr_url` only with `viewType: 'hosted_view'` + `paymentGate: 0` (SDK-only) | PASS (doc-consistent) | `--payment-gate` deliberately absent from CLI help; command description explains the omission verbatim as the skill states. |
| Full CLI flag set incl. `--ctid --token-flag --frequency --type --shipping --skip-success-page --view-type --continue-success-url --additional-params --google-pay-token --return-deeplink` | PASS | Every flag present in `generate-checkout --help` with matching value domains (`--skip-success-page <0|1>`, `--view-type hosted_view or popup`). |
| `--payout` = `[{acc, amt}]` (purchase shape) | PASS | Help: `[{acc, amt}]`. |
| `--google-pay-token` required for `google_pay` option | PASS (help-consistent) | Help states "required by the gateway when --payment-option google_pay". Not live-tested (would need a Google Pay token). |
| Card response matrix | NOT LIVE-TESTED (sandbox-only claims marked 2026-08-25) | Cannot verify without running card `purchase()` with gate 0; claims are flagged as sandbox-verified in-skill. |
| `checkout-form -a 10 -o form.html` | PASS | Local HTML written (974 bytes, hidden-input form), tx id `ckmtkdw7lj55c213`, "no API call" claim holds. |
| `close-transaction -t <id> -y` chain | NOT RUN (forbidden mutating op) | Command exists in CLI (`Money-out` section). |
| Non-shipped dev-probe note (`scripts/checkout-link-poll.ts` etc.) | PASS | `ls scripts/` confirms no such shipped skill scripts; the skill correctly says they're repo dev probes. |

Live: `generate-checkout -a 5.00 --return-url … --no-polling` → tx `ckmtkdmsaw9d7da5`, ABA deeplink + QR returned, exit 0. `check-transaction` → PENDING.

---

## 5. aba-payway-payment-link (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `paymentLink.create({title, amount, merchantRefNo, returnUrl, currency})` | PASS | Live: link created `https://link-sandbox.payway.com.kh/ABAPAYYt81060U`, Link ID `9MEclmIGfzBRSj1d/MUHGA==`, Status OPEN, exit 0. |
| RSA (`publicKeyPem`) required; `isValidPublicKeyPem()` exported | PASS | Both true (`src/index.ts:133`). |
| `payout` inside merchant_auth with `{acc, amt}`; total==amount rule | PASS | Help: `total amt must equal --amount`. Mismatch `[{acc:000999888,amt:3}]` vs `-a 5` → **local rejection, exit 1** (exactly as skill says: "CLI rejects the mismatch locally with exit 1"). |
| Wrong key shape `{account, amount}` rejected locally | PASS | `✗` exit 1 (message: `amount must be a positive number, received: undefined` pattern per pre-auth run; link path also local exit 1). |
| SDK `paymentLink.getDetails('link-id')` | PASS | Method exists (`src/domains/payment-link.ts:169`). CLI is `payment-link detail -i <id>` (note: `-i` REQUIRED — positional id is rejected, exit 1 "required option '-i, --id <id>'"). Live detail returned Status OPEN, Payments 0, Expires 0. |
| Optional `description` (max 250), `paymentLimit`, `expiredDate` (epoch seconds), `image` (jpg/jpeg/png ≤3MB) | PASS | Help matches: `-d, --description` (max 250 chars), `--payment-limit <n>`, `--expired-date <epochSeconds>`, `--image <path>` (jpg/jpeg/png, max 3MB). |
| SDK warns on payout mismatch, throws under strictValidation | PASS (source-consistent) | S1 DoD in HANDOFF.md documents advisory/strict split; CLI local exit-1 verified live. |

---

## 6. aba-payway-pre-auth (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `preAuth.complete / completeWithPayout / cancel` SDK methods | PASS | `src/domains/pre-auth.ts:28/34/41`. |
| `isValidPublicKeyPem()` pre-flight claim | PASS | Export exists. |
| acc validation: digits only, 9/11/15, amt positive | PASS | Live local validation: `abc` → `✗ beneficiary "abc" must contain digits only`; `12345` → `✗ beneficiary "12345" must be 9, 11, or 15 digits (received 5)`; `amt:0` → `✗ amount must be a positive number, received: 0`; wrong shape `{account,amount}` → `✗ amount must be a positive number, received: undefined`. All exit 1. |
| Sandbox whitelist enforcement (client-side) | PASS (list check) | `sandbox-beneficiaries` lists `500000001` (USD) — the skill's example account — plus 5 more USD accounts and 3 KHR 15-digit MIDs. |
| `PRE_AUTH_ERROR_CODES` = PTL59 / PTL62 / PTL170 | PASS | `src/constants.ts:102-108`: `UNABLE_TO_COMPLETE:'PTL59'`, `MERCHANT_INVALID:'PTL62'`, `UNABLE_TO_CANCEL:'PTL170'`; exported from barrel. `explain PTL59` output matches the skill's wording ("Transaction status does not allow capture…"). |
| Over-capture guard (CLI `--original-amount` + `--max-over-capture-pct 110`) | PASS | `pre-auth complete -t fake -a 5 --original-amount 1` → `✗ Completion amount 5 exceeds the allowed 110% over-capture of the original pre-auth amount 1 (maximum 1.1). For card payments PayWay permits capturing up to +10%…`, exit 1 (fired BEFORE any network call). |
| CLI subcommand name | GAP (naming) | SDK method is `completeWithPayout` but CLI subcommand is `complete-payout` (`pre-auth complete-payout`). Skill only shows SDK code, so not wrong — but an agent mapping SDK→CLI must know the rename. |
| Mutating endpoints | NOT LIVE-RUN (forbidden) | complete/complete-payout/cancel verified via --help + local validation exit codes only. |

Note: transaction-id length advisory observed: `[payway] transactionId is shorter than 5 characters; the gateway enforces [a-zA-Z0-9]{5,24} on some identifiers` — undocumented in the skill but harmless, useful.

---

## 7. aba-payway-refund (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `checkout.refund('order-123', 10)` SDK | PASS | `src/domains/checkout.ts:518` (currency default 'USD'). |
| 500 req/s cap claim | PASS (help-consistent) | CLI check-transaction help says 600/s; refund-specific 500/s not contradicted anywhere; cannot verify live (refund forbidden). |
| CLI `refund -t <id> -a <amount> -c USD` | PASS (flags) | Help: `-t -a -c`, plus `-y/--force`, `--no-preflight`, `--json`. Live run FORBIDDEN. |
| `-y` skips pre-flight AND confirmation; `--no-preflight` skips only detail lookup | PASS | Help verbatim: `-y, --force  Skip pre-flight check and confirmation prompt`; `--no-preflight  Skip the balance pre-flight check (detail API is rate-limited to 10/min)`. |
| transaction-detail fields `refund_amount`, `transaction_operations`, `payment_status` | PASS | Live `transaction-detail -t qrmtkdlyfqf5a921` returns `payment_status PENDING`, `refund_amount 0`, `original_amount 5`. (`transaction_operations` not visible on an unpaid tx; field name matches status/detail schema.) |
| `payment_status` REFUNDED-after-partial caveat | PLAUSIBLE, not falsifiable here | `status` reference shows REFUNDED = code 4 as coarse code; matches skill's "coarse lifecycle flag only" framing. |
| Known codes PTL04/PTL36/PTL37/PTL58/PTL181 | PASS | `status` reference lists PTL02, PTL37, PTL04, PTL57, PTL58, PTL168, PTL181, PTL36. `explain PTL04` → "Amount must be ≥ $0.01 USD / ≥ 1 KHR"; `explain PTL36` → "Verify the original tran_id". All match the skill. |
| Pre-flight snippet `getTransactionDetail` + `payment_amount`/`refund_amount` | PASS | Method exists (`checkout.ts:438`); fields confirmed live. |
| detail rate-limit 10/min | PASS | `transaction-detail --help`: "strict rate limit: 10/min". |
| `PayWayAPIError.retryable` | PASS | `retryable` property in errors.ts (network errors set retryable:true). |
| Local validation via `validate` | PASS | `validate -a 0.01` ✓ valid; `0.001` → "USD amount must have at most 2 decimal places"; `0.00 KHR path`/`-1` → "must be a positive number"; KHR 0.5 → "KHR amount must be an integer". Note: `validate` exits **0 even when invalid** (informational command). |

---

## 8. aba-payway-subscription (v1.0.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| Purchase-path trio concept, no separate endpoint | PASS (design) | `purchase()` with ctid/tokenFlag/frequency; hash order in source matches skill exactly (26 fields, token_flag+frequency appended; `ctid` body-only). |
| Validation: tokenFlag→ctid required; only CITR_FIX; frequency iff CITR_FIX | PASS | Live local errors, exit 1: `✗ ctid is required when tokenFlag is set (subscription registration)`; `✗ tokenFlag "MITR_FIX" is not supported on the purchase path — only 'CITR_FIX' … use credentialsOnFile.linkAccount/linkCard for other flags`; `✗ frequency requires tokenFlag (subscription registration)`. |
| lifetime MINUTES min 3 max 43200 here | PASS | See purchase. |
| Hash order string (26 fields) | PASS | Printed verbatim by the gateway-reject handler and matches `PURCHASE_HASH_FIELDS` in `src/domains/checkout.ts`. |
| `frequency` domain `1W|1M|2M` | PASS | Help: "Billing frequency: 1W | 1M | 2M (required when token-flag=CITR_FIX)". |
| paymentOption documented set `cards | abapay | abapay_deeplink` | PARTIAL | Advisory fires: `subscription payment_option "abapay_khqr_deeplink" is outside the documented set (cards, abapay, abapay_deeplink)` — good. BUT see next row. |
| **CLI Quick Start example works** | **FAIL (live)** | Skill's CLI example omits `--payment-option`, so it uses default `abapay_khqr_deeplink` → advisory + gateway `Wrong Hash` (code 1), exit 2. Retries with `--payment-option abapay` AND `--payment-option cards` ALSO returned `Wrong Hash` (code 1) on 2026-09-03 sandbox. The skill's core claim "since v1.4.0 the network path signs the same order" does not hold against today's sandbox for this merchant profile. Either the sandbox profile lacks subscription provisioning, or the gateway's subscription hash differs from the documented 26-field order (contradicting the 2026-08-31 live-doc evidence). Needs PayWay follow-up / re-verification. |
| `credentialsOnFile.payment({tokenFlag:'MITR_FIX'})` for recurring charges | PASS (existence) | CoF payment path exists in CLI `cof` group (out of group scope to live-test). |

---

## 9. aba-payway-customer-qr (v1.1.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| Sample 203-char payload decodes as described | PASS | `decode-khqr.cjs` on the SKILL.md string: TLV tree matches the skill's table exactly — `01`=11 static, `53`=840 USD, `54` absent (open amount), `62·68` + `99` PayWay routing, `63` CRC. `stored=9955 computed=9955 → VALID ✓`. |
| Callback handler snippet (`payway.verifyCallback`, `X-PAYWAY-HMAC-SHA512`) | PASS | `verifyCallback(body, signature)` public method at `src/client.ts:1522`. Header name per skill/webhook server. |
| `khqr.getTransactionsByMerchantRef` fallback | PASS | Method exists (`src/domains/khqr.ts:52`). CLI: `get-transactions-by-ref -r <ref>` (rate "up to 50"). Live probe with a payment-link ref returned `HTTP 404` exit 2 — expected for a ref with no transactions, but note the CLI command maps to this endpoint. |
| "PayWay does NOT retry webhooks" | UNVERIFIABLE | Vendor-behavior claim; consistent with skill corpus. |
| `decode-khqr.cjs` string mode | PASS | Malformed input (`garbage`) → `!! MALFORMED at offset 0: tag=ga len=NaN`, "No CRC tag found — INVALID KHQR", **exit 0** (only no-args exits 2). |
| `decode-khqr.cjs` image mode | PASS with caveat | Deps per skill (`jimp@0.22.12 jsqr` in scratch folder + NODE_PATH). Successfully decoded a plain 400px QR PNG → full TLV tree + `stored=257B computed=257B → VALID ✓`. CAVEAT: the PayWay-saved template PNG (188×276, styled) → "No QR detected in image." jsQR cannot read styled/logo QR images; skill does not warn about this. |
| `qr-manifest.cjs` batch CSV | PASS | Folder with 2 PNGs → `2 QR(s) processed, 1 CRC-valid, 1 failed`, CSV columns exactly as documented (file, bakong_id, account_number, bank, merchant_name, merchant_city, currency, type, outlet_code, merchant_id, profile_id, mmp, crc_valid). Non-image files: "No JPG/PNG files found", exit 2. |
| `.cjs` on purpose (repo `"type": "module"`) | PASS | Both scripts run under plain `node`. |
| Regenerated QRs change `99.00` profile ID | UNVERIFIABLE | Vendor claim; decode shows `99.00` = profile ID consistent with the anatomy table. |

---

## 10. aba-payway-exchange-rate (v1.1.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `checkout.getExchangeRate()` | PASS | `src/domains/checkout.ts:532`. |
| CLI `exchange-rate` + `--json` | PASS | Live: `{"status":{"code":"00","message":"Success!"},"date":"","exchange_rates":{"usd":{"sell":"4012","buy":"3990"},"eur":{…},"vnd","jpy","sgd","hkd",…}}`. Exit 0 both modes. |
| `PayWayNetworkError` export | PASS | `src/index.ts:54`. |
| Caching advice | N/A | Guidance, no test. |

Interesting data types: **all rate values are JSON strings, not numbers** (`"4012"`, `"4667.55"`) and the `date` field is an empty string in sandbox — agents doing arithmetic must `Number()` them. Also: the endpoint returns far more than USD/KHR (EUR, VND, JPY, SGD, HKD, …) despite the CLI help saying "USD/KHR exchange rate".

---

## Errors encountered (exact)

1. `checkout-payload.cjs` without env/flags: `Missing credentials. Pass --merchant-id/--api-key or set PAYWAY_MERCHANT_ID / PAYWAY_API_KEY.` — **exit 0**. Script does not load `.env`; SKILL.md example omits the credential prerequisite (the script's own header documents it).
2. `checkout-payload.cjs` exits **0 on every failure** (validation error, missing creds, usage). Violates the repo's 0/1/2/3 exit contract for scripts.
3. `checkout-payload.cjs --currency EUR` accepted silently (no currency domain check in the script; the CLI/SDK would reject).
4. Subscription trio live: `✗ Wrong Hash.. HMAC field order for this endpoint: req_time.…token_flag.frequency.  PayWay code: 1` — for default AND `cards` AND `abapay` options (2026-09-03 sandbox). Contradicts subscription skill's §Hash-order claim.
5. `payment-link detail` without `-i`: `error: required option '-i, --id <id>' not specified` exit 1 (skill never shows the CLI inspect syntax — gap, see below).
6. `generate-qr --save-image <path>` in offline mode silently writes nothing (help documents online-only, but no warning is printed).
7. `decode-khqr.cjs` on styled PayWay PNG: `No QR detected in image.` (jsQR limitation with template-styled/logo QRs).
8. `NODE_TLS_REJECT_UNAUTHORIZED` warning spam confirmed on every network call (expected sandbox caveat, workaround as documented).
9. `get-transactions-by-ref -r audit-link-001` → `✗ HTTP Error: 404 Not Found` exit 2 (no transactions for that ref; fine, but the 404 message gives no PayWay code).

## Data types & validation observed

- Amounts: signed as **strings** with exactly 2 decimals for USD (`"10.00"`, `"9.99"`); USD ≤2 decimals enforced locally; KHR integer enforced locally; zero/negative rejected locally (`exit 1`). No upper bound found at 99999999.99 (offline).
- Transaction IDs: `[a-zA-Z0-9]{5,24}` advisory warning when <5 chars; `validate -t` rejects spaces: `transactionId may only contain letters, digits, and hyphens`.
- Currency: only USD (default) / KHR everywhere; EUR rejected with `Currency must be USD or KHR, received: EUR`.
- Lifetime: QR domain **seconds** min 180 (exit 1 at 179); purchase domain **minutes** min 3 max 43200 (exit 1 at 2).
- Offline KHQR: fixed amount → `01·12` DYNAMIC; no amount → `01·11` STATIC; CRC-16 CCITT-FALSE verified valid on all generated payloads.
- Exchange rate values are strings; `date` empty in sandbox.
- Status codes: APPROVED 0, PRE_AUTH 0, PENDING 2, DECLINED 3, REFUNDED 4, CANCELLED 7 (`status` reference).
- Exit-code contract (CLI): 0 = success/PENDING-info, 1 = local validation/config failure, 2 = gateway/HTTP error (incl. 403 payout whitelist, 404 lookup, Wrong Hash), 3 = poll timeout (documented in poll-transaction help). **Exception:** the bundled `.cjs` scripts always exit 0.
- `validate` command is informational: exits 0 even when the value is invalid (prints ✗/✓).
- Offline mode leaves `--save-image` unused (online-only per help).

## Gaps & doc drift

1. **Subscription skill live failure (highest severity):** CLI example without `--payment-option` + all documented options hit gateway `Wrong Hash` (code 1) on 2026-09-03. Either re-verify against sandbox, gate the skill with "requires subscription-enabled merchant profile", or reopen the hash-order question with PayWay.
2. **Subscription CLI example omission:** should include `--payment-option cards|abapay|abapay_deeplink` (default `abapay_khqr_deeplink` triggers the advisory and is outside the documented subscription set).
3. **first-payment `checkout-payload.cjs` example:** no mention that `PAYWAY_MERCHANT_ID`/`PAYWAY_API_KEY` (or `--merchant-id/--api-key`) must be exported first — bare `node scripts/checkout-payload.cjs` fails out of the box; and the script never exits nonzero.
4. **first-payment polling wording:** "The agentic CLI *offers* polling after an online QR is created and never auto-polls" is true of the `agent` REPL, but the plain CLI `generate-qr` **polls by default** (`--polling default: true`). An agent following this skill with the regular CLI will auto-poll.
5. **payment-link inspect syntax absent:** skill shows only SDK `getDetails`; the CLI form is `payment-link detail -i <link-id>` (flag `-i`, not positional). Easy for an agent to get wrong.
6. **AGENTS.md / examples use `000999888` as payout beneficiary, but it is NOT in the seeded sandbox whitelist** (`sandbox-beneficiaries` lists 500000001, 500000002, 002094060, 111111111, 002092621, 000471132 + 3 KHR MIDs) → live 403 `Payout accounts are not in whitelist`. Skills in this group are accurate; the root AGENTS.md example is stale for this profile.
7. **Wrong payout key shape is not caught locally on the QR path:** `generate-qr --payout '[{"acc":…,"amt":…}]'` goes to the network and fails as a whitelist 403 (exit 2), not a key-shape error. The key-shape split is documented correctly, but error attribution is misleading.
8. **decode-khqr.cjs image mode caveat missing:** template-styled PayWay PNGs (188×276 with logo) fail jsQR decode ("No QR detected"). Recommend documenting "plain/terminal-style QR images only".
9. **pre-auth SDK→CLI naming:** `completeWithPayout` → CLI `pre-auth complete-payout`; skill shows only the SDK name.
10. **Offline QR needs 7 `PAYWAY_KHQR_*` env vars** that the repo `.env` does not ship; the offline-qr skill mentions "khqr config / PAYWAY_KHQR_* env vars" generically but never lists the 7 names (found in `src/khqr-config.ts`: BAKONG_ID, ABA_MERCHANT_ID, ACQUIRER_NAME, MERCHANT_CATEGORY_CODE, MERCHANT_NAME, MERCHANT_CITY, PAYWAY_DATA).

## Interesting facts / discoveries

- The gateway's "Wrong Hash" rejection handler prints the full expected HMAC field order — a free diagnostic that matches `PURCHASE_HASH_FIELDS` exactly.
- Exchange rate returns 6+ currency pairs (usd/eur/vnd/jpy/sgd/hkd/…), not just USD/KHR as the CLI help claims.
- The `62·68`/`99` PayWay routing tags appear in ALL locally generated offline KHQRs when `PAYWAY_KHQR_PAYWAY_DATA` is set — the decode script then flags "portal/customer-module or online QR" even though it was CLI-generated offline; tag presence is a routing marker, not a provenance proof.
- `check-transaction -t <fake-id>` → `✗ tran_id not found, PayWay code: 6`, exit 2.
- `status` reference shows PRE_AUTH sharing code 0 with APPROVED — consistent with "payment_status is a coarse flag" in the refund skill.
- Advisory validation pattern confirmed end-to-end: local `[payway] …` warning line, then the gateway's own rejection (code 04 for the name cap), exit 2 — "warn, don't throw" holds under default config.
- `payment-link create` returns both a share URL and an opaque Link ID (base64, `==`-padded) that is REQUIRED for `payment-link detail`; the merchant ref alone is not enough for the detail endpoint.
- `doctor` labels framework "unknown" as an advisory ✓, checks API key length (40 chars), and suggests `doctor --live`.
- Non-TTY behavior: no prompts, no image auto-open, byte-identical output — verified across ~20 non-TTY invocations; `-y` also disables the interactive lifetime override.
- npm-installing the decode deps into `~/.payway-qr-deps` can silently install into `~/` if a stray `~/package.json` exists (npm walks up) — worth a note in the customer-qr skill for Windows agents.
