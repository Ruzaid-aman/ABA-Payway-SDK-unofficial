# Maintenance plan

How this repo stays coherent day to day and release to release. For the one-off publish steps see the [release-readiness register](RELEASE-READINESS.md); for command-level release procedure see the [release checklist](RELEASE_CHECKLIST.md).

## Operating model

- **Single line of truth: `main`.** Feature waves run on short-lived branches or worktrees, fast-forward-merge after re-checking `main` has not moved, then delete the branch. Several agents share this checkout: check `git branch --show-current` before staging, commit only your own files, and never reset or merge another agent's branch.
- **Gates before every commit:** `npm run build` → `npx vitest run` → `npx tsc --noEmit` → `npx biome lint src skills`. Build first — CLI integration tests execute `dist/cli.js`, and a freshness guard rejects stale dist right after a checkout/merge (a failure there is not a real regression; rebuild and re-run).
- Conventional commits (`feat|fix|test|docs|chore(scope): …`). Tags, version bumps, and `npm publish` are maintainer-only actions.
- **Append-only surfaces:** `docs/SANDBOX-FINDINGS.md` sections, `audit-results/*` reports, historical HANDOFF sections, dated CHANGELOG entries — add dated sections; never rewrite.

## Per-change checklist

| You changed… | Also do (same commit) |
|---|---|
| Any gateway contract (params, hash orders, statuses, error shapes) | Grep `skills/` + the `.zcode/skills` mirror + `README.md` + the relevant docs chapter for the old shape; bump affected skills' `metadata.version`; append live evidence to SANDBOX-FINDINGS if probed |
| A knowledge-corpus source | Run `npm run sync:knowledge` — never hand-edit `knowledge/` or `llms.txt`; the freshness gate (`src/__tests__/knowledge.test.ts`) fails on drift. Sources are pinned in `scripts/knowledge-sources.mjs` (QUICKSTART, docs/README, chapters 01–20 and 22, SDK-AND-CLI-REFERENCE, quick-start 1-pager, agent guides, FIRST-PAYMENT-WALKTHROUGH, CLOSE-TRANSACTION-FINDINGS, error-codes.json) |
| Public exports or JSDoc | `npm run docs:api` and commit the regenerated `docs/api/` tree WHOLE — pages for symbols from earlier waves can sit untracked |
| Agent tool catalog | Flip the count pin + every surface in the registry below; a mutation-class tool also needs a risk classification |
| Packaged skills (add/remove) | Count pin + `skills/README.md` + root `AGENTS.md` + `.agents/AGENTS.md` + HANDOFF; keep the `.zcode/skills` mirror byte-identical |
| New hash-bearing endpoint | One shared field constant + a `HASH_ORDER_HINTS` entry + the `hash-order-hints.test.ts` drift guard — never duplicate a field list |
| New error family/codes | Constant family (`GATEWAY_CODE_HINTS`-style) + `explain` branch + `apiErrorHint` rows + `npm run gen:error-registry` + the docs/12 table |
| New CLI command | `COMMAND_GROUPS` + `REGISTERED_COMMANDS` (completions derive live from the registry) + root `AGENTS.md` canonical block + SDK-AND-CLI-REFERENCE + CHANGELOG |
| Packaging (files, exports, bin, deps) | `npm run check:package` + `npm run smoke:package` + CHANGELOG; `npm audit --omit=dev` must stay clean |
| Renumbered docs sections | Repo-wide stale-ref sweep (`grep -rn '§N\.'`) across skills + `.zcode` mirrors + sibling docs chapters + AGENTS/HANDOFF — skip CHANGELOG and audit-results (historical, don't rewrite) |

## Count-pin registry (flip all together, consciously)

| Count | Current (2026-09-14) | Pinned in — flip ALL |
|---|---|---|
| Packaged skills | 35 | `src/__tests__/skills.test.ts` (`toHaveLength(35)`), `skills/README.md`, root `AGENTS.md`, `.agents/AGENTS.md`, HANDOFF current-state, `llms.txt` (generated) |
| Agent tools (LLM REPL) | 14 | `agent-provider.test.ts` pin, `skills/aba-payway-agent/SKILL.md` + `.zcode` mirror, `skills/README.md`, `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md`, `docs/SDK-AND-CLI-REFERENCE.md`, root `AGENTS.md`, HANDOFF when cited |
| MCP catalog | 12 read-only / 17 with mutations | Compile-enforced via `AGENT_TOOL_NAMES` + catalog tests; prose pins in `docs/SDK-AND-CLI-REFERENCE.md` and root `AGENTS.md` |
| Knowledge topics | 31 | `scripts/knowledge-sources.mjs` SOURCES, root `AGENTS.md`, corpus `MANIFEST.json` (generated) |
| Test count | 2,012 passing | HANDOFF §6 gate line — refresh when you run the suite; avoid stale absolute counts anywhere else |
| Export count | check, don't hardcode | `npm run check:package` replaces a hardcoded number (RELEASE_CHECKLIST rule) |

## Cadences

**Every change** — the gates and the per-change table above.

**Every release** — full RELEASE_CHECKLIST run on the exact candidate commit; CHANGELOG `Unreleased` folded into a dated section; package.json + lockfile bumped together; HANDOFF current-state refreshed; the release-readiness register updated if any gate evidence changed.

**Monthly (or per wave)** — branch/worktree hygiene (delete merged); triage `.scratch/*/IMPROVEMENTS.md` and other backlogs (flip statuses inline or delete stale plans); `npm audit --omit=dev` clean-gate check; review the HANDOFF anti-checklist for new footguns worth adding.

**When ABA answers or changes something** — propagate per the codification map: new gateway facts → SANDBOX-FINDINGS dated section + `.agents/AGENTS.md`; new surfaces → the tables above; questions → `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` (grep the highest existing Q number first — never assume it from memory) mirrored into `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md`. When ABA shares an updated OpenAPI spec, re-run the suite-coverage audit method (`.scratch/openapi-coverage-audit/`) and treat every spec-derived endpoint (`request-qr`, `self-activation`) delta as unverified until probed — report hash drift to ABA rather than guessing.

**When the sandbox profile changes** (new merchant, enablement flips such as the token-flag 104 or payout code-32 blockers) — re-run the blocked live legs (`scripts/sandbox-probe-link-card-cycle.ts` and the payout/subscription probes), capture evidence under `test-output/`, update the findings sections and the ABA question register.

## Local state and storage

- All local stores share one data root (`PAYWAY_DATA_DIR` or the OS default): `journal.jsonl`, `linked-tokens.json`, `webhook_data/` — surfaced by `doctor --json` `.dataRoot`. `PAYWAY_FORCE_JSON_STORAGE=1` forces the JSON backends; the SQLite path activates only when the optional `better-sqlite3` peer dep is importable.
- `better-sqlite3` stays OUT of package.json (optional peer dep). To run the SQLite suites locally: `npm install --no-save better-sqlite3`.
- Never commit `.env`, profile stores, `dist/`, `test-output/`, `payway-output/`, or `webhook_data/` — `npm run check:repository` enforces the boundary; keep captured gateway data local.

## Escalation points

- **Live gateway drift** (a hash order or status behaves differently than pinned): capture evidence, document it, file the ABA question, add an advisory — never silently change a hash order; the drift-guard suites exist for exactly this.
- **Secret exposure:** follow [SECURITY.md](../../SECURITY.md); history decisions belong to the maintainer via [HISTORY-SECRET-TRIAGE.md](HISTORY-SECRET-TRIAGE.md).
- **Internal-dossier boundary:** SANDBOX-FINDINGS, INTEGRATION-GAPS, audit dossiers, and PROJECT_STATUS are deliberately NOT packaged into the knowledge corpus — keep them out of `scripts/knowledge-sources.mjs` and the npm `files` allowlist.
