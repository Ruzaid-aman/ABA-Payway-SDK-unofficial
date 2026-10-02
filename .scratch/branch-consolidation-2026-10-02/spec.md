# Branch consolidation & `codex/payway-integration-skills` merge plan

**STATUS (2026-10-02):** PLAN ONLY — nothing merged, nothing pushed. Analysis complete;
awaiting approval to execute Phase 0.

Date: 2026-10-02. Scope: decide how to merge and combine the repository's four local
branches. Sources: live `git` inspection (`branch -a`, `merge-base`, `rev-list`,
`merge-tree --write-tree`, `ls-tree`, `rev-parse` per-blob), `git status`,
`package.json` scripts, `scripts/sync-knowledge.mjs`, `scripts/generate-guide-stubs.mjs`,
`src/__tests__/knowledge.test.ts`, `scripts/check-repository.mjs`.

Not a code change — an analysis + ordered execution plan. Every claim below was
verified against the object database, not inferred from commit messages.

---

## 1. Branch inventory

| Branch | vs `main` | Merge status | Action |
|---|---|---|---|
| `main` (`057d94d`) | — | merge target | merge into; **do not push** |
| `origin/main` (`f4de67c`) | `main` is **+30 ahead** | — | publish later, out of scope |
| `docs-reorg/phase-2-finish` (`c33be68`) | 0 ahead / 44 behind | **fully merged** | delete |
| `docs-reorg-plan` (`557ad88`) | 0 ahead / 52 behind | **fully merged** | delete |
| `codex/payway-integration-skills` (`62afa12`) | **+2 / −6** | unmerged | **merge** |

`git branch --merged main` reports only the two `docs-reorg/*` branches as merged;
`--no-merged` reports only `codex/payway-integration-skills`.

`codex` carries 2 commits: `24dbb4a feat(skills): add portable PayWay merchant
integration skill` and `62afa12 Enhance PayWay integration skill and durable recipes`,
spanning 225 files (+35,739 / −152) against the merge base.

Branch heads are all authored by `Ruzaid-aman`. There are **no stashes**. The `codex`
branch is checked out in a second worktree at
`~/.codex/worktrees/payway-integration-skills/SDK-prepration` (from the commit message:
"Isolated checkout from reviewed `main` at `1b491f9`; original working edits
preserved").

---

## 2. Findings

### 2.1 The merge is nearly clean — 3 conflicts, all resolvable

`git merge-tree --write-tree main codex/payway-integration-skills` reports **14
auto-merged paths and exactly 3 conflicts**:

- **`CHANGELOG.md`** — both sides prepend a new entry under `## Unreleased`. Purely
  additive: codex adds *"Merchant integration skill candidate (2026-10-01)"*; main
  adds the dependency-audit entries. Keep both.
- **`HANDOFF.md`** — same shape. Main contributes the R04 dependency disposition and
  the Item 8 config/helper contracts record; codex contributes the integration
  enhancements, the additional-requirements review, and the skill-candidate record.
  All are appended bullets; keep all of them.
- **`knowledge/MANIFEST.json`** — **generated**. Never hand-merge it; resolve with
  `git checkout --theirs` and regenerate in Phase 2.

### 2.2 No `src/` drift between the two sides

The 6 commits on `main` after the merge base (`1b491f9`) do **not** touch `src/config/`
or `examples/`:

```
git diff --name-only 1b491f9 main -- src/config/ examples/   # → empty
```

`codex`'s only non-test source changes are `src/config/templates/express.ts` and
`src/config/templates/nextApp.ts` (18 insertions / 18 deletions each), and they
auto-merge. Main's recent DX-audit work (`c21962a` C1 exports/types + C2 `--json`
stdout purity; `057d94d` Phase 2 M5/M6/M8/M11/M12) touches different surfaces. So the
stale-base risk that usually bites a 6-commit-behind branch does not apply here.

### 2.3 `.zcode/skills/` duplication is generated, not accidental

`.zcode/` is **already tracked on `main`** (79 files), so mirroring into it is existing
repo convention, not something `codex` introduces. Per-blob comparison on the branch
tip: of 128 files under `.zcode/skills/`, **96 are byte-identical** to their
`skills/` counterparts.

`codex` adds 53 files to `.zcode/skills/aba-payway-integration/`, 1 each to
`.zcode/skills/aba-payway-first-payment/` and `.../aba-payway-customer-qr/`, plus 2
modifications.

The 32 files that differ from their `skills/` counterpart are **pre-existing
third-party vendored skills** — `agents-sdk`, `code-review`, `sandbox-sdk`,
`setup-matt-pocock-skills` — and were **not** added by `codex`.

The mechanism is explicit in `scripts/sync-knowledge.mjs`, which after generating the
skill also mirrors it:

```js
const canonicalSkill = path.join(repoRoot, 'skills/aba-payway-integration');
const mirrorSkill    = path.join(repoRoot, '.zcode/skills/aba-payway-integration');
if (path.dirname(mirrorSkill) !== path.join(repoRoot, '.zcode/skills'))
  throw new Error('Unsafe skill mirror root');
rmSync(mirrorSkill, { recursive: true, force: true });
```

So both copies are build output, refreshed by `npm run sync:knowledge`. Do not
hand-edit either.

### 2.4 ⚠️ `main` carries a real committed docs defect (14 files)

**14 files under `docs/guides/` have a self-referential generated header** — the stub
header sitting *inside the guide it claims to be a copy of*:

```html
<!-- GENERATED STUB: copy of docs/guides/11-callbacks-and-webhooks.md for compatibility. Do not edit here. -->
```

Affected (14): `docs/guides/` `01-overview-and-concepts`, `02-prerequisites-and-setup`,
`03-web-implementation`, `04-native-app-implementation`, `05-webview-implementation`,
`07-qr-code-handling`, `08-deep-linking`, `09-link-unlink-renew-lifecycle`,
`11-callbacks-and-webhooks`, `12-error-handling-and-debugging`,
`13-deployment-checklist`, `14-appendix-code-snippets`, `16-webhook-setup-guide`,
`19-customer-module-qr`.

Introduced by `e28dd35 docs(reorg): fix inbound links to new docs paths` (already on
`main`). The 22 root-level `docs/NN-*.md` stubs carrying that header are **correct and
expected** — a stub should be marked as one.

### 2.5 The working tree is an unfinished fix for that defect

38 tracked files are modified and uncommitted. The change is coherent and targeted:

- strips the bogus header from the 14 corrupted guides;
- rewrites the 22 root stubs to a single honest header
  (`<!-- Mirrored from docs/guides/NN-….md — edits belong there; regenerated by
  scripts/generate-guide-stubs.mjs -->`);
- adds a new untracked generator, `scripts/generate-guide-stubs.mjs`.

**The generator's own docblock promises a gate that does not exist:**

> `src/__tests__/guide-stubs.test.ts` fails when a stub drifts from its guide or a
> source leaks a generated header.

`Test-Path src/__tests__/guide-stubs.test.ts` → `False`. `git grep guide-stubs main`
returns nothing. So the migration currently has **no drift gate at all** — the exact
class of surface drift `src/__tests__/knowledge.test.ts` was written to eliminate.

### 2.6 ⚠️ Ordering constraint

`codex` edits guides `11`, `12`, `13`, `19` — **all four inside the corrupted set** —
and also edits the root stub `docs/12-error-handling-and-debugging.md`. Five files are
both dirty in the working tree and touched by the branch:

```
docs/12-error-handling-and-debugging.md
docs/guides/11-callbacks-and-webhooks.md
docs/guides/12-error-handling-and-debugging.md
docs/guides/13-deployment-checklist.md
docs/guides/19-customer-module-qr.md
```

Because the root stubs are mirrors of the guides, **stubs must be regenerated after the
merge, never before.** Committing the Phase 0 fix first, then merging, then
regenerating is the only ordering that leaves all three artifacts consistent.

### 2.7 Two apparent discrepancies that are NOT problems

Recorded so they are not re-investigated:

- **Guide titles look changed (`—` → `-`) in `Get-Content` output.** False alarm. It is a
  PowerShell console encoding artifact: the byte dump shows `E2` (the UTF-8 lead byte of
  `—`, U+2014), and `git diff --unified=0` on
  `docs/guides/11-callbacks-and-webhooks.md` shows a single deleted line (the header).
  Titles are untouched.
- **The generated corpus is large.** `knowledge/`, `llms.txt`, `docs-packaged/`,
  `skills/aba-payway-integration/` and its `.zcode` mirror are all generated by
  `npm run sync:knowledge`, and `src/__tests__/knowledge.test.ts` fails on both
  source-drift and hand-edit. Never resolve generated-file conflicts by hand.

---

## 3. Execution plan

### Phase 0 — Land the docs fix as its own commit, with its gate

Do this **before** the merge so the branch never merges into a dirty tree. It is worth
doing even if the merge is deferred, because it repairs a defect live on `main`.

**0.1 — One-character fix to `scripts/generate-guide-stubs.mjs`.** `headerFor()` emits
an ASCII hyphen:

```js
`<!-- Mirrored from docs/guides/${name} - edits belong there; regenerated by scripts/generate-guide-stubs.mjs -->\n\n`
```

but the 22 committed stubs use an em-dash `—`. Align the **script to the stubs** so the
generator is a no-op against the current tree (chosen over the reverse because it means
zero file churn; the repo has no prior em-dash convention in generated headers — the
previous format used a colon).

**0.2 — Write `src/__tests__/guide-stubs.test.ts`** with the cases the docblock names:

- stub body === `headerFor(name) + guideBody`, verbatim (**drift detector**);
- exactly one header line, then one blank line, then the body (no nested/duplicated
  header);
- **no file under `docs/guides/` carries a generated header** — the regression guard for
  the §2.4 corruption;
- orphan stub (a `docs/NN-*.md` with no `docs/guides/` source) fails, mirroring the
  script's `exit 1`;
- unmirrored guides are **listed, not failed** (by design — e.g.
  `docs/guides/23-close-transaction.md` has no root stub since `51d476b`).

**0.3 — Verify and commit.** `node scripts/generate-guide-stubs.mjs` must report **0
files rewritten** (today it would rewrite all 22). Then commit the 14 de-corrupted
guides, 22 stub headers, the generator, and the test as one commit.

### Phase 1 — Merge

```bash
git merge --no-ff codex/payway-integration-skills
```

Resolve the 3 conflicts per §2.1 — keep both sides' `CHANGELOG.md` and `HANDOFF.md`
entries; `git checkout --theirs knowledge/MANIFEST.json` and regenerate.

### Phase 2 — Regenerate, don't hand-resolve

```bash
node scripts/generate-guide-stubs.mjs   # folds codex's guide edits into the 22 stubs
npm run sync:knowledge                  # knowledge/, llms.txt, docs-packaged/,
                                        # skills/aba-payway-integration/, .zcode mirror
```

`git status` must then show no unexpected drift.

### Phase 3 — Verify

```bash
npm run typecheck
npm run lint
npm test
npm run check:package
npm run check:public-docs
npm run check:repository
npm run check:secret-allowlists
npm run smoke:package
```

- **Baseline:** `main` is **2,216 tests / 154 files, 0 failed**; `codex` claims
  **2,249 / 157**. Expect ≥ 2,249 after the merge.
- **Footgun (from `HANDOFF.md`):** `npm ci` / `npm install` wipes the lockless
  `better-sqlite3` driver, so **24 sqlite suites silently SKIP** and the count looks
  fine. Re-run `npm install --no-save better-sqlite3` before trusting the total.

### Phase 4 — Cleanup, no push

- Delete `docs-reorg-plan` and `docs-reorg/phase-2-finish` (both verified fully merged).
- Remove the second worktree:
  `git worktree remove ~/.codex/worktrees/payway-integration-skills/SDK-prepration`.
- Add `.scratch/publishing-dx-audit-2026-09-29/{api-docs,profile-probe}/` and the
  `resume-cli-*` probe files to `.gitignore`; leave them untracked. Safer than
  committing, because `scripts/check-repository.mjs` already fails on tracked
  generated/private paths.
- **Stop before `git push`.** `main` will hold ~32 unpushed commits; publishing is the
  user's call.

---

## 4. Open items / decisions

1. **Publication gates remain open.** `codex`'s own `HANDOFF.md` entry records "no
   push/tag/publication", agent trials incomplete, Claude trials user-deferred, and
   "existing owner/hosted/runtime publication gates remain open". Merging this is a
   *candidate landing*, not a release.
2. **`main` is +30 unpushed.** Two options: push the 30 existing commits first so the
   merge lands as an isolated, revertible push; or push everything together. Deferred —
   this plan does not push.
3. **Third-party skills under `.zcode/skills/`** (`agents-sdk`, `code-review`,
   `sandbox-sdk`, `setup-matt-pocock-skills`) are vendored and pre-existing, 32 files
   that intentionally differ from `skills/`. Out of scope; flagged only so they are not
   mistaken for merge fallout.
4. **Scratch audit artifacts** (`.scratch/publishing-dx-audit-2026-09-29/api-docs/`,
   `profile-probe/`, `resume-cli-probe.mjs`, `resume-cli-evidence.json`) stay untracked
   per decision.