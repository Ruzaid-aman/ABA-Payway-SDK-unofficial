import express from 'express';
import { PayWay } from 'aba-payway-ts';
import { isTerminalPayWayStatus } from './payments.js';
import { createOrderStore } from './store.js';

const merchantId = process.env.PAYWAY_MERCHANT_ID;
const apiKey = process.env.PAYWAY_API_KEY;
const callbackUrl = process.env.PAYWAY_CALLBACK_URL;
if (!merchantId || !apiKey || !callbackUrl) {
  throw new Error('PAYWAY_MERCHANT_ID, PAYWAY_API_KEY, and PAYWAY_CALLBACK_URL are required');
}

const payway = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
const store = createOrderStore(process.env.ORDER_DATABASE_PATH ?? 'merchant-qr-pos.sqlite');
const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/api/orders', async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const transactionId = `pos-${Date.now()}`;
    store.createPending(transactionId);
    const result = await payway.qr.generateQr({ transactionId, amount, paymentOption: 'abapay_khqr', callbackUrl });
    const data = (result as { data?: Record<string, unknown> }).data ?? {};
    res.status(201).json({ transactionId, qrImage: data.qr_image, qrString: data.qr_string, lifetimeSeconds: 300 });
  } catch (error) {
    next(error);
  }
});

app.post('/api/payway-webhook', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const { hash, tran_id: transactionId, status } = body;
  const signedBody = { ...body };
  delete signedBody.hash;
  if (typeof hash !== 'string' || typeof transactionId !== 'string' || !payway.verifyCallback(signedBody, hash)) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  if (status === '0') store.recordPaidOnce(transactionId, 'webhook');
  return res.status(200).json({ acknowledged: true });
});

app.get('/api/orders/:transactionId/status', async (req, res, next) => {
  try {
    const result = await payway.checkout.checkTransaction(req.params.transactionId);
    const paymentStatus = (result as { data?: { payment_status?: string } }).data?.payment_status;
    if (paymentStatus === 'APPROVED') store.recordPaidOnce(req.params.transactionId, 'status-check');
    res.json({ order: store.get(req.params.transactionId), paymentStatus, terminal: isTerminalPayWayStatus(paymentStatus) });
  } catch (error) {
    next(error);
  }
});

app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: 'payment request failed; inspect server logs without printing credentials' });
});

app.listen(Number(process.env.PORT ?? 3000), () => console.log('QR POS reference is listening on port 3000'));
