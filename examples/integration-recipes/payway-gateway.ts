import { PayWay, type PayWayConfig } from 'aba-payway-ts';
import { IntegrationError, type Attempt, type Gateway, type Scope } from './service.js';
import { toGatewayAmount } from './money.js';

// Conservative per-process detail spacing. Multi-process merchants must use a
// shared limiter/worker lease keyed by environment + MID + endpoint.
const detailBudgets = new Map<string, number>();
async function detailSlot(key: string) {
  const now = Date.now();
  const slot = Math.max(now, detailBudgets.get(key) ?? 0);
  detailBudgets.set(key, slot + 6100);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}
export function paywayGateway(config: PayWayConfig, callbackUrl: string, tenantId = 'single-merchant'): Gateway {
  if (!config.merchantId || !config.environment || !config.apiKey)
    throw new Error('Explicit merchant/environment/server key required');
  const payway = new PayWay(config);
  const scope: Scope = { environment: config.environment, merchantId: config.merchantId, tenantId };
  const budgetKey = JSON.stringify([config.baseUrl ?? scope.environment, scope.merchantId]);
  return {
    scope,
    validate(order) {
      const amount = toGatewayAmount(order.amountMinor, order.currency);
      if (amount < (order.currency === 'KHR' ? 100 : 0.01))
        throw new IntegrationError(400, 'Amount is below the supported payment floor');
    },
    async create(attempt) {
      const amount = toGatewayAmount(attempt.amountMinor, attempt.currency);
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
      return { linkId: result.data.id, artifact: { kind: 'link', url: result.data.payment_link } };
    },
    async lookup(attempt: Attempt) {
      if (attempt.route === 'link') {
        if (!attempt.linkId) throw new Error('Recover the unknown link ID with ABA; do not recreate');
        const result = await payway.paymentLink.getDetails(attempt.linkId);
        const data = result.data;
        if (!data || data.id !== attempt.linkId || data.merchant_ref_no !== attempt.attemptId)
          throw new Error('Payment-link inquiry identity mismatch');
        const refunded = Number(data.total_refund);
        const paid = Number(data.total_trxn) === 1 && Number.isFinite(refunded) && refunded === 0;
        return {
          identity: data.merchant_ref_no,
          status: paid ? 'APPROVED' : 'PENDING',
          amount: Number(data.total_amount_org),
          currency: String(data.currency ?? ''),
          // This aggregate is NOT a gateway receipt ID or bank settlement proof.
          receiptId: `link-total:${data.id}`,
          source: 'single-payment-link-total',
        };
      }
      const historical = attempt.createdAt !== undefined && Date.now() - attempt.createdAt >= 7 * 86400000;
      if (!historical) {
        const current = await payway.checkout.checkTransaction(attempt.attemptId);
        const identity = String(current.status?.tran_id ?? '');
        if (identity !== attempt.attemptId) throw new Error('Status inquiry identity mismatch');
        const status = String(current.data?.payment_status ?? 'UNKNOWN');
        if (status !== 'APPROVED')
          return { identity, status, amount: Number.NaN, currency: '', source: 'current-status' };
        // Approved current status alone does not carry original currency.
        // Enrich once with paced historical detail before financial acceptance.
      }
      await detailSlot(budgetKey);
      const result = await payway.checkout.getTransactionDetail(attempt.attemptId);
      const data = result.data;
      return {
        identity: String(data?.transaction_id ?? ''),
        status: String(data?.payment_status ?? 'UNKNOWN'),
        amount: data?.total_amount ?? Number.NaN,
        currency: String(data?.original_currency ?? ''),
        receiptId: String(data?.transaction_id ?? ''),
        source: 'transaction-detail',
      };
    },
  };
}
