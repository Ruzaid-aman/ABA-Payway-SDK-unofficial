import Foundation

/// Response from check transaction endpoint
public struct CheckTransactionResponse: Codable {
    public let data: TransactionData?
    public let status: StatusBlock

    public struct TransactionData: Codable {
        public let paymentStatusCode: Int?
        public let paymentStatus: String?
        public let totalAmount: Decimal?
        public let originalAmount: Decimal?
        public let refundAmount: Decimal?
        public let discountAmount: Decimal?
        public let paymentAmount: Decimal?
        public let paymentCurrency: String?
        public let apv: String?
        public let transactionDate: String?

        enum CodingKeys: String, CodingKey {
            case paymentStatusCode = "payment_status_code"
            case paymentStatus = "payment_status"
            case totalAmount = "total_amount"
            case originalAmount = "original_amount"
            case refundAmount = "refund_amount"
            case discountAmount = "discount_amount"
            case paymentAmount = "payment_amount"
            case paymentCurrency = "payment_currency"
            case apv
            case transactionDate = "transaction_date"
        }
    }

    public struct StatusBlock: Codable {
        public let code: String
        public let message: String
        public let tranId: String?

        enum CodingKeys: String, CodingKey {
            case code
            case message
            case tranId = "tran_id"
        }
    }

    /// Returns true if the transaction was successful
    public var isSuccess: Bool {
        return status.code == "00"
    }

    /// Returns the transaction status
    public var transactionStatus: TransactionStatus? {
        guard let statusString = data?.paymentStatus else { return nil }
        return TransactionStatus(rawValue: statusString)
    }
}

/// Response from close transaction endpoint
public struct CloseTransactionResponse: Codable {
    public let status: CheckTransactionResponse.StatusBlock

    /// Returns true if the close was successful
    public var isSuccess: Bool {
        return status.code == "00"
    }
}

/// Actor for making PayWay API requests
public actor PayWayAPIClient {
    private let config: PayWayConfig
    private let session: URLSession

    /// Creates a new API client
    /// - Parameter config: The PayWay configuration
    public init(config: PayWayConfig) {
        self.config = config

        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: configuration)
    }

    // MARK: - Request Signing (Merchant Backend)

    /// Requests a signed payload from the merchant's backend
    ///
    /// The SDK calls the merchant backend (not PayWay directly) to get the
    /// transaction signed with HMAC-SHA512. The backend returns the signed
    /// payload which the SDK then forwards to PayWay.
    ///
    /// - Parameters:
    ///   - transactionId: Unique transaction ID
    ///   - amount: Payment amount
    ///   - currency: Payment currency
    ///   - items: Items being purchased
    ///   - paymentOption: Selected payment option
    ///   - returnDeeplink: Deep link configuration
    ///   - returnUrl: Optional return URL
    ///   - cancelUrl: Optional cancel URL
    ///   - email: Optional customer email
    ///   - phone: Optional customer phone
    ///   - firstname: Optional customer first name
    ///   - lastname: Optional customer last name
    ///   - lifetime: Optional QR lifetime in seconds
    /// - Returns: The signed payload from the merchant backend
    public func requestSigning(
        transactionId: String,
        amount: Decimal,
        currency: Currency,
        items: [PaymentItem],
        paymentOption: PaymentOption,
        returnDeeplink: DeeplinkConfig,
        returnUrl: String?,
        cancelUrl: String?,
        email: String?,
        phone: String?,
        firstname: String?,
        lastname: String?,
        lifetime: Int?
    ) async throws -> SignedPayload {
        // Build the request payload for the merchant backend
        var requestBody: [String: Any] = [
            "merchant_id": config.merchantId,
            "tran_id": transactionId,
            "amount": NSDecimalNumber(decimal: amount).doubleValue,
            "currency": currency.rawValue,
            "payment_option": paymentOption.rawValue,
            "return_deeplink": returnDeeplink.iosScheme,
            "type": "purchase"
        ]

        if let returnUrl = returnUrl {
            requestBody["return_url"] = returnUrl
        }

        if let cancelUrl = cancelUrl {
            requestBody["cancel_url"] = cancelUrl
        }

        if let email = email {
            requestBody["email"] = email
        }

        if let phone = phone {
            requestBody["phone"] = phone
        }

        if let firstname = firstname {
            requestBody["firstname"] = firstname
        }

        if let lastname = lastname {
            requestBody["lastname"] = lastname
        }

        if let lifetime = lifetime {
            requestBody["lifetime"] = lifetime
        }

        if !items.isEmpty {
            let itemsData = try JSONEncoder().encode(items)
            if let itemsString = String(data: itemsData, encoding: .utf8) {
                requestBody["items"] = itemsString
            }
        }

        // Make request to merchant backend
        var request = URLRequest(url: config.backendURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        // Decode the signed payload from merchant backend
        let decoder = JSONDecoder()
        return try decoder.decode(SignedPayload.self, from: data)
    }

    // MARK: - PayWay API Requests

    /// Submits a purchase with the signed payload
    ///
    /// - Parameter signedPayload: The signed payload from the merchant backend
    /// - Returns: The QR response from PayWay
    public func submitPurchase(signedPayload: SignedPayload) async throws -> QRResponse {
        let url = APIEndpoint.purchase.url(baseURL: config.environment.baseURL)

        var request = URLRequest(url: url)
        request.httpMethod = APIEndpoint.purchase.method
        request.setValue(APIEndpoint.purchase.contentType, forHTTPHeaderField: "Content-Type")

        // Build the purchase payload from the signed payload
        var payload = signedPayload.payload
        payload["hash"] = signedPayload.hash
        payload["req_time"] = signedPayload.reqTime
        payload["merchant_id"] = signedPayload.merchantId

        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        // Check for HTTP errors
        guard (200...299).contains(httpResponse.statusCode) else {
            // Try to parse error response
            if let errorResponse = try? JSONDecoder().decode(ErrorStatusResponse.self, from: data) {
                throw PayWayError.payway(code: errorResponse.status.code, message: errorResponse.status.message)
            }
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        // Check if response is an error status
        if let errorResponse = try? JSONDecoder().decode(ErrorStatusResponse.self, from: data) {
            if errorResponse.status.code != "00" {
                throw PayWayError.payway(code: errorResponse.status.code, message: errorResponse.status.message)
            }
        }

        // Decode QR response
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        // Try to decode as QRResponse first
        if let qrResponse = try? decoder.decode(QRResponse.self, from: data) {
            return qrResponse
        }

        // If no qr_string or abapay_deeplink, it might be an HTML response for cards
        return QRResponse()
    }

    /// Checks the status of a transaction
    ///
    /// - Parameters:
    ///   - transactionId: The transaction ID to check
    ///   - hash: The HMAC signature
    ///   - reqTime: The request timestamp
    /// - Returns: The transaction status response
    public func checkTransaction(
        transactionId: String,
        hash: String,
        reqTime: String
    ) async throws -> CheckTransactionResponse {
        let url = APIEndpoint.checkTransaction.url(baseURL: config.environment.baseURL)

        var request = URLRequest(url: url)
        request.httpMethod = APIEndpoint.checkTransaction.method
        request.setValue(APIEndpoint.checkTransaction.contentType, forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "merchant_id": config.merchantId,
            "tran_id": transactionId,
            "req_time": reqTime,
            "hash": hash
        ]

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if let errorResponse = try? JSONDecoder().decode(ErrorStatusResponse.self, from: data) {
                throw PayWayError.payway(code: errorResponse.status.code, message: errorResponse.status.message)
            }
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(CheckTransactionResponse.self, from: data)
    }

    /// Closes/cancels a transaction
    ///
    /// - Parameters:
    ///   - transactionId: The transaction ID to close
    ///   - hash: The HMAC signature
    ///   - reqTime: The request timestamp
    public func closeTransaction(
        transactionId: String,
        hash: String,
        reqTime: String
    ) async throws {
        let url = APIEndpoint.closeTransaction.url(baseURL: config.environment.baseURL)

        var request = URLRequest(url: url)
        request.httpMethod = APIEndpoint.closeTransaction.method
        request.setValue(APIEndpoint.closeTransaction.contentType, forHTTPHeaderField: "Content-Type")

        let body: [String: String] = [
            "merchant_id": config.merchantId,
            "tran_id": transactionId,
            "req_time": reqTime,
            "hash": hash
        ]

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if let errorResponse = try? JSONDecoder().decode(ErrorStatusResponse.self, from: data) {
                throw PayWayError.payway(code: errorResponse.status.code, message: errorResponse.status.message)
            }
            throw PayWayError.network(underlying: URLError(.badServerResponse))
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let closeResponse = try decoder.decode(CloseTransactionResponse.self, from: data)

        if !closeResponse.isSuccess {
            throw PayWayError.payway(code: closeResponse.status.code, message: closeResponse.status.message)
        }
    }
}