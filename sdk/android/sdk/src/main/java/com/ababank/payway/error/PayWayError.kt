package com.ababank.payway.error

/**
 * Errors that can occur during PayWay operations.
 */
sealed class PayWayError(message: String) : Exception(message) {

    /**
     * Network error occurred.
     */
    class Network(val cause: Throwable) : PayWayError("Network error: ${cause.message}")

    /**
     * PayWay API returned an error.
     *
     * @property code The error code from PayWay.
     * @property message The error message from PayWay.
     */
    class PaywayApi(val code: String, override val message: String) : PayWayError("PayWay $code: $message")

    /**
     * Failed to compute HMAC signature.
     */
    object SigningFailed : PayWayError("Signing failed")

    /**
     * Invalid configuration provided.
     */
    object InvalidConfig : PayWayError("Invalid configuration")

    /**
     * Failed to open deeplink.
     *
     * @property reason The reason for failure.
     */
    class DeeplinkFailed(val reason: String) : PayWayError("Deeplink failed: $reason")

    /**
     * Signature verification failed.
     */
    object VerificationFailed : PayWayError("Signature verification failed")

    /**
     * Payment was cancelled by the user.
     */
    object Cancelled : PayWayError("Payment cancelled")

    /**
     * Unknown error occurred.
     *
     * @property detail Additional details about the error.
     */
    class Unknown(val detail: String) : PayWayError("Unknown: $detail")
}