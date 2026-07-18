import Foundation

/// Result of a payment transaction
public enum PaymentResult: Equatable {
    /// Payment was successful
    case success(TransactionSuccess)

    /// Payment failed
    case failure(PaymentFailure)

    /// User cancelled the payment
    case cancelled
}

/// Details of a successful transaction
public struct TransactionSuccess: Codable, Equatable {
    /// The transaction ID
    public let tranId: String

    /// The transaction amount
    public let amount: Decimal

    /// The currency of the transaction
    public let currency: Currency

    /// The payment status
    public let paymentStatus: TransactionStatus

    /// The approval code (optional)
    public let apv: String?

    /// The transaction date (optional, format: YYYY-MM-DD HH:mm:ss)
    public let transactionDate: String?

    /// Creates a new transaction success
    public init(
        tranId: String,
        amount: Decimal,
        currency: Currency,
        paymentStatus: TransactionStatus,
        apv: String? = nil,
        transactionDate: String? = nil
    ) {
        self.tranId = tranId
        self.amount = amount
        self.currency = currency
        self.paymentStatus = paymentStatus
        self.apv = apv
        self.transactionDate = transactionDate
    }
}

/// Details of a failed transaction
public struct PaymentFailure: Codable, Equatable {
    /// The transaction ID
    public let tranId: String

    /// The error code
    public let code: String

    /// The error message
    public let message: String

    /// Creates a new payment failure
    public init(tranId: String, code: String, message: String) {
        self.tranId = tranId
        self.code = code
        self.message = message
    }
}