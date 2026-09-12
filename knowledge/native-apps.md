# Chapter 4 — Native App Implementation (iOS & Android)

> **Estimated reading time:** 15 minutes  
> **Goal:** Integrate PayWay payments into native iOS and Android apps.

## Flow at a glance

```mermaid
sequenceDiagram
    autonumber
    participant App as 📱 Native App
    participant Backend as ⚙️ Your Backend (SDK)
    participant PayWay as 🏦 PayWay

    App->>Backend: create checkout (order details)
    Backend->>Backend: build signed payload — credentials never leave the server
    Backend-->>App: checkout URL / hosted form target
    App->>PayWay: load payment UI in WebView
    Customer->>PayWay: completes payment
    PayWay-->>App: redirect to return_url (intercepted by the WebView)
    App->>Backend: ask for verified status (do not trust the redirect)
    Backend->>PayWay: check-transaction / callback already received
    Backend-->>App: APPROVED ✅ → show success, fulfill server-side
    Note over App,Backend: Intercept the return-URL prefix in the WebView delegate; the redirect itself proves nothing.
```

Runnable examples: Android `PaymentActivity.kt` · iOS `PaymentViewController.swift`.

---

> 📘 **Important Note:** This chapter documents using the **ABA PayWay TypeScript SDK as your backend** + a WebView in your native app for the payment UI. This is the recommended approach since our SDK is server-side only. If you prefer ABA's official native iOS/Android SDK (a separate product from ABA), see the note at the bottom of this chapter.

---

## Architecture

```
┌──────────────────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────┐
│   Native App (iOS/Android)   │     │   Your Backend (Node.js)     │     │   ABA PayWay API     │
│                              │     │                              │     │                      │
│  App → WebView (payment UI)  │◀───▶│   PayWay SDK generates       │────▶│   Handles payment    │
│  WebView captures redirect   │     │   signed checkout payload    │◀────│   Sends callbacks    │
└──────────────────────────────┘     └──────────────────────────────┘     └──────────────────────┘
```

1. Your app requests your backend to create a signed checkout session
2. Your backend responds with the signed form data
3. Your app opens a **WebView** pointing to PayWay's checkout URL with the signed fields
4. The customer completes payment inside the WebView
5. PayWay redirects to your return URL — the WebView intercepts this to determine success/cancel/failure
6. Your backend receives the webhook callback (the trusted source of truth, see Chapter 11)

---

## iOS Implementation (Swift)

### Step 1: Create the Payment View Controller

```swift
// PaymentViewController.swift
import UIKit
import WebKit

class PaymentViewController: UIViewController, WKNavigationDelegate {

    private var webView: WKWebView!
    private var transactionId: String?

    // Your backend URL that creates and signs a checkout session
    private let backendCheckoutURL = "https://your-api.com/api/checkout/create"

    // The URL the customer is redirected to after payment
    // Your backend should include the transaction ID as a query param
    private let returnURLPrefix = "https://your-website.com/payment-result"

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        initiateCheckout()
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        // Configure WebView to allow PayWay's cookies and session storage
        let config = WKWebViewConfiguration()

        // Allow cookies to persist within this WebView session
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Enable JavaScript (PayWay's checkout page uses it)
        let preferences = WKPreferences()
        preferences.javaScriptEnabled = true
        config.preferences = preferences

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
    }

    // MARK: - Checkout Initiation

    private func initiateCheckout() {
        // Step 1: Call your backend to get a signed checkout payload
        var request = URLRequest(url: URL(string: backendCheckoutURL)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "amount": 15.00,
            "currency": "USD",
            "firstName": "John",
            "lastName": "Doe",
            "phone": "012345678",
            "paymentOption": "abapay_khqr"
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let success = json["success"] as? Bool,
                  success == true,
                  let payload = json["payload"] as? [String: Any],
                  let checkoutURL = json["checkoutUrl"] as? String else {
                DispatchQueue.main.async {
                    self?.showError("Failed to initialize payment. Please try again.")
                }
                return
            }

            // Store transaction ID for later status checking
            self.transactionId = payload["tran_id"] as? String

            // Step 2: Build an HTML form with the signed payload
            // and load it in the WebView. The form auto-submits to PayWay.
            let formHTML = self.buildCheckoutForm(payload: payload, checkoutURL: checkoutURL)

            DispatchQueue.main.async {
                self.webView.loadHTMLString(formHTML, baseURL: nil)
            }
        }.resume()
    }

    // MARK: - Build the Auto-Submitting Form

    private func buildCheckoutForm(payload: [String: Any], checkoutURL: String) -> String {
        var hiddenInputs = ""
        for (key, value) in payload {
            hiddenInputs += "<input type=\"hidden\" name=\"\(key)\" value=\"\(value)\">\n"
        }

        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: -apple-system, sans-serif;
                    display: flex; justify-content: center;
                    align-items: center; min-height: 100vh;
                    margin: 0; background: #f7f7f8;
                }
                .loader {
                    text-align: center;
                }
                .spinner {
                    border: 3px solid #e5e7eb;
                    border-top: 3px solid #111;
                    border-radius: 50%; width: 40px; height: 40px;
                    animation: spin 0.8s linear infinite;
                    margin: 0 auto 16px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="loader">
                <div class="spinner"></div>
                <p>Redirecting to payment...</p>
            </div>
            <form id="payway-form" method="POST"
                  action="\(checkoutURL)/api/payment-gateway/v1/payments/purchase">
                \(hiddenInputs)
            </form>
            <script>
                // Auto-submit after a brief delay for the loading UI to render
                setTimeout(function() {
                    document.getElementById('payway-form').submit();
                }, 500);
            </script>
        </body>
        </html>
        """
    }

    // MARK: - WebView Navigation (Capture Redirect)

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Step 3: Detect when PayWay redirects back to your return URL
        if url.absoluteString.hasPrefix(returnURLPrefix) {
            // Payment completed (or cancelled) — the user is being redirected back
            print("📱 Payment redirect detected: \(url.absoluteString)")

            // Extract the transaction ID from the URL
            if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
               let tranID = components.queryItems?.first(where: { $0.name == "tran_id" })?.value {
                self.transactionId = tranID
            }

            // Close the WebView and check the real status via your backend
            decisionHandler(.cancel)
            checkPaymentStatus()
            return
        }

        // Allow all other navigation (PayWay's own pages)
        decisionHandler(.allow)
    }

    // MARK: - Status Check (via Backend, not the redirect)

    private func checkPaymentStatus() {
        guard let tranID = transactionId else {
            dismissPayment(result: .error("Could not determine transaction ID"))
            return
        }

        // Step 4: Check the real payment status via your backend API
        // ⚠️ NEVER trust the return URL alone — always verify via backend
        var request = URLRequest(url: URL(string: "https://your-api.com/api/checkout/status")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["transactionId": tranID])

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async {
                    self?.dismissPayment(result: .error("Could not verify payment"))
                }
                return
            }

            let status = json["status"] as? String ?? "unknown"

            DispatchQueue.main.async {
                if status == "0" {
                    self?.dismissPayment(result: .success)
                } else {
                    self?.dismissPayment(result: .cancelled)
                }
            }
        }.resume()
    }

    // MARK: - Navigation

    private func dismissPayment(result: PaymentResult) {
        // Dismiss the payment view controller
        // Your presenting view controller should handle the result
        dismiss(animated: true) {
            // Post a notification or call a delegate method
            NotificationCenter.default.post(
                name: .paymentCompleted,
                object: nil,
                userInfo: ["result": result, "transactionId": self.transactionId ?? ""]
            )
        }
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Payment Error",
                                      message: message,
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

// MARK: - Supporting Types

enum PaymentResult {
    case success
    case cancelled
    case error(String)
}

extension Notification.Name {
    static let paymentCompleted = Notification.Name("paymentCompleted")
}
```

### iOS: Required Configuration

#### App Transport Security (Info.plist)

PayWay's checkout page uses HTTPS, but you may need to allow specific domains:

```xml
<!-- Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    <key>NSExceptionDomains</key>
    <dict>
        <!-- Allow PayWay domains for WebView -->
        <key>payway.com.kh</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <false/>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
</dict>
```

---

## Android Implementation (Kotlin)

### PaymentActivity.kt

```kotlin
// PaymentActivity.kt
import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class PaymentActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var transactionId: String? = null

    private val backendCheckoutURL = "https://your-api.com/api/checkout/create"
    private val returnURLPrefix = "https://your-website.com/payment-result"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Setup WebView
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // Required for PayWay's session

            // Accept cookies for PayWay's session management
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                    url?.let {
                        // Step 3: Detect redirect back to your return URL
                        if (it.startsWith(returnURLPrefix)) {
                            println("📱 Payment redirect detected: $it")

                            // Extract transaction ID from URL
                            val uri = android.net.Uri.parse(it)
                            transactionId = uri.getQueryParameter("tran_id")

                            // Don't load the return URL — close and check real status
                            checkPaymentStatus()
                            return true // Intercept the URL
                        }
                    }
                    return false // Allow PayWay's own pages to load
                }
            }
        }

        setContentView(webView)
        initiateCheckout()
    }

    private fun initiateCheckout() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Step 1: Call backend for signed checkout payload
                val url = URL(backendCheckoutURL)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val body = JSONObject().apply {
                    put("amount", 15.00)
                    put("currency", "USD")
                    put("firstName", "John")
                    put("lastName", "Doe")
                    put("phone", "012345678")
                    put("paymentOption", "abapay_khqr")
                }

                connection.outputStream.use { os ->
                    os.write(body.toString().toByteArray())
                }

                val response = connection.inputStream.bufferedReader().readText()
                val json = JSONObject(response)

                if (json.getBoolean("success")) {
                    val payload = json.getJSONObject("payload")
                    val checkoutURL = json.getString("checkoutUrl")
                    transactionId = payload.optString("tran_id")

                    // Step 2: Load auto-submitting form in WebView
                    val formHTML = buildCheckoutForm(payload, checkoutURL)

                    withContext(Dispatchers.Main) {
                        webView.loadDataWithBaseURL(
                            null, formHTML, "text/html", "UTF-8", null
                        )
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        showError("Failed to initialize payment")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showError("Network error: ${e.message}")
                }
            }
        }
    }

    private fun buildCheckoutForm(payload: JSONObject, checkoutURL: String): String {
        val hiddenInputs = StringBuilder()
        for (key in payload.keys()) {
            hiddenInputs.append(
                "<input type=\"hidden\" name=\"$key\" value=\"${payload.get(key)}\">\n"
            )
        }

        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 40px; }
                    .spinner { margin: 20px auto; width: 40px; height: 40px; border: 3px solid #e5e7eb;
                               border-top-color: #111; border-radius: 50%; animation: spin 0.8s linear infinite; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div class="spinner"></div>
                <p>Redirecting to payment...</p>
                <form id="payway-form" method="POST"
                      action="$checkoutURL/api/payment-gateway/v1/payments/purchase">
                    $hiddenInputs
                </form>
                <script>
                    setTimeout(function() {
                        document.getElementById('payway-form').submit();
                    }, 500);
                </script>
            </body>
            </html>
        """.trimIndent()
    }

    private fun checkPaymentStatus() {
        val tranID = transactionId ?: run {
            finishWithResult(PaymentResult.Error("No transaction ID"))
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("https://your-api.com/api/checkout/status")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val body = JSONObject().apply {
                    put("transactionId", tranID)
                }
                connection.outputStream.use { os ->
                    os.write(body.toString().toByteArray())
                }

                val response = connection.inputStream.bufferedReader().readText()
                val json = JSONObject(response)
                val status = json.optString("status", "unknown")

                withContext(Dispatchers.Main) {
                    when (status) {
                        "0" -> finishWithResult(PaymentResult.Success)
                        else -> finishWithResult(PaymentResult.Cancelled)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    finishWithResult(PaymentResult.Error(e.message ?: "Unknown error"))
                }
            }
        }
    }

    private fun finishWithResult(result: PaymentResult) {
        // Return result to calling activity
        val intent = android.content.Intent().apply {
            putExtra("payment_result", result.name)
            putExtra("transaction_id", transactionId)
        }
        setResult(
            if (result is PaymentResult.Success) RESULT_OK else RESULT_CANCELED,
            intent
        )
        finish()
    }

    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        finish()
    }

    override fun onBackPressed() {
        // Don't allow back navigation during payment
        // Optionally: call your backend to close/cancel the transaction
        Toast.makeText(this, "Please complete or cancel the payment", Toast.LENGTH_SHORT).show()
    }
}

sealed class PaymentResult {
    object Success : PaymentResult()
    object Cancelled : PaymentResult()
    data class Error(val message: String) : PaymentResult()
}
```

### Android: Required Configuration

#### AndroidManifest.xml

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Internet permission is required for WebView -->
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- Allow cleartext for sandbox testing (remove in production) -->
    <application
        android:usesCleartextTraffic="true"
        ...>

        <activity
            android:name=".PaymentActivity"
            android:configChanges="orientation|screenSize" />
    </application>
</manifest>
```

> ⚠️ **Production:** Remove `android:usesCleartextTraffic="true"` before going live. PayWay production uses HTTPS.

---

## Result Handling

Both iOS and Android implementations follow the same pattern:

1. **Do NOT trust the return URL redirect** to determine payment success
2. Always call your backend's status endpoint (which queries PayWay via `checkTransaction()`) for the real status
3. The **webhook callback** (Chapter 11) is still the authoritative source for database updates
4. The native app's status check is for UX only — to show "Payment Successful" vs "Payment Failed"

> **Flutter?** The identical architecture in Dart (webview checkout + return-URL interception + ABA Pay deeplink launcher) lives in `examples/flutter/payment_screen.dart`, documented in [Chapter 5](payway-sdk docs webviews).

---

## Important: ABA's Official Native SDK

ABA PayWay also offers **official native SDKs** for iOS and Android that integrate more deeply with the ABA Pay mobile app (direct app-to-app communication, native UI components). These are **separate products** from this TypeScript SDK.

- **iOS:** Available via CocoaPods (contact ABA for pod name and documentation)
- **Android:** Available via Gradle (contact ABA for artifact coordinates)

If you prefer the official native approach:
1. Contact ABA PayWay support for native SDK documentation
2. The core concepts (transaction lifecycle, webhooks, HMAC signing) remain the same
3. Use this TypeScript SDK on your backend regardless — the native SDK handles only the frontend payment UI

---

## Next Steps

- **For WebView-specific details** → [Chapter 5 — WebView Implementation](payway-sdk docs webviews)
- **For deep linking** → [Chapter 8 — Deep Linking](payway-sdk docs deep-linking)
- **For webhook handling** → [Chapter 11 — Callbacks & Webhooks](payway-sdk docs callbacks-webhooks)

> ← [Previous: Web Implementation](payway-sdk docs web-implementation) | [Next: WebView Implementation →](payway-sdk docs webviews)
