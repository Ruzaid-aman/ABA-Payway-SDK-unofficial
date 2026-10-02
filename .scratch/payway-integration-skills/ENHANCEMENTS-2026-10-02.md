# Integration skill enhancements — 2026-10-02

Scope: user-authorized implementation following the [146-requirement review](ADDITIONAL-REQUIREMENTS-REVIEW-2026-10-02.md). Historical coverage labels in [the traceability matrix](REQUIREMENTS-TRACEABILITY-2026-10-02.md) describe committed candidate 24dbb4a; they are not claims that every requirement is now complete.

Branch: codex/payway-integration-skills. Community-maintained skill metadata: 1.1.0; SDK public interfaces/version unchanged. Current local candidate remains uncommitted until requested.

## What changed and what remains

| Review area | Implemented resources | Remaining acceptance / bank input |
|---|---|---|
| F1 financial foundation | Currency-aware money conversion; scoped orders, immutable attempts, receipts/inbox/outbox; retained history; exact verified state; approved payment preserved on duplicate/stale observations | Merchant durable DB migration, multiple receipt allocations, reversals and full ledger need application-specific work; Q48 |
| F2 inquiry and recovery | Local customer status, scheduled worker interface, coalesced concurrent calls, current status first, historical enrichment paced at 6.1 seconds per merchant/process, old transactions routed to detail | Shared multi-host budget/leases, original-money proof and lost link-ID recovery; Q47 |
| F3 endpoint/callback contracts | Per-operation authority template, captured signed Printed QR distinguished from unsigned offline, COF token inquiry limit, explicit acknowledgment, Next streaming size/JSON guards | ABA-approved service/version vectors and definitive ACK policy; Q46/Q51 |
| F4 onboarding and gates | Integration profile and G0–G7 evidence schema, plugin-first selection, network/environment migration, controlled production rollout and rollback | Merchant entitlements, credential policy and actual production acceptance thresholds; Q44/Q49 |
| F5 settlement | Report provenance/completeness workflow, authoritative joins, exception process; exact normalized batch reconciler with explicit tolerance and duplicate conflict checks | Bank report adapter/schema, fees/FX, real ledger and bank credit cycle; Q45 |
| F6 UI/mobile | Verified state mapper, actionable state copy, mobile/deeplink/physical QR/device/accessibility and operator acceptance guidance | Merchant UI implementation and approved ABA branding/simulator acceptance; Q50 |
| F7 advanced operations | COF/subscription/pre-auth/refund/payout/split/Printed QR/Soundbox/partner enablement, durable consent, recurring scheduling, refund/hold/payout controls, incident runbooks | Actual advanced adapters/cycles and bank-confirmed product contracts; Q52–Q54 |
| F8 evaluation/maintenance | New regressions, nine installed assets, updated installer/resource counts, generator freshness and enhancement evidence | Claude remains user-deferred; hosted/native/paid acceptance and inherited release gates remain open |
| F9 plugins/companion | Existing plugin adaptation-first routing, adjacent product scope and internal companion design | Official adapters/product permission and redistribution policy; Q55/Q56. No plugin package or internal service launched |

Public resources: docs/guides/integration-onboarding.md, integration-contracts.md, integration-finance.md, integration-operations.md and integration-ui.md. They are generated into knowledge, packaged docs and standalone skill-local references. Internal companion and ABA register remain private development material.

## ABA questions

Canonical register: audit-results/four-pillars/ABA-OPEN-QUESTIONS.md, Q44–Q56. Each question identifies the affected workflow, responsible bank/product owner, required answer/evidence and safe interim claim. Existing questions/evidence are retained, including the dated successful account-token cycle; card/MIT enablement cannot be inferred from it. Nothing was sent to ABA.

## Fresh verification

| Check | Fresh outcome |
|---|---|
| SDK build | PASS: ESM/CJS/declarations/CLI; existing MCP CJS import.meta warning |
| Typecheck / lint | PASS; recipe lint clean, two existing unused-import warnings, one test style suggestion |
| Whole offline suite | PASS: 2,249 tests in 157 files; two workers, 30s test timeout. Opt-in sandbox contract file excluded |
| Core integration / second-pass regressions | PASS: 48 tests in three files; 21 foundation cases, 21 integration cases, six standalone/distribution cases |
| Frontmatter and standalone resources | PASS: skill-creator validation; 42 local references + nine assets with provenance; recursive mirrors; all five installer targets/manual folder installation/upgrade/removal tested |
| Package / repository / public docs | PASS: 210 package files, 35 skills, 11 repository entry documents, 239 generated API/doc files. Not a history/rights or API-doc completeness clearance |
| Packed consumer | PASS: installed nine assets compile; six Express HTTP/Next handler core cases execute; SDK exports/types, CLI, navigation and installer ownership checks pass |
| Real Next | PASS: Next 16.3.8 production build and QR/hosted/link HTTP; current recipe assets, scheduled synthetic worker, ownership, signed/unsigned policy, verified local state and one outbox job |
| Exact extracted candidate secret scan | PASS: zero findings with Gitleaks 8.30.1; its retained release ZIP hash rechecked against published checksums. Exact-fixture allowlist plus six negative controls pass |
| Fresh Codex | PASS with recorded evaluator follow-up: six route/framework cases plus recovery and 42 extra cases. Two trial findings propagated into canonical recovery/flag handling; see AGENT-TRIALS.md |
| Claude / live / production / settlement | Claude user-deferred; no new successful bank-paid, production or settlement cycle. G3/G5/G6 evidence is not supplied by these simulations |

Final second-pass tarball SHA-256: 4c27be52400826207725ad5b8f91211c6d12b4dde4d4b5bbb4a67090b9bd60d6. Prepared at payway-agent-trials-PHyp9B in a temporary independent consumer. Older October 1 candidate archives are historical and must not be used to release these changes.

Synthetic behavior never establishes gateway payment, production acceptance or settlement. No bank payment/credential mutation, external message, push, tag or publication was performed.

## Whole-skill second pass

Reviewed the concise router and flow/entitlement/evidence matrix; all 42 local references and nine assets; package navigation, anchors, provenance and recursive mirrors; installation ownership; payment/recovery/UI/finance boundaries; public versus internal material; current official inquiry, checkout and KHQR sources. Advanced and adjacent operations remain selectively documented with explicit implementation/entitlement limits.

| Finding | Fix and regression |
|---|---|
| Paid callback replay reactivated reconciliation indefinitely | Preserve minimal durable inbox receipt but keep verified attempts out of active inquiry; duplicate remains one outbox job |
| Late create completion/error overwrote a worker's paid/review state | Creation writes transition only the initial creating state; retain the worker's decision and artifact/history |
| Signed callback transaction and chosen reference could disagree | Require saved-route identity consistency before durable acceptance |
| Empty report input could match a zero booking | Require nonempty scoped/batch/currency evidence; compare duplicate row fields canonically, independently of object property order |
| Gate timestamp accepted timezone-naive input | Require timezone-aware ISO evidence timestamps |
| A late configuration rejection could clear review recovery without changing the reviewed attempt | Only clear inquiry when rejection actually transitioned a creating attempt; reproduced by a failing regression before repair |
| Joined concurrent reconciliations both reported a new job insertion | Only the initiating reconciliation returns fulfillmentQueued=true; joined callers return false while sharing the same verified outcome |

Also aligned the stale public explain-104 example with current CLI behavior. Official recheck: [current inquiry](https://developer.payway.com.kh/check-transaction-14530826e0), [historical detail](https://developer.payway.com.kh/get-a-transaction-details-14530824e0), [checkout](https://developer.payway.com.kh/ecommerce-checkout-3158159f0), [KHQR](https://developer.payway.com.kh/khqr-guideline-3192101f0). Source retrieval is not API-owner approval; unresolved cross-language vectors, current-money proof and product policies remain Q44–Q56.

No remaining reproducible local failure was found in the executed checks. This is a bounded offline/candidate review, not a complete audit of every merchant, advanced adapter or bank runtime. Required Claude, owner, hosted/native/runtime, current-profile paid acceptance and finance/publication gates remain open; retain Do Not Ship.

Final whole-suite run: 2,249 passing tests / 157 files, 97.49 seconds. Final packed-consumer and Next HTTP reruns pass after both trial findings were propagated. The tarball contains 210 files, 1,259,099 packed bytes and 5,062,532 unpacked bytes; final extracted secret scan has zero findings. Latest repository boundary includes 1,826 tracked/intended paths and 11 entry documents. Worktree changes remain uncommitted on the existing branch.

## Usage-help follow-up — 2026-10-02

Skill 1.1.1 recognizes requests to explain its own use. The concise router points to the existing agent-integration guide: installation/discovery and invocation, learn/choose/plan/implement/review/troubleshoot/launch tasks, useful non-secret context, expected results and continuation/recovery prompts. A help request stays guidance-only; implementation can proceed within its actual authorization. Generated references/provenance/mirrors include the new anchor; 35 skills, 42 topics and nine assets remain unchanged. No new bank-policy question arose.

Fresh checks after this prose/router slice: frontmatter validator in Python UTF-8 mode; 15 tests in two knowledge/distribution files; package navigation/boundary (210 files), public docs (239 generated files), repository boundary and packed-consumer smoke including six simulated Express/Next cases and installer ownership pass. Exact extracted candidate scan: Gitleaks 8.30.1, zero findings. Git whitespace passes. No payment/runtime implementation changed in this slice; the 2,249-test whole-suite and real Next evidence above remain the behavior baseline rather than a new rerun.

Independent complete-folder help trial: payway-skill-usage-Z96K0Q, Codex 0.154.0/default gpt-6-astra. It read the skill and selected local references, compared QR/hosted/link for an existing synthetic Express/PostgreSQL invoicing app, identified non-secret prerequisites and supplied a planning prompt. No evaluator intervention; only read commands in the transcript; all merchant and installed-skill file hashes unchanged. No gateway/network operation was executed. Scope is usage guidance, not a new merchant/payment acceptance trial; see AGENT-TRIALS.md.

Current usage candidate archive: C:/Users/syed.sohailmehdi/AppData/Local/Temp/payway-skill-usage-Z96K0Q/aba-payway-ts-1.5.0.tgz. SHA-256: 6a5e20fcd5cdfc68a25fa92074c050ed001b600412e5ca2d9b96f870d1c754d8; 1,261,087 packed bytes. The preceding second-pass hash identifies its historical archive before these guidance changes. Reproduce preparation/file-integrity checks with prepare-usage-trial.mjs. No new full catalog release, bank payment, credential mutation, Claude run, external message, commit, push, tag or publication. Existing Do Not Ship boundary remains.
