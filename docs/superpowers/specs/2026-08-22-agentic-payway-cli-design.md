# Agentic PayWay CLI Design

## Status

Revised after architecture review; implementation has not started.

## Goal and scope

Add an agentic natural-language layer to the ABA PayWay TypeScript CLI while preserving every existing manual command. It offers one-shot requests and a conversational REPL for broad, multi-step workflows, beginning with the first-payment journey.

The LLM proposes typed actions. It never executes shell commands, bypasses SDK validation, or becomes the authority for credentials, execution, artifacts, or persistence.

First-milestone scope is online QR, explicitly requested offline KHQR, checkout, payment links, transaction lookup/polling, and safe local utilities. Payouts, refunds, beneficiary management, callback administration, and arbitrary shell access remain out of scope.

## Product surfaces

```text
payway-sdk ask "generate a QR code for $3"
payway-sdk agent
payway-sdk agent setup
payway-sdk agent doctor
payway-sdk agent sessions list|export|clear
```

`ask` is a one-shot request. `agent` starts a REPL. Manual Commander commands continue to work unchanged. REPL directives provide predictable control without a shell: `:help`, `:profile`, `:history`, `:clear`, `:session`, `:run <allowlisted command>`, and `:exit`. `:run` accepts only recognized PayWay commands and uses the same local command/tool boundary.

## Architecture

```text
ask / agent command
  -> resolved PayWay context
  -> capability readiness check
  -> conversation and provider adapter
  -> strict plan validator
  -> risk gate
  -> execution ledger
  -> typed PayWay and local-tool executor
  -> artifact and session stores
```

The resolved context selects actual credentials, environment, callback URLs, and feature readiness. The readiness check determines the operations available. The provider proposes a plan; a local validator accepts only declared tools and schemas. The risk gate controls consent. The execution ledger makes uncertain writes recoverable without replay. Executors invoke the SDK and a small local-tool allowlist.

## Resolved PayWay context and readiness

Resolve PayWay configuration once at session start and whenever the user changes profile. Instantiate `PayWay` with those explicit resolved values; do not rely on mutable `process.env` after planning begins.

`ResolvedPayWayContext` records the selected source (`--profile`, `PAYWAY_PROFILE`, saved default profile, or `.env`), actual merchant credential source and environment, RSA-key availability, online QR callback URL, offline KHQR configuration, and a redacted display label. The profile/environment displayed in a confirmation must be the actual SDK context. A selected profile must not be silently overridden by pre-existing environment variables. Existing manual CLI behavior is not changed by this milestone.

`agent doctor` reports a capability matrix for provider connectivity, selected context, online QR callback, offline KHQR, checkout, payment-link RSA readiness, and writable artifact/session storage.

## Provider configuration and privacy

Support OpenAI-compatible providers, including OpenAI, OpenRouter, OpenCode-compatible gateways, NVIDIA NIM, company gateways, and compatible self-hosted services.

Store non-secret provider settings in a versioned agent configuration file in the OS application-data directory: provider preset or endpoint, model, timeout, optional headers, and capability mode (`native-tools` or `strict-json-plan`). Keep the provider API key in an environment variable, never with PayWay profiles, artifacts, or sessions.

OpenAI compatibility does not imply equivalent tool calling. Native tool calls and strict JSON plans both undergo local schema validation. Unknown tools, malformed output, or extra action fields stop execution.

The model may receive full non-secret tool results, including customer and transaction data, after an explicit privacy warning and recorded acknowledgement. A non-bypassable scrubber removes API keys, private keys, authorization headers, profile secrets, and signing material before provider requests and session writes. Provider context is bounded to the active window plus a deterministic state summary; the local session retains the complete history.

## First-payment typed tools

- `generate_online_qr`: requires amount, currency, transaction ID, public HTTPS callback URL, and optional lifetime. It creates a dynamic PayWay QR that can be status-polled.
- `generate_offline_khqr`: is explicit only; it requires ABA-issued KHQR merchant configuration and a merchant reference. It may be static, has no PayWay transaction polling, and has no online-QR lifetime.
- `create_checkout_payload`: creates a signed local checkout payload for a server-side form. It makes no PayWay network request.
- `create_checkout_purchase`: calls the checkout purchase API and returns its actual response type, such as QR string, deeplink, hosted checkout QR URL, or HTML.
- `create_payment_link`: requires RSA credentials, title, amount, currency, unique merchant reference, and public HTTPS return URL; description, payment limit, and expiry are optional.
- `check_transaction`: accepts transaction ID. Merchant-reference lookup is a separate tool.
- `poll_transaction`: accepts transaction ID, interval, and a timeout bounded by remaining online-QR lifetime. It starts only after the post-payment offer is accepted.
- `save_artifact`, `open_artifact`, and `copy_to_clipboard`: execute only validated local actions.

## Defaults and clarification

Explicit wording selects the route: `offline QR`, `checkout payload`, `checkout`, or `payment link`. A generic payment request defaults to an **online QR** only when readiness succeeds:

> You didn’t specify a payment interface, so I went ahead with the quick and easy online QR payment approach. If you prefer checkout or a payment link, just ask again.

If online QR is not ready, explain the missing callback requirement and offer setup guidance. Never silently fall back to offline KHQR.

The default online QR lifetime is 15 minutes (900 seconds). `$3` and `3 USD` mean USD; `3,000 KHR` means KHR; a bare amount requires clarification unless the resolved context has a deliberate currency default. Validate before confirmation: USD has at most two decimals, KHR is an integer, transaction IDs are non-empty/20 characters or fewer/alphanumeric-hyphen only, and callback or return URLs are public HTTPS URLs.

Generate a transaction ID only after create-action approval, persist it in the execution ledger before the request, and show it in the proposed action.

## Confirmation, YOLO, and non-interactive behavior

- Read-only status checks and validated presentation utilities may run without confirmation.
- Sandbox payment creation requires ordinary confirmation.
- Production payment creation, incomplete or materially ambiguous requests, and actions outside the tool scope are hard-gated.
- YOLO skips ordinary confirmations but cannot bypass hard gates.

`--approve` is the explicit non-interactive approval flag; it authorizes both sandbox and production create actions. `--yolo` is a separate flag that skips only ordinary (sandbox) confirmation prompts and cannot authorize production create actions. In a non-TTY invocation without `--approve`, return structured `needs_confirmation` output and do not create a payment.

Every create proposal states route, amount, currency, transaction ID, lifetime, selected profile/environment, callback or return URL, artifacts, and assumptions. After a successful online QR, save and show the result, then offer polling. A polled `APPROVED` result is an observed status only; webhook verification and merchant reconciliation remain the fulfillment source of truth.

## Execution ledger and uncertain outcomes

Every create operation has a persisted execution record:

```text
planned -> confirmed -> submitted -> succeeded | failed | outcome_unknown
```

Write the record before the network call. Create tools have no agent-level automatic retry. If a timeout, network failure, or ambiguous response occurs, mark `outcome_unknown`. First query the persisted transaction ID or merchant reference where supported; then ask before creating a new payment. Never replay an unfinished create action automatically, including after resuming a session. Local artifact failure never causes a new PayWay request.

## Artifacts and local utilities

Default artifact root:

```text
./payway-output/
```

Create the directory on demand. An online QR produces a QR PNG and normalized JSON metadata containing route, amount, currency, IDs/references, actual context label, timestamps, expiry, status, execution-record ID, and artifact paths. Exclude credentials, private keys, authorization headers, and signing material.

Write artifacts atomically. Normalize requested filenames and reject paths escaping the output root unless the user explicitly supplies and confirms an override. If PayWay returns only a QR string, render the PNG locally rather than treating the missing image as a payment failure. Print absolute clickable paths where supported and plain paths otherwise.

Opening the local generated QR image is part of the confirmed create plan. Other open actions accept only an artifact created in the active session or a validated HTTPS URL explicitly selected by the user. Never open arbitrary model-provided paths or URI schemes. The existing manual `generate-qr --save-image <path>` behavior remains unchanged.

## Sessions

Persist every agent session as plaintext, versioned JSON in the OS application-data directory, separate from artifacts and credential profiles. Retain sessions indefinitely until explicitly cleared. They contain prompts, deterministic summaries, plans, confirmations, execution records, tool calls, results, errors, and timestamps.

Use atomic writes and restrictive permissions where supported. Provide list, export, and explicit clear commands. Warn that session files can contain sensitive customer and transaction data and are not encrypted at rest. Resuming restores context but never restores approval for a write action.

## Failure behavior

- Provider failure, timeout, malformed output, unavailable capability, or invalid schema: no PayWay action runs.
- Missing or ambiguous information: pause for clarification.
- Capability not ready: name the exact missing configuration and offer `agent doctor`; do not substitute a route.
- Confirmation cancellation: record cancellation and await revision.
- PayWay error: preserve local error detail and present a safe actionable summary.
- Unknown create outcome: persist, query, then require new consent before another creation.
- Artifact failure after API success: report success separately and offer recovery.
- Polling failure: distinguish transient errors from terminal states, stop at remaining lifetime, and allow cancellation.
- Session-write failure: warn that the action proceeded without a durable audit record.

## Verification strategy

Verify resolved-context precedence and display accuracy; capability readiness; no online-to-offline fallback; money/ID/URL/lifetime validation; native-tool and strict-JSON provider modes; secret scrubbing; bounded provider context; risk, `--approve`, YOLO, and TTY behavior; execution-ledger unknown outcomes and no replay; SDK-tool contracts; QR-string-only rendering; artifact containment/open/copy; polling bounded by QR lifetime; session versioning and atomicity; skills/docs links; build, typecheck, lint, and CLI tests against rebuilt `dist/cli.js`.

## Skill and documentation improvements

Keep endpoint-focused skills and add:

- `aba-payway-first-payment`: QR/checkout/payment-link decision matrix, readiness, required inputs, result handling, polling/webhook distinction, and user-facing explanations.
- `aba-payway-agent`: provider capability modes, tool schemas, resolved context, risk gates, execution ledger, local utilities, and redaction.

Clarify `aba-payway-purchase`: `createTransaction()` creates a local signed payload; `purchase()` makes a remote request. Update the README, quick-start, overview/setup guide, and documentation index with agent setup, privacy, first-payment decisions, artifact/session locations, and manual-mode escape paths.

## Scope boundary

This document does not authorize implementation, provider-specific SDK dependencies, broad manual-CLI refactoring, payout/refund/callback-agent work, arbitrary shell execution, automatic callback provisioning, or changes to existing manual command behavior.
