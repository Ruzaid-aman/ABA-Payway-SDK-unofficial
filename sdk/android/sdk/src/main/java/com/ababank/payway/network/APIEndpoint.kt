package com.ababank.payway.network

import com.ababank.payway.config.Environment
import com.ababank.payway.config.PayWayConfig

/**
 * PayWay API endpoints.
 *
 * @property path The API path.
 * @property method The HTTP method.
 * @property contentType The Content-Type header value.
 */
enum class APIEndpoint(
    val path: String,
    val method: String,
    val contentType: String = "application/json"
) {
    // Purchase endpoints
    PURCHASE("/api/payment-gateway/v1/payments/purchase", "POST"),
    GENERATE_QR("/api/payment-gateway/v1/payments/generate-qr", "POST"),

    // Transaction management
    CHECK_TRANSACTION("/api/payment-gateway/v1/payments/check-transaction-2", "POST"),
    CLOSE_TRANSACTION("/api/payment-gateway/v1/payments/close-transaction", "POST"),
    GET_TRANSACTION_DETAIL("/api/payment-gateway/v1/payments/transaction-detail", "POST"),
    GET_TRANSACTION_LIST("/api/payment-gateway/v1/payments/transaction-list-2", "POST"),
    GET_TRANSACTIONS_BY_MC_REF("/api/payment-gateway/v1/payments/get-transactions-by-mc-ref", "POST"),

    // Pre-authorization
    COMPLETE_PRE_AUTH("/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion", "POST"),
    CANCEL_PRE_AUTH("/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation", "POST"),

    // Refund
    REFUND("/api/merchant-portal/merchant-access/online-transaction/refund", "POST"),

    // Exchange rate
    GET_EXCHANGE_RATE("/api/payment-gateway/v1/exchange-rate", "POST"),

    // Payment credential (link account, link card)
    LINK_ACCOUNT("/api/payment-credential/v3/aof/link-account", "POST"),
    LINK_CARD("/api/payment-credential/v3/cof/link-card", "POST"),
    RENEW_TOKEN("/api/payment-credential/v3/token-management/renew-expired-account-token", "POST"),
    GET_TOKEN_DETAILS("/api/payment-credential/v3/token-management/get-token-details", "POST"),
    REMOVE_TOKEN("/api/payment-credential/v3/token-management/remove-token", "POST"),

    // Payment link
    CREATE_PAYMENT_LINK("/api/merchant-portal/merchant-access/payment-link/create", "POST"),
    GET_PAYMENT_LINK_DETAILS("/api/merchant-portal/merchant-access/payment-link/detail", "POST"),

    // Payout
    PAYOUT("/api/payment-gateway/v2/direct-payment/merchant/payout", "POST"),
    ADD_BENEFICIARY("/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout", "POST"),
    UPDATE_BENEFICIARY_STATUS("/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status", "POST");

    /**
     * Returns the full URL for this endpoint in the given environment.
     */
    fun url(environment: Environment): String = environment.baseUrl + path

    companion object {
        /**
         * Returns the full URL for a given environment and endpoint.
         */
        fun url(environment: Environment, endpoint: APIEndpoint): String =
            endpoint.url(environment)
    }
}