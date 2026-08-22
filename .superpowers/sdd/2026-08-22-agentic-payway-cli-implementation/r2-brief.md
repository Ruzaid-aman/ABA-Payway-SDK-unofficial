# R2 — interactive CLI and REPL completion

This remediation completes the remaining TASK-010/TASK-011 behavioral requirements.

1. In a TTY, a create plan must show a complete human-readable proposal and ask for a fresh explicit confirmation before execution. A rejected/absent response creates no PayWay call, records cancellation, and leaves the session usable. `--approve` remains an explicit authorization; production must never be authorized by `--yolo`.
2. Implement the confirmation at the CLI/REPL boundary with a narrow callback/interface into the orchestrator. Do not prompt from core domain modules or for non-create/read-only plans. The proposal must include route, money, transaction-ID strategy, lifetime when relevant, context, URLs, artifacts, and assumptions.
3. `:profile [name]` must show the active profile with no argument, and switch to the named profile with an argument. After switching, resolve a fresh PayWay context and construct a fresh provider/orchestrator path so credentials/display labels genuinely refresh without mutating `process.env`. Update REPL help.
4. A first free-form REPL message without `--session` must create a unique session via `runOneShot`, not use the literal `repl` ID. Subsequent turns use that returned session ID.
5. Change the successful QR polling message to reference the supported `poll_transaction` action only; do not advertise nonexistent `agent poll`.
6. Add focused CLI/REPL/orchestrator tests (including the built CLI subprocess where appropriate) for TTY confirmation accepted/rejected, production yolo rejection, profile switch freshness, first-turn unique session, and no fake poll command.

Boundaries: preserve existing manual CLI commands and profile precedence; no secrets in output; no new dependencies; use TDD and commit only task files. Write a detailed implementation/test report to `r2-report.md` beside this file.
