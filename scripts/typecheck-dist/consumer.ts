/**
 * Post-build consumer of the EMITTED types (DX-BUILD-002).
 *
 * `npm run typecheck` resolves the package name from source
 * (tsconfig.typecheck.json paths mapping), so it can no longer catch
 * `.d.ts`-emit regressions. This consumer imports the built declaration
 * entry (`dist/index.js` → `dist/index.d.ts`) the way a real downstream
 * consumer would and type-checks a representative slice of the public
 * surface. Run it AFTER `npm run build` (`npm run typecheck:dist`).
 */
import {
  createWebhookServer,
  paymentLifecycle,
  PayWay,
  sdk,
  verifyCallbackDetailed,
} from '../../dist/index.js';
import type { PayWayConfig } from '../../dist/index.js';

const config: PayWayConfig = { merchantId: 'm', apiKey: 'k', environment: 'sandbox' };

// Constructible class, standalone values, and a config object literal all
// resolve against the emitted declarations.
const client = new PayWay(config);
const lifecycle = paymentLifecycle;
void client;
void lifecycle;
void sdk;
void createWebhookServer;
void verifyCallbackDetailed;
