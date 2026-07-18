package com.ababank.payway.deeplink

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.ababank.payway.model.QRResponse

/**
 * Handler for ABA PayWay deeplinks.
 *
 * Handles:
 * - Opening ABA Mobile app with QR code payment
 * - Parsing return deeplinks from ABA Mobile after payment
 * - Getting app store URLs for ABA Mobile
 */
object DeeplinkHandler {

    private const val ABA_MOBILE_PACKAGE = "com.aba.mobile"
    private const val ABA_MOBILE_DEEPLINK_SCHEME = "abamobilebank://ababank.com"

    /**
     * Opens ABA Mobile app with the QR code for payment.
     *
     * @param context The Android context.
     * @param qrCode The KHQR string from QRResponse.
     * @return DeeplinkResult indicating success or failure.
     */
    fun openABAMobile(context: Context, qrCode: String): DeeplinkResult {
        return try {
            val deeplinkUri = Uri.parse("$ABA_MOBILE_DEEPLINK_SCHEME?type=payway&qrcode=$qrCode")
            val intent = Intent(Intent.ACTION_VIEW, deeplinkUri).apply {
                setPackage(ABA_MOBILE_PACKAGE)
            }

            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
                DeeplinkResult.Success(
                    tranId = "",
                    status = "OPENED",
                    apv = null,
                    returnParams = null
                )
            } else {
                DeeplinkResult.Invalid
            }
        } catch (e: Exception) {
            DeeplinkResult.Invalid
        }
    }

    /**
     * Handles the return deeplink from ABA Mobile after payment.
     *
     * Parses URLs like: yourapp://payway/callback?tran_id=...&status=...&apv=...
     *
     * @param uri The URI returned from ABA Mobile.
     * @return DeeplinkResult with parsed transaction data.
     */
    fun handleReturnDeeplink(uri: Uri): DeeplinkResult {
        return try {
            // Expected format: scheme://host/callback?tran_id=...&status=...&apv=...
            val scheme = uri.scheme ?: return DeeplinkResult.Invalid
            val host = uri.host ?: return DeeplinkResult.Invalid

            if (scheme != "yourapp" || host != "payway") {
                return DeeplinkResult.Invalid
            }

            val path = uri.path?.trimEnd('/')
            if (path != "/callback") {
                return DeeplinkResult.Invalid
            }

            val tranId = uri.getQueryParameter("tran_id") ?: return DeeplinkResult.Invalid
            val status = uri.getQueryParameter("status") ?: return DeeplinkResult.Invalid
            val apv = uri.getQueryParameter("apv")
            val returnParams = uri.getQueryParameter("return_params")

            when (status.uppercase()) {
                "CANCELLED" -> DeeplinkResult.Cancelled
                else -> DeeplinkResult.Success(
                    tranId = tranId,
                    status = status,
                    apv = apv,
                    returnParams = returnParams
                )
            }
        } catch (e: Exception) {
            DeeplinkResult.Invalid
        }
    }

    /**
     * Gets the App Store and Play Store URLs for ABA Mobile.
     *
     * @param qrResponse The QR response that may contain store URLs.
     * @return Pair of (appStoreUrl, playStoreUrl) or null if not available.
     */
    fun getAppStoreUrls(qrResponse: QRResponse): Pair<String, String>? {
        // QRResponse doesn't typically contain store URLs
        // These would be hardcoded or fetched from merchant config
        val appStoreUrl = "https://apps.apple.com/kh/app/aba-mobile/idXXXXXXXXX"
        val playStoreUrl = "https://play.google.com/store/apps/details?id=$ABA_MOBILE_PACKAGE"

        return Pair(appStoreUrl, playStoreUrl)
    }

    /**
     * Checks if ABA Mobile is installed on the device.
     *
     * @param context The Android context.
     * @return True if ABA Mobile is installed.
     */
    fun isABAMobileInstalled(context: Context): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("$ABA_MOBILE_DEEPLINK_SCHEME?type=payway&qrcode=test")
                setPackage(ABA_MOBILE_PACKAGE)
            }
            intent.resolveActivity(context.packageManager) != null
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Opens the app store page for ABA Mobile.
     *
     * @param context The Android context.
     * @param isAppStore True for App Store, false for Play Store.
     */
    fun openAppStore(context: Context, isAppStore: Boolean) {
        val url = if (isAppStore) {
            "https://apps.apple.com/kh/app/aba-mobile/idXXXXXXXXX"
        } else {
            "https://play.google.com/store/apps/details?id=$ABA_MOBILE_PACKAGE"
        }

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        context.startActivity(intent)
    }
}