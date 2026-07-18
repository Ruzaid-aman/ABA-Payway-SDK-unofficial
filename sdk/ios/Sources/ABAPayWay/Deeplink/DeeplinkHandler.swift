import Foundation

/// Handler for ABA PayWay deep links
public final class DeeplinkHandler {

    /// ABA Mobile app URL scheme
    private static let abaMobileScheme = "abamobilebank"

    /// App Store URL for ABA Mobile
    private static let appStoreUrl = "https://apps.apple.com/kh/app/aba/id694113249"

    /// Google Play URL for ABA Mobile
    private static let googlePlayUrl = "https://play.google.com/store/apps/details?id=com.aba.mobile"

    public init() {}

    /// Opens ABA Mobile app with the payment deep link
    /// - Parameter deeplink: The ABA PayWay deep link (e.g., "abamobilebank://...")
    /// - Returns: True if ABA Mobile is installed and the deep link was opened, false otherwise
    public func openABAMobile(deeplink: String) -> Bool {
        guard let url = URL(string: deeplink) else {
            return false
        }

        return openURL(url)
    }

    /// Opens ABA Mobile app with a QR code
    /// - Parameter qrCode: The KHQR string from the QR response
    /// - Returns: True if ABA Mobile is installed and opened successfully, false otherwise
    public func openABAMobile(qrCode: String) -> Bool {
        // Construct the deeplink with the QR code
        let deeplink = "abamobilebank://pay?qrcode=\(qrCode.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? qrCode)"
        return openABAMobile(deeplink: deeplink)
    }

    /// Checks if ABA Mobile is installed on the device
    /// - Returns: True if ABA Mobile is installed
    public func isABAMobileInstalled() -> Bool {
        guard let url = URL(string: "\(DeeplinkHandler.abaMobileScheme)://") else {
            return false
        }
        return canOpenURL(url)
    }

    /// Gets the app store URL for ABA Mobile
    /// - Returns: The URL to ABA Mobile in the app store
    public func getAppStoreURL() -> URL? {
        return URL(string: DeeplinkHandler.appStoreUrl)
    }

    /// Gets the Google Play URL for ABA Mobile
    /// - Returns: The URL to ABA Mobile on Google Play
    public func getGooglePlayURL() -> URL? {
        return URL(string: DeeplinkHandler.googlePlayUrl)
    }

    /// Handles a return deep link from PayWay
    ///
    /// Parses the deep link URL and extracts transaction details.
    /// The return URL format is typically: {iosScheme}?tran_id=xxx&status=xxx&apv=xxx&return_params=xxx
    ///
    /// - Parameter url: The return URL
    /// - Returns: The parsed deep link result
    public func handleReturnDeeplink(url: URL) -> DeeplinkResult {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return .invalid
        }

        // Check for explicit cancel
        if let status = components.queryItems?.first(where: { $0.name == "status" })?.value,
           status.lowercased() == "cancelled" {
            return .cancelled
        }

        // Extract transaction ID
        guard let tranId = components.queryItems?.first(where: { $0.name == "tran_id" })?.value else {
            return .invalid
        }

        // Extract status
        let status = components.queryItems?.first(where: { $0.name == "status" })?.value ?? "UNKNOWN"

        // Extract approval code (optional)
        let apv = components.queryItems?.first(where: { $0.name == "apv" })?.value

        // Extract return params (optional)
        let returnParams = components.queryItems?.first(where: { $0.name == "return_params" })?.value

        return .success(tranId: tranId, status: status, apv: apv, returnParams: returnParams)
    }

    /// Handles a return deep link from a URL string
    /// - Parameter urlString: The return URL string
    /// - Returns: The parsed deep link result
    public func handleReturnDeeplink(urlString: String) -> DeeplinkResult {
        guard let url = URL(string: urlString) else {
            return .invalid
        }
        return handleReturnDeeplink(url: url)
    }

    // MARK: - Private Helpers

    private func openURL(_ url: URL) -> Bool {
        guard canOpenURL(url) else {
            return false
        }

        #if os(iOS)
        // Use the shared application to open the URL
        // Note: This requires the caller to have already configured LSApplicationQueriesSchemes
        if #available(iOS 10.0, *) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        } else {
            UIApplication.shared.openURL(url)
        }
        #endif

        return true
    }

    private func canOpenURL(_ url: URL) -> Bool {
        #if os(iOS)
        return UIApplication.shared.canOpenURL(url)
        #else
        return false
        #endif
    }
}

// MARK: - URL Extension

private extension URL {
    var queryParameters: [String: String]? {
        guard let components = URLComponents(url: self, resolvingAgainstBaseURL: true),
              let queryItems = components.queryItems else {
            return nil
        }

        var parameters: [String: String] = [:]
        for item in queryItems {
            parameters[item.name] = item.value
        }
        return parameters
    }
}