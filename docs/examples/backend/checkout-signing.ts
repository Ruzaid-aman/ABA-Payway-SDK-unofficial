import { PayWay } from '../../../src/client.js';

export interface CheckoutPayloadOptions {
  transactionId: string;
  amount: number;
  currency: 'USD' | 'KHR';
  returnUrl: string;
  cancelUrl: string;
  continueSuccessUrl?: string;
}

const payway = new PayWay({
  merchantId: 'SANDBOX_MERCHANT',
  apiKey: 'SANDBOX_API_KEY',
  environment: 'sandbox',
});

export function createCheckoutPayload(options: CheckoutPayloadOptions) {
  return payway.checkout.createTransaction({
    transactionId: options.transactionId,
    amount: options.amount,
    currency: options.currency,
    returnUrl: options.returnUrl,
    cancelUrl: options.cancelUrl,
    continueSuccessUrl: options.continueSuccessUrl,
    items: [{ name: 'Example Product', quantity: 1, price: options.amount }],
  });
}
