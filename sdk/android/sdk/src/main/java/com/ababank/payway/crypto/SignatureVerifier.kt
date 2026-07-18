package com.ababank.payway.crypto

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Utility object for verifying PayWay callback signatures.
 *
 * This is used by the merchant backend to verify that callbacks originate from PayWay.
 * The SDK does not hold the API key; this is for server-side use.
 *
 * Algorithm:
 * 1. Sort response keys alphabetically
 * 2. Concatenate all values (JSON-encode any array/object values)
 * 3. Compute HMAC-SHA512 using the API key
 * 4. Compare with timing-safe comparison
 */
object SignatureVerifier {

    private const val HMAC_ALGORITHM = "HmacSHA512"
    private const val HASH_ENCODING = "base64"

    /**
     * Verifies a PayWay callback signature.
     *
     * @param body The callback body as a map of key-value pairs.
     * @param signature The signature to verify (from x-payway-hmac-sha512 header).
     * @param apiKey The merchant's API key (from PayWay dashboard).
     * @return True if the signature is valid, false otherwise.
     */
    fun verifyCallbackSignature(
        body: Map<String, Any?>,
        signature: String,
        apiKey: String
    ): Boolean {
        val concatenated = buildSignatureString(body)
        val computedSignature = computeHmac(concatenated, apiKey)
        return timingSafeEqual(computedSignature, signature)
    }

    /**
     * Builds the concatenated string for signature computation.
     * Keys are sorted alphabetically, and values are JSON-encoded if they are maps or arrays.
     */
    private fun buildSignatureString(body: Map<String, Any?>): String {
        return body.keys.sorted()
            .joinToString("") { key ->
                val value = body[key]
                when {
                    value == null -> ""
                    value is Map<*, *> -> JSONObject(value).toString()
                    value is List<*> -> JSONArray(value.toList()).toString()
                    else -> value.toString()
                }
            }
    }

    /**
     * Computes HMAC-SHA512 and returns base64-encoded result.
     */
    private fun computeHmac(data: String, key: String): String {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        val secretKeySpec = SecretKeySpec(key.toByteArray(Charsets.UTF_8), HMAC_ALGORITHM)
        mac.init(secretKeySpec)
        val hmacBytes = mac.doFinal(data.toByteArray(Charsets.UTF_8))
        return android.util.Base64.encodeToString(hmacBytes, android.util.Base64.NO_WRAP)
    }

    /**
     * Performs timing-safe string comparison to prevent timing attacks.
     */
    private fun timingSafeEqual(a: String, b: String): Boolean {
        if (a.length != b.length) {
            return false
        }
        var result = 0
        for (i in a.indices) {
            result = result or (a[i].code xor b[i].code)
        }
        return result == 0
    }

    /**
     * Generates a hash for purchase request (used by merchant backend).
     *
     * @param payload The request payload.
     * @param fieldList The ordered list of fields to include in hash.
     * @param apiKey The merchant API key.
     * @return Base64-encoded HMAC-SHA512 hash.
     */
    fun generatePurchaseHash(
        payload: Map<String, String>,
        fieldList: List<String>,
        apiKey: String
    ): String {
        val concatenated = fieldList
            .map { field -> payload[field] ?: "" }
            .joinToString("")
        return computeHmac(concatenated, apiKey)
    }
}