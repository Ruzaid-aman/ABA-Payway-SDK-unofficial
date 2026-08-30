/**
 * PaymentIO — the adapter every interactive flow programs against.
 *
 * Only the `clack` mode has a production implementation: when
 * {@link resolvePromptMode} returns 'clack' the caller builds a clack-backed
 * IO via {@link createClackIO}; for 'readline'/'none' the command keeps its
 * legacy inline path (byte-identical historical behavior). Unit tests hand-roll
 * fakes against the interface to assert wizard sequences headlessly.
 */

import {
  cancel as clackCancel,
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  spinner as clackSpinner,
  text as clackText,
} from '@clack/prompts';

/** Thrown when the user aborts a clack prompt (Ctrl-C); mapped to exit code 130. */
export class CliCancelled extends Error {
  constructor(message = 'Cancelled by user') {
    super(message);
    this.name = 'CliCancelled';
  }
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export type SpinnerCode = 'success' | 'fail' | 'warn';

export interface SpinnerHandle {
  /** Update the in-place spinner line. */
  message(text: string): void;
  /** Stop the spinner and print the final line. */
  stop(finalMessage?: string, code?: SpinnerCode): void;
}

export interface PaymentIO {
  /** Always 'clack' — flows are only invoked in clack mode. */
  readonly mode: 'clack';
  /** Free-text input with validation; re-asks with `validate`'s message until valid. */
  text(options: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  /** Single choice from a labeled option list; Ctrl-C cancels. */
  select<T extends string>(options: {
    message: string;
    options: SelectOption<T>[];
    initial?: T;
  }): Promise<T>;
  /** Yes/no confirmation. */
  confirm(options: { message: string; initial?: boolean }): Promise<boolean>;
  /** Informational boxed note. */
  note(body: string, title?: string): void;
  /** Intro/outro frames for wizard-shaped commands. */
  intro(title: string): void;
  outro(message: string): void;
  /** Start an in-place spinner. */
  spinner(): SpinnerHandle;
}

function assertNotCancelled<T>(value: T | symbol, message = 'Cancelled'): T {
  if (isCancel(value)) throw new CliCancelled(message);
  return value as T;
}

/**
 * clack's `Option<Value>` is a deferred conditional type that a generic `T
 * extends string` cannot satisfy structurally. PaymentIO options are always
 * string primitives, so re-declare that (simpler, equivalent) signature once
 * at this boundary instead of casting at every call site.
 */
type ClackSelect = <V extends string>(o: {
  message: string;
  options: Array<{ value: V; label?: string; hint?: string }>;
  initialValue?: V;
}) => Promise<V | symbol>;
const clackSelectString = clackSelect as unknown as ClackSelect;

/** Real-terminal implementation backed by @clack/prompts. */
export function createClackIO(): PaymentIO {
  return {
    mode: 'clack',
    async text({ message, placeholder, defaultValue, validate }) {
      const value = assertNotCancelled(
        await clackText({
          message,
          placeholder,
          defaultValue,
          // PaymentIO validators return `string | undefined`, which is a
          // subset of clack's Validate<string> (`string | Error | undefined`).
          validate: validate as ((value: string | undefined) => string | Error | undefined) | undefined,
        }),
        'Input cancelled',
      );
      return String(value);
    },
    async select<T extends string>(opts: {
      message: string;
      options: SelectOption<T>[];
      initial?: T;
    }): Promise<T> {
      const { message, options, initial } = opts;
      const value = assertNotCancelled(
        await clackSelectString({ message, options, initialValue: initial }),
        'Selection cancelled',
      );
      return value as T;
    },
    async confirm({ message, initial }) {
      const value = assertNotCancelled(await clackConfirm({ message, initialValue: initial }), 'Confirmation cancelled');
      return Boolean(value);
    },
    note(body, title) {
      clackNote(body, title);
    },
    intro(title) {
      clackIntro(title);
    },
    outro(message) {
      clackOutro(message);
    },
    spinner() {
      const handle = clackSpinner();
      return {
        message(text: string) {
          handle.message(text);
        },
        stop(finalMessage, code) {
          // clack maps failure/cancel to dedicated stop variants; 'warn' keeps
          // the neutral stop and lets the message text carry the caution.
          if (code === 'fail') {
            handle.error(finalMessage);
          } else {
            handle.stop(finalMessage);
          }
        },
      };
    },
  };
}

/** Run `fn`, translating a user abort into the provided cancellation outcome. */
export async function withCancellation<T>(fn: () => Promise<T>, onCancel: () => T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof CliCancelled) {
      clackCancel(error.message);
      return onCancel();
    }
    throw error;
  }
}
