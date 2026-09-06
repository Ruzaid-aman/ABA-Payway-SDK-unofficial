/**
 * payment-link-pushback-receiver.js — payment-link pushback handler (Node.js)
 *
 * Standalone, runnable Express.js handler for the payment-link pushback —
 * the payment notification PayWay POSTs to the link's decoded `return_url`.
 * Copy this file into your project and mount it as a route.
 *
 * Usage:
 *   const pushbackRouter = require('./payment-link-pushback-receiver');
 *   app.use('/payway/pushback', pushbackRouter);
 *
 * Live-captured contract (ABA sandbox, 2026-09-06 — verified with a real
 * payment; see docs/17-payment-link.md §17.6):
 *   POST  Content-Type: application/json; charset=utf-8
 *   User-Agent: PayWayApp/3.0
 *   Body: {"tran_id":"…","status":0,"merchant_ref_no":"…"}
 *
 * ⚠ The pushback carries NO `hash` field — it is a NOTIFICATION, not a
 * signed webhook. `verifyCallback()` does NOT apply. The payment itself is
 * verified server-side via check-transaction using the pushed `tran_id`.
 * `status` arrives as the NUMERIC 0 (APPROVED); the official sample shows
 * the string "00" — accept both. One pushback fires per completed payment.
 */

const express = require('express');
const { PayWay } = require('aba-payway-ts');

const router = express.Router();

// The SDK client is only used for the verification call — credentials come
// from your environment / profile (see docs/02-prerequisites-and-setup.md).
const payway = new PayWay();

router.post('/', express.json({ type: ['application/json', 'application/json; charset=utf-8'] }), async (req, res) => {
  // ACK immediately — process after responding. The gateway retries/drops on
  // non-200; never do slow work before answering.
  res.status(200).json({ acknowledged: true });

  const body = req.body ?? {};

  // Coerce the learned shape: tran_id string, status numeric 0 (or "00").
  const tranId = body.tran_id !== undefined && body.tran_id !== null ? String(body.tran_id) : undefined;
  const approved = body.status === 0 || body.status === '0' || body.status === '00';
  const merchantRefNo = body.merchant_ref_no;

  if (!tranId) {
    console.error('[PayWay Pushback] body missing tran_id — not a payment notification:', body);
    return;
  }
  if (!approved) {
    // Unknown status value: log and reconcile manually until ABA documents
    // the full value set (see docs/12 error/status tables).
    console.warn(`[PayWay Pushback] unrecognized status ${JSON.stringify(body.status)} for tran_id ${tranId}`);
    return;
  }

  try {
    // The pushback is unauthenticated by design — THIS call is the trust
    // anchor: ask the gateway whether the transaction really is APPROVED.
    const check = await payway.checkout.checkTransaction(tranId);
    if (check.data?.payment_status === 'APPROVED') {
      console.log(`[PayWay Pushback] APPROVED tran_id=${tranId} merchant_ref_no=${merchantRefNo ?? '-'}`);
      // TODO: mark your order/invoice paid here (idempotently — pushbacks
      // can in principle repeat for multi-payment links).
    } else {
      console.warn(
        `[PayWay Pushback] tran_id=${tranId} pushback claimed approval but gateway says ${check.data?.payment_status}`,
      );
    }
  } catch (error) {
    console.error(`[PayWay Pushback] check-transaction failed for tran_id=${tranId}:`, error.message);
    // Queue for retry — do not fulfill on an unknown outcome.
  }
});

module.exports = router;
