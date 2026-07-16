# Chapter 11 — Callbacks & Webhooks

> **Estimated reading time:** 15 minutes  
> **Goal:** Build a secure webhook endpoint that verifies PayWay callbacks and updates your database.

---

## What Is a Callback?

A **callback** (also called a **webhook**) is a server-to-server HTTP POST request sent by PayWay to your backend when a payment is confirmed, completed, or encounters an error. This is the **only reliable source of truth** for payment status.

> ⚠️ **Golden Rule:** Never mark an order as "Paid" based on the client-side return URL alone. Only the callback is cryptographically signed and trustworthy.

---

## Callback vs. Return URL

| | Return URL | Callback (Webhook) |
|---|---|---|
| **Who initiates it?** | Customer's browser (redirect) | PayWay's server (HTTP POST) |
| **Trustworthy?** | ❌ No — user can manipulate/skip it | ✅ Yes — HMAC-SHA512 signed |
| **When does it fire?** | After customer completes payment page | When payment is confirmed by PayWay's backend |
| **Can it be retried?** | No — one-time browser redirect | Yes — PayWay retries if you don't respond |
| **What should you do with it?** | Show a "Thank You" page | Update database, fulfill order |

---

## HMAC Signature Verification Algorithm

PayWay signs every callback with HMAC-SHA512 using your API key. The algorithm is **sorted-key verification**:

### Step-by-Step (What the SDK Does Internally)

1. **Extract the `hash` field** from the request body
2. **Remove `hash`** from the body (we don't include it in verification — that would be circular)
3. **Sort remaining keys alphabetically** (not the same order as the request was sent)
4. **Concatenate all values**, JSON-encoding any objects/arrays
5. **Compute HMAC-SHA512** with your API key as the secret
6. **Timing-safe comparison** between computed hash and received hash

> ⚠️ **Verified in sandbox:** PayWay uses **HMAC-SHA512** (not SHA-256). Some older documentation may incorrectly reference SHA-256. Our sandbox probes confirm SHA-512 with Base64 encoding and sorted-key verification.

---

## Implementation: Express.js Webhook Handler

### Minimal Version

```typescript
// routes/webhook.ts
import { Router } from 'express';
import { payway } from '../config/payway';

const router = Router();

/**
 * POST /api/payway-webhook
 *
 * Receives payment confirmation callbacks from PayWay.
 * This is the ONLY endpoint that should update order status to "paid".
 */
router.post('/', (req, res) => {
  // Step 1: Extract the received hash
  const receivedHash = req.body.hash;

  // Step 2: Remove hash from body for signature computation
  const { hash, ...bodyWithoutHash } = req.body;

  // Step 3: Verify signature (timing-safe comparison)
  const isValid = payway.verifyCallback(bodyWithoutHash, receivedHash);

  if (!isValid) {
    // ❌ Signature doesn't match — this might be an attacker, not PayWay
    console.warn('⚠️ Invalid callback signature rejected');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Step 4: Payment confirmed — PROCESS THE ORDER
  const { tran_id } = req.body;
  console.log(`✅ Payment confirmed for transaction: ${tran_id}`);

  // ⚠️ IMPORTANT: Respond with HTTP 200 as fast as possible!
  // Do heavy work (emails, inventory updates) AFTER responding.
  res.status(200).json({ received: true });

  // Step 5: Process the order asynchronously
  processOrderAsync(req.body).catch(err => {
    console.error('Order processing failed:', err);
  });
});

/**
 * Process order after acknowledging the callback.
 * This runs asynchronously — the webhook has already been acked.
 */
async function processOrderAsync(callbackData: Record<string, any>) {
  const { tran_id, amount, currency } = callbackData;

  // Example: Update database with idempotency
  // await db.query(`
  //   INSERT INTO orders (tran_id, status, amount, currency)
  //   VALUES ($1, 'paid', $2, $3)
  //   ON CONFLICT (tran_id) DO UPDATE
  //     SET status = 'paid', updated_at = NOW()
  //     WHERE orders.status != 'paid'
  // `, [tran_id, amount, currency]);

  // Example: Send confirmation email
  // await emailService.sendPaymentConfirmation(tran_id);

  // Example: Update inventory
  // await inventoryService.decrementStock(tran_id);
}

export default router;
```

### Full Production Version (with All Best Practices)

```typescript
// routes/webhook.ts
import { Router, raw } from 'express';
import { payway } from '../config/payway';
import { PayWayAPIError } from 'aba-payway-ts';

const router = Router();

/**
 * Webhook endpoint for PayWay payment callbacks.
 *
 * Security requirements:
 * - Uses standard express.json() middleware (parsed body)
 * - Verifies HMAC-SHA512 signature in timing-safe constant time
 * - Always responds HTTP 200 within 5 seconds
 * - Uses transaction ID as idempotency key
 * - Never trusts client-side return URLs
 */
router.post('/', async (req, res) => {
  // ============================================
  // 1. Validate the request has a body
  // ============================================
  if (!req.body || typeof req.body !== 'object') {
    console.error('❌ Webhook received without valid JSON body');
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // ============================================
  // 2. Extract and verify signature
  // ============================================
  const receivedHash = req.body.hash;

  if (!receivedHash) {
    console.error('❌ Webhook missing hash field');
    return res.status(400).json({ error: 'Missing signature' });
  }

  // Remove hash from body — we verify WITHOUT it
  const { hash, ...bodyWithoutHash } = req.body;

  // SDK performs sorted-key HMAC-SHA512 with timing-safe comparison
  const isValid = payway.verifyCallback(bodyWithoutHash, receivedHash);

  if (!isValid) {
    // Log the failed attempt for security auditing
    console.warn('⚠️ Invalid callback signature rejected', {
      tran_id: req.body.tran_id,
      sourceIp: req.ip,
      timestamp: new Date().toISOString(),
    });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // ============================================
  // 3. Extract transaction data
  // ============================================
  const { tran_id, amount, currency, status } = req.body;

  if (!tran_id) {
    console.error('❌ Webhook missing tran_id');
    return res.status(400).json({ error: 'Missing transaction ID' });
  }

  // ============================================
  // 4. Acknowledge receipt IMMEDIATELY
  //    PayWay expects HTTP 200 within ~5 seconds.
  //    Heavy processing happens AFTER this response.
  // ============================================
  res.status(200).json({
    received: true,
    tran_id: tran_id,
  });

  // ============================================
  // 5. Process the payment (AFTER responding)
  // ============================================
  try {
    await processPayment({
      tran_id,
      amount,
      currency,
      paywayStatus: status,
    });
  } catch (error) {
    // The callback was still valid — log but don't re-respond
    // PayWay will retry if we didn't return 200, but we already did
    console.error('❌ Post-webhook processing failed:', {
      tran_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Processes a confirmed payment.
 * Uses transaction ID as idempotency key to handle duplicate callbacks.
 */
async function processPayment(params: {
  tran_id: string;
  amount?: string;
  currency?: string;
  paywayStatus?: { code: string; message: string };
}) {
  const { tran_id, amount, currency, paywayStatus } = params;

  console.log(`💰 Processing payment: ${tran_id}`);

  // Step 1: Idempotent database update
  // Use ON CONFLICT to handle duplicate callbacks gracefully
  // await db.query(`
  //   INSERT INTO payment_events (tran_id, status, payload)
  //   VALUES ($1, $2, $3)
  //   ON CONFLICT (tran_id) DO NOTHING
  // `, [tran_id, 'received', JSON.stringify(params)]);

  // Step 2: Check if order exists and isn't already paid
  // const order = await db.query(
  //   'SELECT status FROM orders WHERE tran_id = $1',
  //   [tran_id]
  // );
  //
  // if (order.rows.length === 0) {
  //   console.warn(`Order not found for tran_id: ${tran_id}`);
  //   return;
  // }
  //
  // if (order.rows[0].status === 'paid') {
  //   console.log(`Duplicate callback ignored for: ${tran_id}`);
  //   return;
  // }

  // Step 3: Update order status
  // await db.query(
  //   'UPDATE orders SET status = $1, paid_at = NOW() WHERE tran_id = $2',
  //   ['paid', tran_id]
  // );

  // Step 4: Trigger post-payment actions (fire-and-forget)
  // These should be async and NOT block the webhook response
  try {
    // await emailService.sendConfirmation(tran_id);
    // await inventoryService.release(tran_id);
  } catch (err) {
    console.error(`Post-payment action failed for ${tran_id}:`, err);
  }

  console.log(`✅ Payment processed: ${tran_id}`);
}

export default router;
```

---

## Idempotency: Handling Duplicate Callbacks

PayWay **may send the same callback more than once**. Your handler must handle this gracefully.

### Pattern: `INSERT ... ON CONFLICT DO NOTHING` (PostgreSQL)

```sql
-- Track every webhook event (for audit/debugging)
CREATE TABLE payment_events (
  id          SERIAL PRIMARY KEY,
  tran_id     VARCHAR(255) NOT NULL UNIQUE,  -- UNIQUE = idempotency key
  status      VARCHAR(50) NOT NULL,
  payload     JSONB,
  received_at TIMESTAMP DEFAULT NOW()
);

-- Update order status (idempotent)
INSERT INTO orders (tran_id, status, amount, currency)
VALUES ($1, 'paid', $2, $3)
ON CONFLICT (tran_id)  -- If this transaction ID already exists...
DO UPDATE SET
  status = CASE
    WHEN orders.status != 'paid' THEN 'paid'  -- Only update if not already paid
    ELSE orders.status                        -- Already paid = no-op
  END,
  updated_at = NOW();
```

### Pattern: In-Memory Deduplication (for simple apps)

```typescript
// ⚠️ Only for single-process apps. Use database for multi-instance deployments.
const processedCallbacks = new Set<string>();

function isDuplicate(tranId: string): boolean {
  if (processedCallbacks.has(tranId)) {
    return true;
  }
  processedCallbacks.add(tranId);
  return false;
}

// In your webhook handler:
router.post('/', (req, res) => {
  // ... signature verification ...

  if (isDuplicate(req.body.tran_id)) {
    console.log(`Duplicate callback ignored: ${req.body.tran_id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // ... process payment ...
});
```

---

## Local Testing with curl

You can simulate a PayWay callback for testing:

```bash
# Fake callback payload (structure matches PayWay's actual callback)
TRAN_ID="order-1737000000-abc123"
AMOUNT="15.00"
API_KEY="your_api_key_here"

# PayWay sorts keys alphabetically and concatenates values
# Example body (without hash): { amount: "15.00", currency: "USD", tran_id: "..." }
# Sorted keys: amount, currency, tran_id
# Concatenated: "15.00" + "USD" + "order-1737000000-abc123"
CONCATENATED="15.00USD${TRAN_ID}"

# Compute the HMAC-SHA512 signature
HASH=$(echo -n "${CONCATENATED}" | openssl dgst -sha512 -hmac "${API_KEY}" -binary | base64)

echo "Computed hash: ${HASH}"

# Send the callback to your local server (via ngrok)
curl -X POST "https://abc123.ngrok.io/api/payway-webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"tran_id\": \"${TRAN_ID}\",
    \"amount\": \"${AMOUNT}\",
    \"currency\": \"USD\",
    \"hash\": \"${HASH}\"
  }"
```

> 💡 **Remember:** For local testing, your server must be exposed via ngrok (see Chapter 2). PayWay's callback happens from their servers to your server — `localhost` won't work.

---

## Security Checklist

| Check | Requirement |
|---|---|
| ✅ | Always verify HMAC signature before trusting callback data |
| ✅ | Use timing-safe comparison (the SDK does this automatically) |
| ✅ | Respond with HTTP 200 within 5 seconds |
| ✅ | Use `tran_id` as idempotency key (handle duplicates) |
| ✅ | Process heavy work after responding (async/background jobs) |
| ✅ | Use HTTPS in production (required by PayWay) |
| ✅ | Log all webhook events for auditing |
| ❌ | Never log the full API key |
| ❌ | Never trust the `returnUrl` redirect as payment confirmation |
| ❌ | Never update order status based on query parameters alone |

---

## Common Callback Issues

| Symptom | Likely Cause | Solution |
|---|---|---|
| "Invalid signature" every time | Wrong HMAC algorithm or API key | Confirm you're using HMAC-SHA512 (not SHA-256) |
| Callback never arrives | ngrok not running or wrong URL | Verify ngrok URL is accessible from outside |
| Callback arrives twice for same payment | Normal PayWay behavior | Implement idempotency (see above) |
| Server timeout during callback | Processing too slow before 200 response | Always respond 200 BEFORE heavy processing |
| Express body empty | Missing `express.json()` middleware | Add `app.use(express.json())` |

---

## Next Steps

- **For error handling** → [Chapter 12 — Error Handling & Debugging](./12-error-handling-and-debugging.md)
- **For deployment** → [Chapter 13 — Deployment Checklist](./13-deployment-checklist.md)
- **For the web implementation that uses callbacks** → [Chapter 3 — Web Implementation](./03-web-implementation.md)

> ← [Previous: UI Customization](./10-ui-customization.md) | [Next: Error Handling →](./12-error-handling-and-debugging.md)