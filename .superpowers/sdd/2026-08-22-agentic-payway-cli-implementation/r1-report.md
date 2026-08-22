# R1 — Agentic payment safety hardening report

## Commit

- Implementation commit: `5194e1b fix(agent): harden create execution boundaries`

## Changed files

- `src/agent/executor.ts`: creates run only from `confirmed`; all other ledger states, including `submitted` and `outcome_unknown`, are recovery-only and make no SDK call.
- `src/agent/orchestrator.ts`: passes bounded session context to the provider, applies normalization warnings and per-action risk decisions before ledger creation/authorization, validates materialized plans immediately before execution, and scrubs session/result/artifact boundaries using resolved secret values.
- `src/agent/provider.ts`: provider adapter accepts the bounded deterministic session context and sends it as a system message.
- `src/agent/privacy.ts`, `src/agent/sessions.ts`: known secret values are redacted even inside longer strings; persisted session events are scrubbed.
- `src/agent/contracts.ts`, `src/agent/schemas.ts`, `src/agent/tools.ts`, `src/agent/artifacts.ts`: the agent plan cannot represent an artifact root; non-default local roots require an explicit caller confirmation outside the plan; the materialized action union is distributive and correct.
- `src/__tests__/agent-r1-hardening.test.ts`: R1 regressions for replay prevention, path confinement, invalid currency/URL risk stops, secret canaries, materialized validation, and bounded provider context.
- `src/__tests__/agent-artifacts.test.ts`, `src/__tests__/agent-e2e.test.ts`, `src/__tests__/agent-orchestrator.test.ts`, `src/__tests__/agent-tools.test.ts`: explicit artifact-root confirmation/isolation and revised no-replay assertions.

## TDD and verification evidence

- RED: `npx vitest run src/__tests__/agent-r1-hardening.test.ts` — 8/8 failed before implementation, covering every requested R1 behavior.
- RED: after adding the explicit root-confirmation regression, the same command reported 1/9 failing (`requires an explicit confirmed override...`) before the final artifact guard.
- GREEN focused: `npx vitest run src/__tests__/agent-r1-hardening.test.ts src/__tests__/agent-artifacts.test.ts src/__tests__/agent-orchestrator.test.ts src/__tests__/agent-e2e.test.ts` — 52/52 passed.
- Agent suite: `npx vitest run src/__tests__/agent-r1-hardening.test.ts src/__tests__/agent-orchestrator.test.ts src/__tests__/agent-e2e.test.ts src/__tests__/agent-provider.test.ts src/__tests__/agent-artifacts.test.ts src/__tests__/agent-contracts.test.ts src/__tests__/agent-privacy-session.test.ts src/__tests__/agent-tools.test.ts src/__tests__/agent-planning-risk.test.ts src/__tests__/agent-ledger.test.ts src/__tests__/agent-context.test.ts src/__tests__/agent-cli.test.ts src/__tests__/agent-config.test.ts` — 211/211 passed.
- Typecheck: `npm run typecheck` — passed.
- Build: `npm run build` — passed.
- Full suite: `npm test` — 37 files, 590 tests passed.
- Lint: `npm run lint` — exits successfully; four pre-existing warnings remain in `src/__tests__/client-handler.test.ts`, `src/__tests__/server-and-contract.test.ts`, and `src/cli/commands/agent.ts`. No R1 lint warnings remain.
- Diff check: `git diff --check` and cached diff check passed.

## Concerns

- No `PROJECT_STATUS.md` or `SANDBOX-FINDINGS.md` exists in this worktree despite the repository guidance referencing them.
- Existing lint warnings above were deliberately left untouched to preserve the manual CLI and avoid unrelated edits.
