# ABA PayWay SDK + CLI — Developer Experience, Readability & AI-Friendliness Audit

**Date:** 2026-10-02
**Scope:** `aba-payway-ts` v1.5.0 — `src/` library surface, `src/cli.ts` + `src/cli/**`, agent/MCP/knowledge
surfaces, skills, and release gates.
**Method:** full source read + targeted runtime reproduction of every critical finding. Critical claims were
re-verified independently by the auditor (A/B experiments), not taken on subagent assertion.
**Verdict:** ship-blocking defects are narrow and mechanical. The library core is genuinely high quality; the
weaknesses concentrate in the CLI presentation layer and in documentation drift.

---

## 1. Scorecard

| # | Dimension | Weight | Score | Grade | One-line verdict |
|---|-----------|-------:|------:|:-----:|-------------------|
| 1 | Code correctness & type safety | 15% | **8.5**/10 | A− | Zero `any` in the library core; strict mode clean. One packaging defect. |
| 2 | Error handling & diagnostics | 12% | **8.0**/10 | B+ | 9-class taxonomy + code registry; one error class escapes it. |
| 3 | API design & surface | 12% | **6.5**/10 | B− | 258 exports, duplicate methods, misleading names. |
| 4 | Internal architecture | 12% | **6.0**/10 | C+ | `cli.ts` is a 5.5k-line monolith with business logic inside it. |
| 5 | Readability & consistency | 10% | **6.5**/10 | B− | Excellent comments; poor factoring and helper reuse. |
| 6 | Testing & verifiability | 12% | **8.0**/10 | B+ | 33k test lines, hermetic, coverage-gated — with a critical blind spot. |
| 7 | Developer ergonomics (CLI UX) | 10% | **6.5**/10 | B− | Good help/suggestions; dead code paths and flag inconsistencies. |
| 8 | AI/agent friendliness | 12% | **8.5**/10 | A− | Best-in-class safety ledger and closed tool registries. |
| 9 | Documentation accuracy | 5% | **5.5**/10 | C+ | Genuinely useful, with widespread count/path drift. |
| 10 | Release engineering & hygiene | 2% | **9.0**/10 | A | Best-in-class packaging gates; currently failing on the working tree. |
| | **Weighted total** | 100% | **7.3**/10 | **B+** | |

**Sub-scores**

- Library (`aba-payway-ts` import surface) alone: **7.9/10**
- CLI (`payway-sdk`) alone: **6.5/10**
- AI-agent surface alone: **8.5/10**

**Severity counts:** 2 critical · 12 major · 21 minor · 12 nit

---

## 2. Critical defects (fix before publishing)

### C1 — `exports` map breaks every CommonJS TypeScript consumer

`package.json:37-43` declares a single `types` condition:

```json
"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } }
```

Because `"type": "module"`, TypeScript treats `dist/index.d.ts` as ESM. tsup **does** emit
`dist/index.d.cts` (217 KB) but nothing references it. A CJS consumer gets **TS1479**.

**Independently reproduced** (A/B against the real `dist/`):

```
TEST A (current map):      probe.cts(1,24): error TS1479: ... referenced file is an
                           ECMAScript module and cannot be imported with 'require'
TEST B (per-condition):    clean — both probe.cts and probe.mts compile
```

Why it survived: `scripts/smoke-packed-package.mjs` checks `require('aba-payway-ts').PayWay` at **runtime**
only. Runtime passes; types are never exercised.

**Fix (verified working in TEST B):**

```json
"exports": { ".": {
  "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
} }
```

**Fix the gate too:** add a `tsc` type-check of a synthetic `.cts` + `.mts` consumer against the packed
tarball. The current smoke test cannot catch a type-surface regression by construction.

---

### C2 — the `--json` output contract is broken on the most common failure path

`AGENTS.md` and `docs/README.md` both promise: *under `--json`, stdout is exactly one JSON document.*

`src/cli.ts:116` `assertCredentialsPresent(json = false)` prints a human ANSI block via **`console.log`
(stdout)** when `json` is false. It is called **31 times**; **22 do not pass `opts.json`**
(`cli.ts:1521, 1572, 1606, 1758, 1856, 1941, 2341, 2799, 3012, 3248, 3595, 3683, 3742, 3989, 4108, 4234,
4375, 4457, 4588, 4630, 4658, 4765, 4791`).

**Reproduced live, with credentials unset:**

```
$ payway-sdk payment-link detail -i x --json
  ✗ Missing merchant credentials
    • PAYWAY_MERCHANT_ID is missing or empty. ...
  (exit 1)                                    ← human ANSI on stdout, not JSON

$ payway-sdk refund -t x -a 1 --json          ← control: same missing-creds condition
{ "error": { "kind": "validation", "exitCode": 1, "type": "PayWayConfigError", ... } }   ✅
```

`refund` passes `opts.json`; `payment-link detail` does not. That single argument is the entire difference.

Also confirmed under `--json`: local-validation errors from `transaction-list` (`--from` format,
`--pagination`), `cof charge` (amount), `sandbox-beneficiaries` (currency), `sandbox-test-cards`
(`--outcome`), and `tx-batch` (prints `Report written:` before the JSON).

Envelope shapes also diverge in 4 families: canonical (`cli.ts:323`), `webhook.ts` (15 hand-rolled sites,
missing `type`), `docs.ts` (`kind: 'config_error'`, not in the `StructuredError` union at
`cli/output.ts:9`), `onboard.ts` (no `kind`/`exitCode`).

**Why the tests missed it:** machine-contract coverage is `cli-machine-contract.test.ts` (10 assertions,
4 commands), all Commander-level failures. No test asserts generic stdout purity.

**Fix order:**
1. Extract one `emitErrorEnvelope(e, { json })` router; replace all 25 `printApiError(Json)` pairs.
2. Pass `opts.json` at all 31 `assertCredentialsPresent` sites (or better: one `requireGatewayContext({json, rsa})`).
3. Add a parametrized test: for all 44 top-level commands, under `--json`, every failure path must satisfy
   `JSON.parse(stdout)`. One table, near-zero cost, kills the entire defect class permanently.

---

## 3. Major findings

### M1 — `src/cli.ts` is a 5,548-line monolith holding business logic

Composition (line census): 71.7% is **34 inline command blocks** (`1070-5049`). Of the ~4,323 inline
command lines: **309** flag declarations, **482** `console.log` calls, **335** error-routing statements,
**396** `if`/`try`/`catch` — but only **111** domain calls (49 `payway.<domain>.<method>` + 37 `new PayWay`).

→ **~70% is presentation plumbing; ~11% is domain interaction.** Only 8 of 86 commands are delegated to
`register*(program)` functions in `src/cli/commands/`.

Non-CLI policy that leaked in: `runPolling` backoff (`cli.ts:588-780`), gateway rate-limit table
`TX_BATCH_PACE_MS` (`1652`), payout-total-vs-amount money invariant (`3557-3593`), token 90-day expiry
policy (`4500-4520`), gateway-day timezone derivation (`1952`).

Largest blocks: `cof` group 608 lines · `generate-qr` **587** (one `.action` ≈ 549) ·
`generate-checkout` 361 · `payment-link create` 228.

**Extract largest-first** into the existing `commands/*.ts` + `*-helpers.ts` pattern already proven by
`agent.ts`/`agent-helpers.ts`.

### M2 — ~126 statements are mechanistically extractable

| helper | sites | defect class it removes |
|---|---:|---|
| `routeError(e, {json})` | 25 | 4 incompatible envelope families |
| `requireGatewayContext({json, rsa})` | 30 | C2 root cause |
| `jsonOrStringFlag<T>()` | 15 | 15 repeated casts |
| `resolveCurrency(raw)` | 12 | **7 spellings of currency parsing; 4 COF sites skip `.toUpperCase()`** |
| `unwrapData<T>()` | 11 | 3 ad-hoc idioms for the same unwrap |
| `diagnosticsFor(json)` | 5 | hand-rolled stderr routing |
| `parsePayoutArg(raw, {shape})` | 4 | 5 parsers for one concept |
| `confirmThenSubmit()` | 3 | 3 clack confirm implementations + 8 legacy readline gates |

Currency parsing is the most bug-prone: `cli.ts:4018, 4120, 4239, 4527` cast **without** uppercasing,
while `generate-qr` uppercases — `cof link-account/link-card/token-flag-sweep/charge` are
case-sensitive where the rest of the CLI is not.

### M3 — three `self-activation` commands are accidentally registered at the CLI root

`cli.ts:5259-5261, 5323-5325, 5355-5357` build the commands with `program.command(...)` — which pushes them
into `program.commands` — and `cli.ts:5396-5399` **then `.addCommand()`s the same instances** onto the
`self-activation` group. One object, two paths.

**Confirmed in live `--help`:** `new-merchant`, `credential-info`, `mc-info` appear as top-level commands
*and* under `self-activation`; `completions bash` emits them in both places.

The correct pattern is used twice in the same file (`pre-auth` at `cli.ts:5061+5255`, `webhook` at
`commands/webhook.ts:107+529`): `new Command(...)` then `.addCommand(...)`.

Not covered by tests (tests only exercise `self-activation …`), which is why it survived.

### M4 — `payment-link create` reads `opts.force` but never declares `-y/--force`

`cli.ts:3468` gates confirmation on `!opts.force`, but the command's option list
(`cli.ts:3448-3465`) declares no `-y`. Confirmed: `-y` → `error: unknown option '-y'`; and the full
required-option set is enforced. So **on a real TTY there is no documented non-interactive escape**,
while `AGENTS.md` states "`-y` skips". Doc/behavior drift on a consent gate.

### M5 — `--no-color` is ignored by three subtrees

Four independent ANSI palettes exist; only `src/cli/ui/theme.ts` honours `--no-color`/`NO_COLOR`/
`FORCE_COLOR`/TTY. Verified:

```
skills list --no-color   → ANSI PRESENT   (commands/skills.ts:98)
agent doctor --no-color  → ANSI PRESENT   (agent/ansi.ts:8)
journal stats --no-color → clean ✅       (control, uses ui/theme.ts)
```

`skills list` emits raw escapes into a pipe **with no flag at all**.

### M6 — `CircuitOpenError` escapes the `PayWayError` taxonomy

`src/circuit-breaker.ts:36`: `export class CircuitOpenError extends Error`. It has no `type` field, so
`instanceof PayWayError` is `false` and a documented `catch (e) { if (e instanceof PayWayError) }` misses
a legitimate transport rejection on the resilience path.

Related: `PollingAbortedError` (`errors.ts:140`) is typed `'config_error'` — a caller filtering
config problems catches poll aborts.

### M7 — `server.initiateTransaction` builds a new client per call

`src/server/index.ts:158` constructs `new PayWay(config)` on **every** invocation. Each instance gets a
fresh rate-limit token bucket and no shared circuit breaker, so the SDK's own throttling and resilience
are silently defeated in a loop.

### M8 — observability hooks receive **unredacted** secret-bearing bodies

`client.ts:1540` passes the raw wire body to `onRequest`. On merchant-auth endpoints that body contains
`merchant_auth` and `hash`; on `payment-credential`/`link-card` it contains **`pwt`**; on Google Pay,
`google_pay_token`. `sanitizeForLog` (`utils.ts:673-742`) is strong — 13 exact keys + fuzzy fragment
matching + ≥40-hex masking — but is applied **only** on the `debug` console path and in `createPayWayLogger`.

The project's own guide demonstrates the unsafe version — `docs/guides/12-error-handling-and-debugging.md:628`:

```ts
onRequest: (endpoint, body) => {
  console.log(`  Body:`, JSON.stringify(body).substring(0, 500));  // raw pwt / hash
}
```

Only the code comment warns. This is a one-line footgun on the recommended debugging path of an SDK whose
README leads with credential hygiene.

### M9 — an orphaned JSDoc block documents nothing

`src/domains/credentials-on-file.ts:85-98` — the warning that `linkCard()` **always throws** and that the
token arrives *only* via webhook — is immediately followed by a second JSDoc block for
`getLinkCardFormHtml` (`:99-128`). The first block is attached to no declaration and appears in neither
TypeDoc nor any IDE. This is the most important behavioural warning in the CoF domain.

### M10 — 17 of 22 public guide copies are stale

`docs/NN-*.md` are generated stubs ("copy of `docs/guides/<self>` … Do not edit here") but the only
generator is a throwaway script in gitignored `.scratch/docs-reorg/`. **Verified: 17 of 22 differ from
their `docs/guides/` source.** Anyone following an old `docs/12-error-handling-and-debugging.md` link gets
a materially older error table.

The generator also emits a `GENERATED STUB …` maintenance header that has leaked into **all 22**
`docs/guides/*.md`, **14** `knowledge/*.md` topics, and 20 `docs-packaged/` files — so
`payway-sdk docs qr-handling` and `query_knowledge read qr-handling` both open with internal bookkeeping
noise naming a repo path. (`knowledge.test.ts` fences content but not this header.)

### M11 — agent machine output never states the environment

Neither `AgentCommandResultV1` nor `agent doctor --json` carries sandbox-vs-production. In `--approve`
mode, `payway-sdk ask "create a $500 QR"` returns a JSON document from which an agent **cannot tell whether
it just created a production payment**. The environment surfaces only in the human confirmation renderer
(`orchestrator.ts:646`).

`doctor --json` *does* emit `context.environment` — the two commands should agree.

### M12 — REPL `:run` bypasses every agent risk gate

`src/agent/repl-helpers.ts:69-86` allows any registered top-level command except `agent` and `ask`.
So `:run payment-link void -i <id> -y --json` executes irreversibly with **no plan validation, no ledger
record, no approval gate** — only the CLI's own prompt, which `-y` skips. `:run profiles remove <prod>` and
`:run skills remove <agent>` have no confirmation at all. `payway-sdk session` shares the dispatcher.

This is the one place where the otherwise-excellent safety model has a hole.

---

## 4. What is genuinely excellent (protect during remediation)

1. **Type hygiene.** Zero `any`, zero `as unknown as`, zero `@ts-ignore`, zero non-null assertions across
   the entire core library surface. `noExplicitAny`/`noNonNullAssertion` = `error` in Biome; `tsc --noEmit`
   clean.
2. **Zero import cycles** across the whole non-test value-import graph (verified by static analysis).
3. **Hoisted, drift-guarded HMAC field orders** (`PURCHASE_HASH_FIELDS` et al.) — the highest-risk surface
   in a signing SDK, pinned by a test, and wrong-hash errors *print the exact field order to fix*.
4. **Sane mutation policy.** 20 side-effecting endpoints default to single-attempt transport
   (`MUTATION_ENDPOINTS`), because PayWay silently accepts duplicate `tran_id`s. Most SDKs retry everything.
5. **Error taxonomy + code registry.** 9 error classes with a string-literal `type` discriminant; 40
   `GATEWAY_CODE_HINTS`; a generated `docs/error-codes.json` with a drift guard.
6. **Non-replayable agent ledger** with an `OUTCOME_UNKNOWN` class distinct from failure, and
   lookup-only recovery.
7. **Money-out is structurally absent from the agent surface** — no `refund`, `payout`, `void`,
   `beneficiary`, or `token remove` tool exists in either the agent union or the MCP catalog.
8. **Layered secret hygiene** — key-name + value + canary-tested scrubbing at every persistence and
   egress boundary, including prompt-injection taint detection.
9. **Release gates.** Link/anchor validation, private-dossier leak scanning, skill-inventory diffing.
   Would catch a wide class of publishing accidents.
10. **Hermetic tests.** Env scrubbing, temp `APPDATA`, fake timers, stale-`dist` guard, coverage thresholds,
    mutation testing.

---

## 5. Test-suite state at time of writing

`npx vitest run --exclude src/__tests__/sandbox-contract.test.ts` → **2,215 passing**, `tsc --noEmit` clean,
`biome lint src` clean (2 warnings, 5 infos), `check-repository` and `check-public-docs` gates green.

The suite was **red during this audit** (3 failures across `knowledge.test.ts` and
`package-boundary.test.ts`) and the cause is worth recording, because it is a documentation-pipeline
trap rather than a code defect:

- Merchant-facing docs (`README.md`, `QUICKSTART.md`, `docs/README.md`, `llms.txt`) gained links into
  `payway-boilerplate/…` for the Postman collection. But `scripts/check-package-contents.mjs:50`
  **forbids `payway-boilerplate/` in the tarball**, and the link checker resolves links against the *pack
  manifest* — so packaged files linking there are reported as broken.
- Editing any corpus source without re-running `npm run sync:knowledge` also fails the freshness test.

The underlying tension is real and worth a decision: the docs advertise a Postman collection that the
packaging policy excludes. Resolved in commit `c0354b0` by having **packaged** files reference the
collection by name + path (no link) and keeping repo-only links in `docs/README.md`.

**Rule that follows:** any edit to a knowledge-corpus source (`README.md`, `QUICKSTART.md`, `docs/**`)
requires `npm run sync:knowledge` before tests pass. This is the most common way to leave `main` red.

---

## 6. Documentation drift inventory

| Claim | Stated | Actual | Location |
|---|---|---|---|
| Knowledge topic count | 31 | **35** | `AGENTS.md:87`, `AGENTS.md:159` |
| Knowledge topic count | 30 | **35** | `skills/README.md:96` |
| Knowledge topic count | 31 | **35** | `docs/project/MAINTENANCE.md:34` |
| Agent tool count | 13 | **14** | `.agents/AGENTS.md:83` |
| Error registry packaging | "not in the npm package" | **shipped** as `knowledge/error-codes.json` (95 codes) | `skills/aba-payway-agent/SKILL.md:285` |
| Dossier path | `docs/SANDBOX-FINDINGS.md` | `docs/internal/SANDBOX-FINDINGS.md` | `.agents/AGENTS.md:51`, `AGENTS.md` |
| CLI command inventory | 40 commands | **44** (`journal` + 3 self-activation) | `cli/ui/help.ts:14`, `cli-help.test.ts:12` |

Two facts explain the count drift: the manifest declares **35** topics while `knowledge/*.md` has 34 files
(plus `MANIFEST.json`), and the count-pin test only asserts `>= 29` — a floor, not equality.

`HANDOFF.md` (98 KB, mandated first read by both AGENTS files) contains **mutually contradictory**
current-state numbers — 30/31 topics, 31/32 skills, 1805/2012/2120 tests, and a "Do Not Ship" verdict
alongside an "Item 6 CORPUS pass" claim. It costs ~24k tokens of stale history per agent session.

---

## 7. Recommended order of work

**Phase 1 — ship blockers (≈1 day)**
1. C1 exports map + add a typed-consumer gate to `smoke-packed-package.mjs`.
2. C2 error router + `opts.json` at all 31 credential sites + the parametrized stdout-purity test.
3. Fix the knowledge-pipeline coupling: `npm run sync:knowledge` after any corpus-source edit; resolve
   the `payway-boilerplate` link-vs-forbid tension (partially resolved in `c0354b0`).
4. M3 `new Command(...)` for self-activation; M4 declare `-y/--force` on `payment-link create`.

**Phase 2 — contract hardening (≈2 days)**
5. M5 collapse 4 ANSI palettes into `ui/theme.ts`.
6. M6 `CircuitOpenError extends PayWayError`; fix `PollingAbortedError` type.
7. M11 add `environment` to agent machine output.
8. M12 gate REPL `:run` behind the same risk classifier (or at minimum block money-out commands).
9. M8 redact hook payloads by default (`onRequest`/`onResponse`), with an explicit opt-in for raw bodies.

**Phase 3 — maintainability (≈1 week)**
10. Land the 9 extraction helpers (M2) — mechanical, closes whole defect classes.
11. M1 extract `cli.ts` largest-first into the existing `register*` pattern.
12. Add `.option('--color')` consistency; delete or wire the dead suggestion layer and `COMMAND_EXAMPLES`.
13. M10 regenerate guides from a committed generator + add a parity test; strip the `GENERATED STUB` header.
14. Correct the drift table in §6; shrink `HANDOFF.md` to a state summary, move history to an archive.

---

## 8. Scoring rationale (why these numbers)

**8.5 for correctness** — not 9+: C1 is a real packaging defect, and `getGatewayErrorDetails`
(`client.ts:2029`) has a provably dead guard (`rawBody !== undefined` is always true given the preceding
null check), so it can never return `null`. Not 8-: the type system is genuinely clean and `tsc` passes.

**6.0 for architecture** — not 5: the module boundaries are clean, cycles are zero, and the domain
factories are well designed. Not 7: a 5.5k-line CLI file holding gateway rate-limit tables and money
invariants is a structural debt that compounds, and 71.7% of it is inline command blocks.

**8.5 for AI-friendliness** — not 9+: C2 breaks the machine contract on 22 commands, M11 hides the
environment, M12 leaves a gate bypass, `query_knowledge read` has no size cap (largest topic 62 KB ≈ 16k
tokens), and 4 tool-classification `Set`s are hand-maintained with no completeness test (fail-open in
`executor.ts`). Not 8: the closed compile-guarded tool registry, non-replayable ledger, layered secret
scrubbing, and structurally-absent money-out tools are better than most production CLIs.

**5.5 for documentation accuracy** — the *content* is excellent (honest about PENDING ≠ alive, missing
callback ≠ non-payment, PENDING for QR-only never listing). The *accuracy* is not: 7 verified drift items,
17 stale guide copies, and 24k tokens of contradictory mandated-first-read history.

---

## Appendix — evidence index

| Claim | Verification |
|---|---|
| C1 TS1479 + fix | A/B `tsc` against real `dist/`, synthetic `.cts`/`.mts` consumers |
| C2 stdout pollution | Live `payment-link detail -i x --json` vs `refund -t x -a 1 --json` control |
| M3 root registration | Source read (`cli.ts:5259-5399`) + live `--help` + `completions bash` |
| M4 missing `-y` | Live `payment-link create -y` → `unknown option '-y'` |
| M5 `--no-color` leak | Live `skills list --no-color` vs `journal stats --no-color` control |
| M6 `CircuitOpenError` | `circuit-breaker.ts:36` |
| M10 stale stubs | Hash comparison of 22 `docs/NN-*.md` vs `docs/guides/` → 17 differ |
| §5 test-suite state | `vitest run` output, `git show c0354b0`, `check-package-contents.mjs:50` |
| Type hygiene counts | Per-file pattern counts over `src/` excluding `__tests__` |
| Import cycles | Static analysis of non-test value-import edges |
