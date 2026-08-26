# Technical Debt Register

Priorities: **P0** = blocks production gate · P1 < 30 days · P2 quarter · P3 hygiene.
Impact/Effort scale S–XL. Evidence references point into the pillar reports / RTM.

| ID | Pri | Item | Impact | Effort | Timeline | Ref |
|---|---|---|---|---|---|---|
| TD-01 | P0 | Rotate exposed sandbox API key (`ec476910`), purge `test-output/inspect-qr.mjs` from git history (BFG/filter-repo), delete from HEAD, add gitleaks/trufflehog pre-commit + CI secret scan | Critical (CWE-798 auto-fail) | S | 1 day | Pillar C §C.1 |
| TD-02 | P0 | Repair broken test harness: vitest 4.1.10 crashes all 48 suites at import (`reading 'config'`). Bisect runner/toolchain, consider pinning vitest 3.x LTS line; restore green CI evidence trail | Critical (no dynamic verification possible) | M | 2–3 days | README gates |
| TD-03 | P0 | Resolve R-04/05/06 token-trio HMAC composition with ABA (unblock renew/details/remove); until then guard-export the trio behind a "sandbox-verified?" capability flag so merchants can't ship blind | High — core CoF lifecycle | M (external dep) | with ABA | RTM rows |
| TD-04 | P1 | `npm audit fix` fast-uri HIGH ×2 + ajv moderate; make `npm audit --audit-level=high` a CI blocking gate; evaluate moving `canvas` out of runtime deps | High supply-chain | S | 1 day | Pillar A §A.3 |
| TD-05 | P1 | Add subscription-initiation surface (R-07): extend `CreateTransactionParams` (or new CoF checkout builder) with `ctid`, `token_flag`, `frequency`, `return_deeplink` parity per developer.payway docs | High — feature gap vs plan scope | M | 3 days | RTM R-07 |
| TD-06 | P1 | Client-side enum validation for `tokenFlag` per-endpoint (linking vs charging sets) + `requestId`/`ctid` charset/length parity (`[a-zA-Z0-9]{5,24}`) to fail-fast instead of server roundtrip | Medium | S | 1 day | Pillar A A.1.1/A.2.5 |
| TD-07 | P2 | Resilience pack: full-jitter backoff option, transport circuit breaker (open→half-open), tiered timeouts (connect/read/global) | Medium | M | 1 sprint | Pillar B §B.2 |
| TD-08 | P2 | Structured logging module: levels DEBUG/INFO/WARN/ERROR, line-level JSON schema, `trace_id` propagation from response envelope incl. nested `status.trace`; hot-reload level via env watcher | Medium | M | 1 sprint | Pillar B §B.3 |
| TD-09 | P2 | Webhook hardening mode: optional `rejectInvalidSignature` returning 401 (timing-safe path already exists); document capture-vs-verdict separation for merchants | Medium | S | 2 days | Pillar C §C.3 |
| TD-10 | P2 | Published token cache/expiry model or `expiresAt` helper + renewal scheduler example for the 90-day cycle (merchant-side today) | Medium | M | 1 sprint | Pillar A A.1.4 |
| TD-11 | P3 | Startup-latency program: ship/benchmark compiled `dist/cli.js` bin (measured tsx-JIT path = 2041 ms P50); add Node `--cpu-prof` memory/footprint suite automation for D.1.x matrix | Low-medium | S/M | 1 sprint | Pillar D |
| TD-12 | P3 | Upstream note to ABA boilerplate samples carrying `rejectUnauthorized:false`; extend `sanitizeForLog` with value-pattern fallback (key-like strings) alongside key blocklist; unknown-env-var rejection in validator | Low | S | 2 days | Pillar C |

Cross-links: remediation of TD-01 + TD-02 are preconditions for re-running the plan's Phase-2
dynamic suites (89-test inventory) to lift the current "harness-blocked" evidence state;
TD-03 gates the A-grade criterion "100% API compliance".
