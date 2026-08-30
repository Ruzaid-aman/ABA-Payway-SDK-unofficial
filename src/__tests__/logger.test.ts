/**
 * Structured logger (TD-08) unit coverage: level filtering, text/JSON
 * formats, custom sinks, console sink selection, and resolveLogLevel
 * precedence (config > PAYWAY_LOG_LEVEL > legacy debug flag).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPayWayLogger, resolveLogLevel } from '../logger.js';

describe('createPayWayLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PAYWAY_LOG_LEVEL;
  });

  it('default level is info: debug suppressed, info and above emitted as text', () => {
    const sink = vi.fn();
    const logger = createPayWayLogger({ sink });
    logger.debug('noisy');
    logger.info('hello', { a: 1 });
    logger.warn('careful');
    logger.error('boom');
    expect(sink).toHaveBeenCalledTimes(3);
    expect(sink.mock.calls[0][0]).toBe('hello');
    expect(sink.mock.calls[0][1]).toEqual({ a: 1 });
    expect(sink.mock.calls[2][0]).toBe('boom');
    expect(logger.enabledLevel).toBe('info');
  });

  it('level error suppresses info and warn', () => {
    const sink = vi.fn();
    const logger = createPayWayLogger({ level: 'error', sink });
    logger.info('no');
    logger.warn('no');
    logger.error('yes');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBe('yes');
  });

  it('json format emits a single parseable line with the payload under data', () => {
    const sink = vi.fn();
    const logger = createPayWayLogger({ level: 'debug', format: 'json', sink });
    logger.info('evt', { apiKey: 'secret-value' });
    expect(sink).toHaveBeenCalledTimes(1);
    const line = sink.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as { level: string; msg: string; data: unknown; source: string };
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('evt');
    expect(parsed.source).toBe('payway-sdk');
    // Sensitive keys are scrubbed by the defensive sanitizer.
    expect(JSON.stringify(parsed.data)).toContain('***HIDDEN***');
  });

  it('json format wraps multiple payloads in an array', () => {
    const sink = vi.fn();
    const logger = createPayWayLogger({ format: 'json', sink });
    logger.warn('two', { i: 1 }, { i: 2 });
    const parsed = JSON.parse(sink.mock.calls[0][0] as string) as { data: unknown[] };
    expect(Array.isArray(parsed.data)).toBe(true);
    expect((parsed.data as unknown[]).length).toBe(2);
  });

  it('without a sink, json format routes errors to console.error and others to console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const logger = createPayWayLogger({ format: 'json' });
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('without a sink, text format masks sensitive payloads before printing (debug → console.debug)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      const logger = createPayWayLogger({ level: 'debug' });
      logger.debug('req', { payment_token: 'pwt-value', amount: 5 });
      const args = debugSpy.mock.calls[0] as unknown[];
      expect(args[0]).toBe('req');
      expect(JSON.stringify(args[1])).toContain('***HIDDEN***');
      expect(JSON.stringify(args[1])).toContain('5');
    } finally {
      debugSpy.mockRestore();
    }
  });
});

describe('resolveLogLevel', () => {
  afterEach(() => {
    delete process.env.PAYWAY_LOG_LEVEL;
  });

  it('explicit config wins over everything', () => {
    process.env.PAYWAY_LOG_LEVEL = 'error';
    expect(resolveLogLevel('warn', true)).toBe('warn');
  });

  it('PAYWAY_LOG_LEVEL env is honored (case-insensitive, trimmed)', () => {
    process.env.PAYWAY_LOG_LEVEL = '  DEBUG ';
    expect(resolveLogLevel(undefined, false)).toBe('debug');
  });

  it('invalid PAYWAY_LOG_LEVEL falls through to the legacy debug flag', () => {
    process.env.PAYWAY_LOG_LEVEL = 'verbose';
    expect(resolveLogLevel(undefined, true)).toBe('debug');
    expect(resolveLogLevel(undefined, false)).toBe('info');
  });

  it('defaults to info with no configuration', () => {
    expect(resolveLogLevel()).toBe('info');
  });
});
