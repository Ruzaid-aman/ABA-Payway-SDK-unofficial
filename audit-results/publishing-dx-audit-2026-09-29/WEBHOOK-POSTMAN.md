# Webhook and Postman publishing/DX audit — 29 September 2026

> **30 September status addendum:** WP-04 is resolved in the current local working tree: `npm run test:yaml`, `node export_json.js --check` and `node verify_index.js` all pass. The current export has 46 requests, 49 examples and 125 variables. Six pre-existing Postman maintenance/export files remain uncommitted. The original 45-request/stale-export observations below are historical. Other webhook, callback-import, distribution-content and discovery findings remain open; no fresh Postman Desktop import or gateway payment was performed. Use [REPORT.md](REPORT.md) for the current decision and acceptance plan.

## Scope and method

Read-only review of the current working tree, including its existing local changes. Read `HANDOFF.md` and `.agents/AGENTS.md`; inspected webhook source, CLI lifecycle, canonical public guides and packaged webhook-production skill, manifest-selected Postman YAML, local validators, distribution exporter, collection docs and CI. No implementation or collection changes, cloud writes, tunnels, provider API calls, real payment mutations, user configuration changes, or credential values were used in this report. The attached `webhook-audit-probe.cjs` runs a short-lived local HTTP listener with in-memory capture storage and stubbed forwarding; lifecycle signals are intercepted, so it never signals a real process. Its lifecycle state is isolated under this audit directory. Gateway claims below are assessed against the repository's stated contract, not newly certified with ABA.

**Decision:** Do not describe the Postman deliverable as freshly verified or publish this tree unchanged. The collection has a failing test gate and stale distribution export. The webhook tooling is a useful development capture workbench, but its ownership, acknowledgement and localhost claims need correction. The production callback guide is materially weaker than the packaged production skill.

Path shorthand below: `P/` means `payway-boilerplate/Postman Collection API Testing/`; `C/` means `P/postman/collections/PayWay API — Complete Collection/`. All line references were checked against the current files.

## Fresh verification

Commands run in `P/_build`, Node v24.21.0:

| Command | Result | Evidence / limit |
|---|---|---|
| `npm run test:yaml` | FAIL, exit 1 | `yaml_collection.test.js:12`: actual 125 variables, expected 122. Stops before the remaining chained gates. |
| `node syntaxcheck.js` | PASS | 80 request scripts / 45 requests, 0 syntax errors. Does not validate every collection/folder script. |
| `node validate.js` | PASS | 45 requests / 125 variables, 0 structural or undefined-variable issues. |
| `node verify_postman_import.js` | PASS | 45 requests, 40 script-bearing requests; no URL/script-shape issues. This is not a real Postman import. |
| `node sim_khqr_flow.js` | PASS | 37 simulated checks, 0 failed; no real webhook.site creation or gateway payment. |
| `node spec_parity.js` | PASS | 22 spec paths / 23 collection endpoint paths; payment-link void is the one permitted exception. Path-set parity only. |
| `node export_json.js --check` | FAIL, exit 1 | Distribution export is stale. |
| `node verify_index.js` | FAIL, exit 1 | Missing `cof_amount_fmt`, `cof_shipping_fee`, `cof_pay_token_flag`. |
| `node readme_path_audit.js` | PASS | 26 path-like tokens, 0 unresolved. |

Additional diagnostic, **not a passing official gate**: compiled the YAML test in memory after changing only its count expectation from 122 to 125; the complete test then passed (`YAML collection loaded: 45 requests, 125 variables`). Neither source nor YAML was edited. The formerly empty versioned helper is now **9,408 characters** and the collection bootstrap is present. Historical empty-helper failure is not a current finding.

Local receiver probe (`node audit-results/publishing-dx-audit-2026-09-29/webhook-audit-probe.cjs`) passes its reproduction assertions:

```json
{"probe":"ack_waits_for_forward","captureSaved":true,"forwardStarted":true,"responseArrivedBeforeForwardReleased":false,"listenerAddress":"::","listenArgumentTypes":["number","function"]}
{"probe":"stale_identity","signals":[{"pid":123456,"signal":0},{"pid":123456,"signal":"SIGTERM"}],"claimedRunning":"running","claimedStopped":true,"lifecycleCleared":true,"realProcessesSignalled":false}
```

A separate in-memory execution of the callback-import post-response script with two unsigned synthetic callbacks in newest-first order produced:

```json
{"probe":"callback_import","unsignedCredentialsAccepted":true,"selectedTransaction":"oldest","expectedNewest":"newest","anySignatureVerificationCode":false}
```

## Findings

### WP-01 — P1: “Full Production Version” teaches acknowledgement before durable acceptance and unvalidated paid transitions

**Evidence:** `docs/guides/11-callbacks-and-webhooks.md:175` labels the snippet “Full Production Version (with All Best Practices)”. Lines 233–259 extract status/amount/currency and acknowledge at 245 before calling the processor. The processor at 275–313 accepts those fields but never checks approval, stored expected amount/currency, or a server-side inquiry before its suggested `UPDATE orders ... 'paid'`. Its existence/paid check and update are separate, non-atomic operations (294–313). A crash after acknowledgement but before storage loses the notification; duplicate concurrent deliveries can both reach post-payment actions. The minimal example at 135–163 similarly equates signature success with payment confirmation.

**Why it matters:** A valid signature authenticates a delivery; it does not itself mean APPROVED or bind the funds to an existing order. The page itself says redelivery is not guaranteed (262–263). These examples contradict the correct skill guidance at `skills/aba-payway-webhook-production/SKILL.md:36–38`: verified approved state, expected amount/currency, durable event acceptance and atomic fulfillment job.

**Reproduction:** Read the full processor: `paywayStatus` is destructured and never evaluated. Simulate a signed declined/pending notification or crash between response and persistence when adapting this example. This finding concerns published example design, not a demonstrated production deployment.

**Remediation:** Replace the “full production” snippet with an executable durable inbox/outbox example that validates approved state and merchant/order/attempt/amount/currency, atomically accepts the event and transitions once, then ACKs. Reuse the stronger reference application's reconciliation model rather than maintaining conflicting templates. Keep external email/inventory work in a durable job.

**Acceptance:** Signed non-approved, mismatched amount/currency, unknown attempt, replay, concurrency and crash-after-acceptance cases cannot incorrectly fulfill or lose accepted work. Document exact storage durability and failure behavior. Generated knowledge and skill mirrors must agree with the canonical guide.

### WP-02 — P1: receiver “ownership” is only a PID; stop can target a reused or unrelated process and reports success without confirmation

**Evidence:** `src/webhook/lifecycle.ts:5–12` stores PID/port/time but no workspace identity or control token; line 16 uses one shared user-data-root `receiver.json`. `src/cli/commands/webhook.ts:108–121` considers any live PID “running”, sends SIGTERM directly, swallows every error, clears state and emits `stopped:true`. `src/cli/commands/setup-webhook.ts:282–290` overwrites that state on startup; line 348 clears it unconditionally on shutdown. The skill says “owned by this workspace” at `skills/aba-payway-webhook-production/SKILL.md:54`.

**Reproduction:** Attached probe supplies a stale year-2000 state, stubs `process.kill` as a different live PID, and verifies the CLI reports running and requests SIGTERM anyway. No real process is killed. Two workspaces using the same default data root also share the state file; two receiver ports can overwrite each other's state.

**Remediation:** Use an authenticated receiver-control channel and instance identity, plus workspace/data-root ownership and process creation identity where available. Compare-and-clear only the current instance; wait for actual receiver/tunnel shutdown and return honest failure/stale/mismatch states. Account for Windows signal/child-process behavior explicitly.

**Acceptance:** Reused PID, wrong workspace, concurrent receivers, denied termination and a receiver that ignores shutdown never yield a misleading successful stop or kill an unrelated process. Windows test verifies listener, tunnel child and temporary callback URL cleanup. Current audit does not certify real Windows SIGTERM cleanup.

### WP-03 — P1: forwarding blocks callback acknowledgement with no application timeout

**Evidence:** `src/webhook/server.ts:392`, 488, 517 and 598 await `forwardCaptured` before sending 200. `src/webhook/forwarder.ts:126` calls fetch without an AbortSignal or timeout. Error swallowing only helps after the downstream request resolves/rejects; a slow/hung receiver remains on the upstream response path. This conflicts with prompt-acknowledgement guidance and the promise that downstream failure does not break original capture handling.

**Reproduction:** Attached probe stores one callback, leaves injected forwardFetch unresolved and observes no ACK after 300 ms; releasing forwarding immediately permits the ACK. Source shows no bounded application timeout, so the dependency can exceed the documented ~5-second acknowledgement budget. No external network request is made.

**Remediation:** ACK after durable local capture and required verdict work; dispatch forwarding separately through a bounded queue or clearly documented best-effort background mechanism. Add timeout/concurrency limits and truthful forward outcome reporting.

**Acceptance:** An indefinitely pending or slow forward destination cannot delay the upstream ACK past the documented budget; capture remains queryable and a failed forward is visible. Test all three routes, invalid verdict mode, shutdown and queue saturation.

### WP-04 — P1 publishing gate: active YAML, tests, index and shareable JSON are out of sync

**Evidence:** `P/_build/yaml_collection.test.js:12` pins 122, while `C/.resources/definition.yaml:413–415` adds the three COF variables, for 125 total. `P/collection-index.md:7` claims the full suite is green and says 122; lines 18 and 183 repeat the stale count. `P/_build/export_json.js --check` reports a stale export. `P/postman/documents/README.md:11` explicitly tells merchant developers to use that export. `.github/workflows/ci.yml:115` and 118 gate the suite and export freshness, so the current candidate cannot pass the declared release workflow.

**Reproduction:** Run the three failing commands in the verification table. The helper is present; regenerating only that helper is not the current fix.

**Remediation:** Review whether the three variables belong in the supported contract; update tests/index accordingly; regenerate and verify the JSON export; replace dated green claims with dated actual evidence. Add index validation to CI if it is a required artifact.

**Acceptance:** Unmodified candidate passes `npm run test:yaml`, `export_json.js --check`, `verify_index.js`, and README audit. Import the actual export in a fresh Postman profile and verify the beginner flow and Visualizers; offline VM checks cannot certify app compatibility.

### WP-05 — P1/P2: callback pull promotes unsigned tokens and transaction IDs into operative collection variables and logs the token

**Evidence:** `C/10 - Callbacks & Webhooks/Sync webhook.site - Postman (pull callbacks).request.yaml:37–52` parses arbitrary received content and sets `tran_id`, `last_tran_id`, `ctid`, and `pwt` without verifying HMAC or correlating to the active request/customer. Line 49 logs `pc.pwt` in plaintext. Description line 15 advertises immediate use by later CoF/Runner requests. The main SDK receiver correctly gates token-store promotion on `signatureVerdict === 'verified'` at `src/webhook/server.ts:304–310`; the collection does not preserve that trust boundary.

**Reproduction:** Execute the post-response script with a mocked webhook.site response containing unsigned synthetic `payment_credential` objects: `pwt` and customer ID are imported. No gateway call is needed.

**Impact:** Anyone able to post to the callback bin can pollute the test session's active transaction/token state; console logs expose the credential. This is not proof an attacker can make the provider authorize an arbitrary charge. It is a significant unsafe automation example and a release issue for credential-handling guidance, even though the collection is described as a sandbox starter.

**Remediation:** Capture into explicitly unverified variables first. Validate signed callback evidence using the correct contract; correlate request/customer IDs before allowing a token into charge variables. For unsigned payment-link/KHQR notifications, perform the appropriate server inquiry rather than assuming online HMAC. Mask or omit token logs.

**Acceptance:** Unsigned/invalid/unrelated callbacks never overwrite operative token/customer values; valid correlated callbacks do. Fixtures prove body/header signing cases and no secret logging. Raw inspected captures remain available for debugging with clear trust labels.

### WP-06 — P2: newest-first callback import actually leaves the oldest values selected

**Evidence:** Same callback-pull file: description line 10 promises newest-first fetch; lines 37–55 iterate every delivery and overwrite the same variables. No break, timestamp comparison or active-attempt filter exists. Fields can also be combined from different callbacks if later records contain only a subset.

**Reproduction:** In-memory response `[newest, oldest]` ends with `tran_id = oldest` (verification output above). This can make the next check, CoF request or Runner act on a previous test.

**Remediation:** Select one explicitly correlated event, or present candidate events and require selection. Preserve atomic transaction/customer/token association and reject ambiguous results.

**Acceptance:** Multi-payment, reverse-order, unrelated, duplicate and partial-payload fixtures always choose the intended current callback without mixing fields. Keep this regression separate from signature verification.

### WP-07 — P2: local listener binds all interfaces and buffers/persists unbounded raw input

**Evidence:** `src/webhook/server.ts:631` uses `server.listen(port)` with no hostname; attached probe reports address `::`, despite setup copy at `src/cli/commands/setup-webhook.ts:320` saying only localhost. `src/webhook/server.ts:213–216` accumulates unlimited body chunks; accepted payloads and all headers are saved raw. `src/webhook/storage-json.ts:41` appends indefinitely; metadata updates at 61–77 read/rewrite the whole capture file. A firewall may constrain external reachability, but the bind itself is wildcard, not loopback.

**Remediation:** Default to explicit loopback and make wider binding an explicit documented option. Add request-size/connection limits and capture-retention controls, with clear raw-sensitive-data warnings and bounded file behavior. Preserve legitimate callback evidence without silently dropping it.

**Acceptance:** Default bind is loopback, configured external bind is explicit, oversized bodies return a documented error with bounded memory, and store growth/rotation behavior is tested. This audit did not send oversized bodies or test external firewall reachability.

### WP-08 — P2: offline KHQR recovery guidance incorrectly points to online transaction inquiry

**Evidence:** `docs/guides/16-webhook-setup-guide.md:379` tells readers to verify both payment-link and KHQR payments with `check-transaction -t <tran_id>`. `P/postman/documents/README.md:28` similarly says both unsigned types use Check Transaction. Yet `docs/guides/11-callbacks-and-webhooks.md:399` explicitly says offline `transaction_id` is a delivery/payment deduplication key and `merchant_ref` is the invoice lookup key, and forbids online `tran_id` assumptions. `P/llms.txt:10` states check-transaction does not see KHQR transactions. The collection itself has an offline KHQR merchant-reference inquiry flow.

**Remediation:** Split recovery instructions by route: payment-link online transaction lookup vs offline merchant-reference reconciliation, with the actual CLI request and expected evidence for each. Clearly distinguish Customer/Printed QR signed callbacks from unsigned offline notifications even when they share a route.

**Acceptance:** A new developer can recover an offline KHQR payment without inventing a tran_id or repeatedly querying the online endpoint. Docs, collection README, skill and AI index use the same channel-specific procedure.

### WP-09 — P2: “verdict mode” example is not runnable and surrounding security language is contradictory

**Evidence:** `docs/guides/16-webhook-setup-guide.md:237` assigns `createStorage('json')` without await, but `src/webhook/storage-factory.ts:22` is async and returns Promise<WebhookStorage>. That promise is passed to `createWebhookServer` at line 238; the snippet also never starts the listener. Line 251 says omitted signatures may occur on retries, lines 253–254 discuss redelivery storms, and line 258 says the development listener never rejects, directly below its 401 option. The production skill instead correctly describes single best-effort delivery and missing-callback reconciliation.

**Remediation:** Use `await createStorage`, show `await listener.start()` and cleanup. State clearly that rejectInvalidSignature rejects explicitly invalid signatures only; unsigned requests remain captured and cannot fulfill. Remove unsupported retry implications and reconcile the contradictory statements.

**Acceptance:** Snippet compiles and starts/stops as written; valid/invalid/unsigned behavior is explained without implying that unsigned callbacks are trusted or guaranteed retries exist.

### WP-10 — P2 publishing boundary: shareable collection exports carry real configured values and workspace cloud linkage

**Evidence:** The active manifest retains `workspace` at `P/.postman/resources.yaml:1–2` and `cloudResources` at 6–8. The YAML has a nonempty non-placeholder signing key at `C/.resources/definition.yaml:115` (value deliberately omitted here). `P/_build/export_json.js:134–137` copies every variable value verbatim and only annotates `secret_key` as `type:'secret'`; that is not removal or encryption. `P/postman/documents/README.md:15` calls these “public demo values” and accurately warns that YAML is plaintext, but this audit did not verify provider authorization to publish the configured key. Runtime tokens, receiver IDs and captured outputs can also live in collection variables.

**Remediation:** Define a reviewed distribution profile with placeholders, synthetic examples and no personal cloud/workspace linkage; export from that profile with a denylist/allowlist scan for signing keys, payment tokens, receiver credentials and PII. If public demo credentials are intentional, obtain/document the precise authorized demo identity and restrictions rather than assuming any configured local sandbox key is publishable.

**Acceptance:** Inspect actual ZIP/JSON/YAML artifacts, not just source settings: no unauthorized secret/token/customer values or original cloud identity; fresh recipient imports without inheriting the maintainer workspace. This is a release verification requirement, not a claim the observed sandbox key is live production or compromised.

### WP-11 — P2: “Complete”/AI collection scope is overstated and discoverability is isolated

**Evidence:** `P/llms.txt:6–7` describes examples for the “whole merchant API” and “all 22 documented endpoints”. The current check proves only 22 bundled paths versus 23 collection paths; it does not compare to the SDK command registry, full provider suite, field-level contracts or runnable signing behavior. `P/postman/specs/README.md:22–28` says the root `payway-openapi/` is the source of truth but void is absent from the bundle because undocumented; root `payway-openapi/openapi.yaml:168` already includes void. The collection is not linked by name from the principal `README.md`, `QUICKSTART.md`, `docs/README.md` or root `llms.txt` (searched case-insensitively for Postman). Its useful beginner README is nested in `postman/documents/`.

**Remediation:** Publish a scope matrix with SDK/CLI/collection/spec endpoint coverage, exclusions and live-vs-spec-only status. Generate the bundled spec from the designated canonical source or declare/document the intentional subset. Add a first-class Postman entrypoint from the root human and AI indexes, with the chosen import artifact and its tested version. Avoid “Complete” implying parity that the current gate does not establish.

**Acceptance:** Every unsupported endpoint/category has an explicit reason, the spec-export relationship is reproducible, and a new human or AI reader can find the correct import/setup/test path from the repository root in one or two links.

## Strengths worth preserving

- Three separate routes and metadata parsers preserve online, offline/customer QR and payment-link callback contracts; raw evidence survives parsing failures.
- Online signature verification uses the shared auth canonicalization; SDK token capture only promotes verified callbacks. Payment-link pushbacks are explicitly treated as unsigned lookup hints, not HMAC failures.
- Startup binds before starting a tunnel and probes an acknowledged customer-KHQR route before persisting the callback URL (`src/cli/commands/setup-webhook.ts:197–264`). This materially improves beginner troubleshooting.
- SDK receiver has stop, capture storage adapters, replay/verify/fixture CLI, and storage/test seams. Synthetic fixture disclaimers and the production skill's fulfillment boundary are useful and specific.
- The active Postman manifest selects one current tree; the preservation copy is explicitly labeled historical. It should not be merged back or deleted during this audit.
- Current portable RSA/bootstrap tests pass when the stale count pin is bypassed in memory; the historical missing-helper lead is resolved in the inspected working tree.
- Collection has a usable hosted-checkout beginner route, saved response examples, error registry, script compilation and structure checks, offline KHQR simulation and a CI export-freshness gate. These are genuine assets even though current release gates fail.

## Suggested release sequence and boundaries

1. Resolve WP-01 production guidance and WP-02 ownership before promoting receiver lifecycle commands or production copy as safe defaults.
2. Resolve WP-03 acknowledgement and WP-07 local exposure/bounds; exercise all routes with slow/failed forwarding and Windows cleanup.
3. Resolve callback import trust/selection (WP-05/06), route-specific recovery (WP-08) and runnable docs (WP-09).
4. Audit/sanitize the exact distribution artifact and its workspace metadata (WP-10), then synchronize YAML/test/index/export (WP-04). Do not merely change the count pin without reviewing the three variable additions.
5. Run the full collection gates on that immutable candidate, test a fresh actual Postman import and first hosted payment, then document scope and root discovery (WP-11). Gateway tests require separately authorized sandbox operations and profile prerequisites.

**Ship boundary:** Development capture tooling can remain available with precise limitations; it is not an application fulfillment backend. Publish the Postman artifact only after its exact released bytes pass gates, contain the authorized credential profile, and work in a fresh recipient import. Do not claim live/production completeness from the offline checks in this report.

## Limitations

No live provider/payment flow, Postman UI session, actual cloudflared tunnel, third-party webhook delivery, external firewall test, native Windows process-tree shutdown, load test or new security scan was performed. The root audit owns SDK build/full-suite checks. Shared working tree contains pre-existing local collection edits; this report intentionally neither resets nor repairs them. Source-level risks and safe reproductions are separated above. The audit only created this report and its local probe; no memory files were modified.
