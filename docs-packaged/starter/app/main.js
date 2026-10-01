/**
 * Entry point. Chooses the mode from the environment:
 *
 *  - No PAYWAY_MERCHANT_ID/PAYWAY_API_KEY → demo mode (default): local
 *    simulator, no credentials, no network egress except this app's own
 *    loopback callback deliveries.
 *  - Both credentials present → sandbox mode: real PayWay sandbox calls.
 *
 * In sandbox mode the app MUST be reachable at the URL you give PayWay as
 * the callback host (see .env.example) — a loopback callback URL works only
 * because the demo gateway delivers callbacks itself.
 */
import { OrderStore } from './store.js';
import { createPaymentEngine } from './payments.js';
import { startExampleServer } from './server.js';
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`${name} is required in sandbox mode — see .env.example`);
    return value;
}
const merchantId = process.env.PAYWAY_MERCHANT_ID?.trim();
const apiKey = process.env.PAYWAY_API_KEY?.trim();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? `http://${host}:${port}`;
const storeFile = process.env.ORDER_STORE_FILE ?? 'first-payment-store.json';
const store = new OrderStore(storeFile);
const hasCredentials = Boolean(merchantId && apiKey);
const mode = hasCredentials ? 'sandbox' : 'demo';
const engine = createPaymentEngine(mode === 'sandbox'
    ? {
        mode,
        publicBaseUrl,
        store,
        sandboxConfig: {
            merchantId: requireEnv('PAYWAY_MERCHANT_ID'),
            apiKey: requireEnv('PAYWAY_API_KEY'),
            environment: process.env.PAYWAY_ENV?.trim() ?? 'sandbox',
            // Loopback callbacks only work for local tunnels; requiring the
            // explicit flag keeps an accidentally-local production config loud.
            allowPrivateCallbackHosts: process.env.ALLOW_PRIVATE_CALLBACK_HOSTS === '1',
        },
    }
    : { mode, publicBaseUrl, store });
const { server, port: boundPort } = await startExampleServer({ port, host, store, engine });
console.log('');
console.log(`  First-payment reference app — ${mode === 'demo' ? 'DEMO (simulated payments)' : 'SANDBOX (real gateway calls)'}`);
console.log(`  UI:          http://${host}:${boundPort}`);
console.log(`  Callback:    ${publicBaseUrl}/api/payway/callback`);
console.log(`  Store:       ${storeFile}`);
if (mode === 'demo') {
    console.log('  No credentials configured: everything is local and clearly labelled SIMULATED.');
}
else {
    console.log('  Credentials resolved from PAYWAY_MERCHANT_ID / PAYWAY_API_KEY.');
    console.log('  PayWay must be able to reach the callback URL above (public HTTPS in real deployments).');
}
console.log('  Press Ctrl+C to stop.');
console.log('');
