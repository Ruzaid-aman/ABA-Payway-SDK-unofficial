# ABA PayWay Native SDK - Deep Research & Analysis

## Executive Summary

This document provides comprehensive research on all existing ABA PayWay SDKs, APIs, and integration patterns to inform the design of a new native iOS and Android SDK implementation.

---

## 1. Existing SDK Landscape Analysis

### 1.1 Node.js / TypeScript SDKs

#### **aba-payway** (npmx.dev/package/aba-payway) - by Joselay
- **Version**: 0.2.2 (Latest: Mar 3, 2026)
- **Type**: Type-safe TypeScript SDK, Zero dependencies
- **License**: MIT
- **Key Features**:
  - 15+ API methods (checkout, QR payments, refunds, pre-auth, payouts)
  - Automatic HMAC-SHA512 hash computation with correct field ordering
  - Automatic Base64 encoding for items, URLs, payout
  - Runs on Node.js, Bun, Deno, Cloudflare Workers
  - Full TypeScript support with strict types
- **Installation**: `npm install aba-payway`
- **Architecture**: Single class `PayWay` with methods for each API endpoint

#### **aba-payway-sdk** (jsdelivr/package/npm/aba-payway-sdk) - by seabnavin19
- **Version**: 0.2.35
- **Type**: Official Node.js SDK for PayWay Cambodia
- **License**: MIT
- **Key Features**:
  - QR Code Payment Generation
  - Web Purchase (Checkout Page)
  - Payment Link Creation
  - Transaction Detail Retrieval
  - Transaction List (Filtered & Paginated)
  - Check Transaction (Quick Status)
  - Refund (Full & Partial)
  - Exchange Rate Fetching
  - Close/Cancel Transactions
  - Hash Calculation Utilities
  - AI Agent Skills for Claude, Copilot, Cursor
- **Architecture**: `PayWayClient` class with modular methods

#### **payway-js** (github.com/seanghay/payway-js) - Unofficial
- **Version**: 0.1.4
- **Type**: Minimal Node.js client
- **Features**: Create Transaction, Check Transaction, List Transactions
- **Architecture**: Simple `PayWayClient` with basic methods

### 1.2 Flutter/Dart SDK

#### **aba_payment** (pub.dev/packages/aba_payment) - by kechankrisna
- **Version**: 0.0.4 (Published: Feb 14, 2023)
- **License**: Apache-2.0
- **Platform Support**: Android min SDK 21, iOS min target 12
- **Architecture**:
  - `ABAClientHelper`: HTTP request handling
  - `ABATransaction`: Transaction model
  - `ABAServerResponse`: Response model
  - `ABAMerchant`: Merchant model
  - `ABACheckoutContainer`: Complete UI widget
- **Dependencies**: `flutter_inappwebview`, `url_launcher`, `dio`, `crypto`
- **Payment Options**: Credit/Debit Card (WebView), ABA Payway Mobile (Deep Link)
- **Event Callbacks**: onBeginCheckout, onFinishCheckout, onBeginCheckTransaction, onFinishCheckTransaction, onCreatedTransaction, onPaymentSuccess, onPaymentFail

### 1.3 Python SDK

#### **aba-payway** (pypi.org/project/aba-payway) - by Sourcedevkh
- **Version**: 0.1.4 (Released: Apr 21, 2026)
- **License**: Apache-2.0
- **Requirements**: Python 3.10+, Zero third-party dependencies (stdlib only)
- **Architecture**:
  - `PayWayClient`: Main client
  - `PayWayConfig`: Configuration with Environment enum (sandbox/production)
  - Modular API clients: `QRClient`, `CheckoutClient`
  - Models: `QRRequest`, `Currency`, `PaymentOption` enums
  - Utilities: `encode_items`, `encode_url`, `get_req_time`
- **Features**: Generate QR Code, Check Transaction, Close Transaction
- **Error Handling**: `PayWayAPIError`, `PayWayRequestError`

---

## 2. Official PayWay API Documentation Analysis

### 2.1 Base URLs
| Environment | URL |
|-------------|-----|
| Sandbox | `https://checkout-sandbox.payway.com.kh/` |
| Production | `https://checkout.payway.com.kh/` |

### 2.2 Critical Requirements
- **Whitelisted Domains/IPs**: Must contact PayWay to whitelist domain/IP
- **Authentication**: HMAC-SHA512 with Base64 encoding
- **Content-Type**: `multipart/form-data` for Purchase, `application/json` for QR API
- **Error**: "6: wrong domain" if not whitelisted, "405 Method Not Allowed" for GET/browser

### 2.3 Core API Endpoints

#### **Ecommerce Checkout**
| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Purchase | POST | `/api/payment-gateway/v1/payments/purchase` | Initiate payment transaction |
| Get Transaction Details | POST | `/api/payment-gateway/v1/payments/get-transaction-detail` | Full transaction details |
| Close Transaction | POST | `/api/payment-gateway/v1/payments/close-transaction` | Close/cancel transaction |
| Check Transaction | POST | `/api/payment-gateway/v1/payments/check-transaction-2` | Quick status check (7 days limit) |
| Refund | POST | `/api/payment-gateway/v1/payments/refund` | Full/partial refund |
| Transaction List | POST | `/api/payment-gateway/v1/payments/get-transaction-list` | Filtered & paginated |
| Exchange Rate | POST | `/api/payment-gateway/v1/payments/exchange-rate` | Get exchange rates |

#### **ABA QR API**
| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Generate QR | POST | `/api/payment-gateway/v1/payments/generate-qr` | Dynamic QR generation |

#### **Payment Link**
| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Create Payment Link | POST | `/api/payment-gateway/v1/payments/create-payment-link` | Generate payment link |
| Get Payment Link Details | POST | `/api/payment-gateway/v1/payments/get-payment-link-detail` | Retrieve link details |

#### **Credentials on File (CoF)**
| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Link Account | POST | `/api/payment-gateway/v1/payments/link-account` | Link ABA account |
| Link Card | POST | `/api/payment-gateway/v1/payments/link-card` | Link credit/debit card |
| Payment (CoF) | POST | `/api/payment-gateway/v1/payments/payment` | Charge saved method |
| Renew Token | POST | `/api/payment-gateway/v1/payments/renew-token` | Renew saved token |
| Get Token Details | POST | `/api/payment-gateway/v1/payments/get-token-details` | Get token info |
| Remove Token | POST | `/api/payment-gateway/v1/payments/remove-token` | Remove saved method |
| Subscription | POST | `/api/payment-gateway/v1/payments/subscription` | Manage subscriptions |

#### **Pre-auth**
| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Complete Pre-auth | POST | `/api/payment-gateway/v1/payments/complete-pre-auth` | Capture pre-auth |
| Complete with Payout | POST | `/api/payment-gateway/v1/payments/complete-pre-auth-payout` | Capture with payout |
| Cancel Pre-auth | POST | `/api/payment-gateway/v1/payments/cancel-pre-auth` | Cancel pre-auth |

#### **Payout**
| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Payout | POST | `/api/payment-gateway/v1/payments/payout` | Multi-party payout |
| Update Beneficiary | POST | `/api/payment-gateway/v1/payments/update-beneficiary` | Update beneficiary status |
| Add Beneficiary | POST | `/api/payment-gateway/v1/payments/add-beneficiary` | Add to whitelist |

---

## 3. Hash Computation Specification

### 3.1 Purchase API Hash (multipart/form-data)
```
Fields in order: req_time + merchant_id + tran_id + amount + items + first_name + last_name + email + phone + type + payment_option + currency + shipping + return_url + cancel_url + skip_success_page + continue_success_url + return_deeplink + custom_fields + return_params + view_type + payment_gate + payout + additional_params + lifetime + google_pay_token
```

### 3.2 QR API Hash (application/json)
```
Fields in order: req_time + merchant_id + tran_id + amount + items + first_name + last_name + email + phone + purchase_type + payment_option + callback_url + return_deeplink + currency + custom_fields + return_params + payout + lifetime + qr_image_template
```

### 3.3 Check Transaction Hash
```
Fields: req_time + merchant_id + tran_id
```

### 3.4 Algorithm
```php
$hash = base64_encode(hash_hmac('sha512', $concatenated_string, $api_key, true));
```

---

## 4. Payment Options Matrix

| Payment Option | Currency | Description | Deeplink Support |
|----------------|----------|-------------|------------------|
| `cards` | USD/KHR | Credit/Debit Cards | No |
| `abapay_khqr` | USD/KHR | ABA Pay + KHQR QR | Yes (via QR) |
| `abapay_khqr_deeplink` | USD/KHR | ABA Pay + KHQR with Deeplink | **Yes** |
| `alipay` | USD only | Alipay Wallet | No |
| `wechat` | USD only | WeChat Wallet | No |
| `google_pay` | USD only | Google Pay Wallet | No |

### Payment Option Response (abapay_khqr_deeplink)
```json
{
  "qr_string": "00020101021230510016abaakhppxxx@abaa...",
  "qr_image": "data:image/png;base64,iVBORw0KGgo...",
  "abapay_deeplink": "abamobilebank://ababank.com?type=payway&qrcode=...",
  "app_store": "https://itunes.apple.com/al/app/aba-mobile-bank/id968860649?mt=8",
  "play_store": "https://play.google.com/store/apps/details?id=com.paygo24.ibank",
  "amount": 0.01,
  "currency": "USD",
  "status": { "code": "0", "message": "Success.", "trace_id": "..." }
}
```

---

## 5. Transaction Status Codes

| Code | Status | Description |
|------|--------|-------------|
| 0 | APPROVED | Transaction successful |
| 0 | PRE-AUTH | Pre-authorization hold |
| 2 | PENDING | Awaiting payment |
| 3 | DECLINED | Payment declined |
| 4 | REFUNDED | Fully/partially refunded |
| 7 | CANCELLED | Merchant cancelled |

---

## 6. Deeplink / Mobile Integration Patterns

### 6.1 Return Deeplink Format (Required for Mobile)
```json
{
  "android_scheme": "your.app.scheme://payway",
  "ios_scheme": "your.app.scheme://payway"
}
```
**Must be Base64 encoded** in `return_deeplink` parameter.

### 6.2 ABA Mobile Deeplink (from QR API)
```
abamobilebank://ababank.com?type=payway&qrcode={encoded_qr_string}
```

### 6.3 App Store Fallbacks
- **iOS**: `https://itunes.apple.com/al/app/aba-mobile-bank/id968860649?mt=8`
- **Android**: `https://play.google.com/store/apps/details?id=com.paygo24.ibank`

### 6.4 View Types
| View Type | Desktop | Mobile Web | Native App |
|-----------|---------|------------|------------|
| `hosted_view` | New tab | New tab | Not recommended |
| `popup` | Modal popup | Bottom sheet | WebView |

---

## 7. Callback / Webhook Handling

### 7.1 Pushback Data Format
```json
{
  "tran_id": "17425401324",
  "apv": "619195",
  "status": "0",
  "return_params": "xxxxxxxxxx"
}
```

### 7.2 Callback Signature Verification (PHP Example)
```php
$response = json_decode(file_get_contents('php://input'), true);
$secretKey = "YOUR_SECRET_KEY";
ksort($response);
$b4hash = '';
foreach ($response as $value) {
  if (is_array($value)) $value = json_encode($value);
  $b4hash .= $value;
}
$signature = base64_encode(hash_hmac('sha512', $b4hash, $secretKey, true));
$receivedSignature = $_SERVER['HTTP_X_PAYWAY_HMAC_SHA512'] ?? '';
if (hash_equals($signature, $receivedSignature)) {
  // Valid request
}
```

### 7.3 Callback Requirements
- Accept HTTP POST
- Accept Content-Type: application/json
- Domain must be whitelisted
- Secure endpoint (HTTPS)

---

## 8. UI/UX Guidelines (Official)

### 8.1 Web UI Guidelines
- **Figma**: https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/-External-Use--Merchant-Integration-Guideline---2.11?node-id=18242-3423
- Payment selection UI required
- "We Accept..." section required

### 8.2 Mobile UI Guidelines
- **Figma**: https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/-External-Use--Merchant-Integration-Guideline---2.11?node-id=18242-3756
- Native bottom sheet / modal patterns

### 8.3 QR Display Guidelines
- **Figma**: https://www.figma.com/design/5AJmZJwZha5QFfpIKmREBr/Displaying-Payment-QR-Code---Integration-Guideline?node-id=0-320

---

## 9. QR Image Templates

| Template | Description |
|----------|-------------|
| `TEMPLATE1` | Standard |
| `TEMPLATE1_COLOR` | Colored standard |
| `TEMPLATE2` | Alternative layout |
| `TEMPLATE2_COLOR` | Colored alternative |
| `TEMPLATE3` | Compact |
| `TEMPLATE3_COLOR` | Colored compact |

---

## 10. Lifetime Limits

| Payment Method | Min | Max | Expiry Behavior |
|----------------|-----|-----|-----------------|
| ABA PAY / Card | 3 min | 30 days | Transaction fails |
| KHQR | 3 min | 120 days | Rejected, funds reversed |
| WeChat / Alipay | 3 min | 30 days | No reversal |

---

## 11. Rate Limits

| API | Limit |
|-----|-------|
| Check Transaction | 600 requests/second |
| Transaction Detail | 10 requests/minute (no real-time during payment) |

---

## 12. Inspiration from Industry Leaders

### 12.1 Razorpay (Flutter Plugin)
- **Pattern**: Wrapper around native Android/iOS SDKs
- **Events**: `EVENT_PAYMENT_SUCCESS`, `EVENT_PAYMENT_ERROR`, `EVENT_EXTERNAL_WALLET`
- **Method**: `open(options)` with configuration object
- **ProGuard Rules**: Keep Razorpay classes, preserve callback methods
- **iOS**: Bitcode support, Swift version configuration

### 12.2 Stripe (iOS/Android SDKs)
- **Architecture**: Prebuilt UI (PaymentSheet) + Custom UI (Payment Element) + Low-level APIs
- **iOS**: Swift/Objective-C, PaymentSheet FlowController, Address Element, Apple Pay
- **Android**: Kotlin/Java, PaymentSheet, Payment Element, Google Pay, Address Element
- **Appearance API**: Full theming/customization
- **Customer Sheet**: Manage saved payment methods

---

## 13. Gap Analysis: What Native SDKs Need

### Current Gaps in Existing Solutions:
1. **No official native iOS SDK** (Swift)
2. **No official native Android SDK** (Kotlin)
3. **No official React Native SDK**
4. **Flutter plugin uses WebView** (not native)
5. **No built-in deeplink handling** for ABA Mobile
6. **No native UI components** (bottom sheets, QR display)
7. **No offline/sync capabilities**
8. **No built-in callback verification utilities**
9. **No type-safe models for all API responses**

### Required Native Features:
1. **Native payment sheet** (like Stripe PaymentSheet)
2. **Deeplink handler** for ABA Mobile → App return
3. **QR code display component** with templates
4. **Secure credential storage** (Keychain/Keystore)
5. **Callback verification utilities**
6. **Full type-safe models**
7. **Offline transaction queue**
8. **Analytics/event tracking**
9. **Accessibility support**
10. **Localization (Khmer/English)**

---

## 14. Recommended Architecture for Native SDKs

### 14.1 Core Module Structure
```
aba-payway-native/
├── core/                    # Shared business logic
│   ├── models/             # Request/Response models
│   ├── crypto/             # HMAC-SHA512, Base64
│   ├── network/            # HTTP client, interceptors
│   └── validation/         # Input validation
├── ios/                    # iOS SDK (Swift)
│   ├── ABA PayWay.xcframework
│   ├── PaymentSheet/       # Native bottom sheet
│   ├── QRDisplay/          # QR code UI component
│   ├── DeeplinkHandler/    # Universal Links + Custom schemes
│   └── Keychain/           # Secure storage
├── android/                # Android SDK (Kotlin)
│   ├── aba-payway.aar
│   ├── paymentsheet/       # BottomSheetDialogFragment
│   ├── qrdisplay/          # QR code View
│   ├── deeplink/           # App Links + Custom schemes
│   └── keystore/           # EncryptedSharedPreferences
├── flutter/                # Flutter plugin (wraps native)
├── react-native/           # React Native bridge
└── docs/                   # Integration guides
```

### 14.2 Key Design Principles
1. **Zero dependencies** (like Python SDK)
2. **Type-safe** (like TypeScript SDK)
3. **Platform-idiomatic** (Swift/Kotlin best practices)
4. **Secure by default** (Keychain/Keystore, certificate pinning)
5. **Observable/Combine/Flow** for async operations
6. **Modular** - use only what you need
7. **Well-documented** with integration guides

---

## 15. Implementation Priority

| Phase | Deliverable | Timeline |
|-------|-------------|----------|
| 1 | Core crypto/network models (shared) | Week 1-2 |
| 2 | iOS SDK: PaymentSheet + Deeplink | Week 3-5 |
| 3 | Android SDK: PaymentSheet + Deeplink | Week 3-5 |
| 4 | QR Display components (both) | Week 5-6 |
| 5 | Callback verification utilities | Week 6 |
| 6 | Flutter plugin wrapper | Week 7-8 |
| 7 | React Native bridge | Week 8-9 |
| 8 | Documentation & Examples | Week 9-10 |
| 9 | Testing & Sandbox validation | Week 10-11 |
| 10 | Production release | Week 12 |

---

## 16. Appendix: Key References

- Official Developer Portal: https://developer.payway.com.kh/
- Sandbox Registration: https://sandbox.payway.com.kh/register-sandbox/
- Production Credentials: paywaysales@ababank.com
- Web UI Guidelines (Figma): External Use Merchant Integration Guideline 2.11
- Mobile UI Guidelines (Figma): External Use Merchant Integration Guideline 2.11
- QR Display Guidelines (Figma): Displaying Payment QR Code Integration Guideline