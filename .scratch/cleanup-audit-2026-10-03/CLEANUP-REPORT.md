# Disk Cleanup Audit — 2026-10-03

**Scope:** test logs, test outputs, test QR artifacts, error reports, temp/support files, ad-hoc scripts.
**Repo footprint:** 1.5 GB total (`D:\Antigravity_google\SDK-prepration`). Audit is read-only — nothing was deleted.
**Git status:** clean. **Every path below is untracked/gitignored** unless marked otherwise, so deletion never touches git history.

> **STATUS: EXECUTED (2026-10-03 ~02:15).** User approved and deleted **Tier 1** (all 9 paths) and **Tier 2b** (test-output, test-logs, payway-output). Verified: all targets gone, `git status` clean apart from this report. Repo footprint **1.5G → 770M (~730M recovered)**. Tiers 2a (`.release-audit`, fresh), 2c (root strays), 2d (external data root), and 3 (root node_modules) were NOT selected and remain. Tier 1 paths can be regenerated via `npm install` in each folder / `npm run build` / `npx vitest run --coverage` / `npx stryker run`.
>
> **EXECUTION 2 (2026-10-03 ~02:28):** user approved all three "safe" rows of the Tier 2a ranking → deleted **12 `.release-audit/` subfolders** (clean-source ×4, exact-candidate-20260908, current-reviewed, checkout-ui-commit-12292dd…, integration-merge-2026-10-02, native-php-commit-2026-10-03, remove-native-php-examples-2026-10-03, all-folders-tests-2026-10-03) ≈ 171M. `.release-audit/` now 11M, holding only `pre-history-rewrite.bundle` (9.8M, kept — only backup of pre-rewrite history), `allowlist-regression/` + loose Sep 6–8 root logs/JSONs (~1M, not in the selected rows), and the Oct 3 one-shot commit-prep scripts. Repo footprint now **598M** (cumulative ~930M recovered).
>
> **EXECUTION 3 (2026-10-03 ~02:35):** user approved 2c + the ad-hoc-scripts list → deleted root strays (`webhook-out.log`, `webhook-err.log`, root `webhook_data/`, `.merge-verification-coverage.log`, `.merge-verification-final.log`) and all remaining one-shot scripts: the four `.release-audit/*.mjs` commit-prep scripts and `.scratch/publishing-dx-audit-2026-09-29/resume-cli-probe.mjs`. `crack-sig*.cjs` / `decode-qr.mjs` were already gone with Tier 2b. A sibling probe, `consumer-probe.mjs`, was deleted too but turned out to be **git-tracked** (no space gain — blob lives in history), so it was restored via `git restore` to keep git state untouched; it remains at ~2KB and would need a normal commit to remove. Git status clean; footprint unchanged at 598M (these items were size-trivial).
>
> **EXECUTION 4 (2026-10-03 ~02:50) — `.kilo/` prune (84M → 55K):** reviewed `.scratch`/`.zcode`/superpowers/`audit-results` on user request; found `.kilo/` still holding 84M. Deleted `.kilo/node_modules` (61M, untracked Kilo deps) and removed+unregistered the `.kilo/worktrees/frost-cloud` git worktree (24M, detached HEAD at e783426 == main tip, zero unique content) via `git worktree remove --force`. `git worktree list` now shows only main. Kept: `.kilo/plans` (3 tracked July plan files), `package.json`, `agent-manager.json`, locks. **Repo footprint now 514M (cumulative ~1.01G recovered from 1.5G).**
>
> **REVIEW FINDINGS (partially executed):** stale `.scratch` campaigns ~5M tracked + `.superpowers/sdd` ~0.5M tracked → **EXECUTED as commit 094dc62 (Execution 5, 2026-10-03 ~03:00, 182 files / ~4.5M)** — dirs removed: `.superpowers/sdd`, `.scratch/{remove-native-php-examples, publishing-dx-review-2026-10-01, publishing-dx-remediation, publishing-dx-audit-2026-09-29, parity-check-2026-09-12, merged-worktree-preservation-20260907 (incl. untracked dx-p0 SDD backup), merge-integration, merge-cm-void, late-night-payment-link, customer-module-qr, canadia-audit, branch-consolidation-2026-10-02, audit-webhook-e2e}`. `.zcode/plans` 4 stale session plans 44K tracked — still pending. **Dangling provenance pointers after the prune (doc-tidy candidates):** HANDOFF.md → remove-native-php-examples / merged-worktree-preservation / branch-consolidation / audit-webhook-e2e; docs/project/PROJECT_STATUS.md → .superpowers/sdd + audit-webhook-e2e; docs/internal/SANDBOX-FINDINGS.md → late-night-payment-link; docs/strategy/competitive-analysis-canadia.md → canadia-audit; audit-results/publishing-dx-audit-2026-09-29/{ITEMS-1-2-REVIEW,REMEDIATION-STATUS}.md → publishing-dx-review/remediation; .zcode/skills (customer-qr SKILL.md, integration SKILL.md + docs-index) → customer-module-qr + publishing-dx-audit; CHANGELOG.md → publishing-dx-audit. `audit-results/` + `docs/superpowers/plans+specs` + `.zcode/skills` + `audit-results` copies recommended KEEP (cited/load-bearing). **Footprint now 511M.**

**Legend: 🗑️ = removed (see execution notes) · ✅ = deliberately kept**

---

## Tier 1 — Regenerable, zero-evidence-value (delete freely) ≈ 666 MB — ✅ FULLY EXECUTED

| Path | Size | What it is | How to regenerate |
|---|---|---|---|
| 🗑️ `payway-boilerplate/payment_link_api/node_modules` | 417M | Dependency tree of the boilerplate demo app | `npm install` in that folder (rarely needed) |
| 🗑️ `.scratch/publishing-dx-audit-2026-09-29/consumer` | 33M | Consumer smoke-install tree (packed tgz + npm install + skills). The `.gitignore` comment itself says: *"keep the logs and evidence JSON, drop the 33 MB install itself"* | Reproduced by the publishing-DX audit scripts |
| 🗑️ `payway-boilerplate/merchant-qr-pos/node_modules` | 93M | Dependency tree of second boilerplate demo | `npm install` in that folder |
| 🗑️ `payway-boilerplate/Postman Collection API Testing/_build/node_modules` | 73M | Build-time deps for the Postman collection export scripts | `npm install` in `_build` (the JSON parts are tracked and stay) |
| 🗑️ `examples/first-payment/node_modules` | 33M | Dependency tree of the first-payment example | `npm install` in that folder |
| 🗑️ `coverage/` | 9.2M | vitest/istanbul HTML + json coverage run of Sep 30 | `npx vitest run --coverage` |
| 🗑️ `.scratch/publishing-dx-audit-2026-09-29/api-docs` | 4.2M | Generated TypeDoc trees (gitignored by explicit rule) | Regenerated by the audit scripts |
| 🗑️ `dist/` | 2.6M | tsup build output (js/cjs/dts + openapi bundle) | `npm run build` |
| 🗑️ `reports/` | 1.3M | Stryker mutation-testing output (`mutation.html`, `mutation.json`) | `npx stryker run` (gitignored by explicit rule) |

Notes:
- Root `node_modules/` (451M) is NOT in this tier — see Tier 3 (✅ kept, not selected).
- After reinstalling on npm 12, remember the sqlite driver footgun: better-sqlite3 is optional/lockless; restore with `npm install --no-save better-sqlite3` if you want the SQLite storage backend.

**Subtotal: ~666 MB — deleted in Execution 1.**

---

## Tier 2 — Test/audit evidence, review-then-delete ≈ 187 MB — mostly executed

### 2a. `.release-audit/` — 182M → 11M (Executions 2 & 3 pruned it; 12 of 13 subfolders removed)

Local release/security evidence per the `.gitignore` rule (`/.release-audit/`). Breakdown:

| Subdir | Size | Contents |
|---|---|---|
| 🗑️ `checkout-ui-commit-12292dd.../` | 34M | Verification logs + candidate tree for a checkout-UI commit |
| 🗑️ `native-php-commit-2026-10-03/` | 28M | Working evidence for commit `e783426` (remove Android/iOS/PHP examples) — **written by the concurrent agent today at 01:19–01:22; the commit has already landed on `main`** |
| 🗑️ `clean-source-verify` / `clean-source-gitleaks` / `clean-source-final` / `clean-source` | 17M ×4 | Clean-checkout verification trees (each contains a full source copy) |
| 🗑️ `exact-candidate-20260908` / `current-reviewed` | 12M + 12M | Older candidate-tree comparisons |
| ✅ `pre-history-rewrite.bundle` | 9.8M | **Git bundle backup of pre-rewrite history** — a safety artifact; delete only after you're satisfied the history rewrite is final |
| 🗑️ `integration-merge-2026-10-02` | 7.1M | Evidence for the private-integration merge |
| 🗑️ `all-folders-tests-2026-10-03/` | 6.2M | Test logs for every subfolder, run today (example-setup, merchant-qr-pos, payment-link, postman, sandbox, sdk coverage/lint/typecheck…) |
| 🗑️ `remove-native-php-examples-2026-10-03` | 5.4M | Same commit's earlier verification pass |
| ✅ `allowlist-regression/` + root logs (`final-tests.log`, `build.log`, `history-gitleaks.json`, …) | ~1M | Misc gate logs — **not in the selected rows; still present** |

⚠️ ~~Before deleting: the `native-php-commit-2026-10-03/` and `all-folders-tests-2026-10-03/` trees are from the concurrent agent session…~~ **Resolved:** the session went silent 1h+ before Execution 2 and its commit was already in git.

### 2b. Test-output & test-log directories — 4.3M (Jul–Sep, stale) — ✅ FULLY EXECUTED (Execution 1)

| Path | Size | Contents |
|---|---|---|
| 🗑️ `test-output/` | 1.8M (130 files) | Designated CLI/agent output dir (gitignored). QR PNGs (`q33r.png`, `q34r.png`, `purchase-test-campaign/` 878K, `payment-link-void-probe/` 492K), payment-link checkout-page HTML snapshots + lifecycle JSONs (Aug 25), two JPEGs (`dhitraj-2026-08-24…jpg`, `dummy cus-2026-09-15…jpg` — look like uploaded test images), `campaign-evidence.json` (64K), `gates-build*.log` ×3, `npm-ci.log`, `decode-qr.mjs` (ad-hoc helper) |
| 🗑️ `test-logs/` | 1.7M | Integration-test runs of Jul 18 (3× jsonl ≈ 380K each + md reports), 10 vitest run logs (Aug 27), `qr-payment/` (191K), `qr-images/` (26K — QR template strings + manifest), `post-payment/` (refund/transaction evidence JSONs), `checkout-link/` |
| 🗑️ `payway-output/` | 704K (42 files) | CLI-generated QR PNGs (`qrm*.png` ×~30, Sep 13–15), `link-card-*.html` hosted-form snapshots ×5 (44K each), `cof-flag-sweep-*.json` ×2, `cof-link-account-*.png` ×10, and ad-hoc probe scripts `crack-sig.cjs`/`crack-sig2.cjs`/`crack-sig3.cjs` (Sep 15 signature-canonicalization experiments — superseded by that audit's findings) |

Caveat: committed `.scratch/` audit cards (purchase-api-test-plan, link-card-review, cof-full-cycle-audit, …) reference `test-output/`/`test-logs/` paths as provenance. Those references were always dangling for other clones (dirs are gitignored), so deleting only removes YOUR local ability to re-open the evidence. If any campaign might be revisited, keep just the JSON evidence files (they're small) and drop the PNGs/HTML.

### 2c. Root strays — ~2K — ✅ FULLY EXECUTED (Execution 3)

| Path | Size | What |
|---|---|---|
| 🗑️ `webhook-out.log`, `webhook-err.log` | 757 B | Stdout/stderr of a webhook receiver started from repo root on Sep 16 (`*.log` is gitignored) |
| 🗑️ `webhook_data/` | 424 B | `callbacks.jsonl` from Jul 23 — a stale duplicate; the canonical store lives in the data root (below) |
| 🗑️ `.merge-verification-coverage.log`, `.merge-verification-final.log` | 23K | Merge-verification vitest logs from Sep 6 |

### 2d. External data root (outside the repo) — 149K — ✅ KEPT (recommended; not selected)

`%APPDATA%\aba-payway-sdk\data\` — `journal.jsonl` (116K, Oct 2), `linked-tokens.json`, `webhook_data/`.
This is the **live CLI journal** backing `journal timeline|stats|reconcile`, COF token resolution (`cof charge --ctid`), and webhook replay. Only 149K — deleting it silently breaks `--ctid` charge resolution and the reconcile baseline. Reset only if you intend to wipe local transaction history.

---

## Tier 3 — Optional: root `node_modules/` — 451M — ✅ KEPT (not selected)

The dev dependency tree for THIS repo (vitest, tsup, stryker, better-sqlite3, …). Deleting it recovers the single biggest chunk, but every dev command then needs `npm install` first (~2–5 min + the better-sqlite3 allowScripts footgun on npm 12). Do this only if you're archiving the project; for active development, leave it.

**Subtotal: 451M — still present.**

---

## Keep — do not delete (tracked / load-bearing)

| Path | Size | Why |
|---|---|---|
| `.git/` | 19M | Pack size 16.3M — no gc needed |
| `payway-boilerplate/` (non-node_modules) | ~9M tracked | Source + Postman collection; `dist/` inside is committed on purpose (gitignore exception, CI freshness gate) |
| `.scratch/` tracked dossiers | ~6M | 285 tracked evidence/planning files — the audit record (see Review Findings for the stale-campaign prune option) |
| `knowledge/` | 788K | Generated corpus but committed + packaged; regenerate via `npm run sync:knowledge` only when editing sources |
| `audit-results/` | 809K | Tracked audit dossiers (OpenAPI fidelity, four-pillars…) — two are actively cited from AGENTS.md |
| `docs/`, `docs-packaged/`, `skills/`, `.zcode/skills/`, `payway-openapi/` | ~9M | Source docs, packaged guides, spec copies |
| ✅ `.kilo/plans`, `package.json`, `agent-manager.json`, locks | 55K | Tracked July plan files + Kilo config, kept after the 84M prune (Execution 4) |
| `.env` | — | Sandbox credentials (gitignored, obviously keep) |

---

## Ad-hoc scripts found (candidates for review)

- 🗑️ `payway-output/crack-sig.cjs`, `crack-sig2.cjs`, `crack-sig3.cjs` — Sep 15 HMAC canonicalization probes (findings already recorded in the AOF audit; removed with `payway-output/` in Execution 1)
- 🗑️ `test-output/decode-qr.mjs` — QR decode helper used in the QR-window audit (removed in Execution 1)
- 🗑️ `.release-audit/refresh-unchanged-index-metadata.mjs`, `.release-audit/finalize-native-php-commit.mjs`, `.release-audit/prepare-native-php-commit.mjs`, `.release-audit/refresh-native-php-index.mjs` — one-shot commit-prep scripts from today's agent session (removed in Execution 3)
- 🗑️ `.scratch/publishing-dx-audit-2026-09-29/resume-cli-probe.mjs` — explicitly gitignored probe (removed in Execution 3)
- ⚠️ `.scratch/publishing-dx-audit-2026-09-29/consumer-probe.mjs` — sibling probe, discovered to be **git-tracked**; deletion was reverted via `git restore` (no space gain, blob lives in history). Removing it needs a normal commit.

---

## Summary

| Tier | Recovery | Risk | Status |
|---|---|---|---|
| 1 — regenerable caches/installs | ~666 MB | None | 🗑️ Executed (1) |
| 2 — release/test evidence | ~187 MB | Review first | 🗑️ Executed (2+3): ~173M gone; bundle + ~1M loose logs kept |
| 3 — root node_modules | ~451 MB | Costs a reinstall before any dev work | ✅ Kept (not selected) |
| 4 — `.kilo/` (found during review) | ~84 MB | None (worktree was detached at main tip) | 🗑️ Executed (4) |
| 5 — tracked scratch/SDD prune (user-picked 14 dirs) | ~4.5 MB | Commit 094dc62 (dangling pointers listed in header) | 🗑️ Executed (5) |
| **Total recovered** | **~1.02 GB of 1.5 GB → 511M** | | |

Recommended order: ~~Tier 1 → (after confirming the other agent is done) Tier 2a except the bundle → Tier 2b/2c → Tier 3 only if archiving.~~ **All user-approved passes executed; only Tier 3 (root node_modules) and the tracked-bit tidy-up commits remain optional.**
