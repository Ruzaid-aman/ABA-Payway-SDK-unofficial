/**
 * Headless tests for the interactive flow orchestrators (src/cli/flows/*).
 *
 * A scripted fake PaymentIO drives each wizard: queued answers, recorded
 * calls, and recorded validation rejections — mirroring clack's contract
 * (text prompts re-ask via `validate` until the answer passes, honoring
 * `defaultValue`). No terminal I/O.
 */
import { describe, expect, it } from 'vitest';
import { confirmCheckoutSubmit } from '../cli/flows/checkout-flow.js';
import { chooseNextStep } from '../cli/flows/next-steps.js';
import { collectQrParams, type QrFlowFlags, type QrFlowResult } from '../cli/flows/qr-flow.js';
import type { PaymentIO, SelectOption, SpinnerHandle } from '../cli/ui/prompts.js';
import { CliCancelled } from '../cli/ui/prompts.js';

// ─── Fake IO ───────────────────────────────────────────────────────────────

/** Queued answer sentinel: abort the prompt like a Ctrl-C would. */
const CANCEL = Symbol('cancel');

type Answer = string | boolean | typeof CANCEL;

interface IoCall {
  kind: 'intro' | 'outro' | 'note' | 'text' | 'select' | 'confirm';
  message?: string;
  title?: string;
  body?: string;
  value?: string;
  answer?: string | boolean;
  options?: SelectOption<string>[];
}

interface Rejection {
  prompt: string;
  value: string;
  message: string;
}

function createFakeIo(answers: Answer[]): { io: PaymentIO; calls: IoCall[]; rejections: Rejection[] } {
  const calls: IoCall[] = [];
  const rejections: Rejection[] = [];
  let cursor = 0;

  const next = (): Answer => {
    const answer = answers[cursor];
    cursor += 1;
    if (answer === undefined) throw new Error(`fake IO ran out of queued answers at index ${cursor - 1}`);
    return answer;
  };

  const io: PaymentIO = {
    mode: 'clack',
    async text({ message, validate, defaultValue }) {
      for (;;) {
        const raw = next();
        if (raw === CANCEL) throw new CliCancelled('Input cancelled');
        const value = raw === '' && defaultValue !== undefined ? defaultValue : String(raw);
        const error = validate?.(value);
        if (error === undefined) {
          calls.push({ kind: 'text', message, value });
          return value;
        }
        rejections.push({ prompt: message ?? '', value, message: error });
      }
    },
    async select<T extends string>(opts: { message: string; options: SelectOption<T>[]; initial?: T }): Promise<T> {
      const { message, options } = opts;
      const raw = next();
      if (raw === CANCEL) throw new CliCancelled('Selection cancelled');
      if (!options.some((option) => option.value === raw)) {
        throw new Error(`fake IO answer '${String(raw)}' is not an option for select '${message}'`);
      }
      calls.push({ kind: 'select', message, value: String(raw), options });
      return raw as T;
    },
    async confirm({ message }) {
      const raw = next();
      if (raw === CANCEL) throw new CliCancelled('Confirmation cancelled');
      const answer = Boolean(raw);
      calls.push({ kind: 'confirm', message, answer });
      return answer;
    },
    note(body, title) {
      calls.push({ kind: 'note', body, title });
    },
    intro(title) {
      calls.push({ kind: 'intro', title });
    },
    outro(message) {
      calls.push({ kind: 'outro', message });
    },
    spinner(): SpinnerHandle {
      return { message: () => undefined, stop: () => undefined };
    },
  };

  return { io, calls, rejections };
}

type QrSuccess = Extract<QrFlowResult, { cancelled: false }>;

function expectSuccess(result: QrFlowResult): QrSuccess {
  if (result.cancelled) throw new Error('expected the flow to succeed, but it was cancelled');
  return result;
}

const callsOfKind = (calls: IoCall[], kind: IoCall['kind']): IoCall[] => calls.filter((call) => call.kind === kind);

/** Standard online answers: everything probed, callback entered, submit confirmed. */
const fullOnlineAnswers = (overrides: {
  amount: [string, ...string[]];
  lifetime?: [string, ...string[]];
  currency?: string;
  template?: string;
  paymentOption?: string;
  callbackChoice?: string;
  callbackUrl?: string;
  submit?: boolean;
}): Answer[] => [
  overrides.currency ?? 'USD',
  ...overrides.amount,
  overrides.template ?? 'template2',
  overrides.paymentOption ?? 'abapay_khqr',
  ...(overrides.lifetime ?? ['180']),
  overrides.callbackChoice ?? 'enter',
  ...(overrides.callbackChoice === undefined || overrides.callbackChoice === 'enter'
    ? [overrides.callbackUrl ?? 'https://example.com/payway/hook']
    : []),
  overrides.submit ?? true,
];

// ─── collectQrParams ───────────────────────────────────────────────────────

describe('collectQrParams', () => {
  it('probes all missing inputs in order and returns the collected params', async () => {
    const { io, calls } = createFakeIo(fullOnlineAnswers({ amount: ['6.12'], lifetime: ['600'] }));
    const success = expectSuccess(await collectQrParams({}, io));

    expect(success.offline).toBe(false);
    expect(success.params).toEqual({
      amount: 6.12,
      currency: 'USD',
      template: 'template2',
      paymentOption: 'abapay_khqr',
      lifetimeSeconds: 600,
      callbackUrl: 'https://example.com/payway/hook',
      transactionId: expect.stringMatching(/^qr[a-z0-9]+[0-9a-f]{6}$/),
    });

    // Probe order: currency → amount → template → payment option → lifetime → callback.
    expect(calls.map((call) => call.kind)).toEqual([
      'intro',
      'select',
      'text',
      'select',
      'select',
      'text',
      'select',
      'text',
      'note',
      'confirm',
      'outro',
    ]);
    const selects = callsOfKind(calls, 'select');
    expect(selects.map((call) => call.message)).toEqual([
      'Currency',
      'QR template',
      'Payment option',
      'A callback (webhook) URL is required for online QR payments',
    ]);
    const texts = callsOfKind(calls, 'text');
    expect(texts.map((call) => call.message)).toEqual(['Amount', 'Lifetime (seconds)', 'Callback URL']);

    // Template picker keeps the '(default)' label; values are the raw names.
    expect(selects[1]?.options).toContainEqual({
      value: 'template2',
      label: 'template2 (default)',
      hint: 'White card with ABA logo header',
    });
    expect(selects[1]?.options?.map((option) => option.value)).toEqual([
      'template1',
      'template1_color',
      'template2',
      'template2_color',
      'template3_color',
      'template4',
      'template4_color',
    ]);

    // Payment option picker: default first, with the spec'd hints.
    expect(selects[2]?.options).toEqual([
      { value: 'abapay_khqr', label: 'abapay_khqr', hint: 'ABA app / KHQR scan (default)' },
      { value: 'abapay_khqr_deeplink', label: 'abapay_khqr_deeplink', hint: 'ABA app deeplink' },
      { value: 'cards', label: 'cards', hint: 'Hosted card form' },
      { value: 'alipay', label: 'alipay', hint: 'Alipay' },
      { value: 'wechat', label: 'wechat', hint: 'WeChat Pay' },
      { value: 'google_pay', label: 'google_pay', hint: 'Google Pay' },
    ]);
  });

  it('honors provided flags without probing them', async () => {
    const { io, calls } = createFakeIo([true]);
    const flags: QrFlowFlags = {
      amount: '6.12',
      currency: 'USD',
      template: 'template3_color',
      paymentOption: 'cards',
      lifetime: '300',
      callbackUrl: 'https://example.com/hook',
      ref: 'ORDER-1',
      transactionId: 'tx-abc-123',
    };
    const success = expectSuccess(await collectQrParams(flags, io));

    expect(success.params).toEqual({
      amount: 6.12,
      currency: 'USD',
      template: 'template3_color',
      paymentOption: 'cards',
      lifetimeSeconds: 300,
      callbackUrl: 'https://example.com/hook',
      ref: 'ORDER-1',
      transactionId: 'tx-abc-123',
    });
    expect(callsOfKind(calls, 'text')).toHaveLength(0);
    expect(callsOfKind(calls, 'select')).toHaveLength(0);
    expect(callsOfKind(calls, 'intro')).toHaveLength(1);
    expect(callsOfKind(calls, 'note')).toHaveLength(1);
    expect(callsOfKind(calls, 'outro')).toHaveLength(1);
  });

  it('re-asks until the USD amount is valid', async () => {
    const { io, calls, rejections } = createFakeIo(fullOnlineAnswers({ amount: ['abc', '3.5'] }));
    const success = expectSuccess(await collectQrParams({}, io));

    expect(success.params.amount).toBe(3.5);
    expect(rejections).toEqual([
      { prompt: 'Amount', value: 'abc', message: 'Amount must be a positive number with up to 2 decimals for USD' },
    ]);
    expect(callsOfKind(calls, 'text').at(0)?.value).toBe('3.5');
  });

  it('rejects decimal KHR amounts and accepts whole numbers', async () => {
    const { io, rejections } = createFakeIo(fullOnlineAnswers({ currency: 'KHR', amount: ['3.5', '3500'] }));
    const success = expectSuccess(await collectQrParams({}, io));

    expect(success.params.currency).toBe('KHR');
    expect(success.params.amount).toBe(3500);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.message).toBe('Amount must be a positive whole number for KHR (no decimals)');
  });

  it('rejects lifetimes below the 180-second gateway minimum, then accepts a valid one', async () => {
    const { io, rejections } = createFakeIo(fullOnlineAnswers({ amount: ['6.12'], lifetime: ['179', '600'] }));
    const success = expectSuccess(await collectQrParams({}, io));

    expect(success.params.lifetimeSeconds).toBe(600);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.prompt).toBe('Lifetime (seconds)');
    expect(rejections[0]?.message).toContain('at least 180 seconds');
  });

  it('switches to the offline path when the user picks offline at the callback prompt', async () => {
    // Answers: USD → 6.12 → template2 → abapay_khqr → 180 → 'offline' → ref → confirm.
    const { io, calls } = createFakeIo(['USD', '6.12', 'template2', 'abapay_khqr', '180', 'offline', 'REF-1', true]);
    const success = expectSuccess(await collectQrParams({}, io));

    expect(success.offline).toBe(true);
    expect(success.params.ref).toBe('REF-1');
    expect(success.params.callbackUrl).toBeUndefined();
    expect(success.params.amount).toBe(6.12);
    // Offline defaults per the wizard contract.
    expect(success.params.template).toBe('template2');
    expect(success.params.paymentOption).toBe('abapay_khqr');
    expect(success.params.lifetimeSeconds).toBe(180);

    expect(calls).toContainEqual(
      expect.objectContaining({ kind: 'note', body: 'Offline QR needs no API call or credentials.' }),
    );
    // The ref is probed (after the earlier amount/lifetime probes), but never a callback URL.
    expect(callsOfKind(calls, 'text').map((call) => call.message)).toEqual([
      'Amount',
      'Lifetime (seconds)',
      'Merchant reference',
    ]);
    // The shared confirm summary shows the offline callback placeholder.
    const summary = callsOfKind(calls, 'note').find((call) => call.title === 'Confirm payment QR');
    expect(summary?.body).toContain('Callback URL:');
    expect(summary?.body).toContain('— (offline)');
  });

  it('returns cancelled when the user declines at the callback prompt', async () => {
    const { io, calls } = createFakeIo(fullOnlineAnswers({ amount: ['6.12'], callbackChoice: 'cancel' }));
    const result = await collectQrParams({}, io);

    expect(result).toEqual({ cancelled: true });
    expect(callsOfKind(calls, 'confirm')).toHaveLength(0);
    expect(callsOfKind(calls, 'outro')).toHaveLength(0);
  });

  it('shows the summary note and cancels when the submit confirmation is declined', async () => {
    const { io, calls } = createFakeIo(fullOnlineAnswers({ amount: ['6.12'], submit: false }));
    const result = await collectQrParams({}, io);

    expect(result).toEqual({ cancelled: true });
    const notes = callsOfKind(calls, 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe('Confirm payment QR');
    expect(notes[0]?.body ?? '').toContain('Amount:');
    expect(notes[0]?.body ?? '').toContain('6.12 USD');
    expect(callsOfKind(calls, 'outro')).toHaveLength(0);
  });

  it('collects offline params with defaults and probes only what is missing', async () => {
    // ref provided; empty answer on the amount probe → static QR (no amount).
    const { io, calls } = createFakeIo(['']);
    const success = expectSuccess(await collectQrParams({ offline: true, ref: 'REF-9' }, io));

    expect(success.offline).toBe(true);
    expect(success.params).toEqual({
      currency: 'USD',
      template: 'template2',
      paymentOption: 'abapay_khqr',
      lifetimeSeconds: 180,
      ref: 'REF-9',
      transactionId: expect.stringMatching(/^qr[a-z0-9]+[0-9a-f]{6}$/),
    });
    // Only the static-amount probe; no ref probe, no select, no summary/confirm.
    expect(callsOfKind(calls, 'text')).toHaveLength(1);
    expect(callsOfKind(calls, 'select')).toHaveLength(0);
    expect(callsOfKind(calls, 'confirm')).toHaveLength(0);
    expect(callsOfKind(calls, 'note')).toHaveLength(0);
  });

  it('probes the merchant reference before the static amount for offline QR', async () => {
    const { io, calls } = createFakeIo(['REF-2', '3500']);
    const success = expectSuccess(await collectQrParams({ offline: true, currency: 'KHR' }, io));

    expect(success.params.ref).toBe('REF-2');
    expect(success.params.amount).toBe(3500);
    expect(success.params.currency).toBe('KHR');
    expect(callsOfKind(calls, 'text').map((call) => call.message)).toEqual(['Merchant reference', 'Amount']);
  });

  it('propagates CliCancelled when the user aborts a text prompt', async () => {
    const { io } = createFakeIo(['USD', CANCEL]);
    await expect(collectQrParams({}, io)).rejects.toBeInstanceOf(CliCancelled);
  });
});

// ─── confirmCheckoutSubmit ─────────────────────────────────────────────────

describe('confirmCheckoutSubmit', () => {
  const input = {
    transactionId: 'ck-1',
    amount: 5,
    currency: 'USD' as const,
    paymentOption: 'abapay_khqr_deeplink',
    returnUrl: 'https://shop.example/return',
    cancelUrl: 'https://shop.example/cancel',
  };

  it('shows the checkout summary and returns true when confirmed', async () => {
    const { io, calls } = createFakeIo([true]);
    expect(await confirmCheckoutSubmit(input, io)).toBe(true);

    const notes = callsOfKind(calls, 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe('Confirm checkout payment');
    expect(notes[0]?.body ?? '').toContain('Transaction ID:');
    expect(notes[0]?.body ?? '').toContain('Amount:');
    expect(notes[0]?.body ?? '').toContain('Payment option:');
    expect(notes[0]?.body ?? '').toContain('https://shop.example/return');
    expect(notes[0]?.body ?? '').toContain('https://shop.example/cancel');
  });

  it('returns false when the user declines', async () => {
    const { io } = createFakeIo([false]);
    expect(await confirmCheckoutSubmit(input, io)).toBe(false);
  });

  it('renders an em dash for absent return/cancel URLs', async () => {
    const { io, calls } = createFakeIo([true]);
    await confirmCheckoutSubmit({ transactionId: 'ck-2', amount: 3500, currency: 'KHR', paymentOption: 'cards' }, io);
    const body = callsOfKind(calls, 'note')[0]?.body ?? '';
    expect(body).toContain('Return URL:');
    expect(body).toContain('—');
  });
});

// ─── chooseNextStep ────────────────────────────────────────────────────────

describe('chooseNextStep', () => {
  it('returns null without prompting when the transaction is not approved', async () => {
    const { io, calls } = createFakeIo([]);
    expect(await chooseNextStep(io, { transactionId: 't1', approved: false })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('offers detail/watch/refund/done and returns the chosen value', async () => {
    const { io, calls } = createFakeIo(['detail']);
    const choice = await chooseNextStep(io, {
      transactionId: 't1',
      refundCommand: 'payway-sdk refund -t t1 -a 1.00',
      approved: true,
    });

    expect(choice).toBe('detail');
    const select = callsOfKind(calls, 'select')[0];
    expect(select?.message).toContain('t1');
    expect(select?.options?.map((option) => option.value)).toEqual(['detail', 'watch', 'print-refund', 'done']);
    expect(select?.options?.find((option) => option.value === 'detail')?.hint).toBe('payway-sdk transaction-detail');
    expect(select?.options?.find((option) => option.value === 'print-refund')?.hint).toBe(
      'refunds require PAYWAY_RSA_PUBLIC_KEY',
    );
  });

  it('omits the refund entry when no refund command is provided', async () => {
    const { io, calls } = createFakeIo(['done']);
    const choice = await chooseNextStep(io, { transactionId: 't1', approved: true });

    expect(choice).toBe('done');
    const select = callsOfKind(calls, 'select')[0];
    expect(select?.options?.map((option) => option.value)).toEqual(['detail', 'watch', 'done']);
  });
});
