# CLI Modernization + TUI — Wave Design (v1.6.0)

- **Date:** 2026-09-13
- **Status:** Approved design (second pass, superpowers brainstorming). Implementation plan follows in `plan.md`.
- **Baseline:** main @ 68e959a, suite ~1877 green, package `aba-payway-ts` v1.5.0, bin `payway-sdk`.

## 1. Context

Second-pass roadmap after code validation. First-pass ideas that were dropped or shrunk by
what already exists:

- Agent REPL **exists** (`src/agent/repl.ts`, `runRepl`/`startRepl`, `:run` CLI re-dispatch,
  profile switching, session resume) → this wave *polishes* it, no rewrite.
- Poll-until-terminal **exists** (`poll-transaction`, `createPollDisplay`) → no watch dashboard (YAGNI).
- Config layering **exists** (profiles.json store + `.env` chain, documented precedence,
  HANDOFF.md:71) → no `.paywayrc` (YAGNI).

Confirmed gaps (all verified absent in `src/`): MCP server, shell completions, update
checker, wizard flows beyond generate-qr/checkout, TTY table rendering, general session mode.

## 2. Goals / Non-goals

**Goals**
1. MCP stdio server so MCP hosts (Claude Code, Codex, OpenCode, any client) can drive the SDK.
2. Shell completions derived mechanically from the live Commander `program` (zero drift).
3. Non-intrusive update notifier.
4. General command-first `session` mode + agent-REPL directive polish (shared dispatch).
5. TUI parity for high-frequency commands (wizard flows) + TTY-gated tables.

**Non-goals (explicit)**
- `.paywayrc` config file, live dashboard, MCP resources/prompts (tools only),
  `void_payment_link` agent tool (separate wave — triggers the 9 tool-count pins),
  any new packaged skills, telemetry, plugin marketplace.

## 3. Shared conventions (every phase)

- **Mode contract (unchanged, `src/cli/ui/mode.ts:33`):** switching prompt mode never changes
  exit codes, `--json`/NDJSON stdout purity, or byte-for-byte piped output. Every new TTY
  feature must be a no-op when `resolvePromptMode()` is not `clack`.
- **Error envelope:** any new command failure mode joins the uniform
  `{error:{kind,exitCode,…}}` contract where it is a machine-mode command.
- **Gates per phase:** build → vitest → tsc → biome lint, all green before the gated commit.
- **House test patterns:** in-process `runCli(argv)` + `captureConsole()`; injected streams;
  `PaymentIO` fakes; mock gateway (`src/test/index.ts`); `stripAnsi` assertions; hermetic env
  scrub; REPL tested via the `runRepl(io)` seam, never `startRepl` (HANDOFF.md anti-checklist).
- **Phases are strictly sequential** — every phase registers commands into `src/cli.ts`
  (5198 lines, mixed-ownership hot file); no parallel branches.

## 4. Phase 1 — Completions + update checker

### 4.1 `payway-sdk completions <bash|zsh|fish|powershell>`

- New `src/cli/commands/completions.ts` (registration pattern of `registerX(program)` modules)
  + `src/cli/completions/{bash,zsh,fish,powershell}.ts` generators.
- **Derivation:** walk the live `program` recursively at request time — commands, nested
  subcommands (2 levels), options (long + short + description, local + inherited globals).
  Precedent: `collectKnownFlags()` (src/cli.ts:5151), `registeredCommandNames()`
  (src/cli.ts:5165). Nothing hand-maintained; new commands appear automatically.
- Script goes to **stdout**; 3–5 line install hint goes to **stderr** (never pollutes
  `| source` / redirect flows).
- Emit function-based scripts: bash `complete -F`, zsh `compdef` (+ descriptions), fish
  `complete -c payway-sdk` (+ descriptions), PowerShell `Register-ArgumentCompleter` for
  `payway-sdk`. Descriptions/args shell-escaped per dialect (quotes, spaces, `$`).
- Tests: generated script contains every live top-level command name (drift pin against the
  `program`, same spirit as `REGISTERED_COMMANDS` in cli-help.test.ts); a known flag (e.g.
  `--json`) present for a sampled command; dialect markers per shell; PowerShell escaping
  case with embedded quotes.

### 4.2 Update checker

- New `src/cli/update-check.ts`. Cache `<config-dir>/update-check.json`
  (`{lastCheck, latestVersion}`, config dir = `%APPDATA%|~/.config/aba-payway-sdk/`,
  precedent `src/agent/storage.ts:22`). TTL 24h; `registry.npmjs.org/aba-payway-ts/latest`;
  `AbortController` 1500 ms; **any failure is silent**.
- Semver compare is a ~15-line local numeric-part comparator (no dependency; no prereleases).
- **Trigger contract:** fires ONLY on (a) bare `payway-sdk` invocation (banner path,
  src/cli.ts:5174) and (b) top-level `--help`. Never on real commands → zero interference
  with command output/purity. Notice prints to **stderr**, TTY only, suppressed under
  `--json`/NDJSON and when `PAYWAY_NO_UPDATE_CHECK=1`.
- Tests: TTL gating, stale→fetch with mocked fetch, suppression matrix (json/TTY/env), notice
  never on stdout.

## 5. Phase 2 — MCP server (`payway-sdk mcp`)

### 5.1 Shape

- New module `src/mcp/` mirroring `src/agent/` structure: `server.ts`, `tool-catalog.ts`.
- New top-level command `mcp` registered from `src/cli/commands/mcp.ts`.
- **Dependency:** `@modelcontextprotocol/sdk` (runtime, exact-pinned). Use the SDK's
  **low-level `Server` + `StdioServerTransport`** — its low-level API accepts **raw JSON
  Schema** for `tools/list`, so `buildToolSchemas()` output plugs in verbatim (no zod
  conversion, no schema duplication). Feature surface limited to `initialize`,
  `tools/list`, `tools/call` (no resources, prompts, or sampling) — required protocol
  notifications (`notifications/initialized`, cancellation) still flow per spec via the SDK.
  stderr is the server's log channel; **stdout belongs to the protocol**.

### 5.2 Tool catalog

- Parity layer: the **14 agent tools** (`AgentToolName`, src/agent/contracts.ts:18) — schemas
  from `buildToolSchemas()` (provider-prompts.ts:342), executors from the closed registry
  `src/agent/tools.ts`, risk classes from `src/agent/risk.ts`, context via
  `resolvePayWayContext({profile})`. **Agent catalog count stays 14 — no tool-count pins
  change anywhere.**
- MCP-only extras (outside `AgentToolName`, Ajv-validated locally):
  `list_transactions` (transaction-list window), `journal_stats`, `journal_timeline`.
  All `READONLY`.
- **Journal extras force digest mode** (the digest allow-list already excludes
  hash/pwt/PII); full mode only via explicit `PAYWAY_MCP_JOURNAL_FULL=1`.

### 5.3 Safety model

- **Read-only by default:** without `--allow-mutations` / `PAYWAY_MCP_ALLOW_MUTATIONS=1`,
  mutation-class tools are **omitted from `tools/list` entirely** (not merely rejected).
- With the flag, mutation tools appear with MCP annotations mirroring `risk.ts`
  (`readOnlyHint: false`, `destructiveHint` where applicable). Confirmation is the host
  client's responsibility (its user gate); the server refuses only what it never exposed.
- No extra confirmation prompts inside tools (a server can't prompt); no outbound network
  beyond the PayWay gateway calls the tools themselves make.

### 5.4 Ergonomics + errors

- `payway-sdk mcp --list-tools [--json]` prints the effective catalog (names, risk,
  annotations) without starting stdio — human preview + testable surface.
- `PayWayAPIError`/business errors → `tools/call` result with `isError: true` + structured
  message (JSON-RPC success envelope); transport/protocol errors → JSON-RPC error codes.
- Help text documents the sandbox TLS caveat (`NODE_TLS_REJECT_UNAUTHORIZED='0'` scoped).

### 5.5 Tests

SDK `InMemoryTransport` client/server pair: handshake; `tools/list` snapshot (names +
annotations, default vs `--allow-mutations`); `tools/call` for an offline tool
(`query_knowledge`) and a gateway tool against the mock gateway (`check_transaction`);
mutation omission default / presence with flag; journal digest enforcement; error mapping.

## 6. Phase 3 — Session mode + REPL polish

### 6.1 Shared dispatch extraction (enabler)

- Extract the `:run` program re-dispatch (`src/agent/repl.ts:118–152`, incl. the
  `process.exit` trap) into an exported helper next to the REPL
  (`src/agent/repl-dispatch.ts`, injectable `program` — pattern of `setAgentProgram`).
  Both the agent REPL and session mode call it. No behavior change to the agent REPL.

### 6.2 Agent REPL polish (`payway-sdk agent`)

New directives (repl-helpers.ts):
- `:tools` — catalog + risk class (from `buildToolSchemas()` + `risk.ts`).
- `:docs <query>` — direct `query_knowledge` executor (offline, no LLM turn).
- `:journal <args…>` — dispatches the `journal` subcommand through the shared dispatch.
- `:status` — active profile + provider connectivity (`checkConnectivity()`).
- Grouped `:help` (reuse `renderGroupedHelp`), did-you-mean for unknown directives/commands
  (reuse `src/cli/ui/suggest.ts`).

### 6.3 General session mode (`payway-sdk session`)

- Command-first shell: **bare text = CLI dispatch** through the shared helper (no `:run`
  prefix). No LLM provider, no privacy gate, no plan confirmation.
- TTY-only (`resolvePromptMode()`); non-TTY prints a hint and exits 2.
- Directives: `:help`, `:exit`, `:history`, `:profile <name>`, `:clear`, and `:use <tran-id>`
  — **sticky transaction**: subsequent bare commands that declare a short `-t` (tran_id)
  option (found by introspecting the command's options) get that flag injected when omitted.
- History persisted at `<config-dir>/sessions/cli/<id>.json`
  (`{id, startedAt, entries:[{ts, argv, exitCode}]}`); `session --resume` reopens the most
  recent; prompt shows profile + sticky tran id.
- Tests: `runRepl`-style injected-stream loop, dispatch argv assembly, `:use` injection for a
  command with `-t` and refusal/no-op for one without, history file round-trip, TTY-less exit.

## 7. Phase 4 — TUI flows + tables

### 7.1 Wizard flows (pure, probe-only-undefined-flags — `src/cli/flows/` pattern)

For commands that are flag-only today; flags provided on argv stay authoritative, the wizard
only fills gaps, everything gated by `resolvePromptMode()`:

- `payment-link create` — title/amount/currency/return-url/expiry + **payout editor**
  (`{acc, amt}` rows, add/remove, local sum-equals-amount validation).
- `refund` — tran id, amount, confirm.
- `cof link-account` / `cof charge` — request-id auto-gen, ctid, token-flag select;
  charge: token source (`--token` vs `--ctid`), amount, confirm.
- `pre-auth complete` / `pre-auth cancel` — amount (complete) + confirm.

### 7.2 TTY table renderer

- `src/cli/ui/tables.ts` — zero-dependency box-drawing renderer, terminal-width aware
  (`stdout.columns`, fallback 80), ellipsis for overflow. Applied **only** under `clack` mode
  to: `transaction-list`, `profiles list`, `skills list`. Piped/classic output stays
  byte-identical (existing snapshots must not move).
- Tests: `PaymentIO`/stream fakes + `stripAnsi`; byte-identical piped snapshots for each
  touched command.

## 8. Sequencing, governance, release

| Phase | Branch | New top-level commands | cli.ts touch |
|---|---|---|---|
| 1 | `modern/completions-update-check` | `completions` | registration only |
| 2 | `modern/mcp-server` | `mcp` | registration only |
| 3 | `modern/session-repl` | `session` | registration + dispatch refactor |
| 4 | `modern/tui-flows-tables` | — | command bodies (flows/tables) |

- One branch at a time off `main`; gated phase commits; HANDOFF.md updated at each merge.
- Release: v1.6.0 at wave completion (CHANGELOG per phase).
- **Pin checklist per phase:** agent tool count **14 unchanged**; packaged skills **34
  unchanged**; `COMMAND_GROUPS` (help.ts:16) + `REGISTERED_COMMANDS` pin (cli-help.test.ts)
  gain `completions`, `mcp`, `session` in phases 1–3; AGENTS.md command list,
  SDK-AND-CLI-REFERENCE, and docs/README.md index updated per phase; `npm run sync:knowledge`
  only if knowledge corpus inputs change (none planned).

## 9. Risks / mitigations

- **cli.ts contention** → strict phase sequencing (§8).
- **MCP SDK API surface** → low-level `Server` API is stable; exact-pin the dependency;
  verify signature surface at first build of Phase 2.
- **Windows stdio MCP quirks** → this dev machine is win32; test the real
  `StdioServerTransport` there, not only in-memory.
- **PowerShell escaping edge cases** → dedicated escaping tests with quotes/`$`.
- **PII via journal extras** → digest-forced default (§5.2).
- **Piped-output regressions** → byte-identical snapshot tests are part of every phase's DoD.

## 10. Success criteria

1. An MCP client configured with `{"command":"payway-sdk","args":["mcp"]}` lists 14 parity
   tools (+3 extras) and can execute a read tool end-to-end against the sandbox.
2. `payway-sdk completions zsh` output, sourced, completes every top-level command and flag.
3. Update notice appears exactly on bare/help invocations and nowhere else.
4. `session` runs journal/docs reads offline; `:use <tran-id>` demonstrably injects `-t`.
5. All four phases merged with gates green; piped outputs byte-identical; suite green
   (~1877 baseline + new tests).
