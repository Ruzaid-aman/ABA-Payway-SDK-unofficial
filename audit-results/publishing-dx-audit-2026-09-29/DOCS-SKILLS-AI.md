# Documentation, packaged Skills, and AI developer experience audit

> **1 October item 6 remediation:** [Current corpus verification](ITEM-6-CORPUS-2026-10-01.md) resolves D03–D07 locally. D02's missing topics are fixed and work in an installed tarball; private security-mailbox operation remains an owner check. The findings below retain the original audit snapshot.

> **30 September status addendum:** D08 (stale generated knowledge) is resolved in the resumed working tree at `34550df` plus the existing Postman edits. The root rerun passed 2,120 offline tests across 147 files with two workers, including corpus freshness. The earlier installer timeouts are not an open functional defect. D01–D07 and D09 remain open; MCP-specific runtime findings are in [SDK-CLI.md](SDK-CLI.md). Use [REPORT.md](REPORT.md) for the current decision and acceptance plan. Evidence below retains the original 29 September snapshot.

Audit date: 2026-09-29. Scope: the current local checkout, README/QUICKSTART onboarding, source and packaged documentation, generated knowledge and llms.txt, 34 packaged Skills and their eight tools, installer ownership safeguards, MCP discoverability. No source, credentials, or user settings were changed. No gateway request was made. One tool-contract reproduction used a loopback HTTP server and an explicitly synthetic signing key.

## Verdict

**Do not publish the current documentation payload.** The underlying guidance is substantial, and the CLI/Skills architecture has useful safety boundaries. However, a raw internal sandbox dossier is included in the public knowledge corpus, the README's support/security commands fail, and its most prominent links lead to skeletal packaged summaries rather than the detailed material already available. These are concrete publishing/DX defects, not requests for additional features.

The most important repair is to establish one public documentation source with generated, package-valid navigation. The current source docs, `docs-packaged/`, knowledge copies, root quickstart, and machine index are not consistently connected.

## Evidence and checks

| Check | Fresh result |
|---|---|
| Skill inventory | 34 SKILL.md guides, eight .cjs files, one bundled reference document |
| Recursive packaged Skill vs `.zcode/skills` byte parity | No differences for the packaged resource tree |
| Knowledge manifest | 31 topics; every source exists |
| Manifest raw source hashes | Two stale sources: `docs/recipes/cloudflare-free-webhook.md` and `docs/guides/AGENT-SETUP-PLAYBOOK.md` |
| Source CLI `docs support/contributing/security --json` | All exit 1 with the standard validation envelope and unknown-topic message |
| Source CLI `docs webhook-setup --search local-webhook-workbench` | Exit 1, unknown option `--search` |
| Source CLI MCP catalog | Read-only catalog: exit 0, 12 tools; allow-mutations preview: exit 0, 17 tools; stdout parses as JSON |
| llms.txt local destinations | 31 doc destinations; 30 point into the unshipped `docs/` tree |
| Mock callback invalid input | Exported builder accepts `amount: 'not-a-number', currency: 'EUR'` and constructs `payment_amount: 'NaN', payment_currency: 'EUR'` |
| Mock callback HTTP failure | Loopback receiver returned 400; tool printed rejection but exited 0 |

The root audit independently ran the full test suite and a focused rerun. It confirmed the knowledge freshness failure. Four installer timeouts from the concurrent full run passed in the focused single-worker run (all 15 installer tests passed). The root also reports `check:package` passing with 127 files and 34 Skills despite the dossier inclusion. Treat installer timing as a test-concurrency concern, not evidence of broken install ownership. This report does not independently re-run the whole test suite or a live gateway flow.

## Confirmed findings

### D01 — P1: internal sandbox dossier is exported as public knowledge

**Evidence:** `scripts/knowledge-sources.mjs:6-9` states that internal audit dossiers stay out of the corpus; line 40 nevertheless selects `docs/internal/CLOSE-TRANSACTION-FINDINGS.md`. The resulting `knowledge/close-transaction-findings.md:1-9` identifies itself as a violation dossier and escalation record. Its lines 37-47 and later evidence tables preserve actual sandbox transaction/approval references and raw operations. `package.json:47-50` includes knowledge in the tarball. `scripts/check-package-contents.mjs:42-52` rejects `docs/internal/` paths and selected filenames, but the generated topic name evades that boundary. `src/__tests__/knowledge.test.ts:88-93` similarly checks a short filename denylist rather than the curated source classification.

**Impact:** publication distributes internal evidence despite an explicit public/private boundary. This is a confirmed content-boundary failure; the finding does not claim the sandbox identifiers are production credentials. Sensitive values are deliberately not repeated here.

**Reproduce:** inspect the source selection and generated topic, then inspect `npm pack --dry-run --json --ignore-scripts`; the generated dossier is included even when `check:package` passes.

**Remedy:** remove the dossier from public curation; write a small public guide describing channel-dependent closure, local order policy, and reconciliation without raw evidence or escalation history. Enforce source-level exclusion of `docs/internal/`, not only packaged filenames.

**Acceptance:** no manifest topic resolves to an internal source; extracted package contents contain no raw dossier; public close semantics remain discoverable; the boundary test fails on an intentionally introduced internal source before packaging.

### D02 — P1: public README support and security paths are nonfunctional

**Evidence:** `README.md:62`, `README.md:68`, and `README.md:70` recommend `docs support`, `docs contributing`, and `docs security`. None is registered in `scripts/knowledge-sources.mjs:12-43`. All three were run through the source CLI and each returned exit 1 with `Unknown knowledge topic`.

**Impact:** a reader cannot follow the documented support scope, contribution guide, or private vulnerability-reporting route through the promised packaged interface. This is especially undesirable at first publication when repository destinations are not yet settled.

**Remedy:** curate public versions of these three documents into knowledge, or link to verified public destinations and ship the required files. Add executable checks for command snippets used as primary navigation.

**Acceptance:** each README command returns exit 0 and meaningful current guidance from an installed tarball; the security text names a functioning private reporting channel; contribution and support scope can be read without source checkout internals.

### D03 — P1: prominent README links lead to incomplete or misleading packaged summaries

**Evidence:** `README.md:38` promises a reference application demonstrating pricing, verification, idempotent fulfillment and reconciliation, but `docs-packaged/guides/FIRST-PAYMENT-WALKTHROUGH.md:3-9` only offers three bullets and refers back to unspecified repository sources. Its sequence asks for a sandbox profile, starts the simulated demo, then suggests querying a transaction through `check-transaction`; the demo does not create a gateway transaction. The full source guide `docs/guides/FIRST-PAYMENT-WALKTHROUGH.md:5-27` carefully separates simulation from sandbox and provides runnable commands. `README.md:52` links to `docs-packaged/reference/SDK-AND-CLI-REFERENCE.md#MCP-Server`, but that nine-line summary contains neither that section nor the server configuration and safety contract. The actual source reference has those details at `docs/reference/SDK-AND-CLI-REFERENCE.md:869-891`. `docs-packaged/README.md:5-10` is an unlinked topic inventory rather than the route map promised by README's documentation-index link.

**Impact:** the default beginner and AI journeys lose the project's strongest implementation guidance at their first click. A user can follow the suggested simulated-demo sequence and query the gateway for a transaction that never existed.

**Remedy:** generate packaged readable guides from the same curated public sources; preserve a clear simulation/sandbox distinction and valid hyperlinks. Link an installed user to a concrete verified repository example URL or provide a runnable packaged starter. Do not replace full guidance with descriptions of what omitted guidance would explain.

**Acceptance:** walk README -> reference app -> run -> verify from a clean tarball installation; every referenced section exists; simulated IDs are never sent to gateway lookup as the proposed demo success path; README -> MCP includes installed-package host configuration and read-only/mutation boundaries.

### D04 — P2: packaged getting-started recommends the wrong package-resolution command

**Evidence:** `docs-packaged/guides/01-getting-started.md:6` recommends `npx payway-sdk <command>`. `README.md:32`, `QUICKSTART.md:27`, and the first-payment Skill explicitly warn that the binary name differs from the package name and that bare `npx payway-sdk` can resolve an unrelated package.

**Impact:** particularly before local installation or when run outside the consuming project, copying the packaged guide can invoke the wrong package. No registry command was executed in this audit; the finding is the confirmed contradictory command guidance and package/bin naming in package.json.

**Remedy:** use `npm exec -- payway-sdk` after installing `aba-payway-ts`; if advertising one-shot registry execution, name the package explicitly. Keep source-checkout invocation separate.

**Acceptance:** no active public guide recommends bare `npx payway-sdk`; examples are tested with the intended package installed in an empty consumer directory.

### D05 — P2: llms.txt is not navigable inside the shipped package

**Evidence:** `scripts/sync-knowledge.mjs:104` writes each manifest `source` as the index URL. `llms.txt:33-63` consequently points to `docs/guides`, `docs/recipes`, `docs/internal`, and `docs/reference`. Those source paths are not included by `package.json:44-53`. Thirty of 31 generated doc destinations therefore do not exist in the tarball. `scripts/check-package-contents.mjs:57` omits `.txt` from inspected text extensions and its local-link checker only runs on `.md` at line 80. The index also advertises 34 Skills at `llms.txt:4` but 32 at line 67; the generator hardcodes the latter at `scripts/sync-knowledge.mjs:110`.

**Impact:** a file-reading AI or human follows the advertised machine index into nonexistent package paths. The CLI knowledge command is functional, but that does not make those links functional.

**Remedy:** emit package-relative `knowledge/<file>` destinations, or intentionally emit public absolute version-pinned URLs. Generate counts from the catalog. Include llms.txt navigation in extracted-package checks.

**Acceptance:** every llms.txt local target exists in the tarball; every public URL is pinned and verified at release; counts agree with actual catalog; no internal source path is advertised.

### D06 — P2: QUICKSTART navigation contains shell commands as Markdown destinations and an invalid flag

**Evidence:** `QUICKSTART.md:83`, `85`, `87`, `144`, `150`, `181`, and `201` place shell command text inside Markdown link destinations. Such links are not a command execution mechanism in ordinary Markdown/npm/GitHub views, and destinations containing unescaped spaces may not render as links at all. Line 85 additionally advertises `payway-sdk docs webhook-setup --search "local-webhook-workbench"`; the CLI accepts only `--json` and help for this command (`src/cli/commands/docs.ts:47-53`). The advertised command reproduced exit 1, unknown option `--search`. `scripts/sync-knowledge.mjs:51` creates the command-as-link form for generated knowledge. `scripts/check-package-contents.mjs:84-86` exempts these targets instead of validating their command contract.

**Impact:** the troubleshooting and next-step path is difficult to follow precisely when a beginner encounters a failure. The package boundary check's green result does not demonstrate navigability.

**Remedy:** render commands as inline code with an explicit Run instruction; use actual relative links for browser-readable copies. For search use the supported `docs search <terms>` syntax, or introduce an intentionally designed topic-filter feature separately.

**Acceptance:** the quickstart renders with valid clickable destinations in a standard Markdown renderer; every advertised CLI navigation command executes successfully from the package; bad command flags fail a documentation check.

### D07 — P2: journal Skill teaches obsolete defaults and storage location

**Evidence:** `skills/aba-payway-journal/SKILL.md:10` describes an opt-in record; lines 66-76 frame CLI recording as requiring enabling and identify `<cwd>/payway-data/journal.jsonl`. Current `src/cli/journal-policy.ts:1-8` and `39-44` enable gateway commands by default unless disabled. `src/config/data-root.ts:5-9` and `20-27` resolve `PAYWAY_DATA_DIR` or app-data storage. The agent Skill also calls it opt-in at `skills/aba-payway-agent/SKILL.md:135`. These guides and their mirrors are byte-identical, so synchronization alone does not catch semantic staleness.

**Impact:** an assistant can search the wrong location, incorrectly conclude no records exist, or fail to explain that routine CLI API commands write local records. The SDK library remains opt-in; that distinction must be explicit.

**Remedy:** align journal, agent and configuration Skills with CLI default-on/SDK opt-in behavior, `--no-journal`, data-root overrides, `doctor --json`, and storage backend guidance. Include a minimal runtime-backed contract test rather than pinning only prose counts.

**Acceptance:** following the installed Skill finds the current data root; it distinguishes CLI and SDK defaults and explains opt-out; mirrors remain identical after the semantic update.

### D08 — P2: generated knowledge is stale at the audit snapshot

**Evidence:** `knowledge/MANIFEST.json:249-253` and `259-263` store hashes that do not match `docs/recipes/cloudflare-free-webhook.md` and `docs/guides/AGENT-SETUP-PLAYBOOK.md`. Direct SHA-256 verification reproduced both mismatches. The root full test run and focused rerun independently reproduced the freshness test failure.

**Impact:** an AI querying the offline corpus sees older guidance than a source-doc reader; a release cannot claim synchronized knowledge. `prepublishOnly` regenerates knowledge, but regeneration at publication is not a substitute for reviewing the regenerated content and running gates against it.

**Remedy:** review the current source edits, regenerate after approved documentation fixes, inspect output, then run the knowledge freshness test and package checks against those exact bytes.

**Acceptance:** all source and output hashes match; the knowledge test passes; publication uses the reviewed generated artifact.

### D09 — P2: bundled mock-callback tool violates the advertised exit/validation contract

**Evidence:** `skills/README.md:127-141` states that HTTP/runtime failures return 1 and invalid currency/amount return 2. `skills/aba-payway-hash/scripts/mock-callback.cjs:60-62` accepts any currency and coerces bad amounts to `NaN`; lines 183-190 only print non-2xx rejection without changing the exit status. Its public builder is exported at line 200. A pure builder invocation produced `NaN`/`EUR`; an isolated HTTP 400 loopback response produced process exit 0 while printing `Handler did NOT acknowledge`.

**Impact:** automation can report a successful callback-handler smoke check despite HTTP rejection, and malformed fixtures can distract debugging. This is bounded to the bundled helper; the finding does not assert the first-class webhook CLI has the same defect.

**Remedy:** reject unsupported currency/nonfinite or invalid amounts before sending, return 1 for non-2xx responses, and document intentional negative verification outcomes separately from runtime failures. Keep the supported CLI workbench as the first path.

**Acceptance:** fixture tests cover malformed amount/currency, HTTP 400/500, network timeout and HTTP 2xx; failure status is machine-visible; docs and all eight script contracts agree.

## Strengths worth preserving

- The root quickstart defines creation, verification, fulfillment, unique attempt IDs, ambiguous create recovery, test-payer prerequisites and signed/unsigned callback distinctions. It includes both POSIX and PowerShell examples and avoids asking users to paste credentials into chat.
- Source docs offer real route selection rather than requiring all chapters to be read sequentially. The full first-payment reference exercise explicitly tests missed callbacks, duplicate delivery, incorrect amounts/currencies and persistent attempts.
- All 34 packaged Skills are present and recursively mirrored. Their YAML frontmatter and required quick-start/error sections have validation in `src/__tests__/skills.test.ts:26-88`.
- Installer code uses manifest ownership and content hashes, validates relative paths, refuses nested symlinks/junctions, preserves modifications and unowned files, and separates deliberate `--force-skills`. See `src/cli/commands/skills.ts:48-99`; focused installer tests pass according to root verification.
- Eight helper scripts ship with their owning Skills rather than referring only to unshipped repository probes. Reconciliation explicitly warns about 50-row saturation and keeps atomic checkpoint state; this is useful operational guidance.
- MCP reuses the agent tool schemas, omits mutation-class tools from the default catalog, and previews the effective catalog without starting stdio. The fresh 12/17 counts match source design.
- Knowledge offers offline topic reads, search, JSON envelopes and freshness hashes. The problem is content selection and navigation, not the absence of a usable retrieval mechanism.

## Completeness and improvement opportunities (not additional confirmed bugs)

| Surface | Coverage | Next useful improvement |
|---|---|---|
| First payment and platform docs | Strong source coverage for QR, hosted checkout, links, mobile/webview/Telegram | Test the default rendered/installed journey, not just source-file presence |
| Skills | 34 workflow guides cover major payment, COF, refund, payout, transaction and agent domains | Add a generated capability-to-guide map with explicit supported/unverified status |
| MCP | Runtime catalog verified; detailed source reference exists | Provide installed-package configurations for common hosts, mutation authorization boundary and troubleshooting; put them in the actual README destination |
| Storage/token lifecycle | Current code and source guides are richer than installed Skills | Document token-store list/expiry/renewal/removal side effects and unified root; the token lifecycle Skill does not explain the local expired-token charge guard |
| Soundbox/self-activation | Self-activation has a Skill and explicitly states spec-derived status | Decide whether Soundbox needs its own Skill or a clearly indexed section; avoid implying all exposed routes are live-verified |
| Errors and support | Detailed source troubleshooting plus machine registry | Publish actual support/security routes, and make the packaged error summary point to `knowledge/error-codes.json` rather than implying a root `error-codes.json` (`docs-packaged/guides/12-error-handling-and-debugging.md:7`) |
| Counts and inventory | Runtime can enumerate catalogs | Generate README/Skills/llms counts to prevent the current 30/31-topic and 32/34-Skill contradictions |
| Docs acceptance tests | Good structural and freshness foundations | Check anchors, llms.txt links, command snippets, source provenance, and semantic defaults across guides |

External URLs, provider portal content, current third-party agent loading conventions and actual npm/public repository ownership were not verified in this read-only repository subaudit. They remain release checks, not confirmed-working claims here.

## Suggested remediation order and release acceptance

1. **Content boundary:** remove the internal dossier from all public representations, replace it with reviewed public semantics, strengthen provenance gates.
2. **Actual entry paths:** repair README support/security routes and its walkthrough/MCP/index destinations; fix the bare npx recommendation and command-as-link quickstart navigation.
3. **Cross-surface contracts:** update Skills for storage/recording behavior, correct the helper exit contract, generate valid llms destinations and counts.
4. **Rebuild the public corpus:** regenerate only after source selection and prose are reviewed; rerun freshness, package and extracted-consumer checks.
5. **Clean consumer walkthrough:** from a new application and packed tarball, follow README to demo, generated starter, help, offline docs, optional Skill install/doctor in an isolated destination, and read-only MCP catalog. Gate any live sandbox payment separately on test credentials and payer access.

**Ship boundary for this scope:** no internal dossier; no broken primary support/security/onboarding route; consistent simulation/gateway behavior; package-valid machine and human navigation; synchronized public corpus and Skills; helper failures machine-visible; clean-consumer documentation walkthrough passes. Further route-specific examples and dedicated Skills are worthwhile but are not prerequisites for repairing these defects.
