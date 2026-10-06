export type PayWayErrorType =
  | 'config_error'
  | 'api_error'
  | 'business_error'
  | 'network_error'
  | 'rate_limit_error'
  | 'signature_error'
  | 'polling_aborted'
  | 'guard_error';

export class PayWayError extends Error {
  public readonly type: PayWayErrorType;

  constructor(message: string, type: PayWayErrorType) {
    super(message);
    Object.setPrototypeOf(this, PayWayError.prototype);
    this.name = 'PayWayError';
    this.type = type;
  }
}

export class PayWayConfigError extends PayWayError {
  constructor(message: string) {
    super(message, 'config_error');
    Object.setPrototypeOf(this, PayWayConfigError.prototype);
    this.name = 'PayWayConfigError';
  }
}

/**
 * Thrown by the env-guard when a safety rule refuses an operation; maps to
 * exit code 6 (PW-GUARD); never retryable.
 */
export class PayWayGuardError extends PayWayError {
  constructor(message: string) {
    super(message, 'guard_error');
    Object.setPrototypeOf(this, PayWayGuardError.prototype);
    this.name = 'PayWayGuardError';
  }
}

/**
 * Decoded outcome of a hosted gateway page that reports its result in the
 * redirect target URL (`/add-card/<base64 JSON>` on link-card, live-verified
 * 2026-09-12 — SANDBOX-FINDINGS §24 LC-2). The POST response body is a static
 * shell with no result marker, so this redirect payload is the only
 * server-side signal of a hosted rejection (e.g. profile code 104).
 */
export interface HostedPageOutcome {
  /** Final URL after redirect-following (the `/add-card/<base64>` target). */
  url: string;
  /** The full decoded JSON payload embedded in the URL (empty object when undecodable). */
  payload: Record<string, unknown>;
  /** Convenience read of `payload.status.code` (e.g. `"104"`, `"01"`). */
  code?: string;
  /** Convenience read of `payload.status.message`. */
  message?: string;
}

export interface PayWayAPIErrorOptions {
  statusCode?: number;
  paywayCode?: string;
  rawBody?: unknown;
  endpoint?: string;
  retryable?: boolean;
  rateLimitInfo?: Record<string, unknown>;
  /** Per-field validation errors from the gateway (COF family, `status.code "04"` + `errors{}`). */
  fieldErrors?: Record<string, string>;
  /** Request correlation id (cid) — joins this error to journal entries and request hooks. */
  correlationId?: string;
  /** Final URL after redirects (populated for hosted-page endpoints such as link-card). */
  responseUrl?: string;
  /** Decoded hosted-page outcome (link-card: the `/add-card/<base64>` payload), when the final URL carries one. */
  hostedPage?: HostedPageOutcome;
}

export class PayWayAPIError extends PayWayError {
  public readonly statusCode?: number;
  public readonly paywayCode?: string;
  public readonly rawBody?: unknown;
  public readonly endpoint?: string;
  public readonly retryable?: boolean;
  public readonly rateLimitInfo?: Record<string, unknown>;
  public readonly fieldErrors?: Record<string, string>;
  public readonly responseUrl?: string;
  public readonly hostedPage?: HostedPageOutcome;
  /**
   * Mutable on purpose: transport code stamps the request cid onto errors it
   * did not construct (classifier-built business errors) after the fact.
   */
  public correlationId?: string;

  constructor(message: string, options: PayWayAPIErrorOptions = {}) {
    super(message, 'api_error');
    Object.setPrototypeOf(this, PayWayAPIError.prototype);
    this.name = 'PayWayAPIError';
    this.statusCode = options.statusCode;
    this.paywayCode = options.paywayCode;
    this.rawBody = options.rawBody;
    this.endpoint = options.endpoint;
    this.retryable = options.retryable;
    this.rateLimitInfo = options.rateLimitInfo;
    this.fieldErrors = options.fieldErrors;
    this.responseUrl = options.responseUrl;
    this.hostedPage = options.hostedPage;
    this.correlationId = options.correlationId;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      statusCode: this.statusCode,
      paywayCode: this.paywayCode,
      endpoint: this.endpoint,
      retryable: this.retryable,
      rateLimitInfo: this.rateLimitInfo,
      fieldErrors: this.fieldErrors,
      correlationId: this.correlationId,
      responseUrl: this.responseUrl,
      hostedPage: this.hostedPage,
      rawBody: this.rawBody,
    };
  }
}

export class PayWayBusinessError extends PayWayAPIError {
  constructor(message: string, options: PayWayAPIErrorOptions = {}) {
    super(message, options);
    Object.setPrototypeOf(this, PayWayBusinessError.prototype);
    this.name = 'PayWayBusinessError';
    (this as { type: PayWayErrorType }).type = 'business_error';
  }
}

// ─── Polling Errors ─────────────────────────────────────────────────────────

export type PollAbortReason = 'max_consecutive_errors' | 'max_duration_exceeded' | 'caller_aborted';

export class PollingAbortedError extends PayWayError {
  public readonly transactionId: string;
  public readonly reason: PollAbortReason;
  public readonly lastStatus?: string;
  public readonly totalAttempts: number;

  constructor(options: {
    transactionId: string;
    reason: PollAbortReason;
    lastStatus?: string;
    totalAttempts: number;
    message?: string;
  }) {
    // 'polling_aborted', not 'config_error': a poll abort is an outcome of the
    // polling loop (max duration / consecutive errors / caller cancel), so a
    // caller filtering config problems must not catch it (M6).
    super(options.message ?? `Polling aborted for ${options.transactionId}: ${options.reason}`, 'polling_aborted');
    Object.setPrototypeOf(this, PollingAbortedError.prototype);
    this.name = 'PollingAbortedError';
    this.transactionId = options.transactionId;
    this.reason = options.reason;
    this.lastStatus = options.lastStatus;
    this.totalAttempts = options.totalAttempts;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      transactionId: this.transactionId,
      reason: this.reason,
      lastStatus: this.lastStatus,
      totalAttempts: this.totalAttempts,
    };
  }
}

export class PayWayNetworkError extends PayWayAPIError {
  constructor(message: string, options: PayWayAPIErrorOptions = {}) {
    super(message, { ...options, retryable: true });
    Object.setPrototypeOf(this, PayWayNetworkError.prototype);
    this.name = 'PayWayNetworkError';
    (this as { type: PayWayErrorType }).type = 'network_error';
  }
}

export class PayWayRateLimitError extends PayWayAPIError {
  constructor(message: string, options: PayWayAPIErrorOptions = {}) {
    super(message, { ...options, retryable: true });
    Object.setPrototypeOf(this, PayWayRateLimitError.prototype);
    this.name = 'PayWayRateLimitError';
    (this as { type: PayWayErrorType }).type = 'rate_limit_error';
  }
}

export class PayWaySignatureError extends PayWayAPIError {
  constructor(message: string, options: PayWayAPIErrorOptions = {}) {
    super(message, options);
    Object.setPrototypeOf(this, PayWaySignatureError.prototype);
    this.name = 'PayWaySignatureError';
    (this as { type: PayWayErrorType }).type = 'signature_error';
  }
}

// ─── Webhook Errors ─────────────────────────────────────────────────────

export class PayWayWebhookError extends PayWayError {
  constructor(message: string) {
    super(message, 'config_error');
    Object.setPrototypeOf(this, PayWayWebhookError.prototype);
    this.name = 'PayWayWebhookError';
  }
}
