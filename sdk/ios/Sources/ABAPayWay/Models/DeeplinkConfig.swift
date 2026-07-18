import Foundation

/// Configuration for deep linking back to the merchant app
public struct DeeplinkConfig: Codable, Equatable {
    /// iOS custom URL scheme (e.g., "myapp://payway/callback")
    public let iosScheme: String

    /// Android custom URL scheme (e.g., "myapp://payway/callback")
    public let androidScheme: String

    /// Creates a new deep link configuration
    /// - Parameters:
    ///   - iosScheme: iOS custom URL scheme
    ///   - androidScheme: Android custom URL scheme
    public init(iosScheme: String, androidScheme: String) {
        self.iosScheme = iosScheme
        self.androidScheme = androidScheme
    }

    /// Returns the iOS return URL for PayWay callbacks
    /// - Returns: The full return URL string
    public func iosReturnUrl() -> String {
        return iosScheme
    }

    /// Returns the Android return URL for PayWay callbacks
    /// - Returns: The full return URL string
    public func androidReturnUrl() -> String {
        return androidScheme
    }
}