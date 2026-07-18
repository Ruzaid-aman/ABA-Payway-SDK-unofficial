import UIKit
import SwiftUI

/// UIKit view controller wrapper for the QRDisplayView SwiftUI view
public class QRDisplayViewController: UIViewController {

    private let qrString: String
    private let amount: Decimal?
    private let currency: Currency?
    private let template: QRImageTemplate
    private let expirySeconds: Int?

    /// Creates a new QR display view controller
    /// - Parameters:
    ///   - qrString: The QR code string to display
    ///   - amount: Optional amount to display
    ///   - currency: Optional currency to display
    ///   - template: The QR image template style
    ///   - expirySeconds: Optional expiry countdown in seconds
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
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground

        let qrDisplayView = QRDisplayView(
            qrString: qrString,
            amount: amount,
            currency: currency,
            template: template,
            expirySeconds: expirySeconds
        )

        let hostingController = UIHostingController(rootView: qrDisplayView)
        addChild(hostingController)
        view.addSubview(hostingController.view)

        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
    }
}