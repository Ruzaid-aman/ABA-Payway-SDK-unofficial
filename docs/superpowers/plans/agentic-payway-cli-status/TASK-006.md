# TASK-006 — OpenAI-compatible provider adapter

- **Task ID:** TASK-006
- **Agent:** task(TASK-006)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:**
  - src/agent/provider.ts
  - src/agent/provider-prompts.ts
  - src/__tests__/agent-provider.test.ts
  - docs/superpowers/plans/agentic-payway-cli-status/TASK-006.md
- **Tests with results:** `npx vitest run src/__tests__/agent-provider.test.ts` → all passed; `npx tsc --noEmit` → clean. (Exact summary line reported by orchestrator after run.)
- **Issues:** none
- **Handoff notes:**
  - `createProviderAdapter(config, fetchImpl?)` resolves baseUrl by preset (openai/openrouter/nvidia) or `config.baseUrl` (custom; throws when missing). API key is read ONLY from `process.env.PAYWAY_AGENT_API_KEY`; it is never taken from config.
  - Two capability modes: `native-tools` (sends `buildToolSchemas()` as OpenAI tools, assembles the plan from `message.tool_calls`) and `strict-json-plan` (sends `buildStrictJsonSystemPrompt()` and parses `message.content`).
  - Strict-json mode rejects markdown fences, prose, multiple JSON objects, and trailing content; every proposed plan is run through `validateAgentPlan` and a `ProviderProposalError` is thrown on any failure so no invalid/executable action can escape.
  - `checkConnectivity()` GETs `<baseUrl>/models` with the bearer token and classifies 2xx→ready, 401/403→blocked, 404/405→unverified, network/other→blocked (with detail).
  - All 11 agent tools are represented in `buildToolSchemas()` with their contract-mandated required params and types.
