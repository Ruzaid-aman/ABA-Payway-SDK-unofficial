# DX overhaul integration — 2026-09-06

The user requested one combined branch, ready for a later merge to main. Do not merge or push main as part of this task. The requested dx-po was resolved to the existing dx-p0 (zero).

## Inputs and preserved work

| Ref | Integrated source commit |
| --- | --- |
| main (unchanged baseline) | 67d9301dcab75fa872d4ec0d7b2005aa0811f264 |
| codex/dx-p0 | 6331e484f7612e19f2e1b7d88b0e15949ff7f30c |
| codex/dx-p1 | 601dcb6ddf43d0b3683bba91770f9ff9d66c3c89 |
| codex/dx-p2 | c20c6163d7a6d25547e8cdc2dfe5ffe912e646bb |

The existing c33d8c7 P0 merge was retained. Merge commits 6bc8f24 and 9cafa5e integrate P1 and P2. Follow-up integration repairs recover P0 behavior dropped by the earlier merge and preserve main's journal and payment-link additions.

Two stashes remain as backups: "dx-overhaul preserved unfinished CLI merge repair" (applied and reconciled) and "dx-overhaul preserved local example and merge notes" (only a generated example lockfile and temporary option notes). Older unrelated stashes, source branches, and worktrees are unchanged.

## Conflict and integration repairs

- Retain both journal registration and the new demo command; combine doctor route checks with advisory journal retention diagnostics.
- Restore P0 structured JSON/NDJSON, poll records, PNG output, hosted-form controls and purchase no-replay policy. Keep main's raw-JSON correlation IDs and polling exit codes.
- Keep profile and duplicate-ID diagnostics off structured stdout. Structured QR runs cannot enter the lifetime prompt. Local PNG failures preserve an accepted creation and direct callers to the existing transaction.
- Retain SQLite callback metadata migrations and optional runtime dependency loading.
- Restore public README/CHANGELOG guidance and links. Regenerate TypeDoc without internal research media; ship all 31 skills, including journal.
- Repair standalone example TypeScript options and its test command. Root lifecycle tests resolve checkout source without requiring leftover example dependencies. CI exercises distribution boundaries, the packed package, and example setup/typecheck.

## Verification

All local merge gates passed on the combined working tree:

- Build, root typecheck, and lint (210 files).
- Full Vitest with coverage: 1,484 passed, 13 skipped; 95 suites passed and one skipped.
- Coverage: statements 79.86%, branches 74.29%, functions 85.70%, lines 80.70%; all configured floors passed.
- Package boundary: 60 files, 31 skill guides; generated public docs boundary: 186 files.
- Packed consumer smoke: ESM, CJS, TypeScript declarations, CLI demo and all 31 installed skills.
- Example setup against a packed SDK, standalone typecheck, native Node TypeScript runtime startup, demo health and rendered HTML.
- Ten example lifecycle tests also passed with its local node_modules temporarily absent, proving clean-checkout test resolution.
- Git diff whitespace check, no unmerged index entries, and all input refs plus the unchanged local main baseline are ancestors of the combined branch.

Detailed local coverage output remains in the gitignored .merge-verification-final.log. The branch is ready for the requested later merge to the current local main; remote CI remains a separate gate.

## Remaining scope and limits

This integrates the supplied branch contents; it does not mark the whole DX roadmap complete. Tasks 8 (broader skill refresh) and 9 (remaining documentation/drift work) are still listed in the P1/P2 trackers. Added CI checks will run on the next pull request; GitHub CI, its secret scan and Node 20/Linux matrix have not been executed locally. Local checks use Node 22.14.0 on Windows. No live gateway transactions, publication, pushes or main merge were performed. TypeDoc succeeds with existing warning categories (unknown OpenAPI tags and unexported referenced types).

An independent review identified the doctor advisory regression, now covered and fixed; that review ended early due to workspace credit exhaustion. Integration verification and follow-up source review were completed in the primary task.
