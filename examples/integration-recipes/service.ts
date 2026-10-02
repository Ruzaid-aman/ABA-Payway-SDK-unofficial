import { randomBytes } from 'node:crypto';
import { PayWayConfigError, paymentLifecycle, paymentNextStep, verifyCallbackDetailed } from 'aba-payway-ts';
import { validateMinor, type Currency } from './money.js';

export type Route = 'qr' | 'hosted' | 'link';
export interface Scope {
  environment: 'sandbox' | 'production';
  merchantId: string;
  tenantId: string;
}
export interface Order {
  id: string;
  ownerId: string;
  amountMinor: number;
  currency: Currency;
}
export interface Artifact {
  kind: Route;
  qrString?: string;
  html?: string;
  url?: string;
}
export interface Attempt extends Order {
  attemptId: string;
  route: Route;
  state: string;
  artifact?: Artifact;
  linkId?: string;
  createdAt?: number;
}
export interface Proof {
  identity: string;
  status: string;
  amount: number;
  currency: string;
  receiptId?: string;
  source?: string;
}
export interface Gateway {
  scope?: Scope;
  // Local validation runs before reserving a financial intent.
  validate?(order: Order, route: Route): void;
  create(attempt: Attempt): Promise<{ artifact: Artifact; linkId?: string }>;
  lookup(attempt: Attempt): Promise<Proof>;
}
export interface PaymentView {
  attemptId: string;
  status: string;
  rawStatus: string;
  verified: boolean;
  verification: string;
  fulfillmentQueued: boolean;
  amountMinor: number;
  currency: Currency;
  attemptState: string;
}
export interface Store {
  scope: Scope;
  reserve(
    orderId: string,
    ownerId: string,
    route: Route,
    id: string,
    validate?: (order: Order, route: Route) => void,
  ): { attempt: Attempt; created: boolean };
  get(id: string): Attempt | undefined;
  ready(id: string, result: { artifact: Artifact; linkId?: string }): void;
  unknown(id: string): void;
  rejectLocal(id: string): void;
  enqueue(id: string, deliveryId: string): void;
  observe(id: string, proof: Proof): PaymentView;
  view(id: string): PaymentView;
  pending(): string[];
}
export interface CallbackAck {
  status: number;
  body: string;
}
export const DEFAULT_CALLBACK_ACK: CallbackAck = { status: 200, body: 'RECEIVEOK' };
export function validateAck(ack: CallbackAck): void {
  if (
    !Number.isInteger(ack.status) ||
    ack.status < 200 ||
    ack.status >= 300 ||
    typeof ack.body !== 'string' ||
    ((ack.status === 204 || ack.status === 205) && ack.body !== '')
  )
    throw new Error('Invalid callback acknowledgment');
}
export class IntegrationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createIntegration(store: Store, gateway: Gateway, apiKey: string) {
  if (
    gateway.scope &&
    (gateway.scope.environment !== store.scope.environment ||
      gateway.scope.merchantId !== store.scope.merchantId ||
      gateway.scope.tenantId !== store.scope.tenantId)
  )
    throw new Error('Store/gateway environment or merchant scope mismatch');
  const inFlight = new Map<string, Promise<ReturnType<typeof decorate>>>();
  const decorate = (view: PaymentView) => {
    const lifecycle = paymentLifecycle(view.status);
    return {
      ...view,
      lifecycle,
      nextStep:
        view.status === 'REVIEW'
          ? 'Keep the payment in review. Resolve the evidence mismatch; do not ask for another payment.'
          : paymentNextStep(lifecycle),
    };
  };
  function owned(id: string, ownerId?: string) {
    const attempt = store.get(id);
    if (!attempt || (ownerId !== undefined && attempt.ownerId !== ownerId))
      throw new IntegrationError(404, 'Order not found');
    return attempt;
  }
  async function create(orderId: string, ownerId: string, route: Route) {
    if (!ownerId) throw new IntegrationError(401, 'Authentication required');
    if (!['qr', 'hosted', 'link'].includes(route)) throw new IntegrationError(400, 'Unknown payment route');
    const reserved = store.reserve(orderId, ownerId, route, `pw${randomBytes(8).toString('hex')}`, gateway.validate);
    const attempt = reserved.attempt;
    if (!reserved.created) {
      if (attempt.state !== 'ready' || !attempt.artifact)
        throw new IntegrationError(409, `Unknown/pending outcome; reconcile saved attempt ${attempt.attemptId}`);
      return { attemptId: attempt.attemptId, artifact: attempt.artifact };
    }
    try {
      validateMinor(attempt.amountMinor, attempt.currency);
      const supplied = await gateway.create(attempt);
      const field = route === 'qr' ? 'qrString' : route === 'hosted' ? 'html' : 'url';
      const value = supplied.artifact[field];
      if (supplied.artifact.kind !== route || typeof value !== 'string' || !value)
        throw new Error('Missing payment artifact');
      const result = { artifact: { kind: route, [field]: value }, linkId: supplied.linkId };
      store.ready(attempt.attemptId, result);
      return { attemptId: attempt.attemptId, artifact: result.artifact };
    } catch (error) {
      if (error instanceof PayWayConfigError) {
        store.rejectLocal(attempt.attemptId);
        throw new IntegrationError(400, 'Local payment configuration rejected before submission');
      }
      store.unknown(attempt.attemptId);
      throw new IntegrationError(502, `Create outcome unknown; reconcile saved attempt ${attempt.attemptId}`);
    }
  }
  function signal(body: Record<string, unknown>, signature: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IntegrationError(400, 'Malformed callback');
    const reference = body.merchant_ref_no ?? body.tran_id;
    const id = typeof reference === 'string' ? reference : '';
    const attempt = store.get(id);
    if (!attempt) throw new IntegrationError(400, 'Unknown payment reference');
    if ((attempt.route === 'link' && body.merchant_ref_no !== id) || (attempt.route !== 'link' && body.tran_id !== id))
      throw new IntegrationError(400, 'Callback identity mismatch');
    if (attempt.route !== 'link' && !verifyCallbackDetailed(body, signature, apiKey).valid)
      throw new IntegrationError(401, 'Invalid callback signature');
    if (attempt.route === 'link' && (typeof body.tran_id !== 'string' || !body.tran_id))
      throw new IntegrationError(400, 'Malformed payment-link notification');
    // Minimal validated hint; the worker queries this scoped, saved attempt.
    store.enqueue(id, JSON.stringify([id, body.tran_id ?? '', body.payment_status ?? body.status ?? 'unknown']));
    return { accepted: true };
  }
  // Customer reads never call the provider. Worker pacing is separate.
  function status(id: string, ownerId: string) {
    if (!ownerId) throw new IntegrationError(401, 'Authentication required');
    owned(id, ownerId);
    return decorate(store.view(id));
  }
  async function reconcile(id: string, ownerId?: string) {
    const attempt = owned(id, ownerId);
    if (store.view(id).verified) return decorate(store.view(id));
    const existing = inFlight.get(id);
    // A coalesced caller did not insert the job, even when the first caller did.
    if (existing) return { ...(await existing), fulfillmentQueued: false };
    const task = (async () => decorate(store.observe(id, await gateway.lookup(attempt))))();
    inFlight.set(id, task);
    try {
      return await task;
    } finally {
      inFlight.delete(id);
    }
  }
  return { create, signal, status, reconcile, pending: () => store.pending() };
}
