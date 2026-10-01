import { randomBytes } from 'node:crypto';
import { paymentLifecycle, paymentNextStep, verifyCallbackDetailed } from 'aba-payway-ts';

export type Route = 'qr' | 'hosted' | 'link';
export interface Order {
  id: string;
  ownerId: string;
  amountMinor: number;
  currency: 'USD' | 'KHR';
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
}
export interface Proof {
  identity: string;
  status: string;
  amount: number;
  currency: string;
}
export interface Gateway {
  create(attempt: Attempt): Promise<{ artifact: Artifact; linkId?: string }>;
  lookup(attempt: Attempt): Promise<Proof>;
}
// Merchant DB implementations must perform these operations atomically.
// The included SQLite adapter demonstrates durable single-host acceptance.
export interface Store {
  reserve(orderId: string, ownerId: string, route: Route, id: string): { attempt: Attempt; created: boolean };
  get(id: string): Attempt | undefined;
  ready(id: string, result: { artifact: Artifact; linkId?: string }): void;
  unknown(id: string): void;
  enqueue(id: string, deliveryId: string): void;
  accept(id: string, proof: Proof): boolean;
  pending(): string[];
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
  async function create(orderId: string, ownerId: string, route: Route) {
    if (!ownerId) throw new IntegrationError(401, 'Authentication required');
    if (!['qr', 'hosted', 'link'].includes(route)) throw new IntegrationError(400, 'Unknown payment route');
    const reserved = store.reserve(orderId, ownerId, route, `pw${randomBytes(8).toString('hex')}`);
    const attempt = reserved.attempt;
    if (!reserved.created) {
      if (attempt.state !== 'ready' || !attempt.artifact)
        throw new IntegrationError(
          409,
          `Unknown/pending create outcome; reconcile the saved attempt ${attempt.attemptId}`,
        );
      return { attemptId: attempt.attemptId, artifact: attempt.artifact };
    }
    // reserve() committed the attempt before ANY provider call.
    try {
      const supplied = await gateway.create(attempt);
      // Project the selected customer field even when adapting a custom provider.
      const field = route === 'qr' ? 'qrString' : route === 'hosted' ? 'html' : 'url';
      const value = supplied.artifact[field];
      if (supplied.artifact.kind !== route || typeof value !== 'string' || !value)
        throw new Error('Missing payment artifact');
      const result = { artifact: { kind: route, [field]: value }, linkId: supplied.linkId };
      store.ready(attempt.attemptId, result);
      return { attemptId: attempt.attemptId, artifact: result.artifact };
    } catch {
      store.unknown(attempt.attemptId);
      // Never include raw gateway bodies, signing keys or PII in browser errors.
      throw new IntegrationError(502, `Create outcome unknown; reconcile saved attempt ${attempt.attemptId}`);
    }
  }

  function signal(body: Record<string, unknown>, signature: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IntegrationError(400, 'Malformed callback');
    const reference = body.merchant_ref_no ?? body.tran_id;
    const id = typeof reference === 'string' ? reference : '';
    const attempt = store.get(id);
    if (!attempt) throw new IntegrationError(400, 'Unknown payment reference');
    if (attempt.route !== 'link' && !verifyCallbackDetailed(body, signature, apiKey).valid)
      throw new IntegrationError(401, 'Invalid callback signature');
    if (attempt.route === 'link' && (typeof body.tran_id !== 'string' || !body.tran_id))
      throw new IntegrationError(400, 'Malformed payment-link notification');
    // Store only minimal delivery identity, not callback PII/raw bodies.
    // A callback is a hint; a worker independently queries the saved attempt.
    const deliveryId = `${id}:${String(body.tran_id ?? '')}:${String(body.payment_status ?? body.status ?? 'unknown')}`;
    store.enqueue(id, deliveryId);
    return { accepted: true };
  }

  async function reconcile(id: string, ownerId?: string) {
    const attempt = store.get(id);
    if (!attempt || (ownerId !== undefined && attempt.ownerId !== ownerId))
      throw new IntegrationError(404, 'Order not found');
    const proof = await gateway.lookup(attempt);
    // Pending/declined/refunded/PRE-AUTH never enqueue fulfillment.
    const fulfilled = store.accept(id, proof);
    const lifecycle = paymentLifecycle(proof.status);
    return { attemptId: id, status: proof.status, lifecycle, nextStep: paymentNextStep(lifecycle), fulfilled };
  }

  return { create, signal, reconcile, pending: () => store.pending() };
}
