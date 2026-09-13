# CLI Command-Surface Inventory (Pass 1 — CLI-EXTRACTOR)

**Repo:** `D:\Antigravity_google\SDK-prepration` · **CLI entrypoint:** `src/cli.ts` · **SDK version:** 1.5.0
**Method:** live `npx tsx src/cli.ts --help` runs (top level, every group, every subcommand) cross-checked against `src/cli.ts`, `src/cli/commands/`, `src/cli/journal-cli.ts`, `src/cli/flows/`, `src/domains/`, `src/client.ts`, `src/constants.ts`, and the SDK's local schema (`src/types.ts`). All help runs were local-only (no API calls).

Endpoint constants live in `src/constants.ts` (ENDPOINTS map, lines 7–28); request-body construction per domain in `src/domains/`; every CLI command registration lives in `src/cli.ts` plus `src/cli/commands/{agent,journal,webhook,skills,...}.ts`.

---

## 1. Command Tree

```
payway-sdk (src/cli.ts)
├─ Setup
│  ├─ init                     Initialize PayWay integration in the current project
│  ├─ doctor                   Validate environment configuration and connectivity
│  ├─ config                   Display loaded configuration and validate env vars
│  ├─ profiles                 Manage saved sandbox/production credential profiles
│  │  ├─ add                   Interactively add a credential profile (max 8)
│  │  ├─ list                  List saved profiles without exposing secrets
│  │  ├─ use <name>            Set the default profile
│  │  ├─ current               Show the selected default profile
│  │  └─ remove <name>         Remove a saved profile
│  └─ onboard                  Guided setup: config scan, provider + profile, readiness
├─ Payments
│  ├─ generate-qr              Generate a QR code (online via PayWay API or offline)
│  ├─ generate-checkout        Create a PayWay checkout (purchase path) + optional QR PNG
│  ├─ cof                      Credentials-on-file group
│  │  ├─ link-account          Link an ABA account for COF payments
│  │  ├─ link-card             Link a card for COF payments (hosted page via API)
│  │  ├─ link-card-form        Generate the hosted card-link HTML form (LOCAL, no API)
│  │  ├─ charge                Submit a COF payment against a linked token
│  │  └─ token                 COF token lifecycle group
│  │     ├─ renew              Renew an expired/expiring ACCOUNT token
│  │     ├─ details            Retrieve stored-token details (request_id only)
│  │     └─ remove             Remove a linked account/card token (irreversible)
│  ├─ checkout-form            Generate the hosted-checkout HTML form (LOCAL, no API)
│  ├─ payment-link             Payment links group (requires RSA credentials)
│  │  ├─ create                Create a shareable payment link via the PayWay API
│  │  └─ detail                Get the status/details of a payment link (by link id)
│  ├─ setup-webhook            Start a local webhook listener for PayWay callbacks
│  └─ webhook                  Local webhook workbench group (LOCAL)
│     ├─ verify-callback       Verify an HMAC callback signature, or a captured record
│     ├─ list                  List captured webhook records
│     ├─ resend                Re-POST a captured webhook record to a URL
│     └─ trigger               Send a signed fixture callback to a URL
├─ Transactions
│  ├─ check-transaction        Check the payment status of a transaction
│  ├─ poll-transaction         Poll a transaction until terminal status
│  ├─ transaction-detail       Get full detail for one transaction
│  ├─ transaction-list         List transactions in a time window (gateway UTC+7)
│  ├─ get-transactions-by-ref  Get up to 50 transactions by merchant reference
│  ├─ close-transaction        Void/close an open transaction before it is paid
│  └─ tx-batch                 Run one transaction op (close|check|detail) over many IDs
├─ Money-out
│  ├─ refund                   Refund a captured transaction (pre-flight balance check)
│  ├─ payout                   Send a payout / split-payout to whitelisted beneficiaries
│  ├─ pre-auth                 Pre-authorization group
│  │  ├─ complete              Complete (capture) a pre-authorization
│  │  ├─ complete-payout       Complete pre-auth + push funds to beneficiaries in one call
│  │  └─ cancel               Cancel (void) an open pre-authorization
│  └─ beneficiary              Payout beneficiary whitelist group (requires RSA key)
│     ├─ add <payee>           Add a payout beneficiary to the merchant whitelist
│     └─ update-status <payee> Update a payout beneficiary whitelist status
├─ Reference
│  ├─ status                   Display payment status + refund error codes reference
│  ├─ explain [code]           Decode a PayWay error/status code (no credentials)
│  ├─ validate                 Validate a refund amount or transaction ID locally
│  ├─ exchange-rate            Fetch the current USD/KHR exchange rate from PayWay
│  └─ sandbox-beneficiaries     List seeded sandbox beneficiary accounts (SANDBOX ONLY)
├─ Agent & skills
│  ├─ ask <request>            Ask the PayWay agent to perform a request (single shot)
│  ├─ agent                    Agentic PayWay CLI (REPL when run without a subcommand)
│  │  ├─ setup                 Configure the agent inference provider
│  │  ├─ doctor                Print the agent capability matrix
│  │  ├─ ack                   Acknowledge the provider privacy notice
│  │  ├─ sessions              Manage agent sessions
│  │  │  ├─ list               List saved agent sessions
│  │  │  ├─ export <id>        Export a session to JSON (scrubbed)
│  │  │  └─ clear <id|all>     Clear a session / all sessions (needs --approve in non-TTY)
│  │  └─ ledger                Inspect the execution ledger (create-action lifecycle)
│  │     ├─ recover            List unfinished executions for a session
│  │     └─ prune              Delete FINISHED execution records older than a cutoff
│  ├─ skills                   Manage AI skill guides for coding agents
│  │  ├─ add <agents...>       Install skills for one or more agents
│  │  ├─ remove <agents...>    Remove unchanged managed resources
│  │  ├─ list                  Show installed skills per agent
│  │  └─ doctor                Verify installation health
│  ├─ demo                     Run a credential-free simulated payment journey (localhost)
│  └─ test                     Run the PayWay sandbox test suite (local mock server)
└─ Other
   └─ journal                  Query the local transaction journal (LOCAL)
      ├─ show                  Show recent journal events
      ├─ timeline              Reconstruct the history of one transaction
      ├─ prune                 Delete journal events older than a cutoff
      ├─ reconcile             Join journal creations with webhook captures
      ├─ stats                 Aggregate analytics (latency, retries, funnel)
      ├─ explain               Root-cause narrative for one transaction
      └─ anomalies             Detect error spikes, retry bursts, latency outliers
```

Global options on the root program: `-V/--version`, `--profile <name>` (use a saved credential profile), `--no-color`, `--journal` (record command + every API exchange to `<cwd>/payway-data/journal.jsonl`), `-h/--help`. Exit codes: 0 success · 1 input/validation · 2 PayWay API failure · 3 network/timeout/rate-limit.

---

## 2. Leaf Commands — Local vs Remote, Key Flags

**Leaf-command census: 68 total** (26 top-level leaves + 42 group-subcommand leaves), split:
- **23 unconditional remote** (always call the PayWay gateway when invoked)
- **3 dual-mode** (`generate-qr`: remote online / local `--offline`; `tx-batch`: remote ops / local `--dry-run`; `doctor`: local check / remote round-trip with `--live`)
- **2 agent-mediated** (`ask`, bare `agent` REPL — talk to a local inference provider; may execute remote PayWay operations indirectly behind risk gates)
- **40 pure local** (never call the PayWay gateway)

"Remote" = calls the PayWay gateway (sandbox/production base URL) through the SDK; "Local" = no gateway API call (local-only computation, file I/O, local HTTP servers, or an HTTP call to a user-provided/inference URL, never PayWay).

### 2.1 Payment-creation leaf commands (remote unless noted)

| Leaf command | Local/Remote | Key flags → gateway request field (endpoint) |
|---|---|---|
| `generate-qr` (online mode) | **Remote** — POST `/api/payment-gateway/v1/payments/generate-qr` (`ENDPOINTS.generateQr`) | `-a/--amount` → `amount` (required online); `-c/--currency` → `currency` (USD\|KHR); `-t/--transaction-id` → `tran_id` (auto `qr…`); `--callback-url` → `callback_url` (base64, **required online**); `--payment-option` → `payment_option` (default `abapay_khqr`; validated against `PAYMENT_OPTIONS`: `cards, abapay_khqr, abapay_khqr_deeplink, alipay, wechat, google_pay`); `--template` → `qr_image_template` (default template2); `--lifetime <s>` → `lifetime` (whole minutes, min 180s); `--first-name/--last-name/--email/--phone` → `first_name/last_name/email/phone`; `--items` → `items` (base64, max 500 chars/10 items); `--return-deeplink` → `return_deeplink` (base64); `--custom-fields` → `custom_fields` (base64); `--return-params` → `return_params`; `--payout` → `payout` (base64; keys `{account, amount}`); hash fields pinned by `GENERATE_QR_HASH_FIELDS` (`src/domains/qr.ts:36`). **`purchase_type` is NOT a CLI flag on this path** (domain default `purchase`, see Finding f). |
| `generate-qr --offline` | **Local** | No API call; builds official KHQR payload locally via `payway.khqr.generateOfflineQR()` (`src/khqr-offline.ts`); `--ref` → merchant reference (required offline); `-a/--amount`, `-c/--currency` only. |
| `generate-checkout` | **Remote** — POST `/api/payment-gateway/v1/payments/purchase` (`ENDPOINTS.purchase`) | `-a/--amount` → `amount` (required); `-c/--currency` → `currency`; `-t/--transaction-id` → `tran_id`; `--payment-option` → `payment_option` (default `abapay_khqr_deeplink`; **not validated against PAYMENT_OPTIONS on this command** — free string, contrast with generate-qr); `--payment-gate <0\|1>` → `payment_gate`; `--callback-url` → `callback_url`; `--return-url`/`--cancel-url` → `return_url`/`cancel_url` (base64); `--ctid` → `ctid`; `--token-flag` → `token_flag` (purchase path: `CITR_FIX` only); `--frequency` → `frequency` (1W\|1M\|2M); `--type` → `type` (purchase\|**pre-auth**); `--firstname/--lastname/--email/--phone` → `firstname/lastname/email/phone`; `--items` → `items` (base64); `--shipping` → `shipping`; `--lifetime <min>` → `lifetime` (min 3, max 43200); `--custom-fields` → `custom_fields`; `--return-params` → `return_params`; `--skip-success-page` → `skip_success_page`; `--view-type` → `view_type` (hosted_view\|popup); `--continue-success-url` → `continue_success_url`; `--payout` → `payout` (keys `{acc, amt}`); `--additional-params` → `additional_params`; `--google-pay-token` → `google_pay_token` (required when `--payment-option google_pay`); `--return-deeplink` → `return_deeplink`; hash order: `request_time.merchant_id.tran_id.amount.currency.items.ctid.pwt.…purchase_type.…` (`src/client.ts:567`). |
| `checkout-form` | **Local** | Local HMAC signing; renders signed HTML form for browser POST — no API call. Same purchase flags (`-a` required, `-c`, `-t`, `--payment-option` omit→all options, `--payment-gate`, `--return-url`, `--cancel-url`, `--skip-success-page`, `--continue-success-url`, `--firstname/--lastname/--email/--phone`, `--auto-submit`, `--popup`, `-o/--out`); `--allow-duplicate-id` accepted for compat (never submits). |
| `cof link-account` | **Remote** — POST `/api/payment-credential/v3/aof/link-account` (`ENDPOINTS.linkAccount`) | `-r/--request-id` → `request_id` (required, 5–24 chars); `-c/--ctid` → `ctid` (required, 5–24 alnum); `-f/--token-flag` → `token_flag` (required; `CITI_FLEX\|CITO_FLEX`); `--currency` → `currency` (USD\|KHR, gateway-required); `--callback-url` → `callback_url`; `--return-deeplink` → `return_deeplink` (hash position; JSON or string). Hash: `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency`. The `pwt` token arrives via the callback. |
| `cof link-card` | **Remote** — POST `/api/payment-credential/v3/cof/link-card` (`ENDPOINTS.linkCard`) | `-r/--request-id` → `request_id` (required); `-c/--ctid` → `ctid` (required); `-f/--token-flag` → `token_flag` (required; CITI_FLEX\|CITO_FLEX); `--currency` → `currency`; `--frequency` → `frequency` (1W\|1M\|2M); `--callback-url` → `callback_url`; `--continue-success-url` → `continue_success_url`; returns hosted HTML (saved to `payway-output/link-card-<request-id>.html`, exit 0 IS success); `--open-page/--no-open-page` local viewer behavior. |
| `cof link-card-form` | **Local** | No API call — renders the same signed request as a local browser form (`credentialsOnFile.getLinkCardFormHtml()`). Flags: `-c/--ctid` (required), `-f/--token-flag` (required), `-r/--request-id` (auto if omitted), `--currency`, `--frequency`, `--callback-url` (recommended — pwt arrives there), `--continue-success-url`, `--auto-submit`, `-o/--out`, `--open-page/--no-open-page`. |
| `cof charge` | **Remote** — POST `/api/payment-gateway/v3/purchase/payment-credential` (`ENDPOINTS.payment`) | `-t/--transaction-id` → `tran_id` (required); `-a/--amount` → `amount` (required); `--token <pwt>` → `pwt` (required); `-c/--currency` → `currency`; `--ctid` → `ctid` (optional on repeat charges); `--token-flag` → `token_flag` (`CITU_FLEX\|MITU_FLEX\|MITU_FIX\|MITR_FLEX\|MITR_FIX`); `--callback-url` → `callback_url`; `--first-name/--last-name/--email/--phone` → payer fields; `--purchase-type` → `purchase_type` (purchase\|**pre-auth**); `--items` → `items`; `--return-params` → `return_params`; `--payout` → `payout` (keys `{acc, amt}`); `--custom-fields` → `custom_fields`; `--shipping-fee` → `shipping_fee`. Hash order same v3 COF payment order as `src/client.ts:567`. |
| `cof token renew` | **Remote** — POST `/api/payment-credential/v3/token-management/renew-expired-account-token` | `-r/--request-id` → `request_id` (required); `-c/--ctid` → `ctid` (required); `--token <pwt>` → `pwt` (required; ACCOUNT tokens only). Hash: `ctid.request_time.pwt.merchant_id.request_id`. |
| `cof token details` | **Remote** — POST `/api/payment-credential/v3/token-management/get-token-details` | `-r/--request-id` → `request_id` (required, ONLY field — no ctid/pwt). Hash: `merchant_id.request_time.request_id`. |
| `cof token remove` | **Remote** — POST `/api/payment-credential/v3/token-management/remove-token` | `-c/--ctid` → `ctid` (required); `--token <pwt>` → `pwt` (required; no request-id). Hash: `merchant_id.ctid.request_time.pwt`. |
| `payment-link create` | **Remote** — POST `/api/merchant-portal/merchant-access/payment-link/create` (RSA merchant_auth) | `-t/--title` → `title` (required); `-a/--amount` → `amount` (required); `-r/--merchant-ref-no` → `merchant_ref_no` (required); `--return-url` → `return_url` (required, public HTTPS); `-c/--currency` → `currency`; `-d/--description` → `description` (max 250); `--payment-limit` → `payment_limit`; `--expired-date <epochSeconds>` → `expired_date` (create rejects past/<5-min with PTL04); `--image <path>` → multipart image (JPG/PNG ≤3MB, local enforcement); `--payout` → `payout` (JSON array `[{acc, amt}]`, total amt must equal `--amount`); hash: `request_time.merchant_id.merchant_auth`. |
| `payment-link detail` | **Remote** — POST `/api/merchant-portal/merchant-access/payment-link/detail` | `-i/--id` → link id (required; `data.id` from create — NOT merchant ref/slug). |

### 2.2 Transaction read/mutation leaf commands (all remote)

| Leaf command | Local/Remote | Key flags → request field (endpoint) |
|---|---|---|
| `check-transaction` | **Remote** — POST `/api/payment-gateway/v1/payments/check-transaction-2` (600/s) | `-t/--transaction-id` → `tran_id` (required); `--json`. |
| `poll-transaction` | **Remote** (repeated check-transaction-2 calls) | `-t` (required); `--poll-interval` (default 5s); `--poll-timeout` (default 600s, exit 3 on timeout); `--json` (NDJSON events). |
| `transaction-detail` | **Remote** — POST `/api/payment-gateway/v1/payments/transaction-detail` (10/min) | `-t` (required); `--wait <seconds>` (retry until indexed, ~5s lag); `--json`. |
| `transaction-list` | **Remote** — POST `/api/payment-gateway/v1/payments/transaction-list-2` (50/min) | `--from/--to` (gateway time UTC+7; default today on gateway clock); `--status` (APPROVED\|PENDING\|DECLINED\|REFUNDED\|CANCELLED); `--min-amount/--max-amount`; `--page` (default 1); `--pagination` (default 50); `--json`. |
| `get-transactions-by-ref` | **Remote** — POST `/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | `-r/--merchant-ref` → `merchant_ref_no` (required); `--request-time` optional `req_time` (YYYYMMDDHHmmss). |
| `close-transaction` | **Remote** — POST `/api/payment-gateway/v1/payments/close-transaction` | `-t` (required); `-y/--force` (skip confirm); `--json`. No CLOSED status exists in read APIs — keep a local `closed` flag. |
| `tx-batch <operation>` | **Remote** (loops close/check/detail per ID) | `<operation>` = close\|check\|detail (arg); `-t` repeatable; `--ids-file <path>`; `--dry-run` (local only); `-y/--force` (close); `--pace <ms>` (default endpoint-appropriate: detail 6100ms, close 250ms, check 0); `--report <path>` (local markdown evidence report); `--json`. |
| `refund` | **Remote** — POST `/api/merchant-portal/merchant-access/online-transaction/refund` | `-t/--transaction-id` → original `tran_id` (required); `-a/--amount` → refund amount (required, ≥0.01 USD / ≥1 KHR); `-c/--currency` → `currency`; `--no-preflight` (skip local balance pre-flight which uses transaction-detail); `-y/--force`; `--json`. Hash: `request_time.merchant_id.merchant_auth`. |

### 2.3 Money-out leaf commands (all remote, RSA-secured for merchant-portal ones)

| Leaf command | Local/Remote | Key flags → request field (endpoint) |
|---|---|---|
| `payout` | **Remote** — POST `/api/payment-gateway/v2/direct-payment/merchant/payout` | `-t/--transaction-id` → source `tran_id` (required; pre-auth completed or paid tx); `-a/--amount` → total amount (required, must equal sum of beneficiary amounts); `-c/--currency` → `currency` (USD default; must match beneficiary currency); `-b/--beneficiaries` → comma list `account:amount` (e.g. `500000001:10,500000002:5`); `--custom-fields` → custom fields; `--json`. |
| `pre-auth complete` | **Remote** — POST `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` | `-t` → `tran_id` (required); `-a/--amount` → completion amount (required, USD); `--original-amount` (110% over-capture guard); `--max-over-capture-pct` (default 110, local guard); `--idempotency-key`; `-y/--force`; `--json`. |
| `pre-auth complete-payout` | **Remote** — POST `pre-auth-completion` (with payout array, same `ENDPOINTS.completePreAuth`) | `-t` (required); `-a` (required); `--payout` → JSON `[{"acc":"…","amt":…}]` (required via `.requiredOption` line 4262); `--original-amount`; `--max-over-capture-pct`; `--idempotency-key`; `--json`. |
| `pre-auth cancel` | **Remote** — POST `/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` | `-t` (required); `--reason` (optional cancellation reason); `--idempotency-key`; `-y/--force`; `--json`. |
| `beneficiary add <payee>` | **Remote** — POST `/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout` | `<payee>` positional arg → beneficiary account (ABA account or test MID); `--json`. Requires `PAYWAY_RSA_PUBLIC_KEY`. |
| `beneficiary update-status <payee>` | **Remote** — POST `/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status` | `<payee>` positional; `-s/--status <0\|1>` (required; 0 deactivated / 1 active); `--json`. Requires RSA key. |
| `exchange-rate` | **Remote** — POST `/api/payment-gateway/v1/exchange-rate` | `--json`. (No flags — merchant-only hash `req_time.merchant_id`.) |

### 2.4 Setup / reference / agent / skills / other leaf commands

| Leaf command | Local/Remote | Key flags / behavior |
|---|---|---|
| `init` | **Local** | `--mode <demo\|sandbox>`; `--template <framework\|first-payment>` — scaffolds project files. |
| `doctor` | **Local + optional remote** | `--route <demo\|online-qr\|hosted-checkout>`; `--live` (performs a real sandbox round-trip via exchange-rate when credentials present — remote only with `--live`). |
| `config` | **Local** | No flags — displays loaded configuration, validates env vars. |
| `profiles add` | **Local** | Interactive; stores encrypted-at-rest profile (max 8). |
| `profiles list` | **Local** | Lists saved profiles, no secrets. |
| `profiles use <name>` | **Local** | Sets default profile. |
| `profiles current` | **Local** | Shows selected default profile. |
| `profiles remove <name>` | **Local** | Removes a saved profile. |
| `onboard` | **Local** (stage `verify` may do a readiness check) | `--stage <provider\|profile\|callback\|privacy\|verify>`. |
| `setup-webhook` | **Local** (starts local HTTP listener; tunnel is outbound to Cloudflare, not PayWay) | `-p/--port` (default 8443); `--storage <json\|sqlite>`; `--tunnel`; `--url <url>`; `--journal`; `--forward-to <url>` (re-POST captures to your local app); `--forward-headers`. |
| `webhook verify-callback` | **Local** (HMAC verification only; `--record` reads local store) | `--body <json>` / `--body-file <path>`; `--sig` (X-PAYWAY-HMAC-SHA512 or env); `--api-key` (or PAYWAY_API_KEY); `--record <id>`; `--json`. |
| `webhook list` | **Local** | `--limit <n>` (default 10); `--json`. Reads `webhook_data/` (JSON then SQLite). |
| `webhook resend` | **Local → user URL** (re-POSTs a captured record to YOUR receiver, never PayWay) | `--record <id>` (required); `--to <url>` (required); `--forward-headers`; `--json`. |
| `webhook trigger` | **Local → user URL** (signed synthetic fixture to YOUR receiver) | `--url` (required); `--event` (payment.approved/declined/pending/refunded/cancelled, khqr.notification, payment-link.pushback); `-t/--tran-id`; `--merchant-ref`; `-a/--amount`; `-c/--currency`; `--payer-name`; `--api-key` (signing); `--forward-headers`; `--json`. |
| `status` | **Local** | No flags — prints status/refund code tables. |
| `explain [code]` | **Local** | `<code>` positional (omit → list all); decodes PayWay codes (e.g. PTL36, 49). |
| `validate` | **Local** | `-a/--amount`, `-c/--currency`, `-t/--transaction-id` — local refund amount / tran-id validation. |
| `sandbox-beneficiaries` | **Local** | `--currency <USD\|KHR>` filter; `--json` — reads seeded fixture list (`src/sandbox-beneficiaries.ts`). |
| `ask <request>` | **Local → inference provider** (may trigger PayWay calls if the agent executes them) | `<request>` positional (required); `--approve` (authorize create actions); `--yolo` (sandbox create skip confirm); `--session <id>`; `--provider-timeout <ms>`. |
| `agent` (REPL, no subcommand) | **Local → inference provider** | `--session <id>` to resume. |
| `agent setup` | **Local** | `--provider <openai\|openrouter\|nvidia\|opencode\|custom>`; `--model`; `--base-url`; `--capability-mode <native-tools\|strict-json-plan>`; `--timeout`; `--max-tokens`; `--temperature`; `--top-p`; `--extra-body`; `--acknowledge-privacy`. |
| `agent doctor` | **Local** | No flags — capability matrix. |
| `agent ack` | **Local** | No flags — privacy notice acknowledgment. |
| `agent sessions list` | **Local** | No flags. |
| `agent sessions export <id>` | **Local** | `--output <path>` (required). |
| `agent sessions clear <id\|all>` | **Local** | `--approve` (required in non-TTY). |
| `agent ledger recover` | **Local** | `--session-id`; `--json`. Never auto-replays. |
| `agent ledger prune` | **Local** | `--before <cutoff>` (default 30 days / ISO); `--json`. |
| `skills add <agents...>` | **Local** | `--only <skills>`; `--force-skills`; `--dest <path>`. |
| `skills remove <agents...>` | **Local** | `--dest <path>`; `--force-skills`. |
| `skills list` | **Local** | `--dest <path>`. |
| `skills doctor` | **Local** | `--agent <name>`; `--dest <path>`. |
| `demo` | **Local** (simulated journey on localhost, no credentials) | `-p/--port`; `--check`. |
| `test` | **Local** (starts a mock PayWay server in-process — `sdk.runTestSuite()` spins a local mock; no gateway calls) | No flags. |
| `journal show` | **Local** | `--kind`, `--tran`, `--last <n>` (default 50), `--dir`, `--json`. |
| `journal timeline` | **Local** | `-t/--transaction-id` (required); `--dir`; `--with-webhooks`; `--json`. |
| `journal prune` | **Local** | `--before <cutoff>` (default 30); `--dir`; `--json`. |
| `journal reconcile` | **Local** | `--dir`; `--webhook-dir` (default `<cwd>/webhook_data`); `--json`. |
| `journal stats` | **Local** | `--dir`; `--json`. |
| `journal explain` | **Local** | `-t` (required); `--dir`; `--json`. |
| `journal anomalies` | **Local** | `--dir`; `--json`. |

### 2.5 Census and local/remote split (verified against commander registrations)

Leaf census (every commander node with an `.action`): **68 leaves**.

**Remote (23 unconditional):**
| # | Command | Endpoint |
|---|---|---|
| 1 | `generate-checkout` | v1 purchase |
| 2 | `cof link-account` | v3 aof/link-account |
| 3 | `cof link-card` | v3 cof/link-card |
| 4 | `cof charge` | v3 purchase/payment-credential |
| 5 | `cof token renew` | v3 token-management/renew-expired-account-token |
| 6 | `cof token details` | v3 token-management/get-token-details |
| 7 | `cof token remove` | v3 token-management/remove-token |
| 8 | `payment-link create` | merchant-access/payment-link/create |
| 9 | `payment-link detail` | merchant-access/payment-link/detail |
| 10 | `check-transaction` | v1 check-transaction-2 |
| 11 | `poll-transaction` | v1 check-transaction-2 (looped) |
| 12 | `transaction-detail` | v1 transaction-detail |
| 13 | `transaction-list` | v1 transaction-list-2 |
| 14 | `get-transactions-by-ref` | v1 get-transactions-by-mc-ref |
| 15 | `close-transaction` | v1 close-transaction |
| 16 | `refund` | merchant-access refund (+ transaction-detail pre-flight) |
| 17 | `payout` | v2 direct-payment payout |
| 18 | `pre-auth complete` | pre-auth-completion |
| 19 | `pre-auth complete-payout` | pre-auth-completion (with payout array) |
| 20 | `pre-auth cancel` | pre-auth-cancellation |
| 21 | `beneficiary add` | whitelist-account/add-whitelist-payout |
| 22 | `beneficiary update-status` | whitelist-account/update-whitelist-status |
| 23 | `exchange-rate` | v1 exchange-rate |

**Dual-mode (3):** `generate-qr` (remote online — v1 generate-qr; local `--offline` KHQR), `tx-batch` (remote close/check/detail per ID; `--dry-run` resolves targets locally), `doctor` (local env/config validation; `--live` performs one remote exchange-rate round-trip).

**Agent-mediated (2):** `ask <request>`, `agent` (REPL) — local inference-provider calls that may execute remote PayWay operations indirectly (behind confirmations/risk gates).

**Pure local (40):** `init`, `config`, `onboard`, `profiles add`, `profiles list`, `profiles use`, `profiles current`, `profiles remove` (5), `checkout-form`, `cof link-card-form`, `setup-webhook`, `webhook verify-callback`, `webhook list`, `webhook resend`, `webhook trigger`, `status`, `explain`, `validate`, `sandbox-beneficiaries`, `demo`, `test`, `agent setup`, `agent doctor`, `agent ack`, `agent sessions list`, `agent sessions export`, `agent sessions clear`, `agent ledger recover`, `agent ledger prune`, `skills add`, `skills remove`, `skills list`, `skills doctor`, `journal show`, `journal timeline`, `journal prune`, `journal reconcile`, `journal stats`, `journal explain`, `journal anomalies` (7).

Count check: 23 + 3 + 2 + 40 = **68** = matches the commander-registration census (26 top-level leaves + 42 group leaves, counting every node that carries an action). Note `generate-qr` appears in §2.1 as one row with two modes; `help` subcommands auto-generated by commander on each group are not counted.

### 2.6 Endpoint map (all remote endpoints reachable via CLI)

`src/constants.ts` ENDPOINTS (22 constants, all exposed via CLI commands):
1. `/api/payment-gateway/v1/payments/purchase` — generate-checkout
2. `/api/payment-gateway/v1/payments/generate-qr` — generate-qr (online)
3. `/api/payment-gateway/v1/payments/check-transaction-2` — check-transaction, poll-transaction, tx-batch check
4. `/api/payment-gateway/v1/payments/transaction-detail` — transaction-detail, refund pre-flight, tx-batch detail
5. `/api/payment-gateway/v1/payments/transaction-list-2` — transaction-list
6. `/api/payment-gateway/v1/payments/close-transaction` — close-transaction, tx-batch close
7. `/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` — get-transactions-by-ref
8. `/api/payment-gateway/v1/exchange-rate` — exchange-rate, doctor --live
9. `/api/merchant-portal/merchant-access/online-transaction/refund` — refund
10. `/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` — pre-auth complete, complete-payout
11. `/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` — pre-auth cancel
12. `/api/payment-gateway/v2/direct-payment/merchant/payout` — payout
13. `/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout` — beneficiary add
14. `/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status` — beneficiary update-status
15. `/api/merchant-portal/merchant-access/payment-link/create` — payment-link create
16. `/api/merchant-portal/merchant-access/payment-link/detail` — payment-link detail
17. `/api/payment-credential/v3/aof/link-account` — cof link-account
18. `/api/payment-credential/v3/cof/link-card` — cof link-card
19. `/api/payment-gateway/v3/purchase/payment-credential` — cof charge
20. `/api/payment-credential/v3/token-management/renew-expired-account-token` — cof token renew
21. `/api/payment-credential/v3/token-management/get-token-details` — cof token details
22. `/api/payment-credential/v3/token-management/remove-token` — cof token remove

(22 endpoints listed — 22 unique constants; `pre-auth-completion` serves both `pre-auth complete` and `pre-auth complete-payout`.)

---

## 3. Findings — Special-Attention Items (a–f)

### a. online-self-activation (new-merchant / get-mc-info / get-mc-credential-info) — **DOES NOT EXIST**

- Help output: no command, group, or flag referencing activation, self-registration, merchant info, or credential info anywhere in the tree (top-level help shows only the groups listed in §1).
- Source grep: `grep -rniE "self-activation|get-mc-info|get-mc-credential|mc-info|mcInfo" src/ --include="*.ts"` → **zero matches** (exit 1, no files).
- `src/constants.ts` ENDPOINTS (lines 7–28) contains none of the `online-self-activation` paths; the SDK local schema `src/types.ts` `paths` interface contains none of them either (verified by path listing in §2.6 — only the 22 endpoints above).
- Evidence of the endpoints' existence in the official spec: `docs/archive/Default module.openapi.json` defines `/api/merchant-portal/online-self-activation/new-merchant` (line 6023), `/api/merchant-portal/online-self-activation/get-mc-credential-info` (line 6163), `/api/merchant-portal/online-self-activation/get-mc-info` (line 6284) — they are **in the archived official spec but have no CLI/SDK surface** in this repo.

### b. Legacy AOF v1 (aof/request-qr, aof/remove-account, aof/renew-expired-account, aof/pushback-status) — **DOES NOT EXIST**

- Help output: the only "aof" string in any help text is the `cof link-account` description ("Link an ABA account for credential-on-file"), which uses the **v3** endpoint (see c).
- Source grep: `grep -rn "aof/request-qr|aof/remove|cof/initial|cof/remove|renew-expired-account\"|pushback-status" src/ --include="*.ts"` → **zero matches in src/** (the only hits for "aof" in src are the v3 path `/api/payment-credential/v3/aof/link-account` in `src/constants.ts:13` and its schema entry in `src/types.ts:147`).
- The legacy v1 AOF paths exist only in `docs/archive/Default module.openapi.json`: `/api/aof/request-qr` (1733), `/api/aof/remove-account` (1985), `/api/aof/renew-expired-account`, `/api/aof/pushback-status`. **No CLI command or SDK endpoint maps to any of the four legacy AOF v1 endpoints.**

### c. v1 cof/initial + cof/remove — **NOT COVERED; only the v3 payment-credential endpoints exist**

- The archived official spec defines `/api/payment-gateway/v1/cof/initial` (line 1882, hosted HTML card-link form) and `/api/payment-gateway/v1/cof/remove` (line 2095).
- The CLI's `cof` group covers **only v3 endpoints** (`src/constants.ts:13–19`):
  - `cof link-account` → `/api/payment-credential/v3/aof/link-account` (note: account-linking lives under the **aof** v3 path, not cof)
  - `cof link-card` → `/api/payment-credential/v3/cof/link-card`
  - `cof charge` → `/api/payment-gateway/v3/purchase/payment-credential`
  - `cof token renew` → `/api/payment-credential/v3/token-management/renew-expired-account-token`
  - `cof token details` → `/api/payment-credential/v3/token-management/get-token-details`
  - `cof token remove` → `/api/payment-credential/v3/token-management/remove-token`
- Source grep for `cof/initial|cof/remove` in `src/` → **zero matches**.
- Functional overlap: v1 `cof/remove` (remove a card token) is functionally superseded by v3 `cof token remove` (`remove-token` — handles both account and card tokens per its description "Remove a linked account or card token"). v1 `cof/initial` (hosted card-link form via form POST) is **partially superseded**: `cof link-card` (API, v3 hosted page) and `cof link-card-form` (LOCAL — renders a signed form for the hosted flow, no API call) cover the card-linking use case via the v3 endpoint. So the v1 pair is not literally implemented, but the use cases are covered by the v3 trio + link-card-form. The one nuance: `cof link-card-form`'s SDK docstring (`credentialsOnFile.getLinkCardFormHtml()`) renders "the same signed request" — it targets the v3 flow, not the v1 `cof/initial` action URL.

### d. payment-link void — **DOES NOT EXIST**

- Help output: `payment-link --help` lists exactly two subcommands: `create` and `detail`. No `void`, no `cancel`, no `close`.
- Source: `src/domains/payment-link.ts` implements exactly two methods — `create` (line 64) and `getDetails` (line 203); no third method. `src/cli.ts` payment-link group registrations (lines 3148–3375): `.command('create')`, `.command('detail')` only.
- Endpoint constants: `src/constants.ts:21–22` define only `createPaymentLink` and `getPaymentLinkDetails` — no `voidPaymentLink`.
- The endpoint exists in the official spec: `docs/archive/Default module.openapi.json` defines `/api/merchant-portal/merchant-access/payment-link/void` — **not exposed by CLI or SDK**. (Per repo AGENTS.md, expiry must be enforced merchant-side since expired links read OPEN — a `void` command would be the remote way to close a link, and it is missing.)

### e. generate-qr payment_option wechat/alipay — **EXISTS**

- `generate-qr` has `--payment-option <option>` ("Payment option for online mode"), and the CLI hard-validates it against `PAYMENT_OPTIONS` (`src/cli.ts:2372–2376`): unknown values fail with a suggestion ("Payment option must be one of: …, received: X").
- Accepted values (`src/constants.ts:272`): **`cards, abapay_khqr, abapay_khqr_deeplink, alipay, wechat, google_pay`** (default `abapay_khqr`).
- The flag maps to the `payment_option` request field on `/api/payment-gateway/v1/payments/generate-qr` (`src/domains/qr.ts:119`: `payment_option: params.paymentOption || 'abapay_khqr'`).
- Interactive wizard also offers them with labels (`src/cli/flows/qr-flow.ts:72–74`: `alipay: 'Alipay'`, `wechat: 'WeChat Pay'`, `google_pay: 'Google Pay'`).
- Contrast: `generate-checkout --payment-option` has default `abapay_khqr_deeplink` but is **not** hard-validated against `PAYMENT_OPTIONS` in the non-interactive path (free string passed through; only subscription mode validates against the documented set cards/abapay/abapay_deeplink — `src/domains/checkout.ts:358–362`). `--google-pay-token` exists there for `google_pay`.

### f. QR pre-auth CREATE (purchase_type pre-auth on the QR path) — **DOES NOT EXIST on generate-qr; EXISTS on two other creation paths**

- `generate-qr` has **no `--purchase-type`/`--type` flag** (help output lists none; grep of `src/cli.ts` lines 2211–2790 for `purchaseType|purchase_type|preAuth|pre-auth` → **zero matches**). The CLI's `payway.qr.generateQr({...})` call site (`src/cli.ts:2652–2673`) omits `purchaseType`, so the domain always sends the default `purchase` (`src/domains/qr.ts:119`: `purchase_type: params.purchaseType || 'purchase'`). Note: the SDK **does** support `purchaseType?: 'purchase' | 'pre-auth'` in `GenerateQrParams` (`src/client.ts:414`), and the generate-qr hash fields do not include `purchase_type` — only the CLI never exposes it.
- Pre-auth CREATE **is exposed** elsewhere:
  - `generate-checkout --type pre-auth` → `type` request field on the v1 purchase endpoint (`src/domains/checkout.ts:376`: `type: params.type || 'purchase'`; flag at `src/cli.ts:2812`, passed at `src/cli.ts:2998`).
  - `cof charge --purchase-type pre-auth` → `purchase_type` field on the v3 COF payment endpoint (`src/cli.ts:3786`, passed at `3819`; `purchase_type` IS in the v3 hash order `src/client.ts:567`).
- Pre-auth lifecycle (complete / complete-payout / cancel) is fully exposed via the `pre-auth` group (§2.3). So: **create-pre-auth via generate-qr specifically = not exposed; via generate-checkout = exposed; via cof charge = exposed.**

---

## 4. Method notes / caveats for Pass 2

- All help output was captured live via `npx tsx src/cli.ts … --help` on 2026-09-11 (SDK v1.5.0); every leaf's flags were cross-checked against the commander registrations in `src/cli.ts` and `src/cli/commands/*.ts` (the `agent`, `journal`, `webhook`, `skills` groups are implemented in `src/cli/commands/`).
- `npx tsx src/cli.ts cof-token --help` fell back to root help (not a real command); the correct nesting is `cof token --help`.
- The archived official OpenAPI spec used for endpoint-existence evidence: `docs/archive/Default module.openapi.json`.
- The local SDK schema (`src/types.ts` `paths`) mirrors exactly the 22 endpoints in §2.6 — it contains no v1 AOF/COF or self-activation paths, matching the CLI surface.
- Remote/local classification reflects the command's direct behavior; `ask`/`agent` are provider-mediated and can trigger any SDK operation including gateway calls (with risk gates/confirmation).
