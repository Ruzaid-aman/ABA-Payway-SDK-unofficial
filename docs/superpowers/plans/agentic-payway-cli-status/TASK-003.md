# TASK-003 — Atomic storage primitives & versioned agent config

- **Task ID:** TASK-003
- **Agent:** task(TASK-003)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:**
  - `src/agent/storage.ts` (new)
  - `src/agent/config.ts` (new)
  - `src/__tests__/agent-config.test.ts` (new)
  - `docs/superpowers/plans/agentic-payway-cli-status/TASK-003.md` (new)
- **Tests with results:** `npx vitest run src/__tests__/agent-config.test.ts` — 8 passed; `npx tsc --noEmit` — clean.
- **Issues:** none
- **Handoff notes:**
  - Storage mirrors `src/config/profiles.ts`: same `aba-payway-sdk` app-data root, temp-write + `renameSync` + `0o600`. `getAgentDataPaths()` default equals `getProfileStorePath()` default (`process.env.APPDATA ?? homedir()/.config`), then `aba-payway-sdk/agent`.
  - `ProviderConfigV1` is persisted only with non-secret fields; the API key is never written (lives in `PAYWAY_AGENT_API_KEY`). Forbidden headers (`authorization`, `api-key`, `x-api-key`, `cookie`, `proxy-authorization`, case-insensitive) are rejected by both `validateProviderConfig` and an explicit guard in `config.ts`.
  - `readAgentConfig()` returns `null` only on file absence; throws a clear error on malformed JSON, unknown version, or invalid config. `updateAgentConfig()` seeds `{version:'agent-config/v1', provider:'openai', model:'', capabilityMode:'strict-json-plan'}` when absent and default `timeoutMs` to 30000.
  - Tests redirect storage by setting `process.env.APPDATA` to a temp dir; no network and no real user files touched.
