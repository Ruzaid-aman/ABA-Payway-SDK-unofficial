# Chapter 2 — Prerequisites & Setup

> **Estimated reading time:** 15 minutes  
> **Goal:** Get your environment ready and verify everything works before building your integration.

---

## Credential Checklist

Before you start coding, you need to obtain these from ABA PayWay. You'll get separate credentials for sandbox (testing) and production (live).

| Credential | Where to Get It | Sandbox | Production | Secret? |
|---|---|---|---|---|
| **Merchant ID** | ABA PayWay Dashboard → Merchant Settings | `ecXXXXXX` format | `ecXXXXXX` format | ❌ No (appears in API requests) |
| **API Key** | ABA PayWay Dashboard → API Keys | Random alphanumeric string | Random alphanumeric string | ✅ Yes |
| **RSA Public Key** | ABA PayWay Dashboard → Security | PEM format | PEM format | ❌ No (it's a public key) |

> 💡 **RSA Public Key is optional** — You only need it if you plan to use Pre-Auth, Payout, Payment Link, or Refund endpoints. Basic checkout and QR work without it.

### How to Get Sandbox Credentials

1. Visit [ABA PayWay Sandbox Portal](https://developer.payway.com.kh)
2. Register for a sandbox merchant account
3. Navigate to **Merchant Settings** to find your Merchant ID
4. Navigate to **API Keys** to generate your API Key
5. If needed, navigate to **Security** to download your RSA Public Key

> ⚠️ **Production credentials require business verification with ABA Bank** — contact ABA PayWay support for the go-live process.

---

## Environment Setup

### 1. System Requirements

| Requirement | Minimum Version |
|---|---|
| **Node.js** | ≥18.0.0 (uses `node:crypto` and Web Streams API) |
| **npm** | ≥9.0.0 (comes with Node.js 18+) |

Verify your installation:

```bash
node --version   # Should show v18.x.x or higher
npm --version    # Should show 9.x.x or higher
```

### 2. Install the SDK

```bash
# In your project directory
npm install aba-payway-ts
```

### 3. Store Credentials Securely

**Never hardcode credentials in your source code.** Use environment variables:

```bash
# .env file (add to .gitignore!)
PAYWAY_MERCHANT_ID=ec476910
PAYWAY_API_KEY=[REMOVED-HISTORICAL-6f49ced9c4d9]
PAYWAY_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
-----END PUBLIC KEY-----"
```

> **Note:** The SDK reads `PAYWAY_RSA_PUBLIC_KEY` from the environment when the `publicKeyPem` constructor option is not provided. If your `.env` stores the PEM as a single line with literal `\n` escapes, the SDK normalizes them automatically.
>
> 🧪 **Sandbox-verified (2026-08-25):** The CLI's built-in `.env` loader now supports the **multi-line quoted PEM format shown above** (value spanning several lines wrapped in quotes) as well as `\n`-escaped single-line values. Earlier CLI versions silently truncated multi-line PEMs to just `"-----BEGIN PUBLIC KEY-----`, which made every RSA-encrypted endpoint (refunds, payment links, pre-auth, payout) fail with a misleading *"publicKeyPem does not look like a public key PEM"* error. If you still see that error: make sure the value starts with `-----BEGIN PUBLIC KEY-----` and ends with `-----END PUBLIC KEY-----` after quote-stripping.


```bash
# Add .env to your .gitignore to prevent accidental commits
echo ".env" >> .gitignore
```

Install `dotenv` if your project doesn't already use it:

```bash
npm install dotenv
```

Load the environment variables at the top of your application:

```typescript
import 'dotenv/config';
```

### Credential Profiles for the CLI

The CLI can store up to **eight** named credential profiles in total. Each profile is independently tagged `sandbox` or `production` and can include an optional note of up to 300 characters. This lets you keep several sandbox merchants and production merchants without replacing credentials between commands.

Create a profile interactively, inspect the saved names, and select a default:

```bash
payway-sdk profiles add
payway-sdk profiles list
payway-sdk profiles use sandbox-main
payway-sdk profiles current
```

Use a saved default profile automatically, or override it only for one command:

```bash
payway-sdk --profile production-main get-transactions-by-ref --merchant-ref INV-12345678
```

For API-calling commands, the CLI resolves credentials in this order: explicit `--profile`, `PAYWAY_PROFILE`, the saved default profile, then the current directory's `.env` file. It prints the selected profile name and environment before the request, but never prints secrets.

The profile file is plaintext at `%APPDATA%\aba-payway-sdk\profiles.json` on Windows, or `~/.config/aba-payway-sdk/profiles.json` when `APPDATA` is unavailable. Do not commit it, do not share it, and restrict local filesystem access. Plaintext profiles are a CLI convenience only: deployed SDK applications should load keys from an OS secret manager, a cloud secret manager, or CI/CD secret storage. Never put PayWay credentials in browser or mobile application code.

> 🤖 **Agentic CLI:** The agentic CLI keeps its provider API key **only** in the `PAYWAY_AGENT_API_KEY` environment variable — it is never stored in agent config or session files (which are also plaintext; restrict access). Note that agent readiness requires a **saved credential profile** (`.env` fallback alone marks "PayWay context" as missing in `agent doctor`) plus a **public HTTPS** `PAYWAY_CALLBACK_URL` for online QR. See the [Agentic PayWay CLI guide](./QUICK-START-1-PAGER.md#agentic-payway-cli), the [aba-payway-agent](../skills/aba-payway-agent/SKILL.md) skill, and the field-tested [Agent Setup Playbook](./AGENT-SETUP-PLAYBOOK.md).

---

## Initializing the SDK

Create a PayWay client instance. This is the single entry point for all API operations.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  // Your Merchant ID from ABA PayWay dashboard
  merchantId: process.env.PAYWAY_MERCHANT_ID!,

  // Your API Key — NEVER hardcode this value
  apiKey: process.env.PAYWAY_API_KEY!,

  // RSA Public Key for Pre-Auth, Payout, Payment Link, and Refund endpoints
  // Optional: omit if you only need checkout, QR, and CoF
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,

  // 'sandbox' for testing, 'production' for live payments
  environment: 'sandbox',

  // Optional: HTTP request timeout in milliseconds (default: 30000)
  timeout: 30000,

  // Optional: Maximum retry attempts for transient failures (default: 3)
  maxRetries: 3,

  // Optional: Base delay between retries in ms (default: 3000)
  retryDelayMs: 3000,

  // Optional: Enable SDK rate limit throttling for documented PayWay endpoints
  rateLimitThrottling: true,

  // Optional: Override endpoint rate limit rules when you need custom throttling behavior
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

  // Optional: Debug hooks for logging requests and responses
  onRequest: (endpoint, body) => {
    console.log(`[PayWay] Request to ${endpoint}:`, body);
  },
  onResponse: (endpoint, status, body) => {
    console.log(`[PayWay] Response from ${endpoint}:`, status, JSON.stringify(body).substring(0, 200));
  },
});
```

### Rate limitation guidance

The SDK applies client-side throttling for documented PayWay limits by default. This helps avoid accidental bursts against sensitive endpoints such as `check-transaction-2`, `transaction-list-2`, and `transaction-detail`.

If your integration needs a custom limit or you want to disable throttling entirely, use `rateLimitRules` or set `rateLimitThrottling: false`.

```typescript
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  rateLimitThrottling: false, // disable client-side throttling
});
```

### Configuration Options Reference

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `merchantId` | `string` | ✅ Yes | — | Your PayWay merchant identifier |
| `apiKey` | `string` | ✅ Yes | — | Secret key for HMAC signing |
| `publicKeyPem` | `string` | ❌ No | — | RSA public key in PEM format. Validated structurally before RSA calls (Refund/Pre-Auth/Payout/Payment Link) — an invalid key throws a clear `PayWayConfigError` instead of a raw OpenSSL error. Literal `\n` sequences from single-line `.env` values are normalized automatically |
| `environment` | `'sandbox' \| 'production'` | ❌ No | `'sandbox'` | API endpoint cluster |
| `timeout` | `number` | ❌ No | `30000` | HTTP request timeout (ms) |
| `maxRetries` | `number` | ❌ No | `0` | Retry count for 5xx/network errors |
| `retryDelayMs` | `number` | ❌ No | `1000` | Base retry delay (ms) |
| `onRequest` | `(endpoint, body) => void` | ❌ No | — | Callback before each API request |
| `onResponse` | `(endpoint, status, body) => void` | ❌ No | — | Callback after each API response |
| `baseUrl` | `string` | ❌ No | Auto (from environment) | Override base URL (advanced) |

> ⚠️ **Always use `environment: 'sandbox'` during development.** Switching to `'production'` before you're ready will attempt real charges against live customer accounts.

---

## Why You Can't Use `localhost` for Callbacks

PayWay sends callbacks from its servers to your server. If you're developing on `localhost`, PayWay cannot reach your machine because:

1. `localhost` only resolves to your own computer
2. Your development machine is (probably) behind a NAT/firewall
3. PayWay's servers are on the public internet

### Solution: ngrok Tunnel

[ngrok](https://ngrok.com) creates a secure tunnel from a public URL to your local server. It's the standard tool for testing webhooks during development.

#### Step 1: Install ngrok

```bash
# Option A: Download from https://ngrok.com/download
# Option B: Install via npm (development dependency)
npm install --save-dev ngrok

# Option C: Install via package manager
# macOS:   brew install ngrok
# Windows: choco install ngrok
```

#### Step 2: Start Your Local Server

```bash
# Start your Node.js app (assuming it runs on port 3000)
node server.js
# Or: npm run dev
```

Your local server should be running on e.g., `http://localhost:3000`.

#### Step 3: Start the ngrok Tunnel

```bash
# In a new terminal window
ngrok http 3000
```

You'll see output like:

```
Forwarding   https://abc123.ngrok.io -> http://localhost:3000
```

The `https://abc123.ngrok.io` URL is now publicly accessible.

#### Step 4: Configure Your Callback URL

Set your PayWay callback URL to the ngrok URL:

```
https://abc123.ngrok.io/api/payway-webhook
```

Whenever you restart ngrok, you'll get a **new random URL**, so you'll need to update your callback configuration.

> 💡 **Pro tip:** ngrok Pro users can reserve a permanent subdomain (`https://yourname.ngrok.io`), saving you from reconfiguring every restart.

---

## Verification Step: "Hello, PayWay"

Before building your full integration, run this simple script to confirm your credentials work and you can reach the PayWay sandbox:

```typescript
// verify-credentials.ts
import 'dotenv/config';
import { PayWay, PayWayAPIError } from 'aba-payway-ts';

async function verify() {
  const payway = new PayWay({
    merchantId: process.env.PAYWAY_MERCHANT_ID!,
    apiKey: process.env.PAYWAY_API_KEY!,
    environment: 'sandbox',
  });

  try {
    // getExchangeRate() is the simplest PayWay endpoint — no params, just auth
    const rates = await payway.checkout.getExchangeRate();
    console.log('✅ Connected to PayWay Sandbox successfully!');
    console.log('Exchange rates:', rates);
  } catch (error) {
    if (error instanceof PayWayAPIError) {
      console.error('❌ PayWay rejected the request:');
      console.error('  Error Code:', error.paywayCode);
      console.error('  Status Code:', error.statusCode);
      console.error('  Message:', error.message);

      if (error.paywayCode === '15') {
        console.error('\n💡 Hint: "Invalid Merchant" — check your PAYWAY_MERCHANT_ID');
      } else if (error.paywayCode === '1') {
        console.error('\n💡 Hint: "Wrong Hash" — check your PAYWAY_API_KEY');
      }
    } else {
      console.error('❌ Network or system error:');
      console.error(' ', error);
      console.error('\n💡 Hint: Check your internet connection and firewall settings.');
    }
  }
}

verify();
```

Run it:

```bash
npx tsx verify-credentials.ts
```

**Expected output (success):**

```
✅ Connected to PayWay Sandbox successfully!
Exchange rates: { ... }
```

### Troubleshooting the Verification Step

| Symptom | Likely Cause | Solution |
|---|---|---|
| `"Wrong Hash"` (code 1) | Incorrect API Key | Verify `PAYWAY_API_KEY` in your `.env` file |
| `"Invalid Merchant"` (code 15) | Incorrect Merchant ID | Verify `PAYWAY_MERCHANT_ID` in your `.env` file |
| Network timeout | Firewall blocking outbound traffic | Allow outbound HTTPS to `checkout-sandbox.payway.com.kh` |
| `ECONNREFUSED` | No internet connection | Check your network connection |
| `tsx: command not found` | `tsx` not installed | Install with `npm install --save-dev tsx` or use `npx ts-node` |

---

## Project Structure Recommendation

Here's a recommended structure for a Node.js project using the PayWay SDK:

```
your-project/
├── .env                  # Credentials (NEVER commit this)
├── .env.example          # Template without real values (commit this)
├── .gitignore            # Must include .env
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # App entry point
│   ├── config/
│   │   └── payway.ts     # PayWay client initialization
│   ├── routes/
│   │   ├── checkout.ts   # Checkout-related endpoints
│   │   └── webhook.ts    # Webhook/callback handler
│   └── services/
│       └── payment.ts    # Business logic using SDK
└── tests/
    └── payment.test.ts
```

Example `src/config/payway.ts`:

```typescript
// src/config/payway.ts
import { PayWay } from 'aba-payway-ts';

/**
 * Singleton PayWay client instance.
 * Initialize once at app startup and reuse across all routes.
 */
export const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: (process.env.PAYWAY_ENV as 'sandbox' | 'production') || 'sandbox',
  maxRetries: 2,
  onRequest: (endpoint, body) => {
    console.log(`[PayWay] → ${endpoint}`);
  },
  onResponse: (endpoint, status) => {
    console.log(`[PayWay] ← ${endpoint} ${status}`);
  },
});
```

> 💡 **Singleton pattern:** Create the PayWay client once and share it across your app. There's no need to create a new instance for each request — the client has no mutable state.

---

## Environment Switching

When you're ready to go live, change a single line:

```typescript
// From:
environment: 'sandbox',

// To:
environment: 'production',
```

The SDK automatically switches the base URL from `checkout-sandbox.payway.com.kh` to `checkout.payway.com.kh`.

> ⚠️ **Also update your credentials!** Production uses a different Merchant ID and API Key than sandbox. Never use sandbox credentials in production.

A common pattern is to tie environment to `NODE_ENV`:

```typescript
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
});
```

When the SDK is initialized from environment variables without an explicit `environment` option, set `PAYWAY_ENV=sandbox` or `PAYWAY_ENV=production`. `PAYWAY_ENV` is authoritative; `PAYWAY_SANDBOX=true|false` remains supported only for compatibility with older integrations.

---

## Next Steps

Your environment is ready! Now you can build your first integration:

- **For web checkout flows** → [Chapter 3 — Web Implementation](./03-web-implementation.md)
- **For QR code payments** → [Chapter 7 — QR Code Handling](./07-qr-code-handling.md)
- **For mobile apps** → [Chapter 4 — Native App Implementation](./04-native-app-implementation.md)

> ← [Previous: Overview & Concepts](./01-overview-and-concepts.md) | [Next: Web Implementation →](./03-web-implementation.md)
