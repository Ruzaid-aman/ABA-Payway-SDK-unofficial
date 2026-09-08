import { randomBytes } from 'node:crypto';
import type { PaymentArtifact, PaymentGateway } from './gateway.js';
import { UnknownCreateOutcomeError } from './gateway.js';
import { type ApplyResult, JsonOrderStore, type PaymentRoute, type ProductId, type VerificationInput } from './order-store.js';

function identifier(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}

export class PaymentService {
  constructor(
    readonly store: JsonOrderStore,
    readonly gateway: PaymentGateway,
    private readonly publicBaseUrl: string,
  ) {}

  createOrder(productId: ProductId) {
    return this.store.createOrder(productId, identifier('ord'));
  }

  async createPayment(orderId: string, route: PaymentRoute): Promise<PaymentArtifact> {
    const order = this.store.get(orderId);
    if (!order) throw new Error(`Order ${orderId} was not found`);
    const transactionId = identifier('fp');
    this.store.beginPayment(orderId, route, transactionId);
    try {
      const artifact = await this.gateway.createPayment({
        transactionId,
        route,
        amountCents: order.amountCents,
        currency: order.currency,
        callbackUrl: `${this.publicBaseUrl}/api/payway/callback`,
        returnUrl: `${this.publicBaseUrl}/?order=${encodeURIComponent(order.id)}`,
      });
      this.store.markAttemptAccepted(transactionId);
      return artifact;
    } catch (error) {
      if (error instanceof UnknownCreateOutcomeError) this.store.markAttemptUnknown(transactionId);
      throw error;
    }
  }

  async reconcile(transactionId: string): Promise<ApplyResult> {
    const payment = await this.gateway.checkPayment(transactionId);
    const input: VerificationInput = {
      verificationId: `status:${transactionId}:${payment.status}:${payment.amountCents}:${payment.currency}`,
      transactionId,
      source: 'status-check',
      authenticity: 'verified',
      paymentStatus: payment.status,
      amountCents: payment.amountCents,
      currency: payment.currency,
    };
    return this.store.applyVerification(input);
  }

  async close(orderId: string): Promise<ReturnType<JsonOrderStore['closeOrder']>> {
    const order = this.store.get(orderId);
    const attempt = order?.attempts.at(-1);
    if (!attempt) throw new Error('Order has no payment attempt to close');
    await this.gateway.closePayment(attempt.transactionId);
    return this.store.closeOrder(orderId);
  }

  async refund(orderId: string, amountCents: number) {
    const order = this.store.get(orderId);
    const attempt = order?.attempts.find((candidate) => candidate.state === 'APPROVED');
    if (!order || !attempt) throw new Error('Order has no verified approved payment');
    const result = await this.gateway.refundPayment(attempt.transactionId, amountCents, order.currency);
    return this.store.recordRefund(orderId, result.refundId, amountCents);
  }
}
