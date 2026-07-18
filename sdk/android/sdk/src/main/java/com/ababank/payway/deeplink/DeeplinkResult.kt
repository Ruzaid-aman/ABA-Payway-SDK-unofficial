package com.ababank.payway.deeplink

/**
 * Result of deeplink operations.
 */
sealed class DeeplinkResult {

    /**
     * Successful deeplink operation.
     *
     * @property tranId The transaction ID.
     * @property status The payment status.
     * @property apv The approval code (if available).
     * @property returnParams Additional return parameters.
     */
    data class Success(
        val tranId: String,
        val status: String,
        val apv: String?,
        val returnParams: String?
    ) : DeeplinkResult()

    /**
     * User cancelled the payment.
     */
    object Cancelled : DeeplinkResult()

    /**
     * Invalid or unparseable deeplink.
     */
    object Invalid : DeeplinkResult()
}