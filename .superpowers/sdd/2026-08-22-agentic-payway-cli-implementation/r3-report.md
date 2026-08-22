# R3 final security and policy remediation report

## Status

- Base: `a927124273a68e609581df71940c9b73e06df5c4`
- R3 commit: `afb405e` (`fix(agent): enforce final security policies`)
- Scope committed: 23 R3 source/test files only
- Dependencies added: none
- Manual CLI commands and existing non-agent SDK behavior preserved

## TDD RED evidence

### Primary R3 security suite

Command:

```text
npx vitest run src/__tests__/agent-r3-hardening.test.ts src/__tests__/agent-r3-cli.test.ts src/__tests__/agent-r3-local-tools.test.ts
```

Pre-fix result:

```text
Test Files  3 failed (3)
Tests       19 failed | 4 passed (23)
```

The failures were concrete behavior failures, not setup errors:

- production context plus caller-claimed sandbox `--yolo` returned `succeeded`;
- invalid explicit transaction ID left one durable ledger record;
- confirmation omitted the normalized 900-second lifetime and exact explicit ID;
- mixed create plus invalid local open reached execution and returned only a later failure;
- six special-use/single-label DNS cases were reported `ready`;
- SDK error text persisted both `R3-API-KEY-CANARY` and `R3-MERCHANT-CANARY`;
- Windows opener used `cmd /c start`;
- special-use HTTPS, untracked artifact, and junction escape references were not properly rejected;
- stdout-only TTY detection had no two-stream boundary;
- production confirmation accepted `y` rather than a typed production phrase;
- non-TTY `ask` did not contact the provider to distinguish read-only from create plans.

### Executor-to-local-tool ownership propagation

Command:

```text
npx vitest run src/__tests__/agent-tools.test.ts -t "open_artifact wired"
```

Pre-fix result:

```text
Test Files  1 failed (1)
Tests       1 failed | 24 skipped (25)
```

The tool received a reconstructed empty session rather than the active session with its artifact event.

### Artifact-root junction defense

Command:

```text
npx vitest run src/__tests__/agent-r3-local-tools.test.ts -t "artifact root that is itself"
```

Pre-fix result:

```text
Test Files  1 failed (1)
Tests       1 failed | 4 skipped (5)
```

Without the root-link check, the opener launched a tracked path through a `payway-output` junction instead of rejecting it.

## Remediation by requirement

1. **Resolved environment is authoritative**
   - Authorization always uses `ResolvedPayWayContext.environment`.
   - A supplied legacy environment claim is accepted only when it matches; mismatches return `blocked` with `AUTH_ENVIRONMENT_MISMATCH` before ledger/API activity.
   - Canary proves production context plus claimed sandbox `--yolo` cannot create.

2. **Two-sided TTY and production phrase**
   - Added one shared terminal policy: interactive only when both `stdin.isTTY === true` and `stdout.isTTY === true`.
   - CLI and REPL both use it for prompting, rendering, and authorization options.
   - Sandbox retains deliberate `y/N` confirmation.
   - Production requires exact `CONFIRM PRODUCTION`; `y` is rejected. `--approve` remains valid.

3. **Non-shell Windows artifact opener**
   - Replaced `cmd /c start` with direct `rundll32.exe` plus `['url.dll,FileProtocolHandler', target]`.
   - `spawn` remains `shell: false`; URL/path metacharacters remain one argument.
   - Windows-specific argv canary covers `&` and `|` in the target without launching a real UI.

4. **Public callback/return URL policy**
   - Centralized URL policy is shared by planning, readiness, and local HTTPS opening.
   - Rejects localhost forms, `*.localhost`, `.local`, `.test`, `.example`, single-label DNS, private/reserved IPv4, and every IPv6 literal.
   - Retains public DNS and public IPv4 acceptance.
   - Prior callback fixtures using `.test` as public were corrected to `.com`.

5. **Ledger error scrubbing**
   - Resolved PayWay credential/KHQR values are collected once and passed through executor to ledger transitions.
   - `markFailed` and `markOutcomeUnknown` centrally scrub errors immediately before durable persistence.
   - Executor also returns scrubbed errors, while orchestrator/session boundaries keep their existing redaction.
   - Real SDK-error canary reads the JSON ledger and proves neither API key nor merchant ID survives.

6. **Materialize and validate before authorization/ledger**
   - Normalization and ID materialization now precede materialized schema validation, local semantic validation, authorization, and all ledger writes.
   - Interactive proposal uses the normalized/materialized plan, displays the default 900-second lifetime, and identifies exact explicit/generated IDs.
   - Invalid explicit IDs produce `INVALID_MATERIALIZED_PLAN` with zero ledger/API activity.

7. **Active-session artifact ownership and all-local prevalidation**
   - Local paths must match an artifact ID/path recorded by the active session.
   - Lexical containment, existence, realpath containment, file type, child symlink/junction escape, and linked-root escape are checked before opening and again at execution.
   - Executor now receives the real active session instead of an empty reconstruction.
   - Successful `save_artifact` results add an artifact event for later ownership checks.
   - All local actions are prevalidated before authorization/ledger/execution, so a later invalid open cannot follow an earlier create.

8. **Non-TTY `ask` plans first**
   - Removed the CLI pre-planning approval short-circuit.
   - A real built-CLI test with a local OpenAI-compatible server proves a non-TTY read plan executes without approval.
   - A second built-CLI test proves a non-TTY create plan contacts only the provider, returns structured `needs_confirmation`, and makes no PayWay call.

## GREEN and verification evidence

Focused R3 suites after remediation:

```text
agent-r3-hardening.test.ts + agent-r3-local-tools.test.ts: 19/19 passed
agent-r3-cli.test.ts: 4/4 passed
artifact-root junction focused test: 1/1 passed
executor active-session focused test: 1/1 passed
```

Agent regression suite:

```text
Test Files  16 passed (16)
Tests       262 passed (262)
```

Final completion gate, run fresh immediately before the commit:

```text
npm run typecheck
  tsc --noEmit
  exit 0

npm run lint
  biome lint src
  exit 0 (four pre-existing warnings; no R3 lint errors)

npm run build
  tsup ESM, CJS, and DTS builds succeeded
  exit 0

npm test
  Test Files  40 passed (40)
  Tests       640 passed (640)

git diff --check
  exit 0
```

## Self-review

- Re-read all eight R3 findings after implementation and mapped each to production code plus at least one concrete regression canary.
- Traced valid and invalid local artifacts end-to-end through orchestrator -> execution context -> tool registry -> local opener; this found and fixed the empty-session reconstruction gap.
- Added defense for both nested junction escapes and a `payway-output` root that is itself linked.
- Verified the production environment decision cannot be downgraded by a caller claim.
- Verified no ledger record is created for invalid/unconfirmed create plans and no create API call occurs before all plan/local validation completes.
- Kept platform opening and clipboard execution `shell: false`; only the artifact opener changed from `cmd /c start` as required.
- Staged explicit task paths only; no brief, progress, review diff, generated artifact, or report file was committed.

## Residual concerns / notes

- The opener regression uses a mocked child process so verification does not launch a real desktop application. It proves the exact executable/argv boundary and metacharacter isolation on Windows.
- `biome lint src` exits successfully but reports four existing warnings: three unused suppression comments in unrelated tests and one optional-chain suggestion on the pre-existing `agent ack` guard. They were not expanded into this security commit.
- The report is intentionally left beside the brief and outside the R3 code/test commit, per the instruction to commit only R3 code/test files.

## Fix round 1: remaining special-use DNS suffixes

### Finding and RED evidence

The centralized public-host predicate denied `.localhost`, `.local`, `.test`, and `.example`, but still accepted the special-use names `router.home.arpa`, `service.invalid`, and `hidden.onion`. Test-only canaries were added first at both call boundaries:

- callback/return URL orchestration asserts `PLAN_RISK_BLOCKED`, zero PayWay create calls, and zero ledger files;
- `open_artifact` asserts rejection before any opener process is spawned.

The focused RED command was:

```text
npx vitest run src/__tests__/agent-r3-hardening.test.ts src/__tests__/agent-r3-local-tools.test.ts

Test Files  2 failed (2)
Tests       8 failed | 20 passed (28)
```

The failures showed all three direct callback readiness checks returning `ready`, both orchestrated create plans returning `succeeded`, and all three artifact URLs resolving instead of rejecting. This proved the tests exercised the missing shared policy rather than a downstream guard.

### Remediation

`src/agent/url-policy.ts` now treats `home.arpa`, `invalid`, and `onion` as special-use suffixes alongside the existing denied names. Matching is label-boundary aware and covers both exact forms and subdomains:

```text
host === suffix || host.endsWith(`.${suffix}`)
```

The same centralized predicate therefore protects readiness, plan normalization/prevalidation, and `open_artifact`. No ledger, PayWay API, or opener-specific workaround was added.

### GREEN and verification evidence

```text
npx vitest run src/__tests__/agent-r3-hardening.test.ts src/__tests__/agent-r3-local-tools.test.ts

Test Files  2 passed (2)
Tests       28 passed (28)

npm run typecheck
  tsc --noEmit
  exit 0

git diff --check
  exit 0 (only Git LF-to-CRLF working-copy notices)
```

The focused test run recreated two local fixture artifacts under `payway-output`; the exact generated directory was verified inside the isolated worktree and removed before staging.

### Commit and self-review

- Commit: `5735c3c423234616e2d72d2d016db5cf1470d816` (`fix(agent): reject remaining special-use hosts`)
- Commit scope: exactly `src/agent/url-policy.ts`, `src/__tests__/agent-r3-hardening.test.ts`, and `src/__tests__/agent-r3-local-tools.test.ts`.
- Reviewed suffix matching for false prefix/substring matches: a host must equal the denied name or end at a dot-separated suffix boundary.
- The exact `home.arpa` form is explicitly rejected; single-label exact names such as `invalid` and `onion` remain rejected both by the existing no-dot rule and the explicit suffix list.
- No open concern remains for this finding. DNS rebinding resolution is outside this named suffix-policy remediation and was not broadened into the fix.
