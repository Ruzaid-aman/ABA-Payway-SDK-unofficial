# Chapter 12 — Error Handling & Debugging

> **Estimated reading time:** 15 minutes  
> **Goal:** Understand all the errors you might encounter and how to debug them effectively.

---

## Error Class Hierarchy

The SDK throws these error types:

```
PayWayError (base)
├── PayWayConfigError     — Local configuration mistake
├── PayWayAPIError        — API returned an error
│   ├── PayWaySignatureError — Hash/signature rejected (codes "1", "01", "PTL02")
│   ├── PayWayBusinessError — Business rule violation (may carry fieldErrors)
│   ├── PayWayNetworkError — Network / connectivity failure (retryable)
│   └── PayWayRateLimitError — Rate limit exceeded (retryable)
└── PollingAbortedError   — Transaction polling forcibly stopped
```

### PayWayConfigError

Thrown **before** any API call is made. Something is wrong with your configuration.

```typescript
// Example: Missing required parameter
try {
  // Missing merchantId in config → PayWayConfigError
  const payway = new PayWay({ apiKey: 'xxx' }); // No merchantId!
} catch (error) {
  if (error instanceof PayWayConfigError) {
    console.error('Configuration error:', error.message);
    // Fix your PayWay constructor arguments
  }
}
```

**Common config-error messages (RSA endpoints — Refund, Pre-Auth, Payout, Payment Link):**

| Message | Cause | Fix |
|---|---|---|
| `publicKeyPem is required for RSA-encrypted endpoints` | No public key configured | Set `publicKeyPem` (or `PAYWAY_RSA_PUBLIC_KEY`) to the RSA key ABA gave you |
| `publicKeyPem does not look like a public key PEM (expected "-----BEGIN PUBLIC KEY-----")` | The value is present but not a PEM-formatted public key (e.g. truncated copy/paste, a certificate instead of a key, or a private key) | Paste the **complete** key including the `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines. Literal `\n` sequences from single-line `.env` values are handled automatically |

You can pre-flight your key without calling the SDK's RSA endpoints:

```typescript
import { isValidPublicKeyPem } from 'aba-payway-ts';

if (!isValidPublicKeyPem(process.env.PAYWAY_RSA_PUBLIC_KEY)) {
  console.error('PAYWAY_RSA_PUBLIC_KEY is missing or not a valid PEM public key');
}
```

### PayWayAPIError

Thrown when PayWay's API returns an error (wrong hash, invalid merchant, etc.). Contains rich debugging information:

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable error description |
| `paywayCode` | `string` | PayWay's internal error code (e.g., `"1"`, `"15"`) |
| `statusCode` | `number` | HTTP status code (e.g., 400, 403) |
| `endpoint` | `string` | Which API endpoint failed |
| `rawBody` | `any` | The complete JSON response body |
| `retryable` | `boolean` | Whether the error is transient (can be retried) |
| `toJSON()` | method | Serialize all error fields for logging |

### PayWaySignatureError *(new in v1.3.6)*

A subclass of `PayWayAPIError` (`type: 'signature_error'`) thrown when the gateway rejects the HMAC hash — codes `"1"`, `"01"`, and `"PTL02"`. The message includes an **endpoint hash-order hint** so you can see exactly which fields the gateway expected, e.g.:

```
PayWaySignatureError: Wrong Hash (code 01) on cof/get-token-details.
Hash order for this endpoint: merchant_id.request_time.request_id
```

**When you see it:** almost always a hash-order mismatch — the gateway tightened CoF hash validation (2026-08-31 probes: §9a-era orders now return `01 Wrong Hash`). If you hit this on a CoF endpoint, make sure you're on ≥ v1.3.6, which signs with the live-documented orders. Also check your API key and that you're not mutating params after the SDK builds the hash.

```typescript
import { PayWaySignatureError } from 'aba-payway-ts';

try {
  await payway.credentialsOnFile.getTokenDetails({ requestId: 'check12345' });
} catch (error) {
  if (error instanceof PayWaySignatureError) {
    console.error('Hash rejected. Expected order:', error.message);
    // The message names the endpoint's hash order — compare it with your
    // request fields. If you're on an old SDK version, upgrade to >= 1.3.6.
  }
}
```

### PayWayBusinessError.fieldErrors *(new in v1.3.6)*

When the binding layer rejects a CoF/QR payload with `status.code "04"` and a per-field `errors{}` map (wrapped in either HTTP 200 or 400), the SDK parses the map into `error.fieldErrors` — a `Record<string, string>` of exact field-name → gateway message. It's also included in `toJSON()`.

```typescript
import { PayWayBusinessError } from 'aba-payway-ts';

try {
  await payway.credentialsOnFile.linkAccount({ /* ... */ });
} catch (error) {
  if (error instanceof PayWayBusinessError && error.fieldErrors) {
    for (const [field, msg] of Object.entries(error.fieldErrors)) {
      console.error(`Field "${field}": ${msg}`); // e.g. "ctid": "The c t i d field is required."
    }
  }
}
```

### PollingAbortedError

Thrown when `checkout.pollTransactionStatus()` is forcibly stopped due to exceeding `maxDurationMs` or `maxConsecutiveErrors`. Caught inside a `for await...of` loop's `catch` block.

```typescript
import { PollingAbortedError } from 'aba-payway-ts';

try {
  for await (const result of payway.checkout.pollTransactionStatus('TX-001')) {
    if (result.isTerminal) break;
  }
} catch (error) {
  if (error instanceof PollingAbortedError) {
    console.error(`Polling stopped: ${error.reason}`);
    console.error(`Attempts: ${error.totalAttempts}, Last status: ${error.lastStatus}`);
    console.error(JSON.stringify(error.toJSON()));
  }
}
```

| Property | Type | Description |
|---|---|---|
| `reason` | `PollAbortReason` | `'max_duration_exceeded'` or `'max_consecutive_errors'` |
| `transactionId` | `string` | Transaction ID being polled |
| `lastStatus` | `string \| undefined` | Last observed status before abort |
| `totalAttempts` | `number` | Total poll attempts made |
| `toJSON()` | method | Serialize all fields for structured logging |

---

## Common PayWay Error Codes

| Code | Message | HTTP Status | Meaning | How to Fix |
|---|---|---|---|---|
| `"1"` | Wrong Hash | 403 | HMAC signature doesn't match | Check API key, field ordering, encoding (Base64 vs hex) |
| `"04"` | The given data was invalid | 400 | String form of the binding/validation code — observed on `generate-qr` when its lifetime is below the 180-second minimum | Send QR `lifetime >= 180` seconds. Purchase checkout lifetime uses minutes and has a separate minimum of 3. |
| `"7"` | Invalid Request Data | 400/403 | Missing or malformed field | Check parameter types and required fields |
| `"15"` | Invalid Merchant | 403 | Merchant ID not recognized | Verify `merchantId` in your config |
| `"16"` | Invalid Amount | 400 | Amount format is wrong | Use `formatAmount()` helper; check decimal places |
| `"17"` | Invalid Currency | 400 | Currency not `'USD'` or `'KHR'` | Set `currency` to `'USD'` or `'KHR'` |
| `"12"` / `"PTL147"` | Payment currency not allowed | 403 | Payout currency doesn't match the beneficiary account currency or the merchant credential currency | Send USD to a USD account and KHR to a KHR account; align the merchant profile currency |
| `"22"` | Expired Transaction | 403 | Token or transaction has expired | Call `renew()` for tokens, or create new transaction |
| `"23"` | Transaction Not Found | 403 | No transaction with given `tran_id` | Check transaction ID, it may have been closed |
| `"24"` | Invalid Beneficiary Data | 403 | RSA-encrypted beneficiary data is wrong | Verify public key PEM and beneficiary account format |
| `"37"` | Payout Whitelist | 403 | Payout account not whitelisted | Call `addBeneficiary()` first (sandbox-verified) |
| `"49"` | Invalid Request | 400/403 | Generic validation error — for lists, dates must be `"YYYY-MM-DD HH:mm:ss"` | Check all parameters against the OpenAPI spec |
| `"69"` | Lifetime below minimum | 400 | purchase `lifetime` < 3 minutes (checkout API takes minutes; spec-documented, max 43200 = 30 days; the SDK now rejects sub-3-minute values locally) | Send `lifetime >= 3` (minutes) |
| `"96"` | Payee Not Found / Invalid merchant data | 403 | Beneficiary not whitelisted, or payment-link id invalid | Whitelist the payee; verify the link id |

> 📋 **Source:** These codes are consolidated from the OpenAPI spec's `ErrorStatus` schema and verified against sandbox probe responses. The full hint map ships in `GATEWAY_CODE_HINTS` and is queryable via `payway-sdk explain <code>`.

### COF error family *(new in v1.3.6)*

Codes observed on the credentials-on-file endpoints (`link-account`, `link-card`, `payment-credential`, token trio):

| Code | Meaning | Hint |
|---|---|---|
| `"04"` | Validation failure with per-field `errors{}` map | Read `error.fieldErrors` (see above) — each entry names the exact request field |
| `"01"` / `"1"` / `"PTL02"` | Wrong Hash | `PayWaySignatureError` with the endpoint's hash-order hint; upgrade to ≥ v1.3.6 hash orders |
| `"98"` | Merchant profile not configured for CoF | Enable CoF on the merchant profile with ABA before linking |
| `"104"` | Token not found / not in a usable state | Verify `ctid` + `paymentToken` match the linked token |
| `"105"` | Token state error (e.g. expired, removed) | Renew the token or re-link the payment method |
| `"09"` | Token operation not allowed in current state | Check the token's lifecycle state via `getTokenDetails()` |

### QR error family *(new in v1.3.6)*

String codes observed on `generate-qr` (KHQR). Note: `"8"` and `"12"` intentionally stay in the gateway/payout families (they are not KHQR-specific):

| Code | Meaning |
|---|---|
| `"6"` | Invalid merchant data |
| `"16"` | Invalid amount |
| `"17"` | Invalid currency |
| `"18"` | Invalid request data |
| `"19"` | Invalid QR request |
| `"21"` | Invalid transaction ID |
| `"23"` | Transaction not found |
| `"32"` | Invalid lifetime |
| `"35"` | Invalid hash |
| `"44"` | Invalid template |
| `"47"` | Invalid items data |
| `"48"` | Invalid purchase type |
| `"96"` | Invalid merchant data / payee not found |
| `"102"` | QR request limit exceeded |
| `"403"` | Forbidden (merchant not enabled for this operation) |
| `"429"` | Too many requests — throttled, retry after the window |

All of these are queryable via `payway-sdk explain <code>` (the `explain` command now covers `cof` and `qr` families — `explainAll()` ships ≥ 6 CoF and 18 QR entries).

### Pre-Authorization Error Codes

Discovered by exercising a real pre-auth lifecycle in sandbox (`purchase` with
`type: 'pre-auth'`, then complete/cancel). Exported as
`PRE_AUTH_ERROR_CODES`:

| Code | Constant | Meaning | How to Fix |
|---|---|---|---|
| `PTL59` | `PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE` | Cannot capture — transaction status invalid | Only authorized OPEN pre-auths can be completed |
| `PTL62` | `PRE_AUTH_ERROR_CODES.MERCHANT_INVALID` | Merchant info invalid for this operation | Sandbox profile lacks permission (e.g. complete-with-payout) — contact PayWay |
| `PTL170` | `PRE_AUTH_ERROR_CODES.UNABLE_TO_CANCEL` | Cannot cancel — transaction status invalid | Only unpaid OPEN pre-auths can be cancelled |
| `PTL36` | *(shared with refunds)* | Transaction not found or invalid | Verify the `tran_id` |

### Refund-Specific Error Codes

The refund endpoint uses its own set of error codes (prefixed with `PTL`). These are returned in `status.code` on HTTP 200 or HTTP 400 responses and are **automatically extracted into `error.paywayCode`** by the SDK:

```typescript
import { REFUND_ERROR_CODES } from 'aba-payway-ts';

try {
  await payway.checkout.refund('order-123', 0.005);
} catch (error) {
  if (error instanceof PayWayAPIError) {
    switch (error.paywayCode) {
      case REFUND_ERROR_CODES.PARAMETER_VALIDATION:
        console.error('Refund amount is below minimum ($0.01 USD / 1 KHR)');
        break;
      case REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL:
        console.error('Refund amount is larger than the original payment');
        break;
      case REFUND_ERROR_CODES.INSUFFICIENT_BALANCE:
        console.error('Merchant account has insufficient balance for this refund');
        break;
      case REFUND_ERROR_CODES.UNABLE_TO_REFUND:
        console.error('Refund cannot be processed (transaction may not be refundable)');
        break;
      case REFUND_ERROR_CODES.CONCURRENT_REJECTED:
        console.error('Another refund is in progress for this transaction');
        break;
      default:
        console.error(`Refund failed: ${error.paywayCode} — ${error.message}`);
    }
  }
}
```

| Code | Constant | Meaning | How to Fix |
|---|---|---|---|
| `PTL02` | `REFUND_ERROR_CODES.INVALID_HASH` | Invalid HMAC signature | Check API key and field ordering |
| `PTL04` | `REFUND_ERROR_CODES.PARAMETER_VALIDATION` | Amount below minimum or invalid format | Ensure ≥ $0.01 USD or ≥ 1 KHR |
| `PTL36` | `REFUND_ERROR_CODES.REFUND_TARGET_NOT_FOUND` | Transaction not found or is invalid (HTTP 403) | Verify the original `tran_id`; refunds require a captured transaction |
| `PTL37` | `REFUND_ERROR_CODES.REFUND_EXCEEDS_ORIGINAL` | Refund > original payment | Reduce refund amount |
| `PTL57` | `REFUND_ERROR_CODES.UNABLE_TO_REFUND` | Cannot process refund | Check transaction status |
| `PTL58` | `REFUND_ERROR_CODES.REFUND_FAILED` | Refund processing failed | Contact PayWay support |
| `PTL168` | `REFUND_ERROR_CODES.CONCURRENT_REJECTED` | Duplicate concurrent request | Retry after the first request completes |
| `PTL181` | `REFUND_ERROR_CODES.INSUFFICIENT_BALANCE` | Insufficient merchant balance | Top up merchant account |

> ℹ️ **Client-side validation:** The SDK validates refund amounts before making the API call. Use `validateRefundAmount(amount, currency)` to catch invalid amounts locally. The `refund()` method calls this automatically.
>
> 🧪 **Sandbox-verified (2026-08-25):** Refunding an unknown/unpaid transaction returns **HTTP 403 + PTL36**. The CLI's `payway-sdk refund` command runs a pre-flight balance check via `getTransactionDetail` first (paid − already-refunded) and fails fast with exit code 1 before touching PayWay.
>
> ℹ️ **CLI operator note:** `--no-preflight` skips only the detail lookup; `-y/--force` skips both the lookup and the confirmation prompt.

### Payout-Specific Error Codes

Payouts (`payway.payout.payout`) go through the direct payout API and have their own failure modes. The single most common mistake is a **currency mismatch**: the payout `currency` must match both the beneficiary account currency and the merchant credential currency — a KHR payout to a USD account is rejected. The SDK enforces the beneficiary-currency match client-side in sandbox (throws `PayWayConfigError`), so it fails fast before the network round-trip.

| Code | Constant | Meaning | How to Fix |
|---|---|---|---|
| `12` / `PTL147` | `PAYOUT_ERROR_CODES.CURRENCY_NOT_ALLOWED` | Payment currency not allowed | Payout currency must match the beneficiary account currency **and** merchant credential currency (USD→USD, KHR→KHR) |
| `37` / `PTL146` / `PTL-PAYOUT-37` / `PTL46` | `PAYOUT_ERROR_CODES.ACCOUNT_NOT_WHITELISTED` | Beneficiary not whitelisted | Register the payee via `addBeneficiary()` (or the payment-link whitelist) first |
| `PTL-PAYOUT-36` | `PAYOUT_ERROR_CODES.AMOUNT_MISMATCH` | Payout amount mismatch | Sum of `beneficiaries[].amount` must equal the payout (transaction complete) amount |
| `1` | *(shared with gateway)* | Wrong Hash | Check API key, HMAC field ordering, base64 vs hex encoding |
| `24` | *(shared with gateway)* | Invalid Beneficiary Data | RSA-encrypted beneficiaries malformed — verify public key + account format |
| `415` (HTTP) | — | Unsupported Media Type | Direct payout API requires `Content-Type: application/json` (not form-encoded) |

> 🧪 **Sandbox-verified (2026-08-25):** Payout to a non-whitelisted account → HTTP 403, numeric code **`37`** ("Payout accounts are not in whitelist"). Beneficiaries are RSA-encrypted and the HMAC is **hex**-encoded for this endpoint.
>
> 💡 **CLI:** `payway-sdk payout -t <txId> -a 10 -c USD -b "500000001:10"` validates currency/whitelist locally in sandbox and prints payout-specific hints on failure. Use `payway-sdk sandbox-beneficiaries` to list the seeded test accounts.

### Interpreting a successful refund

After a successful CLI or SDK refund, verify with:

```bash
payway-sdk transaction-detail -t <id>
```

Then interpret these fields carefully:

- `refund_amount`: authoritative refunded total so far
- `transaction_operations`: refund event history, including each refund action
- `payment_status`: coarse lifecycle state only; sandbox verification on August 25, 2026 showed `payment_status: REFUNDED` even after a partial refund, so do not treat it as proof that the full original amount was refunded

### "Invalid JSON response from PayWay API" — HTML instead of JSON

If you see an error like:

```
Invalid JSON response from PayWay API (content-type: text/html). PayWay returned
an HTML page instead of JSON... Body starts with: <!DOCTYPE html><html...
```

PayWay accepted the request but routed it to a web flow instead of answering with API JSON. Sandbox-verified cause: **unsupported parameter values**, e.g. `payment_gate: 0` on `/v1/payments/purchase`. Removing optional parameters resolves it. The error message includes a body snippet so you can see which page PayWay returned.

> **Exception — `link-card` always answers HTML (v1.3.6):** the card-linking endpoint returns an HTML page (the hosted card-entry form) on **both success and error**. The SDK detects this shape and raises a structured `PayWayBusinessError` ("link-card responded with an HTML page… check callback_url") instead of a JSON-parse failure — so an HTML body on `link-card` is expected behavior, not this failure mode. To get the hosted page without any server roundtrip, render the local signed form instead: `credentialsOnFile.getLinkCardFormHtml()` / `payway-sdk cof link-card-form` (a browser form POST is exactly the urlencoded wire format this endpoint requires). The CLI's `cof link-card` captures the returned page to `payway-output/link-card-<request-id>.html` and exits 0.

---

## CLI Exit Codes

All `payway-sdk` commands use standardized exit codes so scripts and agent frameworks can branch without parsing output:

| Code | Meaning | Typical trigger |
|---|---|---|
| `0` | Success | Command completed as requested |
| `1` | Validation / input error | Bad amount, invalid tran_id format, wrong date format, missing credentials |
| `2` | PayWay API failure | HTTP 4xx/5xx, business errors (`Wrong Hash`, `PTL*`, code 6 not-found) |
| `3` | Timeout / network / rate-limit | Network errors, request timeouts, 429s, polling aborted by consecutive poll failures |

```bash
payway-sdk refund -t order-123 -a 5.00 -y
echo $?   # 0 = submitted, 1 = bad input, 2 = PayWay rejected, 3 = network issue
```

### Decode any error with `explain`

Instead of searching this chapter for a code, ask the CLI — works offline, no credentials:

```bash
payway-sdk explain PTL36    # → Transaction not found: verify the original tran_id...
payway-sdk explain 49       # → Invalid Request: list dates must be "YYYY-MM-DD HH:mm:ss"
payway-sdk explain 104      # → CoF family: token not found / not usable (v1.3.6)
payway-sdk explain          # list every known code
```

The same lookup is available programmatically via `explainPayWayCode()` in `aba-payway-ts/cli/explain-code.js`. As of v1.3.6 the map also covers the **`cof`** and **`qr`** code families (see the tables above).

---

## Error Handling Patterns

### Pattern 1: Differentiate Error Types

```typescript
import { PayWayAPIError, PayWayConfigError } from 'aba-payway-ts';

async function safeApiCall() {
  try {
    const result = await payway.checkout.checkTransaction('order-123');
    return result;
  } catch (error) {
    if (error instanceof PayWayAPIError) {
      // API-level error — PayWay responded with an error
      console.error(`PayWay Error [${error.paywayCode}]: ${error.message}`);

      // Specific handling based on PayWay code
      switch (error.paywayCode) {
        case '1':
          // Wrong hash — check API key and field ordering
          break;
        case '22':
          // Expired — retry or create new
          break;
        case '15':
          // Invalid merchant — check credentials
          break;
      }
    } else if (error instanceof PayWayConfigError) {
      // Local configuration error — fix before retrying
      console.error('Configuration error:', error.message);
    } else {
      // Network error, DNS failure, etc.
      console.error('Unexpected error:', error);
    }
  }
}
```

### Pattern 2: Retry Transient Errors

```typescript
import { PayWayAPIError } from 'aba-payway-ts';

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry 4xx errors (they're your fault, not a transient issue)
      if (error instanceof PayWayAPIError) {
        const httpStatus = error.statusCode;

        if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
          // 4xx errors are not retryable — throw immediately
          throw error;
        }

        if (!error.retryable) {
          throw error;
        }
      }

      if (attempt < maxRetries) {
        console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError;
}

// Usage
const status = await withRetry(
  () => payway.checkout.checkTransaction('order-123'),
  3, // Retry up to 3 times
  1000 // Start with 1 second delay
);
```

### Pattern 3: Logging for Debugging

```typescript
// Enable debug hooks when creating the PayWay client
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',

  // Log every API request (redact sensitive fields!)
  onRequest: (endpoint, body) => {
    console.log(`[PayWay] → ${endpoint}`);
    console.log(`  Body:`, JSON.stringify(body).substring(0, 500));
  },

  // Log every API response
  onResponse: (endpoint, status, body) => {
    console.log(`[PayWay] ← ${endpoint} HTTP ${status}`);
    // Redact full API key, tokens, and sensitive data in production
    const safeBody = { ...body };
    delete safeBody.hash;
    delete safeBody.api_key;
    console.log(`  Response:`, JSON.stringify(safeBody).substring(0, 500));
  },
});
```

### Pattern 4: Graceful Degradation

```typescript
async function getExchangeRateWithFallback(): Promise<any> {
  try {
    return await payway.checkout.getExchangeRate();
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error);

    // Return cached rates or default values
    return {
      usd_to_khr: 4100, // Fallback rate
      last_updated: new Date().toISOString(),
      cached: true,
    };
  }
}
```

### Pattern 5: Structured Logging with Levels and Trace Correlation (TD-08)

Beyond the binary `DEBUG_PAYWAY` switch, the SDK has a level-aware logger. Set
`logLevel` (or `PAYWAY_LOG_LEVEL=debug|info|warn|error`) and optionally
`logFormat: 'json'` for single-line JSON your log aggregator can parse:

```typescript
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  debug: true, // activates built-in diagnostics
  logLevel: 'info', // config > PAYWAY_LOG_LEVEL > DEBUG_PAYWAY > info
  logFormat: 'json', // {"ts":"…","level":"debug","source":"payway-sdk","msg":"[payway] <- 200 …","data":{…}}
});
```

PayWay envelopes carry a correlation id (`status.trace`). When present it is
emitted as `[payway] trace_id=<id> endpoint=<path>` so you can quote it back to
ABA support; the legacy text output remains byte-compatible with `DEBUG_PAYWAY`.

All logger output passes through `sanitizeForLog`, which redacts exact-match
secret keys **and** fuzzy key-name matches (anything containing
`secret/apikey/password/credential/hash/token` — e.g. a novel `secretField`
field is masked) plus raw 32+ hex-char values under unrecognized keys.

### Pattern 6: Resilience Options — Jitter and Circuit Breaker (TD-07)

Defaults keep retry behaviour deterministic for tests. Two opt-in upgrades harden
production transports:

```typescript
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'production',

  // Full jitter: wait random(0..delay) instead of fixed exponential delays so
  // fleet instances don't synchronize retries into a thundering herd.
  backoffJitter: 'full',

  // Transport circuit breaker per endpoint:
  //   closed → open after 5 consecutive network/5xx failures (configurable)
  //          → fail fast ~30s → single half-open probe → close or re-open.
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
});
```

While a circuit is open, calls throw `CircuitOpenError` immediately (before any
fetch), naming the endpoint and the remaining cooldown — surface it to your
monitoring rather than retrying blindly. Business errors never count as
breaker failures: only network errors and HTTP 5xx trip the circuit.

---

## Endpoint HTTP Behavior

The SDK automatically handles three different error response styles that PayWay uses:

1. **HTTP error status (4xx/5xx)** — returned by some endpoints such as `transaction-list-2` (400/403) and `check-transaction-2` (403 for invalid hash). The SDK extracts `paywayCode` from the response body's `status.code` field when present (string **or numeric**), and maps the response to the most specific error class (`PayWayBusinessError`, `PayWayRateLimitError`, etc.).
2. **HTTP 200 with a wrapped error** — returned by most merchant-portal and payment-gateway endpoints. The SDK inspects the body for `status.code`, `status` string (`FAILED`/`ERROR`), or a top-level `code` field and throws `PayWayAPIError` with `statusCode: 200`.
3. **Strict rate-limit responses (sandbox-verified 2026-08-25)** — endpoints with documented caps (e.g. transaction-detail 10/min, transaction-list 50/min, **get-transactions-by-mc-ref 10/60s — cap added to the SDK's throttle defaults in v1.3.6**) answer call N+1 within the window with HTTP **403** carrying a NUMERIC body `status.code` of `429` ("Rate limit exceeded for this request. Please try again later") and **no rate-limit headers** (no `X-RateLimit-*`, no `Retry-After`). The SDK classifies this as a typed, retryable `PayWayRateLimitError` — not an opaque permission error.

> ℹ️ **Important:** PayWay error codes like `PTL04` (refund validation) are returned inside the response body even on HTTP 400 responses. The SDK automatically extracts these into `error.paywayCode` so you can handle them programmatically without parsing `error.rawBody` yourself.

### Idempotency and duplicate protection

PayWay does not currently provide a Stripe-style `Idempotency-Key` mechanism for outbound SDK requests. This SDK therefore treats `tran_id` as the merchant's primary uniqueness key and expects the backend to handle duplicates by:

- generating a unique `tran_id` per payment attempt,
- persisting callback events or transaction outcomes durably,
- using `ON CONFLICT` / `UPSERT` / equivalent duplicate-safe database logic,
- treating webhook callbacks as the trusted final payment event.

If you need exact once semantics, implement server-side deduplication on `tran_id` or request-level metadata, and do not assume retries are automatically safe.

`checkout.purchase()` also accepts `retryPolicy: 'none'` to disable the SDK's automatic re-send of transient failures (network errors, 5xx, 429) for that call; the default `'transient'` preserves the historical retry behavior.

### Retry behavior

The SDK retries **only** transient failures by default (`maxRetries: 3`, base delay `retryDelayMs: 3000`):

| Failure type | Retried? | Notes |
|---|---|---|
| HTTP 5xx | ✅ Yes | Exponential backoff using `retryDelayMs` |
| Network errors / timeouts | ✅ Yes | `retryable: true` |
| Rate limit (HTTP 429, or sandbox's HTTP 403 + body code 429) | ✅ Yes | Honors `Retry-After` when present; otherwise paces from the SDK's own observed request window for endpoints with documented limits (1–10s), falling back to exponential backoff |
| Other HTTP 4xx | ❌ No | Client error — fix the request |
| HTTP 200 wrapped errors | ❌ No | Business error — inspect `paywayCode` |

> 💡 For endpoints with a documented cap, the SDK also tracks its own recent request timestamps per endpoint. When the gateway rejects with the undocumented 403+429 shape, retries wait just long enough for the locally observed window to free a slot, then re-send — a burst slightly over the cap recovers automatically instead of failing.

#### Behavior notes from the 2026-08-30 edge-case audit

All caveats found by the audit are fixed (see CHANGELOG "Unreleased"); the resulting behaviors worth knowing:

- **Empty 2xx bodies are rejected** with `PayWayAPIError "Empty response body…"` — only HTTP 204 resolves to `null` (a literal JSON `null` body also resolves as `null`).
- **Non-JSON 5xx error pages are retried** like any other 5xx: the HTTP-status check runs before the body-shape check, so CDN/load-balancer HTML pages keep their status code and retryability.
- **Callback/return URLs pointing at private or loopback addresses** (`127.0.0.1`, `10.x`, `192.168.x`, …) are rejected client-side with `PayWayConfigError`; opt out with `allowPrivateCallbackHosts: true` for on-prem gateways.

You can configure retry with:

```typescript
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  maxRetries: 3,
  retryDelayMs: 1000,
});
```

---

## Debugging Checklist

When something goes wrong, work through these steps in order:

### 1. Check Your Credentials

```bash
# Verify your environment variables are set
echo $PAYWAY_MERCHANT_ID
echo $PAYWAY_API_KEY

# Make sure they're the right environment
# Sandbox and Production have DIFFERENT credentials
```

### 2. Run the Verification Script

```bash
payway-sdk doctor --live
```

If this fails, follow the command's configuration, credential, or connectivity remedy. See Chapter 2 for setup.

### 3. Enable Debug Hooks

```typescript
const payway = new PayWay({
  // ... other config ...
  onRequest: (endpoint, body) => console.log('REQ:', endpoint, body),
  onResponse: (endpoint, status, body) => console.log('RES:', endpoint, status, body),
});
```

### 4. Check the HMAC Field Order

Different endpoints use **different field orders** for HMAC computation. Check `src/client.ts` for the field order of your endpoint.

### 5. Verify the Base64 Encoding

Some endpoints (especially Payout) use **hex** encoding for HMAC instead of Base64. The SDK handles this automatically, but if you're making raw curl requests, double-check the encoding.

### 6. Test with Postman or curl

Use the Postman collection or raw curl to eliminate SDK issues:

```bash
# Direct API test without the SDK
REQ_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
MERCHANT_ID="your_merchant_id"
API_KEY="your_api_key"

HASH=$(echo -n "${REQ_TIME}${MERCHANT_ID}order-123" | openssl dgst -sha512 -hmac "${API_KEY}" -binary | base64)

curl -v -X POST "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2" \
  -H "Content-Type: application/json" \
  -d "{\"req_time\":\"${REQ_TIME}\",\"merchant_id\":\"${MERCHANT_ID}\",\"tran_id\":\"order-123\",\"hash\":\"${HASH}\"}"
```

### 7. Review Sandbox Findings

PayWay has documented quirks (see `SANDBOX-FINDINGS.md` in the project root):
- `link-card` requires `application/x-www-form-urlencoded` (not JSON)
- The field for tokens is `pwt` (not `payment_token`)
- HMAC concatenation uses string `+` (not arithmetic `+`)

### 8. Sandbox Testing with Test Cards

Use PayWay's test card numbers to trigger specific payment outcomes in the sandbox environment:

| Test Card Number | Expected Outcome | What to Test |
|---|---|---|
| `[TBD: Obtain from ABA]` | **Approved** | Successful payment flow, webhook delivery, database update |
| `[TBD: Obtain from ABA]` | **Declined** | Error handling, user feedback, retry logic |
| `[TBD: Obtain from ABA]` | **Insufficient Balance** | Edge case handling, partial payment scenarios |

**Testing workflow:**
1. Use the test card number in your checkout form
2. Complete the payment flow on PayWay's sandbox page
3. Verify the webhook callback arrives at your server
4. Check that your database was updated correctly
5. Verify the customer sees the correct success/failure message

> 📋 **Source:** Test card numbers are available at [ABA PayWay Developer Portal - Test Cards](https://developer.payway.com.kh/resources-3305682f0).

> ⚠️ **Important:** Test cards only work in sandbox. Using them in production will result in declined transactions.

---

## What to Send ABA Support

When you need to contact ABA PayWay support about an error, include ALL of the following:

```
1. ✉️  The full error message and stack trace
     → Copy the exact error message, not your interpretation

2. 📤  The request payload (with API key REDACTED)
     → Replace your actual API key with "[REDACTED]"
     → Show all other fields exactly as sent

3. 📥  The response body
     → Copy the full JSON response from PayWay

4. 🏪  Your Merchant ID and environment
     → e.g., "Merchant ID: ec476910, Sandbox"

5. 🕐  Timestamp of the failed request
     → e.g., "2026-07-16T14:23:45.000Z"

6. 🌐  The endpoint you were calling
     → e.g., "POST /api/payment-gateway/v1/payments/check-transaction-2"
```

**Example Support Request:**
```
Subject: PayWay Sandbox - Wrong Hash Error on checkTransaction

Environment: Sandbox
Merchant ID: ec476910
Endpoint: check-transaction-2
Timestamp: 2026-07-16T14:23:45.000Z

Request Payload:
{
  "req_time": "2026-07-16T14:23:45.000Z",
  "merchant_id": "ec476910",
  "tran_id": "order-1737000000-abc123",
  "hash": "[REDACTED]"
}

Response:
HTTP 403 Forbidden
{
  "status": {
    "code": "1",
    "message": "Wrong Hash."
  }
}
```

---

## Network Debugging

### Check Outbound Connectivity

```bash
# Verify you can reach PayWay's sandbox
curl -I https://checkout-sandbox.payway.com.kh

# If this fails, check:
# 1. Internet connection
# 2. Firewall rules (allow outbound HTTPS on port 443)
# 3. DNS resolution (nslookup checkout-sandbox.payway.com.kh)
# 4. Proxy settings (HTTPS_PROXY environment variable)
```

### Check Inbound Connectivity (Webhooks)

```bash
# Verify your webhook URL is reachable from the internet
curl -I https://your-domain.com/api/payway-webhook

# If this fails, check:
# 1. ngrok is running (for local development)
# 2. Firewall allows inbound HTTPS
# 3. Your server is listening on the correct port
```

---

## Next Steps

- **For deployment** → [Chapter 13 — Deployment Checklist](./13-deployment-checklist.md)
- **For the webhook handler** → [Chapter 11 — Callbacks & Webhooks](./11-callbacks-and-webhooks.md)
- **For reference** → [Chapter 14 — Appendix: Code Snippets](./14-appendix-code-snippets.md)

> ← [Previous: Callbacks & Webhooks](./11-callbacks-and-webhooks.md) | [Next: Deployment Checklist →](./13-deployment-checklist.md)
