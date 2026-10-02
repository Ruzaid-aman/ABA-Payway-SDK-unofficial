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

Customer Module / Printed QR payments are delivered to the same KHQR route. Start the local capture receiver with `payway-sdk setup-webhook --tunnel --non-interactive`; wait for its public readiness probe, then use the generated `/aba-payway-khqr-webhook` route for sandbox verification. The SDK stores the raw delivery and customer-QR metadata; verify approved state and reconcile `merchant_ref` before fulfilment. Use `payway-sdk webhook status` or `webhook stop` only for the locally owned development receiver.

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

  // Step 4: a VALID SIGNATURE authenticates the delivery — it is NOT yet
  // proof of payment. Check payment_status_code (0 = APPROVED) and the
  // stored order before fulfilling; see the production version below.
  const { tran_id } = req.body;
  console.log(`✅ Signed callback received for transaction: ${tran_id}`);

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

### Production Version: Durable Acceptance Before Acknowledgement

A valid signature authenticates a **delivery**; it does not itself mean the
payment is APPROVED or that the money belongs to one of your orders. The
example below enforces the full chain — verify, match to a stored order,
accept the event durably, fulfill once atomically — and only then ACKs:

```typescript
// routes/webhook.ts
import { Router } from 'express';
import { payway } from '../config/payway';

const router = Router();

/**
 * Online checkout payment callback — the ONLY endpoint that fulfills orders.
 *
 * Contract (all steps fail closed; a rejected/parked delivery never
 * fulfills anything):
 *   1. authenticate the delivery (HMAC, timing-safe);
 *   2. accept the delivery EXACTLY ONCE into a durable inbox — before any
 *      decision, so a crash after acceptance loses nothing and a redelivery
 *      is a harmless duplicate;
 *   3. require APPROVED and match amount/currency against the STORED order
 *      (the body's amounts are claims, not truth);
 *   4. fulfill at most once via a single conditional UPDATE;
 *   5. enqueue external work (email/inventory) in an outbox — never inline;
 *   6. ACK last: PayWay allows ~5 s and everything above is local-DB fast.
 */
router.post('/', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  const receivedHash = req.headers['x-payway-hmac-sha512'];
  if (!receivedHash) {
    return res.status(400).json({ error: 'Missing signature' });
  }

  // 1. Authenticate. The body carries no hash field on the online route —
  //    verifyCallbackDetailed compares the header against the body as-is.
  const verdict = payway.verifyCallbackDetailed(req.body, receivedHash);
  if (!verdict.valid) {
    console.warn('Invalid callback signature rejected', { reason: verdict.reason });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const tranId = typeof req.body.tran_id === 'string' ? req.body.tran_id : '';
  const statusCode = Number(req.body.payment_status_code);
  const statusText = String(req.body.payment_status ?? '');

  // 2. Accept exactly once, BEFORE deciding anything (deliveryId should be
  //    the provider's delivery/event id when one exists; the fallback uses
  //    tran_id + the STATUS STRING — PRE-AUTH shares code 0 with APPROVED,
  //    so the bare numeric code would collide and let one suppress the
  //    other). INSERT ... ON CONFLICT returns 0 rows for a replay —
  //    ack it and stop.
  const deliveryId = `${tranId}:${statusText || statusCode}`;
  const accepted = await db.query(
    `INSERT INTO payment_events (delivery_id, tran_id, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (delivery_id) DO NOTHING`,
    [deliveryId, tranId, JSON.stringify(req.body)],
  );
  if (accepted.rowCount === 0) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // 3. Require APPROVED (code 0; the string distinguishes PRE-AUTH, which
  //    shares code 0). Anything else is recorded but fulfills nothing.
  if (statusCode !== 0 || statusText === 'PRE-AUTH') {
    console.warn('Non-approved callback recorded', { tranId, statusCode });
    return res.status(200).json({ received: true, fulfilled: false });
  }

  // 4. Match the claim to the stored order — amounts come from YOUR order
  //    row, never from the callback body. A mismatch parks the order for a
  //    human instead of fulfilling the wrong value.
  const order = await db.query(
    `SELECT order_id, amount, currency, status FROM orders WHERE tran_id = $1`,
    [tranId],
  );
  if (order.rowCount === 0) {
    console.error('APPROVED callback for unknown order', { tranId });
    return res.status(200).json({ received: true, fulfilled: false });
  }
  const row = order.rows[0];
  const paidAmount = Number(req.body.payment_amount);
  const paidCurrency = String(req.body.payment_currency ?? '');
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - row.amount) > 1e-9 || paidCurrency !== row.currency) {
    console.error('Amount/currency mismatch — order parked', { tranId, expected: row.amount, claimed: paidAmount });
    await db.query(`UPDATE orders SET status = 'needs_review' WHERE tran_id = $1`, [tranId]);
    return res.status(200).json({ received: true, fulfilled: false });
  }

  // 5. Fulfill at most once: the conditional UPDATE is the guard. Exactly
  //    one concurrent delivery flips the row; rowcount 0 means someone
  //    else (or an earlier delivery) already did.
  const fulfilled = await db.query(
    `UPDATE orders
       SET status = 'paid', paid_at = NOW(), paid_amount = $2, paid_currency = $3
     WHERE tran_id = $1 AND status <> 'paid'`,
    [tranId, row.amount, row.currency],
  );
  if (fulfilled.rowCount === 1) {
    // 6. Outbox: the fulfillment side effects (email, stock, invoicing) are
    //    enqueued in the same logical moment as the state flip and run from
    //    a worker — never inline in the webhook request.
    await db.query(
      `INSERT INTO fulfillment_outbox (tran_id, order_id) VALUES ($1, $2)`,
      [tranId, row.order_id],
    );
  }

  // ACK last — everything above is local-database fast (well inside the ~5 s
  // budget). From here the event is durable: PayWay does NOT retry failed
  // deliveries (single best-effort), but your reconciliation poller covers
  // any delivery that never arrived at all (see the reconciliation section).
  return res.status(200).json({ received: true, fulfilled: fulfilled.rowCount === 1 });
});

export default router;
```

Schema sketch for the durable pieces:

```sql
CREATE TABLE payment_events (
  delivery_id VARCHAR(255) PRIMARY KEY,   -- idempotency key for deliveries
  tran_id     VARCHAR(255) NOT NULL,
  payload     JSONB,
  received_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE fulfillment_outbox (
  id         SERIAL PRIMARY KEY,
  tran_id    VARCHAR(255) NOT NULL,
  order_id   VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP           -- NULL = pending for the worker
);
```

A worker loop drains `fulfillment_outbox WHERE processed_at IS NULL`, performs
the email/inventory work, and marks the row — so a crash anywhere loses
nothing and repeats nothing. The runnable reference implementation of this
exact model (demo simulator, missed-callback reconciliation, duplicate
delivery and amount-mismatch fixtures) lives in
`examples/first-payment` — prefer adapting it over editing conflicting
templates.

**What this handler refuses to do:** fulfill on a valid signature alone;
fulfill non-approved or PRE-AUTH codes; trust body amounts/currencies over
the stored order; fulfill twice under concurrent duplicate deliveries; lose
an accepted event to a crash between acceptance and work; do slow external
work inside the ~5-second acknowledgement window.

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

- **For local webhook testing** → [Chapter 16 — Webhook Setup with the CLI](webhook-setup.md) — quick way to capture and inspect callbacks during development; the [Local Webhook Workbench](webhook-setup.md#local-webhook-workbench) in the same chapter sends correctly-signed fixture callbacks (`webhook trigger`), forwards captures to your app (`--forward-to`), replays stored records (`webhook resend`), and explains failed verifications (`webhook verify-callback`) — all without the ABA Simulator
- **For error handling** → [Chapter 12 — Error Handling & Debugging](errors-and-debugging.md)
- **For deployment** → [Chapter 13 — Deployment Checklist](deployment-checklist.md)
- **For the web implementation that uses callbacks** → [Chapter 3 — Web Implementation](web-implementation.md)

> ← [Previous: UI Customization](ui-customization.md) | [Next: Error Handling →](errors-and-debugging.md)

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
  (SANDBOX-FINDINGS §24 LC-1). Confirm the exact signature and customer/request
  association schema with ABA before accepting a delivered token. Capture only
  masked, allowlisted diagnostics in protected merchant storage; do not log raw
  token-bearing callback bodies. A heuristic schema check does not establish trust.
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
[16. Webhook Setup](webhook-setup.md); the full payment-link
lifecycle in [17. Payment Link API](payment-link.md) §17.7.
