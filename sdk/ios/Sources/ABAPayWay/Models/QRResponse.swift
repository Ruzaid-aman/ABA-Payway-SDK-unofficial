import Foundation

/// Response from QR code generation
public struct QRResponse: Codable, Equatable {
    /// Raw KHQR payload string (scannable by any KHQR-member banking app)
    public let qrString: String?

    /// Base64-encoded QR code image
    public let qrImage: String?

    /// Deep link to open ABA Mobile directly with pre-filled payment
    public let abapayDeeplink: String?

    /// Hosted URL rendering the QR code as an image/page
    public let checkoutQrUrl: String?

    /// The amount to be paid
    public let amount: Decimal?

    /// The currency of the payment
    public let currency: Currency?

    /// Creates a new QR response
    public init(
        qrString: String? = nil,
        qrImage: String? = nil,
        abapayDeeplink: String? = nil,
        checkoutQrUrl: String? = nil,
        amount: Decimal? = nil,
        currency: Currency? = nil
    ) {
        self.qrString = qrString
        self.qrImage = qrImage
        self.abapayDeeplink = abapayDeeplink
        self.checkoutQrUrl = checkoutQrUrl
        self.amount = amount
        self.currency = currency
    }
}