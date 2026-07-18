import Foundation

/// Configuration for the payment sheet
public struct PaymentSheetConfig: Codable, Equatable {
    /// Unique transaction identifier (merchant's responsibility)
    public let transactionId: String

    /// Payment amount
    public let amount: Decimal

    /// Currency for the payment
    public let currency: Currency

    /// Items being purchased
    public let items: [PaymentItem]

    /// Enabled payment options
    public let paymentOptions: [PaymentOption]

    /// Deep link configuration for returning to the app
    public let returnDeeplink: DeeplinkConfig

    /// Optional URL to redirect after successful payment
    public let returnUrl: String?

    /// Optional URL to redirect when payment is cancelled
    public let cancelUrl: String?

    /// Customer email
    public let email: String?

    /// Customer phone number
    public let phone: String?

    /// Customer first name
    public let firstname: String?

    /// Customer last name
    public let lastname: String?

    /// QR code lifetime in seconds (default: 300)
    public let lifetime: Int?

    /// Creates a new payment sheet configuration
    /// - Parameters:
    ///   - transactionId: Unique transaction ID
    ///   - amount: Payment amount
    ///   - currency: Payment currency
    ///   - items: Items being purchased
    ///   - paymentOptions: Enabled payment options
    ///   - returnDeeplink: Deep link configuration
    ///   - returnUrl: Optional return URL
    ///   - cancelUrl: Optional cancel URL
    ///   - email: Optional customer email
    ///   - phone: Optional customer phone
    ///   - firstname: Optional customer first name
    ///   - lastname: Optional customer last name
    ///   - lifetime: Optional QR lifetime in seconds
    public init(
        transactionId: String,
        amount: Decimal,
        currency: Currency,
        items: [PaymentItem],
        paymentOptions: [PaymentOption],
        returnDeeplink: DeeplinkConfig,
        returnUrl: String? = nil,
        cancelUrl: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        firstname: String? = nil,
        lastname: String? = nil,
        lifetime: Int? = nil
    ) {
        self.transactionId = transactionId
        self.amount = amount
        self.currency = currency
        self.items = items
        self.paymentOptions = paymentOptions
        self.returnDeeplink = returnDeeplink
        self.returnUrl = returnUrl
        self.cancelUrl = cancelUrl
        self.email = email
        self.phone = phone
        self.firstname = firstname
        self.lastname = lastname
        self.lifetime = lifetime
    }

    /// Validates the configuration
    /// - Throws: PayWayError.invalidConfig if validation fails
    public func validate() throws {
        guard !transactionId.isEmpty else {
            throw PayWayError.invalidConfig(reason: "transactionId cannot be empty")
        }

        guard amount > 0 else {
            throw PayWayError.invalidConfig(reason: "amount must be greater than 0")
        }

        guard !paymentOptions.isEmpty else {
            throw PayWayError.invalidConfig(reason: "at least one payment option must be selected")
        }

        if let lifetime = lifetime, lifetime <= 0 {
            throw PayWayError.invalidConfig(reason: "lifetime must be greater than 0")
        }
    }
}