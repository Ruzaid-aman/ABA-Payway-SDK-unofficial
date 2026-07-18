import type { TemplateBundle } from './types.js';

const checkoutRoute = `import { Router } from 'express';
import { sdk } from 'aba-payway-ts';

const router = Router();

router.post('/api/payment/checkout', async (req, res) => {
  const { transactionId, amount, paymentOption } = req.body as {
    transactionId: string;
    amount: number;
    paymentOption?: string;
  };

  try {
    const session = await sdk.initiate(
      {
        transactionId,
        amount,
        paymentOption: paymentOption ?? 'abapay_khqr_deeplink',
      },
      {
        merchantId: process.env.PAYWAY_MERCHANT_ID ?? '',
        apiKey: process.env.PAYWAY_API_KEY ?? '',
        environment: (process.env.PAYWAY_ENV as 'sandbox' | 'production') ?? 'sandbox',
      },
    );

    res.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

export default router;
`;

const callbackRoute = `import { Router } from 'express';

const router = Router();

router.post('/api/payment/callback', (req, res) => {
  const signature = req.headers['x-payway-hmac-sha512'] ?? '';
  const body = req.body as Record<string, unknown>;

  // TODO(merchant): verify the callback signature using sdk.auth.verifyCallbackSignature()
  // TODO(merchant): persist the payment outcome here
  // PayWay sends payment_status: APPROVED | DECLINED | CANCELLED | REFUNDED

  console.log('PayWay callback received:', { signature, body });

  res.json({ ok: true });
});

export default router;
`;

export const EXPRESS_TEMPLATE: TemplateBundle = {
  framework: 'express',
  files: [
    { path: 'routes/payment/checkout.ts', content: checkoutRoute },
    { path: 'routes/payment/callback.ts', content: callbackRoute },
  ],
};
