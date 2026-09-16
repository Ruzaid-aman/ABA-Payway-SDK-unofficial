# Skills → docs/ Reference-Integrity Audit (reorg pre-check)

**Scope:** every file under `skills/` (34 skills + README) swept for references into `docs/`,
`knowledge/`, repo-root files, and each other — checked against the 49-file move list in
[`REORG-PLAN.md`](REORG-PLAN.md). Verdict first, evidence below.

**Verdict: the reorg as planned breaks ZERO skill references.** One prose pointer and one test
hardcode need to ride along (already covered by G1/G3 if listed explicitly). G6 is confirmed true.

---

## 1. Direct `docs/` path references inside `skills/` — exactly ONE

| Where | Reference | Move list? | Survives? |
|---|---|---|---|
| [`skills/aba-payway-agent/SKILL.md:284`](../../skills/aba-payway-agent/SKILL.md) | `docs/error-codes.json` ("repo checkout at …, not in the npm package") | **No** — not among the 49 moves | ✅ stays valid |

Notes:
- It is a backticked prose path, not a markdown link, so `doctorSkills` never validates it
  (`src/cli/commands/skills.ts:527-531` only checks `](…)` links, and repo-doc links are
  explicitly "outside the installed-skill contract").
- **Constraint for later phases:** if `docs/error-codes.json` ever moves, this skill line must be
  updated in the same commit (it is the packaged corpus copy `knowledge/error-codes.json`'s source
  sibling — check `scripts/sync-knowledge.mjs` too).

## 2. Skills → docs coupling via `payway-sdk docs <topic>` (the real dependency)

Skills deliberately invoke CLI knowledge topics, not file paths. All 6 distinct topics invoked by
skills exist in `scripts/knowledge-sources.mjs`; the reorg keeps topic IDs untouched (G1) and only
rewrites `source:` paths, so all of these survive **iff G1 lands in the same commit**:

| Skill | Invocation | Corpus source today | Moves to (Phase 1) |
|---|---|---|---|
| aba-payway-first-payment | `docs setup` | `docs/02-prerequisites-and-setup.md` | `docs/guides/02-…` |
| aba-payway-knowledge-base | `docs quickstart`, `docs errors-and-debugging`, `docs list/search` | `QUICKSTART.md` (root, unmoved) · `docs/12-error-handling-and-debugging.md` | — · `docs/guides/12-…` |
| aba-payway-hash | `docs payment-link` | `docs/17-payment-link.md` | `docs/guides/17-…` |
| aba-payway-payment-link | `docs payment-link` | `docs/17-payment-link.md` | `docs/guides/17-…` |
| aba-payway-refund | `docs settlement-disputes` | `docs/20-settlement-and-disputes.md` | `docs/guides/20-…` |
| aba-payway-sdk-configuration | `docs errors-and-debugging` | `docs/12-error-handling-and-debugging.md` | `docs/guides/12-…` |
| aba-payway-sandbox-beneficiaries | `docs errors-and-debugging` | `docs/12-error-handling-and-debugging.md` | `docs/guides/12-…` |
| aba-payway-agent | `docs agent-setup-playbook` | `docs/AGENT-SETUP-PLAYBOOK.md` | `docs/guides/AGENT-SETUP-PLAYBOOK.md` |

`src/__tests__/knowledge.test.ts` (freshness gate) fails the build if the sync is skipped — G1 is
test-enforced, so this layer self-protects.

## 3. References to the internal dossiers — bare citations only, all move-safe

`SANDBOX-FINDINGS` appears in 4 skills (link-account §26, link-card §24, agent via `explain`
evidence strings, knowledge-base prose) — **zero path-qualified references**; all are the bare
`SANDBOX-FINDINGS §NN` convention that plan principle #2 explicitly preserves. `INTEGRATION-GAPS`,
`CLOSE-TRANSACTION-FINDINGS`, `HISTORY-SECRET-TRIAGE`, `SDK-AND-CLI-REFERENCE`,
`FIRST-PAYMENT-WALKTHROUGH`, `AGENT-SETUP-PLAYBOOK`: zero hits in `skills/`.

## 4. Skill-internal + skill-to-skill relative links — unaffected

- ~60 `../aba-payway-*/SKILL.md` cross-links + `skills/README.md` `./aba-payway-*/SKILL.md` index:
  `skills/` is explicitly unmoved (plan §9) and the installer preserves sibling layout, so links
  stay valid in the installed home too. `doctorSkills` re-validates these at install/doctor time.
- `aba-payway-customer-qr/references/fulfillment-outbox.md` exists; skill-local `references/`,
  `scripts/` links are doctor-checked.
- Mirror constraint: `src/__tests__/skills.test.ts` requires `skills/` ≡ `.zcode/skills/`
  byte-identical — no skill edits are needed, so no mirror churn.

## 5. One test hardcode G3 must name explicitly

`src/__tests__/docs-examples.test.ts:23` pins the literal path `docs/16-webhook-setup-guide.md`
alongside `skills/aba-payway-offline-qr/SKILL.md` (a skill↔docs content-parity gate). The file
moves to `docs/guides/16-webhook-setup-guide.md` in Phase 1 → the test's path constant must be
updated in the same commit. G3's generic "inbound refs from md/ts/mjs" sweep covers it, but this
is the single ts-file hardcode binding skills to a moved docs path — worth naming in the
Phase-1 checklist.

## 6. G6 verification (already true today)

Grep over all of `skills/`: **zero** markdown links from packaged skills into `docs/` or `../docs/`.
The one `docs/` mention is the prose pointer in §1 above. The Phase-1 G6 grep will pass as-is.

## 7. Suggested plan deltas (fold into REORG-PLAN.md)

1. **G3:** add the named item — update `docs/16-webhook-setup-guide.md` constant in
   `src/__tests__/docs-examples.test.ts` (Phase 1, same commit as the move).
2. **G1:** note `agent-setup-playbook` + `payment-link` + `setup` + `errors-and-debugging` +
   `settlement-disputes` are the five moved sources actively consumed by packaged skills —
   breaking them degrades 8 skills' "served offline by the CLI" claims, not just docs nav.
3. **G6:** formalize the check as `grep -rE '\]\((\.\./)*(docs/)' skills/` → expect 0 matches.
4. **Later-move rule (new, small):** `docs/error-codes.json` is pinned by
   `skills/aba-payway-agent/SKILL.md` (~line 284) and the knowledge sync — any future move of it
   must carry both. Keep it out of Phase 1 (it already is).
