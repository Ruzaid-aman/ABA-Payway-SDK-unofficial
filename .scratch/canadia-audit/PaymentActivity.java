package kh.com.canadiabank.paymentgateway_sample_android;


import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.UUID;

public class PaymentActivity extends AppCompatActivity implements PaymentListener {
    private PaymentManager paymentManager;
    private Button payButton;
    private TextView statusTextView;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_payment);

        // Initialize UI components
        payButton = findViewById(R.id.payButton);
        statusTextView = findViewById(R.id.statusTextView);
        progressBar = findViewById(R.id.progressBar);

        // Initialize the PaymentManager with this activity as the listener
        paymentManager = new PaymentManager(this);

        payButton.setOnClickListener(v -> {
            // When user clicks pay, start the payment creation process
            // Generate a unique transaction ID.
            final String externalId = UUID.randomUUID().toString();
            payButton.setEnabled(false);
            progressBar.setVisibility(View.VISIBLE);
            statusTextView.setText("Creating payment...");
            paymentManager.createPayment(40000, "KHR", externalId);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        // When user returns to the app, try to verify the payment
        paymentManager.verifyPayment();
    }

    @Override
    public void onPaymentCreationSuccess(String deeplink) {
        // Run on UI thread to update UI and launch deeplink
        runOnUiThread(() -> {
            progressBar.setVisibility(View.GONE);
            statusTextView.setText("Redirecting to your bank...");

            // Launch the banking app
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deeplink));
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                // Handle case where no app can handle the deeplink
                statusTextView.setText("Could not find a banking app to complete the payment.");
                payButton.setEnabled(true);
            }
        });
    }

    @Override
    public void onPaymentCreationFailure(String errorMessage) {
        runOnUiThread(() -> {
            progressBar.setVisibility(View.GONE);
            statusTextView.setText("Error: " + errorMessage);
            payButton.setEnabled(true);
        });
    }

    @Override
    public void onPaymentVerificationComplete(PaymentStatus status, String message) {
        runOnUiThread(() -> {
            progressBar.setVisibility(View.GONE);
            statusTextView.setText(message);
            payButton.setEnabled(true); // Allow user to try again if failed

            if (status == PaymentStatus.SUCCESS) {
                payButton.setVisibility(View.GONE); // Payment is done
            }
        });
    }
}
