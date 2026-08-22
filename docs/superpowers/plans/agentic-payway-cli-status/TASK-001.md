# TASK-001: Agent Contracts and Strict JSON Schemas

- **Task ID:** TASK-001
- **Agent:** opencode (orchestrator, direct)
- **Status:** Completed
- **Commit:** feat(agent): define strict agent contracts
- **Files changed:** package.json, package-lock.json, src/agent/contracts.ts, src/agent/schemas.ts, src/__tests__/agent-contracts.test.ts, docs/superpowers/plans/agentic-payway-cli-status/TASK-001.md
- **Tests with results:** src/__tests__/agent-contracts.test.ts — 24 passed; full suite 402 passed (378 baseline + 24).
- **Issues:** none
- **Handoff notes:** Foundation for all downstream tasks. Exports `validateAgentPlan` and `validateMaterializedPlan` plus versioned contract types. Ajv promoted to a direct dependency.
