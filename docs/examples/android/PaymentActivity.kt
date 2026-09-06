/**
 * PaymentActivity.kt
 * PayWay Android Integration Example
 *
 * This Activity loads ABA PayWay's checkout page in a WebView,
 * intercepts the return URL redirect, and communicates the payment
 * result back to the calling Activity.
 *
 * See Chapter 4 — Native App Implementation for full documentation.
 *
 * Dependencies: kotlinx.coroutines, org.json
 */

package com.yourcompany.yourapp

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

    // Configure these URLs for your environment
    private val backendCheckoutURL = "https://your-api.com/api/checkout/create"
    private val backendStatusURL = "https://your-api.com/api/checkout/status"
    private val returnURLPrefix = "https://your-website.com/payment-result"

    // Payment amount (can be passed via Intent extras)
    private var paymentAmount = 15.00
    private var currency = "USD"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Read amount from Intent extras if provided
        paymentAmount = intent.getDoubleExtra("amount", 15.00)
        currency = intent.getStringExtra("currency") ?: "USD"

        // Setup WebView
        webView = WebView(this).apply {
            // Enable JavaScript (required by PayWay's checkout page)
            settings.javaScriptEnabled = true

            // Enable DOM storage for PayWay's session management
            settings.domStorageEnabled = true

            // Accept cookies for PayWay's session
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    url: String?
                ): Boolean {
                    // Detect redirect back to return URL
                    if (url?.startsWith(returnURLPrefix) == true) {
                        println("[PayWay] Payment redirect detected: $url")

                        // Extract transaction ID from URL
                        val uri = android.net.Uri.parse(url)
                        transactionId = uri.getQueryParameter("tran_id")

                        // Close WebView and check real status
                        checkPaymentStatus()
                        return true // Intercept the URL
                    }
                    return false // Allow PayWay's own pages to load
                }

                override fun onReceivedError(
                    view: WebView?,
                    errorCode: Int,
                    description: String?,
                    failingUrl: String?
                ) {
                    println("[PayWay] WebView error: $errorCode - $description")
                    finishWithResult(
                        PaymentResult.Error("WebView error: ${description ?: "Unknown"}")
                    )
                }
            }
        }

        setContentView(webView)
        initiateCheckout()
    }

    // ---------------------------------------------------------------
    // Step 1: Call backend to get signed checkout payload
    // ---------------------------------------------------------------
    private fun initiateCheckout() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL(backendCheckoutURL)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val body = JSONObject().apply {
                    put("amount", paymentAmount)
                    put("currency", currency)
                    put("firstName", "Customer")
                    put("lastName", "")
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

    // ---------------------------------------------------------------
    // Build hidden form HTML
    // ---------------------------------------------------------------
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
                    .spinner { margin: 20px auto; width: 40px; height: 40px;
                               border: 3px solid #e5e7eb; border-top-color: #111;
                               border-radius: 50%; animation: spin 0.8s linear infinite; }
                    @keyframes spin { to { transform: rotate(360deg); } }
                </style>
            </head>
            <body>
                <div class="spinner"></div>
                <p>Redirecting to payment...</p>
                <form id="f" method="POST"
                      action="$checkoutURL/api/payment-gateway/v1/payments/purchase">
                    $hiddenInputs
                </form>
                <script>
                    setTimeout(function() {
                        document.getElementById('f').submit();
                    }, 500);
                </script>
            </body>
            </html>
        """.trimIndent()
    }

    // ---------------------------------------------------------------
    // Step 3: Check real payment status via backend
    // ---------------------------------------------------------------
    private fun checkPaymentStatus() {
        val tranID = transactionId ?: run {
            finishWithResult(PaymentResult.Error("No transaction ID"))
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL(backendStatusURL)
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
                    finishWithResult(
                        PaymentResult.Error(e.message ?: "Unknown error")
                    )
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // Return result to calling Activity
    // ---------------------------------------------------------------
    private fun finishWithResult(result: PaymentResult) {
        val intent = android.content.Intent().apply {
            putExtra("payment_result", result.javaClass.simpleName)
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

    // ---------------------------------------------------------------
    // Back button: ask for confirmation before cancelling
    // ---------------------------------------------------------------
    override fun onBackPressed() {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Cancel Payment?")
            .setMessage("If you go back, your payment will be cancelled.")
            .setPositiveButton("Yes, Cancel") { _, _ ->
                finishWithResult(PaymentResult.Cancelled)
            }
            .setNegativeButton("Stay", null)
            .show()
    }
}

// ---------------------------------------------------------------
// Payment Result Types
// ---------------------------------------------------------------
sealed class PaymentResult {
    object Success : PaymentResult()
    object Cancelled : PaymentResult()
    data class Error(val message: String) : PaymentResult()
}