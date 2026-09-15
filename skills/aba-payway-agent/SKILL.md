---
name: aba-payway-agent
description: Use when operating the agentic PayWay CLI with provider modes, the 14 tools (incl. query_knowledge), risk gates, the execution ledger, sessions, local journal queries, knowledge-base search, and secret redaction.
metadata:
  version: 1.4.1
---

# ABA PayWay Agent (Agentic CLI)

The agentic CLI lets a supported provider propose and run PayWay actions through a
risk-gated pipeline. It is the safest way to let an LLM drive PayWay: **no
side-effecting call runs unless the plan validates, is authorized, and is
materialized through the execution ledger.**

## Quick Start

```sh
# 1. Configure the provider (API key stays in the environment, never stored).
#    Presets: opencode (free) | openai | openrouter | nvidia | custom
export PAYWAY_AGENT_API_KEY=sk-...
payway-sdk agent setup --provider opencode --model deepseek-v4-flash-free --capability-mode strict-json-plan \
  --max-tokens 8192 --temperature 0.2
# For NVIDIA thinking models add: --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}'

# 2. First run must acknowledge the privacy notice, then ask.
payway-sdk ask "Generate a $3 online QR for sandbox" --yolo
```

The provider config shape (stored as plaintext, no secrets; managed by
`payway-sdk agent setup` — you normally never write it by hand) is:

```ts
// ProviderConfigV1 lives in the SDK source (src/agent/contracts.ts).
// The package exports only the root entrypoint ("."), so import the
// PayWay client from 'aba-payway-ts' and manage agent config via the CLI:
//   payway-sdk agent setup --provider opencode --model deepseek-v4-flash-free \
//     --capability-mode strict-json-plan
const config = {
  version: 'agent-config/v1',
   provider: 'opencode',               // 'opencode' | 'openai' | 'openrouter' | 'nvidia' | 'custom'
   model: 'deepseek-v4-flash-free',    // rotate as the provider's catalog changes — a dead model fails with 401 "not supported"
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

## The 14 tools

| # | Tool | Create? | Purpose / key inputs |
|---|---|---|---|
| 1 | `generate_online_qr` | yes | Online QR via PayWay API. `amount`, `currency`, `callbackUrl`, `transactionId?` |
| 2 | `generate_offline_khqr` | yes | Local-only ABA KHQR. `amount?`, `currency`, `merchantRef` |
| 3 | `create_checkout_payload` | yes | LOCAL signed checkout payload (no network). `amount`, `currency`, `transactionId?` |
| 4 | `create_checkout_purchase` | yes | NETWORK checkout request to PayWay. `amount`, `currency`, `transactionId?` |
| 5 | `create_payment_link` | yes | Shareable link (needs RSA). `title`, `amount`, `currency`, `merchantRefNo`, `returnUrl`, `payout?` |
| 6 | `get_payment_link_details` | no | Read-only payment-link lookup by `paymentLinkId` (the opaque Link ID from create) |
| 7 | `check_transaction` | no | Read-only status lookup by `transactionId` |
| 8 | `check_transaction_by_merchant_ref` | no | Read-only lookup by `merchantRef` |
| 9 | `poll_transaction` | no | Read-only repeated lookup (sandbox verification) by `transactionId` |
| 10 | `query_journal` | no | Read-only local journal query: `timeline`, `stats`, `reconcile`, or `anomalies` |
| 11 | `save_artifact` | no | Persist a produced artifact to `./payway-output` |
| 12 | `open_artifact` | no | Open a saved artifact |
| 13 | `copy_to_clipboard` | no | Copy an artifact value to the clipboard |
| 14 | `query_knowledge` | no | Read-only offline knowledge base: `query: search|read` over the 31-topic PayWay corpus (`payway-sdk docs`) — pull integration guidance, error hints, and sandbox-verified lessons into a plan |

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

Read-only tools (`get_payment_link_details`, `check_transaction`,
`check_transaction_by_merchant_ref`, `poll_transaction`, and `query_journal`)
never require approval. Plans containing only read-only
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
  Every non-ready row includes a `→` fix hint pointing at the command that resolves it.
- `payway-sdk onboard` — **guided interactive setup**. Scans state, shows a
  configured/missing checklist, then runs the needed stages in order: inference provider
  (choose OpenCode Zen/OpenRouter/NVIDIA/OpenAI/Custom, model, key placement, live connectivity check) →
  PayWay merchant profile → callback URL (public HTTPS) → privacy acknowledgement. Re-prints
  the matrix before→after. In a non-TTY it emits a structured `blocked` JSON plan listing
  missing remedy ids. `--stage <name>` runs one stage; already-satisfied stages are skipped.
  Set `PAYWAY_ONBOARD_AUTO=1` to auto-launch the wizard on first unconfigured `ask`/`agent`.
- `payway-sdk agent sessions list|export|clear` — manage sessions. `export`
  scrubs secrets; `clear all` requires `--approve` in non-TTY.
- `payway-sdk journal timeline|stats|reconcile|explain|anomalies` — inspect
  opt-in transaction journal records. The agent can call the same read-only data
  through `query_journal`.
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
  a CLI argument and never persisted. On Windows, `.env` works too (the CLI loads
  it into `process.env` at startup).
- A privacy acknowledgement gate blocks any plan proposal until
  `privacyAcknowledgedAt` is set (pass `--acknowledge-privacy` on first setup).

## Setup playbook & pitfalls (field-tested)

Full notes: `payway-sdk docs agent-setup-playbook` (served offline by the CLI —
the same document previously referenced only from the SDK repository checkout).
Architecture/maintenance notes (module map, stage order, gotchas): same doc,
section "Implementation & architecture". Inspect the stored configuration any
time with `payway-sdk agent config [--json]`.

1. **Preferred path: `payway-sdk onboard`.** It runs the whole flow
   (provider → profile → callback → privacy → verify) interactively, skips
   satisfied stages, and re-prints the matrix. Use it instead of the manual
   steps below unless you are in CI/headless or need fine-grained control.
2. **Order matters:** `agent setup` → PayWay **profile** (`profiles add`) →
   public HTTPS callback → `agent doctor` all green → `ask`.
3. **`.env` credentials alone are NOT enough for the agent.** Readiness requires
   a saved profile (context source must not be `none`). `onboard` creates one
   for you; manually, use `payway-sdk profiles add`, then make it the default.
4. **`profiles add` is interactive-only** — piped stdin fails on the masked API
   key prompt. `onboard` bypasses it via the exported profile helpers
   (`addProfile`/`setDefaultProfile`/`saveProfileStore`); in scripts, write
   `%APPDATA%\aba-payway-sdk\profiles.json` directly (schema in
   `src/config/profiles.ts`).
5. **Online QR needs a PUBLIC HTTPS callback.** `.local`, `http://`, and
   localhost URLs fail validation — run `payway-sdk setup-webhook --tunnel` or
   supply a real public webhook URL.
6. **Diagnose with `agent doctor`:** provider/context/callback rows tell you
   exactly which of the three setup legs is missing (see playbook table).
6. Non-TTY creates require `--approve` (or sandbox-only `--yolo`);
   `generate_online_qr` supports `template` but has no color option.

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

Common failures: `AGENT_NOT_CONFIGURED` (run `agent setup`/`onboard`), `PRIVACY_ACK_REQUIRED`
(set `privacyAcknowledgedAt`), `INVALID_PLAN` (provider returned an invalid plan),
`PROVIDER_PROPOSAL_FAILED` (provider error).

**Diagnosing `PROVIDER_PROPOSAL_FAILED`:** the message now distinguishes causes:
- `missing API key: set PAYWAY_AGENT_API_KEY …` — key env var is empty.
- `provider request timed out after 30000ms …` — network egress to the provider is
  blocked or the model is too slow (thinking models need `--timeout` raised and
  `enable_thinking:false`); the chat request hung until the `timeoutMs` abort.
- `provider returned HTTP 401/403 …` — key rejected by the provider.
- `provider returned HTTP 503/429 …` — transient capacity limits; the adapter already
  retried 3× with backoff before surfacing this. Wait and retry.
- `provider output did not validate as an AgentPlanV1 (…) …` — the model produced an
  off-schema plan even after the automatic repair round; lower `--temperature`, raise
  `--max-tokens`, or switch to a stronger model.
In a TTY, `ask`/`agent` print a `· Contacting <provider> (<model>) to propose a plan…`
line plus per-stage progress and a remediation hint; in non-TTY the provider message is
**usually redacted** to `[REDACTED]` — but live testing (2026-09-03) showed some non-TTY
provider errors (e.g. HTTP 401 "Model … is not supported" wrapped in
`PROVIDER_PROPOSAL_FAILED`) can surface verbatim, so do not treat non-TTY output as
secret-free by contract. Diagnose interactively or via `agent doctor`; that command
reports the provider row as `blocked` when `PAYWAY_AGENT_API_KEY` is unset (it no longer
trusts the unauthenticated `/models` ping).

## Related Skills

- [First Payment](../aba-payway-first-payment/SKILL.md)
- [Purchase](../aba-payway-purchase/SKILL.md)
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)

## Direct CLI journey commands (prefer these for one-shot actions)

For single-step actions the plain CLI is faster than a plan/authorize round-trip
and shares the same credential resolution:

```sh
payway-sdk generate-qr -a 5 -y              # terminal QR; polls until paid
payway-sdk check-transaction -t <id> --json # one-shot status
payway-sdk poll-transaction -t <id> --json  # NDJSON events: poll|terminal|aborted
payway-sdk transaction-list                 # today's window, table output
payway-sdk refund -t <id> -a 2 -y           # pre-flight balance check built in
payway-sdk explain PTL36                    # decode any code offline
```

**Exit-code contract** — branch on `$?`, never on prose:
`0` success · `1` input/validation · `2` PayWay API failure · `3`
network/timeout/rate-limit. Polling reaching ANY terminal status (including
DECLINED) is `0`; read `payment_status` from the final JSON event.

Programmatic code lookups without spawning the CLI:
```sh
# The CLI is the supported surface — no subpath imports exist in package exports.
payway-sdk explain PTL36          # { family:'refund', title:'Transaction not found', hint:'...', sandboxVerified:true, evidence:'SANDBOX-FINDINGS §8/§9' }
payway-sdk explain PTL36 --json   # same object, exactly one JSON document on stdout
payway-sdk explain                # list every known code + family
```
`sandboxVerified: true` means the code's meaning was reproduced against the
live sandbox and `evidence` points into the findings ledger; codes without the
flag are spec-derived or inferred. The full registry ships as generated JSON in
the repo checkout at `docs/error-codes.json` (not in the npm package).
