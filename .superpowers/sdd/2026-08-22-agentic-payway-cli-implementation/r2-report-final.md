# R2 report — interactive CLI and REPL completion

## Scope

Implemented the remaining TASK-010/TASK-011 interactive behaviors only:

- TTY create-plan confirmation at the CLI/REPL boundary through a narrow `confirmCreatePlan` orchestrator callback.
- Complete human proposal rendering (context, route, money, transaction-ID strategy, lifetime where applicable, URLs, artifacts, assumptions, and plan context).
- Cancellation persistence and safe continuation after a declined or unavailable confirmation response.
- `:profile [name]`, including reporting the actually resolved default profile and rebuilding the provider/orchestrator path after a profile change.
- Fresh UUID first-turn REPL sessions through `runOneShot`, with subsequent turns using the returned session ID.
- Removal of the nonexistent `agent poll` recommendation.

No manual CLI command or profile-precedence behavior was changed, no dependency was added, and the REPL does not mutate `process.env`.

## Design decisions

1. `OrchestratorOptions.confirmCreatePlan` is the only confirmation seam. The orchestrator builds a scrubbed `CreatePlanConfirmation` value; terminal I/O remains in `ask`/REPL boundary code.
2. Only an unflagged TTY create plan reaches this callback. `--approve` remains direct explicit authorization. `--yolo` remains sandbox-only and cannot invoke the callback in production.
3. A negative response, EOF, or prompt exception is a cancellation: it writes both `confirmation` and `cancellation` session events, makes no PayWay call, and returns `needs_confirmation` so the same session can be used again.
4. Profile switching resolves a new `ResolvedPayWayContext` without changing environment variables. Each free-form turn constructs a provider and orchestrator using that current context.

## TDD evidence

Focused RED was observed before production code for the confirmation seam:

```text
npx vitest run src/__tests__/agent-orchestrator.test.ts
14 tests, 2 failed
- expected succeeded, received blocked (accepted confirmation callback not implemented)
- expected needs_confirmation, received blocked (declined callback not implemented)
```

The next RED batch was built-CLI evidence:

```text
npm run build; npx vitest run src/__tests__/agent-cli.test.ts src/__tests__/agent-orchestrator.test.ts
25 tests, 2 failed
- :profile production was an unknown directive
- success message still advertised `agent poll`
```

The resolved-default profile behavior was then isolated and observed RED:

```text
npm run build; npx vitest run src/__tests__/agent-cli.test.ts -t "resolved default profile"
1 failed: expected active profile sandbox, received profile (none)
```

Each case passed after its smallest implementation change.

## Verification

Final focused verification:

```text
npm run build
npx vitest run src/__tests__/agent-cli.test.ts src/__tests__/agent-orchestrator.test.ts src/__tests__/agent-r1-hardening.test.ts
53 passed (3 files)
npx tsc --noEmit
passed
npm run lint
exit 0; 4 pre-existing warnings (three unused suppression comments and an existing optional-chain suggestion)
git diff --check
passed
```

The CLI tests run the rebuilt `dist/cli.js` subprocess and cover profile switching/default reporting, fresh first-turn session generation, and fresh profile context. The orchestrator tests cover accepted/rejected confirmation, cancellation/session reuse, production `--yolo` refusal, and the corrected polling message.

## Self-review

- Confirmation proposal uses the already scrubbed persisted plan, preventing values scrubbed for sessions/output from reappearing in the TTY proposal.
- Non-create/read-only plans remain authorization-free and never prompt.
- Production `--yolo` stays unauthorized and cannot become authorized through the TTY callback.
- No credential values are printed by the new built-CLI profile tests.
- The built output is ignored; no generated `dist` files are part of the commit.

## Review correction round 1

The initial subprocess REPL tests intentionally used piped stdin, so they were non-TTY and did not prove the actual confirmation prompt boundary. This correction adds a deterministic injected-readline test of the real CLI prompt helpers:

- It asserts the rendered proposal includes context, route, money, transaction-ID strategy, lifetime, URLs, artifacts, assumptions, and the `(y/N)` question.
- It passes `y`, `n`, and an EOF-like `undefined` response through the actual `promptConfirm` answer parser, proving `y` accepts and the other two responses decline.
- An orchestrator integration test wires that real EOF prompt callback and proves zero PayWay QR calls.

Focused RED before the boundary implementation:

```text
npx vitest run src/__tests__/agent-cli.test.ts src/__tests__/agent-orchestrator.test.ts
30 tests, 2 failed
- createInteractivePlanConfirmation is not a function
- warning exposed raw-confirmation-secret
```

The E2E mismatches were not unrelated failures: current R1/R2 behavior intentionally blocks the malicious action before executor/API/ledger work. The corrected tests assert `blocked`, `UNTRUSTED_ACTION_VALUE`, no result actions or execution IDs, zero fake SDK calls, and an absent/empty ledger. The first correction run confirmed the exact pre-ledger code (`UNTRUSTED_ACTION_VALUE`, not `PLAN_RISK_BLOCKED`), then the revised assertions passed.

Final correction-round verification:

```text
npx vitest run src/__tests__/agent-cli.test.ts src/__tests__/agent-orchestrator.test.ts src/__tests__/agent-e2e.test.ts
49 passed (3 files)
npx tsc --noEmit
passed
npm run lint
exit 0; 4 pre-existing warnings only
git diff --check
passed
```

The confirmation-callback exception warning is now intentionally generic and cannot include an exception message or secret-derived text.

The final pre-commit run additionally included `src/__tests__/agent-r1-hardening.test.ts`: **74 tests passed across 4 files**.

## Review correction round 2

Added the missing real-boundary rejection integration test. It constructs the exact `createInteractivePlanConfirmation` callback used by the CLI, injects a deterministic readline that answers `n`, and supplies that callback to `AgentOrchestrator.runOneShot` for a TTY online-QR plan. The assertions prove all required effects:

- result status is `needs_confirmation`;
- a `cancellation` event is persisted in the actual returned session;
- the fake PayWay `generateQr` counter remains zero.

This is intentionally distinct from the prompt-helper rejection check and the real-boundary EOF integration check. The pre-existing implementation already fulfilled this behavior, so the new executable regression test passed on its first run and did not require a production change.

```text
npx vitest run src/__tests__/agent-orchestrator.test.ts
18 passed (1 file)
npx tsc --noEmit
passed
```

## Commit

Final amendment: `fix(agent): complete interactive CLI and REPL safety`.
