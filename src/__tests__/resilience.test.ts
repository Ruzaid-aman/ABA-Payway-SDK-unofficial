import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_CIRCUIT_BREAKER_OPTIONS,
} from '../circuit-breaker.js';
import { PayWayError } from '../errors.js';
import { computeTokenExpiry, daysUntilTokenExpiry } from '../utils.js';
import { createPayWayLogger, resolveLogLevel } from '../logger.js';
import { PayWay } from '../client.js';

describe('CircuitBreaker (TD-07)', () => {
  it('stays closed under the failure threshold', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000 });
    // A never-failed endpoint reports closed (guards the entries lookup).
    expect(breaker.stateFor('fresh-endpoint')).toBe('closed');
    breaker.recordFailure('ep');
    breaker.recordFailure('ep');
    expect(breaker.stateFor('ep')).toBe('closed');
    expect(() => breaker.assertAllowed('ep')).not.toThrow();
  });

  it('opens after N consecutive failures and fails fast', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    for (let i = 0; i < 3; i++) breaker.recordFailure('ep');
    expect(breaker.stateFor('ep')).toBe('open');
    expect(() => breaker.assertAllowed('ep')).toThrow(CircuitOpenError);
  });

  it('tracks endpoints independently', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000 });
    breaker.recordFailure('a');
    breaker.recordFailure('a');
    expect(() => breaker.assertAllowed('b')).not.toThrow();
    expect(() => breaker.assertAllowed('a')).toThrow(CircuitOpenError);
  });

  it('admits a half-open probe after the reset window and closes on success', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      breaker.recordFailure('ep');
      vi.advanceTimersByTime(60); // past resetTimeout — no real-clock busy-wait
      expect(breaker.stateFor('ep')).toBe('half-open');
      expect(() => breaker.assertAllowed('ep')).not.toThrow();
      breaker.recordSuccess('ep');
      expect(breaker.stateFor('ep')).toBe('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports the exact retry window on CircuitOpenError (retryInMs math)', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      breaker.recordFailure('ep');
      vi.advanceTimersByTime(20); // 30 ms remain
      try {
        breaker.assertAllowed('ep');
        expect.unreachable('circuit must be open');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).retryInMs).toBe(30);
        expect((error as Error).message).toContain('Retry allowed in');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats the reset window boundary as half-open (>=, not >)', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      breaker.recordFailure('ep');
      vi.advanceTimersByTime(50); // exactly the window
      expect(breaker.stateFor('ep')).toBe('half-open');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not postpone the reset window while open, and probe success clears probe state', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      breaker.recordFailure('ep'); // opens at t=0
      vi.advanceTimersByTime(30);
      breaker.recordFailure('ep'); // extra failure while open must NOT reset openedAt
      vi.advanceTimersByTime(30); // 60 ms since open — window elapsed
      expect(breaker.stateFor('ep')).toBe('half-open');
      breaker.recordSuccess('ep');
      expect(breaker.stateFor('ep')).toBe('closed');
      // recordSuccess must clear probe state too: a new failure starts a fresh count.
      breaker.recordFailure('ep');
      expect(breaker.stateFor('ep')).toBe('open');
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-opens immediately when the half-open probe fails', () => {
    vi.useFakeTimers();
    try {
      const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      breaker.recordFailure('ep');
      vi.advanceTimersByTime(60);
      breaker.assertAllowed('ep'); // admitted as probe
      breaker.recordFailure('ep');
      expect(breaker.stateFor('ep')).toBe('open');
      expect(() => breaker.assertAllowed('ep')).toThrow(CircuitOpenError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold).toBe(5);
    expect(DEFAULT_CIRCUIT_BREAKER_OPTIONS.resetTimeoutMs).toBe(30_000);
  });

  it('CircuitOpenError joins the PayWayError taxonomy as network_error (M6)', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    breaker.recordFailure('ep');
    try {
      breaker.assertAllowed('ep');
      expect.unreachable('circuit must be open');
    } catch (error) {
      expect(error).toBeInstanceOf(CircuitOpenError);
      // Transport-level refusal: documented instanceof PayWayError handling must see it.
      expect(error).toBeInstanceOf(PayWayError);
      const err = error as CircuitOpenError;
      expect(err.type).toBe('network_error');
      expect(err.name).toBe('CircuitOpenError');
      expect(err.endpoint).toBe('ep');
      expect(err.retryInMs).toBe(60_000);
      expect(err.message).toContain('Circuit breaker OPEN for ep');
    }
  });
});

describe('resolveLogLevel + createPayWayLogger (TD-08)', () => {
  it('resolves config > env > legacy flag > info default', () => {
    expect(resolveLogLevel('warn', true)).toBe('warn');
    // Legacy debug flag: config.debug === true (or DEBUG_PAYWAY legacy switch)
    // maps to the debug level when no explicit level/PAYWAY_LOG_LEVEL is set.
    delete process.env.PAYWAY_LOG_LEVEL;
    expect(resolveLogLevel(undefined, true)).toBe('debug');
    expect(resolveLogLevel(undefined, false)).toBe('info');
  });

  it('suppresses messages below the configured level', () => {
    const lines: string[] = [];
    const logger = createPayWayLogger({
      level: 'warn',
      sink: (msg) => lines.push(msg),
    });
    logger.debug('hidden');
    logger.info('also hidden');
    logger.warn('visible warning');
    expect(lines).toEqual(['visible warning']);
  });

  it('emits single-line JSON with level and payload in json format', () => {
    let captured = '';
    const logger = createPayWayLogger({ level: 'info', format: 'json', sink: (m) => (captured = m) });
    logger.info('[payway] <- 200 /api/x', { amount: 10, hash: 'secret' });
    const parsed = JSON.parse(captured) as { level: string; msg: string; data: Record<string, unknown> };
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toContain('/api/x');
    expect(parsed.data.hash).toBe('***HIDDEN***');
  });

  it('preserves legacy text parity and sanitizes payloads at the debug level', () => {
    const args: unknown[] = [];
    const logger = createPayWayLogger({
      level: 'debug',
      sink: (msg, ...rest) => args.push(msg, ...rest),
    });
    logger.debug('[payway] -> POST /api/payment-gateway/v1/payments/purchase', { api_key: 'k', amount: 1 });
    expect(args[0]).toBe('[payway] -> POST /api/payment-gateway/v1/payments/purchase');
    expect(args[1]).toEqual({ api_key: '***HIDDEN***', amount: 1 });
  });
});

// ─── Transport integration (TD-07): breaker + jitter through PayWay client ──
describe('PayWay transport resilience (TD-07)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('opens the circuit after repeated network failures and fails fast afterwards', async () => {
    const payway = new PayWay({
      merchantId: 'cb-merchant',
      apiKey: 'cb-api-key-000000000000',
      environment: 'sandbox',
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000 },
    });
    const failing = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', failing);

    for (let i = 0; i < 2; i++) {
      await expect(payway.checkout.checkTransaction('TXCB01')).rejects.toThrow();
    }

    // Third call must fail fast with the breaker error, never touching fetch again.
    await expect(payway.checkout.checkTransaction('TXCB02')).rejects.toThrow(/Circuit breaker OPEN/);
    expect(failing).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('applies full jitter to exponential backoff only when opted in', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const baseConfig = {
      merchantId: 'j-merchant',
      apiKey: 'j-api-key-000000000000',
      environment: 'sandbox' as const,
      maxRetries: 1,
      retryDelayMs: 20,
      baseUrl: 'http://127.0.0.1:9', // unused once fetch is stubbed
    };
    // Fresh one-rejection-then-success mock per phase.
    const makeFetch = (): ReturnType<typeof vi.fn> =>
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('boom'))
        .mockImplementation(async () => jsonResponse({ status: { code: '00' } }));

    // Jitter OFF (default): backoff delay is deterministic — no Math.random.
    vi.stubGlobal('fetch', makeFetch());
    await new PayWay({ ...baseConfig }).checkout.checkTransaction('TJ1');
    expect(randomSpy).not.toHaveBeenCalled();

    // Jitter ON: computed delay (20ms) scaled by random().
    randomSpy.mockClear();
    vi.stubGlobal('fetch', makeFetch());
    await new PayWay({ ...baseConfig, backoffJitter: 'full' }).checkout.checkTransaction('TJ2');
    expect(randomSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
    randomSpy.mockRestore();
  });
});

// ─── Token lifecycle helpers (TD-10) ──────────────────────────────────────
describe('computeTokenExpiry / daysUntilTokenExpiry (TD-10)', () => {
  it('defaults to the documented 90-day cycle', () => {
    const grantedAt = new Date('2026-08-27T00:00:00Z');
    const expiry = computeTokenExpiry(grantedAt);
    expect(expiry.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(daysUntilTokenExpiry(expiry, grantedAt)).toBe(90);
  });

  it('accepts epoch ms and ISO strings and supports custom windows', () => {
    const from = Date.parse('2026-01-01T00:00:00Z');
    expect(computeTokenExpiry(from, 7).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(daysUntilTokenExpiry('2026-01-08T00:00:00Z', '2026-01-03T12:00:00Z')).toBe(4);
    expect(daysUntilTokenExpiry('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBeLessThan(0);
  });

  it('rejects invalid inputs with PayWayConfigError', () => {
    expect(() => computeTokenExpiry('not-a-date')).toThrow(/valid date/i);
    expect(() => computeTokenExpiry(Date.now(), 0)).toThrow(/positive/i);
  });
});
