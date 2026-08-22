# TASK-007: Deterministic Defaults, Validation, and Risk/Authorization Policy

- **Task ID:** TASK-007
- **Agent:** task(TASK-007)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:** src/agent/planning.ts, src/agent/risk.ts, src/__tests__/agent-planning-risk.test.ts, docs/superpowers/plans/agentic-payway-cli-status/TASK-007.md
- **Tests with results:** src/__tests__/agent-planning-risk.test.ts — 21 passed (vitest run); `npx tsc --noEmit` clean for TASK-007 files (no errors reported in src/agent/planning.ts, src/agent/risk.ts, or the test file; pre-existing unrelated errors in src/agent/artifacts.ts and src/__tests__/agent-artifacts.test.ts belong to other tasks and were not modified).
- **Issues:** none
- **Handoff notes:** Built on TASK-001/002 contracts, schemas, context, and readiness. `normalizePlan` enforces USD (≤2 decimals)/KHR (integer), requires clarification for bare amounts, validates public-HTTPS callback/return URLs, defaults online-QR lifetime to 900, and never substitutes offline KHQR when online QR is unavailable (marks needsClarification instead). `classifyRisk` maps read-only tools to `safe`, create tools to `sandbox`/`production` by context, and `blocked` for unavailable/out-of-scope actions via readiness. `authorizePlan` implements the `--approve`/`--yolo`/non-TTY matrix: `--approve` authorizes both environments, `--yolo` only sandbox, non-TTY without `--approve` requires approval. Exports the exact generic-QR explanation string as `GENERIC_QR_EXPLANATION`. No network calls.
