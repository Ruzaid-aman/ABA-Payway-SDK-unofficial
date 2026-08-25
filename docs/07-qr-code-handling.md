# Chapter 7 — QR Code Handling

> **Estimated reading time:** 15 minutes  
> **Goal:** Generate and display KHQR QR codes for customers to scan and pay with their banking app.

---

## QR String vs. QR Image — Understanding the Difference

When using the PayWay QR API, you get two related but distinct pieces of data:

| Field | Format | Purpose |
|---|---|---|
| **`qrString`** | Raw text string | The actual data encoded in the QR code. Can be used by any QR library to generate a custom QR image. Also used for deep linking on mobile. |
| **`qrImage`** | Base64-encoded PNG | A pre-rendered QR code image from PayWay. Display directly in an `<img>` tag without any QR generation library. |

> 💡 **`qrString`** is the data; **`qrImage`** is the visual. Use `qrImage` for quick display, or `qrString` if you want to customize the QR appearance.

---

## Generating a QR Code via API

The QR API endpoint generates a KHQR-compatible QR code that works with **all Cambodian banking apps** (ABA Pay, ACLEDA, etc.), not just ABA Pay.

### Fast manual CLI path

If you are testing the QR flow from the terminal instead of wiring your own backend first:

```bash
payway-sdk doctor
payway-sdk generate-qr -a 3.31 -c USD
payway-sdk check-transaction -t <id>
payway-sdk transaction-detail -t <id>
```

- `doctor` confirms credentials and online-QR callback readiness.
- `generate-qr` saves the QR PNG by default to `payway-output/<transaction-id>.png`.
- Use `--save-image <path>` to choose a different output path.
- Use `--no-save-image` to disable the default PNG write for one run.
- If `PAYWAY_CALLBACK_URL` is missing locally, run `payway-sdk setup-webhook --tunnel`.

### Backend Endpoint

```typescript
// routes/qr.ts
import { Router } from 'express';
import { payway } from '../config/payway';

const router = Router();

/**
 * POST /api/qr/generate
 *
 * Generates a KHQR QR code for the customer to scan.
 * This is an API-based flow — no browser redirect involved.
 */
router.post('/generate', async (req, res) => {
  try {
    const transactionId = `qr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Generate QR code via PayWay API
    const qrResult = await payway.qr.generateQr({
      // Unique transaction ID for this QR (required)
      transactionId,

      // Amount the customer should pay (required)
      amount: req.body.amount, // e.g., 1.50

      // Payment option: 'abapay_khqr' for KHQR (required)
      paymentOption: 'abapay_khqr',

      // Currency: 'USD' or 'KHR'
      currency: req.body.currency || 'USD',

      // Your webhook callback URL where PayWay sends confirmation
      // ⚠️ Must be a publicly accessible HTTPS URL (use ngrok in development)
      callbackUrl: `${process.env.BASE_URL}/api/payway-webhook`,

      // QR image visual template (optional)
      // 'template1', 'template2', etc. — affects the visual style
      qrImageTemplate: 'template2',
    });

    // The response contains:
    // - qrResult.qrString: Raw QR data string
    // - qrResult.qrImage: Base64-encoded PNG image of the QR code

    res.json({
      success: true,
      transactionId,
      // Pass both to the frontend
      qrString: qrResult.qrString,
      // qrImage can be displayed directly: <img src="data:image/png;base64,...">
      qrImage: qrResult.qrImage,
    });
  } catch (error) {
    console.error('QR generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate QR code. Please try again.',
    });
  }
});

export default router;
```

> 📝 **Note on callback URL:** Unlike the checkout flow (which uses both return URL and callback URL), the QR API flow relies entirely on the **callback URL** (webhook) for confirmation. There's no browser redirect in QR payments — the customer scans with their banking app and completes payment there.

---

## Displaying the QR Code on the Frontend

### Using PayWay's Pre-rendered Image (Simplest)

```html
<!-- qr-display.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scan to Pay</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0; background: #f7f7f8;
    }
    .card {
      background: white; border-radius: 12px; padding: 40px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); max-width: 420px;
      text-align: center;
    }
    .qr-container {
      border: 2px solid #e5e7eb; border-radius: 12px;
      padding: 20px; margin: 20px 0; display: inline-block;
      background: white;
    }
    .qr-container img {
      display: block; max-width: 250px; height: auto;
    }
    .amount { font-size: 2rem; font-weight: 700; margin: 10px 0; }
    .label { color: #5a5a5f; font-size: 0.875rem; }
    .app-list {
      display: flex; gap: 8px; justify-content: center;
      flex-wrap: wrap; margin-top: 16px;
    }
    .app-badge {
      background: #f7f7f8; border: 1px solid #e5e7eb;
      border-radius: 8px; padding: 6px 12px; font-size: 12px;
    }
    .expiry { color: #d97706; font-size: 0.8rem; margin-top: 16px; }
    .spinner {
      border: 3px solid #e5e7eb; border-top: 3px solid #111;
      border-radius: 50%; width: 40px; height: 40px;
      animation: spin 0.8s linear infinite; margin: 20px auto;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <h1>Scan to Pay</h1>
    <div class="amount" id="displayAmount">$15.00</div>
    <div class="label">USD</div>

    <div id="qrLoader" class="spinner"></div>

    <!-- QR Code will be inserted here -->
    <div id="qrContainer" class="qr-container" style="display: none;">
      <img id="qrImage" src="" alt="KHQR Payment Code">
    </div>

    <p class="label">Open your banking app and scan this QR code</p>

    <div class="app-list">
      <span class="app-badge">ABA Pay</span>
      <span class="app-badge">ACLEDA</span>
      <span class="app-badge">Bakong</span>
      <span class="app-badge">Any Bank</span>
    </div>

    <div id="status" class="expiry"></div>
  </div>

  <script>
    async function generateQR() {
      try {
        // Call backend to generate QR code
        const response = await fetch('/api/qr/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 15.00,
            currency: 'USD',
          }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error);
        }

        // Hide loader, show QR code
        document.getElementById('qrLoader').style.display = 'none';
        document.getElementById('qrContainer').style.display = 'inline-block';

        // Display the pre-rendered QR image from PayWay
        // PayWay returns the image as Base64-encoded PNG without the data URI prefix
        document.getElementById('qrImage').src = `data:image/png;base64,${data.qrImage}`;
        document.getElementById('displayAmount').textContent = `$${15.00}`;

        // Optional: store transaction ID for status polling
        window._transactionId = data.transactionId;
        document.getElementById('status').textContent = 'QR code is valid. Waiting for payment...';

        // Start polling payment status every 3 seconds
        startPolling(data.transactionId);
      } catch (error) {
        document.getElementById('qrLoader').style.display = 'none';
        document.getElementById('status').innerHTML = `
          <span style="color: #dc2626;">Error: ${error.message}</span>
          <br><button onclick="location.reload()" style="
            margin-top: 12px; padding: 8px 16px; border: none;
            border-radius: 6px; background: #111; color: white; cursor: pointer;
          ">Retry</button>
        `;
      }
    }

    /**
     * Polls the backend every 3 seconds to check if the payment was completed.
     * Stops polling when payment is confirmed.
     *
     * Note: This is a fallback for user experience. The primary confirmation
     * comes from the webhook callback (Chapter 11).
     */
    async function startPolling(transactionId) {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/checkout/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionId }),
          });

          const data = await response.json();

          if (data.status === '0' || data.status === 0) {
            // Payment confirmed!
            clearInterval(pollInterval);
            document.getElementById('status').innerHTML =
              '<span style="color: #16a34a;">✅ Payment received! Thank you.</span>';
            document.getElementById('qrContainer').style.opacity = '0.3';

            // Redirect to success page after short delay
            setTimeout(() => {
              window.location.href = `/order-confirmation?tran_id=${transactionId}`;
            }, 2000);
          }
        } catch (error) {
          // Silently continue polling — don't show errors to the user
          console.error('Poll error:', error);
        }
      }, 3000); // Poll every 3 seconds
    }

    // Start the QR generation on page load
    generateQR();
  </script>
</body>
</html>
```

---

## Official ABA KHQR Offline Generation (No API Call Required)

The SDK can construct an official ABA KHQR payload entirely locally. This makes no HTTP request, so it does not submit, track, or reconcile a payment. It requires ABA-provided merchant configuration; API credentials are not a substitute for the nested merchant-account tag `30` or PayWay data tag `62.68`.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  khqr: {
    bakongId: process.env.PAYWAY_KHQR_BAKONG_ID,
    abaMerchantId: process.env.PAYWAY_KHQR_ABA_MERCHANT_ID,
    acquirerName: process.env.PAYWAY_KHQR_ACQUIRER_NAME,
    merchantCategoryCode: process.env.PAYWAY_KHQR_MERCHANT_CATEGORY_CODE,
    merchantName: process.env.PAYWAY_KHQR_MERCHANT_NAME,
    merchantCity: process.env.PAYWAY_KHQR_MERCHANT_CITY,
    paywayData: process.env.PAYWAY_KHQR_PAYWAY_DATA,
  },
});

const readiness = payway.khqr.validateConfiguration();
if (!readiness.ready) throw new Error(readiness.issues.map((issue) => issue.code).join(', '));

// Generate an official ABA KHQR string locally.
const qrString = payway.khqr.generateOfflineQR({
  amount: 15.00,
  currency: 'USD',
  merchantRef: 'REF-123', // Your internal reference
});

console.log(qrString);
// Output: "000201010212...6304ABCD"

// Now use any QR library to render the `qrString` as an image
// For example, with the `qrcode` npm package:
// import QRCode from 'qrcode';
// const dataUri = await QRCode.toDataURL(qrString);
```

The seven configuration fields can be supplied in the constructor (highest priority), environment (`PAYWAY_KHQR_BAKONG_ID`, `PAYWAY_KHQR_ABA_MERCHANT_ID`, `PAYWAY_KHQR_ACQUIRER_NAME`, `PAYWAY_KHQR_MERCHANT_CATEGORY_CODE`, `PAYWAY_KHQR_MERCHANT_NAME`, `PAYWAY_KHQR_MERCHANT_CITY`, and `PAYWAY_KHQR_PAYWAY_DATA`), or an optional local CLI profile. Keep them private and obtain them from ABA; do not infer or reuse another merchant's values.

Omit `amount` for a static QR (`01=11`); provide it for a dynamic QR (`01=12` with tag `54`). The payload uses byte-aware TLV lengths, includes merchant reference `62.01`, ABA-provided PayWay data `62.68`, and CRC tag `63`. Earlier SDK versions used a private offline format; migrate by removing legacy `merchantId`, `transactionId`, tip, fee, and transaction-type arguments.

> ⚠️ **Important:** Offline-generated QRs cannot be tracked by PayWay for status. For server-side status tracking, use the API-based `generateQr()`. A payment notification, when ABA has provisioned one, still needs separate reconciliation.

---

## QR Lifecycle

QR codes generated via the API have a limited lifetime:

| Phase | What Happens | SDK Action |
|---|---|---|
| **Generated** | QR is valid and displayable | `payway.qr.generateQr()` |
| **Polling** | Server polls transaction status every 5s | `payway.checkout.pollTransactionStatus()` |
| **Expired** | QR times out (PayWay-enforced expiry) | Generate new QR via `generateQr()` |
| **Paid** | Customer scans and completes payment | Webhook callback notifies your server |
| **Cancelled** | You close the transaction before payment | `payway.checkout.closeTransaction()` |

> 💡 **Best practice:** Display a countdown timer on the QR page showing when the QR expires, and offer a "Refresh QR" button if the customer takes too long.

### Sandbox-verified lifecycle facts (2026-08-25)

- **Duplicate `tran_id` is silently accepted** on purchase in sandbox (HTTP 200, `code 0`). Generate unique transaction IDs (the CLI does: `qr<timestamp><random>`); do not rely on PayWay for idempotency. Production behavior is an open question — see [SANDBOX-FINDINGS §8c](./SANDBOX-FINDINGS.md).
- **Closing an unpaid transaction keeps it reporting `PENDING`** via check/list APIs (not `CANCELLED`). Treat "closed" as a local state you track yourself; the close call returns `code 0 Success!` when accepted.
- **`closeTransaction()` on a nonexistent ID** → HTTP 403, internal code `5` ("Transaction not found"), while `checkTransaction()` on a nonexistent ID → HTTP 200 with `status.code 6` ("tran_id not found"). Handle both shapes.
- **Creation grace period:** the first check right after creating a transaction can return `status.code 6` for a few seconds before it becomes visible. `pollTransactionStatus()` yields `NOT_FOUND` for these and does **not** count them toward `maxConsecutiveErrors`. Verified live 2026-08-25: checkout-link flow saw 1× NOT_FOUND, then PENDING ×4 → APPROVED (~32s).
- **Hosted checkout link requires `payment_gate=0`:** via the JSON Create Transaction API (`checkout.purchase()`), the response includes `checkout_qr_url` only when you send `viewType: 'hosted_view'` + `paymentGate: 0` alongside `paymentOption: 'abapay_khqr_deeplink'`. Without gate 0 you get only `qrString` / `qrImage` / `abapay_deeplink`.
- **Transaction-list date filters must be `"YYYY-MM-DD HH:mm:ss"`** (e.g. `"2026-08-25 00:00:00"`). Compact (`20260825`), ISO-date (`2026-08-25`), and epoch formats all fail with HTTP 403 / code `49` "Invalid Start Date."

---

## CLI Transaction Lifecycle Commands

For scripts, terminals, and agent frameworks, the CLI mirrors the SDK's checkout domain with `--json` output and standardized exit codes (`0` success / `1` input error / `2` API failure / `3` network):

```bash
# One-shot status check
payway-sdk check-transaction -t qrabc123

# Full detail (rate-limited to 10/min by PayWay)
payway-sdk transaction-detail -t qrabc123

# Generate an online QR and save the PNG automatically to payway-output/<id>.png
payway-sdk generate-qr -a 3.31 -c USD

# Override the default PNG path
payway-sdk generate-qr -a 3.31 -c USD --save-image tmp/qr.png

# Disable the default PNG write
payway-sdk generate-qr -a 3.31 -c USD --no-save-image

# List today's transactions (strict date format)
payway-sdk transaction-list --from "2026-08-25 00:00:00" --to "2026-08-25 23:59:59" --status APPROVED

# Void/close before payment (prompts; -y/--force for agents)
payway-sdk close-transaction -t qrabc123 -y

# Refund with pre-flight balance check (paid − refunded) and confirmation
payway-sdk refund -t order-123 -a 5.00 -c USD

# Live USD/KHR rate
payway-sdk exchange-rate
```

---

## Ready-Made End-to-End Scripts

Two reusable scripts wire the full live flow (create → display → poll) in one command. Both read `PAYWAY_MERCHANT_ID` / `PAYWAY_API_KEY` (+ `PAYWAY_CALLBACK_URL` for QR) from `.env`, default to a **600-second lifetime** with a **10-minute poll window at 5s intervals**, and stop as soon as a terminal status arrives:

| Script | Flow | Artifacts |
|---|---|---|
| `npx tsx scripts/online-qr-poll.ts [amount] [currency]` | Online KHQR via `qr.generateQr()` → saves + auto-opens PNG | `test-logs/qr-payment/<txId>-*` |
| `npx tsx scripts/checkout-link-poll.ts [amount] [currency]` | Create Transaction API (`checkout.purchase()` + `paymentGate: 0`) → auto-opens hosted `checkout_qr_url` in browser | `test-logs/checkout-link/<txId>-*` |

```bash
# $31.11 USD online QR, 10-min lifetime, polls until paid or 10 minutes elapse
npx tsx scripts/online-qr-poll.ts

# $12.12 USD checkout link opened in your browser
npx tsx scripts/checkout-link-poll.ts
```

---

## Transaction Status Polling (On-Demand)

After generating a QR code, you need to know when the customer completes payment. The SDK provides `checkout.pollTransactionStatus()` — an **async generator** that polls the PayWay check-transaction endpoint at regular intervals and yields results you can iterate over with `for await...of`.

You have full control over **when to start**, **when to stop**, and **how to react** to each poll result.

### Basic Usage — Start and Stop Polling

```typescript
import { PayWay, PollingAbortedError } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
});

async function monitorPayment(transactionId: string) {
  // ─── Start polling ──────────────────────────────────────────────
  // Each iteration yields a PollTransactionResult with the latest status.
  // Polling runs ON DEMAND — nothing happens until you iterate.
  try {
    for await (const result of payway.checkout.pollTransactionStatus(transactionId)) {
      console.log(
        `[Poll #${result.attempt}] ${result.paymentStatus}` +
        ` (${result.durationMs}ms)`
      );

      // ─── Stop polling manually ────────────────────────────────────
      // Break out of the loop at any time to stop polling immediately.
      if (result.paymentStatus === 'APPROVED') {
        console.log('Payment confirmed!');
        break; // ← Stops polling
      }

      if (result.paymentStatus === 'DECLINED') {
        console.log('Payment was declined.');
        break; // ← Stops polling
      }
    }
  } catch (error) {
    if (error instanceof PollingAbortedError) {
      // Automatic stop — max duration or consecutive errors
      console.error(`Polling stopped: ${error.reason} (after ${error.totalAttempts} attempts)`);
    } else {
      throw error;
    }
  }
}
```

### How It Works

| Behavior | Detail |
|---|---|
| **Start** | Polling starts when you begin iterating (`for await...of` or calling `.next()`) |
| **Each poll** | Yields a `PollTransactionResult` with `paymentStatus`, `isTerminal`, `attempt`, `durationMs`, etc. |
| **Auto-stop on terminal** | When status is `APPROVED`, `DECLINED`, `CANCELLED`, or `REFUNDED`, the generator completes — no more polls |
| **Auto-stop on timeout** | After `maxDurationMs` (default: 10 minutes), throws `PollingAbortedError` |
| **Auto-stop on errors** | After `maxConsecutiveErrors` (default: 3), throws `PollingAbortedError` |
| **Manual stop** | `break` out of the `for await...of` loop at any time |

### Custom Polling Options

Override the defaults to match your use case:

```typescript
// Fast polling for time-sensitive flows
for await (const result of payway.checkout.pollTransactionStatus(transactionId, {
  intervalMs: 2_000,        // Poll every 2 seconds (default: 5000)
  maxDurationMs: 120_000,   // Stop after 2 minutes (default: 600000)
  maxConsecutiveErrors: 5,  // Allow 5 failures before aborting (default: 3)
})) {
  console.log(`[${result.paymentStatus}] attempt #${result.attempt}`);
  if (result.isTerminal) break;
}
```

```typescript
// QR with 3-minute lifetime — match the lifetime as the polling ceiling
const QR_LIFETIME_SECONDS = 180;
for await (const result of payway.checkout.pollTransactionStatus(transactionId, {
  intervalMs: 5_000,
  maxDurationMs: QR_LIFETIME_SECONDS * 1_000, // Bound by QR lifetime
})) {
  if (result.isTerminal) {
    await updateOrderStatus(transactionId, result.paymentStatus);
    break;
  }
}
```

### Handling Errors During Polling

Each poll attempt that fails (network timeout, API error) is **yielded as an error result** before potentially aborting. This lets you observe transient failures without losing visibility:

```typescript
for await (const result of payway.checkout.pollTransactionStatus(transactionId)) {
  if (result.paymentStatus.startsWith('ERROR:')) {
    console.warn(`Poll #${result.attempt} failed: ${result.paymentStatus}`);
    // Continue — the next poll may succeed (consecutive error count resets on success)
    continue;
  }

  if (result.paymentStatus === 'NOT_FOUND') {
    // Freshly-created transactions can take a few seconds to become visible
    // (check-transaction answers status.code 6). NOT_FOUND does not count as an error.
    continue;
  }

  console.log(`Poll #${result.attempt}: ${result.paymentStatus}`);
  if (result.isTerminal) break;
}
```

### Using with AbortController (External Cancel)

If you need to cancel polling from outside the loop (e.g., user clicks "Cancel" or a parent request times out), use an `AbortController`:

```typescript
const controller = new AbortController();

// Cancel from anywhere:
// controller.abort();

async function pollWithAbort(transactionId: string, signal: AbortSignal) {
  try {
    for await (const result of payway.checkout.pollTransactionStatus(transactionId)) {
      if (signal.aborted) {
        console.log('Polling cancelled by caller.');
        break; // ← Manual stop via external signal
      }

      if (result.isTerminal) {
        return result.paymentStatus;
      }

      console.log(`[Poll #${result.attempt}] ${result.paymentStatus}`);
    }
  } catch (error) {
    if (error instanceof PollingAbortedError) {
      console.error(`Polling aborted: ${error.reason}`);
    }
    throw error;
  }
}

// Start polling
const status = await pollWithAbort('TX-001', controller.signal);

// Cancel from another code path:
controller.abort();
```

### PollTransactionResult Reference

Each yielded result contains:

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | The transaction ID being polled |
| `attempt` | `number` | 1-based poll attempt number |
| `response` | `CheckTransactionResponse` | Raw API response from PayWay |
| `paymentStatus` | `string` | Extracted status (e.g. `'PENDING'`, `'APPROVED'`, `'ERROR: ...'`) |
| `isTerminal` | `boolean` | `true` if this is a final status — polling stops after this yield |
| `durationMs` | `number` | HTTP request duration in milliseconds |
| `timestamp` | `string` | ISO-8601 timestamp when this poll completed |

### PollingAbortedError Reference

Thrown when polling is forcibly stopped (caught by `catch` around the `for await...of` loop):

| Field | Type | Description |
|---|---|---|
| `transactionId` | `string` | The transaction ID being polled |
| `reason` | `PollAbortReason` | `'max_duration_exceeded'` or `'max_consecutive_errors'` |
| `lastStatus` | `string \| undefined` | The last observed payment status before abort |
| `totalAttempts` | `number` | Total number of poll attempts made |
| `toJSON()` | method | Serialize all fields for logging |

### Polling vs. Webhook

| Aspect | Polling (`pollTransactionStatus`) | Webhook (callback URL) |
|---|---|---|
| **Initiator** | Your server polls PayWay | PayWay pushes to your server |
| **Latency** | Up to `intervalMs` delay | Near-instant |
| **Reliability** | Depends on your server uptime | Depends on PayWay + your public URL |
| **Best for** | Real-time UI updates, POS displays | Backend order finalization |
| **Recommended** | ✅ Use both together | ✅ Webhook as source of truth, polling for UX |

> 💡 **Recommended pattern:** Use the webhook as your **source of truth** for order completion. Use `pollTransactionStatus()` as a **real-time UX supplement** — update the customer's screen immediately while the webhook handles the durable state change.

---

## Validating a QR String

You can parse the QR string to verify the embedded data:

```typescript
/**
 * Simple KHQR payload parser.
 * Parses EMVCo TLV format to extract merchant ID, transaction ID, and amount.
 */
function parseKhqrString(qrString: string): Record<string, string> | null {
  try {
    const result: Record<string, string> = {};
    let pos = 0;

    while (pos < qrString.length - 4) { // Last 4 chars are CRC
      const tag = qrString.substring(pos, pos + 2);
      const length = parseInt(qrString.substring(pos + 2, pos + 4), 10);
      const value = qrString.substring(pos + 4, pos + 4 + length);

      result[tag] = value;
      pos += 4 + length;
    }

    return result;
  } catch {
    return null;
  }
}

const info = parseKhqrString(qrString);
console.log(info);
// {
//   "00": "01",           // Payload Format Indicator
//   "01": "12",           // Point of Initiation Method
//   "30": "M001",         // Merchant ID (in sub-fields)
//   "62": "REF-123",      // Additional Data (merchant reference)
//   ...
// }
```

---

## Common QR Scenarios

| Scenario | Recommendation |
|---|---|
| **Physical POS (customer scans from phone screen)** | Use API-based `generateQr()` with polling |
| **E-commerce (customer scans with phone camera)** | Use API-based `generateQr()` with polling and webhook |
| **Static QR on invoice (same QR for multiple payments)** | Use configured offline `generateOfflineQR()` without `amount`; reconcile payments independently |
| **Telegram bot / messaging** | Send `qrImage` as a photo message |
| **Mobile app (display QR to another device)** | Use `qrString` with a native QR renderer |

---

## Next Steps

- **For web checkout flows** → [Chapter 3 — Web Implementation](./03-web-implementation.md)
- **For mobile apps** → [Chapter 4 — Native App Implementation](./04-native-app-implementation.md)
- **For production deployment** → [Chapter 13 — Deployment Checklist](./13-deployment-checklist.md)

> ← [Previous: Web Implementation](./03-web-implementation.md) | [Next: Link / Unlink / Renew Lifecycle →](./09-link-unlink-renew-lifecycle.md)
