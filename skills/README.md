# ABA PayWay SDK Skills

35 packaged AI skill guides (`aba-payway-*`), one per PayWay workflow. Install
them for a supported coding agent:

```sh
# From a clone of the SDK repository (source-checkout command; the package is
# not yet on the npm registry — `npx payway-sdk` would resolve to an unrelated
# third-party package). From an installed package use: npm exec -- payway-sdk skills add <agent>
npx tsx src/cli.ts skills add claude        # or: codex | opencode  (or several at once)
```

For a merchant project start with [integration](./aba-payway-integration/SKILL.md), a self-contained router with public references and Express/Next.js recipe assets. For one first payment use [first payment](./aba-payway-first-payment/SKILL.md), then [webhook production](./aba-payway-webhook-production/SKILL.md). Choose only the workflow you need. The shared journey is create, verify, and fulfill once.

Each `aba-payway-*` directory is a self-contained AI guidance package. Five
skills bundle dependency-free `.cjs` tools under their own `scripts/`
(check-transaction: status decoder; customer-qr: KHQR decode + QR manifest;
first-payment: checkout payload builder; hash: request signer, callback
verifier, mock callbacks; transaction-by-merchant-ref: reconciliation cron) —
each SKILL.md documents its own tools. Repo-root `scripts/*.ts` probes
referenced in some guides are development-only and ship nowhere.

> **OpenCode note:** the installer writes to `~/.config/opencode/skills`
> (the documented loader path for current OpenCode builds). If an older
> release installed into `~/.opencode/skills`, remove it with
> `payway-sdk skills remove opencode --dest ~/.opencode/skills` and re-run
> `skills add opencode`.

## Upgrades, removal, and health checks

The installer preserves customized files, including manual installations with
no manifest. Identical files can be adopted safely; other unowned files are
reported as conflicts. Ordinary upgrades and removals delete only unchanged
manifest-owned resources. Edited retired files keep their baseline and remain
on disk; unrelated notes and scripts remain unowned.

Use `skills add codex --force-skills` to replace conflicts intentionally, or
`skills remove codex --force-skills` to delete modified **managed** files too.
Neither removal mode deletes unowned files. Full upgrades prune removed package
resources; `--only` upgrades prune only within the selected skills.

The v2 manifest records package version, baseline hashes and selection intent.
Legacy flat/v2 manifests without selection infer it from their owned skill names;
a full install explicitly selects the whole catalog. Run
`skills doctor --agent codex` after upgrading: it checks YAML, current package
hashes, missing resources and linked dependencies. An intentional partial
selection does not require the full catalog, but links to omitted skills are
reported as missing dependencies. Add those skills with another `--only` run,
or install the full catalog. `--dest <path>` applies these operations to an
explicit installation directory.

The tracked `.zcode/skills/aba-payway-*` mirror includes every guide, script and
reference. Recursive parity is checked by the offline test suite.

## Payments

- [aba-payway-purchase](./aba-payway-purchase/SKILL.md) — signed checkout purchases, hosted checkout links, the full `generate-checkout` flag set (incl. the S1 additions), and the minutes-vs-seconds lifetime trap.
- [aba-payway-subscription](./aba-payway-subscription/SKILL.md) — recurring billing on the purchase path: `ctid` + `CITR_FIX` + `frequency`, the 27-field hash (live 2026-09-05 order; the documented 26-field order is rejected with Wrong Hash), and merchant-initiated follow-up charges.
- [aba-payway-qr](./aba-payway-qr/SKILL.md) — online KHQR generation, the 9 optional params, PNG auto-open.
- [aba-payway-offline-qr](./aba-payway-offline-qr/SKILL.md) — official ABA KHQR offline generation, invoice-batch validity, repeat-payment accounting, and recovery (no generation API call).
- [aba-payway-customer-qr](./aba-payway-customer-qr/SKILL.md) — Merchant Portal static QRs (Printed QR channel) + KHQR decode/CRC validator.
- [aba-payway-first-payment](./aba-payway-first-payment/SKILL.md) — route decision matrix (checkout / subscription / online QR / offline KHQR / payment link) and result handling.
- [aba-payway-payment-link](./aba-payway-payment-link/SKILL.md) — hosted payment links incl. images, split payout, and void.
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
- [aba-payway-transaction-by-merchant-ref](./aba-payway-transaction-by-merchant-ref/SKILL.md) — recovery-safe reference policy, lookups by merchant reference, and reconciliation cron tool.
- [aba-payway-transaction-close](./aba-payway-transaction-close/SKILL.md) — close/void unpaid transactions (advisory in sandbox).
- [aba-payway-bulk-operations](./aba-payway-bulk-operations/SKILL.md) — `tx-batch close/check/detail` over many IDs (per-item envelopes, pacing, `--report`).

## Platform & tooling

- [aba-payway-sdk-configuration](./aba-payway-sdk-configuration/SKILL.md) — constructor options, every `PAYWAY_*` env var, `strictValidation`, the KHQR env set, and the machine-readable diagnostics (`doctor --json`, `status --json`, `agent config`).
- [aba-payway-knowledge-base](./aba-payway-knowledge-base/SKILL.md) — the offline knowledge base: `docs list|<topic>|search` and the agent's `query_knowledge` tool over 42 packaged topics.
- [aba-payway-hash](./aba-payway-hash/SKILL.md) — webhook signature verification + the request-signing/verify/mock-callback tools.
- [aba-payway-journal](./aba-payway-journal/SKILL.md) — query the local transaction journal: timelines, stats, reconcile, anomalies, RCA (`journal` CLI + agent `query_journal` tool).
- [aba-payway-test-harness](./aba-payway-test-harness/SKILL.md) — the built-in mock PayWay server.
- [aba-payway-agent](./aba-payway-agent/SKILL.md) — the agentic, risk-gated CLI (provider modes, 14 tools incl. `query_knowledge`, risk gates, execution ledger, sessions, redaction) — the agentic entrypoint.

## Partner onboarding

- [aba-payway-self-activation](./aba-payway-self-activation/SKILL.md) — the partner self-activation trio (`new-merchant`, `credential-info`, `mc-info`): partner credentials, RSA-encrypted `request_data`, per-endpoint HMAC lengths. Spec-derived, not live-verified.

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
