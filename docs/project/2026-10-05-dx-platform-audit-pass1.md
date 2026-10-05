# ABA PayWay Developer Toolkit — Deep Technical Audit & Improvement Specification

**Target:** `Ruzaid-aman/ABA-Payway-SDK-unofficial` @ `316a568` (single-commit public snapshot of `aba-payway-ts` v1.5.0)
**Audit date:** 2026-10-05 · **Mode:** read-only audit + specification. No repository file was created, modified, moved, or deleted. This report lives outside the repository.
**Method:** full static read of `src/` (37,944 non-test LOC), `src/__tests__` (162 files / 39,913 LOC), `docs/` (385 files), `skills/` (97), `knowledge/` (43), `payway-boilerplate/` (251), `.github`, packaging and CI config — **plus live reproduction**: `npm ci`, `npm run build`, `tsc --noEmit`, `biome lint`, `biome format`, the full `vitest` suite, `npm pack --dry-run`, and direct CLI/SDK invocations. Every load-bearing claim below carries a file/line reference or a captured command output.
**Authoritative external evidence:** ABA's official developer documentation was retrieved live on 2026-10-05 (`developer.payway.com.kh` — Ecommerce Checkout, Purchase, QR API index and parameter tables) and is cited as **OFFICIAL**. Everything else is classified per Appendix B as **REPO CHOICE**, **DX RECOMMENDATION**, or **UNVERIFIED**.

---

## 1. Executive Technical Assessment

### 1.1 What this repository actually is

The prompt's framing ("intended to become a high-quality developer toolkit") understates reality. This is **already** a large, unusually disciplined PayWay developer platform:

| Pillar | Status today | Evidence |
|---|---|---|
| Typed server-side SDK | **Strong** — 8 domain sub-clients, generated OpenAPI types, HMAC/RSA auth, retry+circuit-breaker+rate-limit transport, structured errors | `src/client.ts` (2,128 L), `src/domains/*` (8 files), `src/types.ts` (2,209 L, generated), `src/errors.ts`, `src/circuit-breaker.ts` |
| Terminal-first CLI | **Broad but unstructured** — ~86 commands, grouped help, exit-code contract, interactive TTY layer, shell completions | `src/cli.ts` (**5,636 L single file**), `src/cli/**` (34 files) |
| Executable knowledge base | **Best-in-class for the domain** — 42-topic offline corpus served by `docs list/<topic>/search`, generated `llms.txt`, 96-code error registry with per-code provenance | `src/knowledge/store.ts`, `knowledge/`, `llms.txt`, `docs/error-codes.json`, `src/cli/explain-code.ts` |
| AI-agent workspace | **Deep but fragmented** — 35 installable skills, MCP server (12 read-only / 17 mutating tools), an LLM agent with risk gating + execution ledger + privacy redaction, 2 competing `AGENTS.md` files | `skills/`, `src/mcp/*`, `src/agent/*` (30 files), `AGENTS.md`, `.agents/AGENTS.md` |
| Local webhook workbench | **Genuinely differentiated** — capture/verify/trigger/resend/forward, Cloudflare tunnel, JSON+SQLite stores | `src/webhook/*` (14 files), `src/cli/commands/{setup-webhook,webhook}.ts` |
| Transaction journal / reconciliation | **Rare and valuable** — JSONL/SQLite record of every exchange, `timeline/stats/reconcile/explain/anomalies` | `src/journal/*` (8 files), `src/cli/commands/journal.ts` |
| Reference app + simulator | **Excellent teaching artifact** — missed-callback, late-payment, decline, duplicate-delivery branches with zero credentials | `examples/first-payment/`, `src/cli/commands/demo.ts` |

Its **core payment-safety doctrine is correct and consistently enforced**: *creation ≠ approval; callbacks are single best-effort with no retry; there is no remote EXPIRED status; transaction IDs are not idempotency keys; mutations are single-attempt by transport policy.* Those are exactly the mistakes that cause real money incidents, and this repo encodes them in prose, code, tests, and skills. That is the single most valuable thing here.

### 1.2 The core audit answer

> **What is good, what is bad, and how should it change?**

**Good:** the *knowledge* layer and the *safety doctrine*. Provenance discipline is exceptional — nearly every non-obvious constant names its source and date (`SANDBOX-FINDINGS §24 LC-2`, `ABA-bot relay 2026-10-03`, `openapi-suite-coverage W2`), and `sandboxVerified` is a first-class field in the generated error registry. Test depth (2,378 tests, 130 s, hermetic env scrub, coverage floors ratcheted to 79/73/84/80) exceeds almost any payment SDK in the wild.

**Bad:** four systemic problems, in priority order.

1. **The published artifact violates the repository's own written release decision, and the release gates that would have caught it have never run.** `docs/project/RELEASE-READINESS.md` records an owner decision (2026-10-01) to "publish a fresh public history from a **curated tree**", names the material that must stay private (`audit-results/`, `docs/internal/SANDBOX-FINDINGS.md`, `docs/HISTORY-SECRET-TRIAGE.*`, `HANDOFF.md` internals, competitive analyses, `payway-openapi/` — *ABA's shared spec*, `docs/archive/`), and states "do not create, push, or tag the public repository until it is agreed." The public repo contains **all of it**, plus `.scratch/` (156 internal working files including verbatim captures of a third-party Telegram bot's answers) and `.zcode/` (132 files including third-party vendored skills). Simultaneously the same document records: *"Hosted CI — Workflows exist but have never run on a remote."* I reproduced two independent reasons CI **cannot** be green (§33): `tsc --noEmit` exits 2 on a clean clone because CI typechecks before building, and `npm test` fails on Linux because a Windows-shaped tunnel test spawns `fake-cloudflared.cmd` → `EACCES`. **The quality-gate story is therefore aspirational, not operational.**

2. **Provenance inversion in the rules layer.** The SDK's purchase enum is derived from a 2021-era archived spec copy (`docs/archive/Default module.openapi.json`) rather than today's official docs, so it *excludes* the officially documented `payment_option: abapay_khqr` and *includes* `abapay`/`abapay_deeplink`, which no current official page lists. Under `strictValidation: true` — the mode a careful integrator or an instructed agent would enable — the SDK **refuses to build a valid purchase**. Reproduced:
   ```
   strict purchase(abapay_khqr) THREW: PayWayConfigError | payment_option "abapay_khqr" is outside
   the documented purchase enum (cards, abapay, abapay_deeplink, abapay_khqr_deeplink, google_pay)
   ```
   The same class of defect appears in `generate-qr` `lifetime`, where the repo ships **seconds** (min 180, max 120 days) while OFFICIAL QR API docs specify **minutes** (required, min 3, max 30 days, default 30 days) — and the repo's own doc-comment contradicts its own constant name. The repo *knows* both conflicts (`AGENTS.md`: "CONFLICTS kept open") and shipped them as prose notes instead of resolving or hard-gating them.

3. **One machine contract is promised; six are implemented.** `--output json|ndjson` is documented as global (`llms.txt`, `docs/reference/SDK-AND-CLI-REFERENCE.md`, `AGENTS.md`) but registered on exactly **two** commands — reproduced: `check-transaction --output json` → `unknown option '--output'`. `config`, `validate`, and `profiles list` have **no** `--json` at all (reproduced). `schemaVersion` exists on 2 of ~86 commands. Success payloads are bare objects, bare arrays, or `{ok:…}` depending on the command. An agent cannot write one parser.

4. **Presentation is a monolith and safety is unevenly applied.** `src/cli.ts` is 5,636 lines holding ~70% presentation plumbing and real domain policy (poll backoff, batch pacing, payout money invariants, token-expiry policy, gateway-day derivation). The production-safety model that *does* exist — `src/agent/risk.ts`: `safe | sandbox | production | blocked`, `--yolo` explicitly insufficient for production — is wired **only** into the LLM agent. The plain CLI has no environment-conditional gate at all: `refund -y`, `payment-link void -y`, `close-transaction -y`, `payout`, and `beneficiary add` behave identically against `checkout.payway.com.kh`.

### 1.3 Recommendation posture

**Do not rewrite.** The SDK core, validation layer, knowledge pipeline, journal, and webhook workbench are assets that would take a year to rebuild. The correct programme is:

- **Phase 0 (days):** unpublish/curate the public tree per the owner's own decision; fix the two CI-breaking defects so gates actually run; correct the two provenance-inverted rules; remove TLS-bypass instructions from every copy-pasteable example.
- **Phase 1–2 (weeks):** one uniform machine-output contract + a versioned `doctor`/`env`/`request inspect`/`go-live check` surface; extract `src/cli.ts` into command modules along the seam the repo already proved (`src/cli/commands/agent.ts` + `agent-helpers.ts`).
- **Phase 3–4:** consolidate the five documentation mirrors into one generated fan-out; promote the rules layer from prose+constants into a single machine-readable `knowledge/rules/*` source consumed by SDK validation, CLI validation, tests, docs, and skills; rebuild the agent entrypoint as one authoritative `AGENTS.md` with a skill taxonomy organised by *job*, not by endpoint.

Measured against the four product objectives: **SDK 7.5/10 · CLI 5.5/10 · knowledge base 8.5/10 · agent workspace 6.5/10 · release/safety governance 3/10.** Weighted: **6.4/10**. The distance to "exceptional" is almost entirely *governance, contract uniformity, and rules provenance* — not payment logic.

---

## 2. Current Repository Architecture

### 2.1 Tracked-file census (1,590 files, excluding `node_modules`/`.git`)

| Area | Files | Nature | Verdict |
|---|---:|---|---|
| `src/` | 309 | SDK + CLI + agent + MCP + journal + webhook + 162 test files | Correct home; tests co-located in one flat `src/__tests__/` (162 files) |
| `docs/` | 385 | 22 numbered guides ×2 (canonical + generated mirror), 7 `integration-*` guides, 4 all-caps one-offs, `reference/`, `recipes/`, `diagrams/`, `internal/`, `project/`, `strategy/`, `archive/`, `test-cases/`, `superpowers/`, `agents/`, `examples/`, **`api/` = 239 generated TypeDoc HTML files** | Overloaded: public docs, private dossiers, strategy, and generated HTML in one tree |
| `payway-boilerplate/` | 251 | Postman workspace (source YAML + `_build` tooling + `dist` export + a 313 KB duplicate `Refrence-copy-…`), a Next.js 16 app, an Express POS app, KHQR HTML builders, `Goal.txt.txt`, `learnings/` | Junk drawer; two side apps with their own lockfiles and unrun tests |
| `.scratch/` | 156 | Internal plans, one-off patch scripts (`.py`, `.mjs`), probe scripts, audit dossiers, verbatim Telegram relay captures | Should not be public (§31, P0-01) |
| `.zcode/` | 132 | Agent session plans + a **full mirror of `skills/`** + third-party vendored skills (`agents-sdk`, `code-review`, `sandbox-sdk`, `setup-matt-pocock-skills` from `mattpocock/skills`) | Mirror + third-party material |
| `skills/` | 97 | 35 `aba-payway-*` SKILL.md + scripts/assets + `aba-payway-integration/references/` (42 generated copies of the knowledge corpus) | Good; references are generated duplicates |
| `audit-results/` | 49 | Historical internal audit dossiers + probe scripts + result JSON | Explicitly excluded by the owner's release decision |
| `knowledge/` | 43 | **Generated** corpus + `MANIFEST.json` (hash-gated) | Generated but committed (deliberate: ships in the tarball) |
| `docs-packaged/` | 42 | **Generated** package-facing copy of the same corpus + `starter/` | Generated but committed |
| `scripts/` | 53 | Gates (`check-*`), sync/generate, ~25 `sandbox-probe-*.ts` live probes | Mixed: gates vs one-off probes |
| `examples/` | 20 | `first-payment/` reference app, `integration-recipes/` | Excellent |
| `payway-openapi/` | 18 | Hand-authored multi-file OpenAPI 3.1 + `bundled.yaml` | Rights flagged as unresolved by the repo itself |
| `.github/` | 4 | 1 workflow (`ci.yml`), 2 issue templates, 1 PR template | No release workflow, no CODEOWNERS, no dependabot |
| Root | 21 | `AGENTS.md` (22 KB), `HANDOFF.md` (107 KB), `CHANGELOG.md` (123 KB), `QUICKSTART.md`, `README.md`, `llms.txt`, configs | Root is carrying maintainer state that belongs in `docs/project/` |

**~830 of 1,590 tracked files (52%) are generated, internal-process, mirrored, or third-party material.**

### 2.2 Runtime architecture (as-built)

```
                       src/index.ts  (~258 exports, single entrypoint)
                                 │
   ┌─────────────────────────────┼──────────────────────────────────────────┐
   │                             │                                          │
 PayWay (src/client.ts)     sdk facade (src/sdk.ts)              Server-side services
   │  resolveConfig()          │  initiate/handle/test            webhook/ (server, storage
   │  request()                │  runTestSuite()                    json+sqlite, forwarder,
   │  requestWithMerchantAuth()│                                    tunnel, fixtures,
   │  requestWithPartnerAuth() │  client-handler/ (browser-ish        token-store, callbacks:
   │  transport: retry,         handleResponse)                       khqr / customer / cof)
   │  mutation single-attempt,│  server/ (initiateTransaction,     journal/ (writer, digest,
   │  circuit breaker,          normalizePaywayResponse)            stats, reconcile,
   │  per-endpoint rate limit,│  test/ (mock PayWay HTTP server,     intelligence, sink-sqlite)
   │  correlation id (cid),     5 response-type harness)          storage/ (StorageService
   │  journal emitter, logger                                     facade over the 3 stores)
   │
   └── domains/: checkout · qr · khqr · payment-link · credentials-on-file
                 · pre-auth · payout · self-activation
       auth.ts (generateHmac, encryptMerchantAuth, verifyCallbackDetailed/Raw, signCallbackBody)
       utils.ts (26 validators/formatters) · constants.ts (endpoints, enums, error-code maps)
       errors.ts (9 classes) · schema.ts · domain-types.ts · payment-lifecycle.ts
       khqr-config.ts · khqr-offline.ts (EMVCo TLV + CRC-16/CCITT)

   src/cli.ts (5,636 L — ~34 inline command blocks)  ──┬── src/cli/commands/ (16 modules:
                                                       │    agent, completions, demo, docs,
   bin: payway-sdk → dist/cli.js                       │    doctor, init, journal, mcp,
                                                       │    onboard, session, setup-webhook,
   src/agent/ (30 files: provider, planning, risk,     │    skills, webhook + helpers)
     ledger, privacy, repl, sessions, tools,           └── src/cli/ui/ (theme, tables, prompts,
     onboarding, knowledge-digest, url-policy)              poll-display, banner, help, mode)
   src/mcp/ (server, tool-catalog, extras)
   src/config/ (profiles, envValidator, data-root, frameworkDetector, templates/)
```

**Observations that matter:**

- **Domain factories are the right pattern.** `createXDomain(config, request, baseUrl)` injects transport, so domains are pure and unit-testable without HTTP (`src/domains/*.ts`). This is the seam a CLI extraction should copy.
- **Two client surfaces overlap.** `PayWay` (class, domains) vs `sdk` (facade over `server/` + `client-handler/` + `test/`) both create purchases, with different param shapes (`CreateTransactionParams` vs `InitiateTransactionPayload`) and different return shapes (gateway envelope vs `TransactionSession`). `QUICKSTART.md` §6 uses both in one snippet. Nothing states which is canonical for which job.
- **Test/mock infrastructure is in the production entrypoint.** `src/index.ts` exports `startMockPaywayServer`, `getMockPaywayUrl`, `generateMockSession`, `runTestSuite`, `DEFAULT_TEST_CASES`, `formatTestReport`. A merchant bundling `aba-payway-ts` ships a mock gateway.
- **Configuration resolution is scattered.** `PayWay.resolveConfig()` reads 8 `PAYWAY_*` vars; `src/config/envValidator.ts` knows 20; `src/config/profiles.ts` adds 7 `PAYWAY_KHQR_*`; `src/cli/dotenv.ts` loads `.env`; `src/config/data-root.ts` resolves storage; `src/agent/config.ts` resolves provider config. There is no single config model or precedence implementation — precedence exists only as a sentence in `QUICKSTART.md` §3.

### 2.3 Packaging

| Property | Value | Note |
|---|---|---|
| name / version | `aba-payway-ts` / `1.5.0` | Unpublished; `RELEASE-READINESS.md` item E recommends **2.0.0** (Node 22.12 floor is breaking per `VERSIONING.md`) |
| bin | `payway-sdk` → `dist/cli.js` | Name ≠ package name; `payway-sdk` is squatted on npm by an unrelated package (verified in `RELEASE-READINESS.md`) → README must warn against bare `npx payway-sdk` |
| repository/bugs/homepage | `github.com/antigravity-google/aba-payway-ts` | **Does not match the actual public repo** (`Ruzaid-aman/ABA-Payway-SDK-unofficial`) |
| exports | `.` only, per-condition `types` (ESM `.d.ts` / CJS `.d.cts`) | Correct (the repo's own C1 defect is fixed); **no subpath exports** |
| engines | `node >=22.12.0` | CI matrix 22.12.0 / 22.x / 24.x × ubuntu / windows |
| runtime deps | `@clack/prompts`, `@modelcontextprotocol/sdk@1.30.0`, `ajv`, `commander`, `qrcode`, `yaml` | All six land in every merchant server install; MCP+QR+YAML are CLI/knowledge-only concerns |
| packed size | 1,307,933 B packed / 5,198,011 B unpacked / **210 files** | ~1.8 MB of the unpacked tarball is documentation shipped **three times** (`skills/aba-payway-integration/references` 718 KB + `docs-packaged` 654 KB + `knowledge` ≈400 KB) |
| build warning | `"import.meta" is not available with the "cjs" output format` at `src/mcp/server.ts:56` | `dist/cli.cjs` resolves `package.json` from `''` → latent CJS breakage, ungated |

---

## 3. What Is Already Good (preserve — do not redesign)

Each item names the artifact and the reason it is load-bearing.

1. **Payment-safety doctrine, encoded not just documented.** `MUTATION_ENDPOINTS` (`src/constants.ts:46`) makes side-effecting endpoints **single-attempt** at the transport layer, with the rationale inline: *"a lost response means an UNKNOWN outcome: transaction IDs are not a gateway idempotency key (sandbox accepts duplicate tran_ids silently, W5-7)"*. Reads keep bounded retries. This is the correct default and most SDKs get it wrong.
2. **Provenance-tagged knowledge.** `docs/error-codes.json` (96 codes) carries `sandboxVerified: boolean` + `evidence: "SANDBOX-FINDINGS §6/§9"` + `observedOn` + `observedMessage` from an ABA production telemetry CSV, and is **generated** from `src/cli/explain-code.ts` by `npm run gen:error-registry`. `payway-sdk explain PTL02 --json` returns exactly that record. This is the single best feature in the repo for both humans and agents.
3. **Callback-verification honesty.** The repo refuses to pretend one verifier fits all routes: online checkout = sorted-key HMAC-SHA512 over the parsed body (`verifyCallbackDetailed`, matching OFFICIAL Ecommerce Checkout guidance incl. `X-PAYWAY-HMAC-SHA512`); Customer Module = raw-body HMAC (`verifyCallbackSignatureRaw`); payment-link pushbacks and offline KHQR notifications = **unsigned by contract**, verify by status lookup. `signCallbackBody` is the exact inverse and lives beside the verifier so the canonicalization cannot drift (`src/auth.ts`). `verifyCallbackDetailed` returns a *reason* (`signature_mismatch | malformed_signature | empty_body`) instead of a bare boolean, and comparison is `timingSafeEqual`.
4. **Hash-order drift guards.** `GENERATE_QR_HASH_FIELDS` (19 fields) matches the OFFICIAL QR API concatenation order **exactly** — I diffed it field-by-field against `developer.payway.com.kh/qr-api-14530840e0`. `PURCHASE_HASH_FIELDS` (27) is a **hash-neutral superset** of the official 24: `ctid` is inserted after `items` and `token_flag`/`frequency` appended after `skip_success_page`, and because unset fields concatenate as `''`, a plain purchase produces a byte-identical HMAC to the official order. That is a genuinely clever, well-reasoned design (and `src/__tests__/cof-subscription-parity.test.ts` pins it). `src/__tests__/hash-order-hints.test.ts` pins the *hint text* against the *actually signed order* in both directions.
5. **A real local webhook workbench.** `setup-webhook` (capture + optional Cloudflare tunnel + `--forward-to` re-POST) and `webhook trigger|verify-callback|resend|list|status|stop` let a developer test receiver logic **without the ABA simulator and without spending sandbox quota**. `webhook trigger` signs with the same canonicalization as verification, and pushback/KHQR fixtures deliberately carry **no** hash because their real contracts have none. `WebhookForwarder` never rejects or loses the original callback when forwarding fails. This is Stripe-`listen`-class tooling.
6. **Transaction journal + reconciliation.** Every CLI API command is journaled **by default** to a single data root (`PAYWAY_DATA_DIR` / `<APPDATA|~/.config>/aba-payway-sdk/data`), with `timeline`, `stats`, `reconcile`, `explain` (RCA), `anomalies`, `prune`; digest mode allow-lists non-secret fields; `correlationId`/`traceId` join stdout ↔ journal ↔ SDK errors. `reconcileTransactions` carries an explicit honesty rule: *"a missing callback is NOT proof of non-payment."*
7. **The `examples/first-payment` reference app.** Two modes (simulated / real sandbox) with **identical** verification and fulfillment code, and teaching products that force every hard branch: `Approve Demo`, `Decline Demo`, `Late Payment Demo` (paid *after* close → `needs_resolution`, never automatic), `Missed Callback Demo` (approved with **no** callback → only the poll finds it). Every simulated artifact carries `simulated: true` and the UI shows a `SIMULATED` banner. This is the correct way to teach a payment lifecycle.
8. **Hermetic tests.** `src/test/vitest-hermetic-env.ts` deletes every ambient `PAYWAY_*` var per test file and pins `APPDATA` to a throwaway dir, so a developer's real credentials/profile can never hijack an assertion — and the CLI's default-on journal can never write to the developer's real profile during tests. Coverage floors are **ratcheted** in `vitest.config.ts` with the actual measured values recorded in a comment.
9. **Agent safety model (in `src/agent/`).** Closed tool registries (`READONLY_TOOLS`, `CREATE_TOOLS` in `src/agent/risk.ts`), out-of-scope tools `blocked`, capability readiness gating, `--yolo` authorises **sandbox only** and is explicitly *not* sufficient for production, an execution ledger with `recover`/`prune` that never deletes unfinished records, provider API keys read **only** from `PAYWAY_AGENT_API_KEY` and never stored, model-supplied callback URLs overridden by the merchant profile, and `agent sessions export` scrubbed of secrets.
10. **Generated-corpus freshness gates.** `src/__tests__/knowledge.test.ts` fails when `knowledge/` drifts from `docs/guides/` by comparing `sourceSha256` per topic; `scripts/sync-knowledge.mjs` also refuses at generation time to package any source outside public directories (`assertPublicSources`), so an internal dossier cannot leak into the tarball by accident; `guide-stubs.test.ts` gates the `docs/NN-*.md` mirrors; `skills.test.ts` gates the `.zcode/skills` parity; `distribution-scan.js` gates the Postman export **by field**, not by string shape, and redacts violations.
11. **Exit-code contract.** `0` success · `1` validation/input · `2` PayWay API rejection · `3` network/timeout/rate-limit · `130` Ctrl-C, implemented in one classifier (`src/cli.ts:204-256`, `classifyError`) and printed in `--help`. Poll timeouts on create commands exit `3` so machines can distinguish "unknown outcome" from "rejected".
12. **QUICKSTART.md is a real quickstart.** Six numbered steps, POSIX **and** PowerShell for every shell command, a pre-generated unique `tran_id` (so a re-run cannot collide), explicit "do not rerun the creation block to check progress", a symptom→action failure table, and the exit-code legend. It reaches a verified sandbox payment without reading `src/`.

---

## 4. Critical Weaknesses

Ranked by blast radius. Full finding records (17-field format per §31.1) are in §31.

| # | Weakness | Why it is critical | Reproduced? |
|---|---|---|---|
| W1 | **Public tree contradicts the repo's own release decision** (P0-01) | Publishes internal dossiers, an unresolved-rights copy of ABA's shared OpenAPI spec, official-doc archive copies containing captured auth payloads, verbatim third-party bot transcripts, and vendored third-party skills — under an MIT header that, per the repo's own checklist, "does not establish permission for third-party material" | File census vs `RELEASE-READINESS.md` items A/B |
| W2 | **CI cannot pass, and has never run** (P0-05) | Every "green gate" claim in the docs is unverified; regressions in typecheck, tests, packaging, or secret scanning reach `main` silently | `tsc --noEmit` → exit **2** (6× TS2307) pre-build, exit 0 post-build; `vitest` → **1 failed / 2353 passed** (`EACCES` on `fake-cloudflared.cmd`) |
| W3 | **Provenance inversion in the rules layer** (P0-02, P0-03) | The SDK rejects/warns against officially documented values and encodes a `lifetime` unit that contradicts official docs on the highest-traffic endpoint (QR). Wrong unit ⇒ a QR that lives 60× longer or shorter than intended; wrong enum ⇒ a blocked valid integration | `PayWayConfigError` on `abapay_khqr` under `strictValidation`; advisory fired inside the repo's **own passing test suite** |
| W4 | **TLS verification bypass is the canonical agent instruction** (P0-04) | `AGENTS.md` prefixes 19 copy-pasteable commands with `NODE_TLS_REJECT_UNAUTHORIZED='0'`. Agents transpose instructions into merchant code; disabling cert validation on a payment gateway is a MITM exposure. No `NODE_EXTRA_CA_CERTS` / `tlsCaFile` alternative is offered anywhere | 19 occurrences in `AGENTS.md`, plus 8 probe scripts and 9 docs |
| W5 | **No production safety gate in the CLI** (P1-01) | `refund -y`, `payment-link void -y` (documented *permanent, irreversible*), `close-transaction -y`, `payout`, `beneficiary add` are byte-identical against production. The risk model that would prevent this exists — but only in `src/agent/risk.ts` | `grep -n production src/cli.ts` → 3 hits, none a gate |
| W6 | **Six machine-output contracts, one documented** (P1-02) | Agents and CI cannot branch on a stable shape; `--output` is documented as global and rejected by most commands | 6 shapes captured; `config/validate/profiles list --json` → `unknown option` |
| W7 | **`src/cli.ts` monolith** (P1-03) | 5,636 lines, ~70% presentation plumbing, domain policy inline; only 8 of ~86 commands delegated. Every CLI change risks unrelated commands; agents cannot locate the code for a command | LOC census + `grep -c '.command('` = 57 registration sites |
| W8 | **No `.env.example`, no config model** (P1-05, P1-04) | The only template is an 8-line string literal inside `init.ts` covering 6 of ~30 supported variables; `doctor`/`config` then *falsely warn* about ≥12 legitimately supported vars | `payway-sdk config` with `PAYWAY_UI`/`PAYWAY_STRICT_VALIDATION`/`PAYWAY_MCP_ALLOW_MUTATIONS`/`PAYWAY_KHQR_MERCHANT_NAME` set → "Unrecognized PayWay environment variable(s)" |
| W9 | **`doctor` is not a diagnostic** (P1-06) | Boolean `ok` per check, ad-hoc IDs, no severity, no DNS/TLS/reachability/port/build/credential-environment checks; the only network check is `--live` exchange-rate | `src/cli/commands/doctor.ts` (316 L) read in full |
| W10 | **No `go-live check`, no `request inspect`, no `diagnose`** (P1-07, P1-08, P2-19) | The 298-line production checklist is prose; developers cannot see what will be sent (endpoint/headers/body/hash inputs) without reading `src/domains/*`; error triage stops at one code at a time | Command census; `--dry-run` exists only on `tx-batch` |
| W11 | **Repo/package/support identity is broken** (P1-10) | Cloning `Ruzaid-aman/ABA-Payway-SDK-unofficial` yields `package.json` pointing at a different org, a CI badge for a different repo, `security@antigravity.dev` whose "monitored mailbox" precondition is unmet, and an unpublished version | `git remote -v` vs `package.json` vs `SECURITY.md` |
| W12 | **Formatter configured, never applied, never gated** (P1-09) | `biome format src` → exit 1 on **181 files**. Any contributor or agent who runs the documented `npm run format` produces a 181-file diff that drowns review | Reproduced |
| W13 | **52% of tracked files are generated/internal/duplicated** (P2-01..P2-03) | One 42 KB guide is committed in **6** places (~254 KB); the tarball ships docs **3×**; `docs/api` (239 HTML files) is regenerated in CI with no freshness gate; two side apps carry lockfiles and tests no gate runs | Measured |
| W14 | **Agent knowledge has four competing entrypoints** (P2-16) | Root `AGENTS.md` (CLI cheatsheet + dated relay changelog, PowerShell-first), `.agents/AGENTS.md` ("deep rules"), `HANDOFF.md` (107 KB mandated pre-read), `docs/agents/*`, `llms.txt`, `skills/README.md`. No MUST/MUST NOT guardrails, no repo map, no definition of done in any of them | Read in full |
| W15 | **Rules exist only as prose + TS constants** (P2-05..P2-08, §11/§20) | The same rule is restated in `constants.ts`, a domain validator, a CLI flag help string, 2–6 doc copies, and 1–3 skills — with no machine-readable source and no cross-check. Drift is therefore structural, and has already happened (W3) | §11 matrix |

---

## 5. Developer Journey Audit

### 5.1 Can a developer answer these within minutes?

| Question | Answerable? | Where / what blocks it |
|---|---|---|
| What does this repo do? | **Yes (<1 min)** | `README.md` line 1 + the "You want to…" table (9 rows) is excellent |
| Official or unofficial? | **Yes** | README: "This is not an official gateway-provider SDK… no endorsement is claimed"; repeated in `SUPPORT.md`, `docs/README.md`, every guide header |
| Which PayWay products are supported? | **Yes** | README + `docs/README.md` "Choose Route" + `docs/reference/SDK-AND-CLI-REFERENCE.md`. But *readiness* per product (live-verified vs spec-derived) is only in `AGENTS.md`/`HANDOFF.md`, not in the public route table |
| What is production-ready vs experimental? | **Partly** | `request-qr` and `self-activation` are labelled "spec-derived, not live-verified" in `--help` and the reference (good). But `generate-qr --lifetime` (unit conflict, P0-03) and the purchase enum (P0-02) are *not* labelled anywhere a developer would see |
| Prerequisites / runtime versions | **Yes** | README ("Node.js 22.12 or later"), `SUPPORT.md`, `CONTRIBUTING.md` (adds "Node 24.11+ for the full maintainer toolchain") |
| Installation procedure | **No — ambiguous** | Three paths coexist: `npm ci && npm run build && npm exec -- payway-sdk demo` (in-checkout), `npm pack` + install the tarball (pre-publication), `npm install aba-payway-ts` (post-publication, **does not work today**). README says "do not assume that version is available on npm". A developer cloning *this* GitHub repo has no working install path except building from source |
| Environment setup / where secrets go | **Partly** | `QUICKSTART.md` §3 is good; but there is **no root `.env.example`** to copy, and `init` writes a 6-variable `.env` while ~30 are supported |
| Sandbox registration | **Yes** | Official link `sandbox.payway.com.kh/register-sandbox/`, "credentials are sent to your registered email", check-spam guidance, "delivery times are not guaranteed", last-checked date. Best-practice |
| Credential configuration | **Yes** | `.env` **or** profiles; precedence documented in `QUICKSTART.md` §3 (`--profile` → `PAYWAY_PROFILE` → saved default → project/ambient env). Precedence is prose-only, not code |
| First API request | **Yes** | `payway-sdk demo` (zero credentials) → `generate-qr` |
| Payment creation / QR testing / ABA Pay / cards | **Yes** | QUICKSTART §5, `sandbox-test-cards` CLI + `SANDBOX_TEST_CARDS` export, `docs/guides/07`, Postman collection |
| Callback testing | **Yes — outstanding** | QUICKSTART §4 + `docs/guides/16` + workbench. Requires understanding that `setup-webhook` is the listener and `webhook *` is the workbench (naming split, P1-11) |
| Status queries | **Yes** | `check-transaction` (7-day cache, no KHQR), `transaction-detail` (10/min, `--wait` for the ~5 s indexing lag), `transaction-list` (**gateway UTC+7** windows), `get-transactions-by-ref`. The per-endpoint quirks are documented in `llms.txt`'s "most often gotten wrong" block — excellent |
| Refunds / payouts | **Yes** | `refund` with balance pre-flight + currency-mismatch hard stop; `payout` + `beneficiary` whitelist with the sandbox-only seeded accounts (`500000001`) and the explicit warning that `000999888` is **not** whitelisted |
| Error troubleshooting | **Yes** | `explain <code>` + `docs errors-and-debugging` + `docs/guides/12`. No *contextual* diagnose (P2-19) |
| Production readiness | **Prose only** | `docs/guides/13` (298 lines of checkboxes) + `docs/guides/integration-onboarding` (G0–G7 gates). Nothing executable (P1-07) |
| Reconciliation / settlement | **Yes (prose + local tool)** | `docs/guides/20` (T+N merchant-specific, fee debits, portal export → bank statement join), `integration-finance` (receipt/report/bank record separation, tolerance, G6 evidence), `journal reconcile`. No settlement-report ingestion — correctly stated as the merchant's responsibility |

### 5.2 Places where a developer must guess / copy manually / read source

Each is a DX defect by the audit's definition.

| # | Friction | Location | Cost |
|---|---|---|---|
| F1 | **Which install path applies to me?** README offers three; only "build from source" works for a cloner | `README.md` "Try it locally" | 5–15 min, first contact |
| F2 | **`payway-sdk` vs `aba-payway-ts` vs `payway`.** Binary ≠ package name; `npx payway-sdk` resolves to an unrelated squatted package; README/QUICKSTART must carry warnings | `package.json.bin`, README, QUICKSTART §1 | Persistent confusion; agents will run `npx payway-sdk` |
| F3 | **No `.env.example` to copy at repo root.** Must run `init` (which also writes `INTEGRATION_REPORT.md` and scaffolds framework routes) or hand-write from `QUICKSTART.md` §3 | `src/cli/commands/init.ts:11-20` | Manual copy of 6 of ~30 vars; `PAYWAY_RSA_PUBLIC_KEY` omitted entirely from the template although payment-link/refund/pre-auth/payout/beneficiary all require it |
| F4 | **RSA PEM in `.env`.** Multi-line quoted PEM support exists (`src/cli/dotenv.ts`) and `doctor` detects truncation — but the template never shows the syntax, so the failure mode is discovered by trial | `checkRsaPem` in `doctor.ts` | 10–30 min for payment-link/refund users |
| F5 | **`--lifetime` unit differs per command** (seconds on `generate-qr`, minutes on `generate-checkout`), disclosed in `llms.txt` and skill prose, mitigated by a `--lifetime-minutes` alias **only** on `generate-checkout` | `src/utils.ts:186-225`, `llms.txt` | Silent 60× lifetime errors; contradicts OFFICIAL docs (P0-03) |
| F6 | **Payout key shape differs per endpoint**: `{account, amount}` on `generate-qr`/payout domain vs `{acc, amt}` on `generate-checkout`/`cof charge`/pre-auth-complete-payout/`payment-link create` | `AGENTS.md`, `src/utils.ts:112` | Gateway 403 code 35 "Payout Info is invalid" — now caught locally, but the developer must *know* which endpoint they are on |
| F7 | **`transaction-list --from/--to` are gateway UTC+7**; a UTC-derived window silently returns 0 rows | `src/utils.ts:227`, `AGENTS.md`, reference doc | Silent empty results; mitigated by `gatewayDayWindow()` default |
| F8 | **Which client do I use — `PayWay` or `sdk`?** `QUICKSTART.md` §6 uses both in one snippet; no decision rule | `src/index.ts`, `src/sdk.ts` | Architects must read source to decide |
| F9 | **Callback route determines the verification contract**, and there are four routes (signed online / unsigned payment-link pushback / unsigned offline-KHQR notification / raw-body Customer Module). Correctly documented, but only in prose spread over `docs/guides/11`, `16`, `17`, `19`, `README.md`, and 3 skills | multiple | High-stakes guess; `classifyCallback` exists in code but is not surfaced as a CLI/decision tool |
| F10 | **Discovering the full command surface** requires `--help` (good, grouped) — but flag-level semantics for ~86 commands live in a 46 KB reference doc, not in code-generated per-command docs | `docs/reference/SDK-AND-CLI-REFERENCE.md` | Doc drift risk (their own audit scored doc accuracy 5.5/10) |
| F11 | **`payway-sdk test` runs a MOCK suite**, while `npm run test:sandbox` runs live sandbox contract tests, and `npm test` runs the repo's unit suite. Three meanings of "test" | `package.json.scripts`, `src/test/index.ts` | An integrator running `payway-sdk test` may believe they validated against the gateway |
| F12 | **Production credentials have no distinct handling.** `profiles add` asks "Environment (sandbox/production)" and stores both plaintext in the same `~/.config/aba-payway-sdk/profiles.json` (mode 0600) | `src/config/profiles.ts:46-70` | Documented as a risk in README, but there is no separate protection, no confirmation, no `--production` gate (P1-01) |

---

## 6. Time-to-First-Success Analysis

### 6.1 Scenario A — first successful sandbox payment

**As-is (following QUICKSTART exactly, from a clone of *this* repo):**

| Step | Action | Manual? | Failure risk |
|---|---|---|---|
| 1 | `git clone`, `npm ci` | — | Low (verified: 13 s) |
| 2 | `npm run build` | — | Low (verified: 11 s, 1 CJS warning) |
| 3 | `npm exec -- payway-sdk demo` → understand create≠approve | Manual browser interaction | Low, high value |
| 4 | Register at `sandbox.payway.com.kh`, wait for email | **External, unbounded** | **High** — the dominant delay; repo correctly refuses to promise a time |
| 5 | Arrange ABA PAY sandbox testing access with an ABA integration contact | **External, human** | **High** — undocumented duration; without it a sandbox QR cannot be paid |
| 6 | `payway-sdk init --mode sandbox --template first-payment` | — | Medium: writes `.env`, `.env.example`, `INTEGRATION_REPORT.md`, scaffolds; no `--json` |
| 7 | Edit `.env` (4 vars) — no root `.env.example` to copy if `init` is skipped | **Manual copy** | Medium |
| 8 | `payway-sdk setup-webhook --tunnel --non-interactive` in a **second terminal** | Manual: keep running, copy the full public URL including `/aba-payway-webhook`, paste into the first terminal | **High** — needs `cloudflared` installed; URL copy is error-prone; the listener writes `PAYWAY_CALLBACK_URL` but the developer must still re-export it in the paying shell |
| 9 | `payway-sdk doctor --route online-qr` | — | Medium: no severity levels; false "Unrecognized variable" warnings (P1-04) |
| 10 | Generate a unique ≤20-char `tran_id` with an inline `node -e` one-liner | **Manual shell work** | Medium — QUICKSTART supplies it, but it is 3 lines of Node in bash |
| 11 | `generate-qr -a 3.00 -c USD -t $ID --callback-url $URL -y --no-polling --no-open-image --output json` | — | Medium: `--lifetime` unit trap if added; TLS-bypass temptation if the sandbox cert chain fails (P0-04) |
| 12 | Open the saved PNG and pay with the ABA simulator | **Manual, external** | High — "do not assume your everyday banking app can pay a sandbox QR" |
| 13 | `check-transaction -t $ID`, then `transaction-detail -t $ID --wait 10` | **Manual copy of the ID between commands** | Medium — no `:use <id>` outside the interactive `session` shell |
| 14 | Compare amount/currency/ID, conclude | Manual reasoning | Low (docs are emphatic) |

**Counted:** 14 steps · **8 manual** · **3 external/unbounded** (steps 4, 5, 12) · **2 unnecessary** (step 10's inline Node; step 13's ID re-typing) · **1 unclear** (step 8's URL hand-off between two terminals).
**Realistic time-to-first-success: 45–90 minutes of developer work, gated by days of external provisioning.** The repo cannot fix steps 4/5/12 — but it *can* remove 10, 11's traps, 13's re-typing, and 8's hand-off.

**Target (≤7 steps, 3 manual):**
```bash
git clone … && cd … && npm ci && npm run build
npm exec -- payway-sdk init --mode sandbox            # writes .env + .env.example (all 30 vars, commented)
npm exec -- payway-sdk doctor --route online-qr       # severity-graded, IDs stable, --fix for mechanical issues
npm exec -- payway-sdk webhook listen --print-url     # prints ONE copy-pasteable line; writes .env atomically
npm exec -- payway-sdk qr create --amount 3.00 USD    # mints a unique tran_id, prints it, saves PNG, no polling
npm exec -- payway-sdk transaction current            # sticky last-created id: no re-typing
npm exec -- payway-sdk transaction verify --expect-amount 3.00 --expect-currency USD   # asserts, exit≠0 on mismatch
```
**Delta:** −7 steps, −5 manual actions, one terminal, no inline Node, no ID re-typing, and `transaction verify` converts "compare it yourself" into an assertion an agent or CI can gate on.

### 6.2 Scenario B — first QR integration

As-is: `docs/guides/07` (42 KB) + `docs/README.md` route table + `skills/aba-payway-qr` + `skills/aba-payway-offline-qr` + `skills/aba-payway-customer-qr` + `docs/guides/19` must be triaged by the developer to discover that **four different "QR" things exist**: (1) online QR Payment API (`generate-qr`), (2) offline/local KHQR generation (`generate-qr --offline`, `src/khqr-offline.ts`, EMVCo TLV + CRC-16), (3) Customer Module dedicated KHQR (portal Customer-ID keyed, raw-body HMAC callback, `/aba-payway-khqr-webhook` route), (4) Soundbox `request-qr` (spec-derived, **not** live-verified). The separation *is* documented (`.agents/AGENTS.md` "Domain Separation" is explicit that offline CRC-16 must never be mixed with online HMAC-SHA512) but the **CLI does not express it**: one `generate-qr` command with an `--offline` flag covers (1) and (2), and (3)/(4) are elsewhere. Lifetime/expiry semantics differ per route (scan-time validity windows) and are prose-only.
**Target:** a `qr` command group with four explicit subcommands (`qr create`, `qr offline`, `qr customer`, `qr soundbox`) + `qr inspect <payload|png>` + `qr templates`, and a `capabilities` output that marks `qr soundbox` `UNVERIFIED`. See §14.

### 6.3 Scenario C — first webhook/callback test

As-is this is the repo's **strongest** journey and needs the least work: `setup-webhook --tunnel --forward-to http://localhost:3000/webhooks/aba` → `webhook trigger --event payment.approved` → receiver gets a correctly-signed fixture in seconds, no simulator. `webhook list/show/resend/verify-callback/status/stop` cover inspection, replay, and lifecycle. Gaps: (a) the listener is not named `listen` and lives in a different command tree from the workbench (P1-11); (b) no `--json` event stream from the listener, so an agent cannot consume arrivals programmatically (it must poll `webhook list --json`); (c) no duplicate-delivery *detection* surfaced at the listener (the journal's `callbackReplaySeen` keys on `(tran_id, status)` — correct per the ABA relay, but only visible via `journal reconcile`); (d) no fixture corpus on disk for merchant test suites (`buildWebhookFixture` is code-only, 6 events).

### 6.4 Scenario D — production readiness

As-is: `docs/guides/13` (298 lines, ~40 checkboxes incl. Integration-Team screen review), `docs/guides/integration-onboarding` (G0–G7 gates), `docs/guides/integration-finance` (settlement evidence, tolerance, G6), `docs/project/PRODUCTION-VERIFICATION-PLAN.md` (maintainer-facing). **None of it is executable.** There is no command that reads a merchant's configuration and tells them which gates are unmet; no command that distinguishes "I verified this" from "ABA must confirm this"; and no protection against the two classic cross-environment errors (sandbox credentials pointed at `checkout.payway.com.kh`, production credentials used in a sandbox test run). `doctor` checks credential *presence and shape*, never credential↔environment *coherence*.
**Target:** `payway go-live check` (§36) with `PASS | WARNING | BLOCKER | NOT_APPLICABLE | UNVERIFIED` per gate, machine-readable, refusing to report "ready" while any critical gate is `UNVERIFIED`, plus `env` guards (§10.4).

---

## 7. SDK Architecture Audit

### 7.1 Layer-by-layer assessment

| Layer | Files | Assessment |
|---|---|---|
| **Public API** | `src/index.ts` (259 L, ~258 exports) | **Weak boundary.** One flat entrypoint mixing: the client, the facade, 9 error classes, journal internals (SQLite sinks, schema prep), storage service, webhook server + forwarder + fixtures + token store, offline KHQR, sandbox registries, **mock server + test harness**, image opener, logger, circuit breaker. No subpath exports. A merchant importing `PayWay` bundles a mock gateway and a SQLite sink. Their own audit scored API design 6.5/10 ("258 exports, duplicate methods, misleading names") |
| **Client construction** | `PayWay` constructor + `resolveConfig` (`src/client.ts:1263-1457`) | **Good.** Config ← explicit → `PAYWAY_*` env, PEM normalisation, `timeout`/`maxRetries`/`retryDelayMs` validated at the boundary (S07: an invalid retry config used to surface as a misleading "Retry limit exceeded"), partner-only credential class supported, `baseUrl` override, per-endpoint rate-limit rule merge. **Gap:** silent acceptance of an *empty-string* `merchantId`/`apiKey` after `.trim()` is handled, but there is no environment↔credential coherence check and no way to construct a client that is *refused* in production without an explicit opt-in |
| **Service boundaries** | `src/domains/*` (8 factories) | **Strong.** Dependency-injected transport, pure functions, per-domain hash-field constants with provenance comments, per-domain validation. `self-activation` correctly uses a different auth path (partner HMAC, SHA-256 except one endpoint whose own spec says SHA-512 — the inconsistency is documented in `src/auth.ts`) |
| **Types** | `src/types.ts` (2,209 L, generated from `payway-openapi/bundled.yaml`), `src/domain-types.ts`, `src/schema.ts` | **Good**, but two parallel type worlds coexist: generated `components['schemas'][…]` used by domains, and hand-written `TransactionSession`/`InitiateTransactionPayload`/`ResponseType` used by `server/`+`sdk`. Domain return types are unions like `PurchaseQrResponse | ErrorStatus | PurchaseHostedHtmlResult` — callers must discriminate an *error envelope* as a success-shaped value |
| **Schemas / validation** | `src/schema.ts`, `src/utils.ts` (26 validators), `ajv` (dependency) | **Strong content, weak architecture.** Validators are hand-written imperative functions with excellent messages; `ajv` is a runtime dependency but JSON-Schema is not the rule source. `warnAdvisory` conflates "gateway-documented limit" with "SDK opinion" and is process-global (§7.3) |
| **Request builders** | `domains/*` + `client.request*` | **Good.** `filterParams` drops undefined, `encodeBase64IfNeeded` handles the documented base64 fields, `formatAmount` produces USD 2dp / KHR integer strings (matches OFFICIAL "formatted decimal string… must match the value used in hash computation"), `formatRequestTime` produces UTC `YYYYMMDDHHmmss` at signing time. **Gap:** builders are invisible — no way to obtain "what would be sent" without sending it (P1-08) |
| **Hash / signature** | `src/auth.ts` | **Strong.** `generateHmac(payload, fieldList, apiKey, encoding, algorithm)` with the field-position-preserving empty-string rule that OFFICIAL docs call non-negotiable; `encryptMerchantAuth` does the 117-byte PKCS#1 v1.5 chunking; verification is `timingSafeEqual` with length pre-check; `signCallbackBody`/`verifyCallbackDetailed` share one canonicalization by construction; `verifyCallbackSignatureRaw` covers the raw-bytes contract. **Gap:** no `explainHash()`/`inspectSignature()` diagnostic that returns the *concatenated pre-image* (masked) so a developer can diff against the gateway's `b4hash:` convention — the Postman collection does this and it is the #1 "Wrong hash" fix |
| **HTTP transport** | `_executeFetch` (`src/client.ts:1546-1872`) | **Strong.** Bounded retries with backoff, **mutation endpoints single-attempt by default**, circuit breaker (opt-in, per-endpoint), client-side token-bucket rate limiting per endpoint with `onThrottle`, `Retry-After`/`x-retry-after` parsing (delta-seconds and HTTP-date), `x-rate-limit-*` surfaced with an honest `UNCONFIRMED` note on the `reset` unit, correlation id (`cid`) per exchange, `status.trace` extraction, HTML-response detection with a helpful hint, form-urlencoded support, redirect-following with `HostedPageOutcome` decoding for the `/add-card/<base64>` signal. **Gaps:** no `tlsCaFile`/CA-bundle option (which is *why* `NODE_TLS_REJECT_UNAUTHORIZED=0` became the documented workaround, P0-04); `x-rate-limit-reset` unit unresolved; no proxy configuration |
| **Response parsing** | `normalizePaywayResponse`, `classifyBusinessError` (`src/client.ts:700-1010`) | **Good but sprawling.** Handles `status.code` as string *or* number, `"0"`/`"00"`/`""` as success, nested `{"status":{"code":429}}` and legacy flat `{"status":429}` (fixed in relay wave 2), string statuses `FAILED`/`ERROR`, numeric `status !== 0`, top-level `code`, HTML bodies, field-error maps, and `PTL02`/signature-code detection. That is 300 lines of shape-guessing in one file with no per-shape fixtures |
| **Errors** | `src/errors.ts` (9 classes) | **Good taxonomy, two defects.** `PayWayAPIError` carries `statusCode`, `paywayCode`, `rawBody`, `endpoint`, `retryable`, `rateLimitInfo`, `fieldErrors`, `responseUrl`, `hostedPage`, `correlationId`, and a `toJSON()`. **Defect 1:** `PayWayWebhookError extends PayWayError(…, 'config_error')` — a webhook failure is typed as a *configuration* error, so `classifyError` and any `type === 'config_error'` triage conflates them. **Defect 2:** `PayWayBusinessError`, `PayWayNetworkError`, `PayWayRateLimitError`, `PayWaySignatureError` all extend `PayWayAPIError` and *mutate* `type` after `super()` via `(this as {type: PayWayErrorType}).type = …` — a cast-based override of a `readonly` field. **Defect 3:** there is no `code`/`category`/`severity`/`docRef`/`retryRecommendation` on the error itself; that knowledge lives separately in `explain-code.ts`, so an SDK consumer (not CLI) cannot render an actionable message without importing the CLI's decoder |
| **Configuration** | §2.2 | **Weak.** Six places resolve config; no single model, no precedence implementation, no schema, no `config --json` (P1-05, P1-04) |
| **Environment switching** | `BASE_URLS` + `PAYWAY_ENV`/`PAYWAY_SANDBOX`/`baseUrl`/`PAYWAY_ENV=<https url>` | **Functional, unsafe.** Four ways to set the endpoint, no coherence validation, no production guard (P1-01) |
| **Callback parsing** | `src/webhook/{khqr-notification,customer-callback,cof-callback}.ts`, `classifyCallback`, `parsePaymentLinkPushback` | **Strong.** Route-specific parsers with typed results; `classifyCallback` is exactly the right primitive. **Gap:** not exposed as a CLI/agent tool, so the F9 friction stays prose |
| **Testability** | 162 files, 2,378 tests, hermetic env, injected transport, mock server | **Strong** (see §18) |
| **Extensibility** | `onRequest`/`onResponse`/`onError` hooks, `journal`, custom `rateLimitRules`, `baseUrl`, `mutationRetryPolicy`, `strictValidation`, pluggable `LogSink`, `JournalSink`, `WebhookStorage` | **Strong.** Hooks carry `PayWayHookMeta` (cid, attempt, durationMs, traceId) |

### 7.2 Poor separation of concerns — the specific instances

1. **`src/cli.ts` holds domain policy.** Their own census (M1): of ~4,323 inline command lines, 482 `console.log`, 335 error-routing statements, 396 `if`/`try`/`catch`, but only **111 domain calls**. Leaked non-CLI policy: `runPolling` backoff (`588-780`), gateway rate-limit pacing `TX_BATCH_PACE_MS` (`1652`), the payout-total-vs-amount money invariant (`3557-3593`), the token 90-day expiry policy (`4500-4520`), gateway-day timezone derivation (`1952`).
2. **`src/client.ts` holds four responsibilities**: config resolution, transport policy (retry/breaker/rate-limit/cid), response-shape classification (300 lines), and the domain composition root. The classification block should be `src/transport/classify.ts` with per-shape fixtures.
3. **`src/index.ts` is a barrel for six products** (SDK, webhook server, journal, storage, testing, offline KHQR) with no subpath boundaries.
4. **`sdk` facade vs `PayWay` class** duplicate purchase creation with incompatible shapes (§5.2 F8).
5. **`explain-code.ts` (CLI) owns error knowledge that `errors.ts` (SDK) should own** — so the useful part of the error model is only reachable through the CLI.

### 7.3 The advisory system is architecturally wrong for a server SDK

```ts
// src/utils.ts:34-46
const advisoryWarned = new Set<string>();
export function warnAdvisory(config, message) {
  if (config?.strictValidation) throw new PayWayConfigError(message);
  if (advisoryWarned.has(message)) return;
  advisoryWarned.add(message);
  console.warn(`[payway] ${message}`);
}
```
Three defects: (a) **process-global dedupe** — a long-running merchant server sees each advisory *once per process*, then silence forever (same pattern in `warnedShortTranId`, `warnedOversizedQrLifetime`); (b) **`console.warn` bypasses `createPayWayLogger`**, so it cannot be routed, levelled, JSON-formatted, or redacted — despite the repo having a structured logger with `LogSink` (`src/logger.ts`) and a `PAYWAY_LOG_LEVEL`; (c) **`strictValidation` flips the same list from warning to hard failure**, which is how P0-02 becomes a *blocking* error on an officially documented value. Advisories also cannot be enumerated or individually suppressed.
**Target:** an `Advisory` record `{ id, ruleId, severity: 'info'|'warn'|'error', source: 'official'|'sandbox'|'relay'|'repo', message, docRef }` emitted through the logger with a per-client (not per-process) dedupe window, plus `onAdvisory` hook and `PAYWAY_ADVISORY_IGNORE=<id,…>`; `strictValidation` promotes only advisories whose `source === 'official'`.

### 7.4 Target SDK architecture

Derived from the actual code (keeps the domain-factory pattern, fixes the boundaries):

```
src/
├── core/            types.ts (generated), errors.ts (+ code/category/severity/docRef),
│                    advisories.ts (registry + emitter), money.ts (amount/currency/format),
│                    ids.ts (tran_id/request_id/ctid rules), lifecycle.ts (status model)
├── auth/            hmac.ts (generateHmac + inspectHmac), rsa.ts (encryptMerchantAuth, PEM),
│                    callback-signature.ts (verify/sign, sorted-key + raw), field-orders.ts
│                    (every *_HASH_FIELDS with x-provenance)
├── config/          schema.ts (ONE zod/JSON-Schema model), resolve.ts (precedence impl),
│                    env.ts (var registry — generated, §11), profiles.ts, data-root.ts
├── transport/       fetch.ts (retry/breaker/rate-limit/cid/timeout/TLS CA),
│                    classify.ts (response-shape → typed result), digest.ts
├── client/          PayWay.ts (composition root only), sdk.ts (facade; document which to use)
├── domains/         checkout · qr · khqr · customer-qr · payment-link · cof · pre-auth ·
│                    payout · beneficiary · self-activation · exchange-rate · transactions
├── callbacks/       classify.ts, parsers/{online,pushback,khqr-notification,customer,cof}.ts,
│                    fixtures/  (on-disk corpus, §19)
├── observability/   logger.ts, journal/{writer,digest,stats,reconcile,intelligence,sinks}.ts
├── webhook/         server.ts, storage/{json,sqlite}.ts, forwarder.ts, tunnel.ts, token-store.ts
├── khqr-offline/    tlv.ts, crc16.ts, generate.ts, inspect.ts, config.ts
├── diagnostics/     doctor.ts (checks registry), rules.ts (engine over knowledge/rules),
│                    explain.ts (moved from cli/), go-live.ts, request-inspect.ts
├── testing/         mock-server.ts, harness.ts, fixtures.ts     → subpath export ONLY
└── cli/             commands/** (one module per command group), output/** (ONE contract),
                     ui/**, completions/**, dotenv.ts
```
with `package.json.exports`:
```
"."                 → core + client + domains + callbacks + errors        (merchant server)
"./webhook"         → webhook server/storage/forwarder/fixtures           (receiver apps)
"./khqr-offline"    → offline generation only (no HTTP, no crypto keys)   (POS/batch)
"./diagnostics"     → doctor/rules/explain/go-live                        (tooling, CI)
"./testing"         → mock server + harness + fixtures                    (devDependency use)
"./cli"             → programmatic runCli(argv)                           (embedders)
```
**Migration value:** a merchant's server bundle stops shipping a mock gateway, an MCP SDK, a QR renderer, and a YAML parser; `PayWay` remains importable from the root so nothing breaks; the CLI keeps working because it imports subpaths internally. **This is a repackaging, not a rewrite** — every module already exists.

### 7.5 Abstraction quality: too thin or too magical?

**Verdict: correctly positioned, with two local failures.** It is *not* a thin HTTP wrapper — validation, mutation-retry policy, rate limiting, circuit breaking, correlation ids, journaling, and route-specific callback contracts all sit above transport. It is *not* too magical either — `rawBody`, `lastCorrelationId`, `lastTraceId`, `apiBaseUrl`, `onRequest/onResponse/onError`, and `--json` passthrough of the raw gateway response all remain reachable, and the docs repeatedly refuse to hide ambiguity ("PENDING may persist ~24h", "no EXPIRED status exists").

The two failures are at the *edges*:
- **Too magical:** `sdk.client.handleResponse(session, options)` "auto-detects the response type and performs the correct UX action — no merchant logic required" (`src/sdk.ts`). For a payment SDK, an opaque auto-action on the customer-facing leg is exactly where a developer needs transparency; `HandleResponseResult` helps, but the doc comment "no merchant logic required" invites the mistake the rest of the repo fights.
- **Too thin:** the *diagnostic* surface. `PayWayAPIError` exposes `paywayCode` but not the explanation/likely-cause/doc-ref that already exists 400 lines away in `src/cli/explain-code.ts`. An SDK consumer gets a code; a CLI consumer gets a diagnosis. That asymmetry is the wrong way round.

---

## 8. CLI / Terminal Experience Audit

### 8.1 Inventory

`payway-sdk --help` groups commands into **Setup / Payments / Transactions / Money-out / Reference / Agent & skills / Other** — a genuinely good information architecture, and the grouped help is a custom `GroupedProgramHelp` (`src/cli/ui/help.ts`). Global options: `--profile`, `--no-color`, `--journal`/`--no-journal`, `-V`, `-h`. Plus a `preAction` hook that applies the journal policy and emits `cli.command_started`.

57 `.command()` registration sites in `src/cli.ts` + 8 delegated `register*` modules ⇒ ~86 leaf commands. Human-mode polish is real: unknown-command/unknown-option suggestions (Levenshtein over the live registry), a bare-invocation guided overview screen on TTY, `PAYWAY_UI=classic` escape hatch, `NO_COLOR`, Ctrl-C → 130, spinners only on TTY, tables for `transaction-list`/`profiles list`, first-payment "next step" help text appended to 8 commands, next-step pickers after an APPROVED payment, an interactive `session` shell with `:use <tran-id>` stickiness and persisted history, and shell completions **generated from the live command registry** (`src/cli/completions/introspect.ts`) for bash/zsh/fish/powershell.

### 8.2 What is weak

| # | Weakness | Evidence | Impact |
|---|---|---|---|
| C1 | **Flat verb-noun naming with three competing conventions** | `check-transaction` (verb-noun) vs `transaction-detail`/`transaction-list` (noun-noun) vs `get-transactions-by-ref` (gateway-shaped) vs `tx-batch` (abbreviation) vs `generate-qr`/`request-qr`/`generate-checkout`/`checkout-form` (four creation verbs) vs `setup-webhook`/`webhook` (one concept, two trees) | A developer cannot *predict* a command name; agents must enumerate `--help`. Discoverability tax on every session |
| C2 | **`--json` is per-command, inconsistent, and absent where most needed** | 37 `--json` registrations; **absent** on `init`, `config`, `validate`, `profiles list/add/use/current`, `demo`, `test`, `onboard`, `session`, `completions` (reproduced for `config`, `validate`, `profiles list`) | The three commands an agent most needs to *read state* (`config`, `profiles list`, `validate`) are human-only |
| C3 | **`--output json|ndjson` documented as global, implemented on 2 commands** | `src/cli.ts:2484` (`generate-qr`), `:3175` (`generate-checkout`); `argvRequestsMachineOutput` (`:5509-5520`) treats it as global; `llms.txt` and the reference doc advertise it globally. Reproduced: `check-transaction --output json` → `unknown option '--output'` | Documented contract is false ⇒ agents write failing commands |
| C4 | **Six success-envelope shapes** | `{schemaVersion:'1.0', command, transactionId, context, request, creation, payment, poll, artifacts, nextAction}` (2 cmds) · `{ok, route, context, framework, dataRoot, checks[], envIssues[], live?}` (`doctor`) · bare object (`explain`, `status`, `journal stats`) · bare array (`sandbox-test-cards`, `sandbox-beneficiaries`) · raw gateway passthrough (`printApiResultJson`, most API cmds) · `{error:{kind,exitCode,type,message,…}}` (failures) — and their own audit found 4 *incompatible error* families (`cli.ts` canonical, `webhook.ts` 15 hand-rolled sites missing `type`, `docs.ts` `kind:'config_error'` not in the `StructuredError` union, `onboard.ts` no `kind`/`exitCode`) | No single parser; every consumer special-cases |
| C5 | **No severity model in `doctor`** | `DoctorCheck = {id,label,ok,detail,fix?}` — boolean only; the CLI *simulates* severity by excluding `framework`/`journal` ids from "blockingFailures" (`src/cli.ts:1225-1227`, `:1287-1289`) — an id-blacklist, not a severity field | Agents cannot distinguish "advisory" from "blocker" except by hard-coding ids |
| C6 | **Unstable check IDs** | `env-file`, `framework`, `env-PAYWAY_ENV`, `env-PAYWAY_MERCHANT_ID`, `env-PAYWAY_API_KEY`, `env-apikey-length`, `env-value`, `env-PAYWAY_CALLBACK_URL`, `journal`, `env-rsa-pem` — mixes slug style with raw env-var names; no registry, no category, no version | `--json` consumers cannot rely on ids across releases |
| C7 | **`doctor` checks nothing external except one optional call** | No DNS, no TLS/chain, no endpoint reachability, no callback listener reachability, no port-conflict, no build/`dist` presence, no SDK-version match, no credential↔environment coherence, no dependency check, no repo-state check. `--live` calls `checkout.getExchangeRate()` once and reports `ok|fail|skipped` with **no error detail in JSON mode** (`catch { live = {status:'fail'} }` at `src/cli.ts:1204-1206` — the actual error is swallowed) | The most important diagnostic command cannot answer "why can't I reach PayWay?" |
| C8 | **No request inspection / dry-run** | `--dry-run` only on `tx-batch` (`:1736`, lists targets, no call). No way to see endpoint, method, headers, body, normalised params, or the HMAC pre-image without sending | Debugging "Wrong hash" (code 1) — the single most common PayWay failure — requires reading `src/domains/*`. The Postman collection *does* log `b4hash:`; the CLI/SDK does not |
| C9 | **No production gate** | `-y/--force` on 9 commands skips confirmation unconditionally; `production` appears 3× in `src/cli.ts`, none as a gate | P1-01 |
| C10 | **No `env` command** | Environment is read from `PAYWAY_ENV`/`PAYWAY_SANDBOX`/`baseUrl`/profile; `config` prints it human-only; there is no `env current`/`env use` | No safe way to switch or to *prove* which environment you are in |
| C11 | **`validate` is a stub** | `validate -a <amount> [-c] [-t]` validates *a refund amount or a transaction id* only — while its name promises whole-integration validation | Agents will call `payway validate` expecting a gate and get a two-field check |
| C12 | **`test` is misleadingly named** | `payway-sdk test` runs the **mock** suite (`sdk.runTestSuite()` → local mock HTTP server). `npm run test:sandbox` runs live contract tests. `npm test` runs unit tests | An integrator may believe they validated against the gateway |
| C13 | **Sticky state exists only in an interactive shell** | `session`'s `:use <tran-id>` (`src/cli/session.ts`) is TTY-only; one-shot commands require re-passing `-t` | Agents (non-TTY by definition) lose the ergonomic; QUICKSTART step 13 re-types the id |
| C14 | **Secrets in argv** | `webhook verify-callback --sig "<X-PAYWAY-HMAC-SHA512>"`, `--token <pwt>` on `cof charge`, `--payout '[{"acc":"…","amt":…}]'`, `payment-link create --image`, plus every credential via env. `profiles add` prompts and uses `readMaskedInput` (good) — but flags put tokens in shell history and process listings | Documented nowhere as a risk; `--token-file`/stdin alternatives exist for some but not all |

### 8.3 Should there be a unified `payway` CLI?

**Yes — as an additional bin alias and a noun-first command tree, with the existing flat names retained as hidden deprecated aliases.** Rationale: (a) `payway-sdk` ≠ `aba-payway-ts` ≠ `payway` is already a documented confusion (F2), and the `payway-sdk` name is squatted on npm by an unrelated package, so a *third* short name that the project controls is a liability unless the package name and bin are aligned at the 2.0.0 boundary; (b) the noun-first tree (`payway transaction get`, `payway qr create`, `payway webhook listen`) is what makes C1/C13 fixable and is what agents predict; (c) the repo already has the two hardest prerequisites — a live command registry for completions (`src/cli/completions/introspect.ts`) and an in-process `runCli(argv)` export — so aliases can be generated and tested rather than hand-maintained.

**Recommendation:** at the 2.0.0 major (already required by the Node floor), ship `bin: { "payway": "./dist/cli.js", "payway-sdk": "./dist/cli.js" }`, introduce the noun-first tree as canonical, keep every existing name as a hidden alias that emits a one-line deprecation notice **on stderr only** (never stdout, to preserve the JSON contract), and gate alias parity with a generated test so no command can be orphaned.

---

## 9. Proposed CLI Specification

### 9.1 Shared conventions (apply to every command; specified once)

**Output contract (the single most valuable change).** One envelope, one version, every command, both modes.

```jsonc
// SUCCESS — stdout, exactly one document, exit 0
{
  "schemaVersion": "2.0",
  "kind": "result",                       // result | collection | diagnostic | stream-event
  "command": "transaction.get",           // dotted canonical id
  "ok": true,
  "context": {
    "environment": "sandbox",             // sandbox | production | custom
    "endpoint": "https://checkout-sandbox.payway.com.kh",
    "profile": "sbx-acme",                // omitted when unset
    "credentialSource": "profile",        // profile | env | dotenv | missing
    "sdkVersion": "2.0.0",
    "nodeVersion": "22.22.3"
  },
  "data": { /* command payload; object for result, array for collection */ },
  "gateway": {                            // present only when a call was made
    "endpoint": "/api/payment-gateway/v1/payments/check-transaction-2",
    "method": "POST",
    "httpStatus": 200,
    "paywayCode": "00",
    "correlationId": "cid_01J…",
    "traceId": "…",
    "durationMs": 412,
    "attempts": 1
  },
  "diagnostics": { "advisories": [ /* Advisory records, §7.3 */ ], "warnings": [] },
  "next": [ { "command": "transaction verify --id …", "reason": "creation is not approval" } ]
}

// FAILURE — stdout, exactly one document, exit per class
{
  "schemaVersion": "2.0", "kind": "error", "command": "refund.create", "ok": false,
  "context": { /* same */ },
  "error": {
    "code": "PW-CFG-004",                 // stable, documented, namespaced (§15)
    "category": "CONFIGURATION",          // §10 categories
    "severity": "blocker",                // blocker | error | warning | info
    "message": "PAYWAY_API_KEY is missing or empty",
    "explanation": "Every PayWay request is HMAC-signed with the merchant API key…",
    "likelyCause": "…", "correction": "Add PAYWAY_API_KEY=… or run `payway configure`",
    "docRef": "payway docs setup#credentials",
    "environment": "sandbox", "endpoint": null, "httpStatus": null, "paywayCode": null,
    "merchantRef": null, "transactionId": null, "correlationId": null,
    "retry": { "safe": false, "reason": "configuration error; retrying cannot help" },
    "exitCode": 1
  },
  "next": [ { "command": "payway doctor --json", "reason": "…" } ]
}
```

**Rules:** stdout carries **exactly one** JSON document (`--output json`) or **one per event** (`--output ndjson`, `kind:"stream-event"`); **all** human chrome, progress, spinners, banners, profile notices, update notices, advisories, and deprecations go to **stderr**; `--json` is a permanent alias for `--output json`; `--output` is registered **once on the program** (fixes C3); every command that reads state supports it (fixes C2); no command may print a partial document. Enforced by a parametrised test over the whole registry (§18.4, contract class).

**Exit codes (extend the existing 0/1/2/3/130 — do not renumber):**

| Code | Meaning | Existing? |
|---|---|---|
| 0 | Success; for `verify`/`check` commands: all gates PASS or WARNING | yes |
| 1 | Validation / input / configuration (`PW-VAL-*`, `PW-CFG-*`, `PW-ENV-*`, `PW-CRED-*`, `PW-SEC-*`) | yes |
| 2 | PayWay API rejection (`PW-API-*`, `PW-HASH-*`, `PW-TX-*`, `PW-CUR-*`, `PW-AMT-*`) | yes |
| 3 | Network / timeout / rate-limit / circuit-open (`PW-NET-*`) | yes |
| 4 | **New:** callback/webhook failure (`PW-CB-*`) — verification failed, malformed, listener could not bind | no |
| 5 | **New:** a `verify`/`check`/`go-live` gate evaluated to **BLOCKER** | no |
| 6 | **New:** a **production-safety guard** refused the operation (missing `--confirm-production`) | no |
| 130 | Interrupted (Ctrl-C) | yes |

**Interactive vs non-interactive.** Mode resolution already exists (`src/cli/ui/mode.ts`: TTY+no machine flags → `clack`; `--json`/`-y`/`--non-interactive`/piped → `none`). Extend it: a command that needs input and cannot prompt **must** fail with `PW-VAL-011 "missing required input in non-interactive mode"` naming the exact flag, and never hang. Destructive or money-moving commands require confirmation on TTY and `-y` off TTY; **in production they additionally require `--confirm-production` (exit 6 without it), and `-y` never substitutes for it.**

**Secret handling (all commands).** Never print, log, journal, or echo: `apiKey`, `PAYWAY_RSA_PUBLIC_KEY`/private material, `pwt`/payment tokens, `hash`/`b4hash` pre-images, `merchant_auth` ciphertext, `X-PAYWAY-HMAC-SHA512` values, provider API keys, full callback bodies in `digest` mode. Redaction is **allow-list, not deny-list** (the journal's digest mode already works this way): a fixed set of non-secret fields is emitted, everything else is dropped. Masking format is uniform: `first4 + "•"×min(len-8,16)` (already used by `config`) or `***HIDDEN***` (already used by `sanitizeForLog`) — pick one, apply everywhere, and expose `maskPwt`-style helpers. Add `--token-file <path>` / `PAYWAY_TOKEN_STDIN=1` alternatives for every secret-bearing flag (fixes C14). A `secret-redaction` test class asserts that for a corpus of seeded canaries, no command under any flag combination writes a canary to stdout, stderr, the journal, or a log sink.

**AI-agent suitability (every command).** A command is *agent-suitable* iff: `--output json` works; it never prompts when `--non-interactive` is set; exit codes are class-stable; its `error.code` is in the published registry; it has no side effect not described in `--help`; and it is listed in `payway capabilities --json` with `{ name, readOnly, mutating, moneyMoving, requiresCredentials, requiresRsa, requiresNetwork, environmentsAllowed, verified: "official"|"sandbox"|"spec"|"unverified" }`. `capabilities` becomes the machine-readable command catalogue that replaces scraping `--help` (and the existing `completions/introspect.ts` already computes most of it).

### 9.2 Command tree (target IA)

```
payway
├── init                 first-run project bootstrap          (exists → extend)
├── configure            interactive/non-interactive config writer   (NEW; absorbs `config` write-side)
├── doctor               environment + connectivity diagnostics      (exists → rebuild, §9.3)
├── env                  current | use | list | guard                (NEW, §10.4)
├── config               show resolved configuration (READ-ONLY)     (exists → add --json)
├── capabilities         machine-readable command/product catalogue  (NEW, §9.1)
├── products             PayWay product + readiness matrix           (NEW, §26)
├── rules                list/check PayWay rules (from knowledge/rules) (NEW, §11)
├── validate             validate config | request | integration     (exists → generalise, fixes C11)
├── request              inspect | sign | send                       (NEW, §9.4)
├── sandbox              info | verify | test-cards | beneficiaries | simulator (exists, grouped)
├── qr                   create | offline | customer | soundbox | inspect | templates | decode
│                                                                       (exists, regrouped, §14)
├── checkout             create | form | purchase | hosted            (exists, regrouped)
├── payment-link         create | get | void | image | pushback       (exists)
├── cof                  link-account | link-card | link-card-form | charge | token {list,renew,details,remove} | flag-sweep
├── transaction          get | detail | list | by-ref | poll | close | batch | current | verify | explain
│                                                                       (exists, regrouped + NEW current/verify)
├── refund               create | check | balance                     (exists, regrouped)
├── payout               create | beneficiary {add,list,update-status} (exists, regrouped)
├── pre-auth             complete | complete-with-payout | cancel      (exists)
├── self-activation      new-merchant | credential-info | mc-info      (exists; marked UNVERIFIED)
├── exchange-rate        get                                           (exists)
├── webhook              listen | trigger | verify | resend | list | show | status | stop | fixtures
│                                                                       (exists; `setup-webhook` → `webhook listen`)
├── journal              timeline | stats | reconcile | explain | anomalies | show | prune  (exists)
├── logs                 tail | redact | share                         (NEW, §16)
├── diagnose             symptom-driven diagnosis                      (NEW, §15.5)
├── go-live              check | report | diff                         (NEW, §36)
├── docs                 list | <topic> | search                       (exists)
├── explain              <code>                                        (exists)
├── status               code tables                                   (exists)
├── demo                 credential-free simulated journey             (exists)
├── session              interactive shell                             (exists)
├── agent / ask / onboard / mcp / skills / completions                 (exists)
└── version
```

### 9.3 `payway doctor` — full specification

**Purpose:** answer "can I make a PayWay call from *this* machine, in *this* environment, for *this* route — and if not, what exactly do I change?" in one command, for humans and machines.

**Syntax:**
```
payway doctor [--route <demo|online-qr|hosted-checkout|payment-link|cof|payout|khqr-offline|all>]
              [--env <sandbox|production>] [--profile <name>]
              [--live] [--no-live] [--check <id,…>] [--category <cat,…>]
              [--severity-min <info|warning|error|blocker>]
              [--fix] [--timeout <ms>] [--output json|ndjson] [--non-interactive]
```
**Arguments/flags:** `--route` selects the requirement set (default `online-qr`, as today; `all` runs every category). `--live` opts into network checks (default **on** for `reachability` when credentials are present, **off** in CI via `PAYWAY_DOCTOR_LIVE=0`, because a live probe spends sandbox quota). `--check`/`--category`/`--severity-min` filter. `--fix` applies only *mechanical, reversible* fixes (create `.env` from template, append a missing var, normalise a PEM's line endings, create the data root) and prints a diff before writing; it never writes credentials and never touches production config without `--confirm-production`.

**Required configuration:** none (that is the point — `doctor` must run with zero config and report precisely what is missing).

**Check registry (stable IDs, categories, severities).** IDs are `CAT-nnn`, registered in `knowledge/rules/doctor-checks.yaml` (§21.2) so the CLI, docs, and tests read one source.

| ID | Category | Check | Severity when failed | Fix hint |
|---|---|---|---|---|
| RUN-001 | RUNTIME | Node ≥ `engines.node` (22.12.0) | blocker | Install Node 22.12+ |
| RUN-002 | RUNTIME | Runtime is a supported major (22/24) | warning | — |
| DEP-001 | DEPENDENCY | `node_modules` present & `npm ci`-consistent (lockfile vs tree) | blocker | `npm ci` |
| DEP-002 | DEPENDENCY | optional native backend probe (`probeStorageBackend()`) — reports json/sqlite | info | `npm i better-sqlite3` for SQLite |
| DEP-003 | DEPENDENCY | `cloudflared` on PATH (only when `--route` needs a tunnel) | warning | install cloudflared or use `--url` |
| BLD-001 | BUILD | `dist/` present when running the installed CLI from source | blocker | `npm run build` (**this is the exact defect that breaks CI, §33**) |
| BLD-002 | BUILD | `sdkVersion` (package.json) === version reported by the running bundle | warning | rebuild |
| ENV-001 | ENVIRONMENT | `PAYWAY_ENV` ∈ {sandbox, production} or an https URL | error | `payway env use sandbox` |
| ENV-002 | ENVIRONMENT | resolved `endpoint` matches the resolved `environment` (no `baseUrl`/env contradiction) | **blocker** | remove the conflicting override |
| ENV-003 | ENVIRONMENT | no unknown/typo'd `PAYWAY_*` vars (registry-generated — **fixes P1-04**) | warning | list of known vars |
| ENV-004 | ENVIRONMENT | `.env` parseable, incl. multi-line quoted PEM | error | `payway init` |
| CFG-001 | CONFIGURATION | `PAYWAY_MERCHANT_ID` present, ≤30 chars (OFFICIAL max length) | blocker | — |
| CFG-002 | CONFIGURATION | `PAYWAY_API_KEY` present, length ≥16 | blocker | — |
| CFG-003 | CONFIGURATION | `PAYWAY_RSA_PUBLIC_KEY` present **iff** route needs it (payment-link, refund, pre-auth, payout, beneficiary) | blocker (route-scoped) | — |
| CFG-004 | CONFIGURATION | RSA PEM shape: BEGIN/END PUBLIC KEY, 1024-bit, not truncated | blocker | re-copy; multi-line quoting supported |
| CFG-005 | CONFIGURATION | `PAYWAY_CALLBACK_URL` present & public HTTPS for callback routes | error | `payway webhook listen` |
| CFG-006 | CONFIGURATION | `PAYWAY_RETURN_URL`/`CANCEL_URL` valid http(s) for hosted routes | error | — |
| CFG-007 | CONFIGURATION | KHQR merchant config complete for `--route khqr-offline` (7 fields) | blocker (route-scoped) | `payway configure --khqr` |
| CFG-008 | CONFIGURATION | timeout/retry/rate-limit values in range | warning | — |
| CRED-001 | CREDENTIAL | active profile exists and resolves | error | `payway config --json` |
| CRED-002 | CREDENTIAL | profile store permissions are 0600 and path is outside the repo | warning | — |
| **CRED-003** | **CREDENTIAL** | **credential↔environment coherence: a known-sandbox merchant ID must not be used with the production endpoint, and vice versa** (heuristic: profile `environment` field, merchant-id allow-list, endpoint match) | **blocker** | `payway env use <env>` |
| **CRED-004** | **CREDENTIAL** | **expired/rotated credential signal: the last live probe's `PTL171/PTL175` (key rotation, zero-overlap) or auth-class code** | **blocker** | re-issue from the portal |
| NET-001 | NETWORK | DNS resolves for the endpoint host | error | check DNS/VPN |
| NET-002 | NETWORK | TCP 443 reachable | error | firewall/egress |
| NET-003 | NETWORK | **TLS chain validates** (explicit, actionable failure instead of a bypass instruction — **fixes P0-04**) | error | `NODE_EXTRA_CA_CERTS=<corp-root-ca.pem>`; never `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| NET-004 | NETWORK | TLS bypass is **not** active (`NODE_TLS_REJECT_UNAUTHORIZED` unset) | **blocker** | unset it |
| NET-005 | NETWORK | no proxy env contradiction (`HTTPS_PROXY` set but unreachable) | warning | — |
| API-001 | PAYWAY_API | live probe: `exchange-rate` round-trip (read-only, no quota-sensitive mutation) | error | report `paywayCode` + `correlationId` + `explain` link (**never swallow it**, fixes C7) |
| API-002 | PAYWAY_API | probe latency vs `timeout` config | warning | raise `PAYWAY_TIMEOUT` |
| API-003 | PAYWAY_API | rate-limit headers observed (records `x-rate-limit-*` unit evidence) | info | — |
| WEB-001 | CALLBACK | callback URL publicly reachable (HEAD/POST probe when `--live`) | error | keep the tunnel running |
| WEB-002 | CALLBACK | local listener port free / SDK-owned receiver state (`webhook status`) | warning | `payway webhook stop` |
| WEB-003 | CALLBACK | listener binds loopback unless explicitly widened | warning | `--host` warning text already exists |
| WEB-004 | CALLBACK | route↔verification-contract match (signed online vs unsigned pushback vs raw-body customer vs unsigned KHQR) | error | `payway docs callbacks-webhooks` |
| DATA-001 | STORAGE | data root writable; journal/webhook/token paths resolve | error | `PAYWAY_DATA_DIR` |
| DATA-002 | STORAGE | journal size < 50 MB, retention configured | warning | `journal prune` |
| DATA-003 | STORAGE | no journal/webhook/token store inside the git working tree | **blocker** | move the data root |
| SEC-001 | SECURITY | no `.env`/`profiles.json` tracked by git | **blocker** | `.gitignore` |
| SEC-002 | SECURITY | no credential-looking literal in tracked source (fast local scan) | error | rotate + remove |
| SEC-003 | SECURITY | log level not `trace` in production | warning | — |
| SEC-004 | SECURITY | secrets absent from argv for the current invocation (`--sig`, `--token`) | warning | use `--token-file` |
| REPO-001 | REPOSITORY | working tree clean / branch reported (contributor mode only) | info | — |
| REPO-002 | REPOSITORY | generated corpora in sync (`knowledge`, `docs-packaged`, guide mirrors, error registry) | error | `npm run sync:knowledge` |

**Status model:** `pass | warn | fail | skipped | unverified` per check, with `severity: info | warning | error | blocker` **from the registry**, not from an id blacklist (fixes C5/C6). `skipped` carries a reason (`no credentials`, `--no-live`, `route not selected`). `unverified` is reserved for checks whose *interpretation* depends on ABA-side facts the repo cannot confirm (e.g. CRED-004's rotation window) — never silently treated as pass.

**Human output:**
```
ABA PayWay doctor — route: online-qr · env: sandbox · endpoint: checkout-sandbox.payway.com.kh
credential source: profile (sbx-acme) · data root: ~/.config/aba-payway-sdk/data

  PASS   RUN-001  Node runtime supported              v22.22.3 (≥22.12.0)
  PASS   CFG-001  Merchant ID configured              ec47•••••• (8 chars)
  PASS   CFG-002  API key configured                  40 chars
  WARN   CFG-003  RSA public key not configured       not required for online-qr; required for payment-link/refund/payout
         → add PAYWAY_RSA_PUBLIC_KEY when you enable those routes
  FAIL   NET-003  TLS chain does not validate         self-signed certificate in certificate chain
         → export NODE_EXTRA_CA_CERTS=/path/to/corp-root-ca.pem   (never disable verification)
  FAIL   CRED-003 Credential/environment mismatch     profile 'sbx-acme' is a sandbox profile but PAYWAY_BASE_URL
                                                       points at checkout.payway.com.kh
         → payway env use sandbox   (or unset PAYWAY_BASE_URL)
  SKIP   API-001  Live probe skipped                  NET-003 failed

3 failed (2 blockers) · 1 warning · 8 passed · 1 skipped
Next: payway doctor --fix --json    ·    payway explain PTL02
exit 1
```
**JSON output:** the §9.1 envelope with `kind:"diagnostic"`, `data:{ route, checks:[{id,category,label,severity,status,detail,fix,docRef,evidence?,durationMs?}], summary:{pass,warn,fail,skipped,unverified,blockers}, context }`. `ndjson` emits one `stream-event` per check as it completes (useful for slow network checks).
**stdout/stderr:** the document on stdout; progress and the human rendering on stderr in machine mode. **Exit codes:** `0` no fail above `warning`; `1` any `error`; `5` any `blocker`; `3` if only network checks failed with no config error (so CI can distinguish "runner has no egress" from "merchant misconfigured").
**Validation rules:** `--route`/`--severity-min`/`--output` enum-checked; `--fix` refused under `--non-interactive` unless every fix is mechanical; `--fix` never writes a secret.
**Failure conditions & recovery:** each check's `fix` is a *command*, not prose. `doctor --json` must succeed (exit ≠ 0 but a valid document) even when the data root is unwritable.
**Example workflow:** `payway doctor --route payment-link --live --output json | jq '.data.checks[] | select(.status=="fail")'`
**AI-agent suitability:** **highest in the CLI** — read-only, deterministic, filterable, self-describing fixes; `--check` lets an agent re-run one check after applying a fix. Must be listed in `capabilities` as `readOnly: true, requiresNetwork: --live`.

### 9.4 `payway request inspect` — full specification

**Purpose:** show *exactly* what the SDK would put on the wire, without putting it on the wire — the missing tool for the #1 PayWay failure mode (`code 1` "Wrong hash").

**Syntax:**
```
payway request inspect <operation> [flags-for-that-operation] [--output json]
payway request inspect qr.create --amount 3.00 --currency USD --id TX-1 --callback-url https://…
payway request inspect checkout.purchase --amount 5.00 --currency USD --payment-option abapay_khqr_deeplink --return-url https://…
payway request send    <operation> … --dry-run            # alias, same output, never sends
payway request sign    --operation <op> --fields-json <json> [--show-preimage]
```
`<operation>` is the dotted canonical id from `capabilities` (`qr.create`, `qr.request`, `checkout.purchase`, `checkout.hosted-form`, `payment-link.create`, `cof.link-account`, `cof.link-card`, `cof.charge`, `refund.create`, `payout.create`, `pre-auth.complete`, `transaction.get`, `transaction.detail`, `transaction.list`, `transaction.by-ref`, `transaction.close`, `exchange-rate.get`, `beneficiary.add`, `self-activation.new-merchant`, `khqr.offline`).

**Output (JSON, `kind:"result"`):**
```jsonc
{
  "operation": "qr.create",
  "environment": "sandbox",
  "endpoint": "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/generate-qr",
  "method": "POST",
  "contentType": "application/json",
  "transportPolicy": { "mutation": true, "retry": "none", "reason": "MUTATION_ENDPOINTS: a lost response is an UNKNOWN outcome",
                       "rateLimit": { "limit": 10, "intervalMs": 1000, "source": "ABA relay 2026-10-03 (10 req/s per MID)" } },
  "headers": { "content-type": "application/json", "accept": "application/json" },   // NO auth header exists — say so explicitly
  "authModel": { "type": "body-field-hmac", "algorithm": "sha512", "encoding": "base64",
                 "note": "PayWay has no transport-level auth scheme; `hash` is a body field." },
  "body": { "req_time": "20261005T093112", "merchant_id": "ec47••••", "tran_id": "TX-1",
            "amount": "3.00", "currency": "USD", "payment_option": "abapay_khqr",
            "callback_url": "aHR0cHM6Ly…", "lifetime": 6, "qr_image_template": "template2",
            "hash": "«REDACTED:base64:88»" },
  "normalization": [
    { "field": "amount", "from": 3, "to": "3.00", "rule": "AMT-001 USD → 2dp string", "source": "official" },
    { "field": "callback_url", "from": "https://…", "to": "base64", "rule": "URL-002 base64-encoded", "source": "official" },
    { "field": "lifetime", "from": 360, "to": 6, "rule": "QR-LIFE-001 seconds → minutes", "source": "official",
      "conflict": { "repoBehaviour": "seconds (QR_LIFETIME_MIN_SECONDS=180)", "officialDocs": "minutes, min 3, max 30 days",
                    "status": "UNVERIFIED", "action": "confirm with ABA; see knowledge/rules/conflicts.yaml#QR-LIFE-001" } },
    { "field": "req_time", "rule": "TIME-001 UTC YYYYMMDDHHmmss at signing time, never cached", "source": "official" }
  ],
  "signature": {
    "fieldOrder": ["req_time","merchant_id","tran_id","amount","items","first_name","last_name","email","phone",
                   "purchase_type","payment_option","callback_url","return_deeplink","currency","custom_fields",
                   "return_params","payout","lifetime","qr_image_template"],
    "fieldOrderSource": "official:developer.payway.com.kh/qr-api-14530840e0 (retrieved 2026-10-05)",
    "emptyFieldRule": "unset fields occupy their position as '' — never omitted",
    "preimage": { "available": true, "printed": false, "reason": "contains the merchant API key? no — preimage is key-free",
                  "howToPrint": "--show-preimage" },
    "preimageSha256": "9f2c…",           // safe correlation value
    "hashOutput": "«REDACTED:base64:88»"
  },
  "merchantRef": null, "transactionId": "TX-1", "currency": "USD", "amount": "3.00",
  "callbackUrl": "https://…",
  "validation": { "ok": true, "errors": [], "advisories": [ { "id":"QR-LIFE-002", "severity":"warning", "message":"…" } ] },
  "next": [ { "command": "payway request send qr.create --amount 3.00 …", "reason": "…" } ]
}
```
**Redaction rules (explicit, allow-list):**
1. `hash`, `merchant_auth`, `beneficiaries` (ciphertext), any `X-PAYWAY-HMAC-SHA512` value → `«REDACTED:<encoding>:<length>»`. Never printed under any flag.
2. `apiKey`, `partnerApiKey`, private keys, `pwt`, payment tokens, provider API keys → never present in the document at all (not merely masked); asserted by a canary test.
3. `merchant_id`, `ctid`, `request_id` → masked beyond the first 4 characters by default; `--reveal-ids` (never `--reveal-secrets`) unmasks **non-secret identifiers only**.
4. Buyer PII (`first_name`, `last_name`, `email`, `phone`) → masked by default; `--reveal-pii` unmasks; the journal's `digest` mode never records them.
5. The **preimage** (`b4hash`) is key-free by construction and is the single most useful "Wrong hash" diagnostic — printed **only** with `--show-preimage`, always to stdout in the JSON document, never in human mode without an explicit flag, and never written to the journal.
6. `--output json` output must be safe to paste into an issue: a `redaction: { applied: [...], version: "2.0" }` block states what was withheld.

**Required configuration:** credentials for a faithful `hash`/`req_time`; `--no-sign` produces the body and field order without credentials (still useful, and the only mode that works with zero config).
**Interactive/non-interactive:** never prompts; missing required inputs fail with `PW-VAL-011` naming the flag.
**Exit codes:** `0` valid; `1` local validation failed (with `validation.errors` populated — this is the *point*: `request inspect` is the pre-flight gate); `6` if the resolved environment is production and `--confirm-production` was not supplied (inspect never sends, but it must not silently normalise a production request).
**Dependencies:** the operation registry (`capabilities`), `knowledge/rules/*` (§11/§21.2), the domain payload builders refactored to be **pure** (`buildXPayload(params, config) → {body, fieldOrder, normalization}` — most already are, e.g. `buildPurchasePayload`), and the transport's endpoint/method/content-type table.
**AI-agent suitability:** very high — read-only by default, deterministic, and it turns "read `src/domains/checkout.ts` to learn the field order" into one command. It is also the correct grounding tool for a `payway-authentication` skill (§23).

### 9.5 Remaining commands — compact specification

| Command | Purpose | Key flags | Required config | Interactive | stdout (json) | Exit | Notes |
|---|---|---|---|---|---|---|---|
| `init` | bootstrap project | `--mode demo\|sandbox`, `--template framework\|first-payment`, `--force`, `--output json` | none | wizard on TTY | `{written[],skipped[],envIssues[],next}` | 0/1 | Must write a **complete** `.env.example` (~30 vars, grouped, commented) — fixes F3 |
| `configure` | write config safely | `--set key=value`, `--khqr`, `--profile`, `--scope project\|user`, `--dry-run` | none | masked prompts (`readMaskedInput` already exists) | resolved config, secrets masked | 0/1 | Never writes to a tracked path (`DATA-003`); refuses `.env` inside a git tree without `--allow-tracked-env` |
| `env current` | prove where you are | `--output json` | none | no | `{environment,endpoint,credentialSource,profile,guard:{production:bool}}` | 0 | The single cheapest production-safety win |
| `env use <env>` | switch | `--profile`, `--persist` | none | confirm for production | new resolved env | 0/1/6 | Writes `PAYWAY_ENV` to project `.env` **and** runs CRED-003 coherence |
| `env guard` | show/enable guards | `--require-confirm-production`, `--output json` | none | no | guard policy | 0 | Policy lives in `knowledge/rules/environments.yaml` |
| `capabilities` | machine catalogue | `--output json` | none | no | `[{command,readOnly,mutating,moneyMoving,requiresCredentials,requiresRsa,requiresNetwork,environmentsAllowed,verified,aliases[]}]` | 0 | Generated from the live registry (reuse `completions/introspect.ts`) |
| `products` | product + readiness matrix | `--output json` | none | no | §26 matrix as data | 0 | Source: `knowledge/rules/products.yaml` |
| `rules list/check` | inspect & enforce PayWay rules | `--id`, `--category`, `--source`, `--against <request.json>`, `--output json` | none | no | rule records `{id,statement,source,enforcement,severity,conflict?}` | 0/1 | §11; `check` is the programmatic rule engine |
| `validate config\|request\|integration` | generalise the stub | `--request <json>`, `--operation`, `--output json` | none | no | `{errors[],advisories[]}` | 0/1 | Fixes C11; `validate integration` = `go-live check --category validation` |
| `sandbox info` | what sandbox is/isn't | `--output json` | none | no | products available, simulator facts, expiry, differences-from-production, **cannot-reproduce list** | 0 | Source: `knowledge/rules/environments.yaml` |
| `sandbox verify` | prove sandbox works | `--live`, `--output json` | sandbox creds | no | probe results incl. `paywayCode` | 0/2/3 | Replaces `doctor --live` for the sandbox-specific story |
| `sandbox test` | scripted sandbox scenarios | `--scenario approved\|declined\|pending\|expired\|duplicate`, `--card` | sandbox creds | confirm before money moves | per-scenario results | 0/2/3 | Uses `SANDBOX_TEST_CARDS`; **must refuse** when env=production |
| `qr create` | online QR | `-a/-c/-t/--lifetime/--template/--callback-url/--payout/--items/-y/--no-poll/--png/--output json` | creds | wizard | §9.1 + `artifacts.qrPngPath` | 0/1/2/3 | Existing `PaymentCommandResult` becomes the standard |
| `qr offline` | local KHQR, no API | `--bakong-id/--mid/--mcc/--name/--city/--payway-data/--amount/--expiry/--out` | KHQR config | no | `{payload,crcValid,isStatic,tlv[],pngPath}` | 0/1 | Explicitly separate from `qr create` (fixes §6.2) |
| `qr customer` | Customer-Module dedicated KHQR | `--customer-id …` | creds | no | as `qr create` + raw-body callback contract note | 0/1/2/3 | Route-specific verification contract surfaced |
| `qr soundbox` | `request-qr` | as today | creds | confirm | + `verified:"spec"` banner | 0/1/2/3 | Marked **UNVERIFIED** everywhere |
| `qr inspect <payload\|png>` | decode | `--file`, `--output json` | none | no | TLV breakdown, CRC check, merchant/amount/expiry | 0/1 | `inspectKhqrPayload` already exists — expose it |
| `transaction current` | sticky last id | `--set`, `--clear`, `--output json` | none | no | `{transactionId,createdAt,source}` | 0 | Data-root scoped; fixes C13 for non-TTY agents |
| `transaction verify` | assert, don't eyeball | `--id`, `--expect-amount`, `--expect-currency`, `--expect-status approved`, `--timeout` | creds | no | `{observed,expected,matches[],mismatches[]}` | 0/5 | Converts QUICKSTART step 14 into a gate |
| `transaction explain` | human/agent status narrative | `--id`, `--output json` | journal or creds | no | lifecycle + next action | 0 | Wraps `explainTransaction`/`paymentNextStep` |
| `webhook listen` | the listener | `--port/--host/--storage/--tunnel/--url/--forward-to/--forward-headers/--print-url/--non-interactive/--output ndjson` | none | prompts today | ndjson per delivery | 0/4 | Renamed from `setup-webhook`; `--print-url` emits ONE copy-pasteable line (fixes §6.1 step 8) |
| `webhook fixtures` | on-disk corpus | `--event`, `--out`, `--output json` | none | no | fixture list + paths | 0 | §19 |
| `diagnose` | symptom → ranked causes | `--symptom`, `--code`, `--http-status`, `--id`, `--merchant-ref`, `--from-journal`, `--output json` | none (journal optional) | guided on TTY | `{confirmed[],likely[],possible[],unknown,requiredEvidence[],neverFabricated:true}` | 0 | §15.5 |
| `go-live check` | executable readiness | `--category`, `--evidence <file>`, `--output json` | none | no | §36 | 0/5 | |
| `logs tail/redact/share` | observability | `--level`, `--follow`, `--redact`, `--out` | none | no | ndjson | 0 | §16; `share` produces a **guaranteed-redacted** bundle |
| `refund create` | as today + env gate | `-t/-a/-c/--no-preflight/-y/--confirm-production` | creds+RSA | confirm | §9.1 | 0/1/2/3/6 | |
| `payout create` | as today + env gate | `--entries/--currency/-y/--confirm-production` | creds+RSA | confirm | §9.1 | 0/1/2/3/6 | Money-out; strictest gate |

---

## 10. Configuration and Environment Architecture

### 10.1 What exists today

| Mechanism | Location | Notes |
|---|---|---|
| Explicit SDK config object | `PayWayConfig` (`src/client.ts:105-230`) | ~25 fields incl. `strictValidation`, `mutationRetryPolicy`, `circuitBreaker`, `rateLimitRules`, `journal`, `logLevel/logFormat`, hooks, `allowPrivateCallbackHosts`, `khqr` |
| Environment variables | `PayWay.resolveConfig` reads `PAYWAY_ENV`, `PAYWAY_SANDBOX`, `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_TIMEOUT`, `DEBUG_PAYWAY`, `PAYWAY_STRICT_VALIDATION`, `PAYWAY_PARTNER_ID`, `PAYWAY_PARTNER_API_KEY` | `envValidator.KNOWN_VARS` lists 20; ≥12 more are read elsewhere (P1-04) |
| `.env` (project) | `src/cli/dotenv.ts` — loaded at CLI start, supports multi-line quoted PEMs | **CLI-only**: the SDK library does not read `.env` (correct, but undocumented at the point of confusion) |
| Profiles (user) | `~/.config/aba-payway-sdk/profiles.json`, `0600`, max 8, atomic tmp+rename, per-profile `environment`, optional `khqr` block | **Plaintext credentials** — disclosed in README. Precedence: `--profile` → `PAYWAY_PROFILE` → `defaultProfile` → project/ambient env; `activateProfile` is **fallback-only** (`setIfMissing`) so explicit env wins |
| Data root | `PAYWAY_DATA_DIR` or `<APPDATA|~/.config>/aba-payway-sdk/data` | Shared by journal, linked tokens, webhook captures; surfaced as `doctor --json .dataRoot` |
| Templates | `src/config/templates/{express,nextApp}.ts`, `src/cli/templates/first-payment/` | Scaffolded by `init` |
| Framework detection | `src/config/frameworkDetector.ts` | Advisory only (correctly never a red failure) |

**Precedence today (prose, `QUICKSTART.md` §3):** `--profile` → `PAYWAY_PROFILE` → saved default profile → project `.env` → ambient env. But the *code* precedence differs by layer: `resolveConfig` is `explicit config → process.env` (and `.env` is only in `process.env` because the CLI loaded it first), while `activateProfile` only fills gaps. So for the SDK library the effective order is `explicit → env`, and for the CLI it is `explicit → env(incl. .env) → profile-fallback`. **These are not the same order, and neither is written down as code.**

### 10.2 Target configuration model

One schema, one resolver, one precedence — implemented once, consumed by SDK, CLI, MCP, agent, doctor, and docs.

```
CLI flag  >  operation-scoped env (PAYWAY_*)  >  project config (.payway/config.json|.jsonc)
          >  project .env  >  user profile (~/.config/aba-payway-sdk/profiles.json)
          >  user config (~/.config/aba-payway-sdk/config.json)  >  SDK defaults
```
Rules:
1. **Secrets and non-secrets are separate documents.** `.payway/config.json` (committable) holds `environment`, `defaultCurrency`, `timeout`, `retry`, `logging`, `callbackUrl`, `dataRoot`, `khqr` non-secret fields, `guard` policy. Secrets (`apiKey`, `publicKeyPem`, `partnerApiKey`) are **never** written there — only referenced by `credentialRef: { source: "env"|"profile"|"file"|"command", key: "PAYWAY_API_KEY" }`. A `SEC-001`-style gate fails if a secret literal appears in a tracked config file.
2. **`.payway/config.json` is schema-validated** (the repo already depends on `ajv`) and unknown keys are an error, not a silent ignore — this is what makes typo'd configuration discoverable (the same instinct as `W-PAYWAY-UNKNOWN-VAR`, but applied to files, not just env).
3. **`env` registry is generated, single-sourced.** `knowledge/rules/env-vars.yaml` → generated `src/config/env-registry.ts` (name, type, secret?, default, appliesTo[sdk|cli|agent|mcp|journal|webhook|khqr], docRef, since). `envValidator.KNOWN_VARS`, `doctor ENV-003`, `.env.example`, `docs/guides/02`, and `configure --set` autocomplete all read that one file. **This structurally prevents P1-04 from recurring.**
4. **`payway config --json` prints the resolved configuration with provenance per key**: `{key, value|masked, source: "flag"|"env"|"dotenv"|"profile"|"user"|"default", sourceDetail: "PAYWAY_API_KEY (process env)"}`. Precedence stops being a sentence in a doc and becomes observable.
5. **Environment is a first-class object**, not a string: `{ name: 'sandbox'|'production'|'custom', endpoint, requiresConfirm: bool, allowedOperations: [...], credentialRef }` from `knowledge/rules/environments.yaml`.

### 10.3 Configuration requirements (target)

| Concern | Keys | Secret? | Default | Validation |
|---|---|---|---|---|
| environment | `environment`, `baseUrl` | no | `sandbox` | enum + endpoint coherence (ENV-002) |
| merchant identity | `merchantId` | no (identifier) | — | required, ≤30 chars (OFFICIAL max) |
| signing | `apiKey` | **yes** | — | required for merchant calls, ≥16 chars advisory |
| encryption | `publicKeyPem` | **yes** (private counterpart never held) | — | PEM shape + 1024-bit; required iff route needs RSA |
| partner | `partnerId`, `partnerApiKey` | **yes** (key) | — | self-activation only; must not be mixed with merchant calls |
| endpoints | `baseUrl`, per-operation overrides | no | `BASE_URLS[env]` | https only |
| callbacks | `callbackUrl`, `returnUrl`, `cancelUrl`, `continueSuccessUrl`, `returnDeeplink` | no | — | public HTTPS, private-host refusal (`validatePublicHttpsUrl` already does this well) |
| money | `defaultCurrency`, `amountFloorPolicy` | no | `USD` | USD/KHR; floor per §11 AMT-002 |
| transport | `timeout`, `maxRetries`, `retryDelayMs`, `mutationRetryPolicy`, `circuitBreaker`, `rateLimitRules`, `rateLimitThrottling`, **`tlsCaFile`** (NEW) | no | 30000 / 3 / 3000 / `none` for mutations | positive/integer ranges (already validated) |
| validation | `strictValidation`, `advisoryIgnore[]` | no | `false` | only `source:'official'` advisories promote (§7.3) |
| logging | `logLevel`, `logFormat`, `logSink`, `redactionLevel` | no | `info`/`text` | enum |
| journal | `journal.mode/dir/maxAgeDays/maxBytes` | no | CLI on / SDK off | retention advisory (DATA-002) |
| storage | `dataRoot`, `storageBackend` | no | platform app-data | writable, outside git tree (DATA-003) |
| agent | `PAYWAY_AGENT_API_KEY`, `provider`, `model`, `capabilityMode`, `acknowledgePrivacy` | **yes** (key, env-only, never stored) | — | existing privacy ack flow is correct — keep |
| guard | `requireConfirmProduction`, `allowProductionOperations[]`, `blockOperationsInSandbox[]` | no | `true` / `[]` / `[payout, refund, payment-link.void, close-transaction, beneficiary.*]` when profile env=sandbox | §10.4 |

### 10.4 Environment safety (target design)

Today: `sandbox` and `production` differ only by base URL; `-y` skips confirmation regardless of environment; there is no `env` command; `profiles add` stores both plaintext in one file. The agent layer *does* have the right model (`src/agent/risk.ts`), so the fix is to **lift that model into shared code and apply it to the CLI**.

1. **Shared guard module** `src/core/env-guard.ts` exporting `classifyEnvironment(ctx)`, `assertOperationAllowed(op, ctx)`, `requireProductionConfirmation(op, ctx, flags)`. `src/agent/risk.ts` and `src/cli.ts` both consume it — one policy, two surfaces.
2. **Every mutating command resolves the guard before doing anything else.** In production: `--confirm-production` required (exit `6` without it); `-y` does **not** substitute. On TTY, a red banner + typed confirmation of the merchant ID. Off TTY, only the explicit flag works (CI-safe non-interactive override, as required).
3. **Persistent environment indicator.** Human mode prints a one-line prefix on every mutating command: `[production · mc ec47••••]`. Machine mode puts it in `context.environment` (already there) plus `context.guard`.
4. **Credential↔environment coherence (CRED-003).** Profiles carry `environment`; a sandbox profile + production endpoint (or the reverse) is a **blocker** in `doctor` and a **hard refusal** at command start, because it is the single most destructive misconfiguration available.
5. **Sandbox-only operations are refused in production and vice versa.** `sandbox test-cards`, `sandbox beneficiaries`, `sandbox test`, `demo`, and all `*-probe` scripts must refuse when `environment === 'production'`; `self-activation` and `request-qr` (both `verified: 'spec'`) must require an explicit `--allow-unverified` in production.
6. **No example, test, fixture, or doc command may target production.** Enforced by a test that scans `examples/`, `docs/`, `skills/`, `knowledge/`, and `payway-boilerplate/` for `checkout.payway.com.kh` outside an explicitly labelled "production reference" context (today the Postman collection's "Environments" section lists the production URL as a switch — acceptable, but it must be gated behind the same `--confirm-production` mental model in prose).
7. **`payway env current` in every golden path.** The cheapest possible protection: one read-only command that prints environment + endpoint + credential source + guard state, recommended as the first line of every runbook and every agent workflow.

---

## 11. PayWay Rules and Validation Matrix

### 11.1 How rules are represented today

| Representation | Where | Count | Enforced at runtime? |
|---|---|---|---|
| TS constants with provenance comments | `src/constants.ts` (398 L) | ~25 | Partially (they are *data*; validators consume some) |
| Imperative validators | `src/utils.ts` (26 functions), per-domain checks | ~40 | **Yes** |
| Advisory-only limits | `warnAdvisory` call sites | ~12 | Warn / throw-if-strict (§7.3) |
| Generated machine registry | `docs/error-codes.json` (96 codes, `sandboxVerified`, `evidence`, `observedOn`) | 96 | **Yes** for `explain`; **not** consumed by validators |
| OpenAPI + `x-hmac-fields` | `payway-openapi/**`, `src/types.ts` (generated) | 28 endpoints | Types only; **no request/response runtime validation against the schema** despite `ajv` being a dependency |
| Prose | `docs/guides/*` (22 chapters), `llms.txt` "most often gotten wrong", `AGENTS.md`, `.agents/AGENTS.md`, `HANDOFF.md`, 35 skills | hundreds | No |
| Tests | `src/__tests__/knowledge-conformance.test.ts`, `hash-order-hints.test.ts`, `validation*.test.ts`, `mutation-retry-policy.test.ts` | — | Gate drift between some pairs |

**Structural problem:** a single rule (e.g. "QR `lifetime` minimum") is restated in `constants.ts` (value + comment), `utils.ts` (validator + message), `domains/qr.ts` (call site), `src/cli.ts` (flag help text), `docs/guides/07`, `knowledge/qr-handling.md`, `docs-packaged/…`, `skills/aba-payway-qr/SKILL.md`, `.zcode/skills/…`, and `llms.txt` — **ten locations, no generator, no cross-check.** P0-03 exists precisely because nothing compares those ten against the official page.

### 11.2 PayWay Rules Matrix

`Source` legend: **OFFICIAL** = retrieved from `developer.payway.com.kh` on 2026-10-05 · **ARCHIVED** = `docs/archive/Default module.openapi.json` (ABA-shared spec copy, 2021-era) · **SANDBOX** = repo's own live sandbox evidence (`docs/internal/SANDBOX-FINDINGS.md`) · **RELAY** = ABA integration-team / Telegram-bot relay recorded by the repo · **REPO** = repo implementation choice · **UNVERIFIED** = no authoritative confirmation.
`Enforcement` legend: **HARD** = throws · **ADV** = `warnAdvisory` (warn, or throw under `strictValidation`) · **WARN** = `console.warn` once per process · **DOC** = prose only · **NONE**.

| Rule | Source | Current enforcement | Target enforcement | CLI validation | SDK validation | Test required | Severity |
|---|---|---|---|---|---|---|---|
| **QR-001** `generate-qr` hash = base64(HMAC-SHA512(concat of 19 fields in order)) | **OFFICIAL** (qr-api-14530840e0) | HARD (field list matches official exactly) | unchanged + `rules.yaml` provenance | `request inspect` | `GENERATE_QR_HASH_FIELDS` | ✅ exists (`hash-order-hints`) | — |
| **QR-002** unset hash fields occupy their position as `''`, never omitted | **OFFICIAL** | HARD (`generateHmac`) | unchanged | `request inspect --show-preimage` | `auth.generateHmac` | ✅ exists | — |
| **QR-003** `req_time` = UTC `YYYYMMDDHHmmss`, generated at signing time, never cached | **OFFICIAL** | HARD (`formatRequestTime`) | unchanged | `request inspect` | `utils.formatRequestTime` | ✅ exists | — |
| **QR-004** `tran_id` ≤ 20 chars | **OFFICIAL** | HARD (`validateTransactionId`) | unchanged | `validate`, `qr create` | ✅ | ✅ exists | — |
| **QR-005** `tran_id` charset `[a-zA-Z0-9-]` | REPO (official says only "unique transaction ID") | HARD | **ADV** + `source:'repo'` label — the repo is stricter than documented | `validate` | ✅ | ✅ exists | P3 |
| **QR-006** `tran_id` < 5 chars | REPO (gateway enforces `{5,24}` on *request_id/ctid*, not tran_id) | WARN once/process | ADV with per-client dedupe (§7.3) | — | ✅ | ✅ exists | P2 |
| **QR-007** `merchant_id` ≤ 30 chars | **OFFICIAL** | **NONE** | HARD (cheap, prevents a class of wrong-credential errors) | `doctor CFG-001` | `resolveConfig` | ➕ new | P2 |
| **QR-008** `amount` = formatted decimal **string**, USD 2dp / KHR integer, must match the hashed value | **OFFICIAL** | HARD (`formatAmount`) | unchanged | `request inspect` shows normalization | ✅ | ✅ exists | — |
| **QR-009** amount minimum 100 KHR / 0.01 USD | **OFFICIAL** ("Minimum: 100 KHR or 0.01 USD") | **ADV** (`validateAmountFloor`) | **HARD** — a documented gateway minimum is not an opinion | `validate`, `qr create` | `utils.validateAmountFloor` | ➕ strengthen | **P1** |
| **QR-010** `currency` ∈ {KHR, USD} | **OFFICIAL** | HARD (`validateCurrency`) | unchanged | ✅ | ✅ | ✅ exists | — |
| **QR-011** `currency` is **not case-sensitive** | **OFFICIAL** | HARD-reject on `usd` (stricter than the gateway) | normalise-then-validate; label the strictness as REPO | `resolveCurrency` (one helper — their audit found **7 spellings**) | ✅ | ➕ new | **P2** |
| **QR-012** `payment_option` for QR ∈ {`abapay_khqr`, `wechat`(USD only), `alipay`(USD only)} | **OFFICIAL** | **NONE** for membership; ADV only for the USD-only rule | HARD membership check | `qr create`, `rules check` | `domains/qr.ts` (add) | ➕ new | **P1** (P2-05) |
| **QR-013** `lifetime` unit = **minutes**; required; min 3; max 30 days; default 30 days | **OFFICIAL** | **CONTRADICTED**: `QR_LIFETIME_MIN_SECONDS=180`, `QR_LIFETIME_MAX_SECONDS=120d`, optional, `--lifetime` in seconds | **Resolve the conflict, then HARD.** Until resolved: emit a `conflict` record, keep both interpretations available behind an explicit `--lifetime-unit`, and mark `UNVERIFIED` | `qr create`, `request inspect`, `doctor` | `validateQrLifetime` | ➕ new + conflict test | **P0** |
| **QR-014** `callback_url` base64-encoded, ≤255 | **OFFICIAL** | HARD (encode) / ADV (length) | HARD for length too | `request inspect` | `encodeBase64IfNeeded` | ✅ partial | P2 |
| **QR-015** `callback_url` must be publicly reachable HTTPS | REPO (sensible; gateway returns code 6 for non-whitelisted domains per RELAY) | HARD (`validatePublicHttpsUrl`, private-host refusal, `allowPrivateCallbackHosts` escape) | unchanged — this is a model validator | `doctor CFG-005` | ✅ | ✅ exists | — |
| **QR-016** `items` ≤10 entries, base64 JSON, ≤500 encoded chars | **OFFICIAL** (10 items, 500 max length) | ADV | HARD for count/length (documented caps) | `request inspect` | ✅ | ✅ exists | P2 |
| **QR-017** `qr_image_template` ∈ 7 known values | SANDBOX (2026-08-30) | HARD (`QR_TEMPLATE_NAMES`) | unchanged, `source:'sandbox'` | `qr templates` | ✅ | ✅ exists | — |
| **QR-018** KHQR generation rate limit 10 req/s per MID | RELAY (2026-10-03) | HARD (client token bucket) | unchanged, `source:'relay'` + `UNVERIFIED` against official docs | `request inspect` shows `transportPolicy.rateLimit` | ✅ | ✅ exists | P3 |
| **PUR-001** purchase hash = 24 official fields; `view_type`/`payment_gate` **not** hashed | **OFFICIAL** (purchase-14530820e0) | HARD via a **27-field superset** that is byte-identical when `ctid`/`token_flag`/`frequency` are unset | unchanged + explicit provenance note; keep the neutrality test | `request inspect` | `PURCHASE_HASH_FIELDS` | ✅ exists (`cof-subscription-parity`) | — |
| **PUR-002** subscription hash positions for `ctid` (after `items`), `token_flag`, `frequency` (appended) | SANDBOX (2026-09-05: "the documented 26-field order is rejected with Wrong Hash") | HARD | keep HARD but tag `source:'sandbox'`, `officialConfirmation: pending`, and surface in `rules list --source sandbox` | `request inspect` | ✅ | ✅ exists | **P1** (UNVERIFIED against official) |
| **PUR-003** purchase `payment_option` ∈ {`cards`, `abapay_khqr`, `abapay_khqr_deeplink`, `alipay`, `wechat`, `google_pay`} | **OFFICIAL** | **CONTRADICTED**: `PURCHASE_PAYMENT_OPTIONS` = {`cards`, `abapay`, `abapay_deeplink`, `abapay_khqr_deeplink`, `google_pay`} (from **ARCHIVED**) → ADV normally, **HARD throw under `strictValidation`** | Replace with the official enum; move `abapay`/`abapay_deeplink` to a `legacy/archived` set that is ADV-only and labelled | `checkout create`, `rules check` | `constants.ts` | ➕ new (official-doc conformance test) | **P0** |
| **PUR-004** purchase `lifetime` = minutes, min 3, max 43200 | **OFFICIAL**/ARCHIVED (consistent) | HARD min (error 69) / ADV max | unchanged | ✅ | `validatePurchaseLifetimeMinutes` | ✅ exists | — |
| **PUR-005** `google_pay` requires `googlePayToken` | **OFFICIAL**-adjacent (RELAY: online Google Pay reported unavailable) | HARD (token) + DOC (availability) | HARD + `capabilities.verified:'relay'` | ✅ | ✅ | ✅ exists | P3 |
| **PUR-006** split-payout keys are `{acc, amt}` on purchase/COF-charge/pre-auth-payout/payment-link, `{account, amount}` on QR/payout | SANDBOX (403 code 35 before W1-5) | HARD (`validatePayoutEntryShape`) | unchanged + `rules.yaml` per-endpoint key map (this is exactly the kind of rule an agent will otherwise invent) | `request inspect` | ✅ | ✅ exists | — |
| **PUR-007** payout entries total must equal the transaction/link amount | REPO/SANDBOX | HARD on payment-link; inline in `cli.ts:3557-3593` elsewhere | move to `core/money.ts`, HARD everywhere | `refund create`, `payout create` | ✅ | ✅ partial | **P2** (policy in the CLI monolith) |
| **CB-001** online checkout callback: sort body keys ascending, concat values (JSON-encode objects/arrays), HMAC-SHA512, base64, compare to `X-PAYWAY-HMAC-SHA512` | **OFFICIAL** (Ecommerce Checkout page, PHP sample) | HARD (`verifyCallbackDetailed`, `timingSafeEqual`) | unchanged | `webhook verify` | ✅ | ✅ exists | — |
| **CB-002** invalid signature → respond **401** and do not process | **OFFICIAL** (sample returns 401) | DOC (examples return 403 in `auth.ts` JSDoc, 200-then-discard elsewhere) | align docs+examples to 401, or document the divergence as REPO | `webhook listen` default | fixtures | ➕ new | P2 |
| **CB-003** `hash` field must be stripped before sorted-key verification | REPO (necessary consequence) | OPT-IN (`stripHash`, default `false` "for backward compatibility") | **default `true`** at 2.0.0 with a migration note — the current default makes the correct call the non-obvious one | `webhook verify` | ✅ | ✅ exists | **P1** |
| **CB-004** Customer Module KHQR: HMAC over the **raw request body bytes**, no re-serialization | RELAY (2026-10-03) | HARD (`verifyCallbackSignatureRaw`) | keep, tag `source:'relay'`, `officialConfirmation: pending` | `webhook verify --raw` | ✅ | ✅ exists | P2 (UNVERIFIED vs official) |
| **CB-005** payment-link pushbacks are **unsigned** `{tran_id, status:0, merchant_ref_no}`; verify by status lookup | SANDBOX (live-verified 2026-09-06) | HARD-by-omission (fixtures carry no hash; docs emphatic) | unchanged + `classifyCallback` surfaced in CLI | `webhook trigger --event payment-link.pushback` | ✅ | ✅ exists | — |
| **CB-006** offline KHQR notifications have **no** signature contract | RELAY | DOC + fixture design | unchanged | ✅ | ✅ | ✅ exists | — |
| **CB-007** callbacks are **single best-effort**, no guaranteed retry; expect 200 within ~5 s | RELAY (2026-09-12) + OFFICIAL-adjacent | DOC + journal reconcile honesty rule | unchanged; add `go-live` gate "status-query fallback implemented" | `go-live check` | — | ➕ new (doc-conformance) | **P1** |
| **CB-008** pushback fires only on success; multiple pushbacks per `tran_id` are legitimate as status changes; any 2xx is an ACK | RELAY (T-19/FU-04) | HARD in `journal reconcile` (replay keys on `(tran_id, status)`) | unchanged | `journal reconcile` | ✅ | ✅ exists | — |
| **CB-009** callback source IPs `103.108.218.76/.2` (+ optional /24); no wildcard domains (403 code 6) | RELAY | DOC only | **ADV/optional allow-list helper** + `doctor WEB-004`; explicitly labelled RELAY, never a hard requirement (IP allow-listing payments is fragile) | `webhook listen --log-source-ip` | — | ➕ new | P3 |
| **TX-001** `payment_status_code`: 0 APPROVED, 2 PENDING, 3 DECLINED, 4 REFUNDED, 7 CANCELLED | RELAY (confirmed by ABA integration team 2026-09-12) + SANDBOX | HARD (`PAYMENT_STATUS_CODES`) | unchanged; `rules.yaml` + generated `PAYMENT_STATUS_LABELS` | `status`, `explain`, `transaction get` | ✅ | ✅ exists | — |
| **TX-002** code 0 is **ambiguous**: APPROVED *and* PRE-AUTH | SANDBOX | DOC (comment) + `PAYMENT_STATUS_CODES.PRE_AUTH = 0` alias | keep the alias but require the `payment_status` **string** to disambiguate; add a `lifecycle()` helper that refuses to return `approved` from the numeric code alone | `transaction explain` | `payment-lifecycle.ts` | ➕ new | **P2** (footgun) |
| **TX-003** there is **no** EXPIRED or CLOSED remote status; expired/closed read PENDING (possibly ~24 h) | RELAY + SANDBOX (campaign W4-1) | HARD-by-omission + DOC + local `closed` flag policy | unchanged; `go-live` gate "local expiry policy implemented" | `go-live check` | ✅ | ✅ exists | — |
| **TX-004** `check-transaction` sees only the last **7 days** and excludes KHQR | RELAY (2026-10-03) | DOC + `explain` hints | **ADV** when a lookup misses and the id is old/KHQR-shaped; `diagnose` symptom "transaction not found" | `transaction get`, `diagnose` | ✅ | ➕ new | **P1** |
| **TX-005** `transaction-detail` rate limit 10/min; ~5 s post-creation indexing lag | RELAY/SANDBOX | HARD (client bucket) + CLI `--wait` | unchanged | ✅ | ✅ | ✅ exists | — |
| **TX-006** `transaction-list` `from_date`/`to_date` are **gateway UTC+7**; a UTC-derived window silently returns 0 rows | SANDBOX (2026-09-05) | HARD (`gatewayDayWindow` default) + DOC | unchanged + `diagnose` symptom "list returned 0 rows" | `transaction list`, `diagnose` | ✅ | ✅ exists | — |
| **TX-007** `check-transaction` rate limit 600/s; `refund` 500/s; `transaction-list` 50/min; `get-transactions-by-mc-ref` 10/min | REPO (client defaults; only the KHQR 10/s figure is published) | HARD (client buckets) | label each rule's source; make the table data-driven from `rules.yaml` | `request inspect` | ✅ | ✅ exists | P3 |
| **TX-008** duplicate `tran_id`s are silently accepted and yield unpayable QRs | SANDBOX (W5-7) | HARD (mutation single-attempt) + CLI journal duplicate warning (`--allow-duplicate-id`) | unchanged — this is the repo's best safety work | `qr create` | ✅ | ✅ exists | — |
| **TX-009** repeat payments on one merchant ref get a **new** `tran_id`; never dedupe on `merchant_ref`; OVERPAID classification | RELAY (2026-10-03) | DOC + `get-transactions-by-ref` + `reconcile.cjs` skill script | `transaction by-ref` should classify OVERPAID explicitly | ✅ | ✅ | ➕ new | P2 |
| **RF-001** refund error codes (`PTL02/04/37/57/58/168/181/187`, …) | SANDBOX + RELAY | HARD (registry) + `explain` | unchanged | `explain`, `refund create` | ✅ | ✅ exists | — |
| **RF-002** refund amount ≤ original; multiple partial refunds allowed; below-minimum per-currency floor is **undocumented numerically** | RELAY (PTL37/PTL187) | HARD (`validateRefundAmount`, `computeRefundableBalance`) + DOC on the unknown floor | unchanged, keep the floor `UNVERIFIED` and say so | `refund check` | ✅ | ✅ exists | — |
| **RF-003** no standard refund after payout/split | RELAY | DOC | `go-live` gate + ADV when a payout is recorded for the transaction | `refund create` | ✅ | ➕ new | P2 |
| **COF-001** `link-account`/`link-card` require `request_id`, `ctid`, `token_flag`; `request_id`/`ctid` match `[a-zA-Z0-9]{5,24}` | **OFFICIAL**-adjacent + SANDBOX (§16) | HARD (`REQUEST_ID_PATTERN`, `validateRequestIdOrCtid`) | unchanged | ✅ | ✅ | ✅ exists | — |
| **COF-002** `link-card` is `application/x-www-form-urlencoded` and answers **HTML** (the hosted form *is* the success signal) | SANDBOX | HARD (content-type + `HostedPageOutcome` decoding of `302 → /add-card/<base64>`) | unchanged — exemplary evidence-driven work | `cof link-card` | ✅ | ✅ exists | — |
| **COF-003** token flags: linking `CITI_FLEX/CITO_FLEX/CITO_FIX/CITR_FLEX`; charging `CITU_FLEX/MITU_FLEX/MITU_FIX/MITR_FLEX/MITR_FIX`; **production** subsets differ | SANDBOX + RELAY (MITU_FIX/MITR_FLEX probes were invalid; Q41 re-probe pending) | HARD (`validateTokenFlag(scope)`) + separate production lists | keep, tag the two invalid flags `UNVERIFIED`, and **refuse them in production** | `cof link-*`, `env guard` | ✅ | ✅ exists | **P2** |
| **COF-004** unscheduled account tokens: rolling **90-day** expiry = latest of link/renew/last successful charge; scheduled tokens carry explicit `expired_at` | RELAY (FU-08) | HARD (`computeTokenExpiry`, `tokenExpiryStatus`, `expiredAt` persisted) | unchanged | `cof token list` | ✅ | ✅ exists | — |
| **COF-005** `token details` takes `request_id` **only**; `token remove` takes `ctid`+`token` (no request-id) | SANDBOX (§16) | HARD (per-endpoint required-option sets) | unchanged | ✅ | ✅ | ✅ exists | — |
| **PL-001** payment-link `expired_date` must be future and ≥5 min out (else PTL04) | SANDBOX | HARD (`PAYMENT_LINK_EXPIRY_MIN_SECONDS`) | unchanged | `payment-link create` | ✅ | ✅ exists | — |
| **PL-002** there is **no** EXPIRED link status: expired links read OPEN and the hosted page still returns 200 | SANDBOX (SANDBOX-FINDINGS §22) | DOC + local expiry policy | `go-live` gate + `diagnose` symptom "QR/link expired" | `diagnose` | — | ➕ new | **P1** |
| **PL-003** `void` is permanent, not idempotent (double-void → 403 PTL188 = terminal, not an error); bogus id → 403 code 96 | SANDBOX (§23, **undocumented endpoint**) | HARD (PTL188 mapped terminal) + confirm prompt | unchanged + `verified:'sandbox'`, `officialDocs:'absent'` | `payment-link void` | ✅ | ✅ exists | — |
| **PA-001** pre-auth default capture window 30 days; auto-release has **no** webhook | RELAY | HARD (`PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`) + DOC | `go-live` gate "capture scheduled or auto-release reconciled" | `pre-auth *` | ✅ | ✅ exists | — |
| **PA-002** over-capture ceiling 110% of original | REPO (CLI default `--max-over-capture-pct 110`) | HARD in CLI **only** | move to `domains/pre-auth.ts` so SDK consumers get it too | ✅ | ➕ move | ➕ new | **P2** |
| **PO-001** payout beneficiaries must be whitelisted; sandbox seeds `500000001…`; `000999888` is **not** whitelisted (403) | SANDBOX | HARD (`validateSandboxBeneficiary`, `listSandboxBeneficiaries`) + DOC | unchanged | `sandbox beneficiaries`, `payout create` | ✅ | ✅ exists | — |
| **PO-002** payouts settle immediately; chargebacks are card-only (ABA PAY/KHQR/WeChat final) | RELAY | DOC | `go-live` gate (dispute-handling policy) | `go-live check` | — | ➕ new | P2 |
| **SEC-001** key rotation is zero-overlap (PTL171/PTL175) | RELAY | DOC + `explain` | `doctor CRED-004` + `diagnose` symptom "sudden PTL02/PTL171" | `doctor`, `diagnose` | — | ➕ new | **P1** |
| **SEC-002** credentials/tokens must stay server-side; never in browser or AI-provider payloads | REPO/DOC (correct) | DOC + agent privacy layer (`src/agent/privacy.ts`, redaction before provider) | unchanged; add a `go-live` gate that greps the merchant's client bundle for `PAYWAY_` literals | `go-live check` | — | ➕ new | P2 |
| **SET-001** settlement is T+N, merchant-specific (T+3…15 working days observed); fees are separate debits; weekend/holiday shifts | RELAY (confirmed) + DOC | DOC only | **`go-live` gate + `reconcile` guidance**; explicitly not automatable without the merchant's report schema | `go-live check` | — | ➕ new | P2 |
| **SET-002** one merchant profile = one settlement currency | RELAY | DOC | ADV when a transaction currency ≠ profile settlement currency | `transaction verify` | — | ➕ new | P3 |
| **ENV-001** endpoints: sandbox `checkout-sandbox.payway.com.kh`, production `checkout.payway.com.kh` | **OFFICIAL** | HARD (`BASE_URLS`) | unchanged | `env current` | ✅ | ✅ exists | — |
| **ENV-002** sandbox cannot reproduce: declines (simulator accounts have none), settlement, chargebacks, real KHQR bank behaviour, production rate limits, key rotation | RELAY + DOC | DOC | `sandbox info --output json` as data | `sandbox info` | — | ➕ new | **P1** |
| **ENV-003** simulator accounts max 2 per merchant, 90-day hard expiry, PIN 1234/TEST1 | RELAY | DOC | `sandbox info` | `sandbox info` | — | ➕ new | P3 |
| **SPEC-001** `request-qr` (Soundbox) contract, incl. its 9-field hash order | **ARCHIVED** (spec's own `b4hash` is a corrupted copy-paste from generate-qr) | HARD (repo-derived order) + `--allow-unverified` absent | keep, but tag `verified:'spec'`, require `--allow-unverified` in production, and surface `UNVERIFIED` in `products`/`capabilities` | `qr soundbox` | ✅ | ✅ exists | **P1** |
| **SPEC-002** self-activation trio; HMAC SHA-256 except `get-mc-credential-info` (spec self-inconsistency) | **ARCHIVED** | HARD + labelled "spec-derived, not live-verified" in `--help` and the reference | unchanged — this is the correct way to ship an unverified surface | `self-activation *` | ✅ | ✅ exists | P3 |
| **SPEC-003** 6 legacy `/api/aof/*` + `v1/cof` endpoints deliberately not implemented | ARCHIVED (coverage audit: 28/33 implemented) | DOC (`capabilities` should say so) | `products --output json` lists them as `notImplemented` with a reason | `products` | — | ➕ new | P3 |

**Conflict register (must exist as data, not prose).** Today the three live conflicts are recorded in an `AGENTS.md` bullet ("CONFLICTS kept open"). Target: `knowledge/rules/conflicts.yaml` with `{id, rule, officialStatement, officialUrl, retrievedAt, repoBehaviour, sandboxEvidence, relayEvidence, status: open|resolved, impact, requiredConfirmation, owner}` — consumed by `rules list --conflicts`, `request inspect` (`normalization[].conflict`), `doctor`, `go-live check` (a `BLOCKER` while open on a money path), and the generated docs. **A conflict that is only in prose will be shipped again.**

### 11.3 What authoritative confirmation is required

For each `UNVERIFIED`/`RELAY`/`ARCHIVED` rule that gates money, the confirmation path is the same and should be tracked as an issue per rule:

1. Retrieve the current official page for the endpoint, record the URL + retrieval date + the exact quoted sentence, and store it in `knowledge/rules/evidence/<rule-id>.md`.
2. Where official docs are silent or contradictory (QR-013 lifetime unit, PUR-002 subscription hash positions, CB-004 raw-body HMAC, RF-002 numeric refund floor, COF-003 two invalid flags, TX-004 7-day window), send the question to the ABA integration contact **with a sandbox reproduction** and record the answer + channel + date.
3. Until confirmed: keep the current behaviour, tag it `UNVERIFIED`, surface it in `rules list`, `products`, `doctor`, and `go-live check`, and refuse to report "production ready" for any gate that depends on it.
4. Never promote a RELAY answer to `source:'official'` — the repo already distinguishes these; the fix is to make the distinction machine-readable and visible at the point of use.

---

## 12. Transaction Lifecycle Architecture

### 12.1 What exists

Four separate status vocabularies coexist, and the repo is explicit about why:

| Vocabulary | Values | Where | Purpose |
|---|---|---|---|
| Gateway numeric | `0, 2, 3, 4, 7` | `PAYMENT_STATUS_CODES` / `PAYMENT_STATUS_LABELS` | What the API returns |
| Gateway string | `APPROVED, PENDING, DECLINED, REFUNDED, CANCELLED` | same | Disambiguates code 0 (APPROVED vs PRE-AUTH) |
| First-payment lifecycle | `created, pending, approved, failed, unknown` | `src/payment-lifecycle.ts` (`paymentLifecycle`, `paymentNextStep`, `paymentArtifact`) | What a merchant branches on; documented in `QUICKSTART.md`, `docs/README.md`, and every skill |
| Session (legacy facade) | `TransactionSession.status` / `SessionStatus` | `src/schema.ts`, `src/server/index.ts` | `sdk.initiate` return shape |
| Journal event kinds | `command_started, exchange, poll, status_observed, artifact, callback, error` | `src/journal/types.ts` | Local observability |

Plus: `PendingPaymentStatus` / `TerminalPaymentStatus` (`src/domain-types.ts`), `PollAbortReason`, `CallbackKind` (`src/webhook/customer-callback.ts`), `PaymentLinkPushbackStatus`, `TokenExpiryStatus`, `KhqrPaymentStatus`.

**This is good design** — the five-concept separation the audit asks for (PayWay API response / payment result / callback event / transaction status / settlement status) is *already* the repo's stated doctrine: "Creation acceptance is not payment confirmation"; "a missing callback ≠ non-payment"; "PENDING ≠ alive"; "PRE-AUTH and REFUNDED are not approval to fulfill a new order"; "settlement is not established by an approved status".

### 12.2 What is weak

1. **The mapping is not one function.** `paymentLifecycle()` accepts a `payment_status` string; the numeric→string mapping is a separate constant; `classifyCallback` is a third; `PollTransactionResult.outcome` a fourth; `journal/intelligence.explainTransaction` a fifth. A developer must combine them by hand.
2. **`SessionStatus` (facade) and `PaymentLifecycle` (doctrine) are not reconciled.** `QUICKSTART.md` §6 uses `sdk.initiate` → `session` and then `paymentLifecycle(result.data?.payment_status)` — two vocabularies in six lines.
3. **`unknown` is a first-class state in prose but not in code.** There is no `PaymentOutcome` union that *forces* a caller to handle `unknown`; `paymentNextStep('unknown')` exists, but a merchant can still write `if (status === 'approved') … else …` and silently treat `unknown` as failure — the exact mistake that causes double-charges after a timeout.
4. **No event model.** Callbacks, poll observations, journal entries, and status reads are not unified into a `TransactionEvent` stream, so "what happened to this transaction, in order, from all sources" requires `journal timeline` (local-only) and cannot include gateway-side history (which does not exist — correctly documented).
5. **Retry/idempotency semantics are correct but invisible.** `MUTATION_ENDPOINTS` + `mutationRetryPolicy` + the journal duplicate warning implement the right policy; nothing exposes "is this operation safe to retry?" as an API an agent can query. `PayWayAPIError.retryable` is the only signal, and `pre-auth` is the only domain with an `idempotencyKey`.
6. **Duplicate-payment protection is local-only and CLI-only.** `journalSawCreateFor(transactionId)` warns in the CLI; an SDK consumer gets nothing. There is no exported `assertFreshTransactionId()` or attempt-store contract.
7. **Settlement status is entirely prose.** Correct (the repo cannot know the merchant's report schema), but there is no `SettlementStatus` type or `go-live` gate to make the boundary explicit in code.

### 12.3 Target lifecycle model

```ts
// core/lifecycle.ts — ONE model, exported, exhaustiveness-enforced
export type GatewayStatusCode = 0 | 2 | 3 | 4 | 7;
export type GatewayStatus = 'APPROVED' | 'PENDING' | 'DECLINED' | 'REFUNDED' | 'CANCELLED' | 'PRE_AUTH';
export type PaymentOutcome = 'created' | 'pending' | 'approved' | 'declined' | 'cancelled'
                           | 'refunded' | 'pre_auth' | 'expired_locally' | 'closed_locally' | 'unknown';
export interface TransactionState {
  outcome: PaymentOutcome;
  terminal: boolean;                 // gateway-terminal
  locallyTerminal: boolean;          // merchant policy (expiry/close) — never overwrites gateway state
  gateway: { code?: GatewayStatusCode; status?: GatewayStatus; raw?: unknown };
  source: 'status-query' | 'callback' | 'journal' | 'local-policy';
  observedAt: string;                // ISO, with the endpoint's timezone rule applied (docs/guides/22)
  correlationId?: string; traceId?: string; transactionId: string; merchantRef?: string;
  money: { amount: string; currency: 'USD' | 'KHR'; payerAmount?: string; payerCurrency?: string };
  fulfilment: { authorized: boolean; reason: string };   // approved ⇒ authorized ONLY after amount+currency+id match
  settlement: 'unknown' | 'pending' | 'expected' | 'matched' | 'discrepancy';  // never derived from a callback
}
export type TransactionEvent =
  | { kind: 'creation-accepted'; at: string; transactionId: string; correlationId: string }
  | { kind: 'creation-rejected'; at: string; code: string }
  | { kind: 'creation-unknown';  at: string; reason: 'timeout' | 'network' | 'circuit-open' }   // ← the state most SDKs lose
  | { kind: 'status-observed';   at: string; state: TransactionState; endpoint: string }
  | { kind: 'callback-received'; at: string; route: CallbackRoute; verified: boolean; verificationReason?: string }
  | { kind: 'callback-acknowledged'; at: string; httpStatus: number }
  | { kind: 'refund-initiated' | 'refund-completed' | 'refund-failed'; at: string; code?: string }
  | { kind: 'local-expiry' | 'local-close'; at: string; policy: string }
  | { kind: 'settlement-expected' | 'settlement-matched' | 'settlement-discrepancy'; at: string; evidence: string };
```

Requirements:
- **`normalizeTransactionState(input, source)`** is the *only* place numeric/string/callback shapes are mapped; everything else consumes `TransactionState`. `paymentLifecycle`, `classifyCallback`, poll outcomes, and `journal/intelligence` all delegate to it (removes §12.2.1).
- **`unknown` is unrepresentable as `failed`.** `assertFulfillable(state, expected)` throws unless `outcome === 'approved'` **and** amount/currency/transactionId match; `transaction verify` is its CLI form; `go-live check` gates on its presence in the merchant's code path.
- **Retry semantics as data:** `retryPolicyFor(operation)` → `{ safe: boolean, reason, requiresStatusQueryFirst: boolean }`, derived from `MUTATION_ENDPOINTS` + the rule registry. Exported so agents and merchants ask instead of guessing.
- **Duplicate-payment protection exported:** `createAttemptStore({dataRoot})` with `reserve(transactionId) → 'new'|'duplicate'`, backed by the journal (already the source) — the CLI warning becomes an SDK API.
- **Callback/status coordination:** a documented and tested `resolveOutcome({callback, statusQuery})` that states the precedence rule (status query wins on conflict; a callback is a *hint* that triggers a query), replacing the prose in three guides.
- **Settlement stays separate** and is only ever set from merchant-supplied evidence — encoded by making `settlement` un-settable from any gateway response (type-level: no gateway normalizer writes it).

---

## 13. Webhook and Callback Architecture

### 13.1 As-is

| Piece | File | Assessment |
|---|---|---|
| Local receiver server | `src/webhook/server.ts` (528 L) | **Strong.** Loopback-only default with an explicit widening warning, JSON + SQLite stores, `forwardTo` re-POST with `x-payway-forwarded-from`, original callback never lost on forward failure, capture records include route + verification result |
| Storage | `webhook/storage.ts`, `storage-sqlite.ts` | **Strong.** Pluggable `WebhookStorage`; SQLite optional (`better-sqlite3` peer); `probeStorageBackend()` reports availability; journal/webhook/token share one data root |
| Tunnel | `webhook/tunnel.ts` (184 L) | **Good, one platform defect.** Prefers `.cmd`/`.ps1` on win32; parses the Cloudflare public URL; cleans up on stop. **Defect:** the test that exercises it is not platform-gated, so `npm test` fails on Linux (§33) |
| Fixtures | `webhook/fixtures.ts` | **Good but code-only.** 6 events, signed with the same canonicalization as verification; pushback/KHQR fixtures deliberately unsigned. Not on disk ⇒ merchants cannot use them in their own test suites |
| Route parsers | `khqr-notification.ts`, `customer-callback.ts`, `cof-callback.ts`, `classifyCallback` | **Strong** — the right primitive, underexposed |
| Token store | `webhook/token-store.ts` (+SQLite) | Good; `PAYWAY_TOKEN_STORE_DIR`; `cof token list --json` |
| CLI | `setup-webhook` (listener) + `webhook` group (`trigger/verify-callback/resend/list/show/status/stop`) | **Functionally excellent, structurally split** (P1-11) |
| Docs | `docs/guides/11`, `16`, `17`, `19`; `docs/recipes/webhook-receiver.js`; skills `aba-payway-webhook`, `-webhook-workbench`, `-webhook-forwarding`, `-customer-qr`, `-callbacks` | Correct and unusually honest about the four verification contracts |

### 13.2 `payway webhook listen` — full specification

**Purpose:** run a local, PayWay-reachable receiver that captures, verifies, classifies, persists and (optionally) forwards every delivery — the developer's substitute for the ABA simulator.

**Syntax:**
```
payway webhook listen [--port <n>] [--host <addr>] [--storage json|sqlite|auto]
                      [--tunnel] [--tunnel-binary <path>] [--url <existing-public-url>]
                      [--forward-to <url>] [--forward-headers <json>] [--forward-timeout <ms>]
                      [--print-url] [--write-env] [--duration <s>] [--max-events <n>]
                      [--expect <event>…] [--fail-on unverified|unmatched]
                      [--output ndjson|json] [--non-interactive]
```
**Behaviour:**
- Binds `127.0.0.1` by default. `--host 0.0.0.0` prints a **stderr** warning (already implemented) and records it in the JSON summary.
- `--tunnel` requires `cloudflared`; if absent, fail with `PW-NET-006` and a fix (`install cloudflared`, or `--url`), never a silent fallback.
- `--print-url` emits **exactly one line** on stdout in the form `https://<host>/aba-payway-webhook` and nothing else, so `URL=$(payway webhook listen --tunnel --print-url &)` and agent capture are both trivial. This removes the single worst manual step in Scenario A (§6.1 step 8).
- `--write-env` atomically updates `PAYWAY_CALLBACK_URL` in the project `.env` (today the listener writes it, but the paying shell must still re-export — the fix is to make `qr create` read the current listener URL from the data root automatically when `--callback-url` is omitted).
- `--expect payment.approved --duration 120 --fail-on unverified` turns the listener into a **CI gate**: exit `0` when the expected event arrived and verified, `4` when it arrived unverified, `5` on timeout. This is the missing piece for "test my webhook in CI without the simulator".
- `--output ndjson` streams one envelope per event as it happens (fixes §6.3 gap b), so an agent can consume arrivals live instead of polling `webhook list`.

**Per-event stream document:**
```jsonc
{ "schemaVersion":"2.0", "kind":"stream-event", "command":"webhook.listen", "ok":true,
  "data": {
    "eventId":"evt_01J…", "receivedAt":"2026-10-05T09:41:12.441Z", "route":"online-checkout",
    "httpMethod":"POST", "path":"/aba-payway-webhook", "sourceIp":"103.108.218.76",
    "verification": { "verified":true, "method":"hmac-sha512-sorted-key", "reason":null,
                      "headerPresent":true, "hashStripped":true },
    "classification": { "kind":"payment-status", "transactionId":"TX-1", "merchantRef":"order-42",
                        "gatewayStatus":"APPROVED", "paymentStatusCode":0 },
    "money": { "amount":"3.00", "currency":"USD", "matchesExpectation":null },
    "state": { /* TransactionState, §12.3 */ },
    "response": { "httpStatus":200, "body":"" },
    "forwarded": { "attempted":true, "url":"http://127.0.0.1:3000/webhooks/aba", "ok":true, "status":200,
                   "originalPreserved":true },
    "duplicate": { "isDuplicate":false, "key":"TX-1|APPROVED", "previousEventId":null },
    "bodyRedacted": { "payment_status":"APPROVED", "tran_id":"TX-1", "…":"«REDACTED:pii»" }
  },
  "next": [ { "command":"payway transaction verify --id TX-1 --expect-amount 3.00 USD",
              "reason":"a verified callback is a hint; confirm with a status query before fulfilment" } ] }
```
**Duplicate detection** uses the `(transactionId, gatewayStatus)` key — matching the journal's `callbackReplaySeen` semantics that the ABA relay confirmed (status-*changing* pushbacks are legitimate). Surfacing it at the listener (not only in `journal reconcile`) is what lets a developer *see* idempotency requirements instead of reading about them.

**stdout/stderr:** events on stdout in machine mode; the human table + "waiting for callbacks…" on stderr. **Exit codes:** `0` clean stop / expectations met; `1` bad flags; `3` tunnel or bind failure; `4` an unverified or unmatched delivery when `--fail-on` is set; `5` expectation timeout; `130` Ctrl-C (already handled). **Secrets:** full bodies are persisted **only** in `full` mode; `digest` mode (default for the journal) allow-lists non-secret fields; `--print-url` output contains no secret; forwarded requests carry the original signature header but never the API key.

**AI-agent suitability: high** — `--output ndjson --expect … --duration …` is a complete, non-interactive, machine-checkable webhook test. Pair it with `webhook trigger` (already excellent) for a fully offline loop.

### 13.3 Other webhook gaps

| Gap | Fix |
|---|---|
| No fixture corpus on disk | `payway webhook fixtures --out fixtures/payway/` writes 12+ signed/unsigned JSON fixtures + a `README` stating each route's verification contract; consumed by §19 |
| No receiver conformance harness | `payway webhook verify --against <url>` POSTs the corpus at a merchant endpoint and asserts: 2xx within 5 s, idempotent on replay, no fulfilment on unverified, correct 401 on bad signature. This converts `docs/guides/13`'s checkbox into a command |
| `webhook verify-callback --sig` takes a secret in argv | add `--sig-file`/stdin; keep `--sig` but warn on stderr |
| Listener and workbench are separate trees | `setup-webhook` → `webhook listen` with `setup-webhook` kept as a hidden alias emitting a stderr deprecation (§8.3) |

---

## 14. QR and Offline KHQR Architecture

### 14.1 The four things called "QR" — and why they must be visibly separate

| # | Capability | Implementation | Auth/verification | Network | Readiness |
|---|---|---|---|---|---|
| 1 | **Online QR Payment API** (`generate-qr`) | `src/domains/qr.ts` → `PayWay.qr.generateQr` | body-field HMAC-SHA512, 19 official fields | yes | **OFFICIAL-conformant** (hash order verified against live docs) |
| 2 | **Offline / local KHQR generation** (EMVCo) | `src/khqr-offline.ts` + `src/khqr-config.ts` | none — CRC-16/CCITT over TLV | **no** | Working; requires merchant KHQR config (7 fields) |
| 3 | **Customer Module dedicated KHQR** | `src/webhook/customer-callback.ts`, `docs/guides/17`, skill `aba-payway-customer-qr` | raw-body HMAC (RELAY contract) + `/aba-payway-khqr-webhook` route | yes | Working; contract `source:'relay'` |
| 4 | **Soundbox `request-qr`** | `src/domains/qr.ts` → `requestQr` | body-field HMAC, **9 repo-derived fields** | yes | **UNVERIFIED** — "spec-derived, NOT live-verified"; the archived spec's own `b4hash` is a corrupted copy-paste from `generate-qr` |

Today the CLI expresses this as `generate-qr [--offline]`, `request-qr`, and prose. `.agents/AGENTS.md` "Domain Separation" states the correct rule ("offline CRC-16 must never be mixed with online HMAC-SHA512") — but nothing in the *command surface* or the *types* prevents a developer from confusing them, and `generate-qr --offline` shares flags with the online path that mean nothing offline (`--callback-url`, `--template`, `--poll`).

### 14.2 Target QR surface

```
payway qr create      online generate-qr            (creds; --lifetime-unit s|min; PNG; poll)
payway qr offline     local EMVCo KHQR              (no creds, no network; --expiry; TLV dump)
payway qr customer    Customer-Module dedicated QR  (creds; raw-body callback contract)
payway qr soundbox    request-qr                    (creds; --allow-unverified required in production)
payway qr inspect     decode a payload or PNG file  (no creds; TLV breakdown, CRC validity, merchant/amount/expiry)
payway qr templates   list the 7 image templates    (no creds; sandbox-verified 2026-08-30)
payway qr deeplink    build/parse the ABA Pay deeplink from a qr_string   (no creds; buildAbaPayDeeplink exists)
```
Rules:
1. **Payload ≠ image ≠ status are separate outputs.** `qr create --output json` returns `{payload:{qrString, isStatic}, image:{pngPath, dataUri?, template}, status:{transactionId, outcome:'created'}, verification:{contract:'signed-online'}}`. A developer who wants only the string gets `data.payload.qrString`; nobody has to guess which field is which.
2. **`qr inspect` is the offline/online discriminator.** Given a payload it reports `{format:'emvco-tlv'|'payway-hosted'|'unknown', crc:{valid,expected,actual}, tlv:[…], merchant:{name,bakongId,mcc,city}, amount, currency, expiry, isStatic}` — using the `inspectKhqrPayload` that already exists, plus a `--expect-*` assertion mode for CI.
3. **Lifetime is explicit about its unit.** `--lifetime <n> --lifetime-unit seconds|minutes` with `minutes` as the canonical unit (matching OFFICIAL docs), `--lifetime` alone defaulting to **minutes** at 2.0.0, and a one-release deprecation window where a bare `--lifetime 360` on `qr create` emits a stderr advisory: "interpreted as 360 minutes (6 h); pass `--lifetime-unit seconds` if you meant 6 minutes". This resolves P0-03 without a silent breaking change, and `request inspect` prints the conflict record while it is open.
4. **`verified` is part of the output.** Every QR command's envelope carries `capabilities.verified: 'official'|'sandbox'|'spec'` so an agent can refuse to build on `qr soundbox` in production without reading docs.

### 14.3 QR-specific defects to fix

| ID | Defect | Evidence | Fix |
|---|---|---|---|
| QR-D1 | `paymentOption` membership not validated on `generateQr` (only the USD-only rule) | `src/domains/qr.ts:120-135` — no `PAYMENT_OPTIONS`-style membership check, unlike `requestQr` (`:191`) | HARD check against `{abapay_khqr, wechat, alipay}` (OFFICIAL) |
| QR-D2 | `lifetime` optional locally, REQUIRED officially | `GenerateQrParams.lifetime?`, `validateQrLifetimeSeconds(undefined)` passes | Either default it (official default = 30 days) or require it; decide after the P0-03 conflict is resolved |
| QR-D3 | Lifetime unit conflict with official docs | `constants.ts:316-325` vs OFFICIAL QR API table | §14.2 rule 3 + `conflicts.yaml` |
| QR-D4 | `QR_LIFETIME_MAX_SECONDS = 120 days` sourced from ARCHIVED spec; OFFICIAL says 30 days | `constants.ts:325` comment "documented maximum: 120 days (OpenAPI spec)" | Change to 30 days once QR-D3 is resolved; until then emit the conflict in `request inspect` |
| QR-D5 | Oversized-lifetime advisory uses a module-global one-shot flag and `console.warn` | `utils.ts:186-205` (`warnedOversizedQrLifetime`) | Route through the advisory system (§7.3) |
| QR-D6 | `qr_image_template` enum is SANDBOX-sourced but presented as fact in docs/skills | `constants.ts:346-363` | Tag `source:'sandbox'` in `rules.yaml`; `qr templates --output json` exposes it |

---

## 15. Error Model and Troubleshooting Architecture

### 15.1 As-is

**SDK side (`src/errors.ts`):** `PayWayError` base with `type`, `correlationId`, `toJSON()`; `PayWayConfigError`, `PayWayValidationError`, `PayWayAPIError` (carrying `statusCode`, `paywayCode`, `rawBody`, `endpoint`, `retryable`, `rateLimitInfo`, `fieldErrors`, `responseUrl`, `hostedPage`), `PayWayBusinessError`, `PayWayNetworkError`, `PayWayTimeoutError`, `PayWayRateLimitError`, `PayWaySignatureError`, `PayWayWebhookError`. Plus `src/client.ts`'s `classifyError`-adjacent logic and `GATEWAY_CODE_HINTS`/`*_ERROR_CODES` maps in `constants.ts`.

**Knowledge side (`src/cli/explain-code.ts` → generated `docs/error-codes.json`):** 96 codes, each `{code, family, title, hint, sandboxVerified, evidence, observedOn?, observedMessage?}`, exposed by `payway-sdk explain <code> [--json]`.

**CLI side (`src/cli/output.ts`):** `CLI_OUTPUT_SCHEMA_VERSION='1.0'`, `StructuredError{kind:'validation'|'api'|'network', exitCode, type, message, paywayCode?, httpStatus?, retryable, hint?}`, emitted as `{error:{…}}` on stdout with the exit code in `error.exitCode`.

**This is already better than most payment SDKs.** The defects are integration defects, not design defects.

### 15.2 Defects

| ID | Defect | Evidence | Impact |
|---|---|---|---|
| E1 | **Three disconnected error worlds.** The SDK error has no `code`/`category`/`docRef`; the 96-code registry lives in the CLI; the CLI envelope has a 3-value `kind`. Nothing joins them | `errors.ts` vs `explain-code.ts` vs `output.ts` | An SDK consumer gets `paywayCode:'PTL02'` and no explanation; an agent must shell out to `explain` to enrich an SDK error |
| E2 | **Four incompatible CLI error families** (their own audit C-class finding, still partly open) | `cli.ts` canonical; `webhook.ts` ~15 hand-rolled sites missing `type`; `docs.ts` `kind:'config_error'` (not in the `StructuredError` union); `onboard.ts` no `kind`/`exitCode` | Consumers cannot rely on `error.kind` |
| E3 | `PayWayWebhookError` is typed `config_error` | `errors.ts` | Callback failures are indistinguishable from misconfiguration in any `type`-based triage; exit-code mapping collapses them into `1` instead of `4` |
| E4 | `type` overridden by cast on 4 subclasses | `(this as {type: PayWayErrorType}).type = …` | Defeats `readonly`, confuses narrowing, blocks a discriminated union |
| E5 | **No `severity`, no `retry advice`, no `correlation` guidance on the error itself** | `retryable: boolean` only | An agent cannot answer "may I retry this?" without a rule table; `MUTATION_ENDPOINTS` policy is invisible |
| E6 | `doctor --live` swallows the probe error | `src/cli.ts:1204-1206` `catch { live = {status:'fail'} }` | The most common real failure (TLS/DNS/auth) is reported as a bare `fail` |
| E7 | `explain` has no `--json` envelope and no cross-links | bare object (reproduced) | No `schemaVersion`, no `next`, cannot be composed |

### 15.3 Target error model

One record, produced by the SDK, enriched by the registry, rendered by the CLI/MCP/agent.

```ts
export interface PayWayErrorRecord {
  code: string;                    // 'PW-API-PTL02' — namespaced, stable, in the registry
  category: 'CONFIGURATION' | 'VALIDATION' | 'AUTHENTICATION' | 'SIGNATURE' | 'API_REJECTION'
          | 'BUSINESS_RULE' | 'RATE_LIMIT' | 'NETWORK' | 'TIMEOUT' | 'CALLBACK' | 'SECURITY'
          | 'ENVIRONMENT' | 'CAPABILITY' | 'INTERNAL';
  severity: 'blocker' | 'error' | 'warning' | 'info';
  title: string;                   // 'Invalid hash'
  message: string;                 // actionable, includes the offending value when non-secret
  explanation: string;             // why PayWay behaves this way (from the registry)
  likelyCause: string[];           // ranked, from the registry
  correction: string;              // the fix, as a command or code change
  docRef: string;                  // 'payway docs errors-and-debugging#PTL02'
  environment?: 'sandbox' | 'production' | 'custom';
  endpoint?: string; httpStatus?: number; paywayCode?: string;
  merchantRef?: string; transactionId?: string;
  correlationId?: string; traceId?: string;      // join key: stdout ↔ journal ↔ gateway support
  fieldErrors?: Record<string, string>;
  rawBodyRedacted?: unknown;                     // sanitized via sanitizeForLog
  retry: { safe: boolean; afterMs?: number; reason: string; requiresStatusQueryFirst?: boolean };
  sandboxVerified: boolean; evidence?: string;   // provenance carried into the error
  exitCode: 1 | 2 | 3 | 4 | 5 | 6;
}
```
Implementation path (all incremental, no rewrite):
1. Move the registry from `src/cli/explain-code.ts` to `src/core/error-registry.ts` and generate **both** `docs/error-codes.json` and a TS map from `knowledge/rules/errors.yaml` (§22). `npm run gen:error-registry` already exists — repoint it.
2. `PayWayError.explain(): PayWayErrorRecord` on the base class, so `catch (e) { console.error(e.explain()) }` works for SDK consumers with zero CLI dependency.
3. Make `type` a real discriminated union: add `'webhook_error'` to `PayWayErrorType`, stop the casts, and derive `category`/`exitCode` from `type` in one table.
4. `src/cli/output.ts` becomes the *renderer* of `PayWayErrorRecord`, not a parallel model — deleting E2's four families by construction. Add a parametrised test that runs every registered command with deliberately bad input and asserts the envelope shape (fixes E2 permanently).

### 15.4 CLI vs `--json` differences (target, explicit)

| Aspect | Human mode | `--output json` |
|---|---|---|
| Destination | stdout (result) + stderr (progress/chrome) | stdout = **exactly one document**; everything else stderr |
| Errors | coloured `✖ <title>` + `→ <correction>` + `payway explain <code>` hint + exit code legend | the `error` record above, with `exitCode` inside the document **and** as the process exit code |
| Secrets | masked (`ec47••••`) | masked identically — **JSON is not a licence to print secrets**; `redaction:{applied:[…]}` states what was withheld |
| Advisories | stderr, deduped per client | `diagnostics.advisories[]`, never deduped away silently |
| Progress | spinner/table on TTY | none; `ndjson` for streams |
| Colour | theme via `src/cli/ui/theme.ts`, `NO_COLOR` respected | never |
| Width | wrapped to terminal | never wrapped; no ANSI |
| Failure of the renderer itself | best-effort text | must still emit a valid envelope (`PW-INT-001`), because a broken JSON error is worse than a broken text error |

### 15.5 `payway diagnose` — troubleshooting model

**Purpose:** turn a symptom into a ranked, evidence-bound diagnosis **without ever fabricating one**.

```
payway diagnose                                  # guided, TTY
payway diagnose --symptom wrong-hash
payway diagnose --code PTL02 --http-status 403
payway diagnose --id TX-1 --from-journal
payway diagnose --merchant-ref order-42
payway diagnose --symptom callback-never-arrived --output json
```
**Symptom vocabulary (closed set, from `knowledge/rules/symptoms.yaml`):** `wrong-hash`, `invalid-credentials`, `key-rotated`, `transaction-not-found`, `list-returned-empty`, `callback-never-arrived`, `callback-unverified`, `duplicate-payment`, `qr-wont-scan`, `qr-expired-too-soon`, `link-expired-but-open`, `refund-rejected`, `payout-beneficiary-rejected`, `token-expired`, `rate-limited`, `timeout-unknown-outcome`, `tls-failure`, `amount-or-currency-mismatch`, `sandbox-cannot-reproduce`.

**Output — four confidence buckets, never a single answer:**
```jsonc
{ "kind":"diagnostic", "command":"diagnose", "ok":true,
  "data": {
    "symptom":"wrong-hash", "inputs":{ "code":"PTL02", "httpStatus":403, "endpoint":"…/refund", "transactionId":"TX-1" },
    "confirmed":  [ { "cause":"hash field order does not match the endpoint", "evidence":"journal exchange ex_01J…: signed order [req_time,merchant_id,…] vs endpoint contract", "ruleId":"RF-001", "confidence":0.93 } ],
    "likely":     [ { "cause":"API key rotated (zero-overlap rotation)", "ruleId":"SEC-001", "confidence":0.41,
                      "requiredEvidence":["portal key issue date","first failing request timestamp"] } ],
    "possible":   [ { "cause":"base64 field double-encoded", "ruleId":"QR-014", "confidence":0.12 } ],
    "unknown":    [ { "question":"is the merchant's RSA public key the current one?", "howToAnswer":"payway doctor --check CFG-004" } ],
    "neverFabricated": true,
    "evidenceUsed": [ "journal:2 exchanges", "error-registry:PTL02", "rules.yaml:RF-001,SEC-001" ],
    "evidenceMissing": [ "gateway-side logs (only ABA can retrieve; provide tran_id + timestamps)" ],
    "next": [ { "command":"payway request inspect refund.create --id TX-1 --amount 2.00 --show-preimage", "reason":"compare the preimage against the gateway's b4hash convention" } ]
  } }
```
**Hard rules for the implementation:**
1. A cause may only appear in `confirmed` if a *named piece of local evidence* supports it (journal record, doctor check result, error-registry field, rule id). Otherwise it is `likely`/`possible` with `requiredEvidence`.
2. `unknown` is a first-class output. If nothing supports any cause, the command returns `confirmed: []` and a `next` list — **it must not guess**. The repo already applies this discipline in `journal/reconcile.ts` ("a missing callback is NOT proof of non-payment"); `diagnose` inherits it.
3. Every cause carries `ruleId` so the answer is traceable to §11 and testable.
4. Gateway-side facts the merchant cannot obtain (pushback logs, settlement report contents, key-rotation timestamps) are always listed under `evidenceMissing` with the ABA escalation path, never inferred.
5. `--from-journal` reads the local journal (already keyed by `correlationId`/`traceId`) — this is the feature that makes the journal pay for itself.

---

## 16. Observability, Logging and Redaction

### 16.1 As-is

`src/logger.ts` provides `createPayWayLogger({level, format})` with `LogSink` pluggability and JSON/text formats; `PAYWAY_LOG_LEVEL` / `config.logLevel` / `config.logFormat`; `DEBUG_PAYWAY` routes legacy diagnostics through it (TD-08) and emits `trace_id` lines. `src/utils.ts#sanitizeForLog` implements a genuinely thoughtful redactor: exact `SENSITIVE_LOG_KEYS`, fuzzy fragments (`secret`, `apikey`, `password`, `passwd`, `credential`, `hash`), token-shaped keys, `endsWith('key')`, an explicit `token_flag` exemption (public enum values), a defensive `^[a-f0-9]{40,}$` mask for SHA-1-length hex under unrecognised keys (TD-12), and a deliberate decision **not** to mask 32-char hex so benign order refs stay visible (EC-23). Arrays inherit the parent key hint. The journal has three modes (`off`/`digest`/`full`) with digest allow-listing non-secret fields, `correlationId`/`traceId` on every record, `PAYWAY_LOG_REDACTED` marker, retention by days+bytes, and `journal stats/explain/anomalies`.

**This is strong work.** The gaps:

| ID | Gap | Evidence | Fix |
|---|---|---|---|
| L1 | **Advisories bypass the logger** (`console.warn`) | `utils.ts:44`, `:198`, `:161` | Route through `createPayWayLogger` + `onAdvisory` hook (§7.3) |
| L2 | **No log *modes* contract for the CLI** — `--verbose`/`--quiet`/`--log-level` are not global flags; verbosity is per-command ad-hoc | `src/cli.ts` option census | Global `--log-level trace|debug|info|warn|error|silent`, `--log-format text|json|ndjson`, `--quiet`, all honoured by every command, all stderr-only |
| L3 | **No `logs` command** — the journal is queryable (`journal *`) but there is no unified "show me what just happened" across CLI + SDK + webhook | command census | `payway logs tail [--follow] [--level] [--command] [--id]`, `logs redact` (produce a shareable, guaranteed-redacted bundle), `logs share` (writes a redacted file and prints its checksum) |
| L4 | **Redaction is one-directional and undocumented as a contract** | `sanitizeForLog` is internal | Export `redact(value, policy)` from the public API with a named policy (`'log'|'journal-digest'|'json-output'|'share-bundle'`), and publish the allow-list so merchants can audit it |
| L5 | **No correlation guidance for gateway support** | docs mention providing `tran_id` + timestamps | Every error record and journal entry should print the exact support bundle line: `ABA support: tran_id=TX-1, time=2026-10-05T09:41:12+07:00, correlationId=cid_01J…` |
| L6 | **`import.meta` breaks in the CJS bundle** | tsup warning at `src/mcp/server.ts:56` | Resolve `package.json` via `createRequire`/`__dirname` fallback; add a CJS smoke test (§33) |

### 16.2 Log modes (target)

| Mode | Flag/env | Content | Use |
|---|---|---|---|
| `silent` | `--quiet` / `PAYWAY_LOG_LEVEL=silent` | stdout document only; nothing on stderr | CI, agents |
| `error` | default in `--output json` | errors + blockers | pipelines |
| `info` | default human | command result, advisories (deduped), next steps | developers |
| `debug` | `--verbose` / `DEBUG_PAYWAY=1` | + endpoint, durationMs, attempt, cid, traceId, rate-limit headers | integration debugging |
| `trace` | `--log-level trace` | + normalised body (redacted), hash field order, preimage **sha256 only**, journal writes | "Wrong hash" forensics — never the preimage itself unless `request inspect --show-preimage` |

**Invariants:** the preimage and every secret are absent from all log modes by construction; `trace` is refused (with a stderr warning) when `environment === 'production'` unless `PAYWAY_ALLOW_TRACE_IN_PRODUCTION=1`; `logs share` re-redacts with the strictest policy before writing, so a bundle can be attached to an issue safely.

---

## 17. Sandbox Experience

### 17.1 As-is

`payway-sdk sandbox-test-cards` and `sandbox-beneficiaries` (both `--json`, both labelled SANDBOX ONLY), `SANDBOX_TEST_CARDS` / `listSandboxBeneficiaries` exports, `demo` (credential-free simulated journey with a browser-openable HTML artifact), `test` (mock suite), `scripts/run-sandbox-contract.mjs` + ~25 `sandbox-probe-*.ts` live probes, `docs/internal/SANDBOX-FINDINGS.md` (the evidence dossier), `docs/guides/02` (registration + credential delivery + a network troubleshooting table), `examples/first-payment` demo mode, and `src/__tests__/sandbox-contract.test.ts` (gated, excluded from the offline suite).

**Strong points:** the repo is exceptionally honest about sandbox limits ("do not assume your everyday banking app can pay a sandbox QR", "the sandbox simulator never produces declines", "sandbox cannot reproduce settlement/chargebacks/production rate limits"). `sandbox-beneficiaries` warns that the plausible-looking `000999888` is **not** whitelisted — that single line saves hours.

### 17.2 Target sandbox DX

```
payway sandbox info        what the sandbox is, what it cannot reproduce, account limits/expiry, endpoints   (no creds)
payway sandbox verify      prove this sandbox works end-to-end: creds → exchange-rate → create → poll → journal (creds)
payway sandbox test-cards  ABA test cards + 3DS behaviour                                                     (no creds)
payway sandbox beneficiaries  seeded whitelisted accounts + test MIDs                                          (no creds)
payway sandbox scenarios   run a scripted scenario: approved | declined(simulated-only) | pending | expired | duplicate | missed-callback
payway sandbox reset       clear local sandbox state (journal, captures, tokens) with confirmation
```
Specifications:
- **`sandbox verify`** is the missing "prove it works" command. Steps: `doctor --route online-qr` → `exchange-rate` (read-only live probe) → `qr create --amount 0.01` (the OFFICIAL documented minimum) → `transaction get` → `journal timeline --limit 3`. Output: a per-step PASS/FAIL with `paywayCode`/`correlationId` on failure, exit `0/2/3`. It must **refuse** when `environment === 'production'` (exit `6`).
- **`sandbox info --output json`** turns ENV-002/ENV-003 from prose into data, including a `cannotReproduce: [{topic, why, alternative}]` array — the single most useful thing for an agent deciding whether a test result means anything.
- **`sandbox scenarios`** wraps `examples/first-payment`'s teaching products as CLI-driven, credential-free-where-possible scenarios, so "test the missed-callback path" is one command instead of reading a README.
- **Sandbox credentials are labelled, never ambient.** Every sandbox-only command prints `[sandbox]` in human mode and carries `context.environment` in JSON; every one refuses production.
- **Probe scripts become a maintained corpus.** Today ~25 `sandbox-probe-*.ts` files are one-off scripts in `scripts/`. Target: `sandbox/scenarios/*.scenario.ts` with a runner that records results into `knowledge/rules/evidence/` — so each new RELAY/UNVERIFIED rule gets a reproducible probe instead of a hand-written note.

---

## 18. Test Architecture Audit

### 18.1 Census (measured)

```
162 test files · 2,378 tests · 2,353 passed · 24 skipped · 1 FAILED · 130.5 s (Linux, Node 22.22.3)
src/ non-test LOC 37,944 · src/__tests__ LOC 39,913  (test:code ratio 1.05:1)
Coverage floors (ratcheted in vitest.config.ts): statements 79 · branches 73 · functions 84 · lines 80
```
Skips: 4 SQLite suites (24 tests) — `better-sqlite3` not installed. Excluded from my run: `sandbox-contract.test.ts` (live-gated by design).

**Classification of what exists:**

| Class | Approx. files | Examples | Runs offline? | Verdict |
|---|---:|---|---|---|
| **Unit** (pure logic) | ~55 | `utils.test.ts`, `auth.test.ts`, `errors.test.ts`, `payment-lifecycle.test.ts`, `khqr-offline.test.ts`, `journal/*.test.ts` | ✅ | Excellent |
| **Schema/type conformance** | ~12 | `openapi-suite-coverage.test.ts`, `types-conformance.test.ts`, `domain-types.test.ts` | ✅ | Excellent — spec↔code drift gate |
| **Contract (mocked gateway)** | ~30 | `client.test.ts`, `domains/*.test.ts`, `mutation-retry-policy.test.ts`, `rate-limit*.test.ts`, `hash-order-hints.test.ts`, `cof-subscription-parity.test.ts` | ✅ | Excellent; injected transport, no HTTP |
| **Callback/webhook contract** | ~14 | `auth-callback*.test.ts`, `webhook-*.test.ts`, `customer-callback.test.ts`, `khqr-notification.test.ts`, `fixtures.test.ts` | ✅ | Excellent |
| **CLI behaviour** | ~28 | `cli-*.test.ts`, `cli-stdout-purity.test.ts`, `completions*.test.ts`, `session.test.ts`, `explain-code.test.ts` | ✅ | Good; **no whole-registry parametrised sweep** |
| **Knowledge/doc conformance** | ~10 | `knowledge.test.ts` (hash-gated freshness), `guide-stubs.test.ts`, `skills.test.ts`, `docs-examples.test.ts` (compiles `docs/examples/backend/*.ts`), `knowledge-conformance.test.ts`, `merchant-scenario-coverage.test.ts` | ✅ | Outstanding — this is what keeps 5 doc mirrors from drifting |
| **Security/redaction** | ~8 | `agent-privacy-session.test.ts`, `secret-*.test.ts`, `journal-digest.test.ts`, `sanitize*.test.ts` | ✅ | Good; no canary sweep across all commands |
| **Snapshot/golden** | ~6 | output-shape snapshots | ✅ | Thin — no per-command golden JSON |
| **Integration (real sandbox)** | 1 + `scripts/run-sandbox-contract.mjs` | `sandbox-contract.test.ts` | ❌ gated | Correct design; **not run in CI** |
| **E2E (reference app)** | 2 | `first-payment-examples.test.ts`, `smoke-example.mjs` | ✅ (mock mode) | Good |
| **Packaging/distribution** | scripts | `check-package-contents.mjs`, `smoke-package.mjs`, `distribution-scan.js` (+ its own test) | ✅ | Good, but see §33 |
| **Mutation** | config only | `vitest.stryker.config.ts` | ❌ | Config exists, no gate |
| **Unrun tests** | 2 | `payway-boilerplate/merchant-qr-pos/src/{payments,store}.test.ts` | ❌ **never executed by any gate** | **Defect** — and they are cited as `test_evidence` in `docs/aba-payway-coverage-report.json` |
| **Platform-failing** | 1 | `sdk-facade-and-tunnel.test.ts` | ❌ fails on Linux | **Defect** |

### 18.2 Defects

| ID | Defect | Evidence | Fix |
|---|---|---|---|
| T1 | **One test fails on Linux** — a Windows-shaped tunnel fixture is spawned without a platform gate | `spawn /tmp/payway-tunnel-*/fake-cloudflared.cmd EACCES` | `it.skipIf(process.platform !== 'win32')` for the `.cmd` path + a POSIX `#!/bin/sh` fake for the Linux path so the behaviour is tested on both |
| T2 | **Tests cited as evidence are never run** | `merchant-qr-pos` has its own `package.json`/`vitest`, `vitest.config.ts` include is `src/**/*.test.ts`, CI never installs it | Either add a CI job that installs and runs each `payway-boilerplate/*` sub-project, or delete the citation from the coverage report |
| T3 | **SQLite suites silently skip** (24 tests) in the default environment | 4 files skipped | Install `better-sqlite3` in one CI job (already pinned `13.0.3` there) so the SQLite path is actually exercised; keep the skip locally |
| T4 | **No whole-registry output-contract test** | `cli-stdout-purity.test.ts` covers stdout purity, not shape uniformity | Parametrised sweep over `introspect()` asserting: `--output json` accepted, exactly one document, `schemaVersion` present, no ANSI, no stderr leakage into stdout, exit code ∈ {0,1,2,3,4,5,6,130} |
| T5 | **No canary redaction sweep** | redaction tested per-module | Seed canaries for every secret class, run every command with every flag combination against a mock gateway, assert no canary appears in stdout/stderr/journal/log sinks |
| T6 | **No official-docs conformance test** | `knowledge-conformance.test.ts` checks repo-internal consistency | A test that compares `knowledge/rules/*.yaml` statements against captured official-doc extracts (`knowledge/rules/evidence/*` with retrieval dates) and **fails when a rule's `source:'official'` claim has no evidence file** — this is the gate that would have caught P0-02/P0-03 |
| T7 | **Coverage floors ratcheted but unenforced per-directory** | single global threshold | Per-directory thresholds for `src/domains`, `src/auth`, `src/core` (money-path code) at ≥90% branches |
| T8 | **No CJS smoke test** | build warning unheeded | `node -e "require('aba-payway-ts')"` + `node dist/cli.cjs --version` + `mcp --list-tools` in CI |
| T9 | **Mutation config exists, never runs** | `vitest.stryker.config.ts` | Nightly (non-blocking) mutation run on `src/auth`, `src/utils`, `src/core/money` |

### 18.3 Target test pyramid

```
                        ┌───────────────────────┐
                        │ live sandbox contract │  nightly + pre-release only · credentials · never on PR
                        │  (1 suite, ~25 probes)│  gated by PAYWAY_SANDBOX_CONTRACT=1
                        ├───────────────────────┤
                        │ e2e reference app     │  PR · mock mode only · 2 suites
                        │ packaging/smoke       │  PR · npm pack + install + CJS/ESM + bin
                        ├───────────────────────┤
                        │ CLI contract sweep    │  PR · whole registry · output/exit/redaction
                        │ webhook conformance   │  PR · fixtures corpus vs a local receiver
                        ├───────────────────────┤
                        │ gateway contract      │  PR · mocked transport · hash order · retry · rate limit
                        │ callback contract     │  PR · 4 routes × verify/replay/malformed
                        │ knowledge conformance │  PR · corpus freshness · rules↔evidence ↔ official docs
                        ├───────────────────────┤
                        │ unit                  │  PR · pure logic · ~60% of runtime
                        └───────────────────────┘
Never touches production: everything. No test, probe, scenario, or fixture may reference
`checkout.payway.com.kh` as a target (§10.4 rule 6). Live sandbox tests are the only network tests.
```
**Local:** `npm test` (offline, <150 s, no credentials, no network — already true and worth protecting). **PR:** local + CLI contract sweep + packaging smoke + one SQLite job + Windows job. **Nightly:** live sandbox contract + mutation testing. **Pre-release:** the full `RELEASE_CHECKLIST` on the candidate commit.

### 18.4 Contract-test specification (the new gate that makes §9.1 real)

```ts
// src/__tests__/cli-output-contract.test.ts (target)
const commands = introspectCommandRegistry();           // already exists for completions
describe.each(commands)('%s output contract', (cmd) => {
  it('accepts --output json and emits exactly one versioned document', …);
  it('accepts --output ndjson for streaming commands only', …);
  it('keeps stdout free of ANSI, progress, advisories and deprecations', …);
  it('fails closed with a valid error envelope for every required-flag permutation', …);
  it('uses an exit code from the published set and echoes it in error.exitCode', …);
  it('leaks no canary secret to stdout, stderr, journal, or log sink', …);
  it('is declared in capabilities with readOnly/mutating/moneyMoving/verified', …);
});
```
This single file is the highest-leverage test in the programme: it converts the output contract from a document into an invariant, and it makes C2/C3/C4/E2 structurally impossible to reintroduce.

---

## 19. Fixtures and Simulation Architecture

### 19.1 As-is

- `src/test/mock-payway-server.ts` + `src/test/index.ts`: a real HTTP mock gateway with 5 response-type harnesses, used by `payway-sdk test` and `sdk.runTestSuite()`. **Excellent** — it exercises the actual transport, not a stub.
- `examples/first-payment` simulator: same wire shapes (snake_case envelopes, base64 callback URLs, signed pushbacks with `x-payway-hmac-sha512`), labelled `SIMULATED`, no network egress.
- `src/webhook/fixtures.ts`: 6 signed/unsigned callback events (code-only).
- `src/test/test-utils.ts#mockJsonResponse`: hand-rolled per test file.
- `docs/error-codes.json`'s `observedMessage` fields: real observed gateway messages (a de-facto fixture corpus, unused as fixtures).

### 19.2 Target fixture architecture

```
fixtures/
├── gateway/                     # one directory per operation, one file per outcome
│   ├── qr.create/{approved,pending,declined,wrong-hash-01,invalid-tran-id,ratelimited-429,timeout,5xx,duplicate-tran-id}.json
│   ├── checkout.purchase/{hosted-html,deeplink-json,error-status,nested-429,flat-429,string-status-failed}.json
│   ├── transaction.get/{approved,pending,declined,refunded,cancelled,pre-auth,not-found,unknown-shape}.json
│   ├── refund.create/{ok,PTL02,PTL04,PTL37,PTL57,PTL58,PTL168,PTL181,PTL187}.json
│   └── … one per operation in capabilities
├── callbacks/
│   ├── online-checkout/{approved,pending,declined,refunded,cancelled,unverified,malformed-signature,empty-body,replay-same-status,replay-status-change}.json
│   ├── payment-link-pushback/{success,unknown-tran}.json            # deliberately UNSIGNED
│   ├── khqr-notification/{paid,unpaid}.json                        # deliberately UNSIGNED
│   ├── customer-module/{paid,raw-body-signed}.json
│   └── cof/{token-linked,token-charged,token-expired}.json
├── khqr/{static-payload,dynamic-payload,crc-invalid,expired}.txt
├── http/{headers-ratelimit-delta,headers-ratelimit-httpdate,headers-x-rate-limit,redirect-add-card}.json
└── INDEX.json                    # generated: {file, operation, outcome, paywayCode, httpStatus, provenance, sandboxVerified}
```
Rules:
1. **Every fixture carries provenance** (`{source:'official'|'sandbox'|'relay'|'synthetic', evidence, capturedAt}`) — the same discipline the error registry already has. A fixture that claims to be a real gateway response without evidence is a lie waiting to happen.
2. **Fixtures are the single source for three consumers:** contract tests (replacing per-file `mockJsonResponse` bodies), `payway webhook fixtures`/`sandbox scenarios`, and merchant-facing test kits (`fixtures/` ships in the tarball under `aba-payway-ts/testing`).
3. **Response-shape classification gets its own fixture-driven test matrix** — `src/client.ts`'s 300-line `normalizePaywayResponse` currently has no per-shape corpus; `INDEX.json` makes the shape inventory explicit and reviewable.
4. **A "weird shapes" corpus is mandatory**: numeric-vs-string `status.code`, `"0"`/`"00"`/`""` success, nested vs flat 429, `FAILED`/`ERROR` strings, HTML bodies, `302 → /add-card/<base64>`, missing `status`, extra unknown fields. Each is a real observed PayWay behaviour documented in the repo; each must be a fixture, not a comment.
5. **Simulation is labelled everywhere.** The `simulated: true` convention from `examples/first-payment` becomes a contract: any artifact produced without a real gateway call carries it, and the CLI prints a `SIMULATED` banner in human mode.

---

## 20. Documentation Architecture and Information Design

### 20.1 As-is inventory

| Surface | Size | Role | Problem |
|---|---|---|---|
| `README.md` | 33 KB | entry, route table, install, features | Carries "preparing its first public release" language; three install paths |
| `QUICKSTART.md` | 12 KB | the golden path | Excellent; depends on an unpublished package |
| `docs/guides/01…24` | 22 chapters, ~700 KB | canonical long-form | Number-first IA implies a reading order the docs disclaim |
| `docs/NN-*.md` | 22 **generated mirrors** | legacy link compatibility | Duplicates every chapter in git |
| `docs/integration-*.md` | 7 | job-shaped guides (onboarding, finance, ui, receipts…) | A second, unnumbered family — good idea, inconsistent placement |
| `docs/{FIRST-PAYMENT-WALKTHROUGH,AGENT-*,…}.md` | 4 all-caps one-offs | | Third naming convention |
| `docs/reference/SDK-AND-CLI-REFERENCE.md` | 46 KB | the CLI/API reference | Hand-written; their own audit scored doc accuracy 5.5/10 |
| `docs/api/` | **239 generated TypeDoc HTML files** | API docs | Committed build output; regenerated in CI with **no freshness diff gate** |
| `docs/recipes/`, `docs/diagrams/`, `docs/examples/` | ~30 | code recipes (imported by tests), diagrams, polyglot examples | `docs/examples/backend/*.ts` are compiled by `docs-examples.test.ts` (good); `flutter/`, `telegram/` are ungated |
| `docs/internal/` | 4 dossiers | SANDBOX-FINDINGS, CLOSE-TRANSACTION-FINDINGS, INTEGRATION-GAPS, PAYMENT-CREDENTIAL-ERROR-TABLE | **Excluded from the npm package but published in the repo** (P0-01) |
| `docs/project/` | 12 | release checklist/readiness, versioning, status, engineering log, prior audits, secret triage | Maintainer state in a public docs tree |
| `docs/strategy/` | 5 | competitive analyses incl. `STRIPE-STANDARD-DX-AUDIT` | Contains third-party quotes/screenshots — rights flagged unresolved by the repo itself |
| `docs/archive/` | 8 | **official-doc copies + ABA's archived OpenAPI JSON** (335 KB, contains captured `merchant_auth` payloads and a base64 `' UNION SELECT null, version(), null --` example) | Rights + hygiene |
| `docs/superpowers/` | ~30 | historical plan/task docs (TASK-001…013) | Process archive |
| `docs/test-cases/` | CSVs | | Process archive |
| `docs/agents/{domain,issue-tracker}.md` | 2 | agent guidance | Fourth agent surface |
| `knowledge/` + `docs-packaged/` + `skills/*/references/` + `.zcode/skills/*/references/` | 43+42+42+42 | **generated fan-out of the same corpus** | One 42 KB chapter committed **6×** |
| `llms.txt` | 8 KB | machine index | Genuinely good; a real LLM entrypoint |
| `AGENTS.md` / `.agents/AGENTS.md` / `HANDOFF.md` | 22 KB / 9 KB / 107 KB | agent instructions | Three competing entrypoints (§28) |

### 20.2 Diagnosis

The **content** is excellent and the **freshness engineering** is unusually good (hash-gated corpus, mirror gates, docs-examples compilation, `check-public-docs` scanning generated HTML for forbidden internal filenames and absolute developer paths). The **information architecture** is the problem:

1. **Five naming conventions** for guides (numbered, `integration-*`, ALL-CAPS, `reference/`, `recipes/`).
2. **One chapter, six committed copies** — gated, but every gate is a maintenance tax and every copy is a chance to read the wrong one.
3. **Generated build output committed** (`docs/api/` 239 HTML files) with no freshness gate — CI regenerates it and nothing compares.
4. **Public and private content share a tree.** `docs/internal/`, `docs/project/`, `docs/strategy/`, `docs/archive/` are excluded from the *package* but published in the *repo*, contradicting the owner's recorded decision.
5. **The reference doc is hand-written** while everything else is generated. `SDK-AND-CLI-REFERENCE.md` (46 KB) cannot be trusted to match 86 commands, and there is no test that compares it to the live registry.

### 20.3 Target documentation tree

```
docs/
├── index.md                      # the ONLY map: 4 golden paths + product matrix + "where do I go next"
├── getting-started/
│   ├── install.md                # one path per situation, decided by a table, not prose
│   ├── first-payment.md          # QUICKSTART.md, moved and kept byte-identical in tone
│   ├── configuration.md          # generated from knowledge/rules/env-vars.yaml + config schema
│   └── environments.md           # sandbox vs production, what sandbox cannot reproduce
├── guides/                       # job-shaped, unnumbered, stable slugs
│   ├── online-qr.md  hosted-checkout.md  offline-khqr.md  customer-qr.md  soundbox.md
│   ├── callbacks-and-webhooks.md  webhook-testing.md  webhook-forwarding.md
│   ├── transactions-and-status.md  refunds.md  payouts-and-beneficiaries.md
│   ├── credentials-on-file.md  subscriptions.md  pre-auth.md  payment-links.md
│   ├── error-handling.md  troubleshooting.md  reconciliation-and-settlement.md
│   ├── security-and-secrets.md  production-readiness.md  ui-and-branding.md
│   └── mobile-and-webview.md
├── reference/                    # ALL GENERATED, zero hand-written reference prose
│   ├── cli.md                    # generated from the live command registry (capabilities)
│   ├── cli.json                  # the machine form; agents read this, not the markdown
│   ├── sdk/                      # TypeDoc output — published to Pages, NOT committed
│   ├── errors.md + errors.json   # generated from knowledge/rules/errors.yaml
│   ├── rules.md + rules.json     # generated from knowledge/rules/*.yaml (§22)
│   ├── products.md + products.json
│   └── environments.json
├── examples/                     # every file compiled or executed by a test
│   ├── backend/  frontend/  recipes/  diagrams/
└── project/                      # MAINTAINER-ONLY, excluded from the public tree per §25
    ├── release-checklist.md  release-readiness.md  versioning.md  engineering-log.md
    └── audits/                   # historical audits, incl. this one

REMOVED from the public tree: docs/internal/, docs/strategy/, docs/archive/, docs/superpowers/,
docs/test-cases/, docs/NN-*.md mirrors, docs/api/ (publish to Pages instead).
```
Rules:
1. **Slugs, not numbers.** Numbers encode a reading order the docs disclaim and make re-ordering a breaking link change. Stable slugs + `docs/index.md` as the map.
2. **One canonical source per fact.** `docs/guides/*` is canonical prose; everything else (`knowledge/`, `docs-packaged/`, `skills/*/references/`, `llms.txt`) is **generated at publish time and not committed** — except the subset that must ship in the tarball, which is generated by `prepack` (the `files` array already lists them, so the pipeline exists; only the committing is unnecessary).
3. **Reference docs are generated or they are wrong.** `docs/reference/cli.md` from `capabilities`; `errors.md` from the registry; `rules.md` from `rules.yaml`; SDK API docs to GitHub Pages. A test asserts every command in the registry appears in `cli.md` and every documented flag exists (and vice versa) — this replaces the 5.5/10 doc-accuracy score with a gate.
4. **Mirror links are redirects, not copies.** If `docs/NN-*.md` must survive for old links, make them 6-line stubs with a canonical link (the generator already writes a "Mirrored from" header — shrink the body to the header).
5. **Every code block in `docs/guides/**` and `docs/examples/**` is executed.** `docs-examples.test.ts` already compiles `docs/examples/backend/*.ts`; extend the pattern to fenced blocks via a extractor+`tsc --noEmit` (the repo already has the tooling instinct).

### 20.4 Executable knowledge matrix

| Knowledge | Doc (canonical) | Code validation | CLI check | Test | Agent knowledge |
|---|---|---|---|---|---|
| HMAC field order per endpoint | `guides/authentication` + `reference/rules.md` *(gen)* | `auth.generateHmac` + `*_HASH_FIELDS` | `request inspect` · `request sign` | `hash-order-hints`, `cof-subscription-parity` | `rules.yaml` → skill `payway-authentication` |
| Amount formatting/floors | `guides/transactions-and-status` | `formatAmount`, `validateAmountFloor` | `validate request`, `qr create` | `utils.test`, `validation.test` | `rules.yaml#QR-008/009` |
| Lifetime units & bounds | `guides/online-qr` | `validateQrLifetime`, `validatePurchaseLifetimeMinutes` | `qr create --lifetime-unit`, `request inspect` | ➕ conflict test | `rules.yaml#QR-013` + `conflicts.yaml` |
| Payment-option enums per endpoint | `reference/rules.md` *(gen)* | `PAYMENT_OPTIONS`, `PURCHASE_PAYMENT_OPTIONS`, `REQUEST_QR_PAYMENT_OPTIONS` | `rules check`, `checkout create` | ➕ official-conformance | `rules.yaml#QR-012/PUR-003` |
| Callback verification per route | `guides/callbacks-and-webhooks` | `verifyCallbackDetailed`, `verifyCallbackSignatureRaw`, `classifyCallback` | `webhook verify`, `webhook listen --fail-on` | `auth-callback*`, `webhook-*` | `rules.yaml#CB-001…009` |
| Status code semantics | `reference/errors.md` *(gen)* | `PAYMENT_STATUS_CODES`, `paymentLifecycle` | `status`, `explain`, `transaction explain` | `payment-lifecycle.test`, `knowledge-conformance` | `errors.yaml` + `rules.yaml#TX-001…003` |
| Endpoint rate limits | `reference/rules.md` *(gen)* | `rateLimitRules`, token bucket, `onThrottle` | `request inspect` (transportPolicy) | `rate-limit*.test` | `rules.yaml#TX-005/007`, `QR-018` |
| Retry/idempotency policy | `guides/troubleshooting` | `MUTATION_ENDPOINTS`, `mutationRetryPolicy` | `retryPolicyFor` via `request inspect` | `mutation-retry-policy.test` | `rules.yaml` + guardrails (§30) |
| Sandbox capabilities/limits | `guides/environments` | `SANDBOX_TEST_CARDS`, beneficiary registry | `sandbox info/verify/scenarios` | `sandbox-contract` (gated) | `environments.yaml` |
| Production readiness gates | `guides/production-readiness` | — *(none today)* | `go-live check` | ➕ golden-file | `rules.yaml#gates` |
| Error codes & hints | `reference/errors.md` *(gen)* | `error-registry` | `explain`, `diagnose` | `explain-code.test`, `knowledge.test` | `errors.yaml` (96 codes, already machine-readable) |
| Reconciliation vs settlement | `guides/reconciliation-and-settlement` | `journal reconcile` | `journal reconcile`, `go-live check` | `journal-reconcile.test` | `rules.yaml#SET-001/002` |
| Configuration precedence | `getting-started/configuration` *(gen)* | `config/resolve.ts` *(new)* | `config --json`, `env current` | ➕ precedence test | `env-vars.yaml` |
| Secret handling | `guides/security-and-secrets` | `sanitizeForLog`, journal digest, profiles 0600 | `doctor SEC-*`, `logs redact` | ➕ canary sweep | guardrails (§30) |
| Command surface | `reference/cli.md` *(gen)* | `completions/introspect.ts` | `capabilities`, `completions` | ➕ registry↔doc test | `capabilities.json` |

**Reading of the matrix:** 11 of 15 knowledge areas already have *both* code validation and a test — the executable-knowledge discipline is real. The four gaps are exactly the four new commands (`go-live check`, `request inspect`, `rules`, `env`) plus generated reference docs. That is the whole documentation programme in one table.

---

## 21. Machine-Readable Knowledge Layer

### 21.1 What already exists (reuse — do not rebuild)

| Artifact | Generator | Consumer | Verdict |
|---|---|---|---|
| `docs/error-codes.json` (96 codes, `sandboxVerified`, `evidence`, `observedOn`, `observedMessage`) | `npm run gen:error-registry` from `src/cli/explain-code.ts` | `explain`, docs | **Model to copy.** Only defect: the source is TS, not data |
| `knowledge/MANIFEST.json` (`schema: knowledge-manifest/v1`, per-topic `bytes`, `sha256`, `sourceSha256`) | `scripts/sync-knowledge.mjs` (42 SOURCES) | `docs` command, freshness test | Excellent — hash-gated staleness detection |
| `llms.txt` | `sync-knowledge.mjs` | LLM agents | Real machine index, not marketing |
| `payway-openapi/**` + `bundled.yaml` → `src/types.ts` | `openapi-typescript` | types, coverage tests | Good; `x-hmac-fields` vendor extension is the right call |
| `src/types.ts` | generated | domains | Good |
| `docs/aba-payway-coverage-report.json` | **none** | **none** | **Orphaned** — no generator, no test, references pre-reorg paths, `summary.covered_by_code:0` contradicts 6 cases classified `COVERED_BY_CODE_AND_DOCUMENTATION` |
| `skills-lock.json` | manual? | `skills` command | Tracks only 2 third-party skills, not the 35 first-party ones |

### 21.2 Target: `knowledge/rules/` as the rule source of truth

```
knowledge/rules/
├── rules.yaml            # the PayWay Rules Matrix (§11.2) as data
├── errors.yaml           # 96+ codes: {code, family, title, hint, httpStatus, paywayCode, retryable,
│                         #             explanation, likelyCause[], correction, docRef, sandboxVerified,
│                         #             evidence, observedOn?, observedMessage?, severity}
├── products.yaml         # capability matrix (§26): {id, name, endpoints[], readiness, verified,
│                         #             docs, sdk, cli, tests, example, skill, notes}
├── environments.yaml     # {sandbox:{endpoint, capabilities, cannotReproduce[], accounts}, production:{…}, guards{}}
├── capabilities.yaml     # generated from the live CLI registry + domain metadata (readOnly, mutating,
│                         #             moneyMoving, requiresCredentials, requiresRsa, requiresNetwork, verified)
├── env-vars.yaml         # every PAYWAY_* var: {name, type, secret, default, appliesTo[], docRef, since}
├── doctor-checks.yaml    # the §9.3 registry: {id, category, label, severity, fix, docRef, routes[]}
├── symptoms.yaml         # the §15.5 diagnose vocabulary: {symptom, causes[{ruleId, confidence, requiredEvidence[]}]}
├── conflicts.yaml        # open contradictions: {id, rule, officialStatement, officialUrl, retrievedAt,
│                         #             repoBehaviour, status, impact, requiredConfirmation, owner}
└── evidence/             # one file per official claim: quoted sentence + URL + retrieval date
    ├── QR-013.md  PUR-003.md  CB-001.md  …
```

**Justification by concrete consumer** (a machine-readable file with fewer than three consumers should not exist):

| File | Consumer 1 | Consumer 2 | Consumer 3 | Consumer 4 |
|---|---|---|---|---|
| `rules.yaml` | SDK validators (generated guard calls / rule ids in messages) | CLI `rules list/check`, `validate request` | `request inspect` (`normalization[].rule`) | conformance tests + generated `reference/rules.md` + skills |
| `errors.yaml` | `PayWayError.explain()` | `explain`/`diagnose` CLI | generated `reference/errors.md` + `docs/error-codes.json` | MCP tool `query_knowledge`, agent skills |
| `products.yaml` | `payway products` | `capabilities` readiness flags | generated capability matrix in `docs/index.md` | agent planning (`src/agent/readiness.ts` already computes capability readiness — feed it from data) |
| `environments.yaml` | `env current/use`, env-guard | `doctor` ENV/CRED checks | `sandbox info` | go-live gates |
| `capabilities.yaml` | shell completions (already introspected) | `capabilities --json` | generated `reference/cli.md` | agent tool selection + MCP catalog |
| `env-vars.yaml` | `envValidator.KNOWN_VARS` (fixes P1-04 permanently) | generated `.env.example` + `configure --set` autocomplete | `doctor ENV-003` | `getting-started/configuration.md` |
| `doctor-checks.yaml` | `doctor` implementation | `doctor` docs/`--check` validation | `go-live check` (reuses check results) | tests asserting id stability |
| `symptoms.yaml` | `diagnose` | `explain --symptom` | troubleshooting guide (generated tables) | agent decision trees (§30) |
| `conflicts.yaml` | `request inspect` conflict block | `go-live check` BLOCKER while open on a money path | generated "known conflicts" doc section | release gate (no conflict may be silently closed) |
| `evidence/*` | conformance test (a `source:'official'` rule **must** have an evidence file) | human review | `rules list --source official --show-evidence` | audit trail for ABA escalations |

**Validation (all four must hold, enforced by `src/__tests__/rules-conformance.test.ts`):**
1. Every `ruleId` referenced in code, tests, docs, skills, and CLI output exists in `rules.yaml`.
2. Every rule with `source: official` has `evidence/<id>.md` containing a URL and a retrieval date within 180 days (else the rule auto-degrades to `unverified` and the test fails with "re-verify against official docs").
3. Every rule has at least one of: a code enforcement point, a CLI check, or a test — and the file names it (`enforcement: {sdk, cli, test}`).
4. Every `conflicts.yaml` entry maps to a `go-live` gate and a `request inspect` output; no conflict may be open on a money-moving rule without a named owner and a required-confirmation channel.

### 21.3 Why this is the highest-leverage change in the plan

P0-02 and P0-03 are not coding errors; they are **provenance errors that nothing could detect**. A rule registry with mandatory evidence files and an auto-degradation rule makes that class of defect structurally impossible: the day ABA changes the QR `lifetime` unit, the evidence file expires, the rule degrades to `unverified`, `go-live check` reports a BLOCKER, and `request inspect` prints the conflict — instead of a merchant discovering it by shipping a QR with a 60× wrong lifetime.

---

## 22. Single Source of Truth Plan

| Canonical source | Generated consumers | Manual consumers | Validation | Owner |
|---|---|---|---|---|
| `knowledge/rules/rules.yaml` | `reference/rules.md`, skill rule tables, validator rule-ids, `request inspect` normalization labels | `docs/guides/*` prose (links, never copies) | `rules-conformance.test.ts` (4 rules above) | SDK maintainer |
| `knowledge/rules/errors.yaml` | `docs/error-codes.json`, `reference/errors.md`, `PayWayError.explain()` registry map, MCP knowledge | `explain-code.ts` becomes a thin renderer | `gen:error-registry --check` in CI (fails on drift) | SDK maintainer |
| `knowledge/rules/env-vars.yaml` | `src/config/env-registry.ts`, `.env.example` (root + `init`), `reference/configuration.md`, `configure` autocomplete | `envValidator.ts` reads the generated registry | test: every `process.env.PAYWAY_*` read in `src/**` appears in the registry (AST grep) | DX maintainer |
| `knowledge/rules/capabilities.yaml` (generated from the live registry) | `reference/cli.md`, `cli.json`, shell completions, `llms.txt` command section, MCP tool catalog | `--help` (rendered from commander) | registry↔doc parity test; `completions` golden file | CLI maintainer |
| `knowledge/rules/products.yaml` | capability matrix in `docs/index.md`, `payway products --json`, `agent/readiness.ts` inputs | README route table | parity test vs `ENDPOINTS` in `constants.ts` | Product/DX |
| `knowledge/rules/environments.yaml` | `sandbox info`, `env` docs, `doctor` ENV/CRED checks, go-live env gates | guides/environments.md | test: `BASE_URLS` matches the yaml | SDK maintainer |
| `knowledge/rules/doctor-checks.yaml` | `doctor` implementation + docs + `--check` validation | — | id-stability golden test (ids may be added, never renamed) | DX maintainer |
| `docs/guides/**` (prose) | `knowledge/*`, `docs-packaged/*`, `skills/*/references/*`, `llms.txt` — **all at `prepack`/publish, not committed** | humans, `payway docs <topic>` | `knowledge.test.ts` freshness (already exists) | Docs maintainer |
| `src/types.ts` | from `payway-openapi/bundled.yaml` | domains | `openapi-suite-coverage.test.ts` (exists) | SDK maintainer |
| `payway-openapi/**` | `bundled.yaml` → `types.ts` | reference | bundle↔sources hash check (add) | SDK maintainer |
| `package.json#version` | CHANGELOG release section, `llms.txt` header, README install snippet, `capabilities.context.sdkVersion` | — | `check-package.mjs` (exists) + release workflow | Maintainer |
| `CHANGELOG.md` | release notes | humans | Keep-a-Changelog lint (add) | Maintainer |
| CLI command registry (`commander` tree) | completions, `capabilities`, `reference/cli.md`, alias-parity test | `--help` | §18.4 contract sweep | CLI maintainer |
| `fixtures/INDEX.json` | contract tests, `webhook fixtures`, `sandbox scenarios`, merchant test kits | — | index↔files parity test | Test maintainer |

**Deletion list implied by this table** (each is a duplicate that becomes generated or removed):
`docs/NN-*.md` (22 mirrors → 6-line redirect stubs) · `docs/api/**` (239 files → GitHub Pages) · `knowledge/**` and `docs-packaged/**` committed copies (→ `prepack` generation; the `files` array already ships them) · `skills/aba-payway-integration/references/**` (42 files → generated at pack time; `scripts/lib/integration-skill.mjs` already does this) · `.zcode/skills/**` (132 files → installer output, not source) · `docs/aba-payway-coverage-report.json` (→ generated by a coverage-report script or deleted) · `.zcodeignore` (→ merge into `.gitignore`; one ignore file).

**Net effect:** ~830 tracked files → ~450; tarball 210 files → ~120 with docs shipped **once**; and every "which copy is right?" question disappears.

---

## 23. Agent Skill Taxonomy

### 23.1 As-is

35 first-party `aba-payway-*` skills + `skills/README.md` + `skills-lock.json` (2 third-party). 5 ship executable `.cjs` scripts. `aba-payway-integration` is the hub: 42 generated `references/` + `assets/*.ts` duplicated from `examples/integration-recipes/`. Installed into `~/.claude/skills`, `.zcode/skills`, `.kilo/skills` etc. by `payway-sdk skills install`, with parity tested.

**Shape:** overwhelmingly **per-endpoint** — `aba-payway-generate-qr`, `-request-qr`, `-check-transaction`, `-transaction-detail`, `-transaction-list`, `-close-transaction`, `-refund`, `-payout`, `-beneficiary`, `-pre-auth`, `-payment-link`, `-link-account`, `-link-card`, `-cof-payment`, `-renew-token`, `-token-details`, `-remove-token`, `-remove-card`, `-exchange-rate`, `-self-activation`, … plus a few job-shaped ones (`-integration`, `-webhook`, `-webhook-workbench`, `-webhook-forwarding`, `-offline-qr`, `-customer-qr`, `-callbacks`, `-authentication`, `-error-handling`, `-journal`, `-sandbox`, `-agent-cli`, `-mcp`).

### 23.2 Diagnosis

| Problem | Evidence | Consequence |
|---|---|---|
| **Per-endpoint granularity** | ~21 of 35 skills wrap one endpoint | An agent choosing a skill must already know the endpoint — inverting the purpose. Cross-cutting jobs (troubleshooting, go-live, reconciliation, idempotency) have no skill |
| **No trigger specification** | `SKILL.md` files have prose "when to use" but no machine-readable `triggers` | Skill selection is guesswork; `skills-lock.json` tracks only 2 external skills so there is no first-party schema to validate against |
| **Duplicated content** | `assets/*.ts` copied from `examples/integration-recipes/`; `references/` copied from `knowledge/` | 6 copies of a chapter; drift risk mitigated only by hash gates |
| **No allowed/prohibited tool declaration** | — | An agent cannot know that `payout` is money-moving and requires `--confirm-production` |
| **No escalation path** | — | When a skill's rule is `UNVERIFIED`, nothing tells the agent to stop and ask |
| **No validation step** | — | Skills describe commands but never assert their output |

### 23.3 Target taxonomy — 14 skills organised by *job*

| # | Skill | Replaces/absorbs | Triggers |
|---|---|---|---|
| 1 | `payway-integrate` | `-integration` (hub) | "integrate PayWay", "add ABA Pay", "accept payments in Cambodia" |
| 2 | `payway-choose-product` | parts of `-integration`, `-qr`, `-checkout` | "QR or hosted checkout?", "which PayWay product", "cards vs KHQR" |
| 3 | `payway-online-qr` | `-generate-qr`, `-qr`, parts of `-offline-qr` | "generate QR", "KHQR online", "scan to pay" |
| 4 | `payway-offline-khqr` | `-offline-qr` | "offline QR", "EMVCo", "no network QR", "POS QR" |
| 5 | `payway-hosted-checkout` | `-checkout`, `-payment-link` | "hosted page", "checkout form", "payment link" |
| 6 | `payway-customer-qr` | `-customer-qr`, `-request-qr` | "dedicated customer QR", "soundbox", "Customer Module" |
| 7 | `payway-authentication` | `-authentication` | "wrong hash", "code 1", "HMAC", "merchant_auth", "RSA" |
| 8 | `payway-callbacks` | `-callbacks`, `-webhook`, `-webhook-workbench`, `-webhook-forwarding` | "webhook", "callback", "pushback", "notification" |
| 9 | `payway-transactions` | `-check-transaction`, `-transaction-detail`, `-transaction-list`, `-close-transaction`, `-journal` | "check payment", "transaction status", "list transactions", "poll" |
| 10 | `payway-money-out` | `-refund`, `-payout`, `-beneficiary`, `-pre-auth` | "refund", "payout", "split payout", "pre-auth capture" |
| 11 | `payway-recurring` | `-link-account`, `-link-card`, `-cof-payment`, `-renew-token`, `-token-details`, `-remove-token`, `-remove-card`, `-self-activation` | "subscription", "recurring", "card on file", "token" |
| 12 | `payway-troubleshoot` | `-error-handling` + NEW | "PTL02", "code 35", "not working", "why did it fail" |
| 13 | `payway-sandbox-test` | `-sandbox` + NEW | "test in sandbox", "test cards", "simulate a payment" |
| 14 | `payway-go-live` | NEW (absorbs `-agent-cli`, `-mcp` guidance) | "production", "go live", "launch checklist", "reconciliation", "settlement" |

**Per-skill specification (the schema every `SKILL.md` must satisfy — validated by `skills.test.ts`):**

```yaml
name: payway-authentication
version: 2.0.0
purpose: >
  Produce a correct PayWay request signature and diagnose signature failures.
  PayWay has no transport-level auth: `hash` is a body field computed as
  base64(HMAC-SHA512(concat(fields…), api_key)) with a per-endpoint field order.
triggers:
  intents: [sign-request, wrong-hash, invalid-hash, code-1, merchant-auth, rsa-encrypt, verify-callback-signature]
  codes: [PTL02, "01", "1", PTL171, PTL175]
  phrases: ["wrong hash", "invalid hash", "signature mismatch", "how do I sign"]
inputs:
  required: [operation]
  optional: [params, apiKeyRef, environment]
required_context:
  - knowledge/rules/rules.yaml#{QR-001..QR-003, PUR-001..PUR-002, CB-001..CB-004}
  - knowledge/rules/conflicts.yaml            # open hash-order conflicts
  - src/auth.ts#generateHmac                  # authoritative implementation
authoritative_source:
  primary: knowledge/rules/rules.yaml
  official: knowledge/rules/evidence/{QR-001,PUR-001,CB-001}.md
  code: [src/auth.ts, src/domains/*/index.ts (*_HASH_FIELDS)]
  forbidden: [AGENTS.md, HANDOFF.md, .scratch/**, docs/archive/**]   # never a rule source
workflow:
  1: payway capabilities --output json            # confirm the operation id
  2: payway request inspect <operation> … --output json
  3: read data.signature.fieldOrder + fieldOrderSource; if a conflict is present, STOP and escalate
  4: payway rules check --against request.json    # local validation before sending
  5: payway request send <operation> … (only with explicit user authorisation)
  6: on code 1/PTL02 → payway diagnose --symptom wrong-hash --from-journal
allowed_tools: [payway request inspect, payway rules, payway explain, payway diagnose,
                payway doctor --check CFG-00*, read_file(src/auth.ts), read_file(knowledge/rules/*)]
prohibited_tools:
  - any network call that is not `payway request send` with explicit authorisation
  - writing credentials to any file, log, or provider payload
  - NODE_TLS_REJECT_UNAUTHORIZED (never; use NODE_EXTRA_CA_CERTS)
  - modifying *_HASH_FIELDS without an evidence file and a maintainer review
validation:
  - request inspect must return validation.ok == true before send
  - data.signature.fieldOrderSource must start with "official:" or "sandbox:"
  - the produced hash must never be logged; assert preimage is absent unless --show-preimage
expected_output:
  - a signed request description (endpoint, body, field order, provenance) OR
  - a diagnosis record with confirmed/likely/possible/unknown buckets
escalation:
  - if fieldOrderSource is "sandbox:" or "relay:" on a money-moving operation → tell the user the
    contract is not officially confirmed and require explicit acknowledgement
  - if conflicts.yaml has an open entry for the operation → STOP; do not send
  - if the gateway returns PTL171/PTL175 → key rotation; escalate to the portal, do not retry
relations:
  depends_on: [payway-choose-product]
  depended_on_by: [payway-online-qr, payway-hosted-checkout, payway-money-out, payway-recurring]
  see_also: [payway-troubleshoot, payway-callbacks]
```

Every one of the 14 skills gets this full block. The schema is validated (`skills.test.ts` already gates parity — extend it to validate required sections, trigger uniqueness across skills, `authoritative_source.forbidden` non-emptiness, and that every `allowed_tools` entry exists in `capabilities`).

### 23.4 Skill packaging rules

1. **No content duplication.** `references/` is generated from `knowledge/` at pack time (already true) and `assets/*.ts` becomes a *link* to `examples/integration-recipes/` (shipped once, referenced by relative path in the installed skill via a generated manifest).
2. **`skills-lock.json` tracks all skills**, first-party included: `{name, version, sha256, source:'first-party'|'github:mattpocock/skills', license}` — so a consumer can verify what was installed and third-party provenance/licence is explicit (today 2 of 37 are tracked).
3. **Skills declare their rule dependencies** (`required_context`), and `payway skills doctor` verifies that the installed skill's rule ids still exist in the installed `rules.yaml` — preventing a stale skill from teaching a deleted rule.

---

## 24. Secret and Credential Handling Audit

### 24.1 Current state — what is right

| Control | Location | Verdict |
|---|---|---|
| Profile store `0600`, atomic tmp+rename, max 8, outside the repo | `src/config/profiles.ts:46-70` | Correct |
| Masked interactive input | `src/cli/ui/prompts.ts#readMaskedInput` | Correct |
| `sanitizeForLog` (exact + fuzzy + token-shaped + 40-hex defensive + `token_flag` exemption) | `src/utils.ts:690-742` | Better than most production SDKs |
| Journal digest mode allow-lists non-secret fields | `src/journal/digest.ts`, `types.ts:73` | Correct design |
| Agent provider keys read only from env, never stored; sessions export scrubbed | `src/agent/config.ts`, `sessions export` | Correct |
| `check-public-docs.mjs` forbids internal filenames + absolute developer paths in generated docs | `scripts/check-public-docs.mjs` | Correct |
| `check-repository.mjs` forbids tracked `.env`, `profiles.json`, capture/output dirs | `scripts/check-repository.mjs` | Correct |
| `distribution-scan.js` gates the Postman export **by field**, redacts violations, has its own test | `payway-boilerplate/…/_build/` | Correct |
| `assertPublicSources()` blocks internal dossiers from the packaged corpus | `scripts/sync-knowledge.mjs` | Correct |
| Gitleaks config with narrow allowlists | `.gitleaks.toml` | Present (binary unavailable in this sandbox → not executed) |

### 24.2 Findings

| ID | Finding | Evidence | Classification | Severity |
|---|---|---|---|---|
| S1 | **The published tree contains material the owner's own release decision excluded** | `RELEASE-READINESS.md` item A (2026-10-01): publish "a curated tree"; excluded list includes `audit-results/`, `docs/internal/SANDBOX-FINDINGS.md`, `docs/HISTORY-SECRET-TRIAGE.*`, `HANDOFF.md` internals, competitive analyses, `payway-openapi/`, `docs/archive/`. All are present in the public repo, plus `.scratch/` (156) and `.zcode/` (132) which are not even on the list | Repo decision violated | **P0** |
| S2 | **Sandbox credentials are committed** — `merchant_id: ec476910`, `secret_key: 0508••••••••••••••••cd29 (redacted in this copy; see the Postman collection)` (`type: secret`), a full RSA public PEM, sandbox card PANs | `payway-boilerplate/Postman Collection API Testing/dist/PayWay API — Complete Collection.postman_collection.json` | **Authorized** by owner decision (2026-10-01: "The ABA sandbox demo identity … is authorized for public redistribution"). Residual risk: quota abuse, sandbox-account takeover, and the value being a bare 40-hex string that generic scanners won't flag as a secret | **P2** (not P0 — the disposition is documented) |
| S3 | **`docs/archive/Default module.openapi.json` (335 KB) contains captured encrypted `merchant_auth` payloads and a base64-encoded `' UNION SELECT null, version(), null --` example** — i.e. real captured request material and an injection probe, published | direct inspection | Captured traffic + third-party doc copy with unresolved rights | **P1** |
| S4 | **Verbatim third-party Telegram bot transcripts published** | `.scratch/telegram-aba-questionnaire/answers/raw/batch-*.json` (16 batches), `ANSWERS.md` | Confidentiality/redistribution of a partner channel; also an evidence-quality problem (§11.3) | **P1** |
| S5 | **Third-party skills vendored without licence tracking** | `.zcode/skills/{agents-sdk,code-review,sandbox-sdk,setup-matt-pocock-skills}`, `skills-lock.json` (2 entries) | MIT does not licence third-party material — the repo's own checklist says so | **P1** |
| S6 | **`payment_link_api/rsa.public` and a committed `package-lock.json`** in a Next.js boilerplate | `payway-boilerplate/payment_link_api/` | Public key only (not a secret), but the pattern invites committing the private counterpart; `HISTORY-SECRET-TRIAGE` already records 4 Next.js signing/encryption keys in build output | **P2** |
| S7 | **`.gitignore` uses `*key*.txt` / `*secret*.txt`** | `.gitignore` | Over-broad: silently ignores legitimate files (e.g. `docs/monkey-*.txt`-class names) and creates false confidence that "anything key-ish is ignored" | **P2** |
| S8 | **No secret scanning of *history* was possible in this audit**, and the repo's own triage says history disposition is open | `docs/project/HISTORY-SECRET-TRIAGE.md`: "Publication remains blocked"; 36 occurrences of 19 values across 217 commits in the *private* line | The public repo is a fresh 1-commit orphan (`git rev-list --count HEAD` = 1) so history is clean **by construction** — this is the one thing the fresh-history decision got right | **Info** |
| S9 | **Secrets accepted in argv** (`webhook verify-callback --sig`, `cof charge --token`, `--payout` with account numbers) | `src/cli.ts` | Shell history + process listing exposure | **P2** |
| S10 | **Plaintext credentials in the profile store, disclosed but not mitigated** | README + `profiles.ts` | No OS keychain integration, no `--encrypt`, no re-auth | **P2** |
| S11 | **`SECURITY.md` publishes `security@antigravity.dev` whose "exists, owned, monitored" precondition is recorded as unmet** | `SECURITY.md`, `RELEASE-READINESS.md` item D | A disclosure channel that may not exist is worse than none | **P1** |

### 24.3 Target credential model

1. **Public tree = curated tree.** Execute the owner's item A decision (§25, §31 P0-01).
2. **Credential resolution order becomes explicit and observable:** `credentialRef` in config → env → profile → prompt. `payway config --json` prints `source` per key with the value masked (`ec47••••`).
3. **OS keychain support** (`keytar`-free: `security find-generic-password` / `secret-tool` / `cmdkey` behind an interface) with the plaintext file retained as fallback and `doctor CRED-002` reporting which backend is active.
4. **No secret in argv, ever.** Every secret-bearing flag gains `--*-file` and `--*-stdin`; `doctor SEC-004` warns when a secret was passed inline.
5. **Uniform masking** (`first4 + •×min(len-8,16)`) across CLI, logs, journal, JSON output, and MCP — one function, exported, tested with canaries.
6. **Secret-scanning gates that actually run:** gitleaks (with a binary installed in CI, not `continue-on-error` + manual outcome inspection), plus a repo-specific scanner for the two shapes generic tools miss here: bare 40-hex strings under a `secret`-typed JSON key, and PEM blocks in non-`*.pem` files.
7. **`payway logs share`** produces a bundle that is redacted with the strictest policy, prints its sha256, and refuses to include `full`-mode journal records without `--include-full` + an explicit acknowledgement.

---

## 25. Repository Structure and Target Tree

### 25.1 Critique of the current structure

| Observation | Evidence | Consequence |
|---|---|---|
| **Root carries maintainer state** | `AGENTS.md` 22 KB, `HANDOFF.md` 107 KB, `CHANGELOG.md` 123 KB (mostly one `## Unreleased` section), `llms.txt`, `.zcodeignore`, `.gitleaks.toml`, `skills-lock.json` | A newcomer's first `ls` shows process artifacts beside product artifacts; `HANDOFF.md` is a *mandated pre-read* of 107 KB, which no contributor or agent will actually read |
| **Public and private share a tree** | `docs/internal/`, `docs/project/`, `docs/strategy/`, `docs/archive/`, `audit-results/`, `.scratch/`, `HANDOFF.md` | Directly violates the owner's recorded release decision (S1/P0-01) |
| **Generated artifacts committed** | `docs/api/` 239 HTML · `docs/NN-*.md` 22 mirrors · `knowledge/` 43 · `docs-packaged/` 42 · `skills/*/references/` 42 · `.zcode/skills/` 132 · `src/types.ts` (correctly committed — it is a build input for consumers) | 5 of 7 need not be in git; they inflate clones, reviews, and the tarball |
| **One directory, five purposes** | `payway-boilerplate/` = Postman workspace + build tooling + duplicated "Refrence-copy" + Next.js app + Express app + KHQR HTML + `Goal.txt.txt` + `learnings/` | Names with spaces and typos break shell quoting; two sub-projects have their own lockfiles and unrun tests (T2) |
| **Tests in one flat directory** | `src/__tests__/` = 162 files | Discoverability by convention only; no per-domain colocation, so "which tests cover `domains/qr.ts`?" requires grep |
| **`src/` mixes six products** | SDK core, CLI, MCP server, LLM agent, webhook server, journal — all under one root with one entrypoint | No dependency boundaries; the CLI can import agent internals and does; a merchant bundles MCP |
| **Process archives as source** | `.scratch/` 156 files incl. `.py`/`.mjs` one-off patch scripts, `docs/superpowers/` TASK-001…013, `audit-results/` 49, `docs/test-cases/` CSVs, `scripts/sandbox-probe-*.ts` ~25 | ~400 files that no reader can triage; probes are valuable evidence but stored as unrunnable one-offs |
| **Two ignore files** | `.gitignore` + `.zcodeignore` (near-duplicate) | Drift between them |
| **No CODEOWNERS, no dependabot, no release workflow** | `.github/` has 4 files | Ownership and dependency freshness are undocumented |

### 25.2 Target repository tree

```
aba-payway-ts/
├── README.md                     # entry: what/why/install/4 golden paths/product matrix
├── QUICKSTART.md                 # unchanged in spirit; the Scenario-A path
├── AGENTS.md                     # THE agent entrypoint (§28) — one file
├── CHANGELOG.md                  # Keep a Changelog; releases only, no rolling Unreleased novel
├── CONTRIBUTING.md  SECURITY.md  SUPPORT.md  LICENSE  CODE_OF_CONDUCT.md
├── llms.txt                      # generated
├── package.json  package-lock.json  tsconfig*.json  tsup.config.ts  vitest.config.ts
├── biome.json  typedoc.json  .gitignore  .gitleaks.toml  .editorconfig
├── .env.example                  # GENERATED from knowledge/rules/env-vars.yaml (root-level, committable)
│
├── .github/
│   ├── workflows/{ci.yml,release.yml,nightly.yml,docs.yml}
│   ├── ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,rule_conflict.yml,payway_behaviour_change.yml}
│   ├── PULL_REQUEST_TEMPLATE.md  CODEOWNERS  dependabot.yml
│
├── src/
│   ├── core/            # types(errors, advisories, lifecycle, money, ids), no I/O
│   ├── auth/            # hmac, rsa, callback-signature, field-orders
│   ├── config/          # schema, resolve (precedence), env-registry (generated), profiles, data-root
│   ├── transport/       # fetch policy, classify, digest, tls
│   ├── client/          # PayWay composition root, sdk facade
│   ├── domains/         # checkout qr khqr customer-qr payment-link cof pre-auth payout beneficiary
│   │                    #   self-activation exchange-rate transactions   (one dir per domain + index.ts)
│   ├── callbacks/       # classify + parsers + route contracts
│   ├── observability/   # logger, journal/*
│   ├── webhook/         # server, storage, forwarder, tunnel, token-store
│   ├── khqr-offline/    # tlv, crc16, generate, inspect, config
│   ├── diagnostics/     # doctor checks, rules engine, explain, go-live, request-inspect, diagnose
│   ├── mcp/             # server, tool-catalog
│   ├── agent/           # provider, planning, risk, ledger, privacy, repl, sessions, tools
│   ├── cli/
│   │   ├── commands/    # one module per command group (§9.2) — nothing inline
│   │   ├── output/      # envelope, renderer, redaction, exit-codes  (ONE contract)
│   │   ├── ui/          # theme, tables, prompts, help, mode, poll-display, banner
│   │   ├── completions/ dotenv.ts  program.ts  run-cli.ts
│   └── testing/         # mock server, harness, fixture loader  → subpath export ONLY
│       └── __tests__/   # colocated per directory (each src/<area>/__tests__/)
│
├── knowledge/
│   ├── rules/           # rules.yaml errors.yaml products.yaml environments.yaml capabilities.yaml
│   │                    # env-vars.yaml doctor-checks.yaml symptoms.yaml conflicts.yaml
│   │   └── evidence/    # one file per official claim (quote + URL + retrieval date)
│   └── corpus/          # GENERATED at prepack from docs/guides (not committed)
│
├── fixtures/            # §19 — committed, provenance-tagged, consumed by tests + CLI + merchants
├── docs/
│   ├── index.md  getting-started/  guides/  reference/(generated)  examples/  diagrams/
│   └── project/         # MAINTAINER-ONLY (private line): release, readiness, audits, engineering log
├── examples/
│   ├── first-payment/   # the reference app (unchanged)
│   ├── integration-recipes/
│   ├── webhook-receiver/    # NEW: minimal Express/Fastify/Next receivers, one per callback route
│   └── agent-workspace/     # NEW: AGENTS.md + skills + MCP config for a consumer project
├── skills/              # 14 job-shaped skills (§23), references generated at pack time
├── integrations/
│   ├── postman/         # source YAML + _build tooling + generated collection (dist NOT committed)
│   ├── openapi/         # payway-openapi/ renamed; sources + bundled.yaml (rights resolved first)
│   └── boilerplate/     # merchant-qr-pos, payment-link-app — each with a CI job that runs its tests
├── scripts/
│   ├── gates/           # check-package, check-public-docs, check-repository, check-secret-allowlists
│   ├── generate/        # sync-knowledge, generate-guide-stubs, gen-error-registry, gen-env-registry,
│   │                    #   gen-cli-reference, gen-capabilities, gen-env-example
│   ├── probes/          # sandbox scenario probes (runnable, recorded into knowledge/rules/evidence)
│   └── release/         # pack, smoke, publish rehearsal
└── .maintainer/         # PRIVATE line only: HANDOFF.md, audit-results/, .scratch/, strategy/, archive/
```
**Per-directory responsibility (one sentence each, enforced by a lint rule on imports):**

| Directory | Responsibility | May import |
|---|---|---|
| `core/` | Pure domain types, errors, advisories, money/id/lifecycle rules. No I/O, no network, no process globals | nothing in `src/` |
| `auth/` | Signing, encryption, signature verification, hash field orders | `core/` |
| `config/` | The one config schema, precedence resolver, env registry, profiles, data root | `core/` |
| `transport/` | HTTP execution policy (retry, breaker, rate limit, cid, TLS) and response-shape classification | `core/`, `auth/`, `config/`, `observability/` |
| `client/` | Composition root and the merchant-facing facade | all of the above + `domains/` |
| `domains/` | One PayWay capability each: payload build (pure), validation, endpoint metadata | `core/`, `auth/`, `config/` |
| `callbacks/` | Route classification and verification for the four callback contracts | `core/`, `auth/` |
| `observability/` | Logger, journal, redaction | `core/`, `config/` |
| `webhook/` | Local receiver server, storage, forwarding, tunnel | `core/`, `config/`, `callbacks/`, `observability/` |
| `khqr-offline/` | EMVCo TLV + CRC-16 generation/inspection — **no HTTP, no API keys** | `core/`, `config/` |
| `diagnostics/` | doctor checks, rules engine, explain, diagnose, go-live, request-inspect | everything except `cli/`, `agent/`, `mcp/` |
| `cli/` | Presentation only: parse → call → render. **No domain policy** | everything |
| `mcp/` `agent/` | Tool exposure and LLM orchestration; both consume `diagnostics/` + `client/`, never `cli/` internals | everything except `cli/` |
| `testing/` | Mock gateway, harness, fixture loader. **Never imported by non-test code** | everything |

Enforcement: `biome`/`eslint` `no-restricted-imports` per directory + a `src/__tests__/architecture-boundaries.test.ts` that fails on a violating import. This is the cheapest way to keep the monolith from reforming.

### 25.3 What must leave the public tree

Per the owner's own item A/B decisions plus §24: `audit-results/` · `.scratch/` · `.zcode/` · `.kilo/` · `HANDOFF.md` · `docs/internal/` · `docs/strategy/` · `docs/archive/` · `docs/superpowers/` · `docs/test-cases/` · `docs/project/` (keep a public `docs/project/ROADMAP.md` if desired) · `docs/api/` (publish to Pages) · `docs/NN-*.md` mirrors (→ redirect stubs) · `knowledge/` + `docs-packaged/` + `skills/*/references/` committed copies (→ `prepack`) · `payway-boilerplate/…/Refrence-copy-…/` · `payway-boilerplate/…/dist/` collection · `Goal.txt.txt` · `learnings/` · `.zcodeignore`.
`payway-openapi/` (→ `integrations/openapi/`) stays **only after** ABA confirms redistribution rights; until then it is excluded and the generated `src/types.ts` remains (it is a derived artifact, and the repo already ships it).

---

## 26. Product Capability Matrix

`Status` ∈ **Complete** · **Partial** · **Missing** · **Experimental** · **Unverified**.
`Verified` records the *provenance of the contract*, which is the column that matters most for trust.

| Capability | Docs | SDK | CLI | Tests | Example | Agent skill | Status | Verified |
|---|---|---|---|---|---|---|---|---|
| Purchase / hosted checkout (cards, ABA Pay, KHQR deeplink, Alipay, WeChat, Google Pay) | ✅ `guides/03,04,05,10` | ✅ `domains/checkout` | ✅ `generate-checkout`, `checkout-form` | ✅ contract + schema | ✅ `first-payment`, recipes | ✅ `-integration` | **Complete** (enum defect P0-02) | official (hash order) + archived (enum) ⚠ |
| Online QR generation (`generate-qr`) | ✅ `guides/07` | ✅ `domains/qr` | ✅ `generate-qr` | ✅ | ✅ | ✅ `-qr` | **Complete** (lifetime unit P0-03) | official hash order; **lifetime UNVERIFIED** |
| Offline / local KHQR (EMVCo TLV + CRC-16) | ✅ `guides/19`, `payway-boilerplate/ABA KHQR onsite generation` | ✅ `khqr-offline.ts` | ✅ `generate-qr --offline` | ✅ | ✅ | ✅ `-offline-qr` | **Complete** | repo + official KHQR guideline |
| Customer Module dedicated KHQR | ✅ `guides/17` | ✅ `webhook/customer-callback` | ✅ `setup-webhook` route | ✅ | ✅ | ✅ `-customer-qr` | **Complete** | relay (raw-body HMAC) ⚠ |
| Soundbox `request-qr` | ✅ `reference` | ✅ `domains/qr#requestQr` | ✅ `request-qr` | ✅ contract | ✅ | ✅ `-request-qr` | **Experimental** | **Unverified** — spec-derived; archived spec's own `b4hash` is corrupted |
| Check transaction (status query) | ✅ `guides/08,18` | ✅ `domains/transactions` | ✅ `check-transaction`, `poll-transaction` | ✅ | ✅ | ✅ | **Complete** | official + relay (7-day window, KHQR exclusion) |
| Transaction detail | ✅ | ✅ | ✅ `transaction-detail --wait` | ✅ | ✅ | ✅ | **Complete** | official + sandbox (indexing lag) |
| Transaction list | ✅ | ✅ | ✅ `transaction-list` (gateway UTC+7 default) | ✅ | ✅ | ✅ | **Complete** | sandbox-verified timezone rule |
| Transactions by merchant ref | ✅ `guides/15` | ✅ | ✅ `get-transactions-by-ref` | ✅ | ✅ | ✅ | **Complete** | relay (Customer Module reconciliation) |
| Close / void transaction | ✅ `docs/internal/CLOSE-TRANSACTION-FINDINGS` | ✅ | ✅ `close-transaction`, `tx-batch close` | ✅ | ✅ | ✅ | **Complete** | official + sandbox |
| Refund (incl. partial, balance pre-flight) | ✅ `guides/12` | ✅ `domains/checkout#refund` | ✅ `refund` | ✅ + PTL code table | ✅ | ✅ `-refund` | **Complete** | official + sandbox (numeric floor **Unverified**) |
| Payout / split payout | ✅ | ✅ `domains/payout` | ✅ `payout` | ✅ | ✅ | ✅ `-payout` | **Complete** | official + sandbox |
| Beneficiary whitelist | ✅ | ✅ | ✅ `beneficiary`, `sandbox-beneficiaries` | ✅ | ✅ | ✅ `-beneficiary` | **Complete** | official + sandbox |
| Pre-auth (complete / complete-with-payout / cancel) | ✅ | ✅ `domains/pre-auth` (+`idempotencyKey`) | ✅ `pre-auth` | ✅ | ⚠ partial | ✅ `-pre-auth` | **Complete** (over-capture ceiling CLI-only, PA-002) | official + relay (30-day window, no webhook) |
| Credentials on File — link account / link card | ✅ | ✅ `domains/credentials-on-file` | ✅ `cof link-account/link-card/link-card-form` | ✅ + `flag-sweep` | ⚠ | ✅ `-link-account/-link-card` | **Complete** | official + sandbox (HTML response contract) |
| CoF — charge / renew / details / remove | ✅ | ✅ | ✅ `cof charge/token *` | ✅ | ⚠ | ✅ `-cof-payment` etc. | **Complete** (2 token flags **Unverified**) | official + relay (expiry models) |
| Subscriptions (scheduled, `CITR_FIX`) | ✅ | ✅ purchase-path trio | ✅ `cof charge --ctid` | ✅ `cof-subscription-parity` | ❌ | ✅ | **Partial** — official docs list a dedicated **Subscription** endpoint the SDK does not call | sandbox (hash positions) ⚠ |
| Payment links (create / details / void / image) | ✅ | ✅ `domains/payment-link` | ✅ `payment-link *` | ✅ | ✅ `payment_link_api` boilerplate | ✅ `-payment-link` | **Complete** (void endpoint absent from official docs) | official + sandbox (void = **Unverified** vs official) |
| Exchange rate | ✅ | ✅ | ✅ `exchange-rate` | ✅ | ✅ | ✅ `-exchange-rate` | **Complete** | official |
| Self-activation (new-merchant / credential-info / mc-info) | ✅ `reference` | ✅ `domains/self-activation` | ✅ `self-activation *` | ✅ contract | ❌ | ✅ `-self-activation` | **Experimental** | **Unverified** — spec-derived, not live-verified |
| Callback verification (4 route contracts) | ✅ `guides/11,16,17,19` | ✅ `auth.verify*`, `classifyCallback` | ✅ `webhook verify-callback` | ✅ | ✅ `webhook-receiver.js` recipe | ✅ `-callbacks` | **Complete** | official (sorted-key) + relay (raw-body) |
| Local webhook receiver / workbench | ✅ `guides/16` | ✅ `webhook/*` | ✅ `setup-webhook`, `webhook *` | ✅ (1 platform failure T1) | ✅ | ✅ `-webhook-workbench` | **Complete** | repo |
| Tunnel (public URL for callbacks) | ✅ | ✅ `webhook/tunnel.ts` | ✅ `--tunnel` | ⚠ platform-gated failure | ✅ | ✅ | **Partial** | repo |
| Webhook forwarding to a merchant app | ✅ | ✅ `WebhookForwarder` | ✅ `--forward-to` | ✅ | ✅ | ✅ `-webhook-forwarding` | **Complete** | repo |
| Transaction journal (record / query / timeline / anomalies) | ✅ `guides/18` | ✅ `journal/*` | ✅ `journal *` | ✅ | ✅ | ✅ `-journal` | **Complete** | repo |
| Reconciliation (journal ↔ callbacks) | ✅ `guides/18,20`, `integration-finance` | ✅ `journal/reconcile.ts` | ✅ `journal reconcile` | ✅ | ✅ `reconcile.cjs` skill script | ✅ | **Complete** (local only) | repo + relay |
| **Settlement report ingestion / bank matching** | ✅ `guides/20`, `integration-finance` (guidance) | ❌ | ❌ | ❌ | ❌ | ⚠ prose in `-integration` | **Missing** — correctly declared out of scope (merchant's report schema) | relay (T+N merchant-specific) |
| Disputes / chargebacks | ✅ `guides/20` | ❌ (card-only, no API) | ❌ | ❌ | ❌ | ⚠ | **Missing** (no PayWay API exists) | relay |
| Error explanation registry (96 codes) | ✅ `guides/12`, `error-codes.json` | ⚠ CLI-only (E1) | ✅ `explain`, `status` | ✅ | — | ✅ `-error-handling` | **Complete** | sandbox + telemetry CSV |
| **Contextual diagnosis** | ⚠ prose | ❌ | ❌ (`explain` is single-code) | ❌ | ❌ | ❌ | **Missing** | — |
| Offline knowledge base (`docs` command) | ✅ | ✅ `knowledge/store.ts` | ✅ `docs list/<topic>/search` | ✅ freshness-gated | — | ✅ | **Complete** | repo |
| Environment diagnostics (`doctor`) | ✅ | ✅ `commands/doctor.ts` | ✅ `doctor --route --live --json` | ✅ | — | ✅ | **Partial** (no severity, no network checks — §9.3) | repo |
| **Go-live / production readiness check** | ✅ `guides/13`, `integration-onboarding` (G0–G7) | ❌ | ❌ | ❌ | ❌ | ❌ | **Missing** | — |
| **Request inspection / dry-run** | ❌ | ⚠ pure payload builders exist | ⚠ `tx-batch --dry-run` only | ❌ | ❌ | ❌ | **Missing** | — |
| **Environment switch / guard (`env`)** | ⚠ prose | ⚠ `BASE_URLS` | ❌ | ❌ | ❌ | ❌ | **Missing** | — |
| Configuration profiles | ✅ | ✅ `config/profiles.ts` | ✅ `profiles *` | ✅ | — | ✅ | **Complete** (no `--json`, S10) | repo |
| Shell completions | ✅ | ✅ `completions/introspect.ts` | ✅ `completions bash/zsh/fish/powershell` | ✅ | — | ✅ | **Complete** | repo |
| Interactive session shell | ✅ | ✅ `cli/session.ts` | ✅ `session` (`:use`, `:help`) | ✅ | — | ✅ | **Complete** (TTY-only — C13) | repo |
| MCP server | ✅ `docs/agents`, `guides/agent-*` | ✅ `mcp/*` | ✅ `mcp serve/--list-tools` | ✅ | ✅ `examples/agent-workspace` (planned) | ✅ `-mcp` | **Complete** (CJS `import.meta` defect L6) | repo |
| LLM agent (plan → authorise → execute → ledger) | ✅ | ✅ `agent/*` (30 files) | ✅ `ask`, `agent` (REPL), `agent sessions/ledger/recover/prune` | ✅ incl. privacy | ⚠ | ✅ `-agent-cli` | **Complete** — best-in-class risk model | repo |
| Onboarding wizard | ✅ | ✅ `agent/onboarding.ts` | ✅ `onboard` | ✅ | — | ✅ | **Complete** (no `--json`) | repo |
| Credential-free demo | ✅ | ✅ `test/*` mock server | ✅ `demo` | ✅ | ✅ `first-payment` demo mode | ✅ | **Complete** | repo |
| Sandbox test-card / beneficiary registries | ✅ | ✅ exports | ✅ `sandbox-test-cards`, `sandbox-beneficiaries` | ✅ | ✅ | ✅ `-sandbox` | **Complete** | official + sandbox |
| **Sandbox verification / scenarios** | ⚠ prose | ⚠ mock harness | ⚠ `test` (mock, misleadingly named — C12) | ⚠ | ✅ `first-payment` | ⚠ | **Partial** | — |
| Installable agent skills | ✅ `skills/README.md` | ✅ | ✅ `skills install/list/update` | ✅ parity | — | ✅ 35 (→14, §23) | **Complete** (taxonomy defect) | repo |
| Postman collection | ✅ `collection-index.md` | n/a | n/a | ✅ `distribution-scan` | ✅ | ⚠ | **Complete** (committed credentials S2, duplicate copy) | official-derived |
| Reference app (`first-payment`) | ✅ | ✅ | ✅ `init --template first-payment` | ✅ `first-payment-examples` | ✅ | ✅ | **Complete** — the best artifact in the repo | repo |
| 6 legacy `/api/aof/*` + `v1/cof` endpoints | ✅ coverage audit | ❌ deliberate | ❌ | ✅ coverage test | ❌ | ❌ | **Missing (deliberate)** | archived spec |

**Summary:** 42 capabilities — **32 Complete**, **6 Partial**, **4 Missing** (2 deliberately: settlement ingestion, disputes), **2 Experimental/Unverified** (`request-qr`, `self-activation`). The Missing list is precisely the four new diagnostic commands plus settlement/disputes, which have no API. **This is a mature product surface with a missing diagnostic layer — not a missing feature layer.**

---

## 27. AI-Agent Readiness Audit

### 27.1 What an agent can do today (verified by reading the surfaces it would use)

| Need | Available? | Surface |
|---|---|---|
| Discover the project in one machine-readable file | ✅ | `llms.txt` (8 KB, generated, with a "most often gotten wrong" block that is genuinely agent-targeted) |
| Read docs offline | ✅ | `payway-sdk docs list/<topic>/search [--json]` over 42 topics with a hash-gated manifest |
| Decode an error code | ✅ | `payway-sdk explain <code> --json` (96 codes, `sandboxVerified`, `evidence`) |
| Install domain skills | ✅ | `payway-sdk skills install` → `~/.claude/skills`, `.zcode/skills`, `.kilo/skills` (parity-tested) |
| Use the SDK as MCP tools | ✅ | `payway-sdk mcp serve` — 12 read-only tools always, 17 mutating tools only with `--allow-mutations`/`PAYWAY_MCP_ALLOW_MUTATIONS=1`, `readOnlyHint` annotations |
| Let an LLM plan and execute | ✅ | `ask` / `agent` with risk classification, capability readiness, privacy redaction before any provider call, execution ledger, `recover`/`prune` |
| Read configuration programmatically | ❌ | `config` has **no** `--json` (reproduced) |
| Enumerate commands programmatically | ⚠ | `completions` emits a shell script; `introspect()` exists internally but is not exposed as `capabilities --json` |
| Parse any command's output uniformly | ❌ | six shapes (§8.2 C4) |
| Know whether a capability is officially verified | ⚠ | prose in `--help` descriptions and `reference` ("spec-derived, not live-verified"); not queryable |
| Inspect a request before sending | ❌ | no `request inspect` |
| Verify environment before a money-moving call | ❌ | no `env`, no production gate in the CLI (the agent path *does* gate) |
| Diagnose a failure from evidence | ❌ | no `diagnose`; `journal explain` does RCA over local events only |
| Avoid TLS bypass | ❌ | `AGENTS.md` instructs it 19× (P0-04) |
| Learn the rules as data | ❌ | rules are prose + TS constants (§11.1) |

### 27.2 Score by agent-readiness dimension

| Dimension | Score | Evidence |
|---|---:|---|
| Machine-readable docs index | 9/10 | `llms.txt` + `knowledge/MANIFEST.json` (`schema: knowledge-manifest/v1`, per-topic sha256) |
| Offline knowledge retrieval | 9/10 | `docs` command, 42 topics, search, `--json`, freshness-gated |
| Error-code knowledge | 9/10 | 96 codes with provenance; the best such registry I have seen in a payment SDK |
| Tool exposure (MCP) | 8/10 | read-only default, explicit mutation opt-in, `readOnlyHint`, catalog parity tests |
| Agent safety model | 8/10 | `risk.ts` + `authorizePlan` (`--yolo` ≠ production), ledger, privacy redaction, provider-key-never-stored, callback-URL override |
| Skill library | 6/10 | 35 skills, but per-endpoint granularity, no triggers/validation/escalation schema (§23.2) |
| Agent instruction files | 4/10 | four competing entrypoints, no MUST/MUST NOT, TLS bypass taught (P0-04, §28) |
| Uniform machine output | 3/10 | six shapes; `--output` documented but not global |
| State introspection | 3/10 | `config`/`profiles`/`validate` have no JSON; no `env`; no `capabilities` |
| Pre-flight inspection | 1/10 | none |
| Evidence-based diagnosis | 2/10 | `explain` single-code; `journal explain` local-only |
| Rule knowledge as data | 2/10 | prose + constants; no `rules.yaml` |
| **Weighted** | **5.6/10** | |

### 27.3 The ten changes that move agent-readiness from 5.6 to 9

1. `capabilities --json` — the command catalogue (readOnly/mutating/moneyMoving/requiresRsa/environmentsAllowed/**verified**). *Highest value per line of code: `introspect()` already computes 80% of it.*
2. One output envelope everywhere (§9.1) + the §18.4 contract sweep.
3. `request inspect` (§9.4) — turns "read `src/domains/*`" into one call.
4. `env current` + the production guard (§10.4) — makes the agent's safety model match the CLI's.
5. `config --json` and `profiles list --json` — state introspection.
6. `knowledge/rules/*.yaml` (§21.2) — rules, errors, products, environments, symptoms as data with provenance and evidence expiry.
7. `diagnose` (§15.5) with the never-fabricate contract.
8. One `AGENTS.md` (§28) with MUST/MUST NOT/SHOULD/MAY (§30) and decision trees (§29).
9. Remove `NODE_TLS_REJECT_UNAUTHORIZED` from every example; add `NODE_EXTRA_CA_CERTS` + `tlsCaFile` (§32).
10. 14 job-shaped skills with the §23.3 schema (triggers, allowed/prohibited tools, validation, escalation).

---

## 28. Agent Knowledge Architecture

### 28.1 As-is: four competing entrypoints

| File | Lines | Content | Problem |
|---|---:|---|---|
| `AGENTS.md` (root) | 213 | CLI quick-reference, PowerShell-first command table, dated ABA-relay changelog, "CONFLICTS kept open" bullet, 19× `NODE_TLS_REJECT_UNAUTHORIZED='0'` prefixes | It is a *changelog* and a *cheatsheet*, not agent instructions. Teaches a TLS bypass. Duplicates `llms.txt` and the reference doc |
| `.agents/AGENTS.md` | 126 | "Project Rules & Learned Knowledge": domain separation, crypto rules, evidence discipline | The genuinely useful one — but hidden in a dot-directory, second in precedence, and overlapping |
| `HANDOFF.md` | 336 / 107 KB | Mandated pre-task read: current state, decisions, in-flight work | No agent reads 107 KB before a task; the mandate guarantees it is skipped, so the important 5% is lost |
| `docs/agents/{domain,issue-tracker}.md` | 2 files | Agent-facing domain guidance | Fourth surface |
| `llms.txt` | 8 KB | Machine index + "most often gotten wrong" | Good, but a *different* genre — it is for consumers of the library, not contributors to the repo |
| `skills/README.md` | — | Skill installation | Fifth surface |

There is **no** `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, or `.windsurfrules` in-repo (the `skills install` command writes into *user* directories, which is correct for consumers but leaves contributors' agents unguided).

### 28.2 Target: one hierarchy, no duplicate sources of truth

```
AGENTS.md                     ← THE entrypoint (≤250 lines). Read first, always.
├── §1 Identity & scope        (unofficial SDK; what it is/isn't; never claim ABA endorsement)
├── §2 Repository map          (directory → responsibility, from §25.2; ≤20 lines)
├── §3 Non-negotiables         (MUST / MUST NOT — the §30 guardrails, verbatim)
├── §4 Evidence discipline     (official > sandbox > relay > repo > inference; every rule cites
│                               knowledge/rules/*.yaml; never treat repo behaviour as proof of
│                               official PayWay behaviour; UNVERIFIED is a valid answer)
├── §5 Task protocol           (read → reproduce → change → validate → record; the exact commands)
├── §6 Validation commands     (npm ci && npm run build && npm run typecheck && npm test &&
│                               npm run lint && npm run format:check && npm run check:repository)
├── §7 Definition of done      (checklist: tests, docs, rules.yaml, changelog, no new mirrors)
├── §8 Where to look next      (docs/agents/contributing.md, docs/project/, skills/, fixtures/)
└── §9 Escalation              (when to stop and ask a human: money-path changes, hash order,
                                conflicts.yaml entries, production credentials, licence/rights)

docs/agents/
├── contributing.md            ← the long form (build, test tiers, PR expectations, commit style)
├── domain-payments.md         ← from .agents/AGENTS.md "Domain Separation" (canonical)
├── domain-crypto.md           ← hash orders, RSA, callback contracts (points at rules.yaml, never copies)
├── domain-callbacks.md        ← the four verification contracts
├── evidence-log.md            ← dated ABA-relay/sandbox findings (what AGENTS.md's changelog should be)
└── issue-tracker.md           ← existing

llms.txt                       ← unchanged genre: for *consumers* of the library (generated)
skills/*/SKILL.md              ← generated references; each declares authoritative_source + forbidden sources
```

Rules:
1. **One source per fact.** `AGENTS.md` never restates a PayWay rule — it points at `knowledge/rules/rules.yaml`. `.agents/AGENTS.md` is deleted (content merged into `docs/agents/domain-*.md`), and a 3-line `AGENTS.md` pointer replaces it if any tooling depends on the path.
2. **`HANDOFF.md` leaves the public tree** and becomes `docs/project/engineering-log.md` (maintainer line). Its *durable* content (decisions, conflicts, evidence) migrates to `docs/agents/evidence-log.md` and `conflicts.yaml`. Nothing may require reading 107 KB before acting.
3. **Agent instructions are tested.** `src/__tests__/agents-md.test.ts` asserts: `AGENTS.md` ≤ 250 lines; every command it shows exists in `capabilities`; every file path it references exists; it contains no `NODE_TLS_REJECT_UNAUTHORIZED`; it contains the MUST/MUST NOT block verbatim from `knowledge/rules/guardrails.yaml`; and no rule statement appears in both `AGENTS.md` and `rules.yaml` (duplicate-source-of-truth detector).
4. **Per-tool adapters are generated, not authored**: `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md` are 3-line files that say "read `AGENTS.md`" — generated by `scripts/generate/agent-adapters.mjs` so they cannot drift.

---

## 29. Agent Decision Trees

Stored as data (`knowledge/rules/decision-trees.yaml`) so the CLI (`payway agent tree <name>`), the MCP server, the skills, and the docs all render the same tree.

### 29.1 Which PayWay product?

```
START: "accept a payment"
├─ Customer present, scanning a code?
│   ├─ Merchant has a PayWay online merchant profile + API credentials
│   │     → ONLINE QR  (qr create)                      [verified: official]
│   ├─ No network at the point of sale / batch / kiosk
│   │     → OFFLINE KHQR (qr offline)                   [verified: official KHQR guideline]
│   │        ⚠ never sign an offline payload with HMAC-SHA512; CRC-16/CCITT only
│   └─ Dedicated per-customer code (Customer Module) or Soundbox keypad
│         ├─ Customer Module → qr customer               [verified: relay]
│         └─ Soundbox        → qr soundbox               [UNVERIFIED — require acknowledgement]
├─ Customer on a website/app, merchant wants PayWay to host the payment UI?
│     → HOSTED CHECKOUT (checkout create)                [verified: official]
│        ├─ needs a shareable link that outlives the session → payment-link create
│        └─ needs the HTML form only, no API call        → checkout form (local signing)
├─ Recurring / card or account on file?
│     → CoF link (cof link-account | link-card) then cof charge
│        ├─ scheduled subscription (CITR_FIX) → purchase-path trio  [verified: sandbox]
│        └─ unscheduled (CITU/MITU)           → token 90-day rolling window [verified: relay]
├─ Authorise now, capture later?
│     → pre-auth (30-day window, NO auto-release webhook) [verified: relay]
└─ Sending money OUT?
      → payout (beneficiary must be whitelisted first)   [verified: official + sandbox]
      → refund (only against a captured transaction)     [verified: official]
STOP-and-ask conditions: product requires RSA and none is configured; product is UNVERIFIED and
environment is production; the request mixes offline and online primitives.
```

### 29.2 A payment was created — what now?

```
qr create / checkout create returned
├─ HTTP 2xx + status.code 00 + a qr_string/checkout URL
│     → outcome = 'created'.  ⚠ CREATION IS NOT APPROVAL. Never fulfil.
│     ├─ customer may pay → wait for callback OR poll
│     │     ├─ callback arrived
│     │     │     ├─ verified (route-appropriate contract) → transaction verify (status query)
│     │     │     │        ├─ approved + amount + currency + id match → FULFIL (once, idempotently)
│     │     │     │        └─ mismatch → DO NOT FULFIL → diagnose --symptom amount-or-currency-mismatch
│     │     │     └─ NOT verified → 401, log, DO NOT FULFIL → diagnose --symptom callback-unverified
│     │     └─ no callback within the lifetime
│     │           → poll (transaction get / poll) — a missing callback is NOT non-payment
│     │              ├─ approved → verify → fulfil
│     │              ├─ pending  → keep the attempt open; apply the LOCAL expiry policy
│     │              └─ declined/cancelled → close the attempt, allow a retry with a NEW tran_id
│     └─ customer never pays → local expiry/close. There is NO remote EXPIRED status;
│                              an expired attempt may read PENDING for ~24 h.
├─ HTTP 2xx + non-00 code → API_REJECTION → explain <code> → diagnose
├─ HTTP 429 / nested {status:{code:429}} / flat {status:429} → RATE_LIMIT → honour Retry-After
├─ timeout / network error on a MUTATION endpoint → outcome = 'unknown'
│     ⚠ NEVER retry blindly. Query status first (transaction get). The journal records the attempt.
└─ HTML body instead of JSON → hosted-form signal (cof link-card) or a redirect outcome
      → classifyCallback / HostedPageOutcome decoding; do not treat as an error
```

### 29.3 A request failed — how to triage?

```
failure
├─ local PayWayConfigError/PayWayValidationError (never reached the network)
│     → read error.correction; run `payway doctor --check <ids in the message>`; fix config
├─ HTTP 401/403
│     ├─ paywayCode PTL171/PTL175 → key rotation (zero-overlap) → re-issue in the portal. DO NOT retry.
│     ├─ paywayCode 6  → callback/return domain not whitelisted → fix the URL, not the code
│     ├─ paywayCode 35 → payout entry keys wrong for this endpoint ({acc,amt} vs {account,amount})
│     └─ paywayCode 96 → payment-link id does not exist (also the double-void terminal signal PTL188)
├─ paywayCode 01 / "Wrong hash" / PTL02
│     → request inspect <op> --show-preimage  →  compare the field ORDER against
│       knowledge/rules/rules.yaml#<op> and evidence/<rule>.md
│     → most common causes, in order: (1) field order/omitted empty position, (2) amount formatting
│       mismatch between body and preimage, (3) base64 field double-encoded, (4) wrong api key,
│       (5) lifetime unit (see conflicts.yaml#QR-LIFE-001)
├─ HTTP 429 → rate limit → respect the per-endpoint rule; enable client throttling (already default)
├─ timeout on a mutation → 'unknown' → status query before anything else (§29.2)
└─ anything else → diagnose --symptom <…> --from-journal → report confirmed/likely/possible/unknown
      ⚠ NEVER invent a cause. If confirmed is empty, say so and list requiredEvidence.
```

### 29.4 Should this operation run at all?

```
operation requested
├─ readOnly (transaction get/detail/list/by-ref, exchange-rate, explain, docs, status, journal *,
│            doctor, config, env current, capabilities, products, rules, request inspect, sandbox info)
│     → ALLOW in any environment
├─ creates a payment attempt (qr/checkout/payment-link create, cof link-*)
│     ├─ sandbox → ALLOW (idempotency warning if the tran_id was already used)
│     └─ production → ALLOW with confirmation; require a fresh tran_id; journal on
├─ moves money or terminates a payment (refund, payout, pre-auth complete/cancel, close-transaction,
│                                        payment-link void, cof token remove)
│     ├─ sandbox → confirm once (-y acceptable)
│     └─ production → --confirm-production REQUIRED (exit 6 without it); -y never substitutes;
│                     print merchant id + amount + currency + transaction id before acting
├─ capability is UNVERIFIED (qr soundbox, self-activation, subscription hash positions)
│     └─ production → refuse unless --allow-unverified AND --confirm-production
└─ environment is production and the command is sandbox-only (sandbox *, demo, test-cards, beneficiaries)
      → REFUSE (exit 6)
```

---

## 30. Agent Guardrails (MUST / MUST NOT / SHOULD / SHOULD NOT / MAY)

Stored in `knowledge/rules/guardrails.yaml`, rendered verbatim into `AGENTS.md` §3, `llms.txt`, `skills/*/SKILL.md`, and the MCP server's instructions field — one source, four renderings, tested for identity.

### MUST
1. **MUST** treat a successful creation response as `created`, never as `approved`. Fulfilment requires a verified status query with matching amount, currency, and transaction id.
2. **MUST** verify every callback with the contract of its route (signed sorted-key for online checkout; raw-body HMAC for Customer Module; **no signature exists** for payment-link pushbacks and offline KHQR notifications — verify those by status query).
3. **MUST** respond to an unverified callback with an error status and must not process it.
4. **MUST** keep `tran_id` ≤ 20 characters, unique per attempt, and **must** mint a new one for any retry — transaction ids are not idempotency keys.
5. **MUST** query transaction status before retrying any operation that timed out or failed with a network error.
6. **MUST** keep `apiKey`, RSA private material, `pwt`/payment tokens, `hash` values, `merchant_auth` ciphertext, and callback signature headers out of logs, journals, JSON output, issue reports, and AI-provider payloads.
7. **MUST** cite a provenance (`official` / `sandbox` / `relay` / `repo`) for any PayWay behaviour it asserts, and **MUST** mark `UNVERIFIED` when none exists.
8. **MUST** run the validation set (`build`, `typecheck`, `test`, `lint`, `format:check`, `check:repository`) before declaring a change complete.
9. **MUST** use `NODE_EXTRA_CA_CERTS` for a corporate/self-signed CA.
10. **MUST** require explicit human authorisation before any money-moving operation in production.
11. **MUST** keep offline KHQR (EMVCo TLV + CRC-16/CCITT) and online PayWay QR (HMAC-SHA512) strictly separate — never mix primitives.
12. **MUST** record every gateway exchange in the journal when running CLI commands that move money (journaling is on by default; do not disable it to "clean up" output).

### MUST NOT
1. **MUST NOT** set `NODE_TLS_REJECT_UNAUTHORIZED=0` — not globally, not per command, not in an example, not in a test. (This reverses the current `AGENTS.md` guidance; see P0-04.)
2. **MUST NOT** infer official PayWay behaviour from this repository's behaviour, tests, or docs. The repo is an unofficial implementation.
3. **MUST NOT** treat a missing callback as a failed or absent payment.
4. **MUST NOT** treat `PENDING` as "still alive" indefinitely, nor invent an `EXPIRED`/`CLOSED` remote status — neither exists.
5. **MUST NOT** fulfil on `PRE_AUTH` (code 0 with status `PRE_AUTH`) or on `REFUNDED`.
6. **MUST NOT** deduplicate payments on `merchant_ref`; repeat payments on one reference get new `tran_id`s and may be an OVERPAID case requiring review.
7. **MUST NOT** fabricate a diagnosis. If evidence does not support a cause, report `unknown` with the evidence required.
8. **MUST NOT** change a `*_HASH_FIELDS` order, a rate-limit constant, a status-code map, or any `source:'official'` rule without an evidence file and maintainer review.
9. **MUST NOT** run any test, probe, fixture, scenario, or example against `checkout.payway.com.kh`.
10. **MUST NOT** commit `.env`, `profiles.json`, journals, webhook captures, linked-token stores, or generated corpora.
11. **MUST NOT** pass a secret as a command-line argument when a `--*-file`/stdin alternative exists.
12. **MUST NOT** add a second source of truth for a rule, command, env var, or error code — extend `knowledge/rules/*.yaml` and regenerate.
13. **MUST NOT** claim ABA endorsement, official status, or a settlement/finance sign-off.
14. **MUST NOT** retry a mutation endpoint automatically (`MUTATION_ENDPOINTS` are single-attempt by policy).

### SHOULD
1. **SHOULD** run `payway env current` and `payway doctor --route <route>` before any integration work, and re-run `doctor --check <id>` after each fix.
2. **SHOULD** use `payway request inspect` before the first call to any endpoint, and `--show-preimage` when debugging a signature failure.
3. **SHOULD** prefer `--output json` for anything consumed programmatically, and `ndjson` for streams.
4. **SHOULD** enable `strictValidation` in CI/staging — but only after the P0-02/P0-03 rule defects are fixed, because today it converts two wrong advisories into hard failures.
5. **SHOULD** use the journal (`journal timeline/reconcile/explain/anomalies`) as the first source of evidence when diagnosing.
6. **SHOULD** implement a durable outbox with its own idempotency key for downstream fulfilment, because a verified approval authorises a payment posting, not a shipping outcome.
7. **SHOULD** keep callback handlers fast: validate and durably accept, return 2xx, then process asynchronously.
8. **SHOULD** reconcile per settlement cycle against the merchant's actual portal export and bank statement, with an approved tolerance — and treat amount/time/masked-PAN similarity as an investigation lead only.
9. **SHOULD** mark every capability it builds on with its `verified` level, and prefer `official`/`sandbox` over `relay`/`spec` on money paths.
10. **SHOULD** add a fixture (with provenance) whenever a new gateway response shape is observed.

### SHOULD NOT
1. **SHOULD NOT** poll a transaction that is already terminal, or poll `transaction-detail` faster than its 10/min rule.
2. **SHOULD NOT** derive `transaction-list` date windows from UTC or local time — the gateway interprets them as UTC+7.
3. **SHOULD NOT** rely on a sandbox result to prove production behaviour (the simulator produces no declines, no settlement, no chargebacks, no production rate limits, no key rotation).
4. **SHOULD NOT** advertise `google_pay` without confirming profile availability with ABA.
5. **SHOULD NOT** subtract a refund from a settlement total twice, or assume fees are always netted (or always separate) — use the signed agreement's component model.
6. **SHOULD NOT** leave `PAYWAY_LOG_LEVEL=trace` enabled in production.
7. **SHOULD NOT** store production and sandbox credentials in the same profile file without distinct names and an environment guard.

### MAY
1. **MAY** use the offline demo (`payway demo`, `first-payment` demo mode) for any workflow that does not require real gateway behaviour.
2. **MAY** enable the circuit breaker, custom rate-limit rules, and `mutationRetryPolicy` overrides — the defaults are safe and the overrides are opt-in.
3. **MAY** use `allowPrivateCallbackHosts: true` for an on-premises gateway that legitimately reaches private hosts.
4. **MAY** install skills into any supported agent directory; **MAY** use the MCP server with `--allow-mutations` in a sandbox-only configuration.
5. **MAY** extend the fixture corpus and the rules registry directly — that is the intended contribution path.

---

## 31. Findings Register

### 31.1 Format

Every finding: **ID · Severity · Area · Location · Current State · Evidence · Problem · Developer Impact · Root Cause · Target State · Specification · Dependencies · Risks · Validation · Acceptance Criteria · Estimated Complexity · Recommended Phase.** P0/P1 findings carry the full record; P2/P3 carry a condensed record with the same fields in table form (§31.4/§31.5).

### 31.2 P0 findings

---

#### P0-01 — The public repository publishes material the project's own release decision excluded

- **Severity:** P0 · **Area:** Governance / Security / Legal
- **Location:** repo root: `audit-results/` (49 files), `.scratch/` (156), `.zcode/` (132), `.kilo/` (3), `HANDOFF.md`, `docs/internal/`, `docs/strategy/`, `docs/archive/`, `docs/project/HISTORY-SECRET-TRIAGE.md`, `docs/HISTORY-SECRET-TRIAGE.csv`, `payway-openapi/`, `docs/superpowers/`, `docs/test-cases/`
- **Current state:** all of the above are tracked in the public repository `Ruzaid-aman/ABA-Payway-SDK-unofficial`.
- **Evidence:** `docs/project/RELEASE-READINESS.md` item A, owner decision 2026-10-01: *"Publish a fresh public history from a curated tree and retain this checkout as the private development line… do not create, push, or tag the public repository until it is agreed."* The same document lists the material a stranger should not need: `docs/SANDBOX-FINDINGS.md`, `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md`, `audit-results/`, `docs/HISTORY-SECRET-TRIAGE.*`, `HANDOFF.md` internals, competitive analyses, `payway-openapi/` (ABA's shared spec), `docs/archive/`. Item B: *"MIT on this project does not license third-party material. Before public visibility: confirm rights or exclude `payway-openapi/`…, `docs/archive/` official-doc copies, quotes/screenshots inside competitive analyses…"* — recorded as **pending**. `docs/project/HISTORY-SECRET-TRIAGE.md` still states *"Publication remains blocked."* `docs/project/RELEASE_CHECKLIST.md` has every box unchecked up to "Public repository gate".
- **Problem:** the published artifact contradicts the project's own written, dated governance decision, and includes third-party material (ABA's shared OpenAPI spec, official-doc archive copies, vendored `mattpocock/skills`, verbatim third-party Telegram transcripts) whose redistribution rights the project itself records as unconfirmed, under an MIT header that does not grant them.
- **Developer impact:** (a) a contributor or agent reading `audit-results/`, `.scratch/`, or `HANDOFF.md` treats stale internal plans as current requirements — `HANDOFF.md` is a *mandated* 107 KB pre-read, so the cost is imposed on everyone; (b) the repo's credibility as an integration reference is undermined by publishing internal dossiers and partner-channel transcripts; (c) legal exposure for the maintainer.
- **Root cause:** the public repo was created from the private working tree rather than from the curated tree the decision specified; no gate compares the tracked file list against an allow-list.
- **Target state:** the public tree contains only product, docs, examples, fixtures, skills, generated-reference inputs, and CI. Internal process material lives on a private line. A committed `repository-manifest.yaml` allow-list makes the boundary executable.
- **Specification:**
  1. Create `.maintainer/` on the private line and move `HANDOFF.md`, `audit-results/`, `.scratch/`, `.zcode/`, `.kilo/`, `docs/internal/`, `docs/strategy/`, `docs/archive/`, `docs/superpowers/`, `docs/test-cases/`, `docs/project/` (except a public `ROADMAP.md`) into it.
  2. Add `scripts/gates/check-repository-manifest.mjs`: reads `repository-manifest.yaml` (`{public: [globs], private: [globs], generated: [globs], thirdParty: [{path, upstream, license, disposition}]}`) and fails on any tracked file matching none of `public`/`generated`, or matching `private`. Wire into `npm run check:repository` and CI (blocking).
  3. Resolve `payway-openapi/` rights with ABA in writing; until resolved, exclude the sources and keep only the generated `src/types.ts` (a derived artifact) plus a `NOTICE` stating the derivation.
  4. For each `thirdParty` entry record `{upstream, commit, license, notice}`; add `NOTICE` and `THIRD-PARTY-LICENSES` files; extend `skills-lock.json` to all 37 skills.
  5. Because the public history is already a single orphan commit (`git rev-list --count HEAD` = 1), removal is a normal commit — **no history rewrite is needed**, which is why this is achievable in days.
- **Dependencies:** owner sign-off on the file list (already recorded as item B "approval item"); ABA response on spec rights; nothing technical blocks it.
- **Risks:** breaking links from external references to `docs/internal/*` → mitigate with `docs/project/MOVED.md` and HTTP 410-style stubs; losing evidence traceability → the private line retains everything and `knowledge/rules/evidence/` keeps the *quotations* that matter.
- **Validation:** `check:repository` passes; `git ls-files | wc -l` ≤ ~800; `npm run check:public-docs` passes; a fresh clone contains no path matching the `private` globs; `npm pack` contents unchanged in function.
- **Acceptance criteria:** (1) the manifest gate is blocking in CI and green; (2) zero tracked files match `private` globs; (3) `RELEASE-READINESS.md` items A/B updated to record execution with the date; (4) every third-party path has a licence + notice entry; (5) `HISTORY-SECRET-TRIAGE` and `RELEASE_CHECKLIST` no longer say "publication remains blocked" while the repo is public.
- **Estimated complexity:** M (mechanical, but requires owner decisions) · **Phase 0**

---

#### P0-02 — The purchase `payment_option` enum is derived from an archived spec and rejects an officially documented value

- **Severity:** P0 · **Area:** SDK correctness / Rules provenance
- **Location:** `src/constants.ts:381-396` (`PURCHASE_PAYMENT_OPTIONS`), `src/domains/checkout.ts:320-325` (advisory) and `:359-364` (subscription advisory), `src/utils.ts:36-46` (`warnAdvisory` → throws under `strictValidation`)
- **Current state:** `PURCHASE_PAYMENT_OPTIONS = ['cards','abapay','abapay_deeplink','abapay_khqr_deeplink','google_pay']`. The doc-comment states the source: *"The archived gateway spec (`docs/archive/Default module.openapi.json`) documents `cards`, `abapay`, `abapay_deeplink`… QR-only values (`abapay_khqr`, `wechat`, `alipay`) are intentionally absent."*
- **Evidence:**
  - **OFFICIAL** (retrieved 2026-10-05, `developer.payway.com.kh/purchase-14530820e0` via the Purchase parameter table): purchase `payment_option` values are `cards`, **`abapay_khqr`** ("QR payment that can be scanned and paid using ABA PAY and other KHQR member banks"), `abapay_khqr_deeplink`, `alipay`, `wechat`, `google_pay`. `abapay` and `abapay_deeplink` do **not** appear.
  - **Reproduced (this audit):** `createCheckoutDomain({strictValidation:true}).purchase({paymentOption:'abapay_khqr', …})` →
    `PayWayConfigError | payment_option "abapay_khqr" is outside the documented purchase enum (cards, abapay, abapay_deeplink, abapay_khqr_deeplink, google_pay)`
  - **Reproduced in the repo's own passing test run:** stderr from `src/__tests__/sdk-facade.test.ts > sdk.runTestSuite` emits the same advisory for `abapay_khqr` — i.e. the SDK warns against itself on its default path.
  - `QUICKSTART.md` §6 uses `paymentOption: 'abapay_khqr'` with `sdk.initiate` → `server.initiateTransaction` → `checkout.purchase` (`src/server/index.ts:161-169`), so the canonical quickstart triggers it.
- **Problem:** an archived 2021-era spec copy is treated as more authoritative than the current official documentation, and the resulting enum is enforced — as an advisory by default and as a **hard failure** under `strictValidation`, which is exactly the mode a careful integrator or an instructed agent enables.
- **Developer impact:** a merchant integrating KHQR-through-purchase (a documented, common path — the official Ecommerce Checkout page lists "Subscriptions & bills" and ABA Pay/KHQR as purchase methods) is told their valid value is invalid; with strict mode on, they are **blocked** and must either disable strict validation (losing every other protection) or patch the SDK. An AI agent following "enable strict validation" guidance will refuse to build a working integration.
- **Root cause:** no rule registry with mandatory provenance and no conformance test comparing repo enums against captured official documentation (§21.2 rule 2 would have caught this).
- **Target state:** `PURCHASE_PAYMENT_OPTIONS = ['cards','abapay_khqr','abapay_khqr_deeplink','alipay','wechat','google_pay']` (official), with `abapay`/`abapay_deeplink` retained in a separate `PURCHASE_PAYMENT_OPTIONS_LEGACY` set that is advisory-only, labelled `source:'archived'`, and documented as accepted-by-older-profiles. Both sets live in `knowledge/rules/rules.yaml#PUR-003` with an `evidence/PUR-003.md` file quoting the official table and its retrieval date.
- **Specification:**
  1. Create `knowledge/rules/rules.yaml` + `evidence/PUR-003.md` (quote + URL + date).
  2. Generate `src/core/enums.ts` from the yaml (`scripts/generate/gen-rules.ts`); delete the hand-written arrays in `constants.ts` (re-export for compatibility).
  3. `domains/checkout.ts`: validate against the official set (HARD when `source:'official'`), then against legacy (ADV, message says "accepted by older merchant profiles; not in current official docs").
  4. Subscription path (`:359-364`): replace `['cards','abapay','abapay_deeplink']` with the official set ∪ legacy, and mark the subscription-specific restriction `UNVERIFIED` in `conflicts.yaml` until ABA confirms which options a `CITR_FIX` registration accepts.
  5. `warnAdvisory` promotes only `source:'official'` advisories under `strictValidation` (§7.3) — so a repo opinion can never become a hard blocker again.
  6. Add `src/__tests__/rules-conformance.test.ts` (T6): every `source:'official'` enum/limit must have an evidence file ≤180 days old; every enum value in code must appear in `rules.yaml`.
- **Dependencies:** §21.2 (rules registry) — but steps 1–4 can ship standalone in Phase 0 with the yaml introduced for this one rule.
- **Risks:** a merchant profile that genuinely only accepts `abapay`/`abapay_deeplink` would now see an advisory instead of nothing → acceptable (advisory, not rejection); changing the enum changes `PAYMENT_OPTIONS`-derived docs → regenerate.
- **Validation:** the reproduction above returns `ACCEPTED`; `sdk.runTestSuite` emits no advisory; new tests cover official ∪ legacy ∪ invalid; `rules check --against` a purchase request with each value behaves as specified; QUICKSTART §6 runs clean under `PAYWAY_STRICT_VALIDATION=1`.
- **Acceptance criteria:** (1) `abapay_khqr`, `alipay`, `wechat` accepted on the purchase path in both normal and strict mode; (2) `abapay`/`abapay_deeplink` accepted with an `source:'archived'` advisory; (3) `rules.yaml#PUR-003` has an evidence file with URL + retrieval date; (4) the conformance test fails if the evidence file is removed or expires; (5) `strictValidation` no longer promotes non-official advisories; (6) the repo's own test run emits no purchase-enum advisory.
- **Estimated complexity:** S–M · **Phase 0** (correctness) with the registry generalising in **Phase 2**

---

#### P0-03 — `generate-qr` lifetime: the repository encodes seconds while official documentation specifies minutes

- **Severity:** P0 · **Area:** SDK correctness / Rules provenance
- **Location:** `src/constants.ts:316-325`, `src/utils.ts:169-205` (`validateLifetime`, `validateQrLifetimeSeconds`), `src/domains/qr.ts` (call site), `src/cli.ts` (`generate-qr --lifetime` help text), `llms.txt` ("`--lifetime` is SECONDS on generate-qr but MINUTES on generate-checkout"), `AGENTS.md` ("CONFLICTS kept open: generate-qr lifetime unit")
- **Current state:** `QR_LIFETIME_MIN_SECONDS = 180` with the comment *"The API takes whole minutes and rejects anything below 3 with an opaque HTTP 400 code '04' (sandbox-pinned boundary 2026-08-30: 179s → 400 '04', 180s → OK)"*; `QR_LIFETIME_MAX_SECONDS = 120 * 24 * 60 * 60` ("120 days (OpenAPI spec)"); `lifetime` is optional; the CLI flag is seconds; the validator is named `…Seconds` and its message says "at least 180 seconds (3 minutes)".
- **Evidence:**
  - **OFFICIAL** (`developer.payway.com.kh/qr-api-14530840e0`, retrieved 2026-10-05): `lifetime` — integer, **Required**, *"Transaction lifetime in minutes. Default: 30 days. Minimum: 3 mins. Maximum: 30 days."* The official example request uses `"lifetime": 6`.
  - The repo's own comment says the API "takes whole minutes" while the constant, the validator name, the error message, the CLI flag, and `llms.txt` all say **seconds**. The 179→400 / 180→OK sandbox boundary is consistent with seconds and inconsistent with minutes (179 minutes ≫ the 3-minute official minimum, so it should not have been rejected).
  - `QR_LIFETIME_MAX_SECONDS = 120 days` is sourced from the **archived** spec; official says **30 days**.
- **Problem:** the single most-used QR parameter has an unresolved unit conflict that the project knows about (`AGENTS.md` "CONFLICTS kept open") and shipped as prose. Two mutually exclusive interpretations are simultaneously encoded in names, messages, docs, and flags.
- **Developer impact:** a merchant who reads the official docs and passes `lifetime: 6` (6 minutes) gets a QR that this SDK will **reject** (`6 < 180`); a merchant who reads `llms.txt` and passes `360` for 6 minutes gets 360 minutes (6 hours) if the gateway means minutes — a QR that outlives the order by 60×, which is a real fraud/ops exposure. An AI agent has a 50% chance of picking the wrong unit, and both choices are "documented".
- **Root cause:** same as P0-02 — no rule registry, no evidence expiry, no conflict register with a gate; plus a sandbox observation from one date was allowed to override official documentation without a recorded reconciliation.
- **Target state:** one canonical unit (**minutes**, matching official docs), an explicit `--lifetime-unit seconds|minutes` during migration, a `conflicts.yaml` entry that stays open until ABA confirms, and validators whose names/messages cannot disagree with the constant they enforce.
- **Specification:**
  1. `knowledge/rules/rules.yaml#QR-013`: `{statement: "generate-qr lifetime is in minutes; required; min 3; max 43200 (30 days); default 43200", source: official, evidence: evidence/QR-013.md}`; `#QR-013-SBX`: `{statement: "sandbox rejected 179 and accepted 180 on 2026-08-30", source: sandbox, evidence: evidence/QR-013-SBX.md}`.
  2. `knowledge/rules/conflicts.yaml#QR-LIFE-001`: `{rule: QR-013, officialStatement: "minutes, min 3, max 30 days", officialUrl, retrievedAt: 2026-10-05, repoBehaviour: "seconds, min 180, max 120 days, optional", sandboxEvidence: "179→HTTP400 code 04; 180→OK (2026-08-30)", status: open, impact: "60× lifetime error in either direction", requiredConfirmation: "ABA integration contact: does generate-qr interpret lifetime as minutes or seconds, and what are the bounds?", owner: maintainer}`.
  3. Re-run the boundary probe (`scripts/probes/qr-lifetime.probe.ts`) recording `lifetime ∈ {1,2,3,4,5,6,179,180,181,43200,43201}` and the resulting QR expiry read back from `transaction detail` — this resolves the conflict empirically within one sandbox session and produces the evidence file.
  4. Until resolved: `qr create --lifetime <n> --lifetime-unit <seconds|minutes>` with **minutes** as the default and a stderr advisory when a bare `--lifetime` value is ambiguous (`> 43200` or `< 3` under one interpretation and valid under the other). `request inspect` prints the conflict record inline.
  5. After resolution: rename to `QR_LIFETIME_MIN`/`QR_LIFETIME_MAX` + `QR_LIFETIME_UNIT` (unit in the data, not the identifier), align the max with the confirmed bound, make `lifetime` required or default it to the official 30 days, and delete `validateQrLifetimeSeconds` in favour of `validateLifetime(value, {unit, min, max, ruleId})`.
  6. `go-live check` reports a **BLOCKER** while `QR-LIFE-001` is open (§36).
- **Dependencies:** sandbox credentials for the probe; `conflicts.yaml` (§21.2); `request inspect` (§9.4) for surfacing.
- **Risks:** changing the default unit is breaking → the 2.0.0 major is already required (§34), and the `--lifetime-unit` flag plus a one-release advisory window makes it safe; if the probe shows the gateway really means seconds, the official docs are wrong and must be reported to ABA (which is itself a valuable outcome, and the evidence file records it).
- **Validation:** probe results committed as evidence; unit tests for both interpretations; `qr create --lifetime 6` behaves per the confirmed rule; `request inspect qr.create --lifetime 6` shows the normalization record and, while open, the conflict; a test asserts no identifier/message in `src/**` states a lifetime unit that contradicts `rules.yaml`.
- **Acceptance criteria:** (1) exactly one unit is canonical in code, CLI, docs, and skills; (2) no identifier name, error message, `--help` text, or `llms.txt` line contradicts it; (3) `conflicts.yaml#QR-LIFE-001` is either `resolved` with evidence or `open` with a `go-live` BLOCKER and an `request inspect` warning; (4) the max bound matches the confirmed value (30 days official vs 120 days archived — one of them is wrong and the evidence says which); (5) a test fails if the two ever diverge again.
- **Estimated complexity:** M (the probe is an hour; the rename touches many files) · **Phase 0** for the conflict register + probe, **Phase 2** for the canonical rename

---

#### P0-04 — Agent instructions teach TLS-certificate-verification bypass for a payment gateway

- **Severity:** P0 · **Area:** Security / Agent instructions
- **Location:** `AGENTS.md` (19 occurrences of `NODE_TLS_REJECT_UNAUTHORIZED='0'` prefixing canonical copy-pasteable commands, plus a later caveat "scoped to the command only… Never set it globally"); `scripts/sandbox-probe-*.ts` (8 files); `docs/**` (9 occurrences)
- **Current state:** the recommended way to run every documented CLI command in the agent instruction file is with certificate verification disabled. There is no `NODE_EXTRA_CA_CERTS` guidance anywhere, and neither the SDK nor the CLI offers a CA-bundle option (`PayWayConfig` has no `tlsCaFile`/`agent`/`dispatcher` field).
- **Evidence:** `grep -rn "NODE_TLS_REJECT_UNAUTHORIZED" AGENTS.md | wc -l` → 19; `grep -rn "NODE_EXTRA_CA_CERTS" . --include=*` → 0 hits; `PayWayConfig` field census in `src/client.ts:105-230` → no TLS option.
- **Problem:** the instruction file that agents are told to read first teaches them to disable the single control that prevents MITM on a payment API, and offers no alternative. Agents transpose instructions into merchant code; the caveat appears far below the 19 examples, so the examples are what gets copied.
- **Developer impact:** a merchant integration that silently accepts any certificate — on the endpoint that carries signed payment requests and, in the callback direction, is the trust anchor for fulfilment decisions. Also: a developer behind a corporate MITM proxy has *no supported path*, which is presumably why the bypass became canonical.
- **Root cause:** a real environment problem (corporate/self-signed CA) was solved with the least safe available workaround, and the workaround was promoted into instructions instead of being fixed in the product.
- **Target state:** TLS verification is never disabled by this project. Corporate CAs are supported first-class. A `doctor` check explains and fixes the failure.
- **Specification:**
  1. Add `PayWayConfig.tlsCaFile?: string` and `PAYWAY_TLS_CA_FILE`, wired into the transport's `fetch` dispatcher (`undici` `Agent({connect:{ca}})`), plus `tlsMinVersion` defaulting to TLS 1.2. Document in `getting-started/configuration.md` (generated from `env-vars.yaml`).
  2. `doctor NET-003` (TLS chain validates) reports the exact failure (`self-signed certificate in certificate chain`, `unable to get local issuer certificate`, hostname mismatch, expired) and the fix: `export NODE_EXTRA_CA_CERTS=/path/to/corp-root-ca.pem` **or** `PAYWAY_TLS_CA_FILE=…`. `doctor NET-004` fails as a **blocker** when `NODE_TLS_REJECT_UNAUTHORIZED` is set to `0`.
  3. Remove all 19 occurrences from `AGENTS.md`; remove from `docs/**`; in `scripts/probes/*` replace with `NODE_EXTRA_CA_CERTS` and a `--insecure` opt-in flag that logs a warning and is refused in CI.
  4. Add `src/__tests__/agents-md.test.ts` assertion: no `NODE_TLS_REJECT_UNAUTHORIZED` in `AGENTS.md`, `docs/**`, `skills/**`, `knowledge/**`, `examples/**` (allow-list: the `doctor` check implementation and its test).
  5. Add the guardrail to `guardrails.yaml` (MUST #9, MUST NOT #1) so it renders into every agent surface (§30).
- **Dependencies:** `undici` Agent wiring (Node ≥18 built-in; the SDK already uses global `fetch`); `env-vars.yaml` for the new variable.
- **Risks:** a developer whose only working setup was the bypass loses it → the `doctor` fix path plus `tlsCaFile` is strictly better and takes minutes; probe scripts that relied on it must be updated in the same change.
- **Validation:** `grep -rn NODE_TLS_REJECT_UNAUTHORIZED` returns only allow-listed paths; with a self-signed CA in `NODE_EXTRA_CA_CERTS`, `doctor --live` and a real `exchange-rate` call succeed; with `NODE_TLS_REJECT_UNAUTHORIZED=0` set, `doctor` reports NET-004 blocker and exits non-zero; `tlsCaFile` unit-tested with a local TLS server.
- **Acceptance criteria:** (1) zero instructional occurrences repo-wide; (2) `tlsCaFile`/`PAYWAY_TLS_CA_FILE` implemented, documented, tested; (3) `doctor` NET-003/NET-004 implemented with actionable fixes; (4) a test prevents reintroduction; (5) `guardrails.yaml` carries MUST #9 / MUST NOT #1 and renders into `AGENTS.md`, `llms.txt`, skills, and MCP instructions.
- **Estimated complexity:** S–M · **Phase 0** (instruction removal is same-day; `tlsCaFile` is a few hours)

---

#### P0-05 — CI cannot pass as written, and has never run, so no quality gate is operational

- **Severity:** P0 · **Area:** CI/CD / Quality gates
- **Location:** `.github/workflows/ci.yml` (job order: Install → **Typecheck** → Lint → **Build** → Test → …), `CONTRIBUTING.md`, `docs/project/RELEASE_CHECKLIST.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `src/__tests__/sdk-facade-and-tunnel.test.ts:98-110`, `src/webhook/tunnel.ts`
- **Current state:** two independent, reproduced defects make the pipeline red on a clean checkout, and `docs/project/RELEASE-READINESS.md` records *"Hosted CI — Workflows exist under `.github/workflows/` but have never run on a remote."*
- **Evidence:**
  1. **Typecheck before build.** On a clean clone after `npm ci`: `npm run typecheck` → **exit 2**, six `TS2307 Cannot find module 'aba-payway-ts'` errors in `docs/examples/backend/*.ts`, `examples/first-payment/src/payments.ts`, `examples/integration-recipes/{payway-gateway,service}.ts`, `src/__tests__/docs-examples.test.ts`. After `npm run build`: `npx tsc --noEmit` → **exit 0**. Cause: the package self-references by name, resolved through `package.json#exports` → `dist/index.d.ts`, which does not exist until the build runs. `CONTRIBUTING.md`, `RELEASE_CHECKLIST.md`, and the PR template all document `npm ci && npm run build && npm run typecheck` — **CI contradicts the project's own documented order.**
  2. **Platform-shaped test.** `npx vitest run` on Linux → **1 failed / 2353 passed / 24 skipped (161 files, 130.5 s)**. The failure: `src/__tests__/sdk-facade-and-tunnel.test.ts` → `spawn /tmp/payway-tunnel-*/fake-cloudflared.cmd EACCES`. The test writes a `.cmd` fixture and expects it to be spawned; `src/webhook/tunnel.ts` prefers `.cmd`/`.ps1` on win32, but the test has no `process.platform` gate, so on Linux the file is created without the execute bit and spawn fails.
  3. `npm run lint` → exit 0 (2 warnings, 6 infos) — so lint is not the blocker; `npx biome format src` → **exit 1, 181 files** — and `format` is not in CI at all (P1-09).
- **Problem:** every "green gate" claim in `RELEASE-READINESS.md`, `RELEASE_CHECKLIST.md`, and `PROJECT_STATUS.md` is a *local Windows* result. No gate has ever executed on a hosted runner, so typecheck, cross-platform tests, packaging smoke, secret scanning, and coverage floors are all unenforced on the branch that is public.
- **Developer impact:** a contributor or agent cannot trust "CI is green" (there is no CI), cannot reproduce the documented local order in CI, and gets a red pipeline on their first PR for reasons unrelated to their change — which trains people to ignore or bypass gates.
- **Root cause:** the workflow was authored against a local Windows development loop where `dist/` already existed and `.cmd` fixtures worked; the "never run on a remote" state was recorded but never resolved before publication.
- **Target state:** CI is green on a clean checkout on both OS matrix entries, in an order that matches the documented developer order, with `format:check` and a CJS smoke test added, and every gate's blocking status explicit.
- **Specification:** see §33 for the full workflow specification. Minimal Phase-0 fix:
  1. Reorder to `Install → Build → Typecheck → Lint → Format-check → Test → Package checks → Smoke`.
  2. Gate the tunnel test: `it.skipIf(process.platform !== 'win32')` for the `.cmd` fixture, plus a POSIX variant (`#!/bin/sh` + `chmod 0o755`) so the behaviour is covered on Linux too; add `src/webhook/tunnel.ts` unit coverage for binary resolution per platform.
  3. Add `format:check` (`biome format src scripts skills --changed` on PRs; full on `main`) and fix the 181 files in one dedicated, reviewable commit (§P1-09).
  4. Add a CJS smoke job (`node -e "require('aba-payway-ts')"`, `node dist/cli.cjs --version`, `mcp --list-tools`) to catch the `import.meta` defect (L6).
  5. Add a job that installs and tests each `integrations/boilerplate/*` sub-project (fixes T2) and one that installs `better-sqlite3` so the 24 skipped SQLite tests run (fixes T3).
  6. Make gitleaks blocking (install the binary; drop `continue-on-error` + manual outcome inspection in favour of a hard fail with an allow-list).
- **Dependencies:** none technical; requires pushing the branch so the workflow runs (already true — a remote exists).
- **Risks:** the first green run may surface further latent failures (that is the point); fixing 181 formatting files creates a large diff → isolate it in its own commit with `.git-blame-ignore-revs`.
- **Validation:** the workflow runs on the PR and on `main`; both OS entries green; `npm ci && npm run build && npm run typecheck && npm test && npm run lint && npm run format:check` passes locally in that exact order on Linux **and** Windows; a deliberately broken PR (type error, unformatted file, failing test, planted secret) is blocked by the corresponding gate.
- **Acceptance criteria:** (1) CI green on a clean checkout, both OSes; (2) the documented order and the CI order are identical; (3) `npm test` passes on Linux with 0 failures; (4) `format:check` is a gate and the tree is formatted; (5) CJS smoke, boilerplate sub-project tests, and SQLite suites all execute; (6) gitleaks fails the build on a planted secret; (7) `RELEASE-READINESS.md` item "Hosted CI" updated from "never run" to a recorded green run SHA.
- **Estimated complexity:** S (reorder + 2 test fixes) to M (full §33 programme) · **Phase 0** for the two blockers, **Phase 1** for the rest

### 31.3 P1 findings

---

#### P1-01 — No production safety gate in the CLI, while the agent layer has one

- **Severity:** P1 · **Area:** Safety / CLI architecture
- **Location:** `src/cli.ts` (all mutating commands: `refund`, `payout`, `close-transaction`, `payment-link void`, `pre-auth *`, `cof charge`, `cof token remove`, `beneficiary add`), `src/agent/risk.ts` (the model that should be shared), `src/config/profiles.ts`
- **Current state:** `-y/--force` skips confirmation unconditionally, in every environment. `production` appears three times in `src/cli.ts`, none as a gate. There is no `env` command, no environment banner, no credential↔environment coherence check, and no `PAYWAY_ALLOW_PRODUCTION`-style override. Meanwhile `src/agent/risk.ts` implements exactly the right model: `RiskLevel = safe | sandbox | production | blocked`, `authorizePlan` where *"`--yolo` authorizes only sandbox … and is NOT sufficient for production"*, and out-of-scope tools blocked.
- **Evidence:** `grep -n "production" src/cli.ts` → 3 non-gate hits; `sed -n '60,140p' src/agent/risk.ts` → `classifyRisk`/`authorizePlan`; `docs/reference/SDK-AND-CLI-REFERENCE.md` documents `payment-link void` as *"permanent, not idempotent"* with a `-y` bypass and no environment condition; README discloses plaintext profile storage for both environments in one file.
- **Problem:** the safety model exists but is wired to only one of the two execution surfaces. The CLI — the surface humans and CI actually use for money movement — has none of it.
- **Developer impact:** one wrong `PAYWAY_ENV`, one shell with the wrong profile active, or one agent that runs `refund -t … -a … -y` in a directory whose `.env` points at production, and real money moves with no friction and no record of the environment in the output. `payment-link void` is explicitly irreversible.
- **Root cause:** the guard was designed for the LLM-agent threat model (untrusted model output) and never generalised to the "trusted human, wrong context" threat model, which is more common.
- **Target state:** one shared guard module consumed by CLI, MCP, and agent; production mutations require an explicit, non-`-y` confirmation; the environment is visible in every mutating command's output; sandbox-only commands refuse to run in production.
- **Specification:**
  1. `src/core/env-guard.ts`: `classifyEnvironment(ctx) → {name, endpoint, requiresConfirm, allowedOperations}`; `assertOperationAllowed(op, ctx) → void | PayWayGuardError`; `requireProductionConfirmation(op, ctx, flags) → 'proceed' | 'refuse'`. `src/agent/risk.ts` delegates to it (its semantics are already correct — this is a lift-and-share, not a redesign).
  2. Every mutating command calls the guard before any I/O. In production: `--confirm-production` required → exit **6** without it; `-y` explicitly does not substitute; on TTY, print `merchant id · amount · currency · transaction id · endpoint` and require a typed confirmation of the merchant id.
  3. Human mode prints a persistent prefix on mutating commands: `[production · mc ec47••••]`. JSON mode already carries `context.environment`; add `context.guard: {required, supplied, policy}`.
  4. `env current|use|list|guard` (§9.5) and `doctor CRED-003` (credential↔environment coherence, **blocker**) and `NET-004`.
  5. Sandbox-only commands (`sandbox *`, `demo`, `test-cards`, `beneficiaries`, probe scenarios) refuse when `environment === 'production'` (exit 6).
  6. `capabilities --json` exposes `moneyMoving` and `environmentsAllowed` so agents can pre-check.
  7. Guardrail rendering (§30 MUST #10, MUST NOT #9) into `AGENTS.md`, `llms.txt`, skills, MCP instructions.
- **Dependencies:** `environments.yaml` (§21.2) for the operation policy; `capabilities` for exposure; exit-code 6 addition (§9.1).
- **Risks:** breaking existing CI scripts that use `-y` against production → that is the intent, and `--confirm-production` is the documented migration; a developer may find the typed confirmation annoying → `PAYWAY_CONFIRM_PRODUCTION=1` in a scoped, logged environment for automated production ops, with `doctor SEC-003` warning when it is set.
- **Validation:** parametrised test over every `moneyMoving` command × {sandbox, production} × {-y, --confirm-production, neither} asserting exit codes 0/6 and that no HTTP call is made on refusal; a test asserting `src/agent/risk.ts` and `src/cli.ts` both import `env-guard` (boundary test); manual rehearsal in sandbox with a production-pointing profile to prove CRED-003 blocks.
- **Acceptance criteria:** (1) no mutating command can reach the network in production without `--confirm-production`; (2) `-y` alone is insufficient and the docs say so; (3) `env current` exists with `--output json`; (4) `doctor` CRED-003/NET-004 implemented as blockers; (5) sandbox-only commands refuse production; (6) one shared guard module with both surfaces importing it; (7) `capabilities` reports `moneyMoving`.
- **Estimated complexity:** M · **Phase 1**

---

#### P1-02 — Six machine-output contracts where one is documented

- **Severity:** P1 · **Area:** CLI architecture / Agent readiness
- **Location:** `src/cli/output.ts` (`CLI_OUTPUT_SCHEMA_VERSION='1.0'`, `StructuredError`, `PaymentCommandResult`, `PaymentCommandName = 'generate-checkout' | 'generate-qr'`), `src/cli.ts:2484` and `:3175` (the only two `--output` registrations), `:5509-5520` (`argvRequestsMachineOutput` treats `--output` as global), `src/cli/commands/{doctor,webhook,docs,onboard}.ts`, `llms.txt`, `docs/reference/SDK-AND-CLI-REFERENCE.md`
- **Current state / evidence (all reproduced):**
  | Shape | Example | Where |
  |---|---|---|
  | Versioned envelope | `{schemaVersion:'1.0', command, transactionId, context, request, creation, payment, poll, artifacts, nextAction}` | `generate-qr`, `generate-checkout` only |
  | `{ok, …}` | `{ok:false, route, context, framework, frameworkEvidence, dataRoot, checks[], envIssues[], live?}` | `doctor --json` |
  | Bare object | `{code, family, title, hint, sandboxVerified, evidence}` | `explain --json` |
  | Bare object | `{paymentStatusCodes:{…}, …}` | `status --json` |
  | Bare array | `[{number, brand, expiry, cvv, threeDS, outcome}, …]` | `sandbox-test-cards --json` |
  | Raw gateway passthrough | `printApiResultJson` | most API commands |
  | Error envelope | `{error:{kind, exitCode, type, message, paywayCode?, httpStatus?, retryable, hint?}}` | failures |
  - `check-transaction --output json` → `error: unknown option '--output'` inside a well-formed error envelope.
  - `config --json`, `validate --json`, `profiles list --json` → `unknown option '--json'`.
  - Their own prior audit records four incompatible **error** families (`cli.ts` canonical; `webhook.ts` ~15 hand-rolled sites missing `type`; `docs.ts` `kind:'config_error'` — a value not in the `StructuredError` union; `onboard.ts` with no `kind`/`exitCode`).
- **Problem:** the documented contract ("prefer `--output json` for a single stable result") is false for ~84 of ~86 commands, and the six success shapes have no common envelope, version, or context block.
- **Developer impact:** every consumer (CI script, agent, wrapper SDK, dashboard) must special-case per command; a shape change is undetectable because only two commands carry `schemaVersion`; agents that generalise from `generate-qr --output json` to `check-transaction --output json` fail on their first attempt.
- **Root cause:** the versioned envelope was introduced for the two highest-value payment commands (`PaymentCommandName` has exactly two members) and never generalised; `--output` was registered per-command instead of on the program.
- **Target state:** §9.1 — one envelope, `schemaVersion: "2.0"`, `kind ∈ {result, collection, diagnostic, stream-event, error}`, `context` on every document, `--output` registered once on the program, `--json` as a permanent alias, all chrome on stderr, and a whole-registry contract test.
- **Specification:**
  1. Register `--output <json|ndjson|text>` and `--log-level`/`--log-format`/`--quiet` on `program` (one place), delete the two per-command registrations, keep `--json` as an alias.
  2. `src/cli/output/envelope.ts`: `success({command, kind, data, gateway?, diagnostics?, next?})` and `failure({command, error})`; `src/cli/output/render.ts` for human mode; `src/cli/output/redact.ts` shared with the journal.
  3. Wrap every command action in `runCommand(name, fn)` which builds `context`, catches, classifies (§15.3), renders, and sets the exit code — removing the ~335 hand-rolled error-routing statements their audit counted (M2).
  4. Migrate in dependency order: `config`/`env`/`capabilities`/`profiles` (state reads, highest agent value) → `doctor`/`explain`/`status`/`validate` → transaction commands → money commands → agent/mcp/skills.
  5. Ship `schemaVersion: "2.0"` with a documented migration table (old shape → new path) in `docs/project/MIGRATIONS.md`, and keep `1.0` emission behind `PAYWAY_CLI_OUTPUT_SCHEMA=1.0` for one minor series.
  6. Add §18.4's `cli-output-contract.test.ts` sweep as a **blocking** gate before the migration is declared done.
- **Dependencies:** `capabilities` (command registry introspection, already exists); `PayWayErrorRecord` (§15.3); exit-code additions 4/5/6.
- **Risks:** breaking existing consumers of `doctor --json`/`explain --json` → the schema-version env fallback plus a migration table; the sweep may reveal commands that cannot produce a valid envelope (e.g. `completions`, which emits a shell script) → declare `kind: 'text'` exempt commands explicitly in `capabilities` rather than silently.
- **Validation:** the contract sweep passes for every non-exempt command; a golden-file test per command group; `check-transaction --output json` returns a versioned envelope; `config --json` returns resolved configuration with per-key provenance; no ANSI or stderr content in stdout under `--output json` (the existing `cli-stdout-purity.test.ts` extends to cover this).
- **Acceptance criteria:** (1) `--output json|ndjson` accepted by every non-exempt command; (2) exactly one document per invocation; (3) `schemaVersion` present on all; (4) `context.environment`/`endpoint`/`credentialSource` present on all; (5) error documents carry `code`/`category`/`severity`/`retry`/`exitCode`; (6) the four error families collapse to one; (7) the sweep is blocking in CI; (8) `llms.txt` and the reference doc regenerated from `capabilities` and therefore true.
- **Estimated complexity:** L (touches every command) but mechanically safe once `runCommand` exists · **Phase 1** (contract + state commands) → **Phase 2** (remainder)

---

#### P1-03 — `src/cli.ts` is a 5,636-line monolith holding domain policy

- **Severity:** P1 · **Area:** Architecture / Maintainability
- **Location:** `src/cli.ts`; only 8 command groups delegated to `src/cli/commands/*` (~34 command blocks inline); `biome.json` disables `noExplicitAny`/`noNonNullAssertion` for this file
- **Current state / evidence:** their own audit (`docs/project/2026-10-02-dx-readability-audit.md`, M1) census of ~4,323 inline command lines: 482 `console.log`, 335 error-routing statements, 396 `if`/`try`/`catch`, **111 domain calls** — ~70% presentation plumbing, ~11% domain. Largest blocks: `cof` 608 lines, `generate-qr` 587. M2 tabulates ~126 mechanically extractable statements (`routeError`, `requireGatewayContext`, `resolveCurrency` in **7 spellings**, `unwrapData`, `parsePayoutArg`). Leaked non-CLI policy: poll backoff (`:588-780`), `TX_BATCH_PACE_MS` gateway pacing (`:1652`), the payout-total-vs-amount money invariant (`:3557-3593`), the token 90-day expiry policy (`:4500-4520`), gateway-day derivation (`:1952`). Lint suppressions concentrate the type-safety hole in exactly this file.
- **Problem:** the file is simultaneously the presentation layer, the error router, the config resolver, and the home of five pieces of payment policy. Every CLI change risks unrelated commands; no unit test can cover the policy without spawning a process; an agent cannot locate the code for a command.
- **Developer impact:** slower contribution, higher regression risk, and — concretely — policy that only the CLI enforces (PA-002 over-capture ceiling, PUR-007 payout invariant) is unavailable to SDK consumers, which is a correctness gap, not just a tidiness one.
- **Root cause:** commands were added inline as the surface grew; the delegation pattern (`src/cli/commands/agent.ts` + `agent-helpers.ts`) was proven but applied to only 8 groups.
- **Target state:** `src/cli/program.ts` (registration only) + `src/cli/commands/<group>.ts` (parse → call → render) + `src/cli/output/*` (§9.1) + policy moved to `src/core/` and `src/domains/`. No file over ~400 lines; no lint suppression needed.
- **Specification:**
  1. Extract the shared helpers first (their M2 list is the work order): `routeError` → `output/render.ts`; `requireGatewayContext` → `cli/context.ts`; **7 `resolveCurrency` spellings → one `core/money.ts#parseCurrency`**; `unwrapData` → `transport/classify.ts`; `parsePayoutArg` → `core/money.ts#parsePayoutEntries` (with the `{acc,amt}` vs `{account,amount}` rule from `rules.yaml#PUR-006`).
  2. Move policy out of the CLI: poll backoff → `domains/transactions#pollStrategy`; `TX_BATCH_PACE_MS` → `transport/rate-limit`; payout invariant → `core/money#assertPayoutTotal` (used by domains **and** CLI); over-capture ceiling → `domains/pre-auth`; gateway-day → `core/time#gatewayDayWindow` (already in `utils.ts` — delete the CLI copy at `:1952`).
  3. Extract command groups in dependency order, one PR each, each gated by the §18.4 sweep + a golden-output test: `transactions` → `qr` → `checkout` → `money-out` (refund/payout/pre-auth/beneficiary) → `cof` → `payment-link` → `reference` (docs/explain/status/validate/exchange-rate) → `sandbox` → `profiles/config/env` → `self-activation`.
  4. Delete the `biome.json` overrides for `src/cli.ts` once the file is gone; re-enable `noExplicitAny`/`noNonNullAssertion` for `src/cli/**`.
  5. Add `src/__tests__/architecture-boundaries.test.ts` (§25.2 import rules) so `cli/` can never import `agent/` internals or hold domain policy again.
- **Dependencies:** P1-02 (`runCommand` + envelope) — do them together; the extraction is the vehicle for the contract migration.
- **Risks:** behaviour drift during extraction → mitigate with golden-output tests captured *before* each move (the repo already has snapshot instinct); large diffs → one group per PR, `.git-blame-ignore-revs` for moves.
- **Validation:** `wc -l src/cli/**` max ≤ 400; `grep -c "console.log" src/cli.ts` = 0 (file gone); lint overrides removed and `biome lint src` still exit 0; golden outputs byte-identical for human mode and structurally identical for JSON; all 2,378 tests still pass; the five relocated policies have unit tests at their new home.
- **Acceptance criteria:** (1) no `src/cli.ts`; (2) every command group in `src/cli/commands/`; (3) zero domain policy in `cli/` (boundary test); (4) lint suppressions removed; (5) the 7 currency spellings are 1; (6) SDK consumers can use `assertPayoutTotal` and the over-capture ceiling without the CLI.
- **Estimated complexity:** L (mechanical, high volume) · **Phase 1–2**

---

#### P1-04 — The environment-variable registry is incomplete, so `doctor`/`config` falsely warn about supported configuration

- **Severity:** P1 · **Area:** Configuration / Diagnostics
- **Location:** `src/config/envValidator.ts` (`KNOWN_VARS`), vs `src/khqr-config.ts:42-48,98`, `src/client.ts:1370`, `src/cli/ui/mode.ts:44`, `src/cli/update-check.ts:112`, `src/mcp/server.ts:87`, `src/agent/repl.ts:101`, `src/config/profiles.ts`
- **Current state:** `KNOWN_VARS` lists ~20 variables. At least 12 more are read from the environment in shipping code: the 7 `PAYWAY_KHQR_*` fields (`BAKONG_ID`, `ABA_MERCHANT_ID`, `ACQUIRER_NAME`, `MERCHANT_CATEGORY_CODE`, `MERCHANT_NAME`, `MERCHANT_CITY`, `PAYWAY_DATA`), `PAYWAY_STRICT_VALIDATION`, `PAYWAY_UI`, `PAYWAY_NO_UPDATE_CHECK`, `PAYWAY_MCP_ALLOW_MUTATIONS`, `PAYWAY_AGENT_NO_RECOVER_HINT`, `PAYWAY_KNOWLEDGE_DIR`.
- **Evidence (reproduced):** `PAYWAY_UI=classic PAYWAY_STRICT_VALIDATION=1 PAYWAY_KHQR_MERCHANT_NAME=X PAYWAY_MCP_ALLOW_MUTATIONS=1 payway-sdk config` →
  `⚠ 1 warning(s): • Unrecognized PayWay environment variable(s): PAYWAY_MCP_ALLOW_MUTATIONS, PAYWAY_STRICT_VALIDATION, PAYWAY_UI, PAYWAY_KHQR_MERCHANT_NAME. Check for typos or removed configuration keys.`
- **Problem:** the diagnostic that exists to catch typos reports the product's own supported configuration as a typo. Its `W-PAYWAY-UNKNOWN-VAR` code and "removed configuration keys" wording actively mislead.
- **Developer impact:** a developer following the offline-KHQR guide sets `PAYWAY_KHQR_*` and is told their configuration is unrecognised; an agent that trusts `doctor` will "fix" a correct configuration by deleting it. Trust in the diagnostic is destroyed by its first false positive.
- **Root cause:** the allow-list is hand-maintained in a different file from the readers, with no generated link between them.
- **Target state:** `knowledge/rules/env-vars.yaml` is the single registry; `src/config/env-registry.ts` is generated from it; `envValidator`, `.env.example`, `configure --set` completion, `doctor ENV-003`, and `getting-started/configuration.md` all read the generated module; a test asserts that every `process.env.PAYWAY_*` read anywhere in `src/**` appears in the registry.
- **Specification:**
  1. Author `env-vars.yaml`: `{name, type: string|boolean|int|enum|url|pem|secret, secret: bool, default, appliesTo: [sdk|cli|agent|mcp|journal|webhook|khqr|ui], requiredFor: [routes], docRef, since, example}` for all ~32 variables (including `DEBUG_PAYWAY`, `PAYWAY_DATA_DIR`, `PAYWAY_JOURNAL*`, `PAYWAY_PROFILE`, `PAYWAY_TOKEN_STORE_DIR`, `PAYWAY_FORCE_JSON_STORAGE`, `PAYWAY_WEBHOOK_DIR`, `PAYWAY_LOG_LEVEL`, `PAYWAY_RETURN_URL`, `PAYWAY_CALLBACK_URL`, `PAYWAY_PARTNER_*`, `PAYWAY_ONBOARD_AUTO`, `PAYWAY_TLS_CA_FILE` (new), `PAYWAY_CONFIRM_PRODUCTION` (new), `PAYWAY_CLI_OUTPUT_SCHEMA` (new)).
  2. `scripts/generate/gen-env-registry.ts` → `src/config/env-registry.ts` (typed const + validation metadata) and the root `.env.example` (grouped, commented, secrets as placeholders) — fixes P1-05 in the same step.
  3. Rewrite `envValidator.ts` to consume the registry: unknown-var detection becomes exact; type/range/enum validation becomes data-driven (today only API-key length and `PAYWAY_RETURN_URL` presence are checked).
  4. `src/__tests__/env-registry-conformance.test.ts`: AST/regex scan of `src/**` for `process.env.PAYWAY_` / `env.PAYWAY_` reads; every hit must be in the registry; every registry entry must have ≥1 reader or be explicitly `appliesTo: [external]`.
  5. `doctor ENV-003` reports unknown vars with the nearest registry match ("did you mean `PAYWAY_KHQR_MERCHANT_CITY`?").
- **Dependencies:** §21.2 registry infrastructure (can be the first yaml file adopted, proving the pattern).
- **Risks:** a variable read only in tests would fail the conformance test → the scan excludes `src/__tests__/**` but requires such vars to be declared `appliesTo:[test]`.
- **Validation:** the reproduction above emits **no** warning; setting a genuine typo (`PAYWAY_KHQ_MERCHANT_NAME`) emits exactly one warning with a suggestion; the conformance test fails when a new `process.env.PAYWAY_*` read is added without a registry entry; `.env.example` contains every non-secret variable with a comment.
- **Acceptance criteria:** (1) zero false positives for all supported variables; (2) a root `.env.example` exists, is generated, and covers every non-secret variable; (3) the conformance test is blocking; (4) `doctor`/`config`/`configure` all read the generated registry; (5) `getting-started/configuration.md` is generated from the same file.
- **Estimated complexity:** S–M · **Phase 1**

---

#### P1-05 — No root `.env.example`; the only template covers 6 of ~32 variables

- **Severity:** P1 · **Area:** Onboarding / Configuration
- **Location:** `src/cli/commands/init.ts:11-20` (`ENV_TEMPLATE` string constant, used for both `.env` and `.env.example`); repo root (no `.env.example`); `examples/first-payment/.env.example` (exists, app-specific, 8 lines)
- **Current state:** a developer who clones the repo and does not run `init` has no template to copy. `init`'s template covers `PAYWAY_ENV`, `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_CALLBACK_URL`, `PAYWAY_RETURN_URL`, `PAYWAY_CANCEL_URL` — omitting `PAYWAY_RSA_PUBLIC_KEY` (required for payment-link, refund, pre-auth, payout, beneficiary), `PAYWAY_STRICT_VALIDATION`, `PAYWAY_LOG_LEVEL`, `PAYWAY_DATA_DIR`, `PAYWAY_JOURNAL*`, `PAYWAY_PROFILE`, `PAYWAY_PARTNER_*`, all 7 `PAYWAY_KHQR_*`, `PAYWAY_TIMEOUT`, `PAYWAY_BASE_URL`, `PAYWAY_UI`.
- **Evidence:** direct read of `init.ts`; `ls .env.example` at root → absent; `QUICKSTART.md` §3 hand-lists 4 variables.
- **Problem:** configuration discovery requires reading source or a 46 KB reference doc. The most common "why does payment-link fail?" answer (missing RSA PEM, and the multi-line quoting syntax needed to put one in `.env`) is not in the template at all — even though `doctor` has a dedicated truncation check for it.
- **Developer impact:** extra 10–30 minutes for any RSA-requiring product; a class of avoidable support questions; agents scaffold incomplete configurations.
- **Root cause:** the template was written as a quickstart artifact, not as a configuration reference, and is duplicated in purpose by `QUICKSTART.md` §3.
- **Target state:** a generated root `.env.example` covering every non-secret variable, grouped by concern, each with a one-line comment, its default, and a `docRef`; plus the multi-line PEM syntax shown explicitly.
- **Specification:** as P1-04 step 2 — generate from `env-vars.yaml`; sections `# Environment`, `# Merchant credentials`, `# Encryption (RSA)`, `# Callbacks & return URLs`, `# Money defaults`, `# Transport & retries`, `# Validation`, `# Logging & journal`, `# Storage & data root`, `# Offline KHQR`, `# Agent & MCP`, `# Safety guards`. Secrets appear as `PAYWAY_API_KEY=` with a comment "never commit this file"; the RSA block shows both the single-line and the quoted multi-line form that `src/cli/dotenv.ts` supports. `init` writes `.env` (minimal, quickstart-shaped) **and** `.env.example` (complete) — two different artifacts with two different jobs, both generated.
- **Dependencies:** P1-04.
- **Risks:** a long template intimidates → keep the minimal `.env` for `init` and mark optional sections "uncomment when needed".
- **Validation:** a test asserts every non-secret registry entry appears in `.env.example` with a comment; `dotenv` parses the generated file; `init` output unchanged for the minimal path.
- **Acceptance criteria:** (1) `.env.example` at root, generated, complete; (2) `init` writes both artifacts; (3) the RSA multi-line syntax is shown; (4) a test prevents drift from the registry.
- **Estimated complexity:** S · **Phase 1**

---

#### P1-06 — `doctor` has no severity model, no stable check IDs, and checks almost nothing external

- **Severity:** P1 · **Area:** Diagnostics
- **Location:** `src/cli/commands/doctor.ts` (316 L), `src/config/envValidator.ts`, `src/cli.ts:1140-1330` (invocation, `--live`, JSON assembly, exit code)
- **Current state:** `DoctorCheck = {id, label, ok, detail, fix?}` — boolean only. Blocking-vs-cosmetic is decided by hard-coding exclusions (`id !== 'framework' && id !== 'journal'`) at two call sites. IDs are ad-hoc and mix styles (`env-file`, `framework`, `env-PAYWAY_ENV`, `env-apikey-length`, `env-value`, `journal`, `env-rsa-pem`). `--live` performs exactly one network call (`checkout.getExchangeRate()`) and **swallows the error**: `catch { live = {status:'fail'} }`. There is no DNS, TLS, TCP, endpoint-reachability, callback-reachability, port, build-presence, SDK-version, dependency, or credential↔environment check. `--json` has no `schemaVersion`, no per-check severity, and no timing. Exit is `ok ? 0 : 1`.
- **Evidence:** full read of `doctor.ts` and the invocation block; reproduced `doctor --json` output (checks array with boolean `ok`, no severity, `dataRoot`, `frameworkEvidence`).
- **Problem:** the most important diagnostic command cannot answer the questions developers actually have ("why can't I reach PayWay?", "is my certificate chain the problem?", "am I pointing sandbox credentials at production?"), and its output cannot be consumed reliably because IDs and severity are unstable/absent.
- **Developer impact:** `doctor` passes while the integration fails; the failure is then debugged by reading transport code. The single most common real-world blocker (corporate TLS interception) is invisible — which is precisely why P0-04's bypass became canonical.
- **Root cause:** `doctor` grew as an environment-variable validator (its checks are mostly `envValidator` output) rather than as a diagnostic.
- **Target state:** §9.3 in full — a 38-check registry in `doctor-checks.yaml` with categories, severities, route scoping, stable IDs, timings, evidence, `--check`/`--category`/`--severity-min` filters, `--fix` for mechanical issues, real network checks with actionable TLS/DNS errors, and a versioned JSON envelope.
- **Specification:** §9.3 (authoritative). Implementation notes:
  1. `src/diagnostics/doctor/{registry.ts, runner.ts, checks/*.ts}` — one file per check, each exporting `{id, category, routes, severity, run(ctx) → CheckResult}`; the runner parallelises network checks with a `--timeout` budget and records `durationMs`.
  2. `CheckResult = {id, category, label, severity, status: pass|warn|fail|skipped|unverified, detail, fix?: {command?, explanation?, docRef?}, evidence?, durationMs?}`. `skip` requires a reason.
  3. Severity comes from the registry; delete both id-blacklists. Exit: `0` (no fail above warning) / `1` (any error) / `5` (any blocker) / `3` (only network failures, no config error).
  4. `--live` errors are **never** swallowed: `API-001` reports `paywayCode`, `httpStatus`, `correlationId`, and a `payway explain <code>` next-step.
  5. `--fix` applies only mechanical, reversible fixes and prints a diff first; refuses under `--non-interactive` unless every selected fix is mechanical; never writes a secret; never modifies production config without `--confirm-production`.
  6. `go-live check` (§36) reuses the runner's results — one implementation, two products.
- **Dependencies:** `doctor-checks.yaml`, `environments.yaml`, `env-registry` (P1-04), `env-guard` (P1-01), the §9.1 envelope (P1-02).
- **Risks:** network checks make `doctor` slow/flaky in CI → `PAYWAY_DOCTOR_LIVE=0` default in CI, per-check timeouts, and `skipped` with a reason; new blocker checks could fail existing users → ship new blockers as `error` for one release with a deprecation notice, then promote.
- **Validation:** golden-file JSON per route; a test per check (pass/warn/fail/skip) using injected probes; a live smoke in the nightly sandbox job; assertion that no check id is ever renamed (additive-only golden test).
- **Acceptance criteria:** (1) ≥30 checks across 9 categories with registry-driven severity; (2) stable IDs, additive-only; (3) DNS/TCP/TLS/reachability/port/build/version/coherence checks present; (4) no swallowed errors; (5) `--check`/`--category`/`--severity-min`/`--fix` implemented; (6) versioned JSON envelope with per-check timing; (7) exit codes 0/1/3/5; (8) `go-live check` reuses the runner.
- **Estimated complexity:** M–L · **Phase 1** (registry + severity + network checks) → **Phase 2** (`--fix`)

---

#### P1-07 — Production readiness is prose: there is no `go-live check`

- **Severity:** P1 · **Area:** Production readiness / DX
- **Location:** `docs/guides/13-deployment-checklist.md` (298 lines, ~40 checkboxes), `docs/guides/integration-onboarding.md` (G0–G7 gates), `docs/guides/integration-finance.md` (G6 settlement evidence), `docs/project/PRODUCTION-VERIFICATION-PLAN.md`; no command
- **Current state:** the readiness model is genuinely good — it includes the Integration Team screen review, KHQR asset dimensions, consent-before-submit, `continueSuccessUrl`/`returnDeeplink` validation, 5-second callback response, T+N settlement, and G0–G7 gates with "automated checks do not grant this approval". None of it is executable.
- **Problem:** a merchant cannot answer "am I ready?" without manually cross-referencing 298 lines against their own code and configuration, and there is no way to record evidence or to distinguish "verified" from "ABA must confirm".
- **Developer impact:** the highest-stakes moment of the integration (going live) has the weakest tooling. The two classic launch failures — sandbox credentials against the production endpoint, and fulfilment on creation rather than on a verified approval — are both checkable and neither is checked.
- **Root cause:** the checklist was authored as documentation; the diagnostic runner that could execute most of it did not exist (P1-06).
- **Target state:** §36 — `payway go-live check` with per-gate `PASS | WARNING | BLOCKER | NOT_APPLICABLE | UNVERIFIED`, machine-readable output, evidence attachment, reuse of the `doctor` runner, and an explicit refusal to report "ready" while any money-path gate is `UNVERIFIED`.
- **Specification:** §36 (authoritative).
- **Dependencies:** P1-06 (doctor runner), `rules.yaml` gates section, `conflicts.yaml` (open conflicts on money paths are BLOCKERs), `capabilities` (which products the merchant actually uses, so gates can be `NOT_APPLICABLE`).
- **Risks:** a false "PASS" is worse than no signal → every automated gate must cite the evidence it used, and anything requiring ABA confirmation is `UNVERIFIED`, never `PASS`.
- **Validation:** golden-file report for four synthetic projects (complete, missing-webhook-verification, sandbox-creds-in-production, open-conflict); a test asserting no gate can be `PASS` without an evidence reference.
- **Acceptance criteria:** (1) `go-live check` exists with `--output json` and exit 0/5; (2) ≥25 gates across 8 categories; (3) every gate declares `automated | evidence-required | aba-confirmation-required`; (4) open `conflicts.yaml` entries on money paths are BLOCKERs; (5) `go-live report` writes a dated, shareable artifact; (6) the prose checklist links to the command and vice versa.
- **Estimated complexity:** M · **Phase 2**

---

#### P1-08 — No request inspection: the signed request is invisible until it is sent

- **Severity:** P1 · **Area:** DX / Diagnostics / Agent readiness
- **Location:** `src/cli.ts` (`--dry-run` exists only on `tx-batch`, `:1736`); `src/domains/*` (pure payload builders exist but are unreachable); `src/auth.ts#generateHmac` (no preimage exposure); `payway-boilerplate/Postman Collection API Testing/_build/*` (the Postman collection *does* log `b4hash:`)
- **Current state:** to learn what will be sent — endpoint, method, content type, headers, body, which fields are base64-encoded, the exact hash field order, and the concatenated preimage — a developer must read `src/domains/<x>.ts` and `src/auth.ts`. The Postman collection logs the preimage; the SDK and CLI do not.
- **Problem:** "Wrong hash" (`code 1` / `PTL02`) is the single most common PayWay integration failure (the repo's own error registry and `docs/internal/PAYMENT-CREDENTIAL-ERROR-TABLE.md` bear this out), and its only reliable diagnostic — comparing your concatenation against the gateway's — is unavailable.
- **Developer impact:** hours of reading source or trial-and-error against the gateway (spending sandbox quota and, per TX-008, creating duplicate unpayable transactions). An AI agent cannot self-correct a signature bug without this tool.
- **Root cause:** payload builders were written for execution, not inspection; `--dry-run` was added to one batch command as a safety feature rather than as a general capability.
- **Target state:** §9.4 — `payway request inspect <operation>` / `request sign` / `request send --dry-run`, with a versioned document containing endpoint, transport policy, headers, auth model, body, per-field normalization records (each citing a `ruleId` and `source`), the hash field order **with its provenance**, any open conflict, and an opt-in masked preimage.
- **Specification:** §9.4 (authoritative). Implementation notes: refactor each domain's builder into `buildXRequest(params, config) → {endpoint, method, contentType, body, fieldOrder, normalization[]}` (mostly already pure — `buildPurchasePayload` is the model) and have the domain call it, so inspection and execution cannot diverge; add `auth.inspectHmac(payload, fields, apiKey) → {preimage, preimageSha256, hash}` used only by `request sign`/`inspect --show-preimage`.
- **Dependencies:** `rules.yaml` (for `normalization[].rule`), `capabilities` (operation ids), `conflicts.yaml`.
- **Risks:** leaking a secret through the preimage → the preimage is key-free by construction (the key is the HMAC input, not part of the concatenation); still, `--show-preimage` is opt-in, stdout-only, never journaled, and covered by the canary sweep.
- **Validation:** for each operation, `request inspect` output equals the actual sent request captured by a mock transport (a test that runs both paths and diffs them); the preimage for `generate-qr` equals the manual concatenation of the 19 official fields; canary sweep proves no secret appears.
- **Acceptance criteria:** (1) every operation in `capabilities` is inspectable; (2) inspection and execution provably produce the same body (diff test); (3) field order + provenance + conflicts are in the output; (4) `--show-preimage` works and is redaction-audited; (5) `--no-sign` works with zero configuration; (6) exit 1 on local validation failure with `validation.errors` populated.
- **Estimated complexity:** M · **Phase 2**

---

#### P1-09 — A formatter is configured and documented but neither applied nor gated

- **Severity:** P1 · **Area:** Tooling / Contribution DX
- **Location:** `biome.json`, `package.json` (`format`, `format:fix`, `lint`, `lint:fix`), `.github/workflows/ci.yml` (runs `biome lint src skills` only)
- **Current state / evidence (reproduced):** `npx biome format src` → **exit 1, 181 files** would change. `npm run lint` → exit 0 (2 warnings, 6 infos). CI has no format step. `format`/`format:fix` target `src` while `lint` targets `src skills` — inconsistent scope.
- **Problem:** the documented `npm run format` produces a 181-file diff. Any contributor or agent who runs it (as `CONTRIBUTING.md` implies) creates an unreviewable PR and, worse, may include unrelated formatting churn in a functional change.
- **Developer impact:** review noise, merge conflicts for everyone, and a strong incentive to stop running the formatter — which is how a codebase loses formatting consistency permanently.
- **Root cause:** `biome.json`'s formatter was configured (or its rules changed) after the tree was written, and no gate ever enforced it.
- **Target state:** the tree is formatted, `format:check` is a blocking gate, scope is uniform (`src scripts skills examples integrations`), and the one-time reformat is isolated and blame-ignorable.
- **Specification:**
  1. One dedicated commit: `npx biome format --write src scripts skills` (nothing else in it).
  2. Add its SHA to `.git-blame-ignore-revs` and configure `git config blame.ignoreRevsFile` in `CONTRIBUTING.md`.
  3. CI: `biome format --changed` on PRs (fast, only touched files) and `biome format` (full) on `main` and nightly — both blocking. Add `format:check` to `package.json` and to the PR template checklist.
  4. Uniform scope for `lint`, `lint:fix`, `format`, `format:check`.
  5. Remove the `src/cli.ts` lint overrides as part of P1-03 (the file will not exist).
- **Dependencies:** none. Should land **before** P1-03's extraction so moves are not conflated with reformatting.
- **Risks:** the big diff conflicts with in-flight branches → coordinate a merge freeze for one hour; open PRs rebase once.
- **Validation:** `biome format src scripts skills` → exit 0; a deliberately misformatted file fails `format:check` in CI; `git blame` on a reformatted line still shows the original author.
- **Acceptance criteria:** (1) `format:check` green and blocking; (2) tree fully formatted; (3) `.git-blame-ignore-revs` in place; (4) uniform scope; (5) PR template updated.
- **Estimated complexity:** S · **Phase 0** (the commit) / **Phase 1** (the gate)

---

#### P1-10 — Repository, package, support, and CI identity do not match the published project

- **Severity:** P1 · **Area:** Governance / Trust / DX
- **Location:** `package.json` (`name: aba-payway-ts`, `author: Antigravity <info@antigravity.dev>`, `repository`/`bugs`/`homepage` → `github.com/antigravity-google/aba-payway-ts`), `SECURITY.md` (`security@antigravity.dev`), `docs/reference/SDK-AND-CLI-REFERENCE.md` (CI badge → same org), the actual remote (`github.com/Ruzaid-aman/ABA-Payway-SDK-unofficial`), `docs/project/RELEASE-READINESS.md` items B/C/D/E
- **Current state:** four different identities. The package is unpublished at `1.5.0`; `RELEASE-READINESS.md` item E recommends `2.0.0` and says "do not reuse `1.5.0`"; item D records that the security mailbox's "exists, owned, monitored" precondition is **unmet**; item C says the destination org/repo must be created or the metadata changed first.
- **Evidence:** direct comparison of `git remote -v`, `package.json`, `SECURITY.md`, and the badge URL; README/QUICKSTART instruct `npm pack` from a checkout because the package is not installable.
- **Problem:** a developer who clones this repo cannot install the package, cannot file an issue at the URL `package.json` names, cannot verify a CI badge that points elsewhere, and cannot be sure a security report reaches anyone.
- **Developer impact:** install friction (build-from-source only, F1), lost security reports, broken issue links, and an inability to establish provenance/trust — which matters disproportionately for a payment SDK that asks for credentials.
- **Root cause:** the public repo was created before the identity decisions (items C–F) were executed; metadata still reflects the private plan.
- **Target state:** one identity across `package.json`, README badges, `SECURITY.md`, `SUPPORT.md`, the CI workflow, and the npm listing — with the security mailbox verified and the version chosen per the project's own versioning policy.
- **Specification:**
  1. Decide the canonical home (either create `antigravity-google/aba-payway-ts` or repoint metadata to `Ruzaid-aman/ABA-Payway-SDK-unofficial`) and update `repository`/`bugs`/`homepage`, all badges, and every doc link in one commit. Add `scripts/gates/check-identity.mjs` asserting all URLs resolve to the same owner/repo (blocking).
  2. Verify the security mailbox exists and is monitored, or replace it with GitHub's private-vulnerability-reporting + a documented alternate channel; update `SECURITY.md` and record the confirmation in `RELEASE-READINESS.md` item D.
  3. Choose the version per `docs/project/VERSIONING.md` (the Node 22.12 floor is breaking ⇒ **2.0.0**), bump `package.json` + lockfile together, fold `CHANGELOG.md`'s 123 KB `Unreleased` into a dated section, and flip the two "preparing its first public release" notes.
  4. Decide the bin/name strategy (§8.3): `bin: {payway, payway-sdk}` at 2.0.0, and keep the squatting warning until npm resolves it.
  5. Publish via trusted publishing (OIDC + provenance) from a tag workflow (§34) — or, if publication is not intended, say so explicitly in README and remove `npm install aba-payway-ts` from every doc, replacing it with the checkout path.
- **Dependencies:** owner decisions (items C–F); P0-01 (curated tree) should land first so the published identity matches the published content.
- **Risks:** renaming the bin breaks existing users' scripts → keep `payway-sdk` as an alias indefinitely; publishing 2.0.0 with an unresolved rules conflict (P0-03) would ship a known correctness issue → gate publication on Phase 0 completion.
- **Validation:** `check-identity` green; `npm view` (post-publish) matches; every badge resolves; a test-filing link works; `SECURITY.md` channel verified by sending and receiving a test report.
- **Acceptance criteria:** (1) one owner/repo everywhere; (2) a verified security channel; (3) a version chosen per the project's own policy with the changelog folded; (4) an install path that works for a stranger (published package **or** an explicit "build from source" README with no `npm install` instruction); (5) `RELEASE-READINESS.md` items C–F closed with dates.
- **Estimated complexity:** S (mechanical) but decision-gated · **Phase 0** (metadata consistency + security channel) / **Phase 4** (publication)

---

#### P1-11 — Webhook tooling is split across two command trees, and the listener has no machine-readable event stream

- **Severity:** P1 · **Area:** CLI architecture / Webhook DX
- **Location:** `src/cli.ts` (`setup-webhook` top-level), `src/cli/commands/webhook.ts` (`trigger/verify-callback/resend/list/show/status/stop`), `src/cli/commands/setup-webhook.ts` (78+ L, `deps.log ?? console.log`), `docs/guides/16`
- **Current state:** one concept ("run a local receiver") is `setup-webhook`; everything else about webhooks is `webhook <sub>`. The listener both *configures* (writes `PAYWAY_CALLBACK_URL`) and *runs a server*. It logs via `console.log` with no `--output ndjson`, so an agent must poll `webhook list --json` to observe arrivals.
- **Problem:** the naming split is unpredictable (C1), the mixed concern makes the command hard to reason about, and the absence of a stream blocks automation of the single most valuable test loop in the repo.
- **Developer impact:** Scenario A step 8 — the worst manual step in the golden path — and no way to script "wait for the callback, then assert".
- **Target state:** §13.2 — `webhook listen` (run) + `webhook configure` (write env) as separate concerns, `--print-url` one-line output, `--output ndjson` event stream, `--expect/--duration/--fail-on` CI gate, `webhook fixtures` corpus, `webhook verify --against <url>` receiver conformance.
- **Specification:** §13.2/§13.3 (authoritative). `setup-webhook` remains a hidden alias emitting a stderr deprecation.
- **Dependencies:** P1-02 (envelope/ndjson), §19 (fixtures), §12.3 (`TransactionState` for the event document).
- **Risks:** renaming breaks muscle memory and docs → alias + generated docs + a `CHANGELOG` migration note.
- **Validation:** `webhook listen --tunnel --print-url` yields exactly one stdout line; `--output ndjson --expect payment.approved --duration 60 --fail-on unverified` exits 0/4/5 correctly against `webhook trigger`; golden-file per event type.
- **Acceptance criteria:** (1) `webhook listen` is the canonical listener; (2) `--print-url`, `--output ndjson`, `--expect/--duration/--fail-on` implemented; (3) `webhook fixtures` writes a provenance-tagged corpus; (4) `webhook verify --against` runs the receiver conformance suite; (5) `setup-webhook` alias works with a stderr deprecation; (6) the T1 platform test defect is fixed in the same phase.
- **Estimated complexity:** M · **Phase 2**

---

#### P1-12 — The QR command surface conflates four distinct capabilities

- **Severity:** P1 · **Area:** CLI architecture / Product clarity
- **Location:** `src/cli.ts` (`generate-qr` with `--offline`, `request-qr`), `src/domains/qr.ts` (three methods: `generateQr`, `requestQr`, `generateOfflineQR`), `src/khqr-offline.ts`, `docs/guides/07,19`, `.agents/AGENTS.md` "Domain Separation"
- **Current state:** `generate-qr` serves both the online PayWay QR API and local EMVCo KHQR generation behind a flag, sharing flags that are meaningless in one mode (`--callback-url`, `--template`, `--poll` offline; `--bakong-id`, `--mcc` online). `request-qr` (Soundbox, UNVERIFIED) is a sibling top-level command. Customer-Module KHQR is a webhook route plus docs, with no command.
- **Problem:** the repo's own agent rules say offline CRC-16 and online HMAC-SHA512 must never be mixed — but the CLI mixes them in one command. Capability readiness (official vs unverified) is invisible at the command level.
- **Developer impact:** wrong-mode flags, silent no-ops, and no way to discover that `request-qr` is unverified except by reading `--help` prose. Scenario B (§6.2) requires triaging 5 documents to learn the four-way split.
- **Target state:** §14.2 — `qr create | offline | customer | soundbox | inspect | templates | deeplink`, each with only its own flags, each carrying `verified` in its output, with payload/image/status as separate output fields.
- **Specification:** §14.2 plus the QR-D1…QR-D6 defect fixes. `generate-qr` and `request-qr` remain hidden aliases.
- **Dependencies:** P1-02, `capabilities` (`verified` field), `rules.yaml` (QR-012/013).
- **Risks:** alias churn → generated alias-parity test; offline users' scripts break → one minor release of stderr deprecation.
- **Validation:** each subcommand's flag set is disjoint and complete; `qr inspect` round-trips a generated offline payload (CRC valid) and rejects a corrupted one; `qr soundbox` requires `--allow-unverified` in production.
- **Acceptance criteria:** (1) four distinct subcommands + `inspect`/`templates`/`deeplink`; (2) no cross-mode flags; (3) `verified` in every output; (4) QR-D1…D6 fixed; (5) aliases work with deprecation notices; (6) `docs/guides/online-qr` and `offline-khqr` generated from `products.yaml`.
- **Estimated complexity:** M · **Phase 2**

---

#### P1-13 — Rule provenance is prose, so officially documented behaviour can be silently contradicted

- **Severity:** P1 · **Area:** Knowledge architecture / Correctness governance
- **Location:** `src/constants.ts` (provenance in comments), `src/utils.ts` (validators), `src/domains/*` (hash orders), `AGENTS.md` ("CONFLICTS kept open"), `llms.txt` ("most often gotten wrong"), `docs/guides/*`, `knowledge/*`, 35 skills; **no** `rules.yaml`, **no** evidence files, **no** conflict register
- **Current state:** provenance discipline is excellent *in prose* — nearly every constant names its source and date. But it is unenforceable: nothing compares a repo rule against official documentation, nothing expires an evidence claim, and the three known conflicts live in one `AGENTS.md` bullet.
- **Evidence:** P0-02 and P0-03 are both instances of this defect reaching production code. `docs/aba-payway-coverage-report.json` — the one machine-readable coverage artifact — is orphaned (no generator, no test, references pre-reorganisation paths, and its `summary.covered_by_code: 0` contradicts 6 cases classified `COVERED_BY_CODE_AND_DOCUMENTATION`).
- **Problem:** the project's greatest strength (evidence discipline) has no execution mechanism, so it degrades exactly where it matters most: enums, units, bounds, and hash orders.
- **Developer impact:** incorrect SDK behaviour presented as authoritative; agents and humans both unable to tell a confirmed rule from a sandbox inference.
- **Target state:** §21.2 — `knowledge/rules/*.yaml` with mandatory `source`, `evidence/` files carrying URL + retrieval date, auto-degradation to `unverified` after 180 days, a `conflicts.yaml` register surfaced in `request inspect`/`doctor`/`go-live`, and a conformance test that fails when an `official` rule has no evidence.
- **Specification:** §21.2 + §22 (single-source-of-truth table) + T6 (conformance test) + the `rules`/`products` commands (§9.5).
- **Dependencies:** none external; this is the keystone that makes P0-02/P0-03 unrepeatable.
- **Risks:** authoring 60+ rule records is real work → seed from `constants.ts` comments (they already contain source + date), then require evidence only for `source:'official'` rules on money paths in Phase 2.
- **Validation:** `rules list --source official --missing-evidence` returns empty; the conformance test fails when an evidence file is deleted or aged; `rules check --against request.json` reproduces every SDK validation error for a corpus of bad requests.
- **Acceptance criteria:** (1) `rules.yaml`, `errors.yaml`, `products.yaml`, `environments.yaml`, `capabilities.yaml`, `env-vars.yaml`, `doctor-checks.yaml`, `symptoms.yaml`, `conflicts.yaml` exist and are consumed by ≥3 consumers each (§21.2 table); (2) every `source:'official'` rule has an evidence file with URL + date; (3) evidence expiry degrades the rule and fails the test; (4) `conflicts.yaml` entries surface in `request inspect`, `doctor`, and `go-live check`; (5) the orphaned coverage report is generated or deleted.
- **Estimated complexity:** L (authoring) / M (tooling) · **Phase 1** (registry + conformance for money-path rules) → **Phase 3** (full coverage)

### 31.4 P2 findings (condensed — same fields)

| ID | Area / Location | Current state & evidence | Problem → impact | Target state & specification | Dependencies · Risks · Validation · Acceptance | Complexity · Phase |
|---|---|---|---|---|---|---|
| **P2-01** | Packaging · `package.json#files`, `knowledge/`, `docs-packaged/`, `skills/aba-payway-integration/references/` | Tarball 210 files / 5.2 MB unpacked; docs shipped **3×** (`skills/…/references` 718 KB + `docs-packaged` 654 KB + `knowledge` ≈400 KB); one 42 KB chapter committed in **6** places (~254 KB measured) | Install weight and clone weight tripled for identical content; every copy is a chance to read the wrong one → slower installs, higher drift risk | Generate `knowledge/`, `docs-packaged/`, and skill `references/` in `prepack` (the `files` array already ships them); commit only `docs/guides/**`; keep the existing hash-gated freshness test but point it at the generated output | Dep: §22. Risk: `payway docs` must work from an installed package → the `prepack` output is what ships, verified by `smoke-package.mjs`. Validation: `npm pack --dry-run` shows docs once; `smoke:package` passes. AC: tarball ≤ ~3.5 MB unpacked, ≤ ~130 files, no duplicated chapter | M · **Phase 3** |
| **P2-02** | Repo hygiene · `docs/api/` (239 generated TypeDoc HTML) | Committed build output; CI runs `docs:api` and `check:public-docs` (content scan) but nothing compares the committed HTML to a fresh build | Generated artifacts drift silently; 239 files of review/clone weight; `check:public-docs` gives false confidence (it scans for forbidden names, not staleness) | Publish API docs to GitHub Pages from `docs.yml`; delete `docs/api/` from git; keep `check:public-docs` for the packaged corpus | Dep: Pages setup. Risk: external links to `docs/api/*` → redirect stub + Pages URL in README. Validation: no tracked HTML; Pages deploy green. AC: `git ls-files docs/api` empty; Pages serves current API docs; a workflow deploys on tag | S · **Phase 1** |
| **P2-03** | Repo hygiene · `payway-boilerplate/` (251 files) | Directory names with spaces and a typo (`Refrence-copy-PayWay API — Complete Collection-1`, 313 KB duplicate); `Goal.txt.txt`; `learnings/`; a Next.js 16 app with a committed `package-lock.json` and `rsa.public`; an Express app whose 2 test files no gate runs (T2) but which `docs/aba-payway-coverage-report.json` cites as `test_evidence`; `better-sqlite3 ^12.6.2` there vs `13.0.3` pinned in CI | Shell-quoting friction, dead weight, and cited-but-unexecuted tests → false coverage confidence | Rename to `integrations/{postman,boilerplate/*}` (no spaces); delete the duplicate copy, `Goal.txt.txt`, `learnings/`; add a CI job per sub-project; align dependency versions; regenerate or delete the coverage report | Dep: P0-01, §33. Risk: breaking Postman import paths → the `_build` tooling already regenerates `dist`. Validation: each sub-project's tests run in CI; no path contains a space. AC: `integrations/**` CI-green; zero spaces in tracked directory names; no orphaned coverage claims | M · **Phase 3** |
| **P2-04** | SDK correctness · `src/domains/qr.ts:120-135` | `generateQr` validates transactionId, amount, currency, amount floor, callback URL, lifetime, and the wechat/alipay USD-only rule — but **not** `paymentOption` membership (contrast `requestQr` at `:191`, which does). OFFICIAL QR docs allow only `abapay_khqr`, `wechat`, `alipay` | `qr.generateQr({paymentOption:'cards'})` passes locally and fails at the gateway → a wasted round-trip and an opaque `code 1`-class failure | HARD membership check against the official QR enum from `rules.yaml#QR-012`; keep `PAYMENT_OPTIONS` for the shared/purchase surface and stop using it as the QR validator's source | Dep: P1-13 (rules). Risk: a profile-specific option would be rejected → allow an `additionalPaymentOptions` config escape, ADV-only. Validation: unit tests for each value; `rules check` parity. AC: invalid QR options throw locally with a rule id and the official list | S · **Phase 1** |
| **P2-05** | SDK correctness · `src/utils.ts:36-46`, `constants.ts:381-396` | `warnAdvisory` promotes **every** advisory to a hard `PayWayConfigError` under `strictValidation`, including repo opinions and archived-spec enums; dedupe is a process-global `Set`; output is `console.warn` (bypasses `createPayWayLogger`) | Strict mode — the recommended setting for careful integrators — becomes the mode most likely to reject valid requests (P0-02); long-running servers see each advisory once per process, then silence; advisories cannot be routed, levelled, or JSON-formatted | Advisory records `{id, ruleId, severity, source, message, docRef}` emitted through the logger with per-client dedupe; `strictValidation` promotes only `source:'official'`; `onAdvisory` hook; `PAYWAY_ADVISORY_IGNORE=<id,…>`; `payway rules list --advisories` enumerates them | Dep: P1-13. Risk: existing strict-mode users see new failures when official advisories are promoted → that is correct, and the changelog lists each. Validation: tests for dedupe scope, hook firing, promotion by source, logger routing. AC: no `console.warn` in `src/` outside the CLI's human renderer; promotion is source-gated; advisories enumerable and individually suppressible | M · **Phase 2** |
| **P2-06** | Error model · `src/errors.ts` | `PayWayWebhookError extends PayWayError(…, 'config_error')`; four subclasses override the `readonly type` via `(this as {type: PayWayErrorType}).type = …`; no `code`/`category`/`severity`/`docRef`/`retry` on the error | Callback failures are indistinguishable from misconfiguration in any `type`-based triage and collapse to exit 1 instead of 4; the cast defeats narrowing; SDK consumers cannot render an actionable message without importing the CLI's decoder | Add `'webhook_error'` to `PayWayErrorType`; make `type` a constructor parameter (no casts); add `explain(): PayWayErrorRecord` on the base class backed by the registry moved to `src/core/error-registry.ts`; derive `category`/`exitCode` from `type` in one table | Dep: §15.3, §21.2 (`errors.yaml`). Risk: `instanceof`/`type` checks in the wild → additive; `type` values unchanged except the new one. Validation: exhaustive union test; exit-code mapping test per class; `explain()` golden files. AC: no casts; `webhook_error` exists and maps to exit 4; `explain()` available without the CLI | M · **Phase 2** |
| **P2-07** | Validation consistency · `src/utils.ts:48-52` + 7 `resolveCurrency` spellings in `src/cli.ts` | `validateCurrency` is case-sensitive (`usd` throws) while OFFICIAL docs say currency is "Not case-sensitive"; their own audit records 4 COF sites skipping `.toUpperCase()` and 7 total spellings | A lowercase currency from a form/query is rejected by the SDK though the gateway would accept it; 7 spellings guarantee inconsistent normalisation between commands | One `core/money.ts#parseCurrency(value, {strict})` that upper-cases then validates, used everywhere; label the residual strictness as a REPO choice in `rules.yaml#QR-011`; `rules check` reports the normalisation | Dep: P1-03 (helper extraction). Risk: none material. Validation: unit tests for `usd`/`Usd`/`USD`/invalid; a grep test asserting one spelling. AC: 1 spelling; lowercase accepted and normalised; the rule records the divergence from official case-insensitivity | S · **Phase 2** |
| **P2-08** | Money policy location · `src/cli.ts:3557-3593` (payout total invariant), `src/cli.ts` `--max-over-capture-pct 110` | Two money invariants are enforced **only** in the CLI | SDK consumers (the actual production integration path) get neither check → an over-capture or a mismatched split payout reaches the gateway and fails there, or worse, succeeds | Move both to `core/money.ts` (`assertPayoutTotal`, `assertCaptureWithinCeiling`) and call them from `domains/payout`, `domains/pre-auth`, `domains/payment-link`, and the CLI | Dep: P1-03. Risk: new SDK-side failures for callers who relied on the gateway → correct behaviour, documented as a behaviour change with the rule id. Validation: unit tests per domain; parity test CLI vs SDK. AC: both invariants enforced in the domains; CLI delegates; `rules.yaml#PUR-007/PA-002` cite the code location | S–M · **Phase 2** |
| **P2-09** | Test platform defect · `src/__tests__/sdk-facade-and-tunnel.test.ts:98-110`, `src/webhook/tunnel.ts` | A `.cmd` fake `cloudflared` is spawned without a platform gate → `EACCES` on Linux; the whole suite is red on the CI OS matrix | Contributors see an unrelated failure on their first Linux/CI run and learn to ignore red tests | `it.skipIf(process.platform !== 'win32')` for the `.cmd` path **plus** a POSIX `#!/bin/sh` + `chmod 0o755` variant so both platforms test the real behaviour; unit-test binary resolution per platform | Dep: none. Risk: none. Validation: suite green on Linux and Windows in CI. AC: 0 failures on both matrix entries; tunnel behaviour covered on both | S · **Phase 0** (folded into P0-05) |
| **P2-10** | Test coverage gaps · `vitest.config.ts` include `src/**/*.test.ts`; 4 SQLite suites skipped (24 tests); `vitest.stryker.config.ts` unused; no CJS smoke | Sub-project tests never run (T2); SQLite paths untested in the default env; mutation config exists but no gate; the CJS `import.meta` defect (L6) is ungated | Real code paths ship unexercised; a mutation-testing config that never runs is decoration | Add CI jobs: `boilerplate` (install + test each sub-project), `sqlite` (install `better-sqlite3@13.0.3`, run the 4 suites), `cjs-smoke`, and a nightly non-blocking mutation run scoped to `src/auth`, `src/core/money`, `src/utils` | Dep: §33. Risk: CI time → parallel jobs, nightly for mutation. Validation: all four jobs green; skip count drops from 24 to 0 in the sqlite job. AC: 0 skipped SQLite tests in CI; sub-project tests executed; CJS smoke green; mutation report published nightly | M · **Phase 1** |
| **P2-11** | Public API boundary · `src/index.ts` (~258 exports) | Mock server, test harness, journal SQLite sinks, storage service, webhook server, offline KHQR, image opener, and sandbox registries are all in the single production entrypoint; no subpath exports | A merchant server bundles a mock gateway and MCP/QR/YAML weight; no way to depend on just the webhook receiver or just offline KHQR | Subpath exports per §7.4 (`./webhook`, `./khqr-offline`, `./diagnostics`, `./testing`, `./cli`); move test/mock infrastructure to `src/testing/` exported **only** via `./testing`; keep the root export surface backward-compatible for one major | Dep: P1-03 (directory move). Risk: breaking deep imports (`aba-payway-ts/dist/...`) → document the supported specifiers and add a `check-package-contents` assertion. Validation: `smoke-package.mjs` imports each specifier in ESM and CJS; bundle-size assertion for the root specifier. AC: 5 subpath exports working in ESM+CJS+types; root specifier no longer pulls the mock server; package size reduced | M · **Phase 3** |
| **P2-12** | Dependency weight · `package.json` runtime deps | `@modelcontextprotocol/sdk@1.30.0`, `commander`, `@clack/prompts`, `qrcode`, `ajv`, `yaml@2.9.0` are all **runtime** deps of a server-side payment SDK | Every merchant install pulls an MCP SDK, a QR renderer, a YAML parser, and a CLI framework; two pins (`1.30.0`, `2.9.0`) block security patching | Move `commander`/`@clack/prompts`/`qrcode`/`yaml`/`@modelcontextprotocol/sdk` to the CLI/MCP subpath bundles (tsup already bundles `dist/cli.*` — verify they are external vs bundled and make it deliberate); keep `ajv` only if `rules.yaml` validation ships in the SDK, otherwise dev-only; relax the two exact pins to ranges with a lockfile | Dep: §32, P2-11. Risk: bundling CLI deps into `dist/cli.js` increases that file (already 906 KB CJS) but removes them from library installs — measure both. Validation: `npm ls --omit=dev` after installing the packed tarball in a consumer; bundle-size report per entrypoint. AC: installing `aba-payway-ts` for library use pulls ≤2 runtime deps; CLI subpath works standalone; no exact pins without a recorded reason | M · **Phase 3** |
| **P2-13** | Build defect · `src/mcp/server.ts:56`, tsup CJS output | `"import.meta" is not available with the "cjs" output format` — `dist/cli.cjs` resolves `package.json` from `''` | Any CJS consumer of the CLI bundle gets a broken MCP `package.json` resolution; silent because nothing tests the CJS CLI | Replace `import.meta.url` resolution with a dual-safe helper (`createRequire(import.meta.url)` in ESM, `__dirname` in CJS, chosen at build time via a tsup `define`/banner or a small shim module); add the CJS smoke job (P2-10) | Dep: none. Risk: low. Validation: `node dist/cli.cjs mcp --list-tools` works; build emits no warnings. AC: zero tsup warnings; CJS and ESM CLI both pass the smoke test | S · **Phase 1** |
| **P2-14** | Secret hygiene · `.gitignore`, `.zcodeignore`, `payway-boilerplate/payment_link_api/rsa.public`, `.scratch/telegram-*/answers/raw/*.json` | `.gitignore` uses `*key*.txt`/`*secret*.txt` and negates a whole Postman `dist/`; a second near-duplicate ignore file exists; a public key and a Next.js lockfile are committed in a boilerplate; verbatim third-party bot transcripts are published | Over-broad patterns silently ignore legitimate files and create false confidence; two ignore files drift; published partner-channel transcripts are a confidentiality and evidence-quality problem (S4) | Replace glob patterns with explicit paths; merge `.zcodeignore` into `.gitignore`; move transcripts to `.maintainer/` (P0-01) and keep only the *derived, attributed* facts in `knowledge/rules/evidence/` with channel + date; add a `THIRD-PARTY-LICENSES` entry for any retained extract | Dep: P0-01. Risk: losing evidence traceability → the private line retains the raw captures and the evidence files quote them. Validation: `check-repository` passes; `git check-ignore -v` on a sample of legitimate `*key*` filenames shows they are not ignored. AC: no over-broad ignore globs; one ignore file; no raw transcripts in the public tree | S · **Phase 0/1** |
| **P2-15** | Skill taxonomy · `skills/` (35 dirs), `skills-lock.json` | ~21 of 35 skills wrap a single endpoint; no machine-readable `triggers`/`allowed_tools`/`prohibited_tools`/`validation`/`escalation`; `assets/*.ts` duplicated from `examples/integration-recipes/`; `skills-lock.json` tracks 2 of 37 skills | An agent must already know the endpoint to pick a skill; no skill tells an agent that `payout` is money-moving; duplicated assets drift; installed-skill provenance is unverifiable | 14 job-shaped skills with the §23.3 schema; `references/` generated at pack time; `assets/` replaced by a generated manifest linking `examples/integration-recipes/`; `skills-lock.json` covers all skills with `{name, version, sha256, source, license}`; `payway skills doctor` validates installed skills against the shipped `rules.yaml` | Dep: §21.2, §23. Risk: users with installed skills need an update → `skills update` already exists; keep old names as aliases in the lock for one release. Validation: schema test per skill; trigger-uniqueness test; `allowed_tools` ⊆ `capabilities`. AC: 14 skills, all schema-valid, no duplicated assets, full lock coverage, `skills doctor` implemented | L · **Phase 3** |
| **P2-16** | Agent instructions · `AGENTS.md`, `.agents/AGENTS.md`, `HANDOFF.md`, `docs/agents/*`, `llms.txt`, `skills/README.md` | Four+ competing entrypoints; `HANDOFF.md` is a mandated 107 KB pre-read; no MUST/MUST NOT block; no repo map; no definition of done; no in-repo `CLAUDE.md`/`.cursorrules`/copilot-instructions | Agents get contradictory or stale guidance and skip the mandate; contributors' agents are unguided; duplicated rule statements drift | §28 — one `AGENTS.md` (≤250 lines) + `docs/agents/*` long form + generated per-tool adapters + `guardrails.yaml` rendered verbatim into every surface + `agents-md.test.ts` enforcing size, command existence, path existence, no TLS bypass, and no duplicate rule statements | Dep: §30, P0-04. Risk: losing accumulated context → migrate durable content to `docs/agents/evidence-log.md` and `conflicts.yaml` rather than deleting. Validation: the instruction test; a fresh-agent dry run of Scenario A using only `AGENTS.md`. AC: one entrypoint; `.agents/AGENTS.md` removed or reduced to a pointer; `HANDOFF.md` out of the public tree; adapters generated; test blocking | M · **Phase 1** |
| **P2-17** | Fixtures · `src/webhook/fixtures.ts` (6 events, code-only), `src/test/test-utils.ts#mockJsonResponse` | No on-disk fixture corpus; each test hand-rolls response bodies; the 96 `observedMessage` values in the error registry are a de-facto corpus that nothing uses | Response-shape classification (300 lines in `client.ts`) has no per-shape corpus; merchants cannot reuse the project's fixtures in their own tests | §19 — `fixtures/` with per-operation outcome directories, provenance tags, a generated `INDEX.json`, and three consumers (contract tests, `webhook fixtures`/`sandbox scenarios`, merchant test kits via `aba-payway-ts/testing`) | Dep: P2-11 (`./testing` subpath). Risk: fixture drift from real behaviour → provenance tags + the nightly live sandbox contract job re-captures. Validation: `INDEX.json` ↔ files parity test; every `normalizePaywayResponse` branch has a fixture. AC: corpus committed with provenance; classification branches fixture-covered; `payway webhook fixtures` writes them; merchants can import them | M · **Phase 2** |
| **P2-18** | Troubleshooting · `src/cli/explain-code.ts`, `src/journal/intelligence.ts` | `explain` decodes one code; `journal explain` does RCA over local journal events; nothing joins a symptom + code + HTTP status + transaction id + journal context into a ranked diagnosis | Developers and agents cannot triage; the excellent error registry is used one code at a time | §15.5 — `payway diagnose` with a closed symptom vocabulary from `symptoms.yaml`, four confidence buckets, mandatory evidence citations, and a never-fabricate contract | Dep: §21.2, journal, `rules.yaml`. Risk: over-confident output → the `confirmed` bucket requires a named local evidence item, enforced by test. Validation: golden files per symptom; a test asserting `confirmed: []` when no evidence exists. AC: `diagnose` implemented for ≥15 symptoms; every cause carries a `ruleId`; `evidenceMissing` always populated for gateway-side facts | M · **Phase 3** |
| **P2-19** | Docs IA · `docs/` (5 naming conventions), `docs/reference/SDK-AND-CLI-REFERENCE.md` (46 KB hand-written), `docs/README.md` | Numbered chapters (01–24) + `integration-*` + ALL-CAPS one-offs + `reference/` + `recipes/`; the CLI/API reference is hand-written against ~86 commands; three index surfaces (`docs/README.md`, `docs-packaged/README.md`, `llms.txt`) | Their own audit scored doc accuracy 5.5/10; a hand-written reference for 86 commands cannot stay true; numbered chapters imply a reading order the docs disclaim | §20.3 — slug-based job-shaped guides, **generated** `reference/cli.md` + `cli.json` from `capabilities`, generated `errors.md`/`rules.md`/`products.md`, one `docs/index.md` map, and a registry↔doc parity test | Dep: P1-02 (`capabilities`). Risk: link rot → redirect stubs for the numbered paths (the generator already writes mirror headers). Validation: parity test (every command documented, every documented command exists, every documented flag exists); link check in CI. AC: zero hand-written reference prose; parity test blocking; one map; slugs stable | L · **Phase 3** |
| **P2-20** | Release engineering · no tags, no release workflow, `CHANGELOG.md` (123 KB, one rolling `Unreleased`), `version: 1.5.0` | `git tag` → empty; `.github/workflows/` has only `ci.yml`; the changelog mixes dated relay waves under `Unreleased`; README says "do not assume that version is available on npm" | No reproducible release, no provenance, no migration record; the project's own policy (`VERSIONING.md`) says the current state should be a new major | §34 — tag-driven `release.yml` with npm trusted publishing + provenance, Keep-a-Changelog lint, generated migration notes per breaking change, and a `MIGRATIONS.md` covering the 2.0.0 output-contract, bin, lifetime-unit, and enum changes | Dep: P1-10 (identity/version decision), P0-01..P0-05 (do not publish a red pipeline). Risk: publishing before Phase 0 → gate `release.yml` on the full `RELEASE_CHECKLIST`. Validation: a dry-run publish to a private registry; provenance visible. AC: tag workflow green; version chosen per policy; changelog folded; migration notes published | M · **Phase 4** |

### 31.5 P3 findings (condensed)

| ID | Area / Location | Finding | Target | Phase |
|---|---|---|---|---|
| **P3-01** | CLI naming · `src/cli.ts` | Five naming conventions across ~86 commands (`check-transaction` / `transaction-detail` / `get-transactions-by-ref` / `tx-batch` / `generate-qr` vs `request-qr` vs `generate-checkout` vs `checkout-form` / `setup-webhook` vs `webhook`) | Noun-first tree (§9.2) with every current name kept as a hidden alias emitting a stderr deprecation; alias parity generated + tested | 2 |
| **P3-02** | Naming/identity · `package.json#bin` | `payway-sdk` (bin) ≠ `aba-payway-ts` (package) ≠ `payway` (concept); `payway-sdk` is squatted on npm by an unrelated package, so README must warn against bare `npx payway-sdk` | Ship `bin: {payway, payway-sdk}` at 2.0.0; keep the squatting warning until npm resolves it; align name/bin per P1-10 | 4 |
| **P3-03** | Status model · `src/constants.ts:91-121` | `PAYMENT_STATUS_CODES.PRE_AUTH = 0` duplicates `APPROVED = 0` (documented, but a `switch` footgun); `PAYMENT_STATUS_LABELS` is hand-maintained beside it | `core/lifecycle.ts` (§12.3) makes the numeric code insufficient on its own: `normalizeTransactionState` requires the `payment_status` string to disambiguate, and `assertFulfillable` refuses code-0-only evidence; generate the label map from `rules.yaml#TX-001` | 2 |
| **P3-04** | Docs placement · `docs/HISTORY-SECRET-TRIAGE.csv` + `docs/project/HISTORY-SECRET-TRIAGE.md` | A split pair across two directories, both internal, both published | Both move to `.maintainer/` per P0-01; the public tree keeps only the *policy* (`guides/security-and-secrets`) | 0 |
| **P3-05** | Example hygiene · `examples/first-payment/package.json` | Self-dependency `"payway-first-payment-example": "file:"` alongside `"aba-payway-ts": "file:vendor/aba-payway-ts.tgz"` | Remove the self-reference; document the `npm run setup` vendor step (already implemented) | 1 |
| **P3-06** | TS config · `tsconfig.json` | `outDir: ./dist/sdk` + `declaration: true` while the build is tsup; `rootDir: "."` with `include: src/**` yet `docs/examples`, `examples/*`, and test files import the package by name — the exact cause of P0-05's pre-build failure | Split `tsconfig.build.json` (tsup inputs only) from `tsconfig.typecheck.json` (includes examples/docs-examples and maps `aba-payway-ts` → `src/index.ts` via `paths`, so typecheck no longer depends on `dist/`); delete the misleading `outDir` | 0 |
| **P3-07** | Ungated examples · `docs/examples/flutter/payment_screen.dart`, `docs/examples/telegram/*` | Polyglot examples with no compile/lint/test gate | Either gate them (dart analyze in a nightly job) or move them to `docs/reference/external-examples.md` with an explicit "unverified, community-shaped" label | 3 |
| **P3-08** | Skill lock naming · `skills-lock.json` at repo root | The name implies it locks all skills; it tracks 2 third-party ones | Rename to `skills/lock.json`, cover all skills (P2-15), and add `license` + `upstream` fields | 3 |
| **P3-09** | Governance · `.github/` (4 files) | No `CODEOWNERS`, no `dependabot.yml`, no issue template for "PayWay behaviour changed" or "rule conflict" | Add `CODEOWNERS` (money-path dirs require maintainer review), `dependabot` (npm + actions, weekly, grouped), and the two new issue templates from §25.2 — the rule-conflict template is what keeps `conflicts.yaml` populated by the community | 1 |
| **P3-10** | Process archives · `docs/superpowers/` (~30 TASK-NNN files), `docs/test-cases/` CSVs, `.scratch/` one-off `.py`/`.mjs` patch scripts, ~25 `scripts/sandbox-probe-*.ts` | ~400 files of unrunnable process history in the public tree; probes are valuable evidence stored as one-offs | Archives to `.maintainer/`; probes become `scripts/probes/*.probe.ts` with a runner that records results into `knowledge/rules/evidence/` (turning one-off scripts into reproducible evidence) | 0/3 |
| **P3-11** | Interactive-only ergonomics · `src/cli/session.ts` | `:use <tran-id>` stickiness exists only in the TTY `session` shell, so non-TTY agents re-pass `-t` on every command | `transaction current [--set|--clear]` backed by the data root (§9.5), used automatically by `transaction verify`/`explain`/`refund` when `--id` is omitted — with an explicit stderr note that the sticky id was used | 2 |
| **P3-12** | Command semantics · `payway-sdk test`, `validate` | `test` runs the **mock** suite (C12) and `validate` checks only a refund amount / transaction id (C11), while both names promise far more | `test` → `sandbox test` (live, guarded) and `demo --check` (mock, clearly labelled); `validate` → `validate config|request|integration` (§9.5). Keep old names as aliases with a stderr clarification | 2 |

---

## 32. Dependency and Tooling Audit

**Principle applied:** no dependency is swapped without migration value. Every recommendation below is *keep*, *scope*, *pin-policy*, or *add-with-justification*.

### 32.1 Runtime dependencies

| Dependency | Version | Used by | Verdict |
|---|---|---|---|
| `commander` | ^14 | CLI only | **Keep, rescope.** Correct choice (mature, typed, extensible help — the repo already subclasses it for `GroupedProgramHelp`). Should be bundled into `dist/cli.*` or moved to the CLI subpath so library installs do not pull it (P2-12) |
| `@clack/prompts` | ^0.11 | CLI interactive layer | **Keep, rescope.** Good modern prompts; already behind `src/cli/ui/prompts.ts` with a `PAYWAY_UI=classic` fallback, so the abstraction is right |
| `qrcode` | ^1.5 | `generate-qr --save-qr`, offline KHQR PNG | **Keep, rescope.** Terminal QR rendering is a genuine CLI value-add; belongs to the CLI/offline subpaths, not the merchant server bundle |
| `yaml` | **2.9.0 (exact pin)** | `payway-openapi` tooling / knowledge sync | **Keep, relax the pin.** An exact pin on a patch-level-stable parser blocks security updates for no benefit; move to `^2.9.0` with the lockfile as the source of truth. Verify whether it is needed at *runtime* at all — if it is only used by `scripts/`, it should be a devDependency |
| `ajv` | ^8 | `src/schema.ts` | **Keep, and finally use it.** `ajv` is a runtime dependency but request/response payloads are **not** validated against the OpenAPI schema — validation is hand-written imperative code. Two options: (a) make it dev-only and drop it from the runtime bundle, or (b) use it for what it is good at — validating `knowledge/rules/*.yaml` documents (§21.2) and, optionally, gateway responses in `strictValidation` mode. Recommended: (b) for the rules layer (a real consumer, three-plus call sites) and keep response validation hand-written (the response shapes are too irregular for a schema to add value — see the 300-line classifier) |
| `@modelcontextprotocol/sdk` | **1.30.0 (exact pin)** | `src/mcp/*` | **Keep, rescope, relax the pin.** MCP support is a differentiator, but a merchant server has no use for it. Bundle into the CLI/MCP subpath. The exact pin is defensible for a fast-moving protocol **only** if accompanied by a recorded reason and a renovate/dependabot rule; otherwise move to `^1.30.0` |

**Net effect of rescoping:** a library-only install (`import { PayWay } from 'aba-payway-ts'`) should pull **zero** runtime dependencies beyond what `core/`+`transport/`+`domains/` need — which today is nothing. That is a measurable, marketable improvement: "a payment SDK with no runtime dependencies for the payment path."

### 32.2 Dev dependencies and tooling

| Tool | Verdict |
|---|---|
| `tsup` (ESM+CJS+dual types) | **Keep.** Dual output with per-condition `types` and a `.d.cts` is correct and already fixed the repo's own C1/TS1479 defect. Fix the `import.meta`-in-CJS warning (P2-13) |
| `vitest` 4 + coverage v8 | **Keep.** 2,378 tests in 130 s with hermetic env scrubbing is excellent. Note: `--reporter=basic` does not exist in v4 (a real trap for contributors — document the valid reporters in `CONTRIBUTING.md`) |
| `biome` (lint + format) | **Keep, and gate the formatter** (P1-09). One tool for lint+format is the right call for contribution velocity. Remove the `src/cli.ts` overrides once P1-03 lands |
| `typedoc` | **Keep, publish to Pages** instead of committing 239 HTML files (P2-02) |
| `openapi-typescript` | **Keep.** Generated `src/types.ts` with `x-hmac-fields` vendor extensions is exactly right |
| `tsx` | **Keep.** Used for probes and `npm run` scripts |
| `better-sqlite3` (optional peer, pinned `13.0.3` in CI) | **Keep.** Correctly optional with `probeStorageBackend()`; but the version pin diverges from `payway-boilerplate/merchant-qr-pos` (`^12.6.2`) — align (P2-03) and actually run the SQLite suites in CI (P2-10) |
| `gitleaks` (CI action) | **Keep, make blocking** (P0-05 §6). Currently `continue-on-error: true` + manual outcome inspection |
| Stryker (`vitest.stryker.config.ts`) | **Keep the config, add a nightly job** — an unused mutation config is decoration (P2-10) |
| **Missing: `changesets` or equivalent** | **Add.** The changelog is a 123 KB rolling `Unreleased` section; a changeset-per-PR workflow makes release notes and migration notes a byproduct of the PR (§34) |
| **Missing: dependency audit / SBOM / licence check** | **Add.** `npm audit --omit=dev --audit-level=high` (blocking), `npm audit signatures`/provenance verification, a licence-compatibility check (MIT project consuming third-party skills — S5/P0-01), and an SBOM artifact on release. For a payment SDK, "we know our supply chain" is a trust feature |
| **Missing: CodeQL / OSV scanning** | **Add** CodeQL (security quality tier) on the `security-events` path; OSV-Scanner weekly. Cheap, and expected by any enterprise reviewer of a payments library |
| **Missing: Renovate/Dependabot** | **Add** (P3-09), grouped weekly, with the two exact pins flagged for human review |

### 32.3 Node and platform support

`engines.node >= 22.12.0`; CI matrix `22.12.0 / 22.x / 24.x` × `ubuntu-latest / windows-latest`. **Keep** — but note the consequences: (a) per `docs/project/VERSIONING.md` this floor is a breaking change requiring a new major (⇒ 2.0.0, P1-10); (b) the Windows leg is the only place the `.cmd` tunnel path is exercised, which is why the Linux failure survived (P2-09); (c) no macOS leg — acceptable, but the data-root resolution (`APPDATA` vs `~/.config`) should be unit-tested for `darwin` even if not run there.

---

## 33. CI/CD Quality Gates

### 33.1 Current pipeline (`.github/workflows/ci.yml`)

`Install → Typecheck → Lint (biome lint src skills) → Build (tsup + typedoc) → Test (vitest, 2×3 matrix) → check:package → check:public-docs → check:repository → check:secret-allowlists → gitleaks (continue-on-error + manual outcome) → smoke:package → smoke:example`.

**Structural defects:** typecheck before build (P0-05.1); no format gate (P1-09); no CJS smoke (P2-13); no sub-project tests (T2); SQLite suites skipped (T3); gitleaks non-blocking in effect; no release workflow; no CODEOWNERS/dependabot; no Pages deploy; no coverage-delta reporting; no bundle-size assertion; the `docs:api` output is never compared to the committed HTML (P2-02).

### 33.2 Target pipeline

| Job | Runs on | Steps | Blocks merge? |
|---|---|---|---|
| **setup** | ubuntu | `npm ci` (cached) | ✅ (prerequisite) |
| **build** | ubuntu | `npm run build` (tsup + typedoc to an artifact, **not** committed) | ✅ |
| **typecheck** | ubuntu | `tsc -p tsconfig.typecheck.json --noEmit` — after build, and with `paths` mapping so it does not *depend* on build (P3-06) | ✅ |
| **lint** | ubuntu | `biome lint src scripts skills examples integrations` + `biome format --changed` (PR) / full (main) | ✅ |
| **test:unit** | ubuntu × node 22.12/22.x/24.x | `vitest run --coverage`; coverage floors enforced; per-directory floors for `core/`, `auth/`, `domains/` (≥90% branches); coverage delta posted as a PR comment | ✅ |
| **test:windows** | windows × node 22.x | same suite — this is where the tunnel `.cmd` path is genuinely exercised | ✅ |
| **test:sqlite** | ubuntu | install `better-sqlite3@13.0.3`, run the 4 SQLite suites (0 skips) | ✅ |
| **test:contract** | ubuntu | §18.4 CLI output-contract sweep + fixture corpus parity + `rules-conformance` + `env-registry-conformance` + `agents-md` + `architecture-boundaries` | ✅ |
| **test:boilerplate** | ubuntu | for each `integrations/boilerplate/*`: `npm ci && npm test && npm run build` | ✅ |
| **package** | ubuntu | `check:package`, `check:public-docs`, `check:repository`, `check:repository-manifest` (P0-01), `check:identity` (P1-10), `npm pack --dry-run` with a **file-count and size budget assertion** | ✅ |
| **smoke** | ubuntu | `smoke:package` (ESM+CJS+types+bin from the packed tarball), `smoke:example`, **CJS CLI smoke**, `mcp --list-tools`, `skills install` into a temp dir | ✅ |
| **security** | ubuntu | gitleaks (**blocking**, allow-listed), `npm audit --omit=dev --audit-level=high`, licence compatibility, `check:secret-allowlists` | ✅ |
| **docs** | ubuntu | generated-reference parity (commands ↔ `reference/cli.md`, errors ↔ `errors.md`, env vars ↔ `.env.example`), link check, `docs-examples` compile | ✅ |
| **codeql** | ubuntu | CodeQL javascript-typescript security-and-quality | ✅ on new high-severity alerts |
| **sandbox-contract** | ubuntu, **nightly + pre-release only** | `PAYWAY_SANDBOX_CONTRACT=1 npm run test:sandbox` using repository secrets; records results into `knowledge/rules/evidence/` | ❌ (nightly) / ✅ (pre-release) |
| **mutation** | ubuntu, nightly | Stryker on `src/auth`, `src/core/money`, `src/utils` | ❌ (report only, ratchet quarterly) |
| **release** | ubuntu, on tag `v*` | full `RELEASE_CHECKLIST` → `npm publish` via trusted publishing (OIDC + provenance) → GitHub Release with generated notes + SBOM → Pages deploy → `RELEASE-READINESS.md` status comment | n/a |

### 33.3 Gate policy

1. **Blocking = cannot merge.** Everything above except the nightly jobs.
2. **A gate that cannot fail is not a gate.** `continue-on-error` is removed from gitleaks; `check:*` scripts exit non-zero with an actionable message (they already do — `check-repository.mjs` collects *all* failures rather than stopping at the first, which is the right pattern).
3. **Gates must run in the documented developer order.** `CONTRIBUTING.md`, the PR template, and `AGENTS.md` §6 all list `ci → build → typecheck → lint → format:check → test → check:* → smoke`, and CI executes that exact sequence (P0-05).
4. **New gates land with a negative test.** Each gate gets a deliberately-failing fixture in a `ci-negative-tests` job that runs weekly, proving the gate still bites.
5. **Sandbox credentials in CI are read-only-scoped** and used only by the nightly contract job; the job must refuse to run if `PAYWAY_ENV=production` is present in the environment (defence in depth for §10.4 rule 6).

---

## 34. Versioning, Release, Changelog and Migration Policy

### 34.1 Current state

`version: 1.5.0`, **never published**, **no tags**, no release workflow, `CHANGELOG.md` = 1,327 lines dominated by a single rolling `## Unreleased` section organised by dated "ABA-bot-relay conformance wave" entries. `docs/project/VERSIONING.md` exists and states the Node 22.12 floor is breaking; `RELEASE-READINESS.md` item E recommends **2.0.0** and says "do not reuse `1.5.0`". `SUPPORT.md` documents a support policy for a package with no installed base.

### 34.2 Target policy

**SemVer with an explicit contract surface.** The following are the versioned contracts; a breaking change to any of them is a major:
1. `PayWayErrorRecord` and the `PayWayErrorType` union (§15.3).
2. The CLI output envelope and its `schemaVersion` (§9.1).
3. CLI exit codes (§9.1).
4. Command names and flags (removal or semantic change; **additions are minor**).
5. `doctor` check IDs (**additive-only**; renaming an ID is a major).
6. `knowledge/rules/*.yaml` schemas and rule IDs (**additive-only**; deleting a rule id is a major).
7. Public export surface per subpath specifier (removals are majors).
8. Node engine floor.
9. Fixture `INDEX.json` schema.

Everything else (internal modules, docs prose, skill content, generated corpora) is **not** a versioned contract and may change in a patch.

**Release train:** `2.0.0` is the identity+contract release (Phase 0–2 work). Then minor releases monthly, patches as needed. Each release: changesets → version bump → changelog fold → tag → `release.yml` → npm provenance → GitHub Release → Pages deploy → `RELEASE-READINESS.md`/`PROJECT_STATUS.md` updated with the SHA.

**Changelog:** Keep a Changelog format, generated from changesets. Each entry carries `{type: added|changed|deprecated|removed|fixed|security, scope, breaking: bool, ruleIds: [], migrationRef?}`. The 123 KB `Unreleased` section is folded into `2.0.0` with a one-paragraph summary and a link to the archived detail (moved to `docs/project/engineering-log.md`).

**Migration policy:** every breaking change ships with (a) a `docs/project/MIGRATIONS.md#v2-0-0` section, (b) a deprecation window of at least one minor series where the old behaviour still works and emits a **stderr** notice (never stdout — the JSON contract must stay clean), (c) a codemod or an explicit command where feasible.

**The 2.0.0 migration set (from this audit):**
| Change | Old | New | Migration aid |
|---|---|---|---|
| Output envelope | 6 shapes | one envelope, `schemaVersion: "2.0"` | `PAYWAY_CLI_OUTPUT_SCHEMA=1.0` for one minor series; migration table mapping every old path to the new one |
| `--output` scope | 2 commands | global | none needed (strictly additive) |
| Bin | `payway-sdk` | `payway` + `payway-sdk` alias | none needed |
| Command tree | flat verb-noun | noun-first + hidden aliases | `payway capabilities --aliases` prints the mapping |
| QR `lifetime` | seconds, min 180, max 120 d | minutes (pending P0-03 resolution), min 3, max 43200 | `--lifetime-unit` honoured for two minors; stderr advisory on ambiguous values |
| Purchase enum | archived 5 values | official 6 + legacy 2 advisory | P0-02 spec |
| `verifyCallbackDetailed` `stripHash` | default `false` | default `true` | CB-003; migration note + a one-release stderr warning when the old default would have changed the outcome |
| `PayWayWebhookError.type` | `'config_error'` | `'webhook_error'` | P2-06; additive union member |
| Subpath exports | `.` only | `.` + 5 subpaths | none needed |
| Node floor | ≥22.12.0 | unchanged | already documented as breaking |
| TLS | bypass documented | `tlsCaFile` / `NODE_EXTRA_CA_CERTS`; bypass refused by `doctor` | P0-04 |

**Deprecation mechanics:** a single `src/cli/deprecations.ts` registry `{id, surface, since, removal, message, migrationRef}` that renders to stderr once per process per id, is listed by `payway capabilities --deprecations --output json`, and is tested (a deprecated surface must have a registry entry and a working replacement).

---

## 35. Developer Golden Paths

Four paths, each with exact commands, state transitions, and success criteria. These become `docs/index.md`'s spine and `payway init`'s post-run output.

### 35.1 Path 1 — "I want to see it work in 5 minutes, with no credentials"

```bash
git clone <repo> && cd <repo>
npm ci && npm run build
npm exec -- payway demo                      # simulated journey; browser artifact
npm exec -- payway demo --check              # non-interactive assertion mode
npm exec -- payway explain PTL02 --output json
npm exec -- payway docs list
```
**State transitions:** `no project → dependencies installed → build artifacts present → simulated payment created → simulated approval → simulated callback verified → fulfilment decision demonstrated`.
**Success criteria:** `demo --check` exits 0; the developer has seen create ≠ approve, a signed callback, and a missed-callback recovery, and can name the four callback routes. **Zero credentials, zero network egress.**
**Today:** works (`demo` exists and is excellent). **Gap:** `--check` non-interactive mode and the exit-code contract; `demo` has no `--output json`.

### 35.2 Path 2 — "I want my first real sandbox payment" (Scenario A, §6.1)

```bash
npm exec -- payway init --mode sandbox                    # writes .env + complete .env.example
$EDITOR .env                                              # 3 values: MERCHANT_ID, API_KEY, (RSA if needed)
npm exec -- payway env current --output json              # prove: sandbox, endpoint, credential source
npm exec -- payway doctor --route online-qr               # severity-graded; fix every blocker
npm exec -- payway webhook listen --tunnel --print-url    # ONE line; also written to .env
npm exec -- payway qr create --amount 3.00 --currency USD # mints a unique tran_id, saves PNG, prints it
#   → pay it with the ABA simulator
npm exec -- payway transaction verify --expect-amount 3.00 --expect-currency USD --expect-status approved
npm exec -- payway journal timeline --output json
```
**State transitions:** `unconfigured → configured(sandbox) → environment proven → diagnostics pass → public callback URL live → attempt created (outcome: created) → customer paid → callback received & verified → status query confirms approved → amount/currency/id asserted → fulfilment authorised → journal records the whole chain`.
**Success criteria:** `transaction verify` exits 0 with `matches` covering amount, currency, and id; `journal timeline` shows `creation-accepted → callback-received(verified) → status-observed(approved)` with one `correlationId` family; no advisory or warning is unresolved.
**Today:** achievable in 14 steps / 8 manual (§6.1). **Target:** 9 steps / 3 manual, one terminal.

### 35.3 Path 3 — "I want to test my webhook handler without the simulator"

```bash
npm exec -- payway webhook fixtures --out fixtures/payway     # provenance-tagged corpus on disk
npm exec -- payway webhook listen --port 4000 --forward-to http://127.0.0.1:3000/webhooks/aba \
                --expect payment.approved --duration 120 --fail-on unverified --output ndjson &
npm exec -- payway webhook trigger --event payment.approved --amount 3.00 --currency USD --id TX-1
npm exec -- payway webhook trigger --event payment.approved --amount 3.00 --currency USD --id TX-1  # replay
npm exec -- payway webhook verify --against http://127.0.0.1:3000/webhooks/aba --output json
```
**State transitions:** `fixtures materialised → listener up → signed delivery → handler verified & 2xx → forwarded to the merchant app → duplicate detected ((id,status) key) → conformance report: fast-ack, idempotent, rejects-unverified, 401-on-bad-signature`.
**Success criteria:** `webhook verify --against` exits 0 with all four conformance assertions PASS; the replay is reported as `duplicate.isDuplicate: true` and the merchant app fulfils once.
**Today:** `listen`/`trigger`/`forward` work; `fixtures` (on disk), `--expect/--fail-on`, and `verify --against` do not exist (§13.2/§13.3).

### 35.4 Path 4 — "I want to go to production safely"

```bash
npm exec -- payway env use production --profile prod-acme   # refuses on credential/env mismatch (CRED-003)
npm exec -- payway doctor --route all --live --output json  # every category, real probes
npm exec -- payway go-live check --output json              # 25+ gates: PASS/WARNING/BLOCKER/N_A/UNVERIFIED
npm exec -- payway go-live check --evidence ./evidence/aba-screen-review.pdf --gate ui-review
npm exec -- payway go-live report --out go-live-2026-10-05.json
npm exec -- payway rules list --conflicts --output json     # any open conflict on a money path?
npm exec -- payway refund create --id TX-1 --amount 1.00 --confirm-production   # the guard, demonstrated
```
**State transitions:** `sandbox-verified → environment switched & coherence proven → diagnostics green → automated gates evaluated → evidence attached for human gates → UNVERIFIED gates surfaced (not silently passed) → report dated & shareable → production mutation requires an explicit, non-`-y` confirmation`.
**Success criteria:** `go-live check` exits 0 with **zero** BLOCKERs and every UNVERIFIED gate either resolved or explicitly accepted in writing; `rules list --conflicts` shows no open conflict on a money path; the production mutation demonstrates exit 6 without `--confirm-production` and 0 with it.
**Today:** entirely prose (§26 "Missing"). **Target:** §36.

---

## 36. Go-Live Check, Reconciliation and Settlement

### 36.1 `payway go-live check` — specification

**Purpose:** convert `docs/guides/13-deployment-checklist.md` (298 lines) and the G0–G7 gates in `docs/guides/integration-onboarding.md` into an executable, evidence-bearing report that refuses to say "ready" while anything critical is unverified.

**Syntax:**
```
payway go-live check [--category <c,…>] [--gate <id,…>] [--products <id,…>]
                     [--evidence <path>] [--attach <gate-id>=<path>]
                     [--allow-unverified <gate-id,…>] [--strict]
                     [--output json] [--non-interactive]
payway go-live report [--out <file>] [--format json|md]
payway go-live diff <previous-report.json>
```

**Gate statuses:** `PASS` (automated check succeeded, evidence cited) · `WARNING` (advisory; does not block) · `BLOCKER` (must be fixed; exit 5) · `NOT_APPLICABLE` (the merchant does not use that product — derived from `capabilities`/`products` and the resolved config, with the reason recorded) · `UNVERIFIED` (only ABA or the merchant's own evidence can settle it; **never** counted as PASS; blocks `--strict`).

**Gate registry (`knowledge/rules/go-live.yaml`, ≥25 gates, 8 categories):**

| Category | Gate | Type | Status source |
|---|---|---|---|
| CREDENTIALS | production merchant id + api key configured, distinct from sandbox | automated | `doctor CFG-001/002` |
| CREDENTIALS | RSA public key present and current for the products in use | automated | `doctor CFG-003/004` |
| CREDENTIALS | credential↔environment coherence | automated | `doctor CRED-003` (**BLOCKER**) |
| CREDENTIALS | key-rotation response plan documented | evidence-required | attached doc |
| ENVIRONMENT | endpoint is `checkout.payway.com.kh` and no override contradicts it | automated | `doctor ENV-002` |
| ENVIRONMENT | TLS chain validates; no bypass active | automated | `doctor NET-003/NET-004` (**BLOCKER**) |
| SECURITY | no secret in tracked files; no secret in argv; `.env`/profiles outside the repo | automated | `doctor SEC-001..004`, `check-repository` |
| SECURITY | credentials server-side only; client bundle contains no `PAYWAY_*` literal | automated (scan the merchant's declared client entrypoints) | new scan |
| SECURITY | log level not `trace`; redaction policy set | automated | `doctor SEC-003` |
| CALLBACKS | callback URL is production HTTPS and reachable | automated | `doctor WEB-001` |
| CALLBACKS | route-appropriate verification implemented for **every** route in use | automated (static detection) + evidence | `webhook verify --against` |
| CALLBACKS | unverified callbacks rejected with an error status | automated | conformance run |
| CALLBACKS | handler responds 2xx within 5 s | automated | conformance run |
| CALLBACKS | **status-query fallback for missed callbacks implemented** | automated (static) + evidence | **BLOCKER** if absent (CB-007) |
| CALLBACKS | duplicate/idempotent fulfilment proven | automated | replay conformance |
| PAYMENT LOGIC | fulfilment gated on a verified approval with matching amount/currency/id | automated (static detection of `assertFulfillable`/equivalent) | **BLOCKER** if absent |
| PAYMENT LOGIC | local expiry/close policy implemented (no remote EXPIRED status) | evidence-required | TX-003/PL-002 |
| PAYMENT LOGIC | mutation retry policy understood (no blind retries; status query first) | automated (config inspection) | TX-008 |
| PAYMENT LOGIC | duplicate-`tran_id` prevention in the merchant's id generation | evidence-required | TX-008 |
| PRODUCTS | every product in use is `verified: official|sandbox` (not `spec`/`relay`) or explicitly accepted | automated | `products --output json`; **BLOCKER** under `--strict` |
| PRODUCTS | open `conflicts.yaml` entries affecting a product in use | automated | **BLOCKER** while open on a money path (P0-03) |
| UI/BRANDING | payment-selection UI + "We accept" assets per official guidelines | aba-confirmation-required | Integration Team screen review — explicitly **not** automatable |
| UI/BRANDING | KHQR wording/assets/logo dimensions (300×300 ≤3 MB; 40 px min height; 10 px protection space) | evidence-required | attach screenshots |
| UI/BRANDING | T&C/refund-policy consent precedes submission | evidence-required | |
| FINANCE | settlement T+N, fee treatment, tolerance, and report schema recorded from the signed agreement | evidence-required | SET-001 (**UNVERIFIED** until attached) |
| FINANCE | reconciliation procedure implemented per cycle (portal export → bank statement join) | evidence-required | `journal reconcile` + merchant procedure |
| FINANCE | exception classification and owner/due-time recording | evidence-required | `integration-finance` template |
| OPERATIONS | correlation-id → ABA support escalation path documented | evidence-required | L5 |
| OPERATIONS | monitoring/alerting on `PayWayRateLimitError`, circuit-open, and `unknown` outcomes | evidence-required | |
| OPERATIONS | rollback plan for a failed launch | evidence-required | |

**Output (`kind: "diagnostic"`, exit 0 or 5):**
```jsonc
{ "schemaVersion":"2.0", "kind":"diagnostic", "command":"go-live.check", "ok":false,
  "data": {
    "summary": { "pass":18, "warning":3, "blocker":2, "notApplicable":4, "unverified":3, "total":30,
                 "ready": false, "reason":"2 blockers; 3 unverified gates on money paths" },
    "gates": [
      { "id":"CALLBACKS-005", "category":"CALLBACKS", "title":"Status-query fallback for missed callbacks",
        "status":"BLOCKER", "severity":"blocker", "type":"automated",
        "detail":"no `transaction get`/`poll` call found after callback handling in src/webhooks/aba.ts",
        "evidence":["static-scan:src/webhooks/aba.ts:41-88"],
        "fix":{ "command":"payway docs callbacks-and-webhooks#recovery",
                "explanation":"PayWay delivers callbacks once, best-effort, with no retry. A missed callback is NOT a failed payment." },
        "ruleIds":["CB-007","TX-003"], "docRef":"guides/callbacks-and-webhooks#recovery" },
      { "id":"PRODUCTS-002", "category":"PRODUCTS", "title":"No open rule conflict on a product in use",
        "status":"BLOCKER", "severity":"blocker", "type":"automated",
        "detail":"conflicts.yaml#QR-LIFE-001 is open and affects qr.create (lifetime unit)",
        "evidence":["knowledge/rules/conflicts.yaml#QR-LIFE-001"],
        "fix":{ "command":"payway rules show QR-LIFE-001", "explanation":"resolve or accept in writing with --allow-unverified" },
        "ruleIds":["QR-013"] },
      { "id":"FINANCE-001", "category":"FINANCE", "title":"Settlement terms recorded from the signed agreement",
        "status":"UNVERIFIED", "severity":"error", "type":"evidence-required",
        "detail":"no evidence attached; T+N is merchant-specific (T+3…15 working days observed) and cannot be inferred",
        "fix":{ "command":"payway go-live check --attach FINANCE-001=./evidence/settlement-terms.pdf" },
        "ruleIds":["SET-001"] }
    ],
    "notApplicable": [ { "id":"PRODUCTS-PREAUTH", "reason":"pre-auth is not enabled for this merchant profile" } ],
    "evidence": [ { "gate":"UI-002", "path":"./evidence/khqr-assets.png", "sha256":"…" } ]
  },
  "next": [ { "command":"payway go-live diff <previous.json>", "reason":"track progress across runs" } ] }
```
**Rules:** a gate may be `PASS` **only** with a cited evidence item; `UNVERIFIED` is never silently promoted; `--allow-unverified <gate>` requires a reason string that is recorded in the report; `go-live diff` shows gate transitions between two dated reports so progress is visible; the report is a shareable artifact (redacted by the strictest policy).

### 36.2 Reconciliation vs settlement — guidance and the tooling boundary

The repository already states the correct doctrine, and it should be preserved verbatim in the target docs:

> *"A verified approval authorizes a payment posting under the business policy. It does not prove external shipping succeeded or that money settled."* — `docs/guides/integration-finance.md`
> *"No approved status, diagnostic journal entry or manually typed total establishes settlement."* — same
> *"Amount/time/APV/masked-card similarity is an investigation lead, never an automatic match or signoff."* — same

**The four-way distinction that must be explicit in code, CLI, and docs:**

| Concept | What it proves | Source | Represented by |
|---|---|---|---|
| **API acceptance** | the gateway accepted and signed the request | HTTP 2xx + `status.code == 00` | `outcome: 'created'` |
| **Payment result** | the customer's payment was approved | verified callback **or** status query, with amount/currency/id matched | `outcome: 'approved'` + `fulfilment.authorized: true` |
| **Verification** | the merchant independently confirmed the result | `transaction get`/`detail` after a callback hint | `source: 'status-query'`, `correlationId` |
| **Settlement** | money arrived in the merchant's bank account | the merchant's portal export + bank statement, joined per the signed agreement | `settlement: 'matched'` — **only** settable from merchant-supplied evidence |

**Tooling boundary (what the repo should and should not build):**
- **Build:** `journal reconcile` (exists — journal ↔ captured callbacks, with the honesty rule), `transaction verify` (new — the assertion form of "verification"), `go-live check` FINANCE gates, and a documented *interface* for settlement evidence: `payway go-live check --attach FINANCE-002=<report>` plus a `SettlementEvidence` type `{source, checksum, batchId, scope, currency, tolerance, reviewedBy, reviewedAt}`.
- **Do not build:** settlement-report ingestion, bank-statement parsing, or automatic matching. The repo already says why ("Do not invent a report API"; the installed helper "operates on a merchant-normalized synthetic schema; it does not implement ABA export retrieval or authorize a finance signoff"). Building it would require the merchant's agreement-specific fee/FX/tolerance model, which the SDK cannot know. **This is a correct scope decision and the audit endorses keeping it.**
- **Make the boundary visible:** `settlement` is a field no gateway normalizer can write (§12.3), `products --output json` lists `settlement-ingestion: {status: 'missing', reason: 'merchant-specific report schema; out of scope'}`, and `go-live check` FINANCE gates are `evidence-required`, never `automated`.

---

## 37. Architecture Scorecard, Roadmap, Backlog and Acceptance Criteria

### 37.1 Architecture Scorecard (0–10, evidence + target)

| # | Area | Score | Evidence | Target | How |
|---|---|---:|---|---:|---|
| 1 | **Domain modelling** (PayWay concepts → code) | 8.5 | 8 domain factories, per-endpoint hash orders with provenance, route-specific callback contracts, `payment-lifecycle` doctrine | 9.5 | §12.3 one lifecycle model; §14 four-way QR separation |
| 2 | **Abstraction boundaries** | 6.0 | Domains are clean; but `src/index.ts` is one barrel for six products, `client.ts` holds 4 responsibilities, `cli.ts` holds domain policy | 9.0 | §7.4 subpaths; §25.2 import rules + boundary test |
| 3 | **Type safety** | 7.0 | Generated OpenAPI types, dual `.d.ts`/`.d.cts`; but `noExplicitAny`/`noNonNullAssertion` disabled for `src/cli.ts`, `type` overridden by cast, union returns that include error envelopes | 9.0 | P1-03 (delete the overrides), P2-06 (real union), §7.1 (discriminate errors from results) |
| 4 | **Error model** | 7.0 | 9 classes with rich fields + `toJSON()` + a 96-code registry with provenance | 9.5 | §15.3 one `PayWayErrorRecord`, registry in `core/`, `explain()` on the base class |
| 5 | **Configuration architecture** | 4.5 | 6 resolution sites, prose-only precedence, no root `.env.example`, incomplete var registry (P1-04), no schema | 9.0 | §10.2 one schema + resolver + generated registry |
| 6 | **Security & secret handling** | 6.0 | Excellent redaction internals (allow-list journal, fuzzy sanitizer, 0600 profiles, agent privacy layer); but TLS bypass taught (P0-04), secrets in argv, plaintext profiles, published internal material (P0-01) | 9.0 | P0-04, P0-01, §24.3 |
| 7 | **Production safety** | 3.0 | Agent layer is 8/10; CLI layer is 0/10 — no gate, no `env`, no coherence check | 9.0 | P1-01 shared guard; §10.4 |
| 8 | **CLI architecture** | 5.0 | Great grouped help, completions from the live registry, exit-code contract, session shell; but a 5,636-line monolith, 5 naming conventions, 6 output shapes | 9.0 | P1-03, P1-02, §9.2 |
| 9 | **Machine-readable output contract** | 3.0 | `PaymentCommandResult` is well designed but covers 2 commands; `--output` documented as global and rejected by most; `config`/`profiles`/`validate` have no JSON | 9.5 | §9.1 + §18.4 sweep |
| 10 | **Diagnostics** (`doctor`/`explain`/`diagnose`) | 5.0 | `explain` + the 96-code registry are outstanding; `doctor` has no severity, no network checks, swallows the live error; no `diagnose`, no `request inspect`, no `go-live` | 9.0 | §9.3, §9.4, §15.5, §36 |
| 11 | **Knowledge architecture** | 8.0 | Hash-gated generated corpus, `llms.txt`, offline `docs` command, provenance discipline in comments | 9.5 | §21.2 rules/errors/products/environments as data with evidence expiry |
| 12 | **Documentation IA** | 5.5 | Content is excellent; 5 naming conventions, 6 copies of each chapter, 239 committed HTML files, a hand-written 46 KB reference for 86 commands | 8.5 | §20.3, §22 |
| 13 | **Test architecture** | 7.5 | 2,378 tests / 130 s, hermetic env, ratcheted coverage, injected transport, freshness gates; but 1 Linux failure, 24 skips, unrun sub-project tests, no contract sweep, no canary sweep, no official-doc conformance | 9.0 | §18.2–18.4 |
| 14 | **Fixtures & simulation** | 6.0 | A real mock HTTP gateway + a teaching reference app with 5 lifecycle branches (excellent); but no on-disk corpus and per-file hand-rolled bodies | 8.5 | §19 |
| 15 | **AI-agent readiness** | 5.6 | §27.2 dimension scores: knowledge 9, safety 8, output contract 3, introspection 3, pre-flight 1 | 9.0 | §27.3 ten changes |
| 16 | **Repository hygiene** | 4.0 | 52% of tracked files generated/internal/duplicated; 5 naming conventions in `payway-boilerplate` alone; two ignore files; process archives public | 8.5 | §25, P0-01 |
| 17 | **Release & governance engineering** | 3.0 | No tags, no release workflow, unpublished version contradicting its own policy, identity mismatch across 4 surfaces, CI never run, publication gate open while public | 9.0 | P0-05, P1-10, §33, §34 |
| | **Weighted overall** | **6.4** | weights: safety/security ×1.5, contracts ×1.3, docs/knowledge ×1.2, hygiene/governance ×1.0 | **9.0** | |

### 37.2 Phased roadmap

#### Phase 0 — Stop the bleeding (target: 1 week)
**Objective:** make the public repository lawful, the pipeline green, and the two known correctness defects impossible to hit.
**Changes:** P0-01 (curate the tree + manifest gate) · P0-02 (official purchase enum + evidence file) · P0-03 (conflict register + lifetime probe; canonical rename deferred) · P0-04 (remove TLS bypass from all instructions; add `tlsCaFile`; `doctor NET-003/004`) · P0-05 (CI order + the tunnel platform gate) · P1-09 (one formatting commit) · P1-10 (identity consistency + verified security channel) · P3-06 (tsconfig split) · P2-14/P3-04/P3-10 (hygiene moves).
**Dependencies:** owner sign-off on the public file list (already recorded); ABA response on `payway-openapi/` rights (can proceed by exclusion).
**Deliverables:** curated public tree + `repository-manifest.yaml` + blocking gate; green CI on ubuntu **and** windows; `knowledge/rules/{rules,conflicts}.yaml` seeded with PUR-003, QR-013, QR-LIFE-001 + evidence files; `PAYWAY_TLS_CA_FILE`; consistent identity metadata; formatted tree.
**Acceptance:** every P0 acceptance-criteria list in §31.2; `npm ci && npm run build && npm run typecheck && npm test && npm run lint && npm run format:check && npm run check:repository` green on a clean Linux clone; `grep -rn NODE_TLS_REJECT_UNAUTHORIZED` returns only allow-listed paths; the P0-02 reproduction returns ACCEPTED.
**Exit criteria:** CI green on `main`; zero tracked files matching `private` globs; zero open correctness defects that reject or mis-unit an officially documented value.

#### Phase 1 — One contract, one config, real diagnostics (target: 3–4 weeks)
**Objective:** make the CLI machine-consumable and the configuration model single-sourced.
**Changes:** §9.1 envelope + global `--output` + exit codes 4/5/6 · `runCommand` wrapper (M2's ~126 statements) · `capabilities`, `env current/use/list/guard`, `config --json`, `profiles list --json` · P1-04/P1-05 (`env-vars.yaml` → generated registry + root `.env.example`) · §9.3 `doctor` rebuild (registry, severities, network/TLS/build/coherence checks, no swallowed errors) · P1-01 shared `env-guard` + production confirmation · P2-04 (QR payment-option validation) · P2-13 (CJS `import.meta`) · P2-02 (docs to Pages) · P2-10 (CI jobs: sqlite, boilerplate, cjs-smoke) · P2-16 (`AGENTS.md` consolidation + `guardrails.yaml`) · P3-05/P3-09.
**Dependencies:** Phase 0. The envelope and `runCommand` are prerequisites for everything in Phases 2–3.
**Deliverables:** `src/cli/output/*`; `src/core/env-guard.ts`; `src/diagnostics/doctor/*`; `knowledge/rules/{env-vars,doctor-checks,environments,guardrails}.yaml`; root `.env.example`; `AGENTS.md` v2 + `docs/agents/*`; new CI jobs.
**Acceptance:** §18.4 sweep green for all state-read commands; `config --json` shows per-key provenance; `doctor` has ≥30 registry-driven checks with severities and stable IDs; the P1-04 reproduction emits no warning; production mutations exit 6 without `--confirm-production`; `AGENTS.md` ≤250 lines and test-enforced.
**Exit criteria:** an AI agent can, from `AGENTS.md` + `capabilities --json` + `config --json` + `doctor --json` alone, determine environment, readiness, and the exact next command — without reading source.

#### Phase 2 — Decompose the CLI, expose the request, close the QR/webhook gaps (target: 4–6 weeks)
**Objective:** remove the monolith and give developers the two tools they most lack.
**Changes:** P1-03 (extract all command groups; relocate the 5 policy blocks; delete lint overrides) · §9.4 `request inspect`/`sign`/`send --dry-run` · P1-11 `webhook listen` + ndjson + `--expect/--fail-on` · P1-12 `qr` group + `qr inspect` · P0-03 canonical lifetime resolution (rename, unit in data) · P2-05 advisory system · P2-06 error union + `explain()` · P2-07/P2-08 (currency, money invariants into `core/`) · P2-17 fixture corpus · P3-01/P3-03/P3-11/P3-12 (aliases, sticky id, `sandbox test`, `validate` generalisation).
**Dependencies:** Phase 1 (envelope, guard, registry).
**Deliverables:** `src/cli/commands/**` (no `src/cli.ts`); `src/diagnostics/request-inspect.ts`; `fixtures/**` + `INDEX.json`; `webhook listen`; `qr` group; `core/money.ts`; `core/lifecycle.ts`.
**Acceptance:** no file in `src/cli/**` over 400 lines; boundary test green; `request inspect` output provably equals the sent request for every operation (diff test); `webhook listen --expect … --fail-on unverified` gates CI; QR-D1…D6 closed; `lifetime` has exactly one canonical unit with no contradicting identifier/message; advisory dedupe is per-client and logger-routed.
**Exit criteria:** Scenario A is ≤9 steps / ≤3 manual; Scenario B needs no doc triage to distinguish the four QR capabilities; Scenario C is fully scriptable.

#### Phase 3 — Knowledge as data, docs as generation, skills as jobs (target: 4–6 weeks)
**Objective:** eliminate duplication and make every rule, product, error, and command single-sourced and machine-readable.
**Changes:** §21.2 full `knowledge/rules/*` (rules, errors, products, environments, capabilities, symptoms, doctor-checks, conflicts, evidence) · T6 official-doc conformance test with 180-day evidence expiry · §20.3 docs restructure (slugs, generated reference, mirrors → stubs) · §22 deletion list (committed corpora → `prepack`; `docs/api` → Pages) · P2-15 skill taxonomy (35 → 14, schema-validated, full lock) · §29 decision trees as data · §15.5 `diagnose` · P2-11/P2-12 subpath exports + dependency rescoping · P2-01/P2-03 packaging and boilerplate restructure · P3-07/P3-08/P3-10.
**Dependencies:** Phases 1–2 (registry consumers must exist first, or the yaml has no readers).
**Deliverables:** 9 yaml registries + evidence files; generated `reference/{cli,errors,rules,products}.md|json`; 14 skills; `payway diagnose`; 5 subpath exports; `integrations/**` restructure.
**Acceptance:** §21.2's four validation rules hold; one 42 KB chapter exists in exactly one committed location; tarball ≤ ~3.5 MB / ≤ ~130 files with docs shipped once; every `source:'official'` rule has a ≤180-day-old evidence file; registry↔doc parity test blocking; `diagnose` returns `confirmed: []` rather than guessing when evidence is absent.
**Exit criteria:** changing a PayWay rule requires editing exactly one file, and every consumer (SDK validator, CLI check, doc, skill, test) updates by generation.

#### Phase 4 — Ship it (target: 2–3 weeks)
**Objective:** publish a version whose identity, gates, and migration story are all real.
**Changes:** §34 versioning/changesets/migrations · 2.0.0 release (identity, envelope, bin, lifetime, enum, `stripHash`, subpaths) · `release.yml` with trusted publishing + provenance + SBOM · §36 `go-live check` · Path-4 golden path · `RELEASE_CHECKLIST`/`RELEASE-READINESS` items C–I closed · Pages deploy · npm listing + `llms.txt`/MCP directory submissions.
**Dependencies:** Phases 0–3 (do not publish a red pipeline or an open money-path conflict).
**Deliverables:** published `aba-payway-ts@2.0.0` with provenance; `payway go-live check`; `MIGRATIONS.md#v2-0-0`; a working `npm install` path for strangers.
**Acceptance:** `npm view aba-payway-ts` matches repo identity; provenance badge visible; fresh-consumer smoke passes (ESM/CJS/types/bin/subpaths); `go-live check` produces a dated report for the reference app; every "preparing first release" note flipped.
**Exit criteria:** Scenario A step 1 is `npm install aba-payway-ts` and works.

#### Phase 5 — Sustain (ongoing)
**Objective:** keep the guarantees true without heroics.
**Changes:** quarterly evidence re-verification (the 180-day expiry forces it) · nightly sandbox-contract re-capture into `evidence/` · mutation-testing ratchet · dependency/CodeQL/OSV hygiene · `payway-openapi` refresh against official docs with a diff report · community rule-conflict issue template triage · quarterly golden-path re-timing (§6) published in `docs/project/`.
**Acceptance:** no evidence file older than 180 days; no open `conflicts.yaml` entry older than 90 days without an owner action; golden-path step counts published and non-regressing.

### 37.3 Prioritised backlog

| ID | Priority | Workstream | Change | Files/Modules | Dependency | Complexity | Acceptance criteria |
|---|---|---|---|---|---|---|---|
| B-01 | **P0** | Governance | Curate the public tree; add `repository-manifest.yaml` + blocking gate | root, `docs/`, `audit-results/`, `.scratch/`, `.zcode/`, `scripts/gates/` | owner sign-off | M | Zero tracked files match `private` globs; gate blocking & green; third-party paths have licence entries |
| B-02 | **P0** | Correctness | Official purchase `payment_option` enum + legacy advisory set + evidence file | `constants.ts`, `domains/checkout.ts`, `knowledge/rules/` | — | S–M | `abapay_khqr` accepted in strict mode; repo test run emits no advisory; conformance test fails without evidence |
| B-03 | **P0** | Correctness | `conflicts.yaml` + QR lifetime probe; `--lifetime-unit`; `request inspect` conflict block | `constants.ts`, `utils.ts`, `domains/qr.ts`, `cli`, `scripts/probes/` | B-08 (registry) | M | One canonical unit in code/CLI/docs/skills; conflict open ⇒ `go-live` BLOCKER; probe evidence committed |
| B-04 | **P0** | Security | Remove TLS bypass from all instructions; add `tlsCaFile`/`PAYWAY_TLS_CA_FILE`; `doctor NET-003/004` | `AGENTS.md`, `docs/**`, `scripts/**`, `transport/`, `config/`, `diagnostics/doctor/` | — | S–M | Zero instructional occurrences; corporate-CA path works; bypass is a blocker; test prevents reintroduction |
| B-05 | **P0** | CI | Reorder to build→typecheck; platform-gate the tunnel test; add format/CJS/sqlite/boilerplate jobs; gitleaks blocking | `.github/workflows/ci.yml`, `src/__tests__/sdk-facade-and-tunnel.test.ts`, `tsconfig*.json` | — | S–M | CI green on ubuntu + windows from a clean checkout; 0 test failures on Linux; planted secret fails the build |
| B-06 | **P0** | Tooling | One formatting commit + `format:check` gate + `.git-blame-ignore-revs` | `src/`, `scripts/`, `skills/`, `biome.json`, CI | B-05 | S | `biome format` exit 0; gate blocking; blame preserved |
| B-07 | **P0** | Governance | Identity consistency (repo/bugs/homepage/badges/SECURITY mailbox) + `check-identity` gate; version decision | `package.json`, `SECURITY.md`, `docs/reference/`, `scripts/gates/` | B-01 | S | One owner/repo everywhere; security channel verified by round-trip; version chosen per `VERSIONING.md` |
| B-08 | **P1** | Knowledge | `knowledge/rules/` registry + generators + `rules-conformance` test (evidence expiry, enforcement mapping) | `knowledge/rules/`, `scripts/generate/`, `src/__tests__/` | — | L | 9 yaml files, each with ≥3 consumers; every `official` rule has ≤180-day evidence; test blocking |
| B-09 | **P1** | CLI contract | One envelope (`schemaVersion 2.0`), global `--output`, exit codes 4/5/6, `runCommand` wrapper | `src/cli/output/**`, all commands | B-05 | L | §18.4 sweep green; exactly one document per invocation; four error families collapse to one |
| B-10 | **P1** | CLI | `capabilities --json` generated from the live registry | `cli/commands/capabilities.ts`, `completions/introspect.ts` | B-09 | S | Every command listed with readOnly/mutating/moneyMoving/requiresRsa/environmentsAllowed/verified/aliases |
| B-11 | **P1** | Config | `env-vars.yaml` → generated registry + root `.env.example`; rewrite `envValidator` | `knowledge/rules/env-vars.yaml`, `config/env-registry.ts`, `config/envValidator.ts`, `.env.example` | B-08 | S–M | Zero false-positive unknown-var warnings; conformance test catches every `process.env.PAYWAY_*` read |
| B-12 | **P1** | Diagnostics | `doctor` rebuild: 38-check registry, categories, severities, network/TLS/build/coherence, `--check/--fix`, no swallowed errors | `diagnostics/doctor/**`, `knowledge/rules/doctor-checks.yaml` | B-08, B-09 | M–L | ≥30 checks, stable additive-only IDs, registry severities, exit 0/1/3/5, `--live` errors reported |
| B-13 | **P1** | Safety | Shared `env-guard`; `env current/use/list/guard`; production `--confirm-production` (exit 6); sandbox-only refusals | `core/env-guard.ts`, `agent/risk.ts`, all mutating commands | B-09, B-11 | M | No production mutation without the flag; `-y` insufficient; agent + CLI share one module |
| B-14 | **P1** | Architecture | Extract `src/cli.ts` into `cli/commands/**`; relocate 5 policy blocks; delete lint overrides | `src/cli.ts` → `src/cli/**`, `core/money.ts`, `core/time.ts`, `domains/**` | B-09 | L | No `src/cli.ts`; no file >400 lines; boundary test green; policies unit-tested at their new home |
| B-15 | **P1** | DX | `request inspect`/`sign`/`send --dry-run` with the §9.4 redaction rules | `diagnostics/request-inspect.ts`, `auth/`, `domains/**` | B-08, B-14 | M | Inspection provably equals the sent request; preimage opt-in & canary-clean; conflicts surfaced |
| B-16 | **P1** | Agent | One `AGENTS.md` (≤250 lines) + `docs/agents/*` + generated adapters + `guardrails.yaml` + `agents-md.test.ts` | `AGENTS.md`, `.agents/`, `docs/agents/`, `knowledge/rules/guardrails.yaml` | B-04, B-08 | M | One entrypoint; test enforces size/paths/commands/no-bypass/no-duplicate-rules; adapters generated |
| B-17 | **P1** | Errors | `PayWayErrorRecord` + `explain()` on the base class; registry moved to `core/`; real discriminated union | `core/error-registry.ts`, `errors.ts`, `cli/output/` | B-08, B-09 | M | SDK consumers get code/category/severity/docRef/retry without the CLI; no `type` casts; `webhook_error` → exit 4 |
| B-18 | **P2** | Webhook | `webhook listen` (+`--print-url`, ndjson, `--expect/--fail-on`), `webhook fixtures`, `webhook verify --against` | `cli/commands/webhook.ts`, `webhook/**`, `fixtures/` | B-09, B-19 | M | Scenario C fully scriptable; receiver conformance exits 0/4/5 |
| B-19 | **P2** | Testing | On-disk fixture corpus + `INDEX.json` + provenance; classification branches fixture-covered | `fixtures/**`, `src/__tests__/`, `testing/` | — | M | Corpus committed; every `normalizePaywayResponse` branch has a fixture; parity test green |
| B-20 | **P2** | QR | `qr` command group (`create/offline/customer/soundbox/inspect/templates/deeplink`) + QR-D1…D6 | `cli/commands/qr.ts`, `domains/qr.ts`, `khqr-offline/` | B-09, B-08 | M | Four capabilities visibly separate; payload/image/status distinct in output; `verified` exposed |
| B-21 | **P2** | SDK | Advisory system rebuild (records, per-client dedupe, logger-routed, source-gated promotion, `onAdvisory`, ignore list) | `core/advisories.ts`, `utils.ts`, all validators | B-08 | M | No `console.warn` in library code; strict mode promotes only official advisories |
| B-22 | **P2** | Packaging | Subpath exports (`./webhook`, `./khqr-offline`, `./diagnostics`, `./testing`, `./cli`); move mock/test infra out of the root entrypoint; rescope runtime deps | `package.json`, `tsup.config.ts`, `src/testing/`, `src/index.ts` | B-14 | M | 5 specifiers work in ESM+CJS+types; library install pulls ≤2 runtime deps; root no longer exports the mock server |
| B-23 | **P2** | Docs | Slug-based guides; generated `reference/{cli,errors,rules,products}`; mirrors → stubs; `docs/api` → Pages; registry↔doc parity test | `docs/**`, `scripts/generate/`, CI | B-08, B-10 | L | Zero hand-written reference prose; parity test blocking; one map; slugs stable |
| B-24 | **P2** | Packaging | Stop committing generated corpora (`knowledge/`, `docs-packaged/`, skill `references/`); generate at `prepack` | `package.json`, `scripts/sync-knowledge.mjs`, `skills/` | B-23 | M | Tarball ≤ ~3.5 MB / ≤ ~130 files; each chapter committed once; `smoke:package` green |
| B-25 | **P2** | Repo | `payway-boilerplate` → `integrations/{postman,boilerplate/*}`; delete duplicates/`Goal.txt.txt`/`learnings/`; CI per sub-project; align dep versions | `integrations/**`, CI | B-01, B-05 | M | No spaces in tracked directory names; sub-project tests run in CI; no orphaned coverage claims |
| B-26 | **P2** | Diagnostics | `payway diagnose` with a closed symptom vocabulary and the never-fabricate contract | `diagnostics/diagnose.ts`, `knowledge/rules/symptoms.yaml` | B-08, B-17 | M | ≥15 symptoms; every cause has a `ruleId`; `confirmed: []` when evidence is absent; `evidenceMissing` always populated |
| B-27 | **P2** | Agent | Skill taxonomy 35 → 14 job-shaped skills with the §23.3 schema; full `skills-lock.json`; `skills doctor` | `skills/**`, `cli/commands/skills.ts` | B-08, B-10 | L | 14 schema-valid skills; unique triggers; `allowed_tools ⊆ capabilities`; lock covers all skills |
| B-28 | **P2** | Readiness | `payway go-live check/report/diff` with 30 gates and 5 statuses | `diagnostics/go-live.ts`, `knowledge/rules/go-live.yaml` | B-12, B-08 | M | Path 4 executable; no PASS without evidence; UNVERIFIED never promoted; exit 0/5 |
| B-29 | **P2** | Testing | CLI output-contract sweep + secret canary sweep (blocking) | `src/__tests__/cli-output-contract.test.ts`, `…/secret-canary.test.ts` | B-09 | M | Both sweeps green and blocking; a new command without an envelope fails the build |
| B-30 | **P2** | Release | Changesets + `release.yml` (trusted publishing, provenance, SBOM) + `MIGRATIONS.md` + changelog fold | `.github/workflows/release.yml`, `CHANGELOG.md`, `.changeset/` | B-07, Phase 0–3 | M | Tag → published package with provenance; generated notes; migration section for every breaking change |
| B-31 | **P3** | CLI | Noun-first tree + hidden aliases + generated alias-parity test; sticky `transaction current`; `sandbox test`; `validate config\|request\|integration` | `cli/**` | B-09, B-14 | M | Aliases work with stderr deprecations; no orphaned command; sticky id works non-TTY |
| B-32 | **P3** | Governance | `CODEOWNERS`, dependabot, rule-conflict + behaviour-change issue templates, nightly mutation + sandbox-contract jobs | `.github/**`, CI | B-05 | S | Money-path dirs require review; grouped weekly updates; nightly jobs publish reports |
| B-33 | **P3** | Model | `core/lifecycle.ts`: one `TransactionState`/`TransactionEvent` model; `assertFulfillable`; `retryPolicyFor`; exported attempt store | `core/lifecycle.ts`, `domains/**`, `journal/**` | B-14 | M | One mapping function; `unknown` cannot be treated as `failed`; SDK consumers can reserve a `tran_id` |
| B-34 | **P3** | Hygiene | Merge `.zcodeignore` into `.gitignore`; replace over-broad globs with explicit paths; `THIRD-PARTY-LICENSES`/`NOTICE` | root | B-01 | S | One ignore file; `git check-ignore -v` shows legitimate `*key*` files are not ignored |

### 37.4 Target repository tree

See §25.2 (authoritative) — the tree is specified there with per-directory responsibilities and the import-boundary rules that keep it true.

### 37.5 Target developer experience

*A developer integrating ABA PayWay for the first time, in one sitting:*
```bash
npm install aba-payway-ts                       # published, provenance-verified, ≤2 runtime deps
npx payway init --mode sandbox                  # .env + complete .env.example + framework routes
npx payway env current                          # sandbox · checkout-sandbox.payway.com.kh · profile sbx-acme
npx payway doctor --route online-qr             # 30 checks, severities, actionable fixes; TLS explained, never bypassed
npx payway webhook listen --tunnel --print-url  # one line; written to .env automatically
npx payway qr create --amount 3.00 --currency USD   # unique tran_id, PNG, outcome: created (never "paid")
npx payway transaction verify --expect-amount 3.00 --expect-currency USD --expect-status approved
npx payway go-live check --output json          # 30 gates; UNVERIFIED is never silently PASS
```
Eight commands, one terminal, no inline shell scripting, no ID re-typing, no doc triage, and every step machine-checkable. When something fails: `npx payway diagnose --from-journal` returns confirmed/likely/possible/**unknown** with the evidence it used and the evidence it needs — and never invents a cause. When a rule is in question: `npx payway rules show QR-013` returns the statement, its source, the official quotation, the retrieval date, and any open conflict.

### 37.6 Target AI-agent experience

An agent dropped into a consumer project reads, in order: `AGENTS.md` (≤250 lines: identity, repo map, MUST/MUST NOT, evidence discipline, task protocol, validation commands, definition of done, escalation) → `payway capabilities --output json` (the whole command surface with `readOnly`/`mutating`/`moneyMoving`/`requiresRsa`/`environmentsAllowed`/**`verified`**) → `payway env current --output json` → `payway doctor --output json` → the relevant skill (14 job-shaped skills, each declaring triggers, required context, authoritative source, **forbidden** sources, allowed/prohibited tools, validation, expected output, escalation, and relations) → `payway request inspect <op>` before any call → `payway rules show <id>` whenever a PayWay behaviour matters → `payway diagnose` on failure. Every response is one versioned document with `context.environment`, an `error.code` from a published registry, `retry` advice, and a `next` array. Production mutations are refused without `--confirm-production`, and `-y` never substitutes. TLS verification is never disabled. A rule whose official evidence is older than 180 days auto-degrades to `unverified` and becomes a `go-live` BLOCKER — so an agent cannot build on stale authority even by accident.

### 37.7 Acceptance criteria for repository vNext

**Governance & safety**
1. The public tree contains only product, docs, examples, fixtures, skills, generated-reference inputs, and CI; `repository-manifest.yaml` gate is blocking and green; every third-party path has an upstream + licence + notice entry.
2. Zero instructional occurrences of `NODE_TLS_REJECT_UNAUTHORIZED`; `tlsCaFile`/`NODE_EXTRA_CA_CERTS` supported, documented, tested; `doctor` makes a bypass a blocker.
3. No mutating command can reach production without `--confirm-production`; `-y` is insufficient; one shared guard module serves CLI, MCP, and agent; sandbox-only commands refuse production.
4. A verified security-disclosure channel; one identity across `package.json`, badges, docs, and the npm listing.

**Correctness & rules**
5. Every PayWay rule lives in `knowledge/rules/*.yaml` with `source`, enforcement points, severity, and (for `official`) an evidence file with URL + retrieval date ≤180 days; a conformance test enforces all four §21.2 validation rules.
6. No repo enum, unit, bound, or hash order contradicts official documentation; every known contradiction is an open `conflicts.yaml` entry surfaced by `request inspect`, `doctor`, and `go-live check`, and blocking for `go-live` on money paths.
7. `strictValidation` promotes only `source:'official'` advisories; no repo opinion can hard-block a valid request.

**Contracts & CLI**
8. One output envelope (`schemaVersion`), one `--output` registration, all chrome on stderr, exactly one document per invocation, exit codes from the published set — enforced by a blocking whole-registry sweep.
9. `capabilities`, `env current`, `config --json`, `profiles list --json`, `doctor --json`, `request inspect`, `rules`, `products`, `diagnose`, `go-live check`, `webhook listen --output ndjson`, `transaction current/verify`, `validate config|request|integration`, `sandbox info/verify/test` all exist and are agent-suitable per §9.1.
10. No `src/cli.ts`; no file in `src/cli/**` over 400 lines; no domain policy in `cli/`; no lint suppression for `any`/non-null in CLI code.

**Architecture & packaging**
11. Five subpath exports work in ESM, CJS, and types; the root specifier does not pull the mock server, MCP SDK, QR renderer, or YAML parser; a library-only install has ≤2 runtime dependencies; the build emits zero warnings.
12. Import boundaries between `core/auth/config/transport/client/domains/callbacks/observability/webhook/khqr-offline/diagnostics/cli/mcp/agent/testing` are enforced by a test.

**Knowledge, docs & agents**
13. Each documentation chapter is committed exactly once; all other copies are generated at `prepack`; the tarball is ≤ ~3.5 MB unpacked and ≤ ~130 files.
14. All reference documentation (`cli`, `errors`, `rules`, `products`, `configuration`) is generated, with a blocking registry↔doc parity test; zero hand-written reference prose.
15. One `AGENTS.md` (≤250 lines, test-enforced) with MUST/MUST NOT/SHOULD/SHOULD NOT/MAY rendered from `guardrails.yaml` into every agent surface; 14 schema-valid job-shaped skills; decision trees as data; a full skills lock.

**Testing & CI**
16. CI is green on a clean checkout on ubuntu **and** windows, in the documented order, with format, CJS smoke, SQLite, sub-project, contract-sweep, canary-sweep, package, identity, manifest, docs-parity, gitleaks, `npm audit`, licence, and CodeQL gates — all blocking.
17. Zero skipped SQLite tests in CI; zero failing tests on any matrix entry; sub-project tests executed; mutation testing reported nightly; the fixture corpus covers every response-shape branch with provenance.

**Developer outcomes (measured, published quarterly in `docs/project/`)**
18. Scenario A ≤ 9 steps / ≤ 3 manual actions / one terminal. Scenario B requires no document triage to distinguish the four QR capabilities. Scenario C is fully scriptable with a pass/fail exit code. Scenario D produces a dated, evidence-bearing report.
19. A first-time developer reaches a verified sandbox payment without reading `src/`; an AI agent reaches the same point using only `AGENTS.md`, `capabilities`, `doctor`, and one skill.
20. `go-live check` reports zero BLOCKERs and zero unaccepted UNVERIFIED gates for the reference app, and refuses to report "ready" otherwise.

---

## Appendix A — Evidence index (commands executed during this audit)

| Command | Result |
|---|---|
| `git rev-list --count HEAD` / `git log --all --oneline` / `git tag` | 1 commit (`316a568`), no tags — fresh orphan history |
| `npm ci` | ok, 13 s |
| `npm run typecheck` (pre-build) | **exit 2**, 6× `TS2307 Cannot find module 'aba-payway-ts'` |
| `npm run build` | ok, 11 s, 1 warning: `"import.meta" is not available with the "cjs" output format` (`src/mcp/server.ts:56`) |
| `npx tsc --noEmit` (post-build) | **exit 0** |
| `npm run lint` | exit 0 (2 warnings, 6 infos) |
| `npx biome format src` | **exit 1, 181 files** |
| `npx vitest run` (excluding the live-gated sandbox contract) | **1 failed / 2353 passed / 24 skipped** (161 files, 130.5 s); failure = `spawn …/fake-cloudflared.cmd EACCES`; skips = 4 SQLite suites |
| `npm pack --dry-run --json` | 1,307,933 B packed / 5,198,011 B unpacked / 210 files; `skills/aba-payway-integration` 718 KB, `docs-packaged` 654 KB, `dist/cli.cjs` 906 KB |
| `payway-sdk config --json` / `validate --json` / `profiles list --json` | `unknown option '--json'` (all three) |
| `payway-sdk check-transaction --output json` | `unknown option '--output'` inside a valid error envelope |
| `PAYWAY_UI=… PAYWAY_STRICT_VALIDATION=1 PAYWAY_MCP_ALLOW_MUTATIONS=1 PAYWAY_KHQR_MERCHANT_NAME=X payway-sdk config` | `⚠ Unrecognized PayWay environment variable(s): PAYWAY_MCP_ALLOW_MUTATIONS, PAYWAY_STRICT_VALIDATION, PAYWAY_UI, PAYWAY_KHQR_MERCHANT_NAME` |
| `createCheckoutDomain({strictValidation:true}).purchase({paymentOption:'abapay_khqr', …})` | `PayWayConfigError: payment_option "abapay_khqr" is outside the documented purchase enum (cards, abapay, abapay_deeplink, abapay_khqr_deeplink, google_pay)` |
| `vitest` stderr during `sdk.runTestSuite` | `[payway] payment_option "abapay_khqr" is outside the documented purchase enum (…)` — the SDK warns against itself on its default path |
| `payway-sdk doctor --json` (no credentials) | `{ok:false, route, context, framework, frameworkEvidence, dataRoot, checks[{id,label,ok,detail,fix}], envIssues}` — no severity, no `schemaVersion`, ad-hoc IDs |
| `payway-sdk explain PTL02 --json` | bare object `{code, family, title, hint, sandboxVerified, evidence}` — no envelope |
| `wc -c` on one chapter in 6 locations | 42,067 / 42,195 / 42,534 / 42,665 / 42,067 / 42,067 B ≈ 254 KB for one document |
| `git ls-files \| awk -F/ \| sort \| uniq -c` | docs 385 · src 309 · .scratch 156 · payway-boilerplate 251 · .zcode 132 · skills 97 · scripts 53 · audit-results 49 · knowledge 43 · docs-packaged 42 |
| `grep -c NODE_TLS_REJECT_UNAUTHORIZED AGENTS.md` / `grep -rn NODE_EXTRA_CA_CERTS .` | 19 / **0** |
| `grep -rn "'--output" src/cli.ts` | 2 registrations (`:2484` generate-qr, `:3175` generate-checkout) |
| Official docs retrieved 2026-10-05 | `developer.payway.com.kh` — Ecommerce Checkout (callback verification PHP sample, `X-PAYWAY-HMAC-SHA512`, 401 on invalid), Purchase (24-field hash order, 6 `payment_option` values incl. `abapay_khqr`), QR API (`lifetime` **minutes**, required, min 3, max 30 days, default 30 days; 19-field hash order; `amount` string, min 100 KHR / 0.01 USD; `merchant_id` ≤30; `tran_id` ≤20; currency case-insensitive; QR `payment_option` ∈ {abapay_khqr, wechat(USD), alipay(USD)}), full endpoint index (Credentials on File incl. a dedicated **Subscription** endpoint, Pre-auth, Payout, Payment Link, KHQR Guideline, Resources) |

## Appendix B — Classification legend (used throughout)

| Label | Meaning |
|---|---|
| **OFFICIAL** | Retrieved from ABA's public developer documentation on 2026-10-05; URL and quotation recorded in `knowledge/rules/evidence/` under the target design |
| **ARCHIVED** | From `docs/archive/Default module.openapi.json` — an ABA-shared spec copy of 2021-era vintage. **Not** current authority |
| **SANDBOX** | The repository's own live sandbox observation, dated (e.g. `SANDBOX-FINDINGS §24 LC-2`, 2026-08-30 boundary probes) |
| **RELAY** | Recorded answers from the ABA integration team or an ABA Telegram bot, as transcribed by the repository. **Secondary evidence only** — never equivalent to official documentation |
| **REPO CHOICE** | A decision this repository made (e.g. refusing private callback hosts, warning on short `tran_id`s, single-attempt mutations). May be stricter or looser than the gateway |
| **DX RECOMMENDATION** | This audit's recommendation, not a PayWay requirement |
| **UNVERIFIED** | No authoritative confirmation exists. Requires: the official page (quote + URL + date), or a written ABA integration-team answer, or a reproducible sandbox probe recorded as evidence. Until then it must be surfaced as `UNVERIFIED` by `rules`, `products`, `capabilities`, `request inspect`, `doctor`, and `go-live check` — and must never be reported as PASS |
