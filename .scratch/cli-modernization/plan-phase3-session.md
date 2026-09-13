# Phase 3 — Session Mode + REPL Polish — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Checkboxes track progress.

**Goal:** Polish the agent REPL directives and add a command-first `payway-sdk session` shell sharing one dispatch helper. Spec: `.scratch/cli-modernization/design.md` §6.

**Branch:** `modern/session-repl` stacked on `modern/mcp-server` tip (b7bf9b9).

## Global Constraints

- Agent tool count 14, skills 34 — unchanged. Pins: COMMAND_GROUPS ('Agent & skills' += 'session'), REGISTERED_COMMANDS += 'session'; AGENTS.md/REFERENCE/HANDOFF/CHANGELOG + corpus resync in final task.
- REPL tested ONLY via `runRepl(io)` injected-streams seam (HANDOFF anti-checklist) — never startRepl/process.stdin.
- Session history at `<appdata>/aba-payway-sdk/sessions/cli/<id>.json` (`{version:'cli-session/v1', id, startedAt, entries:[{ts, argv, exitCode}]}`), atomicWriteJson, APPDATA ?? ~/.config.
- Session mode is command-first: NO LLM, no privacy gate; `agent`/`ask` stay blocked in dispatch (nesting REPLs is a footgun). TTY-only at the command gate (`resolvePromptMode()==='clack'` → else hint + exit 2); the LOOP is tested via injected streams.
- `:use <tran-id>` sticky: injects `-t <id>` for dispatched commands whose resolved Command declares `-t, --transaction-id` when the user didn't pass `-t`/`--transaction-id`. Command resolution walks program.commands (top-level + nested group children).
- Verified facts: dispatch + exit-trap lives at repl.ts:118-152; `suggestMessage(value, candidates, kind)` (suggest.ts:55); `checkConnectivity(config)` in provider.ts; `-t, --transaction-id <id>` long form standard; `readTopic`/`searchKnowledge` from `../knowledge/store.js`; `buildToolSchemas()` + `isReadOnlyTool()` for `:tools`.

---

### Task 1: Shared dispatch extraction

- [ ] Create `src/agent/repl-dispatch.ts`: export `createDispatcher(program: Command | null): (rest: string) => Promise<void>` — the exact body of repl.ts:118-152 (validateDispatch → run → process.exit trap → restore exitCode). No behavior change.
- [ ] repl.ts imports it; `dispatch` local becomes `const dispatch = createDispatcher(dispatchProgram)` (module-level binding updates on setAgentProgram — keep a wrapper `dispatch(rest)` that reads the current program).
- [ ] New test `src/__tests__/repl-dispatch.test.ts`: dispatches a real offline command (`docs list`-style) against a locally-registered Command; rejects unknown/shell tokens with the exact messages; exit-trap restores process.exitCode (dispatch a command whose action calls process.exit).
- [ ] Commit `refactor(agent): shared :run dispatcher (repl-dispatch) — no behavior change`.

### Task 2: Agent REPL polish directives

- [ ] repl-helpers.ts: extend `ReplLine` + `classifyReplLine` with `:tools`, `:docs <query…>`, `:journal <args…>`, `:status`; extend REPL_HELP.
- [ ] repl.ts handlers: `:tools` (14 tools + read-only/mutation + one-line description); `:docs` (bare → hint; `read <topic>` → readTopic; else searchKnowledge); `:journal …` → dispatch(`journal …`); `:status` (profile + checkConnectivity, silent-fail).
- [ ] Unknown-directive handler gains did-you-mean via suggestMessage against known directives.
- [ ] Tests in `src/__tests__/agent-repl-polish.test.ts` (runRepl seam, PassThrough streams): `:tools` lists check_transaction + count 14; `:docs callback` prints hits; `:journal timeline` dispatches (stub dispatcher or offline journal cmd); `:stats` → did-you-mean `:status`; classification unit cases.
- [ ] Commit `feat(agent): REPL directives :tools :docs :journal :status + did-you-mean`.

### Task 3: Session loop

- [ ] Create `src/cli/session.ts`: `runSessionLoop(io: {input, output, interactive, resume?})` — banner, prompt `payway-session>` (+ profile/sticky suffix), line loop.
  - Directives: `:help :exit :history :clear :profile <name> :use <tran-id>`; unknown → did-you-mean.
  - Bare lines → sticky-aware dispatch: resolve command chain (walk nested), if resolved command options contain short `-t` and argv lacks `-t`/`--transaction-id`, inject `['-t', sticky]` after the command-name tokens.
  - History file: id `cli-<YYYYMMDD-HHMMSS>`; resume = most recent by startedAt; append entry per dispatch {ts, argv, exitCode} (exitCode read AFTER dispatch, before restore); write via atomicWriteJson.
- [ ] Tests `src/__tests__/session-loop.test.ts` (injected streams, temp APPDATA): dispatch offline command through a locally built program; `:use T1` then `check-transaction` injects `-t T1` (assert via a stub command action capturing argv); no injection when user passed `-t`; no injection for command without `-t`; history file round-trip + `--resume` behavior via direct loop option; unknown directive suggestion.
- [ ] Commit `feat(cli): command-first session loop with sticky :use tran-id`.

### Task 4: `session` command + pins

- [ ] `src/cli/commands/session.ts` `registerSessionCommand(program)`: TTY gate (resolvePromptMode()==='clack' else stderr hint + exitCode 2), `--profile <name>`, `--resume`, then runSessionLoop with real streams. Register in cli.ts after registerMcpCommand. Pins: COMMAND_GROUPS + REGISTERED_COMMANDS += 'session'.
- [ ] Tests `src/__tests__/session-command.test.ts`: non-TTY in-process run → hint on stderr, exitCode 2; help pin test passes.
- [ ] Commit `feat(cli): payway-sdk session command + registry pins`.

### Task 5: Docs + gates

- [ ] AGENTS.md (session + REPL directives pointer), SDK-AND-CLI-REFERENCE.md (## Session mode & REPL polish v1.6.0), HANDOFF.md bullet, CHANGELOG subsection; `npm run sync:knowledge`.
- [ ] Full gates: build → test → typecheck → lint. Commit `docs(cli): session mode contract; phase-3 pins`.
- [ ] Memory update: phase-3 state.
