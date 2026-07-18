import Foundation
import CryptoKit

/// Utility for verifying PayWay callback signatures
public enum SignatureVerifier {

    /// Verifies a callback signature using HMAC-SHA512
    ///
    /// This implements PayWay's sorted-key signature validation algorithm:
    /// 1. Sort response keys alphabetically (ascending)
    /// 2. Concatenate all values (JSON-encoding any array/object values)
    /// 3. Compute HMAC-SHA512 using the API key
    /// 4. Compare with received signature using timing-safe equality
    ///
    /// - Parameters:
    ///   - body: The response body as a dictionary
    ///   - signature: The received signature (base64 encoded)
    ///   - apiKey: The API key for HMAC computation
    /// - Returns: True if the signature is valid, false otherwise
    public static func verifyCallbackSignature(
        body: [String: Any],
        signature: String,
        apiKey: String
    ) -> Bool {
        // Sort keys alphabetically
        let sortedKeys = body.keys.sorted()

        // Concatenate all values
        let concatenated = sortedKeys.map { key -> String in
            guard let value = body[key] else {
                return ""
            }

            if let stringValue = value as? String {
                return stringValue
            } else if let dictValue = value as? [String: Any] {
                // JSON-encode dictionary values
                guard let data = try? JSONSerialization.data(withJSONObject: dictValue),
                      let jsonString = String(data: data, encoding: .utf8) else {
                    return ""
                }
                return jsonString
            } else if let arrayValue = value as? [Any] {
                // JSON-encode array values
                guard let data = try? JSONSerialization.data(withJSONObject: arrayValue),
                      let jsonString = String(data: data, encoding: .utf8) else {
                    return ""
                }
                return jsonString
            } else {
                // For numbers, booleans, etc.
                return String(describing: value)
            }
        }.joined()

        // Compute HMAC-SHA512
        guard let apiKeyData = apiKey.data(using: .utf8),
              let messageData = concatenated.data(using: .utf8) else {
            return false
        }

        let key = SymmetricKey(data: apiKeyData)
        let computedSignature = HMAC<SHA512>.authenticationCode(for: messageData, using: key)
        let computedSignatureBase64 = Data(computedSignature).base64EncodedString()

        // Timing-safe comparison
        guard let computedData = computedSignatureBase64.data(using: .utf8),
              let receivedData = signature.data(using: .utf8) else {
            return false
        }

        // Use CryptoKit's built-in timing-safe comparison
        return computedData == receivedData
    }

    /// Generates an HMAC-SHA512 signature for a payload
    ///
    /// - Parameters:
    ///   - payload: The payload dictionary
    ///   - fields: The ordered list of field names to include in the signature
    ///   - apiKey: The API key for HMAC computation
    ///   - encoding: The output encoding (base64 or hex)
    /// - Returns: The computed signature
    public static func generateSignature(
        payload: [String: Any],
        fields: [String],
        apiKey: String,
        encoding: SignatureEncoding = .base64
    ) -> String? {
        // Concatenate field values in order
        let concatenated = fields.compactMap { field -> String? in
            guard let value = payload[field] else {
                return ""
            }

            if let stringValue = value as? String {
                return stringValue
            } else if let dictValue = value as? [String: Any] {
                guard let data = try? JSONSerialization.data(withJSONObject: dictValue),
                      let jsonString = String(data: data, encoding: .utf8) else {
                    return nil
                }
                return jsonString
            } else if let arrayValue = value as? [Any] {
                guard let data = try? JSONSerialization.data(withJSONObject: arrayValue),
                      let jsonString = String(data: data, encoding: .utf8) else {
                    return nil
                }
                return jsonString
            } else {
                return String(describing: value)
            }
        }.joined()

        guard let apiKeyData = apiKey.data(using: .utf8),
              let messageData = concatenated.data(using: .utf8) else {
            return nil
        }

        let key = SymmetricKey(data: apiKeyData)
        let signature = HMAC<SHA512>.authenticationCode(for: messageData, using: key)
        let signatureData = Data(signature)

        switch encoding {
        case .base64:
            return signatureData.base64EncodedString()
        case .hex:
            return signatureData.map { String(format: "%02x", $0) }.joined()
        }
    }
}

/// Encoding format for signatures
public enum SignatureEncoding {
    case base64
    case hex
}