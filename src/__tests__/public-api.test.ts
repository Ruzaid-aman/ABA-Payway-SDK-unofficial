/**
 * Public API surface test.
 *
 * Imports the package barrel (`src/index.ts`) so the export graph is executed
 * (and counted by coverage) and, more importantly, so accidental removal of a
 * public export fails loudly instead of breaking downstream merchants.
 */
import { describe, expect, it } from 'vitest';
import * as PublicApi from '../index.js';
import type { CheckoutFormOptions } from '../index.js';

describe('public API surface (src/index.ts barrel)', () => {
  it('exports the main client and facade', () => {
    expect(typeof PublicApi.PayWay).toBe('function');
    expect(typeof PublicApi.sdk).toBe('object');
    expect(typeof PublicApi.sdk.server.initiateTransaction).toBe('function');
    expect(typeof PublicApi.verifyCallbackSignature).toBe('function');
    expect(typeof PublicApi.client).toBe('object');
    // Compile-time pin: the option type stays part of the public surface.
    // (Type-only exports have no runtime binding to assert on.)
    const formOptions: CheckoutFormOptions = {};
    void formOptions;
  });

  it('exports error classes', () => {
    for (const name of [
      'PayWayError',
      'PayWayConfigError',
      'PayWayAPIError',
      'PayWayBusinessError',
      'PayWayNetworkError',
      'PayWayRateLimitError',
      'PayWaySignatureError',
      'PayWayWebhookError',
      'PollingAbortedError',
    ] as const) {
      expect(typeof (PublicApi as Record<string, unknown>)[name], `export ${name}`).toBe('function');
    }
  });

  it('exports gateway code tables and constants', () => {
    expect(PublicApi.PAYMENT_STATUS_CODES.APPROVED).toBe(0);
    expect(PublicApi.REFUND_ERROR_CODES.PARAMETER_VALIDATION).toBe('PTL04');
    expect(PublicApi.PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE).toBe('PTL59');
    expect(PublicApi.PAYOUT_ERROR_CODES.CURRENCY_NOT_ALLOWED).toBe('PTL147');
    expect(typeof PublicApi.GATEWAY_CODE_HINTS['1'].title).toBe('string');
    expect(PublicApi.QR_LIFETIME_MIN_SECONDS).toBe(180);
    expect(PublicApi.PURCHASE_LIFETIME_MIN_MINUTES).toBe(3);
    expect(PublicApi.QR_LIFETIME_MAX_SECONDS).toBe(10_368_000);
    expect(PublicApi.REQUEST_ID_PATTERN).toBeInstanceOf(RegExp);
    expect(PublicApi.TOKEN_VALIDITY_DAYS).toBe(90);
  });

  it('exports resilience, logging, and webhook tooling', () => {
    expect(typeof PublicApi.CircuitBreaker).toBe('function');
    expect(typeof PublicApi.DEFAULT_CIRCUIT_BREAKER_OPTIONS).toBe('object');
    expect(typeof PublicApi.createPayWayLogger).toBe('function');
    expect(typeof PublicApi.resolveLogLevel).toBe('function');
    expect(typeof PublicApi.createWebhookServer).toBe('function');
    expect(typeof PublicApi.createStorage).toBe('function');
    expect(typeof PublicApi.computeTokenExpiry).toBe('function');
    expect(typeof PublicApi.daysUntilTokenExpiry).toBe('function');
    expect(typeof PublicApi.openImageInDefaultViewer).toBe('function');
  });
});
