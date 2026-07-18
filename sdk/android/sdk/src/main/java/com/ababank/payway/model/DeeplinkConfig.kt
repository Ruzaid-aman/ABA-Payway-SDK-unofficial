package com.ababank.payway.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * Configuration for deeplink return after payment.
 *
 * @property androidScheme The Android deeplink scheme (e.g., "yourapp://payway/callback").
 * @property iosScheme The iOS deeplink scheme (e.g., "yourapp://payway/callback").
 */
@Parcelize
data class DeeplinkConfig(
    val androidScheme: String,
    val iosScheme: String
) : Parcelable