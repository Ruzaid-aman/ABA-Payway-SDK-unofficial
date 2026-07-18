package com.ababank.payway.deeplink

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.ababank.payway.ABAPayWay

/**
 * Activity that intercepts deep links from ABA Mobile return.
 * Pattern: yourapp://payway/callback?tran_id=...&status=...&apv=...
 */
class DeeplinkInterceptorActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uri = intent?.data
        if (uri != null) {
            val result = ABAPayWay.handleDeeplink(uri)
            // Result is delivered via ABAPayWay callback
        }

        finish()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        this.intent = intent
    }
}