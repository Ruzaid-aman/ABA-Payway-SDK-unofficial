# Independent verification: remediation items 1 and 2

Reviewed 1 October 2026, `main` at `50df5f368fae95b8bd960ac9df7b0fc1e6a651b6`, including the existing HANDOFF and Postman-manifest working-tree edits. This review made no implementation or collection changes. Scope: acceptance criteria in REPORT.md section 11 and the fixes claimed in REMEDIATION-STATUS.md.

## Decision

**Item 1: partially resolved.** R03/D01 is confirmed fixed in the actual packed artifact. Postman's current export passes its new distribution policy, but that guard does not fully enforce its claimed credential/content boundary. Public credential redistribution and repository/history/native-scope decisions remain explicitly open.

**Item 2: R01/R02 confirmed fixed.** Repository validation and official packed-consumer smoke now pass. npm report-shape tests pass. However, the current generated knowledge is stale for QUICKSTART.md, so the current candidate does not have an entirely green validation set. Treat this as a remaining freshness failure rather than a recurrence of the original path/parser bugs.

## Fresh evidence

Windows, Node v24.21.0, npm 12.0.2. Build ran before package checks and smoke. Evidence logs: `.scratch/publishing-dx-review-2026-10-01/`.

| Check | Result |
|---|---|
| `npm run build` | Exit 0 |
| `npm run check:repository` | Exit 0; 1,614 tracked paths, 11 entry documents |
| `npm run check:package` | Exit 0; 127 files, 34 Skills, 942,336 packed bytes |
| `npm run smoke:package` | Exit 0; installed ESM/CJS/types, CLI demo, 34 Skills, install/doctor/upgrade/remove preservation |
| Focused pack-report, knowledge and package-boundary suites | 16 passed, one failed across three files |
| Failing focused test | Knowledge source freshness: QUICKSTART.md hash differs from the manifest |
| `npm pack --json --ignore-scripts`, followed by actual archive listing | Exit 0; public `knowledge/close-transaction.md` present; retired dossier and direct internal paths absent |
| Extracted public guide inspection | No raw dossier filename |
| Knowledge manifest inspection | Zero topics sourced directly from `docs/internal/`; QUICKSTART source hash mismatch independently confirmed |
| Postman `npm run test:yaml` | Exit 0 |
| Postman `node export_json.js --check` | Exit 0; 46 requests, 49 examples, 125 variables; callback/return receiver placeholders applied |
| Postman `node verify_index.js` | Exit 0 |

No fresh full-suite claim is made by this focused review. Existing remediation evidence reports 2,129 passing tests, but today's freshness failure prevents carrying that forward as a confirmed current result.

## Item 1: what is fixed

The curated source now uses `docs/guides/23-close-transaction.md`, and the raw internal knowledge topic is deleted. The generator has a source-provenance gate; the knowledge test inspects manifest provenance; package validation rejects the retired topic/dossier filename. The actual tarball inspection confirms the public guide is shipped and the old dossier is absent. R03/D01 can be closed for the reviewed artifact.

The Postman exporter applies `applyDistributionPolicy` on generation and freshness checks. Runtime-capture variables must be empty; selected receiver variables are replaced by placeholders; known workspace/cloud identifiers are blocked. Current export freshness and collection tests pass. These are real improvements.

## Item 1: what prevents full closure

### Distribution guard allows an unauthorized non-hex signing key

`payway-boilerplate/Postman Collection API Testing/_build/distribution-scan.js:143-145` only applies its secret allowlist when the value matches a 32-or-more-character hexadecimal pattern. It does not require the `secret_key` field itself to be empty, a supported placeholder, or the exact authorized demo value.

Safe in-memory reproduction: call `applyDistributionPolicy` with `variable: [{key: 'secret_key', value: 'synthetic-not-authorized-key'}]`. The guard accepts it. This proves the exact-identity boundary is incomplete; it does not establish that the current export contains this value or an unauthorized live key.

Required closure: enforce policy by credential field, independently of string shape. Test unapproved hexadecimal and non-hexadecimal keys, placeholders, empty fields and the explicitly authorized demo identity. Reject invalid distribution inputs with redacted diagnostics.

### Runtime tokens in saved examples are not covered

Variable checks at `distribution-scan.js:125-155` operate only on top-level collection variables. The whole-export scan at lines 160-165 searches known personal identifiers, rather than token/credential fields inside saved responses.

Safe in-memory reproduction: a collection with empty variables and a saved response containing a synthetic `pwt` value passes the policy. Real collection exports contain saved examples, so their content needs its own reviewed policy. This finding concerns guard coverage; no newly leaked real token was demonstrated.

Required closure: inspect/parse saved response bodies and relevant structured fields, replacing captured tokens and personal data with clearly synthetic fixtures or placeholders. Add negative controls for credentials/tokens in examples, descriptions and supported serialized bodies. A variable-only scan cannot establish the whole artifact's safety.

### Owner decisions remain pending

REMEDIATION-STATUS.md explicitly leaves authorization for public redistribution of the configured demo credential identity open, along with repository destination/history and native-SDK treatment. Those were part of item 1's original acceptance. The README's recorded local demo disposition does not itself complete those decisions.

Required closure: recorded redistribution authorization or a placeholder-only public artifact; approved repository/history/native scope and destination. No new permission request is needed to conduct this review, and no public release action was taken.

## Item 2: what is fixed and what remains

R01's obsolete paths are replaced with the canonical docs registry and missing inputs are collected as actionable failures. R02 uses shared npm output normalization, installed Skill count versus inventory, and a consumer npm environment compatible with npm 12. Fresh official checks and focused parser tests pass. Both original findings can be closed.

The knowledge freshness failure is deterministic: the current QUICKSTART source hash does not equal its `sourceSha256` in knowledge/MANIFEST.json. Review the source, regenerate with the canonical `npm run sync:knowledge`, inspect the output, and rerun knowledge/package/repository checks against those bytes before declaring the candidate wholly green. This review did not regenerate files because the user requested verification of the remediation.

## Next steps

1. Complete WP10 field-based and saved-example distribution checks with negative fixtures.
2. Review/regenerate the stale quickstart corpus and rerun the affected gates.
3. Record item 1's remaining publication-scope/credential decisions, or explicitly mark them as pending owner gates.
4. Continue ordered item 3 (safe first integration) and item 4 (MCP/machine contracts); do not reopen the confirmed R01/R02 fixes unnecessarily.
