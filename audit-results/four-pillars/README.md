# Four-Pillars System Integrity Audit — PayWay Credentials-on-File

**Target:** `aba-payway-ts@1.1.1` (SDK + CLI + skills/knowledgebase)
**Repo:** branch `main`, commit `deb6cc8947c2eddaac63235639ae78937dda8ae5`
**Audit date:** 2026-08-27 · **Method:** simulated multi-agent swarm (Recon → Agents A/B/C/D → Synthesis)

## Scope
Requirements R-01…R-10 from the CoF review package (link account/card, token payment,
renew/details/remove, subscription purchase, schedule/unschedule flags, callback handler),
evaluated against the Four Pillars: **A**rchitectural Fidelity, **B** Error Handling &
Resilience, **C** Security Posture, **D** Performance & Operational Scalability.

## Deliverables index
| File | Content |
|---|---|
| `RTM.md` | Requirements Traceability Matrix with **corrected** hash formulas & content types |
| `pillar-a-architectural-fidelity.md` | State mgmt, interface compliance, dependency isolation |
| `pillar-b-error-resilience.md` | Error taxonomy, retry/backoff, timeouts, observability |
| `pillar-c-security-posture.md` | Credential hygiene, CWE scan, TLS, callback verification |
| `pillar-d-performance.md` | Startup/latency measurements, resource & scalability review |
| `grading-scorecard.md` | Weighted rubric calculation, zero-tolerance triggers, final grade |
| `technical-debt-register.md` | Prioritized remediation backlog |
| `evidence/latency-probe.ts` · `evidence/startup-probe.ts` | Re-runnable local probes |

## Executed gates (verbatim outcomes)
| Gate | Command | Result |
|---|---|---|
| Type safety | `npm run typecheck` | ✅ PASS (0 errors) |
| Lint | `npm run lint` (biome) | ✅ PASS (125 files) |
| Unit/integration tests | `npm test` (vitest 4.1.10) | ✅ **PASS — 787/787 tests, 49/49 files** (re-verified in remediation pass 3, 2026-08-27). The originally-reported import crash was not reproducible; the real defect was **host-env leakage**: `PAYWAY_*` user-level env vars on developer machines hijacked doctor/client assertions. Fixed by `src/test/vitest-hermetic-env.ts` scrubbing registered in `vitest.config.ts`. |
| Dependency audit | `npm audit --omit=dev` | ✅ **0 vulnerabilities** (fast-uri HIGH ×2 + ajv moderate resolved via lockfile bump, 2026-08-27) |

## Remediation log (2026-08-27)
- **TD-01 (partial, code-side done):** `test-output/inspect-qr.mjs` removed from HEAD and `test-output/` gitignored; gitleaks secret-scan + quality-gates CI added at `.github/workflows/ci.yml`. **Still required manually:** rotate the exposed sandbox API key for merchant `ec476910` at the ABA portal and purge blob from git history (BFG/filter-repo + force-push coordination).
- **TD-02 (resolved):** dynamic-test gate restored — suite fully green; root cause was non-hermetic test environment, fixed by vitest setup-file scrub of ambient `PAYWAY_*` variables.
- **TD-04 (resolved):** lockfile bumped past fast-uri/ajv advisories; `npm audit --omit=dev --audit-level=high` clean.
- **TD-06 (resolved):** client-side gateway-parity validation shipped — `requestId`/`ctid` enforce `[a-zA-Z0-9]{5,24}` (`validateRequestIdOrCtid`) and `tokenFlag` enforces per-scope enums (`validateTokenFlag`, linking vs charging; `CITR_FIX` rejected for linking per RTM R-09).
- Still open: **TD-03** (ABA-dependent token-trio HMAC), **TD-05** (R-07 subscription-initiation surface, likewise ABA-blocked), TD-08 residual (log-level hot-reload), TD-11 residual (cpu-prof/heap automation), and the **manual TD-01 steps** (portal key rotation + git-history purge). TD-07/08/09/10/12 are resolved per the register.

## Remediation log pass 3 (2026-08-27, detailed re-pass)

- **Working-tree regression fixed:** the pass-2 KHQR edits shipped a syntax error — an orphan
  `}` in `src/webhook/khqr-notification.ts` (after `extractJsonPayload`) plus a missing
  `extractJsonPayload` import in `src/webhook/server.ts`. Both broke typecheck and 2 test
  suites while green-suite claims stayed unverified because piped commands masked real exit
  codes. Fixed; full gate re-run with unmasked exit codes: typecheck ✅, lint ✅,
  **787/787 tests / 49 files ✅**, `npm audit --omit=dev` ✅ 0 vulnerabilities.
- **Pillar A A.3 dependency-surface item resolved:** `canvas`, `qrcode-reader`, `@types/qrcode`
  moved from `dependencies` → `devDependencies` (only an untracked dev scratch script imports
  them; nothing in `src/` does). Consumers no longer install the native canvas toolchain.
  Build (`tsup`) and full suite re-verified green after the move.
- **TD-11 startup question answered with evidence:** compiled `node dist/cli.js --help` measures
  **P50 413 ms / P95 415 ms** — *under* the 500 ms plan threshold. The audit's 2041 ms P50 was
  the `npx tsx` dev path only. Global-install usage pattern documented in
  `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md` §2; `evidence/startup-probe.ts` now accepts an
  arbitrary command for re-runs. Residual: cpu-prof/heap automation suite.
- **TD-06 conformance sweep:** `skills/aba-payway-link-account/SKILL.md` still showed
  `requestId: 'link-123'` (hyphen → now fails fast). Example fixed; all other skills/docs
  examples verified conforming.
- **ABA-OPEN-QUESTIONS.md extended:** +Q8 (sandbox API-key rotation procedure — required to
  finish TD-01), +Q9 (production `tran_id` uniqueness & visibility delay), Q6.3 answer-log
  entry for the KHQR tolerance guidance already encoded in `src/webhook/khqr-notification.ts`.

Rules of engagement followed: no live sandbox transactions were initiated during this audit;
gateway-behaviour claims cite the repo's own sandbox campaigns (`docs/SANDBOX-FINDINGS.md`,
`CHANGELOG.md`) rather than new network traffic.

## Headline findings (audit-date state; current status annotated)

1. **CWE-798 (auto-fail):** a sandbox **API key is committed** at `test-output/inspect-qr.mjs`
   (proven via `git show HEAD:`) for merchant `ec476910`. Rotation + history purge required.
   → *Status: artifact deleted from HEAD + gitleaks CI added; **key rotation and history purge
   still pending manually** (TD-01) — rotation procedure asked as ABA question Q8.*
2. **Dynamic-test gate broken:** the entire vitest harness fails at import time — no test evidence
   is currently producible from a clean environment.
   → *Status: resolved (TD-02 hermetic env); re-verified 787/787 in pass 3.*
3. **Token-management trio (R-04/05/06)** ships fully typed and bound, but its HMAC composition
   remains unpublished/unsandboxed-verified (`CHANGELOG` known-open item) → production-blocked gap.
   → *Status: open — capability-guarded behind `allowUnverifiedTokenOperations`; awaiting ABA (Q1).*
4. Resilience core is solid (typed errors, exponential backoff, rate-limit-window pacing,
   timing-safe callback verification) but lacks jitter, circuit breaker and tiered timeouts.
   → *Status: full-jitter backoff + per-endpoint circuit breaker shipped (TD-07); tiered timeouts
   remain future work by design decision (single-deadline AbortController adequate).*
