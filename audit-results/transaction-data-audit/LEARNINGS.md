# Session Learnings — Transaction-Data Audit & 6-Phase Journal Implementation (2026-09-06)

Extracted from the session that produced the deep audit
(`./REPORT.md`) and shipped all six roadmap phases on branch
`audit/transaction-data-ai-readiness` (commits `aa89a23` → `9f3facd`).
Split into what is now **codified in code**, **process rules for future
agents**, and **footguns that actually bit**. The follow-up backlog lives in
`../../.scratch/transaction-data-journal/IMPROVEMENTS.md`.

## 1. Design lessons (now codified — do not regress)

- **Check the instrumentation surface BEFORE designing against it.** The
  audit's first draft wired the journal to the existing `onRequest`/`onResponse`
  hooks. Second-pass code validation proved them insufficient: no cid, no
  duration, no attempt number, and `onResponse` never fires on error paths
  (client.ts throws before the hook at four points). The shipped design emits
  first-party events inside `_executeFetch` where that data lives. Rule: hook
  signatures are a contract — read them, don't assume them.
- **A library never writes files silently.** The journal, the webhook store,
  and the agent ledger are all opt-in. `journal: false` always wins; env only
  fills what config omits. This is why the CLI's global `--journal` flag works
  by setting `PAYWAY_JOURNAL=1` in preAction — one switch arms all 28
  unmodified `new PayWay()` sites.
- **Redaction at write is mandatory, not a display concern.** Request bodies
  carry the HMAC `hash`; `merchant_auth` is a huge ciphertext; `pwt` and QR
  base64 are payload-sized. The digest builder allow-lists non-secret
  transactional fields in `digest` mode; `full` mode runs `sanitizeForLog`
  with a hard cap and `[ENCRYPTED n chars]` placeholder. Hook payloads and
  `--json` output remain unsanitized by design — the journal must not repeat
  that.
- **One join key everywhere.** The SDK cid (`PayWay.lastCorrelationId`) lands
  in journal events, ledger `correlation` (`attachCorrelation`,
  first-write-wins), and artifact sidecars. Webhook records join via their
  record id (a `callback.received` event's correlationId) and via
  `matchedTransactionId`. New records should reuse these keys, not invent
  new ones.
- **Anomaly baselines must exclude the spike.** The first draft averaged the
  spike day into the mean — self-dilution made every spike undetectable
  (6 errors vs mean 6 ⇒ 6 ≥ 18 false). Fixed with leave-one-out baselines.
  Any future threshold heuristic: compare the subject against the mean of
  the OTHERS.
- **Provider-side truth is unreachable; say so in the output.** No
  CLOSED/EXPIRED status exists remotely; unpaid QR-only transactions are
  invisible to lists; PayWay never retries missed callbacks. Every
  reconciliation/explanation output carries the caveat instead of pretending.
- **Semantic layers stay separate from transport events.** `execution.request`
  (per attempt) is transport; `status.observed`, `poll.attempt`,
  `execution.started`, `artifact.written` are semantic. A separate
  `execution.started` transport event would duplicate request#0 — command-level
  starts belong to the CLI layer only.

## 2. Process rules for future agents

- **Sub-agent line numbers drift (~40–60 lines observed in `cli.ts`).**
  Explorer reports are for orientation; every file:line that lands in a
  durable doc must be re-derived from the working tree (grep the symbol, not
  the line). REPORT.md §19 records the policy and the reproducible greps.
- **Two passes minimum for load-bearing claims.** The three-track exploration
  was right about almost everything but missed: the hook contract gap, the
  TD-08 logger's single call site, and the webhook verdict being dropped.
  All three were found by reading the actual files before designing.
- **Coverage self-check against the original brief.** The v3 plan promised a
  9-column inventory table and evidence-block format; the coverage check
  found both missing and they were fixed before delivery. Run the §0 map
  against the brief's mandated artifacts every time.
- **Test expectations can encode design bugs.** The 200-wrapped business
  error initially produced TWO journal error events (redundant wrap + shared
  catch). The failing test exposed the double-count — the wrap was removed,
  not the assertion adjusted blindly. When a test "expectation looks wrong",
  check whether the code is.
- **Fix seams, not symptoms.** Tests polluted by the repo's real
  `webhook_data/callbacks.jsonl` produced `PAYWAY_WEBHOOK_DIR` (a registered,
  documented env var) instead of a test-only hack.
- **Spec order for gates**: `npm run build` BEFORE the full vitest run —
  `cli.test.ts`/`agent-cli.test.ts` gate on dist freshness and fail (or skip)
  otherwise.

## 3. Footguns that actually bit this session

- **Never embed backticks in `git commit -m` under Git Bash** — command
  substitution eats the content (a committed message lost the word
  `correlation`). Use `git commit -F <file>` or plain quotes.
- **commander: an option name defined on ANY ancestor command swallows the
  same flag on descendants.** `agent --session` (REPL resume) silently
  emptied `--session` on the new `agent ledger recover` subcommand. Fixed by
  renaming to `--session-id`; the rule and the reason are commented at the
  option definition.
- **Env resolution is two-variable.** `PAYWAY_JOURNAL_DIR` alone enables
  nothing — `PAYWAY_JOURNAL=1` is the enable switch and `_DIR`/`_MODE` fill
  gaps. Tests stubbing only the dir got 0 events.
- **In-process `runCli` tests consult the REAL profile store via `%APPDATA%`**
  (existing `cli.test.ts` spawns child processes with isolated APPDATA
  instead). Stub `APPDATA` for in-process CLI tests or you read/mutate the
  developer's actual profiles.json.
- **The vitest hermetic env scrubs every `PAYWAY_*` var per test file**
  (`src/test/vitest-hermetic-env.ts`) — config-object injection or
  `vi.stubEnv` is required for anything env-driven.
- **Registry functions take three arguments** (`action, client, ctx`) even
  when the tool ignores the client; TS catches it, but plan for it.
- **`skills.test.ts` pins the packaged-skill count** (now 31) and every
  SKILL.md must match the frontmatter regex + contain `## Quick Start`, a
  ```ts block, and `## Error Handling`. `agent-provider.test.ts` pins the
  provider tool count (now 13). Flip both consciously.

## 4. What the record now gives this repo

- Every CLI invocation, API exchange, poll, observed status, artifact, and
  webhook capture is reconstructable per transaction (`journal timeline`,
  `explain`, `reconcile`) — the audit's core question flipped from NO to YES
  for journaled sessions.
- Recovery is reachable (`agent ledger recover`), result digests survive
  (`resultSummary`), and the dormant `'ledger'` session event fires.
- The 18-gap register stands at 12 closed, G9 mitigated. Remaining: G2/G13–G15
  (partial / backlog), G18 (provider-side, permanent — the journal exists
  precisely because of it). Backlog: `../../.scratch/transaction-data-journal/IMPROVEMENTS.md` — **I-1..I-8, I-12, I-13 shipped 2026-09-06 (same branch, commit f362971); I-9/I-10/I-11 deferred**.
