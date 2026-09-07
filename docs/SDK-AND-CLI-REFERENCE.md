# SDK and CLI reference

[![CI](https://github.com/antigravity-google/aba-payway-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/antigravity-google/aba-payway-ts/actions/workflows/ci.yml)

Community-maintained, typed server-side SDK for the ABA PayWay payment gateway.

Requires Node.js 22.12 or later. The SDK runs on your server, where PayWay credentials remain private.

## Getting started

Use [QUICKSTART.md](../QUICKSTART.md) for installation, route selection, and the server-side first-payment flow. This page is the detailed reference.

## Secure architecture

```text
Browser or app          Your Node.js server               ABA PayWay
     |  create request          |                              |
     |------------------------->|  signed SDK request          |
     |                          |----------------------------->|
     |  checkout artifact       |                              |
     |<-------------------------|                              |
     |------------------------- customer pays ---------------->|
     |                          |<------ callback / lookup -----|
     |                          |  verify, then fulfill once    |
```

Keep API keys and RSA material on the server. Treat payment creation as acceptance, not proof of payment. Make fulfillment idempotent because callbacks and status checks can be repeated.

### Install AI skills

Install the SDK's task-focused skill guides for supported coding agents:

```bash
npm exec -- payway-sdk skills add claude copilot
```

Supported agents are `claude`, `codex`, `opencode`, `cursor`, and `copilot`. Use `npm exec -- payway-sdk skills list` to inspect installed guides and `npm exec -- payway-sdk skills remove claude` to remove the ABA PayWay guides for an agent.

### Agentic PayWay CLI

The SDK ships an agentic CLI that lets a supported provider propose and run PayWay actions through a risk-gated pipeline (`payway-sdk ask`, `payway-sdk onboard`, `payway-sdk agent setup|doctor|sessions`). See the [1-pager agentic guide](https://github.com/antigravity-google/aba-payway-ts/blob/main/docs/QUICK-START-1-PAGER.md#agentic-payway-cli) and the skill guides:

- [aba-payway-agent skill](../skills/aba-payway-agent/SKILL.md) — provider modes, the 13 tools, risk gates, execution ledger, sessions, redaction, and read-only journal queries.
- [aba-payway-first-payment skill](../skills/aba-payway-first-payment/SKILL.md) — choosing QR / checkout / payment-link for a first payment.

```bash
# Guided setup (recommended): provider -> profile -> callback -> privacy -> verify
payway-sdk onboard

# Or configure directly. Presets: opencode (free) | openai | openrouter | nvidia | custom
export PAYWAY_AGENT_API_KEY=sk-...
payway-sdk agent setup --provider opencode --model x-preview-f-free \
  --max-tokens 8192 --temperature 0.2 --acknowledge-privacy

# Ask the agent (create actions require --yolo in sandbox or interactive confirmation)
payway-sdk ask "Generate an online QR for 3 USD" --yolo
```

> The provider API key is supplied **only** via `PAYWAY_AGENT_API_KEY` (never stored); secrets are redacted before reaching the provider. The strict-JSON planning prompt embeds a full tool catalog, off-schema plans get one automatic repair round, and transient provider errors (429/5xx) are retried with backoff. Model-supplied callback URLs are overridden by your merchant profile's configured callback. Every agent action has a fully-supported manual equivalent. Setup requires a saved credential profile and a public HTTPS callback — see the [Agent Setup Playbook](https://github.com/antigravity-google/aba-payway-ts/blob/main/docs/AGENT-SETUP-PLAYBOOK.md) for the field-tested path.

### CLI commands

| Command | Description |
|---|---|
| `payway-sdk init` | Initialize a demo, framework scaffold, or first-payment starter without overwriting existing files |
| `payway-sdk doctor` | Validate a selected route (`demo`, `online-qr`, or `hosted-checkout`); `--live` adds a real sandbox round-trip |
| `payway-sdk test` | Run the sandbox test suite (default) |
| `payway-sdk demo` | Open a credential-free simulated payment UI on localhost (`--check` for CI/package smoke) |
| `payway-sdk poll-transaction -t <id>` | Watch a transaction until terminal status (`--json` events for agents) |
| `payway-sdk status` | Display payment status codes and refund error codes reference |
| `payway-sdk explain [code]` | Decode a PayWay error code (e.g. `explain PTL36`, `explain 49`) with a fix hint — no credentials needed |
| `payway-sdk validate` | Validate a refund amount or transaction ID locally |
| `payway-sdk get-transactions-by-ref --merchant-ref <reference>` | Retrieve transactions for a merchant reference |
| `payway-sdk profiles add\|list\|use\|current\|remove` | Manage up to eight saved credential profiles |
| `payway-sdk generate-qr` | Generate a QR code (online via PayWay API or offline) |
| `payway-sdk check-transaction -t <id>` | Check payment status for one transaction |
| `payway-sdk transaction-detail -t <id>` | Full transaction detail (PayWay limit: 10/min; `--wait <seconds>` retries the ~5s post-creation indexing lag) |
| `payway-sdk transaction-list --from <date> --to <date>` | List transactions in a window (`"YYYY-MM-DD HH:mm:ss"` dates in **gateway time UTC+7** — a UTC-derived window silently returns 0 rows; omit both for the full gateway day) |
| `payway-sdk close-transaction -t <id>` | Void/close an unpaid transaction (prompts; `-y/--force` skips). Kills QRs customer-side; hosted-card sessions may still pay — see `docs/CLOSE-TRANSACTION-FINDINGS.md` |
| `payway-sdk refund -t <id> -a <amount> [-c <currency>]` | Refund with a pre-flight balance check and confirmation by default; the pre-flight hard-stops on a refund-currency/order-currency mismatch (re-run with `-c <order currency>`) — `--no-preflight` skips only the detail lookup, `-y/--force` skips only the prompt |
| `payway-sdk exchange-rate` | Fetch the live USD/KHR exchange rate |
| `payway-sdk generate-checkout -a <amount>` | Generate a checkout QR URL (full purchase flag set incl. `--payout`, `--additional-params`, `--google-pay-token`, `--return-deeplink`; requires credentials) |
| `payway-sdk checkout-form -a <amount> -o form.html` | Write the signed hosted-checkout HTML form (local signing, no API call) |
| `payway-sdk payment-link create / detail` | Create or inspect PayWay payment links (requires RSA credentials; `create --image <path>` attaches an image, `create --payout <json>` adds split-payout beneficiaries `[{acc, amt}]` — total must equal the amount) |
| `payway-sdk cof link-account / link-card` | Start a credentials-on-file link: returns the QR/deeplink (account; optional `--return-deeplink` for app deeplinks); `link-card` saves the gateway's hosted card page to `payway-output/` (that page IS the success signal); the token (`pwt`) arrives via `callback_url` |
| `payway-sdk cof link-card-form` | Write the signed card-link HTML form locally (no API call — the browser POSTs urlencoded straight to the gateway's hosted card-entry page) |
| `payway-sdk cof charge -t <id> -a <amount> --token <pwt>` | Charge a stored COF token (optional `--ctid`, `--token-flag`, payer fields, `--items`, `--payout`) |
| `payway-sdk cof token renew / details / remove` | Token lifecycle — `details` takes `--request-id` only; `remove` takes `--ctid --token` (irreversible) |
| `payway-sdk beneficiary add / update-status <payee>` | Manage the payout beneficiary whitelist (requires RSA key; `update-status -s 0\|1`) |
| `payway-sdk setup-webhook` | Start a local webhook listener for PayWay callbacks |
| `payway-sdk config` | Display loaded configuration and validate environment variables |
| `payway-sdk skills add <agent>` | Install AI skill guides for one or more agents |
| `payway-sdk skills remove <agent>` | Remove skill guides from one or more agents |
| `payway-sdk skills list` | Show installed skills per agent |
| `payway-sdk skills doctor` | Verify installation health for all agents |
| `payway-sdk --help` | Show usage guide |
| `payway-sdk --version` | Print SDK version |

> **Exit codes (all commands):** `0` success · `1` validation/input error · `2` PayWay API failure · `3` network/timeout/rate-limit — so scripts and agent frameworks can branch on `$?`. Lifecycle commands also accept `--json` for structured output.

For automated payment creation, prefer `--output json` for a single stable result
or `--output ndjson` when polling is enabled. Success envelopes include
`correlationId` and, when PayWay returns one, `traceId`; enable `--journal` or
`PAYWAY_JOURNAL=1` to join those IDs to the local transaction journal for
timeline, reconciliation, stats, anomaly, and root-cause queries.

### Interactive experience

On an interactive terminal the CLI adds a guided layer: `generate-qr` with missing options walks through a wizard (currency → amount → template → payment option → lifetime → callback → confirm), `generate-checkout` asks for a pre-submit confirm, polling shows a live progress spinner, and an APPROVED payment offers a next-step picker. Piped stdin, `--json`, `-y`, and CI/non-TTY runs keep the plain scripted output.

```bash
$ payway-sdk generate-qr
◆  Currency: USD
◆  Amount: 6.12
◆  QR template: template3_color
└  Confirm to generate & poll
```

Prefer the classic behavior? Set `PAYWAY_UI=classic` to opt out entirely, or pass the global `--no-color` flag (or set `NO_COLOR`) to disable ANSI colors only.

### Fastest QR flow

For the fastest manual first payment in sandbox:

```bash
payway-sdk doctor
payway-sdk generate-qr -a 3.31 -c USD
payway-sdk check-transaction -t <id>
payway-sdk transaction-detail -t <id>
```

For **online QR**, make sure `PAYWAY_CALLBACK_URL` is a public HTTPS URL first. If you do not already have one locally, run:

```bash
payway-sdk setup-webhook --tunnel
```

Online `generate-qr` saves the QR PNG by default to `payway-output/<transaction-id>.png`, renders the QR in the terminal when possible, and **opens the PNG with your OS default image viewer** so it is immediately scannable. Image-open behavior:

- **Auto (default):** opens only when stdout is an interactive terminal — scripts, CI, and agents are never interrupted.
- `--open-image` — force-open regardless of environment.
- `--no-open-image` — never open; use `--save-image <path>` still controls where the file lands.

The same opener is available programmatically via the exported [`openImageInDefaultViewer()`](https://github.com/antigravity-google/aba-payway-ts/blob/main/src/open-image.ts) helper (allowlisted per-platform command, spawned without a shell, never throws).

### Fastest refund follow-up

For the fastest verified refund flow:

```bash
payway-sdk refund -t <id> -a 1.11 -c USD
payway-sdk transaction-detail -t <id>
```

Interpret the follow-up detail like this:

- `refund_amount` is the authoritative total refunded so far.
- `transaction_operations` shows each refund event.
- `payment_status` may read `REFUNDED` even after a partial refund, so do not use that field alone to infer that the original payment was fully refunded.

### Get transactions by merchant reference

Set `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY`, then run:

```bash
payway-sdk get-transactions-by-ref --merchant-ref INV-12345678
```

The command sends the signed request to PayWay and prints the JSON response. PayWay returns at most 50 matching historical transactions and limits this endpoint to 10 requests per minute.

### Credential profiles and environments

Use profiles to keep up to eight sandbox and production credential sets on one machine:

```bash
payway-sdk profiles add
payway-sdk profiles list
payway-sdk profiles use sandbox-main
payway-sdk --profile production-main get-transactions-by-ref --merchant-ref INV-12345678
```

`profiles add` prompts for a unique name, environment, merchant ID, API key, optional RSA public key/base URL, and an optional note of up to 300 characters. The first profile becomes the default. The active profile is printed before every API request and secrets are never displayed.

Credential resolution order for CLI commands: explicit `--profile`, `PAYWAY_PROFILE`, the saved default profile, the current directory's `.env`, then ambient `PAYWAY_*` environment variables. Because a saved default profile applies globally, commands succeed from any working directory — run `payway-sdk profiles current` if you're unsure which source supplied the credentials.

Profiles are stored as plaintext in `%APPDATA%\aba-payway-sdk\profiles.json` (or `~/.config/aba-payway-sdk/profiles.json` when `APPDATA` is unavailable). Keep that file out of source control and restrict local access. For deployed SDK applications, use an OS secret manager, a cloud secret manager, or CI/CD secret storage; never put PayWay keys in browser/mobile-client code or commit them to `.env` files.

## Client Configuration

For verification and recovery, use the [documentation index](./README.md). Advanced options below are optional for first payment.

### 1. Initialize the Client

Set `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` to initialize with no constructor arguments. Optional environment variables are `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_SANDBOX`, `PAYWAY_TIMEOUT`, and `DEBUG_PAYWAY`. Explicit constructor options always take precedence.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay();
```

Set `debug: true` or `DEBUG_PAYWAY=true` to log sanitized request and response diagnostics. Sensitive values such as API keys, HMAC hashes, merchant authorization, payment tokens, and CVVs are redacted.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY, // Required for Refund, Pre-auth, Payout, and Payment Link APIs
  environment: 'sandbox', // 'sandbox' | 'production'
});
```

### Rate Limiting Configuration

PayWay documents these endpoint-specific limits:

- `check-transaction-2`: 600 requests/second
- `transaction-list-2`: 50 requests/minute
- `transaction-detail`: 10 requests/minute
- `refund`: 500 requests/second

Sandbox-verified (2026-08-25): exceeding a cap returns **HTTP 403 with a numeric body `status.code` of 429** ("Rate limit exceeded for this request. Please try again later") and no rate-limit headers. The SDK classifies this as retryable `PayWayRateLimitError` and paces retries from its own observed request window, so bursts slightly over a cap recover automatically.

This SDK applies client-side throttling for documented PayWay limits by default (`onThrottle` reports each local wait). You can fine-tune or disable this behavior using `rateLimitThrottling` and `rateLimitRules`.

```typescript
const paywayWithRateLimits = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  rateLimitThrottling: true,
  rateLimitRules: {
    '/api/payment-gateway/v1/payments/check-transaction-2': {
      limit: 600,
      intervalMs: 1000,
    },
    '/api/payment-gateway/v1/payments/transaction-list-2': {
      limit: 50,
      intervalMs: 60_000,
    },
  },
  onResponse: (endpoint, status, body, rateLimitInfo) => {
    if (rateLimitInfo) {
      console.log(`Rate limit info for ${endpoint}:`, rateLimitInfo);
    }
  },
});
```

If you prefer not to use SDK throttling at all:

```typescript
const paywayWithoutThrottling = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  rateLimitThrottling: false,
});
```

### Retry Configuration

The SDK can automatically retry transient failures (HTTP 5xx and network errors) using exponential backoff. 4xx errors and PayWay business-logic errors are never retried.

```typescript
const paywayWithRetry = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  maxRetries: 3,         // Number of retry attempts (default: 3)
  retryDelayMs: 1000,    // Base delay in ms between retries (default: 3000, doubled each attempt)
});
```

> ⚠️ **Non-idempotent endpoints:** a `purchase`/QR creation that fails with a
> network error or 5xx is silently re-sent (up to `maxRetries`). PayWay's
> sandbox accepts duplicate `tran_id` by overwriting, so this recovers
> transparently there — but production duplicate semantics are unconfirmed
> (an open provider-contract question as of 2026-09-05). If
> you need strict once-only submission, pass `retryPolicy: 'none'` to
> `checkout.purchase()`. If the response is lost, query the persisted
> transaction ID before authorizing a new attempt; never blindly create a
> replacement payment after a timeout.

### 2. Initiate Checkout (Server-Side)

Prepare transaction parameters on the server to generate a secure transaction payload with an HMAC hash signature:

```typescript
// Create the transaction parameters
const transaction = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 15.00,
  currency: 'USD',
  items: [
    { name: 'Sleek Keyboard', quantity: 1, price: 15.00 }
  ],
  returnUrl: 'https://mywebsite.com/payment-result',
});

// Return this payload directly to your frontend checkout form/page
// The frontend will render an HTML form posting to PayWay's checkout URL using these fields
```

Prefer to skip the frontend form entirely? `getCheckoutFormHtml()` renders the complete signed form document — same payload, same HMAC — for the full-page redirect (`autoSubmit: true`) or the official popup plugin (`popupMode: true`):

```typescript
// Express: the browser lands on PayWay's hosted checkout page
app.get('/checkout/:orderId', (req, res) => {
  res.type('html').send(payway.checkout.getCheckoutFormHtml({
    transactionId: req.params.orderId,
    amount: 15.00,
    currency: 'USD',
    paymentGate: 0,
    retryPolicy: 'none',
    returnUrl: 'https://mywebsite.com/payment-result',
  }, { autoSubmit: true }));
});
```

The CLI can write the same document locally: `payway-sdk checkout-form -a 15.00 --return-url <url> -o form.html` (local signing only — no API call, no RSA key required).

### 3. Handle Webhook Callback

PayWay notifies your backend server when payments are completed. Authenticate these webhooks securely:

```typescript
app.post('/api/payway-webhook', (req, res) => {
  const receivedSig = req.headers['x-payway-hmac-sha512'] as string | undefined;

  if (!receivedSig) {
    return res.status(400).send('Missing signature header');
  }

  const { hash, ...bodyWithoutHash } = req.body;

  // Use timing-safe validation with the header-provided signature.
  // The callback signature is sourced from the X-PAYWAY-HMAC-SHA512 header,
  // not from the request body, per PayWay webhook schema.
  const isValid = payway.verifyCallback(bodyWithoutHash, receivedSig);
  
  if (!isValid) {
    return res.status(400).send('Invalid signature');
  }

  // Fulfill order safely
  console.log('Payment Approved:', req.body.tran_id);
  res.status(200).send('OK');
});
```

> **Debugging verification failures?** `payway.verifyCallbackDetailed(body, sig)` returns
> `{ valid, reason }` where reason is `malformed_signature` (empty/missing header),
> `empty_body` (null payload), or `signature_mismatch` (wrong API key, hash field not
> stripped, or tampered payload) — so failed webhooks are diagnosable without guesswork.

### Per-call request options

Every API domain method accepts an optional trailing `callOptions` argument to override
the client-wide settings for that single request:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000); // cancel slow check after 5s

await payway.checkout.checkTransaction(tranId, undefined, {
  timeoutMs: 10_000,                   // per-call timeout (default: config.timeout)
  signal: controller.signal,           // per-call cancellation — never retried
});
```

### Idempotency and duplicate protection

PayWay does not currently expose Stripe-style per-request `Idempotency-Key` support in its public API. Instead, use a unique `tran_id` for every checkout attempt, persist transaction events durably, and deduplicate duplicate webhook callbacks or repeated return URL checks on your backend.

- Use `tran_id` as your primary duplicate-detection key.
- Verify callback authenticity, persist it idempotently, and reconcile with a status API before fulfillment.
- Do not rely on client-side redirects alone for payment confirmation.

> For sandbox verification, always supply `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, and `PAYWAY_RSA_PUBLIC_KEY` from environment variables, never hardcode them in source.

---

## Available API Domains

The SDK organizes PayWay's features into 7 distinct domains:

### 1. Checkout (`payway.checkout`)

Manage standard e-commerce transaction validation and retrieval.

```typescript
// Check status of a transaction
const status = await payway.checkout.checkTransaction('order-12345');

// Close/Settle a transaction manually (if pre-auth or manual capture is used)
const close = await payway.checkout.closeTransaction('order-12345');

// Refund a transaction (requires publicKeyPem)
const refund = await payway.checkout.refund('order-12345', 15.00);

// Get exchange rates
const rates = await payway.checkout.getExchangeRate();
```

### 2. Credentials-on-File / Tokenization (`payway.credentialsOnFile`)

Store ABA account or card credentials and process recurring / on-demand charges securely.

```typescript
// Link a bank account (QR/deeplink arrives in the response; the pwt token is
// pushed to your callback_url once the customer approves in ABA Mobile)
const linkAcc = await payway.credentialsOnFile.linkAccount({
  requestId: 'reqabc123',          // 5–24 alphanumeric, unique
  ctid: 'customer123',            // your customer identifier, 5–24 alphanumeric
  tokenFlag: 'CITI_FLEX',          // CITI_FLEX | CITO_FLEX (live-documented)
  currency: 'USD',
  callbackUrl: 'https://mywebsite.com/payway/cof-callback', // optional but recommended
  returnDeeplink: { ios_scheme: 'myapp://linked', android_scheme: 'myapp://linked' }, // optional app deeplink (§16 hash position)
});

// Link a credit/debit card — browser-form route (recommended, no server
// roundtrip): the signed HTML document's hidden fields POST urlencoded
// straight to the gateway, which renders its hosted card-entry page
const cardFormHtml = payway.credentialsOnFile.getLinkCardFormHtml({
  requestId: 'reqabc124',
  ctid: 'customer123',
  tokenFlag: 'CITI_FLEX',
  currency: 'USD',
  continueSuccessUrl: 'https://mywebsite.com/cards/done', // "Done" button target
  callbackUrl: 'https://mywebsite.com/payway/cof-callback', // the pwt arrives here
});
res.type('html').send(cardFormHtml);

// …or the API route: linkCard() POSTs for you; the hosted page arrives as a
// PayWayBusinessError with the HTML in `rawBody` (this endpoint NEVER answers
// JSON — render rawBody in an iframe; the pwt arrives via callback_url)
const linkCard = await payway.credentialsOnFile.linkCard({
  requestId: 'reqabc124',
  ctid: 'customer123',
  tokenFlag: 'CITI_FLEX',
  currency: 'USD',
  continueSuccessUrl: 'https://mywebsite.com/cards/done', // "Done" button target
});

// Charge a stored token (pwt) — on-demand or recurring
const charge = await payway.credentialsOnFile.payment({
  transactionId: 'order-789',
  amount: 25.00,
  paymentToken: 'pwt_token_value_here',
  ctid: 'customer123',             // optional on repeat charges
  tokenFlag: 'CITU_FLEX',          // CITU_FLEX | MITU_FLEX | MITR_FIX (charging flags)
  currency: 'USD',
});

// Token lifecycle (v1.3.6 — hash compositions sandbox-verified, un-gated)
const renewed = await payway.credentialsOnFile.renewToken({      // account tokens only
  requestId: 'reqabc125', ctid: 'customer123', paymentToken: 'pwt…',
});
const details = await payway.credentialsOnFile.getTokenDetails({ // request_id ONLY
  requestId: 'reqabc123',
});
const removed = await payway.credentialsOnFile.removeToken({     // no request_id; irreversible
  ctid: 'customer123', paymentToken: 'pwt…',
});
```

> **Subscription/recurring registration:** start a CITR subscription on the checkout
> purchase path with `ctid` + `tokenFlag: 'CITR_FIX'` + `frequency: '1W' | '1M' | '2M'`
> (see `CreateTransactionParams`), or from the CLI:
> `payway-sdk generate-checkout -a 9.99 --ctid customer123 --token-flag CITR_FIX --frequency 1M --return-url <url>`.

### 3. QR API (`payway.qr`)

Dynamically generate ABA PAY KHQR strings and images.

```typescript
const qrCode = await payway.qr.generateQr({
  transactionId: 'qr-order-123',
  amount: 1.50,
  paymentOption: 'abapay_khqr',
  callbackUrl: 'https://mywebsite.com/webhook',
  qrImageTemplate: 'template2',
});
// Response includes "qrString" (for embedding/deep-linking) and "qrImage" (base64 image data)
```

### 3.1 Offline QR Generation (`payway.khqr.generateOfflineQR`)

Generate an official ABA KHQR payload locally, without a PayWay API call. It requires ABA-issued merchant data: it never derives tags `30` or `62.68` from PayWay API credentials. Configure those values explicitly in `new PayWay({ khqr: ... })`, through the seven `PAYWAY_KHQR_*` environment variables, or in a local CLI profile. Explicit constructor fields take priority over environment values.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  khqr: {
    bakongId: 'your-bakong-id',
    abaMerchantId: 'your-aba-merchant-id',
    acquirerName: 'acquirer-name-provided-by-aba',
    merchantCategoryCode: '5999',
    merchantName: 'your-merchant-name',
    merchantCity: 'your-merchant-city',
    paywayData: 'payway-template-data-provided-by-aba',
  },
});

const readiness = payway.khqr.validateConfiguration();
if (!readiness.ready) throw new Error(readiness.issues.map((issue) => issue.code).join(', '));

const qrString = payway.khqr.generateOfflineQR({
  amount: 1.50,
  currency: 'USD',
  merchantRef: 'REF-123',
});

console.log(qrString);
```

With `amount`, the payload is dynamic (`01=12` and tag `54`); without it, it is static (`01=11`). The payload contains ABA merchant data in nested tag `30`, your reference in `62.01`, ABA-provided PayWay data in `62.68`, timestamp data in `99`, and a CRC in `63`. Generation is local only: it neither submits the QR nor confirms payment status.

Earlier SDK releases emitted a private offline TLV format. This method now produces official ABA KHQR, so remove legacy `merchantId`, `transactionId`, tip, fee, and transaction-type arguments. Obtain the required fields from ABA before deploying; do not copy sample values from another merchant.

### 4. Payment Link (`payway.paymentLink`)

Create and manage shareable payment links.

```typescript
// Create a payment link
const link = await payway.paymentLink.create({
  title: 'Invoice #1092',
  amount: 150.00,
  merchantRefNo: 'inv-1092',
  description: 'Design consultation services',
});

// Get payment link details
const details = await payway.paymentLink.getDetails(link.id);
```

Attach an image as a top-level `multipart/form-data` part. The image bytes are **not** part of the HMAC hash (sandbox-verified 2026-08-31):

```typescript
import { readFileSync } from 'node:fs';

const linkWithImage = await payway.paymentLink.create({
  title: 'Invoice #1092',
  amount: 150.00,
  merchantRefNo: 'inv-1092',
  returnUrl: 'https://mywebsite.com/invoice/1092',
  image: {
    data: readFileSync('./invoice-banner.png'),
    filename: 'banner.png',   // default 'image.jpg' — note: the gateway renames the stored file
    contentType: 'image/png', // default 'image/jpeg'
  },
});

// Gateway-hosted copy of the uploaded image:
const details = await payway.paymentLink.getDetails(linkWithImage.data.id);
console.log(details.data?.image?.image); // https://…/payment_link_image_<epoch-ms>.png
```

Split the payment across payout beneficiaries (travels inside the RSA-encrypted `merchant_auth`; the documented rule requires the payout total to equal the link amount — enforced as an advisory warning, or a throw under `strictValidation`):

```typescript
const linkWithPayout = await payway.paymentLink.create({
  title: 'Invoice #1092',
  amount: 150.00,
  merchantRefNo: 'inv-1092',
  returnUrl: 'https://mywebsite.com/invoice/1092',
  payout: [
    { acc: '500000001', amt: 100.00 }, // ⚠️ keys are {acc, amt} here (purchase-path
    { acc: '500000002', amt: 50.00 },   // shape) — NOT the payout domain's {account, amount};
  ],                                    // in sandbox the account must be a seeded beneficiary
});

// CLI equivalent:
// payway-sdk payment-link create -t "Invoice #1092" -a 150.00 -r inv-1092 \
//   --return-url https://mywebsite.com/invoice/1092 \
//   --payout '[{"acc":"500000001","amt":100.00},{"acc":"500000002","amt":50.00}]'
```

Full lifecycle guide — parameter tables, datatype reality notes, pushback receiver, permutations & recipes, troubleshooting: **[docs/17-payment-link.md](https://github.com/antigravity-google/aba-payway-ts/blob/main/docs/17-payment-link.md)**.

```sh
# Inspecting a link from the CLI — the opaque Link ID from create's data.id:
payway-sdk payment-link detail -i "UD/8Hl…Ht1xQdhlw=="
# Human output: Link ID / title / amount / status / payments / created / expires / share URL.
# --json prints the raw response; on ANY failure both commands print the
# machine-parseable { "error": { kind, exitCode, type, message, paywayCode, … } } envelope.
```

### 5. Pre-Authorization (`payway.preAuth`)

Hold funds on a card and capture/cancel them later.

```typescript
// Complete/capture a pre-authorized amount
const capture = await payway.preAuth.complete('order-123', 50.00);

// Capture with secondary payout to partner accounts
const capturePayout = await payway.preAuth.completeWithPayout('order-123', 50.00, [
  { acc: '000111222', amt: 5.00 }
]);

// Cancel a pre-authorized hold
const cancel = await payway.preAuth.cancel('order-123');
```

### 6. Payout / Whitelist Account (`payway.payout`)

Perform secure payouts to whitelisted payee accounts.

```typescript
// Process a payout to multiple beneficiaries
const payoutResult = await payway.payout.payout({
  transactionId: 'payout-123',
  amount: 100.00,
  currency: 'USD',
  beneficiaries: [
    { account: '500000001', amount: 100.00 } // seeded sandbox beneficiary (USD)
  ],
});

// Whitelist management (RSA-encrypted; CLI: `payway-sdk beneficiary add|update-status`)
const updateStatus = await payway.payout.updateBeneficiaryStatus({ payee: '000999888', status: 1 });
const addPayee = await payway.payout.addBeneficiary({ payee: '000999888' });
```

### 7. KHQR Transactions (`payway.khqr`)

Retrieve transactions lookup using merchant reference.

```typescript
const txs = await payway.khqr.getTransactionsByMerchantRef('mc-ref-9988');
```

---

## Payment Status Codes

The SDK exports named constants for the numeric payment status codes returned by `checkTransaction`, `getTransactionDetail`, and `getTransactionList`. Use these instead of raw numbers:

```typescript
import { PAYMENT_STATUS_CODES, PAYMENT_STATUS_LABELS } from 'aba-payway-ts';

const result = await payway.checkout.checkTransaction('order-123');
const code = result.data?.payment_status_code;

if (code === PAYMENT_STATUS_CODES.APPROVED) {
  console.log('Payment succeeded');
} else if (code === PAYMENT_STATUS_CODES.PENDING) {
  console.log('Payment still processing');
} else if (code === PAYMENT_STATUS_CODES.DECLINED) {
  console.log('Payment declined');
} else if (code === PAYMENT_STATUS_CODES.REFUNDED) {
  console.log('Payment was refunded');
} else if (code === PAYMENT_STATUS_CODES.CANCELLED) {
  console.log('Payment was cancelled');
}

// Get human-readable label from code
const label = PAYMENT_STATUS_LABELS[code ?? -1]; // "APPROVED", "PENDING", etc.
```

| Code | Constant | Label |
|---|---|---|
| `0` | `PAYMENT_STATUS_CODES.APPROVED` | Approved |
| `2` | `PAYMENT_STATUS_CODES.PENDING` | Pending |
| `3` | `PAYMENT_STATUS_CODES.DECLINED` | Declined |
| `4` | `PAYMENT_STATUS_CODES.REFUNDED` | Refunded |
| `7` | `PAYMENT_STATUS_CODES.CANCELLED` | Cancelled |

> ℹ️ Code `0` is shared by both `APPROVED` and `PRE_AUTH`. Distinguish via the `payment_status` string field or transaction context.

You can also use the CLI to view all codes:

```bash
payway-sdk status
```

---

## Refund Validation

The SDK validates refund amounts client-side before making an API call. This prevents wasted network round-trips for amounts that PayWay will reject:

```typescript
import { validateRefundAmount } from 'aba-payway-ts';

// USD — minimum $0.01, max 2 decimal places
validateRefundAmount(0.005, 'USD'); // throws: "Refund amount must be at least $0.01 for USD"
validateRefundAmount(0.01, 'USD');  // ok

// KHR — minimum 1 KHR, integer only
validateRefundAmount(0.5, 'KHR');   // throws: "Refund amount must be at least 1 KHR"
validateRefundAmount(1, 'KHR');     // ok
```

The `refund()` method performs this validation automatically:

```typescript
const refund = await payway.checkout.refund('order-123', 0.01, 'USD');
```

You can also validate amounts from the CLI:

```bash
payway-sdk validate --amount 0.005 --currency USD
# ✗ Refund amount: Refund amount must be at least $0.01 for USD

payway-sdk validate --amount 0.01 --currency USD
# ✓ Refund amount: 0.01 USD — valid
```

### Refund Error Codes

The SDK exports named constants for refund-specific error codes returned by PayWay:

```typescript
import { REFUND_ERROR_CODES } from 'aba-payway-ts';

if (error.paywayCode === REFUND_ERROR_CODES.PARAMETER_VALIDATION) {
  console.error('Check refund amount constraints');
} else if (error.paywayCode === REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL) {
  console.error('Refund amount is larger than original payment');
} else if (error.paywayCode === REFUND_ERROR_CODES.INSUFFICIENT_BALANCE) {
  console.error('Merchant account has insufficient balance');
}
```

| Code | Constant | Meaning |
|---|---|---|
| `PTL02` | `REFUND_ERROR_CODES.INVALID_HASH` | Invalid HMAC signature |
| `PTL04` | `REFUND_ERROR_CODES.PARAMETER_VALIDATION` | Refund amount below minimum or invalid format |
| `PTL37` | `REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL` | Refund amount exceeds original transaction |
| `PTL57` | `REFUND_ERROR_CODES.UNABLE_TO_REFUND` | Refund cannot be processed |
| `PTL58` | `REFUND_ERROR_CODES.REFUND_FAILED` | Refund failed |
| `PTL168` | `REFUND_ERROR_CODES.CONCURRENT_REJECTED` | Concurrent refund request rejected |
| `PTL181` | `REFUND_ERROR_CODES.INSUFFICIENT_BALANCE` | Insufficient merchant balance |

---

## Error Handling

All SDK API failures throw a structured error with a `type` field for easy discrimination:

```typescript
import { PayWayAPIError, PayWayBusinessError, PayWayNetworkError, PayWayRateLimitError } from 'aba-payway-ts';

try {
  const status = await payway.checkout.checkTransaction('order-999');
} catch (error) {
  if (error instanceof PayWayRateLimitError) {
    console.error('Rate limit error — retry later:', error.message);
  } else if (error instanceof PayWayNetworkError) {
    console.error('Network error — retry may help:', error.message);
  } else if (error instanceof PayWayBusinessError) {
    console.error('Business error from PayWay:', error.paywayCode, error.message);
  } else if (error instanceof PayWayAPIError) {
    console.error('API Error Code:', error.paywayCode); // PayWay code (e.g. "1", "PTL04")
    console.error('HTTP Status:', error.statusCode);     // HTTP status (e.g. 400, 403)
    console.error('Details:', error.rawBody);            // Complete JSON response body
  } else {
    console.error('System or unexpected failure:', error);
  }
}
```

> ℹ️ PayWay-specific error codes (like `PTL04` for refund validation) are extracted from HTTP error responses automatically. Previously these were buried in `rawBody`; now they appear in `error.paywayCode` for easy programmatic handling.

> ⚠️ **RSA endpoints validate the public key before calling PayWay.** Refund, Pre-Auth, Payout, and Payment Link throw a descriptive `PayWayConfigError` when `publicKeyPem` is missing **or** is not a valid PEM (`-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----`). Use the exported `isValidPublicKeyPem()` helper to pre-flight your key.

### Error Type Reference

| `instanceof` | `error.type` | When thrown | Retryable? |
|---|---|---|---|
| `PayWayConfigError` | `config_error` | Invalid constructor options or missing required fields | No — fix your config |
| `PayWayBusinessError` | `business_error` | PayWay returned a business-logic error (wrong hash, invalid merchant, etc.) | No |
| `PayWayRateLimitError` | `rate_limit_error` | HTTP 429 or PayWay rate limit hit | Yes — SDK retries automatically |
| `PayWayNetworkError` | `network_error` | DNS failure, timeout, connection reset | Yes — SDK retries automatically |
| `PayWaySignatureError` | `signature_error` | Webhook HMAC signature verification failed | No — check your API key |
| `PayWayAPIError` | `api_error` | Catch-all for other API errors | Depends on `error.retryable` |

---

## Development & Contribution

### Setup & Commands

- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Typecheck**: `npm run typecheck`
- **Test**: `npm run test`
