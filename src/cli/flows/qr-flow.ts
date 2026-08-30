/**
 * Guided QR payment wizard — pure orchestration over {@link PaymentIO}.
 *
 * Flows never touch the console, process, or network: the caller passes the
 * Commander flags plus an IO adapter and receives either the resolved
 * parameters (to execute the PayWay API call or the offline KHQR generation
 * with) or a cancellation. Only `undefined` flags are probed interactively;
 * provided flags are honored as-is, and when one fails validation the wizard
 * falls back to the matching prompt so the user can correct it.
 */

import { randomBytes } from 'node:crypto';
import { PAYMENT_OPTIONS, QR_LIFETIME_MIN_SECONDS, QR_TEMPLATES, QR_TEMPLATE_NAMES } from '../../constants.js';
import { formatAmount, validatePublicHttpsUrl } from '../../utils.js';
import { formatKeyValueSummary } from '../ui/panels.js';
import type { PaymentIO, SelectOption } from '../ui/prompts.js';

/** Raw `generate-qr` flags; `undefined` means the user did not pass the flag. */
export interface QrFlowFlags {
  amount?: string;
  currency?: string;
  template?: string;
  paymentOption?: string;
  lifetime?: string;
  callbackUrl?: string;
  offline?: boolean;
  /** Merchant reference — required for offline QR. */
  ref?: string;
  /** Optional; generated silently when absent (current CLI convention). */
  transactionId?: string;
}

/** Resolved generate-qr parameters, ready for the caller to execute. */
export interface QrFlowParams {
  /** Absent for a static offline QR (no amount embedded). */
  amount?: number;
  currency: 'USD' | 'KHR';
  template: string;
  paymentOption: string;
  lifetimeSeconds: number;
  callbackUrl?: string;
  ref?: string;
  transactionId: string;
}

export type QrFlowResult = { cancelled: false; offline: boolean; params: QrFlowParams } | { cancelled: true };

type CallbackChoice = 'enter' | 'offline' | 'cancel';

const CURRENCY_OPTIONS: SelectOption<'USD' | 'KHR'>[] = [
  { value: 'USD', label: 'USD', hint: 'USD — US Dollar (2 decimals)' },
  { value: 'KHR', label: 'KHR', hint: 'KHR — Riel (whole numbers)' },
];

const CALLBACK_OPTIONS: SelectOption<CallbackChoice>[] = [
  { value: 'enter', label: 'Enter a callback URL', hint: 'public HTTPS endpoint that receives payment webhooks' },
  { value: 'offline', label: 'Generate an offline QR instead', hint: 'no API call or credentials required' },
  { value: 'cancel', label: 'Cancel' },
];

/** Display order for the payment-option picker: the default first, then the rest of PAYMENT_OPTIONS. */
const PAYMENT_OPTION_ORDER: readonly string[] = [
  'abapay_khqr',
  'abapay_khqr_deeplink',
  ...PAYMENT_OPTIONS.filter((option) => option !== 'abapay_khqr' && option !== 'abapay_khqr_deeplink'),
];

const PAYMENT_OPTION_HINTS: Record<string, string> = {
  abapay_khqr: 'ABA app / KHQR scan (default)',
  abapay_khqr_deeplink: 'ABA app deeplink',
  cards: 'Hosted card form',
  alipay: 'Alipay',
  wechat: 'WeChat Pay',
  google_pay: 'Google Pay',
};

/**
 * Run the guided QR wizard. Probe order (online): currency → amount →
 * template → payment option → lifetime → callback. `--offline` short-circuits
 * to the offline probes (ref, then optional static amount) and returns
 * immediately with the offline defaults.
 */
export async function collectQrParams(flags: QrFlowFlags, io: PaymentIO): Promise<QrFlowResult> {
  io.intro('ABA PayWay · guided QR payment');

  if (flags.offline) {
    return collectDirectOfflineParams(flags, io);
  }

  let currency = normalizeCurrency(flags.currency);
  if (currency === undefined) {
    currency = await io.select<'USD' | 'KHR'>({
      message: 'Currency',
      options: CURRENCY_OPTIONS,
      initial: 'USD',
    });
  }

  const amount = await resolveRequiredAmount(io, currency, flags.amount);

  let template = flags.template;
  if (template === undefined || !QR_TEMPLATE_NAMES.includes(template)) {
    template = await io.select<string>({
      message: 'QR template',
      // Raw template names as values; labels keep the '(default)' marker.
      options: QR_TEMPLATES.map((entry) => ({ value: entry.value, label: entry.label, hint: entry.hint })),
      initial: 'template2',
    });
  }

  let paymentOption = flags.paymentOption;
  if (paymentOption === undefined || !PAYMENT_OPTION_ORDER.includes(paymentOption)) {
    paymentOption = await io.select<string>({
      message: 'Payment option',
      options: PAYMENT_OPTION_ORDER.map((value) => ({ value, label: value, hint: PAYMENT_OPTION_HINTS[value] })),
      initial: 'abapay_khqr',
    });
  }

  const lifetimeSeconds = await resolveLifetimeSeconds(io, flags.lifetime);

  let callbackUrl: string;
  if (flags.callbackUrl !== undefined && callbackUrlError(flags.callbackUrl) === undefined) {
    callbackUrl = flags.callbackUrl;
  } else {
    const choice = await io.select<CallbackChoice>({
      message: 'A callback (webhook) URL is required for online QR payments',
      options: CALLBACK_OPTIONS,
      initial: 'enter',
    });
    if (choice === 'cancel') {
      return { cancelled: true };
    }
    if (choice === 'offline') {
      // Switch to the offline path: keep the amount already collected, probe
      // the reference, and use the offline defaults for template/option.
      io.note('Offline QR needs no API call or credentials.');
      const ref = await resolveRef(io, flags.ref);
      return finishWithConfirmation(io, {
        offline: true,
        amount,
        currency,
        template: 'template2',
        paymentOption: 'abapay_khqr',
        lifetimeSeconds: QR_LIFETIME_MIN_SECONDS,
        ref,
        transactionId: flags.transactionId ?? generateTransactionId(),
      });
    }
    callbackUrl = await io.text({
      message: 'Callback URL',
      placeholder: 'https://your-app.example.com/payway/webhook',
      validate: callbackUrlError,
    });
  }

  return finishWithConfirmation(io, {
    offline: false,
    amount,
    currency,
    template,
    paymentOption,
    lifetimeSeconds,
    callbackUrl,
    ...(flags.ref !== undefined ? { ref: flags.ref } : {}),
    transactionId: flags.transactionId ?? generateTransactionId(),
  });
}

/** Shared tail: summary note → confirm → outro → success result. */
async function finishWithConfirmation(
  io: PaymentIO,
  input: {
    offline: boolean;
    amount: number;
    currency: 'USD' | 'KHR';
    template: string;
    paymentOption: string;
    lifetimeSeconds: number;
    callbackUrl?: string;
    ref?: string;
    transactionId: string;
  },
): Promise<QrFlowResult> {
  const rows = [
    { label: 'Amount', value: `${formatAmount(input.amount, input.currency)} ${input.currency}` },
    { label: 'Currency', value: input.currency },
    { label: 'Transaction ID', value: input.transactionId },
    { label: 'Template', value: input.template },
    { label: 'Payment option', value: input.paymentOption },
    { label: 'Lifetime', value: `${input.lifetimeSeconds} seconds` },
    { label: 'Callback URL', value: input.callbackUrl ?? '— (offline)' },
  ];
  io.note(formatKeyValueSummary(rows).join('\n'), 'Confirm payment QR');

  if (!(await io.confirm({ message: 'Submit to PayWay?', initial: true }))) {
    return { cancelled: true };
  }

  io.outro('Creating your QR…');
  return {
    cancelled: false,
    offline: input.offline,
    params: {
      amount: input.amount,
      currency: input.currency,
      template: input.template,
      paymentOption: input.paymentOption,
      lifetimeSeconds: input.lifetimeSeconds,
      ...(input.callbackUrl !== undefined ? { callbackUrl: input.callbackUrl } : {}),
      ...(input.ref !== undefined ? { ref: input.ref } : {}),
      transactionId: input.transactionId,
    },
  };
}

/** `--offline` entry path: probe ref (required), then the optional static amount, and return. */
async function collectDirectOfflineParams(flags: QrFlowFlags, io: PaymentIO): Promise<QrFlowResult> {
  const currency = normalizeCurrency(flags.currency) ?? 'USD';
  const ref = await resolveRef(io, flags.ref);
  const amount = await resolveOptionalAmount(io, currency, flags.amount);
  return {
    cancelled: false,
    offline: true,
    params: {
      ...(amount !== undefined ? { amount } : {}),
      currency,
      template: 'template2',
      paymentOption: 'abapay_khqr',
      lifetimeSeconds: QR_LIFETIME_MIN_SECONDS,
      ref,
      transactionId: flags.transactionId ?? generateTransactionId(),
    },
  };
}

async function resolveRequiredAmount(
  io: PaymentIO,
  currency: 'USD' | 'KHR',
  provided: string | undefined,
): Promise<number> {
  if (provided !== undefined && amountError(provided, currency) === undefined) {
    return Number(provided);
  }
  const raw = await io.text({
    message: 'Amount',
    placeholder: currency === 'USD' ? 'e.g. 6.12' : 'e.g. 35000',
    validate: (value) => amountError(value, currency),
  });
  return Number(raw);
}

/** Offline static-QR probe: empty input means "no amount embedded". */
async function resolveOptionalAmount(
  io: PaymentIO,
  currency: 'USD' | 'KHR',
  provided: string | undefined,
): Promise<number | undefined> {
  const validate = (value: string): string | undefined => (value === '' ? undefined : amountError(value, currency));
  if (provided !== undefined && validate(provided) === undefined) {
    return provided === '' ? undefined : Number(provided);
  }
  const raw = await io.text({
    message: 'Amount',
    placeholder: 'empty = static QR (no amount)',
    validate,
  });
  return raw === '' ? undefined : Number(raw);
}

async function resolveLifetimeSeconds(io: PaymentIO, provided: string | undefined): Promise<number> {
  if (provided !== undefined && lifetimeError(provided) === undefined) {
    return Number(provided);
  }
  const raw = await io.text({
    message: 'Lifetime (seconds)',
    defaultValue: '180',
    // Empty input means "use the default": clack runs validate() on the raw
    // value BEFORE applying defaultValue, so a bare lifetimeError('') would
    // turn pressing Enter for the 180s default into an endless re-ask loop.
    validate: (value) => (value === '' ? undefined : lifetimeError(value)),
  });
  // Fallback mirrors the prompt default for IO adapters that bypass defaultValue.
  return Number(raw === '' ? '180' : raw);
}

async function resolveRef(io: PaymentIO, provided: string | undefined): Promise<string> {
  if (provided !== undefined && provided.trim() !== '') {
    return provided;
  }
  return io.text({
    message: 'Merchant reference',
    placeholder: 'e.g. ORDER-2026-0001',
    validate: (value) => (value.trim() === '' ? 'Merchant reference must not be empty' : undefined),
  });
}

/** Currency-specific amount message, shared by the USD/KHR decimal rules. */
function amountError(raw: string, currency: 'USD' | 'KHR'): string | undefined {
  const value = Number(raw);
  const message =
    currency === 'USD'
      ? 'Amount must be a positive number with up to 2 decimals for USD'
      : 'Amount must be a positive whole number for KHR (no decimals)';
  if (!Number.isFinite(value) || value <= 0) return message;
  if (currency === 'USD') {
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(value - rounded) > 1e-10) return message;
  } else if (!Number.isInteger(value)) {
    return message;
  }
  return undefined;
}

function lifetimeError(raw: string): string | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return 'Lifetime must be a positive whole number of seconds';
  }
  if (value < QR_LIFETIME_MIN_SECONDS) {
    return `Lifetime must be at least ${QR_LIFETIME_MIN_SECONDS} seconds — the PayWay gateway minimum (below that the API rejects with code "04")`;
  }
  return undefined;
}

/** Wrap the thrown PayWayConfigError into a re-ask validation message. */
function callbackUrlError(value: string): string | undefined {
  try {
    validatePublicHttpsUrl(value, 'callbackUrl');
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function normalizeCurrency(raw: string | undefined): 'USD' | 'KHR' | undefined {
  if (raw === undefined) return undefined;
  const upper = raw.trim().toUpperCase();
  return upper === 'USD' || upper === 'KHR' ? upper : undefined;
}

/** `qr<base36 timestamp><3 random hex bytes>` — the CLI's current convention, inlined. */
function generateTransactionId(): string {
  return `qr${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}
