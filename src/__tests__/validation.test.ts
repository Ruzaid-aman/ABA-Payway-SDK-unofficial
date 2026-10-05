import { describe, expect, it, vi } from 'vitest';
import type {
  CofPaymentParams,
  CreatePaymentLinkParams,
  LinkAccountParams,
  LinkCardParams,
  PayWayConfig,
  RemoveTokenParams,
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

  it('throws when completion exceeds the 110% over-capture ceiling', () => {
    expect(() => preAuth.complete('T1', 200, { originalAmount: 100 })).toThrow(PayWayConfigError);
  });

  it('allows completion within the 110% over-capture ceiling', async () => {
    rawAuthSpy.mockClear();
    await preAuthPos.complete('T1', 105, { originalAmount: 100 });
    expect(rawAuthSpy).toHaveBeenCalled();
  });

  it('forwards idempotencyKey as idempotency_key in the payload', async () => {
    rawAuthSpy.mockClear();
    await preAuthPos.complete('T1', 10, { idempotencyKey: 'idemp-1' });
    const payload = rawAuthSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.idempotency_key).toBe('idemp-1');
  });

  it('forwards reason in the cancel payload', async () => {
    rawAuthSpy.mockClear();
    await preAuthPos.cancel('T1', { reason: 'customer request' });
    const payload = rawAuthSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.reason).toBe('customer request');
    expect(payload.tran_id).toBe('T1');
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
    expect(() => cof.linkCard({ requestId: 'req01', returnUrl: 'not-a-url' } as unknown as LinkCardParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('throws when payment missing paymentToken', () => {
    expect(() =>
      cof.payment({
        requestId: 'req01',
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
      requestId: 'req01',
      transactionId: 't1',
      amount: 10,
      paymentToken: 'pt',
    } as unknown as CofPaymentParams);
    expect(rawSpy).toHaveBeenCalled();
  });
});

// TD-06 (four-pillars audit, Pillar A A.1.1/A.2.4/A.2.5): fail-fast parity with
// the gateway's server-side rules instead of opaque roundtrip errors.
describe('Validation: gateway-parity identifier & token-flag rules (TD-06)', () => {
  const cof = createCredentialsOnFileDomain(DUMMY_CONFIG, dummyRequest);
  const cofPos = createCredentialsOnFileDomain(
    { allowUnverifiedTokenOperations: true } as unknown as PayWayConfig,
    spyRequest,
  );

  it('rejects requestId shorter than 5 characters on linkAccount', () => {
    expect(() => cof.linkAccount({ requestId: 'r1' } as unknown as LinkAccountParams)).toThrow(PayWayConfigError);
  });

  it('rejects requestId containing characters outside [a-zA-Z0-9]', () => {
    expect(() => cof.linkAccount({ requestId: 'REQ-001' } as unknown as LinkAccountParams)).toThrow(/a-zA-Z0-9/);
  });

  it('rejects ctid violating the [a-zA-Z0-9]{5,24} rule on removeToken', () => {
    // 2026-08-31: getTokenDetails no longer takes ctid/pwt (live docs §16) —
    // the ctid format rule is pinned on removeToken instead.
    expect(() => cof.removeToken({ ctid: 'CUST-005', paymentToken: 'pt' } as unknown as RemoveTokenParams)).toThrow(
      PayWayConfigError,
    );
  });

  it('accepts identifiers matching the gateway rule end-to-end', async () => {
    rawSpy.mockClear();
    await cofPos.removeToken({
      ctid: 'CUST006',
      paymentToken: 'pt',
    } as unknown as RemoveTokenParams);
    expect(rawSpy).toHaveBeenCalled();
  });

  it('rejects tokenFlag outside the linking enum on linkAccount', () => {
    // 2026-08-31 live-docs parity: ctid + currency are now REQUIRED on
    // linkAccount, so the fixture includes them to reach the tokenFlag rule.
    expect(() =>
      cof.linkAccount({
        requestId: 'req01',
        ctid: 'ctid01',
        currency: 'USD',
        tokenFlag: 'MITR_FIX',
      } as unknown as LinkAccountParams),
    ).toThrow(/tokenFlag/);
  });

  it('rejects CITR_FIX for linking but accepts CITO_FIX (RTM R-09 correction)', async () => {
    rawSpy.mockClear();
    expect(() =>
      cof.linkCard({ requestId: 'req01', ctid: 'ctid01', tokenFlag: 'CITR_FIX' } as unknown as LinkCardParams),
    ).toThrow(PayWayConfigError);
    await cofPos.linkCard({ requestId: 'req01', ctid: 'ctid01', tokenFlag: 'CITO_FIX' } as unknown as LinkCardParams);
    expect(rawSpy).toHaveBeenCalled();
  });

  it('allows charging-only flags on the CoF payment endpoint', async () => {
    rawSpy.mockClear();
    await cofPos.payment({
      requestId: 'req01',
      transactionId: 'T003',
      amount: 25.5,
      currency: 'USD',
      paymentToken: 'pt',
      tokenFlag: 'MITU_FIX',
    } as unknown as CofPaymentParams);
    expect(rawSpy).toHaveBeenCalled();
  });
});

// ─── TD-03: token-trio capability guard ───────────────────────────────────
// 2026-08-31 FLIPPED: the live-documented HMAC compositions were
// sandbox-verified (SANDBOX-FINDINGS §16), so the trio is allowed by
// DEFAULT now and `allowUnverifiedTokenOperations: false` re-blocks.
describe('Validation: token-trio capability guard (TD-03, flipped 2026-08-31)', () => {
  const explicitOptOut = createCredentialsOnFileDomain(
    { allowUnverifiedTokenOperations: false } as unknown as PayWayConfig,
    dummyRequest,
  );
  const allowed = createCredentialsOnFileDomain({} as unknown as PayWayConfig, spyRequest);

  it('blocks the trio only when allowUnverifiedTokenOperations is explicitly false', () => {
    try {
      explicitOptOut.renewToken({ requestId: 'req01', ctid: 'ctid01', paymentToken: 'pt' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PayWayConfigError);
      expect((error as Error).message).toContain('allowUnverifiedTokenOperations');
      expect((error as Error).message).toContain('sandbox-verified 2026-08-31');
    }
    expect(() => explicitOptOut.getTokenDetails({ requestId: 'req01' })).toThrow(PayWayConfigError);
    expect(() => explicitOptOut.removeToken({ ctid: 'ctid01', paymentToken: 'pt' })).toThrow(PayWayConfigError);
  });

  it('allows the trio by default with the §16-verified params', async () => {
    rawSpy.mockClear();
    await allowed.renewToken({ requestId: 'req01', ctid: 'ctid01', paymentToken: 'pt' });
    await allowed.getTokenDetails({ requestId: 'req01' });
    await allowed.removeToken({ ctid: 'ctid01', paymentToken: 'pt' });
    expect(rawSpy).toHaveBeenCalledTimes(3);
  });

  it('lets linking/charging endpoints work without the flag', async () => {
    rawSpy.mockClear();
    // 2026-08-31 live-docs parity: linkAccount now requires ctid, tokenFlag,
    // and currency — the minimal fixture grew accordingly.
    await allowed.linkAccount({
      requestId: 'req01',
      ctid: 'ctid01',
      tokenFlag: 'CITI_FLEX',
      currency: 'USD',
    } as unknown as LinkAccountParams);
    expect(rawSpy).toHaveBeenCalled();
  });
});
