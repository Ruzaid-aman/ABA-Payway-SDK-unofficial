# Full Audit — CLI + SDK + Skills (main @ 74b4fa5, 2026-09-12)

Six parallel audit agents: CLI surface, SDK surface, agent skills, docs/onboarding,
prior-backlog consolidation, repo health/runtime. Load-bearing claims were
spot-checked against live code (marked ✅ below). Tree audited as-is (~71 uncommitted
entries from concurrent agents). Node v24.21.0, npm 12.0.2.

## Health snapshot

| Check | Result |
|---|---|
| Build (tsup ESM+CJS+DTS) | ✓ 6.1s, 0 errors |
| Typecheck / Lint (biome) | ✓ clean / 0 err, 0 warn |
| Tests (vitest, hermetic) | ✓ **1805 passed / 0 failed / 116 files**, wall 24.4s |
| CLI `--version` / `--help` | ✓ 1.5.0 / ~1.7–3.2s startup (tsx) |
| `npm pack --dry-run` | ✓ 640.9 kB, 66 files, no junk |
| `npm audit --omit=dev` | ✓ 0 vulnerabilities |
| Skills sync (`skills/` ↔ `.zcode/skills/`) | ✓ 32 dirs byte-identical |

Verdict: the platform is healthy — no rot, no failing gates. What remains is a short
list of contract breaks, missing "agent doors", and publish blockers.

## Verified contract breaks (Tier 0 — fix first, all S effort)

1. **`generate-checkout` has no `-y` flag, but AGENTS.md:113 tells agents to always pass it.**
   ✅ Verified live: `error: unknown option '-y'`. Every agent following the canonical doc
   hard-fails every checkout call. Fix: add `-y/--non-interactive` (mirror generate-qr at
   src/cli.ts:2294) or fix AGENTS.md. No packaged skill repeats the error.
2. **`--json` error envelope is not a real contract — 5 command groups bypass it.**
   exchange-rate (cli.ts:2095), payout (3794 + 4 local validations 3751–3782),
   get-transactions-by-ref (no `--json` flag at all, 1399–1402), pre-auth
   complete/complete-payout/cancel (4499, 4570, 4631). Envelope helpers exist (308–347);
   route these through them.
3. **`--lifetime` means seconds on generate-qr (min 180) but minutes on generate-checkout
   (min 3).** ✅ Verified via help output. Classic silent 60× mistake between sibling
   create commands. Fix: rename to `--lifetime-minutes` (keep alias) + doc sweep.
4. **Log redaction drops the key hint when recursing arrays** (src/utils.ts:727
   `value.map(item => sanitizeValue(item))` loses `keyHint`), so `{hash:["<40-hex>"]}` is
   not masked. Security-adjacent; fix is small.
5. **`PayWayAPIError` lacks `correlationId`** — the documented join key into the journal
   only exists on a racy per-client getter (`payway.lastCorrelationId`). Thread it into
   `createHttpError`/`createNetworkError`.
6. **`aba-payway-test-harness/SKILL.md:25` says `payway-sdk demo # run the suite`** —
   `demo` starts a localhost web server; the suite runner is `test`. Misleads agents in CI.
7. **AGENTS.md points at `CONTEXT.md` + `docs/adr/` which do not exist** ✅; and its
   canonical-commands ```sh fence is full of PowerShell `$env:…` lines — POSIX agents
   paste and fail.
8. **HANDOFF.md:50 stale numbers** ("skills now number 29 on disk", "1280 tests") vs
   reality (32 skills ✅, 1805 tests). HANDOFF also contradicts itself on payment-link-void
   merge state within the same file.

## CLI findings (agent-verified live)

Inventory: 37 top-level commands / ~47 subcommands (live help renders ~40 entries).
Everything in AGENTS.md's canonical block exists — no phantom docs. Reverse gap: 13
commands (`tx-batch`, `exchange-rate`, `demo`, `test`, `agent`, `ask`, `config`,
`profiles`, `status`, `validate`, `onboard`, `get-transactions-by-ref`,
`sandbox-test-cards`) absent from the canonical block.

- P1: documented `-y` on generate-checkout doesn't exist (above).
- P1: `--json` envelope gaps (above).
- P1: `--lifetime` unit split (above).
- P2: self-activation subcommands leak into root help (registered via
  `program.command()` then `addCommand`, commander doesn't detach — cli.ts:4645+).
- P2: short-flag traps: `-t` = tran-id in 10 commands but title in payment-link create;
  `-r` means 3 different things; `-y` = `--force` in 4 commands but `--non-interactive`
  in 2.
- P2: `check-transaction --bogus x` reports the *required option* error, never naming
  the unknown flag; "Did you mean" only works for commands, not options.
- P2: `validate -t abc -a 0` prints a min-length warning then "✓ valid" in the same run.
- P2: no shell completions; doctor/config/status lack `--json`.
- P2: human-mode errors go to stdout, not stderr (only machine modes are pure).
- P3: `classifyError` maps any non-PayWay Error (e.g. TypeError) to kind "validation" —
  bugs mislabeled as user error. Dual JSON convention on generate-qr (`--output` only).
- Good: exit codes 0/1/2/3 documented and enforced; pre-flight credential checks with fix
  instructions; per-code hint table; duplicate-tran_id warning; TUI correctly TTY-gated.

## SDK findings

Shape: one real entry class `PayWay` with 8 domain sub-clients — but also a second
overlapping facade (`sdk`/`server`/`client`, "Module 1/2/3") and the full test-harness
suite in the same root namespace (~140 exports from index.ts).

- P1: three overlapping entry points; nothing tells a newcomer which to adopt. `client`
  is a browser-only presenter exported from a "run server-side" SDK;
  `openImageInDefaultViewer` is CLI-harness surface.
- P2: mock-server/test-harness machinery is public root API — belongs behind
  `/testing` subpath; every export is a semver commitment.
- P2: `gatewayDayWindow` (utils.ts:227) used by CLI + pinned by tests but not exported;
  credential-profile store (`src/config/profiles.ts`) has zero exports — embedders must
  reimplement APPDATA path logic.
- P2: version story incoherent: package.json 1.5.0 + CHANGELOG "released" 1.0–1.5
  entries vs README "preparing its first public release"; duplicate `## Unreleased`
  (lines 3, 784) and `## 1.3.0` (788, 917) headings.
- P2: no `sideEffects: false` (bundle has ajv/qrcode/commander runtime deps), no
  `./package.json` subpath export; bin name `payway-sdk` ≠ package name.
- P3: `PollingAbortedError`/`PayWayWebhookError` report `type: 'config_error'`;
  `createTransaction` returns weak `Record<string, unknown>` while every other domain
  has generated OpenAPI types; docs document only 7 of ~14 PAYWAY_* env vars.
- Good: strict TS, exactly one commented `as any`, zero ts-ignore; honest
  JSON-or-string unions; excellent error class otherwise (`paywayCode`, `retryable`,
  `fieldErrors`, `toJSON`); docs examples enforced by tests against the real surface;
  profiles written 0o600 atomic; private-host guard.

## Skills findings

- Trees in sync (byte-identical 32 dirs, parity test enforced). Frontmatter/structure
  strong (unique trigger descriptions, metadata.version, avg 81 lines).
- P1: test-harness `demo`/`test` mixup (above).
- P2: 7 skills carry backtick prose references to `docs/…` files that don't exist in an
  installed bundle (agent, first-payment, hash, payment-link, refund,
  sandbox-beneficiaries, sdk-configuration). No hyperlinks into docs/ (rule honored),
  but prose pointers still dead-end agents.
- P2: coverage gaps vs the CLI: **self-activation has zero skill coverage**;
  sandbox-test-cards, profiles, status/validate/config also uncovered.
- P3: installed skills carry no visible version stamp (only the manifest JSON);
  `removeSkills` writes a stray manifest on no-op; doctor misreports read errors as
  "directory missing"; skills/README.md has a duplicate section (101–104).
- Good: command examples in 8 sampled skills all match the live CLI 1:1, including the
  COF per-endpoint flag shapes and the lifetime units trap.

## Docs & onboarding findings

- Human path is strong: README is honest (unpublished, plaintext-profile risk),
  QUICKSTART covers both shells + failure table; docs/README.md is a real index; 14/14
  sampled internal links resolve; sampled current docs (03/11/13/17) match the
  2026-09-12 relay facts.
- P1: split-brain agent onboarding — AGENTS.md is the de-facto machine index but
  zero references to it from README/QUICKSTART/docs/README; it points at nonexistent
  CONTEXT.md/docs/adr; PowerShell-in-sh-fence.
- P1: no `llms.txt`/`llms-full.txt`, no MCP config sample (both already scoped as
  Wave-2 in HANDOFF). `docs/error-codes.json` and `payway-openapi/openapi.yaml` exist
  but aren't surfaced at stable consumer paths.
- P2: README lacks badges/demo artifact; absolute github.com links unverifiable (no
  remote configured); `docs/SDK-AND-CLI-REFERENCE.md` CLI table omits `tx-batch`,
  `pre-auth`, `sandbox-beneficiaries`, `sandbox-test-cards`.
- P2: multi-language coverage token-only: 2 PHP webhook receivers + Flutter/Android/iOS
  snippets; zero Python/Java/C#/Go create→verify→fulfill quickstarts.
- P3: two credential-invocation cultures (`npm exec -- payway-sdk` vs
  `npx tsx src/cli.ts` + TLS workaround) never cross-referenced.

## Repo health findings

- P2: ~71 uncommitted entries on main (docs/skills/AGENTS/HANDOFF from concurrent
  agents) — single-machine loss risk; land it.
- P2: CLI-integration suites dominate test time (~66s of 123.9s cumulative; cli.test.ts
  21.5s, dx-contract 20.3s, agent-cli 14.8s) — each spawns the full CLI. Batch through
  the exported `runCli` in-process where a real subprocess isn't needed → ~50% off.
- P3: npm-12 emits `npm notice run …` on stderr for every `npx tsx` invocation —
  phantom noise for scripted consumers; document `npm i -g` / direct dist/cli.js for
  agents. Lint covers `src/` only — shipped `skills/*/scripts/*.cjs` are unlinted.
  `yaml` exact-pinned 2.9.0 (no caret). Coverage thresholds configured in
  vitest.config.ts but only under `test:coverage` — verify CI wires it.
- Good: 4 TODO markers in src, all deliberate; .gitignore correct; zero committed
  secret files.

## Prior backlog consolidation (already-recorded open items)

Top open items from .scratch/, audit-results/, HANDOFF, RELEASE-READINESS:
- **A-1 MCP server** — largest remaining competitive gap vs Stripe/Razorpay.
- **A-2 llms.txt + `docs <topic>` command** — "an afternoon".
- **A-3 uniform `nextAction` in JSON envelopes** — partial (new commands only).
- **Publish blockers**: 275 tracked paths rejected by `check:repository`
  (payway-boilerplate 225, test-logs 36, test-output 13, webhook_data 1); history-secret
  disposition (36 occurrences/19 values + rotation); redistribution review; remote CI;
  bin-name decision (`payway-sdk` squatted).
- **C1** generate-checkout non-TTY QR PNG save (agent DX); **C3** checkout-form
  `--payment-gate` flag; **D-3** shell completions; **O-1** `journal watch`; **O-2**
  global `--log-level`; **D-2** update check.
- **Response typing**: payout (8 documented fields) flagged highest-value; pre-auth
  complete/cancel + beneficiary.
- **S5** surface registry (`docs/SYNC-SURFACES.md` + drift-check script) — kills the
  recurring drift class mechanically.
- **F12** skill behavior harness (phrase tests pass while examples fail) + entrypoint
  context reduction (16,102 words, zero `references/`).
- **F-A/F-B** webhook one-liners (matchedTransactionId null; no storage field in list).
- Purchase docs D1–D5 (scan window, rendering matrix, W5-5/6/13 semantics).
- ABA-blocked (external): open question register Q3–Q40 subset, spec-error filing,
  sandbox key rotation, prod base URL, subscription profile, mc-ref 404, void prod
  liveness.
- I-9/I-10/I-11, TD-07/TD-08/TD-11: deferred P3 polish.

## Prioritized high-value roadmap ("developer's favourite" lens)

**Tier 0 — contract breaks + trust (this week, all S):**
1. `-y` on generate-checkout (or fix AGENTS.md) — unblocks every documented agent flow.
2. `--json` envelope on the 5 bypassing command groups — make the contract real.
3. `--lifetime` unit fix (`--lifetime-minutes`) + doc sweep.
4. sanitizeValue keyHint-through-arrays redaction fix.
5. correlationId on PayWayAPIError.
6. test-harness skill demo→test; AGENTS.md dead pointers + POSIX fence; HANDOFF
   stale counts (29→32 skills, 1280→1805 tests) + void merge-state contradiction.
7. Land the uncommitted work on main (trivial, protects ~40 files).

**Tier 1 — agent doors (the differentiator, S→M):**
8. llms.txt + `payway-sdk docs <topic>` (A-2) + README/docs links to AGENTS.md.
9. MCP server (A-1) — the standard agent door; biggest competitive gap.
10. `nextAction` in all JSON envelopes (A-3) + doctor/status `--json` + shell
    completions (D-3) + global `--dry-run` printing the signed request.
11. Fix self-activation help leak; flatten short-flag traps (`-t`/`-r`/`-y`).

**Tier 2 — credibility & publish (M):**
12. Release blockers: untrack 275 paths, history-secret disposition, CHANGELOG dedupe
    + first-publish version decision, `sideEffects:false` + `./package.json` export.
13. S5 surface registry + drift-check test (stops the #1 recurring audit finding).
14. Eliminate docs/ prose pointers in 7 skills (+ test); add self-activation and
    sandbox-test-cards skills; F12 behavior harness; visible version stamp on
    installed skills.
15. SDK surface split: subpath exports `/testing` `/journal` `/webhook`; export
    gatewayDayWindow + profiles API; mark `sdk` facade legacy; one canonical entry.
16. Payout + pre-auth response typing.

**Tier 3 — growth (L):**
17. Python + PHP (then Java/C#) create→verify→fulfill quickstarts.
18. Test-suite speedup via in-process runCli batching.
19. README polish: badges, demo asciicast; verify absolute links once remote exists.

## Learnings (systemic themes)

- **Surface drift is the recurring failure mode** (AGENTS.md `-y`, HANDOFF counts, 7
  skills' dead docs/ pointers, SDK-REFERENCE missing commands). The class is mechanical:
  a drift-check test/registry (S5) + contract tests for doc claims beats repeated audits.
- **The agent-first positioning is real but the machine doors are missing** — journal,
  --json, -y, TUI gating are excellent; llms.txt/MCP/README→AGENTS.md discovery are not
  built. The gap is discoverability, not substance.
- **Contracts promised in prose must be enforced by tests** (error envelope, -y
  guidance, docs-examples pattern already proves this works — extend it to AGENTS.md
  canonical commands and skills).
- **Baselines are excellent**: 1805 green, clean build/lint/pack/audit, strong typing,
  zero committed secrets — remaining work is polish and doors, not repair.

## Method notes

- Six agents: CLI, SDK, skills, docs, backlog-consolidation, health/runtime.
- CLI + spot-checks executed live (help text, unknown-option probes); no live API calls;
  no git state changes; no file modifications by agents.
- Could not verify: interactive TUI paths (non-TTY), live API error paths, packed-tarball
  install smoke, absolute github links (no remote), coverage % (thresholds configured).
