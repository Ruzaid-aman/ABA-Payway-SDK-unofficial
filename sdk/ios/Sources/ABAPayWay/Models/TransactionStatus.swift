import Foundation

/// Payment transaction status
public enum TransactionStatus: String, Codable, CaseIterable {
    /// Transaction was approved
    case approved = "APPROVED"

    /// Transaction is pending
    case pending = "PENDING"

    /// Transaction was declined
    case declined = "DECLINED"

    /// Transaction was refunded
    case refunded = "REFUNDED"

    /// Transaction was cancelled
    case cancelled = "CANCELLED"

    /// Pre-authorization (not yet captured)
    case preAuth = "PRE-AUTH"

    /// Creates a TransactionStatus from a payment status code
    /// - Parameter code: The numeric status code (0=APPROVED, 2=PENDING, 3=DECLINED, 4=REFUNDED, 7=CANCELLED)
    /// - Returns: The corresponding TransactionStatus
    public static func from(paymentStatusCode: Int) -> TransactionStatus {
        switch paymentStatusCode {
        case 0:
            return .approved
        case 2:
            return .pending
        case 3:
            return .declined
        case 4:
            return .refunded
        case 7:
            return .cancelled
        default:
            return .pending
        }
    }

    /// Returns true if the status represents a completed transaction
    public var isCompleted: Bool {
        switch self {
        case .approved, .refunded:
            return true
        default:
            return false
        }
    }

    /// Returns true if the status represents a failed transaction
    public var isFailed: Bool {
        switch self {
        case .declined, .cancelled:
            return true
        default:
            return false
        }
    }
}