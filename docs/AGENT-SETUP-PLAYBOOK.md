# Agent Setup Playbook — Field Notes (2026-08-24)

Lessons from a live end-to-end bring-up of the agentic PayWay CLI on Windows
(PowerShell). Read this before configuring `payway-sdk agent` from scratch.

> **These steps are now automated.** `payway-sdk onboard` runs this whole sequence in one
> interactive wizard (scans state → configures inference provider with a live connectivity check
> → saves the PayWay profile → validates the callback URL → acknowledges privacy → re-prints the
> capability matrix). Use the manual steps below only for CI/headless or fine-grained control.

## The 5-step working path

```powershell
# 1. LLM provider config (non-secret) — key goes in env, NOT in any file
node dist/cli.js agent setup --provider nvidia --model <model> --capability-mode strict-json-plan --acknowledge-privacy
$env:PAYWAY_AGENT_API_KEY = "nvapi-..."        # session-only; or persist via .env / user env

# 2. PayWay merchant profile — REQUIRED for agent mode (.env alone is not enough)
node dist/cli.js profiles add                  # interactive; see "profiles add pitfall" below
node dist/cli.js profiles list                 # verify default profile exists

# 3. Public HTTPS callback — REQUIRED for online QR
node dist/cli.js setup-webhook --tunnel        # auto URL via Cloudflare Tunnel
#    ...or set PAYWAY_CALLBACK_URL=https://<public-host>/aba-payway-webhook in .env

# 4. Verify
node dist/cli.js agent doctor

# 5. Interact
node dist/cli.js ask "generate an online QR for 3 USD" --approve   # non-TTY
node dist/cli.js agent                                             # REPL
```

## Reading `agent doctor`

| Row | Meaning | Fix |
|---|---|---|
| Provider connectivity `unverified` | No agent config at all | Run `agent setup` |
| Privacy acknowledgment `missing` | Plans will be refused | Add `--acknowledge-privacy` or run `agent ack` |
| PayWay context `missing` | **No saved profile** (`source: none`) — `.env` fallback does not count for the agent | `profiles add` + set default |
| Online QR callback `invalid` | Callback set but not a **public** HTTPS URL (`.local`, `http://`, localhost all fail) | Real public URL or `setup-webhook --tunnel` |
| Online QR callback `missing` | No `PAYWAY_CALLBACK_URL` | Set one |
| Offline KHQR `missing` | Optional; needs ABA KHQR merchant fields | Skip unless static KHQR needed |

Note: Checkout / Payment-link RSA can show `ok` from `.env` values even while
"PayWay context" is `missing` — those rows only check that credentials are
non-empty, not that they come from an explicit profile. Fix context first;
the executor uses resolved-profile credentials once a profile exists.

## Where state lives (Windows)

```
%APPDATA%\aba-payway-sdk\profiles.json          # PayWay credential profiles (plaintext)
%APPDATA%\aba-payway-sdk\agent\agent-config.json # provider/model/mode/privacy (no secrets)
%APPDATA%\aba-payway-sdk\agent\sessions\         # REPL/session history (plaintext, scrubbed)
%APPDATA%\aba-payway-sdk\agent\ledger\           # execution ledger records
<cwd>\.env                                       # PAYWAY_AGENT_API_KEY may live here (cli.ts loads it)
<cwd>\payway-output\                             # generated artifacts
```

The provider API key is read **only** from `process.env.PAYWAY_AGENT_API_KEY`
(`src/agent/provider.ts`). It cannot be stored in any JSON — forbidden headers
and secret-shaped fields are rejected on write (`src/agent/config.ts`).

## Known pitfalls

1. **`profiles add` is interactive-only.** It uses readline with masked input;
   piped stdin does not survive it. Workarounds:
   - Run it in a real terminal, or
   - Write `%APPDATA%\aba-payway-sdk\profiles.json` directly (schema in
     `src/config/profiles.ts`: `{ version: 1, defaultProfile, profiles: [...] }`),
     or script it with the exported helpers (`loadProfileStore`,
     `addProfile`, `setDefaultProfile`, `saveProfileStore`).
2. **`.env` alone fails agent readiness.** `resolvePayWayContext`
   (`src/agent/context.ts`) requires `source !== 'none'`, i.e. a selected,
   default, or active *profile*. `.env` values are used only when no profile is
   found — and readiness marks context `missing`.
3. **Multiline RSA PEM in profiles.json** must be stored as a single JSON string
   with `\n` escapes; copy it from `.env` including begin/end lines.
4. **Non-TTY `ask` never creates payments without `--approve`** (or `--yolo`
   for sandbox-only). This is by design; expect `needs_confirmation` otherwise.
5. **Online QR has no color option.** `generate_online_qr` accepts `template`
   (mapped to `qrImageTemplate`, `src/agent/tools.ts`) but the PayWay API has no
   per-QR color parameter.
6. **`dist/` is fully bundled** (tsup chunks) — you cannot `import
   './dist/config/profiles.js'`; import from source paths or replicate the JSON
   schema.
7. **PowerShell inline `node -e "..."` breaks** on `$` and quotes. Write a temp
   `.mjs` file instead.

## Suggested DX improvements (backlog)

- `profiles add --non-interactive --name X --env sandbox --merchant-id ... --api-key-env VAR`
  so CI/agents can create profiles without a TTY. **Status:** superseded by
  `payway-sdk onboard`, which creates profiles programmatically (see below).
- `agent doctor --json` for machine-readable readiness output. **Status:** the
  non-interactive `onboard` already emits a structured `blocked` JSON plan with
  missing remedy ids; doctor itself stays human-readable with `→` fix hints.
- Have `agent doctor` offer to run `setup-webhook --tunnel` when the callback
  row is missing/invalid. **Status:** done — the callback stage in `onboard`
  validates the URL and points at `setup-webhook --tunnel` in its skip note.

---

## Implementation & architecture (added 2026-08-24)

`payway-sdk onboard` was implemented to automate the entire setup flow. Key
facts for anyone maintaining or extending it:

### Module map
| File | Role |
| --- | --- |
| `src/agent/onboarding/remedies.ts` | `RemedyId` catalog + `REMEDIES` (fix text + wizard stage). Single source of truth for "how to fix" a capability. |
| `src/agent/onboarding/scan.ts` | `scanOnboardingState(env)` — pure read of config/key/profile/callback/KHQR/privacy. No side effects, fully unit-testable. |
| `src/agent/onboarding/stages.ts` | The stage machine: `pendingStages(snapshot)`, `runStage(name, ctx)`, `StageContext` (DI: `io` + `checkProviderConnectivity`). All side effects are injected. |
| `src/cli/commands/onboard.ts` | Commander registration + `@clack/prompts` IO (`ClackOnboardingIO`), non-TTY JSON path, `.env` write helper, first-run `maybeAutoOnboard`/`onboardingHintText`. |
| `src/agent/readiness.ts` | `evaluateReadinessDetailed()` is the canonical matrix (state + label + detail + `remedyId`); `evaluateReadiness()` is a thin backward-compatible wrapper. `doctor` and `onboard` both consume the detailed version. |

### Stage order
`pendingStages()` returns `['provider', 'profile', 'callback', 'privacy', 'verify']`
(satisfied stages omitted). Provider runs **first** on purpose: it enables
agentic guidance before PayWay credentials are entered.

### Gotchas for maintainers
1. **`@clack/prompts` is a runtime dependency** (`package.json`, `^1.7.0`). Use
   it for any new interactive CLI UX rather than hand-rolled readline.
2. **`CapabilityState` now includes `'blocked'`** (added for the doctor provider
   row when connectivity is refused). Don't assume the old 4-value union.
3. **`updateAgentConfig` seed default model is `gpt-4o`** (was `''`). This lets
   `agent ack` / privacy stage work standalone without tripping the minLength
   schema. Don't revert to `''`.
4. **`.env` writes refuse to overwrite an existing key.** `appendEnvVar` throws
   if a non-empty `KEY=` line already exists — it only appends or no-ops when the
   value matches. To change a key, edit `.env` manually.
5. **`onboard`'s profile stage bypasses `profiles add`** — it calls
   `addProfile`/`setDefaultProfile`/`saveProfileStore` directly (the interactive
   `profiles add` is still brittle with piped stdin; see pitfall #1 above).
6. **Biome lint forbids non-null assertions (`!`).** Use `as RemedyId` casts or
   optional chaining (`?.`) instead. `readiness.ts` uses a `pick(id)` helper for
   this reason.
7. **`ResolvedPayWayContext` lives in `src/agent/context.ts`**, NOT
   `contracts.ts` — import from the right place (tests caught this).
8. **Tests isolate state via `process.env.APPDATA` = temp dir** + clear
   `PAYWAY_*` env vars in `beforeEach`. Stage tests inject a fake `OnboardingIO`
   and a stub `checkProviderConnectivity` so no network is touched.
9. **Non-TTY `onboard` returns exit code 1** with a `blocked` JSON result — safe
   for scripts/CI; it never prompts.
10. **Provider errors are surfaced, not swallowed.** `provider.ts` now distinguishes a
    fetch `AbortError` (timeout) from a network failure (`PROVIDER_PROPOSAL_FAILED` →
    "provider request timed out after 30000ms …") and the `ask`/`agent` TTY paths print a
    "Contacting `<provider> (<model>)` to propose a plan…" line plus a remediation hint
    (verify `PAYWAY_AGENT_API_KEY`, run `agent doctor`). Note: non-TTY `ask` redacts the
    provider error message as `[REDACTED]` for safety — the TTY path shows the real text.
11. **`agent doctor` provider row now reports `blocked` when `PAYWAY_AGENT_API_KEY` is
    unset** (it checks key presence before the `/models` ping). Previously `/models` returned
    200 without auth, so doctor falsely reported connectivity `ok`. A set-but-invalid key still
    pings `/models` as ready — actual `/chat/completions` failures only surface at `ask` time,
    so always treat a `PROVIDER_PROPOSAL_FAILED` at runtime as "check the key + egress".
12. **The `payway-sdk` bin is only on PATH after `npm link` or a global install.** From a
    source checkout, invoke `node dist/cli.js <command>` (or `npx payway-sdk`); running bare
    `payway-sdk` in a fresh terminal fails with "not recognized".
13. **The strict-JSON system prompt MUST embed the tool catalog.** The original prompt said
    `<tool_name>` without listing tools, so every model invented tool names (`generate_qr`,
    `generateQrCode`) and failed plan validation. `buildStrictJsonSystemPrompt()` now derives a
    TOOL CATALOG from the same definitions as `buildToolSchemas()` (single source of truth), and
    the one-round repair feedback repeats the exact valid names.
14. **Model-supplied URLs are never authoritative.** Models invent placeholder callback URLs;
    `normalizePlan` deterministically overrides `generate_online_qr`'s `callbackUrl` with the
    resolved merchant profile's URL when present. Do not remove this override.
15. **PayWay's QR API requires `payment_option`.** The sandbox returns
    `400 The given data was invalid` when it is omitted (older responses accepted it).
    `src/domains/qr.ts` defaults it to `abapay_khqr`; keep that default.
16. **Local artifact tools cannot consume same-plan outputs.** `save_artifact` chained after
    `generate_online_qr` in one plan is rejected by prevalidation (`INVALID_LOCAL_ACTION`) because
    the QR does not exist yet. The prompt now forbids this; do not loosen the prevalidation.
17. **Sampling passthrough exists for weak/free models.** `agent setup --max-tokens/--temperature/
    --top-p/--extra-body`. Set `--max-tokens` explicitly (server defaults can truncate plans),
    prefer `--temperature 0.2`–0.5 for schema adherence, and use `--extra-body '{"chat_template_kwargs":
    {"enable_thinking":false}}'` on NVIDIA thinking models — thinking mode multiplies latency 10×+.
18. **Exit codes are the agent's decision surface.** Every CLI command returns
    `0` success / `1` input-validation / `2` PayWay API failure / `3`
    network-timeout-ratelimit. Polling that reaches ANY terminal status
    (even DECLINED) is `0` — read `payment_status` from the final `--json`
    event instead of guessing from the exit code alone. Never collapse these
    categories when adding commands.
19. **Prefer direct CLI over a plan round-trip for one-shot actions.**
    `check-transaction`, `poll-transaction --json`, `transaction-detail`,
    `transaction-list`, `close-transaction -y`, `refund -y`, and `explain`
    resolve profiles identically to agent tools and skip LLM latency entirely.
    Reserve `ask` for multi-step or fuzzy-intent journeys. Decode unknown
    codes programmatically via `explainPayWayCode()` (`aba-payway-ts/cli/explain-code.js`).
20. **`doctor --live` gates on credential rows, not cosmetic ones.** Framework
    detection fails in non-framework repos (including this SDK repo) by design;
    the live exchange-rate probe and final verdict ignore it. When adding new
    doctor checks, prefix purely informational ids with something other than
    `env-` so they stay advisory.

### Where agent-mode knowledge lives (for coding agents)
- `skills/aba-payway-agent/SKILL.md` (v1.1.0) — onboarding command reference +
  setup playbook/pitfalls. This is what a coding agent should load to set up the
  profile or pick tools efficiently.
- This playbook documents the manual path + architecture; prefer `onboard` for
  interactive use and the manual steps only for CI/headless/fine-grained control.
