import { PayWay } from '../../../src/client.js';

export interface PaymentLinkOptions {
  title: string;
  amount: number;
  merchantRefNo: string;
  returnUrl: string;
  currency: 'USD' | 'KHR';
  description?: string;
  paymentLimit?: number;
  expiredDate?: number;
  payout?: { acc: string; amt: number }[];
}

const payway = new PayWay({
  merchantId: 'SANDBOX_MERCHANT',
  apiKey: 'SANDBOX_API_KEY',
  publicKeyPem: 'SANDBOX_RSA_PUBLIC_KEY',
  environment: 'sandbox',
});

/**
 * Create a shareable payment link (RSA-encrypted merchant_auth is handled
 * by the SDK). Returns `{ data: { id, payment_link, … } }`.
 */
export function createPaymentLink(options: PaymentLinkOptions) {
  return payway.paymentLink.create({
    title: options.title,
    amount: options.amount,
    currency: options.currency,
    merchantRefNo: options.merchantRefNo,
    returnUrl: options.returnUrl,
    description: options.description,
    paymentLimit: options.paymentLimit,
    expiredDate: options.expiredDate,
    payout: options.payout,
  });
}

/** Inspect a link — pass the opaque Link ID from create's `data.id`. */
export function getPaymentLinkDetails(linkId: string) {
  return payway.paymentLink.getDetails(linkId);
}
