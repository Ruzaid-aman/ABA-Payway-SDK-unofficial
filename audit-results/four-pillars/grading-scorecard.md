# Grading Scorecard — Final

> **Post-remediation note (2026-08-27):** the grade below reflects the audit-date state. Since then
> TD-02 and TD-04 are resolved and the dynamic-test gate is green again, TD-06 shipped,
> TD-07/08/09/10/12 shipped in pass 2, and TD-01's in-repo portion (HEAD removal + gitleaks CI) is done.
> **Pass 3 re-verification (2026-08-27, this file's projection now largely realized):** gates re-run with
> unmasked exit codes — typecheck ✅, lint ✅, **787/787 tests / 49 files ✅**, `npm audit --omit=dev` ✅ 0 vulns;
> canvas/qrcode-reader moved out of runtime deps (A.3); compiled CLI startup measured at P50 413 ms
> (< 500 ms threshold → D.1.1 flips to PASS, see Pillar D §D.1.1b).
> Zero-tolerance trigger #1 remains formally open until the exposed key is **rotated** and **purged
> from git history** (manual steps outside this repo's code; rotation procedure = ABA question Q8).
>
> **Current-state recomputation (pass 3 evidence; still carrying trigger #1 as open):**
> A ≈ 26/30 (dependency isolation 4/5 post-canvas-move), B ≈ 21/25 (jitter + breaker + logger shipped),
> C ≈ 20/30 (credential handling still capped by unrotated key), D ≈ 11/15 (latency 5/6, footprint 2/5 UTP)
> → **≈ 74.5/100**. With trigger #1 fully closed (rotation + purge attested) the credential-handling cap
> lifts toward ≈ 83+ (**B, conditional pass**) — matching the original "path to B" estimate.

## Weighted calculation
| Pillar | Sub-item | Score | Pillar Σ | % | Weight | Contribution |
|---|---|---|---|---|---|---|
| A Fidelity | Schema compliance | 7/10 | **22/30** | 73.3% | 0.30 | 22.00 |
| | State management | 7/10 | | | | |
| | Dependency isolation | 3/5 | | | | |
| | Interface patterns | 5/5 | | | | |
| B Resilience | Error taxonomy | 9/10 | **18/25** | 72.0% | 0.25 | 18.00 |
| | Retry/backoff | 5/8 | | | | |
| | Logging quality | 4/7 | | | | |
| C Security | Credential handling | 2/12 | **16/30** | 53.3% | 0.30 | 16.00 |
| | Input validation | 7/10 | | | | |
| | TLS/network | 7/8 | | | | |
| D Performance | Latency profiles | 4/6 | **9/15** | 60.0% | 0.15 | 9.00 |
| | Resource footprint | 2/5 (UTP-discounted) | | | | |
| | Scalability patterns | 3/4 | | | | |

**Final_Score = 0.30(73.3%) + 0.25(72.0%) + 0.30(53.3%) + 0.15(60.0%) = 65.0 / 100**

## Zero-tolerance trigger register
| Trigger | State | Evidence |
|---|---|---|
| #1 Credential leakage | 🛨 **TRIGGERED** | Committed API key, `test-output/inspect-qr.mjs` (`git show HEAD:` proven) |
| #2 Injection vulnerability | Clear | CWE scan table clean for 78/89/79 |
| #3 Non-idempotent state changes | Clear* | Transport retry design cannot silently duplicate charges (*gateway-side idempotency unverifiable until sandbox access) |
| #4 TLS bypass in production code | Clear | `src/` contains no verification bypasses (boilerplate copies excluded) |
| #5 Callback signature bypass / timing-unsafe compare | Clear | `timingSafeEqual` with length guard (`auth.ts:80-87`) |

## Grade
> ### Final grade: **C — Fail / redesign required**
> Score 65.0 <70 threshold **and** automatic trigger #1 active. Under the rubric either condition
> alone forces Grade C regardless of remediation elsewhere.

## Go/No-Go recommendation
**NO-GO for production deployment** of CoF flows until, at minimum:
1. **TD-01** — key rotation + history purge + secret-scan CI gate attested;
2. **TD-02** — test harness repaired and full suite demonstrably green (dynamic evidence restored);
3. **TD-03** — token-management trio (renew/details/remove) HMAC composition confirmed with ABA;
   otherwise ship those methods capability-flagged off.

## Path to B (next cycle estimate)
With TD-01/02/04 resolved and TD-05–07 delivered, projected recompute: A≈25/30, B≈21/25,
C≈26/30, D≈11/15 → **≈83.5 / 100 (B, conditional pass)** — no architecture rewrite required;
all findings are fixable within the register's timelines. Strengths to preserve: typed error
taxonomy incl. gateway-quirk decoding (403+429), rate-window-aware pacing, timing-safe callback
verification, strict TS domain facade, sanitized debug hooks.

## Deliverable checklist coverage (plan §7)
- [x] RTM w/ corrected formulas (`RTM.md`, 10/10 traced)
- [x] Static analysis report (typecheck/lint/CWE/npm-audit — this folder)
- [~] Dynamic test execution — **harness-blocked**; gates recorded verbatim in `README.md`
- [x] Security assessment (CWE Top-25 subset, trigger register)
- [x] Performance benchmarks (startup P50/P95, loopback percentiles; footprint marked UTP)
- [x] Configuration validation matrix (env validator gaps — Pillar C §C.4)
- [x] Technical Debt Register (12 items, prioritized)
- [x] Final scorecard + weighted calc + go/no-go (this file)
