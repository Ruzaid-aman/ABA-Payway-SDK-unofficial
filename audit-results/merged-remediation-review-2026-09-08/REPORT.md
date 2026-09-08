# Review of the merged audit remediation

**Historical review snapshot.** The seven remaining findings below are repaired and verified on `codex/audit-closure`; see [the closure record](CLOSURE.md). This report and its observation-only probes retain the evidence from the reviewed baseline.

Date: 2026-09-08. Reviewed local `main` at `64843d049fc48699476637dba67e0482377c192d`.

## Verdict

**Do not mark the audit fully closed. Six of the eleven previous findings are closed for their original scope; five are partially resolved. Two additional concrete findings are recorded below.**

The implementation makes substantial progress: all eleven original narrow reproductions now produce the expected corrected behavior. The remaining problems occur in acceptance cases that those reproductions did not cover. Build, all **1,593 offline tests in 102 files**, typecheck, package checks, packed-consumer smoke, and all **32 skill validations** pass.

Reviewed commits: `71cb71c` (refund/callback/installer), `881c1b6` (offline artifacts), `672bd96` (parser/checkpoint/token examples), and `64843d0` (closure documentation), compared with the prior reviewed `b12e301`. Tracked files were clean and HEAD unchanged at review end. This review adds evidence and recommendations only; implementation files were not edited.

## Closure matrix

“Closed” below refers to the identified defect, not every possible enhancement to its subsystem.

| Finding | Assessment | Fresh evidence |
|---|---|---|
| R1 — refund currency mismatch | **Closed** | A KHR order requested as USD now returns `ambiguous` with `currencyMismatch`, without a usable balance. Current tests cover both directions, missing currency, and CLI hard stops. |
| R2 — approved customer callback dropped | **Closed** | The actual guide handler now reads `payment_status` and `original_*`; a supported approved fixture queues one job. Separate recovery defect N1 remains. |
| R3 — upgrade overwrites user edits | **Partial** | Managed edits survive repeated upgrades, but pre-existing files without a manifest entry are still overwritten without force. |
| R4 — partial install loses ownership | **Closed** | A+B followed by A-only preserves B on disk and in the versioned manifest. |
| R5 — refund machine output | **Partial** | Success and balance-preflight rejections use JSON correctly. Invalid inputs and refund API failures still emit human text. |
| R6 — legacy reconciliation checkpoint | **Closed in packaged skills** | The timestamp plus sibling seen-ID file migrates correctly and restart tests pass. The tracked `.zcode` mirror still has the defect: N2. |
| R7 — doctor approves stale installation | **Partial** | An unchanged old installation is correctly reported outdated against a changed package. Invalid YAML is still approved, and intentional partial installations are reported incomplete. |
| S1 — ownership-safe removal | **Partial** | Added unmanaged files survive removal. Edited managed files are still deleted by uninstall and by retirement during an ordinary upgrade; removed resources inside a retained skill are not pruned. |
| S2 — KHQR structure inspection | **Partial** | UTF-8 round trips and malformed tag-30 rejection work. Malformed nested tag 99 still returns `valid: true`, contrary to the new contract. |
| S3 — offline JSON ignores PNG | **Closed** | Explicit PNG output is created and included in `artifacts.qrPngPath`. Current tests cover write failure and `--no-save-image`. |
| S4 — wrong token-expiry argument | **Closed** | Executing the current guide's expiry statements with a frozen clock gives 90 days, rather than zero. |

The remaining contradictory offline-notification sentence identified under F07 was also corrected. The hosted-checkout distinction accepted in the prior review remains unchanged.

## Remaining acceptance failures

### R3 — P1: a missing ownership entry still permits silent overwrite

Location: [skills.ts:163](D:/Antigravity_google/SDK-prepration/src/cli/commands/skills.ts:163).

`installSkill()` checks for modifications only when `expected !== undefined`, then copies with `force: true`. In a fresh temporary destination, creating a customized `aba-payway-a/SKILL.md` without a manifest and running an ordinary install replaces the customization with packaged content. No `--force-skills` is supplied.

This affects pre-manifest installations, manually installed skills, and files whose entries were already lost by the previous R3 bug. Retaining entries on future upgrades does not protect those existing installations. The previous acceptance criteria explicitly included pre-existing unowned files.

**Correction:** classify an existing file with no trusted baseline as an unowned conflict. Preserve and report it unless force is explicit; safely adopt identical packaged bytes. Validate absent/corrupt/legacy manifests and previously lost entries, as well as repeated upgrades.

### R5 — P2: refund errors still violate `--json`

Locations: [cli.ts:1877](D:/Antigravity_google/SDK-prepration/src/cli.ts:1877), [cli.ts:1886](D:/Antigravity_google/SDK-prepration/src/cli.ts:1886), [cli.ts:2001](D:/Antigravity_google/SDK-prepration/src/cli.ts:2001).

With synthetic credentials and intercepted fetch, these observations are reproducible:

| Case | Exit | Stdout |
|---|---|---|
| `refund -t audit-refund -a 1 -c EUR -y --json` | 1 | Human currency error; invalid JSON |
| `refund -t audit-refund -a 0 -y --json` | 1 | Human amount error; invalid JSON |
| `refund -t audit-refund -a 1 --no-preflight -y --json`, mocked gateway rejection | 2 | Human rejection, PayWay code and next-step text; invalid JSON |

The API catch still calls `printApiError()` unconditionally. The current success and mismatch tests do not cover these branches.

**Correction:** use the shared validation/API envelopes for every refund failure path, including credentials, transaction ID, amount, currency and gateway errors. Assert `JSON.parse(stdout)` directly on both success and failure, and verify that local rejections make zero mutation requests.

### S1 — P2: deletion does not preserve modifications, and retirement is incomplete

Locations: [skills.ts:249](D:/Antigravity_google/SDK-prepration/src/cli/commands/skills.ts:249), [skills.ts:254](D:/Antigravity_google/SDK-prepration/src/cli/commands/skills.ts:254), [skills.ts:319](D:/Antigravity_google/SDK-prepration/src/cli/commands/skills.ts:319).

Three temporary-installation observations:

1. Install a guide, edit it, then uninstall: the edited guide is deleted without comparing its current hash to the baseline.
2. Install A+B, edit B, retire B from the package, then perform an ordinary full upgrade: the edited B guide is deleted.
3. Install `A/scripts/old.cjs`, rename it in the package to `new.cjs`, then upgrade: **both** remain installed and doctor reports healthy. The pruning loop skips all files in any still-shipping skill.

The first two cases lose customization; the third leaves obsolete executable resources in an installation that is advertised as refreshed. The earlier S1 correction explicitly covered modified files and removed resources in retained skills.

**Correction:** use a file-level diff against the current package. Remove unchanged retired owned files, preserve/report modified ones, retain unmanaged resources, and remove only empty directories. Apply the same policy to uninstall and upgrade retirement, with an explicit override if destructive removal is desired.

### R7 — P2: doctor still lacks schema and selection semantics

Locations: [skills.ts:402](D:/Antigravity_google/SDK-prepration/src/cli/commands/skills.ts:402), [skills.ts:433](D:/Antigravity_google/SDK-prepration/src/cli/commands/skills.ts:433).

An installed guide beginning with `name: [unterminated` and a nonempty description is reported healthy. The parser extracts keys with regex rather than parsing YAML, so an invalid document satisfies the check. This is a synthetic negative fixture; the real packaged 32 guides pass the proper skill-creator validator.

Separately, installing only A from a valid A+B package is reported unhealthy because doctor requires B. The manifest records files but not the intended selected set. This case was already requested in the earlier review's acceptance tests.

**Correction:** use real frontmatter parsing and required-field/type checks; record or accept the intended selection so deliberately omitted guides differ from deleted guides. Check referenced resources and report missing selected-workflow dependencies explicitly.

### S2 — P2: nested tag 99 is never parsed

Locations: [khqr-offline.ts:206](D:/Antigravity_google/SDK-prepration/src/khqr-offline.ts:206), [khqr-offline.ts:229](D:/Antigravity_google/SDK-prepration/src/khqr-offline.ts:229).

The new API comment explicitly promises malformed nested templates **30/62/99** return undefined, but the code parses only 30 and 62. Replacing tag 99 in the guide's valid portal-QR fixture with the incomplete nested value `0`, then recomputing CRC, still yields `valid: true` and `crcValid: true`.

**Correction:** validate tag 99's nested TLV before reporting structural validity, or narrow and rename the contract if inspection is intentionally incomplete. Add this negative fixture alongside the already-correct UTF-8 and tag-30 tests. This is a local structural-contract failure, not a claim about gateway acceptance or cryptographic authenticity.

## Additional findings

### N1 — P1: the callback example can permanently lose a fulfillment job

Location: [customer-qr/SKILL.md:42](D:/Antigravity_google/SDK-prepration/skills/aba-payway-customer-qr/SKILL.md:42).

The approved-callback field fix is correct. However, the example durably claims the transaction separately from enqueueing its fulfillment. A probe executes the real handler with a persistent seen set and a queue that fails on its first call. The claim survives; a subsequent delivery returns through the `fulfillments.has()` guard without retrying enqueue. Observed result: **one queue attempt, zero delivered jobs, transaction still claimed**.

This is a newly demonstrated failure of existing example logic, not a regression introduced by changing the callback field names. The linked webhook-production guide describes durable acceptance, but copying this quick start does not implement it.

**Correction:** commit the dedupe/acceptance record and an outbox job in one database transaction, then let a worker retry delivery idempotently. Alternatively expose an explicit recoverable claimed-but-not-enqueued state. Test enqueue failure, restart, duplicate delivery and concurrent recovery against the actual guide example; do not imply that an atomic claim alone provides exactly-once fulfillment.

### N2 — P2: the `.zcode` reconciliation mirror missed the migration fix

Location: [.zcode reconcile.cjs:133](D:/Antigravity_google/SDK-prepration/.zcode/skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs:133).

Comparing all 40 packaged skill files to their tracked `.zcode` counterparts finds one mismatch: `aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs`. The packaged script loads the legacy `already-emitted` ID; the mirror loads an empty set from the same files. Agents using that copy can replay previously emitted transactions even though R6 is fixed in the npm skill source.

**Correction:** synchronize this script and add recursive parity verification covering scripts as well as SKILL.md files. If the mirror is intentionally independent, document its separate maintenance and versioning policy instead of treating it as synchronized.

## Suggested next batch

1. **Protect stored work first:** close R3 and S1 with one consistent conflict/ownership policy; repair N1's durable acceptance example. Acceptance is the adverse multi-step reproductions above, not only a fresh install or successful callback.
2. **Finish CLI and validation contracts:** close R5, R7 and S2; synchronize N2. Each failure should have a focused executable regression test.
3. **Update completion documentation:** revise HANDOFF's “all fixed” statement only after those acceptance tests pass. The previous `probes.mts` records observations and does not assert them; process exit 0 is not evidence that all findings passed. Its old S4 expression also hardcoded the wrong call, so this review executes the current guide statements instead.
4. **Then improve skills and documentation:** expand packed-install workflow tests beyond the current ESM/CJS/help/demo smoke; reduce conditional material in long entrypoints into linked references; make mirror checks recursive. Current corpus: **16,420 whitespace-delimited words**, with **zero skill-local references directories**. This is an opportunity for selective extraction, not a mandate to split every short guide.
5. **Small documentation cleanup:** `generate-qr --help` still describes `--save-image` as “online mode only” despite tested offline support; `.agents/AGENTS.md` still says 31 guides. Correct these active instructions alongside the next focused documentation update.

F10's broader installed-workflow soak, F12 harness breadth, and context reduction remain enhancements beyond the repaired narrow regressions. Passing this review would not itself resolve the separate publication blockers recorded in HANDOFF/RELEASE-READINESS.

## Verification and evidence

| Fresh check | Result |
|---|---|
| Build | Passed; ESM/CJS/declarations rebuilt before CLI tests |
| `npm test` | 1,593 passed / 102 files; excludes live sandbox suite |
| Typecheck | Passed |
| Lint | Exit 0; one warning and one informational suggestion |
| Package boundary | Passed: 61 files, 32 skill guides, 567,541 packed bytes |
| Public-doc boundary | Passed: 198 generated files |
| Packed-package smoke | Passed: ESM, CJS, declarations, CLI demo, 32 skills |
| Invoked skill-creator validator | 32/32 passed |
| Recursive packaged/mirror comparison | One mismatched bundled script, recorded as N2 |
| Synthetic review probes | Original narrow cases corrected; additional failures captured in results.json |

Evidence: [probes.mts](D:/Antigravity_google/SDK-prepration/audit-results/merged-remediation-review-2026-09-08/probes.mts), [results.json](D:/Antigravity_google/SDK-prepration/audit-results/merged-remediation-review-2026-09-08/results.json).

Reproduce after `npm run build` with `npx tsx audit-results/merged-remediation-review-2026-09-08/probes.mts`. The script records observed results, including failures; it is not an assertion-based acceptance gate. It uses temporary skill installations, synthetic credentials, intercepted API responses and offline QR generation. Callback signature verification is deliberately stubbed to isolate fulfillment behavior. No live PayWay request or real refund was made. No remote merge, CI state, publication, or new gateway contract was verified.
