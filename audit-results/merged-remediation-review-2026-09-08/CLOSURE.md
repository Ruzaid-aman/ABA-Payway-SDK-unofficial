# Audit acceptance closure

Date: 2026-09-08. Base: `main@64843d049fc48699476637dba67e0482377c192d`.
Implementation: committed on `codex/audit-closure` and integrated into local `main` by fast-forward merge. No remote push or publication was performed.

All seven remaining findings in [the merged-work review](REPORT.md) are closed
for their identified acceptance cases. Together with the six previously closed
items, the review's thirteen findings are resolved. This does not clear the
separate publication blockers.

## Closure evidence

| Finding | Correction | Executable acceptance evidence |
|---|---|---|
| R3 — unowned edits overwritten | Missing ownership never authorizes overwrite. Identical files can be adopted; differing files remain untouched unless force is explicit. Managed conflicts retain their original baseline. | `src/__tests__/skills-ownership.test.ts`: absent, corrupt, legacy and lost-entry manifests; repeated upgrades, removal and reinstall. |
| R5 — incomplete refund JSON errors | Credential, required-option, currency, amount, transaction-ID and API failures use the shared JSON error envelope. Human usage errors remain concise. | `src/__tests__/cli-mock-commands.test.ts` and `cli.test.ts`: parsed stdout, validation exits, no mutation for rejected inputs, one request for an API rejection. |
| R7 — misleading skills doctor | Real YAML parsing checks syntax and required field types. The manifest records full/partial selection; doctor checks selected resources and linked dependencies against the current package. Legacy ownership infers a partial selection. | `skills-ownership.test.ts` and `skills-installer.test.ts`: malformed/duplicate YAML, folded descriptions, intentional partial installs, missing dependencies/resources, newly packaged skills and drift. |
| S1 — unsafe removal and incomplete pruning | Uninstall and retirement delete only unchanged owned files by default. Modified files and their baselines survive. Removed resources are pruned inside retained skills; empty directories are removed without recursive deletion. | Installer/ownership suites: managed edits, unmanaged files, retired guides/scripts, partial upgrades and nested directory cleanup. Packed-consumer lifecycle smoke also preserves edits through removal. |
| S2 — malformed nested tag 99 accepted | KHQR inspection parses tag 99 as nested TLV and rejects structural errors even when the outer CRC is correct. | `khqr-offline.test.ts`: malformed nested payload with a recomputed valid CRC. Existing UTF-8 and round-trip tests remain green. |
| N1 — accepted callback loses its fulfillment job | The customer-QR guide commits the unique payment claim and durable outbox job in one database transaction. A linked adapter contract and idempotent worker define retries and recovery. | `skill-outbox.test.ts` executes the actual guide using persistent SQLite: rollback, restart, duplicate delivery, delivery failure and acknowledgement failure. Existing handler guard tests also pass. |
| N2 — reconciliation mirror missing migration | The tracked `.zcode` reconciliation script now matches the packaged script. Recursive mirror assertions include guides, scripts and references. | `skills.test.ts` recursively checks byte equality; existing reconciliation restart/migration tests pass. |

Supporting changes: corrected offline PNG CLI help and the active 32-guide count;
added a direct runtime YAML dependency; expanded installed-package smoke to cover
install, doctor, reference inclusion, full/partial upgrades and removal. The
outbox adapter is application-owned, not a new SDK export.

## Verification

Local environment: Windows, Node 22.14.0. Built CLI artifacts were refreshed
before tests. The optional `better-sqlite3@13.0.3` CI driver was installed locally
without adding a required dependency.

| Check | Result |
|---|---|
| Build | Passed: ESM, CJS and declarations |
| Offline suite | **1,624 passed, 104 files; no skipped tests** |
| Typecheck and lint | Passed |
| Package boundary | Passed: 62 files, 32 skill guides |
| Public documentation boundary | Passed: 198 generated files |
| Packed-consumer smoke | Passed, including installed skill lifecycle and outbox reference |
| Invoked skill-creator validator | 32/32 passed |
| Repository boundary | **Failed on 275 paths already tracked in the base commit**, detailed below |

One earlier run under concurrent verification load timed out in the installer
suite. The isolated suite and subsequent full runs passed without increasing
timeouts. A final review caught and repaired a human-output regression from
refund's parser override; its new regression test is included in the final total.

The permanent tests assert the failures before the fixes and the repaired
behavior afterward. Historical `probes.mts` and `results.json` are observations
of the old baseline, not current closure assertions. Tests use temporary
installations, synthetic credentials and local mock HTTP servers. No live
PayWay request, refund, credential rotation or publication was performed.

## Remaining project work

`npm run check:repository` rejects 275 tracked paths that were already present
at `64843d0`: 225 under `payway-boilerplate`, 36 under `test-logs`, 13 under
`test-output` and one under `webhook_data`. None of these paths was changed by
this closure. The release-readiness claim that this tracked-tree cleanup had
already landed is corrected. Preserve local artifacts while resolving their
tracking separately; current-tree cleanup would not clear history findings.

The wider installed-workflow soak (F10), harness expansion (F12), and selective
shortening of long skill entrypoints remain enhancements. This pass adds
targeted coverage and one supporting reference; it does not claim complete
workflow coverage for every skill. Provider/owner and history decisions remain
in [release readiness](../../docs/RELEASE-READINESS.md).
