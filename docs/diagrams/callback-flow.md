# Callback Flow Diagram

This sequence diagram shows the secure webhook verification process — from PayWay's server to your order fulfillment.

```mermaid
sequenceDiagram
    participant PayWay as 🏦 PayWay Server
    participant Endpoint as ⚙️ Your /api/payway-webhook
    participant Crypto as 🔐 verifyCallback()
    participant DB as 🗄️ Database
    participant Workers as 📨 Background Jobs

    PayWay->>Endpoint: POST /api/payway-webhook
    Note right of PayWay: JSON body with:<br/>tran_id, amount, currency,<br/>status, hash

    Endpoint->>Endpoint: Extract hash from body

    alt Missing body or hash
        Endpoint-->>PayWay: HTTP 400 Bad Request
        Note right of Endpoint: PayWay will NOT retry 4xx
    end

    Endpoint->>Endpoint: Remove hash from body
    Note right of Endpoint: bodyWithoutHash =<br/>{ ...body, hash: undefined }

    Endpoint->>Crypto: verifyCallback(bodyWithoutHash, hash)

    Crypto->>Crypto: Sort keys alphabetically
    Note right of Crypto: e.g.: amount, currency,<br/>tran_id (alphabetical order)

    Crypto->>Crypto: Concatenate all values
    Note right of Crypto: JSON.stringify()<br/>objects and arrays

    Crypto->>Crypto: HMAC-SHA512(concatenated, apiKey)
    Note right of Crypto: Result encoded as Base64

    Crypto->>Crypto: timingSafeEqual(computed, received)
    Note right of Crypto: Constant-time comparison<br/>prevents timing attacks

    alt Signature INVALID ❌
        Crypto-->>Endpoint: false
        Endpoint-->>PayWay: HTTP 400 Bad Request
        Note right of Endpoint: Log for security audit<br/>Include: IP, timestamp, tran_id
    end

    Crypto-->>Endpoint: true (signature valid ✅)

    Endpoint->>Endpoint: Extract tran_id from body

    Endpoint-->>PayWay: HTTP 200 OK ✅
    Note left of PayWay: Ack received.<br/>PayWay stops retrying.

    Endpoint->>DB: INSERT INTO orders (tran_id, status='paid')<br/>ON CONFLICT (tran_id) DO NOTHING
    Note right of DB: Idempotency: duplicate<br/>callbacks are no-ops

    DB-->>Endpoint: Insert complete

    Endpoint->>Workers: Queue: send confirmation email
    Endpoint->>Workers: Queue: update inventory
    Note right of Workers: These run asynchronously.<br/>The webhook already returned 200.

    Workers->>Workers: Handle email delivery
    Workers->>DB: Log fulfillment events
```

---

## Step-by-Step: What Happens in the Webhook

### 1. Arrival
PayWay POSTs JSON to your webhook URL with a `hash` field.

### 2. Verification (Critical)
The SDK's `verifyCallback()` performs:
- **Sort keys alphabetically** — `amount` before `currency` before `tran_id`
- **Concatenate values** — objects are `JSON.stringify()`'d
- **Compute HMAC-SHA512** — with your API key, output as Base64
- **Timing-safe comparison** — prevents attackers from guessing the signature one character at a time

### 3. Response (Must Be Fast)
Respond with **HTTP 200** as soon as signature is verified. PayWay expects a response within ~5 seconds.

### 4. Processing (After Response)
After responding, update your database and trigger fulfillment. Use `ON CONFLICT DO NOTHING` to handle duplicate callbacks.

---

## Related Code

**SDK source:**
```typescript
// src/auth.ts — verifyCallbackSignature()
export function verifyCallbackSignature(
  body: Record<string, any>,
  receivedSignature: string,
  apiKey: string
): boolean {
  const sortedKeys = Object.keys(body).sort();
  const concatenated = sortedKeys
    .map((key) => {
      const val = body[key];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    })
    .join('');

  const computed = crypto.createHmac('sha512', apiKey)
    .update(concatenated)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(receivedSignature)
  );
}
```

---

## Related Sections

- [Chapter 11 — Callbacks & Webhooks](../guides/11-callbacks-and-webhooks.md) — Full implementation guide
- [Chapter 12 — Error Handling & Debugging](../guides/12-error-handling-and-debugging.md) — Common callback errors
- [Chapter 13 — Deployment Checklist](../guides/13-deployment-checklist.md) — Go-live verification

> ← [Back to Documentation Home](../README.md)