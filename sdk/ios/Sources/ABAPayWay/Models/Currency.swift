import Foundation

/// Supported currencies for PayWay transactions
public enum Currency: String, Codable, CaseIterable {
    case usd = "USD"
    case khr = "KHR"

    /// Returns the symbol for the currency
    public var symbol: String {
        switch self {
        case .usd:
            return "$"
        case .khr:
            return "៛"
        }
    }

    /// Returns the number of decimal places for the currency
    public var decimalPlaces: Int {
        switch self {
        case .usd:
            return 2
        case .khr:
            return 0
        }
    }

    /// Formats an amount with the currency symbol
    /// - Parameter amount: The amount to format
    /// - Returns: A formatted string representation
    public func format(_ amount: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = decimalPlaces
        formatter.maximumFractionDigits = decimalPlaces

        guard let formatted = formatter.string(from: amount as NSDecimalNumber) else {
            return "\(symbol)\(amount)"
        }

        return "\(symbol)\(formatted)"
    }
}