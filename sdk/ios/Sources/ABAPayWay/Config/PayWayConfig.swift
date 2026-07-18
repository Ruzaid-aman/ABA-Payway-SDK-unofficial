import Foundation

/// PayWay API environment
public enum Environment: String, Codable {
    case sandbox = "sandbox"
    case production = "production"

    var baseURL: URL {
        switch self {
        case .sandbox:
            return URL(string: "https://checkout-sandbox.payway.com.kh")!
        case .production:
            return URL(string: "https://checkout.payway.com.kh")!
        }
    }
}

/// Configuration for the PayWay SDK.
/// Note: API keys are NOT stored in the SDK - they stay on the merchant's backend.
/// The SDK communicates with the merchant backend to obtain signed payloads.
public struct PayWayConfig {
    /// The merchant ID issued by ABA Bank
    public let merchantId: String

    /// The merchant's backend URL that provides signed payloads
    /// The SDK calls this URL to get transaction signatures
    public let backendURL: URL

    /// The PayWay environment to use
    public let environment: Environment

    /// Creates a new PayWay configuration
    /// - Parameters:
    ///   - merchantId: The merchant ID from ABA Bank
    ///   - backendURL: The merchant's backend URL for signing transactions
    ///   - environment: The PayWay environment (sandbox or production)
    public init(merchantId: String, backendURL: URL, environment: Environment) {
        self.merchantId = merchantId
        self.backendURL = backendURL
        self.environment = environment
    }
}