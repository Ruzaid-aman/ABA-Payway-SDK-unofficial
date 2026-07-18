package com.ababank.payway.config

/**
 * PayWay API environments.
 */
enum class Environment(val baseUrl: String) {
    SANDBOX("https://checkout-sandbox.payway.com.kh"),
    PRODUCTION("https://checkout.payway.com.kh")
}