package com.ababank.payway.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import kotlinx.parcelize.TypeParceler
import kotlinx.serialization.Serializable
import java.math.BigDecimal

/**
 * An item in a purchase transaction.
 *
 * @property name The name of the item.
 * @property quantity The quantity of this item.
 * @property price The unit price of this item.
 */
@Parcelize
@Serializable
@TypeParceler<BigDecimal, BigDecimalParceler>()
data class PaymentItem(
    val name: String,
    val quantity: Int,
    val price: BigDecimal
) : Parcelable