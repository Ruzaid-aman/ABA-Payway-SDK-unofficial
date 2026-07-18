import UIKit
import SwiftUI

/// UIKit view controller wrapper for the PaymentSheet SwiftUI view
public class PaymentSheetViewController: UIViewController {

    private let config: PaymentSheetConfig
    private weak var delegate: ABAPayWayDelegate?

    /// Creates a new payment sheet view controller
    /// - Parameters:
    ///   - config: The payment configuration
    ///   - delegate: The delegate to receive payment callbacks
    public init(config: PaymentSheetConfig, delegate: ABAPayWayDelegate?) {
        self.config = config
        self.delegate = delegate
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()

        let paymentSheetView = PaymentSheetView(
            config: config,
            onComplete: { [weak self] result in
                self?.handleResult(result)
            },
            onCancel: { [weak self] in
                self?.handleCancel()
            }
        )

        let hostingController = UIHostingController(rootView: paymentSheetView)
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

    private func handleResult(_ result: PaymentResult) {
        delegate?.paymentSheet(self, didCompleteWithResult: result)
        dismiss(animated: true)
    }

    private func handleCancel() {
        delegate?.paymentSheetDidCancel(self)
        dismiss(animated: true)
    }
}

// MARK: - PaymentSheet Delegate Conformance

/// Extension to make PaymentSheetViewController conform to PaymentSheet protocol
extension PaymentSheetViewController: PaymentSheet {
    // PaymentSheet is a protocol marker for delegate callbacks
}