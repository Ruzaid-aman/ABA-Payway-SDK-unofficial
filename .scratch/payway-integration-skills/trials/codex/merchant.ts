import express from 'express';
import { orders, sessionUser } from './merchant-context.js';
import { createIntegration, type Gateway } from './src/service.js';
import { SqliteStore } from './src/sqlite-store.js';
import { integrationRouter } from './src/express.js';
import { nextIntegration } from './src/next.js';

export type { Gateway, Attempt, Artifact, Proof } from './src/service.js';

/** Synthetic merchant composition root; never loads credentials or a live adapter. */
export function createMerchant(gateway: Gateway, databaseFile: string) {
  const store = new SqliteStore(databaseFile);
  try {
    for (const order of orders) store.seed(order);
    const service = createIntegration(store, gateway, 'synthetic-trial-key');
    const expressApp = express();
    expressApp.use(express.json({ limit: '64kb' }));
    expressApp.use(integrationRouter(service, sessionUser));
    const handlers = nextIntegration(service, async request => sessionUser(request));
    return {
      expressApp,
      next: {
        qrPOST: handlers.create('qr'),
        hostedPOST: handlers.create('hosted'),
        linkPOST: handlers.create('link'),
        callbackPOST: handlers.callback,
        statusGET: handlers.status,
      },
      store,
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
