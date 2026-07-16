# Chapter 8 — Deep Linking

> **Estimated reading time:** 10 minutes  
> **Goal:** Understand how deep linking works with ABA Pay, and how to configure it for your native mobile app.

---

> 📘 **Important:** Deep link URI schemes (e.g., `abapay://...`) are defined by ABA PayWay's official native SDK, not by this TypeScript SDK. This chapter documents the **patterns and concepts** surrounding deep linking. The exact URI scheme format is marked as `[TBD: confirm with ABA]` where our codebase doesn't have verified information.

---

## What Is Deep Linking?

Deep linking allows the PayWay checkout flow to open the **ABA Pay mobile app** directly on the customer's phone, instead of loading a web-based checkout page. This provides a faster, more native payment experience.

### How It Works (High-Level)

1. Your backend creates a transaction with `paymentOption: 'abapay_khqr_deeplink'` or provides `returnDeeplink`
2. PayWay generates a special URI (e.g., `abapay://pay?token=xxx`)
3. The customer's browser attempts to open this URI
4. If the ABA Pay app is installed, it opens automatically to complete the payment
5. After payment, the ABA Pay app returns the user to your app via **your** deep link

---

## Two Types of Deep Links

| Type | Description | Platform Support |
|---|---|---|
| **URI Scheme** | Custom URL prefix like `abapay://...` | Both iOS and Android |
| **Universal Links** (iOS) | Standard HTTPS URLs that open your app | iOS 9+ |
| **App Links** (Android) | Standard HTTPS URLs with domain verification | Android 6+ |

### URI Schemes (Custom Protocol)

The simplest form of deep linking. Format: `abapay://[action]?[params]`

```
abapay://pay?token=abc123&amount=15.00&currency=USD
```

> `[TBD: Confirm the exact URI scheme format with ABA PayWay support. This format is speculative based on common payment SDK patterns.]`

### Universal Links (iOS)

Uses standard HTTPS URLs instead of custom schemes. When a user taps a Universal Link, iOS checks if the associated app is installed and opens it; otherwise, the URL opens in Safari.

**Example:** `https://pay.ababank.com/pay?token=abc123`

**Setup (Xcode):**
```xml
<!-- In your app's Associated Domains entitlement -->
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:your-domain.com</string>
</array>
```

And on your web server, serve an `apple-app-site-association` JSON file:
```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAMID.com.yourcompany.yourapp",
      "paths": ["/payment-result/*"]
    }]
  }
}
```

### App Links (Android)

Similar to Universal Links. Uses standard HTTPS URLs with domain verification via Digital Asset Links.

**Setup (AndroidManifest.xml):**
```xml
<activity android:name=".PaymentResultActivity">
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="https"
            android:host="your-domain.com"
            android:pathPrefix="/payment-result" />
    </intent-filter>
</activity>
```

And serve a `assetlinks.json` on your domain:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourcompany.yourapp",
    "sha256_cert_fingerprints": ["YOUR:SHA256:FINGERPRINT"]
  }
}]
```

---

## Configuring PayWay with Deep Links

### Option 1: `abapay_khqr_deeplink` Payment Option

Set `paymentOption` to `'abapay_khqr_deeplink'` when creating a transaction. PayWay will attempt to open the ABA Pay app directly.

```typescript
const signedPayload = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 15.00,
  currency: 'USD',
  // This tells PayWay to use deep linking instead of web checkout
  paymentOption: 'abapay_khqr_deeplink',
  returnUrl: `${process.env.BASE_URL}/payment-result`,
  // Optional: Pass your app's return deep link
  returnDeeplink: {
    ios_scheme: 'myapp://payment-result',
    android_scheme: 'myapp://payment-result',
  },
});
```

### Option 2: `returnDeeplink` for Return Navigation

Specify where the ABA Pay app should send the user after completing payment:

```typescript
const signedPayload = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 15.00,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  // Tells PayWay to deep-link back to your app after payment
  returnDeeplink: {
    // iOS scheme (e.g., "yourcompany://payment-result")
    ios_scheme: 'myapp://payment-result',
    // Android scheme (e.g., "yourcompany://payment-result")
    android_scheme: 'myapp://payment-result',
  },
  // Standard web fallback if deep link fails
  returnUrl: `${process.env.BASE_URL}/payment-result`,
});
```

> 💡 The `returnDeeplink` parameter is encoded as a Base64 JSON string by the SDK. The SDK automatically handles this when you pass an object.

---

## Fallback Strategy: What If the ABA App Isn't Installed?

Deep links assume the ABA Pay app is installed. If it's not:

1. **URI Scheme approach:** The operating system shows an error or does nothing
2. **Universal Links / App Links:** The URL opens in the browser instead

Your application should handle this gracefully:

```typescript
// Check if a custom URI scheme can be opened (browser-side)
function canOpenDeepLink(scheme: string): Promise<boolean> {
  // This only works on some platforms. In practice, implement a timeout:
  return new Promise((resolve) => {
    const start = Date.now();
    const timeout = 2000;

    // Attempt to open the deep link
    window.location.href = scheme;

    // If we're still here after 2 seconds, the app probably isn't installed
    setTimeout(() => {
      // Check if the page lost focus (app opened) or is still active
      if (document.hasFocus()) {
        resolve(false); // App not installed — show web fallback
      } else {
        resolve(true); // App opened successfully
      }
    }, timeout);
  });
}

// Usage in your payment flow
async function initiatePayment() {
  // ... get signed payload from backend ...

  if (payload.payment_option === 'abapay_khqr_deeplink') {
    // Try deep linking first
    const opened = await canOpenDeepLink('abapay://...');

    if (!opened) {
      // Fallback: Show QR code or redirect to web checkout
      showQRCode(payload);
    }
  }
}
```

---

## iOS: Handling Return Deep Links

When the ABA Pay app redirects back to your app via deep link, handle it in your `AppDelegate` or `SceneDelegate`:

```swift
// AppDelegate.swift (or SceneDelegate for iOS 13+)
func application(_ app: UIApplication,
                 open url: URL,
                 options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {

    // Check if this is a payment return
    if url.scheme == "myapp" && url.host == "payment-result" {
        // Extract transaction ID from the URL
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let tranId = components.queryItems?.first(where: { $0.name == "tran_id" })?.value {

            print("📱 Payment return deep link received for: \(tranId)")
            // Navigate to payment result and check status
            // (See Chapter 4 for the status check pattern)
            navigateToPaymentResult(transactionId: tranId)
            return true
        }
    }

    return false
}
```

### Register Your Custom URL Scheme (iOS)

```xml
<!-- Info.plist -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myapp</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.yourcompany.yourapp</string>
    </dict>
</array>
```

---

## Android: Handling Return Deep Links

```kotlin
// PaymentResultActivity.kt
class PaymentResultActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Handle both intent types (explicit launch and deep link)
        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return

        if (uri.scheme == "myapp" && uri.host == "payment-result") {
            val tranId = uri.getQueryParameter("tran_id")

            if (tranId != null) {
                println("📱 Payment return deep link received for: $tranId")
                checkPaymentStatus(tranId)
            }
        }
    }
}
```

### Register Intent Filter (AndroidManifest.xml)

```xml
<activity android:name=".PaymentResultActivity">
    <!-- Handle your custom scheme -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="myapp" android:host="payment-result" />
    </intent-filter>

    <!-- Handle HTTPS App Links (more reliable) -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="https"
            android:host="your-domain.com"
            android:pathPrefix="/payment-result" />
    </intent-filter>
</activity>
```

---

## Best Practices for Deep Linking

### 1. Always Provide a Fallback

```typescript
const signedPayload = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 15.00,
  paymentOption: 'abapay_khqr_deeplink',
  // Deep link return (works if ABA Pay app is installed)
  returnDeeplink: {
    ios_scheme: 'myapp://payment-result',
    android_scheme: 'myapp://payment-result',
  },
  // Web fallback URL (works if ABA Pay app is NOT installed)
  returnUrl: `${process.env.BASE_URL}/payment-result`,
});
```

### 2. Test on Real Devices

- Deep links behave differently in simulators vs. real devices
- Test on devices with and without the ABA Pay app installed
- Test on both WiFi and cellular networks

### 3. Handle Timeouts

The payment may take time to complete. Your app should handle being backgrounded and resumed:

```swift
// iOS: Handle app returning from background
NotificationCenter.default.addObserver(
    forName: UIApplication.willEnterForegroundNotification,
    object: nil,
    queue: .main
) { _ in
    // Check if there's a pending payment status to verify
    checkPendingPaymentStatus()
}
```

### 4. Security: Validate All Deep Link Parameters

Never trust data from a deep link URL without verification:

```swift
// ✅ Good: Deep link tells you a transaction might be complete, verify with backend
func handleDeepLink(tranId: String) {
    checkPaymentStatusViaBackend(tranId) // Always verify
}

// ❌ Bad: Trusting the deep link's status parameter
func handleDeepLink(url: URL) {
    if url.queryParameters["status"] == "success" {
        showSuccessScreen() // Attacker could craft this URL
    }
}
```

---

## Known Limitations

| Limitation | Details |
|---|---|
| **ABA app may not be installed** | Always provide a web fallback and QR alternative |
| **Deep link URI format not verified** | The exact `abapay://` scheme format needs confirmation from ABA |
| **iOS Simulator limitations** | Deep links don't work reliably on iOS simulators — test on real devices |
| **Android custom tabs** | Chrome Custom Tabs may not trigger deep links — test thoroughly |

---

## Next Steps

- **For native app integration** → [Chapter 4 — Native App Implementation](./04-native-app-implementation.md)
- **For WebView implementation** → [Chapter 5 — WebView Implementation](./05-webview-implementation.md)
- **For QR code payments (alternative to deep links)** → [Chapter 7 — QR Code Handling](./07-qr-code-handling.md)

> ← [Previous: Telegram Mini App](./06-telegram-mini-app.md) | [Next: Callbacks & Webhooks →](./11-callbacks-and-webhooks.md)