import type { TransactionSession } from './schema.js';

/**
 * A first-payment view, not a replacement for gateway or legacy session
 * statuses. `cancelled` is distinct from `failed` per the audit's final
 * domain model (§20.3): DECLINED is an issuer/gateway rejection, CANCELLED
 * is a lifecycle cancellation (e.g. pre-auth cancel) — fulfilment reasoning
 * differs, so they must not collapse into one outcome.
 */
export type PaymentLifecycle = 'created' | 'pending' | 'approved' | 'failed' | 'cancelled' | 'unknown';

/** Pass only payment_status from a server-side lookup, never a request status.code. */
export function paymentLifecycle(paymentStatus: unknown): PaymentLifecycle {
  if (typeof paymentStatus !== 'string') return 'unknown';
  switch (paymentStatus.toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'PENDING':
      return 'pending';
    case 'DECLINED':
    // The gateway emits the typo "DECLINDED" in transaction-list output (acknowledged
    // by ABA 2026-09-12; still observed live) — treat it as DECLINED, not unknown.
    case 'DECLINDED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

export function paymentNextStep(status: PaymentLifecycle): string {
  switch (status) {
    case 'created':
      return 'Show the payment artifact, then check the existing transaction. Creation is not payment confirmation.';
    case 'pending':
      return 'Check the existing transaction again. Keep expiry and closure locally; PENDING does not prove it is still payable.';
    case 'approved':
      return 'Match the stored order transaction ID, amount, and currency, then fulfill once atomically.';
    case 'failed':
      return 'Inspect the rejection before offering a new payment attempt with a fresh transaction ID.';
    case 'cancelled':
      return 'Treat as terminated by cancel/expiry policy — do not fulfill; a new attempt needs a fresh transaction ID.';
    case 'unknown':
      return 'Query the existing transaction before creating a replacement. Do not fulfill from an unknown outcome.';
  }
}

export type PaymentArtifact = Pick<TransactionSession, 'sessionId' | 'responseType' | 'responsePayload' | 'expiresAt'>;

/** Select only the checkout artifact for an authorized customer; never forward session.raw. */
export function paymentArtifact(session: TransactionSession): PaymentArtifact {
  return {
    sessionId: session.sessionId,
    responseType: session.responseType,
    responsePayload: session.responsePayload,
    expiresAt: session.expiresAt,
  };
}
