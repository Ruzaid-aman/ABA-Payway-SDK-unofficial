# Open-source release readiness

Status: preparation in progress; publication is blocked.

Latest local check: audit closure integrated into local `main` from `codex/audit-closure`, based on `main@64843d0` (2026-09-08). The seven remaining audit findings pass their acceptance tests; [the closure record](../audit-results/merged-remediation-review-2026-09-08/CLOSURE.md) records the evidence. No push, tag, npm publication, credential rotation, or history rewrite has been performed in this closure pass.

## Implemented preparation

- Runtime metadata and guides require Node 22.12+. CI targets Linux/Windows with 22.12.0, 22.x, and 24.x, including packed consumers and reference-app startup.
- A repository boundary check exists, but the previously reported tracked-tree cleanup is absent from the reviewed main baseline. The current check rejects 275 tracked generated/captured artifact paths. Resolve their tracking while preserving local material before release.
- README is shortened; detailed content remains in the SDK/CLI reference. Contributor build order, conditional sandbox checks, compatibility limits, support, and security reporting are documented.
- Current handoff is authoritative; historical status notes are explicitly superseded. Development links no longer point at nonexistent v1.5.0 tags.

## Publication blockers

The current repository boundary check fails on 275 paths already tracked at `64843d0`: 225 under `payway-boilerplate`, 36 under `test-logs`, 13 under `test-output`, and one under `webhook_data`. Audit closure leaves those artifacts unchanged. Earlier successful cleanup evidence below is historical and does not describe this merged tree.

1. Static history triage is recorded in [the redacted register and decision proposal](HISTORY-SECRET-TRIAGE.md): 56 occurrences across 24 distinct values and 217 commits; 20 synthetic occurrences are precisely excluded, leaving 36 occurrences across 19 values. Owner/provider dispositions, any required revocation/invalidation, and an approved history decision remain outstanding. The earlier single-value conclusion compared redaction markers and is withdrawn. Deleting current files does not remove history.
2. Tracked third-party boilerplate, archived source documents, local scratch/audit notes, and vendor correspondence need a redistribution/identity review. The project's MIT license alone does not establish permission for these materials. Keep detailed scan reports local.
3. Repository destination, package ownership, monitored security mailbox, hosted CI, and external documentation URLs require maintainer verification. Local tests cannot prove remote CI or operational ownership.
4. Select a new major release version for the Node support change, then align metadata/changelog/tag links and rerun gates on that exact candidate. Version remains at the unpublished 1.5.0 baseline for now.
5. `npm audit --omit=dev` is clean. The full development-tool audit reports 22 transitive advisories through Redocly and related documentation/test tooling. Review and intentionally upgrade that toolchain before enabling a zero-advisory contributor gate; do not use an unreviewed major-version audit fix during release preparation.

## Verification

Historical polish checks (2026-09-07, Windows / Node 22.14.0): build, root and
reference-app typechecks, lint, package/docs/repository boundaries, packed-package
smoke (61 files / 32 skills), reference-app setup and credential-free smoke passed.
The targeted `npm test -- <file>` command now runs only that selection; default
tests exclude the live sandbox suite. The example rejects overlapping pending
attempts and its HTTP tests cover lost responses, callback replay and recovery.
The current-source snapshot scan is clean with rule/file/value-specific exclusions;
six negative controls prove different values and wrong paths still trigger findings.
The final history scan retains 36 findings and correctly fails the publication gate.
The final offline coverage run passed all 1,511 tests in 97 files: statements
79.97%, branches 74.51%, functions 85.73%, lines 80.79%. The declaration-import
contract check has a 30-second per-test limit for coverage overhead on Windows.

Earlier clean-install evidence (predates this follow-up; not a fresh install of
the final release candidate):

- Clean source snapshot: `npm ci`, build, typecheck, lint, full test suite, packed-package smoke, reference-app setup/typecheck/smoke all passed on Windows with Node 22.14.0. The suite reported 1,484 passing tests and 13 intentional sandbox-only skips.
- Package and documentation boundary checks passed; production dependency audit reported zero vulnerabilities. The SQLite driver is now an explicit optional-backend CI check so a normal contributor install does not need native build tools.
- The clean current-source snapshot passes the configured secret scan. The scan extends Gitleaks defaults and excludes only documented synthetic test canaries and one literal `YOUR_ADMIN_TOKEN` documentation placeholder.
- The first parallel clean-snapshot run failed because reference-app setup performed a clean build while CLI tests were reading `dist`. Sequential verification passed; the checklist records the workspace-isolation rule.

See [the release checklist](RELEASE_CHECKLIST.md) for commands and external gates. Credentialed gateway tests are not part of this polish task.
