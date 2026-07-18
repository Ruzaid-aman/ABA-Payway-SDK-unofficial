package com.ababank.payway.model

import java.math.BigDecimal

/**
 * Result of a payment transaction.
 */
sealed class PaymentResult {

    /**
     * Successful payment.
     *
     * @property tranId The transaction ID.
     * @property amount The payment amount.
     * @property currency The payment currency.
     * @property paymentStatus The status of the payment.
     * @property apv The approval code (if available).
     * @property transactionDate The transaction date (if available).
     */
    data class Success(
        val tranId: String,
        val amount: BigDecimal,
        val currency: Currency,
        val paymentStatus: TransactionStatus,
        val apv: String?,
        val transactionDate: String?
    ) : PaymentResult()

    /**
     * Failed payment.
     *
     * @property tranId The transaction ID.
     * @property code The error code.
     * @property message The error message.
     */
    data class Failure(
        val tranId: String,
        val code: String,
        val message: String
    ) : PaymentResult()

    /**
     * Payment was cancelled by the user.
     */
    object Cancelled : PaymentResult()
}