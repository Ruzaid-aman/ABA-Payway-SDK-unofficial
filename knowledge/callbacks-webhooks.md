# Chapter 11 — Callbacks & Webhooks

> **Estimated reading time:** 15 minutes  
> **Goal:** Build a secure receiver for online checkout callbacks and a separate capture route for unverified offline ABA KHQR notifications.

## Flow at a glance

```mermaid
sequenceDiagram
    autonumber
    participant PayWay as 🏦 PayWay
    participant Endpoint as ⚙️ Your Callback Endpoint
    participant DB as 🗄️ Your Store

    PayWay->>Endpoint: POST callback + X-PAYWAY-HMAC-SHA512 (online)
    Endpoint->>Endpoint: verifyCallbackDetailed — timing-safe compare
    alt signature valid ✅
        Endpoint->>DB: dedupe by tran_id (idempotent)
        Endpoint-->>PayWay: 200 OK → PayWay will NOT retry
        Endpoint->>Endpoint: fulfill ONCE (only after APPROVED)
    else signature invalid ❌
        Endpoint-->>PayWay: 403 (log + drop)
    end

    PayWay->>Endpoint: POST /aba-payway-khqr-webhook (offline KHQR pushback — NO hash)
    Note over Endpoint: Untrusted by contract — never parse-and-trust.
    Endpoint->>PayWay: check-transaction before acting ✅
    Endpoint->>DB: reconcile (Missing callback ≠ non-payment; PayWay never retries)
```

Full diagram: Callback Flow.

---

## Callback Types and Trust Boundaries

A **callback** (also called a **webhook**) is a server-to-server HTTP POST request sent by PayWay to your backend. This chapter distinguishes the existing online checkout callback from an offline ABA KHQR notification. They do not have the same published authentication contract.

| Delivery | Route | Authentication and fulfilment rule |
|---|---|---|
| Online checkout callback | Your checkout callback route | Verify the documented `X-PAYWAY-HMAC-SHA512` signature before trusting it. |
| Offline ABA KHQR notification | `/aba-payway-khqr-webhook` | Capture the raw delivery and reconcile it; do **not** assume it has the online HMAC contract or mark an order paid until ABA supplies and you implement its actual verification contract. |

> ⚠️ **Golden Rule:** Never mark an order as "Paid" based on a client-side return URL. For offline KHQR notifications, parsing or receiving a payload is not payment verification.

---

## Online Checkout Callback vs. Return URL

| | Return URL | Callback (Webhook) |
|---|---|---|
| **Who initiates it?** | Customer's browser (redirect) | PayWay's server (HTTP POST) |
| **Trustworthy?** | ❌ No — user can manipulate/skip it | ✅ Online checkout: HMAC-SHA512 signed |
| **When does it fire?** | After customer completes payment page | When payment is confirmed by PayWay's backend |
| **Can it be retried?** | No — one-time browser redirect | **No guaranteed retry** — a single best-effort delivery (confirmed by ABA, 2026-09-12). A one-off retry (~10 s apart) has been observed in some flows but must not be designed for; recover via Check Transaction polling |
| **What should you do with it?** | Show a "Thank You" page | After online signature verification, update database and fulfil order |

---

## Online Checkout HMAC Signature Verification Algorithm

For the documented **online checkout callback**, PayWay signs the delivery with HMAC-SHA512 using your API key. The algorithm is **sorted-key verification**. This section does not apply to offline ABA KHQR notifications:

### Step-by-Step (What the SDK Does Internally)

1. **Extract the `X-PAYWAY-HMAC-SHA512` header** from the request
2. **Remove `hash`** from the body if present — the header is the source of truth, not the request body
3. **Sort remaining keys alphabetically** (not the same order as the request was sent)
4. **Concatenate all values**, JSON-encoding any objects/arrays
5. **Compute HMAC-SHA512** with your API key as the secret
6. **Timing-safe comparison** between computed hash and received hash

> ⚠️ **Verified for online checkout in sandbox:** PayWay uses **HMAC-SHA512** (not SHA-256). Some older documentation may incorrectly reference SHA-256. Our sandbox probes confirm SHA-512 with Base64 encoding and sorted-key verification.

### SDK helpers for verification (beyond the boolean)

- **`verifyCallback(body, sig)`** — boolean, what the snippets below use.
- **`verifyCallbackDetailed(body, sig, options?)`** (v1.3.0+) — returns
  `{ valid, reason }` so you can log WHY a delivery failed:
  `malformed_signature` | `empty_body` | `signature_mismatch`. Same options
  object (`stripHash: true` strips the `hash` field before verifying).
- **Wrong-hash diagnostics on API calls:** a gateway hash rejection throws
  **`PayWaySignatureError`** — a `PayWayAPIError` subclass whose message
  includes the endpoint's documented hash-field order (the hint that prevents
  the classic "which fields went into the HMAC" debugging session). COF/QR
  families: codes `1`/`01`/`PTL02` map here.
- **Binding failures:** COF `04`-family rejections carry per-field messages —
  catch `PayWayBusinessError` and read **`error.fieldErrors`**
  (`Record<string, string>`).

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
 * Receives online checkout payment confirmation callbacks from PayWay.
 * This is the ONLY endpoint that should update order status to "paid".
 */
router.post('/', (req, res) => {
  // Step 1: Extract the received HMAC from the online checkout callback header
  const receivedHash = req.headers['x-payway-hmac-sha512'] as string | undefined;

  if (!receivedHash) {
    console.error('❌ Webhook missing signature header');
    return res.status(400).json({ error: 'Missing signature' });
  }

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
 * Webhook endpoint for online checkout payment callbacks.
 *
 * Security requirements:
 * - Uses standard express.json() middleware (parsed body)
 * - For online checkout callbacks, verifies HMAC-SHA512 in timing-safe constant time
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
  const receivedHash = req.headers['x-payway-hmac-sha512'] as string | undefined;

  if (!receivedHash) {
    console.error('❌ Webhook missing signature header');
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
    // No guaranteed PayWay retry (single best-effort delivery, confirmed
    // 2026-09-12) — your Check Transaction reconciler recovers missed ones
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

## Idempotency: Handling Duplicate Online Checkout Callbacks

PayWay **may send the same online checkout callback more than once**. Your verified online handler must handle this gracefully.

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
  // ... online checkout signature verification ...

  if (isDuplicate(req.body.tran_id)) {
    console.log(`Duplicate callback ignored: ${req.body.tran_id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // ... process payment ...
});
```

---

## Offline ABA KHQR Notification Operations

The SDK listener keeps the offline route distinct from the online checkout webhook:

```text
POST /aba-payway-khqr-webhook
```

Before relying on it, publish a stable HTTPS URL and ask ABA to configure and whitelist that exact URL for the merchant. Record that request separately from local SDK configuration: `confirmed-by-merchant` is an operator declaration, not proof that ABA completed provisioning. `payway.khqr.validateCallbackSetup()` checks an HTTPS URL, the declaration, and a non-`unknown` verification strategy, but cannot contact ABA or prove whitelisting.

The listener persists headers, source IP, and the raw body before parsing. It preserves unknown fields and records parse errors so future ABA schema changes remain auditable. It intentionally accepts the published offline shape without requiring the online HMAC header. Treat the parsed `transaction_id` only as a deduplication key for the payment/delivery; use `merchant_ref` to locate the invoice or account and reconcile it through a verified ABA process before fulfilment. This capture listener must never decide that an order is paid. Do not use `tran_id`, online `status`, or `verifyCallback()` as assumptions for this offline notification.

For a production receiver, apply the verification method ABA actually provides (for example, a confirmed HMAC, mTLS, or an IP allowlist), store the evidence with the raw delivery, and keep the decision to mark an order paid in your application—not in the capture listener.

The supplied high-volume guidance says the same offline KHQR can be paid multiple times during its applicable validity; confirm that provider rule against the current merchant-issued ABA guideline. Regardless, distinguish these cases safely:

- The same `transaction_id` is delivered or processed again: idempotently return the stored outcome; do not create another Payment.
- A new `transaction_id` has the same `merchant_ref`: store a new Payment. It may be a legitimate installment or a real overpayment, not a duplicate callback.
- The reference is unknown or the currency conflicts with the invoice: retain the Payment in an exception state for investigation.

Keep Invoice, Payment, and Payment Allocation records separate. Allocate verified payments atomically, recompute the balance, and route excess value through the merchant's overpayment, credit, or refund policy.

Callbacks are the event path, not the only recovery path. If a notification is missing, query `get-transactions-by-mc-ref` using the same recovery-safe reference. The endpoint returns at most 50 matches, exposes no pagination parameter, and is limited to 10 requests per minute. A saturated 50-row response may be incomplete, so compare it with the merchant ledger rather than declaring reconciliation complete.

---

## Local Testing with curl

You can simulate an online checkout PayWay callback for testing:

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

> 💡 **Remember:** For local testing, your server must be exposed via ngrok (see Chapter 2). The online checkout callback happens from PayWay's servers to your server — `localhost` won't work.

---

## Security Checklist

| Check | Requirement |
|---|---|
| ✅ | For online checkout callbacks, always verify the HMAC signature before trusting data |
| ✅ | Use timing-safe comparison (the SDK does this automatically) |
| ✅ | Respond with HTTP 200 within 5 seconds |
| ✅ | For online checkout callbacks, use `tran_id` as the idempotency key |
| ✅ | Process heavy work after responding (async/background jobs) |
| ✅ | Use HTTPS in production (required by PayWay) |
| ✅ | Log all webhook events for auditing |
| ❌ | Never log the full API key |
| ❌ | Never trust an online `returnUrl` redirect as payment confirmation |
| ❌ | Never update order status based on query parameters alone |
| ❌ | Never assume offline KHQR notifications use the online HMAC header or schema |
| ❌ | Never treat local callback configuration as ABA whitelisting confirmation |

---

## Common Callback Issues

| Symptom | Likely Cause | Solution |
|---|---|---|
| Online callback "Invalid signature" every time | Wrong HMAC algorithm or API key | Confirm you're using HMAC-SHA512 (not SHA-256) |
| Online callback never arrives | ngrok not running or wrong URL | Verify ngrok URL is accessible from outside |
| Online callback arrives twice for same payment | Normal PayWay behavior | Implement idempotency (see above) |
| Server timeout during online callback | Processing too slow before 200 response | Always respond 200 BEFORE heavy processing |
| Express body empty | Missing `express.json()` middleware | Add `app.use(express.json())` |

---

## Next Steps

- **For local webhook testing** → [Chapter 16 — Webhook Setup with the CLI](payway-sdk docs webhook-setup) — quick way to capture and inspect callbacks during development; the [Local Webhook Workbench](payway-sdk docs webhook-setup) in the same chapter sends correctly-signed fixture callbacks (`webhook trigger`), forwards captures to your app (`--forward-to`), replays stored records (`webhook resend`), and explains failed verifications (`webhook verify-callback`) — all without the ABA Simulator
- **For error handling** → [Chapter 12 — Error Handling & Debugging](payway-sdk docs errors-and-debugging)
- **For deployment** → [Chapter 13 — Deployment Checklist](payway-sdk docs deployment-checklist)
- **For the web implementation that uses callbacks** → [Chapter 3 — Web Implementation](payway-sdk docs web-implementation)

> ← [Previous: UI Customization](payway-sdk docs ui-customization) | [Next: Error Handling →](payway-sdk docs errors-and-debugging)

---

## Credentials-on-File (CoF) callbacks — the pwt delivery channel

Linking an account (`link-account`) or a card (`link-card`) never returns the
payment token (`pwt`) in the API response — the token is delivered later, by
POST to the `callback_url` supplied with the link request. This is the ONLY
delivery channel: a link request without a reachable public-HTTPS
`callback_url` produces a token you can never retrieve (the SDK warns on
omission).

- **Expected body schema: UNVERIFIED live (open question Q18).** The live docs
  describe an HMAC-signed callback (verify with
  `verifyCallback(body, signature, { stripHash: true })`), but the exact
  field set has never been captured: the sandbox merchant profile is not
  enabled for token flags, so no link completes and no callback fires
  (SANDBOX-FINDINGS §24 LC-1). Validate heuristically and log the raw body on
  first receipt.
- **No callback fires for a FAILED link attempt** (live 2026-09-12, §24 LC-4):
  two 104 error-page attempts with a live tunneled `callback_url` produced
  zero deliveries. Silence after a hosted error page is expected — do not
  wait for a failure callback; surface the hosted outcome instead (the SDK's
  `linkCard()` error now decodes it into `error.hostedPage`, §24 LC-2).
- **Charges** (`cof charge`) can also carry a `callback_url`; the transaction
  itself is verifiable immediately via `check-transaction(tran_id)` — the
  callback is a notification, not the source of truth.

---

## Payment Link pushbacks (`return_url`) — no HMAC

Payment links do **not** use the checkout webhook contract. On payment, PayWay
POSTs directly to the link's decoded `return_url` (live-captured 2026-09-06):

```json
POST <return_url>
Content-Type: application/json; charset=utf-8
User-Agent: PayWayApp/3.0

{ "tran_id": "178865526240157", "status": 0, "merchant_ref_no": "plvr-v1-mtp34wx4" }
```

- **No `hash` field — live-verified.** Treat the pushback as a notification and
  verify the payment via `check-transaction(tran_id)`; `verifyCallback()` does
  not apply.
- `status` is the numeric `0` (APPROVED), not the `"00"` string the official
  sample shows — accept both. One pushback per completed payment.
- Receiver requirements: accept `POST` + `application/json`, answer 200 fast.

Receiver setup (tunnel, storage, routes) is covered in
[16. Webhook Setup](payway-sdk docs webhook-setup); the full payment-link
lifecycle in [17. Payment Link API](payway-sdk docs payment-link) §17.7.
