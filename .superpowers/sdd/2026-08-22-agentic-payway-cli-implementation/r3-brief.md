# R3 — final security and policy remediation

Address every final-review finding below with TDD, preserving manual CLI behavior and no new dependencies.

1. Authorization environment is authoritative from `ResolvedPayWayContext`; remove caller override or reject mismatches. Tests must prove a production context plus a claimed sandbox `--yolo` cannot create.
2. Interactive authorization requires both `stdin.isTTY` and `stdout.isTTY`. A hybrid console stdout/piped stdin must be treated non-interactive. Production TTY confirmation requires an explicit typed production phrase (not a `y`); `--approve` remains valid. Sandbox ordinary confirmation remains a deliberate yes/no prompt.
3. Replace Windows `cmd /c start` artifact opening with a non-shell executable/argument model that cannot interpret URL/path metacharacters. Add platform-appropriate regression proof.
4. A public callback URL must reject localhost variants, special-use/reserved DNS suffixes (`localhost.`, `*.localhost`, `.local`, `.test`, `.example`), and single-label hosts. Retain public DNS and public IPv4 acceptance; IPv6 literal rule stays rejected. Update tests that incorrectly treat `.test` as public.
5. Ledger error messages must be centrally scrubbed before durable persistence. Pass resolved sensitive values into the executor/ledger boundary or otherwise make that boundary unconditionally redact. Add SDK-error canary tests.
6. Validate every materialized action *before* any ledger confirmation/create authorization. Confirmation proposal must use normalized/materialized-safe plan details, showing defaulted lifetime and explicit transaction ID when provided. Invalid ID/mixed invalid local action must cause zero ledger/API prior to any create.
7. `open_artifact` must require an artifact reference from the active session (or a validated HTTPS URL per the policy) and resist symlink/junction escapes. Prevalidate all local actions before the execution loop so a later invalid local action cannot execute after an earlier create.
8. Non-TTY `ask` must plan/read execute read-only actions without approval; only create plans return structured `needs_confirmation` without execution.

Scope may modify contracts/orchestrator/CLI/REPL/local tools/planning/executor/ledger/tests. Use focused tests and build/typecheck; commit task files. Append detailed report to `r3-report.md`.
