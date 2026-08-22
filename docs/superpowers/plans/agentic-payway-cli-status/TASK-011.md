# TASK-011 — Agentic PayWay CLI: public surface + REPL

- **Task ID:** TASK-011
- **Agent:** task(TASK-011)
- **Status:** Completed
- **Commit:** (owned by orchestrator)
- **Files changed:**
  - `src/cli/commands/agent.ts` (created) — `registerAgentCommands(program)` registers the `ask` top-level command and the `agent` tree: `agent` (REPL when run without a subcommand), `agent setup`, `agent doctor`, `agent sessions list|export|clear`.
  - `src/agent/repl.ts` (created) — `startRepl({ profile?, sessionId? })` REPL with directives `:help :profile :history :clear :session :run :exit`. The `:run` directive re-dispatches only recognized PayWay top-level command names via the live Commander `program` (wired through `setAgentProgram`). It rejects shells, executables, file paths, URI schemes, and agent-management subcommands (`agent`/`ask`); a temporary `process.exit` guard keeps an unexpected subcommand exit from terminating the REPL.
  - `src/cli.ts` (modified, minimal) — added `import { registerAgentCommands } from './cli/commands/agent.js';` and one call `registerAgentCommands(program);` before `program.parseAsync()`.
  - `src/__tests__/agent-cli.test.ts` (created) — 7 subprocess tests against `dist/cli.js`.
  - `docs/superpowers/plans/agentic-payway-cli-status/TASK-011.md` (created) — this status file.
- **Tests with results:** `npx vitest run src/__tests__/agent-cli.test.ts` → **7 passed**. `npx vitest run src/__tests__/cli.test.ts src/__tests__/profiles.test.ts` → **24 passed** (manual CLI unchanged). `npx tsc --noEmit` → **clean**.
- **Issues:** none.
- **Handoff notes:**
  - `ask` makes zero network calls before authorization: no config ⇒ `blocked` JSON; non-TTY without `--approve`/`--yolo` ⇒ `needs_confirmation` JSON (no provider contact). The orchestrator is only reached in TTY or when an approval flag is supplied.
  - API keys are never accepted or written; `agent setup` persists only non-secret provider settings and reads `PAYWAY_AGENT_API_KEY` from the environment.
  - The REPL reuses the single Commander `program` as the source of truth for the manual CLI, so `:run` stays in lockstep with `payway-sdk` itself.
  - `agent` defines a parent `.action()` (REPL) alongside subcommands; Commander routes `agent` (no subcommand) to the REPL and `agent <sub>` to the subcommand.
