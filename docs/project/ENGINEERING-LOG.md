# Engineering Log — How `aba-payway-ts` Is Wired Together

**Purpose:** a durable, verified map of the system's architecture and behaviour contracts, so future
changes can be made against facts rather than re-derivation. Complements the audit
(`docs/project/2026-10-02-dx-readability-audit.md`) — that document says *what is wrong*, this one says
*how it works and why*.

**Rule for this file:** every claim was verified by reading source or by executing the command shown.
Anything not verified is marked `(unverified)`. Update it when behaviour changes — a stale log is worse
than none.

---

## 1. Layer cake

```
                    ┌─────────────────────────────────────────────┐
  npm consumers →   │ dist/index.js (ESM) │ index.cjs │ index.d.ts│
                    └─────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                             │                              │
   library path                   CLI path                       agent path
   PayWay (client.ts)            cli.ts + cli/**              agent/** + mcp/**
        │                             │                              │
        └──────────► domains/*.ts ◄───┴──────────► cli/journal-cli.ts
                          │                                       │
                    utils.ts / auth.ts                       journal/**
                    constants.ts / errors.ts                 storage/**
```

**Key insight:** the agent and CLI paths are **consumers of the library**, not parallel implementations.
All three converge on `domains/*.ts`. Business rules live there or in `utils.ts` — never in `cli.ts`
(see log §7 for the policy exceptions where this is currently violated).

---

## 2. The three wiring seams that matter

### 2.1 `PayWay` — the single client

`src/client.ts` (2,043 lines) is one class holding config resolution, retry/backoff, a token-bucket
rate limiter, a circuit breaker, HMAC + RSA signing, multipart assembly, and error classification.

```
domains/*.ts  ──call──►  private request methods (client.ts:1989-2040)
                            │
                            ├─► signMerchantAuth (HMAC-SHA512, hoisted field order)
                            ├─► circuitBreaker.assertAllowed()      ← may throw CircuitOpenError
                            ├─► tokenBucket.throttle()              ← may throw/sleep
                            ├─► fetch with AbortController(timeout) + external signal
                            ├─► classifyResponse() → status.code → PayWayAPIError family
                            └─► retry loop (backoff + jitter, Retry-After aware)
```

**Contract:** `MUTATION_ENDPOINTS` (`constants.ts:46-67`) lists 20 side-effecting endpoints that default
to **single-attempt** transport. This is deliberate — PayWay silently accepts duplicate `tran_id`s, so a
retried mutation is a real financial risk. Override per call with `retry: 'transient'`.

### 2.2 The domain layer

8 domains, 34 methods, each a `createXDomain(config, request, …)` factory returning a plain object typed
by an interface (`src/domains/index.ts`). No classes, no `instanceof` — trivially stubbable.

```ts
// canonical shape
payway.checkout.purchase(params, callOptions?)   // network
payway.khqr.generateOfflineQR(params, config)    // pure/local
```

Every public wire type comes from the **generated** `src/types.ts` (`npm run generate-types` from
`payway-openapi/openapi.yaml`). Hand-written public types therefore live in `src/domain-types.ts` or
alongside their domain — **never** in `types.ts`; the generator overwrites it.

**Verify this before editing:** `src/domain-types.ts:1-8` states the rule explicitly.

### 2.3 The data root

All local stores share **one** root — `PAYWAY_DATA_DIR` or `<APPDATA|~/.config>/aba-payway-sdk/data`:

```
<dataRoot>/journal.jsonl        transaction journal (JSONL, append-only)
<dataRoot>/linked-tokens.json  COF token store
<dataRoot>/webhook_data/       webhook captures (JSON, or SQLite)
<dataRoot>/payway.db           SQLite backend when better-sqlite3 is importable
```

`StorageService` (`storage/storage-service.ts`) is one facade over journal + tokens + webhooks;
`probeStorageBackend()` chooses SQLite vs JSON, and `PAYWAY_FORCE_JSON_STORAGE=1` forces JSON.
`doctor --json` surfaces the resolved path as `.dataRoot`.

---

## 3. The CLI's output contract

This is the most important invariant in the codebase, and the one most easily broken.

### 3.1 Three output modes

| Mode | Trigger | Shape |
|---|---|---|
| human | default, TTY | formatted text + ANSI |
| `json` | `--json` or `--output json` | **exactly one JSON document on stdout** |
| `ndjson` | `--output ndjson` | one JSON object per line (streaming polls) |

### 3.2 The envelope

```jsonc
{ "error": { "kind": "validation|api|network", "exitCode": 1, "type": "PayWayConfigError",
             "message": "...", "paywayCode": "...", "httpStatus": 500,
             "retryable": false, "hint": "..." } }
```

Exit codes: `0` success · `1` validation · `2` API failure · `3` network.

Success envelopes carry `correlationId` / `traceId` — **join keys into the journal**. Use them to
correlate a CLI result with the local record.

### 3.3 How the contract is enforced

`runCli` (`cli.ts:5442`) wraps `program.parseAsync`. Any pre-execution throw becomes the envelope when
machine output is on. `argvRequestsMachineOutput(argv)` (`cli.ts:5426`) inspects **raw argv** — the point
is that Commander throws *before* options are parsed into a command object, so machine mode must be
detectable without a parsed context.

### 3.4 The two rules for adding a command

1. Route **every** failure through `printApiErrorJson` / `printValidationErrorJson` (or the extracted
   `emitErrorEnvelope`). Never `console.log` an error when `--json` may be set.
2. Pass `opts.json` to `assertCredentialsPresent` / `assertRsaKeyPresent` /
   `assertPartnerCredentialsPresent`.

**Both are currently violated in 22 places** — see audit C2. This is the single highest-value thing to fix
when touching CLI code.

### 3.5 TTY gating

`resolvePromptMode()` (`src/cli/ui/mode.ts:39-50`) returns `'none'` under `--json`, `-y`, `--force`, `CI`,
or `PAYWAY_UI=classic`. QR rendering and image auto-open gate on `process.stdout.isTTY` independently.

Invariant to preserve: **output mode must never change the exit code or the piped bytes** beyond
selecting human vs machine. This is asserted in `cli-machine-contract.test.ts`.

---

## 4. Human vs machine side effects — the suppression map

| Effect | Guard | Override |
|---|---|---|
| Wizard / prompts | `resolvePromptMode()` | `PAYWAY_UI=classic` |
| Terminal QR render | `shouldAutoRenderQr()` (TTY) | `--no-show-qr` |
| Auto-open PNG | `process.stdout.isTTY` | `--open-image` / `--no-open-image` |
| `Using profile:` notice | rerouted to stderr under machine mode (`cli.ts:1039`) | — |
| ANSI colour | `src/cli/ui/theme.ts` | `--no-color`, `NO_COLOR`, `FORCE_COLOR` |

**Caveat (verified):** only `ui/theme.ts` honours `--no-color`. Three other palettes
(`agent/ansi.ts`, `commands/skills.ts`, `commands/setup-webhook.ts`) hardcode escapes. If you touch colour,
use `ui/theme.ts`.

---

## 5. The agent system — trust boundaries

### 5.1 Pipeline

```
user request
   └─► provider (proposal)          ← only a bounded, scrubbed session summary is sent
        └─► plan (agent-plan/v1)    ← Ajv-validated, additionalProperties:false at every level
             └─► authorizePlan()    ← risk.ts: --approve / --yolo / typed production phrase
                  └─► executor      ← refuses unless ledger status === 'confirmed'
                       └─► tools    ← create uses maxRetries:0 (never auto-duplicates)
                            └─► ledger (agent-ledger/v1) — non-replayable state machine
```

### 5.2 The ledger states (single-successor, no replay)

```
planned → confirmed → submitted → succeeded
                                      ↘ failed
                                      ↘ outcome_unknown   ← NOT a failure; verify, don't retry
```

`agent ledger recover` is **lookup-only**. It never re-executes.

### 5.3 Compile-time guarantees worth preserving

- `AGENT_TOOL_NAMES ... satisfies readonly AgentToolName[]` (`agent/contracts.ts:40`) — a missing tool
  name is a type error.
- `Record<AgentToolName, Executor>` (`agent/tools.ts:554`) — a missing executor is a type error.
- `additionalProperties: false` on every schema level.

**Not compile-guarded (latent risk):** `READONLY_TOOLS` / `CREATE_TOOLS` / `CREATE_ACTIONS` are
hand-maintained `Set`s duplicated across `planning.ts`, `risk.ts`, `orchestrator.ts`, `executor.ts`.
`risk.ts` fails **closed** on an unknown tool, but `executor.ts` would run it **unrecorded**. If you add a
tool, update all four or add a completeness test.

### 5.4 Money-out is deliberately absent

No `refund`, `payout`, `payment-link void`, `beneficiary`, `cof token remove`, or `close-transaction` tool
exists in either `AgentToolName` or the MCP catalog. **Keep it that way** unless there is a compelling
reason — this single decision removes the largest class of agent risk.

**Known gap:** REPL `:run` (`agent/repl-helpers.ts:69-86`) bypasses all of the above. See audit M12.

### 5.5 Secret handling — 8 layers

1. Provider key only from `PAYWAY_AGENT_API_KEY`; never a flag, never persisted.
2. Schema rejects `authorization|cookie|api-key|x-api-key` as header names.
3. Outbound scrub before provider or disk.
4. **Inbound taint check** — a plan whose fields still contain a resolved secret is `blocked`
   (`UNTRUSTED_ACTION_VALUE`).
5. Result/ledger scrub + 12-field allow-list digest, 200-char cap.
6. Recursive key-name + exact-value redaction (`[REDACTED]`).
7. Journal redaction at write — digest mode allow-lists non-secret fields; `merchant_auth` → `[ENCRYPTED n chars]`.
8. MCP logs to stderr only.

`sanitizeForLog` (`utils.ts:673`) masks 13 exact keys + fuzzy fragments + any ≥40-hex string, and exempts
`token_flag` so public enums survive.

**Gap:** `onRequest`/`onResponse` hooks receive the **raw** body (audit M8).

---

## 6. The knowledge pipeline — the one that actually works well

```
docs/guides/*.md  ──sync-knowledge──►  knowledge/*.md  (+ sha256 in MANIFEST.json)
README/QUICKSTART/llms.txt         ──►  docs-packaged/
                                     ──►  llms.txt (machine index)
```

`npm run sync:knowledge` regenerates all of it. `src/__tests__/knowledge.test.ts` **fails** on:
- source hash ≠ manifest hash (staleness)
- output hand-edited
- internal dossier names present (`SANDBOX-FINDINGS`, `HANDOFF.md`, …)
- a stale packaged doc

**Never hand-edit `knowledge/` or `docs-packaged/`** — edit `docs/guides/` and re-run the sync.
Never hand-edit `llms.txt` either (it is generated).

Known issues: the `GENERATED STUB` header leaks into 14 knowledge topics; the count-pin test asserts
`>= 29` (a floor, not equality) which is why topic counts drifted to 35.

---

## 7. Testing model

| Layer | How | Gate |
|---|---|---|
| Unit | `vi.stubGlobal('fetch', …)`, fake timers | `vitest run` (excludes sandbox contract) |
| In-process CLI | exported `runCli(argv)` — 19 files | why: command bodies visible to v8 coverage |
| Subprocess CLI | 5 files | real exit codes / stdout purity |
| Sandbox contract | `npm run test:sandbox` | excluded from the default run |
| Mutation | Stryker configured | — |

**Hermeticity** (`src/test/vitest-hermetic-env.ts`) deletes every `PAYWAY_*` var and pins `APPDATA` to a
fresh tmpdir per test file. Without it, ambient developer credentials hijack fixture assertions — this
cost 6 false-negative failures once.

**Coverage floors** are global (`vitest.config.ts:23-28`: 79/73/84/80), not per-file. A 5.5k-line file can
regress undetected while the total holds — a real limitation of the current gate.

**Blind spot to be aware of:** machine-contract tests cover 4 of 44 commands, all at the Commander layer.
No test asserts generic stdout purity. That is why audit C2 survived 2,215 passing tests.

---

## 8. Adding things — where code belongs

| You are adding | Put it in | Not in |
|---|---|---|
| A gateway endpoint | `domains/<area>.ts` + a hash-order constant in `client.ts` | `cli.ts` |
| A new HMAC field order | exported const + a drift-guard test | inline at the call site |
| A CLI command | `cli/commands/<name>.ts` exporting `register*(program)` | `cli.ts` |
| Shared CLI logic | `cli/<topic>-helpers.ts` | duplicated inline |
| Colour / TTY behaviour | `cli/ui/theme.ts` | a new palette |
| An agent tool | `agent/contracts.ts` + `tools.ts` + `schemas.ts` + `provider-prompts.ts` | one of the four only |
| Knowledge content | `docs/guides/*.md` then `npm run sync:knowledge` | `knowledge/` |
| A skill | `skills/aba-payway-<name>/SKILL.md` (+ `.zcode` mirror) | — |
| A public type | `src/domain-types.ts` or the domain file | `src/types.ts` (generated) |

---

## 9. Facts that are counterintuitive

Things that surprised the auditor and will surprise you:

1. **`checkout.createTransaction` does not create a transaction.** It builds a local signed payload, zero
   network calls. `checkout.purchase` is the one that calls the gateway. The name is misleading.
2. **Expired ≠ EXPIRED.** There is no expired/closed status anywhere in any read API. An expired
   transaction reads `PENDING` forever. Keep a local `closed` flag.
3. **Missing callback ≠ non-payment.** PayWay delivers callbacks single best-effort with **no retry**.
   Missing callback is not evidence of failure — query instead.
4. **Unpaid QR-only transactions never appear in `transaction-list`.** Unpaid purchase-channel ones do.
5. **`transaction-list --from/--to` are gateway time UTC+7**, not UTC or local. A UTC-derived window
   silently returns 0 rows. Omit both for the full gateway day.
6. **Pushbacks from payment links carry no hash.** `verifyCallback()` does not apply; verify with
   `check-transaction`.
7. **`request-qr` and `self-activation` are spec-derived, not live-verified.** They are CLI-only and
   deliberately excluded from the agent tool surface.
8. **`getGatewayErrorDetails` can never return `null`** for an object input (dead guard, audit).
9. **Two `formatAmount` functions exist** with different semantics (`utils.ts:600` = no currency,
   `cli/flows/confirm-flow.ts:34` = with currency). The CLI one is referenced only by a test.
10. **`npm notice` lines on stderr** are an npx artifact on npm 12, not CLI output. stdout-purity
    guarantees are unaffected; invoke `node dist/cli.js` to avoid them.

---

## 10. Sandbox / release constraints

- **Node ≥ 22.12.0.** Node 22.12 needs `--experimental-sqlite` (wired in `vitest.config.ts`).
- **`prepublishOnly`** = clean → sync:knowledge → build. The corpus must be regenerated before publish.
- **Forbidden in the tarball** (`scripts/check-package-contents.mjs:45-58`): `src/`, `scripts/`,
  `docs/internal/`, `examples/`, `payway-boilerplate/`, `.scratch/`, `.agents/`, `HANDOFF.md`, `*.map`,
  and any private-dossier name. Also no absolute `C:\Users\...` paths, no bare `npx payway-sdk`.
- **`docs/internal/` is maintainer-only and never packaged.** Keep filenames stable — §-numbers in
  `SANDBOX-FINDINGS.md` are cited from source comments.
- The SDK is server-side: **never expose merchant API keys to browser code.** (`client-handler/` is a
  browser module — do not reach for it server-side.)

---

## 11. Where to read next

| Question | File |
|---|---|
| What does the gateway actually do? | `docs/internal/SANDBOX-FINDINGS.md` (§-numbered, append-only) |
| What don't we know? | `docs/internal/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` (Q-numbers) |
| Error codes + evidence | `docs/error-codes.json` (generated), `payway-sdk explain <code>` |
| First payment, end to end | `docs/guides/FIRST-PAYMENT-WALKTHROUGH.md` |
| Payment links | `docs/guides/17-payment-link.md` |
| Webhooks + callback verification | `docs/guides/16-webhook-setup-guide.md` |
| Error handling / debugging | `docs/guides/12-error-handling-and-debugging.md` |
| The journal | `docs/guides/18-transaction-journal.md` |
| Storage service | `docs/guides/21-storage-service.md` |
| Release rules | `docs/RELEASE-READINESS.md`, `scripts/check-package-contents.mjs` |
| This audit | `docs/project/2026-10-02-dx-readability-audit.md` |

---

## 12. Log maintenance

When you change behaviour, update the matching section and note it at the bottom.

### Entries

- **2026-10-02** — Initial log created alongside the DX/readability/AI-friendliness audit. Verified
  against v1.5.0 working tree. Recorded the output contract (§3), agent trust boundaries (§5), knowledge
  pipeline (§6), testing blind spots (§7), and 10 counterintuitive facts (§9). Known-broken at time of
  writing: CJS `exports` map (audit C1), `--json` credential path on 22 commands (C2), 3 failing tests
  from uncommitted working-tree edits (audit §5) — since resolved by `c0354b0` + `sync:knowledge`.
