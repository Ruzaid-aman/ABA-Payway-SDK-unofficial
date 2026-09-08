# Stripe CLI & Razorpay CLI vs ABA PayWay SDK/CLI

**Prepared:** 2026-09-08
**Scope:** Public CLI documentation of Stripe (`docs.stripe.com/cli`) and Razorpay (`razorpay.com/docs/cli`, `razorpay.com/docs/cli/install-cli`), compared against the current `aba-payway-ts` repository (v1.5.0, unpublished).
**Method:** Vendor pages fetched and read directly this session; repository claims grounded in current files (`src/cli.ts`, `src/cli/commands/*`, `src/webhook/*`, `src/agent/*`, `src/test/index.ts`, `src/config/profiles.ts`, `src/cli/output.ts`, `src/journal/`).

## Executive conclusion

Both benchmarks confirm the same picture the CutLuy analysis drew: **we win on breadth, we lose on the local test loop.** Stripe's CLI is not a payments API wrapper — its core value is `listen` + `trigger` + `events resend` + `logs tail`: a developer can exercise their entire webhook-handling code path from a terminal without a real payment, a real tunnel, or the Dashboard. Razorpay's CLI is narrower (resource CRUD plus a `configure` command) but its **distribution story** (brew/scoop/deb/rpm/curl-script, per-arch binaries) and its **AI-agent surface** (`/llms.txt` docs index, a dedicated MCP server product in the docs nav) are ahead of us.

Our CLI already exceeds both on domain coverage (all 24 PayWay operations, COF/pre-auth/payout/beneficiary groups, `tx-batch`, `explain`, offline KHQR), on agent tooling (the `ask`/`agent` REPL with risk gates and execution ledger — neither vendor has anything like it), and on post-hoc analysis (`journal stats/reconcile/explain/anomalies`). The gaps that matter are concentrated in five areas: **webhook triggering/forwarding/replay, a standalone verify command, MCP distribution, docs-for-agents affordances, and install/upgrade polish.** None requires new PayWay API surface; all are local tooling we control.

## What Stripe does better

### 1. The webhook test loop is their killer feature

Stripe's CLI is organized around making webhook receivers testable without real events:

- `stripe listen --forward-to http://localhost:4242` — receives events over a direct connection to Stripe (no third-party tunnel) and **forwards them to the developer's local app**, printing a stable signing secret the app can use.
- `stripe trigger <event>` — fires a realistic example webhook event locally, built from fixture API objects, with `--override/--add/--remove/--skip/--edit` controls to shape the payload.
- `stripe events resend <event_id> --webhook-endpoint=...` — replays a past real event (last 30 days) to a live endpoint.
- `stripe logs tail` — real-time API request log tailing with filters (method, status-code class, path, IP, source).

Our `setup-webhook` ([src/webhook/server.ts](../src/webhook/server.ts), registered at [src/cli.ts](../src/cli.ts) `setup-webhook` group) is a **capture** tool: three receiver routes (online callback, KHQR notification, payment-link pushback), optional HMAC verification, JSON/SQLite storage, optional Cloudflare Tunnel, journal integration. It does **not forward** captured callbacks to the merchant's application, **cannot synthesize** an event, and **cannot replay** a stored one (the journal renders replay *markers* — [src/cli/commands/journal.ts](../src/cli/commands/journal.ts) `replay` — but nothing re-sends). And there is **no standalone `verify` command**: `verifyCallbackDetailed` exists in [src/auth.ts](../src/auth.ts) (timing-safe HMAC, failure reasons) but is only reachable programmatically or through the webhook server; the `aba-payway-hash` skill has to describe it as a library call.

Consequence: today the only way to test a receiver end-to-end is a real sandbox payment through the ABA Simulator (60–90 s latency per approval, per §18 of SANDBOX-FINDINGS). Stripe's loop is seconds and offline.

### 2. Everything has a non-interactive, agent-usable variant

`stripe login --non-interactive` prints `{ browser_url, verification_code, next_step }` as JSON and exits; the agent (or CI) runs the returned `next_step` command with `--complete=<poll-url>` after the human approves in the browser. `stripe sandbox create --non-interactive` and `agent setup --json` (dry-run of planned actions) follow the same pattern. Stripe treats "an AI coding agent is driving" as a first-class runtime, and even detects which agent it is for telemetry.

We have the inverse strength (the `ask`/`agent` REPL is itself an agent) and our `--output json|ndjson` schema with `nextAction` ([src/cli/output.ts](../src/cli/output.ts), schema v1.0) plus stderr-separated diagnostics is already agent-shaped. But the pattern is not uniform: some commands still couple their "what should I do next" guidance to human output only.

### 3. `agent setup` ships an MCP server, and Razorpay has an MCP product

`stripe agent setup` detects Claude Code / Codex / Cursor and installs a plugin, skills, **and an MCP server**. Razorpay's docs navigation lists **"Razorpay MCP Server"** as a first-class product alongside the CLI. We package 32 agent skills (installable via `skills add`) and 13 built-in agent tools in the `agent` REPL catalog — but expose **no MCP server** anywhere (grep confirms zero MCP references in `src/`). An agent in Claude/Cursor/Codex today cannot reach PayWay operations through the standard tool protocol; it must shell out to our CLI or read our skills.

### 4. Distribution, discovery, and upgrade polish

- **Install:** Stripe moved to npm as the primary channel; Razorpay ships per-arch binaries through brew, scoop, deb, rpm, and a `curl … | bash` script. We are **unpublished** (a release-gated decision, [docs/RELEASE-READINESS.md](RELEASE-READINESS.md)) and the README already warns that bare `npx payway-sdk` resolves to an **unrelated squatted package** — the bin name `payway-sdk` is a live trap until we publish.
- **Upgrade:** `stripe version` reports "A newer version of the Stripe CLI is available." We have no update check at all.
- **Completion:** `stripe completion` emits bash/zsh scripts. We have none.
- **Docs in terminal:** `stripe docs <path>`, `docs api <resource>`, `docs search <query>`. Razorpay publishes an `/llms.txt` index "to discover all available pages" for AI agents. We have 18 chapters plus deep guides — all markdown, none reachable from the CLI, no `llms.txt`.
- **`open` shortcuts:** `stripe open dashboard/webhooks` etc. We have no command that opens the ABA merchant portal or our own docs.
- **`config --set/--unset/--list/--edit` + `--project-name`:** Stripe persists preferences (color, device name, API keys) in a config file with multi-account project profiles. Our [src/config/profiles.ts](../src/config/profiles.ts) (8 named credential profiles, atomic 0o600 writes, precedence rules) is actually **stronger for credentials**; what we lack is a persisted preferences layer for UI/journal/output mode (those are env-only).
- **Global `--live` duality:** every Stripe command defaults to test mode; `--live` is an explicit per-command opt-in. We carry sandbox/production in `PAYWAY_ENV`/profiles and print `Using profile:` — the mode is visible, but there is no per-command live-mode confirmation on money-movement operations outside the agentic risk gates.

## What Razorpay does better

Razorpay's CLI is far simpler than ours — resource commands over their REST APIs (`razorpay orders create --amount 50000 --currency INR` ≡ `POST /v1/orders`), an interactive `configure` for key id/secret, test/live key prefixes. Two things are worth copying:

1. **Frictionless distribution** (see above): every OS and package manager a developer might use has a one-liner. The macOS quarantine-attribute removal step in their docs is a detail our future install docs should anticipate if we ever ship binaries.
2. **AI-surface commitment:** `/llms.txt`, an in-docs AI assistant, an MCP server, and an n8n node — they treat agent ergonomics as product surface, not documentation garnish.

## Where we are already ahead (do not regress)

| Capability | Us | Stripe | Razorpay |
|---|---|---|---|
| Full domain coverage incl. COF, pre-auth, payouts, beneficiaries, payment links | 24-op matrix, all CLI-exposed | Resources/HTTP escape hatch | 15 API families |
| Natural-language agentic CLI with risk gates, execution ledger, privacy ack | `ask`/`agent` REPL ([src/agent/](../src/agent/)) | — | — |
| Local transaction journal + RCA + anomaly detection | `journal stats/reconcile/explain/anomalies` ([src/journal/](../src/journal/)) | `logs tail` (server-side, test-mode only) | — |
| Offline/capability-free test environment | mock gateway ([src/test/index.ts](../src/test/index.ts)) + credential-free `demo` | `sandbox create` (no-account sandbox, 7-day) | — |
| Installable agent skills with hash manifest, target-aware installer, user-edit preservation | 32 skills, `skills add/doctor` | `agent setup` skills | — |
| Bulk operations | `tx-batch close/check/detail` with pacing + evidence reports | — | — |
| Error-code decoding | `explain <code>`, `status` | — | — |
| Offline QR generation with self-check | `generate-qr --offline` (+ CRC validation) | — | QR resource only |
| Gateway-aware ergonomics | UTC+7 gateway day windows, exit-code contract (3 on poll timeout), JSON error envelopes | — | — |
| Tunnel integration | `cloudflared` built into `setup-webhook` | not needed (direct connection) | — |

(Stripe's `listen` needs no tunnel because Stripe pushes over its own connection; PayWay delivers callbacks to a public `callback_url`, so our Cloudflare Tunnel integration is the correct analog and is already shipped.)

## Recommended enhancements

Ordered by leverage. Items W-1..W-4 form one coherent "webhook workbench" wave; the CutLuy analysis's P1 already proposed `webhooks test/replay/inspect` — this audit confirms that proposal against Stripe's proven design and refines it.

### P0 — close the local webhook test loop

**W-1. `setup-webhook --forward-to <url>` (Stripe `listen --forward-to`).** After capture/verification, re-POST the raw callback (original headers where meaningful) to the merchant's local app URL; keep storage and journal events; add `--forward-headers` for custom injection. Small, surgical change to [src/webhook/server.ts](../src/webhook/server.ts) + the command options. This single flag converts our capture tool into a forwarder and makes the local dev loop real: `payway-sdk setup-webhook --tunnel --forward-to http://localhost:3000/webhooks/aba`.

**W-2. `webhook trigger <event>` (Stripe `trigger`).** Synthesize a signed callback event from fixtures — `payment.approved`, `payment.declined`, `payment-link.pushback`, `khqr.notification` — signed with the merchant's sandbox API key so the receiver's `verifyCallback` passes; seed realistic bodies from a real transaction via `-t <tran-id>` or template values; honor both contract shapes (payment-link pushbacks carry **no hash**, `status` is numeric `0` — SANDBOX-FINDINGS §22 V-1). Reuses mock-harness payload shapes ([src/test/index.ts](../src/test/index.ts)). Medium effort; the payoff is testing receiver logic in seconds without the ABA Simulator. Feed it through the webhook server so `--forward-to` + `trigger` compose.

**W-3. `webhook resend <record-id> --to <url>` (Stripe `events resend`).** Replay a stored record from webhook storage (JSON or SQLite) to a URL — receiver regression testing against real captured payloads. Small; the storage layer already preserves everything needed, and the journal already tracks replay markers.

**W-4. Standalone `verify-callback` command.** One-shot hash check: `payway-sdk verify-callback --body <file|-> --signature <hash> [--json]` over `verifyCallbackDetailed` (reasons `malformed_signature`/`empty_body`/`signature_mismatch`), plus `--record <id>` to verify a captured webhook record, plus a pushback inspector (documenting the no-hash contract and pointing at `check-transaction`). This is the CLI missing from the `aba-payway-hash` skill's own guidance. Small.

### P1 — agent-surface parity

**A-1. Ship an MCP server.** `payway-sdk mcp` (stdio) exposing the existing 13-tool agent catalog (or its read-only subset plus gated mutations, reusing the same risk gates and privacy ack from the agentic path), plus `query_journal`. Both benchmarks treat MCP as product surface (Stripe installs one via `agent setup`; Razorpay lists it in the docs nav). We are already an agent-first toolkit; MCP is the standard door and we have no door. Medium-large; anchors: [src/agent/](../src/agent/) tool catalog, [src/cli/commands/agent.ts](../src/cli/commands/agent.ts).

**A-2. `docs/llms.txt` + `payway-sdk docs <topic>`.** Generate an `llms.txt` index from [docs/README.md](README.md) (Razorpay does this for AI agents; it costs an afternoon); add `payway-sdk docs <topic>` to print/page the right chapter offline and `docs search <query>` over the local corpus. Our 18-chapter corpus is a strength that is invisible to agents that don't read repos. Small.

**A-3. Uniform non-interactive pattern.** Extend the `nextAction` field and JSON envelopes so every journey command's "what to do next" is machine-visible, matching Stripe's `next_step` convention. Audit the commands where guidance is currently human-output-only.

### P1 — observability parity

**O-1. `journal watch` (Stripe `logs tail`, local-first).** Tail `journal.jsonl` as it is written — `--follow`, filters by tran id / event kind / status — pretty-rendered for humans, NDJSON with `--output`. Ours is better than Stripe's in one respect: it works in production too (the journal is local and opt-in). Small-medium.

**O-2. Global `--log-level debug|info|warn|error`.** Stripe has it; we route diagnostics via `--json`/stderr but have no verbosity control. Wire to journal/stderr diagnostic emission. Small.

### P2 — distribution and polish

**D-1. Publish, and fix the bin name first.** The npm release is already gated elsewhere ([docs/RELEASE-READINESS.md](RELEASE-READINESS.md)); this audit adds one strategic input: **the bin name `payway-sdk` is currently squatted on npm by an unrelated package**. Renaming the bin (e.g. `aba-payway`) or publishing scoped is a one-way door that must be decided **before** first publish. After npm, brew/scoop/curl-script distribution (Razorpay model) and a Docker image are derivable low-effort follow-ons; single-binary distribution is unnecessary for a Node CLI.

**D-2. Update check.** On `-V`/idle, compare `package.json` against the npm registry `latest` with a cached, non-blocking check and an opt-out env var (Stripe: "A newer version of the Stripe CLI is available."). Post-publish only. Telemetry: recommend **not** collecting usage telemetry and documenting that position — it fits our local-journal, privacy-first architecture (Stripe's opt-out exists; ours can simply be "we don't").

**D-3. `payway-sdk completion`.** Emit bash/zsh (and PowerShell — Stripe supports neither on Windows, we can) scripts generated from the commander tree. Medium.

**D-4. `payway-sdk open <shortcut>`.** `open merchant-portal`, `open docs`, `open api`, `open first-payment`. Trivial.

**D-5. `payway-sdk fixtures <file>` (Stripe `fixtures`).** Multi-step scenario runner: a JSON file of requests with `${name:json_path}` response chaining and `${.env:VAR|default}` interpolation, `expected_error_type` for negative paths, running against the mock gateway by default or sandbox with `--live`. Reuses `runCli`/mock routes; powers demo E2E, regression suites, and agent verification. Medium-large; the highest-effort item here and worth staging after the webhook wave.

**D-6. Preferences config + live-mode confirmation (propose, decide later).** `config --set/--list` for UI/journal/output prefs (credentials stay in profiles — do not duplicate); a visible sandbox/production banner on every mutating command, and consider an explicit confirmation for money-movement ops (`payout`, `refund`, `pre-auth complete-payout`) when the resolved profile is production, mirroring Stripe's test-by-default philosophy. The agentic path already has risk gates; this extends the same posture to the classic CLI.

### Explicitly not recommended

- **Browser pairing login / `sandbox create`-style provisioning** — requires PayWay-side OAuth and no-account sandbox APIs we don't have (related open asks to ABA in [audit-results/four-pillars/ABA-OPEN-QUESTIONS.md](../audit-results/four-pillars/ABA-OPEN-QUESTIONS.md)); not implementable locally.
- **Generic resource-verb CRUD (`stripe customers create`)** — PayWay's 24 operations are already fully exposed with richer, validated flag sets; generic CRUD would be a regression in ergonomics, not parity.
- **Stripe Projects/plugins** — out of scope for a payments SDK.
- **Usage telemetry** — see D-2.

## Suggested sequencing

1. **Wave 1 (webhook workbench):** W-4 (verify, smallest) → W-1 (forward) → W-3 (resend) → W-2 (trigger). One branch, each item independently shippable; all local, all testable against the existing mock gateway and storage layers.
2. **Wave 2 (agent surface):** A-2 (llms.txt + docs) → A-3 (nextAction audit) → A-1 (MCP, largest).
3. **Wave 3 (observability + polish):** O-1, O-2, D-4, D-2, D-3, D-6 as capacity allows; D-5 and D-1 track external release gating.

## Sources

- [Stripe CLI reference](https://docs.stripe.com/cli) — fetched and read in full this session (login/context/sandbox/agent setup/config/completion/docs/logs tail/open/listen/trigger/events resend/resources/get/post/delete/fixtures/projects/tools/plugins/telemetry/global flags).
- [Razorpay CLI — About](https://razorpay.com/docs/cli) and [Install](https://razorpay.com/docs/cli/install-cli) — fetched via curl and read this session (resource commands, supported API families, platforms, brew/scoop/deb/rpm/curl install, `configure`, `/llms.txt`, MCP server in docs nav).
- Current repository: `src/cli.ts` command tree, [src/cli/commands/](../src/cli/commands/), [src/webhook/](../src/webhook/), [src/agent/](../src/agent/), [src/journal/](../src/journal/), [src/test/index.ts](../src/test/index.ts), [src/config/profiles.ts](../src/config/profiles.ts), [src/cli/output.ts](../src/cli/output.ts), [docs/17-payment-link.md](17-payment-link.md) §17.6, [docs/SANDBOX-FINDINGS.md](SANDBOX-FINDINGS.md) §21/§22.
- Prior related analysis: [competitive-analysis-cutluy.md](competitive-analysis-cutluy.md) (first-payment path, `webhooks test/replay/inspect` proposal), [STRIPE-STANDARD-DX-AUDIT.md](STRIPE-STANDARD-DX-AUDIT.md) (SDK-level audit, mostly shipped).
