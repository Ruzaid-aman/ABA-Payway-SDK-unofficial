# Second-pass audit: merged PayWay skills, SDK, CLI and documentation

Date: 2026-09-08. Review only; no implementation edits, commits, merges, or publication performed.

## Verdict and snapshot

**The changes are merged, but the previous seven review defects remain reproducible. Four further issues were identified.** The build and all 1,561 offline tests pass; this demonstrates that the current regression suite does not cover the failures below. Do not mark the audit remediation fully accepted solely from the commit message or passing suite.

Verified branch: `main`. HEAD at the start and end: `b12e301535158eb8180f5d042d7d2b6f6829a8a7`.

- `9d36e26`: skills/SDK/CLI audit remediation, F01–F13; confirmed ancestor of HEAD.
- `b12e301`: KHQR payload inspection/self-check and offline CLI artifacts.
- Tracked working files were clean at the start and end. A pre-existing untracked `.scratch/merged-worktree-preservation-20260907/` directory was left alone. This audit adds only the report and review evidence directory.
- The user reports that another agent still has final items in progress. No such uncommitted tracked edits were visible in this snapshot; conclusions apply to this HEAD, not to future or external work.

Scope: re-evaluated the merged implementations behind F01–F13, reran each prior R1–R7 reproduction, inspected the later KHQR addition, checked all 32 skill schemas and corpus structure, reviewed relevant examples and tests, and ran build, full offline tests, typecheck, lint, package boundary, generated-doc boundary, and packed-consumer smoke. This is not an exhaustive security scan or new validation of production PayWay behavior.

The requested skill-creator principles remain the review criteria: useful and precise discovery, scoped operations, correct executable examples, portable dependencies, and progressive disclosure.

## What is working

- All **32 skills pass the invoked skill-creator validator**, including the move to `metadata.version`.
- Mutation endpoints now default to one transport attempt, with explicit retry escape hatches. Existing mutation-policy tests pass. Read retries remain separately controlled.
- Token renewal/details examples now use locally valid request IDs.
- OpenCode's configured install directory has been corrected; explicit destination and agent-scoped doctor options exist.
- Journal pruning is separated into an explicit maintenance section.
- Several known misleading details have been corrected: purchase CLI gate availability, normal batch pacing, beneficiary examples, timezone spelling and hash count.
- The package installs into a temporary consumer and passes ESM, CJS, declarations, CLI demo and skill-count smoke checks.

### Correction to the first audit's hosted-checkout conclusion

The earlier audit was too broad in treating the hosted URL contract as obsolete. Current repository evidence at `docs/SANDBOX-FINDINGS.md:344`–345 explicitly distinguishes the `abapay_khqr_deeplink + hosted_view + paymentGate: 0` JSON URL case from other hosted responses. The implementation's two-route distinction is supported by that evidence. Preserve it, while continuing to recommend browser form submission for hosted HTML and avoiding a promise that captured HTML renders from an arbitrary merchant origin. No live gateway probe was needed or performed to reach this source-based correction.

## Previous review findings — freshly reproduced

| ID | Priority | Current evidence and impact | Required correction |
|---|---|---|---|
| **R1** | **P1** | `src/utils.ts:495,518`: a 4000 KHR order queried with refund currency USD returns `status: ok`, `requestCurrency: USD`, `remaining: 4000`. The helper never validates requested currency against order currency. The CLI therefore compares numbers in different units. | Reject or explicitly return ambiguous/unavailable on missing/mismatched currency; require resolution before claiming preflight succeeded. Add both mismatch directions and missing currency. |
| **R2** | **P1** | `skills/aba-payway-customer-qr/SKILL.md:26`–33: the actual example reads `status/amount/currency`, whereas the supplied callback fixture uses `payment_status` and separate original/payer money. Running the guide handler with an APPROVED fixture and successful signature verification returns HTTP 200 and queues **zero jobs**. | Normalize the actual route fields and money, then check approval and atomic fulfillment. Test the actual example, not only the presence of guard-related words. |
| **R3** | **P1** | `src/cli/commands/skills.ts:123`–125,168,211: an edited file is preserved on upgrade one, omitted from the rewritten manifest, then silently overwritten on upgrade two. Reproduced without force. | Preserve baseline ownership/hash for conflicts and protect pre-existing unowned files. Test two ordinary upgrades before any force override. |
| **R4** | **P2** | `src/cli/commands/skills.ts:168,211`: install A+B, then A-only. B remains on disk but disappears from the manifest. Future edit protection and removal ownership are lost. | Merge partial installation results into the existing manifest. Prune only explicitly retired owned resources. |
| **R5** | **P2** | `src/cli.ts:1896`–1928: `refund -y --json` emits human preflight text before JSON. Fresh synthetic success reproduction fails `JSON.parse(stdout)`. Moving the profile diagnostic alone did not establish clean machine output. | Route all machine-mode diagnostics to stderr and emit an envelope for local preflight rejection and API failure, not just success. |
| **R6** | **P2** | `reconcile.cjs:133`–143: a legacy timestamp file and its sibling `.seen.json` load with an empty ID set. The new inclusive timestamp policy can then re-emit old transactions. | Migrate the legacy pair into the new checkpoint before processing; add an upgrade/restart fixture. |
| **R7** | **P2** | `src/cli/commands/skills.ts:doctorSkills`: change a packaged guide after installing it; doctor still returns true for the old installed copy. It compares installed bytes with the old manifest, not the new package. | Compare package, installed and baseline hashes; distinguish outdated, locally modified, missing and incompatible. Parse frontmatter instead of checking only its opening delimiter. |

`reconcile.cjs` above means `skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs`. Full original explanations remain in [the previous review](../skills-improvements-review-2026-09-07.md); today's outcomes are recorded in [results.json](./results.json).

These are local behavior defects. In particular, R1 does not establish that the gateway permits an excessive refund, and R2 does not establish that every production callback uses the fixture shape. It establishes that the recommended handler cannot process the project's own supported approved fixture.

## Newly identified issues

### S1 — P2: removing a managed skill deletes unowned files inside its directory

Location: `src/cli/commands/skills.ts:254`–255.

The manifest records ownership per file, but removal converts it to directory ownership and recursively removes the entire directory. In a temporary installation, adding untracked `aba-payway-a/my-notes.md` and removing the installed skills deleted the custom file too.

This is narrower than the existing test, which preserves a completely separate custom skill directory. Users may also add notes, references or scripts inside an installed skill. The original audit recommended removal of manifest-owned files, not arbitrary files sharing the parent folder.

Correction: remove verified owned files; retain modified/unowned files by default and remove only empty directories. If full-directory removal is desired, make that destructive policy explicit. Add tests for custom resources inside a managed skill, not only beside it. Use the same ownership rules during upgrade pruning, including files removed from a still-shipping skill.

### S2 — P2: KHQR inspector misparses UTF-8 and accepts malformed nested structures

Locations: `src/khqr-offline.ts:171`, 202–206. Added by `b12e301`.

The generator encodes TLV lengths with `Buffer.byteLength(value, 'utf8')`; the new inspector advances JavaScript string indices by that byte count. A QR generated by the SDK with merchant name `Café` has a valid CRC, yet `inspectKhqrPayload()` returns undefined. The inspector cannot round-trip a value accepted by its own generator.

The inspector also ignores nested parse failure: the synthetic root `00020130010` contains a tag-30 value consisting of the incomplete TLV string `0`. After adding a correct CRC tail, the inspector reports `valid: true`, although its documentation says structurally malformed payloads return undefined. Root parsing also uses numeric conversion rather than checking two decimal length digits.

Correction: parse a UTF-8 byte buffer consistently, require valid header digits and complete nested templates, and define what `valid` proves. Separate structural validity, CRC integrity and any broader KHQR conformance result; CRC is not authenticity. Retain the documented malformed-versus-bad-checksum distinction.

Acceptance: round-trip accented and multibyte names within supported limits, incomplete nested template, malformed length digits, truncated multibyte value, duplicate known fields if disallowed by the chosen contract, valid structure with bad CRC. Do not conflate this local round-trip test with confirmation that a bank accepts every character.

### S3 — P2: offline QR machine mode silently ignores an explicit image request

Locations: `src/cli.ts:2375`–2392 versus 2440–2447. Behavior mismatch exposed by the new offline image feature.

Reproduction after a fresh build:

```text
generate-qr --offline --ref AUDIT -a 1 -y --no-polling --no-open-image --save-image <temporary>/requested.png --output json
```

Using only synthetic KHQR environment configuration, the command returns accepted with `artifacts: {}` and creates **no requested PNG**. The structured branch returns before inspection and image generation. Human mode reaches the later artifact code. The exact same explicit image flag therefore changes behavior when an automation consumer requests JSON.

Correction: perform local generation, inspection and requested artifact work before selecting the renderer. Populate `artifacts.qrPngPath`; keep human text, JSON and NDJSON as presentation choices. Add negative tests for unwritable paths and explicit `--no-save-image`, and decide how artifact failure should be represented without misreporting the already-created QR.

### S4 — P2: token-expiry example uses the linking date as the expiry date

Locations: `skills/aba-payway-token-lifecycle/SKILL.md:35`–36; SDK contract at `src/utils.ts:335`.

The guide computes `expiresAt`, then calls `daysUntilTokenExpiry(linkedAt)` instead. The helper expects an expiry timestamp, not the start of the validity window. With both linked-at and now set to 2026-09-08, the guide's expression returns **0 days**, while `daysUntilTokenExpiry(computeTokenExpiry(linkedAt), now)` returns **90**.

Correction: pass the derived expiry date and clarify which event provides the validity base. Add an executable frozen-clock example covering fresh, near-expiry and expired tokens. The earlier request-ID fix is valid but did not make the entire quick start correct.

## Audit-plan completion assessment

| Original item | Assessment at this HEAD |
|---|---|
| F01 mutation retries | Core implementation present; dedicated tests pass. Keep the compatibility change explicit in release planning. |
| F02 refund correctness | Partial; R1 still breaks the currency-aware contract. |
| F03 reconciliation | Equal-time/delayed ID handling and saturation warning added; migration R6 remains. Output/checkpoint are not a transaction together. |
| F04 fulfillment example | Guard vocabulary added, but actual approved fixture is dropped (R2). |
| F05 hosted response guidance | Substantially corrected; two-route distinction supported by repository evidence. |
| F06 token examples | Invalid request IDs corrected; expiry example still wrong (S4). |
| F07 offline notification guidance | Capability guidance added, but `skills/aba-payway-offline-qr/SKILL.md:59` still retains the older blanket “unlike a locally built offline QR” routing distinction. Remove that contradiction. |
| F08 metadata | Verified complete for the invoked validator: 32/32 pass. |
| F09 installer | Paths/options added; ownership, partial-upgrade and doctor acceptance criteria remain incomplete (R3/R4/R7/S1). |
| F10 portability | Source-only examples/reference handling improved; actual workflow execution from installed skill locations still needs broader coverage than count/help/demo. |
| F11 machine output | Profile diagnostic corrected; refund output remains invalid JSON (R5); command-wide versioned schema coverage is still partial. |
| F12 semantic checks | New tests exist, but many docs checks still match phrases. All current tests pass while actual examples and multi-step upgrades fail. |
| F13 smaller drift fixes | Several corrected, including pacing/count/timezone. Do not infer corpus-wide correctness from individual fixes. |

No claim is made that every proposed architectural enhancement was required in the first implementation batch. Missing optional enhancements below are recommendations, not regressions.

## Recommended enhancements and execution order

### 1. Repair correctness before expanding the public API

**First batch:** R1, R2, R3. Add the failing reproductions as meaningful regression tests before changing code. For refunds, use one validated money representation with an explicit currency and unavailable/ambiguous result; do not let a caller-supplied label change the units of a number. For callbacks, use route-specific normalization and a transactional outbox that atomically couples acceptance with a durable fulfillment job.

Acceptance: both refund currency mismatch directions fail safely; a signed supported approved fixture queues once; pending/duplicate/wrong-money callbacks do not fulfill; user edits survive two or more normal upgrades.

### 2. Make skill installation a versioned ownership protocol

**Second batch:** R4, R7 and S1, building on R3. Store package identity/version, per-file baseline hashes and selected skill set. Preserve unrelated entries during partial operations, explicitly migrate old installations without manifests, and validate manifest paths before any file operation. Resolve linked dependencies for `--only` bundles or return a clear missing-dependency report; doctor should validate the selected bundle rather than require all 32.

Acceptance: full/partial installs, legacy migration, conflict preservation, package-outdated detection, removed files in a retained skill, user-added files, and safe uninstall all work from temporary consumer homes. Installing repeatedly should converge without erasing ownership or edits.

### 3. Separate work from CLI presentation

**Third batch:** R5 and S3. Share command execution and artifact handling, then render human/JSON/NDJSON output. Keep diagnostics on stderr and preserve identifiers, unknown outcomes and partial artifact failures in the result. Start with refunds and offline QR rather than broadly rewriting every command at once.

Acceptance: JSON parses directly, every NDJSON line parses, and the same action flags have the same effects across renderers. Include local validation, gateway rejection, timeout, cancellation and unwritable artifact destinations.

### 4. Establish recovery semantics and robust KHQR inspection

**Fourth batch:** R6 and S2. Migrate reconciliation state atomically and document at-least-once output unless the sink is truly transactional/idempotent. Writing CSV before a separate checkpoint can duplicate rows after a crash; an atomic checkpoint alone cannot guarantee exactly-once output. Keep a saturated-result warning because this API has no documented pagination parameter.

For inspection, share byte-based TLV parsing with tests and, where justified, the bundled decoder. Avoid maintaining divergent string and byte parsers that disagree on accepted data.

Acceptance: legacy upgrade does not replay known IDs, crash/restart is tested, gap warnings remain observable, and generated UTF-8 values round-trip.

### 5. Replace phrase tests with a small skill behavior harness

**Fifth batch:** S4 and F12. Extract selected real code blocks into fixture environments; typecheck against the installed public package; execute handlers with known callbacks and invoke CLI snippets against a local mock. Give fixture hooks stable names rather than copying the same scenario logic into prose and a separate test.

Minimum behavior cases: first payment unknown outcome, approved and non-approved callbacks, currency mismatch, token expiry, double upgrade, partial bundle, legacy checkpoint migration, UTF-8 QR, and JSON-plus-image output. These tests should fail when the guide itself becomes wrong.

### 6. Reduce skill context and refresh active documentation

Current entrypoints total **16,102 whitespace-delimited words**, with **zero skill-local `references/` directories**. The first audit counted 14,490 words, so the remediation increased the entrypoint corpus by about 11%. Word count is not a quality score; the opportunity is to move conditional detail out of default context while keeping important endpoint distinctions visible.

- Keep first-payment as the entry guide; load one chosen route. Keep webhook-production for fulfillment and journal for investigation.
- Move agent provider setup, detailed provider errors and the exhaustive tool table into selected references. Preserve context selection, authorization and unknown-outcome guidance in the entrypoint.
- Let COF route to linking/charging/lifecycle guides. Preserve old removal skill names as thin compatibility routers before removing them.
- Replace direct profile-file editing advice with a supported headless import/update interface using stdin or a protected file, validation and redacted output. Avoid secret-valued command arguments.
- Maintain one contract table for units, callback trust, response variants and CLI equivalents, with generated/checkable repeated tables. Do not generate entire skills as copies of an API manual.
- Refresh active HANDOFF and release-readiness headings: they still describe `codex/opensource-release-polish` and an older main baseline. Preserve historical notes as history, and identify open work separately from merged work. A stale authoritative heading is a practical agent-routing defect.

Acceptance: each selected workflow works from a packed installation without internal audit files; essential references are available and only relevant references are loaded. Keep native declarations/tests as the authority for function shapes and dated sandbox records as evidence for provider observations.

## Verification and reproducibility

| Check | Fresh result |
|---|---|
| `npm run build` | Passed, ESM/CJS/declarations rebuilt |
| `npm test` | **1,561 passed / 101 files**; live sandbox suite excluded by the command |
| `npm run typecheck` | Passed |
| `npm run lint` | Exit 0; one warning and two informational suggestions; not warning-free |
| `npm run check:package` | Passed: 61 files, 32 skill guides, 560,349 packed bytes |
| `npm run check:public-docs` | Passed: 194 generated files; not a full semantic docs audit |
| `npm run smoke:package` | Passed: installed ESM/CJS/declarations, CLI demo, 32 skills |
| Skill-creator validator | 32/32 pass |
| Independent review probes | Reproduced R1–R7 and S1–S4 |

Run the synthetic probes from the repository root after build:

```powershell
npx tsx audit-results/second-pass-2026-09-08/probes.mts
```

The [probe source](./probes.mts) writes [results.json](./results.json). It uses temporary installation directories, synthetic credentials, a stubbed refund fetch, and locally generated KHQR data. Callback signature verification is intentionally stubbed successful to isolate post-verification handler behavior. No real PayWay network requests, charges, refunds or customer callbacks are sent. Temporary fixture folders are reported in the results and retained for inspection.

Build outputs were regenerated. Tracked source stayed unchanged, and HEAD stayed at `b12e301`. Coverage, hosted CI, new production verification and exhaustive security testing were not run.

## Ship boundary

**Internal review:** the merged work and this report are ready for corrective follow-up; use the preserved IDs to avoid losing context across another agent handoff.

**Public acceptance:** withhold a claim that the skill pack or audit remediation is fully validated until the P1 findings and relevant P2 acceptance cases are closed on a stable commit. Existing publication blockers in `docs/RELEASE-READINESS.md` remain a separate maintainer decision. Passing local package tests does not clear historical-secret disposition, provider enablement, repository ownership or publication approval.
