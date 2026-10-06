# Arena DX-Platform Audit — Implementation Coverage Report

**Date:** 2026-10-06 · **Audit base:** `316a568` · **Current main:** `dad62d9` (47 implementation commits since base)
**Dossier:** `docs/project/2026-10-05-dx-platform-audit-pass1.md` (superseded) + `-pass2.md` (authoritative, §41 = WP-01..WP-28 plan)
**Verification:** typecheck ✅ · typecheck:dist via CI ✅ · remote CI **green on `58f47b6`** (third consecutive green run in repo history) · full suite 2,777 tests: 2,744 passed / 25 skipped (gated) / 8 failed — **all 8 in one known load-flaky file** (`webhook-wp7-bounds.test.ts`, 5s timeout under full-suite parallel load; passes 8/8 in isolation in 4.6s; a second full run had 4 flaky files, the isolation re-run is clean) · 38/38 tests across the three newest suites pass locally.

---

## 1. Headline

Of the audit's **28 work packages**: **9 done or functionally done** (WP-02..WP-07, WP-10, plus the shipped cores of WP-08/WP-09/WP-12/WP-19), **1 in progress** (WP-11 stage 1, unpushed), **18 open** (of which 4 are owner-gated and 2 are deliberate/probe-gated deferrals the audit itself agrees with).
Of the **23 pass-2 findings**: all **5 P0s closed or dispositioned**, **7 of 13 P1s closed**, **6 of 18 N-findings closed**.

The audit's central thesis — *authoritative knowledge stored in the wrong place rots into confident wrongness* — is now mechanically enforced: three authored registries (`rules.yaml`, `env-vars.yaml`, error registry) each carry provenance, retrieval dates, and a conformance gate that fails CI on drift; golden vectors pin all hash compositions; doctor stage 1 re-uses the same gates so doctor can never disagree with CI.

## 2. P0 findings (pass-2 §3) — 5/5 dispositioned

| Finding | Status | Evidence |
|---|---|---|
| P0-01 public tree contradicts release decision | **OPEN — owner-gated** (WP-01) | audit-results/, .scratch/, HANDOFF.md, docs/internal/ still tracked; needs the owner's public-tree decision |
| P0-02 purchase `payment_option` enum rejects documented value | **DONE** | DX-RULE-001: official 6 values incl. `abapay_khqr` accepted, legacy 2 advisory-only (`warnNonEscalating` → now PUR-003 advisory), unknown throws PUR-003 before signing |
| P0-03 QR lifetime seconds-vs-minutes | **OPEN — deliberate** (WP-17, probe-gated) | conflict recorded as rule QR-001 in `rules.yaml`; live probe falsified the minutes-reading (3 rejected / 180 accepted); two-domain split kept per 2026-10-03 conflicts session |
| P0-04 agent instructions teach TLS bypass | **DONE** | DX-SEC-001/002: `tlsCaFile`/`PAYWAY_TLS_CA_FILE`/`tlsMinVersion` via undici dispatcher; bypass purged from all tracked docs; blocking grep gate `src/cli/tls-bypass-scan.ts` (12-entry allow-list); sandbox now serves a valid GlobalSign EV chain — the bypass was a relic |
| P0-05 CI cannot pass as written | **DONE + proven** | DX-BUILD-001..005 (tsconfig.typecheck.json, Build→Typecheck→Typecheck:dist→Lint order, pinned gitleaks + allowlist self-test, gen:rules --check, platform-gated tunnel test) + 6 architect root-cause fixes; **CI green on 46caafb and 58f47b6 — first greens in repo history** |

## 3. P1 findings — 7 of 13 closed

| Finding | Status | Evidence |
|---|---|---|
| P1-01 no production safety gate | **DONE** (WP-07, merged `46caafb`) | `src/core/env-guard.ts`: URL-authoritative `resolveEnvironment` (production URL beats any sandbox label — fail-safe), §12.2 matrix (PW-GUARD-001 money+prod needs `--confirm-production`, -002 sandbox-only no override, -003 unverified needs both flags), 17 guard call sites, `PayWayGuardError` → exit 6, `instanceof`-based dist-safe classification. Senior review found 3 dist-only defects (esbuild class-rename broke exit-6; label-over-URL precedence; wrong hint) — all fixed `d7732a6`, live-verified against `dist/cli.js` |
| P1-02 six machine-output contracts | **DONE stage 1** (WP-08) | `src/cli/output/contract.ts`: one envelope `schemaVersion 2.0`, `runCommand`, exit codes 4/5/6 reserved, global `--output` applied at ARGV level (Commander parent-opts footgun avoided); remaining command migration rides WP-13 |
| P1-03 cli.ts monolith | **OPEN** (WP-13) | ~5k lines; deliberately deferred (both audit passes agree it is real but not first) |
| P1-04 env-var registry false warnings | **DONE** (WP-10) | `knowledge/rules/env-vars.yaml` (40+ authored vars incl. `PAYWAY_ADVISORY_IGNORE`, `PAYWAY_TLS_CA_FILE`) → generated `src/generated/env-registry.ts` + gen-env-vars --check conformance gate (24 tests) |
| P1-05 no root `.env.example` | **DONE** | generated from the registry (104 PAYWAY_ references), un-ignored, regen script header |
| P1-06 doctor: no severity model | **IN PROGRESS** (WP-11 stage 1, `dad62d9` — **unpushed**) | engine + types + 5 offline checks (see §6); network/live tiers, the 38-check §17.3 catalog, CLI wiring, `--check/--severity-min/--fix` flags remain |
| P1-07 no `go-live check` | **OPEN** (WP-16; depends WP-11+WP-07 — WP-07 now satisfied) | |
| P1-08 no request inspect/dry-run | **OPEN** (WP-14) | |
| P1-09 formatter configured, never applied/gated | **DONE** | 214-file reformat commit + `.git-blame-ignore-revs` + `format:check` (biome) CI-wired |
| P1-10 repo/package/support/CI identity mismatch | **OPEN** (WP-27 release engineering) | |
| P1-11 webhook tooling split, no machine stream | **OPEN** (WP-15) | |
| P1-12 QR command surface conflates four capabilities | **OPEN** (WP-17) | |
| P1-13 rule provenance is prose | **DONE in part** (WP-02) | `knowledge/rules/rules.yaml` (6 corrected rules incl. QR-001 lifetime CONFLICT record) + per-rule `evidence/*.md` fetched live from developer.payway.com.kh with retrieval dates + EVIDENCE_RETENTION_DAYS freshness window + gen:rules byte-stability gate (14-test conformance); expanding the matrix to all rules continues with WP-18/WP-25 |

## 4. N-findings (pass-2 §4) — 6 of 18 closed

| Finding | Status | Evidence |
|---|---|---|
| N-01 error registry stale vs official table | **DONE** | `src/error-registry.ts` (CLI-free, barrel `explain()`); 10 QR codes corrected from the live-fetched official table; `qr:403` = Duplicated Transaction ID (N-03 comment attached) |
| N-02 bare `explain <numeric>` wrong family | **DONE** (DX-ERR-003a) | `--operation/--family` selectors, `ambiguous: true` + deterministic `alternatives`, 9 colliding codes (not 6); bare lookups only gain information (no answer changed) |
| N-03 dup-tran_id three inconsistent sources | **PARTIAL** | documented at the qr:403 registry entry; telemetry arbitration (sandbox vs official-table conflict) still open |
| N-04 lifetime-expiry fund semantics absent | **OPEN** | |
| N-05 `currency: 'USD'` default vs profile-derived | **OPEN — owner-gated** (breaking; 2.x decision) | |
| N-06 items cap 10 vs official 50 | **DONE** (QR-016) | `checkout.ts:358` — 50, official citation |
| N-07 purchase content type multipart vs json | **OPEN** (WP-25 probe) | |
| N-08 no runtime validation of gateway responses | **OPEN** (WP-18/WP-25) | |
| N-09 hosted-checkout plugin URL hard-coded to production | **OPEN** | |
| N-10 pre-auth payment-method restriction | **DONE** (PUR-022, HARD) | |
| N-11 `generateHmac` stringifies objects | **DONE + bounty** | throws `PayWayConfigError` on object/array hash fields (`src/auth.ts`); hardening exposed a REAL bug — generate-qr `return_params` hashed as `'[object Object]'` — fixed via `encodeBase64IfNeeded`; golden vectors 33→32 |
| N-12 31/47 orphan scripts | **OPEN** (WP-28) | |
| N-13 simulator fabricates URLs on real hostname | **OPEN** (WP-23) | |
| N-14 normative guidance inside generated file | **OPEN** (WP-20) | |
| N-15 only destructive format script | **DONE** | `format:check` non-destructive, CI-wired |
| N-16 QR name-length self-contradiction unrecorded | **PARTIAL** | the conflict-record pattern exists (QR-001); name-length specifically not yet re-verified against official docs |
| N-17 four required generate-qr fields optional-with-defaults | **OPEN** | |
| N-18 third-party mirror used as authority | **RESOLVED procedurally** | all corrected rules re-evidenced from developer.payway.com.kh with retrieval dates + freshness gate; mirror no longer cited |

## 5. Gate status at `dad62d9` (local, unpushed)

| Gate | Result |
|---|---|
| `npm run typecheck` (incl. test files) | ✅ 0 errors |
| Full suite `npm test` | 2,777 tests: 2,744 ✅ / 25 skipped (gated) / 8 ❌ — **all 8 = `webhook-wp7-bounds.test.ts` 5s timeouts under parallel load; 8/8 green in isolation** (known load-flaky pattern; unrelated to the new code) |
| Remote CI @ `58f47b6` | ✅ **success** (all 9 jobs; third consecutive green after 46caafb, e856dfe) |
| New suites (doctor-engine 14, env-guard 14, advisories 10) | ✅ 38/38 |

Full-suite logs: `.scratch/dx-audit-coverage-2026-10-06/suite-run-2.log`.

## 6. Code review of the newest wave (this session's review)

**WP-11 stage 1 — doctor engine (`src/diagnostics/doctor/`, +804 ln, unpushed). Verdict: sound, ship after push.**
- Clean contract: `CheckDefinition` carries its own severity; runner converts a throwing check into a FAIL (never swallows); fails-first ordering; every check appears in the report; exit = GATE_BLOCKER(5) iff any FAIL. Exactly the §17 shape, stage-scoped honestly.
- The 5 checks deliberately re-use the CI gates' own machinery (`findBypassOccurrences`, generated env-registry, `MONEY_MOVING_PATHS`) — doctor cannot disagree with the gate that blocks the regression. Good invariant.
- Tests in three layers: runner contract, a positive gate on the real repo (suite goes red if the repo regresses), and per-check synthetic negatives (no tracked file is edited). Plus a purity self-test (no fetch/network imports, exactly one sanctioned `git ls-files -z` spawn, no process.exit, hermetic tmpdir).
- Findings (none blocking): (1) these are **repository self-audit** checks — when the engine is wired into the user-facing `doctor` command (WP-11 stage 2+), they must stay dev/CI-facing or no-op outside a repo checkout: an npm consumer has no `src/` and `resolveRepoRoot()` would walk to the *consumer's* package.json+src. (2) `GUARD_COVERAGE` reads the hard-coded `src/cli.ts` — will need to follow WP-13's extraction. (3) `statusForOffenders` is exported but unused — dead export until a consumer lands. (4) The commit is **not pushed** — remote main is at `58f47b6`.

**WP-07 env-guard (`src/core/env-guard.ts`). Verdict: sound.** The three senior-review defects (dist-only, invisible to vitest) are properly fixed: `instanceof PayWayGuardError`, URL-authoritative resolution, named remedy in the refusal hint. Known accepted warts: no-op `--confirm-production` flag on the 3 sandbox-only commands (PW-GUARD-002 has no exceptions) and a pointless template-literal constant at line 97. `MONEY_MOVING_PATHS`↔`capabilities.ts` parity is enforced both by a test and now by doctor's GUARD-COVERAGE check.

**WP-19 advisories (`src/core/advisories.ts`). Verdict: sound.** `AdvisoryRecord {ruleId,message,severity,source}`, dedupe per rule id (moved from per-message), `PAYWAY_ADVISORY_IGNORE` suppression (registered in the env registry — conformance fix `723eaf2`), `collectAdvisories()` for the future envelope `warnings[]` adoption (deliberately deferred — cli.ts was forbidden this wave), `strictEscalable` default **true** preserves today's strictValidation behavior; `warnNonEscalating` retired in favor of PUR-003 with `strictEscalable: false`. Every `warnAdvisory` call site in `src/domains` is rule-id-tagged — and doctor stage 1 now polices that forever.

## 7. What remains (priority order)

**Ready to run (dependencies satisfied):**
1. **Push `dad62d9`** (WP-11 stage 1) — it is tested, typechecked, and CI-green on its parent.
2. **WP-11 stage 2**: wire the engine into the `doctor`/`doctor --json` command (envelope `warnings[]` adoption rides here), add the network tier + the §17.3 catalog; the audit's exit contract is already pinned (0/1/3/5).
3. **WP-13 CLI extraction** — unblocks WP-14/WP-15/WP-23 and retires the biggest structural risk; WP-08 stage-1 contract is its foundation.
4. **WP-25 probes harness** (N-07 content-type, N-03 dup-tran_id arbitration, WP-17 lifetime unit) — needs sandbox access.

**Owner-gated (not assignable to agents):**
- WP-01 public-tree curation (+ R7 gitleaks allowlist question: sonitatest/sonitatestinstore authorization)
- WP-22 skills 35→11 (user pushed back — treat as curation discussion)
- N-05 currency default (breaking → tie to the 2.0.0 version decision; version still 1.5.0)

**Deliberate deferrals (audit §48.7 agrees):** WP-16 go-live (after WP-11), WP-18 lifecycle model, WP-20 docs IA, WP-24 diagnose, WP-26 sweeps, WP-27 release engineering, WP-28 repo restructure.

---

*Method: every DONE claim above was re-verified against the working tree at `dad62d9` (file exists / behavior greps / tests executed), not taken from commit messages. CI status from the GitHub Actions API for `ABA-Payway-SDK-unofficial` `main`.*
