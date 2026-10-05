# ABA PayWay TypeScript SDK

A community-maintained, typed server-side SDK for ABA PayWay — with a companion CLI, coding-agent skills, an MCP server, a Postman collection, an offline knowledge base, and a local webhook workbench. The SDK covers online and offline QR, hosted checkout, payment links, subscriptions, credentials-on-file (saved accounts and cards), refunds, payouts, pre-authorization, and transaction management.

This is not an official gateway-provider SDK. ABA and PayWay names identify the gateway being integrated; no endorsement is claimed.

Use it to accept payments in your application and verify their outcome before delivering an order. ABA PayWay processes the payment; this project supplies the integration tools.

| You want to… | Use |
|---|---|
| Add payments to your application | The TypeScript/JavaScript **SDK**, running on your server |
| Create and inspect payments from a terminal | The **CLI** (`payway-sdk`, included with the SDK package): QR, checkout, payment links, credentials-on-file, refunds, payouts, pre-auth, transaction reads, batch operations, plus profiles, shell completions, and a transaction journal |
| Guide a coding assistant through an integration | 35 packaged **agent skills** (`aba-payway-*`), one per PayWay workflow |
| Drive the SDK from an AI agent over MCP | The built-in **MCP server** (`payway-sdk mcp`): 12 read-only tools by default, 17 with `--allow-mutations` |
| Build and test webhook handling without the gateway | The **webhook workbench**: `setup-webhook` captures/forwards callbacks, `webhook trigger` sends signed fixtures, `webhook verify-callback` checks HMACs, `webhook resend` replays captures |
| Look up guides, sandbox learnings, and error codes offline | The **knowledge base** (`payway-sdk docs`): 42 curated topics; machine-readable index at [llms.txt](llms.txt) |
| Audit what the CLI did, locally | The **transaction journal** (`journal timeline`, `stats`, `reconcile`) — recorded by default for API commands |
| Exercise the API in Postman before writing code | The **Postman collection** in `payway-boilerplate/` — 46 ready-signed requests across 10 folders |
| See a full payment journey with zero credentials | The built-in **demo** (`payway-sdk demo`) — a simulated checkout on localhost |

Gateway testing requires sandbox credentials issued by ABA.

**Runtime:** Node.js 22.12 or later. CI targets the minimum runtime and Node 22/24 on Linux and Windows. Keep merchant credentials on your server.

## New developer setup

Start by learning the payment lifecycle locally, then connect the SDK to your ecommerce backend. The core rule is:

```text
create payment -> show QR/link/form -> verify payment -> fulfill once
```

Do not fulfill an order from a browser redirect, generated QR image, hosted link creation, or callback body alone. Always verify server-side, match the saved order ID, amount, and currency, then fulfill once in your own database.

### What to have ready

| Need | Why it matters |
|---|---|
| Node.js 22.12+ and npm 10+ | Required runtime for the SDK and CLI |
| A backend project | PayWay credentials and signing must stay server-side |
| Order and payment-attempt storage | Persist the attempt before calling PayWay; recover unknown outcomes by querying the same ID |
| Fulfillment logic | Mark paid and queue delivery/email/stock updates only after verified approval |
| Public HTTPS callback URL | PayWay cannot call `localhost`; use the webhook workbench or a tunnel for development |
| Sandbox Merchant ID and API Key | Required for real sandbox gateway calls |
| RSA public key, if needed | Required for payment links, refunds, pre-auth, payout, and encrypted operations |
| Sandbox payer access | ABA Mobile Simulator for QR/KHQR; sandbox test cards for hosted card checkout |

### First local checks

From this repository:

```bash
npm ci
npm run build
npm exec -- payway-sdk demo --check
npm exec -- payway-sdk demo
```

The demo uses simulated payments only. It is the safest first step for understanding create, verify, duplicate delivery, and fulfillment boundaries before you touch credentials.

### Sandbox configuration

Set credentials in your server environment, not in browser code:

```bash
PAYWAY_ENV=sandbox
PAYWAY_MERCHANT_ID=<sandbox-merchant-id>
PAYWAY_API_KEY=<sandbox-api-key>
PAYWAY_CALLBACK_URL=<public-https-callback-url>
PAYWAY_RSA_PUBLIC_KEY=<rsa-public-key-if-needed>
```

On Windows PowerShell:

```powershell
$env:PAYWAY_ENV = 'sandbox'
$env:PAYWAY_MERCHANT_ID = '<sandbox-merchant-id>'
$env:PAYWAY_API_KEY = '<sandbox-api-key>'
$env:PAYWAY_CALLBACK_URL = '<public-https-callback-url>'
```

The PayWay sandbox can present a self-signed certificate chain in some environments. If needed, scope the TLS workaround to one sandbox command only, and never set it globally:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npm exec -- payway-sdk doctor --route online-qr
```

### Callback and first payment

Start a local development receiver:

```bash
npm exec -- payway-sdk setup-webhook --tunnel --non-interactive
```

Then validate your route:

```bash
npm exec -- payway-sdk doctor --route online-qr
```

For an agent or scripted first QR, always persist a unique transaction ID first and avoid interactive prompts:

```bash
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t <unique-tran-id> \
  --callback-url "$PAYWAY_CALLBACK_URL" \
  -y --no-polling --no-open-image --output json
```

Verify using the saved transaction ID:

```bash
npm exec -- payway-sdk check-transaction -t <unique-tran-id>
npm exec -- payway-sdk transaction-detail -t <unique-tran-id> --wait 10
```

If a creation times out or the callback is missing, query the original saved ID before creating another payment. Missing callback does not prove non-payment.

### Ecommerce integration shape

For a new website, start with one route:

- **Hosted checkout** for a PayWay-hosted payment page and card/ABA PAY flow.
- **Online QR** for scan-first ABA/KHQR checkout.
- **Payment link** for invoices, manual orders, chat commerce, or shareable links.

Recommended backend flow:

```text
customer selects Pay
-> server reads trusted order and price
-> server creates a durable payment attempt
-> SDK creates QR, hosted form, or payment link
-> customer pays through PayWay/ABA
-> callback and/or inquiry records evidence
-> server verifies transaction detail
-> amount, currency, and order identity match
-> server marks paid and queues fulfillment exactly once
```

The browser may send an order ID. It must not send the trusted price, currency, merchant credentials, COF token, or final payment status.

### Using AI to integrate

Install the focused integration skill for your coding assistant:

```bash
npm exec -- payway-sdk skills add codex --only aba-payway-integration
npm exec -- payway-sdk skills doctor --agent codex
```

Then start with a planning prompt:

```text
Use aba-payway-integration. Inspect this ecommerce project and plan PayWay hosted checkout using our existing orders, users, and database. Do not edit files yet.
```

After review, continue with:

```text
Implement the agreed PayWay checkout flow. Keep credentials server-side, persist attempts before submission, verify amount and currency before fulfillment, and add local tests.
```

For production, treat local tests, sandbox evidence, production credentials, ABA screen/flow approval, live transaction acceptance, and settlement verification as separate gates.

## Try it locally

This checkout is preparing its first public release. Package metadata remains at `1.5.0`; do not assume that version is available on npm. From the repository root:

```bash
npm ci
npm run build
npm exec -- payway-sdk demo
```

The demo serves a simulated checkout on localhost. It requires no credentials and makes no gateway payments. For a non-interactive check, run `npm exec -- payway-sdk demo --check`.

To install this checkout in another application, run `npm pack`, then install the resulting tarball. After publication, use `npm install aba-payway-ts` and run the installed CLI with `npm exec -- payway-sdk`. Avoid bare `npx payway-sdk`: the CLI binary name is not the SDK package name.

## Create your first sandbox payment

Follow [QUICKSTART.md](QUICKSTART.md): try the demo → obtain sandbox credentials → prepare a callback URL → create and pay → verify → integrate your server. It includes ABA's official registration link and test-payment guidance. The same create, verify, and fulfill-once journey applies to the SDK, CLI, and skills.

The [first-payment reference app](docs-packaged/guides/FIRST-PAYMENT-WALKTHROUGH.md) demonstrates server-side pricing, verification, idempotent fulfillment, and reconciliation. It starts in simulated mode without credentials.

## Integration rules

- Run the SDK on the server. Never expose merchant API keys or COF payment tokens to browser code or an AI provider.
- Creation acceptance is not payment confirmation. Verify the transaction, amount, and currency before fulfilling an order, and fulfill only once.
- Callback verification depends on the payment route. Payment-link pushbacks are unsigned and require a status lookup; online checkout verification does not apply to offline KHQR notifications.
	- Test callback handling locally without the ABA Simulator: `setup-webhook --forward-to <your-app-url>` captures and forwards deliveries, and `webhook trigger --event payment.approved` sends a correctly-signed fixture to your receiver (see [Chapter 16](docs-packaged/guides/16-webhook-setup-guide.md)).
- Expired or closed transactions can still read `PENDING`. Hosted-card sessions may remain payable after close. Enforce local order policy and reconcile late payments.
- Saved CLI profiles contain plaintext credentials. Use protected local storage for development and a secret manager with explicit SDK configuration in deployed services.

## For AI coding agents

- **Skills:** 35 packaged workflow guides (`aba-payway-*`); install the merchant-integration router with `npm exec -- payway-sdk skills add claude --only aba-payway-integration` (also `codex`, `opencode`, `cursor`, `copilot`) — see [skills/README.md](skills/README.md). Omit `--only` for all 35; `skills list` and `skills doctor` inspect an installation.
- **MCP server:** expose the SDK to any MCP host with `npm exec -- payway-sdk mcp` (stdio; 12 read-only tools by default, 17 with `--allow-mutations`; preview with `mcp --list-tools`) — see the [reference](docs-packaged/reference/SDK-AND-CLI-REFERENCE.md#mcp-server).
- **Offline knowledge base:** `npm exec -- payway-sdk docs list` / `docs <topic>` / `docs search "<terms>"` serves 42 curated integration, sandbox, and error-registry topics without network access; the machine-readable index is [llms.txt](llms.txt).

## Explore the SDK

| Task | Guide |
|---|---|
| Set up your first payment | [Quickstart](QUICKSTART.md) |
| Browse commands and SDK examples | [SDK and CLI reference](docs-packaged/reference/SDK-AND-CLI-REFERENCE.md) |
| Choose an integration path | [Documentation index](docs-packaged/README.md) |
| Test the API in Postman | `payway-boilerplate/Postman Collection API Testing/postman/documents/postman-guide.md` — import the workspace's ready-made `dist/PayWay API — Complete Collection.postman_collection.json` (46 requests in 10 folders, embedded signing/test scripts; source repository, not distributed in the npm package) |
| Understand verification limits | `payway-sdk docs support` |
| Install coding-agent guides | [Skills](skills/README.md) |
| Review changes | [Changelog](CHANGELOG.md) |

## Contribute and get support

Start with `payway-sdk docs contributing` (or see the repository `CONTRIBUTING.md`). Most contributions can be tested without gateway credentials.

Report reproducible SDK bugs through the issue tracker once the public repository is available. See `payway-sdk docs support` for support scope and `payway-sdk docs security` for private vulnerability reporting. Never attach credentials, raw callbacks, or customer data to an issue.

Documentation links target the development branch during preparation. Release preparation must pin them to the actual published tag and verify the destination repository.

Licensed under the [MIT license](LICENSE).
