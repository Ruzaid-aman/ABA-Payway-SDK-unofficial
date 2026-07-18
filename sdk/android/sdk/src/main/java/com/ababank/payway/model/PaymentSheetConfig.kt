package com.ababank.payway.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import kotlinx.parcelize.TypeParceler
import kotlinx.serialization.Serializable
import java.math.BigDecimal

/**
 * Configuration for the payment sheet.
 *
 * @property transactionId Unique transaction ID (merchant's responsibility to generate).
 * @property amount The payment amount.
 * @property currency The currency of the payment.
 * @property items Optional list of items being purchased.
 * @property paymentOptions List of enabled payment options.
 * @property returnDeeplink Configuration for returning via deeplink after payment.
 * @property returnUrl Optional URL to redirect after successful payment.
 * @property cancelUrl Optional URL to redirect if payment is cancelled.
 * @property email Optional customer email.
 * @property phone Optional customer phone number.
 * @property firstname Optional customer first name.
 * @property lastname Optional customer last name.
 * @property lifetime Optional QR code lifetime in seconds (default 300).
 */
@Parcelize
@Serializable
@TypeParceler<BigDecimal, BigDecimalParceler>()
data class PaymentSheetConfig(
    val transactionId: String,
    val amount: BigDecimal,
    val currency: Currency,
    val items: List<PaymentItem>? = null,
    val paymentOptions: List<PaymentOption>,
    val returnDeeplink: DeeplinkConfig,
    val returnUrl: String? = null,
    val cancelUrl: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val firstname: String? = null,
    val lastname: String? = null,
    val lifetime: Int? = null
) : Parcelable