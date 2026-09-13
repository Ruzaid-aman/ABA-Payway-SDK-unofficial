# CLI Modernization Phase 2 — MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `payway-sdk mcp` — a stdio MCP server exposing the 14 agent tools in parity + 3 read-only extras, read-only by default.

**Architecture:** `src/mcp/{tool-catalog,extras,server}.ts` map `buildToolSchemas()` + `toolRegistry` onto the official MCP SDK's low-level `Server` (raw JSON Schema `inputSchema` — no zod, no duplication). The CLI command (`src/cli/commands/mcp.ts`) offers `--list-tools` preview and stdio serve. Executors are invoked directly (no orchestrator/ledger — the MCP host agent is the planner and owns confirmation).

**Tech Stack:** `@modelcontextprotocol/sdk@1.30.0` (exact-pinned runtime dep), commander 15, vitest.

**Spec:** `.scratch/cli-modernization/design.md` §5. Phase-1 conventions apply (§3 shared conventions; pins checklist §8).

## Global Constraints

- Branch `modern/mcp-server` **off the Phase 1 branch tip** (`modern/completions-update-check` @ 2dcb6a0) — strictly sequential phases share `src/cli.ts` + the help pins. When Phase 1 merges to main, this branch ff-merges cleanly.
- Agent tool catalog count **stays 14** (`AgentToolName` untouched — no pin churn). MCP catalog = 9 read-only parity + 5 mutation parity (flag-gated) + 3 extras.
- stdout belongs to the MCP protocol. Server startup logs → stderr only. `--list-tools` may print to stdout (it never starts stdio).
- Parity tool params must pass **as-is** to `toolRegistry` executors; schemas come from `buildToolSchemas()` (`src/agent/provider-prompts.ts:342`, shape `{type:'function', function:{name, description, parameters:{type:'object', additionalProperties:false, properties, required}}}`) — `inputSchema = def.function.parameters`.
- Read-only set = `isReadOnlyTool()` from `src/agent/planning.ts` (9 tools). Mutations omitted from `tools/list` unless `--allow-mutations` / `PAYWAY_MCP_ALLOW_MUTATIONS=1`.
- Journal extras **force digest projection**: only allow-listed event fields (ts, kind, correlationId, transactionId, merchantRef, status, httpStatus, paywayCode, durationMs, command, endpoint, attempt) — never `requestDigest`/`responseDigest`/bodies.
- `ExecutionRecordV1` minimal MCP stub: `{version:'agent-ledger/v1', executionId: randomUUID(), sessionId:'mcp', tool, transactionId:null, status:'submitted', createdAt, updatedAt}` (executors only read `execution?.transactionId/executionId`).
- open_artifact will error `open_artifact requires the active session` under MCP (no agent session) — acceptable, surfaced as `isError:true`.
- Verified facts: mock gateway = `startMockPaywayServer()` + `getMockPaywayUrl()` + env `PAYWAY_BASE_URL/ENV/MERCHANT_ID/API_KEY` (cli-mock-commands.test.ts:19,304); journal dir = `PAYWAY_JOURNAL_DIR` env (writer.ts:43); `gatewayDayWindow()` in `src/utils.ts:227`; transaction-list validations = `YYYY-MM-DD HH:mm:ss` format + ≤3-day window + page size 1–1000 (src/cli.ts:1908–1940); `payway.checkout.getTransactionList({fromDate,toDate,fromAmount,toAmount,status,page,pagination})`.
- MCP SDK API (v1.30, verified surface): `Server` from `@modelcontextprotocol/sdk/server/index.js`, `StdioServerTransport` from `.../server/stdio.js`, `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js`, `ListToolsRequestSchema`/`CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`; tool: `{name, description?, inputSchema, annotations?{readOnlyHint,destructiveHint}}`; call result: `{content:[{type:'text',text}], isError?}`. **Verify against installed .d.ts at Task 1 and adapt if signatures differ.**
- Gates per commit: `npx vitest run <new tests>`; final: build → test → typecheck → lint; `npm run sync:knowledge` needed (SDK-AND-CLI-REFERENCE is a corpus source). Check branch before every commit.

---

### Task 0: Branch + dependency

- [ ] `git checkout -b modern/mcp-server` (from modern/completions-update-check).
- [ ] `npm install @modelcontextprotocol/sdk@1.30.0 --save-exact` → package.json dependency; verify `node -e "import('@modelcontextprotocol/sdk/types.js').then(m=>console.log(typeof m.CallToolRequestSchema))"` prints `object`-ish, and skim `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts` for `ToolSchema`/annotations fields. Commit: `chore(mcp): pin @modelcontextprotocol/sdk 1.30.0`.

### Task 1: Tool catalog (`src/mcp/tool-catalog.ts`)

**Interfaces produced:** `interface McpToolDef { name; description; inputSchema: Record<string,unknown>; annotations: { readOnlyHint: boolean; destructiveHint?: boolean }; source: 'agent-parity'|'mcp-extra' }`; `buildMcpToolCatalog(options?: { allowMutations?: boolean }): McpToolDef[]` (extras always included; parity mutations only when flag); `MCP_EXTRAS: readonly ['list_transactions','journal_stats','journal_timeline']`.

- [ ] Failing test `src/__tests__/mcp-tool-catalog.test.ts`: default catalog = 12 names (9 readonly parity + 3 extras), no create tools; `allowMutations:true` = 17; every parity inputSchema deep-equals the matching `buildToolSchemas()` `function.parameters`; extras inputSchemas are `type:'object'` with documented properties (`list_transactions: from?,to?,status?,minAmount?,maxAmount?,page?,pagination?`; `journal_stats: {}`; `journal_timeline: transactionId (required), kind?, last?`); annotations mirror `isReadOnlyTool`.
- [ ] Implement: map `buildToolSchemas()` → strip `.function`, add annotations (`destructiveHint` for none today — create tools get `readOnlyHint:false` only); append extras defs (descriptions copied from spec §5.2, `gateway time UTC+7` caveat in list_transactions description).
- [ ] Commit `feat(mcp): tool catalog — 14 agent-tool parity + 3 read-only extras`.

### Task 2: Extras + server (`src/mcp/extras.ts`, `src/mcp/server.ts`)

**Interfaces produced:** `runMcpExtra(name: 'list_transactions'|'journal_stats'|'journal_timeline', args: Record<string,unknown>, client: PayWay): Promise<ToolExecutionResult-shaped>`; `createPayWayMcpServer(options: { allowMutations?: boolean; profile?: string }): Server` (handlers registered; `server.connect(transport)` left to caller); `runMcpStdio(options): Promise<void>` (connects StdioServerTransport, resolves when transport closes).

Behavior:
- Call flow: `CallToolRequestSchema` handler → name lookup (unknown → `{content:[…json…], isError:true}` code `UNKNOWN_TOOL`) → extras dispatch OR parity: `resolvePayWayContext({profile})` → `createAgentPayWay(ctx, isReadOnlyTool(name)?'read':'create')` → `toolRegistry[name](params as MaterializedAgentAction, client, mcpCtx)` → map result: `ok:true` → `{content:[{type:'text',text:JSON.stringify({tool,data})}]}`; `ok:false` → same + `isError:true`. Unexpected throw → catch → `isError:true` code `INTERNAL`.
- Extras: `journal_timeline` — `readJournalEvents()` filtered by transactionId (+kind), sorted, last-N (default 100), each event projected to the digest allow-list (Global Constraints) + verdict/steps/hints via `explainTransaction` (mirrors `runQueryJournal` timeline branch, tools.ts:396–424); `journal_stats` — `computeJournalStats()` (window, exchanges, latency, topErrors, funnel); `list_transactions` — same local validations as the CLI (format regex, ≤3-day window, page size) then `client.checkout.getTransactionList(...)` with `gatewayDayWindow()` defaults; returns rows + count.
- [ ] Failing tests `src/__tests__/mcp-extras.test.ts`: timeline digest projection (write a full-mode-shaped event file into a `PAYWAY_JOURNAL_DIR` temp dir with body fields → result contains NO `requestDigest`/`responseDigest` keys, has status/transactionId); timeline missing transactionId → VALIDATION; journal_stats on empty dir → ok, zeroed; list_transactions bad date → VALIDATION error with the format hint; window >3 days → VALIDATION.
- [ ] Failing tests `src/__tests__/mcp-server.test.ts` (InMemoryTransport pair): initialize handshake returns serverInfo name `payway-sdk`; `tools/list` = 12 default / 17 with allowMutations; `tools/call query_knowledge {query:'search',pattern:'callback'}` → ok content parses as JSON with hits; `tools/call check_transaction {transactionId:'APPROVED-DX'}` against mock gateway (startMockPaywayServer + env wiring) → ok with `raw`; mutations before flag → call returns isError UNKNOWN_TOOL; unknown tool → isError; `PAYWAY_MCP_ALLOW_MUTATIONS=1` env path honored.
- [ ] Implement extras + server. Commit `feat(mcp): stdio server — parity executors, digest-forced extras, error mapping`.

### Task 3: CLI command + pins

- [ ] `src/cli/commands/mcp.ts` — `registerMcpCommand(program)`: `mcp` with `--allow-mutations`, `--profile <name>`, `--list-tools`, `--json`. `--list-tools` prints catalog (human: name + readonly marker + description; `--json`: one JSON array) and returns; otherwise `runMcpStdio` (never prints to stdout before connect; stderr line `payway-sdk MCP server listening on stdio (tools: N, mutations: on|off)`).
- [ ] Register in cli.ts next to `registerCompletionsCommand(program);`; pins: COMMAND_GROUPS `Agent & skills` += 'mcp'; REGISTERED_COMMANDS += 'mcp'.
- [ ] Test `src/__tests__/mcp-cli.test.ts` (in-process harness style): `mcp --list-tools --json` parses as 12-item array, no mutation names; with `--allow-mutations` 17; human mode prints `mcp tool` rows. Dist smoke `src/__tests__/mcp-stdio-smoke.test.ts`: spawn dist CLI `mcp`, write newline-delimited `initialize` → assert response JSON has `serverInfo.name === 'payway-sdk'`, then `tools/list` → 12 tools, kill child (10s timeout). Commit `feat(mcp): payway-sdk mcp command (--list-tools, --allow-mutations) + registry pins`.

### Task 4: Docs pins + full gates

- [ ] AGENTS.md canonical block: `# MCP server (stdio; read-only by default)` + `npx tsx src/cli.ts mcp --list-tools --json` + one-line client config example. SDK-AND-CLI-REFERENCE.md: new `## MCP server (v1.6.0)` section (surface, safety model, digest note, Claude Code config snippet). HANDOFF.md current-state bullet (Phase 2, tool-count invariant note). CHANGELOG Unreleased subsection. Then `npm run sync:knowledge`.
- [ ] Full gates: `npm run build && npm run test && npm run typecheck && npm run lint`.
- [ ] Commit `docs(mcp): MCP server contract across knowledge surfaces + phase-2 pins`.
- [ ] Update memory `cli-modernization-phase1-state` → phase-2 state.
