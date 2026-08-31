# Handoff — feat/live-api-parity branch (live API audit → SDK/CLI enhancement)

**Written:** 2026-08-31, mid-B4. **For:** the next agent continuing this branch.
**Read first:** `AGENTS.md`, `HANDOFF.md` (§2 environment rules, §6 test conventions), this file.

## 1. Task & decisions (locked)

Audit all ABA PayWay APIs against the **live source** (developer.payway.com.kh — 24 operations over 22 unique
paths; every spec page fetched via its `.md` URL), then implement SDK+CLI parity. Approved decisions:
- **Mixed validation**: gateway-REQUIRED fields throw `PayWayConfigError`; advisory limits (length caps, enums,
  min amounts) warn once via `warnAdvisory(config, msg)` and escalate to throws under `strictValidation`
  (config flag or `PAYWAY_STRICT_VALIDATION=1`).
- **Token trio**: probe-then-un-gate — DONE, all live compositions verified (§16).
- **Full CLI gateway parity** (B6).

Audit matrix: `audit-results/live-api-coverage-2026-08-31.md`. Sandbox probe evidence:
`test-output/token-trio/probe-2026-08-31T00-28-10-661Z.log` (gitignored; findings live in §16).

## 2. Branch state

Branch `feat/live-api-parity` from `main` @ `9c8d81c`. Commits (oldest→newest):

| Commit | Batch | Contents |
|---|---|---|
| `c92b9cd` | B0 | audit matrix; payway-openapi sync (subscription op+schema, token-trio live hash orders, CoF payment full set, link-card `continue_success_url`+HTML response, payment-link payout/title notes); **fixed duplicate `$ref` in openapi.yaml** (bundle was broken); `src/types.ts` now purely generated — hand-written types moved to **`src/domain-types.ts`** (poll types + `LinkCardResponse`); 3 pre-existing lint findings fixed |
| `9895dd8` | B1 | QR parity: `GenerateQrParams` += items/firstName/lastName/email/phone/returnDeeplink/customFields/returnParams/payout; 19-field live hash order (append-compatible: omitted optionals hash `''` → byte-identical, pinned); `warnAdvisory` + `strictValidation` config added; `src/__tests__/qr-domain.test.ts` |
| `0e9435f` | B2 | CoF+subscription: linkAccount/linkCard `ctid`+`tokenFlag` (+linkAccount `currency`) REQUIRED; linkCard `continueSuccessUrl`; cofPayment += 10 optional params; purchase subscription trio (`ctid`, `tokenFlag:'CITR_FIX'`, `frequency`) with hash appended after `skip_success_page`; `src/__tests__/cof-subscription-parity.test.ts`; validation.test.ts pins flipped |
| `6cbbe6a` | B3 | **Token trio UN-GATED + all CoF hash orders realigned** (see §3); `scripts/sandbox-probe-token-trio.ts`; SANDBOX-FINDINGS §16; `TokenParams` split → `RenewTokenParams`/`GetTokenDetailsParams`/`RemoveTokenParams`; pins flipped |

Last fully green gates: at `6cbbe6a` — `npx vitest run` 1169 passed / 13 skipped, tsc clean, biome clean
(after `npm run build` — agent-cli.test.ts + cli.test.ts require fresh dist).

## 3. B3 probe results (load-bearing facts — do not re-probe)

`scripts/sandbox-probe-token-trio.ts` classification: wrong-hash codes (`1`/`01`/`PTL02`) = composition
REJECTED; any business code (105/09/00/104) = hash layer ACCEPTED. Verdicts (merchant `ec476910`):
- renew `ctid.request_time.pwt.merchant_id.request_id` ✅ (105) — legacy SDK order ❌ 01
- get-token-details `merchant_id.request_time.request_id`, body ONLY requestId (+auto fields) ✅ (09) — legacy ❌
- remove-token `merchant_id.ctid.request_time.pwt`, body ctid+pwt, NO requestId ✅ (200/00) — legacy ❌
- link-account live order (`merchant_id` first) ✅ (104) — **§9a "verified" order now ❌ 01** (gateway tightened)
- cofPayment 19-field live order, NO `request_id` ✅ (105) — legacy ❌
- linkCard NOT probed (answers HTML) — aligned on family consistency; live order incl. `amount` empty hash
  position; `returnUrl`/`returnDeeplink` deprecated, not sent.

Consequence: the SDK now sends the live orders everywhere in `src/domains/credentials-on-file.ts`
(see §16 in docs/SANDBOX-FINDINGS.md for the full table).

## 4. B4 — IN PROGRESS (uncommitted working tree)

Done in working tree (verify with `git status` / `git diff`):
- `src/utils.ts`: `validateAmountFloor(config, amount, currency, context)` — KHR≥100 / USD≥0.01 advisory.
- `src/client.ts`: `resolveConfig` reads `PAYWAY_STRICT_VALIDATION` (1/true) → `strictValidation`.
- `src/domains/checkout.ts` `buildPurchasePayload`: advisory warns — lifetime>43200, firstname (≤100,
  no digits/specials regex), lastname≤100, email≤50, phone≤20, items ≤10 entries & ≤500 encoded chars,
  paymentOption outside `PAYMENT_OPTIONS`; **throw**: `googlePayToken` required iff paymentOption=google_pay.
- `src/domains/checkout.ts` `getTransactionList`: advisory warns — date format regex `YYYY-MM-DD HH:mm:ss`,
  >3-day span, pagination>1000, status enum (case-insensitive).
- `src/domains/khqr.ts`: merchantRef empty → `PayWayConfigError` (was plain `Error` — behavior change!),
  >20 chars warns.
- Amount floors wired: `qr.ts` (generate-qr), `credentials-on-file.ts` (payment), `payout.ts` (payout),
  `payment-link.ts` (create; + title>250 warn).
- `src/domains/payment-link.ts` import double-comma fixed.

**IMMEDIATE BLOCKERS (fix first):**
1. `npx tsc --noEmit` error: `src/domains/checkout.ts:503` — `params.status` possibly `null`
   (`GetTransactionListParams.status: string | null`); change the guard to `params.status != null`.
2. biome: 2 `lint/style/useTemplate` infos at `src/domains/checkout.ts:486` (the date-format warnAdvisory
   lines use string concat) — convert to template literals or biome-ignore.

**Then finish B4:**
3. New suite `src/__tests__/validation-framework.test.ts` covering: strictValidation escalation (config +
   `vi.stubEnv('PAYWAY_STRICT_VALIDATION','1')`), warn-once dedup per message, each purchase cap, list
   window/pagination/status warns, merchantRef cap + error-class change, amount floors (USD 0.005 / KHR 50
   warn; strict throws), googlePayToken throw, khqr `PayWayConfigError` (check no old test pins plain Error).
4. Gates: `npx tsc --noEmit` && `npx biome lint src` && `npm run build` && `npx vitest run` (expect all green;
   ~1169+). Commit as `feat(validation): advisory validation framework ...`.

## 5. Remaining batches

**B5 — error handling** (`src/client.ts` `checkResponseError`/`createHttpError` ~L275-460, `src/cli/explain-code.ts`):
- COF family parse: 200/400 body `status.code "04"` + `errors{}` map → `PayWayBusinessError` carrying
  `fieldErrors` (extend the error or attach to message); `1`/`01`/`PTL02` → throw **`PayWaySignatureError`**
  (exists in `src/errors.ts`, never thrown yet — finally use it) with endpoint hash-order hint; `98` →
  merchant-profile hint; `104`/`105`/`09` → token hints (codes observed live, §16).
- QR string-code family table: 1,6,8,12,16,17,18,19,21,23,32,35,44,47,48,96,102,403,429.
- `explain` CLI: add `cof` + `qr` code families (mirror existing family structure).
- Throttle rule: `get-transactions-by-mc-ref` 10 req/60s — add to the defaults near `client.ts` ~L657-662
  (check-transaction 600/1s, transaction-detail 10/60s, transaction-list-2 50/60s, refund 500/1s exist).
- link-card: response is ALWAYS HTML (success and error) — detect and surface a structured error/hint
  instead of a JSON-parse failure.
- Tests; flip any `edge-case-audit.test.ts` pins consciously.

**B6 — CLI parity** (`src/cli.ts`, `src/cli/ui/help.ts` COMMAND_GROUPS, `src/test/index.ts` mock server):
- New `cof` group: `cof link-account`, `cof link-card`, `cof charge`, `cof token renew|details|remove`
  (respect new param shapes: details takes ONLY `--request-id`; remove takes `--ctid --token`, no requestId).
- `beneficiary add <payee>` / `beneficiary update-status <payee> --status 0|1` (SDK: `payout.addBeneficiary`
  / `updateBeneficiaryStatus`; RSA required → assertRsaKeyPresent).
- `generate-checkout`: += `--ctid --token-flag --frequency` (subscription trio), `--type pre-auth`,
  `--firstname/--lastname/--email/--phone`, `--items <json>`, `--shipping`, `--lifetime`, `--custom-fields`,
  `--return-params`, `--skip-success-page`, `--view-type`, `--continue-success-url`.
- `generate-qr`: += the 9 new params (`--first-name --last-name --email --phone --items --return-deeplink
  --custom-fields --return-params --payout`).
- `transaction-list`: local pre-validation of 3-day window + pagination ≤1000 → exit 1 with hint (gateway
  403 message contains a typo; pre-validate locally).
- Every command: `--json`, in-process `runCli` tests (HANDOFF §6: chdir to temp BEFORE dynamic import,
  never `--help` in-process, save/restore `process.exitCode`), mock handlers per endpoint mirroring
  `src/__tests__/cli-mock-commands.test.ts`.

**B7 — docs & release:**
- `CHANGELOG.md` v1.4.0 with **breaking changes** list: linkAccount/linkCard required fields; token-trio
  param split (`getTokenDetails` now `{requestId}`, `removeToken` now `{ctid,paymentToken}`); CoF hash orders
  realigned; cofPayment no longer sends `request_id` (deprecated); linkCard no longer sends
  `returnUrl`/`returnDeeplink`; trio un-gated (`allowUnverifiedTokenOperations` deprecated opt-out); khqr
  merchantRef error class; purchase throws when google_pay without token.
- `HANDOFF.md` §5 refresh: Q6/TD-03 resolved-by-evidence (§16), link the audit artifact, new next-items.
- `docs/09-link-unlink-renew-lifecycle.md` (token lifecycle resolution), `docs/12-error-handling-and-debugging.md`
  (new COF/QR families, PayWaySignatureError), README + AGENTS.md new command examples.
- Version bump → 1.4.0 via `docs/RELEASE_CHECKLIST.md`. **`npm publish` is a USER decision — never publish.**

## 6. Rules that burned us (repo + this task)

- Gates per commit: build → vitest → tsc → biome. Two suites hard-require fresh `dist/cli.js`.
- `git add` with ANY ignored path (e.g. `dist/...`) silently fails for ALL paths — add tracked paths only.
- `NODE_TLS_REJECT_UNAUTHORIZED='0'` scoped per command only. Never commit `.env`/dist/test-output/profiles.
- Pins: flip consciously, same commit, CHANGELOG note. `edge-case-audit.test.ts` = error-path spec.
- Hermetic env: suites use `vi.stubEnv`; `src/test/vitest-hermetic-env.ts` scrubs `PAYWAY_*` per file.
- Merge: check `main` hasn't moved; ff-merge; conventional commits; delete branch after.
- Windows Git Bash: CRLF warnings are noise; `python` heredocs were used for multi-file edits.
