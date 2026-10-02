/**
 * Unit tests for the CLI UI toolkit (src/cli/ui/*): prompt-mode gating,
 * suggestion engine, theme switches, panels, and the QR_TEMPLATES /
 * PAYMENT_OPTIONS constants. Pure functions only — no terminal I/O.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_OPTIONS, QR_TEMPLATES, QR_TEMPLATE_NAMES } from '../constants.js';
import { renderBanner } from '../cli/ui/banner.js';
import { resolvePromptMode } from '../cli/ui/mode.js';
import { formatKeyValueSummary, renderNextSteps } from '../cli/ui/panels.js';
import { CliCancelled, createClackIO } from '../cli/ui/prompts.js';
import { levenshtein, suggest, suggestMessage } from '../cli/ui/suggest.js';
import { createStyler, isColorEnabled, lazyPalette, setColorOverride } from '../cli/ui/theme.js';

afterEach(() => {
  vi.unstubAllEnvs();
  setColorOverride(undefined);
});

describe('resolvePromptMode', () => {
  const tty = { stdin: { isTTY: true, readable: true }, stdout: { isTTY: true } };
  const piped = { stdin: { isTTY: false, readable: true }, stdout: { isTTY: false } };

  it('returns clack only when both stdin and stdout are TTYs', () => {
    expect(resolvePromptMode({}, {}, tty)).toBe('clack');
    expect(resolvePromptMode({}, {}, piped)).toBe('readline');
    expect(resolvePromptMode({}, {}, { stdin: { isTTY: true, readable: true }, stdout: { isTTY: false } })).toBe('readline');
  });

  it('returns none for machine contexts regardless of TTY', () => {
    expect(resolvePromptMode({ json: true }, {}, tty)).toBe('none');
    expect(resolvePromptMode({ force: true }, {}, tty)).toBe('none');
    expect(resolvePromptMode({ nonInteractive: true }, {}, tty)).toBe('none');
    expect(resolvePromptMode({}, { CI: 'true' }, tty)).toBe('none');
    expect(resolvePromptMode({}, { CI: '1' }, tty)).toBe('none');
  });

  it('honors the PAYWAY_UI=classic kill-switch over everything', () => {
    expect(resolvePromptMode({}, { PAYWAY_UI: 'classic' }, tty)).toBe('none');
    expect(resolvePromptMode({ json: true }, { PAYWAY_UI: 'classic' }, tty)).toBe('none');
  });

  it('none wins over clack when both machine flags and a TTY are present', () => {
    expect(resolvePromptMode({ json: true, force: false }, {}, tty)).toBe('none');
  });
});

describe('suggest', () => {
  it('computes levenshtein distance (case-sensitive; callers normalize)', () => {
    expect(levenshtein('USD', 'USD')).toBe(0);
    expect(levenshtein('usd', 'usd')).toBe(0);
    expect(levenshtein('usd', 'USD')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('returns exact case-insensitive matches directly', () => {
    expect(suggest('usd', ['USD', 'KHR'])).toBe('USD');
    expect(suggest('ABAPAY_KHQR', ['abapay_khqr', 'cards'])).toBe('abapay_khqr');
  });

  it('suggests the closest candidate within the edit budget', () => {
    expect(suggest('temple2', ['template1', 'template2', 'template3_color'])).toBe('template2');
    expect(suggest('KHRR', ['USD', 'KHR'], 1)).toBe('KHR');
  });

  it('returns undefined when nothing is close', () => {
    expect(suggest('xyzzy', ['USD', 'KHR'])).toBeUndefined();
  });

  it('formats a did-you-mean message', () => {
    expect(suggestMessage('US', ['USD', 'KHR'], 'currency')).toBe("Unknown currency 'US'. Did you mean 'USD'?");
    expect(suggestMessage('zzzzz', ['USD', 'KHR'], 'currency')).toBeUndefined();
  });
});

describe('theme', () => {
  it('disables color for non-TTY streams', () => {
    expect(isColorEnabled({ isTTY: false }, {})).toBe(false);
    expect(isColorEnabled({ isTTY: true }, {})).toBe(true);
  });

  it('respects NO_COLOR and FORCE_COLOR', () => {
    expect(isColorEnabled({ isTTY: true }, { NO_COLOR: '1' })).toBe(false);
    expect(isColorEnabled({ isTTY: false }, { FORCE_COLOR: '1' })).toBe(true);
  });

  it('the runtime override wins over env and TTY', () => {
    setColorOverride(false);
    expect(isColorEnabled({ isTTY: true }, { FORCE_COLOR: '1' })).toBe(false);
    setColorOverride(true);
    expect(isColorEnabled({ isTTY: false }, { NO_COLOR: '1' })).toBe(true);
  });

  it('createStyler(false) is an identity palette', () => {
    const plain = createStyler(false);
    expect(plain.bold('x')).toBe('x');
    expect(plain.dim('y')).toBe('y');
  });

  it('createStyler(true) wraps with ANSI codes', () => {
    const styled = createStyler(true);
    expect(styled.red('x')).toBe('\x1b[31mx\x1b[0m');
  });

  it('lazyPalette re-resolves the switches at every call, so a post-import override still applies', () => {
    const lazy = lazyPalette();
    setColorOverride(false);
    expect(lazy.bold('x')).toBe('x');
    expect(lazy.cyan('x')).toBe('x');
    setColorOverride(true);
    expect(lazy.bold('x')).toBe('\x1b[1mx\x1b[0m');
    expect(lazy.cyan('x')).toBe('\x1b[36mx\x1b[0m');
  });
});

describe('panels', () => {
  it('aligns key/value rows on the longest label', () => {
    const lines = formatKeyValueSummary([
      { label: 'Amount', value: '5.00 USD' },
      { label: 'Transaction ID', value: 'qr1a2b3c' },
    ]);
    expect(lines[0]).toBe('  Amount:         5.00 USD');
    expect(lines[1]).toBe('  Transaction ID: qr1a2b3c');
    expect(lines[0].indexOf('5.00')).toBe(lines[1].indexOf('qr1a2b3c'));
  });

  it('renders next steps with a header and bullets, or nothing', () => {
    expect(renderNextSteps([])).toEqual([]);
    const lines = renderNextSteps(['payway-sdk check-transaction -t x']);
    expect(lines).toEqual(['  Next steps:', '    · payway-sdk check-transaction -t x']);
  });
});

describe('banner', () => {
  it('renders a versioned banner without color when disabled', () => {
    const lines = renderBanner('9.9.9', createStyler(false));
    expect(lines.some((line) => line.includes('ABA PayWay SDK'))).toBe(true);
    expect(lines.some((line) => line.includes('v9.9.9'))).toBe(true);
  });
});

describe('constants additions', () => {
  it('QR_TEMPLATES lists the seven sandbox-verified templates exactly once each', () => {
    expect(QR_TEMPLATES).toHaveLength(7);
    const values = QR_TEMPLATES.map((template) => template.value);
    expect(new Set(values).size).toBe(7);
    expect(values).toContain('template2');
    expect(QR_TEMPLATE_NAMES).toEqual(values);
  });

  it('PAYMENT_OPTIONS covers the documented purchase options', () => {
    expect(PAYMENT_OPTIONS).toContain('abapay_khqr');
    expect(PAYMENT_OPTIONS).toContain('abapay_khqr_deeplink');
    expect(PAYMENT_OPTIONS).toContain('cards');
  });
});

describe('prompts module surface', () => {
  it('exposes CliCancelled and a clack-backed IO factory', () => {
    expect(new CliCancelled().name).toBe('CliCancelled');
    const io = createClackIO();
    expect(io.mode).toBe('clack');
    expect(typeof io.text).toBe('function');
    expect(typeof io.select).toBe('function');
    expect(typeof io.confirm).toBe('function');
    expect(typeof io.spinner).toBe('function');
  });
});
