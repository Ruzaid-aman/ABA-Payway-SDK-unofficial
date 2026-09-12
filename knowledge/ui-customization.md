# Chapter 10 — UI Customization

> **Estimated reading time:** 10 minutes  
> **Goal:** Understand what you can and cannot customize on PayWay's hosted checkout page.

---

> 📘 **Note:** PayWay provides a hosted checkout page that customers see when they pay. The customization options are limited — you don't have full control over the page's HTML/CSS. This chapter documents what's verified and what's unknown.

---

## Parameters You Can Control

Every parameter you pass to `createTransaction()` affects how the checkout page looks or behaves:

### Required Parameters

| Parameter | SDK Field | What It Controls |
|---|---|---|
| **Amount** | `amount` | Displayed prominently on the checkout page |
| **Currency** | `currency` | `'USD'` or `'KHR'` — affects formatting and exchange rate display |
| **Customer Name** | `firstname`, `lastname` | Shown on the payment receipt |
| **Transaction ID** | `transactionId` | Internal reference — not visible to customer |

### UI-Affecting Parameters

| Parameter | SDK Field | Values | Effect |
|---|---|---|---|
| **Payment Option** | `paymentOption` | `'cards'`, `'abapay_khqr'`, `'alipay'`, `'wechat'`, `'google_pay'`, `'abapay_khqr_deeplink'` | Which payment methods appear on the checkout page |
| **View Type** | `viewType` | `'hosted_view'` (default) or `'popup'` | Full-page redirect vs. popup overlay |
| **Language** | Not exposed by this SDK | The hosted page's label sets are portal/team-configured per profile (ABA integration team, 2026-09-12); no client-supplied language parameter is documented — request label/locale changes via the merchant portal or the Integration Team | Locale/language of the checkout page |
| **QR Image Template** | `qrImageTemplate` (QR API only) | `'template1'`, `'template1_color'`, `'template2'` (default), `'template2_color'`, `'template3_color'`, `'template4'`, `'template4_color'` | Visual style of generated QR codes — the full `QR_TEMPLATES` validator list (7 values). Rendered samples per template: see the [template gallery](payway-sdk docs qr-handling) |

### Flow-Control Parameters

| Parameter | SDK Field | Purpose |
|---|---|---|
| **Return URL** | `returnUrl` | Where customer goes after successful payment |
| **Cancel URL** | `cancelUrl` | Where customer goes if they click "Cancel" |
| **Continue Success URL** | `continueSuccessUrl` | Optional: second redirect after success page |
| **Skip Success Page** | `skipSuccessPage` | `0` = show PayWay success page, `1` = skip directly to `continueSuccessUrl` |
| **Payment Gate** | `paymentGate` | Which payment gateway to route through (0 = default) |

---

## Example: Customizing the Checkout Experience

```typescript
import { payway } from '../config/payway';

// === Minimal Checkout ===
const minimal = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 10.00,
  paymentOption: 'abapay_khqr',
  returnUrl: 'https://mysite.com/thank-you',
});

// === Credit Card Only, Popup Style ===
const cardPopup = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 50.00,
  currency: 'USD',
  firstname: 'Sarah',
  lastname: 'Connor',
  email: 'sarah@example.com',
  phone: '012345678',
  paymentOption: 'cards',       // Only show card payment
  viewType: 'popup',            // Popup overlay instead of full redirect
  skipSuccessPage: 1,           // Skip PayWay's success page
  continueSuccessUrl: 'https://mysite.com/order-confirmation',
});

// === Multi-Method with Deep Link Fallback ===
const multiMethod = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 25.00,
  currency: 'KHR',                     // Cambodian Riel
  paymentOption: 'abapay_khqr',        // Default to QR
  items: [
    { name: 'Coffee Mug', quantity: 2, price: 10.00 },
    { name: 'T-Shirt', quantity: 1, price: 5.00 },
  ],
  returnUrl: 'https://mysite.com/payment-done',
  cancelUrl: 'https://mysite.com/cart',
  returnDeeplink: {
    ios_scheme: 'myapp://payment-result',
    android_scheme: 'myapp://payment-result',
  },
});
```

---

## What You CANNOT Customize

PayWay's hosted checkout page is a **security-sensitive** page. For PCI compliance and safety, PayWay restricts:

| Element | Customizable? | Notes |
|---|---|---|
| **ABA / PayWay logo** | ❌ No | Required for brand trust and PCI compliance |
| **SSL certificate indicator** | ❌ No | The browser's native padlock icon |
| **Form field styling** | ❌ No | Card number, expiry, CVV fields are PayWay-controlled |
| **Page background color** | Via profile only | Theme/primary colors are set server-side on the PayWay profile — provide assets to the Integration Team (confirmed 2026-09-12); no client-side control |
| **Custom CSS injection** | ❌ No | Confirmed not supported (2026-09-12): custom CSS/JS cannot be injected and `checkout2-0.js`/the hosted HTML must not be modified client-side |
| **Complete white-label** | ❌ No | PayWay is always branded as ABA PayWay |

> 💡 **If you need full UI control**, use the **QR API** (`payway.qr.generateQr()`) instead of the redirect-based checkout. With QR, you build your own payment page and only display the QR image — you have full control over everything except the QR code itself.

---

## Best Practices for a Good Checkout UX

### 1. Match Your Brand Tone

Even though you can't change PayWay's page colors, you can set the tone with context:

```typescript
// Your "Pay Now" button should set expectations
<button onclick="startPayment('abapay_khqr')">
  Pay via KHQR (Open any banking app to scan)
</button>

<button onclick="startPayment('cards')">
  Pay with Credit/Debit Card
</button>
```

### 2. Choose the Right View Type

| `viewType` | When to Use |
|---|---|
| `'hosted_view'` | Standard web checkout — full page redirect. Best UX. |
| `'popup'` | Modal overlay. Feels more "in-app". May not work well on mobile. |

### 3. Pre-fill Customer Info When Available

If you already know the customer's name/email/phone, pass it — it saves them typing:

```typescript
// If the user is logged in, use their profile data
const signedPayload = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: cart.total,
  firstname: currentUser.firstName,   // From your database
  lastname: currentUser.lastName,
  email: currentUser.email,
  phone: currentUser.phone,
  paymentOption: currentUser.preferredPaymentMethod || 'abapay_khqr',
  returnUrl: `${BASE_URL}/payment-result`,
});
```

### 4. Skip the Success Page for Faster Flow

```typescript
// Skip intermediate success page and go straight to your confirmation
skipSuccessPage: 1,
continueSuccessUrl: 'https://mysite.com/order/confirmation',
```

> ⚠️ **Reminder:** Never mark the order as paid on the confirmation page. Always wait for the webhook callback.

---

## Research Needed (from ABA Official Docs)

The following topics need verification from ABA's developer portal:

- [ ] CSS customization options (if any)
- [ ] Language/locale parameter
- [ ] Custom logo or branding options
- [ ] Checkout page timeout configuration
- [ ] Custom field display names

> 💡 **Action:** Visit [ABA PayWay Developer Portal](https://developer.payway.com.kh) to check for updated customization documentation.

---

## Next Steps

- **For webhook handling (the real transaction confirmation)** → [Chapter 11 — Callbacks & Webhooks](payway-sdk docs callbacks-webhooks)
- **For QR-based UI (full control)** → [Chapter 7 — QR Code Handling](payway-sdk docs qr-handling)
- **For the web implementation** → [Chapter 3 — Web Implementation](payway-sdk docs web-implementation)

> ← [Previous: Link / Unlink / Renew Lifecycle](payway-sdk docs link-lifecycle) | [Next: Callbacks & Webhooks →](payway-sdk docs callbacks-webhooks)