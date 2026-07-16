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

## KHQR Offline Generation (No API Call Required)

The SDK also supports generating KHQR QR codes **entirely offline** — no API call to PayWay needed. This is faster and works even if PayWay is temporarily unreachable.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
});

// Generate a KHQR QR string entirely offline
// Uses EMVCo TLV encoding + CRC-16 CCITT checksum
const qrString = payway.khqr.generateOfflineQR({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  transactionId: `order-${Date.now()}`,
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

> ⚠️ **Important:** Offline-generated QRs cannot be tracked by PayWay for status. They encode the payment data directly into the QR payload. Use the API-based `generateQr()` if you need server-side status tracking.

---

## QR Lifecycle

QR codes generated via the API have a limited lifetime:

| Phase | What Happens | SDK Action |
|---|---|---|
| **Generated** | QR is valid and displayable | `payway.qr.generateQr()` |
| **Expired** | QR times out (PayWay-enforced expiry) | Generate new QR via `generateQr()` |
| **Paid** | Customer scans and completes payment | Webhook callback notifies your server |
| **Cancelled** | You close the transaction before payment | `payway.checkout.closeTransaction()` |

> 💡 **Best practice:** Display a countdown timer on the QR page showing when the QR expires, and offer a "Refresh QR" button if the customer takes too long.

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
| **Static QR on invoice (same QR for multiple payments)** | Use offline `generateOfflineQR()` — no expiry |
| **Telegram bot / messaging** | Send `qrImage` as a photo message |
| **Mobile app (display QR to another device)** | Use `qrString` with a native QR renderer |

---

## Next Steps

- **For web checkout flows** → [Chapter 3 — Web Implementation](./03-web-implementation.md)
- **For mobile apps** → [Chapter 4 — Native App Implementation](./04-native-app-implementation.md)
- **For production deployment** → [Chapter 13 — Deployment Checklist](./13-deployment-checklist.md)

> ← [Previous: Web Implementation](./03-web-implementation.md) | [Next: Link / Unlink / Renew Lifecycle →](./09-link-unlink-renew-lifecycle.md)