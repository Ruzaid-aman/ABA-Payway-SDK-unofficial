import Foundation

/// An item in a payment request
public struct PaymentItem: Codable, Equatable {
    /// The name of the item
    public let name: String

    /// The quantity of the item
    public let quantity: Int

    /// The price per unit
    public let price: Decimal

    /// Creates a new payment item
    /// - Parameters:
    ///   - name: The name of the item
    ///   - quantity: The quantity (must be >= 1)
    ///   - price: The price per unit (must be >= 0)
    public init(name: String, quantity: Int, price: Decimal) {
        self.name = name
        self.quantity = quantity
        self.price = price
    }
}