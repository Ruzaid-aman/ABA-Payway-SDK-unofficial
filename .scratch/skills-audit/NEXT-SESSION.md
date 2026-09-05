# Next-Session Work List — from the 2026-09-03 skills audit

> **STATUS (2026-09-05 session):**
> - **T1 DONE** — root-caused + fixed in `3f54398`: the gateway signs `ctid` between `items` and `shipping` (27-field order); the docs' 26-field list omits ctid and is rejected. With the fix the gateway answers `104` "Merchant not enabled token flag" — the sandbox profile is NOT subscription-enabled (external blocker; question drafted in [ABA-QUESTIONS-2026-09-05.md](ABA-QUESTIONS-2026-09-05.md)). Evidence: `test-output/subscription-hash/`, SANDBOX-FINDINGS §17, `scripts/sandbox-probe-subscription.ts`.
> - **T2 DONE** (`e1e778d`) — 9 skill one-liners + AGENTS.md/README payout account swap; audit greps re-run clean; `.zcode/skills` re-synced.
> - **T3.1–T3.4 DONE** (`0027d58`) — script exit-code contract (0 ok · 1 runtime/API · 2 usage/env, documented in skills/README.md), .env auto-load, code-6 decode sync. T3.5 DONE (`3e27bb4`) — --json error envelopes for check-transaction + transaction-detail. **T3.6/T3.7 closed as already-correct** — `config` exits 1 on error-severity issues and `validate` exits 1 on invalid values; the audit's exit-0 claims do not reproduce (live-verified 2026-09-05).
> - **T4** — questions drafted in [ABA-QUESTIONS-2026-09-05.md](ABA-QUESTIONS-2026-09-05.md) (Q-A subscription, Q-B model, Q-C mc-ref 404, Q-D carried).
> - **T5.2/T5.3** — still PROPOSED, not built (needs user go-ahead per HANDOFF §5.8). T5.1 DONE (contract written into skills/README.md). T5.5/T5.6 were folded into T2 edits.
> - **NEXT (2026-09-05 evening): all audit items closed — the next session's primary task is the Purchase API test campaign**: `.scratch/purchase-api-test-plan/TEST-PLAN.md` (KHQR + card × 4 routes, H1–H8, waves 1–4, user-manual steps U1–U12). See HANDOFF.md "Last updated" + §5.1.

**Provenance:** extracted from the full skills audit ([REPORT.md](REPORT.md), 29/29 skills tested by 3 parallel agents; evidence in [group-A-payments.md](group-A-payments.md), [group-B-cof-tokens.md](group-B-cof-tokens.md), [group-C-transactions-payout.md](group-C-transactions-payout.md)). Do not re-probe what §6 below already answers — the evidence files carry commands + outputs.

**Rule of thumb:** items are ordered by user impact. T1 fixes a broken documented flow; T2 is cheap one-line doc truth; T3 is script hygiene; T4/T5 need external answers — timebox, don't guess.

---

## T1 — BLOCKER: subscription purchases fail live (`Wrong Hash`)

- **Symptom:** `generate-checkout --ctid customer123 --token-flag CITR_FIX --frequency 1M` (any `--payment-option`, incl. default `abapay_khqr_deeplink`) → gateway `Wrong Hash`, business code 1, exit 2. Reproduced with default, `cards`, and `abapay` options (group-A-payments.md, skill §aba-payway-subscription).
- **Not a local-signing bug:** hash construction matches `PURCHASE_HASH_FIELDS` byte-for-byte; local trio validation passes. Same command WITHOUT the subscription trio succeeds → the trio changes something gateway-side.
- **Hypotheses to test in order:** (a) sandbox merchant profile `ec476910` isn't subscription-enabled — ask ABA / try another profile; (b) the 26-field order needs a subscription-specific variant (e.g. `frequency` position) — capture the mock-gateway body vs what the gateway expects; (c) gateway regression.
- **DoD:** either a green live subscription checkout with evidence in `test-output/`, or a root cause + an explicit gate (advisory warning on the subscription trio: "profile must be subscription-enabled") + CHANGELOG entry.
- **Related doc bug:** the subscription skill example omits `--payment-option`; the default `abapay_khqr_deeplink` is outside the skill's own documented subscription option set and fires an advisory. Fix in the same change.

## T2 — Doc drift: 9 one-line skill fixes (cheap, high truth value)

1. `aba-payway-first-payment`: "CLI never auto-polls" is wrong — plain `generate-qr` polls by default (`--polling default: true`); only the agent REPL doesn't. Rephrase.
2. `aba-payway-first-payment`: example omits the credential prerequisite for the script; `checkout-payload.cjs` doesn't load `.env`.
3. `aba-payway-offline-qr`: enumerate the 7 required `PAYWAY_KHQR_*` env vars (bare `--offline` fails with 7 `KHQR_*_REQUIRED` codes, exit 1; current `.env` lacks them).
4. `aba-payway-payment-link`: document the CLI inspect path `payment-link detail -i <id>` (`-i` required; positional rejected) — skill only shows SDK `getDetails`.
5. `aba-payway-test-harness`: add the CLI wrappers `payway-sdk test` / `payway-sdk demo`.
6. `aba-payway-sdk-configuration`: add missing env vars — `PAYWAY_KHQR_PAYWAY_DATA`, `PAYWAY_CALLBACK_URL`/`PAYWAY_RETURN_URL`/`PAYWAY_CANCEL_URL`, `PAYWAY_PROFILE`, `PAYWAY_AGENT_*`; fix `backoffJitter` default (`'none'`, not `'full'`).
7. `aba-payway-agent`: replace the dead `x-preview-f-free` Quick Start model (provider 401 "not supported", live-reproduced); document that non-TTY provider errors may NOT be redacted to `[REDACTED]` (soft gap vs the skill's claim).
8. `aba-payway-customer-qr`: warn that `decode-khqr.cjs` image mode can't read styled/template PayWay PNGs (jsQR "No QR detected" on `template3_color`-style output) — plain QRs decode fine.
9. `aba-payway-check-transaction` + `decode-status.cjs`: reconcile code 6 — the skill documents it, the script prints `UNKNOWN code 6` (see T3.3).

**Also (repo docs, not skills):** root `AGENTS.md` payout examples use `000999888`, which is NOT in the seeded sandbox whitelist → live QR payout 403 `Payout accounts are not in whitelist`. Swap to a seeded account from `sandbox-beneficiaries` (fixture list is byte-identical to the CLI).

**Remember the repo rule (HANDOFF §8):** when a skill shape changes, re-run the skills audit greps — and after editing `skills/`, re-copy to `.zcode/skills/` (the install we did 2026-09-03 is byte-identical; keep it that way or document the divergence).

## T3 — Script/CLI bugs (bundled `.cjs` + CLI polish)

1. **`aba-payway-first-payment/scripts/checkout-payload.cjs`**: exits 0 on ALL failures (missing creds, validation errors); doesn't load `.env`; silently accepts `--currency EUR`. → Exit 1 on validation failure, 2 on missing creds; validate currency domain; load `.env` like the CLI does.
2. **`aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs`**: one-shot mode has no try/catch → raw uncaught stack trace (exit 1) when the API fails (live: the endpoint 404s today, see T4.1); doesn't load `.env` (skill examples imply standalone). → Wrap one-shot in the same try/catch watch mode has; document `set -a; . ./.env` or auto-load.
3. **`aba-payway-check-transaction/scripts/decode-status.cjs`**: prints `UNKNOWN code 6` for `payment_status_code:6` though code 6 is documented. → Sync its code map with `src/constants.ts` / the skill table.
4. **`aba-payway-hash/scripts/sign-request.cjs` / `mock-callback.cjs`**: unknown preset / bad `--status` throw raw stack traces (exit 1) instead of clean usage errors (exit 2) — inconsistent with their own good usage errors. → Validate args, print usage, exit 2.
5. **CLI `--json` error path:** `check-transaction --json` / `transaction-detail --json` print the human block on failure (exit 2) — agents can't parse errors from stdout. → JSON-ify errors on the `--json` path (or document "branch on exit code" in the skills). Behavior-pinned? Check before changing.
6. **CLI `config` exits 0 while reporting a missing-var error** — should be exit 1 (or documented as advisory). Check pins first.
7. **CLI `validate` is informational** — exit 0 even when invalid; agents must parse text. Consider `--strict` exit 1 or document in skills.

## T4 — Environment drift / external questions (blocked on outside answers — timebox)

1. **`get-transactions-by-mc-ref` 404s in sandbox today** (HTTP 404, empty body; CLI + reconcile.cjs) while sibling endpoints work. Was live-verified in §7-era campaigns → regression or environment change. Ask ABA / re-probe once next session; if still 404, append to `docs/SANDBOX-FINDINGS.md` (never rewrite).
2. **Agent provider model:** which model replaces `x-preview-f-free`? Live ask → `PROVIDER_PROPOSAL_FAILED` / HTTP 401 "Model x-preview-f-free is not supported". Needs the current supported list (provider account question, not repo).
3. **Subscription profile enablement** — see T1(a).
4. **transaction-detail 403/429 cap not reproducible** (6 rapid calls, no throttle) — the skill's claim stands as a dated measurement; either re-measure with a proper burst or annotate the skill with the date. Don't burn more than a few calls (rate limit 10/min is real per §7).
5. **Sandbox looser than production in 2 places** (not bugs, but doc targets): token-flag domain accepts 4 values in sandbox (`CITO_FIX`, `CITR_FLEX` pass with advisory; docs say live = `CITI_FLEX`|`CITO_FLEX` only) and transaction-list status enum includes `PRE-AUTH` + gateway typo `DECLINDED` (`src/domains/checkout.ts:481`). Decide: document as sandbox-only, or normalize the typo client-side (note: normalizing changes a behavior pin — check first).

## T5 — Enhancements (propose before building, per HANDOFF §5.8 convention)

1. **Exit-code contract for bundled scripts** — add a mini-contract to the skills README (or fix scripts per T3 so the contract holds): 0 success / 1 usage / 2 validation. Currently scripts violate it in 4 ways (T3.1–T3.4).
2. **`skills add --target <dir>` / auto-detect** — the installer writes `~/.opencode/skills` but the current OpenCode build loads `~/.config/opencode/skills` (AGENTS.md note, 2026-08-26). Also: ZCode project-scope install (`.zcode/skills/`, what we did manually 2026-09-03) could be a first-class agent target `zcode-project`. Now there's real demand from this session.
3. **`skills doctor`**: extend to also verify project-scope copies (`.zcode/skills`) and offer a `skills sync` command to re-copy after `skills/` edits (this session's divergence risk, T2 note).
4. **Error-path JSON envelopes** (see T3.5) — if pursued, make it uniform across all network commands.
5. **Exchange-rate help text** says "USD/KHR" but the endpoint returns 6+ pairs — either widen the help or expose the full pair list in the skill.
6. **QR styled-PNG decoding** — `decode-khqr.cjs` can't read template-styled PNGs (jsQR limit). Cheap option: document (T2.8, preferred); richer: decode via the pre-render KHQR string instead of the PNG.

## T6 — Facts/learnings to carry forward (no action, just knowledge)

- **Exit-code contract (live-confirmed):** 0 success/pending · 1 local validation (incl. commander missing-flag) · 2 PayWay API failure · 3 network/timeout/rate-limit (`PayWayRateLimitError→3`; poll timeout → `{"event":"aborted","reason":"max_duration_exceeded"}` exit 3). Exception: bundled scripts + `validate` (informational, always 0).
- **Gateway validation order matters:** on the QR payout path the whitelist check (403) runs BEFORE payout-key shape, so a wrong `{acc,amt}` shape masquerades as a whitelist error; on payment-link, shape/total checks are client-side first. Debugging ordering: check whitelist, then shape.
- **Payout key shapes (re-confirmed both levels):** QR + standalone payout domain `{account, amount}`; purchase/cof charge/pre-auth complete-payout/payment-link `{acc, amt}`. CLI `payout -b` takes `account:amount` strings only (comma-split parser mangles JSON arrays).
- **Payout currency mismatch is client-side in sandbox** (`PayWayConfigError` exit 1, pre-network) — cheap to test; seeded accounts are currency-bound (500000001 = USD only).
- **Data types:** exchange-rate rates are JSON **strings** (`"4012"`), `date` empty in sandbox; tran_id `[a-zA-Z0-9-]{1,20}`; ctid `[a-zA-Z0-9]{5,24}`; acc digits 9/11/15; amounts exactly 2 decimals (0/neg/3-decimals exit 1); QR lifetime seconds (min 180, exit 1 at 179), purchase lifetime minutes (3–43200); transaction-list dates only `"YYYY-MM-DD HH:mm:ss"`, window ≤3 days, pagination ≤1000.
- **Offline verification is possible end-to-end:** `cof link-card-form`'s generated hidden fields re-hash byte-for-byte per the documented 10-field order — a full no-network signing verification (repeatable as a scripted smoke check if desired).
- **`--json` + non-TTY byte-identical behavior held** across all agent runs (no TUI artifacts); `cof token details` takes `--request-id` ONLY (rejects `-c`), `token remove` rejects `-r` — shapes are commander-enforced, not just documented.
- **Test harness is a true offline mock server** (5/5, ~2.5s, no creds) — CI-usable.
- **Windows quirk:** Node/Git-Bash can't open `/tmp` paths (resolve to `D:\tmp`) — affects `--body-file` examples; use repo-relative paths in docs.
- **Env precedence ladder (confirmed):** explicit config > `PAYWAY_BASE_URL` > URL-valued `PAYWAY_ENV` > `PAYWAY_SANDBOX`; `PAYWAY_TIMEOUT` int ms; `PAYWAY_STRICT_VALIDATION` accepts exactly `1`/`true`.
- **Sandbox round-trips left behind (PENDING, safe):** `qrmtkdlyfqf5a921`, `ckmtkdmsaw9d7da5` — usable as known IDs for read-only demos; do not close/refund them without need.

## Suggested session order

1. T1 (blocker triage, timeboxed ~45 min incl. one live re-probe + ABA question drafted)
2. T2 (9 skill one-liners + AGENTS.md account swap) — single `docs(skills)` commit, re-run skills audit greps, re-copy to `.zcode/skills/`
3. T3.1–T3.4 (script exit codes) — single `fix(skills)` commit
4. T3.5–T3.7 (CLI behavior — check behavior pins FIRST, may need pin flips + CHANGELOG)
5. T5.2/T5.3 (`skills add --target` + `skills sync`) if time remains; T4 items get drafted questions, not guesses

**Gates before any commit (HANDOFF §6):** `npm run build` → `npx vitest run` → `npx tsc --noEmit` → `npx biome lint src`. Format only what you changed (no `biome check --write` on whole files).
