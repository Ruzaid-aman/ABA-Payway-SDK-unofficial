package com.ababank.payway.ui

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.Window
import android.view.WindowManager
import com.ababank.payway.R
import com.ababank.payway.model.Currency
import com.ababank.payway.model.QRResponse
import com.google.android.material.button.MaterialButton
import java.math.BigDecimal

/**
 * Dialog for displaying QR code with amount and currency.
 *
 * Shows the QR code from QRResponse and provides a Cancel button.
 *
 * @property qrResponse The QR response containing the QR data.
 * @property amount The payment amount.
 * @property currency The payment currency.
 */
class QRDisplayDialog(
    context: Context,
    private val qrResponse: QRResponse,
    private val amount: BigDecimal,
    private val currency: Currency
) : Dialog(context) {

    private lateinit var qrDisplayView: QRDisplayView
    private lateinit var cancelButton: MaterialButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)

        window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window?.setLayout(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT
        )

        setContentView(R.layout.dialog_qr_display)

        qrDisplayView = findViewById(R.id.qrDisplayView)
        cancelButton = findViewById(R.id.cancelButton)

        setupQRDisplay()
        setupCancelButton()
    }

    private fun setupQRDisplay() {
        qrResponse.qrString?.let { qrDisplayView.setQRString(it) }
        qrResponse.qrImage?.let { qrDisplayView.setQRImage(it) }
        qrDisplayView.setAmount(amount)
        qrDisplayView.setCurrency(currency)
        qrResponse.qrString?.let {
            // Default 5 minute lifetime
            qrDisplayView.setLifetime(300)
        }
    }

    private fun setupCancelButton() {
        cancelButton.setOnClickListener {
            qrDisplayView.stopPolling()
            dismiss()
        }
    }

    /**
     * Sets the listener for payment completion.
     */
    fun setOnPaymentCompleteListener(listener: (String) -> Unit) {
        qrDisplayView.setOnPaymentCompleteListener(listener)
    }

    /**
     * Starts polling for payment status.
     */
    fun startPolling(
        transactionId: String,
        hash: String,
        reqTime: String,
        apiClient: com.ababank.payway.network.PayWayAPIClient
    ) {
        qrDisplayView.startPolling(transactionId, hash, reqTime, apiClient)
    }
}