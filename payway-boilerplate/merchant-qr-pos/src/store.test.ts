import { describe, expect, it } from 'vitest';
import { createOrderStore } from './store.js';

describe('merchant QR POS order store', () => {
  it('TC-015 applies a paid event once when webhook and status check race', () => {
    const store = createOrderStore(':memory:');
    store.createPending('TC015');

    expect(store.recordPaidOnce('TC015', 'webhook')).toEqual({ applied: true });
    expect(store.recordPaidOnce('TC015', 'status-check')).toEqual({ applied: false });
    expect(store.get('TC015')).toMatchObject({ status: 'PAID', paid_event_count: 1 });
  });
});
