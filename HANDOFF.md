# Agent Handoff — aba-payway-ts

**Audience:** an agent resuming work in a fresh session. Read this plus `AGENTS.md` before acting.
**Last updated:** 2026-08-31, after the live API parity work on `feat/live-api-parity` (B1–B6: OpenAPI sync, CoF/QR param parity, advisory validation, COF/QR error families, `cof`/`beneficiary` CLI groups, `transaction-list` pre-validation).
**Provenance:** everything below was done and verified in prior sessions; per-item evidence paths are included so you never have to re-derive or re-probe.

---

## 1. Current state (verified on `feat/live-api-parity` @ `9396277`; main last at `d486738` + docs sync)

| Aspect | State |
|---|---|
| Version | `1.3.0` (tag `v1.3.0`; package.json bumped from a stale 1.1.1 — the v1.2.0 tag already existed since July, **do not move tags**) |
| Tests | 1218 tests / 79 files green (`npx vitest run` after `npm run build`; +13 opt-in sandbox contract tests skipped unless `SANDBOX_CONTRACT_TESTS=1`) |
| Typecheck / lint | `npx tsc --noEmit` clean; `npx biome lint src` clean |
| Coverage | ~78% stmts / ~72.5% branch (`npx vitest run --coverage`); CI enforces floors 74/69/80/74 via vitest.config.ts thresholds — ratchet upward |
| Mutation testing | StrykerJS 10 spike on auth.ts + circuit-breaker.ts: **91.3% score** — `docs/MUTATION-SPIKE-2026-08-31.md`, `stryker.config.json` (dev-only, Node ≥ 22, not in CI) |
| Edge-case audit | **All 23 findings (EC-01–EC-23) remediated** — `audit-results/edge-case-report.md` (findings), `audit-results/code-improvement-plan.md` (batches 1–5, all marked done) |
| Live API parity | **B1–B6 complete** on `feat/live-api-parity` (8 commits, `c92b9cd`→`9396277`): OpenAPI 24-op coverage matrix, CoF/QR param parity, advisory validation (`strictValidation`), COF/QR error families + `PayWaySignatureError`, `cof`/`beneficiary` CLI groups, `transaction-list` pre-validation. Plan: `audit-results/live-parity-handoff.md` |
| Release checklist | Run for 1.3.0: build, dist smoke, live `npm run probe` (all PATH_OK) — `docs/RELEASE_CHECKLIST.md` |
| Working tree | Clean; nothing untracked |

Recent commit history (oldest→newest): `0bbad8d` audit remediation batches 1–3 → `7898963` batch 4 → `dd4556f` batch 5 → `b6d15e1` release v1.3.0 → `9661b16` coverage 55→70% → `6bf3afc` changelog note → `d486738` agent testability refactor → docs sync → `c92b9cd`→`9396277` live parity B1–B6 (on `feat/live-api-parity`).

## 2. Environment rules (violating these has caused real incidents)

- **Sandbox TLS:** the sandbox presents a self-signed chain. Prefix commands with `NODE_TLS_REJECT_UNAUTHORIZED='0'` **scoped to that one command only** — never exported globally.
- **Credentials:** `.env` at the repo root holds real sandbox credentials (merchant `ec476910`). The CLI **also** has a persisted global profile store (Windows: `%APPDATA%/aba-payway-sdk/profiles.json`) with valid credentials. Precedence: `--profile` / `PAYWAY_PROFILE` > default profile > `.env` > ambient env. Consequence: **CLI API commands succeed from any cwd** and print `Using profile: …` — this is documented behavior (EC-14), not a bug.
- **Hermetic tests:** `src/test/vitest-hermetic-env.ts` scrubs every `PAYWAY_*` var at each test-file start. Suites that need env re-set it with `vi.stubEnv()`.
- **Secrets:** never log, commit, or print API keys/PEMs. `sanitizeForLog()` masks sensitive keys and 40+-hex values.
- **Network:** live probes are sandbox-only, read-mostly, and must write evidence into `test-output/` and findings into `docs/SANDBOX-FINDINGS.md`. Production is never probed without an explicit user instruction and production credentials.

## 3. Behavior contract as of v1.3.0 (do not reintroduce old behavior)

Each item is pinned by a named test — if you change one, flip the test consciously and note it in CHANGELOG:

- QR `lifetime` < 180 s throws locally (`validateQrLifetimeSeconds`, `QR_LIFETIME_MIN_SECONDS`); > 120 days warns once (`QR_LIFETIME_MAX_SECONDS`). Gateway minimum is sandbox-pinned at exactly 180 s (179 → HTTP 400 code `"04"`).
- `checkout.purchase` `lifetime` is **minutes**, minimum 3 enforced locally (`validatePurchaseLifetimeMinutes`, `PURCHASE_LIFETIME_MIN_MINUTES`); below 3 the gateway answers error 69. The shared `validateLifetime()` is intentionally unit-agnostic.
- Empty 2xx bodies throw `"Empty response body…"`; only HTTP 204 (and literal JSON `null`) resolve `null`.
- Non-OK non-JSON bodies (CDN HTML pages) keep their HTTP status and 5xx retryability.
- Flat top-level `code` on non-OK responses populates `paywayCode` (legacy list shape).
- Legacy numeric `status` bodies (`{"status": 6, "description": …}`) throw `PayWayBusinessError`.
- 200-wrapped flat `code: "429"` throws `PayWayRateLimitError`.
- `Retry-After` is parsed as **seconds → ms**.
- `PAYWAY_ENV=<URL>` is honored as base URL (precedence: config `baseUrl` > `PAYWAY_BASE_URL` > `PAYWAY_ENV` URL).
- `timeout ≤ 0` and whitespace-only credentials throw `PayWayConfigError` at construction.
- Private/loopback callback hosts are rejected unless `allowPrivateCallbackHosts: true`.
- `checkout.purchase` accepts `retryPolicy: 'transient' | 'none'`.
- `verifyCallback(body, sig, { stripHash: true })` available; default is unchanged (caller strips `hash`).
- `src/cli.ts` exports `runCli(argv)` behind a main-module guard; the self-parse only fires when invoked directly. Verified against `npx tsx src/cli.ts`, `dist/cli.js`, and the child-process suite — **keep all three working if you touch it**.
- **(2026-08-31)** Every API domain method accepts a trailing `callOptions?: { timeoutMs?, signal? }` — per-call timeout override; an aborted `signal` cancels the in-flight fetch and is never retried (`RequestCallOptions`, exported).
- **(2026-08-31)** `verifyCallbackDetailed(body, sig, options?)` returns `{ valid, reason }` with reasons `malformed_signature` / `empty_body` / `signature_mismatch`; `verifyCallbackSignature` delegates to it (boolean behavior identical).
- **(2026-08-31)** `doctor`'s framework row is advisory (ok=true) when no framework exists — SDK/CLI repos are not failures.
- **(2026-08-31, live parity B5)** COF error family: 200/400 body `status.code "04"` + `errors{}` map → `PayWayBusinessError` carrying `fieldErrors`; `1`/`01`/`PTL02` → `PayWaySignatureError` (with endpoint hash-order hint); `98` → merchant-profile hint; `104`/`105`/`09` → token hints.
- **(2026-08-31, live parity B5)** QR string-code family table: 1,6,8,12,16,17,18,19,21,23,32,35,44,47,48,96,102,403,429 (see `src/client.ts` `checkResponseError`).
- **(2026-08-31, live parity B5)** `link-card` responses are ALWAYS HTML (success and error) — detected and surfaced as a structured error/hint, never a JSON-parse failure.
- **(2026-08-31, live parity B5)** Throttle rule: `get-transactions-by-mc-ref` 10 req/60s added to the client defaults.
- **(2026-08-31, live parity B6)** CLI `cof` group (`link-account`, `link-card`, `charge`, `token renew|details|remove`) and `beneficiary` group (`add`, `update-status`) — token trio param shapes: details takes ONLY `--request-id`; remove takes `--ctid --token`, no requestId.
- **(2026-08-31, live parity B6)** `transaction-list` pre-validates locally: window ≤3 days (gateway 403s wider) and `--pagination` ≤1000 → exit 1 with hint, before any network call.
- **(2026-08-31, live parity B6)** `generate-qr` accepts the 9 live-documented optional params (`--first-name --last-name --email --phone --items --return-deeplink --custom-fields --return-params --payout`); `generate-checkout` accepts the full B6 set (`--ctid --token-flag --frequency --type --firstname/--lastname/--email/--phone --items --shipping --lifetime --custom-fields --return-params --skip-success-page --view-type --continue-success-url`). `--items`/`--custom-fields`/`--payout`/`--return-deeplink` accept inline JSON or raw string via `parseJsonOrString`.

## 4. Repo map (fast orientation)

- `src/client.ts` — HTTP core: `checkResponseError`, `createHttpError`, retry engine, config resolution. The most behavior-pinned file.
- `src/cli.ts` — 40+ commands; `runCli(argv)` for in-process invocation. `src/cli/commands/*` — agent, doctor, init, onboard, setup-webhook, skills. `src/cli/commands/agent-helpers.ts` — pure setup validation + doctor/ack/session rendering behind the `agent` command tree.
- `src/domains/*` — checkout, qr, payment-link, pre-auth, payout, credentials-on-file, khqr.
- `src/webhook/*` — server (TD-09 verdict mode), storage (json default / sqlite optional peer dep), tunnel (cloudflared).
- `src/agent/*` — agentic CLI REPL (25+ modules, own test suite). `repl-helpers.ts` — pure directive classification + `:run` dispatch validation (security boundary); `progress.ts` / `ansi.ts` — shared ask/REPL presentation. The REPL loop is `runRepl(io)` with injected streams; `startRepl` wires the real terminal.
- `src/test/index.ts` — built-in mock PayWay server + test harness (used by `payway-sdk demo`).
- `src/__tests__/edge-case-audit.test.ts` — the error-path behavior spec; update consciously, never delete pins.
- Docs: `docs/12-error-handling-and-debugging.md` (code tables + behavior notes), `docs/SANDBOX-FINDINGS.md` (§1–§13 gateway facts), `docs/07-qr-code-handling.md` (QR lifecycle), `docs/RELEASE_CHECKLIST.md`, `docs/02-prerequisites-and-setup.md` (credential precedence).
- Scripts: `scripts/sandbox-campaign-*.ts`, `scripts/online-qr-poll.ts`, `scripts/checkout-link-poll.ts` (re-runnable live probes), `scripts/sandbox-probe.ts` (path checker; needs explicit env vars).

## 5. Next work items (priority order, with definition of done)

### 5.1 — SQLite webhook storage coverage (small, try first)
`src/webhook/storage-sqlite.ts` is at 17% because `better-sqlite3` (optional peer dep) is not installed, so only the load-failure branch executes.
- **Do:** `npm i -D better-sqlite3`, then add round-trip tests (save/getAll/count/updateKhqrMetadata/close + corrupt-file handling) mirroring `src/__tests__/webhook-storage-factory.test.ts` (written backend-agnostic — they must keep passing with the driver installed).
- **Done when:** coverage ≥ 71% and the full suite is green with the driver installed. **If the native build fails on Windows, revert the install and close the item — do not fight the toolchain.**

### 5.2 — Agent module testability refactor (DONE 2026-08-30)
Pure helpers were extracted out of `agent.ts` / `repl.ts` into `src/cli/commands/agent-helpers.ts`,
`src/agent/repl-helpers.ts` (directive classification + `:run` dispatch validation), `src/agent/progress.ts`,
and `src/agent/ansi.ts`; the REPL loop is in-process testable via `runRepl(io)` (injected streams; `startRepl`
still wires the real terminal). Coverage: `agent.ts` 28% → 77%, `repl.ts` 4% → 85% (DoD was ≥60% combined).
New suites: `agent-command-helpers`, `agent-repl-helpers`, `agent-cli-inprocess`. Remaining uncovered lines
are the TTY-only branches of `ask` / `sessions clear` and the interactive onboard hand-off.

### 5.3 — Documentation & release hygiene (TypeDoc + index DONE 2026-08-30)
- ~~Regenerate the TypeDoc API reference~~ — DONE: `npm run docs:api` re-run (covers `runCli`, `QR_LIFETIME_*`, `PURCHASE_LIFETIME_MIN_MINUTES`, `retryPolicy`, `allowPrivateCallbackHosts`, `verifyCallback` options, `runRepl`). 0 errors / 79 pre-existing warnings (referenced-but-undocumented internal types).
- ~~`docs/README.md` index~~ — DONE: agent/ops docs, sandbox evidence, and `audit-results/*` artifacts now linked; Validation Behavior section reflects the v1.3.0 contract (lifetime minimums, private-host guard, config sanity).
- Repo root cleanup still open: `q33r.png`, `q34r.png`, `dhitraj-2026-08-24-21_53.jpg`, `webhook-stdout.log`, `webhook-stderr.log` are stray artifacts — delete or move under `test-output/` (ask the user first if unsure).

### 5.4 — ABA dependency (blocked on external answers — do not burn time guessing)
`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` holds Q1–Q10. The user must send these to PayWay. Answers unblock, in impact order:
1. **Q6 (token-trio HMAC composition)** — the v3 token-management endpoints ship capability-guarded (`allowUnverifiedTokenOperations`) because ~60 derivable HMAC compositions all returned "Wrong Hash" (SANDBOX-FINDINGS §9a). An official sample would unlock link/renew/get-details/remove end-to-end.
2. **Q9/Q10 (production `tran_id`/QR-duplicate semantics)** — decides whether `retryPolicy: 'transient'` is safe as the default for purchases.
3. **Q4 (close-transaction enforcement)** — sandbox treats close as advisory; production behavior determines whether the SDK needs a local closed-flag helper.

### 5.5 — Production review P0–P3 (DONE 2026-08-31 — see CHANGELOG Unreleased + docs/MUTATION-SPIKE-2026-08-31.md)
CI build-before-test + coverage floors + Node ≥20 engines + badge; `npm run test:sandbox` live contract suite; shipped mock harness routes all client status endpoints; shared `src/test/test-utils.ts`; onboard/setup-webhook injectable seams (onboard 69%, setup-webhook 85.5%); per-call `RequestCallOptions` on every domain method; `verifyCallbackDetailed`; fake-timer resilience tests + dist freshness guard; Stryker spike 91.3%; `docs/PRODUCTION-VERIFICATION-PLAN.md` (gated on production credentials); npm publish prep in RELEASE_CHECKLIST (**publishing itself remains the maintainer's call — package not on the registry**).

### 5.6 — Live API parity B1–B6 (DONE 2026-08-31 on `feat/live-api-parity`, `c92b9cd`→`9396277`)
Full plan + evidence: `audit-results/live-parity-handoff.md`, coverage matrix `audit-results/live-api-coverage-2026-08-31.md`.
- **B1/B2 (OpenAPI sync + CoF/QR param parity):** 24-op coverage matrix vs developer.payway.com.kh; `generateQr` gained the 9 live-documented optional params; CoF `linkAccount`/`linkCard`/`payment`/token-trio realigned to live docs; token trio UN-GATED (sandbox-verified hash orders, `allowUnverifiedTokenOperations` deprecated).
- **B4 (advisory validation):** `strictValidation` escalation — validation is advisory by default, strict mode throws; wired into QR + checkout + CoF.
- **B5 (error families):** COF family (`status.code "04"` + `errors{}` → `PayWayBusinessError.fieldErrors`; `1`/`01`/`PTL02` → `PayWaySignatureError`; `98`/`104`/`105`/`09` hints), QR string-code family table, `get-transactions-by-mc-ref` throttle rule (10/60s), link-card HTML-response guard.
- **B6 (CLI parity):** `cof` group (`link-account`, `link-card`, `charge`, `token renew|details|remove`), `beneficiary` group (`add`, `update-status`), `generate-checkout` full B6 flag set, `generate-qr` 9 new params, `transaction-list` local pre-validation (≤3-day window, ≤1000 page size), `parseJsonOrString` helper for JSON-or-string flags. Tests: `src/__tests__/cli-mock-commands.test.ts` (cof/beneficiary/transaction-list/B6-flag-forwarding cases).
- **Note:** there is NO standalone `item-entries` command in the B6 spec — `ItemEntry` is consumed by `--items` flags on `generate-qr`/`generate-checkout`/`cof charge`/`payment-link create`, all wired and tested.

### 5.7 — Next: B7 docs & release (the remaining parity batch)
Per `audit-results/live-parity-handoff.md` §B7:
- `CHANGELOG.md` v1.4.0 with the **breaking changes** list: linkAccount/linkCard required fields; token-trio param split (`getTokenDetails` now `{requestId}`, `removeToken` now `{ctid,paymentToken}`); CoF hash orders realigned; cofPayment no longer sends `request_id`; linkCard no longer sends `returnUrl`/`returnDeeplink`; trio un-gated; khqr merchantRef error class; purchase throws when google_pay without token.
- `docs/09-link-unlink-renew-lifecycle.md` (token lifecycle resolution), `docs/12-error-handling-and-debugging.md` (new COF/QR families, `PayWaySignatureError`), README + AGENTS.md new command examples (`cof`, `beneficiary`).
- Version bump → 1.4.0 via `docs/RELEASE_CHECKLIST.md`. **`npm publish` is a USER decision — never publish.**
- Then merge `feat/live-api-parity` → `main` (check main hasn't moved; ff-merge; delete branch).

### 5.8 — Candidate SDK/CLI improvements (propose before building)
- CLI `doctor`: make the credential *source* (profile store vs `.env` vs env) an explicit first-class check row.
- CLI `skills add`: the installer writes to `~/.opencode/skills` but this OpenCode build loads from `~/.config/opencode/skills` (noted in AGENTS.md) — consider a `--target`/auto-detect flag.
- Rate-limit token-bucket rules exist only for check-transaction/detail/list/refund; add rules for `generate-qr`/payment-link only if ABA documents caps (Q5).
- Production base URL (`https://checkout.payway.com.kh`) is hardcoded but never verified live (SANDBOX-FINDINGS §1 "Still open") — confirm when production access exists.
- `npm publish` readiness is complete but is a user decision (outward-facing).

## 6. Testing conventions (established; follow them)

- **Gates before every commit:** `npm run build` (two suites hard-require fresh `dist/cli.js`) → `npx vitest run` (1218 expected) → `npx tsc --noEmit` → `npx biome lint src`.
- **Branch workflow:** create a branch per task → fast-forward merge to `main` after checking `main` hasn't moved (other agents work in parallel) → delete the branch. Conventional commit messages (`feat|fix|test|docs|chore(scope): …`).
- **In-process CLI tests:** use `runCli(argv)` with captured console and save/restore `process.exitCode`; the module loads `<cwd>/.env` on import, so chdir to a temp dir *before* the dynamic import. Never use `--help`/`--version` in-process (commander calls `process.exit`) and never invoke interactive commands without `-y`/`--json`.
- **In-process agent tests** (see `src/__tests__/agent-cli-inprocess.test.ts`): point `process.env.APPDATA` at a temp dir (agent paths resolve it per call), register a fresh `Command` via `registerAgentCommands`, drive with `parseAsync`; drive the REPL via `runRepl({ input, output, interactive })` with `PassThrough` streams and spy `console.log`. Strip ANSI before asserting output. Network-free provider turns ride the privacy gate: a config without `privacyAcknowledgedAt` makes `runOneShot` return `blocked`/`PRIVACY_ACK_REQUIRED` before any call.
- **Mock gateway:** `src/__tests__/cli-mock-commands.test.ts` shows the per-endpoint mock handler shapes (mirror sandbox-verified payloads). Note refund's `tran_id` travels inside the encrypted `merchant_auth`, so a mock cannot branch on it.
- **Behavior pins:** `edge-case-audit.test.ts` and the `FINDING:`-annotated tests document *why* behavior is pinned; a behavior change must flip the pin in the same commit.

## 7. Sandbox-verified facts you must not re-probe (evidence: `docs/SANDBOX-FINDINGS.md` §1–§14, `src/__tests__/sandbox-contract.test.ts` — `npm run test:sandbox`)

- QR lifetime minimum is exactly 180 s; 100 000 s accepted; amounts $0.01 → $100 000 USD and KHR 4000 accepted.
- Duplicate `tran_id` silently accepted on both `purchase` and `generate-qr` (two live QRs, different amounts, same ID).
- Rate limits: detail 10/min, list 50/min — enforced as **HTTP 403 with numeric body `status.code` 429** and no headers.
- Gateway error shapes: HTTP 200-wrapped `status.code` (6 = not-found), 403 `PTL*` codes, 400 `"04"` binding failures, code 69 (lifetime), flat-code 403s on legacy paths.
- Close-transaction is advisory in sandbox (closed-unpaid txns still pay and stay PENDING); no CLOSED status exists anywhere.
- check-transaction sees new transactions in <1 s; transaction-detail needs ~5 s.
- (§14, 2026-08-31) **Unpaid QR-only transactions are invisible to transaction-list** while check-transaction/detail see them; transaction-list rejects date ranges wider than 3 days with HTTP 403 ("Maximum date rang is allowed only 3 days"). Pinned as live tests in the sandbox contract suite.
- v3 token trio: binding layer OK, HMAC composition black-box (60+ attempts) — capability-guarded in the SDK.

## 8. Anti-checklist (things agents got wrong before — do not repeat)

- Don't set `NODE_TLS_REJECT_UNAUTHORIZED` globally; don't commit `.env`, `dist/`, `test-output/`, or profile stores.
- Don't "fix" `validateLifetime` to enforce 180 s everywhere — checkout minutes ≠ QR seconds.
- Don't parse `Retry-After` as milliseconds; don't skip the empty-body guard; don't un-guard private callback hosts by default.
- Don't bump/move existing git tags; next release is **v1.4.0** (or v1.3.1 for fix-only), via `docs/RELEASE_CHECKLIST.md`.
- Don't commit without the three gates; don't merge without checking `main` hasn't moved.
- Don't rewrite audit artifacts (`audit-results/*`, `docs/SANDBOX-FINDINGS.md` history) — append new sections with dates.
- Don't test the interactive REPL through `startRepl`/`process.stdin`; use the `runRepl(io)` seam. Don't assert on raw CLI output without stripping ANSI (color codes break `toContain`).
