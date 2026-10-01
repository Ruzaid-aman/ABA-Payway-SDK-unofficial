# Remediation status register — publishing-DX audit (2026-09-29)

Tracks the ordered remediation plan in [REPORT.md](REPORT.md) §11. This register is the
authoritative current status; the component reports retain historical findings for
traceability. Updated 2026-10-01 (remediation batch 1 = work packages 1 and 2, plus a
same-day second pass closing the independent review findings in
[ITEMS-1-2-REVIEW-2026-10-01.md](ITEMS-1-2-REVIEW-2026-10-01.md) — see "Second pass").

> **Independent review, 2026-10-01:** [Item 1/2 verification](ITEMS-1-2-REVIEW-2026-10-01.md) confirms R03/D01 and R01/R02 are fixed, with fresh repository/package/official smoke passes. Work package 1 remains partially open: distribution policy accepts an unauthorized non-hex `secret_key` and tokens inside saved examples in synthetic negative probes, and the recorded owner decisions remain pending. The focused current-tree suite also fails knowledge freshness for QUICKSTART.md (16 passed, one failed). The implementation/gate snapshot below is historical remediation evidence; use the independent review for current closure status.

## Second pass — review findings closed (2026-10-01, same day)

Addresses every actionable finding in [ITEMS-1-2-REVIEW-2026-10-01.md](ITEMS-1-2-REVIEW-2026-10-01.md). The review's verdict text above is retained verbatim for traceability; the entries below are the current status.

1. **"Distribution guard allows an unauthorized non-hex signing key" — CLOSED.**
   Enforcement is now BY FIELD, not by string shape: `secret_key`, `merchant_id`,
   `ctid`, `whitelist_payee`, `buyer_email`, `buyer_phone` must carry exactly the
   authorized demo value or be empty regardless of what the value looks like
   (`_build/distribution-scan.js` `DEMO_IDENTITY` field policy); `rsa_public_key`
   must be a public-key PEM or empty. The review's exact in-memory repro
   (`secret_key: 'synthetic-not-authorized-key'`) is a pinned negative control
   (`_build/distribution-scan.test.js`), alongside unapproved hex, empty fields,
   the authorized identity, and a non-demo `merchant_id`. Violation diagnostics are
   redacted (length + sha256 prefix; a test asserts the offending value never
   appears in the message).
2. **"Runtime tokens in saved examples are not covered" — CLOSED.**
   Saved response bodies are now parsed/redacted at export: captured credential
   values under credential JSON keys (`pwt`, `token`, `secret_key`, `api_key`,
   `password`, …) become clearly synthetic `REDACTED-<key>` placeholders. BOTH
   encodings are covered — plain JSON and escaped JSON-in-JSON (webhook.site pull
   captures embed the callback payload as an escaped string). Redaction is scoped
   to example bodies only; a negative control proves request-body `{{variable}}`
   templates (the CoF sample sender's `"pwt": "{{pwt}}"`) are never rewritten.
   Applied to the real artifact: the dist previously carried a captured-looking
   `pwt` in the CoF token-callback example AND (escaped) in the webhook.site pull
   example — both now ship as `REDACTED-pwt`; zero occurrences of the original
   value remain in the distribution. Further whole-export coverage: the demo
   secret may appear exactly once (its variable slot — a paste into a
   description/example fails the build), private key material, personal receiver
   references and non-demo emails are rejected anywhere in the export. 16 negative
   controls run in the CI `test:yaml` chain (`_build/package.json`).
3. **"Knowledge freshness fails for QUICKSTART.md" — CLOSED.**
   Root cause: the QUICKSTART `--search` link correction landed after the last
   corpus sync, so `knowledge/quickstart.md`'s manifest hash was stale. Regenerated
   with `npm run sync:knowledge` and verified: the focused knowledge/package/
   pack-report suites now pass 17/17 (the review's 16 passed + 1 failed), and the
   full offline suite passes with the refreshed bytes (count below).
4. **"Owner decisions remain pending" — ACKNOWLEDGED as pending owner gates.**
   Recorded explicitly below; they block public publication, not further
   remediation batches.

## Work package 1 — Public payload and identity (R03/D01, WP10)

| Finding | Status | Fix and evidence |
|---|---|---|
| R03/D01 — internal sandbox dossier (`docs/internal/CLOSE-TRANSACTION-FINDINGS.md`) shipped as public knowledge topic `close-transaction-findings` | **FIXED** | Dossier removed from the curated corpus (`scripts/knowledge-sources.mjs`); replaced by the reviewed, evidence-free public guide `docs/guides/23-close-transaction.md` (topic `close-transaction`) carrying channel-dependent close semantics, the local-`closed`-flag policy and reconciliation guidance without transaction IDs, approval codes or escalation history. Corpus regenerated (`npm run sync:knowledge`, 31 topics). Provenance is now enforced at three levels: the generator refuses non-public source directories (`scripts/sync-knowledge.mjs` `assertPublicSources`), `src/__tests__/knowledge.test.ts` fails on an internal source in the written manifest (D01 acceptance: an intentionally introduced internal source fails the test before packaging), and `scripts/check-package-contents.mjs` forbids the retired topic filename and the dossier filename form in any packaged file. Public cross-references (SDK & CLI reference, QR guide, docs index, AGENTS pointers) now cite the public guide. |
| WP10 — shareable Postman export carries real configured values and personal workspace/cloud linkage, unscanned | **FIXED (mechanics); one owner check pending** | New reviewed distribution profile: `_build/distribution-scan.js` runs on EVERY `export_json.js` build and `--check` (CI-enforced). It (a) replaces maintainer-owned webhook.site receiver URLs in `return_url`/`callback_url` with an `example.com` placeholder, (b) ships runtime-capture variables (`pwt`, `webhook_token`, `callback_listener`, `tran_id`, merchant-auth ids, …) empty, (c) enforces the demo identity **by credential field** (`secret_key`, `merchant_id`, `ctid`, `whitelist_payee`, `buyer_email`, `buyer_phone` must carry exactly the authorized value or be empty — string shape is irrelevant; `rsa_public_key` must be a public PEM), (d) redacts captured credential values under credential JSON keys inside saved response bodies — plain and escaped JSON-in-JSON forms — to clearly synthetic `REDACTED-<key>` placeholders, (e) hard-fails on any other hex/high-entropy secret in variables, private key material anywhere, non-demo emails anywhere, personal webhook.site receiver references, maintainer workspace/cloud identifiers (`98cc8641…`, `a1451da9…`), or a second occurrence of the demo secret outside its variable slot, (f) reports violations with **redacted diagnostics** (length + sha256 prefix, never the value). Policy documented with the owner-recorded disposition in `postman/documents/README.md` ("Distribution credential policy"). Dist regenerated: SDK import OK, 46 requests / 49 examples / 125 variables unchanged; the CoF token-callback sample and the escaped webhook.site pull capture now ship `REDACTED-pwt` (zero occurrences of the original value); maintainer receiver id `6adc6e49…` absent. 16 negative controls in `_build/distribution-scan.test.js` run in the CI `test:yaml` chain — see "Second pass" above for the review-finding mapping. |

### Owner decisions still open from WP10/R05 (not agent-resolvable)

1. Confirm with ABA that redistribution of the sandbox demo identity (merchant `ec476910`
   + key) **beyond this repository** is authorized before any public npm/GitHub
   publication; otherwise switch the distribution to placeholders (the scan's allowlist
   is the single place to flip).
2. Decide repository destination/history scope and native-SDK treatment (REPORT.md §10)
   — unchanged, owner-controlled.

### Inspection evidence (exact artifacts, not source settings)

- Tarball (`npm pack --dry-run --json`, npm 12 shape): 127 files; **no**
  `close-transaction-findings` file; **no** `docs/internal/` path; no packaged file
  mentions the dossier filename; `knowledge/close-transaction.md` present; 31 knowledge
  topic files. Log: `.scratch/publishing-dx-remediation/tarball-inspection.json`
  (reproduce with `.scratch/publishing-dx-remediation/inspect-tarball.cjs`).
- Collection (`dist/PayWay API — Complete Collection.postman_collection.json`):
  `export_json.js` rebuild + `--check` green with the distribution policy applied
  (`return_url`/`callback_url` sanitized); `test:yaml`, `verify_index.js`,
  `verify_postman_import.js`, `syntaxcheck.js`, `validate.js`, `readme_path_audit.js`
  all green.

## Work package 2 — Reliable release gates (R01, R02)

| Finding | Status | Fix and evidence |
|---|---|---|
| R01 — `check:repository` ENOENT at obsolete pre-reorganization paths; gate cannot finish | **FIXED** | `scripts/check-repository.mjs` now validates the canonical registry (`docs/project/RELEASE_CHECKLIST.md`, `docs/project/RELEASE-READINESS.md`, `docs/project/HISTORY-SECRET-TRIAGE.md`, `docs/reference/SDK-AND-CLI-REFERENCE.md`, `docs/guides/FIRST-PAYMENT-WALKTHROUGH.md`, …); a missing entry document is collected as an actionable failure ("move it back or update the docs registry") and the check verifies ALL entry documents instead of dying on the first missing file. `payway-sdk docs <topic>` link destinations are validated against `knowledge/MANIFEST.json` instead of being treated as paths — which exposed and now blocks the D06 `--search` syntax; the one invalid QUICKSTART link was corrected to the supported `docs search` form. Acceptance proven: gate completes on the working tree; a deliberately broken link fails with source and target (`QUICKSTART.md: missing link target docs\guides\NOPE.md`); a temporarily missing entry document fails with the actionable message. |
| R02 — `smoke:package` reads npm pack output as an array (npm 12 object → undefined `.filename`); stale hardcoded 32-Skill pin | **FIXED** | Shared normalizer `scripts/lib/pack-report.mjs` handles npm ≤11 (array), npm 12 (object keyed by package name) and bare-report shapes; both `smoke-packed-package.mjs` and `check-package-contents.mjs` consume it. Output-shape contract pinned by `src/__tests__/pack-report.test.ts` (7 tests incl. empty/garbage/reject cases). Skill count is now compared against the repo's own `skills/` inventory instead of a hardcoded number (also applied in `check-package-contents.mjs` and the `llms.txt` generator, killing the 32-vs-34 contradiction at its source). Additional npm 12 failure surfaced and fixed during verification: `npm run` exports the maintainer's `allow-scripts` config as `npm_config_*` env and npm 12 rejects env-sourced allowScripts on project-scoped installs — the consumer install now runs with the inherited `npm_config_*` layer stripped (clean consumer resolves npm config from files). Acceptance proven: `npm run smoke:package` PASSES end-to-end on npm 12.0.2 (ESM/CJS/declarations/CLI demo, 34 skills from inventory, install/doctor/upgrade/remove preservation). |

### No stale count pins (WP2 acceptance)

- `yaml_collection.test.js` 125/46, `check-package-contents.mjs` and
  `smoke-packed-package.mjs` skill counts → repo inventory, `llms.txt` skill count →
  generated from the skills directory. Remaining hardcoded pins (topic minimums,
  tool catalogs) are semantic minimums, not inventory counts.

## Concurrent-wave note

The uncommitted Postman maintenance files observed by the audit (2026-09-29/30) are the
WP04 count-alignment/export wave (`yaml_collection.test.js` 122→125 / 45→46,
`examples.json` request-path rename, index/report/docs updates). HEAD's CI postman job
is red without them; they are folded into the Postman remediation commit. One
in-progress edit from that wave — `url: ""` in `11 - Polling & Lifecycle Flows
(Runner)/Flow B - README- run the flows.request.yaml` — broke every `_build` gate (the
loader requires a non-empty URL and no exporter/import support exists for empty URLs);
it was restored to the committed `url: https://developer.payway.com.kh/` value. If that
edit was intentional, the loader, exporter and import-verification need a README-style
request design first. `.postman/resources.yaml` gained Postman-app noise
(`specs: []`, written by the desktop app) — left uncommitted.

## Gate snapshot at register time (Windows, Node v24.21.0, npm 12.0.2)

| Gate | Result |
|---|---|
| `npm run check:repository` | PASS (1614 tracked paths, 11 entry documents — review re-run + second pass) |
| `npm run check:package` | PASS (127 files, 34 skills from inventory) |
| `npm run smoke:package` | PASS (npm 12 shape, 34 skills, consumer preservation — review re-run exit 0) |
| `npm test -- --maxWorkers=2` | PASS: 2,129 tests / 148 files, 0 failed (2026-10-01, after the second-pass corpus refresh) |
| Focused knowledge + package-boundary + pack-report suites | PASS 17/17 (review round had 16 passed + 1 failed; QUICKSTART staleness regenerated) |
| `npm run sync:knowledge` + knowledge tests | PASS (31 topics, provenance gates green) |
| `npm run lint` | exit 0 (2 pre-existing warnings in journal files) |
| Postman `test:yaml` (incl. the 16 distribution-scan negative controls) / `export_json --check` / `verify_index` / `verify_postman_import` / `syntaxcheck` / `validate` / `readme_path_audit` | PASS |

## Next in the ordered plan (not started)

Work package 3 (S01/S02/WP01 — safe first integration), then 4 (MCP S03/S04/S05/S09).
