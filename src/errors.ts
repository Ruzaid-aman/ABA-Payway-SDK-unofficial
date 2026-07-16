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
  public readonly paywayCode?: string | number;
  public readonly rawBody?: any;

  constructor(message: string, options?: { statusCode?: number; paywayCode?: string | number; rawBody?: any }) {
    super(message);
    Object.setPrototypeOf(this, PayWayAPIError.prototype);
    this.name = 'PayWayAPIError';
    this.statusCode = options?.statusCode;
    this.paywayCode = options?.paywayCode;
    this.rawBody = options?.rawBody;
  }
}
