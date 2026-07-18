import XCTest
@testable import ABAPayWay

final class PayWayErrorTests: XCTestCase {

    // MARK: - Error Descriptions

    func testNetworkErrorDescription() {
        let underlyingError = NSError(domain: "test", code: 1, userInfo: [NSLocalizedDescriptionKey: "Connection failed"])
        let error = PayWayError.network(underlying: underlyingError)

        XCTAssertEqual(error.localizedDescription, "Network error: Connection failed")
    }

    func testPaywayErrorDescription() {
        let error = PayWayError.payway(code: "PTL01", message: "Invalid merchant")

        XCTAssertEqual(error.localizedDescription, "PayWay error [PTL01]: Invalid merchant")
    }

    func testSigningFailedErrorDescription() {
        let error = PayWayError.signingFailed

        XCTAssertEqual(error.localizedDescription, "Failed to sign the request")
    }

    func testInvalidConfigErrorDescription() {
        let error = PayWayError.invalidConfig(reason: "Missing merchant ID")

        XCTAssertEqual(error.localizedDescription, "Invalid configuration: Missing merchant ID")
    }

    func testDeeplinkFailedErrorDescription() {
        let error = PayWayError.deeplinkFailed

        XCTAssertEqual(error.localizedDescription, "Failed to handle deep link")
    }

    func testVerificationFailedErrorDescription() {
        let error = PayWayError.verificationFailed

        XCTAssertEqual(error.localizedDescription, "Signature verification failed")
    }

    func testCancelledErrorDescription() {
        let error = PayWayError.cancelled

        XCTAssertEqual(error.localizedDescription, "Payment was cancelled")
    }

    func testUnknownErrorDescription() {
        let error = PayWayError.unknown(message: "Something went wrong")

        XCTAssertEqual(error.localizedDescription, "Unknown error: Something went wrong")
    }

    // MARK: - Equatability

    func testNetworkErrorEquatable() {
        let error1 = PayWayError.network(underlying: NSError(domain: "test", code: 1, userInfo: nil))
        let error2 = PayWayError.network(underlying: NSError(domain: "test", code: 1, userInfo: nil))

        // Network errors are equal if both are network errors (underlying error not compared)
        XCTAssertEqual(error1, error2)
    }

    func testPaywayErrorEquatable() {
        let error1 = PayWayError.payway(code: "PTL01", message: "Invalid merchant")
        let error2 = PayWayError.payway(code: "PTL01", message: "Invalid merchant")
        let error3 = PayWayError.payway(code: "PTL02", message: "Invalid signature")

        XCTAssertEqual(error1, error2)
        XCTAssertNotEqual(error1, error3)
    }

    func testSigningFailedErrorEquatable() {
        let error1 = PayWayError.signingFailed
        let error2 = PayWayError.signingFailed

        XCTAssertEqual(error1, error2)
    }

    func testInvalidConfigErrorEquatable() {
        let error1 = PayWayError.invalidConfig(reason: "Missing merchant ID")
        let error2 = PayWayError.invalidConfig(reason: "Missing merchant ID")
        let error3 = PayWayError.invalidConfig(reason: "Missing API key")

        XCTAssertEqual(error1, error2)
        XCTAssertNotEqual(error1, error3)
    }

    func testDeeplinkFailedErrorEquatable() {
        let error1 = PayWayError.deeplinkFailed
        let error2 = PayWayError.deeplinkFailed

        XCTAssertEqual(error1, error2)
    }

    func testVerificationFailedErrorEquatable() {
        let error1 = PayWayError.verificationFailed
        let error2 = PayWayError.verificationFailed

        XCTAssertEqual(error1, error2)
    }

    func testCancelledErrorEquatable() {
        let error1 = PayWayError.cancelled
        let error2 = PayWayError.cancelled

        XCTAssertEqual(error1, error2)
    }

    func testUnknownErrorEquatable() {
        let error1 = PayWayError.unknown(message: "Something went wrong")
        let error2 = PayWayError.unknown(message: "Something went wrong")
        let error3 = PayWayError.unknown(message: "Different error")

        XCTAssertEqual(error1, error2)
        XCTAssertNotEqual(error1, error3)
    }

    func testDifferentErrorTypesNotEqual() {
        let error1 = PayWayError.cancelled
        let error2 = PayWayError.signingFailed

        XCTAssertNotEqual(error1, error2)
    }

    // MARK: - Error Conformance

    func testPayWayErrorConformsToError() {
        let error: Error = PayWayError.cancelled

        XCTAssertNotNil(error)
    }

    func testPayWayErrorConformsToLocalizedError() {
        let error: LocalizedError = PayWayError.payway(code: "PTL01", message: "Test error")

        XCTAssertNotNil(error.errorDescription)
    }
}