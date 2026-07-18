package com.ababank.payway.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.util.AttributeSet
import android.util.Base64
import android.view.LayoutInflater
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import com.ababank.payway.R
import com.ababank.payway.model.Currency
import com.ababank.payway.network.PayWayAPIClient
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Custom view for displaying QR code with amount and countdown timer.
 *
 * Supports TEMPLATE1/2/3 styling variants and auto-polling for payment status.
 *
 * @property qrString The raw KHQR string to encode.
 * @property qrImage Base64-encoded QR image (alternative to qrString).
 * @property amount The payment amount to display.
 * @property currency The payment currency.
 * @property lifetime QR code lifetime in seconds (for countdown).
 */
class QRDisplayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val qrImageView: ImageView
    private val amountText: TextView
    private val currencyText: TextView
    private val timerText: TextView
    private val statusText: TextView

    private var qrString: String? = null
    private var qrImage: String? = null
    private var amount: BigDecimal = BigDecimal.ZERO
    private var currency: Currency = Currency.USD
    private var lifetime: Int = 300

    private var countDownTimer: Job? = null
    private var pollingJob: Job? = null
    private var onPaymentCompleteListener: ((String) -> Unit)? = null
    private var apiClient: PayWayAPIClient? = null
    private var transactionId: String? = null
    private var hash: String? = null
    private var reqTime: String? = null

    init {
        LayoutInflater.from(context).inflate(R.layout.view_qr_display, this, true)

        qrImageView = findViewById(R.id.qrImageView)
        amountText = findViewById(R.id.amountText)
        currencyText = findViewById(R.id.currencyText)
        timerText = findViewById(R.id.timerText)
        statusText = findViewById(R.id.statusText)
    }

    /**
     * Sets the QR string to display.
     */
    fun setQRString(qrString: String) {
        this.qrString = qrString
        generateAndDisplayQR(qrString)
    }

    /**
     * Sets a pre-generated QR image (Base64-encoded).
     */
    fun setQRImage(base64Image: String) {
        this.qrImage = base64Image
        displayBase64Image(base64Image)
    }

    /**
     * Sets the payment amount to display.
     */
    fun setAmount(amount: BigDecimal) {
        this.amount = amount
        updateAmountDisplay()
    }

    /**
     * Sets the payment currency.
     */
    fun setCurrency(currency: Currency) {
        this.currency = currency
        updateAmountDisplay()
    }

    /**
     * Sets the QR code lifetime for countdown display.
     */
    fun setLifetime(seconds: Int) {
        this.lifetime = seconds
        startCountdown(seconds)
    }

    /**
     * Sets the listener for payment completion.
     */
    fun setOnPaymentCompleteListener(listener: (String) -> Unit) {
        this.onPaymentCompleteListener = listener
    }

    /**
     * Starts polling for payment status.
     *
     * @param transactionId The transaction ID to check.
     * @param hash The HMAC hash.
     * @param reqTime The request time.
     * @param apiClient The API client to use.
     * @param intervalMs Polling interval in milliseconds (default 3000).
     */
    fun startPolling(
        transactionId: String,
        hash: String,
        reqTime: String,
        apiClient: PayWayAPIClient,
        intervalMs: Long = 3000L
    ) {
        this.transactionId = transactionId
        this.hash = hash
        this.reqTime = reqTime
        this.apiClient = apiClient

        pollingJob?.cancel()
        pollingJob = CoroutineScope(Dispatchers.Main).launch {
            while (true) {
                delay(intervalMs)
                checkPaymentStatus()
            }
        }
    }

    /**
     * Stops all timers and polling.
     */
    fun stopPolling() {
        countDownTimer?.cancel()
        pollingJob?.cancel()
    }

    private fun generateAndDisplayQR(data: String) {
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val size = 512
                val hints = mapOf(
                    EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.H,
                    EncodeHintType.MARGIN to 1
                )

                val bitMatrix = QRCodeWriter().encode(
                    data,
                    BarcodeFormat.QR_CODE,
                    size,
                    size,
                    hints
                )

                val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
                for (x in 0 until size) {
                    for (y in 0 until size) {
                        bitmap.setPixel(
                            x, y,
                            if (bitMatrix[x, y]) Color.BLACK else Color.WHITE
                        )
                    }
                }

                withContext(Dispatchers.Main) {
                    qrImageView.setImageBitmap(bitmap)
                }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    private fun displayBase64Image(base64: String) {
        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            qrImageView.setImageBitmap(bitmap)
        } catch (e: Exception) {
            // Handle error
        }
    }

    private fun updateAmountDisplay() {
        val formattedAmount = amount.setScale(2, RoundingMode.HALF_UP).toPlainString()
        amountText.text = formattedAmount
        currencyText.text = currency.code
    }

    private fun startCountdown(seconds: Int) {
        countDownTimer?.cancel()
        countDownTimer = CoroutineScope(Dispatchers.Main).launch {
            var remaining = seconds
            while (remaining > 0) {
                timerText.text = formatTime(remaining)
                delay(1000)
                remaining--
            }
            timerText.text = "Expired"
            onPaymentCompleteListener?.invoke("EXPIRED")
        }
    }

    private fun formatTime(seconds: Int): String {
        val minutes = seconds / 60
        val secs = seconds % 60
        return String.format("%02d:%02d", minutes, secs)
    }

    private suspend fun checkPaymentStatus() {
        val tranId = transactionId ?: return
        val h = hash ?: return
        val req = reqTime ?: return
        val client = apiClient ?: return

        try {
            val response = client.checkTransaction(tranId, h, req)
            val data = response.getAsJsonObject("data")
            val status = data?.get("payment_status")?.asString

            withContext(Dispatchers.Main) {
                statusText.text = status ?: "Checking..."

                when (status) {
                    "APPROVED" -> {
                        statusText.setTextColor(Color.parseColor("#4CAF50"))
                        onPaymentCompleteListener?.invoke("APPROVED")
                        stopPolling()
                    }
                    "PENDING" -> {
                        statusText.setTextColor(Color.parseColor("#FF9800"))
                    }
                    "DECLINED", "CANCELLED", "REFUNDED" -> {
                        statusText.setTextColor(Color.parseColor("#F44336"))
                        onPaymentCompleteListener?.invoke(status)
                        stopPolling()
                    }
                }
            }
        } catch (e: Exception) {
            // Continue polling on error
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopPolling()
    }
}