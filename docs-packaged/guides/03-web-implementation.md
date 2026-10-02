# Chapter 3 — Web Implementation

> **Estimated reading time:** 20 minutes
> **Goal:** Build a complete checkout flow for a web application using the PayWay SDK.

## Flow at a glance

```mermaid
sequenceDiagram
    autonumber
    participant Browser as 🌐 Browser
    participant Backend as ⚙️ Your Backend
    participant PayWay as 🏦 PayWay

    Browser->>Backend: POST /checkout (order details)
    Backend->>Backend: build signed payload (hash via SDK)
    Backend->>PayWay: purchase payload ready (server-side only)
    Backend-->>Browser: hidden auto-submit form (merchant_id + hash)
    Browser->>PayWay: POST purchase form (payment_gate=0 → hosted page)
    Customer->>PayWay: completes payment on hosted page

    par customer continuation (unverified, UX only)
        PayWay-->>Browser: continue_success_url navigation
        Browser->>Backend: GET merchant result → show "processing"
    and trusted server callback
        PayWay-->>Backend: POST callback + X-PAYWAY-HMAC-SHA512
        Backend->>Backend: verifyCallbackDetailed → dedupe → ✅ fulfill once
    end

    Note over Backend,PayWay: Verify signed callbacks and recover by inquiry; navigation is not payment evidence.
```

Full diagram: Payment Lifecycle · Callback details: [Chapter 11](../../knowledge/callbacks-webhooks.md).

---

## Architecture Overview

The web integration pattern follows a **frontend → backend → PayWay** architecture:

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌───────────────────────┐
│   Frontend (HTML)    │────▶│   Backend (Node.js + SDK) │────▶│   ABA PayWay API      │
│   No secrets stored  │◀────│   Holds API key          │◀────│   Sandbox or Prod     │
└─────────────────────┘     └──────────────────────────┘     └───────────────────────┘
```

The frontend **never calls PayWay directly** with credentials. Instead:
1. Frontend requests a signed checkout payload from your backend
2. Backend uses the SDK to sign and return form fields
3. Frontend submits those fields to PayWay's checkout page

---

## Step 1: Create a Backend Endpoint for Checkout Initiation

Create an API endpoint on your server that the frontend can call to initiate a checkout:

```typescript
// routes/checkout.ts
import { Router } from 'express';
import { payway } from '../config/payway';

const router = Router();

/**
 * POST /api/checkout/create
 *
 * The frontend calls this when the user clicks "Pay Now".
 * This endpoint:
 * 1. Builds the transaction parameters (amount, items, etc.)
 * 2. Uses the SDK to apply HMAC-SHA512 signing
 * 3. Returns the signed payload (form fields + hash) to the frontend
 *
 * The frontend then submits these fields directly to PayWay's checkout URL.
 */
router.post('/create', (req, res) => {
  try {
    // PayWay requires a unique transaction ID per payment attempt.
    // Use a prefix + timestamp + random suffix to avoid collisions.
    const transactionId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Build and sign the transaction payload using the SDK
    const signedPayload = payway.checkout.createTransaction({
      // Unique identifier for this payment (required)
      transactionId,

      // The amount to charge, in the specified currency (required)
      amount: req.body.amount, // e.g., 15.00

      // Currency: 'USD' or 'KHR' (defaults to 'USD')
      currency: req.body.currency || 'USD',

      // Customer details (optional but recommended for payment records)
      firstname: req.body.firstName,
      lastname: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,

      // Payment method options:
      // - 'cards'        → Credit/debit cards (Visa, Mastercard, etc.)
      // - 'abapay_khqr'  → QR code via ABA Pay / KHQR (default)
      // - 'alipay'       → Alipay wallet
      // - 'wechat'       → WeChat Pay wallet
      // - 'google_pay'   → Google Pay
      // - 'abapay_khqr_deeplink' → Deep link into ABA Pay app
      paymentOption: req.body.paymentOption || 'abapay_khqr',

      // Line items for the receipt (optional)
      items: req.body.items || [
        { name: 'Product Purchase', quantity: 1, price: req.body.amount },
      ],

      // Transaction type:
      // - 'purchase'   → Standard one-time payment (default)
      // - 'pre-auth'   → Hold funds without capturing
      type: 'purchase',

      // Purchase notification endpoint; not the customer success page
      returnUrl: `${process.env.BASE_URL}/api/payway/callback`,

      // Where the customer goes if they click "Cancel" on PayWay
      cancelUrl: `${process.env.BASE_URL}/payment-cancelled`,

      // Optional: Skip PayWay's intermediate success page
      skipSuccessPage: 0,

      // Customer continuation from the hosted success page
      continueSuccessUrl: `${process.env.BASE_URL}/order-confirmation?tran_id=${transactionId}`,
    });

    // The SDK returns an object with all form fields plus the HMAC hash signature.
    // Example returned shape:
    // {
    //   tran_id: "order-1737000000-abc123",
    //   amount: "15.00",
    //   currency: "USD",
    //   firstname: "John",
    //   lastname: "Doe",
    //   email: "john@example.com",
    //   phone: "012345678",
    //   payment_option: "abapay_khqr",
    //   merchant_id: "ec476910",
    //   req_time: "2026-07-16T12:00:00.000Z",
    //   hash: "base64encodedhmacsha512signature...",
    //   ...other fields
    // }

    res.json({
      success: true,
      // Pass the signed payload back to the frontend
      payload: signedPayload,
      // The PayWay base URL for the current environment
      // The frontend will POST the form to this URL.
      // NOTE: the SDK has no public base-URL getter — resolve it the same way
      // the SDK does (config baseUrl > PAYWAY_BASE_URL > PAYWAY_ENV > default).
      checkoutUrl: process.env.PAYWAY_BASE_URL ?? 'https://checkout-sandbox.payway.com.kh',
    });
  } catch (error) {
    console.error('Checkout creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize payment. Please try again.',
    });
  }
});

// Export the router to mount in your Express app
export default router;
```

---

## Step 2: Frontend Checkout Form

The frontend renders a hidden form pre-filled with the signed payload from the backend, then submits it to PayWay.

There are **two approaches** for the frontend checkout:

| Approach | Description | When to Use |
|---|---|---|
| **Popup Modal** | Open PayWay's checkout in an overlay using `checkout2-0.js` and `AbaPayway.checkout()` | Expected default web popup journey in the supplied Integration Team guidance |
| **Full-page hosted form POST** | Navigate to PayWay's hosted page through the signed form | Selected supported hosted journey; do not replace the popup when the reviewed flow expects one |

Follow [default checkout requirements](../../knowledge/integration-ui.md#default-e-commerce-checkout-requirements): all profile-enabled methods visible/selectable, exact ABA KHQR title/subtitle, current assets, and Terms & Conditions / Refund Policy links plus an acceptance checkbox above Pay. Block frontend submission until checked. The examples below illustrate transport, not a complete approved merchant UI; fixed demo amounts/methods must be adapted to authorized, server-priced orders and the enabled profile. Complete the consent step before any automatic form POST.

### Skip the boilerplate: `getCheckoutFormHtml()`

The SDK can generate the complete signed form document for either approach — the hidden fields and HMAC are byte-identical to `createTransaction()`, and the action URL follows your configured environment/base URL. It is a local, synchronous call (no network):

```typescript
// Server-side (Express) — full-page redirect
app.get('/checkout/:orderId', (req, res) => {
  const html = payway.checkout.getCheckoutFormHtml({
    transactionId: req.params.orderId,
    amount: 15.0,
    currency: 'USD',
    returnUrl: 'https://mywebsite.com/api/payway/callback',
    continueSuccessUrl: 'https://mywebsite.com/order-confirmation',
  }, { autoSubmit: true }); // same-tab navigation to the hosted page
  res.type('html').send(html);
});

// Popup modal (official AbaPayway plugin UX)
const html = payway.checkout.getCheckoutFormHtml(params, { popupMode: true });
```

Options: `autoSubmit` (submit on page load, same-tab) — mutually exclusive with `popupMode` (form targets the `aba_webservice` frame opened by `checkout2-0.js` and the submit button calls `AbaPayway.checkout()`), plus `formId`, `submitLabel`, and `omitSubmitButton`. All merchant-provided values are HTML-escaped. The CLI equivalent is `payway-sdk checkout-form -a 15.00 --return-url <url> -o form.html` (writes the same document locally; diagnostics go to stderr so `checkout-form … > form.html` stays clean).

> **Same pattern for saving cards:** `credentialsOnFile.getLinkCardFormHtml()` builds the identical kind of locally-signed form for the `link-card` endpoint (which requires urlencoded and always answers with the gateway's hosted card-entry page). See [Chapter 9](../../knowledge/link-lifecycle.md) and `payway-sdk cof link-card-form`.

The manual markup below is what the helper generates — kept for reference and for fully custom integrations.

---

### Option A: Full-Page Hosted Form POST

The form auto-submits to PayWay, navigating the browser to hosted checkout. Invoke this transport only after the merchant's final order review and policy acceptance. It is not the replacement for a required web popup.

```html
<!-- checkout.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Payment</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f7f7f8;
      color: #0f0f10;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      max-width: 400px;
    }
    .spinner {
      border: 3px solid #e5e7eb;
      border-top: 3px solid #111;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 0.8s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h1 { font-size: 1.25rem; font-weight: 600; }
    p { color: #5a5a5f; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Redirecting to PayWay...</h1>
    <div class="spinner"></div>
    <p>Please do not refresh this page.</p>
  </div>

  <!--
    Hidden form that will be auto-submitted to PayWay.
    The form fields are populated by JavaScript from the backend response.
  -->
  <form
    id="payway-form"
    method="POST"
    action=""
    style="display: none;"
  >
    <!--
      Fields will be inserted dynamically by JavaScript.
      Each SDK field becomes a hidden <input>.
    -->
  </form>

  <script>
    /**
     * On page load:
     * 1. Call your backend to get a signed checkout payload
     * 2. Populate the hidden form with the returned fields
     * 3. Auto-submit the form to PayWay's checkout URL
     */
    async function initiateCheckout() {
      try {
        // Step 1: Call your backend API to get the signed payload
        // Replace '/api/checkout/create' with your actual endpoint
        const response = await fetch('/api/checkout/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 15.00,
            currency: 'USD',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '012345678',
            paymentOption: 'abapay_khqr',
          }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to create checkout');
        }

        // Step 2: Populate the hidden form
        const form = document.getElementById('payway-form');

        // Set the form's action URL to PayWay's checkout endpoint
        form.action = `${data.checkoutUrl}/api/payment-gateway/v1/payments/purchase`;

        // Create a hidden input for each field in the signed payload
        Object.entries(data.payload).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });

        // Step 3: Auto-submit the form to PayWay
        // The user's browser will be redirected to PayWay's hosted checkout page
        form.submit();
      } catch (error) {
        console.error('Checkout failed:', error);
        document.querySelector('.container').innerHTML = `
          <h1 style="color: #dc2626;">Payment Error</h1>
          <p>${error.message || 'Unable to initiate payment. Please try again.'}</p>
          <button onclick="location.reload()" style="
            margin-top: 16px; padding: 10px 20px; border: none;
            border-radius: 8px; background: #111; color: white;
            cursor: pointer; font-size: 14px;
          ">Try Again</button>
        `;
      }
    }

    // Start the checkout process immediately when the page loads
    initiateCheckout();
  </script>
</body>
</html>
```

### Option B: Popup Modal (Desktop-Focused)

For a more "in-app" feel on desktop, use PayWay's `checkout2-0.js` library to open the checkout in a popup overlay. This approach keeps the customer on your page while they complete payment.

> **Mobile note:** For a merchant app WebView, use full-screen hosted checkout with a static merchant header and no app-owned address/browser toolbar. Mobile websites cannot hide the user's browser address bar. Confirm device/handoff support for the selected flow; see [WebViews](../../knowledge/webviews.md).

**How the popup flow works:**

1. **Backend:** Include `viewType: 'popup'` in the `createTransaction` call. This tells PayWay to render a popup-compatible page.
2. **Frontend:** Set `target="aba_webservice"` on your form — this is required for the popup to open correctly.
3. **Frontend:** Load PayWay's `checkout2-0.js` library and call `AbaPayway.checkout()` when the user clicks "Pay Now".

```html
<!-- checkout-popup.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayWay Popup Checkout</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 520px;
      margin: 40px auto;
      padding: 20px;
      background: #f7f7f8;
      color: #0f0f10;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    h1 { font-size: 1.5rem; margin-bottom: 24px; text-align: center; }
    .field { margin-bottom: 16px; }
    label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 0.875rem; }
    input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      box-sizing: border-box;
    }
    .btn {
      width: 100%;
      padding: 14px;
      background: #111;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
    }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .hidden { display: none !important; }
    .spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid white;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .note {
      font-size: 0.8rem;
      color: #6b7280;
      text-align: center;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Complete Payment</h1>

    <div class="field">
      <label for="amount">Amount (USD)</label>
      <input type="number" id="amount" value="15.00" step="0.01">
    </div>
    <div class="field">
      <label for="firstName">First Name</label>
      <input type="text" id="firstName" value="John">
    </div>
    <div class="field">
      <label for="phone">Phone</label>
      <input type="tel" id="phone" value="012345678">
    </div>

    <label>
      <input type="checkbox" id="policyAccepted" required>
      I accept the <a href="/terms">Terms &amp; Conditions</a> and
      <a href="/refund-policy">Refund / Cancellation Policy</a>.
    </label>

    <!-- CHECKOUT BUTTON — ID must match $('#checkout_button') -->
    <button class="btn" id="checkout_button">
      <span id="btnText">Pay Now</span>
      <span id="btnSpinner" class="spinner hidden"></span>
    </button>
  </div>

  <!--
    📌 CRITICAL: The form MUST have target="aba_webservice" for the
    PayWay popup to open correctly. Without this, the popup will not
    appear and the form will submit in the current page instead.
  -->
  <form
    id="aba_merchant_request"
    class="hidden"
    method="POST"
    target="aba_webservice"
    style="display: none;"
  >
    <!-- Fields populated dynamically by JavaScript -->
  </form>

  <!-- PayWay JS Library — provides AbaPayway.checkout() -->
  <script src="https://checkout.payway.com.kh/plugins/checkout2-0.js"></script>

  <script>
    // Backend API endpoint
    var API_BASE = '/api';

    // When the pay button is clicked, fetch the signed payload from
    // the backend and trigger the PayWay popup.
    document.addEventListener('DOMContentLoaded', function() {

      // jQuery syntax used in PayWay's official docs:
      $('#checkout_button').click(async function(event) {
        event.preventDefault();
        var policy = document.getElementById('policyAccepted');
        if (!policy.checked) {
          policy.reportValidity();
          policy.focus();
          return;
        }
        var btn      = document.getElementById('checkout_button');
        var btnText  = document.getElementById('btnText');
        var btnSpinner = document.getElementById('btnSpinner');

        // Show loading state
        btn.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');

        try {
          // Step 1: Get signed payload from backend
          var response = await fetch(API_BASE + '/checkout/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: parseFloat(document.getElementById('amount').value),
              currency: 'USD',
              firstName: document.getElementById('firstName').value.trim(),
              phone: document.getElementById('phone').value.trim(),
              paymentOption: 'abapay_khqr',
              viewType: 'popup'    // ← Tells PayWay to render popup
            })
          });
          var data = await response.json();
          if (!data.success) throw new Error(data.error);

          // Step 2: Populate the hidden form
          var form = document.getElementById('aba_merchant_request');
          form.innerHTML = '';
          form.action = data.checkoutUrl +
            '/api/payment-gateway/v1/payments/purchase';

          Object.keys(data.payload).forEach(function(key) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = data.payload[key];
            form.appendChild(input);
          });

          // Hide loading
          btnText.classList.remove('hidden');
          btnSpinner.classList.add('hidden');

          // Step 3: Open the PayWay popup
          // AbaPayway.checkout() submits the form to PayWay in a
          // new popup window. The user completes payment there.
          AbaPayway.checkout();

        } catch (error) {
          console.error('Checkout error:', error);
          alert('Error: ' + error.message);
          btn.disabled = false;
          btnText.classList.remove('hidden');
          btnSpinner.classList.add('hidden');
        }
      });
    });
  </script>

  <p class="note">
    <strong>Architecture:</strong> Backend handles all hash calculations
    and sensitive data. Frontend only initiates payment and renders the
    HTML response from PayWay.
  </p>
</body>
</html>
```

> **Teaching transport example:** `checkout-popup.html` demonstrates payment method selection and error handling. Adapt it to the confirmed enabled methods, policy consent, server-owned orders and [UI acceptance requirements](../../knowledge/integration-ui.md); it is not evidence of production screen approval.

---

## Step 3: Handle the Return URL (Payment Result Page)

Configure `continueSuccessUrl` for the hosted customer success continuation and `cancelUrl` for the supported cancel navigation. Purchase `returnUrl` is the server notification destination; it is not the hosted success continuation. The merchant result page should:

1. Read the authenticated backend's verified persisted receipt; recover the original attempt with inquiry when needed.
2. Show pending/unknown until verified; preserve the same attempt and do not initiate another payment automatically.
3. After matching verified transaction identity, amount and currency, update the order, clear only purchased cart contents and show Thank You / Order confirmed. Keep fulfillment processing distinct from payment acceptance.

Never mark paid or clear the cart based solely on navigation, query parameters or a provider success screen. Obtain Integration Team review of checkout and KHQR screens before production credentials are released.

```typescript
// routes/payment-result.ts
import { Router } from 'express';
import { payway } from '../config/payway';

const router = Router();

/**
 * POST /api/checkout/status
 *
 * Called by the frontend's payment result page to check the real status
 * of a transaction. This is a secondary check — the primary confirmation
 * comes from the webhook callback (Chapter 11).
 */
router.post('/status', async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    // Query PayWay for the transaction's current status
    const result = await payway.checkout.checkTransaction(transactionId);

    // PayWay returns a nested status object:
    // { status: { code: number, message: string, tran_id: string } }
    const statusCode = result.status?.code;

    res.json({
      success: true,
      status: statusCode,
      // Status code meanings:
      // 0  = Approved / Successful
      // 6  = Pending (still waiting for payment)
      // 22 = Expired
      // 49 = Invalid / Not found
      // Other = See error code table in Chapter 12
      message: result.status?.message,
      transactionId: result.status?.tran_id,
    });

    // ⚠️ Important: Do NOT update your database to "paid" here!
    // Only the webhook callback (Chapter 11) is the trusted source of truth.
    // This endpoint is just for displaying status to the user.
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check transaction status' });
  }
});

export default router;
```

```html
<!-- payment-result.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Result</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0; background: #f7f7f8;
    }
    .card {
      background: white; border-radius: 12px; padding: 40px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); max-width: 480px;
      text-align: center;
    }
    .success { color: #16a34a; font-size: 2rem; }
    .pending { color: #d97706; font-size: 2rem; }
    .error { color: #dc2626; font-size: 2rem; }
    h1 { font-size: 1.5rem; margin: 16px 0 8px; }
    p { color: #5a5a5f; }
    .btn {
      display: inline-block; margin-top: 24px; padding: 12px 24px;
      background: #111; color: white; text-decoration: none;
      border-radius: 8px; font-size: 14px; font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="card">
    <div id="icon"></div>
    <h1 id="title">Checking payment status...</h1>
    <p id="message">Please wait while we verify your payment.</p>
    <a id="action" class="btn" href="/">Go to Home</a>
  </div>

  <script>
    /**
     * Reads the transaction ID from the URL query parameter
     * and checks its real status via the backend.
     */
    async function checkStatus() {
      // Extract transaction ID from the URL: ?tran_id=order-xxx
      const params = new URLSearchParams(window.location.search);
      const transactionId = params.get('tran_id');

      if (!transactionId) {
        showState('error', 'Missing Transaction', 'No transaction ID was found.');
        return;
      }

      try {
        const response = await fetch('/api/checkout/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        // Status code 0 = Approved
        if (data.status === '0' || data.status === 0) {
          showState('success', 'Payment Successful!',
            'Your payment has been processed. You will receive a confirmation email shortly.');
          document.getElementById('action').href = '/order-confirmation';
          document.getElementById('action').textContent = 'View Order';
        }
        // Status code 6 = Pending
        else if (data.status === '6' || data.status === 6) {
          showState('pending', 'Payment Pending',
            'Your payment is still being processed. This may take a few moments.');
          // Auto-refresh after 5 seconds to check again
          setTimeout(() => location.reload(), 5000);
        }
        // Any other status = problem
        else {
          showState('error', 'Payment Incomplete',
            `Status: ${data.message || 'Unknown error'}. If money was deducted, it will be refunded automatically.`);
        }
      } catch (error) {
        showState('error', 'Error',
          error.message || 'Could not verify payment status. Please contact support.');
      }
    }

    function showState(type, title, msg) {
      const icons = {
        success: '<div class="success">✓</div>',
        pending: '<div class="pending">⏳</div>',
        error: '<div class="error">✗</div>',
      };
      document.getElementById('icon').innerHTML = icons[type] || '';
      document.getElementById('title').textContent = title;
      document.getElementById('message').textContent = msg;
    }

    checkStatus();
  </script>
</body>
</html>
```

---

## Step 4: Webhook Callback (Database Update)

This is the **most critical step**. PayWay sends a server-to-server POST when payment is confirmed. This is where you update your database.

See **[Chapter 11 — Callbacks & Webhooks](../../knowledge/callbacks-webhooks.md)** for the complete webhook handler implementation.

A minimal version:

```typescript
// routes/webhook.ts
import { Router } from 'express';
import { payway } from '../config/payway';

const router = Router();

router.post('/', (req, res) => {
  const receivedHash = req.headers['x-payway-hmac-sha512'] as string | undefined;

  if (!receivedHash) {
    console.warn('⚠️ Missing webhook signature header');
    return res.status(400).json({ error: 'Missing signature header' });
  }

  // Remove hash from body for verification; the header is the source of truth.
  const { hash, ...bodyWithoutHash } = req.body;

  const isValid = payway.verifyCallback(bodyWithoutHash, receivedHash);

  if (!isValid) {
    console.warn('⚠️ Invalid callback signature rejected');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Update order in database using the transaction ID
  // Use INSERT ... ON CONFLICT DO NOTHING for idempotency
  const { tran_id } = req.body;
  console.log(`✅ Payment confirmed for transaction: ${tran_id}`);

  // TODO: Update your database here
  // await db.query(
  //   'INSERT INTO orders (tran_id, status) VALUES ($1, $2) ON CONFLICT (tran_id) DO NOTHING',
  //   [tran_id, 'paid']
  // );

  // Always respond 200 quickly — process heavy tasks async
  res.status(200).json({ received: true });
});

export default router;
```

---

## Complete curl Examples

For debugging or testing without a frontend, here are the raw HTTP equivalents:

### Create Transaction (Checkout Initiation)

```bash
# Backend creates signed payload — this is what your server does internally
# via payway.checkout.createTransaction(). The curl below shows the signed
# fields that get POSTed to PayWay.

# Note: This curl will NOT work by itself because you must compute the HMAC
# signature. This is for reference only — use the SDK.
```

### Check Transaction Status

```bash
# Direct API call (for debugging or headless environments)
REQ_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
MERCHANT_ID="ec476910"
TRAN_ID="order-1737000000-abc123"
API_KEY="your_api_key_here"

# Compute HMAC-SHA512 (requires your own HMAC computation)
# Field order: req_time + merchant_id + tran_id
HASH=$(echo -n "${REQ_TIME}${MERCHANT_ID}${TRAN_ID}" | openssl dgst -sha512 -hmac "${API_KEY}" -binary | base64)

curl -X POST "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2" \
  -H "Content-Type: application/json" \
  -d "{
    \"req_time\": \"${REQ_TIME}\",
    \"merchant_id\": \"${MERCHANT_ID}\",
    \"tran_id\": \"${TRAN_ID}\",
    \"hash\": \"${HASH}\"
  }"
```

---

## "What If" Scenarios

| Scenario | What Happens | What To Do |
|---|---|---|
| **User closes tab during payment** | The browser redirect may never fire | You still get the server-side callback; the order processes normally |
| **Payment times out** | PayWay returns status code `22` (Expired) | Show "Payment Expired" and allow the customer to retry |
| **User clicks "Back" and resubmits** | A new transaction ID is generated | No duplicate charge — each attempt gets a unique `tran_id` |
| **Duplicate webhook callback** | PayWay sends the same callback twice | Use `ON CONFLICT (tran_id) DO NOTHING` in your database |
| **Server restarts during callback** | **No guaranteed retry** — PayWay treats the callback as a single best-effort delivery (confirmed by ABA, 2026-09-12); an occasional one-off retry (~10 s apart) has been observed but must not be designed for | Recover via Check Transaction polling; your idempotent handler dedupes the late callback if one arrives |

---

## Next Steps

- **For QR code payments** → [Chapter 7 — QR Code Handling](../../knowledge/qr-handling.md)
- **For saving cards for future charges** → [Chapter 9 — Link / Unlink / Renew Lifecycle](../../knowledge/link-lifecycle.md)
- **For production deployment** → [Chapter 13 — Deployment Checklist](../../knowledge/deployment-checklist.md)

> ← [Previous: Prerequisites & Setup](../../knowledge/setup.md) | [Next: QR Code Handling →](../../knowledge/qr-handling.md)
