import { PayWay, type PayWayConfig } from 'aba-payway-ts';
import type { Attempt, Gateway } from './service.js';

export function paywayGateway(config: PayWayConfig, callbackUrl: string): Gateway {
  const payway = new PayWay(config);
  return {
    async create(attempt) {
      const amount = attempt.amountMinor / 100; // Internal minor units; PayWay takes decimal currency amounts.
      if (attempt.route === 'qr') {
        const result = await payway.qr.generateQr({
          transactionId: attempt.attemptId,
          amount,
          currency: attempt.currency,
          callbackUrl,
          paymentOption: 'abapay_khqr',
          lifetime: 360,
        });
        if (!result.qrString) throw new Error('Missing QR artifact');
        return { artifact: { kind: 'qr', qrString: result.qrString } };
      }
      if (attempt.route === 'hosted') {
        return {
          artifact: {
            kind: 'hosted',
            html: payway.checkout.getCheckoutFormHtml({
              transactionId: attempt.attemptId,
              amount,
              currency: attempt.currency,
              returnUrl: callbackUrl,
              paymentOption: 'cards',
              paymentGate: 0,
              lifetime: 6,
            }),
          },
        };
      }
      const result = await payway.paymentLink.create({
        title: `Order ${attempt.id}`,
        amount,
        currency: attempt.currency,
        merchantRefNo: attempt.attemptId,
        returnUrl: callbackUrl,
        paymentLimit: 1,
        expiredDate: Math.floor(Date.now() / 1000) + 600,
      });
      if (!result.data?.id || !result.data.payment_link) throw new Error('Missing payment-link artifact');
      // Top-level result.tran_id is NOT the subsequent customer transaction.
      return { linkId: result.data.id, artifact: { kind: 'link', url: result.data.payment_link } };
    },
    async lookup(attempt: Attempt) {
      if (attempt.route === 'link') {
        if (!attempt.linkId)
          throw new Error('Unknown link-create outcome: recover link ID with merchant records; do not recreate');
        const result = await payway.paymentLink.getDetails(attempt.linkId);
        const data = result.data;
        // Query the SAVED link, never a link ID or payment amount supplied in an unsigned notification.
        // A one-payment link's trusted totals bind approval to the merchant's own order.
        if (!data || data.id !== attempt.linkId || data.merchant_ref_no !== attempt.attemptId)
          throw new Error('Payment-link inquiry identity mismatch');
        const refunded = Number(data.total_refund);
        const paid = Number(data.total_trxn) === 1 && Number.isFinite(refunded) && refunded === 0;
        return {
          identity: data.merchant_ref_no,
          status: paid ? 'APPROVED' : 'PENDING',
          amount: Number(data.total_amount_org),
          currency: String(data.currency ?? ''),
        };
      }
      const result = await payway.checkout.getTransactionDetail(attempt.attemptId);
      const data = result.data;
      // Inquiry amount due/original currency, NOT payer debit fields (which can differ).
      return {
        identity: String(data?.transaction_id ?? ''),
        status: String(data?.payment_status ?? ''),
        amount: data?.total_amount ?? Number.NaN,
        currency: String(data?.original_currency ?? ''),
      };
    },
  };
}
