# PayWay project: publishing readiness and developer-experience audit

**Final assessment: 30 September 2026. Initial investigation: 29 September 2026.**

**Decision: DO NOT SHIP the current package and public project as a supported first release.** The core has considerable functionality and a strong offline test base. The release is blocked by content-boundary failures, broken release validation, unsafe or incomplete first-integration examples, and reproducible CLI/MCP/webhook defects. These are specific repairable gaps; a broad rewrite is not justified by this audit.

Current reviewed commit: `34550df1889095835bc4f54ac1c25ed2704ebc31`, local `main`, plus the six pre-existing uncommitted Postman maintenance/export files observed on resumption. The initial snapshot was `ee4b27c12951559707ffc633f5c64a934bbea3a8`. Checks marked 30 September apply to the resumed working tree, not an immutable release candidate. No implementation fixes, commit, push, tag, publication, credential rotation or gateway payment were performed by this audit.

## Reading guide

This is the decision report. Detailed evidence and reproduction steps are in:

- [SDK, CLI and MCP](SDK-CLI.md): generated starters, framework templates, error contracts, partner configuration, MCP protocol and settings.
- [Documentation, Skills and AI](DOCS-SKILLS-AI.md): beginner routes, resource completeness, public/private content, offline knowledge and helper contracts.
- [Webhooks and Postman](WEBHOOK-POSTMAN.md): acknowledgement, process ownership, callback trust, collection delivery and scope.

The component reports retain their 29 September findings for traceability and carry a 30 September status addendum. This report takes precedence for current open/resolved status. IDs such as D01, S03 and WP02 below refer to those reports. Paths and line numbers identify the inspected implementation; future edits can shift them.

## 1. Executive assessment

| Area | Current assessment | Main reason |
|---|---|---|
| TypeScript SDK fundamentals | Substantial and usable for controlled integration | Typed domains, ESM/CJS/types and offline lifecycle tests work; some configuration and starter contracts fail |
| CLI capabilities | Broad, with inconsistent integration contracts | Strong help/demo/diagnostics; early JSON errors and generated run instructions are unreliable |
| Getting started | Assisted onboarding required | Good full source guide, but default links and generated projects do not consistently deliver it |
| Finding resources | Fragmented | Source docs, short packaged docs, generated knowledge, Skills and Postman are not one navigable public route |
| Beginner friendliness | Below first-public-release standard | Environment loading, server pricing, callback verification and simulated-vs-real distinctions are inconsistent |
| AI friendliness | Strong architecture, blocked default path | 34 Skills, offline retrieval and MCP exist; protocol stdout contamination, stale Skill semantics and broken machine-index links undermine use |
| Webhook workbench | Useful development tooling; lifecycle fixes needed | Replay/capture/verification exist; PID ownership, unbounded forwarding and bind/body limits need work |
| Production webhook guidance | Not ready to promote unchanged | The guide labeled production accepts too early and omits payment/order invariants |
| Postman collection | Local validation now green; distribution still conditional | 46 requests, 49 saved examples, 125 variables; trust, sanitization and fresh-app import remain open |
| Release engineering | Blocked | Broken repository/smoke gates, metadata mismatch, dependency advisories, and unresolved public-history/ownership decisions |

These are qualitative assessments tied to observed journeys and gates, not invented readiness percentages. The project is closer to an experienced-maintainer toolkit than a self-service beginner product. Its next investment should be consistency and release assurance, not more endpoint breadth.

## 2. What changed during the audit

The workspace changed during the pause. The final assessment does not carry forward already-resolved failures:

| Earlier observation, 29 September | Current disposition, 30 September |
|---|---|
| Full suite: 2,037 passed, five failed | Current bounded-worker suite: 2,120 passed, zero failed across 147 files |
| Four installer tests timed out under concurrent load | All 15 installer tests passed in the focused rerun; current full suite also passes. Do not call this an installer functionality defect |
| Two knowledge source hashes stale | Resolved in the resumed tree; full knowledge suite passes. D08 is historical/closed locally |
| Postman test pinned 122 variables while actual was 125 | Current test suite passes without a bypass; WP04 is closed locally |
| Postman JSON export and index stale | Both current freshness and index checks pass; current export has 46 requests/49 examples/125 variables |
| Historical portable helper was sometimes empty | Not reproduced: inspected helper is present; do not prescribe helper regeneration as the current fix |

The six Postman working-tree modifications remain uncommitted. A clean release candidate must preserve and review them, then rerun gates against the resulting commit. This audit did not modify or revert them.

## 3. Fresh verification and its limits

Windows; Node `v24.21.0`; npm `12.0.2`. Checks used installed dependencies. Main source build completed before dist-dependent tests. Live sandbox-contract cases remain gated. Auxiliary probes isolated profiles, data roots and synthetic credentials; no real token or signing key is reproduced in this report.

| Check | Result | What it proves / does not prove |
|---|---|---|
| `npm run build` | PASS, 30 September | ESM/CJS/declarations build; not clean-install or every runtime support proof |
| `npm run typecheck` | PASS, 30 September | Main TypeScript compilation |
| `npm run lint` | Exit 0, 30 September | Configured lint gate; warning output should be reviewed separately |
| `npm test -- --maxWorkers=2` | PASS: 2,120 tests, 147 files | Current offline suite under bounded concurrency; does not certify live payments |
| `npm run test:coverage -- --maxWorkers=2` | 2,120 passed, 14 skipped | 82.90% statements, 76.04% branches, 88.05% functions, 83.75% lines; exceeds configured 79/73/84/80 floors |
| `npm run check:repository` | FAIL | ENOENT at obsolete `docs/RELEASE_CHECKLIST.md`; remaining repository checks do not complete |
| `npm run check:package` | PASS: 127 files, 34 Skills, 944,942 packed bytes on resume | Structural package allowlist passes; it misses internal content copied under an allowed path |
| `npm run smoke:package` | FAIL with npm 12 | Assumes pack JSON is an array, then reads undefined `.filename`; also contains a stale 32-Skill assertion |
| Independent extracted-package consumer probe | PASS, 29 September | Fresh temp install: ESM/CJS/types, help, demo, docs list, Skill install/doctor, MCP catalog; this does not turn the official smoke gate green |
| `npm run smoke:example` | PASS, 29 September | Reference app native-TypeScript startup, demo health and HTML; no gateway credentials |
| Fresh TypeDoc generation to isolated audit output | Exit 0; 117 warnings | 269 generated files pass content-boundary check; many referenced types/links need documentation completeness review |
| Existing generated docs boundary | PASS: 239 files on initial run | Existing docs differ from fresh output; a boundary pass is not freshness or navigation verification |
| `npm run check:secret-allowlists` | BLOCKED | `gitleaks` not installed; no fresh full-history secret-scan conclusion |
| `npm audit --omit=dev --json` | FAIL, 29 September | Two affected production dependency packages: one high, one moderate; exploitation in this application not established |
| Postman `npm run test:yaml` | PASS, 30 September | Structural/script/import-shape checks and 37 KHQR simulations; not a real Postman app import or bank payment |
| Postman `node export_json.js --check` | PASS, 30 September | Current local export matches generator; does not establish safe-to-publish credential content |
| Postman `node verify_index.js` | PASS, 30 September | Current index consistency |
| Saved-profile MCP initialize probe | FAIL protocol discipline, 30 September | Human profile notice precedes JSON-RPC on stdout |
| MCP environment/flag catalog probe | FAIL environment contract, 30 September | Env opt-in still gives 12 tools; explicit flag gives 17 |
| Missing-ID CLI JSON probe | FAIL envelope contract, 30 September | Empty stdout for required-option error; exit 1 |
| README support topic / quickstart search probe | FAIL, 30 September | Unknown topic / unsupported flag |

Local raw evidence is in `.scratch/publishing-dx-audit-2026-09-29/` and the redacted component JSON artifacts alongside this report. Do not publish the entire scratch folder: the consumer directory contains installed dependencies and intermediate package material. The raw dossier contents and credential values are intentionally not quoted.

## 4. Publishing blockers and release-engineering findings

### R01 — P1: the repository validation gate cannot finish

`scripts/check-repository.mjs:10-12` still opens root-level `docs/RELEASE_CHECKLIST.md`, `docs/SDK-AND-CLI-REFERENCE.md` and other pre-reorganization paths. Current files live under `docs/project`, `docs/reference` and `docs/guides`. The first missing file throws ENOENT. CI invokes this gate at `.github/workflows/ci.yml:65`.

Fix the canonical path registry, report missing inputs as actionable failures, and verify all required entry documents rather than stopping at the first filesystem exception. Acceptance: check completes on a clean checkout, every primary local link resolves, and a deliberately broken entry link fails with its source and target. Do not replace the check with an unconditional success.

### R02 — P1: packed-consumer smoke has two independent stale assumptions

`scripts/smoke-packed-package.mjs:20-23` indexes npm pack output with `[0]`; npm 12 returns an object. `scripts/check-package-contents.mjs` already normalizes both shapes, providing an in-repo correct pattern. After that failure, line 88 still expects 32 installed Skills while the package contains 34.

The separate audit consumer probe normalized the shape and validated actual imports, types, demo and Skill installation. This distinguishes a broken release harness from a wholly broken package. Acceptance: official smoke passes with supported npm output shapes, uses authoritative inventory, and exercises installed resources and preservation behavior. Keep npm version in the release evidence.

### R03 — P1: internal evidence is shipped despite a green package gate

D01: `scripts/knowledge-sources.mjs:40` selects `docs/internal/CLOSE-TRANSACTION-FINDINGS.md`. The packaged `knowledge/close-transaction-findings.md` retains raw sandbox transaction/approval references and escalation narrative. The package checker rejects some names and direct internal paths but not this transformed content lineage. The isolated consumer confirmed this file is installed.

This is a confirmed publication-boundary failure; it is not a claim that these identifiers are production credentials. Remove internal dossiers from public curation; publish a reviewed semantics guide; validate source provenance before transformation. Acceptance: public topics cannot originate in internal directories, and the exact extracted tarball contains only reviewed public material.

### R04 — P1 release decision: dependency advisories need disposition

Fresh registry-backed production audit reports `fast-uri@3.1.6` through AJV with high-severity URI authority/host-confusion advisories, and `qs@6.15.1` through Express/MCP with moderate denial-of-service advisories. `npm ls` confirms installed chains; lockfile entries include `package-lock.json:5468` and `8147`. Both report fixes available.

These are dependency advisories, not demonstrated remote exploits in PayWay. The MCP transport here is stdio, and this audit did not prove that the affected qs modes or fast-uri serialization receive attacker-controlled data in a reachable service. Update to compatible fixed resolutions and test, or document a reviewed reachability/disposition with owner and expiry. Do not mechanically run force-upgrades.

Sources: [fast-uri authority injection](https://github.com/advisories/GHSA-qw65-cvwx-89v3), [fast-uri host confusion](https://github.com/advisories/GHSA-58mr-gqgx-xq4g), [qs stringify failure](https://github.com/advisories/GHSA-q8mj-m7cp-5q26), [qs array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [qs isBuffer denial of service](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g). These URLs came from the live npm advisory response.

Acceptance: production graph has no unreviewed high/moderate findings; resulting lockfile and clean installation pass package, MCP and application tests. This audit did not assess the entire development dependency graph.

### R05 — P1 release decision: destination, support identity and publication state are inconsistent

`package.json:7-14` advertises `antigravity-google/aba-payway-ts`; configured origin is `Ruzaid-aman/ABA-Payway-SDK-unofficial`. Anonymous GitHub API reads on 29 September returned 404 for both. That means public availability was not verified; it does not prove a private repository does not exist. The npm registry returned 404 for `aba-payway-ts` and 200 for the distinct `payway-sdk@1.1.1` package. Availability is not ownership or reservation and must be rechecked at publication.

`docs/project/RELEASE-READINESS.md` still says no remote is configured, which no longer matches Git. Its historical green-gate declarations also conflict with current failures. SECURITY.md acknowledges that the mailbox must be confirmed. Version remains 1.5.0 while the release policy requests a new major and MCP reports 1.6.0.

Acceptance: one approved destination/identity, reachable public documentation and issue/security routes, recorded owner choices for history and third-party material, coherent version/changelog/CLI/MCP metadata, hosted CI on the actual release commit. Do not infer mailbox monitoring or branch protection from a Markdown file.

### R06 — P2: release automation does not enforce the documented candidate workflow

The only workflow is `.github/workflows/ci.yml`; no tag publication workflow is present. `prepublishOnly` at `package.json:74` cleans, regenerates knowledge and builds, but does not run tests, package boundaries or consumer smoke. It can therefore change the payload after a prior review without rechecking it. This is a control gap, not an assertion that publishing has occurred.

Define a single candidate-validation command and an authorized publish process that consumes the exact reviewed artifact. If using npm trusted publishing, configure the actual repository/workflow identity and provenance. Current npm guidance requires npm CLI 11.5.1+ and Node 22.14.0+ for trusted publishing; that publish-runner requirement is separate from the package's Node 22.12 consumer floor. [npm trusted-publisher documentation](https://docs.npmjs.com/trusted-publishers/).

Acceptance: reviewed artifact digest, green candidate checks, immutable version/tag, approved publication identity and a fresh installed-consumer verification. No publish action is authorized by this report.

### R07 — P2: generated API documentation has freshness and completeness gaps

Fresh generation produced 269 files and 117 warnings, while the initial existing-output scan covered 239 files. Warnings include referenced hook/options types omitted from the documentation and unresolved or omitted type links. `check:public-docs` checks forbidden content, not public API navigation, source/output parity or warning policy.

Acceptance: regenerate on the candidate, review warnings by public API impact, fix broken primary API references, and either gate unexpected warnings or maintain explicit dispositions. Numeric file counts alone are not a completeness test.

## 5. Getting started and beginner experience

The project should let a newcomer select a goal without first understanding its repository history. Today a careful reader can succeed using the full source walkthrough, but several equally plausible entry paths fail or lose critical context.

| Journey | Observed experience | Required improvement |
|---|---|---|
| Evaluate without merchant access | Credential-free demo and reference-app demo smoke work | Put simulation first and clearly label its local IDs/statuses |
| Install SDK/CLI | Packed imports, types and binary work | Correct publication destination and package-name guidance; verify the published consumer after release |
| Create first sandbox payment | Root quickstart explains credentials and test payer; generated starter misses `.env` loading | One executable path with prerequisites, exact command, expected output and recovery for ambiguous creation |
| Integrate Express/Next | Generator creates routes but trusts client amount and names nonexistent verification API | Reuse reference application's server order and callback invariants |
| Find a missing configuration | Doctor/help are useful; profile/usage errors vary in output shape | One actionable diagnostic contract with links/commands that actually work |
| Understand callback success | Source contains multiple trust models; production snippet skips key checks | Separate capture, verification, approval, matching, durable acceptance and fulfillment |
| Choose Postman | Useful nested README, but principal root routes do not expose it | First-class Postman link, chosen import artifact, variable setup and one validated beginner sequence |
| Ask for help | README's support/security/contributing knowledge commands fail | Ship working public topics or verified reachable destinations |

The desired first-payment sequence is: choose simulation or sandbox; confirm Node/package; load credentials on the server; prove configuration; create one unique attempt; display payment artifact; verify the gateway state against the stored order; fulfill once; recover deliberately when notification is absent. Do not equate QR creation, callback arrival or a browser redirect with permission to fulfill.

Recommended usability acceptance exercise: ask a developer unfamiliar with PayWay to follow the extracted package's README with only the documented prerequisites. Record first blocking step, help needed, commands executed, time to demo, time to first sandbox verification, and successful recovery from one missed callback. No novice study was performed in this audit, so there is no measured time-to-first-payment claim.

## 6. Resource discovery and completeness

The source material is extensive. The issue is which version users receive and which route they can find.

- D02/D03: the root README links short `docs-packaged` summaries instead of the complete walkthrough/reference; support topics are absent; the advertised MCP anchor is missing from the short reference.
- D04: a packaged getting-started page recommends bare `npx payway-sdk` despite the root warning that it resolves a different package outside a local installation.
- D05: 30 of 31 llms.txt documentation targets do not exist inside the package. The CLI can read knowledge, but that does not make file-index links valid.
- D06: command text is placed inside Markdown link destinations, and one quickstart command uses unsupported `docs --search` syntax.
- D07: Skills still describe journal defaults/location from before the unified app-data root and CLI-default recording changes. Synchronized mirrors can be identically wrong.
- WP08/WP09: offline KHQR recovery and verdict-mode snippets conflict with the actual channel/storage contracts.
- WP11: collection spec-path parity is narrower than SDK/provider-suite completeness; missing categories and verification states need an explicit matrix.

Recommended information architecture: one public start page with routes for backend SDK, CLI, Postman, callbacks and AI; one authoritative public source per concept; generated package-readable and CLI-readable representations; one capability inventory linking methods, commands, Skills, collection requests and verification status. Keep internal evidence accessible only to maintainers. This is a content/validation recommendation; a new docs framework is not required.

Completeness must be measured at workflow level: create, user interaction, verify, fulfill, refund/cancel where supported, and recover/reconcile. Counting endpoints or Skills cannot demonstrate this. COF/subscription, payout/beneficiary, Soundbox and partner activation should carry their enablement and live-verification limits next to the entrypoint.

## 7. AI friendliness

The architecture has useful components: 34 workflow Skills, eight bundled helper scripts, offline searchable knowledge, structured tool schemas, MCP catalogs, journal correlation, mutation exposure controls and ownership-safe installs. These should be preserved.

Current blockers are operational: S03 profile text corrupts MCP; S04 environment opt-in is ineffective; S05 machine errors vary by phase; D05 machine-index links fail; D07 teaches obsolete defaults; D09 helper returns success after HTTP rejection; D01 exports internal context unnecessarily. Detailed references in the component reports include reproductions and acceptance criteria.

AI release acceptance should exercise an installed tarball with an empty profile store and with a configured profile, a read-only host connection, a declared mutation opt-in preview, invalid arguments, unavailable credentials and knowledge retrieval. Require every tool failure to carry a useful machine-readable result. Test local side-effect tools separately from gateway mutation policy; saving a file or copying the clipboard is not literally side-effect-free even when no payment changes.

A capability-to-resource map should answer: which tool/command applies, required credentials and merchant enablement, whether it is local/read/mutation, required confirmation, output/error schema, retry policy, and live-verification status. This is more useful to an agent than additional broad Skills with overlapping advice.

## 8. Webhook readiness

The workbench has meaningful strengths: shared signature canonicalization, separate callback routes, durable capture options, replay and fixtures, status inquiries, and startup ordering that establishes the listener before publishing a tunnel URL.

Open defects:

| ID | Priority | Failure and required outcome |
|---|---|---|
| WP01 | P1 | Production-labeled example ACKs before durable work and never checks approved status/expected funds; replace with durable, validated, idempotent flow |
| WP02 | P1 | Stop trusts a shared stored PID, can signal a reused process, clears state without proving stop; authenticate instance ownership and confirm cleanup |
| WP03 | P1 | Forwarding is awaited before ACK with no application timeout; a hung destination must not block upstream acceptance |
| WP07 | P2 | Listener binds wildcard, not localhost; unbounded body/capture growth needs explicit bind and resource limits |
| WP08 | P2 | Offline KHQR recovery guidance uses online transaction lookup; document merchant-reference inquiry by channel |
| WP09 | P2 | Verdict-mode snippet omits await/start and mixes retry/trust claims; executable snippet and truthful delivery model required |

Safe probes reproduced forwarding dependence and stale-PID behavior using a local listener and intercepted signals. No unrelated process was signalled. These results do not certify real Windows tunnel shutdown, deployment hardening or production throughput. The development receiver must not be advertised as a production fulfillment service simply because it stores callbacks.

## 9. Postman readiness

The resumed local checks are green: 46 exported requests, 49 saved examples, 125 variables, syntax/structure/import-shape coverage, 37 simulated KHQR checks and export/index consistency. WP04's stale count/export/index gate is resolved locally. The portable helper is present; an old empty-helper diagnosis is not the present issue.

Remaining requirements:

- **WP05, P1:** callback pull imports unsigned token/customer/transaction values into operative variables and logs tokens. Verify/correlate before promotion; mask tokens; distinguish unsigned notification types from signed COF evidence.
- **WP06, P2:** iterating newest-first callbacks repeatedly overwrites variables, leaving older/mixed state. Select one correlated current event atomically.
- **WP10, P1 distribution gate:** active values and personal workspace/cloud linkage must not flow unquestioned into a public artifact. A Postman `secret` type label does not remove or encrypt YAML/JSON contents. Documentation says the prefilled values are public demo credentials; this audit did not verify authorization to redistribute the actual configured values. Obtain that disposition or replace with placeholders.
- **WP11, P2:** surface Postman from the root human/AI indexes and explicitly define the supported subset. A path-set parity test does not validate signing, body fields, merchant enablement or all provider endpoints.
- Import the **actual sanitized distribution** in a fresh Postman profile and verify variables, portable helper, first request, saved examples and QR/payment-link Visualizers. Offline VM/script checks cannot substitute for that UI test.

Decide the public delivery form: a generated sanitized v2.1 JSON, a sanitized local YAML workspace, or both with one canonical generator. A strict offline workspace must not inherit the maintainer's cloud identity. Preserve the active manifest-selected tree and clearly label historical reference copies.

## 10. Full-project boundaries beyond the main package

The tracked tree also contains native Android/iOS SDKs, OpenAPI sources, boilerplate/archive material, internal reports, scratch plans and agent configuration. The npm package allowlist excludes much of this, but publishing the repository is a separate operation.

Native companion SDKs received an inventory/documentation review, not a build certification. `sdk/ios/README.md:83` still uses `https://github.com/your-org/aba-payway-ios.git` as its installation URL. `sdk/android/README.md:42` claims zero external dependencies, while `sdk/android/sdk/build.gradle.kts` lists AndroidX, OkHttp, Gson, ZXing, coroutines and other libraries. Android advertises Maven coordinates without release verification here. The current CI has no Android build/test or macOS/iOS job.

**P2 release-scope requirement:** either exclude/clearly mark these companions as experimental source examples, or give them distinct supported versions, actual installation destinations, native builds/tests and platform-specific release gates. Do not extend the TypeScript suite's green result to them. This audit did not review every native code path or verify app-store/device behavior.

OpenAPI completeness likewise needs explicit scope. Collection parity counts 22 bundled paths against 23 collection paths and permits void as an exception; the root spec already includes void. Pick and document the authoritative spec/subset-generation relationship. Redistribution of bank-shared specifications, archived documentation and correspondence requires an owner disposition; project MIT metadata does not establish third-party permission.

No new full-history gitleaks run completed. Historical scan counts in old release documents are not a fresh clearance. The repository currently has an origin remote, but anonymous visibility, hosted CI, protections and security mailbox operation were not confirmed. These are bounded unverified release gates, not allegations of exposure.

## 11. Ordered remediation plan

Priorities: **P1** blocks the affected public release journey or credible release assurance; **P2** is a material correctness/completeness issue to resolve or explicitly scope out; **P3** is polish. Priority is release importance, not a CVSS score. Effort below is relative, not a delivery estimate.

| Order | Work package / suggested owner | Dependencies | Acceptance and evidence | Effort |
|---|---|---|---|---|
| 1 | Public payload and identity — release owner + docs maintainer | None | Close R03/D01 and WP10; inspect sanitized tarball/collection; decide repo/history/native scope and destination | Medium |
| 2 | Reliable release gates — tooling maintainer | Canonical paths/inventory | R01/R02 fixed; exact candidate checks finish; npm output-shape tests; no stale count pins | Small–medium |
| 3 | Safe first integration — SDK/docs maintainer | Public docs source selected | S01/S02/WP01 fixed; generated routes compile and reject mismatches; exact starter command works from only documented env setup | Medium |
| 4 | MCP and machine contracts — CLI/agent maintainer | Rebuilt package | S03/S04/S05/S09; real stdio with profiles; environment/flag precedence; consistent failures | Small–medium |
| 5 | Webhook lifecycle and acceptance — webhook maintainer | Instance/queue design | WP02/WP03/WP07; stale PID cannot signal unrelated process; slow forwarding cannot delay ACK; bounded loopback default; Windows cleanup evidence | Medium–large |
| 6 | One navigable public corpus — docs/Skills maintainer | Work packages 1 and 3 | D02–D07; no dead primary commands/anchors; all llms targets resolve; journal semantics correct; generated outputs fresh | Medium |
| 7 | Postman callback and recipient journey — collection maintainer | Sanitized distribution policy | WP05/WP06/WP08/WP09/WP11; correlated trusted import; current gate pass; fresh UI import and Visualizer check | Medium |
| 8 | Remaining configuration/helper contracts — SDK/Skills maintainer | Relevant fixes above | S06/S07/S08/D09; partner-only mock path, input validation, accurate helper exits | Small–medium |
| 9 | Dependencies, public docs and clean candidate — release owner | 1–8 | R04/R06/R07; dependency disposition, reviewed generated output, clean install and hosted matrix on candidate | Medium |
| 10 | Release rehearsal and approval — maintainer | All chosen product surfaces accepted | New version, immutable artifact/tag plan, publication identity, provenance, support channels, approved history and recipient smoke | Owner-controlled |

First implementation batch should combine the public-content blocker, broken gate paths/smoke parser, starter `.env` command and MCP stdout/default bug. They are bounded, reproducible and high impact. Avoid bundling a new UI framework, extra endpoints or a full documentation rewrite into that repair batch.

## 12. Ship / Do Not Ship boundary

**Ship only when all applicable gates are satisfied:**

1. Exact tarball and Postman distribution contain only reviewed public content and authorized demo/placeholder values; history/repository visibility and third-party material are disposed of separately.
2. Primary beginner routes work from an empty consumer project, including generated first-payment run instructions and real support/security discovery.
3. Generated/backend and production callback examples enforce server-owned order values, correct channel verification, durable acceptance and idempotent fulfillment.
4. MCP with saved profiles has protocol-only stdout; documented configuration works; machine failures are parseable and correctly classified.
5. Receiver process ownership, ACK isolation and bounds are verified; unresolved production-only behavior is explicitly excluded from support scope.
6. All configured release gates pass on the exact candidate, including package consumer smoke, docs/navigation, knowledge freshness, Postman artifacts, dependency disposition and secret/history checks.
7. Hosted Linux/Windows minimum/current runtime matrix is green; optional backend, native and gateway capabilities have their own evidence or explicit unsupported/experimental labels.
8. Version, repository, issue tracker, security contact, package identity, provenance and public links agree and are verified by the release owner.

**Do not ship** on the basis of test count, build success or the current package-boundary success alone. Do not claim full provider-suite parity, production approval, native SDK readiness or successful recipient Postman import without the corresponding evidence.

## 13. Audit completion and remaining verification

This audit delivered a current-state decision, fresh local checks, reproduced integration failures, component evidence, and a prioritized acceptance plan. The requested code/configuration/collection fixes are recommendations; implementation was not part of this audit request.

Still unverified: fresh Postman Desktop import/Visualizers, new live sandbox payment/callback/COF/payout/partner cycles, external AI host integration, real Windows receiver/tunnel lifecycle under failure, minimum-Node/Linux/macOS/native builds, hosted CI/protections, monitored mailbox, authorized public credential redistribution, and a fresh full-history secret scan. These are explicitly bounded follow-up checks. The report does not present them as completed or infer their success from mocks.

Suggested audit closure record after remediation: candidate SHA; artifact hashes; check results; finding ID -> fix/test evidence; scope exclusions with owner; public destination/support confirmation; and final maintainer Ship/Do Not Ship decision. Keep failed historical evidence for traceability, but make the current status register authoritative.
