# Remediation status register — publishing-DX audit (2026-09-29)

Tracks the ordered remediation plan in [REPORT.md](REPORT.md) §11. This register is the
authoritative current status; the component reports retain historical findings for
traceability. Updated 2026-10-01 (remediation batch 1 = work packages 1 and 2, plus a
same-day second pass closing the independent review findings in
[ITEMS-1-2-REVIEW-2026-10-01.md](ITEMS-1-2-REVIEW-2026-10-01.md) — see "Second pass").

> **Independent review, 2026-10-01:** [Item 1/2 verification](ITEMS-1-2-REVIEW-2026-10-01.md) confirms R03/D01 and R01/R02 are fixed, with fresh repository/package/official smoke passes. Work package 1 remains partially open: distribution policy accepts an unauthorized non-hex `secret_key` and tokens inside saved examples in synthetic negative probes, and the recorded owner decisions remain pending. The focused current-tree suite also fails knowledge freshness for QUICKSTART.md (16 passed, one failed). The implementation/gate snapshot below is historical remediation evidence; use the independent review for current closure status.

## Second pass — review findings closed (2026-10-01, same day)

Addresses every actionable finding in [ITEMS-1-2-REVIEW-2026-10-01.md](ITEMS-1-2-REVIEW-2026-10-01.md). The review's verdict text above is retained verbatim for traceability; the entries below are the current status.

1. **"Distribution guard allows an unauthorized non-hex signing key" — CLOSED.**
   Enforcement is now BY FIELD, not by string shape: `secret_key`, `merchant_id`,
   `ctid`, `whitelist_payee`, `buyer_email`, `buyer_phone` must carry exactly the
   authorized demo value or be empty regardless of what the value looks like
   (`_build/distribution-scan.js` `DEMO_IDENTITY` field policy); `rsa_public_key`
   must be a public-key PEM or empty. The review's exact in-memory repro
   (`secret_key: 'synthetic-not-authorized-key'`) is a pinned negative control
   (`_build/distribution-scan.test.js`), alongside unapproved hex, empty fields,
   the authorized identity, and a non-demo `merchant_id`. Violation diagnostics are
   redacted (length + sha256 prefix; a test asserts the offending value never
   appears in the message).
2. **"Runtime tokens in saved examples are not covered" — CLOSED.**
   Saved response bodies are now parsed/redacted at export: captured credential
   values under credential JSON keys (`pwt`, `token`, `secret_key`, `api_key`,
   `password`, …) become clearly synthetic `REDACTED-<key>` placeholders. BOTH
   encodings are covered — plain JSON and escaped JSON-in-JSON (webhook.site pull
   captures embed the callback payload as an escaped string). Redaction is scoped
   to example bodies only; a negative control proves request-body `{{variable}}`
   templates (the CoF sample sender's `"pwt": "{{pwt}}"`) are never rewritten.
   Applied to the real artifact: the dist previously carried a captured-looking
   `pwt` in the CoF token-callback example AND (escaped) in the webhook.site pull
   example — both now ship as `REDACTED-pwt`; zero occurrences of the original
   value remain in the distribution. Further whole-export coverage: the demo
   secret may appear exactly once (its variable slot — a paste into a
   description/example fails the build), private key material, personal receiver
   references and non-demo emails are rejected anywhere in the export. 16 negative
   controls run in the CI `test:yaml` chain (`_build/package.json`).
3. **"Knowledge freshness fails for QUICKSTART.md" — CLOSED.**
   Root cause: the QUICKSTART `--search` link correction landed after the last
   corpus sync, so `knowledge/quickstart.md`'s manifest hash was stale. Regenerated
   with `npm run sync:knowledge` and verified: the focused knowledge/package/
   pack-report suites now pass 17/17 (the review's 16 passed + 1 failed), and the
   full offline suite passes with the refreshed bytes (count below).
4. **"Owner decisions remain pending" — ACKNOWLEDGED as pending owner gates.**
   Recorded explicitly below; they block public publication, not further
   remediation batches.

## Fourth pass — work package 5: webhook lifecycle and acceptance (2026-10-01)

Implements remediation item 5 (WP02/WP03/WP07) from REPORT.md §11. Mechanics landed as
`432b039`; acceptance tests and claim alignment complete the pass.

| Finding | Status | Fix and evidence |
|---|---|---|
| WP02 — receiver "ownership" was only a shared PID; stop could signal a reused or unrelated process and reported success without confirmation | **FIXED** | Lifecycle state v2 (`src/webhook/lifecycle.ts`) carries a random `instanceId` + control token per receiver instance (v1 files read as absent by design). The receiver exposes a control route (`POST /aba-payway-control`): `identify` reveals the instance id, `shutdown` requires a timing-safe token match and triggers the receiver's OWN graceful shutdown (tunnel stop, `.env` restore, listener close) — `setup-webhook` wires its existing shutdown routine as the handler. `webhook stop` (`src/webhook/receiver-control.ts`) is identity-first and graceful-first: it identifies the process on the recorded port and REFUSES to act on an instance-id mismatch (`pid-reused` — a reused PID cannot answer with our random id); outcomes are honest (`stopped` / `stale` / `pid-reused` / `unreachable` / `unauthorized` / `shutdown-not-confirmed`); it waits for ACTUAL process exit (default 5 s) before reporting success and only clears the state file when our receiver is confirmed gone (or provably stale). **No OS signal is ever sent to any PID.** Acceptance in `src/__tests__/webhook-receiver-lifecycle.test.ts` (11 tests): the happy path proves identify-before-shutdown ordering; reused-PID/foreign-receiver refusal (nothing signalled, state kept for the CLI to clear), stale, unreachable-live-PID, shutdown-accepted-but-wedged (`shutdown-not-confirmed` — the audit's "receiver that ignores shutdown never yields a misleading successful stop"), unauthorized token, and the real-server control route (identify, wrong-token 403, correct-token ACK + handler invocation, 404 without control wiring). |
| WP03 — forwarding blocked the callback ACK with no application timeout | **FIXED** | Captured deliveries now drain through a bounded background queue (`WebhookForwardQueue`, `src/webhook/forwarder.ts`): `handleRequest` dispatches synchronously and ACKs right after the durable capture, so a slow or hung receiver can never delay the acknowledgement. Every forward is bounded by `AbortSignal.timeout` (default 5 s; configurable) and counted truthfully (`delivered`/`failed`/`timedOut`). The queue is bounded (default 100 pending): saturation DROPS the forward — never the capture — with a visible warning pointing at `webhook resend`; `server.stop()` awaits the in-flight delivery and then refuses further enqueues; `forwardStats` is exposed on the server result for truthful shutdown reporting. Acceptance in `src/__tests__/webhook-forward-queue.test.ts` (7 tests): the core isolation proof — a callback against a real server whose receiver hangs forever is ACKed in under 1 s while the forward eventually times out and is counted; the timeout budget aborts and counts `timedOut` (distinct from fast non-2xx `failed`); enqueue never awaits the network; saturation drops with count; `stopAccepting` on shutdown; `idle()` holds until the in-flight delivery resolves. |
| WP07 — listener bound all interfaces and buffered/persisted unbounded input | **FIXED** | The listener binds `127.0.0.1` by default and LOGS its binding (a non-loopback bind prints an explicit warning); `setup-webhook --host` makes wider binding a conscious, documented opt-in. Request bodies are capped (`maxBodyBytes`, default 2 MiB): the cap trips mid-stream, responds 413 `{error: "payload too large"}`, stops buffering, and discards the tail. `JsonWebhookStorage` compacts to `maxRecords` (default 1000, oldest dropped; `Infinity` opts out) — the capture file cannot grow without limit, and dropped records remain covered by the forward/resend workflow. Acceptance in `src/__tests__/webhook-wp7-bounds.test.ts` (8 tests): loopback default + explicit-host surface, 413 with nothing stored, normal body under the cap still accepted/captured, compaction keeps the NEWEST records (verified on disk bytes, not a read filter), `Infinity` opt-out, and the default bound. |

Also aligned the claims that the mechanics made stale: the webhook-production Skill
(`skills/` + its byte-identical `.zcode/skills` mirror) now documents identity-verified
stop semantics, the loopback default and the background forward model; guide 16's flag
table documents `--host`, the background forward (ACK never waits, 5 s bound, drop
semantics), the lifecycle table's receiver-cleanup row states the instance-verified
protocol plus the new 413/retention rows. Corpus resynced in the same commit.

Gate snapshot: typecheck exit 0; lint exit 0; full offline suite **2,200 tests / 154
files, 0 failed** (2026-10-01, Windows, Node v24.21.0, npm 12.0.2) — includes the 26
new WP5 acceptance tests; `mcp --list-tools --json` counts unchanged (12/17).

## Third pass — work packages 3 and 4 (2026-10-01)

Implements remediation items 3 (safe first integration — S01/S02/WP01) and 4 (MCP and
machine contracts — S03/S04/S05/S09) from REPORT.md §11.

| Finding | Status | Fix and evidence |
|---|---|---|
| S01 — generated first-payment starter does not load its generated `.env` | **FIXED** | `init` now prints `node --env-file-if-exists=.env payway-first-payment.mjs` (Node ≥20.12 loads the file without overriding real environment variables, which keep precedence) and the generated starter documents the environment strategy in its header. Acceptance exercised in `src/__tests__/starter-e2e.test.ts`: a child process executes EXACTLY the printed command with only `.env` populated (ambient `PAYWAY_*` stripped) and the SDK's pre-network callback validator fires on the configured value — proving `.env` → SDK propagation through the printed command; the full create is executed in-process against a local gateway stub (children cannot open loopback TCP to a parent-hosted server on this machine — documented in the test header); the recovery leg proves the ORIGINAL attempt id is surfaced when the gateway is unreachable. Environment note: `--env-file-if-exists` keeps the command working when a user deletes `.env`. |
| S02 — framework scaffolds trust client pricing and name a nonexistent API | **FIXED** | Both `src/config/templates/express.ts` and `nextApp.ts` rewritten around a shared generated `order-store` module: server-owned order values from a catalog (the browser sends a SKU, never a price), artifact projection only (`paymentArtifact`/`responseType`/`expiresAt` — the raw session never leaves the server), the REAL verification API (`verifyCallbackDetailed` — the nonexistent `sdk.auth` TODO is gone), process-local single-acceptance delivery inbox, fail-closed on invalid signature / unknown transaction / non-approved status / invalid-or-mismatched amount/currency, fulfill-once guarded by the order state, and create errors that preserve the attempt id. **Review-round hardening (same day):** (a) the store's in-memory maps are now labeled `NON-PRODUCTION DEMO STATE — NOT DURABLE` with the restart/multi-instance consequences spelled out and a pointer to the guide's database pattern — the routes need no other change when swapping in a DB adapter with the same three exports; (b) the callback contract now uses the guide's exact fields (`payment_status_code`/`payment_status`/`payment_amount`/`payment_currency` — the earlier `status`/`payway_amount` shapes are gone); (c) a MISSING amount or currency parks the order (fail closed — no longer "accept as finite match"), and currency must match the STORED order exactly; (d) PRE-AUTH (code 0) is guarded AND cannot collide with a later APPROVED delivery because the fallback delivery id uses the status STRING, not the bare code; (e) the guide's own snippet got the same delivery-id fix. Executable acceptance in `src/__tests__/scaffold-templates.test.ts` (19 tests): generated files are transpiled and their route handlers DRIVEN through the trust matrix — client `amount: 999999` is ignored (the stub sees 3.00), forged signatures 401, unknown transactions park, missing amount / missing currency / wrong currency / wrong amount all park unfulfilled, PRE-AUTH never fulfills and never blocks a later approval, replays ACK `duplicate` with a single fulfillment, a fresh module GRAPH (restart simulation) demonstrably loses the fulfilled order — pinning the labeled non-durability — and a schema-parity group enforces the guide ↔ scaffold field contract in BOTH directions, including the `NON-PRODUCTION DEMO STATE` labeling. The executable tests also caught a real generated-code bug the filename tests never could: the first id scheme exceeded the gateway's 20-character `tran_id` cap (502 on every create) — fixed and pinned by a ≤20-char assertion. |
| WP01 — production callback example ACKs before durable work, never checks approval/funds | **FIXED** | `docs/guides/11-callbacks-and-webhooks.md` "Production Version" replaced with a durable inbox/outbox flow: HMAC verification via the real API, `INSERT … ON CONFLICT DO NOTHING` delivery acceptance BEFORE any decision, APPROVED check (`payment_status_code` 0 with the string guard separating PRE-AUTH), amount/currency matched against the STORED order (mismatch → `needs_review`, never fulfilled), fulfill-once via a conditional `UPDATE … WHERE status <> 'paid'`, outbox row for external work, ACK last — plus the schema sketch and an explicit "refuses to do" list. The minimal example above it no longer equates a valid signature with confirmed payment. Body fields now match the real online callback shape (`payment_status_code`/`payment_amount`/`payment_currency` — the old snippet destructured `amount`/`currency`/`status{code,message}` fields the pushback never carries). Corpus resynced; docs-acceptance + knowledge suites green. |
| S03 — a saved profile corrupts the MCP stdio protocol | **FIXED** | The `mcp` command is excluded from the `preAction` profile hook in `src/cli.ts` (its per-tool-call `resolvePayWayContext` handles profiles itself). Acceptance in `src/__tests__/mcp-stdio-smoke.test.ts` over a REAL stdio pipe: with a saved default profile store, with a `PAYWAY_PROFILE` naming a nonexistent profile, and with a malformed profile store, the server answers initialize + tools/list and EVERY stdout line parses as JSON-RPC (a non-protocol line now fails the test with the offending line quoted). |
| S04 — `PAYWAY_MCP_ALLOW_MUTATIONS` opt-in ignored | **FIXED** | `--allow-mutations` no longer carries a Commander default; `undefined` falls through to the environment in `resolveAllowMutations`. Precedence pinned in `src/__tests__/mcp-cli.test.ts`: absent → 12 tools, env opt-in → 17, env opt-out → 12, explicit flag beats env opt-out → 17. Default stays read-only. |
| S05 — machine-readable failure handling incomplete before command execution | **FIXED** | `runCli` now routes EVERY pre-execution failure under machine output to the uniform envelope: program-level `exitOverride()` makes missing-option/unknown-command/profile-hook failures catchable, and `argvRequestsMachineOutput()` detects `--json` / `--output json|ndjson` from the raw argv (usage errors fire before parsing). The refund-only special case is subsumed. Human mode unchanged (empty stdout, diagnostic stderr, exit 1); help/version remain human + exit 0. Matrix in `src/__tests__/cli-machine-contract.test.ts` (10 tests): missing required options on two commands, unknown command, unknown option, nonexistent profile (envelope instead of stack, no stack on stderr), both `--output` spellings, human-mode legacy channel, help preservation, refund regression. |
| S09 — MCP advertises a version that drifts from the package | **FIXED** | `SERVER_INFO.version` is derived from the built `package.json` (import-relative first, `node dist/cli.js` layout fallback, `unknown` last resort — never a fabricated number). Verified over the real stdio pipe: the initialize response's `serverInfo.version` equals the built package version (`mcp-stdio-smoke.test.ts`). |

Gate snapshot for this pass: typecheck exit 0, lint exit 0 (2 pre-existing warnings),
focused suites green (mcp-cli 6, mcp-stdio-smoke 4, cli-machine-contract 10,
scaffold-templates 11, starter-e2e 4, init 8, knowledge/docs 21); full offline suite
2,160 tests / 151 files, 0 failed (2026-10-01, Windows, Node v24.21.0, npm 12.0.2);
`mcp --list-tools --json` counts unchanged (12/17).

## Work package 1 — Public payload and identity (R03/D01, WP10)

| Finding | Status | Fix and evidence |
|---|---|---|
| R03/D01 — internal sandbox dossier (`docs/internal/CLOSE-TRANSACTION-FINDINGS.md`) shipped as public knowledge topic `close-transaction-findings` | **FIXED** | Dossier removed from the curated corpus (`scripts/knowledge-sources.mjs`); replaced by the reviewed, evidence-free public guide `docs/guides/23-close-transaction.md` (topic `close-transaction`) carrying channel-dependent close semantics, the local-`closed`-flag policy and reconciliation guidance without transaction IDs, approval codes or escalation history. Corpus regenerated (`npm run sync:knowledge`, 31 topics). Provenance is now enforced at three levels: the generator refuses non-public source directories (`scripts/sync-knowledge.mjs` `assertPublicSources`), `src/__tests__/knowledge.test.ts` fails on an internal source in the written manifest (D01 acceptance: an intentionally introduced internal source fails the test before packaging), and `scripts/check-package-contents.mjs` forbids the retired topic filename and the dossier filename form in any packaged file. Public cross-references (SDK & CLI reference, QR guide, docs index, AGENTS pointers) now cite the public guide. |
| WP10 — shareable Postman export carries real configured values and personal workspace/cloud linkage, unscanned | **FIXED (mechanics); one owner check pending** | New reviewed distribution profile: `_build/distribution-scan.js` runs on EVERY `export_json.js` build and `--check` (CI-enforced). It (a) replaces maintainer-owned webhook.site receiver URLs in `return_url`/`callback_url` with an `example.com` placeholder, (b) ships runtime-capture variables (`pwt`, `webhook_token`, `callback_listener`, `tran_id`, merchant-auth ids, …) empty, (c) enforces the demo identity **by credential field** (`secret_key`, `merchant_id`, `ctid`, `whitelist_payee`, `buyer_email`, `buyer_phone` must carry exactly the authorized value or be empty — string shape is irrelevant; `rsa_public_key` must be a public PEM), (d) redacts captured credential values under credential JSON keys inside saved response bodies — plain and escaped JSON-in-JSON forms — to clearly synthetic `REDACTED-<key>` placeholders, (e) hard-fails on any other hex/high-entropy secret in variables, private key material anywhere, non-demo emails anywhere, personal webhook.site receiver references, maintainer workspace/cloud identifiers (`98cc8641…`, `a1451da9…`), or a second occurrence of the demo secret outside its variable slot, (f) reports violations with **redacted diagnostics** (length + sha256 prefix, never the value). Policy documented with the owner-recorded disposition in `postman/documents/README.md` ("Distribution credential policy"). Dist regenerated: SDK import OK, 46 requests / 49 examples / 125 variables unchanged; the CoF token-callback sample and the escaped webhook.site pull capture now ship `REDACTED-pwt` (zero occurrences of the original value); maintainer receiver id `6adc6e49…` absent. 16 negative controls in `_build/distribution-scan.test.js` run in the CI `test:yaml` chain — see "Second pass" above for the review-finding mapping. |

### Owner decisions still open from WP10/R05 (not agent-resolvable)

1. **CLOSED — owner decision recorded 2026-10-01:** ABA authorizes public redistribution
   of the exact sandbox demo identity (merchant `ec476910` + demo key). The distribution
   scan's exact allowlist remains the enforcement boundary; it does not authorize any
   other credential-shaped value.
2. **PARTIALLY CLOSED — owner decision recorded 2026-10-01:** use a fresh public history
   from a curated tree and retain this checkout as the private development line. The
   curated public-tree list, native-SDK treatment, repository destination and remaining
   publication decisions are still owner-controlled and pending.

### Inspection evidence (exact artifacts, not source settings)

- Tarball (`npm pack --dry-run --json`, npm 12 shape): 127 files; **no**
  `close-transaction-findings` file; **no** `docs/internal/` path; no packaged file
  mentions the dossier filename; `knowledge/close-transaction.md` present; 31 knowledge
  topic files. Log: `.scratch/publishing-dx-remediation/tarball-inspection.json`
  (reproduce with `.scratch/publishing-dx-remediation/inspect-tarball.cjs`).
- Collection (`dist/PayWay API — Complete Collection.postman_collection.json`):
  `export_json.js` rebuild + `--check` green with the distribution policy applied
  (`return_url`/`callback_url` sanitized); `test:yaml`, `verify_index.js`,
  `verify_postman_import.js`, `syntaxcheck.js`, `validate.js`, `readme_path_audit.js`
  all green.

## Work package 2 — Reliable release gates (R01, R02)

| Finding | Status | Fix and evidence |
|---|---|---|
| R01 — `check:repository` ENOENT at obsolete pre-reorganization paths; gate cannot finish | **FIXED** | `scripts/check-repository.mjs` now validates the canonical registry (`docs/project/RELEASE_CHECKLIST.md`, `docs/project/RELEASE-READINESS.md`, `docs/project/HISTORY-SECRET-TRIAGE.md`, `docs/reference/SDK-AND-CLI-REFERENCE.md`, `docs/guides/FIRST-PAYMENT-WALKTHROUGH.md`, …); a missing entry document is collected as an actionable failure ("move it back or update the docs registry") and the check verifies ALL entry documents instead of dying on the first missing file. `payway-sdk docs <topic>` link destinations are validated against `knowledge/MANIFEST.json` instead of being treated as paths — which exposed and now blocks the D06 `--search` syntax; the one invalid QUICKSTART link was corrected to the supported `docs search` form. Acceptance proven: gate completes on the working tree; a deliberately broken link fails with source and target (`QUICKSTART.md: missing link target docs\guides\NOPE.md`); a temporarily missing entry document fails with the actionable message. |
| R02 — `smoke:package` reads npm pack output as an array (npm 12 object → undefined `.filename`); stale hardcoded 32-Skill pin | **FIXED** | Shared normalizer `scripts/lib/pack-report.mjs` handles npm ≤11 (array), npm 12 (object keyed by package name) and bare-report shapes; both `smoke-packed-package.mjs` and `check-package-contents.mjs` consume it. Output-shape contract pinned by `src/__tests__/pack-report.test.ts` (7 tests incl. empty/garbage/reject cases). Skill count is now compared against the repo's own `skills/` inventory instead of a hardcoded number (also applied in `check-package-contents.mjs` and the `llms.txt` generator, killing the 32-vs-34 contradiction at its source). Additional npm 12 failure surfaced and fixed during verification: `npm run` exports the maintainer's `allow-scripts` config as `npm_config_*` env and npm 12 rejects env-sourced allowScripts on project-scoped installs — the consumer install now runs with the inherited `npm_config_*` layer stripped (clean consumer resolves npm config from files). Acceptance proven: `npm run smoke:package` PASSES end-to-end on npm 12.0.2 (ESM/CJS/declarations/CLI demo, 34 skills from inventory, install/doctor/upgrade/remove preservation). |

### No stale count pins (WP2 acceptance)

- `yaml_collection.test.js` 125/46, `check-package-contents.mjs` and
  `smoke-packed-package.mjs` skill counts → repo inventory, `llms.txt` skill count →
  generated from the skills directory. Remaining hardcoded pins (topic minimums,
  tool catalogs) are semantic minimums, not inventory counts.

## Concurrent-wave note

The uncommitted Postman maintenance files observed by the audit (2026-09-29/30) are the
WP04 count-alignment/export wave (`yaml_collection.test.js` 122→125 / 45→46,
`examples.json` request-path rename, index/report/docs updates). HEAD's CI postman job
is red without them; they are folded into the Postman remediation commit. One
in-progress edit from that wave — `url: ""` in `11 - Polling & Lifecycle Flows
(Runner)/Flow B - README- run the flows.request.yaml` — broke every `_build` gate (the
loader requires a non-empty URL and no exporter/import support exists for empty URLs);
it was restored to the committed `url: https://developer.payway.com.kh/` value. If that
edit was intentional, the loader, exporter and import-verification need a README-style
request design first. `.postman/resources.yaml` gained Postman-app noise
(`specs: []`, written by the desktop app) — left uncommitted.

## Gate snapshot at register time (Windows, Node v24.21.0, npm 12.0.2)

| Gate | Result |
|---|---|
| `npm run check:repository` | PASS (1614 tracked paths, 11 entry documents — review re-run + second pass) |
| `npm run check:package` | PASS (127 files, 34 skills from inventory) |
| `npm run smoke:package` | PASS (npm 12 shape, 34 skills, consumer preservation — review re-run exit 0) |
| `npm test -- --maxWorkers=2` | PASS: 2,129 tests / 148 files, 0 failed (2026-10-01, after the second-pass corpus refresh) |
| Focused knowledge + package-boundary + pack-report suites | PASS 17/17 (review round had 16 passed + 1 failed; QUICKSTART staleness regenerated) |
| `npm run sync:knowledge` + knowledge tests | PASS (31 topics, provenance gates green) |
| `npm run lint` | exit 0 (2 pre-existing warnings in journal files) |
| Postman `test:yaml` (incl. the 16 distribution-scan negative controls) / `export_json --check` / `verify_index` / `verify_postman_import` / `syntaxcheck` / `validate` / `readme_path_audit` | PASS |

## Work package 6 � Public corpus (2026-10-01)

See [item 6 verification](ITEM-6-CORPUS-2026-10-01.md). D03�D07 are implemented
and offline-verified. D02 topics work in the installed package; security mailbox
ownership and monitoring remains the release-owner check. Generated corpus has
35 topics and 34 Skills, full readable guides, valid file/anchor navigation, and
a runnable simulated starter. Package/repository/consumer gates and 60 focused
tests pass. Typecheck passes; current whole-repo lint has two unrelated scaffold
test assignment-expression errors.

## Work package 8 — Remaining configuration/helper contracts (2026-10-01)

Implements remediation item 8 from REPORT.md §11 (S06/S07/S08/D09). Full fix and
evidence table: [ITEM-8-CONFIG-HELPER-CONTRACTS-2026-10-01.md](ITEM-8-CONFIG-HELPER-CONTRACTS-2026-10-01.md).

| Finding | Status | Fix and evidence |
|---|---|---|
| S06 — partner-only self-activation required merchant credentials at construction | **FIXED** | Partner credentials are now a complete credential class for CONSTRUCTION (src/client.ts `resolveConfig`); the merchant requirement is enforced where consumed — guards atop `request()`/`requestWithMerchantAuth()` throw the same `PayWayConfigError` messages before any HMAC or fetch. Partner-only clients reach the mocked `online-self-activation/new-merchant` endpoint with `partner_id`/`request_data`/`hash` and NO merchant fields; merchant-signed calls (QR plain path + payment-link merchant-auth path) still fail clearly with zero requests. 4 acceptance tests in `client.test.ts`. |
| S07 — invalid `maxRetries` (-1/NaN) became a misleading `Retry limit exceeded` with zero fetch attempts | **FIXED** | `maxRetries` (finite non-negative integer) and `retryDelayMs` (finite non-negative number) are validated at the configuration boundary with `PayWayConfigError`; zero retries constructs and makes exactly one attempt (pinned). 2 acceptance tests in `client.test.ts`. |
| S08 — noninteractive `onboard --stage <invalid>` printed a plan and exited 0 | **FIXED** | Stage validation now precedes any output in both modes: invalid stage → `agent-command/v1` machine envelope (`status: 'failed'`, `error.code: 'INVALID_STAGE'`, allowed list in `error.detail`) + exit 1 non-TTY; cancel banner + exit 1 TTY. Valid noninteractive plans are explicitly labeled `executed: false` / "Plan only — no stage was executed". Pinned in `onboard-command-seams.test.ts`. |
| D09 — bundled `mock-callback.cjs` accepted any currency, shipped literal `NaN` amounts, and exited 0 on HTTP 400 | **FIXED** | Currency (USD/KHR) and amount (finite > 0) are rejected before signing (exit 2, usage class); non-2xx handler responses now exit 1 per the shared bundled-script contract; `postJson` gained a bounded, flag-configurable timeout (`--timeout <ms>`); header + `aba-payway-hash` SKILL.md (+ byte-identical `.zcode` mirror) document the 0/1/2 contract. Acceptance: 4 pure tests (formatting/defaults unchanged, signature still verifies) + 7 process-level tests against child-hosted fixture servers (200→0, 400→1, 500→1, refused→1, hung handler `--timeout 300`→1 "timeout after 300ms", malformed amount→2, unsupported currency→2). Child→child loopback probed working 2026-10-01 (the parent-hosted restriction from `starter-e2e.test.ts` does not apply child→child; probe kept at `.scratch/loopback-probe/`). |

Gate snapshot: build/typecheck PASS; lint exit 0 (2 pre-existing journal
warnings); full offline suite **2,216 tests / 154 files, 0 failed** (2026-10-01,
Windows, Node v24.21.0, npm 12.0.2) — includes the 17 new S06/S07/S08/D09
acceptance tests.

## Work package 9 (partial) — R04 dependency disposition (2026-10-01)

R04 is CLOSED; R06 and R07 of item 9 remain open (release-engineering work on the
candidate). R04 acceptance: "production graph has no unreviewed high/moderate
findings; resulting lockfile and clean installation pass package, MCP and
application tests."

| Element | Disposition and evidence |
|---|---|
| `fast-uri@3.1.6` (HIGH — authority injection / host confusion / case normalization, via `ajv@^8`) | **FIXED in range.** `npm update fast-uri` → **3.1.8** (ajv declares `^3.0.1`; no override, no force). |
| `qs@6.15.1` (MODERATE — stringify crash / array-limit bypass / isBuffer DoS, via `express@5` + `body-parser` inside `@modelcontextprotocol/sdk`) | **FIXED in range.** `npm audit fix` deduped the tree to **qs@6.16.0** (express `^6.14.0`, body-parser `^6.15.2`). Reachability note per the audit: the MCP transport here is stdio, so the affected express/qs HTTP modes are not exposed by the shipped product; the update removes the finding regardless. |
| `ip-address@10.7.0` (MODERATE — isInSubnet family confusion / unbounded parse diagnostics, via `express-rate-limit` in the MCP SDK; advisory is NEWER than the audit report) | **FIXED in range.** → **10.7.2** (`^10.2.0`). |
| Dev graph | **Reviewed disposition.** `@redocly/cli` (devDependency, used ONLY as `npx @redocly/cli bundle …` for the OpenAPI bundle script) retained at **1.29.0**: the one remaining full-graph finding is the moderate GHSA path traversal in its `split` subcommand, which this repo never invokes. Upgrading past it is currently WORSE, not better: `1.31.1–2.33.2` carries a HIGH chain (`@redocly/respect-core` ≤ 2.51.0 → `@faker-js/faker` RCE-class + `undici` ≤ 6.28.0), and `npm audit fix` ping-pongs between those states (probed 1.34.20 → 4 high; 1.31.0 → 12 findings). Revisit when redocly ships > 2.33.2 or a fixed respect-core line. Manifest range stays `^1.25.0`; only the lockfile resolution is pinned. |

Resulting state: `npm audit --omit=dev` → **0 findings** (info/low/moderate/high/critical all 0); full graph → 1 moderate (the redocly disposition above). Clean-install acceptance: `npm ci` from the updated lockfile → build PASS → full offline suite **2,216 tests / 154 files, 0 failed** (incl. real-stdio MCP smoke and the sqlite-backend suites after the lockless `better-sqlite3 --no-save` driver was reinstalled); `check:package` 143 files / 34 skills; `smoke:package` full packed-consumer pass (ESM/CJS/declarations, CLI demo, corpus navigation, starter create/verify/fulfill, install/doctor/upgrade/remove preservation).

Operational note (recurring): every bare `npm install`/`npm ci` wipes the lockless
`better-sqlite3` driver and 24 sqlite suites SKIP — reinstall with
`npm install --no-save better-sqlite3` after any dependency operation before
counting the suite (npm 12 blocks unrelated `core-js` postinstall as before; it is
a funding script and stays blocked).

Gate snapshot (2026-10-01, Windows, Node v24.21.0, npm 12.0.2): audits as above;
build/typecheck PASS; suite 2,216/154, 0 failed; lint exit 0 (2 pre-existing
journal warnings); check:package + smoke:package PASS.

## Fifth pass — work package 7: Postman callback and recipient journey (2026-10-01)

Implements remediation item 7 (WP05/WP06/WP08/WP09/WP11) from REPORT.md §11. Collection
mechanics are executable-tested in the `test:yaml` gate; the guide/skill legs are
executable-tested in the repo suite.

| Finding | Status | Fix and evidence |
|---|---|---|
| WP05 — callback pull promotes unsigned tokens/transaction ids into operative variables and logs the token | **FIXED** | `10 - Callbacks & Webhooks → Sync webhook.site - Postman (pull callbacks)` rewritten around the SDK receiver's trust model (`computeSignatureVerdict` parity): signature channels are the `X-PayWay-Hmac-Sha512` header (object-map, name/value-array, and raw `req_headers` webhook.site shapes all tolerated) first, the classic body `hash` field second, with the stripHash concatenation rule; verdicts are `verified`/`invalid`/`unsigned` against `{{secret_key}}` (no key → `unsigned`, server parity). CoF token callbacks promote `{{pwt}}`/`{{ctid}}`/`{{token_flag}}` ONLY when signature `verified` AND `request_id` equals the session `{{request_id}}` (Link Account output) — unsigned, invalid, tampered, unrelated, or partial token callbacks never touch operative values and are named in the skip report. Unsigned payment pushbacks promote only as **lookup hints** when `merchant_ref_no`/`merchant_ref` matches the session reference; unanchored candidates park in the new `{{unverified_tran_id}}` (operative `{{tran_id}}` untouched). Tokens are never logged — masked (`<n> chars, ends …xxxx`); the full trust report lands in the new `{{callback_sync_trust}}` variable, and pm.test invariants FAIL the request visibly if operative variables ever change without their trust condition. |
| WP06 — newest-first import leaves the oldest values selected; fields can mix across callbacks | **FIXED** | The sync classifies records first, then selects the **newest complete record per category** — explicit timestamp sort when webhook.site provides one, documented API newest-first order as fallback (original index as stable tiebreaker). Each association (request_id ↔ pwt/ctid/token_flag; ref ↔ tran_id/status) is built from ONE record; incomplete token callbacks (pwt without ctid) can never win over a complete older record and are reported. Folder 09's KHQR pull got the sibling fix: a pushback imports ONLY when its `merchant_ref` equals the session `{{khqr_merchant_ref}}` — unset or mismatched references import nothing. |
| WP08 — offline-KHQR recovery guidance points to online transaction lookup | **FIXED** | Channel split everywhere the guidance appeared: guide 16's fixture-table note now says payment-link pushbacks verify via `check-transaction -t <tran_id>` while offline-KHQR notifications have no online `tran_id` at all (reconcile via `get-transactions-by-mc-ref`; `check-transaction` cannot see offline KHQR); `postman/documents/README.md` §2 carries the same two-channel procedure naming folder 09's inquiry request; the webhook-production Skill (+ byte-identical `.zcode` mirror) states the same per-channel recovery commands. `P/llms.txt`'s check-transaction fact was already correct. |
| WP09 — verdict-mode snippet not runnable; contradictory retry/trust language | **FIXED** | Guide 16's snippet is now executable as written: `await createStorage('json')` (async factory), explicit `await listener.start()` / `await listener.stop()`. The unsigned row of the semantics table says unsigned is **captured but never trusted to fulfill** (no retry implication); the capture-vs-verdict paragraph now teaches the gateway's **single best-effort delivery** (no redelivery on reject/miss) and pairs verdict mode with merchant-reference reconciliation and idempotent handlers; "redelivery storms" and "gateway may omit it on retries" are gone. Executable acceptance `src/__tests__/webhook-verdict-mode-doc.test.ts` (2 tests): a doc-drift guard pins the correct API forms and the removed false claims, and the EXACT published snippet (only `port` substituted) runs against a real listener — valid signature 200, tampered 401, unsigned 200-and-captured, stop() releases the port. |
| WP11 — collection scope overstated; Postman invisible from the root indexes | **FIXED** | Scope matrix added to `collection-index.md` ("Scope matrix (what Complete covers — and what it does not)"): 23 spec paths (22 documented + live-verified void), 46 collection requests incl. 5 doc-only pages, SDK 28-of-33 archived-spec coverage with the deliberate legacy-v1 exclusion, and the spec-derived `request-qr`/`self-activation` additions labeled NOT live-verified. The bundled spec relationship is now reproducible AND current: `npm run bundle` regenerated the stale `payway-openapi/bundled.yaml` (it predated void), the copy at `postman/specs/payway-openapi.yaml` was refreshed, and `_build/spec_parity.js` now asserts EXACT parity (23 = 23) with an emptied (kept) COLLECTION_ONLY mechanism; the specs README's stale "void is absent from the bundle" claim is corrected. `P/llms.txt` no longer claims "whole merchant API" / "all 22 documented endpoints". Postman is now a first-class route from every principal index: root README (Explore table), QUICKSTART.md (prefer-Postman callout), docs/README.md (Start Here table), and root `llms.txt` (a generated — `sync:knowledge` — Postman-collection section; the line was added to the generator so regeneration preserves it). Package-boundary constraint honored: README/QUICKSTART/llms.txt ship in the npm package verbatim and `payway-boilerplate/` is a FORBIDDEN package path, so those shared files reference the workspace by name + code path (no Markdown link), while repo-only `docs/README.md` carries the real `%20`-encoded links (validated by `check:repository`; the package link gate caught the dead-link version as a designed failure). |

New collection variables: `callback_sync_trust`, `unverified_tran_id` (127 total) — both in the
distribution scan's MUST_BE_EMPTY runtime-capture policy. New trust-gate suite
`_build/callback-import.test.js` (34 checks: newest-complete selection, timestamp/order/duplicate
fixtures, partial-payload no-mixing, verified+correlated happy path, unsigned/invalid/tampered/
unrelated/no-key refusal paths, header-shape tolerance, hint-tier and parked pushback tiers,
designed failure signal, folder-09 correlation gates, and a no-secret-in-any-log sweep) — pinned
into the CI `test:yaml` chain.

Still open for item 7 (not locally executable): the fresh Postman Desktop import/Visualizer
check of the actual sanitized distribution (owner/recipient verification), as recorded in the
audit's bounded follow-ups.

Gate snapshot: Postman `test:yaml` chain green end-to-end (46 requests / 127 variables, 0 syntax
errors, 37 KHQR sim checks, 34 trust-gate checks, 23/23 spec parity, 16 distribution-scan
negative controls), `export_json.js --check` fresh (46/69/127), `verify_index.js` ALL CHECKS
PASSED, `readme_path_audit.js` 0 unresolved. Repo: `sync:knowledge` 35 topics (guide-16/
QUICKSTART/README edits same-commit), `check:repository` 1653 paths / 11 entry docs (new
`%20`-encoded Postman links resolve), knowledge/docs/verdict-mode suites 36/36, lint exit 0
(2 pre-existing journal warnings); FULL offline suite **2,218 tests / 155 files, 0 failed**
(2026-10-01, Windows, Node v24.21.0, npm 12.0.2) incl. the package-boundary gate re-run.

## Next in the ordered plan

Work packages 1–8 are complete and R04 (item 9’s dependency disposition) is closed
— see the sections above. Remaining: the rest of item 9 (R06 publish workflow /
candidate validation, R07 generated-docs review), the fresh Postman Desktop
import/Visualizer check of the sanitized distribution, and the owner-controlled
item 10.
