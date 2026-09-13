package kh.com.canadiabank.paymentgateway_sample_android;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;

import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.LinkedHashMap;

import kh.com.canadiabank.sdk.SecurityLibrary;


public class MainActivity extends AppCompatActivity {

    private TextView resultTextView;
    private Button signButton;
    private Button hashButton;
    private Button paymentButton;


    private static final LinkedHashMap<String, String> HASH_PARAMS;
    private static final String HASH_API_KEY = "your_hash_key_here";

    static {
        HASH_PARAMS = new LinkedHashMap<>();
        HASH_PARAMS.put("amount", "1000");
        HASH_PARAMS.put("externalId", "myExternalId004");
        HASH_PARAMS.put("ccy", "KHR");
        HASH_PARAMS.put("qrTemplate", "BG_RED");
    }

    // Test Data
    private static final String SIGNATURE_DATA_TO_SIGN = "Hello server from client";
    // Test PrivateKey
    private static final String SIGNATURE_PRIVATE_KEY_B64 =
            "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCDqYKQfLr+ohFP6yV0jfT9hZNpyWHxOSzbC4J1ngkTM+D+mxu5gV/5uA1HysfLSDvym8/Mb8O8oOE+ckKtZb1F4bbZXbQoXiOLxw05mRwT7QwB3PuRp78kdRdOjcHi3gjc0QXbWkjBsrYEddvX+xqvL7v8r6ILk23rBH3C/P1wtBQacm3GxCcr7ZeUi6XYKLEoby1IGPNZEL9Qg5SQwPQDfx91LpA6aHszIBgz6OfVS1Hl3ZyAmrHnt9Zlw12xCj5dEEHGKrnpBWIykQh8ke0njaJvvTPQyYJtlbszRTQCx4pyh82Eo0OL6LlnO4Dl8PAi2k5SuZ3XK0nvhgi7oBUPAgMBAAECggEAalGl53txnVHOXRTr6BUCMv98rL48YwjimffPX59AgMsx8yfZ2ZEJqaPgxYqQkC1Ci4Ua5mGSVG4ttbma8l7n2tiMSTcL1lU+qw8QNOTY8ZZITfDfDR3CknQjYAHFAah+y6HW8u0TN6dSqINsBhr1z2Xijghd+K8S4ed8jsqw9iKsWVGPYk/14wBaIabEvEOYtSG79U+hRMgtONf07Taul1j4ltXaTkezuc6+M4s8MUf0fUYd5JZfLc+VpvDwr+CB4zHD9WTy/I/VsqFayEuazt4TET3vFxvRnFXlb/BGlTYO89upWdGpv1Bf6bJFcK+WWkQvb/I0hfjKcFhrGjwZ8QKBgQC53yQK95uLwmJQ3osyX2HeXMi0PN7AnuBSwPy3QWVDT6ajmzKygGACPtSM/kfFITXOE5i4QKcXwg+3ok/5Haq/orp6XGCy+WgYrql89viWEhCL+SDt97OXvH6rH4tis4e0dX/6JQznlNlDHLyJ6YSG6ezhkLGAo/8JU4Vzp9+F2wKBgQC1Vmo3aNVYrBDHyiZOU3DSMTFipthz5L2k9+kDu14SNnvtU3TImzqlHwuB6Sn7+TVdaD339pjsUA6Ovp7JCugj89BK7xxTw7T/ltoZok07+6mtqVlVI3WsMWgqjC+VjUybCB1dfZ9DEUwgKs+KBqAPC8X+FuE6wUbk79kX3XjF3QKBgHvEGOTwoXN7mSnONhPxrWJ6l+5kRdMvN6IC/YQtGHestwJkGmr/zm5QVgoYW8Po7EHvjJbL/jd0sjCN9QClf4ghnFhT4NPr/SPKUfNzJG4RU1FRL1slwEF+cz4RQCgV8Xv5baEsQJ6H3++vV9/hTazkYSaFyZwmF3GnWsp7cvxXAoGAVM3iBKHBTKPDgTvXqD+7foFFAEbY6XIrApBx563jc48Ja9bgwcReq8QWBJ4/ZTiJrXJHsMQhhjp2ZGlfJtQz9kRawACM9duLtRAeVWiiyA+MrcuKHJfluy6r8WH4Cu+2yLYFzagnKB1ZxZ1fy8QHbKHr6UVX9btX5U8J7vBDP/0CgYA2wq7AP6hptYKi+PiJurMnsbKR0DqFNmXr9qRO+bVasc3GhjvjzQIBTIIzIIE68JLusAbrwAcLbL/6o/fhQWdTFp9Ws4HzUG406CXFIb8RPdCGuZfm8aGwifbGZe/hqWTt5tqsMfFKcQnZXrRhp+xWx1sEWEnbwIm25aneOfLAjQ==";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);


        resultTextView = findViewById(R.id.resultTextView);
        signButton = findViewById(R.id.signButton);
        hashButton = findViewById(R.id.hashButton);
        paymentButton = findViewById(R.id.paymentButton);


        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        paymentButton.setOnClickListener(v -> {
            Intent intent = new Intent(MainActivity.this, PaymentActivity.class);
            startActivity(intent);
        });

        signButton.setOnClickListener(v -> {
            resultTextView.setText("Calculating signature...");
            new Thread(this::performSignatureTest).start();
        });

        hashButton.setOnClickListener(v -> {
            resultTextView.setText("Calculating hash...");
            new Thread(this::performHashTest).start();
        });
    }

    // Method to perform the signature test (no change needed here)
    private void performSignatureTest() {

        String result;

        try {
            String signature = SecurityLibrary.getInstance().sign(SIGNATURE_DATA_TO_SIGN, SIGNATURE_PRIVATE_KEY_B64);
            result = "--- RSA SIGNATURE RESULT ---\n\nData: " + SIGNATURE_DATA_TO_SIGN + "\n\nSignature:\n" + signature;
            Log.d("SIGNATURE", "signature = " + signature);
        } catch (Exception e) {
            e.printStackTrace();
            result = "ERROR (SIGNATURE): Failed to sign data.\n" + e.getMessage();
        }

        final String finalResult = result;
        runOnUiThread(() -> resultTextView.setText(finalResult));
    }

    // Method to perform the hash test (UPDATED CALL)
    private void performHashTest() {
        // Generate a pseudo-timestamp for the payload
        long timestampMs = System.currentTimeMillis();

        // 1. Concatenate the parameters based on the Map's insertion order (UPDATED CALL)
        String sortedParamsString = sortAndHashParams(HASH_PARAMS);

        // 2. Build the final payload
        String finalPayload = sortedParamsString + timestampMs + HASH_API_KEY;

        String result;

        try {
            // 3. Calculate the hash
            String finalHash = SecurityLibrary.getInstance().hash(finalPayload);

            result = "--- SHA-256 HASH RESULT ---\n\n" +
                    "Sorted Params: " + sortedParamsString + "\n" +
                    "Timestamp: " + timestampMs + "\n" +
                    "Final Payload:\n" + finalPayload + "\n\n" +
                    "Final Hash:\n" + finalHash;

        } catch (Exception e) {
            e.printStackTrace();
            result = "ERROR (HASH): Failed to calculate hash.\n" + e.getMessage();
        }

        // Update the UI on the main thread
        final String finalResult = result;
        runOnUiThread(() -> resultTextView.setText(finalResult));
    }

    private String sortAndHashParams(LinkedHashMap<String, String> params) {
        StringBuilder sb = new StringBuilder();
        for (String value : params.values()) {
            sb.append(value);
        }
        return sb.toString();
    }
}