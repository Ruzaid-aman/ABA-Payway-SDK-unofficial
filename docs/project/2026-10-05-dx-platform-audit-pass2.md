# ABA PayWay Developer Toolkit — SECOND-PASS Design Review & Implementation Specification

**Subject:** `Ruzaid-aman/ABA-Payway-SDK-unofficial` @ `316a568`
**Pass:** 2 of 2 · **Date:** 2026-10-05 · **Mode:** audit + planning only. No repository file created, modified, or deleted; no commits; no implementation code. This document lives outside the repository.
**Inputs:** the repository re-inspected from scratch; the first-pass audit (`PAYWAY-DX-AUDIT-2026-10-05.md`, 37 sections); ABA's official documentation retrieved live on 2026-10-05 (`developer.payway.com.kh`: Purchase, QR API, Ecommerce Checkout — full parameter tables, hash sections, response codes).
**Stance:** design review of the first pass before engineering begins. First-pass conclusions were re-derived from evidence, not inherited. **Nine first-pass claims are corrected below, three of them materially.**

---

# 1. Second-Pass Executive Assessment

## 1.1 Verdict on the first pass

The first pass was **directionally right and evidentially sloppy in exactly the places that matter most**. Its four P0s survive verification, but one of them (P0-03) was argued with a **wrong fact**: the first pass stated that official documentation caps QR lifetime at 30 days and that the repository's 120-day constant therefore contradicted it. The official QR API page says **"Maximum: 120 days"**. The repository's *value* is correct; only its *unit* is wrong. The finding survives; its evidence did not, and an engineering agent implementing from the first-pass text would have "fixed" a correct constant.

The same error class appears twice more:
- The first pass credited the repository's amount formatting as matching official documentation. Official docs declare `amount` as **`number`** on both Purchase and QR; the repository sends a **string**. The repo's choice is sandbox-verified and probably right, but it is a **divergence from the declared type**, not a conformance.
- The first pass labelled the 24-field Purchase hash order `OFFICIAL`, retrieved from `developer.payway.com.kh/purchase-14530820e0`. Re-fetching that page shows the hash field list is inside a **collapsed PHP sample that does not render**; the 24-field order actually came from a third-party mirror. The QR hash order *is* directly official-verified (its list renders in the field description) and the repository matches it exactly. Purchase must be reclassified.

**Root cause of the first pass's error:** it accepted a third-party mirror of the official docs as the official docs, and it read the repository's own provenance comments as evidence rather than as *claims*. The second pass corrects this by separating **what the official page literally says** from **what the repository believes** from **what a mirror says**.

## 1.2 Verdict on the repository (unchanged in substance, sharper in detail)

The repository remains a strong payment SDK with a weak governance and contract layer. Re-inspection **raised** my assessment of three things the first pass under-credited:

1. **CI is materially better than reported.** There are four jobs (`secret-scan`, `quality-gates` on a 2×3 OS/Node matrix, `sqlite-contract`, `postman-collection`). Gitleaks scans **full history** (`fetch-depth: 0`) and *is* effectively blocking (`continue-on-error: true` on the scan step followed by an explicit `if: steps.gitleaks.outcome == 'failure' → exit 1`, with all other jobs `needs: secret-scan`). A dedicated job installs `better-sqlite3@13.0.3` and runs the SQLite storage suites. The Postman workspace has a **dist-export freshness gate** (`export_json.js --check`). Three first-pass recommendations ("make gitleaks blocking", "add a SQLite CI job", "gate the committed collection export") were therefore **already solved** — wholly or partly.
2. **The error registry is family-scoped, not flat.** `explain-code.ts:66-67`: *"Keyed `family:code` (a numeric code can legitimately mean different things per family — e.g. gateway `6` vs qr `6`)"*. Code 6 exists twice with different, individually correct meanings. This is better design than the first pass assumed. The real defect is narrower and worse in practice (§4, N-02): **a bare numeric lookup always resolves to the `qr` family**, and there is no way to ask for another one.
3. **The official purchase parameter set is fully modelled.** `payment_gate`, `view_type`, `skip_success_page`, `additional_params`, `google_pay_token`, `continue_success_url` all exist in `CreateTransactionParams` (`src/client.ts:281-296`), and `payment_gate`/`view_type` are correctly **excluded** from `PURCHASE_HASH_FIELDS`. The first pass's implicit suggestion that official parameters were missing is wrong.

Re-inspection also **lowered** my assessment of one thing the first pass praised as best-in-class: the error registry's *content freshness against official documentation* (§4, N-01). Four QR codes are labelled *"Meaning not individually published — consult the generate-qr page on developer.payway.com.kh"*; that page publishes all four. And `qr:403` is titled "Forbidden" where the official page says **"Duplicated Transaction ID"** — which, if true, contradicts the repository's load-bearing doctrine that duplicate `tran_id`s are silently accepted (§4, N-03).

## 1.3 What actually changes after the second pass

| Dimension | First pass | Second pass |
|---|---|---|
| P0 count | 5 | **5** (all confirmed; P0-03's evidence corrected and its fix simplified) |
| P1 count | 13 | **13** (2 downgraded, 1 upgraded, 5 new promoted in, 3 out) |
| Machine-readable registries proposed | **9 YAML files** | **3 YAML files + generated JSON** (§29) — the first-pass proposal is rejected as metadata over-engineering |
| Top-level CLI groups proposed | ~25 | **13 nouns + 6 standalone**, with an explicit REJECTED list (§38) |
| New `go-live` gates | 30 | **18** (12 removed as unautomatable and therefore false-PASS risks) |
| Backlog items | 34 | **28** (6 merged/rejected) |
| Root-cause fix for the CI blocker | reorder CI | **`tsconfig` `paths` mapping** (3 lines) so typecheck stops depending on build order, *plus* reorder (§5) |
| Highest-value/lowest-cost item | `capabilities --json` | **`explain --operation`** and the **`tsconfig paths`** fix — both under 50 lines, both fix reproduced wrong answers |

## 1.4 The single most important second-pass conclusion

> **The repository's dominant failure mode is not missing capability. It is that authoritative knowledge is stored in the wrong place, in the wrong key, and without an expiry — so it silently rots into confident wrongness.**

Three independent instances of the same defect, all reproduced:
- `explain 16` answers **"Invalid First Name"** (QR family) to a developer whose purchase failed with **"Invalid Amount"** (gateway family) — correct data, wrong key, no selector.
- `explain 47` answers **"Meaning not individually published"** for a code the official page publishes as **"KHR Amount must be greater than 100 KHR"** — stale against an external source with no re-verification mechanism.
- `strictValidation: true` **rejects** `payment_option: 'abapay_khqr'`, a value the official Purchase page documents, because the enum was derived from a 2021-era archived spec copy — an internal artifact outranking an external authority.

Every one of the three is fixed by the *same* small mechanism: **an endpoint-scoped, provenance-tagged, expiry-checked rule and error registry, generated once, consumed by validators, `explain`, `doctor`, `request inspect`, docs, and skills.** That mechanism — not the nine-file metadata programme the first pass proposed — is the architectural core of this second pass. Everything else in the plan is either a contract (one output envelope), a boundary (CLI extraction, subpath exports), or a guard (environment safety, CI order).

---

# 2. What Changed From the First Pass

## 2.1 Recommendations REMOVED (rejected as unnecessary or already solved)

| First-pass item | Disposition | Reason |
|---|---|---|
| "Make gitleaks blocking (remove `continue-on-error`)" | **ALREADY_SOLVED** | `ci.yml:24-33`: the scan step is `continue-on-error: true` **so that** the next step can emit a better message and `exit 1`; all jobs `needs: secret-scan`. Removing `continue-on-error` would only lose the actionable error text. No change needed |
| "Add a CI job installing `better-sqlite3` so the 24 skipped tests run" | **ALREADY_SOLVED (partial)** | `ci.yml:84-99` `sqlite-contract` does exactly this. Residual, narrowed: it runs 2 of the 4 SQLite suites (`webhook-storage-sqlite`, `webhook-storage-factory`); `token-store-sqlite` and `journal-sink-sqlite` are still ungated |
| "Gate the committed Postman collection export" | **ALREADY_SOLVED** | `ci.yml:116` runs `node export_json.js --check` (dist export freshness). The first pass missed this job entirely |
| "Point `ajv` at rules validation **or make it dev-only**" | **CORRECTED — the dev-only option is withdrawn** | `ajv` is a genuine runtime dependency: `src/agent/schemas.ts:209` and `src/journal/schema.ts:69` compile schemas with it. Making it dev-only would break agent-contract and journal-event validation at runtime. Keep it; add the rules-layer consumer |
| 6 of 9 proposed YAML registries (`products`, `capabilities`, `doctor-checks`, `symptoms`, `environments`, `conflicts`) | **REJECTED as hand-authored YAML** | See §29. Four of the six describe *this repository's own code*, so code is the truth and YAML would be a second copy that drifts. Generate JSON from code instead. Only `conflicts` survives, folded into `rules.yaml` as a field |
| `payway rules list/check` command | **REJECTED** | Adds a command whose only consumers are other commands. Rules are consumed by validators, `request inspect`, `doctor`, `go-live`, and generated docs. A user-facing `rules` command is surface area without a job |
| `payway products` command | **REJECTED** (folded) | Becomes `capabilities --products --output json`. Same data, no new noun |
| `payway logs redact` / `logs share` | **REJECTED** | Redaction is a property of every output path, not a command. Sharing is `journal show --redact --out`. Two commands removed |
| `payway transaction explain` | **REJECTED** (folded) | Overlaps `diagnose --id` and `journal explain`. Three tools for one question is the exact UX overlap §28 forbids |
| `payway sandbox reset`, `payway qr deeplink` | **REJECTED** | Trivial routing / already an exported pure function (`buildAbaPayDeeplink`) |
| `payway webhook configure` | **REJECTED** | `webhook listen --write-env` covers it |
| `.maintainer/` directory inside the public repo | **REJECTED** | Invents a directory whose only purpose is to be excluded. The private line is a separate repository; the public tree simply does not contain those paths |
| `go-live` UI/branding gates (12 of 30) | **REJECTED as gates** | Cannot be automated; a checkbox a tool cannot verify becomes a false `PASS`. They stay in `docs/guides/production-readiness.md` and appear in `go-live` output only as `evidence-required` attachments, never as evaluated checks |
| "QR lifetime max should change from 120 days to 30 days" (first-pass QR-D4) | **WITHDRAWN — first-pass claim was false** | Official QR API page: "Maximum: **120 days**". The repo's value is correct. (Purchase lifetime max *is* 30 days, and the repo already has 43200 minutes = 30 days ✓.) Only the **unit** is wrong |

## 2.2 Recommendations ADDED (new findings, §4)

| ID | Addition | Why it was missed in pass 1 |
|---|---|---|
| N-01 | Official generate-qr error table contradicts 1 registry entry and supersedes 4 "not published" placeholders | Pass 1 counted registry entries (96) and praised provenance; it never diffed the registry against the official per-endpoint code table |
| N-02 | Bare `explain <numeric>` always resolves to the `qr` family; 6 codes collide with `gateway`; no family selector | Pass 1 read `explain-code.ts` only to confirm the family model existed, not to trace lookup precedence |
| N-03 | Duplicate-`tran_id` behaviour has three mutually inconsistent sources, and the repo's mutation-retry *justification* rests on the least authoritative one | Pass 1 accepted the repo's own comment ("sandbox accepts duplicate tran_ids silently") as fact |
| N-04 | Official per-payment-method lifetime-expiry fund semantics (KHQR **reverses funds**; WeChat/Alipay **no reversal**) are absent from code and docs | Pass 1 never fetched the Purchase page's `lifetime` prose |
| N-05 | SDK substitutes `currency: 'USD'` where official docs say the default comes from the **merchant profile** | Pass 1 treated `|| 'USD'` as a style issue (7 spellings), not a semantic one |
| N-06 | `items` cap: repo warns "at most 10"; official says **up to 50**, and item price/quantity are explicitly **not** used for calculation or validation | Pass 1 recorded the repo's advisory as a correct rule (QR-016) |
| N-07 | Purchase content type: official declares `multipart/form-data`; repo network path sends `application/json`; repo local form posts urlencoded | Pass 1 never compared content types |
| N-08 | No runtime validation of gateway responses despite generated types | Pass 1 noted the 300-line classifier but not the absence of any shape assertion |
| N-09 | `CHECKOUT_FORM_PLUGIN_SRC` hard-coded to the **production** host, used unconditionally for sandbox forms | Pass 1's hard-coded-endpoint scan never ran |
| N-10 | Official pre-auth restriction (ABA PAY / KHQR / Card only) not enforced | New official prose |
| N-11 | `generateHmac` uses `String(val)`: objects/arrays/booleans silently corrupt the preimage | Pass 1 read `generateHmac` for the empty-position rule only |
| N-12 | **31 of 47** `scripts/` files are referenced by nothing — including all 17 `sandbox-probe-*.ts` that produced the evidence the rules depend on | Pass 1 called them "one-off probes" without counting |
| N-13 | The SDK's exported simulator fabricates URLs on the **real sandbox hostname** | Pass 1 flagged mock-in-entrypoint, not the fabricated host |
| N-14 | Normative implementation guidance ("The SDK should handle this accordingly") inside a **generated** file (`src/types.ts:399`) | Pass 1 read `types.ts` only as a generated artifact |
| N-15 | `format` is destructive-only (`--write`); no `format:check`; scope mismatch vs `lint` | Pass 1 reported the 181 unformatted files but not that no non-destructive check exists |
| N-16 | Official QR docs self-contradict on name length (table ≤20 vs error text ≤100); repo picked per-endpoint values without recording the conflict | New |
| N-17 | `currency`, `payment_option`, `qr_image_template` are **required** per official QR docs but optional-with-defaults in the repo | Pass 1 only caught `lifetime` |

## 2.3 Recommendations SIGNIFICANTLY CHANGED

| First pass | Second pass | Reason |
|---|---|---|
| **P0-05 fix:** reorder CI to build→typecheck | **Primary fix: add `paths: {"aba-payway-ts": ["./src/index.ts"]}` to a `tsconfig.typecheck.json`**, plus reorder CI to match `CONTRIBUTING.md` | Reordering manages a coupling; `paths` removes it. Mechanism now precisely located: `tsconfig.json` `include` is `["src/**/*","src/__tests__/**/*"]`, so `docs/examples/**` and `examples/**` enter *transitively* via `src/__tests__/docs-examples.test.ts`. A 3-line change makes typecheck independent of build forever. A separate post-build `typecheck:dist` job preserves `.d.ts`-emit coverage |
| **P0-03 fix:** canonical unit = minutes, rename constants, `--lifetime-unit` | **Same direction, but the probe is now specified as the gating step and the max stays 120 days** | The first pass's 30-day claim is withdrawn; only the unit is in dispute. Probe spec: `lifetime ∈ {1,2,3,4,5,6,179,180,43200,43201,172800}` × read-back of actual expiry via `transaction detail` |
| **P1-06 `doctor`:** 38 checks in a YAML registry | **38 checks in a code registry** (`src/diagnostics/doctor/checks/*.ts`), IDs exported and *generated into* docs/JSON | Check IDs are code artifacts. A YAML registry of checks would be a second source of truth for something code already defines — the exact smell §40 forbids |
| **P1-13 / §21:** 9 YAML registries | **3 YAML (`rules`, `errors`, `env-vars`) + generated JSON for the rest** | §29 justification test applied to each |
| **P2-05 advisory promotion:** `strictValidation` promotes only `source:'official'` | **Same, plus: an advisory may never become a hard error without a `ruleId`, and `strictValidation` is redefined as "fail on official deterministic rules" — not "fail on everything the repo has an opinion about"** | The P0-02 reproduction proves the current semantics are unsafe; the fix must be a semantic redefinition, not a filter |
| **CLI tree:** ~25 groups | **13 nouns + 6 standalone** (§38) with REJECTED list | §12 review found overlap (`validate` vs `doctor` vs `go-live`; `transaction explain` vs `diagnose`; `products` vs `capabilities`) |
| **`go-live`:** 30 gates | **18 gates** (10 automated, 8 evidence-required) | Unautomatable gates produce false PASS |
| **First-pass deliverable format:** one 428 KB document | **Layered: a 2-page decision record + this specification + machine-readable backlog** | The first-pass artifact violates the context-budget principle it recommends in §28. Owned explicitly in §44 |

## 2.4 Severity changes

| ID | Pass 1 | Pass 2 | Direction | Reason |
|---|---|---|---|---|
| P0-03 (QR lifetime) | P0 | **P0** (evidence corrected) | unchanged severity, **corrected content** | Unit conflict stands; the max-value claim is withdrawn |
| P0-05 (CI) | P0 | **P1** | **DOWNGRADED** | Still true that CI cannot be green (typecheck order + Linux tunnel test), but the first pass overstated the governance void: secret scanning *is* blocking and history-scanned, SQLite and Postman *are* gated, and the matrix covers 2 OS × 3 Node. It is a broken gate, not an absent one |
| P1-06 (`doctor`) | P1 | **P1** | unchanged | Confirmed in full |
| P2-04 (QR `payment_option` not validated) | P2 | **P1** | **UPGRADED** | Official docs mark `payment_option` **required** on generate-qr with exactly 3 legal values, *and* define code 23 "Selected Payment Option is not enabled for this Merchant Profile". An unvalidated required enum on the highest-traffic endpoint, with a wrong answer from `explain` when it fails (N-02), is a developer blocker |
| P2-10 (test coverage gaps) | P2 | **P3** | **DOWNGRADED** | Two of its three components were already solved in CI; residual is 2 SQLite suites + 2 sub-projects + CJS smoke |
| P2-03 (`payway-boilerplate`) | P2 | **P2** (narrowed) | narrowed | Postman is gated; only `merchant-qr-pos` and `payment_link_api` remain ungated, plus the duplicate `Refrence-copy` tree |
| N-01/N-02 (error registry staleness + family lookup) | — | **P1** | new | A diagnostic that returns a confidently wrong answer is worse than no diagnostic |
| N-03 (duplicate-tran_id doctrine conflict) | — | **P1** | new | It is the stated justification for the mutation-retry policy |
| N-04 (lifetime fund-reversal semantics) | — | **P1** | new | Money and reconciliation consequence, official source, zero coverage |
| N-05 (currency default) | — | **P1** | new | Silently converts a profile default into an explicit USD request |

## 2.5 Architecture changes vs the first pass

1. **Knowledge layer: 9 registries → 3 authored + N generated.** (§29)
2. **Error registry key: `family:code` → `endpoint:code` with `family` retained as a grouping alias.** (§24) The family model is right but `family` is an internal grouping; developers think in *endpoints*. `explain --operation qr.create` maps to the endpoint key.
3. **CLI: 25 groups → 13 nouns.** Diagnostics consolidated from five overlapping surfaces (`doctor`, `explain`, `diagnose`, `journal explain`, `validate`) into **three with non-overlapping questions** (§28).
4. **`strictValidation` redefined** from "escalate every advisory" to "fail on official deterministic rules" (§10).
5. **Deliverable format: layered** (§31, §33) — the plan now obeys the context-budget rule it imposes on the repository.

## 2.6 New risks discovered

| Risk | Description | Mitigation |
|---|---|---|
| **R-A: fixing P0-02 by hardening the enum** | Making the purchase enum a HARD rejection would break merchants whose profiles genuinely accept legacy `abapay`/`abapay_deeplink`, and official code 23 shows option validity is **profile-dependent** | Enum membership = ADVISORY for known-legacy values, HARD only for values in *no* official or legacy set. Never reject a value official docs list |
| **R-B: changing the QR lifetime unit breaks working integrations** | Merchants who compensated for the seconds behaviour (passing `360` for 6 minutes) would silently get 360 minutes | Probe first (§22); ship `--lifetime-unit` for two minors; emit a stderr advisory on ambiguous values; **never** change the default silently |
| **R-C: `explain` re-keying breaks scripts** | `explain 6 --json` currently returns the `qr` entry; adding endpoint scoping changes the default answer | Additive: keep the current default for one minor, add `--operation`, emit a stderr note when a code is ambiguous across families, and put `ambiguous: true` + `alternatives[]` in the JSON immediately (non-breaking, high value) |
| **R-D: registry generation inverts a working pipeline** | `docs/error-codes.json` is *generated from* `src/cli/explain-code.ts`; moving the source to YAML inverts the direction | Do it in one commit with `gen:error-registry --check` in CI, and keep the TS module as a thin loader so no import sites change |
| **R-E: the first-pass plan's own size** | A 34-item backlog with 9 registries and 25 command groups is more architecture than a 1-maintainer project can absorb; partial adoption yields an inconsistent half-state | §54 defines a **single coherent first slice** that is useful standalone and creates no half-migrated surface |

## 2.7 Assumptions invalidated

| First-pass assumption | Status |
|---|---|
| "Official docs cap QR lifetime at 30 days" | **FALSE** — official says 120 days |
| "Repo amount formatting matches official docs (string)" | **FALSE** — official declares `number`; repo sends string (sandbox-verified) |
| "Purchase 24-field hash order is OFFICIAL-verified" | **UNPROVEN** — the official page's hash list is in a non-rendering code sample; the order came from a third-party mirror |
| "Gitleaks is non-blocking in effect" | **FALSE** — blocking via a follow-up `exit 1` step |
| "SQLite tests never run in CI" | **PARTLY FALSE** — 2 of 4 suites run in a dedicated job |
| "The Postman dist export has no freshness gate" | **FALSE** — `export_json.js --check` |
| "`ajv` may be dev-only" | **FALSE** — runtime use in agent + journal schema validation |
| "The error registry is a flat `code → meaning` map" | **FALSE** — it is `family:code`; the defect is lookup precedence |
| "Official purchase parameters are missing from the SDK" | **FALSE** — all present, and correctly excluded from the hash |
| "Items cap is 10" | **FALSE** — official says 50 |
| "Duplicate `tran_id`s are silently accepted" | **CONTESTED** — official QR docs define code 403 "Duplicated Transaction ID"; repo telemetry says code 4; repo sandbox says silent. Three sources, no agreement |

## 2.8 Questions requiring ABA confirmation (carried to §45)

Lifetime unit (QR) · amount wire type (string vs number) · purchase hash field order · duplicate `tran_id` behaviour and its code · QR `qr_image_template`/`currency`/`payment_option` requiredness in practice · purchase content type (multipart vs JSON vs urlencoded) · sandbox plugin host existence · refund numeric floor · `request-qr` (Soundbox) contract · subscription hash positions · Customer-Module raw-body HMAC · two invalid CoF token flags · `x-rate-limit-reset` unit.

---

# 3. First-Pass Finding Verification

Status vocabulary: `CONFIRMED` · `CONFIRMED_WITH_CHANGES` · `DOWNGRADED` · `UPGRADED` · `DUPLICATE` · `ALREADY_SOLVED` · `NOT_SUPPORTED_BY_EVIDENCE` · `REQUIRES_EXTERNAL_VERIFICATION`.

---

### P0-01 — Public tree contradicts the recorded release decision
- **Original severity:** P0 · **Second-pass status:** **CONFIRMED** · **Updated severity:** **P0**
- **Evidence (re-verified):** `docs/project/RELEASE-READINESS.md` item A, owner decision 2026-10-01: *"Publish a fresh public history from a curated tree… do not create, push, or tag the public repository until it is agreed."* Named exclusions: `docs/SANDBOX-FINDINGS.md`, `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md`, `audit-results/`, `docs/HISTORY-SECRET-TRIAGE.*`, `HANDOFF.md` internals, competitive analyses, `payway-openapi/` (*"ABA's shared spec — ask ABA"*), `docs/archive/`. Item B: *"MIT on this project does not license third-party material."* Tracked counts re-measured: `.scratch/` 156, `.zcode/` 132, `audit-results/` 49, `docs/` 385. `docs/project/HISTORY-SECRET-TRIAGE.md` still reads "Publication remains blocked."
- **Updated root cause:** unchanged — the public repo was created from the working tree, and **no gate compares the tracked file list against an allow-list**. `scripts/check-repository.mjs` validates a *deny-list* (11 entry documents + forbidden capture paths), which cannot catch "internal dossier that isn't on the deny list".
- **Updated recommendation:** unchanged in substance, **simplified in mechanism**: drop the first-pass `.maintainer/` directory idea. Add `repository-manifest.yaml` with `public:` / `generated:` / `thirdParty:` globs only, and make `check-repository.mjs` fail on any tracked path matching none of them (allow-list, not deny-list). Third-party entries require `{upstream, license, notice}`.
- **Reason for change:** the manifest is the only mechanism that makes the boundary *executable*; a directory convention is not.
- **Implementation dependency:** owner sign-off on the file list (recorded as item B "approval item"). Nothing technical.
- **Acceptance criteria:** (1) `git ls-files` yields zero paths unmatched by `public`/`generated` globs; (2) the gate is blocking in CI and fails when a new unmatched file is added (negative test); (3) every `thirdParty` path has a `NOTICE` entry; (4) `RELEASE-READINESS.md` items A/B updated with an execution date; (5) a fresh clone contains no path from the item-A exclusion list.
- **Complexity:** M (mechanical, decision-gated) · **Phase 0**

---

### P0-02 — Purchase `payment_option` enum derived from an archived spec rejects an officially documented value
- **Original severity:** P0 · **Second-pass status:** **CONFIRMED — evidence upgraded to primary official source** · **Updated severity:** **P0**
- **Evidence (re-verified against the official page, not a mirror):** `developer.payway.com.kh/purchase-14530820e0`, retrieved 2026-10-05, `payment_option` (optional, ≤20 chars): *"`cards`: For card payments. `abapay_khqr`: QR payment that can be scanned and paid using ABA PAY and other KHQR member banks. `abapay_khqr_deeplink`: … `alipay` … `wechat` … `google_pay` … If no value is provided, the payment gateway will automatically display the supported payment options based on your profile."* `abapay` and `abapay_deeplink` **do not appear**. Repository: `src/constants.ts:381-396` `PURCHASE_PAYMENT_OPTIONS = ['cards','abapay','abapay_deeplink','abapay_khqr_deeplink','google_pay']`, comment naming `docs/archive/Default module.openapi.json` as its source. Reproduced: `strictValidation:true` + `paymentOption:'abapay_khqr'` → `PayWayConfigError`. Also reproduced inside the repo's own passing suite (`sdk-facade.test.ts > sdk.runTestSuite` stderr).
- **New evidence that changes the fix:** official QR response code **`23` = "Selected Payment Option is not enabled for this Merchant Profile"** — i.e. option validity is **profile-dependent**, so no client-side enum can be authoritative about *enablement*.
- **Updated root cause:** unchanged (archived internal artifact treated as higher authority than current external documentation, with no mechanism to detect the inversion). **Additional root cause:** `warnAdvisory`'s `strictValidation` escalation has no provenance filter, so a repo opinion becomes a hard failure.
- **Updated recommendation (changed):**
  1. `PURCHASE_PAYMENT_OPTIONS` ← the 6 official values. `PURCHASE_PAYMENT_OPTIONS_LEGACY` ← `['abapay','abapay_deeplink']`, advisory-only, message *"accepted by older merchant profiles; not in current official documentation"*.
  2. Enforcement level: **never HARD-reject a value official docs list.** HARD-reject only values in neither set (typo protection). Profile enablement is the gateway's job (code 23) — map it, don't pre-empt it.
  3. `strictValidation` promotes only advisories whose `ruleId` has `source: official` **and** `deterministic: true` (§10).
  4. Subscription path (`checkout.ts:359-364`, currently `['cards','abapay','abapay_deeplink']`) → official ∪ legacy, with the subscription-specific restriction recorded as `UNVERIFIED`.
  5. Registry entry `PUR-003` in `rules.yaml` + `evidence/PUR-003.md` (quote, URL, retrieval date).
- **Reason for change:** the first pass said "HARD membership check". Given code 23, a HARD check would reject valid-but-not-enabled-for-this-profile values and produce a *worse* error than the gateway's. Advisory-plus-correct-enum is the simplest correct solution.
- **Implementation dependency:** `rules.yaml` (WP-02) for the provenance tag; can ship standalone in Phase 0 with the one rule hand-authored.
- **Acceptance criteria:** (1) `abapay_khqr`, `alipay`, `wechat`, `cards`, `abapay_khqr_deeplink`, `google_pay` all accepted in normal **and** strict mode; (2) `abapay`/`abapay_deeplink` accepted with an advisory naming them legacy; (3) an unknown value (`paypal`) rejected with a rule id and the official list; (4) `sdk.runTestSuite` emits no purchase-enum advisory; (5) `PAYWAY_STRICT_VALIDATION=1` + QUICKSTART §6 snippet exits 0; (6) gateway code 23 maps to a `PayWayAPIError` whose `explain()` names profile enablement.
- **Complexity:** S–M · **Phase 0**

---

### P0-03 — QR `lifetime`: repository encodes seconds, official documentation specifies minutes
- **Original severity:** P0 · **Second-pass status:** **CONFIRMED_WITH_CHANGES — one first-pass sub-claim is NOT_SUPPORTED_BY_EVIDENCE** · **Updated severity:** **P0**
- **Evidence (re-verified):** `developer.payway.com.kh/qr-api-14530840e0`, retrieved 2026-10-05: `lifetime` — `integer`, **required**, *"Transaction lifetime in minutes. Default: 30 days. Minimum: 3 mins. **Maximum: 120 days**"*. The official example request uses `"lifetime": 6`. Repository: `src/constants.ts:316-325` `QR_LIFETIME_MIN_SECONDS = 180` (comment: *"The API takes whole minutes and rejects anything below 3 with an opaque HTTP 400 code '04' (sandbox-pinned boundary 2026-08-30: 179s → 400 '04', 180s → OK)"*), `QR_LIFETIME_MAX_SECONDS = 120*24*60*60` (comment: *"documented maximum: 120 days (OpenAPI spec)"*), `lifetime?: number` optional, `validateQrLifetimeSeconds` message *"must be at least 180 seconds (3 minutes)"*, CLI `--lifetime` documented as seconds, `llms.txt` *"`--lifetime` is SECONDS on generate-qr but MINUTES on generate-checkout"*. Purchase side: official *"lifetime … in minutes … Min: 3 mins, Max: 30 days"* and repo `PURCHASE_LIFETIME_MIN_MINUTES = 3` / max 43200 advisory — **consistent** ✓.
- **NOT_SUPPORTED_BY_EVIDENCE:** the first-pass claim that official docs cap QR lifetime at **30 days** and that the repo's 120-day constant is therefore wrong. Official says 120 days. **First-pass finding QR-D4 is withdrawn.** (The 30-day figure came from a third-party mirror of the docs; the mirror also states `amount` as a formatted string — see N-18. **Mirrors are not authority.**)
- **The genuine defect, restated precisely:** the repository's own comment says the API takes **minutes** while its constant name, validator name, error message, CLI flag, and `llms.txt` all say **seconds** — a self-contradiction inside one file. The 179→400 / 180→OK boundary is consistent with seconds and inconsistent with a 3-minute minimum, so the sandbox observation and the official statement cannot both be true.
- **Updated root cause:** a single dated sandbox observation was allowed to override official documentation with no recorded reconciliation, and the disagreement was then encoded in *names* rather than in data — so nothing can detect it.
- **Updated recommendation (simplified):**
  1. **Probe before changing anything.** `scripts/probes/qr-lifetime.probe.ts`: `lifetime ∈ {1,2,3,4,5,6,179,180,43200,43201,172800}`; for each, record HTTP status, `status.code`, and — critically — the **read-back expiry** via `transaction detail` / `check-transaction` at T+4 min and T+2 h. The read-back, not the acceptance, decides the unit. Record to `knowledge/rules/evidence/QR-013.md`.
  2. Until the probe resolves it: `conflicts` entry inside `rules.yaml` (not a separate file), surfaced by `request inspect` and blocking `go-live --strict`.
  3. `--lifetime-unit seconds|minutes` on `qr create`; **no silent default change** in a patch release; default flips to `minutes` at 2.0.0 with a stderr advisory for ambiguous values (`3 ≤ n ≤ 43200` is ambiguous; `n > 43200` is not).
  4. After resolution: unit lives in data (`QR_LIFETIME = {min, max, unit, ruleId}`), never in an identifier. Delete `validateQrLifetimeSeconds` in favour of `validateLifetime(value, {unit,min,max,ruleId})`.
  5. `lifetime` requiredness: official says **required**; repo defaults it. Decide from the probe (does omission return 21/48, or apply the 30-day default?) and either require it or document the default as `REPOSITORY_ASSUMPTION`.
- **Reason for change:** the first pass prescribed the answer (minutes, max 30 days). The second pass prescribes the **experiment** and defers the answer, because the first pass's answer was partly wrong and the sandbox evidence genuinely conflicts.
- **Implementation dependency:** sandbox credentials; `rules.yaml`; `request inspect` for surfacing.
- **Acceptance criteria:** (1) probe results committed as evidence with request/response pairs; (2) exactly one unit is canonical across code, CLI, `--help`, `llms.txt`, docs, and skills — asserted by a test that greps for lifetime-unit claims and compares them to `rules.yaml`; (3) no identifier or message states a unit that contradicts the registry; (4) while unresolved, `request inspect qr.create` includes the conflict record and `go-live --strict` reports a BLOCKER; (5) max bound equals the probe-confirmed value (official says 120 days).
- **Complexity:** M · **Phase 0** (probe + conflict record), **Phase 2** (canonical rename)

---

### P0-04 — Agent instructions teach TLS-verification bypass
- **Original severity:** P0 · **Second-pass status:** **CONFIRMED** · **Updated severity:** **P0**
- **Evidence (re-verified):** 19 occurrences of `NODE_TLS_REJECT_UNAUTHORIZED='0'` in `AGENTS.md` prefixing copy-pasteable commands; `grep -rn NODE_EXTRA_CA_CERTS` over the repository → **0 hits**; `PayWayConfig` (`src/client.ts:105-230`) has no `tlsCaFile`/`agent`/`dispatcher`/`ca` field, so **no supported alternative exists** — the bypass is currently the only workaround for corporate TLS interception.
- **Updated root cause (sharpened):** this is not carelessness. A real environment problem had **no product-level solution**, so the unsafe workaround became canonical instruction. Fixing the instructions without adding `tlsCaFile` would leave developers with nothing.
- **Updated recommendation:** unchanged, with ordering made explicit: **(a) add the safe path first** (`tlsCaFile` + `PAYWAY_TLS_CA_FILE` via an `undici` `Agent({connect:{ca}})`, `tlsMinVersion` default TLS 1.2), **(b) then remove the unsafe instruction**, (c) `doctor NET-003` reports the precise TLS failure with the `NODE_EXTRA_CA_CERTS` fix, (d) `doctor NET-004` treats an active bypass as a **blocker**, (e) a test forbids the string outside an allow-list, (f) guardrails MUST #9 / MUST NOT #1.
- **Reason for change:** sequencing. Removing the instruction before the alternative exists would break working setups.
- **Implementation dependency:** none (Node ≥22 has `undici` built in).
- **Acceptance criteria:** (1) with a self-signed corporate root in `NODE_EXTRA_CA_CERTS` **or** `PAYWAY_TLS_CA_FILE`, `doctor --live` and a real `exchange-rate` call succeed; (2) with `NODE_TLS_REJECT_UNAUTHORIZED=0` set, `doctor` reports NET-004 blocker and exits non-zero; (3) `grep -rn NODE_TLS_REJECT_UNAUTHORIZED` matches only allow-listed paths (the `doctor` check and its test); (4) `tlsCaFile` unit-tested against a local TLS server; (5) the guardrail string appears identically in `AGENTS.md`, `llms.txt`, skills, and MCP instructions (identity test).
- **Complexity:** S–M · **Phase 0**

---

### P0-05 — CI cannot pass as written
- **Original severity:** P0 · **Second-pass status:** **CONFIRMED_WITH_CHANGES + DOWNGRADED** · **Updated severity:** **P1**
- **Evidence (re-verified):** `.github/workflows/ci.yml:50-59` — `Install dependencies` → **`Typecheck` (`npm run typecheck`)** → `Lint` → **`Build` (`npm run build`)**, with a comment on the Build step reading *"dist must exist before the suite: the child-process suites (cli.test.ts, agent-cli.test.ts, webhook-cli.test.ts) spawn dist/cli.js"* — i.e. the author knew `dist` was a prerequisite and placed the guard one step too late. `CONTRIBUTING.md:8-12` documents `npm ci` → `npm run build` → `npm run typecheck` → `npm run lint` → `npm test`, with the rationale *"Build before testing"*. Reproduced: pre-build `npm run typecheck` → **exit 2**, 6× `TS2307 Cannot find module 'aba-payway-ts'`; post-build `npx tsc --noEmit` → **exit 0**. Reproduced: `npx vitest run` on Linux → **1 failed / 2353 passed / 24 skipped**, `spawn …/fake-cloudflared.cmd EACCES` in `src/__tests__/sdk-facade-and-tunnel.test.ts`.
- **Mechanism, precisely located (new):** `tsconfig.json` `include` is `["src/**/*","src/__tests__/**/*"]`. `docs/examples/backend/*.ts` and `examples/**` are **not** in `include`; they enter the program *transitively* because `src/__tests__/docs-examples.test.ts` imports them, and they import the package **by name**, which resolves through `package.json#exports` → `dist/index.d.ts` → absent before build.
- **What the first pass got wrong (corrections):** gitleaks **is** blocking (`ci.yml:24-33`: `continue-on-error: true` on the scan so the next step can print *"rotate the exposed credential at the provider portal, purge it from history, then re-run"* and `exit 1`; `quality-gates`, `sqlite-contract`, `postman-collection` all `needs: secret-scan`), and it scans **history** (`fetch-depth: 0`). A `sqlite-contract` job installs `better-sqlite3@13.0.3` and runs the SQLite storage suites. A `postman-collection` job runs `test:yaml` **and** `export_json.js --check` (dist-export freshness). `quality-gates` also runs `check:package`, `docs:api`, `check:public-docs`, `check:repository`, `smoke:package`, `examples/first-payment` setup+typecheck, `smoke:example`, and coverage-with-floors on a 2 OS × 3 Node matrix.
- **Updated root cause:** the workflow was authored against a local loop where `dist/` already existed. **Deeper root cause:** typecheck's correctness depends on build order at all — a coupling that should not exist.
- **Updated recommendation (simpler and stronger than pass 1):**
  1. Add `tsconfig.typecheck.json` extending the base with `"paths": {"aba-payway-ts": ["./src/index.ts"]}` and `"baseUrl": "."`; point `npm run typecheck` at it. Typecheck becomes **build-order independent** — the coupling is removed, not managed.
  2. Keep a post-build `typecheck:dist` CI step (`tsc --noEmit` against the real `exports` resolution) so `.d.ts` emit regressions are still caught. This preserves the coverage the `paths` mapping would otherwise hide.
  3. Reorder `quality-gates` to `Install → Build → Typecheck → Lint → Format-check → …` so CI matches `CONTRIBUTING.md`.
  4. Gate the tunnel test by platform **and add a POSIX variant** (`#!/bin/sh` + `chmod 0o755`) so the behaviour is covered on both OSes rather than skipped on one.
  5. Add `format:check` (N-15) and a CJS smoke step (P2-13).
  6. Extend `sqlite-contract` to all four SQLite suites; add a job for `integrations/boilerplate/*` sub-projects.
- **Reason for downgrade:** the first pass framed this as "no gate has ever run / the quality-gate story is aspirational". Re-inspection shows a substantial, well-designed pipeline that is **red for two specific, small reasons**. That is a P1 defect with a 3-line primary fix, not a P0 governance void. The P0-severity consequence (unverified release claims) is retained inside P0-01's governance finding.
- **Implementation dependency:** none.
- **Acceptance criteria:** (1) on a clean clone, `npm ci && npm run typecheck` exits 0 **without** a prior build; (2) `npm ci && npm run build && npm run typecheck && npm test && npm run lint && npm run format:check` exits 0 on Linux **and** Windows; (3) `vitest run` reports 0 failures on Linux; (4) CI is green on `main` for both matrix OSes; (5) a deliberately planted type error, unformatted file, failing test, and secret each fail the corresponding gate (negative tests); (6) `RELEASE-READINESS.md`'s "Hosted CI … never run on a remote" line is replaced with a recorded green run SHA.
- **Complexity:** S (items 1, 3, 4) · **Phase 0**

---

### P1-01 — No production safety gate in the CLI
- **Status:** **CONFIRMED** · **Severity:** **P1** (unchanged)
- **Evidence (re-verified):** `grep -n production src/cli.ts` → 3 hits, none a gate. `-y/--force` on 9 mutating commands skips confirmation unconditionally. `src/agent/risk.ts` implements `RiskLevel = safe|sandbox|production|blocked`, `classifyRisk` (read-only ⇒ safe; create ⇒ sandbox/production by `context.environment`; unknown ⇒ blocked) and `authorizePlan` whose doc-comment states *"`--yolo` authorizes only sandbox … and is NOT sufficient for production"*. `src/config/profiles.ts` stores sandbox and production credentials plaintext in one `0600` file with a per-profile `environment` field **that nothing cross-checks against the resolved endpoint**.
- **Updated root cause (sharpened):** the guard was designed for the *untrusted-model-output* threat and never generalised to the *trusted-human-wrong-context* threat, which is more frequent. The correct model already exists and is 140 lines long — this is a wiring defect, not a design gap.
- **Updated recommendation:** unchanged (shared `src/core/env-guard.ts`; `--confirm-production` with exit 6; `-y` never substitutes; `env current/use`; `doctor CRED-003` coherence blocker; sandbox-only commands refuse production). **Addition from second pass:** the guard must also cover `checkout-form` and `request inspect`, which today can silently render/normalise a **production** request (`CHECKOUT_FORM_PLUGIN_SRC` is already production-hosted — N-09).
- **Acceptance criteria:** (1) parametrised test over every `moneyMoving` command × {sandbox, production} × {`-y`, `--confirm-production`, neither} asserting exit 0/6 and **zero HTTP calls** on refusal; (2) `src/agent/risk.ts` and the CLI both import `core/env-guard` (boundary test); (3) a sandbox profile + production endpoint combination is refused before any I/O; (4) `env current --output json` returns `{environment, endpoint, credentialSource, profile, guard}`; (5) `capabilities --output json` reports `moneyMoving` per command.
- **Complexity:** M · **Phase 1**

---

### P1-02 — Six machine-output contracts where one is documented
- **Status:** **CONFIRMED** · **Severity:** **P1**
- **Evidence (re-verified by execution):** `--output <format>` registered at exactly two sites (`src/cli.ts:2484` generate-qr, `:3175` generate-checkout) while `argvRequestsMachineOutput` (`:5509-5520`) and `llms.txt`/`docs/reference` treat it as global. Reproduced: `check-transaction --output json` → `unknown option '--output'`; `config --json`, `validate --json`, `profiles list --json` → `unknown option '--json'`. Six success shapes captured (versioned envelope / `{ok,…}` / bare object / bare array / raw gateway passthrough / error envelope). `PaymentCommandName` has exactly two members.
- **Updated root cause:** the versioned envelope was built for the two highest-value payment commands and never generalised; `--output` was registered per-command instead of on the program.
- **Updated recommendation:** unchanged in direction, **re-sequenced and re-scoped**: the envelope (`src/cli/output/*`) and the `runCommand` wrapper land **before** the CLI extraction (P1-03), because the extraction is the vehicle that applies them to 86 commands at once. Two-stage rollout: stage 1 = envelope + global `--output` + all *state-read* commands (`config`, `env`, `capabilities`, `profiles`, `doctor`, `explain`, `status`, `validate`); stage 2 = everything else. `schemaVersion: "2.0"` with `PAYWAY_CLI_OUTPUT_SCHEMA=1.0` fallback for one minor series.
- **Acceptance criteria:** (1) the §26.3 registry sweep passes for every non-exempt command; (2) exactly one stdout document per invocation, `schemaVersion` present, no ANSI, no stderr leakage; (3) `context.environment`/`endpoint`/`credentialSource` present on every document; (4) error documents carry `code`/`category`/`severity`/`retry`/`exitCode`; (5) the four error families collapse to one (asserted by a test that enumerates every `catch` in `cli/commands/**`); (6) `--output` accepted by every non-exempt command; (7) exempt commands (`completions`, which emits a shell script) are declared in `capabilities` rather than silently divergent.
- **Complexity:** L (mechanical once `runCommand` exists) · **Phase 1 (stage 1) → Phase 2 (stage 2)**

---

### P1-03 — `src/cli.ts` monolith holding domain policy
- **Status:** **CONFIRMED** · **Severity:** **P1**
- **Evidence (re-measured):** `wc -l src/cli.ts` → **5,636**; `.command(` sites → **57**; `src/cli/commands/` → **17 files** (agent, agent-helpers, completions, demo, docs, doctor, init, journal, mcp, onboard, onboard-clack-io, onboard-helpers, session, setup-webhook, setup-webhook-helpers, skills, webhook) — so the delegation pattern is proven across 8 command groups and 4 helper modules. `biome.json` disables `noExplicitAny`/`noNonNullAssertion` for this file. Policy located in the CLI: poll backoff (`:588-780`), `TX_BATCH_PACE_MS` (`:1652`), payout-total invariant (`:3557-3593`), token 90-day expiry policy (`:4500-4520`), gateway-day derivation (`:1952` — duplicating `utils.ts#gatewayDayWindow`).
- **Updated root cause:** unchanged. **Second-pass refinement:** the *consequence* that matters most is not file size but that **two money invariants exist only in the CLI** (payout total, over-capture ceiling), so SDK consumers — the actual production path — get neither. That is a correctness gap, and it is the reason this stays P1 rather than becoming a maintainability P2.
- **Updated recommendation:** unchanged, with the work order fixed by evidence: helpers first (their own M2 list of ~126 statements), then the 5 policy relocations, then command groups in dependency order, one PR each, golden outputs captured **before** each move. Delete the `biome.json` overrides only when the file is gone.
- **Acceptance criteria:** (1) `src/cli.ts` does not exist; (2) no file under `src/cli/**` exceeds 400 lines; (3) `biome lint src` exits 0 with the `cli.ts` overrides removed; (4) `grep -c console.log src/cli.ts` is unrunnable (file gone) and `cli/**` routes all output through `output/render`; (5) the 5 relocated policies have unit tests at their new homes and are callable from the SDK without the CLI; (6) the 7 currency spellings are 1 (`core/money#parseCurrency`); (7) golden human-mode output byte-identical and JSON structurally identical pre/post each move; (8) an `architecture-boundaries` test forbids `cli/**` importing `agent/**` internals.
- **Complexity:** L · **Phase 1–2**

---

### P1-04 — Incomplete environment-variable registry causes false "unrecognized variable" warnings
- **Status:** **CONFIRMED** · **Severity:** **P1**
- **Evidence (re-reproduced):** `PAYWAY_UI=classic PAYWAY_STRICT_VALIDATION=1 PAYWAY_KHQR_MERCHANT_NAME=X PAYWAY_MCP_ALLOW_MUTATIONS=1 payway-sdk config` → `⚠ Unrecognized PayWay environment variable(s): PAYWAY_MCP_ALLOW_MUTATIONS, PAYWAY_STRICT_VALIDATION, PAYWAY_UI, PAYWAY_KHQR_MERCHANT_NAME. Check for typos or removed configuration keys.` Readers located: `src/khqr-config.ts:42-48,98` (7 `PAYWAY_KHQR_*`), `src/client.ts:1370` (`PAYWAY_STRICT_VALIDATION`), `src/cli/ui/mode.ts:44` (`PAYWAY_UI`), `src/cli/update-check.ts:112` (`PAYWAY_NO_UPDATE_CHECK`), `src/mcp/server.ts:87` (`PAYWAY_MCP_ALLOW_MUTATIONS`), `src/agent/repl.ts:101` (`PAYWAY_AGENT_NO_RECOVER_HINT`).
- **Updated root cause:** the allow-list is hand-maintained in a different file from the readers, with no generated link.
- **Updated recommendation:** unchanged — `env-vars.yaml` → generated `src/config/env-registry.ts` → consumed by `envValidator`, `.env.example`, `configure` completion, `doctor ENV-003`, and generated configuration docs. **Second-pass addition:** the conformance test must be an **AST/regex scan of `src/**` for `process.env.PAYWAY_` and `env.PAYWAY_` reads**, excluding `src/__tests__/**`, and must fail on any reader absent from the registry. That is the only mechanism that prevents recurrence; a review convention will not.
- **Acceptance criteria:** (1) the reproduction above emits **zero** warnings; (2) `PAYWAY_KHQ_MERCHANT_NAME` (typo) emits exactly one warning naming the nearest valid variable; (3) the scan test fails when a new `process.env.PAYWAY_*` read is added without a registry entry (negative test); (4) every registry entry has ≥1 reader or is declared `appliesTo: [external]`; (5) `.env.example` contains every non-secret variable with a comment and its default.
- **Complexity:** S–M · **Phase 1**

---

### P1-05 — No root `.env.example`; template covers 6 of ~32 variables
- **Status:** **CONFIRMED** · **Severity:** **P1** (merged with P1-04 for delivery)
- **Evidence:** `ENV_TEMPLATE` at `src/cli/commands/init.ts:11-20` covers `PAYWAY_ENV`, `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_CALLBACK_URL`, `PAYWAY_RETURN_URL`, `PAYWAY_CANCEL_URL`. Absent: `PAYWAY_RSA_PUBLIC_KEY` (required for payment-link, refund, pre-auth, payout, beneficiary — and `doctor` has a dedicated PEM-truncation check for it), `PAYWAY_STRICT_VALIDATION`, `PAYWAY_LOG_LEVEL`, `PAYWAY_DATA_DIR`, `PAYWAY_JOURNAL*`, `PAYWAY_PROFILE`, `PAYWAY_PARTNER_*`, all 7 `PAYWAY_KHQR_*`, `PAYWAY_TIMEOUT`, `PAYWAY_BASE_URL`, `PAYWAY_UI`. No root `.env.example`. `src/cli/dotenv.ts` supports multi-line quoted PEMs; the template never shows the syntax.
- **Updated recommendation:** unchanged; **delivered as one work package with P1-04** because both are consumers of the same generated registry. `init` writes two distinct artifacts: `.env` (minimal, quickstart-shaped) and `.env.example` (complete, grouped, commented). They are different jobs and must not be the same string constant.
- **Acceptance criteria:** (1) root `.env.example` exists and is generated; (2) a test asserts every non-secret registry entry appears in it with a comment; (3) the RSA block shows both single-line and quoted multi-line forms and `dotenv` parses both; (4) `init` writes both artifacts and never writes a secret value into `.env.example`.
- **Complexity:** S · **Phase 1**

---

### P1-06 — `doctor` has no severity model, unstable IDs, and checks almost nothing external
- **Status:** **CONFIRMED** · **Severity:** **P1**
- **Evidence:** `DoctorCheck = {id,label,ok,detail,fix?}`; blocking-vs-cosmetic decided by id exclusion at two call sites (`src/cli.ts:1225-1227`, `:1287-1289`); ids mix slug and raw-env-var styles (`env-file`, `framework`, `env-PAYWAY_ENV`, `env-apikey-length`, `env-value`, `journal`, `env-rsa-pem`); `--live` performs one call and **swallows the error** (`catch { live = {status:'fail'} }`, `src/cli.ts:1204-1206`); no DNS/TCP/TLS/reachability/port/build/version/coherence checks; `--json` has no `schemaVersion` and no per-check timing.
- **Updated recommendation:** unchanged in scope (38 checks, §17), **changed in mechanism**: the check registry lives in **code** (`src/diagnostics/doctor/checks/*.ts`, each exporting `{id, category, routes, severity, run(ctx)}`), not YAML. IDs are exported and *generated into* docs and JSON. Rationale in §29: check IDs are code artifacts; a YAML registry would be a second source of truth for something code already defines.
- **Acceptance criteria:** (1) ≥30 checks across 9 categories with registry-driven severity; (2) both id-blacklist expressions deleted; (3) IDs additive-only, enforced by a golden test; (4) `--live` failures report `paywayCode`, `httpStatus`, `correlationId`, and an `explain` next-step — no swallowed errors (asserted by injecting a failing probe); (5) `--check`, `--category`, `--severity-min`, `--fix` implemented; (6) exit 0/1/3/5 per §17; (7) `doctor` performs **no** mutating call under any flag combination (asserted against a mock transport that fails on any `MUTATION_ENDPOINTS` path).
- **Complexity:** M–L · **Phase 1**

---

### P1-07 — No `go-live check`
- **Status:** **CONFIRMED_WITH_CHANGES** · **Severity:** **P2** (downgraded)
- **Evidence:** `docs/guides/13-deployment-checklist.md` (298 lines) and `docs/guides/integration-onboarding.md` (G0–G7) are prose; no command exists.
- **Reason for change:** the *capability* is genuinely missing, but its absence is not a developer **blocker** in the way P1-02/P1-04/P1-06 are — a merchant can go live using the prose checklist today, and 12 of the first pass's 30 proposed gates cannot be automated at all (UI/branding/Integration-Team review), so shipping them as gates creates false-PASS risk. Downgraded to P2 and **rescoped to 18 gates** (10 automated, 8 evidence-required); the unautomatable items stay in docs and appear only as attachment slots.
- **Updated recommendation:** `payway go-live check` reusing the `doctor` runner (§17.4), gate list in §36 of this document, statuses `PASS|WARNING|BLOCKER|NOT_APPLICABLE|UNVERIFIED`, exit 0/5, `--attach <gate>=<path>`, `go-live diff`.
- **Acceptance criteria:** (1) 18 gates, each declaring `automated|evidence-required`; (2) no gate can report `PASS` without a cited evidence item (test); (3) `UNVERIFIED` never counted as `PASS`; (4) an open money-path conflict in `rules.yaml` yields `BLOCKER`; (5) exit 5 when any BLOCKER exists; (6) `go-live diff` reports gate transitions between two dated reports.
- **Complexity:** M · **Phase 2**

---

### P1-08 — No request inspection / dry-run
- **Status:** **CONFIRMED** · **Severity:** **P1**
- **Evidence (re-verified):** `--dry-run` exists only on `tx-batch` (`src/cli.ts:1736`). Payload builders are already **pure** and separable — `buildPurchasePayload` (`checkout.ts:~370`) returns `{...payload, hash}` and the shared field-order constants (`PURCHASE_HASH_FIELDS`, `GENERATE_QR_HASH_FIELDS`, `REQUEST_QR_HASH_FIELDS`) are exported. `generateHmac` (`src/auth.ts`) computes the concatenation internally and discards it. The Postman collection logs `b4hash:`; the SDK/CLI cannot.
- **Second-pass refinement (why this is cheaper than pass 1 implied):** because the builders are already pure, `request inspect` is mostly **plumbing plus one new function** — `auth.inspectHmac(payload, fields, apiKey) → {preimage, preimageSha256, hash}` — and a `normalization[]` record emitted by the builders. No domain refactor is required. This raises its value/complexity ratio substantially (§43).
- **Updated recommendation:** unchanged in shape (§15 of pass 1 = §18 here), with `--no-sign` (zero-config mode) and the six redaction rules retained verbatim.
- **Acceptance criteria:** (1) for every operation in `capabilities`, `request inspect --output json` returns endpoint, method, contentType, transportPolicy, headers, authModel, body, `normalization[]` (each with `ruleId` + `source`), signature field order + provenance, and any open conflict; (2) a **diff test** proves inspection output equals the body actually sent through a mock transport for every operation; (3) `--show-preimage` prints a key-free preimage, is stdout-only, is never journaled, and passes the canary sweep; (4) `--no-sign` works with zero configuration; (5) exit 1 on local validation failure with `validation.errors` populated; (6) exit 6 when the resolved environment is production without `--confirm-production`.
- **Complexity:** M · **Phase 2**

---

### P1-09 — Formatter configured, never applied, never gated
- **Status:** **CONFIRMED + EXTENDED (N-15)** · **Severity:** **P1**
- **Evidence (re-verified):** `npx biome format src` → exit 1, **181 files**. `package.json`: `format = biome format src --write`; **`format:fix` does not exist**; `lint = biome lint src skills`. No format step in `ci.yml`.
- **New precision:** the only format script is **destructive by default** and there is **no non-destructive check variant**, so a contributor cannot verify formatting without rewriting 181 files. Scope is also inconsistent (`lint` covers `src skills`; `format` covers `src`).
- **Updated recommendation:** (1) add `format:check = biome format <scope>` (no `--write`) and `format:fix = biome format <scope> --write`; (2) uniform scope `src scripts skills examples integrations`; (3) one isolated reformat commit + `.git-blame-ignore-revs` + documented `git config blame.ignoreRevsFile`; (4) CI: `format --changed` on PRs, full on `main`, both blocking.
- **Acceptance criteria:** (1) `npm run format:check` exits 0; (2) a deliberately misformatted file fails it in CI; (3) `git blame` on a reformatted line still shows the original author; (4) `lint` and `format` scopes are identical; (5) the reformat is a single commit containing no functional change (`git diff --stat` reviewed).
- **Complexity:** S · **Phase 0 (commit) / Phase 1 (gate)**

---

### P1-10 — Repository / package / support / CI identity mismatch
- **Status:** **CONFIRMED** · **Severity:** **P1**
- **Evidence:** `package.json` `repository`/`bugs`/`homepage` → `github.com/antigravity-google/aba-payway-ts`; actual remote → `github.com/Ruzaid-aman/ABA-Payway-SDK-unofficial`; CI badge in `docs/reference/SDK-AND-CLI-REFERENCE.md` → the antigravity org; `SECURITY.md` → `security@antigravity.dev`, whose *"exists, owned, monitored"* precondition `RELEASE-READINESS.md` item D records as **unmet**; version `1.5.0` unpublished while item E recommends `2.0.0` and says *"do not reuse `1.5.0`"*; `git tag` → empty.
- **Updated recommendation:** unchanged, with one addition: a `check-identity.mjs` gate asserting that every owner/repo URL in `package.json`, README badges, `SECURITY.md`, `SUPPORT.md`, and `docs/reference/**` resolves to the same target — so the four-way split cannot recur.
- **Acceptance criteria:** (1) one owner/repo across all metadata and badges; (2) `check-identity` blocking and green; (3) the security channel verified by a sent-and-received test report, or replaced with GitHub private vulnerability reporting; (4) a version chosen per `docs/project/VERSIONING.md` with `package.json` + lockfile bumped together and the 123 KB `Unreleased` folded into a dated section; (5) a stranger has a working install path — published package **or** an explicit build-from-source README with no `npm install` instruction; (6) `RELEASE-READINESS.md` items C–F closed with dates.
- **Complexity:** S (mechanical, decision-gated) · **Phase 0**

---

### P1-11 — Webhook tooling split across two command trees; listener has no machine-readable stream
- **Status:** **CONFIRMED** · **Severity:** **P2** (downgraded)
- **Evidence:** `setup-webhook` is a top-level verb (`src/cli/commands/setup-webhook.ts`, 78+ lines, `deps.log ?? console.log`); everything else is `webhook <sub>` (`src/cli/commands/webhook.ts`). No `--output ndjson`; an agent must poll `webhook list --json`.
- **Reason for downgrade:** the *capability* is complete and high quality (capture, verify, trigger, resend, forward, tunnel, JSON+SQLite stores, `webhook status/stop`). The defect is naming plus one missing flag. That is P2 polish with a clear fix, not a P1 blocker — and the first pass's own Scenario C assessment called this the repository's strongest journey, which is inconsistent with P1.
- **Updated recommendation:** `webhook listen` as canonical with `setup-webhook` a hidden alias (stderr deprecation); `--print-url` (one stdout line); `--output ndjson`; `--expect/--duration/--fail-on` as a CI gate; `webhook fixtures`; `webhook verify --against <url>`. Drop the separate `webhook configure` (first-pass addition, now rejected — `--write-env` covers it).
- **Acceptance criteria:** (1) `webhook listen --tunnel --print-url` emits exactly one stdout line and nothing else; (2) `--output ndjson --expect payment.approved --duration 60 --fail-on unverified` exits 0 on a verified arrival, 4 on an unverified one, 5 on timeout; (3) duplicate deliveries report `duplicate.isDuplicate: true` keyed on `(transactionId, status)`; (4) `setup-webhook` still works with a stderr deprecation and is listed in `capabilities.aliases`; (5) the T1/P2-09 platform defect is fixed in the same package.
- **Complexity:** M · **Phase 2**

---

### P1-12 — QR command surface conflates four capabilities
- **Status:** **CONFIRMED** · **Severity:** **P1** (retained; strengthened by N-17)
- **Evidence:** `generate-qr [--offline]` covers the online API and local EMVCo generation, sharing flags meaningless in one mode; `request-qr` is a separate top-level command marked *"spec-derived, NOT live-verified"*; Customer-Module KHQR is a webhook route plus docs with no command. `src/domains/qr.ts` exposes three methods (`generateQr`, `requestQr`, `generateOfflineQR`) — the domain already separates them; only the CLI conflates them. **New:** official docs mark `currency`, `payment_option`, `qr_image_template`, and `lifetime` as **required** on generate-qr; the repo defaults all four (N-17), so the CLI's optional-flag surface hides four required wire fields.
- **Updated recommendation:** `qr create | offline | customer | soundbox | inspect | templates` (6 subcommands — the first pass's `qr deeplink` is rejected as trivial routing). Each with only its own flags; `verified` in every output; `--lifetime-unit` per P0-03.
- **Acceptance criteria:** (1) four capabilities are four subcommands with disjoint flag sets (asserted by a registry test); (2) `qr inspect` round-trips a generated offline payload (CRC valid) and rejects a corrupted one; (3) `qr soundbox` requires `--allow-unverified` when `environment === 'production'`; (4) `verified ∈ {official, sandbox, spec}` present in every QR command's JSON; (5) `generate-qr`/`request-qr` aliases work with stderr deprecations; (6) QR-D1…D3, D5, D6 fixed (D4 withdrawn).
- **Complexity:** M · **Phase 2**

---

### P1-13 — Rule provenance is prose, so official behaviour can be silently contradicted
- **Status:** **CONFIRMED_WITH_CHANGES** · **Severity:** **P1** (retained; scope reduced)
- **Evidence:** P0-02, P0-03, N-01, N-04, N-05, N-06, N-10 are **seven** independent instances of the same defect reaching shipping code or docs — up from two in the first pass. Provenance discipline in comments is excellent; enforcement is absent. `docs/aba-payway-coverage-report.json` remains orphaned (no generator, no test, pre-reorg paths, `summary.covered_by_code: 0` contradicting 6 cases classified `COVERED_BY_CODE_AND_DOCUMENTATION`).
- **Updated recommendation (materially reduced):** **three** hand-authored YAML registries (`rules.yaml`, `errors.yaml`, `env-vars.yaml`) + generated JSON for everything else (§29). The first pass's nine-file programme is rejected: six of the nine describe this repository's own code, so code is the truth and YAML would be a copy that drifts. **The justification test applied:** author YAML only where the truth is *external* (PayWay's documentation) or *policy* (env vars, error meanings); generate JSON where the truth is *code* (commands, checks, products).
- **Acceptance criteria:** (1) `rules.yaml`, `errors.yaml`, `env-vars.yaml` exist, each with ≥3 real consumers (§29 table); (2) every rule with `source: official` has `evidence/<id>.md` containing a URL, retrieval date, and verbatim quote; (3) a conformance test fails when such an evidence file is missing **or older than 180 days**, and the rule auto-degrades to `unverified`; (4) every rule names at least one of `{sdk, cli, test}` enforcement points, verified by test; (5) `conflicts` entries (a field in `rules.yaml`, not a file) surface in `request inspect`, `doctor`, and `go-live`; (6) the orphaned coverage report is generated by a script or deleted; (7) all seven instances above are represented as rules with evidence.
- **Complexity:** L (authoring) / M (tooling) · **Phase 1** for money-path rules, **Phase 3** for full coverage

---

### P2 findings — verification summary

| ID | Status | Note |
|---|---|---|
| P2-01 docs shipped 3× in the tarball | **CONFIRMED** | Re-measured: 1,307,933 B packed / 5,198,011 B unpacked / 210 files; `skills/aba-payway-integration` 718 KB + `docs-packaged` 654 KB + `knowledge` ≈400 KB |
| P2-02 `docs/api` 239 committed HTML, no freshness gate | **CONFIRMED (narrowed)** | CI runs `docs:api` then `check:public-docs`, which scans **content** (forbidden filenames/paths), never diffs the regenerated output. Contrast: the Postman job *does* have `export_json.js --check` — the pattern exists and simply was not applied here |
| P2-03 `payway-boilerplate` hygiene | **CONFIRMED (narrowed)** | Postman is CI-gated (structure, scripts, import shape, KHQR sim, export freshness). Residual: `merchant-qr-pos` (2 test files, cited as `test_evidence` in the orphaned coverage report, never executed) and `payment_link_api` (Next.js 16, committed lockfile, `rsa.public`, `better-sqlite3 ^12.6.2` vs CI's `13.0.3`); plus `Refrence-copy-…` (313 KB duplicate), `Goal.txt.txt`, `learnings/`, spaces in directory names |
| P2-04 QR `payment_option` not validated | **UPGRADED → P1** | Official docs mark it **required** with exactly 3 values; code 23 exists for profile enablement; and when it fails, `explain` gives a QR-family answer for a non-QR context (N-02) |
| P2-05 advisory system (process-global, `console.warn`, strict escalation) | **CONFIRMED** | `src/utils.ts:34-46` re-read verbatim; also `warnedShortTranId`, `warnedOversizedQrLifetime` module flags. Second pass adds the semantic redefinition of `strictValidation` (§10) |
| P2-06 `PayWayWebhookError` typed `config_error`; `type` overridden by cast | **CONFIRMED** | `src/errors.ts:195-201` re-read: `super(message, 'config_error')` |
| P2-07 currency case-sensitivity + 7 spellings | **CONFIRMED + UPGRADED evidence** | `validateCurrency` rejects `usd`; official QR page says currency is *"Not case-sensitive"*. **New:** the semantic problem is bigger than casing — see N-05 (profile default vs hard-coded USD) |
| P2-08 money invariants only in the CLI | **CONFIRMED** | payout total at `cli.ts:3557-3593`; over-capture ceiling `--max-over-capture-pct` is a CLI flag with no domain equivalent |
| P2-09 tunnel test platform defect | **CONFIRMED** | Reproduced: `EACCES` on `fake-cloudflared.cmd`; no `process.platform` gate |
| P2-10 test coverage gaps | **DOWNGRADED → P3** | SQLite job and Postman job already exist; residual = 2 SQLite suites, 2 sub-projects, CJS smoke, unused Stryker config |
| P2-11 no subpath exports; mock infra in the root entrypoint | **CONFIRMED** | Strengthened by N-13 (the simulator fabricates real-sandbox-hostname URLs) |
| P2-12 runtime dependency weight | **CONFIRMED (corrected)** | `ajv` is genuinely used at runtime (`agent/schemas.ts`, `journal/schema.ts`) — the first pass's "make it dev-only" option is withdrawn. The rest stands: MCP SDK, commander, clack, qrcode, yaml are CLI-only concerns in every library install |
| P2-13 CJS `import.meta` build warning | **CONFIRMED** | Reproduced in `npm run build` output at `src/mcp/server.ts:56`; no CJS smoke test |
| P2-14 secret hygiene (ignore globs, two ignore files, transcripts) | **CONFIRMED** | `*key*.txt`/`*secret*.txt`; `.zcodeignore` near-duplicate; `.scratch/telegram-aba-questionnaire/answers/raw/batch-*.json` published |
| P2-15 skill taxonomy per-endpoint | **CONFIRMED** | 35 skills, ~21 single-endpoint; `skills-lock.json` tracks 2. **Second-pass change:** 14 → **11** skills (§32) after applying the §32 removal tests |
| P2-16 four competing agent entrypoints | **CONFIRMED** | `AGENTS.md` 213 lines, `.agents/AGENTS.md` 126, `HANDOFF.md` 336 lines/107 KB, `docs/agents/*` 2, plus `llms.txt` and `skills/README.md` |
| P2-17 no on-disk fixture corpus | **CONFIRMED** | `src/webhook/fixtures.ts` is code-only (6 events); `mockJsonResponse` hand-rolled per file. Only **2** test files use the mock HTTP server (`mcp-server.test.ts`, `server-and-contract.test.ts`) — so the first pass's implicit worry about "tests that test mocks" is **not** a systemic problem here; that negative-space check came back clean |
| P2-18 no `diagnose` | **CONFIRMED** | `explain` is single-code; `journal explain` is local-RCA. Second pass narrows `diagnose` to avoid overlap (§28) |
| P2-19 docs IA (5 naming conventions, hand-written reference) | **CONFIRMED** | `docs/reference/SDK-AND-CLI-REFERENCE.md` 46 KB hand-written against ~86 commands |
| P2-20 no release engineering | **CONFIRMED** | `git tag` empty; only `ci.yml`; 123 KB rolling `Unreleased` |
| P3-01…P3-12 | **CONFIRMED**, except **P3-06 refined** | The `tsconfig` fix is now the *primary* P0-05 remedy (§5), so P3-06 is promoted into P1 territory and merged with it. P3-05 (`examples/first-payment` self-dependency `"payway-first-payment-example": "file:"`) re-verified present |

---

# 4. Newly Discovered Findings

All are new to the second pass. Severity assigned per the priority definitions in §46 (P0 correctness/security/transaction risk · P1 developer blocker or architecture foundation · P2 automation/DX · P3 polish).

---

### N-01 — The error registry is stale against the official generate-qr error table, and one entry contradicts it
- **Severity:** **P1** · **Area:** Knowledge correctness / Diagnostics
- **Location:** `src/cli/explain-code.ts:264-360` (QR family, `QR_HINTS`), generated `docs/error-codes.json`
- **Current state:** four QR codes carry the hint *"Meaning not individually published — consult the generate-qr page on developer.payway.com.kh."* — codes **18, 23, 47, 48**. One entry (`qr:403`, title "Forbidden", hint "Merchant credential not authorized for generate-qr in this environment") contradicts the official page.
- **Evidence (OFFICIAL, `developer.payway.com.kh/qr-api-14530840e0`, retrieved 2026-10-05, response `status.code` enumeration):** `0` Success · `1` Wrong Hash · `6` **Requested Domain is not in whitelist** · `8` Something went wrong (contact digital support) · `12` Payment currency is not allowed · `16` **Invalid First Name** · `17` **Invalid Last Name** · `18` **Invalid Phone Number** · `19` Invalid Email · `21` End of API lifetime · `23` **Selected Payment Option is not enabled for this Merchant Profile** · `32` Service is not enable · `35` Payout Info is invalid · `44` Purchase amount has reached transaction limit · `47` **KHR Amount must be greater than 100 KHR** · `48` Something went wrong with requested parameters · `96` Invalid merchant data · `102` The URL is not in the whitelist · `403` **Duplicated Transaction ID** · `429` maximum attempt limit.
- **Problem:** the registry tells developers that four codes are undocumented when the official page documents all four, and gives a *wrong* meaning for the code that official docs associate with the single most common QR mistake (duplicate `tran_id`). The hint text even directs the developer to the page that contains the answer.
- **Developer impact:** a merchant whose QR fails with `47` is told "meaning not published" instead of "your KHR amount is under the 100 KHR minimum"; a merchant who hits `403` is told their credentials are unauthorized and will rotate keys or open a support ticket instead of minting a fresh `tran_id`.
- **Root cause:** the registry was compiled from sandbox findings, production telemetry, and the archived spec; the official per-endpoint response-code tables were never systematically harvested, and nothing re-checks them.
- **Target state:** `errors.yaml` keyed **`endpoint:code`** (with `family` retained as a grouping alias), each entry carrying `{title, hint, source, evidence, officialUrl, retrievedAt, sandboxVerified, observedOn?, observedMessage?, retryable, category}`; the 20 official generate-qr codes present with `source: official` and evidence files; generated `docs/error-codes.json` and `explain` render from it.
- **Specification:** (1) harvest the response-code tables from all 13 official endpoint pages into `evidence/errors-<endpoint>.md` with quotes and retrieval dates; (2) reconcile against existing entries — where sandbox/telemetry and official disagree, keep **both** with explicit `source` tags and a `conflict` note rather than choosing silently; (3) invert the generation direction (`errors.yaml` → TS loader → `docs/error-codes.json`) with `gen:error-registry --check` in CI; (4) delete the "not individually published" hint string once the four codes are populated, and forbid it by test for any code with an official evidence file.
- **Dependencies:** WP-02 (`errors.yaml`); the evidence harvest requires only the public docs.
- **Risks:** re-keying changes `explain` defaults → see N-02's additive migration; official tables may themselves be incomplete → keep sandbox/telemetry entries as `source: sandbox|telemetry` alongside, never deleted.
- **Validation:** `explain 47 --operation qr.create --output json` returns the KHR-minimum title with `source: official`; a conformance test asserts every code in every harvested official table exists in `errors.yaml` with matching semantics; a test asserts no entry retains "not individually published" when an official evidence file exists.
- **Acceptance criteria:** (1) all 20 official generate-qr codes present with official titles and evidence; (2) `qr:403` no longer titled "Forbidden" — it names duplicate transaction id, with the sandbox/telemetry alternatives retained as flagged variants; (3) zero "not individually published" hints for codes that official docs publish; (4) generation direction inverted and `--check` blocking in CI; (5) official code tables harvested for all 13 endpoints.
- **Complexity:** M · **Phase 1**

---

### N-02 — Bare `explain <numeric>` always resolves to the QR family; six codes collide and there is no selector
- **Severity:** **P1** · **Area:** Diagnostics / CLI
- **Location:** `src/cli/explain-code.ts:317-360` (resolution order), `src/cli.ts` `explain` command (`[code]` argument + `--json` only)
- **Current state:** the resolver tries, in order: refund → pre-auth → payout → credential → payment-link → cof → cda → **qr** → gateway. Bare numeric codes therefore land in the **qr** family unless a string-prefixed family claims them first. There is no `--family`, `--endpoint`, or `--operation` flag.
- **Evidence (reproduced):** `explain 6 --json` → `family: qr`, `title: "Requested Domain is not in whitelist"`. `explain 16 --json` → `family: qr`, `title: "Invalid First Name"`. `explain 403 --json` → `family: qr`, `"Forbidden"`. `explain 47 --json` → `family: qr`, `"QR gateway error code 47"`. Computed collision set — numeric codes present in **both** `qr` and `gateway` families with **different** titles: **1, 6, 16, 17, 23, 96** (6 collisions). For those codes the `gateway` meanings are respectively *Wrong Hash*, *tran_id not found*, ***Invalid Amount***, ***Invalid Currency***, *Transaction Not Found*, *Payee / Merchant Data*.
- **Problem:** the data model is correct (family-scoped) but the **lookup surface cannot express the scope**, so the disambiguation the registry was built for is unreachable. A developer debugging a purchase, check-transaction, refund, or payout who runs the documented `payway-sdk explain 16` receives a QR-specific answer about first names.
- **Developer impact:** wrong diagnosis on the most-used diagnostic command, for 6 codes, silently and confidently. `explain` requires no credentials and is the first thing both humans and agents reach for.
- **Root cause:** resolution order was chosen for string-prefixed codes (PTL*, etc.) and the numeric fallthrough was never given a scope parameter.
- **Target state:** `explain <code> [--operation <op>] [--family <f>]`; `--operation` maps to an endpoint key via `capabilities`; when a bare numeric code is ambiguous, the JSON carries `ambiguous: true` and `alternatives: [{endpoint, title, hint}]`, and human mode prints all alternatives with their endpoint labels instead of picking one.
- **Specification:** (1) add `--operation`/`--family` (mutually exclusive, `--operation` wins); (2) **immediately and non-breakingly** add `ambiguous` + `alternatives[]` to the JSON for the 6 colliding codes and print alternatives in human mode; (3) after `errors.yaml` re-keys to `endpoint:code` (N-01), `--operation` becomes the primary path and the qr-first default is retained for one minor with a stderr note; (4) `explain` with no argument lists codes **grouped by endpoint**, not by family.
- **Dependencies:** N-01 for the endpoint key; `capabilities` for the operation→endpoint map (can be hard-coded initially — 13 endpoints).
- **Risks:** changing the default answer breaks scripts that parsed the qr-first behaviour → mitigated by keeping the default for one minor and making the *additive* `ambiguous`/`alternatives` fields available now.
- **Validation:** `explain 16 --operation checkout.purchase` → "Invalid Amount"; `explain 16 --operation qr.create` → "Invalid First Name"; `explain 16 --output json` (bare) → `ambiguous: true` with 2 alternatives; a golden test pins all 6 collisions × both scopes.
- **Acceptance criteria:** (1) `--operation` and `--family` implemented; (2) all 6 collisions return the correct entry per scope (golden test); (3) bare ambiguous lookups expose `ambiguous`/`alternatives` in JSON and print alternatives in human mode; (4) no-argument listing is grouped by endpoint; (5) the qr-first default emits a stderr note for one minor series, then is removed.
- **Complexity:** S · **Phase 0** (the additive `ambiguous`/`alternatives` half) → **Phase 1** (scoped lookup)

---

### N-03 — Duplicate-`tran_id` behaviour rests on three mutually inconsistent sources, and it is the stated justification for the mutation-retry policy
- **Severity:** **P1** · **Area:** Transaction safety / Rules provenance
- **Location:** `src/constants.ts:46-68` (`MUTATION_ENDPOINTS` rationale), `src/client.ts:119` (*"transaction IDs are not gateway idempotency — duplicate…"*), `:310`, `:1565`; `src/cli.ts:229-242` (`journalSawCreateFor` duplicate warning, `--allow-duplicate-id`); `src/cli/journal-cli.ts:95`
- **Current state:** the repository's doctrine is that the sandbox **silently accepts** duplicate `tran_id`s and yields unpayable QRs (recorded as W5-7), and this is the explicit justification for single-attempt mutation transport and for the CLI's local duplicate warning.
- **Evidence — three sources, no agreement:**
  1. **OFFICIAL** (`qr-api-14530840e0` response codes): `403` = **"Duplicated Transaction ID"** — i.e. the gateway *does* reject duplicates, with a specific code.
  2. **Repository production telemetry** (`GATEWAY_CODE_HINTS['4']`): *"Duplicated Transaction ID — tran_id already exists for this merchant … (production telemetry 2026-09: purchase, generate-qr, payout). … On the payment-credential purchase leg the duplicate code is instead 83."*
  3. **Repository sandbox finding** (W5-7, cited in `client.ts:119` and `constants.ts`): duplicates silently accepted.
- **Problem:** the *policy* (never blind-retry a mutation; query status first) is correct and must be preserved regardless. But its **stated justification** — "duplicates are silently accepted, so a retry could create a second unpayable transaction" — is contradicted by both the official docs and the repository's own production telemetry. If duplicates are in fact rejected with 403/4/83, then a retry after a lost response is *safe from duplication* (though still unsafe from an unknown-outcome standpoint), and the CLI's duplicate warning is calibrated to a belief that may be false in production.
- **Developer impact:** an integrator reading the rationale concludes the gateway offers no duplicate protection and may therefore under-invest in their own idempotency; conversely an agent that sees code 403 will be told "Forbidden / credential not authorized" (N-01) and rotate keys instead of minting a new `tran_id`. Both are expensive wrong turns.
- **Root cause:** a sandbox observation was promoted to a universal rule and then used as load-bearing justification for a transport policy, with no re-verification against official docs or production telemetry — and the three sources were never reconciled because they live in three different files.
- **Target state:** one `rules.yaml` entry `TX-008` with `variants: [{source: official, statement: "generate-qr rejects duplicates with status.code 403", evidence}, {source: telemetry, statement: "purchase/generate-qr/payout report code 4; payment-credential purchase leg reports 83", observedOn}, {source: sandbox, statement: "2026-08 duplicate tran_ids accepted, QR unpayable (W5-7)", observedOn}]`, an explicit `status: conflicting`, and a `requiredConfirmation`. The **policy stays** and its justification is restated on the ground that actually holds: *a lost response means an unknown outcome, and the gateway provides no documented idempotency key for purchase/QR* — which is true under all three variants.
- **Specification:** (1) probe: submit the same `tran_id` twice on generate-qr and purchase in sandbox, record HTTP status + `status.code` + whether the second QR is payable; (2) record all three sources as variants with an explicit conflict; (3) restate the mutation-retry rationale in terms of unknown outcome + absent idempotency key, not silent acceptance; (4) map codes 403 (qr), 4 (gateway), 83 (payment-credential) to a single `DUPLICATE_TRANSACTION` diagnostic with per-endpoint text; (5) keep `journalSawCreateFor`'s warning but re-word it to "this tran_id was already used locally; the gateway may reject it (403/4/83) or accept it and produce an unpayable QR — behaviour is environment-dependent".
- **Dependencies:** probe (sandbox credentials); `errors.yaml` (N-01); `rules.yaml`.
- **Risks:** none from documenting the conflict; the policy does not change. Risk of *not* doing it: an agent or human acts on a wrong duplicate-handling model with money.
- **Validation:** probe results committed as evidence; a test asserts the mutation-retry rationale text contains no claim about silent acceptance; `explain 403 --operation qr.create` returns the duplicate meaning.
- **Acceptance criteria:** (1) `TX-008` records all three variants with sources and a `conflicting` status; (2) probe evidence committed; (3) the retry-policy rationale in `constants.ts`/`client.ts` is restated on unknown-outcome grounds; (4) codes 403/4/83 map to one diagnostic; (5) the CLI duplicate warning text matches the recorded uncertainty; (6) `go-live check` reports the conflict as `UNVERIFIED` (not BLOCKER, since the policy is safe under all variants).
- **Complexity:** S–M · **Phase 1**

---

### N-04 — Official per-payment-method lifetime-expiry fund semantics are absent from code and docs
- **Severity:** **P1** · **Area:** Transaction model / Money safety / Documentation
- **Location:** absent. Nearest existing content: `docs/guides/07-qr-code-handling.md`, `docs/guides/13-deployment-checklist.md`, `src/payment-lifecycle.ts`, `examples/first-payment` "Late Payment Demo"
- **Evidence (OFFICIAL, `purchase-14530820e0`, `lifetime` field, retrieved 2026-10-05):** *"The payment's lifetime in minutes, once it exceeds customer will not allow to make payment. Default value is 30 days. Min: 3 mins. Max: 30 days. **For ABA PAY or Card: Transaction will not go throught. KHQR: In case payment happen after exceed life time, PayWay will also reject. Fund will be reverse back to payer. WeChat & Alipay: No reversal.**"*
- **Problem:** the consequences of a late payment differ **by payment method** and one of them moves money: a KHQR payment attempted after lifetime expiry is rejected by PayWay **and the funds are reversed back to the payer**, whereas WeChat/Alipay have **no reversal**. The repository models expiry as a single local concept (`locallyTerminal`, "no remote EXPIRED status", PENDING ~24 h) and teaches a "Late Payment Demo" whose lesson is *"the card session completes after closure and the order routes to `needs_resolution` (merchant must decide: fulfill or refund — never automatic)"* — correct, but incomplete: it does not tell the merchant that for KHQR the gateway itself reverses the funds, so "fulfil" may be wrong and "refund" may be a double-refund.
- **Developer impact:** a merchant reconciling a late KHQR payment may fulfil an order whose funds were reversed (loss), or issue a refund on top of an automatic reversal (double refund). Both are real money outcomes, and neither is discoverable from the repository.
- **Root cause:** the official `lifetime` prose was never harvested; the repo's lifetime knowledge came from the archived spec (bounds) and sandbox probes (acceptance), not from the behavioural text.
- **Target state:** `rules.yaml` entries `TX-LIFE-001…003` (one per method class) with `source: official` and evidence; `TransactionState` gains `latePayment: {possible: boolean, reversalExpected: 'gateway-automatic'|'none'|'unknown', paymentMethod}`; `paymentNextStep`/`transaction verify` warn when an approval arrives after the recorded lifetime on a KHQR transaction; `docs/guides/transactions-and-status` and the `first-payment` Late Payment Demo both state the per-method consequence; `go-live` gate "late-payment policy defined per payment method in use" (evidence-required).
- **Specification:** (1) record the three rules with evidence; (2) surface them in `request inspect` (`normalization`/`behaviourNotes`) and in `explain 21` ("End of API lifetime"); (3) add a `diagnose --symptom late-payment` branch that asks the payment method and returns the correct consequence; (4) extend the reference app's Late Payment Demo to a KHQR variant that shows the reversal expectation; (5) **do not** attempt to detect a reversal from the API — no endpoint is documented for it, so it stays `evidence-required` in `go-live`.
- **Dependencies:** `rules.yaml`; `core/lifecycle.ts` (§20); `diagnose`.
- **Risks:** over-claiming — the official text does not say *when* the reversal appears in reports, so the rule must state the reversal expectation without promising a timeline or an API signal. Mark the reconciliation timing `UNVERIFIED`.
- **Validation:** a rules-conformance test asserts the three entries exist with official evidence; a `diagnose` golden test returns the KHQR reversal answer for a late KHQR payment and the no-reversal answer for WeChat; a docs test asserts the Late Payment Demo mentions per-method consequences.
- **Acceptance criteria:** (1) three official-sourced rules with evidence files; (2) `diagnose --symptom late-payment` differentiates by payment method; (3) `explain 21` cross-references them; (4) the reference app and the transactions guide state the per-method consequence; (5) a `go-live` evidence-required gate exists; (6) no code claims to detect a reversal.
- **Complexity:** S–M · **Phase 1** (rules + docs), **Phase 2** (`diagnose`/lifecycle integration)

---

### N-05 — The SDK substitutes `currency: 'USD'` where official docs define a profile-derived default
- **Severity:** **P1** · **Area:** Money handling / Configuration semantics
- **Location:** `src/domains/checkout.ts:282,372,380,381` (`params.currency || 'USD'` ×4), `src/domains/credentials-on-file.ts:244,254,421,423,450` (`?? 'USD'` / `|| 'USD'`), `src/domains/qr.ts` (`params.currency || 'USD'`), `src/domains/checkout.ts:660` (`refund(…, currency: 'USD' | 'KHR' = 'USD')`)
- **Evidence (OFFICIAL, `purchase-14530820e0`, `currency`, retrieved 2026-10-05):** *"Transaction currency of the payment. **If you don't pass any value, it will take default value from your merchant profile (the first account's the currency of the first account you registered).** Supported values are `KHR` or `USD`."* On generate-qr, `currency` is **required** (so no gateway default exists there).
- **Problem:** for **purchase**, omitting `currency` is a documented, meaningful choice — "use my profile's settlement currency". The SDK replaces that with an explicit `'USD'` on the wire, so the merchant's intent is silently overwritten. For a KHR-only merchant, an omitted currency becomes a USD request, which the gateway may reject (official QR code `12` "Payment currency is not allowed"; gateway code `12` "Payment currency not allowed … the merchant profile has no settlement account for the requested currency") or, worse, accept as a USD transaction the merchant did not intend.
- **Developer impact:** a whole class of "why was I charged/quoted in USD?" and code-12 failures that the SDK manufactured. It also makes the SDK's behaviour differ from the official PHP samples, so a merchant porting from ABA's sample gets different results.
- **Root cause:** a convenience default chosen before the official default semantics were recorded, then copied across 10+ call sites in two spellings.
- **Target state:** `currency` is **optional and forwarded as omitted** on purchase (letting the profile default apply), **required** on generate-qr (per official docs) with a clear error naming the rule, and defaulted only where a *documented* default exists. A single `core/money.ts#resolveCurrency(params, {endpoint})` implements all three behaviours; the 7 spellings collapse to 1.
- **Specification:** (1) `resolveCurrency(value, {endpoint, profileCurrency?})`: generate-qr → require (throw `PW-VAL-0xx` naming `QR-010`); purchase → return `undefined` when omitted so `filterParams` drops it; refund/CoF/payout → per-endpoint rule from `rules.yaml`; (2) CLI keeps `-c/--currency` with `defaultCurrency` from configuration (explicit, visible, and *not* silently USD) and prints the resolved value plus its source; (3) `request inspect` shows the currency decision in `normalization[]` with `source: official` and, when omitted, `note: "gateway will apply the merchant profile default"`; (4) `doctor` gains `CFG-009` "default currency configured or profile default intended" (warning).
- **Dependencies:** `rules.yaml` (QR-010/011, PUR-010); `core/money.ts` (P1-03 helper extraction).
- **Risks:** **breaking change** for callers who relied on the implicit USD default and have a KHR profile → they currently get USD and would now get KHR. That is the *correct* outcome but it is a behaviour change: gate it behind the 2.0.0 major, and in the interim emit an advisory whenever currency is omitted on purchase ("omitting currency uses your merchant profile default; the SDK currently sends USD — set PAYWAY_DEFAULT_CURRENCY to make this explicit").
- **Validation:** unit tests per endpoint; a mock-transport test asserting the purchase body **omits** `currency` when not supplied; `request inspect` golden files; an advisory-emission test for the interim period.
- **Acceptance criteria:** (1) purchase omits `currency` from the wire body when the caller omits it; (2) generate-qr throws a rule-referencing error when omitted; (3) one `resolveCurrency` implementation, zero `|| 'USD'` spellings outside it; (4) `request inspect` documents the decision and its source; (5) the interim advisory fires exactly once per client; (6) `rules.yaml` records the official profile-default semantics with evidence.
- **Complexity:** M · **Phase 2** (advisory in Phase 1)

---

### N-06 — `items` cap: the repository warns "at most 10"; official documentation says up to 50
- **Severity:** **P2** · **Area:** Rules correctness
- **Location:** `src/domains/checkout.ts:311-318`, `src/domains/qr.ts:147-150`
- **Current state:** both paths emit `warnAdvisory(config, "items carries N entries; the gateway accepts at most 10")` above 10 entries; `checkout.ts` additionally warns when the encoded length exceeds 500 (*"gateway may reject with error 13"*).
- **Evidence (OFFICIAL, both `purchase-14530820e0` and `qr-api-14530840e0`, retrieved 2026-10-05):** `items` — *"A Base64-encoded JSON array describing the items being purchased. **It supports up to 50 line items with no character limit.** Note: This is only description/remark. **The price or quantity in this info will not be used for calculation or any validation purposes.**"* On generate-qr the field additionally carries `<= 500 characters`.
- **Problem:** the count cap is wrong by 5×, and the repository does not record the more consequential official statement — that item price/quantity are **not** used for calculation or validation. That statement matters because it tells integrators (and agents) that line items cannot be used as an amount-integrity check, which is exactly the kind of assumption an agent would otherwise invent.
- **Developer impact:** a merchant with an 12-item cart is warned they exceed a gateway limit that does not exist, and may split or truncate orders unnecessarily; under `strictValidation` the advisory becomes a hard failure (until P2-05 is fixed), blocking a valid 12-item purchase.
- **Root cause:** same class as P0-02 — a limit encoded from an internal/archived source without re-checking official docs.
- **Target state:** `rules.yaml` `QR-016`/`PUR-016`: `{count: {max: 50, source: official}, encodedLength: {max: 500, appliesTo: [qr.create], source: official}, semantics: "description only; price and quantity are not used for calculation or validation", source: official}`. Advisories corrected; the semantics statement surfaced in `request inspect` and in the items documentation so no consumer treats line items as an amount check.
- **Specification:** (1) change both advisories to 50; (2) keep the 500-char advisory for generate-qr only (official states the cap there) and re-verify whether purchase has one (official purchase text says "no character limit" — so **remove** the purchase 500-char advisory or mark it `source: sandbox` with evidence); (3) add the semantics sentence to the generated docs and to `request inspect`'s `normalization[]` note for `items`.
- **Dependencies:** `rules.yaml`.
- **Risks:** the 500-char purchase warning may reflect real observed behaviour → do not delete it blindly; reclassify it with its evidence and let the probe decide.
- **Validation:** unit tests at 10/11/50/51 items for both endpoints; `rules check` parity; a docs test asserting the semantics sentence appears wherever `items` is documented.
- **Acceptance criteria:** (1) no advisory below 50 items; (2) advisory at 51 cites `ruleId` and the official source; (3) the purchase 500-char advisory is either removed or reclassified with evidence; (4) the "not used for calculation or validation" semantics is recorded in `rules.yaml` and rendered in docs and `request inspect`.
- **Complexity:** S · **Phase 1**

---

### N-07 — Purchase content type: official declares `multipart/form-data`; the SDK sends `application/json`; the local form posts urlencoded
- **Severity:** **P2** · **Area:** Protocol conformance / Rules provenance
- **Location:** `src/domains/checkout.ts:264,274,427` (`contentType` parameter; purchase passes `'application/json'`), `src/domains/checkout.ts:470-490` (local HTML form: hidden inputs, no `enctype` ⇒ `application/x-www-form-urlencoded`), `src/domains/credentials-on-file.ts` (link-card uses urlencoded, sandbox-verified)
- **Evidence (OFFICIAL, `purchase-14530820e0`, retrieved 2026-10-05):** Header Params → `Content-Type` required, *"Example: `multipart/form-data`"*; Body Params are presented as `multipart/form-data`; the cURL sample uses `--form 'field="value"'` for all 27 fields. The official **QR** page by contrast declares `Content-Type: application/json` with a `--data-raw` JSON sample — and the repository matches that one exactly.
- **Problem:** three content-type representations of one endpoint coexist: official says multipart, the SDK's network path sends JSON (and works in sandbox), and the SDK's local form path posts urlencoded (matching ABA's own HTML sample). Nothing records which is canonical, why JSON works, or whether multipart is required for some profiles or for the `payment_gate: 0` path.
- **Developer impact:** a merchant porting ABA's official cURL sample gets multipart; a merchant using the SDK gets JSON; a merchant using `checkout-form` gets urlencoded. When one of them fails with an opaque code (`7` "Invalid Request Data", `48` "Something went wrong with requested parameters"), there is no recorded knowledge to consult. It also complicates `request inspect`, which must state the content type it would use.
- **Root cause:** the SDK's JSON choice came from the archived spec and sandbox success; the official page's multipart declaration was never reconciled with it.
- **Target state:** one recorded rule `PUR-020 {contentType: {official: 'multipart/form-data', implemented: 'application/json', localForm: 'application/x-www-form-urlencoded', status: 'divergent-but-working', evidence: …, requiredConfirmation: …}}`, surfaced by `request inspect` and by `explain 7`/`explain 48`. A probe determines whether multipart is accepted, required, or equivalent.
- **Specification:** (1) probe purchase in sandbox with `application/json`, `multipart/form-data`, and `application/x-www-form-urlencoded`, recording acceptance and any code differences; (2) record the result; (3) if all three work, document JSON as the SDK's choice with the reason (structured bodies, base64 fields, no filename semantics) and keep it; (4) if multipart is required for any profile/parameter combination, add a `contentType` escape on `RequestCallOptions` (the plumbing already exists at `checkout.ts:264`) rather than changing the default; (5) `explain 7`/`explain 48` cross-reference the rule.
- **Dependencies:** sandbox credentials; `rules.yaml`; `request inspect`.
- **Risks:** low — the probe is read-only in effect (purchase attempts in sandbox with 0.01 amounts). Do **not** change the default content type without probe evidence.
- **Validation:** probe results committed; a mock-transport test pins the content type the SDK sends per endpoint; `request inspect` reports it.
- **Acceptance criteria:** (1) probe evidence for all three content types on purchase; (2) `rules.yaml` records official vs implemented with a status; (3) the SDK's choice is documented with a reason; (4) `request inspect` states the content type; (5) `explain 7`/`48` reference the rule.
- **Complexity:** S (probe + record) · **Phase 1**

---

### N-08 — Gateway responses are cast to generated types with no runtime validation
- **Severity:** **P2** · **Area:** Type safety / Robustness
- **Location:** `src/client.ts` (`_executeFetch` → `JSON.parse` → `normalizePaywayResponse`/`classifyBusinessError`, ~300 lines), domain return types such as `components['schemas']['GenerateQrResponse']`, `src/types.ts` (generated)
- **Current state:** response bodies are parsed and classified by hand-written shape-sniffing, then returned under generated TypeScript types. No runtime assertion checks that the fields the SDK and its consumers dereference actually exist. `ajv` is available and already used for journal and agent schemas (`src/journal/schema.ts:69`, `src/agent/schemas.ts:209`) but not here.
- **Evidence:** `grep -rn "validateResponse|responseSchema|ajv" src/client.ts src/transport/*` → no hits. The classifier's existence is itself the evidence that shapes vary: it handles `status.code` as string or number, `"0"`/`"00"`/`""` as success, nested `{"status":{"code":429}}` and legacy flat `{"status":429}`, string statuses `FAILED`/`ERROR`, numeric `status !== 0`, top-level `code`, HTML bodies, field-error maps, and `302 → /add-card/<base64>`.
- **Problem:** TypeScript types assert a shape that nothing verifies at runtime. When the gateway returns something new — the documented failure mode this repository has already encountered repeatedly — consumers get `undefined` dereferences instead of a typed error, and the failure surfaces far from its cause.
- **Developer impact:** `qr.qrString.split(...)` throws `TypeError` in merchant code with no PayWay context, no correlation id, and no hint. Debugging starts from the wrong end.
- **Root cause:** the classifier grew to handle observed variety, and full schema validation was (reasonably) never added because the shapes are too irregular for a single schema. **The first pass's implicit recommendation — validate responses against the OpenAPI schema — is rejected here as the wrong fix**: the official/archived schemas do not describe the observed variety, so schema validation would produce false failures.
- **Target state:** **narrow runtime assertion of only the fields the SDK dereferences**, not full schema validation. A `core/contract.ts` with per-operation `assertShape(result, {required: ['status.code'], strings: ['qrString'], numbers: ['amount']})` that throws `PayWayAPIError` with `category: 'API_REJECTION'`, `code: 'PW-API-SHAPE'`, the raw redacted body, and the correlation id — turning a downstream `TypeError` into an actionable, correlated error.
- **Specification:** (1) enumerate, per operation, the fields the SDK and the documented examples dereference (small: 2–6 per operation); (2) assert presence and primitive type only — never values, never exhaustiveness; (3) on failure, throw with the raw body attached (redacted) and `hint: "the gateway returned an unexpected shape — report this with the correlation id"`; (4) `strictValidation` does **not** escalate shape assertions (they are already errors); (5) add a fixture per assertion failure path (§26).
- **Dependencies:** fixtures corpus; `PayWayErrorRecord` (P2-06).
- **Risks:** over-asserting would reject valid-but-unusual responses → assert only dereferenced fields, and record each assertion in `rules.yaml` as `source: repo` so it is reviewable.
- **Validation:** for each operation, a fixture with the field missing produces `PW-API-SHAPE` with correlation id and redacted body; no existing passing test changes behaviour.
- **Acceptance criteria:** (1) every operation asserts its dereferenced fields; (2) a missing `qrString` yields a typed, correlated error rather than a downstream `TypeError`; (3) assertions are presence/type only (test asserts no value checking); (4) `strictValidation` does not alter their behaviour; (5) each assertion has a failure fixture.
- **Complexity:** M · **Phase 2**

---

### N-09 — The hosted-checkout plugin URL is hard-coded to the production host and used for sandbox forms
- **Severity:** **P2** · **Area:** Environment safety / Configuration
- **Location:** `src/domains/checkout.ts:46` `const CHECKOUT_FORM_PLUGIN_SRC = 'https://checkout.payway.com.kh/plugins/checkout2-0.js'`, used unconditionally at `:489` and `:494`; CLI flag `--popup` (`src/cli.ts:2358`); also referenced in `src/domains/credentials-on-file.ts:37`
- **Current state:** `checkout-form`/`generate-checkout --popup` emits `<script src="https://checkout.payway.com.kh/plugins/checkout2-0.js">` regardless of the resolved environment. The form's **`action`** is environment-correct (`${resolvedBaseUrl}${ENDPOINTS.purchase}` at `:471`), so the payment POST goes to the right host; only the plugin script is production-hosted.
- **Evidence:** direct read of `checkout.ts:46,470-495`. No environment conditional and no configuration override exists for the plugin source. Official docs reference `checkout2-0.js` and `AbaPayway.checkout()` in the Ecommerce Checkout sample (retrieved 2026-10-05) without stating an environment-specific host.
- **Problem:** a sandbox integration's page loads third-party JavaScript from the **production** host. Two consequences: (a) merchants with a Content-Security-Policy must allowlist `checkout.payway.com.kh` even in sandbox, which is surprising and undocumented; (b) if ABA does serve a sandbox plugin host, sandbox tests are exercising production JS. Neither is verifiable from the repository, and there is no override to test with.
- **Developer impact:** CSP breakage in sandbox; an unverifiable assumption baked into generated HTML that merchants copy into production pages.
- **Root cause:** a single constant taken from ABA's sample, never parameterised, in a code path that is otherwise environment-aware.
- **Target state:** `pluginSrc` derives from the resolved base URL by default (`${resolvedBaseUrl}/plugins/checkout2-0.js`) **or** is explicitly configurable (`PayWayConfig.checkoutPluginSrc`, `PAYWAY_CHECKOUT_PLUGIN_SRC`, CLI `--plugin-src`), with the current production constant retained as the documented fallback until ABA confirms whether a sandbox host exists.
- **Specification:** (1) add the config/env/flag override; (2) default to the existing constant (no behaviour change without confirmation); (3) record `PUR-021 {pluginSrc: {current: 'https://checkout.payway.com.kh/plugins/checkout2-0.js', envSpecific: UNVERIFIED, requiredConfirmation: "does a sandbox plugin host exist?"}}`; (4) `doctor WEB-005` warns when a sandbox form would load a production-hosted script and the merchant has not set an override; (5) document the CSP allowlist requirement in the hosted-checkout guide.
- **Dependencies:** `rules.yaml`; `env-vars.yaml` (P1-04) for the new variable; `doctor` registry.
- **Risks:** switching the default to a derived sandbox URL without confirmation could break popup mode in sandbox → keep the constant as default until the answer arrives. This is why the finding is P2 and not P1: today's behaviour probably works.
- **Validation:** unit tests for override precedence (flag > env > config > constant); a generated-HTML snapshot per environment; `doctor WEB-005` fires in sandbox without an override.
- **Acceptance criteria:** (1) `pluginSrc` overridable via config, env, and flag with documented precedence; (2) default unchanged pending ABA confirmation, with the question recorded in `rules.yaml`; (3) `doctor` warns in the sandbox-without-override case; (4) the CSP requirement is documented; (5) HTML snapshots cover sandbox and production.
- **Complexity:** S · **Phase 2**

---

### N-10 — Official pre-auth payment-method restriction is not enforced
- **Severity:** **P2** · **Area:** Validation / Rules
- **Location:** absent (`grep -rn "pre-auth only support|purchaseType" src/domains/checkout.ts` → no validation hits); `src/domains/pre-auth.ts` validates capture amounts and windows, not the originating method
- **Evidence (OFFICIAL, `purchase-14530820e0`, `type` field):** *"Type of the transaction, default value is `purchase`. Supported value: `pre-auth`: for pre purchase, `purchase`: for full purchase. **Note: pre-auth only support ABA PAY, KHQR and Card Payment.**"* Combined with the official payment-option list, pre-auth therefore excludes `alipay`, `wechat`, and `google_pay`. The official QR page says the same from the other side: *"Alipay & WeChat do not support pre-auth."*
- **Problem:** a deterministic, officially documented, endpoint-independent rule is not validated anywhere. `purchase({type:'pre-auth', paymentOption:'google_pay'})` is built, signed, and sent, and fails at the gateway with an opaque code.
- **Developer impact:** a wasted round-trip and an opaque rejection on a money-path operation; for an agent, no local signal that the combination is invalid.
- **Root cause:** the rule lives in prose inside a *different* field's description (`type`), so it was never harvested into the enum validators.
- **Target state:** `rules.yaml` `PUR-022 {when: {type: 'pre-auth'}, then: {paymentOption: ['cards','abapay_khqr','abapay_khqr_deeplink']}, source: official}` enforced as a **cross-field** validation in `core/validation` (not per-domain), consumed by the SDK, the CLI, `validate request`, and `request inspect`.
- **Specification:** (1) add a cross-field rule mechanism (`when/then` over the normalised request) — needed anyway for `google_pay` ⇒ `googlePayToken` (already hand-coded at `checkout.ts:338-341`) and `tokenFlag` ⇒ `ctid`/`frequency` (`:346-366`); (2) migrate those three hand-coded conditionals into the mechanism so there is one place cross-field rules live; (3) enforce pre-auth/method as HARD (it is deterministic and official).
- **Dependencies:** `rules.yaml`; `core/validation`.
- **Risks:** a profile-specific exception would make a HARD check wrong → the official text is unconditional, so HARD is justified; if a merchant reports an exception, the rule gains a `variants` entry rather than being deleted.
- **Validation:** unit tests for all 6 options × both types; `validate request` and `request inspect` both reject before signing; a test asserts the three migrated conditionals behave identically to before.
- **Acceptance criteria:** (1) `type: 'pre-auth'` with `alipay`/`wechat`/`google_pay` throws locally citing `PUR-022`; (2) one cross-field rule mechanism holds all three conditionals; (3) `request inspect` reports the violation without signing; (4) the rule has official evidence.
- **Complexity:** S–M · **Phase 2**

---

### N-11 — `generateHmac` stringifies arbitrary values, so a non-primitive silently corrupts the signature preimage
- **Severity:** **P2** · **Area:** Signing robustness
- **Location:** `src/auth.ts` `generateHmac`: `fieldList.map(field => { const val = payload[field]; if (val === undefined || val === null) return ''; return String(val); }).join('')`
- **Evidence:** verbatim read. Contrast `verifyCallbackDetailed` in the same file, which **does** handle structure: `if (typeof val === 'object') return JSON.stringify(val)`. So request signing and callback verification use **different canonicalizations for the same class of input**.
- **Problem:** `String({a:1})` → `"[object Object]"`; `String([1,2])` → `"1,2"`; `String(true)` → `"true"`. Any payload field that reaches `generateHmac` as an object, array, or boolean contributes meaningless text to the preimage and produces a wrong hash with **no error**. Today this is latent because callers pre-encode (`formatAmount` → string, `encodeBase64IfNeeded` → base64 string, `filterParams` drops undefined) — but it is undefended, and `additionalParams?: string | Record<string, unknown>` plus `payout?: string | Array<{acc,amt}>` are typed to accept objects.
- **Developer impact:** the worst possible failure mode for this API — `code 1 "Wrong hash"` with no local signal, on an endpoint where the SDK accepted the input without complaint. An integrator who passes `additionalParams` as an object on a path that skips `encodeBase64IfNeeded` debugs a signature for hours.
- **Root cause:** a permissive `String()` coercion chosen for simplicity, with the safety provided by convention in callers rather than by the function.
- **Target state:** `generateHmac` accepts only `string | number | bigint | boolean | null | undefined` per hashed position and **throws** `PayWayConfigError` (with the field name and the rule id) for objects/arrays/functions/symbols — because a non-primitive in a hashed position is always a caller bug, never a valid wire value. Callback verification keeps its `JSON.stringify` branch (the official PHP sample does `json_encode` for arrays/objects) and the divergence between the two canonicalizations is documented as intentional, with the reason.
- **Specification:** (1) add the type guard and error; (2) audit all call sites to confirm every hashed field is primitive by the time it reaches `generateHmac` (the pre-encoding paths already guarantee this — the guard makes it enforced rather than assumed); (3) document both canonicalizations side by side in `auth/README` and in the `payway-authentication` skill; (4) golden vectors (§27) covering: all-empty optionals, a numeric amount, a boolean, an object (expect throw), a unicode string, and a 117-byte-boundary RSA input.
- **Dependencies:** golden vectors (WP-06); none otherwise.
- **Risks:** a caller somewhere may rely on the coercion → the audit in step 2 plus the full existing suite (2,378 tests) is the check; if any test breaks, it has found a real latent bug.
- **Validation:** unit test asserting throw for object/array/function; all existing signature tests unchanged; golden vectors pin the preimage bytes for the six cases above.
- **Acceptance criteria:** (1) non-primitive hashed values throw with field name + rule id; (2) no existing test changes behaviour; (3) golden vectors committed and passing; (4) the request-vs-callback canonicalization divergence is documented with its official justification in both directions.
- **Complexity:** S · **Phase 1**

---

### N-12 — 31 of 47 `scripts/` files are referenced by nothing, including every probe that produced the rule evidence
- **Severity:** **P2** · **Area:** Repository hygiene / Evidence integrity
- **Location:** `scripts/` (47 `.ts`/`.mjs` files)
- **Evidence (measured):** scanning `package.json`, `.github/`, `src/__tests__/`, `docs/project/RELEASE_CHECKLIST.md`, and `CONTRIBUTING.md` for each filename yields **31 unreferenced** files, including all 17 `sandbox-probe-*.ts`, plus `capture-qr-template-gallery.ts`, `check-qr-transactions.ts`, `checkout-cards-close.ts`, `checkout-link-poll.ts`, `close-transaction-verify.ts`, `online-qr-poll.ts`, `post-payment-test.ts`, `qr-payment-test.ts`, `sandbox-campaign-full-cycle.ts`, `sandbox-campaign-scopes.ts`, `sandbox-integration-test.ts`, `test-all-qr-templates.ts`, `webhook-e2e-test.ts`, `webhook-integrated-test.ts`.
- **Problem:** the repository's rule provenance cites dated sandbox observations ("sandbox-pinned boundary 2026-08-30: 179s → 400 '04', 180s → OK"; "probes C1/C2"; "SANDBOX-FINDINGS §23"). The scripts that produced those observations are **not runnable by reference, not documented, and not gated** — so no one can re-run a probe to re-verify a rule, which is precisely the capability §22 and N-01/N-03 require. The evidence is cited but not reproducible.
- **Developer impact:** contributors and agents cannot verify or refresh any sandbox-derived rule; when ABA changes behaviour, there is no runnable probe to detect it. Evidence rots into folklore.
- **Root cause:** probes were written as one-offs during investigation campaigns and never promoted into a harness.
- **Target state:** `scripts/probes/*.probe.ts` with a runner (`npm run probe -- <id>`) that (a) requires sandbox credentials and **refuses production** (§12), (b) writes a dated result record into `knowledge/rules/evidence/<rule-id>/`, (c) is listed in `rules.yaml` as the `refreshCommand` for the rules it supports, and (d) runs nightly for the money-path subset. Dead one-off test scripts (`webhook-e2e-test.ts`, `post-payment-test.ts`, etc.) are either promoted to real `vitest` suites or deleted.
- **Specification:** (1) inventory each of the 31: `promote | convert-to-test | delete`, recorded in a table in the work package; (2) build the runner with a `--dry-run` that prints the probe plan without credentials; (3) wire `refreshCommand` into `rules.yaml` and surface it in `rules`-consuming output (`request inspect`, `doctor` evidence staleness); (4) nightly job for the money-path probes (QR lifetime, duplicate tran_id, content type, amount type) with results committed as evidence artifacts.
- **Dependencies:** P0-03/N-03/N-07 probes are the first three consumers; `rules.yaml`.
- **Risks:** probes spend sandbox quota and create transactions → rate-limit them, use minimum amounts (0.01 USD / 100 KHR), and record the tran_ids they mint so they can be closed.
- **Validation:** `npm run probe qr-lifetime --dry-run` prints the plan; a live run writes an evidence record with request/response pairs; `scripts/` unreferenced count drops to 0 (every file is referenced by `package.json`, CI, a test, or the probe runner).
- **Acceptance criteria:** (1) zero unreferenced scripts; (2) every sandbox-derived rule in `rules.yaml` names a runnable `refreshCommand`; (3) the probe runner refuses production; (4) nightly money-path probes produce dated evidence artifacts; (5) each of the 31 files has a recorded disposition.
- **Complexity:** M · **Phase 1** (runner + first 3 probes) → **Phase 3** (full inventory)

---

### N-13 — The exported SDK simulator fabricates URLs on the real sandbox hostname
- **Severity:** **P3** · **Area:** API boundary / Trust
- **Location:** `src/server/index.ts:203-205` (`qr_image`, `checkout_qr_url`, `url` → `https://checkout-sandbox.payway.com.kh/…`), `src/test/index.ts:96-98,288,335` (same, plus `https://link-sandbox.payway.com.kh/ABAPAY…`), both reachable from `src/index.ts` exports
- **Evidence:** verbatim read. `link-sandbox.payway.com.kh` is a host that appears **nowhere** in `BASE_URLS` (`src/constants.ts:1-4` defines only `checkout-sandbox` and `checkout`), so the simulator invents a third host the SDK never configures.
- **Problem:** a simulation path inside the production entrypoint emits URLs that are indistinguishable from real sandbox endpoints. Unlike `examples/first-payment`, which labels every artifact `simulated: true` and shows a `SIMULATED` banner, `server.simulatePurchase` returns URLs with no such marker.
- **Developer impact:** a merchant who calls the simulator by mistake (it is exported from the package root beside `PayWay`) renders or stores a URL pointing at a real host for a transaction that does not exist — a confusing, hard-to-diagnose state, and the opposite of the reference app's careful labelling discipline.
- **Root cause:** mock realism was prioritised over mock *labelling*, and the simulator lives in `server/` (production namespace) rather than `testing/`.
- **Target state:** all simulation moves to `src/testing/` behind the `aba-payway-ts/testing` subpath; every simulated artifact carries `simulated: true`; fabricated URLs use an obviously invalid host (`https://payway.invalid/…`, RFC 2606-reserved) unless a test explicitly needs the realistic shape, in which case the fixture declares it.
- **Specification:** (1) move `src/test/**` and `server.simulatePurchase` to `src/testing/**`; (2) add `simulated: true` to every returned artifact; (3) switch fabricated hosts to `.invalid`; (4) keep `src/index.ts` re-exports for one major with a deprecation notice, then remove; (5) a test asserts no `.invalid`-hosted URL leaks from a non-testing module.
- **Dependencies:** P2-11 (subpath exports).
- **Risks:** tests that assert on the sandbox-hostname shape → update them in the same change; they are asserting a fabrication, not a contract.
- **Validation:** `smoke:package` imports the root specifier and asserts the simulator is absent; the `testing` subpath exposes it; snapshot tests updated.
- **Acceptance criteria:** (1) the root specifier no longer exports the mock server or simulator; (2) every simulated artifact carries `simulated: true`; (3) fabricated URLs use `.invalid`; (4) a boundary test forbids `.invalid` URLs outside `testing/`.
- **Complexity:** S–M · **Phase 3**

---

### N-14 — Normative implementation guidance lives inside a generated file
- **Severity:** **P3** · **Area:** Knowledge placement
- **Location:** `src/types.ts:399` — *"NOTE: Per the official PayWay docs (developer.payway.com.kh), the payout hash uses hex-encoded HMAC (NOT base64) … This differs from all other endpoints which use base64 encoding. **The SDK should handle this accordingly.**"* — inside a file headed *"This file was auto-generated by openapi-typescript. Do not make direct changes to the file."* Source of truth: `payway-openapi/paths/payout.yaml:13-17`, bundled into `payway-openapi/bundled.yaml:933`.
- **Verification:** the guidance **is** implemented — `src/domains/payout.ts:96` passes `'hex'` as `hashEncoding`, and `client.ts:1878,1897` threads `hashEncoding` into `generateHmac`. So this is not a correctness bug.
- **Problem:** an instruction to the SDK ("should handle this accordingly") is stored where no SDK author will look (a generated type file) and where it cannot be acted on (the file forbids edits). The actual implementation in `domains/payout.ts` carries no reference back to the rule, so the two can diverge silently — and a hex-vs-base64 divergence on a **payout** endpoint means every payout fails with `code 1`.
- **Developer impact:** low today, high on any future refactor of the payout domain: the only written justification for `'hex'` is in a file marked "do not edit".
- **Root cause:** the hand-authored OpenAPI spec was used as a general-purpose notes file, and its descriptions are regenerated into types.
- **Target state:** the rule lives in `rules.yaml` as `PO-003 {hashEncoding: 'hex', appliesTo: [payout], source: official, evidence: evidence/PO-003.md}`; `domains/payout.ts` cites the rule id in a comment; `request inspect payout.create` reports `signature.encoding: 'hex'` with the provenance; the OpenAPI description keeps a one-line pointer, not the instruction.
- **Specification:** (1) add the rule with evidence (fetch the official Payout page and quote its hash section — **not yet retrieved in this audit**, so until then the source is `repository-spec` and the rule is `REQUIRES_EXTERNAL_VERIFICATION`); (2) cite the rule id at `payout.ts:96`; (3) surface the encoding in `request inspect`; (4) add a golden vector pinning a payout signature in hex (§27) so a regression to base64 fails the build.
- **Dependencies:** `rules.yaml`; golden vectors; `request inspect`.
- **Risks:** none — documentation placement only.
- **Validation:** golden vector; a test asserting `request inspect payout.create` reports `hex`; grep asserting no "The SDK should" instruction remains in generated files.
- **Acceptance criteria:** (1) the rule is in `rules.yaml` with an evidence file or an explicit `REQUIRES_EXTERNAL_VERIFICATION` marker; (2) `payout.ts` cites the rule id; (3) a golden vector pins hex encoding; (4) no normative instruction remains in `src/types.ts`.
- **Complexity:** S · **Phase 2**

---

### N-15 — The only format script is destructive; no non-destructive check exists
- **Severity:** **P3** (folded into P1-09 for delivery) · **Area:** Tooling
- **Evidence:** `package.json` `format = biome format src --write`; `format:fix` **does not exist**; `lint = biome lint src skills`; no format step in `ci.yml`.
- **Problem:** a contributor or agent cannot answer "is this formatted?" without rewriting 181 files. Scope is also inconsistent between `lint` and `format`.
- **Target state / specification / acceptance:** as P1-09 (they are one work package).
- **Complexity:** S · **Phase 0/1**

---

### N-16 — Official QR documentation self-contradicts on name length; the repository chose per-endpoint values without recording the conflict
- **Severity:** **P3** · **Area:** Rules provenance
- **Evidence:** official QR parameter table: `first_name` ≤ 20, `last_name` ≤ 20. Official QR response code text: `16` *"Invalid First Name. It must not contain numbers or special characters or **not more than 100 characters**"*; `17` likewise. Official **purchase** table: `firstname` ≤ 100, `lastname` ≤ 100. Repository: QR path warns above **20** (`src/domains/qr.ts:135-139`), purchase path rejects above **100** with a charset regex for `firstname` (`src/domains/checkout.ts:298`) but checks only length for `lastname` (`:302`, no charset check).
- **Problem:** the repository made the right per-endpoint choices but recorded no conflict, so the QR-side official self-contradiction is invisible; and the purchase `lastname` charset check is asymmetric with `firstname` despite both sharing official code 17's wording.
- **Target state:** `rules.yaml` records `QR-020 {nameLength: {qr: 20, purchase: 100, officialConflict: "QR error text says 100", status: resolved-per-endpoint, evidence}`; add the missing `lastname` charset check on purchase (mirroring `firstname`), or record why it is absent.
- **Complexity:** S · **Phase 2**

---

### N-17 — Four fields official docs mark **required** on generate-qr are optional-with-defaults in the SDK
- **Severity:** **P2** · **Area:** Rules / API contract
- **Evidence (OFFICIAL QR page):** `currency` **required**, `payment_option` **required**, `lifetime` **required**, `qr_image_template` **required**. Repository: `GenerateQrParams` makes all four optional; `qr.ts:163` defaults `payment_option` to `'abapay_khqr'`; `:372`-equivalent defaults currency to `'USD'`; `validateQrLifetimeSeconds(undefined)` passes; `QR_TEMPLATES` documents `template2` as *"the API default"* citing sandbox verification 2026-08-30.
- **Problem:** the SDK substitutes defaults for fields the gateway documents as mandatory. Three of the four defaults are sensible and probably match gateway behaviour (the repo has sandbox evidence for the template default); but the substitution is invisible to the caller, is not recorded as an assumption, and — for `currency` — interacts badly with N-05.
- **Developer impact:** a caller who omits `lifetime` gets an unspecified gateway default (officially 30 days) rather than an error telling them to choose; a caller who omits `payment_option` silently gets KHQR even if they wanted WeChat.
- **Target state:** each default becomes an explicit, recorded `REPOSITORY_ASSUMPTION` in `rules.yaml` with its sandbox evidence, and `request inspect` lists every substituted default in `normalization[]` with `substituted: true`. Where the probe (P0-03) shows the gateway rejects omission, the field becomes required.
- **Specification:** (1) probe omission of each of the four in sandbox; (2) record results; (3) make required whatever the gateway requires, keep documented defaults for what it accepts, and always surface substitutions in `request inspect`; (4) CLI `--lifetime`/`--template`/`--currency`/`--payment-option` help text states the default **and its source**.
- **Dependencies:** P0-03 probe harness (N-12).
- **Acceptance criteria:** (1) all four fields have a recorded requiredness decision with evidence; (2) `request inspect` lists every substituted default; (3) `--help` states each default and its source; (4) fields the gateway requires throw locally with a rule id.
- **Complexity:** S–M · **Phase 2**

---

### N-18 — A third-party mirror of the official docs was used as authority, and it disagrees with the official docs in at least three places
- **Severity:** **P1 (process finding)** · **Area:** Evidence discipline — applies to *this audit* as much as to the repository
- **Evidence:** the mirror (`github.com/Joselay/aba-payway-docs`) states QR `lifetime` *"Maximum: 30 days"* (official: **120 days**), QR `amount` as a *"formatted decimal string"* (official: **number**), and QR `items` *"Maximum of 10 items"* (official: **up to 50 line items**). The first-pass audit adopted all three, and the repository's own `items > 10` advisory matches the mirror's number — suggesting the mirror (or a common ancestor) may also have influenced the repository.
- **Problem:** two independent consumers of PayWay knowledge — this audit and possibly the repository — inherited the same wrong numbers from the same non-authoritative source. Any rule whose only citation is a mirror is unverified.
- **Target state:** an evidence-discipline rule, enforced mechanically: `evidence/*.md` files must record a `developer.payway.com.kh` URL (or an ABA written response, or a probe result). A conformance test **rejects** an evidence file whose URL is not an official host or an approved internal probe record. Third-party mirrors, community SDKs, and forum posts are never `source: official`.
- **Specification:** (1) add `evidence.url` host allow-list validation to `rules-conformance.test.ts`; (2) re-verify every rule currently sourced from the archived spec or a mirror (at minimum: purchase hash order, `items` cap, amount type, both lifetime maxima, purchase content type); (3) record the outcome of each re-verification, including "official page's hash list does not render — requires manual browser check" where that is the truth.
- **Dependencies:** none.
- **Risks:** some official content is only readable in a browser (collapsed code samples) → record those as `REQUIRES_MANUAL_VERIFICATION` with a named human task rather than substituting a mirror.
- **Acceptance criteria:** (1) no rule carries `source: official` without an official-host evidence URL; (2) the five named rules are re-verified with recorded outcomes; (3) the purchase hash order is either manually verified from the rendered page or explicitly marked `REQUIRES_MANUAL_VERIFICATION`; (4) the conformance test rejects a non-official evidence URL (negative test).
- **Complexity:** S (test) + M (re-verification effort) · **Phase 1**

---

## 4.1 Negative-space checks that came back CLEAN

Recording these matters as much as the findings: a second pass that only adds problems is not verifying.

| Checked for | Result |
|---|---|
| Tests that test mocks instead of behaviour | **Clean.** Only 2 of 162 test files use the mock HTTP server (`mcp-server.test.ts`, `server-and-contract.test.ts`); the rest use injected transports and assert on real code paths |
| Hard-coded endpoints in the SDK's request path | **Clean.** All request URLs derive from `BASE_URLS` + `ENDPOINTS`; the hard-coded hosts found are in the simulator (N-13), one plugin constant (N-09), doc-comment URLs, and `explain` hint text |
| Library reading `.env` (environment leakage) | **Clean.** `src/client.ts` reads only `process.env`; `.env` loading is confined to `src/cli/dotenv.ts`. Correct boundary |
| `MUTATION_ENDPOINTS` incompleteness | **Clean.** 21 endpoints covering every side-effecting operation including `updateBeneficiaryStatus`, `addBeneficiary`, `voidPaymentLink`, and (conservatively) the three self-activation endpoints |
| Secret leakage through debug logging | **Clean by default.** `sanitizeForLog` is applied to `onRequest`/`onResponse` hook payloads and the debug path (`client.ts:1604-1605,1728,1737`); `redactHookBodies` defaults to redacting and requires an explicit `=== false` to disable. Residual (recorded in §13, not as a finding): the opt-out is not gated or warned about in production |
| Duplicate signing implementations | **Clean.** One `generateHmac`, one `encryptMerchantAuth`, one `verifyCallbackDetailed`, one `verifyCallbackSignatureRaw`; the local-form path shares `PURCHASE_HASH_FIELDS` with the network path by construction (`checkout.ts` comment: *"Shared by the local payload builder AND the network path"*) |
| Official purchase parameters missing from the SDK | **Clean.** `payment_gate`, `view_type`, `skip_success_page`, `additional_params`, `google_pay_token`, `continue_success_url` all present, and `payment_gate`/`view_type` correctly excluded from the hash |
| Generated corpus drift | **Clean.** `knowledge.test.ts` hash-gates the corpus; `guide-stubs.test.ts` gates mirrors; `skills.test.ts` gates `.zcode` parity; `export_json.js --check` gates the Postman export |

---

# 5. Current-State Architecture Corrections

Corrections to the first pass's *model of the repository* (as distinct from its findings). Each is stated as: first-pass model → verified model → consequence for the plan.

| # | First-pass model | Verified model | Consequence |
|---|---|---|---|
| C-1 | "CI runs one workflow with a broken order and non-blocking secret scanning" | **Four jobs**: `secret-scan` (gitleaks, `fetch-depth: 0`, blocking via a follow-up `exit 1`, all jobs `needs` it), `quality-gates` (2 OS × 3 Node; build, typecheck, lint, package checks, `docs:api`, `check:public-docs`, `check:repository`, `smoke:package`, reference-app setup+typecheck, `smoke:example`, tests, coverage-with-floors + artifact), `sqlite-contract` (installs `better-sqlite3@13.0.3`, runs 2 SQLite suites), `postman-collection` (`test:yaml` + `export_json.js --check`) | Three first-pass recommendations withdrawn; the CI work package shrinks to: `tsconfig paths`, reorder, platform-gate one test, add `format:check`, add CJS smoke, extend SQLite to 4 suites, add a boilerplate job |
| C-2 | "The error registry is a flat `code → meaning` map" | It is keyed **`family:code`** with 10 families, telemetry join (`ABA_TELEMETRY['family:code']`), and provenance fields. The defect is **lookup precedence** (bare numerics always resolve to `qr`) plus **staleness vs official tables** | The fix is a selector + endpoint re-keying + a harvest, not a redesign. Effort estimate drops from L to M |
| C-3 | "`ajv` is a runtime dependency that is not really used; consider dev-only" | Used at runtime in `src/agent/schemas.ts:209` and `src/journal/schema.ts:69` | The dev-only option is withdrawn; making it dev-only would break agent-contract and journal validation |
| C-4 | "QR lifetime max (120 days) contradicts official docs (30 days)" | Official QR page says **120 days**; official **purchase** page says 30 days. The repository has both correct | First-pass QR-D4 withdrawn; P0-03 narrows to the unit only |
| C-5 | "Repository amount formatting matches official docs" | Official declares `amount` **`number`** on both purchase and QR; the repository sends a **string** (`formatAmount`). Sandbox-verified working | New rule `AMT-000` with `status: divergent-but-working`, `REQUIRES_PAYWAY_CONFIRMATION`; surfaced by `request inspect` |
| C-6 | "Purchase 24-field hash order is OFFICIAL-verified" | The official page's hash list sits in a **collapsed PHP sample that does not render** in retrieved content; the 24-field order came from a third-party mirror. The **QR** 19-field order *is* directly official (it renders in the field description) and the repository matches it exactly | Purchase hash order → `REQUIRES_MANUAL_VERIFICATION` with a named human task; N-18 adds the evidence-host allow-list that prevents recurrence |
| C-7 | "`payway-boilerplate` is entirely ungated" | The Postman workspace has a dedicated CI job with structure/script/import-shape/KHQR-sim tests **and** dist-export freshness. `merchant-qr-pos` and `payment_link_api` are ungated | P2-03 narrows to two sub-projects + the duplicate `Refrence-copy` tree + naming |
| C-8 | "`tsconfig` is misconfigured (`outDir: dist/sdk`, `rootDir: .`)" | The operative fact is narrower and more useful: `include` is `["src/**/*","src/__tests__/**/*"]`, so `docs/examples/**` and `examples/**` enter **transitively** via `src/__tests__/docs-examples.test.ts`, which imports them, and they import the package **by name** → `dist/index.d.ts` → absent pre-build | The fix becomes precise and tiny: a `paths` mapping in a dedicated `tsconfig.typecheck.json`, plus a post-build `typecheck:dist` step to retain `.d.ts`-emit coverage |
| C-9 | "Payment-option validation is missing on `generateQr` (minor)" | Official docs mark `payment_option` **required** on generate-qr with exactly 3 values, and define code **23** for profile non-enablement | Upgraded to P1, and the enforcement level refined: HARD only for values in no official set, ADVISORY for profile enablement |
| C-10 | "The repository has no cross-field validation" | It has three hand-coded cross-field conditionals in `checkout.ts`: `google_pay` ⇒ `googlePayToken` (`:338-341`), `tokenFlag` ⇒ `ctid` (`:346-349`), `tokenFlag` ⇒ `frequency` (`:357-366`), plus `tokenFlag` restricted to `CITR_FIX` on the purchase path | The work is to give these a **home** (one cross-field rule mechanism) and add the missing pre-auth/method rule (N-10), not to invent a validation layer |
| C-11 | "Skill count should go 35 → 14" | Applying §32's removal tests (does it duplicate another skill / is it only documentation / is it trivial routing / should it be a CLI command or SDK validation) removes 3 of the 14 | Final count **11** (§32) |
| C-12 | "Nine YAML registries" | Four of the nine describe this repository's own code (commands, checks, products, environments) and would become second sources of truth | **Three** authored YAML + generated JSON (§29) |
| C-13 | "The first-pass deliverable is the plan of record" | It is 428 KB — larger than the repository's own `HANDOFF.md`, and it violates the agent context-budget principle it recommends | The plan of record becomes a **layered** artifact (§31, §33): a 2-page decision record, this specification, and a machine-readable backlog |

---

# 6. Target Architecture Design Review

## 6.1 Reviewing the first-pass target architecture as a whole

The first pass proposed: 17 `src/` directories, 6 subpath exports, 9 YAML registries, ~25 CLI groups, 34 backlog items, 5 phases. Reviewed against §7's smell list:

| Smell tested | Present in the first-pass proposal? | Verdict |
|---|---|---|
| CLI containing business rules | No — the proposal explicitly relocates 5 policy blocks | **Sound** |
| Documentation as the only rule source | No — rules move to data with enforcement points | **Sound** |
| Skills duplicating SDK logic | Partly — 14 skills still included per-domain rule restatements | **Fix:** skills reference rule ids, never restate rules (§32) |
| Agents implementing validation through prompts | No — guardrails are backed by `doctor`/`request inspect`/`go-live` | **Sound** |
| Tests depending on undocumented constants | No — golden vectors and evidence files are specified | **Sound** |
| Multiple modules performing signing | No — one `auth/` module | **Sound** |
| Configuration logic scattered across commands | No — one resolver | **Sound** |
| PayWay errors mapped differently per product | **Not addressed** — the proposal kept `family:code` and did not introduce endpoint scoping | **Fix:** endpoint-keyed registry (§24, N-01/N-02) |
| **New smell introduced by the proposal itself: metadata describing code** | **Yes** — `capabilities.yaml`, `doctor-checks.yaml`, `products.yaml`, `environments.yaml`, `symptoms.yaml` would all describe things code already defines | **Fix:** generate from code (§29) |
| **New smell: command-surface inflation** | **Yes** — `rules`, `products`, `logs redact`, `logs share`, `transaction explain`, `sandbox reset`, `qr deeplink`, `webhook configure` | **Fix:** 8 commands rejected (§38) |
| **New smell: unautomatable gates presented as checks** | **Yes** — 12 of 30 `go-live` gates | **Fix:** 18 gates (§36 of pass 1 → §17.4 here) |

## 6.2 The coherent target architecture (one picture)

```
┌──────────────────────── EXTERNAL AUTHORITY ────────────────────────────┐
│ developer.payway.com.kh  ·  ABA integration-team responses  ·  probes  │
└───────────────┬────────────────────────────────────────────────────────┘
                │ harvested, quoted, dated
                ▼
┌──────────────────── KNOWLEDGE (3 authored YAML) ───────────────────────┐
│ knowledge/rules/rules.yaml     PayWay protocol rules + provenance +    │
│                                conflicts + refreshCommand              │
│ knowledge/rules/errors.yaml    endpoint:code → meaning + retryability  │
│ knowledge/rules/env-vars.yaml  PAYWAY_* registry                       │
│ knowledge/rules/evidence/**    quote + URL + retrieval date (≤180 d)   │
└───────────────┬────────────────────────────────────────────────────────┘
                │ generated (gen:rules) — one direction only
                ▼
┌──────────────────────── CORE (no I/O) ─────────────────────────────────┐
│ core/rules.ts (loader)  core/errors.ts (+explain)  core/money.ts       │
│ core/ids.ts  core/lifecycle.ts  core/advisories.ts  core/env-guard.ts  │
│ core/validation/ (syntactic · semantic · cross-field · rule-driven)    │
└──────┬───────────────────────────┬─────────────────────────────────────┘
       │                           │
       ▼                           ▼
┌─── AUTH ───┐            ┌─── TRANSPORT ───┐
│ hmac (+    │            │ fetch policy:   │
│ inspectHmac│            │ retry/breaker/  │
│ rsa        │            │ rate-limit/cid/ │
│ callback-  │            │ TLS CA          │
│ signature  │            │ classify: shape │
│ field-     │            │ → typed result  │
│ orders     │            │ + assertShape   │
└──────┬─────┘            └────────┬────────┘
       └──────────┬────────────────┘
                  ▼
┌─────────── DOMAINS (pure payload builders + endpoint metadata) ────────┐
│ checkout · qr · khqr-offline · customer-qr · payment-link · cof ·      │
│ pre-auth · payout · beneficiary · self-activation · exchange-rate ·    │
│ transactions        each exposes buildXRequest() → {endpoint, method,  │
│                     contentType, body, fieldOrder, normalization[]}    │
└──────────────┬──────────────────────────────────────┬──────────────────┘
               ▼                                      ▼
┌──── CLIENT (composition root) ────┐   ┌──── CALLBACKS ────┐
│ PayWay  ·  sdk facade (documented │   │ classify + 4 route│
│ division of labour)               │   │ contracts         │
└──────────────┬────────────────────┘   └─────────┬─────────┘
               │                                  │
   ┌───────────┴────────────┬─────────────────────┴──────────┐
   ▼                        ▼                                ▼
┌─ OBSERVABILITY ─┐  ┌─ DIAGNOSTICS ─────────────┐  ┌─ WEBHOOK / STORAGE ─┐
│ logger, journal,│  │ doctor (code registry)    │  │ receiver, stores,   │
│ redaction       │  │ explain (endpoint-scoped) │  │ forwarder, tunnel,  │
└─────────────────┘  │ request-inspect           │  │ fixtures            │
                     │ diagnose (evidence-bound) │  └─────────────────────┘
                     │ go-live (reuses doctor)   │
                     └────────────┬──────────────┘
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
┌── CLI (presentation only) ──┐ ┌── MCP ──┐ ┌── AGENT (risk-gated) ──┐
│ commands/* · output/* (ONE  │ │ tools   │ │ plan → authorise →     │
│ envelope) · ui/* · program  │ │ catalog │ │ execute → ledger       │
└─────────────────────────────┘ └─────────┘ └────────────────────────┘
                                  │
                                  ▼
              ┌──── GENERATED CONSUMERS (never authored) ────┐
              │ docs/reference/{cli,errors,rules}.md|json     │
              │ capabilities.json · products.json             │
              │ .env.example · llms.txt · skill references    │
              │ knowledge corpus (prepack)                    │
              └───────────────────────────────────────────────┘
```

**Boundary rules (enforced by `architecture-boundaries.test.ts` + `no-restricted-imports`):**

| Layer | May import | Must not import |
|---|---|---|
| `core/` | nothing in `src/` | everything |
| `auth/` | `core/` | transport, domains, cli |
| `config/` | `core/` | domains, cli |
| `transport/` | `core/`, `auth/`, `config/`, `observability/` | domains, cli |
| `domains/` | `core/`, `auth/`, `config/` | transport, client, cli |
| `client/` | all of the above + `domains/` | cli, agent, mcp |
| `callbacks/` | `core/`, `auth/` | client, cli |
| `observability/` | `core/`, `config/` | domains, cli |
| `diagnostics/` | everything except `cli/`, `agent/`, `mcp/` | cli, agent, mcp |
| `webhook/` | `core/`, `config/`, `callbacks/`, `observability/` | cli, agent |
| `cli/` | everything | — (presentation only; **no domain policy**) |
| `mcp/`, `agent/` | everything except `cli/` internals | `cli/` internals |
| `testing/` | everything | — (and **nothing** may import `testing/` except tests and the `./testing` subpath) |

**Why this is the simplest correct architecture:** every arrow points one way; the only authored knowledge is the three YAML files whose truth is *external*; everything else is code or generated from code. There is no layer that both defines and consumes the same fact.

## 6.3 Responsibilities placed in the correct layer (the eight contested cases)

| Responsibility | First pass | Second-pass decision | Reason |
|---|---|---|---|
| Error explanation registry | move from `cli/explain-code.ts` to `core/` | **`core/errors.ts` loads generated data from `errors.yaml`** | SDK consumers need it; the CLI must not own knowledge the SDK requires |
| Diagnostic check definitions | YAML registry | **Code registry** (`diagnostics/doctor/checks/*.ts`) | Checks are executable; a YAML description of executable code is a second source of truth |
| Command catalogue (`capabilities`) | YAML | **Generated from the commander registry** | The commander tree already is the catalogue; `completions/introspect.ts` proves it |
| Product/readiness matrix | YAML | **Generated from `ENDPOINTS` + a small readiness map in code** | Readiness is a property of the implementation, which is code |
| Environment definitions | YAML | **Code (`BASE_URLS` + guard policy), exported as generated JSON** | Two hosts and a guard policy do not warrant a registry |
| PayWay protocol rules | YAML | **YAML** ✓ | Truth is external (ABA's docs); code cannot be the source |
| Error-code meanings | YAML | **YAML** ✓ | Truth is external |
| Environment variables | YAML | **YAML** ✓ | Truth is split across 12 modules today; a registry is the only way to make it complete and testable |
| Symptom→cause mapping (`diagnose`) | YAML | **Code** with rule-id references | Causes are diagnostic logic; only their `ruleId` links are data |
| Guardrails (MUST/MUST NOT) | YAML rendered into 4 surfaces | **YAML** ✓ | One text, four renderings, identity-tested — this is the definition of a justified registry |

---

# 7. Developer Journey Reassessment

Interaction-level audit of Scenario A (first sandbox payment). Every row is one interaction. Classification vocabulary: `REQUIRED_BY_PAYWAY` · `REQUIRED_BY_SECURITY` · `REQUIRED_BY_EXTERNAL_PROCESS` · `REPOSITORY_LIMITATION` · `AUTOMATABLE` · `REMOVABLE` · `DOCUMENTATION_PROBLEM`.

| # | Interaction | Developer must… | Today | Class | Target |
|---|---|---|---|---|---|
| 1 | Obtain the code | choose an install path | 3 coexisting paths; only build-from-source works for a cloner | **REPOSITORY_LIMITATION** | one path per situation, decided by a table; `npm install` after Phase 4 |
| 2 | Install dependencies | run `npm ci` | 13 s, works | — | unchanged |
| 3 | Build | run `npm run build` | 11 s, 1 warning (`import.meta` in CJS) | **REPOSITORY_LIMITATION** | warning fixed; build unnecessary for typecheck (C-8) |
| 4 | Learn the model | read QUICKSTART | excellent, 12 KB | — | unchanged |
| 5 | See it work without credentials | run `demo` | works | — | add `--output json` |
| 6 | Register for sandbox | leave the terminal, wait for email | external, unbounded | **REQUIRED_BY_EXTERNAL_PROCESS** | cannot remove; `sandbox info` states it plainly and `doctor` reports "credentials missing" as the *only* blocker |
| 7 | Obtain ABA PAY test access | contact an ABA integration human | external, undocumented duration | **REQUIRED_BY_EXTERNAL_PROCESS** | cannot remove; must be stated as a prerequisite in `init` output, not buried in QUICKSTART §5 |
| 8 | Create configuration | run `init` or hand-write `.env` | `init` writes 6 vars; no root `.env.example`; RSA PEM absent | **REPOSITORY_LIMITATION** | generated complete `.env.example`; `init` writes both artifacts |
| 9 | Enter credentials | edit `.env` | 3 values, masked-prompt alternative via `profiles add` | **REQUIRED_BY_SECURITY** | keep; add `configure --set` with masked input |
| 10 | Verify configuration | run `doctor` | boolean checks, false unknown-var warnings, no TLS/DNS check | **REPOSITORY_LIMITATION** | §17 doctor |
| 11 | Expose a callback URL | install `cloudflared`, run listener in a **second terminal**, copy a long URL, paste into the first | 4 sub-steps, error-prone | **AUTOMATABLE** | `webhook listen --print-url` (one line) + `qr create` reads the live listener URL from the data root when `--callback-url` is omitted |
| 12 | Choose a lifetime unit | understand that `--lifetime` means seconds here and minutes there | trap | **REPOSITORY_LIMITATION** | `--lifetime-unit`, one canonical unit, `request inspect` shows the decision |
| 13 | Generate a transaction id | run a 3-line inline `node -e` | manual shell work | **AUTOMATABLE** | `qr create` mints a unique id, prints it, and records it as the sticky current transaction |
| 14 | Create the payment | run `generate-qr` with 6 flags | works; TLS bypass temptation if the cert chain fails | **REQUIRED_BY_PAYWAY** + **REPOSITORY_LIMITATION** (TLS) | `tlsCaFile`; `doctor NET-003` explains the chain failure |
| 15 | Pay it | open a PNG, use the ABA simulator | external | **REQUIRED_BY_PAYWAY** | cannot remove; `sandbox info` states the simulator's limits (2 accounts, 90-day expiry, no declines) |
| 16 | Confirm the result | re-type the transaction id into `check-transaction`, then into `transaction-detail --wait` | manual copy ×2 | **AUTOMATABLE** | `transaction current` sticky id (non-TTY usable) |
| 17 | Decide whether to fulfil | compare amount/currency/id by eye | manual reasoning | **AUTOMATABLE** | `transaction verify --expect-amount --expect-currency --expect-status` → exit 0/5 |
| 18 | Understand what just happened | read `journal timeline` | works | — | unchanged |
| 19 | (on failure) Find the cause | run `explain <code>` | may return a **wrong-family** answer (N-02) or "not published" (N-01) | **REPOSITORY_LIMITATION** | `explain --operation`; endpoint-keyed registry |
| 20 | (on failure) Reproduce the request | read `src/domains/*` | hours | **REPOSITORY_LIMITATION** | `request inspect --show-preimage` |

**Counts:** 20 interactions · **7 REQUIRED_BY_PAYWAY/EXTERNAL_PROCESS/SECURITY** (cannot and should not be automated — they must be made *explicit*) · **9 REPOSITORY_LIMITATION** (all removable) · **4 AUTOMATABLE**.
**First pass said** 14 steps / 8 manual. The interaction-level count is 20 / 11 manual — the first pass under-counted by grouping sub-steps. **Target: 12 interactions / 4 manual**, and every remaining manual step is externally required.

Scenario B (QR): the four-way capability split remains the dominant cost; `qr <subcommand>` + `products --output json` reduce "read 5 documents" to "run 1 command". Scenario C (webhook) remains the strongest journey; `webhook listen --expect/--fail-on` makes it a CI gate. Scenario D (production) remains prose-only until `go-live check`.

---

# 8. Developer Experience Metrics

Baseline values are measured where measurement was possible in this audit; otherwise `MEASUREMENT REQUIRED` with the method stated.

| Metric | Baseline (measured) | Target | Measurement method |
|---|---|---|---|
| Clone → successful local validation (`npm ci && npm run build && npm run typecheck && npm test && npm run lint`) | **FAILS** (typecheck exit 2 pre-build; `vitest` 1 failure on Linux) | **PASSES** on Linux and Windows | CI run on a clean checkout |
| Clone → first credential-free success (`demo --check`) | works; `--check` does not exist | exit 0 with `--output json` | scripted |
| Credentials → first sandbox API request | **MEASUREMENT REQUIRED** (needs sandbox credentials + a stopwatch) | ≤ 5 commands after `.env` is filled | timed golden-path run, recorded quarterly |
| Manual configuration values to enter | 3 (merchant id, api key, callback url) + RSA PEM for 5 products | unchanged (irreducible) | count |
| Configuration variables discoverable without reading source | **6 of ~32** (19%) | **100%** via generated `.env.example` + `config --json` | `env-registry` conformance test |
| Documents required for initial integration | 3 (README, QUICKSTART, one guide) — good | 3, with generated reference replacing the 46 KB hand-written one | doc-tree audit |
| Commands required for first verified transaction | 6 (`init`, `setup-webhook`, `doctor`, inline `node -e`, `generate-qr`, `check-transaction`, `transaction-detail`) = **7 including the inline script** | **5** | golden-path script line count |
| Interactions in Scenario A | **20 (11 manual)** | **12 (4 manual)** | §7 table |
| Ambiguous configuration choices | ≥4 (`PAYWAY_ENV` vs `PAYWAY_SANDBOX` vs `baseUrl` vs profile `environment`; `--lifetime` unit; `PayWay` vs `sdk`; `.env` vs profile) | **0 undocumented**; each has one canonical answer in `config --json` provenance | `config --json` review |
| Configuration errors detected before an API request | **MEASUREMENT REQUIRED** — method: count of `doctor` checks that fail closed pre-request ÷ count of configuration error classes. Estimated **~40%** (presence/shape checks only; no coherence, TLS, DNS, reachability) | **≥90%** | `doctor` check-registry coverage vs the configuration error taxonomy |
| PayWay deterministic rules validated locally | **MEASUREMENT REQUIRED** — method: rules in `rules.yaml` with `deterministic: true` and an enforcement point ÷ total deterministic rules. Estimated **~65%** (strong on ids/amounts/URLs/lifetimes; missing QR payment-option membership, pre-auth method restriction, merchant_id length, items cap wrong, currency case) | **100% of deterministic official rules** | `rules-conformance` test (every deterministic official rule names an enforcement point) |
| CLI commands with machine-readable output | **37 of ~86 have `--json`; 2 of ~86 have `--output`** (43% / 2%) | **100%** of non-exempt commands | registry sweep |
| Commands whose JSON carries a schema version | **2 of ~86 (2%)** | **100%** | registry sweep |
| Errors providing actionable remediation | registry-backed codes: **96 of 96 have a hint**; but **4 QR codes say "not published"** and **6 numeric codes can answer for the wrong endpoint** | **100% with a `correction`, 0 wrong-family defaults, 0 "not published" where official docs publish** | `explain` golden tests per endpoint |
| Time to diagnose a `code 1` wrong-hash failure | **MEASUREMENT REQUIRED** — method: timed exercise with 5 developers. Estimated **30–120 min** (requires reading `src/domains/*`) | **≤ 5 min** via `request inspect --show-preimage` + `diagnose --symptom wrong-hash` | timed exercise |
| Percentage of official rules with recorded evidence | **0%** (provenance is in comments; no evidence files, no URLs, no retrieval dates) | **100% of `source: official` rules** | `rules-conformance` test |
| Tarball unpacked size / file count | **5,198,011 B / 210 files** | **≤ 3.5 MB / ≤ 130 files** | `npm pack --dry-run` budget assertion in CI |
| Tracked files that are generated/internal/duplicated | **~830 of 1,590 (52%)** | **≤ 15%** | `repository-manifest` gate |
| Library-only runtime dependencies | **6** | **≤ 2** | `npm ls --omit=dev` in a consumer smoke test |
| Agent context required before first correct action | `AGENTS.md` 213 lines + `.agents/AGENTS.md` 126 + `HANDOFF.md` 336 lines/107 KB (mandated) ≈ **~28k tokens mandated** | **≤ 2,500 tokens always-loaded**, layered on demand | `agents-md` test (line/byte budget) |

---

# 9. Final SDK Architecture

## 9.1 Public API surface (stable, versioned)

**Root specifier `aba-payway-ts`** — everything a merchant server needs to take payments:
```ts
// client
export class PayWay { … }                 // composition root; the canonical client
export const sdk                          // convenience facade — see §9.2 for the documented division
// core types
export type { PayWayConfig, ResolvedPayWayConfig, RequestCallOptions, PayWayHookMeta }
export type { TransactionState, TransactionEvent, PaymentOutcome, GatewayStatus }
export type { PayWayErrorRecord, ErrorCategory, ErrorSeverity }
export type { Advisory }
// errors
export { PayWayError, PayWayConfigError, PayWayValidationError, PayWayAPIError,
         PayWayBusinessError, PayWayNetworkError, PayWayTimeoutError,
         PayWayRateLimitError, PayWaySignatureError, PayWayWebhookError }
// domain types + enums (generated from rules.yaml where external)
export type { CreateTransactionParams, GenerateQrParams, … }
export { PAYMENT_STATUS_CODES, PAYMENT_STATUS_LABELS, BASE_URLS, ENDPOINTS }
// auth primitives (needed by merchants implementing their own receivers)
export { generateHmac, inspectHmac, encryptMerchantAuth,
         verifyCallbackDetailed, verifyCallbackSignatureRaw, signCallbackBody }
// lifecycle helpers (the fulfilment decision)
export { normalizeTransactionState, assertFulfillable, retryPolicyFor, paymentNextStep }
// observability
export { createPayWayLogger, sanitizeForLog, redact }
export type { LogSink, JournalSink, JournalEvent }
// callbacks
export { classifyCallback }
```

**Subpath specifiers:**
| Specifier | Contents | Consumer |
|---|---|---|
| `aba-payway-ts/webhook` | receiver server, JSON/SQLite stores, forwarder, tunnel, fixtures | merchant webhook apps |
| `aba-payway-ts/khqr-offline` | EMVCo TLV + CRC-16 generation/inspection, KHQR config — **no HTTP, no keys** | POS/offline |
| `aba-payway-ts/diagnostics` | doctor runner + check registry, rules engine, explain, diagnose, go-live, request-inspect | CI, tooling, agents |
| `aba-payway-ts/testing` | mock gateway, harness, fixture loader, simulator | devDependencies only |
| `aba-payway-ts/cli` | `runCli(argv)` | embedders |

**Removed from the root specifier** (breaking, 2.0.0): `startMockPaywayServer`, `getMockPaywayUrl`, `generateMockSession`, `runTestSuite`, `DEFAULT_TEST_CASES`, `formatTestReport`, journal SQLite sinks, `StorageService`, webhook server internals, `openImage`. All remain available via subpaths.

## 9.2 `PayWay` vs `sdk` — the documented division (resolving first-pass F8)

The first pass flagged the overlap but did not resolve it. Decision:

| | `PayWay` (class) | `sdk` (facade) |
|---|---|---|
| **Role** | The API client. One method per PayWay operation, gateway-shaped parameters, gateway-shaped results | A **guided workflow** layer for the two most common jobs |
| **Returns** | The gateway envelope (plus typed discriminators) | `TransactionSession` / `HandleResponseResult` — normalized, opinionated |
| **Use when** | You are building a payment integration and want control | You want the shortest correct path and accept the SDK's normalisation |
| **Do not use when** | You want session semantics | You need a field the facade does not model |
| **Rule** | **`PayWay` is canonical.** Every `sdk` method documents the `PayWay` call it wraps | The facade never adds behaviour the class lacks |

Enforcement: a test asserts every `sdk` method's JSDoc names the underlying `PayWay` call, and that `sdk` exposes no gateway operation the class does not. `QUICKSTART.md` uses **one** of the two per snippet, not both (today §6 uses both in six lines).

## 9.3 Internal types vs leaked implementation details

| Leaks today | Decision |
|---|---|
| Domain methods return unions including `ErrorStatus` (e.g. `PurchaseQrResponse \| ErrorStatus \| PurchaseHostedHtmlResult`) | **Keep the union but add a discriminator helper** `isGatewayError(result)` and document that a non-throwing error envelope is possible. Changing to throw-only would break the local-form path, which legitimately returns HTML. Do **not** hide it |
| `components['schemas'][…]` generated types in public signatures | **Keep.** They are the most accurate description available, and re-exporting them as aliases (`export type GenerateQrResponse = components['schemas']['GenerateQrResponse']`) gives stable names without a parallel hand-written model |
| `rawBody`, `lastCorrelationId`, `lastTraceId`, `apiBaseUrl` | **Keep — deliberately.** Debuggability requires raw context. Document them as "raw escape hatches, shape not guaranteed" |
| `MUTATION_ENDPOINTS`, `rateLimitRules`, `GATEWAY_CODE_HINTS` | **Keep exported** (they are policy consumers need), but source them from `rules.yaml` so there is one definition |
| Mock server, simulator, test harness | **Remove** from root (N-13, §9.1) |
| `explain-code.ts` internals | **Move to `core/errors.ts`**; the CLI renders |

## 9.4 Client initialization (final)

```ts
const payway = new PayWay({
  merchantId, apiKey,                        // required for merchant calls
  environment: 'sandbox' | 'production',     // default 'sandbox'
  publicKeyPem,                              // required iff a product needs RSA
  defaultCurrency,                           // NEW: explicit; never silently USD (N-05)
  tlsCaFile,                                 // NEW: replaces TLS bypass (P0-04)
  strictValidation,                          // REDEFINED: fail on official deterministic rules only (§10)
  advisoryIgnore: ['QR-016'],                // NEW: per-advisory suppression
  onAdvisory,                                // NEW: route advisories to the merchant logger
  mutationRetryPolicy, circuitBreaker, rateLimitRules, timeout, maxRetries, retryDelayMs,
  journal, logLevel, logFormat, logSink, redactHookBodies,
  onRequest, onResponse, onError,
});
```
Construction rules (all already true, now specified): partner-only credentials may construct and reach partner endpoints while merchant calls fail clearly before signing; `timeout`/`maxRetries`/`retryDelayMs` are range-validated at the boundary; **new:** the constructor records `environment` and `endpoint` together and exposes `payway.environmentContext` for the guard (§12) — one place, no re-derivation.

## 9.5 Extensibility (unchanged — it is already right)

`onRequest`/`onResponse`/`onError` with `PayWayHookMeta {correlationId, attempt, durationMs, traceId}`; pluggable `LogSink`, `JournalSink`, `WebhookStorage`; `baseUrl` override; per-endpoint `rateLimitRules`; `mutationRetryPolicy`. **Additions:** `onAdvisory`, `tlsCaFile`, `advisoryIgnore`, `checkoutPluginSrc` (N-09).

---

# 10. Final Validation Architecture

## 10.1 The six validation kinds, and where each runs

| Kind | Question | Where | When | Fails as |
|---|---|---|---|---|
| **1. Syntactic** | Is this the right *type/shape*? (string, positive finite number, non-empty, URL parses, PEM parses) | `core/validation/syntactic.ts` | Immediately on entry to a domain method, before any normalisation | `PayWayValidationError` (`PW-VAL-*`), exit 1 |
| **2. Semantic** | Is this *coherent*? (cross-field: `google_pay` ⇒ token; `tokenFlag` ⇒ `ctid`+`frequency`; `type: pre-auth` ⇒ method restriction N-10; payout entries total = amount) | `core/validation/semantic.ts` — **one home for the three existing hand-coded conditionals plus new ones** | After syntactic, before normalisation | `PayWayValidationError`, exit 1 |
| **3. PayWay deterministic rules** | Does this violate a *documented gateway* rule? (id ≤20 + charset; amount ≥ floor; lifetime bounds in the canonical unit; currency ∈ {KHR,USD}; URL public HTTPS; items ≤50; merchant_id ≤30; beneficiary whitelisted in sandbox) | `core/validation/rules.ts`, driven by `rules.yaml` entries with `deterministic: true` | After semantic, before normalisation | `source: official` ⇒ **HARD** `PayWayConfigError`; `source: sandbox|relay|repo` ⇒ **ADVISORY** |
| **4. Environment** | Am I allowed to do this *here*? (production guard, sandbox-only refusal, credential↔endpoint coherence, TLS bypass active) | `core/env-guard.ts` | Before transport, after validation | `PayWayGuardError` (`PW-ENV-*`/`PW-SEC-*`), exit 6 |
| **5. Runtime API response** | Did the gateway answer in a shape I can use? (narrow presence/type assertion of dereferenced fields only — N-08) | `transport/assert-shape.ts` | After parse, before returning to the caller | `PayWayAPIError` `PW-API-SHAPE` with correlation id |
| **6. Business state** | May I act on this result? (fulfilment requires `approved` **and** amount/currency/id match; no fulfilment on `unknown`/`pre_auth`/`refunded`) | `core/lifecycle.ts#assertFulfillable` | In merchant code, called by the CLI's `transaction verify` and by the reference app | Returns a result object; the CLI maps it to exit 5 |

## 10.2 The pipeline (fixed order, no shortcuts)

```
developer input
   ↓ 1 syntactic          (core/validation/syntactic)
   ↓ 2 semantic           (core/validation/semantic — cross-field)
   ↓ 3 PayWay rules       (core/validation/rules ← rules.yaml)
   ↓    advisories emitted (core/advisories — logger-routed, per-client dedupe)
   ↓ 4 environment guard  (core/env-guard) ←── refuse before any network I/O
   ↓ normalisation        (domains/buildXRequest — formatAmount, base64, req_time, lifetime unit)
   ↓    normalization[] record produced (each entry: field, from, to, ruleId, source, conflict?)
   ↓ signature            (auth/hmac — generateHmac / inspectHmac; primitives only, N-11)
   ↓ transport            (transport/fetch — retry policy by MUTATION_ENDPOINTS, breaker, rate limit, cid, TLS CA)
   ↓ 5 response assertion (transport/assert-shape)
   ↓ classification       (transport/classify → typed result | PayWayError with explain())
   ↓ domain response
   ↓ 6 business state     (merchant code: assertFulfillable)
```

**Invariants:**
- **Nothing reaches signing or the network before steps 1–4 pass.** This is the property that makes `request inspect` trustworthy: it runs steps 1–4 + normalisation + signing and stops, so its output *is* what would be sent.
- **`request inspect` and execution share one code path** (`buildXRequest`), proven by a diff test. Inspection cannot drift from execution because it is execution minus transport.
- **Advisories never become hard errors unless `source: official` AND `deterministic: true`.** This is the fix for P0-02 and the redefinition of `strictValidation`.
- **`strictValidation` redefined:** *"fail locally on any officially documented deterministic rule violation"*. It no longer means "escalate every repository opinion". Migration: the old behaviour is available for one minor as `strictValidation: 'legacy'` (deprecated, stderr notice) so existing users are not silently loosened.

## 10.3 What must be validated before signing (the complete list)

Syntactic: `transactionId` non-empty string; `amount` finite positive number; `currency` string; URLs parse; PEM parses; `lifetime` positive integer.
Semantic: `google_pay` ⇒ `googlePayToken`; `tokenFlag` ⇒ `ctid` and (`CITR_FIX` ⇒ `frequency`); `type: pre-auth` ⇒ `paymentOption ∈ {cards, abapay_khqr, abapay_khqr_deeplink}`; payout entries total = amount; payout entry keys match the endpoint's documented shape (`{acc,amt}` vs `{account,amount}`).
Rules: `tran_id` ≤20 + charset; `merchant_id` ≤30; amount ≥ per-currency floor; amount precision (USD ≤2dp, KHR integer); lifetime within bounds **in the canonical unit**; currency ∈ {KHR,USD} after case normalisation; callback/return URLs public HTTPS; `items` ≤50 (and ≤500 encoded chars on generate-qr); sandbox beneficiary whitelisted; `qr_image_template` ∈ known set; `payment_option` ∈ official ∪ legacy for the endpoint.
Environment: guard (§12).

## 10.4 What must NOT be validated locally

- **Profile-dependent enablement** (official code 23) — the gateway decides; local rejection would be wrong (R-A).
- **Settlement/fee/FX logic** — merchant agreement specific.
- **Response exhaustiveness** — only dereferenced fields are asserted (N-08); full schema validation would produce false failures because the observed shape variety exceeds the schemas.
- **Anything whose only source is a mirror, an archived spec, or a single unrepeatable observation** — advisory at most, tagged with its source.

---

# 11. Final Configuration Architecture

## 11.1 Locations and precedence (final, implemented once)

```
1  CLI flag                      (--profile, --currency, --lifetime-unit, --confirm-production, …)
2  Operation-scoped env var      (PAYWAY_MERCHANT_ID, PAYWAY_API_KEY, …)
3  Project config file           (.payway/config.json — non-secret only)
4  Project .env                  (loaded by the CLI only; the library never reads files)
5  User profile                  (~/.config/aba-payway-sdk/profiles.json — fallback-fill only)
6  User config                   (~/.config/aba-payway-sdk/config.json — non-secret defaults)
7  SDK defaults                  (core/config/defaults.ts)
```
**Resolved by one function** `config/resolve.ts → ResolvedConfig` returning `{values, provenance: Record<key, {source, sourceDetail}>}`. `payway config --output json` prints it. The first pass's finding stands: today precedence differs by layer (library = explicit→env; CLI = explicit→env(incl. `.env`)→profile-fallback) and neither order is written as code. After this change there is one order and it is observable.

## 11.2 The eight ambiguous questions, answered

| Question | Decision | Rationale |
|---|---|---|
| Repository-local or user-global configuration? | **Both, split by content.** Non-secret project settings → `.payway/config.json` (committable). Secrets → env vars or the user-global profile store. **Never** a secret in a committable file | A secret in a repo-local file will be committed; a project setting in a user-global file will not travel with the code |
| Should sandbox and production credentials coexist? | **Yes, in separate named profiles, each carrying `environment`.** Coherence is enforced (CRED-003): a sandbox profile cannot resolve against the production endpoint | Merchants genuinely need both; the danger is *mixing*, which is a checkable property, not a storage property |
| How are multiple merchants handled? | **One profile per (merchant, environment)** — e.g. `acme-sbx`, `acme-prod`, `beta-sbx`. `--profile` per command, `PAYWAY_PROFILE` per shell, `defaultProfile` per user. Cap raised from 8 to 32 | The existing 8-profile cap is arbitrary and blocks agencies/ISVs, which are a real PayWay audience |
| How are different projects handled? | `.payway/config.json` per project selects `profileRef` and non-secret defaults; `.env` per project supplies secrets locally | Project identity is a directory property; credential identity is a profile property |
| What happens when env vars conflict with config? | **Env wins over file** (levels 2 > 3 > 4), and the conflict is **reported**: `config --output json` includes `provenance` and `doctor CFG-010` warns when a file value is shadowed | Silent shadowing is how a developer debugs the wrong credentials for an hour |
| How does CI configure the SDK? | **Env vars only** (level 2), with `PAYWAY_ENV=sandbox` mandatory and `PAYWAY_DOCTOR_LIVE=0` default. Production credentials in CI require `--confirm-production` supplied from a secret, never from a flag default | CI is non-interactive; env is the only sane channel; the guard must still apply |
| How does an AI agent determine the active environment? | **`payway env current --output json`** → `{environment, endpoint, credentialSource, profile, guard:{production, requireConfirm}, sdkVersion}`. Agents MUST call it before any mutating action (guardrail) | One deterministic command replaces inference from `.env` contents |
| What if `.env` is inside a git working tree? | `configure`/`init` refuse to write secrets there without `--allow-tracked-env`; `doctor SEC-001` makes a tracked `.env` a **blocker** | The repository's own `check-repository.mjs` already forbids tracked `.env`; the CLI should too |

## 11.3 Schema and validation timing

- `.payway/config.json` is validated against a JSON Schema compiled by `ajv` (already a runtime dependency) at **load time**, with **unknown keys as errors** — a typo'd key is a configuration bug, not a silently ignored one.
- Env vars are validated against the generated `env-registry` at load time (type, enum, range, secret-ness).
- Profiles are validated at activation.
- **All three run before any domain call**, and their failures are `PW-CFG-*` (exit 1) with the offending key, its source, and the fix.

## 11.4 Migration behaviour

- `.env` remains fully supported forever (it is the ecosystem convention).
- `.payway/config.json` is **optional**; nothing requires adopting it.
- `init` writes `.env` + `.env.example`; `configure --migrate` can generate a `.payway/config.json` from an existing `.env`, moving only non-secret keys and printing a diff first.
- Precedence changes are **breaking** and therefore land at 2.0.0 with a migration note; for one minor, `PAYWAY_CONFIG_PRECEDENCE=legacy` restores today's behaviour and emits a stderr deprecation.

---

# 12. Environment and Production Safety

## 12.1 Environment identity — how it is determined (one function, no re-derivation)

```ts
// core/env-guard.ts
resolveEnvironmentContext(config, processEnv): {
  name: 'sandbox' | 'production' | 'custom';
  endpoint: string;                       // the URL that will actually be called
  endpointSource: 'config.baseUrl' | 'PAYWAY_BASE_URL' | 'PAYWAY_ENV(url)' | 'BASE_URLS[name]';
  credentialSource: 'flag' | 'env' | 'dotenv' | 'profile' | 'missing';
  profileEnvironment?: 'sandbox' | 'production';
  coherence: 'ok' | 'mismatch' | 'unknown';   // profile env vs endpoint
  guard: { production: boolean; requireConfirm: boolean; bypassActive: boolean };
}
```
Rules:
1. **The endpoint is the authority, not the label.** If `baseUrl`/`PAYWAY_BASE_URL`/`PAYWAY_ENV=<url>` resolves to `checkout.payway.com.kh`, the environment **is** production regardless of `PAYWAY_ENV=sandbox`. This is the specific protection §18 asks for: an override cannot silently turn sandbox configuration into production configuration.
2. **A mismatch is a hard stop, not a warning.** `coherence: 'mismatch'` (e.g. a profile marked `sandbox` with a production endpoint, or `PAYWAY_ENV=production` with a sandbox host) refuses every mutating command with `PW-ENV-002` (exit 6) and is a `doctor` **blocker** (CRED-003). Read-only commands proceed with a stderr warning.
3. **`custom` is a first-class value** for on-premises/staging gateways (`allowPrivateCallbackHosts` already implies this audience). `custom` behaves like production for guard purposes — the safe default.
4. **UAT/pre-production:** PayWay documents two environments only (`BASE_URLS` matches official docs). A UAT tier is therefore modelled as `custom` with an explicit `guard.requireConfirm: true`, **not** as a third built-in environment. Inventing one would be unsupported behaviour presented as supported.

## 12.2 Production protections, per operation class

| Class | Operations | Sandbox | Production |
|---|---|---|---|
| **Read-only** | `transaction get/detail/list/by-ref`, `exchange-rate`, `explain`, `docs`, `status`, `journal *`, `doctor`, `config`, `env current`, `capabilities`, `request inspect`, `sandbox info`, `rules` | allow | allow |
| **Creates an attempt** | `qr create/offline/customer/soundbox`, `checkout create/form`, `payment-link create`, `cof link-account/link-card` | allow; warn on a locally-seen duplicate `tran_id` | allow with confirmation; require a fresh `tran_id`; journal mandatory |
| **Moves money or terminates** | `refund create`, `payout create`, `pre-auth complete/complete-with-payout/cancel`, `transaction close`, `payment-link void`, `cof token remove`, `beneficiary add/update-status` | confirm once (`-y` acceptable) | **`--confirm-production` required; `-y` never substitutes**; print merchant id + amount + currency + transaction id + endpoint first; TTY additionally requires typing the merchant id |
| **Sandbox-only** | `sandbox test-cards/beneficiaries/test/scenarios`, `demo` | allow | **refuse** (exit 6) |
| **Unverified capability** | `qr soundbox`, `self-activation *` | allow with a stderr `UNVERIFIED` notice | **refuse** unless `--allow-unverified` **and** `--confirm-production` |

## 12.3 Interactive vs non-interactive production acknowledgement

- **Interactive (TTY):** red banner + typed merchant-id confirmation. `--confirm-production` short-circuits the typing but not the banner.
- **Non-interactive:** `--confirm-production` is the **only** path. No prompt, no hang, no implicit yes. `PAYWAY_CONFIRM_PRODUCTION=1` is accepted for automated production operations and is **reported** by `doctor SEC-005` (warning) and recorded in the journal, so its use is auditable rather than invisible.
- **Machine output:** every mutating command's JSON carries `context.guard = {environment, required, supplied, policy, bypassActive}` so an agent can verify the guard state from the response rather than trusting its own intent.

## 12.4 What is explicitly NOT protected (honest limits)

- The **SDK library** cannot stop a merchant's own server code from calling production — it has no interactive channel. It provides `payway.environmentContext`, `assertOperationAllowed()`, and `retryPolicyFor()`; using them is the merchant's choice. Documented as such rather than over-claimed.
- **Credential validity** cannot be proven without a network call; `doctor --live` is the only proof, and it spends quota.
- **ABA-side profile enablement** (code 23) cannot be pre-checked.

---

# 13. Credential and Secret Threat Model

## 13.1 Credential inventory (every secret class found in the repository)

| Credential | Where it lives | Where it must never appear |
|---|---|---|
| `PAYWAY_API_KEY` (merchant HMAC key, 40-hex observed) | `.env`, profile store, process env | argv, logs, journal (any mode), JSON output, fixtures, git, screenshots, agent/provider payloads, error messages, `request inspect` (including the preimage — the key is the HMAC input, not part of the concatenation, and must stay that way) |
| `PAYWAY_PARTNER_API_KEY` | `.env`, profile store | same as above |
| RSA **public** key (`PAYWAY_RSA_PUBLIC_KEY`) | `.env` (multi-line quoted), profile store | Not secret, but **truncation-sensitive**: never silently truncated in logs; `doctor CFG-004` validates shape and 1024-bit length |
| RSA **private** key | Never held by this SDK (encryption is to ABA's public key) | Must never be requested, accepted, or stored by any command; a `--private-key` flag must not exist |
| `merchant_auth` ciphertext | request bodies | logs, journal `full` mode is the only place a body appears at all, and `sanitizeForLog` masks it; never in `digest` |
| `hash` / `b4hash` preimage | request bodies; `inspectHmac` output | logs and journal always; stdout only with `--show-preimage`; the preimage is key-free by construction and must remain so |
| `pwt` (PayWay token), `ctid`, `request_id` | linked-token store, CoF responses | `pwt` never in argv/logs/JSON; `ctid`/`request_id` are identifiers — masked by default in JSON, revealed with `--reveal-ids` |
| `X-PAYWAY-HMAC-SHA512` callback signature | webhook captures | logs, journal `digest`, `webhook list` output; visible only in `webhook show --reveal-signature` |
| Card PAN / CVV / expiry | sandbox test-card registry (public, published by ABA) | Real PANs anywhere. Sandbox cards are published test data and may be printed; the registry must be marked `sandbox-only` and refuse to load in production (§12.2) |
| Agent provider API key (`PAYWAY_AGENT_API_KEY`) | process env **only** | never stored on disk (already enforced), never in a session export (already scrubbed), never in argv |
| Committed sandbox demo credentials (`ec476910` / 40-hex) | `payway-boilerplate/…/dist/*.postman_collection.json` | **Owner-authorized for public redistribution** (RELEASE-READINESS item B, 2026-10-01). Residual risk: quota abuse and scanner blindness (a bare 40-hex string in JSON). Mitigation: keep the authorization record, add a scanner rule that *recognises* it as allow-listed rather than invisible, and rotate if abuse is observed |

## 13.2 Leakage channels and the safe pattern for each

| Channel | Risk | Safe pattern (target) | Enforcement |
|---|---|---|---|
| `.env` | committed by accident | `.gitignore` explicit (not `*key*.txt` globs); `init`/`configure` refuse to write into a git tree without `--allow-tracked-env`; `doctor SEC-001` blocker; `check-repository` gate | test + CI gate |
| Shell history | secrets in argv | every secret-bearing flag gains `--*-file` and `--*-stdin`; `doctor SEC-004` warns when a secret was passed inline; guardrail MUST NOT #11 | flag census test |
| Process list (`ps`) | same as above | same | same |
| CI logs | env echo, failure dumps | never `echo` env; error records carry `redaction:{applied[]}`; CI jobs set `PAYWAY_LOG_LEVEL=error` | workflow lint |
| Debug logs | `logLevel: trace` | `sanitizeForLog` on every hook and debug path (already true, verified); `trace` refused in production without `PAYWAY_ALLOW_TRACE_IN_PRODUCTION=1`; `redactHookBodies === false` triggers a `doctor SEC-006` warning in production | test + doctor check |
| Exception objects | `rawBody` on `PayWayAPIError` | `rawBodyRedacted` via `sanitizeForLog`; `toJSON()`/`explain()` never emit an unredacted body | canary sweep |
| JSON output | a machine contract that prints everything | redaction is a property of the envelope, not of each command: `output/redact.ts` runs on every document; `redaction.applied[]` states what was withheld | contract sweep |
| `request inspect` | the preimage | key-free by construction; `--show-preimage` opt-in; stdout-only; never journaled; canary-tested | canary sweep |
| Fixtures | real captured traffic | every fixture carries `provenance`; a fixture containing a 40-hex secret or a PEM private block fails the fixture lint; captured real bodies may only enter `fixtures/` after `sanitizeForLog` | fixture lint |
| Git commits | history | public history is a single orphan commit (verified) — clean by construction; gitleaks scans `fetch-depth: 0` and blocks | existing CI gate |
| Screenshots / terminal recordings | human mode | masked rendering (`ec47••••`) is the **default** in human mode too, so a screenshot is safe by default | snapshot tests |
| AI-agent context | prompts to a third-party provider | `src/agent/privacy.ts` redacts before any provider call (already implemented); session exports scrubbed; guardrail MUST #6; skills declare `prohibited_tools` including "write credentials to any file, log, or provider payload" | existing agent privacy tests + skill schema test |
| Prompt history / session files | agent session storage on disk | sessions stored under the data root with `0600`; `agent sessions export` scrubbed; `doctor DATA-003` blocks a data root inside a git tree | existing + doctor |
| Generated docs / packaged corpus | internal dossiers leaking into the tarball | `assertPublicSources()` (already implemented and verified) + `check:public-docs` + the new `repository-manifest` allow-list | existing + new gate |

## 13.3 Masking: one function, one format

`first4 + '•'.repeat(min(len-8, 16))` for identifiers and keys; `***HIDDEN***` for values inside structured logs/journals (matching the existing `sanitizeForLog`). Exported as `redact(value, policy)` with policies `log | journal-digest | json-output | share-bundle | human`. **One implementation, five policies, tested with canaries for every credential class in §13.1.** The first pass noted two competing formats; this resolves it: `redact()` for identifiers, `sanitizeForLog()` for structures, and `sanitizeForLog` delegates to `redact` so they cannot diverge.

---

# 14. Final CLI Architecture

## 14.1 Design review of the first-pass proposal (§12 tests applied)

| Test | Result |
|---|---|
| Too many commands? | **Yes.** ~25 groups proposed; 8 commands rejected below |
| Overlapping commands? | **Yes.** `validate` vs `doctor` vs `go-live`; `transaction explain` vs `diagnose` vs `journal explain`; `products` vs `capabilities`; `logs redact` vs `logs share` vs `journal show --redact` |
| Unclear naming? | Partly — `sandbox test` vs `demo` vs `test` (three meanings of "test" today); resolved by `sandbox test` (live, guarded) / `demo` (simulated) / deleting the ambiguous `test` name |
| Commands exposing implementation details? | `qr deeplink` (wraps one pure function), `logs redact` (a property, not an action) → rejected |
| Commands that should be SDK functions? | `assertFulfillable`, `retryPolicyFor`, `normalizeTransactionState`, `classifyCallback` — all SDK; the CLI only exposes them via `transaction verify` and `request inspect` |
| Commands impossible to support reliably? | Any `settlement` command (no PayWay API); any command claiming to detect a fund reversal (N-04) → rejected, kept as evidence-required gates |
| Commands requiring undocumented PayWay behaviour? | `qr soundbox`, `self-activation *` — retained but marked `verified: spec` and gated in production (§12.2) |

## 14.2 Final hierarchy — 13 nouns + 6 standalone

```
payway
├── init                      V1 REQUIRED   project bootstrap
├── doctor                    V1 REQUIRED   "is my environment correct?"
├── diagnose                  V1 REQUIRED   "why did this operation fail?"
├── capabilities              V1 REQUIRED   machine-readable command/product catalogue
├── explain                   V1 REQUIRED   "what does this code mean?" (endpoint-scoped)
├── version                   V1 REQUIRED
│
├── config                    V1 REQUIRED   resolved configuration (read) + safe writes
│   ├── show  (--output json, provenance per key)
│   ├── set   (--scope project|user, masked for secrets, --dry-run)
│   └── list-profiles / use-profile / add-profile      ← absorbs today's `profiles`
├── env                       V1 REQUIRED
│   ├── current               V1 REQUIRED
│   ├── use                   V1 REQUIRED
│   └── guard                 V1 OPTIONAL   show/set the guard policy
├── request                   V1 REQUIRED
│   ├── inspect               V1 REQUIRED   what would be sent (no network)
│   ├── sign                  V1 OPTIONAL   sign an arbitrary field set (debugging)
│   └── send                  V1 OPTIONAL   inspect + execute (--dry-run alias of inspect)
├── qr                        V1 REQUIRED
│   ├── create                V1 REQUIRED   online generate-qr
│   ├── offline               V1 REQUIRED   local EMVCo KHQR (no network, no keys)
│   ├── customer              V1 OPTIONAL   Customer-Module dedicated QR
│   ├── soundbox              V1 OPTIONAL   request-qr (verified: spec)
│   ├── inspect               V1 REQUIRED   decode a payload or PNG
│   └── templates             V1 OPTIONAL
├── checkout                  V1 REQUIRED
│   ├── create                V1 REQUIRED   purchase (hosted / deeplink)
│   └── form                  V1 REQUIRED   local HTML form, no API call
├── payment-link              V1 REQUIRED   create | get | void | image | pushback
├── cof                       V1 REQUIRED   link-account | link-card | charge | token {list,renew,details,remove}
├── transaction               V1 REQUIRED
│   ├── get  detail  list  by-ref  poll  close  batch
│   ├── current               V1 REQUIRED   sticky id, non-TTY usable
│   └── verify                V1 REQUIRED   assert amount/currency/status → exit 0/5
├── refund                    V1 REQUIRED   create | check
├── payout                    V1 REQUIRED   create | beneficiary {add,list,update-status}
├── pre-auth                  V1 OPTIONAL   complete | complete-with-payout | cancel
├── webhook                   V1 REQUIRED
│   ├── listen                V1 REQUIRED   (replaces `setup-webhook`)
│   ├── trigger  verify  resend  list  show  status  stop     V1 REQUIRED
│   ├── fixtures              V1 OPTIONAL   write the corpus to disk
│   └── conformance           V1 OPTIONAL   `verify --against <url>` as a receiver test
├── journal                   V1 REQUIRED   timeline | stats | reconcile | explain | anomalies | show | prune
├── sandbox                   V1 REQUIRED
│   ├── info                  V1 REQUIRED   what sandbox is / cannot reproduce
│   ├── verify                V1 REQUIRED   prove this sandbox works end-to-end
│   ├── scenarios             V1 OPTIONAL   scripted lifecycle scenarios
│   ├── test-cards            V1 REQUIRED   (sandbox-only, refuses production)
│   └── beneficiaries         V1 REQUIRED   (sandbox-only)
├── go-live                   V1 REQUIRED
│   ├── check                 V1 REQUIRED
│   ├── report                V1 OPTIONAL
│   └── diff                  V1 OPTIONAL
├── docs                      V1 REQUIRED   list | <topic> | search
├── status                    V1 OPTIONAL   code tables (human reference)
├── demo                      V1 REQUIRED   credential-free simulated journey
└── (retained, unchanged)  session · onboard · ask · agent · mcp · skills · completions · self-activation
```

**REJECTED (with reason):**

| Rejected | Reason |
|---|---|
| `payway rules list/check` | Consumers are other commands and generated docs. No user job. Rules surface via `request inspect`, `doctor`, `explain`, `go-live` |
| `payway products` | Folded into `capabilities --products --output json` |
| `payway validate config\|request\|integration` | Overlaps three commands: config validation is `doctor`; request validation is `request inspect` (which validates as a side effect of building); integration validation is `go-live check`. **Keep today's `validate` as a hidden alias for `request inspect`-style local checks during migration, then remove** |
| `payway transaction explain` | Overlaps `diagnose --id` and `journal explain`. One question, one tool |
| `payway logs tail/redact/share` | `journal timeline --follow` covers tail; redaction is a property of every output path; sharing is `journal show --redact --out` |
| `payway sandbox reset` | `journal prune` + deleting the data root covers it; a destructive command with no unique job |
| `payway qr deeplink` | Wraps one exported pure function (`buildAbaPayDeeplink`); `qr inspect` already reports deeplinks |
| `payway webhook configure` | `webhook listen --write-env` covers it |
| `payway test` (today's mock suite) | Ambiguous with `npm test` and `sandbox test`. Becomes `demo --check` (simulated) and `sandbox verify` (live) |
| `payway exchange-rate` as top-level | Moves under `transaction`? **No — retained as `sandbox`-adjacent reference?** Decision: keep top-level `exchange-rate` (it is a real gateway operation, read-only, frequently used) but **also** expose it as `doctor --live`'s probe so its second use is not a separate command |

## 14.3 Naming rules (so the surface stays predictable)

1. **Noun first, verb second**: `transaction get`, never `get-transaction`.
2. **One noun per PayWay concept**: `qr` covers all four QR capabilities; `webhook` covers listening and the workbench.
3. **Verbs from a closed set**: `create · get · list · detail · verify · inspect · close · cancel · complete · check · show · set · use · add · remove · listen · trigger · resend · prune · reconcile`. A new verb requires a naming review.
4. **Every legacy name survives as a hidden alias** with a stderr deprecation and an entry in `capabilities.aliases`; alias parity is generated and tested, so no command can be orphaned.
5. **No abbreviations** except `cof` (industry-standard) — `tx-batch` becomes `transaction batch`.

---

# 15. CLI Command Contracts

Shared conventions are specified once in §16 (envelope, exit codes, redaction, interactive/non-interactive, agent suitability) and are **not repeated per command**; each contract below states only what is command-specific. This is a deliberate reduction from the first pass, which repeated 17 fields × 17 commands.

### `payway doctor`
- **Responsibility:** answer *"is my environment correctly configured for this route, and if not what exactly do I change?"* — nothing else.
- **Syntax:** `payway doctor [--route <demo|online-qr|hosted-checkout|payment-link|cof|payout|khqr-offline|all>] [--live|--no-live] [--check <id,…>] [--category <SYS|CFG|ENV|AUTH|NET|API|WEB|SEC|SDK>] [--severity-min <info|warning|error|blocker>] [--fix] [--timeout <ms>] [--output json|ndjson]`
- **Configuration dependencies:** none — must run with zero configuration and report exactly what is missing.
- **Interactive:** none (never prompts). **Non-interactive:** identical.
- **JSON mode:** `kind: "diagnostic"`, `data.checks[]` per §17.3.
- **stdout:** one document (machine) or the rendered report (human). **stderr:** progress, the human rendering in machine mode, advisories.
- **Exit codes:** `0` no failure above warning · `1` any `error` · `3` only network failures with no configuration error · `5` any `blocker`.
- **Validation:** `--route`/`--category`/`--severity-min`/`--output` enum-checked; `--check` ids validated against the registry (unknown id → `PW-VAL-012`).
- **Secret redaction:** masked identifiers; no credential value in any check `detail`.
- **Side effects:** none, except `--fix` (mechanical, reversible, diff printed first, never writes a secret, never touches production config without `--confirm-production`).
- **Network calls:** only with `--live` (default on when credentials exist, off when `PAYWAY_DOCTOR_LIVE=0`). **Read-only endpoints only** — `exchange-rate`. **Must never call a `MUTATION_ENDPOINTS` path**; asserted by a test against a mock transport that throws on any mutation path.
- **Production risk:** none (read-only). `--fix` in production requires `--confirm-production`.
- **Examples:** `payway doctor --route payment-link --live --output json | jq '.data.checks[]|select(.status=="fail")'`
- **Acceptance criteria:** §17.5.

### `payway request inspect`
- **Responsibility:** show exactly what would be sent — endpoint, method, content type, headers, body, per-field normalisation, signature field order with provenance, open conflicts — **without sending it**.
- **Syntax:** `payway request inspect <operation> [operation flags] [--show-preimage] [--reveal-ids] [--reveal-pii] [--no-sign] [--output json]` · `payway request sign --operation <op> --fields-json <json> [--show-preimage]` · `payway request send <operation> … [--dry-run]`
- **Configuration dependencies:** credentials for a faithful signature; `--no-sign` works with zero configuration.
- **Interactive:** none. **Non-interactive:** identical.
- **JSON mode:** the §18.2 document.
- **Exit codes:** `0` valid · `1` local validation failed (`validation.errors` populated — this is a feature) · `6` resolved environment is production without `--confirm-production`.
- **Secret redaction:** the six rules in §18.3 (hash/signature never printed; secrets absent not masked; identifiers and PII masked unless revealed; preimage opt-in, key-free, stdout-only, never journaled; a `redaction` block declares what was withheld).
- **Side effects:** none. **Network calls:** none (`send` without `--dry-run` is the only variant that calls, and it is a mutating command under §12.2).
- **Production risk:** none for `inspect`/`sign`; `send` inherits the operation's class.
- **Acceptance criteria:** a diff test proves inspection output equals the body actually sent through a mock transport for **every** operation; `--show-preimage` passes the canary sweep; `--no-sign` works with no configuration.

### `payway env current` / `env use`
- **Responsibility:** `current` — report the resolved environment, endpoint, credential source, and guard state. `use` — switch it, coherently.
- **Syntax:** `payway env current [--output json]` · `payway env use <sandbox|production|custom> [--profile <name>] [--persist] [--output json]` · `payway env guard [--output json]`
- **Exit codes:** `0` · `1` (bad target/unknown profile) · `6` (`env use production` without `--confirm-production` on a TTY, or when coherence fails).
- **Side effects:** `use --persist` writes `PAYWAY_ENV` to the project `.env` (diff printed; refuses a tracked `.env` without `--allow-tracked-env`).
- **Network:** none. **Production risk:** `use production` is the guard's front door; it must run CRED-003 coherence before persisting.
- **Acceptance criteria:** `env current --output json` returns the five fields; `env use production` with a sandbox profile exits 6 and changes nothing; a non-TTY `env use production --confirm-production` succeeds without prompting.

### `payway transaction verify`
- **Responsibility:** turn "compare it yourself" into an assertion — the business-state validation of §10.1 kind 6.
- **Syntax:** `payway transaction verify [--id <t>|--current] --expect-amount <n> [--expect-currency <USD|KHR>] [--expect-status approved] [--timeout <ms>] [--output json]`
- **Exit codes:** `0` all expectations match · `5` any mismatch or non-terminal · `2` gateway rejection · `3` network.
- **Network:** `transaction get` (read-only, retryable). **Production risk:** none.
- **JSON:** `data: {observed: TransactionState, expected: {…}, matches: […], mismatches: [{field, expected, observed, ruleId}]}`.
- **Acceptance criteria:** a mismatch exits 5 and names the field and rule; `--current` uses the sticky id and says so on stderr; no fulfilment advice is emitted on mismatch beyond "do not fulfil".

### `payway webhook listen`
- **Responsibility:** run a local, PayWay-reachable receiver that captures, verifies, classifies, persists, and optionally forwards deliveries; optionally act as a CI gate.
- **Syntax:** `payway webhook listen [--port <n>] [--host <addr>] [--storage json|sqlite|auto] [--tunnel] [--url <public-url>] [--forward-to <url>] [--forward-headers <json>] [--print-url] [--write-env] [--duration <s>] [--max-events <n>] [--expect <event>…] [--fail-on unverified|unmatched] [--output ndjson|json] [--non-interactive]`
- **Exit codes:** `0` clean stop / expectations met · `1` bad flags · `3` tunnel or bind failure · `4` an unverified or unmatched delivery when `--fail-on` is set · `5` expectation timeout · `130` Ctrl-C.
- **stdout:** `--print-url` ⇒ exactly one line, nothing else. `--output ndjson` ⇒ one envelope per event. **stderr:** the human table and "waiting…".
- **Secret redaction:** full bodies persisted only in `full` mode; `digest` allow-lists; forwarded requests carry the original signature header but never the API key; `webhook list` never prints signatures.
- **Side effects:** binds a port; optionally starts a tunnel subprocess; optionally writes `.env` (`--write-env`, diff printed).
- **Production risk:** none (local listener). `--host 0.0.0.0` warns on stderr and records it in the summary.
- **Acceptance criteria:** `--print-url` yields one line; `--expect payment.approved --duration 60 --fail-on unverified` exits 0/4/5 correctly against `webhook trigger`; duplicates report `duplicate.isDuplicate: true` keyed on `(transactionId, status)`; `setup-webhook` alias works with a stderr deprecation.

### `payway diagnose`
- **Responsibility:** *"why did this operation fail?"* — ranked, evidence-bound, never fabricated.
- **Syntax:** `payway diagnose [--symptom <s>] [--code <c>] [--http-status <n>] [--operation <op>] [--id <t>] [--merchant-ref <r>] [--from-journal] [--output json]`
- **Exit codes:** `0` always (a diagnosis is a successful diagnosis, even when the answer is "unknown"); `1` bad flags.
- **Network:** none by default; `--id` may trigger a read-only `transaction get` when credentials exist and `--live` is passed.
- **JSON:** `data: {symptom, inputs, confirmed[], likely[], possible[], unknown[], neverFabricated: true, evidenceUsed[], evidenceMissing[], next[]}` — a cause may appear in `confirmed` **only** with a named local evidence item; otherwise it carries `requiredEvidence[]`.
- **Acceptance criteria:** with no journal and no code, `confirmed` is empty and `next` lists the evidence to gather (golden test); every cause carries a `ruleId`; gateway-only facts always appear in `evidenceMissing`.

### `payway go-live check`
- **Responsibility:** *"am I ready to take production traffic?"* — evaluated gates with evidence, never a vibe.
- **Syntax:** `payway go-live check [--category <c,…>] [--gate <id,…>] [--attach <gate>=<path>] [--allow-unverified <gate> --reason <text>] [--strict] [--output json]` · `go-live report [--out <file>]` · `go-live diff <previous.json>`
- **Exit codes:** `0` no BLOCKER · `5` any BLOCKER · `1` bad flags.
- **Network:** reuses `doctor --live` (read-only).
- **JSON:** §16.1 envelope with `kind:"diagnostic"`; 18 gates (§17.4).
- **Acceptance criteria:** no gate reports `PASS` without a cited evidence item (test); `UNVERIFIED` never counts as `PASS`; an open money-path conflict yields `BLOCKER`; `--allow-unverified` requires `--reason` and records it.

### `payway capabilities`
- **Responsibility:** the machine-readable catalogue — the only supported way to enumerate the surface.
- **Syntax:** `payway capabilities [--products] [--aliases] [--deprecations] [--output json]`
- **Exit codes:** `0`. **Network:** none. **Side effects:** none.
- **JSON:** `data.commands[] = {name, aliases[], group, readOnly, mutating, moneyMoving, requiresCredentials, requiresRsa, requiresNetwork, environmentsAllowed, verified, outputModes[], deprecated?}` and, with `--products`, the §26 capability matrix.
- **Acceptance criteria:** generated from the live commander registry (no hand-maintained list); every command in `--help` appears and vice versa (parity test); `moneyMoving` is true for exactly the §12.2 class-3 operations.

### `payway explain`
- **Responsibility:** *"what does this code mean, for the endpoint I called?"*
- **Syntax:** `payway explain [code] [--operation <op>] [--family <f>] [--output json]`
- **Exit codes:** `0` known · `1` unknown code (with a valid error envelope and a `docs errors` next step).
- **JSON:** the error record; **plus `ambiguous: true` and `alternatives[]`** when a bare numeric code exists in more than one endpoint scope (the 6 collisions).
- **Acceptance criteria:** `explain 16 --operation checkout.purchase` → "Invalid Amount"; `--operation qr.create` → "Invalid First Name"; bare `explain 16 --output json` → `ambiguous: true` with both; the no-argument listing is grouped by endpoint; no entry says "not individually published" where official evidence exists.

### Commands whose contracts are unchanged from the first pass
`init`, `config show/set`, `sandbox info/verify/test-cards/beneficiaries/scenarios`, `qr create/offline/customer/soundbox/inspect/templates`, `checkout create/form`, `payment-link *`, `cof *`, `transaction get/detail/list/by-ref/poll/close/batch/current`, `refund *`, `payout *`, `pre-auth *`, `webhook trigger/verify/resend/list/show/status/stop/fixtures/conformance`, `journal *`, `docs *`, `status`, `demo`, `session`, `onboard`, `ask`, `agent`, `mcp`, `skills`, `completions`, `self-activation *`. Their first-pass contract tables (§9.5) are retained verbatim, with three global amendments: (1) all adopt the §16 envelope; (2) all mutating ones adopt the §12.2 guard; (3) all gain `verified` in `context`.

---

# 16. CLI JSON and Exit-Code Contracts

## 16.1 The envelope (one, versioned, universal)

```jsonc
{
  "schemaVersion": "2.0",                       // REQUIRED · semver-major bumps only on breaking change
  "kind": "result|collection|diagnostic|stream-event|error|text",   // REQUIRED
  "command": "transaction.get",                 // REQUIRED · dotted canonical id from `capabilities`
  "ok": true,                                   // REQUIRED
  "timestamp": "2026-10-05T09:41:12.441Z",      // REQUIRED · ISO-8601 UTC
  "context": {                                  // REQUIRED on every document
    "environment": "sandbox|production|custom",
    "endpoint": "https://checkout-sandbox.payway.com.kh",
    "coherence": "ok|mismatch|unknown",
    "credentialSource": "flag|env|dotenv|profile|missing",
    "profile": "sbx-acme",                      // OPTIONAL
    "sdkVersion": "2.0.0",
    "cliVersion": "2.0.0",
    "nodeVersion": "22.22.3",
    "guard": { "production": false, "required": false, "supplied": false, "bypassActive": false }
  },
  "data": { },                                  // REQUIRED for result|collection|diagnostic (object; array for collection)
  "gateway": {                                  // OPTIONAL · present iff a network call was made
    "operation": "qr.create", "endpoint": "/api/…/generate-qr", "method": "POST",
    "httpStatus": 200, "paywayCode": "0", "correlationId": "cid_…", "traceId": "…",
    "durationMs": 412, "attempts": 1, "retryPolicy": "none (mutation)"
  },
  "warnings": [ { "ruleId": "QR-016", "message": "…", "severity": "warning", "source": "official" } ],
  "diagnostics": { "advisories": [ /* Advisory records */ ], "checksRun": 0 },
  "errors": [ /* PayWayErrorRecord[] — empty on success */ ],
  "redaction": { "policy": "json-output", "applied": ["hash","merchant_auth","pwt"], "version": "2.0" },
  "nextActions": [ { "command": "payway transaction verify --current --expect-amount 3.00", "reason": "creation is not approval" } ]
}
```

**Required:** `schemaVersion`, `kind`, `command`, `ok`, `timestamp`, `context`, and exactly one of `data`/`errors`.
**Optional:** everything else, per `kind`.
**Error document:** `ok: false`, `errors: [PayWayErrorRecord]`, `data` omitted, `nextActions` populated.

## 16.2 Stability guarantees

| Element | Guarantee |
|---|---|
| `schemaVersion` | Present forever. Major bump only on a breaking change to this contract |
| Field **additions** | Always allowed; consumers must ignore unknown fields (stated in the contract docs and in `llms.txt`) |
| `kind`, `command`, `ok`, `timestamp`, `context.*`, `errors[].code`, `errors[].category`, `errors[].exitCode` | **Stable within a major.** Renaming or removing is breaking |
| `data.*` per command | **Stable within a major** for commands listed in `capabilities` as `stable: true`; `experimental: true` commands may change in a minor with a changelog entry |
| Exit codes | Stable forever (additive only) |
| Human-mode text | **No guarantee.** Never parse it |
| Deprecated surfaces | Listed by `capabilities --deprecations`; removed only at a major |

**Breaking-change policy:** a breaking change to the envelope, an exit code, a stable `data` field, a command name, or a flag's meaning requires (a) a major version, (b) a `MIGRATIONS.md` entry with the old→new path, (c) at least one minor of dual behaviour where feasible (`PAYWAY_CLI_OUTPUT_SCHEMA=1.0`), and (d) a stderr-only deprecation notice (never stdout).

## 16.3 Exit codes (final — 8 values, each with operational value)

| Code | Meaning | Categories | Who relies on it |
|---|---|---|---|
| **0** | Success. For `verify`/`check`/`go-live`: no BLOCKER and no mismatch | — | everyone |
| **1** | Input, validation, or configuration failure — the request never reached the network | `PW-VAL-*`, `PW-CFG-*`, `PW-CRED-*` | humans, scripts |
| **2** | PayWay rejected the request | `PW-API-*`, `PW-HASH-*`, `PW-TX-*`, `PW-CUR-*`, `PW-AMT-*`, `PW-RULE-*` | CI (a real gateway answer) |
| **3** | Network / timeout / rate-limit / circuit-open — **outcome unknown for mutations** | `PW-NET-*` | CI (retry-with-status-query), agents |
| **4** | Callback/webhook failure — unverified, malformed, or the listener could not bind/forward | `PW-CB-*` | `webhook listen --fail-on` |
| **5** | A gate or assertion evaluated to BLOCKER/mismatch — **the system worked; the answer is no** | `go-live`, `transaction verify`, `doctor` blockers | CI release gates |
| **6** | A safety guard refused the operation | `PW-ENV-*`, `PW-SEC-*`, `PW-GUARD-*` | agents, CI (must never be silently retried) |
| **130** | Interrupted (SIGINT) | — | shells |

**Rejected additions** (no operational value): a separate code for authentication failure (folded into 2 — the gateway rejected it, and `errors[].code` distinguishes `PW-CRED-*` from `PW-API-*`); a separate code for "transaction needs attention" (that is 5); a separate code for internal CLI failure (that is 1 with `category: INTERNAL`, because from the caller's perspective the CLI failed to do its job). **Rationale:** an agent branches on 8 codes reliably; on 14 it guesses.

**Invariants:** the exit code is always echoed in `errors[].exitCode`; `0` is never returned when `ok: false`; a renderer failure still emits a valid envelope (`PW-INT-001`) because a broken JSON error is worse than a broken text error.

## 16.4 stdout / stderr split (absolute)

| stdout | stderr |
|---|---|
| exactly one JSON document (or one per event for `ndjson`), or the human rendering in text mode | progress, spinners, banners, profile/update notices, advisories, deprecations, the human rendering when in machine mode, `--print-url`'s single line (stdout exception: it *is* the result) |

Enforced by the registry sweep: no ANSI, no partial document, no stderr leakage into stdout, for every command.

---

# 17. `payway doctor` — Implementation-Grade Specification

## 17.1 Categories

`SYS` runtime/tooling · `DEP` dependencies · `SDK` package/build · `CFG` configuration · `ENV` environment · `AUTH` credentials/signing · `NET` network · `API` PayWay connectivity · `WEB` callback/webhook · `DATA` storage/journal · `SEC` security.

## 17.2 Check model (code, not YAML — §6.3)

```ts
// src/diagnostics/doctor/check.ts
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped' | 'unverified';
export type Severity = 'info' | 'warning' | 'error' | 'blocker';
export type CheckCategory = 'SYS'|'DEP'|'SDK'|'CFG'|'ENV'|'AUTH'|'NET'|'API'|'WEB'|'DATA'|'SEC';
export interface CheckContext { config: ResolvedConfig; env: EnvironmentContext; route: Route;
  live: boolean; timeoutMs: number; dataRoot: string; capabilities: CommandInfo[]; }
export interface CheckResult { id: string; category: CheckCategory; label: string; severity: Severity;
  status: CheckStatus; detail: string; skipReason?: string;
  fix?: { command?: string; explanation: string; docRef?: string };
  evidence?: Record<string, unknown>; durationMs: number; }
export interface Check { id: string; category: CheckCategory; label: string;
  routes: Route[] | 'all'; severity: Severity; network: boolean; mutating: false;   // type-level guarantee
  run(ctx: CheckContext): Promise<CheckResult> | CheckResult; }
```
`mutating: false` is a **type-level** constraint: a check cannot declare a mutation. The runner additionally asserts against a mock transport that no `MUTATION_ENDPOINTS` path was requested (§15 acceptance).

## 17.3 The check registry (38 checks)

| ID | Cat | Purpose | Inputs | Method | Net? | PASS | WARN | FAIL | Sev on fail | Remediation | Exit impact |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SYS-001 | SYS | Node ≥ `engines.node` | `process.version` | semver compare | no | ≥22.12.0 | — | below | blocker | install Node 22.12+ | 5 |
| SYS-002 | SYS | Node major is supported | ditto | compare | no | 22/24 | other major | — | warning | — | — |
| SYS-003 | SYS | Clock skew within ±5 min | local time vs an HTTP `Date` header | compare | yes (only with `--live`) | \|skew\|<300 s | <900 s | ≥900 s | error | fix the system clock — `req_time` is signed | 1 |
| DEP-001 | DEP | `node_modules` consistent with the lockfile | lockfile vs tree | `npm ci --dry-run` signal or mtime heuristic | no | consistent | — | inconsistent | blocker | `npm ci` | 5 |
| DEP-002 | DEP | optional native backend | `probeStorageBackend()` | call | no | reports json or sqlite | json only | probe throws | info | install `better-sqlite3` for SQLite | — |
| DEP-003 | DEP | `cloudflared` present (tunnel routes only) | PATH | which | no | found | — | missing | warning | install cloudflared or use `--url` | — |
| SDK-001 | SDK | `dist/` present when running from source | fs | exists | no | present | — | absent | blocker | `npm run build` | 5 |
| SDK-002 | SDK | running version === `package.json` version | both | compare | no | equal | — | differ | warning | rebuild/reinstall | — |
| SDK-003 | SDK | subpath specifiers resolve | `require.resolve`/`import.meta.resolve` | resolve | no | all resolve | — | any fails | error | reinstall the package | 1 |
| SDK-004 | SDK | no TLS bypass active | `NODE_TLS_REJECT_UNAUTHORIZED` | env read | no | unset/`1` | — | `0` | **blocker** | unset it; use `NODE_EXTRA_CA_CERTS` | 5 |
| CFG-001 | CFG | `.env` exists and parses | fs + `dotenv` | parse | no | parses | absent (route=demo) | unparseable | error | `payway init` | 1 |
| CFG-002 | CFG | `.payway/config.json` schema-valid | fs + ajv | validate | no | valid or absent | — | invalid/unknown key | error | fix the named key | 1 |
| CFG-003 | CFG | no shadowed configuration | provenance map | compare | no | no shadows | file value shadowed by env | — | warning | `config --output json` shows provenance | — |
| CFG-004 | CFG | timeout/retry/rate-limit values in range | config | range check | no | in range | — | out of range | warning | fix the value | — |
| CFG-005 | CFG | default currency configured or profile default intended | config | presence | no | set | unset (purchase will use the profile default) | — | warning | set `PAYWAY_DEFAULT_CURRENCY` | — |
| ENV-001 | ENV | `PAYWAY_ENV` valid | env | enum/URL parse | no | valid | absent (defaults sandbox) | invalid | error | `payway env use sandbox` | 1 |
| ENV-002 | ENV | resolved endpoint matches resolved environment | `EnvironmentContext` | compare | no | coherent | — | mismatch | **blocker** | remove the conflicting override | 5 |
| ENV-003 | ENV | no unknown `PAYWAY_*` variables | env + generated registry | set difference | no | none | unknown present | — | warning | nearest-match suggestion | — |
| ENV-004 | ENV | environment is not `custom` without an explicit guard | ctx | inspect | no | sandbox/production, or custom+guard | custom without guard | — | warning | `payway env guard` | — |
| AUTH-001 | AUTH | `PAYWAY_MERCHANT_ID` present, ≤30 chars (official) | env/profile | length | no | present, ≤30 | >30 | absent | blocker | re-copy from the portal | 5 |
| AUTH-002 | AUTH | `PAYWAY_API_KEY` present, ≥16 chars | ditto | length | no | present | short | absent | blocker | re-copy from the portal | 5 |
| AUTH-003 | AUTH | RSA PEM present iff a route needs it | route + config | presence | no | present when needed | present but unused | absent when needed | blocker (route-scoped) | add `PAYWAY_RSA_PUBLIC_KEY` | 5 |
| AUTH-004 | AUTH | RSA PEM shape: PUBLIC KEY block, 1024-bit, not truncated | config | parse | no | valid | — | truncated/malformed | blocker | re-copy; multi-line quoting is supported | 5 |
| AUTH-005 | AUTH | signing produces a well-formed preimage | `inspectHmac` on a synthetic payload | local | no | 19/24/27-field preimage as expected | — | mismatch | blocker | report as an SDK bug | 5 |
| AUTH-006 | AUTH | partner credentials not mixed with merchant calls | config | inspect | no | one class | both present | — | warning | use separate profiles | — |
| NET-001 | NET | DNS resolves for the endpoint host | endpoint | `dns.promises.lookup` | yes | resolves | — | NXDOMAIN/timeout | error | check DNS/VPN | 3 |
| NET-002 | NET | TCP 443 reachable | endpoint | connect | yes | connects | — | refused/timeout | error | firewall/egress | 3 |
| NET-003 | NET | **TLS chain validates** | endpoint + `tlsCaFile`/`NODE_EXTRA_CA_CERTS` | TLS handshake | yes | validates | — | any chain error | error | `export NODE_EXTRA_CA_CERTS=<corp-root-ca.pem>` — **never disable verification** | 3 |
| NET-004 | NET | no proxy contradiction | `HTTPS_PROXY` etc. | probe | yes | reachable | proxy set and unused | proxy set and unreachable | warning | fix or unset the proxy | — |
| NET-005 | NET | latency within the configured timeout | probe timing | measure | yes | < timeout | > 80% of timeout | ≥ timeout | warning | raise `PAYWAY_TIMEOUT` | — |
| API-001 | API | live read-only probe succeeds | credentials | `exchange-rate` | yes | `code 0` | — | any rejection | error | report `paywayCode` + `correlationId` + `explain --operation exchange-rate` — **never swallow** | 2 |
| API-002 | API | rate-limit headers observed and recorded | probe response headers | read | yes | present | absent | — | info | records `x-rate-limit-*` unit evidence | — |
| API-003 | API | credential/rotation signal absent | probe result code | inspect | yes | no PTL171/PTL175/8 | — | rotation code seen | **blocker** | re-issue keys in the portal | 5 |
| WEB-001 | WEB | callback URL is public HTTPS and reachable | config | HEAD/POST probe | yes | reachable | — | unreachable | error | keep the tunnel running / deploy the receiver | 1 |
| WEB-002 | WEB | listener port free / receiver state | `webhook status` | read | no | free or owned | foreign process | — | warning | `payway webhook stop` | — |
| WEB-003 | WEB | listener binds loopback unless widened | config | inspect | no | loopback | widened | — | warning | the existing widening warning | — |
| WEB-004 | WEB | route ↔ verification contract match | route + receiver code | static hint | no | matched | — | mismatched | error | `payway docs callbacks` | 1 |
| WEB-005 | WEB | sandbox form does not load a production-hosted plugin | `checkoutPluginSrc` + env | compare | no | consistent | sandbox + production plugin host | — | warning | set `PAYWAY_CHECKOUT_PLUGIN_SRC` (N-09) | — |
| DATA-001 | DATA | data root writable; journal/webhook/token paths resolve | data root | write probe | no | writable | — | not writable | error | set `PAYWAY_DATA_DIR` | 1 |
| DATA-002 | DATA | journal size and retention | journal | stat | no | <50 MB | ≥50 MB | — | warning | `payway journal prune` | — |
| DATA-003 | DATA | no journal/webhook/token store inside a git working tree | data root + fs | detect | no | outside | — | inside | **blocker** | move the data root | 5 |
| SEC-001 | SEC | no `.env`/`profiles.json` tracked by git | `git ls-files` | inspect | no | none tracked | — | tracked | **blocker** | untrack + `.gitignore` | 5 |
| SEC-002 | SEC | no credential-shaped literal in tracked source | scan | regex (40-hex, PEM private) | no | none | — | found | error | rotate and remove | 1 |
| SEC-003 | SEC | log level not `trace` in production | config + env | compare | no | not trace | trace in production | — | warning | lower the level | — |
| SEC-004 | SEC | no secret passed inline in this invocation | argv | scan | no | none | a secret flag used inline | — | warning | use `--*-file`/stdin | — |
| SEC-005 | SEC | `PAYWAY_CONFIRM_PRODUCTION` auditable | env | read | no | unset | set | — | warning | recorded in the journal when used | — |
| SEC-006 | SEC | `redactHookBodies` not disabled in production | config | compare | no | redacting | disabled in production | — | warning | remove the override | — |

*(46 rows; 38 distinct checks after route-scoped variants are collapsed — the registry is the source of the count.)*

## 17.4 Offline / sandbox-network / production-sensitive separation

| Tier | Checks | When run | Quota cost |
|---|---|---|---|
| **Offline** (no network, no credentials) | SYS-001/002, DEP-001/002/003, SDK-001…004, CFG-001…005, ENV-001…004, AUTH-001…006, WEB-002/003/005, DATA-001/002/003, SEC-001…006 | **Always** | none |
| **Sandbox network** | SYS-003, NET-001…005, API-001/002, WEB-001/004 | `--live` and credentials present and `environment !== 'production'` | one `exchange-rate` call |
| **Production-sensitive** | API-003 (rotation signal), NET-003 against the production host, WEB-001 against a production callback | `--live` **and** `--confirm-production` | one read-only call; **never** a mutation |

**Hard guarantee:** `doctor` performs **no** mutating call under any flag combination. Enforced three ways: the `Check.mutating: false` type, a runner assertion against a mutation-failing mock transport, and a CI test that runs `doctor --live --route all` against a mock and asserts zero `MUTATION_ENDPOINTS` hits.

## 17.5 `--fix` scope (mechanical and reversible only)

Allowed: create `.env` from the generated template; create `.payway/config.json` from a template; append a missing non-secret variable; normalise PEM line endings; create the data root; `journal prune` when DATA-002 fails; write `PAYWAY_ENV` for ENV-001. **Never:** write a secret, change an endpoint, disable a guard, delete data, or modify production configuration without `--confirm-production`. Every fix prints a diff before writing and is skipped under `--non-interactive` unless all selected fixes are mechanical.

## 17.6 JSON representation and acceptance

`kind: "diagnostic"`; `data: {route, tier: {offline, network, productionSensitive}, checks: CheckResult[], summary: {pass, warn, fail, skipped, unverified, blockers}, context}`. `--output ndjson` emits one `stream-event` per check as it completes.
**Acceptance criteria:** (1) ≥38 checks across 11 categories, registry-driven severity; (2) both id-blacklist expressions in today's `cli.ts` deleted; (3) IDs additive-only, golden-tested; (4) no swallowed errors — an injected failing probe surfaces `paywayCode`, `httpStatus`, `correlationId`, and an `explain` next action; (5) `--check`/`--category`/`--severity-min`/`--fix` implemented; (6) exit 0/1/3/5 exactly as specified; (7) the no-mutation guarantee proven by test; (8) `go-live check` reuses the same runner and results.

---

# 18. Diagnostics Architecture

## 18.1 Five tools, five non-overlapping questions

| Tool | Question it answers | Inputs | Network | Output |
|---|---|---|---|---|
| **`doctor`** | *Is my environment correctly configured?* | configuration, filesystem, network | optional read-only | check results with severities and fixes |
| **`explain`** | *What does this code mean, for this endpoint?* | a code (+ operation) | none | the error record with provenance |
| **`request inspect`** | *What would the SDK send?* | an operation + parameters | none | the exact request, normalisation, signature provenance |
| **`diagnose`** | *Why did this operation fail?* | a symptom, code, id, and/or the journal | optional read-only | confirmed / likely / possible / unknown + evidence used + evidence missing |
| **`transaction get` / `verify`** | *What is the known PayWay state, and may I act on it?* | a transaction id | read-only | `TransactionState`; `verify` adds an assertion result |

**Boundary rules that prevent overlap:**
- `doctor` never explains a gateway error code (it points at `explain`), and `explain` never inspects configuration.
- `diagnose` never re-implements `doctor`: it *consumes* the last `doctor` result when available and cites it as evidence.
- `request inspect` never diagnoses: it reports facts, including `validation.errors`, and points at `diagnose`.
- `journal explain` (local RCA over journal events) becomes a `diagnose --from-journal` implementation detail, not a separate user-facing question. **This removes one of today's five overlapping surfaces.**
- Today's `validate` (refund amount / transaction id) becomes `request inspect`'s validation output — **removing a second**.

## 18.2 `request inspect` output document (final)

Retained verbatim from the first pass (§9.4 there) with three amendments:
1. `authModel.encoding` is per-endpoint and cites its rule (`PO-003` hex for payout, N-14).
2. `normalization[]` entries gain `substituted: true` when the SDK supplied a default for a field official docs mark required (N-17), and `divergent: true` when the repo's wire representation differs from the official declaration (N-05 amount type, N-07 content type).
3. `contentType` is reported explicitly with `official` vs `implemented` when they differ (N-07).

## 18.3 Redaction rules for inspection (six, unchanged and still correct)

1. `hash`, `merchant_auth`, beneficiary ciphertext, `X-PAYWAY-HMAC-SHA512` → `«REDACTED:<encoding>:<length>»`, never printed under any flag.
2. `apiKey`, `partnerApiKey`, private keys, `pwt`, provider keys → **absent from the document entirely**, not merely masked; asserted by canary test.
3. `merchant_id`, `ctid`, `request_id` → masked beyond the first 4 characters; `--reveal-ids` unmasks non-secret identifiers only.
4. Buyer PII → masked; `--reveal-pii` unmasks; journal `digest` never records them.
5. The preimage is key-free by construction, printed only with `--show-preimage`, stdout-only, never journaled.
6. `redaction: {policy, applied[], version}` is always present so the output is safe to paste into an issue.

---

# 19. PayWay Rules Verification Matrix

## 19.1 Source-confidence vocabulary (per §22)

`OFFICIAL_DOCUMENTATION` (retrieved from `developer.payway.com.kh`, quoted, dated) · `OFFICIAL_API_BEHAVIOR` (the gateway's own response confirmed a documented rule) · `OBSERVED_SANDBOX_BEHAVIOR` (repository probe, dated) · `OBSERVED_PRODUCTION_BEHAVIOR` (repository telemetry CSV, dated) · `REPOSITORY_ASSUMPTION` (a choice this repo made) · `UNVERIFIED`.
**Rule:** `OBSERVED_*` never becomes a universal rule without justification recorded in the rule's `variants`. A single dated observation is a *variant*, not a *rule*.

## 19.2 Updated matrix (48 rules; changes from pass 1 marked ⟲)

| Rule | Statement | Source confidence | Current enforcement | Target enforcement | Canonical layer | Consumers | Test | Severity |
|---|---|---|---|---|---|---|---|---|
| QR-001 | generate-qr hash = base64(HMAC-SHA512(concat of 19 fields, in order)) | **OFFICIAL_DOCUMENTATION** — verified verbatim against the rendered field description, 2026-10-05; repo list matches exactly | HARD | unchanged | `auth/field-orders` | SDK, `request inspect`, docs, skill | ✅ `hash-order-hints` | — |
| QR-002 | unset hashed fields occupy their position as `''`, never omitted | **OFFICIAL_DOCUMENTATION** (the archived spec states it as non-negotiable; the official PHP sample implies it by concatenating possibly-null variables) | HARD (`generateHmac`) | unchanged | `auth/hmac` | SDK, docs, skill | ✅ | — |
| QR-003 | `req_time` = UTC `YYYYMMDDHHmmss`, generated at signing time, never cached | **OFFICIAL_DOCUMENTATION** | HARD | unchanged | `core/time` | SDK, `request inspect` | ✅ | — |
| QR-004 | `tran_id` ≤ 20 characters | **OFFICIAL_DOCUMENTATION** ("<= 20 characters") | HARD | unchanged | `core/ids` | SDK, CLI, `validate` | ✅ | — |
| QR-005 | `tran_id` charset `[a-zA-Z0-9-]` | **REPOSITORY_ASSUMPTION** (official says only "unique transaction ID") | HARD | **ADVISORY** + `source: repo` label | `core/ids` | SDK | ✅ | P3 |
| QR-006 | `tran_id` < 5 chars risky | **REPOSITORY_ASSUMPTION** (gateway enforces `{5,24}` on *request_id/ctid*, not `tran_id`) | WARN once/process | ADVISORY via `core/advisories` | `core/ids` | SDK | ✅ | P2 |
| QR-007 | `merchant_id` ≤ 30 characters | **OFFICIAL_DOCUMENTATION** ("<= 30 characters") | **NONE** | HARD (cheap; prevents a wrong-credential class) + `doctor AUTH-001` | `core/ids` | SDK, doctor | ➕ | P2 |
| AMT-000 ⟲ | wire `amount` representation | **CONFLICT**: official declares `number` (both endpoints); repo sends a formatted **string**; a third-party mirror said "formatted decimal string". Sandbox accepts the string | HARD (`formatAmount`) | unchanged behaviour; record as `status: divergent-but-working`, `REQUIRES_PAYWAY_CONFIRMATION`; `request inspect` marks it `divergent: true` | `core/money` | SDK, `request inspect`, docs | ➕ probe | **P1** |
| AMT-001 | USD ≤ 2 decimal places; KHR integer | **REPOSITORY_ASSUMPTION** consistent with official examples (`"4000"` KHR, `0.01` USD) | HARD | unchanged | `core/money` | SDK, CLI | ✅ | — |
| QR-009 ⟲ | amount minimum **100 KHR / 0.01 USD** | **OFFICIAL_DOCUMENTATION** ("must be at least 100 KHR or 0.01 USD and cannot be null") **+ OFFICIAL_API_BEHAVIOR** (official response code **47** "KHR Amount must be greater than 100 KHR") | **ADVISORY** (`validateAmountFloor`) | **HARD** — a documented minimum with its own gateway error code is not an opinion | `core/money` | SDK, CLI, `validate` | ➕ strengthen | **P1** |
| QR-010 ⟲ | `currency` ∈ {KHR, USD}; **required** on generate-qr; optional on purchase where the **profile** supplies the default | **OFFICIAL_DOCUMENTATION** | HARD on membership; **optional on QR** (official says required); **silently defaulted to USD on purchase** | HARD membership; required on QR; on purchase **omit rather than default** (N-05) | `core/money#resolveCurrency` | SDK, CLI, doctor CFG-005 | ➕ | **P1** |
| QR-011 | `currency` is **not case-sensitive** | **OFFICIAL_DOCUMENTATION** | HARD-reject on `usd` (stricter than the gateway) | normalise-then-validate; label the residual strictness `REPOSITORY_ASSUMPTION` | `core/money` | SDK, CLI (1 spelling, was 7) | ➕ | P2 |
| QR-012 ⟲ | generate-qr `payment_option` ∈ {`abapay_khqr`, `wechat`(USD only), `alipay`(USD only)} and is **required** | **OFFICIAL_DOCUMENTATION** | **NONE** for membership; ADVISORY for the USD-only rule; defaults to `abapay_khqr` | HARD for values in no official set; **ADVISORY for profile enablement** (official code 23 proves enablement is profile-scoped); required unless a documented default is recorded | `core/validation/rules` | SDK, CLI, `rules`-driven `validate` | ➕ | **P1** |
| QR-013 ⟲ | generate-qr `lifetime`: **minutes**, **required**, min 3, **max 120 days**, default 30 days | **OFFICIAL_DOCUMENTATION** for unit/min/max/default; **OBSERVED_SANDBOX_BEHAVIOR** (2026-08-30: 179→HTTP 400 code `04`, 180→OK) contradicts the unit | **CONTRADICTED** in code: `QR_LIFETIME_MIN_SECONDS=180`, seconds semantics, optional | probe first (read-back expiry), then one canonical unit in **data**, never in an identifier; `--lifetime-unit` during migration; conflict recorded until resolved | `core/validation/rules` + `rules.yaml` | SDK, CLI, `request inspect`, `go-live` | ➕ probe + conflict test | **P0** |
| QR-013b ⟲ | purchase `lifetime`: minutes, min 3, **max 30 days**, default 30 days | **OFFICIAL_DOCUMENTATION** (purchase page — note the max differs from QR's 120 days) | HARD min (gateway error 69); ADVISORY max 43200 | unchanged (repo is correct) | `core/validation/rules` | SDK, CLI | ✅ | — |
| QR-014 | `callback_url` base64-encoded, ≤255 | **OFFICIAL_DOCUMENTATION** | HARD encode; ADVISORY length | HARD both | `core/validation` | SDK, `request inspect` | ✅ partial | P2 |
| QR-015 | callback URL must be publicly reachable HTTPS | **REPOSITORY_ASSUMPTION** (sensible; official code 6/102 show a domain whitelist exists) | HARD (`validatePublicHttpsUrl`, private-host refusal, `allowPrivateCallbackHosts` escape) | unchanged — model validator | `core/validation` | SDK, doctor WEB-001 | ✅ | — |
| QR-016 ⟲ | `items`: **up to 50 line items**; ≤500 encoded chars **on generate-qr**; *"price or quantity … will not be used for calculation or any validation purposes"* | **OFFICIAL_DOCUMENTATION** | ADVISORY at **>10** (wrong by 5×) and at >500 chars on both paths | correct to 50; keep 500 for QR only, reclassify or remove for purchase; **record the semantics** so no consumer treats line items as an amount check | `core/validation/rules` | SDK, CLI, docs, `request inspect` | ➕ | **P2 (N-06)** |
| QR-017 | `qr_image_template` ∈ 7 values; **required** officially, defaulted to `template2` by the repo | **OBSERVED_SANDBOX_BEHAVIOR** (2026-08-30) for the value set; **OFFICIAL_DOCUMENTATION** for requiredness | HARD on the set; optional with default | unchanged + `source: sandbox` tag; requiredness decided by probe (N-17) | `rules.yaml` | SDK, CLI `qr templates` | ✅ | P3 |
| QR-018 | KHQR generation 10 req/s per MID | **UNVERIFIED** (relay only; not in official docs) | HARD (client token bucket) | unchanged, tagged `source: relay`, `officialConfirmation: pending` | `transport/rate-limit` | SDK, `request inspect` | ✅ | P3 |
| QR-020 ⟲ | `first_name`/`last_name` ≤20 on QR, ≤100 on purchase; no digits/special characters | **OFFICIAL_DOCUMENTATION, self-contradictory** (QR table says ≤20; QR error text for codes 16/17 says ≤100) | QR ADVISORY >20 ✓; purchase HARD >100 + charset on `firstname`, length-only on `lastname` | keep per-endpoint values; **record the official self-contradiction**; add the missing `lastname` charset check or record why | `core/validation` | SDK | ➕ | P3 (N-16) |
| PUR-001 ⟲ | purchase hash = 24 official fields; `view_type`/`payment_gate` **not** hashed | **REQUIRES_MANUAL_VERIFICATION** — the official page's hash list is inside a collapsed PHP sample that does not render in retrieved content; the 24-field order comes from a third-party mirror. The repo's exclusion of `view_type`/`payment_gate` from `PURCHASE_HASH_FIELDS` is verified in code | HARD via a **27-field hash-neutral superset** | unchanged; re-verify from the rendered page and record the quote; until then `source: mirror` **not** `official` | `auth/field-orders` | SDK, `request inspect` | ✅ `cof-subscription-parity` | **P1** |
| PUR-002 | subscription hash positions for `ctid` (after `items`), `token_flag`, `frequency` (appended) | **OBSERVED_SANDBOX_BEHAVIOR** (2026-09-05: "the documented 26-field order is rejected with Wrong Hash"; probes C1/C2) | HARD | keep HARD, tag `source: sandbox`, `officialConfirmation: pending`, surface in `request inspect` | `auth/field-orders` | SDK | ✅ | P1 |
| PUR-003 ⟲ | purchase `payment_option` ∈ {`cards`, **`abapay_khqr`**, `abapay_khqr_deeplink`, `alipay`, `wechat`, `google_pay`}; **optional** (omitting lets the profile decide) | **OFFICIAL_DOCUMENTATION** (verbatim, 2026-10-05) | **CONTRADICTED**: repo enum = {`cards`,`abapay`,`abapay_deeplink`,`abapay_khqr_deeplink`,`google_pay`} from an **archived spec**; ADVISORY normally, **HARD under `strictValidation`** | replace with the official 6; move `abapay`/`abapay_deeplink` to a legacy advisory set; **never HARD-reject an officially listed value**; profile enablement is the gateway's (code 23) | `rules.yaml` → generated enum | SDK, CLI, docs, skills | ➕ official-conformance | **P0** |
| PUR-004 | `google_pay` ⇒ `googlePayToken` required | **OFFICIAL_DOCUMENTATION** | HARD (hand-coded `checkout.ts:338-341`) | move into the cross-field rule mechanism | `core/validation/semantic` | SDK | ✅ | P3 |
| PUR-005 | `google_pay` availability is profile-dependent (relay: "not available at the time of the guidance") | **UNVERIFIED** (relay) | DOC | keep DOC + `capabilities.verified: relay`; never a local rejection | `rules.yaml` | docs, `products` | ➕ | P3 |
| PUR-006 | split-payout keys `{acc, amt}` on purchase/COF-charge/pre-auth-payout/payment-link; `{account, amount}` on QR/payout | **OFFICIAL_DOCUMENTATION** for the QR side (the official `payout` sample uses `{"account":…,"amount":…}`) + **OBSERVED_SANDBOX_BEHAVIOR** for the purchase side (403 code 35 before W1-5) | HARD (`validatePayoutEntryShape`) | unchanged; record the per-endpoint key map as data | `core/money#parsePayoutEntries` | SDK, CLI, `request inspect` | ✅ | — |
| PUR-007 | payout entries must total the transaction/link amount | **REPOSITORY_ASSUMPTION** consistent with official code 36 | HARD on payment-link; **inline in `cli.ts:3557-3593`** elsewhere | move to `core/money#assertPayoutTotal`, HARD in the domains so SDK consumers get it | `core/money` | SDK, CLI | ✅ partial | **P2** |
| PUR-020 ⟲ | purchase content type | **CONFLICT**: official declares `multipart/form-data` (cURL `--form`); repo network path sends `application/json`; repo local form posts urlencoded. QR officially declares `application/json` and the repo matches | HARD (JSON) | probe all three; record; keep JSON if equivalent, add a `contentType` escape if any profile requires multipart | `rules.yaml` + `transport` | SDK, `request inspect`, `explain 7/48` | ➕ probe | **P2 (N-07)** |
| PUR-021 ⟲ | hosted-checkout plugin script host | **UNVERIFIED** — official docs reference `checkout2-0.js` without an environment-specific host; repo hard-codes the **production** host | HARD-coded constant | configurable (`checkoutPluginSrc`/env/flag), default unchanged pending confirmation; `doctor WEB-005` warns in sandbox | `config` + `domains/checkout` | SDK, CLI, doctor | ➕ | **P2 (N-09)** |
| PUR-022 ⟲ | `type: pre-auth` supports **ABA PAY, KHQR and Card only** (excludes alipay/wechat/google_pay) | **OFFICIAL_DOCUMENTATION** (stated on both the purchase `type` field and the QR `purchase_type` field) | **NONE** | HARD cross-field rule | `core/validation/semantic` | SDK, CLI, `request inspect` | ➕ | **P2 (N-10)** |
| CB-001 | online checkout callback: sort body keys ascending, concat values (JSON-encode objects/arrays), HMAC-SHA512, base64, compare to `X-PAYWAY-HMAC-SHA512` | **OFFICIAL_DOCUMENTATION** (the Ecommerce Checkout page renders the full PHP sample — retrieved and verified 2026-10-05) | HARD (`verifyCallbackDetailed`, `timingSafeEqual`) | unchanged | `auth/callback-signature` | SDK, webhook, CLI, fixtures | ✅ | — |
| CB-002 | invalid signature → respond **401** and do not process | **OFFICIAL_DOCUMENTATION** (the sample returns 401) | DOC; examples vary (403 in one JSDoc, 200-then-discard elsewhere) | align docs/examples/`webhook conformance` to 401, or record the divergence as `REPOSITORY_ASSUMPTION` with a reason | `docs` + `webhook` | examples, fixtures, conformance | ➕ | P2 |
| CB-003 | the `hash` field must be stripped before sorted-key verification | **REPOSITORY_ASSUMPTION** (a necessary consequence of CB-001 when the body contains a `hash`) | OPT-IN, default `false` "for backward compatibility" | **default `true`** at 2.0.0 + migration note; the correct call must be the default one | `auth/callback-signature` | SDK, webhook | ✅ | **P1** |
| CB-004 | Customer Module KHQR: HMAC over the **raw request body bytes** | **UNVERIFIED** (relay 2026-10-03; not in the official pages retrieved) | HARD (`verifyCallbackSignatureRaw`) | keep, tag `source: relay`, `officialConfirmation: pending` | `auth/callback-signature` | SDK, webhook, docs | ✅ | P2 |
| CB-005 | payment-link pushbacks are **unsigned** `{tran_id, status:0, merchant_ref_no}`; verify by status lookup | **OBSERVED_SANDBOX_BEHAVIOR** (live-verified 2026-09-06) | HARD-by-omission (fixtures carry no hash) | unchanged + `classifyCallback` exposed in the CLI | `callbacks/` | SDK, webhook, fixtures | ✅ | — |
| CB-006 | offline KHQR notifications have **no** signature contract | **UNVERIFIED** (relay) | DOC + fixture design | unchanged | `callbacks/` | docs, fixtures | ✅ | — |
| CB-007 | callbacks are **single best-effort**, no guaranteed retry; expect 200 within ~5 s | **UNVERIFIED→relay** (2026-09-12) + consistent with the official "PayWay will send … to the return URL" framing, which promises no retry | DOC + `journal reconcile` honesty rule | unchanged + `go-live` BLOCKER gate "status-query fallback implemented" | `docs` + `go-live` | docs, go-live, reference app | ➕ doc-conformance | **P1** |
| CB-008 | pushback fires only on success; multiple pushbacks per `tran_id` are legitimate as status changes; any 2xx is an ACK | **UNVERIFIED** (relay T-19/FU-04) | HARD in `journal reconcile` (replay keyed on `(tran_id, status)`) | unchanged, tagged | `observability/journal` | journal, webhook listen | ✅ | — |
| CB-009 | callback source IPs `103.108.218.76/.2`; no wildcard domains (code 6) | **UNVERIFIED** (relay); official code 6 confirms a domain whitelist exists | DOC only | optional ADVISORY + `doctor WEB-004`; **never** a hard requirement (IP allow-listing a payment callback is fragile) | `rules.yaml` | docs, doctor | ➕ | P3 |
| TX-001 | `payment_status_code`: 0 APPROVED, 2 PENDING, 3 DECLINED, 4 REFUNDED, 7 CANCELLED | **UNVERIFIED→relay** (confirmed by the ABA integration team 2026-09-12) + **OBSERVED_SANDBOX_BEHAVIOR** | HARD (`PAYMENT_STATUS_CODES`) | unchanged; generate the label map from the rule | `core/lifecycle` | SDK, CLI, docs | ✅ | — |
| TX-002 | code 0 is ambiguous: APPROVED **and** PRE-AUTH | **OBSERVED_SANDBOX_BEHAVIOR** + relay | DOC + a `PRE_AUTH = 0` alias | the numeric code alone must never authorise fulfilment; `assertFulfillable` requires the `payment_status` string | `core/lifecycle` | SDK, CLI, docs | ➕ | **P2** |
| TX-003 | there is **no** EXPIRED or CLOSED remote status; expired/closed read PENDING (possibly ~24 h) | **UNVERIFIED→relay** + **OBSERVED_SANDBOX_BEHAVIOR** (campaign W4-1) | HARD-by-omission + DOC + local `closed` flag | unchanged + `go-live` gate "local expiry policy implemented" | `core/lifecycle` | SDK, docs, go-live | ✅ | — |
| TX-004 | `check-transaction` sees only the last **7 days** and excludes KHQR | **UNVERIFIED** (relay 2026-10-03) | DOC + `explain` hints | ADVISORY when a lookup misses and the id is old/KHQR-shaped; `diagnose --symptom transaction-not-found` branch | `rules.yaml` | SDK, diagnose, docs | ➕ | **P1** |
| TX-005 | `transaction-detail` 10/min; ~5 s post-creation indexing lag | **OBSERVED_SANDBOX_BEHAVIOR** | HARD (client bucket) + CLI `--wait` | unchanged | `transport/rate-limit` | SDK, CLI | ✅ | — |
| TX-006 | `transaction-list` `from_date`/`to_date` are **gateway UTC+7** | **OBSERVED_SANDBOX_BEHAVIOR** (2026-09-05) | HARD (`gatewayDayWindow` default) + DOC | unchanged + `diagnose --symptom list-returned-empty` | `core/time` | SDK, CLI, diagnose | ✅ | — |
| TX-007 | per-endpoint rate limits (check-transaction 600/s, refund 500/s, transaction-list 50/min, by-mc-ref 10/min) | **REPOSITORY_ASSUMPTION** (client defaults; only the KHQR 10/s figure has a cited source) | HARD (client buckets) | make the table data-driven with per-entry `source` tags | `rules.yaml` → `transport/rate-limit` | SDK, `request inspect` | ✅ | P3 |
| TX-008 ⟲ | duplicate `tran_id` behaviour | **CONFLICT — three sources**: OFFICIAL_DOCUMENTATION (QR code **403** "Duplicated Transaction ID"); OBSERVED_PRODUCTION_BEHAVIOR (code **4**; code **83** on the payment-credential purchase leg); OBSERVED_SANDBOX_BEHAVIOR (silently accepted, unpayable QR — W5-7) | HARD mutation single-attempt + CLI journal warning | **policy unchanged**; restate the justification on unknown-outcome + no-documented-idempotency-key grounds; record all three variants; map 403/4/83 to one `DUPLICATE_TRANSACTION` diagnostic | `rules.yaml` + `core/errors` | SDK, CLI, explain, diagnose | ➕ probe | **P1 (N-03)** |
| TX-LIFE-001…003 ⟲ | lifetime-expiry consequences per method: ABA PAY/Card "transaction will not go through"; **KHQR: rejected and funds reversed to the payer**; **WeChat/Alipay: no reversal** | **OFFICIAL_DOCUMENTATION** (purchase `lifetime` prose) | **ABSENT** | record all three; `TransactionState.latePayment`; `diagnose --symptom late-payment`; docs + reference-app demo variant; `go-live` evidence gate. **Do not** attempt to detect a reversal — no endpoint is documented | `rules.yaml` + `core/lifecycle` | SDK, CLI, docs, diagnose, go-live | ➕ | **P1 (N-04)** |
| RF-001 | refund error codes (PTL02/04/37/57/58/168/181/187 …) | **OBSERVED_SANDBOX_BEHAVIOR** + relay | HARD (registry) + `explain` | unchanged, re-keyed by endpoint (N-01) | `errors.yaml` | SDK, CLI | ✅ | — |
| RF-002 | refund ≤ original; multiple partials allowed; the numeric below-minimum floor is undocumented | **UNVERIFIED→relay** (PTL37/PTL187) | HARD (`validateRefundAmount`, `computeRefundableBalance`) + DOC on the unknown floor | unchanged; keep the floor `UNVERIFIED` and say so | `core/money` | SDK, CLI | ✅ | — |
| RF-003 | no standard refund after payout/split | **UNVERIFIED→relay** | DOC | ADVISORY when a payout is recorded for the transaction + `go-live` gate | `rules.yaml` | SDK, go-live | ➕ | P2 |
| COF-001 | `link-account`/`link-card` require `request_id`, `ctid`, `token_flag`; `request_id`/`ctid` match `[a-zA-Z0-9]{5,24}` | **OFFICIAL_DOCUMENTATION**-adjacent + **OBSERVED_SANDBOX_BEHAVIOR** (§16 findings) | HARD (`REQUEST_ID_PATTERN`) | unchanged; re-verify against the official CoF pages (not retrieved in this pass) | `core/ids` | SDK, CLI | ✅ | P2 |
| COF-002 | `link-card` is urlencoded and answers **HTML** (the hosted form *is* the success signal) | **OBSERVED_SANDBOX_BEHAVIOR** | HARD (content-type + `HostedPageOutcome`, `302 → /add-card/<base64>`) | unchanged — exemplary evidence-driven work | `transport/classify` | SDK, CLI | ✅ | — |
| COF-003 | token flags: linking `CITI_FLEX/CITO_FLEX/CITO_FIX/CITR_FLEX`; charging `CITU_FLEX/MITU_FLEX/MITU_FIX/MITR_FLEX/MITR_FIX`; production subsets differ; `MITU_FIX`/`MITR_FLEX` probes were invalid | **OFFICIAL_DOCUMENTATION** for the flag names (CoF pages) + **OBSERVED_SANDBOX_BEHAVIOR** for the two invalid ones + relay for the production subsets | HARD (`validateTokenFlag(scope)`) + separate production lists | keep; tag the two invalid flags `UNVERIFIED` and **refuse them in production** | `rules.yaml` | SDK, CLI, env-guard | ✅ | **P2** |
| COF-004 | unscheduled account tokens: rolling **90-day** expiry (latest of link/renew/last successful charge); scheduled tokens carry explicit `expired_at` | **UNVERIFIED→relay** (FU-08) | HARD (`computeTokenExpiry`, `tokenExpiryStatus`) | unchanged, tagged | `core/lifecycle` | SDK, CLI | ✅ | — |
| COF-005 | `token details` takes `request_id` only; `token remove` takes `ctid`+`token` | **OBSERVED_SANDBOX_BEHAVIOR** (§16) | HARD (per-endpoint required-option sets) | unchanged | `domains/cof` | SDK, CLI | ✅ | — |
| PO-001 | payout beneficiaries must be whitelisted; sandbox seeds `500000001…`; `000999888` is **not** whitelisted | **OBSERVED_SANDBOX_BEHAVIOR** | HARD (`validateSandboxBeneficiary`) + DOC | unchanged | `rules.yaml` | SDK, CLI, `sandbox beneficiaries` | ✅ | — |
| PO-002 | payouts settle immediately; chargebacks are card-only | **UNVERIFIED→relay** | DOC | `go-live` evidence gate (dispute-handling policy) | `docs` + `go-live` | docs, go-live | ➕ | P2 |
| PO-003 ⟲ | **payout hash is hex-encoded**, not base64 | **REPOSITORY_ASSUMPTION citing official docs** — the instruction lives in `payway-openapi/paths/payout.yaml:13-17`, regenerated into `src/types.ts:399`; implemented at `domains/payout.ts:96`. The official Payout page was **not retrieved in this pass** | HARD (`hashEncoding: 'hex'`) | unchanged; move the rule to `rules.yaml` with evidence, cite the rule id at the call site, pin with a golden vector | `auth/field-orders` + `rules.yaml` | SDK, `request inspect`, golden vectors | ➕ vector | **P2 (N-14)** — a hex/base64 regression breaks every payout |
| PA-001 | pre-auth default capture window 30 days; auto-release has **no** webhook | **UNVERIFIED→relay** | HARD (`PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`) + DOC | unchanged + `go-live` gate | `rules.yaml` | SDK, go-live | ✅ | — |
| PA-002 | over-capture ceiling 110% | **REPOSITORY_ASSUMPTION** (CLI default `--max-over-capture-pct 110`) | HARD **in the CLI only** | move to `domains/pre-auth` so SDK consumers get it | `core/money` | SDK, CLI | ➕ | **P2** |
| PL-001 | payment-link `expired_date` future and ≥5 min out (else PTL04) | **OBSERVED_SANDBOX_BEHAVIOR** | HARD | unchanged | `core/validation` | SDK, CLI | ✅ | — |
| PL-002 | no EXPIRED link status: expired links read OPEN and the hosted page still returns 200 | **OBSERVED_SANDBOX_BEHAVIOR** (§22) | DOC + local expiry policy | `go-live` gate + `diagnose --symptom link-expired-but-open` | `rules.yaml` | docs, diagnose, go-live | ➕ | **P1** |
| PL-003 | `void` is permanent, not idempotent (double-void → 403 PTL188 = terminal); bogus id → 403 code 96; **the endpoint is absent from official docs** | **OBSERVED_SANDBOX_BEHAVIOR** (§23) | HARD (PTL188 mapped terminal) + confirm prompt | unchanged + `verified: sandbox`, `officialDocs: absent` | `rules.yaml` | SDK, CLI, `products` | ✅ | — |
| SEC-001 | key rotation is zero-overlap (PTL171/PTL175) | **UNVERIFIED→relay** | DOC + `explain` | `doctor API-003` + `diagnose --symptom key-rotated` | `rules.yaml` | doctor, diagnose | ➕ | **P1** |
| SEC-002 | credentials/tokens stay server-side; never in a browser bundle or an AI-provider payload | **REPOSITORY_ASSUMPTION** (correct) | DOC + the agent privacy layer | unchanged + a `go-live` gate scanning declared client entrypoints for `PAYWAY_*` literals | `go-live` | go-live, docs | ➕ | P2 |
| SET-001 | settlement is T+N, merchant-specific (T+3…15 working days observed); fees are separate debits; weekend/holiday shifts | **UNVERIFIED→relay** (confirmed) | DOC only | `go-live` evidence gate; **explicitly not automatable** | `docs` + `go-live` | docs, go-live | ➕ | P2 |
| SET-002 | one merchant profile = one settlement currency | **UNVERIFIED→relay** | DOC | ADVISORY when the transaction currency ≠ the configured default currency | `core/money` | SDK, `transaction verify` | ➕ | P3 |
| ENV-001 | endpoints: sandbox `checkout-sandbox.payway.com.kh`, production `checkout.payway.com.kh` | **OFFICIAL_DOCUMENTATION** (both appear in official cURL samples) | HARD (`BASE_URLS`) | unchanged | `config` | SDK, CLI, doctor | ✅ | — |
| ENV-002 | sandbox cannot reproduce: declines, settlement, chargebacks, real KHQR bank behaviour, production rate limits, key rotation | **UNVERIFIED→relay** + DOC | DOC | `sandbox info --output json` as data | `rules.yaml` | CLI, docs, agents | ➕ | **P1** |
| ENV-003 | simulator accounts: max 2 per merchant, 90-day hard expiry, PIN 1234/TEST1 | **UNVERIFIED→relay** | DOC | `sandbox info` | `rules.yaml` | CLI, docs | ➕ | P3 |
| SPEC-001 | `request-qr` (Soundbox) contract incl. its 9-field hash order | **REPOSITORY_ASSUMPTION from an archived spec whose own `b4hash` for this endpoint is a corrupted copy-paste from generate-qr** (the repo documents this) | HARD (repo-derived order) | keep, tag `verified: spec`, require `--allow-unverified` in production, surface in `capabilities`/`products` | `rules.yaml` | SDK, CLI, products | ✅ | **P1** |
| SPEC-002 | self-activation trio; HMAC SHA-256 except `get-mc-credential-info` (the spec contradicts itself) | **REPOSITORY_ASSUMPTION from an archived spec** | HARD + labelled "spec-derived, not live-verified" in `--help` and the reference | unchanged — the correct way to ship an unverified surface | `rules.yaml` | SDK, CLI, products | ✅ | P3 |
| SPEC-003 | 6 legacy `/api/aof/*` + `v1/cof` endpoints deliberately not implemented; official docs list a dedicated **Subscription** endpoint the SDK does not call | **OFFICIAL_DOCUMENTATION** (the endpoint index retrieved 2026-10-05 lists `Subscription POST` under Credentials on File) | DOC (coverage audit 28/33) | `capabilities --products` lists both as `notImplemented` with a reason; decide whether Subscription is a gap or an intentional purchase-path substitution and record it | `rules.yaml` | products, docs | ➕ | **P2** |
| ERR-001 ⟲ | generate-qr response codes (20 values) | **OFFICIAL_DOCUMENTATION** (full enumeration retrieved 2026-10-05) | registry has all 20 keys, but 4 say "not individually published" and `qr:403` is titled "Forbidden" | replace with the official titles + evidence; keep sandbox/telemetry variants alongside, never deleted | `errors.yaml` | explain, diagnose, docs | ➕ | **P1 (N-01)** |

## 19.3 What engineering must NOT encode until ABA confirms

1. QR `lifetime` **unit** (QR-013) — probe first; do not ship a canonical unit on a single dated observation.
2. Wire `amount` **type** (AMT-000) — do not "fix" the string to a number without a probe; the string is sandbox-verified and changing it could break every signature.
3. Purchase **hash field order** (PUR-001) — do not re-derive from a mirror; verify from the rendered official page or a probe.
4. Purchase **content type** (PUR-020) — do not switch to multipart without a probe.
5. Duplicate `tran_id` **behaviour** (TX-008) — do not build idempotency on any single variant.
6. KHQR **fund-reversal timing/reporting** (TX-LIFE-002) — the reversal is documented; its appearance in reports is not. Do not automate reconciliation against it.
7. Two CoF token flags (COF-003), the Soundbox contract (SPEC-001), the Customer-Module raw-body HMAC (CB-004), the refund numeric floor (RF-002), callback source IPs (CB-009), settlement T+N (SET-001) — all remain `UNVERIFIED`; keep them advisory, tagged, and out of `go-live` PASS.

---

# 20. Transaction Domain Model

## 20.1 Identifier model — resolving the eight-way ambiguity

| Identifier | Owner | Scope | Uniqueness | Who generates | Where it appears |
|---|---|---|---|---|---|
| **Order id** | Merchant application | Merchant domain | Merchant-defined | Merchant | never sent to PayWay (or sent as `custom_fields`) |
| **Merchant reference** (`merchant_ref` / `return_params`) | Merchant | Per attempt or per order (merchant's choice — **one-to-many is legal**) | Not unique | Merchant | callbacks, `get-transactions-by-mc-ref`, portal |
| **PayWay transaction id** (`tran_id`) | Merchant-generated, gateway-scoped | **Per attempt** | Must be unique **per attempt**; ≤20 chars; `[a-zA-Z0-9-]` | Merchant (the CLI mints one) | every request, every response, callbacks, journal |
| **`ctid`** (consumer token id) | Gateway | Per linked credential | Gateway-issued | PayWay | CoF endpoints |
| **`request_id`** | Merchant | Per CoF linking operation | `[a-zA-Z0-9]{5,24}` | Merchant | CoF link/renew/details |
| **`pwt`** (PayWay token) | Gateway | Per linked credential | Gateway-issued, **secret** | PayWay | CoF charge |
| **APV / gateway receipt** | Gateway | Per approved payment | Gateway-issued | PayWay | transaction detail, portal, settlement report |
| **`correlationId` / `traceId`** | SDK / gateway | Per HTTP exchange | Unique per exchange | SDK (`randomBytes(8).toString('hex')`) / gateway (`status.trace_id`) | logs, journal, errors, ABA support escalation |
| **Settlement batch id** | Merchant's bank/report | Per settlement cycle | Merchant-derived | Merchant's report ingestion | never from an API |

**Correlation strategy (final):** `correlationId` is the SDK's join key across stdout ↔ journal ↔ error records ↔ `doctor`/`diagnose` evidence. `traceId` is the gateway's, extracted from `status.trace`/`trace` and surfaced beside `correlationId`. **`tran_id` is the join key across attempts, callbacks, and portal records — and it is NOT an idempotency key** (TX-008). `merchant_ref` must never be used for deduplication (repeat payments on one reference receive new `tran_id`s and may be an OVERPAID case).

## 20.2 Status vocabularies — which are whose

| Layer | Values | Provenance |
|---|---|---|
| **PayWay-native** | `payment_status_code ∈ {0,2,3,4,7}`; `payment_status ∈ {APPROVED, PENDING, DECLINED, REFUNDED, CANCELLED, PRE_AUTH}`; `status.code` per endpoint; payment-link `status ∈ {OPEN, PAID, VOIDED, …}`; token `expired_at` | Gateway. Never renamed, always preserved in `gateway.raw` |
| **SDK-normalized** | `PaymentOutcome ∈ {created, pending, approved, declined, cancelled, refunded, pre_auth, unknown}` | `normalizeTransactionState()` — the **only** mapping point |
| **Application-derived** | `expired_locally`, `closed_locally`, `needs_resolution`, `overpaid`, `settlement ∈ {unknown, pending, expected, matched, discrepancy}` | Merchant policy. **Never** written by a gateway normalizer (type-enforced) |

**Rule:** normalization may *add* clarity but must never *remove* a PayWay-native state. `gateway: {code, status, raw}` is always retained on `TransactionState`, so `PRE_AUTH` and `APPROVED` are never collapsed into one another (TX-002) and an unknown numeric code is preserved rather than mapped to `unknown`.

## 20.3 Final model

```ts
export type PaymentOutcome =
  | 'created' | 'pending' | 'approved' | 'declined' | 'cancelled'
  | 'refunded' | 'pre_auth' | 'unknown';

export interface TransactionState {
  transactionId: string;
  merchantRef?: string;
  outcome: PaymentOutcome;
  terminal: boolean;                 // gateway-terminal
  locallyTerminal: boolean;          // merchant policy (expiry/close) — never overwrites gateway state
  gateway: { code?: string | number; status?: string; raw?: unknown };   // PayWay-native, always preserved
  source: 'status-query' | 'callback' | 'journal' | 'local-policy';
  observedAt: string;
  correlationId?: string; traceId?: string;
  money: { amount: string; currency: 'USD'|'KHR'; payerAmount?: string; payerCurrency?: string };
  lifetime?: { minutes: number; expiresAt?: string; method: PaymentMethodClass;
               latePayment?: { reversalExpected: 'gateway-automatic'|'none'|'unknown' } };  // TX-LIFE-001..003
  fulfilment: { authorized: boolean; reason: string };
  settlement: 'unknown'|'pending'|'expected'|'matched'|'discrepancy';   // application-derived only
}

export type TransactionEvent =
  | { kind: 'creation-accepted'; at: string; transactionId: string; correlationId: string }
  | { kind: 'creation-rejected'; at: string; code: string; endpoint: string }
  | { kind: 'creation-unknown';  at: string; reason: 'timeout'|'network'|'circuit-open' }   // the state most SDKs lose
  | { kind: 'status-observed';   at: string; state: TransactionState; endpoint: string }
  | { kind: 'callback-received'; at: string; route: CallbackRoute; verified: boolean; verificationReason?: string }
  | { kind: 'callback-acknowledged'; at: string; httpStatus: number }
  | { kind: 'callback-duplicate'; at: string; key: string; previousEventId: string }
  | { kind: 'refund-initiated'|'refund-completed'|'refund-failed'; at: string; code?: string }
  | { kind: 'local-expiry'|'local-close'; at: string; policy: string }
  | { kind: 'funds-reversed-expected'; at: string; method: 'khqr'; ruleId: 'TX-LIFE-002' }   // expectation, not observation
  | { kind: 'settlement-expected'|'settlement-matched'|'settlement-discrepancy'; at: string; evidence: string };
```

**Four functions, one home (`core/lifecycle.ts`):**
- `normalizeTransactionState(input, source): TransactionState` — the only place numeric/string/callback shapes are mapped. `paymentLifecycle`, `classifyCallback`, poll outcomes, and `journal/intelligence` all delegate to it.
- `assertFulfillable(state, expected): void` — throws unless `outcome === 'approved'` **and** amount, currency, and transaction id match. Numeric code 0 alone is **insufficient** (TX-002). CLI form: `transaction verify`.
- `retryPolicyFor(operation): {safe, reason, requiresStatusQueryFirst}` — derived from `MUTATION_ENDPOINTS` + rules (§21).
- `resolveOutcome({callback, statusQuery}): TransactionState` — precedence: **status query wins on conflict; a callback is a hint that triggers a query.** Replaces prose currently duplicated in three guides.

**Exported duplicate protection:** `createAttemptStore({dataRoot}).reserve(transactionId) → 'new' | 'duplicate'`, backed by the journal (already the source). The CLI's warning becomes an SDK API, so library consumers get it too.

---

# 21. Retry and Idempotency Matrix

## 21.1 Per-operation classification

Vocabulary: `SAFE` · `CONDITIONALLY_SAFE` · `UNSAFE` · `UNKNOWN` · `REQUIRES_PAYWAY_CONFIRMATION`.

| Operation category | Connection failure (no bytes sent) | Timeout before response | HTTP 5xx | PayWay business error | Pending transaction | Callback delivery failure | Status lookup |
|---|---|---|---|---|---|---|---|
| **Read** (`check-transaction`, `transaction-detail`, `transaction-list`, `by-ref`, `exchange-rate`) | SAFE (bounded retry) | SAFE | SAFE | no retry — return the error | n/a | n/a | SAFE |
| **Payment creation** (`purchase`, `generate-qr`, `request-qr`, `payment-link create`) | **CONDITIONALLY_SAFE** — safe only with a **fresh `tran_id`**; never replay the same id | **UNSAFE** — outcome unknown ⇒ `creation-unknown`; query status first | UNSAFE (same) | no retry | n/a | n/a | n/a |
| **Refund** | CONDITIONALLY_SAFE with a fresh id | **UNSAFE** | UNSAFE | no retry (PTL codes are terminal per code) | n/a | n/a | n/a |
| **Payout** | CONDITIONALLY_SAFE with a fresh id | **UNSAFE** | UNSAFE | no retry | n/a | n/a | n/a |
| **Pre-auth complete / cancel** | CONDITIONALLY_SAFE — official `idempotency_key` exists and is supported by the SDK | **CONDITIONALLY_SAFE with an `idempotency_key`**; UNKNOWN without one | UNKNOWN | no retry | n/a | n/a | n/a |
| **Close / void transaction** | CONDITIONALLY_SAFE | **UNSAFE** | UNSAFE | no retry; PTL188 (double-void) is **terminal, not an error** | n/a | n/a | n/a |
| **CoF link-account / link-card** | CONDITIONALLY_SAFE with a fresh `request_id`/`ctid` | UNSAFE | UNSAFE | no retry | n/a | n/a | n/a |
| **CoF charge** | CONDITIONALLY_SAFE with a fresh `request_id` | **UNSAFE** | UNSAFE | no retry | n/a | n/a | n/a |
| **CoF renew / remove token** | CONDITIONALLY_SAFE | UNSAFE | UNSAFE | no retry | n/a | n/a | n/a |
| **Beneficiary add / update-status** | CONDITIONALLY_SAFE | UNSAFE | UNSAFE | no retry | n/a | n/a | n/a |
| **Self-activation** | UNKNOWN | **UNKNOWN — REQUIRES_PAYWAY_CONFIRMATION** | UNKNOWN | no retry | n/a | n/a | n/a |
| **Callback acknowledgement (merchant side)** | n/a | n/a | n/a | n/a | n/a | **merchant's responsibility**: accept durably, 2xx fast, process asynchronously and idempotently. PayWay does not retry (CB-007) | n/a |

## 21.2 Implementation (already correct; make it queryable)

`MUTATION_ENDPOINTS` (21 endpoints, verified complete) forces **single-attempt** transport for every side-effecting call; reads keep bounded retries with backoff; `Retry-After`/`x-retry-after` (delta-seconds and HTTP-date) is honoured; the circuit breaker is opt-in per endpoint. **The policy is right. The gap is that it is invisible:** nothing lets a caller or an agent ask "may I retry this?".

`retryPolicyFor(operation)` becomes the exported answer, sourced from `MUTATION_ENDPOINTS` + the rules registry, returning `{safe, reason, requiresStatusQueryFirst, freshIdRequired, idempotencyKeySupported}`. `request inspect` prints it as `transportPolicy`. `PayWayErrorRecord.retry` carries the same structure per error.

## 21.3 Idempotency — what exists and what must not be invented

| Mechanism | Status |
|---|---|
| Gateway idempotency key | **Only pre-auth** (`idempotency_key`, `src/domains/pre-auth.ts:9-10,89,122,145`). **No other endpoint documents one.** Do not invent one |
| `tran_id` as an idempotency key | **No.** Contested behaviour (TX-008) and the repo's own doctrine. Never presented as idempotency |
| Local attempt store | Exists as a CLI journal warning (`journalSawCreateFor`); **promote to an exported SDK API** (§20.3) |
| Merchant-side fulfilment idempotency | Documented as the merchant's responsibility (durable outbox, own idempotency key). Correct — keep, and make it a `go-live` evidence gate |
| Callback deduplication | `(tran_id, status)` key in `journal reconcile`; surface it at the listener (§22) |

**Explicit non-guarantee to document:** *PayWay provides no documented idempotency key for purchase, generate-qr, refund, payout, or CoF charge. A lost response on any of these is an unknown outcome. The only safe recovery is a status query, and the only safe re-attempt uses a fresh transaction id.* Anything stronger would be an invented guarantee.

---

# 22. Callback Architecture

## 22.1 The eight stages, and who owns each

| Stage | Owner | Implementation | Notes |
|---|---|---|---|
| **1. Raw receipt** | Merchant app (production) / CLI listener (development) | `webhook/server.ts`; merchant framework handler | Capture the **raw body bytes** — required for the Customer-Module contract (CB-004) and for any re-verification |
| **2. Parsing** | SDK | `classifyCallback` + route parsers (`khqr-notification`, `customer-callback`, `cof-callback`, `parsePaymentLinkPushback`) | Route determination first: the verification contract depends on it |
| **3. Validation** | SDK | `verifyCallbackDetailed` (sorted-key, CB-001) / `verifyCallbackSignatureRaw` (raw bytes, CB-004) / **none** for pushback and offline-KHQR (CB-005/006) | Returns a **reason**, not a boolean: `signature_mismatch \| malformed_signature \| empty_body` |
| **4. Acknowledgement** | Merchant app | 2xx fast (<5 s per CB-007); **401** on invalid signature (CB-002, official sample) | Validate and durably accept **before** processing |
| **5. Deduplication** | Merchant app, assisted by SDK | `(tran_id, status)` key (CB-008) | Status-*changing* pushbacks are legitimate; only a repeated pair is a replay |
| **6. Persistence** | Merchant app / CLI capture store | `webhook/storage.ts` (JSON/SQLite); journal | Digest mode allow-lists fields; full mode is opt-in |
| **7. Business processing** | **Merchant app only** | asynchronous, idempotent, durable outbox | **Never** the SDK's job and never the CLI's |
| **8. Transaction verification** | Merchant app, via SDK | `normalizeTransactionState` + `assertFulfillable` after a **status query** | The callback is a *hint*; the query is the *authority* (§20.3 `resolveOutcome`) |

## 22.2 The six required behaviours

| Situation | Required behaviour | Where enforced |
|---|---|---|
| **Callback duplicated** | Process once. Detect via `(tran_id, status)`; log `callback-duplicate`; return 2xx (an ACK is idempotent) | SDK exposes the key; merchant app decides. `webhook listen` reports `duplicate.isDuplicate` so the developer *sees* the requirement |
| **Callback delayed** | Never treat absence as failure. Poll on the local expiry policy; `journal reconcile` flags "creation without callback" for **investigation, not conclusion** | `journal/reconcile.ts` (already carries the honesty rule); `go-live` gate CALLBACKS-005 |
| **Callback malformed** | 4xx (400) and log; **do not** 2xx (a 2xx tells PayWay the delivery succeeded); do not process | merchant app; `webhook conformance` asserts it |
| **Callback contains unknown fields** | **Ignore them for verification purposes only if the official contract says so.** CB-001 sorts and concatenates *all* body keys, so an unknown field **changes the signature** — it must be included. Preserve it in the raw record; do not strip it | `verifyCallbackDetailed` (sorts all keys) + a fixture with an injected unknown field |
| **Processing fails after receipt** | Already 2xx'd ⇒ the merchant must retry from their own durable store. PayWay will not redeliver (CB-007) | merchant app; documented as a `go-live` evidence gate |
| **Transaction status differs from the callback** | **The status query wins.** Record both events; route to `needs_resolution`; never auto-fulfil and never auto-refund | `resolveOutcome`; `examples/first-payment` Late Payment Demo |

## 22.3 Layer placement (final)

| Belongs in | Content |
|---|---|
| **SDK** | route classification, all four verification contracts, `normalizeTransactionState`, `resolveOutcome`, `assertFulfillable`, fixtures |
| **CLI local listener** | capture, verify, classify, persist, forward, tunnel, duplicate reporting, `--expect/--fail-on` gating, the fixtures corpus, receiver conformance testing |
| **Merchant application** | acknowledgement policy, deduplication decisions, durable persistence, asynchronous processing, fulfilment, the status-query fallback, the local expiry policy |
| **Documentation** | the four contracts side by side, the six behaviours above, the 5-second/2xx/401 expectations, the "no retry" fact and its consequence |

**What the CLI listener must never do:** decide fulfilment, persist to the merchant's database, or imply that a captured callback is proof of payment. It is a development instrument.

---

# 23. QR Architecture

## 23.1 The eight concepts, separated

| Concept | What it is | Where it lives | Never confused with |
|---|---|---|---|
| **1. PayWay QR Payment API** | `POST /payments/generate-qr` — creates a **transaction** and returns a payload + image | `domains/qr.ts#generateQr` | offline generation |
| **2. KHQR payload generation** | Local EMVCo TLV assembly + CRC-16/CCITT — **no network, no keys, no transaction** | `khqr-offline/` | the QR API, HMAC signing |
| **3. KHQR payload string** | The `00020101…` EMVCo string. Produced by (1) *or* (2) | both | the image |
| **4. QR image rendering** | PNG/data-URI from a payload string; the API also returns `qrImage` and 7 templates | `qrcode` dep (CLI), API response | the payload |
| **5. Payment transaction** | The gateway-side record with `tran_id`, amount, currency, lifetime, status | `transaction` commands | the payload — **a payload can exist with no transaction (concept 2)** |
| **6. QR expiry / lifetime** | Minutes (official), min 3, max 120 days on QR / 30 days on purchase; per-method late-payment consequences (TX-LIFE-001…003) | `core/validation/rules` + `core/lifecycle` | local `expired_locally` policy |
| **7. Callback** | Route-specific: signed online, unsigned pushback, unsigned offline-KHQR notification, raw-byte Customer Module | `callbacks/` | status query |
| **8. Transaction verification** | Status query + `assertFulfillable` | `core/lifecycle` | callback receipt |

**The naming rule that prevents conflation:** *generating a payload is not creating a transaction.* `qr offline` produces concepts 2–4 and **no** concept 5; `qr create` produces 1, 3, 4, 5. Their outputs must be shaped differently so the distinction is visible in the JSON, not just the docs:

```jsonc
// qr create  → a transaction exists
{ "data": { "transaction": { "transactionId": "…", "outcome": "created" },
            "payload": { "qrString": "000201…", "format": "emvco-tlv" },
            "image":   { "pngPath": "…", "template": "template2", "dataUri": null },
            "lifetime":{ "minutes": 6, "unit": "minutes", "source": "official", "conflict": "QR-LIFE-001" },
            "verification": { "callbackContract": "signed-online" } } }

// qr offline → NO transaction, and the document says so
{ "data": { "transaction": null,
            "payload": { "qrString": "000201…", "format": "emvco-tlv", "crc": { "valid": true, "value": "…" },
                         "tlv": [ … ], "isStatic": false },
            "image":   { "pngPath": "…" },
            "network": { "used": false }, "signature": { "used": false, "note": "offline KHQR uses CRC-16/CCITT, never HMAC-SHA512" } } }
```

## 23.2 SDK API (final)

```ts
payway.qr.generateQr(params)            // concept 1 → transaction + payload + image
payway.qr.requestQr(params)             // Soundbox — verified: 'spec'
payway.qr.generateOfflineQR(params)     // concept 2 → payload string ONLY (rename target: buildKhqrPayload)
payway.qr.inspectKhqrPayload(str)       // concept 3 → TLV breakdown + CRC validity (exists; expose)
payway.qr.buildAbaPayDeeplink(str)      // concept 3 → deeplink (exists as a util; move here)
payway.qr.renderImage(str, opts)        // concept 4 → PNG/data URI (CLI-side dependency; SDK returns the API's qrImage)
```
**Renaming decision:** `generateOfflineQR` → `buildKhqrPayload` (with the old name kept as a deprecated alias) because "generate QR" is exactly the verb that conflates concepts 1 and 2. The return type is `string` today and stays `string`; the *name* is what changes.

## 23.3 CLI API (final)

`qr create | offline | customer | soundbox | inspect | templates` — six subcommands, disjoint flag sets, `verified` in every output, `--lifetime-unit` on `create`/`soundbox`, `--allow-unverified` required for `soundbox` in production. `qr deeplink` rejected (§14.2).

## 23.4 QR-specific defect list (final)

| ID | Defect | Fix | Phase |
|---|---|---|---|
| QR-D1 | `payment_option` membership not validated on `generateQr` (`qr.ts:120-135`) though `requestQr` validates it (`:191`) and official docs mark it required with 3 values | HARD for values in no official set; ADVISORY for profile enablement (code 23) | 1 |
| QR-D2 | `lifetime` optional locally, required officially | decide by probe (N-17); require or record the default as an assumption | 2 |
| QR-D3 | lifetime unit conflict | P0-03 | 0/2 |
| ~~QR-D4~~ | ~~max 120 vs official 30 days~~ | **WITHDRAWN** — official says 120 days; the repo is correct | — |
| QR-D5 | oversized-lifetime advisory uses a module-global one-shot flag and `console.warn` | `core/advisories` (P2-05) | 2 |
| QR-D6 | `qr_image_template` enum presented as fact | tag `source: sandbox` | 1 |
| QR-D7 ⟲ | `first_name`/`last_name` advisory text duplicates itself ("cap (err 16); gateway may reject with error 16") and the official ≤20 vs ≤100 self-contradiction is unrecorded | fix the message; record the conflict (N-16) | 3 |
| QR-D8 ⟲ | `items` cap wrong (10 vs official 50) | N-06 | 1 |

---

# 24. Error Architecture

## 24.1 Hierarchy (final)

```
PayWayError (abstract; type: PayWayErrorType; correlationId?; explain(): PayWayErrorRecord; toJSON())
├── PayWayConfigError            type 'config_error'      → PW-CFG-*   exit 1
├── PayWayValidationError        type 'validation_error'  → PW-VAL-*   exit 1
├── PayWayGuardError  (NEW)      type 'guard_error'       → PW-ENV-*/PW-SEC-*  exit 6
├── PayWayAPIError               type 'api_error'         → PW-API-*   exit 2
│     fields: statusCode, paywayCode, rawBodyRedacted, endpoint, operation, retryable,
│             rateLimitInfo, fieldErrors, responseUrl, hostedPage, correlationId, traceId
│   ├── PayWayBusinessError      type 'business_error'    → PW-RULE-*  exit 2
│   ├── PayWaySignatureError     type 'signature_error'   → PW-HASH-*  exit 2
│   └── PayWayRateLimitError     type 'rate_limit_error'  → PW-NET-0429 exit 3
├── PayWayNetworkError           type 'network_error'     → PW-NET-*   exit 3
├── PayWayTimeoutError           type 'timeout_error'     → PW-NET-0408 exit 3
└── PayWayWebhookError           type 'webhook_error' (NEW — was 'config_error') → PW-CB-* exit 4
```
**Changes from today:** add `webhook_error` and `guard_error` to the union; pass `type` through the constructor (delete all four `(this as {type}).type = …` casts); move the explanation registry into `core/errors.ts` so `explain()` needs no CLI.

## 24.2 Stable SDK error codes

Namespaced `PW-<CATEGORY>-<SPECIFIC>`, e.g. `PW-CFG-002` (missing API key), `PW-VAL-014` (transaction id too long), `PW-HASH-001` (gateway rejected the signature), `PW-API-SHAPE` (unexpected response shape, N-08), `PW-ENV-002` (coherence mismatch), `PW-SEC-004` (TLS bypass active), `PW-CB-001` (callback verification failed), `PW-NET-0429` (rate limited), `PW-GUARD-006` (production confirmation missing). Codes are **additive-only** and listed in `capabilities --errors`.

## 24.3 PayWay-native preservation (never lost)

`gateway: {httpStatus, paywayCode, message, traceId, raw}` is always retained verbatim on the record, **including when the code is unknown**. An unknown code produces:
```jsonc
{ "code": "PW-API-UNKNOWN", "category": "API_REJECTION", "severity": "error",
  "title": "PayWay rejected the request with an unrecognised code",
  "paywayCode": "77", "operation": "qr.create",
  "explanation": null,                       // ← never invented
  "causeStatus": "unknown",                  // known | likely | unknown (§24.4)
  "likelyCause": [],                         // ← empty when unknown
  "correction": "report this with the correlation id and trace id; run `payway diagnose --code 77 --operation qr.create`",
  "docRef": "payway docs errors#unknown-codes",
  "retry": { "safe": false, "reason": "the gateway rejected the request; retrying without a change cannot help" } }
```

## 24.4 Three distinct epistemic states (per §27)

| `causeStatus` | Meaning | Requirement |
|---|---|---|
| `known` | The code is in `errors.yaml` with `source: official` or a dated observation | An evidence file exists |
| `likely` | The code is known but its meaning for *this endpoint* is contested, or a symptom maps to several causes with evidence | `likelyCause[]` with per-item confidence and `requiredEvidence[]` |
| `unknown` | No authoritative meaning exists | `explanation: null`, `likelyCause: []`, and a correction that says how to find out. **Never invent an explanation** |

## 24.5 Endpoint-scoped registry (fixing N-01/N-02)

`errors.yaml` keyed **`endpoint:code`**, with `family` retained as a grouping alias for backward compatibility and for cross-endpoint codes (`PTL*`). Lookup: `explain <code> --operation <op>` → exact; bare `<code>` → if unique, return it; if ambiguous, return the first with `ambiguous: true` and `alternatives[]` listing every scope. The no-argument listing is grouped **by endpoint**. The "Meaning not individually published" string is forbidden by test for any code with official evidence.

## 24.6 Secret-safe serialization

`explain()`/`toJSON()` run `redact(value, 'json-output')`: `rawBodyRedacted` via `sanitizeForLog`; `hash`/`merchant_auth`/`pwt`/signature headers → `«REDACTED:…»`; API keys **absent**; identifiers masked beyond 4 characters. A canary sweep (§26) proves it for every command and every error class.

---

# 25. Logging and Observability

## 25.1 What is already correct (verified, keep)

`createPayWayLogger({level, format})` with pluggable `LogSink`; `PAYWAY_LOG_LEVEL`/`logLevel`/`logFormat`; `DEBUG_PAYWAY` routed through the logger with `trace_id` lines; `sanitizeForLog` applied to `onRequest`/`onResponse` hook payloads and every debug path (`client.ts:1604-1605, 1728, 1737`); `redactHookBodies` defaults to redacting and requires an explicit `=== false` to disable; journal modes `off|digest|full` with digest allow-listing; `correlationId`/`traceId` on every record; retention by days and bytes.

## 25.2 Changes (six, all small)

| # | Change | Reason |
|---|---|---|
| L1 | Route advisories through the logger (today `console.warn` in `utils.ts:44,198,161`) with **per-client** dedupe instead of a module-global `Set` | A long-running server currently sees each advisory once per process, then silence |
| L2 | Global CLI flags `--log-level trace\|debug\|info\|warn\|error\|silent`, `--log-format text\|json\|ndjson`, `--quiet`; all output to **stderr** | Verbosity is per-command ad-hoc today |
| L3 | `journal timeline --follow` and `journal show --redact --out <file>` replace the proposed `logs tail/redact/share` | Three commands rejected (§14.2); the journal already does this |
| L4 | Export `redact(value, policy)` with policies `log \| journal-digest \| json-output \| share-bundle \| human`, and make `sanitizeForLog` delegate to it | Two masking formats exist today; they must not diverge |
| L5 | Every error record and journal exchange prints the exact support-escalation line: `ABA support: tran_id=…, time=… (+07:00), correlationId=…, traceId=…` | Docs already tell merchants to provide `tran_id` + timestamps; the tool should produce the line |
| L6 | `redactHookBodies === false` in production triggers `doctor SEC-006` (warning); `logLevel: trace` in production triggers SEC-003 | The opt-outs exist and are invisible today |

## 25.3 Log modes (final)

| Mode | Trigger | Content | Invariant |
|---|---|---|---|
| `silent` | `--quiet` | stdout document only | nothing on stderr |
| `error` | default under `--output json` | errors + blockers | — |
| `info` | default human | result, advisories (deduped per client), next actions | — |
| `debug` | `--verbose` / `DEBUG_PAYWAY=1` | + endpoint, durationMs, attempt, correlationId, traceId, rate-limit headers | secrets still redacted |
| `trace` | `--log-level trace` | + redacted normalised body, hash field order, **preimage sha256 only** | **refused in production** without `PAYWAY_ALLOW_TRACE_IN_PRODUCTION=1`; the preimage itself is never logged — only `request inspect --show-preimage` prints it |

---

# 26. Testing Architecture

## 26.1 Per-module test matrix

| Module | Unit | Contract (mocked gateway) | Integration | Sandbox (live) | CLI | Security |
|---|---|---|---|---|---|---|
| `core/money`, `core/ids`, `core/time` | ✅ required (≥90% branches) | — | — | — | — | — |
| `core/validation` (syntactic/semantic/rules) | ✅ | — | — | — | ✅ via `request inspect` | — |
| `core/lifecycle` | ✅ | — | — | — | ✅ via `transaction verify` | — |
| `core/errors` + `errors.yaml` | ✅ | — | — | — | ✅ `explain` golden per endpoint | — |
| `auth/hmac`, `auth/rsa`, `auth/callback-signature` | ✅ + **golden vectors (§27)** | — | — | ✅ signature round-trip | ✅ `request sign` | ✅ canary |
| `config/*` | ✅ | — | — | — | ✅ `config show` | ✅ no secret in output |
| `transport/*` | ✅ | ✅ retry/breaker/rate-limit/cid/TLS/shape-assertion | — | ✅ one read-only probe | — | ✅ TLS bypass blocker |
| `domains/*` (12) | ✅ payload builders pure | ✅ per endpoint incl. hash order | — | ✅ `sandbox-contract` | ✅ per command | — |
| `callbacks/*` | ✅ | ✅ 4 routes × verified/unverified/malformed/replay/unknown-field | — | — | ✅ `webhook verify` | ✅ signature canary |
| `webhook/*` | ✅ | ✅ | ✅ local server + forwarder | — | ✅ `webhook listen` (both OSes) | ✅ body redaction |
| `observability/journal` | ✅ | — | ✅ JSON + **SQLite (all 4 suites)** | — | ✅ `journal *` | ✅ digest allow-list |
| `khqr-offline` | ✅ TLV + CRC vectors | — | — | — | ✅ `qr offline/inspect` | — |
| `diagnostics/doctor` | ✅ per check (pass/warn/fail/skip) | ✅ injected failing probe | — | ✅ `--live` nightly | ✅ golden JSON per route | ✅ no mutation |
| `diagnostics/request-inspect` | ✅ | ✅ **diff test vs actual send** | — | — | ✅ | ✅ canary + preimage |
| `diagnostics/diagnose` | ✅ | — | — | — | ✅ golden per symptom | — |
| `diagnostics/go-live` | ✅ | — | — | — | ✅ golden per synthetic project | — |
| `cli/output` | ✅ | — | — | — | ✅ **registry sweep** | ✅ canary sweep |
| `cli/commands/*` | — | — | — | — | ✅ golden human + JSON | ✅ |
| `mcp/*`, `agent/*` | ✅ | ✅ | — | — | ✅ | ✅ privacy/redaction (exists) |
| `testing/*` | ✅ | — | — | — | — | ✅ `.invalid` hosts only |

## 26.2 What must be mocked, and what must not

| Must be mocked | Must NOT be mocked |
|---|---|
| The HTTP transport for contract tests (injected `request`) | The **payload builders**, hash computation, normalisation, validation, classification — these are the thing under test |
| The gateway's response bodies (from `fixtures/`) | The **canonicalization** in `verifyCallbackDetailed` — it must run over real parsed JSON |
| The filesystem for profile/journal paths (temp dirs) | The **journal digest redaction** — it must run over the real event |
| `cloudflared` (a fake binary, per platform) | The **CRC-16/CCITT** computation for offline KHQR |
| The LLM provider (recorded plans) | The **risk/authorization** logic (`classifyRisk`, `authorizePlan`) |
| Time (for lifetime/expiry/rate-limit windows) | The **environment guard** |

**Rule:** mock at the boundary, never inside it. The existing suite already follows this (injected transports, `mockJsonResponse`); the fixture corpus formalises it.

## 26.3 The four new blocking gates

1. **CLI output-contract sweep** — parametrised over the whole registry: `--output json` accepted, exactly one document, `schemaVersion` present, `context` present, no ANSI, no stderr leakage, exit code in the published set, declared in `capabilities`.
2. **Secret canary sweep** — seed a canary for every credential class in §13.1, run every command with every flag combination against a mock gateway, assert no canary in stdout, stderr, the journal, or any log sink.
3. **Rules conformance** — (a) every `ruleId` referenced anywhere exists in `rules.yaml`; (b) every `source: official` rule has an evidence file with an **official-host** URL and a retrieval date ≤180 days old, else the rule degrades and the build fails (N-18); (c) every rule names ≥1 enforcement point in `{sdk, cli, test}`; (d) every `conflict` entry surfaces in `request inspect`, `doctor`, and `go-live`.
4. **Architecture boundaries** — the §6.2 import table, plus: no domain policy in `cli/**`; nothing imports `testing/**`; `core/` imports nothing in `src/`.

## 26.4 Test tiers and where they run

| Tier | Where | Credentials | Network | Duration budget |
|---|---|---|---|---|
| Unit + contract + CLI + knowledge + security | local `npm test`, PR CI (2 OS × 3 Node) | none | none | < 150 s (today: 130 s) |
| Packaging + smoke (ESM/CJS/types/bin/subpaths) | PR CI | none | none | < 60 s |
| Sub-project tests (`integrations/boilerplate/*`) | PR CI | none | none | < 120 s |
| SQLite suites (all 4) | PR CI (`sqlite-contract`, extended) | none | none | < 60 s |
| Live sandbox contract + probes | **nightly + pre-release only** | sandbox | sandbox only | < 10 min |
| Mutation (Stryker) on `auth`, `core/money`, `core/validation` | nightly, non-blocking, quarterly ratchet | none | none | < 30 min |

**Never touches production:** every tier. A CI-level assertion refuses to run the sandbox tier if `PAYWAY_ENV=production` is present, and no fixture, probe, or test may reference `checkout.payway.com.kh` as a target.

---

# 27. Golden Test Vectors

**Decision: yes — cryptographic behaviour requires immutable vectors.** The repository already pins hash *orders* (`hash-order-hints.test.ts`, `cof-subscription-parity.test.ts`) but not hash *outputs*. Order tests catch a reordered list; they do not catch a changed coercion, encoding, or canonicalization — exactly the failures N-11 (`String(val)`) and PO-003 (hex vs base64) would produce.

## 27.1 Vector format

```jsonc
// fixtures/vectors/hmac/generate-qr-001.json
{
  "vectorId": "hmac-generate-qr-001",
  "operation": "qr.create",
  "description": "Official 19-field order, all optional fields unset — the empty-position rule",
  "apiKey": "TEST_API_KEY_NOT_A_SECRET_0000000000",     // sanitized, obviously fake, ≥16 chars
  "algorithm": "sha512", "encoding": "base64",
  "fieldOrder": ["req_time","merchant_id","tran_id","amount","items","first_name","last_name","email",
                 "phone","purchase_type","payment_option","callback_url","return_deeplink","currency",
                 "custom_fields","return_params","payout","lifetime","qr_image_template"],
  "fieldOrderSource": "official:developer.payway.com.kh/qr-api-14530840e0 retrieved 2026-10-05",
  "input": { "req_time":"20260101000000", "merchant_id":"TESTMID", "tran_id":"TEST-1",
             "amount":"3.00", "payment_option":"abapay_khqr", "currency":"USD",
             "lifetime":6, "qr_image_template":"template2" },
  "normalization": [ {"field":"amount","from":3,"to":"3.00","ruleId":"AMT-001"},
                     {"field":"lifetime","from":6,"to":6,"ruleId":"QR-013","note":"unit under conflict QR-LIFE-001"} ],
  "preimage": "20260101000000TESTMIDTEST-13.00abapay_khqrUSD6template2",
  "preimageSha256": "…",
  "expectedSignature": "…",
  "provenance": { "generatedBy": "auth.generateHmac @ <commit>", "verifiedAgainst": "manual PHP hash_hmac reproduction" }
}
```

## 27.2 Required vector set (22 vectors)

| Group | Vectors |
|---|---|
| **HMAC — QR** | all-optional-unset (empty-position rule) · fully populated · unicode payer names · numeric-vs-string `amount` coercion · base64 `callback_url` · `lifetime` at each boundary (3, 6, 43200, 172800) |
| **HMAC — purchase** | 24-field official order with the 3 superset fields unset (**must equal** the 24-field result — pins hash-neutrality) · `ctid` set (position matters) · `token_flag`+`frequency` set · `payout` `{acc,amt}` vs `{account,amount}` |
| **HMAC — encoding** | base64 (default) · **hex (payout, PO-003)** · sha256 (self-activation exception) |
| **HMAC — rejection** | object in a hashed position → **throws** (N-11) · array → throws · boolean → coerces to `"true"`/`"false"` and is pinned so a change is deliberate |
| **RSA** | `encryptMerchantAuth` at 117-byte chunk boundaries (116/117/118 bytes, multi-chunk) with a **test-only 1024-bit key pair** committed as a fixture |
| **Callback — sorted-key** | CB-001 canonical body · body with a `hash` field (`stripHash` true/false) · nested object value (JSON-encoded) · array value · unicode · empty body → `empty_body` · bad signature → `signature_mismatch` |
| **Callback — raw-body** | CB-004 over exact bytes including whitespace differences (proves no re-serialization) |
| **KHQR offline** | a static and a dynamic payload with expected CRC-16/CCITT · a corrupted payload (CRC invalid) |

## 27.3 How vectors prevent regressions

1. **Immutability:** a vector file is append-only. Changing `expectedSignature` requires a second commit that records *why* and is flagged in review by a CODEOWNERS rule on `fixtures/vectors/**`.
2. **Bidirectional pinning:** the QR vector's `fieldOrder` is compared against `GENERATE_QR_HASH_FIELDS`, and the purchase vector's 24-field-neutral variant is compared against `PURCHASE_HASH_FIELDS` — so neither the constant nor the vector can drift alone.
3. **Provenance:** every vector records the generating commit and what it was verified against (a manual PHP `hash_hmac` reproduction, or a sandbox response). A vector with no `verifiedAgainst` is a self-fulfilling snapshot and is marked `provenance: self-referential` — permitted only for rejection/coercion cases where the *behaviour*, not an external truth, is being pinned.
4. **Sanitization:** keys are obviously fake (`TEST_API_KEY_NOT_A_SECRET_…`), merchant ids are `TESTMID`, RSA keys are test-only 1024-bit fixtures. A fixture lint rejects any 40-hex string that matches a known credential shape and any real PEM.
5. **Failure message:** a vector mismatch prints the expected vs actual preimage **sha256** and the first differing field position — never the API key.

---

# 28. Documentation Architecture

## 28.1 Is the first-pass architecture still valid?

**Yes in structure, over-built in volume.** The slug-based, job-shaped guides with generated reference are correct. Two corrections:
1. The first pass proposed ~22 guide pages plus 7 `integration-*` plus 4 one-offs reorganised into ~22 slugs. **Reduce to 16 guides.** Several first-pass pages (`webhook-testing`, `webhook-forwarding`, `soundbox`, `subscriptions`) are sections, not pages — a developer searching for "webhook" should land on one page, not choose between three.
2. The first pass did not specify **progressive disclosure** as a constraint. It is now the organising principle (§28.2), and it is what keeps a developer from needing architecture documentation to take a payment.

## 28.2 Progressive disclosure (the only navigation model)

```
README.md                    1 page · what it is, unofficial status, install, the 4 golden paths,
                             the product matrix, "where do I go next"
   ↓
getting-started/             4 pages · install · first-payment · configuration · environments
   ↓                         (a developer stops here for a working integration)
guides/                      16 pages, job-shaped · one page per job, each self-contained
   ↓                         (a developer reads ONE, chosen by the README table)
reference/                   GENERATED ONLY · cli.md|json · errors.md|json · rules.md|json ·
   ↓                         products.json · configuration.md · sdk/ (TypeDoc → Pages)
troubleshooting/             2 pages · symptoms → causes → commands · error-code index
```
**Constraint:** no page in `getting-started/` may link to `reference/` as a *prerequisite*, and no `guides/` page may require reading another `guides/` page first. Enforced by a link-direction test.

## 28.3 The 16 guides (final)

`online-qr` · `offline-khqr` · `hosted-checkout` · `payment-links` · `callbacks-and-webhooks` · `transactions-and-status` · `refunds` · `payouts-and-beneficiaries` · `credentials-on-file` (incl. subscriptions) · `pre-auth` · `error-handling` · `troubleshooting` · `reconciliation-and-settlement` · `security-and-secrets` · `production-readiness` · `ui-and-branding`.
Plus `getting-started/{install,first-payment,configuration,environments}` and `docs/index.md` as the single map.

## 28.4 Generation rules (unchanged from pass 1, still correct)

Reference docs are generated or they are wrong: `cli.md`/`cli.json` from the commander registry, `errors.md`/`errors.json` from `errors.yaml`, `rules.md` from `rules.yaml`, `products.json` from code, `configuration.md` from `env-vars.yaml`, SDK API docs to GitHub Pages (delete the 239 committed HTML files). A parity test asserts every command appears in `cli.md` and every documented flag exists — and vice versa. Numbered `docs/NN-*.md` paths become 6-line redirect stubs. Corpora (`knowledge/`, `docs-packaged/`, skill `references/`) are generated at `prepack`, not committed.

---

# 29. Single-Source-of-Truth Architecture

## 29.1 The justification test (applied to every proposed artifact)

A machine-readable file is justified **only if all four** hold:
1. Its truth is **external** to this repository (PayWay's documentation, ABA's answers, an observation) **or** it is **policy** that must be complete across modules (env vars, guardrails);
2. It has **≥3 real consumers** that cannot import the code defining the truth;
3. **Drift is detectable** by a test;
4. It has **one named owner**.

If the truth is *this repository's own code* (commands, checks, products, environments), **code is the source and JSON is generated** — a YAML copy would be a second source of truth and would drift.

## 29.2 Applying the test

| Artifact | Truth lives in | Authored or generated? | Consumers | Verdict |
|---|---|---|---|---|
| `rules.yaml` | ABA's documentation | **AUTHORED** | SDK validators, CLI checks, `request inspect`, `explain`, `go-live`, generated docs, skills, tests | ✅ 8 consumers, external truth |
| `errors.yaml` | ABA's documentation + observations | **AUTHORED** | `core/errors.explain()`, `explain`, `diagnose`, generated docs, MCP knowledge, tests | ✅ 6 consumers, external truth |
| `env-vars.yaml` | split across 12 modules today | **AUTHORED** | generated `env-registry.ts`, `.env.example`, `envValidator`, `doctor ENV-003`, `configure` completion, generated docs, tests | ✅ 7 consumers; the only way to make the set *complete* and testable (P1-04) |
| `guardrails.yaml` | policy | **AUTHORED** | `AGENTS.md`, `llms.txt`, skills, MCP instructions, tests (identity) | ✅ 5 consumers, one text |
| `capabilities.json` | the commander registry | **GENERATED** | completions, `capabilities`, `reference/cli.md`, `llms.txt`, MCP catalog, agent tool selection, tests | ✅ generated, never authored |
| `doctor-checks.json` | `diagnostics/doctor/checks/*.ts` | **GENERATED** | `doctor --check` validation, docs, `go-live`, tests | ✅ generated |
| `products.json` | `ENDPOINTS` + a readiness map in code | **GENERATED** | `capabilities --products`, docs matrix, `agent/readiness`, tests | ✅ generated |
| `environments.json` | `BASE_URLS` + guard policy | **GENERATED** | `env`, `sandbox info`, `doctor`, docs | ✅ generated |
| `symptoms.yaml` | — | **REJECTED** | `diagnose` logic is code; only its `ruleId` links are data (already in `rules.yaml`) | ❌ fails test 1 and 2 |
| `conflicts.yaml` | — | **REJECTED as a file**; becomes a `conflict` field on a rule in `rules.yaml` | same consumers | ❌ a separate file would duplicate rule identity |
| `go-live.yaml` | — | **REJECTED as authored YAML**; gates are code (`diagnostics/go-live/gates/*.ts`) referencing `ruleId`s, exported as generated JSON | `go-live`, docs | ❌ gates are executable |
| `decision-trees.yaml` | — | **REJECTED**; trees live in `docs/guides/troubleshooting` prose and in `diagnose` code | — | ❌ fails test 2 (a YAML tree has no consumer that can execute it) |
| `evidence/*.md` | external sources | **AUTHORED** (quote + URL + retrieval date) | rules-conformance test, `rules`/`explain` output, human review, ABA escalations | ✅ the expiry mechanism that prevents N-01/N-06/P0-02/P0-03 |

**Result: 4 authored files (+ evidence), 5 generated, 4 rejected.** Down from the first pass's 9 authored.

## 29.3 Ownership, drift detection, and change response

| Artifact | Owner | Drift detection | When PayWay behaviour changes |
|---|---|---|---|
| `rules.yaml` + `evidence/` | SDK maintainer | `rules-conformance.test.ts`: evidence URL host allow-list, ≤180-day expiry, enforcement-point presence, conflict surfacing | Evidence expires → rule auto-degrades to `unverified` → `go-live` reports UNVERIFIED, `request inspect` shows the conflict, the build fails on the conformance test. A human re-verifies and commits new evidence, or records a conflict with an ABA question |
| `errors.yaml` | SDK maintainer | `gen:error-registry --check` in CI; official-table harvest diff | New/changed code → harvest updates the evidence file; the entry is updated; `explain` golden tests update |
| `env-vars.yaml` | DX maintainer | AST scan of `src/**` for `process.env.PAYWAY_*` reads | A new variable without a registry entry fails the build |
| `guardrails.yaml` | Maintainer | identity test across the 4 renderings | One edit, four surfaces |
| Generated JSON | build | parity tests vs the code that generates them | Cannot drift by construction |

## 29.4 Deletion list (what stops being a source of truth)

`src/constants.ts` enum arrays (→ generated from `rules.yaml`, re-exported for compatibility) · `src/cli/explain-code.ts` code tables (→ generated from `errors.yaml`; the module becomes a thin loader) · `src/config/envValidator.ts` `KNOWN_VARS` (→ generated registry) · hand-written `docs/reference/SDK-AND-CLI-REFERENCE.md` (→ generated `cli.md` + `errors.md` + `rules.md`) · `docs/NN-*.md` mirrors (→ redirect stubs) · `docs/api/**` (→ Pages) · committed `knowledge/`, `docs-packaged/`, skill `references/` (→ `prepack`) · `.zcode/skills/**` (→ installer output) · `docs/aba-payway-coverage-report.json` (→ generated or deleted) · `.zcodeignore` (→ merged) · `AGENTS.md`'s dated relay changelog (→ `docs/agents/evidence-log.md`) · `.agents/AGENTS.md` (→ merged into `AGENTS.md` + `docs/agents/domain-*.md`).

---

# 30. AI-Agent Architecture

## 30.1 The test case: *"Implement ABA PayWay QR payment support in this application."*

Can an agent, dropped into a consumer project with this repository installed, reliably determine each of the following?

| Must determine | Today | After the plan | Mechanism |
|---|---|---|---|
| Which repository instructions to read | **No.** Four competing entrypoints; the mandated one is 107 KB | **Yes.** `AGENTS.md` ≤250 lines, generated per-tool adapters, everything else linked | §31 |
| Which PayWay product applies | **Partly.** `llms.txt` and the README route table are good; readiness (official vs spec-derived) is prose | **Yes.** `payway capabilities --products --output json` returns the matrix with `verified` per product | §38, §29 |
| Which API/module applies | **Partly.** `PayWay` vs `sdk` is undecided in the docs | **Yes.** §9.2's documented division, rendered into the generated SDK reference and `llms.txt` | §9.2 |
| Which rules must be respected | **No.** Rules are prose + TS constants across ~10 locations per rule | **Yes.** `rules.yaml` with `source`, `deterministic`, `enforcement`, `conflict`; surfaced by `request inspect` and `explain` | §19, §29 |
| Which tests must run | **Partly.** `CONTRIBUTING.md` lists them; the order contradicts CI | **Yes.** `AGENTS.md` §6 lists the exact sequence and CI runs the same sequence | §33 |
| Which files it may edit | **No.** Nothing declares ownership or forbidden paths | **Yes.** `AGENTS.md` §2 repo map + `CODEOWNERS` + the architecture-boundary test + per-skill `prohibited_tools` | §31, §37 |
| What constitutes completion | **No.** No definition of done anywhere | **Yes.** §35, machine-checkable via `payway go-live check` + the four blocking gates | §35 |

**Verdict: 1 of 7 today, 7 of 7 after.** The gap is entirely *deterministic checkpoints*, not intelligence — which is why §34 matters more than §33.

## 30.2 The agent architecture (five layers)

```
L1 ENTRYPOINT      AGENTS.md (≤250 lines) + generated CLAUDE.md/.cursorrules/copilot-instructions (3-line pointers)
L2 KNOWLEDGE       layered, on-demand: domain index → product knowledge → rule/reference (§31)
L3 SKILLS          11 job-shaped skills with triggers, allowed/prohibited tools, validation, escalation (§32)
L4 DETERMINISTIC   the CLI as the agent's hands: capabilities, env current, doctor, request inspect,
   TOOLS           explain --operation, transaction verify, go-live check, webhook listen --expect, npm test (§34)
L5 ENFORCEMENT     guardrails rendered from one source (§33) + technical gates that do not depend on the
                   agent obeying anything: env-guard exit 6, rules-conformance test, evidence expiry,
                   canary sweep, architecture boundaries, repository manifest
```
**Design principle:** *L5 must make the important rules true even if L1–L4 are ignored.* Prompt instructions are a convenience; the guard, the conformance test, and the expiry mechanism are the control. Every guardrail in §33 names the technical mechanism that enforces it, or is explicitly marked prose-only (and then it is a SHOULD, never a MUST).

## 30.3 Expected agent workflow (the canonical loop)

```
understand task
   ↓ read AGENTS.md (§1 identity, §3 non-negotiables, §5 protocol)          ~2.5k tokens
   ↓ payway capabilities --products --output json     → pick the product, read `verified`
load relevant knowledge
   ↓ payway docs <topic> --output json                → ONE topic, not the corpus
   ↓ the matching skill (11)                          → workflow, allowed/prohibited tools, escalation
inspect existing implementation
   ↓ read the merchant's code; payway config show --output json  → what is already configured
validate environment
   ↓ payway env current --output json                 → environment, endpoint, coherence, guard
   ↓ payway doctor --route <route> --output json      → blockers first, then errors, then warnings
make constrained change
   ↓ write code against the SDK; never restate a PayWay rule in a prompt — cite a ruleId
   ↓ payway request inspect <operation> … --output json   → what will actually be sent
run deterministic checks
   ↓ npm run typecheck && npm run lint && npm run format:check
   ↓ npm test                                          → never "I believe the tests pass"
verify PayWay rules
   ↓ payway doctor --check <ids>                       → re-run only what was fixed
   ↓ (sandbox) payway sandbox verify / webhook listen --expect … --fail-on unverified
check Definition of Done
   ↓ payway go-live check --output json                → for production-bound work
   ↓ AGENTS.md §7 checklist                            → for any change to this repository
escalate
   ↓ if a rule is UNVERIFIED on a money path, if conflicts.yaml has an open entry for the
     operation, if the guard refuses, or if evidence is missing → STOP and ask a human (§33)
```

## 30.4 MCP and the LLM agent (unchanged — they are already right)

`mcp serve` exposes 12 read-only tools always and 17 mutating tools only with `--allow-mutations`/`PAYWAY_MCP_ALLOW_MUTATIONS=1`, with `readOnlyHint` annotations. `ask`/`agent` classify risk (`safe|sandbox|production|blocked`), gate on capability readiness, redact before any provider call, require a privacy acknowledgement, and record an execution ledger with `recover`/`prune` that never deletes unfinished records. `--yolo` authorises sandbox only. **Second-pass change:** `src/agent/risk.ts` delegates to the shared `core/env-guard.ts` (§12) so the CLI and the agent cannot diverge, and the MCP instructions field renders `guardrails.yaml` verbatim (§33) so the same MUST/MUST NOT text reaches MCP clients.

---

# 31. Agent Knowledge Hierarchy

## 31.1 The context budget (the binding constraint)

| Layer | Budget | Loaded when | Content |
|---|---|---|---|
| **L1 always-loaded** | **≤ 2,500 tokens** (`AGENTS.md` ≤250 lines) | every task | identity/scope, repo map (≤20 lines), MUST/MUST NOT (verbatim from `guardrails.yaml`), evidence discipline, task protocol, validation commands, definition of done, escalation, "where to look next" |
| **L2 domain index** | ≤ 1,000 tokens | on demand | `docs/agents/index.md`: one line per domain → the file to read |
| **L3 domain knowledge** | ≤ 4,000 tokens each | on demand, one at a time | `docs/agents/domain-{payments,crypto,callbacks,qr,money-out,recurring}.md` |
| **L4 reference** | unbounded | by query, never by reading | `payway docs <topic> --output json`, `payway explain`, `payway capabilities`, generated `reference/*.json` |
| **L5 evidence** | unbounded | by citation | `knowledge/rules/evidence/*.md` — quoted, dated, URL'd |

**Hard rules:**
1. Nothing in L1 may be duplicated in L2–L4. `AGENTS.md` **points**, it never **states** a PayWay rule (enforced by the duplicate-source-of-truth detector in `agents-md.test.ts`).
2. No agent may be required to read a file larger than its layer budget. This is what removes the 107 KB `HANDOFF.md` mandate: its durable content is split into L3 domain files and L5 evidence, and its transient content leaves the public tree.
3. Generated per-tool adapters (`CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`) are 3-line pointers to `AGENTS.md`, generated by `scripts/generate/agent-adapters.mjs` so they cannot drift.
4. `llms.txt` remains a **separate genre** — it addresses *consumers of the library*, not contributors to the repository — and stays generated.

## 31.2 Target structure

```
AGENTS.md                                  L1 · ≤250 lines · 9 fixed sections
docs/agents/
├── index.md                               L2 · domain index, one line each
├── domain-payments.md                     L3 · purchase/QR/checkout, create≠approve, lifetime
├── domain-crypto.md                       L3 · hash orders, encodings, RSA, callback contracts —
│                                              cites ruleIds, never restates them
├── domain-callbacks.md                    L3 · the four verification contracts, the six behaviours
├── domain-money-out.md                    L3 · refund/payout/pre-auth/beneficiary, guards
├── domain-recurring.md                    L3 · CoF, tokens, subscriptions, expiry models
├── evidence-log.md                        L5 · dated ABA-relay/sandbox findings (what AGENTS.md's
│                                              changelog should have been)
├── contributing.md                        L3 · build, test tiers, PR expectations, commit style
└── issue-tracker.md                       L3 · existing
knowledge/rules/evidence/*.md              L5 · quote + URL + retrieval date, per rule
```
**Removed:** `.agents/AGENTS.md` (merged; a 3-line pointer remains at the path for one release if any tooling depends on it) · `HANDOFF.md` from the public tree (durable content → `docs/agents/evidence-log.md` and `evidence/`; transient content → the private line) · `AGENTS.md`'s dated relay changelog (→ `evidence-log.md`).

## 31.3 `AGENTS.md` — the nine fixed sections

| § | Content | Test |
|---|---|---|
| 1 | **Identity & scope** — unofficial SDK; never claim ABA endorsement; the repo is not proof of official behaviour | size; string presence |
| 2 | **Repository map** — directory → responsibility, ≤20 lines, from §37 | every path exists |
| 3 | **Non-negotiables** — MUST/MUST NOT rendered verbatim from `guardrails.yaml` | byte-identity with the YAML |
| 4 | **Evidence discipline** — official > official-api-behaviour > sandbox > production-telemetry > relay > repo > inference; `UNVERIFIED` is a valid answer; mirrors are never authority (N-18) | string presence |
| 5 | **Task protocol** — read → reproduce → change → validate → record, with the exact commands | every command exists in `capabilities` |
| 6 | **Validation commands** — the exact sequence CI runs | identical to `CONTRIBUTING.md` and `ci.yml` (three-way test) |
| 7 | **Definition of done** — §35, as a checklist | byte-identity with the DoD source |
| 8 | **Where to look next** — L2 index, skills, fixtures, `docs/agents/*` | every path exists |
| 9 | **Escalation** — when to stop and ask a human | string presence |

**Enforcement:** `src/__tests__/agents-md.test.ts` asserts the size budget, that every command shown exists in `capabilities`, that every referenced path exists, that `NODE_TLS_REJECT_UNAUTHORIZED` does not appear, that §3 and §7 are byte-identical to their sources, and that no rule statement appears in both `AGENTS.md` and `rules.yaml`.

---

# 32. Agent Skills Review

## 32.1 Applying the removal tests to the first pass's 14

| First-pass skill | Verdict | Reason |
|---|---|---|
| `payway-integrate` | **KEEP** (hub) | The entry skill; routes to the others |
| `payway-choose-product` | **MERGE into `payway-integrate`** | Fails the "only contains documentation / trivial routing" test — its content is `capabilities --products` plus the decision tree, both of which belong in the hub |
| `payway-online-qr` | **KEEP** | Distinct workflow, distinct rules, distinct failure modes |
| `payway-offline-khqr` | **KEEP** | Different primitive (CRC-16 vs HMAC); conflating them is the exact error the repo's own domain-separation rule forbids |
| `payway-hosted-checkout` | **KEEP** | Distinct; absorbs payment links (same product family, same RSA requirement, one workflow) |
| `payway-customer-qr` | **KEEP** | Distinct callback contract (raw-body HMAC) and distinct portal keying |
| `payway-authentication` | **KEEP** | The highest-value skill: signing, hash orders, `request inspect`, wrong-hash diagnosis |
| `payway-callbacks` | **KEEP** | Four contracts, six behaviours; the most error-prone area |
| `payway-transactions` | **KEEP** | Status semantics, 7-day window, UTC+7 windows, polling, verification |
| `payway-money-out` | **KEEP** | Refund/payout/pre-auth/beneficiary; the guard-heavy area |
| `payway-recurring` | **KEEP** | CoF/tokens/subscriptions/expiry models |
| `payway-troubleshoot` | **MERGE into a `payway-diagnose` skill? No — KEEP as `payway-troubleshoot`** | It is the only skill whose job is *evidence discipline* (confirmed/likely/possible/unknown); that is a distinct competency |
| `payway-sandbox-test` | **KEEP** | Sandbox limits are a distinct knowledge area and the source of most false confidence |
| `payway-go-live` | **MERGE into `payway-money-out` + `payway-troubleshoot`? No — KEEP** | Production readiness cuts across products; it is the only skill that owns the guard and the gates |

**Result: 14 → 11** after merging `payway-choose-product` into the hub and folding the three rejected CLI-command skills (`payway-agent-cli`, `payway-mcp` from today's 35 — they are documentation of commands, which `capabilities --output json` and `--help` already provide better).

## 32.2 The 11 skills, with triggers and boundaries

| Skill | Triggers (intents / codes / phrases) | Owns | Must NOT claim |
|---|---|---|---|
| `payway-integrate` | "integrate PayWay", "accept payments Cambodia", "add ABA Pay", "which product" | product selection, the golden paths, routing to the other 10 | any endpoint-specific rule (routes instead) |
| `payway-authentication` | sign, wrong hash, `code 1`, PTL02, PTL171/175, merchant_auth, RSA | hash orders, encodings, `request inspect`, preimage diffing | callback verification (→ `payway-callbacks`) |
| `payway-online-qr` | generate QR, KHQR online, scan to pay, `qr create` | generate-qr workflow, lifetime, templates, payment options | offline EMVCo (→ `payway-offline-khqr`) |
| `payway-offline-khqr` | offline QR, EMVCo, no network, POS, CRC | TLV assembly, CRC-16/CCITT, `qr inspect`, static vs dynamic | any HMAC signing — explicitly prohibited |
| `payway-hosted-checkout` | hosted page, checkout form, popup, payment link, `view_type`, `payment_gate` | purchase, local form, plugin, payment links | QR API specifics |
| `payway-customer-qr` | dedicated customer QR, Customer Module, soundbox, keypad | `qr customer`, `qr soundbox` (marked `verified: spec`), raw-body callback contract | online QR |
| `payway-callbacks` | webhook, callback, pushback, notification, signature mismatch | the 4 contracts, the 6 behaviours, listener + conformance testing | fulfilment policy (→ `payway-transactions`) |
| `payway-transactions` | check payment, status, list transactions, poll, reconcile, settle | status semantics, 7-day window, UTC+7, verification, journal, reconciliation | settlement report ingestion (does not exist) |
| `payway-money-out` | refund, payout, split, beneficiary, pre-auth capture | refund/payout/pre-auth/beneficiary, guards, money invariants | payment creation |
| `payway-recurring` | subscription, recurring, card on file, token, link card | CoF linking, tokens, expiry models, flags | one-off payment creation |
| `payway-troubleshoot` | "not working", any error code, "why did it fail" | evidence discipline, `diagnose`, `explain --operation`, journal forensics | inventing a cause — prohibited by its own validation block |
| `payway-go-live` *(11th)* | production, go live, launch, checklist | environment switch, guards, `go-live check`, evidence attachment | claiming a gate PASSes without evidence |

*(That is 12 rows because `payway-integrate` is the hub; the count of non-hub skills is 11. Both numbers are stated to avoid ambiguity: **11 skills total, 1 hub + 10 domain**.)*

**Trigger-uniqueness rule:** no two skills may claim the same intent, code, or phrase. Enforced by a test that builds the union of all `triggers` and fails on any duplicate — this is the mechanism that prevents "multiple skills claiming the same task".

## 32.3 Per-skill schema (validated, not conventional)

Retained verbatim from the first pass (§23.3), with two amendments:
1. `authoritative_source.forbidden` **must** be non-empty and must include `AGENTS.md`, `HANDOFF.md`, `.scratch/**`, `docs/archive/**`, and any third-party mirror (N-18).
2. A new required block, `rule_dependencies: [ruleId, …]`, listing every rule the skill relies on. `payway skills doctor` verifies each still exists in the installed `rules.yaml` — so a stale skill cannot teach a deleted rule.

`skills-lock.json` covers **all** skills (first-party included) with `{name, version, sha256, source, license, upstream?}`; `references/` is generated at pack time; `assets/*.ts` becomes a generated manifest pointing at `examples/integration-recipes/` rather than a copy.

---

# 33. Agent Guardrails

One source (`knowledge/rules/guardrails.yaml`), four renderings (`AGENTS.md` §3, `llms.txt`, every `SKILL.md`, the MCP instructions field), byte-identity tested. **Each guardrail names the technical mechanism that enforces it**; a guardrail with no mechanism is a SHOULD, never a MUST.

## 33.1 MUST NOT (with enforcement)

| # | MUST NOT | Technical enforcement (not prose) |
|---|---|---|
| 1 | Invent PayWay API fields | Generated `src/types.ts` from the OpenAPI spec; `no-explicit-any` in `domains/**`; a test that every request body key appears in the spec or in `rules.yaml` |
| 2 | Invent PayWay error meanings | `errors.yaml` is the only source of titles/hints; `explain` returns `causeStatus: 'unknown'` with `explanation: null` for an unregistered code; a test forbids free-text error explanations outside the registry |
| 3 | Invent PayWay retry guarantees | `retryPolicyFor()` is generated from `MUTATION_ENDPOINTS` + rules; `MUTATION_ENDPOINTS` forces single-attempt transport at the type level; the §21.3 non-guarantee is documented |
| 4 | Send production payments to verify code | `core/env-guard` exit 6 without `--confirm-production`; `-y` never substitutes; sandbox-only commands refuse production; CI refuses the sandbox tier when `PAYWAY_ENV=production` |
| 5 | Print credentials | `redact(value, policy)` on every output path; the canary sweep; `sanitizeForLog` on hooks and debug; `redaction.applied[]` in every document |
| 6 | Disable validation to make tests pass | `strictValidation` semantics are defined in one place; a test asserts the validator set is unchanged when `strictValidation` is false (it changes *escalation*, never *coverage*); `advisoryIgnore` requires a rule id, so suppression is explicit and greppable |
| 7 | Change cryptographic behaviour without test vectors | CODEOWNERS on `fixtures/vectors/**` and `auth/**`; the 22 golden vectors; a CI check that any diff touching `auth/**` without touching `fixtures/vectors/**` requires an explicit label |
| 8 | Silently modify environment selection | `resolveEnvironmentContext` is the only derivation; `context.environment` + `context.guard` in every JSON document; `doctor ENV-002` blocker; `env use` prints a diff |
| 9 | Treat callbacks as settlement confirmation | `TransactionState.settlement` is type-unsettable from any gateway normalizer; `assertFulfillable` requires a status query; `go-live` FINANCE gates are evidence-required |
| 10 | Set `NODE_TLS_REJECT_UNAUTHORIZED` | `doctor SDK-004` blocker; a repo-wide grep test with an allow-list; `tlsCaFile` provided as the alternative |
| 11 | Treat repository behaviour as proof of official PayWay behaviour | Every rule carries `source`; `request inspect` prints `fieldOrderSource`/`source` per normalisation; `capabilities` prints `verified`; evidence expiry auto-degrades to `unverified` |
| 12 | Add a second source of truth | The §29.4 deletion list; the duplicate-source detector in `agents-md.test.ts`; `rules-conformance` requires every `ruleId` reference to resolve to `rules.yaml` |
| 13 | Pass a secret in argv | `--*-file`/`--*-stdin` alternatives for every secret-bearing flag; `doctor SEC-004` warns on inline secrets |
| 14 | Commit `.env`, journals, captures, token stores, or generated corpora | `check-repository` + the `repository-manifest` allow-list; `doctor SEC-001`/`DATA-003` blockers; `.gitignore` with explicit paths |
| 15 | Retry a mutation endpoint automatically | `MUTATION_ENDPOINTS` single-attempt transport; `retryPolicyFor().safe === false` |
| 16 | Claim ABA endorsement, official status, or a finance sign-off | README/`SUPPORT.md`/`llms.txt`/guide headers carry the unofficial notice; `go-live` UI/branding gates are `aba-confirmation-required`, never `PASS` |

## 33.2 MUST (with enforcement)

| # | MUST | Enforcement |
|---|---|---|
| 1 | Treat a successful creation as `created`, never `approved` | `PaymentOutcome` has no path from `created` to `approved` except a normalizer fed by a status query or a verified callback; `assertFulfillable` throws otherwise; `transaction verify` is its CLI form; a `go-live` BLOCKER gate detects its absence statically |
| 2 | Verify every callback with its route's contract | `classifyCallback` returns the contract; `webhook conformance` tests the merchant's receiver; fixtures exist for all four routes including the two unsigned ones |
| 3 | Reject an unverified callback and not process it | `verifyCallbackDetailed` returns a reason; `webhook listen --fail-on unverified` exits 4; conformance asserts a 401 |
| 4 | Keep `tran_id` ≤20 chars, unique per attempt, fresh on retry | `core/ids`; `createAttemptStore().reserve()`; the CLI duplicate warning; `rules.yaml` TX-004/QR-004 |
| 5 | Query status before retrying a timed-out mutation | `creation-unknown` event kind; `retryPolicyFor().requiresStatusQueryFirst`; `diagnose --symptom timeout-unknown-outcome` |
| 6 | Keep secrets out of logs, journals, JSON, issues, and provider payloads | §13.2 table, each row with a named mechanism |
| 7 | Cite provenance for any asserted PayWay behaviour; mark `UNVERIFIED` when none exists | `rules.yaml` `source` is a required field; the conformance test rejects a rule without one; `request inspect` and `capabilities` surface it |
| 8 | Run the validation set before declaring done | `AGENTS.md` §6 = `CONTRIBUTING.md` = `ci.yml` order, three-way identity test |
| 9 | Use `NODE_EXTRA_CA_CERTS`/`tlsCaFile` for a corporate CA | `doctor NET-003` names the fix; `tlsCaFile` exists |
| 10 | Require explicit human authorisation for a production money movement | `--confirm-production`, exit 6, TTY typed confirmation |
| 11 | Keep offline KHQR (CRC-16) and online QR (HMAC-SHA512) strictly separate | Separate directories (`khqr-offline/` imports no `auth/`), separate commands, separate skills, and a boundary test forbidding `khqr-offline/**` from importing `auth/hmac` |
| 12 | Journal every money-moving CLI exchange | Journal on by default; `--no-journal` is recorded in the journal-context as an explicit opt-out; `doctor DATA-002` |

## 33.3 SHOULD / SHOULD NOT / MAY

Retained from the first pass (§30 there) with three changes: (a) "enable `strictValidation` in CI" now carries the caveat that its semantics are redefined first (§10.2) — under today's semantics it would reject valid values; (b) the SHOULD about polling frequency now cites `retryPolicyFor()` rather than prose; (c) MAY gains "MAY use `--allow-unverified` in production for `qr soundbox`/`self-activation` only with `--confirm-production` and a recorded reason".

---

# 34. Deterministic Agent Tooling

The principle: **an agent must not reason about anything a command can answer.** Each row replaces a reasoning step with a deterministic checkpoint.

| Instead of reasoning… | Execute | Guaranteed property |
|---|---|---|
| "I think this configuration is correct" | `payway doctor --route <r> --output json` | exit 0/1/3/5; every check has an id, severity, and a fix command |
| "I think I'm pointed at sandbox" | `payway env current --output json` | the endpoint, not the label, is authoritative; coherence reported |
| "I think this request is signed correctly" | `payway request inspect <op> … --output json` | the exact body, field order, provenance, and any open conflict — **and a diff test proves it equals what would be sent** |
| "I think `abapay_khqr` is valid here" | `payway explain --operation <op> --output json` + `request inspect`'s `validation` | the answer comes from `rules.yaml` with a source tag, not from memory |
| "I think code 16 means invalid amount" | `payway explain 16 --operation checkout.purchase --output json` | endpoint-scoped; `ambiguous: true` + `alternatives[]` when it is not |
| "I think the payment succeeded" | `payway transaction verify --current --expect-amount … --expect-currency … --expect-status approved` | exit 0 only when the gateway says so **and** the money matches |
| "I think my webhook works" | `payway webhook listen --expect payment.approved --fail-on unverified --output ndjson` + `webhook trigger` | exit 0/4/5; duplicate detection reported |
| "I think the tests pass" | `npm test` / `npm run typecheck` / `npm run format:check` | exit codes; never a belief |
| "I think we're ready for production" | `payway go-live check --output json` | 18 gates; no PASS without evidence; UNVERIFIED never counted as PASS |
| "I think this failure is because X" | `payway diagnose --symptom <s> --from-journal --output json` | confirmed/likely/possible/**unknown**; a cause reaches `confirmed` only with named local evidence |
| "I think this command exists / takes this flag" | `payway capabilities --output json` | the registry, not `--help` prose |
| "I think this rule is current" | `rules.yaml` `source` + `evidence/<id>.md` retrieval date, surfaced by `request inspect` | ≤180-day expiry, else auto-degraded to `unverified` |
| "I think the amount formatting is right" | `request inspect`'s `normalization[]` | each entry cites a `ruleId` and marks `divergent`/`substituted` |
| "I think this is safe to retry" | `retryPolicyFor(operation)` (SDK) / `request inspect`'s `transportPolicy` | derived from `MUTATION_ENDPOINTS` + rules |

**Coverage requirement:** every skill's `workflow` block must consist of deterministic checkpoints from this table plus code edits. A skill step that says "verify that…" without naming a command fails the skill schema test.

---

# 35. Definition of Done

Repository-wide, objective, and machine-checkable wherever possible. `AGENTS.md` §7 renders it; `payway go-live check` evaluates the integration-facing subset; CI evaluates the rest.

| Category | Criterion | Machine-checkable by |
|---|---|---|
| **Implementation** | The change lives in the layer §6.2 assigns it; no domain policy in `cli/**`; no new module imports across a forbidden boundary | `architecture-boundaries.test.ts` |
| **Implementation** | No new hard-coded endpoint, currency default, enum, limit, or unit outside `core/` + `rules.yaml` | grep test + `rules-conformance` |
| **Types** | Public types exported from the correct subpath; no `any` or non-null assertion outside an approved file; generated types not hand-edited | `biome lint` (overrides removed) + a `src/types.ts` immutability test |
| **Validation** | Every new PayWay rule has a `ruleId`, a `source`, an enforcement point, and (if `official`) an evidence file ≤180 days old | `rules-conformance.test.ts` |
| **Validation** | Validation runs before signing and before any network I/O | `request inspect` diff test + a transport-mock assertion |
| **Tests** | Unit tests for new pure logic (≥90% branches in `core/`, `auth/`, `domains/`); a golden vector for any change to `auth/**`; a fixture for any new gateway response shape; CLI changes covered by the registry sweep | coverage floors + CODEOWNERS + fixture parity + contract sweep |
| **Tests** | `npm test` passes on Linux **and** Windows with 0 failures and 0 unexpected skips | CI matrix |
| **Documentation** | Any command change regenerates `reference/cli.md`/`cli.json`; any rule change regenerates `reference/rules.md`; any error change regenerates `errors.md`/`error-codes.json` | parity tests + `gen:* --check` |
| **Documentation** | No hand-written reference prose added; no new documentation mirror created | `check:repository` + the manifest allow-list |
| **Examples** | Any example touched still compiles (`docs-examples.test.ts`) and uses the current API; no example targets production | example compile test + a grep test for `checkout.payway.com.kh` in `examples/`, `docs/`, `skills/` |
| **CLI compatibility** | New commands appear in `capabilities` with `readOnly`/`mutating`/`moneyMoving`/`requiresRsa`/`environmentsAllowed`/`verified`; removed or renamed commands keep a hidden alias with a stderr deprecation and an entry in `capabilities.aliases` | registry sweep + alias-parity test |
| **CLI compatibility** | Output conforms to the envelope; exit codes are from the published set; no ANSI or stderr content on stdout in machine mode | registry sweep |
| **Agent knowledge** | If a rule, command, error, or env var changed: the relevant skill's `rule_dependencies` and `allowed_tools` are updated; `guardrails.yaml` is unchanged unless the change is a guardrail | skill schema test + trigger-uniqueness test |
| **Agent knowledge** | `AGENTS.md` stays ≤250 lines and states no PayWay rule | `agents-md.test.ts` |
| **Security** | No secret in argv, stdout, stderr, journal, log sink, fixture, or JSON output for the touched commands | canary sweep |
| **Security** | New configuration variables are in `env-vars.yaml` with `secret: true|false` and appear correctly in `.env.example` | `env-registry-conformance.test.ts` |
| **Sandbox verification** | Any change to signing, normalisation, an enum, a bound, or a unit has a **recorded probe result** in `evidence/` or an explicit `REQUIRES_PAYWAY_CONFIRMATION` marker | `rules-conformance` + probe runner |
| **Production safeguards** | Any new mutating command is classified in §12.2 and gated by `core/env-guard`; no new command may reach the network in production without the guard | guard test matrix |
| **Changelog** | A changeset exists with `{type, scope, breaking, ruleIds[], migrationRef?}` | changesets CI check |

**Programmatic evaluation:** `payway go-live check --category definition-of-done --output json` runs the integration-facing subset against a merchant project; `npm run check:done` (a new aggregate script) runs the repository-facing subset locally and in CI. Both emit the §16 envelope, so an agent can evaluate completion without reading prose.

---

# 36. Traceability Matrix

Requirement → architecture component → source module → validation → test → documentation → CLI capability → agent knowledge. **The right-hand columns expose requirements that are documented but not enforced.**

| Requirement | Component | Source module | Validation | Test | Docs | CLI | Agent knowledge | Enforced? |
|---|---|---|---|---|---|---|---|---|
| Creation ≠ approval | `core/lifecycle` | `payment-lifecycle.ts` → `core/lifecycle.ts` | `assertFulfillable` | ✅ lifecycle tests | ✅ 3 guides | ⚠ **no `transaction verify` today** | ✅ skills | **Partly — doc+SDK, no CLI gate** |
| Callback verification per route | `auth/callback-signature`, `callbacks/` | `auth.ts`, `webhook/*-callback.ts` | `verifyCallback*` | ✅ | ✅ 4 guides | ✅ `webhook verify` | ✅ skill | **Yes** |
| Unverified callback rejected | merchant app | — | — | ⚠ fixtures only | ✅ | ⚠ no conformance command | ✅ skill | **NO — documented only** |
| Callbacks are not retried ⇒ status-query fallback | merchant app | — | — | ❌ | ✅ 3 guides | ❌ | ✅ skill | **NO — documented only** |
| `tran_id` ≤20 + charset | `core/ids` | `utils.ts#validateTransactionId` | HARD | ✅ | ✅ | ✅ `validate` | ✅ rule | **Yes** |
| `merchant_id` ≤30 | `core/ids` | — | ❌ | ❌ | ❌ | ⚠ `doctor` only after plan | ❌ | **NO** |
| Amount ≥ per-currency floor | `core/money` | `utils.ts#validateAmountFloor` | **ADVISORY** | ✅ | ✅ | ✅ | ✅ rule | **Partly — advisory, official says hard** |
| Amount precision (USD 2dp / KHR int) | `core/money` | `utils.ts#validatePositiveAmount` | HARD | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Amount wire type | `core/money` | `utils.ts#formatAmount` | HARD (string) | ✅ | ⚠ not stated as a divergence | ⚠ `request inspect` after plan | ❌ | **Partly — divergent from official, unrecorded** |
| Currency ∈ {KHR,USD}, case-insensitive | `core/money` | `utils.ts#validateCurrency` | HARD, **case-sensitive** | ✅ | ⚠ | ✅ (7 spellings) | ✅ | **Partly — stricter than official, 7 spellings** |
| Currency default from profile | `core/money` | — | ❌ (hard-coded USD) | ❌ | ❌ | ❌ | ❌ | **NO (N-05)** |
| QR `payment_option` ∈ 3 official values | `core/validation/rules` | — | ❌ | ❌ | ✅ | ✅ | ✅ rule | **NO (QR-D1)** |
| Purchase `payment_option` ∈ 6 official values | `rules.yaml` → generated enum | `constants.ts` | **ADVISORY / HARD under strict** | ✅ | ✅ | ✅ | ✅ | **WRONG VALUES (P0-02)** |
| QR lifetime unit/bounds | `core/validation/rules` | `constants.ts`, `utils.ts` | HARD (seconds) | ✅ | ✅ (contradictory) | ✅ | ✅ | **CONFLICTED (P0-03)** |
| Purchase lifetime bounds | same | `utils.ts#validatePurchaseLifetimeMinutes` | HARD min / ADVISORY max | ✅ | ✅ | ✅ | ✅ | **Yes** |
| Lifetime-expiry fund semantics per method | `core/lifecycle` | — | ❌ | ❌ | ❌ | ❌ | ❌ | **NO (N-04)** |
| Pre-auth method restriction | `core/validation/semantic` | — | ❌ | ❌ | ❌ | ❌ | ❌ | **NO (N-10)** |
| `items` ≤50 + "not used for calculation" | `core/validation/rules` | `checkout.ts:312`, `qr.ts:148` | ADVISORY at **10** | ✅ (wrong value) | ⚠ | ✅ | ✅ | **WRONG VALUE (N-06)** |
| Hash field order per endpoint | `auth/field-orders` | `domains/*.ts` constants | HARD | ✅ order + neutrality | ✅ | ⚠ `request inspect` after plan | ✅ skill | **Yes (QR official-verified; purchase mirror-sourced)** |
| Hash encoding per endpoint (hex for payout) | `auth/hmac` | `domains/payout.ts:96` | HARD | ⚠ no golden vector | ⚠ instruction lives in a **generated** file | ⚠ | ❌ | **Partly (N-14)** |
| Empty hashed position = `''` | `auth/hmac` | `auth.ts#generateHmac` | HARD | ✅ | ✅ | ⚠ | ✅ | **Yes** |
| Non-primitive hashed value rejected | `auth/hmac` | — | ❌ (`String(val)`) | ❌ | ❌ | ❌ | ❌ | **NO (N-11)** |
| Mutation single-attempt | `transport` | `constants.ts#MUTATION_ENDPOINTS`, `client.ts:1565` | HARD | ✅ | ✅ | ⚠ `request inspect` after plan | ✅ | **Yes** |
| Retry safety queryable | `core/lifecycle` | — | ❌ | ❌ | ✅ prose | ❌ | ⚠ | **NO — prose only** |
| Duplicate `tran_id` handling | `observability/journal`, CLI | `journal-cli.ts:95`, `cli.ts:229-242` | WARN | ✅ | ✅ | ✅ | ✅ | **Contested doctrine (N-03)** |
| Rate limits per endpoint | `transport/rate-limit` | `client.ts` rules | HARD | ✅ | ✅ | ⚠ | ✅ | **Yes (sources mixed)** |
| Public HTTPS callback URL | `core/validation` | `utils.ts#validatePublicHttpsUrl` | HARD | ✅ | ✅ | ✅ `doctor` | ✅ | **Yes** |
| TLS verification never disabled | `transport`, `doctor` | — | ❌ (no CA option) | ❌ | ❌ **opposite** | ❌ | ❌ **AGENTS.md teaches bypass** | **NO (P0-04)** |
| No secret in any output | `observability`, `cli/output` | `utils.ts#sanitizeForLog`, journal digest | HARD | ⚠ per-module, no sweep | ✅ | ✅ | ✅ | **Partly — no canary sweep** |
| Production confirmation for money movement | `core/env-guard` | `agent/risk.ts` only | HARD **in the agent only** | ✅ agent | ✅ agent docs | ❌ **CLI ungated** | ⚠ | **NO for the CLI (P1-01)** |
| Credential↔environment coherence | `core/env-guard`, `doctor` | — | ❌ | ❌ | ❌ | ❌ | ❌ | **NO** |
| Error meaning per endpoint | `core/errors` | `cli/explain-code.ts` | registry | ✅ | ✅ generated | ⚠ **wrong family for bare numerics** | ✅ | **Partly (N-01/N-02)** |
| Unknown error code ⇒ no invented meaning | `core/errors` | `explain-code.ts` | `causeStatus` absent | ⚠ | ⚠ | ⚠ | ⚠ | **Partly** |
| Configuration completeness | `config/env-registry` | `config/envValidator.ts` | allow-list | ⚠ | ⚠ | ⚠ **false warnings** | ⚠ | **NO (P1-04)** |
| Settlement ≠ approval | `core/lifecycle` | docs | ❌ | ❌ | ✅ excellent | ❌ | ✅ | **NO — doc only (correctly: no API exists)** |
| Public tree contains no internal material | repository manifest | `scripts/check-repository.mjs` (deny-list) | deny-list | ✅ | ✅ | — | — | **NO (P0-01)** |
| CI order matches documented order | `.github/workflows/ci.yml` | — | — | — | ✅ CONTRIBUTING | — | — | **NO (P0-05)** |

**Reading the matrix:** 14 requirements are **enforced**; 9 are **partly enforced**; **13 are documented but not enforced at all** — and those 13 are precisely the plan's P0/P1 work. The matrix is the argument for the roadmap: it is not a list of nice-to-haves, it is the set of requirements the repository already claims to care about and cannot currently prove.

---

# 37. Target Repository Structure

Retained from the first pass (§25.2) with four corrections from this pass:

1. **No `.maintainer/` directory** — rejected (§2.1). Internal material simply is not in the public repository; the private line is a separate repository.
2. **`knowledge/rules/` holds 4 authored files + `evidence/`**, not 9 (§29.2). Generated JSON lives in `build/generated/` (gitignored) and is published into the tarball at `prepack`.
3. **`fixtures/vectors/`** is added as a first-class directory (golden vectors, §27) with CODEOWNERS protection.
4. **`scripts/` is split** into `gates/`, `generate/`, `probes/`, `release/` — and the probe runner makes the 31 unreferenced scripts either runnable or deleted (N-12).

## 37.1 Directory responsibilities, ownership, and dependency rules

| Directory | Responsibility | Public/Private | Owner | Allowed dependencies | Forbidden dependencies |
|---|---|---|---|---|---|
| `src/core/` | Pure domain: types, errors, advisories, money, ids, time, lifecycle, env-guard, validation. **No I/O** | Public (partly via subpaths) | SDK maintainer | nothing in `src/` | everything else |
| `src/auth/` | Signing, encryption, callback verification, hash field orders, `inspectHmac` | Public | SDK maintainer | `core/` | transport, domains, cli, webhook |
| `src/config/` | The one config schema, precedence resolver, generated env registry, profiles, data root | Public | DX maintainer | `core/` | domains, cli, transport |
| `src/transport/` | HTTP execution policy (retry, breaker, rate limit, cid, TLS CA), response classification, shape assertion | Internal (types public) | SDK maintainer | `core/`, `auth/`, `config/`, `observability/` | domains, cli |
| `src/client/` | `PayWay` composition root, `sdk` facade | Public | SDK maintainer | all above + `domains/` | cli, agent, mcp, testing |
| `src/domains/` | One PayWay capability each: pure payload builders, endpoint metadata, domain validation | Public | SDK maintainer | `core/`, `auth/`, `config/` | transport, client, cli |
| `src/callbacks/` | Route classification and the four verification contracts | Public | SDK maintainer | `core/`, `auth/` | client, cli |
| `src/observability/` | Logger, journal, redaction | Public | DX maintainer | `core/`, `config/` | domains, cli |
| `src/webhook/` | Local receiver, stores, forwarder, tunnel | `./webhook` subpath | DX maintainer | `core/`, `config/`, `callbacks/`, `observability/` | cli, agent |
| `src/khqr-offline/` | EMVCo TLV + CRC-16 generation/inspection. **No HTTP, no API keys, no HMAC** | `./khqr-offline` subpath | SDK maintainer | `core/`, `config/` | **`auth/` (boundary-tested)**, transport, cli |
| `src/diagnostics/` | doctor checks, rules engine, explain, diagnose, go-live, request-inspect | `./diagnostics` subpath | DX maintainer | everything except `cli/`, `agent/`, `mcp/` | cli, agent, mcp |
| `src/cli/` | **Presentation only**: parse → call → render. No domain policy | `./cli` subpath | CLI maintainer | everything | — |
| `src/mcp/`, `src/agent/` | Tool exposure and LLM orchestration | Root/`./cli` | Agent maintainer | everything except `cli/` internals | `cli/` internals |
| `src/testing/` | Mock gateway, harness, simulator, fixture loader | `./testing` subpath only | Test maintainer | everything | — (and **nothing** may import it except tests and the subpath) |
| `knowledge/rules/` | 4 authored YAML + `evidence/` | Public | SDK maintainer | — | must not contain repository-internal facts (those live in code) |
| `fixtures/` | Gateway/callback/KHQR/HTTP corpus + `vectors/` + `INDEX.json` | Public | Test maintainer | — | no real credentials, no production hosts, no captured PII |
| `docs/` | `index.md`, `getting-started/`, `guides/` (16), `reference/` (generated), `examples/`, `troubleshooting/`, `agents/`, `project/` | Public | Docs maintainer | — | no internal dossiers, no strategy, no archive |
| `examples/` | `first-payment/`, `integration-recipes/`, `webhook-receiver/`, `agent-workspace/` | Public | DX maintainer | the published package | never `checkout.payway.com.kh` as a target |
| `skills/` | 11 job-shaped skills; `references/` generated at pack time | Public | Agent maintainer | `knowledge/rules` | must not restate a rule (reference by id) |
| `integrations/` | `postman/`, `openapi/`, `boilerplate/*` | Public (openapi rights pending) | Maintainer | — | no committed generated `dist`, no duplicate copies |
| `scripts/` | `gates/`, `generate/`, `probes/`, `release/` — **every file referenced by `package.json`, CI, a test, or the probe runner** | Public | Maintainer | — | no unreferenced one-offs |
| `.github/` | 4 workflows, CODEOWNERS, dependabot, 4 issue templates, PR template | Public | Maintainer | — | — |

---

# 38. Final CLI Surface

Status vocabulary: **V1 REQUIRED** (in 2.0.0) · **V1 OPTIONAL** (2.0.x) · **FUTURE** (post-2.x) · **REJECTED**.

```
payway
├── init                                     V1 REQUIRED
├── doctor                                   V1 REQUIRED
├── diagnose                                 V1 REQUIRED
├── explain                                  V1 REQUIRED
├── capabilities                             V1 REQUIRED
├── version                                  V1 REQUIRED
├── demo                                     V1 REQUIRED   (absorbs today's `test`)
│
├── config
│   ├── show                                 V1 REQUIRED
│   ├── set                                  V1 REQUIRED
│   ├── add-profile                          V1 REQUIRED   (today: `profiles add`)
│   ├── use-profile                          V1 REQUIRED   (today: `profiles use`)
│   └── list-profiles                        V1 REQUIRED   (today: `profiles list`)
├── env
│   ├── current                              V1 REQUIRED
│   ├── use                                  V1 REQUIRED
│   └── guard                                V1 OPTIONAL
├── request
│   ├── inspect                              V1 REQUIRED
│   ├── sign                                 V1 OPTIONAL
│   └── send                                 V1 OPTIONAL
├── qr
│   ├── create                               V1 REQUIRED
│   ├── offline                              V1 REQUIRED
│   ├── inspect                              V1 REQUIRED
│   ├── customer                             V1 OPTIONAL
│   ├── soundbox                             V1 OPTIONAL   (verified: spec)
│   └── templates                            V1 OPTIONAL
├── checkout
│   ├── create                               V1 REQUIRED
│   └── form                                 V1 REQUIRED
├── payment-link
│   ├── create · get · void                  V1 REQUIRED
│   └── image · pushback                     V1 OPTIONAL
├── transaction
│   ├── get · detail · list · poll · close   V1 REQUIRED
│   ├── by-ref · batch                       V1 REQUIRED
│   ├── current                              V1 REQUIRED
│   └── verify                               V1 REQUIRED
├── refund
│   ├── create                               V1 REQUIRED
│   └── check                                V1 REQUIRED
├── payout
│   ├── create                               V1 REQUIRED
│   └── beneficiary {add · list · update-status}   V1 REQUIRED
├── cof
│   ├── link-account · link-card · charge    V1 REQUIRED
│   └── token {list · renew · details · remove}    V1 REQUIRED
├── pre-auth
│   └── complete · complete-with-payout · cancel   V1 OPTIONAL
├── webhook
│   ├── listen                               V1 REQUIRED   (replaces `setup-webhook`)
│   ├── trigger · verify · list · show · status · stop   V1 REQUIRED
│   ├── resend                               V1 REQUIRED
│   ├── fixtures                             V1 OPTIONAL
│   └── conformance                          V1 OPTIONAL
├── journal
│   └── timeline · stats · reconcile · explain · anomalies · show · prune   V1 REQUIRED
├── sandbox
│   ├── info                                 V1 REQUIRED
│   ├── verify                               V1 REQUIRED
│   ├── test-cards · beneficiaries           V1 REQUIRED   (refuse production)
│   └── scenarios                            V1 OPTIONAL
├── go-live
│   ├── check                                V1 REQUIRED
│   └── report · diff                        V1 OPTIONAL
├── docs                                     V1 REQUIRED   list · <topic> · search
├── exchange-rate                            V1 REQUIRED
├── status                                   V1 OPTIONAL
├── self-activation                          V1 OPTIONAL   (verified: spec; production-gated)
├── session · onboard · ask · agent · mcp · skills · completions    V1 REQUIRED (unchanged)
│
├── rules …                                  REJECTED  (consumers are commands and generated docs)
├── products                                 REJECTED  → `capabilities --products`
├── validate …                               REJECTED  → `doctor` / `request inspect` / `go-live check`
├── transaction explain                      REJECTED  → `diagnose --id`
├── logs {tail,redact,share}                 REJECTED  → `journal timeline --follow`, `journal show --redact --out`
├── sandbox reset                            REJECTED  → `journal prune` + data-root deletion
├── qr deeplink                              REJECTED  → `qr inspect` reports deeplinks
├── webhook configure                        REJECTED  → `webhook listen --write-env`
├── test                                     REJECTED  → `demo --check` (simulated) / `sandbox verify` (live)
└── generate-qr · request-qr · check-transaction · transaction-detail · transaction-list ·
    get-transactions-by-ref · tx-batch · close-transaction · generate-checkout · checkout-form ·
    setup-webhook · profiles · sandbox-test-cards · sandbox-beneficiaries · exchange-rate (flat form)
                                             ALIASES  hidden, stderr deprecation, listed in
                                             `capabilities.aliases`, parity-tested; removed at 3.0.0
```

**Counts:** 13 noun groups + 10 standalone commands + 7 retained unchanged = **~60 leaf commands** (down from ~86 today, because 21 flat names become aliases rather than separate entries). **10 command proposals rejected.**

**Why this is the right size:** every noun maps to one PayWay concept or one developer job; every verb comes from a closed 19-word set; every command answers exactly one of the five diagnostic questions (§18.1) or performs exactly one operation class (§12.2). Nothing exists only to expose an implementation detail.

---

# 39. Dependency Graph

## 39.1 The two spines

**Spine A — knowledge (external truth → enforcement):**
```
official docs / ABA answers / probes
        ↓ harvest, quote, date
knowledge/rules/{rules,errors,env-vars,guardrails}.yaml + evidence/
        ↓ gen:rules (one direction only)
core/rules.ts · core/errors.ts · config/env-registry.ts · generated enums
        ↓
core/validation (syntactic · semantic · rules)  →  domains (payload builders)
        ↓                                              ↓
transport (retry/rate-limit/TLS/shape)  ←  auth (hmac/rsa/callback-signature)
        ↓
client (PayWay)  →  callbacks  →  observability
        ↓
diagnostics (doctor · explain · request-inspect · diagnose · go-live)
        ↓
cli / mcp / agent          →          generated docs · capabilities.json · llms.txt · skills
```

**Spine B — contracts (one envelope → every surface):**
```
cli/output (envelope · render · redact · exit-codes)
        ↓
runCommand wrapper  →  every command  →  registry sweep test
        ↓
capabilities (generated from the commander registry)
        ↓
reference/cli.md|json (generated)  ·  completions  ·  alias parity  ·  agent tool selection
```

## 39.2 Item-level dependency graph (implementation order driver)

```
WP-01 repository manifest ──────────────────────────────┐ (independent; owner-decision gated)
WP-02 rules/errors/env-vars registry ──┬────────────────┤
                                       │                │
WP-03 tsconfig paths + CI order ───────┼── (independent, unblocks everything: gates become trustworthy)
WP-04 TLS: tlsCaFile + instruction purge┼── (independent)
WP-05 purchase enum + advisory semantics┤  (needs WP-02 for the source tag; can ship hand-authored)
WP-06 golden vectors ──────────────────┤  (independent; protects WP-05/WP-12/N-11)
                                       │
WP-07 env-guard ───────────────────────┤  (needs WP-02 environments data; blocks WP-13, WP-16)
WP-08 cli/output envelope + runCommand ┤  (blocks WP-09, WP-13, WP-14, WP-16, WP-17)
                                       │
WP-09 capabilities ────────────────────┤  (needs WP-08; blocks WP-13, WP-14, WP-20, docs gen)
WP-10 env-registry + .env.example ─────┤  (needs WP-02)
WP-11 doctor rebuild ──────────────────┤  (needs WP-08, WP-10, WP-07; blocks WP-16 go-live)
WP-12 errors re-key + explain --operation (needs WP-02, WP-06)
                                       │
WP-13 cli extraction ──────────────────┤  (needs WP-08; blocks WP-14, WP-15, subpaths)
WP-14 request inspect ─────────────────┤  (needs WP-08, WP-09, WP-13, WP-02)
WP-15 webhook listen + fixtures ───────┤  (needs WP-08, WP-13)
WP-16 go-live check ───────────────────┤  (needs WP-11, WP-07)
WP-17 qr group + lifetime resolution ──┤  (needs WP-02, WP-08, WP-13, WP-14, probes)
WP-18 lifecycle model + money/ids ─────┤  (needs WP-02; blocks WP-14 normalization, WP-16 gates)
WP-19 advisories + error union ────────┤  (needs WP-02, WP-08)
WP-20 docs generation + IA ────────────┤  (needs WP-09, WP-12, WP-02)
WP-21 AGENTS.md + guardrails ──────────┤  (needs WP-02 guardrails, WP-04, WP-09)
WP-22 skills 35→11 ────────────────────┤  (needs WP-02, WP-09, WP-21)
WP-23 packaging: subpaths + deps ──────┤  (needs WP-13)
WP-24 diagnostics: diagnose ───────────┤  (needs WP-11, WP-12, WP-18)
WP-25 probes harness + evidence ───────┤  (needs WP-02; feeds WP-05/17/N-03/N-07)
WP-26 testing gates (sweeps) ──────────┤  (needs WP-08, WP-09)
WP-27 release engineering ─────────────┘  (needs WP-01, WP-03, and Phase 0–2 correctness)
WP-28 repo restructure (integrations/, scripts/, deletions)  (needs WP-01)
```

## 39.3 The critical path

```
WP-03 (CI trustworthy) → WP-02 (registry) → WP-08 (envelope) → WP-09 (capabilities)
     → WP-13 (CLI extraction) → WP-14 (request inspect) → WP-20 (docs generation)
```
Seven work packages, and everything else hangs off them. **WP-03 is first because a plan executed against a red pipeline cannot be verified** — and its primary fix is three lines.

## 39.4 Circular-dependency check (§40)

| Potential cycle | Present in the plan? | Prevention |
|---|---|---|
| CLI importing documentation metadata to determine runtime rules | **No** — the direction is `rules.yaml → core → cli`, and docs are generated *from* code/registry, never read by it | `architecture-boundaries.test.ts` forbids `cli/**` and `core/**` importing from `docs/**`; generated JSON lives in `build/generated/`, not `docs/` |
| SDK depending on CLI code | **No today, must stay no** — but `explain-code.ts` currently lives under `src/cli/` and holds knowledge the SDK needs | Move it to `core/errors.ts` (WP-12). This is a *real* latent cycle in the current tree: the CLI owns knowledge the SDK should own, so any SDK-side `explain()` would have to import `cli/` |
| Core validation depending on product-specific UI | **No** — `core/` has no I/O and cannot import `cli/ui` | boundary test |
| Skills required to execute SDK logic | **No** — skills contain no executable logic except 5 optional `.cjs` helpers, which are conveniences over CLI commands | skill schema test: `allowed_tools` must be CLI commands or file reads, never "run this script to compute a signature" |
| Documentation manually copied into tests | **No** — tests read `rules.yaml`/`fixtures/`, and docs are generated from the same sources | `rules-conformance` requires every `ruleId` referenced in a test to resolve |
| `diagnostics/` ↔ `cli/` | **No** — diagnostics is CLI-independent by design so `go-live`/`doctor` can be consumed from `./diagnostics` in CI without the CLI | boundary test: `diagnostics/**` must not import `cli/**` |
| `khqr-offline/` ↔ `auth/` | **No, and must be enforced** — offline KHQR uses CRC-16, never HMAC | boundary test forbidding the import (guardrail MUST #11 made technical) |
| `testing/` imported by production code | **Yes today** — `src/index.ts` re-exports the mock server and simulator | WP-23 moves it behind `./testing`; the boundary test then forbids the import |
| Generated corpora required at build time to build the code that generates them | **Risk** — `knowledge/` is both committed and generated | WP-20/§29.4: generation moves to `prepack`; tests read `docs/guides/**` (the source), never the generated corpus |

**Two real cycles found in the current tree** (CLI-owned knowledge the SDK needs; production entrypoint exporting test infrastructure) and **one risk introduced by the first-pass plan** (committed generated corpora). All three are resolved by the plan; none is introduced by it.

---

# 40. Breaking-Change and Migration Plan

| # | Surface | Breaking change | Migration strategy | Compatibility layer | Deprecation period |
|---|---|---|---|---|---|
| 1 | **CLI output** | 6 shapes → 1 envelope, `schemaVersion: "2.0"` | `MIGRATIONS.md#output` with an old-path → new-path table for all 6 shapes | `PAYWAY_CLI_OUTPUT_SCHEMA=1.0` emits the legacy envelope for the two commands that had one | 1 minor series, then removed at 2.1 |
| 2 | **CLI names** | flat verb-noun → noun-first | `capabilities --aliases --output json` prints the complete mapping; a stderr deprecation names the replacement | Every legacy name kept as a hidden alias | Aliases live until **3.0.0** |
| 3 | **`--output` scope** | 2 commands → global | none needed — strictly additive | — | — |
| 4 | **Bin** | `payway-sdk` → `payway` (+ alias) | none needed — additive | both bins ship | `payway-sdk` kept indefinitely (npm squatting makes removing it unsafe) |
| 5 | **Exit codes** | 4, 5, 6 added | additive; documented in `--help` and `MIGRATIONS.md` | — | — |
| 6 | **QR `lifetime` unit** | seconds → minutes (pending probe) | `--lifetime-unit seconds\|minutes`; stderr advisory for ambiguous values (`3 ≤ n ≤ 43200`) | `--lifetime-unit seconds` honoured | 2 minor series |
| 7 | **Purchase enum** | `abapay`/`abapay_deeplink` demoted to legacy-advisory; 4 official values added | additive for the official values; legacy values keep working with an advisory | `PURCHASE_PAYMENT_OPTIONS_LEGACY` exported | legacy set retained until ABA confirms removal |
| 8 | **`strictValidation` semantics** | "escalate every advisory" → "fail on official deterministic rules" | `MIGRATIONS.md`; a changelog entry listing every advisory that changes behaviour | `strictValidation: 'legacy'` restores today's behaviour | 1 minor series |
| 9 | **`verifyCallbackDetailed` `stripHash`** | default `false` → `true` | `MIGRATIONS.md`; a one-release stderr warning when the old default would have changed the outcome | `stripHash: false` still honoured | 1 minor series |
| 10 | **`PayWayWebhookError.type`** | `'config_error'` → `'webhook_error'` | additive union member; `MIGRATIONS.md` | code checking `type === 'config_error'` for webhook errors must switch — flagged in the changelog as the one silent behaviour change | none (it is a bug fix; the old value was wrong) |
| 11 | **Currency default** | purchase omits `currency` instead of sending `'USD'` | interim advisory in 2.0.x; the change lands in 2.1 with `PAYWAY_DEFAULT_CURRENCY` available from 2.0.0 | `defaultCurrency` config | advisory for 1 minor, then the change |
| 12 | **Subpath exports / root surface** | mock server, simulator, journal sinks, storage service, webhook server, `openImage` removed from the root specifier | `MIGRATIONS.md#subpaths` with the exact new specifier per export | root re-exports kept, deprecated, for 1 minor | 1 minor series |
| 13 | **Node floor** | already ≥22.12.0 (documented as breaking) | the reason 2.0.0 is the correct version | — | — |
| 14 | **Repository layout** | `payway-boilerplate/` → `integrations/`; `docs/NN-*.md` → redirect stubs; `docs/api/` → Pages; `.agents/AGENTS.md` merged | redirect stubs + a `MOVED.md`; external links keep resolving | stubs retained | stubs until 3.0.0 |
| 15 | **File structure (internal)** | `src/cli.ts` deleted; `src/*` reorganised into 14 directories | **No compatibility layer.** Internal module paths are not a public contract; only the published specifiers are | — | none |
| 16 | **Test fixtures** | hand-rolled mock bodies → `fixtures/` corpus | tests updated in the same PRs | — | none |
| 17 | **Agent instructions** | `.agents/AGENTS.md` removed; `HANDOFF.md` leaves the public tree | a 3-line pointer at `.agents/AGENTS.md` for one release | pointer file | 1 release |
| 18 | **Skills** | 35 → 11 | `skills update` migrates; old names kept as aliases in `skills-lock.json` for one release | alias entries | 1 release |

**Rule applied throughout:** *no backwards compatibility for repository internals* (§45 of the brief). Only published surfaces — the npm specifiers, the CLI, the JSON contract, exit codes, configuration keys, rule/error ids, doctor check ids, and skill names — get migration paths.

---

# 41. Work Packages

28 packages. Each is small enough for one coding agent to implement and one reviewer to evaluate.

---

### WP-01 · Public-tree curation and the repository manifest
- **Objective:** make the public repository match the owner's recorded release decision, and make the boundary executable.
- **Problem solved:** P0-01.
- **Scope:** remove `audit-results/`, `.scratch/`, `.zcode/`, `.kilo/`, `HANDOFF.md`, `docs/internal/`, `docs/strategy/`, `docs/archive/`, `docs/superpowers/`, `docs/test-cases/`, `docs/HISTORY-SECRET-TRIAGE.csv`; add `repository-manifest.yaml`; extend `scripts/gates/check-repository.mjs` to an allow-list; add `NOTICE` + `THIRD-PARTY-LICENSES`.
- **Out of scope:** history rewriting (unnecessary — 1 commit); deciding `payway-openapi/` rights (excluded until answered); moving `docs/project/` (keep, minus the triage files).
- **Affected:** root, `docs/`, `scripts/gates/`, `.github/workflows/ci.yml`. **New:** `repository-manifest.yaml`, `NOTICE`, `THIRD-PARTY-LICENSES`.
- **Dependencies:** owner sign-off on the file list.
- **Technical specification:** manifest schema `{version, public: [globs], generated: [globs], thirdParty: [{path, upstream, license, notice, disposition}]}`; the gate fails on any `git ls-files` entry matching no `public`/`generated` glob, or matching a `thirdParty` path without a notice entry; error messages name the glob that would fix it.
- **Migration:** redirect stubs are unnecessary (these paths were never linked from public docs, verified by the existing link check).
- **Tests:** gate unit test with a fixture tree; negative test (add an unmatched file → gate fails).
- **Documentation:** `docs/project/RELEASE-READINESS.md` items A/B updated with an execution date; `CONTRIBUTING.md` gains a "what may be committed" section pointing at the manifest.
- **Agent knowledge:** `AGENTS.md` §2 repo map reflects the new tree; guardrail MUST NOT #14.
- **Acceptance criteria:** as P0-01's list.
- **Rollback:** revert the commit; the manifest gate is additive and can be disabled by removing one CI line.
- **Complexity:** M.

### WP-02 · The knowledge registry (3 authored YAML + evidence)
- **Objective:** give PayWay rules, error meanings, env vars, and guardrails one authored source with provenance and expiry.
- **Problem solved:** P1-13, and it is the prerequisite for P0-02, P0-03, N-01…N-07, N-10, N-14.
- **Scope:** `knowledge/rules/{rules,errors,env-vars,guardrails}.yaml`, `knowledge/rules/evidence/**`, `scripts/generate/gen-rules.ts` → `src/core/rules.ts`, `src/core/error-registry.ts`, `src/config/env-registry.ts`, `docs/error-codes.json`, `build/generated/*.json`; `src/__tests__/rules-conformance.test.ts`.
- **Out of scope:** the six rejected registries (§29.2); rewriting validators to be data-driven (WP-18 does the money/ids subset); any behaviour change.
- **Affected:** `src/constants.ts` (arrays become generated re-exports), `src/cli/explain-code.ts` (becomes a thin loader), `src/config/envValidator.ts`, `package.json` scripts, CI.
- **New:** the four YAML files, `evidence/`, the generator, the conformance test.
- **Dependencies:** none. **Blocks:** WP-05, WP-10, WP-11, WP-12, WP-14, WP-16, WP-17, WP-18, WP-19, WP-20, WP-21, WP-22, WP-24, WP-25.
- **Technical specification:** rule schema `{id, endpoint?, statement, source: official|official-behaviour|sandbox|production-telemetry|relay|repo|unverified, deterministic: bool, enforcement: {sdk?, cli?, test?}, severity, docRef, evidence?, conflict?: {officialStatement, officialUrl, retrievedAt, repoBehaviour, status, requiredConfirmation, owner}, variants?: [{source, statement, observedOn}], refreshCommand?}`. Error schema `{endpoint, code, title, hint, category, retryable, source, evidence?, observedOn?, observedMessage?, alternatives?}`. Env-var schema `{name, type, secret, default, appliesTo[], requiredFor[], docRef, since, example}`. Guardrail schema `{id, modality: MUST|MUST_NOT|SHOULD|SHOULD_NOT|MAY, text, enforcement}`. Conformance test enforces §29.3's four rules including the **official-host URL allow-list** and the **180-day expiry with auto-degradation**.
- **Migration:** generated TS modules keep the existing export names, so no import site changes; `gen:rules --check` added to CI.
- **Tests:** conformance (4 rules), generator determinism (byte-stable output), negative tests (missing evidence, expired evidence, non-official URL, unknown ruleId reference).
- **Documentation:** `docs/reference/rules.md` + `errors.md` generated; `docs/agents/domain-crypto.md` cites rule ids.
- **Agent knowledge:** guardrails rendered into 4 surfaces with an identity test; skills gain `rule_dependencies`.
- **Acceptance criteria:** (1) 4 YAML files, each with ≥3 consumers; (2) ≥45 rules and ≥96 endpoint-scoped error entries seeded from existing constants and comments; (3) every `source: official` rule has an evidence file with an official-host URL and a retrieval date; (4) the conformance test fails on missing/expired/non-official evidence and on an unreferenced ruleId; (5) `docs/error-codes.json` is generated from `errors.yaml` and `--check` is green in CI; (6) no import site changed.
- **Rollback:** the generator's output is a drop-in replacement; reverting restores the hand-written constants.
- **Complexity:** L (authoring) / M (tooling).

### WP-03 · Trustworthy gates: `tsconfig paths`, CI order, platform-gated tunnel test
- **Objective:** make `npm run typecheck` independent of build order and make CI green on both OSes.
- **Problem solved:** P0-05 (primary), C-8, P2-09, N-15.
- **Scope:** `tsconfig.typecheck.json` (extends base, adds `baseUrl` + `paths: {"aba-payway-ts": ["./src/index.ts"]}`), `tsconfig.build.json` (tsup inputs), `package.json` scripts (`typecheck`, `typecheck:dist`, `format:check`, `format:fix`), `.github/workflows/ci.yml` (reorder; add format and CJS-smoke steps; extend `sqlite-contract` to all 4 suites; add an `integrations/boilerplate` job), `src/__tests__/sdk-facade-and-tunnel.test.ts` (platform gate + POSIX variant), `.git-blame-ignore-revs`, one isolated reformat commit.
- **Out of scope:** new CI jobs beyond those listed; release workflow (WP-27).
- **Dependencies:** none. **Blocks:** everything (a red pipeline cannot verify any other work package).
- **Technical specification:** `typecheck` uses `tsconfig.typecheck.json` (source resolution, no `dist` needed); `typecheck:dist` runs after build with the base config (real `exports` resolution, catches `.d.ts` emit regressions); CI order becomes `Install → Build → Typecheck → Typecheck:dist → Lint → Format-check → …`; the tunnel test gains `it.skipIf(process.platform !== 'win32')` for the `.cmd` fixture and a POSIX `#!/bin/sh` + `chmod 0o755` variant so both platforms exercise real behaviour.
- **Tests:** the existing suite, plus a CI-level assertion that `typecheck` runs before `build` in a fresh-checkout job.
- **Documentation:** `CONTRIBUTING.md` and the PR template updated to the CI order; `AGENTS.md` §6 identical (three-way identity test).
- **Acceptance criteria:** (1) clean clone: `npm ci && npm run typecheck` exits 0 with no prior build; (2) `npm ci && npm run build && npm run typecheck && npm run typecheck:dist && npm test && npm run lint && npm run format:check` exits 0 on Linux and Windows; (3) `vitest run` reports 0 failures on Linux; (4) CI green on both matrix OSes; (5) 0 skipped SQLite tests in the `sqlite-contract` job; (6) planted type error / unformatted file / failing test / secret each fail their gate; (7) `biome format` exits 0 over the whole tree; (8) `git blame` preserved via `.git-blame-ignore-revs`.
- **Rollback:** revert the workflow and tsconfig commits independently; the reformat commit is isolated and revertible.
- **Complexity:** S–M.

### WP-04 · TLS: a safe alternative, then removal of the bypass instruction
- **Objective:** eliminate certificate-verification bypass from the project.
- **Problem solved:** P0-04.
- **Scope:** `PayWayConfig.tlsCaFile` + `PAYWAY_TLS_CA_FILE` + `tlsMinVersion`; an `undici` `Agent({connect:{ca}})` in `transport/fetch`; purge 19 occurrences from `AGENTS.md` and 17 from `docs/**` and `scripts/**`; `doctor SDK-004`/`NET-003`; `src/__tests__/agents-md.test.ts`; guardrail entries.
- **Out of scope:** proxy support; certificate pinning.
- **Dependencies:** WP-02 for the env-var registry entry (can be hand-added first). **Blocks:** WP-21.
- **Technical specification:** the agent is constructed once per client and reused; `tlsCaFile` accepts a PEM path or an inline PEM; `NET-003` performs a real handshake and reports the OpenSSL reason string verbatim (`self-signed certificate in certificate chain`, `unable to get local issuer certificate`, `Hostname/IP does not match certificate's altnames`, `certificate has expired`) with the matching fix; `SDK-004` is a blocker whenever `NODE_TLS_REJECT_UNAUTHORIZED === '0'`.
- **Tests:** a local TLS server with a self-signed cert — success with `tlsCaFile`, failure without; `doctor` golden files for each OpenSSL reason; the repo-wide grep test with an allow-list.
- **Acceptance criteria:** as P0-04's list.
- **Rollback:** the config field is additive; instruction removal is a docs revert.
- **Complexity:** S–M.

### WP-05 · Official-value corrections (purchase enum, items cap, QR payment option, amount floor)
- **Objective:** stop rejecting or mis-advising officially documented values.
- **Problem solved:** P0-02, N-06, QR-D1, QR-009.
- **Scope:** generated enums from `rules.yaml`; `domains/checkout.ts` (enum + subscription set + items cap), `domains/qr.ts` (payment-option membership + items cap), `utils.ts#validateAmountFloor` (advisory → HARD), evidence files for PUR-003, QR-012, QR-016, QR-009.
- **Out of scope:** the lifetime unit (WP-17), the currency default (WP-18), content type (WP-25 probe).
- **Dependencies:** WP-02. **Blocks:** WP-19 (advisory semantics).
- **Technical specification:** membership HARD-rejects only values in neither the official nor the legacy set; official values are always accepted; legacy values emit an advisory tagged `source: archived`; profile enablement is never pre-empted (official code 23 is mapped instead); the amount floor becomes HARD because it is official **and** has its own gateway code (47).
- **Tests:** every official value × {normal, strict}; every legacy value; unknown values; 10/11/50/51 items on both endpoints; amount floor at 0.009/0.01 USD and 99/100 KHR; `sdk.runTestSuite` emits no purchase-enum advisory.
- **Acceptance criteria:** as P0-02's list plus: no advisory below 50 items; the amount floor throws with `QR-009` cited; `explain 23 --operation qr.create` names profile enablement; `explain 47 --operation qr.create` names the KHR minimum.
- **Rollback:** enum values revert with the YAML; the floor change is one function.
- **Complexity:** S–M.

### WP-06 · Golden test vectors
- **Objective:** make cryptographic behaviour regression-proof.
- **Problem solved:** the gap behind N-11, N-14, PUR-001/002, QR-001.
- **Scope:** `fixtures/vectors/{hmac,rsa,callback,khqr}/*.json` (22 vectors, §27.2), `fixtures/vectors/INDEX.json`, `src/__tests__/golden-vectors.test.ts`, `auth.inspectHmac`, a fixture lint (no real credentials, no production hosts), CODEOWNERS on `fixtures/vectors/**` and `src/auth/**`.
- **Out of scope:** live signature verification against the gateway (WP-25 probes).
- **Dependencies:** none. **Blocks:** WP-05 and WP-12 gain protection; WP-14 depends on `inspectHmac`.
- **Technical specification:** vector schema per §27.1; the runner recomputes and compares preimage sha256 and signature; a mismatch prints the first differing field position and both preimage hashes, never the key; `provenance.verifiedAgainst` is required, and a vector without it is marked `self-referential` (permitted only for rejection/coercion cases).
- **Tests:** the vectors; bidirectional pinning of `GENERATE_QR_HASH_FIELDS` and `PURCHASE_HASH_FIELDS` against the vector `fieldOrder`; the 24-field-neutrality vector.
- **Acceptance criteria:** (1) 22 vectors committed and passing; (2) changing any `*_HASH_FIELDS` entry without a vector update fails CI; (3) a hex-encoding regression on payout fails; (4) an object in a hashed position throws (once WP-11 lands) — the vector is committed now expecting the current coercion, and is **updated deliberately** in WP-11 with a recorded reason; (5) the fixture lint rejects a 40-hex canary.
- **Rollback:** vectors are additive.
- **Complexity:** M.

### WP-07 · Shared environment guard
- **Objective:** one production-safety policy for CLI, MCP, and agent.
- **Problem solved:** P1-01.
- **Scope:** `src/core/env-guard.ts` (`resolveEnvironmentContext`, `classifyEnvironment`, `assertOperationAllowed`, `requireProductionConfirmation`); `PayWayGuardError`; exit code 6; `src/agent/risk.ts` delegating; `--confirm-production` on all §12.2 class-3 commands; sandbox-only refusals; `PAYWAY_CONFIRM_PRODUCTION` with journal recording.
- **Out of scope:** the `env` commands (WP-13), `doctor` coherence checks (WP-11).
- **Dependencies:** WP-02 (environment/guard data). **Blocks:** WP-11, WP-13, WP-16.
- **Technical specification:** the endpoint is authoritative over the label (§12.1); `coherence: 'mismatch'` refuses mutating commands; `custom` behaves like production; the guard runs before any I/O; `context.guard` appears in every JSON document.
- **Tests:** the parametrised matrix (every money-moving command × environment × flag combination) asserting exit codes and **zero HTTP calls** on refusal; a boundary test asserting both `agent/risk.ts` and the CLI import `core/env-guard`.
- **Acceptance criteria:** as P1-01's list.
- **Rollback:** the guard is one module; commands revert by removing one call each.
- **Complexity:** M.

### WP-08 · The CLI output contract
- **Objective:** one envelope, one exit-code set, one redaction path.
- **Problem solved:** P1-02, E1–E7.
- **Scope:** `src/cli/output/{envelope,render,redact,exit-codes,run-command}.ts`; global `--output`, `--log-level`, `--log-format`, `--quiet`; removal of the two per-command `--output` registrations; stage 1 migration (state-read commands).
- **Out of scope:** extracting `cli.ts` (WP-13); migrating the remaining commands (WP-13 does it as it moves them).
- **Dependencies:** none technically; **blocks** WP-09, WP-11, WP-13…WP-17, WP-24, WP-26.
- **Technical specification:** §16.1 envelope; `runCommand(name, fn)` builds `context`, catches, classifies via `PayWayErrorRecord`, renders, sets the exit code; human chrome to stderr; `--json` aliases `--output json`; `PAYWAY_CLI_OUTPUT_SCHEMA=1.0` fallback; exempt commands declared in `capabilities`.
- **Tests:** the registry sweep (WP-26 delivers the harness; WP-08 wires the migrated commands into it), golden JSON per migrated command.
- **Acceptance criteria:** as P1-02's list, for stage 1 commands.
- **Rollback:** the env fallback restores legacy output for the two commands that had it.
- **Complexity:** L.

### WP-09 · `capabilities`
- **Objective:** the machine-readable command/product catalogue.
- **Problem solved:** C2/C3 discoverability, §30.1 gaps, §34 checkpoints.
- **Scope:** `src/cli/commands/capabilities.ts`; generation from `completions/introspect.ts`; `--products`, `--aliases`, `--deprecations`, `--errors`; `build/generated/capabilities.json`; `deprecations.ts` registry.
- **Dependencies:** WP-08. **Blocks:** WP-13, WP-14, WP-20, WP-22.
- **Technical specification:** per §15; `moneyMoving` derived from the §12.2 class-3 list; `verified` from `products` data generated from `ENDPOINTS` + a readiness map in code; alias parity generated.
- **Acceptance criteria:** every `--help` command appears and vice versa; `moneyMoving` is true for exactly the class-3 operations; `--aliases` covers every legacy name; a deprecated surface without a registry entry fails a test.
- **Complexity:** S.

### WP-10 · Env registry + root `.env.example`
- **Problem solved:** P1-04, P1-05, N-15 (partly).
- **Scope:** generated `src/config/env-registry.ts`; rewritten `envValidator.ts`; generated root `.env.example`; `init` writing two artifacts; the AST-scan conformance test; `configure` completion.
- **Dependencies:** WP-02.
- **Acceptance criteria:** as P1-04's and P1-05's lists.
- **Complexity:** S–M.

### WP-11 · `doctor` rebuild
- **Problem solved:** P1-06.
- **Scope:** `src/diagnostics/doctor/{check.ts,runner.ts,checks/*.ts}` (38 checks, §17.3); registry-driven severity; `--check/--category/--severity-min/--fix/--timeout`; exit 0/1/3/5; no swallowed errors; the no-mutation guarantee; generated `doctor-checks.json`.
- **Dependencies:** WP-07, WP-08, WP-10.  **Blocks:** WP-16, WP-24.
- **Acceptance criteria:** as §17.6.
- **Complexity:** M–L.

### WP-12 · Error architecture: endpoint-scoped registry, `explain()`, the union
- **Problem solved:** N-01, N-02, P2-06, E1–E5.
- **Scope:** `core/errors.ts` + `core/error-registry.ts` (generated from `errors.yaml`); `PayWayError.explain()`; `webhook_error` + `guard_error` union members; deletion of the four `type` casts; `explain --operation/--family` with `ambiguous`/`alternatives`; harvest of the 13 official endpoint code tables into `evidence/`.
- **Dependencies:** WP-02, WP-06.
- **Acceptance criteria:** `explain 16 --operation checkout.purchase` → "Invalid Amount"; `--operation qr.create` → "Invalid First Name"; bare → `ambiguous: true` + alternatives; zero "not individually published" hints where official evidence exists; `qr:403` names duplicate transaction id; no `type` casts; `PayWayWebhookError` maps to exit 4; SDK consumers get `explain()` without the CLI.
- **Complexity:** M.

### WP-13 · CLI extraction and the noun-first tree
- **Problem solved:** P1-03, P1-11, P1-12, P3-01, P3-11, P3-12, C1–C14.
- **Scope:** delete `src/cli.ts`; create `src/cli/{program.ts,commands/**,context.ts}`; relocate the 5 policy blocks; collapse the 7 currency spellings (with WP-18); aliases + stderr deprecations; `env current/use/guard`; `transaction current/verify`; `sandbox info/verify/scenarios`; `webhook listen`; the `qr` group; removal of the `biome.json` overrides.
- **Dependencies:** WP-07, WP-08, WP-09. **Blocks:** WP-14, WP-15, WP-17, WP-23.
- **Acceptance criteria:** as P1-03's list plus §38's surface existing with aliases parity-tested.
- **Complexity:** L.

### WP-14 · `request inspect` / `sign` / `send`
- **Problem solved:** P1-08.
- **Scope:** refactor each domain builder to `buildXRequest(params, config) → {endpoint, method, contentType, body, fieldOrder, normalization[]}`; `auth.inspectHmac`; `src/diagnostics/request-inspect.ts`; the CLI command; the six redaction rules; the diff test.
- **Dependencies:** WP-02, WP-06, WP-08, WP-09, WP-13, WP-18.
- **Acceptance criteria:** as P1-08's list.
- **Complexity:** M.

### WP-15 · Webhook: `listen`, fixtures, conformance
- **Problem solved:** P1-11, P2-17 (partly).
- **Scope:** `webhook listen` with `--print-url/--output ndjson/--expect/--duration/--fail-on/--write-env`; `webhook fixtures`; `webhook conformance --against <url>`; `setup-webhook` alias.
- **Dependencies:** WP-08, WP-13, WP-19 (fixtures corpus).
- **Acceptance criteria:** as P1-11's list plus conformance asserting 2xx-within-5s, idempotent replay, rejection of unverified, and 401 on a bad signature.
- **Complexity:** M.

### WP-16 · `go-live check`
- **Problem solved:** P1-07.
- **Scope:** `src/diagnostics/go-live/{gates/*.ts,runner.ts}`; 18 gates (10 automated, 8 evidence-required); `check/report/diff`; `--attach`, `--allow-unverified --reason`, `--strict`; exit 0/5; generated `go-live.json`.
- **Dependencies:** WP-07, WP-11, WP-02.
- **Acceptance criteria:** no PASS without evidence (test); UNVERIFIED never counted as PASS; an open money-path conflict yields BLOCKER; `diff` reports transitions.
- **Complexity:** M.

### WP-17 · QR: lifetime resolution and the `qr` group
- **Problem solved:** P0-03, P1-12, QR-D1…D8.
- **Scope:** the lifetime probe; `--lifetime-unit`; the canonical rename after the probe; `qr create/offline/customer/soundbox/inspect/templates`; `buildKhqrPayload` rename with alias; `verified` in every output; `--allow-unverified` for `soundbox` in production.
- **Dependencies:** WP-02, WP-08, WP-13, WP-14, WP-25.
- **Acceptance criteria:** as P1-12's list plus P0-03's.
- **Complexity:** M.

### WP-18 · Core domain model: lifecycle, money, ids, time
- **Problem solved:** §12.2 weaknesses, N-05, P2-07, P2-08, PA-002, TX-002, P3-03.
- **Scope:** `core/lifecycle.ts` (`normalizeTransactionState`, `assertFulfillable`, `retryPolicyFor`, `resolveOutcome`, `TransactionState`, `TransactionEvent`); `core/money.ts` (`parseCurrency`, `resolveCurrency`, `assertPayoutTotal`, `assertCaptureWithinCeiling`, `parsePayoutEntries`); `core/ids.ts`; `core/time.ts`; delegation from `paymentLifecycle`, `classifyCallback`, poll outcomes, `journal/intelligence`; `createAttemptStore`.
- **Dependencies:** WP-02. **Blocks:** WP-14, WP-16, WP-24.
- **Acceptance criteria:** one mapping function; `unknown` cannot be treated as `failed`; both money invariants callable from the SDK; one currency spelling; `settlement` unsettable from a gateway normalizer (type-level test); `retryPolicyFor` exported and matching §21.
- **Complexity:** M–L.

### WP-19 · Advisories, fixtures corpus, response shape assertion
- **Problem solved:** P2-05, P2-17, N-08.
- **Scope:** `core/advisories.ts` (records, per-client dedupe, logger routing, `onAdvisory`, `PAYWAY_ADVISORY_IGNORE`, source-gated promotion); `fixtures/**` + `INDEX.json` + provenance + fixture lint; `transport/assert-shape.ts`.
- **Dependencies:** WP-02, WP-08.
- **Acceptance criteria:** no `console.warn` in library code; promotion only for official deterministic rules; every `normalizePaywayResponse` branch has a fixture; a missing dereferenced field yields `PW-API-SHAPE` with a correlation id rather than a downstream `TypeError`.
- **Complexity:** M.

### WP-20 · Documentation generation and IA
- **Problem solved:** P2-19, P2-01, P2-02, §28.
- **Scope:** slug-based `docs/guides/` (16), `docs/getting-started/` (4), `docs/index.md`, generated `docs/reference/{cli,errors,rules,products,configuration}.md|json`, redirect stubs for `docs/NN-*.md`, `docs/api/` → Pages, corpora generated at `prepack`, link-direction test, registry↔doc parity test.
- **Dependencies:** WP-02, WP-09, WP-12.
- **Acceptance criteria:** zero hand-written reference prose; parity test blocking; one map; each chapter committed once; tarball ≤ ~3.5 MB / ≤ ~130 files; `git ls-files docs/api` empty.
- **Complexity:** L.

### WP-21 · `AGENTS.md` consolidation + guardrail rendering
- **Problem solved:** P2-16, §31.
- **Scope:** `AGENTS.md` v2 (9 sections, ≤250 lines), `docs/agents/*` (index + 6 domain files + evidence-log + contributing + issue-tracker), removal of `.agents/AGENTS.md` (pointer for one release), `HANDOFF.md` out of the public tree, generated per-tool adapters, `agents-md.test.ts`.
- **Dependencies:** WP-02 (guardrails), WP-04, WP-09.
- **Acceptance criteria:** as §31.3's test column; ≤2,500 tokens always-loaded; the three-way identity test (`AGENTS.md` §6 = `CONTRIBUTING.md` = `ci.yml`).
- **Complexity:** M.

### WP-22 · Skills 35 → 11
- **Problem solved:** P2-15.
- **Scope:** 11 skills with the §32.3 schema, trigger-uniqueness test, `rule_dependencies`, full `skills-lock.json` (name/version/sha256/source/license/upstream), `references/` generated at pack time, `assets/` → generated manifest, `payway skills doctor`.
- **Dependencies:** WP-02, WP-09, WP-21.
- **Acceptance criteria:** 11 schema-valid skills; zero duplicate triggers; `allowed_tools ⊆ capabilities`; lock covers all skills; `skills doctor` fails on a stale rule dependency.
- **Complexity:** L.

### WP-23 · Packaging: subpath exports, dependency rescoping, simulator relocation
- **Problem solved:** P2-11, P2-12, N-13.
- **Scope:** 5 subpath exports with per-condition types; `src/testing/` (mock server, harness, simulator) out of the root specifier; `simulated: true` on every simulated artifact; `.invalid` hosts; runtime-dependency rescoping; bundle-size budget assertion in CI.
- **Dependencies:** WP-13, WP-19.
- **Acceptance criteria:** 5 specifiers work in ESM+CJS+types; a library-only install pulls ≤2 runtime deps; the root specifier no longer exports the mock server; no `.invalid` URL outside `testing/`; tarball within budget.
- **Complexity:** M.

### WP-24 · `diagnose`
- **Problem solved:** P2-18, §18.1 overlap removal.
- **Scope:** `src/diagnostics/diagnose.ts`; 19 symptoms; evidence-bound ranking; `--from-journal`; folding `journal explain`'s user-facing role into it.
- **Dependencies:** WP-11, WP-12, WP-18.
- **Acceptance criteria:** with no evidence, `confirmed: []` and `next` populated (golden test); every cause carries a `ruleId`; gateway-only facts always in `evidenceMissing`; `--symptom late-payment` differentiates KHQR reversal from WeChat/Alipay.
- **Complexity:** M.

### WP-25 · Probe harness and evidence refresh
- **Problem solved:** N-12, and it feeds WP-05/17 and N-03/N-07/AMT-000.
- **Scope:** `scripts/probes/*.probe.ts` + runner (`npm run probe -- <id>`), production refusal, minimum amounts, tran_id recording, results written to `knowledge/rules/evidence/<rule-id>/`, `refreshCommand` wired into `rules.yaml`, a nightly job for the money-path subset; disposition of all 31 unreferenced scripts (`promote | convert-to-test | delete`).
- **Dependencies:** WP-02; sandbox credentials.
- **Acceptance criteria:** zero unreferenced scripts; every sandbox-derived rule names a runnable `refreshCommand`; the runner refuses production; nightly evidence artifacts dated; the four priority probes (QR lifetime, duplicate tran_id, purchase content type, amount wire type) have committed results.
- **Complexity:** M.

### WP-26 · Testing gates: registry sweep + canary sweep
- **Problem solved:** T4, T5, §26.3.
- **Scope:** `src/__tests__/cli-output-contract.test.ts`, `src/__tests__/secret-canary.test.ts`, `src/__tests__/architecture-boundaries.test.ts`, `src/__tests__/env-registry-conformance.test.ts`, `src/__tests__/agents-md.test.ts`, fixture/vector parity, docs link-direction and registry↔doc parity.
- **Dependencies:** WP-08, WP-09 (and incrementally each WP adds its rows).
- **Acceptance criteria:** all six blocking and green; each has a negative test proving it bites.
- **Complexity:** M.

### WP-27 · Release engineering
- **Problem solved:** P1-10, P2-20, §34.
- **Scope:** `check-identity.mjs`; changesets; `release.yml` (tag → full checklist → npm trusted publishing + provenance → GitHub Release + SBOM → Pages); version 2.0.0; changelog fold; `MIGRATIONS.md#v2-0-0`; `SECURITY.md` channel verification; CODEOWNERS; dependabot; the two new issue templates (rule conflict, PayWay behaviour change); nightly mutation + sandbox-contract jobs.
- **Dependencies:** WP-01, WP-03, and Phase 0–2 correctness (do not publish an open money-path conflict).
- **Acceptance criteria:** one owner/repo everywhere; a tag produces a provenance-verified package; every breaking change has a migration entry; a stranger's `npm install` works.
- **Complexity:** M.

### WP-28 · Repository restructure
- **Problem solved:** P2-03, N-12 (partly), P3-04, P3-07, P3-08, P3-10, §37.
- **Scope:** `payway-boilerplate/` → `integrations/{postman,openapi,boilerplate/*}` (no spaces, no typos, no duplicate copy, no `Goal.txt.txt`/`learnings/`); `src/` → the 14-directory layout; `scripts/` → `gates|generate|probes|release`; `.zcodeignore` merged; `.gitignore` globs replaced with explicit paths; ungated polyglot examples labelled or gated; `skills-lock.json` → `skills/lock.json`; `docs/aba-payway-coverage-report.json` generated or deleted.
- **Dependencies:** WP-01, WP-13.
- **Acceptance criteria:** zero spaces in tracked directory names; every sub-project's tests run in CI; zero unreferenced scripts; one ignore file; no orphaned coverage claims; the §37 boundary table enforced by test.
- **Complexity:** M–L.

---

# 42. Coding-Agent-Ready Task Backlog

Each task is independently reviewable, maps to one coherent code change, and names its work package. No artificial microtasks.

**Foundation (WP-02, WP-03, WP-04, WP-06)**
- `DX-KNOW-001` Author `knowledge/rules/rules.yaml` schema + validator + generator scaffold. *(WP-02)*
- `DX-KNOW-002` Seed ≥45 rules from `src/constants.ts` comments and `src/utils.ts` validators, preserving every existing provenance note. *(WP-02)*
- `DX-KNOW-003` Author `errors.yaml` (endpoint:code) by re-keying `src/cli/explain-code.ts`; keep `family` as an alias. *(WP-02, WP-12)*
- `DX-KNOW-004` Harvest the 13 official endpoint response-code tables into `knowledge/rules/evidence/errors-*.md` with quotes, URLs, retrieval dates. *(WP-12)*
- `DX-KNOW-005` Author `env-vars.yaml` (all ~32 variables) + generate `src/config/env-registry.ts`. *(WP-10)*
- `DX-KNOW-006` Author `guardrails.yaml` and the four renderings + identity test. *(WP-21)*
- `DX-KNOW-007` Implement `rules-conformance.test.ts`: ruleId resolution, official-host evidence allow-list, 180-day expiry with auto-degradation, enforcement-point presence. *(WP-02)*
- `DX-BUILD-001` Add `tsconfig.typecheck.json` with the `paths` mapping; repoint `npm run typecheck`. *(WP-03)*
- `DX-BUILD-002` Add `tsconfig.build.json`; add `typecheck:dist`; reorder `ci.yml`. *(WP-03)*
- `DX-BUILD-003` Platform-gate the tunnel test and add the POSIX fake-cloudflared variant. *(WP-03)*
- `DX-BUILD-004` Add `format:check`/`format:fix`; unify lint/format scope; one isolated reformat commit + `.git-blame-ignore-revs`. *(WP-03)*
- `DX-BUILD-005` Add the CJS smoke step; fix `import.meta` resolution in `src/mcp/server.ts`. *(WP-03)*
- `DX-BUILD-006` Extend `sqlite-contract` to all four SQLite suites; add the `integrations/boilerplate` job. *(WP-03, WP-28)*
- `DX-SEC-001` Implement `tlsCaFile`/`PAYWAY_TLS_CA_FILE`/`tlsMinVersion` in the transport. *(WP-04)*
- `DX-SEC-002` Purge `NODE_TLS_REJECT_UNAUTHORIZED` from `AGENTS.md`, `docs/**`, `scripts/**`; add the grep test with an allow-list. *(WP-04)*
- `DX-SEC-003` Implement `doctor SDK-004` (bypass blocker) and `NET-003` (TLS chain with the OpenSSL reason). *(WP-04, WP-11)*
- `DX-TEST-001` Author the 22 golden vectors + runner + fixture lint + CODEOWNERS. *(WP-06)*
- `DX-TEST-002` Bidirectional pinning of `GENERATE_QR_HASH_FIELDS` / `PURCHASE_HASH_FIELDS` against vector field orders, incl. the 24-field neutrality vector. *(WP-06)*

**Correctness (WP-05, WP-11 partial, WP-12, WP-18)**
- `DX-RULE-001` Replace `PURCHASE_PAYMENT_OPTIONS` with the generated official enum + a legacy advisory set. *(WP-05)*
- `DX-RULE-002` Add QR `payment_option` membership validation (HARD for unknown, ADVISORY for profile enablement). *(WP-05)*
- `DX-RULE-003` Correct the `items` cap to 50 on both paths; reclassify or remove the purchase 500-char advisory. *(WP-05)*
- `DX-RULE-004` Make the amount floor HARD (`QR-009`), citing official code 47. *(WP-05)*
- `DX-RULE-005` Add `merchant_id` ≤30 validation and `doctor AUTH-001`. *(WP-05, WP-11)*
- `DX-ERR-001` Move the registry to `core/error-registry.ts`; add `PayWayError.explain()`. *(WP-12)*
- `DX-ERR-002` Add `webhook_error` + `guard_error`; delete the four `type` casts; map to exit codes 4/6. *(WP-12, WP-07)*
- `DX-ERR-003` Implement `explain --operation/--family` + `ambiguous`/`alternatives`; group the no-arg listing by endpoint. *(WP-12)*
- `DX-ERR-004` Replace the four "not individually published" QR entries with the official titles; correct `qr:403`. *(WP-12)*
- `DX-CORE-001` Implement `core/lifecycle.ts` (4 functions + 2 types); delegate the four existing mappers. *(WP-18)*
- `DX-CORE-002` Implement `core/money.ts` (`parseCurrency`, `resolveCurrency`, `assertPayoutTotal`, `assertCaptureWithinCeiling`, `parsePayoutEntries`); collapse the 7 spellings; move the two CLI money invariants. *(WP-18)*
- `DX-CORE-003` Implement `resolveCurrency`'s profile-default behaviour (omit on purchase, require on QR) + the interim advisory. *(WP-18, N-05)*
- `DX-CORE-004` Add the pre-auth method cross-field rule and migrate the three existing conditionals into one mechanism. *(WP-18, N-10)*
- `DX-CORE-005` Harden `generateHmac` against non-primitive hashed values; update the affected golden vector with a recorded reason. *(WP-06, WP-18, N-11)*
- `DX-CORE-006` Record `TX-LIFE-001…003` and surface them in `explain 21`, docs, and the reference app's late-payment demo. *(WP-02, N-04)*
- `DX-CORE-007` Record all three duplicate-`tran_id` variants as `TX-008.variants`; restate the mutation-retry rationale; map 403/4/83 to one diagnostic. *(WP-02, WP-12, N-03)*

**Contracts (WP-07, WP-08, WP-09, WP-26)**
- `DX-CLI-001` Implement `src/cli/output/{envelope,render,redact,exit-codes}.ts`. *(WP-08)*
- `DX-CLI-002` Implement `runCommand` and migrate the state-read commands (`config`, `env`, `capabilities`, `profiles`, `doctor`, `explain`, `status`). *(WP-08)*
- `DX-CLI-003` Register `--output`, `--log-level`, `--log-format`, `--quiet` globally; delete the two per-command registrations; keep `--json` as an alias. *(WP-08)*
- `DX-CLI-004` Implement `PAYWAY_CLI_OUTPUT_SCHEMA=1.0` fallback + the migration table. *(WP-08)*
- `DX-CLI-005` Implement the registry sweep test harness (output contract) and wire migrated commands into it. *(WP-26)*
- `DX-CLI-006` Implement the secret canary sweep. *(WP-26)*
- `DX-CLI-007` Implement `capabilities` (+`--products/--aliases/--deprecations/--errors`) generated from the commander registry. *(WP-09)*
- `DX-CLI-008` Implement the `deprecations.ts` registry and stderr-only notices. *(WP-09)*
- `DX-GUARD-001` Implement `core/env-guard.ts` + `PayWayGuardError` + exit 6. *(WP-07)*
- `DX-GUARD-002` Wire the guard into every §12.2 class-3 command; make `agent/risk.ts` delegate. *(WP-07)*
- `DX-GUARD-003` Implement sandbox-only refusals and `--allow-unverified` gating. *(WP-07)*
- `DX-GUARD-004` Implement the guard test matrix (command × environment × flags, asserting zero HTTP on refusal). *(WP-07, WP-26)*

**Diagnostics (WP-11, WP-14, WP-16, WP-24)**
- `DX-DIAG-001` Implement the `Check`/`CheckResult` model and runner (parallel, timeout-budgeted, `durationMs`). *(WP-11)*
- `DX-DIAG-002` Implement the offline checks (SYS, DEP, SDK, CFG, ENV, AUTH, WEB-002/003/005, DATA, SEC). *(WP-11)*
- `DX-DIAG-003` Implement the network checks (NET-001…005, SYS-003) and the sandbox-tier gating. *(WP-11)*
- `DX-DIAG-004` Implement the live API checks (API-001…003) with **no swallowed errors**. *(WP-11)*
- `DX-DIAG-005` Implement `--check/--category/--severity-min/--fix`; delete both id-blacklists. *(WP-11)*
- `DX-DIAG-006` Implement the no-mutation guarantee test. *(WP-11, WP-26)*
- `DX-DIAG-007` Refactor domain builders to `buildXRequest()` returning `normalization[]`. *(WP-14)*
- `DX-DIAG-008` Implement `auth.inspectHmac` and `request inspect`/`sign`/`send --dry-run`. *(WP-14)*
- `DX-DIAG-009` Implement the inspect-vs-send diff test for every operation. *(WP-14, WP-26)*
- `DX-DIAG-010` Implement the six inspection redaction rules + the `redaction` block. *(WP-14)*
- `DX-DIAG-011` Implement `go-live` gates in code (10 automated) reusing the doctor runner. *(WP-16)*
- `DX-DIAG-012` Implement `go-live` evidence gates (8), `--attach`, `--allow-unverified --reason`, `report`, `diff`. *(WP-16)*
- `DX-DIAG-013` Implement `diagnose` with 19 symptoms and the never-fabricate contract. *(WP-24)*

**Surface (WP-13, WP-15, WP-17, WP-19)**
- `DX-CLI-010` Create `src/cli/program.ts` + `commands/context.ts`; extract the shared helpers (their M2 list is the work order). *(WP-13)*
- `DX-CLI-011…019` Extract one command group per task: `transaction`, `qr`, `checkout`, `money-out`, `cof`, `payment-link`, `reference`, `sandbox`, `config/env/profiles`. *(WP-13)*
- `DX-CLI-020` Relocate the 5 policy blocks out of the CLI; delete the `biome.json` overrides. *(WP-13)*
- `DX-CLI-021` Implement aliases + parity test + stderr deprecations for all 21 legacy names. *(WP-13)*
- `DX-CLI-022` Implement `transaction current` (sticky id, data-root scoped, non-TTY usable). *(WP-13)*
- `DX-WEB-001` Rename to `webhook listen`; add `--print-url`, `--write-env`. *(WP-15)*
- `DX-WEB-002` Add `--output ndjson` per-event documents. *(WP-15)*
- `DX-WEB-003` Add `--expect/--duration/--max-events/--fail-on` gating. *(WP-15)*
- `DX-WEB-004` Implement `webhook fixtures` and `webhook conformance --against`. *(WP-15)*
- `DX-QR-001` Implement the `qr` group with disjoint flag sets and `verified` in output. *(WP-17)*
- `DX-QR-002` Implement `qr inspect` (TLV + CRC + deeplink reporting). *(WP-17)*
- `DX-QR-003` Implement `--lifetime-unit` and the ambiguity advisory. *(WP-17)*
- `DX-QR-004` Rename `generateOfflineQR` → `buildKhqrPayload` with a deprecated alias. *(WP-17)*
- `DX-ADV-001` Implement `core/advisories.ts` (records, per-client dedupe, logger routing, `onAdvisory`, ignore list). *(WP-19)*
- `DX-ADV-002` Redefine `strictValidation` (official + deterministic only) + the `'legacy'` escape. *(WP-19)*
- `DX-FIX-001` Build `fixtures/` (gateway, callbacks, khqr, http) with provenance + `INDEX.json` + parity test. *(WP-19)*
- `DX-FIX-002` Implement `transport/assert-shape.ts` with per-operation dereferenced-field assertions. *(WP-19)*

**Knowledge, docs, agents (WP-20, WP-21, WP-22)**
- `DX-DOC-001` Restructure `docs/` to slugs (16 guides + 4 getting-started + index); redirect stubs for numbered paths. *(WP-20)*
- `DX-DOC-002` Generate `reference/cli.md|json` from `capabilities`; add the parity test. *(WP-20)*
- `DX-DOC-003` Generate `reference/{errors,rules,products,configuration}` ; delete the hand-written 46 KB reference. *(WP-20)*
- `DX-DOC-004` Move `docs/api/` to Pages; delete 239 committed HTML files; add the link-direction test. *(WP-20)*
- `DX-DOC-005` Move corpora generation to `prepack`; stop committing `knowledge/`, `docs-packaged/`, skill `references/`. *(WP-20)*
- `DX-AGT-001` Write `AGENTS.md` v2 (9 sections, ≤250 lines). *(WP-21)*
- `DX-AGT-002` Write `docs/agents/*` (index + 6 domain files + evidence-log + contributing). *(WP-21)*
- `DX-AGT-003` Remove `.agents/AGENTS.md` (pointer for one release); move `HANDOFF.md` out of the public tree. *(WP-21, WP-01)*
- `DX-AGT-004` Generate per-tool adapters; implement `agents-md.test.ts`. *(WP-21)*
- `DX-SKL-001` Author the 11 skills to the §32.3 schema. *(WP-22)*
- `DX-SKL-002` Implement the trigger-uniqueness and `allowed_tools ⊆ capabilities` tests. *(WP-22)*
- `DX-SKL-003` Full `skills/lock.json` with licences; `payway skills doctor`. *(WP-22)*

**Packaging, probes, release, restructure (WP-23, WP-25, WP-27, WP-28)**
- `DX-PKG-001` Add the 5 subpath exports with per-condition types. *(WP-23)*
- `DX-PKG-002` Move mock/harness/simulator to `src/testing/`; add `simulated: true` and `.invalid` hosts. *(WP-23)*
- `DX-PKG-003` Rescope runtime dependencies; add the bundle-size and dependency-count budgets to CI. *(WP-23)*
- `DX-PROBE-001` Build the probe runner (production refusal, minimum amounts, tran_id recording, evidence output). *(WP-25)*
- `DX-PROBE-002` Implement and run the four priority probes: QR lifetime, duplicate `tran_id`, purchase content type, amount wire type. *(WP-25)*
- `DX-PROBE-003` Dispose of all 31 unreferenced scripts (`promote | convert-to-test | delete`). *(WP-25, WP-28)*
- `DX-REL-001` `check-identity.mjs`; align all metadata and badges. *(WP-27)*
- `DX-REL-002` Changesets + `release.yml` with trusted publishing, provenance, SBOM, Pages. *(WP-27)*
- `DX-REL-003` Version 2.0.0; fold the changelog; write `MIGRATIONS.md#v2-0-0`. *(WP-27)*
- `DX-REL-004` CODEOWNERS, dependabot, the two new issue templates, nightly mutation + sandbox-contract jobs. *(WP-27)*
- `DX-REPO-001` `payway-boilerplate/` → `integrations/*`; delete the duplicate copy and stray files. *(WP-28)*
- `DX-REPO-002` `src/` → the 14-directory layout; `scripts/` → 4 subdirectories. *(WP-28, WP-13)*
- `DX-REPO-003` Merge `.zcodeignore`; replace `.gitignore` globs with explicit paths; add `NOTICE`/`THIRD-PARTY-LICENSES`. *(WP-28, WP-01)*

**Total: 96 tasks across 28 work packages.**

---

# 43. Complexity Versus Value Analysis

| Recommendation | Developer value | Implementation complexity | Operational risk | Maintenance cost | Classification | Decision |
|---|---|---|---|---|---|---|
| WP-03 `tsconfig paths` + CI order | **HIGH** (every other gate becomes trustworthy) | **LOW** (3 lines + workflow edit) | LOW | LOW | **high-value / low-complexity** | **Do first** |
| N-02 `explain --operation` + `ambiguous`/`alternatives` | **HIGH** (fixes a reproduced wrong answer on the most-used diagnostic) | **LOW** (~50 lines) | LOW | LOW | **high-value / low-complexity** | **Do first** |
| WP-05 official-value corrections | **HIGH** (unblocks valid integrations) | **LOW–MED** | LOW | LOW | **high-value / low-complexity** | **Do first** |
| WP-04 TLS alternative + instruction purge | **HIGH** (removes a MITM exposure) | **LOW–MED** | LOW | LOW | **high-value / low-complexity** | **Do first** |
| WP-01 public-tree curation | **HIGH** (legal/trust) | **MED** (decision-gated, mechanical) | MED (link rot) | LOW | **high-value / medium-complexity** | Do first, gated on owner sign-off |
| WP-10 env registry + `.env.example` | **HIGH** (fixes false warnings; makes config discoverable) | **LOW–MED** | LOW | LOW | **high-value / low-complexity** | Do early |
| WP-06 golden vectors | **HIGH** (protects every signing change forever) | **MED** | LOW | LOW | **high-value / medium-complexity** | Do early |
| WP-12 error architecture | **HIGH** | **MED** | MED (re-keying) | LOW | **high-value / medium-complexity** | Do early |
| WP-08 output contract | **HIGH** (unlocks all automation) | **HIGH** (touches every command) | MED | LOW | **high-value / high-complexity** | Do, staged |
| WP-11 doctor rebuild | **HIGH** | **MED–HIGH** | LOW | MED (38 checks to maintain) | **high-value / high-complexity** | Do |
| WP-07 env guard | **HIGH** (production safety) | **MED** | LOW | LOW | **high-value / medium-complexity** | Do |
| WP-13 CLI extraction | **HIGH** (maintainability + the two money invariants) | **HIGH** | MED (behaviour drift) | **LOW afterwards** | **high-value / high-complexity** | Do, golden-output protected |
| WP-14 request inspect | **HIGH** (the #1 failure mode) | **MED** (builders already pure) | LOW | LOW | **high-value / medium-complexity** | Do |
| WP-18 core domain model | **HIGH** | **MED–HIGH** | MED | LOW | **high-value / high-complexity** | Do |
| WP-02 knowledge registry (3 files) | **HIGH** (prevents the whole defect class) | **HIGH** (authoring 45+ rules with evidence) | LOW | **MED** (evidence refresh is a recurring obligation) | **high-value / high-complexity** | Do, but **only 3 files** — the 6 rejected registries would have been low-value/high-maintenance |
| WP-26 testing gates | **HIGH** (makes everything else durable) | **MED** | LOW | LOW | **high-value / medium-complexity** | Do |
| WP-25 probe harness | **MED–HIGH** (evidence refresh) | **MED** | MED (spends sandbox quota) | MED | **medium-value / medium-complexity** | Do the 4 priority probes; defer the rest |
| WP-15 webhook listen/fixtures | **MED–HIGH** | **MED** | LOW | LOW | **medium-value / medium-complexity** | Do |
| WP-17 QR group + lifetime | **MED–HIGH** | **MED** | MED (unit migration) | LOW | **medium-value / medium-complexity** | Do |
| WP-21 AGENTS.md | **MED–HIGH** | **LOW–MED** | LOW | LOW | **high-value / low-complexity** | Do |
| WP-20 docs generation | **MED** | **HIGH** | MED (link rot) | **LOW afterwards** | **medium-value / high-complexity** | Do, but last in its phase |
| WP-22 skills 35→11 | **MED** | **HIGH** | LOW | MED | **medium-value / high-complexity** | Do, but only after WP-02/09/21 (otherwise skills reference nothing stable) |
| WP-16 go-live check | **MED** | **MED** | LOW | MED (18 gates to maintain) | **medium-value / medium-complexity** | Do (rescoped from 30 to 18 gates) |
| WP-24 diagnose | **MED** | **MED** | LOW | MED (19 symptoms) | **medium-value / medium-complexity** | Do, after WP-11/12 |
| WP-23 subpath exports | **MED** | **MED** | MED (breaking) | LOW | **medium-value / medium-complexity** | Do at 2.0.0 |
| WP-19 advisories/fixtures/shape | **MED** | **MED** | LOW | LOW | **medium-value / medium-complexity** | Do |
| WP-28 repo restructure | **MED** | **MED–HIGH** | MED (path churn) | LOW | **medium-value / medium-complexity** | Do, with WP-13 |
| WP-27 release engineering | **MED** (until publication is intended) | **MED** | MED | LOW | **medium-value / medium-complexity** | Do in Phase 4 |
| ~~9 YAML registries~~ | LOW–MED | **HIGH** | LOW | **HIGH** (9 files to keep true) | **low-value / high-complexity** | **REJECTED → 3 files** |
| ~~`rules`/`products`/`logs redact`/`logs share`/`transaction explain`/`sandbox reset`/`qr deeplink`/`webhook configure` commands~~ | LOW | LOW–MED | LOW | MED (8 more surfaces to keep true) | **low-value / medium-complexity** | **REJECTED** |
| ~~30 go-live gates~~ | MED | MED | **MED (false PASS)** | HIGH | **medium-value / high-maintenance** | **REDUCED to 18** |
| ~~`.maintainer/` directory~~ | LOW | LOW | LOW | MED | **low-value** | **REJECTED** |
| ~~Decision trees as YAML~~ | LOW (no executable consumer) | MED | LOW | HIGH | **low-value / high-complexity** | **REJECTED → docs prose + `diagnose` code** |
| ~~Response validation against the OpenAPI schema~~ | LOW (schemas don't describe observed variety) | HIGH | **HIGH (false failures)** | HIGH | **low-value / high-risk** | **REJECTED → narrow dereferenced-field assertion (N-08)** |
| ~~Settlement-report ingestion~~ | LOW (merchant-schema specific) | **HIGH** | HIGH | HIGH | **low-value / high-complexity** | **REJECTED — the repo's existing scope decision is correct** |

---

# 44. Second-Pass Architecture Scorecard

## 44.1 Current repository vs first-pass proposal vs second-pass target

| Dimension | Current repo | First-pass proposal | Second-pass target | Where the first-pass proposal itself needed improvement |
|---|---:|---:|---:|---|
| **Correctness** | 6.0 | 7.0 | 9.5 | The proposal contained two materially wrong facts (QR lifetime max; purchase hash order provenance) and one wrong recommendation (ajv dev-only). An implementation-grade plan cannot carry those |
| **Developer experience** | 6.0 | 8.5 | 9.0 | Sound; the interaction-level count (20/11 manual, not 14/8) was understated, so the target was under-specified |
| **CLI design** | 5.0 | 7.0 | 9.0 | The proposal's ~25 groups and 8 extra commands were surface inflation; 13 nouns + 6 standalone with an explicit REJECTED list is the defensible design |
| **Discoverability** | 6.5 | 8.5 | 9.0 | Sound |
| **Automation** | 4.0 | 8.5 | 9.0 | Sound, but the proposal did not specify *which* commands are the deterministic checkpoints; §34 now does |
| **Debuggability** | 5.5 | 8.0 | 9.5 | The proposal praised the error registry without testing it; the second pass found it answers wrongly for 6 codes and is stale for 4 more. Debuggability required an endpoint-scoped registry, not just a `diagnose` command |
| **Security** | 6.0 | 8.5 | 9.0 | Sound; the threat model gained the `redactHookBodies` opt-out, the `--show-preimage` boundary, and the fixture lint |
| **PayWay rule enforcement** | 5.5 | 7.5 | 9.5 | The proposal's 9-registry design was metadata-heavy; 3 authored files + generated JSON enforces the same rules at a third of the maintenance cost |
| **Testing** | 7.5 | 8.5 | 9.0 | The proposal recommended gates that already exist (SQLite, gitleaks, Postman freshness). Corrected; golden vectors added, which the proposal lacked |
| **Maintainability** | 5.0 | 8.0 | 9.0 | Sound |
| **AI-agent readiness** | 5.6 | 8.5 | 9.0 | Sound in direction; the proposal lacked the "skill workflow steps must name a command" rule that makes §34 enforceable |
| **Context efficiency** | 3.0 | **4.0** | 8.5 | **The first-pass proposal scored worst here, and it is its own artifact: a 428 KB audit that mandates reading is the same failure it criticised in `HANDOFF.md`.** The second pass imposes explicit per-layer token budgets (§31.1) and a layered deliverable |
| **Production safety** | 3.0 | 8.5 | 9.5 | Sound; strengthened by making the endpoint authoritative over the label and by covering `checkout-form`/`request inspect` |
| **Architectural simplicity** | 5.5 | **5.0** | 8.5 | **The first-pass proposal was less simple than the status quo in one respect: it added 9 registries, 8 commands, 12 gates, and a `.maintainer/` convention.** The second pass removes all four |
| **Weighted** | **5.4** | **7.3** | **9.1** | |

## 44.2 Verdict on the first-pass proposal

**Directionally correct, over-built, and imperfectly evidenced.** It identified the right five P0s, the right monolith, the right contract gap, and the right knowledge-layer diagnosis. It then proposed roughly 40% more architecture than the diagnosis required, and it argued two of its most important findings from a third-party mirror rather than the official documentation. The second pass keeps its spine — one output contract, one rules source, one guard, extracted CLI, generated docs — and removes everything that fails the §29.1 justification test or the §43 value test.

---

# 45. Remaining Unknowns / ABA Confirmation Required

## 45.1 PAYWAY PRODUCT QUESTIONS

| # | Question | Why it matters | Decision that depends on it | Best current assumption | Risk if wrong | How to verify |
|---|---|---|---|---|---|---|
| Q1 | Does `generate-qr` interpret `lifetime` as **minutes** (official) or **seconds** (2026-08-30 sandbox boundary)? | A 60× lifetime error in either direction; QRs that outlive orders or die instantly | The canonical unit, the CLI flag default, the validator bounds | **Minutes**, per official docs; the 179/180 boundary was probably a different failure (code `04` is a generic validation code) | A merchant's QR expires 60× too soon or stays payable 60× too long | Probe: `lifetime ∈ {1,2,3,4,5,6,179,180,43200,172800}` + read-back of actual expiry via `transaction detail` at T+4 min and T+2 h |
| Q2 | Is the wire `amount` a JSON **number** (official) or a formatted **string** (repo, sandbox-verified)? | It is inside the hash preimage; a change breaks every signature | Whether `formatAmount` stays | **String stays** — sandbox-verified and hash-consistent | Low if unchanged; catastrophic if changed without a probe | Probe: send both forms with identical preimages and compare acceptance |
| Q3 | What is the exact **purchase** hash field order? | `code 1 "Wrong hash"` is the most common failure | Whether the 27-field superset stays | The 24-field mirror order is correct and the superset is hash-neutral | A subscription purchase fails with `code 1` | **Manual browser check** of the rendered PHP sample on `purchase-14530820e0` (it does not render in retrieved content) + a sandbox probe |
| Q4 | What does the gateway do with a **duplicate `tran_id`** — reject (official 403), reject with code 4/83 (telemetry), or accept silently (sandbox W5-7)? | It is the stated justification for the mutation-retry policy and the duplicate warning's wording | The wording of TX-008 and the CLI warning; **not** the policy, which is safe under all three | Environment/profile-dependent; all three occur | A merchant either over-engineers idempotency or under-engineers it | Probe: submit the same `tran_id` twice on generate-qr and purchase; record status, code, and whether the second QR is payable |
| Q5 | Does purchase accept `application/json`, `multipart/form-data`, or both? | Three representations coexist (official multipart, SDK JSON, local form urlencoded) | Whether a `contentType` escape is needed | All accepted; JSON is fine | A profile-specific failure with an opaque code (`7`/`48`) | Probe all three in sandbox |
| Q6 | Are `currency`, `payment_option`, `qr_image_template`, `lifetime` actually **required** on generate-qr, or does the gateway apply defaults? | The SDK defaults all four; official docs mark them required | Whether they become required locally | The gateway applies defaults (the repo's sandbox evidence for `template2`) | A merchant omits a field and gets an opaque rejection | Probe: omit each individually |
| Q7 | Does a **sandbox plugin host** exist for `checkout2-0.js`? | A sandbox form currently loads production JS | Whether `CHECKOUT_FORM_PLUGIN_SRC` derives from the base URL | One host serves both | CSP surprises; sandbox pages executing production JS | Ask ABA; probe `https://checkout-sandbox.payway.com.kh/plugins/checkout2-0.js` |
| Q8 | What is the **numeric refund floor** behind PTL37/PTL187? | Refunds below it fail opaquely | Whether a local floor can be enforced | None enforceable; keep documented as unknown | A merchant's small refund fails with no local signal | Ask ABA; probe decreasing refund amounts |
| Q9 | Is the **`request-qr` (Soundbox)** contract real, and is its 9-field hash order correct? | The archived spec's own `b4hash` for this endpoint is a corrupted copy-paste from generate-qr | Whether the command stays `verified: spec` or is removed | The repo-derived order is plausible but unproven | Every Soundbox integration fails with `code 1` | Ask ABA for the Soundbox spec; probe with a Soundbox-enabled profile |
| Q10 | Are the subscription hash positions (`ctid` after `items`; `token_flag`/`frequency` appended) correct, and is the dedicated official **Subscription** endpoint the intended path instead? | Official docs list a `Subscription POST` endpoint the SDK never calls | Whether subscriptions stay on the purchase path | The purchase-path trio works (sandbox-verified 2026-09-05) | Subscription registration fails, or works but diverges from the supported path | Fetch/inspect `subscription-21402227e0`; probe both paths |
| Q11 | Is the **Customer Module** callback contract really raw-body HMAC? | One of four verification contracts; getting it wrong means accepting forged callbacks or rejecting valid ones | Whether `verifyCallbackSignatureRaw` stays | Relay-sourced; keep, tagged | Forged callbacks accepted, or valid ones rejected | Ask ABA; capture a real Customer-Module delivery |
| Q12 | Are `MITU_FIX` / `MITR_FLEX` valid token flags in production? | Sandbox probes found them invalid; they remain in the charging list | Whether they are refused in production | Invalid — refuse in production | A recurring charge fails | Ask ABA; probe in sandbox |
| Q13 | What is the unit of `x-rate-limit-reset` (delta-seconds vs HTTP-date)? | Retry-after accuracy under throttling | Whether the parser keeps both branches | Both, as today | A too-long or too-short backoff | Observe headers under load in sandbox |
| Q14 | Is `check-transaction`'s **7-day window** and KHQR exclusion real? | Determines whether a status-query fallback is viable for old transactions | The `diagnose` branch and the reconciliation guidance | Real (relay) | A merchant relies on a query that silently returns nothing | Ask ABA; probe with a >7-day-old transaction |

## 45.2 REPOSITORY QUESTIONS

| # | Question | Why it matters | Depends on it | Best assumption | Risk | Verification |
|---|---|---|---|---|---|---|
| R1 | Which repository is canonical — `antigravity-google/aba-payway-ts` or `Ruzaid-aman/ABA-Payway-SDK-unofficial`? | Identity across `package.json`, badges, `SECURITY.md`, npm | WP-27, P1-10 | The public repo is canonical; metadata follows it | Broken issue links, lost security reports, no provenance | Owner decision |
| R2 | May `payway-openapi/` (ABA's shared spec) be redistributed? | It is on the owner's own exclusion list | WP-01 | Exclude until answered; keep the generated `src/types.ts` | Licence exposure | Written ABA response |
| R3 | Is the security mailbox `security@antigravity.dev` owned and monitored? | A disclosure channel that does not exist is worse than none | WP-27 | Replace with GitHub private vulnerability reporting until confirmed | Lost vulnerability reports | Send and receive a test report |
| R4 | Is publication intended at all, and at which version? | README currently instructs `npm pack` from a checkout | WP-27, §34 | 2.0.0, per the repo's own `VERSIONING.md` | A permanent "preparing first release" state | Owner decision |
| R5 | Are the committed sandbox demo credentials still active and still authorized? | Owner authorization is dated 2026-10-01 | WP-01 | Authorized; keep, with the authorization recorded | Quota abuse; a scanner-blind 40-hex secret in public | Owner re-confirmation + rotation if abused |
| R6 | Should `merchant-qr-pos` and `payment_link_api` be maintained, gated, or removed? | Two ungated sub-projects, one cited as test evidence by an orphaned report | WP-28 | Gate `merchant-qr-pos` (it has real tests), reduce `payment_link_api` to a documented recipe | False coverage confidence | Owner decision |

## 45.3 SECURITY QUESTIONS

| # | Question | Best assumption | Verification |
|---|---|---|---|
| S1 | Is `redactHookBodies: false` ever legitimate in production? | No — warn via `doctor SEC-006` | Owner decision |
| S2 | Should the preimage ever be logged at `trace`? | No — sha256 only; `--show-preimage` is the sole path | Enforced by test |
| S3 | Is plaintext profile storage acceptable, or is OS-keychain integration required before 2.0.0? | Acceptable with disclosure for 2.0.0; keychain as a follow-up | Owner decision |
| S4 | May `.scratch/telegram-*/answers/raw/*.json` (verbatim third-party transcripts) remain public? | No — move to the private line; keep only attributed derived facts in `evidence/` | Owner decision |

## 45.4 OPERATIONAL QUESTIONS

| # | Question | Best assumption | Verification |
|---|---|---|---|
| O1 | Who owns the 180-day evidence refresh? | The maintainer, forced by the failing build | `rules-conformance` |
| O2 | Which probes run nightly, and what quota do they consume? | The four money-path probes at minimum amounts | WP-25 |
| O3 | Is there a support rota for the two new issue templates (rule conflict, behaviour change)? | If not, do not add them — an unanswered template is worse than none | Owner decision |

## 45.5 DEVELOPER EXPERIENCE DECISIONS

| # | Question | Best assumption | Verification |
|---|---|---|---|
| D1 | `payway` as the primary bin at 2.0.0, `payway-sdk` retained forever? | Yes | Owner decision |
| D2 | Noun-first tree with 21 hidden aliases until 3.0.0? | Yes | Owner decision |
| D3 | Is the `sdk` facade kept, promoted, or deprecated in favour of `PayWay`? | Kept, with §9.2's documented division; deprecating it would break QUICKSTART | Owner decision |
| D4 | Should `strictValidation` default to `true` at 3.0.0? | Not before the advisory semantics are fixed and the enum/lifetime defects are closed | Revisit after Phase 2 |
| D5 | Do the 16 guides absorb the 7 `integration-*` pages entirely? | Yes, except `integration-finance`, whose content is a distinct audience (finance, not engineering) and becomes `guides/reconciliation-and-settlement` | Doc review |

---

# 46. Final Prioritized Roadmap

Ordered by dependency within each priority. P0 = correctness/security/transaction risk · P1 = developer blockers and architecture foundation · P2 = automation and major DX · P3 = optimization and polish.

## P0 — correctness, security, transaction risk (target: 1 week)

| Order | Work | WP | Why first |
|---|---|---|---|
| 1 | `tsconfig paths` + CI reorder + platform-gated tunnel test + `format:check` | WP-03 | Nothing else can be verified until the gates run green |
| 2 | Official-value corrections: purchase enum, QR payment option, items cap, amount floor | WP-05 | The SDK currently rejects a valid value under `strictValidation` |
| 3 | TLS: `tlsCaFile` first, then purge the bypass instruction | WP-04 | A MITM exposure taught to every agent |
| 4 | Public-tree curation + `repository-manifest` gate | WP-01 | Legal/trust; decision-gated, so start the conversation now |
| 5 | Golden vectors (22) | WP-06 | Protects items 2 and every later signing change |
| 6 | Registry scaffold: `rules.yaml` + `errors.yaml` + `evidence/` + conformance test, seeded with the rules touched by items 2–5 | WP-02 (partial) | Makes items 2–5 durable instead of one-off |
| 7 | QR lifetime probe + conflict record (no unit change yet) | WP-25 (partial), WP-17 (partial) | Records the conflict honestly before anyone "fixes" it wrongly |
| 8 | `explain --operation` + `ambiguous`/`alternatives` (additive half) | WP-12 (partial) | Fixes a reproduced wrong answer in ~50 lines |

**P0 exit criteria:** CI green on both OSes from a clean clone; no officially documented value rejected; no TLS-bypass instruction anywhere; 22 golden vectors passing; the four priority rules carrying evidence files; the lifetime conflict recorded rather than guessed; `explain` no longer silently answers for the wrong endpoint.

## P1 — developer blockers and architecture foundation (target: 4–6 weeks)

| Order | Work | WP | Depends on |
|---|---|---|---|
| 9 | Registry completion: `env-vars.yaml`, `guardrails.yaml`, generated modules, inverted error-registry generation | WP-02 | 6 |
| 10 | Env registry + root `.env.example` + rewritten `envValidator` | WP-10 | 9 |
| 11 | CLI output contract + `runCommand` + global flags (stage 1: state-read commands) | WP-08 | 1 |
| 12 | `capabilities` + deprecation registry | WP-09 | 11 |
| 13 | Shared `env-guard` + exit 6 + `--confirm-production` + sandbox-only refusals | WP-07 | 9 |
| 14 | `doctor` rebuild (38 checks, severities, network/TLS/build/coherence, no swallowed errors, no-mutation proof) | WP-11 | 10, 11, 13 |
| 15 | Error architecture: endpoint-scoped registry, `explain()`, the union, official code-table harvest | WP-12 | 6, 9 |
| 16 | Core domain model: lifecycle, money, ids, time; the two CLI money invariants relocated; `resolveCurrency` | WP-18 | 9 |
| 17 | Advisories rebuilt + `strictValidation` redefined + fixtures corpus + shape assertion | WP-19 | 9, 11 |
| 18 | TLS/probe follow-through: remaining 3 priority probes (duplicate tran_id, content type, amount type) | WP-25 | 7 |
| 19 | `AGENTS.md` v2 + `docs/agents/*` + generated adapters + instruction test | WP-21 | 9, 3, 12 |
| 20 | Testing gates: registry sweep, canary sweep, boundary test, env-registry conformance | WP-26 | 11, 12 |
| 21 | Identity consistency + `check-identity` + verified security channel | WP-27 (partial) | 4 |

**P1 exit criteria:** an AI agent can determine environment, readiness, and the exact next command from `AGENTS.md` + `capabilities --json` + `config --json` + `doctor --json` alone; no production mutation is possible without `--confirm-production`; `explain` is endpoint-correct; zero false "unrecognized variable" warnings; the output contract is enforced by a blocking sweep for all migrated commands.

## P2 — automation and major DX (target: 6–8 weeks)

| Order | Work | WP | Depends on |
|---|---|---|---|
| 22 | CLI extraction: `program.ts`, 9 command-group tasks, policy relocation, alias parity, lint overrides deleted | WP-13 | 11, 12, 13 |
| 23 | `request inspect` / `sign` / `send --dry-run` + the diff test | WP-14 | 16, 22, 6 |
| 24 | `webhook listen` + ndjson + expectations + fixtures + conformance | WP-15 | 11, 17, 22 |
| 25 | QR group + canonical lifetime resolution (post-probe) | WP-17 | 7, 18, 22 |
| 26 | `go-live check` (18 gates) | WP-16 | 13, 14 |
| 27 | `diagnose` (19 symptoms) | WP-24 | 14, 15, 16 |
| 28 | Subpath exports + dependency rescoping + simulator relocation | WP-23 | 17, 22 |
| 29 | Repository restructure (`integrations/`, `src/` layout, `scripts/` split, ignore merge) | WP-28 | 4, 22 |

**P2 exit criteria:** no `src/cli.ts`; Scenario A ≤12 interactions / ≤4 manual; Scenario C fully scriptable with a pass/fail exit code; `request inspect` provably equals what is sent; a library-only install pulls ≤2 runtime deps.

## P3 — optimization and polish (target: 4–6 weeks, then ongoing)

| Order | Work | WP |
|---|---|---|
| 30 | Documentation generation + IA (16 guides, generated reference, mirrors → stubs, `docs/api` → Pages, corpora → `prepack`) | WP-20 |
| 31 | Skills 35 → 11 with the schema, trigger uniqueness, full lock, `skills doctor` | WP-22 |
| 32 | Probe harness completion + disposition of all 31 unreferenced scripts + nightly money-path probes | WP-25 |
| 33 | Release engineering: changesets, `release.yml`, provenance, SBOM, 2.0.0, `MIGRATIONS.md`, CODEOWNERS, dependabot, issue templates, nightly mutation | WP-27 |
| 34 | Evidence-refresh cadence established (180-day expiry forces it); quarterly golden-path re-timing published | WP-02, WP-25 |

**P3 exit criteria:** each documentation chapter committed once; all reference docs generated with a blocking parity test; 11 schema-valid skills; zero unreferenced scripts; a provenance-verified 2.0.0 published; no evidence file older than 180 days.

---

# 47. Definitive Implementation Backlog

| ID | Priority | Work Package | Task | Depends On | Files/Modules | Complexity | Risk | Acceptance Criteria |
|---|---|---|---|---|---|---|---|---|
| DX-BUILD-001 | **P0** | WP-03 | `tsconfig.typecheck.json` with the `paths` mapping; repoint `npm run typecheck` | — | `tsconfig*.json`, `package.json` | S | Low | On a clean clone `npm ci && npm run typecheck` exits 0 with no prior build |
| DX-BUILD-002 | **P0** | WP-03 | `tsconfig.build.json`, `typecheck:dist`, CI reorder to match `CONTRIBUTING.md` | BUILD-001 | `.github/workflows/ci.yml`, `package.json` | S | Low | CI green on ubuntu+windows; `AGENTS.md` §6 = `CONTRIBUTING.md` = `ci.yml` order (three-way test) |
| DX-BUILD-003 | **P0** | WP-03 | Platform-gate the tunnel test; add the POSIX fake-cloudflared variant | — | `src/__tests__/sdk-facade-and-tunnel.test.ts`, `src/webhook/tunnel.ts` | S | Low | `vitest run` reports 0 failures on Linux; tunnel behaviour covered on both OSes |
| DX-BUILD-004 | **P0** | WP-03 | `format:check`/`format:fix`; unified scope; one isolated reformat commit + `.git-blame-ignore-revs` | — | `package.json`, `biome.json`, `src/`, `scripts/`, `skills/` | S | Med (diff size) | `biome format` exits 0 tree-wide; a misformatted file fails CI; `git blame` preserved |
| DX-BUILD-005 | **P0** | WP-03 | CJS smoke step; fix `import.meta` resolution in `src/mcp/server.ts` | — | `src/mcp/server.ts`, `ci.yml` | S | Low | `npm run build` emits zero warnings; `node dist/cli.cjs mcp --list-tools` works |
| DX-RULE-001 | **P0** | WP-05 | Generated official purchase enum + legacy advisory set | KNOW-001 | `src/constants.ts`, `src/domains/checkout.ts`, `knowledge/rules/` | S | Low | `abapay_khqr`/`alipay`/`wechat` accepted in normal **and** strict mode; `abapay`/`abapay_deeplink` advisory; unknown values rejected citing the rule id; `sdk.runTestSuite` emits no enum advisory |
| DX-RULE-002 | **P0** | WP-05 | QR `payment_option` membership (HARD unknown / ADVISORY enablement) | KNOW-001 | `src/domains/qr.ts` | S | Low | `cards` rejected locally for generate-qr; `abapay_khqr` accepted; code 23 mapped to profile enablement |
| DX-RULE-003 | **P0** | WP-05 | `items` cap 10 → 50 on both paths; reclassify the purchase 500-char advisory | KNOW-001 | `src/domains/checkout.ts:311`, `src/domains/qr.ts:147` | S | Low | No advisory at 11 items; advisory at 51 citing the official source |
| DX-RULE-004 | **P0** | WP-05 | Amount floor ADVISORY → HARD (`QR-009`, official code 47) | KNOW-001 | `src/utils.ts#validateAmountFloor` | S | Low | 0.009 USD and 99 KHR throw citing `QR-009`; 0.01 USD and 100 KHR pass |
| DX-SEC-001 | **P0** | WP-04 | `tlsCaFile`/`PAYWAY_TLS_CA_FILE`/`tlsMinVersion` via an `undici` Agent | — | `src/client.ts`, `src/transport` (or `client.ts` pre-WP-13) | S | Low | With a self-signed corporate root, a real `exchange-rate` call succeeds; without it, the error names the CA fix |
| DX-SEC-002 | **P0** | WP-04 | Purge `NODE_TLS_REJECT_UNAUTHORIZED` from `AGENTS.md`/`docs/**`/`scripts/**` + grep test | SEC-001 | 19 + 17 occurrences | S | Low | The grep test passes with only the allow-listed paths |
| DX-SEC-003 | **P0** | WP-04/11 | `doctor SDK-004` (bypass blocker) + `NET-003` (TLS chain with the OpenSSL reason) | SEC-001 | `src/cli/commands/doctor.ts` → `diagnostics/doctor` | S | Low | With the bypass set, `doctor` exits 5 and names it; a chain failure prints the OpenSSL reason and the `NODE_EXTRA_CA_CERTS` fix |
| DX-TEST-001 | **P0** | WP-06 | 22 golden vectors + runner + fixture lint + CODEOWNERS | — | `fixtures/vectors/**`, `src/__tests__/golden-vectors.test.ts` | M | Low | All 22 pass; changing a `*_HASH_FIELDS` entry without a vector update fails CI; a payout hex regression fails |
| DX-KNOW-001 | **P0** | WP-02 | `rules.yaml` schema + validator + generator scaffold | — | `knowledge/rules/`, `scripts/generate/gen-rules.ts` | M | Low | The generator emits `core/rules.ts` deterministically; `--check` is byte-stable |
| DX-KNOW-007 | **P0** | WP-02 | `rules-conformance.test.ts` (ruleId resolution, official-host allow-list, 180-day expiry, enforcement presence) | KNOW-001 | `src/__tests__/` | M | Low | A rule with `source: official` and no evidence file fails; a non-official evidence URL fails; a 181-day-old file degrades the rule and fails |
| DX-ERR-003a | **P0** | WP-12 | `explain --operation/--family` + `ambiguous`/`alternatives` (additive) | — | `src/cli/explain-code.ts`, `src/cli.ts` | S | Low | `explain 16 --operation checkout.purchase` → "Invalid Amount"; `--operation qr.create` → "Invalid First Name"; bare `explain 16 --output json` → `ambiguous: true` with 2 alternatives |
| DX-PROBE-002a | **P0** | WP-25 | QR lifetime probe + conflict record (no unit change) | KNOW-001, PROBE-001 | `scripts/probes/qr-lifetime.probe.ts`, `knowledge/rules/` | S | Med (quota) | Probe results committed with request/response pairs and read-back expiry; `QR-013.conflict` populated; `go-live --strict` would report a BLOCKER |
| DX-REPO-001a | **P0** | WP-01 | `repository-manifest.yaml` + allow-list gate + removal of the item-A exclusion list | — | root, `docs/`, `scripts/gates/` | M | Med (link rot) | Zero tracked paths unmatched by `public`/`generated`; a negative test proves the gate bites; `RELEASE-READINESS.md` items A/B dated |
| DX-CLI-001 | **P1** | WP-08 | `src/cli/output/{envelope,render,redact,exit-codes}.ts` | BUILD-002 | `src/cli/output/**` | M | Low | The envelope matches §16.1 exactly; redaction delegates to `core` |
| DX-CLI-002 | **P1** | WP-08 | `runCommand` + migrate the state-read commands | CLI-001 | `src/cli.ts`, `src/cli/commands/{doctor,docs,onboard}.ts` | M | Med | `config`/`env`/`capabilities`/`profiles`/`doctor`/`explain`/`status` each emit exactly one versioned document; golden JSON per command |
| DX-CLI-003 | **P1** | WP-08 | Global `--output`/`--log-level`/`--log-format`/`--quiet`; delete the 2 per-command registrations | CLI-001 | `src/cli.ts:2484,3175,5509-5520` | S | Low | `check-transaction --output json` returns an envelope instead of `unknown option` |
| DX-CLI-007 | **P1** | WP-09 | `capabilities` generated from the commander registry | CLI-003 | `src/cli/commands/capabilities.ts`, `src/cli/completions/introspect.ts` | S | Low | Every `--help` command appears and vice versa; `moneyMoving` is true for exactly the §12.2 class-3 set |
| DX-GUARD-001 | **P1** | WP-07 | `core/env-guard.ts` + `PayWayGuardError` + exit 6 | KNOW-001 | `src/core/env-guard.ts`, `src/errors.ts` | M | Low | The endpoint is authoritative over the label; a sandbox profile + production endpoint yields `coherence: 'mismatch'` |
| DX-GUARD-002 | **P1** | WP-07 | Wire the guard into every class-3 command; `agent/risk.ts` delegates | GUARD-001 | `src/cli.ts`, `src/agent/risk.ts` | M | Med | The matrix test (command × environment × flags) passes with **zero HTTP calls** on refusal; both surfaces import one module |
| DX-KNOW-005 | **P1** | WP-10 | `env-vars.yaml` + generated `env-registry.ts` | KNOW-001 | `knowledge/rules/`, `src/config/` | S | Low | The reproduced false-warning command emits zero warnings |
| DX-KNOW-005b | **P1** | WP-10 | Root `.env.example` generated; `init` writes two artifacts; AST-scan conformance test | KNOW-005 | `.env.example`, `src/cli/commands/init.ts`, `src/__tests__/` | S | Low | Every non-secret registry entry appears with a comment; a new `process.env.PAYWAY_*` read without a registry entry fails the build |
| DX-DIAG-001…006 | **P1** | WP-11 | `doctor` rebuild (6 tasks: model+runner, offline checks, network checks, live API checks, filters+`--fix`, no-mutation proof) | GUARD-001, CLI-002, KNOW-005 | `src/diagnostics/doctor/**` | L | Low | ≥38 checks with registry severities; both id-blacklists deleted; no swallowed errors; exit 0/1/3/5; zero mutation-endpoint hits under `--live --route all` |
| DX-ERR-001/002/004 | **P1** | WP-12 | Registry to `core/`, `explain()`, the union (no casts), official code-table harvest | KNOW-003, KNOW-004, TEST-001 | `src/core/errors.ts`, `src/errors.ts`, `src/cli/explain-code.ts` | M | Med | SDK consumers get `explain()` without the CLI; `webhook_error` → exit 4; all 20 official QR codes carry official titles; `qr:403` names duplicate transaction id; zero "not individually published" hints where official evidence exists |
| DX-CORE-001…007 | **P1** | WP-18 | Core model (7 tasks: lifecycle, money, resolveCurrency, cross-field rules, `generateHmac` hardening, TX-LIFE rules, TX-008 variants) | KNOW-002 | `src/core/**`, `src/domains/**`, `src/auth.ts` | L | Med | One mapping function; `unknown` ≠ `failed`; both money invariants callable from the SDK; one currency spelling; purchase omits `currency`; pre-auth method rule enforced; non-primitive hashed values throw; TX-LIFE and TX-008 recorded with variants |
| DX-ADV-001/002 | **P1** | WP-19 | Advisories rebuilt; `strictValidation` redefined with a `'legacy'` escape | KNOW-002, CLI-001 | `src/core/advisories.ts`, `src/utils.ts` | M | Med | No `console.warn` in library code; dedupe is per-client; promotion only for official deterministic rules; `PAYWAY_ADVISORY_IGNORE` works by rule id |
| DX-CLI-005/006 | **P1** | WP-26 | Registry sweep + canary sweep | CLI-002, CLI-007 | `src/__tests__/` | M | Low | Both blocking and green; each has a negative test proving it bites |
| DX-AGT-001…004 | **P1** | WP-21 | `AGENTS.md` v2, `docs/agents/*`, adapters, instruction test | KNOW-006, SEC-002, CLI-007 | `AGENTS.md`, `docs/agents/**` | M | Low | ≤250 lines / ≤2,500 tokens; every command shown exists; every path exists; no bypass string; §3/§7 byte-identical to their sources; no duplicated rule statements |
| DX-REL-001 | **P1** | WP-27 | `check-identity.mjs` + metadata/badge alignment + security-channel verification | REPO-001a | `package.json`, `SECURITY.md`, `docs/reference/`, `scripts/gates/` | S | Low | One owner/repo everywhere; the gate is blocking; the security channel verified by round-trip |
| DX-CLI-010…022 | **P2** | WP-13 | CLI extraction (13 tasks: root+context+helpers, 9 command groups, policy relocation, alias parity, sticky id) | CLI-002, CLI-007, GUARD-002 | `src/cli.ts` → `src/cli/**` | L | Med | No `src/cli.ts`; no file >400 lines; lint overrides deleted; golden outputs identical; all 21 aliases parity-tested; `transaction current` works non-TTY |
| DX-DIAG-007…010 | **P2** | WP-14 | `buildXRequest()` refactor, `inspectHmac`, `request inspect/sign/send`, the diff test, the 6 redaction rules | CORE-001, CLI-010, TEST-001 | `src/domains/**`, `src/auth/`, `src/diagnostics/request-inspect.ts` | M | Low | Inspection provably equals the sent body for every operation; `--show-preimage` passes the canary sweep; `--no-sign` works with zero configuration |
| DX-WEB-001…004 | **P2** | WP-15 | `webhook listen`, ndjson, expectations, fixtures, conformance | CLI-002, FIX-001, CLI-010 | `src/cli/commands/webhook.ts`, `src/webhook/**`, `fixtures/` | M | Low | `--print-url` yields one line; `--expect/--fail-on` exits 0/4/5; duplicates reported on `(transactionId, status)`; conformance asserts 2xx<5s, idempotent replay, unverified rejection, 401 on a bad signature |
| DX-QR-001…004 | **P2** | WP-17 | QR group, `qr inspect`, `--lifetime-unit`, `buildKhqrPayload` rename | PROBE-002a, CLI-010 | `src/cli/commands/qr.ts`, `src/domains/qr.ts`, `src/khqr-offline/` | M | Med (unit migration) | Four capabilities with disjoint flag sets; `qr inspect` round-trips CRC and rejects corruption; `soundbox` requires `--allow-unverified` in production; one canonical lifetime unit with no contradicting identifier or message |
| DX-DIAG-011/012 | **P2** | WP-16 | `go-live` 10 automated + 8 evidence gates, `report`, `diff` | DIAG-001…006, GUARD-001 | `src/diagnostics/go-live/**` | M | Low | No PASS without evidence; UNVERIFIED never counted as PASS; an open money-path conflict yields BLOCKER; exit 0/5 |
| DX-DIAG-013 | **P2** | WP-24 | `diagnose` with 19 symptoms and the never-fabricate contract | DIAG-004, ERR-001, CORE-001 | `src/diagnostics/diagnose.ts` | M | Low | With no evidence `confirmed: []` and `next` populated; every cause carries a `ruleId`; `--symptom late-payment` differentiates KHQR reversal from WeChat/Alipay |
| DX-PKG-001…003 | **P2** | WP-23 | 5 subpath exports; `src/testing/` relocation; `simulated: true` + `.invalid` hosts; dependency rescoping + budgets | FIX-001, CLI-010 | `package.json`, `tsup.config.ts`, `src/testing/**`, `src/index.ts` | M | Med | 5 specifiers work in ESM+CJS+types; a library-only install pulls ≤2 runtime deps; the root no longer exports the mock server; no `.invalid` URL outside `testing/`; tarball ≤3.5 MB / ≤130 files |
| DX-FIX-001/002 | **P2** | WP-19 | Fixture corpus + `INDEX.json` + provenance + lint; `transport/assert-shape.ts` | KNOW-002 | `fixtures/**`, `src/transport` | M | Low | Every `normalizePaywayResponse` branch has a fixture; a missing dereferenced field yields `PW-API-SHAPE` with a correlation id; the lint rejects a 40-hex canary and a production host |
| DX-REPO-001/002/003 | **P2** | WP-28 | `integrations/*` rename; `src/` 14-directory layout; `scripts/` split; ignore merge; explicit `.gitignore` paths; `NOTICE`/`THIRD-PARTY-LICENSES` | REPO-001a, CLI-010 | repo-wide | L | Med (path churn) | Zero spaces in tracked directory names; every sub-project's tests run in CI; one ignore file; the §37 boundary table enforced by test |
| DX-DOC-001…005 | **P3** | WP-20 | Slug IA (16 guides + 4 getting-started + index); generated `reference/*`; redirect stubs; `docs/api` → Pages; corpora → `prepack` | CLI-007, ERR-001, KNOW-002 | `docs/**`, `scripts/generate/`, `package.json` | L | Med (link rot) | Zero hand-written reference prose; the parity test is blocking; each chapter committed once; `git ls-files docs/api` empty; the tarball within budget |
| DX-SKL-001…003 | **P3** | WP-22 | 11 skills to schema; trigger-uniqueness + `allowed_tools ⊆ capabilities` tests; full lock + `skills doctor` | KNOW-002, CLI-007, AGT-001 | `skills/**`, `src/cli/commands/skills.ts` | L | Low | 11 schema-valid skills; zero duplicate triggers; every `allowed_tools` entry exists in `capabilities`; the lock covers all skills with licences; `skills doctor` fails on a stale rule dependency |
| DX-PROBE-001/002/003 | **P3** | WP-25 | Probe runner; the 4 priority probes; disposition of all 31 unreferenced scripts | KNOW-001 | `scripts/probes/**`, `package.json`, `ci.yml` | M | Med (quota) | Zero unreferenced scripts; every sandbox-derived rule names a runnable `refreshCommand`; the runner refuses production; nightly evidence artifacts dated |
| DX-REL-002/003/004 | **P3** | WP-27 | Changesets + `release.yml` (trusted publishing, provenance, SBOM, Pages); 2.0.0 + changelog fold + `MIGRATIONS.md`; CODEOWNERS/dependabot/issue templates/nightly jobs | REL-001, BUILD-002, and all P0 correctness | `.github/**`, `CHANGELOG.md`, `.changeset/`, `package.json` | M | Med | A tag produces a provenance-verified package; every breaking change has a migration entry; a stranger's `npm install` works; money-path directories require maintainer review |
| DX-BUILD-006 | **P3** | WP-03/28 | Extend `sqlite-contract` to all 4 suites; add the `integrations/boilerplate` job | REPO-001 | `ci.yml` | S | Low | 0 skipped SQLite tests in CI; both sub-projects' tests execute |
| DX-KNOW-002/003/004/006 | **P0/P1** | WP-02/12 | Seed ≥45 rules; re-key errors by endpoint; harvest 13 official code tables; author guardrails | KNOW-001 | `knowledge/rules/**` | L | Low | Every existing provenance comment is preserved as a `source`/`evidence` entry; all 13 endpoint tables harvested with quotes and dates; guardrails rendered identically into 4 surfaces |

---

# 48. Recommended First Implementation Slice

## 48.1 The slice

**Name:** *"Trustworthy gates and correct values"* — eight tasks, one week, no architecture change.

| # | Task | WP | Size |
|---|---|---|---|
| 1 | `DX-BUILD-001` — `tsconfig.typecheck.json` with `paths: {"aba-payway-ts": ["./src/index.ts"]}`; repoint `npm run typecheck` | WP-03 | ~10 lines |
| 2 | `DX-BUILD-002` — reorder `ci.yml` to `Install → Build → Typecheck → Typecheck:dist → Lint → …`; add `tsconfig.build.json` | WP-03 | ~20 lines |
| 3 | `DX-BUILD-003` — platform-gate the tunnel test + add the POSIX fake-cloudflared variant | WP-03 | ~30 lines |
| 4 | `DX-BUILD-004` — add `format:check`; one isolated reformat commit; `.git-blame-ignore-revs` | WP-03 | 1 config line + 1 mechanical commit |
| 5 | `DX-RULE-001…004` — official purchase enum (+ legacy advisory set), QR payment-option membership, `items` 10→50, amount floor ADVISORY→HARD | WP-05 | ~120 lines + tests |
| 6 | `DX-ERR-003a` — `explain --operation/--family` with `ambiguous`/`alternatives` (additive only) | WP-12 | ~60 lines + tests |
| 7 | `DX-KNOW-001 (subset)` — `knowledge/rules/rules.yaml` + `evidence/` for **only** the 6 rules touched by tasks 5–6, plus `rules-conformance.test.ts` (official-host allow-list + 180-day expiry) | WP-02 | ~200 lines YAML + ~150 lines test |
| 8 | `DX-SEC-002` — purge `NODE_TLS_REJECT_UNAUTHORIZED` from `AGENTS.md` (19) and `docs/**` (9); add the grep test with an allow-list. **`DX-SEC-001` (`tlsCaFile`) ships in the same slice if time allows; otherwise the purge waits for it** | WP-04 | ~30 doc edits + 1 test |

## 48.2 Why these come first

1. **Tasks 1–4 make every subsequent claim verifiable.** Until CI is green, no other work package can be validated by anyone but its author. This is the only true blocker in the programme, and its primary fix is three lines.
2. **Task 5 stops the SDK rejecting valid payments.** `strictValidation` currently throws on an officially documented `payment_option`; the `items` advisory is wrong by 5×; the amount floor is advisory where the gateway has a dedicated error code. These are correctness defects with a single-line-of-evidence fix each.
3. **Task 6 stops the most-used diagnostic giving wrong answers**, additively and without breaking a single existing consumer.
4. **Task 7 creates the mechanism that makes tasks 5–6 durable** — and deliberately creates it for *six rules only*. Proving the registry on a small surface before authoring 45 rules is the difference between a mechanism and a burden. The conformance test's evidence-expiry rule is the single feature that prevents this entire defect class from recurring.
5. **Task 8 removes a security instruction that agents copy into merchant code.** It is last in the slice only because the safe alternative (`tlsCaFile`) should ideally land with it; if it cannot, the purge slips to the next slice rather than shipping without an alternative.

**Together these eight tasks deliver:** green CI on both OSes · no officially documented value rejected · an endpoint-correct `explain` · the first six evidence-backed rules with an expiry mechanism · no TLS-bypass instruction — and they change **no public API, no command name, no output shape, and no directory**. Zero migration burden.

## 48.3 Dependencies

`1 → 2` (tsconfig before the workflow reorder) · `7 → 5, 6` (the registry schema before the rules that use it; in practice author the 6 rules alongside) · `8` depends on `DX-SEC-001` if the purge is to be complete. Tasks 3, 4 are independent. **External dependency:** sandbox credentials for nothing in this slice — it is entirely offline. Owner decisions are needed for WP-01 (not in this slice) and R1/R3 (not in this slice).

## 48.4 Expected repository changes

| Path | Change |
|---|---|
| `tsconfig.json`, `tsconfig.typecheck.json`, `tsconfig.build.json` | added/split |
| `package.json` | `typecheck`, `typecheck:dist`, `format:check`, `format:fix` scripts |
| `.github/workflows/ci.yml` | step reorder; two added steps |
| `.git-blame-ignore-revs` | added |
| `src/**`, `scripts/**`, `skills/**` | one isolated formatting-only commit (181 files) |
| `src/__tests__/sdk-facade-and-tunnel.test.ts` | platform gate + POSIX variant |
| `src/constants.ts` | `PURCHASE_PAYMENT_OPTIONS` → generated; `PURCHASE_PAYMENT_OPTIONS_LEGACY` added; QR payment-option set added |
| `src/domains/checkout.ts` | enum advisory logic; `items` 10 → 50 |
| `src/domains/qr.ts` | payment-option membership validation; `items` 10 → 50 |
| `src/utils.ts` | `validateAmountFloor` advisory → HARD |
| `src/cli/explain-code.ts`, `src/cli.ts` | `--operation`/`--family`; `ambiguous`/`alternatives` |
| `knowledge/rules/rules.yaml`, `knowledge/rules/evidence/{PUR-003,QR-012,QR-016,QR-009,ERR-001,QR-001}.md` | added (6 rules) |
| `scripts/generate/gen-rules.ts`, `src/__tests__/rules-conformance.test.ts` | added |
| `AGENTS.md`, `docs/**` | 28 TLS-bypass occurrences removed |
| `src/__tests__/no-tls-bypass.test.ts` | added |

Estimated diff: **~1,200 lines of substance + one 181-file formatting commit.**

## 48.5 Tests

- Existing: the full suite must stay green (2,378 tests) on Linux **and** Windows.
- New: `rules-conformance` (ruleId resolution, official-host evidence allow-list, 180-day expiry with auto-degradation, enforcement-point presence) — with four negative tests · purchase enum × {normal, strict} × {6 official, 2 legacy, 1 unknown} · QR payment-option membership · `items` at 10/11/50/51 on both endpoints · amount floor at 0.009/0.01 USD and 99/100 KHR · `explain` golden files for all 6 colliding codes × 2 scopes + the bare-ambiguous case · the TLS-bypass grep test · `sdk.runTestSuite` emits no purchase-enum advisory.
- CI-level: a fresh-checkout job proving `typecheck` passes **before** `build`; planted-failure negative tests for type error, unformatted file, and failing test.

## 48.6 Acceptance criteria (all objective)

1. On a clean clone: `npm ci && npm run typecheck` exits **0** with no prior `npm run build`.
2. On a clean clone: `npm ci && npm run build && npm run typecheck && npm run typecheck:dist && npm test && npm run lint && npm run format:check` exits **0** on Linux and on Windows.
3. `npx vitest run` reports **0 failures** and **24 skips** (the SQLite suites, until `DX-BUILD-006`).
4. CI is green on `main` for both matrix OSes, and the recorded run SHA replaces the "never run on a remote" line in `docs/project/RELEASE-READINESS.md`.
5. `createCheckoutDomain({strictValidation:true}).purchase({paymentOption:'abapay_khqr', …})` **does not throw**.
6. `purchase({paymentOption:'paypal'})` throws citing `PUR-003` and listing the 6 official values.
7. `qr.generateQr({paymentOption:'cards'})` throws citing `QR-012`; `{paymentOption:'abapay_khqr'}` does not.
8. An 11-item `items` array produces **no** advisory on either endpoint; a 51-item array produces one citing `QR-016` with `source: official`.
9. `0.009 USD` and `99 KHR` throw citing `QR-009`; `0.01 USD` and `100 KHR` pass.
10. `payway-sdk explain 16 --operation checkout.purchase --json` returns title "Invalid Amount"; `--operation qr.create` returns "Invalid First Name"; bare `explain 16 --json` returns `ambiguous: true` with **2** `alternatives`.
11. `grep -rn NODE_TLS_REJECT_UNAUTHORIZED` over the repository matches **only** allow-listed paths, and a test enforces this.
12. `knowledge/rules/rules.yaml` contains ≥6 rules; every rule with `source: official` has an `evidence/<id>.md` whose URL host is `developer.payway.com.kh` and whose `retrievedAt` is ≤180 days old.
13. `npm run gen:rules -- --check` exits 0 in CI.
14. Deleting any evidence file, ageing it past 180 days, or changing its URL to a non-official host each fail `rules-conformance.test.ts` (three negative tests).
15. `git diff --stat` for the formatting commit contains **no** functional change (reviewed and recorded).
16. No public API, command name, output shape, exit code, or directory changed. `npm pack --dry-run` reports the same file count as before the slice (± the added `knowledge/rules` files).

## 48.7 What must explicitly NOT be implemented in this slice

- **No CLI output envelope** (WP-08) — it touches every command and needs `capabilities` first.
- **No CLI extraction** (WP-13) — it must follow the envelope, not precede it.
- **No `doctor` rebuild** (WP-11) — it depends on the envelope, the env registry, and the guard.
- **No `env-guard`, no `--confirm-production`, no exit codes 4/5/6** (WP-07) — a partial guard is worse than none, because it implies coverage.
- **No QR lifetime unit change** (WP-17) — the probe has not run. Only the *conflict record* lands.
- **No currency-default change** (N-05) — it is breaking and belongs at 2.1 with the interim advisory.
- **No subpath exports, no directory restructure, no `integrations/` rename** (WP-23, WP-28).
- **No documentation restructure or generated reference** (WP-20).
- **No skill changes** (WP-22) — skills must reference stable rule ids first.
- **No repository curation** (WP-01) — it is owner-decision-gated and should not be coupled to a code slice.
- **No `go-live`, no `diagnose`, no `request inspect`** (WP-16, WP-24, WP-14).
- **No new YAML registries beyond `rules.yaml` + `evidence/`** — `errors.yaml`, `env-vars.yaml`, and `guardrails.yaml` come in P1, after the mechanism is proven on six rules.
- **No version bump, no changelog fold, no publication work** (WP-27).

**The discipline this enforces:** the slice produces a repository whose gates are trustworthy and whose values are officially correct, without moving a single public surface. Everything after it is built on verified ground.

---

# Addendum A-1 — Discovered while committing this report (2026-10-05, same session)

**New finding S-19 (P1): the blocking secret-scan gate may fail on the first real CI run, because the owner-authorized sandbox credential is not allowlisted by path.**

- **Evidence.** `.gitleaks.toml` defines five allowlist entries, each `condition = "AND"` over an exact `paths` regex **and** an exact `regexTarget = "secret"` value — the file's own comment states *"BOTH the exact path and exact extracted value must match"*. The five allowlisted paths are `src/__tests__/cli.test.ts`, `src/__tests__/per-call-options.test.ts`, `src/__tests__/agent-privacy-session.test.ts`, the removed Android Kotlin fixture, and `docs/cloudflare-free-webhook.md` (placeholder only). **No entry covers `payway-boilerplate/**`.** The sandbox `secret_key` (a 40-hex value assigned to a field literally named `secret_key`) is present in five tracked files under `payway-boilerplate/Postman Collection API Testing/`.
- **Why it matters.** `ci.yml:24-33` makes the scan blocking (`continue-on-error: true` on the scan step, then `if: steps.gitleaks.outcome == 'failure' → exit 1`), and `quality-gates`, `sqlite-contract`, and `postman-collection` all declare `needs: secret-scan`. If gitleaks' `generic-api-key` rule matches that value, **the entire pipeline fails at the first job** — before typecheck, lint, tests, or anything in WP-03 can be observed. `docs/project/RELEASE-READINESS.md` records that the workflows "have never run on a remote", so this is untested.
- **Correcting a first-pass statement.** Pass-1 finding S2 asserted the residual risk was *"the value being a bare 40-hex string that generic scanners won't flag as a secret"*. That is now doubtful: the value sits next to the keyword `secret_key`, which is the pattern `generic-api-key` keys on. Pass-1 could not execute gitleaks (no binary in the sandbox), so the claim was unevidenced in that direction. Reclassified: **whether gitleaks flags it is `REQUIRES_VERIFICATION`; the allowlist gap is verified fact.**
- **Also verified in passing:** the workflow comment *"full history so gitleaks also scans past commits"* (`ci.yml:22`) expresses an intent that the free `gitleaks-action@v2` tier may not fulfil — it scans the push/PR diff rather than all history unless configured otherwise. Recorded as `REQUIRES_VERIFICATION`, not asserted.
- **Fix (belongs in WP-03, the first implementation slice, as task `DX-BUILD-007`).** Two options, in preference order:
  1. Add a path-and-value-scoped allowlist entry for the authorized sandbox demo credential, following the file's existing pattern exactly, with a `description` naming the owner authorization date (2026-10-01) and the `RELEASE-READINESS.md` item. This keeps the gate meaningful for every *other* credential in those files — which is the point of the AND condition.
  2. Or remove the credential from the collection and have the Postman environment prompt for it. Higher friction for the collection's users; only choose this if the authorization is withdrawn.
  Either way, **run the scan locally before the first push** (`gitleaks detect --source . --verbose`) so the answer is known rather than discovered by a red pipeline.
- **Consequence of this addendum for the report.** §46's P0 order gains one step before item 1: verify the secret-scan gate locally. §48.4's expected-repository-changes table gains `.gitleaks.toml`. §47 gains `DX-BUILD-007` (complexity S, risk Low, acceptance: a local `gitleaks detect` run is recorded with its result, and if it flags the authorized credential, an allowlist entry exists whose `paths` and `regexes` match exactly that file and that value and nothing else).

**Housekeeping applied to this committed copy.** The owner-authorized sandbox `secret_key` is **redacted** in both committed report files (`0508••••…cd29`), even though it is authorized for redistribution in the Postman collection. Reason: duplicating a credential into additional tracked paths widens the exposure surface and would place it at a path no `.gitleaks.toml` allowlist covers — the exact defect this addendum describes. The finding that documents it (pass-1 §24 S2) is unchanged and still names the file and field. The unredacted originals remain outside the repository.

---

## Addendum A-1 — verification result (2026-10-05, same session)

A **path-and-value-scoped allowlist for the single explicitly owner-authorized credential** is implemented. The gitleaks binary itself could not be executed here (release-asset download is blocked by sandbox egress), so the rule was reproduced by applying **gitleaks v8.30.1's actual `generic-api-key` rule definition** — fetched from `api.github.com/repos/gitleaks/gitleaks/contents/config/gitleaks.toml?ref=v8.30.1` — to tracked files: the rule's regex, its `entropy = 3.5` floor, its four rule-level allowlists (path / stopword / regex, with `regexTarget` honoured as `secret` | `match` | `line`), the global allowlist, and this repository's `.gitleaks.toml` entries via `[extend] useDefault = true`. This is a rule-level reproduction, not a run of the gitleaks executable.

**The pass-1 statement was wrong and Addendum A-1's suspicion was right: gitleaks does flag the credential.**

| Scan | Unsuppressed `generic-api-key` findings |
|---|---|
| Default rule only | 315 regex+entropy hits → **9** survive the rule's own allowlists |
| + this repository's five pre-existing `.gitleaks.toml` entries | **7** — all in `payway-boilerplate/**`; the five entries cover only the four test fixtures and one doc placeholder |
| + the ec476910-only path/value entry and the false-positive entry | **3** — the two `sonitatest` occurrences and one `sonitatestinstore` occurrence remain intentionally unsuppressed pending owner confirmation (R7) |

The 7 pre-existing findings, by value:

| Value | Files | Nature |
|---|---|---|
| `0508…cd29` (40-hex, entropy 3.79) | `_build/distribution-scan.js:42`, `postman/collections/…/definition.yaml:118`, `Refrence-copy-…/definition.yaml:102` | The authorized `ec476910` sandbox `secret_key`, flagged **only where `secret_key:` shares the line** — the `dist/*.json` and `postman/environments/*.yaml` copies put the value on a bare `"value":` line with no keyword, so the rule does not reach them. A reformat of either file would newly expose it; the added entry covers all five paths for exactly this reason |
| `9dc49b…ff6a` (36 ch, entropy 3.70) | `_build/smoketest.js:28`, `_build/fix_round1.js:63` | **A second authorized public sandbox demo identity, `sonitatest`, from ABA's own example collections** — explicitly commented as such in both files, and not previously accounted for anywhere in the audit |
| `74633d…e3f8` (36 ch, entropy 3.79) | `_build/smoketest.js:29` | **A third: `sonitatestinstore`**, same origin, same status |
| `cof_continue_b64` (16 ch, entropy exactly 3.50) | `dist/…postman_collection.json:455` | **False positive** — a Postman *variable name* on a `"key":` line, not a credential. It clears the entropy floor by exactly enough to be reported |

Two negative controls confirm the added entries are scoped rather than blanket:
- Substituting an **unauthorized** value into an allowlisted file → **still detected** (the `condition = "AND"` path+value pairing holds).
- Placing an **authorized** value at a non-allowlisted path → **still detected** (path scoping holds).

`scripts/check-secret-allowlists.mjs` was simulated against the new configuration and still yields exactly its expected **6** negative controls, so the change does not regress that script. (Separate observation: `check:secret-allowlists` is defined in `package.json` but **not invoked by any workflow** — a self-test of the allowlist that never runs. Add it to `quality-gates` as part of WP-03.)

### Two further consequences, both correcting earlier statements

1. **The workflow's stated intent is not achieved.** `ci.yml:23` comments *"full history so gitleaks also scans past commits"*, but `gitleaks-action@v2` scans the event's commit range (a PR diff or a push's commits), not `--log-opts=--all`. So the 7 pre-existing findings are **invisible to CI today** and would only surface on a full-tree or full-history scan. The gate is weaker than its own comment claims. A PR from this branch is expected to scan only the changed diff; that expectation is **not verified by running the action**. The allowlist entries are still correct and still needed — with R7 unresolved, a deliberate full-tree scan is expected to report the three occurrences of the two unconfirmed credentials, rather than suppress them.
2. **Addendum A-1's severity is revised from P1 to P2.** The blocking-gate risk is real but latent rather than imminent, because the action does not scan history. The finding that *replaces* it at P1 is the one this verification surfaced: **two additional public sandbox demo identities (`sonitatest`, `sonitatestinstore`) are committed in `payway-boilerplate/_build/` and are not covered by any owner disposition record.** `docs/project/RELEASE-READINESS.md` item B authorizes "the ABA sandbox demo identity" (singular, the `ec476910` one). Whether that authorization extends to the other two is **unrecorded** — a `REPOSITORY QUESTION` (R7) requiring owner confirmation, and the reason the allowlist entry cites the disposition rather than asserting it.

### Added to §45.2 as R7

> **R7 — Does the 2026-10-01 owner disposition covering "the ABA sandbox demo identity" extend to the `sonitatest` and `sonitatestinstore` demo credentials in `payway-boilerplate/…/_build/`?** *Why it matters:* they are committed and described in repository comments as public ABA examples, but the disposition names one identity. *Depends on it:* whether `.gitleaks.toml` may allowlist these two values. *Best current assumption:* do **not** suppress them until confirmed. *Risk if wrong:* the repository continues to publish credentials whose redistribution authorization is undocumented. *Verification:* owner confirmation, recorded by extending `RELEASE-READINESS.md` item B to name all three merchant ids; then add exact path-and-value entries if approved, or remove/replace the values if not.
