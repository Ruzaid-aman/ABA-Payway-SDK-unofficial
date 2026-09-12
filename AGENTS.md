# Agent Quick Reference — PayWay CLI

Prefer the SDK CLI over editing scripts. Read `npx tsx src/cli.ts <command> --help`, formulate, validate flags, then execute.

## Canonical commands (run from repo root)

PowerShell syntax shown. On POSIX, replace `$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; ` with the inline form `NODE_TLS_REJECT_UNAUTHORIZED=0 ` (sandbox presents a self-signed cert chain).

```powershell
# Online QR: amount, currency, lifetime (seconds), template; auto tx ID + PNG + polling
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-qr -a 6.12 -c USD --lifetime 360 --template template3_color -y

# Checkout link (full purchase flag set incl. --payout --additional-params --google-pay-token --return-deeplink); -y is REQUIRED for agents
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-checkout -a 5.00 -c USD --return-url <url> -y

# One-shot status / full detail
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts check-transaction -t <id>
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts transaction-detail -t <id>

# Subscription (recurring) checkout on the purchase path: ctid + CITR_FIX + frequency
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-checkout -a 9.99 -c USD --return-url <url> --ctid customer123 --token-flag CITR_FIX --frequency 1M

# Credentials-on-file: link an ABA account (QR/deeplink arrives via callback_url), then charge the returned pwt
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts cof link-account -r req0001 -c customer123 -f CITI_FLEX --currency USD --callback-url <url>
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts cof charge -t order-0001 -a 4.50 --token <pwt> --currency USD

# COF token lifecycle: renew (account tokens only), details (request_id ONLY), remove (irreversible)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts cof token renew -r req0002 -c customer123 --token <pwt>
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts cof token details -r req0001
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts cof token remove -c customer123 --token <pwt>

# Link-card hosted page: local signed form (NO API call, urlencoded browser POST)
npx tsx src/cli.ts cof link-card-form -c customer123 -f CITI_FLEX --callback-url <url> -o link-card.html
# link-card API call: saves the hosted page to payway-output/ and opens it (TTY auto)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts cof link-card -r req0003 -c customer123 -f CITI_FLEX --callback-url <url>

# Payout beneficiary whitelist (requires RSA key) — use seeded sandbox accounts
# (500000001 etc., see `sandbox-beneficiaries`); 000999888 is NOT in the sandbox
# whitelist and live payout calls to it 403 "Payout accounts are not in whitelist"
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts beneficiary add 500000001
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts beneficiary update-status 500000001 -s 1

# Payment link with split payout (payout keys {acc, amt}; total must equal --amount)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts payment-link create -t "Invoice 1" -a 5.00 -r inv-001 --return-url <url> --payout '[{"acc":"500000001","amt":5.00}]'
# Payment-link detail by Link ID (-i ONLY — data.id from create, NOT merchant ref/slug; --json error envelope on failure)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts payment-link detail -i <link-id> --json
# Payment-link void — permanent, irreversible (prompts on TTY; -y/--json skip; PTL188 = already voided, exit 2)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts payment-link void -i <link-id> -y --json

# Transaction journal (local reads — no API call; recording is opt-in via --journal or PAYWAY_JOURNAL=1)
npx tsx src/cli.ts --journal generate-qr -a 5.00 -c USD --no-polling -y   # record one invocation
npx tsx src/cli.ts journal timeline -t <tran-id> --json                   # reconstruct one transaction
npx tsx src/cli.ts journal stats                                          # latency/retries/errors/funnel
npx tsx src/cli.ts journal reconcile --json                               # creations vs callbacks

# Webhook workbench (local only — no API call, no ABA Simulator needed)
npx tsx src/cli.ts webhook trigger --url http://localhost:3000/webhooks/aba --event payment.approved  # signed fixture
npx tsx src/cli.ts webhook verify-callback --body-file cb.json --sig "<X-PAYWAY-HMAC-SHA512>"        # exit 0 valid / 1 invalid
npx tsx src/cli.ts webhook resend --record wh_xxx --to http://localhost:3000/webhooks/aba            # replay a capture
npx tsx src/cli.ts webhook list                                           # record ids = resend/--record keys

# Soundbox QR (spec-derived, NOT live-verified — amount omitted = keypad entry on device)
npx tsx src/cli.ts request-qr -c USD --payment-option abapay --callback-url <url> [--lifetime <minutes>] -y

# Merchant self-activation (partner credentials; spec-derived, NOT live-verified)
PAYWAY_PARTNER_ID=<id> PAYWAY_PARTNER_API_KEY=<secret> npx tsx src/cli.ts self-activation new-merchant --pushback-url <url> --redirect-url <url> --register-ref req-1 --currency USD
PAYWAY_PARTNER_ID=<id> PAYWAY_PARTNER_API_KEY=<secret> npx tsx src/cli.ts self-activation credential-info --register-ref req-1
PAYWAY_PARTNER_ID=<id> PAYWAY_PARTNER_API_KEY=<secret> npx tsx src/cli.ts self-activation mc-info --merchant-key <key> --request-time <YYYYMMDDHHmmss>

# Offline knowledge base (30 topics — guides, sandbox learnings, error registry; NO API call)
npx tsx src/cli.ts docs list
npx tsx src/cli.ts docs errors-and-debugging
npx tsx src/cli.ts docs search "callback hmac"

# Machine-readable diagnostics (no API call without --live)
npx tsx src/cli.ts doctor --json
npx tsx src/cli.ts status --json
npx tsx src/cli.ts agent config --json
npx tsx src/cli.ts agent doctor --json
```

- `--json` success envelopes carry `correlationId`/`traceId` (join keys into the journal); poll timeouts on
  generate-qr/generate-checkout exit 3 (machine-visible, W5-11 fixed); create commands warn on duplicate
  tran_ids seen in the journal (`--allow-duplicate-id` to suppress). The error envelope
  (`{error:{kind,exitCode,…}}`) is a uniform contract across machine-mode commands — since 2026-09-12 it
  covers exchange-rate, payout (local validations + gateway failures), get-transactions-by-ref (new
  `--json` flag), and pre-auth complete|complete-payout|cancel; payout suppresses its banner/progress lines
  under `--json` so stdout is exactly one JSON document. `PayWayAPIError.correlationId` now joins SDK-side
  errors to the same journal cids.
- Webhook workbench (2026-09-10, P0 W-1..W-4): `webhook trigger` signs online fixtures with the shared
  `signCallbackBody` (same canonicalization as `verifyCallbackDetailed` — never duplicate); pushback/KHQR
  fixtures carry NO hash by design (their real contracts have none; verify via check-transaction).
  `setup-webhook --forward-to <url>` re-POSTs captures after store; forward failure NEVER rejects or loses
  the original callback. `webhook resend`/`verify-callback --record` read `webhook_data/` (JSON then SQLite).
  Fixtures are synthetic — the gateway never saw the tran_id.
- OpenAPI suite-coverage wave (2026-09-12, audit `.scratch/openapi-coverage-audit/`): the ABA-shared archived
  spec has 33 endpoints — we implement 28 of them (20 full + 2 partial-fixed + 6 superseded by our v3 paths);
  the 6 legacy v1 `/api/aof/*` + `v1/cof` endpoints are deliberately NOT implemented. Two spec-derived
  additions are NOT live-verified (merchant sandbox can't exercise them): `request-qr` (Soundbox QR — its
  spec b4hash is a corrupted copy-paste from generate-qr; `REQUEST_QR_HASH_FIELDS` keeps the 9 real schema
  fields in spec order; a gateway code 1 means report hash drift to ABA) and the `self-activation` trio
  (partner credentials, `requestWithPartnerAuth` — no merchant_id; HMAC is SHA256 except
  get-mc-credential-info's SHA512, per the spec's own inconsistency). Purchase `payment_option` advisory now
  uses `PURCHASE_PAYMENT_OPTIONS` (spec enum + live-verified `abapay_khqr_deeplink`/`google_pay`), not the QR
  enum. 21 spec errors (stale hash orders, malformed exchange-rate schema, …) are listed in the audit's
  fidelity-audit.md — candidates to send back to the ABA team.
- Transaction journal (audit-results/transaction-data-audit/, docs/18): opt-in JSONL record of every
  exchange/command/poll/status/artifact/callback at `<cwd>/payway-data/journal.jsonl`. `--journal` arms one
  invocation; `PAYWAY_JOURNAL=1` (+`_DIR`, `_MODE=digest|full`) persists; SDK config `journal: true|{dir,mode}`.
  Digest mode allow-lists non-secret fields (no hash/pwt/PII). Query: `journal show|timeline|stats|reconcile|explain|anomalies|prune`.
  Missing callback ≠ non-payment (PayWay never retries); PENDING ≠ alive (no EXPIRED/CLOSED status remotely).
  Backlog: `.scratch/transaction-data-journal/IMPROVEMENTS.md`.
- `payment-link create`: `--image <path>` (JPG/JPEG/PNG ≤3MB, enforced locally),
  `--no-show-qr` suppresses the TTY QR; under `--json` BOTH payment-link
  commands emit the `{ error: { kind, exitCode, … } }` envelope on any failure
  (local validation included). Full guide: `docs/17-payment-link.md`.

- `generate-qr` polls by default (`--no-polling` to disable); `--poll-timeout <s>` should match `--lifetime`.
- `-y` skips interactive prompts; PNG saves to `payway-output/<txId>.png` by default.
- QR PNG auto-opens in the OS default viewer on interactive TTYs only; agents/CI are unaffected. `--open-image` forces, `--no-open-image` suppresses. SDK helper: `openImageInDefaultViewer(path)` from `aba-payway-ts`.
- Offline/static QR: add `--offline` (no API call).
- Interactive TUI (wizard, pickers, spinners) activates only on a real TTY (stdin+stdout); agents/CI and piped/non-TTY runs keep byte-identical legacy behavior.
- `PAYWAY_UI=classic` forces the legacy output everywhere; `--no-color`/`NO_COLOR` drop ANSI colors; Ctrl-C during a prompt exits 130.
- `transaction-list --from/--to` are **gateway time UTC+7** — a UTC/local-derived window silently returns 0 rows; omit both for the full gateway day (the CLI default window is now computed on the gateway clock, shared `gatewayDayWindow()`). Paid transactions appear in the list; unpaid QR-only ones never do (§14/§20). Unpaid purchase-channel ones DO appear (campaign W2-5).
- `payment-link` pushbacks (live-verified 2026-09-06): PayWay POSTs `{tran_id, status: 0, merchant_ref_no}` (application/json, **no hash** — `verifyCallback()` does NOT apply; verify via check-transaction) to the link's `return_url`; `status` is numeric `0`, not the "00" the official sample shows. **No EXPIRED status** — expired links read OPEN + hosted page 200; enforce expiry merchant-side (create rejects past/<5-min `expired_date` with PTL04). Detail-bogus-id answers **96** (PTL132 documented but not sandbox-reproduced); PTL04 is the catch-all create rejection. Full contract: `docs/17-payment-link.md` §17.7 + SANDBOX-FINDINGS §22.
- `payment-link void` (2026-09-11, undocumented endpoint — live-verified, SANDBOX-FINDINGS §23): permanently cancels an UNPAID link (SDK `paymentLink.void(id)`, signs like detail — `merchant_auth {mc_id, id}`). **VOIDED is a real status** (detail reports it; hosted page renders invalid-data shell code 07 — customer form dead, unlike expiry). NOT idempotent: double-void → 403 PTL188 "already voided" (treat as terminal, not error); bogus id → 403 96. In MUTATION_ENDPOINTS (single-attempt transport). Don't void paid links — refund instead. Full contract: `docs/17-payment-link.md` §17.4 + SANDBOX-FINDINGS §23.
- ABA integration-team relay (2026-09-12, addendum in `audit-results/four-pillars/ABA-OPEN-QUESTIONS.md` + `docs/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md` Part 4): callbacks are SINGLE best-effort delivery, no guaranteed retry (docs/03+docs/11 wording now aligned); offline-KHQR pushback has NO signature by design (inquiry = source of truth); deep-link scheme confirmed `abamobilebank://ababank.com?type=payway&qrcode=<QR_STRING>` (SDK `buildAbaPayDeeplink()`); sandbox test cards shipped as `sandbox-test-cards` CLI / `listSandboxTestCards()`; ABA Mobile Simulator via Integration Team (PIN 1234/TEST1, docs/02); pre-auth capture window default 30 days, auto-release has NO webhook (`PRE_AUTH_DEFAULT_CAPTURE_WINDOW_DAYS`); settlement T+N merchant-specific (docs/20); chargebacks card-only (ABA PAY/KHQR/WeChat final); payouts settle immediately, and NO standard refund after payout/split; `payment_status_code` map confirmed (0/2/3/4/7, PENDING up to ~24h); hosted checkout session timeouts abapay_khqr 5 min, deeplink/cards/alipay/wechat 3 min; Google Pay online reported unavailable — advisory on `PAYMENT_OPTIONS`.

- `close-transaction`: no CLOSED status exists in any read API (keep a local `closed` flag); customer-side it kills QRs (scan refused "transaction expired") but hosted-card sessions may still pay — `docs/CLOSE-TRANSACTION-FINDINGS.md`. Lifetime expiry behaves the same remotely: expired transactions read PENDING forever, no EXPIRED status anywhere (campaign W4-1).
- `check-transaction --json` / `transaction-detail --json` / `generate-checkout --json` print a `{ "error": { kind, exitCode, message, paywayCode, … } }` envelope on failure (branch on it, not on stdout text). Since 2026-09-07 (audit F11) the `Using profile:` diagnostic goes to STDERR under `--json`/`--output json|ndjson` — stdout is exactly one JSON document; parse it directly.
- As an agent, always pass `-y` to `generate-qr`/`generate-checkout` (an interactive-looking stdin can block at the lifetime prompt with no API call) and add `--no-polling --no-open-image` for one-shot runs.
- On npm 12, every `npx tsx …` invocation emits `npm notice run …` lines on STDERR (an npx artifact, not CLI output). stdout-purity guarantees are unaffected; agents parsing stderr should ignore `npm notice` lines, or invoke the installed binary directly (`payway-sdk …` / `node dist/cli.js`).
- Knowledge base (2026-09-12): `docs list|<topic>|search` serves 30 curated topics OFFLINE from the packaged
  `knowledge/` corpus (generated by `npm run sync:knowledge` from scripts/knowledge-sources.mjs; freshness-gated
  by src/__tests__/knowledge.test.ts). `llms.txt` is the machine-readable index at the repo/package root. The
  agent's `query_knowledge` tool (14 tools) reads the same corpus, and the strict-JSON planning prompt embeds a
  sandbox-verified DOMAIN CONSTRAINTS digest. Internal dossiers (SANDBOX-FINDINGS, INTEGRATION-GAPS, …) are
  deliberately NOT packaged; never add them to the corpus.
- COF (v1.3.6, live-docs parity): `cof link-account`/`link-card` require `--request-id`, `--ctid`, `--token-flag` (CITI_FLEX|CITO_FLEX); the token result (`pwt`) arrives via `callback_url`. `cof token details` takes `--request-id` ONLY (no ctid/pwt); `cof token remove` takes `--ctid` + `--token` (no request-id) — these per-endpoint shapes are gateway-verified (SANDBOX-FINDINGS §16). `link-card` always answers with an HTML hosted form — `cof link-card` saves it to `payway-output/link-card-<request-id>.html` and exits 0 (that IS the success signal); `cof link-card-form` (SDK: `credentialsOnFile.getLinkCardFormHtml()`) renders the same signed request as a local browser form, no API call. `beneficiary` commands need `PAYWAY_RSA_PUBLIC_KEY`. JSON-or-string flags (`--items`, `--payout`, `--custom-fields`, `--additional-params`, `--return-deeplink`) accept inline JSON or plain strings. Payout keys are per-endpoint: `generate-qr --payout` and the standalone payout domain use `{account, amount}`; `generate-checkout --payout`, `cof charge --payout`, pre-auth complete-payout, and `payment-link create --payout` use `{acc, amt}` (total must equal the link/transaction amount on payment-link; wrong keys now throw `PayWayConfigError` locally on the purchase path too — W1-5). `generate-checkout --payment-gate 0` returns hosted HTML; use `checkout-form --payment-gate 0` for browser navigation or SDK `checkout.purchaseHosted()` / `purchase({ paymentGate: 0 })` for the hosted response object.

## Current state & handoff

Read `HANDOFF.md` (repo root) before starting any task: it tracks the current
release state (v1.5.0 plus unreleased DX/journal/payment-link work on local `main`), the behavior contract (lifetime minimums, empty-body guard,
private-host guard, `runCli` export, COF live-parity hash orders, advisory
`strictValidation`, …), the prioritized next items with definitions of done, and
the anti-checklist of past agent mistakes. Deep rules: `.agents/AGENTS.md`.

## Sandbox TLS caveat

The sandbox presents a self-signed cert chain → Node fetch fails with
`self-signed certificate in certificate chain`. Set `NODE_TLS_REJECT_UNAUTHORIZED='0'`
scoped to the command only (same workaround as official boilerplate). Never set it globally.

## Skills

34 packaged guides install via `npx tsx src/cli.ts skills add <agent>` (claude | codex | opencode | cursor | copilot).
The installer is target-aware (2026-09-07, audit F09): opencode installs to `~/.config/opencode/skills`
(the documented loader path), keeps a hash manifest, preserves user-modified files on upgrade
(`--force-skills` to overwrite), removes only manifest-owned dirs, and supports
`--only <skills>` bundles, `--dest <path>`, and `skills doctor --agent <name>`.
Deeper project rules live in `.agents/AGENTS.md`.

## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: the working context is `docs/` (indexed by `docs/README.md`). If a `CONTEXT.md` / `docs/adr/` layer has been created, read it per `docs/agents/domain.md` — that layer is created lazily and may legitimately be absent; proceed silently in that case.
