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
| Lint | `npm run lint` (biome) | ✅ PASS (124 files) |
| Unit/integration tests | `npm test` (vitest 4.1.10) | ❌ **48/48 suites crash at import** — harness-level (`Cannot read properties of undefined (reading 'config')`), reproducible after Vite-cache purge; prior green runs recorded in `audit-results/dimension-*` imply a toolchain regression |
| Dependency audit | `npm audit --omit=dev` | ❌ 1 **high** (fast-uri host confusion), 1 moderate (ajv ReDoS `$data`) |

Rules of engagement followed: no live sandbox transactions were initiated during this audit;
gateway-behaviour claims cite the repo's own sandbox campaigns (`docs/SANDBOX-FINDINGS.md`,
`CHANGELOG.md`) rather than new network traffic.

## Headline findings
1. **CWE-798 (auto-fail):** a sandbox **API key is committed** at `test-output/inspect-qr.mjs`
   (proven via `git show HEAD:`) for merchant `ec476910`. Rotation + history purge required.
2. **Dynamic-test gate broken:** the entire vitest harness fails at import time — no test evidence
   is currently producible from a clean environment.
3. **Token-management trio (R-04/05/06)** ships fully typed and bound, but its HMAC composition
   remains unpublished/unsandboxed-verified (`CHANGELOG` known-open item) → production-blocked gap.
4. Resilience core is solid (typed errors, exponential backoff, rate-limit-window pacing,
   timing-safe callback verification) but lacks jitter, circuit breaker and tiered timeouts.
