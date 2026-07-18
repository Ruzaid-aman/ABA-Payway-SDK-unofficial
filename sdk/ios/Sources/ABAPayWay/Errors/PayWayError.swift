import Foundation

/// Errors that can occur during PayWay operations
public enum PayWayError: Error, LocalizedError, Equatable {
    /// Network-related error
    case network(underlying: Error)

    /// PayWay API returned an error
    case payway(code: String, message: String)

    /// Failed to sign the request
    case signingFailed

    /// Invalid configuration
    case invalidConfig(reason: String)

    /// Deep link handling failed
    case deeplinkFailed

    /// Signature verification failed
    case verificationFailed

    /// User cancelled the payment
    case cancelled

    /// Unknown error
    case unknown(message: String)

    // MARK: - LocalizedError

    public var errorDescription: String? {
        switch self {
        case .network(let error):
            return "Network error: \(error.localizedDescription)"
        case .payway(let code, let message):
            return "PayWay error [\(code)]: \(message)"
        case .signingFailed:
            return "Failed to sign the request"
        case .invalidConfig(let reason):
            return "Invalid configuration: \(reason)"
        case .deeplinkFailed:
            return "Failed to handle deep link"
        case .verificationFailed:
            return "Signature verification failed"
        case .cancelled:
            return "Payment was cancelled"
        case .unknown(let message):
            return "Unknown error: \(message)"
        }
    }

    // MARK: - Equatable

    public static func == (lhs: PayWayError, rhs: PayWayError) -> Bool {
        switch (lhs, rhs) {
        case (.network, .network):
            return true
        case let (.payway(code1, msg1), .payway(code2, msg2)):
            return code1 == code2 && msg1 == msg2
        case (.signingFailed, .signingFailed):
            return true
        case let (.invalidConfig(r1), .invalidConfig(r2)):
            return r1 == r2
        case (.deeplinkFailed, .deeplinkFailed):
            return true
        case (.verificationFailed, .verificationFailed):
            return true
        case (.cancelled, .cancelled):
            return true
        case let (.unknown(m1), .unknown(m2)):
            return m1 == m2
        default:
            return false
        }
    }
}

// MARK: - Error Status Response

/// Error status returned by PayWay API
internal struct ErrorStatusResponse: Codable {
    let status: ErrorStatus

    struct ErrorStatus: Codable {
        let code: String
        let message: String
    }
}