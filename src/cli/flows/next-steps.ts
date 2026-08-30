/**
 * Post-status next-step picker — pure orchestration over {@link PaymentIO}.
 *
 * Returns the user's choice only; the CALLER executes it (fetch detail, poll,
 * print the refund command, or finish). Returns `null` for non-approved
 * transactions so the caller can print its legacy status hints instead.
 */

import type { PaymentIO, SelectOption } from '../ui/prompts.js';

export type NextStepChoice = 'detail' | 'watch' | 'print-refund' | 'done';

export interface NextStepOptions {
  transactionId: string;
  /** Refund command line to offer; the option is omitted when absent. */
  refundCommand?: string;
  approved: boolean;
}

export async function chooseNextStep(io: PaymentIO, opts: NextStepOptions): Promise<NextStepChoice | null> {
  if (!opts.approved) return null;

  const options: SelectOption<NextStepChoice>[] = [
    { value: 'detail', label: 'Fetch full transaction detail', hint: 'payway-sdk transaction-detail' },
    { value: 'watch', label: 'Keep watching this transaction', hint: 'poll until status changes' },
  ];
  if (opts.refundCommand) {
    options.push({
      value: 'print-refund',
      label: 'Show refund command',
      hint: 'refunds require PAYWAY_RSA_PUBLIC_KEY',
    });
  }
  options.push({ value: 'done', label: 'Done' });

  return io.select<NextStepChoice>({
    message: `Transaction ${opts.transactionId} — what next?`,
    options,
    initial: 'detail',
  });
}
