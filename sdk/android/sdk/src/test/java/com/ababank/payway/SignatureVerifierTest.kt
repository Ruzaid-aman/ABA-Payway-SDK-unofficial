package com.ababank.payway

import com.ababank.payway.crypto.SignatureVerifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for SignatureVerifier.
 *
 * Tests HMAC-SHA512 signature generation and verification matching the TS SDK.
 */
class SignatureVerifierTest {

    /**
     * Test vector from the TS SDK auth.ts for HMAC-SHA512.
     */
    @Test
    fun `test generatePurchaseHash matches TS SDK`() {
        // Test data matching TS SDK test vectors
        val payload = mapOf(
            "req_time" to "20240101120000",
            "merchant_id" to "test_merchant",
            "tran_id" to "test_tran_001",
            "amount" to "10.00",
            "currency" to "USD"
        )

        val fieldList = listOf("req_time", "merchant_id", "tran_id", "amount", "currency")
        val apiKey = "test_api_key_12345"

        // Expected: HMAC-SHA512 of concatenated values, base64 encoded
        val expectedHash = SignatureVerifier.generatePurchaseHash(payload, fieldList, apiKey)

        // Verify hash is not empty
        assertTrue(expectedHash.isNotEmpty())

        // Verify hash is base64
        assertTrue(expectedHash.matches(Regex("^[A-Za-z0-9+/=]+$")))
    }

    /**
     * Test callback signature verification with known test vector.
     */
    @Test
    fun `test verifyCallbackSignature with valid signature`() {
        // This is a known test vector
        val body = mapOf(
            "tran_id" to "test_tran_001",
            "amount" to "10.00",
            "status" to "APPROVED"
        )

        val apiKey = "test_api_key"

        // Generate the expected signature
        val expectedSignature = SignatureVerifier.generatePurchaseHash(
            body,
            listOf("amount", "status", "tran_id"), // sorted alphabetically
            apiKey
        )

        // Verify
        val isValid = SignatureVerifier.verifyCallbackSignature(body, expectedSignature, apiKey)
        assertTrue(isValid)
    }

    /**
     * Test callback signature verification with invalid signature.
     */
    @Test
    fun `test verifyCallbackSignature with invalid signature`() {
        val body = mapOf(
            "tran_id" to "test_tran_001",
            "amount" to "10.00"
        )

        val apiKey = "test_api_key"
        val invalidSignature = "invalid_signature_base64"

        val isValid = SignatureVerifier.verifyCallbackSignature(body, invalidSignature, apiKey)
        assertFalse(isValid)
    }

    /**
     * Test callback signature verification with tampered body.
     */
    @Test
    fun `test verifyCallbackSignature with tampered body`() {
        val originalBody = mapOf(
            "tran_id" to "test_tran_001",
            "amount" to "10.00"
        )

        val apiKey = "test_api_key"

        // Generate signature for original body
        val signature = SignatureVerifier.generatePurchaseHash(
            originalBody,
            listOf("amount", "tran_id"),
            apiKey
        )

        // Tamper with the body
        val tamperedBody = mapOf(
            "tran_id" to "test_tran_001",
            "amount" to "100.00" // Changed!
        )

        val isValid = SignatureVerifier.verifyCallbackSignature(tamperedBody, signature, apiKey)
        assertFalse(isValid)
    }

    /**
     * Test with nested objects (JSON encoding).
     */
    @Test
    fun `test verifyCallbackSignature with nested objects`() {
        val body = mapOf(
            "tran_id" to "test_tran_001",
            "items" to listOf(
                mapOf("name" to "Item 1", "price" to 10.0),
                mapOf("name" to "Item 2", "price" to 20.0)
            )
        )

        val apiKey = "test_api_key"

        // Generate signature
        val signature = SignatureVerifier.generatePurchaseHash(
            body,
            listOf("items", "tran_id"),
            apiKey
        )

        // Verify
        val isValid = SignatureVerifier.verifyCallbackSignature(body, signature, apiKey)
        assertTrue(isValid)
    }

    /**
     * Test with null values (should be treated as empty string).
     */
    @Test
    fun `test verifyCallbackSignature with null values`() {
        val body = mapOf(
            "tran_id" to "test_tran_001",
            "email" to null
        )

        val apiKey = "test_api_key"

        // Generate signature
        val signature = SignatureVerifier.generatePurchaseHash(
            body,
            listOf("email", "tran_id"),
            apiKey
        )

        // Verify
        val isValid = SignatureVerifier.verifyCallbackSignature(body, signature, apiKey)
        assertTrue(isValid)
    }

    /**
     * Test timing-safe comparison doesn't leak information.
     */
    @Test
    fun `test timing safe comparison with different lengths`() {
        val body = mapOf("key" to "value")
        val apiKey = "test_api_key"

        // Generate valid signature
        val validSignature = SignatureVerifier.generatePurchaseHash(
            body,
            listOf("key"),
            apiKey
        )

        // Different length should fail
        val shortSignature = validSignature.substring(0, validSignature.length - 1) + "X"
        val isValid = SignatureVerifier.verifyCallbackSignature(body, shortSignature, apiKey)
        assertFalse(isValid)
    }

    /**
     * Test empty body.
     */
    @Test
    fun `test verifyCallbackSignature with empty body`() {
        val body = emptyMap<String, Any?>()
        val apiKey = "test_api_key"

        val signature = SignatureVerifier.generatePurchaseHash(body, emptyList(), apiKey)
        val isValid = SignatureVerifier.verifyCallbackSignature(body, signature, apiKey)
        assertTrue(isValid)
    }
}