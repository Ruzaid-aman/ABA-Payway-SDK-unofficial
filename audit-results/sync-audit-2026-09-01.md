# Sync Audit — SDK / CLI / Skills / Usage Guides / Knowledge Base

**Date:** 2026-09-01 (re-baselined 2026-09-02 after the link-card hosted-page commits — see §0) · **Auditor:** agent
**Original audited state:** `main` @ `4e88bd9`, v1.3.6, tree clean
**Current state (2026-09-02 re-review):** `main` @ `a25789b` — 3 new commits: `e8bcaf6` (feat: `getLinkCardFormHtml` + `cof link-card-form` + link-card hosted-page capture, +18 tests), `9778a39` (docs: 5 COF skills → v1.2.0, README/docs/03/PROJECT_STATUS sync, HANDOFF refresh), `a25789b` (HANDOFF working-tree row).
**Method:** four parallel read-only audits — (1) 25 packaged skills vs `src/cli.ts` + `src/domains/*` + `src/index.ts`;
(2) README + 18 docs guides vs code; (3) knowledge-base artifacts (HANDOFF, PROJECT_STATUS, SANDBOX-FINDINGS,
four-pillars, live-parity artifacts, CHANGELOG) vs code/filesystem/git; (4) api-by-api re-verification of all 24 live
operations vs `payway-openapi/paths/*.yaml` post-B1–B6. Load-bearing claims (subscription hash bug, QR code family,
flag gaps, test-file count, export availability) independently re-verified in the main session.

---

## 0. Re-review delta (2026-09-02, commits `e8bcaf6` → `a25789b`)

A parallel session shipped the link-card hosted-page feature and a docs/skills sync that **fixed 9 of the audit's
findings**. The findings below are updated; anything not listed here is unchanged. Current gate: 1236 tests /
80 files per HANDOFF (81 `.test.ts` on disk — one more than HANDOFF states, recheck at next release).

### Fixed by the new commits ✅

| Original finding | Status | Fixed in |
|---|---|---|
| Skills: `aba-payway-link-account` broken (missing required `ctid`/`tokenFlag`/`currency`) | ✅ FIXED — Quick Start now shows the correct required trio, §16 hash order, `cof link-account` CLI, `"04"` fieldErrors note | `9778a39` |
| Skills: `aba-payway-link-card` stale (`returnUrl`, `frequency` "required", `CITR_FLEX` lead example) | ✅ FIXED — both routes documented (browser form recommended + API), correct `CITI_FLEX\|CITO_FLEX`, `frequency` optional, `returnUrl` explicitly dropped, §16 hash with the empty-`amount` quirk, CLI pair, HTML-`rawBody` handling | `9778a39` |
| Skills: `aba-payway-remove-account`/`remove-card` broken (pre-§16 `requestId` shape, inverted TD-03 "BLOCKED" claim) | ✅ FIXED — `{ctid, paymentToken}` only, un-gated wording, `cof token remove` CLI, 104/105/09 hints | `9778a39` |
| Skills: `aba-payway-token-purchase` stale (`requestId` sent; charging enum unknown) | ✅ FIXED — `requestId` marked not-sent, correct `TOKEN_FLAG_CHARGING` enum (`CITU_FLEX\|MITU_FLEX\|MITU_FIX\|MITR_FLEX\|MITR_FIX` — verified against constants.ts:168), §16 19-field hash, `cof charge` CLI | `9778a39` |
| KB H1/H5: HANDOFF header stale, §5.7 "not done" README/AGENTS bullet | ✅ FIXED — header/§1 refreshed to `e8bcaf6` + 2026-09-01, §5.7 bullet flipped to done-with-note, §5.9 session section added, anti-checklist gained the two new entries (dist-freshness post-merge; skills-drift grep rule) | `9778a39` |
| KB H6 (partial): test counts | ✅ FIXED — HANDOFF now says 1236/80 | `9778a39` |
| Usage guides: README missing `cof link-card-form` / hosted-page behavior | ✅ FIXED — CLI table rows + COF snippet show both card-linking routes | `9778a39` |
| KB: PROJECT_STATUS had no post-v1.3.6 entry | ✅ PARTIALLY FIXED — a dated 2026-09-01 session banner was added, but the file's stale spine (lines 515–526: "version 1.3.0", "988 tests / 63 files", "next: ask ABA token-trio §9a") is unchanged and still contradicts package.json | `9778a39` |
| Sandbox facts: link-card form POST gateway-verified | ✅ NEW FACT pinned — hidden-fields POST → HTTP 200 hosted page; evidence `test-output/link-card-form-live-probe-2026-09-01.json` | `e8bcaf6` |

### Still open after the new commits ❌ (re-verified 2026-09-02)

| Finding | Re-verification |
|---|---|
| **D1 HIGH — subscription hash dropped by `purchase()`** | **Still present.** `e8bcaf6` only moved `escapeHtmlAttribute` out of checkout.ts; `purchase()` still passes the legacy 24-field list (checkout.ts:387–412) and `request()` still overwrites the hash (client.ts:1354). Subscriptions via `purchase()`/`generate-checkout` still send a hash omitting `token_flag.frequency`. |
| **D3 MED — `HASH_ORDER_HINTS` wrong** | **Still present, now more visible** — the hints sit right above the newly-added `getLinkCardFormHtml` code that advertises §16 parity: `purchase` hint garbled, `linkAccount` hint carries link-card's order (no `return_deeplink`), `getTransactionList` hint `req_time.merchant_id.tran_id`, `refund` hint omits `merchant_id` (client.ts:414–429). |
| **D2 MED — payment-link `payout` unimplemented** | Untouched. |
| **D4 LOW — `cof charge --payout` help text `{account,amount}` vs SDK `{acc,amt}`** | **Still present** (cli.ts:2586). Note `generate-qr --payout` (cli.ts:1565) and `pre-auth complete-payout` (cli.ts:3019) both document `{account,amount}` — verify which keys the gateway actually expects per endpoint before "fixing" the text (QR/payout `{account,amount}` vs CoF `{acc,amt}` is the documented split; align text to code, not code to text). |
| **D5/D6/D7/D8** (link-card frequency advisory; image size/content-type; missing generate-checkout flags + `cof link-account --return-deeplink`; OpenAPI spec files lag §16) | All untouched. |
| Skills S2 remainder: `aba-payway-purchase` (`lifetime: 600, // seconds`), `aba-payway-first-payment` (checkout-payload.cjs `--lifetime <sec>` + missing 26-field hash), `aba-payway-hash` (sign-request.cjs FIELD_ORDER), `aba-payway-qr`/`first-payment` (9 QR params), `aba-payway-sdk-configuration` (inverted TD-03 + missing `strictValidation`), `aba-payway-transaction-list` (pre-validation), `aba-payway-agent` (subpath imports), `aba-payway-sandbox-beneficiaries` (unexported imports) | Untouched — the sync fixed exactly the five COF skills; the other 8 stale/broken findings stand. |
| Skills S2.3: missing `cof`/`token-lifecycle`/`beneficiary`/`subscription` skills | Untouched (5 fixed skills now reference each other, e.g. link-account → link-card, but the four capability gaps remain). |
| `skills/README.md` STALE (broken `npx payway-sdk` install line, 3/25 listed, opencode loader-path gap) | Untouched. |
| Usage-guide wrong-content items: dead `/payments/checkout` endpoint (now 6 occurrences: docs/03:289,485, docs/04:167,454, docs/06:338, docs/14:434), `payway.getBaseUrl()`, `aba-payway-ts/webhook/server` import, `generate-qr --merchant-id`, Node 18 claims (docs/02, VERSIONING), `verify-credentials.ts`, QUICK-START `./skills/` links, strictValidation/fieldErrors/verifyCallbackDetailed coverage | All untouched — `9778a39`'s docs/03 change was only the 2-line cross-pointer. |
| KB H2 — HANDOFF §3 B5 QR-family pin still wrong (`…8,12…` incl. `8`, points to `src/client.ts`) | Still at HANDOFF.md:56; code's family (explain-code.ts:99) has no `8`. |
| KB H3/H4 — HANDOFF §5.4 still says token-trio "capability-gated, Q6 blocked" | Still at HANDOFF.md:99 (contradicts §5.6 line 108 "UN-GATED" in the same file). |
| KB: technical-debt-register TD-03/TD-05, §9a superseded marker, live-parity/coverage snapshot headers, PRODUCTION-VERIFICATION-PLAN Q-numbering, RELEASE_CHECKLIST exports count, CHANGELOG 1.3.0 known-open annotation | All untouched. |

### New observations from the re-review (not in the original audit)

1. **`cof link-card-form` — good new surface, correct parity.** The form's HMAC field list equals `linkCard()`'s (shared `buildLinkCardPayload` + `LINK_CARD_HMAC_FIELDS`, credentials-on-file.ts:170/292/324); wire-vs-form byte-identity pinned by test; options and exports (`LinkCardFormOptions`) verified in `src/index.ts` and `src/domains/index.ts`.
2. **The skills version pin concern was overstated in the original audit** — `skills.test.ts:23` matches any semver (`version: \d+\.\d+\.\d+`), not a hardcoded 1.1.0; the v1.2.0 bumps pass. Retracted.
3. **Test-file count drift continues** — 81 `.test.ts` files on disk vs HANDOFF's 80 (the 3 new test files from `e8bcaf6` minus the prior 80-vs-79 discrepancy resolving differently; recount at the next release gate rather than trusting either number).
4. **HANDOFF now carries a fresh example of the audit's core recommendation** (S5 surface-registry): its new anti-checklist entry says "when the SDK param shapes change, grep `skills/` + `README.md` + `docs/09` for the old shape in the SAME change" — codify this as a checklist step (docs/SYNC-SURFACES.md) so it stops depending on agent memory.
5. **S0 in the plan should fold in the D1+D3 fixes with the upcoming v1.4.0** — HANDOFF/CHANGELOG now target v1.4.0 for the Unreleased link-card feature; shipping D1 (subscription hash) + D3 (hints) in that release is natural.

---

## 1. Verdict scoreboard (post 2026-09-02 re-review)

| Layer | Verdict | One-line summary |
|---|---|---|
| **SDK vs OpenAPI (api-by-api)** | ✅ 24/24 paths, ⚠️ 2 real defects | All hash orders match the authoritative (§16-verified / live-documented) compositions **except the subscription-on-purchase network path** (D1); payment-link `payout` still unimplemented (D2). New `getLinkCardFormHtml` surface is parity-verified. |
| **CLI vs SDK** | ✅ broadly synced, ⚠️ small gaps | `cof`/`beneficiary` groups + new `cof link-card-form` landed with correct shapes; missing 5 `generate-checkout` flags, `payment-link create --payout`, `cof link-account --return-deeplink`; one wrong help text (`cof charge --payout` keys). |
| **Skills (25 guides)** | 🟡 PARTIAL (was 🔴) | The 5 COF skills were re-synced to v1.2.0 (2026-09-02) and now match the shipped contract; **8 stale/broken findings remain** (purchase seconds-vs-minutes, hash-tool FIELD_ORDER, agent subpath imports, sandbox-beneficiaries exports, etc.) plus the 4 missing capability skills. |
| **Usage guides (README + docs/)** | 🟡 PARTIAL | README/AGENTS.md current incl. link-card-form; docs/ has a **dead checkout endpoint (6 occurrences)**, nonexistent SDK methods/imports, Node-18 claims; `strictValidation`/`fieldErrors`/`verifyCallbackDetailed` documented nowhere outside README. |
| **Knowledge base** | 🟡 PARTIAL (was 🔴) | HANDOFF refreshed to `e8bcaf6` with new pins + §5.9 (but §5.4 gated-text and §3 QR-family pin still contradict code); PROJECT_STATUS got a session banner but its stale spine (v1.3.0/988-tests) remains; §9a unmarked as superseded; technical-debt-register still missed. |

---

## 2. Code defects found (fix before any docs sync — these are the SDK's own drift)

These are the only findings that change runtime behavior; everything else is documentation.

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| **D1** | **HIGH** | **Subscription hash is silently dropped by `purchase()`.** `buildPurchasePayload` correctly hashes the 26-field list (appends `token_flag`,`frequency`, checkout.ts:283–310), but `purchase()` passes its own legacy 24-field list to `request()` (checkout.ts:387–412) and `request()` **overwrites** the hash (client.ts:1354 `fullBody.hash = generateHmac(fullBody, hmacFields, …)`). Result: subscriptions via `purchase()` / `generate-checkout --ctid --token-flag --frequency` send a hash that omits `token_flag.frequency` → live-documented order violated → "Wrong Hash". Plain purchases are unaffected (empty-string elision). The existing parity test only exercises `createTransaction`, not the network path. | checkout.ts:385–412, client.ts:1354 | `purchase()` passes the same 26-field list as `buildPurchasePayload`; add a mock-server regression test asserting the **sent** hash for a subscription payload. |
| **D2** | MED | **payment-link create `payout` unimplemented.** Spec includes `payout` inside `merchant_auth` (with total-payout-must-equal-link-amount rule). Absent from SDK params (client.ts:367–380), payload (payment-link.ts:101–110), and CLI flags (cli.ts:2066–2077). Only the `image` half of matrix gap #16 was remediated. | payment-link.ts, cli.ts:2066 | Add `payout` param + `--payout` (JSON-or-string) + equality validation. |
| **D3** | MED | **`HASH_ORDER_HINTS` are wrong/stale** — injected into `PayWaySignatureError` messages, so wrong-hash debugging guidance is itself wrong: `purchase` hint is a garbled legacy order; `linkAccount` hint is actually link-card's; `getTransactionList` hint says `req_time.merchant_id.tran_id`; `refund` hint omits `merchant_id`. | client.ts:414–429 | Regenerate all hint strings from the verified orders (§3 of the 2026-08-31 matrix). |
| **D4** | LOW | `cof charge --payout` help text documents `{account, amount}` keys but the SDK/spec use `{acc, amt}` (cast at cli.ts:2485). | cli.ts:2453 | Fix help text. |
| **D5** | LOW | link-card `frequency` is spec-"Required for Link Card" but SDK-optional with no advisory. | cof.ts:193 | Advisory warn; enforce under `strictValidation`. |
| **D6** | LOW | payment-link image: no ≤3MB client-side check; CLI accepts webp/gif beyond spec's JPG/JPEG/PNG. | payment-link.ts:82–97 | Advisory + strict enforce; align content types. |
| **D7** | LOW | `generate-checkout` exposes 19/24 purchase params — no `--payout --additional-params --google-pay-token --return-deeplink` (`--payment-gate` deliberately omitted, documented in aba-payway-purchase skill); `cof link-account` lacks `--return-deeplink`. | cli.ts:1891–1918, 2361 | Additive flags. |
| **D8** | LOW | `payway-openapi` ground-truth files lag §16: `paths/credentials-on-file.yaml` still carries §9a-era `x-hmac-fields` and marks trio orders "not yet verified"; `CofPaymentRequest` still `required: request_id`; link-card schema still lists `return_url`/`return_deeplink`. Since `src/types.ts` derives from these, generated types carry stale required-ness. | payway-openapi/paths + components | Re-sync spec files to §16 verdicts. |

**Verified accurate (no action):** all CoF + token-trio hash orders and un-gating (opt-out only, `=== false`), QR 9-param parity, subscription param validation, B5 error families (`PayWaySignatureError` thrown, `fieldErrors`, link-card HTML guard), mc-ref 10/60s throttle, `transaction-list` pre-validation, `strictValidation` wiring, explain `cof`+`qr` families (QR family in code = `1,6,12,16,17,18,19,21,23,32,35,44,47,48,96,102,403,429` — note: no `8`; `8` resolves under the `gateway` family).

---

## 3. Skills audit (25 guides + README)

**Original counts (2026-09-01 state): 12 IN-SYNC · 9 STALE · 4 BROKEN.**
**Post-2026-09-02 (`9778a39`): the 5 COF skills (link-account, link-card, remove-account, remove-card, token-purchase) are FIXED → v1.2.0 and verified against the shipped contract. Remaining: 3 BROKEN-adjacent (agent imports, sandbox-beneficiaries exports — both import-resolution failures) + 7 stale findings across purchase/first-payment/hash/qr/sdk-configuration/transaction-list.** The `cof`/`beneficiary`/subscription/token-lifecycle capabilities still have no skill coverage.

### Fixed 2026-09-02 (was Broken/Stale — now correct, `9778a39`)

- ~~`aba-payway-link-account`~~ — Quick Start now requires `ctid`/`tokenFlag`/`currency`, shows the §16 hash order, `cof link-account` CLI, and the `"04"` fieldErrors shape.
- ~~`aba-payway-link-card`~~ — both routes (browser form recommended, API capture), correct `CITI_FLEX|CITO_FLEX`, `frequency` optional, `returnUrl` explicitly dropped, §16 hash with the empty-`amount` position documented, hosted-page `rawBody` handling.
- ~~`aba-payway-remove-account` / `aba-payway-remove-card`~~ — `{ctid, paymentToken}` only, trio un-gated (TD-03 note removed), `cof token remove` CLI, 104/105/09 token-state hints.
- ~~`aba-payway-token-purchase`~~ — `requestId` not sent, correct charging enum `CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX` (matches `TOKEN_FLAG_CHARGING`), §16 19-field hash, `cof charge` CLI.

### Broken (would throw / fail to resolve) — still open

| Skill | Defect |
|---|---|
| `aba-payway-sandbox-beneficiaries` | `import { listSandboxBeneficiaries, validateSandboxBeneficiary } from 'aba-payway-ts'` — **neither is exported** from src/index.ts. |
| `aba-payway-agent` (imports only) | `'aba-payway-ts/agent'` and `'aba-payway-ts/cli/explain-code.js'` subpaths don't exist in package exports (only `"."`). |

### Stale (wrong content, runs but misleads) — still open

- `aba-payway-purchase:27` — `lifetime: 600, // seconds` → purchase lifetime is **minutes**, min 3 (a copied seconds-habit yields a 10-hour checkout). Same error in `aba-payway-first-payment`'s bundled `checkout-payload.cjs:19` (`--lifetime <sec>`).
- `aba-payway-qr` / `aba-payway-first-payment` — zero mention of the 9 new `generate-qr` params or B6 `generate-checkout` flags; `first-payment`'s route matrix omits the subscription trio; its bundled `checkout-payload.cjs` FIELD_ORDER also ends at `skip_success_page` (missing `token_flag`,`frequency` hash positions).
- `aba-payway-hash` bundled `sign-request.cjs` — `checkout` FIELD_ORDER stops at `skip_success_page`; subscription payloads signed by the tool → Wrong Hash.
- `aba-payway-sdk-configuration:17` — documents `allowUnverifiedTokenOperations` as required (inverted); missing `strictValidation`/`PAYWAY_STRICT_VALIDATION`, `allowPrivateCallbackHosts`, `PAYWAY_KHQR_*`.
- `aba-payway-transaction-list` — no mention of the ≤3-day-window / pagination ≤1000 local pre-validation (exit 1 before network).

### Missing skills (capabilities with zero coverage)

1. `cof` CLI group + §16 COF parity (`link-account`/`link-card`/`charge`).
2. COF token lifecycle (`cof token renew|details|remove`, `TOKEN_VALIDITY_DAYS=90`, `computeTokenExpiry`).
3. `beneficiary` whitelist management + `PAYWAY_RSA_PUBLIC_KEY`.
4. Subscription / recurring checkout (`--ctid --token-flag CITR_FIX --frequency`).
5. Secondary: `pre-auth` CLI subcommands, `payment-link create/detail` CLI, `profiles`, `setup-webhook`, `doctor --live`.

### Packaging / installer

- `skills/README.md` **STALE**: install line `npx payway-sdk skills add claude` resolves to an **unrelated third-party npm package** (`aba-payway-ts` is unpublished); lists only 3 of 25 skills; silent on the known `~/.opencode/skills` vs `~/.config/opencode/skills` loader mismatch (skills.ts:9).
- Skills referencing repo-root `.ts` scripts (`scripts/online-qr-poll.ts` etc.) ship dangling references — `scripts/` is npmignored and not in `package.json` files. Only 5 skills bundle their own `.cjs` tools.
- `skills.test.ts` pins skill `version: 1.1.0` — blocks frontmatter bumps without a conscious test flip.

---

## 4. Usage-guide audit (README + docs/)

**Correct & current:** README (cof/beneficiary rows, COF SDK shapes incl. correct token-trio split, subscription trio, `callOptions`, rate-limit table), AGENTS.md command block (verbatim-correct), docs/09, docs/12 hierarchy, docs/VISUAL-GUIDE, docs/04/05/06 (platform-level content), exit codes, `sdk.*` helper claims.

**Wrong (would break for a copying user):**

1. **Dead checkout endpoint** — `docs/03-web-implementation.md:287,483`, `docs/04-native-app-implementation.md:167,454`, `docs/06-telegram-mini-app.md:338`, `docs/14-appendix-code-snippets.md:434` all POST to `/api/payment-gateway/v1/payments/checkout`; real endpoint is `…/payments/purchase` (ENDPOINTS.purchase, constants.ts:16).
2. `docs/03:127` — `payway.getBaseUrl()` does not exist (no public getter on PayWay).
3. `docs/16-webhook-setup-guide.md:266` — `import … from 'aba-payway-ts/webhook/server'` — subpath not in package `exports`; and `:314–318` uses `generate-qr --merchant-id` (invalid flag).
4. `docs/02:44` + `docs/VERSIONING.md:24` — Node "v18+ / >= 18.0.0" contradicts `engines: >=20.0.0` (a v1.3.6 **breaking change**).
5. `docs/13:184,236`, `docs/02:318`, `docs/12:610` — `npx tsx verify-credentials.ts` — file doesn't exist (use `doctor --live`).
6. `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md:9` — `create-checkout` → `generate-checkout`; `:59` "988 tests" (v1.3.0-era count).
7. `docs/QUICK-START-1-PAGER.md:288,326,342` — three `./skills/…` links 404 (skills live at repo root, not under docs/); CLI table omits cof/beneficiary/payout/pre-auth.
8. `docs/README.md:126` — `github.com/your-org/…` placeholder; `:131` "24 AI skills" (25); missing `strictValidation` in the Validation section.
9. `docs/10:32` — `qrImageTemplate` limited to `'template1','template2'`; 7 values exist in `QR_TEMPLATES` (and README's "all 10 templates" refers to a script whose extra 3 the validator rejects).
10. `docs/README:131` / README — stray-file and count drift (`b5-test.log`, `npm-ci.log` also at root).

**Missing v1.3.6 features where they belong:** `strictValidation`/`PAYWAY_STRICT_VALIDATION` (nowhere outside source), `fieldErrors` + `PayWaySignatureError` hash hints (README error section, docs/11), `verifyCallbackDetailed` (docs/11), QR 9 params (docs/07), subscription scenario (docs/15), `transaction-list` pre-validation note (README/docs/07), `payout`/`pre-auth`/`sandbox-beneficiaries` rows (README CLI table).

---

## 5. Knowledge-base audit (updated 2026-09-02)

| Artifact | State | Key issues |
|---|---|---|
| `HANDOFF.md` | 🟡 refreshed 2026-09-02, 2 contradictions left | Header/§1 now at `e8bcaf6` (1236/80, coverage 78.5/74.2) with new §5.9 + behavior pins + anti-checklist entries; §5.7 "not done" bullet correctly closed. **Still wrong:** §5.4 says token-trio "capability-gated, Q6 blocked" (line 99 — contradicts §5.6 line 108, code, §16, RTM addendum); §3 B5 QR-family pin includes `8` and points to `src/client.ts` (line 56 — real table: explain-code.ts:99, no `8`; CHANGELOG omits `1`); "Q6" numbering ≠ ABA-OPEN-QUESTIONS (token-trio is Q1 there). |
| `docs/PROJECT_STATUS.md` | 🟡 banner added, stale spine remains | New 2026-09-01 session banner documents the link-card work accurately. **Still stale:** lines 515–526 — "Package version 1.3.0", "988 tests / 63 files", "Next task: ask ABA v3 token-trio §9a" (resolved) — all still contradict package.json/CI/HANDOFF. |
| `docs/VERSIONING.md` | 🔴 wrong contract | Node >= 18 vs engines >= 20. |
| `docs/SANDBOX-FINDINGS.md` §9a | 🔴 unmarked superseded | Reads as current/open; §9a's hash orders now return `01 Wrong Hash` per §16b.1 — §9a's param table is factually wrong today; needs a one-line "SUPERSEDED by §16 (2026-08-31)" head-note (append-only-safe). |
| `four-pillars/technical-debt-register.md` | 🔴 missed by 4e88bd9 | TD-03 still "trio throws unless allowUnverifiedTokenOperations: true" (inverted); TD-05 subscription "deferred" (shipped). RTM main-table composition columns also carry §9a orders under a disclosure sentence that covers verdicts, not compositions. |
| `live-parity-handoff.md` / `live-api-coverage-2026-08-31.md` | 🟡 unmarked snapshots | Both frozen mid-stream (B4-in-progress; v1.3.0-era gap matrix whose ⛔ rows are all remediated). Need "superseded by v1.3.6" headers. Plan doc still says B7 → v1.4.0. |
| `PRODUCTION-VERIFICATION-PLAN.md` | 🟡 | :44 "if ABA answered Q6" — wrong number (Q1) and resolved-by-evidence; probe is already runnable. |
| `RELEASE_CHECKLIST.md` | 🟡 | "expect 54 exports" — barrel grew in v1.3.6 + `LinkCardFormOptions` in Unreleased (recount post-build). |
| `CHANGELOG.md` | ✅/🟡 | 1.3.6 section verified; Unreleased link-card entry accurate and detailed; 1.3.0 "Known open item" (awaiting ABA signature spec) needs a "resolved in 1.3.6" annotation; QR-family list at :31 should be reconciled to `explain-code.ts`. |
| `docs/aba-payway-test-case-coverage.md` + `.json` | 🟡 | July-era (121 tests, 35 biome warnings) — unmarked as historical; no generatedAt in the JSON. |
| Genuinely still open | ✅ accurate | SQLite storage coverage (better-sqlite3 absent), repo-root strays (5 listed + `b5-test.log`, `npm-ci.log`), ABA Q3–Q10 (Q1/Q2 resolved), production verification (gated on credentials), npm publish (maintainer decision), §5.8 candidates incl. TypeDoc regen for `getLinkCardFormHtml`/`LinkCardFormOptions` (now noted in HANDOFF). |

---

## 6. Sync plan

Order matters: code fixes first (they define the surface everything else documents), then spec, then docs/skills, then knowledge base. Gates per repo convention: `npm run build` → `npx vitest run` → `npx tsc --noEmit` → `npx biome lint src` before every commit; branch per batch, ff-merge after checking `main` hasn't moved.

### S0 — Code correctness (fold into the upcoming v1.4.0 alongside the Unreleased link-card feature) — DO FIRST
1. **D1 subscription hash**: `purchase()` uses the 26-field list; regression test via mock gateway asserting the sent `hash` for `tokenFlag=CITR_FIX` (the existing `cof-subscription-parity.test.ts` only covers the local builder — extend it to the network path).
2. **D3 HASH_ORDER_HINTS**: rewrite all hint strings from verified orders; unit-test each hint equals the domain's actual hash list.
3. Small fixes: D4 help text, D6 image advisory/strict check, D5 frequency advisory.
4. CHANGELOG v1.4.0 entry (link-card feature + these fixes), version bump, HANDOFF refresh in same commit.
**Done when:** full suite green + new regression test red-to-green on the pre-fix commit.

### S1 — SDK/CLI param completion (v1.4.0 feature batch)
1. D2 payment-link `payout` (SDK + `--payout` + total-equals-amount validation) — closes the last 2026-08-31 matrix gap.
2. D7 flags: `generate-checkout --payout --additional-params --google-pay-token --return-deeplink`; `cof link-account --return-deeplink`; document deliberate `--payment-gate` omission in help text.
3. D8: re-sync `payway-openapi/paths/credentials-on-file.yaml` + components to §16 (hash fields, trio required-ness, drop link-card return_url/return_deeplink, CofPayment request_id not required); regenerate `src/types.ts`; keep tests green.
**Done when:** 24-op matrix shows params COMPLETE for every row; `npx vitest run` green.

### S2 — Skills corpus refresh (largest remaining doc debt; no code gates)
1. ~~Fix 4 broken skills~~ — **the 5 COF skills were fixed by the parallel session (`9778a39`) — done, verified.** Remaining broken: sandbox-beneficiaries (export the helpers from `src/index.ts` — small code add, fold into S1 — or rewrite CLI-only) and agent (remove the two subpath imports).
2. Fix the remaining stale skills per §3: purchase/first-payment (minutes-vs-seconds + 26-field hash in bundled cjs tools), qr/first-payment (9 QR params + B6 flags), hash tool FIELD_ORDER, sdk-configuration (un-gate wording + `strictValidation`), transaction-list pre-validation. Bump frontmatter versions (the skills.test.ts pin is a generic semver regex — bumps pass freely).
3. Add new skills: `aba-payway-cof` (link/charge + hosted-page routes), `aba-payway-token-lifecycle` (trio + 90-day expiry), `aba-payway-beneficiary`, `aba-payway-subscription`. Note: the fixed link-account/link-card skills already cross-link each other — extend that pattern.
4. `skills/README.md`: list all 25 (+4 new), fix install command (repo-relative `npx tsx src/cli.ts skills add <agent>` until published), document the opencode loader-path caveat.
5. Packaging: bundle referenced scripts into skill dirs or drop the references.
**Done when:** every CLI invocation and SDK snippet in `skills/` matches `--help` and `src/index.ts` verbatim (re-run the skills audit greps).

### S3 — Usage-guide fixes
1. Wrong-content sweep (§4 items 1–5): purchase endpoint (5 occurrences across docs/03/04/06/14), `getBaseUrl()`, webhook subpath import + `--merchant-id`, Node 18→20 (docs/02, VERSIONING), `verify-credentials.ts` → `doctor --live` (docs/13/02/12).
2. Link/count sweep: QUICK-START `./skills/` links, docs/README 25 skills + your-org + strictValidation row, agentic guide command/test count, docs/10 7 templates + README "all 10" claim, `.env.example`/`payway-openapi.yaml` paths.
3. Feature coverage: strictValidation + fieldErrors + PayWaySignatureError hints + verifyCallbackDetailed (README error section, docs/11, docs/02 env list, docs/README validation); QR 9 params (docs/07); subscription scenario (docs/15); transaction-list pre-validation (README + docs/07); payout/pre-auth/sandbox-beneficiaries rows (README CLI table + QUICK-START).
**Done when:** every `npx`/SDK snippet in README+docs resolves against `--help`/index.ts; no dead links.

### S4 — Knowledge-base consolidation (same batch as S3 or its own)
1. HANDOFF: the header/§5.7/test-count refresh landed in `9778a39` — remaining: delete §5.4 gated/Q6 text (line 99), fix §3 B5 QR-family pin (line 56 → explain-code.ts list), align question numbering with ABA-OPEN-QUESTIONS (Q1).
2. SANDBOX-FINDINGS §9a: "SUPERSEDED by §16 (2026-08-31)" head-note.
3. technical-debt-register: TD-03/TD-05 dated addendum (the file 4e88bd9 missed); RTM composition columns get in-cell superseded markers.
4. live-parity-handoff + live-api-coverage: "superseded by v1.3.6" headers.
5. PROJECT_STATUS: the 2026-09-01 session banner landed — still needed: update the stale spine (lines 515–526: version 1.3.0 → 1.3.6+Unreleased, 988/63 → current gate, drop the "ask ABA token-trio" next-task); VERSIONING Node floor; PRODUCTION-VERIFICATION-PLAN Q6→Q1 + probe-runnable note; RELEASE_CHECKLIST export recount; CHANGELOG 1.3.0 known-open-item annotation + QR list reconciliation.
6. Repo-root strays: move/delete the 7 files (ask user if unsure — two contain nothing sensitive but are user-named).
**Done when:** re-running the knowledge-base audit returns zero HIGH findings.

### S5 — Keep-in-sync mechanism (do once, prevents recurrence)
1. **Surface registry**: add `docs/SYNC-SURFACES.md` listing every artifact that mirrors the CLI/SDK surface (AGENTS.md command block, README CLI table, QUICK-START, docs/07/09/12, 25+ skills, skills/README) — the release checklist gets a "run the surface registry" step so no layer is silently skipped again.
2. **Drift-check script** (optional, propose first): `scripts/check-doc-drift.ts` extracting `.command()/.option()` from cli.ts and grepping docs+skills for flags that no longer exist — cheap CI gate; start with the release checklist step, script only if drift recurs.
3. Release rule: any PR adding/changing a command, flag, param, or hash order must update the surface registry artifacts in the same PR (add to CONTRIBUTING.md).
4. Update HANDOFF §5 with this plan, replacing the stale items.

---

## 7. Residual open items (unchanged, carried forward)

SQLite webhook storage coverage (§5.1, better-sqlite3 absent); ABA questions genuinely open: Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10 (Q1 token-trio + Q2 subscription resolved by evidence 2026-08-31); production base-URL live verification; `npm publish` (maintainer decision); `skills add --target` for the opencode loader path; doctor credential-source row.
