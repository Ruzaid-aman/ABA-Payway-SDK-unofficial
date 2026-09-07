# PayWay SDK, CLI, skills, and documentation audit

Date: 2026-09-07. Status: **remediation complete for all seven work packages** (see "Remediation status" — updated 2026-09-07 during implementation; deferred items noted there). The original review was recommendations-only; implementation was authorized subsequently by the repo owner. This report records both the findings and their resolution state.

## Remediation status (updated during implementation)

| Order | Work package | Status | Notes |
|---|---|---|---|
| 1 | F05–F07/F13 misleading skills/JSDoc/example IDs | **DONE 2026-09-07** | Purchase skill rewritten (two-route hosted contract, `as any` removed, `--payment-gate` flag documented truthfully); `client.ts` paymentGate JSDoc corrected; token-lifecycle IDs fixed (`reqrenew001`); offline-qr rewritten with notification/readiness contract; beneficiary seeded-account examples; link-card frequency prose + hash prose; bulk `--pace 0`; journal prune moved to opt-in maintenance section; 27-field hash / 32-skills counts; transaction-close dated conflict; pre-auth comment; `Asia/Phnom_Penh`; transaction-detail refund-money warning; sandbox-beneficiaries enablement note. Skills/docs tests pass (47). |
| 2 | F02 refund currency-aware balance + F04 fulfillment guard | **DONE 2026-09-07** | New exported `computeRefundableBalance()` (typed `RefundableBalanceResult`: ok/unavailable/ambiguous, order-money reconciliation, W5-6 cross-currency fixtures) wired into CLI refund preflight; `-y` now skips ONLY confirmation, `--no-preflight` skips ONLY validation; refund/transaction-detail skills corrected. Customer-QR example now guards state→obligation→dedupe before fulfillment + no-pagination caveat. 11 new tests pass. |
| 3 | F01 mutation retry policy | **DONE 2026-09-07** | New `MUTATION_ENDPOINTS` registry (15 side-effecting endpoints) in `constants.ts`; `_executeFetch` defaults mutations to single-attempt (per-call `retry: 'transient'` and config `mutationRetryPolicy: 'transient'` escape hatches); purchase `retryPolicy` explicit-transient now re-enables retries; facade/agent already pinned. Two legacy tests updated to the new contract; new `mutation-retry-policy.test.ts` (7 tests: dropped-response single-submit, explicit opt-ins, read retries, registry shape). Full suite 1530 tests pass. CHANGELOG + qr skill + example app updated. |
| 4 | F03 reconciliation helper | **DONE 2026-09-07** | `reconcile.cjs` rewritten: durable transaction-ID dedupe is the only "seen" gate (equal-timestamp/delayed/reordered rows emitted), single atomic checkpoint (`--state`, temp+rename, watermark+seen never disagree, written AFTER side effects), 50-row saturation `GAP:` warning (no pagination parameter exists — never claims complete reconciliation), SEEN_ID_CAP bounding. 5 new tests (equal-time, delayed, cap, restart round-trip, corrupt-state) in skill-scripts suite (31 pass). Skill docs updated (v1.3.0). |
| 5 | F08–F10 portability/installer | **F08+F09 DONE 2026-09-07**; F10 doc-side done (WP1), remaining F10 (consumer-execution soak in a packed tarball) deferred to release gates | F08: all 32 skills migrated to `metadata.version` (string); skills.test.ts now parses the schema (name+description top-level only, metadata.version semver, content contract) instead of a fixed frontmatter regex. F09: installer rewritten — target-aware OpenCode path (`~/.config/opencode/skills`), per-file sha256 manifest, user-modified files preserved on upgrade (`--force-skills` to overwrite), removal scoped to manifest-owned dirs (custom `aba-payway-*` preserved), `--only` bundle install, `--dest` override, `skills doctor --agent` scoped health check with stale/modified/missing detection. 10 new `skills-installer.test.ts` tests in temp homes (no user installs mutated). AGENTS.md + skills README updated. Full suite 1545 tests pass. |
| 6 | F11 machine output | **DONE 2026-09-07 (diagnostics-routing slice)** | The `Using profile:` notice now goes to STDERR whenever ANY machine output is active — the per-command `--json` flag (24 commands) as well as `--output json|ndjson` (previously only the latter). stdout under `--json` is exactly one JSON document. 2 new `machine-output.test.ts` tests (pure-JSON stdout + stderr notice; human stdout unchanged without machine flags). Guidance updated in check-transaction/transaction-detail skills, AGENTS.md, HANDOFF.md (the "parse from the first `{`" workaround retired). The audit's broader envelope-versioning item (versioned structured envelope for more commands) remains a future compatibility-tracked change — not needed to fix the flagged defect. |
| 7 | F12 contract checks | **DONE 2026-09-07** | `skills.test.ts` now parses frontmatter schema instead of a fixed regex (F08). New per-skill drift guards in `docs-examples.test.ts`: every skill checked INDIVIDUALLY (one guide's correct wording can no longer mask another's contradiction) for request-ID validity (cof family), sandbox beneficiary examples, `--pace 0` normalization, dead tag URLs, invalid timezone names; plus focused guards pinning the F02 refund formula/separation, F05 hosted contract (`as any` ban, flag truth), F07 notification contract, F06 IDs, F13 dated close evidence, F04 fulfillment guards, F03 saturation caveat. The guard caught and fixed one real residual (agent-skill v1.5.0 playbook URL — F10). 28 docs-examples tests pass. Full suite: 1555 tests / 101 files green; build + tsc + biome + check:package (32 guides) + check:public-docs (194 files) + docs:api regenerated all pass. |

## Scope and verdict

Reviewed all 32 `skills/aba-payway-*/SKILL.md` entrypoints, inventoried and syntax-checked all eight bundled CJS helpers, examined the reconciliation implementation and helper contract tests, and reviewed relevant SDK domains, transport retry behavior, CLI payment/refund/output/skill installation paths, documentation entrypoints, and supporting tests. Applied the explicitly requested Codex `skill-creator` guidance: precise discovery, scope preservation, progressive disclosure, portable resources, and behavioral validation.

Snapshot: branch `codex/opensource-release-polish`, HEAD `6ecca2b`, package version `1.5.0`. The checkout already contains extensive staged and unstaged release/DX work. Findings refer to the current working files, not just HEAD. No implementation files were changed by this audit. Build outputs were regenerated for verification. No live PayWay requests, payments, refunds, installation into user skill directories, credential changes, or publication were performed.

**Verdict: keep the current architecture, but correct cross-surface contract drift before presenting these skills as a dependable integration toolkit.** The SDK already has valuable primitives: typed errors, per-call cancellation, official offline KHQR, hosted-purchase result handling, lifecycle/artifact helpers, and an opt-in journal. The newer first-payment and production-webhook skills provide a good starting journey. Older route guides and some executable helpers still contradict those primitives.

This is a targeted correctness and developer-experience audit, not an exhaustive security review, full regression certification, or new verification of the gateway's production behavior. Provider observations below are attributed to existing repository evidence unless explicitly checked externally.

## Verified findings

### F01 — P1: automatic create retries differ between SDK, CLI, and agent paths

Evidence: `src/client.ts:1317` defaults to three retries; `src/client.ts:1556` retries transient failures. `src/domains/qr.ts:109` uses that transport without disabling retries, and `src/cli.ts:2495` creates a default client for online QR. In contrast, `src/server/index.ts:176` defaults facade purchases to `retryPolicy: 'none'`, `src/cli.ts:2864` does the same for checkout, and `src/agent/context.ts:177` disables retries for creates. Low-level purchase exposes its own opt-out at `src/domains/checkout.ts:428`.

Offline reproduction: stubbed `globalThis.fetch` to throw a synthetic transport error, supplied explicit fixture credentials, and called `qr.generateQr()` with `maxRetries: 1`. Result: **two fetch attempts; zero real network calls**. This proves retry behavior, not that the gateway duplicated a payment.

Impact: the same merchant intent gets different replay behavior depending on entrypoint. Existing sandbox evidence says transaction IDs are not gateway idempotency; a lost response must be treated as an unknown outcome.

Recommendation: define an endpoint operation policy for reads and mutations, with an explicit per-call retry override. Default ambiguous payment mutations to a single attempt in the next compatible release boundary; retain bounded retries for reads. Until then, document the existing `maxRetries: 0` mitigation for direct mutation clients. Do not introduce automatic replacement payments as recovery.

Acceptance: simulate acceptance followed by a dropped response; each covered mutation is submitted once, preserves its reference, and reports unknown outcome. Reads retain documented retry behavior. Pin facade, direct SDK, CLI, and agent behavior in the same suite. Treat changes to existing defaults as a compatibility decision.

### F02 — P1: refund preflight mixes payer currency with merchant currency

Evidence: `src/cli.ts:1884` skips preflight when `--force` is used; `src/cli.ts:1891` computes the balance from `payment_amount - refund_amount`. The same formula appears in `skills/aba-payway-refund/SKILL.md:44` and the transaction-detail guide. Existing campaign evidence at `docs/SANDBOX-FINDINGS.md:822` records a 4000 KHR order paid as 1 USD and a 1.20 USD order paid as 4800 KHR; `payment_*` describes the payer debit.

Impact: local preflight can reject a valid refund or approve an invalid estimate by comparing amounts in different units. Gateway validation may still reject an invalid refund; this finding does not establish that excess money can be refunded.

Recommendation: add one typed SDK helper that distinguishes merchant order money, payer debit money, and refunded money. Calculate refundable balance only after confirming the refund amount's currency semantics; return an explicit unavailable/ambiguous result when fields cannot be safely reconciled. Use it in the CLI and docs. Separate confirmation skipping (`-y`) from validation skipping (`--no-preflight`) in a compatibility-aware change. Decide explicitly whether failed preflight should allow submission; the current implementation continues after lookup failure.

Acceptance: same-currency, cross-currency, partial-refund, missing-field, and lookup-failure fixtures; a confirmation flag must not silently bypass balance validation. No float conversion across currencies without an authoritative conversion contract.

### F03 — P1: reconciliation helper silently drops equal-time or delayed transactions

Evidence: `skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs:89` uses strict timestamp comparison; line 178 requires both a newer timestamp and an unseen transaction ID. Offline reproduction: a new ID with `transaction_date` equal to the watermark returns **false** from `isNewerThan()`. Older late-arriving rows are filtered out too. Lines 198–199 write watermark and seen state separately.

The customer-QR guide also says to paginate (`skills/aba-payway-customer-qr/SKILL.md:55`), while `src/domains/khqr.ts` exposes no pagination argument and the helper performs one request. The repository OpenAPI documents a maximum of 50 returned matches. The helper cannot promise complete history during an extended outage or high-volume interval.

Recommendation: use durable deduplication by transaction ID across an overlapping lookup window, an atomic checkpoint, and an explicit potential-gap signal when results reach the endpoint cap. Do not invent an unsupported pagination parameter. Consider SDK/CLI ownership of this logic instead of maintaining a second HTTP/auth stack inside a skill. Changed statuses/refunds on existing IDs require a separate update-reconciliation policy; this script currently emits only new IDs.

Acceptance: equal timestamps with different IDs, delayed arrival, reordered results, empty response, restart, checkpoint interruption, repeated ID, changed refund state, and 50-row saturation. A possible history gap must be surfaced, not reported as complete reconciliation.

### F04 — P1: customer-QR example fulfills immediately after signature validation

Evidence: `skills/aba-payway-customer-qr/SKILL.md:23` calls `markCustomerPaid(req.body.merchant_ref, req.body)` directly after checking the signature. There is no visible approved-state check, amount/currency binding, durable event identity, or atomic duplicate guard.

Impact: a copied handler can interpret a valid but non-approved or repeated notification as payment. A merchant reference identifies a customer; it is not necessarily a unique payment event.

Recommendation: make the example explicit about verified payment state and the customer-QR notification contract. Persist/deduplicate the individual transaction, match the intended obligation and money, then enqueue fulfillment once. Link to the production-webhook guide for the full durability workflow. Do not assume its online transaction-ID or HMAC rules automatically apply to every offline KHQR notification.

Acceptance: valid PENDING, duplicate APPROVED, wrong customer, wrong amount/currency, and concurrent delivery must not cause incorrect fulfillment. Demonstrate the guard in executable example code, not only surrounding prose.

### F05 — P1: purchase skill and SDK parameter comment advertise a stale hosted-URL contract

Evidence: `skills/aba-payway-purchase/SKILL.md:30` promises `checkout_qr_url`, line 38 casts to `any` to read it, and lines 46/55 claim the CLI deliberately omits `--payment-gate`. Live local `generate-checkout --help` exposes that flag at `src/cli.ts:2648`. Current `purchaseHosted()` and `PurchaseHostedHtmlResult` represent the HTML response. The parameter JSDoc at `src/client.ts:238` still promises a URL too.

Recommendation: replace the obsolete path with two explicit cases: a locally signed form submitted by the browser using `getCheckoutFormHtml()` / `checkout-form --payment-gate 0`, and the typed hosted HTML response for server-side inspection. Do not promise that serving captured gateway HTML from a merchant origin renders correctly; repository evidence records relative asset dependencies. Remove the `as any` workaround and correct JSDoc before regenerating API docs.

Acceptance: skill flags match source help; examples compile against the packed public API; gate-0 mock responses narrow to the correct type. Browser verification for the recommended hosted integration must exercise the form POST, not just search the generated HTML for text.

### F06 — P1: token-lifecycle quick starts fail local validation

Evidence: `skills/aba-payway-token-lifecycle/SKILL.md:21` uses `req-renew-1`; the details example uses `req-detail-1`. `src/utils.ts:280` requires 5–24 alphanumeric characters; renew/details call that validator. Executed both examples against an explicit fixture client: **both rejected before fetch**, reporting the hyphenated request ID. Zero network calls.

Recommendation: use valid example IDs and explain that details refers to the relevant known request ID, rather than encouraging unrelated fresh identifiers. Add runnable skill snippet fixtures so a headings-only test cannot mark these examples valid.

Acceptance: examples pass local validation, and invalid request IDs still fail before network I/O.

### F07 — P2: offline KHQR guide denies notification capabilities the SDK models

Evidence: `skills/aba-payway-offline-qr/SKILL.md:14` says offline QR has no webhook or reconciliation; line 30 draws a blanket distinction from portal QR routing. Yet `src/domains/khqr.ts` exposes `validateCallbackSetup()`, `src/khqr-config.ts:219` models ABA enrollment/verification readiness, and `src/webhook/khqr-notification.ts:157` parses a dedicated notification with `verification: 'unverified'`.

Recommendation: distinguish local QR generation from downstream bank notifications. Explain that notifications depend on ABA routing/enrollment and require the dedicated verification contract; local readiness declarations do not prove ABA configuration. Document `validateConfiguration()`, `validateCallbackSetup()`, and the dedicated receiver without promising that offline generation alone enrolls callbacks.

Acceptance: examples cover missing enrollment and unknown verification strategy; route guidance never treats CRC as authenticity or substitutes online callback assumptions.

### F08 — P2: all skills fail the requested skill-creator validator

Executed the installed `skill-creator/scripts/quick_validate.py` validation function against every skill using UTF-8. **0/32 pass**: every file has an unsupported top-level `version` field. The project's `src/__tests__/skills.test.ts` instead requires that field with a regex.

This is a validator/schema compatibility mismatch, not proof that every agent refuses these skills. Current OpenCode documentation explicitly says unknown fields are ignored.

Recommendation: retain skill versioning under `metadata.version` as a string, update the project test, and validate each supported target's accepted schema. Keep names and descriptions concise; optional Codex UI metadata can be added when useful, but is not a requirement for a valid skill.

Acceptance: all 32 pass the invoked validator and target-specific discovery smoke checks. Tests parse YAML and validate useful contracts rather than enforce a fixed frontmatter order.

### F09 — P2: installer checks directory presence, not actual installation health

Evidence: `src/cli/commands/skills.ts:9` installs globally to `~/.opencode/skills`; current official OpenCode docs specify `~/.config/opencode/skills`. `skills/README.md` documents a manual copy workaround. Doctor checks names/readability (lines 138–151), not schema, script availability, or version/hash drift, and treats all five agent roots as required. Add force-copies files (line 59); remove deletes every matching prefix directory (lines 84–87), including a custom skill with that prefix.

Recommendation: implement target-aware paths, `skills doctor --agent <name>`, explicit destination support, and a managed installation manifest with file hashes. Report stale/modified/missing resources. Preserve user-modified files or report conflicts; remove only manifest-owned files. Support selecting a workflow bundle with its sibling dependencies so the user need not install the full catalog.

Acceptance: fresh temporary homes, one selected agent, stale script, missing SKILL.md, user-modified guide, custom `aba-payway-*` directory, upgrade with removed resources, and an OpenCode discovery smoke. No actual user installations were mutated in this audit.

External source checked 2026-09-07: [OpenCode skill locations and frontmatter](https://opencode.ai/docs/skills/).

### F10 — P2: installed guides still depend on source-checkout paths and unavailable references

Several distributed guides use `npx tsx src/cli.ts` as their primary command (link-account/card, token-purchase/removal, payment-link, test-harness). `package.json` ships `dist`, skills, and selected public documents, not `src`. Some helper instructions alternate between repo-relative and skill-relative script paths. A source-checkout command is valid only when explicitly labeled as such.

The payment-link guide points at a `blob/v1.5.0/docs/17-payment-link.md` URL: the browser returned **404** during this audit and no local `v1.5.0` tag exists. The agent guide also depends on a versioned setup-playbook URL. Do not assume that links to an unpublished tag are usable.

Recommendation: use the installed local CLI consistently (`npm exec -- payway-sdk`, after confirming `aba-payway-ts` is installed); preserve source commands only as an alternative. Resolve helpers relative to the loaded skill location. Bundle indispensable references under the relevant skill instead of relying on an unpublished repository page, and check public documentation URLs at release time.

Acceptance: run from a separate consumer directory containing an installed tarball, with no checkout `src/` or root `scripts/`. Every required reference and helper resolves. An absent package must produce clear installation guidance, not silently encourage fetching an unrelated package.

### F11 — P2: machine output has two different contracts

Evidence: `src/cli/output.ts` defines a versioned structured result only for QR and checkout. `src/cli.ts:937` sends the profile notice to stderr for `--output json|ndjson`, but stdout for `--json`. The status skills instruct consumers to parse from the first `{`.

Recommendation: add a versioned structured envelope to other commands while preserving legacy output through a documented transition. Put all diagnostics on stderr; include selected context, request identifiers, creation outcome, and next action as appropriate. Keep command exit success separate from payment approval. Structured mode is not automatically a redaction promise: define raw versus safe data deliberately.

Acceptance: `JSON.parse(stdout)` for single-result commands and one JSON record per NDJSON line, including profile selection, local validation, API failure, timeout, and polling. No parser should need to discard arbitrary prose.

### F12 — P2: skill tests verify presentation more strongly than operational correctness

Evidence: `src/__tests__/skills.test.ts` requires a count, frontmatter regex, Quick Start, TypeScript fence, and Error Handling heading. Existing script tests do exercise signing and parsing, which is useful, but passed despite the reconciliation timestamp defect. `src/__tests__/docs-examples.test.ts` checks offline capability terms across concatenated documents, allowing one contradictory skill to be masked by another document's correct wording. `scripts/check-public-docs.mjs` defaults to generated `docs/api`, not the entire Markdown/skills corpus.

Recommendation: keep basic discovery tests, replace rigid heading requirements with schema/resource checks, and add executable public-API examples plus mock CLI scenarios. Verify each applicable document individually where correctness is per-guide. Maintain a small route contract manifest for command names, units, auth requirements, and response variants; generate/check repeated tables from it, while keeping human guidance hand-written.

Acceptance: the suite catches F03, F05, F06, and F07 individually. Test an extracted consumer installation, not only source imports. Keep sandbox tests opt-in and distinguish mock success from provider verification.

### F13 — P2: small but actionable drift remains in specialist guides

- Beneficiary quick starts use `000999888`, conflicting with the sandbox fixtures and user-provided project instructions. Use a seeded USD account for explicitly sandbox examples; keep production values as named inputs. Provider enablement remains separate from a locally valid account.
- Link-card describes frequency as optional while the COF overview and `src/domains/credentials-on-file.ts:208` document required-with-advisory validation. State the distinction accurately. COF hash prose also says frequency hashes empty despite showing a supplied value.
- Transaction-close retains an August nonexistent-ID error claim while September evidence (`docs/SANDBOX-FINDINGS.md`, W5-2/W5-8) records code 00 for never-created IDs. Present these as dated conflicting observations, not a universal unknown-ID detector. Its description should say closing an unpaid attempt, not closing after processing a payment.
- Bulk detail's quick start uses `--pace 0` while claiming endpoint pacing. Remove that override from the normal example; reserve it for explicitly controlled tests.
- Journal describes itself as read-only but executes `pruneJournal(...)` in its library quick start. Put retention in a separate opt-in maintenance section so an investigation request does not trigger deletion.
- The skills index still advertises a 26-field subscription hash (`skills/README.md:30`) and the release checklist still counts 31 skills (`docs/RELEASE_CHECKLIST.md:48`); current hash guidance is 27 fields and the current catalog is 32.

Acceptance: endpoint-local examples agree with current code, each risky action is scoped to the actual requested workflow, and historical evidence stays clearly dated.

## Additional optimizations, not confirmed functional defects

### SDK

1. **Add typed normalization at the API boundary.** Share helpers for merchant/payer money, transaction-ID coercion, hosted results, and unknown outcomes. Preserve raw provider responses for diagnostics instead of changing their fields silently. F02 is the first concrete consumer.
2. **Give link-card HTML a deliberate result type.** The current client reports hosted HTML through `PayWayBusinessError` (`src/client.ts:1419`), and skills teach consumers to catch an error as success. Add a typed response path, but do not infer successful card linking from arbitrary HTML: this endpoint can return HTML for failures too. The callback remains the token result.
3. **Benchmark journal queries before adding a database.** `src/journal/writer.ts:173` reads and splits the whole JSONL file synchronously; stats/intelligence call that reader. Streaming readers, time-bounded filters, and rotation could reduce memory and latency for larger journals. Measure 10k/100k/1m events, then choose indexing or an optional backend. No runtime performance regression was benchmarked in this audit.
4. **Centralize retry/rate-limit and response policy by operation.** This supports F01 and reduces duplicated policy in CLI/agent/helper scripts without flattening genuine per-endpoint differences in HMAC or payout fields.

### CLI

1. Address refund correctness, output consistency, and installer health before adding commands.
2. Add a supported headless profile import/update workflow using stdin or a protected file, with schema validation and redacted output. The agent skill currently tells scripts to edit `profiles.json` directly. Avoid secret-valued command-line flags.
3. Extract command registration from the large `src/cli.ts` incrementally by domain, preserving the root `runCli` seam, profile resolution, global options, and tested output. Refactoring alone is not a user outcome; pair it with the fixes above.
4. Move reliable reconciliation into a supported CLI/SDK surface if it is intended for production use. Keep QR decoding/signing helpers only where their standalone nature adds actual value.

### Skills

1. Keep first-payment as the entry guide and load one route plus production-webhook guidance when fulfillment is in scope. The read-only journal skill should start with inspection, not onboarding or retention.
2. Shorten the agent skill (currently roughly 1,980 whitespace-delimited words, 276 lines). Move provider setup, provider-specific diagnostics, ledger operations, and the exhaustive tool table into focused bundled references. Keep context selection, authorization, unknown-outcome handling, and routing in the entrypoint.
3. Reduce overlapping discovery: COF is the route selector; link-account/card and token-purchase are focused operations. Token-lifecycle owns renewal/inspection/removal. Preserve remove-account/remove-card names as thin compatibility routers before considering removal.
4. Keep universal payment constraints concise, and centralize extended explanations. Preserve endpoint-specific differences such as purchase minutes versus QR seconds, payout shapes, and unsigned pushbacks.
5. Prefer workflow descriptions over catalog counts and dated model names. Reconcile skill version metadata with the public package contract; avoid requiring a reference merely to understand a short skill.

### Documentation

1. Correct source JSDoc, the relevant skill, CLI help, and public examples in one change, then regenerate API docs. A banner at the start of a guide does not repair a contradictory code block below it.
2. Use QUICKSTART for first payment, one SDK/CLI reference for exact contracts, production-webhook guidance for trust/fulfillment, and dated sandbox findings for provider observations. Do not present archived experiments as current instructions.
3. Remove project-specific profile/account captures from general-purpose examples or replace them with clearly synthetic fixtures. Do not treat every identifier as a secret; the goal here is portable, source-independent guidance.
4. Run a public-link and skill-resource check over the actual package contents. Keep internal release blockers in release documents and keep the merchant path executable without internal audit dossiers.

## Per-skill coverage

All rows also inherit F08 (frontmatter) and should receive the resource/consumer checks in F10/F12. “Retain” means no additional blocking issue identified in this scoped review, not exhaustive certification.

| Skill suffix (`aba-payway-`) | Outcome / recommended action |
|---|---|
| agent | Retain risk/context boundaries; shorten with references; replace direct profile-file editing and unavailable setup reference (F09–F10). |
| beneficiary | Use sandbox-valid examples and precise payout-management routing (F13). |
| bulk-operations | Remove `--pace 0` from normal detail quick start; preserve per-item outcomes and close limitations (F13). |
| check-transaction | Retain status-vs-command distinction; replace prose-skipping JSON guidance when F11 lands. |
| cof | Keep as route selector; align link-card frequency/hash prose and portable examples (F10/F13). |
| customer-qr | Correct fulfillment handler and unsupported pagination promise (F03/F04). |
| exchange-rate | Retain small focused guide; optionally add installed CLI equivalent if useful. |
| first-payment | Retain as canonical journey; validate all examples in a packed consumer. |
| hash | Retain signing/verification tools; narrow the description to cover request-signing diagnostics as well as signed callbacks. |
| journal | Move prune out of read-only quick start; retain local-evidence caveats (F13). |
| link-account | Retain endpoint shape; use installed CLI invocation and shared COF references. |
| link-card | Align frequency and HTML-result semantics; distinguish an artifact from confirmed token linkage. |
| offline-qr | Rewrite notification limitation and add dedicated readiness path (F07). |
| payment-link | Preserve unsigned pushback handling; fix source-only commands, unavailable guide URL, sandbox examples. |
| payout | Retain separate payout shape/currency rules; link to beneficiary management instead of duplicating its scope. |
| pre-auth | Remove contradictory “sandbox throws / fine here” sample comment; consider concrete CLI equivalents. |
| purchase | Correct hosted result, gate flag, SDK JSDoc and browser route (F05). |
| qr | Retain seconds/lifetime rules; align direct-create retry behavior and sandbox payout example (F01/F13). |
| refund | Correct currency-aware balance calculation and validation/confirmation separation (F02). |
| remove-account | Thin router to token lifecycle with account-specific implications; preserve existing name. |
| remove-card | Thin router to token lifecycle with card-specific implications; preserve existing name. |
| sandbox-beneficiaries | Retain fixtures; explain that local allowlist validation does not prove provider service enablement. |
| sdk-configuration | Split explicit SDK config from CLI profile/provider configuration; expose retry guidance and plaintext-profile limits. |
| subscription | Retain signed ctid and profile-enablement caveat; avoid hardcoding one project's merchant profile in public guidance. |
| test-harness | Use installed commands; call the demo/mock contract check “offline” consistently. |
| token-lifecycle | Replace invalid request IDs and test snippets; own renewal/removal detail (F06). |
| token-purchase | Retain charging flag distinction; portable command and mutation retry guidance. |
| transaction-by-merchant-ref | Fix bundled reconciliation completeness and checkpoint behavior; explain profile resolution accurately (F03). |
| transaction-close | Revise discovery description and dated not-found claim (F13). |
| transaction-detail | Correct refund-money guidance; retain indexing lag and rate-limit distinction (F02/F11). |
| transaction-list | Retain gateway-day and unpaid-QR visibility guidance; use valid timezone name `Asia/Phnom_Penh`, not `Asia/Phnom_Cambodia`. |
| webhook-production | Retain trust, durable acceptance, and fulfillment-once guidance; use as the behavioral baseline for customer-QR examples. |

## Prioritized work packages

| Order | Work package | Dependencies | Done when |
|---|---|---|---|
| 1 | Correct misleading skills/JSDoc and example IDs (F05–F07/F13) | None; preserve current behavior | Public examples compile, flags match help, per-guide checks reject contradictions. |
| 2 | Refund and fulfillment correctness (F02/F04) | Confirm refund currency semantics before deriving a balance | Mixed-currency/refund fixtures and duplicate/non-approved callback scenarios pass. |
| 3 | Mutation outcome policy (F01) | Compatibility decision; endpoint-by-endpoint classification | Single-submit failure tests across SDK/CLI/agent; explicit retry escape hatch where justified. |
| 4 | Reconciliation correctness (F03) | Supported endpoint coverage/limits documented | Equal-time/delayed/restart tests and gap reporting pass; no false complete-history claim. |
| 5 | Portable skill package and installation (F08–F10) | Metadata migration coordinated with tests | 32 valid guides; target-specific temp-home install/update/remove and consumer execution pass. |
| 6 | Consistent CLI machine output (F11) | Legacy compatibility plan | Clean stdout on success and every failure path; documented schema version. |
| 7 | Contract checks and progressive disclosure (F12 plus optimizations) | Corrected examples and selected source of truth | Behavioral checks replace brittle presentation pins; references remain discoverable. |

Each package should be independently reviewable. Do not combine currency semantics, retry defaults, installer migration, and broad CLI extraction into one opaque refactor. Preserve task-unrelated edits in this already-dirty checkout.

## Validation performed

- `npm run build`: passed; declarations, ESM, and CJS generated.
- Nine focused Vitest files: **114 tests passed** (`skills`, `skill-scripts`, `purchase-gate0-hosted`, `payment-lifecycle`, `first-payment`, `payment-link-pushback`, `cli-help`, `docs-examples`, `khqr-offline`).
- `npm run check:public-docs`: passed, **191 generated files** checked; this does not certify all Markdown or installed skill references.
- All eight bundled CJS helpers passed `node --check`; all relative Markdown links in the 32 skill entrypoints resolved locally. Syntax/link checks do not prove helper semantics or external-link availability.
- Corpus inventory: 14,490 whitespace-delimited words across 32 entrypoints, with zero skill-local `references/` directories. This is a context-size baseline, not a measured token count or runtime performance result.
- Invoked skill-creator validator against all 32: **32 rejected solely at top-level `version` field validation**. No skill contents changed to make the check pass.
- Read source CLI help for `generate-checkout` and `skills`.
- Synthetic transport failure: QR create made two stubbed fetch attempts with retry budget one; no network.
- Token renewal/details example IDs: both rejected before fetch; no network.
- Reconciliation equal-watermark predicate: unseen same-time transaction rejected.
- Official OpenCode skill locations checked; referenced versioned payment-link documentation returned 404.

Full suite, coverage, clean installation on all supported platforms, live gateway semantics, and runtime performance benchmarks were not run. Existing passing tests must not be presented as evidence that the defects above are absent.

## Ship / do not ship

**Internal:** all seven work packages are implemented and tested (see "Remediation status"). The P1 findings (F01–F07) are corrected in SDK, CLI, skills, and docs, with regression tests pinning each fix. Retain dated sandbox evidence as evidence, not as unqualified production guarantees.

**Public (updated 2026-09-07 after remediation):** the P1 correctness blockers named by this audit are resolved and the suite is green (1555 tests / 101 files; build, tsc, biome, check:package 32 guides, check:public-docs 194 files, docs:api all pass). Remaining before publication, unchanged by this remediation: (a) the F10 consumer-execution soak — install the packed tarball in a fresh consumer directory with no checkout `src/` and verify every guide's commands and helpers resolve; (b) `docs/RELEASE-READINESS.md` independently still marks publication blocked — this audit does not clear its owner/provider or historical-secret dispositions; (c) a rerun of the project's broader release gates on the release branch. No release, tag, push, or credential change was performed by the remediation.
