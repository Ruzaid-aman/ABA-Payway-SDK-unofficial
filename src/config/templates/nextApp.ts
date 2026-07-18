import type { TemplateBundle } from './types.js';

const checkoutRoute = `import { NextResponse } from 'next/server';
import { sdk } from 'aba-payway-ts';

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as {
    transactionId: string;
    amount: number;
    paymentOption?: string;
  };

  try {
    const session = await sdk.initiate(
      {
        transactionId: body.transactionId,
        amount: body.amount,
        paymentOption: body.paymentOption ?? 'abapay_khqr_deeplink',
      },
      {
        merchantId: process.env.PAYWAY_MERCHANT_ID ?? '',
        apiKey: process.env.PAYWAY_API_KEY ?? '',
        environment: (process.env.PAYWAY_ENV as 'sandbox' | 'production') ?? 'sandbox',
      },
    );

    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
`;

const callbackRoute = `import { NextResponse } from 'next/server';

export async function POST(req: Request): Promise<NextResponse> {
  const signature = req.headers.get('x-payway-hmac-sha512') ?? '';
  const body = (await req.json()) as Record<string, unknown>;

  // TODO(merchant): verify the callback signature using sdk.auth.verifyCallbackSignature()
  // TODO(merchant): persist the payment outcome here
  // PayWay sends payment_status: APPROVED | DECLINED | CANCELLED | REFUNDED

  console.log('PayWay callback received:', { signature, body });

  return NextResponse.json({ ok: true });
}
`;

export const NEXT_APP_TEMPLATE: TemplateBundle = {
  framework: 'next-app',
  files: [
    { path: 'app/api/payment/checkout/route.ts', content: checkoutRoute },
    { path: 'app/api/payment/callback/route.ts', content: callbackRoute },
  ],
};
