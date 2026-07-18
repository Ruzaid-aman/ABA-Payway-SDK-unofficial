package com.ababank.payway.checkout

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.fragment.app.Fragment
import com.ababank.payway.R
import com.google.android.material.progressindicator.LinearProgressIndicator

/**
 * Fragment for displaying PayWay checkout in a WebView.
 *
 * This fragment loads the PayWay checkout URL and handles:
 * - Navigation to return_url on success
 * - Navigation to cancel_url on cancellation
 * - Loading progress indication
 * - JavaScript interface for communication
 */
class CheckoutWebViewFragment : Fragment() {

    private lateinit var webView: WebView
    private lateinit var progressIndicator: LinearProgressIndicator

    private var checkoutUrl: String? = null
    private var returnUrl: String? = null
    private var cancelUrl: String? = null
    private var listener: CheckoutListener? = null

    interface CheckoutListener {
        fun onCheckoutSuccess(returnData: Map<String, String>)
        fun onCheckoutCancelled()
        fun onCheckoutError(message: String)
        fun onCheckoutLoading(isLoading: Boolean)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        arguments?.let {
            checkoutUrl = it.getString(ARG_CHECKOUT_URL)
            returnUrl = it.getString(ARG_RETURN_URL)
            cancelUrl = it.getString(ARG_CANCEL_URL)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_checkout_webview, container, false)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        webView = view.findViewById(R.id.checkoutWebView)
        progressIndicator = view.findViewById(R.id.progressIndicator)

        setupWebView()
        loadCheckout()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressIndicator.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
                progressIndicator.progress = newProgress
                listener?.onCheckoutLoading(newProgress < 100)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                url: String?
            ): Boolean {
                url ?: return false

                // Check if we've reached the return URL
                if (returnUrl != null && url.startsWith(returnUrl!!)) {
                    parseReturnUrl(url)
                    return true
                }

                // Check if we've reached the cancel URL
                if (cancelUrl != null && url.startsWith(cancelUrl!!)) {
                    listener?.onCheckoutCancelled()
                    return true
                }

                // Let WebView handle all other URLs
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                listener?.onCheckoutLoading(false)
            }
        }
    }

    private fun loadCheckout() {
        val url = checkoutUrl
        if (url.isNullOrEmpty()) {
            listener?.onCheckoutError("No checkout URL provided")
            return
        }

        listener?.onCheckoutLoading(true)
        webView.loadUrl(url)
    }

    private fun parseReturnUrl(url: String) {
        try {
            val uri = android.net.Uri.parse(url)
            val params = mutableMapOf<String, String>()

            uri.queryParameterNames.forEach { name ->
                params[name] = uri.getQueryParameter(name) ?: ""
            }

            listener?.onCheckoutSuccess(params)
        } catch (e: Exception) {
            listener?.onCheckoutError("Failed to parse return URL: ${e.message}")
        }
    }

    /**
     * Loads the checkout form with POST data.
     */
    fun postCheckout(formData: Map<String, String>) {
        val url = checkoutUrl ?: return

        val postData = formData.entries
            .joinToString("&") { (key, value) ->
                "${java.net.URLEncoder.encode(key, "UTF-8")}=${java.net.URLEncoder.encode(value, "UTF-8")}"
            }
            .toByteArray(Charsets.UTF_8)

        webView.postUrl(url, postData)
    }

    /**
     * Goes back in the WebView history.
     */
    fun goBack(): Boolean {
        return if (webView.canGoBack()) {
            webView.goBack()
            true
        } else {
            false
        }
    }

    /**
     * Refreshes the current page.
     */
    fun refresh() {
        webView.reload()
    }

    override fun onDestroyView() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroyView()
    }

    companion object {
        private const val ARG_CHECKOUT_URL = "checkout_url"
        private const val ARG_RETURN_URL = "return_url"
        private const val ARG_CANCEL_URL = "cancel_url"

        fun newInstance(
            checkoutUrl: String,
            returnUrl: String?,
            cancelUrl: String?
        ): CheckoutWebViewFragment {
            return CheckoutWebViewFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_CHECKOUT_URL, checkoutUrl)
                    putString(ARG_RETURN_URL, returnUrl)
                    putString(ARG_CANCEL_URL, cancelUrl)
                }
            }
        }
    }
}