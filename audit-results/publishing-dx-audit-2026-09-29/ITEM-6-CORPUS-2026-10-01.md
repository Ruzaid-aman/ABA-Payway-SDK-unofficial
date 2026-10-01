# Item 6 — One navigable public corpus

Date: 2026-10-01. Scope: REPORT.md ordered work package 6, D02–D07. Local implementation and offline consumer verification; no publication or gateway requests.

## Result

Corpus implementation is complete. D03–D07 are resolved locally. D02's missing topics and installed navigation are resolved; its operational acceptance still requires the release owner to confirm ownership and monitoring of `security@antigravity.dev`, as already recorded in SECURITY.md. Do not represent a successful offline read as proof of mailbox delivery. Existing repository/destination/publication decisions remain release-owner gates.

| Finding | Change and acceptance evidence |
|---|---|
| D02 | Curated SUPPORT.md, CONTRIBUTING.md, SECURITY.md as offline topics. Installed consumer reads all three successfully with meaningful content. Private channel and its unverified launch check remain explicit. |
| D03 | Replaced skeletal docs-packaged summaries with full generated public guides and route index. MCP anchor now resolves and its config covers an installed package. Generated starter contains only four transpiled app modules and the UI, from the existing first-payment app. Installed HTTP smoke exercises simulated creation, approval, status verification, and exactly one fulfillment across repeated polling. Simulated IDs are explicitly excluded from real gateway inquiries. |
| D04 | Replaced positive bare `npx payway-sdk` invocations in public guides with `npm exec -- payway-sdk`. Package gate rejects copyable bare invocations. Explanatory warnings about the wrong package remain. |
| D05 | llms.txt points to shipped knowledge files; Skill counts derive from inventory. The gate checks .txt navigation, and the clean installed consumer validates every Markdown/text local file and section target. 35 topics / 34 Skills. |
| D06 | QUICKSTART and generated knowledge use actual relative file links, preserving anchors. Commands remain code text. Package gate rejects command-as-link destinations and unsupported docs --search flags. Negative fixtures prove missing-file, dead-anchor and command-link failures. |
| D07 | Journal, agent, configuration, webhook-production and knowledge-base Skills updated with matching .zcode copies. CLI API recording defaults on; SDK defaults off; explicit opt-out, shared data root, journal override, doctor discovery and optional SQLite explained. Existing CLI policy, journal and data-root tests pass; installed doctor reports dataRoot. |

## Generation and payload boundary

`npm run sync:knowledge` is the single generator for knowledge, llms.txt, readable docs-packaged routes, and the bounded teaching starter. It selects only curated public docs; uncurated repository links are unwrapped rather than exported. Full reference material is retained. Old skeletal aliases and placeholder image payloads are removed.

The starter allowlist excludes .env, captured stores, vendor tarballs, lockfiles, and repository setup scripts. TypeScript is transpiled at generation time because Node refuses native type stripping under node_modules; installed users run `node node_modules/aba-payway-ts/docs-packaged/starter/app/main.js`. Source and output hashes for the starter and generated-file hashes for readable guides/index are freshness-tested.

## Verification

- Focused lifecycle/corpus/Skills/journal/data-root suite: 60 tests, six files passed. After final prose/config updates, knowledge and Skills rerun: 11 tests, two files passed.
- Navigation guard negative controls: two tests passed.
- `check:package`: passed, 143 files / 34 Skills; no dead local package files or Markdown anchors, including llms.txt.
- `check:repository`: passed, 1,629 tracked paths / 11 entry documents.
- `smoke:package`: passed with installed ESM/CJS/declarations, CLI demo, file/anchor navigation, support/reference/storage reads, docs search, doctor data root, starter HTTP lifecycle, and Skill install/doctor/upgrade/remove preservation.
- `typecheck`: passed.
- `lint`: failed on two assignment-expression violations in `src/__tests__/scaffold-templates.test.ts:97–98`, outside item 6 changes; also reports existing warnings. No claim of a green whole-repository lint gate.
- `git diff --check`: passed after normalizing generated trailing whitespace.

No full-suite or production/sandbox cycle is claimed for this documentation package. Overall shipping remains governed by REPORT.md and the outstanding release gates. Next ordered work package: 7, Postman callback and recipient journey.
