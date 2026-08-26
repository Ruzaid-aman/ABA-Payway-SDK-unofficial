/**
 * Transport-level circuit breaker (TD-07, Pillar B §B.2 of the four-pillars
 * audit). Tracks consecutive transport failures per endpoint and stops
 * hammering a struggling gateway:
 *
 *   closed ──(N consecutive failures)──▶ open ──(resetTimeoutMs elapsed,
 *   one probe allowed)──▶ half-open ──(probe success)──▶ closed
 *                                          │ (probe failure)
 *                                          ▼
 *                                        open
 *
 * Failure classification is the caller's concern: only network errors and
 * HTTP 5xx should reach `recordFailure()`; business errors mean the gateway
 * itself is healthy and must NOT trip the breaker.
 */
export interface CircuitBreakerOptions {
  /** Consecutive failures per endpoint before the circuit opens. Default: 5. */
  failureThreshold?: number;
  /** How long an open circuit waits before allowing a single probe request. Default: 30_000 ms. */
  resetTimeoutMs?: number;
}

export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
};

export type CircuitState = 'closed' | 'open' | 'half-open';

interface BreakerEntry {
  failures: number;
  openedAt: number | null;
}

/** Thrown when a request is refused because the circuit for its endpoint is open. */
export class CircuitOpenError extends Error {
  public readonly endpoint: string;
  public readonly retryInMs: number;

  constructor(endpoint: string, retryInMs: number) {
    super(
      `Circuit breaker OPEN for ${endpoint} — failing fast after repeated transport failures. ` +
        `Retry allowed in ~${Math.ceil(retryInMs / 1000)}s.`,
    );
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
    this.name = 'CircuitOpenError';
    this.endpoint = endpoint;
    this.retryInMs = retryInMs;
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly entries = new Map<string, BreakerEntry>();
  private readonly probing = new Set<string>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? DEFAULT_CIRCUIT_BREAKER_OPTIONS.failureThreshold);
    this.resetTimeoutMs = Math.max(1, options.resetTimeoutMs ?? DEFAULT_CIRCUIT_BREAKER_OPTIONS.resetTimeoutMs);
  }

  /** Current state for an endpoint (mostly for tests/observability). */
  stateFor(endpoint: string): CircuitState {
    const entry = this.entries.get(endpoint);
    if (!entry || entry.openedAt === null) return 'closed';
    if (this.probing.has(endpoint)) return 'half-open';
    return Date.now() - entry.openedAt >= this.resetTimeoutMs ? 'half-open' : 'open';
  }

  /**
   * Throw {@link CircuitOpenError} when the endpoint's circuit is open and the
   * reset window has not elapsed. When the window HAS elapsed the call is
   * admitted as a single half-open probe.
   */
  assertAllowed(endpoint: string): void {
    const entry = this.entries.get(endpoint);
    if (!entry || entry.openedAt === null) return;

    const elapsed = Date.now() - entry.openedAt;
    if (elapsed < this.resetTimeoutMs && !this.probing.has(endpoint)) {
      throw new CircuitOpenError(endpoint, this.resetTimeoutMs - elapsed);
    }
    // Admit as probe; success closes the circuit, failure re-opens it.
    this.probing.add(endpoint);
  }

  recordSuccess(endpoint: string): void {
    this.entries.delete(endpoint);
    this.probing.delete(endpoint);
  }

  recordFailure(endpoint: string): void {
    if (this.probing.has(endpoint)) {
      // Half-open probe failed → re-open immediately.
      this.probing.delete(endpoint);
      this.entries.set(endpoint, { failures: this.failureThreshold, openedAt: Date.now() });
      return;
    }

    const entry = this.entries.get(endpoint) ?? { failures: 0, openedAt: null };
    entry.failures += 1;
    if (entry.failures >= this.failureThreshold && entry.openedAt === null) {
      entry.openedAt = Date.now();
    }
    this.entries.set(endpoint, entry);
  }
}