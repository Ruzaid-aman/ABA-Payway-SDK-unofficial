<?php
/**
 * webhook-receiver.php — PayWay webhook callback handler (PHP)
 *
 * This is a standalone PHP script for receiving PayWay callbacks.
 * Place this file at your webhook endpoint URL.
 *
 * Requirements: PHP 7.4+, no external dependencies
 *
 * Verified against PayWay Sandbox:
 * - Uses HMAC-SHA512 (NOT SHA-256)
 * - Uses sorted-key algorithm
 * - Uses string concatenation (NOT arithmetic +)
 */

// ============================================
// Configuration — set from environment or config
// ============================================
$API_KEY = getenv('PAYWAY_API_KEY');

if (!$API_KEY) {
    error_log('[PayWay Webhook] API key not configured');
    http_response_code(500);
    echo json_encode(['error' => 'Server configuration error']);
    exit;
}

// ============================================
// Read and validate the request
// ============================================
$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody, true);

if (!$body || !is_array($body)) {
    error_log('[PayWay Webhook] Invalid request body');
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request body']);
    exit;
}

if (!isset($body['hash'])) {
    error_log('[PayWay Webhook] Missing hash field');
    http_response_code(400);
    echo json_encode(['error' => 'Missing hash field']);
    exit;
}

// ============================================
// Step 1: Extract and remove the hash field
// ============================================
$receivedHash = $body['hash'];
unset($body['hash']);

// ============================================
// Step 2: Sort the remaining keys alphabetically
// ============================================
ksort($body);

// ============================================
// Step 3: Concatenate all values
// Objects/arrays are JSON-encoded
// Null values become empty string
// IMPORTANT: Use . (string concatenation), NOT + (arithmetic)
// PayWay's own sample code incorrectly uses +, which produces "Wrong Hash"
// ============================================
$concatenated = '';
foreach ($body as $key => $value) {
    if ($value === null) {
        continue; // Empty string (skip)
    }
    if (is_array($value) || is_object($value)) {
        $concatenated .= json_encode($value);
    } else {
        $concatenated .= (string)$value;
    }
}

// ============================================
// Step 4: Compute HMAC-SHA512
// ============================================
$computedHash = base64_encode(
    hash_hmac('sha512', $concatenated, $API_KEY, true)
);

// ============================================
// Step 5: Timing-safe comparison
// Prevents attackers from guessing the signature
// one character at a time
// ============================================
if (!hash_equals($computedHash, $receivedHash)) {
    $tranId = $body['tran_id'] ?? 'unknown';
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    error_log("[PayWay Webhook] INVALID signature rejected - tran_id: {$tranId}, ip: {$clientIp}");

    http_response_code(400);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// ============================================
// Step 6: Payment confirmed — process the order
// ============================================
$tranId = $body['tran_id'] ?? null;
$amount = $body['amount'] ?? null;
$currency = $body['currency'] ?? null;

if ($tranId) {
    error_log("[PayWay Webhook] Payment confirmed: {$tranId} - {$amount} {$currency}");

    // TODO: Update your database here
    // Example with PDO:
    //
    // $stmt = $db->prepare(
    //     'INSERT INTO orders (tran_id, status, amount, currency, paid_at)
    //      VALUES (:tran_id, :status, :amount, :currency, NOW())
    //      ON DUPLICATE KEY UPDATE status = :status2'
    // );
    // $stmt->execute([
    //     'tran_id' => $tranId,
    //     'status' => 'paid',
    //     'amount' => $amount,
    //     'currency' => $currency,
    //     'status2' => 'paid'
    // ]);

    // Example: Send confirmation email
    // mail($customerEmail, 'Payment Confirmed', "Your payment of {$amount} {$currency} has been received.");
}

// ============================================
// Step 7: Respond HTTP 200 IMMEDIATELY
// PayWay expects a response within ~5 seconds
// ============================================
http_response_code(200);
echo json_encode(['received' => true, 'tran_id' => $tranId]);