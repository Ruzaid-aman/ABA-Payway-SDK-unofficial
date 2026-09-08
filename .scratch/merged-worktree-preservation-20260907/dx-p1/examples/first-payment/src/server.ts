import path from 'node:path';
import { createApp } from './app.js';
import { createSandboxGateway, DemoGateway } from './gateway.js';
import { JsonOrderStore } from './order-store.js';
import { PaymentService } from './payment-service.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
const mode = process.env.PAYWAY_EXAMPLE_MODE === 'sandbox' ? 'sandbox' : 'demo';
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`;
if (mode === 'sandbox' && !/^https:\/\//i.test(publicBaseUrl)) {
  throw new Error('Sandbox mode requires PUBLIC_BASE_URL to be the public HTTPS origin registered with ABA PayWay');
}

const gateway = mode === 'sandbox' ? await createSandboxGateway() : new DemoGateway();
const store = new JsonOrderStore(path.resolve(process.env.ORDER_STORE_PATH ?? 'data/orders.json'));
const service = new PaymentService(store, gateway, publicBaseUrl);
const app = createApp(service);

app.listen(port, '127.0.0.1', () => {
  console.log(`ABA PayWay first-payment example (${mode}) is listening at http://127.0.0.1:${port}`);
  if (mode === 'demo') console.log('No ABA credentials or external payment network are used.');
});
