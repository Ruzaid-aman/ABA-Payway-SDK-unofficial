/**
 * webhook-receiver.js — PayWay webhook callback handler (Node.js)
 *
 * This is a standalone, runnable Express.js webhook handler.
 * Copy this file into your project and mount it as a route.
 *
 * Usage:
 *   const webhookRouter = require('./webhook-receiver');
 *   app.use('/api/payway-webhook', webhookRouter);
 *
 * Verified against PayWay Sandbox: uses HMAC-SHA512 with sorted-key algorithm.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// ============================================
// Configuration — set these from your environment
// ============================================
const API_KEY = process.env.PAYWAY_API_KEY;

// ============================================
// Helper: Verify callback signature (sorted-key HMAC-SHA512)
// ============================================
function verifySignature(body, receivedHash, apiKey) {
  // Step 1: Sort keys alphabetically
  var sortedKeys = Object.keys(body).sort();

  // Step 2: Concatenate all values
  // Objects/arrays are JSON-stringified, null/undefined become empty string
  var concatenated = '';
  for (var i = 0; i < sortedKeys.length; i++) {
    var key = sortedKeys[i];
    var value = body[key];

    if (value === undefined || value === null) {
      continue; // Empty string
    }

    if (typeof value === 'object') {
      concatenated += JSON.stringify(value);
    } else {
      concatenated += String(value);
    }
  }

  // Step 3: Compute HMAC-SHA512
  var computedHash = crypto
    .createHmac('sha512', apiKey)
    .update(concatenated)
    .digest('base64');

  // Step 4: Timing-safe comparison
  var computedBuf = Buffer.from(computedHash);
  var receivedBuf = Buffer.from(receivedHash);

  if (computedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}

// ============================================
// POST / — Webhook endpoint
// ============================================
router.post('/', function(req, res) {
  // Validate request body
  if (!req.body || typeof req.body !== 'object') {
    console.error('[PayWay Webhook] Invalid request body');
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // Extract hash from body
  var receivedHash = req.body.hash;
  if (!receivedHash) {
    console.error('[PayWay Webhook] Missing hash field');
    return res.status(400).json({ error: 'Missing hash field' });
  }

  // Remove hash from body (we verify WITHOUT it)
  var bodyWithoutHash = Object.assign({}, req.body);
  delete bodyWithoutHash.hash;

  // Verify signature
  var isValid = verifySignature(bodyWithoutHash, receivedHash, API_KEY);

  if (!isValid) {
    console.warn('[PayWay Webhook] INVALID signature rejected', {
      tran_id: req.body.tran_id,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Payment confirmed!
  var tranId = req.body.tran_id;
  var amount = req.body.amount;
  var currency = req.body.currency;

  console.log('[PayWay Webhook] Payment confirmed:', tranId, amount, currency);

  // Respond IMMEDIATELY — PayWay expects within ~5 seconds
  res.status(200).json({ received: true, tran_id: tranId });

  // Process payment after responding (async, non-blocking)
  processPayment(req.body).catch(function(err) {
    console.error('[PayWay Webhook] Post-processing failed:', err);
  });
});

// ============================================
// Process payment (runs after responding)
// ============================================
async function processPayment(callbackData) {
  var tranId = callbackData.tran_id;
  var amount = callbackData.amount;
  var currency = callbackData.currency;

  // TODO: Replace with your database logic
  // Example using PostgreSQL:
  //
  // await db.query(`
  //   INSERT INTO orders (tran_id, status, amount, currency, paid_at)
  //   VALUES ($1, 'paid', $2, $3, NOW())
  //   ON CONFLICT (tran_id) DO NOTHING
  // `, [tranId, amount, currency]);
  //
  // Example: Send confirmation email
  // await emailService.sendConfirmation(tranId);
  //
  // Example: Update inventory
  // await inventoryService.decrement(tranId);

  console.log('[PayWay Webhook] Order processed:', tranId);
}

module.exports = router;

// ============================================
// Standalone test (runs if executed directly)
// ============================================
if (require.main === module) {
  var app = express();
  app.use(express.json());

  // Mount webhook handler at /api/payway-webhook
  app.use('/api/payway-webhook', router);

  // Health check
  app.get('/health', function(req, res) {
    res.json({ status: 'ok' });
  });

  var PORT = process.env.PORT || 3000;
  app.listen(PORT, function() {
    console.log('Webhook receiver running on port ' + PORT);
    console.log('Webhook URL: http://localhost:' + PORT + '/api/payway-webhook');
    console.log('');
    console.log('To test:');
    console.log('  curl -X POST http://localhost:' + PORT + '/api/payway-webhook \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"tran_id":"test-001","amount":"15.00","currency":"USD","hash":"..."}\'');
  });
}