# Payment Lifecycle Diagram

This sequence diagram shows the complete payment flow from customer to PayWay and back, including the critical distinction between the **return URL** (untrusted, client-side) and the **webhook callback** (trusted, server-side).

```mermaid
sequenceDiagram
    participant Customer as 🧑 Customer
    participant Frontend as 🖥️ Frontend<br/>(Browser/App)
    participant Backend as ⚙️ Your Backend<br/>(Node.js + SDK)
    participant PayWay as 🏦 ABA PayWay<br/>(Sandbox/Prod)
    participant DB as 🗄️ Your Database

    Note over Customer,DB: === Phase 1: Initiation ===

    Customer->>Frontend: Clicks "Pay Now"
    Frontend->>Backend: POST /api/create-checkout
    Note right of Backend: Pass order details:<br/>amount, items, currency
    Backend->>Backend: Build transaction params
    Backend->>Backend: SDK signs with HMAC-SHA512
    Backend-->>Frontend: Return signed form data (HTML fields)
    Note left of Frontend: Frontend renders hidden form<br/>or redirects automatically

    Note over Customer,DB: === Phase 2: Payment ===

    Frontend->>PayWay: POST signed form to PayWay checkout
    Note right of PayWay: PayWay verifies HMAC signature<br/>and presents payment page
    Customer->>PayWay: Enters card details / authenticates with ABA Pay
    PayWay->>PayWay: Processes payment
    PayWay-->>Customer: Redirect browser to your return URL
    Note left of Customer: ⚠️ Do NOT trust this alone!<br/>User can close tab before redirect

    Note over Customer,DB: === Phase 3: Confirmation (Parallel) ===

    par Client-Side Redirect
        Customer->>Frontend: Arrives at return URL
        Frontend->>Frontend: Show "Thank You" page
        Frontend->>Backend: Optional: GET /api/order-status/{tran_id}
        Backend->>DB: Read current order status
        Backend-->>Frontend: Return status (pending/paid/failed)
    and Server-Side Callback (Trusted)
        PayWay->>Backend: POST /api/payway-webhook (callback)
        Note right of Backend: Includes hash field for verification
        Backend->>Backend: Extract hash from body
        Backend->>Backend: Remove hash, sort keys alphabetically
        Backend->>Backend: Concatenate values, compute HMAC-SHA512
        Backend->>Backend: Timing-safe compare with received hash
        alt Signature Valid ✅
            Backend->>DB: UPDATE orders SET status='paid' WHERE tran_id=$1
            Note right of DB: Use ON CONFLICT DO NOTHING<br/>for idempotency
            Backend->>PayWay: HTTP 200 OK
            PayWay->>PayWay: Callback acknowledged
        else Signature Invalid ❌
            Backend->>PayWay: HTTP 400 Bad Request
            Note right of Backend: Log for security audit
        end
    end

    Note over Customer,DB: === Phase 4: Fulfillment ===

    Backend->>Backend: Trigger order fulfillment<br/>(send email, update inventory)
    Backend->>Customer: Send order confirmation email
```

---

## Key Takeaways from This Diagram

### 1. Two Confirmation Channels
PayWay uses **two separate mechanisms** to notify you about a payment:

- **Client-side redirect (return URL):** The customer's browser is redirected to your website after payment. This is **untrustworthy** — the user can close the tab, manipulate the URL, or the redirect may never fire.
- **Server-side callback (webhook):** PayWay's servers POST directly to your backend. This is **cryptographically signed** and is the only reliable source of truth.

### 2. Idempotency Matters
PayWay may send callbacks more than once for the same transaction. You must handle duplicate webhooks gracefully using the `tran_id` as an idempotency key. In the diagram, this is shown as `ON CONFLICT DO NOTHING`.

### 3. Fast 200 Response
Your webhook handler must respond with HTTP 200 as quickly as possible. Any heavy processing (sending emails, updating inventory) should happen **after** responding to PayWay, or in a background job queue.

### 4. The HMAC Verification Steps

For the webhook callback, the verification algorithm is:

1. Extract the `hash` field from the request body
2. Remove `hash` from the body (don't include it in verification)
3. Sort the remaining keys **alphabetically**
4. Concatenate all values (JSON-encoding objects/arrays)
5. Compute HMAC-SHA512 with your API key
6. Compare using timing-safe comparison

This is handled automatically by `payway.verifyCallback()` in the SDK.

---

## Related Sections

- [Chapter 1 — Overview & Concepts](../01-overview-and-concepts.md) — High-level concepts
- [Chapter 11 — Callbacks & Webhooks](../11-callbacks-and-webhooks.md) — Detailed webhook implementation
- [Chapter 3 — Web Implementation](../03-web-implementation.md) — Building your first checkout flow

> ← [Back to Documentation Home](../README.md)