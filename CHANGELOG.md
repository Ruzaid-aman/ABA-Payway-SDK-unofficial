# Changelog

## Unreleased

### Changed

- **Agent CLI/REPL testability refactor** — the pure logic behind the `ask` / `agent` command tree moved out of `src/cli/commands/agent.ts` and `src/agent/repl.ts` into dedicated modules: `agent-helpers.ts` (setup-option validation, setup/doctor/ack/session rendering, interactive confirmation helpers), `repl-helpers.ts` (REPL directive classification and `:run` dispatch validation — the shell-escape/agent-management security boundary — as pure, unit-tested functions), `progress.ts` (shared ask/REPL progress labels and banners), and `ansi.ts`. The REPL loop is now exposed as `runRepl(io)` with injected input/output streams (in-process testable); `startRepl` keeps the real terminal wiring and its public signature. Statement coverage: `agent.ts` 28% → 77%, `repl.ts` 4% → 85%, repo overall 70% → 75.8%. New suites: `agent-command-helpers`, `agent-repl-helpers`, `agent-cli-inprocess` (988 tests total). No behavior change; the `agent-cli` subprocess suite was re-verified against a fresh `dist` build.
- **Statement coverage raised 55% → 70%** (lines 70.9%, functions 79.8%) via a coverage campaign on previously untested modules: public API barrel surface, structured logger, webhook storage factory + JSON storage lifecycle, agent result rendering, credential-profile CRUD, the SDK facade (`sdk.test` / `initiate` / `runTestSuiteAndPrint`), the Cloudflare tunnel manager (fake-binary URL parsing + ENOENT path), and in-process CLI command bodies (status / explain / validate / config / doctor / profiles / skills / demo, plus every API command against a local mock gateway). New suites: `public-api`, `logger`, `webhook-storage-factory`, `webhook-server-stop`, `agent-output`, `first-payment`, `profiles-crud`, `sdk-facade-and-tunnel`, `cli-inprocess`, `cli-mock-commands`.
- **Minimum Node.js version raised to 20** — `engines.node` is now `>=20.0.0` (was `>=18.0.0`). Node 18 reached end-of-life on 2025-04-30 and the test toolchain (vitest 4) no longer supports it; the CI matrix validates Node 20 and 22. Ship note: announce in the 1.4.0 release notes as the runtime support change.

### Added

- **CI pipeline hardening** — the existing GitHub Actions workflow now builds `dist/` before the unit suite (the child-process suites `cli.test.ts` / `agent-cli.test.ts` spawn `dist/cli.js`, which does not exist on a fresh checkout), runs a coverage job on Node 22 that enforces floor thresholds from `vitest.config.ts` (74% stmts / 69% branch / 80% funcs / 74% lines — ratchet upward as testability work lands), uploads the coverage artifact, and deduplicates concurrent runs per ref. CI badge added to the README.

- **`runCli(argv)` exported from the CLI entry** — `src/cli.ts` now guards its self-parse behind a main-module check and exposes `runCli`, so tests and embedders can drive commands in-process (verified against the documented `npx tsx src/cli.ts` workflow, `dist/cli.js`, and the child-process `cli.test.ts` suite).
- **Interactive TUI layer for the CLI** — activates only on a real TTY (stdin+stdout): bare `payway-sdk` prints a compact banner with grouped command help (Setup / Payments / Transactions / Money-out / Reference / Agent & skills); `generate-qr` with missing inputs runs a guided wizard (currency → amount → QR template → payment option → lifetime → callback URL → summary → confirm; explicit flags are never re-asked; offline mode probes `--ref` and an optional static amount); `generate-checkout` gains a pre-submit confirm; QR/checkout polling shows a live `Poll #N · PENDING · m:ss elapsed / m:ss left` spinner with a terminal ✓/✗ line; an APPROVED payment offers a next-step picker (fetch transaction detail / keep watching / show refund command / done); one-shot submits (refund, close-transaction, pre-auth complete/complete-payout/cancel) show spinners; and unknown commands/flags get Levenshtein "Did you mean …?" hints (unknown `--template` warns, unknown `--payment-option` errors with a suggestion). Piped stdin, `--json`, `-y`/`--force`/`--non-interactive`, CI, and `PAYWAY_UI=classic` keep byte-identical legacy behavior; a global `--no-color` flag (accepted before the subcommand, like `--profile`) and `NO_COLOR` disable ANSI; Ctrl-C during a prompt exits 130 (exit codes 0/1/2/3 unchanged).

### Fixed

- **`skills doctor` crashed with a raw ENOENT stack** when the executable's sibling `skills/` directory was missing (e.g. source checkouts); a missing directory now reports as "no packaged skills" instead.
- **Agent human output spacing** — failed actions rendered as `tool(E1: msg)`; now `tool (E1: msg)`.
- **Interactive lifetime override now enforces the 180s gateway minimum before submit** — a lifetime below 180s entered in the wizard re-asks with an explanation of gateway code `"04"` (179s → HTTP 400), matching the `--lifetime` flag validation from the edge-case audit instead of failing after submit.

## 1.3.0 — 2026-08-30

> Edge-case audit campaign release: all 23 findings (EC-01–EC-23) from
> `audit-results/edge-case-report.md` remediated. Sandbox verification:
> QR lifetime boundary pinned live (179s → 400 `"04"`, 180s → OK; `scripts`-backed evidence in
> `test-output/edge-case-probe/live-probe.log`), plus `npm run probe` re-run at release time.

### Added

- **CLI startup guidance & probe generalization** — `evidence/startup-probe.ts` now accepts an arbitrary command; measured compiled artifact startup: `node dist/cli.js --help` P50 **413 ms** / P95 415 ms (under the 500 ms plan threshold; the previously reported 2041 ms was the `npx tsx` dev path only). Global-install pattern (`npm i -g .` → `payway-sdk`) documented in the CLI user guide §2.
- **`retryPolicy: 'none'` for `checkout.purchase()` (EC-10, edge-case audit)** — per-call opt-out from the SDK's automatic re-send of transient failures (network errors, 5xx, 429) for strict once-only submission; production duplicate-`tran_id` semantics are unconfirmed while sandbox overwrites. Default `'transient'` preserves existing behavior.
- **Private/loopback callback guard + `allowPrivateCallbackHosts` (EC-19)** — callback/return URLs pointing at `localhost`, loopback, or private-range addresses (127.0.0.1, 10.x, 172.16–31.x, 192.168.x, 169.254.x, CGNAT, `.local`/`.internal`) are now rejected client-side with `PayWayConfigError` — PayWay's servers can never reach them, so callbacks would silently never arrive. Opt out for on-prem gateways/tests with the new `allowPrivateCallbackHosts: true` config. Applies to QR `callbackUrl`, payment-link `returnUrl`, and credentials-on-file `returnUrl`/`callbackUrl` (the CLI `doctor` check stays strict).
- **`verifyCallback(body, signature, { stripHash: true })` (EC-22)** — the sorted-key signature verifier can now strip a `hash` field before verifying, so raw callback payloads passed through as received validate. Default `false` keeps the historical strictness (the webhook server already strips `hash` itself).
- **QR lifetime oversize warning** — QR lifetimes above the documented 120-day maximum (new exported `QR_LIFETIME_MAX_SECONDS`) emit a one-time `console.warn` instead of failing silently at the gateway; the maximum is deliberately not hard-enforced until ABA confirms production parity.

### Fixed

- **KHQR notification module restored to compilable state** — pass-2 edits left an orphan `}` in `src/webhook/khqr-notification.ts` and omitted the `extractJsonPayload` import in `src/webhook/server.ts`, breaking typecheck and 2 test suites. All gates re-run with unmasked exit codes: typecheck ✅, lint ✅, **787/787 tests ✅**, `npm audit --omit=dev` ✅.
- **Beneficiary sum validation in minor units (EC-16, edge-case audit)** — `validateBeneficiaries()` compared float sums against `Number.EPSILON`, which false-rejected legitimate payouts: `[1.1, 2.2]` vs total `3.3` drifts by 4.4e-16 > 2.2e-16. The sum is now compared in integer minor units (cents for USD, whole riels for KHR); genuinely unbalanced splits still throw. Regression-pinned in `utils.test.ts` and `edge-case-audit.test.ts`.
- **`Retry-After` parsed as seconds (EC-03)** — RFC 7231 delta-seconds were previously treated as milliseconds, so a proxy-specified `Retry-After: 60` paced retries at 60 ms instead of 60 s. New `parseRetryAfterMs()` converts seconds → ms (HTTP-date form still supported); `x-rate-limit-*` limit/remaining/reset headers keep their raw numeric parsing.
- **QR lifetime minimum enforced locally (EC-17/EC-18)** — the generate-qr API takes whole minutes and rejects sub-3-minute lifetimes with an opaque HTTP 400 code `"04"` (sandbox-pinned boundary 2026-08-30: 179s → 400, 180s → OK). `generateQr()` now throws `PayWayConfigError` for 1–179s via new `validateQrLifetimeSeconds()` (exported `QR_LIFETIME_MIN_SECONDS = 180`), so the seconds→minutes floor can never send `0`; the CLI `--lifetime` flag validates with a clear message (exit 1, no network call). The shared `validateLifetime()` stays unit-agnostic because `checkout.purchase` forwards its `lifetime` in minutes (unit + spec minimum now documented on the param; below-minimum gateway code `69` added to `GATEWAY_CODE_HINTS` and the docs/12 table).
- **5xx with non-JSON bodies now retried (EC-02, edge-case audit)** — the body-shape check ran before the HTTP-status check, so a CDN/load-balancer 503 HTML page surfaced as a non-retryable "Invalid JSON response" with the HTTP status lost. `_executeFetch` now evaluates `!response.ok` first: non-OK non-JSON bodies go through `createHttpError` (keeping `statusCode` and 5xx retryability); the JSON-parse error path (with its HTML hint) only applies to 2xx bodies.
- **Flat top-level `code` extracted on non-OK responses (EC-04)** — legacy error envelopes like the old `transaction-list` 403 shape `{"code": "49", "message": "Invalid Start Date"}` previously threw with `paywayCode: undefined`. `createHttpError` now falls back to the flat `code` field when no nested `status.code` exists, so code-based matching, `explain`, and `getGatewayErrorDetails` all see the gateway code.
- **Legacy numeric `status` bodies no longer pass silently (EC-01)** — `{"status": 6, "description": "tran_id not found"}` (legacy non-`-2` endpoint shape) resolved as success. `checkResponseError` now treats a numeric non-zero `status` as a business error carrying the code and the `description` as the message; `status: 0` still resolves as success.
- **200-wrapped flat code `"429"` thrown as `PayWayRateLimitError` (EC-05)** — the retry engine already paced these by `paywayCode`, but the thrown type was `PayWayBusinessError`, so callers matching on `instanceof PayWayRateLimitError` missed them. The flat-code branch now throws the typed rate-limit error.
- **`PAYWAY_ENV` URL form now honored as the base URL (EC-12)** — `validatePayWayEnv()` has long accepted `PAYWAY_ENV=https://…` but the client silently ignored it and used the sandbox host. `resolveConfig` now uses a URL-valued `PAYWAY_ENV` as the base URL (config `baseUrl` and `PAYWAY_BASE_URL` still take precedence), so the validator's promise and the client agree.
- **`timeout` ≤ 0 rejected at construction (EC-13)** — `timeout: 0` (config or `PAYWAY_TIMEOUT`) previously fired the AbortController instantly, timing out every request and burning retries. Construction now throws `PayWayConfigError: timeout must be a positive number of milliseconds`.
- **Whitespace-only credentials rejected (EC-15)** — `merchantId`/`apiKey` are now trimmed before the required check, so `'   '` throws `PayWayConfigError` instead of being hashed and sent verbatim (which produced an opaque gateway code); surrounding whitespace on valid credentials is trimmed.
- **`onResponse` fires for 200-wrapped business errors (EC-06)** — the observability hook (and debug log) previously ran only after business-error validation, so 200-wrapped failures were invisible to `onResponse` consumers. Hooks now fire before `checkResponseError`.
- **Empty 2xx bodies rejected (EC-07)** — an HTTP 200 with an empty body resolved to a silent `null` success. It now throws `PayWayAPIError "Empty response body from PayWay API (HTTP …)"`; HTTP 204 (and a literal JSON `null` body) still resolve as `null`.
- **Content-type surfaced in invalid-JSON errors (EC-08)** — `createJsonParseError` supported a `contentType` parameter that was never passed; the "Invalid JSON response…" message now includes the response's content type.
- **Gateway codes trimmed before comparison (EC-09)** — a padded success code (`"0 "`) was misreported as a business error; codes in `checkResponseError` and `createHttpError` are trimmed first.
- **`checkout.purchase` sub-minimum lifetime rejected locally** — purchase `lifetime` is in MINUTES with a spec minimum of 3 (below that the gateway answers error 69). New `validatePurchaseLifetimeMinutes()` + exported `PURCHASE_LIFETIME_MIN_MINUTES = 3` enforce it client-side, mirroring the QR-domain fix; the shared `validateLifetime()` stays unit-agnostic.
- **Short `tran_id` warns once (EC-20)** — 1–4-character transaction IDs pass validation but emit a one-time `console.warn` about the gateway's `[a-zA-Z0-9]{5,24}` identifier rule until that rule is confirmed for `tran_id`.
- **Log masking threshold raised to SHA-1 length (EC-23)** — `sanitizeForLog` masked every 32+-hex-char string, hiding benign MD5-length order refs; the heuristic now masks 40+-char hex (and key-name-based masking is unchanged).
- **Skill example conformance (TD-06 sweep)** — `aba-payway-link-account` quick-start used `requestId: 'link-123'`, which now fails fast against the `[a-zA-Z0-9]{5,24}` gateway-parity validator; example updated, remaining skills/docs examples verified conforming.

### Changed

- **Slimmer runtime dependency footprint (Pillar A A.3)** — `canvas`, `qrcode-reader`, and `@types/qrcode` moved from `dependencies` to `devDependencies`; they were only imported by an untracked dev scratch script. SDK consumers no longer install the native canvas build toolchain; runtime deps are now 4 pure-JS packages (`@clack/prompts`, `ajv`, `commander`, `qrcode`).

- **Resilience pack (TD-07)** — opt-in transport hardening: `backoffJitter: 'full'` (AWS-style full-jitter exponential backoff, thundering-herd protection) and `circuitBreaker: { failureThreshold, resetTimeoutMs }` (per-endpoint closed→open→half-open breaker that fails fast with `CircuitOpenError` while the gateway is down; business errors never trip it). Defaults unchanged for deterministic test runs.
- **Structured logging (TD-08)** — new level-aware logger (`logLevel` config or `PAYWAY_LOG_LEVEL` env) with single-line JSON output via `logFormat: 'json'`; gateway correlation ids (`status.trace`) surfaced as `[payway] trace_id=… endpoint=…`; exported `createPayWayLogger` / `resolveLogLevel`. Legacy `[payway]` text output stays byte-compatible when only `DEBUG_PAYWAY`/`debug: true` is used.
- **Token expiry helpers (TD-10)** — `computeTokenExpiry()` / `daysUntilTokenExpiry()` (+ `TOKEN_VALIDITY_DAYS = 90`) for merchant-side renewal scheduling of the credentials-on-file lifecycle.
- **Webhook verdict mode (TD-09)** — `createWebhookServer(..., { rejectInvalidSignature: true })` responds 401 to deliveries whose HMAC fails verification (still stores them for audit); unsigned deliveries remain accepted-200. Default behavior unchanged (always-200 capture sink).
- **SDK capability guard for the token trio (TD-03 partial)** — `renewToken()`/`getTokenDetails()`/`removeToken()` throw a descriptive `PayWayConfigError` unless `allowUnverifiedTokenOperations: true` is set explicitly, preventing merchants from shipping blind against the ABA-unconfirmed v3 token-management HMAC composition.
- **Gateway-parity validation & constants exported** — `REQUEST_ID_PATTERN`, `TOKEN_FLAG_LINKING`, `TOKEN_FLAG_CHARGING`, `TOKEN_VALIDITY_DAYS`, plus the new resilience/logger exports (`CircuitBreaker`, `CircuitOpenError`, `DEFAULT_CIRCUIT_BREAKER_OPTIONS`, logger types).
- **Consolidated ABA clarification list** (`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md`) — nine prioritized question groups (token-trio HMAC, subscription initiation, token-lifecycle semantics, close-transaction contract incl. the five standing close findings, rate limits, callback retry policy, sandbox TLS hygiene, exposed-key rotation procedure, production `tran_id` uniqueness/visibility semantics) plus a partial-answer log.

### Changed

- **`sanitizeForLog` value-pattern hardening (TD-12)** — redacts novel sensitive keys by fuzzy name matching (contains `secret/apikey/password/credential/hash/token`, or ends with `key`; exact-match blocklist retained; `token_flag` deliberately exempt since it carries public enum values) and masks raw 32+-char hex values under unrecognized keys.
- **Unknown-env-var detection (TD-12)** — `validatePayWayEnv()` warns (`W-PAYWAY-UNKNOWN-VAR`) on any unrecognized `PAYWAY_*` variable, catching typos like `PAYWAY_APIKEY`.
- **Hermetic vitest environment** — registered setup file scrubs ambient `PAYWAY_*` variables once per test file so host machines exporting real credentials can no longer flip suite outcomes (post-audit follow-up to TD-02).

- **QR image auto-open** — `generate-qr` now opens the saved QR PNG (`payway-output/<txId>.png`) with the OS default image viewer so it is immediately scannable. Default is TTY-aware (interactive terminals only; scripts/CI/agents unaffected); force with `--open-image`, suppress with `--no-open-image`. Backed by the new exported helper `openImageInDefaultViewer()` / `defaultViewerCommandForPlatform()` (`src/open-image.ts`): per-platform allowlisted command (Windows `rundll32 url.dll,FileProtocolHandler` / macOS `open` / Linux `xdg-open`), spawned shell-less and detached, never throws — failures degrade to an "Open it manually" hint.
- **Close-Transaction violation dossier** (`docs/CLOSE-TRANSACTION-FINDINGS.md`) — full evidence that sandbox close is advisory only: two live card payments completed AFTER a code-00 close (`PAY8skk3vbbi` MC \*6777, `PAY8t4x1ozl9` VISA \*0206 → both APPROVED), closure is invisible in check/detail (no CLOSED status, no operation marker), close is idempotent (re-close returns 00), plus reproduction commands, five questions for ABA, merchant mitigations, and a post-fix validation checklist. Cross-linked from SANDBOX-FINDINGS §12 and agent rules.
- **Cards-checkout lifecycle tools** — `scripts/checkout-cards-close.ts` (official checkout2-0.js modal OR hosted page; `--no-close` supported) and reusable `scripts/close-transaction-verify.ts` (`closeOrReport`/`statusOf`/`closeAndVerify`, flags `--raw/--json/--status-only/--delay`) with the post-close interpretation table.
- **End-to-end live-flow scripts** — `scripts/online-qr-poll.ts` (one online KHQR → save/open PNG → poll 10 min) and `scripts/checkout-link-poll.ts` (Create Transaction API with `paymentGate: 0` → open hosted `checkout_qr_url` → poll 10 min). Registered as tools in the QR, purchase, and check-transaction skills; sandbox-paid and verified 2026-08-25 ($31.11 APPROVED ~37s, $12.12 APPROVED ~32s).
- **Transaction-lifecycle CLI commands** — `check-transaction`, `poll-transaction` (NDJSON event stream; exit 0 terminal / 2 API error / 3 timeout), `transaction-detail`, `transaction-list` (defaults to today, aligned table), `close-transaction -y/--force`, `refund` with pre-flight refundable-balance check via transaction-detail, and `exchange-rate`. All accept `--json`.
- **Standardized CLI exit codes** — `0` success · `1` validation/input · `2` PayWay API failure · `3` network/timeout/rate-limit (`classifyError()`), applied across every command.
- **Terminal QR rendering** — `generate-qr`, `generate-checkout`, and `payment-link create` render scannable half-block QRs in interactive terminals (`--no-show-qr` to opt out).
- **`payway-sdk explain [code]`** — offline decoder for gateway/refund/pre-auth codes with fix hints; backed by new exports `PRE_AUTH_ERROR_CODES` (`PTL59/62/170`) and `GATEWAY_CODE_HINTS`, plus programmatic `explainPayWayCode()` / `explainAll()`.
- **`doctor --live`** — real sandbox round-trip (exchange-rate) after static checks; verdict gates on credential rows only so advisory failures (e.g. framework detection in non-framework repos) never block it.
- **Doctor RSA PEM shape check** — flags truncated multi-line `.env` keys with a targeted fix hint.
- **Shared multi-line `.env` parser** (`src/cli/dotenv.ts`) — quoted values spanning lines fold correctly; used by the CLI entrypoint and doctor.
- **Visual guide** (`docs/VISUAL-GUIDE.md`) — one-page ASCII tour: architecture, setup paths, onboarding journey, payment lifecycle, cheat sheet.
- **Guided onboarding** (`payway-sdk onboard`) - interactive TUI wizard (@clack/prompts) that scans the current setup and walks provider → profile → callback → privacy → verify with live connectivity checks, skip-if-already-done stages, non-TTY JSON output, and opt-in first-run automation (`PAYWAY_ONBOARD_AUTO=1`).
- **OpenCode Zen provider preset** (`opencode`, `https://opencode.ai/zen/v1`) - first-class preset with `x-preview-f-free` as the onboarding default model.
- **Sampling passthrough** on `agent setup`: `--max-tokens`, `--temperature`, `--top-p`, and `--extra-body <json>` (e.g. NVIDIA `chat_template_kwargs`) merged into every chat-completions request.
- **Strict-JSON plan repair round** - when a model's plan fails AgentPlanV1 validation, the provider re-asks once with the exact AJV errors and valid tool names before failing.
- **Transient retry in the provider adapter** - 429/5xx chat-completion responses are retried up to 3 times with backoff; auth errors fail immediately.
- **Tool catalog in the strict-JSON system prompt** - the prompt now enumerates every tool's exact name, parameters, and required fields, derived from the same definitions as native-tools mode.
- **Unified readiness matrix** (`evaluateReadinessDetailed`) - single source powering both `agent doctor` fix-hints (`→` remedy per row) and `onboard` stage routing.
- **Runtime progress visibility** - `ask`/`agent` print per-stage progress (`propose → validate → authorize → execute`) via a new orchestrator `onProgress` hook.
- **`ask --provider-timeout <ms>`** - override the inference provider request timeout so hung providers surface fast.
- **`isValidPublicKeyPem()` export** - structural PEM public-key check for pre-flight validation.
- **`aba-payway-customer-qr` skill (24th skill)** — Merchant Portal Customer Module static QRs ("Printed QR channel"): decoded payload anatomy (PayWay routing tags `62·68`, `99`), callback handling via `merchant_ref`, reconciliation guidance, plus bundled tools `decode-khqr.cjs` (TLV decode + CRC-16 validation) and `qr-manifest.cjs` (batch QR-folder audit to CSV).
- **`aba-payway-sandbox-beneficiaries` skill (25th skill)** — seeded sandbox-only beneficiary accounts (6 USD 9-digit) and test MIDs (3 KHR 15-digit) for payout / split-payout testing, with the currency-match rule and error-code cross-references. Backed by a new `src/sandbox-beneficiaries.ts` module exporting `listSandboxBeneficiaries`, `isKnownSandboxBeneficiary`, `lookupSandboxBeneficiary`, and `validateSandboxBeneficiary`.
- **`payway-sdk sandbox-beneficiaries` CLI command** — lists the seeded test accounts/MIDs (`--currency USD|KHR`, `--json`).
- **`payway-sdk payout` CLI command** — sends a payout / split-payout (`-t/-a/-c/-b "acc:amt,..."`); validates locally in sandbox and prints payout-specific error hints.
- **Payout hardening (SDK + CLI + docs)** — the payout `currency` must match the beneficiary account currency (and merchant credential currency). In sandbox, `payout.payout()` and `preAuth.completeWithPayout()` now call `validateSandboxBeneficiary(acc, currency, { sandbox })` so a KHR payout to a USD account (or any non-seeded account) throws `currency mismatch` / `not a known sandbox beneficiary` *before* the network call. New `PAYOUT_ERROR_CODES` (`PTL147`/`12` currency, `PTL146`/`PTL-PAYOUT-37`/`PTL46` whitelist, `PTL-PAYOUT-36` amount) are queryable via `payway-sdk explain` and surfaced by `printApiError` (plus HTTP 415 for the direct payout API's JSON-only requirement).
- **Skill helper scripts** — six dependency-free `.cjs` tools shipped inside their skills and covered by `src/__tests__/skill-scripts.test.ts`: `verify-callback.cjs`, `sign-request.cjs`, `mock-callback.cjs` (hash/webhooks), `checkout-payload.cjs` (first payment), `decode-status.cjs` (check-transaction), and `reconcile.cjs` (transaction-by-merchant-ref watermark/dedupe fallback job).

### Changed

- **`scripts/online-qr-poll.ts` accepts `[amount] [currency] [lifetimeSeconds] [template]`** — the poll window now equals the QR lifetime instead of a fixed 10 minutes, and the visual template is configurable (default `template2_color`).
- **Rate-limit responses are typed and retryable** - the strict caps (e.g. transaction-detail 10/min) are enforced by the sandbox as HTTP 403 with a NUMERIC body `status.code` 429 ("Rate limit exceeded...") and no rate-limit headers; numeric codes now pass error extraction so this maps to `PayWayRateLimitError` instead of an opaque non-retryable `api_error`. Rate-limited retries pace from the SDK's own observed request window (1-10s) rather than blind exponential backoff; verified live end-to-end (SANDBOX-FINDINGS §11).
- **Local throttle transparency** - new optional `onThrottle({ endpoint, waitMs })` hook (plus debug logging) fires when a request is queued by a documented-limit token bucket.
- **`transaction-detail --wait <seconds>`** - retries every 2s while the gateway reports code 6; sandbox-measured detail lag after creation is ~5s vs <1s for check-transaction. The command (and `printApiError`) now print targeted hints for both the lag and the 403+429 cap shape, pointing to check-transaction (600 req/s) as the fast status read.
- **`pollTransactionStatus` tolerates the creation grace period** — a check right after creation can answer HTTP 200 / `status.code 6` ("tran_id not found") for a few seconds; the poller now yields `paymentStatus: 'NOT_FOUND'` without counting it toward `maxConsecutiveErrors`, so legitimate purchase flows are never aborted by propagation delay (sandbox-verified 2026-08-25, see SANDBOX-FINDINGS §10).
- **`payment_gate=0` contract documented** — on the JSON Create Transaction path, gate 0 (+ `hosted_view`) is what makes the response include the hosted `checkout_qr_url`; JSDoc on `CreateTransactionParams.paymentGate`, `GenerateQrParams.lifetime` (seconds, min 3 min), and the OpenAPI types now state this.
- **`generate-checkout` no longer sends `payment_gate: 0`** — sandbox answers that value with an HTTP 200 HTML page instead of JSON.
- **Non-JSON responses are diagnosable** — "Invalid JSON response" errors now include content-type, an HTML-detection hint ("parameter rejected server-side"), and a body snippet.
- **`LinkCardParams.currency`** added (sandbox binding layer requires it; defaults `USD`) and included in the HMAC field list.
- **v3 token-management trio sends the required `request` field** (defaults to `requestId`), satisfying the server binding model.
- **Refund skill/docs** document the pre-flight balance pattern and PTL36.
- **Deterministic callback override** - `normalizePlan` replaces model-supplied `generate_online_qr` callback URLs with the merchant profile's configured URL; models can no longer inject placeholder webhooks into executed plans.
- **`payment_option` defaults to `abapay_khqr`** in `qr.generateQr` - PayWay's QR API now rejects requests without it (`400 The given data was invalid`).
- **Package entry exports** — `PAYOUT_ERROR_CODES`, `PRE_AUTH_ERROR_CODES`, and `GATEWAY_CODE_HINTS` are now exported from `aba-payway-ts` (in addition to `REFUND_ERROR_CODES`), so consumers and skills can switch on payout/pre-auth error codes directly.
- **PEM validation on RSA endpoints** - Refund, Pre-Auth, Payout, and Payment Link now throw a descriptive `PayWayConfigError` ("does not look like a public key PEM") before any encryption/network call when `publicKeyPem` is malformed.
- **URL auto-encoding** - `encodeBase64IfNeeded` now also base64-encodes protocol-relative (`//host/path`) and `www.`-prefixed URLs alongside `http(s)://`.
- **Provider error clarity** - inference timeouts now report "provider request timed out after <ms>" instead of the opaque "This operation was aborted"; TTY runs print a remediation hint on `PROVIDER_PROPOSAL_FAILED`.
- **`agent doctor` accuracy** - provider row reports `blocked` when `PAYWAY_AGENT_API_KEY` is unset instead of a false-positive `ok` from the unauthenticated `/models` ping.

### Fixed

- Multi-line quoted RSA PEMs in `.env` were truncated to their first line by the CLI's loader, silently breaking every RSA-encrypted endpoint (refund, payment links, pre-auth, payout).
- Explicit buffer encoding in `verifyCallbackSignature` timing-safe comparison.
- Removed four stale Biome lint warnings (unused suppressions + unused variable).

### Documentation

- Corrected the packaged-skill count in `.agents/AGENTS.md` (20 → 24) and documented the bundled `scripts/` tooling there; added the missing `PAYWAY_ENV` row to its environment-variable table.
- Replaced a dangling "Customer Module guide §10" reference in the transaction-by-merchant-ref skill with a direct link to the [aba-payway-customer-qr](skills/aba-payway-customer-qr/SKILL.md) skill.
- Added discovery pointers for the new skill and its offline helper scripts to `docs/README.md` Quick Links and the `docs/VISUAL-GUIDE.md` cheat sheet.
- Cross-linked online / offline / customer-module QR skills so the static-but-routable distinction is discoverable from each.
- **Environment-variable alignment (code is source of truth — the SDK reads `PAYWAY_RSA_PUBLIC_KEY` and `PAYWAY_ENV`, per `src/client.ts`)**: replaced incorrect `PAYWAY_PUBLIC_KEY_PEM` / `PAYWAY_PUBLIC_KEY` / `PAYWAY_ENVIRONMENT` references across `README.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/RELEASE_CHECKLIST.md`, and Chapters 02, 12, and 14; corrected a false claim that both public-key variable names are accepted.
- Added missing CLI commands to the README command table (`generate-checkout`, `payment-link create/detail`, `setup-webhook`, `config`) and fixed table cells that contained double-backslash pipe escapes.
- Updated "15-chapter guide" references to **16 chapters** (`README.md`, `docs/PROJECT_STATUS.md`).
- Synced `docs/PROJECT_STATUS.md` with repository reality: milestone C/E/F "uncommitted" markers corrected to their landing commits (`df04deb`, `bc4efb7`), commit history extended through `808dc80`, and a documentation-audit session entry added.
- Added `PAYWAY_ENV` to the configuration skill's environment-variable list (`skills/aba-payway-sdk-configuration/SKILL.md`).
- Added the **payout/sandbox-beneficiary knowledge base** (`docs/SANDBOX-BENEFICIARIES.md`) with the seeded fixtures, the currency-match rule, and where enforcement lives; added a Payout-Specific error table to `docs/12-error-handling-and-debugging.md` (codes `PTL147`/`12`, `37`/`PTL146`/`PTL-PAYOUT-37`/`PTL46`, `PTL-PAYOUT-36`, `1`, `24`, `415`) plus a `12`/`PTL147` row in the common-code table.
- Updated payout, pre-auth, and sandbox-beneficiaries skills (v1.2.0 / v1.2.0 / v1.1.0) with the currency-match rule, full error matrix, and `completeWithPayout` validation; corrected the packaged-skill count to **25** in `AGENTS.md` and `.agents/AGENTS.md`.

### Known open item

- v3 token-management endpoints (`renew-expired-account-token`, `get-token-details`, `remove-token`) reject all derivable HMAC compositions (~60 tried; SANDBOX-FINDINGS §9a) — awaiting ABA's official signature spec. Requests now pass the binding layer but fail at the hash layer.

## 1.3.0

### Added

- **Webhook CLI command** (`payway-sdk setup-webhook`) — starts a local HTTP server that receives, logs, and persists ABA PayWay payment callbacks. Supports JSONL file storage (zero deps), optional SQLite storage (via `better-sqlite3`), and optional Cloudflare Tunnel integration for public URL exposure.
- **Webhook HTTP server** (`src/webhook/server.ts`) — `POST /aba-payway-webhook` endpoint that acknowledges callbacks with `200 {"acknowledged": true}` and logs HMAC-SHA512 signature verification without rejecting.
- **Cloudflare Tunnel manager** (`src/webhook/tunnel.ts`) — spawns `cloudflared tunnel --url` as a subprocess, parses the generated `trycloudflare.com` URL, and manages the tunnel lifecycle.
- **Storage adapters** — `WebhookStorage` interface with JSONL (`src/webhook/storage-json.ts`) and SQLite (`src/webhook/storage-sqlite.ts`) implementations, plus auto-detection factory.
- **`PayWayWebhookError`** error class for webhook-specific failures.
- **24 new Vitest tests** across 4 test files covering storage, server, tunnel, and CLI integration.
- **Webhook Setup Guide** (`docs/16-webhook-setup-guide.md`) — comprehensive guide covering command options, storage backends, Cloudflare Tunnel setup, programmatic usage, and security checklist.

## 1.1.1

### Added

- QR template generation test script (`scripts/test-all-qr-templates.ts`) — generates QR codes for all 10 PayWay sandbox templates at a configurable amount and saves PNG images + QR strings to disk.
- Transaction status check script (`scripts/check-qr-transactions.ts`) — fetches recent transactions via `getTransactionList`, queries detail for each via `getTransactionDetail`, and saves structured JSON results.
- End-to-end QR template verification: all 10 templates generate valid QR codes, all 10 paid transactions verified as APPROVED.
- Sandbox findings documented: QR API template constraints, transaction list/detail response shapes, rate limits, and status filter parameter format.

### Fixed

- `validateTransactionId()` now enforces PayWay's 20-character limit and `[a-zA-Z0-9\-]` character set, matching the actual API constraint discovered during sandbox testing.
- `status` filter in `getTransactionList` — documented that it requires string enum values (e.g. `"APPROVED"`), not numeric codes.
- Rebuilt the packaged CLI with `generate-checkout`; it now invokes the Checkout API through a static `PayWay` import instead of shipping an outdated command list.

### Documentation

- Added `generate-checkout` CLI setup and usage guidance, including its `payment_gate: 0` response fields and the distinction between Checkout return URLs and configured callbacks.

### Changed

- Updated `docs/SANDBOX-FINDINGS.md` with QR template generation and transaction status verification findings.
- Updated `docs/PROJECT_STATUS.md` with QR template verification milestone.

## 1.0.0

### Added

- Added SDK retry support with `maxRetries`, `retryDelayMs`, `onRequest`, and `onResponse` hooks.
- Added centralized request execution with `_executeFetch()` and exponential backoff.
- Added offline KHQR generation via `payway.khqr.generateOfflineQR()`.
- Added full OpenAPI response typing for checkout, credential-on-file, QR, refund, payout, payment link, and pre-auth methods.
- Added RSA roundtrip validation and exact HMAC hashing tests.

### Fixed

- Hardened `PayWayAPIError` with safe `toJSON()` serialization, endpoint context, and retryability metadata.
- Improved retry handling for transient HTTP 5xx responses while preserving 4xx/200-business errors.

### Changed

- Bumped package version to `1.0.0`.
