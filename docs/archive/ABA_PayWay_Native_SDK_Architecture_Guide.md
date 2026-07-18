# ABA PayWay Native SDK — Deep Research & Architecture Guide

> **Date:** July 18, 2026  
> **Research Scope:** 6 existing SDKs, official PayWay APIs, Stripe & Razorpay patterns  
> **Goal:** Design native iOS (Swift) and Android (Kotlin) SDKs with deeplink handling

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Existing SDK Landscape Analysis](#2-existing-sdk-landscape-analysis)
3. [Official PayWay API Documentation](#3-official-payway-api-documentation)
4. [Hash Computation Specification](#4-hash-computation-specification)
5. [Payment Options Matrix](#5-payment-options-matrix)
6. [Transaction Status Codes](#6-transaction-status-codes)
7. [Deeplink & Mobile Integration Patterns](#7-deeplink--mobile-integration-patterns)
8. [Callback / Webhook Handling](#8-callback--webhook-handling)
9. [UI/UX Guidelines](#9-uiux-guidelines)
10. [Gap Analysis](#10-gap-analysis)
11. [Architecture Design](#11-architecture-design)
12. [iOS SDK Implementation Guide](#12-ios-sdk-implementation-guide)
13. [Android SDK Implementation Guide](#13-android-sdk-implementation-guide)
14. [Server-Side Integration](#14-server-side-integration)
15. [Implementation Roadmap](#15-implementation-roadmap)
16. [Appendix: Key References](#16-appendix-key-references)

---

## 1. Executive Summary

This document provides comprehensive research on all existing ABA PayWay SDKs, APIs, and integration patterns to inform the design of a new native iOS and Android SDK implementation. After analyzing 6 existing community SDKs, official PayWay APIs, and industry-leading patterns from Stripe and Razorpay, we identify critical gaps in the current ecosystem and propose a modular, secure, type-safe native SDK architecture.

### Key Findings

- **No official native iOS SDK exists** (Swift)
- **No official native Android SDK exists** (Kotlin)
- **No official React Native SDK exists**
- The Flutter plugin (`aba_payment`) uses WebView — not native
- **No built-in deeplink handling** for ABA Mobile → App return
- **No native UI components** (bottom sheets, QR display)
- **No secure credential storage** (Keychain/Keystore)
- **No built-in callback verification utilities**

---

## 2. Existing SDK Landscape Analysis

### 2.1 Node.js / TypeScript SDKs

#### **aba-payway** (npmx.dev/package/aba-payway) — by Joselay
- **Version:** 0.2.2 (Latest: Mar 3, 2026)
- **Type:** Type-safe TypeScript SDK, Zero dependencies
- **License:** MIT
- **Key Features:**
  - 15+ API methods (checkout, QR payments, refunds, pre-auth, payouts)
  - Automatic HMAC-SHA512 hash computation with correct field ordering
  - Automatic Base64 encoding for items, URLs, payout
  - Runs on Node.js, Bun, Deno, Cloudflare Workers
  - Full TypeScript support with strict types
- **Installation:** `npm install aba-payway`
- **Architecture:** Single class `PayWay` with methods for each API endpoint

```typescript
import { PayWay } from 'aba-payway'

const payway = new PayWay({
  merchantId: 'your_merchant_id',
  apiKey: 'your_api_key',
})

// Generate checkout params (synchronous — no API call)
const params = payway.createTransaction({
  transactionId: 'order-001',
  amount: 10.00,
  items: 'Product A',
  returnUrl: 'https://yoursite.com/callback',
})
```

#### **aba-payway-sdk** (jsdelivr/package/npm/aba-payway-sdk) — by seabnavin19
- **Version:** 0.2.35
- **Type:** Official Node.js SDK for PayWay Cambodia
- **License:** MIT
- **Key Features:**
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
- **Architecture:** `PayWayClient` class with modular methods

#### **payway-js** (github.com/seanghay/payway-js) — Unofficial
- **Version:** 0.1.4
- **Type:** Minimal Node.js client
- **Features:** Create Transaction, Check Transaction, List Transactions
- **Architecture:** Simple `PayWayClient` with basic methods

### 2.2 Flutter/Dart SDK

#### **aba_payment** (pub.dev/packages/aba_payment) — by kechankrisna
- **Version:** 0.0.4 (Published: Feb 14, 2023)
- **License:** Apache-2.0
- **Platform Support:** Android min SDK 21, iOS min target 12
- **Architecture:**
  - `ABAClientHelper`: HTTP request handling
  - `ABATransaction`: Transaction model
  - `ABAServerResponse`: Response model
  - `ABAMerchant`: Merchant model
  - `ABACheckoutContainer`: Complete UI widget
- **Dependencies:** `flutter_inappwebview`, `url_launcher`, `dio`, `crypto`
- **Payment Options:** Credit/Debit Card (WebView), ABA Payway Mobile (Deep Link)
- **Event Callbacks:**
  - `onBeginCheckout` — Triggered when user pressed checkout button
  - `onFinishCheckout` — After checkout button, transaction created
  - `onBeginCheckTransaction` — After payment, start checking status
  - `onFinishCheckTransaction` — Transaction checking finished
  - `onCreatedTransaction` — Transaction completed checking
  - `onPaymentSuccess` — Payment successful
  - `onPaymentFail` — Payment failed

```dart
ABACheckoutContainer(
    amount: _total,
    shipping: _shipping,
    firstname: _firstname,
    lastname: _lastname,
    email: _email,
    phone: _phone,
    items: [..._items.map((e) => e.toMap()).toList()],
    checkoutApiUrl: _checkoutApiUrl,
    merchant: _merchant,
    onBeginCheckout: (transaction) {
      setState(() => _isLoading = true);
      EasyLoading.show(status: 'loading...');
    },
    onFinishCheckout: (transaction) {
      setState(() => _isLoading = false);
      EasyLoading.dismiss();
    },
    onBeginCheckTransaction: (transaction) {
      setState(() => _isLoading = true);
      EasyLoading.show(status: 'loading...');
    },
    onFinishCheckTransaction: (transaction) {
      setState(() => _isLoading = false);
      EasyLoading.dismiss();
    },
    enabled: !_isLoading,
)
```

### 2.3 Python SDK

#### **aba-payway** (pypi.org/project/aba-payway) — by Sourcedevkh
- **Version:** 0.1.4 (Released: Apr 21, 2026)
- **License:** Apache-2.0
- **Requirements:** Python 3.10+, Zero third-party dependencies (stdlib only)
- **Architecture:**
  - `PayWayClient`: Main client
  - `PayWayConfig`: Configuration with Environment enum (sandbox/production)
  - Modular API clients: `QRClient`, `CheckoutClient`
  - Models: `QRRequest`, `Currency`, `PaymentOption` enums
  - Utilities: `encode_items`, `encode_url`, `get_req_time`
- **Features:** Generate QR Code, Check Transaction, Close Transaction
- **Error Handling:** `PayWayAPIError`, `PayWayRequestError`

---

## 3. Official PayWay API Documentation

### 3.1 Base URLs

| Environment | URL |
|-------------|-----|
| Sandbox | `https://checkout-sandbox.payway.com.kh/` |
| Production | `https://checkout.payway.com.kh/` |

### 3.2 Critical Requirements

- **Whitelisted Domains/IPs:** Must contact PayWay to whitelist domain/IP
- **Authentication:** HMAC-SHA512 with Base64 encoding
- **Content-Type:** `multipart/form-data` for Purchase, `application/json` for QR API
- **Error:** "6: wrong domain" if not whitelisted, "405 Method Not Allowed" for GET/browser

### 3.3 Core API Endpoints

#### Ecommerce Checkout

| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Purchase | POST | `/api/payment-gateway/v1/payments/purchase` | Initiate payment transaction |
| Get Transaction Details | POST | `/api/payment-gateway/v1/payments/get-transaction-detail` | Full transaction details |
| Close Transaction | POST | `/api/payment-gateway/v1/payments/close-transaction` | Close/cancel transaction |
| Check Transaction | POST | `/api/payment-gateway/v1/payments/check-transaction-2` | Quick status check (7 days limit) |
| Refund | POST | `/api/payment-gateway/v1/payments/refund` | Full/partial refund |
| Transaction List | POST | `/api/payment-gateway/v1/payments/get-transaction-list` | Filtered & paginated |
| Exchange Rate | POST | `/api/payment-gateway/v1/payments/exchange-rate` | Get exchange rates |

#### ABA QR API

| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Generate QR | POST | `/api/payment-gateway/v1/payments/generate-qr` | Dynamic QR generation |

#### Payment Link

| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Create Payment Link | POST | `/api/payment-gateway/v1/payments/create-payment-link` | Generate payment link |
| Get Payment Link Details | POST | `/api/payment-gateway/v1/payments/get-payment-link-detail` | Retrieve link details |

#### Credentials on File (CoF)

| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Link Account | POST | `/api/payment-gateway/v1/payments/link-account` | Link ABA account |
| Link Card | POST | `/api/payment-gateway/v1/payments/link-card` | Link credit/debit card |
| Payment (CoF) | POST | `/api/payment-gateway/v1/payments/payment` | Charge saved method |
| Renew Token | POST | `/api/payment-gateway/v1/payments/renew-token` | Renew saved token |
| Get Token Details | POST | `/api/payment-gateway/v1/payments/get-token-details` | Get token info |
| Remove Token | POST | `/api/payment-gateway/v1/payments/remove-token` | Remove saved method |
| Subscription | POST | `/api/payment-gateway/v1/payments/subscription` | Manage subscriptions |

#### Pre-auth

| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Complete Pre-auth | POST | `/api/payment-gateway/v1/payments/complete-pre-auth` | Capture pre-auth |
| Complete with Payout | POST | `/api/payment-gateway/v1/payments/complete-pre-auth-payout` | Capture with payout |
| Cancel Pre-auth | POST | `/api/payment-gateway/v1/payments/cancel-pre-auth` | Cancel pre-auth |

#### Payout

| Endpoint | Method | Path | Description |
|----------|--------|------|-------------|
| Payout | POST | `/api/payment-gateway/v1/payments/payout` | Multi-party payout |
| Update Beneficiary | POST | `/api/payment-gateway/v1/payments/update-beneficiary` | Update beneficiary status |
| Add Beneficiary | POST | `/api/payment-gateway/v1/payments/add-beneficiary` | Add to whitelist |

---

## 4. Hash Computation Specification

### 4.1 Purchase API Hash (multipart/form-data)

```
Fields in order:
req_time + merchant_id + tran_id + amount + items + first_name + last_name + 
email + phone + type + payment_option + currency + shipping + return_url + 
cancel_url + skip_success_page + continue_success_url + return_deeplink + 
custom_fields + return_params + view_type + payment_gate + payout + 
additional_params + lifetime + google_pay_token
```

### 4.2 QR API Hash (application/json)

```
Fields in order:
req_time + merchant_id + tran_id + amount + items + first_name + last_name + 
email + phone + purchase_type + payment_option + callback_url + return_deeplink + 
currency + custom_fields + return_params + payout + lifetime + qr_image_template
```

### 4.3 Check Transaction Hash

```
Fields: req_time + merchant_id + tran_id
```

### 4.4 Algorithm

```php
$hash = base64_encode(hash_hmac('sha512', $concatenated_string, $api_key, true));
```

**Important:** The field ordering is strict and different per API endpoint. Getting the order wrong results in authentication failure.

---

## 5. Payment Options Matrix

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

## 6. Transaction Status Codes

| Code | Status | Description |
|------|--------|-------------|
| 0 | APPROVED | Transaction successful |
| 0 | PRE-AUTH | Pre-authorization hold |
| 2 | PENDING | Awaiting payment |
| 3 | DECLINED | Payment declined |
| 4 | REFUNDED | Fully/partially refunded |
| 7 | CANCELLED | Merchant cancelled |

---

## 7. Deeplink & Mobile Integration Patterns

### 7.1 Return Deeplink Format (Required for Mobile)

```json
{
  "android_scheme": "your.app.scheme://payway",
  "ios_scheme": "your.app.scheme://payway"
}
```

**Must be Base64 encoded** in `return_deeplink` parameter.

### 7.2 ABA Mobile Deeplink (from QR API)

```
abamobilebank://ababank.com?type=payway&qrcode={encoded_qr_string}
```

### 7.3 App Store Fallbacks

- **iOS:** `https://itunes.apple.com/al/app/aba-mobile-bank/id968860649?mt=8`
- **Android:** `https://play.google.com/store/apps/details?id=com.paygo24.ibank`

### 7.4 View Types

| View Type | Desktop | Mobile Web | Native App |
|-----------|---------|------------|------------|
| `hosted_view` | New tab | New tab | Not recommended |
| `popup` | Modal popup | Bottom sheet | WebView |

---

## 8. Callback / Webhook Handling

### 8.1 Pushback Data Format

```json
{
  "tran_id": "17425401324",
  "apv": "619195",
  "status": "0",
  "return_params": "xxxxxxxxxx"
}
```

### 8.2 Callback Signature Verification (PHP Example)

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

### 8.3 Callback Requirements

- Accept HTTP POST
- Accept Content-Type: application/json
- Domain must be whitelisted
- Secure endpoint (HTTPS)

---

## 9. UI/UX Guidelines

### 9.1 Web UI Guidelines

- **Figma:** https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/-External-Use--Merchant-Integration-Guideline---2.11?node-id=18242-3423
- Payment selection UI required
- "We Accept..." section required

### 9.2 Mobile UI Guidelines

- **Figma:** https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/-External-Use--Merchant-Integration-Guideline---2.11?node-id=18242-3756
- Native bottom sheet / modal patterns

### 9.3 QR Display Guidelines

- **Figma:** https://www.figma.com/design/5AJmZJwZha5QFfpIKmREBr/Displaying-Payment-QR-Code---Integration-Guideline?node-id=0-320

---

## 10. QR Image Templates

| Template | Description |
|----------|-------------|
| `TEMPLATE1` | Standard |
| `TEMPLATE1_COLOR` | Colored standard |
| `TEMPLATE2` | Alternative layout |
| `TEMPLATE2_COLOR` | Colored alternative |
| `TEMPLATE3` | Compact |
| `TEMPLATE3_COLOR` | Colored compact |

---

## 11. Lifetime Limits

| Payment Method | Min | Max | Expiry Behavior |
|----------------|-----|-----|-----------------|
| ABA PAY / Card | 3 min | 30 days | Transaction fails |
| KHQR | 3 min | 120 days | Rejected, funds reversed |
| WeChat / Alipay | 3 min | 30 days | No reversal |

---

## 12. Rate Limits

| API | Limit |
|-----|-------|
| Check Transaction | 600 requests/second |
| Transaction Detail | 10 requests/minute (no real-time during payment) |

---

## 13. Inspiration from Industry Leaders

### 13.1 Razorpay (Flutter Plugin)

- **Pattern:** Wrapper around native Android/iOS SDKs
- **Events:** `EVENT_PAYMENT_SUCCESS`, `EVENT_PAYMENT_ERROR`, `EVENT_EXTERNAL_WALLET`
- **Method:** `open(options)` with configuration object
- **ProGuard Rules:** Keep Razorpay classes, preserve callback methods
- **iOS:** Bitcode support, Swift version configuration

```dart
_razorpay = Razorpay();
_razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
_razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _handlePaymentError);
_razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);

var options = {
  'key': '<YOUR_KEY_HERE>',
  'amount': 100,
  'name': 'Acme Corp.',
  'description': 'Fine T-Shirt',
  'prefill': {
    'contact': '8888888888',
    'email': 'test@razorpay.com'
  }
};

_razorpay.open(options);
```

### 13.2 Stripe (iOS/Android SDKs)

- **Architecture:** Prebuilt UI (PaymentSheet) + Custom UI (Payment Element) + Low-level APIs
- **iOS:** Swift/Objective-C, PaymentSheet FlowController, Address Element, Apple Pay
- **Android:** Kotlin/Java, PaymentSheet, Payment Element, Google Pay, Address Element
- **Appearance API:** Full theming/customization
- **Customer Sheet:** Manage saved payment methods

---

## 14. Gap Analysis

### Current Gaps in Existing Solutions

1. **No official native iOS SDK** (Swift)
2. **No official native Android SDK** (Kotlin)
3. **No official React Native SDK**
4. **Flutter plugin uses WebView** (not native)
5. **No built-in deeplink handling** for ABA Mobile
6. **No native UI components** (bottom sheets, QR display)
7. **No offline/sync capabilities**
8. **No built-in callback verification utilities**
9. **No type-safe models for all API responses**

### Required Native Features

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

## 15. Architecture Design

### 15.1 Core Module Structure

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

### 15.2 Key Design Principles

1. **Zero dependencies** (like Python SDK)
2. **Type-safe** (like TypeScript SDK)
3. **Platform-idiomatic** (Swift/Kotlin best practices)
4. **Secure by default** (Keychain/Keystore, certificate pinning)
5. **Observable/Combine/Flow** for async operations
6. **Modular** — use only what you need
7. **Well-documented** with integration guides

### 15.3 Payment Flow Architecture

```
1. Merchant App → SDK.presentPaymentSheet(config)
   ↓
2. SDK generates HMAC-SHA512 hash (correct field ordering)
   ↓
3. Native Payment Sheet renders (iOS: Bottom Sheet | Android: BottomSheetDialog)
   ↓
4. User selects payment method:
   - Cards → WebView/3DS flow
   - ABA KHQR → QR Display component
   - ABA Deeplink → Opens ABA Mobile app
   ↓
5. Payment completion → ABA Mobile returns via deeplink
   ↓
6. SDK verifies callback signature via HMAC
   ↓
7. Emits success/failure event to merchant app
```

---

## 16. iOS SDK Implementation Guide

### 16.1 Installation Options

| Method | Command | Recommended |
|--------|---------|-------------|
| Swift Package Manager | `https://github.com/your-org/aba-payway-ios.git` | ⭐ Yes |
| CocoaPods | `pod 'ABAPayWay'` | Yes |
| Manual XCFramework | Drag & Drop | Enterprise |

### 16.2 Min Requirements

- iOS 14.0+
- Xcode 15.0+
- Swift 5.9+
- Bitcode enabled

### 16.3 Initialize SDK

```swift
import ABAPayWay

let payway = ABAPayWay(
    merchantId: "your_merchant_id",
    apiKey: "your_api_key",
    environment: .sandbox // or .production
)
```

### 16.4 Present Payment Sheet

```swift
let config = PaymentSheetConfiguration(
    transactionId: "order-001",
    amount: Decimal(10.00),
    currency: .usd,
    paymentOptions: [.abaKHQR, .cards, .alipay],
    items: [
        PaymentItem(name: "Product A", quantity: 1, price: 10.00)
    ],
    returnDeeplink: DeeplinkConfig(
        iosScheme: "yourapp://payway/callback",
        androidScheme: "yourapp://payway/callback"
    )
)

payway.presentPaymentSheet(
    from: self,
    configuration: config,
    delegate: self
)
```

### 16.5 Implement Delegate

```swift
extension PaymentViewController: ABAPayWayDelegate {
    func paymentSheet(
        _ sheet: PaymentSheet, 
        didCompleteWithResult result: PaymentResult
    ) {
        switch result {
        case .success(let transaction):
            print("Payment approved: \(transaction.tranId)")
            // Fulfill order, update UI
        case .failure(let error):
            print("Payment failed: \(error.localizedDescription)")
            // Show error to user
        case .cancelled:
            print("User cancelled payment")
            // Dismiss or return to cart
        }
    }
}
```

### 16.6 Deeplink Handling (SceneDelegate)

```swift
func scene(
    _ scene: UIScene, 
    openURLContexts URLContexts: Set<UIOpenURLContext>
) {
    guard let url = URLContexts.first?.url else { return }

    ABAPayWayDeeplinkHandler.handle(url: url) { result in
        switch result {
        case .success(let callback):
            // Verify signature before trusting
            let isValid = try? ABAPayWayCrypto.verifyCallback(
                callback: callback,
                secretKey: "your_api_key"
            )
            if isValid == true {
                // Update UI, fulfill order
            }
        case .failure:
            print("Invalid deeplink")
        }
    }
}
```

### 16.7 Required Info.plist Configuration

```xml
<!-- Required for ABA Mobile deeplink -->
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>abamobilebank</string>
</array>

<!-- Custom URL scheme for return -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.yourapp.payway</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>yourapp</string>
        </array>
    </dict>
</array>
```

### 16.8 QR Payment Flow

```swift
// Generate QR
payway.generateQR(
    transactionId: "qr-001",
    amount: 10.00,
    paymentOption: .abaKHQR,
    qrImageTemplate: .template1,
    lifetime: 30
) { result in
    switch result {
    case .success(let qrResponse):
        // Display QR image
        let qrImage = qrResponse.qrImage // Base64 PNG
        let deeplink = qrResponse.abapayDeeplink

        // Present QR display component
        let qrView = ABAPayWayQRDisplayView(
            qrImage: qrImage,
            amount: 10.00,
            currency: .usd
        )

        // Auto-poll for payment status
        qrView.startPolling(transactionId: "qr-001", interval: 3.0) { status in
            if status == .approved {
                // Payment complete
            }
        }

    case .failure(let error):
        print("QR generation failed: \(error)")
    }
}
```

---

## 17. Android SDK Implementation Guide

### 17.1 Gradle Dependency

```kotlin
// build.gradle.kts (app level)
dependencies {
    implementation("com.ababank.payway:android-sdk:1.0.0")

    // Optional: for encrypted preferences
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

### 17.2 Min Requirements

- minSdkVersion 24 (Android 7.0)
- compileSdk 34
- Kotlin 1.9+
- Java 17

### 17.3 AndroidManifest.xml

```xml
<activity android:name=".PaymentActivity"
    android:launchMode="singleTask">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="yourapp" 
              android:host="payway" 
              android:pathPrefix="/callback" />
    </intent-filter>
</activity>
```

### 17.4 Initialize & Present Payment Sheet

```kotlin
class PaymentActivity : AppCompatActivity() {

    private lateinit var payWay: ABAPayWay

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize SDK
        payWay = ABAPayWay(
            context = this,
            merchantId = "your_merchant_id",
            apiKey = "your_api_key",
            environment = Environment.SANDBOX
        )

        // Configure payment
        val config = PaymentSheetConfig(
            transactionId = "order-001",
            amount = BigDecimal("10.00"),
            currency = Currency.USD,
            paymentOptions = listOf(
                PaymentOption.ABA_KHQR,
                PaymentOption.CARDS,
                PaymentOption.ALIPAY
            ),
            returnDeeplink = DeeplinkConfig(
                androidScheme = "yourapp://payway/callback",
                iosScheme = "yourapp://payway/callback"
            )
        )

        // Present bottom sheet
        payWay.presentPaymentSheet(
            activity = this,
            config = config,
            callback = object : PaymentSheetCallback {
                override fun onPaymentSuccess(result: PaymentSuccessResult) {
                    Toast.makeText(
                        this@PaymentActivity,
                        "Payment: ${result.tranId}",
                        Toast.LENGTH_SHORT
                    ).show()
                }

                override fun onPaymentError(error: PaymentError) {
                    Log.e("PayWay", "Error: ${error.message}")
                }

                override fun onPaymentCancelled() {
                    Log.d("PayWay", "User cancelled")
                }
            }
        )
    }
}
```

### 17.5 Deeplink Handling (onNewIntent)

```kotlin
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)

    intent?.data?.let { uri ->
        if (uri.scheme == "yourapp" && uri.host == "payway") {
            ABAPayWayDeeplinkHandler.handle(uri) { result ->
                when (result) {
                    is DeeplinkResult.Success -> {
                        // Verify HMAC signature
                        val isValid = ABAPayWayCrypto.verifyCallback(
                            callback = result.callbackData,
                            secretKey = "your_api_key"
                        )
                        if (isValid) {
                            // Fulfill order
                        }
                    }
                    is DeeplinkResult.Failure -> {
                        Log.e("PayWay", "Deeplink error: ${result.error}")
                    }
                }
            }
        }
    }
}
```

### 17.6 ProGuard / R8 Rules

```proguard
# ABAPayWay SDK ProGuard rules
-keep class com.ababank.payway.** { *; }
-keep class * implements com.ababank.payway.PaymentSheetCallback { *; }
-dontwarn com.ababank.payway.**
-keepattributes *Annotation*
-keepattributes Signature
```

### 17.7 QR Payment Flow

```kotlin
// Generate QR
lifecycleScope.launch {
    try {
        val qrResponse = payWay.generateQR(
            transactionId = "qr-001",
            amount = BigDecimal("10.00"),
            paymentOption = PaymentOption.ABA_KHQR,
            qrImageTemplate = QRImageTemplate.TEMPLATE1,
            lifetime = 30
        )

        // Display QR
        val qrView = ABAPayWayQRDisplayView(context).apply {
            setQRImage(qrResponse.qrImage)
            setAmount(qrResponse.amount)
            setCurrency(qrResponse.currency)
        }

        // Auto-poll
        qrView.startPolling(
            transactionId = "qr-001",
            intervalMs = 3000L
        ) { status ->
            if (status == TransactionStatus.APPROVED) {
                // Payment complete
            }
        }

    } catch (e: PayWayAPIError) {
        Log.e("PayWay", "QR error: ${e.message}")
    }
}
```

---

## 18. Server-Side Integration

### 18.1 Recommended Architecture

**Never embed API keys in client apps for production.** Use backend-generated hashes:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  iOS/Android│────▶│  Your Backend │────▶│  PayWay API     │
│    App      │     │  (Node/Python)│     │  (checkout...)  │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                     │                     │
       │◀───hash + form──────┘                     │
       │                     │◀────webhook callback─┘
       │◀──deeplink return───┘
```

### 18.2 Node.js Backend Example

```javascript
const { PayWay } = require('aba-payway');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
});

// Initialize payment from mobile app
app.post('/api/payment/init', (req, res) => {
  const { orderId, amount, items } = req.body;

  const params = payway.createTransaction({
    transactionId: orderId,
    amount: amount,
    items: items,
    returnUrl: `https://yourserver.com/api/payment/callback`,
    returnDeeplink: JSON.stringify({
      android_scheme: "yourapp://payway/callback",
      ios_scheme: "yourapp://payway/callback"
    })
  });

  res.json({
    checkoutUrl: `https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase`,
    formData: params
  });
});

// Webhook handler
app.post('/api/payment/callback', express.json(), (req, res) => {
  const receivedSignature = req.headers['x-payway-hmac-sha512'];
  const secretKey = process.env.PAYWAY_API_KEY;

  // 1. Sort response keys alphabetically
  const sorted = Object.keys(req.body).sort();
  let b4hash = '';
  sorted.forEach(key => {
    const val = Array.isArray(req.body[key]) 
      ? JSON.stringify(req.body[key]) 
      : req.body[key];
    b4hash += val;
  });

  // 2. Generate signature
  const signature = crypto
    .createHmac('sha512', secretKey)
    .update(b4hash)
    .digest('base64');

  // 3. Constant-time comparison (prevents timing attacks)
  if (crypto.timingSafeEqual(
    Buffer.from(signature), 
    Buffer.from(receivedSignature)
  )) {
    // Valid — update order status in database
    const { tran_id, status } = req.body;

    if (status === '0') {
      // APPROVED — fulfill order
      fulfillOrder(tran_id);
    } else if (status === '3') {
      // DECLINED — notify user
      notifyDeclined(tran_id);
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});

app.listen(3000);
```

### 18.3 Python Backend Example

```python
from aba_payway import PayWayClient, PayWayConfig, Environment
import hmac
import hashlib
import base64
from flask import Flask, request, jsonify

app = Flask(__name__)

config = PayWayConfig(
    merchant_id="your_merchant_id",
    api_key="your_api_key",
    environment=Environment.SANDBOX
)
client = PayWayClient(config)

@app.route('/api/payment/init', methods=['POST'])
def init_payment():
    data = request.json

    qr = client.generate_qr(
        transaction_id=data['order_id'],
        amount=data['amount'],
        payment_option='abapay_khqr',
        qr_image_template='template1'
    )

    return jsonify({
        'qr_string': qr.qr_string,
        'qr_image': qr.qr_image,
        'deeplink': qr.abapay_deeplink
    })

@app.route('/webhook/payway', methods=['POST'])
def webhook():
    received_sig = request.headers.get('X-Payway-Hmac-Sha512')
    secret_key = "your_api_key".encode()

    # Sort and concatenate
    sorted_keys = sorted(request.json.keys())
    b4hash = ''.join(
        json.dumps(request.json[k]) if isinstance(request.json[k], list) 
        else str(request.json[k]) 
        for k in sorted_keys
    )

    # Verify
    signature = base64.b64encode(
        hmac.new(secret_key, b4hash.encode(), hashlib.sha512).digest()
    ).decode()

    if hmac.compare_digest(signature, received_sig):
        return '', 200
    return '', 401
```

---

## 19. Implementation Roadmap

| Phase | Deliverable | Timeline | Status |
|-------|-------------|----------|--------|
| 1 | Core crypto/network models (shared) | Weeks 1-2 | 🔵 Planned |
| 2 | iOS SDK: PaymentSheet + Deeplink | Weeks 3-5 | 🔵 Planned |
| 3 | Android SDK: PaymentSheet + Deeplink | Weeks 3-5 | 🔵 Planned |
| 4 | QR Display components (both platforms) | Weeks 5-6 | 🔵 Planned |
| 5 | Callback verification utilities | Week 6 | 🔵 Planned |
| 6 | Flutter plugin wrapper | Weeks 7-8 | 🔵 Planned |
| 7 | React Native bridge | Weeks 8-9 | 🔵 Planned |
| 8 | Documentation & Examples | Weeks 9-10 | 🔵 Planned |
| 9 | Testing & Sandbox validation | Weeks 10-11 | 🔵 Planned |
| 10 | Production release | Week 12 | 🔵 Planned |

---

## 20. Key Design Principles Summary

| Principle | Implementation |
|-----------|---------------|
| **Zero Dependencies** | Core module uses only platform stdlib |
| **Type-Safe** | Strict enums, sealed classes, generics |
| **Platform-Idiomatic** | SwiftUI/UIKit for iOS, Compose/Views for Android |
| **Secure by Default** | Keychain/Keystore, certificate pinning, HMAC verification |
| **Observable** | Combine (iOS), Kotlin Flow (Android) |
| **Modular** | Use only what you need — core, UI, deeplink, QR |
| **Accessible** | VoiceOver, TalkBack, Dynamic Type |
| **Localized** | English + Khmer (ភាសាខ្មែរ) |

---

## 21. Appendix: Key References

- **Official Developer Portal:** https://developer.payway.com.kh/
- **Sandbox Registration:** https://sandbox.payway.com.kh/register-sandbox/
- **Production Credentials:** paywaysales@ababank.com

### Existing SDKs (Analyzed)

- **TypeScript SDK:** https://npmx.dev/package/aba-payway
- **Node.js SDK (jsdelivr):** https://www.jsdelivr.com/package/npm/aba-payway-sdk
- **Flutter SDK (GitHub):** https://github.com/kechankrisna/aba_payment
- **Flutter SDK (pub.dev):** https://pub.dev/packages/aba_payment
- **Minimal Node.js:** https://github.com/seanghay/payway-js
- **Python SDK:** https://pypi.org/project/aba-payway/

### Official Plugins

- **WooCommerce Plugin:** https://developer.payway.com.kh/-873826m0
- **PrestaShop Plugin:** https://developer.payway.com.kh/-871485m0

### Industry Inspiration

- **Stripe iOS SDK:** https://docs.stripe.com/sdks/ios
- **Stripe Android SDK:** https://docs.stripe.com/sdks/android
- **Razorpay Flutter:** https://pub.dev/packages/razorpay_flutter
- **Razorpay Web Integration:** https://razorpay.com/docs/payments/payment-gateway/web-integration/standard

---

*Document generated on July 18, 2026. Based on deep research of 6 existing SDKs, official PayWay APIs, and industry patterns from Stripe and Razorpay.*
