import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { mockJsonResponse } from '../test/test-utils.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayBusinessError, PayWaySignatureError } from '../errors.js';
import { explainAll, explainPayWayCode } from '../cli/explain-code.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
  allowUnverifiedTokenOperations: true,
};

describe('B5 error parity: gateway code classification', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay({ ...TEST_CONFIG, maxRetries: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('throws PayWaySignatureError for 200-wrapped status.code "01" with the endpoint hash-order hint', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ status: { code: '01', message: 'Wrong Hash' } }),
    );

    const err = await payway.checkout.checkTransaction('TX-01').catch((e) => e);
    expect(err).toBeInstanceOf(PayWaySignatureError);
    expect(err.paywayCode).toBe('01');
    expect(err.type).toBe('signature_error');
    expect(err.message).toContain('req_time.merchant_id.tran_id');
  });

  it('throws PayWaySignatureError for flat code "1" (legacy envelope)', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ code: '1', message: 'Wrong Hash' }));

    const err = await payway.checkout.checkTransaction('TX-FLAT').catch((e) => e);
    expect(err).toBeInstanceOf(PayWaySignatureError);
    expect(err.paywayCode).toBe('1');
  });

  it('parses 04 + errors{} into a PayWayBusinessError carrying fieldErrors', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        status: {
          code: '04',
          message: 'The given data was invalid.',
          errors: { lifetime: 'The lifetime must be at least 3 minutes.' },
        },
      }),
    );

    const err = await payway.checkout.checkTransaction('TX-04').catch((e) => e);
    expect(err).toBeInstanceOf(PayWayBusinessError);
    expect(err.fieldErrors).toEqual({ lifetime: 'The lifetime must be at least 3 minutes.' });
    expect(err.message).toContain('lifetime:');
    expect(err.toJSON().fieldErrors).toEqual(err.fieldErrors);
  });

  it('appends advisory hints for observed codes 98 / 105 / 104 / 09', async () => {
    const cases: [string, string][] = [
      ['98', 'Merchant ID not found'],
      ['104', 'Token flag/ctid rejected'],
      ['105', 'Account token invalid or expired'],
      ['09', 'Token not found'],
    ];
    for (const [code, fragment] of cases) {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code, message: 'Rejected' } }));
      const err = await payway.checkout.checkTransaction(`TX-${code}`).catch((e) => e);
      expect(err).toBeInstanceOf(PayWayBusinessError);
      expect(err.message).toContain(`Hint: ${fragment}`);
    }
  });

  it('leaves unclassified codes as plain PayWayBusinessError (no hints)', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 6, message: 'Transaction not found' } }));
    const err = await payway.checkout.checkTransaction('TX-6').catch((e) => e);
    expect(err).toBeInstanceOf(PayWayBusinessError);
    expect(err.message).toBe('Transaction not found');
  });

  it('classifies non-OK responses too (400 "04" + errors{})', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse(
        { status: { code: '04', message: 'Binding failed', errors: { amount: 'must be numeric' } } },
        400,
      ),
    );
    const err = await payway.checkout.checkTransaction('TX-400').catch((e) => e);
    expect(err).toBeInstanceOf(PayWayBusinessError);
    expect(err.statusCode).toBe(400);
    expect(err.fieldErrors).toBeDefined();
  });

  it('registers the get-transactions-by-mc-ref throttle rule (10/60s)', () => {
    const rules = (payway as unknown as { rateLimitRules: Record<string, { limit: number; intervalMs: number }> })
      .rateLimitRules;
    expect(rules?.[ENDPOINTS.getTransactionsByMerchantRef]).toEqual({ limit: 10, intervalMs: 60_000 });
  });

  it('surfaces a structured business error for the always-HTML link-card response', async () => {
    const html = '<!DOCTYPE html><html><body>PayWay - Checkout</body></html>';
    const htmlResponse = {
      ...mockJsonResponse({}, 200),
      text: () => Promise.resolve(html),
    } as Response;
    fetchSpy.mockResolvedValueOnce(htmlResponse);

    const err = await payway.credentialsOnFile
      .linkCard({ requestId: 'REQID0001', ctid: 'CTID0001', tokenFlag: 'CITI_FLEX' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PayWayBusinessError);
    expect(err.message).toContain('link-card responded with an HTML page');
    expect(err.message).toContain('callback_url');
    expect(err.statusCode).toBe(200);
  });
});

describe('B5 error parity: explain-code cof/qr families', () => {
  it('explains the cof family (04, 98, 104, 105, 09, PTL02, 01)', () => {
    for (const code of ['04', '98', '104', '105', '09', '01']) {
      const ex = explainPayWayCode(code);
      expect(ex?.family, `family for ${code}`).toBe('cof');
      expect(ex?.title.length ?? 0).toBeGreaterThan(0);
      expect(ex?.hint.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('explains the qr string-code family', () => {
    for (const code of [
      // '8'/'12' intentionally stay in the gateway/payout families (existing pins).
      '6', '16', '17', '18', '19', '21', '23', '32', '35', '44', '47', '48', '96', '102', '429',
    ]) {
      const ex = explainPayWayCode(code);
      expect(ex?.family, `family for ${code}`).toBe('qr');
    }
    expect(explainPayWayCode('429')?.title).toBe('Rate limit exceeded');
  });

  it('lists cof and qr entries in explainAll', () => {
    const all = explainAll();
    expect(all.filter((e) => e.family === 'cof').length).toBeGreaterThanOrEqual(6);
    expect(all.filter((e) => e.family === 'qr').length).toBe(18);
  });
});
