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
- Current repository: `src/cli.ts` command tree, [src/cli/commands/](../src/cli/commands/), [src/webhook/](../src/webhook/), [src/agent/](../src/agent/), [src/journal/](../src/journal/), [src/test/index.ts](../src/test/index.ts), [src/config/profiles.ts](../src/config/profiles.ts), [src/cli/output.ts](../src/cli/output.ts), [docs/17-payment-link.md](17-payment-link.md) §17.7, [docs/SANDBOX-FINDINGS.md](SANDBOX-FINDINGS.md) §21/§22.
- Prior related analysis: [competitive-analysis-cutluy.md](competitive-analysis-cutluy.md) (first-payment path, `webhooks test/replay/inspect` proposal), [STRIPE-STANDARD-DX-AUDIT.md](STRIPE-STANDARD-DX-AUDIT.md) (SDK-level audit, mostly shipped).

---

## The npm ecosystem we are entering (2026-09-08 survey)

> Added after the initial audit, following the user's prompt to review `npmx.dev/package-docs/aba-payway/v/0.2.2`. The npmx page is a JS-rendered mirror of the npm registry; this section is grounded in registry metadata, download stats, and the packages' own source/readmes, fetched directly this session.

### Registry landscape around our name

Checked via `registry.npmjs.org` on 2026-09-08:

| Package | Latest | Status | Description (verbatim) | Downloads (last month) |
|---|---|---|---|---|
| `aba-payway-ts` (**ours**) | 1.5.0 | **unpublished — name still free** | — | — |
| `aba-payway` | 0.2.2 | taken (Joselay, created 2026-03-01, last publish 2026-03-03) | "Type-safe TypeScript SDK for ABA PayWay — Cambodia's #1 payment gateway" | 100 |
| `aba-payway-sdk` | 0.2.35 | taken (navin_seab, personal Gmail maintainer, 32 versions, active Feb 2026) | **"Official PayWay Cambodia API SDK for Node.js"** (self-proclaimed) | 220 |
| `payway-sdk` | 1.1.1 | taken (unrelated, 2024) | "Payway SDK NODEJS ===" | — |
| `payway` | 0.1.4 | taken (unrelated, 2024) | "An unofficial client for ABA PayWay" | — |
| `aba-payway-cli` | — | **free** | — | — |

Three packages already crowd the `aba-payway*` namespace and two are direct competitors; `aba-payway-sdk` claims "Official" status from a personal account (repo `seabnavin19/payway-sdk`). Nothing has real traction (100–220 downloads/month), so the ecosystem is early and positionable.

### `aba-payway` (Joselay) — the closest technical peer

Published, zero-dependency, MIT, Node ≥18, ESM+CJS, claims Node/Bun/Deno/Cloudflare-Workers runtime support, sandbox integration tests (`tests/e2e.test.ts`, `describe.skipIf(no-credentials)`), CI badge, framework examples (Next.js/Express/Hono snippets). ~15 methods: `createTransaction` (synchronous local-signing — same philosophy as our `checkout-form`), `checkTransaction`, `listTransactions`, `getTransactionDetails`, `closeTransaction`, `getExchangeRate`, `generateQR`, `getTransactionsByRef`. Error classes: `PayWayError`/`ConfigError`/`APIError`/`HashError`. Docs: clean README param tables, sandbox test cards, companion `aba-payway-docs` repo.

**What they do better:**

- **Zero runtime dependencies** — Node built-ins only (`crypto`, native `fetch`); the HMAC helper is a 16-line `createHash`. We ship 5 runtime deps (`@clack/prompts`, `ajv`, `commander`, `qrcode`, `yaml`). For SDK-library consumers, zero-dep is a real selling point (supply-chain surface, install weight, edge-runtime compatibility).
- **Runtime breadth claimed**: Node/Bun/Deno/Cloudflare Workers. We target and document Node ≥22.12 only.
- **Publishing velocity**: 4 versions in 3 days (2026-03-01→03). We remain unpublished by policy; every unpublished week is namespace-and-mindshare time.
- **Sandbox test cards in README** — a small beginner trust signal our README lacks.

**Where they are weaker (checked against our sandbox-pinned contracts):**

- **QR lifetime unit bug**: their `generateQR` validates `lifetime` as 3–43200 **minutes** (README: "Lifetime in minutes (3–43200)"; e2e passes `lifetime: 5`). Our gateway-verified contract pins QR lifetime in **seconds** with an exact 180-second minimum (179 → HTTP 400 code `"04"`); 3–43200 minutes is the *purchase/checkout* rule. Users following their docs get a 180-second QR or a validation error.
- **close→CANCELLED claim**: their README says close makes "the payment status … `CANCELLED`". We verified no CLOSED/CANCELLED transition exists in any read API — closed transactions read PENDING forever (close-transaction dossier). A merchant coding to that README will conclude their close failed.
- **No 200-wrapped error handling**: their `request<T>` throws only on non-OK HTTP. PayWay's 200-wrapped business errors (`status.code` 6 not-found, flat `code: "429"` rate limits, legacy numeric status bodies) resolve as *success* and surface later as runtime surprises. We classify these (`PayWayBusinessError`, `PayWayRateLimitError`, `fieldErrors` maps).
- **No retry/rate-limit engine, no webhook verification**, no COF/pre-auth/payout/beneficiary/payment-link domains (≈8 API methods vs our 24-op matrix), no offline KHQR, no journal, no CLI, no agent tooling.
- **No sandbox TLS guidance** — zero mention of the self-signed chain / `NODE_TLS_REJECT_UNAUTHORIZED=0` workaround in README, examples, or e2e. We document it prominently.
- (They did get the checkout hash order essentially right, `view_type`/`payment_gate` correctly excluded — worth acknowledging.)

### `aba-payway-sdk` (navin_seab) — the "Official"-claiming competitor

32 versions since Feb 2026, still active, 220 downloads/month — currently the largest player. Ships a CLI (`bin: aba-payway-sdk`), `PayWayClient` covering QR/purchase/payment-link/detail/list/check/refund/exchange/close, and — notably — **an agent-skills installer** (`npx aba-payway-sdk skills add claude|cursor|copilot|codex|opencode`; `agent-skill`/`ai-agent` keywords). That's the same playbook as our `skills add`, same agent list. Its README claims "Official Node.js SDK for PayWay Cambodia" — false (personal Gmail maintainer, no ABA affiliation): a misrepresentation worth flagging to ABA when we coordinate positioning with the bank.

**What they do better:**

- **Published and discoverable** — 220 downloads/month vs our zero. Even a partially-wrong SDK owns the search results and the `aba-payway*` name association today.
- **Agent-skills distribution via npx** — `npx aba-payway-sdk skills add claude` works for anyone today; our skills installer requires cloning the repo and `npx tsx src/cli.ts skills add` until we publish.
- **Payment-link + refund + purchase coverage** in the core client — closer to our breadth than Joselay's.

**Where they are weaker:** the false "Official" claim; `baseUrl: 'https://api.payway.com.kh'` in the quick-start (wrong host — the gateway is `checkout.payway.com.kh` / `checkout-sandbox.payway.com.kh`); response-shape examples that don't match the documented envelope (`response.status.tran_id` on QR create, `payment_link.data.payment_link`); `expired_date: Date.now() + …` (epoch millis, where PayWay expects a date string — our payment-link work pinned the `expired_date` acceptance window); none of our sandbox-verified behavior contract (lifetime units, gateway error shapes, unpaid-visibility, UTC+7 windows) appears in their docs.

### What this changes in our recommendations

1. **Naming decision is now urgent, and `aba-payway-ts` is viable.** The name is free, specific, and unambiguous among the three crowded neighbors. The bin name is the open question: `payway-sdk` is squatted by an unrelated 2024 package, `aba-payway-sdk` is taken by the "Official" claimant, but **`aba-payway-cli` is free** (also free: `payway-sdk-ts`). Recommend bin `aba-payway-cli` — or a scoped `@<org>/payway` — decided **before** first publish, per D-1 in the main report.
2. **Counter-position explicitly against the "Official" claim.** Our README already states "community-maintained… no endorsement is claimed" — keep that honesty, and consider raising the `aba-payway-sdk` misrepresentation with ABA: an unofficial package claiming official status is a merchant-trust risk for the gateway itself, and ABA engagement could either legitimize our positioning or prompt a genuine official SDK.
3. **The zero-dependency pitch is worth partially matching.** We can't drop `commander`/`@clack` from the CLI experience, but we can (a) keep the **library** entry free of CLI-only deps — move them to `optionalDependencies` or split a future `aba-payway-cli` package — and (b) document runtime support honestly (Node ≥22.12; Bun/Deno/Workers unverified). This shrinks the install for library-only consumers and answers their sharpest marketing point without sacrificing the CLI.
4. **Their bugs are our content-marketing.** Their QR-lifetime-units and close→CANCELLED errors are exactly the gateway-contract mistakes our sandbox campaigns exist to prevent. A short "Why gateway-verified contracts matter" section in README/docs — naming the failure modes, not the competitor — turns our verification depth into a visible differentiator.
5. **Publication cadence beats perfection once unblocked.** Both competitors shipped fast with real errors; we are far more correct but invisible. Once the release blockers in [docs/RELEASE-READINESS.md](RELEASE-READINESS.md) clear, publishing early-and-often matters more than holding for completeness — namespace and search positioning accrue to the published.

### Ecosystem-section sources

- [npmx.dev/package-docs/aba-payway/v/0.2.2](https://npmx.dev/package-docs/aba-payway/v/0.2.2) (SPA mirror; registry used as source of truth)
- `registry.npmjs.org/aba-payway` (package.json, README) and `api.npmjs.org/downloads/point/last-month/aba-payway` — fetched 2026-09-08
- `github.com/Joselay/aba-payway` source: `src/client.ts`, `src/hash.ts`, `src/constants.ts`, `tests/e2e.test.ts` — fetched 2026-09-08
- `registry.npmjs.org/aba-payway-sdk` (package.json incl. maintainers, README) and downloads API — fetched 2026-09-08
- `registry.npmjs.org/payway-sdk`, `payway`, `aba-payway-ts`, `aba-payway-cli` — availability checks, 2026-09-08
- Our sandbox-verified contracts: [docs/SANDBOX-FINDINGS.md](SANDBOX-FINDINGS.md) (QR lifetime 180 s, close-transaction behavior), [docs/CLOSE-TRANSACTION-FINDINGS.md](CLOSE-TRANSACTION-FINDINGS.md), HANDOFF.md §3/§7
- Our [package.json](../package.json) dependencies; [README.md](../README.md) positioning lines

---

## Re-audit after P0 implementation (2026-09-10)

> Verdict-first: **P0 (Wave 1, W-1..W-4) is CLOSED and live-verified.** The competitive headline flipped — the "local webhook test loop" gap that was our largest deficit against Stripe's CLI no longer exists. This section records the acceptance evidence, two new P3 findings from the verification run, the refreshed gap register for Waves 2–3, and current ecosystem numbers. A concurrent offline-KHQR docs batch was in the working tree during this audit (18 files, not touched here).

### Acceptance evidence (live run, not test-suite claims)

Full end-to-end drive of the built `dist/cli.js` against real local HTTP (receiver stub + capture server in `.scratch/audit-webhook-e2e/`, evidence files preserved there):

| Leg | Command | Observed |
|---|---|---|
| W-2 signed fixture at app | `webhook trigger --url …/webhooks/aba --event payment.approved -t audit-e2e-1 --json` | `{"event":"payment.approved","signed":true,"httpStatus":200,"ok":true}` |
| **Wire-byte round-trip** | receiver-captured body+sig → `webhook verify-callback --body-file --sig` | `{"valid":true,"reason":null}` exit 0 — the *received* bytes verify, not just the sent ones |
| W-1 capture+forward | `setup-webhook --port 18443 --forward-to …` + trigger at capture route | app received forwarded copy **with signature header preserved**; capture stored (`signatureVerdict: "verified"`) |
| Storage contract | `webhook list --json` in a SQLite-store directory (json file absent) | read `callbacks.db` correctly, returned the record |
| W-3 replay | `webhook resend --record wh_mtvjz6w4_a90f7347 --to …` | re-delivered, app line count 3→4, `{"httpStatus":200,"ok":true}` |
| W-4 record verdict | `webhook verify-callback --record wh_mtvjz6w4_a90f7347 --json` | `{"verdict":"verified","matchedTransactionId":"audit-e2e-fwd1"}` |
| Negative case | `webhook verify-callback --sig "AAAAbogusAAA="` | `{"valid":false,"reason":"signature_mismatch"}` **exit 1** |
| No-hash contract | `webhook trigger --event payment-link.pushback` through capture route | wire body exactly `{tran_id, status: 0, merchant_ref_no}`, `signed:false`, no sig header, captured `unsigned` |
| Machine output | every `--json` invocation | single clean JSON doc on stdout; `Using profile:` on stderr only (F11 contract held) |

Suite state on merged `main`: **1,662 passed / 13 skipped** (38 new tests), build, `tsc --noEmit`, biome all clean. Docs propagated: docs/16 "Local Webhook Workbench" section, README, SDK-AND-CLI-REFERENCE, AGENTS.md canonical list + behavior bullet, CHANGELOG, skills v1.4.0 (hash) / v1.1.0 (webhook-production) with `.zcode` mirrors synced.

### New findings from the verification run (P3, non-blocking)

- **F-A (P3): pushback captures don't populate correlation fields.** The `/aba-payway-pushback` route stores parse metadata (`paymentLinkPushback.parsed`) but leaves `matchedTransactionId`/`matchedStatus` null, so `webhook list --json` shows pushback records without their tran_id — weaker than the online route's G8 correlation. One-line fix in `server.ts` (populate the fields from the parsed pushback); would also make `journal timeline --with-webhooks` join pushbacks by tran_id.
- **F-B (P3, docs): storage-backend asymmetry is implicit.** The capture server writes SQLite when the optional driver is present, and `webhook list/resend/verify-callback --record` read that correctly — but nothing in the CLI output tells you which backend is live. A one-line `storage: sqlite|json` field in `webhook list` output would remove the guesswork for agents.

### Remaining gap register vs Stripe/Razorpay (refreshed 2026-09-10, ordered by leverage)

| Ref | Gap | Status this audit |
|---|---|---|
| ~~W-1~~ | `listen --forward-to` analog | **CLOSED** — `setup-webhook --forward-to`, live-verified |
| ~~W-2~~ | `trigger` analog | **CLOSED** — `webhook trigger`, 7 events, signed fixtures round-trip |
| ~~W-3~~ | `events resend` analog | **CLOSED** — `webhook resend`, replays stored records |
| ~~W-4~~ | standalone verify command | **CLOSED** — `webhook verify-callback` (body mode + record mode) |
| A-1 | MCP server (`payway-sdk mcp`) | OPEN — zero MCP references in `src/`; Stripe ships one via `agent setup`, Razorpay lists one in docs nav. Largest remaining Wave-2 item |
| A-2 | `docs/llms.txt` + `docs` command | OPEN — `docs/llms.txt` absent; Razorpay publishes one; ours is an afternoon |
| A-3 | uniform machine-visible next-step (`nextAction` everywhere) | PARTIAL — new commands emit envelopes; older commands not audited for uniformity yet |
| O-1 | `journal watch` (`logs tail` analog) | OPEN — no watch/follow in journal.ts |
| O-2 | global `--log-level` | OPEN |
| D-1 | publish + bin name decision | OPEN/EXTERNAL — bin `payway-sdk` still squatted; `aba-payway-cli` still free |
| D-2 | update check | OPEN (post-publish) |
| D-3 | shell completion | OPEN |
| D-4 | `open` shortcuts | OPEN |
| D-5 | fixtures runner (multi-step) | OPEN (P2, staged after the webhook wave as planned) |
| D-6 | preferences config / live-mode confirm | OPEN (P2) |

Competitive position after Wave 1, restated: the four capabilities that made Stripe's CLI the benchmark (forward, trigger, resend, verify) now all exist here in PayWay-native form — including the two contracts Stripe doesn't have to model (no-hash pushbacks, unsigned KHQR notifications) that we handle explicitly. Our remaining differentiator gaps are distribution-facing (MCP, llms.txt, publication), not capability-facing.

### Ecosystem refresh (2026-09-10)

- `aba-payway`: **88 downloads/month** (was 100 on 2026-09-08) — flat-to-declining, no new versions since 0.2.2 (2026-03-03).
- `aba-payway-sdk`: **218 downloads/month** (was 220) — flat; "Official" claim unchanged; still the volume leader by a small margin.
- `aba-payway-ts` (ours): name still free; still unpublished (release-gated).
- Working-tree note: a concurrent agent's offline-KHQR billing-guidance batch (docs + skills v1.5.0/v1.4.0 + a `--lifetime` help clarification) was in flight during this audit; it does not interact with the webhook workbench surface.

### Re-audit sources

- Live run evidence: `.scratch/audit-webhook-e2e/evidence-{app-received,capture-log,wire-body}*` (receiver-appended JSONL of received wire bodies, capture server log, the exact verified body)
- Suite counts: `npx vitest run` on merged `main` post-merge (1,662/13 skipped) — HANDOFF anti-checklist build-before-suite observed
- `api.npmjs.org/downloads/point/last-month/{aba-payway,aba-payway-sdk}` — 2026-09-10
- Gap-register greps: `webhook --help` (dist), `PAYWAY_WEBHOOK_DIR` storage resolution, MCP/llms.txt/watch/log-level/completion/update-check scans over `src/`
