# Agentic PayWay CLI Design

## Status

Design approved in conversation; implementation has not started.

## Goal

Add an agentic natural-language layer to the existing ABA PayWay TypeScript CLI while preserving manual command behavior. The layer supports one-shot requests and a conversational REPL for broad, multi-step PayWay workflows, beginning with the first-payment journey.

## Product surfaces

```text
payway-sdk ask "generate a QR code for $3"
payway-sdk agent
```

Manual Commander commands remain available and unchanged. The agent is an additive orchestration layer, not a replacement for the existing CLI.

## Architecture

The agent uses a local orchestrator with typed tools:

```text
CLI entrypoint
  -> conversation/session manager
  -> OpenAI-compatible provider adapter
  -> validated agent plan
  -> risk policy and confirmation gate
  -> typed tool registry
  -> PayWay SDK and local utility execution
```

The LLM may plan workflows and select declared tools, but it cannot execute shell commands directly. Local code remains authoritative for validation, profile resolution, defaults, risk decisions, SDK invocation, artifact handling, and session persistence.

## Provider boundary

The provider adapter supports any OpenAI-compatible endpoint, including OpenAI, OpenRouter, OpenCode-compatible gateways, NVIDIA NIM, company gateways, and other compatible services. Configuration includes:

- endpoint/base URL;
- model;
- API key;
- request timeout; and
- optional provider-specific headers.

The model receives full non-secret tool results, including customer and transaction data, after an explicit privacy warning is shown. Credentials, private keys, authorization headers, and profile secret fields must never be included in provider requests.

## First-payment typed tools

The initial tool registry includes:

- `generate_qr`: amount, currency, transaction ID/reference, lifetime, callback configuration, and QR output;
- `create_checkout`: amount, currency, transaction ID, return/cancel URLs, and payment option;
- `create_payment_link`: amount, currency, description, payment limit, and expiration;
- `check_transaction`: transaction ID or merchant reference;
- `poll_transaction`: transaction ID, interval, timeout, and explicit user approval;
- `save_artifact`: normalized artifact type, content, and optional filename;
- `open_artifact`: validated local path or HTTPS URL; and
- `copy_to_clipboard`: text payload.

Payouts, refunds, beneficiary management, callback administration, and other high-impact domains are outside the first milestone.

## Defaults and clarification

Route selection follows this order:

1. Explicit user wording wins.
2. A generic payment request defaults to QR payment.
3. The agent explains the assumption:

   > You didn’t specify a payment interface, so I went ahead with the quick and easy QR payment approach. If you prefer checkout or a payment link, just ask again.

4. Missing amount, ambiguous currency, invalid lifetime, or missing required callback details pauses for clarification.

The default QR lifetime is 15 minutes (900 seconds). Explicit currency symbols and codes are interpreted directly: `$3` means USD, `3 USD` means USD, and `3,000 KHR` means KHR. A bare amount requires clarification unless a deliberate profile currency default exists.

The existing active profile and environment are used. The proposed action displays the selected profile name and environment, never credentials.

## Confirmation and YOLO behavior

Risk is classified per tool and action:

- low-risk local utilities may run without confirmation;
- payment creation requires ordinary confirmation;
- production actions, invalid or incomplete requests, and materially ambiguous actions are hard-gated; and
- YOLO skips ordinary confirmations but cannot bypass hard gates.

Each proposed action states the route, amount, currency, lifetime, selected profile/environment, and risk-relevant assumptions.

After QR creation, the agent saves and presents the result, then offers payment monitoring. Polling does not start automatically; it begins only after the user accepts the offer.

## Artifacts and local utilities

The agent’s default artifact directory is:

```text
./payway-output/
```

The directory is created on demand. QR results produce:

- a QR image file; and
- a safe normalized JSON metadata file containing amount, currency, route, transaction ID, merchant reference, profile name/environment, creation time, expiration time, artifact paths, and status.

Metadata excludes credentials and private keys. Users may request explicit filenames or output paths.

The agent prints absolute paths as clickable terminal links where supported, falls back to plain paths otherwise, and can open saved files or HTTPS links with the platform default application. Clipboard copying is an explicit local utility.

The current manual `generate-qr --save-image <path>` behavior remains unchanged. The existing CLI has no predefined artifact directory; repository `test-logs/` paths are test-script conventions, not user-facing storage.

## Sessions

Every agent session is persisted as plaintext JSON in the OS application-data directory, separate from `./payway-output/` and credential profiles. On Windows this is under the existing PayWay application-data area, with platform-appropriate application-data locations elsewhere.

Sessions are retained indefinitely until explicitly cleared. They include prompts, plans, confirmations, tool calls, results, errors, and timestamps. The CLI provides session listing, export, and explicit clearing commands. The CLI warns that session files may contain sensitive customer and transaction data and are not encrypted at rest.

## Failure behavior

- LLM provider failure, timeout, malformed output, or unsupported tool call: no PayWay action runs.
- Missing or ambiguous information: pause for clarification without execution.
- Confirmation cancellation: record cancellation and await a revised request.
- PayWay failure: preserve the local provider error while presenting a safe actionable summary.
- Artifact failure after a successful API action: report the API success separately and do not retry payment creation automatically.
- Polling failure: distinguish transient from terminal failures and allow the user to stop.
- Session-write failure: warn that the action proceeded but the audit record was not persisted.

## Verification strategy

Verification must cover:

- intent parsing, defaults, route selection, currency handling, risk classification, hard gates, and metadata redaction;
- typed-tool contract tests with mocked PayWay SDK responses;
- OpenAI-compatible tool-call formats and malformed provider output;
- `ask`, `agent`, confirmation, YOLO, session, clickable-path, and manual-command regression behavior;
- QR creation to artifact save/open/copy and optional polling;
- proof that credentials and private keys never reach provider payloads or session metadata; and
- build, typecheck, lint, and CLI tests against rebuilt `dist/cli.js`.

## Scope boundary

This design covers the agentic first-payment milestone only. It does not authorize implementation, provider-specific SDK integration, broad CLI refactoring, payout/refund/callback-agent work, or arbitrary shell execution.
