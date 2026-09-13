/**
 * Guided pre-flight summary + confirmation for create-style commands
 * (spec §7.1 adaptation: the target commands gate their params behind
 * requiredOption, so gap-filling wizards are impossible without breaking
 * pinned usage-error contracts — instead, clack-mode runs get a summary
 * note + explicit confirm before the API call, skippable with `-y`).
 */

import type { PaymentIO } from '../ui/prompts.js';

export interface ConfirmSummaryRow {
  label: string;
  value: string;
}

/**
 * Shows a boxed summary and asks for confirmation. Returns false when the
 * user declines (caller prints "Cancelled by user." and exits 1 — matching
 * the qr-flow cancellation convention).
 */
export async function confirmSubmit(
  io: PaymentIO,
  title: string,
  rows: readonly ConfirmSummaryRow[],
  message = 'Submit this request?',
): Promise<boolean> {
  const width = rows.reduce((max, row) => Math.max(max, row.label.length + 2 + row.value.length), 0);
  const body = rows.map((row) => `${`${row.label}:`.padEnd(row.label.length + 2)}${row.value}`).join('\n');
  io.note(body.padEnd(width), title);
  return io.confirm({ message, initial: false });
}

/** Formats an amount+currency pair consistently across summaries. */
export function formatAmount(amount: string | number, currency: string): string {
  return `${amount} ${currency}`;
}
