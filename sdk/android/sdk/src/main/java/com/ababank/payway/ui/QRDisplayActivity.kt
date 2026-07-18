package com.ababank.payway.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.ababank.payway.R
import com.ababank.payway.model.Currency
import com.ababank.payway.model.QRResponse
import com.google.gson.Gson
import java.math.BigDecimal

/**
 * Activity that hosts the QR display dialog.
 *
 * Intent extras:
 * - EXTRA_QR_RESPONSE: JSON string of QRResponse
 * - EXTRA_AMOUNT: String of BigDecimal amount
 * - EXTRA_CURRENCY: Currency ordinal
 */
class QRDisplayActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_QR_RESPONSE = "qr_response"
        const val EXTRA_AMOUNT = "amount"
        const val EXTRA_CURRENCY = "currency"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_qr_display)

        if (savedInstanceState == null) {
            val qrResponseJson = intent?.getStringExtra(EXTRA_QR_RESPONSE) ?: run { finish(); return }
            val amountStr = intent?.getStringExtra(EXTRA_AMOUNT) ?: run { finish(); return }
            val currencyOrdinal = intent?.getIntExtra(EXTRA_CURRENCY, Currency.USD.ordinal) ?: Currency.USD.ordinal

            val qrResponse = try {
                Gson().fromJson(qrResponseJson, QRResponse::class.java)
            } catch (e: Exception) {
                finish()
                return
            }

            val amount = try {
                BigDecimal(amountStr)
            } catch (e: NumberFormatException) {
                finish()
                return
            }

            val currency = try {
                Currency.entries[currencyOrdinal]
            } catch (e: IndexOutOfBoundsException) {
                Currency.USD
            }

            val dialog = QRDisplayDialog(this, qrResponse, amount, currency)
            dialog.setOnPaymentCompleteListener { status ->
                finish()
            }
            dialog.show()
        }
    }
}