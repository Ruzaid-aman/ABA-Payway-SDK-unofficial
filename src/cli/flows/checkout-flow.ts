/**
 * Checkout payment confirmation — pure orchestration over {@link PaymentIO}.
 *
 * Shows the checkout parameter summary and asks for submit confirmation.
 * The caller decides what to do with the answer (create the checkout URL,
 * start polling, or abort); nothing here touches the console or network.
 */

import { formatAmount } from '../../utils.js';
import { formatKeyValueSummary } from '../ui/panels.js';
import type { PaymentIO } from '../ui/prompts.js';

export interface CheckoutSummaryInput {
  transactionId: string;
  amount: number;
  currency: 'USD' | 'KHR';
  paymentOption: string;
  returnUrl?: string;
  cancelUrl?: string;
}

/** Render the checkout summary and return the user's submit decision. */
export async function confirmCheckoutSubmit(input: CheckoutSummaryInput, io: PaymentIO): Promise<boolean> {
  const rows = [
    { label: 'Transaction ID', value: input.transactionId },
    { label: 'Amount', value: `${formatAmount(input.amount, input.currency)} ${input.currency}` },
    { label: 'Payment option', value: input.paymentOption },
    { label: 'Return URL', value: input.returnUrl ?? '—' },
    { label: 'Cancel URL', value: input.cancelUrl ?? '—' },
  ];
  io.note(formatKeyValueSummary(rows).join('\n'), 'Confirm checkout payment');
  return io.confirm({ message: 'Create the checkout URL and start polling?', initial: true });
}
