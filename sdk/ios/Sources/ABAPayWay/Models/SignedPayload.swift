import Foundation

/// A signed payload returned by the merchant's backend
/// The backend computes the HMAC-SHA512 hash and returns the payload with the signature
public struct SignedPayload: Codable, Equatable {
    /// The payload data (field names and values)
    public let payload: [String: String]

    /// The HMAC-SHA512 signature
    public let hash: String

    /// The request timestamp (format: YYYYMMDDHHmmss)
    public let reqTime: String

    /// The merchant ID
    public let merchantId: String

    /// Creates a new signed payload
    public init(payload: [String: String], hash: String, reqTime: String, merchantId: String) {
        self.payload = payload
        self.hash = hash
        self.reqTime = reqTime
        self.merchantId = merchantId
    }

    /// Returns the payload as JSON data
    /// - Throws: EncodingError if encoding fails
    public func encodeToJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return try encoder.encode(self)
    }
}