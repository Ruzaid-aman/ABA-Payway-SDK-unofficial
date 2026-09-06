<?php
/**
 * payment-link-pushback-receiver.php — payment-link pushback handler (PHP)
 *
 * Standalone PHP script for the payment-link pushback — the payment
 * notification PayWay POSTs to the link's decoded `return_url`.
 * Place this file at your pushback endpoint URL.
 *
 * Requirements: PHP 7.4+, no external dependencies
 *
 * Live-captured contract (ABA sandbox, 2026-09-06 — verified with a real
 * payment; see docs/17-payment-link.md §17.6):
 *   POST  Content-Type: application/json; charset=utf-8
 *   User-Agent: PayWayApp/3.0
 *   Body: {"tran_id":"…","status":0,"merchant_ref_no":"…"}
 *
 * ⚠ The pushback carries NO `hash` field — it is a NOTIFICATION, not a
 * signed webhook. There is nothing to HMAC-verify; the SDK's
 * `verifyCallback()` does NOT apply. The payment itself is verified
 * server-side via the check-transaction API using the pushed `tran_id`. `status` arrives as the NUMERIC 0 (APPROVED); the official
 * sample shows the string "00" — accept both.
 */

// ============================================
// Read and validate the request
// ============================================
$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);

if (!is_array($body) || !isset($body['tran_id']) || (string) $body['tran_id'] === '') {
    error_log('[PayWay Pushback] body missing tran_id — not a payment notification');
    http_response_code(200); // ACK anyway: a 4xx invites retries of a non-pushback
    echo json_encode(['acknowledged' => false, 'reason' => 'missing tran_id']);
    exit;
}

$tranId = (string) $body['tran_id'];
$approved = ($body['status'] === 0 || $body['status'] === '0' || $body['status'] === '00');
$merchantRefNo = isset($body['merchant_ref_no']) ? (string) $body['merchant_ref_no'] : '';

// ACK immediately — process after responding.
http_response_code(200);
echo json_encode(['acknowledged' => true]);
// Fast CGI continues running after the response is flushed to the client.

if (!$approved) {
    error_log("[PayWay Pushback] unrecognized status for tran_id={$tranId}: " . json_encode($body['status']));
    exit;
}

// ============================================
// Verify the payment via check-transaction (the trust anchor — the pushback
// itself is unauthenticated by design)
// ============================================
// Reuse your existing SDK/CLI plumbing or call the check-transaction endpoint
// directly (docs/03-web-implementation.md). Pseudocode with the sandbox base:
//
//   POST https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2
//   body: { req_time, tran_id, hash }  (HMAC-SHA512 over req_time+tran_id, API key, base64)
//
// On APPROVED: mark the order paid (idempotently — pushbacks can repeat for
// multi-payment links), keyed on $tranId and/or $merchantRefNo.
error_log("[PayWay Pushback] APPROVED tran_id={$tranId} merchant_ref_no={$merchantRefNo} — verify via check-transaction before fulfilling");
