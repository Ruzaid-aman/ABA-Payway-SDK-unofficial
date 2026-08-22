export type PayWayErrorType =
  | 'config_error'
  | 'api_error'
  | 'business_error'
  | 'network_error'
  | 'rate_limit_error'
  | 'signature_error';

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

export interface PayWayAPIErrorOptions {
  statusCode?: number;
  paywayCode?: string;
  rawBody?: unknown;
  endpoint?: string;
  retryable?: boolean;
  rateLimitInfo?: Record<string, unknown>;
}

export class PayWayAPIError extends PayWayError {
  public readonly statusCode?: number;
  public readonly paywayCode?: string;
  public readonly rawBody?: unknown;
  public readonly endpoint?: string;
  public readonly retryable?: boolean;
  public readonly rateLimitInfo?: Record<string, unknown>;

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
    super(options.message ?? `Polling aborted for ${options.transactionId}: ${options.reason}`, 'config_error');
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
