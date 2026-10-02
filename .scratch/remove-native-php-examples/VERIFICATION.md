# Native/PHP removal — verification, 2026-10-03

Base: `main` at `e7c7624`. Owner explicitly requested removal of Android, iOS and PHP examples. The working tree also contains concurrent checkout-UI edits; they are preserved and generated resources reflect the current canonical sources.

Commit preparation follows the separately committed checkout-UI work at `347df67`. Its requirements are preserved in the shortened mobile architecture chapter. The removal candidate has an isolated index and generated resources; the working checkout is not reset to construct it.

## Removed

103 tracked files under `sdk/android/`, `sdk/ios/`, `docs/examples/android/`, `docs/examples/ios/`, both `payway-boilerplate/PHP Sample Checkout*` folders, the two backend PHP receivers and three PHP copies in the payment-link tester. `git ls-files` confirms no PHP files or files under the removed native projects/example directories remain.

Duplicate native implementation blocks in Chapter 4 are replaced by mobile/backend architecture and integration checklists. The PHP webhook block is removed from Chapter 14. Mobile, WebView and deep-link guidance remains; active links to removed files and platform-support claims were corrected. Owner scope is recorded in `docs/project/RELEASE-READINESS.md` and the current audit remediation register. Active comparison pages reflect the reduced scope; historical audit reports, archived native design material, scratch research and private Git history are retained. The historical Android synthetic secret allowlist and its negative control remain necessary for private history scans.

Ignored `.idea` and `node_modules` remnants from the old PHP folder are preserved at `.release-audit/remove-native-php-examples-2026-10-03/PHP-Sample-Checkout-local/`; no untracked local source was discarded.

## Fresh checks

| Check | Result |
|---|---|
| docs-examples, docs-acceptance-bar, knowledge, guide-stubs, skills, integration-skill | PASS: 96 tests / six files |
| Canonical guide and knowledge generators | PASS: 22 compatibility guides, 42 topics; generated docs and recursive integration skill mirror refreshed |
| Package boundary and Node navigation tests | PASS: 210 files / 35 skills; two navigation tests |
| Repository boundary | PASS: 1,735 tracked paths / 11 entry documents |
| Public API docs boundary | PASS: 239 files |
| Packed consumer / installed recipes | PASS: ESM/CJS/types/CLI/docs/starter; all five skill installer targets and ownership checks; six simulated Express/Next route cases |
| Root lint | PASS with existing two warnings and six informational suggestions |
| Payment-link tester TypeScript | PASS: `npx tsc --noEmit --project payway-boilerplate/payment_link_api/tsconfig.json` |
| Secret allowlist controls | PASS: six wrong-value/wrong-path controls detected |
| Working and staged whitespace checks | PASS |

An active-guide/corpus/skill sweep found no links to retired native/PHP example files or the removed PHP appendix section. Logs are retained under `.release-audit/remove-native-php-examples-2026-10-03/`. This was an affected-check run; the earlier full-suite/live-sandbox evidence is separate. The owner subsequently authorized a local commit. Commit preparation isolates the removal sources and regenerates their resources independently, preserving concurrent checkout-UI edits. No gateway calls, history rewrite, push, tag or publication is included.

## Commit candidate validation

The isolated candidate on `347df67` passes a fresh SDK build, post-build typecheck, lint, all 96 affected tests/six files, package boundary (210 files/35 skills), repository boundary (1,740 paths/11 entry documents), and packed-consumer/installed-recipe smoke. Generated resources match the staged sources and retain the separately committed default checkout UI requirements. Evidence is under `.release-audit/native-php-commit-2026-10-03/`.

The initial typecheck ran before declaration generation completed; its post-build rerun passes. The initial exported-tree consumer check lacked the script's explicit local TypeScript compiler path; pointing that candidate path at the existing compiler fixes the environment prerequisite and the rerun passes. The nested export's Git work-tree identity was set explicitly for the repository check so all 1,740 staged paths were actually inspected. These adjustments did not change payment implementation code or hide a failing test.
