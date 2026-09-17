# ABA PayWay iOS SDK

> Accept ABA Pay, KHQR, cards, Alipay, and more from your iOS app — with a native payment sheet and built-in deeplink handling.

[![Platform](https://img.shields.io/badge/platform-iOS%2014%2B-blue.svg)]()
[![Swift](https://img.shields.io/badge/Swift-5.9-orange.svg)]()
[![Xcode](https://img.shields.io/badge/Xcode-15%2B-blue.svg)]()

---

## Table of Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [PaymentSheet](#paymentsheet)
- [Payment Options](#payment-options)
- [Deeplink Handling](#deeplink-handling)
- [QR Display](#qr-display)
- [WebView Checkout](#webview-checkout)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [Security](#security)
- [Example Code](#example-code)

---

## Overview

The ABA PayWay iOS SDK provides a native payment experience for iOS apps, supporting multiple payment methods including ABA KHQR, credit/debit cards, Alipay, and WeChat Pay. It follows the same security model as the web SDK — **your API key never leaves your server**.

### Key Features

- **Native PaymentSheet** — A SwiftUI/UIKit bottom sheet for payment method selection
- **Built-in Deeplink Handling** — Automatic detection and processing of ABA Mobile return URLs
- **QR Code Display** — Native `QRDisplayView` for showing KHQR codes
- **WebView Checkout** — Embedded WKWebView for card payments with 3DS support
- **Callback Verification** — HMAC-SHA512 signature verification for all payment callbacks
- **Zero Dependencies** — The SDK has no external dependencies

### Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌───────────────────────┐
│   iOS App            │────▶│   Your Backend Server    │────▶│   ABA PayWay API      │
│   (SDK handles UI)  │◀────│   (Holds API key)       │◀────│   Sandbox or Prod     │
└─────────────────────┘     └──────────────────────────┘     └───────────────────────┘
```

The SDK never calls PayWay directly with your API key. Instead:

1. Your app requests a signed payment payload from your backend
2. Your backend signs the request with HMAC-SHA512 and returns it
3. The SDK uses the signed payload to initiate payment
4. ABA Mobile (or WebView) handles the actual payment
5. ABA Mobile returns via deeplink; SDK verifies the callback signature

---

## Requirements

| Requirement | Version |
|-------------|---------|
| iOS | 14.0+ |
| Xcode | 15.0+ |
| Swift | 5.9+ |
| Bitcode | Enabled |

---

## Installation

### Swift Package Manager (Recommended)

Add the SDK via Xcode or your `Package.swift`:

```swift
// In Xcode: File → Add Package Dependencies → Add the repository URL
// Or add directly to Package.swift:
dependencies: [
    .package(url: "https://github.com/your-org/aba-payway-ios.git", from: "1.0.0")
]
```

Then import in your code:

```swift
import ABAPayWay
```

### CocoaPods

Add to your `Podfile`:

```ruby
platform :ios, '14.0'
use_frameworks!

target 'YourApp' do
  pod 'ABAPayWay', '~> 1.0.0'
end
```

Then run:

```bash
pod install
```

---

## Configuration

### Info.plist Setup

Add the following to your `Info.plist` to support ABA Mobile deeplinks and custom URL schemes:

```xml
<!-- filepath: YourApp/Info.plist -->

<!-- Required: Query scheme for ABA Mobile -->
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>abamobilebank</string>
</array>

<!-- Custom URL scheme for payment return -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.yourcompany.yourapp.payway</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>yourapp</string>
        </array>
    </dict>
</array>
```

### URL Scheme Format

Your return URL scheme should follow this format:

```
yourapp://payway/callback
```

Where:
- `yourapp` — Your app's custom scheme (must match `CFBundleURLSchemes`)
- `payway/callback` — Fixed path for PayWay callbacks

---

## Quick Start

### Step 1: Initialize the SDK

```swift
// filepath: AppDelegate.swift
import ABAPayWay

func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
    // Initialize with your merchant credentials
    ABAPayWay.configure(
        merchantId: "your_merchant_id",
        environment: .sandbox  // Use .production for live payments
    )
    return true
}
```

### Step 2: Request a Signed Payload from Your Backend

```swift
// filepath: PaymentService.swift
func createPaymentSession(amount: Decimal, items: [String]) async throws -> PaymentSession {
    let response = try await URLSession.shared.post(
        url: URL(string: "https://yourbackend.com/api/payway/create-session")!,
        body: [
            "amount": "\(amount)",
            "items": items.joined(separator: ","),
            "returnDeeplink": "yourapp://payway/callback"
        ]
    )
    return try JSONDecoder().decode(PaymentSession.self, from: response)
}
```

### Step 3: Present the Payment Sheet

```swift
// filepath: CheckoutViewController.swift
import ABAPayWay

class CheckoutViewController: UIViewController {
    
    private let payway = ABAPayWay.shared
    
    func initiatePayment() async {
        do {
            // Get signed payload from your backend
            let session = try await createPaymentSession(amount: 25.00, items: ["Product A"])
            
            // Configure the payment sheet
            let config = PaymentSheetConfig(
                transactionId: session.transactionId,
                amount: session.amount,
                currency: .usd,
                paymentOptions: [.abaKHQR, .cards, .alipay],
                returnDeeplink: DeeplinkConfig(
                    iosScheme: "yourapp://payway/callback",
                    androidScheme: "yourapp://payway/callback"
                )
            )
            
            // Present the native payment sheet
            payway.presentPaymentSheet(
                from: self,
                configuration: config,
                delegate: self
            )
        } catch {
            showError(error)
        }
    }
}
```

### Step 4: Handle Payment Results

```swift
// filepath: CheckoutViewController.swift
extension CheckoutViewController: ABAPayWayDelegate {
    
    func paymentSheet(
        _ sheet: PaymentSheet,
        didCompleteWithResult result: PaymentResult
    ) {
        switch result {
        case .success(let transaction):
            // Payment approved — fulfill the order
            fulfillOrder(transactionId: transaction.tranId)
            
        case .failure(let error):
            // Payment failed — show error to user
            showPaymentError(error)
            
        case .cancelled:
            // User cancelled — return to cart
            dismissPaymentSheet()
        }
    }
}
```

### Step 5: Handle the Return Deeplink

```swift
// filepath: SceneDelegate.swift
func scene(
    _ scene: UIScene,
    openURLContexts URLContexts: Set<UIOpenURLContext>
) {
    guard let url = URLContexts.first?.url else { return }
    
    // Let the SDK handle the deeplink
    ABAPayWayDeeplinkHandler.shared.handle(url: url) { result in
        switch result {
        case .success(let callback):
            // Verify the callback signature
            Task { @MainActor in
                await self.verifyAndFulfill(callback: callback)
            }
        case .failure(let error):
            print("Deeplink handling failed: \(error)")
        }
    }
}
```

---

## PaymentSheet

The `PaymentSheet` is a native SwiftUI bottom sheet that handles payment method selection. It supports both **SwiftUI** and **UIKit** presentations.

### SwiftUI Integration

```swift
// filepath: SwiftUIPaymentView.swift
import SwiftUI
import ABAPayWay

struct CheckoutView: View {
    @State private var paymentResult: PaymentResult?
    @State private var isLoading = false
    
    var body: some View {
        Button("Pay \(formattedAmount)") {
            presentPaymentSheet()
        }
        .sheet(isPresented: $isLoading) {
            PaymentSheetView(
                configuration: paymentConfig,
                onComplete: { result in
                    isLoading = false
                    paymentResult = result
                }
            )
        }
    }
    
    private var paymentConfig: PaymentSheetConfig {
        PaymentSheetConfig(
            transactionId: "order-\(Date().timeIntervalSince1970)",
            amount: 25.00,
            currency: .usd,
            paymentOptions: [.abaKHQR, .cards],
            returnDeeplink: DeeplinkConfig(
                iosScheme: "yourapp://payway/callback",
                androidScheme: "yourapp://payway/callback"
            )
        )
    }
}
```

### UIKit Integration

```swift
// filepath: UIKitPaymentViewController.swift
import UIKit
import ABAPayWay

class PaymentViewController: UIViewController {
    
    private let payway = ABAPayWay.shared
    
    func showPaymentSheet() {
        let config = PaymentSheetConfig(
            transactionId: "order-001",
            amount: 50.00,
            currency: .usd,
            paymentOptions: [.abaKHQR, .cards, .alipay, .wechat],
            items: [
                PaymentItem(name: "Product A", quantity: 1, price: 30.00),
                PaymentItem(name: "Product B", quantity: 1, price: 20.00)
            ],
            returnDeeplink: DeeplinkConfig(
                iosScheme: "yourapp://payway/callback",
                androidScheme: "yourapp://payway/callback"
            )
        )
        
        payway.presentPaymentSheet(from: self, configuration: config, delegate: self)
    }
}

extension PaymentViewController: ABAPayWayDelegate {
    func paymentSheet(_ sheet: PaymentSheet, didCompleteWithResult result: PaymentResult) {
        // Handle result
    }
}
```

---

## Payment Options

The SDK supports the following payment options:

| Payment Option | Enum Value | Currency | Description | Deeplink |
|----------------|------------|----------|-------------|----------|
| ABA KHQR | `.abaKHQR` | USD, KHR | ABA Pay + Cambodia QR | Via QR code |
| ABA KHQR Deeplink | `.abaKHQRDeeplink` | USD, KHR | ABA Pay with direct app launch | ✅ Yes |
| Cards | `.cards` | USD, KHR | Visa, Mastercard, JCB | Via WebView |
| Alipay | `.alipay` | USD only | Alipay wallet | Via WebView |
| WeChat Pay | `.wechat` | USD only | WeChat wallet | Via WebView |
| Google Pay | `.googlePay` | USD only | Google Pay | Via WebView |

### Payment Option Response (ABA KHQR Deeplink)

When using `.abaKHQRDeeplink`, the SDK returns:

```json
{
  "qr_string": "00020101021230510016abaakhppxxx@abaa...",
  "qr_image": "data:image/png;base64,iVBORw0KGgo...",
  "abapay_deeplink": "abamobilebank://ababank.com?type=payway&qrcode=...",
  "app_store": "https://itunes.apple.com/al/app/aba-mobile-bank/id968860649?mt=8",
  "play_store": "https://play.google.com/store/apps/details?id=com.paygo24.ibank",
  "amount": 0.01,
  "currency": "USD"
}
```

---

## Deeplink Handling

### Overview

When a user pays with ABA KHQR Deeplink, the flow is:

1. SDK opens ABA Mobile app via `abamobilebank://ababank.com?type=payway&qrcode=...`
2. User completes payment in ABA Mobile
3. ABA Mobile returns to your app via `yourapp://payway/callback?tran_id=...&status=...&apv=...`
4. SDK verifies the callback signature
5. Your app receives the payment result

### SceneDelegate Configuration

```swift
// filepath: SceneDelegate.swift
import UIKit
import ABAPayWay

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    
    var window: UIWindow?
    
    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // Handle deeplinks that launched the app
        if let urlContext = connectionOptions.urlContexts.first {
            handleDeeplink(urlContext.url)
        }
    }
    
    func scene(
        _ scene: UIScene,
        openURLContexts URLContexts: Set<UIOpenURLContext>
    ) {
        guard let url = URLContexts.first?.url else { return }
        handleDeeplink(url)
    }
    
    private func handleDeeplink(_ url: URL) {
        ABAPayWayDeeplinkHandler.shared.handle(url: url) { result in
            switch result {
            case .success(let callback):
                // callback.tranId, callback.status, callback.apv
                verifyAndProcessPayment(callback)
            case .failure(let error):
                print("Deeplink error: \(error)")
            }
        }
    }
}
```

### Callback Data Format

The return URL contains these parameters:

| Parameter | Description |
|-----------|-------------|
| `tran_id` | Your transaction ID |
| `status` | Payment status code (0 = approved) |
| `apv` | Approval code from ABA |
| `return_params` | Your custom return parameters |

### ABA Mobile App Store Fallback

If ABA Mobile is not installed, the SDK will provide the App Store URL:

- **iOS App Store:** `https://itunes.apple.com/al/app/aba-mobile-bank/id968860649?mt=8`

---

## QR Display

For QR-based payments, use the `QRDisplayView` component:

```swift
// filepath: QRPaymentViewController.swift
import ABAPayWay

class QRPaymentViewController: UIViewController {
    
    private let qrDisplayView = ABAPayWayQRDisplayView()
    
    func showQRCode(for response: QRPaymentResponse) {
        // Configure the QR display
        qrDisplayView.configure(
            qrImage: response.qrImage,      // Base64 PNG image
            amount: response.amount,
            currency: response.currency,
            merchantName: "Your Store"
        )
        
        // Add to view hierarchy
        qrDisplayView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(qrDisplayView)
        NSLayoutConstraint.activate([
            qrDisplayView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            qrDisplayView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            qrDisplayView.widthAnchor.constraint(equalToConstant: 280),
            qrDisplayView.heightAnchor.constraint(equalToConstant: 280)
        ])
        
        // Start polling for payment status
        qrDisplayView.startPolling(
            transactionId: response.transactionId,
            interval: 3.0  // Poll every 3 seconds
        ) { [weak self] status in
            switch status {
            case .approved:
                self?.handlePaymentSuccess()
            case .pending:
                break  // Keep polling
            case .failed:
                self?.handlePaymentFailure()
            case .cancelled:
                self?.handleUserCancellation()
            case .expired:
                self?.handleQRExpiry()
            }
        }
    }
}
```

### QR Image Templates

| Template | Description |
|----------|-------------|
| `TEMPLATE1` | Standard white QR on white background |
| `TEMPLATE1_COLOR` | Standard colored QR |
| `TEMPLATE2` | Alternative layout |
| `TEMPLATE2_COLOR` | Colored alternative |
| `TEMPLATE3` | Compact layout |
| `TEMPLATE3_COLOR` | Colored compact |

---

## WebView Checkout

For card payments and wallets that require web-based flows, the SDK uses an embedded WKWebView:

```swift
// filepath: WebViewCheckoutViewController.swift
import ABAPayWay

class WebViewCheckoutViewController: UIViewController {
    
    private let checkoutWebView: ABAPayWayCheckoutWebView
    
    init() {
        self.checkoutWebView = ABAPayWayCheckoutWebView()
        super.init(nibName: nil, bundle: nil)
    }
    
    func startCardPayment(session: PaymentSession) {
        checkoutWebView.loadCheckout(session: session) { [weak self] result in
            switch result {
            case .success(let transaction):
                self?.handlePaymentSuccess(transaction)
            case .failure(let error):
                self?.handlePaymentError(error)
            case .cancelled:
                self?.dismiss(animated: true)
            }
        }
    }
}
```

The WebView handles:
- Card input with 3DS authentication
- Alipay and WeChat Pay redirects
- Success/failure page detection
- Automatic callback verification

---

## Error Handling

### PayWayError Enum

```swift
// filepath: ABAPayWay/Errors/PayWayError.swift
public enum PayWayError: Error, LocalizedError {
    case invalidConfiguration(String)
    case networkError(underlying: Error)
    case serverError(code: String, message: String)
    case signatureVerificationFailed
    case deeplinkInvalid
    case deeplinkExpired
    case paymentDeclined(reason: String?)
    case paymentCancelled
    case timeout
    case unknown(String)
    
    public var errorDescription: String? {
        switch self {
        case .invalidConfiguration(let detail):
            return "Invalid configuration: \(detail)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error [\(code)]: \(message)"
        case .signatureVerificationFailed:
            return "Callback signature verification failed"
        case .deeplinkInvalid:
            return "Invalid deeplink URL"
        case .deeplinkExpired:
            return "Deeplink has expired"
        case .paymentDeclined(let reason):
            return "Payment declined: \(reason ?? "Unknown reason")"
        case .paymentCancelled:
            return "Payment was cancelled"
        case .timeout:
            return "Payment timed out"
        case .unknown(let detail):
            return "Unknown error: \(detail)"
        }
    }
}
```

### Handling Errors

```swift
// filepath: ErrorHandlingExample.swift
func handlePaymentError(_ error: PayWayError) {
    switch error {
    case .networkError:
        showAlert(
            title: "Connection Error",
            message: "Please check your internet connection and try again."
        )
        
    case .paymentDeclined(let reason):
        showAlert(
            title: "Payment Declined",
            message: reason ?? "Your payment was declined by the bank."
        )
        
    case .signatureVerificationFailed:
        // Security concern — log and alert
        print("WARNING: Callback signature verification failed!")
        showAlert(
            title: "Security Error",
            message: "Payment verification failed. Please contact support."
        )
        
    case .timeout:
        showAlert(
            title: "Timeout",
            message: "The payment session expired. Please try again."
        )
        
    default:
        showAlert(
            title: "Error",
            message: error.localizedDescription
        )
    }
}
```

### Transaction Status Codes

| Code | Status | Description |
|------|--------|-------------|
| `0` | APPROVED | Payment successful |
| `0` | PRE-AUTH | Pre-authorization hold |
| `2` | PENDING | Awaiting payment |
| `3` | DECLINED | Payment declined |
| `4` | REFUNDED | Fully or partially refunded |
| `7` | CANCELLED | Merchant cancelled |

---

## API Reference

### ABAPayWay Class

```swift
// filepath: ABAPayWay.swift
public class ABAPayWay {
    
    /// Shared singleton instance
    public static let shared = ABAPayWay()
    
    /// Configure the SDK with your merchant credentials
    public static func configure(merchantId: String, environment: Environment)
    
    /// Present the native payment sheet
    public func presentPaymentSheet(
        from viewController: UIViewController,
        configuration: PaymentSheetConfig,
        delegate: ABAPayWayDelegate
    )
    
    /// Generate a QR code for KHQR payments
    public func generateQR(
        transactionId: String,
        amount: Decimal,
        currency: Currency,
        paymentOption: PaymentOption,
        qrImageTemplate: QRImageTemplate,
        lifetime: Int,
        completion: @escaping (Result<QRPaymentResponse, PayWayError>) -> Void
    )
    
    /// Check transaction status
    public func checkTransaction(
        transactionId: String,
        completion: @escaping (Result<TransactionStatus, PayWayError>) -> Void
    )
    
    /// Verify a callback signature
    public static func verifyCallback(
        callback: CallbackData,
        secretKey: String
    ) -> Bool
}
```

### PaymentSheetConfig

```swift
// filepath: PaymentSheetConfig.swift
public struct PaymentSheetConfig {
    public let transactionId: String
    public let amount: Decimal
    public let currency: Currency
    public let paymentOptions: [PaymentOption]
    public let items: [PaymentItem]?
    public let returnDeeplink: DeeplinkConfig
    public let skipSuccessPage: Bool
    public let continueSuccessUrl: String?
}
```

### Currency Enum

```swift
public enum Currency: String {
    case usd = "USD"
    case khr = "KHR"
}
```

### PaymentOption Enum

```swift
public enum PaymentOption: String {
    case abaKHQR = "abapay_khqr"
    case abaKHQRDeeplink = "abapay_khqr_deeplink"
    case cards = "cards"
    case alipay = "alipay"
    case wechat = "wechat"
    case googlePay = "google_pay"
}
```

---

## Security

### Critical Security Principle

**Your API key must never be embedded in your iOS app.** The SDK follows a backend-signed architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SECURITY MODEL                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   iOS App                          Your Backend                      │
│   ┌─────────────┐                  ┌─────────────────────────┐      │
│   │  SDK only   │                  │  • Holds apiKey         │      │
│   │  receives   │                  │  • Signs all requests   │      │
│   │  signed     │◀──── signed ──────│  • Never expose apiKey  │      │
│   │  payload    │    payload       └─────────────────────────┘      │
│   └─────────────┘                                                       │
│                                                                      │
│   PayWay API ←── signed request ─── Your Backend                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

1. **API keys in apps can be extracted** — Even with obfuscation, determined attackers can find keys embedded in app binaries
2. **Backend signing ensures authentication** — Only your backend can authenticate with PayWay
3. **Callback verification prevents spoofing** — The SDK verifies HMAC signatures on all return URLs

### Callback Signature Verification

Always verify callback signatures before fulfilling orders:

```swift
// filepath: SignatureVerification.swift
func verifyAndFulfill(callback: PayWayCallback) {
    // Use your backend to verify — never put secret key in app
    Task {
        do {
            let isValid = try await verifySignatureOnBackend(callback)
            if isValid {
                fulfillOrder(transactionId: callback.tranId)
            } else {
                // Potential fraud — log and investigate
                reportSuspiciousCallback(callback)
            }
        }
    }
}

private func verifySignatureOnBackend(_ callback: PayWayCallback) async throws -> Bool {
    let url = URL(string: "https://yourbackend.com/api/payway/verify-callback")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = try JSONEncoder().encode(callback)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(VerifyResponse.self, from: data)
    return response.valid
}
```

---

## Example Code

### Complete SwiftUI Example

```swift
// filepath: CompleteSwiftUIExample.swift
import SwiftUI
import ABAPayWay

@main
struct MyStoreApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var showingPaymentSheet = false
    @State private var paymentResult: PaymentResult?
    @State private var isLoading = false
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Total: $25.00")
                .font(.largeTitle)
            
            Button("Pay with ABA PayWay") {
                showingPaymentSheet = true
            }
            .buttonStyle(.borderedProminent)
        }
        .sheet(isPresented: $showingPaymentSheet) {
            PaymentSheetView(
                configuration: PaymentSheetConfig(
                    transactionId: "order-\(Int(Date().timeIntervalSince1970))",
                    amount: 25.00,
                    currency: .usd,
                    paymentOptions: [.abaKHQR, .cards],
                    returnDeeplink: DeeplinkConfig(
                        iosScheme: "myapp://payway/callback",
                        androidScheme: "myapp://payway/callback"
                    )
                ),
                onComplete: { result in
                    showingPaymentSheet = false
                    paymentResult = result
                    handleResult(result)
                }
            )
        }
    }
    
    private func handleResult(_ result: PaymentResult) {
        switch result {
        case .success(let transaction):
            print("Payment approved: \(transaction.tranId)")
            // Navigate to confirmation screen
        case .failure(let error):
            print("Payment failed: \(error.localizedDescription)")
            // Show error alert
        case .cancelled:
            print("Payment cancelled")
        }
    }
}
```

### Complete UIKit Example

```swift
// filepath: CompleteUIKitExample.swift
import UIKit
import ABAPayWay

class CheckoutViewController: UIViewController {
    
    private let payway = ABAPayWay.shared
    
    private lazy var payButton: UIButton = {
        var config = UIButton.Configuration.filled()
        config.title = "Pay Now"
        config.baseBackgroundColor = .systemBlue
        let button = UIButton(configuration: config)
        button.addTarget(self, action: #selector(initiatePayment), for: .touchUpInside)
        return button
    }()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.addSubview(payButton)
        payButton.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            payButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            payButton.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            payButton.widthAnchor.constraint(equalToConstant: 200),
            payButton.heightAnchor.constraint(equalToConstant: 50)
        ])
    }
    
    @objc private func initiatePayment() {
        let config = PaymentSheetConfig(
            transactionId: "order-\(Int(Date().timeIntervalSince1970))",
            amount: 25.00,
            currency: .usd,
            paymentOptions: [.abaKHQR, .cards, .alipay],
            returnDeeplink: DeeplinkConfig(
                iosScheme: "myapp://payway/callback",
                androidScheme: "myapp://payway/callback"
            )
        )
        
        payway.presentPaymentSheet(from: self, configuration: config, delegate: self)
    }
}

extension CheckoutViewController: ABAPayWayDelegate {
    func paymentSheet(_ sheet: PaymentSheet, didCompleteWithResult result: PaymentResult) {
        switch result {
        case .success(let transaction):
            showAlert(title: "Success", message: "Payment \(transaction.tranId) approved")
        case .failure(let error):
            showAlert(title: "Error", message: error.localizedDescription)
        case .cancelled:
            print("User cancelled")
        }
    }
    
    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
```

---

## See Also

- [Android SDK Documentation](../android/README.md)
- [Web Implementation Guide](../../../../docs/guides/03-web-implementation.md)
- [Deep Linking Guide](../../../../docs/guides/08-deep-linking.md)
- [API Reference](../../../../docs/guides/11-callbacks-and-webhooks.md)
- [Error Handling Guide](../../../../docs/guides/12-error-handling-and-debugging.md)