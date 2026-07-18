package com.ababank.payway.network

import com.ababank.payway.config.PayWayConfig
import com.ababank.payway.error.PayWayError
import com.ababank.payway.model.Currency
import com.ababank.payway.model.QRResponse
import com.ababank.payway.model.SignedPayload
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.math.BigDecimal
import java.util.concurrent.TimeUnit

/**
 * PayWay API client for making network requests.
 *
 * This client handles:
 * - Calling the merchant backend to get signed payloads
 * - Submitting purchases to PayWay
 * - Checking transaction status
 * - Closing transactions
 *
 * @property config The PayWay configuration.
 */
class PayWayAPIClient(private val config: PayWayConfig) {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * Requests a signed payload from the merchant backend.
     *
     * The SDK calls the merchant backend (not PayWay directly) to get the
     * HMAC-signed payload. This keeps the API key on the backend.
     *
     * @param transactionId The unique transaction ID.
     * @param amount The payment amount.
     * @param currency The payment currency.
     * @param paymentOption The selected payment option.
     * @param firstname Optional customer first name.
     * @param lastname Optional customer last name.
     * @param email Optional customer email.
     * @param phone Optional customer phone.
     * @param returnUrl Optional return URL.
     * @param cancelUrl Optional cancel URL.
     * @param returnDeeplink Optional deeplink config as JSON string.
     * @param returnParams Optional return parameters.
     * @param items Optional items as JSON string.
     * @param lifetime Optional QR lifetime in seconds.
     * @return SignedPayload containing the hash and form fields.
     * @throws PayWayError If the request fails.
     */
    suspend fun requestSigning(
        transactionId: String,
        amount: BigDecimal,
        currency: Currency,
        paymentOption: String,
        firstname: String? = null,
        lastname: String? = null,
        email: String? = null,
        phone: String? = null,
        returnUrl: String? = null,
        cancelUrl: String? = null,
        returnDeeplink: String? = null,
        returnParams: String? = null,
        items: String? = null,
        lifetime: Int? = null
    ): SignedPayload = withContext(Dispatchers.IO) {
        try {
            val requestBody = buildMap<String, Any?> {
                put("transaction_id", transactionId)
                put("amount", amount.toPlainString())
                put("currency", currency.code)
                put("payment_option", paymentOption)
                firstname?.let { put("firstname", it) }
                lastname?.let { put("lastname", it) }
                email?.let { put("email", it) }
                phone?.let { put("phone", it) }
                returnUrl?.let { put("return_url", it) }
                cancelUrl?.let { put("cancel_url", it) }
                returnDeeplink?.let { put("return_deeplink", it) }
                returnParams?.let { put("return_params", it) }
                items?.let { put("items", it) }
                lifetime?.let { put("lifetime", it) }
            }

            val request = Request.Builder()
                .url(config.backendUrl)
                .post(gson.toJson(requestBody).toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw PayWayError.Network(Exception("Empty response"))

            if (!response.isSuccessful) {
                throw PayWayError.Network(Exception("HTTP ${response.code}: $responseBody"))
            }

            val json = gson.fromJson(responseBody, JsonObject::class.java)

            // Parse the response from merchant backend
            val payloadMap = mutableMapOf<String, String>()
            json.getAsJsonObject("payload")?.let { payload ->
                payload.entrySet().forEach { (key, value) ->
                    payloadMap[key] = value.asString
                }
            }

            SignedPayload(
                payload = payloadMap,
                hash = json.get("hash")?.asString ?: "",
                reqTime = json.get("req_time")?.asString ?: "",
                merchantId = json.get("merchant_id")?.asString ?: config.merchantId
            )
        } catch (e: PayWayError) {
            throw e
        } catch (e: Exception) {
            throw PayWayError.Network(e)
        }
    }

    /**
     * Submits a purchase to PayWay and returns the QR response.
     *
     * @param signedPayload The signed payload from the merchant backend.
     * @return QRResponse containing QR string, image, and deeplink.
     * @throws PayWayError If the request fails.
     */
    suspend fun submitPurchase(signedPayload: SignedPayload): QRResponse = withContext(Dispatchers.IO) {
        try {
            val requestBody = gson.toJson(signedPayload.payload)

            val request = Request.Builder()
                .url(APIEndpoint.PURCHASE.url(config.environment))
                .post(requestBody.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw PayWayError.Network(Exception("Empty response"))

            if (!response.isSuccessful) {
                // Try to parse error response
                val errorJson = gson.fromJson(responseBody, JsonObject::class.java)
                val status = errorJson.getAsJsonObject("status")
                val code = status?.get("code")?.asString ?: "UNKNOWN"
                val message = status?.get("message")?.asString ?: "Unknown error"
                throw PayWayError.PaywayApi(code, message)
            }

            // Parse successful QR response
            val json = gson.fromJson(responseBody, JsonObject::class.java)
            QRResponse(
                qrString = json.get("qr_string")?.asString,
                qrImage = json.get("qr_image")?.asString,
                abapayDeeplink = json.get("abapay_deeplink")?.asString,
                checkoutQrUrl = json.get("checkout_qr_url")?.asString,
                amount = json.get("amount")?.asBigDecimal,
                currency = json.get("currency")?.asString?.let { Currency.fromCode(it) }
            )
        } catch (e: PayWayError) {
            throw e
        } catch (e: Exception) {
            throw PayWayError.Network(e)
        }
    }

    /**
     * Checks the status of a transaction.
     *
     * @param transactionId The transaction ID to check.
     * @param hash The HMAC hash (from signed payload).
     * @param reqTime The request time (from signed payload).
     * @return The check transaction response as a JsonObject.
     * @throws PayWayError If the request fails.
     */
    suspend fun checkTransaction(
        transactionId: String,
        hash: String,
        reqTime: String
    ): JsonObject = withContext(Dispatchers.IO) {
        try {
            val requestBody = buildMap<String, String> {
                put("merchant_id", config.merchantId)
                put("tran_id", transactionId)
                put("req_time", reqTime)
                put("hash", hash)
            }

            val request = Request.Builder()
                .url(APIEndpoint.CHECK_TRANSACTION.url(config.environment))
                .post(gson.toJson(requestBody).toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw PayWayError.Network(Exception("Empty response"))

            if (!response.isSuccessful) {
                val errorJson = gson.fromJson(responseBody, JsonObject::class.java)
                val status = errorJson.getAsJsonObject("status")
                val code = status?.get("code")?.asString ?: "UNKNOWN"
                val message = status?.get("message")?.asString ?: "Unknown error"
                throw PayWayError.PaywayApi(code, message)
            }

            gson.fromJson(responseBody, JsonObject::class.java)
        } catch (e: PayWayError) {
            throw e
        } catch (e: Exception) {
            throw PayWayError.Network(e)
        }
    }

    /**
     * Closes/cancels a pending transaction.
     *
     * @param transactionId The transaction ID to close.
     * @param hash The HMAC hash (from signed payload).
     * @param reqTime The request time (from signed payload).
     * @return The close transaction response as a JsonObject.
     * @throws PayWayError If the request fails.
     */
    suspend fun closeTransaction(
        transactionId: String,
        hash: String,
        reqTime: String
    ): JsonObject = withContext(Dispatchers.IO) {
        try {
            val requestBody = buildMap<String, String> {
                put("merchant_id", config.merchantId)
                put("tran_id", transactionId)
                put("req_time", reqTime)
                put("hash", hash)
            }

            val request = Request.Builder()
                .url(APIEndpoint.CLOSE_TRANSACTION.url(config.environment))
                .post(gson.toJson(requestBody).toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw PayWayError.Network(Exception("Empty response"))

            if (!response.isSuccessful) {
                val errorJson = gson.fromJson(responseBody, JsonObject::class.java)
                val status = errorJson.getAsJsonObject("status")
                val code = status?.get("code")?.asString ?: "UNKNOWN"
                val message = status?.get("message")?.asString ?: "Unknown error"
                throw PayWayError.PaywayApi(code, message)
            }

            gson.fromJson(responseBody, JsonObject::class.java)
        } catch (e: PayWayError) {
            throw e
        } catch (e: Exception) {
            throw PayWayError.Network(e)
        }
    }
}