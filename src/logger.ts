/**
 * Structured logger (TD-08, Pillar B §B.3 of the four-pillars audit).
 *
 * Replaces the binary DEBUG_PAYWAY switch with real levels and an optional
 * line-level JSON output. The legacy behavior (`[payway]` prefixed text on
 * console.debug while `debug: true`) is preserved exactly when
 * `format: 'text'` at level `debug`, so existing tooling keeps working.
 *
 * Levels are resolved from (first wins):
 *   1. explicit config (`logLevel`)
 *   2. `PAYWAY_LOG_LEVEL` environment variable
 *   3. `DEBUG_PAYWAY=true|1` → debug (legacy)
 *   4. default → info
 */
import { sanitizeForLog } from './utils.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogSink = (message: string, payload?: unknown) => void;

export interface PayWayLoggerOptions {
  level?: LogLevel;
  /** `'json'` emits single-line JSON objects instead of prefixed text. */
  format?: 'text' | 'json';
  /** Test/driver override; defaults to console.debug/log by level. */
  sink?: LogSink;
}

export interface PayWayLogger {
  debug(message: string, ...payloads: unknown[]): void;
  info(message: string, ...payloads: unknown[]): void;
  warn(message: string, ...payloads: unknown[]): void;
  error(message: string, ...payloads: unknown[]): void;
  readonly enabledLevel: LogLevel;
}

function resolveConsoleSink(level: LogLevel): LogSink {
  if (level === 'error') return (...args) => console.error(...(args as Parameters<typeof console.error>));
  if (level === 'warn') return (...args) => console.warn(...(args as Parameters<typeof console.warn>));
  return (...args) => console.debug(...(args as Parameters<typeof console.debug>));
}

export function createPayWayLogger(options: PayWayLoggerOptions = {}): PayWayLogger {
  const enabledLevel = options.level ?? 'info';
  const floor = LEVEL_WEIGHT[enabledLevel];
  const format = options.format ?? 'text';

  function emit(level: LogLevel, message: string, payloads: unknown[]): void {
    if (LEVEL_WEIGHT[level] < floor) return;
    const safePayloads = payloads.map((p) => (p === undefined ? undefined : sanitizeForLog(p)));

    if (options.sink) {
      if (format === 'json') {
        options.sink(serializeLine(level, message, safePayloads));
        return;
      }
      options.sink(message, ...safePayloads);
      return;
    }

    if (format === 'json') {
      const line = serializeLine(level, message, safePayloads);
      (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
      return;
    }

    // Legacy text parity: `[payway]` prefix line followed by separate args,
    // exactly like the historical console.debug(...) call sites.
    resolveConsoleSink(level)(message, ...safePayloads);
  }

  return {
    debug: (m, ...p) => emit('debug', m, p),
    info: (m, ...p) => emit('info', m, p),
    warn: (m, ...p) => emit('warn', m, p),
    error: (m, ...p) => emit('error', m, p),
    get enabledLevel(): LogLevel {
      return enabledLevel;
    },
  };
}

function serializeLine(level: LogLevel, message: string, payloads: unknown[]): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    source: 'payway-sdk',
    msg: message,
    ...(payloads.length > 0 ? { data: payloads.length === 1 ? payloads[0] : payloads } : {}),
  });
}

/**
 * Resolve the effective log level from config > env > DEBUG_PAYWAY legacy flag.
 * @param configured - Explicit `logLevel` from the SDK config (highest priority).
 * @param legacyDebug - The legacy `debug: true` config value / DEBUG_PAYWAY flag effect.
 */
export function resolveLogLevel(configured?: LogLevel, legacyDebug?: boolean): LogLevel {
  if (configured) return configured;
  const env = process.env.PAYWAY_LOG_LEVEL?.trim().toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') {
    return env;
  }
  if (legacyDebug) {
    return 'debug';
  }
  return 'info';
}
