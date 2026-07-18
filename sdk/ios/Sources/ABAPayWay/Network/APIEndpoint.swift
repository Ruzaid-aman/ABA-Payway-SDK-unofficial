import Foundation

/// PayWay API endpoints
public enum APIEndpoint {
    /// Purchase/payment endpoint
    case purchase

    /// Check transaction status
    case checkTransaction

    /// Close/cancel a transaction
    case closeTransaction

    /// Generate QR code
    case generateQR

    /// Get transaction details
    case transactionDetail

    /// Refund a transaction
    case refund

    /// Get exchange rate
    case exchangeRate

    /// The URL path for the endpoint
    public var path: String {
        switch self {
        case .purchase:
            return "/api/payment-gateway/v1/payments/purchase"
        case .checkTransaction:
            return "/api/payment-gateway/v1/payments/check-transaction-2"
        case .closeTransaction:
            return "/api/payment-gateway/v1/payments/close-transaction"
        case .generateQR:
            return "/api/payment-gateway/v1/payments/generate-qr"
        case .transactionDetail:
            return "/api/payment-gateway/v1/payments/transaction-detail"
        case .refund:
            return "/api/merchant-portal/merchant-access/online-transaction/refund"
        case .exchangeRate:
            return "/api/payment-gateway/v1/exchange-rate"
        }
    }

    /// The HTTP method for the endpoint
    public var method: String {
        switch self {
        case .purchase, .checkTransaction, .closeTransaction, .generateQR, .refund:
            return "POST"
        case .transactionDetail, .exchangeRate:
            return "POST"
        }
    }

    /// The content type for the endpoint
    public var contentType: String {
        return "application/json"
    }

    /// The full URL for the endpoint
    /// - Parameter baseURL: The base PayWay URL
    /// - Returns: The full URL
    public func url(baseURL: URL) -> URL {
        return baseURL.appendingPathComponent(path)
    }
}