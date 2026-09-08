import QRCode from 'qrcode';
import type { PaymentRoute } from './order-store.js';

export interface CreatePaymentInput {
  readonly transactionId: string;
  readonly route: PaymentRoute;
  readonly amountCents: number;
  readonly currency: 'USD';
  readonly callbackUrl: string;
  readonly returnUrl: string;
}

export interface PaymentArtifact {
  readonly transactionId: string;
  readonly route: PaymentRoute;
  readonly qrImageDataUrl?: string;
  readonly hostedHtml?: string;
}

export interface VerifiedPayment {
  readonly transactionId: string;
  readonly status: string;
  readonly amountCents: number;
  readonly currency: string;
}

export interface PaymentGateway {
  readonly mode: 'demo' | 'sandbox';
  createPayment(input: CreatePaymentInput): Promise<PaymentArtifact>;
  checkPayment(transactionId: string): Promise<VerifiedPayment>;
  closePayment(transactionId: string): Promise<void>;
  refundPayment(transactionId: string, amountCents: number, currency: 'USD'): Promise<{ refundId: string }>;
  verifyOnlineCallback(body: Record<string, unknown>, signature: string): boolean;
}

export class UnknownCreateOutcomeError extends Error {
  constructor(
    message: string,
    readonly transactionId: string,
  ) {
    super(message);
    this.name = 'UnknownCreateOutcomeError';
  }
}

interface DemoPayment {
  readonly amountCents: number;
  readonly currency: 'USD';
  status: string;
}

export class DemoGateway implements PaymentGateway {
  readonly mode = 'demo' as const;
  private readonly payments = new Map<string, DemoPayment>();
  private refundSequence = 0;

  async createPayment(input: CreatePaymentInput): Promise<PaymentArtifact> {
    this.payments.set(input.transactionId, {
      amountCents: input.amountCents,
      currency: input.currency,
      status: 'PENDING',
    });
    if (input.route === 'qr') {
      const payload = `ABA-PAYWAY-SIMULATED:${input.transactionId}:${input.amountCents}:${input.currency}`;
      return {
        transactionId: input.transactionId,
        route: input.route,
        qrImageDataUrl: await QRCode.toDataURL(payload),
      };
    }
    return {
      transactionId: input.transactionId,
      route: input.route,
      hostedHtml: renderDemoHostedPage(input.transactionId, input.amountCents),
    };
  }

  async checkPayment(transactionId: string): Promise<VerifiedPayment> {
    const payment = this.requirePayment(transactionId);
    return { transactionId, status: payment.status, amountCents: payment.amountCents, currency: payment.currency };
  }

  async closePayment(_transactionId: string): Promise<void> {
    // Deliberately advisory: a later approval is still possible and must be reconciled.
  }

  async refundPayment(transactionId: string, _amountCents: number, _currency: 'USD'): Promise<{ refundId: string }> {
    this.requirePayment(transactionId);
    this.refundSequence += 1;
    return { refundId: `demo-refund-${this.refundSequence}` };
  }

  verifyOnlineCallback(_body: Record<string, unknown>, signature: string): boolean {
    return signature === 'demo-valid-signature';
  }

  approve(transactionId: string): void {
    this.requirePayment(transactionId).status = 'APPROVED';
  }

  private requirePayment(transactionId: string): DemoPayment {
    const payment = this.payments.get(transactionId);
    if (!payment) throw new Error(`Demo payment ${transactionId} was not found`);
    return payment;
  }
}

function renderDemoHostedPage(transactionId: string, amountCents: number): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Simulated hosted checkout</title><style>body{font:16px system-ui;max-width:520px;margin:64px auto;padding:24px;color:#0b1733}main{border:1px solid #d8dee8;border-radius:8px;padding:28px}strong{font-size:28px}button{width:100%;margin-top:24px;padding:14px;border:0;border-radius:5px;background:#df181f;color:#fff;font-weight:750}</style></head><body><main><p>ABA PayWay SDK — SIMULATED HOSTED CHECKOUT</p><strong>${(amountCents / 100).toFixed(2)} USD</strong><p>Transaction ${transactionId}</p><button onclick="fetch('/api/demo/payments/${encodeURIComponent(transactionId)}/approve',{method:'POST'}).then(()=>{this.textContent='Approved — return to the shop';this.disabled=true})">Simulate card approval</button></main></body></html>`;
}

interface PayWayLike {
  readonly qr: {
    generateQr(input: Record<string, unknown>): Promise<unknown>;
  };
  readonly checkout: {
    getCheckoutFormHtml(input: Record<string, unknown>, options: Record<string, unknown>): string;
    checkTransaction(transactionId: string): Promise<unknown>;
    getTransactionDetail(transactionId: string): Promise<unknown>;
    closeTransaction(transactionId: string): Promise<unknown>;
    refund(transactionId: string, amount: number, currency: 'USD'): Promise<unknown>;
  };
  verifyCallback(body: Record<string, unknown>, signature: string): boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function dataRecord(value: unknown): Record<string, unknown> {
  const outer = record(value);
  return record(outer.data ?? outer);
}

function amountToCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('PayWay detail response did not include a numeric amount');
  return Math.round(amount * 100);
}

export async function createSandboxGateway(): Promise<PaymentGateway> {
  const packageName = 'aba-payway-ts';
  let imported: Record<string, unknown>;
  try {
    imported = (await import(packageName)) as Record<string, unknown>;
  } catch {
    throw new Error('Sandbox mode requires aba-payway-ts. Install the published package or a trusted SDK tarball first.');
  }
  const PayWayConstructor = imported.PayWay as new (config?: Record<string, unknown>) => PayWayLike;
  if (!PayWayConstructor) throw new Error('Installed aba-payway-ts package does not export PayWay');
  const payway = new PayWayConstructor({ environment: 'sandbox' });

  return {
    mode: 'sandbox',
    async createPayment(input) {
      try {
        if (input.route === 'hosted') {
          return {
            transactionId: input.transactionId,
            route: input.route,
            hostedHtml: payway.checkout.getCheckoutFormHtml(
              {
                transactionId: input.transactionId,
                amount: input.amountCents / 100,
                currency: input.currency,
                paymentOption: 'cards',
                returnUrl: input.returnUrl,
                cancelUrl: input.returnUrl,
                paymentGate: 0,
              },
              { autoSubmit: true, omitSubmitButton: true },
            ),
          };
        }
        const response = dataRecord(
          await payway.qr.generateQr({
            transactionId: input.transactionId,
            amount: input.amountCents / 100,
            currency: input.currency,
            paymentOption: 'abapay_khqr',
            callbackUrl: input.callbackUrl,
            lifetime: 300,
          }),
        );
        const qrImage = response.qr_image ?? response.qrImage;
        const qrString = response.qr_string ?? response.qrString;
        const qrImageDataUrl =
          typeof qrImage === 'string'
            ? qrImage.startsWith('data:')
              ? qrImage
              : `data:image/png;base64,${qrImage}`
            : typeof qrString === 'string'
              ? await QRCode.toDataURL(qrString)
              : undefined;
        if (!qrImageDataUrl) throw new Error('PayWay did not return a QR image or QR string');
        return { transactionId: input.transactionId, route: input.route, qrImageDataUrl };
      } catch (error) {
        if (error instanceof Error && /network|timeout|fetch|abort/i.test(`${error.name} ${error.message}`)) {
          throw new UnknownCreateOutcomeError(error.message, input.transactionId);
        }
        throw error;
      }
    },
    async checkPayment(transactionId) {
      const statusBody = dataRecord(await payway.checkout.checkTransaction(transactionId));
      const status = String(statusBody.payment_status ?? statusBody.status ?? 'UNKNOWN');
      if (status !== 'APPROVED') return { transactionId, status, amountCents: 0, currency: '' };
      const detail = dataRecord(await payway.checkout.getTransactionDetail(transactionId));
      return {
        transactionId,
        status,
        amountCents: amountToCents(detail.amount ?? detail.original_amount),
        currency: String(detail.currency ?? ''),
      };
    },
    async closePayment(transactionId) {
      await payway.checkout.closeTransaction(transactionId);
    },
    async refundPayment(transactionId, amountCents, currency) {
      await payway.checkout.refund(transactionId, amountCents / 100, currency);
      return { refundId: `payway-refund-${transactionId}-${Date.now().toString(36)}` };
    },
    verifyOnlineCallback(body, signature) {
      const { hash: _ignored, ...signedBody } = body;
      return payway.verifyCallback(signedBody, signature);
    },
  };
}
