# Agentic PayWay CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved agentic natural-language layer for the PayWay CLI without changing existing manual-command behavior.

**Architecture:** New functionality lives under `src/agent/`. `src/cli.ts` receives only a small command-registration call. Provider output is validated locally with JSON Schema and Ajv, then passes through readiness, risk, ledger, typed executor, artifact, and session boundaries.

**Tech Stack:** TypeScript, Node.js 18+, Commander, Ajv, built-in `fetch`, Vitest, tsup, and the existing PayWay SDK domains.

**Spec:** `docs/superpowers/specs/2026-08-22-agentic-payway-cli-design.md`

## Global Constraints

- Node.js remains `>=18`; use built-in `fetch`.
- Add Ajv as the only required validation dependency. Do not add provider-specific SDKs.
- Preserve all existing manual commands and profile behavior.
- Selected profiles are resolved explicitly and must override ambient credential variables for agent operations without mutating `process.env`.
- Agent create calls use `PayWay({ maxRetries: 0, ...resolvedConfig })`; uncertain writes must not be retried.
- Provider API keys use `PAYWAY_AGENT_API_KEY` and are never persisted.
- Application-data paths are `agent-config.json`, `agent-sessions/<session-id>.json`, and `agent-ledger/<execution-id>.json` under the existing PayWay application-data directory.
- Missing transaction IDs are represented as `null` in draft plans. After approval, generate and persist the ID, display the materialized action, and submit without a second confirmation.
- `--approve` can authorize complete sandbox or production actions. `--yolo` skips ordinary sandbox confirmation only and cannot authorize production.
- Non-TTY `ask` output is versioned JSON with status `succeeded`, `needs_confirmation`, `needs_clarification`, `blocked`, or `failed`.
- Per-task status is recorded in `docs/superpowers/plans/agentic-payway-cli-status/TASK-XXX.md`; parallel agents edit only their own status file.
- Baseline before implementation: `npm run build`, `npm run typecheck`, and all 378 existing tests pass.

## Public CLI Interfaces

```text
payway-sdk ask "<request>" [--approve|--yolo]
payway-sdk agent [--session <id>]
payway-sdk agent setup
payway-sdk agent doctor
payway-sdk agent sessions list
payway-sdk agent sessions export <id> --output <path>
payway-sdk agent sessions clear <id|all> [--approve]
```

## Execution and Tracking Protocol

- Wave 1: TASK-001.
- Wave 2, parallel: TASK-002, TASK-003, TASK-006.
- Wave 3, parallel where dependencies allow: TASK-004, TASK-005, TASK-007, TASK-008.
- Wave 4: TASK-009, then TASK-010.
- Wave 5: TASK-011 and TASK-012.
- Wave 6: TASK-013 final integration review.
- Each status file must contain task ID, agent, status, commit, files changed, tests with results, issues, and handoff notes.
- Each agent stages only files owned by its task and commits only after its acceptance tests pass.

---

### TASK-001: Agent Contracts and Strict JSON Schemas

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** None

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/agent/contracts.ts`
- Create: `src/agent/schemas.ts`
- Test: `src/__tests__/agent-contracts.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `AgentPlanV1`, `AgentActionDraft`, `MaterializedAgentAction`, `AgentCommandResultV1`, `ProviderConfigV1`, `AgentSessionV1`, `ExecutionRecordV1`, `ArtifactMetadataV1`, and `validateAgentPlan(value): AgentPlanV1`.

- [ ] Add Ajv as a direct runtime dependency and update the lockfile.
- [ ] Write failing tests for every valid action plus unknown tools, extra fields, malformed unions, unsupported versions, invalid currencies, and missing required properties.
- [ ] Define discriminated action unions for `generate_online_qr`, `generate_offline_khqr`, `create_checkout_payload`, `create_checkout_purchase`, `create_payment_link`, `check_transaction`, `check_transaction_by_merchant_ref`, `poll_transaction`, `save_artifact`, `open_artifact`, and `copy_to_clipboard`.
- [ ] Define versioned persistence and command-result contracts.
- [ ] Define Ajv schemas with `additionalProperties: false` at every object level and compile them once per process.
- [ ] Run `npx vitest run src/__tests__/agent-contracts.test.ts` and `npm run typecheck`; both must pass.
- [ ] Commit with `git add package.json package-lock.json src/agent/contracts.ts src/agent/schemas.ts src/__tests__/agent-contracts.test.ts` and `git commit -m "feat(agent): define strict agent contracts"`.

**Acceptance Criteria:**
- Native-tool and strict-JSON plans validate against the same schemas.
- Unknown tools and extra properties fail before any executor can run.
- Draft create actions allow `transactionId: null`; materialized actions require a valid string.
- Persisted config, session, ledger, artifact, and command-result types are versioned.

---

### TASK-002: Explicit PayWay Context and Capability Readiness

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001

**Files:**
- Create: `src/agent/context.ts`
- Create: `src/agent/readiness.ts`
- Test: `src/__tests__/agent-context.test.ts`

**Interfaces:**
- Consumes: TASK-001 contracts and existing `CredentialProfile`, `PayWayConfig`, and KHQR readiness types.
- Produces: `resolvePayWayContext(options): ResolvedPayWayContext`, `createAgentPayWay(context, operationKind): PayWay`, and `evaluateReadiness(context, providerConfig): CapabilityMatrix`.

- [ ] Write failing tests for explicit profile, `PAYWAY_PROFILE`, saved default, legacy active profile, and `.env` precedence.
- [ ] Test that stale ambient merchant values cannot override a selected profile and that `process.env` is not mutated.
- [ ] Implement immutable context resolution, redacted labels, callback/RSA/KHQR/storage readiness, and capability states `ready | missing | invalid | unverified`.
- [ ] Instantiate create-operation clients with `maxRetries: 0` and explicit resolved credentials.
- [ ] Test profile changes by resolving a fresh context after `:profile`.
- [ ] Run `npx vitest run src/__tests__/agent-context.test.ts` and `npm run typecheck`; both must pass.
- [ ] Commit with `git commit -m "feat(agent): resolve immutable PayWay context"` after staging only this task's files.

**Acceptance Criteria:**
- A selected profile cannot be silently overridden by ambient merchant credentials or environment.
- Display labels contain profile/environment but never credentials or signing material.
- Generic payment readiness fails when the online callback URL is missing and never falls back to offline KHQR.
- Production, RSA, KHQR, artifact, and session readiness are reported independently.

---

### TASK-003: Agent Configuration and Atomic Storage Primitives

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001

**Files:**
- Create: `src/agent/storage.ts`
- Create: `src/agent/config.ts`
- Test: `src/__tests__/agent-config.test.ts`

**Interfaces:**
- Consumes: `ProviderConfigV1` and its Ajv validator.
- Produces: `getAgentDataPaths(appDataDirectory?)`, `readAgentConfig()`, `writeAgentConfig(config)`, `updateAgentConfig(patch)`, and `atomicWriteJson(path, value)`.

- [ ] Write failing tests for first-run absence, valid round trip, malformed JSON, unknown versions, forbidden headers, and interrupted writes.
- [ ] Implement application-data path resolution using the existing profile-store convention.
- [ ] Implement same-directory temporary writes followed by atomic rename and restrictive permissions where supported.
- [ ] Support presets `openai | openrouter | nvidia | custom`, base URL, model, 30-second default timeout, non-secret headers, capability mode, and privacy acknowledgement timestamp.
- [ ] Reject authorization, API-key, cookie, and proxy-authorization custom headers.
- [ ] Verify setup storage never accepts or writes the provider key.
- [ ] Run `npx vitest run src/__tests__/agent-config.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): add versioned agent configuration"`.

**Acceptance Criteria:**
- Existing valid files survive a failed replacement write.
- Invalid versions fail safely without being rewritten.
- Provider keys remain environment-only through `PAYWAY_AGENT_API_KEY`.
- Windows and non-Windows paths match the profile subsystem's conventions.

---

### TASK-004: Secret Scrubber and Durable Sessions

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001, TASK-003

**Files:**
- Create: `src/agent/privacy.ts`
- Create: `src/agent/sessions.ts`
- Test: `src/__tests__/agent-privacy-session.test.ts`

**Interfaces:**
- Consumes: atomic storage and `AgentSessionV1`.
- Produces: `scrubSensitive(value, secrets): unknown`, `createSession(contextLabel): AgentSessionV1`, `appendSessionEvent(sessionId, event)`, `loadSession(id)`, `listSessions()`, `exportSession()`, `clearSessions()`, and `buildDeterministicSummary(session)`.

- [ ] Write failing tests using canary API keys, PEM keys, authorization headers, and secret values nested under unknown property names.
- [ ] Implement recursive key-name and exact-secret-value scrubbing with `[REDACTED]` replacement and no recoverable hashes.
- [ ] Implement versioned, atomic session create/load/append/list/export/clear operations.
- [ ] Retain prompts, summaries, plans, confirmations, tool calls/results, errors, artifacts, and ledger references.
- [ ] Implement deterministic provider context from the state summary plus the newest 12 conversational/tool-result events, capped at 32 KiB after scrubbing.
- [ ] Reset all pending approvals when a session resumes.
- [ ] Run `npx vitest run src/__tests__/agent-privacy-session.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): add scrubbed durable sessions"`.

**Acceptance Criteria:**
- Secrets cannot reach provider payloads or session files.
- Session export reproduces scrubbed data only.
- Session writes are atomic and version validated.
- Session-write failure returns an audit warning without corrupting an existing session.

---

### TASK-005: Execution Ledger and Uncertain-Write Recovery

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001, TASK-003

**Files:**
- Create: `src/agent/ledger.ts`
- Test: `src/__tests__/agent-ledger.test.ts`

**Interfaces:**
- Consumes: atomic storage and `ExecutionRecordV1`.
- Produces: `createExecutionRecord(draft)`, `confirmExecution(id, correlation)`, `markSubmitted(id)`, `markSucceeded(id, result)`, `markFailed(id, error)`, `markOutcomeUnknown(id, error)`, and `findUnfinishedExecutions(sessionId)`.

- [ ] Write failing tests for every legal and illegal state transition.
- [ ] Implement `planned -> confirmed -> submitted -> succeeded | failed | outcome_unknown` as the only transition graph.
- [ ] Persist `planned` before confirmation; after approval, generate a missing transaction ID and atomically persist it with `confirmed`.
- [ ] Require durable `confirmed` and `submitted` states before a PayWay create call may run.
- [ ] Mark timeout, abort, network failure, or ambiguous response after submission as `outcome_unknown`.
- [ ] Find unfinished records by session and expose their transaction ID or merchant reference for lookup without replay.
- [ ] Run `npx vitest run src/__tests__/agent-ledger.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): persist create execution ledger"`.

**Acceptance Criteria:**
- Invalid transitions and double submission are rejected.
- Correlation identifiers survive restart.
- Ledger failure before submission prevents the PayWay request.
- Unfinished and unknown creates are never replayed automatically.

---

### TASK-006: OpenAI-Compatible Provider Adapter

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001

**Files:**
- Create: `src/agent/provider.ts`
- Create: `src/agent/provider-prompts.ts`
- Test: `src/__tests__/agent-provider.test.ts`

**Interfaces:**
- Consumes: provider config and TASK-001 schemas.
- Produces: `ProviderAdapter.propose(request): Promise<AgentPlanV1>`, `ProviderAdapter.checkConnectivity(): ProviderConnectivity`, and `createProviderAdapter(config, fetchImpl?)`.

- [ ] Write mocked-fetch tests for OpenAI, OpenRouter, NVIDIA, and custom-compatible response shapes.
- [ ] Implement `POST <baseUrl>/chat/completions` with bearer credentials read only from `PAYWAY_AGENT_API_KEY`.
- [ ] In native mode, send locally generated tool schemas; in strict-JSON mode, require one complete JSON object.
- [ ] Reject Markdown fences, prose, multiple objects, trailing content, malformed output, unknown tools, and extra action fields.
- [ ] Implement configured request timeout with `AbortController`.
- [ ] Implement `/models` connectivity classification: 2xx ready, 401/403 blocked, 404/405 unverified, and network/other errors blocked with detail.
- [ ] Run `npx vitest run src/__tests__/agent-provider.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): add OpenAI-compatible provider adapter"`.

**Acceptance Criteria:**
- No provider-specific library is added.
- Native and strict-JSON modes yield the same validated local action types.
- Provider failure or malformed output produces no executable action.
- Only scrubbed conversation context is transmitted.

---

### TASK-007: Deterministic Defaults, Validation, and Risk Policy

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001, TASK-002

**Files:**
- Create: `src/agent/planning.ts`
- Create: `src/agent/risk.ts`
- Test: `src/__tests__/agent-planning-risk.test.ts`

**Interfaces:**
- Consumes: draft plans and resolved readiness.
- Produces: `normalizePlan(plan, context): NormalizedPlanResult`, `classifyRisk(action, context): RiskDecision`, and `authorizePlan(plan, approvalInput): AuthorizationResult`.

- [ ] Write failing tests for explicit routes, generic payments, every currency form, incomplete inputs, and unavailable capabilities.
- [ ] Default a generic ready payment to online QR with a 900-second lifetime and the exact explanation from the design.
- [ ] Require clarification for bare amounts, enforce USD/KHR rules, validate transaction IDs, and validate public HTTPS URLs.
- [ ] Never substitute offline KHQR when online QR is unavailable.
- [ ] Implement the complete TTY/non-TTY, sandbox/production, `--approve`, and `--yolo` authorization matrix.
- [ ] Keep ambiguity, invalid data, unavailable tools, and out-of-scope actions blocked regardless of flags.
- [ ] Run `npx vitest run src/__tests__/agent-planning-risk.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): enforce defaults and risk gates"`.

**Acceptance Criteria:**
- Confirmation proposals contain route, money, ID strategy, lifetime, context, URLs, artifacts, and assumptions.
- Production requires typed confirmation or `--approve`; `--yolo` is insufficient.
- Non-TTY requests without sufficient approval return `needs_confirmation` and perform no create.
- Cancellation is recorded and leaves the session usable.

---

### TASK-008: Artifact Store and Safe Local Utilities

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001, TASK-003

**Files:**
- Create: `src/agent/artifacts.ts`
- Create: `src/agent/local-tools.ts`
- Test: `src/__tests__/agent-artifacts.test.ts`

**Interfaces:**
- Consumes: `ArtifactMetadataV1` and atomic storage.
- Produces: `saveQrArtifact(input): ArtifactBundle`, `openArtifact(reference, session)`, `copyToClipboard(text)`, and `resolveArtifactPath(root, requestedName, overrideApproval)`.

- [ ] Write failing tests for traversal, absolute overrides, URI schemes, atomicity, QR-string-only responses, and injected disk failures.
- [ ] Implement the default `<cwd>/payway-output/` root and normalized filenames.
- [ ] Render missing QR images from `qrString` using the existing `qrcode` dependency.
- [ ] Write PNG and safe metadata atomically with absolute paths and no credentials.
- [ ] Permit open only for current-session artifacts or explicitly selected HTTPS URLs.
- [ ] Use `spawn` with `shell: false` and fixed platform command/argument allowlists for open and clipboard operations.
- [ ] Run `npx vitest run src/__tests__/agent-artifacts.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): add safe payment artifacts"`.

**Acceptance Criteria:**
- Missing `qrImage` is not treated as payment failure when `qrString` exists.
- Artifact failure after API success is reported separately and never retries payment creation.
- Paths cannot escape the root without an explicit confirmed override.
- Existing manual `generate-qr --save-image` behavior is unchanged.

---

### TASK-009: Typed PayWay Tool Registry and Executor

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-002, TASK-005, TASK-007, TASK-008

**Files:**
- Create: `src/agent/tools.ts`
- Create: `src/agent/executor.ts`
- Test: `src/__tests__/agent-tools.test.ts`

**Interfaces:**
- Consumes: materialized actions, resolved clients, risk authorization, ledger, and artifact/local utilities.
- Produces: a closed typed tool registry and `executeAction(action, executionContext): Promise<ToolExecutionResult>`.

- [ ] Write mocked SDK tests asserting exact parameters and call counts for every tool.
- [ ] Map online QR, offline KHQR, checkout payload, checkout purchase, payment link, transaction lookup, merchant-reference lookup, polling, and local utilities to the existing SDK domains.
- [ ] Require a confirmed ledger record for every create action.
- [ ] Normalize checkout results as QR string, deeplink, hosted QR URL, HTML, or structured error without discarding raw safe fields.
- [ ] Bound polling by the smaller of requested timeout and remaining online-QR lifetime and support cancellation.
- [ ] On unknown create outcomes, offer correlation lookup and require new consent before any replacement create.
- [ ] Run `npx vitest run src/__tests__/agent-tools.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): execute typed PayWay actions"`.

**Acceptance Criteria:**
- Executors cannot receive unvalidated provider values.
- Create operations are called exactly once.
- PayWay errors preserve local detail while presenting safe summaries.
- `APPROVED` polling results are labeled observed status rather than fulfillment authority.

---

### TASK-010: Conversation Orchestrator

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-004, TASK-006, TASK-007, TASK-009

**Files:**
- Create: `src/agent/orchestrator.ts`
- Create: `src/agent/output.ts`
- Test: `src/__tests__/agent-orchestrator.test.ts`

**Interfaces:**
- Consumes: context, readiness, sessions, provider, planning, risk, ledger, executor, and artifacts.
- Produces: `AgentOrchestrator.runOneShot(request, options)`, `AgentOrchestrator.runTurn(sessionId, request, options)`, `AgentOrchestrator.resume(sessionId)`, `renderHumanResult(result)`, and `serializeCommandResult(result)`.

- [ ] Write failing end-to-end unit tests for one-shot success, clarification, cancellation, privacy refusal, provider failure, invalid plan, consent, unknown outcome, resume, and polling offer.
- [ ] Implement the ordered pipeline: resolve, acknowledge privacy, build scrubbed context, plan, validate, clarify, persist planned writes, authorize, materialize IDs, execute, persist results, and offer polling.
- [ ] Return versioned structured results for every non-TTY outcome.
- [ ] Reset write approval on resume and after material plan changes.
- [ ] Keep provider, session, PayWay, and artifact failures distinguishable.
- [ ] Run `npx vitest run src/__tests__/agent-orchestrator.test.ts`.
- [ ] Commit with `git commit -m "feat(agent): orchestrate agentic payment flows"`.

**Acceptance Criteria:**
- Every failure before submission executes zero PayWay creates.
- Session restoration never restores write approval.
- Session-write failure after an action emits the required audit warning.
- Successful online QR results are saved/shown before polling is offered.

---

### TASK-011: CLI Commands, REPL, Setup, Doctor, and Sessions

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-010

**Files:**
- Create: `src/cli/commands/agent.ts`
- Create: `src/agent/repl.ts`
- Modify: `src/cli.ts`
- Test: `src/__tests__/agent-cli.test.ts`

**Interfaces:**
- Consumes: conversation orchestrator, context/readiness, config, and sessions.
- Produces: all public CLI commands and REPL directives specified in this plan.

- [ ] Write `dist/cli.js` subprocess tests for every command, option, directive, exit code, and JSON outcome.
- [ ] Register `ask` and the `agent` command tree through one small function called from `src/cli.ts`.
- [ ] Implement `:help`, `:profile`, `:history`, `:clear`, `:session`, `:run`, and `:exit`.
- [ ] Restrict `:run` to recognized PayWay commands; reject shells, executables, agent management, arbitrary paths, and URI schemes.
- [ ] Implement setup without accepting secrets, doctor capability output, and warned session list/export/clear operations.
- [ ] Build before CLI testing: `npm run build`.
- [ ] Run `npx vitest run src/__tests__/agent-cli.test.ts src/__tests__/cli.test.ts src/__tests__/profiles.test.ts`.
- [ ] Commit with `git commit -m "feat(cli): add agentic PayWay commands"`.

**Acceptance Criteria:**
- New commands appear in built CLI help.
- Non-TTY creates without authorization return structured JSON and make no API request.
- Profile changes refresh actual context and display without exposing secrets.
- Existing manual CLI tests and behavior remain unchanged.

---

### TASK-012: Agent Skills and Integration Documentation

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-011

**Files:**
- Create: `skills/aba-payway-first-payment/SKILL.md`
- Create: `skills/aba-payway-agent/SKILL.md`
- Modify: `skills/aba-payway-purchase/SKILL.md`
- Modify: `skills/README.md`
- Modify: `README.md`
- Modify: `docs/QUICK-START-1-PAGER.md`
- Modify: `docs/01-overview-and-concepts.md`
- Modify: `docs/02-prerequisites-and-setup.md`
- Modify: `docs/README.md`
- Test: `src/__tests__/skills.test.ts`
- Test: `src/__tests__/docs-examples.test.ts`

**Interfaces:**
- Consumes: final CLI names, configuration, risk behavior, and tool contracts.
- Produces: packaged journey and agent skills plus linked integration guidance.

- [ ] Write failing skill-discovery tests for both new skills and the updated total.
- [ ] Add both skills using repository frontmatter/version, Quick Start, TypeScript example, and Error Handling conventions.
- [ ] Clarify that `createTransaction()` creates a local signed payload while `purchase()` performs a network request.
- [ ] Document provider setup, privacy, first-payment selection, polling/webhook distinction, artifacts, sessions, plaintext risk, and manual escape paths.
- [ ] Document secure OS/cloud/CI secret-manager guidance for deployed SDK use.
- [ ] Run `npx vitest run src/__tests__/skills.test.ts src/__tests__/docs-examples.test.ts`, `npm run typecheck`, and `git diff --check`.
- [ ] Commit with `git commit -m "docs: add agentic PayWay guidance"`.

**Acceptance Criteria:**
- Both skills are packaged and discoverable.
- All specified documentation entry points link to the agent guidance.
- Documentation never recommends storing provider or PayWay secrets in config or sessions.
- Manual commands remain documented as fully supported alternatives.

---

### TASK-013: End-to-End Verification and Architecture Review

**Status:** `[ ] Not Started | [ ] In Progress | [ ] Completed`

**Dependencies:** TASK-001 through TASK-012

**Files:**
- Create: `src/__tests__/agent-e2e.test.ts`
- Modify: only task-specific files required to correct verified gaps.

**Interfaces:**
- Consumes: the complete implemented milestone.
- Produces: final acceptance evidence and a design-to-test coverage record in `TASK-013.md`.

- [ ] Test generic `$3` online QR through proposal, sandbox approval, ledger, mocked API, QR artifacts, and optional polling.
- [ ] Test non-TTY execution without approval, production `--yolo` rejection, and production `--approve` success.
- [ ] Test missing callback without offline fallback and explicit offline KHQR without polling.
- [ ] Test checkout payload versus remote purchase, payment-link RSA readiness, and distinct transaction/reference lookups.
- [ ] Test submitted timeout to `outcome_unknown`, correlation recovery, and no replay.
- [ ] Test session resume without approval and malicious provider path/URI/shell attempts.
- [ ] Place canary secrets in every input channel and prove they are absent from provider payloads, sessions, ledger, artifacts, and console output.
- [ ] Run the complete verification suite below and record exact results in the task status file.
- [ ] Commit with `git commit -m "test(agent): verify agentic PayWay milestone"`.

```powershell
npm run build
npm run typecheck
npm run lint
npm test
node dist/cli.js --help
node dist/cli.js agent --help
node dist/cli.js agent doctor
git diff --check
git status --short
```

**Acceptance Criteria:**
- Every design requirement maps to a passing test or explicit manual verification record.
- All prior 378 tests plus all new agent tests pass.
- No create API is invoked more than once per approved execution record.
- No existing manual CLI regression is introduced.
- The worktree contains no credentials, payment artifacts, or session data.

## Assumptions Locked by This Plan

- JSON Schema with Ajv is the authoritative runtime-validation approach.
- Multi-session work uses isolated per-task handoff files.
- Generated transaction IDs are materialized after approval and displayed before submission without a second prompt.
- `--approve`, but not `--yolo`, can authorize a complete production action.
- Ajv is the only new mandatory runtime dependency; platform utilities use fixed `spawn` allowlists.
- The execution ledger is separate from session persistence and is authoritative for create-operation recovery.
- Session retention is indefinite until explicit clear, and session files remain plaintext.
- No payouts, refunds, beneficiary management, callback administration, callback provisioning, arbitrary shell execution, or manual-command refactoring is included.
