<!-- GENERATED STUB: copy of docs/guides/14-appendix-code-snippets.md for compatibility. Do not edit here. -->

# Chapter 14 — Appendix: Complete Code Snippets

> **Estimated reading time:** Reference  
> **Goal:** Copy-paste-ready, fully-commented code examples for every common integration pattern.

---

## Backend: Full Express.js Server with PayWay SDK

This is a complete, runnable Express.js server that includes checkout creation, transaction status checking, webhook handling, and QR generation — everything you need for a web-based payment flow.

```typescript
// server.ts — Complete PayWay integration server
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PayWay, PayWayAPIError } from 'aba-payway-ts';

// ============================================
// 1. Initialize PayWay Client (Singleton)
// ============================================
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: (process.env.PAYWAY_ENV as 'sandbox' | 'production') || 'sandbox',
  maxRetries: 3,
  retryDelayMs: 3000,
  onRequest: (endpoint, body) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PayWay] → ${endpoint}`);
    }
  },
  onResponse: (endpoint, status) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PayWay] ← ${endpoint} HTTP ${status}`);
    }
  },
});

// ============================================
// 2. Express Setup
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// 3. Routes
// ============================================

/**
 * POST /api/checkout/create
 *
 * The frontend calls this endpoint when the user clicks "Pay Now".
 * It creates a signed checkout payload and returns it to the frontend.
 * The frontend then submits these fields directly to PayWay's checkout URL.
 */
app.post('/api/checkout/create', (req, res) => {
  try {
    // Generate a unique transaction ID
    const transactionId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Build and sign the transaction
    const signedPayload = payway.checkout.createTransaction({
      transactionId,
      amount: req.body.amount,
      currency: req.body.currency || 'USD',
      firstname: req.body.firstName,
      lastname: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      paymentOption: req.body.paymentOption || 'abapay_khqr',
      items: req.body.items || [{ name: 'Purchase', quantity: 1, price: req.body.amount }],
      type: 'purchase',
      returnUrl: `${BASE_URL}/payment-result?tran_id=${transactionId}`,
      cancelUrl: `${BASE_URL}/payment-cancelled`,
      continueSuccessUrl: `${BASE_URL}/order-confirmation?tran_id=${transactionId}`,
    });

    res.json({
      success: true,
      payload: signedPayload,
      checkoutUrl: 'https://checkout-sandbox.payway.com.kh', // Change for production
    });
  } catch (error) {
    console.error('Checkout creation failed:', error);
    res.status(500).json({ success: false, error: 'Failed to create checkout' });
  }
});

/**
 * POST /api/checkout/status
 *
 * Checks the real status of a transaction via PayWay's API.
 * Used by the frontend's payment result page.
 * ⚠️ This is a secondary check — the webhook callback is the trusted source.
 */
app.post('/api/checkout/status', async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    const result = await payway.checkout.checkTransaction(transactionId);
    res.json({
      success: true,
      status: result.status?.code,
      message: result.status?.message,
      transactionId: result.status?.tran_id,
    });
  } catch (error) {
    if (error instanceof PayWayAPIError) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message,
        paywayCode: error.paywayCode,
      });
    }
    res.status(500).json({ success: false, error: 'Failed to check transaction' });
  }
});

/**
 * POST /api/payway-webhook
 *
 * Receives payment confirmation callbacks from PayWay.
 * This is the ONLY endpoint that should update order status to "paid".
 */
app.post('/api/payway-webhook', (req, res) => {
  try {
    // Extract the webhook signature from the standard callback header.
    // PayWay sends the HMAC in X-PAYWAY-HMAC-SHA512, not from the request body.
    const receivedHash = req.headers['x-payway-hmac-sha512'] as string | undefined;
    if (!receivedHash) {
      return res.status(400).json({ error: 'Missing signature header' });
    }

    const { hash, ...bodyWithoutHash } = req.body;
    const isValid = payway.verifyCallback(bodyWithoutHash, receivedHash);

    if (!isValid) {
      console.warn('⚠️ Invalid callback signature rejected');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { tran_id, amount, currency } = req.body;
    console.log(`✅ Payment confirmed: ${tran_id} — ${amount} ${currency}`);

    // Respond immediately — process after
    res.status(200).json({ received: true });

    // TODO: Update your database here
    // await db.query(
    //   'INSERT INTO orders (tran_id, status, amount) VALUES ($1, $2, $3) ON CONFLICT (tran_id) DO NOTHING',
    //   [tran_id, 'paid', amount]
    // );

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/qr/generate
 *
 * Generates a KHQR QR code for the customer to scan with any banking app.
 */
app.post('/api/qr/generate', async (req, res) => {
  try {
    const transactionId = `qr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const qrResult = await payway.qr.generateQr({
      transactionId,
      amount: req.body.amount,
      paymentOption: 'abapay_khqr',
      currency: req.body.currency || 'USD',
      callbackUrl: `${BASE_URL}/api/payway-webhook`,
      qrImageTemplate: 'template2',
    });

    res.json({
      success: true,
      transactionId,
      qrString: qrResult.qrString,
      qrImage: qrResult.qrImage,
    });
  } catch (error) {
    console.error('QR generation failed:', error);
    res.status(500).json({ success: false, error: 'Failed to generate QR code' });
  }
});

// ============================================
// 4. Health Check
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.PAYWAY_ENV || 'sandbox' });
});

// ============================================
// 5. Start Server
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
  console.log(`   Environment: ${process.env.PAYWAY_ENV || 'sandbox'}`);
  console.log(`   Webhook: ${BASE_URL}/api/payway-webhook`);
});
```

---

## Backend: PHP Webhook Receiver

For PHP backends, here's a verified webhook receiver that implements the correct **HMAC-SHA512** algorithm with sorted-key concatenation:

```php
<?php
// webhook.php — PayWay callback handler (PHP)
// Verified: uses HMAC-SHA512, sorted keys, string concatenation

// Your credentials (store in environment variables in production!)
$API_KEY = getenv('PAYWAY_API_KEY');

// Read the raw POST body
$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody, true);

if (!$body || !isset($body['hash'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body']);
    exit;
}

// Step 1: Extract and remove the hash field
$receivedHash = $body['hash'];
unset($body['hash']);

// Step 2: Sort the remaining keys alphabetically
ksort($body);

// Step 3: Concatenate all values
// Objects/arrays are JSON-encoded, null/empty become empty string
$concatenated = '';
foreach ($body as $key => $value) {
    if ($value === null) {
        continue; // Empty string
    }
    if (is_array($value) || is_object($value)) {
        $concatenated .= json_encode($value);
    } else {
        $concatenated .= (string)$value;
    }
}

// Step 4: Compute HMAC-SHA512 with your API key
$computedHash = base64_encode(
    hash_hmac('sha512', $concatenated, $API_KEY, true)
);

// Step 5: Timing-safe comparison
if (!hash_equals($computedHash, $receivedHash)) {
    error_log("Invalid PayWay callback signature for tran_id: " . ($body['tran_id'] ?? 'unknown'));
    http_response_code(400);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// Step 6: Payment confirmed — update database
$tranId = $body['tran_id'] ?? null;
$amount = $body['amount'] ?? null;

if ($tranId) {
    error_log("Payment confirmed: $tranId — $amount");

    // TODO: Update your database here
    // Example: INSERT INTO orders (tran_id, status) VALUES ($tranId, 'paid')
    //          ON DUPLICATE KEY UPDATE status = 'paid'
}

// Step 7: Respond HTTP 200 immediately
http_response_code(200);
echo json_encode(['received' => true]);
```

> ⚠️ **Important:** This PHP implementation uses `hash_equals()` for timing-safe comparison and string concatenation (`.`) — NOT arithmetic `+`. PayWay's own PHP sample incorrectly uses `+`, which produces "Wrong Hash" errors.

---

## Frontend: Complete Checkout Page

```html
<!-- checkout.html — Complete checkout page with backend integration -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout</title>
  <style>
    body {
      font-family: -apple-system, sans-serif;
      max-width: 480px;
      margin: 40px auto;
      padding: 20px;
      background: #f7f7f8;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    h1 { font-size: 1.5rem; margin-bottom: 20px; }
    .field { margin-bottom: 16px; }
    label { display: block; font-weight: 500; margin-bottom: 4px; font-size: 0.875rem; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; }
    .btn {
      width: 100%; padding: 14px;
      background: #111; color: white;
      border: none; border-radius: 8px;
      font-size: 16px; font-weight: 500;
      cursor: pointer;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .hidden { display: none !important; }
    .spinner {
      display: inline-block; width: 16px; height: 16px;
      border: 2px solid white; border-top-color: transparent;
      border-radius: 50%; animation: spin 0.6s linear infinite;
      margin-right: 8px; vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .method-select { display: flex; gap: 8px; margin-bottom: 16px; }
    .method-btn {
      flex: 1; padding: 12px; border: 2px solid #e5e7eb;
      border-radius: 8px; text-align: center; cursor: pointer;
      font-size: 14px; background: white;
    }
    .method-btn.active { border-color: #111; background: #f7f7f8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Complete Payment</h1>

    <!-- Payment Method Selection -->
    <div class="method-select" id="methodSelect">
      <button class="method-btn active" data-method="abapay_khqr">KHQR</button>
      <button class="method-btn" data-method="cards">Card</button>
    </div>

    <!-- Amount -->
    <div class="field">
      <label>Amount (USD)</label>
      <input type="number" id="amount" value="15.00" step="0.01" min="0.01">
    </div>

    <!-- Customer Info -->
    <div class="field">
      <label>First Name</label>
      <input type="text" id="firstName" value="John" required>
    </div>
    <div class="field">
      <label>Last Name</label>
      <input type="text" id="lastName" value="Doe" required>
    </div>
    <div class="field">
      <label>Phone</label>
      <input type="tel" id="phone" value="012345678" required>
    </div>
    <div class="field">
      <label>Email</label>
      <input type="email" id="email" placeholder="customer@example.com">
    </div>

    <!-- Pay Button -->
    <button class="btn" id="payButton" onclick="initiatePayment()">
      <span id="btnText">Pay Now</span>
      <span id="btnSpinner" class="spinner hidden"></span>
    </button>

    <div id="status" style="margin-top: 12px; font-size: 0.875rem;"></div>
  </div>

  <!-- Hidden PayWay form -->
  <form id="paywayForm" class="hidden" method="POST"></form>

  <script>
    let selectedMethod = 'abapay_khqr';

    // Payment method selection
    document.getElementById('methodSelect').addEventListener('click', (e) => {
      const btn = e.target.closest('.method-btn');
      if (!btn) return;
      document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMethod = btn.dataset.method;
    });

    async function initiatePayment() {
      const btn = document.getElementById('payButton');
      btn.disabled = true;
      document.getElementById('btnText').classList.add('hidden');
      document.getElementById('btnSpinner').classList.remove('hidden');
      document.getElementById('status').textContent = 'Preparing payment...';

      try {
        const response = await fetch('/api/checkout/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(document.getElementById('amount').value),
            currency: 'USD',
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            phone: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            paymentOption: selectedMethod,
          }),
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Populate and submit hidden form to PayWay
        const form = document.getElementById('paywayForm');
        form.action = `${data.checkoutUrl}/api/payment-gateway/v1/payments/purchase`;
        form.innerHTML = '';
        Object.entries(data.payload).forEach(([key, value]) => {
          form.innerHTML += `<input type="hidden" name="${key}" value="${value}">`;
        });

        document.getElementById('status').textContent = 'Redirecting to secure payment page...';
        form.submit();
      } catch (error) {
        document.getElementById('status').textContent = `Error: ${error.message}`;
        btn.disabled = false;
        document.getElementById('btnText').classList.remove('hidden');
        document.getElementById('btnSpinner').classList.add('hidden');
      }
    }
  </script>
</body>
</html>
```

---

## Payment Link: Create, Share, Reconcile

Full lifecycle reference: [17. Payment Link API](17-payment-link.md). `paymentLink` requires the RSA public key; `returnUrl` is gateway-required and base64-encoded automatically.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay(); // credentials via env / profile

// Create a shareable hosted link (currency defaults 'USD')
const link = await payway.paymentLink.create({
  title: 'Invoice INV-2026-041',
  amount: 49.5,
  merchantRefNo: 'INV-2026-041',
  returnUrl: 'https://merchant.example/payway/pushback',
  description: 'Website retainer — March',
  paymentLimit: 1, // one payment; omit = unlimited
});
const shareUrl = link.data?.payment_link; // send to the customer
const linkId = link.data?.id;             // save — detail takes THIS, not the ref/slug
```

Split payout (keys are `{acc, amt}` — NOT the payout domain's `{account, amount}`; total must equal the amount; beneficiaries must be whitelisted):

```typescript
const split = await payway.paymentLink.create({
  title: 'Marketplace order 88',
  amount: 150,
  merchantRefNo: 'ord-88',
  returnUrl: 'https://merchant.example/payway/pushback',
  payout: [{ acc: '500000001', amt: 150 }],
});
```

Branded image (top-level multipart part, never hashed; JPG/JPEG/PNG ≤3MB — over-limit warns, strict throws; the CLI `--image` rejects locally):

```typescript
import { readFileSync } from 'node:fs';
const branded = await payway.paymentLink.create({
  title: 'Festival passes',
  amount: 20,
  merchantRefNo: 'fest-2026',
  returnUrl: 'https://merchant.example/payway/pushback',
  image: { data: readFileSync('./poster.jpg'), filename: 'poster.jpg', contentType: 'image/jpeg' },
});
```

Pushback receiver + verification through check-transaction (the documented pushback carries no hash — verify the payment itself):

```typescript
// POST https://merchant.example/payway/pushback  (Content-Type: application/json)
app.post('/payway/pushback', express.json(), async (req, res) => {
  res.sendStatus(200); // ACK first
  const { tran_id, merchant_ref_no } = req.body as { tran_id: string; merchant_ref_no: string };
  const check = await payway.checkout.checkTransaction(tran_id);
  if (check.data?.payment_status === 'APPROVED') markPaid(merchant_ref_no);
});
```

Inspecting status (OPEN while `payment_limit > total_trxn`, then PAID; no EXPIRED status exists):

```typescript
const details = await payway.paymentLink.getDetails(linkId);
const { status, total_trxn, total_amount, total_refund } = details.data ?? {};
```

CLI equivalents:

```sh
payway-sdk payment-link create -t "Invoice INV-041" -a 49.50 -r INV-2026-041   --return-url https://merchant.example/payway/pushback --payment-limit 1
payway-sdk payment-link detail -i "<data.id from create>"
```

---

## Running the Examples

### Prerequisites

```bash
# Clone the project
git clone https://github.com/antigravity-google/aba-payway-ts.git
cd aba-payway-ts

# Install dependencies
npm install

# Create a .env file with your sandbox credentials
cp .env.example .env
# Edit .env with your actual credentials

# Run the example server
npx tsx server.ts
```

### Testing the Webhook

```bash
# Simulate a webhook callback (requires ngrok running)
TRAN_ID="order-test-001"
API_KEY="your_api_key_here"
CONCAT="15.00USD${TRAN_ID}"
HASH=$(echo -n "${CONCAT}" | openssl dgst -sha512 -hmac "${API_KEY}" -binary | base64)

curl -X POST "https://your-ngrok-url.ngrok.io/api/payway-webhook" \
  -H "Content-Type: application/json" \
  -d "{\"tran_id\":\"${TRAN_ID}\",\"amount\":\"15.00\",\"currency\":\"USD\",\"hash\":\"${HASH}\"}"
```

---

---

## On-Demand Transaction Status Polling

After generating a QR code or creating a purchase, poll the transaction status on demand. The `pollTransactionStatus()` method is an async generator — polling starts when you iterate and stops when you `break`, when a terminal status is reached, or when limits are hit.

### QR Payment with Real-Time Status Updates

```typescript
import { PayWay, PollingAbortedError } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
});

async function processQrPayment(amount: number, currency: 'USD' | 'KHR') {
  const transactionId = `qr-${Date.now()}`;

  // 1. Generate QR
  const qr = await payway.qr.generateQr({
    transactionId,
    amount,
    currency,
    paymentOption: 'abapay_khqr',
  });

  console.log(`QR generated: ${transactionId}`);
  // Display qr.qrImage to customer...

  // 2. Poll for payment — ON DEMAND, starts immediately
  try {
    for await (const result of payway.checkout.pollTransactionStatus(transactionId, {
      intervalMs: 5_000,        // Poll every 5 seconds
      maxDurationMs: 180_000,   // Stop after 3 minutes (QR lifetime)
    })) {
      console.log(`[Poll #${result.attempt}] ${result.paymentStatus} (${result.durationMs}ms)`);

      if (result.isTerminal) {
        console.log(`Terminal status reached: ${result.paymentStatus}`);
        return { transactionId, status: result.paymentStatus };
      }
    }
  } catch (error) {
    if (error instanceof PollingAbortedError) {
      console.error(`Polling aborted: ${error.reason} after ${error.totalAttempts} attempts`);
      return { transactionId, status: 'TIMEOUT', lastKnown: error.lastStatus };
    }
    throw error;
  }
}
```

### Multi-Transaction Polling

Poll multiple transactions concurrently — each `for await...of` loop is independent:

```typescript
async function monitorMultiplePayments(transactionIds: string[]) {
  const controllers = transactionIds.map(() => new AbortController());

  // Start independent polls for each transaction
  const promises = transactionIds.map((id, i) =>
    (async () => {
      try {
        for await (const result of payway.checkout.pollTransactionStatus(id)) {
          console.log(`[${id}] Poll #${result.attempt}: ${result.paymentStatus}`);
          if (result.isTerminal) return result;
          if (controllers[i].signal.aborted) return null;
        }
      } catch (error) {
        if (error instanceof PollingAbortedError) {
          console.error(`[${id}] Aborted: ${error.reason}`);
        }
        return null;
      }
    })()
  );

  // Wait for ALL transactions to reach terminal state
  const results = await Promise.all(promises);

  // Cancel any still-polling iterators
  controllers.forEach(c => c.abort());

  return results;
}
```

### Error Handling Reference

| Error | When | How to Handle |
|---|---|---| 
| `PollingAbortedError` | `maxDurationMs` or `maxConsecutiveErrors` hit | Catch around `for await...of`, check `error.reason` |
| `PollingAbortedError` with `reason: 'max_consecutive_errors'` | Network issues or API errors | Retry with fresh `pollTransactionStatus()` call |
| `PollingAbortedError` with `reason: 'max_duration_exceeded'` | QR expired before payment | Generate new QR, notify customer |
| Error results (yielded, not thrown) | Single poll failure within tolerance | Log warning, continue iterating — next poll may succeed |

---

## See Also

- **Full Chapter List:** [README.md](../../README.md)
- **SDK Source:** `../src/client.ts`
- **Sandbox Findings:** `../SANDBOX-FINDINGS.md`
- **OpenAPI Spec:** `../payway-openapi.yaml`

> ← [Previous: Deployment Checklist](13-deployment-checklist.md) | [Back to Documentation Home →](../../README.md)
