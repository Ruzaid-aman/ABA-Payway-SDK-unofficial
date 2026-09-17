# Markdown File Inventory — aba-payway-ts workspace

**Date:** 2026-09-16 · **Branch:** `docs-reorg-plan` (off `main` @ `1a17972`)
**Method:** hand survey — first-heading + first-line extraction for every living file, plus maintainer context. Companion file: [`REORG-PLAN.md`](REORG-PLAN.md) (proposal only — nothing has been moved).

## Totals

The repo holds **2,504 `.md` files**. Only **335 are living project docs**; the rest are frozen snapshots, vendored dependencies, and installed-package copies:

| Tree | Files | Nature |
|---|---|---|
| `docs/` | 87 | Living documentation (the reorg target) |
| `.scratch/` | 58 | Campaign working files (also the issue tracker, see `docs/agents/issue-tracker.md`) |
| `.zcode/` | 46 | ZCode-installed skills (35 byte-identical mirrors of `skills/`) + 4 session plans |
| `audit-results/` | 31 | Historical audit dossiers (mostly closed) |
| `knowledge/` | 30 | GENERATED corpus — do not hand-edit (see §knowledge below) |
| `skills/` | 36 | Packaged agent skills (source of truth for the 34 `aba-payway-*` guides) |
| `.kilo/plans/` | 3 | Old Kilo-agent implementation plans |
| `.superpowers/` | 12 | SDD execution ledgers (briefs/reports/progress) |
| `test-output/` + `test-logs/` | 10 | Live-campaign evidence captures / run logs |
| Root files + `.agents/` | 9 | Package-facing meta (README, QUICKSTART, …) + deep agent rules |
| `.github/` | 3 | Issue/PR templates |
| `sdk/` | 2 | Native (Android/iOS) companion READMEs |
| `examples/first-payment/README.md` | 1 | Reference-app guide |
| `payway-boilerplate/` (real content) | 7 | Vendored official ABA sample projects' own docs |
| **Living subtotal** | **335** | |
| `.release-audit/**` | 1,401 | Frozen full-tree snapshots (`clean-source*`, `current-reviewed`, `exact-candidate-20260908`, `allowlist-regression`) — copies of the repo itself, incl. its docs |
| `payway-boilerplate/**/node_modules/` | 651 | Vendored dependency READMEs |
| `examples/first-payment/node_modules/` | 90 | Copies of the published `aba-payway-ts` package + deps |
| `.kilo/node_modules/` | 27 | Vendored dependency READMEs |
| **Bulk subtotal** | **2,169** | |

## Classifier legend (one word per file)

`guide` user-facing how-to · `reference` lookup material · `recipe` step-by-step operator runbook · `dossier` living evidence/findings log · `findings` fixed-date probe results · `audit` third-party-style review with verdicts · `report` one-off analysis output · `plan` implementation plan · `spec` design/requirements · `playbook` operational field notes · `ledger` execution/progress tracking · `archive` deliberately frozen historical material · `generated` build artifact (do not hand-edit) · `skill` packaged agent guide · `meta` instructions about working on the repo · `strategy` positioning/comparison analysis · `policy` governance rules · `snapshot` frozen tree copy · `vendored` third-party content kept for reference · `sample` example-app doc · `log` raw run output · `index` navigation only · `evidence` captured proof of a live test

---

## 1. Root — package-facing meta (9)

| File | Classifier | Description |
|---|---|---|
| `README.md` | guide | Landing page: community SDK + CLI overview, install, feature matrix. |
| `QUICKSTART.md` | guide | Install → sandbox credentials → first runnable payment. Corpus source. |
| `CHANGELOG.md` | log | Per-version release notes. |
| `CONTRIBUTING.md` | policy | Dev environment, workflow, test/lint gates for contributors. |
| `SECURITY.md` | policy | Vulnerability reporting policy / private contact. |
| `SUPPORT.md` | policy | Support scope: community SDK vs ABA bank channels. |
| `AGENTS.md` | meta | Agent quick reference — canonical CLI commands, sandbox TLS caveat, conventions. |
| `HANDOFF.md` | meta | Agent-to-agent handoff: release state, behavior contract, next items, anti-checklist. |
| `.agents/AGENTS.md` | dossier | Deep agent rules & learned gateway knowledge: hash orders, offline KHQR rules, environment footguns. |

## 2. `docs/` — the main tree (87)

### 2.1 Numbered chapters — the integration manual (22)

All corpus-mapped via `scripts/knowledge-sources.mjs` **except 21** (storage service is not in the corpus).

| File | Classifier | Description |
|---|---|---|
| `docs/01-overview-and-concepts.md` | guide | PayWay model: credentials, hash signing, sandbox vs production, payment options. |
| `docs/02-prerequisites-and-setup.md` | guide | Merchant portal, sandbox creds, ABA Mobile simulator, env vars. |
| `docs/03-web-implementation.md` | guide | Hosted checkout + server-side purchase flow, callback verification. |
| `docs/04-native-app-implementation.md` | guide | Android/iOS: deeplinks, webviews, return handling. |
| `docs/05-webview-implementation.md` | guide | Mobile webview checkout patterns and return legs. |
| `docs/06-telegram-mini-app.md` | guide | PayWay checkout inside a Telegram mini-app. |
| `docs/07-qr-code-handling.md` | guide | Online vs offline KHQR, scan-time validity windows, expiry semantics. |
| `docs/08-deep-linking.md` | guide | `abamobilebank://` scheme and return-leg handling. |
| `docs/09-link-unlink-renew-lifecycle.md` | guide | Credentials-on-file account/card lifecycle + token renewal. |
| `docs/10-ui-customization.md` | guide | Hosted checkout branding/view customization. |
| `docs/11-callbacks-and-webhooks.md` | guide | Single best-effort callback delivery, HMAC verification, workbench. |
| `docs/12-error-handling-and-debugging.md` | guide | Error-code registry with sandbox-verified hints + debugging playbook. |
| `docs/13-deployment-checklist.md` | guide | Production go-live gates. |
| `docs/14-appendix-code-snippets.md` | guide | Copy-paste signing / verify / polling snippets. |
| `docs/15-merchant-scenario-requirements.md` | guide | 28 merchant cases mapped to SDK/integrator responsibilities. |
| `docs/16-webhook-setup-guide.md` | guide | `setup-webhook` listener, tunnels, forwarding, production config. |
| `docs/17-payment-link.md` | guide | Payment-link create/detail/void contract, pushbacks, VOIDED semantics (largest guide). |
| `docs/18-transaction-journal.md` | guide | JSONL transaction journal: timeline/stats/reconcile/anomalies. |
| `docs/19-customer-module-qr.md` | guide | Portal static "printed QR" channel + merchant-ref reconciliation. |
| `docs/20-settlement-and-disputes.md` | guide | Settlement timing, chargebacks, refund boundaries, FX. |
| `docs/21-storage-service.md` | guide | `createStorageService` facade over journal/tokens/webhooks (NOT corpus-mapped). |
| `docs/22-api-datetime-and-timezones.md` | reference | Per-endpoint datetime formats: UTC, UTC+7, epoch, naive, callback. |

### 2.2 UPPER-CASE reports & guides (24)

| File | Classifier | Description |
|---|---|---|
| `docs/AGENT-SETUP-PLAYBOOK.md` | playbook | Field notes from a live Windows bring-up of the agentic CLI (providers, modes, privacy). Corpus-mapped. |
| `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md` | guide | `ask` / agent REPL / sessions / execution ledger — full agent surface. Corpus-mapped. |
| `docs/CLOSE-TRANSACTION-FINDINGS.md` | dossier | What close-transaction really does remotely: QR killed, hosted-card sessions may still pay. Corpus-mapped. |
| `docs/FIRST-PAYMENT-WALKTHROUGH.md` | guide | Simulated-app first payment with verification at each step. Corpus-mapped. |
| `docs/HISTORY-SECRET-TRIAGE.md` | findings | 2026-09-07 secret-history scrub state; publication-blocker tracking. |
| `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` | dossier | **Canonical ABA question register** (Parts 1–5, Q1–Q43) + doc-only gap scan. |
| `docs/MAINTENANCE.md` | plan | How the repo stays coherent day to day / release to release. |
| `docs/MUTATION-SPIKE-2026-08-31.md` | report | Mutation-testing spike results (coverage quality). |
| `docs/PRODUCTION-VERIFICATION-PLAN.md` | plan | Go-live verification steps from the technical review (P3). |
| `docs/PROJECT_STATUS.md` | report | Living project/delivery status incl. branch-merge history. |
| `docs/QUICK-START-1-PAGER.md` | guide | Condensed create→verify→fulfill card. Corpus-mapped. |
| `docs/README.md` | index | Docs map: start-here routes, per-domain guides, troubleshooting. Corpus source for `docs-index`. |
| `docs/RELEASE-READINESS.md` | register* | Open-source publish gate: manual-actions register A–I. (*=checklist) |
| `docs/RELEASE_CHECKLIST.md` | checklist* | Release process checklist. (*=policy) |
| `docs/SANDBOX-BENEFICIARIES.md` | reference | Seeded sandbox payout fixtures & test MIDs (never live). |
| `docs/SANDBOX-FINDINGS.md` | dossier | **THE canonical live-evidence dossier** (§1–§26): every sandbox-verified gateway behavior. 927 lines. Cited by §-number from src code, skills, and docs. |
| `docs/SDK-AND-CLI-REFERENCE.md` | reference | Every SDK domain method + CLI command with flags/contracts. Corpus-mapped. |
| `docs/STRIPE-STANDARD-DX-AUDIT.md` | audit | DX audit against the Stripe bar; roadmap source. |
| `docs/VERSIONING.md` | policy | Semver policy for the SDK. |
| `docs/VISUAL-GUIDE.md` | guide | Diagram-driven "how the project works" onboarding tour. |
| `docs/aba-payway-test-case-coverage.md` | report | Coverage assessment of all 28 supplied merchant test cases. |
| `docs/building-a-payway-sdk-cto-workflow-and-strategy.md` | strategy | Original CTO-level build strategy & workflow narrative. |
| `docs/cloudflare-free-webhook.md` | recipe | Free-tier Cloudflare Worker + D1 callback archive setup. Corpus-mapped. |
| `docs/glossary.md` | reference | Alphabetical glossary of PayWay terms. |

### 2.3 Competitive analyses (3)

| File | Classifier | Description |
|---|---|---|
| `docs/competitive-analysis-cutluy.md` | strategy | CutLuy vs this SDK (2026-08-21). |
| `docs/competitive-analysis-cli-stripe-razorpay.md` | strategy | Stripe CLI & Razorpay CLI vs this SDK/CLI (2026-09-08). |
| `docs/competitive-analysis-canadia.md` | strategy | Canadia developer portal vs this SDK (2026-09-11). |

### 2.4 `docs/agents/` — engineering-skill conventions (3)

| File | Classifier | Description |
|---|---|---|
| `docs/agents/domain.md` | meta | How the engineering skills consume this repo's domain docs. |
| `docs/agents/issue-tracker.md` | meta | Issue-tracker convention: `.scratch/<slug>/` markdown files. |
| `docs/agents/callback-capture-recipe.md` | recipe | How to capture a pushback/webhook contract during a sandbox campaign. |

### 2.5 `docs/archive/` — frozen historical inputs (7)

| File | Classifier | Description |
|---|---|---|
| `docs/archive/ABA Mobile Simulator App.md` | archive | Original simulator usage guide (superseded by docs/02 §simulator). |
| `docs/archive/ABA PayWay CLI SDK Requirements.md` | archive | Rewritten formal requirements + test cases for CLI/SDK. |
| `docs/archive/ABA_PAYWAY_NATIVE_SDK_RESEARCH.md` | archive | Deep research on existing PayWay SDKs/APIs (informed native design). |
| `docs/archive/ABA_PayWay_Native_SDK_Architecture_Guide.md` | archive | Native SDK architecture guide (July 2026). |
| `docs/archive/check-all-the-api-response-examples-…-time-format-….md` | archive | Raw question that produced the datetime reference (docs/22). |
| `docs/archive/customer module.md` | archive | Customer Module end-to-end lifecycle (early draft). |
| `docs/archive/customermoudle-guide.md` | archive | Customer Module knowledge base (early consolidation; fed docs/19). |

(`docs/archive/Default module.openapi.json` also lives here — the ABA OpenAPI spec — but is not markdown.)

### 2.6 `docs/diagrams/` + images (5)

| File | Classifier | Description |
|---|---|---|
| `docs/diagrams/callback-flow.md` | guide | Sequence: webhook verification → fulfillment. |
| `docs/diagrams/link-unlink-state-machine.md` | guide | COF token lifecycle state machine. |
| `docs/diagrams/payment-lifecycle.md` | guide | Full payment sequence incl. return-URL vs callback distinction. |
| `docs/diagrams/platform-decision-tree.md` | guide | Which integration approach fits your app. |
| `docs/images/qr-templates/README.md` | manifest* | Capture manifest for the QR template gallery. (*=generated) |

### 2.7 `docs/superpowers/` — SDD campaign docs (23)

| File | Classifier | Description |
|---|---|---|
| `docs/superpowers/plans/2026-07-17-merchant-scenario-coverage.md` | plan | Implementation plan: 28-scenario coverage campaign. |
| `docs/superpowers/plans/2026-08-21-official-aba-khqr-offline.md` | plan | Implementation plan: official ABA KHQR offline generation. |
| `docs/superpowers/plans/2026-08-22-agentic-payway-cli-implementation.md` | plan | Implementation plan: agentic CLI (the big one). |
| `docs/superpowers/plans/2026-09-12-competitive-portal-parity.md` | plan | Implementation plan: competitive portal-parity campaign. |
| `docs/superpowers/plans/2026-09-15-webhook-fast-start-design.md` | plan | Fast webhook-receiver startup design (background Windows runs). |
| `docs/superpowers/plans/2026-09-15-webhook-receiver-lifecycle.md` | plan | Webhook receiver lifecycle implementation plan. |
| `docs/superpowers/plans/agentic-payway-cli-status/TASK-001…013.md` (13 files) | ledger | Per-task status cards for the agentic-CLI plan (contracts, storage, ledger, providers, policy, registry, orchestrator, REPL, verification). |
| `docs/superpowers/specs/2026-07-17-merchant-scenario-coverage-design.md` | spec | Design: merchant scenario coverage assessment. |
| `docs/superpowers/specs/2026-08-21-aba-khqr-offline-design.md` | spec | Design: official KHQR offline payload builder. |
| `docs/superpowers/specs/2026-08-22-agentic-payway-cli-design.md` | spec | Design: agentic CLI (post architecture-review revision). |
| `docs/superpowers/specs/2026-09-15-webhook-fast-start-design.md` | spec | *(lives in plans/ — see above)* |

### 2.8 `docs/test-cases/` (1)

| File | Classifier | Description |
|---|---|---|
| `docs/test-cases/ABA PayWay TypeScript SDK — Senior Payment Integration Review.md` | review* | Senior-reviewer assessment of the SDK against the 28 cases. (*=audit) |

## 3. `knowledge/` — GENERATED corpus (30) — do not hand-edit

Produced by `npm run sync:knowledge` from `scripts/knowledge-sources.mjs` (31 sources; `error-codes.json` is not md). Every topic mirrors its source; freshness is test-gated (`src/__tests__/knowledge.test.ts`). Reorganizing sources in `docs/` requires updating the map in the same commit.

| Topic (file) | Source | Description |
|---|---|---|
| `quickstart.md` | `QUICKSTART.md` | First sandbox payment end to end. |
| `quickstart-1-page.md` | `docs/QUICK-START-1-PAGER.md` | Condensed create→verify→fulfill. |
| `docs-index.md` | `docs/README.md` | Docs index (relative links rewritten to `payway-sdk docs` commands). |
| `overview.md` | docs/01 | PayWay model & signing. |
| `setup.md` | docs/02 | Prereqs, creds, simulator. |
| `web-implementation.md` | docs/03 | Hosted checkout + purchase flow. |
| `native-apps.md` | docs/04 | Android/iOS integration. |
| `webviews.md` | docs/05 | Webview patterns. |
| `telegram-mini-app.md` | docs/06 | Telegram mini-app. |
| `qr-handling.md` | docs/07 | KHQR handling & expiry. |
| `deep-linking.md` | docs/08 | Deeplink scheme. |
| `link-lifecycle.md` | docs/09 | COF lifecycle. |
| `ui-customization.md` | docs/10 | Branding options. |
| `callbacks-webhooks.md` | docs/11 | Callbacks & HMAC. |
| `errors-and-debugging.md` | docs/12 | Error registry + playbook. |
| `deployment-checklist.md` | docs/13 | Go-live gates. |
| `code-snippets.md` | docs/14 | Snippet appendix. |
| `merchant-scenarios.md` | docs/15 | Scenario requirements. |
| `webhook-setup.md` | docs/16 | Webhook setup guide. |
| `payment-link.md` | docs/17 | Payment-link contract. |
| `transaction-journal.md` | docs/18 | Journal guide. |
| `customer-module-qr.md` | docs/19 | Customer Module QR. |
| `settlement-disputes.md` | docs/20 | Settlement & disputes. |
| `api-datetime-timezones.md` | docs/22 | Datetime reference. |
| `cloudflare-webhook.md` | `docs/cloudflare-free-webhook.md` | Cloudflare callback archive. |
| `agent-setup-playbook.md` | `docs/AGENT-SETUP-PLAYBOOK.md` | Agentic CLI bring-up. |
| `agentic-cli-guide.md` | `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md` | Agent surface guide. |
| `first-payment-walkthrough.md` | `docs/FIRST-PAYMENT-WALKTHROUGH.md` | Guided first payment. |
| `close-transaction-findings.md` | `docs/CLOSE-TRANSACTION-FINDINGS.md` | Close-transaction dossier. |
| `sdk-cli-reference.md` | `docs/SDK-AND-CLI-REFERENCE.md` | SDK/CLI reference. |
| *(error-codes.json)* | `docs/error-codes.json` | Machine-readable error registry (generated). |

## 4. `skills/` — packaged agent guides (36)

Source of truth, installed to agent targets by `skills add` (`skills/README.md` explains). One SKILL.md per workflow:

| Files (34) | Classifier | Description |
|---|---|---|
| `aba-payway-first-payment` | skill | Start a payment (QR / checkout / link), verify, fulfill once. |
| `aba-payway-qr` | skill | Online KHQR QR generation. |
| `aba-payway-offline-qr` | skill | Offline EMVCo KHQR without API calls. |
| `aba-payway-customer-qr` | skill | Portal static "Printed QR" channel (+ `references/fulfillment-outbox.md`). |
| `aba-payway-purchase` | skill | Signed checkout purchases. |
| `aba-payway-subscription` | skill | Recurring subscriptions (ctid + CITR_FIX). |
| `aba-payway-payment-link` | skill | Create/inspect/void hosted payment links. |
| `aba-payway-cof` | skill | Store token once, charge on demand. |
| `aba-payway-link-account` | skill | Link an ABA account (AOF). |
| `aba-payway-link-card` | skill | Link a card (hosted form). |
| `aba-payway-token-purchase` | skill | Charge a stored token. |
| `aba-payway-token-lifecycle` | skill | Renew / details / remove + 90-day expiry. |
| `aba-payway-remove-account` / `aba-payway-remove-card` | skill | Remove stored tokens. |
| `aba-payway-check-transaction` | skill | One-shot status check. |
| `aba-payway-transaction-detail` | skill | Full transaction detail. |
| `aba-payway-transaction-list` | skill | List with date/status filters (gateway-clock gotchas). |
| `aba-payway-transaction-by-merchant-ref` | skill | Lookup by merchant reference. |
| `aba-payway-transaction-close` | skill | Close unpaid transactions. |
| `aba-payway-refund` | skill | Refund a completed transaction. |
| `aba-payway-pre-auth` | skill | Pre-auth complete / complete-payout / cancel. |
| `aba-payway-payout` | skill | Payouts + split payouts. |
| `aba-payway-beneficiary` | skill | Payout beneficiary whitelist management. |
| `aba-payway-sandbox-beneficiaries` | skill | Seeded sandbox fixtures. |
| `aba-payway-exchange-rate` | skill | Current exchange rate. |
| `aba-payway-hash` | skill | Timing-safe HMAC verification. |
| `aba-payway-webhook-production` | skill | Production callback handling & recovery. |
| `aba-payway-sdk-configuration` | skill | SDK options + PAYWAY_* env vars. |
| `aba-payway-test-harness` | skill | Contract test harness / mock flow. |
| `aba-payway-journal` | skill | Local journal queries (timeline/stats/RCA). |
| `aba-payway-knowledge-base` | skill | Offline docs corpus search. |
| `aba-payway-agent` | skill | Agentic CLI modes, 14 tools, risk gates, ledger. |
| `aba-payway-bulk-operations` | skill | One operation across many tran ids. |
| `aba-payway-self-activation` | skill | Partner merchant onboarding trio. |
| `skills/README.md` | index | Skills catalog + install instructions. |

## 5. `.zcode/` — ZCode workspace files (46)

| Files | Classifier | Description |
|---|---|---|
| `.zcode/skills/aba-payway-*` (35) | generated* | Byte-identical installed mirrors of `skills/` (34 SKILL.md + fulfillment-outbox reference). Regenerated by the installer — never hand-edit. (*=installed copy) |
| `.zcode/skills/code-review/SKILL.md` | skill | Engineering code-review skill. |
| `.zcode/skills/setup-matt-pocock-skills/` (6 md) | skill | Issue-tracker/domain-doc/triage-label setup guides. |
| `.zcode/plans/plan-sess_*.md` (4) | plan | ZCode session plans: purchase-API campaign U1–U12; live-source audit → v1.4.0; hosted-checkout form helper + link image upload; payment-link void. |

(`agents-sdk/` and `sandbox-sdk/` skill dirs exist here but contain no `.md`.)

## 6. `audit-results/` — historical audits (31)

| File | Classifier | Description |
|---|---|---|
| `final-report.md` | audit | Pre-auth SDK/CLI audit master report (2026-08-26). |
| `dimension-2.1.md` … `dimension-2.7.md` (7) | audit | Per-dimension audit results: endpoint correctness, serialization, response/errors, auth/security, CLI UX, logging, code quality. |
| `edge-case-report.md` | audit | Edge-case sweep SDK+CLI (2026-08-30). |
| `code-improvement-plan.md` | plan | Remediation plan from the audits (2026-08-30). |
| `remediation-summary.md` | findings | What the first remediation wave fixed (2026-08-27). |
| `live-api-coverage-2026-08-31.md` | audit | SDK v1.3.0 vs developer.payway.com.kh page-by-page parity. |
| `live-parity-handoff.md` | meta* | Handoff for the live-parity branch. (*=meta) |
| `phase2-dynamic-test-log.md` | log | Dynamic test execution log. |
| `skills-sdk-cli-audit-2026-09-07.md` | audit | Seven-work-package audit; remediation-complete status. |
| `skills-improvements-review-2026-09-07.md` | audit | Review of the in-flight skills remediation. |
| `sync-audit-2026-09-01.md` | audit | SDK/CLI/skills/guides/knowledge cross-consistency audit. |
| `four-pillars/` (9 md) | audit | COF integrity audit @1.1.1: README scope, pillars A–D, grading scorecard, RTM, technical-debt register, **ABA-OPEN-QUESTIONS** (older consolidated ABA Q register — superseded in part by docs/INTEGRATION-GAPS). |
| `merged-remediation-review-2026-09-08/` (2) | audit | REPORT + CLOSURE of the merged remediation (main@64843d0). |
| `second-pass-2026-09-08/REPORT.md` | audit | Second-pass review of merged skills/SDK/CLI/docs. |
| `transaction-data-audit/` (2) | audit | Deep transaction-data & AI-readiness audit + session LEARNINGS (fed the journal campaign). |

## 7. `.scratch/` — campaign working files / issue tracker (58)

Convention: `.scratch/<feature-slug>/` (see `docs/agents/issue-tracker.md`). One row per campaign dir:

| Dir / files | Classifier | Description |
|---|---|---|
| `aof-cycle/STATE.md` | ledger | AOF live test-cycle state — COMPLETE (unlink/callback/QR-window results). |
| `cli-modernization/` (5: design + plan + phases 2–4) | plan | v1.6.0 CLI modernization design + per-phase implementation plans (merged). |
| `cof-full-cycle-audit/AUDIT-CARD.md` | audit | COF end-to-end audit card (link/link/charge; 104-blocker state). |
| `customer-module-qr/` (spec + webhook-receiver-run-findings) | spec | Customer-Module incorporation spec + receiver run findings (2026-09-15). |
| `full-audit-2026-09-12/AUDIT.md` | audit | Six parallel agents: CLI/SDK/skills/docs/onboarding audit @74b4fa5. |
| `link-card-review/REVIEW-CARD.md` | audit | Link-card full-cycle review card (landed as 4 commits). |
| `merge-integration/untracked-backup/` (2) | archive | Backups of untracked plan/analysis files during the portal-parity merge. |
| `merged-worktree-preservation-20260907/` (17) | archive | Preserved copies of DX-branch SDD ledgers + example README after worktree merges (duplicates `.superpowers/`). |
| `openapi-coverage-audit/` (6) | audit | OpenAPI vs SDK/CLI: final report, spec/sdk/cli inventories, coverage matrix, field-fidelity audit. |
| `openapi-suite-coverage/PLAN.md` | plan | Suite-coverage campaign plan (merged). |
| `opensource-release-polish/spec.md` | spec | Release-polish scope (in progress at time of writing). |
| `parity-check-2026-09-12/negative-control.md` | evidence | CLI negative-control probe outputs. |
| `payment-link-docs-review/` (5) | spec | Payment-link docs plan + official-doc extracts + codify backlog (C1–C3 shipped). |
| `publish-prep/PUBLIC-SURFACE-MAP.md` | report | What becomes public on push (2026-09-15; UNTRACKED — another agent's in-flight work). |
| `purchase-api-test-plan/` (TEST-PLAN + IMPROVEMENTS) | plan | 2026-09-05 purchase campaign test plan + follow-up backlog. |
| `skills-audit/` (7) | audit | 2026-09-03 audit of all 29 skills: report, group A/B/C, ABA questions draft, next-session list. |
| `storage-service/` (plan + plan-3 + plan-4) | plan | Storage waves 1/3/4 implementation plans (all merged). |
| `transaction-data-journal/IMPROVEMENTS.md` | plan | Journal-campaign follow-up backlog (open). |

## 8. AI-assistant ledgers (15)

| Files | Classifier | Description |
|---|---|---|
| `.superpowers/sdd/2026-08-22-agentic-payway-cli-implementation/` (9) | ledger | R1–R3 briefs + reports + progress ledger for the agentic-CLI plan. |
| `.superpowers/sdd/ABA-PayWay-DX-P1/progress.md` | ledger | DX P1 progress (codex/dx-p1). |
| `.superpowers/sdd/ABA-PayWay-DX-P2/progress.md` | ledger | DX P2 progress (codex/dx-p2). |
| `.superpowers/sdd/ABA-PayWay-DX-overhaul/merge-readiness.md` | findings | DX integration/merge notes (2026-09-06). |
| `.kilo/plans/1784335168528-…md` | plan | SDK audit & AI-friendliness plan (2026-07-18). |
| `.kilo/plans/1784560610166-…md` | plan | QR-REQ-04/05 lifetime parameter plan. |
| `.kilo/plans/1784564346762-…md` | plan | QR-REQ-11 retry defaults plan. |

## 9. Evidence, logs, samples, misc (26)

| Files | Classifier | Description |
|---|---|---|
| `test-output/purchase-test-campaign/` (5: REPORT + WAVE captures) | evidence | Live purchase-campaign wave captures + final report (2026-09-05). |
| `test-output/qr-lifecycle-retest-2026-09-05.md` | evidence | QR lifetime/expiry retest output. |
| `test-logs/integration-report-2026-07-18T*.md` (4) | log | Early integration run logs. |
| `examples/first-payment/README.md` | sample | Reference web app teaching the complete payment lifecycle. |
| `sdk/android/README.md`, `sdk/ios/README.md` | sample | Native companion SDK READMEs (bottom sheet, deeplinks). |
| `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, `PULL_REQUEST_TEMPLATE.md` | policy | GitHub contribution templates. |

## 10. Vendored reference — `payway-boilerplate/` (7 real)

| File | Classifier | Description |
|---|---|---|
| `ABA KHQR onsite generation/PayWay Offline KHQR ….md` | vendored | ABA's official offline-KHQR billing doc. |
| `PHP Sample Checkout/` (README, QUICKSTART, COMPARISON, IMPROVEMENTS) | vendored | Official PHP sample + our analysis of it. |
| `merchant-qr-pos/README.md` | vendored | Official merchant QR POS sample. |
| `payment_link_api/README.md` | vendored | Official payment-link sample API. |

## 11. Bulk trees — do not enumerate individually (2,169)

| Tree | Files | Classifier | Description |
|---|---|---|---|
| `.release-audit/clean-source*` (4 variants), `current-reviewed/`, `exact-candidate-20260908/`, `allowlist-regression/` | 1,401 | snapshot | Frozen full working-tree copies taken for the publish audit — duplicate the repo's own docs. |
| `payway-boilerplate/**/node_modules/` | 651 | vendored | Dependency READMEs inside the vendored samples. |
| `examples/first-payment/node_modules/` | 90 | vendored | Installed `aba-payway-ts` package copies + dependency docs. |
| `.kilo/node_modules/` | 27 | vendored | Kilo tool dependencies. |
