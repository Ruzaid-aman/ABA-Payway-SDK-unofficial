# Agentic PayWay CLI — User Guide

This guide documents the **agentic PayWay CLI**: a natural-language layer on top of the
existing PayWay SDK that turns requests like *"generate a QR for $3"* into validated,
audited PayWay operations. It covers what is implemented, every command, the safety model,
and how to configure both the agent's LLM provider and your PayWay credentials.

> The agentic layer is **additive** — it never changes the behavior of the existing manual
> commands (`generate-qr`, `generate-checkout`, `check-transaction`, …). Those commands remain
> the single source of truth and are re-dispatched by the interactive REPL.

---

## 1. What is implemented

The agentic layer lives under `src/agent/` and adds one top-level command (`ask`) plus an
`agent` command tree. It is built from the following modules:

| Module | Responsibility |
| --- | --- |
| `contracts.ts` | Versioned, discriminated TypeScript contracts for plans, actions, config, sessions, ledger, artifacts, and command results. |
| `schemas.ts` | Strict Ajv validators (`additionalProperties: false`) for every contract object. A provider-proposed plan is **never** executed unless it validates. |
| `config.ts` | Reads/writes the non-secret provider config atomically; rejects forbidden headers (authorization/api-key/etc.). |
| `storage.ts` | Atomic JSON writes (`temp file → rename`) under the `aba-payway-sdk/agent` app-data subtree. |
| `context.ts` | Resolves the explicit PayWay context (profile / env / default) and builds a `PayWay` client. Create operations use `maxRetries: 0` so they never silently duplicate. |
| `readiness.ts` | Computes the capability matrix (provider connectivity, online QR, offline KHQR, checkout, payment-link RSA, artifact/session storage). |
| `provider.ts` | OpenAI-compatible provider adapter. Proposes an `AgentPlanV1` via `/chat/completions` in either `native-tools` or `strict-json-plan` mode. Reads the API key **only** from `PAYWAY_AGENT_API_KEY`. |
| `provider-prompts.ts` | Builds the system prompt (strict-JSON mode) and the tool/action schemas sent to the model. |
| `privacy.ts` | Redacts secrets from free-text before it leaves the process. |
| `sessions.ts` | Durable session store (event log) with secrets scrubbed on export. |
| `ledger.ts` | Execution ledger recording every planned/confirmed/submitted/succeeded/failed create action. |
| `planning.ts` | Normalizes a proposed plan (default lifetimes, fill drafts) and detects when clarification is needed. |
| `risk.ts` | Authorization engine: decides whether a plan may proceed given `--approve` / `--yolo`, TTY, and environment. |
| `artifacts.ts` | Safe artifact storage (QR/receipt/text) confined to the session artifact root; filename sanitization. |
| `local-tools.ts` | Guarded host utilities (`openArtifact`, `copyToClipboard`) confined to a fixed allowlist and the session artifact root. |
| `tools.ts` / `executor.ts` | Maps each tool name to exactly one SDK call and runs it with ledger transitions. |
| `orchestrator.ts` | The pipeline that turns a request into a result: scrub → privacy gate → propose → validate → normalize → authorize → materialize → execute. |
| `output.ts` | Human-readable and serialized (JSON) result rendering. |
| `repl.ts` | Interactive REPL that re-dispatches recognized manual commands and otherwise sends free-form text to the agent. The loop is exposed as `runRepl(io)` with injected streams (in-process testable); `startRepl` wires the real terminal. |
| `repl-helpers.ts` | Pure REPL logic: directive classification and `:run` dispatch validation (the shell-escape / agent-management security boundary), plus the static REPL texts. |
| `progress.ts` / `ansi.ts` | Presentation helpers shared by `ask` and the REPL: progress labels, "Contacting…" banner, provider-failure hint, and ANSI styling. |

The command-tree glue lives in `src/cli/commands/agent.ts` (registers `ask`,
`agent setup|doctor|ack|sessions`); its validation and rendering are extracted
into `src/cli/commands/agent-helpers.ts` (setup-option validation, doctor/ack/
session output builders, interactive confirmation helpers).

Three high-value agent-guidance skills are shipped under `skills/`:
`skills/aba-payway-first-payment/SKILL.md`,
`skills/aba-payway-agent/SKILL.md`, and
`skills/aba-payway-journal/SKILL.md`.

---

## 2. Build & install

```bash
npm install
npm run build      # tsup → dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest (1350+ tests as of 2026-09-06)
```

After building, the CLI binary is the SDK entry point (referenced here as `payway-sdk`).

**Startup latency — prefer the built artifact over `npx tsx`.** The compiled
`node dist/cli.js --help` starts in **P50 ≈ 413 ms / P95 ≈ 415 ms** (plan
threshold: 500 ms; measured by
`audit-results/four-pillars/evidence/startup-probe.ts node dist/cli.js --help`,
Windows). The `npx tsx src/cli.ts` dev path costs ~2 s P50 because of `npx`
resolution + JIT transpilation of the whole command graph — fine for
development, not for scripted/production use. For regular CLI work, install
globally once and skip both overheads:

```bash
npm install -g .        # or: npm link
payway-sdk --help       # runs dist/cli.js directly, no npx/tsx
```

---

## 3. Quick start

```bash
# 1. Configure the agent's LLM provider (key stays in the environment, never stored)
export PAYWAY_AGENT_API_KEY=sk-...
# Free option (OpenCode Zen):
payway-sdk agent setup --provider opencode --model x-preview-f-free --acknowledge-privacy \
  --max-tokens 8192 --temperature 0.2
# Or OpenAI:
# payway-sdk agent setup --provider openai --model gpt-4o --acknowledge-privacy

# 2. Save your PayWay credentials as a PROFILE (required for agent readiness)
payway-sdk profiles add          # interactive
payway-sdk profiles use <name>   # make it the default

# 3. Public HTTPS callback (required for online QR)
#    PAYWAY_CALLBACK_URL=https://<public-host>/aba-payway-webhook in .env,
#    or run: payway-sdk setup-webhook --tunnel

# 4. Check the capability matrix
payway-sdk agent doctor

# 5. Run a request (sandbox, one-shot)
payway-sdk ask "Generate an online QR for 3 USD" --yolo
```

> **`.env` credentials alone are not enough for the agent.** The context resolver does fall
> back to environment variables, but agent readiness requires a **saved profile**
> (`agent doctor` shows "PayWay context: missing" otherwise). See
> [AGENT-SETUP-PLAYBOOK.md](AGENT-SETUP-PLAYBOOK.md) for a field-tested setup path,
> troubleshooting, and known pitfalls (including `profiles add` being interactive-only). The
> guided `payway-sdk onboard` command automates every step above in one interactive flow.

---

## 4. Command reference

### `payway-sdk ask <request>`

Single-shot natural-language request. Makes **zero** network calls before authorization.

| Option | Meaning |
| --- | --- |
| `<request>` | Free-form request, e.g. `"generate a QR for $3"`. |
| `--approve` | Authorize **both** sandbox and production create actions. |
| `--yolo` | Skip confirmation for **sandbox** create actions only. Refused for production. |
| `--session <id>` | Resume an existing agent session. |

Non-TTY without `--approve`/`--yolo` → returns `needs_confirmation` and never contacts the provider.
No provider config → returns `blocked`.

### `payway-sdk agent` (REPL)

With no subcommand, drops into an interactive REPL (`payway-agent>`). REPL directives:

| Directive | Purpose |
| --- | --- |
| `:help` | Show directive help. |
| `:profile` | Show the active credential profile. |
| `:history` | Show command history. |
| `:clear` | Clear the screen. |
| `:session` | Show / create the active session id. |
| `:run <cmd>` | Re-dispatch a recognized manual PayWay command (e.g. `:run generate-qr --amount 3`). Agent-management commands (`agent`, `ask`) are rejected, as are shells, paths, and URIs. |
| `:exit` / `:quit` | Leave the REPL. |

Any other line is sent to the agent as a free-form request.

### `payway-sdk agent setup`

Configures the provider (non-secret settings only).

| Option | Meaning |
| --- | --- |
| `--provider <preset>` | `openai` \| `openrouter` \| `nvidia` \| `opencode` \| `custom`. |
| `--model <name>` | Model id, e.g. `gpt-4o` or `x-preview-f-free`. |
| `--base-url <url>` | Custom endpoint (required when `--provider custom`). |
| `--capability-mode <mode>` | `native-tools` \| `strict-json-plan`. |
| `--timeout <ms>` | Provider request timeout (positive integer). |
| `--max-tokens <n>` | Sampling passthrough: `max_tokens` for chat completions. Recommended for models with small server-side defaults — a truncated response cannot produce a valid plan. |
| `--temperature <n>` | Sampling passthrough: temperature (0–2). For strict-JSON planning, 0.2–0.5 adheres to the tool schema far better than 1.0. |
| `--top-p <n>` | Sampling passthrough: top_p (0–1). |
| `--extra-body <json>` | Extra top-level request-body fields merged verbatim into every call, e.g. `'{"chat_template_kwargs":{"enable_thinking":false}}'` for NVIDIA thinking models. |
| `--acknowledge-privacy` | Records the privacy acknowledgment timestamp (required before plans are proposed). |

Provider presets and their base URLs:

| Preset | Base URL |
| --- | --- |
| `opencode` | `https://opencode.ai/zen/v1` (free models, e.g. `x-preview-f-free`) |
| `openai` | `https://api.openai.com/v1` |
| `openrouter` | `https://openrouter.ai/api/v1` |
| `nvidia` | `https://integrate.api.nvidia.com/v1` |

The API key is **never** stored — it is read from `PAYWAY_AGENT_API_KEY` at runtime.

### `payway-sdk agent ack`

Records (or updates) the provider privacy acknowledgment in the agent config. Requires a
configured provider; without one it exits non-zero with guidance to run `agent setup` first.
Equivalent to passing `--acknowledge-privacy` on `setup`.

### `payway-sdk agent doctor`

Prints the capability matrix: provider connectivity, privacy-acknowledgment status, and each
PayWay capability (online QR callback, offline KHQR, checkout, payment-link RSA,
artifact/session storage). Every non-ready row also prints a `→` fix hint pointing at the
exact command (or `payway-sdk onboard`) that resolves it.

### `payway-sdk onboard`

Guided, interactive setup. Scans the current state, shows a checklist of what is configured
vs. missing, then walks through the stages needed to make the agent usable:

1. **Inference provider** — choose OpenCode Zen / OpenRouter / NVIDIA / OpenAI / Custom, pick a
   model, decide where `PAYWAY_AGENT_API_KEY` lives (`.env` / session / user env), then verifies
   connectivity.
2. **PayWay merchant profile** — name, environment, merchant id, API key (masked), optional RSA
   PEM, optional KHQR block. Saved via the profile store.
3. **Callback URL** — validates a public HTTPS URL (offers `setup-webhook --tunnel` guidance).
4. **Privacy acknowledgement** — records `privacyAcknowledgedAt`.

When every stage that is still missing has run, it re-renders the capability matrix before→after
and ends with the suggested first command.

| Option | Meaning |
| --- | --- |
| `--stage <name>` | Run one stage only: `provider` \| `profile` \| `callback` \| `privacy` \| `verify`. |

- In a TTY the wizard runs; **in a non-TTY it emits a structured `blocked` JSON plan** (the same
  shape as `ask`) listing the missing remedy ids, so scripts/CI can detect what to configure.
- Already-satisfied stages are skipped automatically on a full run.
- Set `PAYWAY_ONBOARD_AUTO=1` to auto-launch the wizard the first time `ask`/`agent` run
  unconfigured in a TTY (opt-in; non-TTY is unaffected).

### `payway-sdk agent ledger` (recovery & retention)

- `recover [--session-id <id>]` — list unfinished creates
  (planned/confirmed/submitted/outcome_unknown) with a per-record
  `check-transaction` hint. **Lookup only — creates are never replayed.**
- `prune --before <days|ISO>` — remove FINISHED (succeeded/failed) execution
  records older than the cutoff; unfinished records are never removed and
  unparseable files are left untouched.
- The REPL prints a banner when the most recent prior session has unfinished
  creates (suppress with `PAYWAY_AGENT_NO_RECOVER_HINT=1`).

### `payway-sdk agent sessions`

| Subcommand | Purpose |
| --- | --- |
| `list` | List saved sessions (id, context label, event count, updated time). |
| `export <id> --output <path>` | Export a session to JSON, **scrubbed of secrets**. |
| `clear <id|all> [--approve]` | Delete a session or all sessions. Requires `--approve` in non-TTY. |

---

## 5. Safety model (the core design)

The agent is built so that a model can **never** autonomously perform a side-effecting
PayWay write without an explicit, scoped human decision.

- **No network before authorization.** `ask` performs no provider/PayWay call until the
  plan is authorized.
- **Read-only actions need no approval.** Queries (`check_transaction`, `poll_transaction`,
  `check_transaction_by_merchant_ref`) run without `--approve`.
- **Create actions require a decision:**

  | Input | Sandbox create | Production create |
  | --- | --- | --- |
  | (none, interactive TTY) | blocked → prompts | blocked → prompts |
  | (none, non-TTY) | `needs_confirmation` | `needs_confirmation` |
  | `--yolo` | authorized | **refused** (needs `--approve`) |
  | `--approve` | authorized | authorized |

- **Privacy acknowledgment gate.** The provider config must carry a
  `privacyAcknowledgedAt` timestamp or every request is `blocked` with
  `PRIVACY_ACK_REQUIRED`. No plan is proposed until acknowledged.
- **Resumed sessions never auto-approve.** `resume()` resets in-memory approval and returns
  `needs_confirmation`; the caller must re-confirm any create.
- **Secret scrubbing.** Free-text request and `plan.context` are redacted of secrets
  (`privacy.ts`) before being sent to the provider or persisted into sessions/results.
- **Forbidden headers.** The provider config rejects `authorization`, `api-key`,
  `x-api-key`, `cookie`, and `proxy-authorization` headers.
- **No duplicate writes.** Create operations use `maxRetries: 0` on the SDK client.
- **Host-tool confinement.** `openArtifact` / `copyToClipboard` run with `shell: false`
  and a hard-coded allowlist; file references are confined to the session artifact root
  (or explicit HTTPS URLs).

---

## 6. Configuration

### 6.1 Agent provider configuration

Persisted (non-secret only) at:

```
<APPDATA or ~/.config>/aba-payway-sdk/agent/agent-config.json
```

Example (produced by `agent setup`):

```json
{
  "version": "agent-config/v1",
  "provider": "opencode",
  "model": "x-preview-f-free",
  "capabilityMode": "strict-json-plan",
  "timeoutMs": 30000,
  "maxTokens": 8192,
  "temperature": 0.2,
  "privacyAcknowledgedAt": "2026-08-22T10:00:00.000Z"
}
```

| Field | Notes |
| --- | --- |
| `provider` | `opencode` (`https://opencode.ai/zen/v1`), `openai` (default `https://api.openai.com/v1`), `openrouter`, `nvidia`, or `custom`. |
| `baseUrl` | Required for `custom`; otherwise derived from the preset. |
| `model` | Sent as the `model` field to `/chat/completions`. |
| `capabilityMode` | `native-tools` (model emits `tool_calls`) or `strict-json-plan` (model emits a single JSON object). In strict-json mode the system prompt embeds a full tool catalog, and one automatic repair round re-asks the model with exact validation errors if its first plan is off-schema. |
| `timeoutMs` | Defaults to `30000`. Raise it for slow models (thinking models may need 120000+). |
| `maxTokens` / `temperature` / `topP` | Optional sampling passthrough; omitted from the request when unset. Set `maxTokens` explicitly for models with small server-side defaults — truncated output cannot form a valid plan. |
| `extraBody` | Optional extra top-level request-body fields merged verbatim (e.g. `chat_template_kwargs`). |
| `headers` | Optional **non-secret** headers only (e.g. `organization`). Forbidden auth headers are rejected. |
| `privacyAcknowledgedAt` | ISO-8601 timestamp. **Required** before any plan is proposed (see §5). |

**API key:** set `PAYWAY_AGENT_API_KEY` in your environment. It is read at runtime and is
never written to disk by the CLI.

> Privacy acknowledgment: set it in one step with
> `payway-sdk agent setup --acknowledge-privacy ...` or afterwards with
> `payway-sdk agent ack`. Both write `privacyAcknowledgedAt` (ISO-8601) into the config.

### 6.2 PayWay context (your merchant credentials)

The agent resolves credentials with this precedence:

```
--profile  >  PAYWAY_PROFILE  >  store.defaultProfile  >  store.activeProfile  >  env vars
```

A selected profile's credentials are authoritative and are **never** overridden by ambient
`PAYWAY_MERCHANT_ID` / `PAYWAY_API_KEY`.

> **Agent readiness gate:** the env-var fallback above is honored for *execution*, but the
> agent's capability matrix marks "PayWay context" as **missing** unless a profile is selected
> (`--profile`, `PAYWAY_PROFILE`, a default, or an active profile). Save a profile with
> `payway-sdk profiles add` + `profiles use <name>` before relying on the agent.

Environment variables (used when no profile is selected):

| Variable | Purpose |
| --- | --- |
| `PAYWAY_PROFILE` | Profile name to use. |
| `PAYWAY_MERCHANT_ID` | Merchant id. |
| `PAYWAY_API_KEY` | Merchant API key. |
| `PAYWAY_SANDBOX` | `true` → sandbox, `false` → production. |
| `PAYWAY_ENV` | `sandbox` \| `production` (overrides `PAYWAY_SANDBOX`). |
| `PAYWAY_BASE_URL` | Override the API base URL. |
| `PAYWAY_RSA_PUBLIC_KEY` | RSA public key for payment-link flows. |
| `PAYWAY_CALLBACK_URL` | Callback URL for online QR. |
| `KHQR_*` | Offline KHQR merchant configuration fields. |

> Keep `PAYWAY_AGENT_API_KEY` (the LLM key) and `PAYWAY_API_KEY` (the PayWay merchant key)
> distinct — they are different secrets for different systems.

### 6.3 On-disk layout

```
<APPDATA or ~/.config>/aba-payway-sdk/
├── profiles.json           # saved PayWay credential profiles (plaintext)
└── agent/
    ├── agent-config.json     # provider config (non-secret)
    ├── sessions/             # durable session event logs
    └── ledger/               # execution ledger records
```

All writes are atomic (`<file>.tmp` → `rename`), so a crash never corrupts an existing file.

---

## 7. The 13 agent tools (actions)

A provider-proposed plan is a list of these actions. Each is validated against a strict
schema before execution; each maps to exactly one SDK call.

| Tool | Kind | Key parameters |
| --- | --- | --- |
| `generate_online_qr` | create | `amount`, `currency`, `callbackUrl`, `lifetime?`, `paymentOption?`, `template?` |
| `generate_offline_khqr` | create | `amount?`, `currency`, `merchantRef` |
| `create_checkout_payload` | create | `amount`, `currency`, `returnUrl?`, `cancelUrl?`, `paymentOption?` |
| `create_checkout_purchase` | create | `amount`, `currency`, `returnUrl?`, `cancelUrl?`, `paymentOption?` |
| `create_payment_link` | create | `title`, `amount`, `currency`, `merchantRefNo`, `returnUrl`, `description?`, `paymentLimit?`, `expiredDate?`, `payout?` (`[{acc, amt}]`, total must equal the amount) |
| `get_payment_link_details` | read | `paymentLinkId` (the opaque Link ID from create — not the merchant ref, not the URL slug) |
| `check_transaction` | read | `transactionId` |
| `check_transaction_by_merchant_ref` | read | `merchantRef`, `requestTime?` |
| `poll_transaction` | read | `transactionId`, `interval?`, `timeout?` |
| `query_journal` | read | `query: timeline|stats|reconcile|anomalies`, optional `transactionId`, `dir`, `webhookDir` |
| `save_artifact` | local | `qrString?`, `content?`, `root?`, `name?`, `kind?` |
| `open_artifact` | local | `reference` (session artifact path or HTTPS URL) |
| `copy_to_clipboard` | local | `text` |

Create tools may be proposed with a `null` `transactionId` (a draft); the orchestrator
materializes a real `transactionId` after authorization and binds it into the executed plan.

---

## 8. Sessions, ledger & artifacts

- **Sessions** are append-only event logs (`prompt`, `plan`, `confirmation`, `tool_call`,
  `tool_result`, `error`, `artifact`, `ledger`, `cancellation`, …). Use
  `agent sessions list|export|clear` to manage them. Export is **scrubbed of secrets**.
- **Ledger** records every create action with a status lifecycle:
  `planned → confirmed → submitted → succeeded | failed | outcome_unknown`.
- **Artifacts** (QR strings, receipts, text) are written to the session artifact root with
  sanitized filenames. `open_artifact` and `copy_to_clipboard` are confined to that root
  (or an HTTPS URL) via a fixed allowlist.

---

## 9. Non-TTY / automation usage

In non-interactive mode `ask` emits a structured `AgentCommandResultV1` JSON object and sets
a non-zero exit code on `failed` / `blocked`:

```bash
payway-sdk ask "check transaction T123" --profile prod > result.json
# read-only → succeeds without --approve

payway-sdk ask "generate a QR for 3 USD" --profile prod
# → needs_confirmation (no --approve/--yolo), exit code 1
```

Status values: `succeeded`, `needs_confirmation`, `needs_clarification`, `blocked`, `failed`.
This makes the agent safe to call from scripts/CI: it will never perform a create without an
explicit approval flag.

---

## 9a. Local webhook testing (agent-friendly)

The `webhook` command group (2026-09-10) gives automation and agents a fully local receiver test loop — no gateway calls, no ABA Simulator, machine-readable envelopes:

```bash
# Send a correctly-signed fixture callback to any receiver
payway-sdk webhook trigger --url http://localhost:3000/webhooks/aba --event payment.approved --json

# Verify a body+signature pair (exit 0 valid / 1 invalid+reason) or a captured record
payway-sdk webhook verify-callback --body-file cb.json --sig "<X-PAYWAY-HMAC-SHA512>" --json
payway-sdk webhook verify-callback --record wh_xxx --json

# List captures; replay one to any URL
payway-sdk webhook list --json
payway-sdk webhook resend --record wh_xxx --to http://localhost:3000/webhooks/aba --json
```

Combine with `setup-webhook --forward-to http://localhost:3000/webhooks/aba` to exercise the app end-to-end while capturing every delivery for the journal. Fixture events: the five online-checkout statuses (HMAC-signed), `khqr.notification` and `payment-link.pushback` (both unsigned by design — verify those via check-transaction). Fixtures are synthetic: the gateway never saw the `tran_id`; never fulfill on them. Full contract: [Local Webhook Workbench](16-webhook-setup-guide.md#local-webhook-workbench).

---

## 10. Limitations & notes

- The provider adapter targets **OpenAI-compatible** `/chat/completions` endpoints
  (`native-tools` or `strict-json-plan`). Other provider shapes require a custom adapter.
- The plan must validate as `AgentPlanV1` (strict schemas) or it is rejected with
  `INVALID_PLAN` and nothing is executed.
- In `strict-json-plan` mode the model must return a **single** JSON object with no markdown
  fences or surrounding prose, or the proposal is rejected.
- `agent ack` refuses to run before `agent setup` (it never writes a partial config); use
  `agent setup --acknowledge-privacy` to configure and acknowledge in one step.
- The REPL's `:run` only re-dispatches the existing manual top-level commands; it deliberately
  blocks agent-management commands and any shell/path/URI-looking input.
- `generate_online_qr` accepts a `template` (passed to the API as `qrImageTemplate`) but the
  PayWay online-QR API has **no color parameter** — QR styling is determined by the template.
- `profiles add` is interactive-only (masked API-key prompt); it cannot be driven by piped
  stdin. Script profile creation by writing `profiles.json` directly or via the exported
  helpers in `src/config/profiles.ts`.
- The model never chooses your webhook: a plan's online-QR callback URL is deterministically
  replaced with the merchant profile's configured callback URL before execution.
- PayWay's QR API **requires** `payment_option`; the SDK sends `abapay_khqr` when you omit it.
- Provider hiccups are retried for you (429/5xx, up to 3 attempts with backoff). Persistent
  503s mean provider-side capacity — wait and retry. If plans keep failing validation after
  the automatic repair round, lower `--temperature`, raise `--max-tokens`, or use a stronger
  model.

---

## 11. Example end-to-end flows

```bash
# Sandbox QR, auto-approved
payway-sdk ask "Generate an online QR for 3 USD with callback https://example.com/cb" --yolo

# Production payment link, explicitly approved
payway-sdk ask "Create a payment link titled Invoice for 10 USD, ref INV-1, return https://example.com/done" --approve

# Read-only, no approval needed
payway-sdk ask "Check transaction T-ABC-123"

# Resume a prior session (never auto-approves)
payway-sdk ask "Now poll that transaction" --session <session-id> --yolo
```

For deeper operational detail, see the test suite (`src/__tests__/agent-*.test.ts`) and the
end-to-end coverage in `src/__tests__/agent-e2e.test.ts`.
