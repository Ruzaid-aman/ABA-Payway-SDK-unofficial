# TASK-009: Typed PayWay Tool Registry and Executor

- **Task ID:** TASK-009
- **Agent:** task(TASK-009)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:** src/agent/tools.ts, src/agent/executor.ts, src/__tests__/agent-tools.test.ts, docs/superpowers/plans/agentic-payway-cli-status/TASK-009.md
- **Tests with results:** src/__tests__/agent-tools.test.ts — 25 passed (npx vitest run); npx tsc --noEmit clean (exit 0).
- **Issues:** none.
- **Handoff notes:** tools.ts exposes a closed typed `toolRegistry: Record<AgentToolName, (action, client, ctx) => Promise<ToolExecutionResult>>`. executor.ts exposes `executeAction`, `ExecutionContext`, `ToolExecutionResult`. Create actions (generate_online_qr, generate_offline_khqr, create_checkout_payload, create_checkout_purchase, create_payment_link) require ledger status confirmed/submitted, advance to submitted, run the SDK call exactly once, then mark succeeded/failed/outcome_unknown. Provider errors are sanitized (message/paywayCode only); never throw raw credentials.
