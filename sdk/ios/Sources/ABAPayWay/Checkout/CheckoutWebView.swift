import UIKit
import WebKit

/// Protocol for checkout web view delegate callbacks
public protocol CheckoutWebViewDelegate: AnyObject {
    /// Called when the checkout page finishes loading
    func checkoutWebView(_ webView: CheckoutWebView, didFinishLoading url: URL?)

    /// Called when the checkout page fails to load
    func checkoutWebView(_ webView: CheckoutWebView, didFailWithError error: Error)

    /// Called when navigation should proceed to a new URL
    func checkoutWebView(_ webView: CheckoutWebView, shouldProceedTo url: URL) -> Bool

    /// Called when checkout is completed with a return URL
    func checkoutWebView(_ webView: CheckoutWebView, didCompleteWithReturnUrl url: URL)

    /// Called when checkout is cancelled
    func checkoutWebViewDidCancel(_ webView: CheckoutWebView)
}

/// WebView-based checkout for card payments
public class CheckoutWebView: NSObject {

    /// The web view used to display the checkout page
    public let webView: WKWebView

    /// Delegate for checkout events
    public weak var delegate: CheckoutWebViewDelegate?

    /// The return URL to check for completion
    private var returnUrl: String?

    /// The cancel URL to check for cancellation
    private var cancelUrl: String?

    /// Creates a new checkout web view
    public override init() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        self.webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        self.webView.navigationDelegate = self
    }

    /// Loads the PayWay checkout page
    /// - Parameters:
    ///   - url: The checkout URL
    ///   - returnUrl: The return URL to detect successful payment
    ///   - cancelUrl: The cancel URL to detect cancellation
    public func loadCheckout(url: URL, returnUrl: String?, cancelUrl: String?) {
        self.returnUrl = returnUrl
        self.cancelUrl = cancelUrl

        let request = URLRequest(url: url)
        webView.load(request)
    }

    /// Loads HTML content directly (for embedded checkout)
    /// - Parameters:
    ///   - html: The HTML content
    ///   - baseUrl: The base URL for relative links
    public func loadHTML(_ html: String, baseURL: URL?) {
        webView.loadHTMLString(html, baseURL: baseURL)
    }

    /// Stops loading and cancels any pending requests
    public func stopLoading() {
        webView.stopLoading()
    }

    /// Goes back in the web view history
    public func goBack() {
        webView.goBack()
    }

    /// Goes forward in the web view history
    public func goForward() {
        webView.goForward()
    }

    /// Reloads the current page
    public func reload() {
        webView.reload()
    }
}

// MARK: - WKNavigationDelegate

extension CheckoutWebView: WKNavigationDelegate {

    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Check if this is a return/cancel URL
        if let returnUrl = returnUrl, url.absoluteString.hasPrefix(returnUrl) {
            delegate?.checkoutWebView(self, didCompleteWithReturnUrl: url)
            decisionHandler(.cancel)
            return
        }

        if let cancelUrl = cancelUrl, url.absoluteString.hasPrefix(cancelUrl) {
            delegate?.checkoutWebViewDidCancel(self)
            decisionHandler(.cancel)
            return
        }

        // Ask delegate if we should proceed
        if delegate?.checkoutWebView(self, shouldProceedTo: url) == false {
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        delegate?.checkoutWebView(self, didFinishLoading: webView.url)
    }

    public func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        delegate?.checkoutWebView(self, didFailWithError: error)
    }

    public func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        // Ignore cancelled errors (user navigated away)
        if (error as NSError).code == NSURLErrorCancelled {
            return
        }
        delegate?.checkoutWebView(self, didFailWithError: error)
    }
}