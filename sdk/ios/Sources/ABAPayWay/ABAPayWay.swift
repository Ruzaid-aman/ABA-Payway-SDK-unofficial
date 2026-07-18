import Foundation
import UIKit

/// Protocol for receiving payment sheet callbacks
public protocol ABAPayWayDelegate: AnyObject {
    /// Called when the payment sheet completes with a result
    /// - Parameters:
    ///   - sheet: The payment sheet that completed
    ///   - result: The payment result
    func paymentSheet(_ sheet: PaymentSheet, didCompleteWithResult result: PaymentResult)

    /// Called when the user cancels the payment sheet
    /// - Parameter sheet: The payment sheet that was cancelled
    func paymentSheetDidCancel(_ sheet: PaymentSheet)
}

/// Protocol marker for PaymentSheet
/// Used in delegate callbacks to identify the payment sheet instance
public protocol PaymentSheet: AnyObject {}

/// Main entry point for the ABAPayWay SDK
///
/// This class provides the primary interface for integrating PayWay payments
/// into an iOS application.
///
/// ## Configuration
///
/// Before using the SDK, configure it with your PayWay credentials:
///
/// ```swift
/// let config = PayWayConfig(
///     merchantId: "your_merchant_id",
///     backendURL: URL(string: "https://your-backend.com/payway/sign")!,
///     environment: .sandbox
/// )
/// ABAPayWay.shared.configure(with: config)
/// ```
///
/// ## Presenting Payment
///
/// ```swift
/// let paymentConfig = PaymentSheetConfig(
///     transactionId: "order-123",
///     amount: Decimal(10.00),
///     currency: .usd,
///     items: [PaymentItem(name: "Product", quantity: 1, price: 10.00)],
///     paymentOptions: [.abaKHQR, .cards],
///     returnDeeplink: DeeplinkConfig(
///         iosScheme: "myapp://payway/callback",
///         androidScheme: "myapp://payway/callback"
///     )
/// )
///
/// ABAPayWay.shared.presentPaymentSheet(
///     from: self,
///     config: paymentConfig,
///     delegate: self
/// )
/// ```
public final class ABAPayWay: NSObject {

    /// The shared singleton instance
    public static let shared = ABAPayWay()

    /// The current configuration
    public private(set) var config: PayWayConfig!

    /// The API client for making PayWay requests
    private var apiClient: PayWayAPIClient!

    /// The deeplink handler
    private let deeplinkHandler = DeeplinkHandler()

    /// Private initializer for singleton
    private override init() {
        super.init()
    }

    // MARK: - Configuration

    /// Configures the SDK with the given configuration
    /// - Parameter config: The PayWay configuration
    public func configure(with config: PayWayConfig) {
        self.config = config
        self.apiClient = PayWayAPIClient(config: config)
    }

    // MARK: - Payment Sheet

    /// Presents the payment sheet from a view controller
    /// - Parameters:
    ///   - viewController: The view controller to present from
    ///   - config: The payment configuration
    ///   - delegate: The delegate to receive payment callbacks
    public func presentPaymentSheet(
        from viewController: UIViewController,
        config: PaymentSheetConfig,
        delegate: ABAPayWayDelegate
    ) {
        // Validate configuration
        do {
            try config.validate()
        } catch {
            let result = PaymentResult.failure(PaymentFailure(
                tranId: config.transactionId,
                code: "INVALID_CONFIG",
                message: error.localizedDescription
            ))
            let tempVC = PaymentSheetViewController(config: config, delegate: delegate)
            delegate.paymentSheet(tempVC, didCompleteWithResult: result)
            return
        }

        let paymentSheetVC = PaymentSheetViewController(config: config, delegate: delegate)
        paymentSheetVC.modalPresentationStyle = .pageSheet

        if let sheet = paymentSheetVC.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }

        viewController.present(paymentSheetVC, animated: true)
    }

    // MARK: - QR Generation

    /// Generates a QR code for the given payment configuration
    /// - Parameter config: The payment configuration
    /// - Returns: The QR response containing the QR string and/or image
    public func generateQR(config: PaymentSheetConfig) async throws -> QRResponse {
        guard let apiClient = apiClient else {
            throw PayWayError.invalidConfig(reason: "SDK not configured. Call configure(with:) first.")
        }

        // Validate configuration
        try config.validate()

        // Use ABA KHQR as the payment option
        let paymentOption = PaymentOption.abaKHQR

        // Request signing from merchant backend
        let signedPayload = try await apiClient.requestSigning(
            transactionId: config.transactionId,
            amount: config.amount,
            currency: config.currency,
            items: config.items,
            paymentOption: paymentOption,
            returnDeeplink: config.returnDeeplink,
            returnUrl: config.returnUrl,
            cancelUrl: config.cancelUrl,
            email: config.email,
            phone: config.phone,
            firstname: config.firstname,
            lastname: config.lastname,
            lifetime: config.lifetime
        )

        // Submit purchase to PayWay
        return try await apiClient.submitPurchase(signedPayload: signedPayload)
    }

    // MARK: - Transaction Status

    /// Checks the status of a transaction
    /// - Parameters:
    ///   - transactionId: The transaction ID to check
    ///   - hash: The HMAC signature
    ///   - reqTime: The request timestamp
    /// - Returns: The transaction status response
    public func checkTransaction(
        transactionId: String,
        hash: String,
        reqTime: String
    ) async throws -> CheckTransactionResponse {
        guard let apiClient = apiClient else {
            throw PayWayError.invalidConfig(reason: "SDK not configured. Call configure(with:) first.")
        }

        return try await apiClient.checkTransaction(
            transactionId: transactionId,
            hash: hash,
            reqTime: reqTime
        )
    }

    /// Closes/cancels a transaction
    /// - Parameters:
    ///   - transactionId: The transaction ID to close
    ///   - hash: The HMAC signature
    ///   - reqTime: The request timestamp
    public func closeTransaction(
        transactionId: String,
        hash: String,
        reqTime: String
    ) async throws {
        guard let apiClient = apiClient else {
            throw PayWayError.invalidConfig(reason: "SDK not configured. Call configure(with:) first.")
        }

        try await apiClient.closeTransaction(
            transactionId: transactionId,
            hash: hash,
            reqTime: reqTime
        )
    }

    // MARK: - Deep Link Handling

    /// Handles a return deep link URL
    /// - Parameter url: The return URL to handle
    /// - Returns: The parsed deep link result
    public func handleReturnDeeplink(_ url: URL) -> DeeplinkResult {
        return deeplinkHandler.handleReturnDeeplink(url: url)
    }

    /// Handles a return deep link URL string
    /// - Parameter urlString: The return URL string to handle
    /// - Returns: The parsed deep link result
    public func handleReturnDeeplink(_ urlString: String) -> DeeplinkResult {
        return deeplinkHandler.handleReturnDeeplink(urlString: urlString)
    }

    /// Opens ABA Mobile with the given deep link
    /// - Parameter deeplink: The ABA PayWay deep link
    /// - Returns: True if ABA Mobile was opened successfully
    @discardableResult
    public func openABAMobile(deeplink: String) -> Bool {
        return deeplinkHandler.openABAMobile(deeplink: deeplink)
    }

    /// Checks if ABA Mobile is installed
    /// - Returns: True if ABA Mobile is installed
    public func isABAMobileInstalled() -> Bool {
        return deeplinkHandler.isABAMobileInstalled()
    }
}