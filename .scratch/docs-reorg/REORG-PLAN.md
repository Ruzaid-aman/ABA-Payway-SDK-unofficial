# Docs & Knowledge Reorganization — Proposal v1 (REVIEW ONLY)

**Status: PROPOSAL. Nothing has been moved.** Working branch: `docs-reorg-plan`.
Deliverables on this branch: [`INVENTORY.md`](INVENTORY.md) (all 335 living `.md` files classified), [`SKILL-REFERENCES-AUDIT.md`](SKILL-REFERENCES-AUDIT.md) (skills → docs reference-integrity pre-check) + this plan.
**Nothing executes until you approve** — then each phase lands as a separate commit for review.

---

## 1. The problem: where ABA PayWay knowledge lives today

Learnings and corrections about working with ABA PayWay are scattered across **nine different surfaces**, with no single index saying which one is canonical for what:

| Surface | Role today | Problem |
|---|---|---|
| `docs/SANDBOX-FINDINGS.md` | The canonical live-evidence dossier (§1–§26, 927 lines) | Buried among 87 files in a flat-ish `docs/` dir; cited as `SANDBOX-FINDINGS §NN` from **src/*.ts code comments, CLI hint strings, skills, and other docs** (117 files reference it) |
| `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` | Canonical ABA question register (Q1–Q43, Parts 1–5) | ALL-CAPS name mixed with user guides; easy to miss |
| `docs/CLOSE-TRANSACTION-FINDINGS.md`, `docs/HISTORY-SECRET-TRIAGE.md` | More dossiers | Same — findings docs sit next to tutorials |
| `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` | OLDER ABA question register | Superseded-in-part, but nothing states which doc wins |
| `.agents/AGENTS.md` | "Project Rules & Learned Knowledge" (hash orders, offline KHQR, footguns) | Overlaps the dossiers; no pointers between them |
| `AGENTS.md` + `HANDOFF.md` | Agent quick-ref + release state | Reference doc paths that a reorg would move |
| `.scratch/<campaign>/` (58 files) | Per-campaign state, specs, findings | Working files by design (issue tracker) — fine, but nobody can find "the ABA learnings" from there |
| `audit-results/` (31) | Historical audits | Mostly closed; no README index, no superseded markers |
| `knowledge/` (30) | **Generated** corpus (31-source map in `scripts/knowledge-sources.mjs`) | Not hand-editable — reorganizing it directly is wrong; it must *follow* the sources |

Secondary problems: `docs/` mixes four audiences (integrator / maintainer / strategist / agent) in one namespace; `.release-audit/` alone holds **1,401 frozen snapshot files — 56% of all markdown in the repo**; and three competitive analyses + a strategy memo float loose in `docs/`.

## 2. Design principles

1. **Audience separation** — one subtree per audience: integrator guides, reference, recipes, internal evidence, project/process, strategy.
2. **Stable names for §-cited dossiers** — `SANDBOX-FINDINGS.md` keeps its *filename* (the `§NN` citation convention used in source code survives); only its directory changes, and bare citations like `SANDBOX-FINDINGS §23` are unaffected by a directory move.
3. **Generated files follow sources** — `knowledge/` is regenerated from `scripts/knowledge-sources.mjs`; the map is updated in the same commit as any move (test-enforced freshness).
4. **The packaging wall becomes a path rule** — internal dossiers move under `docs/internal/`, so `scripts/check-package-contents.mjs` can exclude by prefix instead of a filename list. Distilled facts still reach the public corpus deliberately (e.g. `close-transaction-findings` topic stays mapped).
5. **Don't fight the conventions that work** — `.scratch/` stays (it IS the issue tracker per `docs/agents/issue-tracker.md`); skills stay; AI-assistant ledgers stay; vendored material stays.
6. **History via `git mv`** — renames tracked, one commit per phase, gates green before each.

## 3. Proposed target structure

```
docs/
  README.md                 # index — REWRITTEN to route by audience
  guides/                   # integrator-facing manual (public; corpus-mapped)
    01-overview-and-concepts.md … 22-api-datetime-and-timezones.md   # 22 numbered chapters, names unchanged
    FIRST-PAYMENT-WALKTHROUGH.md, QUICK-START-1-PAGER.md,
    AGENTIC-PAYWAY-CLI-USER-GUIDE.md, AGENT-SETUP-PLAYBOOK.md, VISUAL-GUIDE.md
  reference/                # lookup material (public)
    SDK-AND-CLI-REFERENCE.md, glossary.md, SANDBOX-BENEFICIARIES.md
  recipes/                  # operator runbooks (public)
    cloudflare-free-webhook.md, callback-capture.md            # ← from docs/ + docs/agents/
  internal/                 # evidence dossiers — NOT packaged (path rule)
    README.md               # NEW: the ABA-knowledge hub index (see §4)
    SANDBOX-FINDINGS.md     # canonical live-evidence dossier (filename kept)
    CLOSE-TRANSACTION-FINDINGS.md
    INTEGRATION-GAPS-AND-ABA-QUESTIONS.md   # canonical ABA question register
  project/                  # maintainer/process (not packaged)
    PROJECT_STATUS.md, MAINTENANCE.md, RELEASE-READINESS.md, RELEASE_CHECKLIST.md,
    VERSIONING.md, PRODUCTION-VERIFICATION-PLAN.md, MUTATION-SPIKE-2026-08-31.md,
    HISTORY-SECRET-TRIAGE.md, aba-payway-test-case-coverage.md
  strategy/                 # positioning & comparisons (not packaged)
    STRIPE-STANDARD-DX-AUDIT.md, building-a-payway-sdk-cto-workflow-and-strategy.md,
    competitive-analysis-cutluy.md, competitive-analysis-cli-stripe-razorpay.md,
    competitive-analysis-canadia.md
  agents/                   # UNCHANGED — engineering-skill convention path
    domain.md, issue-tracker.md                             # callback-capture-recipe.md moves to recipes/
  diagrams/                 # unchanged
  images/                   # unchanged
  archive/                  # unchanged
  superpowers/              # unchanged unless D3 approved
  test-cases/               # unchanged
```

**Unmoved elsewhere:** root files (README, QUICKSTART, CHANGELOG, CONTRIBUTING, SECURITY, SUPPORT, AGENTS, HANDOFF), `knowledge/` (generated), `skills/` + `.zcode/skills/` (packaged + installed mirrors), `.scratch/`, `.superpowers/`, `.kilo/`, `.zcode/plans/`, `audit-results/` (this pass — see D5), `.github/`, `sdk/`, `examples/`, `payway-boilerplate/`, `.release-audit/` (see D4).

**Phase 1 = 49 `git mv` operations** (27 guides, 3 reference, 2 recipes, 3 internal, 9 project, 5 strategy).

## 4. The ABA-knowledge hub (your core ask)

One place that answers "where is what we know about ABA PayWay":

**`docs/internal/README.md` (new)** — an index of every learning surface, declaring ownership:

| Question | Canonical answer |
|---|---|
| What does the gateway ACTUALLY do (live-verified)? | `docs/internal/SANDBOX-FINDINGS.md` (§-numbered, append-only) |
| What don't we know / what has ABA been asked? | `docs/internal/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` (Q-numbers) |
| What did ABA answer? | Same register, Parts 4–5 (relay addenda) |
| Close-transaction semantics | `docs/internal/CLOSE-TRANSACTION-FINDINGS.md` |
| How must agents behave in this repo (hash orders, footguns)? | `.agents/AGENTS.md` + root `AGENTS.md` |
| Per-campaign raw state? | `.scratch/<campaign>/` (issue tracker) |
| Historical audit verdicts? | `audit-results/` |

Supporting changes:
- `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` gains a **SUPERSEDED banner** → points to the internal register (file stays put).
- `.agents/AGENTS.md` "Learned Knowledge" sections gain pointers to the hub (dedup happens later, only if you ask — v1 just cross-links).
- `AGENTS.md`/`HANDOFF.md` path references updated in the same commit.

## 5. Mechanical guardrails (what every move must carry)

| # | Dependency | Action |
|---|---|---|
| G1 | `scripts/knowledge-sources.mjs` (31 entries; 28 of them point into `docs/`) | Update `source:` paths in the SAME commit; run `npm run sync:knowledge` — `src/__tests__/knowledge.test.ts` freshness gate fails otherwise. **Skill-consumed topics:** `setup`, `errors-and-debugging`, `payment-link`, `settlement-disputes`, `agent-setup-playbook` are the five moved sources actively invoked as `payway-sdk docs <topic>` by 8 packaged skills — breaking them degrades those skills' "served offline by the CLI" claims, not just docs nav (see [`SKILL-REFERENCES-AUDIT.md`](SKILL-REFERENCES-AUDIT.md) §2) |
| G2 | Relative links INSIDE moved files | Depth changes (`../QUICKSTART.md` → `../../QUICKSTART.md`) — rewrite per file |
| G3 | Inbound links from other md/ts/mjs | Path-qualified refs swept (e.g. `docs/17-payment-link.md`); bare `SANDBOX-FINDINGS §NN` citations in `src/` are move-safe. **Named item:** the literal `docs/16-webhook-setup-guide.md` constant in `src/__tests__/docs-examples.test.ts` (a skill↔docs content-parity gate pairing it with `skills/aba-payway-offline-qr/SKILL.md`) must switch to `docs/guides/16-webhook-setup-guide.md` in the same commit |
| G4 | `scripts/check-package-contents.mjs` | Denylist switches to `docs/internal/**` prefix rule (+ keep explicit names for anything left outside); confirm `knowledge/` packaging unaffected |
| G5 | `docs/README.md` + `docs/VISUAL-GUIDE.md` | Index/routing rewritten to the new tree |
| G6 | Skills contract: "packaged skills must not link into `docs/`" + the one pinned path | Formalized check (expect 0 matches): `grep -rE '\]\((\.\./)*(docs/)' skills/` — verified true today (audit §6). The single prose pointer `docs/error-codes.json` in `skills/aba-payway-agent/SKILL.md` stays valid because that file is NOT in the 49 moves; **any future move of `docs/error-codes.json` must carry that skill line and the knowledge sync script** (audit §1, §7) |
| G7 | Gates | Full vitest suite + lint + package-contents check green per phase |
| G8 | Concurrent agents | `.scratch/publish-prep/PUBLIC-SURFACE-MAP.md` (untracked, in flight) maps the public surface by path — sequence this reorg AFTER that campaign closes or fold path updates into it; no merges without your instruction |

## 6. Phased execution (each phase = one commit, gated)

**Phase 0 — Baseline (no moves).** Dump the link graph (every relative `.md` link in living files) to `.scratch/docs-reorg/link-graph.txt`; confirm package.json `files` vs what ships from `docs/`; confirm publish-prep campaign status. *DoD: link-graph artifact committed.*

**Phase 1 — `docs/` restructure.** The 49 moves + G1–G7. *DoD: gates green; `docs/README.md` routes correctly; llms.txt diff reviewed (topic ids unchanged, only source paths).*

**Phase 2 — ABA hub.** `docs/internal/README.md` index; SUPERSEDED banner on the four-pillars register; pointer updates in `AGENTS.md`/`HANDOFF.md`/`.agents/AGENTS.md`. *DoD: hub answers the §4 table; no gate regressions.*

**Phase 3 — Optional cleanups (pick any, independent):**
- 3a: fold `docs/superpowers/` into `.superpowers/plans/` (D3)
- 3b: `audit-results/README.md` index + CLOSED markers per audit
- 3c: delete `.release-audit/` (D4)
- 3d: absorb clearly-dead docs into `docs/archive/` (candidates listed during Phase 0 review)

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Stale inbound links break navigation / tests | Phase-0 link graph gives the exhaustive sweep list; G3 grep per moved file; vitest catches corpus/freshness breaks |
| Packaging regression (internal dossier ships publicly) | G4 prefix rule + `check-package-contents` gate per phase |
| Concurrent-agent collisions (another campaign moves docs mid-wave) | G8 sequencing; reorg stays on `docs-reorg-plan`; per-user instruction for merges |
| Broken §-citation convention | Filenames of §-cited dossiers never change; only directories move |
| Packaged skills silently degraded (docs nav moves, skills don't follow) | Skills reach docs only via CLI topics (G1 topic ids untouched) and hold zero `docs/` links (G6 grep, audit §6); the one pinned path (`docs/error-codes.json`) is out of the move list |
| Corpus topic drift | Topic ids and descriptions untouched in `knowledge-sources.mjs` — only `source:` paths change |

## 8. Open decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Depth of the `docs/` split | **A:** full audience subdirs (this plan) · **B:** light — keep 22 chapters flat at `docs/` root, only group the non-chapter docs | **A** — one mental model, packaging wall becomes a path; B only if you want minimal churn |
| D2 | `SANDBOX-FINDINGS.md` location | Move to `docs/internal/` · keep at `docs/` root | Move — bare `§NN` citations in source code are unaffected; the ~15 path-qualified refs are swept |
| D3 | `docs/superpowers/` (23 plan/spec/task files) | Fold into `.superpowers/` · keep | Fold (3a) — SDD material in one home; historical ledger links go stale but ledgers are frozen anyway. Low priority |
| D4 | `.release-audit/` (1,401 files, 56% of all repo markdown) | Delete once the publish campaign closes · keep frozen | Delete — git history preserves every snapshot; confirm with the publish-prep campaign first |
| D5 | Rename `audit-results/` → `history/audits/`? | Rename · keep name + add README index | Keep name (18 inbound references; renaming buys little). Do 3b only |

## 9. Explicitly NOT in scope (for the record)

`knowledge/` regeneration beyond following sources · `skills/` reorganization (they mirror workflows, not docs) · merging/deduplicating `.agents/AGENTS.md` content into the hub (cross-links only in v1) · any `.scratch/` restructuring (issue-tracker convention) · touching vendored `payway-boilerplate/` · any content rewriting — **this is a pure location/index reorganization; wording changes are separate campaigns.**
