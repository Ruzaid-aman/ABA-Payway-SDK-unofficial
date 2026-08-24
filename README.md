# ABA PayWay TypeScript SDK

Production-ready, fully-typed TypeScript SDK for the ABA PayWay payment gateway.

> [!IMPORTANT]
> **Security Warning**: This SDK is designed for **Server-Side (Node.js) execution only**. It relies on `node:crypto` for cryptographic signing (HMAC-SHA512) and RSA encryption. **Never** import or use this SDK in frontend/client-side applications (React, Angular, Vue, iOS, Android), as doing so will expose your high-privilege PayWay API Key and RSA credentials to the public.

---

## Secure Architecture Guide

For a secure integration, separate your payment flow into distinct Backend and Frontend duties:

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│     Client (Browser / App)      │           │     Secure Backend (Node.js)    │
│  (No API keys or certs stored)  │           │   (Stores API keys & calls SDK) │
└────────────────┬────────────────┘           └────────────────┬────────────────┘
                 │                                             │
                 │  1. Request checkout initiation             │
                 ├────────────────────────────────────────────>│
                 │                                             │  2. Create signed request
                 │                                             │     using PayWay SDK
                 │                                             │
                 │  3. Return signed payment form/link         │
                 │<────────────────────────────────────────────┤
                 │                                             │
                 │  4. Redirect or embed PayWay Checkout       │
                 ├─────────────────────────────────────────────┼──────────────┐
                 │                                             │              │
                 │  5. Perform payment & redirect to returnUrl │              ▼
                 │<────────────────────────────────────────────┼─────── [ PayWay API ]
                 │                                             │              ▲
                 │                                             │  6. Webhook  │
                 │                                             │     Callback │
                 │                                             │<─────────────┘
                 │                                             │
                 │                                             │  7. Verify webhook signature
                 │                                             │     using SDK & fulfill order
```

---

## Installation

```bash
npm install aba-payway-ts
```

### Install AI skills

Install the SDK's task-focused skill guides for supported coding agents:

```bash
npx payway-sdk skills add claude copilot
```

Supported agents are `claude`, `codex`, `opencode`, `cursor`, and `copilot`. Use `npx payway-sdk skills list` to inspect installed guides and `npx payway-sdk skills remove claude` to remove the ABA PayWay guides for an agent.

### Agentic PayWay CLI

The SDK ships an agentic CLI that lets a supported provider propose and run PayWay actions through a risk-gated pipeline (`payway-sdk ask`, `payway-sdk onboard`, `payway-sdk agent setup|doctor|sessions`). See the [1-pager agentic guide](./docs/QUICK-START-1-PAGER.md#agentic-payway-cli) and the skill guides:

- [aba-payway-agent skill](./skills/aba-payway-agent/SKILL.md) — provider modes, the 11 tools, risk gates, execution ledger, sessions, redaction.
- [aba-payway-first-payment skill](./skills/aba-payway-first-payment/SKILL.md) — choosing QR / checkout / payment-link for a first payment.

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

> The provider API key is supplied **only** via `PAYWAY_AGENT_API_KEY` (never stored); secrets are redacted before reaching the provider. The strict-JSON planning prompt embeds a full tool catalog, off-schema plans get one automatic repair round, and transient provider errors (429/5xx) are retried with backoff. Model-supplied callback URLs are overridden by your merchant profile's configured callback. Every agent action has a fully-supported manual equivalent. Setup requires a saved credential profile and a public HTTPS callback — see the [Agent Setup Playbook](./docs/AGENT-SETUP-PLAYBOOK.md) for the field-tested path.

### CLI commands

| Command | Description |
|---|---|
| `payway-sdk init` | Initialize PayWay integration in the current project |
| `payway-sdk doctor` | Validate environment configuration and connectivity |
| `payway-sdk test` | Run the sandbox test suite (default) |
| `payway-sdk demo` | Run the test suite with pass/fail output |
| `payway-sdk status` | Display payment status codes and refund error codes reference |
| `payway-sdk validate` | Validate a refund amount or transaction ID locally |
| `payway-sdk get-transactions-by-ref --merchant-ref <reference>` | Retrieve transactions for a merchant reference |
| `payway-sdk profiles add\|list\|use\|current\|remove` | Manage up to eight saved credential profiles |
| `payway-sdk generate-qr` | Generate a QR code (online via PayWay API or offline) |
| `payway-sdk skills add <agent>` | Install AI skill guides for one or more agents |
| `payway-sdk skills remove <agent>` | Remove skill guides from one or more agents |
| `payway-sdk skills list` | Show installed skills per agent |
| `payway-sdk skills doctor` | Verify installation health for all agents |
| `payway-sdk --help` | Show usage guide |
| `payway-sdk --version` | Print SDK version |

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

Profiles are stored as plaintext in `%APPDATA%\aba-payway-sdk\profiles.json` (or `~/.config/aba-payway-sdk/profiles.json` when `APPDATA` is unavailable). Keep that file out of source control and restrict local access. For deployed SDK applications, use an OS secret manager, a cloud secret manager, or CI/CD secret storage; never put PayWay keys in browser/mobile-client code or commit them to `.env` files.

### Sandbox test scripts

| Script | Description |
|---|---|
| `npx tsx scripts/sandbox-probe.ts` | Run full sandbox probe across all 7 API domains |
| `npx tsx scripts/sandbox-probe-qr-api.ts` | Probe QR API endpoint specifically |
| `npx tsx scripts/sandbox-probe-checkout-errors.ts` | Probe checkout error handling |
| `npx tsx scripts/sandbox-probe-cof.ts` | Probe credentials-on-file endpoints |
| `npx tsx scripts/sandbox-probe-pre-auth.ts` | Probe pre-authorization endpoints |
| `npx tsx scripts/sandbox-probe-payout.ts` | Probe payout/beneficiary endpoints |
| `npx tsx scripts/sandbox-probe-khqr.ts` | Probe KHQR endpoints |
| `npx tsx scripts/sandbox-integration-test.ts` | Full lifecycle test — QR → poll → refund → exchange rate |
| `npx tsx scripts/post-payment-test.ts` | Post-payment operations (refund, close, check) |
| `npx tsx scripts/qr-payment-test.ts` | QR payment flow with live transaction polling |
| `npx tsx scripts/check-qr-transactions.ts` | Fetch transactions via `getTransactionList`, query detail for each |
| `npx tsx scripts/test-all-qr-templates.ts` | Generate QR codes for all 10 PayWay templates, save PNGs + QR strings to `test-logs/qr-images/` |
| `npx tsx scripts/zero-logic-purchase-flow.ts` | End-to-end purchase flow with no business logic (demo) |

Results from integration scripts are written to `test-logs/` with timestamps.

## Quick Start

### Full integration guide

For a complete 15-chapter integration guide, diagrams, and runnable examples, see [docs/README.md](./docs/README.md).

> Note: The SDK also performs fast client-side validation per domain. See the validation behavior section in [docs/README.md](./docs/README.md) for details.

### Documentation & examples

- `README.md` for a quick getting started flow
- `docs/README.md` for the full 15-chapter integration guide
- `docs/examples/` for runnable webhook, checkout, QR, and backend samples
- `CONTRIBUTING.md` for contribution and testing guidance
- `SECURITY.md` for responsible vulnerability disclosure
- `docs/VERSIONING.md` for SDK versioning policy
- `docs/RELEASE_CHECKLIST.md` for release verification and sandbox gating
- `docs/api/README.md` for the generated API reference

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
  publicKeyPem: process.env.PAYWAY_PUBLIC_KEY_PEM, // Required for Refund, Pre-auth, Payout, and Payment Link APIs
  environment: 'sandbox', // 'sandbox' | 'production'
});
```

### Rate Limiting Configuration

PayWay documents these endpoint-specific limits:

- `check-transaction-2`: 600 requests/second
- `transaction-list-2`: 50 requests/minute
- `transaction-detail`: 10 requests/minute
- `refund`: 500 requests/second

This SDK applies client-side throttling for documented PayWay limits by default. You can fine-tune or disable this behavior using `rateLimitThrottling` and `rateLimitRules`.

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
  maxRetries: 3,         // Number of retry attempts (default: 0 = no retry)
  retryDelayMs: 1000,    // Base delay in ms between retries (default: 1000, doubled each attempt)
});
```

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

### Idempotency and duplicate protection

PayWay does not currently expose Stripe-style per-request `Idempotency-Key` support in its public API. Instead, use a unique `tran_id` for every checkout attempt, persist transaction events durably, and deduplicate duplicate webhook callbacks or repeated return URL checks on your backend.

- Use `tran_id` as your primary duplicate-detection key.
- Treat webhook callbacks as the trusted final source of truth.
- Do not rely on client-side redirects alone for payment confirmation.

> For sandbox verification, always supply `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, and `PAYWAY_PUBLIC_KEY_PEM` from environment variables, never hardcode them in source.

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

Store card credentials and process recurring transactions securely.

```typescript
// Link a bank account
const linkAcc = await payway.credentialsOnFile.linkAccount({
  requestId: 'req-abc',
  ctid: 'customer-123',
  tokenFlag: 'CITR_FLEX',
  currency: 'USD',
});

// Link a credit/debit card (requires urlencoded payload)
const linkCard = await payway.credentialsOnFile.linkCard({
  requestId: 'req-abc',
  ctid: 'customer-123',
  tokenFlag: 'CITR_FLEX',
  frequency: '1M', // Recurrence frequency
  returnUrl: 'https://mywebsite.com/cards',
});

// Perform a payment using a saved token (pwt)
const charge = await payway.credentialsOnFile.payment({
  requestId: 'req-def',
  transactionId: 'order-789',
  amount: 25.00,
  ctid: 'customer-123',
  paymentToken: 'pwt_token_value_here',
});
```

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
    { account: '000999888', amount: 100.00 }
  ],
});

// Whitelist management
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
