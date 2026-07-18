# Chapter 12 — Error Handling & Debugging

> **Estimated reading time:** 15 minutes  
> **Goal:** Understand all the errors you might encounter and how to debug them effectively.

---

## Error Class Hierarchy

The SDK throws three types of errors:

```
PayWayError (base)
├── PayWayConfigError — Local configuration mistake
└── PayWayAPIError    — API returned an error
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

---

## Common PayWay Error Codes

| Code | Message | HTTP Status | Meaning | How to Fix |
|---|---|---|---|---|
| `"1"` | Wrong Hash | 403 | HMAC signature doesn't match | Check API key, field ordering, encoding (Base64 vs hex) |
| `"7"` | Invalid Request Data | 400/403 | Missing or malformed field | Check parameter types and required fields |
| `"15"` | Invalid Merchant | 403 | Merchant ID not recognized | Verify `merchantId` in your config |
| `"16"` | Invalid Amount | 400 | Amount format is wrong | Use `formatAmount()` helper; check decimal places |
| `"17"` | Invalid Currency | 400 | Currency not `'USD'` or `'KHR'` | Set `currency` to `'USD'` or `'KHR'` |
| `"22"` | Expired Transaction | 403 | Token or transaction has expired | Call `renew()` for tokens, or create new transaction |
| `"23"` | Transaction Not Found | 403 | No transaction with given `tran_id` | Check transaction ID, it may have been closed |
| `"24"` | Invalid Beneficiary Data | 403 | RSA-encrypted beneficiary data is wrong | Verify public key PEM and beneficiary account format |
| `"49"` | Invalid Request | 400/403 | Generic validation error | Check all parameters against the OpenAPI spec |
| `"96"` | Payee Not Found | 403 | Beneficiary account not whitelisted | Call `addBeneficiary()` first before payout |

> 📋 **Source:** These codes are consolidated from the OpenAPI spec's `ErrorStatus` schema and verified against sandbox probe responses.

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

---

## Endpoint HTTP Behavior

The SDK automatically handles two different error response styles that PayWay uses:

1. **HTTP error status (4xx/5xx)** — returned by some endpoints such as `transaction-list-2` (400/403) and `check-transaction-2` (403 for invalid hash). The SDK maps these to `PayWayAPIError` with `statusCode` set to the HTTP status and `paywayCode` undefined unless the body also contains a code.
2. **HTTP 200 with a wrapped error** — returned by most merchant-portal and payment-gateway endpoints. The SDK inspects the body for `status.code`, `status` string (`FAILED`/`ERROR`), or a top-level `code` field and throws `PayWayAPIError` with `statusCode: 200`.

### Idempotency and duplicate protection

PayWay does not currently provide a Stripe-style `Idempotency-Key` mechanism for outbound SDK requests. This SDK therefore treats `tran_id` as the merchant's primary uniqueness key and expects the backend to handle duplicates by:

- generating a unique `tran_id` per payment attempt,
- persisting callback events or transaction outcomes durably,
- using `ON CONFLICT` / `UPSERT` / equivalent duplicate-safe database logic,
- treating webhook callbacks as the trusted final payment event.

If you need exact once semantics, implement server-side deduplication on `tran_id` or request-level metadata, and do not assume retries are automatically safe.

### Retry behavior

The SDK retries **only** transient failures by default (`maxRetries: 0`):

| Failure type | Retried? | Notes |
|---|---|---|
| HTTP 5xx | ✅ Yes | Exponential backoff using `retryDelayMs` |
| Network errors / timeouts | ✅ Yes | `retryable: true` |
| HTTP 4xx | ❌ No | Client error — fix the request |
| HTTP 200 wrapped errors | ❌ No | Business error — inspect `paywayCode` |

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
npx tsx verify-credentials.ts
```

If this fails, your credentials or network are the issue. (See Chapter 2 for the script.)

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