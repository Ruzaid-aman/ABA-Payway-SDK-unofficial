# R1 — Agentic payment safety hardening

Read this brief first. Work only in the current isolated worktree. Do not dispatch subagents. Use TDD: add the listed regression tests first, run them to observe failure, then implement the smallest correction. Commit only task files.

## Required fixes

1. `executeAction()` must run a create only for a `confirmed` ledger record. `submitted` and `outcome_unknown` must return a recovery-required error and make zero SDK calls.
2. Provider-controlled `save_artifact` cannot select an output root. Default artifacts stay under `./payway-output`; escaping roots require a separately human-confirmed override that is not representable in an agent plan.
3. Invalid USD/KHR values and invalid callback/return URLs must stop execution before ledger creation. The orchestrator must apply each action's risk result before authorization.
4. Scrub full provider/session/result payloads at every boundary, using resolved PayWay API key, provider API key, profile secrets, and signing material. Add canaries in action fields as well as request/context.
5. Fix the materialized action union and validate the materialized plan immediately before execution.
6. Pass deterministic bounded session context to the provider adapter request.

## Tests to add

- A submitted record causes zero SDK create calls.
- A plan requesting an external artifact root writes nowhere outside `payway-output`.
- KHR fractional amounts and private/invalid URLs cause zero ledger create and zero SDK calls.
- Canary secrets in an action rationale/optional nested field are absent from provider input, session file, command result, and artifact metadata.
- Invalid materialized plan is rejected before executor invocation.
- Provider receives the deterministic bounded context, never raw session history.

## Binding constraints

- No automatic replay of unfinished creates.
- No secret persistence or transmission.
- Existing manual commands must remain unchanged.
- `maxRetries: 0` for agent creates remains intact.

Write a report to `.superpowers/sdd/2026-08-22-agentic-payway-cli-implementation/r1-report.md` with changed files, exact test commands/results, commit SHA, and concerns.
