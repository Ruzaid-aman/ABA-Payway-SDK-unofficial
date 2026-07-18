import SwiftUI
import CoreImage.CIFilterBuiltins

/// QR code image template styles
public enum QRImageTemplate: String {
    case template1 = "TEMPLATE1"
    case template2 = "TEMPLATE2"
    case template3 = "TEMPLATE3"

    /// Returns the background color for the template
    var backgroundColor: Color {
        switch self {
        case .template1:
            return .white
        case .template2:
            return Color(red: 0.95, green: 0.95, blue: 0.95)
        case .template3:
            return Color(red: 0.9, green: 0.95, blue: 1.0)
        }
    }

    /// Returns the corner radius for the QR code container
    var cornerRadius: CGFloat {
        switch self {
        case .template1:
            return 16
        case .template2:
            return 24
        case .template3:
            return 12
        }
    }
}

/// SwiftUI view for displaying a QR code
public struct QRDisplayView: View {
    let qrString: String
    let amount: Decimal?
    let currency: Currency?
    let template: QRImageTemplate
    let expirySeconds: Int?

    @State private var remainingSeconds: Int
    @State private var timer: Timer?

    public init(
        qrString: String,
        amount: Decimal? = nil,
        currency: Currency? = nil,
        template: QRImageTemplate = .template1,
        expirySeconds: Int? = nil
    ) {
        self.qrString = qrString
        self.amount = amount
        self.currency = currency
        self.template = template
        self.expirySeconds = expirySeconds
        _remainingSeconds = State(initialValue: expirySeconds ?? 0)
    }

    public var body: some View {
        VStack(spacing: 24) {
            // QR Code
            qrCodeImage
                .padding(24)
                .background(template.backgroundColor)
                .cornerRadius(template.cornerRadius)
                .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 4)

            // Amount
            if let amount = amount, let currency = currency {
                VStack(spacing: 4) {
                    Text("Amount")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text(currency.format(amount))
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                }
            }

            // Expiry countdown
            if let _ = expirySeconds {
                expiryCountdownView
            }

            // Instructions
            instructionsView
        }
        .padding(20)
        .onAppear {
            startExpiryTimer()
        }
        .onDisappear {
            stopExpiryTimer()
        }
    }

    // MARK: - QR Code Image

    private var qrCodeImage: some View {
        Group {
            if let cgImage = generateQRCode(from: qrString) {
                Image(decorative: cgImage, scale: 1.0)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 200, height: 200)
            } else {
                Image(systemName: "qrcode")
                    .font(.system(size: 100))
                    .foregroundColor(.gray)
                    .frame(width: 200, height: 200)
            }
        }
    }

    private func generateQRCode(from string: String) -> CGImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else {
            return nil
        }

        // Scale up the QR code
        let scale = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = outputImage.transformed(by: scale)

        return context.createCGImage(scaledImage, from: scaledImage.extent)
    }

    // MARK: - Expiry Countdown

    private var expiryCountdownView: some View {
        HStack(spacing: 8) {
            Image(systemName: "clock")
                .foregroundColor(remainingSeconds < 30 ? .orange : .secondary)

            Text("Expires in \(formatTime(remainingSeconds))")
                .font(.subheadline)
                .foregroundColor(remainingSeconds < 30 ? .orange : .secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(remainingSeconds < 30 ? Color.orange.opacity(0.1) : Color.secondary.opacity(0.1))
        )
    }

    private func formatTime(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", minutes, secs)
    }

    private func startExpiryTimer() {
        guard expirySeconds != nil else { return }

        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if remainingSeconds > 0 {
                remainingSeconds -= 1
            } else {
                stopExpiryTimer()
            }
        }
    }

    private func stopExpiryTimer() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: - Instructions

    private var instructionsView: some View {
        VStack(spacing: 8) {
            Text("Scan with ABA Mobile")
                .font(.subheadline)
                .fontWeight(.medium)

            Text("Open ABA Mobile app and scan the QR code to complete payment")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}