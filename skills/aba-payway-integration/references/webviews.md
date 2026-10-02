# Chapter 5 — WebView Implementation

> **Estimated reading time:** 15 minutes
> **Goal:** Understand how to use WebViews to display PayWay's checkout page inside your app, manage cookies and sessions, and capture payment results.

## Flow at a glance

```mermaid
sequenceDiagram
    autonumber
    participant Host as 📱 Host App
    participant WebView as 🧩 WebView
    participant Backend as ⚙️ Your Backend (SDK)
    participant PayWay as 🏦 PayWay

    Host->>Backend: create checkout
    Backend-->>Host: payment artifact (URL / form)
    Host->>WebView: load PayWay checkout page
    WebView->>PayWay: render + customer pays

    alt JS bridge available (preferred)
        PayWay-->>WebView: result page calls postMessage ✅
        WebView-->>Host: script handler receives result
    else URL interception
        PayWay-->>WebView: configured continue_success_url ✅
        WebView-->>Host: navigation delegate intercepts
    else deeplink return (mobile apps)
        PayWay-->>Host: returnDeeplink opens the app ✅
    end

    Host->>Backend: verify status server-side (never trust the UI signal)
    Backend-->>Host: APPROVED ✅ → close the WebView, show success
    Note over Host,PayWay: Cookies: keep a shared process pool per session; clear storage between different customers.
```

---

## What Is a WebView?

A WebView is a mini web browser embedded inside your native app. Instead of opening an external browser for payment, you keep the user inside your app by loading PayWay's checkout page in a WebView. This provides a **seamless, branded experience** — the customer never leaves your app.

| Platform | WebView Component | JavaScript Bridge |
|---|---|---|
| **iOS** | `WKWebView` | `WKScriptMessageHandler` |
| **Android** | `android.webkit.WebView` | `addJavascriptInterface()` |
| **React Native** | `react-native-webview` | `onMessage` / `postMessage` |
| **Flutter** | `webview_flutter` | `JavaScriptChannel` |

### Flutter (webview_flutter)

In Flutter, `WebViewController.setNavigationDelegate` plays the role of the Android `WebViewClient` / iOS `WKNavigationDelegate`: load your backend's checkout URL, intercept any navigation to your `returnUrlPrefix`, then confirm the real status with your backend before fulfilling. Launching the ABA Pay app for `abapay_khqr_deeplink` flows uses `url_launcher` with an external-application launch and a fallback URL.

-> **Full runnable example:** `examples/flutter/payment_screen.dart` — webview checkout + return-URL interception + ABA Pay deeplink launcher, using the backend verification pattern in [Chapter 4](native-apps.md).

---

## Why Use a WebView Instead of an External Browser?

| Approach | Pros | Cons |
|---|---|---|
| **WebView (in-app)** | Seamless UX, full control, capture redirects, maintain app state | More platform-specific code to write |
| **External browser / Chrome Custom Tabs** | Simpler to implement, user trusts browser UI | User leaves app, harder to capture result |

> 💡 **Recommendation:** Use WebView for a polished app experience. Fall back to Chrome Custom Tabs or `SFSafariViewController` if WebView causes issues with PayWay's page rendering.

---

## JavaScript Bridge: Communicating Between WebView and Native App

Configure `continueSuccessUrl` for the hosted customer continuation or the supported `returnDeeplink` for app return. Purchase `returnUrl` is the notification destination. Intercept the configured customer return and query the backend's verified status; navigation cannot establish that payment is done. There are two approaches:

### Approach 1: URL Interception (Recommended)

Watch for the return URL pattern and intercept it:

**iOS:**
```swift
func webView(_ webView: WKWebView,
             decidePolicyFor navigationAction: WKNavigationAction,
             decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let url = navigationAction.request.url,
       url.absoluteString.hasPrefix("https://your-domain.com/payment-result") {
        // Payment completed — capture and close WebView
        decisionHandler(.cancel)
        handlePaymentComplete(url: url)
    } else {
        decisionHandler(.allow)
    }
}
```

**Android:**
```kotlin
webView.webViewClient = object : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
        return if (url?.startsWith("https://your-domain.com/payment-result") == true) {
            handlePaymentComplete(url)
            true // Intercept the URL
        } else {
            false // Allow PayWay's pages to load
        }
    }
}
```

### Approach 2: JavaScript Bridge (For Advanced Scenarios)

**iOS — Register a Script Message Handler:**
```swift
// Register the bridge channel
let config = WKWebViewConfiguration()
config.userContentController.add(self, name: "paymentBridge")
webView = WKWebView(frame: .zero, configuration: config)

// Listen for messages from JavaScript
func userContentController(_ userContentController: WKUserContentController,
                           didReceive message: WKScriptMessage) {
    if message.name == "paymentBridge",
       let body = message.body as? [String: Any],
       let action = body["action"] as? String {
        switch action {
        case "paymentComplete":
            let tranId = body["tranId"] as? String
            handlePaymentComplete(transactionId: tranId)
        case "paymentError":
            let error = body["error"] as? String
            handlePaymentError(error)
        default:
            break
        }
    }
}

// Inject JavaScript that posts messages to the bridge
let bridgeJS = """
// The WebView's JavaScript can call:
// window.webkit.messageHandlers.paymentBridge.postMessage({
//     action: 'paymentComplete',
//     tranId: 'order-123'
// });
"""
```

**Android — Add a JavaScript Interface:**
```kotlin
class PaymentBridge {
    @JavascriptInterface
    fun onPaymentComplete(tranId: String) {
        // This runs on a background thread — post to main thread for UI updates
        runOnUiThread {
            handlePaymentComplete(tranId)
        }
    }

    @JavascriptInterface
    fun onPaymentError(error: String) {
        runOnUiThread {
            handlePaymentError(error)
        }
    }
}

webView.addJavascriptInterface(PaymentBridge(), "PaymentBridge")
// JavaScript calls: PaymentBridge.onPaymentComplete('order-123');
```

---

## Cookie and Session Management

PayWay's checkout page uses cookies and local storage for session management. If the WebView blocks cookies, the payment page may fail to load correctly.

### iOS: WKWebsiteDataStore

```swift
// ✅ Correct: Use the default data store (allows cookies from all origins)
let config = WKWebViewConfiguration()
config.websiteDataStore = WKWebsiteDataStore.default()

// ❌ Wrong: Non-persistent data store clears everything when WebView closes
// config.websiteDataStore = WKWebsiteDataStore.nonPersistent()

let webView = WKWebView(frame: .zero, configuration: config)
```

> 💡 **Pro tip:** If you need to clear cookies after payment (e.g., for privacy), use:
> ```swift
> WKWebsiteDataStore.default().fetchDataRecords(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes()) { records in
>     records.forEach { record in
>         WKWebsiteDataStore.default().removeData(ofTypes: record.dataTypes, for: [record]) {}
>     }
> }
> ```

### Android: CookieManager

```kotlin
// ✅ Enable cookies for the WebView
val cookieManager = CookieManager.getInstance()
cookieManager.setAcceptCookie(true)

// ✅ Accept third-party cookies (PayWay may set these)
cookieManager.setAcceptThirdPartyCookies(webView, true)

// ✅ Enable DOM storage (for localStorage/sessionStorage)
webView.settings.domStorageEnabled = true
webView.settings.databaseEnabled = true
```

---

## Common Pitfalls and Solutions

### 1. "Page Not Loading" or Blank WebView

| Symptom | Likely Cause | Solution |
|---|---|---|
| **iOS: Blank white page** | ATS (App Transport Security) blocking PayWay's scripts | Add `payway.com.kh` to `NSExceptionDomains` in Info.plist |
| **Android: "net::ERR_CLEARTEXT_NOT_PERMITTED"** | Android 9+ blocks HTTP by default | Add `android:usesCleartextTraffic="true"` to manifest (sandbox only!) |
| **Page loads but payment fails** | Cookies blocked | Enable `setAcceptCookie(true)` and `setAcceptThirdPartyCookies(true)` |
| **WebView shows error page** | PayWay's JavaScript not executing | Enable `javaScriptEnabled = true` and `domStorageEnabled = true` |

### 2. TLS Certificate Issues in Sandbox

PayWay's sandbox environment uses `checkout-sandbox.payway.com.kh`. Android may show "Certificate not trusted" in sandbox:

```kotlin
// ⚠️ FOR SANDBOX TESTING ONLY — REMOVE IN PRODUCTION
webView.webViewClient = object : WebViewClient() {
    override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
        handler?.proceed() // ⚠️ Skip SSL validation for sandbox
    }
}
```

> 🚨 **Never skip SSL validation in production.** This defeats HTTPS security.

### 3. User Presses Back Button During Payment

```kotlin
// Android: Override back button during payment
override fun onBackPressed() {
    if (webView.canGoBack()) {
        webView.goBack() // Navigate back within WebView
    } else {
        // User is on the initial payment page — ask for confirmation
        AlertDialog.Builder(this)
            .setTitle("Cancel Payment?")
            .setMessage("If you go back, your payment will be cancelled.")
            .setPositiveButton("Yes, Cancel") { _, _ ->
                // Optionally: call backend to close the transaction
                cancelTransaction()
                super.onBackPressed()
            }
            .setNegativeButton("Stay", null)
            .show()
    }
}
```

### 4. Detecting Popup Windows

PayWay's checkout page may attempt to open popups (e.g., for 3D Secure verification). Configure WebView to handle these:

```swift
// iOS: Handle popup windows
func webView(_ webView: WKWebView,
             createWebViewWith configuration: WKWebViewConfiguration,
             for navigationAction: WKNavigationAction,
             windowFeatures: WKWindowFeatures) -> WKWebView? {
    // Open popups in the same WebView
    if navigationAction.targetFrame == nil {
        webView.load(navigationAction.request)
    }
    return nil
}
```

```kotlin
// Android: Handle popup windows
webView.settings.javaScriptCanOpenWindowsAutomatically = true
webView.settings.setSupportMultipleWindows(false)
```

---

## Testing WebView Integration

Apply [default checkout UI requirements](integration-ui.md#default-e-commerce-checkout-requirements): full-screen hosted payment, a static merchant header, and hidden app-owned address/browser toolbars. An external browser controls its own chrome. Display a supported `checkout_qr_url` readably without assuming every purchase returns one. Maintain provider-controlled authentication/card fields, cookie/session handling, safe destinations and same-attempt restoration. The merchant's method selection and policy-consent step precede payment; the generated form/WebView does not implement them automatically.

### Checklist

- [ ] Cookies and local storage are enabled
- [ ] JavaScript is enabled
- [ ] PayWay's checkout page loads without errors
- [ ] The customer can enter card details or select payment method
- [ ] The configured customer continuation/app return is validated and intercepted; purchase `returnUrl` stays the notification destination
- [ ] Merchant header, readable full-screen QR and app-owned toolbar visibility match the approved UI
- [ ] All enabled methods and policy links/checkbox are available before submission
- [ ] Pending/unknown return restores the existing attempt; only verified backend acceptance clears purchased cart contents and shows merchant confirmation
- [ ] Integration Team reviewed checkout/KHQR screenshots and flow before production credentials
- [ ] The WebView is properly dismissed after payment
- [ ] Back button behavior is handled (don't accidentally cancel payment)
- [ ] TLS/SSL works correctly in production (HTTPS only)

### Debug Mode Setup

```typescript
// Backend: Enable request/response logging for debugging
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  // Log every API call during development.
  // Payloads arrive pre-redacted (redactHookBodies defaults to true) —
  // set redactHookBodies: false only for wire-level debugging.
  onRequest: (endpoint, body) => {
    console.log(`[PayWay] → ${endpoint}:`, JSON.stringify(body).substring(0, 500));
  },
  onResponse: (endpoint, status, body) => {
    console.log(`[PayWay] ← ${endpoint} ${status}:`, JSON.stringify(body).substring(0, 500));
  },
});
```

---

## Next Steps

- **For native app architecture** → [Chapter 4 — Native App Implementation](native-apps.md)
- **For Telegram Mini Apps** → [Chapter 6 — Telegram Mini App](telegram-mini-app.md)
- **For deep linking** → [Chapter 8 — Deep Linking](deep-linking.md)

> ← [Previous: Native App Implementation](native-apps.md) | [Next: Telegram Mini App →](telegram-mini-app.md)
