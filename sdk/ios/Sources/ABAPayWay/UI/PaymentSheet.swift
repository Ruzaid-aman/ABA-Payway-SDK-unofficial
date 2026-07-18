import SwiftUI

/// SwiftUI view for the payment sheet
public struct PaymentSheetView: View {
    @StateObject private var viewModel: PaymentSheetViewModel

    public let onComplete: (PaymentResult) -> Void
    public let onCancel: () -> Void

    public init(
        config: PaymentSheetConfig,
        onComplete: @escaping (PaymentResult) -> Void,
        onCancel: @escaping () -> Void
    ) {
        _viewModel = StateObject(wrappedValue: PaymentSheetViewModel(config: config))
        self.onComplete = onComplete
        self.onCancel = onCancel
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView

            // Content
            if viewModel.isLoading {
                loadingView
            } else if let error = viewModel.error {
                errorView(error)
            } else {
                paymentOptionsView
            }

            Spacer()

            // Pay Button
            payButton
        }
        .background(Color(.systemBackground))
        .onAppear {
            viewModel.onComplete = onComplete
            viewModel.onCancel = onCancel
        }
    }

    // MARK: - Header

    private var headerView: some View {
        VStack(spacing: 8) {
            // Handle indicator
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 36, height: 5)
                .padding(.top, 8)

            Text("Payment")
                .font(.headline)
                .padding(.top, 8)

            // Amount display
            Text(viewModel.config.currency.format(viewModel.config.amount))
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundColor(.primary)

            Text(viewModel.config.transactionId)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
    }

    // MARK: - Payment Options

    private var paymentOptionsView: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(viewModel.config.paymentOptions, id: \.self) { option in
                    paymentOptionRow(option)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func paymentOptionRow(_ option: PaymentOption) -> some View {
        Button(action: {
            viewModel.selectedOption = option
        }) {
            HStack(spacing: 16) {
                Image(systemName: option.iconName)
                    .font(.title2)
                    .foregroundColor(.blue)
                    .frame(width: 40, height: 40)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(8)

                Text(option.displayName)
                    .font(.body)
                    .foregroundColor(.primary)

                Spacer()

                if viewModel.selectedOption == option {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        viewModel.selectedOption == option ? Color.blue : Color.secondary.opacity(0.3),
                        lineWidth: viewModel.selectedOption == option ? 2 : 1
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Processing...")
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error

    private func errorView(_ error: PayWayError) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundColor(.orange)

            Text(error.localizedDescription)
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Button("Try Again") {
                viewModel.clearError()
            }
            .buttonStyle(.bordered)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Pay Button

    private var payButton: some View {
        VStack(spacing: 12) {
            Button(action: {
                Task {
                    await viewModel.initiatePayment()
                }
            }) {
                HStack {
                    if viewModel.isProcessing {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Pay \(viewModel.config.currency.format(viewModel.config.amount))")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    viewModel.selectedOption != nil && !viewModel.isProcessing
                        ? Color.blue
                        : Color.gray
                )
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(viewModel.selectedOption == nil || viewModel.isProcessing)

            Button("Cancel") {
                onCancel()
            }
            .foregroundColor(.secondary)
        }
        .padding(20)
    }
}

// MARK: - View Model

@MainActor
class PaymentSheetViewModel: ObservableObject {
    let config: PaymentSheetConfig

    @Published var selectedOption: PaymentOption?
    @Published var isLoading = false
    @Published var isProcessing = false
    @Published var error: PayWayError?

    var onComplete: ((PaymentResult) -> Void)?
    var onCancel: (() -> Void)?

    private let apiClient: PayWayAPIClient

    init(config: PaymentSheetConfig) {
        self.config = config
        // Default to first payment option if available
        self.selectedOption = config.paymentOptions.first

        // Create API client with shared config
        guard let paywayConfig = ABAPayWay.shared.config else {
            fatalError("ABAPayWay must be configured before presenting PaymentSheet. Call ABAPayWay.shared.configure(with:) first.")
        }
        self.apiClient = PayWayAPIClient(config: paywayConfig)
    }

    func clearError() {
        error = nil
    }

    func initiatePayment() async {
        guard let paymentOption = selectedOption else {
            error = .invalidConfig(reason: "Please select a payment option")
            return
        }

        isProcessing = true
        error = nil

        do {
            // Request signing from merchant backend
            let signedPayload = try await apiClient.requestSigning(
                transactionId: config.transactionId,
                amount: config.amount,
                currency: config.currency,
                items: config.items,
                paymentOption: paymentOption,
                returnDeeplink: config.returnDeeplink,
                returnUrl: config.returnUrl,
                cancelUrl: config.cancelUrl,
                email: config.email,
                phone: config.phone,
                firstname: config.firstname,
                lastname: config.lastname,
                lifetime: config.lifetime
            )

            // Submit purchase to PayWay
            let qrResponse = try await apiClient.submitPurchase(signedPayload: signedPayload)

            // Handle based on payment option
            switch paymentOption {
            case .abaKHQRDeeplink:
                // Open ABA Mobile via deeplink
                if let deeplink = qrResponse.abapayDeeplink {
                    let handler = DeeplinkHandler()
                    if handler.openABAMobile(deeplink: deeplink) {
                        // Wait for return via deeplink
                        // The app should handle the return URL and call handleReturnDeeplink
                    } else {
                        // ABA Mobile not installed, show QR instead
                        let result = PaymentResult.failure(PaymentFailure(
                            tranId: config.transactionId,
                            code: "DEEPLINK_FAILED",
                            message: "ABA Mobile is not installed"
                        ))
                        onComplete?(result)
                    }
                }

            case .abaKHQR:
                // Show QR code
                let result = PaymentResult.success(TransactionSuccess(
                    tranId: config.transactionId,
                    amount: config.amount,
                    currency: config.currency,
                    paymentStatus: .pending,
                    transactionDate: nil
                ))
                onComplete?(result)

            case .cards:
                // Show card payment webview
                let result = PaymentResult.success(TransactionSuccess(
                    tranId: config.transactionId,
                    amount: config.amount,
                    currency: config.currency,
                    paymentStatus: .pending,
                    transactionDate: nil
                ))
                onComplete?(result)

            default:
                let result = PaymentResult.success(TransactionSuccess(
                    tranId: config.transactionId,
                    amount: config.amount,
                    currency: config.currency,
                    paymentStatus: .pending,
                    transactionDate: nil
                ))
                onComplete?(result)
            }

        } catch let paywayError as PayWayError {
            error = paywayError
            let result = PaymentResult.failure(PaymentFailure(
                tranId: config.transactionId,
                code: "ERROR",
                message: paywayError.localizedDescription
            ))
            onComplete?(result)
        } catch {
            self.error = .network(underlying: error)
            let result = PaymentResult.failure(PaymentFailure(
                tranId: config.transactionId,
                code: "NETWORK_ERROR",
                message: error.localizedDescription
            ))
            onComplete?(result)
        }

        isProcessing = false
    }
}