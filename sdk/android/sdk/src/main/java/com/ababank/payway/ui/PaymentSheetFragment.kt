package com.ababank.payway.ui

import android.app.Dialog
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.CountDownTimer
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ababank.payway.R
import com.ababank.payway.model.PaymentOption
import com.ababank.payway.model.PaymentResult
import com.ababank.payway.model.PaymentSheetConfig
import com.ababank.payway.model.QRResponse
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.button.MaterialButton
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.math.BigDecimal

/**
 * Bottom sheet dialog for presenting payment options and processing payments.
 *
 * This fragment handles:
 * - Displaying the payment amount and currency
 * - Showing available payment options
 * - Processing the selected payment option
 * - Handling loading, error, and success states
 */
class PaymentSheetFragment : BottomSheetDialogFragment() {

    private var config: PaymentSheetConfig? = null
    private var callback: PaymentSheetCallback? = null
    private var apiClient: com.ababank.payway.network.PayWayAPIClient? = null

    private lateinit var amountText: TextView
    private lateinit var currencyText: TextView
    private lateinit var optionsRecyclerView: RecyclerView
    private lateinit var payButton: MaterialButton
    private lateinit var cancelButton: MaterialButton
    private lateinit var progressBar: ProgressBar
    private lateinit var errorText: TextView
    private lateinit var qrDisplayView: QRDisplayView

    private var selectedOption: PaymentOption? = null
    private var qrResponse: QRResponse? = null
    private var currentJob: Job? = null

    interface PaymentSheetCallback {
        fun onPaymentSuccess(result: PaymentResult.Success)
        fun onPaymentFailure(error: PaymentResult.Failure)
        fun onPaymentCancelled()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.payment_sheet, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        amountText = view.findViewById(R.id.amountText)
        currencyText = view.findViewById(R.id.currencyText)
        optionsRecyclerView = view.findViewById(R.id.optionsRecyclerView)
        payButton = view.findViewById(R.id.payButton)
        cancelButton = view.findViewById(R.id.cancelButton)
        progressBar = view.findViewById(R.id.progressBar)
        errorText = view.findViewById(R.id.errorText)
        qrDisplayView = view.findViewById(R.id.qrDisplayView)

        setupUI()
        setupRecyclerView()
        setupClickListeners()
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val dialog = super.onCreateDialog(savedInstanceState) as BottomSheetDialog
        dialog.setOnShowListener {
            val bottomSheet = dialog.findViewById<FrameLayout>(
                com.google.android.material.R.id.design_bottom_sheet
            )
            bottomSheet?.let {
                val behavior = BottomSheetBehavior.from(it)
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
                behavior.skipCollapsed = true
            }
        }
        return dialog
    }

    private fun setupUI() {
        config?.let { cfg ->
            amountText.text = formatAmount(cfg.amount)
            currencyText.text = cfg.currency.code
        }
    }

    private fun setupRecyclerView() {
        optionsRecyclerView.layoutManager = LinearLayoutManager(requireContext())
        optionsRecyclerView.adapter = PaymentOptionAdapter(
            config?.paymentOptions ?: emptyList()
        ) { option ->
            selectedOption = option
        }
    }

    private fun setupClickListeners() {
        payButton.setOnClickListener {
            processPayment()
        }

        cancelButton.setOnClickListener {
            callback?.onPaymentCancelled()
            dismiss()
        }
    }

    private fun processPayment() {
        val option = selectedOption ?: run {
            showError("Please select a payment option")
            return
        }

        val cfg = config ?: return

        showLoading(true)
        hideError()

        currentJob = CoroutineScope(Dispatchers.Main).launch {
            try {
                // Step 1: Request signing from merchant backend
                val signedPayload = apiClient?.requestSigning(
                    transactionId = cfg.transactionId,
                    amount = cfg.amount,
                    currency = cfg.currency,
                    paymentOption = option.value,
                    firstname = cfg.firstname,
                    lastname = cfg.lastname,
                    email = cfg.email,
                    phone = cfg.phone,
                    returnUrl = cfg.returnUrl,
                    cancelUrl = cfg.cancelUrl,
                    returnDeeplink = serializeDeeplinkConfig(cfg.returnDeeplink),
                    lifetime = cfg.lifetime
                ) ?: throw Exception("API client not configured")

                // Step 2: Submit purchase to PayWay
                val response = apiClient?.submitPurchase(signedPayload)
                    ?: throw Exception("API client not configured")

                qrResponse = response

                // Step 3: For deeplink options, open ABA Mobile
                if (option == PaymentOption.ABA_KHQR_DEEPLINK && response.abapayDeeplink != null) {
                    showQRCode(response)
                } else if (response.qrString != null || response.qrImage != null) {
                    showQRCode(response)
                } else {
                    throw Exception("No QR data received")
                }

            } catch (e: Exception) {
                showError(e.message ?: "Payment failed")
                showLoading(false)
            }
        }
    }

    private fun showQRCode(response: QRResponse) {
        showLoading(false)
        qrDisplayView.visibility = View.VISIBLE
        optionsRecyclerView.visibility = View.GONE

        response.qrString?.let { qrDisplayView.setQRString(it) }
        response.qrImage?.let { qrDisplayView.setQRImage(it) }
        qrDisplayView.setAmount(response.amount ?: config?.amount ?: BigDecimal.ZERO)
        qrDisplayView.setCurrency(response.currency ?: config?.currency
            ?: com.ababank.payway.model.Currency.USD)

        qrDisplayView.setOnPaymentCompleteListener { status ->
            when (status) {
                "APPROVED" -> {
                    callback?.onPaymentSuccess(
                        PaymentResult.Success(
                            tranId = config?.transactionId ?: "",
                            amount = config?.amount ?: BigDecimal.ZERO,
                            currency = config?.currency ?: com.ababank.payway.model.Currency.USD,
                            paymentStatus = com.ababank.payway.model.TransactionStatus.APPROVED,
                            apv = null,
                            transactionDate = null
                        )
                    )
                    dismiss()
                }
                "PENDING" -> {
                    // Continue polling
                }
                else -> {
                    callback?.onPaymentFailure(
                        PaymentResult.Failure(
                            tranId = config?.transactionId ?: "",
                            code = "PAYMENT_FAILED",
                            message = "Payment status: $status"
                        )
                    )
                    dismiss()
                }
            }
        }

        // Start polling for payment status
        qrDisplayView.startPolling(
            transactionId = config?.transactionId ?: "",
            hash = qrResponse?.let { "" } ?: "",
            reqTime = qrResponse?.let { "" } ?: "",
            apiClient = apiClient
        )
    }

    private fun showLoading(show: Boolean) {
        progressBar.visibility = if (show) View.VISIBLE else View.GONE
        payButton.isEnabled = !show
        cancelButton.isEnabled = !show
    }

    private fun showError(message: String) {
        errorText.text = message
        errorText.visibility = View.VISIBLE
    }

    private fun hideError() {
        errorText.visibility = View.GONE
    }

    private fun formatAmount(amount: BigDecimal): String {
        return String.format("%.2f", amount)
    }

    private fun serializeDeeplinkConfig(config: com.ababank.payway.model.DeeplinkConfig): String {
        return """{"android_scheme":"${config.androidScheme}","ios_scheme":"${config.iosScheme}"}"""
    }

    override fun onDestroyView() {
        currentJob?.cancel()
        super.onDestroyView()
    }

    companion object {
        const val TAG = "PaymentSheetFragment"

        fun newInstance(
            config: PaymentSheetConfig,
            callback: PaymentSheetCallback,
            apiClient: com.ababank.payway.network.PayWayAPIClient
        ): PaymentSheetFragment {
            return PaymentSheetFragment().apply {
                this.config = config
                this.callback = callback
                this.apiClient = apiClient
            }
        }
    }
}