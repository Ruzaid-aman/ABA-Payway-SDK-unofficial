# SDK, CLI and MCP audit

Completed 30 September 2026. Initial probes: 29 September; source and principal MCP/JSON failures rechecked on 30 September. This report covers the TypeScript package; native companion SDKs have separate scope notes in REPORT.md. No real gateway requests or payment mutations were used.

## Assessment

The SDK has substantial domain coverage, typed interfaces, error classes, mutation retry controls, and a useful lifecycle/reference application. Installed ESM, CommonJS and TypeScript consumers work. The CLI has a broad operational surface and a credential-free demo. The largest gaps occur between those capabilities: generated starters, early CLI errors, saved-profile MCP startup and partner-only configuration.

Do not describe the current first-run and AI integration paths as publication-ready. Passing domain tests does not prove that a developer can follow the advertised generated application or connect MCP after saving a profile.

## Confirmed findings

### S01 — P1: generated first-payment starter does not load its generated environment file

Evidence: `src/cli/commands/init.ts:115-125` writes `.env` for sandbox setup; line 140 prints `node payway-first-payment.mjs`. `src/cli/templates/first-payment/index.ts:3-9` immediately reads `process.env.PAYWAY_CALLBACK_URL` without loading `.env`. The CLI's own environment loader is not invoked when Node runs the generated file.

Reproduction: in an isolated generated starter, populate the callback setting in `.env`, clear ambient PAYWAY variables, and execute the printed command. It exits with the missing-callback error. Running with `node --env-file=.env` reaches an injected mock SDK instead. This control deliberately stops before a real API call. Evidence: `sdk-cli-reproductions.json`, starter section.

Impact: the novice follows the setup instructions correctly but sees a configuration error. Users may work around it by embedding credentials in source or shell history.

Remedy: make the generated run command load `.env` explicitly, or implement a deliberate environment-loading strategy. Document environment precedence and keep secret material server-side.

Acceptance: generate into an empty project; populate only `.env`; execute exactly the printed command against a local gateway stub; prove configuration reaches the SDK and error recovery preserves the original transaction ID.

### S02 — P1: framework scaffolds teach incomplete payment trust boundaries and a nonexistent API

Evidence: `src/config/templates/express.ts:9-19` accepts the browser's transaction ID and amount; line 29 returns the whole session. Its callback at lines 40-53 logs the signature/body and acknowledges without verification or persistence. Line 47 instructs the developer to use `sdk.auth.verifyCallbackSignature()`, but the exported SDK facade has no `auth` property. `src/config/templates/nextApp.ts:8-18` and line 41 repeat these patterns. Generated-artifact reproduction is recorded in `sdk-cli-reproductions.json`.

Impact: beginners are handed a payment route that trusts client pricing and a callback route whose TODO names an API that cannot be called. The whole session contains the raw gateway response rather than only an intentionally selected browser artifact. The callback example is explicitly incomplete; this finding does not claim it already fulfills fraudulent orders. Its default integration path nevertheless conflicts with the stronger reference application.

Remedy: derive expected amount/currency and unique attempt ID from a server-side order; expose the public payment artifact projection; use the actual verification API; demonstrate durable acceptance and idempotent fulfillment. If a skeleton deliberately omits required logic, fail closed and label it clearly rather than presenting a successful callback.

Acceptance: generated Express and Next routes compile; invalid, pending, wrong-amount, wrong-currency and unknown-order callbacks cannot fulfill; concurrent duplicates create one fulfillment; raw responses are not sent to the browser. Scaffold tests must exercise generated files, not only assert their filenames.

### S03 — P1: a saved profile corrupts the MCP stdio protocol

Evidence: `src/cli.ts:998-1026` suppresses notices for docs/completions/session but not MCP. Its non-JSON branch uses `console.log` for `Using profile`. MCP serve mode does not set the list-preview `--json` flag. `src/cli/commands/mcp.ts:4-8` explicitly states stdout belongs to the protocol.

Reproduction: use an isolated APPDATA profile store with a synthetic default profile; send a JSON-RPC initialize request to `node dist/cli.js mcp`. Stdout begins with `Using profile: audit-profile (sandbox)` before the valid JSON-RPC response. Reproduced again on 30 September; `.scratch/publishing-dx-audit-2026-09-29/resume-cli-evidence.json`. The no-profile package smoke succeeds, explaining why it misses the defect.

Impact: an MCP host can reject or fail to parse the stream after ordinary credential onboarding. The server process may still exit successfully, making diagnosis difficult.

Remedy: reserve stdout for protocol traffic across the entire MCP command path, including pre-action hooks and startup errors. Send diagnostics to stderr.

Acceptance: installed-package stdio tests cover no profile, default profile, explicit profile, malformed/missing profile, successful initialization and tool errors. Every stdout line must be valid protocol content.

### S04 — P2: the documented environment opt-in for MCP mutations is ignored

Evidence: `src/cli/commands/mcp.ts:16` sets Commander default `false`; line 21 passes that defined false into `resolveAllowMutations`. `src/mcp/server.ts:59-62` treats any defined option as overriding `PAYWAY_MCP_ALLOW_MUTATIONS`.

Reproduction: `PAYWAY_MCP_ALLOW_MUTATIONS=1` with `mcp --list-tools --json` still produces 12 tools; explicit `--allow-mutations` produces 17. Reproduced on 30 September without invoking tools or gateway operations.

Remedy: distinguish an absent option from an explicit override, or remove the unsupported environment promise. Keep default mutation exposure off.

Acceptance: absent opt-in yields 12 tools; environment opt-in and explicit flag yield the intended 17; defined precedence and tool-call enforcement are tested.

### S05 — P2: machine-readable failure handling is incomplete before command execution

Evidence: `src/cli.ts:5404-5425` special-cases refund usage errors for JSON output. Other required-option failures bypass their action handlers. The profile pre-action hook throws an ordinary Error at line 1014.

Reproduction: `check-transaction --json` and `payment-link detail --json` without required IDs exit 1 with empty stdout and human stderr; `refund --json` returns a JSON validation envelope. A nonexistent selected profile similarly produces a stack and no JSON envelope. Evidence: `sdk-cli-command-evidence.json`; missing transaction ID rechecked on 30 September.

Impact: agents cannot reliably branch on the advertised error envelope for missing arguments or profile problems. They must handle several incompatible error channels.

Remedy: centralize usage, configuration, profile and execution errors under the machine-output contract. Preserve help/version success and useful human diagnostics.

Acceptance: a command matrix covers missing/invalid flags, profile errors, local validation, API failure, timeout and success. Machine mode yields one parseable JSON document with documented exit code; stderr contains diagnostics only.

Related discoverability issue: QR generation uses its output-format flag rather than accepting the same `--json` spelling as many other commands. This is an inconsistency to document or normalize, not a claim the QR command lacks machine output.

### S06 — P2: partner-only merchant activation still requires merchant credentials locally

Evidence: `src/cli.ts:5266-5274` checks partner prerequisites and then constructs `new PayWay()`. `src/client.ts:1318-1323` unconditionally requires merchant ID/API key before the partner domain can be used. The partner-auth request path exists at `src/client.ts:1888`.

Reproduction: validly shaped synthetic partner credentials plus a generated RSA public key, no merchant credentials, `self-activation new-merchant ... --json`: local validation error `merchantId is required`; no request is sent. Evidence: `sdk-cli-reproductions.json`, partner section.

Impact: the intended partner workflow cannot begin with its documented credential class alone. This local failure is independent of the already-disclosed lack of live partner sandbox verification.

Remedy: separate partner and merchant initialization requirements, or defer domain-specific validation until the relevant call. Do not recommend fake merchant credentials to bypass construction.

Acceptance: partner-only configuration reaches a mocked partner endpoint with correct authentication and no merchant fields; merchant calls still fail clearly without merchant credentials. Live activation remains a separately documented provider prerequisite.

### S07 — P2: invalid retry configuration gives a misleading transport error without sending a request

Evidence: `src/client.ts:1458` takes `maxRetries` directly; line 1488 bounds the execution loop with it; line 1757 throws `Retry limit exceeded` if the loop never executes. The configuration does not reject negative or NaN values before this path.

Reproduction: injected fetch, `maxRetries: -1` and `maxRetries: NaN`: zero fetch calls, `PayWayAPIError: Retry limit exceeded`. Evidence: `sdk-cli-reproductions.json`, sdkResults.

Remedy: validate retry count as a finite nonnegative integer and validate related timeout/retry inputs at the configuration boundary.

Acceptance: invalid values produce PayWayConfigError before execution; zero retries makes one permitted attempt; configured reads and mutation retry policy retain their distinct semantics.

### S08 — P2: noninteractive onboarding accepts an invalid stage with exit zero

Evidence: `src/cli/commands/onboard.ts:73-77` emits a stage plan before the validation at lines 89-90. `onboard --stage not-a-stage` returns exit 0 with that invalid stage and an allowed-values list.

Impact: automation may treat an invalid setup request as successful, even though no valid stage is selected. This is a plan-output validation bug, not proof configuration was changed.

Acceptance: invalid stage returns a validation envelope/nonzero exit in both TTY and non-TTY modes; valid noninteractive plans are explicit that no setup has executed.

### S09 — P3: MCP advertises a different version from the package

Evidence: `src/mcp/server.ts:46` hardcodes 1.6.0, while `package.json:3` remains 1.5.0. The captured initialize response confirms 1.6.0.

Impact: bug reports and AI capability decisions can be attributed to the wrong release.

Acceptance: derive server/CLI metadata from a single build-time package version and verify it in the installed artifact.

## Strengths and completeness

- Current installed artifact supports ESM, CommonJS, declarations, executable CLI help/demo, offline knowledge, 34 Skills and effective MCP catalogs. These were exercised in an isolated consumer, not inferred only from export declarations.
- Broad payment, query, COF, payout, payment-link, pre-auth and diagnostic domains exist. Spec-derived Soundbox and partner flows are explicitly distinguished from live-verified contracts in help.
- Error classes, single-submit mutation defaults, correlation IDs, local journal, reconciliation, channel-specific status caveats and server-side configuration are valuable foundations.
- First-payment reference app smoke passes, and the repository has realistic lifecycle tests. Generated templates should reuse its established order/trust model.
- Ownership-safe Skills installation and preservation behavior have focused tests; the earlier four installer timeouts passed on isolated rerun.

## Further opportunities, separate from confirmed defects

1. Offer one role/task selector: simulate, create first sandbox payment, integrate backend, troubleshoot callbacks, use Postman, connect an AI host. LLM onboarding should be optional for ordinary API developers.
2. Make command examples uniform about output mode, prompts, lifetime units, expected exit codes and irreversible operations. Generate a command-contract matrix from the registry.
3. Publish an endpoint capability matrix that differentiates implemented, mocked, observed in sandbox, blocked by enablement and production-approved. Method existence is not end-to-end verification.
4. Label framework scaffolding support precisely. The inspected Fastify selection emitted only environment setup, unlike the route-bearing Express/Next bundles; avoid implying equal turnkey depth.
5. Clarify that MCP's current read-only classification is about gateway mutations: artifact saving, clipboard copy and opening artifacts still have local side effects. Hosts should receive accurate effect descriptions.

## Limits

No new live sandbox payment, hosted-card round trip, paid COF cycle, payout, partner activation, production contract test or external AI-host connection was performed. MCP protocol checks used synthetic local profiles and initialize/catalog calls only. Gateway-specific claims remain tied to existing repository evidence. Native Android/iOS build and runtime validation are outside this TypeScript/CLI subaudit.
