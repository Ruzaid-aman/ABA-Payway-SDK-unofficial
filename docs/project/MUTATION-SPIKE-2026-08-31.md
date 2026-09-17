# Mutation-Testing Spike — 2026-08-31

> P2 item from the Technical Production Review: coverage percentages measure
> *execution*, not *detection*. This spike measures whether the suite actually
> detects injected defects (mutants) in the SDK's two security-critical
> modules. Tool: StrykerJS 10 (`@stryker-mutator/core` +
> `@stryker-mutator/vitest-runner`, Node ≥ 22, dev-only — not wired into CI).
> Command: `npx stryker run` (config in `stryker.config.json`, test scoping in
> `vitest.stryker.config.ts`). Full interactive report:
> `reports/mutation/mutation.html` (regenerate; `reports/` is not committed).

## Results (45–60 s wall clock, 4 workers, 161 mutants)

| File | Mutation score (total) | Killed | Timed out | Survived | No coverage |
|---|---|---|---|---|---|
| `src/auth.ts` | **93.41%** | 84 | 1 | 6 | 0 |
| `src/circuit-breaker.ts` | **88.57%** | 62 | 0 | 7 | 1 |
| **All files** | **91.30%** | 146 | 1 | 13 | 1 |

Baseline before the kill-tests added by this spike: circuit-breaker **81.43%**
(12 survivors) — the kill-tests raised it 7.1 points. Interpretation: the
suite is genuinely effective, not merely executed. The remaining survivors
were triaged individually (below).

## Kill-tests added by this spike

All in `resilience.test.ts` and `verify-callback-detailed.test.ts`:

- exact `CircuitOpenError.retryInMs` computation (`resetTimeoutMs - elapsed`,
  asserted with fake timers at a known elapsed time);
- the reset-window boundary treated as `>=` (state flips to half-open at
  exactly `resetTimeoutMs`);
- *no postponement of `openedAt` while open* — extra failures on an
  already-open circuit must not reset the reset window (circuit-breaker.ts:103
  guard) — plus probe-success clearing probe state;
- fresh-endpoint `stateFor()` returns `closed`;
- null-value canonicalization in the callback verifier (a `null` field
  contributes the empty string, never the text `"null"`).

## Survivor triage — all remaining survivors consciously accepted

1. **`auth.ts` StringLiteral `'utf8'`/`'base64'` → `""` (5)** — Node
   normalizes an empty encoding to UTF-8, so these are *equivalent mutants*;
   the behavioral contract is pinned by the private-key decrypt round-trip in
   `auth.test.ts`.
2. **`auth.ts` L81 `typeof body !== "object"` → `false`** — redundant
   defense-in-depth: `!body` one token earlier rejects the same inputs.
3. **`auth.ts` L96 condition → `false`** — manual verification *does* fail
   our tests against this mutant (null canonicalization is pinned above);
   Stryker perTest analysis still marks it survived. Recorded as a tooling
   artifact, not a coverage gap.
4. **`circuit-breaker.ts` (7)** — error-message string literals, the
   human-rounded `~Ns` retry text, and message-formatting arithmetic whose
   exact rendering is *not* part of the compatibility contract (the typed
   `retryInMs` field is pinned instead).

## Decisions

- Mutation testing stays **out of CI** for now (Node ≥ 22 toolchain vs the
  Node 20 CI shard; would add minutes to PR loops). Recommended cadence: run
  on `auth.ts`, `circuit-breaker.ts`, then widen `mutate` to `utils.ts` and
  `client.ts` (runtime to be measured) before every minor release.
- Floors if/when CI integration is wanted: ≥ 80% overall, ≥ 90% for
  `auth.ts` — both exceeded by the current suite.

## Repro

```bash
npx stryker run            # uses stryker.config.json + vitest.stryker.config.ts
open reports/mutation/mutation.html
```
