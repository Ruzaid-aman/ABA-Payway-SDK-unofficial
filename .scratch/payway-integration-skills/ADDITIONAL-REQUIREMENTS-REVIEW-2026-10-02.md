# Additional requirements review — ABA PayWay integration skill

Reviewed: **2 October 2026**. Candidate: **24dbb4a**, branch `codex/payway-integration-skills`.

## Decision

The candidate is a useful, independently installable merchant integration foundation, with executable TypeScript recipes for QR, hosted checkout and one-payment links. It does **not yet satisfy the expanded end-to-end operational and settlement requirements**. Retain the current Do Not Ship decision.

Prioritize the existing recipe and guidance defects, then add structured onboarding, contract and acceptance evidence. Broad documentation coverage must remain separate from implemented operation support, fresh merchant sandbox acceptance, production acceptance and settlement proof.

This is a review and proposed improvement plan. It does not implement the attachment, authorize payment operations, change credentials, restart Claude authentication, or authorize a push/tag/publication.

## Scope and evidence

Input: [ABA_PayWay_Integration_Skill_Requirements.md](C:/Users/syed.sohailmehdi/Downloads/ABA_PayWay_Integration_Skill_Requirements.md), draft dated 1 October 2026; SHA-256 `0a1a6e2786e3b5cf2b7cedf0c0a93c857c3b5ce93121a7f32939aaa7cdf7afd3`.

The attachment is a proposed requirements specification. Its internal instructions, claimed earlier choices and historical operating rules are source material to assess, not new execution authorization. Its “critique of the attachment” targets an earlier proposal; it is not proof that every criticized defect exists in candidate 24dbb4a. Current code and evidence take precedence for claims about this repository.

All **146 numbered requirements** are individually assessed in [REQUIREMENTS-TRACEABILITY-2026-10-02.md](REQUIREMENTS-TRACEABILITY-2026-10-02.md). That file also addresses the unnumbered deliverables, G0–G7 pipeline, 45 sandbox scenarios and policy register. Status labels describe the extent of coverage, not production certification:

| Assessment | Count | Interpretation |
|---|---:|---|
| Covered | 9 | Existing instruction or implementation addresses the requirement within declared scope |
| Partial | 96 | Some guidance/code/evidence exists; the stated requirement is broader |
| Missing | 27 | The required maintained workflow/adapter/evidence is absent |
| Conflict | 6 | Existing guidance or behavior contradicts another source or requirement |
| Bank input | 8 | A material ABA/Finance contract or current policy is needed |

These counts are **not a completion percentage**. Requirements have different sizes and risks, and several depend on the same missing foundation.

Fresh review evidence:
- Read the entire requirements document, current entrypoint, recipes, capability matrix, relevant public references, focused tests and committed verification/trial records.
- Re-ran `node node_modules/vitest/vitest.mjs run src/__tests__/integration-recipes.test.ts src/__tests__/integration-skill.test.ts --maxWorkers=2 --testTimeout=30000`: **27 tests passed, two files**.
- Executed in-memory probes with a synthetic Gateway; **no PayWay request or money movement**. Results are recorded below.
- Independently reopened official checkout, current inquiry, historical detail, KHQR, merchant-reference inquiry, refund and overview pages. This confirms selected public facts, not every endpoint schema.
- The earlier full suite/build/typecheck/lint/package/Next/Codex results are **recorded candidate evidence**, not newly rerun here. [VERIFICATION.md](VERIFICATION.md) reports 2,228 passing tests and publication limitations. Claude remains deferred by the user. No fresh successful bank-paid cycle or settlement proof is claimed.
- The historical verification record says “staged/no implementation commit”; that was its pre-commit snapshot. This review identifies the actual committed candidate as 24dbb4a.

## What is already strong

| Area | Existing asset and evidence | Remaining boundary |
|---|---|---|
| Portable skill architecture | Concise [entrypoint](../../skills/aba-payway-integration/SKILL.md), selective routing, generated local references/assets and provenance | Add focused references and templates; keep the entrypoint concise |
| Project adaptation | Existing framework/order/auth/database/worker inspection; reusable Express/Next handlers | Structured merchant/outlet/finance profile and customer UI acceptance are incomplete |
| Core server integration | Server-owned prices and ownership checks; attempts reserved before submission; customer artifact projection | Core recipes cover QR/hosted/one-payment link, not every advanced workflow |
| Callback/recovery mechanics | SDK signature helpers, explicit unsigned link hints, durable minimal inbox, queued inquiry, missing-callback recovery | Contract/version identity, ACK policy and receipt/evidence records need strengthening |
| Duplicate protection | SQLite transaction plus one unique fulfillment outbox row; restart and two-connection tests | One queued job is not proof of delivered external fulfillment or a complete payment ledger |
| SDK/CLI reuse | Existing endpoint signing, validation, lifecycle, diagnostics, correlation IDs and fixtures | Merchant financial workflow correctness needs more than valid SDK requests |
| Coverage disclosure | Advanced enablement blockers and spec-derived Soundbox/partner limitations visible | Replace family-level evidence with operation/method/currency/profile records |
| Distribution | Recorded five-target standalone/full installation, update preservation, removal/doctor, packed consumer and manual-copy checks | Repeat relevant gates after the next implementation; owner publication gates still apply |

The attachment's invented four-field hash, undefined callback hash helper, non-compiling callback example, generic UUID recommendation and mandatory plugin-manifest proposal are not defects to reintroduce or “fix” without checking current code. Our candidate already reuses actual SDK helpers and hosted browser form transport.

## Priority findings in current assets

### F1 — Financial state, money and attempt persistence (P0)

1. **Raw approval is exposed after evidence rejection.** [service.ts:110](../../examples/integration-recipes/service.ts:110) calls `store.accept()`, then derives status/lifecycle from the raw proof. The fresh mismatch probe returned `status: APPROVED, lifecycle: approved, fulfilled: false` for USD 4 against a USD 3 order. The database correctly queued **no** fulfillment for that mismatch, but the customer result can still look successful. Separate raw gateway state, verification outcome, persisted paid state, job creation and actual fulfillment delivery.

2. **Repeated success is indistinguishable from failed verification.** The first correct inquiry returns `fulfilled: true`; an identical duplicate returns false because no new outbox row was inserted. That boolean describes a newly queued job, not the current fulfillment state. A subsequent synthetic PENDING response returns a pending lifecycle after the order is already paid; the paid flag and one job remain in storage. Preserve verified payment state monotonically, and expose duplicate/mismatch/pending distinctions.

3. **Attempts do not snapshot prices.** [sqlite-store.ts:49](../../examples/integration-recipes/sqlite-store.ts:49) joins the current order amount/currency. In the probe, changing the order amount from 301 to 400 changed the saved attempt's apparent price. Capture immutable money, owner/tenant, environment/MID, service/configuration version and timestamps in the attempt. Order changes must not rewrite submitted obligations.

4. **Only one attempt is possible for an order forever.** [sqlite-store.ts:23](../../examples/integration-recipes/sqlite-store.ts:23) makes order_id UNIQUE. After a synthetic verified decline, create returned the same artifact/attempt. Introduce an active-attempt lock and retained attempt history. Replacement is permitted only after authoritative resolution and an approved local policy; no timeout-based blind replacement.

5. **Currency validation is too late for the recipe store.** It accepts a KHR order amountMinor of 301; the adapter divides by 100, producing 3.01 KHR. The SDK's `validatePositiveAmount` correctly rejects that amount before transport. The recipe nevertheless persists invalid money and treats all create errors as “unknown,” blocking the order. Use explicit currency scales and validate before reservation/submission; distinguish proven local/no-submit rejection from ambiguous transport outcomes. The [official KHQR guideline](https://developer.payway.com.kh/khqr-guideline-3192101f0) expressly prohibits decimal KHR amounts; verify serialization/minimums for each advertised endpoint.

6. **Receipt and tenant scope are incomplete.** The teaching store has orders/attempts/minimal inbox/reconciliation/outbox, but no immutable verified receipt ledger, MID/environment/tenant keys or operation-level financial records. Add scoped uniqueness and key selection. Keep receipt identities separate from invoice references, since offline QR can receive multiple payments.

Acceptance: mismatched or cross-scope proof produces a review state and no job; repeated approval reports the same paid receipt; later pending does not downgrade payment; changed orders cannot alter attempts; invalid money fails locally without an unknown attempt; verified failed attempts can be safely replaced; restart/concurrency still produce one payment posting and one intended fulfillment.

### F2 — Correct inquiry endpoint and recovery scheduling (P0)

[payway-gateway.ts:69](../../examples/integration-recipes/payway-gateway.ts:69) uses historical transaction detail for every QR/hosted lookup, including customer GET status reads. Official [Transaction Details](https://developer.payway.com.kh/get-a-transaction-details-14530824e0) says it is not suitable for real-time processing checks and has a fixed ten requests/minute limit. [Check Transaction](https://developer.payway.com.kh/check-transaction-14530826e0) is the current-status route with a seven-day window.

The SDK already supplies per-instance throttling in [client.ts:1208](../../src/client.ts:1208). This is not a claim that rate limiting is absent everywhere. It does not supply shared merchant/application pacing, cache or single-flight across instances.

Use current status for processing and bounded historical/detail lookup only when needed for final money/identity/operation evidence. Define the original-currency proof strategy explicitly: the current-status sample alone does not expose the same fields as detail. A fast status check cannot replace amount/currency binding. Serve customer views from persisted state, coalesce requests, schedule jittered recovery, stop active terminal-state polling, and preserve slow unresolved recovery.

The [merchant-reference endpoint](https://developer.payway.com.kh/get-transactions-22366268e0) returns only the last 50 matches and is limited to ten requests/minute. Existing guidance mentions this, but finance reconciliation must use an approved complete source when history can exceed it.

Acceptance: UI refreshes do not trigger a provider request each time; concurrent clients share inquiry; old transactions use the appropriate route; limit/429/outage/window/completeness scenarios pass without duplicate creation or unverified fulfillment.

### F3 — Versioned contracts and contradictory callback guidance (P0)

- **Printed Customer QR contradiction:** the [entrypoint:43](../../skills/aba-payway-integration/SKILL.md:43) and [capability matrix:44](../../docs/guides/24-agent-integration.md:44) classify printed KHQR notifications as unsigned, while [Customer QR guide:49](../../docs/guides/19-customer-module-qr.md:49) describes a signed captured Customer Module callback. Offline KHQR and Customer Printed QR must be separate service/profile/version contracts. Never pick a weaker policy merely because the signature header is absent.
- **ACK contradiction:** [Express:23](../../examples/integration-recipes/express.ts:23) and Next return 202 JSON, while existing Customer QR/settlement guidance says HTTP 200 within approximately five seconds. The new document asks for contract-configurable ACK. This review does not prove all gateways reject 202; it identifies a contract discrepancy requiring confirmation and tested service-specific status/body/timeout.
- **Durable acknowledgment wording:** existing settlement guidance says “immediate 200, async processing.” Make durable validated inbox acceptance explicit before successful ACK; asynchronous fulfillment may follow.
- **Golden vectors:** SDK tests cover many hash orders and basic callback canonicalization. They are not a complete API-owner-approved vector set for every endpoint and callback version. PHP's example serialization is not automatically identical to JavaScript for booleans, Unicode or nested JSON. Obtain canonical bytes/digests/wire payloads; test cross-language parity before promising another language.
- **Authority versus freshness:** generated provenance hashes prove which repository files were copied and whether they changed. Add source URL/version, verified-at, environment/profile scope, reviewer/owner, approval and unresolved contradictions per operation/fact. Source migration must rerun affected checks.

The current official [checkout guide](https://developer.payway.com.kh/ecommerce-checkout-3158159f0) documents JSON POST notifications and the HMAC-SHA512 header; that does not establish the contract for every legacy or adjacent service.

Acceptance: no conflicting installed references, explicit signature/ACK policy per supported service, no missing-signature downgrade, approved serialization vectors, receipt identity and tenant binding, source conflict registry, and a test changing callback fields/format/keys/limits.

### F4 — Intake, onboarding and G0–G7 evidence (P1; release-dependent P0 inputs)

Current setup/deployment guides are useful but do not produce the required structured integration profile and stage records.

Add templates for:
- merchant role/platform/order/tenant/outlet/terminal/app mapping;
- methods/currencies/entitlements, protected credential/account references and owners;
- URL roles and separate inbound callback/outbound egress configuration;
- sandbox registration, credential type/expiry and current simulator build/device guide;
- gate status/owner/time/evidence/blocker, controlled production authorization and test result.

Infer project facts and load only applicable fields. Do not ask a simple QR merchant to resolve every adjacent service before proceeding.

G0–G7 are **merchant acceptance gates**, separate from this repository's package/publication checks. Do not mark a gate passed because code compiled. G5/G6 need ABA's existing transaction acceptance rule; exact counts, amounts, required methods/currencies/outlets/operations and permitted launch conditions are currently unavailable.

**Rollback correction:** [deployment-checklist.md:237](../../docs/guides/13-deployment-checklist.md:237) tells a live merchant to switch back to sandbox. Replace this with disabling new production initiation while retaining the production callback, key/version adapters, receipts and reconciliation for in-flight transactions. Use a separate test environment for debugging.

Acceptance: agents generate a valid masked profile and honest gate record, complete offline work with missing onboarding inputs, identify exact affected blockers, and never turn sandbox proof into production/settlement approval.

### F5 — Receipt-to-settlement workflow (P1; G6 contract inputs P0)

Existing settlement guidance is introductory. The SDK journal is diagnostic exchange evidence, not a merchant accounting ledger or bank settlement proof.

[settlement-and-disputes.md:53](../../docs/guides/20-settlement-and-disputes.md:53) suggests amount/time/masked-PAN/APV matching when a reference is missing. Such a heuristic may generate investigation candidates, but must not auto-certify settlement. Add authoritative receipt/operation/MID-to-report joins and batch-to-bank mapping. Invoice references may be one-to-many.

Add synthetic fixtures and reusable import/match/exception guidance:
- actual report schema/grain/cutoff/access and source checksums;
- original/payable/payer/settled currencies and amounts;
- approved fee/refund/FX/adjustment component model;
- idempotent import and completeness/duplicate controls;
- unresolved discrepancy owner/time/evidence;
- finance-approved tolerance and first/later-batch signoff.

Do not universalize fee booking, payout settlement or agreement-specific finance behavior from a historical campaign. Verify sale/capture, refund debit/netting and payout source/all-beneficiary outcomes separately. The official [Refund API](https://developer.payway.com.kh/refund-api-14530821e0) documents completed-payment eligibility, partial refunds and outlet/terminal enablement; it does not supply the merchant's settlement join/schema.

Acceptance: synthetic duplicate/missing/refund/fee/FX/batch cases produce deterministic matches and exceptions without reposting; no ambiguous heuristic clears a discrepancy; G6 remains pending/blocked until the required actual report/bank evidence and authorized signoff exist.

### F6 — Customer experience and mobile acceptance (P1)

There is a first-payment teaching UI and substantial QR/native/webview/deeplink guidance. The new Express/Next assets mostly provide server handlers and payment artifacts. An executed HTTP handler trial is not an approved customer UI or physical-device journey.

Add a small reusable authenticated customer screen/state contract:
- order identity/amount/currency and profile-enabled methods;
- QR/hosted/link presentation and safe return destinations;
- loading, pending/unknown, verified success, decline/cancel, local expiry and late-payment review;
- restore existing attempt on refresh/app return;
- receipt fields from verified persisted state;
- keyboard/focus/contrast/zoom and responsive checks;
- physical iOS/Android installed/missing-app, background/process-death, callback-return ordering and QR scan/print evidence.

Official logos/guidelines and any modal/bottom-sheet/hosted-QR rollout require current assets/contracts. Do not replace a missing contract with a custom raw-card/iframe route.

Acceptance: real framework/browser checks, adversarial unverified-success cases, accessible states, and labeled device/sandbox evidence for the selected method. Native and adjacent platforms remain separately scoped.

### F7 — Advanced operation adapters and operations (P1/P2 by advertised scope)

Advanced workflows currently have SDK methods, references, offline tests and dated evidence/blockers. They lack a uniform merchant-ready durable business workflow.

Add selectively:
- offline/reusable-link receipt ledger, allocations and excess/late-payment exceptions;
- COF encrypted scoped token/consent records and one billing-cycle operation lock;
- provider-versus-merchant scheduling, revocation and in-flight cancellation;
- hold/capture/cancel state and atomic race prevention;
- refundable-balance reservation including uncertain/concurrent partial refunds;
- payout intent/source/allocations and per-beneficiary result/recovery;
- operator authorization/audit, outbox delivery leasing/retry and protected evidence retention;
- callback/unknown/inquiry/fulfillment/finance monitoring and owned incident runbooks.

A valid SDK call is not acceptance of the full module. Never invent a refund/payout-status API when the available contract offers none; preserve unknown and escalate with original references.

Acceptance: each advertised operation has an approved route or explicit limitation, durable intent, correct authorization, unknown-outcome recovery, operation-level tests/evidence and finance consequences where applicable.

### F8 — Evaluation, release evidence and maintenance (P1)

Maintain requirement → resource → implementation → scenario → evidence → owner traceability. Reuse recorded package/installation checks and rerun them on the updated exact candidate.

Extend Codex scenarios to the new F1/F2 findings, adversarial money/refund/settlement/API prompts, offline invoices, mobile, enabled advanced operations and source migration. Claude remains explicitly deferred; do not claim its behavior passed. Actual target installation compatibility and agent effectiveness remain distinct.

Keep TypeScript first. PHP/Laravel and Python are proposed later scope; only add them when the same approved signing vectors and lifecycle criteria pass. `agents/openai.yaml` is optional UI metadata, not a payment-safety release blocker. Do not make MCP, hosted discovery, Postman or a new OpenAPI client mandatory.

Define named maintenance owner, review cadence, version/API compatibility, changes/migrations and retirement; preserve local corpus/mirror generation. Release still requires existing audit dispositions, security/rights/brand/product decisions, intended publication version/destination and the curated public tree with fresh history.

### F9 — Plugins, adjacent products and internal companion (P2; contract-gated)

Evaluate official plugins first for Shopify/PrestaShop/WooCommerce/Odoo, with verified version/feature/upgrade/rollback tests. They are new supported integration routes; ordinary Node recipes do not certify them.

POS/ECR, ABA Mini Apps, partner portfolios and BillZone need their own owners, approved protocols/environments, entitlement and acceptance evidence. Existing Telegram Mini App/mobile guidance does not establish an ABA Mini App contract. Existing spec-derived self-activation endpoints do not establish full partner provisioning.

The candidate excludes internal dossiers from the public package; this is valuable but is **not an implemented internal ABA companion**. Define a restricted separate edition for confirmed profile/report/approval/support workflows. Never copy restricted policies or raw captures into the public corpus. New public claims about these companions must remain blocked/planned until contracted and tested.

## Proposed sequence, owners and dependencies

Owners below are proposed roles to be assigned, not existing bank approvals.

| Work | Priority and dependency | Proposed owner | Completion evidence |
|---|---|---|---|
| F1 money/state/receipt/attempt foundation | P0; independent engineering can start | SDK/skill maintainer + merchant engineering | New mismatch/state/money/snapshot/replacement/scope tests; durable receipt/outbox |
| F2 inquiry/cache/recovery | P0; coordinates with F1/F3 proof contracts | SDK/skill maintainer | Current/history routing, shared pacing/cache, outage/window/limit tests |
| F3 contracts/callback/source registry | P0; unknown facts require API owner | PayWay API owner + maintainer | Contradictions closed, approved vectors/ACK/version records |
| F4 intake/onboarding/gates/rollback | P1; production acceptance inputs P0 | Integration/onboarding + merchant owner | Profile/gate templates, verified current onboarding and controlled policy |
| F5 settlement workflow | P1; financial source/joins/policy P0 inputs | ABA Settlement + merchant Finance | Fixture imports/matches/exceptions plus actual G6 evidence when authorized |
| F6 UI/mobile | P1; F1/F3 and approved UI assets | Merchant frontend + Product/Design | Browser/accessibility/device journey and verified state |
| F7 advanced operations/monitoring | P1 for claimed operations; P2 expansion; F1/F3/F5 | Relevant API/product + merchant operations | Per-operation ledger/locks/recovery/test/evidence |
| F8 evaluation/maintenance/release | P1; after changed modules stabilize | DX/release owner | Exact-candidate eval, packaging/runtime/rights gates and owner signoffs |
| F9 plugins/companions/internal edition | P2; approved independent contracts | Respective product owners | Versioned companion/module acceptance and restricted distribution |

Suggested next implementation slice: **F1 + F2 + the known F3/F4 guidance contradictions**. It fixes demonstrated weaknesses while bank owners supply missing contracts. Then implement profile/gate/settlement templates and the core customer journey. Expand advanced modules only with truthful operation-level claims.

## ABA inputs to request without blocking independent work

1. Existing production acceptance rule: owner/version, exact test count/amount limits and method/currency/outlet/operation coverage.
2. Settlement/report/bank evidence: schema/grain/join keys, fees/FX/cutoffs/tolerance, access and signoff owner; launch conditions before first settlement.
3. Callback service/profile/version policy: signature canonicalization/key, ACK body/status/timeout and actual delivery/replay behavior.
4. Endpoint contracts/vectors: hosts, request/response/encoding/money/ID/state/limits and enablement.
5. Current onboarding/simulator materials and approved UI/brand assets.
6. COF consent/scheduler, pre-auth remainder/release, refund, payout inquiry/source/report and adjacent-product rules.

Do not invent the document's historical 72-hour activation expiry, three-working-day go-live SLA, simulator account/validity limits or other operational promises. Ask the named owners for current evidence.

## Ship boundary

A first release may describe all documented PayWay families while marking operation limitations clearly. It must not advertise every service as end-to-end implemented or settlement-verified.

Do Not Ship with unresolved F1/F2 defects, contradictory security/rollback guidance, unowned source facts, broken references/dependencies, required failing checks or claims of bank/production/settlement approval that were not performed.

Ship only the declared supported scope after its code/guidance/installation/evaluation checks pass and applicable owner/publication gates are met. A merchant's G5/G6 acceptance remains a separate controlled journey using ABA's rule.
