import fs from 'node:fs';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { PayWay } = await import('../../src/index.js');
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});
try {
  const r = await payway.checkout.purchase({
    transactionId: 'd10trio002', amount: 1.0, currency: 'USD',
    paymentOption: 'cards', returnUrl: 'https://example.com/checkout/return',
    lifetime: 10, ctid: 'customer123', tokenFlag: 'CITR_FIX', frequency: '1M',
  });
  console.log('OK', JSON.stringify(r).slice(0, 300));
} catch (e: unknown) {
  const err = e as Error & { rawBody?: unknown };
  console.log('thrown:', err.constructor.name);
  console.log('message:', err.message.slice(0, 400));
  if (err.rawBody) console.log('rawBody:', JSON.stringify(err.rawBody).slice(0, 400));
}
