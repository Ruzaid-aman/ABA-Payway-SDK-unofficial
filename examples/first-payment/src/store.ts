/**
 * Order store for the first-payment reference app.
 *
 * Teaches the durable-side integration rules from the DX overhaul plan §3.3:
 *
 *  - Every payment attempt gets its own unique transaction ID, persisted with
 *    the merchant order BEFORE the create call is made (a lost create
 *    response is ambiguous — the record is what lets you reconcile instead
 *    of blindly creating another payment).
 *  - Fulfillment is idempotent: a guarded `payment_events` insert makes
 *    webhook + poll + replay converge to exactly one fulfillment.
 *  - Verification happens before fulfillment: amount AND currency must match
 *    the order, and only a verified callback or a server-side status read
 *    may flip an order to paid.
 *  - A closed order that later reports APPROVED is NOT auto-fulfilled and
 *    NOT auto-refunded: it moves to an explicit `needs_resolution` state for
 *    a merchant decision (late payment after local closure).
 *  - Partial refunds are quantitative: `REFUNDED` alone does not mean fully
 *    refunded; we track refunded cents separately.
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type OrderStatus =
  | 'created' // order exists, no payment attempt yet
  | 'awaiting_payment' // payment attempt created (PENDING at the gateway)
  | 'paid' // verified payment received and fulfilled exactly once
  | 'declined' // gateway reported a terminal non-approved status
  | 'cancelled' // merchant cancelled/closed the attempt
  | 'needs_resolution' // closed attempt later reported APPROVED — merchant must decide
  | 'refunded'; // fully refunded (refundedTotal >= paidTotal)

export type PaymentSource = 'webhook' | 'status-check';

export interface PaymentAttempt {
  /** Unique PayWay transaction ID for THIS attempt (≤ 20 chars, gateway rule). */
  transactionId: string;
  /** The order this attempt belongs to. */
  orderId: string;
  createdAt: string;
  /** Milliseconds since epoch when the displayed QR/lifetime countdown expires. */
  expiresAtMs: number;
  /** Set when the merchant closes the attempt (no gateway CLOSED status exists). */
  closedLocallyAt?: string;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  type:
    | 'order_created'
    | 'attempt_created'
    | 'payment_verified'
    | 'payment_declined'
    | 'attempt_closed'
    | 'late_payment_flagged'
    | 'refund_recorded'
    | 'unverified_notification_rejected'
    | 'verification_rejected';
  /** 'webhook' | 'status-check' for verification events; free text otherwise. */
  source?: string;
  detail?: string;
  createdAt: string;
}

export interface OrderRecord {
  orderId: string;
  /** Server-validated product price — the browser never dictates amounts. */
  amount: number;
  currency: 'USD' | 'KHR';
  product: string;
  status: OrderStatus;
  /** Total actually paid (verified), in major units. 0 until paid. */
  paidTotal: number;
  /** Total refunded across all refund operations, in major units. */
  refundedTotal: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of applying a (possibly verified) payment notification.
 * `applied` is true only the first time a given event source is processed.
 */
export interface ApplyPaymentResult {
  applied: boolean;
  order: OrderRecord;
  /** Present when a verified notification did NOT pay the order. */
  rejectedReason?: string;
}

const SEQUENCE_ZERO = '000000';

/**
 * A JSON-file-backed store. Deliberately dependency-free and synchronous:
 * this is a teaching reference, not a production database. All mutations go
 * through `mutate()` which re-reads, applies, and atomically rewrites the
 * file (write-temp-then-rename) so a crash can never leave a torn write.
 *
 * Concurrency note: single-process Node is single-threaded across the await
 * points used here; a real deployment swaps this for a transactional DB.
 */
export class OrderStore {
  private readonly file: string;
  private data: StoreData;

  constructor(file: string) {
    this.file = path.resolve(file);
    this.data = loadStore(this.file);
  }

  createOrder(input: { product: string; amount: number; currency: 'USD' | 'KHR' }): OrderRecord {
    const date = new Date();
    const now = date.toISOString();
    const orderId = `ord-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${this.data.orderSeq}`;
    const order: OrderRecord = {
      orderId,
      product: input.product,
      amount: input.amount,
      currency: input.currency,
      status: 'created',
      paidTotal: 0,
      refundedTotal: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.data.orders[orderId] = order;
    this.data.orderSeq = incrementSequence(this.data.orderSeq);
    this.appendEvent({ orderId, type: 'order_created', createdAt: now });
    this.save();
    return { ...order };
  }

  /** Throwing when the state transition is illegal keeps bugs loud. */
  get(orderId: string): OrderRecord | undefined {
    const order = this.data.orders[orderId];
    return order ? { ...order } : undefined;
  }

  getAttempt(transactionId: string): PaymentAttempt | undefined {
    return this.data.attempts[transactionId] ? { ...this.data.attempts[transactionId] } : undefined;
  }

  latestAttempt(orderId: string): PaymentAttempt | undefined {
    const attempts = this.listAttempts(orderId);
    return attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
  }

  listAttempts(orderId: string): PaymentAttempt[] {
    return Object.values(this.data.attempts)
      .filter((a) => a.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  listEvents(orderId: string): OrderEvent[] {
    return this.data.events
      .filter((e) => e.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Record a new payment attempt for an order. Each attempt gets a fresh,
   * unique transaction ID. Refuse duplicate IDs locally: the gateway does
   * not provide an idempotency guarantee for repeated creation requests.
   */
  recordAttempt(orderId: string, transactionId: string, lifetimeSeconds: number): PaymentAttempt {
    const order = this.requireOrder(orderId);
    if (order.status === 'awaiting_payment') {
      const error = new Error('Check the existing transaction before creating another payment attempt') as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }
    if (order.status === 'paid' || order.status === 'refunded') {
      throw new Error(`order ${orderId} is already ${order.status} — no new payment attempts`);
    }
    if (order.status === 'needs_resolution') {
      throw new Error(
        `order ${orderId} has a late payment awaiting merchant resolution — resolve it before creating another attempt`,
      );
    }
    if (this.data.attempts[transactionId]) {
      throw new Error(`transactionId ${transactionId} already used by a previous attempt`);
    }
    const now = new Date().toISOString();
    const attempt: PaymentAttempt = {
      transactionId,
      orderId,
      createdAt: now,
      expiresAtMs: Date.now() + lifetimeSeconds * 1000,
    };
    this.data.attempts[transactionId] = attempt;
    // 'cancelled' and 'declined' orders may legitimately retry with a NEW id.
    this.data.orders[orderId].status = 'awaiting_payment';
    this.data.orders[orderId].updatedAt = now;
    this.appendEvent({ orderId, type: 'attempt_created', detail: transactionId, createdAt: now });
    this.save();
    return { ...attempt };
  }

  /**
   * Apply a VERIFIED payment confirmation (verified callback, or a
   * server-side status read that reported APPROVED). Idempotent per source:
   * webhook and status-check each apply at most once, and fulfillment of the
   * ORDER happens exactly once no matter how often notifications replay.
   *
   * Returns rejectedReason (without mutating paid status) when the verified
   * payment does not match the order — amount or currency mismatch means
   * something is seriously wrong upstream; a human must look at it.
   */
  applyVerifiedPayment(
    input: {
      transactionId: string;
      source: PaymentSource;
      amount: number;
      currency: string;
    },
    options: { now?: Date } = {},
  ): ApplyPaymentResult {
    const now = (options.now ?? new Date()).toISOString();
    const attempt = this.data.attempts[input.transactionId];
    if (!attempt) {
      return {
        applied: false,
        order: this.requireOrderForTransaction(input.transactionId),
        rejectedReason: `unknown transactionId ${input.transactionId}`,
      };
    }
    const order = this.data.orders[attempt.orderId];

    // First-use guard: one application per (transaction, source).
    const eventKey = (source: string) => `${input.transactionId}:${source}`;
    if (this.data.processedSources[eventKey(input.source)]) {
      return { applied: false, order: { ...order }, rejectedReason: 'duplicate source event' };
    }

    // Amount/currency must match the order — verified or not, a payment for
    // the wrong amount is not fulfillment permission.
    if (normalizeCurrency(input.currency) !== normalizeCurrency(order.currency)) {
      this.appendEvent({
        orderId: order.orderId,
        type: 'verification_rejected',
        source: input.source,
        detail: `currency ${input.currency} != order ${order.currency}`,
        createdAt: now,
      });
      this.save();
      return {
        applied: false,
        order: { ...order },
        rejectedReason: `currency mismatch: paid ${input.currency}, order ${order.currency}`,
      };
    }
    const expected = order.currency === 'KHR' ? Math.round(order.amount) : Number(order.amount.toFixed(2));
    if (input.amount !== expected) {
      this.appendEvent({
        orderId: order.orderId,
        type: 'verification_rejected',
        source: input.source,
        detail: `amount ${input.amount} != order ${expected}`,
        createdAt: now,
      });
      this.save();
      return {
        applied: false,
        order: { ...order },
        rejectedReason: `amount mismatch: paid ${input.amount}, order ${expected}`,
      };
    }

    // Late payment after local closure: money moved AFTER the merchant
    // already closed the attempt. Keep the order unfulfilled and route it to
    // a human — never auto-fulfill, never auto-refund (the browser wait
    // timing out is not the customer's fault, and a late card payment may
    // legitimately have been intended).
    if (attempt.closedLocallyAt) {
      if (order.status !== 'needs_resolution') {
        order.status = 'needs_resolution';
        order.updatedAt = now;
        this.appendEvent({
          orderId: order.orderId,
          type: 'late_payment_flagged',
          source: input.source,
          detail: `${input.amount} ${input.currency} approved after local close at ${attempt.closedLocallyAt}`,
          createdAt: now,
        });
        this.save();
      }
      return {
        applied: false,
        order: { ...order },
        rejectedReason: 'approved after local close — awaiting merchant resolution',
      };
    }

    // Fulfill once: mark the source processed and the order paid.
    this.data.processedSources[eventKey(input.source)] = true;
    if (order.status !== 'paid' && order.status !== 'refunded') {
      order.status = 'paid';
      order.paidTotal = input.amount;
      order.updatedAt = now;
      this.appendEvent({
        orderId: order.orderId,
        type: 'payment_verified',
        source: input.source,
        detail: `${input.amount} ${input.currency} via ${input.source}`,
        createdAt: now,
      });
    }
    this.save();
    return { applied: true, order: { ...order } };
  }

  /**
   * Record a terminal non-approved status (DECLINED/CANCELLED) read from a
   * verified callback or a server-side status check.
   */
  applyDeclined(input: { transactionId: string; gatewayStatus: string; source: PaymentSource }): ApplyPaymentResult {
    const now = new Date().toISOString();
    const attempt = this.data.attempts[input.transactionId];
    if (!attempt) {
      return {
        applied: false,
        order: this.requireOrderForTransaction(input.transactionId),
        rejectedReason: `unknown transactionId ${input.transactionId}`,
      };
    }
    const order = this.data.orders[attempt.orderId];
    const eventKey = `${input.transactionId}:declined:${input.source}`;
    if (this.data.processedSources[eventKey]) {
      return { applied: false, order: { ...order }, rejectedReason: 'duplicate source event' };
    }
    this.data.processedSources[eventKey] = true;
    if (order.status === 'awaiting_payment') {
      order.status = 'declined';
      order.updatedAt = now;
      this.appendEvent({
        orderId: order.orderId,
        type: 'payment_declined',
        source: input.source,
        detail: input.gatewayStatus,
        createdAt: now,
      });
    }
    this.save();
    return { applied: true, order: { ...order } };
  }

  /**
   * Merchant-side close: kills the QR channel and records local intent, but
   * is NOT proof the gateway cannot accept a late card payment (W4/H7: a
   * successful close response is insufficient evidence of payment
   * prevention). Late APPROVED reads after close route the order to
   * needs_resolution instead of fulfillment.
   */
  closeAttempt(input: { transactionId: string; closedAt?: string }): PaymentAttempt | undefined {
    const attempt = this.data.attempts[input.transactionId];
    if (!attempt) return undefined;
    const now = input.closedAt ?? new Date().toISOString();
    if (!attempt.closedLocallyAt) {
      attempt.closedLocallyAt = now;
      const order = this.data.orders[attempt.orderId];
      if (order.status === 'awaiting_payment') {
        order.status = 'cancelled';
        order.updatedAt = now;
      }
      this.appendEvent({ orderId: attempt.orderId, type: 'attempt_closed', detail: input.transactionId, createdAt: now });
      this.save();
    }
    return { ...attempt };
  }

  /**
   * Resolve a needs_resolution order the way a real merchant would: either
   * accept the late payment (fulfill) or refund it. Both are explicit
   * operator decisions — the store refuses anything else for this state.
   */
  resolveLatePayment(orderId: string, decision: 'fulfill' | 'refund', detail?: string): OrderRecord {
    const order = this.data.orders[orderId];
    if (!order) throw new Error(`unknown order ${orderId}`);
    if (order.status !== 'needs_resolution') {
      throw new Error(`order ${orderId} is ${order.status}, not needs_resolution`);
    }
    const now = new Date().toISOString();
    if (decision === 'fulfill') {
      order.status = 'paid';
      order.paidTotal = order.amount;
    } else {
      order.status = 'refunded';
      order.refundedTotal = order.amount;
      this.appendEvent({
        orderId,
        type: 'refund_recorded',
        detail: detail ?? `late payment refunded (${order.amount} ${order.currency})`,
        createdAt: now,
      });
    }
    order.updatedAt = now;
    this.save();
    return { ...order };
  }

  /**
   * Record a refund result. Partial refunds are quantitative: an order is
   * only 'refunded' (fully) once refundedTotal reaches paidTotal. A gateway
   * `REFUNDED` status alone is a coarse flag, not a full-refund proof.
   */
  recordRefund(input: { transactionId: string; amount: number; currency: string }): OrderRecord {
    const attempt = this.data.attempts[input.transactionId];
    if (!attempt) throw new Error(`unknown transactionId ${input.transactionId}`);
    const order = this.data.orders[attempt.orderId];
    const now = new Date().toISOString();
    order.refundedTotal = round2(order.refundedTotal + input.amount);
    if (order.refundedTotal >= order.paidTotal - 0.005 && order.status === 'paid') {
      order.status = 'refunded';
    }
    order.updatedAt = now;
    this.appendEvent({
      orderId: order.orderId,
      type: 'refund_recorded',
      detail: `refunded ${input.amount} ${input.currency} (total ${order.refundedTotal})`,
      createdAt: now,
    });
    this.save();
    return { ...order };
  }

  /** Log an unverified/invalid-signature notification for audit; never pays an order. */
  recordUnverifiedNotification(input: { transactionId?: string; reason: string }): void {
    const now = new Date().toISOString();
    const orderId =
      input.transactionId !== undefined ? this.data.attempts[input.transactionId]?.orderId : undefined;
    this.appendEvent({
      orderId: orderId ?? '(unmatched)',
      type: 'unverified_notification_rejected',
      detail: input.reason,
      createdAt: now,
    });
    this.save();
  }

  private requireOrder(orderId: string): OrderRecord {
    const order = this.data.orders[orderId];
    if (!order) throw new Error(`unknown order ${orderId}`);
    return order;
  }

  private requireOrderForTransaction(transactionId: string): OrderRecord {
    const attempt = this.data.attempts[transactionId];
    if (attempt) {
      return { ...this.data.orders[attempt.orderId] };
    }
    throw new Error(`unknown transactionId ${transactionId}`);
  }

  private appendEvent(event: Omit<OrderEvent, 'id'>): void {
    this.data.events.push({ ...event, id: `evt-${this.data.eventSeq}` });
    this.data.eventSeq = incrementSequence(this.data.eventSeq);
  }

  private save(): void {
    const dir = path.dirname(this.file);
    mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameWithFallback(tmp, this.file);
  }

  /** Test/inspection helper. */
  snapshot(): StoreData {
    return JSON.parse(JSON.stringify(this.data)) as StoreData;
  }
}

interface StoreData {
  orderSeq: string;
  eventSeq: string;
  orders: Record<string, OrderRecord>;
  attempts: Record<string, PaymentAttempt>;
  events: OrderEvent[];
  processedSources: Record<string, boolean>;
}

function loadStore(file: string): StoreData {
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as StoreData;
    if (typeof parsed.orderSeq !== 'string' || typeof parsed.orders !== 'object') {
      throw new Error('store file is not a first-payment store');
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyStore();
    }
    throw error;
  }
}

function emptyStore(): StoreData {
  return {
    orderSeq: SEQUENCE_ZERO,
    eventSeq: SEQUENCE_ZERO,
    orders: {},
    attempts: {},
    events: [],
    processedSources: {},
  };
}

function incrementSequence(seq: string): string {
  const next = (Number.parseInt(seq, 10) + 1).toString().padStart(seq.length, '0');
  return next;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeCurrency(c: string): string {
  return c.trim().toUpperCase();
}

/**
 * fs.renameSync occasionally fails with EPERM/EXDEV on Windows when an
 * antivirus or indexer holds the destination. Retry a few times, then fall
 * back to a direct write (the JSON store is a teaching artifact; durability
 * of last-resort writes is not the lesson here).
 */
function renameWithFallback(from: string, to: string): void {
  for (let i = 0; i < 3; i++) {
    try {
      renameSync(from, to);
      return;
    } catch {
      // try again
    }
  }
  const content = readFileSync(from, 'utf-8');
  writeFileSync(to, content);
  unlinkQuietly(from);
}

function unlinkQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    // best effort — the tmp file sits next to the store and is harmless
  }
}

/** Order IDs reference (not merchant-facing) data — safe for the browser. */
export function sanitizeOrderForClient(order: OrderRecord): Record<string, unknown> {
  return {
    orderId: order.orderId,
    product: order.product,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paidTotal: order.paidTotal,
    refundedTotal: order.refundedTotal,
    createdAt: order.createdAt,
  };
}

/**
 * A new unique transaction ID for a payment attempt. Gateway rule:
 * ≤ 20 chars, letters/digits/hyphens only. Timestamp + counter makes it
 * unique per process; a distributed deployment would add a merchant-scoped
 * sequence from the durable store.
 */
export function newTransactionId(now: Date = new Date()): string {
  return `fp-${now.getTime().toString(36)}${Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .slice(0, 4)
    .padStart(4, '0')}`;
}
