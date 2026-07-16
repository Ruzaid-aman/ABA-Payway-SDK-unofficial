//
// PaymentViewController.swift
// PayWay iOS Integration Example
//
// This view controller loads ABA PayWay's checkout page in a WKWebView,
// captures the return URL redirect, and communicates the payment result
// back to the calling view controller.
//
// See Chapter 4 — Native App Implementation for full documentation.
//

import UIKit
import WebKit

// MARK: - Payment Result Types

enum PaymentResult {
    case success
    case cancelled
    case error(String)
}

extension Notification.Name {
    static let paymentCompleted = Notification.Name("paymentCompleted")
}

// MARK: - Payment View Controller

class PaymentViewController: UIViewController, WKNavigationDelegate {

    // MARK: Properties

    private var webView: WKWebView!
    private var transactionId: String?

    // Configure these URLs for your environment
    private let backendCheckoutURL = "https://your-api.com/api/checkout/create"
    private let backendStatusURL = "https://your-api.com/api/checkout/status"
    private let returnURLPrefix = "https://your-website.com/payment-result"

    // Payment amount (set before presenting this view controller)
    var paymentAmount: Double = 15.00
    var currency: String = "USD"

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        initiateCheckout()
    }

    // MARK: WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // Allow cookies for PayWay's session
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Enable JavaScript (required by PayWay's checkout page)
        let preferences = WKPreferences()
        preferences.javaScriptEnabled = true
        config.preferences = preferences

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
    }

    // MARK: Checkout Initiation

    private func initiateCheckout() {
        var request = URLRequest(url: URL(string: backendCheckoutURL)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "amount": paymentAmount,
            "currency": currency,
            "firstName": "Customer",
            "lastName": "",
            "paymentOption": "abapay_khqr"
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let success = json["success"] as? Bool, success == true,
                  let payload = json["payload"] as? [String: Any],
                  let checkoutURL = json["checkoutUrl"] as? String else {
                DispatchQueue.main.async {
                    self?.showError("Failed to initialize payment")
                }
                return
            }

            self.transactionId = payload["tran_id"] as? String

            let formHTML = self.buildCheckoutForm(payload: payload, checkoutURL: checkoutURL)

            DispatchQueue.main.async {
                self.webView.loadHTMLString(formHTML, baseURL: nil)
            }
        }.resume()
    }

    // MARK: Build HTML Form

    private func buildCheckoutForm(payload: [String: Any], checkoutURL: String) -> String {
        var hiddenInputs = ""
        for (key, value) in payload {
            hiddenInputs += "<input type=\"hidden\" name=\"\(key)\" value=\"\(value)\">\n"
        }

        return """
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f7f7f8}.loader{text-align:center}.spinner{border:3px solid #e5e7eb;border-top-color:#111;border-radius:50%;width:40px;height:40px;animation:spin .8s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}p{font-size:.9rem;color:#5a5a5f}</style>
        </head><body>
        <div class="loader"><div class="spinner"></div><p>Redirecting to payment...</p></div>
        <form id="f" method="POST" action="\(checkoutURL)/api/payment-gateway/v1/payments/checkout">\(hiddenInputs)</form>
        <script>setTimeout(function(){document.getElementById('f').submit()},500)</script>
        </body></html>
        """
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // Detect redirect back to return URL
        if url.absoluteString.hasPrefix(returnURLPrefix) {
            print("[PayWay] Payment redirect detected: \(url.absoluteString)")

            if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
               let tranID = components.queryItems?.first(where: { $0.name == "tran_id" })?.value {
                self.transactionId = tranID
            }

            decisionHandler(.cancel)
            checkPaymentStatus()
            return
        }

        decisionHandler(.allow)
    }

    // MARK: Status Check

    private func checkPaymentStatus() {
        guard let tranID = transactionId else {
            dismissWithResult(.error("No transaction ID"))
            return
        }

        var request = URLRequest(url: URL(string: backendStatusURL)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["transactionId": tranID])

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = json["status"] as? String else {
                DispatchQueue.main.async { self?.dismissWithResult(.error("Could not verify payment")) }
                return
            }

            DispatchQueue.main.async {
                if status == "0" {
                    self?.dismissWithResult(.success)
                } else {
                    self?.dismissWithResult(.cancelled)
                }
            }
        }.resume()
    }

    // MARK: Navigation

    private func dismissWithResult(_ result: PaymentResult) {
        dismiss(animated: true) {
            NotificationCenter.default.post(
                name: .paymentCompleted,
                object: nil,
                userInfo: ["result": result, "transactionId": self.transactionId ?? ""]
            )
        }
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Payment Error", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            self.dismissWithResult(.error(message))
        })
        present(alert, animated: true)
    }
}