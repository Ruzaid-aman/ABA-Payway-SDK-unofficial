package com.ababank.payway.model

import android.os.Parcel
import kotlinx.parcelize.Parceler
import java.math.BigDecimal

/**
 * Parceler for java.math.BigDecimal.
 *
 * kotlinx.parcelize does not support BigDecimal natively.
 * This parceler stores the string representation and restores it.
 */
object BigDecimalParceler : Parceler<BigDecimal> {
    override fun createFromParcel(parcel: Parcel): BigDecimal {
        return BigDecimal(parcel.readString())
    }

    override fun newArray(size: Int): Array<BigDecimal?> {
        return arrayOfNulls(size)
    }

    override fun BigDecimal.writeToParcel(parcel: Parcel, flags: Int) {
        parcel.writeString(toPlainString())
    }
}
