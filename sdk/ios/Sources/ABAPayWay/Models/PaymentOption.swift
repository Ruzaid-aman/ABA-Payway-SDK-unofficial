import Foundation

/// Payment options supported by PayWay
public enum PaymentOption: String, Codable, CaseIterable {
    /// ABA KHQR - Standard QR payment
    case abaKHQR = "abapay_khqr"

    /// ABA KHQR with deeplink to ABA Mobile
    case abaKHQRDeeplink = "abapay_khqr_deeplink"

    /// Card payments (Visa, MasterCard, JCB)
    case cards = "cards"

    /// Alipay payments
    case alipay = "alipay"

    /// WeChat Pay
    case wechat = "wechat"

    /// Google Pay
    case googlePay = "google_pay"

    /// Returns a human-readable name for the payment option
    public var displayName: String {
        switch self {
        case .abaKHQR:
            return "ABA KHQR"
        case .abaKHQRDeeplink:
            return "ABA Mobile"
        case .cards:
            return "Cards"
        case .alipay:
            return "Alipay"
        case .wechat:
            return "WeChat Pay"
        case .googlePay:
            return "Google Pay"
        }
    }

    /// Returns the icon name for the payment option (SF Symbols)
    public var iconName: String {
        switch self {
        case .abaKHQR, .abaKHQRDeeplink:
            return "qrcode"
        case .cards:
            return "creditcard"
        case .alipay:
            return "a.circle"
        case .wechat:
            return "w.circle"
        case .googlePay:
            return "g.circle"
        }
    }
}