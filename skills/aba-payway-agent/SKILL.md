---
name: aba-payway-agent
description: Operate the agentic PayWay CLI safely — provider modes, the 11 tools, risk gates, the execution ledger, sessions, and secret redaction.
version: 1.1.0
---

# ABA PayWay Agent (Agentic CLI)

The agentic CLI lets a supported provider propose and run PayWay actions through a
risk-gated pipeline. It is the safest way to let an LLM drive PayWay: **no
side-effecting call runs unless the plan validates, is authorized, and is
materialized through the execution ledger.**

## Quick Start

```sh
# 1. Configure the provider (API key stays in the environment, never stored).
export PAYWAY_AGENT_API_KEY=sk-...
payway-sdk agent setup --provider openai --model gpt-4o --capability-mode strict-json-plan

# 2. First run must acknowledge the privacy notice, then ask.
payway-sdk ask "Generate a $3 online QR for sandbox" --yolo
```

The provider config shape (stored as plaintext, no secrets) is:

```ts
import type { ProviderConfigV1, CapabilityMode } from 'aba-payway-ts/agent';

const config: ProviderConfigV1 = {
  version: 'agent-config/v1',
  provider: 'openai',                 // 'openai' | 'openrouter' | 'nvidia' | 'custom'
  model: 'gpt-4o',
  capabilityMode: 'strict-json-plan', // 'native-tools' | 'strict-json-plan'
  privacyAcknowledgedAt: new Date().toISOString(),
};
```

## Provider capability modes

- **`native-tools`** — the provider emits tool calls directly (function calling).
  Every call is validated against the tool schemas before execution.
- **`strict-json-plan`** — the provider returns a single JSON plan of `actions`;
  the orchestrator normalizes, authorizes, and executes them one by one. This is
  the default and the most auditable mode.

Both modes funnel through the same safety pipeline; only the plan source differs.

## The 11 tools

| # | Tool | Create? | Purpose / key inputs |
|---|---|---|---|
| 1 | `generate_online_qr` | yes | Online QR via PayWay API. `amount`, `currency`, `callbackUrl`, `transactionId?` |
| 2 | `generate_offline_khqr` | yes | Local-only ABA KHQR. `amount?`, `currency`, `merchantRef` |
| 3 | `create_checkout_payload` | yes | LOCAL signed checkout payload (no network). `amount`, `currency`, `transactionId?` |
| 4 | `create_checkout_purchase` | yes | NETWORK checkout request to PayWay. `amount`, `currency`, `transactionId?` |
| 5 | `create_payment_link` | yes | Shareable link (needs RSA). `title`, `amount`, `currency`, `merchantRefNo`, `returnUrl` |
| 6 | `check_transaction` | no | Read-only status lookup by `transactionId` |
| 7 | `check_transaction_by_merchant_ref` | no | Read-only lookup by `merchantRef` |
| 8 | `poll_transaction` | no | Read-only repeated lookup (sandbox verification) by `transactionId` |
| 9 | `save_artifact` | no | Persist a produced artifact to `./payway-output` |
| 10 | `open_artifact` | no | Open a saved artifact |
| 11 | `copy_to_clipboard` | no | Copy an artifact value to the clipboard |

> `create_checkout_payload` builds a **local** signed payload; `create_checkout_purchase`
> performs the actual **network** request. Treat them as distinct tools.

## Resolved context (no ambient override)

The effective PayWay context is resolved **once** from the selected CLI profile
(`--profile` / `PAYWAY_PROFILE` / saved default / active profile). A selected
profile's credentials are authoritative; **stale ambient `PAYWAY_MERCHANT_ID` /
`PAYWAY_API_KEY` values MUST NOT override it**, and a provider plan can never
change the selected profile or environment. The context is what the executor
uses — the provider only receives a scrubbed, secret-free summary.

## Risk gates

| Invocation | Sandbox create | Production create |
|---|---|---|
| `ask ... --approve` | allowed | allowed (authorizes both) |
| `ask ... --yolo` | allowed (sandbox only) | **refused** — `--approve` required |
| `ask ...` in a TTY | interactive confirmation | interactive confirmation |
| `ask ...` in non-TTY, no flag | `needs_confirmation` — **no create** | `needs_confirmation` — **no create** |

Read-only tools (6–11) never require approval. Plans containing only read-only
actions run without a flag. A resumed session restores **no** stored approval —
it returns `needs_confirmation` and must be re-confirmed.

## Execution ledger

Every create action passes through versioned ledger records with a strict,
non-replayable lifecycle:

```
planned -> confirmed -> submitted -> succeeded | failed | outcome_unknown
```

- `planned`: created when the plan is accepted (no PayWay call yet).
- `confirmed`: a `transactionId` is generated and bound to the materialized plan.
- `submitted`: the single SDK call runs.
- terminal: `succeeded`, `failed`, or `outcome_unknown` (network/timeout — verify before retrying).

Ledger records are **never replayed**. A crash between `confirmed` and `submitted`
executes zero PayWay creates.

## Local utilities

- `payway-sdk agent doctor` — prints the capability matrix (provider connectivity,
  context, online QR, offline KHQR, checkout, payment-link RSA, artifact/session storage).
- `payway-sdk agent sessions list|export|clear` — manage sessions. `export`
  scrubs secrets; `clear all` requires `--approve` in non-TTY.
- `payway-sdk agent` (no subcommand) — interactive REPL.

## Artifacts & sessions (plaintext, local)

- **Artifacts** are written under `<cwd>/payway-output` (e.g. generated QR bundles).
- **Sessions** are stored as plaintext JSON under
  `~/.config/aba-payway-sdk/agent/sessions` (or `%APPDATA%\aba-payway-sdk\agent\sessions`).
  They are **not encrypted**.

> ⚠️ **Plaintext risk:** session files may contain prompts, plans, and
> transaction references. Restrict local filesystem access and never commit them.
> For deployed SDK use, prefer an OS/cloud secret manager or CI/CD secret
> storage; never store provider or PayWay secrets in agent config or sessions.

## Provider setup & secrets

- Configure with `payway-sdk agent setup`. The provider **API key is supplied only
  via the `PAYWAY_AGENT_API_KEY` environment variable** — it is never accepted as
  a CLI argument and never persisted.
- A privacy acknowledgement gate blocks any plan proposal until
  `privacyAcknowledgedAt` is set.

## Redaction (secrets never leave)

Secrets (API keys, HMAC hashes, merchant authorization, payment tokens, CVVs) are
redacted before anything is sent to the provider or written to a session. Only a
scrubbed, secret-free context summary is shared with the provider. Session exports
are scrubbed of secrets by design.

## Manual escape paths

Every action the agent can take maps to an original, fully-supported manual
command or SDK call. If the agentic path is unavailable or undesired, use the
underlying SDK/CLI directly — nothing is gated behind the agent. See
[aba-payway-first-payment](../aba-payway-first-payment/SKILL.md) for the manual
route-selection guide and [aba-payway-purchase](../aba-payway-purchase/SKILL.md)
for the checkout purchase contract.

## Error Handling

```ts
// Non-TTY without approval:
// { "version": "agent-command/v1", "status": "needs_confirmation", ... }
// TTY without approval:
// { "version": "agent-command/v1", "status": "blocked", ... }
// On an unknown network outcome the action reports:
// { "ok": false, "error": { "code": "OUTCOME_UNKNOWN" } }

if (result.status === 'needs_confirmation') {
  console.error('Re-run with --approve (or --yolo for sandbox) or in a TTY.');
} else if (result.status === 'blocked') {
  console.error('Privacy acknowledgement or provider setup is missing.');
} else if (result.status === 'failed' && hasOutcomeUnknown(result)) {
  console.error('Verify transaction status before retrying — outcome unknown.');
}
```

Common failures: `AGENT_NOT_CONFIGURED` (run `agent setup`), `PRIVACY_ACK_REQUIRED`
(set `privacyAcknowledgedAt`), `INVALID_PLAN` (provider returned an invalid plan),
`PROVIDER_PROPOSAL_FAILED` (provider error).

## Related Skills

- [First Payment](../aba-payway-first-payment/SKILL.md)
- [Purchase](../aba-payway-purchase/SKILL.md)
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
