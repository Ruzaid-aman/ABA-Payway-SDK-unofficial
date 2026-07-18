import XCTest
@testable import ABAPayWay

final class PaymentSheetConfigTests: XCTestCase {

    // MARK: - Validation Tests

    func testValidConfig() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [PaymentItem(name: "Product", quantity: 1, price: Decimal(10.00))],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        XCTAssertNoThrow(try config.validate())
    }

    func testEmptyTransactionIdFails() {
        let config = PaymentSheetConfig(
            transactionId: "",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        XCTAssertThrowsError(try config.validate()) { error in
            XCTAssertEqual(error as? PayWayError, .invalidConfig(reason: "transactionId cannot be empty"))
        }
    }

    func testZeroAmountFails() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(0),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        XCTAssertThrowsError(try config.validate()) { error in
            XCTAssertEqual(error as? PayWayError, .invalidConfig(reason: "amount must be greater than 0"))
        }
    }

    func testNegativeAmountFails() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(-10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        XCTAssertThrowsError(try config.validate()) { error in
            XCTAssertEqual(error as? PayWayError, .invalidConfig(reason: "amount must be greater than 0"))
        }
    }

    func testEmptyPaymentOptionsFails() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        XCTAssertThrowsError(try config.validate()) { error in
            XCTAssertEqual(error as? PayWayError, .invalidConfig(reason: "at least one payment option must be selected"))
        }
    }

    func testZeroLifetimeFails() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback"),
            lifetime: 0
        )

        XCTAssertThrowsError(try config.validate()) { error in
            XCTAssertEqual(error as? PayWayError, .invalidConfig(reason: "lifetime must be greater than 0"))
        }
    }

    func testNegativeLifetimeFails() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback"),
            lifetime: -10
        )

        XCTAssertThrowsError(try config.validate()) { error in
            XCTAssertEqual(error as? PayWayError, .invalidConfig(reason: "lifetime must be greater than 0"))
        }
    }

    func testValidLifetimePasses() {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback"),
            lifetime: 300
        )

        XCTAssertNoThrow(try config.validate())
    }

    // MARK: - Codable Tests

    func testConfigIsCodable() throws {
        let config = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [PaymentItem(name: "Product", quantity: 1, price: Decimal(10.00))],
            paymentOptions: [.abaKHQR, .cards],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback"),
            returnUrl: "https://example.com/return",
            cancelUrl: "https://example.com/cancel",
            email: "test@example.com",
            phone: "+85512345678",
            firstname: "John",
            lastname: "Doe",
            lifetime: 300
        )

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase

        let data = try encoder.encode(config)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let decoded = try decoder.decode(PaymentSheetConfig.self, from: data)

        XCTAssertEqual(decoded.transactionId, config.transactionId)
        XCTAssertEqual(decoded.amount, config.amount)
        XCTAssertEqual(decoded.currency, config.currency)
        XCTAssertEqual(decoded.paymentOptions, config.paymentOptions)
        XCTAssertEqual(decoded.returnUrl, config.returnUrl)
        XCTAssertEqual(decoded.cancelUrl, config.cancelUrl)
        XCTAssertEqual(decoded.email, config.email)
        XCTAssertEqual(decoded.phone, config.phone)
        XCTAssertEqual(decoded.firstname, config.firstname)
        XCTAssertEqual(decoded.lastname, config.lastname)
        XCTAssertEqual(decoded.lifetime, config.lifetime)
    }

    // MARK: - Equatable Tests

    func testConfigEquatable() {
        let config1 = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        let config2 = PaymentSheetConfig(
            transactionId: "order-123",
            amount: Decimal(10.00),
            currency: .usd,
            items: [],
            paymentOptions: [.abaKHQR],
            returnDeeplink: DeeplinkConfig(iosScheme: "myapp://callback", androidScheme: "myapp://callback")
        )

        let config3 = PaymentSheetConfig(
            transactionId: "order-456",
            amount: Decimal(20.00),
            currency: .khr,
            items: [],
            paymentOptions: [.cards],
            returnDeeplink: DeeplinkConfig(iosScheme: "other://callback", androidScheme: "other://callback")
        )

        XCTAssertEqual(config1, config2)
        XCTAssertNotEqual(config1, config3)
    }
}