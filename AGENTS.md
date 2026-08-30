# Agent Quick Reference — PayWay CLI

Prefer the SDK CLI over editing scripts. Read `npx tsx src/cli.ts <command> --help`, formulate, validate flags, then execute.

## Canonical commands (run from repo root)

```sh
# Online QR: amount, currency, lifetime (seconds), template; auto tx ID + PNG + polling
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-qr -a 6.12 -c USD --lifetime 360 --template template3_color -y

# Checkout link
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts generate-checkout -a 5.00 -c USD --return-url <url>

# One-shot status / full detail
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts check-transaction -t <id>
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx src/cli.ts transaction-detail -t <id>
```

- `generate-qr` polls by default (`--no-polling` to disable); `--poll-timeout <s>` should match `--lifetime`.
- `-y` skips interactive prompts; PNG saves to `payway-output/<txId>.png` by default.
- QR PNG auto-opens in the OS default viewer on interactive TTYs only; agents/CI are unaffected. `--open-image` forces, `--no-open-image` suppresses. SDK helper: `openImageInDefaultViewer(path)` from `aba-payway-ts`.
- Offline/static QR: add `--offline` (no API call).
- Interactive TUI (wizard, pickers, spinners) activates only on a real TTY (stdin+stdout); agents/CI and piped/non-TTY runs keep byte-identical legacy behavior.
- `PAYWAY_UI=classic` forces the legacy output everywhere; `--no-color`/`NO_COLOR` drop ANSI colors; Ctrl-C during a prompt exits 130.

## Current state & handoff

Read `HANDOFF.md` (repo root) before starting any task: it tracks the current
release state (v1.3.0), the behavior contract changes from the 2026-08-30
edge-case audit (lifetime minimums, empty-body guard, private-host guard,
`runCli` export, …), the prioritized next items with definitions of done, and
the anti-checklist of past agent mistakes. Deep rules: `.agents/AGENTS.md`.

## Sandbox TLS caveat

The sandbox presents a self-signed cert chain → Node fetch fails with
`self-signed certificate in certificate chain`. Set `NODE_TLS_REJECT_UNAUTHORIZED='0'`
scoped to the command only (same workaround as official boilerplate). Never set it globally.

## Skills

25 packaged guides install via `npx tsx src/cli.ts skills add opencode`.
NOTE (2026-08-26): the installer writes to `~/.opencode/skills`, but this opencode build loads from
`~/.config/opencode/skills` — copy the `aba-payway-*` dirs there after install.
Deeper project rules live in `.agents/AGENTS.md`.
