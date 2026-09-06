# ABA PayWay SDK Skills

31 packaged AI skill guides (`aba-payway-*`), one per PayWay workflow. Install
them for a supported coding agent:

```sh
# From a clone of the SDK repository (the package is not yet on the npm registry —
# `npx payway-sdk` would resolve to an unrelated third-party package):
npx tsx src/cli.ts skills add claude        # or: codex | opencode  (or several at once)
```

Each `aba-payway-*` directory is a self-contained AI guidance package. Five
skills bundle dependency-free `.cjs` tools under their own `scripts/`
(check-transaction: status decoder; customer-qr: KHQR decode + QR manifest;
first-payment: checkout payload builder; hash: request signer, callback
verifier, mock callbacks; transaction-by-merchant-ref: reconciliation cron) —
each SKILL.md documents its own tools. Repo-root `scripts/*.ts` probes
referenced in some guides are development-only and ship nowhere.

> **OpenCode loader caveat:** this opencode build loads skills from
> `~/.config/opencode/skills`, but the installer writes to
> `~/.opencode/skills` — copy the installed `aba-payway-*` directories to the
> former after `skills add opencode`.

## Payments

- [aba-payway-purchase](./aba-payway-purchase/SKILL.md) — signed checkout purchases, hosted checkout links, the full `generate-checkout` flag set (incl. the S1 additions), and the minutes-vs-seconds lifetime trap.
- [aba-payway-subscription](./aba-payway-subscription/SKILL.md) — recurring billing on the purchase path: `ctid` + `CITR_FIX` + `frequency`, the 26-field hash, and merchant-initiated follow-up charges.
- [aba-payway-qr](./aba-payway-qr/SKILL.md) — online KHQR generation, the 9 optional params, PNG auto-open.
- [aba-payway-offline-qr](./aba-payway-offline-qr/SKILL.md) — official ABA KHQR offline generation (no API call).
- [aba-payway-customer-qr](./aba-payway-customer-qr/SKILL.md) — Merchant Portal static QRs (Printed QR channel) + KHQR decode/CRC validator.
- [aba-payway-first-payment](./aba-payway-first-payment/SKILL.md) — route decision matrix (checkout / subscription / online QR / offline KHQR / payment link) and result handling.
- [aba-payway-payment-link](./aba-payway-payment-link/SKILL.md) — hosted payment links incl. images and split payout.
- [aba-payway-pre-auth](./aba-payway-pre-auth/SKILL.md) — card fund holds, capture (incl. with-payout), and cancellation.
- [aba-payway-payout](./aba-payway-payout/SKILL.md) — direct payouts to whitelisted beneficiaries (`{account, amount}` keys).
- [aba-payway-refund](./aba-payway-refund/SKILL.md) — refunds with pre-flight balance checks.
- [aba-payway-exchange-rate](./aba-payway-exchange-rate/SKILL.md) — live USD/KHR rates.

## Credentials on File (tokenization)

- [aba-payway-cof](./aba-payway-cof/SKILL.md) — the CoF big picture: link account, link card (both hosted-page routes), charge the stored token, §16 hash orders, error families.
- [aba-payway-link-account](./aba-payway-link-account/SKILL.md) — link an ABA account (required trio, optional app deeplink).
- [aba-payway-link-card](./aba-payway-link-card/SKILL.md) — link a card via the local signed browser form or the API's hosted page.
- [aba-payway-token-purchase](./aba-payway-token-purchase/SKILL.md) — charge a stored token (charging-flag enum, 19-field hash).
- [aba-payway-token-lifecycle](./aba-payway-token-lifecycle/SKILL.md) — renew / get details / remove, per-endpoint param shapes, the 90-day expiry helpers.
- [aba-payway-remove-account](./aba-payway-remove-account/SKILL.md) — remove a stored account token.
- [aba-payway-remove-card](./aba-payway-remove-card/SKILL.md) — remove a stored card token.

## Beneficiaries & money-out

- [aba-payway-beneficiary](./aba-payway-beneficiary/SKILL.md) — the payout whitelist: add/update payees, per-endpoint payout key shapes, seeded sandbox fixtures.
- [aba-payway-sandbox-beneficiaries](./aba-payway-sandbox-beneficiaries/SKILL.md) — the 9 seeded sandbox-only test accounts/MIDs.

## Transactions & status

- [aba-payway-check-transaction](./aba-payway-check-transaction/SKILL.md) — one-shot status checks + polling (grace periods, rate limits).
- [aba-payway-transaction-detail](./aba-payway-transaction-detail/SKILL.md) — full detail (`apv`, `bank_ref`, operations).
- [aba-payway-transaction-list](./aba-payway-transaction-list/SKILL.md) — date/amount/status windows (3-day cap, local pre-validation).
- [aba-payway-transaction-by-merchant-ref](./aba-payway-transaction-by-merchant-ref/SKILL.md) — lookups by merchant reference + reconciliation cron tool.
- [aba-payway-transaction-close](./aba-payway-transaction-close/SKILL.md) — close/void unpaid transactions (advisory in sandbox).
- [aba-payway-bulk-operations](./aba-payway-bulk-operations/SKILL.md) — `tx-batch close/check/detail` over many IDs (per-item envelopes, pacing, `--report`).

## Platform & tooling

- [aba-payway-sdk-configuration](./aba-payway-sdk-configuration/SKILL.md) — constructor options, every `PAYWAY_*` env var, `strictValidation`, the KHQR env set.
- [aba-payway-hash](./aba-payway-hash/SKILL.md) — webhook signature verification + the request-signing/verify/mock-callback tools.
- [aba-payway-journal](./aba-payway-journal/SKILL.md) — query the local transaction journal: timelines, stats, reconcile, anomalies, RCA (`journal` CLI + agent `query_journal` tool).
- [aba-payway-test-harness](./aba-payway-test-harness/SKILL.md) — the built-in mock PayWay server.
- [aba-payway-agent](./aba-payway-agent/SKILL.md) — the agentic, risk-gated CLI (provider modes, 13 tools, execution ledger).

## Agentic CLI skills

- [aba-payway-agent](./aba-payway-agent/SKILL.md) — provider modes, the 13 tools, risk gates, execution ledger, sessions, redaction, and read-only journal queries.
- [aba-payway-first-payment](./aba-payway-first-payment/SKILL.md) — QR / checkout / subscription / payment-link route decision matrix and result handling (the agentic entrypoint).

## Bundled script exit-code contract

Every dependency-free `.cjs` tool shipped under `skills/*/scripts/` follows one
contract (agents should branch on exit code, not parse stderr):

- **`0`** — the tool ran successfully. Includes informative negatives: an
  INVALID CRC verdict, `No QR detected`, unknown status codes, a reconcile run
  with no new rows.
- **`1`** — runtime/API failure at execution time (network error, HTTP error,
  non-JSON body) — printed as one clean `… failed: <message>` line, never a
  stack trace.
- **`2`** — the invocation or environment is wrong: usage errors, unknown
  preset, invalid `--status`/`--currency`/amount/lifetime, missing
  credentials.

All scripts auto-load a `.env` from the current working directory (exported
env wins) and read `PAYWAY_MERCHANT_ID` / `PAYWAY_API_KEY`.
