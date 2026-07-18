package com.ababank.payway.model

/**
 * Signed payload returned by the merchant backend.
 *
 * The merchant backend computes the HMAC-SHA512 hash and returns:
 * - payload: The form fields to submit to PayWay
 * - hash: The HMAC-SHA512 signature
 * - reqTime: The request timestamp
 * - merchantId: The merchant ID
 */
data class SignedPayload(
    val payload: Map<String, String>,
    val hash: String,
    val reqTime: String,
    val merchantId: String
)