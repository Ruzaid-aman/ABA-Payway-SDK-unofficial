# SDD ledger — plan: docs/superpowers/plans/2026-08-22-agentic-payway-cli-implementation.md

## Preflight

| Work items | Shared interfaces/files | Finding |
|---|---|---|
| TASK-001 and TASK-009 | `MaterializedAgentAction`, schemas, executor | Materialized union collapses and execution does not validate the materialized plan. |
| TASK-004 and TASK-010 | `scrubSensitive`, sessions, provider context | Scrubbing is selective and uses an empty secret set; bounded context is not supplied to the provider. |
| TASK-007 and TASK-010 | normalization, risk, authorization | Invalid money/URL checks are warnings rather than execution gates; orchestration does not apply each action's risk decision. |
| TASK-008 and TASK-009 | artifact root and local save tool | Provider controls `root`; content-only saves do not write content. |
| TASK-009 and TASK-005 | execution record status | Executor treats `submitted` as executable, violating no-replay. |
| TASK-010 and TASK-011 | confirmation and REPL session/context | TTY creates are blocked rather than confirmed; `:profile` does not switch; first REPL turn uses shared `repl` session. |
| TASK-003 and TASK-011 | provider configuration and privacy acknowledgement | Custom provider acknowledgement must require `baseUrl`; fixed by inherited commit `f84127c`. |

## Rulings

- Ruling: Treat the review findings as remediation of TASK-001/004/007/008/009/010/011/013 rather than reopen the completed-task status files — the plan/spec are binding and the worktree starts after the original implementation commits. Cost if wrong: task-status reporting may understate the follow-up scope; this ledger and new commits preserve it.
- Ruling: Require a new execution record for every newly approved create; a `submitted` or `outcome_unknown` record can only be recovered through lookup and never passed to the executor. Cost if wrong: a user must deliberately initiate a replacement payment after recovery.
- Ruling: A provider plan may select only artifact filenames inside the default root; root overrides require an independently captured human confirmation and are not model-controlled. Cost if wrong: advanced caller-selected output roots require a future explicit interface.
- Ruling: Reject all IPv6 literal callback, return, and cancel URL hosts; allow public DNS names and public IPv4 literals. Cost if wrong: a legitimate IPv6-literal callback must use a DNS hostname instead.

Task R1: fix round 1/5 (3 addressed, 1 open — IPv6 special-use range coverage; commits d9ede65..37cfc5c)
Task R1: fix round 2/5 (0 addressed, 1 open — incomplete IPv6 special-use denylist; commits 37cfc5c..4884f5b)
Task R1: fix round 3/5 (1 addressed, 0 open; commits 4884f5b..2350704)
Task R1: complete (commits f84127c..2350704, review clean)
Task R2: fix round 1/5 (2 addressed, 1 open — real rejected prompt integration coverage; commits bbfa650..a51ccd7)
Task R2: fix round 2/5 (1 addressed, 0 open; commits a51ccd7..a927124)
Task R2: complete (commits 2350704..a927124, review clean)
Ruling: The resolved PayWay context is the sole environment authority, and any caller-provided mismatch is rejected. Cost if wrong: embedding callers must align their display option with resolved credentials.
Ruling: Production interactive creates require a typed phrase; both stdin and stdout must be TTY. Cost if wrong: scripted console input must use --approve, favoring safety over convenience.
Task R3: fix round 1/5 (1 addressed, 0 open — special-use DNS suffix policy; commits afb405e..5735c3c)
Task R3: complete (commits a927124..5735c3c, review clean)
