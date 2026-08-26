import { describe, expect, it, vi } from 'vitest';
import type {
  CofPaymentParams,
  CreatePaymentLinkParams,
  LinkAccountParams,
  LinkCardParams,
  PayWayConfig,
  TokenParams,
} from '../client.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import { createKhqrDomain } from '../domains/khqr.js';
import { createPaymentLinkDomain } from '../domains/payment-link.js';
import { createPreAuthDomain } from '../domains/pre-auth.js';
import { PayWayConfigError } from '../errors.js';

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
  const validParams: CreatePaymentLinkParams = {
    title: 'T',
    amount: 1.5,
    merchantRefNo: 'r1',
    returnUrl: 'https://example.com/return',
  };

  it('throws when title is empty', () => {
    expect(() => paymentLink.create({ ...validParams, title: '' })).toThrow(PayWayConfigError);
  });

  it('throws when amount is non-positive', () => {
    expect(() => paymentLink.create({ ...validParams, amount: 0 })).toThrow(PayWayConfigError);
  });

  it('throws when USD amount has more than 2 decimals', () => {
    expect(() => paymentLink.create({ ...validParams, amount: 1.005 })).toThrow(PayWayConfigError);
  });

  it('throws when currency is invalid', () => {
    expect(() => paymentLink.create({ ...validParams, currency: 'EUR' as 'USD' })).toThrow(PayWayConfigError);
  });

  it('throws when merchantRefNo is empty', () => {
    expect(() => paymentLink.create({ ...validParams, merchantRefNo: '' })).toThrow(PayWayConfigError);
  });

  it('throws when description exceeds 250 characters', async () => {
    expect(() => paymentLink.create({ ...validParams, description: 'x'.repeat(251) })).toThrow(PayWayConfigError);
    rawAuthSpy.mockClear();
    await paymentLinkPos.create({ ...validParams, description: 'x'.repeat(250) });
    expect(rawAuthSpy).toHaveBeenCalled();
  });

  it('throws when returnUrl is missing', () => {
    expect(() =>
      paymentLink.create({ title: 'T', amount: 1, merchantRefNo: 'r1' } as unknown as CreatePaymentLinkParams),
    ).toThrow(PayWayConfigError);
  });

  it('throws when returnUrl is not a public HTTPS URL', () => {
    expect(() => paymentLink.create({ ...validParams, returnUrl: 'http://localhost/webhook' })).toThrow(
      PayWayConfigError,
    );
  });

  it('calls requestWithMerchantAuth when inputs are valid', async () => {
    rawAuthSpy.mockClear();
    await paymentLinkPos.create(validParams);
    expect(rawAuthSpy).toHaveBeenCalled();
  });

  it('sends currency and base64-encoded return_url in the auth payload', async () => {
    rawAuthSpy.mockClear();
    await paymentLinkPos.create({ ...validParams, currency: 'KHR', amount: 100 });
    const payload = rawAuthSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.currency).toBe('KHR');
    expect(payload.return_url).toBe(Buffer.from('https://example.com/return', 'utf8').toString('base64'));
  });
});

describe('Validation: pre-auth', () => {
  const preAuth = createPreAuthDomain(DUMMY_CONFIG, dummyRequestWithAuth);
  const preAuthPos = createPreAuthDomain(DUMMY_CONFIG, spyRequestWithAuth);

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

  it('throws a KHQR readiness error when configuration is unavailable', () => {
    expect(() => khqr.generateOfflineQR({ currency: 'USD', merchantRef: 'r' })).toThrow(/KHQR_.*_REQUIRED/);
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
    expect(() => cof.linkAccount({ requestId: '' } as unknown as LinkAccountParams)).toThrow(PayWayConfigError);
  });

  it('throws when linkCard returnUrl is invalid', () => {
    expect(() => cof.linkCard({ requestId: 'r1', returnUrl: 'not-a-url' } as unknown as LinkCardParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('throws when payment missing paymentToken', () => {
    expect(() =>
      cof.payment({
        requestId: 'r1',
        transactionId: 't1',
        amount: 10,
        paymentToken: '',
      } as unknown as CofPaymentParams),
    ).toThrow(PayWayConfigError);
  });

  it('throws when renewToken missing fields', () => {
    expect(() => cof.renewToken({ requestId: '', ctid: '', paymentToken: '' } as unknown as TokenParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('calls request for valid payment', async () => {
    rawSpy.mockClear();
    await cofPos.payment({
      requestId: 'r1',
      transactionId: 't1',
      amount: 10,
      paymentToken: 'pt',
    } as unknown as CofPaymentParams);
    expect(rawSpy).toHaveBeenCalled();
  });
});
