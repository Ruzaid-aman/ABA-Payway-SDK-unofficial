# Agent Handoff — aba-payway-ts

**Audience:** an agent resuming work in a fresh session. Read this plus `AGENTS.md` before acting.
**Last updated:** 2026-08-30, after the v1.3.0 release and the coverage campaign.
**Provenance:** everything below was done and verified in prior sessions; per-item evidence paths are included so you never have to re-derive or re-probe.

---

## 1. Current state (verified on `main` @ `6bf3afc`)

| Aspect | State |
|---|---|
| Version | `1.3.0` (tag `v1.3.0`; package.json bumped from a stale 1.1.1 — the v1.2.0 tag already existed since July, **do not move tags**) |
| Tests | 988 tests / 63 files, all green (`npx vitest run`) |
| Typecheck / lint | `npx tsc --noEmit` clean; `npx biome lint src` clean |
| Coverage | 75.79% stmts / 71.08% branch / 83.68% funcs / 76.59% lines (`npx vitest run --coverage`) |
| Edge-case audit | **All 23 findings (EC-01–EC-23) remediated** — `audit-results/edge-case-report.md` (findings), `audit-results/code-improvement-plan.md` (batches 1–5, all marked done) |
| Release checklist | Run for 1.3.0: build, dist smoke, live `npm run probe` (all PATH_OK) — `docs/RELEASE_CHECKLIST.md` |
| Working tree | Clean; nothing untracked |

Recent commit history (oldest→newest): `0bbad8d` audit remediation batches 1–3 → `7898963` batch 4 → `dd4556f` batch 5 → `b6d15e1` release v1.3.0 → `9661b16` coverage 55→70% → `6bf3afc` changelog note.

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

## 4. Repo map (fast orientation)

- `src/client.ts` — HTTP core: `checkResponseError`, `createHttpError`, retry engine, config resolution. The most behavior-pinned file.
- `src/cli.ts` — 40+ commands; `runCli(argv)` for in-process invocation. `src/cli/commands/*` — agent, doctor, init, onboard, setup-webhook, skills.
- `src/domains/*` — checkout, qr, payment-link, pre-auth, payout, credentials-on-file, khqr.
- `src/webhook/*` — server (TD-09 verdict mode), storage (json default / sqlite optional peer dep), tunnel (cloudflared).
- `src/agent/*` — agentic CLI REPL (25+ modules, own test suite).
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

### 5.3 — Documentation & release hygiene (quick wins)
- Regenerate the TypeDoc API reference: `npm run docs:api` (the public API grew: `runCli`, `QR_LIFETIME_*`, `PURCHASE_LIFETIME_MIN_MINUTES`, `retryPolicy`, `allowPrivateCallbackHosts`, `verifyCallback` options).
- Repo root cleanup: `q33r.png`, `q34r.png`, `dhitraj-2026-08-24-21_53.jpg`, `webhook-stdout.log`, `webhook-stderr.log` are stray artifacts — delete or move under `test-output/` (ask the user first if unsure).
- `docs/README.md` index: add any missing links to the new audit artifacts.

### 5.4 — ABA dependency (blocked on external answers — do not burn time guessing)
`audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` holds Q1–Q10. The user must send these to PayWay. Answers unblock, in impact order:
1. **Q6 (token-trio HMAC composition)** — the v3 token-management endpoints ship capability-guarded (`allowUnverifiedTokenOperations`) because ~60 derivable HMAC compositions all returned "Wrong Hash" (SANDBOX-FINDINGS §9a). An official sample would unlock link/renew/get-details/remove end-to-end.
2. **Q9/Q10 (production `tran_id`/QR-duplicate semantics)** — decides whether `retryPolicy: 'transient'` is safe as the default for purchases.
3. **Q4 (close-transaction enforcement)** — sandbox treats close as advisory; production behavior determines whether the SDK needs a local closed-flag helper.

### 5.5 — Candidate SDK/CLI improvements (propose before building)
- CLI `doctor`: make the credential *source* (profile store vs `.env` vs env) an explicit first-class check row.
- CLI `skills add`: the installer writes to `~/.opencode/skills` but this OpenCode build loads from `~/.config/opencode/skills` (noted in AGENTS.md) — consider a `--target`/auto-detect flag.
- Rate-limit token-bucket rules exist only for check-transaction/detail/list/refund; add rules for `generate-qr`/payment-link only if ABA documents caps (Q5).
- Production base URL (`https://checkout.payway.com.kh`) is hardcoded but never verified live (SANDBOX-FINDINGS §1 "Still open") — confirm when production access exists.
- `npm publish` readiness is complete but is a user decision (outward-facing).

## 6. Testing conventions (established; follow them)

- **Gates before every commit:** `npx vitest run` (988 expected), `npx tsc --noEmit`, `npx biome lint src`.
- **Branch workflow:** create a branch per task → fast-forward merge to `main` after checking `main` hasn't moved (other agents work in parallel) → delete the branch. Conventional commit messages (`feat|fix|test|docs|chore(scope): …`).
- **In-process CLI tests:** use `runCli(argv)` with captured console and save/restore `process.exitCode`; the module loads `<cwd>/.env` on import, so chdir to a temp dir *before* the dynamic import. Never use `--help`/`--version` in-process (commander calls `process.exit`) and never invoke interactive commands without `-y`/`--json`.
- **Mock gateway:** `src/__tests__/cli-mock-commands.test.ts` shows the per-endpoint mock handler shapes (mirror sandbox-verified payloads). Note refund's `tran_id` travels inside the encrypted `merchant_auth`, so a mock cannot branch on it.
- **Behavior pins:** `edge-case-audit.test.ts` and the `FINDING:`-annotated tests document *why* behavior is pinned; a behavior change must flip the pin in the same commit.

## 7. Sandbox-verified facts you must not re-probe (evidence: `docs/SANDBOX-FINDINGS.md` §1–§13, `test-output/edge-case-probe/live-probe.log`)

- QR lifetime minimum is exactly 180 s; 100 000 s accepted; amounts $0.01 → $100 000 USD and KHR 4000 accepted.
- Duplicate `tran_id` silently accepted on both `purchase` and `generate-qr` (two live QRs, different amounts, same ID).
- Rate limits: detail 10/min, list 50/min — enforced as **HTTP 403 with numeric body `status.code` 429** and no headers.
- Gateway error shapes: HTTP 200-wrapped `status.code` (6 = not-found), 403 `PTL*` codes, 400 `"04"` binding failures, code 69 (lifetime), flat-code 403s on legacy paths.
- Close-transaction is advisory in sandbox (closed-unpaid txns still pay and stay PENDING); no CLOSED status exists anywhere.
- check-transaction sees new transactions in <1 s; transaction-detail needs ~5 s.
- v3 token trio: binding layer OK, HMAC composition black-box (60+ attempts) — capability-guarded in the SDK.

## 8. Anti-checklist (things agents got wrong before — do not repeat)

- Don't set `NODE_TLS_REJECT_UNAUTHORIZED` globally; don't commit `.env`, `dist/`, `test-output/`, or profile stores.
- Don't "fix" `validateLifetime` to enforce 180 s everywhere — checkout minutes ≠ QR seconds.
- Don't parse `Retry-After` as milliseconds; don't skip the empty-body guard; don't un-guard private callback hosts by default.
- Don't bump/move existing git tags; next release is **v1.4.0** (or v1.3.1 for fix-only), via `docs/RELEASE_CHECKLIST.md`.
- Don't commit without the three gates; don't merge without checking `main` hasn't moved.
- Don't rewrite audit artifacts (`audit-results/*`, `docs/SANDBOX-FINDINGS.md` history) — append new sections with dates.
