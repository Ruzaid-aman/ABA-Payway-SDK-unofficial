package kh.com.canadiabank.paymentgateway_sample_android;

import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Logger;

/**
 * A mock PaymentManager to simulate creating and verifying payments.
 * <p>
 * This class mimics the flow of a real payment provider:
 * 1. A payment is created, generating a deeplink.
 * 2. The payment is marked as PENDING.
 * 3. When the user returns to the app, the payment status is verified.
 * 4. The verification result (SUCCESS or FAILED) is determined randomly.
 */
public class PaymentManager {

    private static final Logger LOGGER = Logger.getLogger(PaymentManager.class.getName());

    private final PaymentListener listener;
    private final Executor backgroundExecutor;

    private PaymentStatus currentPaymentStatus = PaymentStatus.IDLE;
    private String pendingTransactionId;

    /**
     * Constructs a PaymentManager.
     *
     * @param listener The listener to receive callbacks for payment events.
     */
    public PaymentManager(PaymentListener listener) {
        this.listener = listener;
        this.backgroundExecutor = Executors.newSingleThreadExecutor(); // Simulate background work.
    }

    /**
     * Simulates creating a payment request with a payment provider.
     * <p>
     * On success, it provides a deeplink via the listener and marks the payment as PENDING.
     * This method runs asynchronously to mimic a network call.
     *
     * @param amount   The payment amount.
     * @param currency The currency code (e.g., "USD").
     * @param externalId The merchant transaction Id
     */
    public void createPayment(double amount, String currency, String externalId) {
        LOGGER.info("Creating payment for " + amount + " " + currency);

        backgroundExecutor.execute(() -> {
            try {
                // Simulate network latency (1-2 seconds).
                Thread.sleep(1500);


                pendingTransactionId = externalId;
                currentPaymentStatus = PaymentStatus.PENDING;

                // Simulate creating a deeplink for a fictional banking app.
                String deeplink = "https://pay-uat.canadiabank.com/AAAAAAAA";//return from API
                LOGGER.info("Payment created successfully. Deeplink: " + deeplink);

                // Notify listener on the main thread (in a real Android app).
                listener.onPaymentCreationSuccess(deeplink);

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                LOGGER.severe("Payment creation failed: " + e.getMessage());
                listener.onPaymentCreationFailure("Payment creation was interrupted.");
            }
        });
    }

    /**
     * Simulates verifying the payment status when the user returns to the app.
     * <p>
     * This should be called in the Activity's onResume() method. It checks if there is a
     * pending payment and randomly determines if it succeeded or failed.
     */
    public void verifyPayment() {
        if (currentPaymentStatus != PaymentStatus.PENDING) {
            LOGGER.info("No pending payment to verify.");
            return;
        }

        LOGGER.info("Verifying payment for transaction: " + pendingTransactionId);
        currentPaymentStatus = PaymentStatus.VERIFYING;

        backgroundExecutor.execute(() -> {
            try {
                // Simulate network latency for verification (2-3 seconds).
                Thread.sleep(2500);

                // In a real scenario, you'd make a network call to your backend.
                // Here, we randomly decide the outcome.
                boolean paymentSucceeded = ThreadLocalRandom.current().nextBoolean();

                if (paymentSucceeded) {
                    currentPaymentStatus = PaymentStatus.SUCCESS;
                    LOGGER.info("Verification result: SUCCESS");
                    listener.onPaymentVerificationComplete(PaymentStatus.SUCCESS, "Your payment was successful!");
                } else {
                    currentPaymentStatus = PaymentStatus.FAILED;
                    LOGGER.warning("Verification result: FAILED");
                    listener.onPaymentVerificationComplete(PaymentStatus.FAILED, "Your payment failed. Please try again.");
                }

                // Reset transaction after completion.
                pendingTransactionId = null;

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                currentPaymentStatus = PaymentStatus.FAILED;
                LOGGER.severe("Payment verification failed: " + e.getMessage());
                listener.onPaymentVerificationComplete(PaymentStatus.FAILED, "Could not verify payment status.");
            }
        });
    }
}