package com.ababank.payway.model

import kotlinx.serialization.Serializable

/**
 * Supported currencies for PayWay transactions.
 */
@Serializable
enum class Currency(val code: String) {
    USD("USD"),
    KHR("KHR");

    companion object {
        fun fromCode(code: String): Currency? = entries.find { it.code == code }
    }
}