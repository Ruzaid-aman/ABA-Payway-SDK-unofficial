import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const PRODUCTS = {
  coffee: { id: 'coffee', name: 'Iced latte', amountCents: 300, currency: 'USD' },
  lunch: { id: 'lunch', name: 'Merchant lunch set', amountCents: 750, currency: 'USD' },
} as const;

export type ProductId = keyof typeof PRODUCTS;
export type PaymentRoute = 'qr' | 'hosted';
export type AttemptState = 'SUBMITTING' | 'PENDING' | 'UNKNOWN' | 'APPROVED' | 'DECLINED';
export type OrderState =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_OUTCOME_UNKNOWN'
  | 'FULFILLED'
  | 'CLOSED'
  | 'RESOLUTION_REQUIRED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';
export type VerificationSource = 'signed-online-callback' | 'status-check' | 'unverified-notification';

export interface PaymentAttempt {
  readonly transactionId: string;
  readonly route: PaymentRoute;
  state: AttemptState;
  readonly createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly detail?: string;
}

export interface OrderRecord {
  readonly id: string;
  readonly productId: ProductId;
  readonly productName: string;
  readonly amountCents: number;
  readonly currency: 'USD';
  state: OrderState;
  readonly createdAt: string;
  updatedAt: string;
  closedAt?: string;
  fulfilledAt?: string;
  fulfillmentCount: number;
  refundedCents: number;
  resolutionReason?: string;
  readonly attempts: PaymentAttempt[];
  readonly events: OrderEvent[];
  readonly verificationIds: string[];
  readonly refundIds: string[];
}

interface StoreDocument {
  readonly version: 1;
  readonly orders: Record<string, OrderRecord>;
}

export interface VerificationInput {
  readonly verificationId: string;
  readonly transactionId: string;
  readonly source: VerificationSource;
  readonly authenticity: 'verified' | 'unverified';
  readonly paymentStatus: string;
  readonly amountCents: number;
  readonly currency: string;
}

export interface ApplyResult {
  readonly applied: boolean;
  readonly fulfilled: boolean;
  readonly reason: string;
  readonly order: OrderRecord;
}

export class ActivePaymentAttemptError extends Error {
  constructor(transactionId: string) {
    super(`Payment attempt ${transactionId} is still active; reconcile it before creating another payment`);
    this.name = 'ActivePaymentAttemptError';
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function now(): string {
  return new Date().toISOString();
}

export class JsonOrderStore {
  private document: StoreDocument;

  constructor(private readonly filename: string) {
    this.document = existsSync(filename)
      ? (JSON.parse(readFileSync(filename, 'utf8')) as StoreDocument)
      : { version: 1, orders: {} };
  }

  createOrder(productId: ProductId, orderId: string): OrderRecord {
    if (this.document.orders[orderId]) throw new Error(`Order ${orderId} already exists`);
    const product = PRODUCTS[productId];
    if (!product) throw new Error(`Unknown product ${String(productId)}`);
    const timestamp = now();
    const order: OrderRecord = {
      id: orderId,
      productId,
      productName: product.name,
      amountCents: product.amountCents,
      currency: product.currency,
      state: 'CREATED',
      createdAt: timestamp,
      updatedAt: timestamp,
      fulfillmentCount: 0,
      refundedCents: 0,
      attempts: [],
      events: [{ id: `order-created:${orderId}`, type: 'ORDER_CREATED', occurredAt: timestamp }],
      verificationIds: [],
      refundIds: [],
    };
    this.document.orders[orderId] = order;
    this.persist();
    return clone(order);
  }

  list(): OrderRecord[] {
    return Object.values(this.document.orders)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  get(orderId: string): OrderRecord | undefined {
    const order = this.document.orders[orderId];
    return order ? clone(order) : undefined;
  }

  beginPayment(orderId: string, route: PaymentRoute, transactionId: string): OrderRecord {
    const order = this.requireOrder(orderId);
    const active = order.attempts.find((attempt) => ['SUBMITTING', 'PENDING', 'UNKNOWN'].includes(attempt.state));
    if (active) throw new ActivePaymentAttemptError(active.transactionId);
    if (['FULFILLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.state)) {
      throw new Error(`Order ${orderId} is already fulfilled`);
    }
    const timestamp = now();
    order.attempts.push({ transactionId, route, state: 'SUBMITTING', createdAt: timestamp, updatedAt: timestamp });
    order.state = 'PAYMENT_PENDING';
    this.addEvent(order, `attempt-created:${transactionId}`, 'PAYMENT_ATTEMPT_CREATED', route);
    this.persist();
    return clone(order);
  }

  markAttemptAccepted(transactionId: string): OrderRecord {
    const { order, attempt } = this.findAttempt(transactionId);
    attempt.state = 'PENDING';
    attempt.updatedAt = now();
    order.state = 'PAYMENT_PENDING';
    this.addEvent(order, `attempt-accepted:${transactionId}`, 'PAYMENT_CREATE_ACCEPTED');
    this.persist();
    return clone(order);
  }

  markAttemptUnknown(transactionId: string): OrderRecord {
    const { order, attempt } = this.findAttempt(transactionId);
    attempt.state = 'UNKNOWN';
    attempt.updatedAt = now();
    order.state = 'PAYMENT_OUTCOME_UNKNOWN';
    this.addEvent(order, `attempt-unknown:${transactionId}`, 'PAYMENT_CREATE_OUTCOME_UNKNOWN');
    this.persist();
    return clone(order);
  }

  closeOrder(orderId: string): OrderRecord {
    const order = this.requireOrder(orderId);
    if (['FULFILLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.state)) {
      throw new Error(`Order ${orderId} has already been fulfilled`);
    }
    const timestamp = now();
    order.state = 'CLOSED';
    order.closedAt = timestamp;
    this.addEvent(order, `order-closed:${orderId}`, 'ORDER_CLOSED_LOCALLY');
    this.persist();
    return clone(order);
  }

  applyVerification(input: VerificationInput): ApplyResult {
    const { order, attempt } = this.findAttempt(input.transactionId);
    if (input.authenticity !== 'verified') {
      this.addEvent(order, input.verificationId, 'UNVERIFIED_NOTIFICATION_IGNORED', input.source);
      this.persist();
      return { applied: false, fulfilled: false, reason: 'unverified', order: clone(order) };
    }
    if (order.verificationIds.includes(input.verificationId)) {
      return { applied: false, fulfilled: false, reason: 'replay', order: clone(order) };
    }
    order.verificationIds.push(input.verificationId);
    this.addEvent(order, input.verificationId, 'PAYMENT_VERIFIED', `${input.source}:${input.paymentStatus}`);

    if (input.paymentStatus !== 'APPROVED') {
      if (['DECLINED', 'CANCELLED', 'EXPIRED'].includes(input.paymentStatus)) attempt.state = 'DECLINED';
      this.persist();
      return { applied: true, fulfilled: false, reason: 'not-approved', order: clone(order) };
    }

    attempt.state = 'APPROVED';
    attempt.updatedAt = now();
    if (input.amountCents !== order.amountCents || input.currency !== order.currency) {
      order.state = 'RESOLUTION_REQUIRED';
      order.resolutionReason = `Expected ${order.amountCents} ${order.currency}; received ${input.amountCents} ${input.currency}`;
      this.persist();
      return { applied: true, fulfilled: false, reason: 'amount-or-currency-mismatch', order: clone(order) };
    }
    if (order.closedAt) {
      order.state = 'RESOLUTION_REQUIRED';
      order.resolutionReason = 'Payment was approved after the order was closed locally';
      this.persist();
      return { applied: true, fulfilled: false, reason: 'approved-after-local-close', order: clone(order) };
    }
    if (order.fulfillmentCount > 0) {
      this.persist();
      return { applied: false, fulfilled: false, reason: 'already-fulfilled', order: clone(order) };
    }

    order.state = 'FULFILLED';
    order.fulfillmentCount += 1;
    order.fulfilledAt = now();
    this.addEvent(order, `fulfilled:${order.id}`, 'ORDER_FULFILLED');
    this.persist();
    return { applied: true, fulfilled: true, reason: 'fulfilled', order: clone(order) };
  }

  recordRefund(orderId: string, refundId: string, amountCents: number): { applied: boolean; order: OrderRecord } {
    const order = this.requireOrder(orderId);
    if (order.refundIds.includes(refundId)) return { applied: false, order: clone(order) };
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Refund amount must be positive cents');
    if (order.fulfillmentCount === 0) throw new Error('Cannot refund an unfulfilled order');
    if (order.refundedCents + amountCents > order.amountCents) throw new Error('Refund exceeds the paid amount');
    order.refundIds.push(refundId);
    order.refundedCents += amountCents;
    order.state = order.refundedCents === order.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    this.addEvent(order, refundId, 'REFUND_RECORDED', String(amountCents));
    this.persist();
    return { applied: true, order: clone(order) };
  }

  private requireOrder(orderId: string): OrderRecord {
    const order = this.document.orders[orderId];
    if (!order) throw new Error(`Order ${orderId} was not found`);
    return order;
  }

  private findAttempt(transactionId: string): { order: OrderRecord; attempt: PaymentAttempt } {
    for (const order of Object.values(this.document.orders)) {
      const attempt = order.attempts.find((candidate) => candidate.transactionId === transactionId);
      if (attempt) return { order, attempt };
    }
    throw new Error(`Payment attempt ${transactionId} was not found`);
  }

  private addEvent(order: OrderRecord, id: string, type: string, detail?: string): void {
    order.events.push({ id, type, occurredAt: now(), ...(detail ? { detail } : {}) });
    order.updatedAt = now();
  }

  private persist(): void {
    const directory = path.dirname(this.filename);
    mkdirSync(directory, { recursive: true });
    const temporary = `${this.filename}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.document, null, 2)}\n`, 'utf8');
    renameSync(temporary, this.filename);
  }
}
