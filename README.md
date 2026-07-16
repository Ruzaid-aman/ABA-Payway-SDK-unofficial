# ABA PayWay TypeScript SDK

Production-ready, fully-typed TypeScript SDK for the ABA PayWay payment gateway.

> [!IMPORTANT]
> **Security Warning**: This SDK is designed for **Server-Side (Node.js) execution only**. It relies on `node:crypto` for cryptographic signing (HMAC-SHA512) and RSA encryption. **Never** import or use this SDK in frontend/client-side applications (React, Angular, Vue, iOS, Android), as doing so will expose your high-privilege PayWay API Key and RSA credentials to the public.

---

## Secure Architecture Guide

For a secure integration, separate your payment flow into distinct Backend and Frontend duties:

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│     Client (Browser / App)      │           │     Secure Backend (Node.js)    │
│  (No API keys or certs stored)  │           │   (Stores API keys & calls SDK) │
└────────────────┬────────────────┘           └────────────────┬────────────────┘
                 │                                             │
                 │  1. Request checkout initiation             │
                 ├────────────────────────────────────────────>│
                 │                                             │  2. Create signed request
                 │                                             │     using PayWay SDK
                 │                                             │
                 │  3. Return signed payment form/link         │
                 │<────────────────────────────────────────────┤
                 │                                             │
                 │  4. Redirect or embed PayWay Checkout       │
                 ├─────────────────────────────────────────────┼──────────────┐
                 │                                             │              │
                 │  5. Perform payment & redirect to returnUrl │              ▼
                 │<────────────────────────────────────────────┼─────── [ PayWay API ]
                 │                                             │              ▲
                 │                                             │  6. Webhook  │
                 │                                             │     Callback │
                 │                                             │<─────────────┘
                 │                                             │
                 │                                             │  7. Verify webhook signature
                 │                                             │     using SDK & fulfill order
```

---

## Installation

```bash
npm install aba-payway-ts
```

## Quick Start

### 1. Initialize the Client

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  publicKeyPem: process.env.PAYWAY_PUBLIC_KEY_PEM, // Required for Refund, Pre-auth, Payout, and Payment Link APIs
  environment: 'sandbox', // 'sandbox' | 'production'
});
```

### Rate Limiting Configuration

PayWay documents these endpoint-specific limits:

- `check-transaction-2`: 600 requests/second
- `transaction-list-2`: 50 requests/minute
- `transaction-detail`: 10 requests/minute
- `refund`: 500 requests/second

This SDK applies client-side throttling for documented PayWay limits by default. You can fine-tune or disable this behavior using `rateLimitThrottling` and `rateLimitRules`.

```typescript
const paywayWithRateLimits = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  rateLimitThrottling: true,
  rateLimitRules: {
    '/api/payment-gateway/v1/payments/check-transaction-2': {
      limit: 600,
      intervalMs: 1000,
    },
    '/api/payment-gateway/v1/payments/transaction-list-2': {
      limit: 50,
      intervalMs: 60_000,
    },
  },
  onResponse: (endpoint, status, body, rateLimitInfo) => {
    if (rateLimitInfo) {
      console.log(`Rate limit info for ${endpoint}:`, rateLimitInfo);
    }
  },
});
```

If you prefer not to use SDK throttling at all:

```typescript
const paywayWithoutThrottling = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  rateLimitThrottling: false,
});
```

### 2. Initiate Checkout (Server-Side)

Prepare transaction parameters on the server to generate a secure transaction payload with an HMAC hash signature:

```typescript
// Create the transaction parameters
const transaction = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 15.00,
  currency: 'USD',
  items: [
    { name: 'Sleek Keyboard', quantity: 1, price: 15.00 }
  ],
  returnUrl: 'https://mywebsite.com/payment-result',
});

// Return this payload directly to your frontend checkout form/page
// The frontend will render an HTML form posting to PayWay's checkout URL using these fields
```

### 3. Handle Webhook Callback

PayWay notifies your backend server when payments are completed. Authenticate these webhooks securely:

```typescript
app.post('/api/payway-webhook', (req, res) => {
  const receivedSig = req.body.hash;
  const bodyWithoutHash = { ...req.body };
  delete bodyWithoutHash.hash;

  // Use timing-safe validation
  const isValid = payway.verifyCallback(bodyWithoutHash, receivedSig);
  
  if (!isValid) {
    return res.status(400).send('Invalid signature');
  }

  // Fulfill order safely
  console.log('Payment Approved:', req.body.tran_id);
  res.status(200).send('OK');
});
```

---

## Available API Domains

The SDK organizes PayWay's features into 7 distinct domains:

### 1. Checkout (`payway.checkout`)

Manage standard e-commerce transaction validation and retrieval.

```typescript
// Check status of a transaction
const status = await payway.checkout.checkTransaction('order-12345');

// Close/Settle a transaction manually (if pre-auth or manual capture is used)
const close = await payway.checkout.closeTransaction('order-12345');

// Refund a transaction (requires publicKeyPem)
const refund = await payway.checkout.refund('order-12345', 15.00);

// Get exchange rates
const rates = await payway.checkout.getExchangeRate();
```

### 2. Credentials-on-File / Tokenization (`payway.credentialsOnFile`)

Store card credentials and process recurring transactions securely.

```typescript
// Link a bank account
const linkAcc = await payway.credentialsOnFile.linkAccount({
  requestId: 'req-abc',
  ctid: 'customer-123',
  tokenFlag: 'CITR_FLEX',
  currency: 'USD',
});

// Link a credit/debit card (requires urlencoded payload)
const linkCard = await payway.credentialsOnFile.linkCard({
  requestId: 'req-abc',
  ctid: 'customer-123',
  tokenFlag: 'CITR_FLEX',
  frequency: '1M', // Recurrence frequency
  returnUrl: 'https://mywebsite.com/cards',
});

// Perform a payment using a saved token (pwt)
const charge = await payway.credentialsOnFile.payment({
  requestId: 'req-def',
  transactionId: 'order-789',
  amount: 25.00,
  ctid: 'customer-123',
  paymentToken: 'pwt_token_value_here',
});
```

### 3. QR API (`payway.qr`)

Dynamically generate ABA PAY KHQR strings and images.

```typescript
const qrCode = await payway.qr.generateQr({
  transactionId: 'qr-order-123',
  amount: 1.50,
  paymentOption: 'abapay_khqr',
  callbackUrl: 'https://mywebsite.com/webhook',
  qrImageTemplate: 'template2',
});
// Response includes "qrString" (for embedding/deep-linking) and "qrImage" (base64 image data)
```

### 3.1 Offline QR Generation (`payway.khqr.generateOfflineQR`)

Generate a merchant-scannable QR string entirely offline without calling PayWay. This is useful when you need a local QR payload for QR rendering or deep linking without an API request.

> ⚠️ **Not official Bakong KHQR:** this helper produces a **custom TLV-encoded QR string** with a CRC-16 checksum. It will **not** be readable by generic consumer banking apps. Use `payway.qr.generateQr()` for PayWay-issued dynamic KHQR codes.

```typescript
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: 'M001',
  apiKey: 'secret',
  environment: 'sandbox',
});

const qrString = payway.khqr.generateOfflineQR({
  merchantId: 'M001',
  transactionId: 'qr-order-123',
  amount: 1.50,
  currency: 'USD',
  merchantRef: 'REF-123',
  tipAmount: 0.25,
  feeAmount: 0.10,
  transactionType: 'purchase',
});

console.log(qrString);
```

### 4. Payment Link (`payway.paymentLink`)

Create and manage shareable payment links.

```typescript
// Create a payment link
const link = await payway.paymentLink.create({
  title: 'Invoice #1092',
  amount: 150.00,
  merchantRefNo: 'inv-1092',
  description: 'Design consultation services',
});

// Get payment link details
const details = await payway.paymentLink.getDetails(link.id);
```

### 5. Pre-Authorization (`payway.preAuth`)

Hold funds on a card and capture/cancel them later.

```typescript
// Complete/capture a pre-authorized amount
const capture = await payway.preAuth.complete('order-123', 50.00);

// Capture with secondary payout to partner accounts
const capturePayout = await payway.preAuth.completeWithPayout('order-123', 50.00, [
  { acc: '000111222', amt: 5.00 }
]);

// Cancel a pre-authorized hold
const cancel = await payway.preAuth.cancel('order-123');
```

### 6. Payout / Whitelist Account (`payway.payout`)

Perform secure payouts to whitelisted payee accounts.

```typescript
// Process a payout to multiple beneficiaries
const payoutResult = await payway.payout.payout({
  transactionId: 'payout-123',
  amount: 100.00,
  currency: 'USD',
  beneficiaries: [
    { account: '000999888', amount: 100.00 }
  ],
});

// Whitelist management
const updateStatus = await payway.payout.updateBeneficiaryStatus({ payee: '000999888', status: 1 });
const addPayee = await payway.payout.addBeneficiary({ payee: '000999888' });
```

### 7. KHQR Transactions (`payway.khqr`)

Retrieve transactions lookup using merchant reference.

```typescript
const txs = await payway.khqr.getTransactionsByMerchantRef('mc-ref-9988');
```

---

## Error Handling

All SDK API failures throw a structured `PayWayAPIError` (or `PayWayConfigError` for local configuration mistakes).

```typescript
import { PayWayAPIError } from 'aba-payway-ts';

try {
  const status = await payway.checkout.checkTransaction('order-999');
} catch (error) {
  if (error instanceof PayWayAPIError) {
    console.error('API Error Code:', error.paywayCode); // Internal PayWay code (e.g. "1" for wrong hash)
    console.error('HTTP Status:', error.statusCode);    // HTTP Status code (e.g. 403)
    console.error('Details:', error.rawBody);           // Complete JSON response body
  } else {
    console.error('System/Network failure:', error.message);
  }
}
```

---

## Development & Contribution

### Setup & Commands

- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Typecheck**: `npm run typecheck`
- **Test**: `npm run test`
