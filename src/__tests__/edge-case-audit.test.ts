/**
 * Edge-case audit suite — 2026-08-30 campaign.
 *
 * Drives the real request pipeline (real local HTTP server, real fetch) with
 * hostile/malformed gateway responses and configuration to document current
 * behavior at the seams. Where the current behavior is arguably wrong the
 * test is annotated with a `FINDING:` comment and cross-referenced in
 * `audit-results/edge-case-report.md`.
 *
 * These tests intentionally pin CURRENT behavior so that any code change
 * (e.g. from the improvement plan) must consciously update them.
 */
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { QR_LIFETIME_MAX_SECONDS } from '../constants.js';
import { verifyCallbackSignature } from '../auth.js';
import {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayNetworkError,
  PayWayRateLimitError,
} from '../errors.js';
import {
  sanitizeForLog,
  validateBeneficiaries,
  validateLifetime,
  validatePublicHttpsUrl,
  validatePurchaseLifetimeMinutes,
  validateQrLifetimeSeconds,
  validateTransactionId,
} from '../utils.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------
// Local HTTP server harness
// ---------------------------------------------------------------------------

interface CapturedRequest {
  body: string;
  contentType: string | undefined;
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  captured: CapturedRequest,
) => void | Promise<void>;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void>; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      const captured: CapturedRequest = {
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: req.headers['content-type'],
      };
      requests.push(captured);
      await handler(req, res, captured);
    });
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function jsonResponse(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

/** Client pointed at the local harness; fast retries so tests stay quick. */
function makeClient(baseUrl: string, overrides: Record<string, unknown> = {}): PayWay {
  return new PayWay({
    merchantId: 'probe-merchant',
    apiKey: 'probe-api-key',
    environment: 'sandbox',
    baseUrl,
    timeout: 2000,
    maxRetries: 0,
    retryDelayMs: 1,
    ...overrides,
  });
}

const DRIVER_TXN = 'probe-txn-1';

async function checkTransaction(client: PayWay): Promise<unknown> {
  return client.checkout.checkTransaction(DRIVER_TXN);
}

// ---------------------------------------------------------------------------
// A. HTTP 200 response-shape parsing (checkResponseError)
// ---------------------------------------------------------------------------

describe('edge-case: 200 response-shape parsing', () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    server = await startServer((_req, res, captured) => {
      // Default: echo a marker so the caller can prove "success" was returned.
      jsonResponse(res, 200, { echoed: true, received: captured.body.length });
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('numeric status 0 resolves (no error)', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: 0 }));
    await expect(checkTransaction(makeClient(server.url))).resolves.toEqual({ status: 0 });
  });

  it('legacy numeric NON-ZERO status throws a business error (was FINDING EC-01, fixed)', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: 1, message: 'some failure' }));
    // Legacy (non -2) endpoints answer with a flat numeric status; non-zero
    // now throws a business error carrying the code instead of resolving.
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayBusinessError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayBusinessError);
      expect((e as PayWayBusinessError).paywayCode).toBe('1');
      expect((e as PayWayBusinessError).message).toBe('some failure');
    }
  });

  it('legacy numeric status error message falls back to description (real legacy shape)', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: 6, description: 'tran_id not found' }));
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayBusinessError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayBusinessError);
      expect((e as PayWayBusinessError).paywayCode).toBe('6');
      expect((e as PayWayBusinessError).message).toBe('tran_id not found');
    }
  });

  it('nested code with trailing whitespace is trimmed and resolves (was FINDING EC-09, fixed)', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '0 ', message: 'OK' } }));
    // Codes are trimmed before comparison, so a padded success code resolves.
    await expect(checkTransaction(makeClient(server.url))).resolves.toEqual({
      status: { code: '0 ', message: 'OK' },
    });
  });

  it('status "FAILED" without message/code yields placeholder message and no paywayCode', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: 'FAILED' }));
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayBusinessError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayBusinessError);
      expect((e as PayWayBusinessError).message).toBe('Unknown PayWay API Error');
      expect((e as PayWayBusinessError).paywayCode).toBeUndefined();
    }
  });

  it('status "PENDING" (string, not FAILED/ERROR) resolves', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: 'PENDING' }));
    await expect(checkTransaction(makeClient(server.url))).resolves.toEqual({ status: 'PENDING' });
  });

  it('flat top-level code "429" on HTTP 200 is retried AND thrown as PayWayRateLimitError (was FINDING EC-05, fixed)', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { code: '429', message: 'slow down' }));
    const client = makeClient(server.url, { maxRetries: 3 });
    try {
      await checkTransaction(client);
      expect.unreachable('expected error');
    } catch (e) {
      // The retry engine keys off paywayCode === '429' (4 attempts with
      // backoff) and the thrown type is now the typed rate-limit error, so
      // callers matching on instanceof catch it.
      expect(e).toBeInstanceOf(PayWayRateLimitError);
      expect(e).not.toBeInstanceOf(PayWayBusinessError);
      expect((e as PayWayRateLimitError).paywayCode).toBe('429');
      expect(server.requests).toHaveLength(4); // 1 initial + 3 retries
    }
  });

  it('flat numeric code 0 resolves', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { code: 0 }));
    await expect(checkTransaction(makeClient(server.url))).resolves.toEqual({ code: 0 });
  });

  it('top-level JSON array resolves as-is', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, [{ transaction_id: 'T1' }]));
    await expect(checkTransaction(makeClient(server.url))).resolves.toEqual([{ transaction_id: 'T1' }]);
  });

  it('empty 200 body is rejected instead of resolving as null (was FINDING EC-07, fixed)', async () => {
    await server.close();
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('');
    });
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayAPIError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayAPIError);
      expect((e as PayWayAPIError).message).toContain('Empty response body');
      expect((e as PayWayAPIError).statusCode).toBe(200);
    }
  });

  it('HTTP 204 resolves as null success (documented exception to the empty-body guard)', async () => {
    await server.close();
    server = await startServer((_req, res) => {
      res.writeHead(204);
      res.end();
    });
    await expect(checkTransaction(makeClient(server.url))).resolves.toBeNull();
  });

  it('HTML on HTTP 200 surfaces a JSON-parse error carrying HTML and content-type hints (was FINDING EC-08, fixed)', async () => {
    await server.close();
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><body>expired session</body></html>');
    });
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayAPIError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayAPIError);
      expect((e as PayWayAPIError).message).toContain('HTML page instead of JSON');
      expect((e as PayWayAPIError).message).toContain('content-type: text/html');
    }
  });

  it('nested null code resolves (treated as empty/success)', async () => {
    await server.close();
    server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: null, message: 'x' } }));
    await expect(checkTransaction(makeClient(server.url))).resolves.toEqual({ status: { code: null, message: 'x' } });
  });
});

// ---------------------------------------------------------------------------
// B. Non-OK HTTP response handling
// ---------------------------------------------------------------------------

describe('edge-case: non-OK HTTP responses', () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('400 with nested PTL04 keeps paywayCode and is non-retryable', async () => {
    server = await startServer((_req, res) =>
      jsonResponse(res, 400, { status: { code: 'PTL04', message: 'Parameter validation required' } }),
    );
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayAPIError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayAPIError);
      expect(e).not.toBeInstanceOf(PayWayBusinessError);
      expect((e as PayWayAPIError).paywayCode).toBe('PTL04');
      expect((e as PayWayAPIError).statusCode).toBe(400);
      expect((e as PayWayAPIError).retryable).toBe(false);
      expect(server.requests).toHaveLength(1);
    }
  });

  it('403 with NUMERIC status.code 429 maps to PayWayRateLimitError (sandbox-verified shape)', async () => {
    server = await startServer((_req, res) =>
      jsonResponse(res, 403, { status: { code: 429, message: 'Rate limit exceeded for this request.' } }),
    );
    await expect(checkTransaction(makeClient(server.url))).rejects.toBeInstanceOf(PayWayRateLimitError);
  });

  it('403 with FLAT top-level code "49" keeps the PayWay code (was FINDING EC-04, fixed)', async () => {
    server = await startServer((_req, res) => jsonResponse(res, 403, { code: '49', message: 'Invalid Start Date' }));
    // Legacy/flat error bodies on non-OK statuses: the top-level code is now
    // extracted into paywayCode so the typed error can be matched and
    // explained by code.
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayAPIError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayAPIError);
      expect((e as PayWayAPIError).paywayCode).toBe('49');
      expect((e as PayWayAPIError).message).toContain('403');
      expect((e as PayWayAPIError).message).toContain('Invalid Start Date');
    }
  });

  it('Retry-After seconds are converted to milliseconds (was FINDING EC-03, fixed)', async () => {
    server = await startServer((_req, res) =>
      jsonResponse(res, 429, { message: 'too many' }, { 'Retry-After': '1' }),
    );
    // RFC 7231 defines Retry-After in seconds; parseRetryAfterMs converts
    // to ms so retry pacing honors a "60s pause" as 60_000ms, not 60ms.
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayRateLimitError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayRateLimitError);
      expect((e as PayWayRateLimitError).rateLimitInfo?.retryAfterMs).toBe(1000);
    }
  });

  it('Retry-After as an HTTP-date is converted to a millisecond delay', async () => {
    const date = new Date(Date.now() + 60_000).toUTCString();
    server = await startServer((_req, res) =>
      jsonResponse(res, 429, { message: 'too many' }, { 'Retry-After': date }),
    );
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayRateLimitError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayRateLimitError);
      const retryAfterMs = (e as PayWayRateLimitError).rateLimitInfo?.retryAfterMs as number;
      expect(retryAfterMs).toBeGreaterThan(50_000);
      expect(retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('rate-limit limit/remaining headers are still parsed as raw numbers (not seconds-converted)', async () => {
    server = await startServer((_req, res) =>
      jsonResponse(
        res,
        429,
        { message: 'too many' },
        { 'X-Rate-Limit-Limit': '600', 'X-Rate-Limit-Remaining': '0', 'X-Rate-Limit-Reset': '1234' },
      ),
    );
    try {
      await checkTransaction(makeClient(server.url));
      expect.unreachable('expected PayWayRateLimitError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayRateLimitError);
      const info = (e as PayWayRateLimitError).rateLimitInfo;
      expect(info?.limit).toBe(600);
      expect(info?.remaining).toBe(0);
      expect(info?.reset).toBe(1234);
    }
  });

  it('500 with a plain-text body surfaces an HTTP error and IS retried (was FINDING EC-02, fixed)', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('upstream connect error');
    });
    const client = makeClient(server.url, { maxRetries: 3 });
    try {
      await checkTransaction(client);
      expect.unreachable('expected PayWayAPIError');
    } catch (e) {
      // The !response.ok check now runs before the body-shape check: a 5xx
      // HTML/plain-text page (typical CDN/LB error) keeps its HTTP status
      // and its retryability instead of surfacing as a JSON-parse failure.
      expect(e).toBeInstanceOf(PayWayAPIError);
      expect((e as PayWayAPIError).message).toContain('HTTP Error: 500');
      expect((e as PayWayAPIError).statusCode).toBe(500);
      expect((e as PayWayAPIError).retryable).toBe(true);
      expect(server.requests).toHaveLength(4); // 1 initial + 3 retries
    }
  });

  it('503 with an HTML error page IS retried up to maxRetries (was FINDING EC-02, fixed)', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end('<html><body>503 Service Unavailable</body></html>');
    });
    const client = makeClient(server.url, { maxRetries: 2 });
    try {
      await checkTransaction(client);
      expect.unreachable('expected PayWayAPIError');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayAPIError);
      expect((e as PayWayAPIError).statusCode).toBe(503);
      expect((e as PayWayAPIError).retryable).toBe(true);
      expect(server.requests).toHaveLength(3); // 1 initial + 2 retries
    }
  });

  it('500 with a JSON body IS retried up to maxRetries then thrown', async () => {
    server = await startServer((_req, res) => jsonResponse(res, 500, { status: { code: 500, message: 'boom' } }));
    const client = makeClient(server.url, { maxRetries: 2, retryDelayMs: 1 });
    await expect(checkTransaction(client)).rejects.toBeInstanceOf(PayWayAPIError);
    expect(server.requests).toHaveLength(3); // 1 initial + 2 retries
  });
});

// ---------------------------------------------------------------------------
// C. Retry engine behavior
// ---------------------------------------------------------------------------

describe('edge-case: retry engine', () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('purchase with retryPolicy "none" surfaces a network failure after 1 attempt (EC-10)', async () => {
    server = await startServer((_req, _res) => {
      _req.socket.destroy();
    });
    const client = makeClient(server.url, { maxRetries: 2, retryDelayMs: 1 });
    await expect(
      client.checkout.purchase({ transactionId: 'probe-buy-1', amount: 5, retryPolicy: 'none' }),
    ).rejects.toBeInstanceOf(PayWayNetworkError);
    expect(server.requests).toHaveLength(1);
  });

  it('purchase with the default retry policy re-sends after a transient failure (backward-compatible)', async () => {
    server = await startServer((_req, res) => {
      if (server.requests.length === 1) {
        // First attempt: destroy the connection (network error).
        _req.socket.destroy();
        return;
      }
      jsonResponse(res, 200, { status: { code: '00', message: 'OK' } });
    });
    const client = makeClient(server.url, { maxRetries: 1, retryDelayMs: 1 });
    await expect(client.checkout.purchase({ transactionId: 'probe-buy-2', amount: 5 })).resolves.toEqual({
      status: { code: '00', message: 'OK' },
    });
    expect(server.requests).toHaveLength(2);
  });

  it('connection resets consume all retries then surface PayWayNetworkError', async () => {
    server = await startServer((_req, _res) => {
      _req.socket.destroy();
    });
    const client = makeClient(server.url, { maxRetries: 2, retryDelayMs: 1 });
    await expect(checkTransaction(client)).rejects.toBeInstanceOf(PayWayNetworkError);
    expect(server.requests).toHaveLength(3); // every attempt reached the server before the reset
  });

  it('timeout 0 (or negative) is rejected at construction (was FINDING EC-13, fixed)', () => {
    // Previously the AbortController fired instantly and every request timed
    // out ("Request timed out after 0ms") while burning retries.
    expect(() => new PayWay({ merchantId: 'm', apiKey: 'k', timeout: 0 })).toThrow(
      /timeout must be a positive number of milliseconds/,
    );
    expect(() => new PayWay({ merchantId: 'm', apiKey: 'k', timeout: -1 })).toThrow(PayWayConfigError);
  });

  it('transient network failure then success recovers — non-idempotent calls are re-sent', async () => {
    server = await startServer((_req, res) => {
      if (server.requests.length === 1) {
        // First attempt: destroy the connection (network error).
        _req.socket.destroy();
        return;
      }
      jsonResponse(res, 200, { status: { code: '00', message: 'OK' } });
    });
    const client = makeClient(server.url, { maxRetries: 1, retryDelayMs: 1 });
    // A purchase (non-idempotent in production semantics) that fails
    // transiently is silently re-sent by the retry engine. Sandbox accepts
    // duplicate tran_id (overwrites); production semantics are unknown —
    // see report.
    await expect(checkTransaction(client)).resolves.toEqual({ status: { code: '00', message: 'OK' } });
    expect(server.requests).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// D. Config / environment resolution edges
// ---------------------------------------------------------------------------

describe('edge-case: config resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('PAYWAY_ENV set to a URL is honored as the base URL (was FINDING EC-12, fixed)', async () => {
    vi.stubEnv('PAYWAY_ENV', 'https://checkout.example.com');
    // validatePayWayEnv has always accepted a URL-valued PAYWAY_ENV; the
    // client now uses it as the base URL instead of silently falling back
    // to the sandbox host.
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ status: { code: '00' } }), { status: 200 });
      }),
    );
    const client = new PayWay({ merchantId: 'm', apiKey: 'k' });
    await client.checkout.checkTransaction(DRIVER_TXN);
    expect(urls[0]).toContain('checkout.example.com');
    expect(urls[0]).not.toContain('checkout-sandbox.payway.com.kh');
  });

  it('PAYWAY_BASE_URL takes precedence over a URL-valued PAYWAY_ENV', async () => {
    vi.stubEnv('PAYWAY_ENV', 'https://checkout.example.com');
    vi.stubEnv('PAYWAY_BASE_URL', 'https://base.example.com');
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ status: { code: '00' } }), { status: 200 });
      }),
    );
    const client = new PayWay({ merchantId: 'm', apiKey: 'k' });
    await client.checkout.checkTransaction(DRIVER_TXN);
    expect(urls[0]).toContain('base.example.com');
  });

  it('whitespace-only merchantId/apiKey are rejected at construction (was FINDING EC-15, fixed)', () => {
    expect(() => new PayWay({ merchantId: '   ', apiKey: 'k' })).toThrow(PayWayConfigError);
    expect(() => new PayWay({ merchantId: 'm', apiKey: '   ' })).toThrow(PayWayConfigError);
  });

  it('surrounding whitespace is trimmed from credentials instead of being hashed verbatim', () => {
    expect(() => new PayWay({ merchantId: '  m  ', apiKey: ' k ' })).not.toThrow();
  });

  it('PAYWAY_TIMEOUT=0 is rejected at construction (was FINDING EC-13, fixed)', () => {
    vi.stubEnv('PAYWAY_TIMEOUT', '0');
    expect(() => new PayWay({ merchantId: 'm', apiKey: 'k' })).toThrow(
      /timeout must be a positive number of milliseconds/,
    );
  });
});

// ---------------------------------------------------------------------------
// E. Input-validation edges (utils + qr domain)
// ---------------------------------------------------------------------------

describe('edge-case: input validation', () => {
  it('beneficiary sums are compared in minor units — float drift no longer false-rejects (was FINDING EC-16, fixed)', () => {
    // 1.1 + 2.2 === 3.3000000000000003; the accumulated error (4.4e-16)
    // exceeds Number.EPSILON, which used to reject this legitimate split.
    expect(() => validateBeneficiaries([{ account: 'a', amount: 1.1 }, { account: 'b', amount: 2.2 }], 3.3, 'USD')).not.toThrow();
    // Genuinely unbalanced splits are still rejected.
    expect(() => validateBeneficiaries([{ account: 'a', amount: 1.1 }, { account: 'b', amount: 2.2 }], 3.31, 'USD')).toThrow(
      /must sum to total amount/,
    );
  });

  it('short tran_id is accepted but warns once per process (was FINDING EC-20, fixed)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => validateTransactionId('a')).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('shorter than 5 characters');
      // The warning is one-time per process, not per call.
      expect(() => validateTransactionId('b2')).not.toThrow();
      expect(() => validateTransactionId('c3')).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('private/loopback callback hosts are rejected; allowPrivateHosts opts out (was FINDING EC-19, fixed)', () => {
    expect(() => validatePublicHttpsUrl('https://127.0.0.1/cb', 'callbackUrl')).toThrow(/private\/loopback/);
    expect(() => validatePublicHttpsUrl('https://192.168.1.10/cb', 'callbackUrl')).toThrow(PayWayConfigError);
    expect(() => validatePublicHttpsUrl('https://10.0.0.1/cb', 'callbackUrl')).toThrow(PayWayConfigError);
    expect(() => validatePublicHttpsUrl('https://172.16.5.5/cb', 'callbackUrl')).toThrow(PayWayConfigError);
    expect(() => validatePublicHttpsUrl('https://169.254.1.1/cb', 'callbackUrl')).toThrow(PayWayConfigError);
    expect(() => validatePublicHttpsUrl('https://myhost.local/cb', 'callbackUrl')).toThrow(PayWayConfigError);
    // Opt-out for on-prem gateways / integration tests.
    expect(() =>
      validatePublicHttpsUrl('https://127.0.0.1/cb', 'callbackUrl', { allowPrivateHosts: true }),
    ).not.toThrow();
    // Public hosts and https enforcement unchanged.
    expect(() => validatePublicHttpsUrl('https://example.com/cb', 'callbackUrl')).not.toThrow();
    expect(() => validatePublicHttpsUrl('http://example.com/cb', 'callbackUrl')).toThrow(PayWayConfigError);
  });

  it('qr.generateQr honors allowPrivateCallbackHosts from client config', async () => {
    const server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '00' }, qrString: 'x' }));
    try {
      const strict = makeClient(server.url);
      expect(() =>
        strict.qr.generateQr({
          transactionId: 'probe-qr-p1',
          amount: 5,
          paymentOption: 'abapay_khqr',
          callbackUrl: 'https://10.1.2.3/cb',
        }),
      ).toThrow(/private\/loopback/);

      const lenient = new PayWay({
        merchantId: 'probe-merchant',
        apiKey: 'probe-api-key',
        environment: 'sandbox',
        baseUrl: server.url,
        timeout: 2000,
        maxRetries: 0,
        retryDelayMs: 1,
        allowPrivateCallbackHosts: true,
      });
      await lenient.qr.generateQr({
        transactionId: 'probe-qr-p2',
        amount: 5,
        paymentOption: 'abapay_khqr',
        callbackUrl: 'https://10.1.2.3/cb',
      });
      expect(server.requests).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('FINDING: validateLifetime is unbounded (accepts 1e12 seconds ≈ 31k years)', () => {
    expect(() => validateLifetime(1e12)).not.toThrow();
    expect(() => validateLifetime(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });

  it('QR lifetime below the 180s gateway minimum is rejected locally (was FINDING EC-17, fixed)', () => {
    // Sandbox boundary probe 2026-08-30: lifetime 179 → HTTP 400 code "04";
    // lifetime 180 → success. validateQrLifetimeSeconds now rejects sub-180s
    // values before any network call.
    expect(() => validateQrLifetimeSeconds(179)).toThrow(/at least 180 seconds/);
    expect(() => validateQrLifetimeSeconds(30)).toThrow(/at least 180 seconds/);
    expect(() => validateQrLifetimeSeconds(180)).not.toThrow();
  });

  it('generic validateLifetime stays unit-agnostic (checkout.purchase sends minutes; minimum is domain-specific)', () => {
    // checkout.purchase forwards lifetime in MINUTES (spec min 3), so the
    // shared validator must not impose the QR domain's 180-second floor.
    expect(() => validateLifetime(179)).not.toThrow();
    expect(() => validateLifetime(0)).toThrow(PayWayConfigError);
  });

  it('generateQr converts seconds to whole minutes: 180→3, 185→3 (floor, was FINDING EC-18, fixed)', async () => {
    const server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '00' }, qrString: 'x' }));
    try {
      const client = makeClient(server.url);
      await client.qr.generateQr({
        transactionId: 'probe-qr-1',
        amount: 5,
        paymentOption: 'abapay_khqr',
        callbackUrl: 'https://example.com/cb',
        lifetime: 185,
      });
      const sent = JSON.parse(server.requests[0].body) as Record<string, unknown>;
      // Floor keeps the actual expiry at or below the requested countdown —
      // a live QR must never outlast the merchant's displayed timer.
      expect(sent.lifetime).toBe(3);
    } finally {
      await server.close();
    }
  });

  it('generateQr with sub-minimum lifetime fails locally before any network call', async () => {
    const server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '00' }, qrString: 'x' }));
    try {
      const client = makeClient(server.url);
      // Domain validators throw synchronously before a promise exists.
      expect(() =>
        client.qr.generateQr({
          transactionId: 'probe-qr-2',
          amount: 5,
          paymentOption: 'abapay_khqr',
          callbackUrl: 'https://example.com/cb',
          lifetime: 30,
        }),
      ).toThrow(PayWayConfigError);
      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('checkout purchase lifetime below 3 minutes is rejected locally (gateway error-69 parity)', () => {
    expect(() => validatePurchaseLifetimeMinutes(2)).toThrow(/at least 3 minutes/);
    expect(() => validatePurchaseLifetimeMinutes(3)).not.toThrow();
    // The generic validator stays unit-agnostic (checkout minutes ≠ QR seconds).
    expect(() => validateLifetime(2)).not.toThrow();
  });

  it('checkout.purchase with sub-minimum lifetime fails locally before any network call', async () => {
    const server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '00' } }));
    try {
      const client = makeClient(server.url);
      expect(() => client.checkout.purchase({ transactionId: 'probe-buy-3', amount: 5, lifetime: 2 })).toThrow(
        /at least 3 minutes/,
      );
      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('QR lifetime above the 120-day spec maximum warns once instead of throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => validateQrLifetimeSeconds(QR_LIFETIME_MAX_SECONDS + 1)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('documented maximum');
      // The warning is one-time per process.
      expect(() => validateQrLifetimeSeconds(QR_LIFETIME_MAX_SECONDS * 2)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// F. Callback signature verification edges
// ---------------------------------------------------------------------------

describe('edge-case: verifyCallbackSignature', () => {
  const apiKey = 'sig-test-key';

  it('accepts a correctly computed signature', () => {
    const body: Record<string, string> = { tran_id: 'T1', status: 'SUCCESS', amount: '5.00' };
    const sortedKeys = Object.keys(body).sort();
    const concatenated = sortedKeys.map((k) => String(body[k])).join('');
    const sig = crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');
    expect(verifyCallbackSignature(body, sig, apiKey)).toBe(true);
  });

  it('stripHash option verifies payloads that still carry the hash field (was FINDING EC-22, fixed)', () => {
    const withoutHash: Record<string, string> = { tran_id: 'T1', amount: '5.00' };
    const concatenated = Object.keys(withoutHash).sort().map((k) => withoutHash[k]).join('');
    const sig = crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');
    const withHash = { ...withoutHash, hash: 'abc123' };
    // Default (no options) stays strict: hash in the body → no valid signature.
    expect(verifyCallbackSignature(withHash, sig, apiKey)).toBe(false);
    // stripHash: true removes it before verifying.
    expect(verifyCallbackSignature(withHash, sig, apiKey, { stripHash: true })).toBe(true);
  });

  it('empty signature is rejected via length check', () => {
    expect(verifyCallbackSignature({ a: '1' }, '', apiKey)).toBe(false);
  });

  it('tampered value is rejected', () => {
    const body: Record<string, string> = { tran_id: 'T1', amount: '5.00' };
    const concatenated = Object.keys(body).sort().map((k) => String(body[k])).join('');
    const sig = crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');
    expect(verifyCallbackSignature({ tran_id: 'T1', amount: '9.99' }, sig, apiKey)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// G. Observability hooks
// ---------------------------------------------------------------------------

describe('edge-case: observability hooks', () => {
  it('onResponse IS invoked before a 200 business error is thrown (was FINDING EC-06, fixed)', async () => {
    const server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '1', message: 'Wrong Hash.' } }));
    try {
      const onResponse = vi.fn();
      const client = makeClient(server.url, { onResponse });
      await expect(checkTransaction(client)).rejects.toBeInstanceOf(PayWayBusinessError);
      expect(onResponse).toHaveBeenCalledTimes(1);
      expect(onResponse.mock.calls[0][1]).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('onResponse IS invoked on success with parsed body', async () => {
    const server = await startServer((_req, res) => jsonResponse(res, 200, { status: { code: '00', message: 'OK' } }));
    try {
      const onResponse = vi.fn();
      const client = makeClient(server.url, { onResponse });
      await checkTransaction(client);
      expect(onResponse).toHaveBeenCalledTimes(1);
      expect(onResponse.mock.calls[0][1]).toBe(200);
    } finally {
      await server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// H. Diagnostic sanitization edges
// ---------------------------------------------------------------------------

describe('edge-case: sanitizeForLog', () => {
  it('32-char hex values are left visible; SHA-1-length+ hex is masked (was FINDING EC-23, fixed)', () => {
    const input = {
      orderRef: 'deadbeefdeadbeefdeadbeefdeadbeef', // 32 hex — visible now
      digest: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // 40 hex — still masked
      qty: 2,
    };
    const out = sanitizeForLog(input) as Record<string, unknown>;
    expect(out.orderRef).toBe('deadbeefdeadbeefdeadbeefdeadbeef');
    expect(out.digest).toBe('***HIDDEN***');
    expect(out.qty).toBe(2);
  });

  it('token-shaped keys are masked by the fuzzy matcher', async () => {
    const out = sanitizeForLog({ 'x-payway-token': 'tok_abc', paymentToken: 'pwt', note: 'hello' }) as Record<string, unknown>;
    expect(out['x-payway-token']).toBe('***HIDDEN***');
    expect(out.paymentToken).toBe('***HIDDEN***');
    expect(out.note).toBe('hello');
  });

  it('token_flag enum values are deliberately preserved', async () => {
    const out = sanitizeForLog({ token_flag: 'MITU_FLEX' }) as Record<string, unknown>;
    expect(out.token_flag).toBe('MITU_FLEX');
  });
});

// ---------------------------------------------------------------------------
// I. Constructor/misc guards
// ---------------------------------------------------------------------------

describe('edge-case: misc guards', () => {
  it('PayWayConfigError still thrown for missing credentials', () => {
    expect(() => new PayWay({ merchantId: '', apiKey: '' })).toThrow(PayWayConfigError);
  });

  it('validateLifetime rejects zero/negative and non-integers', () => {
    expect(() => validateLifetime(0)).toThrow(PayWayConfigError);
    expect(() => validateLifetime(-5)).toThrow(PayWayConfigError);
    expect(() => validateLifetime(90.5)).toThrow(PayWayConfigError);
  });

  it('validateTransactionId rejects >20 chars and unsafe characters', () => {
    expect(() => validateTransactionId('a'.repeat(21))).toThrow(/≤ 20 characters/);
    expect(() => validateTransactionId('bad id!')).toThrow(/letters, digits, and hyphens/);
    expect(() => validateTransactionId('')).toThrow(/non-empty string/);
  });
});
