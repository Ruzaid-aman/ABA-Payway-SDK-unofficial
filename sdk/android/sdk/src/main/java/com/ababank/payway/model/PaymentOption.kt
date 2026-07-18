package com.ababank.payway.model

import kotlinx.serialization.Serializable

/**
 * Payment options supported by PayWay.
 */
@Serializable
enum class PaymentOption(val value: String) {
    ABA_KHQR("abapay_khqr"),
    ABA_KHQR_DEEPLINK("abapay_khqr_deeplink"),
    CARDS("cards"),
    ALIPAY("alipay"),
    WECHAT("wechat"),
    GOOGLE_PAY("google_pay");

    companion object {
        fun fromValue(value: String): PaymentOption? = entries.find { it.value == value }
    }
}