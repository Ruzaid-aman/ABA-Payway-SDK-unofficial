import Foundation

/// Result of handling a return deep link from PayWay
public enum DeeplinkResult: Equatable {
    /// Payment was successful
    case success(
        tranId: String,
        status: String,
        apv: String?,
        returnParams: String?
    )

    /// User cancelled the payment
    case cancelled

    /// Deep link was invalid or malformed
    case invalid

    /// Returns true if this is a successful result
    public var isSuccess: Bool {
        if case .success = self {
            return true
        }
        return false
    }

    /// Returns the transaction ID if available
    public var transactionId: String? {
        if case .success(let tranId, _, _, _) = self {
            return tranId
        }
        return nil
    }

    /// Returns the status if available
    public var status: String? {
        if case .success(_, let status, _, _) = self {
            return status
        }
        return nil
    }

    /// Returns the approval code if available
    public var approvalCode: String? {
        if case .success(_, _, let apv, _) = self {
            return apv
        }
        return nil
    }

    /// Returns the return parameters if available
    public var returnParameters: String? {
        if case .success(_, _, _, let returnParams) = self {
            return returnParams
        }
        return nil
    }
}