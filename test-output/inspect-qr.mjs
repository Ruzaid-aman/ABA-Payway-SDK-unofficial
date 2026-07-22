import { PayWay } from '../dist/index.js';

const payway = new PayWay({
  merchantId: 'ec476910',
  apiKey: '[REMOVED-HISTORICAL-fab3d41ca176]',
  environment: 'sandbox',
});

const qr = await payway.qr.generateQr({
  transactionId: 'is' + Date.now().toString(36).slice(0, 10),
  amount: 1.00,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  callbackUrl: 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e',
  qrImageTemplate: 'template2',
  lifetime: 180,
});

if (qr.qrImage) {
  console.log('qrImage starts with:', JSON.stringify(qr.qrImage.substring(0, 60)));
  console.log('qrImage length:', qr.qrImage.length);
  
  // Check if it's a data URL
  if (qr.qrImage.startsWith('data:image')) {
    console.log('✓ Is a data URL (has prefix)');
  }
} else {
  console.log('No qrImage in response');
}
console.log('qrString length:', qr.qrString?.length);
