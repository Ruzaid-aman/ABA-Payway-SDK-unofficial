import type { PaymentView } from './service.js';
import { toGatewayAmount } from './money.js';
// Render text via the framework, never as untrusted HTML. Labels are teaching
// copy; approved branding/localization/accessibility/device checks still apply.
export function customerState(view: PaymentView, expiresAt?: number, now = Date.now()) {
  const expired = expiresAt !== undefined && now >= expiresAt;
  const state = view.verified
    ? 'success'
    : view.status === 'REVIEW'
      ? 'review'
      : view.status === 'DECLINED'
        ? 'declined'
        : expired
          ? 'expired'
          : view.status === 'AWAITING_CUSTOMER'
            ? 'awaiting'
            : view.status === 'UNKNOWN'
              ? 'unknown'
              : 'pending';
  const messages = {
    success: 'Payment verified. Your order is being processed.',
    awaiting: 'Choose the saved payment interaction to pay this order.',
    review: 'We are checking payment details. Please do not pay again.',
    declined: 'The payment was declined. You may start a new attempt.',
    expired: 'The payment interaction expired. We are checking for a late payment.',
    unknown: 'The result is not yet known. Please do not pay again.',
    pending: 'Waiting for payment confirmation.',
  };
  return {
    state,
    message: messages[state],
    attemptId: view.attemptId,
    amount: toGatewayAmount(view.amountMinor, view.currency),
    currency: view.currency,
    showPaymentInteraction: !view.verified && !expired && ['PENDING', 'AWAITING_CUSTOMER'].includes(view.status),
    allowNewAttempt: state === 'declined',
    liveRegion: 'polite' as const,
  };
}
