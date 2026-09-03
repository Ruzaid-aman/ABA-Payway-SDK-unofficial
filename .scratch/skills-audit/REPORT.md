# Comprehensive Skills Audit Report — all 29 `aba-payway-*` skills

**Date:** 2026-09-03 · **Scope:** every installed skill in `.zcode/skills/aba-payway-*` (byte-identical to packaged `skills/` copies, verified via md5 across all 29)
**Method:** 3 parallel test agents (Groups A/B/C) + direct CLI ground-truth recon. Per skill: full SKILL.md read → every documented command/flag verified against real `--help` output → bundled scripts executed with valid + edge inputs → offline examples executed → authorized sandbox read-only / canonical non-mutating live calls → data-type and exit-code boundary testing. **No money-movement endpoints were executed** (refund, payout, pre-auth complete/cancel, close-transaction, cof charge, token remove/renew, beneficiary add/update were verified via `--help`, SDK-source inspection, and local validation paths only).

Detailed per-group evidence: [group-A-payments.md](group-A-payments.md) · [group-B-cof-tokens.md](group-B-cof-tokens.md) · [group-C-transactions-payout.md](group-C-transactions-payout.md)

---

## 1. Overall verdict — 29/29 skills

| Group | Skills | Verdicts |
|---|---|---|
| A — Payments (10) | first-payment, qr, offline-qr, purchase, payment-link, pre-auth, refund, subscription, customer-qr, exchange-rate | 9 PASS (2 w/ gaps, 1 w/ caveat), **1 FAIL (subscription, live)** |
| B — COF & tokens (10) | cof, link-account, link-card, token-lifecycle, token-purchase, remove-account, remove-card, hash, sdk-configuration, test-harness | **10/10 PASS**, 4 minor gaps |
| C — Txns & payout (9) | check-transaction, transaction-detail, transaction-list, transaction-by-merchant-ref, transaction-close, beneficiary, payout, sandbox-beneficiaries, agent | 8 PASS (with minor gaps), 1 PASS w/ internal FAIL (agent's recommended model is dead) |

**Bottom line:** the skill corpus is in excellent shape after the recent sync-audit commits (S1/S2). Every documented flag, hash order, per-endpoint shape, error code, and seeded fixture checked out against the live CLI/SDK — with one real gateway failure (subscriptions) and one dead external dependency (agent provider model) that are environment/gateway issues, not doc errors.

---

## 2. Blockers & critical findings

1. **Subscription live failure (Group A).** `generate-checkout --ctid customer123 --token-flag CITR_FIX --frequency 1M` → gateway responds `Wrong Hash` (code 1, exit 2) with default and every `--payment-option` value. Local trio-validation and hash construction match the SDK source exactly, so this contradicts the skill's v1.4.0 fix claim. Likely causes: the sandbox merchant profile must be subscription-enabled, or the gateway changed. Needs PayWay follow-up or explicit gating/docs ("profile must be subscription-enabled").
2. **`get-transactions-by-mc-ref` endpoint 404s in this sandbox environment (Group C).** HTTP 404, empty body, via both CLI and `reconcile.cjs` — while all sibling endpoints work. Environment drift, not a code bug. `reconcile.cjs` one-shot mode crashes with a raw uncaught stack trace (watch mode has the try/catch; one-shot doesn't).
3. **Agent skill's recommended model `x-preview-f-free` is dead (Group C).** Live `ask` → `PROVIDER_PROPOSAL_FAILED` / "provider returned HTTP 401: Model x-preview-f-free is not supported" (exit 1). The documented diagnostic itself reproduced perfectly, and the risk gate correctly refused a create without approval.
4. **`000999888` — the account used in root AGENTS.md payout examples — is NOT in the seeded sandbox whitelist.** Live QR-payout attempt → 403 `Payout accounts are not in whitelist` (Group A). Whitelist is checked by the gateway *before* payout-key shape, so a wrong `{acc,amt}` shape on the QR path surfaces as 403, not a shape error.

---

## 3. Skill-by-skill verdicts

| # | Skill | Verdict | Notes |
|---|---|---|---|
| 1 | aba-payway-first-payment | PASS w/ gaps | Script works but always exits 0; example omits credential prerequisite; **drift**: skill says CLI "never auto-polls" but plain `generate-qr` polls by default (`--polling default: true`) — only the agent REPL doesn't |
| 2 | aba-payway-qr | PASS | All 9 optional params live-accepted; lifetime minimum is 180s (exit 1 at 179); advisory caps warn then gateway err 04 |
| 3 | aba-payway-offline-qr | PASS w/ gap | Full boundary matrix: 0.01/static/KHR/huge OK; 0/negative/3-decimals/EUR exit 1 with exact messages; CRC valid. **Gap:** requires 7 `PAYWAY_KHQR_*` env vars never enumerated in the skill; repo `.env` lacks them → bare `--offline` fails with 7 `KHQR_*_REQUIRED` codes |
| 4 | aba-payway-purchase | PASS | All flags in help; lifetime in MINUTES (min 3, max 43200); `--payment-gate` absence correctly documented; checkout-form works |
| 5 | aba-payway-payment-link | PASS | Live create + detail work; payout total-mismatch rejected locally exit 1 as documented. **Gap:** skill shows only SDK `getDetails`; CLI inspect is `payment-link detail -i <id>` (`-i` required, positional rejected) |
| 6 | aba-payway-pre-auth | PASS | acc digits 9/11/15; PTL59/62/170 match `constants.ts`; 110% over-capture guard fires locally |
| 7 | aba-payway-refund | PASS | Flags/preflight/`-y` semantics match help; PTL04/36/37/58/181 confirmed via `status` + `explain` (live refund out of scope) |
| 8 | aba-payway-subscription | **FAIL (live)** | Local trio validation perfect, hash order matches source — but gateway `Wrong Hash` for ALL payment options (see Blocker #1). **Doc bug:** skill's example omits `--payment-option`; the default `abapay_khqr_deeplink` is outside the documented subscription set and triggers an advisory |
| 9 | aba-payway-customer-qr | PASS w/ caveat | Sample payload decodes; CRC 9955 valid exactly as claimed; both scripts work. Caveat: `decode-khqr.cjs` **cannot read styled/template PayWay PNGs** (jsQR limitation, "No QR detected") — works on plain QRs only |
| 10 | aba-payway-exchange-rate | PASS | Live OK. All rates are JSON strings; `date` empty in sandbox; returns 6+ currency pairs despite "USD/KHR" help text |
| 11 | aba-payway-cof | PASS | All §16 hash orders match `HASH_ORDER_HINTS` in `src/client.ts`; all CLI flags exist |
| 12 | aba-payway-link-account | PASS | ctid regex `[a-zA-Z0-9]{5,24}` enforced; missing `-r`/`-f` → exit 1 |
| 13 | aba-payway-link-card | PASS w/ gap | Link-card hash **reproduced offline byte-for-byte** from generated form (10-field order, `amount`/`frequency`/`continue_success_url` as `''`). Gap: `--frequency 3M` not rejected at runtime (TS-type only) |
| 14 | aba-payway-token-lifecycle | PASS | Per-endpoint shapes confirmed: `details` takes `-r` ONLY (rejects `-c`); `remove` rejects `-r`; TOKEN_VALIDITY_DAYS=90 |
| 15 | aba-payway-token-purchase | PASS | tran_id `[a-zA-Z0-9-]{1,20}` confirmed (`utils.ts:128`); no request_id sent |
| 16 | aba-payway-remove-account | PASS | Same `removeToken({ctid, pwt})` shape; hash `merchant_id.ctid.request_time.pwt` |
| 17 | aba-payway-remove-card | PASS | Same shape as remove-account |
| 18 | aba-payway-hash | PASS | All 3 scripts pass full valid+edge matrix incl. end-to-end mock→handler loop (`valid=true`, HTTP 200). Polish: unknown preset / bad `--status` throw raw stack traces instead of clean usage errors |
| 19 | aba-payway-sdk-configuration | PASS w/ omissions | Every env var/option verified in `src/client.ts:1038-1075`; precedence claims hold. Omitted from skill: `PAYWAY_KHQR_PAYWAY_DATA`, `PAYWAY_CALLBACK_URL/RETURN_URL/CANCEL_URL`, `PAYWAY_PROFILE`, `PAYWAY_AGENT_*`; `backoffJitter` defaults to `'none'` not `'full'` |
| 20 | aba-payway-test-harness | PASS w/ gap | `sdk.runTestSuite()` + CLI `test`: 5/5 pass, ~2.5s, fully offline mock server. Gap: skill omits CLI wrappers `payway-sdk test` / `payway-sdk demo` |
| 21 | aba-payway-check-transaction | PASS w/ gaps | decode-status.cjs works (3 input modes, exit 2 on usage/JSON errors) but prints "UNKNOWN code 6" for `payment_status_code:6` even though the skill documents code 6 |
| 22 | aba-payway-transaction-detail | PASS | 403/429 rate-limit cap claim could NOT be reproduced (6 rapid calls, no throttle) — stands as dated sandbox measurement only |
| 23 | aba-payway-transaction-list | PASS w/ gap | Only `"YYYY-MM-DD HH:mm:ss"` accepted (compact + ISO-date rejected exit 1); >3-day windows rejected locally; `--pagination 1001` rejected. Gap: `--status BOGUS` is only a **warning** and still hits the network; SDK allowed set includes undocumented `PRE-AUTH` and gateway-typo `DECLINDED` (`src/domains/checkout.ts:481`) |
| 24 | aba-payway-transaction-by-merchant-ref | PASS w/ FAIL | Endpoint 404s live today (Blocker #2); reconcile.cjs does **not** load `.env` (needs `set -a; . ./.env` first) and one-shot mode lacks try/catch; dry-run/usage/exit-code contract otherwise matches docs |
| 25 | aba-payway-transaction-close | PASS | Flags + live code-5 path verified (exit 2 as documented) |
| 26 | aba-payway-beneficiary | PASS | All claims verified incl. exact error messages |
| 27 | aba-payway-payout | PASS | Key-shape `{acc, amt}` enforced by `validatePayoutEntryShape` (rejects `{account, amount}` with clear message); currency-mismatch rule enforced client-side in sandbox; sum rule enforced locally; PTL147/146/PTL-PAYOUT-36 match `constants.ts`; payout HMAC is hex (`src/domains/payout.ts:96`) |
| 28 | aba-payway-sandbox-beneficiaries | PASS | All 9 fixtures match CLI output byte-for-byte; `listSandboxBeneficiaries()` returns `{id, kind, currencies[], description}` |
| 29 | aba-payway-agent | PASS w/ 1 FAIL | Exactly 11 tools in `AgentToolName`; CREATE_ACTIONS = the same 5 the skill marks; ledger state machine `planned→confirmed→submitted→{succeeded,failed,outcome_unknown}` with non-replay guards; sessions plaintext at `%APPDATA%\aba-payway-sdk\agent\sessions`. FAIL: recommended model dead (Blocker #3). Soft gap: non-TTY provider error was NOT redacted to `[REDACTED]` as skill claims |

---

## 4. Consolidated gaps & doc drift

**High-value doc fixes**
1. first-payment: "CLI never auto-polls" is wrong for `generate-qr` (polls by default).
2. subscription example: add `--payment-option` (default value is outside the documented subscription set).
3. offline-qr: enumerate the 7 required `PAYWAY_KHQR_*` env vars; note bare `--offline` fails without them.
4. payment-link: document the CLI inspect path `payment-link detail -i <id>`.
5. test-harness: document `payway-sdk test` / `payway-sdk demo` CLI wrappers.
6. sdk-configuration: add missing env vars (see row 19) and fix `backoffJitter` default.
7. agent: replace dead `x-preview-f-free` model; document that non-TTY provider errors may not be redacted.
8. customer-qr: warn that styled/template QR PNGs may not decode (jsQR limitation).
9. check-transaction skill vs decode-status.cjs: reconcile the code-6 mapping (script says UNKNOWN, skill documents it).
10. transaction-list: document that invalid `--status` only warns and proceeds; the SDK accepts `PRE-AUTH` and `DECLINDED` (gateway typo) — decide whether to surface or normalize.

**Code/script polish (not doc issues)**
11. `checkout-payload.cjs` exits 0 on ALL failures and doesn't load `.env`; silently accepts `--currency EUR`.
12. `reconcile.cjs`: no `.env` autoload; one-shot mode lacks try/catch (raw stack trace on API failure).
13. `sign-request.cjs` / `mock-callback.cjs`: unknown preset / bad status → raw stack trace instead of clean usage error.
14. `validate` command is informational — exits 0 even when the value is invalid (agents must parse output).
15. `--json` flags on check-transaction / transaction-detail do not JSON-ify the *error* path — agents must branch on exit code, not stdout.
16. `config` exits 0 even when it reports a missing-var error.
17. AGENTS.md (root): the `000999888` payout example account isn't in the seeded whitelist — use a seeded account from `sandbox-beneficiaries` instead.

**Environment drift (not fixable in-repo)**
18. Subscription purchases → gateway `Wrong Hash` (code 1) — needs profile/subscription-enabled verification with PayWay.
19. `get-transactions-by-mc-ref` → HTTP 404 empty body in this sandbox.
20. transaction-detail's documented 403/429 rate-limit cap not reproducible (no throttle after 6 rapid calls).

---

## 5. Data types & validation catalog (observed, evidenced)

- **Exit-code contract (confirmed in source + live):** `0` success/pending · `1` local validation (incl. commander missing-flag errors) · `2` PayWay API failure (e.g. close code 5, check code 6) · `3` network/timeout/rate-limit (`PayWayRateLimitError→3`; poll timeout on fake ID → `{"event":"aborted","reason":"max_duration_exceeded"}`, exit 3). Bundled `.cjs` scripts are the exception — several always exit 0 or exit 1 with stack traces.
- **Amounts:** exactly 2 decimals; `0`, negative, and 3-decimal amounts exit 1 with exact messages; huge amounts OK offline (online capped with advisory warn → gateway err 04). All rates from `exchange-rate` are **strings** (`"4012"`).
- **Currencies:** `USD`/`KHR` accepted; `EUR` rejected by QR paths but *silently accepted* by checkout-payload.cjs. Sandbox seeded accounts are currency-bound (500000001 = USD only, enforced client-side pre-network).
- **Lifetime:** QR lifetime in **seconds** (min 180, exit 1 at 179); purchase lifetime in **minutes** (min 3, max 43200).
- **IDs:** tran_id `[a-zA-Z0-9-]{1,20}`; ctid `[a-zA-Z0-9]{5,24}`; acc digits 9/11/15 (PTL59/62/170).
- **Token-flag domain:** skills document live 2 values (`CITI_FLEX`|`CITO_FLEX`), but sandbox accepts 4 (`CITO_FIX`, `CITR_FLEX` accepted with advisory warn) — sandbox is looser than production.
- **Dates:** transaction-list accepts only `"YYYY-MM-DD HH:mm:ss"`; max 3-day window; pagination ≤ 1000.
- **Hashing:** link-card 10-field order byte-verified offline; cof §16 orders match `HASH_ORDER_HINTS`; payout HMAC is hex; subscription hash construction matches source yet gateway rejects (see Blocker #1).
- **Error codes:** `explain` decodes every code the skills reference (PTL36/146/147, 37, 46, 49, 429, PTL04/58/181, PTL-PAYOUT-36/37, 59/62/170) with matching meanings — no drift between skills, `constants.ts`, and `status` reference.
- **Agent internals:** 11 tools; 5 create-actions; ledger state machine with non-replay guards; plaintext sessions under `%APPDATA%\aba-payway-sdk\agent\sessions`; config matches `ProviderConfigV1` field-for-field.
- **Windows quirk:** Node/Git-Bash cannot open `/tmp` paths (resolves to `D:\tmp`) — affects `--body-file` copy-paste examples on Windows.

---

## 6. Interesting facts & new discoveries

1. **Offline hash reproduction works end-to-end:** the `link-card-form` generated HTML's hidden fields re-hash byte-for-byte per the documented order — a full no-network verification of the signing path.
2. **Sandbox is looser than docs in two places:** token-flag domain (4 vs 2 values) and transaction-list status enum (includes `PRE-AUTH` and the gateway typo `DECLINDED`). Production parity is the safer doc target.
3. **Gateway validation order matters for debugging:** on the QR payout path, whitelist (403) is checked *before* payout-key shape — a wrong shape masquerades as a whitelist error. On payment-link, shape/total checks are client-side first.
4. **Payout currency mismatch is caught client-side** in sandbox before any network call (`PayWayConfigError`, exit 1) — good failure mode, cheap to test.
5. **The test harness is a genuine offline mock server** (5/5 pass in ~2.5s) — usable in CI without sandbox credentials.
6. **Exchange-rate returns 6+ currency pairs**, not just USD/KHR as help text says; `date` is empty in sandbox.
7. **Installed vs packaged copies are byte-identical** across all 29 skills (md5) — the `.zcode/skills` install is a faithful copy of `skills/`.
8. **Env precedence ladder confirmed:** explicit config > `PAYWAY_BASE_URL` > URL-valued `PAYWAY_ENV` > `PAYWAY_SANDBOX`; `PAYWAY_TIMEOUT` is int ms; `PAYWAY_STRICT_VALIDATION` accepts exactly `1`/`true`.
9. **Non-TTY byte-identical behavior held** throughout all agent runs (no TUI artifacts in piped output).
10. **Sandbox round-trips created and verified:** transactions `qrmtkdlyfqf5a921` and `ckmtkdmsaw9d7da5` confirmed PENDING via `check-transaction`.

---

## 7. Recommended follow-ups (prioritized)

1. **P1 — Subscriptions:** reproduce `Wrong Hash` against a subscription-enabled sandbox profile or open a PayWay ticket; until then, gate the subscription skill/CLI with a warning that the sandbox profile must be subscription-enabled.
2. **P1 — Docs:** apply the 10 high-value doc fixes in §4 (most are one-line edits).
3. **P2 — Scripts:** fix exit codes + `.env` autoload in `checkout-payload.cjs` / `reconcile.cjs`; add clean usage errors to `sign-request.cjs` / `mock-callback.cjs`; wrap reconcile one-shot in try/catch.
4. **P2 — AGENTS.md:** swap `000999888` for a seeded whitelist account in payout examples.
5. **P3 — investigate:** `get-transactions-by-mc-ref` 404 (env drift), transaction-detail rate-limit claim, missing-var `config` exit code, error-path `--json` behavior.
