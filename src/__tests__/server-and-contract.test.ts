/**
 * Node-environment tests for Module 1 (`src/server/`) and Module 3
 * (`src/test/`). These validate:
 *
 *  - `normalizePaywayResponse` correctly classifies each PayWay response
 *    shape into the right `responseType`.
 *  - `server.initiateTransaction` performs a real HTTP request and
 *    surfaces normalisation results (driven against the mock server).
 *  - `validateSessionContract` enforces the schema contract.
 *  - `server.test` produces contract-valid sessions.
 *  - The mock PayWay server routes response types by tran_id.
 */

import type { Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PayWayConfig } from '../client.js';
import { normalizePaywayResponse, server } from '../server/index.js';
import {
  generateMockSession,
  getMockPaywayUrl,
  startMockPaywayServer,
  stopMockPaywayServer,
  validateSessionContract,
} from '../test/index.js';

describe('normalizePaywayResponse', () => {
  it('classifies HTML string as `html`', () => {
    const s = normalizePaywayResponse('<html><body></body></html>', 'tx_1');
    expect(s.responseType).toBe('html');
    expect(s.responsePayload).toBe('<html><body></body></html>');
    expect(s.status).toBe('pending');
    expect(s.sessionId).toBe('tx_1');
    expect(Date.parse(s.expiresAt)).not.toBeNaN();
  });

  it('classifies { abapay_deeplink } as `deeplink`', () => {
    const s = normalizePaywayResponse({ abapay_deeplink: 'ababank://pay?x=1', qr_string: '00' }, 'tx_2');
    expect(s.responseType).toBe('deeplink');
    expect(s.responsePayload).toBe('ababank://pay?x=1');
  });

  it('classifies { qr_string } as `qr_string`', () => {
    const s = normalizePaywayResponse({ qr_string: '00020101' }, 'tx_3');
    expect(s.responseType).toBe('qr_string');
    expect(s.responsePayload).toBe('00020101');
  });

  it('classifies { checkout_qr_url } as `checkout_qr_url`', () => {
    const s = normalizePaywayResponse({ checkout_qr_url: 'https://checkout-sandbox.payway.com.kh/eyJ...' }, 'tx_4');
    expect(s.responseType).toBe('checkout_qr_url');
    expect(s.responsePayload).toBe('https://checkout-sandbox.payway.com.kh/eyJ...');
  });

  it('classifies { url } as `url`', () => {
    const s = normalizePaywayResponse({ url: 'https://checkout.example/pay/1' }, 'tx_5');
    expect(s.responseType).toBe('url');
    expect(s.responsePayload).toBe('https://checkout.example/pay/1');
  });

  it('marks non-zero { status.code } as failed', () => {
    const s = normalizePaywayResponse({ status: { code: '99', message: 'Nope' } }, 'tx_6');
    expect(s.status).toBe('failed');
  });

  it('fails safely on unknown shapes', () => {
    const s = normalizePaywayResponse(42 as unknown, 'tx_7');
    expect(s.status).toBe('failed');
  });

  it('respects a lifetime override for expiresAt', () => {
    const before = Date.now();
    const s = normalizePaywayResponse('<html/>', 'tx_8', 5);
    const delta = Date.parse(s.expiresAt) - before;
    // 5 minutes ± 1s tolerance.
    expect(delta).toBeGreaterThan(5 * 60 * 1000 - 1000);
    expect(delta).toBeLessThan(5 * 60 * 1000 + 1000);
  });
});

describe('validateSessionContract', () => {
  it('accepts a well-formed session', () => {
    const good = generateMockSession('qr_string');
    expect(validateSessionContract(good)).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(validateSessionContract('nope')).toMatch(/must be an object/);
    expect(validateSessionContract(null)).toMatch(/must be an object/);
  });

  it('rejects a missing sessionId', () => {
    const s = { ...generateMockSession('url'), sessionId: '' };
    expect(validateSessionContract(s)).toMatch(/sessionId/);
  });

  it('rejects an unknown status', () => {
    const s = { ...generateMockSession('url'), status: 'nope' } as unknown;
    expect(validateSessionContract(s)).toMatch(/status/);
  });

  it('rejects an unknown responseType', () => {
    const s = { ...generateMockSession('url'), responseType: 'unknown' } as unknown;
    expect(validateSessionContract(s)).toMatch(/responseType/);
  });

  it('rejects a bad expiresAt', () => {
    const s = { ...generateMockSession('url'), expiresAt: 'not-a-date' };
    expect(validateSessionContract(s)).toMatch(/expiresAt/);
  });
});

describe('server.test (contract compliance)', () => {
  for (const type of ['deeplink', 'qr_string', 'qr_image', 'url', 'html'] as const) {
    it(`produces a contract-valid session for ${type}`, () => {
      const s = server.test(type, { transactionId: 'unit-1', amount: 1 });
      expect(validateSessionContract(s)).toBeNull();
      expect(s.responseType).toBe(type);
    });
  }
});

describe('server.initiateTransaction (end-to-end against mock PayWay)', () => {
  let mockServer: HttpServer;
  let mockUrl: string;
  let config: PayWayConfig;

  beforeAll(async () => {
    mockServer = await startMockPaywayServer(0);
    mockUrl = getMockPaywayUrl(mockServer);
    config = {
      merchantId: 'mock',
      apiKey: 'mock-key',
      environment: 'sandbox',
      baseUrl: mockUrl,
    };
  });

  afterAll(async () => {
    await stopMockPaywayServer(mockServer);
  });

  it('routes tran_id "e2e-deeplink-*" to a deeplink response', async () => {
    const s = await server.initiateTransaction(
      {
        transactionId: `e2e-dl-${Date.now().toString(36)}`,
        amount: 10,
        paymentOption: 'abapay_khqr_deeplink',
      },
      config,
    );
    expect(s.responseType).toBe('deeplink');
    expect(s.responsePayload).toMatch(/^ababank:\/\//);
    expect(validateSessionContract(s)).toBeNull();
  });

  it('routes tran_id "e2e-qr_string-*" to a qr_string response', async () => {
    const s = await server.initiateTransaction(
      {
        transactionId: `e2e-qs-${Date.now().toString(36)}`,
        amount: 10,
        paymentOption: 'abapay_khqr',
      },
      config,
    );
    expect(s.responseType).toBe('qr_string');
    expect(s.responsePayload.length).toBeGreaterThan(0);
  });

  it('routes tran_id "e2e-qr_image-*" to a qr_image response', async () => {
    const s = await server.initiateTransaction(
      {
        transactionId: `e2e-qi-${Date.now().toString(36)}`,
        amount: 10,
        paymentOption: 'abapay_khqr',
      },
      config,
    );
    expect(s.responseType).toBe('qr_image');
    expect(s.responsePayload).toMatch(/^http:\/\//);
  });

  it('routes tran_id "e2e-url-*" to a url response', async () => {
    const s = await server.initiateTransaction(
      {
        transactionId: `e2e-url-${Date.now().toString(36)}`,
        amount: 10,
        paymentOption: 'abapay_khqr',
      },
      config,
    );
    expect(s.responseType).toBe('url');
    expect(s.responsePayload).toMatch(/^http:\/\//);
  });

  it('rejects payloads missing transactionId', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: intentional invalid payload
      server.initiateTransaction({ amount: 10 } as any, config),
    ).rejects.toThrow(/transactionId/);
  });

  it('rejects payloads missing amount', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: intentional invalid payload
      server.initiateTransaction({ transactionId: 'x' } as any, config),
    ).rejects.toThrow(/amount/);
  });
});
