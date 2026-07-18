package com.ababank.payway

import android.content.Context
import androidx.fragment.app.Fragment
import com.ababank.payway.config.PayWayConfig
import com.ababank.payway.config.Environment
import com.ababank.payway.deeplink.DeeplinkHandler
import com.ababank.payway.deeplink.DeeplinkResult
import com.ababank.payway.error.PayWayError
import com.ababank.payway.model.Currency
import com.ababank.payway.model.PaymentOption
import com.ababank.payway.model.PaymentResult
import com.ababank.payway.model.PaymentSheetConfig
import com.ababank.payway.model.QRResponse
import com.ababank.payway.network.PayWayAPIClient
import com.ababank.payway.ui.PaymentSheetFragment
import com.ababank.payway.ui.QRDisplayDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.math.BigDecimal

/**
 * Main facade for the ABA PayWay Android SDK.
 *
 * This is the primary entry point for integrating PayWay into an Android app.
 *
 * ## Security Note
 * The SDK NEVER holds the PayWay API key. All signing is done by the merchant's
 * backend server. The SDK only stores merchantId and backendUrl.
 *
 * ## Usage
 * ```kotlin
 * // 1. Configure the SDK
 * ABAPayWay.configure(PayWayConfig(
 *     merchantId = "your_merchant_id",
 *     backendUrl = "https://your-backend.com/api/payway",
 *     environment = Environment.SANDBOX
 * ))
 *
 * // 2. Present payment sheet
 * ABAPayWay.presentPaymentSheet(
 *     fragment = this,
 *     config = PaymentSheetConfig(...),
 *     callback = object : PaymentSheetCallback { ... }
 * )
 *
 * // 3. Handle deeplink return in Activity
 * override fun onNewIntent(intent: Intent?) {
 *     super.onNewIntent(intent)
 *     intent?.data?.let { uri ->
 *         ABAPayWay.handleDeeplink(uri) { result -> ... }
 *     }
 * }
 * ```
 */
object ABAPayWay {

    private var config: PayWayConfig? = null
    private var apiClient: PayWayAPIClient? = null

    /**
     * Configures the PayWay SDK with the given configuration.
     *
     * Must be called before any other SDK methods.
     *
     * @param config The PayWay configuration.
     * @throws PayWayError.InvalidConfig if config is invalid.
     */
    fun configure(config: PayWayConfig) {
        if (config.merchantId.isBlank()) {
            throw PayWayError.InvalidConfig
        }
        if (config.backendUrl.isBlank()) {
            throw PayWayError.InvalidConfig
        }

        this.config = config
        this.apiClient = PayWayAPIClient(config)
    }

    /**
     * Gets the current configuration.
     *
     * @return The current PayWayConfig or null if not configured.
     */
    fun getConfig(): PayWayConfig? = config

    /**
     * Presents the payment sheet as a bottom sheet dialog.
     *
     * @param fragment The fragment to attach the bottom sheet to.
     * @param config The payment configuration.
     * @param callback The callback for payment results.
     */
    fun presentPaymentSheet(
        fragment: Fragment,
        config: PaymentSheetConfig,
        callback: PaymentSheetFragment.PaymentSheetCallback
    ) {
        val client = apiClient ?: throw PayWayError.InvalidConfig

        val paymentSheet = PaymentSheetFragment.newInstance(config, callback, client)
        paymentSheet.show(fragment.childFragmentManager, PaymentSheetFragment.TAG)
    }

    /**
     * Generates a QR code for the given payment configuration.
     *
     * This is a suspend function that must be called from a coroutine scope.
     *
     * @param config The payment configuration.
     * @return QRResponse containing the QR string, image, and deeplink.
     * @throws PayWayError if the operation fails.
     */
    suspend fun generateQR(config: PaymentSheetConfig): QRResponse {
        val client = apiClient ?: throw PayWayError.InvalidConfig

        return withContext(Dispatchers.IO) {
            try {
                // Step 1: Request signing from merchant backend
                val signedPayload = client.requestSigning(
                    transactionId = config.transactionId,
                    amount = config.amount,
                    currency = config.currency,
                    paymentOption = PaymentOption.ABA_KHQR.value,
                    firstname = config.firstname,
                    lastname = config.lastname,
                    email = config.email,
                    phone = config.phone,
                    returnUrl = config.returnUrl,
                    cancelUrl = config.cancelUrl,
                    returnDeeplink = serializeDeeplinkConfig(config.returnDeeplink),
                    lifetime = config.lifetime
                )

                // Step 2: Submit purchase to PayWay
                client.submitPurchase(signedPayload)
            } catch (e: PayWayError) {
                throw e
            } catch (e: Exception) {
                throw PayWayError.Unknown(e.message ?: "Unknown error")
            }
        }
    }

    /**
     * Opens ABA Mobile app with the QR code for payment.
     *
     * @param context The Android context.
     * @param qrCode The KHQR string from QRResponse.
     * @return DeeplinkResult indicating success or failure.
     */
    fun openABAMobile(context: Context, qrCode: String): DeeplinkResult {
        return DeeplinkHandler.openABAMobile(context, qrCode)
    }

    /**
     * Handles a return deeplink from ABA Mobile.
     *
     * Call this from your Activity's onNewIntent or onResume.
     *
     * @param uri The URI from the intent.
     * @return DeeplinkResult with parsed transaction data.
     */
    fun handleDeeplink(uri: android.net.Uri): DeeplinkResult {
        return DeeplinkHandler.handleReturnDeeplink(uri)
    }

    /**
     * Checks if ABA Mobile is installed.
     *
     * @param context The Android context.
     * @return True if ABA Mobile is installed.
     */
    fun isABAMobileInstalled(context: Context): Boolean {
        return DeeplinkHandler.isABAMobileInstalled(context)
    }

    /**
     * Opens the app store page for ABA Mobile.
     *
     * @param context The Android context.
     * @param isAppStore True for App Store, false for Play Store.
     */
    fun openABAMobileAppStore(context: Context, isAppStore: Boolean) {
        DeeplinkHandler.openAppStore(context, isAppStore)
    }

    /**
     * Shows a QR code dialog.
     *
     * @param context The Android context.
     * @param qrResponse The QR response from generateQR.
     * @param amount The payment amount.
     * @param currency The payment currency.
     * @param transactionId The transaction ID for polling.
     * @param hash The hash for status checks.
     * @param reqTime The request time for status checks.
     * @return The dialog that was shown.
     */
    fun showQRDialog(
        context: Context,
        qrResponse: QRResponse,
        amount: BigDecimal,
        currency: Currency,
        transactionId: String,
        hash: String,
        reqTime: String
    ): QRDisplayDialog {
        val dialog = QRDisplayDialog(context, qrResponse, amount, currency)

        dialog.setOnPaymentCompleteListener { status ->
            // Handle completion
        }

        apiClient?.let { client ->
            dialog.startPolling(transactionId, hash, reqTime, client)
        }

        dialog.show()
        return dialog
    }

    private fun serializeDeeplinkConfig(config: com.ababank.payway.model.DeeplinkConfig): String {
        return """{"android_scheme":"${config.androidScheme}","ios_scheme":"${config.iosScheme}"}"""
    }
}