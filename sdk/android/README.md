# ABA PayWay Android SDK

> Accept ABA Pay, KHQR, cards, Alipay, and more from your Android app — with a native bottom sheet and built-in deeplink handling.

[![Platform](https://img.shields.io/badge/platform-Android%207.0%2B-blue.svg)]()
[![Kotlin](https://img.shields.io/badge/Kotlin-1.9-orange.svg)]()
[![Android](https://img.shields.io/badge/compileSdk-34-blue.svg)]()

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
- [ProGuard](#proguard)
- [Example Code](#example-code)

---

## Overview

The ABA PayWay Android SDK provides a native payment experience for Android apps, supporting multiple payment methods including ABA KHQR, credit/debit cards, Alipay, and WeChat Pay. It follows the same security model as the web SDK — **your API key never leaves your server**.

### Key Features

- **Native BottomSheet** — A `BottomSheetDialogFragment` for payment method selection
- **Built-in Deeplink Handling** — Automatic detection and processing of ABA Mobile return URLs
- **QR Code Display** — Native `QRDisplayView` and `QRDisplayDialog` for showing KHQR codes
- **WebView Checkout** — Embedded `CheckoutWebViewFragment` for card payments with 3DS support
- **Callback Verification** — HMAC-SHA512 signature verification for all payment callbacks
- **Zero Dependencies** — The SDK has no external dependencies

### Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌───────────────────────┐
│   Android App        │────▶│   Your Backend Server     │────▶│   ABA PayWay API      │
│   (SDK handles UI)   │◀────│   (Holds API key)        │◀────│   Sandbox or Prod     │
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
| minSdk | 24 (Android 7.0) |
| compileSdk | 34 |
| targetSdk | 34 |
| Kotlin | 1.9+ |
| Java | 17+ |

---

## Installation

### Gradle Dependency

Add the SDK to your `build.gradle.kts` (app level):

```kotlin
// filepath: app/build.gradle.kts
dependencies {
    implementation("com.ababank.payway:android-sdk:1.0.0")
    
    // Optional: For encrypted SharedPreferences (recommended)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

### Maven Repository

Ensure your `settings.gradle.kts` or `build.gradle` includes:

```kotlin
// filepath: settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}
```

---

## Configuration

### AndroidManifest.xml

Add intent filters for deeplink handling and ABA Mobile query scheme:

```xml
<!-- filepath: app/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.yourcompany.yourapp">

    <!-- Query scheme for ABA Mobile app detection -->
    <queries>
        <package android:name="com.paygo24.ibank" />
        <package android:name="com.abacompany.mbank" />
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="abamobilebank" />
        </intent>
    </queries>

    <application>
        <!-- Main Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Payment Activity with deeplink handling -->
        <activity
            android:name=".PaymentActivity"
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="yourapp"
                    android:host="payway"
                    android:pathPrefix="/callback" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

### URL Scheme Format

Your return URL scheme should follow this format:

```
yourapp://payway/callback
```

Where:
- `yourapp` — Your app's custom scheme (must match `android:scheme`)
- `payway/callback` — Fixed path for PayWay callbacks

---

## Quick Start

### Step 1: Initialize the SDK

```kotlin
// filepath: Application.kt
import com.ababank.payway.ABAPayWay

class MyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Initialize with your merchant credentials
        ABAPayWay.configure(
            context = this,
            merchantId = "your_merchant_id",
            environment = Environment.SANDBOX  // Use ENVIRONMENT.PRODUCTION for live
        )
    }
}
```

### Step 2: Request a Signed Payload from Your Backend

```kotlin
// filepath: PaymentRepository.kt
suspend fun createPaymentSession(
    amount: BigDecimal,
    items: List<String>
): PaymentSession {
    val response = api.createSession(
        amount = amount.toString(),
        items = items.joinToString(","),
        returnDeeplink = "yourapp://payway/callback"
    )
    return response.toPaymentSession()
}
```

### Step 3: Present the Payment Sheet

```kotlin
// filepath: PaymentActivity.kt
import com.ababank.payway.*
import com.ababank.payway.models.*

class PaymentActivity : AppCompatActivity() {
    
    private val payway = ABAPayWay.getInstance()
    
    private fun initiatePayment() {
        lifecycleScope.launch {
            try {
                // Get signed payload from your backend
                val session = paymentRepository.createPaymentSession(
                    amount = BigDecimal("25.00"),
                    items = listOf("Product A")
                )
                
                // Configure the payment sheet
                val config = PaymentSheetConfig(
                    transactionId = session.transactionId,
                    amount = session.amount,
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
                
                // Present the native bottom sheet
                payway.presentPaymentSheet(
                    activity = this@PaymentActivity,
                    config = config,
                    callback = paymentCallback
                )
            } catch (e: Exception) {
                showError(e.message ?: "Failed to initialize payment")
            }
        }
    }
    
    private val paymentCallback = object : PaymentSheetCallback {
        override fun onPaymentSuccess(result: PaymentSuccessResult) {
            // Payment approved — fulfill the order
            fulfillOrder(result.tranId)
        }
        
        override fun onPaymentError(error: PaymentError) {
            // Payment failed — show error to user
            showPaymentError(error)
        }
        
        override fun onPaymentCancelled() {
            // User cancelled — return to cart
            dismissPaymentSheet()
        }
    }
}
```

### Step 4: Handle the Return Deeplink

```kotlin
// filepath: PaymentActivity.kt
class PaymentActivity : AppCompatActivity() {
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        
        intent?.data?.let { uri ->
            if (uri.scheme == "yourapp" && uri.host == "payway") {
                handleDeeplink(uri)
            }
        }
    }
    
    private fun handleDeeplink(uri: Uri) {
        ABAPayWayDeeplinkHandler.handle(uri) { result ->
            when (result) {
                is DeeplinkResult.Success -> {
                    // Verify the callback signature via your backend
                    lifecycleScope.launch {
                        val isValid = verifySignatureOnBackend(result.callbackData)
                        if (isValid) {
                            fulfillOrder(result.callbackData.tranId)
                        } else {
                            showError("Payment verification failed")
                        }
                    }
                }
                is DeeplinkResult.Failure -> {
                    showError("Deeplink error: ${result.error.message}")
                }
            }
        }
    }
}
```

---

## PaymentSheet

The `PaymentSheet` is a `BottomSheetDialogFragment` that handles payment method selection:

```kotlin
// filepath: PaymentBottomSheet.kt
import com.ababank.payway.*
import com.ababank.payway.models.*

class PaymentBottomSheet : BottomSheetDialogFragment() {
    
    private val payway = ABAPayWay.getInstance()
    
    private fun showPaymentSheet() {
        val config = PaymentSheetConfig(
            transactionId = "order-001",
            amount = BigDecimal("50.00"),
            currency = Currency.USD,
            paymentOptions = listOf(
                PaymentOption.ABA_KHQR,
                PaymentOption.CARDS,
                PaymentOption.ALIPAY,
                PaymentOption.WECHAT
            ),
            items = listOf(
                PaymentItem(name = "Product A", quantity = 1, price = BigDecimal("30.00")),
                PaymentItem(name = "Product B", quantity = 1, price = BigDecimal("20.00"))
            ),
            returnDeeplink = DeeplinkConfig(
                androidScheme = "yourapp://payway/callback",
                iosScheme = "yourapp://payway/callback"
            )
        )
        
        payway.presentPaymentSheet(
            activity = requireActivity(),
            config = config,
            callback = object : PaymentSheetCallback {
                override fun onPaymentSuccess(result: PaymentSuccessResult) {
                    // Handle success
                }
                
                override fun onPaymentError(error: PaymentError) {
                    // Handle error
                }
                
                override fun onPaymentCancelled() {
                    // Handle cancellation
                }
            }
        )
    }
}
```

---

## Payment Options

The SDK supports the following payment options:

| Payment Option | Enum Value | Currency | Description | Deeplink |
|----------------|------------|----------|-------------|----------|
| ABA KHQR | `ABA_KHQR` | USD, KHR | ABA Pay + Cambodia QR | Via QR code |
| ABA KHQR Deeplink | `ABA_KHQR_DEEPLINK` | USD, KHR | ABA Pay with direct app launch | ✅ Yes |
| Cards | `CARDS` | USD, KHR | Visa, Mastercard, JCB | Via WebView |
| Alipay | `ALIPAY` | USD only | Alipay wallet | Via WebView |
| WeChat Pay | `WECHAT` | USD only | WeChat wallet | Via WebView |
| Google Pay | `GOOGLE_PAY` | USD only | Google Pay | Via WebView |

### Payment Option Response (ABA KHQR Deeplink)

When using `ABA_KHQR_DEEPLINK`, the SDK returns:

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

### AndroidManifest Deep Link Setup

```xml
<!-- filepath: app/src/main/AndroidManifest.xml -->
<activity
    android:name=".PaymentActivity"
    android:launchMode="singleTask"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="yourapp"
            android:host="payway"
            android:pathPrefix="/callback" />
    </intent-filter>
</activity>
```

### onNewIntent Implementation

```kotlin
// filepath: PaymentActivity.kt
class PaymentActivity : AppCompatActivity() {
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.data?.let { handlePaymentDeeplink(it) }
    }
    
    private fun handlePaymentDeeplink(uri: Uri) {
        if (uri.scheme == "yourapp" && uri.host == "payway") {
            ABAPayWayDeeplinkHandler.handle(uri) { result ->
                when (result) {
                    is DeeplinkResult.Success -> {
                        val callback = result.callbackData
                        // callback.tranId, callback.status, callback.apv
                        lifecycleScope.launch {
                            verifyAndFulfill(callback)
                        }
                    }
                    is DeeplinkResult.Failure -> {
                        showError("Payment deeplink error: ${result.error.message}")
                    }
                }
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

If ABA Mobile is not installed, the SDK will provide the Play Store URL:

- **Android Play Store:** `https://play.google.com/store/apps/details?id=com.paygo24.ibank`

---

## QR Display

For QR-based payments, use the `QRDisplayView` or `QRDisplayDialog`:

### QRDisplayView

```kotlin
// filepath: QRPaymentFragment.kt
import com.ababank.payway.ui.QRDisplayView

class QRPaymentFragment : Fragment() {
    
    private lateinit var qrDisplayView: QRDisplayView
    
    fun showQRCode(response: QRPaymentResponse) {
        qrDisplayView = QRDisplayView(requireContext()).apply {
            configure(
                qrImage = response.qrImage,      // Base64 PNG image
                amount = response.amount,
                currency = response.currency,
                merchantName = "Your Store"
            )
            
            setOnPaymentStatusListener(object : PaymentStatusListener {
                override fun onPaymentApproved() {
                    handlePaymentSuccess()
                }
                
                override fun onPaymentPending() {
                    // Keep showing QR
                }
                
                override fun onPaymentFailed(reason: String?) {
                    handlePaymentFailure(reason)
                }
                
                override fun onPaymentCancelled() {
                    dismiss()
                }
                
                override fun onQRExpired() {
                    showError("QR code expired. Please generate a new one.")
                }
            })
        }
        
        // Add to layout or show in dialog
        qrDisplayView.show()
        
        // Start polling for payment status
        qrDisplayView.startPolling(
            transactionId = response.transactionId,
            intervalSeconds = 3
        )
    }
}
```

### QRDisplayDialog

```kotlin
// filepath: QRPaymentDialog.kt
import com.ababank.payway.ui.QRDisplayDialog

fun showQRPaymentDialog(response: QRPaymentResponse) {
    val dialog = QRDisplayDialog.newInstance(
        qrImage = response.qrImage,
        amount = response.amount,
        currency = response.currency,
        merchantName = "Your Store"
    )
    
    dialog.onPaymentStatus = { status ->
        when (status) {
            PaymentStatus.APPROVED -> handleSuccess()
            PaymentStatus.FAILED -> handleFailure()
            PaymentStatus.CANCELLED -> dialog.dismiss()
            PaymentStatus.EXPIRED -> handleExpired()
            PaymentStatus.PENDING -> { /* Keep waiting */ }
        }
    }
    
    dialog.show(supportFragmentManager, "qr_payment")
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

For card payments and wallets that require web-based flows, use `CheckoutWebViewFragment`:

```kotlin
// filepath: CardPaymentFragment.kt
import com.ababank.payway.ui.CheckoutWebViewFragment

class CardPaymentFragment : Fragment() {
    
    private fun startCardPayment(session: PaymentSession) {
        val fragment = CheckoutWebViewFragment.newInstance(session)
        
        fragment.onPaymentComplete = { result ->
            when (result) {
                is CheckoutResult.Success -> handleSuccess(result.transaction)
                is CheckoutResult.Failure -> handleError(result.error)
                is CheckoutResult.Cancelled -> dismiss()
            }
        }
        
        supportFragmentManager.beginTransaction()
            .replace(R.id.container, fragment)
            .commit()
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

### PaymentError Sealed Class

```kotlin
// filepath: com.ababank.payway.errors.PaymentError.kt
sealed class PaymentError(
    val code: String,
    override val message: String,
    val cause: Throwable? = null
) : Exception() {
    
    class InvalidConfiguration(detail: String) : PaymentError("CONFIG", detail)
    class NetworkError(underlying: Throwable) : PaymentError("NETWORK", underlying.message, underlying)
    class ServerError(code: String, serverMessage: String) : PaymentError(code, serverMessage)
    class SignatureVerificationFailed : PaymentError("SIG_INVALID", "Callback signature verification failed")
    class DeeplinkInvalid : PaymentError("DEEPLINK_INVALID", "Invalid deeplink URL")
    class DeeplinkExpired : PaymentError("DEEPLINK_EXPIRED", "Deeplink has expired")
    class PaymentDeclined(reason: String?) : PaymentError("DECLINED", reason ?: "Payment declined")
    object PaymentCancelled : PaymentError("CANCELLED", "Payment was cancelled")
    object Timeout : PaymentError("TIMEOUT", "Payment timed out")
    class Unknown(detail: String) : PaymentError("UNKNOWN", detail)
}
```

### Handling Errors

```kotlin
// filepath: ErrorHandling.kt
private val paymentCallback = object : PaymentSheetCallback {
    override fun onPaymentError(error: PaymentError) {
        when (error) {
            is PaymentError.NetworkError -> {
                showAlert(
                    title = "Connection Error",
                    message = "Please check your internet connection and try again."
                )
            }
            
            is PaymentError.PaymentDeclined -> {
                showAlert(
                    title = "Payment Declined",
                    message = error.message
                )
            }
            
            is PaymentError.SignatureVerificationFailed -> {
                // Security concern — log and alert
                Log.w("PayWay", "WARNING: Callback signature verification failed!")
                showAlert(
                    title = "Security Error",
                    message = "Payment verification failed. Please contact support."
                )
            }
            
            is PaymentError.Timeout -> {
                showAlert(
                    title = "Timeout",
                    message = "The payment session expired. Please try again."
                )
            }
            
            is PaymentError.ServerError -> {
                showAlert(
                    title = "Server Error",
                    message = "An error occurred. Please try again later."
                )
            }
            
            else -> {
                showAlert(
                    title = "Error",
                    message = error.message
                )
            }
        }
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

### ABAPayWay Object

```kotlin
// filepath: com.ababank.payway.ABAPayWay.kt
object ABAPayWay {
    
    /// Configure the SDK with your merchant credentials
    fun configure(context: Context, merchantId: String, environment: Environment)
    
    /// Get the singleton instance
    fun getInstance(): ABAPayWay
    
    /// Present the native payment bottom sheet
    fun presentPaymentSheet(
        activity: FragmentActivity,
        config: PaymentSheetConfig,
        callback: PaymentSheetCallback
    )
    
    /// Generate a QR code for KHQR payments
    suspend fun generateQR(
        transactionId: String,
        amount: BigDecimal,
        currency: Currency,
        paymentOption: PaymentOption,
        qrImageTemplate: QRImageTemplate,
        lifetime: Int
    ): QRPaymentResponse
    
    /// Check transaction status
    suspend fun checkTransaction(transactionId: String): TransactionStatus
    
    /// Verify a callback signature
    fun verifyCallback(callback: CallbackData, secretKey: String): Boolean
}
```

### PaymentSheetConfig

```kotlin
// filepath: com.ababank.payway.models.PaymentSheetConfig.kt
data class PaymentSheetConfig(
    val transactionId: String,
    val amount: BigDecimal,
    val currency: Currency,
    val paymentOptions: List<PaymentOption>,
    val items: List<PaymentItem>? = null,
    val returnDeeplink: DeeplinkConfig,
    val skipSuccessPage: Boolean = false,
    val continueSuccessUrl: String? = null
)
```

### Currency Enum

```kotlin
enum class Currency {
    USD, KHR
}
```

### PaymentOption Enum

```kotlin
enum class PaymentOption {
    ABA_KHQR,
    ABA_KHQR_DEEPLINK,
    CARDS,
    ALIPAY,
    WECHAT,
    GOOGLE_PAY
}
```

### PaymentSheetCallback

```kotlin
// filepath: com.ababank.payway.callbacks.PaymentSheetCallback.kt
interface PaymentSheetCallback {
    fun onPaymentSuccess(result: PaymentSuccessResult)
    fun onPaymentError(error: PaymentError)
    fun onPaymentCancelled()
}
```

---

## Security

### Critical Security Principle

**Your API key must never be embedded in your Android app.** The SDK follows a backend-signed architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SECURITY MODEL                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Android App                       Your Backend                      │
│   ┌─────────────┐                   ┌─────────────────────────┐      │
│   │  SDK only   │                   │  • Holds apiKey         │      │
│   │  receives   │                   │  • Signs all requests   │      │
│   │  signed     │◀──── signed ──────│  • Never expose apiKey │      │
│   │  payload    │    payload       └─────────────────────────┘      │
│   └─────────────┘                                                       │
│                                                                      │
│   PayWay API ←── signed request ─── Your Backend                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

1. **API keys in apps can be extracted** — Even with obfuscation, determined attackers can find keys embedded in APK files
2. **Backend signing ensures authentication** — Only your backend can authenticate with PayWay
3. **Callback verification prevents spoofing** — The SDK verifies HMAC signatures on all return URLs

### Callback Signature Verification

Always verify callback signatures before fulfilling orders:

```kotlin
// filepath: SignatureVerification.kt
private suspend fun verifyAndFulfill(callback: PayWayCallback) {
    // Use your backend to verify — never put secret key in app
    try {
        val isValid = verifySignatureOnBackend(callback)
        if (isValid) {
            fulfillOrder(callback.tranId)
        } else {
            // Potential fraud — log and investigate
            reportSuspiciousCallback(callback)
        }
    } catch (e: Exception) {
        showError("Failed to verify payment")
    }
}

private suspend fun verifySignatureOnBackend(callback: PayWayCallback): Boolean {
    val response = api.verifyCallback(callback)
    return response.valid
}
```

---

## ProGuard

If you're using R8/ProGuard for code shrinking, add these rules to keep the SDK classes:

```proguard
// filepath: app/proguard-rules.pro

# ABA PayWay SDK rules
-keep class com.ababank.payway.** { *; }
-keep class * implements com.ababank.payway.PaymentSheetCallback { *; }
-keep class * implements com.ababank.payway.PaymentStatusListener { *; }
-keepclassmembers class * implements com.ababank.payway.** {
    *;
}

# Keep model classes
-keep class com.ababank.payway.models.** { *; }
-keep class com.ababank.payway.callbacks.** { *; }

# Keep enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# General Android rules
-dontwarn com.ababank.payway.**
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes SourceFile,LineNumberTable
```

---

## Example Code

### Complete Activity Example

```kotlin
// filepath: PaymentActivity.kt
package com.yourcompany.yourapp

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.ababank.payway.*
import com.ababank.payway.models.*
import com.ababank.payway.errors.PaymentError
import kotlinx.coroutines.launch
import java.math.BigDecimal

class PaymentActivity : AppCompatActivity() {
    
    private val payway = ABAPayWay.getInstance()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize SDK if not already done
        ABAPayWay.configure(
            context = this,
            merchantId = "your_merchant_id",
            environment = Environment.SANDBOX
        )
        
        // Start payment when activity is created
        initiatePayment()
    }
    
    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        intent?.data?.let { handlePaymentDeeplink(it) }
    }
    
    private fun initiatePayment() {
        lifecycleScope.launch {
            try {
                // Get signed payload from your backend
                val session = paymentRepository.createPaymentSession(
                    amount = BigDecimal("25.00"),
                    items = listOf("Product A", "Product B")
                )
                
                val config = PaymentSheetConfig(
                    transactionId = session.transactionId,
                    amount = session.amount,
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
                
                payway.presentPaymentSheet(
                    activity = this@PaymentActivity,
                    config = config,
                    callback = paymentCallback
                )
            } catch (e: Exception) {
                Toast.makeText(
                    this@PaymentActivity,
                    "Failed to initialize payment: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                finish()
            }
        }
    }
    
    private val paymentCallback = object : PaymentSheetCallback {
        override fun onPaymentSuccess(result: PaymentSuccessResult) {
            Log.d("PayWay", "Payment approved: ${result.tranId}")
            Toast.makeText(
                this@PaymentActivity,
                "Payment ${result.tranId} approved!",
                Toast.LENGTH_LONG
            ).show()
            // Navigate to confirmation screen or fulfill order
            fulfillOrder(result.tranId)
        }
        
        override fun onPaymentError(error: PaymentError) {
            Log.e("PayWay", "Payment error: ${error.code} - ${error.message}")
            Toast.makeText(
                this@PaymentActivity,
                "Payment failed: ${error.message}",
                Toast.LENGTH_LONG
            ).show()
            // Show appropriate error message to user
        }
        
        override fun onPaymentCancelled() {
            Log.d("PayWay", "Payment cancelled by user")
            Toast.makeText(
                this@PaymentActivity,
                "Payment cancelled",
                Toast.LENGTH_SHORT
            ).show()
            finish()
        }
    }
    
    private fun handlePaymentDeeplink(uri: android.net.Uri) {
        if (uri.scheme == "yourapp" && uri.host == "payway") {
            ABAPayWayDeeplinkHandler.handle(uri) { result ->
                when (result) {
                    is DeeplinkResult.Success -> {
                        val callback = result.callbackData
                        Log.d("PayWay", "Deeplink callback: tranId=${callback.tranId}, status=${callback.status}")
                        lifecycleScope.launch {
                            verifyAndFulfill(callback)
                        }
                    }
                    is DeeplinkResult.Failure -> {
                        Log.e("PayWay", "Deeplink error: ${result.error.message}")
                    }
                }
            }
        }
    }
    
    private suspend fun verifyAndFulfill(callback: PayWayCallback) {
        try {
            val isValid = paymentRepository.verifyCallback(callback)
            if (isValid) {
                fulfillOrder(callback.tranId)
            }
        } catch (e: Exception) {
            Log.e("PayWay", "Callback verification failed", e)
        }
    }
    
    private fun fulfillOrder(transactionId: String) {
        // Implement your order fulfillment logic here
        Log.d("PayWay", "Order fulfilled for transaction: $transactionId")
    }
}
```

---

## See Also

- [iOS SDK Documentation](../ios/README.md)
- [Web Implementation Guide](../../../../docs/guides/03-web-implementation.md)
- [Deep Linking Guide](../../../../docs/guides/08-deep-linking.md)
- [API Reference](../../../../docs/guides/11-callbacks-and-webhooks.md)
- [Error Handling Guide](../../../../docs/guides/12-error-handling-and-debugging.md)