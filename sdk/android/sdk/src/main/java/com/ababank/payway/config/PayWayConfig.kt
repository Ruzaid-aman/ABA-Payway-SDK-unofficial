package com.ababank.payway.config

/**
 * Configuration for the PayWay SDK.
 *
 * @property merchantId The merchant ID issued by ABA Bank.
 * @property backendUrl The merchant's backend URL that provides signed payloads.
 *                      The SDK calls this URL to get the hash and payload for PayWay requests.
 * @property environment The PayWay environment (SANDBOX or PRODUCTION).
 *
 * NOTE: The API key is NOT stored in this config. The SDK calls the merchant backend
 * to get signed payloads. The backend holds the API key and computes the HMAC-SHA512 hash.
 */
data class PayWayConfig(
    val merchantId: String,
    val backendUrl: String,
    val environment: Environment
)