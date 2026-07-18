package com.ababank.payway.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.ababank.payway.R

/**
 * Activity that hosts the PaymentSheetFragment as a bottom sheet.
 * This is the entry point for the SDK's payment UI.
 */
class PaymentSheetActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_payment_sheet)

        if (savedInstanceState == null) {
            val fragment = PaymentSheetFragment()
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragmentContainer, fragment)
                .commit()
        }
    }
}