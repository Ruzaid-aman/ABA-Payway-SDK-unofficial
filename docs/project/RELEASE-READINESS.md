# Open-source release readiness — manual-actions register

Status: **documentation, packaging, and automation are publish-ready; publication is gated on the maintainer decisions and actions below.** Last reviewed: **2026-09-14**.

This file is the register of actions that only the maintainer can take (decisions, accounts, remotes, publication). The command-level release procedure lives in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md); ongoing upkeep after launch lives in [MAINTENANCE.md](MAINTENANCE.md). Nothing below is executed by agents — tags, pushes, history rewrites, and `npm publish` are maintainer-only.

## Green gates (verified locally, 2026-09-14)

| Gate | Result |
|---|---|
| `npm run check:repository` | PASS — 1,317 tracked paths, 11 entry-point documents, no captured/generated/private files tracked. The 275-path tracked-artifact backlog reported on 2026-09-08 is **resolved**. |
| `npm run check:public-docs` | PASS — 239 generated files checked. |
| Offline suite / typecheck / lint / build | Suite 2,012 passed / 14 skipped (2,026 total; skips are the gated sandbox-contract tests), 145 files — with build + `tsc --noEmit` + `biome lint src skills` green (7 pre-existing lint warnings in src, all fixable, none introduced by docs) — 2026-09-14. |
| npm package name `aba-payway-ts` | **Free** (registry.npmjs.org 404, checked 2026-09-14). Re-verify at release time. |
| npm package name `payway-sdk` | **Squatted** by an unrelated Argentine-PayWay SDK (`lefcott`, v1.1.1, last published 2024-06-26). The README/QUICKSTART "avoid bare `npx payway-sdk`" warnings are accurate and must stay. |
| CLI modernization v1.6.0 campaign | Complete — Phases 1–4 merged to `main` (tip `72395f2`, 2026-09-13). Package version still at the unpublished `1.5.0` baseline. |
| Secret history triage | Recorded in [HISTORY-SECRET-TRIAGE.md](HISTORY-SECRET-TRIAGE.md): 36 occurrences of 19 values across 217 commits after exclusions. Current-source scans clean; **history disposition still open** (item A). |
| Hosted CI | Workflows exist under `.github/workflows/` but have **never run on a remote** — no git remote is configured. |

## Manual-actions register (owner: maintainer)

Work A → I in order: A–C decide what the public artifact even is; D–F provision the surfaces; G–H execute the release; I follows through.

### A. Git-history + public-tree disposition — DECISION REQUIRED

The local history (346 commits, ~11.7 MiB pack) contains 36 occurrences of 19 secret values across 217 commits (triage above), and the tracked tree contains internal material a stranger should not need: `docs/SANDBOX-FINDINGS.md`, `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md`, `audit-results/`, `docs/HISTORY-SECRET-TRIAGE.*`, `HANDOFF.md` internals, competitive analyses, `payway-openapi/` (ABA's shared spec), and `docs/archive/`. The npm package already excludes all of these (the knowledge corpus is curated separately); repo visibility is a separate decision.

Options:

1. **Fresh public history (recommended).** Create the public repo from a fresh orphan commit of a curated tree; keep this checkout as the private development line. No history surgery, no rewrite risk; the secret triage closes as "never published". Internal dossiers stay local.
2. **Publish this history as-is** (private repo, or public with the triage dispositions executed first). Requires item B to be thorough and owner dispositions for every triage finding.
3. **History rewrite** (`git filter-repo` per the triage CSV) then publish. Highest effort/risk; only worth it if inline history has value to the public.

DoD: written choice recorded here; if (1), the curated-tree file list is agreed; if (2)/(3), every triage finding has an owner disposition (rotate/revoke where the owner says so).

### B. Redistribution & identity review — DECISION REQUIRED

MIT on this project does not license third-party material. Before public visibility: confirm rights or exclude `payway-openapi/` (ABA's shared spec — ask ABA), `docs/archive/` official-doc copies, quotes/screenshots inside competitive analyses, and `payway-boilerplate/` remnants if any survive in the chosen tree. Also confirm the `Antigravity <info@antigravity.dev>` author identity and `security@antigravity.dev` domain are intended for the public package. DoD: per-item disposition (publish / exclude / permission on file).

### C. Destination repository — ACTION

`package.json` points at `github.com/antigravity-google/aba-payway-ts`. Create/confirm that org and repo (or change the metadata first), then:

```bash
git remote add origin <destination-url>
git push -u origin main        # per the item-A disposition
```

Enable branch protection on `main`, secret scanning + push protection, and the GitHub Actions workflows. DoD: remote configured; hosted CI green on the candidate commit (local Windows results do not substitute).

### D. Security mailbox — ACTION

SECURITY.md publishes `security@antigravity.dev`. Confirm the mailbox exists, is owned, and is monitored before launch (the checklist tracks this precondition). DoD: confirmation recorded; SECURITY.md updated if the address changes.

### E. Version selection — DECISION REQUIRED

Repo policy (`VERSIONING.md`, SUPPORT.md) says the Node 22.12 floor is a breaking change requiring a **new major** release, and no version has ever been published (no installed base). Recommendation: **`2.0.0`** — it follows the repo's own versioning rule and leaves headroom. `1.6.0` is defensible if you prefer campaign continuity with the CLI-modernization label, but do not reuse `1.5.0`. DoD: version chosen; package.json + lockfile bumped together; CHANGELOG `Unreleased` folded into a dated section; the two "preparing first release" notes in README and QUICKSTART flipped.

### F. npm publisher setup — ACTION

1. npm account with 2FA for `aba-payway-ts` (name verified free 2026-09-14 — re-check at release time).
2. Prefer [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC + provenance) wired to the tag workflow from the checklist; otherwise a granular automation token stored in CI secrets.
3. Keep the `payway-sdk` squatting fact in mind: the bin name is fine (it ships with this package), but bare `npx payway-sdk` resolves elsewhere — README/QUICKSTART warnings stay until npm transfers/removes that package.

DoD: publish path rehearsed (CI workflow or manual), provenance configured.

### G. Release candidate — ACTION (gated on A–F)

Run the full [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) on the exact candidate commit: clean checkout, build, full suite, typecheck, lint, `docs:api`, `check:package`, `check:public-docs`, `check:repository`, `smoke:package`, example smoke, hosted CI green. Then create the immutable tag (tag creation requires this explicit authorization step — never move existing tags). DoD: candidate commit SHA + tag recorded here.

### H. Publish — ACTION

`npm publish` per the checklist path (trusted publishing preferred). Then verify in a fresh consumer: ESM/CJS/types import, `npm exec -- payway-sdk --help`, `payway-sdk demo --check`, skills installer from the installed package, `docs list`, `mcp --list-tools`. Verify provenance on npmjs.com. DoD: version live, provenance badge visible, smoke results recorded in the checklist.

### I. Post-publish follow-through — ACTION

- Pin README/QUICKSTART/docs links from `blob/main` to the release tag (README §"Documentation links" note marks this as a release step).
- Flip remaining "preparing its first public release" / "until the package is published" language (README, QUICKSTART, skills/README, SUPPORT.md).
- Announcement channels of your choice; consider a heads-up to the ABA integration team (they relayed Q&A that shaped the docs) and listing the `llms.txt` / MCP server in agent-tool directories.
- Record the launch date in [PROJECT_STATUS.md](PROJECT_STATUS.md) and HANDOFF current-state.

## Historical evidence (superseded)

2026-09-08 audit-closure pass: build/typecheck/lint/package/docs/repository boundaries, packed smoke (61 files / 32 skills at the time), clean-install snapshot, secret-scan negative controls, offline coverage 79.97/74.51/85.73/80.79 — see the closure record in `audit-results/merged-remediation-review-2026-09-08/CLOSURE.md`. Its blocker list (275 tracked artifact paths) is resolved as of 2026-09-14.
