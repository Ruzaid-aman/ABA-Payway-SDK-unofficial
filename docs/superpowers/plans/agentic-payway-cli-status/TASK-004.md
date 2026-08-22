# TASK-004 — Secret scrubber & durable, versioned, atomic sessions

- **Task ID:** TASK-004
- **Agent:** task(TASK-004)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:**
  - `src/agent/privacy.ts` (new)
  - `src/agent/sessions.ts` (new)
  - `src/__tests__/agent-privacy-session.test.ts` (new)
  - `docs/superpowers/plans/agentic-payway-cli-status/TASK-004.md` (new)
- **Tests with results:** `npx vitest run src/__tests__/agent-privacy-session.test.ts` — 18 passed; `npx tsc --noEmit` — clean.
- **Issues:** none
- **Handoff notes:**
  - `scrubSensitive(value, secrets)` recursively redacts by secret KEY NAME (matches apikey, api-key, secret, password, token, authorization, privatekey, pem, merchantid, rsa, bearer, credential, etc., case-insensitive) and by exact secret VALUE (via the `secrets` list and value-keyword heuristics). Returns a brand-new structure; input is never mutated. Redaction is the literal `'[REDACTED]'` (no recoverable hash).
  - `sessions.ts` persists `AgentSessionV1` (locked contract) as plaintext versioned JSON under `getAgentDataPaths().sessionsDir/<sessionId>.json` via `atomicWriteJson`, so a write failure never corrupts an existing file. `appendSessionEvent` warns via `console.warn` (audit) and still returns the in-memory session on write failure. Session files retain all event types (prompt/summary/plan/confirmation/tool_call/tool_result/error/artifact/ledger/cancellation).
  - `exportSession` returns JSON of the session with secret-key-name fields scrubbed (no value secrets available at export time). `buildDeterministicSummary` emits a stable header plus the newest 12 prompt/summary/tool_result/tool_call/plan events, scrubbed and capped at 32 KiB (with graceful event-drop fallback). In-memory approval reset on resume is an orchestrator concern; no approval fields were added to the session.
  - Tests set `process.env.APPDATA` to a temp dir; the atomic-write resilience test mocks `renameSync` to throw and asserts the prior file is byte-identical and a warning is emitted.
