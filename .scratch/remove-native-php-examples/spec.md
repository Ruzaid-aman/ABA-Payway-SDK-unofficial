# Remove native and PHP example implementations

Owner request: remove Android, iOS and PHP examples from the repository (2026-10-03).

Remove `sdk/android/`, `sdk/ios/`, Android/iOS documentation example files, both PHP checkout folders, PHP copies in the payment-link tester and backend documentation, and duplicate implementation blocks in the public guides. Keep the TypeScript/JavaScript SDK, CLI, skills, examples and platform integration guidance. Historical audit evidence and Git history remain intact.

Update active references and release-scope decisions. Regenerate canonical guide mirrors, knowledge, packaged docs and skill resources with the existing generators. Preserve concurrent checkout-UI edits. The owner authorized a local commit in the follow-up request on 2026-10-03; pushing remains outside this task.

Acceptance: no tracked PHP implementation or active native example project remains; current documentation links resolve; guide/corpus/skill mirrors are fresh; affected documentation, package, repository and packed-consumer checks pass. Ignore-only IDE/dependency remnants are preserved outside the retired example directory.
