import type { TemplateFile } from '../../../config/templates/types.js';

const starter = `import { PayWay, PayWayNetworkError } from 'aba-payway-ts';

const callbackUrl = process.env.PAYWAY_CALLBACK_URL;
if (!callbackUrl) {
  throw new Error('Set PAYWAY_CALLBACK_URL to a public HTTPS endpoint before creating an online QR.');
}

const transactionId = \`pay-\${Date.now().toString(36)}\`;
const payway = new PayWay();

try {
  const created = await payway.qr.generateQr({
    transactionId,
    amount: 3,
    currency: 'USD',
    callbackUrl,
    lifetime: 300,
  });

  console.log(JSON.stringify({
    transactionId,
    creation: 'accepted',
    qrString: created.qrString,
    next: \`payway-sdk check-transaction -t \${transactionId}\`,
  }, null, 2));
} catch (error) {
  if (error instanceof PayWayNetworkError) {
    console.error(\`The create outcome is unknown. Check \${transactionId} before creating another payment.\`);
  }
  throw error;
}
`;

export const FIRST_PAYMENT_TEMPLATE: readonly TemplateFile[] = [
  { path: 'payway-first-payment.mjs', content: starter },
];
