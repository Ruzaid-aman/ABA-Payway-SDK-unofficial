# Review of the in-progress skills audit implementation

Status: current working-tree review, not final approval. The implementing agent is still working. No implementation files were edited by this review.

The implementation addresses substantial parts of the audit: 32/32 skills now pass the invoked skill-creator validator; mutation endpoints have a single-submit default; token example IDs, offline notification guidance, OpenCode paths, and several stale instructions have been corrected. Seven focused test files pass (151 tests). The following defects remain in the inspected implementation despite those tests.

## R1 — P1: refund balance is labeled with an unchecked request currency

Location: `src/utils.ts:495` and `src/utils.ts:518` (`computeRefundableBalance`).

The helper subtracts merchant amounts but never verifies that `requestCurrency` equals `original_currency`. A fixture with `original_amount: 4000`, `original_currency: 'KHR'`, payer debit `1 USD`, and request currency `USD` returns `{status: 'ok', requestCurrency: 'USD', remaining: 4000}`. The CLI compares the requested USD refund against that KHR number. Missing currency also does not prevent an ok result. The declared ambiguous result is not used by the inspected implementation.

Fix: return unavailable/ambiguous on missing or mismatched order currency before computing a request-currency balance; make the CLI explicitly resolve that condition rather than treating it as a validated balance. Add both mismatch directions and missing-currency cases. Confirm refund-total currency semantics separately; this test proves a unit mismatch without making a claim about gateway over-refunding.

## R2 — P1: customer callback example ignores approved callbacks from the supplied fixture

Location: `skills/aba-payway-customer-qr/SKILL.md:26`–33.

The new handler destructures `status`, `amount`, and `currency`, then requires `status === 'APPROVED'`. The project's `mock-callback.cjs` supplies `payment_status`, `original_amount`/`original_currency`, and `payment_amount`/`payment_currency` instead. Transpiling and executing the actual handler with that approved fixture and successful signature verification returned HTTP 200 with zero fulfillment jobs. This is an internally reproducible contract mismatch; live provider behavior was not reprobed.

Fix: normalize the documented customer-QR route fields and validated transaction identity before applying the guards; test the actual guide handler against signed approved/pending fixtures. Also make the durable claim and enqueue one atomic operation (or use a transactional outbox): a standalone claim followed by an enqueue can lose fulfillment after a crash.

## R3 — P1: user edits survive only the first skill upgrade

Location: `src/cli/commands/skills.ts:123`–125, 168, 211.

A conflicting file is skipped without retaining its old manifest entry. The installer writes a new manifest containing only copied files. On the second ordinary upgrade, that file is no longer recognized as managed and is force-copied over the user edit. Temporary-directory reproduction: first upgrade retained `USER CUSTOMIZATION`; the second replaced it with packaged content without `--force-skills`.

Fix: retain baseline ownership/hash entries for conflicts and preserve unrelated entries. Do not overwrite an existing unowned file implicitly. Add a two-consecutive-upgrades test; the current test uses force on its second upgrade and therefore misses the regression.

## R4 — P2: partial installations discard ownership of other installed skills

Location: `src/cli/commands/skills.ts:168` and 211.

Install fixture skills A+B, then run an A-only installation. The resulting manifest contains only A, though B remains on disk. B's future edits lose protection and removal no longer owns it. Reproduced in a temporary destination.

Fix: merge partial-install results into the old manifest, removing entries only through explicit ownership-aware pruning. Test A+B → A-only → edit B → upgrade → remove. Separately, `--only` currently selects exact folders rather than their linked skill dependencies; either install dependency closure or document/report missing dependencies. Doctor also still requires the full catalog for a partial install.

## R5 — P2: refund JSON still includes human preflight output

Location: `src/cli.ts:1896`–1928.

The profile notice was moved correctly, but refund preflight still uses unconditional `console.log` for progress, explanations, and success. With `refund -y --json`, preflight now runs even when confirmation is skipped, placing prose before the JSON result. Error/early-return branches also lack a consistent JSON envelope. Moving one diagnostic does not establish the changelog's claim that machine stdout is exactly one JSON document.

Fix: send preflight diagnostics to stderr in machine mode and provide structured local-validation/failure results. Assert `JSON.parse(stdout)` for actual refund success and rejected-preflight paths rather than only checking that output contains expected strings.

## R6 — P2: reconciliation upgrade forgets previously emitted IDs

Location: `skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs:133`–143.

The old script stores the timestamp in `<name>.json` and seen IDs in `<name>.seen.json`. The new loader reads only the first file and defaults its absent `transaction_ids` to an empty array. A legacy fixture with one previously emitted ID loads with zero seen IDs. Because the new filter intentionally admits equal/older timestamps, rows from the old installation will be emitted again after upgrading.

Fix: migrate the legacy pair into the new checkpoint atomically before processing rows. Add an upgrade fixture. The new checkpoint rename makes the state file atomic, but CSV append plus checkpoint is still not a single transaction: a crash between them can duplicate output. Document at-least-once output or make the downstream sink idempotent; do not call the combined output/checkpoint exactly-once.

## R7 — P2: doctor accepts an obsolete installed version as healthy

Location: `src/cli/commands/skills.ts:doctorSkills`, managed-file drift loop.

Doctor compares installed bytes to the installation manifest but never compares them to the current package. Install an old guide, change its packaged source, run doctor: it returns true and prints all healthy. Reproduced with a one-skill temporary package. The schema check is also only `startsWith('---')`, not frontmatter parsing.

Fix: distinguish locally modified from package-outdated by comparing installed, baseline, and packaged hashes. Parse required schema fields and check references/scripts. Test a package upgrade without missing files, malformed YAML, and a selected partial installation.

## Verification and scope

- `skills`, `skills-installer`, `refund-balance`, `mutation-retry-policy`, `skill-scripts`: 60 tests passed.
- `cli-mock-commands`, `docs-examples`: 91 tests passed.
- Skill-creator validator: 32 valid skills.
- Additional isolated reproductions: wrong refund currency; approved callback dropped; second upgrade overwrites user edit; partial install loses manifest entries; old seen IDs lost; stale installation reported healthy.
- No live PayWay operations. Direct CLI probe uses stubbed fetch and synthetic credentials. Installer reproductions use temporary directories, never actual user skill installations.
- No full build, full suite, coverage, public release checks, or production verification claimed. Source tests were used to avoid replacing shared build artifacts while the other agent is working.

The audit's progressive-disclosure work and broad consumer-package acceptance checks are not approved by this review; remaining work may still be underway. The hosted-route documentation was revised by the implementation to distinguish a deeplink URL case; that provider claim needs its own evidence review and was not marked invalid solely because it differs from the earlier audit.

Recommendation: fix R1–R3 before final approval, then close R4–R7 and run the complete agreed acceptance gates on a stable snapshot. This review should be supplied to the implementing agent as concrete follow-up, not treated as permission to overwrite its in-progress edits.
