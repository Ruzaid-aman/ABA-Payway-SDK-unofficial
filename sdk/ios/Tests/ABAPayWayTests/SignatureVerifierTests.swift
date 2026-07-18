import XCTest
@testable import ABAPayWay

final class SignatureVerifierTests: XCTestCase {

    // MARK: - Test Vectors

    /// Test vector matching the TypeScript SDK's verifyCallbackSignature tests
    func testVerifyCallbackSignatureWithSimpleBody() {
        let body: [String: Any] = [
            "tran_id": "123456",
            "amount": "10.00",
            "status": "APPROVED"
        ]

        // This is a known test vector - the actual signature would be computed
        // with the API key. We test that the function doesn't crash and returns
        // a boolean value.
        let result = SignatureVerifier.verifyCallbackSignature(
            body: body,
            signature: "invalid_signature",
            apiKey: "test_api_key"
        )

        // With an invalid signature, this should return false
        XCTAssertFalse(result)
    }

    /// Test that signature verification works with empty values
    func testVerifyCallbackSignatureWithEmptyValues() {
        let body: [String: Any] = [
            "tran_id": "123456",
            "email": "",
            "phone": NSNull()
        ]

        let result = SignatureVerifier.verifyCallbackSignature(
            body: body,
            signature: "invalid_signature",
            apiKey: "test_api_key"
        )

        XCTAssertFalse(result)
    }

    /// Test that signature verification works with nested objects
    func testVerifyCallbackSignatureWithNestedObjects() {
        let body: [String: Any] = [
            "tran_id": "123456",
            "items": ["item1", "item2"],
            "custom_fields": ["key": "value"]
        ]

        let result = SignatureVerifier.verifyCallbackSignature(
            body: body,
            signature: "invalid_signature",
            apiKey: "test_api_key"
        )

        XCTAssertFalse(result)
    }

    /// Test HMAC signature generation
    func testGenerateSignature() {
        let payload: [String: Any] = [
            "req_time": "20240101120000",
            "merchant_id": "test_merchant",
            "tran_id": "123456",
            "amount": "10.00"
        ]

        let fields = ["req_time", "merchant_id", "tran_id", "amount"]

        let signature = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "test_api_key",
            encoding: .base64
        )

        XCTAssertNotNil(signature)
        XCTAssertFalse(signature!.isEmpty)
    }

    /// Test HMAC signature generation with hex encoding
    func testGenerateSignatureHexEncoding() {
        let payload: [String: Any] = [
            "req_time": "20240101120000",
            "merchant_id": "test_merchant",
            "tran_id": "123456",
            "amount": "10.00"
        ]

        let fields = ["req_time", "merchant_id", "tran_id", "amount"]

        let signature = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "test_api_key",
            encoding: .hex
        )

        XCTAssertNotNil(signature)
        XCTAssertFalse(signature!.isEmpty)
        // Hex encoding should produce 128 characters (512 bits / 4)
        XCTAssertEqual(signature!.count, 128)
    }

    /// Test that signature is consistent for same input
    func testSignatureConsistency() {
        let payload: [String: Any] = [
            "req_time": "20240101120000",
            "merchant_id": "test_merchant",
            "tran_id": "123456",
            "amount": "10.00"
        ]

        let fields = ["req_time", "merchant_id", "tran_id", "amount"]

        let signature1 = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "test_api_key",
            encoding: .base64
        )

        let signature2 = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "test_api_key",
            encoding: .base64
        )

        XCTAssertEqual(signature1, signature2)
    }

    /// Test that different API keys produce different signatures
    func testDifferentApiKeysProduceDifferentSignatures() {
        let payload: [String: Any] = [
            "req_time": "20240101120000",
            "merchant_id": "test_merchant",
            "tran_id": "123456",
            "amount": "10.00"
        ]

        let fields = ["req_time", "merchant_id", "tran_id", "amount"]

        let signature1 = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "api_key_1",
            encoding: .base64
        )

        let signature2 = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "api_key_2",
            encoding: .base64
        )

        XCTAssertNotEqual(signature1, signature2)
    }

    /// Test that field order matters in signature
    func testFieldOrderMattersInSignature() {
        let payload: [String: Any] = [
            "req_time": "20240101120000",
            "merchant_id": "test_merchant",
            "tran_id": "123456",
            "amount": "10.00"
        ]

        let fields1 = ["req_time", "merchant_id", "tran_id", "amount"]
        let fields2 = ["amount", "merchant_id", "req_time", "tran_id"]

        let signature1 = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields1,
            apiKey: "test_api_key",
            encoding: .base64
        )

        let signature2 = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields2,
            apiKey: "test_api_key",
            encoding: .base64
        )

        XCTAssertNotEqual(signature1, signature2)
    }

    /// Test with missing fields in payload
    func testGenerateSignatureWithMissingFields() {
        let payload: [String: Any] = [
            "req_time": "20240101120000",
            "merchant_id": "test_merchant"
            // tran_id and amount are missing
        ]

        let fields = ["req_time", "merchant_id", "tran_id", "amount"]

        let signature = SignatureVerifier.generateSignature(
            payload: payload,
            fields: fields,
            apiKey: "test_api_key",
            encoding: .base64
        )

        XCTAssertNotNil(signature)
    }
}