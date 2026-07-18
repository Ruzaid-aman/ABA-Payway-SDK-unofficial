package com.ababank.payway.model

import kotlinx.serialization.Serializable

/**
 * Transaction status values returned by PayWay.
 */
@Serializable
enum class TransactionStatus(val value: String) {
    APPROVED("APPROVED"),
    PENDING("PENDING"),
    DECLINED("DECLINED"),
    REFUNDED("REFUNDED"),
    CANCELLED("CANCELLED"),
    PRE_AUTH("PRE-AUTH");

    companion object {
        fun fromValue(value: String): TransactionStatus? = entries.find { it.value == value }

        /**
         * Payment status codes returned by checkTransaction and getTransactionDetail.
         * Discovered via sandbox testing.
         */
        fun fromStatusCode(code: Int): TransactionStatus? = when (code) {
            0 -> APPROVED
            2 -> PENDING
            3 -> DECLINED
            4 -> REFUNDED
            7 -> CANCELLED
            else -> null
        }
    }
}