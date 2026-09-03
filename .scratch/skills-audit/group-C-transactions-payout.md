# Skills Audit — Group C (Transactions, Payout, Beneficiaries, Agent)

Date: 2026-09-03 · Repo: `D:\Antigravity_google\SDK-prepration` · CLI: `npx tsx src/cli.ts` (= `payway-sdk`)
Installed (`.zcode/skills/`) vs packaged (`skills/`) copies: **IDENTICAL** for all 9 skills (verified with `diff -rq`).

Skills audited: check-transaction, transaction-detail, transaction-list, transaction-by-merchant-ref,
transaction-close, beneficiary, payout, sandbox-beneficiaries, agent.

Legend: PASS = verified against reality · PASS* = verified via source/local validation (no live call) ·
GAP = doc drift / unverified · FAIL = contradicts reality.

---

## 1. aba-payway-check-transaction (v1.3.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `payway.checkout.checkTransaction('order-123')` SDK call | PASS* | exported surface in `src/index.js` barrel (CLI wraps same domain) |
| `check-transaction -t <id>` + `--json` flags | PASS | `--help`: `-t, --transaction-id <id>`, `--json` |
| 600 req/s cap claim | PASS | top-level help: "rate limit: 600/s" |
| Unknown `tran_id` → code 6 "tran_id not found", not 403 | PASS | live: `check-transaction -t audit-fake-tx-123` → `✗ tran_id not found / PayWay code: 6`, **exit 2** |
| Status codes 0/2/3/4/7 (PAYMENT_STATUS_CODES) | PASS | `npx tsx src/cli.ts status` lists APPROVED/PRE_AUTH=0, PENDING=2, DECLINED=3, REFUNDED=4, CANCELLED=7 |
| Poller-only status `NOT_FOUND` during grace period | PASS | live `poll-transaction` NDJSON: `"payment_status":"NOT_FOUND"` on every attempt for a nonexistent ID |
| `poll-transaction --json` emits `poll/terminal/aborted` events; exit 0/2/3 | PASS | live: `{"event":"poll",...}`, `{"event":"aborted","reason":"max_duration_exceeded",...}`, **exit 3** on `--poll-timeout 12` |
| `scripts/decode-status.cjs` works via `--body`, `--body-file`, stdin | PASS | all three input modes exercised |
| decode-status maps 0/2/3/4/7; unknown codes → "UNKNOWN code N" | PASS | codes 0,2,3,4,7,6,99,1 tested; 6 and 1 render as UNKNOWN in the `payment_status_code` position (see GAP below) |
| decode-status recognizes gateway `status.code` 429 | PASS | `--body '{"status":{"code":429,"message":"Rate limit exceeded"}}'` → "gateway status.code: 429 (Rate limit exceeded)" |
| `PayWayBusinessError.paywayCode` import path | PASS* | exists in SDK error classes |
| `generate-qr` / `generate-checkout` CLI equivalents | PASS | both commands + flags verified |

**Exit-code nuance (not in skill):** the skill documents HTTP 200 + code 6 as a "not found" shape, which is true at the raw HTTP level, but the CLI surfaces it as an error with **exit 2** (PayWay API failure per the agent skill's contract). Agents following this skill should treat "code 6 + exit 2" as a normal not-found, not an infrastructure failure.

**GAP:** `decode-status.cjs` prints `UNKNOWN code 6` when the code arrives as `payment_status_code: 6`, while the skill itself documents code 6 = "tran_id not found" (and the script maps gateway `status.code 6` correctly). Minor: the `payment_status_code` map in the script omits 6.

**GAP:** `--json` on error: `check-transaction -t <fake> --json` prints the human error block, **not** JSON. `--json` only affects success output (confirmed in `src/cli.ts`). Skill says "`--json` # structured for agents" without this caveat.

---

## 2. aba-payway-transaction-detail (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `transaction-detail -t <id> [--json]` | PASS | `--help` exact match |
| `--wait <seconds>` retries every 2s, default 0 | PASS | `--help` "(default: \"0\")"; `src/cli.ts` line ~1119: `setTimeout(resolve, 2_000)` in retry loop |
| 10 req/min cap (in help text too) | PASS | help: "strict rate limit: 10/min" |
| Unknown `tran_id` → code 6, same shape as check | PASS | live: `✗ tran_id not found / PayWay code: 6`, exit 2 |
| Creation lag hint (~5s) surfaced by CLI | PASS | CLI prints "Hint: detail lags creation by ~5s in sandbox..." on code 6 without `--wait` |
| `.data` wrapper, `status.code "00"` on success | PASS* | `src/cli.ts` casts `result.data`; consistent with other endpoints (transaction-list live shows `status.code:"00"` string) |
| `PayWayRateLimitError` retryable, exit 3 | PASS* | `src/cli.ts` `classifyError`: `PayWayRateLimitError → EXIT_NETWORK (3)` |
| Useful fields list (apv, bank_ref, payer_account, transaction_operations, refund_amount) | PASS* | all present in `src/types.ts` TransactionDetailResponse |

**Rate-limit reality check (one-time test, then stopped):** 6 rapid `transaction-detail` calls within ~40s (all for nonexistent IDs, returning code 6) did **not** trigger the documented HTTP 403 / body code 429. Either not-found lookups don't count toward the cap or the cap is currently lenient. The skill's claim is marked "measured 2026-08-25" — could not be reproduced today; **unverifiable now** (did not hammer further).

**GAP:** same `--json`-on-error caveat as check-transaction (error path prints human output).

---

## 3. aba-payway-transaction-list (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| SDK: `getTransactionList({fromDate,toDate,status:'APPROVED'})`, status is string enum not numeric | PASS | `--status` filter takes APPROVED/PENDING/... and SDK types enum `payment_status: "APPROVED"|...` |
| Date format **only** `"YYYY-MM-DD HH:mm:ss"` | PASS | live: `--from 20260825` and `--from "2026-08-25"` → local `✗ Dates must use "YYYY-MM-DD HH:mm:ss"`, **exit 1** |
| Windows > 3 days rejected; CLI pre-validates, exit 1, no network | PASS | live: 4-day window → "✗ The requested window spans more than 3 days..." **exit 1**; exact 3-day window (09-01→09-03) succeeds |
| `--pagination` > 1000 rejected locally, exit 1 | PASS | `--pagination 1001` → "✗ --pagination must be a whole number between 1 and 1000, received: 1001" |
| 50 req/min cap | PASS | help text |
| Top-level `data` array; entries `transaction_id`, `payment_status`, `original_amount`, `original_currency` | PASS | live empty result confirms top-level `data` + `status.code:"00"`; field names confirmed in `src/types.ts` `TransactionListItem` |
| CLI defaults to today's window | PASS | live bare `transaction-list` → "Window: 2026-09-03 00:00:00 → 2026-09-03 23:59:59" |

**Data types observed (live JSON):** `data: []` (array, empty ok), `page: "1"` and `pagination: "50"` are **strings**, `status.code: "00"` string, `status.tran_id` present. `payment_status_code` numeric, `original_amount` number per types.

**GAP (minor):** `--status BOGUS` is only **warned** about ("outside the documented set (APPROVED, PRE-AUTH, REFUNDED, PENDING, DECLINED, DECLINDED, CANCELLED)") and the request still goes out (exit 0). The help documents only 5 values; the SDK accepts 7 — including the gateway-typo `"DECLINDED"` (deliberate gateway-typo compat in `src/domains/checkout.ts:481`). Neither the skill nor `--help` mentions PRE-AUTH/DECLINDED.

**Note:** sandbox currently has zero transactions (Aug 22–Sep 3 all empty), so no populated-entry sample could be captured live; field shapes verified from the SDK's generated types instead.

---

## 4. aba-payway-transaction-by-merchant-ref (v1.1.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `get-transactions-by-ref --merchant-ref <ref>` (also `-r`) | PASS | `--help`: `-r, --merchant-ref <reference>`; missing arg → `error: required option ...` exit 1 |
| Optional `--request-time <YYYYMMDDHHmmss>` | PASS* | in `--help` (not mentioned in skill — see GAP) |
| Signs with PAYWAY_MERCHANT_ID / PAYWAY_API_KEY | PASS | dry-run in script + CLI uses profile credentials |
| Max 50 transactions | PASS | help: "Get up to 50 transactions by merchant reference" |
| 10 req/min limit | GAP | endpoint currently unreachable (below) — cannot verify |
| `scripts/reconcile.cjs` usage/flags/exit codes | PASS | `--merchant-ref`, `--env sandbox|production`, `--watch`, `--interval` (min 10s enforced), `--watermark`, `--csv`, `--json`, `--api-key/--merchant-id`, `--dry-run`; exit 0 ok / 1 API-error / 2 usage — matches header docs |
| reconcile.cjs one-shot live | **FAIL (env drift)** | live run → `Error: HTTP 404 with non-JSON body: ` from `https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/get-transactions-by-mc-ref`, exit 1 |

**Important environment finding:** the by-mc-ref endpoint currently returns **HTTP 404 with an empty body** in sandbox — for the CLI too (`get-transactions-by-ref -r audit-fake-ref` → `✗ HTTP Error: 404 Not Found`, exit 2), while `check-transaction` on the same gateway works fine. The script correctly surfaces this as exit 1 with an error message (its documented contract), but it crashes with a raw stack trace (uncaught rejection) rather than the graceful `API error: code=...` path, because 404-with-empty-body throws in `postJson`. Script robustness gap: wrap `runOnce` errors in watch/one-shot mode (watch mode does catch; one-shot does not).

**GAP:** the skill doesn't mention the optional `--request-time` flag, and the reconcile.cjs header documents extra flags (`--base-url`, `--customer-id` alias) not in the SKILL.md.

**GAP:** reconcile.cjs does **not** load `.env` (plain `node` script, no dotenv) — running it from the repo root with only `.env` credentials prints "Missing credentials... exit 2". SKILL.md should say to export the env vars first (`set -a; . ./.env; set +a`) or pass `--api-key/--merchant-id`. Dry-run + live run both verified with env exported.

---

## 5. aba-payway-transaction-close (v1.3.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `close-transaction -t <id>` / `-y, --force` / `--json` | PASS | `--help` exact match; skill's `-y` for scripts matches |
| Nonexistent `tran_id` → HTTP 403, numeric code `5` "Transaction not found" | PASS | live: `close-transaction -t nonexistent-tx-abc -y` → `✗ HTTP Error: 403 Forbidden: Transaction not found / PayWay code: 5`, **exit 2** |
| Success shape `{"status":{"code":"00","message":"Success!"}}` | PASS* | consistent with transaction-list live `status` block; no live close executed (money-adjacent, skill says never assume) |
| Closed-unpaid keeps reporting PENDING; CLOSED not queryable | GAP | cannot verify without a real open transaction; claim is dated+measured 2026-08-25 |
| CLI prompts before voiding | PASS* | `-y, --force  Skip confirmation prompt (for scripts/agents)` in help |
| `PayWayBusinessError` import | PASS* | |

No live close performed (irreversible/money-adjacent category). All flags and the code-5 path verified.

---

## 6. aba-payway-beneficiary (v1.0.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| `beneficiary add <payee>` (+`--json`) | PASS | `--help`; missing arg → exit 1. NOT executed (mutates whitelist) |
| `beneficiary update-status <payee> -s <0\|1>` (+`--json`) | PASS | `--help`; missing `-s` → exit 1; **`-s 5` → `✗ --status must be 0 or 1, received: 5` exit 1** (local domain check, no API call) |
| RSA required (`PAYWAY_RSA_PUBLIC_KEY`) | PASS* | `src/cli.ts` `assertRsaKeyPresent()` before both actions; `.env` has the key (config shows ✓ RSA Public Key) |
| Payout key-shape table per surface | PASS* | verified via `src/utils.ts` (`{acc, amt}` purchase-path validator) and `src/domains/payout.ts` (standalone `{account, amount}`); CLI `-b` uses `account:amount` strings |
| `listSandboxBeneficiaries` / `validateSandboxBeneficiary` exported from barrel | PASS | `import {...} from 'src/index.js'` works; count = 9 |
| Validation: digits-only, length ∈ {9,11,15}, sandbox allowlist + currency | PASS | live SDK calls: `PayWayConfigError` messages exact — `currency mismatch: sandbox account "500000001" supports USD, not KHR`, `"999999999" is not a known sandbox beneficiary...`, `beneficiary "abc" must contain digits only`, `beneficiary "12345" must be 9, 11, or 15 digits (received 5)` |
| `sandbox-beneficiaries` CLI | PASS | see §8 |

**Data types:** `validateSandboxBeneficiary` returns `undefined` on success (throws `PayWayConfigError` otherwise); `listSandboxBeneficiaries()` returns array of `{id: string, kind: 'account'|..., currencies: string[], description: string}`.

---

## 7. aba-payway-payout (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| SDK `payout.payout({transactionId, amount, currency, beneficiaries:[{account, amount}]})` | PASS* | `src/domains/payout.ts` — standalone domain uses `{account, amount}`; HMAC field order `['merchant_id','tran_id','beneficiaries','amount','custom_fields','currency']` |
| HMAC **hex**-encoded for payout | PASS | `src/domains/payout.ts:96` passes `'hex'` explicitly |
| `PAYOUT_ERROR_CODES` = PTL147 / PTL146 / PTL-PAYOUT-36 | PASS | `src/constants.ts:123-130` exact match; `explain PTL147/PTL146/PTL-PAYOUT-36/37/PTL-PAYOUT-37/PTL46` all decode with the skill's meanings |
| Client-side sandbox currency mismatch thrown before API call | PASS | live CLI: `payout -t t1 -a 10 -c KHR -b "500000001:10"` → `✗ currency mismatch: sandbox account "500000001" supports USD, not KHR` exit 1 (plus bonus warnings: "amount 10 KHR is below the gateway minimum 100 KHR", "transactionId is shorter than 5 characters") |
| Sum-of-beneficiaries rule enforced | PASS | live CLI: `-a 10 -b "500000001:5"` → `✗ beneficiary amounts (5) must sum to total amount (10)` exit 1 |
| CLI `-b "500000001:10"` string form; `-t/-a/-c` flags | PASS | `--help` matches skill example |
| Error matrix rows 12/PTL147, 37/PTL146/PTL-PAYOUT-37/PTL46, PTL-PAYOUT-36, 1, 24, 415 | PASS*/GAP | code meanings verified via `explain` + CLI hints in `src/cli.ts` (PTL-PAYOUT-36, 415, 12/PTL147, 37-family hints all present). `24` and `415` rows not independently exercised (would need live calls); the 415 hint exists in source |
| `sandbox-beneficiaries --currency USD` | PASS | works as documented |

**Key-shape finding (CLI vs SDK):** the CLI `payout -b` flag does **NOT** accept JSON at all — `-b '[{"acc":"500000001","amt":10}]'` → `✗ invalid beneficiary amount in "[{"acc":"500000001"" — must be a positive number` (the comma-split parser mangles JSON); `{account, amount}` JSON fails identically. Only the `account:amount[,account:amount]` string form works, exactly as the skill's example shows. The `{acc, amt}` / `{account, amount}` distinction is an **SDK-level** rule: verified `src/utils.ts` `validatePayoutEntryShape` accepts `{acc, amt}` and rejects `{account, amount}` with `payout entries must be objects with a non-empty string "acc" key and a numeric "amt" key`; `payoutEntriesTotal` sums correctly (2.5+2.5=5). The skill's quick-start uses SDK `{account, amount}` — correct for `payway.payout.payout()`, wrong for the purchase-path endpoints — table is accurate.

**Missing-flag errors (exit codes):** `payout` with no flags → `error: required option '-t, --transaction-id <id>' not specified` exit 1; sequential `-t`, then `-a`, then `-b` required in that order. All exit 1 (commander validation = EXIT_VALIDATION), not 2.

---

## 8. aba-payway-sandbox-beneficiaries (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| 9 fixtures: 6 USD accounts + 3 KHR MIDs | PASS | live `sandbox-beneficiaries` lists exactly: USD 500000001, 500000002, 002094060, 111111111, 002092621, 000471132; KHR MIDs 323080111554956, 325012214045630, 325012214063221 — **matches skill list byte-for-byte** |
| `--currency USD` / `--currency KHR` filter | PASS | USD filter shows only the 6 accounts |
| `--json` output shape | PASS | array of `{id, kind:'account', currencies:['USD'], description}` |
| Both-environments structural rule (digits, 9/11/15) | PASS | `validateSandboxBeneficiary('12345',...)` → length error even though sandbox flag set |
| Sandbox-only allowlist + currency match; production structural-only | PASS* | source-verified (error messages above) |
| Exports `listSandboxBeneficiaries`, `validateSandboxBeneficiary` from barrel (v1.5.0 note) | PASS | imports succeed via `src/index.js` |
| `PayWayConfigError` on violation | PASS | caught by name |

---

## 9. aba-payway-agent (v1.2.0)

| CHECK | Verdict | Evidence |
|---|---|---|
| 11 tools, exact names & order | PASS | `src/agent/contracts.ts` `AgentToolName` union = generate_online_qr, generate_offline_khqr, create_checkout_payload, create_checkout_purchase, create_payment_link, check_transaction, check_transaction_by_merchant_ref, poll_transaction, save_artifact, open_artifact, copy_to_clipboard — **11, exact match** |
| Create tools = tools 1–5 | PASS | `src/agent/executor.ts` `CREATE_ACTIONS` set contains exactly those 5 |
| `ask` flags: `--approve`, `--yolo` | PASS | `--help` ("--approve Authorize create actions (both sandbox and production)", "--yolo ... sandbox create actions only") |
| Ledger lifecycle `planned → confirmed → submitted → succeeded|failed|outcome_unknown`, non-replayable | PASS | `src/agent/ledger.ts` state machine with `requireStatus` guards; `UNFINISHED_STATUSES` includes outcome_unknown |
| Risk gates table (--approve authorizes both; --yolo sandbox-only refused in prod; non-TTY no flag → needs_confirmation) | PASS | `src/agent/risk.ts`: `--yolo is not sufficient for production; --approve is required`; non-TTY reason string `approval required: provide --approve (or --yolo for sandbox) or run interactively` |
| Sessions plaintext JSON under `%APPDATA%\aba-payway-sdk\agent\sessions` | PASS | dir exists on this machine, `.json` files, `agent sessions list` shows them with event counts |
| ProviderConfigV1 shape (`agent-config/v1`, capabilityMode, privacyAcknowledgedAt) | PASS | `%APPDATA%\aba-payway-sdk\agent\agent-config.json` matches field-for-field (opencode / x-preview-f-free / strict-json-plan) |
| `agent setup` flags: `--provider --model --capability-mode --max-tokens --temperature --extra-body --acknowledge-privacy` (+`--base-url --timeout --top-p`) | PASS | `--help` exact match; presets openai|openrouter|nvidia|opencode|custom |
| `agent doctor` capability matrix + `→` fix hints | PASS | live: 8 ok rows (provider, privacy, context, callback, checkout, payment-link RSA, artifact, session) + 1 missing row (Offline KHQR) with `→` hint; "Run payway-sdk onboard..." footer |
| `agent sessions list|export|clear`, clear needs `--approve` in non-TTY | PASS | `--help` exact match |
| `onboard` command + `--stage` | PASS | top-level help; stage flag present in onboard help |
| Exit-code contract 0/1/2/3 (rate-limit → 3, any terminal status → 0) | PASS | `src/cli.ts` `classifyError`: EXIT_OK/VALIDATION/API_FAILURE/NETWORK; `PayWayRateLimitError → 3`; commander/validation errors observed exiting 1; PayWay API errors exiting 2; poll timeout exiting 3 |
| `payway-sdk explain PTL36` → family 'refund', "Transaction not found" | PASS | live: `PTL36  Transaction not found  (refund)`; bare `explain` lists all codes |
| Redaction before provider/session writes; session export scrubbed | PASS* | `src/agent/privacy.ts` `scrubSensitive` (secret-key + exact-secret redaction); sessions `export` help says "scrubbed of secrets" |
| PROVIDER_PROPOSAL_FAILED diagnostics incl. "provider returned HTTP 401/403 ..." | PASS | **reproduced live**: `ask "Generate a $3 online QR for sandbox"` (non-TTY, no flag) → JSON envelope `{"version":"agent-command/v1","status":"failed","error":{"code":"PROVIDER_PROPOSAL_FAILED","message":"provider returned HTTP 401: ...\"Model x-preview-f-free is not supported\""}}`, exit 1. No create executed. This also confirms the `agent-command/v1` envelope shape and that no approval ⇒ no side effects |
| `agent doctor` reports provider row `blocked` when `PAYWAY_AGENT_API_KEY` unset | GAP | **inconclusive here**: `.env` contains the key and the CLI loads it into process.env at startup, so `env -u` cannot unset it; doctor shows `✓ ok` either way |
| Resolved-context rules (profile authoritative, no ambient override) | PASS* | `src/agent/context.ts` + storage.ts reviewed; CLI runs confirm "Using profile: sandbox (sandbox)" header everywhere |

**FAIL (env drift, skill's Quick Start):** the recommended opencode preset model `x-preview-f-free` is currently **rejected by the provider** (HTTP 401 `Model x-preview-f-free is not supported`). The skill's copy-paste quick start no longer works as-is; a working model must be chosen (the config on this machine still stores it, so `doctor`'s "ok" connectivity row is about key presence, not model validity).

**Note:** `ask` in non-TTY without `--approve` **did attempt a provider round-trip** before failing — so "needs_confirmation — no create" refers to PayWay side-effects only; the provider call still happens (and errors before the gate is even reached in this case).

---

## Errors encountered (exact, with exit codes)

| Command | Output (trimmed) | Exit |
|---|---|---|
| `check-transaction -t audit-fake-tx-123 [--json]` | `✗ tran_id not found` / `PayWay code: 6` | 2 |
| `transaction-detail -t audit-fake-tx-123` | same + hint "detail lags creation by ~5s..." | 2 |
| `close-transaction -t nonexistent-tx-abc -y` | `✗ HTTP Error: 403 Forbidden: Transaction not found` / `PayWay code: 5` | 2 |
| `get-transactions-by-ref -r audit-fake-ref` | `✗ HTTP Error: 404 Not Found` | 2 |
| `reconcile.cjs --merchant-ref ... --csv ... --json ...` (live) | uncaught `Error: HTTP 404 with non-JSON body:` stack trace | 1 |
| `transaction-list --from 20260825 --to 20260903` | `✗ Dates must use "YYYY-MM-DD HH:mm:ss"` | 1 |
| `transaction-list --from "2026-08-31..." --to "2026-09-03..."` | `✗ The requested window spans more than 3 days...` | 1 |
| `transaction-list --pagination 1001` | `✗ --pagination must be a whole number between 1 and 1000, received: 1001` | 1 |
| `payout` (no flags) | `error: required option '-t, --transaction-id <id>' not specified` | 1 |
| `payout -t t1 -a 10 -c KHR -b "500000001:10"` | `✗ currency mismatch: sandbox account "500000001" supports USD, not KHR` | 1 |
| `payout -t t1 -a 10 -c USD -b "500000001:5"` | `✗ beneficiary amounts (5) must sum to total amount (10)` | 1 |
| `payout -t t1 -a 10 -c USD -b '[{"acc":"500000001","amt":10}]'` | `✗ invalid beneficiary amount in "[{"acc":"500000001"" — must be a positive number` | 1 |
| `payment-link create ... --payout '[{"acc":"000999888","amt":4.00}]'` (amount 5) | `✗ --payout total 4 must equal the payment-link amount 5 (documented gateway rule)` | 1 |
| `payment-link create ... --payout '[{"account":...,"amount":...}]'` | `✗ --payout must be a JSON array of {acc, amt} objects` | 1 |
| `payment-link create ... --return-url http://...` | `✗ returnUrl must be a public HTTPS URL...` | 1 |
| `beneficiary add` / `beneficiary update-status 000999888` | commander missing-arg/option errors | 1 |
| `beneficiary update-status 000999888 -s 5` | `✗ --status must be 0 or 1, received: 5` | 1 |
| `poll-transaction -t fake --json --poll-timeout 12` | NDJSON poll×3 + `{"event":"aborted","reason":"max_duration_exceeded","totalAttempts":3,"lastStatus":"NOT_FOUND"}` | 3 |
| `ask "Generate a $3 online QR for sandbox"` (non-TTY) | `{"version":"agent-command/v1","status":"failed","error":{"code":"PROVIDER_PROPOSAL_FAILED","message":"provider returned HTTP 401: ...Model x-preview-f-free is not supported"}}` | 1 |
| `decode-status.cjs` (empty/malformed input, no args) | usage line or `Not valid JSON: ...` | 2 |

## Data types & validation observed

- transaction-list JSON: `data` array (may be `[]`), `page`/`pagination` **strings** ("1"/"50"), `status.code` string "00", `status.tran_id` string. Entry fields per types: `transaction_id?` string, `payment_status_code?` **number**, `payment_status?` enum string, `original_amount?` number, `original_currency?` "USD"|"KHR".
- Sandbox beneficiary JSON: `id` string (leading zeros preserved, e.g. "002094060"), `kind` "account", `currencies` string array, `description` string.
- `validateSandboxBeneficiary` → `undefined` on success / throws `PayWayConfigError` with exact messages (captured above). `validatePayoutEntryShape` asserts `{acc: string, amt: number}`; zero/negative `amt` rejected ("non-negative numeric" — note: message says non-negative while `-1` and missing both land on the same message; 0 is allowed by the message wording).
- poll-transaction `--json` NDJSON: `{"event":"poll","attempt":N,"payment_status":"NOT_FOUND","timestamp":ISO-8601}` and `{"event":"aborted","reason":"max_duration_exceeded","totalAttempts":N,"lastStatus":...}`.
- Agent non-TTY envelopes: `agent-command/v1` JSON on stdout, statuses observed: `failed`; documented: `needs_confirmation` / `blocked`.
- decode-status key-field extraction covers: transaction_id, tran_id, merchant_ref, payment_amount, payment_currency, original_amount, original_currency, apv, bank_ref, payer_account, payer_name, transaction_date, refund_amount, customer{customer_name,customer_id}; unwraps `data` (array → first element) automatically.

## Gaps & doc drift

1. **agent skill Quick Start model is dead** — opencode rejects `x-preview-f-free` (HTTP 401 "Model ... not supported"). Update the preset recommendation.
2. **by-mc-ref endpoint 404s in sandbox today** (CLI + reconcile.cjs). Environment drift or gateway change; the skill (and customer-qr cross-ref) should carry a "verify reachability" note. reconcile.cjs also lacks graceful one-shot error handling for non-JSON 404 bodies (raw stack trace, exit 1).
3. **reconcile.cjs doesn't read `.env`** — SKILL.md examples imply it just works from the repo; needs env exported or `--api-key/--merchant-id`.
4. **`--json` doesn't JSON-ify error output** for check-transaction / transaction-detail (human block printed, exit 2). Skills should note agents must branch on exit code, not parse stdout, on failure.
5. **transaction-list `--status` accepts more than documented**: warning-only for unknown values, and the SDK set includes `PRE-AUTH` and gateway-typo `DECLINDED` (src/domains/checkout.ts:481). Help/skill list 5.
6. **decode-status.cjs misses `payment_status_code: 6`** ("UNKNOWN code 6") although the same script maps gateway `status.code 6` → "tran_id not found" and the skill documents 6.
7. **transaction-detail 429-cap behavior not reproducible today** (6 rapid calls → no 403/429); skill claims stand as "measured 2026-08-25" only.
8. **Minor**: by-ref skill omits `--request-time` flag; payout skill's `24` / `415` matrix rows are source-verified hints but never live-exercised; close skill's idempotency/closure-not-enforced claims remain untestable without live open transactions (they carry dates and are internally consistent).

## Interesting facts / discoveries

- `close-transaction` on a nonexistent ID is the only place the skill's "numeric code 5 + HTTP 403" could be confirmed live — and it matches exactly (exit 2).
- The sandbox gateway rejected the by-mc-ref POST with **404 and an empty body** while other endpoints on the same host work — a distinctive signature worth remembering when debugging.
- The CLI payout command emits extra advisory warnings before validation failures: gateway minimum 100 KHR for KHR payouts, and `[a-zA-Z0-9]{5,24}` transactionId length guidance.
- `transaction-list` empty windows still return `status.tran_id` (a gateway-side request echo), useful as a request correlation id.
- `agent doctor`'s "Provider connectivity: ok" only proves key presence/provider config — an invalid model still surfaces only at `ask` time as PROVIDER_PROPOSAL_FAILED (redacted to `[REDACTED]` in some paths per the skill; here the message came through unredacted in non-TTY JSON, which contradicts the skill's "in non-TTY the provider message is redacted to [REDACTED]" claim — flagged as a soft GAP).
- All 9 skills ship byte-identical copies between `.zcode/skills/` and `skills/`.
- Skills use the `payway-sdk` binary name; in-repo equivalent is `npx tsx src/cli.ts` — all commands resolve 1:1.
- Rate-limit note for testers: `$?` after a shell pipe reports the last piped command's code — capture exit codes without pipes (this bit the auditor once; transaction-list wide-window rejection first appeared as exit 0 through `tail`).
