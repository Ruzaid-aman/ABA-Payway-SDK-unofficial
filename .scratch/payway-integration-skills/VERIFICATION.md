# Integration skill candidate verification — 2026-10-01

Decision: **Do Not Ship yet.** Implementation and local preparation are complete; Claude is explicitly deferred and existing publication dependencies remain open.

## Candidate identity

- Branch: `codex/payway-integration-skills`.
- Reviewed base: `1b491f96ce61fc7f7b037b3128c24e46335afbcc`.
- Changes are staged in the isolated checkout; no implementation commit, push, tag or publication.
- Original checkout's edited helper/onboarding/client files and untracked evidence were preserved and excluded. App worktree registration failed after checkout creation; the existing verified Git checkout was used.
- SDK/package version remains the unpublished `1.5.0` baseline. The release owner must choose the publication version; this tarball is a review artifact, not permission to release 1.5.0.

| Review artifact | SHA-256 |
|---|---|
| candidate/aba-payway-ts-1.5.0.tgz | 539679ec257b99f62c1a801b789be156c4de5ddd35d1a86eca12a335ed4414e8 |
| candidate/aba-payway-integration-1.0.0.zip | 8966d5a36d4ab902b194218fe7851ae0e711aa57791332d35db1244966d8843a |

The ZIP contains the complete standalone skill folder. The tarball contains 191 allowlisted files, 35 skills, 1,239,483 packed bytes and 4,947,841 unpacked bytes. Private plans, trial transcripts, audit records and source checkout files are not package dependencies.

## Changes and acceptance

New project integration router, all-flow capability/evidence matrix, self-contained generated references and five TS recipe assets. Shared public corpus has 37 topics and a recursive byte-identical skill mirror. Express/Next samples preserve server-owned prices and authorization; persist attempts/reconciliation before submission; durably queue callback hints; bind trusted inquiry to saved identity, original currency and amount; atomically enqueue one fulfillment; retain uncertain attempts without replay.

Payment-link creation log tran_id is not used as a customer payment ID. Link inquiry checks its saved ID/reference, one completed payment, zero refunds and matching gross amount/currency. Hosted checkout uses a signed browser form with minute lifetime, QR uses seconds, and link expiry uses epoch seconds. Existing scaffolds now record orders before initiation. Public COF guidance no longer recommends logging token-bearing raw callbacks. An administrative curl example reads its token from an environment variable.

## Fresh checks

| Check | Result / limits |
|---|---|
| SDK build | PASS: ESM, CJS, declarations and CLI. Existing CJS import.meta warning in MCP remains |
| Typecheck | PASS |
| Lint | PASS, two pre-existing unused-import warnings in journal code/tests; new recipe lint clean |
| Full offline suite with coverage | PASS: 2,228 tests across 156 files; 14 opt-in sandbox tests / one file skipped. Two workers, 30s test ceiling |
| Coverage | 83.30% statements, 76.42% branches, 88.42% functions, 84.20% lines; exceeds configured floors |
| Integration behavior suite | PASS: 21 cases, including malformed/signature/identity/amount/currency rejection, pending/declined/refunded/pre-auth, unknown create, missing delivery, restart and concurrent one-job acceptance |
| Hosted form submission | PASS: actual SDK form parsed as DOM, URL-encoded POST to synthetic local provider; correct fields, signature shape and minute units. This is a simulated form transport test |
| Five-target installer and manual copy | PASS: standalone and full catalog for Claude/Codex/OpenCode/Cursor/Copilot, doctor/removal, edit preservation, repeated/partial upgrades, unowned resources; folder-copy local references/provenance |
| Skill creator validation | PASS: frontmatter/name/description |
| Knowledge freshness / mirrors | PASS: generated source/output hashes and recursive mirror parity |
| Package navigation/boundary | PASS: all allowlisted links/anchors, 191 files, 35 skills |
| Repository boundary | PASS after staging new paths, 11 entry documents; not a history/rights clearance |
| Public docs boundary | PASS: current 239 generated files and isolated fresh 269-file TypeDoc output. Generation succeeds with 118 existing completeness/link warnings; R07 remains an owner-reviewed publication dependency |
| Packed consumer smoke | PASS: ESM/CJS/types, CLI/demo/knowledge navigation, starter behavior, all five installed recipe assets compile; six Express HTTP/Next handler routes execute with synthetic providers; installer health and ownership preservation |
| Real Next.js | PASS: Next 16.3.8 production build and HTTP QR/hosted/link, authorization, invalid signature, unsigned hint, pending inquiry and unique fulfillment. Node 24.21.0; documented local-import adaptation applied |
| Codex trials | PASS: two fresh synthetic consumer integrations and final candidate follow-up, plus diagnostic and extra rejection review; see AGENT-TRIALS.md |
| Claude trials | DEFERRED by user after regular Claude returned invalid OAuth token. No behavior pass claimed |
| Secret allowlist negative controls | PASS: exact approved fixtures excluded; six wrong-value/wrong-path controls detected |
| Exact extracted tarball secret scan | PASS: zero findings with checksum-verified Gitleaks 8.30.1; no blanket new allowlist |
| Git whitespace | PASS for staged changes |

Gitleaks binary was downloaded from the [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) and checked against its published SHA-256 list, without modifying global installation or scanner configuration. An initial package scan flagged three copies of literal YOUR_ADMIN_TOKEN documentation, not exposed credentials; source now uses a runtime environment variable, regeneration and exact-artifact scan pass. Raw logs/reports remain ignored local evidence.

One early SDK harness test used an unsupported fetch override and unintentionally sent a synthetic-credential create request to sandbox; PayWay rejected invalid merchant data and no successful payment was created. The harness was corrected to intercept global fetch with an explicit loopback base URL. Final provider tests are synthetic/offline. No fresh successful gateway-paid cycle or production behavior is claimed.

## Remaining release work

Issue 05: resume the required Claude trial when the user restores regular authentication. Issue 06 maps the existing publishing audit dependencies: owner destination/identity/version/security contact/redistribution/history decisions; dependency advisory disposition; hosted Linux/Windows and supported Node matrix; public generated-doc review; receiver/MCP/helper and Postman scope gates; current-profile paid sandbox acceptance where required.

Keep the private development history. Public distribution uses the owner's curated tree with fresh history. Review the candidate and outstanding evidence before requesting publication approval. No push, tag, publication or credential operation is authorized by this preparation.
