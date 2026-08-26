# Pillar D — Performance & Operational Scalability (15%)

## Executed measurements (this audit)
### D.1.1 CLI startup — `evidence/startup-probe.ts`
```json
{ "runs": 5, "command": "npx tsx src/cli.ts --help",
  "p50ms": 2041, "p95ms": 2489, "minMs": 1863, "maxMs": 2489, "thresholdMs": 500 }
```
**Verdict vs plan threshold (<500 ms): ❌ MISS — with measurement caveat.** The measured path is
`npx` resolution + `tsx` JIT transpilation of the whole command graph on a cold cache; it is not
the shipped artifact cost. The published bin (`package.json` → `dist/cli.js`, tsup bundle) skips
transpilation entirely. Re-run against the built artifact before treating this as product debt
(probe included in TD-11). Even so, perceived startup will remain seconds-scale on Windows due to
npx indirection — worth documenting a global-install usage pattern.

### D.1.1b Re-measurement vs the shipped artifact (remediation pass 3, 2026-08-27) — ✅ PASS

`npx tsx audit-results/four-pillars/evidence/startup-probe.ts node dist/cli.js --help`
(probe now accepts an arbitrary command):

```json
{ "runs": 5, "command": "node dist/cli.js --help",
  "p50ms": 413, "p95ms": 415, "minMs": 401, "maxMs": 415, "thresholdMs": 500 }
```

The **product artifact meets the <500 ms plan threshold** (P50 413 ms / P95 415 ms on Windows).
The original 2041 ms figure is therefore dev-tooling cost only (`npx` + `tsx` JIT), not product
debt. Global-install usage pattern (`npm i -g .` → `payway-sdk`) documented in
`docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md` §2. Residual for TD-11: cpu-prof/heap automation suite.

### Latency profile — `evidence/latency-probe.ts` (loopback proxy, 30 samples)
```json
{ "runs": 30, "firstError": null,
  "p50ms": 2, "p95ms": 5, "p99ms": 27, "minMs": 1, "maxMs": 27, "meanMs": 3 }
```
Measures **SDK-internal overhead only** (HMAC generation → payload build → fetch to loopback mock
→ JSON parse → status-code gate): worst case **27 ms**, i.e. <1% of any plausible WAN round-trip.
SDK-side serialization is therefore not a latency risk; plan's P50/P95/P99 targets for gateway
calls are dominated by ABA infrastructure and remain unverifiable without sanctioned load tests
against sandbox (out of engagement scope here — see prior live campaigns for single-call baselines,
`docs/SANDBOX-FINDINGS.md` §10: check-transaction ≪1 s vs transaction-detail lag ~5 s).

## D.1 Resource Footprint — NOT EXECUTED (blocked by TD-02 harness breakage)
The vitest crash disabled the intended instrumented-suite route; node-level probes
(`--cpu-prof`, heap snapshots under 100 concurrent calls) were deferred as out-of-time budget.
Design-stage observations: single shared HTTP stack via global fetch; per-request
AbortController (no socket-leak surface); token-bucket state maps bounded by endpoint count;
mock/poll generators terminate cleanly. Formal numbers must come from TD-11 automation.

## D.2/D.3 Operational patterns reviewed statically
| Area | Finding |
|---|---|
| Blocking I/O | None found on SDK paths — all I/O async (`fetch`, async generator poller); sync work limited to crypto digests and string ops |
| Concurrency safety | Rate-limit token buckets are instance-local (`Map`), fine per process; no cross-process coordination documented (single-writer assumption) |
| Connection pooling | Delegated to undici defaults; no keep-alive tuning knobs exposed — acceptable, matches plan's P4 “document-only” tier |
| Bulk operations | No batch API exists upstream (ABA gap); local throttling (`rateLimitRules` incl. transaction-detail 10/min) prevents accidental stampedes |
| Timeout config | Single-tier deadline default 30 s via env/config; poller adds its own wall-clock budget (default 10 min) — plan's 4-tier yaml not implemented (Pillar B cross-ref) |

**Sub-scores:** Latency profiles 4/6 · Resource footprint 2/5 (UTP discount) · Scalability patterns 3/4 → **9/15**
