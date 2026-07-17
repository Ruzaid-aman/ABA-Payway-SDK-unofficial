export class PayWayError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PayWayError.prototype);
    this.name = 'PayWayError';
  }
}

export class PayWayConfigError extends PayWayError {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PayWayConfigError.prototype);
    this.name = 'PayWayConfigError';
  }
}

export class PayWayAPIError extends PayWayError {
  public readonly statusCode?: number;
  public readonly paywayCode?: string;
  public readonly rawBody?: unknown;
  public readonly endpoint?: string;
  public readonly retryable?: boolean;
  public readonly rateLimitInfo?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      paywayCode?: string;
      rawBody?: unknown;
      endpoint?: string;
      retryable?: boolean;
      rateLimitInfo?: Record<string, unknown>;
    },
  ) {
    super(message);
    Object.setPrototypeOf(this, PayWayAPIError.prototype);
    this.name = 'PayWayAPIError';
    this.statusCode = options?.statusCode;
    this.paywayCode = options?.paywayCode;
    this.rawBody = options?.rawBody;
    this.endpoint = options?.endpoint;
    this.retryable = options?.retryable;
    this.rateLimitInfo = options?.rateLimitInfo;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      paywayCode: this.paywayCode,
      endpoint: this.endpoint,
      retryable: this.retryable,
      rateLimitInfo: this.rateLimitInfo,
      rawBody: this.rawBody,
    };
  }
}
