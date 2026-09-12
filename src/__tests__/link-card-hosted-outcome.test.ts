/**
 * SDK-side hosted-outcome detection for `linkCard()` (SANDBOX-FINDINGS §24).
 *
 * The link-card POST answers 302 whose Location carries the hosted page's
 * real result as `/add-card/<base64 JSON>`; Node fetch follows the redirect
 * silently and keeps only the static shell. These pins guarantee the thrown
 * PayWayBusinessError carries `responseUrl` + the decoded `hostedPage`, so a
 * hosted rejection (profile code 104, wrong-hash 01) is visible server-side
 * without a browser (§24 review wave, 2026-09-12).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { PayWayAPIError, PayWayBusinessError } from '../errors.js';

const SANDBOX_URL = `https://checkout-sandbox.payway.com.kh${ENDPOINTS.linkCard}`;

const BASE_PARAMS = {
  requestId: 'lcrev01a',
  ctid: 'revcard01',
  tokenFlag: 'CITI_FLEX' as const,
  frequency: '1M' as const,
  callbackUrl: 'https://example.com/cof-callback',
};

function hostedPayload(status: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify({ message: status.message, status })).toString('base64');
}

/**
 * A Response whose final URL (post-redirect-follow) is pinned — fetch sets
 * `.url` internally, so the test defines it directly.
 */
function htmlResponse(finalUrl: string, body = '<!DOCTYPE html><html><body>add-card shell</body></html>'): Response {
  const res = new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(res, 'url', { value: finalUrl });
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('linkCard hosted-outcome detection (§24 LC-2)', () => {
  it('decodes the /add-card/<base64> redirect target into error.hostedPage', async () => {
    const finalUrl = `https://checkout-sandbox.payway.com.kh/add-card/${hostedPayload({
      code: '104',
      message: 'Merchant not enabled token flag.',
      pw_tran_id: 'lcrev01a',
      trace_id: 't104',
      version: 'v3',
    })}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse(finalUrl)),
    );
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });

    const error: unknown = await payway.credentialsOnFile.linkCard(BASE_PARAMS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PayWayBusinessError);
    const business = error as PayWayBusinessError;
    expect(business.responseUrl).toBe(finalUrl);
    expect(business.hostedPage?.code).toBe('104');
    expect(business.hostedPage?.message).toBe('Merchant not enabled token flag.');
    expect((business.hostedPage?.payload.status as Record<string, unknown>).pw_tran_id).toBe('lcrev01a');
    expect(business.message).toContain('hosted page reports code 104');
    // The shell itself stays on rawBody for the capture path.
    expect(String(business.rawBody)).toContain('add-card shell');
  });

  it('leaves hostedPage undefined when the final URL is not an /add-card/ target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse(SANDBOX_URL)),
    );
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });

    const error: unknown = await payway.credentialsOnFile.linkCard(BASE_PARAMS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PayWayBusinessError);
    const business = error as PayWayBusinessError;
    expect(business.responseUrl).toBe(SANDBOX_URL);
    expect(business.hostedPage).toBeUndefined();
    expect(business.message).not.toContain('hosted page reports');
  });

  it('keeps the raw body on the generic API error for a 4xx HTML answer (CLI capture contract)', async () => {
    const res = new Response('<!DOCTYPE html><html><body>gateway 400 page</body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
    Object.defineProperty(res, 'url', { value: SANDBOX_URL });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => res),
    );
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });

    const error: unknown = await payway.credentialsOnFile.linkCard(BASE_PARAMS).catch((e: unknown) => e);

    // HTTP status wins over body shape (B5 ordering) — but the HTML body stays
    // reachable so the CLI can still capture the page.
    expect(error).toBeInstanceOf(PayWayAPIError);
    expect(error).not.toBeInstanceOf(PayWayBusinessError);
    expect((error as PayWayAPIError).statusCode).toBe(400);
    expect(String((error as PayWayAPIError).rawBody)).toContain('gateway 400 page');
  });

  it('reports an undecodable /add-card/ payload without crashing', async () => {
    const finalUrl = 'https://checkout-sandbox.payway.com.kh/add-card/%%%not-base64%%%';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse(finalUrl)),
    );
    const payway = new PayWay({ merchantId: 'mid', apiKey: 'key', environment: 'sandbox' });

    const error: unknown = await payway.credentialsOnFile.linkCard(BASE_PARAMS).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PayWayBusinessError);
    const business = error as PayWayBusinessError;
    expect(business.hostedPage?.url).toBe(finalUrl);
    expect(business.hostedPage?.payload).toEqual({});
    expect(business.hostedPage?.code).toBeUndefined();
  });
});
