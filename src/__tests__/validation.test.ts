import { describe, it, expect, vi } from 'vitest';
import { PayWayConfigError } from '../errors.js';
import type { PayWayConfig, CreatePaymentLinkParams } from '../client.js';

import { createPaymentLinkDomain } from '../domains/payment-link.js';
import { createPreAuthDomain } from '../domains/pre-auth.js';
import { createKhqrDomain } from '../domains/khqr.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import type { LinkAccountParams, LinkCardParams, CofPaymentParams, TokenParams } from '../client.js';

// Dummy request functions that should not be called when validation fails
const dummyRequest = <TResponse>(_path: string, _body: Record<string, unknown>): Promise<TResponse> => {
  throw new Error('request should not be called when validation fails');
};
const dummyRequestWithAuth = <TResponse>(_path: string, _auth: Record<string, unknown>): Promise<TResponse> => {
  throw new Error('requestWithMerchantAuth should not be called when validation fails');
};

// Positive-path spies: wrap a vitest spy in a typed function to avoid `any` casts
const rawSpy = vi.fn<(path: string, body: Record<string, unknown>) => Promise<unknown>>(() => Promise.resolve({}));
const rawAuthSpy = vi.fn<
  (
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: 'application/json' | 'application/x-www-form-urlencoded' },
  ) => Promise<unknown>
>(() => Promise.resolve({}));

const spyRequest = <TResponse>(path: string, body: Record<string, unknown>): Promise<TResponse> => {
  return rawSpy(path, body) as Promise<TResponse>;
};

const spyRequestWithAuth = <TResponse>(
  path: string,
  authPayload: Record<string, unknown>,
  options?: { hmacFields?: string[]; contentType?: 'application/json' | 'application/x-www-form-urlencoded' },
): Promise<TResponse> => {
  return rawAuthSpy(path, authPayload, options) as Promise<TResponse>;
};

const DUMMY_CONFIG = {} as unknown as PayWayConfig;

describe('Validation: payment-link', () => {
  const paymentLink = createPaymentLinkDomain(DUMMY_CONFIG, dummyRequestWithAuth);
  const paymentLinkPos = createPaymentLinkDomain(DUMMY_CONFIG, spyRequestWithAuth);

  it('throws when title is empty', () => {
    expect(() =>
      paymentLink.create({ title: '', amount: 10, merchantRefNo: 'ref' }),
    ).toThrow(PayWayConfigError);
  });

  it('throws when amount is non-positive', () => {
    expect(() =>
      paymentLink.create({ title: 'T', amount: 0, merchantRefNo: 'ref' }),
    ).toThrow(PayWayConfigError);
  });

  it('throws when merchantRefNo is empty', () => {
    expect(() =>
      paymentLink.create({ title: 'T', amount: 1, merchantRefNo: '' }),
    ).toThrow(PayWayConfigError);
  });

  it('calls requestWithMerchantAuth when inputs are valid', async () => {
    rawAuthSpy.mockClear();
    await paymentLinkPos.create({ title: 'T', amount: 1.5, merchantRefNo: 'r1' } as unknown as CreatePaymentLinkParams);
    expect(rawAuthSpy).toHaveBeenCalled();
  });
});

describe('Validation: pre-auth', () => {
  const preAuth = createPreAuthDomain(dummyRequestWithAuth);
  const preAuthPos = createPreAuthDomain(spyRequestWithAuth);

  it('throws when transactionId is invalid', () => {
    expect(() => preAuth.complete('', 10)).toThrow(PayWayConfigError);
  });

  it('throws when amount is non-positive', () => {
    expect(() => preAuth.complete('T1', 0)).toThrow(PayWayConfigError);
  });

  it('throws when payout array is empty in completeWithPayout', () => {
    expect(() => preAuth.completeWithPayout('T1', 10, [])).toThrow(PayWayConfigError);
  });

  it('calls requestWithMerchantAuth when inputs are valid', async () => {
    rawAuthSpy.mockClear();
    await preAuthPos.complete('T1', 10);
    expect(rawAuthSpy).toHaveBeenCalled();
  });
});

describe('Validation: khqr', () => {
  const khqr = createKhqrDomain(DUMMY_CONFIG, dummyRequest);
  const khqrPos = createKhqrDomain(DUMMY_CONFIG, spyRequest);

  it('throws when merchantRef is empty for getTransactionsByMerchantRef', () => {
    expect(() => khqr.getTransactionsByMerchantRef('')).toThrow();
  });

  it('throws when generateOfflineQR has invalid params', () => {
    expect(() =>
      khqr.generateOfflineQR({ merchantId: '', transactionId: 'T1', amount: -1, currency: 'USD', merchantRef: 'r' }),
    ).toThrow();
  });

  it('calls request for getTransactionsByMerchantRef when merchantRef is valid', async () => {
    rawSpy.mockClear();
    await khqrPos.getTransactionsByMerchantRef('ref-1');
    expect(rawSpy).toHaveBeenCalled();
  });
});

describe('Validation: credentials-on-file', () => {
  const cof = createCredentialsOnFileDomain(DUMMY_CONFIG, dummyRequest);
  const cofPos = createCredentialsOnFileDomain(DUMMY_CONFIG, spyRequest);

  it('throws when linkAccount requestId is missing', () => {
    expect(() => cof.linkAccount({ requestId: '' } as unknown as LinkAccountParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('throws when linkCard returnUrl is invalid', () => {
    expect(() => cof.linkCard({ requestId: 'r1', returnUrl: 'not-a-url' } as unknown as LinkCardParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('throws when payment missing paymentToken', () => {
    expect(() =>
      cof.payment({ requestId: 'r1', transactionId: 't1', amount: 10, paymentToken: '' } as unknown as CofPaymentParams),
    ).toThrow(PayWayConfigError);
  });

  it('throws when renewToken missing fields', () => {
    expect(() => cof.renewToken({ requestId: '', ctid: '', paymentToken: '' } as unknown as TokenParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('calls request for valid payment', async () => {
    rawSpy.mockClear();
    await cofPos.payment({ requestId: 'r1', transactionId: 't1', amount: 10, paymentToken: 'pt' } as unknown as CofPaymentParams);
    expect(rawSpy).toHaveBeenCalled();
  });
});
