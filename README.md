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
  publicKeyPem: process.env.PAYWAY_PUBLIC_KEY_PEM, // Optional, required for Refund and Payment Link APIs
  environment: 'sandbox', // 'sandbox' | 'production'
});
```

### 2. Initiate Checkout (Server-Side)

Prepare transaction parameters on the server to generate a secure transaction payload with an HMAC hash signature:

```typescript
app.post('/api/checkout', (req, res) => {
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
  res.json(transaction);
});
```

### 3. Handle Callback webhook (Server-Side)

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

## Development & Contribution

### Setup & Commands
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Format**: `npm run format`
- **Typecheck**: `npm run typecheck`
