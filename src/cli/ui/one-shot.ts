/**
 * One-shot spinner wrapper: runs a single async task behind one spinner
 * handle. With a null IO the task runs unchanged (legacy paths keep their own
 * output); with clack IO the spinner shows the label while running, reports
 * done/failed, and any rejection — CliCancelled included — is rethrown for
 * the caller to translate.
 */

import type { PaymentIO } from './prompts.js';

/**
 * Run `fn` behind a single spinner. `io === null` runs `fn` with zero
 * behavior change. Success stops the spinner with code 'success'; any
 * rejection stops it with code 'fail' (message carries the error text) and
 * the error is rethrown.
 */
export async function withOneShotSpinner<T>(io: PaymentIO | null, label: string, fn: () => Promise<T>): Promise<T> {
  if (io === null) return fn();
  const spinner = io.spinner();
  spinner.message(label);
  try {
    const value = await fn();
    spinner.stop('done', 'success');
    return value;
  } catch (error) {
    spinner.stop(`failed: ${(error as Error).message}`, 'fail');
    throw error;
  }
}
