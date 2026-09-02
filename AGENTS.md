# Agent Quick Reference — PayWay CLI

Prefer the SDK CLI over editing scripts. Read `npx tsx src/cli.ts <command> --help`, formulate, validate flags, then execute.

## Canonical commands (run from repo root)

```sh
# Online QR: amount, currency, lifetime (seconds), template; auto tx ID + PNG + polling
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-qr -a 6.12 -c USD --lifetime 360 --template template3_color -y

# Checkout link (full purchase flag set incl. --payout --additional-params --google-pay-token --return-deeplink)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-checkout -a 5.00 -c USD --return-url <url>

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

# Payout beneficiary whitelist (requires RSA key)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts beneficiary add 000999888
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts beneficiary update-status 000999888 -s 1

# Payment link with split payout (payout keys {acc, amt}; total must equal --amount)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts payment-link create -t "Invoice 1" -a 5.00 -r inv-001 --return-url <url> --payout '[{"acc":"000999888","amt":5.00}]'
```

- `generate-qr` polls by default (`--no-polling` to disable); `--poll-timeout <s>` should match `--lifetime`.
- `-y` skips interactive prompts; PNG saves to `payway-output/<txId>.png` by default.
- QR PNG auto-opens in the OS default viewer on interactive TTYs only; agents/CI are unaffected. `--open-image` forces, `--no-open-image` suppresses. SDK helper: `openImageInDefaultViewer(path)` from `aba-payway-ts`.
- Offline/static QR: add `--offline` (no API call).
- Interactive TUI (wizard, pickers, spinners) activates only on a real TTY (stdin+stdout); agents/CI and piped/non-TTY runs keep byte-identical legacy behavior.
- `PAYWAY_UI=classic` forces the legacy output everywhere; `--no-color`/`NO_COLOR` drop ANSI colors; Ctrl-C during a prompt exits 130.
- COF (v1.3.6, live-docs parity): `cof link-account`/`link-card` require `--request-id`, `--ctid`, `--token-flag` (CITI_FLEX|CITO_FLEX); the token result (`pwt`) arrives via `callback_url`. `cof token details` takes `--request-id` ONLY (no ctid/pwt); `cof token remove` takes `--ctid` + `--token` (no request-id) — these per-endpoint shapes are gateway-verified (SANDBOX-FINDINGS §16). `link-card` always answers with an HTML hosted form — `cof link-card` saves it to `payway-output/link-card-<request-id>.html` and exits 0 (that IS the success signal); `cof link-card-form` (SDK: `credentialsOnFile.getLinkCardFormHtml()`) renders the same signed request as a local browser form, no API call. `beneficiary` commands need `PAYWAY_RSA_PUBLIC_KEY`. JSON-or-string flags (`--items`, `--payout`, `--custom-fields`, `--additional-params`, `--return-deeplink`) accept inline JSON or plain strings. Payout keys are per-endpoint: `generate-qr --payout` and the standalone payout domain use `{account, amount}`; `generate-checkout --payout`, `cof charge --payout`, pre-auth complete-payout, and `payment-link create --payout` use `{acc, amt}` (total must equal the link/transaction amount on payment-link). `--payment-gate` is deliberately NOT a CLI flag (browser-form POST with gate 0 answers HTML, not JSON — SDK-only via `purchase({ paymentGate: 0 })`).

## Current state & handoff

Read `HANDOFF.md` (repo root) before starting any task: it tracks the current
release state (v1.3.6), the behavior contract (lifetime minimums, empty-body guard,
private-host guard, `runCli` export, COF live-parity hash orders, advisory
`strictValidation`, …), the prioritized next items with definitions of done, and
the anti-checklist of past agent mistakes. Deep rules: `.agents/AGENTS.md`.

## Sandbox TLS caveat

The sandbox presents a self-signed cert chain → Node fetch fails with
`self-signed certificate in certificate chain`. Set `NODE_TLS_REJECT_UNAUTHORIZED='0'`
scoped to the command only (same workaround as official boilerplate). Never set it globally.

## Skills

29 packaged guides install via `npx tsx src/cli.ts skills add opencode`.
NOTE (2026-08-26): the installer writes to `~/.opencode/skills`, but this opencode build loads from
`~/.config/opencode/skills` — copy the `aba-payway-*` dirs there after install.
Deeper project rules live in `.agents/AGENTS.md`.

## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` at the repo root with `docs/adr/`. See `docs/agents/domain.md`.
