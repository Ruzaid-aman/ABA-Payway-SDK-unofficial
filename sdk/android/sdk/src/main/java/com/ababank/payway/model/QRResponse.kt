package com.ababank.payway.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import kotlinx.parcelize.TypeParceler
import kotlinx.serialization.Serializable
import java.math.BigDecimal

/**
 * Response from QR code generation.
 *
 * @property qrString Raw KHQR payload string (scannable by any KHQR-member banking app).
 * @property qrImage Base64-encoded QR code image (for platforms that can't render qr_string).
 * @property abapayDeeplink Deeplink to open ABA Mobile directly with pre-filled payment.
 * @property checkoutQrUrl Hosted URL rendering the QR code as an image/page.
 * @property amount The payment amount (if returned by API).
 * @property currency The payment currency (if returned by API).
 */
@Parcelize
@Serializable
@TypeParceler<BigDecimal, BigDecimalParceler>()
data class QRResponse(
    val qrString: String?,
    val qrImage: String?,
    val abapayDeeplink: String?,
    val checkoutQrUrl: String?,
    val amount: BigDecimal?,
    val currency: Currency?
) : Parcelable